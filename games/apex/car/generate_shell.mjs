// Same Hunyuan settings as sovereign/gen_hunyuan.mjs; accepts only cleaned turntable frames.
// node games/apex/car/generate_shell.mjs corsair 0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [id, frame = '0'] = process.argv.slice(2);
if (!['corsair', 'vanguard', 'aurelia', 'ironhide', 'badlands'].includes(id) || !/^[0-7]$/.test(frame)) throw new Error('Provide an intake car ID and frame 0..7');
const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), id);
const intake = JSON.parse(fs.readFileSync(path.join(folder, 'intake.json'), 'utf8'));
if (!intake.cutouts) throw new Error('Prepare cleaned turntable frames with --cutouts first');
const source = path.join(folder, 'views', `cut${frame}.png`);
const image = fs.readFileSync(source);
const output = path.join(folder, `hunyuan_f${frame}.glb`);
if (fs.existsSync(output)) throw new Error('Shell exists; choose another frame rather than overwrite review work');
const base = process.env.TELA3D_URL || 'http://127.0.0.1:51124';
const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
if (!health.ok) throw new Error('Local Tela runtime unavailable');
const response = await fetch(`${base}/tela3d/image-to-mesh`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageDataUrl: `data:image/png;base64,${image.toString('base64')}`, backend: 'hunyuan_mini', quality: 'detail', options: { octreeResolution: 380, steps: 5, faceLimit: 60000, foregroundRatio: 0.92 } }),
});
const result = await response.json();
if (!response.ok || !result.success || !result.glbBase64) throw new Error(`Shell generation failed: ${result.error || response.status}`);
fs.writeFileSync(output, Buffer.from(result.glbBase64, 'base64'));
intake.sourceShell = output;
intake.status = 'shell generated; orientation, measurements and panel assembly pending';
fs.writeFileSync(path.join(folder, 'intake.json'), JSON.stringify(intake, null, 2));
console.log(`${id}: saved shell (${result.faces} faces). Not assembled or approved.`);
