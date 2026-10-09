// depthMaps — generate a depth map for every evite plate with Depth Anything V2 (small, ONNX) via transformers.js.
// Local and free; ~3 s per plate on CPU. Output: <out>/<collection>/<subject>.depth.png (8-bit, white = near).
// Run: node scripts/evite/depthMaps.mjs <platesDir> <outDir>
import { pipeline, RawImage } from '@huggingface/transformers';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const [platesDir, outDir] = process.argv.slice(2);
if (!platesDir || !outDir) { console.error('usage: depthMaps.mjs <platesDir> <outDir>'); process.exit(1); }
const depth = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'fp32' });
let done = 0, skipped = 0;
for (const col of readdirSync(platesDir)) {
  const src = path.join(platesDir, col); mkdirSync(path.join(outDir, col), { recursive: true });
  for (const f of readdirSync(src).filter(f => f.endsWith('.jpg'))) {
    const out = path.join(outDir, col, f.replace(/\.jpg$/, '.depth.png'));
    if (existsSync(out)) { skipped++; continue; }
    const r = await depth(await RawImage.read(path.join(src, f)));
    await r.depth.save(out); done++;
    if (done % 20 === 0) console.log(`${done} done`);
  }
}
console.log(`finished: ${done} new, ${skipped} already there`);
