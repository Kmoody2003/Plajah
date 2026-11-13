// Solo dry stems of every track of one Kith Quest cue (lab on :3255) → <cache>/bounce/<cue>--solo-<key>.f32, for
// scripts/games/balanceKithQuest.ts.   node scripts/kith-quest-stems.mjs <cue>
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto('http://127.0.0.1:3255/kithquest-score-lab.html', { timeout: 120000 });
await p.waitForFunction(() => !!window.kithQuestLab, null, { timeout: 120000 });
console.log(await p.evaluate((c) => window.kithQuestLab.stems(c), process.argv[2]));
await b.close();
