// The real Instrument + nativeStream path, in the real Windows app:
//   npx vite --config native-audio-lab.vite.config.mjs, then http://localhost:3196/native-audio-lab.html
import { Instrument } from './services/melos/beats/engine/InstrumentHost';
import { openNativeTrack, type NativeTrack } from './services/melos/beats/engine/nativeStream';

const out = document.getElementById('out')!;
const LEVEL = 0.02;
const LOOKAHEAD = 0.15;

interface RunOptions { tracks?: number; voices?: number; seconds?: number; native?: boolean; capture?: boolean }

async function run({ tracks = 8, voices = 8, seconds = 10, native = true, capture = false }: RunOptions = {}) {
  localStorage.setItem('chora.nativeEngine', native ? 'on' : 'off');
  const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  await ctx.resume();
  const master = ctx.createGain();
  master.gain.value = LEVEL / tracks;
  master.connect(ctx.destination);
  const insts: Instrument[] = [];
  const natives: NativeTrack[] = [];
  for (let t = 0; t < tracks; t++) {
    const inst = await Instrument.create(ctx);
    await inst.whenReady();
    inst.output.connect(master);
    if (native) {
      const n = await openNativeTrack(ctx);
      if (!n) throw new Error('native engine did not open');
      inst.attachNative(n);
      natives.push(n);
    }
    inst.setParam(1704, 1);
    insts.push(inst);
  }

  // Same shape as the scheduler: chords posted ~130 ms ahead on a timer.
  const start = ctx.currentTime + 0.3;
  const end = start + seconds;
  let chord = 0;
  const timer = setInterval(() => {
    while (start + chord * 0.5 < Math.min(end, ctx.currentTime + LOOKAHEAD)) {
      const at = start + chord * 0.5;
      insts.forEach((inst, t) => {
        for (let v = 0; v < voices; v++) {
          const id = inst.noteOn(36 + (t * 5 + v * 7 + chord * 2) % 48, 0.8, at, ctx.currentTime, ctx.sampleRate);
          inst.noteOffAt(id, at + 0.45);
        }
      });
      chord++;
    }
  }, 25);

  let peak = 0;
  let meter: AnalyserNode | null = null;
  if (capture) {
    meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    insts[0].output.connect(meter);
  }
  const buf = new Float32Array(2048);
  const load: number[] = [];
  const cap = (ctx as any).renderCapacity;
  cap?.addEventListener?.('update', (e: any) => load.push(e.averageLoad));
  cap?.start?.({ updateInterval: 1 });
  const stats0 = (ctx as any).playbackStats?.toJSON?.() ?? null;
  const began = performance.now();
  while (performance.now() - began < (seconds + 1) * 1000) {
    await new Promise((r) => setTimeout(r, 40));
    if (meter) {
      meter.getFloatTimeDomainData(buf);
      for (const x of buf) peak = Math.max(peak, Math.abs(x));
    }
  }
  clearInterval(timer);
  cap?.stop?.();
  const stats1 = (ctx as any).playbackStats?.toJSON?.() ?? null;
  const report = {
    native, tracks, voices, seconds,
    sentNotes: natives.reduce((a, n) => a + n.sentNotes, 0),
    missedFrames: natives.reduce((a, n) => a + n.stats.missed, 0),
    lateFrames: natives.reduce((a, n) => a + n.stats.late, 0),
    chunks: natives.reduce((a, n) => a + n.stats.chunks, 0),
    minLeadFrames: natives.length ? Math.min(...natives.map((n) => n.stats.minLead)) : null,
    trackPeak: capture ? peak : null,
    audioThreadLoad: load.length ? load.reduce((a, b) => a + b, 0) / load.length : null,
    playbackStats0: stats0,
    playbackStats1: stats1,
  };
  for (const inst of insts) inst.dispose();
  await ctx.close();
  out.textContent = JSON.stringify(report, null, 1);
  return report;
}

(window as any).lab = { run };
out.textContent = (window as any).chrome?.webview ? 'ready' : 'not in the Windows app: the native path needs chrome.webview';
