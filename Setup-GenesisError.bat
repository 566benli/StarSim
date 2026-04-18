@echo off
echo ========================================
echo Genesis Error Setup
echo ========================================
echo.

REM Run setup from build directory
if exist "build\Setup-GenesisError.bat" (
    call "build\Setup-GenesisError.bat"
) else (
    echo Setup not found!
    echo Press any key to exit...
    pause >nul
)
