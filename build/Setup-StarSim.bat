@echo off
echo 🚀 StarSim Setup and Launcher
echo ==============================
echo.

echo 🔧 Setting up dependencies...
powershell -ExecutionPolicy Bypass -File setup-dependencies.ps1

if %errorlevel% neq 0 (
    echo ❌ Setup failed!
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo.
echo ✅ Setup complete! Launching StarSim...
echo.

REM Launch the exe
if exist "dist-electron\StarSim.exe" (
    echo 🌟 Starting StarSim.exe...
    call "dist-electron\StarSim.exe"
) else (
    echo ❌ StarSim.exe not found!
    echo Press any key to exit...
    pause >nul
)