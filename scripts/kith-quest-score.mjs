// Bounce the Kith Quest lullaby themes to WAV via headless Chromium's OfflineAudioContext.
// usage: node scripts/kith-quest-score.mjs <outDir> [seconds] [all|calm]
import {build} from 'esbuild';
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(process.argv[2] || '.'); fs.mkdirSync(out, {recursive: true});
const secs = Number(process.argv[3] || 50);
const r = await build({stdin: {contents: "import {renderQuestScore} from './components/kithParty/quest/score'; window.renderQuestScore = renderQuestScore;", resolveDir: process.cwd(), loader: 'ts'}, bundle: true, format: 'iife', write: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"production"'}, loader: {'.css': 'empty'}});
const browser = await chromium.launch(); const page = await browser.newPage();
await page.setContent('<html><body></body></html>'); await page.addScriptTag({content: r.outputFiles[0].text});
// [file, stage, mood, intensity]
const jobs = (process.argv[4] || 'all') === 'calm'
 ? [['1-glowmoss-hollow', 0, 'calm', 0], ['2-cascade-spires', 1, 'calm', 0], ['3-lanternkeep', 2, 'calm', 0]]
 : [['energy-glowmoss-run', 0, 'energy', 0], ['energy-cascade-rush', 1, 'energy', 0], ['energy-lanternkeep-charge', 2, 'energy', 0],
    ['danger-cascade-peril', 1, 'danger', 0], ['fear-lanternkeep-low-health', 2, 'danger', 1],
    ['battle-hollow-warden-phase1', 2, 'battle', 0], ['battle-hollow-warden-phase3', 2, 'battle', 1]];
for (const [name, stage, mood, inten] of jobs) {
 const b64 = await page.evaluate(async ([st, sec, mo, it]) => {
  const buf = await window.renderQuestScore(st, sec, mo, it);
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak > 0 ? Math.min(4, .89 / peak) : 1;
  const ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true); }
  let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
  return [btoa(s), peak];
 }, [stage, secs, mood, inten]);
 fs.writeFileSync(path.join(out, `kith-quest-${name}.wav`), Buffer.from(b64[0], 'base64'));
 console.log(name, 'peak', b64[1].toFixed(3));
}
await browser.close();
