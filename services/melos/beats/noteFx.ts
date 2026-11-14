// Melos Beats — the note-FX chain. Everything that changes WHICH notes play and WHEN (arp, gate,
// chord, echo, strum…) lives here as pure note-list → note-list stages. Drawn clips, MEKA steps,
// the pitch roll, live keys and the offline bounce all run the same chain, so what you draw is what
// the effect plays, and a bounce prints what you heard: randomness is hashed from the seed, the
// source note and its beat, never rolled at play time.
//
// Add a device: one entry in NOTE_FX (params + run). The rack draws itself from the entry.

import type { ArrangeTrack, GrooveDoc, NoteEvent, Pattern, SongKey, Step } from './grooveDoc';
import type { StepMods } from './engine/stepMods';
import { arpStep, defaultArpPatch, type ArpPatch, type ArpOrder, type ParamLock } from '../arp';
import { snapToScale, type SnapMode } from '../theory';
import { noteOccurrences } from './clipContent';
import { effectiveLanes, sustainedEnd } from './automation';
import { docKey } from './songKey';
import { chordKeysFor, type ChordVoicing } from './chordAssist';

/** One note moving through the chain. `len` Infinity = a live key still held. */
export interface FxNote {
  key: number;
  vel: number;
  beat: number;
  len: number;
  /** Which source note this came from (seeds its randomness; a live key-up finds its voices). */
  src: number;
  locks?: ParamLock[];
  /** What the source carried (NoteEvent expression, a step's pan/FX/mods) — rides along untouched. */
  data?: unknown;
}

export interface NoteFxContext {
  key: SongKey | null;
  seed: number;
  /** Open-ended (held) notes stop generating here. */
  to: number;
}

export type NoteFxKind = 'chord' | 'transpose' | 'octaver' | 'scale' | 'gate' | 'length' | 'strum' | 'echo' | 'ratchet' | 'velocity' | 'humanize' | 'chance';

export interface NoteFxDevice {
  id: string;
  kind: NoteFxKind;
  on: boolean;
  params: Record<string, number | string>;
}

/** The two things that can carry a chain: an instrument, or a one-shot pad. */
export interface NoteFxOwner {
  arp?: Record<string, unknown>;
  noteFx?: NoteFxDevice[];
}

export interface NoteFxParamSpec {
  key: string;
  label: string;
  /** Numeric range, or a fixed list of choices. */
  min?: number;
  max?: number;
  step?: number;
  choices?: { value: number | string; label: string }[];
  default: number | string;
}

interface NoteFxDef {
  kind: NoteFxKind;
  name: string;
  hint: string;
  /** Pitch stages run before the arp (one note → chord → arpeggio); the rest after it. */
  stage: 'pitch' | 'rhythm';
  params: NoteFxParamSpec[];
  run(notes: FxNote[], p: Record<string, number | string>, ctx: NoteFxContext): FxNote[];
}

// ── randomness: same seed + note + beat = same answer, at any time, in any order ──────────────
function hash01(seed: number, a: number, b: number, salt: number): number {
  let h = (seed ^ Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(Math.round(b * 960) + 7, 0x85EBCA77) ^ Math.imul(salt + 3, 0xC2B2AE3D)) | 0;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

const num = (p: Record<string, number | string>, k: string, d: number): number => {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
};
const clampKey = (k: number) => Math.max(0, Math.min(127, Math.round(k)));
const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)));
const DIVS = [
  { value: 1, label: '1/4' }, { value: 2, label: '1/8' }, { value: 3, label: '1/8T' }, { value: 4, label: '1/16' },
  { value: 6, label: '1/16T' }, { value: 8, label: '1/32' },
];

