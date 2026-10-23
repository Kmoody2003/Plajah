// Combat and magic sound design on the game's audio graph (audio.ts). Recorded CC0 takes
// (samples.ts: thunder, creatures, blade, gore, impacts) carry the body of each sound once the bank
// has loaded; the synthesized layers add the sub weight, shimmer and magic, and stand in alone until
// then. Everything is randomised a little per play, panned, and sent into the stone-hall reverb by
// how far inside the player is.
import type { GameAudio } from './audio';
import type { PlayOpts } from './samples';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
type Kind = 'zombie' | 'werewolf' | 'ghost' | 'vampire' | 'wolf' | 'unknown' | 'stitch' | string;

export class Sfx {
  constructor(private a: GameAudio) {}
  private get ctx() { return this.a.context; }

  // ── building blocks ────────────────────────────────────────────────────────
  private out(node: AudioNode, wet = 0.3, pan = 0) {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(p).connect(this.a.sfxBus ?? this.a.bus!);
    const s = ctx.createGain(); s.gain.value = wet * (this.a.indoors ? 1.6 : 0.6);
    p.connect(s).connect(this.a.verb!);
    return p;
  }
  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private noise(t: number, dur: number, type: BiquadFilterType, f: number, q: number, peak: number, opts: { wet?: number; pan?: number; attack?: number; f1?: number; q1?: number } = {}) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.a.noiseBuffer; s.start(t, Math.random() * 4, dur + 0.2);
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (opts.f1) fl.frequency.exponentialRampToValueAtTime(opts.f1, t + dur);
    if (opts.q1) fl.Q.linearRampToValueAtTime(opts.q1, t + dur);
    const g = ctx.createGain(); this.env(g, t, peak, opts.attack ?? 0.002, dur);
    s.connect(fl).connect(g); return this.out(g, opts.wet ?? 0.25, opts.pan ?? 0);
  }
  private osc(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, opts: { wet?: number; pan?: number; attack?: number; drive?: number } = {}) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain(); this.env(g, t, peak, opts.attack ?? 0.003, dur);
    let n: AudioNode = o;
    if (opts.drive) { const ws = ctx.createWaveShaper(); ws.curve = this.curve(opts.drive); n = o.connect(ws); }
    n.connect(g); this.out(g, opts.wet ?? 0.25, opts.pan ?? 0);
    o.start(t); o.stop(t + (opts.attack ?? 0.003) + dur + 0.05);
  }
  /** FM bell: inharmonic modulator, decaying index — crystal, chimes, blade ring. */
  private bell(t: number, f: number, dur: number, peak: number, ratio = 2.76, index = 3, wet = 0.6, pan = 0) {
    const ctx = this.ctx!;
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = f; m.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    m.connect(mg).connect(c.frequency);
    this.env(g, t, peak, 0.002, dur);
    c.connect(g); this.out(g, wet, pan);
    c.start(t); m.start(t); c.stop(t + dur + 0.1); m.stop(t + dur + 0.1);
  }
  private curves = new Map<number, Float32Array>();
  private curve(k: number) {
    if (!this.curves.has(k)) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } this.curves.set(k, c); }
    return this.curves.get(k)!;
  }
  private now() { return this.ctx ? this.ctx.currentTime + 0.005 : -1; }
  /** A recorded take on the effects bus; false until the bank has loaded. */
  private rec(name: string, o: PlayOpts = {}) {
    const bank = this.a.samples;
    if (!bank || !this.ctx) return false;
    return bank.play(name, { ...o, wet: (o.wet ?? 0.25) * (this.a.indoors ? 1.6 : 0.6) }, this.a.sfxBus ?? undefined);
  }
  /** Synth level under the recordings. */
  private get syn() { return this.a.samples?.ready ? 0.5 : 1; }
  /** Distance → gain and a muffling lowpass. */
  private far(dist: number, range = 50, floor = 0.15) {
    return { k: Math.max(floor, 1 - dist / range), lp: dist > 12 ? Math.max(900, 14000 - dist * 260) : undefined };
  }

  // ── the Pumpkin Patch war-rig ────────────────────────────────────────────────
  // A big diesel: two detuned saws through a low-pass with a chugging firing-rate LFO, an exhaust
  // rasp, and the track clatter, all riding one gain the game sets from the tank's distance.
  private engine: { g: GainNode; lp: BiquadFilterNode; oscs: OscillatorNode[]; src: AudioBufferSourceNode; clank: number } | null = null;
  tankEngine(on: boolean, dist = 20, speed = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!on) {
      if (this.engine) { const e = this.engine; e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => { e.oscs.forEach((o) => o.stop()); e.src.stop(); }, 2000); this.engine = null; }
      return;
    }
    if (!this.engine) {
      const g = ctx.createGain(); g.gain.value = 0.0001;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
      const shaper = ctx.createWaveShaper(); shaper.curve = this.curve(3);
      const chug = ctx.createGain(); chug.gain.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 13; const lfoG = ctx.createGain(); lfoG.gain.value = 0.4; lfo.connect(lfoG).connect(chug.gain);
      const oscs = [38, 38.7, 76.5].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(shaper); o.start(); return o; });
      shaper.connect(chug).connect(lp).connect(g);
      // Exhaust rasp: band-passed noise riding the same chug.
      const src = ctx.createBufferSource(); src.buffer = this.a.noiseBuffer; src.loop = true; src.start();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 180; bp.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      src.connect(bp).connect(ng).connect(chug);
      lfo.start(); oscs.push(lfo);
      this.out(g, 0.15, 0);
      this.engine = { g, lp, oscs, src, clank: 0 };
    }
    const e = this.engine, now = ctx.currentTime, k = Math.max(0.06, 1 - dist / 70);
    e.g.gain.setTargetAtTime(0.32 * k, now, 0.15);
    e.lp.frequency.setTargetAtTime(260 + 380 * Math.min(1, speed / 12) + 300 * k, now, 0.2);
    // Track clatter: steel links slapping the road, faster with speed.
    e.clank -= 1 / 60;
    if (e.clank <= 0) {
      e.clank = 0.07 + 0.1 / Math.max(0.5, speed / 6);
      const t = this.now();
      this.noise(t, 0.035, 'bandpass', rnd(1500, 2600), 3, 0.05 * k, { wet: 0.1 });
      this.osc(t, 'square', rnd(140, 190), 90, 0.04, 0.012 * k, { wet: 0.05 });
    }
  }
  /** The turret: a huge muzzle crack and boom, the shell's report rolling off the hills. */
  tankCannon(pan = 0, dist = 10) {
    const t = this.now(); if (t < 0) return;
    const { k, lp } = this.far(dist, 90, 0.3);
    this.rec('explosion', { pan, gain: 1.0 * k, rate: [0.85, 1.0], lowpass: lp, wet: 0.5 });
    this.rec('gunshot', { pan, gain: 0.9 * k, rate: [0.5, 0.6], wet: 0.6 });
    this.osc(t, 'sine', 70, 26, 0.9, 0.5 * k, { drive: 3, wet: 0.5, pan });
    this.noise(t, 0.08, 'highpass', 1500, 0.7, 0.4 * k, { pan, wet: 0.4 });
  }
  /** Something big crushed under the treads (wreckage, bodies). */
  tankCrush(dist = 10) {
    const { k } = this.far(dist, 60, 0.3);
    this.rec('rock_break', { gain: 0.9 * k, rate: [0.7, 0.85] });
    this.rec('wood_break', { gain: 0.7 * k, rate: [0.7, 0.9], delay: 0.05 });
    this.rec('glass_break', { gain: 0.5 * k, rate: [0.8, 1], delay: 0.1 });
  }

  // ── creatures ──────────────────────────────────────────────────────────────
  /** A monster's voice: idle snarls while hunting, a bark on the attack, a cry when cut. */
  vocal(kind: Kind, mood: 'idle' | 'attack' | 'hurt', pan = 0, dist = 6) {
    const { k, lp } = this.far(dist, 45);
    const bank: Record<string, [string, string, string, [number, number]]> = {
      //          idle        attack     hurt          rate
      zombie: ['zombie', 'zombie', 'zombie_hurt', [0.85, 1.05]],
      werewolf: ['growl', 'werewolf', 'growl', [0.9, 1.05]],
      wolf: ['growl', 'growl', 'zombie_hurt', [1.15, 1.35]],
      vampire: ['hiss', 'hiss', 'hiss', [0.9, 1.1]],
      ghost: ['ghost', 'ghost_scream', 'ghost', [0.95, 1.1]],
      unknown: ['growl', 'roar', 'roar', [0.7, 0.85]],
      stitch: ['zombie', 'growl', 'zombie_hurt', [0.75, 0.9]],
      robobones: ['zombie', 'growl', 'zombie_hurt', [0.65, 0.8]],
      troll: ['troll', 'troll', 'troll', [0.8, 0.95]],
      dracula: ['hiss', 'hiss', 'roar', [0.75, 0.85]],
    };
    const e = bank[kind] ?? bank.zombie;
    const name = mood === 'idle' ? e[0] : mood === 'attack' ? e[1] : e[2];
    return this.rec(name, { pan, gain: (mood === 'idle' ? 0.55 : 0.8) * k, rate: e[3], lowpass: lp, wet: 0.35 });
  }
  /** The troll's tread. */
  giantStep(pan = 0, dist = 8) {
    const { k, lp } = this.far(dist, 40);
    this.rec('giant_step', { pan, gain: 0.8 * k, lowpass: lp, rate: [0.8, 0.95], wet: 0.3 });
  }

  // ── the blade ──────────────────────────────────────────────────────────────
  /** Katana through air: a pitched whoosh that pans across, with a thin steel shimmer. */
  swing(heavy = false) {
    const t = this.now(); if (t < 0) return;
    if (this.rec('swing', { gain: heavy ? 0.95 : 0.7, rate: heavy ? [0.8, 0.9] : [0.95, 1.12], pan: rnd(-0.25, 0.25), wet: 0.12 })) {
      for (const f of [2870, 4130, 6310]) this.osc(t + 0.01, 'sine', f * rnd(0.97, 1.03), f * 0.97, 0.09, 0.006, { wet: 0.2 });
      if (heavy) this.osc(t, 'sine', 90, 40, 0.3, 0.08, { attack: 0.1, wet: 0.1 });
      return;
    }
    const dur = heavy ? 0.32 : 0.2, dir = Math.random() < 0.5 ? -1 : 1;
    const p = this.noise(t, dur, 'bandpass', heavy ? 380 : 600, 1.4, heavy ? 0.32 : 0.22, { attack: dur * 0.45, f1: heavy ? 1500 : 2600, wet: 0.15 });
    (p as StereoPannerNode).pan.setValueAtTime(-0.6 * dir, t); (p as StereoPannerNode).pan.linearRampToValueAtTime(0.6 * dir, t + dur);
    this.noise(t + dur * 0.3, dur * 0.6, 'highpass', 5200, 0.7, 0.05, { attack: 0.02, wet: 0.1 });
    for (const f of [2870, 4130, 6310]) this.osc(t + 0.01, 'sine', f * rnd(0.97, 1.03), f * 0.97, 0.09, 0.008, { wet: 0.2 });
    if (heavy) this.osc(t, 'sine', 90, 40, 0.3, 0.12, { attack: 0.1, wet: 0.1 });
  }

  /** Blade into a body: crack, distorted body thump, wet flesh (or ectoplasm), steel ring. */
  hit(kind: Kind, finisher = false, power = 1, killed = false) {
    const t = this.now(); if (t < 0) return;
    const pan = rnd(-0.25, 0.25), pw = Math.min(power, 3);
    this.noise(t, 0.016, 'highpass', 3200, 0.8, 0.25, { pan, wet: 0.15 });
    if (kind === 'ghost') {
      // Through ectoplasm: a hollow glassy ripple, no flesh.
      this.noise(t, 0.25, 'bandpass', 2400, 9, 0.12, { f1: 800, pan, wet: 0.7 });
      this.bell(t, rnd(880, 1100), 0.6, 0.05, 1.5, 2, 0.8, pan);
      this.osc(t, 'sine', 200, 70, 0.15, 0.18, { pan });
    } else {
      // Recorded: the blade biting in, the body blow under it, bone on the big ones, gore on the kill.
      this.rec('slash', { pan, gain: 0.85, rate: [0.9, 1.1] });
      this.rec('punch', { pan, gain: 0.45 + 0.12 * pw, rate: [0.8, 0.95] });
      if (kind === 'werewolf' || kind === 'unknown' || kind === 'stitch' || kind === 'troll') this.rec('bone', { pan, gain: 0.4, rate: [0.9, 1.1] });
      if (finisher || killed) this.rec('gore', { pan, gain: 0.75, delay: 0.02 });
      const syn = this.syn;
      this.osc(t, 'sine', rnd(120, 140) * (kind === 'wolf' ? 1.3 : 1), 42, 0.16, (0.42 + 0.06 * pw) * syn, { drive: 3, pan, wet: 0.2 });
      this.noise(t + 0.004, 0.09, 'bandpass', rnd(420, 560), 2.2, 0.22, { f1: 240, pan, wet: 0.2 });       // wet chop
      this.noise(t + 0.01, 0.05, 'lowpass', 1400, 0.7, 0.14, { pan, wet: 0.15 });
      if (kind === 'werewolf' || kind === 'unknown' || kind === 'stitch') this.bell(t, rnd(1650, 1900), 0.35, 0.03, 2.76, 2.5, 0.4, pan); // hide/bone ring
    }
    if (finisher || killed) {
      this.osc(t, 'sine', 70, 28, 0.55, 0.45 + 0.08 * pw, { drive: 2, wet: 0.5 });
      this.noise(t, 0.6, 'lowpass', 300, 0.7, 0.14, { attack: 0.01, wet: 0.8 });
    }
  }

  /** Slow-motion slice close-up: a deep downward "bwomm" with a pulled-back air swell. */
  sliceCam() {
    const t = this.now(); if (t < 0) return;
    this.osc(t, 'sawtooth', 110, 36, 0.9, 0.12, { drive: 1.5, wet: 0.6, attack: 0.02 });
    this.noise(t, 0.8, 'bandpass', 1800, 2, 0.06, { f1: 300, attack: 0.05, wet: 0.7 });
  }

  // ── deaths ─────────────────────────────────────────────────────────────────
  /** Ghost: an ethereal choir wail that breaks into glittering motes. */
  ectoDeath() {
    const t = this.now(); if (t < 0) return;
    this.rec('ghost_scream', { gain: 0.45, wet: 0.9, rate: [0.9, 1.05] });
    const ctx = this.ctx!;
    const chord = [220, 261.6, 329.6, 392, 493.9];
    for (const [i, f] of chord.entries()) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f * 1.4, t + 1.8);
      const vib = ctx.createOscillator(); vib.frequency.value = 5 + i * 0.3; const vg = ctx.createGain(); vg.gain.value = f * 0.012; vib.connect(vg).connect(o.frequency);
      const form = ctx.createBiquadFilter(); form.type = 'bandpass'; form.frequency.setValueAtTime(900, t); form.frequency.linearRampToValueAtTime(600, t + 1.8); form.Q.value = 5; // "ah" → "oo"
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
      o.connect(form).connect(g); this.out(g, 1, (i - 2) * 0.3);
      o.start(t); vib.start(t); o.stop(t + 2.1); vib.stop(t + 2.1);
    }
    this.noise(t, 0.6, 'highpass', 3000, 0.7, 0.06, { attack: 0.5, wet: 0.9 }); // reverse swell
    for (let k = 0; k < 9; k++) this.bell(t + 0.3 + k * rnd(0.06, 0.14), rnd(1800, 3600), 0.5, 0.012, 1.41, 1.5, 0.9, rnd(-0.8, 0.8));
  }
  /** Vampire / the Unknown: a falling groan as the body cracks and sifts away to ash. */
  ashDeath(big = false) {
    const t = this.now(); if (t < 0) return;
    this.rec('hiss', { gain: big ? 0.8 : 0.55, wet: 0.5, rate: big ? [0.7, 0.8] : [0.9, 1.05] });
    this.osc(t, 'sawtooth', big ? 120 : 190, big ? 40 : 70, big ? 1.8 : 1.2, 0.05, { drive: 2, wet: 0.6, attack: 0.05 });
    for (let k = 0; k < 40; k++) { const tt = t + 0.2 + Math.pow(k / 40, 0.6) * 1.3; this.noise(tt, rnd(0.005, 0.02), 'bandpass', rnd(2000, 6000), 1.5, rnd(0.03, 0.08), { wet: 0.3, pan: rnd(-0.6, 0.6) }); }
    this.noise(t + 0.4, 1.2, 'bandpass', 900, 0.8, 0.07, { attack: 0.4, f1: 3000, wet: 0.5 }); // dust breath
    if (big) this.osc(t, 'sine', 55, 30, 1.5, 0.4, { drive: 2, wet: 0.7 });
  }
  /** Werewolf: the cleaving slice, blood hissing in pulses, the body hitting the floor. */
  behead() {
    const t = this.now(); if (t < 0) return;
    this.rec('slash', { gain: 1 }); this.rec('gore', { gain: 0.8, delay: 0.08 }); this.rec('body_fall', { gain: 0.8, delay: 0.85 });
    this.noise(t, 0.03, 'highpass', 2500, 1, 0.3);
    this.noise(t + 0.01, 0.18, 'bandpass', 700, 3, 0.25, { f1: 260, wet: 0.2 });
    this.osc(t, 'sine', 160, 50, 0.2, 0.4, { drive: 3 });
    for (let k = 0; k < 5; k++) this.noise(t + 0.15 + k * 0.17, 0.12, 'highpass', 2600, 0.6, 0.05 * (1 - k / 6), { wet: 0.2 });
    this.osc(t + 0.85, 'sine', 95, 38, 0.3, 0.5, { drive: 2, wet: 0.4 }); // body down
    this.noise(t + 0.85, 0.2, 'lowpass', 600, 0.7, 0.18, { wet: 0.4 });
  }
  /** Zombie: wet crunch, bones snapping in sequence, then the pieces landing. */
  burst(straw = false) {
    const t = this.now(); if (t < 0) return;
    if (straw) {
      for (let k = 0; k < 14; k++) this.noise(t + k * rnd(0.01, 0.04), rnd(0.03, 0.08), 'bandpass', rnd(2500, 5000), 1.2, 0.06, { pan: rnd(-0.7, 0.7), wet: 0.2 });
      this.noise(t, 0.5, 'highpass', 1500, 0.7, 0.08, { attack: 0.05, wet: 0.3 });
      return;
    }
    this.rec('gore', { gain: 0.9 }); this.rec('bone', { gain: 0.6, delay: 0.05 });
    this.osc(t, 'sine', 130, 40, 0.2, 0.45, { drive: 4 });
    this.noise(t, 0.22, 'bandpass', 500, 2, 0.28, { f1: 220, wet: 0.2 });
    for (let k = 0; k < 6; k++) this.noise(t + 0.03 + k * rnd(0.02, 0.06), 0.012, 'bandpass', rnd(1500, 3200), 3, 0.18, { pan: rnd(-0.5, 0.5) }); // snaps
    for (let k = 0; k < 6; k++) this.osc(t + 0.5 + k * rnd(0.05, 0.12), 'sine', rnd(90, 160), 45, 0.1, 0.15, { pan: rnd(-0.7, 0.7), wet: 0.3 }); // pieces land
  }
  /** Wolf: a yelp falling off, the body thudding down. */
  yelp() {
    const t = this.now(); if (t < 0) return;
    this.rec('body_fall', { gain: 0.6, delay: 0.5, rate: [1.05, 1.2] });
    this.osc(t, 'sawtooth', 900, 380, 0.35, 0.05, { wet: 0.4, attack: 0.01 });
    this.osc(t + 0.5, 'sine', 110, 45, 0.2, 0.3, { drive: 2, wet: 0.3 });
  }

  // ── magic ──────────────────────────────────────────────────────────────────
  /** Will-o'-wisp strike: a crystalline FM chirp with sparkles and a soft air pop. */
  orbZap(pan = 0) {
    const t = this.now(); if (t < 0) return;
    const ctx = this.ctx!;
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.setValueAtTime(1300, t); c.frequency.exponentialRampToValueAtTime(2900, t + 0.12);
    m.frequency.setValueAtTime(2620, t); m.frequency.exponentialRampToValueAtTime(5800, t + 0.12);
    mg.gain.setValueAtTime(2400, t); mg.gain.exponentialRampToValueAtTime(40, t + 0.25);
    m.connect(mg).connect(c.frequency); this.env(g, t, 0.06, 0.004, 0.28);
    c.connect(g); this.out(g, 0.7, pan); c.start(t); m.start(t); c.stop(t + 0.35); m.stop(t + 0.35);
    for (let k = 0; k < 4; k++) this.bell(t + 0.04 + k * 0.035, rnd(3000, 5200), 0.25, 0.01, 1.41, 1, 0.8, pan + rnd(-0.3, 0.3));
    this.noise(t, 0.06, 'bandpass', 900, 1, 0.06, { pan });
  }
  /** A power tier: rising air, a choir chord swelling up, a bright bell on top. */
  powerUp(tier = 1) {
    const t = this.now(); if (t < 0) return;
    const ctx = this.ctx!;
    this.noise(t, 1.1, 'bandpass', 300, 1.5, 0.1, { attack: 1, f1: 4000, wet: 0.6 });
    const root = 146.8 * Math.pow(2, (tier - 1) * 2 / 12);
    for (const [i, r] of [1, 1.5, 2, 2.52, 3].entries()) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = root * r;
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = root * r * 0.006; vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g); this.out(g, 0.9, (i - 2) * 0.35); o.start(t); vib.start(t); o.stop(t + 2.7); vib.stop(t + 2.7);
    }
    this.bell(t + 1.0, root * 8, 1.6, 0.05, 2.0, 2, 0.9);
    this.osc(t + 1.0, 'sine', 65, 35, 0.8, 0.3, { drive: 1.5, wet: 0.6 });
  }
  /** Level up: an ascending bell arpeggio over a warm pad. */
  levelUp() {
    const t = this.now(); if (t < 0) return;
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => this.bell(t + i * 0.09, f, 1.2, 0.04, 2.0, 1.8, 0.8, (i - 2) * 0.25));
    this.osc(t, 'triangle', 261.6, 261.6, 1.6, 0.04, { attack: 0.2, wet: 0.8 });
  }

  // ── tools ──────────────────────────────────────────────────────────────────
  /** Molotov: glass shattering, the fuel catching (whoomp), a roaring tail. */
  molotov() {
    const t = this.now(); if (t < 0) return;
    if (this.rec('glass_break', { gain: 0.9 })) {
      this.rec('fire_whoosh', { gain: 0.9, delay: 0.06 });
      this.osc(t + 0.06, 'sine', 80, 35, 0.4, 0.25, { drive: 2, wet: 0.4 });
      this.noise(t + 0.2, 2.2, 'bandpass', 700, 0.9, 0.08, { attack: 0.2, f1: 400, wet: 0.5 });
      return;
    }
    for (let k = 0; k < 12; k++) { const tt = t + rnd(0, 0.08); this.noise(tt, rnd(0.01, 0.04), 'bandpass', rnd(3000, 7000), 4, 0.08, { pan: rnd(-0.6, 0.6), wet: 0.3 }); this.bell(tt, rnd(3200, 6400), 0.15, 0.012, 1.7, 1, 0.3, rnd(-0.6, 0.6)); }
    this.noise(t + 0.06, 0.5, 'lowpass', 160, 0.8, 0.5, { attack: 0.03, f1: 900, wet: 0.4 });
    this.osc(t + 0.06, 'sine', 80, 35, 0.4, 0.35, { drive: 2, wet: 0.4 });
    this.noise(t + 0.2, 2.2, 'bandpass', 700, 0.9, 0.12, { attack: 0.2, f1: 400, wet: 0.5 });
  }
  /** Roll: a cloth whoosh, the shoulder hitting the ground, a gravel scuff. */
  roll() {
    const t = this.now(); if (t < 0) return;
    this.rec('body_fall', { gain: 0.3, delay: 0.2, rate: [1.1, 1.25] });
    this.noise(t, 0.25, 'bandpass', 900, 1.2, 0.12, { attack: 0.08, f1: 1800, wet: 0.1 });
    this.osc(t + 0.22, 'sine', 120, 50, 0.12, 0.22, { drive: 2 });
    this.noise(t + 0.24, 0.18, 'bandpass', 2400, 1, 0.07, { wet: 0.1 });
  }
  /** Jack takes a hit: a heavy body impact, a breath knocked out, a brief ear-ring on big hits. */
  hurt(heavy = false) {
    const t = this.now(); if (t < 0) return;
    this.rec('punch', { gain: heavy ? 1 : 0.75, rate: [0.78, 0.9] });
    if (heavy) this.rec('bone', { gain: 0.35 });
    this.osc(t, 'sine', 100, 38, 0.25, 0.55, { drive: 3 });
    this.noise(t, 0.12, 'lowpass', 900, 0.8, 0.22);
    this.noise(t + 0.05, 0.22, 'bandpass', 700, 3, 0.05, { attack: 0.03, f1: 450 }); // "hhuh"
    if (heavy) this.osc(t, 'sine', 3400, 3300, 1.0, 0.01, { attack: 0.01, wet: 0 });
  }

  // ── storm + nightmare ──────────────────────────────────────────────────────
  /** Thunder at `dist` metres: close = a tearing crack then the roll; far = a low long rumble. */
  thunder(dist: number, indoors = false) {
    const t = this.now(); if (t < 0) return;
    const near = Math.max(0, 1 - dist / 400), level = 0.25 + 0.75 * near, pan = rnd(-0.6, 0.6);
    const lp = indoors ? 0.35 : 1;
    if (this.rec(near > 0.5 ? 'thunder_near' : 'thunder_far', { pan, gain: level * (indoors ? 0.55 : 1), lowpass: indoors ? 650 : undefined, rate: [0.88, 1.02], wet: 0.4 })) {
      this.osc(t + 0.1, 'sine', 55, 28, 3, 0.25 * level, { attack: 0.3, wet: 0.4 });   // sub weight
      return;
    }
    if (near > 0.5) {
      this.noise(t, 0.06, 'highpass', 1800, 0.7, 0.5 * level * lp, { pan });
      this.noise(t + 0.02, 0.5, 'bandpass', 900, 0.8, 0.3 * level * lp, { pan, f1: 300, wet: 0.5 });
    }
    // The roll: several overlapping low bursts, sweeping down.
    const roll = 2.5 + (1 - near) * 3;
    for (let k = 0; k < 5; k++) {
      const tt = t + (near > 0.5 ? 0.15 : 0) + k * rnd(0.2, 0.7);
      this.noise(tt, roll * rnd(0.5, 1), 'lowpass', (near > 0.5 ? 500 : 260) * lp, 0.7, 0.35 * level, { pan: pan + rnd(-0.3, 0.3), f1: 60, attack: 0.08 + (1 - near) * 0.4, wet: 0.6 });
    }
    this.osc(t + 0.1, 'sine', 55, 28, roll, 0.35 * level, { attack: 0.3, wet: 0.4 });
  }

  /** The castle's tower clock bell: a huge, inharmonic, distant bronze toll. */
  toll() {
    const t = this.now(); if (t < 0) return;
    if (this.rec('bell', { take: 0, gain: 0.9, wet: 1, rate: [0.97, 0.99] })) { this.bell(t, 49, 7, 0.04, 1.0, 0.4, 1.0); return; }
    // Partials of a church bell (hum, prime, tierce, quint, nominal), struck and slowly decaying.
    const f = 98;
    [[0.5, 0.06, 7], [1, 0.08, 6], [1.2, 0.05, 4.5], [1.5, 0.04, 4], [2, 0.05, 3.5], [2.6, 0.02, 2.5], [3.2, 0.015, 2]].forEach(([r, a, d]) => {
      this.bell(t, f * r * rnd(0.998, 1.002), d, a, 1.0 + Math.random() * 0.02, 0.6, 1.0, rnd(-0.2, 0.2));
    });
    this.noise(t, 0.08, 'bandpass', 900, 2, 0.08, { wet: 1 });
  }

  /** Dracula's laugh — a low "mwa-ha-ha-ha" through vocal formants, placed around the player. */
  laugh(pan = 0, dist = 10, pitch = 1) {
    const t = this.now(); if (t < 0) return;
    // Recorded: Dracula's low laugh; higher voices (Miriam, Melvin, Lil' Boo) get the cackles.
    {
      const k = Math.min(1, 6 / Math.max(2, dist)), lp = 2600 + Math.max(0, 9000 - dist * 400);
      const witch = pitch > 1.2, r = witch ? Math.min(1.3, Math.max(0.9, pitch / 1.6)) : pitch * 0.82;
      if (this.rec(witch ? 'cackle' : 'evil_laugh', { pan, gain: 0.9 * k, lowpass: lp, rate: [r * 0.97, r * 1.03], wet: 0.6 })) return;
    }
    const ctx = this.ctx!;
    const gain = Math.min(1, 6 / Math.max(2, dist)), muffle = 2600 - Math.min(2000, dist * 60);
    const voice = ctx.createOscillator(); voice.type = 'sawtooth';
    const f0 = 105 * pitch;
    voice.frequency.setValueAtTime(f0 * 1.3, t);
    const breath = ctx.createBufferSource(); breath.buffer = this.a.noiseBuffer; breath.start(t, Math.random() * 3, 3);
    const bg = ctx.createGain(); bg.gain.value = 0.25;
    const mixG = ctx.createGain(); mixG.gain.value = 1;
    voice.connect(mixG); breath.connect(bg).connect(mixG);
    // "ah" formants (F1 ~700, F2 ~1150, F3 ~2500), shared by voice and breath.
    const out = ctx.createGain(); out.gain.value = 0;
    for (const [f, q, g] of [[700, 8, 1], [1150, 9, 0.6], [2500, 10, 0.25]] as const) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const fg = ctx.createGain(); fg.gain.value = g;
      mixG.connect(bp).connect(fg).connect(out);
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = muffle;
    const level = ctx.createGain(); level.gain.value = 0.9 * gain;
    out.connect(lp).connect(level); this.out(level, 1.1, pan);
    // "Mwa" then 5 descending "ha"s, each a pitch drop and an amplitude pulse.
    const syl: [number, number, number][] = [[0, 0.35, 1.25], ...[0, 1, 2, 3, 4].map((i): [number, number, number] => [0.45 + i * 0.2, 0.15, 1.12 - i * 0.07])];
    for (const [st, len, pr] of syl) {
      out.gain.setValueAtTime(0.0001, t + st);
      out.gain.exponentialRampToValueAtTime(0.5, t + st + 0.03);
      out.gain.exponentialRampToValueAtTime(0.0001, t + st + len);
      voice.frequency.setValueAtTime(f0 * pr, t + st);
      voice.frequency.exponentialRampToValueAtTime(f0 * pr * 0.85, t + st + len);
    }
    voice.start(t); voice.stop(t + 1.8);
  }

  /** A heartbeat (lub-dub). */
  heartbeat(level = 1) {
    const t = this.now(); if (t < 0) return;
    if (this.rec('heartbeat', { gain: 0.8 * level, wet: 0, rate: [0.95, 1.0] })) return;
    this.osc(t, 'sine', 62, 38, 0.12, 0.35 * level, { wet: 0 });
    this.osc(t + 0.2, 'sine', 54, 34, 0.14, 0.25 * level, { wet: 0 });
  }
  /** Dracula dissolving into mist / reforming: a hollow rush with a pitch bend. */
  mist(pan = 0) {
    const t = this.now(); if (t < 0) return;
    this.noise(t, 0.6, 'bandpass', 2400, 3, 0.12, { attack: 0.25, f1: 500, pan, wet: 0.8 });
    this.osc(t, 'sine', 300, 90, 0.6, 0.05, { attack: 0.2, pan, wet: 0.8 });
  }
  /** A swarm of bats: many tiny wing flutters and squeaks. */
  bats(pan = 0) {
    const t = this.now(); if (t < 0) return;
    this.rec('bats', { pan, gain: 0.7, wet: 0.4 });
    for (let k = 0; k < 26; k++) {
      const tt = t + Math.random() * 1.2, p = pan + rnd(-0.5, 0.5);
      this.noise(tt, 0.03, 'bandpass', rnd(900, 1600), 2, 0.05, { pan: p, wet: 0.3 });
      if (Math.random() < 0.4) this.osc(tt, 'sine', rnd(5200, 7800), rnd(4000, 6000), 0.05, 0.012, { pan: p, wet: 0.3 });
    }
  }
  /** The reveal: a full-organ minor chord with a sub hit and a cymbal-like wash. */
  revealSting() {
    const t = this.now(); if (t < 0) return;
    this.rec('sting', { take: 0, gain: 0.8, wet: 0.5, rate: [1, 1] });
    const ctx = this.ctx!;
    for (const f of [73.4, 110, 146.8, 174.6, 220, 293.7]) {        // D minor, organ stops
      for (const mult of [1, 2, 4]) {
        const o = ctx.createOscillator(); o.type = mult === 1 ? 'sawtooth' : 'square'; o.frequency.value = f * mult;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012 / mult, t + 0.06); g.gain.setValueAtTime(0.012 / mult, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
        o.connect(lp).connect(g); this.out(g, 1.2, rnd(-0.4, 0.4)); o.start(t); o.stop(t + 4.6);
      }
    }
    this.osc(t, 'sine', 60, 30, 1.2, 0.6, { drive: 2, wet: 0.6 });
    this.noise(t, 2.5, 'highpass', 4000, 0.5, 0.06, { attack: 0.01, wet: 1 });
  }
  /** Dracula falls: a long inhuman cry tearing into ash and a storm of bats. */
  bossDeath() {
    const t = this.now(); if (t < 0) return;
    this.rec('roar', { gain: 1, wet: 0.9, rate: [0.55, 0.62] });
    this.osc(t, 'sawtooth', 220, 55, 2.6, 0.08, { drive: 3, wet: 1, attack: 0.05 });
    this.osc(t, 'sawtooth', 330, 70, 2.4, 0.04, { drive: 2, wet: 1, attack: 0.05 });
    this.ashDeath(true);
    this.bats(0);
  }

  // ── title screen ──────────────────────────────────────────────────────────
  /** Hovering a hero: a low breath of wind and a faint glassy tick. */
  uiHover() {
    const t = this.now(); if (t < 0) return;
    if (this.rec('ui_hover', { gain: 0.6, wet: 0.5, rate: [0.9, 1.0] })) { this.bell(t + 0.02, 1760, 0.4, 0.008, 3.1, 1.5, 0.8); return; }
    this.noise(t, 0.35, 'bandpass', 700, 1.5, 0.05, { attack: 0.12, f1: 1400, wet: 0.6 });
    this.bell(t + 0.02, 1760, 0.4, 0.012, 3.1, 1.5, 0.8);
  }
  /** Choosing a hero: a cold chime over a heartbeat thump. */
  uiSelect() {
    const t = this.now(); if (t < 0) return;
    this.rec('ui_select', { gain: 0.6, wet: 0.5, rate: [0.85, 0.9] });
    this.bell(t, 523, 1.6, 0.05, 2.76, 3, 0.9);
    this.bell(t + 0.08, 784, 1.2, 0.025, 2.76, 2, 0.9);
    this.osc(t, 'sine', 70, 40, 0.35, 0.3, { wet: 0.3 });
  }
  /** Entering Ravencrest: the tower bell and distant thunder. */
  uiStart() {
    this.toll();
    this.thunder(220);
  }

  // ── voices: lines clipped from the Pumpkin Patch film (scripts/ravencrest/clipVoices.py) ──
  private voices = new Map<string, Promise<AudioBuffer | null>>();
  /** Play a voice clip (decoded once, cached), panned and a touch of room. */
  voice(url: string, pan = 0, gain = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.voices.has(url)) this.voices.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null));
    void this.voices.get(url)!.then((buf) => {
      if (!buf) return;
      const s = ctx.createBufferSource(); s.buffer = buf;
      const g = ctx.createGain(); g.gain.value = gain / 0.55;   // dialogue rides above the effects sub-mix
      s.connect(g); this.out(g, 0.15, pan);
      s.start();
    });
  }

  // ── the bridge battle ──────────────────────────────────────────────────────
  /** The troll's roar: a huge low growl through a formant throat, with a gravel rasp. */
  roar(pan = 0, dist = 6) {
    const t = this.now(); if (t < 0) return;
    const k = Math.max(0.25, 1 - dist / 40);
    if (this.rec('troll', { pan, gain: 1.1 * k, rate: [0.78, 0.9], wet: 0.5, lowpass: this.far(dist).lp })) {
      this.osc(t, 'sawtooth', 70, 45, 1.4, 0.06 * k, { drive: 4, wet: 0.5, attack: 0.1, pan });
      return;
    }
    this.osc(t, 'sawtooth', 95, 62, 1.6, 0.16 * k, { drive: 4, wet: 0.6, attack: 0.12, pan });
    this.osc(t, 'sawtooth', 142, 80, 1.5, 0.08 * k, { drive: 3, wet: 0.6, attack: 0.15, pan });
    this.noise(t, 1.5, 'bandpass', 520, 2.5, 0.22 * k, { attack: 0.12, f1: 260, wet: 0.5, pan });
    this.noise(t + 0.05, 1.3, 'bandpass', 1300, 3, 0.08 * k, { attack: 0.2, f1: 700, wet: 0.5, pan });
  }
  /** Something heavy hits water (big = a tentacle or the troll). */
  splash(pan = 0, big = false, dist = 10) {
    const t = this.now(); if (t < 0) return;
    const k = Math.max(0.2, 1 - dist / 60) * (big ? 1 : 0.5);
    if (this.rec(big ? 'splash_big' : 'splash', { pan, gain: Math.min(1, k * 1.5), lowpass: this.far(dist, 60).lp, rate: big ? [0.7, 0.85] : [0.9, 1.1], wet: 0.4 })) {
      if (big) this.osc(t, 'sine', 70, 32, 0.8, 0.25 * k, { wet: 0.4, pan });
      return;
    }
    this.noise(t, 0.06, 'lowpass', 300, 0.7, 0.5 * k, { pan, wet: 0.3 });
    this.noise(t + 0.01, big ? 1.4 : 0.7, 'bandpass', 1400, 0.6, 0.35 * k, { attack: 0.01, f1: 500, wet: 0.5, pan });
    this.noise(t + 0.15, big ? 1.8 : 0.9, 'highpass', 3000, 0.5, 0.09 * k, { attack: 0.08, wet: 0.6, pan });
    if (big) this.osc(t, 'sine', 70, 32, 0.8, 0.3 * k, { wet: 0.4, pan });
  }
  /** Timber splitting: a sharp crack and a groaning, splintering tail. */
  woodCrack(pan = 0, dist = 6) {
    const t = this.now(); if (t < 0) return;
    const k = Math.max(0.25, 1 - dist / 50);
    // The bridge is stone: masonry cracking and tumbling.
    if (this.rec('rock_break', { pan, gain: k, lowpass: this.far(dist).lp, rate: [0.8, 1.0], wet: 0.35 })) { this.osc(t, 'sine', 70, 30, 0.5, 0.3 * k, { wet: 0.3, pan }); return; }
    this.noise(t, 0.05, 'highpass', 1500, 0.7, 0.55 * k, { pan, wet: 0.3 });
    for (let i = 0; i < 6; i++) this.noise(t + 0.03 + i * rnd(0.03, 0.09), 0.08, 'bandpass', rnd(900, 2600), 4, 0.12 * k, { pan, wet: 0.3 });
    this.osc(t + 0.05, 'sawtooth', 180, 90, 0.6, 0.05 * k, { drive: 3, wet: 0.4, attack: 0.05, pan });
    this.osc(t, 'sine', 80, 35, 0.4, 0.3 * k, { wet: 0.3, pan });
  }
  /** A flying monkey's rifle burst: three cracks with a short distant tail. */
  rifle(pan = 0, dist = 15) {
    const t = this.now(); if (t < 0) return;
    const k = Math.max(0.15, 1 - dist / 70);
    if (this.a.samples?.has('gunshot')) {
      for (let i = 0; i < 3; i++) this.rec('gunshot', { pan, gain: 0.7 * k, delay: i * rnd(0.08, 0.11), lowpass: Math.max(1800, 9000 - dist * 90), rate: [0.95, 1.08], wet: 0.6 });
      return;
    }
    for (let i = 0; i < 3; i++) {
      const tt = t + i * rnd(0.08, 0.11);
      this.noise(tt, 0.05, 'highpass', 1200, 0.7, 0.3 * k, { pan, wet: 0.5 });
      this.noise(tt, 0.25, 'lowpass', 900, 0.7, 0.12 * k, { pan, wet: 0.7, f1: 200 });
    }
  }
  /** Miriam's green witch-lightning: a crackling zap with a rising whine. */
  witchBolt(pan = 0, dist = 15) {
    const t = this.now(); if (t < 0) return;
    const k = Math.max(0.2, 1 - dist / 60);
    if (this.rec('zap', { pan, gain: 0.85 * k, lowpass: this.far(dist, 60).lp, rate: [0.85, 1.1], wet: 0.5 })) {
      this.osc(t, 'square', 600, 2400, 0.25, 0.02 * k, { wet: 0.5, pan });
      this.osc(t, 'sine', 120, 50, 0.35, 0.15 * k, { wet: 0.4, pan });
      return;
    }
    this.osc(t, 'square', 600, 2400, 0.25, 0.03 * k, { wet: 0.5, pan });
    for (let i = 0; i < 9; i++) this.noise(t + i * rnd(0.015, 0.04), 0.03, 'highpass', 2500, 0.7, 0.18 * k, { pan, wet: 0.4 });
    this.noise(t + 0.05, 0.6, 'bandpass', 3000, 1.2, 0.06 * k, { attack: 0.02, f1: 900, wet: 0.7, pan });
    this.osc(t, 'sine', 120, 50, 0.35, 0.18 * k, { wet: 0.4, pan });
  }
  /** A tentacle tearing through the air. */
  lash(pan = 0, dist = 10) {
    const t = this.now(); if (t < 0) return;
    const k = Math.max(0.2, 1 - dist / 50);
    this.rec('swing', { pan, gain: 1.1 * k, rate: [0.42, 0.52], wet: 0.4, lowpass: this.far(dist).lp });
    this.noise(t, 0.45, 'bandpass', 220, 1.2, 0.28 * k, { attack: 0.25, f1: 900, wet: 0.3, pan });
    this.noise(t + 0.2, 0.25, 'lowpass', 600, 0.7, 0.12 * k, { attack: 0.05, wet: 0.4, pan });
  }
}
