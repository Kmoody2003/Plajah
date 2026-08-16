// SFZ parser — the open text format with a vast free-library ecosystem.
//
// SFZ is headers (`<global>`, `<group>`, `<region>`, `<control>`) each carrying `opcode=value`
// pairs. Opcodes cascade: a region inherits its group's opcodes, which inherit the global's, and
// the nearest wins. That cascade is the whole format, and it maps almost one-to-one onto KERA's
// zone model — which is not a coincidence, it is why SFZ was chosen.
//
// Pure and synchronous: text in, zone definitions + referenced sample paths out. Loading the
// actual audio is a separate async step (the caller resolves paths against a folder), so this
// file is fully testable headlessly.

import type { KeraAmpEnv, KeraZone } from './zones';

/** A zone plus the sample PATH it needs and the sample-level facts SFZ keeps on the region
 *  (root note, loop) — the audio is loaded later. */
export interface SfzRegion extends Omit<KeraZone, 'sampleId'> {
  samplePath: string;
  rootNote: number;
  loopMode: 'off' | 'forward' | 'sustain';
  loopStart: number;
  loopEnd: number;
}

export interface SfzResult {
  regions: SfzRegion[];
  /** Distinct sample paths, for the loader to fetch. */
  samplePaths: string[];
  amp: KeraAmpEnv;
  /** `default_path` from `<control>`, prefixed onto every relative sample path. */
  defaultPath: string;
  /** Anything we saw but do not model yet — surfaced so import is honest, never silent. */
  ignoredOpcodes: string[];
}

