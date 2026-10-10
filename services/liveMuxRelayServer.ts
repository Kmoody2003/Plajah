// services/liveMuxRelayServer.ts — Reello Live → Mux, kept on platform.
//
// A browser can't speak RTMP, so the host's PROGRAM (the composed picture of host + guests on stage,
// plus the mixed audio of everyone — see services/sessionRecorder.ts) is MediaRecorder-encoded on the
// phone and streamed over a WebSocket here; ffmpeg transcodes it to H.264/AAC and pushes RTMPS to a
// Mux live stream. Viewers then watch Mux HLS inside Reello (scales past the ~25-viewer P2P ceiling).
// Guests stay on the real-time WebRTC stage with the host; only the audience moves to Mux.
//
// Protocol (path /api/live/mux-relay?streamId=<id>):
//   client → {"type":"hello","token":"<Firebase ID token>","mime":"video/webm;codecs=vp8,opus"}
//   server → {"type":"ready"}                         start sending binary MediaRecorder chunks
//            {"type":"unavailable"|"busy"|"denied","reason"}   → client stays on P2P only
//   client → {"type":"end"}                           host ended the live: tear the Mux stream down
// A dropped socket is NOT the end: the host reconnects (Cloud Run caps a request at its --timeout) and
// pushes to the SAME Mux live stream inside its reconnect window, so viewers keep one continuous live.
//
// The Mux stream key never leaves the server. streams/{id}.muxLive = { liveStreamId, playbackId, state }
// where state ∈ connecting | live | reconnecting | ended (viewers switch to HLS on 'live').
//
// Limits: RELAY_MAX_PER_INSTANCE concurrent transcodes (default 4; each is ~1 vCPU at 720p30),
// one relay per stream per instance, 4 MB frames, Origin allow-list.

// @ts-ignore -- `ws` ships no types at the repo root
import { WebSocketServer } from 'ws';
type WebSocket = any;
import type { IncomingMessage, Server } from 'node:http';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export const MUX_RELAY_PATH = '/api/live/mux-relay';
const MUX_RTMP = 'rtmps://global-live.mux.com:443/app';
const MAX_FRAME = 4 * 1024 * 1024;
const STREAM_ID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const ORIGIN_OK = [/^https:\/\/(www\.)?plajah\.(com|app)$/, /^https:\/\/[a-z0-9-]+\.(web|firebaseapp)\.app$/, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^capacitor:\/\/localhost$/, /^https?:\/\/localhost$/];
const ABANDON_MS = 3 * 60_000;   // no reconnect within this → the live is over; delete the Mux stream

export interface MuxRelayDeps {
  verifyToken: (token: string) => Promise<{ uid: string } | null>;
  getDoc: (collection: string, id: string) => Promise<Record<string, any> | null>;
  patchDoc: (collection: string, id: string, fields: Record<string, any>) => Promise<boolean>;
  /** Account standing gate (Fair Process). Should FAIL OPEN on infrastructure errors. */
  canGoLive: (uid: string) => Promise<boolean>;
}

/** ffmpeg args: WebM (VP8/VP9/H.264 + Opus) on stdin → H.264/AAC FLV over RTMPS. Exported for tests. */
export function ffmpegArgs(rtmpUrl: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-fflags', '+genpts+discardcorrupt', '-thread_queue_size', '1024',
    '-i', 'pipe:0',
    '-map', '0:v:0?', '-map', '0:a:0?',
    // Even dimensions (x264 requirement) and a steady 30 fps; 2 s GOPs so Mux can segment for low latency.
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-b:v', '2500k', '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-f', 'flv', rtmpUrl,
  ];
}

async function muxClient(): Promise<any | null> {
  const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) return null;
  const Mux = (await import('@mux/mux-node')).default;
  return new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
}

