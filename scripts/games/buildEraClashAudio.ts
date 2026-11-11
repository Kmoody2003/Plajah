/**
 * Era Clash audio: the arena score and the sound effects, rendered to MP3 for the game.
 *
 *   1. Bounce the score (the Chora Studio projects, services/melos/eraClashChoraProjects.ts) with Chora's
 *      own renderer:  npx vite --config eraclash-score-lab.vite.config.mjs
 *                     -> http://127.0.0.1:3243/eraclash-score-lab.html?auto=1   (stems land in <tmp>/era-clash-audio/bounce)
 *   2. node node_modules/tsx/dist/cli.mjs scripts/games/buildEraClashAudio.ts music [cueId ...]
 *      mixes the stems (music side-chained to the project's kick), masters, and cuts each cue into an intro
 *      plus a seamless loop (the second pass of the 32-bar body, so the loop point carries its own tails).
 *   node node_modules/tsx/dist/cli.mjs scripts/games/buildEraClashAudio.ts sfx      sound-effect bank
 *
 * SFX: every effect is synthesized here sample by sample (layered thumps, skin slaps, cracks, whooshes,
 * armour clanks, booms) with a few variants each so repeated hits never sound identical.
 *
 * Output: public/games/era-clash/audio/*.mp3 + manifest.json (MP3 via libsndfile in Python's soundfile).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CUES, INTRO_BARS, BODY_BARS, type CueSpec } from '../../data/gameScores/eraClash';
import { buildEraClashGrooveDoc } from '../../services/melos/eraClashChoraProjects';
import type { GrooveDoc } from '../../services/melos/beats/grooveDoc';

const OUT = path.resolve('public/games/era-clash/audio');
const TMP = path.join(os.tmpdir(), 'era-clash-audio');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

/* ── DSP toolkit ──────────────────────────────────────────────────────────────────────────── */

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
const noise = () => rnd() * 2 - 1;
const TAU = Math.PI * 2;

/** RBJ biquad, coefficients refreshable per block for sweeps. */
class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0; x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(private sr: number, type?: 'lp' | 'hp' | 'bp', f?: number, q = 0.707) { if (type && f) this.set(type, f, q); }
  set(type: 'lp' | 'hp' | 'bp', f: number, q = 0.707) {
    const w = TAU * Math.min(f, this.sr * 0.45) / this.sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), a0 = 1 + al;
    if (type === 'lp') { this.b0 = (1 - cs) / 2 / a0; this.b1 = (1 - cs) / a0; this.b2 = this.b0; }
    else if (type === 'hp') { this.b0 = (1 + cs) / 2 / a0; this.b1 = -(1 + cs) / a0; this.b2 = this.b0; }
    else { this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0; }
    this.a1 = -2 * cs / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

/** Small stereo Schroeder room (wet only). */
function room(L: Float32Array, R: Float32Array, sr: number, decay: number, wet: number, damp = 0.4) {
  const combs = [0.0253, 0.0269, 0.0290, 0.0307, 0.0322, 0.0338].map((t) => t * (0.6 + decay * 0.25));
  const fb = Math.min(0.9, Math.pow(0.001, combs[0] / Math.max(0.2, decay)));
  const mk = (extra: number) => combs.map((t) => ({ buf: new Float32Array(Math.round(t * sr) + extra), i: 0, st: 0 }));
  const cl = mk(0), cr = mk(17);
  const ap = (len: number) => ({ buf: new Float32Array(len), i: 0 });
  const al = [ap(Math.round(0.005 * sr)), ap(Math.round(0.0017 * sr))], ar = [ap(Math.round(0.0053 * sr)), ap(Math.round(0.0019 * sr))];
  const runAp = (a: { buf: Float32Array; i: number }, x: number) => { const b = a.buf[a.i]; const y = -x + b; a.buf[a.i] = x + b * 0.5; a.i = (a.i + 1) % a.buf.length; return y; };
  for (let n = 0; n < L.length; n++) {
    const inp = (L[n] + R[n]) * 0.5;
    let ol = 0, or = 0;
    for (const c of cl) { const y = c.buf[c.i]; c.st = y * (1 - damp) + c.st * damp; c.buf[c.i] = inp + c.st * fb; c.i = (c.i + 1) % c.buf.length; ol += y; }
    for (const c of cr) { const y = c.buf[c.i]; c.st = y * (1 - damp) + c.st * damp; c.buf[c.i] = inp + c.st * fb; c.i = (c.i + 1) % c.buf.length; or += y; }
    ol = runAp(al[1], runAp(al[0], ol / combs.length)); or = runAp(ar[1], runAp(ar[0], or / combs.length));
    L[n] += ol * wet; R[n] += or * wet;
  }
}

