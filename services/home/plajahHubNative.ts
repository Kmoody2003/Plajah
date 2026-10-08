/**
 * Web-side wrapper for the Android embedded hub (PlajahHubPlugin.kt / PlajahHubService.kt).
 * The hub is Node 18 (nodejs-mobile) running services/home/hubEntry.ts in the app's `:hub` process,
 * listening on http://127.0.0.1:<port>. Use hubRequest() (CapacitorHttp) — a plain fetch() from the
 * https://localhost WebView origin to http://127.0.0.1 is blocked as mixed content.
 */
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';

export interface PlajahHubStatus {
  running: boolean;
  port: number;
  state: 'never-started' | 'starting' | 'running' | 'exited' | 'stopped' | string;
  pid: number | null;
  error: string | null;
  exitCode: number | null;
  startedAt: number | null;
  health: Record<string, unknown> | null;
}

interface PlajahHubPlugin {
  start(o?: { port?: number; foreground?: boolean }): Promise<{ starting: boolean; port: number; foreground: boolean }>;
  stop(): Promise<{ stopped: boolean }>;
  status(): Promise<PlajahHubStatus>;
  getLog(o?: { maxBytes?: number }): Promise<{ log: string }>;
}

export const PlajahHub = registerPlugin<PlajahHubPlugin>('PlajahHub');
export const HUB_DEFAULT_PORT = 8786;

export function embeddedHubAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PlajahHub');
}

/** Starts the hub (no-op if already running) and waits until /health answers. */
export async function ensureEmbeddedHub(opts: { port?: number; foreground?: boolean; timeoutMs?: number } = {}): Promise<PlajahHubStatus> {
  let st = await PlajahHub.status();
  if (st.running) return st;
  await PlajahHub.start({ port: opts.port ?? HUB_DEFAULT_PORT, foreground: opts.foreground ?? false });
  const deadline = Date.now() + (opts.timeoutMs ?? 15000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    st = await PlajahHub.status();
    if (st.running || st.state === 'exited') return st;
  }
  return st;
}

/** HTTP to the embedded hub through the native stack (no CORS / mixed-content limits). */
export async function hubRequest<T = unknown>(path: string, init: { method?: string; data?: unknown; port?: number } = {}): Promise<{ status: number; data: T }> {
  const r = await CapacitorHttp.request({
    url: `http://127.0.0.1:${init.port ?? HUB_DEFAULT_PORT}${path}`,
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    data: init.data,
    connectTimeout: 3000,
    readTimeout: 30000,
  });
  return { status: r.status, data: r.data as T };
}
