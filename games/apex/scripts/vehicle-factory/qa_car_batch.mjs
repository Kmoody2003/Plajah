import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('c:/Users/Kenne/plajah/node_modules/playwright');

const args = process.argv.slice(2);
const outName = args[0] || 'qa_batch.png';
const carIds = args.slice(1);
if (!carIds.length) { console.error('Usage: node qa_car_batch.mjs <out.png> <carId1> ...'); process.exit(1); }

const OUT = 'C:/Users/Kenne/.gemini/antigravity/brain/42e3bfd8-faf9-4bbd-85bf-ae0b60e1bbba/scratch/qa';
fs.mkdirSync(OUT, { recursive: true });

const PORT = 4198;
const srv = spawn(process.execPath, ['c:/Users/Kenne/plajah/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: 'c:/Users/Kenne/plajah/games/apex',
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/car.html`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite timeout');
}

try {
  await waitPort();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 720, height: 420 } });
  const shotPaths = [];

  for (const cid of carIds) {
    const errs = [];
    page.removeAllListeners('pageerror');
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/car.html?car=${cid}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.scanRig && window.carCam), undefined, { timeout: 35000 });
    await page.evaluate(() => {
      const hud = document.querySelector('button[data-v]')?.parentElement;
      if (hud) hud.style.display = 'none';
    });
    for (const [vName, pos, tgt, fov] of [
      ['front34', [4.3, 1.55, 5.4], [0, 0.65, 0.1], 30],
      ['side', [9.8, 0.80, 0.0], [0, 0.65, 0.0], 17],
      ['rear34', [-4.3, 1.55, -5.4], [0, 0.65, -0.1], 30],
      ['front', [0.0, 0.85, 8.2], [0, 0.65, 0.0], 18],
    ]) {
      await page.evaluate(({ pos, tgt, fov }) => window.carCam(pos, tgt, fov), { pos, tgt, fov });
      await page.waitForTimeout(350);
      const sp = path.join(OUT, `${cid}_${vName}.png`);
      await page.screenshot({ path: sp });
      shotPaths.push({ cid, vName, sp });
    }
    console.log(`QA_CAPTURED ${cid} (errs=${errs.length})`, errs.slice(0, 2));
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'last_shots.json'), JSON.stringify({ outName, carIds, shotPaths }, null, 2));
} finally {
  srv.kill();
}