/** A mono one-shot rendered into a buffer by a per-sample voice. */
function voice(sr: number, sec: number, fn: (t: number, i: number) => number): Float32Array {
  const n = Math.round(sec * sr), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / sr, i);
  return out;
}
function addAt(dstL: Float32Array, dstR: Float32Array, src: Float32Array, at: number, gain: number, pan = 0) {
  const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = 0; i < src.length; i++) {
    const k = at + i; if (k < 0) continue; if (k >= dstL.length) break;
    dstL[k] += src[i] * gain * gl; dstR[k] += src[i] * gain * gr;
  }
}

/* ── Music ────────────────────────────────────────────────────────────────────────────────── */
/*
 * The score is a Chora project per cue (services/melos/eraClashChoraProjects.ts). Its stems are bounced by
 * Chora's own renderGroove in eraclash-score-lab.html (music = instrument tracks, kit = MEKA house kit,
 * soma = SOMA drums) into <tmp>/era-clash-audio/bounce/. This step only mixes the stems (the music ducks
 * under the project's own kick hits, the house pump), masters, and cuts the loop.
 */

const BOUNCE = path.join(TMP, 'bounce');
const BOUNCE_SR = 48000;
/** renderGroove's lead-in before beat 0 (render.ts `anchor`). */
const ANCHOR = 0.05;
/** Stem levels into the master, and how deep the music ducks under the kick. */
const MIX = { music: 1.0, kit: 1.1, soma: 0.85, duck: 0.32 };
/** Master tone: the physical models print dark, so the master gets presence and air shelves (parallel high-passes). */
const TONE = { presenceHz: 3000, airHz: 8000, mudHz: 160, mud: 0.35, presenceTarget: 0.1, airTarget: 0.035 };

/** Energy share above `hz` (biquad high-pass) of a mono signal: the master's tone meter. */
function shareAbove(x: Float32Array, sr: number, hz: number): number {
  const f = new Biquad(sr, 'hp', hz); let e = 0, all = 0;
  for (let i = 0; i < x.length; i++) { const y = f.run(x[i]); e += y * y; all += x[i] * x[i]; }
  return all > 0 ? e / all : 0;
}

function readStem(id: string, stem: string): { L: Float32Array; R: Float32Array } {
  const f = path.join(BOUNCE, `${id}-${stem}.f32`);
  if (!fs.existsSync(f)) throw new Error(`missing bounce ${f}: run eraclash-score-lab.html?auto=1 first`);
  const meta = JSON.parse(fs.readFileSync(f.replace(/\.f32$/, '.json'), 'utf8'));
  if (meta.sampleRate !== BOUNCE_SR) throw new Error(`${f}: expected ${BOUNCE_SR} Hz, got ${meta.sampleRate}`);
  const raw = new Float32Array(new Uint8Array(fs.readFileSync(f)).buffer);
  const n = raw.length / 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = raw[2 * i]; R[i] = raw[2 * i + 1]; }
  return { L, R };
}

/** Kick onsets (seconds) from the project itself: the House Kick pad's hits in every section. */
function kickTimes(doc: GrooveDoc, bpm: number): number[] {
  const spb = 60 / bpm, out: number[] = [];
  const groupA = doc.arrangement.find((t) => t.songGroup === 0);
  for (const clip of groupA?.clips ?? []) {
    const pat = doc.patterns.find((p) => p.id === clip.patternId);
    const row = pat?.steps[0];
    if (!pat || !row) continue;
    for (let s = 0; s < clip.lengthBeats * 4; s++) {
      const st = row[s % pat.length];
      if (st) out.push(ANCHOR + (clip.startBeats + (s + (st.micro ?? 0)) / 4) * spb);
    }
  }
  return out.sort((a, b) => a - b);
}

