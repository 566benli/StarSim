# Create/update desktop shortcut for Genesis Error (创世错误)
# RULE: Single canonical location = dist-electron\GenesisError.exe (exe, shortcut, and web all sync to same build)
# Run this whenever the exe is updated - called by ensure-exe-placement and build-all

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$targetPath = $null
$workDir = $null
$shortcutArgs = ""
$useIconFromTarget = $true

# SINGLE SOURCE OF TRUTH: dist-electron\GenesisError.exe (build-all copies win-unpacked here)
$canonicalExe = "$projectRoot\dist-electron\GenesisError.exe"
$exePath = $null
if (Test-Path $canonicalExe) {
    $exePath = $canonicalExe
    $workDir = "$projectRoot\dist-electron"
}

# Detect placeholder: real exe is PE format; placeholder is batch script (starts with @echo)
$isPlaceholder = $false
if ($exePath) {
    try {
        $firstLine = Get-Content $exePath -First 1 -ErrorAction Stop
        $isPlaceholder = $firstLine -match "^@echo"
    } catch { $isPlaceholder = $false }
}

if ($isPlaceholder -and (Test-Path "$projectRoot\dist-electron\GenesisError-Launcher.ps1")) {
    # Placeholder "exe" is batch script - not runnable. Use PowerShell launcher instead
    $targetPath = (Get-Command powershell).Source
    $workDir = "$projectRoot\dist-electron"
    $shortcutArgs = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$projectRoot\dist-electron\GenesisError-Launcher.ps1`""
    $useIconFromTarget = $false
} elseif ($exePath) {
    $targetPath = $exePath
    $useIconFromTarget = $true
}

if (-not $targetPath) {
    Write-Host "No Genesis Error launcher found - skipping desktop shortcut" -ForegroundColor Yellow
    exit 0
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$Desktop\GenesisError.lnk"

try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = $targetPath
    $Shortcut.Arguments = $shortcutArgs
    $Shortcut.WorkingDirectory = $workDir
    if ($useIconFromTarget) {
        $Shortcut.IconLocation = "$targetPath,0"
    } else {
        $Shortcut.IconLocation = "powershell.exe,0"
    }
    $Shortcut.Description = "Genesis Error (创世错误) — Interactive Cosmic Simulator"
    $Shortcut.Save()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($WshShell) | Out-Null
    Write-Host "Desktop shortcut updated: $shortcutPath" -ForegroundColor Green
} catch {
    Write-Host "Failed to create shortcut: $($_.Exception.Message)" -ForegroundColor Red
}
