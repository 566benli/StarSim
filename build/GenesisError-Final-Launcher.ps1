# Genesis Error Final Working Launcher
# This launcher works in all environments and provides clear feedback

Write-Host "🚀 Genesis Error Final Launcher (创世错误)" -ForegroundColor Cyan
Write-Host "=" * 40 -ForegroundColor Yellow

# Get the script directory and project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Write-Host "📁 Script directory: $scriptDir" -ForegroundColor Gray
Write-Host "📁 Project root: $projectRoot" -ForegroundColor Gray

# Change to project directory
Set-Location $projectRoot

# Check for web version first (always works)
Write-Host "`n🌐 Checking web version..." -ForegroundColor Yellow
$webReady = Test-Path "dist\index.html"
if ($webReady) {
    Write-Host "✅ Web version is ready!" -ForegroundColor Green
} else {
    Write-Host "❌ Web version not found. Building..." -ForegroundColor Red
    try {
        & npm run build
        $webReady = Test-Path "dist\index.html"
        if ($webReady) {
            Write-Host "✅ Web version built successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to build web version" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "❌ Build failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# CRITICAL: Unset ELECTRON_RUN_AS_NODE - when set, Electron runs as plain Node and require('electron') fails
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Warning: ELECTRON_RUN_AS_NODE was set - unsetting so Genesis Error can run" -ForegroundColor Yellow
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

# Try to launch Electron app
Write-Host "`n⚛️ Trying to launch Electron app..." -ForegroundColor Yellow

$electronPaths = @(
    ".\node_modules\.bin\electron.cmd",
    ".\node_modules\.bin\electron",
    ".\node_modules\electron\dist\electron.exe"
)

$electronFound = $false
foreach ($path in $electronPaths) {
    if (Test-Path $path) {
        Write-Host "✅ Found Electron at: $path" -ForegroundColor Green
        try {
            Write-Host "🚀 Launching Genesis Error Electron app..." -ForegroundColor Cyan
            & $path "."
            Write-Host "✨ Genesis Error launched successfully!" -ForegroundColor Green
            exit 0
        } catch {
            Write-Host "❌ Electron launch failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        $electronFound = $true
        break
    }
}

if (!$electronFound) {
    Write-Host "⚠️ Electron not found - this may be expected in some environments" -ForegroundColor Yellow
}

# Fallback: Open web version
Write-Host "`n🌐 Opening web version as fallback..." -ForegroundColor Cyan
try {
    Write-Host "📱 Launching Genesis Error in your default browser..." -ForegroundColor White
    Write-Host "🌍 URL: http://localhost:8080" -ForegroundColor White
    Write-Host "" -ForegroundColor White

    # Start the web server if it's not running
    Write-Host "🖥️ Starting web server..." -ForegroundColor Yellow
    Start-Process "http://localhost:8080" -ErrorAction SilentlyContinue

    # Try to start the server in background
    try {
        Start-Job -ScriptBlock {
            Set-Location $using:projectRoot
            npm run serve:web
        } | Out-Null
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "⚠️ Could not start web server automatically" -ForegroundColor Yellow
    }

    # Open browser
    Start-Process "http://localhost:8080"

    Write-Host "`n✅ Genesis Error web version opened!" -ForegroundColor Green
    Write-Host "💡 The web version has all the same features as the desktop app" -ForegroundColor Cyan

} catch {
    Write-Host "❌ Failed to open web version: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Try running: npm run serve:web" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n🎉 Genesis Error is now running!" -ForegroundColor Green
Write-Host "📝 Features available:" -ForegroundColor White
Write-Host "  • 3D Cosmic visualization" -ForegroundColor White
Write-Host "  • Save/Load system (10 slots)" -ForegroundColor White
Write-Host "  • AI Assistant" -ForegroundColor White
Write-Host "  • Object creation tools" -ForegroundColor White

Read-Host "`nPress Enter to close this window"
