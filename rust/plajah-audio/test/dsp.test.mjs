// Headless DSP verification for plajah-audio.
//
// These are the sound-quality gates from the plan, run against the real compiled wasm with no
// browser involved. Aliasing and filter stability are the two things that separate a
// professional synth from a toy, and both are measurable — so they are measured, not eyeballed.
//
//   node --test rust/plajah-audio/test/dsp.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, '..', 'target', 'wasm32-unknown-unknown', 'release', 'plajah_audio.wasm');
const SR = 48000;
const BLOCK = 128;

// Param ids — must mirror src/params.rs.
const P = {
  MASTER_GAIN: 0, UNISON_COUNT: 5, UNISON_DETUNE: 6,
  oscEnable: (o) => 100 + o * 100 + 0,
  oscLevel: (o) => 100 + o * 100 + 1,
  oscCoarse: (o) => 100 + o * 100 + 3,
  oscFine: (o) => 100 + o * 100 + 4,
  oscMode: (o) => 100 + o * 100 + 8,
  oscShape: (o) => 100 + o * 100 + 9,
  fltEnable: (f) => 500 + f * 100 + 0,
  fltType: (f) => 500 + f * 100 + 1,
  fltCutoff: (f) => 500 + f * 100 + 3,
  fltRes: (f) => 500 + f * 100 + 4,
  envAttack: (e) => 700 + e * 10 + 0,
  envDecay: (e) => 700 + e * 10 + 1,
  envSustain: (e) => 700 + e * 10 + 2,
  envRelease: (e) => 700 + e * 10 + 3,

  // VELA — must mirror the block-1000 constants in src/params.rs.
  M_ENABLE: 1000, M_PARTIALS: 1001, M_INHARM: 1002, M_SPREAD: 1003,
  M_DECAY: 1004, M_DECAY_TILT: 1005, M_MATERIAL: 1006, M_POSITION: 1007, M_KEYTRACK: 1008,
  X_TYPE: 1100, X_PRESSURE: 1101, X_GRAIN: 1102, X_TONE: 1103, X_VEL_TILT: 1104,
  V_SIZE: 1200, V_DECAY: 1201, V_DIFFUSION: 1202, V_SHIMMER: 1203,
  V_SHIMMER_IVL: 1204, V_BLUR: 1205, V_FREEZE: 1206, V_MIX: 1207,

  // BAJO — must mirror the block-1400 constants in src/params.rs.
  SUB_LEVEL: 400,
  S_LEVEL: 1400, S_DAMP: 1401, S_TONE: 1402, S_PICK: 1403, S_BOW: 1404, S_BODY: 1405,
  T_AMOUNT: 1420, T_VOWEL: 1421, T_Q: 1422,
  W_ENABLE: 1440, W_SHAPE: 1441, W_SKEW: 1442, W_SMOOTH: 1443, W_PHASE: 1444,
  W_FREE: 1445, W_RATE: 1446, W_LANE: 1448, W_DEST1: 1464, W_DEPTH1: 1465,
  W_DEST2: 1466, W_DEPTH2: 1467,
  G_ENABLE: 1480, G_DEPTH: 1481, G_SLEW: 1482, G_SPILL: 1483, G_SWING: 1484,
  G_RATE: 1485, G_SPLIT: 1486, gGrid: (band, step) => 1488 + band * 16 + step,
  scAlg: (st) => 1560 + st * 8, scDrive: (st) => 1560 + st * 8 + 1,
  scMix: (st) => 1560 + st * 8 + 4,
  SC_INPUT: 1590, SC_FOCUS: 1591, SC_SAFE: 1592, SC_SUB: 1593, SC_OUTPUT: 1594,
  MONO_BELOW: 1650,
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rmsOf = (s) => Math.sqrt(s.reduce((a, v) => a + v * v, 0) / s.length);

async function boot() {
  const mod = await WebAssembly.compile(readFileSync(WASM));
  const inst = new WebAssembly.Instance(mod, {});
  const x = inst.exports;
  const eng = x.pa_create(SR);
  const view = (ptr, len) => new Float32Array(x.memory.buffer, ptr, len);
  return { x, eng, view };
}

/** Render `frames` total, returning channel 0. */
function renderMono({ x, eng, view }, frames) {
  const out = new Float32Array(frames);
  const ptr = x.pa_out_ptr(eng, 0);
  let done = 0;
  while (done < frames) {
    const n = Math.min(BLOCK, frames - done);
    x.pa_render(eng, n);
    out.set(view(ptr, n).subarray(0, n), done);
    done += n;
  }
  return out;
}

/** Naive DFT magnitude at a given frequency — enough to detect a partial. */
function magAt(sig, freq, sr) {
  let re = 0, im = 0;
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < sig.length; i++) {
    re += sig[i] * Math.cos(w * i);
    im -= sig[i] * Math.sin(w * i);
  }
  return (2 * Math.hypot(re, im)) / sig.length;
}

test('ABI version matches the host contract', async () => {
  const { x } = await boot();
  assert.equal(x.pa_abi_version(), 8);
});

