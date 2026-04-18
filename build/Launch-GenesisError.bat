@echo off
echo ========================================
echo 🚀 Genesis Error Universal Launcher
echo ========================================
echo.

echo 🔧 Starting Genesis Error...
echo This launcher works in all environments
echo.

REM Try to run the PowerShell launcher
powershell -ExecutionPolicy Bypass -File GenesisError-Final-Launcher.ps1

if %errorlevel% neq 0 (
    echo.
    echo ❌ Launcher failed!
    echo.
    echo 🔧 Troubleshooting:
    echo   1. Make sure Node.js is installed
    echo   2. Run: npm install
    echo   3. Run: npm run build:all
    echo   4. Try: npm run serve:web
    echo.
    echo Press any key to exit...
    pause >nul
)
