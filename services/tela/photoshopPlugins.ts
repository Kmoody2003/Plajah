/**
 * photoshopPlugins.ts — run Photoshop filter plug-ins (.8bf) on pixels from Tela.
 *
 * Only the Plajah desktop app can do this: the WinUI shell runs each filter in the
 * crash-isolated plajah-8bf-host sidecar (WindowsPhotoshopPluginService.cs). Nothing
 * here throws for expected failures; callers get a result with a user-readable reason.
 * RGBA is straight (not premultiplied), 8 bits per channel, top row first.
 */

export interface PhotoshopPlugin {
  /** Pass to runPhotoshopPlugin. Opaque; stable while the file stays in place. */
  id: string;
  name: string;
  /** Photoshop's menu group. Adobe's internal filters use names like "**Hidden**". */
  category: string;
  entry: string;
  path: string;
}

export interface SkippedPlugin {
  path: string;
  reason: string;
}

export type PluginListResult =
  | { ok: true; plugins: PhotoshopPlugin[]; skipped: SkippedPlugin[] }
  | { ok: false; reason: string };

export interface RunPluginOptions {
  /** Let the filter open its own dialog. Default false. */
  showUi?: boolean;
  /** Saved settings: `parameters` from an earlier successful run of the same plug-in. */
  parameters?: string;
  /** Aborting asks the filter to stop, then ends the sidecar five seconds later. */
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export type RunPluginResult =
  | { ok: true; rgba: Uint8ClampedArray; width: number; height: number; parameters: string }
  | { ok: false; cancelled: boolean; crashed: boolean; reason: string; detail?: string };

const NOT_DESKTOP = 'Photoshop plug-ins run only in the Plajah desktop app for Windows.';
const NO_HOST = 'The Photoshop plug-in host is not installed with this build of Plajah.';
const CHUNK_BYTES = 4 * 1024 * 1024;
const QUICK_MS = 30_000;
const SCAN_MS = 90_000;

function bridge(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).chrome?.webview ?? null;
}

