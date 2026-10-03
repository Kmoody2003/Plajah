# Plajah for Windows — WinUI 3 + MSIX (prep-to-compile)

A native Windows shell for the whole Plajah platform: **WinUI 3** (Windows App SDK 1.7,
the current name for "WinUI 3.x latest") hosting the app in **WebView2** (Edge Chromium),
packaged as **single-project MSIX** — the modern Microsoft app target (Store-ready,
clean install/uninstall, auto-update capable).

Native touches already wired in this scaffold:
- **Mica backdrop** + custom title bar (content extends into the title bar — feels Win11-native)
- Window size/position persistence
- External links open in the default browser; Plajah navigation stays in-app
- Camera + microphone permission pass-through (Live, VTuber, Perform capture)
- Fullscreen video support
- GPU-accelerated WebView2 → Fabula's WebGL/WebCodecs paths run on the discrete GPU

## Why this beats Electron here
WebView2 ships with Windows (no bundled Chromium → ~5MB installer instead of ~150MB),
uses the OS-updated engine (security patches for free), and MSIX gives Store distribution +
winget + enterprise deployment. The native layer stays thin now, and grows real native
modules later (background render service, NVENC via Media Foundation, file-system project
folders) without re-architecting.

## Build (one-time setup on this machine — nothing is installed yet)
The machine currently has NO .NET SDK (checked: only the runtime host). Install:

```powershell
winget install Microsoft.DotNet.SDK.8
winget install Microsoft.WindowsSDK.10.0.22621      # if not present via VS
# EITHER full Visual Studio 2022 (recommended for MSIX signing/tooling):
winget install Microsoft.VisualStudio.2022.Community --override "--add Microsoft.VisualStudio.Workload.Universal --add Microsoft.VisualStudio.ComponentGroup.WindowsAppSDK.Cs"
```

Then:

```powershell
cd windows-native/Plajah.WinUI
dotnet restore
# Debug run (unpackaged, fast inner loop):
dotnet build -c Debug && dotnet run
# Release MSIX package (x64):
dotnet publish -c Release -r win-x64 -p:GenerateAppxPackageOnBuild=true -p:AppxPackageSigningEnabled=false
# → output: bin/Release/.../AppPackages/Plajah_*.msix
```

### Signing (required to install the MSIX outside dev mode)
```powershell
# dev cert (test machines / sideload with Developer Mode ON):
New-SelfSignedCertificate -Type Custom -Subject "CN=Plajah" -KeyUsage DigitalSignature -FriendlyName "Plajah Dev" -CertStoreLocation "Cert:\CurrentUser\My" -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")
# production: an EV/OV code-signing cert, or publish through the Microsoft Store (Store signs it).
```

For a local self-signed package, Windows AppX deployment may require the
certificate in the machine Trusted People store. Run PowerShell as Administrator
once, then install the package:

```powershell
$cer = "$env:USERPROFILE\Desktop\Plajah-Development-CodeSigning.cer"
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople
$msix = "windows-native\Plajah.WinUI\bin\x64\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.0.0_x64_Test\Plajah.WinUI_1.0.0.0_x64.msix"
Add-AppxPackage -Path $msix
```

## Files
- `Plajah.WinUI/Plajah.WinUI.csproj` — net8.0-windows + WindowsAppSDK 1.7 + WebView2, single-project MSIX
- `Plajah.WinUI/App.xaml{,.cs}` — app bootstrap
- `Plajah.WinUI/MainWindow.xaml{,.cs}` — Mica window + WebView2 shell (all native behaviors)
- `Plajah.WinUI/Package.appxmanifest` — MSIX identity, capabilities (internet, mic, webcam)
- `Plajah.WinUI/Assets/` — put Square150x150Logo.png / Square44x44Logo.png / StoreLogo.png here
  (export from the existing PWA icons; 150/44/50 px PNGs are enough to build)

## Roadmap after first compile
See [docs/WINDOWS_NATIVE_ACCELERATION_ROADMAP.md](../docs/WINDOWS_NATIVE_ACCELERATION_ROADMAP.md) for
the full RTX, Intel Arc, DirectML, local AI, Windows Hello, media, and native UX backlog.
See [docs/WINDOWS_PRO_MEDIA_STACK.md](../docs/WINDOWS_PRO_MEDIA_STACK.md) for the Fabula, Melos,
Pixels, DeckLink, NDI, low-latency audio, and native Crossover implementation contract.
See [docs/WINDOWS_DESIGN_ARTIFACT_01_PLATFORM_SHELL.md](../docs/WINDOWS_DESIGN_ARTIFACT_01_PLATFORM_SHELL.md)
and [docs/WINDOWS_DESIGN_ARTIFACT_02_PRO_STUDIO_PARITY.md](../docs/WINDOWS_DESIGN_ARTIFACT_02_PRO_STUDIO_PARITY.md)
for the visual parity references.

The first implementation priorities are hardware diagnostics, measured WebCodecs acceleration,
DirectML local inference, then native Media Foundation/NVENC export. NVIDIA-specific CUDA/TensorRT
providers remain optional accelerators; Intel Arc and CPU fallbacks stay supported.

### VST3 host worker

The Rust worker at `rust/plajah-vst3-host` provides the native execution layer for Steinberg VST3
plugins: isolated loading, parameter access, MIDI notes, and state save/restore over JSON lines.
Build it after installing Visual Studio Build Tools with the **Desktop development with C++** workload:

```powershell
cargo build --manifest-path rust/plajah-vst3-host/Cargo.toml --release
```

The worker is deliberately separate from WebView2 so a third-party plugin crash cannot take down the
UI. Visual Studio Build Tools with the Desktop development with C++ workload is installed on the
development machine, and the release worker builds with the MSVC linker.
