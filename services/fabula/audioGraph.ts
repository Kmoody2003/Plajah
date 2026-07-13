// Fabula per-clip / per-track audio DSP graph.
//
// Timeline audio (audio-track clips + the linked audio of `av` video clips) plays through a
// <audio> element. This routes that element through a Web Audio chain so the editor can apply
// real-time gain, pan, a 5-band EQ, and a compressor — at BOTH the clip and the track stage,
// exactly like a Resolve/Premiere channel strip:
//
//   MediaElement → [clip EQ ×5] → [clip comp] → clip makeup
//                → [track EQ ×5] → [track comp] → track makeup → pan → gain → destination
//
// Only one clip is live per audio track at a time (see renderMonitor), so a single strip per
// track element is sufficient. Graphs are keyed by element (WeakMap) so we never build the
// MediaElementSource twice (which throws) and dead elements get collected.

export const EQ_BANDS: { f: number; type: BiquadFilterType; q?: number }[] = [
  { f: 80, type: 'lowshelf' },
  { f: 250, type: 'peaking', q: 1 },
  { f: 1000, type: 'peaking', q: 1 },
  { f: 4000, type: 'peaking', q: 1 },
  { f: 12000, type: 'highshelf' },
];

export const EQ_LABELS = ['80', '250', '1k', '4k', '12k'];

export interface CompSettings { on: boolean; threshold: number; ratio: number; attack: number; release: number; knee: number; makeup: number; }
export interface ClipAudio { vol: number; eq: number[]; comp: CompSettings; }
export interface TrackAudio { vol?: number; pan?: number; mute?: boolean; eq?: number[]; comp?: Partial<CompSettings>; }

export const COMP_DEFAULT: CompSettings = { on: false, threshold: -24, ratio: 3, attack: 0.003, release: 0.25, knee: 30, makeup: 0 };
export const CLIP_AUDIO_DEFAULT: ClipAudio = { vol: 1, eq: [0, 0, 0, 0, 0], comp: { ...COMP_DEFAULT } };

let _ctx: AudioContext | null = null;
export function getAudioCtx(): AudioContext | null {
  if (_ctx) return _ctx;
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return null;
    // DAW-grade context: 48kHz pro rate + interactive latency hint (smallest safe buffer the
    // browser will give us → lowest round-trip). Falls back to defaults if the UA rejects them.
    try { _ctx = new Ctx({ latencyHint: 'interactive', sampleRate: 48000 }); }
    catch { _ctx = new Ctx(); }
    installResumeOnGesture(_ctx);
    return _ctx;
  } catch { return null; }
}

/** Live engine telemetry for the mixing-console readout. */
export function audioEngineInfo(): { sampleRate: number; baseLatencyMs: number; outputLatencyMs: number; maxChannels: number; state: string } {
  const c = _ctx;
  if (!c) return { sampleRate: 0, baseLatencyMs: 0, outputLatencyMs: 0, maxChannels: 0, state: 'none' };
  return {
    sampleRate: c.sampleRate,
    baseLatencyMs: Math.round(((c as any).baseLatency || 0) * 100000) / 100,
    outputLatencyMs: Math.round(((c as any).outputLatency || 0) * 100000) / 100,
    maxChannels: c.destination.maxChannelCount || 2,
    state: c.state,
  };
}

/** Output devices (audiooutput). Needs one prior mic/permission grant to expose labels. */
export async function listOutputDevices(): Promise<{ deviceId: string; label: string }[]> {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === 'audiooutput').map((d) => ({ deviceId: d.deviceId, label: d.label || `Output ${d.deviceId.slice(0, 6)}` }));
  } catch { return []; }
}

/** Route the whole engine to a specific hardware output (Chromium: AudioContext.setSinkId). */
export async function setOutputDevice(sinkId: string): Promise<boolean> {
  try {
    if (_ctx && typeof (_ctx as any).setSinkId === 'function') { await (_ctx as any).setSinkId(sinkId); return true; }
    return false;
  } catch (e) { console.warn('[audioGraph] setSinkId failed', e); return false; }
}