/** Stage a mono sample into the upload buffer and load it into a slot. Returns the frame count. */
function loadSample({ x, eng }, slot, fn, frames, sr = SR, root = 60, loopStart = 0, loopEnd = 0, loopMode = 0) {
  const ptr = x.pa_upload_ptr(eng);
  const view = new Float32Array(x.memory.buffer, ptr, frames);
  for (let i = 0; i < frames; i++) view[i] = fn(i);
  x.pa_load_sample(eng, slot, frames, 1, sr, root, loopStart, loopEnd, loopMode);
  return frames;
}

test('KERA: a loaded sample plays back, and pitch resamples correctly', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envAttack(0), 0.0);
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_set_param(eng, P.fltEnable(0), 0.0);

  // A 480 Hz sine at 48k, one full second, root note 60.
  const freq = 480;
  loadSample(ctx, 0, (i) => Math.sin((2 * Math.PI * freq * i) / SR) * 0.8, SR, SR, 60, 0, 0, 0);

  // Play at the root: the sample should come out at its native 480 Hz.
  x.pa_note_on_sampled(eng, 60, 1.0, 1, 0, 0, 0, 0);
  renderMono(ctx, 2048);
  const atRoot = renderMono(ctx, 16384);
  assert.ok(magAt(atRoot, 480, SR) > 0.1, 'the sample sounds at its native pitch at the root note');
  assert.ok(magAt(atRoot, 960, SR) < magAt(atRoot, 480, SR) * 0.25, 'and not an octave up');

  // Play an octave up: 480 → 960 Hz.
  const c2 = await boot();
  loadSample(c2, 0, (i) => Math.sin((2 * Math.PI * freq * i) / SR) * 0.8, SR, SR, 60, 0, 0, 0);
  c2.x.pa_set_param(c2.eng, P.envSustain(0), 1.0);
  c2.x.pa_set_param(c2.eng, P.fltEnable(0), 0.0);
  c2.x.pa_note_on_sampled(c2.eng, 72, 1.0, 1, 0, 0, 0, 0);
  renderMono(c2, 2048);
  const octaveUp = renderMono(c2, 16384);
  assert.ok(magAt(octaveUp, 960, SR) > magAt(octaveUp, 480, SR), 'an octave up shifts the sample to 960 Hz');
});

test('KERA: a one-shot sample frees the voice when it ends', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_set_param(eng, P.fltEnable(0), 0.0);
  // A short 2000-frame click, no loop.
  loadSample(ctx, 0, (i) => (i < 1900 ? 0.5 : 0.0), 2000, SR, 60, 0, 0, 0);
  x.pa_note_on_sampled(eng, 60, 1.0, 1, 0, 0, 0, 0);
  renderMono(ctx, 512);
  assert.equal(x.pa_active_voices(eng), 1, 'sounding while the sample plays');
  renderMono(ctx, 8192); // well past the 2000-frame sample
  assert.equal(x.pa_active_voices(eng), 0, 'the voice frees when a one-shot ends');
});

test('KERA: a looping sample keeps sounding past its end', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_set_param(eng, P.fltEnable(0), 0.0);
  // Forward loop over the whole 1000-frame sine.
  loadSample(ctx, 0, (i) => Math.sin((2 * Math.PI * 5 * i) / 1000) * 0.6, 1000, SR, 60, 0, 999, 1);
  x.pa_note_on_sampled(eng, 60, 1.0, 1, 0, 0, 0, 0);
  const long = renderMono(ctx, 48000); // a full second, far past the 1000-frame sample
  const tailEnergy = long.slice(40000).reduce((a, v) => a + Math.abs(v), 0);
  assert.ok(tailEnergy > 10, 'a looping sample is still sounding a second later');
  assert.equal(x.pa_active_voices(eng), 1, 'and the voice is still held');
});

test('KERA: sample and synth voices coexist', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  loadSample(ctx, 0, (i) => Math.sin((2 * Math.PI * 300 * i) / SR) * 0.6, SR, SR, 60, 0, SR - 1, 1);
  x.pa_note_on_sampled(eng, 60, 1.0, 1, 0, 0, 0, 0); // KERA voice
  x.pa_note_on(eng, 67, 1.0, 2, 0);                   // synth voice
  const sig = renderMono(ctx, 8192);
  assert.equal(x.pa_active_voices(eng), 2, 'both a sample and a synth voice play at once');
  assert.ok(sig.every(Number.isFinite), 'no NaN mixing sample and synth');
});

/** Load a sample of ANY length via the chunked path — the way the worklet host does it, so a
 *  sample larger than the staging buffer streams in instead of being dropped. */
function loadSampleChunked({ x, eng }, slot, fn, frames, channels = 1, sr = SR, root = 60, loopStart = 0, loopEnd = 0, loopMode = 0) {
  const data = new Float32Array(frames * channels);
  for (let c = 0; c < channels; c++) for (let i = 0; i < frames; i++) data[c * frames + i] = fn(i, c);
  x.pa_sample_begin(eng, slot, frames, channels, sr, root, loopStart, loopEnd, loopMode);
  const ptr = x.pa_upload_ptr(eng);
  const cap = x.pa_upload_capacity(eng);
  for (let off = 0; off < data.length; off += cap) {
    const n = Math.min(cap, data.length - off);
    new Float32Array(x.memory.buffer, ptr, n).set(data.subarray(off, off + n));
    x.pa_sample_chunk(eng, slot, off, n);
  }
  x.pa_sample_end(eng, slot);
}

