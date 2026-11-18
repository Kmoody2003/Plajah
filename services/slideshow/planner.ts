// Themed Shows — the planner. Turns prepared photos + music into a timed list of camera
// segments. Pure and deterministic: same spec in, same plan out (Fabula clips rely on it).

import type { ClassicTransition, ShowPlan, ShowSegment, ShowSpec, VisitTiming } from './types';

/** Graceful defaults (seconds at pace 1). A memorial never hurries. */
export const PACE = {
  intro: 10,
  outro: 11,
  wide: 7,
  travel: 3.8,
  approach: 2.0,
  retreat: 2.6,
  dwellMin: 4.5,
  dwellMax: 11,
};

/** How long a photo deserves full page, before any fit-to-music scaling. */
export function baseDwell(interest: number, faces: number, pace = 1): number {
  const d = 5.2 + interest * 2.6 + Math.min(faces, 4) * 0.45;
  return clamp(d, PACE.dwellMin, PACE.dwellMax) * pace;
}

export function musicDuration(spec: ShowSpec): number {
  return spec.music.tracks.reduce((s, t) => s + (t.duration || 0), 0);
}

/** Classic theme: no flight, just holds that overlap by the transition length. */
export const CLASSIC = { intro: 6, outro: 7 };
const CLASSIC_CYCLE: ClassicTransition[] = ['crossfade', 'parallax-push', 'crossfade', 'drift', 'dip', 'crossfade', 'soft-wipe'];

export function buildPlan(spec: ShowSpec): ShowPlan {
  if (spec.theme === 'classic') return buildClassicPlan(spec);
  const pace = clamp(spec.pace || 1, 0.6, 1.8);
  const n = spec.photos.length;
  const wideEvery = Math.max(3, Math.round(spec.wideEvery || 6));

  let dwells = spec.photos.map((p) => p.dwellOverride ?? baseDwell(p.interest, p.faces, pace));

  const travel = PACE.travel * pace, approach = PACE.approach * pace, retreat = PACE.retreat * pace;
  const wides = n > 0 ? Math.floor((n - 1) / wideEvery) : 0;
  const fixed = PACE.intro * pace + PACE.outro * pace + wides * PACE.wide * pace + n * (travel + approach + retreat);

  // Playlist mode can ask the photos to fill the music exactly. Only free (non-overridden)
  // dwells stretch, and never past the graceful bounds.
  const music = musicDuration(spec);
  if (spec.music.mode === 'playlist' && spec.music.fitToMusic && music > fixed && n > 0) {
    const locked = spec.photos.reduce((s, p, i) => s + (p.dwellOverride != null ? dwells[i] : 0), 0);
    const free = dwells.reduce((s, d, i) => s + (spec.photos[i].dwellOverride == null ? d : 0), 0);
    const want = music - fixed - locked;
    if (free > 0 && want > 0) {
      const k = want / free;
      dwells = dwells.map((d, i) => (spec.photos[i].dwellOverride == null ? clamp(d * k, 3, 16) : d));
    }
  }

  const segments: ShowSegment[] = [];
  let t = 0;
  const push = (s: Omit<ShowSegment, 'start'>) => { segments.push({ ...s, start: t }); t += s.duration; };

  push({ id: 'intro', kind: 'intro', duration: PACE.intro * pace });
  for (let i = 0; i < n; i++) {
    if (i > 0 && i % wideEvery === 0) push({ id: `wide-${i / wideEvery}`, kind: 'wide', duration: PACE.wide * pace, photoIndex: i });
    const visit: VisitTiming = { travel, approach, dwell: dwells[i], retreat };
    push({ id: `visit-${spec.photos[i].id}`, kind: 'visit', photoIndex: i, visit, duration: travel + approach + dwells[i] + retreat });
  }
  push({ id: 'outro', kind: 'outro', duration: PACE.outro * pace });

  return { segments, duration: t, fullPage: dwells };
}

function buildClassicPlan(spec: ShowSpec): ShowPlan {
  const pace = clamp(spec.pace || 1, 0.6, 1.8);
  const n = spec.photos.length;
  const xf = clamp(spec.transition?.seconds ?? 1.6, 0.4, 4) * pace;
  let dwells = spec.photos.map((p) => p.dwellOverride ?? baseDwell(p.interest, p.faces, pace));
  // Segments overlap by one transition each, so the visible length is sum(dwell) + intro/outro.
  const fixed = (CLASSIC.intro + CLASSIC.outro) * pace;
  const music = musicDuration(spec);
  if (spec.music.mode === 'playlist' && spec.music.fitToMusic && music > fixed && n > 0) {
    const locked = spec.photos.reduce((s, p, i) => s + (p.dwellOverride != null ? dwells[i] : 0), 0);
    const free = dwells.reduce((s, d, i) => s + (spec.photos[i].dwellOverride == null ? d : 0), 0);
    const want = music - fixed - locked;
    if (free > 0 && want > 0) { const k = want / free; dwells = dwells.map((d, i) => (spec.photos[i].dwellOverride == null ? clamp(d * k, 2.5, 16) : d)); }
  }
  const style = spec.transition?.style ?? 'auto';
  const pick = (i: number): ClassicTransition => (style === 'auto' ? CLASSIC_CYCLE[i % CLASSIC_CYCLE.length] : style);
  const segments: ShowSegment[] = [];
  let t = 0;
  // Each segment's `duration` includes the transition into the next one; the next starts xf earlier.
  const add = (s: Omit<ShowSegment, 'start'>, visible: number) => { segments.push({ ...s, start: t }); t += visible; };
  add({ id: 'intro', kind: 'intro', duration: CLASSIC.intro * pace + xf, transition: 'dip' }, CLASSIC.intro * pace);
  for (let i = 0; i < n; i++) {
    add({ id: `visit-${spec.photos[i].id}`, kind: 'visit', photoIndex: i, duration: dwells[i] + xf, transition: i === n - 1 ? 'dip' : pick(i),
      visit: { travel: 0, approach: 0, dwell: dwells[i] + xf, retreat: 0 } }, dwells[i]);
  }
  add({ id: 'outro', kind: 'outro', duration: CLASSIC.outro * pace }, CLASSIC.outro * pace);
  return { segments, duration: t, fullPage: dwells };
}

/** The segment playing at show time t (binary search). */
export function segmentAt(plan: ShowPlan, t: number): ShowSegment {
  const s = plan.segments;
  let lo = 0, hi = s.length - 1;
  if (t <= 0) return s[0];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return s[lo];
}

/** Music schedule for a render: which track plays where, looping when asked. */
export interface MusicCue { trackIndex: number; at: number; offset: number; length: number }

export function musicCues(spec: ShowSpec, total: number): MusicCue[] {
  const tracks = spec.music.tracks.filter((t) => (t.duration || 0) > 0.5);
  if (spec.music.mode === 'none' || !tracks.length) return [];
  const cues: MusicCue[] = [];
  let at = 0, k = 0;
  // Playlist plays once through, then repeats from the top if photos still need time;
  // loop mode repeats its (first) track until every photo has had its full turn.
  const pool = spec.music.mode === 'loop' ? [tracks[0]] : tracks;
  while (at < total - 0.05 && k < 500) {
    const tr = pool[k % pool.length];
    const length = Math.min(tr.duration!, total - at);
    cues.push({ trackIndex: spec.music.tracks.indexOf(tr), at, offset: 0, length });
    at += tr.duration!;
    k++;
  }
  return cues;
}

export function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