export const NOTE_FX: NoteFxDef[] = [
  {
    kind: 'chord', name: 'Chord', hint: 'One note plays a whole chord, in key or a fixed shape.', stage: 'pitch',
    params: [
      { key: 'tones', label: 'Size', default: 3, choices: [{ value: 2, label: 'Dyad' }, { value: 3, label: 'Triad' }, { value: 4, label: '7th' }, { value: 5, label: '9th' }, { value: 6, label: '11th' }, { value: 7, label: '13th' }] },
      { key: 'voicing', label: 'Voicing', default: 'close', choices: [{ value: 'close', label: 'Close' }, { value: 'drop2', label: 'Drop 2' }, { value: 'drop3', label: 'Drop 3' }, { value: 'open', label: 'Open' }, { value: 'shell', label: 'Shell' }, { value: 'rootless', label: 'Rootless' }] },
      { key: 'inversion', label: 'Inv', min: 0, max: 6, step: 1, default: 0 },
    ],
    run(notes, p, ctx) {
      const out: FxNote[] = [];
      for (const n of notes) {
        for (const key of chordKeysFor(n.key, ctx.key, { tones: num(p, 'tones', 3), voicing: String(p.voicing ?? 'close') as ChordVoicing, inversion: num(p, 'inversion', 0) })) {
          out.push({ ...n, key: clampKey(key) });
        }
      }
      return out;
    },
  },
  {
    kind: 'transpose', name: 'Transpose', hint: 'Shift every note.', stage: 'pitch',
    params: [
      { key: 'semi', label: 'Semi', min: -24, max: 24, step: 1, default: 0 },
      { key: 'oct', label: 'Oct', min: -3, max: 3, step: 1, default: 0 },
    ],
    run: (notes, p) => notes.map((n) => ({ ...n, key: clampKey(n.key + num(p, 'semi', 0) + num(p, 'oct', 0) * 12) })),
  },
  {
    kind: 'octaver', name: 'Octaver', hint: 'Doubles each note an octave away.', stage: 'pitch',
    params: [
      { key: 'up', label: 'Up', min: 0, max: 3, step: 1, default: 1 },
      { key: 'down', label: 'Down', min: 0, max: 3, step: 1, default: 0 },
      { key: 'level', label: 'Level', min: 0.1, max: 1, step: 0.05, default: 0.7 },
    ],
    run(notes, p) {
      const out: FxNote[] = [];
      const lvl = num(p, 'level', 0.7);
      for (const n of notes) {
        out.push(n);
        for (let o = 1; o <= num(p, 'up', 1); o++) out.push({ ...n, key: clampKey(n.key + o * 12), vel: clampVel(n.vel * lvl) });
        for (let o = 1; o <= num(p, 'down', 0); o++) out.push({ ...n, key: clampKey(n.key - o * 12), vel: clampVel(n.vel * lvl) });
      }
      return out;
    },
  },
  {
    kind: 'scale', name: 'Scale', hint: 'Pulls every note into the project key.', stage: 'pitch',
    params: [{ key: 'mode', label: 'Move', default: 'nearest', choices: [{ value: 'nearest', label: 'Nearest' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }] }],
    run: (notes, p, ctx) => (ctx.key
      ? notes.map((n) => ({ ...n, key: clampKey(snapToScale(n.key, ctx.key!.tonic, ctx.key!.scale, String(p.mode ?? 'nearest') as SnapMode)) }))
      : notes),
  },
  {
    kind: 'gate', name: 'Gate', hint: 'Chops each note into a repeating rhythm.', stage: 'rhythm',
    params: [
      { key: 'rate', label: 'Rate', default: 4, choices: DIVS },
      { key: 'duty', label: 'Open', min: 0.05, max: 1, step: 0.01, default: 0.5 },
      { key: 'pattern', label: 'Pattern', default: 'xxxxxxxx' },
    ],
    run(notes, p, ctx) {
      const rate = Math.max(0.25, num(p, 'rate', 4));
      const cell = 1 / rate;
      const duty = Math.max(0.02, Math.min(1, num(p, 'duty', 0.5)));
      const pat = String(p.pattern ?? 'x') || 'x';
      const out: FxNote[] = [];
      for (const n of notes) {
        const end = Number.isFinite(n.len) ? n.beat + n.len : ctx.to;
        // Cells lie on the song grid, so chords and separate notes chop together.
        for (let i = Math.floor(n.beat * rate + 1e-9); i / rate < end - 1e-9; i++) {
          if (pat[((i % pat.length) + pat.length) % pat.length] === '-') continue;
          const t = Math.max(i / rate, n.beat);
          const off = Math.min(end, i / rate + cell * duty);
          if (off <= t + 1e-6) continue;
          out.push({ ...n, beat: t, len: off - t });
        }
      }
      return out;
    },
  },
  {
    kind: 'length', name: 'Length', hint: 'Fixed, scaled or legato note lengths.', stage: 'rhythm',
    params: [
      { key: 'mode', label: 'Mode', default: 'scale', choices: [{ value: 'scale', label: 'Scale' }, { value: 'fixed', label: 'Fixed' }, { value: 'legato', label: 'Legato' }] },
      { key: 'scale', label: 'Scale', min: 0.05, max: 4, step: 0.05, default: 0.5 },
      { key: 'beats', label: 'Beats', min: 0.0625, max: 8, step: 0.0625, default: 0.25 },
    ],
    run(notes, p) {
      const mode = String(p.mode ?? 'scale');
      if (mode === 'fixed') return notes.map((n) => ({ ...n, len: num(p, 'beats', 0.25) }));
      if (mode === 'scale') return notes.map((n) => ({ ...n, len: n.len * num(p, 'scale', 0.5) }));
      const sorted = [...notes].sort((a, b) => a.beat - b.beat);
      return sorted.map((n, i) => {
        const next = sorted.slice(i + 1).find((m) => m.beat > n.beat + 1e-6);
        return next ? { ...n, len: Math.max(n.len, next.beat - n.beat) } : n;
      });
    },
  },
  {
    kind: 'strum', name: 'Strum', hint: 'Rolls notes struck together, like a hand across strings.', stage: 'rhythm',
    params: [
      { key: 'spread', label: 'Spread', min: 0, max: 0.5, step: 0.005, default: 0.06 },
      { key: 'dir', label: 'Direction', default: 'up', choices: [{ value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'alt', label: 'Alternate' }] },
    ],
    run(notes, p) {
      const groups = new Map<number, FxNote[]>();
      for (const n of notes) {
        const k = Math.round(n.beat * 960);
        const g = groups.get(k);
        if (g) g.push(n); else groups.set(k, [n]);
      }
      const spread = num(p, 'spread', 0.06);
      const dir = String(p.dir ?? 'up');
      const out: FxNote[] = [];
      for (const [k, g] of groups) {
        const asc = [...g].sort((a, b) => a.key - b.key);
        const down = dir === 'down' || (dir === 'alt' && Math.round(k / 240) % 2 === 1);
        (down ? asc.reverse() : asc).forEach((n, i) => {
          // The note ENDS where it was drawn; only its start rolls later.
          const d = spread * i;
          out.push({ ...n, beat: n.beat + d, len: Number.isFinite(n.len) ? Math.max(0.02, n.len - d) : n.len });
        });
      }
      return out;
    },
  },
  {
    kind: 'echo', name: 'Note echo', hint: 'Plays each note again, quieter, at a delay. Can climb in pitch.', stage: 'rhythm',
    params: [
      { key: 'repeats', label: 'Repeats', min: 1, max: 16, step: 1, default: 3 },
      { key: 'time', label: 'Time', default: 2, choices: DIVS },
      { key: 'decay', label: 'Decay', min: 0.1, max: 1, step: 0.01, default: 0.65 },
      { key: 'pitch', label: 'Pitch', min: -12, max: 12, step: 1, default: 0 },
    ],
    run(notes, p, ctx) {
      const out: FxNote[] = [];
      const gap = 1 / Math.max(0.25, num(p, 'time', 2));
      const decay = num(p, 'decay', 0.65);
      const pitch = num(p, 'pitch', 0);
      for (const n of notes) {
        out.push(n);
        const len = Number.isFinite(n.len) ? Math.min(n.len, gap) : gap;
        for (let r = 1; r <= num(p, 'repeats', 3); r++) {
          const vel = n.vel * Math.pow(decay, r);
          const at = n.beat + r * gap;
          if (vel < 2 || (!Number.isFinite(ctx.to) ? false : at >= ctx.to)) break;
          out.push({ ...n, key: clampKey(n.key + pitch * r), vel: clampVel(vel), beat: at, len });
        }
      }
      return out;
    },
  },
  {
    kind: 'ratchet', name: 'Ratchet', hint: 'Rolls a note into quick repeats, some of the time.', stage: 'rhythm',
    params: [
      { key: 'hits', label: 'Hits', min: 2, max: 12, step: 1, default: 3 },
      { key: 'chance', label: 'Chance', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'taper', label: 'Taper', min: 0.3, max: 1, step: 0.01, default: 0.85 },
    ],
    run(notes, p, ctx) {
      const out: FxNote[] = [];
      const hits = Math.max(2, Math.round(num(p, 'hits', 3)));
      for (const n of notes) {
        if (hash01(ctx.seed, n.src, n.beat, 11) >= num(p, 'chance', 1)) { out.push(n); continue; }
        const span = Number.isFinite(n.len) ? n.len : 0.25;
        const each = span / hits;
        for (let i = 0; i < hits; i++) {
          out.push({ ...n, beat: n.beat + i * each, len: Math.max(0.01, each * 0.9), vel: clampVel(n.vel * Math.pow(num(p, 'taper', 0.85), i)) });
        }
      }
      return out;
    },
  },
  {
    kind: 'velocity', name: 'Velocity', hint: 'Shapes how hard notes hit: scale, offset, spread, or all the same.', stage: 'rhythm',
    params: [
      { key: 'scale', label: 'Scale', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'offset', label: 'Offset', min: -64, max: 64, step: 1, default: 0 },
      { key: 'random', label: 'Random', min: 0, max: 64, step: 1, default: 0 },
      { key: 'fixed', label: 'Fixed', min: 0, max: 127, step: 1, default: 0 },
    ],
    run: (notes, p, ctx) => notes.map((n) => {
      const fixed = num(p, 'fixed', 0);
      const jitter = (hash01(ctx.seed, n.src, n.beat, 23 + n.key) * 2 - 1) * num(p, 'random', 0);
      return { ...n, vel: clampVel((fixed > 0 ? fixed : n.vel * num(p, 'scale', 1)) + num(p, 'offset', 0) + jitter) };
    }),
  },
  {
    kind: 'humanize', name: 'Humanize', hint: 'Small timing, velocity and length drift.', stage: 'rhythm',
    params: [
      { key: 'timing', label: 'Timing', min: 0, max: 0.1, step: 0.001, default: 0.012 },
      { key: 'vel', label: 'Velocity', min: 0, max: 40, step: 1, default: 8 },
      { key: 'len', label: 'Length', min: 0, max: 0.5, step: 0.01, default: 0.05 },
    ],
    run: (notes, p, ctx) => notes.map((n) => {
      const r = (salt: number) => hash01(ctx.seed, n.src, n.beat, salt + n.key) * 2 - 1;
      return {
        ...n,
        // Never earlier than drawn: live, the moment has already passed.
        beat: n.beat + Math.abs(r(31)) * num(p, 'timing', 0.012),
        vel: clampVel(n.vel + r(37) * num(p, 'vel', 8)),
        len: Number.isFinite(n.len) ? Math.max(0.02, n.len * (1 + r(41) * num(p, 'len', 0.05))) : n.len,
      };
    }),
  },
  {
    kind: 'chance', name: 'Chance', hint: 'Each note plays only some of the time.', stage: 'rhythm',
    params: [{ key: 'p', label: 'Chance', min: 0, max: 1, step: 0.01, default: 0.5 }],
    run: (notes, p, ctx) => notes.filter((n) => hash01(ctx.seed, n.src, n.beat, 53 + n.key) < num(p, 'p', 0.5)),
  },
];

