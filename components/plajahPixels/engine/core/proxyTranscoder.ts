// proxyTranscoder.ts — client-side WebCodecs transcode of an uploaded video into a
// PLAYBACK-OPTIMIZED proxy: 1080p, short-GOP (keyframe every ~0.5s), low-latency
// (no B-frames), capped bitrate, faststart MP4.
//
// This is deliberately NOT "a more efficient codec" (HEVC/AV1). Those compress
// smaller but use long GOPs + B-frames, which make seeking, instant scene-switch,
// and multi-layer decode SLOWER — the opposite of what a VJ tool needs. A short-GOP
// low-latency H.264 proxy gives instant seek, universal hardware decode, cheap
// multi-layer playback, AND a smaller file than a 4K original (downscale + cap).

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface ProxyOpts {
  maxW?: number;      // cap width  (default 1920)
  maxH?: number;      // cap height (default 1080)
  bitrate?: number;   // target bitrate (default scales with area)
  fps?: number;       // proxy framerate (default 30)
  gopSeconds?: number;// keyframe interval in seconds (default 0.5 → instant seek)
  maxSeconds?: number;// skip clips longer than this (default 180)
}

const CODEC = 'avc1.4D0028'; // H.264 Main profile, level 4.0 (1080p30)

/** True if this browser can encode H.264 via WebCodecs at the given size. */
export async function canTranscode(w = 1280, h = 720): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
  try {
    const s = await VideoEncoder.isConfigSupported({ codec: CODEC, width: w, height: h, bitrate: 4_000_000, framerate: 30 });
    return !!s.supported;
  } catch { return false; }
}

function evenClamp(n: number) { return Math.max(2, Math.round(n / 2) * 2); }

function seekTo(video: HTMLVideoElement, t: number, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const onSeeked = () => { if (done) return; done = true; cleanup(); resolve(); };
    const cleanup = () => { video.removeEventListener('seeked', onSeeked); clearTimeout(timer); };
    const timer = setTimeout(() => { if (done) return; done = true; cleanup(); reject(new Error('seek timeout')); }, timeoutMs);
    video.addEventListener('seeked', onSeeked);
    try { video.currentTime = t; } catch (e) { done = true; cleanup(); reject(e as Error); }
  });
}

/**
 * Transcode `blob` to a playback-optimized MP4 proxy. Returns the proxy Blob, or
 * null if WebCodecs is unavailable, the clip is unreadable/too long, or anything
 * fails (caller keeps the original in that case).
 */
export async function transcodeToProxy(blob: Blob, opts: ProxyOpts = {}): Promise<Blob | null> {
  const { maxW = 1920, maxH = 1080, fps = 30, gopSeconds = 0.5, maxSeconds = 180 } = opts;
  if (!(await canTranscode())) return null;

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;

  let encoder: VideoEncoder | null = null;
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('video decode failed'));
      setTimeout(() => rej(new Error('metadata timeout')), 8000);
    });

    const sw = video.videoWidth, sh = video.videoHeight, dur = video.duration;
    if (!sw || !sh || !isFinite(dur) || dur <= 0) { console.warn('[Pixels proxy] unreadable clip — keeping original'); return null; }
    if (dur > maxSeconds) { console.warn(`[Pixels proxy] clip ${dur.toFixed(0)}s > ${maxSeconds}s cap — keeping original (not transcoded)`); return null; }

    const scale = Math.min(1, maxW / sw, maxH / sh);
    const dw = evenClamp(sw * scale), dh = evenClamp(sh * scale);
    const bitrate = opts.bitrate ?? Math.round(Math.min(12_000_000, Math.max(3_000_000, dw * dh * fps * 0.07)));

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: dw, height: dh },
      fastStart: 'in-memory', // moov at front → seekable/streamable immediately
    });

    let encErr: any = null;
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encErr = e; },
    });
    encoder.configure({
      codec: CODEC, width: dw, height: dh, bitrate, framerate: fps,
      latencyMode: 'realtime', // biases the encoder away from B-frames → cheap decode + instant seek
    });

    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(dw, dh) : Object.assign(document.createElement('canvas'), { width: dw, height: dh });
    const ctx = (canvas as any).getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

    const gopFrames = Math.max(1, Math.round(gopSeconds * fps));
    const frameDur = 1 / fps;
    const totalFrames = Math.min(Math.ceil(dur * fps), Math.ceil(maxSeconds * fps));

    for (let i = 0; i < totalFrames; i++) {
      if (encErr) throw encErr;
      const t = i * frameDur;
      await seekTo(video, Math.min(t, dur - 1e-3));
      ctx.drawImage(video, 0, 0, dw, dh);
      const frame = new VideoFrame(canvas as any, { timestamp: Math.round(t * 1e6), duration: Math.round(frameDur * 1e6) });
      encoder.encode(frame, { keyFrame: i % gopFrames === 0 });
      frame.close();
      // Backpressure: don't let the encode queue run away (memory).
      while (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 4));
    }

    await encoder.flush();
    if (encErr) throw encErr;
    muxer.finalize();
    const out = (muxer.target as ArrayBufferTarget).buffer;
    if (!out || out.byteLength < 1024) { console.warn('[Pixels proxy] empty output — keeping original'); return null; }
    return new Blob([out], { type: 'video/mp4' });
  } catch (e) {
    console.warn('[Pixels proxy] transcode failed — keeping original:', (e as Error)?.message || e);
    return null;
  } finally {
    try { encoder?.close(); } catch { /* */ }
    video.removeAttribute('src'); video.load();
    URL.revokeObjectURL(url);
  }
}
