// Headless end-to-end check of Prayer Call against the running lab (prayer-call-lab.vite.config.mjs on
// :3264, real route + in-memory store). Fake camera/mic, desktop 1280×800 and phone 390×844.
// Asserts who can start/see/join, the live card, the room, the 5-minute warning and the server-side end.
//   node scripts/prayer-call-shots.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.PRAYER_LAB_URL || 'http://127.0.0.1:3264';
const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'prayer-call-shots')); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [];
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const api = (uid, p, body) => fetch(`${BASE}/api/elevate/prayer-call${p}`, {
  method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-lab-uid': uid }, body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const clock = body => fetch(`${BASE}/__lab/clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const T = { orgId: 'gf', ministryId: 'pray' };

async function open(as, size, extra = '') {
  const ctx = await browser.newContext({ viewport: size, permissions: ['camera', 'microphone'], ...(size.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${as}: ${e}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${as}: ${m.text()}`); });
  await page.goto(`${BASE}/?as=${as}${extra}`);
  await page.waitForSelector('[data-testid="lab-bar"]');
  await page.waitForTimeout(1200);
  return page;
}
const DESK = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

await clock({ reset: true });

// Outsiders and plain members can't start; nobody sees anything before a call exists.
const tim = await open('tim', DESK);
ok(await tim.getByTestId('prayer-call-start').count() === 0, 'outsider (youth member) has no Start button');
const ruthEarly = await open('ruth', PHONE);
ok(await ruthEarly.getByTestId('prayer-call-start').count() === 0, 'member has no Start button');
ok(await ruthEarly.getByTestId('prayer-call-live-card').count() === 0, 'member sees no card before a call');
await ruthEarly.context().close();
const shopPastor = await open('pastor', DESK, '&org=shop');
ok(await shopPastor.getByTestId('prayer-call-start').count() === 0, 'non-faith org: no Prayer Call at all');
await shopPastor.context().close();
ok((await api('ruth', '/start', T)).status === 403, 'server refuses Start from a member');

// Pastor starts from the ministry page.
const pastor = await open('pastor', DESK);
await pastor.getByTestId('prayer-call-start').click();
await pastor.screenshot({ path: path.join(out, '1-desktop-start-panel.png') });
await pastor.getByText('Start now').click();
await pastor.getByTestId('prayer-call-room').waitFor();
ok(true, 'pastor started a call and the room opened');

// Others check in + requests (as their own users through the real route).
for (const uid of ['joe', 'ana', 'deacon']) await api(uid, `/?orgId=gf&ministryId=pray&here=1`);
await api('joe', '/requests', { ...T, op: 'add', text: 'Strength for my brother starting chemo this week.' });
await api('deacon', '/requests', { ...T, op: 'add', text: 'Traveling mercies for the mission team.' });

// Outsider still sees nothing while it is live, and can't get a token.
await tim.reload(); await tim.waitForTimeout(1500);
ok(await tim.getByTestId('prayer-call-live-card').count() === 0, 'outsider cannot see the live call');
ok((await api('tim', '/token', T)).status === 403, 'server refuses a token to an outsider');
await tim.context().close();

// Ruth on her phone sees the live card and joins.
const ruth = await open('ruth', PHONE);
await ruth.getByTestId('prayer-call-live-card').waitFor({ timeout: 8000 });
ok(true, 'member sees "Prayer Call live" card');
await ruth.screenshot({ path: path.join(out, '2-phone-live-card.png') });
await ruth.getByRole('button', { name: 'Join' }).click();
await ruth.getByTestId('prayer-call-room').waitFor();
await ruth.waitForTimeout(2500);
ok(await ruth.getByTestId('prayer-call-tile').count() >= 4, 'phone room shows the grid (you + others)');
await ruth.screenshot({ path: path.join(out, '3-phone-room.png') });
await ruth.getByRole('button', { name: 'Prayer requests' }).click();
const sheet = ruth.getByTestId('prayer-request-sheet');
await sheet.waitFor();
await sheet.getByPlaceholder('Share a prayer request').fill('Peace for our family this week.');
await sheet.getByRole('button', { name: 'Share request' }).click();
await ruth.waitForTimeout(800);
ok(await sheet.getByText('Peace for our family this week.').count() > 0, 'member shares a prayer request');
await ruth.screenshot({ path: path.join(out, '4-phone-prayer-sheet.png') });
ok(await ruth.getByRole('button', { name: /End call/ }).count() === 0, 'member has no End call control');

// Desktop pastor: grid + side prayer list, then the 5-minute warning.
await pastor.waitForTimeout(10_500); // next poll brings presence + requests
await pastor.screenshot({ path: path.join(out, '5-desktop-room.png') });
await clock({ leftMs: 5 * 60_000 - 2000 });
await pastor.waitForTimeout(11_000);
const cd = await pastor.getByTestId('prayer-call-countdown').innerText();
ok(/^4:[2-5]\d$/.test(cd.trim()), `countdown follows the server clock (${cd.trim()})`);
ok(await pastor.getByRole('alert').count() > 0, '5-minute warning banner shows');
await pastor.screenshot({ path: path.join(out, '6-desktop-5min-warning.png') });

// Leader removes Joe; Joe can no longer get a token.
await api('joe', `/?orgId=gf&ministryId=pray&here=1`); // the clock jump made his check-in stale
await pastor.waitForTimeout(10_500);
await pastor.getByRole('button', { name: 'Options for Joe Banks' }).click();
await pastor.getByText('Remove Joe from call').click();
await pastor.waitForTimeout(600);
ok((await api('joe', '/token', T)).body.reason === 'REMOVED', 'removed member is refused a token');

// Past the 60-minute end: the server ends it, both clients show the ended screen.
await clock({ leftMs: -1000 });
await ruth.waitForTimeout(11_000);
ok(await ruth.getByText('This Prayer Call has ended.', { exact: false }).count() > 0, 'phone shows the ended screen after time runs out');
await ruth.screenshot({ path: path.join(out, '7-phone-ended.png') });
await pastor.waitForTimeout(500);
ok(await pastor.getByText('reached its time limit', { exact: false }).count() > 0, 'desktop shows "reached its time limit"');
await pastor.screenshot({ path: path.join(out, '8-desktop-ended.png') });
const after = await api('ruth', '/token', T);
ok(after.status === 410, 'server refuses tokens after the end (410)');
const st = await api('deacon', '/?orgId=gf&ministryId=pray');
ok(st.body.call?.status === 'ENDED' && st.body.call?.endReason === 'TIME', 'stored call is ENDED with reason TIME');

await browser.close();
const real = errors.filter(e => !/prayer_call_presence|NotAllowedError/.test(e));
if (real.length) { console.log('Page errors:\n' + real.join('\n')); failures++; }
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed', '→', out);
process.exitCode = failures ? 1 : 0;
