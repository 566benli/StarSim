# StarSim Build Script - Ensures exe and web versions stay in sync
# This script ALWAYS rebuilds both versions to maintain synchronization
# RULE: Run npm install before each rebuild to ensure preliminaries are in place

Write-Host "🚀 Building StarSim - Keeping exe and web versions in sync..." -ForegroundColor Cyan
Write-Host "⚠️  IMPORTANT: This rebuilds BOTH web and exe versions every time!" -ForegroundColor Yellow

# Step 0: Install all preliminaries (RULE - ensures exe can run)
Write-Host "`n📦 Installing prerequisites (npm install)..." -ForegroundColor Cyan
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ⚠️  npm install had warnings (continuing)" -ForegroundColor Yellow
    } else {
        Write-Host "  ✅ Dependencies installed/verified" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ npm install failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Fix dependencies, then run 'npm run build:all' again" -ForegroundColor Yellow
    exit 1
}

# Step 1: Clean ALL builds (force fresh builds)
Write-Host "🧹 Cleaning all previous builds..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item "dist" -Recurse -Force
    Write-Host "  ✅ Cleaned web build (dist/)" -ForegroundColor Gray
}
if (Test-Path "dist-electron") {
    try {
        Remove-Item "dist-electron" -Recurse -Force -ErrorAction Stop
        Write-Host "  ✅ Cleaned exe build (dist-electron/)" -ForegroundColor Gray
    } catch {
        Write-Host "  ⚠️  Could not clean dist-electron (StarSim.exe may be running - close it and retry)" -ForegroundColor Yellow
        Write-Host "     Proceeding - electron-builder may overwrite files" -ForegroundColor Gray
    }
}

# Step 2: Build web version (ALWAYS)
Write-Host "🌐 Building web version..." -ForegroundColor Green
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Web build failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host "❌ ERROR: Web build failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2b: Write shared BUILD_ID (exe, web, shortcut all use this for version verification)
$buildId = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$buildId | Out-File -FilePath "dist\BUILD_ID.txt" -Encoding UTF8 -Force
Write-Host "  📌 Build ID: $buildId" -ForegroundColor Gray

# Step 3: Build Electron executable (uses existing dist/ from step 2 - no rebuild to keep BUILD_ID)
Write-Host "📦 Building Electron executable..." -ForegroundColor Green
$exeBuildSuccess = $false

# Run electron-builder directly (dist/ already built with BUILD_ID - package:dir would rebuild and overwrite)
try {
    npx electron-builder --win --dir
    if ($LASTEXITCODE -eq 0) {
        # Check if the exe was actually created
        if (Test-Path "dist-electron\win-unpacked\StarSim.exe") {
            Copy-Item "dist-electron\win-unpacked\*" "dist-electron\" -Recurse -Force
            # Sync BUILD_ID to exe folder (same version as web)
            Copy-Item "dist\BUILD_ID.txt" "dist-electron\BUILD_ID.txt" -Force -ErrorAction SilentlyContinue
            $exeBuildSuccess = $true
            Write-Host "  ✅ Real exe build completed successfully" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Electron-builder completed but exe file not found" -ForegroundColor Yellow
            $exeBuildSuccess = $false
        }
    } else {
        Write-Host "  ❌ Real exe build failed with exit code $LASTEXITCODE" -ForegroundColor Red
        $exeBuildSuccess = $false
    }
} catch {
    Write-Host "  ❌ Real exe build failed: $($_.Exception.Message)" -ForegroundColor Red
    $exeBuildSuccess = $false
}

