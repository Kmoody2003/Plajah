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
  if (typeof window === 'undefined') return false;
  return !!(
    (window as any).__PLAJAH_WINUI__ ||
    (window as any).__PLAJAH_PLATFORM__ === 'windows' ||
    (window as any).chrome?.webview
  );
}

export function getWindowsPlatform(): string {
  return typeof window !== 'undefined' ? ((window as any).__PLAJAH_PLATFORM__ ?? 'web') : 'server';
}

// ── Post a message to the native host ─────────────────────────────────────
export function postToNative(msg: object): void {
  try {
    (window as any).chrome?.webview?.postMessage(JSON.stringify(msg));
  } catch (e) {
    console.warn('[WindowsBridge] postToNative failed:', e);
  }
}

/** Public export of the native bridge message sender. */
export const postNativeMessage = postToNative;

/** Initiate native Windows window move/drag loop on pointerdown */
export function startWindowDrag(): void {
  postToNative({ type: 'WINDOW_DRAG' });
}

/** Minimize native window */
export function minimizeWindow(): void {
  postToNative({ type: 'WINDOW_MINIMIZE' });
}

/** Maximize or restore native window */
export function maximizeWindow(): void {
  postToNative({ type: 'WINDOW_MAXIMIZE' });
}

/** Restore native window from maximized state */
export function restoreWindow(): void {
  postToNative({ type: 'WINDOW_RESTORE' });
}

/** Close native window */
export function closeWindow(): void {
  postToNative({ type: 'WINDOW_CLOSE' });
}

/** Toggle full-screen mode on native window */
export function toggleNativeFullscreen(): void {
  postToNative({ type: 'WINDOW_FULLSCREEN_TOGGLE' });
}

/** Set full-screen mode explicitly */
export function setNativeFullscreen(fullscreen: boolean): void {
  postToNative({ type: 'WINDOW_FULLSCREEN_SET', fullscreen });
}

