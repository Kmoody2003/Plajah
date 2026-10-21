// Melos Beats — the council's critic, repairing instead of asking. A small on-device model writes
// good ideas with sloppy details; this pass fixes the details in code so the take is usable:
//   • range     — notes folded by octaves into the role's range (a singable one for a sung melody);
//   • key       — out-of-key notes pulled to the scale unless they're a stepwise passing tone;
//   • clashes   — strong-beat minor seconds against held notes moved to the nearest chord tone;
//   • words     — a sung line gets roughly a note per syllable (long notes split / extra notes merged);
//   • doubling  — a counter-melody that copies another line moves a diatonic third away;
//   • dynamics  — a flat line gets a phrase-shaped velocity curve.
// Each fix is reported so the take can say what the critic changed.

import { syllables, type ComposeContext, type CtxNote } from './composeContext';
import { ROLE_RANGE, type Composition, type ComposedNote, type ComposedPart } from './composeCouncil';
import { scalePitchClasses } from '../../theory';

const SUNG: [number, number] = [48, 79];

const isStrong = (ctx: ComposeContext, t: number) => {
  const bar = [...ctx.bars].reverse().find((b) => b.at <= t + 1e-6);
  return !bar || Math.abs((t - bar.at) % 1) < 1e-6;
};
const chordAt = (ctx: ComposeContext, t: number) => [...ctx.bars].reverse().find((b) => b.at <= t + 1e-6)?.chordPcs;

function nearestIn(pitch: number, allowed: (pc: number) => boolean): number {
  for (let d = 0; d <= 6; d++) {
    if (allowed(((pitch - d) % 12 + 12) % 12)) return pitch - d;
    if (allowed((pitch + d) % 12)) return pitch + d;
  }
  return pitch;
}

