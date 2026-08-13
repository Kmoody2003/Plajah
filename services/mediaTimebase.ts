// mediaTimebase — the ONE canonical time description every Plajah video must carry.
//
// WHY THIS EXISTS: FAST channels, the EPG, Fabula and every other time-based feature schedule against
// a video's length. Historically `duration` was optional and usually absent (uploadVideo never wrote
// it), so the FAST auto-generator fell back to a 30-minute DEFAULT_VIDEO_SEC block. A 102-second
// teaser then owned a 30-minute slot: playout seeked past the asset's end, it ended instantly, and the
// remaining ~28 minutes became filler — a channel that looked permanently stuck in an ad break.
// A rounded whole-second duration is also not enough to cut or schedule frame-accurately.
//
// THE STANDARD: durationSec is the exact float; fps is a real (possibly fractional) rate; frameCount
// is the authoritative integer length. Everything else is derived. A record that satisfies
// isCompleteTimebase() is safe to schedule against; anything else must be treated as UNKNOWN and
// re-probed — never silently defaulted to a fixed block again.

export const TIMEBASE_VERSION = 1;

/** Broadcast rates we snap to. Fractional NTSC rates are exact rationals (n/1001), not decimals. */
export const STANDARD_FPS = [
  24000 / 1001, // 23.976
  24,
  25,
  30000 / 1001, // 29.97
  30,
  48,
  50,
  60000 / 1001, // 59.94
  60,
  120,
] as const;

export type TimebaseSource = 'file' | 'hls' | 'mux' | 'library' | 'manual' | 'stream';

export interface MediaTimebase {
  /** Exact duration in seconds (float, NOT rounded). */
  durationSec: number;
  /** Frames per second — a real rate (29.97 is stored as 29.97002997…, not 30). */
  fps: number;
  /** Authoritative integer length. durationSec * fps, rounded. */
  frameCount: number;
  /** SMPTE duration, HH:MM:SS:FF (drop-frame uses ';' before frames). */
  timecode: string;
  /** True when fps is an NTSC rate AND the timecode is drop-frame compensated. */
  dropFrame: boolean;
  width?: number;
  height?: number;
  /** Where the measurement came from — 'mux'/'hls' are authoritative, 'file' is measured locally. */
  source: TimebaseSource;
  /** True when fps was measured by sampling rather than declared by a manifest/API. */
  fpsEstimated: boolean;
  probedAt: number;
  version: number;
}

/** Snap a measured rate to the nearest broadcast standard when within tolerance (default 2%). */
export function snapFps(measured: number, tolerance = 0.02): { fps: number; snapped: boolean } {
  if (!(measured > 0) || !Number.isFinite(measured)) return { fps: 0, snapped: false };
  let best = 0, bestErr = Infinity;
  for (const s of STANDARD_FPS) {
    const err = Math.abs(s - measured) / s;
    if (err < bestErr) { bestErr = err; best = s; }
  }
  return bestErr <= tolerance ? { fps: best, snapped: true } : { fps: measured, snapped: false };
}

const isNtsc = (fps: number) => {
  const r = fps * 1001;
  return Math.abs(r - Math.round(r)) < 0.5 && Math.abs(fps - Math.round(fps)) > 1e-6;
};

/**
 * Frames → SMPTE timecode. Non-drop is a plain base-`nominal` count. Drop-frame (29.97/59.94 only)
 * skips 2 (or 4) frame NUMBERS at the top of every minute except every tenth minute, so the timecode
 * tracks wall clock — the standard NTSC correction.
 */
