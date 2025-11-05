# Roc Nightly Installer for Windows
# Downloads, verifies, extracts, and (optionally) adds Roc to the user PATH.
# Based on your 2025-10-31 nightly.

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ---- Configuration ----
$VersionDate = "2025-10-31"
$BuildId     = "8553832"
$BaseUrl     = "https://github.com/roc-lang/nightlies/releases/download/nightly-2025-October-31-$BuildId"

# Known SHA256 checksums for Windows
$Sha_Windows_x86_64 = "1d37d0262ec272cca1c7a32acb23b7c02115cc94a11e721bf50ddb352943f332"
$Sha_Windows_arm64  = "6c148e8e362c9a594446145481f872d5777a02d6c47d3320f92377be5b9a60d6"

# ---- Detect architecture ----
$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch.ToLower()) {
    "amd64" { $ArchName = "x86_64" }
    "arm64" { $ArchName = "arm64" }
    default { throw "Unsupported architecture: $arch" }
}

$Platform = "windows"

# ---- Pick the right file ----
# You gave us the exact filenames, so we can just branch:
if ($ArchName -eq "x86_64") {
    $File = "roc_nightly-windows_x86_64-$VersionDate-$BuildId.zip"
    $ExpectedSha = $Sha_Windows_x86_64
} elseif ($ArchName -eq "arm64") {
    $File = "roc_nightly-windows_arm64-$VersionDate-$BuildId.zip"
    $ExpectedSha = $Sha_Windows_arm64
} else {
    throw "No Windows artifact for architecture $ArchName"
}

$Url = "$BaseUrl/$File"

Write-Host "➡️  Step 1: Downloading Roc for $Platform ($ArchName)..."
$downloadPath = Join-Path $PWD $File

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $Url -OutFile $downloadPath -UseBasicParsing
Write-Host "✅ Download complete: $downloadPath"
Write-Host ""

# ---- Verify SHA256 ----
Write-Host "🔒 Step 2: Checking file integrity..."
$actualHash = (Get-FileHash -Algorithm SHA256 -Path $downloadPath).Hash.ToLower()
if ($actualHash -ne $ExpectedSha.ToLower()) {
    Write-Host "❌ Checksum mismatch!"
    Write-Host "Expected: $ExpectedSha"
    Write-Host "Actual:   $actualHash"
    throw "The file might be corrupted. Aborting."
} else {
    Write-Host "✅ File verified successfully!"
    Write-Host ""
}

# ---- Extract ----
Write-Host "📦 Step 3: Extracting files..."

$installDirName = "roc_nightly-$Platform`_$ArchName-$VersionDate-$BuildId"
$installDir     = Join-Path $PWD $installDirName

Expand-Archive -Path $downloadPath -DestinationPath $PWD -Force

Write-Host "✅ Roc was extracted to: $installDir"
Write-Host ""

Write-Host @"
⭐ Step 4: Making Roc easy to run

Right now, Roc is installed in:
  $installDir

You can add that folder to your Windows user PATH so you can run `roc`
from any new PowerShell or CMD window.
"@

$folderToAdd = $installDir

# ---- Ask to add to PATH ----
$answer = Read-Host "Would you like me to add Roc to your *user* PATH automatically? [y/N]"
if ($answer -match '^(y|Y)$') {
    $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")

    $pathParts = @()
    if ($currentPath) {
        $pathParts = $currentPath.Split(";") | Where-Object { $_ -ne "" }
    }

    if ($pathParts -contains $folderToAdd) {
        Write-Host "ℹ️  PATH already contains $folderToAdd"
    } else {
        $newPath = if ($currentPath) { "$currentPath;$folderToAdd" } else { $folderToAdd }
        [System.Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "✅ Added Roc to your user PATH."
        Write-Host "   (Open a new terminal for it to take effect.)"
    }

    Write-Host ""
    Write-Host "🎉 All done!"
    Write-Host "Open a new PowerShell and run:  roc version"
} else {
    Write-Host ""
    Write-Host "ℹ️  No problem!"
    Write-Host "To run Roc in *this* PowerShell session, run:"
    Write-Host ""
    Write-Host "  `$env:PATH += `";$folderToAdd`""
    Write-Host ""
    Write-Host "Then:"
    Write-Host "  roc version"
    Write-Host ""
    Write-Host "🎉 All done!"
}