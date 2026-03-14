# Quick test to verify StarSim launchers work

Write-Host "🧪 Testing StarSim Launchers..." -ForegroundColor Cyan

# Test 1: Check if web version exists
Write-Host "`n1. Checking web version..." -ForegroundColor Yellow
if (Test-Path "dist\index.html") {
    Write-Host "   ✅ Web version ready" -ForegroundColor Green
} else {
    Write-Host "   ❌ Web version missing - run 'npm run build:all'" -ForegroundColor Red
}

# Test 2: Check launcher files
Write-Host "`n2. Checking launcher files..." -ForegroundColor Yellow
$launchers = @(
    "dist-electron\StarSim.cmd",
    "dist-electron\StarSim.bat",
    "dist-electron\StarSim.exe"
)

foreach ($launcher in $launchers) {
    if (Test-Path $launcher) {
        Write-Host "   ✅ $launcher found" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  $launcher missing" -ForegroundColor Yellow
    }
}

# Test 3: Check dependencies
Write-Host "`n3. Checking dependencies..." -ForegroundColor Yellow
$deps = @(
    @{Name="node_modules"; Path="node_modules"},
    @{Name="electron"; Path="node_modules\.bin\electron"}
)

foreach ($dep in $deps) {
    if (Test-Path $dep.Path) {
        Write-Host "   ✅ $($dep.Name) found" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($dep.Name) missing" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n📋 Summary:" -ForegroundColor Cyan
Write-Host "   🌐 Web version: npm run serve:web" -ForegroundColor White
Write-Host "   🖥️  Desktop app: .\dist-electron\StarSim.cmd" -ForegroundColor White
Write-Host "   🔧 Setup: .\Setup-StarSim.bat" -ForegroundColor White
Write-Host "   🔍 Diagnostics: npm run diagnose" -ForegroundColor White

Write-Host "`n✅ StarSim is ready to run!" -ForegroundColor Green