export function framesToTimecode(frameCount: number, fps: number, dropFrame = false): string {
  const nominal = Math.round(fps); // 29.97 -> 30
  if (!(nominal > 0) || !Number.isFinite(frameCount) || frameCount < 0) return '00:00:00:00';
  let f = Math.round(frameCount);

  if (dropFrame && (nominal === 30 || nominal === 60)) {
    const dropPerMin = nominal === 30 ? 2 : 4;
    const framesPer10Min = nominal * 60 * 10 - dropPerMin * 9;
    const framesPerMin = nominal * 60 - dropPerMin;
    const tenMins = Math.floor(f / framesPer10Min);
    let rem = f % framesPer10Min;
    // The first minute of each 10-minute block drops nothing.
    if (rem >= nominal * 60) {
      const minsIn = Math.floor((rem - nominal * 60) / framesPerMin) + 1;
      f += dropPerMin * (9 * tenMins + minsIn);
    } else {
      f += dropPerMin * 9 * tenMins;
    }
  }

  const ff = f % nominal;
  const totalSec = Math.floor(f / nominal);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}${dropFrame ? ';' : ':'}${p(ff)}`;
}

/** Build a complete, self-consistent timebase from an exact duration + rate. */
export function makeTimebase(
  durationSec: number, fps: number, source: TimebaseSource,
  opts: { width?: number; height?: number; fpsEstimated?: boolean; dropFrame?: boolean } = {},
): MediaTimebase | null {
  if (!(durationSec > 0) || !Number.isFinite(durationSec) || !(fps > 0) || !Number.isFinite(fps)) return null;
  const frameCount = Math.round(durationSec * fps);
  const dropFrame = opts.dropFrame ?? isNtsc(fps);
  return {
    durationSec,
    fps,
    frameCount,
    timecode: framesToTimecode(frameCount, fps, dropFrame),
    dropFrame,
    ...(opts.width ? { width: opts.width } : {}),
    ...(opts.height ? { height: opts.height } : {}),
    source,
    fpsEstimated: !!opts.fpsEstimated,
    probedAt: Date.now(),
    version: TIMEBASE_VERSION,
  };
}

/**
 * THE gate. A video may only be scheduled against a timebase that passes this. Anything failing is
 * UNKNOWN and must be re-probed — the old behaviour of quietly substituting a 30-minute block is what
 * broke FAST, so callers must branch on this rather than fall back to a constant.
 */
export function isCompleteTimebase(tb: any): tb is MediaTimebase {
  return !!tb
    && typeof tb.durationSec === 'number' && tb.durationSec > 0 && Number.isFinite(tb.durationSec)
    && typeof tb.fps === 'number' && tb.fps > 0 && Number.isFinite(tb.fps)
    && typeof tb.frameCount === 'number' && tb.frameCount > 0
    && typeof tb.timecode === 'string' && /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/.test(tb.timecode)
    && typeof tb.version === 'number';
}

/**
 * Exact seconds for scheduling: the timebase when present, else the stored whole seconds, else 0.
 * Lives here (not in the backfill module) so schedule/guide code can use it without pulling in
 * backendService. 0 means UNKNOWN — callers must not turn that into a default block.
 */
export function exactDurationSec(v: { duration?: number; timebase?: any } | null | undefined): number {
  if (isCompleteTimebase(v?.timebase)) return (v as any).timebase.durationSec;
  const d = Number(v?.duration);
  return d > 0 && Number.isFinite(d) ? d : 0;
}

const isHlsUrl = (u: string) => /\.m3u8($|[?#])/i.test(u) || u.includes('stream.mux.com');

/**
 * fps by sampling requestVideoFrameCallback: each callback reports the frame's `mediaTime` and the
 * cumulative `presentedFrames`, so Δframes/Δmediatime IS the source rate. Sampled over ~1.2s of muted
 * playback then snapped to a broadcast standard. Returns 0 when rVFC is unavailable.
 */
function measureFpsByFrameCallback(el: HTMLVideoElement, sampleMs = 1200): Promise<number> {
  const anyEl = el as any;
  if (typeof anyEl.requestVideoFrameCallback !== 'function') return Promise.resolve(0);
  return new Promise<number>(resolve => {
    let first: { t: number; f: number } | null = null;
    let last: { t: number; f: number } | null = null;
    const started = performance.now();
    let settled = false;
    const done = () => {
      if (settled) return; settled = true;
      if (!first || !last) return resolve(0);
      const dt = last.t - first.t, df = last.f - first.f;
      resolve(dt > 0.2 && df > 3 ? df / dt : 0);
    };
    const onFrame = (_now: number, meta: any) => {
      const s = { t: meta.mediaTime, f: meta.presentedFrames };
      if (!first) first = s; else last = s;
      if (performance.now() - started >= sampleMs) return done();
      try { anyEl.requestVideoFrameCallback(onFrame); } catch { done(); }
    };
    try { anyEl.requestVideoFrameCallback(onFrame); } catch { return resolve(0); }
    setTimeout(done, sampleMs + 1500);
  });
}

/** Pull the declared FRAME-RATE out of an HLS master playlist — exact, and free (no playback). */
export async function frameRateFromHlsManifest(url: string, timeoutMs = 8000): Promise<number> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return 0;
    const text = await res.text();
    // Highest declared FRAME-RATE across renditions (they should agree; take the max defensively).
    const rates = [...text.matchAll(/FRAME-RATE=([\d.]+)/gi)].map(m => parseFloat(m[1])).filter(n => n > 0);
    return rates.length ? Math.max(...rates) : 0;
  } catch { return 0; }
}

/** Mount a hidden <video> for probing; caller must call the returned cleanup. */
function hiddenVideo(): { el: HTMLVideoElement; cleanup: () => void } {
  const el = document.createElement('video');
  el.preload = 'auto'; el.muted = true; (el as any).playsInline = true;
  el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
  try { document.body.appendChild(el); } catch { /* */ }
  return {
    el,
    cleanup: () => {
      try { el.pause(); } catch { /* */ }
      try { el.removeAttribute('src'); el.load?.(); } catch { /* */ }
      try { el.remove(); } catch { /* */ }
    },
  };
}

/** What a probe learned. `durationSec` can be valid even when the rate isn't knowable — callers must
 *  still persist it, because losing the duration is what re-creates the default-block bug. */
export interface TimeInfo { timebase: MediaTimebase | null; durationSec: number; }

async function timeInfoFromElement(
  el: HTMLVideoElement, source: TimebaseSource, declaredFps: number, timeoutMs: number,
): Promise<TimeInfo> {
  const durationSec = await new Promise<number>(resolve => {
    if (Number.isFinite(el.duration) && el.duration > 0) return resolve(el.duration);
    const to = setTimeout(() => resolve(0), timeoutMs);
    const ok = () => { if (Number.isFinite(el.duration) && el.duration > 0) { clearTimeout(to); resolve(el.duration); } };
    el.addEventListener('loadedmetadata', ok);
    el.addEventListener('durationchange', ok);
    el.onerror = () => { clearTimeout(to); resolve(0); };
  });
  if (!(durationSec > 0)) return { timebase: null, durationSec: 0 };

  let fps = declaredFps, estimated = false;
  if (!(fps > 0)) {
    // Sampling needs frames to actually present, so run muted playback briefly.
    try { await el.play(); } catch { /* autoplay-blocked: fall through to no-fps */ }
    const measured = await measureFpsByFrameCallback(el);
    try { el.pause(); el.currentTime = 0; } catch { /* */ }
    if (measured > 0) { fps = snapFps(measured).fps; estimated = true; }
  }
  // No rate is knowable — return the duration anyway rather than inventing an fps. A duration-only
  // result still keeps schedules honest; a fabricated rate would corrupt every frame calculation.
  if (!(fps > 0)) return { timebase: null, durationSec };

  return {
    timebase: makeTimebase(durationSec, fps, source, {
      width: el.videoWidth || undefined,
      height: el.videoHeight || undefined,
      fpsEstimated: estimated,
    }),
    durationSec,
  };
}

/** Measure a local File before upload — the most accurate moment, the bytes are right here. */
export async function extractTimeInfoFromFile(file: File, timeoutMs = 15000): Promise<TimeInfo> {
  const { el, cleanup } = hiddenVideo();
  const objUrl = URL.createObjectURL(file);
  try {
    el.src = objUrl;
    return await timeInfoFromElement(el, 'file', 0, timeoutMs);
  } catch { return { timebase: null, durationSec: 0 }; } finally {
    cleanup();
    try { URL.revokeObjectURL(objUrl); } catch { /* */ }
  }
}

export async function extractTimebaseFromFile(file: File, timeoutMs = 15000): Promise<MediaTimebase | null> {
  return (await extractTimeInfoFromFile(file, timeoutMs)).timebase;
}

/** Measure an already-published URL (Mux/HLS or a direct file). */
export async function extractTimeInfoFromUrl(url: string, timeoutMs = 15000): Promise<TimeInfo> {
  if (!url) return { timebase: null, durationSec: 0 };
  const { el, cleanup } = hiddenVideo();
  try {
    if (isHlsUrl(url)) {
      const declaredFps = await frameRateFromHlsManifest(url);
      const source: TimebaseSource = url.includes('stream.mux.com') ? 'mux' : 'hls';
      // hls.js LEVEL_LOADED carries the exact VOD total duration; prefer it over the element's.
      const viaHls = await new Promise<TimeInfo | null>(resolve => {
        let settled = false;
        const finish = (v: TimeInfo | null) => { if (!settled) { settled = true; resolve(v); } };
        const to = setTimeout(() => finish(null), timeoutMs);
        import('hls.js').then(({ default: Hls }) => {
          if (!Hls.isSupported()) { clearTimeout(to); return finish(null); }
          const hls = new Hls({ enableWorker: true });
          hls.on(Hls.Events.LEVEL_LOADED, (_e: any, data: any) => {
            const d = data?.details?.totalduration;
            if (d > 0) {
              clearTimeout(to);
              const lvl = (hls as any).levels?.[(hls as any).currentLevel] || (hls as any).levels?.[0];
              const fps = declaredFps > 0 ? declaredFps : (lvl?.frameRate || 0);
              try { hls.destroy(); } catch { /* */ }
              finish({
                timebase: fps > 0
                  ? makeTimebase(d, fps, source, { width: lvl?.width, height: lvl?.height, fpsEstimated: false })
                  : null,
                durationSec: d,
              });
            }
          });
          hls.on(Hls.Events.ERROR, (_e: any, data: any) => { if (data?.fatal) { clearTimeout(to); try { hls.destroy(); } catch { /* */ } finish(null); } });
          hls.loadSource(url); hls.attachMedia(el);
        }).catch(() => { clearTimeout(to); finish(null); });
      });
      if (viaHls) return viaHls;
      // Native-HLS engines (Safari/iOS): fall back to the element with the manifest's declared rate.
      el.src = url;
      return await timeInfoFromElement(el, source, declaredFps, timeoutMs);
    }
    el.src = url;
    return await timeInfoFromElement(el, 'file', 0, timeoutMs);
  } catch { return { timebase: null, durationSec: 0 }; } finally { cleanup(); }
}

export async function extractTimebaseFromUrl(url: string, timeoutMs = 15000): Promise<MediaTimebase | null> {
  return (await extractTimeInfoFromUrl(url, timeoutMs)).timebase;
}

/** Probe many urls with a concurrency cap → url → timebase (missing when unknown). */
export async function extractTimebases(
  urls: string[], concurrency = 4, timeoutMs = 15000,
): Promise<Map<string, MediaTimebase>> {
  const out = new Map<string, MediaTimebase>();
  const uniq = [...new Set(urls.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += concurrency) {
    const batch = uniq.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(u => extractTimebaseFromUrl(u, timeoutMs).then(tb => [u, tb] as const).catch(() => [u, null] as const)));
    results.forEach(([u, tb]) => { if (tb) out.set(u, tb); });
  }
  return out;
}
