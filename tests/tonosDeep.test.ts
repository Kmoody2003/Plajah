// TONOS deep body: the body table mirrors tonos.rs; every plucked/struck instrument builds a sane
// mode set; and through the real wasm engine a deep note (its layer rendered here by a CPU copy of
// the GPU kernel) keeps the string's level and balance — the deep body carries the floors' energy
// per band, the low end is the same string, and nothing blows up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TONOS_BODIES } from '../services/melos/instruments/tonos/deep/bodies';
import { bandpassDrive, buildTonosDeepBody, floorsBelow, layerFrames, matchFloors, powerSpectrum, TONOS_DEEP_BUDGET } from '../services/melos/instruments/tonos/deep/deepBody';
import { tonosParamsKey, tonosVelBucket } from '../services/melos/instruments/tonos/deep/tonosDeep';

const rs = fs.readFileSync('rust/plajah-audio/src/tonos.rs', 'utf8');
const SR = 48000;

test('bodies.ts mirrors the body and excitation columns of INSTRUMENTS', () => {
  const table = rs.match(/static INSTRUMENTS[\s\S]*?\n\];/)![0];
  const rows = [...table.matchAll(/inst!\((EX_\w+),.*?(wood\([^)]*\)|skin\([^)]*\)|Body \{[^}]*\})/gm)];
  assert.equal(rows.length, TONOS_BODIES.length);
  rows.forEach((m, i) => {
    const b = TONOS_BODIES[i];
    assert.equal(b.sustained, m[1] === 'EX_BOW' || m[1] === 'EX_WHEEL', `${i} sustained`);
    const nums = (m[2].match(/[\d.]+e[+-]?\d+|[\d.]+/g) ?? []).map(Number);
    if (m[2].startsWith('wood')) assert.deepEqual([b.kind, b.plate, b.helm, b.y0], ['wood', ...nums], `${i}`);
    else if (m[2].startsWith('skin')) assert.deepEqual([b.kind, b.a, b.sigma, b.ts, b.helm, b.y0], ['skin', ...nums], `${i}`);
    else assert.equal(b.kind, m[2].includes('BODY_TUBE') ? 'tube' : 'gourd', `${i}`);
  });
});

test('every plucked/struck instrument builds a deep body; bowed ones do not', () => {
  TONOS_BODIES.forEach((b, i) => {
    const set = buildTonosDeepBody(i, () => NaN, SR);
    if (b.sustained) { assert.equal(set, null, `${i}`); return; }
    assert.ok(set, `${i} builds`);
    assert.ok(set!.modes >= 30 && set!.modes <= TONOS_DEEP_BUDGET, `${i}: ${set!.modes} modes`);
    for (let k = 0; k < set!.modes; k++) {
      assert.ok(set!.freq[k] >= 700 && set!.freq[k] < 16000, `${i} f=${set!.freq[k]}`);
      assert.ok(set!.decay[k] > 0.8 && set!.decay[k] < 1, `${i} r=${set!.decay[k]}`);
      if (k) assert.ok(set!.freq[k] >= set!.freq[k - 1]);
    }
    // Deterministic: the same instrument always gets the same body.
    assert.deepEqual(buildTonosDeepBody(i, () => NaN, SR)!.coef, set!.coef);
  });
  assert.notEqual(tonosParamsKey(new Map([[2001, 19]])), tonosParamsKey(new Map([[2001, 40]])));
  assert.equal(tonosVelBucket(0.74), 0.75);
});

/** CPU copy of modal.wgsl: z' = r·e^{iω}·z + g·x, out = Im(z), per bank. */
function modalCpu(coef: Float32Array, groups: number, excite: Float32Array, frames: number): Float32Array {
  const out = new Float32Array(2 * frames);
  const per = groups * 64;
  for (let bank = 0; bank < 2; bank++) {
    const acc = new Float64Array(frames);
    for (let m = 0; m < per; m++) {
      const o = (bank * per + m) * 4;
      const c = coef[o], s = coef[o + 1], g = coef[o + 2];
      if (g === 0) continue;
      let re = 0, im = 0;
      for (let n = 0; n < frames; n++) {
        const x = n < excite.length ? excite[n] : 0;
        const nre = c * re - s * im + g * x;
        im = s * re + c * im;
        re = nre;
        acc[n] += im;
      }
    }
    for (let n = 0; n < frames; n++) out[bank * frames + n] = acc[n];
  }
  return out;
}

