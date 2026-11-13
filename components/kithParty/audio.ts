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
 * - Race: 144-160 BPM four-on-the-floor, sidechain-ducked synths, rolling bass, fills, final-lap key lift
 * - Master: tanh saturation → glue compressor → limiter, generated hall reverb send
 * - RaceSoundscape (bottom of file): per-kart engines, tyre screech, boost roar, race one-shots
 */

import type { CourseId } from './course3d';
import { lyriaMusic, type MusicNoteEvent } from './lyriaMusic';
/** Phones/tablets: fewer, cheaper DSP nodes and a larger output buffer. */
const LOW_POWER_AUDIO = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
/** How far ahead the music sequencer schedules notes (s). */
const MUSIC_AHEAD = 0.3;

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
const BASE_THEMES: Record<Exclude<CourseId, 'ember-ridge'>, CourseMusicTheme> = {
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
// 6. Ember Ridge Run: the canyon theme pushed into a hotter, faster volcanic sprint
const COURSE_THEMES: Record<CourseId, CourseMusicTheme> = {
 ...BASE_THEMES,
 'ember-ridge': {...BASE_THEMES['dune-canyon'], bpm: 148, leadWaveA: 'square', leadWaveB: 'sawtooth', detuneCents: 14, cutoffBase: 2300},
};


const DRUM_PATTERNS = {
 menu: {
  kick: B([1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
  hat: B([1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0]),
  openHat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
  snare: B([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
 },
 race: {
  kick: B([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]),
  hat: B([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
  openHat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
  snare: B([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
 },
 groove: {
  kick: B([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]),
  hat: B([1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1]),
  openHat: B([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
  snare: B([0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0]),
 },
};

const MASTER_VOL = 0.86;
const MUSIC_VOL = 0.5;
const SFX_VOL = 0.9;
const RACE_VOL = 0.95;
/** Race themes are pushed into a driving 144-160 BPM range; data keeps each course's own feel. */
const raceBpm = (bpm: number) => Math.min(160, Math.max(144, Math.round(bpm * 1.1)));

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
 private reverbSend: GainNode | null = null;
 private duckBus: GainNode | null = null;
 private raceBus: GainNode | null = null;
 private raceScape: RaceSoundscape | null = null;
 private countdownN = 3;
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
  finalLap: false,
 };

 get context(): AudioContext | null { return this.ctx; }
 get isMuted(): boolean { return this.muted; }
 get isPlaying(): boolean { return this.timer !== null; }

 setCourse(id: CourseId): void {
  this.courseId = id;
 }

 updateRaceTelemetry(tel: { speedNorm: number; driftStage: number; boostActive: boolean; inLoop: boolean; lap: number; finalLap?: boolean }): void {
  this.telemetry = {...tel, finalLap: tel.finalLap ?? tel.lap >= 3};
 }

 /** Kart engines, tyres and race one-shots (created on first use after unlock). */
 get race(): RaceSoundscape | null {
  if (!this.raceScape && this.ctx && this.raceBus && this.noiseBuf && this.sfxBus) this.raceScape = new RaceSoundscape(this.ctx, this.raceBus, this.noiseBuf, this.sfxBus);
  return this.raceScape;
 }
 /** Tear down the kart voices when a race ends (music and other SFX keep running). */
 endRace(): void { this.raceScape?.dispose(); this.raceScape = null; }

 /* ------------------------- Master chain + drop-out watchdog ------------------------ */
 private post: { sat: WaveShaperNode; glue: DynamicsCompressorNode; makeup: GainNode; limiter: DynamicsCompressorNode; probe: AnalyserNode } | null = null;
 /** What the watchdog saw and did — `window.__kithAudio` in the console for playtest diagnosis. */
 readonly audioLog: string[] = [];
 private note(msg: string) { const line = `${new Date().toLocaleTimeString()} ${msg}`; this.audioLog.push(line); if (this.audioLog.length > 60) this.audioLog.shift(); console.info('[kith audio]', msg); }
 /** Master: gentle tanh saturation → glue compressor → brickwall-style limiter → speakers (rebuildable). */
 private buildPost(): void {
  const ctx = this.ctx!, master = this.master!;
  if (this.post) { try { master.disconnect(); } catch { /* */ } for (const n of Object.values(this.post)) { try { n.disconnect(); } catch { /* */ } } }
  const sat = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) { const x = (i * 2) / curve.length - 1; curve[i] = Math.tanh(x * 1.35) / Math.tanh(1.35); }
  sat.curve = curve as any;
  sat.oversample = LOW_POWER_AUDIO ? 'none' : '2x';
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16; glue.knee.value = 12; glue.ratio.value = 3; glue.attack.value = 0.006; glue.release.value = 0.16;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  const makeup = ctx.createGain(); makeup.gain.value = 1.15;
  const probe = ctx.createAnalyser(); probe.fftSize = 512;
  master.connect(sat); sat.connect(glue); glue.connect(makeup); makeup.connect(limiter); limiter.connect(ctx.destination); limiter.connect(probe);
  this.post = { sat, glue, makeup, limiter, probe };
 }
 /**
  * Complete drop-outs that never come back have two usual causes, both handled here:
  *  • one NaN/Inf sample (an unstable filter) poisons the compressors, which then output silence forever →
  *    detect it on the master probe, throw the poisoned race engines away and rebuild the master chain;
  *  • the output device changes under us (Bluetooth headphones flip to headset mode when the mic opens for
  *    Voca, a USB / HDMI device appears) → re-point the context at the default device and resume it.
  */
 private startWatchdog(): void {
  const ctx = this.ctx!;
  (window as any).__kithAudio = this.audioLog;
  ctx.addEventListener('statechange', () => this.note(`context ${ctx.state}`));
  navigator.mediaDevices?.addEventListener?.('devicechange', () => {
   this.note('output device changed — re-routing');
   const c = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
   void (c.setSinkId ? c.setSinkId('').catch(() => {}) : Promise.resolve()).then(() => ctx.resume().catch(() => {}));
  });
  const buf = new Float32Array(512);
  let lastLoud = performance.now();
  window.setInterval(() => {
   if (!this.post || ctx.state === 'closed') return;
   if (ctx.state !== 'running') { void ctx.resume().catch(() => {}); return; }
   this.post.probe.getFloatTimeDomainData(buf);
   let bad = false, peak = 0;
   for (let i = 0; i < buf.length; i++) { const v = buf[i]; if (!Number.isFinite(v)) { bad = true; break; } peak = Math.max(peak, Math.abs(v)); }
   if (bad) {
    this.note('non-finite samples on the master — rebuilding the audio chain');
    this.raceScape?.dispose(); this.raceScape = null;
    this.buildPost();
    return;
   }
   if (peak > 1e-4) lastLoud = performance.now();
   else if (this.trackName && !this.muted && performance.now() - lastLoud > 4000) { this.note('music playing but the master has been silent 4 s — rebuilding the audio chain'); lastLoud = performance.now(); this.buildPost(); }
  }, 500);
 }

 unlock(): boolean {
  if (typeof window === 'undefined') return false;
  if (!this.ctx) {
   const AC = window.AudioContext;
   if (!AC) return false;
   // Bigger device buffer than the default 'interactive' (~10 ms), which phones and busy frames can't keep fed:
   // that underrun is the crackle / stutter / drop-out. Phones get 'playback'; desktop 'balanced' keeps engines responsive.
   const ctx = new AC({ latencyHint: LOW_POWER_AUDIO ? 'playback' : 'balanced' });
   this.ctx = ctx;
   // The browser can suspend audio (phone call, tab switch, mic opened for Voca, Bluetooth hop): resume on its own.
   const revive = () => { if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {}); };
   ctx.addEventListener('statechange', () => { if (ctx.state !== 'running') window.setTimeout(revive, 250); });
   for (const ev of ['pointerdown', 'keydown', 'visibilitychange'] as const) window.addEventListener(ev, revive, { passive: true });

   // Master: gentle tanh saturation → glue compressor → brickwall-style limiter → speakers.
   // Loud and punchy without clipping, even with 4 engines + music + one-shots stacked.
   this.master = ctx.createGain();
   this.master.gain.value = this.muted ? 0 : MASTER_VOL;
   this.buildPost();

   this.musicBus = ctx.createGain();
   this.musicBus.gain.value = MUSIC_VOL;
   this.musicBus.connect(this.master);
   // synth voices sit on a ducked sub-bus so they pump under the kick
   this.duckBus = ctx.createGain();
   this.duckBus.gain.value = 1;
   this.duckBus.connect(this.musicBus);

   this.sfxBus = ctx.createGain();
   this.sfxBus.gain.value = SFX_VOL;
   this.sfxBus.connect(this.master);

   this.raceBus = ctx.createGain();
   this.raceBus.gain.value = RACE_VOL;
   this.raceBus.connect(this.master);
   this.startWatchdog();

   // Generated stereo hall impulse (early reflections + 2.2 s diffuse tail) for space and size
   const irLen = Math.floor(ctx.sampleRate * 2.2);
   const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
   for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
     const tt = i / ctx.sampleRate;
     d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6) * (tt < 0.08 ? 0.6 + Math.random() * 0.6 : 0.42);
    }
    for (const er of [0.011, 0.023, 0.037, 0.051]) d[Math.floor((er + ch * 0.003) * ctx.sampleRate)] += 0.7;
   }
   const verb = ctx.createConvolver(); verb.buffer = ir;
   const verbHp = ctx.createBiquadFilter(); verbHp.type = 'highpass'; verbHp.frequency.value = 280;
   const verbOut = ctx.createGain(); verbOut.gain.value = 0.3;
   this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 1;
   this.reverbSend.connect(verbHp); verbHp.connect(verb); verb.connect(verbOut); verbOut.connect(this.master);
   const sfxVerb = ctx.createGain(); sfxVerb.gain.value = 0.16; this.sfxBus.connect(sfxVerb); sfxVerb.connect(this.reverbSend);

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

   // Shared 1s white noise buffer for drums, tyres and whooshes
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
  const lapMult = track === 'race' && this.telemetry.finalLap ? 1.06 : 1.0;
  const boostMult = track === 'race' && this.telemetry.boostActive ? 1.02 : 1.0;
  const effectiveBpm = (track === 'race' ? raceBpm(theme.bpm) : theme.bpm) * lapMult * boostMult;
  const stepDur = 60 / effectiveBpm / 4;

  let guard = 0;
  // Fell behind (a long frame, a throttled tab)? Skip the missed steps instead of firing them all at once.
  if (this.nextT < ctx.currentTime - 0.03) { const missed = Math.ceil((ctx.currentTime + 0.03 - this.nextT) / stepDur); this.nextT += missed * stepDur; this.step = (this.step + missed) % theme.lead.length; }
  // Schedule well ahead so a 300 ms frame hitch never starves the music.
  while (this.nextT < ctx.currentTime + MUSIC_AHEAD && guard++ < 48) {
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
  const synth = this.duckBus ?? music;
  const race = track === 'race';
  const bar = Math.floor(i / 16) % 4;
  const beatStep = i % 16;
  // final lap: whole arrangement lifts a whole tone
  const lift = race && this.telemetry.finalLap ? 2 : 0;
  const chord = theme.chords[bar % theme.chords.length]?.map((n) => n + lift);
  const leadMidiRaw = theme.lead[i];
  const leadMidi = leadMidiRaw == null ? null : leadMidiRaw + lift;
  const bassMidi = theme.bass[i] == null ? null : (theme.bass[i] as number) + lift;
  const energy = race ? 1 + (this.telemetry.boostActive ? 0.25 : 0) + (this.telemetry.finalLap ? 0.2 : 0) : 0.8;

  // 1. Expressive dual-oscillator lead (octave up through loops)
  if (leadMidi != null) {
   const pitchShift = race && this.telemetry.inLoop ? 12 : 0;
   this.playExpressiveLead(mf(leadMidi + pitchShift), t, stepDur * 1.85, theme.leadWaveA, theme.leadWaveB, theme.detuneCents,
    theme.cutoffBase + (this.telemetry.boostActive ? 1400 : 0) + (this.telemetry.finalLap ? 700 : 0), synth);
   // race hook gets a bright octave double so it cuts through engines
   if (race) this.tone({freq: mf(leadMidi + pitchShift + 12), t, dur: stepDur * 1.2, type: 'square', vol: 0.018 * energy, bus: synth, echo: true});
  }

  // 2. 16th-note counter-arpeggio
  const arpRaw = theme.counter[i];
  if (race && arpRaw != null) {
   const arpVol = 0.034 + (this.telemetry.boostActive ? 0.03 : 0) + this.telemetry.driftStage * 0.012 + (this.telemetry.finalLap ? 0.012 : 0);
   this.tone({freq: mf(arpRaw + lift), t, dur: stepDur * 0.9, type: beatStep % 2 ? 'triangle' : 'square', vol: arpVol * (beatStep % 4 === 0 ? 1.15 : 0.85), bus: synth, echo: true});
  }

  // 3. Supersaw chord stabs on the off-beats
  if ((beatStep === 2 || beatStep === 6 || beatStep === 10 || beatStep === 14) && chord) this.playChordStab(chord, t, stepDur * 1.4, synth);

  // 4. Bass: written line + (race) rolling off-beat octave pump on the chord root
  if (bassMidi != null) this.playSlapBass(mf(bassMidi), t, stepDur * 1.65, synth);
  else if (race && chord && beatStep % 2 === 1) this.playSlapBass(mf(chord[0] - 24 + (beatStep % 4 === 3 ? 12 : 0)), t, stepDur * 0.9, synth);

  // 5. Drums (kick + snare/clap direct to the music bus so they don't duck themselves)
  const drums = DRUM_PATTERNS[track];
  const fill = race && bar === 3 && beatStep >= 12;
  if (drums.kick[beatStep]) this.playKick(t, music);
  if (fill) this.playSnare(t, music, 0.45 + (beatStep - 12) * 0.18);
  else if (drums.snare[beatStep]) { this.playSnare(t, music); if (race) this.playClap(t, music); }
  else if (race && (beatStep === 7 || beatStep === 14) && Math.random() < 0.5) this.playSnare(t, music, 0.28);
  if (drums.hat[beatStep]) {
   const isOpen = drums.openHat[beatStep];
   const accent = beatStep % 4 === 2 ? 1.2 : beatStep % 2 ? 0.7 : 0.95;
   this.noiseHit({t, dur: isOpen ? 0.11 : 0.035, vol: (isOpen ? 0.11 : 0.06) * accent * (race ? energy : 1), filterType: 'highpass', freq: isOpen ? 6800 : 8800, bus: music});
  }
  if (race && beatStep === 0 && (bar === 0 || this.telemetry.boostActive || (this.telemetry.finalLap && bar === 2))) this.playCrash(t, music);

  // 6. Drive Google Lyria RealTime with this exact note event
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
    intensity: race ? (this.telemetry.finalLap ? 0.95 : 0.85) : track === 'groove' ? 0.65 : 0.45,
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
  if (this.reverbSend) g.connect(this.reverbSend);

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
  g.gain.linearRampToValueAtTime(0.026, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filter.connect(g);
  g.connect(bus);

  notes.forEach((m) => {
   for (const det of [-11, 11]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(mf(m), t);
    osc.detune.setValueAtTime(det, t);
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + dur + 0.03);
   }
  });
  if (this.reverbSend) g.connect(this.reverbSend);
 }

 private playKick(t: number, bus: GainNode): void {
  this.tone({ freq: 170, t, dur: 0.2, type: 'sine', vol: 0.62, bus, slideTo: 44 });
  this.tone({ freq: 62, t: t + 0.02, dur: 0.24, type: 'sine', vol: 0.3, bus, slideTo: 40 });
  this.tone({ freq: 1400, t, dur: 0.014, type: 'square', vol: 0.09, bus, slideTo: 200 });
  this.noiseHit({ t, dur: 0.012, vol: 0.12, filterType: 'highpass', freq: 3000, bus });
  // sidechain pump: synths duck under every kick
  const d = this.duckBus;
  if (d) { d.gain.cancelScheduledValues(t); d.gain.setValueAtTime(0.32, t); d.gain.setTargetAtTime(1, t + 0.012, 0.07); }
 }

 private playSnare(t: number, bus: GainNode, vol = 1): void {
  this.tone({ freq: 230, t, dur: 0.09, type: 'triangle', vol: 0.22 * vol, bus, slideTo: 150 });
  this.noiseHit({ t, dur: 0.17, vol: 0.24 * vol, filterType: 'bandpass', freq: 2300, Q: 0.9, bus });
  this.noiseHit({ t, dur: 0.09, vol: 0.12 * vol, filterType: 'highpass', freq: 6000, bus });
  if (this.reverbSend && vol > 0.6) this.noiseHit({ t, dur: 0.12, vol: 0.12 * vol, filterType: 'bandpass', freq: 2000, Q: 1, bus: this.reverbSend });
 }

 private playClap(t: number, bus: GainNode): void {
  for (let k = 0; k < 3; k++) this.noiseHit({ t: t + k * 0.011, dur: 0.03, vol: 0.13, filterType: 'bandpass', freq: 1500, Q: 1.6, bus });
  this.noiseHit({ t: t + 0.033, dur: 0.16, vol: 0.12, filterType: 'bandpass', freq: 1300, Q: 1.2, bus });
 }

 private playCrash(t: number, bus: GainNode): void {
  this.noiseHit({ t, dur: 1.4, vol: 0.13, filterType: 'highpass', freq: 5200, bus });
  this.noiseHit({ t, dur: 0.5, vol: 0.08, filterType: 'bandpass', freq: 3500, Q: 0.7, bus });
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
  if (o.echo && this.reverbSend) g.connect(this.reverbSend);
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

 /** 3-2-1: punchy rising beeps with a sub thump. Pass the number shown (3, 2, 1); omitted = next in sequence. */
 countdownBeep(n?: number): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const k = n ?? this.countdownN;
  this.countdownN = k <= 1 ? 3 : k - 1;
  const t = ctx.currentTime;
  const f = k >= 3 ? 523.25 : k === 2 ? 587.33 : 659.25;
  this.tone({freq: f, t, dur: 0.26, type: 'square', vol: 0.2, bus: sfx, echo: true});
  this.tone({freq: f * 2, t, dur: 0.18, type: 'triangle', vol: 0.12, bus: sfx});
  this.tone({freq: f / 2, t, dur: 0.22, type: 'sawtooth', vol: 0.08, bus: sfx});
  this.tone({freq: 120, t, dur: 0.22, type: 'sine', vol: 0.55, bus: sfx, slideTo: 45});
  this.noiseHit({t, dur: 0.05, vol: 0.18, filterType: 'highpass', freq: 3000});
 }

 /** GO!: bright major stinger, air-horn swell, crash and crowd roar. */
 goBeep(): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  this.countdownN = 3;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
   this.tone({freq: f, t, dur: 0.9, type: 'sawtooth', vol: 0.07, bus: sfx, echo: true});
   this.tone({freq: f * 1.004, t, dur: 0.9, type: 'square', vol: 0.04, bus: sfx});
  });
  this.tone({freq: 1046.5, t, dur: 0.5, type: 'triangle', vol: 0.2, bus: sfx, slideTo: 2093, echo: true});
  // air horn: three detuned saws bending up into pitch
  for (const det of [0.995, 1, 1.006]) this.tone({freq: 300 * det, t, dur: 0.85, type: 'sawtooth', vol: 0.06, bus: sfx, slideTo: 466 * det});
  this.tone({freq: 140, t, dur: 0.4, type: 'sine', vol: 0.65, bus: sfx, slideTo: 40});
  this.noiseHit({t, dur: 1.6, vol: 0.16, filterType: 'highpass', freq: 4800});
  // crowd swell
  const buf = this.noiseBuf;
  if (buf) {
   const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
   const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
   const lfo = ctx.createOscillator(); lfo.frequency.value = 6; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(bp.frequency);
   const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
   src.connect(bp); bp.connect(g); g.connect(sfx);
   src.start(t, Math.random() * 0.5); lfo.start(t); src.stop(t + 2.5); lfo.stop(t + 2.5);
  }
 }

 /** Lap crossed. `final` = the big final-lap fanfare. */
 lapChime(final = false): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  if (!final) {
   [880, 1174.66, 1318.5, 1760].forEach((f, idx) => {
    this.tone({freq: f, t: t + idx * 0.065, dur: 0.24, type: 'triangle', vol: 0.22, bus: sfx, echo: true});
    this.tone({freq: f / 2, t: t + idx * 0.065, dur: 0.2, type: 'square', vol: 0.05, bus: sfx});
   });
   this.noiseHit({t, dur: 0.6, vol: 0.08, filterType: 'highpass', freq: 6000});
   return;
  }
  // FINAL LAP: brass-style triplet fanfare, timpani roll, crash
  const notes = [[659.25, 0], [659.25, 0.11], [659.25, 0.22], [880, 0.36], [783.99, 0.6], [1046.5, 0.74]];
  for (const [f, dt] of notes) {
   for (const det of [-8, 8]) this.tone({freq: f * Math.pow(2, det / 1200), t: t + dt, dur: dt >= 0.74 ? 0.9 : 0.16, type: 'sawtooth', vol: 0.07, bus: sfx, echo: true});
   this.tone({freq: f / 2, t: t + dt, dur: 0.16, type: 'square', vol: 0.05, bus: sfx});
  }
  for (let k = 0; k < 8; k++) this.tone({freq: 98, t: t + k * 0.06, dur: 0.12, type: 'sine', vol: 0.18 + k * 0.03, bus: sfx, slideTo: 70});
  this.tone({freq: 130, t: t + 0.74, dur: 0.5, type: 'sine', vol: 0.6, bus: sfx, slideTo: 40});
  this.noiseHit({t: t + 0.74, dur: 1.6, vol: 0.16, filterType: 'highpass', freq: 5000});
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
  const t = ctx.currentTime;
  this.noiseHit({t, dur: 0.5, vol: 0.28, filterType: 'bandpass', freq: 420, freqEnd: 3800, Q: 1.4});
  this.tone({freq: 200, t, dur: 0.35, type: 'sawtooth', vol: 0.12, bus: sfx, slideTo: 60});
  this.tone({freq: 90, t, dur: 0.3, type: 'sine', vol: 0.35, bus: sfx, slideTo: 42});
 }

 collisionThud(): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  this.tone({ freq: 110, t, dur: 0.26, type: 'sine', vol: 0.55, bus: sfx, slideTo: 42 });
  this.noiseHit({ t, dur: 0.16, vol: 0.26, filterType: 'lowpass', freq: 900, freqEnd: 200 });
  this.noiseHit({ t, dur: 0.05, vol: 0.14, filterType: 'highpass', freq: 3000 });
 }

 /** Finish line: drum hit, rising brass run, held major chord with shimmer and crash. */
 finishFanfare(): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  this.tone({freq: 140, t, dur: 0.5, type: 'sine', vol: 0.65, bus: sfx, slideTo: 40});
  this.noiseHit({t, dur: 1.8, vol: 0.16, filterType: 'highpass', freq: 5000});
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
   this.tone({freq: f, t: t + i * 0.09, dur: 0.3, type: 'sawtooth', vol: 0.08, bus: sfx, echo: true});
   this.tone({freq: f, t: t + i * 0.09, dur: 0.3, type: 'triangle', vol: 0.14, bus: sfx});
  });
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
   for (const det of [-10, 0, 10]) this.tone({freq: f * Math.pow(2, det / 1200), t: t + 0.5, dur: 1.6, type: 'sawtooth', vol: 0.045, bus: sfx, echo: true});
  });
  [2093, 2637, 3136, 4186].forEach((f, i) => this.tone({freq: f, t: t + 0.55 + i * 0.07, dur: 0.5, type: 'sine', vol: 0.06, bus: sfx, echo: true}));
  this.tone({freq: 130, t: t + 0.5, dur: 0.6, type: 'sine', vol: 0.55, bus: sfx, slideTo: 40});
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

 /** Ball on the court: a soft thump (grass/clay) or a crisper pock (hard/ice/stone). */
 tennisBounce(soft = false): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  this.tone({freq: soft ? 120 : 190, t, dur: 0.07, type: 'sine', vol: soft ? 0.2 : 0.16, bus: sfx, slideTo: soft ? 70 : 110});
  this.noiseHit({t, dur: soft ? 0.05 : 0.03, vol: soft ? 0.06 : 0.09, filterType: soft ? 'lowpass' : 'bandpass', freq: soft ? 700 : 2400, Q: 1.2});
 }

 /** Ball into the net: a dull rustle with a low thud. */
 tennisNet(): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  this.noiseHit({t, dur: 0.22, vol: 0.14, filterType: 'bandpass', freq: 520, freqEnd: 260, Q: 0.9});
  this.tone({freq: 90, t, dur: 0.14, type: 'sine', vol: 0.22, bus: sfx, slideTo: 55});
 }

 /** Stadium crowd: a roar swell plus scattered applause. `level` 0..1. */
 crowdCheer(level = 0.6): void {
  const ctx = this.ctx, sfx = this.sfxBus, buf = this.noiseBuf;
  if (!ctx || !sfx || !buf) return;
  const t = ctx.currentTime, dur = 1.3 + level * 1.4;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 0.5;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 240; lfo.connect(lg); lg.connect(bp.frequency);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + level * 0.11, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(sfx);
  src.start(t, Math.random() * 0.5); lfo.start(t); src.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  const claps = Math.round(10 + level * 26);
  for (let i = 0; i < claps; i++) this.noiseHit({t: t + 0.08 + Math.random() * dur * 0.8, dur: 0.025, vol: 0.03 + Math.random() * 0.04, filterType: 'highpass', freq: 1800 + Math.random() * 1800});
 }

 /** The crowd's "ooh" on a net cord or a near miss. */
 crowdOoh(): void {
  const ctx = this.ctx, sfx = this.sfxBus;
  if (!ctx || !sfx) return;
  const t = ctx.currentTime;
  this.noiseHit({t, dur: 0.9, vol: 0.07, filterType: 'bandpass', freq: 760, freqEnd: 380, Q: 2.2});
  for (const f of [220, 277, 330]) this.tone({freq: f, t, dur: 0.8, type: 'triangle', vol: 0.025, bus: sfx, slideTo: f * 0.8});
 }
}


