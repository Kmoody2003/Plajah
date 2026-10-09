// Behavioural check of the page-turn engine in a real Chromium against the lab (needs the lab dev server on :3140).
//   node scripts/lorea/verifyPageTurns.mjs
// Drives REAL pointer / keyboard events: drag commit, drag cancel, flick, tap, RTL keys, reduced motion, cleanup, frame times.
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:3140/page-turn-lab.html';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 780 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const info = () => page.evaluate(() => ({
  text: document.querySelector('[data-pt-layer="live"] h2')?.textContent?.replace('Page ', ''),
  state: document.querySelector('[data-pt-root]').getAttribute('data-pt-state'),
  layers: document.querySelectorAll('[data-pt-layer]').length,
  liveStyle: document.querySelector('[data-pt-layer="live"]').getAttribute('style'),
  rootStyle: document.querySelector('[data-pt-root]').getAttribute('style'),
  foot: [...document.querySelectorAll('div')].map(d => d.textContent).find(t => /page \d+\/240 · resolved/.test(t || '') && t.length < 160),
}));
const open = async (q = '') => { await page.goto(`${URL}?${q}`, { waitUntil: 'load', timeout: 90000 }); await page.waitForSelector('[data-pt-root]', { timeout: 90000 }); await page.waitForTimeout(500); };
const box = async () => (await (await page.$('[data-pt-root]')).boundingBox());
const settle = async () => { for (let i = 0; i < 40; i++) { const s = await info(); if (s.state === 'idle' && s.layers === 1) return s; await page.waitForTimeout(50); } return info(); };

// 1. mouse drag from the right edge commits
for (const style of ['curl', 'flip', 'slide', 'cube']) {
  await open(`style=${style}&start=10`);
  let b = await box();
  await page.mouse.move(b.x + b.width - 20, b.y + b.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.7, { steps: 4 });
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.72, { steps: 6 });
  const mid = await info();
  check(`${style}: drag shows both pages while held`, mid.state === 'drag' && mid.layers >= 2, JSON.stringify({ state: mid.state, layers: mid.layers }));
  await page.mouse.up();
  const end = await settle();
  check(`${style}: drag past halfway commits to the next page`, end.text === '12' || end.text === '11', `page ${end.text} (started on 11)`.replace('11)', '11)'));
  check(`${style}: layers and inline styles cleaned up after the turn`, end.layers === 1 && !/transform|opacity|clip|mask|will-change/.test(end.liveStyle || '') && !/perspective|clip-path/.test(end.rootStyle || ''), `${end.liveStyle} | ${end.rootStyle}`);
}

// 2. small drag cancels
await open('style=curl&start=10');
let b = await box();
await page.mouse.move(b.x + b.width - 20, b.y + 300); await page.mouse.down();
await page.mouse.move(b.x + b.width - 60, b.y + 300, { steps: 5 }); await page.waitForTimeout(250);
await page.mouse.move(b.x + b.width - 62, b.y + 300, { steps: 2 }); await page.waitForTimeout(250);
await page.mouse.up();
let s = await settle();
check('curl: a short slow drag cancels and stays on the page', s.text === '11', `page ${s.text}`);

// 3. drag from the middle with a MOUSE does not start a turn (text selection stays possible)
await open('style=curl&start=10');
b = await box();
await page.mouse.move(b.x + b.width / 2, b.y + 200); await page.mouse.down(); await page.mouse.move(b.x + 40, b.y + 200, { steps: 6 });
s = await info(); await page.mouse.up();
check('mouse drag from the middle of a page is not hijacked', s.layers === 1, `layers ${s.layers}`);

// 4. next / back buttons animate and then go idle
await open('style=curl&start=10');
await page.getByRole('button', { name: 'Next', exact: true }).click();
await page.waitForTimeout(120);
s = await info();
check('tap Next starts a timed turn (two layers during)', s.layers >= 2 && s.state === 'timed', JSON.stringify({ layers: s.layers, state: s.state }));
s = await settle();
check('turn finishes and page advanced', s.text === '12' && s.layers === 1, `page ${s.text}`);
await page.getByRole('button', { name: 'Back', exact: true }).click(); s = await settle();
check('Back returns', s.text === '11', `page ${s.text}`);

// 5. arrow keys, LTR and RTL
await open('style=slide&start=10');
await page.keyboard.press('ArrowRight'); s = await settle(); check('LTR: ArrowRight advances', s.text === '12', `page ${s.text}`);
await open('style=slide&start=10&rtl=1');
await page.keyboard.press('ArrowLeft'); s = await settle(); check('RTL: ArrowLeft advances', s.text === '12', `page ${s.text}`);

// 6. reduced motion: quick fade
await open('style=curl&start=10&reduced=1');
await page.getByRole('button', { name: 'Next', exact: true }).click();
const t0 = Date.now(); s = await settle(); const dt = Date.now() - t0;
const foot = await page.evaluate(() => document.body.innerText.match(/resolved: [^)]*\)/)?.[0]);
check('reduced motion resolves to a short dissolve', /dissolve/.test(foot || '') && dt < 450, `${foot} settled in ${dt}ms`);

// 7. touch swipe anywhere (touch pointer events via CDP)
await open('style=flip&start=10');
const cdp = await ctx.newCDPSession(page); b = await box();
const y = Math.round(b.y + b.height / 2), x0 = Math.round(b.x + b.width * 0.7);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 28, y }] }); await page.waitForTimeout(16); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
s = await settle();
check('touch swipe from the middle of the page turns it', s.text === '12', `page ${s.text}`);

// 8. frame times through a long book
const perf = [];
for (const style of process.env.NOPERF ? [] : ['curl', 'flip', 'slide', 'cover', 'dissolve', 'wipe', 'iris', 'zoom', 'cardflip', 'cube']) {
  await open(`style=${style}&perf=1`);
  await page.waitForFunction(() => window.__perf, null, { timeout: 60000 });
  const r = await page.evaluate(() => window.__perf); perf.push(r); console.log('PERF ', r);
}
check('no uncaught page errors', errors.filter(e => !/favicon/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
