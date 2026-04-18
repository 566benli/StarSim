# Ensure exe is always in correct location after updates

Write-Host "Ensuring exe is in correct location..." -ForegroundColor Cyan

# If win-unpacked has real exe, copy full app to dist-electron root (single canonical location)
if (Test-Path "dist-electron\win-unpacked\GenesisError.exe") {
    Copy-Item "dist-electron\win-unpacked\*" "dist-electron\" -Recurse -Force
    if (Test-Path "dist\BUILD_ID.txt") {
        Copy-Item "dist\BUILD_ID.txt" "dist-electron\BUILD_ID.txt" -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Real exe and resources copied to dist-electron\" -ForegroundColor Green
}

# Check if exe exists in dist-electron
if (Test-Path "dist-electron\GenesisError.exe") {
    Write-Host "Exe found: dist-electron\GenesisError.exe" -ForegroundColor Green

    # Copy to root for easy access (optional)
    Copy-Item "dist-electron\GenesisError.exe" "GenesisError.exe" -Force -ErrorAction SilentlyContinue
    Write-Host "Exe also copied to root: GenesisError.exe" -ForegroundColor Green

    # Update desktop shortcut when exe is updated
    & "$PSScriptRoot\create-desktop-shortcut.ps1"
} elseif (Test-Path "dist-electron\win-unpacked\GenesisError.exe") {
    # Exe in win-unpacked only - still create/update shortcut
    & "$PSScriptRoot\create-desktop-shortcut.ps1"
} elseif (Test-Path "build\GenesisError.exe") {
    # Move from build to dist-electron
    if (!(Test-Path "dist-electron")) {
        New-Item -ItemType Directory -Path "dist-electron" -Force | Out-Null
    }
    Move-Item "build\GenesisError.exe" "dist-electron\GenesisError.exe" -Force
    Write-Host "Moved exe to correct location: dist-electron\GenesisError.exe" -ForegroundColor Green
} else {
    Write-Host "No exe found. Run 'npm run build:all' to create one." -ForegroundColor Yellow
}
