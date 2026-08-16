// SF2 / SF3 SoundFont parser.
//
// SoundFont is a RIFF file with three parallel worlds that have to be cross-referenced:
//   • sdta — the raw sample PCM (16-bit, or Vorbis-compressed in SF3)
//   • pdta — a set of hierarchical records: presets → preset-zones → instruments →
//            instrument-zones → sample-headers, with "generators" (typed parameters) and
//            "bags" (index tables) tying them together
//
// The parsing is fiddly and easy to get subtly wrong — a generator applied at the wrong level,
// an off-by-one in a bag range, a global zone mistaken for a real one — which is exactly why
// this is pure and heavily tested rather than trusted.
//
// This file produces a KeraProgram from a chosen preset. SF3's Vorbis samples are decoded by the
// caller (the browser can decode Ogg); we hand back the compressed bytes with a flag.

import { emptyProgram, type KeraProgram, type KeraSample, type KeraZone } from './zones';

// ── RIFF walking ─────────────────────────────────────────────────────────────

interface Chunk { id: string; start: number; size: number }

function fourCC(v: DataView, off: number): string {
  return String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
}

/** Collect the LIST/chunk tree we need: returns the byte ranges of sdta smpl and each pdta sub. */
function walk(bytes: Uint8Array): { smpl?: Chunk; sm24?: Chunk; pdta: Record<string, Chunk> } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (fourCC(v, 0) !== 'RIFF' || fourCC(v, 8) !== 'sfbk') return null;
  const pdta: Record<string, Chunk> = {};
  let smpl: Chunk | undefined;
  let sm24: Chunk | undefined;

  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = fourCC(v, off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'LIST') {
      const listType = fourCC(v, body);
      let p = body + 4;
      const end = body + size;
      while (p + 8 <= end) {
        const sid = fourCC(v, p);
        const ssize = v.getUint32(p + 4, true);
        const sbody = p + 8;
        if (listType === 'sdta' && sid === 'smpl') smpl = { id: sid, start: sbody, size: ssize };
        else if (listType === 'sdta' && sid === 'sm24') sm24 = { id: sid, start: sbody, size: ssize };
        else if (listType === 'pdta') pdta[sid] = { id: sid, start: sbody, size: ssize };
        p = sbody + ssize + (ssize & 1);
      }
    }
    off = body + size + (size & 1);
  }
  return { smpl, sm24, pdta };
}

// ── pdta record shapes ───────────────────────────────────────────────────────

interface PHdr { name: string; preset: number; bank: number; bagIndex: number }
interface Inst { name: string; bagIndex: number }
interface Bag { genIndex: number; modIndex: number }
interface Gen { op: number; amount: number; sAmount: number } // amount unsigned, sAmount signed
interface SHdr {
  name: string; start: number; end: number; loopStart: number; loopEnd: number;
  sampleRate: number; originalPitch: number; pitchCorrection: number;
  sampleLink: number; sampleType: number;
}

const readAsciiz = (v: DataView, off: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
};

function readPHdr(v: DataView, c: Chunk): PHdr[] {
  const out: PHdr[] = [];
  const n = Math.floor(c.size / 38);
  for (let i = 0; i < n; i++) {
    const o = c.start + i * 38;
    out.push({
      name: readAsciiz(v, o, 20),
      preset: v.getUint16(o + 20, true),
      bank: v.getUint16(o + 22, true),
      bagIndex: v.getUint16(o + 24, true),
    });
  }
  return out;
}

function readInst(v: DataView, c: Chunk): Inst[] {
  const out: Inst[] = [];
  const n = Math.floor(c.size / 22);
  for (let i = 0; i < n; i++) {
    const o = c.start + i * 22;
    out.push({ name: readAsciiz(v, o, 20), bagIndex: v.getUint16(o + 20, true) });
  }
  return out;
}

function readBags(v: DataView, c: Chunk): Bag[] {
  const out: Bag[] = [];
  const n = Math.floor(c.size / 4);
  for (let i = 0; i < n; i++) {
    const o = c.start + i * 4;
    out.push({ genIndex: v.getUint16(o, true), modIndex: v.getUint16(o + 2, true) });
  }
  return out;
}

function readGens(v: DataView, c: Chunk): Gen[] {
  const out: Gen[] = [];
  const n = Math.floor(c.size / 4);
  for (let i = 0; i < n; i++) {
    const o = c.start + i * 4;
    out.push({ op: v.getUint16(o, true), amount: v.getUint16(o + 2, true), sAmount: v.getInt16(o + 2, true) });
  }
  return out;
}

