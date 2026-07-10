// voiceFX — real-time voice changer for the live streamer.
//
// Takes the mic MediaStream, routes it through a Web Audio graph per effect, and
// exposes the processed audio as a MediaStream the RTC layer publishes in place of the
// raw mic. Switching effects rewires the graph — the output track is stable, so no
// track swap / renegotiation.
//
// Pitch shifting uses a delay-line ("Jungle") shifter — real-time, pure Web Audio nodes,
// no worklet. Other effects use ring modulation, band-pass, wave-shaping and a
// procedurally-generated convolution reverb (no audio assets).

export type VoiceEffectId =
  | 'none' | 'robot' | 'alien' | 'deeper' | 'angelic' | 'amradio'
  | 'animegirl' | 'animeboy' | 'villain' | 'lowpitch' | 'highpitch';

export const VOICE_EFFECTS: { id: VoiceEffectId; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'deeper', label: 'Deeper' },
  { id: 'highpitch', label: 'High pitch' },
  { id: 'lowpitch', label: 'Low pitch' },
  { id: 'robot', label: 'Robot' },
  { id: 'alien', label: 'Alien' },
  { id: 'angelic', label: 'Angelic' },
  { id: 'amradio', label: 'AM radio' },
  { id: 'animegirl', label: 'Anime girl' },
  { id: 'animeboy', label: 'Anime boy' },
  { id: 'villain', label: 'Evil villain' },
];

// ── Delay-line pitch shifter (Chris Wilson "Jungle") ────────────────────────────
const P_DELAY = 0.100, P_FADE = 0.050;
function fadeBuffer(ctx: AudioContext, active: number, fade: number): AudioBuffer {
  const len1 = active * ctx.sampleRate, len2 = (active - 2 * fade) * ctx.sampleRate;
  const length = Math.round(len1 + len2), buf = ctx.createBuffer(1, length, ctx.sampleRate), p = buf.getChannelData(0);
  const fl = fade * ctx.sampleRate, i1 = fl, i2 = len1 - fl;
  for (let i = 0; i < len1; i++) p[i] = i < i1 ? Math.sqrt(i / fl) : i >= i2 ? Math.sqrt(1 - (i - i2) / fl) : 1;
  for (let i = len1; i < length; i++) p[i] = 0;
  return buf;
}
function delayTimeBuffer(ctx: AudioContext, active: number, fade: number, up: boolean): AudioBuffer {
  const len1 = active * ctx.sampleRate, len2 = (active - 2 * fade) * ctx.sampleRate;
  const length = Math.round(len1 + len2), buf = ctx.createBuffer(1, length, ctx.sampleRate), p = buf.getChannelData(0);
  for (let i = 0; i < len1; i++) p[i] = up ? (len1 - i) / length : i / len1;
  for (let i = len1; i < length; i++) p[i] = 0;
  return buf;
}
class Jungle {
  input: GainNode; output: GainNode;
  private mod1: AudioBufferSourceNode; private mod2: AudioBufferSourceNode;
  private mod1Gain: GainNode; private mod2Gain: GainNode;
  private mod3: AudioBufferSourceNode; private mod4: AudioBufferSourceNode;
  private fade1: GainNode; private fade2: GainNode;
  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain(); this.output = ctx.createGain();
    const delayBuf = delayTimeBuffer(ctx, P_DELAY, P_FADE, false);
    const fadeBuf = fadeBuffer(ctx, P_DELAY, P_FADE);
    this.mod1 = ctx.createBufferSource(); this.mod2 = ctx.createBufferSource();
    this.mod3 = ctx.createBufferSource(); this.mod4 = ctx.createBufferSource();
    this.mod1.buffer = delayBuf; this.mod2.buffer = delayBuf;
    this.mod3.buffer = fadeBuf; this.mod4.buffer = fadeBuf;
    this.mod1.loop = this.mod2.loop = this.mod3.loop = this.mod4.loop = true;
    this.mod1Gain = ctx.createGain(); this.mod2Gain = ctx.createGain();
    const delay1 = ctx.createDelay(), delay2 = ctx.createDelay();
    // delay-time modulation (sawtooth ramps) → each delay line's delayTime
    this.mod1.connect(this.mod1Gain); this.mod1Gain.connect(delay1.delayTime);
    this.mod2.connect(this.mod2Gain); this.mod2Gain.connect(delay2.delayTime);
    // crossfade envelopes (offset triangles) → each line's output gain
    this.fade1 = ctx.createGain(); this.fade2 = ctx.createGain();
    this.fade1.gain.value = 0; this.fade2.gain.value = 0;
    this.mod3.connect(this.fade1.gain); this.mod4.connect(this.fade2.gain);
    // signal path: input → delay → fade → output (two crossfaded lines)
    this.input.connect(delay1); delay1.connect(this.fade1); this.fade1.connect(this.output);
    this.input.connect(delay2); delay2.connect(this.fade2); this.fade2.connect(this.output);
    const t = ctx.currentTime + 0.05;
    this.mod1.start(t); this.mod2.start(t + P_DELAY / 2);
    this.mod3.start(t); this.mod4.start(t + P_DELAY / 2);
  }
  setPitch(mult: number) { // mult: -1..1 (~ ±1 octave); 0 = no change
    const t = this.ctx.currentTime;
    this.mod1Gain.gain.setValueAtTime(mult > 0 ? mult * P_DELAY : 0, t);
    this.mod2Gain.gain.setValueAtTime(mult > 0 ? mult * P_DELAY : 0, t);
    if (mult <= 0) { this.mod1Gain.gain.setValueAtTime(-mult * P_DELAY, t); this.mod2Gain.gain.setValueAtTime(-mult * P_DELAY, t); }
  }
  stop() { try { [this.mod1, this.mod2, this.mod3, this.mod4].forEach(m => m.stop()); } catch { /* */ } }
}

