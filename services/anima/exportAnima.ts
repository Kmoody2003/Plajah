/**
 * services/anima/exportAnima.ts — render an Anima project to video (WebM / MP4) or a PNG sequence.
 *
 * Offline and frame-exact: every frame is drawn once by the same renderer the stage uses, with
 * images preloaded, video plates seeked to that frame, and effect simulations advanced by exactly
 * 1/fps. The camera view is used when the project has a camera. Nothing is shown on screen.
 */

import type { AnimaProject } from './types';
import { AnimaRenderRuntime, renderAnimaFrame } from './render';
import { frameToTime } from './evaluator';

export type AnimaVideoFormat = 'webm' | 'mp4';

export interface AnimaExportOptions {
  /** Inclusive, 1-based. Defaults to the whole clip. */
  from?: number;
  to?: number;
  /** Output size multiplier (0.5 = half resolution). */
  scale?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
  }
}

function range(p: AnimaProject, o: AnimaExportOptions) {
  const from = Math.max(1, Math.min(p.durationFrames, Math.round(o.from ?? 1)));
  const to = Math.max(from, Math.min(p.durationFrames, Math.round(o.to ?? p.durationFrames)));
  return { from, to, total: to - from + 1 };
}

/** Even dimensions (H.264 and some VP9 encoders require them). */
function outSize(p: AnimaProject, scale = 1) {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { w: even(p.width * scale), h: even(p.height * scale) };
}

async function preload(p: AnimaProject, rt: AnimaRenderRuntime) {
  const urls = new Set<string>();
  for (const l of p.layers) if (l.visible && l.plate?.kind === 'image') urls.add(l.plate.url);
  for (const d of Object.values(p.drawingBank)) {
    const u = d.rasterUrl || d.rasterDataUrl;
    if (u) urls.add(u);
  }
  await Promise.all([...urls].map((u) => rt.loadImage(u)));
}

/** Draws frames from..to into `canvas`, calling `each` after every frame. */
async function renderEach(
  p: AnimaProject,
  canvas: HTMLCanvasElement,
  o: AnimaExportOptions & { transparent?: boolean },
  each: (frame: number, index: number) => Promise<void>
) {
  const ctx = canvas.getContext('2d', { alpha: !!o.transparent });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const rt = new AnimaRenderRuntime();
  const { from, to, total } = range(p, o);
  try {
    await preload(p, rt);
    const videos = p.layers.filter((l) => l.visible && l.plate?.kind === 'video').map((l) => l.plate!.url);
    for (let f = from, i = 0; f <= to; f++, i++) {
      if (o.signal?.aborted) throw new ExportCancelled();
      const t = frameToTime(f, p.fps);
      for (const url of videos) await rt.seekVideo(url, t);
      renderAnimaFrame(ctx, p, f, rt, { playing: false, simulate: true, dt: 1 / p.fps, now: t, transparent: o.transparent });
      await each(f, i);
      o.onProgress?.(i + 1, total);
      // Let the page breathe on long renders.
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    rt.dispose();
  }
}

/** Which codec this browser can encode for the format, or null. */
export async function pickVideoCodec(format: AnimaVideoFormat, w: number, h: number): Promise<'vp9' | 'vp8' | 'avc' | null> {
  const { canEncodeVideo } = await import('mediabunny');
  const candidates: ('vp9' | 'vp8' | 'avc')[] = format === 'webm' ? ['vp9', 'vp8'] : ['avc'];
  for (const c of candidates) if (await canEncodeVideo(c, { width: w, height: h }).catch(() => false)) return c;
  return null;
}

export async function exportAnimaVideo(p: AnimaProject, format: AnimaVideoFormat, o: AnimaExportOptions = {}): Promise<Blob> {
  const { Output, BufferTarget, WebMOutputFormat, Mp4OutputFormat, CanvasSource, QUALITY_HIGH } = await import('mediabunny');
  const { w, h } = outSize(p, o.scale);
  const codec = await pickVideoCodec(format, w, h);
  if (!codec) throw new Error(format === 'webm' ? "This browser can't encode WebM video. Try MP4 or a PNG sequence." : "This browser can't encode MP4 video. Try WebM or a PNG sequence.");
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const target = new BufferTarget();
  const output = new Output({ format: format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: p.fps });
  await output.start();
  try {
    await renderEach(p, canvas, o, async (_f, i) => {
      await source.add(i / p.fps, 1 / p.fps);
    });
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }
  return new Blob([target.buffer!], { type: format === 'webm' ? 'video/webm' : 'video/mp4' });
}

/** Every frame as a PNG (transparent background), zipped: `<name>_0001.png` … */
export async function exportAnimaPngSequence(p: AnimaProject, o: AnimaExportOptions = {}): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const { w, h } = outSize(p, o.scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const base = (p.name || 'anima').replace(/[^\w-]+/g, '_').slice(0, 60) || 'anima';
  const files: Record<string, Uint8Array> = {};
  await renderEach(p, canvas, { ...o, transparent: true }, async (f) => {
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed.');
    files[`${base}_${String(f).padStart(4, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
  });
  // PNGs are already compressed: store them (level 0) so zipping is instant.
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