export function attachLiveMuxRelay(server: Server, deps: MuxRelayDeps, opts: {
  allowedOrigins?: RegExp[]; maxPerInstance?: number;
  /** Test seams: a fake Mux client and encoder process. */
  mux?: () => Promise<any | null>;
  spawnEncoder?: (args: string[]) => ChildProcessWithoutNullStreams;
} = {}) {
  const getMux = opts.mux ?? muxClient;
  const spawnEncoder = opts.spawnEncoder ?? ((args: string[]) => spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] }) as ChildProcessWithoutNullStreams);
  const origins = opts.allowedOrigins ?? ORIGIN_OK;
  const maxRelays = opts.maxPerInstance ?? (Number(process.env.RELAY_MAX_PER_INSTANCE) || 4);
  const active = new Map<string, { ws: WebSocket; ff: ChildProcessWithoutNullStreams | null }>();
  const abandonTimers = new Map<string, NodeJS.Timeout>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    let url: URL;
    try { url = new URL(req.url ?? '', 'http://x'); } catch { return; }
    if (url.pathname !== MUX_RELAY_PATH) return; // other upgrade handlers own their paths
    const streamId = url.searchParams.get('streamId') ?? '';
    const origin = req.headers.origin;
    if (!STREAM_ID_RE.test(streamId) || (origin && !origins.some(re => re.test(origin)))) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => session(ws, streamId));
  });

  function send(ws: WebSocket, msg: object) { try { ws.send(JSON.stringify(msg)); } catch { /* closing */ } }
  function refuse(ws: WebSocket, type: string, reason: string) { send(ws, { type, reason }); try { ws.close(1000, type); } catch { /* */ } }

  function session(ws: WebSocket, streamId: string) {
    let ff: ChildProcessWithoutNullStreams | null = null;
    let started = false;
    let ended = false;
    let mux: any = null;
    let liveStreamId = '';
    let playbackId = '';
    let alive = true;
    const setState = (state: string) =>
      deps.patchDoc('streams', streamId, { muxLive: { liveStreamId, playbackId, state, updatedAt: Date.now() } }).catch(() => false);
    ws.on('pong', () => { alive = true; });
    const beat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; try { ws.ping(); } catch { /* */ } }, 30_000);
    const helloTimer = setTimeout(() => { if (!started) refuse(ws, 'denied', 'No hello.'); }, 15_000);

    ws.on('message', async (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (!ff || !ff.stdin.writable) return;
        // Backpressure: if ffmpeg can't keep up the host is sending more than this instance can encode.
        // Dropping WebM bytes would corrupt the container, so we let Node buffer and only bail if it's huge.
        if (ff.stdin.writableLength > 32 * 1024 * 1024) { console.warn('[mux-relay] encoder overrun', streamId); ff.kill('SIGKILL'); return; }
        ff.stdin.write(data);
        return;
      }
      let msg: any;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg?.type === 'end') { ended = true; await finish(true); try { ws.close(1000, 'ended'); } catch { /* */ } return; }
      if (msg?.type !== 'hello' || started) return;
      started = true;
      clearTimeout(helloTimer);
      try {
        const who = typeof msg.token === 'string' ? await deps.verifyToken(msg.token) : null;
        if (!who) return refuse(ws, 'denied', 'Sign in again to go live.');
        const doc = await deps.getDoc('streams', streamId);
        if (!doc || doc.ownerUid !== who.uid) return refuse(ws, 'denied', 'Only the host can broadcast this stream.');
        if (doc.isLive === false) return refuse(ws, 'denied', 'This stream has ended.');
        if (!(await deps.canGoLive(who.uid))) return refuse(ws, 'denied', "Your account can't go live right now — see the Appeal Center.");
        if (active.has(streamId)) { try { active.get(streamId)!.ws.terminate(); } catch { /* */ } active.delete(streamId); }
        if (active.size >= maxRelays) return refuse(ws, 'busy', 'Relay at capacity — staying on direct connections.');
        mux = await getMux();
        if (!mux) return refuse(ws, 'unavailable', 'Mux is not configured on this server.');

        // Reuse the stream's Mux live stream on reconnect (keeps ONE continuous live for viewers).
        let streamKey = '';
        const prev = doc.muxLive && typeof doc.muxLive === 'object' ? doc.muxLive : null;
        if (prev?.liveStreamId && prev.state !== 'ended') {
          try {
            const ls = await mux.video.liveStreams.retrieve(prev.liveStreamId);
            if (ls?.stream_key) { liveStreamId = ls.id; streamKey = ls.stream_key; playbackId = ls.playback_ids?.[0]?.id || prev.playbackId || ''; }
          } catch { /* gone → create a fresh one */ }
        }
        if (!streamKey) {
          // No new_asset_settings: the replay is already recorded + uploaded by the host's own
          // recorder (liveCloudRecorder), so a Mux live asset would be a paid duplicate.
          const ls = await mux.video.liveStreams.create({
            playback_policy: ['public'],
            latency_mode: 'low',
            reconnect_window: 60,
            passthrough: `plajah-stream:${streamId}`,
          });
          liveStreamId = ls.id; streamKey = ls.stream_key ?? ''; playbackId = ls.playback_ids?.[0]?.id ?? '';
        }
        if (!streamKey || !playbackId) return refuse(ws, 'unavailable', 'Mux did not return a stream key.');
        const timer = abandonTimers.get(streamId); if (timer) { clearTimeout(timer); abandonTimers.delete(streamId); }
        await setState(prev?.state === 'live' && prev?.liveStreamId === liveStreamId ? 'live' : 'connecting');

        ff = spawnEncoder(ffmpegArgs(`${MUX_RTMP}/${streamKey}`));
        active.set(streamId, { ws, ff });
        ff.stderr.on('data', (b: Buffer) => { const s = String(b).trim(); if (s) console.warn(`[mux-relay ${streamId}] ${s.slice(0, 300)}`); });
        ff.stdin.on('error', () => { /* ffmpeg exited; handled on 'exit' */ });
        ff.on('exit', code => {
          if (active.get(streamId)?.ff === ff) active.delete(streamId);
          ff = null;
          if (!ended) { send(ws, { type: 'encoder-exit', code }); try { ws.close(1011, 'encoder'); } catch { /* */ } }
        });
        send(ws, { type: 'ready', playbackId });
        watchActive(streamId, liveStreamId, playbackId);
      } catch (e: any) {
        console.error('[mux-relay] hello failed', e?.message);
        refuse(ws, 'unavailable', 'Relay error — staying on direct connections.');
      }
    });

    ws.on('close', () => {
      clearInterval(beat); clearTimeout(helloTimer);
      if (ended) return;
      // Unexpected drop: stop encoding, mark reconnecting, give the host a window to come back.
      if (ff) { try { ff.stdin.end(); } catch { /* */ } const f = ff; setTimeout(() => { try { f.kill('SIGKILL'); } catch { /* */ } }, 3000); }
      if (active.get(streamId)?.ws === ws) active.delete(streamId);
      if (!liveStreamId) return;
      setState('reconnecting');
      const t = setTimeout(async () => {
        abandonTimers.delete(streamId);
        if (active.has(streamId)) return;
        const d = await deps.getDoc('streams', streamId).catch(() => null);
        if (d?.muxLive?.state === 'reconnecting' && d?.muxLive?.liveStreamId === liveStreamId) await finish(false);
      }, ABANDON_MS);
      abandonTimers.set(streamId, t);
    });

    async function finish(byHost: boolean) {
      if (ff) { try { ff.stdin.end(); } catch { /* */ } const f = ff; setTimeout(() => { try { f.kill('SIGKILL'); } catch { /* */ } }, 3000); ff = null; }
      if (active.get(streamId)?.ws === ws) active.delete(streamId);
      if (!liveStreamId) return;
      await setState('ended');
      try { const m = mux || await getMux(); await m?.video.liveStreams.delete(liveStreamId); } catch (e: any) { console.warn('[mux-relay] delete failed', liveStreamId, e?.message, byHost ? '(host end)' : '(abandoned)'); }
    }
  }

  /** Poll Mux until the live stream is receiving (status 'active'), then flip the doc to 'live' so
   *  viewers switch to HLS only once there's something to play. */
  function watchActive(streamId: string, liveStreamId: string, playbackId: string) {
    let tries = 0;
    const tick = async () => {
      const cur = active.get(streamId);
      if (!cur || tries++ > 40) return;
      try {
        const m = await getMux();
        const ls = await m?.video.liveStreams.retrieve(liveStreamId);
        if (ls?.status === 'active') {
          await deps.patchDoc('streams', streamId, { muxLive: { liveStreamId, playbackId, state: 'live', updatedAt: Date.now() } });
          return;
        }
      } catch { /* retry */ }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  }
}
