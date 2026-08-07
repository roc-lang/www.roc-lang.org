#!/usr/bin/env python3
"""Download, verify, and install a pinned Roc nightly on Linux, macOS, or Windows."""

import ctypes
import hashlib
import hmac
import os
import platform
import shlex
import shutil
import ssl
import sys
import tarfile
import urllib.error
import urllib.request
import zipfile
from datetime import date
from pathlib import Path


# ---- Configuration (updated by ci_scripts/update_roc_release.py) ----
VERSION_DATE = "2026-08-06"
BUILD_ID = "61bbb59"
BASE_URL = "https://github.com/roc-lang/nightlies/releases/download/nightly-2026-08-06-61bbb59"

SHA_LINUX_ARM64 = "8b5a4f15a081e8c661cd30144964594cee2bfff1b0e212fdd51535180902ae41"
SHA_LINUX_X86_64 = "2238cc45ec668bdba995d0312ab6bdc7b12905f7246152b127c7e719b06171dc"
SHA_MACOS_ARM64 = "c052bb624ca19b16203701f27cb69f9d6ee80900a5aca0f5d285b776a722e169"
SHA_MACOS_X86_64 = "53136e2a6b8edb0d0b4965865fd5258c400c82113b1e35bb2a57adf3f59759f2"
SHA_WINDOWS_ARM64 = "0e80fee64f9480b2256541e9900389789db6492617dbfb79ee3f7b434a636c92"
SHA_WINDOWS_X86_64 = "4667b4ca051f9eef79dbc77f5f96b830ee1243f9d836f5bf9f17355b7df5e89d"

CHECKSUMS = {
    "linux_arm64": SHA_LINUX_ARM64,
    "linux_x86_64": SHA_LINUX_X86_64,
    "macos_apple_silicon": SHA_MACOS_ARM64,
    "macos_x86_64": SHA_MACOS_X86_64,
    "windows_arm64": SHA_WINDOWS_ARM64,
    "windows_x86_64": SHA_WINDOWS_X86_64,
}

INSTALLER_URL = "https://roc-lang.org/install_roc.py"
STALE_AFTER_DAYS = 14


class InstallerError(Exception):
    """A user-facing installation failure."""


def answer_is_yes(environment_variable, prompt):
    answer = os.environ.get(environment_variable, "").strip()
    if not answer:
        terminal = "CONIN$" if os.name == "nt" else "/dev/tty"
        try:
            with open(terminal, "r", encoding="utf-8", errors="replace") as tty:
                print(prompt, end="", flush=True)
                answer = tty.readline().strip()
        except OSError:
            answer = "n"
    return answer.lower() == "y"


def confirm_if_stale():
    release_date = date.fromisoformat(VERSION_DATE)
    age_days = (date.today() - release_date).days
    if age_days <= STALE_AFTER_DAYS:
        return

    print(
        f"Warning: this installer is pinned to the Roc release from {VERSION_DATE}, "
        f"which is {age_days} days old.",
        file=sys.stderr,
    )
    print("A newer release is probably available.", file=sys.stderr)
    print(f"Download the latest installer from {INSTALLER_URL}", file=sys.stderr)
    print(file=sys.stderr)

    if not answer_is_yes(
        "ROC_CONTINUE_IF_STALE",
        "Continue with this older version anyway? [y/N] ",
    ):
        raise InstallerError(
            f"Installation cancelled. Download the latest installer from {INSTALLER_URL}"
        )


