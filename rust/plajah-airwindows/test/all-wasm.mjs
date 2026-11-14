// Every per-plugin wasm vs its native build of the same original C++: same signal, blocks, seeds.
//   node test/all-wasm.mjs [Name ...]   Writes ref/report.json (gitignored), prints a summary.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const crate = path.resolve(here, '..');
const wasmDir = process.env.AW_WASM || path.join(crate, 'ref/wasm');
const bin = path.join(crate, 'ref/bin');
const names = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(wasmDir).map((f) => f.replace('.wasm', ''));
const SEEDL = 2756150181, SEEDR = 1518500249, FRAMES = 48000, BLOCK = 128;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awcmp'));
const render = (p, sr, params, out) => new Promise((res, rej) =>
  execFile(path.join(bin, `ref_${p}.exe`), [sr, FRAMES, out, SEEDL, SEEDR, ...params].map(String), { timeout: 120000 }, (e) => (e ? rej(e) : res())));
const sets = (n, defs) => [defs, Array(n).fill(0), Array(n).fill(1), defs.map((_, i) => ((i * 7 + 3) % 11) / 10)];

async function one(p) {
  const r = { name: p, worst: 0, ok: true, peak: 0, nativeNonFinite: 0, grew: false, xrt: 0, params: 0, notes: [] };
  const module = new WebAssembly.Module(fs.readFileSync(path.join(wasmDir, `${p}.wasm`)));
  const inst0 = new WebAssembly.Instance(module, {}).exports; inst0._initialize();
  r.params = inst0.aw_init(0, 48000, SEEDL, SEEDR);
  const defs = Array.from({ length: r.params }, (_, i) => inst0.aw_param_default(i));
  for (const sr of [44100, 96000]) for (const set of sets(r.params, defs)) {
    const out = path.join(tmp, `${p}.f32`);
    try { await render(p, sr, set, out); } catch (e) { r.ok = false; r.notes.push(`native run failed: ${e.message.slice(0, 120)}`); continue; }
    const b = fs.readFileSync(out); const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    const x = new WebAssembly.Instance(module, {}).exports; x._initialize();
    x.aw_init(0, sr, SEEDL, SEEDR); set.forEach((v, i) => x.aw_set_param(i, v));
    const mem = x.memory.buffer.byteLength;
    const L = new Float32Array(x.memory.buffer, x.aw_buf(0), 512), R = new Float32Array(x.memory.buffer, x.aw_buf(1), 512);
    let t = 0;
    for (let off = 0; off < FRAMES; off += BLOCK) {
      const n = Math.min(BLOCK, FRAMES - off);
      for (let i = 0; i < n; i++) { L[i] = f[(off + i) * 4]; R[i] = f[(off + i) * 4 + 1]; }
      const t0 = performance.now(); x.aw_process(n); t += performance.now() - t0;
      for (let i = 0; i < n; i++) {
        const nl = f[(off + i) * 4 + 2], nr = f[(off + i) * 4 + 3];
        r.peak = Math.max(r.peak, Math.abs(L[i]), Math.abs(R[i]));
        // The host zeroes non-finite output on purpose, so those samples can't be compared.
        if (!Number.isFinite(nl) || !Number.isFinite(nr)) { r.nativeNonFinite++; continue; }
        const d = Math.max(Math.abs(nl - L[i]), Math.abs(nr - R[i]));
        if (d > 1e-4 && !r.first) r.first = { sr, set, frame: off + i, native: nl, wasm: L[i] };
        r.worst = Math.max(r.worst, d);
      }
    }
    if (x.memory.buffer.byteLength !== mem) r.grew = true;
    r.xrt = Math.max(r.xrt, t / (FRAMES / sr * 1000));
    r.mem = Math.max(r.mem || 0, x.memory.buffer.byteLength);
    fs.rmSync(out, { force: true });
  }
  return r;
}
const report = []; const q = [...names]; let done = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) { const p = q.shift(); try { report.push(await one(p)); } catch (e) { report.push({ name: p, ok: false, worst: Infinity, notes: [String(e).slice(0, 200)] }); } if (++done % 25 === 0) console.log(`${done}/${names.length}`); } }));
fs.rmSync(tmp, { recursive: true, force: true });
// CPU on its own, one at a time at 48 kHz: the renders above run in parallel and would skew it.
for (const r of report) {
  if (!r.params && r.params !== 0) continue;
  const module = new WebAssembly.Module(fs.readFileSync(path.join(wasmDir, `${r.name}.wasm`)));
  r.xrt = 0;
  for (const mode of ['default', 'ones']) {
    const x = new WebAssembly.Instance(module, {}).exports; x._initialize();
    x.aw_init(0, 48000, SEEDL, SEEDR);
    if (mode === 'ones') for (let i = 0; i < r.params; i++) x.aw_set_param(i, 1);
    const L = new Float32Array(x.memory.buffer, x.aw_buf(0), 512), R = new Float32Array(x.memory.buffer, x.aw_buf(1), 512);
    let t = 0;
    for (let off = 0; off < 48000; off += BLOCK) {
      for (let i = 0; i < BLOCK; i++) { const s = 0.3 * Math.sin((off + i) * 0.03); L[i] = s; R[i] = s; }
      const t0 = performance.now(); x.aw_process(BLOCK); t += performance.now() - t0;
    }
    r.xrt = Math.max(r.xrt, t / 1000);
  }
}
report.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(crate, 'ref/report.json'), JSON.stringify(report, (k, v) => (v === Infinity ? 'inf' : v), 1));
const TOL = 1e-4; const bad = report.filter((r) => !r.ok || !(r.worst <= TOL));
console.log(`${report.length - bad.length}/${report.length} within ${TOL}; exact: ${report.filter((r) => r.worst === 0).length}`);
bad.forEach((r) => console.log(`DIFF ${r.name} worst=${r.worst} ${JSON.stringify(r.first ?? r.notes)}`));