/* =====================================================================================
 * RaceSoundscape — Kith Racing kart audio
 * - Per-kart layered engine: sub + saw + pulse + 3rd-harmonic saw → warm saturation → load filter.
 *   RPM comes from speed through a 6-speed gearbox model, so upshifts audibly drop the note.
 * - Boost: turbine whine + afterburner roar (bigger on super boost) and a rocket-start whoosh.
 * - Tyres: band-passed noise screech + resonant squeal, spark sizzle while charging a drift,
 *   curb rumble and gravel when off-road. All crossfade with intensity, none click on/off.
 * - 4 voice slots: every human kart plus the nearest bots, distance-attenuated and panned
 *   from the player-1 camera; small per-kart pitch offsets so karts never phase together.
 * - One-shots for every race event (hits, items, specials, ramps, landings, walls, falls…).
 * ===================================================================================== */

export interface RaceSoundKart {
 index: number; human: boolean; character: string;
 mps: number; speedNorm: number; boost: number; superBoost: boolean;
 drift: number; driftStage: number; burnout: number; braking: boolean; reversing: boolean;
 steer: number; slip: number; surface: 'asphalt' | 'curb' | 'offroad'; airborne: boolean; inLoop: boolean;
 x: number; y: number; z: number;
}
export interface RaceListener { x: number; y: number; z: number; rx: number; ry: number; rz: number; }

