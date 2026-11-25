// Sovereign GT-R: image -> mesh with the local Tela 3D runtime (Hunyuan3D-2mini), from a cleaned turntable frame.
// node games/apex/car/sovereign/gen_hunyuan.mjs [frameIndex=0] [octree=380]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frame = process.argv[2] ?? '0';
const octree = Number(process.argv[3] ?? 380);
const url = process.env.TELA3D_URL || 'http://127.0.0.1:51124';
const img = fs.readFileSync(path.join(here, 'views', `cut${frame}.png`));
const health = await (await fetch(`${url}/health`)).json();
console.log('runtime', { resident: health.resident, vramFreeMb: health.vramFreeMb, gpuTempC: health.gpuTempC });
const t0 = Date.now();
const res = await fetch(`${url}/tela3d/image-to-mesh`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageDataUrl: `data:image/png;base64,${img.toString('base64')}`,
    backend: 'hunyuan_mini',
    quality: 'detail',
    options: { octreeResolution: octree, steps: 5, faceLimit: 60000, foregroundRatio: 0.92 },
  }),
});
const json = await res.json();
if (!res.ok || !json.success) { console.error('FAILED', JSON.stringify(json).slice(0, 600)); process.exit(1); }
const out = path.join(here, `hunyuan_f${frame}.glb`);
fs.writeFileSync(out, Buffer.from(json.glbBase64, 'base64'));
console.log('saved', out, json.vertices, 'verts', json.faces, 'faces', json.executionTimeMs, 'ms', 'peak', json.vramPeakMb, 'MB', 'gpu', json.gpuTempC, 'C', JSON.stringify(json.steps));
console.log('DONE', ((Date.now() - t0) / 1000).toFixed(0), 's');
