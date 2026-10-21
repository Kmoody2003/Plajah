// Melos Beats — Glass channel-rack operations (FL Studio's channel menu, in Melos's model): clone,
// delete and reorder channels, and the step-row tools (fill each N, rotate, invert, randomize,
// send to the pitch roll). A channel is a MEKA pad, so these move EVERYTHING that addresses a pad
// by index — every pattern's steps and pitch-roll notes, clip pad-loop lengths, and the backing
// instrument track — or the pad would silently lose its music.

import { addPadBank, grooveUid, PAD_BANK, type GrooveDoc, type MeloNote, type Pattern, type Step } from './grooveDoc';

const swapKeys = <T,>(rec: Record<number, T> | undefined, a: number, b: number) => {
  if (!rec) return;
  const va = rec[a], vb = rec[b];
  if (vb === undefined) delete rec[a]; else rec[a] = vb;
  if (va === undefined) delete rec[b]; else rec[b] = va;
};

/** Swap two pads everywhere they're referenced by index. */
export function swapPads(doc: GrooveDoc, a: number, b: number): void {
  if (a === b || !doc.kit[a] || !doc.kit[b]) return;
  [doc.kit[a], doc.kit[b]] = [doc.kit[b], doc.kit[a]];
  for (const p of doc.patterns) { swapKeys(p.steps, a, b); swapKeys(p.melo, a, b); }
  for (const t of doc.arrangement) {
    for (const c of t.clips) swapKeys(c.padLens, a, b);
    if (t.padOwned && t.padIndex === a) t.padIndex = b;
    else if (t.padOwned && t.padIndex === b) t.padIndex = a;
  }
}

/**
 * Move a channel up (-1) or down (+1) in the rack: swap with the nearest SOUNDING pad that way in
 * the same Group (empty placeholders are hidden in the rack, so swapping with one would look like
 * nothing happened). Returns the channel's new index.
 */
export function moveChannel(doc: GrooveDoc, padIdx: number, dir: -1 | 1): number {
  const g = Math.floor(padIdx / PAD_BANK);
  const lo = g * PAD_BANK, hi = Math.min(doc.kit.length, lo + PAD_BANK) - 1;
  for (let j = padIdx + dir; j >= lo && j <= hi; j += dir) {
    if (!doc.kit[j]?.empty) { swapPads(doc, padIdx, j); return j; }
  }
  return padIdx;
}

/**
 * Clone a channel into the first empty pad of its Group (a new Group when it's full). An
 * instrument pad gets its own copy of the instrument track. `withSteps` also copies its steps and
 * pitch-roll notes in every pattern (FL's "Clone channel" vs a plain duplicate of the sound).
 * Returns the new pad index.
 */
export function cloneChannel(doc: GrooveDoc, padIdx: number, withSteps: boolean): number {
  const src = doc.kit[padIdx];
  if (!src || src.empty) return -1;
  const g = Math.floor(padIdx / PAD_BANK);
  let dst = doc.kit.findIndex((p, i) => p.empty && Math.floor(i / PAD_BANK) === g);
  if (dst < 0) dst = addPadBank(doc.kit);
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = grooveUid();
  copy.name = `${src.name} 2`.slice(0, 18);
  if (src.source === 'instrument' && src.instrumentTrackId) {
    const track = doc.arrangement.find((t) => t.id === src.instrumentTrackId);
    if (track) {
      const t2 = JSON.parse(JSON.stringify(track));
      t2.id = grooveUid();
      t2.name = copy.name;
      if (t2.padOwned) t2.padIndex = dst;
      t2.clips = [];
      doc.arrangement.push(t2);
      copy.instrumentTrackId = t2.id;
    }
  }
  doc.kit[dst] = copy;
  if (withSteps) {
    for (const p of doc.patterns) {
      if (p.steps[padIdx]) p.steps[dst] = JSON.parse(JSON.stringify(p.steps[padIdx]));
      if (p.melo?.[padIdx]) p.melo[dst] = JSON.parse(JSON.stringify(p.melo[padIdx]));
    }
  }
  return dst;
}

/**
 * Detach a pad's instrument: remove its padOwned track from the arrangement and unlink the pad.
 * Call this before replacing a pad's sound (with a sample or a different instrument) so the old
 * instrument track doesn't linger as an orphan — a wasted worklet the engine keeps alive and a
 * phantom channel. No-op for a pad that isn't an instrument.
 */
