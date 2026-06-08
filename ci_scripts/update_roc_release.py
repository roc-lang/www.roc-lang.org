#!/usr/bin/env python3
"""Update the pinned Roc nightly release in the install scripts.

Fetches the latest release from roc-lang/nightlies and rewrites the hardcoded
version date, build id, base URL and SHA256 checksums in:
  - website/public/install_roc.sh
  - website/public/install_roc.ps1

The script edits only the specific variable assignments, so unrelated changes to
the installers are preserved. It exits 0 whether or not anything changed; the CI
workflow inspects `git status` to decide if a commit is needed.
"""

import json
import os
import re
import sys
import urllib.request

RELEASES_API = "https://api.github.com/repos/roc-lang/nightlies/releases/latest"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SH_PATH = os.path.join(REPO_ROOT, "website", "public", "install_roc.sh")
PS1_PATH = os.path.join(REPO_ROOT, "website", "public", "install_roc.ps1")

# Maps the "<platform>_<arch>" found in an asset name to its checksum.
# These keys are the strings that appear in the nightly asset filenames.
ASSET_KEYS = (
    "linux_arm64",
    "linux_x86_64",
    "macos_apple_silicon",
    "macos_x86_64",
    "windows_arm64",
    "windows_x86_64",
)

# Assets the nightly build does not currently produce. We tolerate their absence
# instead of failing the update, and the installers tell users that these targets
# are temporarily unavailable. Remove a key here once its build is restored.
TEMPORARILY_UNAVAILABLE = (
    "windows_arm64",
)


def fetch_latest_release():
    req = urllib.request.Request(
        RELEASES_API,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "roc-lang-installer-updater",
        },
    )
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def parse_release(release):
    """Extract the version date, build id, tag and per-asset checksums.

    The asset names look like:
        roc_nightly-linux_x86_64-2026-05-30-b1a65b6.tar.gz
    which gives us the version date (2026-05-30) and build id (b1a65b6) that the
    installers embed, alongside the sha256 digest the API reports per asset.
    """
    tag = release["tag_name"]

    version_date = None
    build_id = None
    shas = {}

    asset_re = re.compile(
        r"^roc_nightly-(?P<key>[a-z0-9_]+)-"
        r"(?P<date>\d{4}-\d{2}-\d{2})-(?P<build>[0-9a-f]+)\.(?:tar\.gz|zip)$"
    )

    for asset in release["assets"]:
        m = asset_re.match(asset["name"])
        if not m:
            continue
        key = m.group("key")
        if key not in ASSET_KEYS:
            continue

        digest = asset.get("digest", "")
        if not digest.startswith("sha256:"):
            sys.exit(f"Asset {asset['name']} has no sha256 digest: {digest!r}")
        shas[key] = digest[len("sha256:"):]

        # All roc_nightly assets share the same date/build; capture once.
        if version_date is None:
            version_date = m.group("date")
            build_id = m.group("build")

    missing = [
        k for k in ASSET_KEYS if k not in shas and k not in TEMPORARILY_UNAVAILABLE
    ]
    if missing:
        sys.exit(f"Release {tag} is missing assets for: {', '.join(missing)}")

    return {
        "tag": tag,
        "version_date": version_date,
        "build_id": build_id,
        "shas": shas,
    }


def replace_assignment(text, pattern, replacement, path):
    new_text, count = re.subn(pattern, replacement, text, count=1)
    if count != 1:
        sys.exit(f"Could not find expected line matching /{pattern}/ in {path}")
    return new_text


def update_sh(info):
    with open(SH_PATH, "r") as f:
        text = f.read()

    text = replace_assignment(
        text, r'VERSION_DATE="[^"]*"', f'VERSION_DATE="{info["version_date"]}"', SH_PATH
    )
    text = replace_assignment(
        text, r'BUILD_ID="[^"]*"', f'BUILD_ID="{info["build_id"]}"', SH_PATH
    )
    text = replace_assignment(
        text,
        r'BASE_URL="https://github\.com/roc-lang/nightlies/releases/download/[^"]*"',
        f'BASE_URL="https://github.com/roc-lang/nightlies/releases/download/{info["tag"]}"',
        SH_PATH,
    )
    text = replace_assignment(
        text, r'SHA_LINUX_ARM64="[^"]*"', f'SHA_LINUX_ARM64="{info["shas"]["linux_arm64"]}"', SH_PATH
    )
    text = replace_assignment(
        text, r'SHA_LINUX_X86_64="[^"]*"', f'SHA_LINUX_X86_64="{info["shas"]["linux_x86_64"]}"', SH_PATH
    )
    text = replace_assignment(
        text, r'SHA_MACOS_ARM64="[^"]*"', f'SHA_MACOS_ARM64="{info["shas"]["macos_apple_silicon"]}"', SH_PATH
    )
    text = replace_assignment(
        text, r'SHA_MACOS_X86_64="[^"]*"', f'SHA_MACOS_X86_64="{info["shas"]["macos_x86_64"]}"', SH_PATH
    )

    with open(SH_PATH, "w") as f:
        f.write(text)


def update_ps1(info):
    with open(PS1_PATH, "r") as f:
        text = f.read()

    text = replace_assignment(
        text, r'\$VersionDate = "[^"]*"', f'$VersionDate = "{info["version_date"]}"', PS1_PATH
    )
    text = replace_assignment(
        text, r'\$BuildId     = "[^"]*"', f'$BuildId     = "{info["build_id"]}"', PS1_PATH
    )
    text = replace_assignment(
        text,
        r'\$BaseUrl     = "https://github\.com/roc-lang/nightlies/releases/download/[^"]*"',
        f'$BaseUrl     = "https://github.com/roc-lang/nightlies/releases/download/{info["tag"]}"',
        PS1_PATH,
    )
    text = replace_assignment(
        text, r'\$Sha_Windows_x86_64 = "[^"]*"', f'$Sha_Windows_x86_64 = "{info["shas"]["windows_x86_64"]}"', PS1_PATH
    )
    # The arm64 build may be temporarily unavailable; only refresh its checksum
    # when the release actually ships that asset.
    if "windows_arm64" in info["shas"]:
        text = replace_assignment(
            text, r'\$Sha_Windows_arm64  = "[^"]*"', f'$Sha_Windows_arm64  = "{info["shas"]["windows_arm64"]}"', PS1_PATH
        )

    with open(PS1_PATH, "w") as f:
        f.write(text)


def main():
    release = fetch_latest_release()
    info = parse_release(release)
    print(f"Latest nightly: {info['tag']}")
    print(f"  version date: {info['version_date']}")
    print(f"  build id:     {info['build_id']}")
    unavailable = [k for k in TEMPORARILY_UNAVAILABLE if k not in info["shas"]]
    if unavailable:
        print(f"  temporarily unavailable (skipped): {', '.join(unavailable)}")
    update_sh(info)
    update_ps1(info)
    print("Updated install_roc.sh and install_roc.ps1")


if __name__ == "__main__":
    main()
