// Themed Shows — the planner. Turns prepared photos + music into a timed list of camera
// segments. Pure and deterministic: same spec in, same plan out (Fabula clips rely on it).

import type { ClassicTransition, ShowPlan, ShowSegment, ShowSpec, VisitTiming } from './types';
import { breathPlates, byRole, featurePlates, quadCentre } from './themes/backyardPack';
import { isFullFrame } from './common';
import { autoTransition, transitionById } from './transitions';

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
const CLASSIC_CYCLE: string[] = ['dolly-fade', 'crossfade', 'exposure-blur:bloom', 'parallax-push', 'dissolve-diffuse', 'drift', 'glint-dissolve', 'crossfade'];

export function buildPlan(spec: ShowSpec): ShowPlan {
  if (spec.theme === 'classic') return buildClassicPlan(spec);
  if (spec.theme === 'backyard') return buildBackyardPlan(spec);
  const pace = clamp(spec.pace || 1, 0.6, 1.8);
  const n = spec.photos.length;
  const wideEvery = Math.max(3, Math.round(spec.wideEvery || 6));

  let dwells = spec.photos.map((p) => p.dwellOverride ?? baseDwell(p.interest, p.faces, pace) * (spec.director?.enabled ? p.directorWeight ?? 1 : 1));

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
  let dwells = spec.photos.map((p) => p.dwellOverride ?? baseDwell(p.interest, p.faces, pace) * (spec.director?.enabled ? p.directorWeight ?? 1 : 1));
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
  const pick = (i: number): string => (style === 'auto' ? CLASSIC_CYCLE[i % CLASSIC_CYCLE.length] : style);
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

// --- Back Yard (photographic plates) ----------------------------------------------------

export const BACKYARD_PACE = { intro: 10, outro: 11, breath: 7.5, dissolve: 3.4, pan: 2.0, approach: 2.0, retreat: 2.0 };

/**
 * Photos are dealt onto Kenne's plates. Each plate scene features k photos (its big, whole
 * windows) — the most interesting photo gets the biggest window, and the camera visits them
 * left to right. Every other window on screen is filled from the rest of the album so no
 * placeholder is ever left grey. Every few photos a breath: a swaying loop or a wall of rows.
 */
function buildBackyardPlan(spec: ShowSpec): ShowPlan {
  const pace = clamp(spec.pace || 1, 0.6, 1.8);
  const P = BACKYARD_PACE;
  const n = spec.photos.length;
  const breathEvery = Math.max(3, Math.round(spec.wideEvery || 6));
  let dwells = spec.photos.map((p) => p.dwellOverride ?? baseDwell(p.interest, p.faces, pace) * (spec.director?.enabled ? p.directorWeight ?? 1 : 1));

  // plate sequence: variety by size, never the same plate twice in a row
  const plates = featurePlates();
  const bySize = new Map<number, typeof plates>();
  for (const p of plates) { const k = p.feature.length; bySize.set(k, [...(bySize.get(k) || []), p]); }
  const sizes = [...bySize.keys()].sort((a, b) => a - b);
  const pattern = [1, 3, 2, 5, 1, 2, 3, 5].map((k) => sizes.reduce((best, s) => (Math.abs(s - k) < Math.abs(best - k) ? s : best), sizes[0]));
  const used = new Map<number, number>();
  const printCount = spec.photos.filter((p) => !isFullFrame(p)).length;
  const pickPlate = (k: number, remaining: number) => {
    // an exact fit for the last few photos when one exists
    const size = remaining < k && bySize.has(remaining) ? remaining : k;
    const all = bySize.get(size)!;
    // a small shot must not need repeats: prefer plates whose every window the album can fill
    const fits = all.filter((p) => (p.asset.windows || []).length <= Math.max(printCount, size));
    const list = fits.length ? fits : all;
    const u = used.get(size) || 0;
    used.set(size, u + 1);
    return list[u % list.length];
  };

  // How often each photo has been on screen so far: windows go to the least-shown photos, so
  // the whole album gets seen and nothing is reused while fresh photos are waiting.
  const uses = new Array(n).fill(0);
  const fill = (windows: number, featured: Map<number, number>, salt: number) => {
    const assign: number[] = new Array(windows).fill(-1);
    for (const [w, pi] of featured) { assign[w] = pi; uses[pi]++; }
    if (!n) return assign;
    const inShot = new Set(featured.values());
    const prints = spec.photos.map((_, j) => j).filter((j) => !isFullFrame(spec.photos[j]));
    const pool = prints.length ? prints : spec.photos.map((_, j) => j);
    for (let w = 0; w < windows; w++) {
      if (assign[w] >= 0) continue;
      let best = -1, bestKey = Infinity;
      for (const c of pool) {
        // a repeat within one shot only when the shot has more windows than the album has photos
        const key = (inShot.has(c) ? 1e6 : 0) + (w > 0 && assign[w - 1] === c ? 1e5 : 0) + uses[c] * 100
          + hashKey(c * 31 + salt * 7 + w); // even spread among equals, deterministic
        if (key < bestKey) { bestKey = key; best = c; }
      }
      assign[w] = best;
      uses[best]++;
      inShot.add(best);
    }
    return assign;
  };

  // fit to music by scaling dwell (after we know the fixed time)
  const segments: ShowSegment[] = [];
  let t = 0;
  const push = (s: Omit<ShowSegment, 'start'>) => { segments.push({ ...s, start: t }); t += s.duration; };
  const openings = byRole('opening'), closings = byRole('closing');
  const bokeh = byRole('bokeh').filter((b) => (b.duration || 0) >= 14);
  const breaths = breathPlates();
  const seed = Math.floor((spec.createdAt || 0) / 1000);
  push({ id: 'intro', kind: 'intro', duration: P.intro * pace, plate: { asset: openings[seed % Math.max(1, openings.length)]?.id || 'open-crane', assign: [] } });

  let i = 0, pi = 0, sinceBreath = 0, breathK = 0, lastPlate = '';
  while (i < n) {
    const eventEdge = !spec.director?.enabled || i === 0 || spec.photos[i].event !== spec.photos[i - 1].event;
    if (sinceBreath >= breathEvery && breaths.length && eventEdge) {
      // big walls of prints repeat photos in a small album: use them only when the album can mostly fill them
      const roomy = breaths.filter((b) => (b.role === 'plateLoop' ? b.windowCount || 0 : (b.windows || []).length) <= Math.max(8, printCount * 2.5));
      const choice = roomy.length ? roomy : [...breaths].sort((a, b) => (a.windowCount || a.windows?.length || 0) - (b.windowCount || b.windows?.length || 0)).slice(0, 2);
      const b = choice[(breathK + seed) % choice.length];
      const windows = b.role === 'plateLoop' ? b.windowCount || 0 : (b.windows || []).length;
      push({ id: `wide-${breathK}`, kind: 'wide', duration: P.breath * pace, plate: { asset: b.id, assign: fill(windows, new Map(), breathK * 7 + i), offset: b.role === 'plateLoop' ? ((breathK * 3.7) % Math.max(0.1, (b.duration || 15) - P.breath * pace - 0.5)) : 0 } });
      breathK++; sinceBreath = 0; lastPlate = b.id;
    }
    // Director on: an event's photos share a plate when they fit (a scene reads as one place)
    const dir = !!spec.director?.enabled;
    if (isFullFrame(spec.photos[i])) {
      // a poster / obituary cover / flyer: shown whole, full screen, over a soft lantern plate
      const softs = byRole('soft');
      const soft = softs[(i + seed) % Math.max(1, softs.length)];
      const v: VisitTiming = { travel: P.dissolve * pace, approach: 0.6 * pace, dwell: dwells[i], retreat: 1.6 * pace };
      const prevPhoto = segments.length ? segments[segments.length - 1].photoIndex : undefined;
      const chapter = dir && spec.photos[i].eventLabel && (prevPhoto == null || spec.photos[prevPhoto].event !== spec.photos[i].event) ? spec.photos[i].eventLabel : undefined;
      push({ id: `visit-${spec.photos[i].id}`, kind: 'visit', photoIndex: i, visit: v, duration: v.travel + v.approach + v.dwell + v.retreat, chapter,
        plate: { asset: soft?.id || 'soft-a', assign: [], full: true } });
      lastPlate = soft?.id || '';
      i++; sinceBreath++;
      continue;
    }
    let run = n - i;
    if (dir && spec.photos[i].event) { run = 1; while (i + run < n && spec.photos[i + run].event === spec.photos[i].event) run++; }
    // a run of prints ends where a graphic begins
    { let r = 0; while (r < run && i + r < n && !isFullFrame(spec.photos[i + r])) r++; run = Math.max(1, r); }
    const want = dir ? Math.min(run, sizes[sizes.length - 1]) : pattern[pi % pattern.length];
    let plate = pickPlate(dir ? sizes.reduce((best, s) => (s >= want && (best < want || s < best) ? s : best), sizes[0]) : want, run); pi++;
    if (plate.asset.id === lastPlate) { plate = pickPlate(dir ? plate.feature.length : pattern[pi % pattern.length], run); pi++; }
    const k = Math.min(plate.feature.length, run);
    // most interesting photo → biggest window; visits run left to right
    const chunk = Array.from({ length: k }, (_, j) => i + j);
    const byInterest = [...chunk].sort((a, b) => (spec.photos[b].interest + spec.photos[b].faces * 0.1) - (spec.photos[a].interest + spec.photos[a].faces * 0.1));
    const bigFirst = [...plate.feature].sort((a, b) => b.height - a.height).slice(0, k);
    const featured = new Map<number, number>();
    if (dir) {
      // the director already chose the sequence: read it left to right across the prints
      const lr = [...bigFirst].sort((a, b) => quadCentre(a.quad).x - quadCentre(b.quad).x);
      lr.forEach((w, j) => featured.set(w.id, chunk[j]));
    } else bigFirst.forEach((w, j) => featured.set(w.id, byInterest[j]));
    const assign = fill((plate.asset.windows || []).length, featured, i * 3 + 1);
    const visitOrder = [...featured.keys()].sort((a, b) => quadCentre(plate.asset.windows![a].quad).x - quadCentre(plate.asset.windows![b].quad).x);
    visitOrder.forEach((w, j) => {
      const photo = featured.get(w)!;
      const same = j > 0;
      const v: VisitTiming = { travel: (same ? P.pan : P.dissolve) * pace, approach: P.approach * pace, dwell: dwells[photo], retreat: P.retreat * pace };
      const bk = bokeh.length ? bokeh[(photo + seed) % bokeh.length] : null;
      const prevPhoto = segments.length ? segments[segments.length - 1].photoIndex : undefined;
      const chapter = dir && j === 0 && spec.photos[i].eventLabel && (prevPhoto == null || spec.photos[prevPhoto].event !== spec.photos[i].event) ? spec.photos[i].eventLabel : undefined;
      push({ id: `visit-${spec.photos[photo].id}`, kind: 'visit', photoIndex: photo, visit: v, duration: v.travel + v.approach + v.dwell + v.retreat, chapter,
        plate: { asset: plate.asset.id, assign, window: w, same, bokeh: bk?.id, offset: bk ? (photo * 1.3) % Math.max(0.1, (bk.duration || 15) - v.dwell - 1) : 0 } });
    });
    lastPlate = plate.asset.id;
    i += k; sinceBreath += k;
  }
  push({ id: 'outro', kind: 'outro', duration: P.outro * pace, plate: { asset: closings[seed % Math.max(1, closings.length)]?.id || 'close-sky-a', assign: [] } });

  // the transition that brings in each new plate (same-plate visits pan instead)
  {
    const pinned = spec.transition?.style && spec.transition.style !== 'auto' && transitionById(spec.transition.style.split(':')[0]) ? spec.transition.style : null;
    let cut = seed;
    for (const s of segments) {
      if (s.kind === 'intro' || (s.kind === 'visit' && s.plate?.same)) continue;
      s.transitionIn = pinned || autoTransition('backyard', cut++);
    }
  }

  // playlist fit: stretch/shrink dwell, then re-time
  const music = musicDuration(spec);
  if (spec.music.mode === 'playlist' && spec.music.fitToMusic && n && music > 0) {
    const fixed = t - dwells.reduce((a, b) => a + b, 0);
    const free = dwells.reduce((s, d, k) => s + (spec.photos[k].dwellOverride == null ? d : 0), 0);
    const locked = dwells.reduce((s, d, k) => s + (spec.photos[k].dwellOverride != null ? d : 0), 0);
    const want = music - fixed - locked;
    if (free > 0 && want > 0) {
      const kf = want / free;
      dwells = dwells.map((d, k) => (spec.photos[k].dwellOverride == null ? clamp(d * kf, 3, 16) : d));
      let tt = 0;
      for (const s of segments) {
        if (s.kind === 'visit' && s.visit) { s.visit = { ...s.visit, dwell: dwells[s.photoIndex!] }; s.duration = s.visit.travel + s.visit.approach + s.visit.dwell + s.visit.retreat; }
        s.start = tt; tt += s.duration;
      }
      t = tt;
    }
  }
  return { segments, duration: t, fullPage: dwells };
}

/** Small deterministic tiebreak in [0, 50). */
function hashKey(n: number) { const s = Math.sin(n * 12.9898) * 43758.5453; return (s - Math.floor(s)) * 50; }

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
