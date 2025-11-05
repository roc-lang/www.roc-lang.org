#!/usr/bin/env sh
# Roc Nightly Installer
# Works on Linux and macOS, on x86_64 and ARM64 architectures.
# This script downloads, verifies, and sets up Roc for your system.

set -eu

# ---- Configuration ----
VERSION_DATE="2025-10-31"
BUILD_ID="8553832"
BASE_URL="https://github.com/roc-lang/nightlies/releases/download/nightly-2025-October-31-${BUILD_ID}"

# Known SHA256 checksums for file verification
SHA_LINUX_ARM64="287421c391b3ff9d7dc01712fab4d07976298bd2d2acd403464ee5e18f0dcc99"
SHA_LINUX_X86_64="4433a0b715405c91ad4d09d6b5f5f5c2ea60debd09207ac6f29f2ada6bf5380b"
SHA_MACOS_ARM64="7a9eea34defcae01e1f212e17e45ae05354bf32c97d01e40ee50aab2d6d02bc6"
SHA_MACOS_X86_64="72cbb990835fe58a1f7b64f28fc7a96c5b93d5fa9244f5fa32d7adf6ec141d5d"

# ---- Detect your operating system and CPU type ----
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
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
FILE="roc_nightly-${PLATFORM}_${ARCH_NAME}-${VERSION_DATE}-${BUILD_ID}.tar.gz"
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
DIR_NAME="roc_nightly-${PLATFORM}_${ARCH_NAME}-${VERSION_DATE}-${BUILD_ID}"
INSTALL_DIR="$PWD/$DIR_NAME"
echo "✅ Roc was extracted to: $INSTALL_DIR"

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
read -r -p "Would you like me to add Roc to your PATH automatically? [y/N] " ANSWER
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