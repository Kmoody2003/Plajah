// The pro codec pack for devices without a native ffmpeg (the Android app, and any desktop that has
// lost its engine): the full FFmpeg as WebAssembly, downloaded once when first needed and kept in the
// browser cache. Slower than hardware, but it makes ProRes, DNxHR, MPEG-2 and MXF on a phone.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { buildFfmpegArgs } from './engine';
import { extFor } from './formats';
import type { ConvertProgress, ConvertResult, Recipe, SourceFile } from './types';

const VERSION = '0.12.10';
const BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${VERSION}/dist/esm`;
const CACHE = `plajah-crossover-propack-${VERSION}`;
export const PRO_PACK_MB = 32;

// Measured by encoding through the pack: these are missing from its build, or hang in it (H.265, Motion JPEG).
const PACK_CANT_MAKE = new Set(['h265', 'av1', 'vp9', 'vvc', 'xvid', 'hap', 'jpeg2000', 'mjpeg']);

export const packCanMake = (recipe: Recipe) =>
  !PACK_CANT_MAKE.has(recipe.videoCodecId || '') && !(recipe.containerId === 'mxf' && recipe.videoCodecId === 'prores');

let loading: Promise<FFmpeg> | null = null;

/** Fetched through the Cache API so the pack only ever downloads once. */
async function cachedBlobUrl(url: string, mime: string, onBytes: (got: number, total: number) => void): Promise<string> {
  const cache = await caches.open(CACHE);
  let res = await cache.match(url);
  if (!res) {
    const net = await fetch(url);
    if (!net.ok || !net.body) throw new Error(`Couldn't download the pro codec pack (${net.status}).`);
    const total = +(net.headers.get('content-length') || 0);
    const reader = net.clone().body!.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      onBytes(got, total);
    }
    await cache.put(url, net);
    res = (await cache.match(url))!;
  }
  return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime }));
}

export async function proPackInstalled(): Promise<boolean> {
  try {
    return !!(await (await caches.open(CACHE)).match(`${BASE}/ffmpeg-core.wasm`));
  } catch {
    return false;
  }
}

export function loadProPack(onProgress?: (fraction: number) => void): Promise<FFmpeg> {
  if (loading) return loading;
  loading = (async () => {
    const ffmpeg = new FFmpeg();
    const coreURL = await cachedBlobUrl(`${BASE}/ffmpeg-core.js`, 'text/javascript', () => {});
    const wasmURL = await cachedBlobUrl(`${BASE}/ffmpeg-core.wasm`, 'application/wasm', (got) => onProgress?.(Math.min(0.99, got / (PRO_PACK_MB * 1e6)))); // content-length counts compressed bytes
    await ffmpeg.load({ coreURL, wasmURL });
    return ffmpeg;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

/** One live picture a second, taken from the source at the position being converted. */
function sourcePreview(file: Blob) {
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let last = -Infinity;
  video.onseeked = () => {
    if (!ctx || !video.videoWidth) return;
    canvas.width = 480;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  };
  return {
    canvas,
    at: (sec: number) => { if (sec - last >= 1) { last = sec; video.currentTime = sec; } },
    stop: () => URL.revokeObjectURL(video.src),
  };
}

export async function proPackConvert(
  source: SourceFile,
  recipe: Recipe,
  onProgress: (p: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<ConvertResult> {
  if (!source.file) throw new Error('This file is not on the device.');
  onProgress({ progress: 0, line: 'Getting the pro codec pack' });
  const ffmpeg = await loadProPack((f) => onProgress({ progress: 0, line: `Getting the pro codec pack: ${Math.round(f * 100)}%` }));

  const dir = '/in';
  const inExt = source.name.split('.').pop() || 'bin';
  const named = new File([source.file], `input.${inExt}`);
  const ext = extFor(recipe, source.kind);
  const out = `output.${ext}`;
  await ffmpeg.createDir(dir).catch(() => {});
  // WORKERFS reads the file where it is, so a big source doesn't have to fit in the wasm heap.
  await ffmpeg.mount('WORKERFS' as any, { files: [named] }, dir);

  const preview = source.kind === 'video' ? sourcePreview(source.file) : null;
  const started = performance.now();
  const logTail: string[] = [];
  const onLog = ({ message }: { message: string }) => { logTail.push(message); if (logTail.length > 16) logTail.shift(); };
  // A wasm encoder can hang without an error (libx265 does); a job that goes silent is stopped.
  let lastSign = performance.now();
  let stalled = false;
  const watchdog = setInterval(() => {
    if (performance.now() - lastSign > 120000) { stalled = true; ffmpeg.terminate(); loading = null; }
  }, 5000);
  const onProg = ({ progress, time }: { progress: number; time: number }) => {
    lastSign = performance.now();
    const sec = time / 1e6;
    const p = Math.max(0, Math.min(0.999, progress));
    const elapsed = (performance.now() - started) / 1000;
    preview?.at(sec);
    onProgress({
      progress: p, outSec: sec,
      speed: elapsed > 1 && sec > 0 ? `${(sec / elapsed).toFixed(2)}x` : undefined,
      etaSec: p > 0.01 ? (elapsed * (1 - p)) / p : undefined,
      previewCanvas: preview?.canvas,
    });
  };
  ffmpeg.on('log', onLog);
  ffmpeg.on('progress', onProg);
  // Terminating is the only way to stop a running wasm job; the pack reloads from cache next time.
  const onAbort = () => { ffmpeg.terminate(); loading = null; };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const code = await ffmpeg.exec(buildFfmpegArgs(`${dir}/${named.name}`, { ...recipe, hwAccel: 'none' }, out, source.kind));
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    if (code !== 0) {
      const reason = logTail.filter((l) => /unknown encoder|error|invalid|not found|unsupported/i.test(l)).pop() || logTail[logTail.length - 1];
      throw new Error(reason || 'The codec pack could not make this format.');
    }
    const data = await ffmpeg.readFile(out) as Uint8Array;
    await ffmpeg.deleteFile(out).catch(() => {});
    const blob = new Blob([data as BlobPart]);
    onProgress({ progress: 1 });
    return {
      outputUrl: URL.createObjectURL(blob),
      outputName: `${source.name.replace(/\.[^.]+$/, '')}.${ext}`,
      backend: 'client',
      sizeBytes: blob.size,
      blob,
    };
  } catch (e: any) {
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    if (stalled) throw new Error('The codec pack stopped responding on this format. Try another codec, or use the desktop app.');
    throw e;
  } finally {
    clearInterval(watchdog);
    signal?.removeEventListener('abort', onAbort);
    preview?.stop();
    if (!signal?.aborted && !stalled) {
      ffmpeg.off('log', onLog);
      ffmpeg.off('progress', onProg);
      await ffmpeg.unmount(dir).catch(() => {});
    }
  }
}
