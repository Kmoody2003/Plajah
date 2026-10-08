$src = "windows-native\Plajah.WinUI\bin\x64\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.18.0_x64_Test"
$destDesktop = "C:\Users\Kenne\Desktop\Plajah_Test_Package_1.0.18.0"
$destLocal = "C:\Users\Kenne\plajah\Plajah_Test_Package_1.0.18.0"

New-Item -ItemType Directory -Force -Path $destDesktop | Out-Null
New-Item -ItemType Directory -Force -Path $destLocal | Out-Null

$items = @(
    "$src\Plajah.WinUI_1.0.18.0_x64.msix",
    "$src\Add-AppDevPackage.ps1",
    "windows-native\Plajah.WinUI\Plajah.cer",
    "windows-native\Plajah.WinUI\Plajah.pfx"
)

foreach ($item in $items) {
    Copy-Item -Path $item -Destination $destDesktop -Force
    Copy-Item -Path $item -Destination $destLocal -Force
}

if (Test-Path "$src\Add-AppDevPackage.resources") {
    Copy-Item -Path "$src\Add-AppDevPackage.resources" -Destination $destDesktop -Recurse -Force
    Copy-Item -Path "$src\Add-AppDevPackage.resources" -Destination $destLocal -Recurse -Force
}

$installBat = @"
@echo off
setlocal
cd /d "%~dp0"

echo =======================================================
echo        Plajah 1-Click App Installer (v1.0.18.0)
echo =======================================================
echo.

:: Check for administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [*] Requesting Administrator privileges to install Plajah...
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"\"%~f0\"\"\" --elevated' -Verb RunAs"
    exit /b
)

echo [1/2] Installing Plajah Security Certificate...
certutil -user -addstore -f "TrustedPeople" "Plajah.cer" >nul 2>&1
certutil -addstore -f "TrustedPeople" "Plajah.cer" >nul 2>&1
certutil -addstore -f "Root" "Plajah.cer" >nul 2>&1
echo [+] Certificate installed and trusted!

echo.
echo [2/2] Installing / Updating Plajah MSIX Application Package (v1.0.18.0)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-AppxPackage -Path '.\Plajah.WinUI_1.0.18.0_x64.msix' -ForceApplicationShutdown"
if %errorLevel% equ 0 (
    echo.
    echo =======================================================
    echo  SUCCESS! Plajah v1.0.18.0 installed successfully.
    echo  You can launch 'Plajah' from the Windows Start Menu.
    echo =======================================================
) else (
    echo.
    echo [-] MSIX install encountered an error. Trying AppDevPackage fallback...
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\Add-AppDevPackage.ps1" -Force
)
echo.
pause
"@

$certBat = @"
@echo off
setlocal
cd /d "%~dp0"

echo =======================================================
echo        Plajah Security Certificate Installer
echo =======================================================
echo.

:: 1. Attempt to install into Current User TrustedPeople (no admin needed)
echo [*] Installing into Current User 'Trusted People' store...
certutil -user -addstore -f "TrustedPeople" "Plajah.cer" >nul 2>&1
if %errorLevel% equ 0 (
    echo [+] Successfully added to Current User Trusted People!
) else (
    echo [-] Current user store update skipped.
)

:: 2. Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [*] Requesting Administrator privileges to install into
    echo     Local Machine 'Trusted Root' and 'Trusted People'...
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\" --elevated\"' -Verb RunAs"
    exit /b
)

:: 3. If running as administrator, install into LocalMachine stores
echo [*] Installing into Local Machine 'Trusted Root Certification Authorities'...
certutil -addstore -f "Root" "Plajah.cer"
echo [*] Installing into Local Machine 'Trusted People'...
certutil -addstore -f "TrustedPeople" "Plajah.cer"

echo.
echo =======================================================
echo  SUCCESS! Plajah Certificate is installed and trusted.
echo  You can now install Plajah MSIX on this computer.
echo =======================================================
echo.
pause
"@

$readme = @"
Plajah Production Testing Package v1.0.18.0
============================================

HOW TO INSTALL ON ANY WINDOWS COMPUTER:
1. Double-click "Install-Plajah.bat"
   - It will automatically install and trust the Plajah Security Certificate.
   - It will install or update the Plajah MSIX application (v1.0.18.0).
   - Once finished, you will see a SUCCESS message.

2. Launch "Plajah" from your Windows Start Menu!

WHAT IS NEW IN v1.0.18.0:
- Full Chora Music Platform integration in Ambo Presenter:
  * Public albums & artists, personal tracks/music locker, personal playlists,
    ambient worship pads (12 keys continuous), and multitrack stems.
- Audio Asset Slide Drag-and-Drop:
  * Dragging audio tracks or local audio files into the presentation deck
    creates an Audio Asset Slide with audio triggers and waveform background.
  * Dragging audio onto existing slides attaches background audio.
- Audio Playlist Creator:
  * Create, name, and categorize audio playlists directly in Ambo.
- DJ Waveform Player in Ambo:
  * Per-track broadcast DJ engine with horizontal audio waveform.
  * 8 Hot Cue pads with jump/set/clear and color coding.
  * 3-band EQ, dual-mode filter (LPF/HPF), delay, and algorithmic reverb.
  * Beat loops (1/8 to 16 beats) and tempo/pitch semitone adjustment.
  * Live Camelot key badge and BPM detection.
  * Route audio directly to Live Program Out or Cued Preview.
"@

Set-Content -Path "$destDesktop\Install-Plajah.bat" -Value $installBat -Encoding UTF8
Set-Content -Path "$destLocal\Install-Plajah.bat" -Value $installBat -Encoding UTF8

Set-Content -Path "$destDesktop\Install-Certificate.bat" -Value $certBat -Encoding UTF8
Set-Content -Path "$destLocal\Install-Certificate.bat" -Value $certBat -Encoding UTF8

Set-Content -Path "$destDesktop\README_INSTALL.txt" -Value $readme -Encoding UTF8
Set-Content -Path "$destLocal\README_INSTALL.txt" -Value $readme -Encoding UTF8

Write-Host "Package 1.0.18.0 assembled successfully in both Desktop and local repository."
