// Lexicon review shots: a Playwright Chromium (WebGPU) loads the game, poses each shot through the debug handle
// (__lex, ?lexdebug) and screenshots the real page — the WebGPU canvas can't be read back from a hidden Browser pane.
//   node scripts/lexicon/shots.mjs [shotName …]      (dev server on :4392 first: npm run lexicon:dev)
//   LEX_HEADED=1 shows the window; LEX_URL overrides the page; LEX_GPU=high asks for the discrete GPU.
// Output: games/lexicon/review/shot-<name>.jpg (git-ignored), compared against the art in docs/lexicon-visual-identity.md §9.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const OUT = path.resolve('games/lexicon/review');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.LEX_URL ?? 'http://127.0.0.1:4392/?lexdebug';

// each shot: time of day, where the Scribe stands (x, z), which way the camera looks (yaw), frames to settle
const SHOTS = {
  village: { tod: 0.42, at: [4, 6], yaw: Math.PI, settle: 120 },
  meadow: { tod: 0.4, at: [-6, 32], yaw: Math.PI * 0.85, settle: 150 },
  giants: { tod: 0.36, at: [22, 26], yaw: Math.PI * 0.25, settle: 150 },
  golden: { tod: 0.7, at: [2, 10], yaw: Math.PI, settle: 150 },
  night: { tod: 0.95, at: [0, 12], yaw: Math.PI, settle: 150 },
  hushling: { tod: 0.42, at: [19, 18], yaw: Math.PI * 0.5, settle: 150 },
  // the Scribe against his turnaround: front, side, back on the village square
  'scribe-front': { tod: 0.45, at: [0, 6], yaw: 0, settle: 120, portrait: 0 },
  'scribe-side': { tod: 0.45, at: [0, 6], yaw: 0, settle: 120, portrait: -Math.PI / 2 },
  'scribe-back': { tod: 0.45, at: [0, 6], yaw: 0, settle: 120, portrait: Math.PI },
  'scribe-face': { tod: 0.45, at: [0, 6], yaw: 0, settle: 120, portrait: 0.35, dist: 1.1 },
};
const want = process.argv.slice(2).filter((a) => SHOTS[a]);
const list = want.length ? want : Object.keys(SHOTS);

const browser = await chromium.launch({
  headless: !process.env.LEX_HEADED,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', `--use-webgpu-power-preference=${process.env.LEX_GPU === 'high' ? 'force-high-performance' : 'force-low-power'}`, '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)); });
await page.goto(URL);
await page.waitForFunction(() => window.__lex && window.__lex.post && document.getElementById('startBtn').textContent === 'Begin', null, { timeout: 120000 });
const backend = await page.evaluate(() => (window.__lex.post() ? 'post ok' : 'no post'));
console.log('loaded:', backend);
await page.evaluate(() => { window.__lex.state.save.met.push('elder'); document.getElementById('startBtn').click(); });
await page.waitForFunction(() => window.__lex.state.scribe, null, { timeout: 60000 }).catch(() => console.log('(the Scribe model did not load: stand-in)'));

for (const name of list) {
  const s = SHOTS[name];
  await page.evaluate(([tod, x, z, yaw, portrait, dist]) => {
    window.__lex.setTod(tod); window.__lex.tp(x, z);
    if (portrait === null) window.__lex.face?.(yaw); else window.__lex.portrait(yaw, portrait, dist ?? undefined);
  }, [s.tod, s.at[0], s.at[1], s.yaw, s.portrait ?? null, s.dist ?? null]);
  await page.waitForTimeout(Math.round(s.settle * 16.7) + 500); // let the live loop run (TRAA history, sky re-bake, LOD)
  const file = path.join(OUT, `shot-${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  const stats = await page.evaluate(() => window.__lex.state.budget);
  console.log(name, '→', file, `draws ${stats.drawCalls} tris ${(stats.triangles / 1e6).toFixed(2)}M frame ${stats.frameMs.toFixed(1)}ms`);
}
await browser.close();