export const noteFxDef = (kind: NoteFxKind): NoteFxDef | undefined => NOTE_FX.find((d) => d.kind === kind);

export function newNoteFxDevice(kind: NoteFxKind): NoteFxDevice {
  const def = noteFxDef(kind)!;
  const params: Record<string, number | string> = {};
  for (const s of def.params) params[s.key] = s.default;
  return { id: `nfx${Math.random().toString(36).slice(2, 9)}`, kind, on: true, params };
}

// ── the arp stage ─────────────────────────────────────────────────────────────────────────────
// The arp engine (services/melos/arp.ts) answers "what plays on step N, given these held notes".
// Here the notes covering each step are what's held — so a drawn chord arpeggiates for exactly as
// long as it was drawn. A short stab that falls between two steps still counts for the next step.

const EPS = 1e-6;

export function runArp(notes: FxNote[], arp: ArpPatch, ctx: NoteFxContext): FxNote[] {
  if (!notes.length) return notes;
  const rate = Math.max(1, arp.rate);
  const step = 1 / rate;
  const sorted = [...notes].sort((a, b) => a.beat - b.beat);
  const endOf = (n: FxNote) => (Number.isFinite(n.len) ? n.beat + n.len : ctx.to);
  const out: FxNote[] = [];
  let next = 0;
  let active: FxNote[] = [];
  let prevFired = false;
  let i = Math.ceil(sorted[0].beat * rate - EPS);
  // A note starting between grid lines is caught by the line before it plays, so back up one.
  if (i / rate > sorted[0].beat + EPS) i -= 1;
  for (let guard = 0; guard < 2_000_000; guard++) {
    const at = i / rate;
    if (at >= ctx.to - EPS && Number.isFinite(ctx.to)) break;
    while (next < sorted.length && sorted[next].beat < at + step - EPS) active.push(sorted[next++]);
    active = active.filter((n) => endOf(n) > at + EPS);
    if (!active.length) {
      if (next >= sorted.length) break;
      i = Math.max(i + 1, Math.floor(sorted[next].beat * rate + EPS));
      continue;
    }
    const held = [...new Set(active.map((n) => n.key))];
    const order = [...active].sort((a, b) => a.beat - b.beat).map((n) => n.key);
    const res = arpStep(arp, held, order, i, { prevFired });
    prevFired = res.played;
    for (const a of res.notes) {
      const from = active.find((n) => n.key === a.key) ?? active[0];
      const beat = Math.max(at + a.offsetBeats, from.beat);
      // The source's own dynamics carry through: 100 on the arp step = as drawn.
      out.push({ ...from, key: a.key, vel: clampVel(from.vel * (a.velocity / 100)), beat, len: a.durationBeats, locks: a.locks.length ? a.locks : from.locks });
    }
    i += 1;
  }
  return out;
}

