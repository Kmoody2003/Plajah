// Living Books audio: OFFLINE-RENDER verification. We cannot LISTEN in CI, so every sound is rendered through a real WebAudio engine
// (OfflineAudioContext in headless Chromium via Playwright) and MEASURED: non-silent, finite, not clipping, sane duration, spectral
// centroid per category, safe loudness window, depth/duck/reduced-sound behaviour, determinism, and the master limiter under stress.
//
//   npm run test:livingaudio                          assertions only
//   LIVING_AUDIO_WRITE=1 npm run test:livingaudio     also writes WAVs, spectrogram sheets and stats.json to docs/living-audio-renders/
//
// If no Chromium is installed the tests are SKIPPED (reported as skipped, never as passed).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openRenderPage, type RenderPage } from './support/livingAudioBrowser';
import { SFX_CATALOG } from '../services/living/audio/sfxCatalog';
import { INSTRUMENTS } from '../services/living/audio/instruments';
import { AMBIENCE_BEDS } from '../services/living/audio/ambience';

const WRITE = process.env.LIVING_AUDIO_WRITE === '1';
const OUT = path.resolve('docs/living-audio-renders');
let rp: RenderPage | null = null;
const measured: Record<string, any> = {};

before(async () => { rp = await openRenderPage(); });
after(async () => {
  if (rp) await rp.close();
  if (WRITE && Object.keys(measured).length) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(measured, null, 1));
  }
});

