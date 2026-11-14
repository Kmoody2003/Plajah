// Build rust/plajah-airwindows for wasm and copy it next to the Beats engine, where Vite
// fingerprints it like any other asset. CI has no Rust toolchain, so the .wasm is committed:
// run `npm run airwindows:build` after touching the crate and commit the result.
//
// cargo runs from the crate directory so its .cargo/config.toml (pre-sized 4 MB memory) applies.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(root, 'rust', 'plajah-airwindows');
execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: crate, stdio: 'inherit' });

const src = join(root, 'rust', 'target', 'wasm32-unknown-unknown', 'release', 'plajah_airwindows.wasm');
const destDir = join(root, 'services', 'melos', 'beats', 'engine', 'dsp');
const dest = join(destDir, 'plajah_airwindows.wasm');
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

const bytes = readFileSync(dest);
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
console.log(`[airwindows:build] plajah_airwindows.wasm → ${(bytes.length / 1024).toFixed(1)} KB  sha256:${hash}`);
