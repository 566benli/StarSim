@echo off
cd /d "%~dp0"
REM Unset ELECTRON_RUN_AS_NODE - when set, Electron runs as Node and fails to load
set ELECTRON_RUN_AS_NODE=
echo Starting Genesis Error...
echo.
if exist "dist-electron\GenesisError.exe" (
    start "" "dist-electron\GenesisError.exe"
) else if exist "dist-electron\win-unpacked\GenesisError.exe" (
    start "" "dist-electron\win-unpacked\GenesisError.exe"
) else if exist "dist-electron\GenesisError.cmd" (
    call "dist-electron\GenesisError.cmd"
) else if exist "build\GenesisError-Final-Launcher.ps1" (
    powershell -ExecutionPolicy Bypass -File "build\GenesisError-Final-Launcher.ps1"
) else (
    echo Genesis Error not built. Run: npm run build:all
    pause
)
