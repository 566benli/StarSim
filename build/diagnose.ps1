# StarSim Diagnostic Script
# Helps troubleshoot issues with running StarSim

Write-Host "🔍 StarSim Diagnostic Tool" -ForegroundColor Cyan
Write-Host "=" * 30 -ForegroundColor Yellow

# Check current directory
Write-Host "`n📁 Current Directory:" -ForegroundColor Yellow
Write-Host "  $PWD" -ForegroundColor White

# Check if in project root
Write-Host "`n📦 Project Structure Check:" -ForegroundColor Yellow
$checks = @(
    @{Name="package.json"; Path="package.json"},
    @{Name="node_modules"; Path="node_modules"},
    @{Name="electron folder"; Path="electron"},
    @{Name="src folder"; Path="src"},
    @{Name="dist folder"; Path="dist"},
    @{Name="exe file"; Path="dist-electron\StarSim.exe"}
)

foreach ($check in $checks) {
    if (Test-Path $check.Path) {
        Write-Host "  ✅ $($check.Name) found" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($check.Name) missing" -ForegroundColor Red
    }
}

# Check Node.js and NPM
Write-Host "`n💻 Runtime Check:" -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  ✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Node.js not available" -ForegroundColor Red
}

try {
    $npmVersion = npm --version
    Write-Host "  ✅ NPM: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ NPM not available" -ForegroundColor Red
}

# Check Electron
Write-Host "`n⚛️ Electron Check:" -ForegroundColor Yellow
$electronPaths = @(
    "node_modules\.bin\electron",
    "node_modules\.bin\electron.cmd",
    "node_modules\electron\dist\electron.exe"
)

$electronFound = $false
foreach ($path in $electronPaths) {
    if (Test-Path $path) {
        Write-Host "  ✅ Electron found at: $path" -ForegroundColor Green
        $electronFound = $true
        break
    }
}

if (!$electronFound) {
    Write-Host "  ❌ Electron not found" -ForegroundColor Red
}

# Check PowerShell execution policy
Write-Host "`n🔒 PowerShell Policy:" -ForegroundColor Yellow
try {
    $policy = Get-ExecutionPolicy
    Write-Host "  Current policy: $policy" -ForegroundColor White
    if ($policy -eq "Restricted") {
        Write-Host "  ⚠️ Warning: Restricted policy may prevent scripts from running" -ForegroundColor Yellow
        Write-Host "  💡 To fix: Run PowerShell as Administrator and execute:" -ForegroundColor Cyan
        Write-Host "     Set-ExecutionPolicy RemoteSigned" -ForegroundColor White
    } else {
        Write-Host "  ✅ Policy allows script execution" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ Cannot check execution policy" -ForegroundColor Red
}

# Recommendations
Write-Host "`n💡 Recommendations:" -ForegroundColor Cyan

if (!(Test-Path "node_modules")) {
    Write-Host "  • Run: npm install" -ForegroundColor Yellow
}

if (!(Test-Path "dist")) {
    Write-Host "  • Run: npm run build" -ForegroundColor Yellow
}

if (!(Test-Path "dist-electron\StarSim.exe")) {
    Write-Host "  • Run: npm run build:all" -ForegroundColor Yellow
}

Write-Host "  • To run StarSim: Double-click dist-electron\StarSim.exe" -ForegroundColor White
Write-Host "  • Alternative: Run Setup-StarSim.bat" -ForegroundColor White

Write-Host "`nPress Enter to exit..." -ForegroundColor Gray
Read-Host