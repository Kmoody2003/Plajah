// Fitting covers to Chora's square drop zone.
//
// A still is redrawn onto a square canvas. Motion (a GIF or a ≤10 s video loop) is redrawn
// frame by frame into a square canvas and re-encoded — the platform has no
// GIF encoder, so a GIF that isn't already square comes out as a square MP4 loop (which the
// album page plays muted and looped, exactly like a GIF). Loops are encoded frame by frame with
// WebCodecs into a square MP4 (so a background tab can't starve them of frames); MediaRecorder
// is only the fallback. GIF frames are decoded with WebCodecs' ImageDecoder where it exists;
// otherwise the animated <img> is sampled live.

import { LOOP_MAX_SEC, type FitMode } from '../../../../../services/melos/beats/releaseDesk';

export interface MediaProbe { kind: 'image' | 'gif' | 'video'; width: number; height: number; durationSec?: number; url: string }

/**
 * A video's true length. MediaRecorder WebMs (Chrome's own recordings, screen captures) carry no
 * duration — the element reports Infinity until it has been seeked past the end.
 */
async function realDuration(v: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
  await new Promise<void>((res) => {
    const done = () => { v.removeEventListener('durationchange', check); res(); };
    const check = () => { if (Number.isFinite(v.duration)) done(); };
    v.addEventListener('durationchange', check);
    setTimeout(done, 4000);
    v.currentTime = 1e9;
  });
  const d = v.duration;
  v.currentTime = 0;
  return Number.isFinite(d) && d > 0 ? d : LOOP_MAX_SEC;
}

export const isSquare = (w: number, h: number) => w > 0 && h > 0 && Math.abs(w / h - 1) < 0.01;

export async function probeMedia(file: Blob): Promise<MediaProbe> {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('video/')) {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.src = url;
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('Unreadable video')); });
    return { kind: 'video', width: v.videoWidth, height: v.videoHeight, durationSec: await realDuration(v), url };
  }
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Unreadable image')); }));
  return { kind: file.type === 'image/gif' ? 'gif' : 'image', width: img.naturalWidth, height: img.naturalHeight, url };
}

/** Where the source lands inside a square of side `s` for a fit mode. */
export function fitRect(sw: number, sh: number, s: number, fit: FitMode): { x: number; y: number; w: number; h: number } {
  if (fit === 'fill') return { x: 0, y: 0, w: s, h: s };
  const scale = fit === 'cover' ? Math.max(s / sw, s / sh) : Math.min(s / sw, s / sh);
  const w = sw * scale, h = sh * scale;
  return { x: (s - w) / 2, y: (s - h) / 2, w, h };
}

/** Square still (PNG/JPEG), side ≤ maxSide. Contain fills the bars with a blurred copy. */
export async function squareStill(file: Blob, fit: FitMode, maxSide = 3000): Promise<Blob> {
  const p = await probeMedia(file);
  const img = new Image(); img.src = p.url; await img.decode();
  const s = Math.min(maxSide, Math.max(p.width, p.height));
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const g = cv.getContext('2d')!;
  if (fit === 'contain') paintBlurredBackdrop(g, img, p.width, p.height, s);
  const r = fitRect(p.width, p.height, s, fit);
  g.drawImage(img, r.x, r.y, r.w, r.h);
  URL.revokeObjectURL(p.url);
  return await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92));
}

function paintBlurredBackdrop(g: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, s: number) {
  const r = fitRect(sw, sh, s, 'cover');
  g.save();
  g.filter = 'blur(28px) brightness(0.6)';
  g.drawImage(src, r.x - 30, r.y - 30, r.w + 60, r.h + 60);
  g.restore();
}