const GEAR_BANDS = [0, 8, 15, 23, 31, 40, 50, 72];

function saturationCurve(drive: number): Float32Array {
 const n = 1024, c = new Float32Array(n);
 for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
 return c;
}

interface EngineVoice {
 kart: number; human: boolean; pitch: number;
 sub: OscillatorNode; saw: OscillatorNode; pulse: OscillatorNode; saw3: OscillatorNode;
 gSub: GainNode; gSaw: GainNode; gPulse: GainNode; gSaw3: GainNode;
 filter: BiquadFilterNode; engine: GainNode;
 whine: OscillatorNode; gWhine: GainNode;
 roar: BiquadFilterNode; gRoar: GainNode;
 screechBp: BiquadFilterNode; gScreech: GainNode; squeal: OscillatorNode; squealLfo: OscillatorNode; gSqueal: GainNode;
 gSizzle: GainNode; rumble: OscillatorNode; gRumble: GainNode; gravel: GainNode;
 pan: StereoPannerNode; out: GainNode;
 sources: AudioScheduledSourceNode[];
 lastMps: number; gear: number; load: number; lastBoost: number; crackleAt: number;
}

export class RaceSoundscape {
 private voices: EngineVoice[] = [];
 private wind: {g: GainNode; f: BiquadFilterNode; src: AudioBufferSourceNode} | null = null;
 private listener: RaceListener = {x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0};
 private lastRaceTime = -10;
 private lastDriftEventAt = -10;
 private shaperCurve = saturationCurve(2.4);
 private karts: RaceSoundKart[] = [];

