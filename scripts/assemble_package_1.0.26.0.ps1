$src = "windows-native\Plajah.WinUI\bin\x64\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.26.0_x64_Test"
$destDesktop = "C:\Users\Kenne\Desktop\Plajah_Package_1.0.26.0"
$destLocal = "C:\Users\Kenne\plajah\Plajah_Package_1.0.26.0"

New-Item -ItemType Directory -Force -Path $destDesktop | Out-Null
New-Item -ItemType Directory -Force -Path $destLocal | Out-Null

Copy-Item -Path "$src\Plajah.WinUI_1.0.26.0_x64.msix" -Destination $destDesktop -Force
Copy-Item -Path "$src\Plajah.WinUI_1.0.26.0_x64.msix" -Destination $destLocal -Force
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
    'echo        Plajah 1-Click App Installer (v1.0.26.0)',
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
    'echo [2/2] Installing / Updating Plajah MSIX Application Package (v1.0.26.0)...',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-AppxPackage -Path ''.\Plajah.WinUI_1.0.26.0_x64.msix'' -ForceApplicationShutdown"',
    'if %errorLevel% equ 0 (',
    '    echo.',
    '    echo =======================================================',
    '    echo  SUCCESS! Plajah v1.0.26.0 installed successfully.',
    '    echo  - Rebuilt Front Row Marquee Launch Hub',
    '    echo  - Time Clock: Staff Punch In / Out with running timer',
    '    echo  - Plajah Business storefront operations (POS, orders, inventory)',
    '    echo  - Elevate Brand activations and Ambo Pro Presenter run-of-show',
    '    echo  - Creator social and marketing management',
    '    echo  - Windows Desktop Front Row Experience behind launcher',
    '    echo  You can launch ''Plajah'' from the Windows Start Menu.',
    '    echo =======================================================',
    ') else (',
    '    echo.',
    '    echo [-] MSIX install encountered an error. Trying AppDevPackage fallback...',
    '    powershell -NoProfile -ExecutionPolicy Bypass -File .\Add-AppDevPackage.ps1 -Force',
    ')',
    'echo.',
    'pause'
)

$batLines | Set-Content -Path "$destDesktop\Install-Plajah.bat" -Encoding Ascii
$batLines | Set-Content -Path "$destLocal\Install-Plajah.bat" -Encoding Ascii
Write-Host "Package 1.0.26.0 assembled on Desktop and repo root successfully!"