function makeReverbIR(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate, len = Math.round(rate * seconds), buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
function distortionCurve(amount: number): Float32Array {
  const n = 44100, curve = new Float32Array(n), k = amount;
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x)); }
  return curve;
}

export class VoiceFX {
  private ctx: AudioContext;
  private src: MediaStreamAudioSourceNode;
  private dest: MediaStreamAudioDestinationNode;
  private nodes: AudioNode[] = [];
  private jungle: Jungle | null = null;
  private effect: VoiceEffectId = 'none';

  constructor(mic: MediaStream) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.src = this.ctx.createMediaStreamSource(mic);
    this.dest = this.ctx.createMediaStreamDestination();
    this.build('none');
  }
  getStream(): MediaStream { return this.dest.stream; }
  getEffect() { return this.effect; }

  setEffect(id: VoiceEffectId) { if (id === this.effect) return; this.build(id); }

  private teardown() {
    try { this.src.disconnect(); } catch { /* */ }
    this.jungle?.stop(); this.jungle = null;
    this.nodes.forEach(n => { try { n.disconnect(); } catch { /* */ } });
    this.nodes = [];
  }

  private build(id: VoiceEffectId) {
    this.teardown();
    this.effect = id;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const ctx = this.ctx, out = this.dest;
    const keep = (n: AudioNode) => { this.nodes.push(n); return n; };

    if (id === 'none') { this.src.connect(out); return; }

    // Pitch-only effects
    const pitchOnly: Partial<Record<VoiceEffectId, number>> = {
      deeper: -0.35, lowpitch: -0.55, highpitch: 0.45, animegirl: 0.6, animeboy: -0.12,
    };
    if (id in pitchOnly) {
      const j = this.jungle = new Jungle(ctx); j.setPitch(pitchOnly[id]!);
      this.src.connect(j.input); j.output.connect(out);
      return;
    }
    if (id === 'robot') {
      const ring = keep(ctx.createGain()) as GainNode; ring.gain.value = 0;
      const osc = keep(ctx.createOscillator()) as OscillatorNode; osc.frequency.value = 55; osc.type = 'sine';
      osc.connect(ring.gain); this.src.connect(ring); ring.connect(out); osc.start();
      return;
    }
    if (id === 'alien') {
      const j = this.jungle = new Jungle(ctx); j.setPitch(0.25);
      const ring = keep(ctx.createGain()) as GainNode; ring.gain.value = 0;
      const osc = keep(ctx.createOscillator()) as OscillatorNode; osc.frequency.value = 30; osc.type = 'sine';
      osc.connect(ring.gain); this.src.connect(j.input); j.output.connect(ring); ring.connect(out); osc.start();
      return;
    }
    if (id === 'amradio') {
      const bp = keep(ctx.createBiquadFilter()) as BiquadFilterNode; bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.9;
      const hp = keep(ctx.createBiquadFilter()) as BiquadFilterNode; hp.type = 'highpass'; hp.frequency.value = 500;
      const lp = keep(ctx.createBiquadFilter()) as BiquadFilterNode; lp.type = 'lowpass'; lp.frequency.value = 3000;
      const shaper = keep(ctx.createWaveShaper()) as WaveShaperNode; shaper.curve = distortionCurve(8);
      const g = keep(ctx.createGain()) as GainNode; g.gain.value = 1.4;
      this.src.connect(hp).connect(bp).connect(lp).connect(shaper).connect(g).connect(out);
      return;
    }
    if (id === 'angelic') {
      const j = this.jungle = new Jungle(ctx); j.setPitch(0.14);
      const conv = keep(ctx.createConvolver()) as ConvolverNode; conv.buffer = makeReverbIR(ctx, 2.6, 2.2);
      const wet = keep(ctx.createGain()) as GainNode; wet.gain.value = 0.55;
      const dry = keep(ctx.createGain()) as GainNode; dry.gain.value = 0.8;
      this.src.connect(j.input);
      j.output.connect(dry).connect(out);
      j.output.connect(conv).connect(wet).connect(out);
      return;
    }
    if (id === 'villain') {
      const j = this.jungle = new Jungle(ctx); j.setPitch(-0.4);
      const shaper = keep(ctx.createWaveShaper()) as WaveShaperNode; shaper.curve = distortionCurve(4);
      const conv = keep(ctx.createConvolver()) as ConvolverNode; conv.buffer = makeReverbIR(ctx, 2.0, 3);
      const wet = keep(ctx.createGain()) as GainNode; wet.gain.value = 0.35;
      const dry = keep(ctx.createGain()) as GainNode; dry.gain.value = 0.85;
      this.src.connect(j.input); j.output.connect(shaper);
      shaper.connect(dry).connect(out);
      shaper.connect(conv).connect(wet).connect(out);
      return;
    }
    // fallback
    this.src.connect(out);
  }

  dispose() {
    this.teardown();
    try { this.dest.disconnect(); } catch { /* */ }
    this.ctx.close().catch(() => {});
  }
}
