// The SHIPPED wasm against the original C++ — the native Rust test (tests/reference.rs) proves
// the transliteration; this proves the wasm build (its own libm) and the worklet ABI.
//   node --test rust/plajah-airwindows/test/wasm.test.mjs
// Needs services/melos/beats/engine/dsp/plajah_airwindows.wasm (npm run airwindows:build) and,
// for the comparisons, ref/bin (ref/build.ps1); without ref/bin only the ABI checks run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const wasm = readFileSync(join(root, 'services', 'melos', 'beats', 'engine', 'dsp', 'plajah_airwindows.wasm'));
const module = new WebAssembly.Module(wasm);
const NAMES = readFileSync(join(here, '..', 'ref', 'plugins.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
const SEED_L = 2463534242, SEED_R = 88675123;

function run(kind, sr, params, inL, inR) {
  const x = new WebAssembly.Instance(module, {}).exports;
  const n = x.aw_init(kind, sr, SEED_L, SEED_R);
  params.forEach((v, i) => x.aw_set_param(i, v));
  const initBytes = x.memory.buffer.byteLength;
  const outL = new Float32Array(inL.length), outR = new Float32Array(inR.length);
  for (let off = 0; off < inL.length; off += 128) {
    const len = Math.min(128, inL.length - off);
    const l = new Float32Array(x.memory.buffer, x.aw_buf(0), 512);
    const r = new Float32Array(x.memory.buffer, x.aw_buf(1), 512);
    l.set(inL.subarray(off, off + len)); r.set(inR.subarray(off, off + len));
    x.aw_process(len);
    outL.set(l.subarray(0, len), off); outR.set(r.subarray(0, len), off);
  }
  return { n, outL, outR, initBytes, memBytes: x.memory.buffer.byteLength };
}

test('ABI: version, kind table, unknown kind', () => {
  const x = new WebAssembly.Instance(module, {}).exports;
  assert.equal(x.aw_abi_version(), 1);
  assert.equal(x.aw_kind_count(), NAMES.length);
  assert.equal(x.aw_init(9999, 48000, 1, 2), 0);
});

test('every effect is finite, bounded and never grows memory while processing', () => {
  const frames = 48000;
  const inL = new Float32Array(frames), inR = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { inL[i] = 1.5 * Math.sin(i * 0.05); inR[i] = 1.5 * Math.sin(i * 0.031); }
  NAMES.forEach((name, kind) => {
    for (const p of [0, 0.5, 1]) {
      const params = new Array(8).fill(p);
      const { outL, outR, initBytes, memBytes } = run(kind, 48000, params, inL, inR);
      // Allocation happens in aw_init only; growing later would detach the worklet's views.
      assert.equal(memBytes, initBytes, `${name} grew memory while processing`);
      for (let i = 0; i < frames; i++) {
        assert.ok(Number.isFinite(outL[i]) && Number.isFinite(outR[i]), `${name} p=${p} non-finite at ${i}`);
        assert.ok(Math.abs(outL[i]) < 64 && Math.abs(outR[i]) < 64, `${name} p=${p} runaway ${outL[i]} at ${i}`);
      }
    }
  });
});

const refBin = join(here, '..', 'ref', 'bin');
test('wasm matches the original C++ (defaults and a scattered set, 48 kHz)', { skip: !existsSync(refBin) && 'no ref/bin' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-'));
  const worstAll = {};
  NAMES.forEach((name, kind) => {
    const exe = join(refBin, `ref_${name}.exe`);
    if (!existsSync(exe)) return;
    // The C++ setParameter throws past its last index: pass exactly the plugin's count.
    const nparams = new WebAssembly.Instance(module, {}).exports.aw_init(kind, 48000, 1, 2);
    for (const params of [[], [0.73, 0.21, 0.88, 0.4, 0.62, 0.95, 0.3].slice(0, nparams)]) {
      const frames = 72000, out = join(dir, `${name}.f32`);
      execFileSync(exe, ['48000', String(frames), out, String(SEED_L), String(SEED_R), ...params.map(String)]);
      const f = new Float32Array(readFileSync(out).buffer.slice(0));
      const inL = new Float32Array(frames), inR = new Float32Array(frames);
      for (let i = 0; i < frames; i++) { inL[i] = f[i * 4]; inR[i] = f[i * 4 + 1]; }
      const { outL, outR } = run(kind, 48000, params, inL, inR);
      let worst = 0;
      for (let i = 0; i < frames; i++) worst = Math.max(worst, Math.abs(outL[i] - f[i * 4 + 2]), Math.abs(outR[i] - f[i * 4 + 3]));
      // wasm's libm is not the MSVC CRT: allow last-bit drift, which feedback can amplify a little.
      worstAll[name] = Math.max(worstAll[name] ?? 0, worst);
      assert.ok(worst < 1e-4, `${name} params=${params.length ? 'scattered' : 'default'}: worst ${worst}`);
    }
  });
  console.log('wasm vs C++ worst diff:', Object.entries(worstAll).map(([k, v]) => `${k} ${v.toExponential(1)}`).join(', '));
});
