import { renderTimeline } from '../components/plajahPixels/engine/core/offlineRenderer';
import type { RenderLayer } from '../components/plajahPixels/engine/timeline/sceneTimeline';
import { auth, uploadFile } from './backendService';
import { SEAM_THRESHOLD, type Daypart, type RestLoop } from './oraRest';

// ─────────────────────────────────────────────────────────────────────────
// Ora — Rest loop rendering, on the Pixels offline renderer.
//
// This is the "run it once" process. It renders silent, generator-only ambient
// loops deterministically (t = N/fps) through the same GPU compositor the live
// Pixels engine uses, then measures the seam and uploads.
//
// IT RUNS IN A BROWSER, NOT ON A SERVER. renderTimeline depends on WebGL and
// WebCodecs, so there is no server-side path without headless Chrome. In
// practice that means an operator opens the render page once, and the resulting
// library is shared by every account forever after — which is the whole reason
// this design is cheap.
//
// THE SEAM CHECK is the part that matters for user submissions. Whether a loop
// is seamless is not something an author gets to assert: checkSeam decodes the
// first and last frame of the actual file and measures how different they are.
// A visible jump every few minutes is fatal on a sleep channel, so Rest refuses
// anything above SEAM_THRESHOLD — while an ordinary FAST channel, where cuts
// between programmes are normal, can still carry it.
// ─────────────────────────────────────────────────────────────────────────

export interface RestPreset {
  id: string;
  title: string;
  daypart: Daypart;
  /** Pixels generator mode — see components/plajahPixels/engine/core/generators. */
  mode: string;
  /** Up to three [r,g,b] 0..1 palette entries. */
  palette: number[][];
  /** iParam0..3, feeding the generator's own motion. */
  params: number[];
  durationSec: number;
}

const hex = (h: string): number[] => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

/**
 * The default library. Slow parameters throughout — these are meant to be
 * watched at 3am, so nothing pulses, strobes or moves faster than breathing.
 * Palettes are drawn from the Plajah design tokens rather than invented.
 */
export const DEFAULT_PRESETS: RestPreset[] = [
  { id: 'dawn-aurora', title: 'First light', daypart: 'DAWN', mode: 'STUDIO_AURORA',
    palette: [hex('#D0BCFF'), hex('#FF8C00'), hex('#6B0099')], params: [0.12, 0.3, 0.2, 0.1], durationSec: 180 },
  { id: 'dawn-liquid', title: 'Slow tide', daypart: 'DAWN', mode: 'LIQUID',
    palette: [hex('#00DAF3'), hex('#D0BCFF'), hex('#6B0099')], params: [0.1, 0.25, 0.15, 0.1], durationSec: 180 },
  { id: 'day-luminance', title: 'Open sky', daypart: 'DAY', mode: 'LUMINANCE',
    palette: [hex('#00DAF3'), hex('#D0BCFF'), hex('#FF8C00')], params: [0.14, 0.2, 0.2, 0.1], durationSec: 180 },
  { id: 'day-ripple', title: 'Still water', daypart: 'DAY', mode: 'STUDIO_RIPPLE',
    palette: [hex('#00DAF3'), hex('#6B0099'), hex('#D0BCFF')], params: [0.09, 0.22, 0.18, 0.08], durationSec: 180 },
  { id: 'dusk-nebula', title: 'Golden hour', daypart: 'DUSK', mode: 'STUDIO_NEBULA',
    palette: [hex('#FF8C00'), hex('#D40055'), hex('#6B0099')], params: [0.1, 0.28, 0.16, 0.09], durationSec: 180 },
  { id: 'dusk-gravity', title: 'Long shadows', daypart: 'DUSK', mode: 'STUDIO_GRAVITY',
    palette: [hex('#D40055'), hex('#FF8C00'), hex('#6B0099')], params: [0.08, 0.2, 0.14, 0.07], durationSec: 180 },
  { id: 'night-cosmic', title: 'Small hours', daypart: 'NIGHT', mode: 'COSMIC',
    palette: [hex('#6B0099'), hex('#00DAF3'), hex('#D0BCFF')], params: [0.06, 0.18, 0.12, 0.05], durationSec: 240 },
  { id: 'night-vortex', title: 'Deep water', daypart: 'NIGHT', mode: 'VORTEX',
    palette: [hex('#6B0099'), hex('#D0BCFF'), hex('#00DAF3')], params: [0.05, 0.15, 0.1, 0.05], durationSec: 240 },
];

