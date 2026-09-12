// Melos Beats — the audio graph. Built against BaseAudioContext so the live engine and the
// offline bounce (render.ts) share one construction path and therefore one sound:
//
//   voice → pad strip [Biquad(off|LP|HP) → padGain → StereoPanner] → group bus A–D
//   arrangement audio track → trackGain → trackPan ────────────────→ master input
//   group bus [Gain × mute/solo] → master input
//   master: input → glue comp (default OFF) → fader → limiter(-1dB brickwall) → analyser → out
//
// Node recipes follow services/fabula/audioGraph.ts (master/limiter/meters) — its
// WeakMap-per-media-element design doesn't transplant, the recipes do.

import type { GrooveDoc, PadConfig, ArrangeTrack } from '../grooveDoc';

export const dbToGain = (db: number) => Math.pow(10, (db || 0) / 20);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Master safety limiter as a WaveShaper soft-clip curve, NOT a DynamicsCompressor.
 *
 * The old DynamicsCompressorNode limiter (ratio 20, thr -1 dB) crushed EVERYTHING — a single
 * -6 dBFS kick came out 12 dB down, and layering a kick+snare+clap ducked to under half level,
 * because that node reduces broadband and pumps on transients. A memoryless soft-clipper leaves
 * the body untouched (linear up to ~-4.4 dB), applies a tanh knee into a -1 dBFS ceiling, and
 * has no time-varying gain — so layers stay full and a neighbouring hit can't pump the kick.
 */
export function softClipCurve(ceilingDb = -1, n = 4096): Float32Array {
  const ceil = Math.pow(10, ceilingDb / 20);
  const knee = 0.6;              // linear below this |x|, tanh knee above
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / Math.max(1e-6, ceil - knee));
    curve[i] = Math.sign(x) * Math.min(ceil, y);
  }
  return curve;
}

/** A channel's insert + send tail — every mixer channel (pad, track, bus) has one. */
export interface ChannelFx {
  tap: GainNode;              // post-insert point; the dry-out and the sends both leave here
  sends: GainNode[];          // one per send bus
  insIn: AudioNode | null;    // insert chain in/out, or null = no insert
  insOut: AudioNode | null;
}

export interface PadStrip extends ChannelFx {
  input: GainNode;            // voices connect here
  filter: BiquadFilterNode;   // 'off' routes around it
  gain: GainNode;
  pan: StereoPannerNode;
  filterOn: boolean;
  group: number;              // current bus routing, so an insert repatch keeps the destination
  analyser: AnalyserNode;     // per-pad meter tap
}

export interface TrackStrip extends ChannelFx {
  gain: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode;
}

/** A send/return bus (FX 1, FX 2): channels send into it, it carries its own insert FX. */
export interface SendBus {
  input: GainNode;
  gain: GainNode;
  analyser: AnalyserNode;
  insIn: AudioNode | null;
  insOut: AudioNode | null;
}

export const SEND_COUNT = 2;