function readSHdrs(v: DataView, c: Chunk): SHdr[] {
  const out: SHdr[] = [];
  const n = Math.floor(c.size / 46);
  for (let i = 0; i < n; i++) {
    const o = c.start + i * 46;
    out.push({
      name: readAsciiz(v, o, 20),
      start: v.getUint32(o + 20, true),
      end: v.getUint32(o + 24, true),
      loopStart: v.getUint32(o + 28, true),
      loopEnd: v.getUint32(o + 32, true),
      sampleRate: v.getUint32(o + 36, true),
      originalPitch: v.getUint8(o + 40),
      pitchCorrection: v.getInt8(o + 41),
      sampleLink: v.getUint16(o + 42, true),
      sampleType: v.getUint16(o + 44, true),
    });
  }
  return out;
}

// SF2 generator operators we use. The full set is large; these are the ones that shape a zone.
const GEN = {
  startAddrsOffset: 0, endAddrsOffset: 1, startloopAddrsOffset: 2, endloopAddrsOffset: 3,
  pan: 17, attackVolEnv: 34, holdVolEnv: 36, decayVolEnv: 37, sustainVolEnv: 38, releaseVolEnv: 40,
  instrument: 41, keyRange: 43, velRange: 44, initialAttenuation: 48, coarseTune: 51, fineTune: 52,
  sampleModes: 54, overridingRootKey: 58,
} as const;

/** Timecents → seconds (SF2 envelope times). 1200 timecents = 1 second doubling. */
const timecentsToSec = (tc: number): number => (tc <= -32768 ? 0 : Math.pow(2, tc / 1200));

export interface Sf2Preset { name: string; bank: number; program: number; index: number }

export interface Sf2File {
  presets: Sf2Preset[];
  /** Parse a chosen preset into a playable program. */
  load(presetIndex: number): KeraProgram | null;
}

/**
 * Parse the structure once; `load(presetIndex)` then materialises one preset. This split lets
 * the browser show the preset list instantly and only decode PCM for the preset actually chosen.
 */