function request<T>(
  type: string,
  replyType: string,
  payload: object = {},
  matches?: (message: any) => boolean,
  timeoutMs: number | null = QUICK_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const webview = bridge();
    if (!webview) { reject(new Error(NOT_DESKTOP)); return; }
    const timer = timeoutMs === null ? null : setTimeout(() => {
      webview.removeEventListener('message', onMessage);
      reject(new Error('The desktop app did not answer.'));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      let message: any;
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (message?.type !== replyType || (matches && !matches(message))) return;
      if (timer !== null) clearTimeout(timer);
      webview.removeEventListener('message', onMessage);
      resolve(message as T);
    };
    webview.addEventListener('message', onMessage);
    webview.postMessage(JSON.stringify({ type, ...payload }));
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(binary);
}

function fromBase64Into(text: string, target: Uint8ClampedArray, offset: number): number {
  const binary = atob(text);
  for (let i = 0; i < binary.length; i++) target[offset + i] = binary.charCodeAt(i);
  return binary.length;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when this is the desktop app and its build includes the plug-in host. */
export async function isPluginHostAvailable(): Promise<boolean> {
  if (!bridge()) return false;
  try {
    const reply = await request<{ available: boolean }>('PS_PLUGIN_STATUS', 'PS_PLUGIN_STATUS_RESULT', {}, undefined, 5_000);
    return !!reply.available;
  } catch {
    return false;
  }
}

/** Scan the plug-in folders. Reads resources only; no plug-in code runs. */
export async function listPhotoshopPlugins(): Promise<PluginListResult> {
  if (!bridge()) return { ok: false, reason: NOT_DESKTOP };
  if (!(await isPluginHostAvailable())) return { ok: false, reason: NO_HOST };
  try {
    const reply = await request<{ success: boolean; plugins: PhotoshopPlugin[]; skipped: SkippedPlugin[]; error?: string }>(
      'PS_PLUGIN_SCAN', 'PS_PLUGIN_SCAN_RESULT', {}, undefined, SCAN_MS);
    if (!reply.success) return { ok: false, reason: reply.error || 'The plug-in scan failed.' };
    return { ok: true, plugins: reply.plugins, skipped: reply.skipped };
  } catch (error) {
    return { ok: false, reason: message(error) };
  }
}

export async function listPluginFolders(): Promise<string[]> {
  if (!bridge()) return [];
  try {
    return (await request<{ directories: string[] }>('PS_PLUGIN_LIST_DIRECTORIES', 'PS_PLUGIN_DIRECTORIES')).directories;
  } catch {
    return [];
  }
}

/** Opens the native folder picker. Resolves to the updated list; unchanged if the user cancels. */
export async function addPluginFolder(): Promise<string[]> {
  if (!bridge()) return [];
  try {
    return (await request<{ directories: string[] }>('PS_PLUGIN_ADD_DIRECTORY', 'PS_PLUGIN_DIRECTORIES', {}, undefined, null)).directories;
  } catch {
    return [];
  }
}

export async function removePluginFolder(path: string): Promise<string[]> {
  if (!bridge()) return [];
  try {
    return (await request<{ directories: string[] }>('PS_PLUGIN_REMOVE_DIRECTORY', 'PS_PLUGIN_DIRECTORIES', { path })).directories;
  } catch {
    return [];
  }
}

/**
 * Run a filter over a whole image. The input is left untouched; on success `rgba` is a
 * new array of the same size. Alpha is kept when the filter does not edit transparency.
 */
export async function runPhotoshopPlugin(
  pluginId: string,
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: RunPluginOptions = {},
): Promise<RunPluginResult> {
  const failed = (reason: string, extra: Partial<{ cancelled: boolean; crashed: boolean; detail: string }> = {}): RunPluginResult =>
    ({ ok: false, cancelled: false, crashed: false, reason, ...extra });

  if (!bridge()) return failed(NOT_DESKTOP);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return failed('The image size is not valid.');
  if (rgba.length !== width * height * 4) return failed(`Expected ${width * height * 4} bytes of RGBA, got ${rgba.length}.`);
  if (options.signal?.aborted) return failed('Cancelled.', { cancelled: true });

  const runId = crypto.randomUUID();
  const forRun = (m: any) => m.runId === runId;
  const onAbort = () => { void request('PS_PLUGIN_ABORT', 'PS_PLUGIN_ABORT_RESULT', { runId }, forRun).catch(() => {}); };
  options.signal?.addEventListener('abort', onAbort);
  try {
    const bytes = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length);
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      const reply = await request<{ success: boolean; error?: string }>(
        'PS_PLUGIN_UPLOAD', 'PS_PLUGIN_UPLOAD_RESULT',
        { runId, offset, data: toBase64(bytes.subarray(offset, offset + CHUNK_BYTES)) },
        (m) => forRun(m) && m.offset === offset,
      );
      if (!reply.success) return failed(reply.error || 'The image did not reach the plug-in host.');
      if (options.signal?.aborted) return failed('Cancelled.', { cancelled: true });
      options.onProgress?.(0.25 * Math.min(1, (offset + CHUNK_BYTES) / bytes.length));
    }

    // No timeout from here: a filter's dialog waits on the user. The native side ends
    // runs without a dialog after five minutes.
    const run = await request<{
      success: boolean; cancelled: boolean; crashed: boolean; error?: string; detail?: string;
      width: number; height: number; byteLength: number; parameters?: string;
    }>('PS_PLUGIN_RUN', 'PS_PLUGIN_RUN_RESULT',
      { runId, pluginId, width, height, parameters: options.parameters, showUi: !!options.showUi }, forRun, null);

    if (run.cancelled) return failed('Cancelled.', { cancelled: true });
    if (!run.success) {
      return failed(run.error || 'The filter failed.', { crashed: !!run.crashed, detail: run.detail ?? undefined });
    }
    if (run.byteLength !== rgba.length) return failed('The filter returned an image of the wrong size.');
    options.onProgress?.(0.75);

    const out = new Uint8ClampedArray(run.byteLength);
    for (let offset = 0; offset < out.length; offset += CHUNK_BYTES) {
      const chunk = await request<{ success: boolean; data?: string; error?: string }>(
        'PS_PLUGIN_DOWNLOAD', 'PS_PLUGIN_DOWNLOAD_RESULT',
        { runId, offset, length: CHUNK_BYTES },
        (m) => forRun(m) && m.offset === offset,
      );
      if (!chunk.success || !chunk.data) return failed(chunk.error || 'The result could not be read back.');
      fromBase64Into(chunk.data, out, offset);
      options.onProgress?.(0.75 + 0.25 * Math.min(1, (offset + CHUNK_BYTES) / out.length));
    }
    return { ok: true, rgba: out, width: run.width, height: run.height, parameters: run.parameters ?? '' };
  } catch (error) {
    return failed(message(error));
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    void request('PS_PLUGIN_RELEASE', 'PS_PLUGIN_RELEASE_RESULT', { runId }, forRun).catch(() => {});
  }
}
