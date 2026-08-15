// Copy the compiled DSP core next to the engine so Vite fingerprints and precaches it like any
// other asset. CI has no Rust toolchain (see .github/workflows/*.yml — `npm ci && npm run build`
// only), so the .wasm is committed; run `npm run audio:build` after touching rust/plajah-audio
// and commit the result, or the app ships a stale engine.

import { copyFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'rust', 'plajah-audio', 'target', 'wasm32-unknown-unknown', 'release', 'plajah_audio.wasm');
const destDir = join(root, 'services', 'melos', 'beats', 'engine', 'dsp');
const dest = join(destDir, 'plajah_audio.wasm');

try {
  statSync(src);
} catch {
  console.error('[audio:build] No compiled wasm found. Run:\n  cargo build --release --manifest-path rust/plajah-audio/Cargo.toml --target wasm32-unknown-unknown');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

const bytes = readFileSync(dest);
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
console.log(`[audio:build] plajah_audio.wasm → ${(bytes.length / 1024).toFixed(1)} KB  sha256:${hash}`);
