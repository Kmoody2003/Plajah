// Headless visual check for Kith Quest: bundles the lab with esbuild and drives it in Playwright Chromium.
// usage: node scripts/kith-quest-shots.mjs <outDir> [kith]
import {build} from 'esbuild';
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(process.argv[2] || 'dist-kith-party/quest-shots'); fs.mkdirSync(out, {recursive: true});
const kith = process.argv[3] || 'moki';
const r = await build({entryPoints: ['labs/kith-quest/main.tsx'], bundle: true, minify: true, format: 'iife', write: false, jsx: 'automatic', outdir: 'x',
 loader: {'.css': 'css', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl'}, define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'error'});
let js = '', css = ''; for (const f of r.outputFiles) { if (f.path.endsWith('.js')) js = f.text; else css = f.text; }
const html = `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style><style>html,body,#root{margin:0;height:100%;background:#1a0026}</style></head><body><div id="root" class="kp-app"></div><script>${js.split('</' + 'script').join('<\\/' + 'script')}</script></body></html>`;
const file = path.join(out, 'lab.html'); fs.writeFileSync(file, html);
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1360, height: 900}});
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('kith-quest-v1', JSON.stringify({unlocked: 3, best: {}})); } catch {} });
await page.goto('file:///' + file.split(path.sep).join('/') + '?kith=' + kith);
await page.waitForTimeout(600);
await page.screenshot({path: path.join(out, '00-select.png')});
const shot = async (name) => { const b = await page.$eval('.kq-field', e => { const r = e.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height}; }).catch(() => null); await page.screenshot({path: path.join(out, name + '.png'), clip: b || undefined, animations: 'allow', timeout: 60000}); };
const tp = (col, rowAbove = 0) => page.evaluate(([c, ra]) => { const s = window.__kithQuest; const p = s.player; const L = s.level; let r = 0; while (r < L.h && ![1, 2, 3, 4].includes(L.tiles[r * L.w + c])) r++; p.x = c * 32 + 4; p.y = (r - ra) * 32 - p.h; p.vx = 0; p.vy = 0; p.safe = {x: p.x, y: p.y + p.h}; }, [col, rowAbove]);
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };
for (const stage of [0, 1, 2]) {
 await page.locator('.kq-stage').nth(stage).click();
 await page.waitForTimeout(700); await shot(`${stage}1-intro`);
 await page.waitForTimeout(1300);
 await hold(['ArrowRight'], 900); await shot(`${stage}2-run`);
 await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space'); await page.waitForTimeout(250); await shot(`${stage}3-jump`); await page.keyboard.up('Space'); await page.keyboard.up('ArrowRight');
 const fps = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(n / 1.5); }; requestAnimationFrame(f); }));
 console.log('stage', stage, 'fps(headless sw)', fps.toFixed(1));
 const W = await page.evaluate(() => window.__kithQuest.level.w);
 for (const f of [.3, .55, .8]) { await tp(Math.floor(W * f)); await page.waitForTimeout(700); await shot(`${stage}4-at${Math.round(f * 100)}`); }
 if (stage === 2) {
  const c0 = await page.evaluate(() => window.__kithQuest.level.arena.c0);
  await tp(c0 + 6); await page.waitForTimeout(3200); await shot('25-boss-intro');
  await page.keyboard.press('KeyX'); await page.waitForTimeout(1500); await shot('26-boss-fight');
 }
 await page.keyboard.press('Escape'); await page.waitForTimeout(200);
 const btn = await page.$('text=Stage select'); if (btn) await btn.click(); await page.waitForTimeout(300);
}
console.log('errors', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