function repairPart(part: ComposedPart, ctx: ComposeContext, others: { name: string; notes: CtxNote[] }[]): { notes: ComposedNote[]; fixes: string[] } {
  const fixes: string[] = [];
  let notes = part.notes.map((n) => ({ ...n }));
  const sungLines = part.role === 'melody' ? ctx.lyrics.filter((l) => l.inRegion) : [];
  const [lo, hi] = sungLines.length ? SUNG : ROLE_RANGE[part.role];
  const inKey = scalePitchClasses(ctx.song.keyPc, ctx.song.scaleId);
  const keyKnown = !!ctx.song.key;

  // Range.
  let folded = 0;
  for (const n of notes) {
    const was = n.pitch;
    while (n.pitch < lo) n.pitch += 12;
    while (n.pitch > hi) n.pitch -= 12;
    if (n.pitch < lo) n.pitch = lo;
    if (n.pitch !== was) folded++;
  }
  if (folded) fixes.push(`folded ${folded} note${folded > 1 ? 's' : ''} into the ${sungLines.length ? 'singable' : part.role} range`);

  // A melody or counter-melody is one voice: one note at a time (the top note of a stack for a
  // melody, the one nearest the line for a counter-melody), each ending where the next begins.
  if (part.role === 'melody' || part.role === 'counter-melody') {
    const before = notes.length;
    const byStart = new Map<number, ComposedNote[]>();
    for (const n of notes) { const k = Math.round(n.start * 48); byStart.set(k, [...(byStart.get(k) ?? []), n]); }
    const line: ComposedNote[] = [];
    for (const k of [...byStart.keys()].sort((x, y) => x - y)) {
      const group = byStart.get(k)!;
      const prev = line[line.length - 1];
      line.push(part.role === 'melody' || !prev
        ? group.reduce((a, b) => (b.pitch > a.pitch ? b : a))
        : group.reduce((a, b) => (Math.abs(b.pitch - prev.pitch) < Math.abs(a.pitch - prev.pitch) ? b : a)));
    }
    for (let i = 0; i + 1 < line.length; i++) line[i].length = Math.min(line[i].length, line[i + 1].start - line[i].start);
    notes = line;
    if (notes.length < before) fixes.push(`made it one voice (${before - notes.length} stacked note${before - notes.length > 1 ? 's' : ''} removed)`);
  }

  // Key: keep stepwise chromatic passing tones on weak beats; pull the rest into the scale.
  if (keyKnown) {
    let snapped = 0;
    notes.forEach((n, i) => {
      if (inKey[n.pitch % 12]) return;
      const prev = notes[i - 1], next = notes[i + 1];
      const passing = !isStrong(ctx, n.start) && n.length <= 0.5 && prev && next
        && Math.abs(prev.pitch - n.pitch) <= 2 && Math.abs(next.pitch - n.pitch) <= 2;
      if (passing) return;
      n.pitch = nearestIn(n.pitch, (pc) => inKey[pc]);
      snapped++;
    });
    if (snapped) fixes.push(`moved ${snapped} out-of-key note${snapped > 1 ? 's' : ''} into ${ctx.song.key}`);
  }

  // Clashes on strong beats against notes other tracks are holding.
  let moved = 0;
  for (const n of notes) {
    if (!isStrong(ctx, n.start) || n.length < 0.5) continue;
    const rub = others.some((t) => t.notes.some((o) => o[0] <= n.start + 1e-6 && o[0] + o[1] > n.start + 0.25
      && [1, 11].includes(Math.abs(o[2] - n.pitch) % 12) && Math.abs(o[2] - n.pitch) < 24));
    if (!rub) continue;
    const chord = chordAt(ctx, n.start);
    if (!chord?.length) continue;
    n.pitch = nearestIn(n.pitch, (pc) => chord.includes(pc));
    moved++;
  }
  if (moved) fixes.push(`moved ${moved} strong-beat rub${moved > 1 ? 's' : ''} onto chord tones`);

  // Words vs notes, line by line.
  for (let i = 0; i < sungLines.length; i++) {
    const from = ctx.bars.find((b) => b.bar === sungLines[i].bar)?.at ?? 0;
    const nextBar = ctx.lyrics.find((l) => l.bar > sungLines[i].bar)?.bar;
    const to = nextBar !== undefined ? (ctx.bars.find((b) => b.bar === nextBar)?.at ?? ctx.region.beats) : ctx.region.beats;
    const want = syllables(sungLines[i].text);
    const inLine = () => notes.filter((n) => n.start >= from - 1e-6 && n.start < to - 1e-6);
    let line = inLine();
    let changed = false;
    // Too few: split the longest notes (same pitch, re-sung) until each syllable has one.
    while (line.length && line.length < want) {
      const longest = line.reduce((a, b) => (b.length > a.length ? b : a));
      if (longest.length < 0.5 - 1e-6) break;
      const half = Math.round((longest.length / 2) * 4) / 4;
      notes.push({ ...longest, start: longest.start + half, length: longest.length - half, velocity: Math.max(1, longest.velocity - 6) });
      longest.length = half;
      notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      line = inLine();
      changed = true;
    }
    // No notes at all for the line: write it on the chord's root-ish tones.
    if (!line.length && want) {
      const step = [1, 0.5, 0.25].find((g) => g * want <= (to - from) * 0.85) ?? 0.25;
      const chord = chordAt(ctx, from) ?? [ctx.song.keyPc];
      for (let k = 0; k < want && from + k * step < to - 0.24; k++) {
        const pc = chord[k % Math.min(3, chord.length)];
        let p = 60 + (((pc - 60) % 12) + 12) % 12;
        if (p > hi) p -= 12;
        notes.push({ start: from + k * step, length: step * 0.9, pitch: p, velocity: 74 });
      }
      notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      changed = true;
    }
    // Too many: drop the shortest weak-beat notes until it's singable.
    line = inLine();
    while (line.length > want * 2.5 + 2) {
      const weak = line.filter((n) => !isStrong(ctx, n.start)).sort((a, b) => a.length - b.length)[0];
      if (!weak) break;
      const prev = notes.filter((n) => n.start < weak.start).pop();
      if (prev) prev.length = Math.max(prev.length, weak.start + weak.length - prev.start);
      notes = notes.filter((n) => n !== weak);
      line = inLine();
      changed = true;
    }
    if (changed) fixes.push(`fitted "${sungLines[i].text}" to ~${want} syllables (${line.length} notes)`);
  }

  // A counter-melody / second line that copies another track: move the copies a third away.
  if (part.role !== 'harmony' && part.role !== 'pad') {
    for (const t of others) {
      // Same pitch, sounding in the other track when this note starts.
      const copies = notes.filter((n) => t.notes.some((o) => o[2] === n.pitch && o[0] <= n.start + 1e-3 && o[0] + o[1] > n.start + 1e-3));
      if (notes.length >= 4 && copies.length / notes.length > 0.5) {
        for (const n of copies) {
          // The nearest in-key pitch class the other track ISN'T playing then (a third inside a
          // triad would just land on another of its notes).
          const busy = new Set(t.notes.filter((o) => o[0] <= n.start + 1e-6 && o[0] + o[1] > n.start + 1e-6).map((o) => o[2] % 12));
          let best = n.pitch;
          for (let d = 1; d <= 6 && best === n.pitch; d++) {
            for (const p of [n.pitch - d, n.pitch + d]) {
              if (p >= lo && p <= hi && inKey[((p % 12) + 12) % 12] && !busy.has(((p % 12) + 12) % 12)) { best = p; break; }
            }
          }
          n.pitch = best;
        }
        fixes.push(`moved ${copies.length} notes that doubled ${t.name} onto notes it isn't playing`);
        break;
      }
    }
  }

  // Flat dynamics: shape each phrase (rise to the middle, fall to the end).
  if (notes.length >= 8 && new Set(notes.map((n) => n.velocity)).size === 1) {
    const base = notes[0].velocity;
    notes.forEach((n, i) => { n.velocity = Math.max(1, Math.min(127, Math.round(base - 8 + 16 * Math.sin((Math.PI * (i % 8)) / 7)))); });
    fixes.push('shaped the dynamics with the phrase');
  }

  // Back on the grid (splits and fills can land between 1/12-beat ticks).
  for (const n of notes) {
    n.start = Math.round(n.start * 12) / 12;
    n.length = Math.max(1 / 12, Math.round(n.length * 12) / 12);
  }
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return { notes, fixes };
}

/** Repair every part; returns the repaired composition and the critic's list of changes. */
export function repairComposition(comp: Composition, ctx: ComposeContext): { composition: Composition; fixes: { target: string; message: string }[] } {
  const others = ctx.tracks.filter((t) => t.kind === 'instrument' && !t.target && !t.councilTake && t.notes?.length).map((t) => ({ name: t.name, notes: t.notes! }));
  const fixes: { target: string; message: string }[] = [];
  const parts = comp.parts.map((p) => {
    const r = repairPart(p, ctx, others);
    for (const f of r.fixes) fixes.push({ target: p.target, message: f });
    return { ...p, notes: r.notes };
  });
  return { composition: { ...comp, parts }, fixes };
}
