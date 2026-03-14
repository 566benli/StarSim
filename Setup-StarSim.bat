@echo off
echo ========================================
echo ?? StarSim Setup
echo ========================================
echo.

REM Run setup from build directory
if exist "build\Setup-StarSim.bat" (
    call "build\Setup-StarSim.bat"
) else (
    echo ??Setup not found!
    echo Press any key to exit...
    pause >nul
)
