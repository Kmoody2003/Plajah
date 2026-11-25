// Rift Realm's score + beat clock + procedural combat SFX.
//
// The music director plays Kenne's score (assets/audio/score.json): tracks are tagged by moment (menu, explore,
// combat, boss, showdown, victory, defeat) and the game sets the mood; the director crossfades to a track from that
// pool (no immediate repeats) and moves on to another when one ends. The beat clock follows the song that's playing:
// each track carries its own beat times (tracked offline from the audio), so "on beat" means on that song's beat,
// whatever its tempo. With no score (autoplay refused, file missing) a silent 124 BPM grid keeps the game playable.
export type BeatQuality = 'PERFECT' | 'GOOD' | 'OFF';

export interface BeatEval {
  quality: BeatQuality;
  beatIndex: number;
  offsetMs: number;
}

export type Mood = 'menu' | 'explore' | 'combat' | 'boss' | 'showdown' | 'victory' | 'defeat';

interface ScoreTrack { id: string; title: string; file: string; roles: string[]; bpm: number; energy: number; beats: number[]; downbeatIndex: number }

const AUDIO = '/games/rift-realm/assets/audio/';
const FALLBACK_BEAT = 60 / 124;
const FADE = 2.4;

// Sampled SFX + forest ambience (assets/audio/sfx, generated 2026-11-22 for Kenne: guns that sound powerful and
// unique, "not like some 8bit toy", and a real ambient soundscape for the forest).
// name -> number of takes (files <name>_<n>.mp3); amb_* are seamless loops.
const SFX: Record<string, number> = {
  lance: 3, scatter: 3, chord: 3, hit: 3, kill: 2, surge: 1, reload: 1, empty: 1, melee: 2,
  // per-weapon handling (src/weapons.ts, cut by scripts/riftrealm/sfx/weapons.py from the Flow-video clip library):
  // reload parts from the same mocap videos as the body's reload clips (r = rifle, p = pistol), dry fire, switch, impacts
  magout_r: 1, magin_r: 1, charge_r: 1, magout_p: 1, magin_p: 1, charge_p: 1, dry: 2, switch: 2,
  imp_lance: 2, imp_scatter: 2, imp_chord: 2,
  // layered vessel shots (scripts/riftrealm/sfx/shots.py): the sampled gun body + laser zap + magic (chime, sub, crackle)
  // + each vessel's tail; *_p = the PERFECT-beat bloom
  shot_lance: 3, shot_lance_p: 2, shot_scatter: 3, shot_scatter_p: 2, shot_chord: 3, shot_chord_p: 2,
  // spirit energy (shots.py --spirit): the vent's hiss + attune chime, the overheat warning, charge flowing in
  vent_hiss: 2, vent_chime: 1, overheat: 1, recharge: 2,
};
const AMB = ['amb_forest', 'amb_stream', 'amb_drone'] as const;
/** Each vessel's own gun voice (vessels.ts ids). */
const GUN: Record<string, string> = { aegis: 'lance', stalker: 'scatter', seraph: 'chord', sylva: 'chord', pyre: 'scatter' };
export type Ambience = 'forest' | 'none';
const AMB_MIX: Record<Ambience, Record<string, number>> = {
  forest: { amb_forest: 0.42, amb_stream: 0.14, amb_drone: 0.16 },
  none: {},
};

/** A forest-room impulse response: dense early reflections, a ~1.6 s damped tail (darker as it decays). */
function forestIR(ctx: BaseAudioContext, sec = 1.8) {
  const n = Math.floor(ctx.sampleRate * sec), ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      const k = 0.35 + 0.6 * Math.min(1, t / sec);           // low-pass coefficient grows: the tail darkens
      lp += (Math.random() * 2 - 1 - lp) * (1 - k);
      const early = t < 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 2.5 : 0;
      d[i] = (lp + early) * Math.exp(-t * 3.4) * (t < 0.006 ? t / 0.006 : 1);
    }
  }
  return ir;
}

/** One playing deck: an <audio> through its own gain, with the track it holds. */
interface Deck { el: HTMLAudioElement; gain: GainNode; track: ScoreTrack | null; cursor: number }