export function detachPadInstrument(doc: GrooveDoc, padIdx: number): void {
  const pad = doc.kit[padIdx];
  const id = pad?.instrumentTrackId;
  if (!id) return;
  doc.arrangement = doc.arrangement.filter((t) => t.id !== id);
  pad.instrumentTrackId = undefined;
}

/** Turn a pad back into an empty placeholder — drops its sample/instrument and clears its name. */
export function clearPad(doc: GrooveDoc, padIdx: number): void {
  detachPadInstrument(doc, padIdx);
  const pad = doc.kit[padIdx];
  if (!pad) return;
  pad.source = 'synth';
  pad.sample = null;
  pad.empty = true;
  pad.name = 'Empty';
  pad.color = '#2A2431';
  pad.melos = undefined;
}

/** Delete a channel: the pad goes back to an empty placeholder and its steps leave every pattern. */
export function deleteChannel(doc: GrooveDoc, padIdx: number): void {
  clearPad(doc, padIdx);
  for (const p of doc.patterns) { delete p.steps[padIdx]; if (p.melo) delete p.melo[padIdx]; }
}

// ── step-row tools ──────────────────────────────────────────────────────────

const rowOf = (p: Pattern, padIdx: number) => (p.steps[padIdx] ??= {});

/** FL "Fill each N steps": on every Nth step from `offset` (existing steps keep their values). */
export function fillEvery(p: Pattern, padIdx: number, n: number, offset = 0, vel = 100): void {
  const row = rowOf(p, padIdx);
  for (let s = offset; s < p.length; s += Math.max(1, n)) row[s] ??= { v: vel };
}

/** Rotate a row by `by` steps (positive = later), wrapping at the pattern length. */
export function rotateRow(p: Pattern, padIdx: number, by: number): void {
  const row = p.steps[padIdx];
  if (!row) return;
  const out: Record<number, Step> = {};
  for (const [k, st] of Object.entries(row)) out[(((Number(k) + by) % p.length) + p.length) % p.length] = st;
  p.steps[padIdx] = out;
  const mel = p.melo?.[padIdx];
  if (mel) {
    const m: Record<number, MeloNote[]> = {};
    for (const [k, notes] of Object.entries(mel)) m[(((Number(k) + by) % p.length) + p.length) % p.length] = notes;
    p.melo![padIdx] = m;
  }
}

/** Invert: every empty step on, every step off. */
export function invertRow(p: Pattern, padIdx: number, vel = 100): void {
  const row = rowOf(p, padIdx);
  for (let s = 0; s < p.length; s++) { if (row[s]) delete row[s]; else row[s] = { v: vel }; }
}

/**
 * Randomize: each step is on with probability `density`, velocity varied around `vel`. `rng` is
 * injectable so tests (and a future "reroll same seed") are deterministic.
 */
export function randomizeRow(p: Pattern, padIdx: number, density = 0.35, vel = 100, rng: () => number = Math.random): void {
  const row: Record<number, Step> = {};
  for (let s = 0; s < p.length; s++) {
    // Downbeats a touch likelier — random, but still musical.
    const bias = s % 4 === 0 ? 0.15 : 0;
    if (rng() < density + bias) row[s] = { v: Math.max(30, Math.min(127, Math.round(vel - 25 + rng() * 40))) };
  }
  p.steps[padIdx] = row;
}

/**
 * FL "Send to piano roll": the row's steps become pitch-roll notes (pitch from the step's per-step
 * pitch, one 16th long, same velocity), and the step row is emptied — the pad's line now lives in
 * MEKA's pitch roll where it can be lengthened, voiced and played melodically.
 */
export function sendRowToPitchRoll(p: Pattern, padIdx: number): number {
  const row = p.steps[padIdx];
  if (!row) return 0;
  const mel = ((p.melo ??= {})[padIdx] ??= {});
  let n = 0;
  for (const [k, st] of Object.entries(row)) {
    const s = Number(k);
    (mel[s] ??= []).push({ semi: Math.max(-24, Math.min(24, Math.round(st.pitch ?? 0))), v: st.v, len: 1 });
    n++;
  }
  delete p.steps[padIdx];
  return n;
}