test('KERA: a LARGE sample (bigger than the staging buffer) plays back — the real-WAV bug', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envAttack(0), 0.0);
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_set_param(eng, P.fltEnable(0), 0.0);
  // 200,000 frames > the 131,072-float staging buffer — the exact size that used to be dropped.
  const frames = 200000;
  assert.ok(frames > x.pa_upload_capacity(eng), 'the sample is genuinely larger than the staging buffer');
  loadSampleChunked(ctx, 0, (i) => Math.sin((2 * Math.PI * 480 * i) / SR) * 0.8, frames, 1, SR, 60, 0, 0, 0);
  x.pa_note_on_sampled(eng, 60, 1.0, 1, 0, 0, 0, 0);
  renderMono(ctx, 2048);
  const sig = renderMono(ctx, 16384);
  assert.ok(magAt(sig, 480, SR) > 0.1, 'the large sample sounds at its native 480 Hz, not silence');
});

test('KERA: an EMPTY slot is SILENT, never a synth fallback', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  // note_on_sampled on slot 5 which was never loaded — the failed-load case. Must NOT run oscillators.
  x.pa_note_on_sampled(eng, 60, 1.0, 1, 0, 5, 0, 0);
  const sig = renderMono(ctx, 4096);
  const energy = sig.reduce((a, v) => a + Math.abs(v), 0);
  assert.ok(energy < 1, 'an unloaded sample slot produces silence, not a synth tone');
});

test('GATE: pre-scheduled notes fire at the exact absolute frame (offline render path)', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envAttack(0), 0.0);
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_reset_transport(eng, 0);

  // Post everything up front — exactly what an OfflineAudioContext requires, since rendering
  // outruns message delivery and a block-relative offset can't reach frame 20000.
  const targets = [1000, 5000, 12000];
  targets.forEach((f, i) => x.pa_schedule_note_on(eng, 60 + i * 4, 1.0, i + 1, f));
  targets.forEach((f, i) => x.pa_schedule_note_off(eng, i + 1, f + 400));

  const sig = renderMono(ctx, 16384);
  // Find each onset: silence before the first scheduled frame, sound at it.
  const energyAt = (from, len) => {
    let e = 0;
    for (let i = from; i < Math.min(from + len, sig.length); i++) e += Math.abs(sig[i]);
    return e;
  };
  assert.ok(energyAt(0, 900) < 1e-4, 'must be silent before the first scheduled note');
  for (const f of targets) {
    assert.ok(energyAt(f, 200) > 0.5, `note scheduled at frame ${f} did not sound there`);
    assert.ok(energyAt(f - 260, 200) < 0.05, `note scheduled at frame ${f} leaked before its time`);
  }
});

test('scheduled notes survive being posted out of order', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_reset_transport(eng, 0);
  // Deliberately reversed — the engine sorts, the caller shouldn't have to.
  x.pa_schedule_note_on(eng, 72, 1.0, 2, 8000);
  x.pa_schedule_note_on(eng, 60, 1.0, 1, 2000);
  const sig = renderMono(ctx, 12288);
  let firstOnset = -1;
  for (let i = 0; i < sig.length; i++) {
    if (Math.abs(sig[i]) > 1e-3) { firstOnset = i; break; }
  }
  assert.ok(firstOnset >= 1990 && firstOnset < 2400, `earliest note should sound near frame 2000, got ${firstOnset}`);
});

test('a note produces sound, and silence when idle', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  const silence = renderMono(ctx, 2048);
  const silentPeak = silence.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(silentPeak < 1e-6, `idle engine should be silent, got ${silentPeak}`);

  x.pa_note_on(eng, 60, 1.0, 1, 0);
  const sound = renderMono(ctx, 8192);
  const peak = sound.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak > 0.05, `note should be audible, peak was ${peak}`);
  assert.ok(sound.every(Number.isFinite), 'output must contain no NaN/Inf');
});

test('GATE: sawtooth is band-limited — no aliasing folded below the fundamental', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  // Analog saw, no filter, high note where naive synthesis aliases badly.
  x.pa_set_param(eng, P.oscMode(0), 1.0);   // analog
  x.pa_set_param(eng, P.oscShape(0), 0.0);  // saw
  x.pa_set_param(eng, P.fltEnable(0), 0.0);
  x.pa_set_param(eng, P.envAttack(0), 0.0);
  x.pa_set_param(eng, P.envSustain(0), 1.0);

  // MIDI 98 ≈ 2349 Hz: harmonics 9+ are already above Nyquist, so any folding is obvious.
  x.pa_note_on(eng, 98, 1.0, 1, 0);
  renderMono(ctx, 4096); // let the attack settle
  const sig = renderMono(ctx, 16384);

  const f0 = 440 * Math.pow(2, (98 - 69) / 12);
  const fundamental = magAt(sig, f0, SR);
  assert.ok(fundamental > 0.01, `fundamental should be present, got ${fundamental}`);

  // Aliased partials land at |k*f0 - n*SR| — inharmonic, and crucially BELOW f0.
  let worst = 0, worstFreq = 0;
  for (let k = 9; k < 40; k++) {
    const folded = Math.abs(((k * f0) % SR) - SR) < SR / 2 ? Math.abs(SR - ((k * f0) % SR)) : (k * f0) % SR;
    if (folded > 80 && folded < f0 * 0.9) {
      const m = magAt(sig, folded, SR);
      if (m > worst) { worst = m; worstFreq = folded; }
    }
  }
  const ratioDb = 20 * Math.log10((worst + 1e-12) / fundamental);
  assert.ok(ratioDb < -40, `aliasing at ${worstFreq.toFixed(0)}Hz was ${ratioDb.toFixed(1)}dB below the fundamental; need < -40dB`);
});

