// Compiles every Airwindows plugin from its ORIGINAL C++ to its own wasm with wasi-sdk.
//   node scripts/buildAirwindowsAll.mjs [Name ...]
// Needs a checkout of github.com/airwindows/airwindows (AIRWINDOWS_SRC, default ~/oss/airwindows)
// and wasi-sdk (WASI_SDK, default ~/oss/wasi-sdk-34). Failures are listed, not fatal, so one bad
// plugin can't block the rest; only plugins that compile get a wasm.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const src = process.env.AIRWINDOWS_SRC || path.join(os.homedir(), 'oss/airwindows');
const sdk = process.env.WASI_SDK || path.join(os.homedir(), 'oss/wasi-sdk-34');
const pluginsDir = path.join(src, 'plugins/LinuxVST/src');
const refDir = path.join(root, 'rust/plajah-airwindows/ref');
const outDir = process.env.AW_OUT || path.join(root, 'rust/plajah-airwindows/ref/wasm');
const clang = path.join(sdk, 'bin/clang++.exe');
fs.mkdirSync(outDir, { recursive: true });

const names = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(pluginsDir);
const compile = (p) => new Promise((resolve) => {
  const dir = path.join(pluginsDir, p);
  const args = ['--target=wasm32-wasip1', '-mexec-model=reactor', '-std=c++17', '-O2', '-w',
    '-fno-exceptions', '-fno-rtti', '-mnontrapping-fptoint', '-D_USE_MATH_DEFINES',
    `-DPLUGIN=${p}`, `-DPLUGIN_H="${p}.h"`, `-DPLUGIN_CPP="${p}.cpp"`, `-DPLUGIN_PROC="${p}Proc.cpp"`,
    `-I${path.join(refDir, 'wasmstd')}`, `-I${path.join(refDir, 'vst')}`, `-I${dir}`, path.join(refDir, 'wasm_host.cpp'),
    '-nostdlib++', '-Wl,--strip-all,--gc-sections,-z,stack-size=131072', '-o', path.join(outDir, `${p}.wasm`)];
  execFile(clang, args, { maxBuffer: 1 << 24 }, (err, _o, stderr) => resolve({ p, ok: !err, stderr: String(stderr).slice(0, 800) }));
});

const queue = [...names]; const failed = [];
let done = 0;
await Promise.all(Array.from({ length: Math.max(2, Math.min(6, os.cpus().length - 2)) }, async () => {
  while (queue.length) {
    const r = await compile(queue.shift());
    if (!r.ok) failed.push(r);
    if (++done % 25 === 0) console.log(`${done}/${names.length}`);
  }
}));
console.log(`built ${names.length - failed.length}/${names.length}`);
for (const f of failed) console.log(`FAILED ${f.p}\n${f.stderr}`);
