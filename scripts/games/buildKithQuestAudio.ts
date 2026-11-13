/**
 * Kith Quest audio: master the Chora bounces of the score (one Chora project per cue,
 * services/melos/kithQuestChoraProjects.ts) into the game's MP3s.
 *
 *   1. npx vite --config kithquest-score-lab.vite.config.mjs        (lab on :3255)
 *   2. node scripts/kith-quest-bounce.mjs [cue,cue]                  (renderGroove → <cache>/bounce/<cue>.f32)
 *   3. node node_modules/tsx/dist/cli.mjs scripts/games/buildKithQuestAudio.ts [cue ...]
 *
 * Loops: the body is cut out and the ring-out after it (the project's 2-bar tail) is added onto the loop's start,
 * so the reverb and last notes carry across the seam exactly as they would if the music kept playing. The MP3 holds
 * a short pre-roll (the loop's end) and post-roll (its start) around the loop, and the manifest gives loopStart /
 * loopEnd in seconds, so any decoder padding shifts both points together and the seam stays seamless.
 * Jingles: trimmed after the ring-out and faded.
 *
 * Output: public/kith-party/quest-music/<cue>.mp3 + manifest.json (MP3 via libsndfile in Python's soundfile).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { QUEST_CUES, type Cue } from '../../data/gameScores/kithQuest';

const OUT = path.resolve('public/kith-party/quest-music');
const CACHE = process.env.KITHQUEST_AUDIO_CACHE || (fs.existsSync('D:/Plajah Runtime') ? 'D:/Plajah Runtime/cache/kith-quest-audio' : path.join(os.tmpdir(), 'kith-quest-audio'));
const BOUNCE = path.join(CACHE, 'bounce');
const ANCHOR = 0.05; // renderGroove's lead-in before beat 0
const ROLL = 0.3;    // pre/post-roll seconds around the loop in the file
const OUT_SR = 44100; // 44.1 kHz VBR ~200 kbps: the 32 kHz ~106 kbps encode put an audible metallic codec haze on the score
fs.mkdirSync(OUT, { recursive: true });

function readBounce(id: string) {
  const f = path.join(BOUNCE, `${id}.f32`);
  if (!fs.existsSync(f)) throw new Error(`missing bounce ${f}: run scripts/kith-quest-bounce.mjs first`);
  const meta = JSON.parse(fs.readFileSync(f.replace(/\.f32$/, '.json'), 'utf8'));
  const raw = new Float32Array(new Uint8Array(fs.readFileSync(f)).buffer);
  const n = raw.length / 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = raw[2 * i]; R[i] = raw[2 * i + 1]; }
  return { L, R, sr: meta.sampleRate as number };
}

/* ── Mastering (Music Council 2026-11-12) ──────────────────────────────────────────────────
 * 1. Mono-fold below 120 Hz (side channel high-passed): the low end sits centred, the battle's negative correlation goes.
 * 2. Integrated loudness (ITU-R BS.1770: K-weighting, 400 ms blocks, −70 LUFS absolute and −10 LU relative gates)
 *    brought to the mood's target, so a calm lullaby keeps its dynamics instead of being pushed up to an RMS.
 * 3. A 5 ms look-ahead peak limiter at −1.5 dBFS (≈ −1 dBTP after encoding). */