/** Request current window state (isMaximized, isFullscreen) */
export function requestWindowState(): void {
  postToNative({ type: 'GET_WINDOW_STATE' });
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

export interface WindowsHelloStatus {
  supported: boolean;
  available: boolean;
  reason: string;
}

export interface WindowsHelloResult {
  verified: boolean;
  reason: string;
}

/** Ask the WinUI shell whether Windows Hello is configured on this device. */
export function checkWindowsHello(): Promise<WindowsHelloStatus> {
  if (!isWindowsApp()) {
    return Promise.resolve({ supported: false, available: false, reason: 'not-windows-app' });
  }
  return requestNativeResponse<WindowsHelloStatus>('HELLO_CHECK', 'WINDOWS_HELLO_STATUS');
}

/** Show the OS biometric/PIN prompt. Hello never replaces Firebase identity. */
export function verifyWindowsHello(message?: string): Promise<WindowsHelloResult> {
  if (!isWindowsApp()) {
    return Promise.resolve({ verified: false, reason: 'not-windows-app' });
  }
  return requestNativeResponse<WindowsHelloResult>('HELLO_VERIFY', 'WINDOWS_HELLO_RESULT', { message });
}

export interface WindowsAccelerationProfile {
  architecture: string;
  video: {
    nvenc: boolean;
    nvdec: boolean;
    quickSync: boolean;
    oneVpl: boolean;
    qualcommMft?: boolean;
    arm64MediaFoundation?: boolean;
  };
  ai: { directMl: boolean; cudaRuntime: boolean; tensorRt: boolean; detectedProviders: string[] };
  hardware: {
    nvidiaDriver: boolean;
    intelMediaRuntime: boolean;
    npuRuntime: boolean;
    isArm64?: boolean;
    isQualcomm?: boolean;
    isSurfaceProX?: boolean;
    processorName?: string;
    systemModel?: string;
  };
  status: 'probe-only' | string;
}

/** Probe installed Windows acceleration runtimes without claiming initialization. */
export function getWindowsAccelerationProfile(): Promise<WindowsAccelerationProfile> {
  if (!isWindowsApp()) {
    return Promise.reject(new Error('Windows acceleration is unavailable outside the WinUI app'));
  }
  return requestNativeResponse<WindowsAccelerationProfile>('ACCELERATION_CHECK', 'ACCELERATION_PROFILE');
}

export interface GpuHardwareProfile {
  gpuName: string;
  dedicatedVramMb: number;
  hasCuda: boolean;
  hasNvenc: boolean;
  hasTensorRt: boolean;
  hasDirectMl: boolean;
  hasMaxine: boolean;
  architecture: string;
  status: string;
}

export interface StemSeparationResult {
  success: boolean;
  vocalsPath: string;
  drumsPath: string;
  bassPath: string;
  otherPath: string;
  message: string;
}

export interface LlmResponseResult {
  text: string;
  tokensUsed: number;
  backend: string;
  success: boolean;
}

/** Probe GPU hardware specifically for NVIDIA RTX, VRAM, and AI engine capabilities. */
export function getGpuHardwareProfile(): Promise<GpuHardwareProfile> {
  if (!isWindowsApp()) {
    return Promise.resolve({
      gpuName: 'Browser WebGPU/Software',
      dedicatedVramMb: 0,
      hasCuda: false,
      hasNvenc: false,
      hasTensorRt: false,
      hasDirectMl: false,
      hasMaxine: false,
      architecture: 'browser',
      status: 'web-fallback',
    });
  }
  return requestNativeResponse<GpuHardwareProfile>('AI_PROFILE_CHECK', 'AI_HARDWARE_PROFILE');
}

/** Execute Demucs 4-stem separation natively via WinUI shell. */
export function invokeNativeStemSeparation(
  audioPath: string,
  onProgress?: (p: number) => void,
): Promise<StemSeparationResult> {
  if (!isWindowsApp()) {
    return Promise.reject(new Error('Native stem separation only available in Windows app'));
  }
  if (onProgress) {
    const webview = (window as any).chrome?.webview;
    const progressHandler = (event: MessageEvent) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg?.type === 'STEM_SEPARATION_PROGRESS' && typeof msg.progress === 'number') {
          onProgress(msg.progress);
        }
      } catch {}
    };
    webview?.addEventListener('message', progressHandler);
  }
  return requestNativeResponse<StemSeparationResult>(
    'STEM_SEPARATION_REQUEST',
    'STEM_SEPARATION_RESULT',
    { audioPath }
  );
}

/** Invoke on-device Nemotron model via WinUI shell. */
export function invokeNativeLlm(prompt: string, systemPrompt?: string): Promise<LlmResponseResult> {
  if (!isWindowsApp()) {
    return Promise.reject(new Error('Native LLM only available in Windows app'));
  }
  return requestNativeResponse<LlmResponseResult>(
    'LOCAL_LLM_REQUEST',
    'LOCAL_LLM_RESULT',
    { prompt, systemPrompt }
  );
}

export interface WindowsVstPlugin {
  name: string;
  path: string;
  format: 'vst3' | string;
}

export async function listWindowsVstDirectories(): Promise<string[]> {
  if (!isWindowsApp()) return [];
  const result = await requestNativeResponse<{ directories: string[] }>(
    'VST_LIST_DIRECTORIES', 'VST_DIRECTORIES');
  return result.directories;
}

export async function addWindowsVstDirectory(path: string): Promise<string[]> {
  if (!isWindowsApp()) return [];
  const result = await requestNativeResponse<{ directories: string[] }>(
    'VST_ADD_DIRECTORY', 'VST_DIRECTORIES', { path });
  return result.directories;
}

export async function removeWindowsVstDirectory(path: string): Promise<string[]> {
  if (!isWindowsApp()) return [];
  const result = await requestNativeResponse<{ directories: string[] }>(
    'VST_REMOVE_DIRECTORY', 'VST_DIRECTORIES', { path });
  return result.directories;
}

