// Airwindows lab (http://127.0.0.1:3195/airwindows-lab.html).
//   Offline check — every effect through the REAL AirwindowsNode in an OfflineAudioContext, compared
//     with the bare wasm run on the main thread (same seeds, same 128-frame quanta). A match proves
//     the worklet, the ABI and the wiring; "wet" proves it is in the path, not passing through.
//     It also bounces one FxChainHost the way render.ts does (airwindowsSettled before rendering).
//   Live rack — the real FxRack (Airwindows section in Add FX) on a synthesized drum loop.
// window.awLab exposes results and controls for driving from devtools.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import wasmUrl from '../../services/melos/beats/engine/dsp/plajah_airwindows.wasm?url';
import { AIRWINDOWS, AirwindowsNode, airwindowsSettled, airwindowsType, type AirwindowsEffect } from '../../services/melos/beats/fx/airwindows';
import { FxChainHost, newInstance, type FxInstance } from '../../services/melos/beats/fx/devices';
import { FxRack } from '../../components/melos/beats/project/FxRack';

const SR = 48000;
const SEEDS = { l: 2463534242, r: 88675123 };

function testSignal(frames: number): [Float32Array, Float32Array] {
  const l = new Float32Array(frames), r = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / SR, beat = t % 0.25;
    const kick = Math.exp(-beat * 18) * Math.sin(2 * Math.PI * (50 + 140 * Math.exp(-beat * 40)) * beat);
    const ramp = 0.1 + 0.9 * (i / frames);
    l[i] = ramp * (0.5 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 2750 * t)) + 0.7 * kick;
    r[i] = ramp * (0.5 * Math.sin(2 * Math.PI * 165 * t) + 0.2 * Math.sin(2 * Math.PI * 4100 * t)) + 0.7 * kick;
  }
  return [l, r];
}

let modP: Promise<WebAssembly.Module> | null = null;
const wasmModule = () => (modP ??= fetch(wasmUrl).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b)));

async function bareWasm(e: AirwindowsEffect, values: number[], inL: Float32Array, inR: Float32Array) {
  const x = (await WebAssembly.instantiate(await wasmModule(), {})).exports as any;
  x.aw_init(e.kind, SR, SEEDS.l, SEEDS.r);
  values.forEach((v, i) => x.aw_set_param(i, v));
  const oL = new Float32Array(inL.length), oR = new Float32Array(inR.length);
  for (let off = 0; off < inL.length; off += 128) {
    const n = Math.min(128, inL.length - off);
    const l = new Float32Array(x.memory.buffer, x.aw_buf(0), 512), r = new Float32Array(x.memory.buffer, x.aw_buf(1), 512);
    l.set(inL.subarray(off, off + n)); r.set(inR.subarray(off, off + n));
    x.aw_process(n);
    oL.set(l.subarray(0, n), off); oR.set(r.subarray(0, n), off);
  }
  return [oL, oR];
}

interface Row { name: string; set: string; diff: number; wetDb: number; ms: number; ok: boolean }

async function offlineCase(e: AirwindowsEffect, values: number[], setName: string): Promise<Row> {
  const frames = SR; // 1 s
  const [inL, inR] = testSignal(frames);
  const ctx = new OfflineAudioContext(2, frames, SR);
  const buf = ctx.createBuffer(2, frames, SR);
  buf.copyToChannel(inL, 0); buf.copyToChannel(inR, 1);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const node = new AirwindowsNode(ctx, e, SEEDS);
  node.setParams(Object.fromEntries(e.params.map((p, i) => [p.key, values[i]])));
  src.connect(node.input); node.output.connect(ctx.destination);
  src.start(0);
  const t0 = performance.now();
  await airwindowsSettled(ctx);
  const out = await ctx.startRendering();
  const ms = performance.now() - t0;
  const [wL, wR] = await bareWasm(e, values, inL, inR);
  const gL = out.getChannelData(0), gR = out.getChannelData(1);
  let diff = 0, wet = 0, dryE = 0;
  for (let i = 0; i < frames; i++) {
    diff = Math.max(diff, Math.abs(gL[i] - wL[i]), Math.abs(gR[i] - wR[i]));
    wet += (gL[i] - inL[i]) ** 2 + (gR[i] - inR[i]) ** 2;
    dryE += inL[i] ** 2 + inR[i] ** 2;
  }
  const wetDb = 10 * Math.log10(Math.max(1e-30, wet / dryE));
  return { name: e.name, set: setName, diff, wetDb, ms, ok: diff < 1e-6 };
}