type BQ = [number, number, number, number, number];
function biquad(x: Float32Array, [b0, b1, b2, a1, a2]: BQ): Float32Array {
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function highpass(f0: number, q: number, sr: number): BQ {
  const w = 2 * Math.PI * f0 / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
}
function highshelf(f0: number, q: number, gainDb: number, sr: number): BQ {
  const A = Math.pow(10, gainDb / 40), w = 2 * Math.PI * f0 / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), sq = 2 * Math.sqrt(A) * al;
  const a0 = (A + 1) - (A - 1) * c + sq;
  return [A * ((A + 1) + (A - 1) * c + sq) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - sq) / a0, 2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - sq) / a0];
}
export function lufs(L: Float32Array, R: Float32Array, sr: number): number {
  const k = (x: Float32Array) => biquad(biquad(x, highshelf(1681.974450955533, 0.7071752369554196, 3.999843853973347, sr)), highpass(38.13547087602444, 0.5003270373238773, sr));
  const kl = k(L), kr = k(R), blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), z: number[] = [];
  for (let s = 0; s + blk <= kl.length; s += hop) { let e = 0; for (let i = s; i < s + blk; i++) e += kl[i] * kl[i] + kr[i] * kr[i]; z.push(e / blk); }
  const lk = (e: number) => -0.691 + 10 * Math.log10(e + 1e-12);
  const abs = z.filter((e) => lk(e) > -70); if (!abs.length) return -70;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((e) => lk(e) > rel);
  return lk(g.reduce((a, b) => a + b, 0) / g.length);
}
function monoFold(L: Float32Array, R: Float32Array, sr: number) {
  const n = L.length, side = new Float32Array(n);
  for (let i = 0; i < n; i++) side[i] = (L[i] - R[i]) / 2;
  const hp = biquad(biquad(side, highpass(120, 0.7071, sr)), highpass(120, 0.7071, sr));
  for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) / 2; L[i] = m + hp[i]; R[i] = m - hp[i]; }
}
function master(L: Float32Array, R: Float32Array, targetLufs: number, sr: number) {
  monoFold(L, R, sr);
  const n = L.length, g = Math.pow(10, (targetLufs - lufs(L, R, sr)) / 20), ceil = Math.pow(10, -1.5 / 20);
  const look = Math.round(0.005 * sr), rel = Math.exp(-1 / (0.12 * sr));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])) * g; need[i] = p > ceil ? ceil / p : 1; }
  let env = 1;
  for (let i = 0; i < n; i++) {
    let m = 1; for (let j = i; j < Math.min(n, i + look); j += 4) if (need[j] < m) m = need[j];
    env = m < env ? m : m + (env - m) * rel;
    L[i] = Math.max(-ceil, Math.min(ceil, L[i] * g * env)); R[i] = Math.max(-ceil, Math.min(ceil, R[i] * g * env));
  }
}

/** Integrated loudness per mood (LUFS) — the council's targets. */
const LUFS_TARGET: Record<string, number> = { calm: -19, title: -16, energy: -16, danger: -17.5, fear: -17.5, battle: -15, clear: -15, gameover: -16 };
const targetFor = (c: Cue) => LUFS_TARGET[c.id.split('-')[0]] ?? -17;

/* ── The Lyria bed (hybrid score, Kenne 2026-11-13) ─────────────────────────────────────────
 * scripts/games/kith-quest-beds.sh records a cinematic orchestral bed per loop from Lyria RealTime (the cue's tempo,
 * a scale holding exactly its notes, no drums). It is crossfaded into a seamless loop of the body's length and laid
 * under the Chora score at a set loudness below it: the Chora themes stay on top, the bed is the orchestra's body. */
const BED_REL: Record<string, number> = { title: -5, calm: -7, energy: -6, danger: -3, fear: -4, battle: -6 };
function readBed(id: string, sr: number, len: number): { L: Float32Array; R: Float32Array } | null {
  const f = path.join(CACHE, 'beds', `${id}.wav`);
  if (!fs.existsSync(f)) return null;
  const b = fs.readFileSync(f), n = (b.length - 44) / 4, bsr = b.readUInt32LE(24);
  const L0 = new Float32Array(n), R0 = new Float32Array(n);
  for (let i = 0; i < n; i++) { L0[i] = b.readInt16LE(44 + i * 4) / 32768; R0[i] = b.readInt16LE(46 + i * 4) / 32768; }
  // resample to the bounce rate (linear: the bed is a soft sustained texture)
  const ratio = bsr / sr, m = Math.floor(n / ratio), L = new Float32Array(m), R = new Float32Array(m);
  for (let i = 0; i < m; i++) { const x = i * ratio, k = Math.floor(x), f2 = x - k; L[i] = L0[k] + ((L0[k + 1] ?? L0[k]) - L0[k]) * f2; R[i] = R0[k] + ((R0[k + 1] ?? R0[k]) - R0[k]) * f2; }
  // seamless loop of `len`: the run past the end is equal-power crossfaded onto the start
  const xf = Math.min(Math.round(4 * sr), m - len);
  if (xf <= 0) return null;
  const oL = L.slice(0, len), oR = R.slice(0, len);
  for (let i = 0; i < xf; i++) { const t = i / xf, a = Math.sin(t * Math.PI / 2), z = Math.cos(t * Math.PI / 2); oL[i] = L[i] * a + L[len + i] * z; oR[i] = R[i] * a + R[len + i] * z; }
  return { L: oL, R: oR };
}
function layBed(c: Cue, L: Float32Array, R: Float32Array, sr: number): string {
  const rel = BED_REL[c.id.split('-')[0]];
  if (rel === undefined) return '';
  const bed = readBed(c.id, sr, L.length);
  if (!bed) return ' (no bed)';
  const g = Math.pow(10, (lufs(L, R, sr) + rel - lufs(bed.L, bed.R, sr)) / 20);
  for (let i = 0; i < L.length; i++) { L[i] += bed.L[i] * g; R[i] += bed.R[i] * g; }
  return ` + Lyria bed ${rel} dB`;
}

