# Plajah for Apple — iPhone, iPad, Mac, Apple TV

| Device | Where | How it's built | Mirrors |
|---|---|---|---|
| iPhone + iPad | `ios/App` | Capacitor 8 (Swift Package Manager), same live-site shell as Android | `android/` |
| Mac | `apple/Mac` | Native AppKit + WKWebView, XcodeGen | `windows-native/Plajah.WinUI` |
| Apple TV | `apple/TV` | Native SwiftUI (tvOS has no web view), XcodeGen | Android TV / Fire TV screens |

All four use bundle ID `com.plajah.app`, so they can share one App Store record (universal purchase).

## iPhone + iPad (`ios/`)

A thin shell over https://plajah.com, exactly like the Android APK (`capacitor.config.ts`
`server.url`): every web deploy reaches the app with no App Store update.

Native plugins (`ios/App/App/Plugins`, registered in `PlajahBridgeViewController.swift`) keep the
Android JS names and contracts, so the web code needs no iOS branches:

| Plugin | iOS | Notes |
|---|---|---|
| PlajahNativeAudio | Lock screen / Control Center / AirPods controls, background audio | metadata mirror only, like Android; remote buttons arrive as `remoteCommand` events |
| PlajahSpeech | Voca read-aloud via `SFSpeechRecognizer`, on-device when the language supports it | same `partial` / `final` / `level` / `state` / `error` events |
| PlajahCamera | Real lenses (wide / ultrawide / telephoto), 4K HEVC local recording saved to Photos | same limit as Android: not while a WebRTC live is using the camera |
| PlajahLaunch | "Open in Plajah" from Files / share, `plajah://view/<slug>` | same `OPEN_MEDIA_FILE` payload as Android and Windows |
| PlajahShell, PlajahDevice, WatchNext | answer "not available" | Android-only surfaces (Compose shell, boot autostart, Android TV row) |
| PlajahFiles, Hub, Matter, Speakers, Telecom | not registered | Android-only; JS gets UNIMPLEMENTED |

Build on a Mac:

```sh
npm ci
npx cap sync ios
npx cap open ios        # Xcode: pick your team under Signing & Capabilities, then Run
```

Before the App Store:
1. **Firebase iOS app.** Firebase console → add an iOS app with ID `com.plajah.app`, download
   `GoogleService-Info.plist` into `ios/App/App/`, and add its `REVERSED_CLIENT_ID` as a URL scheme
   (Info → URL Types). Needed for native Google sign-in. Without it the app still launches
   (`AppDelegate` falls back to the web config), but the native Google button won't work.
2. **Push.** Upload an APNs key in Firebase → Cloud Messaging. Set `aps-environment` to
   `production` in `App.entitlements` for release builds.
3. **Icon.** Generated from `public/plajah-app-icon-512.png` (upscaled to 1024). Swap in a native
   1024 px master when there is one.

## Mac (`apple/Mac`)

The macOS twin of the Windows app. Same design: a native window hosting plajah.com in the
system web engine (WKWebView here, WebView2 there), plus a native message bridge.

**The bridge speaks the Windows protocol.** `BridgeScript.swift` recreates
`window.chrome.webview` (`postMessage` / `addEventListener('message')`) and
`window.__plajahMediaEngine`. So `isWindowsApp()` is true and every web path written for the
Windows app runs unchanged: the custom title bar, Plajah Files, Voca, output windows. The page
gets `__PLAJAH_PLATFORM__ = 'macos'`, which keeps Windows-only code (ASIO, DirectML, NVENC
budgets) switched off.

Local files use the Windows URL format (`https://localmedia.plajah/…?path=…`). WKWebView can't
intercept https, so the bridge script rewrites those URLs to `plajah-media://`, which
`LocalMediaSchemeHandler` serves. It supports byte ranges, `__thumb` (QuickLook) and `__playable`.

| Windows feature | Mac |
|---|---|
| Mica window, custom title bar, drag, min/max/close | ✅ hidden title bar; the web title bar draws the controls (`WINDOW_*`) |
| Window size and position remembered | ✅ |
| Plajah links in-app, sign-in popups, others in browser | ✅ |
| Camera + mic without nagging | ✅ (macOS asks once) |
| Plajah Files: roots, list, copy, move, rename, zip, trash, open, reveal | ✅ (`FILES_*`, Finder, `ditto`) |
| Pickers, read bytes, save image, wallpaper | ✅ |
| Connector secrets | ✅ Keychain |
| Sync pairs and baselines | ✅ stored on disk. ⚠️ No live file watcher yet |
| Remote connectors (FTP, SFTP, WebDAV, S3) | ❌ returns "not on Mac yet" |
| Voca speech | ✅ `SFSpeechRecognizer`; page vocabulary is passed as contextual strings |
| Windows Hello | ✅ Touch ID or Mac password (`HELLO_*`) |
| Hardware profile | ✅ Metal, Apple Silicon, VideoToolbox |
| Audio device list | ✅ Core Audio |
| Displays, output windows, clean feed on a second display | ✅ |
| Taskbar export progress | ✅ Dock tile progress + notification |
| Jump list | ✅ Dock menu |
| Open With / file activation | ✅ `OPEN_MEDIA_FILE` |
| ASIO multitrack, NDI, DeckLink, VST3, Photoshop plug-ins, DWG, local LLM / NPU, GPU compositor, fab machines | ❌ these reply with their normal message, marked unsupported, so nothing hangs. Mac equivalents (Core Audio aggregate devices, NDI SDK for macOS, AU/VST3 host, Core ML or MLX) are the backlog. |

Build on a Mac:

```sh
brew install xcodegen
cd apple && xcodegen generate
open Plajah.xcodeproj    # scheme PlajahMac → set your team → Run
```

Distribution: the default `Plajah.entitlements` is hardened runtime **without** the App Sandbox,
so Plajah Files can browse the whole disk like the Windows app. Ship it as a notarized Developer ID
download. For the Mac App Store, point `CODE_SIGN_ENTITLEMENTS` at `Plajah.appstore.entitlements`
(sandboxed). Files is then limited to the user's standard folders and folders they pick.

## Apple TV (`apple/TV`)

tvOS has no web view, so this is native SwiftUI over the same public catalog the Android TV
screens read (`albums` / `videos` where `isPrivate == false`, through the Firestore REST API):

- **Home** shows Reello and Chora shelves.
- **Chora** has an album grid, track lists and background playback with Siri Remote and Now Playing.
- **Watch** shows Reello and Taleo videos in the system tvOS player (Mux HLS or direct URL).
- **Account** signs in with a code: the existing `/api/tv/pair` flow. You approve it on a phone
  at plajah.com/link or by scanning the QR code. The token stays in the Keychain.

Build: scheme `PlajahTV` in the same generated project.

## CI

`.github/workflows/apple-build.yml` compiles all three apps, unsigned, on a macOS runner. It
runs on any push touching `ios/`, `apple/` or `capacitor.config.ts`, or manually.

## Not yet verified on a device

All of this was written on Windows and has not been compiled or run yet. CI is the first
compile check. Check these first on real hardware:
- WKWebView playing `plajah-media://` video/audio inside the https plajah.com page (Mac local files).
- iOS "Open in Plajah": the `capacitor://localhost/_capacitor_file_` URL loading from the
  plajah.com origin.
- Apple TV: Firestore rules allowing the unauthenticated REST `runQuery` on `albums` / `videos`
  (the web reads them signed-out the same way, so this is expected to work).
