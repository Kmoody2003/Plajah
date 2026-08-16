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
};

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
  assert.equal(x.pa_abi_version(), 3);
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
