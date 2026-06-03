/**
 * windowsBridgeService.ts — web-side WebView2 bridge for Plajah on Windows.
 *
 * Detected automatically when running inside the WinUI 3 WebView2 shell via
 * the window.__PLAJAH_WINUI__ flag injected by MainWindow.xaml.cs.
 *
 * Two-way communication:
 *   Web → Native  : window.chrome.webview.postMessage(JSON)
 *   Native → Web  : window.chrome.webview.addEventListener('message', …)
 *   Web → Native  : window.chrome.webview.hostObjects.plajahNative.<method>()
 */

// ── Platform detection ──────────────────────────────────────────────────────
export function isWindowsApp(): boolean {
  return !!(window as any).__PLAJAH_WINUI__;
}

export function getWindowsPlatform(): string {
  return (window as any).__PLAJAH_PLATFORM__ ?? 'web';
}

// ── Post a message to the native host ─────────────────────────────────────
function postToNative(msg: object): void {
  try {
    (window as any).chrome?.webview?.postMessage(JSON.stringify(msg));
  } catch (e) {
    console.warn('[WindowsBridge] postToNative failed:', e);
  }
}

// ── Native host object (COM proxy, async-friendly) ───────────────────────
function getNativeHost(): any {
  return (window as any).chrome?.webview?.hostObjects?.plajahNative ?? null;
}

// ── Notifications ─────────────────────────────────────────────────────────
/**
 * Show a Windows toast notification.
 * Falls back to browser Notification API when not on Windows.
 */
export async function showNotification(
  title: string,
  body: string,
  deepLink?: string,
): Promise<void> {
  if (isWindowsApp()) {
    try {
      const host = getNativeHost();
      if (host) await host.showNotification(title, body, deepLink ?? '');
    } catch { /* host object call failed */ }
    return;
  }
  // Browser fallback
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

// ── Now-playing metadata → SMTC (lock screen + taskbar widget) ───────────
export interface TrackInfo {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  isPlaying: boolean;
  positionSeconds?: number;
  durationSeconds?: number;
}

export function updateNowPlaying(info: TrackInfo): void {
  postToNative({ type: 'TRACK_CHANGED', ...info, playing: info.isPlaying });
}

export function clearNowPlaying(): void {
  postToNative({ type: 'TRACK_CHANGED', title: null, playing: false });
}

export function updatePlaybackState(isPlaying: boolean): void {
  postToNative({ type: 'PLAYBACK_STATE', playing: isPlaying });
}

// ── Page context → title bar ──────────────────────────────────────────────
export function setPageTitle(title: string): void {
  if (!isWindowsApp()) return;
  postToNative({ type: 'PAGE_TITLE', title });
}

// ── Auth state → jump list personalisation ────────────────────────────────
export function notifyAuthState(uid: string | null, isSignedIn: boolean): void {
  if (!isWindowsApp()) return;
  try {
    const host = getNativeHost();
    host?.onAuthStateChanged(uid ?? '', isSignedIn);
  } catch { }
}

// ── Listen for native → web messages ─────────────────────────────────────
export type NativeMessageType =
  | 'MEDIA_PLAY' | 'MEDIA_PAUSE' | 'MEDIA_PLAY_PAUSE'
  | 'MEDIA_NEXT' | 'MEDIA_PREV' | 'MEDIA_STOP'
  | 'MEDIA_SEEK' | 'REQUEST_TRACK_INFO'
  | 'DEEP_LINK';

export interface NativeMessage {
  type: NativeMessageType;
  position?: number;  // for MEDIA_SEEK
  path?: string;      // for DEEP_LINK
}

type NativeMessageHandler = (msg: NativeMessage) => void;

const handlers: Set<NativeMessageHandler> = new Set();

let bridgeListenerRegistered = false;

export function onNativeMessage(handler: NativeMessageHandler): () => void {
  handlers.add(handler);
  registerBridgeListener();
  return () => handlers.delete(handler);
}

function registerBridgeListener(): void {
  if (bridgeListenerRegistered || !isWindowsApp()) return;
  bridgeListenerRegistered = true;

  (window as any).chrome?.webview?.addEventListener('message', (e: MessageEvent) => {
    try {
      const msg: NativeMessage = typeof e.data === 'string'
        ? JSON.parse(e.data)
        : e.data;
      handlers.forEach(h => h(msg));
    } catch { }
  });
}

// ── Windows-specific CSS class helper ────────────────────────────────────
/**
 * Adds 'windows-app' class to <body> when running inside the WinUI 3 shell.
 * Lets CSS target Windows-specific layout adjustments:
 *
 *   body.windows-app .some-element { margin-top: 48px; }  // clear title bar
 */
export function applyWindowsBodyClass(): void {
  if (isWindowsApp()) {
    document.body.classList.add('windows-app');
    // Expose platform CSS variable
    document.documentElement.style.setProperty('--platform-titlebar-height', '48px');
  }
}

// ── Auto-initialise on import ─────────────────────────────────────────────
if (typeof window !== 'undefined') {
  applyWindowsBodyClass();
}
