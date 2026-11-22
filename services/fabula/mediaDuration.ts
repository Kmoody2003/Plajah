// ═══════════════════════════════════════════════════════════════════════════
// mediaDuration — the TRUE length of every timeline source.
//
// WHY THIS EXISTS. Imports used to enter the pool with `duration: 5` and only got a
// real length if a slow, sequential Crossover probe later succeeded. Anything placed
// on the timeline before that (or after a failed probe) became a 5-second clip: long
// clips stopped short, short clips "stretched" (froze on their last frame past the
// end of the file), and trims could run past either end of the source.
//
// Model:
//   • probeMediaDuration() reads container metadata through a throwaway media element
//     (instant for local blob/file URLs — no decode, no full read).
//   • Assets carry `durProbed: true` once their length is real. Until then the length
//     is UNKNOWN and nothing clamps to it.
//   • Clips placed from an unknown length carry `durAuto: true`; reconcileClipDurations()
//     snaps them to the real length (frame-quantised, never overlapping the next clip).
//   • sourceLimit()/clampTrim() keep every edit inside the source file.
// Pure helpers are unit-tested — tests/mediaDuration.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

export type ProbeKind = 'video' | 'audio';

/** Read a media URL's duration from container metadata. Resolves null on failure/timeout. */
export function probeMediaDuration(url: string, kind: ProbeKind = 'video', timeoutMs = 15000): Promise<number | null> {
  if (typeof document === 'undefined' || !url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video') as HTMLMediaElement;
    let done = false;
    const finish = (v: number | null) => {
      if (done) return; done = true;
      clearTimeout(timer);
      el.removeAttribute('src'); try { el.load(); } catch { /* */ }
      resolve(v != null && Number.isFinite(v) && v > 0 ? v : null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) { finish(el.duration); return; }
      // MediaRecorder WebM/streamed files report Infinity until the end is seeked once.
      el.ondurationchange = () => { if (Number.isFinite(el.duration) && el.duration > 0) finish(el.duration); };
      try { el.currentTime = 1e9; } catch { finish(null); }
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}

/** Is this asset's length real (not the legacy placeholder)? */
export function hasRealDuration(asset: any): boolean {
  if (!asset || !(asset.duration > 0)) return false;
  if (asset.durProbed) return true;
  // Legacy pools: anything other than the exact old 5 s placeholder came from a probe/import.
  return asset.duration !== 5;
}

const isTimeBased = (asset: any) => asset?.type === 'video' || asset?.type === 'audio';

/** Seconds of SOURCE available to a clip (Infinity when unknown / not time-based). */
export function sourceLimit(clip: any, pool: any[]): number {
  if (!clip?.assetId) return Infinity;
  let asset = (pool || []).find((a) => a.id === clip.assetId);
  let extra = 0;
  if (asset?.type === 'multicam') {
    const ang = asset.angles?.[clip.angle || 0];
    extra = ang?.offset || 0;
    asset = ang ? (pool || []).find((a) => a.id === ang.assetId) : null;
  }
  if (!isTimeBased(asset) || !hasRealDuration(asset)) return Infinity;
  if ((clip.speed || 1) !== 1) return Infinity; // retimed clips own their own length math
  return Math.max(0, asset.duration - extra);
}

/** Floor to the frame grid (never round a clip PAST the last real frame). */
export const floorFrame = (t: number, fps: number) => Math.floor(t * fps + 1e-6) / fps;
export const roundFrame = (t: number, fps: number) => Math.round(t * fps) / fps;

/**
 * Snap auto-length clips to their real source length and clamp any clip that runs
 * past the end of its source. Returns the SAME array when nothing changed.
 */
export function reconcileClipDurations(clips: any[], pool: any[], fps = 24): any[] {
  if (!Array.isArray(clips) || !clips.length) return clips;
  const frame = 1 / (fps || 24);
  let changed = false;
  const next = clips.map((c) => ({ ...c }));
  const byTrack = new Map<string, any[]>();
  for (const c of next) { const l = byTrack.get(c.trackId) || []; l.push(c); byTrack.set(c.trackId, l); }
  for (const l of byTrack.values()) l.sort((a, b) => a.start - b.start);
  const nextStart = (c: any) => {
    const l = byTrack.get(c.trackId) || [];
    const n = l.find((x) => x !== c && x.start >= c.start + 1e-4);
    return n ? n.start : Infinity;
  };
  // Pass 1: compute target durations.
  const target = new Map<string, number>();
  for (const c of next) {
    const lim = sourceLimit(c, pool);
    if (!Number.isFinite(lim)) continue;
    const avail = floorFrame(Math.max(frame, lim - (c.srcIn || 0)), fps || 24);
    let d = c.duration;
    // Placed while its asset still carried the old 5 s placeholder (pre-durAuto projects).
    const legacy = !c.durAuto && !c.srcIn && Math.abs(c.duration - 5) < 1e-3
      && (pool || []).some((a) => a.id === c.assetId && a.legacyPlaceholder);
    if (legacy) c.durAuto = true;
    if (c.durAuto) d = avail;
    else if (d > avail + frame / 2) d = avail;
    if (d !== c.duration || c.durAuto) target.set(c.id, d);
  }
  if (!target.size) return clips;
  // Linked A/V clips share one length (the shorter wins — never past either source).
  for (const c of next) {
    if (!c.linkId || !target.has(c.id)) continue;
    for (const s of next) if (s.linkId === c.linkId && s.id !== c.id) {
      const a = target.get(c.id)!; const b = target.has(s.id) ? target.get(s.id)! : (s.durAuto ? a : s.duration);
      const m = Math.min(a, b); target.set(c.id, m); target.set(s.id, m);
    }
  }
  // Pass 2: apply, never growing a clip into its neighbour.
  for (const c of next) {
    if (!target.has(c.id)) continue;
    let d = target.get(c.id)!;
    if (d > c.duration) {
      let room = nextStart(c) - c.start;
      if (c.linkId) for (const s of next) if (s.linkId === c.linkId && s.id !== c.id) room = Math.min(room, nextStart(s) - s.start);
      d = Math.max(c.duration, Math.min(d, room));
    }
    d = Math.max(frame, roundFrame(d, fps || 24));
    if (Math.abs(d - c.duration) > 1e-6 || c.durAuto) {
      c.duration = d;
      delete c.durAuto;
      changed = true;
    }
  }
  return changed ? next : clips;
}

/**
 * Clamp a trim/slip so the clip window stays inside its source.
 * Inputs/outputs are timeline values; `limit` comes from sourceLimit().
 */
export function clampWindow(srcIn: number, duration: number, limit: number, minDur: number) {
  let s = Math.max(0, srcIn);
  let d = Math.max(minDur, duration);
  if (Number.isFinite(limit)) {
    if (d > limit) d = Math.max(minDur, limit);
    if (s + d > limit) s = Math.max(0, limit - d);
  }
  return { srcIn: s, duration: d };
}
