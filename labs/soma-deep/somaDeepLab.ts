// SOMA deep-skin lab: the same strike rendered through the real worklet engine with the CPU
// noise cloud (deep off) and with the GPU deep skin (deep on), measured and drawn side by side,
// plus a warm-up benchmark across every preset. Results land on window.somaDeepLab.
import { Instrument, getModule } from '../../services/melos/beats/engine/InstrumentHost';
import { SOMA_PRESETS, type SomaPreset } from '../../services/melos/instruments/soma/presets';
import { applySomaPatch, newSomaPatch, somaEngineParams } from '../../services/melos/instruments/soma/patch';
import { requestDeep, somaDeepStats, somaParamsKey } from '../../services/melos/instruments/soma/deep/somaDeep';
import { besselZeros } from '../../services/melos/instruments/soma/deep/deepModes';

const SR = 48000;
const $ = (id: string) => document.getElementById(id)!;
const log = (s: string) => { $('log').textContent += s + '\n'; };
const lab: Record<string, unknown> = { ab: [] as unknown[], wavs: {} as Record<string, string> };
(window as unknown as { somaDeepLab: unknown }).somaDeepLab = lab;

const setDeep = (on: boolean) => { try { localStorage.setItem('chora.somaDeep', on ? 'on' : 'off'); } catch { /* private mode */ } };

/** One strike of `preset`, rendered offline through the engine. `dry` mutes the Veil. */
async function strike(preset: SomaPreset, deep: boolean, dry: boolean, seconds = 1.6, vel = 0.85): Promise<AudioBuffer> {
  setDeep(deep);
  const off = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const inst = await Instrument.create(off);
  await inst.whenReady();
  inst.output.connect(off.destination);
  applySomaPatch(inst, newSomaPatch(preset));
  if (dry) inst.setParam(1207, 0);
  inst.resetTransport(0);
  inst.clearSchedule();
  if (deep) await inst.warmSomaDeep([preset.defaultNote]);
  const id = inst.scheduleNoteOn(preset.defaultNote, vel, 64);
  inst.scheduleNoteOff(id, Math.round(0.3 * SR));
  await inst.flush();
  const buf = await off.startRendering();
  inst.dispose();
  return buf;
}

// ── analysis ──────────────────────────────────────────────────────────────────────────────
function fftMag(x: Float32Array, start: number, n: number): Float32Array {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(a * k), wi = Math.sin(a * k);
      const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
      re[i + k] += xr; im[i + k] += xi;
    }
  }
  const m = new Float32Array(n / 2);
  for (let k = 0; k < n / 2; k++) m[k] = Math.hypot(re[k], im[k]);
  return m;
}

function mono(b: AudioBuffer): Float32Array {
  const l = b.getChannelData(0), r = b.getChannelData(1), o = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) o[i] = 0.5 * (l[i] + r[i]);
  return o;
}

/** Band energy (dB) above 2 kHz at a few times, spectral peakiness 2–10 kHz at 30 ms. */
function metrics(b: AudioBuffer) {
  const x = mono(b), N = 2048, hz = SR / N;
  const at = (ms: number) => fftMag(x, Math.round((ms / 1000) * SR), N);
  const band = (m: Float32Array, lo: number, hi: number) => { let e = 0; for (let k = Math.ceil(lo / hz); k < hi / hz; k++) e += m[k] * m[k]; return 10 * Math.log10(e + 1e-20); };
  const hf: Record<string, number> = {};
  for (const ms of [5, 20, 50, 100, 200]) hf[`${ms}ms`] = +band(at(ms), 2000, 16000).toFixed(1);
  const m30 = at(30);
  let mx = 0, sum = 0, n = 0;
  for (let k = Math.ceil(2000 / hz); k < 10000 / hz; k++) { mx = Math.max(mx, m30[k]); sum += m30[k]; n++; }
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  return { peak: +peak.toFixed(3), hfDb: hf, hfCrestDb30ms: +(20 * Math.log10(mx / (sum / n + 1e-20))).toFixed(1) };
}

