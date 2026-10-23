// Ravencrest sound: the Dracula overture (Lorea's book score, rendered by Chora) as the score,
// plus a synthesized, location-aware soundscape and footsteps. Everything runs through one
// AudioContext with a stone-hall reverb that interiors (and the great doors) send into.
//
// Music: public/games/ravencrest/music.json → { tracks: [{ id, title, mood, lead?, gain?, hls?, url? }] }.
//  explore — the night: the `lead` track (the Dracula overture) always opens; after that the
//            explore pool plays in random order, crossfading a few seconds before each ends.
//  dread   — "Dracula Is Here": starts with the tower bell, carries the stalk and the fight
//            (boss uses its own tracks if any, otherwise keeps the dread track going, louder).
//  victory — back to the explore pool.
// `hls` is a Chora stream (scripts/ravencrest/publishScore.ts), `url` the bundled fallback;
// `gain` level-matches tracks.

import { SampleBank } from './samples';

export type Place = 'road' | 'yard' | 'hall' | 'gallery';
export type Surface = 'ASPHALT' | 'STONE' | 'WOOD_ATTIC' | 'SPIRAL_STAIR';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// Score level: a bed under the world, not over it (ambience and steps should read through).
const MUSIC_OUT = 0.55, MUSIC_IN = 0.45;
/** Combat / magic effects (sfx.ts) sit under the score. */
const SFX_LEVEL = 0.55;
export type Mood = 'explore' | 'dread' | 'boss' | 'victory';
interface Track { id: string; title?: string; mood: Mood; lead?: boolean; gain?: number; hls?: string; url?: string }
const XFADE = 4;
const DEFAULT_TRACKS: Track[] = [{ id: 'dracula-overture', title: 'Dracula — Overture', mood: 'explore', url: '/games/ravencrest/audio/dracula-overture.ogg' }];

export class GameAudio {
  private started = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private verbSend: GainNode | null = null;       // interior wetness
  private noise: AudioBuffer | null = null;
  private musicGain: GainNode | null = null;
  private tracks: Track[] = DEFAULT_TRACKS;
  private deck: { el: HTMLAudioElement; g: GainNode; track: Track; hls?: { destroy(): void } }[] = [];
  private mood: Mood = 'explore';
  private ledIn = false;
  private lastId = '';
  private musicLevel = 1;
  private rainHi: GainNode | null = null; private rainLo: GainNode | null = null;
  private storm = 0;
  private windLo: GainNode | null = null; private windHi: GainNode | null = null;
  private windLoF: BiquadFilterNode | null = null; private windHiF: BiquadFilterNode | null = null;
  private room: GainNode | null = null;
  private place: Place = 'road';
  private nextEvent = 0;
  private nextCrackle = 0;
  private stride = 0;
  private foot = 0;
  muted = new URLSearchParams(location.search).get('audio') === '0';