export interface BeatsGraph {
  ctx: BaseAudioContext;
  pads: PadStrip[];                       // 16
  groups: GainNode[];                     // 4 — the bus input (pads feed here)
  groupAnalysers: AnalyserNode[];         // post-insert, pre-master
  sendBuses: SendBus[];                   // FX 1, FX 2
  tracks: Map<string, TrackStrip>;        // ArrangeTrack.id → strip (audio tracks)
  master: {
    input: GainNode;
    glue: DynamicsCompressorNode; glueOn: boolean;
    fader: GainNode;
    limiter: WaveShaperNode; limiterOn: boolean;  // soft-clip brickwall — see softClipCurve()
    makeup: GainNode;
    analyser: AnalyserNode;
    eqIn: AudioNode | null;   // Spectra EQ insert (pre-fader), or null = no insert
    eqOut: AudioNode | null;
    chainIn: AudioNode | null;  // mastering chain insert (post-EQ, pre-glue), or null
    chainOut: AudioNode | null;
    suiteIn: AudioNode | null;  // unified FX "Suite" insert (post-pressing, pre-glue), or null
    suiteOut: AudioNode | null;
  };
  applyDoc(doc: GrooveDoc): void;         // idempotent — push mixer/pad params into the nodes
  padDestination(padIdx: number): AudioNode;
  trackDestination(track: ArrangeTrack): AudioNode;
  /** Insert a device (Spectra EQ) on the mix bus, pre-fader. Passing the same nodes is idempotent. */
  setMasterEq(input: AudioNode, output: AudioNode): void;
  clearMasterEq(): void;
  /** Insert the mastering chain after the EQ, before glue/fader/limiter. Idempotent like setMasterEq. */
  setMasterChain(input: AudioNode, output: AudioNode): void;
  clearMasterChain(): void;
  /** Insert the unified FX Suite after the pressing, before glue/fader/limiter. */
  setMasterSuite(input: AudioNode, output: AudioNode): void;
  clearMasterSuite(): void;
  /** Toggle the glue compressor in/out of the master path (the mastering state owns this). */
  setGlueOn(on: boolean): void;
  /** Insert a device chain on a pad channel (post-pan, pre-bus). */
  setPadInsert(padIdx: number, input: AudioNode, output: AudioNode): void;
  clearPadInsert(padIdx: number): void;
  setPadSend(padIdx: number, sendIdx: number, level: number): void;
  /** Insert a device chain on an arrangement track channel. */
  setTrackInsert(trackId: string, input: AudioNode, output: AudioNode): void;
  clearTrackInsert(trackId: string): void;
  setTrackSend(trackId: string, sendIdx: number, level: number): void;
  /** Per-pad / per-track live peak, for the mixer meters. */
  padMeter(padIdx: number): number;
  trackMeter(trackId: string): number;
  /** Insert a device chain on a group bus (post-gain, pre-send-tap). Idempotent. */
  setGroupInsert(groupIdx: number, input: AudioNode, output: AudioNode): void;
  clearGroupInsert(groupIdx: number): void;
  /** A group's send level to a send bus (0 = off). */
  setGroupSend(groupIdx: number, sendIdx: number, level: number): void;
  /** Insert a device chain on a send/return bus. */
  setSendInsert(sendIdx: number, input: AudioNode, output: AudioNode): void;
  clearSendInsert(sendIdx: number): void;
  setSendReturnGain(sendIdx: number, db: number): void;
  /** Live peak of each send bus, for the mixer meters. */
  sendMeters(): number[];
  meters(): { groups: number[]; master: number; sends: number[] };
  limiterReduction(): number;
  dispose(): void;
}

function peakOf(analyser: AnalyserNode, buf: Float32Array): number {
  try {
    analyser.getFloatTimeDomainData(buf);
    let p = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
    return p;
  } catch { return 0; }
}

