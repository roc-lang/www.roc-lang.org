#!/usr/bin/env sh
# Roc Installer
# Works on Linux and macOS, on x86_64 and ARM64 architectures.
# This script downloads, verifies, and sets up Roc for your system.

set -eu

# ---- Configuration ----
VERSION="0.1.0_RC1"
BASE_URL="https://github.com/roc-lang/roc/releases/download/${VERSION}"

# Known SHA256 checksums for file verification
SHA_LINUX_ARM64="b3e0a9dbc922f3802702a55a1869ad2c2e4f4dc935d8a9d1b26c3612668dff43"
SHA_LINUX_X86_64="043c426ea85dcdbd427951eaed246f0c10c171d988f2598782233a6dae43379d"
SHA_MACOS_ARM64="e8228040c701e130254c72539a1d0f1b150d78c00058747edb0edae51ba5dbc8"
SHA_MACOS_X86_64="ea9b38b5e4708cbe42c92077e816f5241299da1aa3f4c46e8cb933b1aa2af858"

# ---- Detect your operating system and CPU type ----
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*|Windows*)
        echo "It looks like you're on Windows. This script doesn't support Windows." >&2
        echo "Please follow the Windows install steps at https://roc-lang.org/install/windows" >&2
        exit 1
        ;;
    *) echo "Sorry, your operating system ($OS) is not supported yet." >&2; exit 1 ;;
esac

case "$ARCH" in
    x86_64)   ARCH_NAME="x86_64" ;;
    arm64|aarch64)
        if [ "$PLATFORM" = "macos" ]; then
            ARCH_NAME="apple_silicon"
        else
            ARCH_NAME="arm64"
        fi
        ;;
    *) echo "Sorry, your CPU architecture ($ARCH) is not supported yet." >&2; exit 1 ;;
esac

# ---- Figure out which file to download ----
FILE="roc-${PLATFORM}_${ARCH_NAME}-${VERSION}.tar.gz"
URL="${BASE_URL}/${FILE}"

# ---- Choose the right SHA256 value ----
case "${PLATFORM}_${ARCH_NAME}" in
    linux_arm64) EXPECTED_SHA="$SHA_LINUX_ARM64" ;;
    linux_x86_64) EXPECTED_SHA="$SHA_LINUX_X86_64" ;;
    macos_apple_silicon) EXPECTED_SHA="$SHA_MACOS_ARM64" ;;
    macos_x86_64) EXPECTED_SHA="$SHA_MACOS_X86_64" ;;
    *) echo "No checksum available for this combination." >&2; exit 1 ;;
esac

echo "➡️  Step 1: Downloading Roc for ${PLATFORM} (${ARCH_NAME})..."
curl --proto '=https' --tlsv1.2 -fL -O "$URL"
echo "✅ Download complete: $FILE"
echo

# ---- Verify SHA256 checksum ----
echo "🔒 Step 2: Checking file integrity..."
if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA=$(sha256sum "$FILE" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA=$(shasum -a 256 "$FILE" | awk '{print $1}')
else
    echo "⚠️  No checksum tool found (sha256sum or shasum). Skipping verification."
    ACTUAL_SHA="$EXPECTED_SHA"
fi

if [ "$EXPECTED_SHA" = "$ACTUAL_SHA" ]; then
    echo "✅ File verified successfully!"
    echo
else
    echo "❌ Checksum mismatch!"
    echo "Expected: $EXPECTED_SHA"
    echo "Actual:   $ACTUAL_SHA"
    echo "The file might be corrupted. Aborting for safety."
    exit 1
fi

# ---- Extract the archive ----
echo "📦 Step 3: Extracting files..."
tar -xf "$FILE"
DIR_NAME="roc-${PLATFORM}_${ARCH_NAME}-${VERSION}"
EXTRACT_DIR="$PWD/$DIR_NAME"
echo "✅ Roc was extracted to: $EXTRACT_DIR"

if [ -n "${ROC_INSTALL_DIR:-}" ]; then
    mkdir -p "$ROC_INSTALL_DIR"
    cp "$EXTRACT_DIR/roc" "$ROC_INSTALL_DIR"
    echo "✅ Roc executable was copied to: $ROC_INSTALL_DIR"
    INSTALL_DIR=$(realpath "$ROC_INSTALL_DIR")
else
    INSTALL_DIR="$EXTRACT_DIR"
fi

# ---- Explain PATH in beginner-friendly terms ----
cat <<EOF

⭐ Step 4: Making Roc easy to run

Right now, Roc is installed in:
  $INSTALL_DIR

If you try to run 'roc' from another folder, your computer won't find it
unless we tell it where to look. This is what the PATH setting does —
it's a list of folders where your computer looks for commands.

EOF

# ---- Detect which shell config file to update ----
if [ -n "${SHELL:-}" ]; then
    case "$SHELL" in
        */bash) PROFILE="$HOME/.bashrc" ;;
        */zsh)  PROFILE="$HOME/.zshrc" ;;
        */fish) PROFILE="$HOME/.config/fish/config.fish" ;;
        *)      PROFILE="$HOME/.profile" ;;
    esac
else
    PROFILE="$HOME/.profile"
fi

# ---- Ask to add Roc to PATH ----
# Allow a non-interactive override (e.g. CI): ROC_ADD_TO_PATH=y or n.
ANSWER="${ROC_ADD_TO_PATH:-}"
if [ -z "$ANSWER" ]; then
    if { true </dev/tty; } 2>/dev/null; then
        # A terminal is available even when this script is piped (curl | sh),
        # so prompt by reading from the terminal. Never read from stdin: under
        # `curl | sh` stdin is the script itself, and consuming it corrupts parsing.
        printf 'Would you like me to add Roc to your PATH automatically? [y/N] '
        read -r ANSWER </dev/tty || ANSWER="n"
    else
        ANSWER="n"
    fi
fi
if [ "$ANSWER" = "y" ] || [ "$ANSWER" = "Y" ]; then
    # note: using printf here avoids a literal "\n" being written
    printf '\nexport PATH="$PATH:%s"\n' "$INSTALL_DIR" >> "$PROFILE"
    echo
    echo "✅ Added Roc to your PATH in $PROFILE"
    echo "   (This change will take effect next time you open a terminal.)"
    echo
    echo "🎉 All done!"
    echo
    echo "To test Roc, open a new terminal (or run 'source $PROFILE') and type:"
    echo
    echo "   roc version"
    echo
    echo "If you see a version number, everything is working!"
else
    echo
    echo "ℹ️  No problem! To run Roc in the current terminal, run:"
    echo
    echo "   export PATH=\"\$PATH:$INSTALL_DIR\""
    echo
    echo "Then you can test Roc by running:"
    echo
    echo "   roc version"
    echo
    echo "If you want this to be permanent, add that export line to your shell profile (e.g. $PROFILE)."
    echo
    echo "🎉 All done!"
fi