async function renderCue(c: CueSpec) {
  const sr = BOUNCE_SR;
  const music = readStem(c.id, 'music'), kit = readStem(c.id, 'kit'), soma = readStem(c.id, 'soma');
  const n = Math.min(music.L.length, kit.L.length, soma.L.length);
  const doc = buildEraClashGrooveDoc(c.id);
  const kicks = kickTimes(doc, c.bpm).map((t) => Math.round(t * sr));

  // side-chain: the instruments dip under every kick and swell back
  const duck = new Float32Array(n).fill(1);
  const rel = 0.15 * sr, att = 0.004 * sr;
  for (const k of kicks) for (let i = 0; i < rel * 1.6 && k + i < n; i++) {
    const g = 1 - MIX.duck * (i < att ? i / att : Math.exp(-(i - att) / (rel * 0.5)));
    if (g < duck[k + i]) duck[k + i] = g;
  }
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = music.L[i] * MIX.music * duck[i] + kit.L[i] * MIX.kit + soma.L[i] * MIX.soma;
    R[i] = music.R[i] * MIX.music * duck[i] + kit.R[i] * MIX.kit + soma.R[i] * MIX.soma;
  }
  const hpL = new Biquad(sr, 'hp', 30), hpR = new Biquad(sr, 'hp', 30);
  /* presence and air shelves set by measurement: each cue's instruments print differently (LYRA strings
     are dark, PNEUMA's breath is airy), so the shelves move each mix toward the same tonal target */
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const s3 = shareAbove(mono, sr, TONE.presenceHz), s8 = shareAbove(mono, sr, TONE.airHz);
  const presence = Math.max(-0.4, Math.min(1, Math.sqrt(TONE.presenceTarget / Math.max(1e-6, s3)) - 1));
  const air = Math.max(-0.6, Math.min(1.2, Math.sqrt(TONE.airTarget / Math.max(1e-6, s8)) - 1 - presence));
  console.log(`  tone: >3k ${(s3 * 100).toFixed(1)}% >8k ${(s8 * 100).toFixed(1)}% -> presence ${presence.toFixed(2)} air ${air.toFixed(2)}`);
  const pL = new Biquad(sr, 'hp', TONE.presenceHz), pR = new Biquad(sr, 'hp', TONE.presenceHz);
  const aL = new Biquad(sr, 'hp', TONE.airHz), aR = new Biquad(sr, 'hp', TONE.airHz);
  /* the drum bodies (kick, timpani, taiko) pile up around 100–200 Hz: a broad dip there */
  const mL = new Biquad(sr, 'bp', TONE.mudHz, 0.8), mR = new Biquad(sr, 'bp', TONE.mudHz, 0.8);
  for (let i = 0; i < n; i++) {
    const l = hpL.run(L[i]), r = hpR.run(R[i]);
    L[i] = l + pL.run(l) * presence + aL.run(l) * air - mL.run(l) * TONE.mud;
    R[i] = r + pR.run(r) * presence + aR.run(r) * air - mR.run(r) * TONE.mud;
  }
  if (process.env.STEMS) writeWav(path.join(TMP, `${c.id}-mix.wav`), [L, R], sr);
  master(L, R, 0.17, sr);

  // cut: intro, then the second pass of the body (its first moments carry the first pass's tail) as the loop
  const spb = 60 / c.bpm, bar = 4 * spb;
  const introEnd = Math.round((ANCHOR + INTRO_BARS * bar) * sr);
  const bodyLen = Math.round(BODY_BARS * bar * sr);
  const body2 = introEnd + bodyLen;
  const margin = Math.round(0.1 * sr), keep = bodyLen + margin + Math.round(0.4 * sr);
  const xf = Math.round(0.03 * sr);
  const total = introEnd + keep, oL = new Float32Array(total), oR = new Float32Array(total);
  for (let i = 0; i < introEnd; i++) { oL[i] = L[i]; oR[i] = R[i]; }
  for (let i = 0; i < keep; i++) {
    const g = i < xf ? i / xf : 1;
    oL[introEnd + i] = L[body2 + i] * g + (i < xf ? L[introEnd + i] * (1 - g) : 0);
    oR[introEnd + i] = R[body2 + i] * g + (i < xf ? R[introEnd + i] * (1 - g) : 0);
  }
  /* bake the loop seam: the last 60 ms before loopEnd fade into the 60 ms before loopStart, so at the jump
     the waveform continues exactly (two passes of physical models are close, not sample-identical) */
  const lsI = introEnd + margin, leI = lsI + bodyLen, sx = Math.round(0.06 * sr);
  for (let i = 0; i < sx; i++) {
    const w = 0.5 - 0.5 * Math.cos(Math.PI * i / sx), k = leI - sx + i, j = lsI - sx + i;
    oL[k] = oL[k] * (1 - w) + oL[j] * w; oR[k] = oR[k] * (1 - w) + oR[j] * w;
  }
  for (let i = 0; leI + i < total && lsI + i < total; i++) { oL[leI + i] = oL[lsI + i]; oR[leI + i] = oR[lsI + i]; }
  const file = `music-${c.id}.mp3`;
  /* the MP3 is 32 kHz (about 1 MB per cue); loop points are in seconds, so they hold through the resample */
  encode(oL, oR, sr, file, 0.6, 32000);
  return { id: c.id, title: c.title, file, bpm: c.bpm, loopStart: lsI / sr, loopEnd: leI / sr, duration: total / sr };
}