test('GATE: ladder filter stays stable under extreme resonance and fast modulation', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.oscMode(0), 1.0);
  x.pa_set_param(eng, P.fltEnable(0), 1.0);
  x.pa_set_param(eng, P.fltType(0), 0.0);  // ladder
  x.pa_set_param(eng, P.fltRes(0), 0.98);  // near self-oscillation
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_note_on(eng, 45, 1.0, 1, 0);

  // Sweep the cutoff violently while rendering — the case a Direct-Form biquad blows up on.
  const ptr = x.pa_out_ptr(eng, 0);
  let peak = 0, bad = 0;
  for (let b = 0; b < 400; b++) {
    const t = b / 400;
    x.pa_set_param(eng, P.fltCutoff(0), 0.15 + 0.8 * Math.abs(Math.sin(t * 60)));
    x.pa_render(eng, BLOCK);
    const v = new Float32Array(x.memory.buffer, ptr, BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      if (!Number.isFinite(v[i])) bad++;
      peak = Math.max(peak, Math.abs(v[i]));
    }
  }
  assert.equal(bad, 0, 'filter produced non-finite samples');
  assert.ok(peak < 1.5, `output should stay bounded by the soft clipper, peak was ${peak}`);
});

test('GATE: render is deterministic — the offline bounce must be reproducible', async () => {
  const run = async () => {
    const ctx = await boot();
    ctx.x.pa_set_param(ctx.eng, P.UNISON_COUNT, 0.5); // unison uses per-voice randomness
    ctx.x.pa_set_param(ctx.eng, P.envSustain(0), 1.0);
    ctx.x.pa_note_on(ctx.eng, 55, 0.9, 1, 0);
    return renderMono(ctx, 8192);
  };
  const a = await run();
  const b = await run();
  assert.deepEqual(Array.from(a), Array.from(b), 'two identical renders must be sample-identical');
});

test('sample-accurate note start: frame_offset delays onset exactly', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envAttack(0), 0.0);
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  const offset = 64;
  x.pa_note_on(eng, 69, 1.0, 1, offset);
  const sig = renderMono(ctx, BLOCK);
  let first = -1;
  for (let i = 0; i < BLOCK; i++) {
    if (Math.abs(sig[i]) > 1e-5) { first = i; break; }
  }
  assert.ok(first >= offset, `onset at ${first} must not precede the requested offset ${offset}`);
  assert.ok(first < offset + 24, `onset at ${first} should follow the offset promptly`);
});

test('voice lifecycle: note off releases and frees the voice', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envRelease(0), 0.05);
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_note_on(eng, 60, 1.0, 7, 0);
  renderMono(ctx, 1024);
  assert.equal(x.pa_active_voices(eng), 1);
  x.pa_note_off(eng, 7);
  renderMono(ctx, SR); // well past the release
  assert.equal(x.pa_active_voices(eng), 0, 'voice should free itself after release');
});

test('polyphony: 16 simultaneous voices stay clean', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  for (let i = 0; i < 16; i++) x.pa_note_on(eng, 48 + i * 2, 0.8, 100 + i, 0);
  const sig = renderMono(ctx, 8192);
  assert.equal(x.pa_active_voices(eng), 16);
  assert.ok(sig.every(Number.isFinite), 'no NaN with 16 voices');
  const peak = sig.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak <= 1.01, `soft clipper should bound the sum, peak ${peak}`);
});

test('spatial: layout drives channel count and position moves energy', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  assert.equal(x.pa_channels(eng), 2);
  x.pa_set_layout(eng, 3); // 7.1.4
  assert.equal(x.pa_channels(eng), 12);

  x.pa_set_layout(eng, 0); // back to stereo
  x.pa_set_param(eng, P.envSustain(0), 1.0);
  x.pa_set_position(eng, 1.0, 0.0, 0.0); // hard right
  x.pa_note_on(eng, 60, 1.0, 1, 0);
  const lPtr = x.pa_out_ptr(eng, 0);
  const rPtr = x.pa_out_ptr(eng, 1);
  let lSum = 0, rSum = 0;
  for (let b = 0; b < 32; b++) {
    x.pa_render(eng, BLOCK);
    const l = new Float32Array(x.memory.buffer, lPtr, BLOCK);
    const r = new Float32Array(x.memory.buffer, rPtr, BLOCK);
    for (let i = 0; i < BLOCK; i++) { lSum += Math.abs(l[i]); rSum += Math.abs(r[i]); }
  }
  assert.ok(rSum > lSum * 1.5, `a hard-right source should favour the right channel (L=${lSum.toFixed(1)} R=${rSum.toFixed(1)})`);
});

// ─────────────────────────────────────────────────────────────────────────────
// VELA — the modal body, the exciter and the Veil.
//
// The gates that matter for this instrument are different from ONDA's. Aliasing and filter
// stability are what separate a good subtractive synth from a toy; for a modal resonator it is
// whether the bank stays bounded across a forty-second tail, whether inharmonicity actually
// moves the partials, and whether a re-render is bit-identical — because the meditation host
// and the generative channel both depend on that last property being true.
// ─────────────────────────────────────────────────────────────────────────────

