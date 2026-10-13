/**
 * GameAudio — procedural music + SFX engine for Kith Party.
 *
 * Zero audio assets: every note and sound effect is synthesized with the
 * Web Audio API (oscillators + filtered noise), so there is nothing to
 * download and nothing to license.
 *
 * Autoplay policy: the AudioContext is created lazily and only inside an
 * explicit user gesture (see unlock()). Nothing ever plays before the
 * player's first click/tap.
 *
 * Music: a 16th-note lookahead step sequencer (25ms interval, 120ms
 * lookahead) with three looped tracks:
 *   menu   — bouncy C-major loop for the gallery/setup screens (~104 BPM)
 *   race   — driving A-minor loop for the 3D circuit (~132 BPM)
 *   groove — funky D-minor loop for crystals + rhythm (~111 BPM; its beat
 *            period is ~0.54s, matching the rhythm game's note spacing)
 * Track switches do a quick 150ms dip so there is no audible pop.
 *
 * SFX: one-shot synth blips / filtered-noise hits with simple ADSR-ish
 * envelopes. Music runs on musicBus, SFX on sfxBus, both into a master
 * gain that the mute toggle controls. A shared subtle echo sweetens the
 * lead line and sparkle sounds.
 */

export type MusicTrack = 'menu' | 'race' | 'groove';

interface TrackDef {
  bpm: number;
  /** MIDI notes, 16 steps per bar, 4 bars. null = rest. */
  lead: (number | null)[];
  bass: (number | null)[];
  /** Drum patterns: 16 steps, looped every bar. */
  kick: boolean[];
  hat: boolean[];
  snare: boolean[];
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  leadVol: number;
  bassVol: number;
}

const mf = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const B = (p: number[]): boolean[] => p.map((v) => v === 1);

/* ------------------------------ patterns ------------------------------ */
// MENU — C major, bouncy, 104 BPM
const menuRoots = [36, 41, 43, 36]; // C2 F2 G2 C2
const menuLead: (number | null)[] = [
  64, null, 67, null, 69, null, 67, null, 64, null, 62, null, 60, null, null, null,
  65, null, 69, null, 72, null, 69, null, 65, null, 64, null, 62, null, null, null,
  67, null, 71, null, 74, null, 71, null, 74, null, 79, null, 76, null, 74, null,
  72, null, 76, null, 79, null, 76, null, 72, null, 67, null, 64, null, null, null,
];
const menuBass: (number | null)[] = menuRoots.flatMap((r) =>
  [r, null, null, null, r, null, null, null, r, null, null, null, r + 12, null, r + 7, null]);

// RACE — A minor, driving, 132 BPM
const raceChords = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]]; // Am F C G
const raceLead: (number | null)[] = raceChords.flatMap(([a, b, c]) =>
  [a, b, c, a + 12, c, b, a + 12, c, a, b, c, a + 12, b, c, a + 12, b]);
const raceRoots = [33, 29, 36, 31]; // A1 F1 C2 G1
const raceBass: (number | null)[] = raceRoots.flatMap((r) =>
  [r, null, r, null, r, null, r, null, r, null, r, null, r, null, r + 12, null]);

// GROOVE — D minor funk, 111 BPM
const grooveRoots = [38, 38, 41, 43]; // D2 D2 F2 G2
const grooveBass: (number | null)[] = grooveRoots.flatMap((r) =>
  [r, null, null, r, null, null, r + 7, null, null, r, null, null, r + 5, null, r + 7, null]);
const grooveLead: (number | null)[] = grooveRoots.flatMap((r) =>
  [null, null, r + 24, null, null, null, null, null, r + 26, null, null, null, null, null, r + 24, null]);

