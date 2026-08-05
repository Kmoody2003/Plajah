# Reello — Local Recording & Native Camera (status + plan)

## What shipped (this change, web — reaches the APK immediately)

The APK is a **thin remote shell**: `capacitor.config.ts` sets `server.url = 'https://plajah.com'`,
so the Android app loads the live website into a WebView. **Every web deploy reaches the APK with no
rebuild.** Native (Kotlin/Gradle) changes are the only thing that needs a new APK + Play Store release.

1. **Crash-safe local recording** (`services/localRecordingStore.ts`)
   - Every MediaRecorder chunk is committed to on-device IndexedDB the instant it arrives (durable per
     ~1s transaction). A failed upload, a closed tab, or a dead network **can no longer lose the video.**
   - Works in the Android System WebView (IndexedDB is universal), unlike `showSaveFilePicker` (desktop only).
   - Pre-stream toggle "Save a copy on this device" (default on). Desktop can additionally pick an exact
     file to mirror into. After the stream: **Save to device** (download → Android Downloads folder), and
     a recovery banner offers to download/discard any recording a prior crash left behind.
   - On successful cloud upload the on-device copy is cleared; on failure it's kept and surfaced.

2. **Camera switching** (`services/rtcCore.ts` `cycleCamera`) — dedupes to DISTINCT physical cameras
   (Android lists the same sensor twice as a "logical multi-camera"), and falls back from `exact`
   deviceId to a non-exact hint when a WebView rejects it, so the flip reliably changes lens.

3. **Feed media** (unrelated bug, same push) — the feed now renders the full `media[]` array (photos +
   playable videos, single or carousel) instead of collapsing to one `<img>`; old posts render
   retroactively (their `media[]` was never lost). Video posts get a real poster thumbnail.

## The native-camera constraint (why "max-quality capture into the live stream" is NOT in this push)

The user asked for the APK to use the native camera API at maximum quality. The honest architectural picture:

- The **live stream publishes via WebRTC from `getUserMedia` inside the WebView.** Its quality is already
  tuned (`rtcCore`: 1080p ideal, up to 60fps, continuous AF/AE/AWB, `contentHint:'detail'`,
  3.8 Mbps sender, VP9-preferred). At the live bitrate, 1080p is the correct target — higher capture
  resolution just gets more heavily compressed on the wire, it does not look better.
- A **native Camera2/CameraX plugin cannot inject frames into the WebView's `RTCPeerConnection`** — there's
  no bridge API for that. And Android grants a physical camera to **one** client at a time, so native
  capture and WebView `getUserMedia` cannot both own the sensor during a live.
- Therefore a native camera that improves the **live** stream requires replacing the entire
  capture→encode→publish pipeline with **native libwebrtc** (Kotlin/JNI). That is a multi-week effort and
  **cannot be built, device-tested, and safely shipped to a production APK in one pass** — so it is
  deliberately excluded from this deploy rather than shipped unverified.

Where native genuinely helps and is conflict-free: a **maximum-quality local recording** (Camera2/CameraX
+ MediaRecorder → MP4 at true sensor resolution). But that ALSO needs the camera exclusively, so it's a
"record locally, not simultaneously WebRTC-live" mode unless the pipeline goes fully native.

## Recommended phased native path (separate APK release, with device testing)

- **Phase N1 — `PlajahCamera` Capacitor plugin (CameraX).** `startCapture(surface, {maxQuality})` →
  local MP4 via `MediaRecorder`/`VideoCapture` at the sensor's max profile; `listLenses()` exposes real
  wide/ultrawide/tele `cameraId`s (Camera2 `CameraCharacteristics`) that the WebView cannot enumerate.
  Register in `MainActivity.kt` next to `WatchNextPlugin`. Ship as a **"Record in max quality (native)"**
  mode that is not simultaneously WebRTC-live.
- **Phase N2 — native libwebrtc publish.** Move capture+encode+publish into native so the SAME native
  camera feeds both the local max-quality MP4 and the live WebRTC track. This is the only way to satisfy
  "max-quality native capture *while streaming live*." Large; sequence it deliberately.

Every phase requires an Android device/emulator to verify before it enters a production APK.
