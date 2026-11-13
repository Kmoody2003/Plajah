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

/** RMS target per mood, then a 5 ms look-ahead peak limiter (ceiling .8) with a gentle release. */
function master(L: Float32Array, R: Float32Array, rmsTarget: number, sr: number) {
  const n = L.length;
  let ss = 0; for (let i = 0; i < n; i++) ss += L[i] * L[i] + R[i] * R[i];
  const g = rmsTarget / (Math.sqrt(ss / (2 * n)) || 1e-6), ceil = 0.8;
  const look = Math.round(0.005 * sr), rel = Math.exp(-1 / (0.09 * sr));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])) * g; need[i] = p > ceil ? ceil / p : 1; }
  let env = 1;
  for (let i = 0; i < n; i++) {
    let m = 1; for (let j = i; j < Math.min(n, i + look); j += 8) if (need[j] < m) m = need[j];
    env = m < env ? m : m + (env - m) * rel;
    L[i] = Math.max(-0.84, Math.min(0.84, L[i] * g * env)); R[i] = Math.max(-0.84, Math.min(0.84, R[i] * g * env));
  }
}

const RMS: Record<string, number> = { calm: 0.1, energy: 0.15, title: 0.14, danger: 0.11, fear: 0.12, battle: 0.155, clear: 0.15, gameover: 0.1 };
const rmsFor = (c: Cue) => RMS[c.id.split('-')[0]] ?? 0.13;

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
  let oL: Float32Array, oR: Float32Array, entry: Entry;
  if (c.loop) {
    // the loop with its own ring-out wrapped onto the start
    const lL = new Float32Array(bodyLen), lR = new Float32Array(bodyLen);
    for (let i = 0; i < bodyLen; i++) { lL[i] = L[a + i] ?? 0; lR[i] = R[a + i] ?? 0; }
    for (let i = 0; a + bodyLen + i < L.length; i++) { lL[i % bodyLen] += L[a + bodyLen + i]; lR[i % bodyLen] += R[a + bodyLen + i]; }
    master(lL, lR, rmsFor(c), sr);
    const roll = Math.round(ROLL * sr);
    oL = new Float32Array(bodyLen + 2 * roll); oR = new Float32Array(bodyLen + 2 * roll);
    for (let i = 0; i < oL.length; i++) { const k = ((i - roll) % bodyLen + bodyLen) % bodyLen; oL[i] = lL[k]; oR[i] = lR[k]; }
    entry = { title: c.title, file: `${c.id}.mp3`, loop: true, bpm: c.bpm, duration: oL.length / sr, loopStart: ROLL, loopEnd: ROLL + bodyLen / sr };
  } else {
    let end = L.length - 1;
    while (end > a && Math.max(Math.abs(L[end]), Math.abs(R[end])) < 0.0008) end--;
    oL = L.slice(a, end + 1); oR = R.slice(a, end + 1);
    master(oL, oR, rmsFor(c), sr);
    const fade = Math.min(oL.length, Math.round(0.4 * sr));
    for (let i = 0; i < fade; i++) { const g = i / fade; oL[oL.length - 1 - i] *= g; oR[oR.length - 1 - i] *= g; }
    entry = { title: c.title, file: `${c.id}.mp3`, loop: false, bpm: c.bpm, duration: oL.length / sr };
  }
  const wav = path.join(CACHE, `${c.id}.wav`);
  writeWav(wav, oL, oR, sr);
  jobs.push([wav, path.join(OUT, entry.file), sr]);
  let pk = 0; for (let i = 0; i < oL.length; i++) pk = Math.max(pk, Math.abs(oL[i]), Math.abs(oR[i]));
  console.log(`${c.id.padEnd(16)} ${entry.loop ? 'loop' : 'jingle'} ${entry.duration.toFixed(1)}s peak ${pk.toFixed(2)}`);
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
