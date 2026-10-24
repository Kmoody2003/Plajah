// programBus — Single authoritative Program Bus for Ambo.
//
// Ensures that the Studio Program Out monitor, the Multiview Program tile,
// the platform virtual video bus ('ambo:audience'), and every physical
// Program Output Window display the EXACT SAME generator/shader/video/live/
// template/scripture instance rather than spinning up separate instances.
//
// Transport tiers for physical Output Windows (AmboOutputWindow):
//   1. Direct same-origin opener canvas blit (`window.opener.__amboProgramCanvas`)
//      — zero-latency, zero-compression GPU copy every animation frame.
//   2. Local loopback WebRTC (`RTCPeerConnection` signaled over `BroadcastChannel`)
//      — used when `window.opener` is null (e.g. WinUI 3 native secondary WebView2
//        windows sharing CoreWebView2Environment).
//   3. Synchronized local LayerRenderer fallback (for STAGE, alpha KEY, or per-bus
//      independent layer clearing).

import { publishAppOutput } from '../mediaEngine/bridge';

const GLOBAL_CANVAS_KEY = '__amboProgramCanvas';
const GLOBAL_STREAM_KEY = '__amboProgramStream';
const GLOBAL_FOLLOWERS_KEY = '__amboProgramFollowers';
const GLOBAL_EPOCH_KEY = '__amboProgramEpochMs';
const RTC_CHANNEL_NAME = 'ambo-program-rtc-v1';

export interface OutputMetricsReport {
  outputId: string;
  width: number;
  height: number;
  aspectRatio: string;
}

type RtcSignalMessage =
  | { type: 'RTC_REQUEST'; clientId: string }
  | { type: 'RTC_OFFER'; clientId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'RTC_ANSWER'; clientId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'RTC_ICE_TO_CLIENT'; clientId: string; candidate: RTCIceCandidateInit }
  | { type: 'RTC_ICE_TO_STUDIO'; clientId: string; candidate: RTCIceCandidateInit }
  | { type: 'OUTPUT_METRICS'; metrics: OutputMetricsReport };

let masterCanvas: HTMLCanvasElement | null = null;
let masterStream: MediaStream | null = null;
const followers = new Set<HTMLCanvasElement>();
const metricsListeners = new Set<(m: OutputMetricsReport) => void>();

/** Shared wall-clock epoch so any fallback renderer evaluates iTime/vt in lockstep with the studio. */
export function getProgramEpochMs(): number {
  if (typeof window === 'undefined') return Date.now();
  try {
    const openerEpoch = (window.opener as any)?.[GLOBAL_EPOCH_KEY];
    if (typeof openerEpoch === 'number' && openerEpoch > 0) return openerEpoch;
  } catch { /* cross-origin or no opener */ }
  let local = (window as any)[GLOBAL_EPOCH_KEY];
  if (typeof local !== 'number' || !(local > 0)) {
    local = Date.now();
    try { (window as any)[GLOBAL_EPOCH_KEY] = local; } catch { /* */ }
  }
  return local;
}

export function setProgramEpochMs(epochMs: number): void {
  if (typeof window === 'undefined' || !(epochMs > 0)) return;
  try { (window as any)[GLOBAL_EPOCH_KEY] = epochMs; } catch { /* */ }
}

/**
 * Draw a source canvas or video onto a destination canvas: a straight fill when
 * the aspects match (within 2%), otherwise letterboxed so nothing is cut off.
 */