export class RhythmEngine {
  private ctx: AudioContext | null = null;
  private startTime = 0;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  private tracks: ScoreTrack[] = [];
  private decks: Deck[] = [];
  private live = 0;                 // index of the deck the beat clock follows
  private mood: Mood = 'menu';
  private recent: string[] = [];
  private loading: Promise<void> | null = null;
  // sampled SFX: dry -> compressor -> master, plus a send into the forest reverb
  private sfxIn: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sfxLoading: Promise<void> | null = null;
  private ambBus: GainNode | null = null;
  private amb = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private ambience: Ambience = 'forest';

  /** 0..1 phase within current beat (0 = exact beat). */
  phase = 0;
  /** 0..1 decaying pulse peaking on each beat + audio bass energy for shaders/HUD. */
  pulse = 0;
  beatIndex = 0;
  /** Seconds per beat of the playing song (for hold-to-fire repeats and HUD rings). */
  beatSec = FALLBACK_BEAT;
  /** True on the first beat of a bar. */
  downbeat = false;
  /** The playing track's title (HUD "now playing"). */
  nowPlaying = '';
  onTrackChange?: (title: string, mood: Mood) => void;

  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.musicGain.connect(this.analyser);
      this.analyser.connect(this.master);

      this.initSfx();

      this.startTime = this.ctx.currentTime + 0.05;
      for (let i = 0; i < 2; i++) {
        const el = new Audio();
        el.crossOrigin = 'anonymous';
        el.preload = 'auto';
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        this.ctx.createMediaElementSource(el).connect(gain);
        gain.connect(this.musicGain);
        el.addEventListener('ended', () => { if (this.decks[this.live]?.el === el) this.next(); });
        this.decks.push({ el, gain, track: null, cursor: 0 });
      }
      this.loading = this.loadScore();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    void this.loading?.then(() => { if (!this.decks[this.live].track) this.next(); else void this.decks[this.live].el.play().catch(() => {}); });
  }

  private async loadScore() {
    try {
      const j = await (await fetch(AUDIO + 'score.json')).json();
      this.tracks = j.tracks ?? [];
    } catch { this.tracks = []; }
  }

  /** A song that doesn't fit the new mood keeps playing until it is this far through (Kenne: let most of the song
   *  play), then hands over at the next bar. Only the end of a match (victory / defeat) cuts straight across. */
  static readonly LET_PLAY = 0.8;
  private pending = false;

  /** Set the moment the music should fit. The song changes only once the current one has mostly played. */
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    const was = this.mood;
    this.mood = mood;
    const cur = this.decks[this.live]?.track;
    if (!this.ctx) return;
    if (!cur || was === 'menu' || mood === 'victory' || mood === 'defeat') { this.pending = false; this.next(); return; }
    // the song carries on; if it doesn't suit the new moment, the next one will (picked when it's mostly done)
    this.pending = !cur.roles.includes(mood);
  }

  /** Called every frame: hand over to the mood's music once the playing song is mostly through, on a downbeat. */
  private handover() {
    if (!this.pending) return;
    const d = this.decks[this.live];
    const dur = d?.el.duration;
    if (!d?.track || !dur || !isFinite(dur)) return;
    if (d.el.currentTime / dur >= RhythmEngine.LET_PLAY && this.downbeat && this.phase < 0.25) { this.pending = false; this.next(); }
  }

  /** Back-compat with the old two-track API (biome changes). */
  setTrack(track: 'main' | 'combat') { this.setMood(track === 'combat' ? 'combat' : 'explore'); }

  /** Skip to another song from the current mood's pool. */
  skip() { if (this.ctx) this.next(); }

  private pick(): ScoreTrack | null {
    let pool = this.tracks.filter((t) => t.roles.includes(this.mood));
    if (!pool.length) pool = this.tracks.filter((t) => t.roles.includes('explore'));
    if (!pool.length) return null;
    const fresh = pool.filter((t) => !this.recent.includes(t.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  private next() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.pending = false;
    const t = this.pick();
    if (!t) return;
    this.recent = [t.id, ...this.recent.filter((r) => r !== t.id)].slice(0, Math.max(1, Math.min(4, this.tracks.length - 1)));
    const out = this.decks[this.live], inc = this.decks[1 - this.live];
    const now = ctx.currentTime;
    inc.track = t; inc.cursor = 0;
    inc.el.src = AUDIO + t.file;
    inc.el.currentTime = 0;
    inc.gain.gain.cancelScheduledValues(now);
    inc.gain.gain.setValueAtTime(0, now);
    inc.gain.gain.linearRampToValueAtTime(1, now + FADE);
    out.gain.gain.cancelScheduledValues(now);
    out.gain.gain.setValueAtTime(out.gain.gain.value, now);
    out.gain.gain.linearRampToValueAtTime(0, now + FADE);
    window.setTimeout(() => { if (this.decks[this.live] !== out) out.el.pause(); }, FADE * 1000 + 100);
    this.live = 1 - this.live;
    this.nowPlaying = t.title;
    void inc.el.play().catch(() => { /* autoplay refused: the fallback grid keeps time */ });
    this.onTrackChange?.(t.title, this.mood);
  }

  /** Song time in seconds the listener hears now (or null if no song is playing). */
  private songTime(): { d: Deck; t: number } | null {
    const d = this.decks[this.live];
    if (!d?.track || d.el.paused || !this.ctx) return null;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return { d, t: d.el.currentTime - lat };
  }

  /** Index of the last beat at or before t (cursor-cached; the song only moves forward between frames). */
  private beatAt(d: Deck, t: number) {
    const b = d.track!.beats;
    let i = Math.min(d.cursor, b.length - 1);
    if (i > 0 && b[i] > t) i = 0;
    while (i + 1 < b.length && b[i + 1] <= t) i++;
    d.cursor = i;
    return i;
  }

  update() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const st = this.songTime();
    let phase: number, idx: number;
    if (st && st.d.track!.beats.length > 1 && st.t >= st.d.track!.beats[0]) {
      const b = st.d.track!.beats;
      idx = this.beatAt(st.d, st.t);
      const span = (b[idx + 1] ?? b[idx] + (b[idx] - b[idx - 1])) - b[idx];
      this.beatSec = span;
      phase = Math.min(0.999, (st.t - b[idx]) / span);
      this.downbeat = (idx - st.d.track!.downbeatIndex) % 4 === 0;
    } else {
      const exact = Math.max(0, this.ctx.currentTime - this.startTime) / FALLBACK_BEAT;
      idx = Math.floor(exact); phase = exact - idx; this.beatSec = FALLBACK_BEAT; this.downbeat = idx % 4 === 0;
    }
    this.beatIndex = idx;
    this.phase = phase;
    this.handover();

    let bassEnergy = 0;
    if (this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);
      bassEnergy = ((this.freqData[0] + this.freqData[1] + this.freqData[2]) / (3 * 255)) * 0.6;
    }
    const clockPulse = Math.exp(-this.phase * 5.2) * (this.downbeat ? 1 : 0.85);
    this.pulse = Math.min(1.0, Math.max(clockPulse, bassEnergy));
  }

  evaluateBeat(): BeatEval {
    if (!this.ctx) return { quality: 'GOOD', beatIndex: 0, offsetMs: 0 };
    let offsetSec: number, nearest: number;
    const st = this.songTime();
    if (st && st.d.track!.beats.length > 1) {
      const b = st.d.track!.beats;
      const i = this.beatAt(st.d, st.t);
      const a = Math.abs(st.t - b[i]), c = i + 1 < b.length ? Math.abs(b[i + 1] - st.t) : Infinity;
      nearest = c < a ? i + 1 : i; offsetSec = Math.min(a, c);
    } else {
      const exact = Math.max(0, this.ctx.currentTime - this.startTime) / FALLBACK_BEAT;
      nearest = Math.round(exact); offsetSec = Math.abs(exact - nearest) * FALLBACK_BEAT;
    }
    const offsetMs = Math.round(offsetSec * 1000);
    // windows scale a little with the song's tempo (slow songs give a touch more room), clamped
    const k = Math.min(1.2, Math.max(0.85, this.beatSec / FALLBACK_BEAT));
    if (offsetSec <= 0.09 * k) return { quality: 'PERFECT', beatIndex: nearest, offsetMs };
    if (offsetSec <= 0.175 * k) return { quality: 'GOOD', beatIndex: nearest, offsetMs };
    return { quality: 'OFF', beatIndex: nearest, offsetMs };
  }

  // -- sampled SFX + ambience --------------------------------------------------------------------------------------
  private initSfx() {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
    this.sfxIn = ctx.createGain();
    this.sfxIn.gain.value = 0.95;
    this.sfxIn.connect(comp);
    const verb = ctx.createConvolver();
    verb.buffer = forestIR(ctx);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverbSend.connect(verb).connect(wet).connect(comp);
    comp.connect(this.master!);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.9;
    this.ambBus.connect(this.master!);
    this.sfxLoading = this.loadSfx().then(() => this.applyAmbience());
  }

  private async loadSfx() {
    const ctx = this.ctx!;
    const names = [...Object.entries(SFX).flatMap(([n, k]) => Array.from({ length: k }, (_, i) => `${n}_${i + 1}`)), ...AMB];
    await Promise.all(names.map(async (n) => {
      try {
        const r = await fetch(`${AUDIO}sfx/${n}.mp3`);
        if (r.ok) this.buffers.set(n, await ctx.decodeAudioData(await r.arrayBuffer()));
      } catch { /* missing take: the procedural fallback plays */ }
    }));
  }

  /** Play a random take of `name`: slight pitch / level variation, dry + reverb send. False if none is loaded. */
  private sample(name: string, o: { gain?: number; rate?: number; send?: number; pan?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxIn) return false;
    const takes = Array.from({ length: SFX[name] ?? 1 }, (_, i) => this.buffers.get(`${name}_${i + 1}`)).filter(Boolean) as AudioBuffer[];
    if (!takes.length) return false;
    const src = ctx.createBufferSource();
    src.buffer = takes[Math.floor(Math.random() * takes.length)];
    src.playbackRate.value = (o.rate ?? 1) * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = (o.gain ?? 1) * (0.9 + Math.random() * 0.1);
    let out: AudioNode = src.connect(g);
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; out = out.connect(p); }
    out.connect(this.sfxIn);
    if (this.reverbSend) { const sn = ctx.createGain(); sn.gain.value = o.send ?? 0.6; out.connect(sn).connect(this.reverbSend); }
    src.start();
    return true;
  }

  /** The forest bed (wind + creatures, a stream, a low magical drone) under the music, on its own bus. */
  setAmbience(kind: Ambience) { this.ambience = kind; this.applyAmbience(); }

  private applyAmbience() {
    const ctx = this.ctx;
    if (!ctx || !this.ambBus) return;
    const mix = AMB_MIX[this.ambience] ?? {};
    const now = ctx.currentTime;
    for (const n of AMB) {
      const want = mix[n] ?? 0;
      let a = this.amb.get(n);
      if (!a && want > 0) {
        const buf = this.buffers.get(n);
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(this.ambBus);
        src.start(0, Math.random() * buf.duration);   // layers start at different points so they never line up
        a = { src, gain };
        this.amb.set(n, a);
      }
      if (!a) continue;
      a.gain.gain.cancelScheduledValues(now);
      a.gain.gain.setValueAtTime(a.gain.gain.value, now);
      a.gain.gain.linearRampToValueAtTime(want, now + 3);
    }
  }

  /** A gun shot: each vessel's own sampled voice; on the beat it hits harder (PERFECT adds a bright crack on top). */
  playShot(quality: BeatQuality, vessel = 'aegis') {
    const gun = GUN[vessel] ?? 'lance';
    const perfect = quality === 'PERFECT';
    const gain = perfect ? 1.05 : quality === 'GOOD' ? 0.9 : 0.7;
    const o = { gain, rate: perfect ? 1.02 : 1, send: gun === 'scatter' ? 0.75 : 0.55 };
    // the layered shot (PERFECT blooms: its own brighter takes); the plain sampled gun if those haven't loaded
    if (this.sample(perfect ? `shot_${gun}_p` : `shot_${gun}`, o) || this.sample(gun, o)) {
      this.zapLayer(gun, perfect);
      if (perfect) this.oscShot('PERFECT', 0.25);
      return;
    }
    this.oscShot(quality, 1);
  }

  /** A live laser flick on top of the sampled shot, new every time (pitch and length vary), so rapid fire never
   *  repeats exactly: the lance drops low, the scatter is a short buzz, the chord a bright blip. */
  private zapLayer(gun: string, perfect: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxIn) return;
    const t = ctx.currentTime, j = 0.92 + Math.random() * 0.16;
    const [f0, f1, dur, type, lvl] = gun === 'lance' ? [2200, 160, 0.22, 'sawtooth', 0.05] as const
      : gun === 'scatter' ? [1600, 220, 0.09, 'square', 0.035] as const : [3200, 900, 0.07, 'triangle', 0.05] as const;
    const osc = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * j * (perfect ? 1.25 : 1), t);
    osc.frequency.exponentialRampToValueAtTime(f1 * j, t + dur);
    lp.type = 'lowpass'; lp.frequency.value = perfect ? 9000 : 5000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(lvl * (perfect ? 1.4 : 1), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(this.sfxIn);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  playReload() { this.sample('reload', { gain: 0.8, send: 0.2 }); }
  /** Play a named SFX bank (see SFX) — the weapon table (src/weapons.ts) names its sounds this way. False if absent. */
  playSfx(name: string, o: { gain?: number; rate?: number; send?: number; pan?: number } = {}) { return this.sample(name, o); }
  playEmpty() { if (!this.sample('empty', { gain: 0.7, send: 0.15 })) this.oscShot('OFF', 0.4); }
  playMelee() { this.sample('melee', { gain: 0.85, send: 0.35 }); }

  /** Procedural shot (no sample loaded), or the bright on-beat layer over the sample. */
  private oscShot(quality: BeatQuality, level: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = quality === 'PERFECT' ? 'sawtooth' : 'triangle';
    const startFreq = quality === 'PERFECT' ? 880 : quality === 'GOOD' ? 620 : 340;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.11);
    gain.gain.setValueAtTime((quality === 'OFF' ? 0.14 : 0.28) * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playDash(onBeat: boolean) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(onBeat ? 260 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(onBeat ? 760 : 380, t + 0.14);
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  playHit(killed: boolean) {
    if (killed ? this.sample('kill', { gain: 1, send: 0.7 }) : this.sample('hit', { gain: 0.75, send: 0.35 })) return;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(killed ? 520 : 300, t);
    osc.frequency.exponentialRampToValueAtTime(killed ? 1040 : 140, t + (killed ? 0.18 : 0.08));
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (killed ? 0.2 : 0.09));
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  playSurge() {
    if (this.sample('surge', { gain: 1.1, send: 0.8 })) return;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.34);
    gain.gain.setValueAtTime(0.36, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.37);
  }
  // ── combat cues (combat/melee.ts, enemies.ts): short synth layers over the sampled hits, on the SFX bus ──
  private blip(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxIn ?? this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  /** An enemy winds up: a rising whine (higher for ranged, a low growl for a slam) — the tell you dodge on. */
  playTelegraph(kind: 'melee' | 'bolt' | 'slam' | 'charge' | 'barrage') {
    if (kind === 'slam') { this.blip('sawtooth', 70, 180, 0.6, 0.12); this.blip('sine', 140, 360, 0.6, 0.08); }
    else if (kind === 'bolt' || kind === 'barrage') this.blip('triangle', 420, 1300, 0.45, 0.08);
    else this.blip('square', 240, 620, 0.22, 0.06);
  }
  /** A strike swing, light or heavy (whoosh sample + a body thump on a heavy). */
  playSwing(heavy: boolean) { this.sample('melee', { gain: heavy ? 1 : 0.75, rate: heavy ? 0.8 : 1.1, send: 0.3 }); if (heavy) this.blip('sine', 120, 50, 0.18, 0.2); }
  /** A melee impact: sample + pitched layer that climbs with the combo count. */
  playImpact(combo: number, heavy: boolean, perfect: boolean) {
    this.sample('hit', { gain: heavy ? 0.95 : 0.7, rate: heavy ? 0.85 : 1 + Math.min(combo, 12) * 0.02, send: 0.3 });
    this.blip(perfect ? 'sawtooth' : 'triangle', (heavy ? 180 : 320) * (1 + Math.min(combo, 16) * 0.035), heavy ? 60 : 120, heavy ? 0.16 : 0.09, perfect ? 0.16 : 0.11);
  }
  playBlock() { this.blip('square', 900, 420, 0.07, 0.1); this.blip('triangle', 1800, 900, 0.05, 0.06); }
  /** Perfect parry: a bright bell chord. */
  playParry() { for (const [f, d] of [[1046, 0], [1568, 0.01], [2093, 0.02]] as const) this.blip('sine', f, f * 0.98, 0.5, 0.12, d); this.blip('square', 2600, 1200, 0.06, 0.08); }
  playGuardBreak() { this.blip('sawtooth', 600, 70, 0.35, 0.18); this.sample('hit', { gain: 1, rate: 0.6, send: 0.5 }); }
  playLaunch() { this.blip('triangle', 200, 900, 0.25, 0.14); }
  playEvade() { this.blip('sine', 700, 1400, 0.18, 0.08); }

  // -- tree ents (ents/): a giant's footfall, its smash, the creak of a body made of wood, a groan, a blessing ------
  private entNoise: AudioBuffer | null = null;
  /** gain 0…1 (the ents scale it by distance), pan −1…1. Synthesised: no samples needed. */
  playEnt(kind: 'step' | 'smash' | 'groan' | 'creak' | 'bless', gain = 1, pan = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || gain < 0.01) return;
    if (!this.entNoise) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
      let lp = 0; for (let i = 0; i < d.length; i++) { lp = lp * 0.96 + (Math.random() * 2 - 1) * 0.04; d[i] = lp * 6; } // brown-ish rumble
      this.entNoise = b;
    }
    const t = ctx.currentTime, out = ctx.createStereoPanner(); out.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(this.sfxIn ?? this.master);
    if (this.reverbSend) { const s = ctx.createGain(); s.gain.value = 0.6; out.connect(s).connect(this.reverbSend); }
    const env = (node: AudioNode, g0: number, at: number, a: number, dur: number) => {
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + at); g.gain.linearRampToValueAtTime(g0 * gain, t + at + a); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      node.connect(g).connect(out); return g;
    };
    const thud = (f0: number, f1: number, at: number, dur: number, g0: number) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      env(o, g0, at, 0.012, dur); o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    const rumble = (fc: number, at: number, dur: number, g0: number, q = 0.7) => {
      const n = ctx.createBufferSource(); n.buffer = this.entNoise; n.playbackRate.value = 0.8 + Math.random() * 0.3;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc; f.Q.value = q;
      n.connect(f); env(f, g0, at, 0.02, dur); n.start(t + at, Math.random()); n.stop(t + at + dur + 0.05);
    };
    // wood under strain: a buzzy low tone through a narrow, wandering band (fibres creaking)
    const creak = (f: number, at: number, dur: number, g0: number) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t + at);
      for (let k = 1; k <= 6; k++) o.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + at + (dur * k) / 6);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
      bp.frequency.setValueAtTime(380 + Math.random() * 200, t + at); bp.frequency.linearRampToValueAtTime(620 + Math.random() * 300, t + at + dur);
      const am = ctx.createOscillator(), amg = ctx.createGain(); am.frequency.value = 9 + Math.random() * 8; amg.gain.value = 0.5;
      const g = env(o.connect(bp), g0, at, dur * 0.25, dur);
      am.connect(amg).connect(g.gain); am.start(t + at); am.stop(t + at + dur + 0.05);
      o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    if (kind === 'step') { thud(62, 26, 0, 1.3, 0.9); rumble(160, 0, 1.6, 0.8); creak(70, 0.05, 0.9, 0.12); rumble(900, 0.02, 0.35, 0.12, 1.5); }
    else if (kind === 'smash') { thud(70, 22, 0, 2.0, 1.1); rumble(220, 0, 2.6, 1.0); rumble(2200, 0, 0.5, 0.35, 0.9); creak(55, 0, 1.2, 0.16); }
    else if (kind === 'groan') { creak(42, 0, 2.6, 0.22); creak(63, 0.3, 2.2, 0.12); rumble(120, 0, 2.8, 0.35); }
    else if (kind === 'creak') { creak(58 + Math.random() * 20, 0, 1.8, 0.16); rumble(140, 0, 1.4, 0.2); }
    else { for (const [f, d] of [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36]] as const) this.blip('sine', f, f * 1.002, 2.2, 0.05 * gain, d); creak(50, 0, 1.6, 0.08); }
  }
  playInterrupt() { this.blip('square', 1400, 300, 0.12, 0.1); }
  /** Soul-Rend: low swell, the tear, the release. */
  playRend(stage: 0 | 1 | 2) {
    if (stage === 0) { this.blip('sawtooth', 55, 110, 0.9, 0.16); this.blip('sine', 220, 440, 0.9, 0.06); }
    else if (stage === 1) { this.sample('melee', { gain: 1, rate: 0.7, send: 0.8 }); this.blip('square', 880, 180, 0.25, 0.1); }
    else { if (!this.sample('surge', { gain: 1.1, send: 0.9 })) this.blip('sawtooth', 440, 55, 0.5, 0.3); this.sample('kill', { gain: 1, send: 0.8 }); }
  }
}
