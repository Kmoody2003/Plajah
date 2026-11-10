// Depth for every image-visualizer plate with Depth Anything V2 small (local ONNX, CPU). White = near.
// Run: node labs/image-visualizers/tools/depthMaps.mjs
import { pipeline, RawImage } from '@huggingface/transformers';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const root = 'labs/image-visualizers', src = path.join(root, 'plates'), out = path.join(root, 'depth');
mkdirSync(out, { recursive: true });
const depth = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'fp32', device: 'cpu' });
for (const f of readdirSync(src).filter(f => f.endsWith('.jpg'))) {
  const o = path.join(out, f.replace(/\.jpg$/, '.png'));
  if (existsSync(o)) continue;
  const t = Date.now(); const r = await depth(await RawImage.read(path.join(src, f)));
  await r.depth.save(o); console.log(f, r.depth.width + 'x' + r.depth.height, (Date.now() - t) + 'ms');
}