export function blitProgramSurface(
  src: HTMLCanvasElement | HTMLVideoElement,
  dst: HTMLCanvasElement,
  _fit?: unknown,
): boolean {
  if (!src || !dst) return false;
  const srcW = (src as HTMLVideoElement).videoWidth || (src as HTMLCanvasElement).width || 0;
  const srcH = (src as HTMLVideoElement).videoHeight || (src as HTMLCanvasElement).height || 0;
  const w = dst.width || 0;
  const h = dst.height || 0;
  if (!srcW || !srcH || !w || !h) return false;
  const ctx = dst.getContext('2d');
  if (!ctx) return false;
  ctx.save?.();
  ctx.setTransform?.(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.imageSmoothingEnabled = true;
  try { (ctx as any).imageSmoothingQuality = 'high'; } catch { /* */ }
  try {
    const srcAspect = srcW / srcH;
    const dstAspect = w / h;
    if (Math.abs(srcAspect - dstAspect) < 0.02) {
      ctx.drawImage(src, 0, 0, w, h);
    } else {
      // Contain, never crop: cover-fill zoomed slides past the edges of the
      // screen whenever the projector's aspect differed from the bus.
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      const scale = Math.min(w / srcW, h / srcH);
      const dw = srcW * scale;
      const dh = srcH * scale;
      ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    ctx.restore?.();
    return true;
  } catch {
    ctx.restore?.();
    return false;
  }
}

/** Register the Studio's single authoritative Master Program Bus canvas. */
export function registerProgramBusCanvas(canvas: HTMLCanvasElement | null): () => void {
  masterCanvas = canvas;
  if (typeof window !== 'undefined') {
    try {
      (window as any)[GLOBAL_CANVAS_KEY] = canvas;
      (window as any)[GLOBAL_FOLLOWERS_KEY] = followers;
      getProgramEpochMs();
    } catch { /* */ }
  }

  if (!canvas) {
    masterStream = null;
    if (typeof window !== 'undefined') {
      try { (window as any)[GLOBAL_STREAM_KEY] = null; } catch { /* */ }
    }
    return () => {};
  }

  try {
    if (typeof (canvas as any).captureStream === 'function') {
      const stream: MediaStream = (canvas as any).captureStream(60);
      const track = stream.getVideoTracks?.()[0];
      if (track && 'contentHint' in track) {
        // 'detail' tells the encoder to hold resolution under pressure — lyric
        // and scripture text turns to mush first under 'motion'.
        try { (track as any).contentHint = 'detail'; } catch { /* */ }
      }
      masterStream = stream;
      if (typeof window !== 'undefined') {
        try { (window as any)[GLOBAL_STREAM_KEY] = stream; } catch { /* */ }
      }
      publishAppOutput('ambo:audience', stream, 'Stage Audience Output', 'ambo');
      updateRtcSenderTracks(stream);
    }
  } catch { /* captureStream unsupported in test env */ }

  return () => {
    if (masterCanvas === canvas) {
      registerProgramBusCanvas(null);
    }
  };
}

/** Refresh the captured stream track if the master canvas resized. */
export function refreshProgramBusStream(): void {
  if (!masterCanvas) return;
  registerProgramBusCanvas(masterCanvas);
}

/** Called at the end of every Master Program Bus frame to update all follower monitors in lockstep. */
export function notifyProgramBusFrame(): void {
  if (!masterCanvas || !masterCanvas.width || !masterCanvas.height) return;
  for (const dst of [...followers]) {
    if (dst.isConnected === false) {
      followers.delete(dst);
      continue;
    }
    blitProgramSurface(masterCanvas, dst);
  }
}

/** Subscribe a secondary Program monitor canvas (e.g. Multiview Program tile) to mirror the Master Program Bus. */
export function subscribeProgramBusFollower(canvas: HTMLCanvasElement): () => void {
  followers.add(canvas);
  if (masterCanvas && masterCanvas.width > 0 && masterCanvas.height > 0) {
    blitProgramSurface(masterCanvas, canvas);
  }
  return () => {
    followers.delete(canvas);
  };
}

export function hasMasterProgramBus(): boolean {
  return !!(masterCanvas && masterCanvas.isConnected !== false);
}

export function getProgramBusCanvas(): HTMLCanvasElement | null {
  return masterCanvas;
}

export function getMasterProgramBusCanvas(): HTMLCanvasElement | null {
  return masterCanvas;
}

export function getProgramBusStream(): MediaStream | null {
  return masterStream;
}

/** From an Output Window, read the Studio's Master Program Bus canvas directly via window.opener (if same-process). */
export function readOpenerProgramCanvas(): HTMLCanvasElement | null {
  if (typeof window === 'undefined') return null;
  try {
    const opener = window.opener as any;
    if (opener && !opener.closed) {
      const c = opener[GLOBAL_CANVAS_KEY] as HTMLCanvasElement | null | undefined;
      if (c && c.width > 0 && c.height > 0) return c;
    }
  } catch { /* cross-origin or closed */ }
  return null;
}

/** From an Output Window, read the Studio's Master Program Bus MediaStream via window.opener. */
export function readOpenerProgramStream(): MediaStream | null {
  if (typeof window === 'undefined') return null;
  try {
    const opener = window.opener as any;
    if (opener && !opener.closed) {
      const s = opener[GLOBAL_STREAM_KEY] as MediaStream | null | undefined;
      if (s && s.active) return s;
    }
  } catch { /* */ }
  return null;
}

// ── Local Loopback WebRTC Bridge (for Native WinUI WebView2 / opener-less windows) ──

// The loopback never leaves the machine, so bandwidth is free — but WebRTC
// doesn't know that. Left at defaults it starts near 300 kbps, ramps slowly,
// software-encodes VP8 and drops resolution first: a blocky, choppy projector
// while the in-app monitors (direct canvas) look perfect.
const LOOPBACK_KBPS = 40_000;

/** Prefer hardware-encodable H.264, then VP9/VP8, on a video transceiver. */
function preferLoopbackCodecs(tx: RTCRtpTransceiver | undefined): void {
  try {
    const caps = (RTCRtpSender as any).getCapabilities?.('video');
    if (!tx || !caps?.codecs?.length || typeof tx.setCodecPreferences !== 'function') return;
    const rank = (mime: string) => {
      const m = mime.toLowerCase();
      return m === 'video/h264' ? 0 : m === 'video/vp9' ? 1 : m === 'video/vp8' ? 2 : 3;
    };
    const sorted = [...caps.codecs].sort((a: any, b: any) => rank(a.mimeType) - rank(b.mimeType));
    tx.setCodecPreferences(sorted);
  } catch { /* unsupported — negotiate defaults */ }
}

/** Pin start/min/max bitrate in the SDP so the encoder starts at full quality. */
export function boostLoopbackSdp(sdp: string | undefined, kbps = LOOPBACK_KBPS): string | undefined {
  if (!sdp) return sdp;
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(eol);
  const out: string[] = [];
  let inVideo = false;
  let videoPts = new Set<string>();
  const fmtpSeen = new Set<string>();
  const params = `x-google-start-bitrate=${Math.round(kbps * 0.75)};x-google-min-bitrate=${Math.round(kbps / 4)};x-google-max-bitrate=${kbps}`;
  // First pass: which payload types are real video codecs (skip rtx/red/ulpfec).
  for (const l of lines) {
    if (l.startsWith('m=')) inVideo = l.startsWith('m=video');
    const m = inVideo && /^a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\//i.exec(l);
    if (m) videoPts.add(m[1]);
  }
  inVideo = false;
  for (const l of lines) {
    if (l.startsWith('m=')) inVideo = l.startsWith('m=video');
    if (inVideo && l.startsWith('b=')) continue; // replaced below
    const f = inVideo && /^a=fmtp:(\d+) /.exec(l);
    if (f && videoPts.has(f[1])) {
      fmtpSeen.add(f[1]);
      out.push(l.includes('x-google-') ? l : `${l};${params}`);
      continue;
    }
    out.push(l);
    if (inVideo && l.startsWith('c=')) out.push(`b=AS:${kbps}`);
    const r = inVideo && /^a=rtpmap:(\d+) /.exec(l);
    if (r && videoPts.has(r[1]) && !lines.some(x => x.startsWith(`a=fmtp:${r[1]} `))) {
      out.push(`a=fmtp:${r[1]} ${params}`);
    }
  }
  return out.join(eol);
}

/** Full-res, full-rate, high-bitrate encoding on the loopback sender. */
async function tuneLoopbackSender(pc: RTCPeerConnection): Promise<void> {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (!sender) return;
  try {
    const p = sender.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    for (const e of p.encodings) {
      e.maxBitrate = LOOPBACK_KBPS * 1000;
      (e as any).maxFramerate = 60;
      e.scaleResolutionDownBy = 1;
      (e as any).priority = 'high';
      (e as any).networkPriority = 'high';
    }
    (p as any).degradationPreference = 'maintain-resolution';
    await sender.setParameters(p);
  } catch { /* best effort */ }
}

const studioPeers = new Map<string, RTCPeerConnection>();
let studioRtcChannel: BroadcastChannel | null = null;

function updateRtcSenderTracks(stream: MediaStream): void {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;
  for (const pc of studioPeers.values()) {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      sender.replaceTrack(videoTrack).catch(() => {});
    }
  }
}

/**
 * Installed in the Studio window: answers RTC_REQUEST from any Output Window
 * that cannot reach `window.opener`, streaming the Master Program Bus canvas.
 */
export function installProgramBusRtcHost(
  arg1?: (() => MediaStream | null) | ((m: OutputMetricsReport) => void),
  arg2?: (m: OutputMetricsReport) => void,
): () => void {
  const onMetrics = typeof arg2 === 'function' ? arg2 : (typeof arg1 === 'function' && arg1.length >= 1 ? (arg1 as (m: OutputMetricsReport) => void) : undefined);
  const streamGetter = typeof arg1 === 'function' && arg1 !== onMetrics ? (arg1 as () => MediaStream | null) : () => masterStream;

  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {};
  if (onMetrics) metricsListeners.add(onMetrics);

  if (!studioRtcChannel) {
    try {
      const ch = new BroadcastChannel(RTC_CHANNEL_NAME);
      studioRtcChannel = ch;
      ch.onmessage = async (ev: MessageEvent) => {
        const msg = ev.data as RtcSignalMessage | null;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'OUTPUT_METRICS' && msg.metrics) {
          metricsListeners.forEach(fn => { try { fn(msg.metrics); } catch { /* */ } });
          return;
        }

        if (typeof RTCPeerConnection === 'undefined') return;

        if (msg.type === 'RTC_REQUEST') {
          const { clientId } = msg;
          let stream = streamGetter() ?? masterStream;
          if (!stream && masterCanvas) {
            registerProgramBusCanvas(masterCanvas);
            stream = masterStream;
          }
          if (!stream) return;

          try { studioPeers.get(clientId)?.close(); } catch { /* */ }
          const pc = new RTCPeerConnection({ iceServers: [] });
          studioPeers.set(clientId, pc);

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              try {
                ch.postMessage({
                  type: 'RTC_ICE_TO_CLIENT',
                  clientId,
                  candidate: e.candidate.toJSON(),
                } satisfies RtcSignalMessage);
              } catch { /* */ }
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
              studioPeers.delete(clientId);
            }
          };

          for (const track of stream.getVideoTracks()) {
            const sender = pc.addTrack(track, stream);
            preferLoopbackCodecs(pc.getTransceivers().find(t => t.sender === sender));
          }

          try {
            const offer = await pc.createOffer();
            const tuned = { type: offer.type, sdp: boostLoopbackSdp(offer.sdp) };
            await pc.setLocalDescription(tuned);
            await tuneLoopbackSender(pc);
            ch.postMessage({
              type: 'RTC_OFFER',
              clientId,
              sdp: tuned,
            } satisfies RtcSignalMessage);
          } catch { /* */ }
          return;
        }

        if (msg.type === 'RTC_ANSWER') {
          const pc = studioPeers.get(msg.clientId);
          if (pc && pc.signalingState === 'have-local-offer') {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription({ type: msg.sdp.type, sdp: boostLoopbackSdp(msg.sdp.sdp) }));
              await tuneLoopbackSender(pc);
            } catch { /* */ }
          }
          return;
        }

        if (msg.type === 'RTC_ICE_TO_STUDIO') {
          const pc = studioPeers.get(msg.clientId);
          if (pc && msg.candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch { /* */ }
          }
        }
      };
    } catch { /* */ }
  }

  return () => {
    if (onMetrics) metricsListeners.delete(onMetrics);
  };
}