/** Put the engine into VELA mode with a usable bowl patch. */
function velaPatch({ x, eng }, over = {}) {
  const set = (id, v) => x.pa_set_param(eng, id, v);
  set(P.M_ENABLE, 1);
  set(P.M_PARTIALS, 0.5);   // 32 partials
  set(P.M_INHARM, 0.04);
  set(P.M_SPREAD, 0.0);     // off by default so partial positions stay predictable
  set(P.M_DECAY, 0.45);
  set(P.M_DECAY_TILT, 0.5);
  set(P.M_MATERIAL, 0);
  set(P.M_POSITION, 0.28);
  set(P.M_KEYTRACK, 0.0);
  set(P.X_TYPE, 2);         // strike — a bounded excitation, so tails are measurable
  set(P.X_PRESSURE, 0.7);
  set(P.X_GRAIN, 0.5);
  set(P.X_TONE, 0.5);
  set(P.X_VEL_TILT, 0.0);
  set(P.V_MIX, 0.0);
  for (const [k, v] of Object.entries(over)) set(P[k], v);
}

function rms(sig, from = 0, to = sig.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += sig[i] * sig[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

test('VELA: a struck body sounds, and keeps ringing after note-off', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  velaPatch(ctx, { M_DECAY: 0.6 });

  x.pa_note_on(eng, 60, 1.0, 1, 0);
  const attack = renderMono(ctx, SR * 0.25);
  assert.ok(rms(attack) > 1e-3, `the bank should sound when struck (rms=${rms(attack).toExponential(2)})`);

  // Note-off must NOT silence a modal voice — energy is still leaving the bank. This is the
  // single most important behavioural difference from the subtractive path.
  x.pa_note_off(eng, 1);
  const tail = renderMono(ctx, SR * 1.0);
  assert.ok(rms(tail) > 1e-4, `the body must ring on after note-off (rms=${rms(tail).toExponential(2)})`);
  assert.equal(x.pa_active_voices(eng), 1, 'the voice must stay allocated while it still rings');
});

test('VELA: inharmonicity moves the partials off the harmonic series', async () => {
  const f0 = 220;
  const note = 57; // A3 = 220 Hz

  const a = await boot();
  velaPatch(a, { M_INHARM: 0.0, M_PARTIALS: 0.0, M_DECAY: 0.5 });
  a.x.pa_note_on(a.eng, note, 1.0, 1, 0);
  const harmonic = renderMono(a, SR * 0.5);

  const b = await boot();
  velaPatch(b, { M_INHARM: 0.85, M_PARTIALS: 0.0, M_DECAY: 0.5 });
  b.x.pa_note_on(b.eng, note, 1.0, 1, 0);
  const stretched = renderMono(b, SR * 0.5);

  // Energy exactly at 2·f0 relative to energy just sharp of it. A harmonic bank concentrates
  // at the exact multiple; a stretched one does not.
  const ratio = (sig) => magAt(sig, 2 * f0, SR) / (magAt(sig, 2 * f0 * 1.06, SR) + 1e-12);
  const h = ratio(harmonic);
  const s = ratio(stretched);
  assert.ok(h > s, `stretching should move energy off 2·f0 (harmonic=${h.toFixed(2)}, stretched=${s.toFixed(2)})`);
});

test('VELA: the bank decays monotonically and never runs away', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  // Worst case for stability: most partials, heaviest stretch, longest decay.
  velaPatch(ctx, { M_PARTIALS: 1.0, M_INHARM: 1.0, M_DECAY: 1.0, M_DECAY_TILT: 0.0 });
  x.pa_note_on(eng, 48, 1.0, 1, 0);
  x.pa_note_off(eng, 1);

  const windows = [];
  for (let i = 0; i < 8; i++) windows.push(rms(renderMono(ctx, SR * 0.5)));
  for (const w of windows) assert.ok(Number.isFinite(w), 'the bank must never produce NaN or Inf');

  // A resonator with a pole radius at or above 1 would grow rather than decay.
  const early = (windows[1] + windows[2]) / 2;
  const late = (windows[6] + windows[7]) / 2;
  assert.ok(late < early, `energy must leave the bank (early=${early.toExponential(2)}, late=${late.toExponential(2)})`);
});

test('VELA: a bowed note sustains where a struck note decays', async () => {
  const bowed = await boot();
  velaPatch(bowed, { X_TYPE: 0, X_PRESSURE: 0.8, M_DECAY: 0.3 });
  bowed.x.pa_note_on(bowed.eng, 55, 0.9, 1, 0);
  renderMono(bowed, SR * 1.0);
  const bowedLate = rms(renderMono(bowed, SR * 1.0));

  const struck = await boot();
  velaPatch(struck, { X_TYPE: 2, X_PRESSURE: 0.8, M_DECAY: 0.3 });
  struck.x.pa_note_on(struck.eng, 55, 0.9, 1, 0);
  renderMono(struck, SR * 1.0);
  const struckLate = rms(renderMono(struck, SR * 1.0));

  assert.ok(
    bowedLate > struckLate * 2,
    `a held bow must still be feeding the bank after two seconds (bowed=${bowedLate.toExponential(2)}, struck=${struckLate.toExponential(2)})`,
  );
});