const TRACKS: Record<MusicTrack, TrackDef> = {
  menu: {
    bpm: 104, lead: menuLead, bass: menuBass,
    kick: B([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
    hat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
    snare: B(new Array(16).fill(0)),
    leadWave: 'square', bassWave: 'triangle', leadVol: 0.13, bassVol: 0.30,
  },
  race: {
    bpm: 132, lead: raceLead, bass: raceBass,
    kick: B([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    hat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]),
    snare: B([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
    leadWave: 'sawtooth', bassWave: 'sawtooth', leadVol: 0.10, bassVol: 0.20,
  },
  groove: {
    bpm: 111, lead: grooveLead, bass: grooveBass,
    kick: B([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]),
    hat: B([1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0]),
    snare: B([0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0]),
    leadWave: 'triangle', bassWave: 'square', leadVol: 0.18, bassVol: 0.15,
  },
};

const MASTER_VOL = 0.9;
const MUSIC_VOL = 0.42;
const SFX_VOL = 0.8;

interface ToneOpts {
  freq: number; t: number; dur: number; type: OscillatorType; vol: number;
  bus: GainNode; slideTo?: number; echo?: boolean;
}
interface NoiseOpts {
  t: number; dur: number; vol: number; filterType: BiquadFilterType; freq: number;
  freqEnd?: number; Q?: number; bus?: GainNode;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private timer: number | null = null;
  private def: TrackDef | null = null;
  private trackName: MusicTrack | null = null;
  private step = 0;
  private nextT = 0;
  private switchToken = 0;

  get context(): AudioContext | null { return this.ctx; }
  get isMuted(): boolean { return this.muted; }
  get isPlaying(): boolean { return this.timer !== null; }

  /**
   * Create/resume the AudioContext. MUST be called from a user gesture
   * (click/tap). Returns true when this call newly enabled audio.
   */
  unlock(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AC = window.AudioContext;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOL;
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_VOL;
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = SFX_VOL;
      this.sfxBus.connect(this.master);
      // Shared subtle echo for the lead line and sparkle SFX.
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.29;
      const fb = ctx.createGain(); fb.gain.value = 0.28;
      const wet = ctx.createGain(); wet.gain.value = 0.16;
      this.delaySend = ctx.createGain();
      this.delaySend.connect(delay);
      delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(this.musicBus);
      // Shared 1s noise buffer for hats/snare/whooshes.
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const ctx = this.ctx;
    if (ctx.state === 'running') return false;
    void ctx.resume();
    return true;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : MASTER_VOL, this.ctx.currentTime, 0.03);
    }
  }

  /** Toggles mute; returns the new muted state. */
  toggleMute(): boolean { this.setMuted(!this.muted); return this.muted; }

  /** Start a looped music track (quick dip to avoid pops). No-op until unlock(). */
  playTrack(name: MusicTrack): void {
    if (!this.ctx || !this.musicBus) return;
    if (this.trackName === name && this.timer !== null) return;
    const token = ++this.switchToken;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(0.0001, t, 0.06);
    window.setTimeout(() => {
      if (token !== this.switchToken || !this.ctx || !this.musicBus) return;
      this.def = TRACKS[name];
      this.trackName = name;
      this.step = 0;
      this.nextT = this.ctx.currentTime + 0.08;
      this.startSequencer();
      this.musicBus.gain.setTargetAtTime(MUSIC_VOL, this.ctx.currentTime, 0.2);
    }, 150);
  }

  stopMusic(): void {
    this.switchToken++;
    this.trackName = null;
    this.def = null;
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
  }

  /* ------------------------- sequencer internals ------------------------ */
  private startSequencer(): void {
    if (this.timer !== null || !this.ctx) return;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  private pump(): void {
    const ctx = this.ctx, def = this.def;
    if (!ctx || !def) { this.stopMusic(); return; }
    const stepDur = 60 / def.bpm / 4;
    let guard = 0;
    while (this.nextT < ctx.currentTime + 0.12 && guard++ < 32) {
      this.playStep(def, this.step, this.nextT, stepDur);
      this.nextT += stepDur;
      this.step = (this.step + 1) % def.lead.length;
    }
  }

  private playStep(def: TrackDef, i: number, t: number, stepDur: number): void {
    const music = this.musicBus;
    if (!music) return;
    const lead = def.lead[i];
    if (lead != null) {
      this.tone({ freq: mf(lead), t, dur: stepDur * 1.8, type: def.leadWave, vol: def.leadVol, bus: music, echo: true });
    }
    const bass = def.bass[i];
    if (bass != null) {
      this.tone({ freq: mf(bass), t, dur: stepDur * 1.6, type: def.bassWave, vol: def.bassVol, bus: music });
    }
    const b = i % 16;
    if (def.kick[b]) this.tone({ freq: 130, t, dur: 0.11, type: 'sine', vol: 0.5, bus: music, slideTo: 42 });
    if (def.hat[b]) this.noiseHit({ t, dur: 0.045, vol: 0.10, filterType: 'highpass', freq: 7500, bus: music });
    if (def.snare[b]) this.noiseHit({ t, dur: 0.11, vol: 0.16, filterType: 'bandpass', freq: 1900, Q: 1.2, bus: music });
  }

  /* --------------------------- synth primitives ------------------------- */
  private tone(o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(Math.max(20, o.freq), o.t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), o.t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), o.t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
    osc.connect(g); g.connect(o.bus);
    if (o.echo && this.delaySend) g.connect(this.delaySend);
    osc.start(o.t); osc.stop(o.t + o.dur + 0.05);
  }

  private noiseHit(o: NoiseOpts): void {
    const ctx = this.ctx, buf = this.noiseBuf, sfx = this.sfxBus;
    if (!ctx || !buf || !sfx) return;
    const bus = o.bus ?? sfx;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filterType;
    f.frequency.setValueAtTime(o.freq, o.t);
    f.Q.value = o.Q ?? 1;
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, o.t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), o.t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(o.t); src.stop(o.t + o.dur + 0.05);
  }

  /* --------------------------------- SFX -------------------------------- */
  uiClick(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    this.tone({ freq: 1250, t: ctx.currentTime, dur: 0.05, type: 'square', vol: 0.14, bus: sfx });
  }

  countdownBeep(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    this.tone({ freq: 660, t: ctx.currentTime, dur: 0.14, type: 'sine', vol: 0.30, bus: sfx });
  }

  goBeep(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    this.tone({ freq: 880, t: ctx.currentTime, dur: 0.30, type: 'sine', vol: 0.32, bus: sfx, slideTo: 1568, echo: true });
  }

  lapChime(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    const t = ctx.currentTime;
    this.tone({ freq: 880, t, dur: 0.16, type: 'triangle', vol: 0.25, bus: sfx, echo: true });
    this.tone({ freq: 1174.66, t: t + 0.10, dur: 0.22, type: 'triangle', vol: 0.25, bus: sfx, echo: true });
  }

  crystalCollect(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    const t = ctx.currentTime;
    [1318.5, 1568, 2093].forEach((f, i) =>
      this.tone({ freq: f, t: t + i * 0.055, dur: 0.09, type: 'sine', vol: 0.20, bus: sfx, echo: true }));
  }

  rhythmHit(perfect: boolean): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    const t = ctx.currentTime;
    if (perfect) {
      this.tone({ freq: 1568, t, dur: 0.10, type: 'triangle', vol: 0.28, bus: sfx, echo: true });
      this.tone({ freq: 2093, t: t + 0.04, dur: 0.12, type: 'sine', vol: 0.18, bus: sfx, echo: true });
    } else {
      this.tone({ freq: 1174.66, t, dur: 0.09, type: 'triangle', vol: 0.24, bus: sfx });
    }
  }

  rhythmMiss(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    this.tone({ freq: 170, t: ctx.currentTime, dur: 0.16, type: 'sawtooth', vol: 0.16, bus: sfx, slideTo: 110 });
  }

  boostWhoosh(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    this.noiseHit({ t: ctx.currentTime, dur: 0.38, vol: 0.26, filterType: 'bandpass', freq: 500, freqEnd: 3400, Q: 1.5 });
  }

  collisionThud(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    const t = ctx.currentTime;
    this.tone({ freq: 95, t, dur: 0.22, type: 'sine', vol: 0.50, bus: sfx, slideTo: 45 });
    this.noiseHit({ t, dur: 0.12, vol: 0.22, filterType: 'lowpass', freq: 320 });
  }

  finishFanfare(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone({ freq: f, t: t + i * 0.12, dur: 0.32, type: 'triangle', vol: 0.30, bus: sfx, echo: true }));
    [523.25, 659.25, 783.99].forEach((f) =>
      this.tone({ freq: f, t: t + 0.52, dur: 0.9, type: 'triangle', vol: 0.20, bus: sfx, echo: true }));
  }

  pauseBlip(): void {
    const ctx = this.ctx, sfx = this.sfxBus;
    if (!ctx || !sfx) return;
    this.tone({ freq: 520, t: ctx.currentTime, dur: 0.06, type: 'square', vol: 0.14, bus: sfx });
  }
}

/** Shared singleton: one AudioContext for the whole Kith Party experience. */
export const gameAudio = new GameAudio();