/** One full-frame generator layer, constant for the whole loop. */
function layersFor(preset: RestPreset): (t: number) => RenderLayer[] {
  return (t: number) => [{
    id: preset.id,
    blendMode: 'normal',
    opacity: 1,
    time: t,
    clip: { type: 'generator', sceneMode: preset.mode, params: preset.params },
  }];
}

/**
 * Mean per-pixel difference between the first and last frame of a rendered
 * video, 0 (identical) → 1. Decoded from the real file, never asserted.
 *
 * Sampled at 128×72: large enough to catch a structural jump, small enough that
 * codec noise on individual pixels does not register as a seam.
 */
export async function checkSeam(blob: Blob): Promise<number | null> {
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  const W = 128, H = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { URL.revokeObjectURL(url); return null; }

  const seekTo = (t: number) => new Promise<ImageData | null>((resolve) => {
    const onSeeked = () => {
      try {
        ctx.drawImage(video, 0, 0, W, H);
        resolve(ctx.getImageData(0, 0, W, H));
      } catch { resolve(null); }
      video.removeEventListener('seeked', onSeeked);
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('decode failed')), { once: true });
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return null;

    const first = await seekTo(0);
    // A hair before the end: the very last frame is often not seekable.
    const last = await seekTo(Math.max(0, duration - 0.05));
    if (!first || !last) return null;

    let sum = 0;
    for (let i = 0; i < first.data.length; i += 4) {
      sum += Math.abs(first.data[i] - last.data[i])
           + Math.abs(first.data[i + 1] - last.data[i + 1])
           + Math.abs(first.data[i + 2] - last.data[i + 2]);
    }
    return sum / ((first.data.length / 4) * 3 * 255);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

export interface RenderedLoop {
  preset: RestPreset;
  blob: Blob;
  seam: number | null;
  /** False when the seam is unmeasurable or above threshold — Rest will refuse it. */
  restEligible: boolean;
}

/** Render one preset to an MP4 and measure its seam. Silent: audioBuffer is null. */
export async function renderRestLoop(
  preset: RestPreset,
  opts: { width?: number; height?: number; fps?: number; onProgress?: (p: number, stage: string) => void } = {},
): Promise<RenderedLoop | null> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const blob = await renderTimeline({
    resolveLayers: layersFor(preset),
    duration: preset.durationSec,
    audioBuffer: null,              // silent by design — no rights questions at all
    config: { colorPalette: preset.palette },
    width, height,
    fps: opts.fps ?? 30,
    onProgress: opts.onProgress,
  });
  if (!blob) return null;
  const seam = await checkSeam(blob);
  return {
    preset, blob, seam,
    restEligible: seam !== null && seam <= SEAM_THRESHOLD,
  };
}

/**
 * Render the whole default library, one preset at a time.
 *
 * Sequential on purpose: each render saturates the encoder, and running them in
 * parallel on a laptop makes every one of them slower.
 */
export async function renderDefaultLibrary(
  onStep?: (done: number, total: number, title: string) => void,
): Promise<RenderedLoop[]> {
  const out: RenderedLoop[] = [];
  for (let i = 0; i < DEFAULT_PRESETS.length; i++) {
    const p = DEFAULT_PRESETS[i];
    onStep?.(i, DEFAULT_PRESETS.length, p.title);
    const r = await renderRestLoop(p);
    if (r) out.push(r);
  }
  onStep?.(DEFAULT_PRESETS.length, DEFAULT_PRESETS.length, 'done');
  return out;
}

/**
 * Upload a rendered loop and return the document to write.
 *
 * `status` is left to the caller: the platform's own defaults go straight to
 * APPROVED, a user submission starts at SUBMITTED and waits for review. The
 * measured seam travels with it either way, so eligibility is never re-asserted.
 */
export async function publishLoop(
  r: RenderedLoop,
  status: RestLoop['status'],
): Promise<RestLoop | null> {
  const uid = auth.currentUser?.uid;
  const id = status === 'APPROVED' && !uid ? r.preset.id : `${r.preset.id}_${Date.now().toString(36)}`;
  const path = `oraRest/${id}.mp4`;
  let url: string;
  try {
    url = await uploadFile(path, r.blob);
  } catch {
    return null;
  }
  return {
    id,
    daypart: r.preset.daypart,
    mode: r.preset.mode,
    title: r.preset.title,
    url,
    durationSec: r.preset.durationSec,
    width: 1280,
    height: 720,
    createdAt: Date.now(),
    authorUid: uid ?? undefined,
    authorName: auth.currentUser?.displayName ?? undefined,
    status,
    seam: r.seam ?? undefined,
  };
}
