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

## Files
- `Plajah.WinUI/Plajah.WinUI.csproj` — net8.0-windows + WindowsAppSDK 1.7 + WebView2, single-project MSIX
- `Plajah.WinUI/App.xaml{,.cs}` — app bootstrap
- `Plajah.WinUI/MainWindow.xaml{,.cs}` — Mica window + WebView2 shell (all native behaviors)
- `Plajah.WinUI/Package.appxmanifest` — MSIX identity, capabilities (internet, mic, webcam)
- `Plajah.WinUI/Assets/` — put Square150x150Logo.png / Square44x44Logo.png / StoreLogo.png here
  (export from the existing PWA icons; 150/44/50 px PNGs are enough to build)

## Roadmap after first compile
1. **Local project folders**: bridge WebView2 `window.chrome.webview.postMessage` ↔ C# file APIs so
   Fabula's local-first media reads real folders (no IndexedDB stash limit).
2. **Native render service**: hand Fabula export jobs to a C# Media Foundation/NVENC encoder —
   hardware renders far beyond the browser's WebCodecs path.
3. **Crossover integration**: the desktop Crossover (Tauri) already does hw transcode; either bridge
   to it or fold its ffmpeg core in here as the proxy/render engine.
4. Store submission (Partner Center) → winget + Store distribution.