/** The render.ts path: a chain built from saved FxInstances, settled, bounced. */
async function chainBounce(): Promise<{ wetDb: number; ok: boolean }> {
  const frames = SR / 2;
  const [inL, inR] = testSignal(frames);
  const ctx = new OfflineAudioContext(2, frames, SR);
  const buf = ctx.createBuffer(2, frames, SR);
  buf.copyToChannel(inL, 0); buf.copyToChannel(inR, 1);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const host = new FxChainHost(ctx);
  const chain = ['aw.drumslam', 'aw.totape6', 'aw.galactic'].map((t) => newInstance(t)!);
  chain[0].params.A = 0.6;
  host.setChain(chain);
  src.connect(host.input); host.output.connect(ctx.destination); src.start(0);
  await airwindowsSettled(ctx);
  const out = await ctx.startRendering();
  let wet = 0, dryE = 0;
  const gL = out.getChannelData(0);
  for (let i = 0; i < frames; i++) { wet += (gL[i] - inL[i]) ** 2; dryE += inL[i] ** 2; }
  const wetDb = 10 * Math.log10(Math.max(1e-30, wet / dryE));
  return { wetDb, ok: wetDb > -40 };
}

function drumLoop(ctx: AudioContext): AudioBuffer {
  const bars = 2, bpm = 96, beat = 60 / bpm, len = Math.round(bars * 4 * beat * ctx.sampleRate);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  const L = b.getChannelData(0), R = b.getChannelData(1);
  let lcg = 1;
  const noise = () => ((lcg = (lcg * 1664525 + 1013904223) >>> 0) / 2 ** 31 - 1);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate, inBeat = t % beat, step = Math.floor(t / (beat / 2)) % 16;
    const kick = (step % 4 === 0 || step === 7 ? 1 : 0) * Math.exp(-(t % (beat / 2)) * 22) * Math.sin(2 * Math.PI * (48 + 110 * Math.exp(-(t % (beat / 2)) * 35)) * (t % (beat / 2)));
    const snare = (Math.floor(t / beat) % 2 === 1 ? 1 : 0) * Math.exp(-inBeat * 28) * (0.6 * noise() + 0.4 * Math.sin(2 * Math.PI * 190 * inBeat));
    const hat = Math.exp(-(t % (beat / 2)) * 90) * noise() * 0.25;
    const bass = 0.25 * Math.sin(2 * Math.PI * (step < 8 ? 55 : 49) * t) * (0.6 + 0.4 * Math.exp(-(t % (beat / 2)) * 6));
    L[i] = 0.8 * kick + 0.5 * snare + hat * 0.8 + bass;
    R[i] = 0.8 * kick + 0.5 * snare + hat * 1.2 + bass;
  }
  return b;
}

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [chain, setChain] = useState<{ wetDb: number; ok: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const [instances, setInstances] = useState<FxInstance[]>(() => [newInstance('aw.drumslam')!, newInstance('aw.totape6')!]);
  const [playing, setPlaying] = useState(false);
  const live = useRef<{ ctx: AudioContext; host: FxChainHost; src: AudioBufferSourceNode | null } | null>(null);

  const runOffline = async () => {
    setRunning(true); setRows([]);
    const out: Row[] = [];
    for (const e of AIRWINDOWS) {
      const sets: [string, number[]][] = [['default', e.params.map((p) => p.default)], ['scattered', e.params.map((_, i) => [0.73, 0.21, 0.88, 0.4, 0.62, 0.95, 0.3][i])]];
      for (const [name, v] of sets) { out.push(await offlineCase(e, v, name)); setRows([...out]); }
    }
    setChain(await chainBounce());
    setRunning(false);
  };

  useEffect(() => { void runOffline(); }, []);

  useEffect(() => { live.current?.host.setChain(instances); }, [instances]);

  const toggle = async () => {
    if (!live.current) {
      const ctx = new AudioContext({ sampleRate: SR });
      const host = new FxChainHost(ctx);
      host.output.connect(ctx.destination);
      host.setChain(instances);
      live.current = { ctx, host, src: null };
    }
    const L = live.current;
    if (playing) { L.src?.stop(); L.src = null; setPlaying(false); return; }
    await L.ctx.resume();
    const src = L.ctx.createBufferSource(); src.buffer = drumLoop(L.ctx); src.loop = true;
    src.connect(L.host.input); src.start(); L.src = src; setPlaying(true);
  };

  const summary = useMemo(() => {
    if (!rows.length) return '';
    const bad = rows.filter((r) => !r.ok);
    return `${rows.length - bad.length}/${rows.length} match the bare wasm` + (bad.length ? ` — MISMATCH: ${bad.map((b) => `${b.name}/${b.set}`).join(', ')}` : '');
  }, [rows]);

  (window as any).awLab = { rows, chain, summary, running, instances, setInstances, toggle, playing, live: live.current, types: AIRWINDOWS.map(airwindowsType) };

  return (
    <div className="min-h-screen text-white p-4 md:p-6 max-w-[1100px] mx-auto font-sans">
      <h1 className="text-lg font-extrabold">Airwindows in MEKA</h1>
      <p className="text-white/50 text-[12px] mb-4">Chris Johnson's effects (MIT), ported to Rust and run one-per-AudioWorklet. Each port matches the original C++ sample-for-sample (cargo test / wasm.test.mjs); this page checks the browser path.</p>

      <div className="grid md:grid-cols-[1fr_380px] gap-5">
        <section>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/40">Offline check · real AirwindowsNode vs bare wasm</h2>
            <button onClick={runOffline} disabled={running} className="ml-auto h-6 px-2.5 rounded-lg text-[10px] font-semibold border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-40">{running ? 'Running…' : 'Re-run'}</button>
          </div>
          <div id="summary" className="text-[12px] mb-2 text-[#7FD1AE]">{summary}</div>
          {chain && <div id="chain" className="text-[12px] mb-2 text-white/70">FxChainHost bounce (DrumSlam → ToTape6 → Galactic, settled then rendered): difference from dry {chain.wetDb.toFixed(1)} dB — {chain.ok ? 'effects printed' : 'PRINTED DRY'}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] tabular-nums">
              <thead><tr className="text-left text-white/40"><th className="py-1 pr-3">Effect</th><th className="pr-3">Params</th><th className="pr-3">max |node − wasm|</th><th className="pr-3">wet vs dry</th><th>render</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name + r.set} className="border-t border-white/[0.06]">
                    <td className="py-1 pr-3 font-semibold">{r.name}</td>
                    <td className="pr-3 text-white/50">{r.set}</td>
                    <td className={`pr-3 ${r.ok ? 'text-[#7FD1AE]' : 'text-[#FF5A5A]'}`}>{r.diff.toExponential(1)}</td>
                    <td className="pr-3 text-white/70">{r.wetDb.toFixed(1)} dB</td>
                    <td className="text-white/40">{r.ms.toFixed(0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/40">Live rack</h2>
            <button id="play" onClick={toggle} className="ml-auto h-7 px-3 rounded-lg text-[11px] font-bold bg-[#7FD1AE] text-black">{playing ? 'Stop loop' : 'Play drum loop'}</button>
          </div>
          <div className="rounded-[14px] border border-white/10 bg-white/[0.03] p-3">
            <FxRack instances={instances} onChange={setInstances} title="Inserts" accent="#7FD1AE" nodeOf={(id) => live.current?.host.nodeOf(id)} />
          </div>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