test('through the wasm engine: a deep note keeps the string, carries the floors\' energy per band', async () => {
  const wasm = fs.readFileSync('services/melos/beats/engine/dsp/plajah_audio.wasm');
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const x = instance.exports as unknown as Record<string, (...a: number[]) => number> & { memory: WebAssembly.Memory };
  assert.ok(x.pa_abi_version() >= 18);
  for (const [inst, note] of [[19, 57], [40, 60], [16, 64], [11, 50], [2, 64]] as const) {
    const vel = 0.75;
    const setup = () => {
      const e = x.pa_create(SR);
      x.pa_set_param(e, 0, 0.8);
      x.pa_set_param(e, 2000, 1);
      x.pa_set_param(e, 2001, inst);
      return e;
    };
    // 1. Record the note's bridge force and floors (what the worker does).
    const rec = setup();
    const maxF = SR * 3;
    const ptr = x.pa_tonos_excitation(rec, note, vel, 0, maxF);
    const v = new Float32Array(x.memory.buffer, ptr, 3 * maxF);
    const floorsAll = v.slice(maxF, 2 * maxF);
    const len = layerFrames(floorsAll, SR, maxF);
    const drive = bandpassDrive(v.subarray(0, len)), floors = floorsAll.subarray(0, len), rest = v.slice(2 * maxF, 2 * maxF + len);
    x.pa_destroy(rec);
    const set = buildTonosDeepBody(inst, () => NaN, SR)!;
    const coef = matchFloors(set, drive, floors, SR, rest, floorsBelow(floors, SR));
    assert.ok(coef, `${inst}: floors to match`);
    const layer = modalCpu(coef!, set.groups, drive, len);
    { const bl = floorsBelow(floors, SR); for (let s2 = 0; s2 < len; s2++) { layer[s2] += bl[s2]; layer[len + s2] += bl[s2]; } }
    for (const s of layer) assert.ok(Number.isFinite(s));

    // 2. Play the deep note, and as the reference the same note (same seed) fed back its own
    // recorded floors — which is the plain note from that seed (tonos.rs replay test). A plain
    // note-on draws a random seed, and course beating alone moves a short window's bands by dB.
    const floorsStereo = new Float32Array(2 * len);
    floorsStereo.set(floors, 0); floorsStereo.set(floors, len);
    const play = (slot: Float32Array) => {
      const e = setup();
      x.pa_sample_begin(e, 0, len, 2, SR, 60, 0, 0, 0);
      const up = x.pa_upload_ptr(e), cap = x.pa_upload_capacity(e);
      for (let off = 0; off < slot.length; off += cap) {
        const n = Math.min(cap, slot.length - off);
        new Float32Array(x.memory.buffer, up, n).set(slot.subarray(off, off + n));
        x.pa_sample_chunk(e, 0, off, n);
      }
      x.pa_sample_end(e, 0);
      x.pa_note_on_deep(e, note, vel, 1, 0, 0, 1, 0);
      const frames = Math.round(SR * 1.5);
      const out = new Float32Array(frames);
      for (let f0 = 0; f0 < frames; f0 += 128) {
        x.pa_render(e, 128);
        const l = x.pa_out_ptr(e, 0) / 4, r = x.pa_out_ptr(e, 1) / 4;
        const m = new Float32Array(x.memory.buffer);
        for (let k = 0; k < 128 && f0 + k < frames; k++) out[f0 + k] = 0.5 * (m[l + k] + m[r + k]);
      }
      x.pa_destroy(e);
      return out;
    };
    const plain = play(floorsStereo), deep = play(layer);
    let peak = 0;
    for (const s of deep) { assert.ok(Number.isFinite(s)); peak = Math.max(peak, Math.abs(s)); }
    assert.ok(peak > 1e-3 && peak < 1, `${inst}: peak ${peak}`);
    const n = 1 << 16;
    const P = powerSpectrum(plain, n), D = powerSpectrum(deep, n);
    const bandDb = (lo: number, hi: number, S: Float64Array) => {
      let e = 0;
      for (let k = Math.ceil((lo * n) / SR); k < (hi * n) / SR; k++) e += S[k];
      return 10 * Math.log10(e + 1e-30);
    };
    // Below the deep body: the same string (the layer keeps the floors' own low part).
    const low = bandDb(60, 500, D) - bandDb(60, 500, P);
    assert.ok(Math.abs(low) < 1, `${inst}: low end moved ${low.toFixed(2)} dB`);
    // Where the deep body lives: what the floors added, per octave, within 3 dB.
    for (const [lo, hi] of [[500, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]]) {
      const d = bandDb(lo, hi, D) - bandDb(lo, hi, P);
      assert.ok(Math.abs(d) < 3, `${inst}: ${lo}-${hi} Hz moved ${d.toFixed(2)} dB`);
    }
  }
});