test('VELA: Veil shimmer stays bounded under feedback', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  // Everything that could make an octave-up feedback path climb, all at once.
  velaPatch(ctx, {
    V_MIX: 1.0, V_SIZE: 0.9, V_DECAY: 1.0, V_DIFFUSION: 1.0,
    V_SHIMMER: 1.0, V_SHIMMER_IVL: 0, M_DECAY: 0.5,
  });
  x.pa_note_on(eng, 60, 1.0, 1, 0);
  renderMono(ctx, SR * 0.5);
  x.pa_note_off(eng, 1);

  let peak = 0;
  for (let i = 0; i < 10; i++) {
    const w = renderMono(ctx, SR * 0.5);
    for (let j = 0; j < w.length; j++) {
      const v = Math.abs(w[j]);
      assert.ok(Number.isFinite(v), 'shimmer feedback must never produce NaN');
      if (v > peak) peak = v;
    }
  }
  assert.ok(peak < 4.0, `shimmer must not climb without bound (peak=${peak.toFixed(2)})`);
});

test('VELA: Veil freeze holds a spectrum with no further input', async () => {
  const ctx = await boot();
  const { x, eng } = ctx;
  velaPatch(ctx, { V_MIX: 1.0, V_SIZE: 0.5, V_DECAY: 0.6, V_DIFFUSION: 0.7, M_DECAY: 0.3 });

  x.pa_note_on(eng, 60, 1.0, 1, 0);
  renderMono(ctx, SR * 0.6);
  x.pa_note_off(eng, 1);

  x.pa_set_param(eng, P.V_FREEZE, 1.0);
  const first = rms(renderMono(ctx, SR * 0.5));
  renderMono(ctx, SR * 2.0);
  const later = rms(renderMono(ctx, SR * 0.5));

  assert.ok(first > 1e-4, `freeze should have something to hold (rms=${first.toExponential(2)})`);
  assert.ok(later > first * 0.35, `a frozen spectrum must persist (first=${first.toExponential(2)}, later=${later.toExponential(2)})`);
  assert.ok(Number.isFinite(later), 'freeze must stay finite');
});

test('VELA: renders are deterministic — the meditation host and the channel depend on it', async () => {
  const run = async () => {
    const ctx = await boot();
    velaPatch(ctx, { M_SPREAD: 0.8, X_GRAIN: 0.9, V_MIX: 0.6, V_SHIMMER: 0.4 });
    ctx.x.pa_note_on(ctx.eng, 62, 0.85, 1, 0);
    const a = renderMono(ctx, SR * 0.5);
    ctx.x.pa_note_off(ctx.eng, 1);
    const b = renderMono(ctx, SR * 0.5);
    return [...a, ...b];
  };

  const first = await run();
  const second = await run();
  assert.equal(first.length, second.length);
  let maxDiff = 0;
  for (let i = 0; i < first.length; i++) {
    const d = Math.abs(first[i] - second[i]);
    if (d > maxDiff) maxDiff = d;
  }
  assert.equal(maxDiff, 0, `two renders of the same seed must be bit-identical (max diff=${maxDiff})`);
});

test('VELA: params above the old 1024 ceiling actually store', async () => {
  // Regression guard. MAX_PARAM_ID was 1024, so every id in the exciter and Veil blocks was
  // silently dropped by Params::set — an entire instrument failing with no error anywhere.
  // Measured in the TAIL, not across the attack. For the first few hundred milliseconds the
  // direct strike dominates both signals and a reverb is nearly invisible in the rms — the
  // difference only appears once the dry sound has decayed and the field has built.
  const ctx = await boot();
  const { x, eng } = ctx;
  velaPatch(ctx, { V_MIX: 0.0 });
  x.pa_note_on(eng, 60, 1.0, 1, 0);
  renderMono(ctx, SR * 0.4);
  const dry = rms(renderMono(ctx, SR * 1.0));

  const wet = await boot();
  velaPatch(wet, { V_MIX: 1.0, V_SIZE: 0.7, V_DECAY: 0.8 });
  wet.x.pa_note_on(wet.eng, 60, 1.0, 1, 0);
  renderMono(wet, SR * 0.4);
  const wetRms = rms(renderMono(wet, SR * 1.0));

  assert.ok(
    wetRms > dry * 1.5,
    `id 1207 must reach the engine — a fully wet tail cannot match a dry one (dry=${dry.toExponential(2)}, wet=${wetRms.toExponential(2)})`,
  );
});

test('VELA: every exciter reaches a usable level, not just a relative one', async () => {
  // The gap that let a real bug ship: the sustain test below compares bowed against struck and
  // passes on the RATIO, so an exciter that is 300x too quiet still satisfies it. Continuous
  // excitation was being scaled by (1-r) when broadband drive needs sqrt(1-r) — at a ten-second
  // decay that is 275x of over-attenuation, and the bow was inaudible while the identical body
  // struck was loud. Absolute level is the thing to assert.
  const LEVELS = [
    { name: 'bow', type: 0 },
    { name: 'blow', type: 1 },
    { name: 'strike', type: 2 },
    { name: 'rub', type: 3 },
  ];

  for (const { name, type } of LEVELS) {
    const ctx = await boot();
    velaPatch(ctx, { X_TYPE: type, X_PRESSURE: 0.8, M_DECAY: 0.62 });
    ctx.x.pa_note_on(ctx.eng, 60, 1.0, 1, 0);
    const held = rms(renderMono(ctx, SR * 2.0));
    assert.ok(
      held > 0.01,
      `${name} must be audible while held (rms=${held.toExponential(2)}, needs > 1e-2)`,
    );
    assert.ok(held < 1.0, `${name} must not be at the rails (rms=${held.toFixed(3)})`);
  }
});

