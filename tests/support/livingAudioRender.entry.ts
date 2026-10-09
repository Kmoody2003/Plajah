// Browser-side half of the Living Audio verification. Bundled with esbuild and loaded into headless Chromium by
// tests/livingAudio.render.test.ts, which drives it over Playwright. It renders sounds through OfflineAudioContext (the real WebAudio engine
// code path), keeps the samples here, and returns measurements, WAV bytes and spectrogram sheets. Nothing is audible; everything is measured.

import { analyse, downsample2, encodeWav16, hashSamples, spectrogram } from '../../services/living/audio/analysis';
import { DEMO_SCORES } from '../../services/living/audio/demoScores';
import { AudioGraph, depthParams } from '../../services/living/audio/graph';
import { renderAmbience, renderCustom, renderNote, renderScore, renderSfx, scheduleScore, type OfflineRender } from '../../services/living/audio/render';
import { RunCursor } from '../../services/living/audio/sequencer';
import { playSfxInto } from '../../services/living/audio/sfxCatalog';

const store = new Map<string, OfflineRender>();

function b64(bytes: Uint8Array): string {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function summarize(key: string, r: OfflineRender, o: { wav?: boolean; floor?: number } = {}) {
  store.set(key, r);
  const st = analyse(r.samples, r.sampleRate, { floor: o.floor });
  // peak across BOTH channels (analyse() looked at the mono mix)
  let peakLR = 0, nan = false;
  for (const ch of [r.left, r.right]) for (let i = 0; i < ch.length; i++) { const v = ch[i]; if (!Number.isFinite(v)) nan = true; else if (Math.abs(v) > peakLR) peakLR = Math.abs(v); }
  let wav: string | undefined;
  if (o.wav !== false && !st.silent) {
    const end = Math.min(r.samples.length, Math.ceil((st.durationSec + 0.08) * r.sampleRate));
    wav = b64(encodeWav16(downsample2(r.samples.subarray(0, end)), r.sampleRate / 2));
  }
  return { key, stats: { ...st, peakLR, hasNaN: st.hasNaN || nan }, hash: hashSamples(r.samples), wav, sampleRate: r.sampleRate };
}

function sheet(keys: string[], opts: { cols?: number; cellW?: number; cellH?: number; maxHz?: number } = {}): string {
  const cols = opts.cols ?? 4, W = opts.cellW ?? 300, H = opts.cellH ?? 110, maxHz = opts.maxHz ?? 10000;
  const rows = Math.ceil(keys.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = rows * H;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  keys.forEach((k, idx) => {
    const r = store.get(k); if (!r) return;
    const st = analyse(r.samples, r.sampleRate);
    const x0 = (idx % cols) * W, y0 = Math.floor(idx / cols) * H;
    if (!st.silent) {
      const from = Math.floor(Math.max(0, st.activeStartSec - 0.01) * r.sampleRate);
      const to = Math.min(r.samples.length, Math.floor(Math.min(st.durationSec + 0.05, st.activeStartSec + 6) * r.sampleRate));
      const sp = spectrogram(r.samples, r.sampleRate, { size: 1024, hop: Math.max(128, Math.floor((to - from) / W)), maxHz, from, to });
      const img = g.createImageData(W, H - 14);
      for (let px = 0; px < W; px++) {
        const f = Math.min(sp.frames - 1, Math.floor((px / W) * sp.frames));
        for (let py = 0; py < H - 14; py++) {
          const b = Math.min(sp.bins - 1, Math.floor(((H - 15 - py) / (H - 14)) * sp.bins));
          const v = Math.max(0, Math.min(1, (sp.db[f * sp.bins + b] + 95) / 65));
          const o = (py * W + px) * 4;
          img.data[o] = Math.min(255, Math.round(255 * Math.pow(v, 0.8) * 1.4));
          img.data[o + 1] = Math.round(255 * Math.pow(v, 2.2));
          img.data[o + 2] = Math.round(255 * (v < 0.5 ? v * 1.6 : Math.max(0, 1.6 - v * 1.6)) * 0.9);
          img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, x0, y0 + 14);
    }
    g.fillStyle = '#fff'; g.font = '11px monospace';
    g.fillText(`${k}  ${st.silent ? 'SILENT' : `${st.durationSec.toFixed(2)}s  ${Math.round(st.centroidHz)}Hz  pk ${st.peak.toFixed(2)}`}`, x0 + 3, y0 + 11);
    g.strokeStyle = '#333'; g.strokeRect(x0, y0, W, H);
  });
  return cv.toDataURL('image/png');
}

const LA = {
  ids: { scores: Object.keys(DEMO_SCORES) },
  async sfx(id: string, o: any = {}) { return summarize(`sfx:${id}${o.tag ?? ''}`, await renderSfx(id, { seconds: o.seconds ?? 5, ...o }), { wav: o.wav }); },
  async note(inst: string, note: string | number, o: any = {}) { return summarize(`inst:${inst}:${note}${o.tag ?? ''}`, await renderNote(inst, note, { seconds: o.seconds ?? 4, ...o })); },
  async bed(id: string, o: any = {}) { return summarize(`bed:${id}${o.tag ?? ''}`, await renderAmbience(id, { seconds: o.seconds ?? 6, ...o }), { floor: 0.0005 }); },
  async score(id: string, o: any = {}) {
    const r = await renderScore(DEMO_SCORES[id], { seconds: o.seconds ?? 12, ...o });
    return { ...summarize(`score:${id}${o.tag ?? ''}`, r, { floor: 0.0005 }), events: r.events };
  },
  sheet,
  samples(key: string) { return store.get(key)?.samples ?? null; },

  /** depth: the same music rendered at depth 0 and 1; the deep render must be darker and quieter. */
  async depthTest() {
    const a = await LA.score('city', { seconds: 6, depth: 0, tag: ':d0', raw: true });
    const b = await LA.score('city', { seconds: 6, depth: 1, tag: ':d1', raw: true });
    const w0 = await LA.bed('wind', { seconds: 5, depth: 0, tag: ':d0' });
    const w1 = await LA.bed('wind', { seconds: 5, depth: 1, tag: ':d1' });
    return { score: [a.stats, b.stats], wind: [w0.stats, w1.stats], params: [depthParams(0), depthParams(0.5), depthParams(1)] };
  },
  /** duck: ambience with a hard duck at t=0 for 800 ms must be much quieter early than late. */
  async duckTest() {
    const r = await renderAmbience('room-tone', { seconds: 4, gain: 0.8, duck: { amount: 0.8, ms: 800 } });
    const sr = r.sampleRate; const rms = (a: number, b: number) => { let s = 0; for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) s += r.samples[i] ** 2; return Math.sqrt(s / ((b - a) * sr)); };
    const ref = await renderAmbience('room-tone', { seconds: 4, gain: 0.8 });
    const rr = (a: number, b: number) => { let s = 0; for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) s += ref.samples[i] ** 2; return Math.sqrt(s / ((b - a) * sr)); };
    return { ducked: rms(0.3, 0.7), after: rms(3, 4), ref: rr(0.3, 0.7) };
  },
  /** reduced sound: loud sounds are quieter and darker, and begin without a click. */
  async reducedTest() {
    const out: any = {};
    for (const id of ['pop-balloon', 'honk', 'rumble', 'boop']) {
      const n = await renderSfx(id, { seconds: 3, tag: ':n' });
      const nn = analyse(n.samples, n.sampleRate);
      const rd = await renderSfx(id, { seconds: 3, reducedSound: true, soft: true, gain: id === 'boop' ? 0.7 : 0.4 });
      const rr = analyse(rd.samples, rd.sampleRate);
      out[id] = { normalPeak: nn.peak, reducedPeak: rr.peak, normalCentroid: nn.centroidHz, reducedCentroid: rr.centroidHz };
    }
    return out;
  },
  /** same seed, same samples (to float precision); different seed, different samples. */
  async determinismTest() {
    const maxDiff = (a: Float32Array, b: Float32Array) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
    const a = await renderSfx('confetti', { seconds: 2, seed: 7, variation: 0.5 });
    const b = await renderSfx('confetti', { seconds: 2, seed: 7, variation: 0.5 });
    const c = await renderSfx('confetti', { seconds: 2, seed: 8, variation: 0.5 });
    const s1 = await renderScore(DEMO_SCORES.folk, { seconds: 6 });
    const s2 = await renderScore(DEMO_SCORES.folk, { seconds: 6 });
    return { sfxDiff: maxDiff(a.samples, b.samples), otherSeedDiff: maxDiff(a.samples, c.samples), scoreDiff: maxDiff(s1.samples, s2.samples), scorePeak: Math.max(...Array.from(s1.samples.slice(0, 20000)).map(Math.abs)) };
  },
  /** tempo ramp: with the tempo scale falling from 1 to 0.5 over a minute, each pass through the cue must take longer than the one before. */
  tempoRampTest() {
    const score = DEMO_SCORES.lullaby;
    const tempo = { scaleAt: (t: number) => Math.max(0.5, 1 - 0.5 * (t / 60)) };
    const cur = new RunCursor(score, 0, tempo);
    const starts = cur.pull(200).filter((e) => e.pe.trackIndex === 0 && e.pe.note.t === 0).map((e) => e.time);
    const passSec = starts.slice(1).map((t, i) => t - starts[i]);
    return { passSec, passes: starts.length };
  },
  /** everything at once: 40 startle sounds stacked inside 300 ms on top of a full score; the master chain must still stay below 1.0. */
  async stressTest() {
    const r = await renderCustom({ seconds: 3 }, (c, g: AudioGraph) => {
      const ids = ['pop-balloon', 'honk', 'rumble', 'beep-car', 'boing', 'splash', 'bell', 'thud'];
      for (let k = 0; k < 40; k++) playSfxInto(c, g.sfx, 0.1 + (k % 10) * 0.03, ids[k % ids.length], { gain: 1.5, seed: k });
      scheduleScore(c, g, DEMO_SCORES.city, 3, {});
    });
    return summarize('stress', r, { wav: false });
  },
};

(window as any).LA = LA;
