// Two-browser media check for Prayer Call over LiveKit. Needs the lab in LiveKit mode:
//   node node_modules/vite/bin/vite.js --config prayer-call-lab.vite.config.mjs --mode livekit
//   node scripts/prayer-call-media-check.mjs [outDir]
// Pastor starts a call on desktop, Ruth joins on a phone-sized page; both use Chromium's fake camera.
// Passes when each side receives the other's live video track, then the leader ends it and the
// LiveKit room is closed for both.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.PRAYER_LAB_URL || 'http://127.0.0.1:3264';
const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'prayer-call-shots')); fs.mkdirSync(out, { recursive: true });
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };

const info = await fetch(`${BASE}/__lab/info`).then(r => r.json());
if (!info.livekit) { console.log('Lab is not in LiveKit mode (start it with --mode livekit).'); process.exit(2); }
await fetch(`${BASE}/__lab/clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"reset":true}' });

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const open = async (as, viewport) => {
  const ctx = await browser.newContext({ viewport, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log(`[${as}] pageerror`, String(e)));
  await p.goto(`${BASE}/?as=${as}`); await p.waitForSelector('[data-testid="lab-bar"]'); await p.waitForTimeout(1000);
  return p;
};
// Remote tiles' <video> elements with a live, playing track (self tile is mirrored and excluded).
const remoteVideos = p => p.evaluate(() => [...document.querySelectorAll('[data-testid="prayer-call-tile"] video:not(.-scale-x-100)')]
  .filter(v => { const s = v.srcObject; return s && s.getVideoTracks().some(t => t.readyState === 'live') && v.videoWidth > 0; }).length);

const pastor = await open('pastor', { width: 1280, height: 800 });
await pastor.getByTestId('prayer-call-start').click();
await pastor.getByText('Start now').click();
await pastor.getByTestId('prayer-call-room').waitFor();

const ruth = await open('ruth', { width: 390, height: 844 });
await ruth.getByTestId('prayer-call-live-card').waitFor({ timeout: 10_000 });
await ruth.getByRole('button', { name: 'Join' }).click();
await ruth.getByTestId('prayer-call-room').waitFor();

let a = 0, b = 0;
for (let i = 0; i < 30 && (!a || !b); i++) { await ruth.waitForTimeout(1000); a = await remoteVideos(pastor); b = await remoteVideos(ruth); }
ok(a >= 1, `pastor receives Ruth's video (${a})`);
ok(b >= 1, `Ruth receives the pastor's video (${b})`);
await pastor.screenshot({ path: path.join(out, 'livekit-desktop.png') });
await ruth.screenshot({ path: path.join(out, 'livekit-phone.png') });

await pastor.getByRole('button', { name: /End call/ }).click();
await pastor.getByRole('button', { name: 'End for everyone' }).click();
await ruth.waitForTimeout(11_000);
ok(await ruth.getByText('A leader ended the call.', { exact: false }).count() > 0, 'Ruth sees "A leader ended the call."');
ok(await remoteVideos(ruth) === 0, 'Ruth no longer receives video');

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nmedia check passed', '→', out);
process.exitCode = failures ? 1 : 0;
