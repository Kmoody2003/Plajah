// Headless check for Aria in a meeting: bundles labs/aria-meeting with esbuild (+ Tailwind for the
// lab's files), drives it in Playwright Chromium, asserts the notes page, the human-edit rule and the
// recap, and saves screenshots.   usage: node scripts/aria-meeting-shots.mjs [outDir]
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'dist-aria-meeting'); fs.mkdirSync(out, { recursive: true });
const files = ['labs/aria-meeting/main.tsx', 'components/collab/AriaMeetingPanel.tsx'];
const scanner = new Scanner({ sources: files.map(f => ({ base: process.cwd(), pattern: f, negated: false })) });
const tw = await compile('@import "tailwindcss";', { base: process.cwd(), onDependency: () => {} });
const twCss = tw.build(scanner.scan());

const r = await build({ entryPoints: ['labs/aria-meeting/main.tsx'], bundle: true, format: 'iife', write: false, jsx: 'automatic', outdir: 'x',
  loader: { '.css': 'empty', '.woff2': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'error' });
const js = r.outputFiles.find(f => f.path.endsWith('.js')).text;
const html = `<!doctype html><html><head><meta charset="utf-8"/><style>${twCss}</style><style>html,body,#root{margin:0;height:100%;background:#0b0d10;font-family:system-ui}</style></head><body><div id="root"></div><script>${js.split('</' + 'script').join('<\\/' + 'script')}</script></body></html>`;
const file = path.join(out, 'lab.html'); fs.writeFileSync(file, html);

const browser = await chromium.launch();
const errors = [];
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
async function run(lane) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file:///' + file.split(path.sep).join('/'));
  await page.getByTestId('aria-bring').click();
  await page.screenshot({ path: path.join(out, `${lane}-0-lanes.png`) });
  await page.getByTestId(lane === 'cloud' ? 'aria-lane-cloud' : 'aria-lane-rules').click();
  const notes = page.getByTestId('Meeting notes · Aria');
  await notes.waitFor({ timeout: 3000 });
  await page.getByTestId('play').click();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(out, `${lane}-1-live.png`) });
  const text = await notes.innerText();
  for (const want of ['Decisions', 'Action items', 'Marcus']) if (!text.includes(want)) fail(`${lane}: notes page lacks "${want}"`);
  if (lane === 'cloud' && !text.includes('Asked of Aria')) fail('cloud: Aria request not answered');
  const status = await page.getByTestId('aria-status').innerText();
  console.log(lane, 'status:', status);

  // A person edits Aria's page; the next update must keep their words and only append.
  const edited = await page.evaluate(() => {
    const d = Object.values(window.lab.doc.devices).find(x => x.blocks?.some(b => /Gleaners/.test(b.text) && b.kind === 'li'));
    const line = d?.blocks.find(b => /Gleaners/.test(b.text) && b.kind === 'li');
    return line ? (window.lab.editLine(line.text, line.text + ' (truck at 8am)'), line.text + ' (truck at 8am)') : null;
  });
  if (!edited) fail(`${lane}: no Gleaners action to edit`);
  await page.evaluate(() => { window.lab.say('Keisha', 'I will print the flyers for the bulletin by Sunday.'); window.lab.say('Marcus', 'Okay sounds good to me.'); window.lab.say('Dana', 'Great, we agreed to open doors at nine.'); });
  await page.waitForTimeout(3500);
  const after = await notes.innerText();
  if (edited && !after.includes(edited)) fail(`${lane}: human edit was overwritten`);
  if (!after.includes('New from Aria')) fail(`${lane}: new items not appended under "New from Aria"`);
  if (!/flyers/i.test(after)) fail(`${lane}: new action not appended`);

  await page.getByTestId('aria-stop').click();
  await page.getByTestId('recap').waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `${lane}-2-recap.png`) });
  const recap = await page.getByTestId('recap').innerText();
  if (!/Action items:/.test(recap)) fail(`${lane}: recap has no action items`);
  if (/· live/.test(await notes.innerText())) fail(`${lane}: page still marked live after Aria left`);
  console.log(lane, 'ok');
  await page.close();
}
await run('rules');
await run('cloud');
await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exitCode = 1; }
console.log('shots in', out);
