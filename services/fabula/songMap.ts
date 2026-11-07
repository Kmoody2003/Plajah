// songMap — a song's shape for the visual director: its sections (intro / verse / build / drop /
// breakdown / outro), its energy curve and its beat grid, so visuals can anticipate the drop instead
// of only reacting to it.
//
// Built from Music Intelligence's own measurement (services/musicIntel/dsp.ts measureAudio: short-term
// loudness curve + harmony-similarity sections + tempo), either on the server's stored TrackIntel or
// in a browser worker for a file the user just loaded. Pure: no DOM, no three.js.
import type { MeasuredAudio } from '../musicIntel/types';
import type { SectionKind } from '../../components/plajahPixels/engine/core/imageWorldDirection';

export interface SongSection { start: number; end: number; kind: SectionKind; energy: number; label: string }
export interface SongMap {
  duration: number;
  bpm: number;
  /** Seconds of the first downbeat (bar 1). */
  firstBeat: number;
  energy: number[];
  energyStep: number;
  sections: SongSection[];
  /** Drop times, snapped to the bar. */
  drops: number[];
}

export interface SongCue {
  kind: SectionKind;
  progress: number;      // 0..1 through this section
  sectionStart: number;
  toDrop: number;        // seconds to the next drop (Infinity when none)
  energy: number;        // energy curve now, 0..1
  energyAhead: number;   // energy ~4 s ahead (lets the camera lean into a rise)
  beat: number;          // beats since the first downbeat (continuous)
  beatLen: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** A fine loudness envelope (dB-scaled RMS, 0..1) — Music Intelligence's curve is 3 s windows, too coarse to place a drop. */
export function fineEnvelope(pcm: Float32Array, sampleRate: number, hopSec = 0.05): { step: number; values: number[] } {
  const hop = Math.max(1, Math.round(sampleRate * hopSec)), values: number[] = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) { let s = 0; for (let k = i; k < i + hop; k++) s += pcm[k] * pcm[k]; const db = 10 * Math.log10(s / hop + 1e-10); values.push(Math.max(0, Math.min(1, (db + 50) / 50))); }
  return { step: hop / sampleRate, values };
}

/** Classify a song into the director's sections, bar by bar on the beat grid, from its energy.
 *  Sections: intro / verse / build / drop / breakdown / outro. Drops land on bar lines. */
