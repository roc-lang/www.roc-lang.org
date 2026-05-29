# Roc Nightly Installer for Windows
# Downloads, verifies, extracts, and (optionally) adds Roc to the user PATH.
# Based on your 2026-04-10 nightly.

$ErrorActionPreference = "Stop"

# ---- Configuration ----
$VersionDate = "2026-05-29"
$BuildId     = "597be17"
$BaseUrl     = "https://github.com/roc-lang/nightlies/releases/download/nightly-2026-May-29-$BuildId"

# Known SHA256 checksums for Windows
$Sha_Windows_x86_64 = "9cca1303c602dbc927788aa72ed7e8ad2f438420fba35e3c9a1498a18aca6e2c"
$Sha_Windows_arm64  = "ceb332faed0f9e32c1470aff1ee3fd4f546790d87b93abcf3e1e25bcba18c8eb"

# ---- Warn if this installer is stale ----
# The release above is hardcoded into this script. If it is more than two weeks
# old, a newer Roc release is probably available and the user should grab the
# latest installer instead of installing an outdated build.
# Set ROC_CONTINUE_IF_STALE=y to skip this check (e.g. in CI).
$releaseDate = [DateTime]::ParseExact($VersionDate, "yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)
$ageDays = [int]((Get-Date) - $releaseDate).TotalDays
if ($ageDays -gt 14) {
    Write-Host "⚠️  This installer is hardcoded to the Roc release from $VersionDate, which is $ageDays days old."
    Write-Host "   A newer release is probably available."
    Write-Host "   We recommend downloading the latest installer:"
    Write-Host "       https://roc-lang.org/install_roc.ps1"
    Write-Host ""
    $staleAnswer = $env:ROC_CONTINUE_IF_STALE
    if ([string]::IsNullOrEmpty($staleAnswer)) {
        $staleAnswer = Read-Host "Continue with this older version anyway? [y/N]"
    }
    if ($staleAnswer -notmatch '^(y|Y)$') {
        throw "Aborting. Please download the latest installer from https://roc-lang.org/install_roc.ps1"
    }
}

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
    $File = "roc_nightly-windows_x86_64-$VersionDate-$BuildId.zip"
    $ExpectedSha = $Sha_Windows_x86_64
} elseif ($ArchName -eq "arm64") {
    $File = "roc_nightly-windows_arm64-$VersionDate-$BuildId.zip"
    $ExpectedSha = $Sha_Windows_arm64
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

$installDirName = "roc_nightly-$Platform`_$ArchName-$VersionDate-$BuildId"
$installDir     = Join-Path $PWD $installDirName

Expand-Archive -Path $downloadPath -DestinationPath $PWD -Force

Write-Host "Roc was extracted to: $installDir"
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