test('VELA: a bowed level holds across the decay range', async () => {
  // Decay should change how long a body rings, not how loud it is. Some rise with decay is
  // correct — a resonant body really is louder under a sustained bow — but it has to stay
  // within a musical range rather than spanning a factor of hundreds.
  const levels = [];
  for (const decay of [0.2, 0.45, 0.7, 0.95]) {
    const ctx = await boot();
    velaPatch(ctx, { X_TYPE: 0, X_PRESSURE: 0.8, M_DECAY: decay });
    ctx.x.pa_note_on(ctx.eng, 60, 1.0, 1, 0);
    levels.push(rms(renderMono(ctx, SR * 2.0)));
  }
  for (const l of levels) assert.ok(l > 0.01, `every decay setting must be audible (got ${l.toExponential(2)})`);
  const spread = Math.max(...levels) / Math.min(...levels);
  assert.ok(spread < 12, `bowed level must not swing wildly with decay (spread ${spread.toFixed(1)}x)`);
});


// ── BAJO ─────────────────────────────────────────────────────────────────────

/** A plain sustaining analog-saw voice with the filter out of the way. */
function plainVoice({ x, eng }) {
  x.pa_set_param(eng, P.oscMode(0), 1);
  x.pa_set_param(eng, P.oscShape(0), 0);
  x.pa_set_param(eng, P.fltEnable(0), 0);
  x.pa_set_param(eng, P.envAttack(0), 0);
  x.pa_set_param(eng, P.envSustain(0), 1);
}

test('BAJO string: the Karplus-Strong loop plays in tune', async () => {
  // The whole acoustic half of the instrument rests on this. The loop delay has to account for
  // the damping filter's group delay AND the in-loop DC blocker's phase ADVANCE; without the
  // second term every note came out 13.8 cents sharp, which on a bass is fatal.
  for (const note of [33, 40, 45]) {
    const ctx = await boot();
    const { x, eng } = ctx;
    x.pa_set_param(eng, P.oscEnable(0), 0);
    x.pa_set_param(eng, P.SUB_LEVEL, 0);
    x.pa_set_param(eng, P.fltEnable(0), 0);
    x.pa_set_param(eng, P.envAttack(0), 0);
    x.pa_set_param(eng, P.envSustain(0), 1);
    x.pa_set_param(eng, P.S_LEVEL, 1);
    x.pa_set_param(eng, P.S_DAMP, 0.35);
    x.pa_set_param(eng, P.S_BODY, 0); // body resonances would bias the peak search
    x.pa_set_param(eng, P.S_TONE, 0.7);
    x.pa_note_on(eng, note, 1.0, 1, 0);
    renderMono(ctx, 4096);
    const sig = renderMono(ctx, 32768);

    const f0 = mtof(note);
    let best = 0;
    let peak = 0;
    for (let f = f0 * 0.9; f < f0 * 1.1; f += f0 * 0.0005) {
      const m = magAt(sig, f, SR);
      if (m > best) { best = m; peak = f; }
    }
    const cents = 1200 * Math.log2(peak / f0);
    assert.ok(Math.abs(cents) < 10, `note ${note} rings at ${peak.toFixed(2)} Hz, ${cents.toFixed(1)} cents off ${f0.toFixed(2)} Hz`);
    assert.ok(rmsOf(sig) > 0.001, `note ${note} actually sounds`);
  }
});

test('BAJO Ghost Gate: every band open is a true bypass', async () => {
  // A four-band split that does not reconstruct would re-voice the patch the moment the gate is
  // switched on. The subtractive crossover makes the sum exact; cascaded LP/HP pairs cost about
  // 5 dB at the fundamental, which is why they are not used here.
  const run = async (gate) => {
    const ctx = await boot();
    const { x, eng } = ctx;
    plainVoice(ctx);
    x.pa_set_param(eng, P.G_ENABLE, gate ? 1 : 0);
    for (let b = 0; b < 4; b++) for (let st = 0; st < 16; st++) x.pa_set_param(eng, P.gGrid(b, st), 1);
    x.pa_note_on(eng, 40, 1.0, 1, 0);
    renderMono(ctx, 8192);
    return renderMono(ctx, 16384);
  };
  const off = await run(false);
  const on = await run(true);
  let maxDiff = 0;
  for (let i = 0; i < off.length; i++) maxDiff = Math.max(maxDiff, Math.abs(off[i] - on[i]));
  assert.ok(maxDiff < 1e-5, `all bands open reconstructs the input (max diff ${maxDiff.toExponential(2)})`);
});

