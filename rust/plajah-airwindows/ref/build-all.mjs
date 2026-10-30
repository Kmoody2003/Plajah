// Builds a native reference renderer for EVERY upstream plugin (build.ps1 does the Rust-ported 16).
//   node ref/build-all.mjs [Name ...]     Needs MSVC Build Tools + the airwindows checkout.
import { exec, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const src = process.env.AIRWINDOWS_SRC || path.join(os.homedir(), 'oss/airwindows');
const pluginsDir = path.join(src, 'plugins/LinuxVST/src');
const bin = path.join(here, 'bin');
const vswhere = `${process.env['ProgramFiles(x86)']}\\Microsoft Visual Studio\\Installer\\vswhere.exe`;
const vs = execSync(`"${vswhere}" -latest -products * -property installationPath`).toString().trim();
// vcvars is slow; run it once and reuse its environment for every cl.
const env = { ...process.env };
for (const line of execSync(`"${path.join(vs, 'VC/Auxiliary/Build/vcvars64.bat')}" >nul && set`, { maxBuffer: 1 << 24 }).toString().split(/\r?\n/)) {
  const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
const named = process.argv.length > 2;
const names = named ? process.argv.slice(2) : fs.readdirSync(pluginsDir);
const todo = names.filter((p) => named || !fs.existsSync(path.join(bin, `ref_${p}.exe`)));
fs.mkdirSync(bin, { recursive: true });
const failed = []; let done = 0;
const one = (p) => new Promise((resolve) => {
  const dir = path.join(pluginsDir, p);
  const obj = path.join(os.tmpdir(), `awobj_${p}`); fs.mkdirSync(obj, { recursive: true });
  exec(`cl /nologo /std:c++17 /EHsc /O2 /fp:precise /W0 /D_USE_MATH_DEFINES /D_XKEYCHECK_H /DPLUGIN=${p} /DPLUGIN_HEADER=\\"${p}.h\\" /I"${path.join(here, 'vst')}" /I"${dir}" /Fo"${obj}\\\\" /Fe"${path.join(bin, `ref_${p}.exe`)}" "${path.join(here, 'harness.cpp')}" "${path.join(dir, `${p}.cpp`)}" "${path.join(dir, `${p}Proc.cpp`)}"`,
    { env, maxBuffer: 1 << 24 }, (err, out) => { fs.rmSync(obj, { recursive: true, force: true }); if (err) failed.push(`${p}: ${String(out).slice(0, 400)}`); resolve(); });
});
const q = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) { await one(q.shift()); if (++done % 25 === 0) console.log(`${done}/${todo.length}`); } }));
console.log(`built ${todo.length - failed.length}/${todo.length}`);
failed.forEach((f) => console.log('FAILED', f));