/** Loudness target by RMS, then a 5 ms look-ahead peak limiter (ceiling 0.8, headroom for the MP3 encoder) with a gentle release. */
function master(L: Float32Array, R: Float32Array, rmsTarget: number, sr = 32000) {
  const n = L.length;
  let ss = 0; for (let i = 0; i < n; i++) ss += L[i] * L[i] + R[i] * R[i];
  const rms = Math.sqrt(ss / (2 * n)) || 1e-6, g = rmsTarget / rms, ceil = 0.8;
  const look = Math.round(0.005 * sr), relCoef = Math.exp(-1 / (0.09 * sr));
  /* required gain per sample, then the minimum over the look-ahead window, then smoothed release */
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])) * g; need[i] = p > ceil ? ceil / p : 1; }
  const gain = new Float32Array(n);
  const dq: number[] = []; let head = 0;
  for (let i = 0; i < n + look; i++) {
    if (i < n) { while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) dq.pop(); dq.push(i); }
    const j = i - look; if (j < 0) continue;
    while (dq[head] < j - look) head++;
    gain[j] = need[dq[head]];
  }
  let env = 1;
  for (let i = 0; i < n; i++) { env = gain[i] < env ? gain[i] : gain[i] + (env - gain[i]) * relCoef; L[i] *= g * env; R[i] *= g * env; }
  for (let i = 0; i < n; i++) { L[i] = Math.max(-0.84, Math.min(0.84, L[i])); R[i] = Math.max(-0.84, Math.min(0.84, R[i])); }
}

function writeWav(file: string, chans: Float32Array[], sr: number) {
  const n = chans[0].length, ch = chans.length, buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[c][i])) * 32767), o); o += 2; }
  fs.writeFileSync(file, buf);
}
const pending: Array<[string, string, number, number]> = [];
function encode(L: Float32Array, R: Float32Array | null, sr: number, name: string, quality = 0.45, outSr = 0) {
  const wav = path.join(TMP, name.replace(/\.mp3$/, '.wav'));
  writeWav(wav, R ? [L, R] : [L], sr);
  pending.push([wav, path.join(OUT, name), quality, outSr]);
}
function flushEncodes() {
  if (!pending.length) return;
  const py = path.join(TMP, 'encode.py');
  fs.writeFileSync(py, [
    'import sys, json, soundfile as sf',
    'jobs = json.load(open(sys.argv[1]))',
    'from math import gcd',
    'for src, dst, q, out_sr in jobs:',
    '    data, sr = sf.read(src, dtype="float32")',
    '    if out_sr and out_sr != sr:',
    '        from scipy.signal import resample_poly',
    '        g = gcd(int(sr), int(out_sr)); data = resample_poly(data, int(out_sr) // g, int(sr) // g, axis=0).astype("float32"); sr = out_sr',
    '    sf.write(dst, data, sr, format="MP3", subtype="MPEG_LAYER_III", bitrate_mode="VARIABLE", compression_level=q)',
    '    print(dst)',
  ].join('\n'));
  const jobs = path.join(TMP, 'jobs.json');
  fs.writeFileSync(jobs, JSON.stringify(pending));
  execFileSync('python', [py, jobs], { stdio: 'inherit' });
  pending.length = 0;
}

/* ── Sound effects ────────────────────────────────────────────────────────────────────────── */

