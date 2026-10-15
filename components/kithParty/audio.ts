/**
 * GameAudio — Expressive Multi-Voice Arcade Synth, Catchy Course Soundtracks,
 * and Note-Driven Google Lyria RealTime (`lyriaMusic.ts`) Sequencer for Kith Party.
 *
 * Music Engine Highlights:
 * - Dual-oscillator detuned lead synth with portamento glide, vibrato LFO, and resonant filter pluck
 * - Punchy slap + sub-bass with snappy filter envelope
 * - Syncopated 7th/9th chord stabs + telemetry-reactive 16th-note arpeggiator
 * - Crisp 909-style arcade drum kit (kick with click transient, body+noise snare, open/closed hats)
 * - 5 distinct, catchy course themes for Kith Circuit + menu & groove tracks
 * - Emits live `MusicNoteEvent`s on every 16th-note step to drive Google Lyria RealTime (`lyriaMusic`)
 */

import type { CourseId } from './course3d';
import { lyriaMusic, type MusicNoteEvent } from './lyriaMusic';

export type MusicTrack = 'menu' | 'race' | 'groove';

interface CourseMusicTheme {
 bpm: number;
 scaleName: MusicNoteEvent['scaleName'];
 lead: (number | null)[];
 counter: (number | null)[];
 bass: (number | null)[];
 chords: number[][];
 leadWaveA: OscillatorType;
 leadWaveB: OscillatorType;
 detuneCents: number;
 cutoffBase: number;
}

const mf = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const B = (p: number[]): boolean[] => p.map((v) => v === 1);

/* ------------ Catchy, Infectious Melodic Hooks (64 steps = 4 bars) ------------ */

// MENU — Warm Bouncy C-Major9 Party Lobby Hook (108 BPM)
const MENU_CHORDS = [
 [60, 64, 67, 71], // Cmaj7
 [65, 69, 72, 76], // Fmaj7
 [62, 65, 69, 72], // Dm7
 [67, 71, 74, 77], // G7
];
const MENU_LEAD: (number | null)[] = [
 72, null, 76, 79, null, 76, 72, null, 74, 76, null, 72, 69, null, 67, null,
 69, null, 72, 76, null, 77, 76, null, 74, null, 72, null, 69, null, null, null,
 74, null, 77, 81, null, 79, 77, null, 76, 74, null, 72, 69, null, 72, null,
 79, null, 76, 74, null, 72, 71, null, 72, null, 76, null, 72, null, null, null,
];
const MENU_BASS: (number | null)[] = [
 36, null, null, 36, 43, null, 48, null, 36, null, null, 36, 43, null, 40, null,
 41, null, null, 41, 48, null, 53, null, 41, null, null, 41, 48, null, 45, null,
 38, null, null, 38, 45, null, 50, null, 38, null, null, 38, 45, null, 41, null,
 43, null, null, 43, 50, null, 55, null, 43, null, 41, null, 38, null, 43, null,
];

// GROOVE — Infectious D-Minor Dorian Slap-Funk for Tennis, Crystals & Rhythm (114 BPM)
const GROOVE_CHORDS = [
 [62, 65, 69, 72], // Dm7
 [67, 71, 74, 77], // G7
 [65, 69, 72, 76], // Fmaj7
 [64, 67, 71, 74], // Em7
];
const GROOVE_LEAD: (number | null)[] = [
 74, null, 77, null, 74, 72, null, 69, null, 72, 74, null, 77, null, 76, null,
 79, null, 77, 74, null, 72, 69, null, 71, null, 74, null, 79, null, null, null,
 81, null, 79, 77, null, 76, 72, null, 74, 76, null, 72, 69, null, 72, null,
 76, null, 74, 71, null, 69, 67, null, 69, null, 72, 74, null, null, null, null,
];
const GROOVE_BASS: (number | null)[] = [
 38, null, 38, 50, null, 38, 45, null, 38, null, 48, null, 50, null, 45, null,
 43, null, 43, 55, null, 43, 50, null, 43, null, 53, null, 55, null, 50, null,
 41, null, 41, 53, null, 41, 48, null, 41, null, 50, null, 53, null, 48, null,
 40, null, 40, 52, null, 43, 55, null, 45, null, 48, null, 50, 48, 45, null,
];