test('BAJO Ghost Gate: chopping the top leaves the sub standing', async () => {
  // This is the entire reason the gate is four-band. A normal trance gate takes the sub with it.
  const run = async (gate) => {
    const ctx = await boot();
    const { x, eng } = ctx;
    plainVoice(ctx);
    x.pa_set_param(eng, P.G_ENABLE, gate ? 1 : 0);
    x.pa_set_param(eng, P.G_DEPTH, 1);
    x.pa_set_param(eng, P.G_SLEW, 0.05);
    x.pa_set_param(eng, P.G_SPILL, 0);
    for (let st = 0; st < 16; st++) {
      x.pa_set_param(eng, P.gGrid(0, st), 1); // sub  — solid
      x.pa_set_param(eng, P.gGrid(1, st), 1); // low  — solid
      x.pa_set_param(eng, P.gGrid(2, st), 0); // mid  — shut
      x.pa_set_param(eng, P.gGrid(3, st), 0); // air  — shut
    }
    x.pa_note_on(eng, 40, 1.0, 1, 0);
    renderMono(ctx, 8192);
    return renderMono(ctx, 32768);
  };
  const off = await run(false);
  const on = await run(true);
  const f0 = mtof(40);
  const fund = magAt(on, f0, SR) / magAt(off, f0, SR);
  const air = magAt(on, f0 * 48, SR) / magAt(off, f0 * 48, SR);
  assert.ok(fund > 0.8, `the fundamental survives (${fund.toFixed(3)} of ungated)`);
  assert.ok(air < 0.2, `the air band is gated away (${air.toFixed(3)} of ungated)`);
});

test('BAJO Scorch: sub-safe keeps the fundamental clean under heavy drive', async () => {
  // Sub-safe splits the low band off BEFORE the stages and re-adds it clean, so the fundamental
  // stays the fundamental rather than becoming a distortion artifact.
  const run = async (safe, drive) => {
    const ctx = await boot();
    const { x, eng } = ctx;
    plainVoice(ctx);
    x.pa_set_param(eng, P.scAlg(0), 5); // Ruin
    x.pa_set_param(eng, P.scDrive(0), drive);
    x.pa_set_param(eng, P.scMix(0), 1);
    x.pa_set_param(eng, P.SC_SAFE, safe ? 1 : 0);
    x.pa_set_param(eng, P.SC_SUB, 0.3);
    x.pa_note_on(eng, 28, 1.0, 1, 0);
    renderMono(ctx, 8192);
    return renderMono(ctx, 32768);
  };
  const f0 = mtof(28);
  const clean = magAt(await run(false, 0), f0, SR);
  const safeOn = magAt(await run(true, 0.95), f0, SR) / clean;
  const safeOff = magAt(await run(false, 0.95), f0, SR) / clean;
  assert.ok(safeOn < 1.9, `sub-safe leaves the fundamental near its clean level (${safeOn.toFixed(2)}x)`);
  assert.ok(safeOff > safeOn * 1.4, `without it the folder rewrites the low end (${safeOff.toFixed(2)}x)`);
});

test('BAJO wobble: depth moves the filter, and zero depth does not', async () => {
  const run = async (depth) => {
    const ctx = await boot();
    const { x, eng } = ctx;
    x.pa_set_param(eng, P.oscMode(0), 1);
    x.pa_set_param(eng, P.oscShape(0), 0);
    x.pa_set_param(eng, P.fltEnable(0), 1);
    x.pa_set_param(eng, P.fltCutoff(0), 0.35);
    x.pa_set_param(eng, P.envAttack(0), 0);
    x.pa_set_param(eng, P.envSustain(0), 1);
    x.pa_set_param(eng, P.W_ENABLE, 1);
    x.pa_set_param(eng, P.W_FREE, 1);
    x.pa_set_param(eng, P.W_RATE, 0.45);
    x.pa_set_param(eng, P.W_SMOOTH, 0.05);
    x.pa_set_param(eng, P.W_DEST1, 0); // cutoff
    x.pa_set_param(eng, P.W_DEPTH1, depth);
    x.pa_note_on(eng, 40, 1.0, 1, 0);
    renderMono(ctx, 4096);
    return renderMono(ctx, 32768);
  };
  /** Windowed-RMS spread — a wobble is an amplitude envelope that moves. */
  const spread = (sig) => {
    const w = Math.floor(sig.length / 64);
    const v = [];
    for (let i = 0; i < 64; i++) v.push(rmsOf(sig.subarray(i * w, (i + 1) * w)));
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) / mean;
  };
  const flat = spread(await run(0));
  const moving = spread(await run(0.9));
  assert.ok(moving > flat * 5, `depth 0.9 modulates (${moving.toFixed(3)} vs ${flat.toFixed(3)} at depth 0)`);
});

test('BAJO defaults leave every other instrument bit-identical', async () => {
  // The whole 1400 block is additive. If a default ever stops being a bypass, this catches it
  // before an ONDA patch quietly changes voice.
  const run = async () => {
    const ctx = await boot();
    const { x, eng } = ctx;
    plainVoice(ctx);
    x.pa_note_on(eng, 45, 1.0, 1, 0);
    renderMono(ctx, 2048);
    return renderMono(ctx, 8192);
  };
  const a = await run();
  const b = await run();
  let maxDiff = 0;
  for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
  assert.equal(maxDiff, 0, 'renders are deterministic');
  assert.ok(rmsOf(a) > 0.05, 'and the plain ONDA voice still sounds');
});
