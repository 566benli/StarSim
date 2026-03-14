# StarSim Dependency Setup Script
# Ensures all dependencies are installed and configured properly

Write-Host "🔧 StarSim Dependency Setup" -ForegroundColor Cyan
Write-Host "=" * 40 -ForegroundColor Yellow

# Check Node.js
Write-Host "`n📦 Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found! Please install Node.js from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check NPM
Write-Host "`n📦 Checking NPM..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✅ NPM: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ NPM not found! Please reinstall Node.js" -ForegroundColor Red
    exit 1
}

# Check if we're in the right directory
Write-Host "`n📁 Checking project directory..." -ForegroundColor Yellow
if (!(Test-Path "package.json")) {
    Write-Host "❌ package.json not found! Please run this script from the StarSim project root" -ForegroundColor Red
    exit 1
}
Write-Host "✅ In StarSim project directory" -ForegroundColor Green

# Install dependencies if needed
Write-Host "`n📦 Checking node_modules..." -ForegroundColor Yellow
if (!(Test-Path "node_modules")) {
    Write-Host "📥 Installing dependencies..." -ForegroundColor Cyan
    try {
        npm install
        Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to install dependencies: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ node_modules exists" -ForegroundColor Green
}

# Check Electron
Write-Host "`n📦 Checking Electron..." -ForegroundColor Yellow
$electronFound = $false
if (Test-Path "node_modules\.bin\electron") {
    $electronFound = $true
} elseif (Test-Path "node_modules\.bin\electron.cmd") {
    $electronFound = $true
} elseif (Test-Path "node_modules\electron\dist\electron.exe") {
    $electronFound = $true
}

if ($electronFound) {
    Write-Host "✅ Electron found" -ForegroundColor Green
} else {
    Write-Host "❌ Electron not found, reinstalling dependencies..." -ForegroundColor Red
    try {
        npm install
        Write-Host "✅ Electron installed" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to install Electron" -ForegroundColor Red
        exit 1
    }
}

# Build the project
Write-Host "`n📦 Building StarSim..." -ForegroundColor Yellow
try {
    npm run build:all
    Write-Host "✅ StarSim built successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Build failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Check if exe was created
Write-Host "`n📦 Checking exe creation..." -ForegroundColor Yellow
if (Test-Path "dist-electron\StarSim.exe") {
    Write-Host "✅ StarSim.exe created successfully" -ForegroundColor Green
} else {
    Write-Host "❌ StarSim.exe not found" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 Setup Complete!" -ForegroundColor Green
Write-Host "You can now run StarSim.exe from the dist-electron folder" -ForegroundColor White
Write-Host "`nUsage:" -ForegroundColor Cyan
Write-Host "  Double-click: dist-electron\StarSim.exe" -ForegroundColor White
Write-Host "  Or run: npm run check-sync" -ForegroundColor White

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
Read-Host