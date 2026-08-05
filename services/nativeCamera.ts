// nativeCamera — web-side bridge to the native PlajahCamera Capacitor plugin.
//
// The Reello live pipeline captures via the WebView's getUserMedia, which is bounded by what
// the System WebView exposes: no true per-lens (wide/ultrawide/tele) selection and no sensor-max
// recording. This bridge lets the web layer ask a NATIVE Camera2/CameraX plugin to (a) enumerate
// the real physical lenses and (b) record a maximum-quality local MP4 — capabilities the WebView
// cannot provide.
//
// SAFE BY DEFAULT: when the native plugin isn't present (every browser, and any APK built before
// the plugin ships) every method reports unavailable / no-ops. So this file compiles and ships
// harmlessly today; it only does anything once the native side (Phase N1) is built into an APK.
//
// See docs/REELLO_NATIVE_CAMERA_PLAN.md for the architecture and why native capture cannot feed
// the LIVE WebRTC stream without native libwebrtc (Phase N2).

export interface NativeLens {
  /** Camera2 physical camera id. */
  id: string;
  /** 'front' | 'back'. */
  facing: 'front' | 'back';
  /** Best-effort lens role from focal length. */
  role?: 'wide' | 'ultrawide' | 'telephoto' | 'standard';
  /** Max recordable resolution for this lens, e.g. "3840x2160". */
  maxResolution?: string;
  label?: string;
}

export interface StartNativeRecordingOptions {
  lensId?: string;
  /** Target the sensor's max supported profile. Default true. */
  maxQuality?: boolean;
  /** Preferred fps (device clamps). */
  fps?: number;
}

export interface NativeRecordingResult {
  /** Filesystem path / content URI of the recorded MP4. */
  path: string;
  bytes?: number;
  durationMs?: number;
  resolution?: string;
}

type PlajahCameraPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  listLenses(): Promise<{ lenses: NativeLens[] }>;
  startRecording(opts: StartNativeRecordingOptions): Promise<{ started: boolean }>;
  stopRecording(): Promise<NativeRecordingResult>;
};

/** Resolve the registered plugin, or null when it isn't present (web / pre-plugin APK). */
function plugin(): PlajahCameraPlugin | null {
  const cap = (globalThis as any).Capacitor;
  const p = cap?.Plugins?.PlajahCamera;
  return p ?? null;
}

/** True only inside an APK whose native side registers PlajahCamera. */
export async function nativeCameraAvailable(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try { return (await p.isAvailable()).available === true; } catch { return false; }
}

/** Real physical lenses (wide/ultrawide/tele) — what the WebView can't enumerate. Empty on web. */
export async function listNativeLenses(): Promise<NativeLens[]> {
  const p = plugin();
  if (!p) return [];
  try { return (await p.listLenses()).lenses ?? []; } catch { return []; }
}

/** Begin a maximum-quality native local recording. Returns false when unavailable. */
export async function startNativeRecording(opts: StartNativeRecordingOptions = {}): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try { return (await p.startRecording({ maxQuality: true, ...opts })).started === true; } catch { return false; }
}

/** Stop native recording and get the on-device file. Null when unavailable / not recording. */
export async function stopNativeRecording(): Promise<NativeRecordingResult | null> {
  const p = plugin();
  if (!p) return null;
  try { return await p.stopRecording(); } catch { return null; }
}
