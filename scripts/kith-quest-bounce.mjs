// Drives kithquest-score-lab.html headlessly: bounces every Kith Quest Chora project with renderGroove.
//   (lab server running on :3255)  node scripts/kith-quest-bounce.mjs [cue,cue]
import { chromium } from 'playwright';

const cues = process.argv[2] || '';
const url = `http://127.0.0.1:3255/kithquest-score-lab.html?auto=1${cues ? `&cues=${cues}` : ''}`;
for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:3255/kithquest-score-lab.html'); if (r.ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 1000)); }
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(url, { timeout: 180000 });
let last = '';
for (let t = 0; t < 3600; t++) {
  const st = await page.evaluate(() => window.kithQuestLab && { done: window.kithQuestLab.done, rows: window.kithQuestLab.rows });
  if (st) {
    const s = st.rows.map((r) => `${r.cue}:${r.status}${r.sec ? ` ${r.sec}s pk${r.peak} rms${r.rms} skip${r.skipped}` : ''}`).join('\n');
    if (s !== last) { console.log(s.split('\n').slice(-1)[0]); last = s; }
    if (st.done && st.rows.length) { console.log('\n' + s); break; }
  }
  await new Promise((r) => setTimeout(r, 1000));
}
await browser.close();
