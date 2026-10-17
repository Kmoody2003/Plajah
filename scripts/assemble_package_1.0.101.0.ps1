$src = "windows-native\Plajah.WinUI\bin\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.101.0_x64_Test"
if (-not (Test-Path $src)) {
    $src = "windows-native\Plajah.WinUI\bin\x64\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.101.0_x64_Test"
}

$destDesktop = "C:\Users\Kenne\Desktop\Plajah_Package_1.0.101.0"
$destLocal = "C:\Users\Kenne\plajah\Plajah_Package_1.0.101.0"

New-Item -ItemType Directory -Force -Path $destDesktop | Out-Null
New-Item -ItemType Directory -Force -Path $destLocal | Out-Null

Copy-Item -Path "$src\Plajah.WinUI_1.0.101.0_x64.msix" -Destination $destDesktop -Force
Copy-Item -Path "$src\Plajah.WinUI_1.0.101.0_x64.msix" -Destination $destLocal -Force
Copy-Item -Path "$src\Add-AppDevPackage.ps1" -Destination $destDesktop -Force
Copy-Item -Path "$src\Add-AppDevPackage.ps1" -Destination $destLocal -Force
Copy-Item -Path "windows-native\Plajah.WinUI\Plajah.cer" -Destination $destDesktop -Force
Copy-Item -Path "windows-native\Plajah.WinUI\Plajah.cer" -Destination $destLocal -Force

if (Test-Path "$src\Add-AppDevPackage.resources") {
    Copy-Item -Path "$src\Add-AppDevPackage.resources" -Destination $destDesktop -Recurse -Force
    Copy-Item -Path "$src\Add-AppDevPackage.resources" -Destination $destLocal -Recurse -Force
}

$batLines = @(
    '@echo off',
    'setlocal',
    'cd /d %~dp0',
    '',
    'echo =======================================================',
    'echo        Plajah 1-Click App Installer (v1.0.101.0)',
    'echo =======================================================',
    'echo.',
    '',
    ':: Check for administrator',
    'net session >nul 2>&1',
    'if %errorLevel% neq 0 (',
    '    echo [*] Requesting Administrator privileges to install Plajah...',
    '    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList ''/c \"\"\"%~f0\"\"\" --elevated'' -Verb RunAs"',
    '    exit /b',
    ')',
    '',
    'echo [1/2] Installing Plajah Security Certificate...',
    'certutil -user -addstore -f "TrustedPeople" "Plajah.cer" >nul 2>&1',
    'certutil -addstore -f "TrustedPeople" "Plajah.cer" >nul 2>&1',
    'certutil -addstore -f "Root" "Plajah.cer" >nul 2>&1',
    'echo [+] Certificate installed and trusted!',
    '',
    'echo.',
    'echo [2/2] Installing / Updating Plajah MSIX Application Package (v1.0.101.0)...',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-AppxPackage -Path ''.\Plajah.WinUI_1.0.101.0_x64.msix'' -ForceApplicationShutdown"',
    'if %errorLevel% equ 0 (',
    '    echo.',
    '    echo =======================================================',
    '    echo  SUCCESS! Plajah v1.0.101.0 installed successfully.',
    '    echo  You can launch ''Plajah'' from the Windows Start Menu.',
    '    echo =======================================================',
    ') else (',
    '    echo.',
    '    echo [X] Installation encountered an issue. Running PowerShell installer...',
    '    powershell -NoProfile -ExecutionPolicy Bypass -File ".\Add-AppDevPackage.ps1"',
    ')',
    '',
    'echo.',
    'pause'
)

$batContent = $batLines -join "`r`n"
Set-Content -Path "$destDesktop\Install_Plajah.bat" -Value $batContent -Encoding Ascii
Set-Content -Path "$destLocal\Install_Plajah.bat" -Value $batContent -Encoding Ascii

$instructions = @"
Plajah Desktop for Windows (WinUI 3 Native) - Version 1.0.101.0
=============================================================

How to install on this machine or ANY other Windows PC:

METHOD 1 (Easiest - 1-Click Installer):
1. Right-click 'Install_Plajah.bat' and choose 'Run as administrator'.
2. The script will automatically trust the certificate and install Plajah 1.0.101.0.
3. Launch Plajah from the Start Menu!

METHOD 2 (Manual Installation):
1. Double-click 'Plajah.cer', click 'Install Certificate...'.
   Select 'Local Machine' -> Next.
   Choose 'Place all certificates in the following store' -> Browse -> select 'Trusted People' -> OK -> Finish.
2. Double-click 'Plajah.WinUI_1.0.101.0_x64.msix' and click 'Install' or 'Update'.
"@

Set-Content -Path "$destDesktop\README_INSTALL.txt" -Value $instructions -Encoding UTF8
Set-Content -Path "$destLocal\README_INSTALL.txt" -Value $instructions -Encoding UTF8

Write-Host "Successfully assembled Plajah Package v1.0.101.0 at:"
Write-Host " -> $destDesktop"
Write-Host " -> $destLocal"