/** Request N-channel output when the hardware supports it (surround interfaces). */
export function setOutputChannels(n: number): number {
  if (!_ctx) return 0;
  const max = _ctx.destination.maxChannelCount || 2;
  const want = Math.max(1, Math.min(n, max));
  try { _ctx.destination.channelCount = want; _ctx.destination.channelInterpretation = 'discrete'; } catch { /* */ }
  return want;
}

// A MediaElementSource routes the element's audio THROUGH the context, so if the context is
// suspended (browsers start it suspended until a user gesture) nothing is audible — that made all
// timeline audio go silent once the DSP graph was introduced. Resume on any interaction so audio
// always plays. Kept until the context is running, then the listeners self-remove.
export function resumeAudioCtx() { if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {}); }
function installResumeOnGesture(ctx: AudioContext) {
  const evs = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];
  const resume = () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ctx.state === 'running') evs.forEach((e) => window.removeEventListener(e, resume, true));
  };
  evs.forEach((e) => window.addEventListener(e, resume, { capture: true, passive: true }));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dbToGain = (db: number) => Math.pow(10, (db || 0) / 20);

interface Graph {
  ctx: AudioContext;
  clipEq: BiquadFilterNode[]; trackEq: BiquadFilterNode[];
  clipComp: DynamicsCompressorNode; clipMk: GainNode;
  trackComp: DynamicsCompressorNode; trackMk: GainNode;
  pan: StereoPannerNode | null; gain: GainNode; analyser: AnalyserNode;
  resume(): void;
  apply(clip: ClipAudio | undefined, track: TrackAudio | undefined): void;
  level(): number; // instantaneous peak 0..1 (post-fader)
}

// trackId → live peak sampler, so the timeline's per-track meters can read the audible level
// without re-plumbing the graph up into React. Populated by AudioLayer while a clip is live.
// 'master' is always the master-bus meter once the engine is running.
export const meterRegistry = new Map<string, () => number>();

// ---- master bus: every channel strip sums here, then one path to the hardware ----
//   strip → masterGain → [brickwall limiter] → masterAnalyser → ctx.destination
let _master: { input: GainNode; gain: GainNode; limiter: DynamicsCompressorNode; makeup: GainNode; analyser: AnalyserNode; limiterOn: boolean } | null = null;
function getMasterBus(ctx: AudioContext) {
  if (_master) return (_master as any); // strips connect to .input
  const input = ctx.createGain();       // sum point — strips connect here
  const gain = ctx.createGain();        // master fader
  // Brickwall limiter: catches inter-track sum peaks so the master never clips → clean output.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.05; limiter.knee.value = 0;
  const makeup = ctx.createGain(); makeup.gain.value = 1;
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;
  input.connect(gain); gain.connect(limiter); limiter.connect(makeup); makeup.connect(analyser); analyser.connect(ctx.destination);
  const buf = new Float32Array(analyser.fftSize);
  meterRegistry.set('master', () => {
    try { analyser.getFloatTimeDomainData(buf); let p = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; } return p; } catch { return 0; }
  });
  _master = { input, gain, limiter, makeup, analyser, limiterOn: true };
  return (_master as any);
}
/** Master fader (0..1.5). */
export function setMasterGain(v: number) { if (_master) _master.gain.gain.value = Math.max(0, v); }
/** Bypass/engage the brickwall limiter (re-patch gain → limiter or gain → makeup). */
export function setMasterLimiter(on: boolean) {
  if (!_master) return; if (_master.limiterOn === on) return;
  const m = _master; m.limiterOn = on;
  try { m.gain.disconnect(); m.limiter.disconnect(); } catch { /* */ }
  if (on) { m.gain.connect(m.limiter); m.limiter.connect(m.makeup); }
  else { m.gain.connect(m.makeup); }
}
/** True post-limiter gain reduction in dB (for the master GR meter). */
export function masterReduction(): number { return _master ? (_master.limiter.reduction || 0) : 0; }