  /** Browsers require a user gesture before audio can start. */
  armOnFirstGesture() {
    const go = () => { this.start(); removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
    addEventListener('pointerdown', go);
    addEventListener('keydown', go);
  }

  private get inside() { return this.place === 'hall' || this.place === 'gallery'; }
  // Shared with sfx.ts (combat + magic voices).
  get context() { return this.ctx; }
  get bus() { return this.master; }
  /** Sub-mix for the synthesized combat and magic effects. */
  get sfxBus() { return this.sfx; }
  private sfx: GainNode | null = null;
  get verb() { return this.reverb; }
  get noiseBuffer() { return this.noise; }
  get indoors() { return this.inside; }
  /** Recorded CC0 bank (thunder, creatures, impacts, steps, beds); synth layers cover until it loads. */
  samples: SampleBank | null = null;
  private recRain: GainNode | null = null; private recWind: GainNode | null = null; private recNight: GainNode | null = null;

  private start() {
    if (this.started || this.muted) return;
    this.started = true;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = SFX_LEVEL;
    this.sfx.connect(this.master);
    // Shared noise source material (5 s, white).
    const len = ctx.sampleRate * 5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Stone-hall reverb (3.5 s, darkened tail).
    const rl = Math.floor(ctx.sampleRate * 3.5);
    const ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < rl; i++) { lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.4 * (i / rl)); ch[i] = lp * Math.pow(1 - i / rl, 2.4) * (i < 400 ? i / 400 : 1); }
    }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.85;
    this.reverb.connect(wet).connect(this.master);
    this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0;
    this.verbSend.connect(this.reverb);
    this.startBeds();
    this.samples = new SampleBank(ctx, () => this.master!, () => this.reverb);
    void this.samples.load().then(() => {
      this.recRain = this.samples!.loop('rain_loop', this.master!);
      this.recWind = this.samples!.loop('wind_loop', this.master!);
      this.recNight = this.samples!.loop('night_loop', this.master!);
    });
    this.startMusic();
  }

  // ── Music ──────────────────────────────────────────────────────────────────
  private async startMusic() {
    const ctx = this.ctx!;
    try {
      const r = await fetch('/games/ravencrest/music.json');
      if (r.ok) {
        const j = await r.json() as { tracks?: Track[]; hls?: string; url?: string };
        if (Array.isArray(j.tracks) && j.tracks.length) this.tracks = j.tracks.map((t) => ({ ...t, mood: t.mood ?? 'explore' }));
        else if (j.hls || j.url) this.tracks = [{ ...DEFAULT_TRACKS[0], hls: j.hls, url: j.url ?? DEFAULT_TRACKS[0].url }];
      }
    } catch { /* bundled fallback */ }
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = MUSIC_OUT;
    this.musicGain.connect(this.master!);
    this.setMood(this.mood, true);
  }

  /** Switch the score's mood: crossfade to that mood's next track ('dread' fades to silence). */
  setMood(mood: Mood, force = false) {
    if (mood === this.mood && !force && this.deck.length) return;
    const prev = this.mood;
    this.mood = mood;
    if (!this.ctx || !this.musicGain) return;
    const pick = (m: Mood) => this.tracks.filter((t) => t.mood === m);
    // Boss with no boss track: "Dracula Is Here" keeps going (no restart), just louder.
    if (mood === 'boss' && !pick('boss').length && prev === 'dread' && this.deck.length) {
      this.musicLevel = 1.3;
      for (const d of this.deck) d.g.gain.setTargetAtTime(this.musicLevel * (d.track.gain ?? 1), this.ctx.currentTime, 1);
      return;
    }
    const want: Mood = mood === 'victory' && !pick('victory').length ? 'explore' : mood === 'boss' && !pick('boss').length ? 'dread' : mood;
    const list = pick(want);
    this.musicLevel = mood === 'boss' ? 1.3 : 1;
    this.fadeOutDeck(want === 'dread' ? 1.2 : 1.5);
    if (!list.length) return;
    // The night always opens on the lead track; after that, a random pick (never the same twice).
    let track = list[0];
    if (want === 'explore') {
      const lead = list.find((t) => t.lead);
      if (lead && !this.ledIn) { track = lead; this.ledIn = true; }
      else { const pool = list.filter((t) => t.id !== this.lastId); track = pool[Math.floor(Math.random() * pool.length)] ?? list[0]; }
    }
    this.lastId = track.id;
    void this.playTrack(track, want === 'dread' || list.length === 1);
  }

  private fadeOutDeck(tau: number) {
    const now = this.ctx!.currentTime;
    for (const d of this.deck) {
      d.g.gain.setTargetAtTime(0, now, tau);
      const old = d; setTimeout(() => { old.el.pause(); old.hls?.destroy(); old.el.remove(); }, tau * 6000);
    }
    this.deck = [];
  }

  private async playTrack(track: Track, loop: boolean) {
    const ctx = this.ctx!;
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.loop = loop;
    el.preload = 'auto';
    let hls: { destroy(): void } | undefined;
    if (track.hls) {
      if (el.canPlayType('application/vnd.apple.mpegurl')) el.src = track.hls;
      else {
        try {
          const { default: Hls } = await import('hls.js');
          if (Hls.isSupported()) { const h = new Hls({ maxBufferLength: 30 }); h.loadSource(track.hls); h.attachMedia(el); hls = h; }
          else if (track.url) el.src = track.url;
        } catch { if (track.url) el.src = track.url; }
      }
    } else if (track.url) el.src = track.url;
    const g = ctx.createGain(); g.gain.value = 0;
    ctx.createMediaElementSource(el).connect(g).connect(this.musicGain!);
    const entry = { el, g, track, hls };
    this.deck.push(entry);
    // Explore pool: a few seconds before a track ends, crossfade into the next random one.
    let handed = false;
    el.addEventListener('timeupdate', () => {
      if (handed || el.loop || !isFinite(el.duration) || !this.deck.includes(entry)) return;
      if (el.duration - el.currentTime < XFADE) { handed = true; this.setMood(this.mood, true); }
    });
    el.addEventListener('ended', () => { if (!handed && this.deck.includes(entry)) { handed = true; this.setMood(this.mood, true); } });
    el.play().catch(() => {});
    g.gain.setTargetAtTime(this.musicLevel * (track.gain ?? 1), ctx.currentTime + 0.1, 1.2);
  }

  /** 0 clear … 1 full storm: rain bed, harder wind. */
  setStorm(s: number) { this.storm = s; }
  private day = 0;
  /** 0 night … 1 morning: birdsong replaces the night creatures. */
  setDay(k: number) { this.day = k; }
  private birdAt = 0;
  private bird() {
    const t = this.ctx!.currentTime, pan = rnd(-0.9, 0.9);
    const kind = Math.random();
    const notes = kind < 0.4 ? 3 + Math.floor(Math.random() * 4) : kind < 0.75 ? 2 : 6;
    const base = rnd(2400, 4200);
    for (let i = 0; i < notes; i++) {
      const tt = t + i * (kind < 0.75 ? rnd(0.09, 0.16) : 0.05);
      const f0 = base * rnd(0.85, 1.2), f1 = f0 * (Math.random() < 0.5 ? rnd(1.15, 1.5) : rnd(0.7, 0.9));
      this.tone(tt, 'sine', f0, f1, kind < 0.75 ? rnd(0.06, 0.12) : 0.035, 0.02, 0.15, pan, 0.005, kind < 0.4 ? 30 : 0);
    }
  }

  // ── Ambience beds ──────────────────────────────────────────────────────────
  private loopNoise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise; s.loop = true; s.loopStart = Math.random() * 2; s.start(0, Math.random() * 4);
    return s;
  }
  private startBeds() {
    const ctx = this.ctx!;
    // Wind: a low body + a whistling high layer, both swept by gusts.
    this.windLoF = ctx.createBiquadFilter(); this.windLoF.type = 'lowpass'; this.windLoF.frequency.value = 320; this.windLoF.Q.value = 0.5;
    this.windLo = ctx.createGain(); this.windLo.gain.value = 0;
    this.loopNoise().connect(this.windLoF).connect(this.windLo).connect(this.master!);
    this.windHiF = ctx.createBiquadFilter(); this.windHiF.type = 'bandpass'; this.windHiF.frequency.value = 900; this.windHiF.Q.value = 7;
    this.windHi = ctx.createGain(); this.windHi.gain.value = 0;
    this.loopNoise().connect(this.windHiF).connect(this.windHi).connect(this.master!);
    // Interior room tone (low rumble) — also feeds the reverb a little.
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 140;
    this.room = ctx.createGain(); this.room.gain.value = 0;
    this.loopNoise().connect(rf).connect(this.room).connect(this.master!);
    // Rain: a hiss of drops plus the low roar of a downpour on stone and water.
    const rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 1800;
    const rp = ctx.createBiquadFilter(); rp.type = 'peaking'; rp.frequency.value = 5200; rp.gain.value = 5;
    this.rainHi = ctx.createGain(); this.rainHi.gain.value = 0;
    this.loopNoise().connect(rh).connect(rp).connect(this.rainHi).connect(this.master!);
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 600;
    this.rainLo = ctx.createGain(); this.rainLo.gain.value = 0;
    this.loopNoise().connect(rl).connect(this.rainLo).connect(this.master!);
  }

  /** Per-frame: crossfade beds by location, drift the wind, schedule spot sounds. */
  update(t: number, place: Place) {
    this.place = place;
    const ctx = this.ctx;
    if (!ctx || !this.windLo || !this.windHi || !this.room || !this.verbSend) return;
    const now = ctx.currentTime;
    const out = !this.inside;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.17) * Math.sin(t * 0.063 + 1.3) + 0.15 * Math.sin(t * 0.9);
    const st = this.storm;
    const syn = this.recWind ? 0.45 : 1;   // the recordings carry the beds once loaded
    this.windLo.gain.setTargetAtTime(syn * (out ? (0.16 + 0.22 * gust) * (1 + st * 1.4) : 0.03 + st * 0.03), now, 0.6);
    this.windLoF!.frequency.setTargetAtTime(220 + 260 * gust, now, 0.5);
    this.windHi.gain.setTargetAtTime(out ? (0.012 + 0.05 * Math.max(0, gust - 0.4)) * (1 + st * 2) : (0.008 + st * 0.02) * gust, now, 0.4);
    const rain = Math.max(0, Math.min(1, (st - 0.25) / 0.6));
    this.rainHi?.gain.setTargetAtTime(syn * (out ? 0.07 * rain : 0.012 * rain), now, 0.8);
    this.rainLo?.gain.setTargetAtTime(syn * (out ? 0.14 * rain : 0.05 * rain), now, 0.8);
    this.recRain?.gain.setTargetAtTime(out ? 0.55 * rain : 0.1 * rain, now, 0.8);
    this.recWind?.gain.setTargetAtTime(out ? (0.22 + 0.3 * gust) * (0.7 + st * 0.6) : 0.04 + st * 0.05, now, 0.6);
    this.recNight?.gain.setTargetAtTime(out ? 0.3 * (1 - this.day) * (1 - rain * 0.7) : 0, now, 1.2);
    this.windHiF!.frequency.setTargetAtTime(700 + 900 * gust, now, 0.3);
    this.room.gain.setTargetAtTime(out ? 0 : 0.22, now, 0.8);
    this.verbSend.gain.setTargetAtTime(out ? 0.06 : 0.55, now, 0.5);
    this.musicGain?.gain.setTargetAtTime((out ? MUSIC_OUT : MUSIC_IN) * (this.mood === 'boss' ? 1.3 : 1), now, 1.2);

    // Fire crackle: constant inside (hearth, torches, candles), lighter in the bailey.
    if (now >= this.nextCrackle) {
      this.nextCrackle = now + rnd(0.04, place === 'road' ? 0.6 : 0.18);
      if (place !== 'road') this.crackle(out ? 0.05 : 0.09);
    }
    // Morning: birds in the bushes and trees all around.
    if (this.day > 0.4 && out && now >= this.birdAt) { this.birdAt = now + rnd(0.6, 2.6) / this.day; this.bird(); }
    if (this.day > 0.5) return;
    // Spot events.
    if (now >= this.nextEvent) {
      this.nextEvent = now + rnd(out ? 4 : 5, out ? 11 : 13);
      const r = Math.random();
      if (out) {
        if (this.storm > 0.5 && r < 0.62) this.raven();
        else if (r < 0.25) this.owl(); else if (r < 0.45) this.crickets(); else if (r < 0.62) this.raven();
        else if (r < 0.8) this.wolf(); else this.thunder();
      } else {
        if (r < 0.35) this.drip(); else if (r < 0.65) this.creak(); else if (r < 0.85) this.chains(); else this.thunder(true);
      }
    }
  }

  // ── Spot sounds ────────────────────────────────────────────────────────────
  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  /** Route a voice: dry to master + some reverb (`wet`), optionally panned. */
  private out(node: AudioNode, wet = 0.3, pan = rnd(-0.7, 0.7)) {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(p).connect(this.master!);
    const s = ctx.createGain(); s.gain.value = wet;
    p.connect(s).connect(this.reverb!);
  }
  private burst(t: number, dur: number, type: BiquadFilterType, f: number, q: number, peak: number, wet = 0.2, pan?: number, attack = 0.002) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random() * 4, dur + 0.1);
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); this.env(g, t, peak, attack, dur);
    s.connect(fl).connect(g); this.out(g, wet, pan);
    return { fl, g };
  }
  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, wet = 0.4, pan?: number, attack = 0.04, vib = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (vib) { const l = ctx.createOscillator(); l.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const g = ctx.createGain(); this.env(g, t, peak, attack, dur);
    o.connect(g); this.out(g, wet, pan); o.start(t); o.stop(t + attack + dur + 0.05);
  }
  private crackle(level: number) {
    const t = this.ctx!.currentTime;
    for (let i = 0; i < (Math.random() < 0.3 ? 3 : 1); i++) this.burst(t + i * rnd(0.01, 0.04), rnd(0.004, 0.02), 'bandpass', rnd(1800, 5200), 1.2, level * rnd(0.4, 1), 0.25);
    if (Math.random() < 0.15) this.burst(t, 0.12, 'lowpass', 500, 0.7, level * 0.6, 0.2); // a log settling
  }
  private owl() {
    if (this.samples?.play('owl', { pan: rnd(-0.9, 0.9), gain: 0.4, wet: 0.5, lowpass: 3200, rate: [0.95, 1.03] })) return;
    const t = this.ctx!.currentTime, pan = rnd(-0.9, 0.9);
    // "hoo… hoo-hoo": soft, slightly falling, breathy.
    [[0, 0.45], [0.75, 0.22], [1.05, 0.5]].forEach(([dt, d]) => {
      this.tone(t + dt, 'sine', 410, 360, d, 0.05, 0.5, pan, 0.06);
      this.burst(t + dt, d, 'bandpass', 400, 8, 0.012, 0.5, pan, 0.05);
    });
  }
  private crickets() {
    const t = this.ctx!.currentTime, pan = rnd(-0.8, 0.8), f = rnd(4200, 5200);
    for (let c = 0; c < 6; c++) for (let p = 0; p < 4; p++) this.tone(t + c * 0.42 + p * 0.035, 'sine', f, f * 0.98, 0.02, 0.012, 0.1, pan, 0.004);
  }
  private raven() {
    if (this.samples?.play('raven', { pan: rnd(-0.9, 0.9), gain: 0.45, wet: 0.45, lowpass: 5000 })) return;
    const t = this.ctx!.currentTime, pan = rnd(-0.9, 0.9);
    for (let k = 0; k < (Math.random() < 0.5 ? 2 : 3); k++) {
      const tt = t + k * 0.42;
      this.tone(tt, 'sawtooth', 620, 380, 0.22, 0.025, 0.45, pan, 0.01);
      this.burst(tt, 0.22, 'bandpass', 1300, 3, 0.05, 0.45, pan, 0.01);
    }
  }
  private wolf() {
    if (this.samples?.play('wolf_howl', { pan: rnd(-1, 1), gain: 0.3, wet: 0.9, lowpass: 1800, rate: [0.92, 1.02] })) return;
    const t = this.ctx!.currentTime, pan = rnd(-1, 1);
    // A distant howl: rising, holding with vibrato, falling; heavily distanced (lowpassed, wet).
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(560, t + 0.9); o.frequency.setValueAtTime(560, t + 2.2); o.frequency.exponentialRampToValueAtTime(380, t + 3.4);
    const l = ctx.createOscillator(); l.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 9; l.connect(lg).connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 2.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.6); g.gain.setValueAtTime(0.03, t + 2.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    o.connect(f1).connect(lp).connect(g); this.out(g, 0.9, pan);
    o.start(t); l.start(t); o.stop(t + 3.7); l.stop(t + 3.7);
  }
  private thunder(muffled = false) {
    if (this.samples?.play('thunder_far', { pan: rnd(-0.4, 0.4), gain: muffled ? 0.35 : 0.7, wet: 0.5, lowpass: muffled ? 400 : undefined, rate: [0.85, 1] })) return;
    const t = this.ctx!.currentTime;
    const { fl } = this.burst(t, rnd(3, 5), 'lowpass', muffled ? 180 : 420, 0.6, muffled ? 0.12 : 0.28, 0.6, rnd(-0.4, 0.4), 0.15);
    fl.frequency.setValueAtTime(muffled ? 180 : 900, t); fl.frequency.exponentialRampToValueAtTime(70, t + 4);
  }
  private drip() {
    const t = this.ctx!.currentTime, pan = rnd(-0.8, 0.8);
    for (let k = 0; k < 3; k++) { const f = rnd(1400, 2400); this.tone(t + k * rnd(0.6, 1.4), 'sine', f, f * 1.6, 0.05, 0.03, 0.8, pan, 0.002); }
  }
  private creak() {
    if (Math.random() < 0.6 && this.samples?.play('door_creak', { pan: rnd(-0.9, 0.9), gain: 0.22, wet: 0.9, rate: [0.6, 0.85] })) return;
    const t = this.ctx!.currentTime, ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(rnd(60, 90), t); o.frequency.linearRampToValueAtTime(rnd(90, 140), t + 0.7);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(500, 900); bp.Q.value = 9;
    const am = ctx.createOscillator(); am.frequency.value = rnd(18, 30); const amg = ctx.createGain(); amg.gain.value = 0.015;
    const g = ctx.createGain(); this.env(g, t, 0.025, 0.15, 0.7);
    am.connect(amg).connect(g.gain);
    o.connect(bp).connect(g); this.out(g, 0.7);
    o.start(t); am.start(t); o.stop(t + 0.95); am.stop(t + 0.95);
  }
  private chains() {
    if (this.samples?.play('chains', { pan: rnd(-0.9, 0.9), gain: 0.25, wet: 0.9, lowpass: 3500 })) return;
    const t = this.ctx!.currentTime, pan = rnd(-0.9, 0.9);
    for (let k = 0; k < 5; k++) { const f = rnd(2200, 4200); this.tone(t + k * rnd(0.07, 0.16), 'triangle', f, f * 0.97, 0.18, 0.012, 0.9, pan, 0.002); }
  }

  // ── Footsteps ──────────────────────────────────────────────────────────────
  /** Footsteps from distance travelled, so cadence always matches the stride. */
  step(distance: number, speed: number, surface: Surface) {
    if (!this.ctx) return;
    const running = speed > 3.2;
    this.stride += distance;
    const len = running ? 1.45 : 0.82;
    if (this.stride < len) return;
    this.stride = 0;
    this.foot ^= 1;
    const t = this.ctx.currentTime;
    const v = (running ? 1 : 0.6) * rnd(0.85, 1.1);
    const pan = this.foot ? -0.12 : 0.12;
    const wet = this.inside ? 0.45 : 0.05;
    // Heel strike, then the toe roll-off a few ms later (shorter when running).
    const toe = running ? 0.045 : 0.075;
    const bank = surface === 'WOOD_ATTIC' ? 'step_wood' : 'step_stone';
    if (this.samples?.play(bank, { pan, gain: (running ? 0.85 : 0.55) * rnd(0.85, 1.05), wet, rate: running ? [1.0, 1.12] : [0.88, 1.0], lowpass: surface === 'ASPHALT' ? 3800 : undefined })) {
      if (surface === 'ASPHALT' && this.storm > 0.35) this.burst(t + toe * 0.6, 0.09, 'bandpass', rnd(2400, 3200), 3, 0.03 * v, wet, pan);
      return;
    }
    if (surface === 'ASPHALT') {
      // Wet road: a gritty scuff plus a little splash.
      this.burst(t, 0.035, 'bandpass', rnd(1100, 1500), 1.4, 0.09 * v, wet, pan);
      this.burst(t + toe, 0.05, 'highpass', rnd(2800, 3600), 0.8, 0.05 * v, wet, pan);
      this.burst(t + toe * 0.6, 0.09, 'bandpass', rnd(2400, 3200), 3, 0.025 * v, wet, pan);
      this.tone(t, 'sine', 120, 55, 0.05, 0.08 * v, wet, pan, 0.002);
    } else if (surface === 'WOOD_ATTIC') {
      // Planks: a hollow resonant thump and a soft board creak.
      this.tone(t, 'triangle', rnd(150, 175), 70, 0.11, 0.16 * v, wet, pan, 0.002);
      this.burst(t, 0.04, 'bandpass', rnd(700, 950), 2.5, 0.08 * v, wet, pan);
      this.burst(t + toe, 0.04, 'bandpass', rnd(1100, 1400), 2, 0.05 * v, wet, pan);
      if (Math.random() < 0.15) this.tone(t + 0.05, 'sawtooth', 220, 260, 0.12, 0.006, wet, pan, 0.02);
    } else {
      // Stone: a sharp boot-heel click (leather on flagstone) with the hall's echo.
      this.burst(t, 0.022, 'bandpass', rnd(2600, 3400), 2.2, 0.11 * v, wet, pan);
      this.tone(t, 'sine', rnd(190, 230), 80, 0.045, 0.1 * v, wet, pan, 0.0015);
      this.burst(t + toe, 0.03, 'bandpass', rnd(1700, 2300), 1.8, 0.06 * v, wet, pan);
    }
  }

  // ── The great doors ────────────────────────────────────────────────────────
  private ensure() { if (this.muted) return null; if (!this.ctx) this.start(); return this.ctx; }
  /** Iron-hinge groan (opening) or a deep slam (closing), echoing down the nave. */
  door(kind: 'open' | 'close') {
    const ctx = this.ensure();
    if (!ctx || !this.reverb) return;
    const t = ctx.currentTime;
    const outG = ctx.createGain(); outG.gain.value = 1;
    outG.connect(this.master!);
    const send = ctx.createGain(); send.gain.value = 0.9; outG.connect(send).connect(this.reverb);
    if (kind === 'open') {
      this.samples?.play('door_creak', { gain: 0.9, wet: 0.9, rate: [0.55, 0.62], take: 0 }, outG);
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, t);
      for (let i = 1; i <= 12; i++) osc.frequency.linearRampToValueAtTime(48 + Math.random() * 40, t + i * 0.18);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.25); g.gain.setValueAtTime(0.3, t + 1.8); g.gain.linearRampToValueAtTime(0, t + 2.3);
      const am = ctx.createOscillator(); am.frequency.value = 23; const amg = ctx.createGain(); amg.gain.value = 0.1;
      am.connect(amg).connect(g.gain);
      osc.connect(bp).connect(g).connect(outG);
      osc.start(t); am.start(t); osc.stop(t + 2.4); am.stop(t + 2.4);
    }
    const at = kind === 'open' ? t + 0.05 : t;
    const boom = ctx.createOscillator(); boom.type = 'sine';
    boom.frequency.setValueAtTime(kind === 'close' ? 70 : 95, at); boom.frequency.exponentialRampToValueAtTime(28, at + 0.6);
    const bg = ctx.createGain(); bg.gain.setValueAtTime(kind === 'close' ? 1.0 : 0.45, at); bg.gain.exponentialRampToValueAtTime(0.001, at + 1.2);
    boom.connect(bg).connect(outG); boom.start(at); boom.stop(at + 1.3);
    const ns = ctx.createBufferSource(); ns.buffer = this.noise; ns.start(at, 0, 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'close' ? 900 : 1600;
    const ng = ctx.createGain(); this.env(ng, at, kind === 'close' ? 0.7 : 0.35, 0.003, 0.4);
    ns.connect(lp).connect(ng).connect(outG);
  }
}