export async function scanWindowsVst3(): Promise<WindowsVstPlugin[]> {
  if (!isWindowsApp()) return [];
  const result = await requestNativeResponse<{ plugins: WindowsVstPlugin[] }>(
    'VST_SCAN', 'VST_SCAN_RESULT');
  return result.plugins;
}

export interface WindowsAudioDevice {
  id: string;
  name: string;
  driverType: 'ASIO' | 'WASAPI_EXCLUSIVE' | 'WASAPI_SHARED' | 'DEFAULT';
  supportedSampleRates: number[];
  minBufferFrames: number;
  maxChannels: number;
  isDefault: boolean;
}

export async function listWindowsAudioDevices(): Promise<WindowsAudioDevice[]> {
  if (!isWindowsApp()) {
    return [
      {
        id: 'web:default',
        name: 'Standard System Audio Output',
        driverType: 'DEFAULT',
        supportedSampleRates: [44100, 48000],
        minBufferFrames: 256,
        maxChannels: 2,
        isDefault: true,
      },
    ];
  }
  const result = await requestNativeResponse<{ devices: WindowsAudioDevice[] }>(
    'AUDIO_DEVICE_LIST',
    'AUDIO_DEVICE_LIST_RESULT'
  );
  return result.devices;
}

export async function selectWindowsAudioDevice(
  deviceId: string,
  driverType: 'ASIO' | 'WASAPI_EXCLUSIVE' | 'WASAPI_SHARED' = 'WASAPI_EXCLUSIVE'
): Promise<boolean> {
  if (!isWindowsApp()) return true;
  const result = await requestNativeResponse<{ success: boolean }>(
    'AUDIO_DEVICE_SELECT',
    'AUDIO_DEVICE_SELECT_RESULT',
    { deviceId, driverType }
  );
  return result.success;
}

export interface WindowsPickedFile {
  name: string;
  relativePath?: string;
  fullPath: string;
  folderPath?: string;
  size: number;
  lastModified?: number;
  url: string;
  mediaKind?: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'UNKNOWN';
  kind?: 'VIDEO' | 'AUDIO' | 'IMAGE';
}

export interface WindowsPickedFolderResult {
  cancelled: boolean;
  folderPath?: string;
  folderName?: string;
  files?: WindowsPickedFile[];
  error?: string;
}

export interface WindowsPickedFileResult {
  cancelled: boolean;
  name?: string;
  fullPath?: string;
  folderPath?: string;
  size?: number;
  lastModified?: number;
  url?: string;
  error?: string;
}

/**
 * Open native WinUI 3 FolderPicker to choose a folder.
 * Returns the folder path, folder name, and discovered media files with virtual URLs.
 */
export async function pickWindowsFolder(): Promise<WindowsPickedFolderResult | null> {
  if (!isWindowsApp()) return null;
  return requestNativeResponse<WindowsPickedFolderResult>('PICK_FOLDER', 'PICK_FOLDER_RESULT');
}

/**
 * Open native WinUI 3 FileOpenPicker to choose a file.
 * Returns the file path, metadata, and mapped virtual URL.
 */
export async function pickWindowsFile(): Promise<WindowsPickedFileResult | null> {
  if (!isWindowsApp()) return null;
  return requestNativeResponse<WindowsPickedFileResult>('PICK_FILE', 'PICK_FILE_RESULT');
}

/**
 * Read binary bytes for a local Windows file via native bridge.
 */