// A cross-origin media element WITHOUT CORS credentials is "tainted": routing it through
// createMediaElementSource plays SILENCE by spec (no error). Cloud-synced assets live on
// firebasestorage.googleapis.com, so every synced clip went mute through the mixer. Elements
// feeding the mixer must load with crossOrigin="anonymous"; this tells callers when that matters.
export const needsCors = (url: string | null | undefined): boolean =>
  !!url && /^https?:/i.test(url) && (() => { try { return new URL(url, window.location.href).origin !== window.location.origin; } catch { return false; } })();

export function engineStatus() {
  return { state: _ctx?.state || 'none', sampleRate: _ctx?.sampleRate || 0, master: !!_master };
}

const graphs = new WeakMap<HTMLMediaElement, Graph | null>();

function applyBand(nodes: BiquadFilterNode[], eq: number[] | undefined) {
  const g = eq || [];
  nodes.forEach((n, i) => { n.gain.value = clamp(g[i] || 0, -24, 24); });
}
function applyComp(comp: DynamicsCompressorNode, makeup: GainNode, c: Partial<CompSettings> | undefined) {
  if (c && c.on) {
    comp.threshold.value = clamp(c.threshold ?? -24, -100, 0);
    comp.ratio.value = clamp(c.ratio ?? 3, 1, 20);
    comp.attack.value = clamp(c.attack ?? 0.003, 0, 1);
    comp.release.value = clamp(c.release ?? 0.25, 0, 1);
    comp.knee.value = clamp(c.knee ?? 30, 0, 40);
    makeup.gain.value = dbToGain(c.makeup ?? 0);
  } else {
    // Bypass: unity ratio = no gain reduction, no makeup.
    comp.threshold.value = 0; comp.ratio.value = 1; comp.knee.value = 0; makeup.gain.value = 1;
  }
}

/** Attach (or reuse) the DSP strip for a media element. Returns null if Web Audio is
 *  unavailable or the element is already sourced elsewhere — callers fall back to element.volume. */
export function attachAudioGraph(el: HTMLMediaElement): Graph | null {
  if (graphs.has(el)) return graphs.get(el) || null;
  const ctx = getAudioCtx();
  if (!ctx) { graphs.set(el, null); return null; }
  let source: MediaElementAudioSourceNode;
  try { source = ctx.createMediaElementSource(el); }
  catch { graphs.set(el, null); return null; } // already connected — leave the element's own output intact
  const mkEq = () => EQ_BANDS.map((b) => { const f = ctx.createBiquadFilter(); f.type = b.type; f.frequency.value = b.f; f.Q.value = b.q || 1; f.gain.value = 0; return f; });
  const clipEq = mkEq(), trackEq = mkEq();
  const clipComp = ctx.createDynamicsCompressor(), clipMk = ctx.createGain();
  const trackComp = ctx.createDynamicsCompressor(), trackMk = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;
  const master = getMasterBus(ctx);
  const chain: AudioNode[] = [source, ...clipEq, clipComp, clipMk, ...trackEq, trackComp, trackMk, ...(pan ? [pan] : []), gain, analyser, master.input];
  try { for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]); }
  catch { try { source.connect(master.input); } catch { /* last resort — still audible */ } }
  const buf = new Float32Array(analyser.fftSize);
  const g: Graph = {
    ctx, clipEq, trackEq, clipComp, clipMk, trackComp, trackMk, pan, gain, analyser,
    resume() { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    level() { try { analyser.getFloatTimeDomainData(buf); let peak = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; } return peak; } catch { return 0; } },
    apply(clip, track) {
      applyBand(clipEq, clip?.eq); applyComp(clipComp, clipMk, clip?.comp);
      applyBand(trackEq, track?.eq); applyComp(trackComp, trackMk, track?.comp);
      if (pan) pan.pan.value = clamp(track?.pan || 0, -1, 1);
      const cv = clip?.vol == null ? 1 : clip.vol;
      const tv = track?.vol == null ? 1 : track.vol;
      gain.gain.value = track?.mute ? 0 : Math.max(0, cv) * Math.max(0, tv);
    },
  };
  graphs.set(el, g);
  return g;
}
