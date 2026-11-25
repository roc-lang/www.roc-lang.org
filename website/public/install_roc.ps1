# Roc Installer for Windows
# Downloads, verifies, extracts, and (optionally) adds Roc to the user PATH.

$ErrorActionPreference = "Stop"

# ---- Configuration ----
$Version = "0.1.0_RC1"
$BaseUrl = "https://github.com/roc-lang/roc/releases/download/$Version"

# Known SHA256 checksum for Windows
# There is no Windows arm64 build in this release.
$Sha_Windows_x86_64 = "3a91205c33c1df1174808f39b64b2ca919d00147e2828710469f40ce7c206719"

# ---- Detect architecture ----
$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch.ToLower()) {
    "amd64" { $ArchName = "x86_64" }
    "arm64" { $ArchName = "arm64" }
    default { throw "Unsupported architecture: $arch" }
}

$Platform = "windows"

# ---- Pick the right file ----
if ($ArchName -eq "x86_64") {
    $File = "roc-windows_x86_64-$Version.zip"
    $ExpectedSha = $Sha_Windows_x86_64
} elseif ($ArchName -eq "arm64") {
    Write-Host "The Windows arm64 build of Roc is temporarily unavailable."
    Write-Host "Please check back later at https://roc-lang.org"
    exit 1
} else {
    throw "No Windows artifact for architecture $ArchName"
}

$Url = "$BaseUrl/$File"

Write-Host "Step 1: Downloading Roc for $Platform ($ArchName)..."
$downloadPath = Join-Path $PWD $File

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $Url -OutFile $downloadPath -UseBasicParsing
Write-Host "Download complete: $downloadPath"
Write-Host ""

# ---- Verify SHA256 ----
Write-Host "Step 2: Checking file integrity..."
$actualHash = (Get-FileHash -Algorithm SHA256 -Path $downloadPath).Hash.ToLower()
if ($actualHash -ne $ExpectedSha.ToLower()) {
    Write-Host "Checksum mismatch!"
    Write-Host "Expected: $ExpectedSha"
    Write-Host "Actual:   $actualHash"
    throw "The file might be corrupted. Aborting."
} else {
    Write-Host "File verified successfully."
    Write-Host ""
}

# ---- Extract ----
Write-Host "Step 3: Extracting files..."

$extractDirName = "roc-$Platform`_$ArchName-$Version"
$extractDir     = Join-Path $PWD $extractDirName

Expand-Archive -Path $downloadPath -DestinationPath $PWD -Force

Write-Host "Roc was extracted to: $extractDir"

if ($env:ROC_INSTALL_DIR) {
    $targetDir = New-Item -ItemType Directory -Path $env:ROC_INSTALL_DIR -Force
    $rocExePath = Join-Path $extractDir "roc.exe"
    Copy-Item -Path $rocExePath -Destination $env:ROC_INSTALL_DIR -Force
    Write-Host "Roc executable was copied to: $($env:ROC_INSTALL_DIR)"
    $installDir = $targetDir.FullName
}
else {
    $installDir = $extractDir
}

Write-Host ""

Write-Host @"
Step 4: Making Roc easy to run

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
        Write-Host "PATH already contains $folderToAdd"
    } else {
        $newPath = if ($currentPath) { "$currentPath;$folderToAdd" } else { $folderToAdd }
        [System.Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "Added Roc to your user PATH."
        Write-Host "Open a new terminal for it to take effect."
    }

    Write-Host ""
    Write-Host "All done."
    Write-Host "Open a new PowerShell and run:  roc version"
} else {
    Write-Host ""
    Write-Host "No problem."
    Write-Host "To run Roc in this PowerShell session, run:"
    Write-Host ""
    Write-Host "  `$env:PATH += `";$folderToAdd`""
    Write-Host ""
    Write-Host "Then:"
    Write-Host "  roc version"
    Write-Host ""
    Write-Host "All done."
}
