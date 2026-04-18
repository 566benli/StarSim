@echo off
REM Run Genesis Error from CMD to see any error output
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
echo Running Genesis Error (debug mode - watch for errors below)...
echo.
if exist "dist-electron\GenesisError.exe" (
    "dist-electron\GenesisError.exe" --debug
) else if exist "dist-electron\win-unpacked\GenesisError.exe" (
    "dist-electron\win-unpacked\GenesisError.exe" --debug
) else (
    echo GenesisError.exe not found. Run: npm run package:dir
)
echo.
echo Genesis Error exited. Press any key to close.
pause >nul