def detect_target():
    system = platform.system().lower()
    machine = (platform.machine() or os.environ.get("PROCESSOR_ARCHITECTURE", "")).lower()

    if system == "linux":
        platform_name = "linux"
    elif system == "darwin":
        platform_name = "macos"
    elif system == "windows":
        platform_name = "windows"
    else:
        raise InstallerError(f"Operating system {platform.system()!r} is not supported yet.")

    if machine in ("x86_64", "amd64"):
        architecture = "x86_64"
    elif machine in ("arm64", "aarch64"):
        if platform_name == "macos":
            architecture = "apple_silicon"
        else:
            architecture = "arm64"
    else:
        raise InstallerError(f"CPU architecture {platform.machine()!r} is not supported yet.")

    if platform_name == "windows" and architecture == "arm64":
        raise InstallerError(
            "The Windows arm64 build of Roc is temporarily unavailable. "
            "Please check back later at https://roc-lang.org"
        )

    key = f"{platform_name}_{architecture}"
    extension = ".zip" if platform_name == "windows" else ".tar.gz"
    executable = "roc.exe" if platform_name == "windows" else "roc"
    return platform_name, architecture, key, extension, executable


def download(url, destination):
    temporary = destination.with_name(f"{destination.name}.part")
    request = urllib.request.Request(url, headers={"User-Agent": "roc-lang-installer"})
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2

    try:
        with urllib.request.urlopen(request, context=context) as response:
            with open(temporary, "wb") as output:
                shutil.copyfileobj(response, output)
        os.replace(temporary, destination)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_inside_directory(destination, target, description):
    destination = destination.resolve()
    target = target.resolve()
    try:
        common = os.path.commonpath((str(destination), str(target)))
    except ValueError as error:
        raise InstallerError(f"Unsafe {description} in release archive") from error
    if common != str(destination):
        raise InstallerError(f"Unsafe {description} in release archive")


def extract_tar(archive_path, destination):
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            member_path = destination / member.name
            require_inside_directory(destination, member_path, member.name)

            if member.issym():
                link_target = member_path.parent / member.linkname
                require_inside_directory(destination, link_target, member.name)
            elif member.islnk():
                link_target = destination / member.linkname
                require_inside_directory(destination, link_target, member.name)
            elif member.ischr() or member.isblk() or member.isfifo():
                raise InstallerError(f"Unsupported special file {member.name!r} in release archive")

        if sys.version_info >= (3, 12):
            archive.extractall(destination, filter="data")
        else:
            archive.extractall(destination)


def extract_zip(archive_path, destination):
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            require_inside_directory(destination, destination / member.filename, member.filename)
        archive.extractall(destination)


def extract(archive_path, destination, extension):
    if extension == ".zip":
        extract_zip(archive_path, destination)
    else:
        extract_tar(archive_path, destination)


def choose_install_directory(extract_directory, executable_name):
    executable = extract_directory / executable_name
    if not executable.is_file():
        raise InstallerError(f"The release did not contain {executable}")

    requested_directory = os.environ.get("ROC_INSTALL_DIR", "").strip()
    if not requested_directory:
        return extract_directory.resolve()

    install_directory = Path(
        os.path.expandvars(os.path.expanduser(requested_directory))
    ).resolve()
    install_directory.mkdir(parents=True, exist_ok=True)
    shutil.copy2(executable, install_directory / executable_name)
    print(f"Roc executable copied to: {install_directory}")
    return install_directory


def unix_profile():
    shell = Path(os.environ.get("SHELL", "")).name
    home = Path.home()
    if shell == "bash":
        return home / ".bashrc", shell
    if shell == "zsh":
        return home / ".zshrc", shell
    if shell == "fish":
        return home / ".config" / "fish" / "config.fish", shell
    return home / ".profile", shell


def add_to_unix_path(install_directory):
    profile_path, shell = unix_profile()
    quoted_directory = shlex.quote(str(install_directory))
    if shell == "fish":
        path_line = f"fish_add_path -- {quoted_directory}"
    else:
        path_line = f'export PATH="$PATH":{quoted_directory}'

    profile_path.parent.mkdir(parents=True, exist_ok=True)
    existing = ""
    try:
        existing = profile_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        pass

    if path_line not in existing.splitlines():
        with open(profile_path, "a", encoding="utf-8") as profile_file:
            if existing and not existing.endswith("\n"):
                profile_file.write("\n")
            profile_file.write(f"\n{path_line}\n")

    print(f"Added Roc to PATH in {profile_path}")
    print("This change will take effect when you open a new terminal.")
    return profile_path