export function buildGraph(ctx: BaseAudioContext, padCount = 16, output: AudioNode = ctx.destination): BeatsGraph {
  // ---- master ----
  const input = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18; glue.knee.value = 12; glue.ratio.value = 2.5;
  glue.attack.value = 0.01; glue.release.value = 0.18;
  const fader = ctx.createGain();
  // Soft-clip brickwall (was a DynamicsCompressor that crushed the whole mix and pumped on
  // transients — the "can't layer drums / neighbour changes the kick" bug). Memoryless, so it
  // only shapes peaks at the ceiling and never ducks the body.
  const limiter = ctx.createWaveShaper();
  limiter.oversample = '4x';
  limiter.curve = softClipCurve(-1);
  const makeup = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;

  // Default patch: input → fader → limiter → makeup → analyser → destination (glue off).
  input.connect(fader); fader.connect(limiter); limiter.connect(makeup);
  makeup.connect(analyser); analyser.connect(output);

  const master = {
    input, glue, glueOn: false, fader, limiter, limiterOn: true, makeup, analyser,
    eqIn: null as AudioNode | null, eqOut: null as AudioNode | null,
    chainIn: null as AudioNode | null, chainOut: null as AudioNode | null,
    suiteIn: null as AudioNode | null, suiteOut: null as AudioNode | null,
  };

  const repatchMaster = () => {
    try { input.disconnect(); glue.disconnect(); fader.disconnect(); limiter.disconnect(); master.eqOut?.disconnect(); master.chainOut?.disconnect(); master.suiteOut?.disconnect(); } catch { /* */ }
    // input → [Spectra EQ] → [mastering chain] → [FX Suite] → glue? → fader → limiter? → makeup
    let node: AudioNode = input;
    if (master.eqIn && master.eqOut) { node.connect(master.eqIn); node = master.eqOut; }
    if (master.chainIn && master.chainOut) { node.connect(master.chainIn); node = master.chainOut; }
    if (master.suiteIn && master.suiteOut) { node.connect(master.suiteIn); node = master.suiteOut; }
    if (master.glueOn) { node.connect(glue); glue.connect(fader); } else { node.connect(fader); }
    if (master.limiterOn) { fader.connect(limiter); limiter.connect(makeup); } else { fader.connect(makeup); }
  };

  // ---- send/return buses (FX 1, FX 2) ----
  // input → [insert] → return gain → analyser → master input.
  const sendBuses: SendBus[] = [];
  const sbuf = new Float32Array(256);
  for (let i = 0; i < SEND_COUNT; i++) {
    const sin = ctx.createGain();
    const rgain = ctx.createGain(); rgain.gain.value = 1;
    const a = ctx.createAnalyser(); a.fftSize = 256; a.smoothingTimeConstant = 0.2;
    sendBuses.push({ input: sin, gain: rgain, analyser: a, insIn: null, insOut: null });
  }
  const repatchSend = (i: number) => {
    const b = sendBuses[i];
    try { b.input.disconnect(); b.insOut?.disconnect(); b.gain.disconnect(); } catch { /* */ }
    let node: AudioNode = b.input;
    if (b.insIn && b.insOut) { node.connect(b.insIn); node = b.insOut; }
    node.connect(b.gain); b.gain.connect(b.analyser); b.analyser.connect(input);
  };
  for (let i = 0; i < SEND_COUNT; i++) repatchSend(i);

  // ---- group buses A–D ----
  // gain → [insert] → tap → analyser → master input; tap also feeds the per-group sends.
  const groups: GainNode[] = [];
  const groupTaps: GainNode[] = [];
  const groupAnalysers: AnalyserNode[] = [];
  const groupSends: GainNode[][] = [];
  const groupIns: { in: AudioNode | null; out: AudioNode | null }[] = [];
  for (let i = 0; i < 4; i++) {
    const g = ctx.createGain();
    const tap = ctx.createGain();
    const a = ctx.createAnalyser(); a.fftSize = 256; a.smoothingTimeConstant = 0.2;
    const sends: GainNode[] = [];
    for (let s = 0; s < SEND_COUNT; s++) { const sg = ctx.createGain(); sg.gain.value = 0; sg.connect(sendBuses[s].input); sends.push(sg); }
    groups.push(g); groupTaps.push(tap); groupAnalysers.push(a); groupSends.push(sends); groupIns.push({ in: null, out: null });
  }
  const repatchGroup = (i: number) => {
    const g = groups[i], tap = groupTaps[i], a = groupAnalysers[i], ins = groupIns[i];
    try { g.disconnect(); ins.out?.disconnect(); tap.disconnect(); } catch { /* */ }
    let node: AudioNode = g;
    if (ins.in && ins.out) { node.connect(ins.in); node = ins.out; }
    node.connect(tap);
    tap.connect(a); a.connect(input);                 // dry/main path
    for (const sg of groupSends[i]) tap.connect(sg);  // post-insert sends
  };
  for (let i = 0; i < 4; i++) repatchGroup(i);

  // Build a channel's insert+send tail: sends leave from `tap`, dry-out is wired by the caller.
  const makeChannelFx = (): ChannelFx => {
    const tap = ctx.createGain();
    const sends: GainNode[] = [];
    for (let s = 0; s < SEND_COUNT; s++) { const sg = ctx.createGain(); sg.gain.value = 0; tap.connect(sg); sg.connect(sendBuses[s].input); sends.push(sg); }
    return { tap, sends, insIn: null, insOut: null };
  };

  // ---- pad strips ----
  // voices → filter? → gain → pan → [insert] → tap → group; tap also feeds the sends.
  const pads: PadStrip[] = [];
  for (let i = 0; i < padCount; i++) {
    const pin = ctx.createGain();
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 8000;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;
    const fx = makeChannelFx();
    pin.connect(gain);
    gain.connect(pan);
    const strip: PadStrip = { input: pin, filter, gain, pan, filterOn: false, group: 0, analyser, ...fx };
    pads.push(strip);
  }

  const tracks = new Map<string, TrackStrip>();

  /** Rewire a pad's post-pan path: pan → [insert] → tap → group; keep sends fed from tap. */
  const repatchPadOut = (strip: PadStrip) => {
    try { strip.pan.disconnect(); strip.insOut?.disconnect(); strip.tap.disconnect(); } catch { /* */ }
    let node: AudioNode = strip.pan;
    if (strip.insIn && strip.insOut) { node.connect(strip.insIn); node = strip.insOut; }
    node.connect(strip.tap);
    strip.tap.connect(strip.analyser); strip.tap.connect(groups[strip.group] || groups[0]);
    for (const sg of strip.sends) strip.tap.connect(sg);
  };
  for (const s of pads) repatchPadOut(s);

  const setPadRouting = (strip: PadStrip, pad: PadConfig) => {
    const wantFilter = pad.filter.type !== 'off';
    if (wantFilter !== strip.filterOn) {
      try { strip.input.disconnect(); strip.filter.disconnect(); } catch { /* */ }
      if (wantFilter) { strip.input.connect(strip.filter); strip.filter.connect(strip.gain); }
      else strip.input.connect(strip.gain);
      strip.filterOn = wantFilter;
    }
    if (wantFilter) {
      strip.filter.type = pad.filter.type as BiquadFilterType;
      strip.filter.frequency.value = clamp(pad.filter.cutoff, 20, 20000);
      strip.filter.Q.value = clamp(pad.filter.q, 0.0001, 20);
    }
    strip.gain.gain.value = dbToGain(pad.gainDb);
    strip.pan.pan.value = clamp(pad.pan, -1, 1);
    if (strip.group !== pad.group) { strip.group = pad.group; repatchPadOut(strip); }
    // Per-pad sends (from the doc).
    const sends = (pad as unknown as { sends?: number[] }).sends ?? [];
    strip.sends.forEach((sg, s) => { sg.gain.value = Math.max(0, Math.min(2, sends[s] ?? 0)); });
  };

  /** Rewire a track's post-pan path: pan → [insert] → tap → master input; sends fed from tap. */
  const repatchTrackOut = (strip: TrackStrip) => {
    try { strip.pan.disconnect(); strip.insOut?.disconnect(); strip.tap.disconnect(); } catch { /* */ }
    let node: AudioNode = strip.pan;
    if (strip.insIn && strip.insOut) { node.connect(strip.insIn); node = strip.insOut; }
    node.connect(strip.tap);
    strip.tap.connect(strip.analyser); strip.tap.connect(input);
    for (const sg of strip.sends) strip.tap.connect(sg);
  };
  const makeTrackStrip = (): TrackStrip => {
    const g = ctx.createGain(); const p = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;
    const fx = makeChannelFx();
    g.connect(p);
    const strip: TrackStrip = { gain: g, pan: p, analyser, ...fx };
    repatchTrackOut(strip);
    return strip;
  };

  const gbuf = new Float32Array(256);
  const mbuf = new Float32Array(256);
  const pbuf = new Float32Array(256);
  const tbuf = new Float32Array(256);

  // Peak-hold meters. A raw instantaneous peak of a transient drum hit lasts a few milliseconds —
  // sampled once per animation frame it flickers so briefly the bar looks dead. Hold the peak and
  // fall it on a time constant (time-based, so it's correct no matter how often a meter is read).
  const holds = new Map<string, { v: number; t: number }>();
  const HOLD_TAU = 0.2; // seconds — meter fall
  const heldPeak = (key: string, analyser: AnalyserNode, buf: Float32Array): number => {
    const inst = peakOf(analyser, buf);
    const now = ctx.currentTime;
    const prev = holds.get(key);
    const v = prev ? Math.max(inst, prev.v * Math.exp(-Math.max(0, now - prev.t) / HOLD_TAU)) : inst;
    holds.set(key, { v, t: now });
    return v;
  };

  const graph: BeatsGraph = {
    ctx, pads, groups, groupAnalysers, sendBuses, tracks, master,

    applyDoc(doc: GrooveDoc) {
      doc.kit.forEach((pad, i) => { if (pads[i]) setPadRouting(pads[i], pad); });
      const anySolo = doc.mixer.groups.some((g) => g.solo);
      doc.mixer.groups.forEach((g, i) => {
        if (!groups[i]) return;
        const audible = !g.mute && (!anySolo || g.solo);
        groups[i].gain.value = audible ? dbToGain(g.gainDb) : 0;
      });
      fader.gain.value = dbToGain(doc.mixer.master.gainDb);
      if (master.limiterOn !== doc.mixer.master.limiterOn) {
        master.limiterOn = doc.mixer.master.limiterOn;
        repatchMaster();
      }
      // Arrangement audio tracks: create strips on demand, apply mute/solo/gain/pan.
      const anyTrackSolo = doc.arrangement.some((t) => t.solo && t.kind === 'audio');
      for (const t of doc.arrangement) {
        if (t.kind !== 'audio') continue;
        let strip = tracks.get(t.id);
        if (!strip) { strip = makeTrackStrip(); tracks.set(t.id, strip); }
        const audible = !t.mute && (!anyTrackSolo || t.solo);
        strip.gain.gain.value = audible ? dbToGain(t.gainDb) : 0;
        strip.pan.pan.value = clamp(t.pan, -1, 1);
        const sends = (t as unknown as { sends?: number[] }).sends ?? [];
        strip.sends.forEach((sg, s) => { sg.gain.value = Math.max(0, Math.min(2, sends[s] ?? 0)); });
      }
    },

    padDestination(padIdx: number) { return pads[padIdx]?.input || input; },

    trackDestination(track: ArrangeTrack) {
      let strip = tracks.get(track.id);
      if (!strip) { strip = makeTrackStrip(); tracks.set(track.id, strip); }
      return strip.gain;
    },

    setMasterEq(eqInput: AudioNode, eqOutput: AudioNode) {
      master.eqIn = eqInput; master.eqOut = eqOutput;
      repatchMaster();
    },
    clearMasterEq() {
      if (!master.eqIn && !master.eqOut) return;
      try { master.eqOut?.disconnect(); } catch { /* */ }
      master.eqIn = null; master.eqOut = null;
      repatchMaster();
    },

    setMasterChain(chainInput: AudioNode, chainOutput: AudioNode) {
      master.chainIn = chainInput; master.chainOut = chainOutput;
      repatchMaster();
    },
    clearMasterChain() {
      if (!master.chainIn && !master.chainOut) return;
      try { master.chainOut?.disconnect(); } catch { /* */ }
      master.chainIn = null; master.chainOut = null;
      repatchMaster();
    },
    setMasterSuite(suiteInput: AudioNode, suiteOutput: AudioNode) {
      master.suiteIn = suiteInput; master.suiteOut = suiteOutput;
      repatchMaster();
    },
    clearMasterSuite() {
      if (!master.suiteIn && !master.suiteOut) return;
      try { master.suiteOut?.disconnect(); } catch { /* */ }
      master.suiteIn = null; master.suiteOut = null;
      repatchMaster();
    },
    setGlueOn(on: boolean) {
      if (master.glueOn === on) return;
      master.glueOn = on;
      repatchMaster();
    },

    setPadInsert(padIdx, insInput, insOutput) {
      const s = pads[padIdx]; if (!s) return;
      s.insIn = insInput; s.insOut = insOutput; repatchPadOut(s);
    },
    clearPadInsert(padIdx) {
      const s = pads[padIdx]; if (!s || (!s.insIn && !s.insOut)) return;
      try { s.insOut?.disconnect(); } catch { /* */ }
      s.insIn = null; s.insOut = null; repatchPadOut(s);
    },
    setPadSend(padIdx, sendIdx, level) {
      const sg = pads[padIdx]?.sends[sendIdx]; if (sg) sg.gain.value = Math.max(0, Math.min(2, level));
    },
    setTrackInsert(trackId, insInput, insOutput) {
      const s = tracks.get(trackId); if (!s) return;
      s.insIn = insInput; s.insOut = insOutput; repatchTrackOut(s);
    },
    clearTrackInsert(trackId) {
      const s = tracks.get(trackId); if (!s || (!s.insIn && !s.insOut)) return;
      try { s.insOut?.disconnect(); } catch { /* */ }
      s.insIn = null; s.insOut = null; repatchTrackOut(s);
    },
    setTrackSend(trackId, sendIdx, level) {
      const sg = tracks.get(trackId)?.sends[sendIdx]; if (sg) sg.gain.value = Math.max(0, Math.min(2, level));
    },
    padMeter(padIdx) { const s = pads[padIdx]; return s ? heldPeak(`pad${padIdx}`, s.analyser, pbuf) : 0; },
    trackMeter(trackId) { const s = tracks.get(trackId); return s ? heldPeak(`trk${trackId}`, s.analyser, tbuf) : 0; },

    setGroupInsert(groupIdx, insInput, insOutput) {
      const ins = groupIns[groupIdx]; if (!ins) return;
      ins.in = insInput; ins.out = insOutput; repatchGroup(groupIdx);
    },
    clearGroupInsert(groupIdx) {
      const ins = groupIns[groupIdx]; if (!ins || (!ins.in && !ins.out)) return;
      try { ins.out?.disconnect(); } catch { /* */ }
      ins.in = null; ins.out = null; repatchGroup(groupIdx);
    },
    setGroupSend(groupIdx, sendIdx, level) {
      const sg = groupSends[groupIdx]?.[sendIdx]; if (sg) sg.gain.value = Math.max(0, Math.min(2, level));
    },
    setSendInsert(sendIdx, insInput, insOutput) {
      const b = sendBuses[sendIdx]; if (!b) return;
      b.insIn = insInput; b.insOut = insOutput; repatchSend(sendIdx);
    },
    clearSendInsert(sendIdx) {
      const b = sendBuses[sendIdx]; if (!b || (!b.insIn && !b.insOut)) return;
      try { b.insOut?.disconnect(); } catch { /* */ }
      b.insIn = null; b.insOut = null; repatchSend(sendIdx);
    },
    setSendReturnGain(sendIdx, db) {
      const b = sendBuses[sendIdx]; if (b) b.gain.gain.value = dbToGain(db);
    },
    sendMeters() { return sendBuses.map((b, i) => heldPeak(`snd${i}`, b.analyser, sbuf)); },

    meters() {
      return {
        groups: groupAnalysers.map((a, i) => heldPeak(`grp${i}`, a, gbuf)),
        master: heldPeak('master', analyser, mbuf),
        sends: sendBuses.map((b, i) => heldPeak(`snd${i}`, b.analyser, sbuf)),
      };
    },

    // A soft-clipper has no time-varying gain reduction to report; it shapes only peaks.
    limiterReduction() { return 0; },

    dispose() {
      try { input.disconnect(); analyser.disconnect(); } catch { /* */ }
      pads.forEach((p) => { try { p.input.disconnect(); p.pan.disconnect(); p.tap.disconnect(); p.sends.forEach((s) => s.disconnect()); } catch { /* */ } });
      groups.forEach((g) => { try { g.disconnect(); } catch { /* */ } });
      tracks.forEach((t) => { try { t.gain.disconnect(); t.pan.disconnect(); t.tap.disconnect(); t.sends.forEach((s) => s.disconnect()); } catch { /* */ } });
      tracks.clear();
    },
  };

  return graph;
}
