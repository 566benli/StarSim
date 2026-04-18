@echo off
echo 🚀 Genesis Error Setup and Launcher
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
echo ✅ Setup complete! Launching Genesis Error...
echo.

REM Launch the exe
if exist "dist-electron\GenesisError.exe" (
    echo 🌟 Starting GenesisError.exe...
    call "dist-electron\GenesisError.exe"
) else (
    echo ❌ GenesisError.exe not found!
    echo Press any key to exit...
    pause >nul
)
