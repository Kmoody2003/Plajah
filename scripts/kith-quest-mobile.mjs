// Phone check for Kith Quest: bundles the lab, emulates a phone in landscape with real multi-touch (CDP touch events).
// usage: node scripts/kith-quest-mobile.mjs <outDir>
import {build} from 'esbuild';
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(process.argv[2] || 'quest-mobile'); fs.mkdirSync(out, {recursive: true});
const r = await build({entryPoints: ['labs/kith-quest/main.tsx'], bundle: true, minify: true, format: 'iife', write: false, jsx: 'automatic', outdir: 'x',
 loader: {'.css': 'css', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl'}, define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'error'});
let js = '', css = ''; for (const f of r.outputFiles) { if (f.path.endsWith('.js')) js = f.text; else css = f.text; }
const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/><style>${css}</style><style>html,body,#root{margin:0;height:100%;background:#1a0026}</style></head><body><div id="root" class="kp-app"></div><script>${js.split('</' + 'script').join('<\/' + 'script')}</script></body></html>`;
const file = path.join(out, 'lab.html'); fs.writeFileSync(file, html);
const url = 'file:///' + file.split(path.sep).join('/') + '?kith=zippi';
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 844, height: 390}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url); await page.waitForTimeout(500);
await page.screenshot({path: path.join(out, 'm0-select.png')});
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map(([x, y, id]) => ({x, y, id, radiusX: 8, radiusY: 8, force: 1}))});
const tap = async (x, y) => { await touch('touchStart', [[x, y, 9]]); await page.waitForTimeout(60); await touch('touchEnd', []); };
await page.locator('.kq-stage').first().scrollIntoViewIfNeeded(); const box = await page.locator('.kq-stage').first().boundingBox();
await tap(box.x + box.width / 2, box.y + 40);
await page.waitForTimeout(2300);
const mobile = await page.evaluate(() => !!document.querySelector('.kq-mobile'));
const p0 = await page.evaluate(() => ({x: window.__kithQuest.player.x, y: window.__kithQuest.player.y}));
await page.screenshot({path: path.join(out, 'm1-play.png')});
// hold the stick right (left thumb), then tap jump twice with the right thumb while still holding
const sx = 110, sy = 300;
await touch('touchStart', [[sx, sy, 1]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[sx + i * 10, sy, 1]]); await page.waitForTimeout(16); }
await page.waitForTimeout(700);
console.log('errs', JSON.stringify(errors)); console.log('afterStick', JSON.stringify(await page.evaluate(() => ({phase: window.__kithQuest.phase, x: window.__kithQuest.player.x, hp: window.__kithQuest.player.hp, pad: !!document.querySelector('.kq-pad'), overlay: document.querySelector('.kp-game-overlay')?.textContent?.slice(0, 60) || null, rotate: getComputedStyle(document.querySelector('.kq-rotate') || document.body).display}))));
await page.screenshot({path: path.join(out, 'm1b-stick.png')});
const jb = await page.locator('.kq-tb-jump').boundingBox();
const jx = jb.x + jb.width / 2, jy = jb.y + jb.height / 2;
await touch('touchStart', [[sx + 60, sy, 1], [jx, jy, 2]]);
await page.waitForTimeout(80);
const air = await page.evaluate(() => ({onGround: window.__kithQuest.player.onGround, vy: window.__kithQuest.player.vy}));
await page.screenshot({path: path.join(out, 'm2-run-jump.png')});
await page.waitForTimeout(300);
await touch('touchEnd', [[sx + 60, sy, 1]]);
await page.waitForTimeout(700);
const p1 = await page.evaluate(() => ({x: window.__kithQuest.player.x, y: window.__kithQuest.player.y, anim: window.__kithQuest.player.anim}));
// lash button
const lb = await page.locator('.kq-tb-attack').boundingBox();
await touch('touchStart', [[sx + 60, sy, 1], [lb.x + lb.width / 2, lb.y + lb.height / 2, 3]]);
await page.waitForTimeout(60);
const lash = await page.evaluate(() => window.__kithQuest.player.attackT > 0);
await touch('touchEnd', []);
await page.waitForTimeout(600);
await page.screenshot({path: path.join(out, 'm3-after.png')});
// pause button
const pb = await page.locator('.kq-mpause').boundingBox();
await tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.waitForTimeout(250);
const paused = await page.evaluate(() => !!document.querySelector('.kp-game-overlay h2')?.textContent?.includes('Paused'));
await page.screenshot({path: path.join(out, 'm4-paused.png')});
// portrait
await page.evaluate(() => document.exitFullscreen?.().catch(() => {})); await page.waitForTimeout(300);
await page.setViewportSize({width: 390, height: 844}); await page.waitForTimeout(400);
await page.screenshot({path: path.join(out, 'm5-portrait.png')});
const fps = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
console.log(JSON.stringify({mobileLayout: mobile, movedRightPx: Math.round(p1.x - p0.x), jumpedWhileHoldingStick: !air.onGround && air.vy < 0, lashFromButton: lash, pauseButton: paused, fpsHeadlessSw: fps, errors: errors.slice(0, 5)}, null, 1));
await browser.close();
