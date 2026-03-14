@echo off
REM Step 3: Run StarSim from CMD to see any error output
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
echo Running StarSim (debug mode - watch for errors below)...
echo.
if exist "dist-electron\StarSim.exe" (
    "dist-electron\StarSim.exe" --debug
) else if exist "dist-electron\win-unpacked\StarSim.exe" (
    "dist-electron\win-unpacked\StarSim.exe" --debug
) else (
    echo StarSim.exe not found. Run: npm run package:dir
)
echo.
echo StarSim exited. Press any key to close.
pause >nul
