// One-shot proof for design-file import. Boots the lab's Vite in-process, drives it headless, exits.
//   node scripts/telaImportProof.mjs <outDir> fidelity <psd...>
//   node scripts/telaImportProof.mjs <outDir> ui <file...>
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const [outDir, mode, ...files] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const toUrl = f => `/__sample/${encodeURIComponent(f)}`;
const safe = f => path.basename(f).replace(/[^\w.-]+/g, '_');

// Sample files can live on any drive; Vite's /@fs only reaches the project's own.
const samples = { name: 'proof-samples', configureServer(s) { s.middlewares.use('/__sample', (req, res) => { const p = decodeURIComponent((req.url || '').slice(1)); res.setHeader('content-type', 'application/octet-stream'); fs.createReadStream(p).on('error', () => { res.statusCode = 404; res.end(); }).pipe(res); }); } };
const server = await createServer({ configFile: 'tela-import-lab.vite.config.mjs', logLevel: 'error', plugins: [samples], server: { port: 3199, strictPort: true, watch: null } });
await server.listen();
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, userDataDir: process.env.PROOF_PROFILE || undefined, args: ['--no-sandbox', '--window-size=1600,1000'], defaultViewport: { width: 1600, height: 1000 } });
const results = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Firebase|firestore|auth\//i.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:3199/tela-import-lab.html', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => !!window.importLab, { timeout: 600000 });
  // Vite may reload the page once while it discovers dependencies; let that settle.
  await new Promise(res => setTimeout(res, 15000));
  await page.waitForFunction(() => !!window.importLab, { timeout: 600000 });
  if (mode === 'fidelity') {
    for (const f of files) {
      try {
        const r = await page.evaluate((u) => window.importLab.fidelity(u, { show: true }), toUrl(f));
        results.push(r); console.log(JSON.stringify(r));
        await new Promise(res => setTimeout(res, 300));
        const shot = await page.$('#fid'); if (shot) await shot.screenshot({ path: path.join(outDir, `${safe(f)}.png`) });
      } catch (e) { console.log('FAIL', f, e.message.slice(0, 400)); }
    }
  } else {
    await page.waitForSelector('input[type=file][accept*=".psd"]', { timeout: 300000 }).catch(() => {});
    await new Promise(res => setTimeout(res, 2500));
    await page.screenshot({ path: path.join(outDir, 'ui-0-start.png') });
    console.log('input present', !!(await page.$('input[type=file][accept*=".psd"]')));
    for (const f of files) {
      await page.evaluate((u) => window.importLab.inject(u), toUrl(f));
      await page.waitForFunction(() => document.querySelector('[data-testid="design-import-done"]') || document.querySelector('[data-testid="tela-library"]') || /Import stopped/.test(document.body.innerText), { timeout: 600000 });
      await new Promise(res => setTimeout(res, 800));
      await page.screenshot({ path: path.join(outDir, `ui-${safe(f)}-report.png`) });
      console.log('REPORT', (await page.$eval('[data-testid="design-import-dialog"]', e => e.innerText)).replace(/\n+/g, ' | ').slice(0, 1400));
      const done = await page.$('[data-testid="design-import-done"]'); if (done) await done.click();
      await new Promise(res => setTimeout(res, 3000));
      await page.screenshot({ path: path.join(outDir, `ui-${safe(f)}-canvas.png`) });
    }
  }
  if (errors.length) console.log('ERRORS', [...new Set(errors)].slice(0, 12));
} finally {
  await browser.close(); await server.close();
}
process.exit(0);