export function buildSongMap(m: MeasuredAudio, grid?: { bpm?: number; firstBeat?: number }, fine?: { step: number; values: number[] }): SongMap {
  const bpm = grid?.bpm && grid.bpm > 40 ? grid.bpm : m.tempo.bpm > 40 ? m.tempo.bpm : 120;
  const beatLen = 60 / bpm, bar = beatLen * 4;
  let firstBeat = grid?.firstBeat ?? 0; while (firstBeat - bar > 0) firstBeat -= bar;
  const src = fine?.values.length ? fine : { step: m.energyCurveStepSec, values: m.energyCurve };
  // normalise to the loud end of the song
  const sorted = [...src.values].sort((a, b) => a - b), q = (arr: number[], p: number) => arr[Math.floor(p * (arr.length - 1))] ?? 0;
  const top = Math.max(1e-3, q(sorted, 0.98)), floor = q(sorted, 0.05);
  const norm = src.values.map(v => clamp01((v - floor) / Math.max(1e-3, top - floor)));
  const meanOver = (a: number, b: number) => { const i0 = Math.max(0, Math.floor(a / src.step)), i1 = Math.min(norm.length, Math.max(i0 + 1, Math.ceil(b / src.step))); let s = 0, n = 0; for (let i = i0; i < i1; i++) { s += norm[i]; n++; } return n ? s / n : 0; };
  // per-bar energy
  const nBars = Math.max(1, Math.ceil((m.durationSec - firstBeat) / bar));
  const barE = Array.from({ length: nBars }, (_, i) => meanOver(firstBeat + i * bar, firstBeat + (i + 1) * bar));
  const bs = [...barE].sort((a, b) => a - b), hi = q(bs, 0.72), lo = q(bs, 0.3);
  let kinds: SectionKind[] = barE.map(e => e >= hi * 0.96 ? 'drop' : e <= lo ? 'breakdown' : 'verse');
  // a one-bar blip isn't a section
  kinds = kinds.map((k, i) => (kinds[i - 1] === kinds[i + 1] && kinds[i - 1] && kinds[i - 1] !== k) ? kinds[i - 1] : k);
  // low bars only count as a breakdown after the song has already peaked; before that they're the intro / verse
  let peaked = false;
  kinds = kinds.map((k, i) => { if (k === 'drop') peaked = true; return k === 'breakdown' && !peaked ? (i < nBars * 0.3 ? 'intro' : 'verse') : k; });
  // runs → sections
  type Run = { k: SectionKind; a: number; b: number };
  const runs: Run[] = [];
  kinds.forEach((k, i) => { const r = runs[runs.length - 1]; if (r && r.k === k) r.b = i + 1; else runs.push({ k, a: i, b: i + 1 }); });
  // anything shorter than two bars folds into its longer neighbour (repeat until stable)
  for (let guard = 0; guard < 64; guard++) {
    const i = runs.findIndex(r => r.b - r.a < 2); if (i < 0 || runs.length < 2) break;
    const prev = runs[i - 1], next = runs[i + 1], into = !prev ? next : !next ? prev : (prev.b - prev.a >= next.b - next.a ? prev : next);
    if (into === prev) prev.b = runs[i].b; else next.a = runs[i].a;
    runs.splice(i, 1);
    for (let j = runs.length - 1; j > 0; j--) if (runs[j].k === runs[j - 1].k) { runs[j - 1].b = runs[j].b; runs.splice(j, 1); }
  }
  // the run-up into each drop is a build (up to 8 bars, at most 60 % of what precedes it, at least 2 bars)
  const withBuilds: Run[] = [];
  runs.forEach((r, i) => {
    const next = runs[i + 1];
    if (next?.k === 'drop' && r.k !== 'drop') {
      const len = Math.max(2, Math.min(8, Math.floor((r.b - r.a) * 0.6)));
      if (r.b - r.a - len >= 1) withBuilds.push({ k: r.k, a: r.a, b: r.b - len });
      withBuilds.push({ k: 'build', a: Math.max(r.a, r.b - len), b: r.b });
    } else withBuilds.push(r);
  });
  const last = withBuilds[withBuilds.length - 1];
  if (last && last.k !== 'drop' && withBuilds.length > 1) last.k = 'outro';
  if (withBuilds[0] && withBuilds[0].k === 'verse' && withBuilds.length > 1 && barE.slice(withBuilds[0].a, withBuilds[0].b).every(e => e < hi * 0.8)) withBuilds[0].k = 'intro';
  const at = (b: number) => Math.min(m.durationSec, Math.max(0, firstBeat + b * bar));
  const sections: SongSection[] = withBuilds.map(r => ({ start: r.a === 0 ? 0 : at(r.a), end: at(r.b), kind: r.k, energy: meanOver(at(r.a), at(r.b)), label: r.k }));
  if (sections.length) sections[sections.length - 1].end = m.durationSec;
  // place each drop on the steepest rise within half a bar of its bar line, then snap to the beat
  if (fine?.values.length) {
    const fv = fine.values, fs = fine.step, w = Math.max(1, Math.round(0.15 / fs));
    sections.forEach((sec, i) => {
      if (sec.kind !== 'drop' || (i > 0 && sections[i - 1].kind === 'drop')) return;
      let best = sec.start, bestRise = -1;
      for (let tt = sec.start - bar / 2; tt <= sec.start + bar / 2; tt += fs) {
        const k = Math.round(tt / fs); if (k - w < 0 || k + w >= fv.length) continue;
        const rise = fv[k + w] - fv[k - w]; if (rise > bestRise) { bestRise = rise; best = tt; }
      }
      const snapped = firstBeat + Math.round((best - firstBeat) / beatLen) * beatLen;
      if (i > 0) sections[i - 1].end = snapped; sec.start = snapped;
    });
  }
  const drops = sections.filter((s, i) => s.kind === 'drop' && (i === 0 || sections[i - 1].kind !== 'drop')).map(s => s.start);
  // the first drop is a downbeat: phase the bar grid to it, so beat 1 of every bar lines up with the drop
  if (drops.length) firstBeat = drops[0] - Math.floor(drops[0] / bar) * bar;
  // a light curve for the camera: 0.5 s steps, ~1 s smoothing
  const step = 0.5, energy: number[] = [];
  for (let t = 0; t < m.durationSec; t += step) energy.push(meanOver(t - 0.5, t + 0.5));
  return { duration: m.durationSec, bpm, firstBeat, energy, energyStep: step, sections, drops };
}

export function songCueAt(map: SongMap, t: number): SongCue {
  const s = map.sections.find(x => t >= x.start && t < x.end) ?? map.sections[map.sections.length - 1];
  const at = (x: number) => { const f = x / map.energyStep, i = Math.floor(f), a = map.energy[Math.max(0, Math.min(map.energy.length - 1, i))] ?? 0, b = map.energy[Math.max(0, Math.min(map.energy.length - 1, i + 1))] ?? a; return a + (b - a) * (f - i); };
  const next = map.drops.find(d => d > t + 0.02);
  const beatLen = 60 / map.bpm;
  return {
    kind: s?.kind ?? 'verse', sectionStart: s?.start ?? 0,
    progress: s ? clamp01((t - s.start) / Math.max(0.01, s.end - s.start)) : 0,
    toDrop: next == null ? Infinity : next - t,
    energy: clamp01(at(t)), energyAhead: clamp01(at(t + 4)),
    beat: (t - map.firstBeat) / beatLen, beatLen,
  };
}

/** Song maps from tracks Music Intelligence already analysed (TrackIntel stores measured sections). */
export function songMapFromIntel(intel: { measured?: MeasuredAudio | null } | null | undefined): SongMap | null {
  return intel?.measured ? buildSongMap(intel.measured) : null;
}
