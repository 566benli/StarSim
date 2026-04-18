# Genesis Error Portable Release Packager
# Creates a shareable package that includes the synced desktop and web builds.

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

New-Item -ItemType Directory -Path (Join-Path $releaseDir "app") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $releaseDir "web") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $releaseDir "docs") -Force | Out-Null

Write-Host "  Copying desktop app payload..." -ForegroundColor Gray
Copy-Item (Join-Path $distElectron "*") (Join-Path $releaseDir "app") -Recurse -Force

Write-Host "  Copying web build payload..." -ForegroundColor Gray
Copy-Item (Join-Path $distWeb "*") (Join-Path $releaseDir "web") -Recurse -Force

$launcherPath = Join-Path $releaseDir "Start-GenesisError.bat"
@'
@echo off
cd /d "%~dp0"
if exist "app\GenesisError.exe" (
  start "" "app\GenesisError.exe"
) else (
  echo Genesis Error executable not found in app\GenesisError.exe
  pause
)
'@ | Out-File -FilePath $launcherPath -Encoding ascii -Force

$readmePath = Join-Path $releaseDir "docs\PORTABLE-README.txt"
@"
Genesis Error Portable Package (创世错误)
=========================================

Build ID: $buildId

How to run:
1) Unzip this package anywhere on Windows.
2) Double-click Start-GenesisError.bat
   - or run app\GenesisError.exe directly.

Contents:
- app\ : desktop portable executable and runtime files
- web\ : synchronized web build (dist/)
- docs\ : package notes

Sync guarantee:
This package is produced from synchronized build outputs:
- web build from dist\
- desktop build from dist-electron\
- BUILD_ID must match between both outputs
"@ | Out-File -FilePath $readmePath -Encoding ascii -Force

$manifest = [ordered]@{
    product = "Genesis Error"
    build_id = $buildId
    created_utc = [DateTime]::UtcNow.ToString("o")
    source = @{
        web = "dist"
        desktop = "dist-electron"
    }
    files = @{
        launcher = "Start-GenesisError.bat"
        desktop_exe = "app/GenesisError.exe"
        web_index = "web/index.html"
    }
}
($manifest | ConvertTo-Json -Depth 5) | Out-File -FilePath (Join-Path $releaseDir "release-manifest.json") -Encoding utf8 -Force

Write-Host "  Compressing package..." -ForegroundColor Gray

$compressed = $false
$compressError = $null
try {
    Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force
    $compressed = $true
} catch {
    $compressError = $_.Exception.Message
    Write-Host "  Compress-Archive failed, trying tar fallback..." -ForegroundColor Yellow
}

if (-not $compressed) {
    try {
        if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
            & tar.exe -a -c -f $zipPath -C $releaseRoot $releaseName
            if ($LASTEXITCODE -eq 0 -and (Test-Path $zipPath)) {
                $compressed = $true
            }
        }
    } catch {
        $compressError = $_.Exception.Message
    }
}

if (-not $compressed) {
    throw "Unable to create portable zip archive. Last error: $compressError"
}

Copy-Item $zipPath $latestZipPath -Force

Write-Host "Portable release ready:" -ForegroundColor Green
Write-Host "  Folder: $releaseDir" -ForegroundColor White
Write-Host "  Zip:    $zipPath" -ForegroundColor White
Write-Host "  Latest: $latestZipPath" -ForegroundColor White
