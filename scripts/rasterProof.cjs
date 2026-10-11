// rasterProof — visual proof for the raster engine: bundles scripts/raster-proof/entry.ts
// with esbuild, runs it in system Chrome (WebGL2 via puppeteer) and writes before/after
// sheets + GPU-vs-CPU metrics to .tela-proofs/raster/.   node scripts/rasterProof.cjs
const esbuild = require('esbuild');
const puppeteer = require('puppeteer');
const fs = require('fs'); const path = require('path');
const out = path.resolve('.tela-proofs/raster'); fs.mkdirSync(out, { recursive: true });
const photos = { a: 'public/backdrops/forest-01.jpg', b: 'public/holistic/hibiscus.jpg', c: 'public/backdrops/forest-02.jpg' };
for (const [k, v] of Object.entries(process.env).filter(([k]) => k.startsWith('RASTER_PHOTO_'))) photos[k.slice(13).toLowerCase()] = v;
(async () => {
  const bundle = path.join(out, 'proof.bundle.js');
  await esbuild.build({ entryPoints: ['scripts/raster-proof/entry.ts'], bundle: true, format: 'iife', outfile: bundle, target: 'es2022', logLevel: 'warning', external: ['@huggingface/transformers'] });
  const workerBundle = path.join(out, 'worker.bundle.js');
  await esbuild.build({ entryPoints: ['services/tela/raster/rasterWorker.ts'], bundle: true, format: 'iife', outfile: workerBundle, target: 'es2022', logLevel: 'warning' });
  fs.writeFileSync(path.join(out, 'proof.html'), '<!doctype html><meta charset="utf-8"><title>raster proof</title><body style="background:#111"><script src="proof.bundle.js"></script>');
  const data = {}; for (const [k, f] of Object.entries(photos)) data[k] = 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
  const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('[page]', m.text())); page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('file:///' + path.join(out, 'proof.html').replace(/\\/g, '/'));
  const info = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return c ? (d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'webgl2') : 'NO WEBGL2'; });
  console.log('GPU:', info);
  const t0 = Date.now();
  data.__worker = fs.readFileSync(workerBundle, 'utf8');
  const res = await page.evaluate(p => window.__run(p), data);
  console.log('proof ran in', Date.now() - t0, 'ms');
  for (const [name, url] of Object.entries(res.images)) fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify({ gpu: info, ...res.metrics }, null, 2));
  console.log(JSON.stringify(res.metrics, null, 1).slice(0, 6000));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
