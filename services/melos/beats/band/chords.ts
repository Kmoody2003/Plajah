// Chora Session Band — what the band reads as the changes. Either a chart the producer types
// ("C | Am | F G | G7", one bar per bar line, chords in a bar split it evenly, the chart repeats),
// or the chords the song already implies — the composer council's context reader, with the band's
// own tracks left out so it never chases its own takes — falling back to a progression in the key.

import type { GrooveDoc } from '../grooveDoc';
import { buildComposeContext } from '../council/composeContext';
import { readMood, regionChords } from '../council/rulesArranger';
import { songTime } from '../tempoMap';
import type { FrameChord } from './performer';

const QUALITY: [RegExp, number[]][] = [
  [/^(maj9|M9|Δ9)$/, [0, 4, 7, 11, 2]],
  [/^(maj7|M7|Δ7?|ma7)$/, [0, 4, 7, 11]],
  [/^(m9|min9|-9)$/, [0, 3, 7, 10, 2]],
  [/^(m7b5|ø7?|min7b5|-7b5)$/, [0, 3, 6, 10]],
  [/^(m7|min7|-7|mi7)$/, [0, 3, 7, 10]],
  [/^(m6|min6|-6)$/, [0, 3, 7, 9]],
  [/^(mmaj7|m\(maj7\)|-maj7)$/, [0, 3, 7, 11]],
  [/^(m|min|-|mi)$/, [0, 3, 7]],
  [/^(dim7|°7|o7)$/, [0, 3, 6, 9]],
  [/^(dim|°|o)$/, [0, 3, 6]],
  [/^(aug|\+)$/, [0, 4, 8]],
  [/^sus2$/, [0, 2, 7]],
  [/^(sus4?|7sus4?)$/, [0, 5, 7]],
  [/^add9$/, [0, 4, 7, 2]],
  [/^13$/, [0, 4, 7, 10, 2, 9]],
  [/^11$/, [0, 4, 7, 10, 2, 5]],
  [/^7#9$/, [0, 4, 7, 10, 3]],
  [/^9$/, [0, 4, 7, 10, 2]],
  [/^7$/, [0, 4, 7, 10]],
  [/^6$/, [0, 4, 7, 9]],
  [/^(maj|M|)$/, [0, 4, 7]],
];
const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "F#m7" → pitch classes, root first. Slash bass ("C/E") is read but the root stays first. */
export function parseChord(sym: string): number[] | null {
  const m = sym.trim().match(/^([A-Ga-g])([#b♯♭]?)([^/]*)(?:\/([A-Ga-g][#b♯♭]?))?$/);
  if (!m) return null;
  const root = (ROOTS[m[1].toUpperCase()] + (m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0) + 12) % 12;
  const q = QUALITY.find(([re]) => re.test(m[3]));
  if (!q) return null;
  return q[1].map((iv) => (root + iv) % 12);
}

/** A typed chart → bars of chords (each bar split evenly between its chords). Null if unreadable. */
export function parseChart(chart: string): number[][][] | null {
  const bars = chart.split('|').map((b) => b.trim()).filter(Boolean);
  if (!bars.length) return null;
  const out: number[][][] = [];
  for (const b of bars) {
    const chords = b.split(/\s+/).map((s) => (s === '%' || s === '/' ? '%' : s));
    const parsed: number[][] = [];
    for (const c of chords) {
      if (c === '%') { const prev = out[out.length - 1]; if (prev) parsed.push(...prev); continue; }
      const pcs = parseChord(c);
      if (!pcs) return null;
      parsed.push(pcs);
    }
    if (parsed.length) out.push(parsed);
  }
  return out.length ? out : null;
}

/**
 * The chords for bars [fromBar, toBar) — 0-based bars, chord offsets from each bar's start.
 * `exclude` are track ids the band owns (its takes) — left out of the song's implied chords.
 */
export function chordMap(doc: GrooveDoc, fromBar: number, toBar: number, opts: { chart?: string; exclude?: string[] } = {}): Map<number, FrameChord[]> {
  const { meter } = songTime(doc);
  const out = new Map<number, FrameChord[]>();
  const chart = opts.chart ? parseChart(opts.chart) : null;
  if (chart) {
    for (let bar = fromBar; bar < toBar; bar++) {
      const len = meter.at(meter.barToBeat(bar)).lenBeats;
      const cs = chart[(bar - fromBar) % chart.length];
      out.set(bar, cs.map((pcs, i) => ({ at: (len / cs.length) * i, beats: len / cs.length, pcs })));
    }
    return out;
  }
  const filtered: GrooveDoc = opts.exclude?.length ? { ...doc, arrangement: doc.arrangement.filter((t) => !opts.exclude!.includes(t.id)) } : doc;
  const startBeats = meter.barToBeat(fromBar), endBeats = meter.barToBeat(toBar);
  const ctx = buildComposeContext(filtered, { description: '', startBeats, endBeats, targets: [] });
  for (const c of regionChords(ctx, readMood(''))) out.set(c.bar - 1, [{ at: 0, beats: c.beats, pcs: c.pcs }]);
  return out;
}
