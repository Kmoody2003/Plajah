// Shared frame-rate utilities for Fabula import and offline delivery.
// Browsers do not expose a video's encoded FPS in loadedmetadata, so we measure
// consecutive presented media timestamps with requestVideoFrameCallback.

export const STANDARD_VIDEO_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const;

export function normalizeVideoFrameRate(value: number | undefined | null): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return 0;
  const fps = Math.min(120, Math.max(1, value as number));
  const nearest = STANDARD_VIDEO_RATES.reduce((best, rate) =>
    Math.abs(rate - fps) < Math.abs(best - fps) ? rate : best, STANDARD_VIDEO_RATES[0]);
  return Math.abs(nearest - fps) / nearest <= 0.025 ? nearest : Math.round(fps * 1000) / 1000;
}

/** Preserve every frame from the fastest active source, capped at a practical 60 fps. */
export function sourceSafeRenderFrameRate(projectFps: number, sourceRates: number[]): number {
  const requested = normalizeVideoFrameRate(projectFps) || 30;
  const source = sourceRates.reduce((max, rate) => Math.max(max, normalizeVideoFrameRate(rate)), 0);
  return Math.min(60, Math.max(requested, source));
}

/** Integer microsecond timing derived from frame boundaries, avoiding cumulative drift. */
export function videoFrameTiming(frameIndex: number, fps: number): { timestamp: number; duration: number } {
  const rate = normalizeVideoFrameRate(fps) || 30;
  const timestamp = Math.round(frameIndex * 1_000_000 / rate);
  const next = Math.round((frameIndex + 1) * 1_000_000 / rate);
  return { timestamp, duration: next - timestamp };
}

export async function probeVideoFrameRate(
  url: string,
  signal?: AbortSignal,
  sampleFrames = 12,
): Promise<number> {
  if (typeof document === 'undefined' || !url) return 0;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // We inspect timing metadata, never pixels. Avoiding CORS mode lets cloud
  // videos without Access-Control response headers still be measured.
  video.style.cssText = 'position:fixed;width:2px;height:2px;left:-100px;top:-100px;opacity:0;pointer-events:none';
  document.body?.appendChild(video);

  try {
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('video metadata timeout')), 8000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('video load failed')); };
    });
    if (signal?.aborted || typeof (video as any).requestVideoFrameCallback !== 'function') return 0;

    const mediaTimes: number[] = [];
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(finish, 2500);
      const frame = (_now: number, meta: any) => {
        if (finished || signal?.aborted) { finish(); return; }
        if (Number.isFinite(meta?.mediaTime)) mediaTimes.push(meta.mediaTime);
        if (mediaTimes.length >= sampleFrames || video.ended) { finish(); return; }
        (video as any).requestVideoFrameCallback(frame);
      };
      (video as any).requestVideoFrameCallback(frame);
      video.play().catch(finish);
    });

    const deltas = mediaTimes.slice(1)
      .map((time, index) => time - mediaTimes[index])
      .filter(delta => delta > 0.004 && delta < 0.2)
      .sort((a, b) => a - b);
    if (!deltas.length) return 0;
    // The lower-middle delta resists an occasional dropped presentation without
    // mistaking a single timestamp glitch for a very high source frame rate.
    const delta = deltas[Math.floor((deltas.length - 1) * 0.4)];
    return normalizeVideoFrameRate(1 / delta);
  } catch {
    return 0;
  } finally {
    try { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); } catch { /* best effort */ }
  }
}