export async function readWindowsFileBytes(path: string): Promise<Uint8Array | null> {
  if (!isWindowsApp()) return null;
  const res = await requestNativeResponse<{ success: boolean; path: string; base64?: string }>(
    'READ_FILE_BYTES', 'READ_FILE_BYTES_RESULT', { path });
  if (res.success && res.base64) {
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return null;
}

/**
 * Helper to convert a WindowsPickedFile into a DOM File object so it can be passed
 * directly into existing mediaStore / blob / relink pipelines.
 */
export async function convertWindowsPickedFileToFile(picked: WindowsPickedFile): Promise<File> {
  try {
    const resp = await fetch(picked.url);
    if (resp.ok) {
      const blob = await resp.blob();
      return new File([blob], picked.name, {
        type: blob.type || 'application/octet-stream',
        lastModified: picked.lastModified || Date.now(),
      });
    }
  } catch (e) {
    console.warn('[WindowsBridge] fetch virtual url failed, falling back to bridge bytes:', e);
  }

  // Fallback: read bytes via bridge
  const bytes = await readWindowsFileBytes(picked.fullPath);
  if (bytes) {
    return new File([bytes], picked.name, {
      lastModified: picked.lastModified || Date.now(),
    });
  }

  throw new Error(`Unable to read file content for ${picked.fullPath}`);
}


export interface WindowsLibraryScanResult {
  success: boolean;
  libraryType?: 'pictures' | 'videos' | 'music' | 'downloads' | 'desktop' | string;
  folderPath: string;
  folderName: string;
  files: WindowsPickedFile[];
  subfolders?: string[];
  error?: string;
}

/**
 * Automatically scan Windows KnownFolders (Pictures, Videos, Music, Downloads, Desktop)
 * or any arbitrary directory path on disk without requiring a dialog prompt.
 * Maps localmedia.plajah virtual host for high-speed streaming.
 */
export async function scanWindowsLibrary(
  libraryType: 'pictures' | 'videos' | 'music' | 'downloads' | 'desktop' | string = 'videos',
  folderPath?: string
): Promise<WindowsLibraryScanResult> {
  if (!isWindowsApp()) {
    return {
      success: false,
      libraryType,
      folderPath: folderPath || '',
      folderName: '',
      files: [],
      error: 'Not running in Windows application shell'
    };
  }
  return requestNativeResponse<WindowsLibraryScanResult>(
    'SCAN_WINDOWS_LIBRARY',
    'SCAN_WINDOWS_LIBRARY_RESULT',
    { libraryType, folderPath }
  );
}

/**
 * Open Windows File Explorer and highlight/select the specified file or directory.
 */
export async function showInExplorer(filePath: string): Promise<boolean> {
  if (!isWindowsApp() || !filePath) return false;
  try {
    const res = await requestNativeResponse<{ success: boolean; filePath: string }>(
      'SHOW_IN_EXPLORER',
      'SHOW_IN_EXPLORER_RESULT',
      { filePath }
    );
    return !!res?.success;
  } catch {
    return false;
  }
}

/**
 * Set a local photo file as Windows Desktop Wallpaper.
 */
export async function setAsWallpaper(filePath: string): Promise<boolean> {
  if (!isWindowsApp() || !filePath) return false;
  try {
    const res = await requestNativeResponse<{ success: boolean; filePath: string }>(
      'SET_AS_WALLPAPER',
      'SET_AS_WALLPAPER_RESULT',
      { filePath }
    );
    return !!res?.success;
  } catch {
    return false;
  }
}

/**
 * Safely delete a local file on Windows.
 */
export async function deleteLocalFile(filePath: string): Promise<boolean> {
  if (!isWindowsApp() || !filePath) return false;
  try {
    const res = await requestNativeResponse<{ success: boolean; filePath: string }>(
      'DELETE_FILE',
      'DELETE_FILE_RESULT',
      { filePath }
    );
    return !!res?.success;
  } catch {
    return false;
  }
}

export interface SaveImageResult {
  success: boolean;
  originalPath?: string;
  savedPath?: string;
  fileName?: string;
  size?: number;
  lastModified?: number;
  url?: string;
  error?: string;
}

/**
 * Save image base64 data directly to a local Windows file (overwrite original or save copy).
 */
export async function saveLocalImageFile(
  filePath: string,
  base64Data: string,
  overwrite: boolean = false
): Promise<SaveImageResult> {
  if (!isWindowsApp() || !filePath || !base64Data) {
    return { success: false, error: 'Windows app bridge required' };
  }
  return requestNativeResponse<SaveImageResult>(
    'SAVE_IMAGE_FILE',
    'SAVE_IMAGE_FILE_RESULT',
    { filePath, base64Data, overwrite }
  );
}

// ── Pro Studio Platform Engine (Fabula, Melos, Pixels, Ambo, Tela) ────────
export interface StudioDisplayInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
  workAreaWidth?: number;
  workAreaHeight?: number;
  left?: number;
  top?: number;
  scaleFactor?: number;
  refreshRate?: number;
  aspectRatio?: string;
  resolutionLabel?: string;
}

