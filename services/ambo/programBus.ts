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
 * Draw a source canvas or video onto a destination canvas, filling the full canvas
 * while intelligently fitting if aspect ratios differ slightly.
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
  try {
    const srcAspect = srcW / srcH;
    const dstAspect = w / h;
    if (Math.abs(srcAspect - dstAspect) < 0.02) {
      ctx.drawImage(src, 0, 0, w, h);
    } else {
      // Cover-fill so the full canvas is always used without black bars
      const scale = Math.max(w / srcW, h / srcH);
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
        try { (track as any).contentHint = 'motion'; } catch { /* */ }
      }
      masterStream = stream;
      if (typeof window !== 'undefined') {
        try { (window as any)[GLOBAL_STREAM_KEY] = stream; } catch { /* */ }
      }
      publishAppOutput('ambo:audience', stream, 'Ambo Audience Output', 'ambo');
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
            pc.addTrack(track, stream);
          }

          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ch.postMessage({
              type: 'RTC_OFFER',
              clientId,
              sdp: { type: offer.type, sdp: offer.sdp },
            } satisfies RtcSignalMessage);
          } catch { /* */ }
          return;
        }

        if (msg.type === 'RTC_ANSWER') {
          const pc = studioPeers.get(msg.clientId);
          if (pc && pc.signalingState === 'have-local-offer') {
            try { await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)); } catch { /* */ }
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
          await pc.setLocalDescription(answer);
          ch?.postMessage({
            type: 'RTC_ANSWER',
            clientId,
            sdp: { type: answer.type, sdp: answer.sdp },
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
