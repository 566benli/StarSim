@echo off
cd /d "%~dp0"
REM Unset ELECTRON_RUN_AS_NODE - when set, Electron runs as Node and fails to load
set ELECTRON_RUN_AS_NODE=
echo Starting StarSim...
echo.
if exist "dist-electron\StarSim.exe" (
    start "" "dist-electron\StarSim.exe"
) else if exist "dist-electron\win-unpacked\StarSim.exe" (
    start "" "dist-electron\win-unpacked\StarSim.exe"
) else if exist "dist-electron\StarSim.cmd" (
    call "dist-electron\StarSim.cmd"
) else if exist "build\StarSim-Final-Launcher.ps1" (
    powershell -ExecutionPolicy Bypass -File "build\StarSim-Final-Launcher.ps1"
) else (
    echo StarSim not built. Run: npm run build:all
    pause
)
