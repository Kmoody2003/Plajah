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

export interface PadStrip {
  input: GainNode;            // voices connect here
  filter: BiquadFilterNode;   // 'off' routes around it
  gain: GainNode;
  pan: StereoPannerNode;
  filterOn: boolean;
}

export interface TrackStrip { gain: GainNode; pan: StereoPannerNode; }

export interface BeatsGraph {
  ctx: BaseAudioContext;
  pads: PadStrip[];                       // 16
  groups: GainNode[];                     // 4
  groupAnalysers: AnalyserNode[];         // post-bus, pre-master
  tracks: Map<string, TrackStrip>;        // ArrangeTrack.id → strip (audio tracks)
  master: {
    input: GainNode;
    glue: DynamicsCompressorNode; glueOn: boolean;
    fader: GainNode;
    limiter: DynamicsCompressorNode; limiterOn: boolean;
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
  meters(): { groups: number[]; master: number };
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

export function buildGraph(ctx: BaseAudioContext, padCount = 16): BeatsGraph {
  // ---- master ----
  const input = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18; glue.knee.value = 12; glue.ratio.value = 2.5;
  glue.attack.value = 0.01; glue.release.value = 0.18;
  const fader = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.0; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.001; limiter.release.value = 0.05;
  const makeup = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;

  // Default patch: input → fader → limiter → makeup → analyser → destination (glue off).
  input.connect(fader); fader.connect(limiter); limiter.connect(makeup);
  makeup.connect(analyser); analyser.connect(ctx.destination);

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

  // ---- group buses A–D ----
  const groups: GainNode[] = [];
  const groupAnalysers: AnalyserNode[] = [];
  for (let i = 0; i < 4; i++) {
    const g = ctx.createGain();
    const a = ctx.createAnalyser(); a.fftSize = 256; a.smoothingTimeConstant = 0.2;
    g.connect(a); a.connect(input);
    groups.push(g); groupAnalysers.push(a);
  }

  // ---- pad strips ----
  const pads: PadStrip[] = [];
  for (let i = 0; i < padCount; i++) {
    const pin = ctx.createGain();
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 8000;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pin.connect(gain); // filter off by default — bypassed
    gain.connect(pan); pan.connect(groups[0]);
    pads.push({ input: pin, filter, gain, pan, filterOn: false });
  }

  const tracks = new Map<string, TrackStrip>();

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
    try { strip.pan.disconnect(); } catch { /* */ }
    strip.pan.connect(groups[pad.group] || groups[0]);
  };

  const gbuf = new Float32Array(256);
  const mbuf = new Float32Array(256);

  const graph: BeatsGraph = {
    ctx, pads, groups, groupAnalysers, tracks, master,

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
        if (!strip) {
          const g = ctx.createGain(); const p = ctx.createStereoPanner();
          g.connect(p); p.connect(input);
          strip = { gain: g, pan: p }; tracks.set(t.id, strip);
        }
        const audible = !t.mute && (!anyTrackSolo || t.solo);
        strip.gain.gain.value = audible ? dbToGain(t.gainDb) : 0;
        strip.pan.pan.value = clamp(t.pan, -1, 1);
      }
    },

    padDestination(padIdx: number) { return pads[padIdx]?.input || input; },

    trackDestination(track: ArrangeTrack) {
      let strip = tracks.get(track.id);
      if (!strip) {
        const g = ctx.createGain(); const p = ctx.createStereoPanner();
        g.connect(p); p.connect(input);
        strip = { gain: g, pan: p }; tracks.set(track.id, strip);
      }
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

    meters() {
      return {
        groups: groupAnalysers.map((a) => peakOf(a, gbuf)),
        master: peakOf(analyser, mbuf),
      };
    },

    limiterReduction() { return limiter.reduction || 0; },

    dispose() {
      try { input.disconnect(); analyser.disconnect(); } catch { /* */ }
      pads.forEach((p) => { try { p.input.disconnect(); p.pan.disconnect(); } catch { /* */ } });
      groups.forEach((g) => { try { g.disconnect(); } catch { /* */ } });
      tracks.forEach((t) => { try { t.gain.disconnect(); t.pan.disconnect(); } catch { /* */ } });
      tracks.clear();
    },
  };

  return graph;
}