def normalized_windows_path(path):
    return path.strip().strip('"').rstrip("\\/").casefold()


def add_to_windows_path(install_directory):
    import winreg

    folder = str(install_directory)
    access = winreg.KEY_READ | winreg.KEY_WRITE
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, "Environment", 0, access) as key:
        try:
            current_path, value_type = winreg.QueryValueEx(key, "Path")
        except FileNotFoundError:
            current_path = ""
            value_type = winreg.REG_EXPAND_SZ

        path_parts = [part for part in current_path.split(";") if part]
        normalized_folder = normalized_windows_path(folder)
        if not any(normalized_windows_path(part) == normalized_folder for part in path_parts):
            path_parts.append(folder)
            winreg.SetValueEx(key, "Path", 0, value_type, ";".join(path_parts))

    try:
        result = ctypes.c_ulong()
        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF,
            0x001A,
            0,
            ctypes.c_wchar_p("Environment"),
            0x0002,
            5000,
            ctypes.byref(result),
        )
    except (AttributeError, OSError):
        pass

    print("Added Roc to your Windows user PATH.")
    print("This change will take effect when you open a new terminal.")


def explain_manual_path(install_directory, platform_name):
    print("No problem. To use Roc in the current terminal, run:")
    print()
    if platform_name == "windows":
        print(f'  $env:PATH += ";{install_directory}"')
    else:
        print(f'  export PATH="$PATH":{shlex.quote(str(install_directory))}')
    print()
    print("Then run: roc version")


def install():
    confirm_if_stale()
    platform_name, architecture, key, extension, executable_name = detect_target()

    file_name = f"roc_nightly-{key}-{VERSION_DATE}-{BUILD_ID}{extension}"
    directory_name = f"roc_nightly-{key}-{VERSION_DATE}-{BUILD_ID}"
    archive_path = Path.cwd() / file_name
    extract_directory = Path.cwd() / directory_name
    expected_sha = CHECKSUMS[key]
    url = f"{BASE_URL}/{file_name}"

    print(f"Step 1: Downloading Roc for {platform_name} ({architecture})...")
    download(url, archive_path)
    print(f"Download complete: {archive_path}")
    print()

    print("Step 2: Checking file integrity...")
    actual_sha = sha256(archive_path)
    if not hmac.compare_digest(expected_sha.lower(), actual_sha.lower()):
        raise InstallerError(
            "Checksum mismatch. "
            f"Expected {expected_sha}, got {actual_sha}. "
            "The downloaded file may be corrupted."
        )
    print("File verified successfully.")
    print()

    print("Step 3: Extracting files...")
    extract(archive_path, Path.cwd(), extension)
    if not extract_directory.is_dir():
        raise InstallerError(f"Expected extracted directory {extract_directory} was not found")
    print(f"Roc extracted to: {extract_directory}")

    install_directory = choose_install_directory(extract_directory, executable_name)
    print()
    print("Step 4: Making Roc easy to run")
    print()
    print(f"Roc is installed in: {install_directory}")
    print("Adding this folder to PATH lets you run 'roc' from any directory.")
    print()

    if answer_is_yes(
        "ROC_ADD_TO_PATH",
        "Would you like me to add Roc to your PATH automatically? [y/N] ",
    ):
        if platform_name == "windows":
            add_to_windows_path(install_directory)
        else:
            profile_path = add_to_unix_path(install_directory)
            print(f"To update this terminal now, reload {profile_path}.")
        print("All done. Open a new terminal and run: roc version")
    else:
        explain_manual_path(install_directory, platform_name)
        print("All done.")


def main():
    try:
        install()
    except (
        InstallerError,
        OSError,
        tarfile.TarError,
        urllib.error.URLError,
        zipfile.BadZipFile,
    ) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