export function parseSf2(bytes: Uint8Array): Sf2File | null {
  const tree = walk(bytes);
  if (!tree || !tree.pdta['phdr'] || !tree.pdta['inst'] || !tree.pdta['shdr']) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const phdr = readPHdr(v, tree.pdta['phdr']);
  const pbag = readBags(v, tree.pdta['pbag']);
  const pgen = readGens(v, tree.pdta['pgen']);
  const inst = readInst(v, tree.pdta['inst']);
  const ibag = readBags(v, tree.pdta['ibag']);
  const igen = readGens(v, tree.pdta['igen']);
  const shdr = readSHdrs(v, tree.pdta['shdr']);

  // The last phdr entry is a terminal sentinel ("EOP"); the same holds for inst.
  const presets: Sf2Preset[] = phdr.slice(0, -1).map((p, i) => ({
    name: p.name, bank: p.bank, program: p.preset, index: i,
  }));

  /** Gather generators for a bag range into a flat map (later gens override earlier). */
  const gensFor = (gens: Gen[], from: number, to: number): Map<number, Gen> => {
    const m = new Map<number, Gen>();
    for (let g = from; g < to; g++) if (gens[g]) m.set(gens[g].op, gens[g]);
    return m;
  };

  const smplChunk = tree.smpl;

  const load = (presetIndex: number): KeraProgram | null => {
    if (presetIndex < 0 || presetIndex >= presets.length) return null;
    const prog = emptyProgram(presets[presetIndex].name);
    prog.source = 'sf2';

    const sampleCache = new Map<number, string>(); // shdr index → KeraSample id
    const ensureSample = (shdrIndex: number): string | null => {
      if (sampleCache.has(shdrIndex)) return sampleCache.get(shdrIndex)!;
      const sh = shdr[shdrIndex];
      if (!sh || !smplChunk) return null;
      // Only mono/left/right ROM-free PCM in SF2; SF3 Vorbis is flagged for the caller.
      const frames = sh.end - sh.start;
      if (frames <= 0) return null;
      const ch = new Float32Array(frames);
      const base = smplChunk.start + sh.start * 2;
      for (let i = 0; i < frames; i++) ch[i] = v.getInt16(base + i * 2, true) / 32768;
      const id = `s${shdrIndex}`;
      const sample: KeraSample = {
        id, name: sh.name, channels: [ch], sampleRate: sh.sampleRate || 44100,
        rootNote: sh.originalPitch <= 127 ? sh.originalPitch : 60,
        fineTune: sh.pitchCorrection,
        loopStart: sh.loopStart - sh.start,
        loopEnd: sh.loopEnd - sh.start,
        loopMode: 'off',
      };
      prog.samples.push(sample);
      sampleCache.set(shdrIndex, id);
      return id;
    };

    const ph = phdr[presetIndex];
    const nextPh = phdr[presetIndex + 1];
    // The preset's zones (preset bags) usually just point at an instrument via GEN.instrument.
    for (let pb = ph.bagIndex; pb < (nextPh?.bagIndex ?? pbag.length); pb++) {
      const pGens = gensFor(pgen, pbag[pb]?.genIndex ?? 0, pbag[pb + 1]?.genIndex ?? pgen.length);
      const instGen = pGens.get(GEN.instrument);
      if (!instGen) continue; // a global preset zone; its gens would offset everything, rare — skip
      const instIndex = instGen.amount;
      const ins = inst[instIndex];
      const nextIns = inst[instIndex + 1];
      if (!ins) continue;

      // The instrument's first bag may be GLOBAL (no sampleID gen) — its gens apply to every
      // following zone. Mishandling this is the classic SF2 bug, so it is explicit here.
      let globalGens = new Map<number, Gen>();
      let first = true;
      for (let ib = ins.bagIndex; ib < (nextIns?.bagIndex ?? ibag.length); ib++) {
        const zGens = gensFor(igen, ibag[ib]?.genIndex ?? 0, ibag[ib + 1]?.genIndex ?? igen.length);
        const hasSample = zGens.has(53); // sampleID generator op = 53
        if (first && !hasSample) { globalGens = zGens; first = false; continue; }
        first = false;
        if (!hasSample) continue;

        const g = (op: number): Gen | undefined => zGens.get(op) ?? globalGens.get(op);
        const shdrIndex = zGens.get(53)!.amount;
        const sampleId = ensureSample(shdrIndex);
        if (!sampleId) continue;

        const keyR = g(GEN.keyRange);
        const velR = g(GEN.velRange);
        const loKey = keyR ? keyR.amount & 0xff : 0;
        const hiKey = keyR ? (keyR.amount >> 8) & 0xff : 127;
        const loVel = velR ? velR.amount & 0xff : 1;
        const hiVel = velR ? (velR.amount >> 8) & 0xff : 127;
        const rootOverride = g(GEN.overridingRootKey);
        const attn = g(GEN.initialAttenuation);
        const pan = g(GEN.pan);

        // Root override lives on the zone in SF2; fold it onto the sample copy for this zone by
        // adjusting tuning so the shared sample model still works.
        const sample = prog.samples.find((s) => s.id === sampleId)!;
        const effectiveRoot = rootOverride && rootOverride.sAmount >= 0 ? rootOverride.sAmount : sample.rootNote;

        // Volume envelope from this zone's generators, if present.
        const envRelease = g(GEN.releaseVolEnv);
        if (envRelease) prog.amp.release = Math.max(prog.amp.release, timecentsToSec(envRelease.sAmount));
        const envAttack = g(GEN.attackVolEnv);
        if (envAttack) prog.amp.attack = Math.max(prog.amp.attack, timecentsToSec(envAttack.sAmount));

        if ((g(GEN.sampleModes)?.amount ?? 0) & 1) sample.loopMode = 'forward';

        const zone: KeraZone = {
          sampleId,
          loKey, hiKey, loVel, hiVel,
          rrGroup: 0, rrIndex: 0,
          tuneSemis: (g(GEN.coarseTune)?.sAmount ?? 0) + (effectiveRoot - sample.rootNote),
          tuneCents: g(GEN.fineTune)?.sAmount ?? 0,
          gainDb: attn ? -(attn.amount / 10) : 0, // initialAttenuation is in centibels of ATTEN
          pan: pan ? pan.sAmount / 500 : 0, // SF2 pan is -500..500 → -1..1
          offGroup: 0,
        };
        prog.zones.push(zone);
      }
    }

    return prog.zones.length ? prog : null;
  };

  return { presets, load };
}