// ── the chain ─────────────────────────────────────────────────────────────────────────────────

/** AURA's own step-sequencer block, spoken as the shared arp patch. */
function auraArp(raw: Record<string, unknown>): ArpPatch {
  const base = defaultArpPatch();
  const rates: Record<string, number> = { '1/4': 1, '1/8': 2, '1/8T': 3, '1/16': 4, '1/16T': 6, '1/32': 8 };
  const orders: Record<string, ArpOrder> = { up: 'up', down: 'down', upDown: 'updown', random: 'random', octave: 'up', seq: 'up' };
  const mode = String(raw.mode ?? 'up');
  const semis = Array.isArray(raw.steps) ? (raw.steps as number[]) : [];
  const steps = mode === 'seq' && semis.length ? semis.map((s) => ({ ...base.steps[0], transpose: Number(s) || 0 })) : base.steps;
  return {
    ...base, enabled: true, order: orders[mode] ?? 'up', rate: rates[String(raw.rate)] ?? 4,
    gate: typeof raw.gate === 'number' ? raw.gate : 0.62, octaves: typeof raw.octaves === 'number' ? raw.octaves : 1,
    steps, length: mode === 'seq' && semis.length ? semis.length : base.length,
  };
}

/** The arp this owner plays through, or null. Reads the shared block, else AURA's own. */
export function ownerArp(owner: NoteFxOwner | undefined | null, patch?: Record<string, unknown>): ArpPatch | null {
  const raw = owner?.arp;
  if (raw && raw.enabled) return { ...defaultArpPatch(), ...(raw as Partial<ArpPatch>) };
  const aura = patch?.arp as Record<string, unknown> | undefined;
  return aura?.enabled ? auraArp(aura) : null;
}

