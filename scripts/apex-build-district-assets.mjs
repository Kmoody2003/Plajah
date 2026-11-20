// Build the Apex district library pieces with Plajah 3D's build-from-sheet (services/argilla/understand/sheetBuild.ts), one asset sheet each
// (games/forth-horizon/tools/district_sheets.py mini). Runs in the Plajah 3D lab (argilla-lab, :3214) against the Tela 3D runtime (:51124).
// usage: node scripts/apex-build-district-assets.mjs <mini sheets dir> [id,id,...]
// Writes games/forth-horizon/assets-src/district/<id>/{sheet.png,shape.glb,body.glb,painted.glb,report.json} and
// then games/forth-horizon/tools/district_game_glb.py makes the game copies (public/games/forth-horizon/library/<id>.glb, 1k JPEG textures) and index.json.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2]);
const only = (process.argv[3] || '').split(',').filter(Boolean);
const manifest = JSON.parse(fs.readFileSync('games/forth-horizon/tools/data/district_assets.json', 'utf8'));
const SRC = 'games/forth-horizon/assets-src/district';
const browser = await chromium.launch({args: ['--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page]', m.text().slice(0, 300)); });
await page.goto(process.env.LAB_URL || 'http://127.0.0.1:3214/argilla-lab.html', {timeout: 180000});
for (const a of manifest.assets) {
  if (only.length && !only.includes(a.id)) continue;
  const png = path.join(dir, a.id + '.png');
  if (!fs.existsSync(png)) { console.log(a.id, 'no sheet'); continue; }
  const d = path.join(SRC, a.id); fs.mkdirSync(d, {recursive: true});
  fs.copyFileSync(png, path.join(d, 'sheet.png'));
  console.log(a.id, 'building…');
  const r = await page.evaluate(async ([b64, roles]) => {
    const {buildFromSheet} = await import('/services/argilla/understand/sheetBuild.ts');
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], {type: 'image/png'});
    const enc = async (x) => { const u = new Uint8Array(await x.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    try {
      const out = await buildFromSheet(blob, {roles, onStage: (s) => console.log('stage', s)});
      return {ok: true, glb: await enc(out.glb), shape: await enc(out.shape), body: await enc(out.body),
        report: {figures: out.figures, overlap: out.overlap, weak: out.weak, sourceView: out.sourceView, turnDeg: out.turnDeg, warnings: out.warnings, paintedShare: out.paintedShare, geometry: out.geometry, seconds: out.seconds}};
    } catch (e) { return {ok: false, error: String(e && e.stack || e)}; }
  }, [fs.readFileSync(png).toString('base64'), {0: 'front', 1: 'left'}]);
  if (!r.ok) { console.log(a.id, 'FAILED', r.error.slice(0, 600)); continue; }
  for (const k of ['shape', 'body']) fs.writeFileSync(path.join(d, k + '.glb'), Buffer.from(r[k], 'base64'));
  fs.writeFileSync(path.join(d, 'painted.glb'), Buffer.from(r.glb, 'base64'));
  fs.writeFileSync(path.join(d, 'report.json'), JSON.stringify(r.report, null, 1));
  console.log(a.id, 'done in', Math.round(r.report.seconds), 's; overlap', JSON.stringify(r.report.overlap), 'weak', r.report.weak.join(', ') || 'none', 'turn', r.report.turnDeg);
  await fetch('http://127.0.0.1:51124/tela3d/release', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}).catch(() => {});
}
await browser.close();
console.log('next: "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" games/forth-horizon/tools/district_game_glb.py (game copies + index.json), then review at /library-review.html');