/**
 * Enumerate connected displays on Windows for Studio Clean-Feed routing and Ambo output auto-detection.
 */
export async function getStudioDisplays(): Promise<StudioDisplayInfo[]> {
  if (!isWindowsApp()) return [];
  try {
    const res = await requestNativeResponse<{ displays: StudioDisplayInfo[] }>(
      'STUDIO_DISPLAYS_QUERY', 'STUDIO_DISPLAYS_RESULT');
    return res?.displays || [];
  } catch {
    return [];
  }
}

export interface StudioCleanFeedOptions {
  displayIndex?: number;
  feedUrl: string;
  title?: string;
  width?: number;
  height?: number;
}

/**
 * Open full-screen hardware Clean-Feed monitor on secondary display.
 * Used by Fabula (video monitor), Pixels (motion graphics), and Ambo (live broadcast).
 */
export async function openStudioCleanFeed(options: StudioCleanFeedOptions): Promise<boolean> {
  if (!isWindowsApp()) return false;
  try {
    const res = await requestNativeResponse<{ active: boolean; displayIndex: number }>(
      'STUDIO_CLEAN_FEED_OPEN', 'STUDIO_CLEAN_FEED_STATUS', options);
    return !!res?.active;
  } catch {
    return false;
  }
}

/**
 * Close active Studio Clean-Feed window.
 */
export function closeStudioCleanFeed(): void {
  if (!isWindowsApp()) return;
  postToNative({ type: 'STUDIO_CLEAN_FEED_CLOSE' });
}

export interface DiscoveredNdiStream {
  id: string;
  name: string;
  url: string;
  machineName: string;
  streamName: string;
  width: number;
  height: number;
  fps: number;
  status: string;
  discoveryMethod: string;
}

/**
 * Perform a direct NDI scan across LAN and NDI 6 runtime via WinUI shell.
 */
export async function scanWindowsNdiStreams(): Promise<DiscoveredNdiStream[]> {
  if (!isWindowsApp()) return [];
  try {
    const res = await requestNativeResponse<{ streams: DiscoveredNdiStream[] }>(
      'NDI_SCAN_REQUEST', 'NDI_SCAN_RESULT');
    return res?.streams || [];
  } catch {
    return [];
  }
}

export type TaskbarProgressState = 'normal' | 'indeterminate' | 'error' | 'paused' | 'none';

/**
 * Update Windows Taskbar export/render progress bar.
 * Used by Fabula (render queue), Melos (audio bounce), Pixels (scene render), Tela (export).
 */
export function setStudioTaskbarProgress(progress: number, state: TaskbarProgressState = 'normal'): void {
  if (!isWindowsApp()) return;
  postToNative({ type: 'STUDIO_TASKBAR_PROGRESS', progress, state });
}

export interface ThumbnailResultItem {
  filePath: string;
  dataUrl?: string;
  success: boolean;
}

/**
 * Hardware-accelerated batch thumbnail extraction for video and audio files using Windows Media Foundation.
 * Bypasses browser HTML video decoder caps; extracts instant poster frames directly from disk cache.
 */
export async function extractStudioThumbnails(paths: string[], targetSize: number = 320): Promise<ThumbnailResultItem[]> {
  if (!isWindowsApp() || !paths.length) return [];
  try {
    const res = await requestNativeResponse<{ thumbnails: ThumbnailResultItem[] }>(
      'STUDIO_EXTRACT_THUMBNAILS', 'STUDIO_EXTRACT_THUMBNAILS_RESULT', { paths, targetSize });
    return res?.thumbnails || [];
  } catch {
    return [];
  }
}

