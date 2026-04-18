@echo off
REM Unset ELECTRON_RUN_AS_NODE - when set, Electron runs as Node and fails to load
set ELECTRON_RUN_AS_NODE=
echo ========================================
echo Genesis Error Universal Launcher (创世错误)
echo ========================================
echo.

REM Option 1: Real exe in dist-electron (updated by ensure-exe-placement / build-all)
if exist "dist-electron\GenesisError.exe" (
    start "" "dist-electron\GenesisError.exe"
    goto :eof
)

REM Option 2: Real exe in win-unpacked (from electron-builder)
if exist "dist-electron\win-unpacked\GenesisError.exe" (
    start "" "dist-electron\win-unpacked\GenesisError.exe"
    goto :eof
)

REM Option 3: Placeholder launcher (use .cmd when exe is batch placeholder)
if exist "dist-electron\GenesisError.cmd" (
    call "dist-electron\GenesisError.cmd"
    goto :eof
)

REM Option 4: PowerShell launcher from build directory
if exist "build\GenesisError-Final-Launcher.ps1" (
    powershell -ExecutionPolicy Bypass -File "build\GenesisError-Final-Launcher.ps1"
) else (
    echo ❌ Launcher not found in build directory!
    echo 🔧 Trying web fallback...

    REM Fallback to web version
    if exist "dist\index.html" (
        echo 🌐 Opening web version...
        start http://localhost:8080
        echo ✅ Web version opened!
    ) else (
        echo ❌ No web version found either!
        echo 💡 Run: npm run build:all
    )

    echo.
    echo Press any key to exit...
    pause >nul
)
