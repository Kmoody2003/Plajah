// Sample-accurate Web Audio beat clock + real Rift Realm MP3 soundtrack + procedural combat SFX.
export type BeatQuality = 'PERFECT' | 'GOOD' | 'OFF';

export interface BeatEval {
  quality: BeatQuality;
  beatIndex: number;
  offsetMs: number;
}

const BPM = 124;
const BEAT_SEC = 60 / BPM;

export class RhythmEngine {
  private ctx: AudioContext | null = null;
  private startTime = 0;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  private mainAudio: HTMLAudioElement | null = null;
  private combatAudio: HTMLAudioElement | null = null;
  private activeTrack: 'main' | 'combat' = 'main';

  /** 0..1 phase within current beat (0 = exact beat). */
  phase = 0;
  /** 0..1 decaying pulse peaking on each beat + audio bass energy for shaders/HUD. */
  pulse = 0;
  beatIndex = 0;

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

      this.startTime = this.ctx.currentTime + 0.05;
      this.initSoundtrack();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    void this.playActiveTrack();
  }

  private initSoundtrack() {
    if (!this.ctx || !this.musicGain) return;
    const mkAudio = (src: string) => {
      const el = new Audio(src);
      el.loop = true;
      el.crossOrigin = 'anonymous';
      const node = this.ctx!.createMediaElementSource(el);
      node.connect(this.musicGain!);
      return el;
    };
    this.mainAudio = mkAudio('/games/rift-realm/assets/audio/main-theme.mp3');
    this.combatAudio = mkAudio('/games/rift-realm/assets/audio/combat-theme.mp3');
  }

  private async playActiveTrack() {
    try {
      if (this.activeTrack === 'main') {
        this.combatAudio?.pause();
        await this.mainAudio?.play();
      } else {
        this.mainAudio?.pause();
        await this.combatAudio?.play();
      }
    } catch {
      /* Autoplay / decode fallback: beat clock continues silently */
    }
  }

  setTrack(track: 'main' | 'combat') {
    if (this.activeTrack === track) return;
    this.activeTrack = track;
    if (this.ctx) void this.playActiveTrack();
  }

  update() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const elapsed = Math.max(0, this.ctx.currentTime - this.startTime);
    const exactBeat = elapsed / BEAT_SEC;
    this.beatIndex = Math.floor(exactBeat);
    this.phase = exactBeat - this.beatIndex;

    let bassEnergy = 0;
    if (this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);
      bassEnergy = ((this.freqData[0] + this.freqData[1] + this.freqData[2]) / (3 * 255)) * 0.6;
    }
    const clockPulse = Math.exp(-this.phase * 5.2);
    this.pulse = Math.min(1.0, Math.max(clockPulse, bassEnergy));
  }

  evaluateBeat(): BeatEval {
    if (!this.ctx) return { quality: 'GOOD', beatIndex: 0, offsetMs: 0 };
    const elapsed = Math.max(0, this.ctx.currentTime - this.startTime);
    const exactBeat = elapsed / BEAT_SEC;
    const nearest = Math.round(exactBeat);
    const offsetSec = Math.abs(exactBeat - nearest) * BEAT_SEC;
    const offsetMs = Math.round(offsetSec * 1000);

    if (offsetSec <= 0.09) return { quality: 'PERFECT', beatIndex: nearest, offsetMs };
    if (offsetSec <= 0.175) return { quality: 'GOOD', beatIndex: nearest, offsetMs };
    return { quality: 'OFF', beatIndex: nearest, offsetMs };
  }

  playShot(quality: BeatQuality) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = quality === 'PERFECT' ? 'sawtooth' : 'triangle';
    const startFreq = quality === 'PERFECT' ? 880 : quality === 'GOOD' ? 620 : 340;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.11);
    gain.gain.setValueAtTime(quality === 'OFF' ? 0.14 : 0.28, t);
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
}
