/**
 * liveMuxRelay — host side of Reello Live → Mux (server: services/liveMuxRelayServer.ts).
 *
 * Encodes the recorder's PROGRAM (host + guests composed, everyone's audio mixed) with a SECOND,
 * lighter MediaRecorder (~2.5 Mbps, vs the 8 Mbps archival recording) and streams it over a
 * WebSocket to the relay, which pushes it to Mux. The audience then watches Mux HLS on Plajah.
 *
 * WebSockets go straight to Cloud Run: Firebase Hosting does not proxy upgrades. Override the origin
 * with VITE_LIVE_RELAY_ORIGIN; local dev (Express serves the app) uses the page's own origin.
 *
 * Resilience: Cloud Run ends every request at its --timeout, networks drop, phones switch cells —
 * the relay reconnects with backoff and starts a FRESH MediaRecorder each time (a new ffmpeg needs a
 * new WebM header). The server reuses the same Mux live stream, so viewers see one continuous live.
 * If the relay is unavailable / busy / refused, status says so and the stream simply stays P2P.
 */

export type MuxRelayStatus = 'off' | 'connecting' | 'live' | 'reconnecting' | 'unavailable' | 'denied' | 'ended';

const PROD_RELAY_ORIGIN = 'wss://plajah-api-6zybxwxfqa-uw.a.run.app';
const PATH = '/api/live/mux-relay';
const MAX_BACKOFF_MS = 15_000;
const BACKLOG_LIMIT = 6 * 1024 * 1024;   // ~20 s of program at 2.5 Mbps buffered → uplink can't keep up

export function relayOrigin(): string {
  const env = (import.meta as any).env?.VITE_LIVE_RELAY_ORIGIN as string | undefined;
  if (env) return env.replace(/\/$/, '');
  if (typeof location === 'undefined') return PROD_RELAY_ORIGIN;
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return location.origin.replace(/^http/, 'ws');
  return PROD_RELAY_ORIGIN;
}

function pickMime(): string {
  const c = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
  return c.find(m => (window as any).MediaRecorder?.isTypeSupported?.(m)) || '';
}

export interface MuxRelayHandle {
  /** The host ended the live: tell the server to tear the Mux stream down. */
  end(): void;
  /** Stop relaying without ending the Mux stream (e.g. unmount during reconnect). */
  stop(): void;
}

export function startMuxRelay(opts: {
  streamId: string;
  program: () => Promise<MediaStream> | null;
  getToken: () => Promise<string | null>;
  onStatus?: (s: MuxRelayStatus, detail?: string) => void;
  videoBitsPerSecond?: number;
}): MuxRelayHandle {
  let ws: WebSocket | null = null;
  let rec: MediaRecorder | null = null;
  let stopped = false;
  let backoff = 1000;
  let retryTimer = 0;
  const status = (s: MuxRelayStatus, d?: string) => { try { opts.onStatus?.(s, d); } catch { /* */ } };

  const stopRecorder = () => { try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* */ } rec = null; };

  async function connect(isRetry: boolean) {
    if (stopped) return;
    status(isRetry ? 'reconnecting' : 'connecting');
    const programP = opts.program();
    if (!programP) { retry(); return; }
    const [program, token] = await Promise.all([programP, opts.getToken()]);
    if (stopped) return;
    if (!token) { status('denied', 'Sign in again to go live.'); return; }
    const mime = pickMime();
    let sock: WebSocket;
    try { sock = new WebSocket(`${relayOrigin()}${PATH}?streamId=${encodeURIComponent(opts.streamId)}`); }
    catch { retry(); return; }
    sock.binaryType = 'arraybuffer';
    ws = sock;
    let ready = false;
    let terminal = false;
    sock.onopen = () => sock.send(JSON.stringify({ type: 'hello', token, mime }));
    sock.onmessage = ev => {
      if (typeof ev.data !== 'string') return;
      let msg: any; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'ready') {
        ready = true; backoff = 1000;
        status('live');
        // A fresh recorder per connection: the server's new ffmpeg needs a new WebM header.
        stopRecorder();
        try {
          rec = new MediaRecorder(program, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: opts.videoBitsPerSecond ?? 2_500_000, audioBitsPerSecond: 160_000 });
        } catch (e: any) { status('unavailable', 'This device cannot encode the live program.'); terminal = true; sock.close(); return; }
        rec.ondataavailable = e => {
          if (!e.data.size || sock.readyState !== WebSocket.OPEN) return;
          if (sock.bufferedAmount > BACKLOG_LIMIT) {
            // Uplink is falling behind — reconnecting restarts the encoder fresh instead of drifting
            // further and further behind real time.
            console.warn('[mux-relay] uplink backlog, restarting relay');
            sock.close(4000, 'backlog');
            return;
          }
          e.data.arrayBuffer().then(b => { if (sock.readyState === WebSocket.OPEN) sock.send(b); }).catch(() => {});
        };
        rec.start(500);
      } else if (msg.type === 'unavailable' || msg.type === 'busy') {
        terminal = true; status('unavailable', msg.reason);
      } else if (msg.type === 'denied') {
        terminal = true; status('denied', msg.reason);
      }
    };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      stopRecorder();
      if (stopped || terminal) return;
      if (!ready) backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
      retry();
    };
    sock.onerror = () => { /* onclose follows */ };
  }

  function retry() {
    if (stopped) return;
    status('reconnecting');
    clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => connect(true), backoff);
    backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
  }

  connect(false);

  return {
    end() {
      stopped = true; clearTimeout(retryTimer); stopRecorder();
      const s = ws; ws = null;
      if (s && s.readyState === WebSocket.OPEN) { try { s.send(JSON.stringify({ type: 'end' })); } catch { /* */ } setTimeout(() => { try { s.close(); } catch { /* */ } }, 500); }
      status('ended');
    },
    stop() {
      stopped = true; clearTimeout(retryTimer); stopRecorder();
      try { ws?.close(); } catch { /* */ } ws = null;
      status('off');
    },
  };
}