function sfxBank() {
  const sr = 44100;
  const fx: Record<string, Float32Array[]> = {};
  const add = (name: string, make: (k: number) => Float32Array, variants = 1) => { fx[name] = Array.from({ length: variants }, (_, k) => make(k)); };
  const sat = (x: number, d: number) => Math.tanh(x * d) / Math.tanh(d);
  const withRoom = (m: Float32Array, decay: number, wet: number) => { const L = m.slice(), R = m.slice(); room(L, R, sr, decay, wet, 0.5); const o = new Float32Array(m.length); for (let i = 0; i < m.length; i++) o[i] = (L[i] + R[i]) * 0.5; return o; };
  const pad = (m: Float32Array, sec: number) => { const o = new Float32Array(m.length + Math.round(sec * sr)); o.set(m); return o; };

  /* punches: chest thump + skin slap + meaty low-mid + a tick of transient */
  add('hit', (k) => {
    const f0 = 95 + k * 12, slap = new Biquad(sr, 'bp', 1700 + k * 300, 1.3), meat = new Biquad(sr, 'lp', 520 - k * 40);
    return withRoom(pad(voice(sr, 0.22, (t) => sat(
      Math.sin(TAU * (f0 * t + (f0 * 0.6 / 30) * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 26) * 0.9 +
      slap.run(noise()) * Math.exp(-t * 90) * 2.2 +
      meat.run(noise()) * Math.exp(-t * 28) * 1.3 +
      (t < 0.0015 ? noise() * 0.8 : 0), 2.2) * 0.9), 0.15), 0.35, 0.12);
  }, 3);
  /* heavy blows: deeper body, a bone crack on top, distorted crunch, sub tail */
  add('hitHard', (k) => {
    const crack = new Biquad(sr, 'hp', 2600 + k * 400), crunch = new Biquad(sr, 'bp', 760 + k * 120, 0.9);
    return withRoom(pad(voice(sr, 0.42, (t) => sat(
      Math.sin(TAU * (62 * t + (70 / 20) * (1 - Math.exp(-t * 20)))) * Math.exp(-t * 9) * 1.1 +
      crack.run(noise()) * Math.exp(-t * 160) * 2.4 +
      crunch.run(noise()) * Math.exp(-t * 16) * 1.6 +
      (t < 0.002 ? noise() : 0), 3.0) * 0.95), 0.3), 0.6, 0.16);
  }, 3);
  /* blocked: a muffled guard thud and a ring of armour */
  add('block', (k) => {
    const thud = new Biquad(sr, 'lp', 700);
    const parts = [[1240 + k * 90, 1], [2710 + k * 140, 0.6], [4130, 0.4], [5600, 0.25]];
    return withRoom(pad(voice(sr, 0.35, (t) => {
      let ring = 0; parts.forEach(([f, a], j) => { ring += Math.sin(TAU * f * t) * a * Math.exp(-t * (14 + j * 6)); });
      return sat(thud.run(noise()) * Math.exp(-t * 40) * 1.6 + Math.sin(TAU * 140 * t) * Math.exp(-t * 30) * 0.6 + ring * 0.35 * Math.min(1, t * 3000), 1.8) * 0.85;
    }), 0.2), 0.5, 0.18);
  }, 2);
  /* whooshes: band-passed air whose centre rises and falls with the swing */
  const whoosh = (sec: number, lo: number, hi: number, q: number, gain: number) => {
    const bp = new Biquad(sr, 'bp', lo, q), bp2 = new Biquad(sr, 'bp', lo * 1.5, q);
    return voice(sr, sec, (t, i) => {
      const u = t / sec, c = lo + (hi - lo) * Math.sin(Math.PI * Math.min(1, u * 1.15));
      if (i % 32 === 0) { bp.set('bp', c, q); bp2.set('bp', c * 1.6, q); }
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u)), 1.6);
      return (bp.run(noise()) + bp2.run(noise()) * 0.5) * env * gain;
    });
  };
  add('swing', (k) => whoosh(0.17 + k * 0.02, 700 + k * 150, 2800 + k * 300, 1.6, 2.6), 3);
  add('swingHeavy', (k) => pad(whoosh(0.3 + k * 0.04, 300 + k * 60, 1500 + k * 200, 1.2, 3.0), 0.05), 2);
  add('jump', () => { const w = whoosh(0.16, 500, 1800, 1.4, 1.5); const lp = new Biquad(sr, 'lp', 900); return voice(sr, 0.18, (t, i) => (w[i] ?? 0) + lp.run(noise()) * Math.exp(-t * 60) * 0.5); });
  add('land', () => { const lp = new Biquad(sr, 'lp', 600), gr = new Biquad(sr, 'bp', 2400, 1); return voice(sr, 0.2, (t) => sat(Math.sin(TAU * 70 * t) * Math.exp(-t * 30) + lp.run(noise()) * Math.exp(-t * 25) * 1.2 + gr.run(noise()) * Math.exp(-t * 40) * 0.4, 1.5) * 0.8); });
  add('dash', () => { const w = whoosh(0.22, 400, 1600, 1.2, 2.0); const sc = new Biquad(sr, 'bp', 3000, 0.8); return voice(sr, 0.24, (t, i) => (w[i] ?? 0) + sc.run(noise()) * Math.exp(-t * 35) * 0.5); });
  /* a body hitting the floor: deep thud, grit, a rattle of armour */
  add('bodyfall', (k) => {
    const lp = new Biquad(sr, 'lp', 400), grit = new Biquad(sr, 'bp', 1800, 0.7);
    return withRoom(pad(voice(sr, 0.6, (t) => {
      let rattle = 0; for (let j = 0; j < 5; j++) { const tj = 0.03 + j * 0.045 + k * 0.01; if (t > tj) rattle += Math.sin(TAU * (2300 + j * 410) * (t - tj)) * Math.exp(-(t - tj) * 60) * 0.25; }
      return sat(Math.sin(TAU * (55 * t + 2.5 * (1 - Math.exp(-t * 15)))) * Math.exp(-t * 9) * 1.2 + lp.run(noise()) * Math.exp(-t * 14) * 1.4 + grit.run(noise()) * Math.exp(-t * 20) * 0.5 + rattle, 2.2) * 0.9;
    }), 0.3), 0.7, 0.18);
  }, 2);
  /* K.O.: sub boom, crack, metal ring, long hall */
  add('ko', () => {
    const crack = new Biquad(sr, 'hp', 2200), lp = new Biquad(sr, 'lp', 300);
    return withRoom(pad(voice(sr, 1.6, (t) => sat(
      Math.sin(TAU * (38 * t + (60 / 6) * (1 - Math.exp(-t * 6)))) * Math.exp(-t * 2.4) * 1.3 +
      crack.run(noise()) * Math.exp(-t * 110) * 2 + lp.run(noise()) * Math.exp(-t * 4) * 1.2 +
      Math.sin(TAU * 820 * t) * Math.exp(-t * 3) * 0.12, 2.5) * 0.95), 1.0), 2.4, 0.3);
  });
  /* super: an energy charge that rises, glitters and snaps */
  add('super', () => {
    const bp = new Biquad(sr, 'bp', 400, 3);
    return withRoom(voice(sr, 0.9, (t, i) => {
      const u = t / 0.9; if (i % 32 === 0) bp.set('bp', 300 + 5000 * u * u, 3);
      const tone = Math.sin(TAU * (120 * t + 500 * t * u)) * 0.35 + Math.sin(TAU * (240 * t + 1000 * t * u)) * 0.15;
      const glitter = Math.sin(TAU * 3100 * t) * Math.sin(TAU * 7 * t) * 0.12 * u;
      return (tone + bp.run(noise()) * 1.5 + glitter) * Math.min(1, u * 3) * (u > 0.92 ? (1 - u) / 0.08 : 1) * 0.8;
    }), 1.4, 0.25);
  });
  /* the cinematic blow: everything at once, then a long stone-hall tail */
  add('cine', (k) => {
    const crack = new Biquad(sr, 'hp', 3000), crunch = new Biquad(sr, 'bp', 600, 0.8);
    return withRoom(pad(voice(sr, 1.0, (t) => {
      let bones = 0; for (let j = 0; j < 4; j++) { const tj = 0.004 + j * 0.011 + k * 0.003; if (t > tj && t < tj + 0.004) bones += noise() * 1.2; }
      return sat(Math.sin(TAU * (34 * t + (90 / 9) * (1 - Math.exp(-t * 9)))) * Math.exp(-t * 3) * 1.4 +
        crack.run(noise()) * Math.exp(-t * 70) * 2.5 + crunch.run(noise()) * Math.exp(-t * 9) * 1.6 + bones, 3.2) * 0.95;
    }), 1.2), 2.8, 0.32);
  }, 2);
  /* special: a charged whoosh with a zap */
  add('special', () => { const w = whoosh(0.35, 500, 3200, 2, 2.4); return withRoom(voice(sr, 0.4, (t, i) => (w[i] ?? 0) + Math.sin(TAU * (900 + 2400 * t) * t) * Math.exp(-t * 9) * 0.25), 0.8, 0.2); });
  add('combo', (k) => voice(sr, 0.12, (t) => (Math.sin(TAU * (1500 + k * 200) * t) + Math.sin(TAU * (3000 + k * 400) * t) * 0.4) * Math.exp(-t * 40) * 0.5));
  /* round / fight: a struck gong and a taiko */
  add('round', () => withRoom(voice(sr, 2.5, (t) => {
    const parts = [[146, 1], [219, 0.6], [301, 0.5], [397, 0.35], [520, 0.25], [688, 0.18]];
    let s = 0; parts.forEach(([f, a], j) => { s += Math.sin(TAU * f * t * (1 + 0.003 * Math.sin(t * (3 + j)))) * a * Math.exp(-t * (1.2 + j * 0.4)); });
    return s * 0.35 * Math.min(1, t * 80) + (t < 0.01 ? noise() * 0.3 : 0);
  }), 1.6, 0.2));
  add('fight', () => {
    const lp = new Biquad(sr, 'lp', 2400);
    return withRoom(pad(voice(sr, 0.9, (t) => sat(
      Math.sin(TAU * (60 * t + 2.8 * (1 - Math.exp(-t * 18)))) * Math.exp(-t * 4.5) * 1.2 +
      lp.run([1, 1.5, 2, 3].reduce((s, r) => s + ((t * 147 * r) % 1 < 0.5 ? 1 : -1), 0) / 4) * Math.exp(-t * 3) * 0.35 * Math.min(1, t * 40), 2) * 0.9), 0.6), 1.6, 0.22);
  });
  add('win', () => withRoom(voice(sr, 2.2, (t) => {
    const notes = [[0, 293.7], [0.12, 440], [0.24, 587.3], [0.36, 880]];
    let s = 0; notes.forEach(([at, f]) => { if (t > at) { const u = t - at; s += (Math.sin(TAU * f * u) + Math.sin(TAU * f * 2.01 * u) * 0.3) * Math.exp(-u * 2.5) * 0.25; } });
    return s;
  }), 1.4, 0.25));
  add('click', () => { const bp = new Biquad(sr, 'bp', 2200, 2); return voice(sr, 0.05, (t) => (bp.run(noise()) * 0.8 + Math.sin(TAU * 900 * t) * 0.4) * Math.exp(-t * 120)); });
  /* a crowd roar: dozens of band-limited "voices" with vowel formants, swelling and falling */
  add('crowd', (k) => {
    const voices = Array.from({ length: 28 }, () => {
      const f1 = 450 + rnd() * 400, f2 = 1050 + rnd() * 900;
      return { a: new Biquad(sr, 'bp', f1, 4), b: new Biquad(sr, 'bp', f2, 5), ph: rnd() * 6, rate: 3 + rnd() * 5, on: rnd() * 0.25 };
    });
    const len = 2.4 + k * 0.4;
    const L = voice(sr, len, (t) => {
      let s = 0;
      for (const v of voices) { if (t < v.on) continue; const n0 = noise(); s += (v.a.run(n0) + v.b.run(n0) * 0.6) * (0.7 + 0.3 * Math.sin(TAU * v.rate * t + v.ph)); }
      const env = Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 0.5) * 1.4);
      return s / 6 * env;
    });
    return withRoom(L, 1.8, 0.35);
  }, 2);

  /* relic: a shimmering chime falling from the sky, bright partials with a slow glitter and air */
  add('relic', () => {
    const air = new Biquad(sr, 'hp', 6000);
    const notes = [[0, 1318.5], [0.07, 1975.5], [0.14, 2637], [0.21, 3951]];
    return withRoom(voice(sr, 0.8, (t) => {
      let s = 0;
      notes.forEach(([at, f]) => { if (t > at) { const u = t - at; s += (Math.sin(TAU * f * u) + Math.sin(TAU * f * 2.76 * u) * 0.25) * Math.exp(-u * 5.5) * 0.22; } });
      const glitter = Math.sin(TAU * 5200 * t + Math.sin(TAU * 9 * t) * 2) * 0.06 * Math.exp(-t * 3);
      return s + glitter + air.run(noise()) * 0.05 * Math.exp(-t * 4) * Math.min(1, t * 40);
    }), 1.2, 0.3);
  });
  /* powerup: a rising whoosh into a glassy, brassy hit */
  add('powerup', () => {
    const bp = new Biquad(sr, 'bp', 400, 2.2), lp = new Biquad(sr, 'lp', 3200);
    return withRoom(voice(sr, 0.7, (t, i) => {
      const rise = Math.min(1, t / 0.35);
      if (i % 32 === 0) bp.set('bp', 300 + 4500 * rise * rise, 2.2);
      const whoosh = t < 0.38 ? bp.run(noise()) * rise * rise * 1.6 : 0;
      const u = t - 0.35;
      let hit = 0;
      if (u > 0) {
        const brass = [1, 2, 3, 4, 5].reduce((a, k) => a + Math.sin(TAU * 349.2 * k * u) / k, 0);
        hit = lp.run(brass) * 0.35 * Math.exp(-u * 6) + (Math.sin(TAU * 1396.9 * u) + Math.sin(TAU * 2093 * u) * 0.6) * 0.18 * Math.exp(-u * 7);
      }
      return whoosh + hit;
    }), 1.0, 0.22);
  });
  /* thunder: a close crack, then a long low rumble that rolls and flickers */
  add('thunder', () => {
    const crack = new Biquad(sr, 'hp', 1800), rum = new Biquad(sr, 'lp', 160), rum2 = new Biquad(sr, 'lp', 90), mid = new Biquad(sr, 'bp', 500, 0.7);
    return withRoom(voice(sr, 1.6, (t) => {
      const cr = t < 0.12 ? crack.run(noise()) * Math.exp(-t * 40) * 2.2 : 0;
      const roll = 0.6 + 0.4 * Math.sin(TAU * 3.1 * t + Math.sin(TAU * 1.3 * t) * 2);
      const r = (rum.run(noise()) * 2.6 + rum2.run(noise()) * 2.4) * Math.min(1, t * 20) * Math.exp(-t * 1.9) * roll;
      return sat(cr + r + mid.run(noise()) * 0.35 * Math.exp(-t * 6), 1.8) * 0.9;
    }), 2.2, 0.28);
  });
  /* parry: blade on blade, a sharp tick and a clean inharmonic ring */
  add('parry', (k) => {
    const tick = new Biquad(sr, 'hp', 4000);
    const parts = [[2380 + k * 160, 1], [3910 + k * 210, 0.7], [5620 + k * 140, 0.5], [7340, 0.3]];
    return withRoom(voice(sr, 0.4, (t) => {
      let ring = 0; parts.forEach(([f, a], j) => { ring += Math.sin(TAU * f * t * (1 + 0.002 * Math.sin(TAU * 7 * t))) * a * Math.exp(-t * (9 + j * 5)); });
      return (tick.run(noise()) * Math.exp(-t * 300) * 1.6 + ring * 0.32) * Math.min(1, t * 4000);
    }), 0.6, 0.15);
  }, 3);
  /* brutal: a dry bone crunch on top of a heavy body thud (weight, not wetness) */
  add('brutal', (k) => {
    const crunch = new Biquad(sr, 'bp', 2400 + k * 300, 1.1), low = new Biquad(sr, 'lp', 260);
    return withRoom(pad(voice(sr, 0.5, (t) => {
      let cracks = 0; for (let j = 0; j < 5; j++) { const tj = 0.002 + j * 0.009 + k * 0.002; if (t > tj && t < tj + 0.005) cracks += noise() * (1 - j * 0.12); }
      return sat(
        Math.sin(TAU * (52 * t + (60 / 14) * (1 - Math.exp(-t * 14)))) * Math.exp(-t * 7) * 1.3 +
        crunch.run(cracks) * 3.2 + low.run(noise()) * Math.exp(-t * 12) * 1.2, 2.6) * 0.95;
    }), 0.2), 0.55, 0.14);
  }, 3);
  /* crash: a wooden barrier smashing apart, a heavy split, then splinters and debris bouncing */
  add('crash', () => {
    const wood = new Biquad(sr, 'bp', 650, 1.4), split = new Biquad(sr, 'hp', 1500), deb = new Biquad(sr, 'bp', 1800, 2);
    const bits = Array.from({ length: 22 }, () => ({ at: 0.06 + rnd() * 0.9, f: 900 + rnd() * 2600, a: 0.15 + rnd() * 0.3 }));
    return withRoom(voice(sr, 1.2, (t) => {
      const body = wood.run(noise()) * Math.exp(-t * 14) * 2.4 + Math.sin(TAU * 120 * t) * Math.exp(-t * 18) * 0.8;
      const crackle = split.run(noise()) * Math.exp(-t * 8) * (0.5 + 0.5 * Math.sin(TAU * 31 * t)) * 0.9;
      let pieces = 0; for (const b of bits) if (t > b.at && t < b.at + 0.05) { const u = t - b.at; pieces += Math.sin(TAU * b.f * u) * b.a * Math.exp(-u * 90); }
      return sat(body + crackle + pieces + deb.run(noise()) * 0.25 * Math.exp(-Math.max(0, t - 0.1) * 3) * Math.min(1, t * 10), 1.7) * 0.9;
    }), 1.0, 0.2);
  });
  /* gust: a soft swell of filtered wind */
  add('gust', () => {
    const bp = new Biquad(sr, 'bp', 500, 0.9), bp2 = new Biquad(sr, 'bp', 900, 1.6);
    return voice(sr, 1.5, (t, i) => {
      const u = t / 1.5, env = Math.pow(Math.sin(Math.PI * u), 1.8);
      if (i % 64 === 0) { const c = 350 + 700 * env + 120 * Math.sin(TAU * 1.7 * t); bp.set('bp', c, 0.9); bp2.set('bp', c * 1.9, 1.6); }
      return (bp.run(noise()) * 1.4 + bp2.run(noise()) * 0.6) * env;
    });
  });

  const manifest: Record<string, string[]> = {};
  for (const [name, list] of Object.entries(fx)) {
    manifest[name] = list.map((buf, i) => {
      let pk = 0; for (const s of buf) pk = Math.max(pk, Math.abs(s));
      const g = pk > 0 ? 0.89 / pk : 1; const o = buf.map((s) => s * g);
      const file = `sfx-${name}${list.length > 1 ? '-' + (i + 1) : ''}.mp3`;
      encode(o, null, sr, file, 0.5);
      return file;
    });
  }
  return manifest;
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  const mode = process.argv[2] ?? 'music';
  const manPath = path.join(OUT, 'manifest.json');
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { music: {}, sfx: {} };
  if (mode === 'music') {
    const only = process.argv.slice(3);
    for (const c of CUES.filter((x) => !only.length || only.includes(x.id))) {
      console.log(`${c.id}: ${c.title} (${c.bpm} bpm)`);
      const r = await renderCue(c);
      flushEncodes();
      man.music[c.id] = { file: r.file, title: r.title, bpm: r.bpm, loopStart: +r.loopStart.toFixed(4), loopEnd: +r.loopEnd.toFixed(4) };
      console.log(`  ${r.file}: ${r.duration.toFixed(1)}s, loop ${r.loopStart.toFixed(2)}–${r.loopEnd.toFixed(2)}s, ${(fs.statSync(path.join(OUT, r.file)).size / 1024).toFixed(0)} KB`);
      fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
    }
  } else if (mode === 'sfx') {
    man.sfx = sfxBank();
    flushEncodes();
    let total = 0; for (const list of Object.values(man.sfx) as string[][]) for (const f of list) total += fs.statSync(path.join(OUT, f)).size;
    console.log(`sfx: ${Object.keys(man.sfx).length} effects, ${(total / 1024).toFixed(0)} KB`);
  }
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