function spectrogram(canvas: HTMLCanvasElement, b: AudioBuffer, title: string) {
  const x = mono(b), N = 1024, hop = 256, cols = Math.floor(Math.min(x.length, 0.5 * SR) / hop), rows = 256;
  canvas.width = cols; canvas.height = rows;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(cols, rows);
  for (let c = 0; c < cols; c++) {
    const m = fftMag(x, c * hop, N);
    for (let r = 0; r < rows; r++) {
      const f = Math.pow(16000 / 40, r / rows) * 40; // log frequency axis
      const db = 20 * Math.log10(m[Math.round(f / (SR / N))] + 1e-9);
      const v = Math.max(0, Math.min(1, (db + 70) / 70));
      const o = ((rows - 1 - r) * cols + c) * 4;
      img.data[o] = 255 * Math.min(1, v * 1.6); img.data[o + 1] = 255 * v * v; img.data[o + 2] = 80 + 120 * v; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#fff'; g.font = '11px system-ui'; g.fillText(title, 4, 12);
}

function wavBase64(b: AudioBuffer): string {
  const n = b.length, ch = 2, data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, SR, true); data.setUint32(28, SR * ch * 2, true);
  data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const L = b.getChannelData(0), R = b.getChannelData(1);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) data.setInt16(44 + (i * 2 + c) * 2, Math.max(-1, Math.min(1, (c ? R : L)[i])) * 32767, true);
  let s = ''; const u8 = new Uint8Array(data.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// ── runs ──────────────────────────────────────────────────────────────────────────────────
async function abPreset(preset: SomaPreset) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<h3>${preset.name}</h3>`;
  $('ab').appendChild(row);
  const out: Record<string, unknown> = { preset: preset.name };
  for (const [deep, label] of [[false, 'cpu cloud'], [true, 'gpu deep']] as const) {
    const dryBuf = await strike(preset, deep, true);
    const wet = await strike(preset, deep, false);
    out[label] = metrics(dryBuf);
    const c = document.createElement('canvas');
    row.appendChild(c);
    spectrogram(c, dryBuf, `${label} (dry)`);
    const a = document.createElement('audio');
    a.controls = true;
    a.src = `data:audio/wav;base64,${wavBase64(wet)}`;
    row.appendChild(a);
    (lab.wavs as Record<string, string>)[`${preset.id}-${deep ? 'deep' : 'cloud'}`] = wavBase64(wet);
  }
  (lab.ab as unknown[]).push(out);
  log(JSON.stringify(out));
}

async function bench() {
  const t0 = performance.now();
  besselZeros();
  const tZeros = performance.now() - t0;
  const t1 = performance.now();
  await Promise.all(SOMA_PRESETS.map((p) => {
    const params = new Map(somaEngineParams(newSomaPatch(p)));
    return requestDeep(params, somaParamsKey(params), p.defaultNote, SR, getModule);
  }));
  const ms = performance.now() - t1;
  const st = somaDeepStats();
  lab.bench = { presets: SOMA_PRESETS.length, strikes: st.hits, totalMs: Math.round(ms), zerosMs: Math.round(tZeros), ...st };
  log(`warm-up: ${SOMA_PRESETS.length} presets × 16 strikes = ${st.hits} deep strikes in ${ms.toFixed(0)} ms (${st.batches} GPU batches, last ${st.lastBatchHits} strikes / ${st.lastModes} modes in ${st.lastBatchMs.toFixed(0)} ms) on ${st.gpu}; cache ${st.cacheMB.toFixed(1)} MB`);
}

/** The live path: a realtime context, an audition key that misses (CPU cloud, asks for the layer),
 *  then the same key once the layer is in — which must go out as a deep note-on and sound. */
async function liveCheck(preset: SomaPreset) {
  setDeep(true);
  const ctx = new AudioContext({ sampleRate: SR });
  await ctx.resume();
  const inst = await Instrument.create(ctx);
  await inst.whenReady();
  inst.output.connect(ctx.destination);
  applySomaPatch(inst, newSomaPatch(preset));
  const sent: string[] = [];
  const port = inst.node.port;
  const post = port.postMessage.bind(port);
  port.postMessage = ((m: { type: string }, t?: Transferable[]) => { sent.push(m.type); return post(m, t as Transferable[]); }) as typeof port.postMessage;
  const note = preset.defaultNote + 3; // a note the A/B renders didn't warm
  const t0 = performance.now();
  inst.noteOn(note, 0.8);
  let waited = 0;
  while ((somaDeepStats().pending > 0 || waited < 50) && waited < 10000) { await new Promise((r) => setTimeout(r, 25)); waited += 25; }
  const readyMs = performance.now() - t0;
  inst.noteOn(note, 0.8);
  await new Promise((r) => setTimeout(r, 120));
  const wave = new Float32Array(1024);
  const peak = inst.readWaveform(wave);
  lab.live = { first: sent.includes('noteOn') ? 'noteOn (cloud)' : sent[0], second: sent.includes('noteOnDeep') ? 'noteOnDeep' : 'missing', layerReadyMs: Math.round(readyMs), peakAfterDeep: +peak.toFixed(3), slotUploads: sent.filter((s) => s === 'loadSample').length, ctxState: ctx.state };
  log(`live: ${JSON.stringify(lab.live)}`);
  inst.dispose();
  await ctx.close();
}

async function main() {
  const q = new URLSearchParams(location.search);
  const ids = (q.get('presets') ?? '').split(',').filter(Boolean);
  const picks = ids.length ? SOMA_PRESETS.filter((p) => ids.includes(p.id)) : [SOMA_PRESETS[0], SOMA_PRESETS[6], SOMA_PRESETS[12], SOMA_PRESETS[25], SOMA_PRESETS[30]].filter(Boolean) as SomaPreset[];
  lab.gpu = !!(navigator as Navigator & { gpu?: unknown }).gpu;
  if (q.get("ab") !== "0") for (const p of picks) await abPreset(p);
  await liveCheck(picks[0]);
  if (q.get('bench') !== '0') await bench();
  setDeep(true);
  lab.done = true;
  log('done');
}

main().catch((e) => { log(String(e?.stack ?? e)); lab.error = String(e); });