/**
 * Installed in AmboOutputWindow when `window.opener` is unavailable: connects to
 * the Studio's Master Program Bus over local WebRTC loopback.
 */
export function connectProgramBusRtcClient(
  idOrCallback: string | null | undefined | ((stream: MediaStream | null) => void),
  maybeCallback?: (stream: MediaStream | null) => void,
): () => void {
  const onStream = typeof idOrCallback === 'function' ? idOrCallback : maybeCallback;
  if (!onStream) return () => {};
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' || typeof RTCPeerConnection === 'undefined') {
    return () => {};
  }

  const prefix = typeof idOrCallback === 'string' && idOrCallback ? idOrCallback : 'out';
  const clientId = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let ch: BroadcastChannel | null = null;
  let pc: RTCPeerConnection | null = null;
  let connected = false;
  let disposed = false;

  const cleanupPeer = () => {
    try { pc?.close(); } catch { /* */ }
    pc = null;
  };

  try {
    ch = new BroadcastChannel(RTC_CHANNEL_NAME);
    ch.onmessage = async (ev: MessageEvent) => {
      if (disposed) return;
      const msg = ev.data as RtcSignalMessage | null;
      if (!msg || typeof msg !== 'object') return;
      if ('clientId' in msg && msg.clientId !== clientId) return;

      if (msg.type === 'RTC_OFFER') {
        cleanupPeer();
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.onicecandidate = (e) => {
          if (e.candidate && ch) {
            try {
              ch.postMessage({
                type: 'RTC_ICE_TO_STUDIO',
                clientId,
                candidate: e.candidate.toJSON(),
              } satisfies RtcSignalMessage);
            } catch { /* */ }
          }
        };
        pc.ontrack = (e) => {
          const stream = e.streams?.[0] ?? new MediaStream([e.track]);
          connected = true;
          onStream(stream);
        };
        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'failed') {
            connected = false;
            onStream(null);
          }
        };
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          const tunedAnswer = { type: answer.type, sdp: boostLoopbackSdp(answer.sdp) };
          await pc.setLocalDescription(tunedAnswer);
          ch?.postMessage({
            type: 'RTC_ANSWER',
            clientId,
            sdp: tunedAnswer,
          } satisfies RtcSignalMessage);
        } catch { /* */ }
        return;
      }

      if (msg.type === 'RTC_ICE_TO_CLIENT' && pc && msg.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch { /* */ }
      }
    };
  } catch {
    return () => {};
  }

  const requestStream = () => {
    if (disposed || connected) return;
    // If opener became available, no need for RTC
    if (readOpenerProgramCanvas()) return;
    try { ch?.postMessage({ type: 'RTC_REQUEST', clientId } satisfies RtcSignalMessage); } catch { /* */ }
  };

  requestStream();
  const retry = setInterval(requestStream, 1800);

  return () => {
    disposed = true;
    clearInterval(retry);
    cleanupPeer();
    try { ch?.close(); } catch { /* */ }
  };
}

/** Report an Output Window's live viewport/screen dimensions back to the Studio. */
export function reportOutputWindowMetrics(
  idOrMetrics: OutputMetricsReport | string | null | undefined,
  width?: number,
  height?: number,
  aspectRatio?: string,
): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const metrics: OutputMetricsReport | null =
    typeof idOrMetrics === 'object' && idOrMetrics !== null
      ? idOrMetrics
      : width && height
      ? { outputId: idOrMetrics || 'PROGRAM', width, height, aspectRatio: aspectRatio || '16:9' }
      : null;
  if (!metrics) return;
  try {
    const ch = new BroadcastChannel(RTC_CHANNEL_NAME);
    ch.postMessage({ type: 'OUTPUT_METRICS', metrics } satisfies RtcSignalMessage);
    ch.close();
  } catch { /* */ }
}
