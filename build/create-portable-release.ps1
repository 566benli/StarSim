# Genesis Error Portable Release Packager
# Shareable zip: runnable desktop app + essential source.
# Omits node_modules, .git, and the duplicate win-unpacked Electron tree.

param(
    [switch]$FailIfMissing
)

$ErrorActionPreference = "Stop"

Write-Host "Preparing Genesis Error portable release package..." -ForegroundColor Cyan

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$distWeb = Join-Path $projectRoot "dist"
$distElectron = Join-Path $projectRoot "dist-electron"
$exePath = Join-Path $distElectron "GenesisError.exe"
$buildIdPath = Join-Path $distWeb "BUILD_ID.txt"

if (!(Test-Path (Join-Path $distWeb "index.html"))) {
    $msg = "Web build missing at dist/index.html. Run 'npm run build:all' first."
    if ($FailIfMissing) { throw $msg } else { Write-Host $msg -ForegroundColor Yellow; exit 1 }
}
if (!(Test-Path $exePath)) {
    $msg = "Desktop exe missing at dist-electron/GenesisError.exe. Run 'npm run build:all' first."
    if ($FailIfMissing) { throw $msg } else { Write-Host $msg -ForegroundColor Yellow; exit 1 }
}

$exeBytes = (Get-Item $exePath).Length
if ($exeBytes -lt 20MB) {
    $msg = "GenesisError.exe is only $([Math]::Round($exeBytes/1MB, 1)) MB. That is the placeholder launcher, not the real Electron app. Run 'npm run build:all' until the real exe is produced."
    if ($FailIfMissing) { throw $msg } else { Write-Host $msg -ForegroundColor Yellow; exit 1 }
}

$buildId = $null
if (Test-Path $buildIdPath) {
    $buildId = (Get-Content $buildIdPath -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($buildId)) {
    $buildId = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH-mm-ssZ")
}
$safeBuildId = ($buildId -replace "[:/\\\s]", "-")

$releaseRoot = Join-Path $projectRoot "releases"
$releaseName = "GenesisError-Portable-$safeBuildId"
$releaseDir = Join-Path $releaseRoot $releaseName
$zipPath = Join-Path $releaseRoot "$releaseName.zip"
$latestZipPath = Join-Path $releaseRoot "GenesisError-Portable-latest.zip"

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
if (Test-Path $releaseDir) { Remove-Item $releaseDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$appDir = Join-Path $releaseDir "app"
$webDir = Join-Path $releaseDir "web"
$sourceDir = Join-Path $releaseDir "source"
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
New-Item -ItemType Directory -Path $webDir -Force | Out-Null
New-Item -ItemType Directory -Path $sourceDir -Force | Out-Null

Write-Host "  Copying desktop app (skipping duplicate win-unpacked)..." -ForegroundColor Gray
Get-ChildItem $distElectron -Force | Where-Object {
    $_.Name -ne "win-unpacked" -and $_.Name -notlike "builder-*"
} | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $appDir $_.Name) -Recurse -Force
}

Write-Host "  Copying web build..." -ForegroundColor Gray
Copy-Item (Join-Path $distWeb "*") $webDir -Recurse -Force

$sourceItems = @(
    "src",
    "electron",
    "assets",
    "docs",
    "build",
    "scripts",
    "package.json",
    "package-lock.json",
    "webpack.config.js"
)
Write-Host "  Copying essential source..." -ForegroundColor Gray
foreach ($item in $sourceItems) {
    $from = Join-Path $projectRoot $item
    if (!(Test-Path $from)) {
        Write-Host "    skip missing $item" -ForegroundColor Yellow
        continue
    }
    Copy-Item $from (Join-Path $sourceDir $item) -Recurse -Force
}

$launcherPath = Join-Path $releaseDir "Start-GenesisError.bat"
@'
@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "app\GenesisError.exe" (
  start "" "app\GenesisError.exe"
) else (
  echo Genesis Error executable not found in app\GenesisError.exe
  pause
)
'@ | Out-File -FilePath $launcherPath -Encoding ascii -Force

$readmePath = Join-Path $releaseDir "START-HERE.txt"
@"
Genesis Error Portable Package (创世错误)
=========================================

Build ID: $buildId

Run the app
-----------
1. Unzip this package anywhere on Windows.
2. Double-click Start-GenesisError.bat
   or run app\GenesisError.exe directly.
   No install step is required.

What is inside
--------------
- app\     Desktop app. This is the Electron runtime plus GenesisError.exe.
- web\     The same web build that is packed into the desktop app.
- source\  Essential project source (about 2 MB), enough to read and rebuild:
           src\       simulation engine, UI, renderer, data
           electron\  desktop shell
           assets\    icons and creature packs
           docs\      project notes
           build\     build and sync scripts
           scripts\   terminal checks
           package.json, package-lock.json, webpack.config.js

What was left out on purpose
----------------------------
- node_modules\     about 900 MB of dependencies
- .git\             repository history
- dist-electron\win-unpacked\   a duplicate of app\
- server secrets, screenshots, and old release archives

Rebuild from source
-------------------
Install Node.js, open a terminal in source\, then:

  npm install
  npm run build:all

npm install downloads dependencies again. That step is what makes a full
development copy large. This zip stays small enough to send.
"@ | Out-File -FilePath $readmePath -Encoding utf8 -Force

$manifest = [ordered]@{
    product = "Genesis Error"
    build_id = $buildId
    created_utc = [DateTime]::UtcNow.ToString("o")
    source = @{
        web = "dist"
        desktop = "dist-electron"
        code = "source"
    }
    omitted = @(
        "node_modules",
        ".git",
        "dist-electron/win-unpacked",
        "releases"
    )
    files = @{
        launcher = "Start-GenesisError.bat"
        readme = "START-HERE.txt"
        desktop_exe = "app/GenesisError.exe"
        web_index = "web/index.html"
        essential_source = "source/"
    }
}
($manifest | ConvertTo-Json -Depth 5) | Out-File -FilePath (Join-Path $releaseDir "release-manifest.json") -Encoding utf8 -Force

Write-Host "  Compressing package..." -ForegroundColor Gray

$compressed = $false
$compressError = $null
if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
    & tar.exe -a -c -f $zipPath -C $releaseRoot $releaseName
    if ($LASTEXITCODE -eq 0 -and (Test-Path $zipPath)) {
        $compressed = $true
    } else {
        $compressError = "tar.exe exited with code $LASTEXITCODE"
    }
}

if (-not $compressed) {
    try {
        # Fallback keeps files at the zip root (no extra folder name).
        Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force
        $compressed = $true
    } catch {
        $compressError = $_.Exception.Message
    }
}

if (-not $compressed) {
    throw "Unable to create portable zip archive. Last error: $compressError"
}

Copy-Item $zipPath $latestZipPath -Force

# Keep the zip only. Unpacked release folders were about 1 GB each and
# are what made the project too large to send.
Remove-Item $releaseDir -Recurse -Force

$zipMb = [Math]::Round((Get-Item $latestZipPath).Length / 1MB, 1)
Write-Host "Portable release ready:" -ForegroundColor Green
Write-Host "  Zip:    $zipPath" -ForegroundColor White
Write-Host "  Latest: $latestZipPath" -ForegroundColor White
Write-Host "  Size:   $zipMb MB" -ForegroundColor White