export interface ResolvedChain {
  pitch: NoteFxDevice[];
  arp: ArpPatch | null;
  rhythm: NoteFxDevice[];
}

/** The running order for an owner, or null when nothing is switched on. */
export function resolveChain(owner: NoteFxOwner | undefined | null, patch?: Record<string, unknown>): ResolvedChain | null {
  const arp = ownerArp(owner, patch);
  const on = (owner?.noteFx ?? []).filter((d) => d.on && noteFxDef(d.kind));
  if (!arp && !on.length) return null;
  return {
    arp,
    pitch: on.filter((d) => noteFxDef(d.kind)!.stage === 'pitch'),
    rhythm: on.filter((d) => noteFxDef(d.kind)!.stage === 'rhythm'),
  };
}

export function applyNoteFx(notes: FxNote[], chain: ResolvedChain, ctx: NoteFxContext): FxNote[] {
  let cur = notes;
  for (const d of chain.pitch) cur = noteFxDef(d.kind)!.run(cur, d.params, ctx);
  if (chain.arp) cur = runArp(cur, chain.arp, ctx);
  for (const d of chain.rhythm) cur = noteFxDef(d.kind)!.run(cur, d.params, ctx);
  return cur.filter((n) => n.len > 0).sort((a, b) => a.beat - b.beat || a.key - b.key);
}