 constructor(private ctx: AudioContext, private bus: GainNode, private noise: AudioBuffer, private fxBus: GainNode) {
  for (let i = 0; i < 4; i++) this.voices.push(this.makeVoice(i));
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = .6;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(bus); src.start(0, Math.random());
  this.wind = {g, f, src};
 }

 private noiseSrc(offset: number): AudioBufferSourceNode {
  const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
  s.start(0, offset % Math.max(.01, this.noise.duration)); return s;
 }

 private makeVoice(slot: number): EngineVoice {
  const ctx = this.ctx;
  const osc = (type: OscillatorType, f: number) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const sub = osc('sine', 30), saw = osc('sawtooth', 60), pulse = osc('square', 120), saw3 = osc('sawtooth', 180);
  pulse.detune.value = 7; saw3.detune.value = -9;
  const gSub = gain(.5), gSaw = gain(.5), gPulse = gain(.25), gSaw3 = gain(.15);
  const shaper = ctx.createWaveShaper(); shaper.curve = this.shaperCurve as any; shaper.oversample = '2x';
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 4;
  const engine = gain(0);
  sub.connect(gSub); saw.connect(gSaw); pulse.connect(gPulse); saw3.connect(gSaw3);
  gSaw.connect(shaper); gPulse.connect(shaper); gSaw3.connect(shaper);
  if (LOW_POWER_AUDIO) shaper.oversample = 'none';
  shaper.connect(filter); filter.connect(engine); gSub.connect(engine);
  const pan = ctx.createStereoPanner(), out = gain(0);
  engine.connect(pan);
  // boost: turbine whine + afterburner roar
  const whine = osc('sine', 2200), gWhine = gain(0); whine.connect(gWhine); gWhine.connect(pan);
  const roarSrc = this.noiseSrc(slot * .21 + .05);
  const roar = ctx.createBiquadFilter(); roar.type = 'bandpass'; roar.frequency.value = 520; roar.Q.value = .7;
  const gRoar = gain(0); roarSrc.connect(roar); roar.connect(gRoar); gRoar.connect(pan);
  // tyres: screech + squeal + sizzle
  const scSrc = this.noiseSrc(slot * .33 + .11);
  const screechBp = ctx.createBiquadFilter(); screechBp.type = 'bandpass'; screechBp.frequency.value = 1900; screechBp.Q.value = 5;
  const screechPeak = ctx.createBiquadFilter(); screechPeak.type = 'peaking'; screechPeak.frequency.value = 3100; screechPeak.gain.value = 9; screechPeak.Q.value = 3;
  const gScreech = gain(0); scSrc.connect(screechBp); screechBp.connect(screechPeak); screechPeak.connect(gScreech); gScreech.connect(pan);
  const squeal = osc('triangle', 1150), squealLfo = osc('sine', 7.3), lfoG = gain(38);
  squealLfo.connect(lfoG); lfoG.connect(squeal.frequency);
  const gSqueal = gain(0); squeal.connect(gSqueal); gSqueal.connect(pan);
  const szSrc = this.noiseSrc(slot * .41 + .17);
  const szHp = ctx.createBiquadFilter(); szHp.type = 'highpass'; szHp.frequency.value = 6500;
  const gSizzle = gain(0); szSrc.connect(szHp); szHp.connect(gSizzle); gSizzle.connect(pan);
  // surface: curb rumble + gravel
  const rumble = osc('sawtooth', 45), rbF = ctx.createBiquadFilter(); rbF.type = 'lowpass'; rbF.frequency.value = 260;
  const gRumble = gain(0); rumble.connect(rbF); rbF.connect(gRumble); gRumble.connect(pan);
  const grSrc = this.noiseSrc(slot * .53 + .23), grF = ctx.createBiquadFilter(); grF.type = 'lowpass'; grF.frequency.value = 900;
  const gravel = gain(0); grSrc.connect(grF); grF.connect(gravel); gravel.connect(pan);
  pan.connect(out); out.connect(this.bus);
  const sources: AudioScheduledSourceNode[] = [sub, saw, pulse, saw3, whine, squeal, squealLfo, rumble];
  sources.forEach(s => (s as OscillatorNode).start());
  sources.push(roarSrc, scSrc, szSrc, grSrc);
  return {kart: -1, human: false, pitch: 1, sub, saw, pulse, saw3, gSub, gSaw, gPulse, gSaw3, filter, engine, whine, gWhine, roar, gRoar,
   screechBp, gScreech, squeal, squealLfo, gSqueal, gSizzle, rumble, gRumble, gravel, pan, out, sources, lastMps: 0, gear: 1, load: 0, lastBoost: 0, crackleAt: 0};
 }

