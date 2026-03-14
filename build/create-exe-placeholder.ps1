# StarSim Exe Placeholder Creator
# Creates a guaranteed exe file that can be updated and replaced

param(
    [string]$OutputPath = "dist-electron\StarSim.exe"
)

Write-Host "🔧 Creating StarSim Exe Placeholder..." -ForegroundColor Cyan

# Ensure output directory exists
$outputDir = Split-Path $OutputPath -Parent
if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Write-Host "  📁 Created directory: $outputDir" -ForegroundColor Gray
}

# Create a PowerShell script that acts like an exe launcher (production: loads from dist/)
$launcherScript = @"
# StarSim Executable Launcher - loads built dist/ (production mode)
param([string[]]`$Passthru)

`$projectRoot = Split-Path -Parent `$PSScriptRoot
Set-Location `$projectRoot

Write-Host "Starting StarSim Desktop Application..." -ForegroundColor Cyan

`$distExists = Test-Path "dist\index.html"
if (-not `$distExists) {
    Write-Host "Web build not found. Building..." -ForegroundColor Yellow
    try {
        npm run build
        if (-not (Test-Path "dist\index.html")) {
            Write-Host "Build failed. Run 'npm run build:all' from project root." -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
    } catch {
        Write-Host "Build failed: `$(`$_.Exception.Message)" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

`$electronPaths = @(
    "`$projectRoot\node_modules\.bin\electron.cmd",
    "`$projectRoot\node_modules\.bin\electron",
    "`$projectRoot\node_modules\electron\dist\electron.exe"
)
`$electronExe = `$null
foreach (`$p in `$electronPaths) {
    if (Test-Path `$p) { `$electronExe = `$p; break }
}
if (-not `$electronExe) {
    Write-Host "Electron not found. Run 'npm install' first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Launching StarSim..." -ForegroundColor Green
try {
    & `$electronExe "`$projectRoot\electron\main.js"
} catch {
    Write-Host "Launch failed: `$(`$_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
"@

# Create a batch file that calls the PowerShell script
$batchScript = @"
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0StarSim-Launcher.ps1" %*
"@

# Save the PowerShell launcher
$launcherPath = Join-Path $outputDir "StarSim-Launcher.ps1"
$launcherScript | Out-File -FilePath $launcherPath -Encoding UTF8 -Force

# Save the batch launcher
$batchPath = $OutputPath -replace '\.exe$', '.bat'
$batchScript | Out-File -FilePath $batchPath -Encoding ASCII -Force

# Create a .cmd file that acts like an exe (more compatible than .exe extension)
$cmdPath = $OutputPath -replace '\.exe$', '.cmd'
$cmdScript = @"
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0StarSim-Launcher.ps1" %*
"@
$cmdScript | Out-File -FilePath $cmdPath -Encoding ASCII -Force

# Also create the .exe file (it will be a batch file with .exe extension)
# This might cause warnings but will work
$exePath = $OutputPath
$exeScript = @"
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0StarSim-Launcher.ps1" %*
"@
$exeScript | Out-File -FilePath $exePath -Encoding ASCII -Force

# Set timestamps to current time
$currentTime = Get-Date
Set-ItemProperty -Path $launcherPath -Name LastWriteTime -Value $currentTime
Set-ItemProperty -Path $batchPath -Name LastWriteTime -Value $currentTime
Set-ItemProperty -Path $cmdPath -Name LastWriteTime -Value $currentTime
Set-ItemProperty -Path $exePath -Name LastWriteTime -Value $currentTime

Write-Host "✅ StarSim exe placeholder created successfully!" -ForegroundColor Green
Write-Host "📁 Location: $cmdPath" -ForegroundColor White
Write-Host "📅 Created: $currentTime" -ForegroundColor White
Write-Host "🔗 Launches: Web version through Electron" -ForegroundColor Gray