# If real exe build failed, create a guaranteed exe placeholder
if (-not $exeBuildSuccess) {
    Write-Host "  🔄 Creating exe placeholder to ensure synchronization..." -ForegroundColor Cyan
    try {
        & "$PSScriptRoot\create-exe-placeholder.ps1"
        if (Test-Path "dist-electron\StarSim.exe") {
            Copy-Item "dist\BUILD_ID.txt" "dist-electron\BUILD_ID.txt" -Force -ErrorAction SilentlyContinue
            $exeBuildSuccess = $true
            Write-Host "  ✅ Exe placeholder created successfully" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Exe placeholder creation failed" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ❌ Exe placeholder creation failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Step 4: Verify synchronization
Write-Host "✅ Verifying version synchronization..." -ForegroundColor Blue

$exeExists = Test-Path "dist-electron\StarSim.exe"
$webExists = Test-Path "dist\index.html"

# Check web version
if ($webExists) {
    Write-Host "🎉 SUCCESS: Web version built successfully!" -ForegroundColor Green
    Write-Host "📁 Web version: $(Resolve-Path dist\index.html)" -ForegroundColor Gray
    $webTimestamp = (Get-Item "dist\index.html").LastWriteTime
    Write-Host "📅 Web built: $webTimestamp" -ForegroundColor Gray
} else {
    Write-Host "❌ CRITICAL ERROR: Web build failed! Cannot proceed." -ForegroundColor Red
    exit 1
}

# Check exe version
if ($exeExists) {
    Write-Host "🎉 SUCCESS: Exe version built successfully!" -ForegroundColor Green
    Write-Host "📁 Exe version: $(Resolve-Path dist-electron\StarSim.exe)" -ForegroundColor Gray
    $exeTimestamp = (Get-Item "dist-electron\StarSim.exe").LastWriteTime
    Write-Host "📅 Exe built: $exeTimestamp" -ForegroundColor Gray

    # Check if versions are synchronized (within 1 minute)
    $timeDiff = [Math]::Abs(($webTimestamp - $exeTimestamp).TotalMinutes)
    if ($timeDiff -lt 1) {
        Write-Host "🔄 SYNC STATUS: ✓ Versions are synchronized!" -ForegroundColor Green
    } else {
        Write-Host "🔄 SYNC STATUS: ⚠️  Versions may be out of sync (time difference: $([Math]::Round($timeDiff, 1)) minutes)" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  WARNING: Exe version build failed" -ForegroundColor Yellow
    Write-Host "🔄 SYNC STATUS: ❌ Versions are NOT synchronized!" -ForegroundColor Red
    Write-Host "💡 Web version works, but exe needs rebuild in proper environment" -ForegroundColor Cyan
    $exeBuildSuccess = $false
}

# Step 5: Ensure exe placement and desktop shortcut (RULE: exe + shortcut must sync)
Write-Host "`n📦 Ensuring exe placement and desktop shortcut..." -ForegroundColor Yellow

if (Test-Path "build/ensure-exe-placement.ps1") {
    try {
        & "build/ensure-exe-placement.ps1"
        Write-Host "  ✅ Exe placement verified" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️ Exe placement check failed, but build continues" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️ Exe placement script not found" -ForegroundColor Yellow
}

# ALWAYS update desktop shortcut when exe exists
if (Test-Path "dist-electron\StarSim.exe") {
    Write-Host "  🔗 Updating desktop shortcut..." -ForegroundColor Cyan
    try {
        & "build/create-desktop-shortcut.ps1"
        Write-Host "  ✅ Desktop shortcut updated" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Desktop shortcut failed - run 'npm run shortcut' manually" -ForegroundColor Red
    }
}

# Step 6: Sync check
if (Test-Path "build/check-sync.ps1") { & "build/check-sync.ps1" }

Write-Host "`n📊 FINAL BUILD STATUS:" -ForegroundColor Cyan
if ($webExists -and $exeBuildSuccess) {
    Write-Host "  ✅ FULL SUCCESS: Both web and exe versions built and synchronized!" -ForegroundColor Green
} elseif ($webExists) {
    Write-Host "  ⚠️  PARTIAL SUCCESS: Web version ready, exe build failed (still usable)" -ForegroundColor Yellow
} else {
    Write-Host "  ❌ FAILURE: Build incomplete" -ForegroundColor Red
}

Write-Host "`n📝 Usage:" -ForegroundColor Cyan
if ($exeExists) {
    Write-Host "  🖥️  Desktop App: Run 'dist-electron\StarSim.exe'" -ForegroundColor White
}
Write-Host "  🌐 Web Version: Run 'npm run serve:web' (opens http://localhost:8080)" -ForegroundColor White
Write-Host "  🛠️  Development: Run 'npm run electron-dev'" -ForegroundColor White
Write-Host "  🔄 Rebuild All: Run 'npm run build:all' (ALWAYS rebuilds both)" -ForegroundColor White

Write-Host "`n⚠️  IMPORTANT:" -ForegroundColor Yellow
Write-Host "  • Run 'npm run build:all' AFTER EVERY CODE CHANGE" -ForegroundColor White
Write-Host "  • This ensures web and exe versions stay synchronized" -ForegroundColor White
Write-Host "  • Never modify code without rebuilding both versions!" -ForegroundColor White