// 5 COURSE-SPECIFIC RACE THEMES
const COURSE_THEMES: Record<CourseId, CourseMusicTheme> = {
 // 1. Crestfall Gardens: Heroic Sakura Grand Prix Anthem (A Minor / C Major lift, 134 BPM)
 'crestfall-gardens': {
  bpm: 134,
  scaleName: 'A_MINOR',
  chords: [
   [57, 60, 64, 67], // Am7
   [53, 57, 60, 64], // Fmaj7
   [60, 64, 67, 71], // Cmaj7
   [55, 59, 62, 67], // G6
  ],
  lead: [
   69, null, 72, 76, null, 81, 79, null, 76, null, 72, 74, null, 76, 72, null,
   69, null, 72, 77, null, 81, 84, null, 81, null, 77, 76, null, 72, 74, null,
   76, null, 79, 84, null, 83, 79, null, 76, 79, null, 84, 81, null, 79, null,
   79, null, 83, 86, null, 84, 83, 79, 76, null, 74, 71, 69, null, null, null,
  ],
  counter: [
   81, 76, 72, 76, 81, 76, 72, 76, 79, 76, 72, 76, 79, 76, 72, 76,
   81, 77, 72, 77, 81, 77, 72, 77, 84, 81, 77, 81, 84, 81, 77, 81,
   84, 79, 76, 79, 84, 79, 76, 79, 83, 79, 76, 79, 83, 79, 76, 79,
   86, 83, 79, 83, 86, 83, 79, 83, 84, 79, 74, 79, 81, null, null, null,
  ],
  bass: [
   33, null, 45, 33, null, 33, 45, null, 33, null, 45, 33, 40, null, 43, null,
   29, null, 41, 29, null, 29, 41, null, 29, null, 41, 29, 36, null, 41, null,
   36, null, 48, 36, null, 36, 48, null, 36, null, 48, 36, 43, null, 48, null,
   31, null, 43, 31, null, 31, 43, null, 31, null, 43, 38, 43, 40, 36, null,
  ],
  leadWaveA: 'sawtooth',
  leadWaveB: 'square',
  detuneCents: 10,
  cutoffBase: 2800,
 },

 // 2. Abyssal Glass Trench: Bioluminescent Deep-Sea Electronic Breakbeat (D Minor, 132 BPM)
 'abyssal-trench': {
  bpm: 132,
  scaleName: 'D_MINOR',
  chords: [
   [62, 65, 69, 72], // Dm7
   [58, 62, 65, 69], // Bbmaj7
   [55, 58, 62, 65], // Gm7
   [57, 61, 64, 69], // A7
  ],
  lead: [
   74, null, 81, 77, null, 74, 72, null, 69, 72, 74, null, 77, null, 81, null,
   82, null, 81, 77, null, 74, 70, null, 74, null, 77, 81, null, 84, 81, null,
   79, null, 77, 74, null, 70, 67, null, 70, 74, null, 77, 79, null, 82, null,
   81, null, 85, 88, null, 85, 81, 79, 77, null, 76, 73, 74, null, null, null,
  ],
  counter: [
   86, 81, 77, 74, 86, 81, 77, 74, 84, 81, 77, 74, 84, 81, 77, 74,
   86, 82, 77, 74, 86, 82, 77, 74, 89, 86, 82, 77, 89, 86, 82, 77,
   86, 82, 79, 74, 86, 82, 79, 74, 86, 82, 79, 74, 86, 82, 79, 74,
   85, 81, 76, 73, 85, 81, 76, 73, 88, 85, 81, 76, 86, null, null, null,
  ],
  bass: [
   38, null, 50, null, 38, 50, null, 38, 38, null, 50, null, 45, null, 48, null,
   34, null, 46, null, 34, 46, null, 34, 34, null, 46, null, 41, null, 46, null,
   31, null, 43, null, 31, 43, null, 31, 31, null, 43, null, 38, null, 43, null,
   33, null, 45, null, 33, 45, null, 33, 37, null, 45, null, 49, 45, 37, null,
  ],
  leadWaveA: 'triangle',
  leadWaveB: 'sawtooth',
  detuneCents: 12,
  cutoffBase: 2400,
 },

 // 3. Dune Worm Canyon: Desert Overdrive Synth-Clavinet Funk (E Minor, 136 BPM)
 'dune-canyon': {
  bpm: 136,
  scaleName: 'E_MINOR',
  chords: [
   [52, 55, 59, 62], // Em7
   [60, 64, 67, 71], // Cmaj7
   [57, 62, 66, 69], // D
   [59, 63, 66, 69], // B7
  ],
  lead: [
   76, 76, null, 79, null, 76, 74, 71, null, 74, 76, null, 79, 83, null, null,
   84, null, 83, 79, null, 76, 79, null, 81, 79, 76, null, 74, null, 71, null,
   74, 74, null, 78, null, 81, 78, 74, null, 78, 81, null, 86, 84, null, null,
   83, null, 78, 75, null, 71, 75, 78, 83, null, 81, 78, 76, null, null, null,
  ],
  counter: [
   76, 71, 67, 71, 76, 71, 67, 71, 79, 76, 71, 76, 83, 79, 76, 71,
   84, 79, 76, 79, 84, 79, 76, 79, 83, 79, 76, 79, 83, 79, 76, 79,
   81, 78, 74, 78, 81, 78, 74, 78, 86, 81, 78, 81, 86, 81, 78, 81,
   83, 78, 75, 78, 83, 78, 75, 78, 83, 78, 75, 71, 76, null, null, null,
  ],
  bass: [
   28, null, 28, 40, null, 38, 40, null, 28, null, 38, 40, 43, null, 38, null,
   36, null, 36, 48, null, 46, 48, null, 36, null, 46, 48, 43, null, 36, null,
   38, null, 38, 50, null, 45, 50, null, 38, null, 45, 50, 42, null, 38, null,
   35, null, 35, 47, null, 42, 47, null, 35, null, 42, 47, 39, 42, 47, null,
  ],
  leadWaveA: 'sawtooth',
  leadWaveB: 'sawtooth',
  detuneCents: 14,
  cutoffBase: 3100,
 },

 // 4. Polar Vortex Citadel: Euphoric Aurora Synthwave & Bell Anthem (F Minor, 138 BPM)
 'polar-vortex': {
  bpm: 138,
  scaleName: 'F_MINOR',
  chords: [
   [53, 56, 60, 63], // Fm7
   [61, 65, 68, 72], // Dbmaj7
   [58, 63, 67, 70], // Ebmaj7
   [60, 64, 67, 70], // C7
  ],
  lead: [
   77, null, 80, 84, null, 89, 87, null, 84, null, 80, 82, null, 84, 80, null,
   85, null, 84, 80, null, 77, 80, null, 84, null, 87, 89, null, 87, 84, null,
   87, null, 82, 79, null, 75, 79, null, 82, null, 87, 91, null, 89, 87, null,
   88, null, 84, 79, null, 76, 79, 84, 88, null, 87, 84, 89, null, null, null,
  ],
  counter: [
   89, 84, 80, 84, 89, 84, 80, 84, 92, 89, 84, 80, 89, 84, 80, 77,
   89, 85, 80, 85, 89, 85, 80, 85, 92, 89, 85, 80, 89, 85, 80, 77,
   91, 87, 82, 87, 91, 87, 82, 87, 94, 91, 87, 82, 91, 87, 82, 79,
   88, 84, 79, 84, 88, 84, 79, 84, 91, 88, 84, 79, 89, null, null, null,
  ],
  bass: [
   29, 41, 29, 41, 29, 41, 29, 41, 29, 41, 29, 41, 36, 48, 34, 46,
   37, 49, 37, 49, 37, 49, 37, 49, 37, 49, 37, 49, 36, 48, 32, 44,
   39, 51, 39, 51, 39, 51, 39, 51, 39, 51, 39, 51, 43, 55, 39, 51,
   36, 48, 36, 48, 36, 48, 36, 48, 36, 48, 40, 52, 43, 55, 36, 48,
  ],
  leadWaveA: 'square',
  leadWaveB: 'triangle',
  detuneCents: 9,
  cutoffBase: 3400,
 },

 // 5. Amazon Canopy Loop: Infectious Jungle Speedway & Loop-the-Loop Groove (C Major, 135 BPM)
 'amazon-canopy': {
  bpm: 135,
  scaleName: 'C_MAJOR',
  chords: [
   [60, 64, 67, 71], // Cmaj7
   [57, 60, 64, 67], // Am7
   [53, 57, 60, 64], // Fmaj7
   [55, 59, 62, 65], // G7
  ],
  lead: [
   76, null, 79, 84, null, 81, 79, null, 76, 74, null, 72, 74, null, 79, null,
   81, null, 84, 88, null, 84, 81, null, 79, 76, null, 72, 69, null, 72, null,
   77, null, 81, 84, null, 86, 84, null, 81, 79, null, 77, 76, null, 79, null,
   83, null, 86, 89, null, 86, 83, 79, 84, null, 79, 76, 72, null, null, null,
  ],
  counter: [
   84, 79, 76, 79, 84, 79, 76, 79, 86, 84, 79, 76, 84, 79, 76, 72,
   84, 81, 76, 81, 88, 84, 81, 76, 84, 81, 76, 72, 81, 76, 72, 69,
   84, 81, 77, 81, 88, 84, 81, 77, 86, 81, 77, 72, 84, 81, 77, 72,
   86, 83, 79, 83, 89, 86, 83, 79, 86, 83, 79, 74, 84, null, null, null,
  ],
  bass: [
   36, null, 36, 48, null, 43, 48, null, 36, null, 43, null, 48, null, 43, null,
   33, null, 33, 45, null, 40, 45, null, 33, null, 40, null, 45, null, 40, null,
   29, null, 29, 41, null, 36, 41, null, 29, null, 36, null, 41, null, 36, null,
   31, null, 31, 43, null, 38, 43, null, 31, null, 38, 41, 43, 41, 38, null,
  ],
  leadWaveA: 'sawtooth',
  leadWaveB: 'triangle',
  detuneCents: 11,
  cutoffBase: 3000,
 },
};