const NOTE_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** SFZ note names use middle C (C4) = 60. Accepts names (c#4, db5) or plain numbers. */
export function parseNote(v: string): number {
  const s = v.trim();
  if (/^-?\d+$/.test(s)) return Math.max(0, Math.min(127, parseInt(s, 10)));
  const m = s.toLowerCase().match(/^([a-g])([#b]?)(-?\d+)$/);
  if (!m) return 60;
  let pc = NOTE_PC[m[1]];
  if (m[2] === '#') pc += 1;
  else if (m[2] === 'b') pc -= 1;
  const octave = parseInt(m[3], 10);
  return Math.max(0, Math.min(127, (octave + 1) * 12 + pc));
}

/** Opcodes we deliberately map. Anything outside this set is reported, not swallowed. */
const KNOWN = new Set([
  'sample', 'lokey', 'hikey', 'key', 'lovel', 'hivel', 'pitch_keycenter',
  'tune', 'pitch', 'transpose', 'volume', 'pan', 'group', 'off_by', 'off_group',
  'loop_mode', 'loopmode', 'loop_start', 'loopstart', 'loop_end', 'loopend',
  'seq_length', 'seq_position', 'default_path', 'ampeg_attack', 'ampeg_hold',
  'ampeg_decay', 'ampeg_sustain', 'ampeg_release', 'ampeg_start',
]);

export function parseSfz(text: string): SfzResult {
  // Strip // comments and normalise whitespace; SFZ is otherwise free-form.
  const cleaned = text.replace(/\/\/[^\n]*/g, '');

  // Tokenise into headers and opcode=value. Values can contain spaces (paths), so we split on
  // the pattern "word=" boundaries rather than plain whitespace.
  const tokens = cleaned.match(/<\w+>|[a-zA-Z0-9_]+=[^=]*?(?=\s+[a-zA-Z0-9_]+=|\s*<|\s*$)/gs) || [];

  const global: Record<string, string> = {};
  let group: Record<string, string> = {};
  const control: Record<string, string> = {};
  const regions: Record<string, string>[] = [];
  let scope: 'global' | 'group' | 'region' | 'control' | null = null;
  let current: Record<string, string> | null = null;
  const ignored = new Set<string>();

  for (const raw of tokens) {
    const tok = raw.trim();
    if (tok.startsWith('<')) {
      const header = tok.slice(1, -1).toLowerCase();
      if (header === 'global') { scope = 'global'; current = global; }
      else if (header === 'group') { scope = 'group'; group = {}; current = group; }
      else if (header === 'region') { scope = 'region'; current = { ...global, ...group }; regions.push(current); }
      else if (header === 'control') { scope = 'control'; current = control; }
      else { scope = null; current = null; } // <effect>, <curve> etc — not modelled
      continue;
    }
    const eq = tok.indexOf('=');
    if (eq < 0 || !current) continue;
    const key = tok.slice(0, eq).trim().toLowerCase();
    const value = tok.slice(eq + 1).trim();
    if (!KNOWN.has(key)) ignored.add(key);
    current[key] = value;
    // Group opcodes set after a region opened must not leak backwards; the cascade snapshot at
    // <region> already captured group state, which is the correct SFZ behaviour.
  }

  const defaultPath = (control['default_path'] || '').replace(/\\/g, '/');
  const num = (o: Record<string, string>, k: string, d: number): number => {
    const v = o[k];
    if (v === undefined) return d;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };

  const outRegions: SfzRegion[] = [];
  const paths = new Set<string>();

  for (const r of regions) {
    if (!r['sample']) continue;
    const samplePath = (defaultPath + r['sample']).replace(/\\/g, '/');
    paths.add(samplePath);

    // `key` sets lokey, hikey AND pitch_keycenter at once (the common one-note-per-file case).
    const keyOp = r['key'];
    const lo = keyOp ? parseNote(keyOp) : parseNote(r['lokey'] ?? '0');
    const hi = keyOp ? parseNote(keyOp) : parseNote(r['hikey'] ?? '127');
    const root = r['pitch_keycenter'] ? parseNote(r['pitch_keycenter']) : keyOp ? parseNote(keyOp) : 60;

    const loopMode = (r['loop_mode'] || r['loopmode'] || 'off').toLowerCase();
    outRegions.push({
      samplePath,
      loKey: Math.min(lo, hi),
      hiKey: Math.max(lo, hi),
      loVel: Math.max(1, num(r, 'lovel', 1)),
      hiVel: Math.min(127, num(r, 'hivel', 127)),
      rrGroup: num(r, 'seq_length', 0) > 1 ? Math.round(num(r, 'group', 0)) || hashRange(lo, hi) : 0,
      rrIndex: Math.round(num(r, 'seq_position', 1)) - 1,
      // pitch/transpose/tune all shift pitch; SFZ `tune` is cents, `transpose`/`pitch` semis.
      tuneSemis: Math.round(num(r, 'transpose', 0) + num(r, 'pitch', 0)),
      tuneCents: num(r, 'tune', 0),
      gainDb: num(r, 'volume', 0),
      pan: num(r, 'pan', 0) / 100,
      offGroup: Math.round(num(r, 'off_by', 0) || num(r, 'off_group', 0)),
      rootNote: root,
      loopMode: loopMode === 'no_loop' || loopMode === 'off' || loopMode === 'one_shot' ? 'off'
        : loopMode === 'loop_sustain' ? 'sustain' : 'forward',
      loopStart: Math.round(num(r, 'loop_start', num(r, 'loopstart', 0))),
      loopEnd: Math.round(num(r, 'loop_end', num(r, 'loopend', 0))),
    });
  }

  // Amp envelope from the first region that specifies one, else a sensible default.
  const src = regions.find((r) => r['ampeg_release'] !== undefined) || regions[0] || {};
  const amp: KeraAmpEnv = {
    attack: num(src, 'ampeg_attack', 0.001),
    hold: num(src, 'ampeg_hold', 0),
    decay: num(src, 'ampeg_decay', 0),
    sustain: num(src, 'ampeg_sustain', 100) / 100,
    release: num(src, 'ampeg_release', 0.15),
  };

  return { regions: outRegions, samplePaths: [...paths], amp, defaultPath, ignoredOpcodes: [...ignored].sort() };
}

/** Stable pseudo-group for round-robins that only set seq_length, keyed by their range. */
function hashRange(lo: number, hi: number): number {
  return 1000 + lo * 128 + hi;
}