function pickMime(): string {
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

/**
 * Record a square loop from a frame painter. `paint(g, tSec)` draws the frame for time t;
 * the recorder runs in real time for `durationSec` (≤ 10 s by Chora's rule).
 */
async function recordSquare(side: number, durationSec: number, paint: (g: CanvasRenderingContext2D, t: number) => void, onProgress?: (p: number) => void, ended?: () => boolean): Promise<Blob> {
  const cv = document.createElement('canvas'); cv.width = side; cv.height = side;
  const g = cv.getContext('2d')!;
  paint(g, 0);
  const stream = cv.captureStream(30);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((res) => { rec.onstop = () => res(); });
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= durationSec || ended?.()) { res(); return; }
      paint(g, t);
      onProgress?.(t / durationSec);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  return new Blob(chunks, { type: mime.split(';')[0] });
}

const LOOP_FPS = 30;
const H264 = ['avc1.4D0028', 'avc1.42E01F', 'avc1.640028'];

/**
 * Frame-accurate square encode: paint frame i at t = i / fps, hand it to WebCodecs, mux MP4.
 * Unlike the MediaRecorder path this never depends on the tab painting — it runs the same in
 * a background tab — and the file carries a real duration. null where WebCodecs H.264 is
 * missing (the caller falls back to recordSquare).
 */
async function encodeSquareMp4(side: number, durationSec: number, paintAt: (g: CanvasRenderingContext2D, t: number) => Promise<void> | void, onProgress?: (p: number) => void): Promise<Blob | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const size = Math.max(16, Math.round(side / 2) * 2);
  const bitrate = Math.round(size * size * LOOP_FPS * 0.15);
  let codec: string | null = null;
  for (const c of H264) {
    try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: size, height: size, bitrate, framerate: LOOP_FPS })).supported) { codec = c; break; } } catch { /* next */ }
  }
  if (!codec) return null;
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: size, height: size, frameRate: LOOP_FPS }, fastStart: 'in-memory' });
  let err: unknown = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { err = e; } });
  enc.configure({ codec, width: size, height: size, bitrate, framerate: LOOP_FPS });
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d')!;
  const frames = Math.max(1, Math.round(durationSec * LOOP_FPS));
  for (let i = 0; i < frames && !err; i++) {
    await paintAt(g, i / LOOP_FPS);
    const frame = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / LOOP_FPS), duration: Math.round(1e6 / LOOP_FPS) });
    enc.encode(frame, { keyFrame: i % (LOOP_FPS * 2) === 0 });
    frame.close();
    while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
    onProgress?.((i + 1) / frames);
  }
  await enc.flush();
  enc.close();
  if (err) return null;
  muxer.finalize();
  return new Blob([(muxer.target as InstanceType<typeof ArrayBufferTarget>).buffer], { type: 'video/mp4' });
}

/** Seek a paused video and wait for the frame to land (works in a background tab). */
function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const target = Math.max(0, Math.min(t, (Number.isFinite(v.duration) ? v.duration : t) - 0.001));
    if (Math.abs(v.currentTime - target) < 1e-4 && v.readyState >= 2) { res(); return; }
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(timer); res(); };
    const timer = setTimeout(done, 1500);
    v.addEventListener('seeked', done);
    v.currentTime = target;
  });
}

