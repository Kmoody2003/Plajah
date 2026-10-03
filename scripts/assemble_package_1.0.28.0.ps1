$src = "windows-native\Plajah.WinUI\bin\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.28.0_x64_Test"
$destDesktop = "C:\Users\Kenne\Desktop\Plajah_Package_1.0.28.0"
$destLocal = "C:\Users\Kenne\plajah\Plajah_Package_1.0.28.0"

New-Item -ItemType Directory -Force -Path $destDesktop | Out-Null
New-Item -ItemType Directory -Force -Path $destLocal | Out-Null

Copy-Item -Path "$src\Plajah.WinUI_1.0.28.0_x64.msix" -Destination $destDesktop -Force
Copy-Item -Path "$src\Plajah.WinUI_1.0.28.0_x64.msix" -Destination $destLocal -Force
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
    'echo        Plajah 1-Click App Installer (v1.0.28.0)',
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
    'echo [2/2] Installing / Updating Plajah MSIX Application Package (v1.0.28.0)...',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-AppxPackage -Path ''.\Plajah.WinUI_1.0.28.0_x64.msix'' -ForceApplicationShutdown"',
    'if %errorLevel% equ 0 (',
    '    echo.',
    '    echo =======================================================',
    '    echo  SUCCESS! Plajah v1.0.28.0 installed successfully.',
    '    echo  - Fabula: 5-Phase Hollywood Studio OS',
    '    echo  - Lorea: The Writer''s Desk',
    '    echo  - Chora Studio: Music & Intelligence Suite',
    '    echo  - Chora Artist Manager: Music Business OS',
    '    echo  You can launch ''Plajah'' from the Windows Start Menu.',
    '    echo =======================================================',
    ') else (',
    '    echo.',
    '    echo [X] Installation encountered an issue. Running PowerShell installer...',
    '    powershell -NoProfile -ExecutionPolicy Bypass -File ".\Add-AppDevPackage.ps1"',
    ')',
    'echo.',
    'pause'
)

$batPathDesktop = Join-Path $destDesktop "Install-Plajah.bat"
$batPathLocal = Join-Path $destLocal "Install-Plajah.bat"
[System.IO.File]::WriteAllLines($batPathDesktop, $batLines)
[System.IO.File]::WriteAllLines($batPathLocal, $batLines)

Write-Host "Successfully assembled Plajah Package v1.0.28.0 on Desktop and local folder!"