const J = JSON.stringify;
const r2 = (x: number) => Math.round(x * 100) / 100;
function save(dir: string, name: string, b64?: string) {
  if (!WRITE || !b64) return;
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  fs.writeFileSync(path.join(OUT, dir, `${name}.wav`), Buffer.from(b64, 'base64'));
}
async function savePng(name: string, keys: string[], cols = 4, cellW = 300) {
  if (!WRITE || !rp) return;
  const url: string = await rp.call(`LA.sheet(${J(keys)}, {cols:${cols}, cellW:${cellW}})`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
const need = (t: any) => { if (!rp) { t.skip('no Chromium available for offline rendering'); return false; } return true; };

// Intent, written before measuring: sounds that should be dark vs bright.
const DARK = new Set(['thud', 'heartbeat', 'rumble', 'whale-call', 'hum', 'snore', 'gentle-no', 'owl-hoo', 'jelly-squish', 'knock', 'thread-tug', 'footstep-left', 'footstep-right', 'honk', 'toot', 'boing', 'bell']);
const BRIGHT = new Set(['tick', 'sparkle', 'cricket', 'confetti', 'crunch', 'rustle', 'wings', 'swoosh', 'magic-appear', 'page-flip', 'unravel', 'candle-flicker']);

test('every sfx renders: audible, finite, not clipping, bounded length, comfortable loudness, sensible brightness', async (t) => {
  if (!need(t)) return;
  const problems: string[] = [];
  const keys: string[] = [];
  for (const d of SFX_CATALOG) {
    const raw = await rp!.call(`LA.sfx(${J(d.id)}, {raw:true, wav:false, tag:':raw'})`);
    const out = await rp!.call(`LA.sfx(${J(d.id)}, {wav:${WRITE}})`);
    const s = raw.stats, g = out.stats;
    measured[`sfx:${d.id}`] = { peak: r2(g.peakLR), rmsDb: r2(s.rmsActiveDb), durSec: r2(s.durationSec), centroidHz: Math.round(s.centroidHz), maxSec: d.maxSec };
    keys.push(`sfx:${d.id}:raw`);
    save('sfx', d.id, out.wav);
    if (s.silent || g.silent) { problems.push(`${d.id}: silent`); continue; }
    if (s.hasNaN || g.hasNaN) problems.push(`${d.id}: NaN/Infinity`);
    if (s.peakLR > 0.62) problems.push(`${d.id}: raw peak ${r2(s.peakLR)} too hot at default gain`);
    if (g.peakLR > 0.98) problems.push(`${d.id}: master peak ${r2(g.peakLR)} clips`);
    if (s.rmsActiveDb < -36 || s.rmsActiveDb > -14) problems.push(`${d.id}: loudness ${r2(s.rmsActiveDb)} dBFS outside the -36..-14 window`);
    if (s.durationSec > d.maxSec) problems.push(`${d.id}: rings ${r2(s.durationSec)}s > maxSec ${d.maxSec}`);
    if (s.durationSec < 0.015) problems.push(`${d.id}: only ${r2(s.durationSec)}s long`);
    if (s.activeStartSec > 0.1) problems.push(`${d.id}: starts ${r2(s.activeStartSec)}s late`);
    if (DARK.has(d.id) && s.centroidHz > 1100) problems.push(`${d.id}: expected dark, centroid ${Math.round(s.centroidHz)} Hz`);
    if (BRIGHT.has(d.id) && s.centroidHz < 2200) problems.push(`${d.id}: expected bright, centroid ${Math.round(s.centroidHz)} Hz`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  const half = Math.ceil(keys.length / 2);
  await savePng('spectrograms-sfx-1', keys.slice(0, half), 4); await savePng('spectrograms-sfx-2', keys.slice(half), 4);
  assert.deepEqual(rp!.consoleErrors, []);
});

test('sfx params do what they say: pitch shifts brightness, durationScale stretches, order of the beeps', async (t) => {
  if (!need(t)) return;
  const c = async (id: string, o: object = {}) => (await rp!.call(`LA.sfx(${J(id)}, ${J({ raw: true, wav: false, ...o })})`)).stats;
  const lo = await c('beep-low'), mid = await c('beep'), hi = await c('beep-high');
  assert.ok(lo.centroidHz < mid.centroidHz && mid.centroidHz < hi.centroidHz, `beep pitches ${lo.centroidHz} < ${mid.centroidHz} < ${hi.centroidHz}`);
  const base = await c('beep'), up = await c('beep', { pitch: 12 }), down = await c('beep', { pitch: -12 });
  assert.ok(up.centroidHz > base.centroidHz * 1.6 && up.centroidHz < base.centroidHz * 2.6, `+12 st: ${base.centroidHz} -> ${up.centroidHz}`);
  assert.ok(down.centroidHz < base.centroidHz * 0.65, `-12 st: ${base.centroidHz} -> ${down.centroidHz}`);
  const long = await c('boing', { durationScale: 2 }), short = await c('boing', { durationScale: 1 });
  assert.ok(long.durationSec > short.durationSec * 1.6 && long.durationSec < short.durationSec * 2.4, `boing ${short.durationSec} -> ${long.durationSec}`);
  const quiet = await c('beep', { gain: 0.5 }); assert.ok(quiet.peakLR < base.peakLR * 0.6 && quiet.peakLR > base.peakLR * 0.4);
  const car = await c('beep-car'); assert.ok(car.durationSec > 0.2);
});

test('every instrument note renders: audible, finite, safe; pitch and release behave', async (t) => {
  if (!need(t)) return;
  const problems: string[] = [];
  const keys: string[] = [];
  for (const i of INSTRUMENTS) {
    const note = i.family === 'drum' ? (i.id === 'drum' ? 'kick' : 'x') : 'C4';
    const r = await rp!.call(`LA.note(${J(i.id)}, ${J(note)}, {raw:true, durationMs:600, wav:${WRITE}})`);
    const s = r.stats; keys.push(`inst:${i.id}:${note}`);
    measured[`inst:${i.id}`] = { peak: r2(s.peakLR), rmsDb: r2(s.rmsActiveDb), durSec: r2(s.durationSec), centroidHz: Math.round(s.centroidHz) };
    save('instruments', `${i.id}-${note}`, r.wav);
    if (s.silent) { problems.push(`${i.id}: silent`); continue; }
    if (s.hasNaN) problems.push(`${i.id}: NaN`);
    if (s.peakLR > 0.7) problems.push(`${i.id}: peak ${r2(s.peakLR)}`);
    if (s.rmsActiveDb < -32 || s.rmsActiveDb > -15) problems.push(`${i.id}: loudness ${r2(s.rmsActiveDb)} dBFS`);
    if (s.durationSec > 3.2) problems.push(`${i.id}: rings ${r2(s.durationSec)}s`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  // a keyboard: the same instrument one octave apart must be brighter higher up
  for (const id of ['harp', 'marimba', 'flute', 'kalimba', 'felt-piano', 'pluck']) {
    const lo = (await rp!.call(`LA.note(${J(id)}, 'C3', {raw:true, wav:false})`)).stats.centroidHz;
    const hi = (await rp!.call(`LA.note(${J(id)}, 'C5', {raw:true, wav:false})`)).stats.centroidHz;
    assert.ok(hi > lo * 1.5, `${id}: C5 centroid ${hi} should clearly exceed C3 ${lo}`);
  }
  // drum character
  assert.ok(measured['inst:kick'].centroidHz < 300, 'kick is low'); assert.ok(measured['inst:hat'].centroidHz > 5000, 'hat is bright'); assert.ok(measured['inst:snare'].centroidHz > measured['inst:kick'].centroidHz * 5);
  // a held note: sustained instruments last as long as asked, plus their release
  const f = (await rp!.call(`LA.note('flute', 'A4', {raw:true, durationMs:1500, wav:false, seconds:4, tag:':held'})`)).stats;
  assert.ok(f.durationSec > 1.3 && f.durationSec < 2.2, `flute held 1.5 s sounds for ${f.durationSec}`);
  const k = (await rp!.call(`LA.note('kazoo', 'C4', {raw:true, durationMs:50, wav:false, tag:':short'})`)).stats; assert.ok(!k.silent, 'a note shorter than its attack still speaks');
  await savePng('spectrograms-instruments', keys, 4);
});

test('ambience beds: steady, quiet-but-present, finite, with the right character', async (t) => {
  if (!need(t)) return;
  const problems: string[] = []; const keys: string[] = [];
  for (const b of AMBIENCE_BEDS) {
    const r = await rp!.call(`LA.bed(${J(b.id)}, {seconds:8, wav:${WRITE}})`);
    const s = r.stats; keys.push(`bed:${b.id}`);
    const sm: Float32Array | null = null; void sm;
    // steadiness: compare early and late halves via two extra renders of different lengths is overkill; use RMS of the first vs last 3 s
    const halves = await rp!.page.evaluate(`(() => { const x = LA.samples(${J(`bed:${b.id}`)}); const sr = 44100; const rms = (a,b)=>{let s=0;for(let i=a*sr;i<b*sr;i++)s+=x[i]*x[i];return Math.sqrt(s/((b-a)*sr));}; return [rms(1,4), rms(5,8)]; })()`) as number[];
    const driftDb = Math.abs(20 * Math.log10(halves[1] / halves[0]));
    measured[`bed:${b.id}`] = { peak: r2(s.peakLR), rmsDb: r2(s.rmsActiveDb), centroidHz: Math.round(s.centroidHz), driftDb: r2(driftDb) };
    save('ambience', b.id, r.wav);
    if (s.silent) { problems.push(`${b.id}: silent`); continue; }
    if (s.hasNaN) problems.push(`${b.id}: NaN`);
    if (s.peakLR > 0.5) problems.push(`${b.id}: peak ${r2(s.peakLR)}`);
    if (s.rmsActiveDb < -34 || s.rmsActiveDb > -22) problems.push(`${b.id}: loudness ${r2(s.rmsActiveDb)} dBFS`);
    const allowed = b.id === 'ocean-hum' ? 8 : 4;                       // the ocean swells with an ~11 s period by design
    if (driftDb > allowed) problems.push(`${b.id}: level drifts ${r2(driftDb)} dB between early and late (allowed ${allowed})`);
    if (s.durationSec < 7.9) problems.push(`${b.id}: stops early (${s.durationSec}s)`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.ok(measured['bed:space-drone'].centroidHz < 700, 'space drone is dark'); assert.ok(measured['bed:rain-soft'].centroidHz > 3000, 'rain is hissy');
  assert.ok(measured['bed:rain-soft'].centroidHz > measured['bed:ocean-hum'].centroidHz * 2);
  assert.ok(measured['bed:night-crickets'].centroidHz > 1500 && measured['bed:night-crickets'].centroidHz < 4500);
  await savePng('spectrograms-ambience', keys, 3);
});

test('the three demo cues render: musical, finite, safe, deterministic', async (t) => {
  if (!need(t)) return;
  const keys: string[] = [];
  for (const id of ['lullaby', 'city', 'folk']) {
    const r = await rp!.call(`LA.score(${J(id)}, {seconds:14, wav:${WRITE}})`);
    const s = r.stats; keys.push(`score:${id}`);
    measured[`score:${id}`] = { peak: r2(s.peakLR), rmsDb: r2(s.rmsActiveDb), centroidHz: Math.round(s.centroidHz), events: r.events };
    save('scores', id, r.wav);
    assert.ok(!s.silent && !s.hasNaN, id); assert.ok(s.peakLR <= 0.95, `${id}: peak ${s.peakLR}`);
    assert.ok(s.rmsActiveDb > -32 && s.rmsActiveDb < -17, `${id}: loudness ${s.rmsActiveDb} dBFS`);
    assert.ok(r.events > 30, `${id}: only ${r.events} events`);
    assert.ok(s.durationSec > 12, `${id}: sounds for ${s.durationSec}s of 14`);
  }
  assert.ok(measured['score:lullaby'].centroidHz < measured['score:city'].centroidHz, 'the groove is brighter than the lullaby');
  const d = await rp!.call('LA.determinismTest()');
  measured['determinism'] = d;
  assert.ok(d.sfxDiff < 1e-4, `same seed -> same samples (max diff ${d.sfxDiff})`); assert.ok(d.otherSeedDiff > 0.01, 'different seed -> different samples');
  assert.ok(d.scoreDiff < 1e-3, `a seeded cue renders the same twice (max diff ${d.scoreDiff})`);
  const slow = await rp!.call(`LA.score('lullaby', {seconds:14, tempoScale:0.5, wav:false, tag:':slow'})`);
  assert.ok(slow.events < measured['score:lullaby'].events * 0.65, `half tempo plays fewer notes in the same time (${slow.events} vs ${measured['score:lullaby'].events})`);
  const ramp = await rp!.call('LA.tempoRampTest()');
  measured['tempoRamp'] = ramp;
  assert.ok(ramp.passSec.length >= 4, 'several passes');
  for (let i = 1; i < ramp.passSec.length; i++) assert.ok(ramp.passSec[i] >= ramp.passSec[i - 1] - 0.05, `each pass is slower than the last: ${ramp.passSec}`);
  assert.ok(ramp.passSec[ramp.passSec.length - 1] > ramp.passSec[0] * 1.5, `the lullaby slows: ${ramp.passSec}`);
  await savePng('spectrograms-scores', keys, 1, 1000);
});

test('depth makes music and ambience darker and quieter; ducking dips and recovers', async (t) => {
  if (!need(t)) return;
  const d = await rp!.call('LA.depthTest()');
  const [s0, s1] = d.score, [w0, w1] = d.wind;
  measured['depth'] = { scoreCentroid: [Math.round(s0.centroidHz), Math.round(s1.centroidHz)], scoreRmsDb: [r2(s0.rmsActiveDb), r2(s1.rmsActiveDb)], windCentroid: [Math.round(w0.centroidHz), Math.round(w1.centroidHz)], windRmsDb: [r2(w0.rmsActiveDb), r2(w1.rmsActiveDb)] };
  assert.ok(s1.centroidHz < s0.centroidHz * 0.55, `music centroid ${s0.centroidHz} -> ${s1.centroidHz}`);
  assert.ok(s1.rmsActiveDb < s0.rmsActiveDb - 2, `music level ${s0.rmsActiveDb} -> ${s1.rmsActiveDb}`);
  assert.ok(w1.centroidHz < w0.centroidHz * 0.6, `wind centroid ${w0.centroidHz} -> ${w1.centroidHz}`);
  assert.ok(w1.rmsActiveDb < w0.rmsActiveDb - 2, `wind level ${w0.rmsActiveDb} -> ${w1.rmsActiveDb}`);
  const duck = await rp!.call('LA.duckTest()');
  measured['duck'] = duck;
  assert.ok(duck.ducked < duck.ref * 0.5, `ducked ${duck.ducked} vs un-ducked ${duck.ref}`);
  assert.ok(duck.after > duck.ref * 0.8, `recovers: ${duck.after} vs ${duck.ref}`);
});

test('reduced-sound mode softens startle sounds; the master limiter holds under a pile-up', async (t) => {
  if (!need(t)) return;
  const r = await rp!.call('LA.reducedTest()');
  measured['reduced'] = r;
  for (const id of ['pop-balloon', 'honk', 'rumble']) assert.ok(r[id].reducedPeak < r[id].normalPeak * 0.7, `${id}: peak ${r[id].normalPeak} -> ${r[id].reducedPeak}`);
  assert.ok(r['pop-balloon'].reducedCentroid < r['pop-balloon'].normalCentroid, 'reduced mode is darker');
  assert.ok(r.boop.reducedPeak > 0, 'gentle sounds still play');
  const st = await rp!.call('LA.stressTest()');
  measured['stress'] = { peakLR: r2(st.stats.peakLR) };
  assert.ok(!st.stats.hasNaN); assert.ok(st.stats.peakLR < 1.0, `stress peak ${st.stats.peakLR} must stay below 1.0`); assert.ok(st.stats.peakLR > 0.3, 'the stress test actually made noise');
});
