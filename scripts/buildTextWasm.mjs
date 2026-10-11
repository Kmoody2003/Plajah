// Copy the compiled text engine next to its TypeScript host so Vite fingerprints it like any other
// asset. CI has no Rust toolchain, so services/text/engine/plajah_text.wasm is committed: run
// `npm run text:build` after touching rust/plajah-text and commit the result, or the app ships a
// stale engine (the host refuses an ABI_VERSION mismatch rather than mis-reading buffers).

import { copyFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'rust', 'target', 'wasm32-unknown-unknown', 'release', 'plajah_text.wasm');
const destDir = join(root, 'services', 'text', 'engine');
const dest = join(destDir, 'plajah_text.wasm');

try {
  statSync(src);
} catch {
  console.error('[text:build] No compiled wasm found. Run:\n  cargo build --release --manifest-path rust/Cargo.toml -p plajah-text --target wasm32-unknown-unknown');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
const bytes = readFileSync(dest);
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
console.log(`[text:build] plajah_text.wasm → ${(bytes.length / 1024).toFixed(1)} KB  sha256:${hash}`);