/** Fit a video loop to the square, trimmed to ≤ 10 s. */
export async function squareVideoLoop(file: Blob, fit: FitMode, onProgress?: (p: number) => void, maxSide = 1080): Promise<{ blob: Blob; durationSec: number }> {
  const p = await probeMedia(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = p.url;
  await new Promise<void>((res) => { v.onloadeddata = () => res(); setTimeout(res, 4000); });
  const dur = Math.min(LOOP_MAX_SEC, p.durationSec || LOOP_MAX_SEC);
  const side = Math.min(maxSide, Math.max(p.width, p.height));
  const r = fitRect(p.width, p.height, side, fit);
  const draw = (g: CanvasRenderingContext2D, s: number) => {
    const k = s / side; // the encoder may round the side to even
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    if (fit === 'contain') paintBlurredBackdrop(g, v, p.width, p.height, s);
    g.drawImage(v, r.x * k, r.y * k, r.w * k, r.h * k);
  };
  const mp4 = await encodeSquareMp4(side, dur, async (g, t) => { await seekTo(v, t); draw(g, g.canvas.width); }, onProgress);
  if (mp4) { URL.revokeObjectURL(p.url); return { blob: mp4, durationSec: dur }; }
  // No WebCodecs: record in real time (needs the tab on screen).
  v.currentTime = 0;
  await v.play();
  const t0 = performance.now();
  const blob = await recordSquare(side, dur, (g) => draw(g, side), onProgress, () => v.ended);
  const recorded = Math.min(dur, (performance.now() - t0) / 1000);
  v.pause(); URL.revokeObjectURL(p.url);
  return { blob, durationSec: recorded };
}

interface DecodedFrame { image: CanvasImageSource; untilSec: number }

/** Decode a GIF's frames + timing with ImageDecoder (Chromium). null where unsupported. */
async function decodeGif(file: Blob): Promise<{ frames: DecodedFrame[]; durationSec: number } | null> {
  const ID = (window as unknown as { ImageDecoder?: new (init: { data: ReadableStream | ArrayBuffer; type: string }) => {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
    decode: (o: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
  } }).ImageDecoder;
  if (!ID) return null;
  try {
    const dec = new ID({ data: await file.arrayBuffer(), type: 'image/gif' });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack?.frameCount ?? 0;
    const frames: DecodedFrame[] = [];
    let t = 0;
    for (let i = 0; i < count && t < LOOP_MAX_SEC; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      t += Math.max(0.02, (image.duration ?? 100_000) / 1e6);
      // Copy out of the VideoFrame so it can be closed.
      const c = document.createElement('canvas'); c.width = image.displayWidth; c.height = image.displayHeight;
      c.getContext('2d')!.drawImage(image, 0, 0);
      image.close();
      frames.push({ image: c, untilSec: t });
    }
    return frames.length ? { frames, durationSec: t } : null;
  } catch { return null; }
}

/** Fit an animated GIF to the square. Output is a square WebM loop (see header). */
export async function squareGifLoop(file: Blob, fit: FitMode, onProgress?: (p: number) => void, maxSide = 1080): Promise<{ blob: Blob; durationSec: number }> {
  const p = await probeMedia(file);
  const side = Math.min(maxSide, Math.max(p.width, p.height));
  const r = fitRect(p.width, p.height, side, fit);
  const decoded = await decodeGif(file);
  if (decoded) {
    // Play the decoded timeline twice when it's short, so the loop has a little body.
    const once = decoded.durationSec;
    const total = Math.min(LOOP_MAX_SEC, once < 2 ? once * Math.ceil(2 / once) : once);
    const paintGif = (g: CanvasRenderingContext2D, t: number) => {
      const sz = g.canvas.width, k = sz / side;
      const local = t % once;
      const f = decoded.frames.find((fr) => local < fr.untilSec) ?? decoded.frames[decoded.frames.length - 1];
      g.fillStyle = '#000'; g.fillRect(0, 0, sz, sz);
      if (fit === 'contain') paintBlurredBackdrop(g, f.image, p.width, p.height, sz);
      g.drawImage(f.image, r.x * k, r.y * k, r.w * k, r.h * k);
    };
    const blob = (await encodeSquareMp4(side, total, paintGif, onProgress)) ?? (await recordSquare(side, total, paintGif, onProgress));
    URL.revokeObjectURL(p.url);
    return { blob, durationSec: total };
  }
  // Fallback: the browser animates the <img>; sample it live for up to 6 s.
  const img = new Image(); img.src = p.url; await img.decode();
  const dur = 6;
  const blob = await recordSquare(side, dur, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, side, side);
    if (fit === 'contain') paintBlurredBackdrop(g, img, p.width, p.height, side);
    g.drawImage(img, r.x, r.y, r.w, r.h);
  }, onProgress);
  URL.revokeObjectURL(p.url);
  return { blob, durationSec: dur };
}