 /** Called every render frame with every kart, the player-1 camera, race clock and frame dt. */
 update(karts: RaceSoundKart[], listener: RaceListener, raceTime: number, dt: number): void {
  const ctx = this.ctx, t = ctx.currentTime;
  this.listener = listener; this.karts = karts;
  const dist = (k: RaceSoundKart) => Math.hypot(k.x - listener.x, k.y - listener.y, k.z - listener.z);
  // humans first, then nearest bots, into 4 slots (keep existing assignments when still wanted)
  const wanted = [...karts.filter(k => k.human), ...karts.filter(k => !k.human).sort((a, b) => dist(a) - dist(b))].slice(0, this.voices.length).map(k => k.index);
  const free = this.voices.filter(v => !wanted.includes(v.kart));
  for (const idx of wanted) {
   if (this.voices.some(v => v.kart === idx)) continue;
   const v = free.shift(); if (!v) break;
   v.kart = idx; v.gear = 1; v.lastMps = karts[idx]?.mps ?? 0; v.out.gain.setValueAtTime(0, t);
  }
  for (const v of this.voices) {
   const k = karts.find(x => x.index === v.kart);
   if (!k) { v.out.gain.setTargetAtTime(0, t, .05); continue; }
   v.human = k.human;
   v.pitch = 1 + ((k.index * 37) % 11 - 5) * .012;
   const mps = Math.abs(k.mps);
   const accel = dt > 0 ? (k.mps - v.lastMps) / dt : 0;
   v.lastMps = k.mps;
   // ---- gearbox → rpm
   let gear = 1;
   while (gear < GEAR_BANDS.length - 1 && mps > GEAR_BANDS[gear]) gear++;
   const lo = GEAR_BANDS[gear - 1], hi = GEAR_BANDS[gear];
   let rpm = mps < .6 ? .16 + Math.sin(t * 9 + k.index) * .01 : .3 + .7 * Math.min(1, (mps - lo) / (hi - lo));
   const targetLoad = k.braking ? 0 : k.airborne ? .1 : Math.max(0, Math.min(1, accel / 9 + (k.boost > 0 ? .7 : 0) + (mps > 2 && !k.braking ? .25 : 0)));
   v.load += (targetLoad - v.load) * Math.min(1, dt * 8);
   if (k.airborne) rpm = Math.min(1.1, rpm + .18);
   if (gear !== v.gear) {
    if (gear > v.gear && mps > 6) this.shift(v, t);
    v.gear = gear;
   }
   const boostAmt = k.boost > 0 ? (k.superBoost ? 1 : .75) : 0;
   const f = (46 + rpm * 150) * v.pitch * (1 + boostAmt * .08) * (k.reversing ? .8 : 1);
   v.saw.frequency.setTargetAtTime(f, t, .03);
   v.sub.frequency.setTargetAtTime(f * .5, t, .03);
   v.pulse.frequency.setTargetAtTime(f * 2, t, .03);
   v.saw3.frequency.setTargetAtTime(f * 3.01, t, .03);
   v.gSaw.gain.setTargetAtTime(.45 + v.load * .3, t, .05);
   v.gPulse.gain.setTargetAtTime(.18 + rpm * .25, t, .05);
   v.gSaw3.gain.setTargetAtTime(.06 + v.load * .3, t, .05);
   v.filter.frequency.setTargetAtTime(240 + rpm * 1300 + v.load * 2300 + boostAmt * 1600, t, .04);
   v.engine.gain.setTargetAtTime(.075 + v.load * .07 + rpm * .045 + boostAmt * .04, t, .05);
   // overrun crackle when lifting at speed
   if (v.human && v.load < .08 && mps > 16 && t > v.crackleAt) { v.crackleAt = t + .07 + Math.random() * .18; this.crackle(v); }
   // ---- boost layers
   v.whine.frequency.setTargetAtTime(1500 + rpm * 1900 + boostAmt * 900, t, .08);
   v.gWhine.gain.setTargetAtTime(.012 + boostAmt * .05 + (mps / 60) * .012, t, .08);
   v.gRoar.gain.setTargetAtTime(boostAmt * (k.superBoost ? .42 : .3), t, boostAmt ? .03 : .12);
   v.roar.frequency.setTargetAtTime(380 + boostAmt * 420 + rpm * 300, t, .05);
   if (k.boost > 0 && v.lastBoost <= 0 && v.human && raceTime - this.lastDriftEventAt > .25 && raceTime > .6) this.boostIgnite(.85, k.superBoost);
   v.lastBoost = k.boost;
   // ---- tyres
   const onGround = !k.airborne;
   let screech = 0;
   if (onGround) {
    if (k.drift > .1) screech = Math.max(screech, .5 + k.driftStage * .14);
    screech = Math.max(screech, Math.min(1, k.burnout * 1.1));
    if (k.braking && mps > 9) screech = Math.max(screech, Math.min(.85, mps / 34));
    screech = Math.max(screech, Math.min(.8, Math.abs(k.slip) * 1.6 * Math.min(1, mps / 20)));
   }
   const offroad = k.surface === 'offroad';
   v.gScreech.gain.setTargetAtTime(screech * (offroad ? .06 : .2), t, screech > .05 ? .025 : .08);
   v.screechBp.frequency.setTargetAtTime(1500 + Math.abs(k.steer) * 520 + k.driftStage * 260 + mps * 8, t, .05);
   v.squeal.frequency.setTargetAtTime((880 + screech * 520 + k.driftStage * 110) * v.pitch, t, .06);
   v.gSqueal.gain.setTargetAtTime(offroad ? 0 : screech * screech * .07, t, .05);
   v.gSizzle.gain.setTargetAtTime(k.drift > .1 && onGround ? .018 + k.driftStage * .02 : 0, t, .05);
   v.rumble.frequency.setTargetAtTime(32 + mps * 1.1, t, .03);
   v.gRumble.gain.setTargetAtTime(onGround && k.surface === 'curb' ? .16 : 0, t, .03);
   v.gravel.gain.setTargetAtTime(onGround && offroad ? .05 + k.speedNorm * .12 : 0, t, .05);
   // ---- placement
   const d = dist(k);
   const att = k.human ? 1 : 1 / (1 + Math.pow(d / 13, 1.5));
   const dx = k.x - listener.x, dy = k.y - listener.y, dz = k.z - listener.z, len = Math.max(.001, Math.hypot(dx, dy, dz));
   const pan = k.human && karts.filter(x => x.human).length < 2 ? 0 : Math.max(-1, Math.min(1, (dx * listener.rx + dy * listener.ry + dz * listener.rz) / len)) * .85;
   v.pan.pan.setTargetAtTime(pan, t, .05);
   v.out.gain.setTargetAtTime((k.human ? .95 : .8) * att, t, .06);
  }
  // wind rush at speed for the player
  const me = karts.find(k => k.human);
  if (this.wind && me) {
   this.wind.g.gain.setTargetAtTime(Math.min(.09, me.speedNorm * me.speedNorm * .06 + (me.boost > 0 ? .03 : 0)), t, .1);
   this.wind.f.frequency.setTargetAtTime(380 + me.speedNorm * 900, t, .1);
  }
  // rocket start
  if (this.lastRaceTime < 0 && raceTime >= 0 && me && me.boost > 0) this.rocketStart();
  this.lastRaceTime = raceTime;
 }