function writeWav(file: string, L: Float32Array, R: Float32Array, sr: number) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), o); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), o + 2); o += 4; }
  fs.writeFileSync(file, buf);
}

interface Entry { title: string; file: string; loop: boolean; bpm: number; duration: number; loopStart?: number; loopEnd?: number }

function build(c: Cue): Entry {
  const { L, R, sr } = readBounce(c.id);
  const a = Math.round(ANCHOR * sr), bodyLen = Math.round(c.chords.length * c.beats * 60 / c.bpm * sr);
  let oL: Float32Array, oR: Float32Array, entry: Entry, bedNote = '';
  if (c.loop) {
    // the loop with its own ring-out wrapped onto the start
    const lL = new Float32Array(bodyLen), lR = new Float32Array(bodyLen);
    for (let i = 0; i < bodyLen; i++) { lL[i] = L[a + i] ?? 0; lR[i] = R[a + i] ?? 0; }
    for (let i = 0; a + bodyLen + i < L.length; i++) { lL[i % bodyLen] += L[a + bodyLen + i]; lR[i % bodyLen] += R[a + bodyLen + i]; }
    bedNote = layBed(c, lL, lR, sr);
    master(lL, lR, targetFor(c), sr);
    const roll = Math.round(ROLL * sr);
    oL = new Float32Array(bodyLen + 2 * roll); oR = new Float32Array(bodyLen + 2 * roll);
    for (let i = 0; i < oL.length; i++) { const k = ((i - roll) % bodyLen + bodyLen) % bodyLen; oL[i] = lL[k]; oR[i] = lR[k]; }
    entry = { title: c.title, file: `${c.id}.mp3`, loop: true, bpm: c.bpm, duration: oL.length / sr, loopStart: ROLL, loopEnd: ROLL + bodyLen / sr };
  } else {
    let end = L.length - 1;
    while (end > a && Math.max(Math.abs(L[end]), Math.abs(R[end])) < 0.0008) end--;
    end = Math.min(end, a + bodyLen + Math.round(3 * sr)); // at most 3 s of ring-out after the last bar
    oL = L.slice(a, end + 1); oR = R.slice(a, end + 1);
    master(oL, oR, targetFor(c), sr);
    const fade = Math.min(oL.length, Math.round(1.2 * sr));
    for (let i = 0; i < fade; i++) { const g = i / fade; oL[oL.length - 1 - i] *= g; oR[oR.length - 1 - i] *= g; }
    entry = { title: c.title, file: `${c.id}.mp3`, loop: false, bpm: c.bpm, duration: oL.length / sr };
  }
  const wav = path.join(CACHE, `${c.id}.wav`);
  writeWav(wav, oL, oR, sr);
  jobs.push([wav, path.join(OUT, entry.file), sr]);
  let pk = 0; for (let i = 0; i < oL.length; i++) pk = Math.max(pk, Math.abs(oL[i]), Math.abs(oR[i]));
  console.log(`${c.id.padEnd(16)} ${entry.loop ? 'loop' : 'jingle'} ${entry.duration.toFixed(1)}s peak ${pk.toFixed(2)} · ${lufs(oL, oR, sr).toFixed(1)} LUFS (target ${targetFor(c)})${bedNote}`);
  return entry;
}

const jobs: [string, string, number][] = [];
const only = process.argv.slice(2);
const manPath = path.join(OUT, 'manifest.json');
const manifest: Record<string, Entry> = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {};
for (const c of QUEST_CUES) if (!only.length || only.includes(c.id)) manifest[c.id] = build(c);

const py = path.join(CACHE, 'encode.py');
fs.writeFileSync(py, [
  'import sys, json, soundfile as sf',
  'from math import gcd',
  'from scipy.signal import resample_poly',
  `OUT_SR = ${OUT_SR}`,
  'for src, dst, sr in json.load(open(sys.argv[1])):',
  '    data, sr = sf.read(src, dtype="float32")',
  '    g = gcd(int(sr), OUT_SR); data = resample_poly(data, OUT_SR // g, int(sr) // g, axis=0).astype("float32")',
  '    sf.write(dst, data, OUT_SR, format="MP3", subtype="MPEG_LAYER_III", bitrate_mode="VARIABLE", compression_level=0.15)',
  '    print(dst)',
].join('\n'));
const jf = path.join(CACHE, 'jobs.json');
fs.writeFileSync(jf, JSON.stringify(jobs));
execFileSync('python', [py, jf], { stdio: 'inherit' });
fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1));
console.log(`manifest: ${Object.keys(manifest).length} cues → ${manPath}`);