export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The chain an instrument track plays through. */
export function trackChain(track: ArrangeTrack): ResolvedChain | null {
  return resolveChain(track.instrument, track.instrument?.patch);
}

/** The chain a pad plays through: its instrument's when it has one, else the pad's own. */
export function padChain(doc: GrooveDoc, padIdx: number): ResolvedChain | null {
  const pad = doc.kit[padIdx];
  if (!pad) return null;
  if (pad.source === 'instrument' && pad.instrumentTrackId) {
    const track = doc.arrangement.find((t) => t.id === pad.instrumentTrackId);
    return track ? trackChain(track) : null;
  }
  return resolveChain(pad);
}

// ── arrangement clips ─────────────────────────────────────────────────────────────────────────

/** Note lengths and starts the same way the plain clip path reads them (window, loop, pedal). */
export function trackSourceNotes(track: ArrangeTrack): FxNote[] {
  const sustain = effectiveLanes(track).get('sustain');
  const out: FxNote[] = [];
  let src = 0;
  for (const clip of track.clips) {
    if (!clip.notes?.length) continue;
    const clipEnd = clip.startBeats + clip.lengthBeats;
    for (const occ of noteOccurrences(clip, clip.startBeats, clipEnd)) {
      const end = sustainedEnd(sustain, occ.songBeat + Math.max(0.05, occ.lengthBeats), clipEnd);
      out.push({ key: occ.note.key, vel: occ.note.vel, beat: occ.songBeat, len: end - occ.songBeat, src: src++, data: occ.note });
    }
  }
  return out;
}

const performedCache = new WeakMap<ArrangeTrack, { v: number; notes: FxNote[] }>();

/** A track's clip notes after its chain, sorted — memoised until the doc changes. Worked out once
 *  on the main thread, so playback only ever reads a list. */
export function trackPerformedNotes(doc: GrooveDoc, track: ArrangeTrack, chain: ResolvedChain): FxNote[] {
  const hit = performedCache.get(track);
  if (hit && hit.v === doc.updatedAt) return hit.notes;
  const src = trackSourceNotes(track);
  const to = src.reduce((a, n) => Math.max(a, n.beat + n.len), 0);
  const notes = applyNoteFx(src, chain, { key: docKey(doc), seed: seedOf(track.id), to });
  performedCache.set(track, { v: doc.updatedAt, notes });
  return notes;
}

/** Notes starting in [from, to) of a sorted list. */
export function notesInWindow(notes: FxNote[], from: number, to: number): FxNote[] {
  let lo = 0, hi = notes.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].beat < from - 1e-9) lo = mid + 1; else hi = mid; }
  const out: FxNote[] = [];
  for (let i = lo; i < notes.length && notes[i].beat < to - 1e-9; i++) out.push(notes[i]);
  return out;
}