function requestNativeResponse<T>(requestType: string, responseType: string, payload: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const webview = (window as any).chrome?.webview;
    if (!webview) {
      reject(new Error('Windows WebView2 bridge is unavailable'));
      return;
    }
    const timeout = window.setTimeout(() => {
      webview.removeEventListener('message', onMessage);
      reject(new Error(`Windows native request timed out: ${requestType}`));
    }, 30_000);
    const onMessage = (event: MessageEvent) => {
      let message: any;
      try {
        message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (message?.type !== responseType) return;
      window.clearTimeout(timeout);
      webview.removeEventListener('message', onMessage);
      resolve(message as T);
    };
    webview.addEventListener('message', onMessage);
    postToNative({ type: requestType, ...payload });
  });
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

export type NativeMessageType =
  | 'MEDIA_PLAY' | 'MEDIA_PAUSE' | 'MEDIA_PLAY_PAUSE'
  | 'MEDIA_NEXT' | 'MEDIA_PREV' | 'MEDIA_STOP'
  | 'MEDIA_SEEK' | 'REQUEST_TRACK_INFO'
  | 'DEEP_LINK'
  | 'NATIVE_FILES_DROPPED'
  | 'HARDWARE_JOG_EVENT'
  | 'OPEN_MEDIA_FILE'
  | 'LAUNCH_EXPERIENCE';

export interface NativeDroppedFile {
  name: string;
  fullPath: string;
  folderPath?: string;
  relativePath?: string;
  size: number;
  lastModified: number;
  url: string;
}

export interface HardwareJogEvent {
  deltaFrames: number;
  direction: number; // 1 = forward, -1 = reverse
  mode: 'jog' | 'shuttle';
  action?: 'step_forward' | 'step_backward' | 'shuttle_fast_forward' | 'shuttle_fast_reverse' | 'toggle_play';
}

export interface NativeMessage {
  type: NativeMessageType;
  mediaKind?: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'UNKNOWN';
  position?: number;  // for MEDIA_SEEK
  path?: string;      // for DEEP_LINK
  experience?: string; // for LAUNCH_EXPERIENCE (launcher-icon slug, see src/lib/launchTarget.ts)
  files?: NativeDroppedFile[]; // for NATIVE_FILES_DROPPED
  activeFile?: WindowsPickedFile; // for OPEN_MEDIA_FILE
  folderFiles?: WindowsPickedFile[]; // for OPEN_MEDIA_FILE
  deltaFrames?: number; // for HARDWARE_JOG_EVENT
  direction?: number;   // for HARDWARE_JOG_EVENT
  mode?: 'jog' | 'shuttle'; // for HARDWARE_JOG_EVENT
  action?: string;      // for HARDWARE_JOG_EVENT
}

/**
 * Register a listener for when Windows launches or redirects a media file into Plajah
 * (e.g. user double-clicked an image/video/audio in Windows File Explorer).
 */
export function onMediaFileActivated(
  callback: (payload: {
    activeFile: WindowsPickedFile;
    folderFiles: WindowsPickedFile[];
    mediaKind?: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'UNKNOWN';
  }) => void
): () => void {
  return onNativeMessage((msg) => {
    if (msg.type === 'OPEN_MEDIA_FILE' && msg.activeFile) {
      const kind = msg.mediaKind || msg.activeFile.mediaKind;
      callback({
        activeFile: msg.activeFile,
        folderFiles: msg.folderFiles || [msg.activeFile],
        mediaKind: kind,
      });
    }
  });
}

/**
 * Dispatch a virtual or controller jog/shuttle action into the native Studio bridge.
 */
export function dispatchStudioJog(
  deltaTicks: number,
  isShuttle: boolean = false,
  action?: string
): void {
  if (!isWindowsApp()) return;
  postToNative({
    type: 'STUDIO_DISPATCH_JOG',
    deltaTicks,
    isShuttle,
    action
  });
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