 private shift(v: EngineVoice, t: number): void {
  v.engine.gain.cancelScheduledValues(t);
  v.engine.gain.setValueAtTime(v.engine.gain.value * .35, t);
  v.engine.gain.setTargetAtTime(.1, t + .05, .04);
  if (!v.human) return;
  const ctx = this.ctx;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + .07);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = ctx.createGain(); g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0005, t + .09);
  o.connect(f); f.connect(g); g.connect(v.pan); o.start(t); o.stop(t + .1);
 }

 private crackle(v: EngineVoice): void {
  const ctx = this.ctx, t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = this.noise;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 900; f.Q.value = 1.2;
  const g = ctx.createGain(); g.gain.setValueAtTime(.16 + Math.random() * .1, t); g.gain.exponentialRampToValueAtTime(.0005, t + .045);
  s.connect(f); f.connect(g); g.connect(v.pan); s.start(t, Math.random() * .8); s.stop(t + .05);
 }

 // ------------------------------------------------------------- one-shots
 private envGain(t: number, peak: number, attack: number, dur: number, to: AudioNode): GainNode {
  const g = this.ctx.createGain();
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  g.connect(to); return g;
 }
 private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, to: AudioNode, attack = .005): void {
  const o = this.ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f0), t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(this.envGain(t, peak, attack, dur, to)); o.start(t); o.stop(t + dur + .05);
 }
 private burst(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, to: AudioNode, q = 1, attack = .004): void {
  const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
  const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(f); f.connect(this.envGain(t, peak, attack, dur, to)); s.start(t, Math.random() * .9); s.stop(t + dur + .05);
 }
 private spatial(at: {x: number; y: number; z: number} | null, human: boolean): GainNode {
  const g = this.ctx.createGain();
  const p = this.ctx.createStereoPanner();
  if (at && !human) {
   const L = this.listener, dx = at.x - L.x, dy = at.y - L.y, dz = at.z - L.z, d = Math.max(.001, Math.hypot(dx, dy, dz));
   g.gain.value = 1 / (1 + Math.pow(d / 16, 1.4));
   p.pan.value = Math.max(-1, Math.min(1, (dx * L.rx + dy * L.ry + dz * L.rz) / d)) * .8;
  } else g.gain.value = 1;
  g.connect(p); p.connect(this.fxBus);
  return g;
 }

 boostIgnite(power: number, superBoost = false): void {
  const t = this.ctx.currentTime, out = this.spatial(null, true);
  this.tone('sawtooth', 220, 52, t, .42, .3 * power, out);
  this.tone('sine', 90, 40, t, .35, .45 * power, out);
  this.burst(t, .55, .34 * power, 'bandpass', 380, 3600, out, 1.1, .01);
  this.burst(t, .9, .16 * power, 'lowpass', 900, 260, out, .7, .02);
  if (superBoost) [587, 880, 1175].forEach((f, i) => this.tone('square', f, f * 1.3, t + i * .03, .3, .05, out));
 }
 private rocketStart(): void {
  const t = this.ctx.currentTime, out = this.spatial(null, true);
  this.burst(t, .9, .4, 'bandpass', 250, 4200, out, 1.4, .02);
  this.tone('sawtooth', 120, 420, t, .5, .22, out);
  [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + .05 + i * .05, .25, .09, out));
 }
 private miniTurbo(tier: number): void {
  const t = this.ctx.currentTime, out = this.spatial(null, true);
  const base = tier >= 3 ? 330 : tier === 2 ? 247 : 196;
  this.tone('sine', 140, 48, t, .18, .5, out);
  this.burst(t, .05, .4, 'highpass', 2500, 2500, out);
  this.burst(t + .02, .45, .26 + tier * .05, 'bandpass', 500, 3000 + tier * 900, out, 1.3, .01);
  [1, 1.5, 2, 3].slice(0, tier + 1).forEach((m, i) => this.tone('square', base * m * 2, base * m * 2.6, t + i * .035, .22, .045, out));
 }

 /** Race event one-shot. `at` = world position, `human` = a human kart was involved (full level, centre). */
 event(kind: string, data: string, at: {x: number; y: number; z: number} | null, human: boolean, raceTime: number): void {
  const t = this.ctx.currentTime, o = this.spatial(at, human);
  switch (kind) {
   case 'boost': { const tier = Number(String(data).replace('drift', '')) || 1; if (human) { this.lastDriftEventAt = raceTime; this.miniTurbo(tier); } break; }
   case 'hit':
    this.tone('square', 520, 90, t, .45, .2, o);
    this.burst(t, .35, .45, 'lowpass', 2600, 300, o, .8);
    this.tone('sine', 130, 45, t, .3, .5, o);
    for (let i = 0; i < 5; i++) this.tone('triangle', 900 - i * 120, 600 - i * 80, t + .1 + i * .07, .07, .08, o);
    break;
   case 'block':
    [1240, 1870, 2630].forEach((f, i) => this.tone('sine', f, f * .98, t, 1.1 - i * .25, .12, o));
    this.burst(t, .08, .3, 'highpass', 3000, 3000, o);
    break;
   case 'pickup':
    this.burst(t, .12, .25, 'highpass', 4000, 8000, o);
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone('triangle', f, f, t + i * .028, .16, .09, o));
    break;
   case 'item':
    this.burst(t, .28, .3, 'bandpass', 700, 2400, o, 1.2);
    this.tone('sawtooth', 300, 900, t, .2, .1, o);
    break;
   case 'special':
    this.tone('sawtooth', 110, 440, t, .7, .22, o, .04);
    this.tone('sawtooth', 165, 660, t, .7, .16, o, .04);
    this.tone('sine', 80, 35, t + .55, .6, .55, o);
    this.burst(t, 1, .2, 'bandpass', 300, 5000, o, .9, .3);
    [784, 988, 1175, 1568].forEach((f, i) => this.tone('square', f, f, t + .45 + i * .05, .3, .05, o));
    break;
   case 'zap':
    for (let i = 0; i < 7; i++) this.burst(t + i * .04 + Math.random() * .02, .05, .35, 'bandpass', 2000 + Math.random() * 3000, 1200, o, 3);
    this.tone('sawtooth', 60, 40, t, .5, .25, o);
    break;
   case 'launch':
    this.burst(t, .5, .28, 'bandpass', 400, 2600, o, 1.2, .02);
    this.tone('triangle', 260, 620, t, .25, .1, o);
    break;
   case 'land': {
    const k = Math.min(1, .35 + Number(data) * .12);
    this.tone('sine', 120, 38, t, .28, .65 * k, o);
    this.burst(t, .22, .35 * k, 'lowpass', 1500, 200, o);
    this.tone('triangle', 700, 300, t + .02, .1, .07 * k, o);
    break;
   }
   case 'trick':
    [1319, 1760, 2349].forEach((f, i) => this.tone('triangle', f, f * 1.06, t + i * .05, .2, .1, o));
    this.burst(t, .3, .15, 'bandpass', 1200, 4000, o, 2);
    break;
   case 'wall':
    this.burst(t, .32, .4, 'bandpass', 1300, 700, o, 2.2);
    this.burst(t, .12, .3, 'highpass', 3500, 2500, o);
    this.tone('square', 210, 95, t, .18, .12, o);
    break;
   case 'bump':
    this.tone('sine', 150, 60, t, .16, .45, o);
    this.burst(t, .1, .22, 'lowpass', 1200, 300, o);
    break;
   case 'fall':
    this.tone('sine', 1400, 250, t, 1.1, .12, o, .02);
    this.burst(t + 1, .7, .3, 'lowpass', 2400, 400, o, .8, .02);
    break;
   case 'explode':
    this.tone('sine', 110, 28, t, 1.1, .8, o);
    this.burst(t, 1.3, .6, 'lowpass', 4000, 140, o, .7);
    this.burst(t, .2, .35, 'highpass', 2000, 2000, o);
    break;
   case 'freeze':
    for (let i = 0; i < 6; i++) this.tone('sine', 2600 + Math.random() * 1800, 1800, t + i * .05, .12, .06, o);
    this.burst(t, .6, .22, 'highpass', 5000, 2500, o);
    break;
   case 'shock':
    this.tone('sine', 70, 30, t, .7, .7, o);
    this.burst(t, .8, .3, 'lowpass', 600, 80, o);
    this.tone('sawtooth', 55, 40, t, .6, .18, o);
    break;
   case 'confetti':
    for (let i = 0; i < 9; i++) this.burst(t + i * .045 + Math.random() * .03, .05, .3, 'bandpass', 1500 + Math.random() * 2500, 1500, o, 2);
    [1047, 1319, 1568].forEach((f, i) => this.tone('triangle', f, f, t + .1 + i * .06, .2, .07, o));
    break;
   case 'morph': {
    // track shift: grinding stone/machinery rumble, a sweep that rises (shorter) or falls (longer), then a chime
    const up = data === 'short';
    this.burst(t, 1.3, .32, 'lowpass', 260, 90, o, 1, .25);
    this.tone('sawtooth', 48, 62, t, 1.2, .2, o, .2);
    this.tone('square', up ? 220 : 660, up ? 880 : 180, t + .1, .9, .09, o, .05);
    this.burst(t + .15, .8, .12, 'bandpass', 900, 3200, o, 3, .3);
    (up ? [784, 988, 1319] : [659, 523, 392]).forEach((f, i) => this.tone('triangle', f, f, t + 1 + i * .09, .3, .1, o));
    break;
   }
   case 'warp':
    this.tone('sine', 300, 1800, t, .45, .18, o, .03);
    this.tone('sine', 1800, 300, t + .45, .45, .18, o);
    this.burst(t, .9, .14, 'bandpass', 600, 5000, o, 4, .2);
    break;
   default: break;
  }
 }

 silence(): void {
  const t = this.ctx.currentTime;
  for (const v of this.voices) v.out.gain.setTargetAtTime(0, t, .05);
  this.wind?.g.gain.setTargetAtTime(0, t, .05);
 }

 dispose(): void {
  for (const v of this.voices) { for (const s of v.sources) { try { s.stop(); } catch { /* already stopped */ } } v.out.disconnect(); }
  try { this.wind?.src.stop(); } catch { /* stopped */ }
  this.wind?.g.disconnect();
  this.voices = [];
 }
}

/** Shared singleton: one AudioContext for the whole Kith Party experience. */
export const gameAudio = new GameAudio();