/** The bounce's clip notes, with the chain applied when there is one. */
export function trackNotesForRender(doc: GrooveDoc, track: ArrangeTrack): FxNote[] {
  const chain = trackChain(track);
  return chain ? trackPerformedNotes(doc, track, chain) : trackSourceNotes(track);
}

// ── MEKA pads ─────────────────────────────────────────────────────────────────────────────────

/** What a step carried for the voice, kept on its notes through the chain. */
export interface PadNoteData {
  pan?: number;
  fx?: number;
  mods?: StepMods;
  /** A plain drum step (keeps the pad's choke) rather than a drawn pitched note. */
  isStep: boolean;
}

export const padBaseNote = (doc: GrooveDoc, padIdx: number): number => {
  const pad = doc.kit[padIdx];
  return pad?.source === 'instrument' ? (pad.instrumentNote ?? 60) + (pad.pitchSemis || 0) : 60;
};

const STEP = 0.25;

/**
 * One pass of a pad's lane as notes, starting at `baseBeat`. `len` is the lane's loop in 16ths.
 * Sustaining pads hold each step to the next active one, as the plain path's legato gate does;
 * `roll` decides a step's probability once per pass.
 */
export function padSourceNotes(doc: GrooveDoc, pattern: Pattern, padIdx: number, len: number, baseBeat: number, srcBase: number, roll: () => number): FxNote[] {
  const pad = doc.kit[padIdx];
  const base = padBaseNote(doc, padIdx);
  const swing = pad?.swing ?? doc.swing;
  const holds = pad?.source === 'instrument' || (pad?.env?.sustain || 0) > 0.001;
  const out: FxNote[] = [];
  const row = pattern.steps[padIdx] || {};
  let src = srcBase;
  for (let i = 0; i < len; i++) {
    const st = row[i] as Step | undefined;
    if (!st) continue;
    if (st.p !== undefined && st.p < 1 && roll() > st.p) continue;
    let gap = len;
    if (holds) for (let d = 1; d <= len; d++) if (row[(i + d) % len]) { gap = d; break; }
    const shift = (i % 2 === 1 && swing > 0 ? swing * 0.5 * STEP : 0) + (st.micro ? st.micro * STEP : 0);
    const data: PadNoteData = { pan: st.pan, fx: st.fx, isStep: true, mods: st.cut !== undefined || st.rel !== undefined ? { cut: st.cut, res: st.res, rel: st.rel } : undefined };
    out.push({
      key: base + (st.pitch ?? 0) + (st.fine ?? 0) / 100, vel: st.v,
      beat: baseBeat + i * STEP + shift, len: holds ? gap * STEP : STEP, src: src++, data,
    });
  }
  const lane = pattern.melo?.[padIdx];
  if (lane) {
    for (let i = 0; i < len; i++) {
      for (const n of lane[i] ?? []) {
        const shift = (i % 2 === 1 && swing > 0 ? swing * 0.5 * STEP : 0) + (n.micro ? n.micro * STEP : 0);
        out.push({ key: base + n.semi, vel: n.v, beat: baseBeat + i * STEP + shift, len: Math.max(1, n.len) * STEP, src: src++, data: { isStep: false } as PadNoteData });
      }
    }
  }
  return out;
}

/**
 * One pass of a pad's lane through its chain, in absolute lane beats. The passes either side feed
 * in, so an arp keeps running across the loop point and an echo rings over it; each pass seeds its
 * own randomness, so a chance or random arp varies from loop to loop and still bounces the same.
 */
export function padPassNotes(doc: GrooveDoc, pattern: Pattern, padIdx: number, chain: ResolvedChain, len: number, pass: number, roll: () => number): FxNote[] {
  const lenBeats = len * STEP;
  const from = pass * lenBeats;
  const src: FxNote[] = [];
  for (const p of [pass - 1, pass, pass + 1]) src.push(...padSourceNotes(doc, pattern, padIdx, len, p * lenBeats, (p + 2) * 100000, roll));
  const out = applyNoteFx(src, chain, { key: docKey(doc), seed: seedOf(`${pattern.id}:${padIdx}`), to: from + lenBeats * 2 });
  return notesInWindow(out, from, from + lenBeats);
}