const DRUM_PATTERNS = {
 menu: {
  kick: B([1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
  hat: B([1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0]),
  openHat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
  snare: B([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
 },
 race: {
  kick: B([1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0]),
  hat: B([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
  openHat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
  snare: B([0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1]),
 },
 groove: {
  kick: B([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]),
  hat: B([1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1]),
  openHat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
  snare: B([0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0]),
 },
};

const MASTER_VOL = 0.92;
const MUSIC_VOL = 0.48;
const SFX_VOL = 0.85;

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
 private trackName: MusicTrack | null = null;
 private courseId: CourseId = 'crestfall-gardens';
 private step = 0;
 private nextT = 0;
 private switchToken = 0;
 private lastLeadFreq = 440;

 // Live race telemetry that modulates the music & drives Lyria RealTime
 private telemetry = {
  speedNorm: 0,
  driftStage: 0,
  boostActive: false,
  inLoop: false,
  lap: 1,
 };

 get context(): AudioContext | null { return this.ctx; }
 get isMuted(): boolean { return this.muted; }
 get isPlaying(): boolean { return this.timer !== null; }

 setCourse(id: CourseId): void {
  this.courseId = id;
 }

 updateRaceTelemetry(tel: { speedNorm: number; driftStage: number; boostActive: boolean; inLoop: boolean; lap: number }): void {
  this.telemetry = tel;
 }

 unlock(): boolean {
  if (typeof window === 'undefined') return false;
  if (!this.ctx) {
   const AC = window.AudioContext;
   if (!AC) return false;
   const ctx = new AC();
   this.ctx = ctx;

   // Master compressor so multi-voice synth + drums + kart SFX stay punchy and never clip
   const comp = ctx.createDynamicsCompressor();
   comp.threshold.value = -14;
   comp.knee.value = 18;
   comp.ratio.value = 3.5;
   comp.attack.value = 0.004;
   comp.release.value = 0.14;
   comp.connect(ctx.destination);

   this.master = ctx.createGain();
   this.master.gain.value = this.muted ? 0 : MASTER_VOL;
   this.master.connect(comp);

   this.musicBus = ctx.createGain();
   this.musicBus.gain.value = MUSIC_VOL;
   this.musicBus.connect(this.master);

   this.sfxBus = ctx.createGain();
   this.sfxBus.gain.value = SFX_VOL;
   this.sfxBus.connect(this.master);

   // Stereo-style ping delay for lead melodies & crystal chimes
   const delay = ctx.createDelay(1);
   delay.delayTime.value = 0.22;
   const fb = ctx.createGain(); fb.gain.value = 0.30;
   const delayFilter = ctx.createBiquadFilter();
   delayFilter.type = 'lowpass'; delayFilter.frequency.value = 3200;
   const wet = ctx.createGain(); wet.gain.value = 0.20;
   this.delaySend = ctx.createGain();
   this.delaySend.connect(delay);
   delay.connect(delayFilter);
   delayFilter.connect(fb);
   fb.connect(delay);
   delayFilter.connect(wet);
   wet.connect(this.musicBus);

   // Shared 1s white/pink noise buffer for drums and turbo whooshes
   const len = ctx.sampleRate;
   this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
   const data = this.noiseBuf.getChannelData(0);
   for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

   // Attach Note-Driven Google Lyria RealTime co-producer to the musicBus
   lyriaMusic.attach(ctx, this.musicBus);
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

 toggleMute(): boolean { this.setMuted(!this.muted); return this.muted; }

 playTrack(name: MusicTrack, course?: CourseId): void {
  if (course) this.courseId = course;
  if (!this.ctx || !this.musicBus) return;
  if (this.trackName === name && this.timer !== null) return;
  const token = ++this.switchToken;
  const t = this.ctx.currentTime;
  this.musicBus.gain.cancelScheduledValues(t);
  this.musicBus.gain.setTargetAtTime(0.0001, t, 0.05);
  window.setTimeout(() => {
   if (token !== this.switchToken || !this.ctx || !this.musicBus) return;
   this.trackName = name;
   this.step = 0;
   this.nextT = this.ctx.currentTime + 0.06;
   this.startSequencer();
   this.musicBus.gain.setTargetAtTime(MUSIC_VOL, this.ctx.currentTime, 0.16);
  }, 120);
 }

 stopMusic(): void {
  this.switchToken++;
  this.trackName = null;
  if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
 }

 /* ------------------------- Sequencer Internals ------------------------ */
 private startSequencer(): void {
  if (this.timer !== null || !this.ctx) return;
  this.timer = window.setInterval(() => this.pump(), 25);
 }

 private getActiveTheme(): CourseMusicTheme {
  if (this.trackName === 'menu') {
   return {
    bpm: 108,
    scaleName: 'C_MAJOR',
    lead: MENU_LEAD,
    counter: MENU_LEAD,
    bass: MENU_BASS,
    chords: MENU_CHORDS,
    leadWaveA: 'triangle',
    leadWaveB: 'sawtooth',
    detuneCents: 7,
    cutoffBase: 2400,
   };
  }
  if (this.trackName === 'groove') {
   return {
    bpm: 114,
    scaleName: 'D_MINOR',
    lead: GROOVE_LEAD,
    counter: GROOVE_LEAD,
    bass: GROOVE_BASS,
    chords: GROOVE_CHORDS,
    leadWaveA: 'sawtooth',
    leadWaveB: 'square',
    detuneCents: 9,
    cutoffBase: 2700,
   };
  }
  return COURSE_THEMES[this.courseId] || COURSE_THEMES['crestfall-gardens'];
 }

 private pump(): void {
  const ctx = this.ctx, track = this.trackName;
  if (!ctx || !track) { this.stopMusic(); return; }
  const theme = this.getActiveTheme();
  // Dynamic BPM: Final Lap 3 or Turbo Boost gently pushes the groove tempo!
  const lapMult = track === 'race' && this.telemetry.lap >= 3 ? 1.055 : 1.0;
  const boostMult = track === 'race' && this.telemetry.boostActive ? 1.025 : 1.0;
  const effectiveBpm = theme.bpm * lapMult * boostMult;
  const stepDur = 60 / effectiveBpm / 4;

  let guard = 0;
  while (this.nextT < ctx.currentTime + 0.12 && guard++ < 32) {
   this.playStep(track, theme, this.step, this.nextT, stepDur, effectiveBpm);
   this.nextT += stepDur;
   this.step = (this.step + 1) % theme.lead.length;
  }
 }

 private playStep(
  track: MusicTrack,
  theme: CourseMusicTheme,
  i: number,
  t: number,
  stepDur: number,
  effectiveBpm: number
 ): void {
  const music = this.musicBus;
  if (!music) return;
  const bar = Math.floor(i / 16) % 4;
  const beatStep = i % 16;
  const chord = theme.chords[bar % theme.chords.length];
  const leadMidi = theme.lead[i];
  const bassMidi = theme.bass[i];

  // 1. Expressive Dual-Oscillator Lead with Portamento Glide, Vibrato & Filter Envelope
  if (leadMidi != null) {
   const pitchShift = track === 'race' && this.telemetry.inLoop ? 12 : 0;
   this.playExpressiveLead(
    mf(leadMidi + pitchShift),
    t,
    stepDur * 1.85,
    theme.leadWaveA,
    theme.leadWaveB,
    theme.detuneCents,
    theme.cutoffBase + (this.telemetry.boostActive ? 1200 : 0),
    music
   );
  }

  // 2. Shimmering 16th-Note Counter-Arpeggio (active on race track, louder during drift/boost/Lap 3)
  const arpMidi = theme.counter[i];
  if (track === 'race' && arpMidi != null) {
   const arpVol = 0.032 + (this.telemetry.boostActive ? 0.035 : 0) + this.telemetry.driftStage * 0.012;
   this.tone({
    freq: mf(arpMidi),
    t,
    dur: stepDur * 0.9,
    type: 'triangle',
    vol: arpVol,
    bus: music,
    echo: true,
   });
  }

  // 3. Syncopated Warm Chord Stabs on off-beats (steps 2, 6, 10, 14)
  if ((beatStep === 2 || beatStep === 6 || beatStep === 10 || beatStep === 14) && chord) {
   this.playChordStab(chord, t, stepDur * 1.4, music);
  }

  // 4. Punchy Slap + Sub Bassline
  if (bassMidi != null) {
   this.playSlapBass(mf(bassMidi), t, stepDur * 1.65, music);
  }

  // 5. Crisp 909 Arcade Drum Kit
  const drums = DRUM_PATTERNS[track];
  if (drums.kick[beatStep]) {
   this.playKick(t, music);
  }
  if (drums.snare[beatStep]) {
   this.playSnare(t, music);
  }
  if (drums.hat[beatStep]) {
   const isOpen = drums.openHat[beatStep];
   this.noiseHit({
    t,
    dur: isOpen ? 0.095 : 0.038,
    vol: isOpen ? 0.11 : 0.065,
    filterType: 'highpass',
    freq: isOpen ? 6800 : 8500,
    bus: music,
   });
  }

  // 6. Drive Google Lyria RealTime (`lyriaMusic`) with this exact Musical Note Event!
  lyriaMusic.onNoteStep(
   {
    track,
    courseId: this.courseId,
    step: i,
    bar,
    bpm: effectiveBpm,
    midiNote: leadMidi,
    bassNote: bassMidi,
    chordNotes: chord,
    scaleName: theme.scaleName,
    intensity: track === 'race' ? 0.78 : track === 'groove' ? 0.65 : 0.45,
    speedNorm: this.telemetry.speedNorm,
    driftStage: this.telemetry.driftStage,
    boostActive: this.telemetry.boostActive,
    inLoop: this.telemetry.inLoop,
    lap: this.telemetry.lap,
   },
   t,
   stepDur
  );
 }

 /* --------------------------- Expressive Synth Voices ------------------------- */

 private playExpressiveLead(
  freq: number,
  t: number,
  dur: number,
  waveA: OscillatorType,
  waveB: OscillatorType,
  detune: number,
  cutoff: number,
  bus: GainNode
 ): void {
  const ctx = this.ctx;
  if (!ctx) return;
  const oscA = ctx.createOscillator();
  const oscB = ctx.createOscillator();
  oscA.type = waveA;
  oscB.type = waveB;
  oscA.detune.setValueAtTime(-detune, t);
  oscB.detune.setValueAtTime(detune, t);

  // Subtle portamento glide from previous note
  const startFreq = Math.max(80, Math.min(2400, this.lastLeadFreq));
  oscA.frequency.setValueAtTime(startFreq, t);
  oscA.frequency.exponentialRampToValueAtTime(freq, t + 0.022);
  oscB.frequency.setValueAtTime(startFreq, t);
  oscB.frequency.exponentialRampToValueAtTime(freq, t + 0.022);
  this.lastLeadFreq = freq;

  // Expressive Vibrato LFO
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 5.8;
  lfoGain.gain.setValueAtTime(0.1, t);
  lfoGain.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.5);
  lfo.connect(lfoGain);
  lfoGain.connect(oscA.frequency);
  lfoGain.connect(oscB.frequency);

  // Plucky Resonant Filter Envelope
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2.8;
  filter.frequency.setValueAtTime(cutoff * 1.35, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, cutoff * 0.42), t + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.115, t + 0.010);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(g);
  g.connect(bus);
  if (this.delaySend) g.connect(this.delaySend);

  oscA.start(t);
  oscB.start(t);
  lfo.start(t);
  oscA.stop(t + dur + 0.04);
  oscB.stop(t + dur + 0.04);
  lfo.stop(t + dur + 0.04);
 }

 private playSlapBass(freq: number, t: number, dur: number, bus: GainNode): void {
  const ctx = this.ctx;
  if (!ctx) return;
  const sub = ctx.createOscillator();
  const body = ctx.createOscillator();
  sub.type = 'sine';
  body.type = 'sawtooth';
  sub.frequency.setValueAtTime(freq, t);
  body.frequency.setValueAtTime(freq, t);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 3.2;
  filter.frequency.setValueAtTime(1450, t);
  filter.frequency.exponentialRampToValueAtTime(190, t + Math.min(0.11, dur * 0.7));

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.24, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  body.connect(filter);
  filter.connect(g);
  sub.connect(g);
  g.connect(bus);

  sub.start(t);
  body.start(t);
  sub.stop(t + dur + 0.03);
  body.stop(t + dur + 0.03);
 }

 private playChordStab(notes: number[], t: number, dur: number, bus: GainNode): void {
  const ctx = this.ctx;
  if (!ctx) return;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1900, t);
  filter.frequency.exponentialRampToValueAtTime(650, t + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.034, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filter.connect(g);
  g.connect(bus);

  notes.forEach((m) => {
   const osc = ctx.createOscillator();
   osc.type = 'sawtooth';
   osc.frequency.setValueAtTime(mf(m), t);
   osc.connect(filter);
   osc.start(t);
   osc.stop(t + dur + 0.03);
  });
 }

 private playKick(t: number, bus: GainNode): void {
  this.tone({ freq: 155, t, dur: 0.13, type: 'sine', vol: 0.52, bus, slideTo: 42 });
  this.tone({ freq: 920, t, dur: 0.018, type: 'triangle', vol: 0.14, bus, slideTo: 120 });
 }

 private playSnare(t: number, bus: GainNode): void {
  this.tone({ freq: 210, t, dur: 0.065, type: 'triangle', vol: 0.18, bus, slideTo: 115 });
  this.noiseHit({ t, dur: 0.115, vol: 0.18, filterType: 'bandpass', freq: 2150, Q: 1.1, bus });
 }

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
  [880, 1174.66, 1318.5, 1760].forEach((f, idx) =>
   this.tone({ freq: f, t: t + idx * 0.065, dur: 0.20, type: 'triangle', vol: 0.25, bus: sfx, echo: true }));
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

 tennisHit(smash = false): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  this.tone({ freq: smash ? 540 : 380, t, dur: smash ? 0.12 : 0.08, type: 'triangle', vol: smash ? 0.34 : 0.24, bus: sfx, slideTo: smash ? 180 : 140 });
  this.noiseHit({ t, dur: smash ? 0.09 : 0.05, vol: smash ? 0.24 : 0.14, filterType: 'bandpass', freq: smash ? 2200 : 1500, Q: 1.8 });
 }

 tennisPoint(): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  [659.25, 880, 1174.66].forEach((f, i) =>
   this.tone({ freq: f, t: t + i * 0.07, dur: 0.16, type: 'triangle', vol: 0.26, bus: sfx, echo: true }));
 }
}

/** Shared singleton: one AudioContext for the whole Kith Party experience. */
export const gameAudio = new GameAudio();
