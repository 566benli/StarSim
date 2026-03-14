# StarSim Synchronization Checker
# Verifies exe, web (dist), and desktop shortcut all point to the same version

Write-Host "🔍 Checking StarSim version synchronization..." -ForegroundColor Cyan

$projectRoot = Get-Location
$webExists = Test-Path "dist\index.html"
$exeExists = Test-Path "dist-electron\StarSim.exe"
$canonicalExe = "$projectRoot\dist-electron\StarSim.exe"

if (-not $webExists) {
    Write-Host "❌ ERROR: Web version not found! Run 'npm run build:all'" -ForegroundColor Red
    exit 1
}

if (-not $exeExists) {
    Write-Host "❌ CRITICAL: Exe version not found! This breaks synchronization." -ForegroundColor Red
    Write-Host "💡 Run 'npm run build:all' to create the exe version" -ForegroundColor Yellow
    Write-Host "📁 Web version: $(Resolve-Path dist\index.html)" -ForegroundColor Gray
    exit 1
}

# Build ID verification (same build = same version)
$webBuildId = $null
$exeBuildId = $null
if (Test-Path "dist\BUILD_ID.txt") { $webBuildId = (Get-Content "dist\BUILD_ID.txt" -Raw).Trim() }
if (Test-Path "dist-electron\BUILD_ID.txt") { $exeBuildId = (Get-Content "dist-electron\BUILD_ID.txt" -Raw).Trim() }

# Desktop shortcut target check
$shortcutTarget = $null
$Desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$Desktop\StarSim.lnk"
if (Test-Path $shortcutPath) {
    try {
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut($shortcutPath)
        $shortcutTarget = $Shortcut.TargetPath
        $shortcutWorkDir = $Shortcut.WorkingDirectory
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($WshShell) | Out-Null
    } catch { $shortcutTarget = "?(read failed)" }
}

# Check if exe is a placeholder or real exe
$exeIsPlaceholder = $false
$exeContent = Get-Content "dist-electron\StarSim.exe" -ErrorAction SilentlyContinue
if ($exeContent -and $exeContent[0] -match "@echo off") {
    $exeIsPlaceholder = $true
}

Write-Host "📊 Synchronization Status:" -ForegroundColor Blue
Write-Host "  🌐 Web (dist/):     $(Resolve-Path dist\index.html)" -ForegroundColor Gray
Write-Host "  📁 Exe (canonical): $(Resolve-Path $canonicalExe)$(if ($exeIsPlaceholder) { ' (PLACEHOLDER)' } else { ' (REAL EXE)' })" -ForegroundColor Gray
Write-Host "  🔗 Desktop shortcut: $shortcutPath" -ForegroundColor Gray

$allSync = $true
if ($webBuildId -and $exeBuildId) {
    if ($webBuildId -eq $exeBuildId) {
        Write-Host "  📌 Build ID: $webBuildId ✅ MATCH" -ForegroundColor Green
    } else {
        Write-Host "  📌 Build ID: web=$webBuildId exe=$exeBuildId ❌ MISMATCH" -ForegroundColor Red
        $allSync = $false
    }
} else {
    Write-Host "  📌 Build ID: $(if ($webBuildId) { "web=$webBuildId" } else { "web=?" }) $(if ($exeBuildId) { "exe=$exeBuildId" } else { "exe=?" })" -ForegroundColor Yellow
}

# Shortcut must point to canonical exe (or launcher for placeholder)
$shortcutCorrect = $false
if ($shortcutTarget) {
    $normCanonical = (Resolve-Path $canonicalExe -ErrorAction SilentlyContinue).Path
    $normShortcut = (Resolve-Path $shortcutTarget -ErrorAction SilentlyContinue).Path
    if ($normShortcut -eq $normCanonical) {
        Write-Host "  🔗 Shortcut target: ✅ Points to canonical exe" -ForegroundColor Green
        $shortcutCorrect = $true
    } elseif ($shortcutTarget -match "StarSim-Launcher\.ps1") {
        Write-Host "  🔗 Shortcut target: ✅ Placeholder launcher (uses dist/)" -ForegroundColor Green
        $shortcutCorrect = $true
    } elseif ($shortcutTarget -match "win-unpacked") {
        Write-Host "  🔗 Shortcut target: ❌ Points to win-unpacked (should be dist-electron\)" -ForegroundColor Red
        Write-Host "     Run 'npm run shortcut' to fix" -ForegroundColor Yellow
        $allSync = $false
    } else {
        Write-Host "  🔗 Shortcut target: $shortcutTarget" -ForegroundColor Gray
    }
} else {
    Write-Host "  🔗 Shortcut target: (no shortcut or could not read)" -ForegroundColor Yellow
}

if ($allSync) {
    Write-Host "  ✅ All versions synchronized!" -ForegroundColor Green
} else {
    Write-Host "  ❌ Run 'npm run build:all' to synchronize" -ForegroundColor Red
}
exit 0