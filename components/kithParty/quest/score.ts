/**
 * Kith Quest — "Lullaby Orchestra" score.
 * Owner's direction (2026-11-12): gorgeous, soothing orchestration — whimsical and fantasy,
 * "a lullaby for adults", enchanting.
 *
 * Original compositions, scheduled live on the shared Kith Party AudioContext:
 * strings pad · harp arpeggios · music box / celesta · breathy flute · cello · soft choir · timpani (boss only),
 * all through a long generated-impulse hall reverb. Each stage has its own 16-bar theme in a slow 3/4 lilt.
 *
 * Adaptive moods (owner, 2026-11-12: "need some with energy and excitement, some to represent danger and fear"):
 *  calm   - the lullaby
 *  energy - the same stage theme as a galloping adventure: spiccato strings, horn lead, brass stabs, frame drum
 *  danger - original 8-bar piece on the stage tonic: tremolo strings, heartbeat, glassy celesta sighs; intensity = fear
 *  battle - the Hollow Warden's war-waltz in D minor; intensity rises with boss phase
 * Moods switch on bar lines (setMood) so transitions stay musical.
 */
import {gameAudio} from '../audio';

type Note = [number | null, number]; // [midi, beats]
interface Theme { bpm: number; beats: number; chords: number[][]; melody: Note[][]; lead: 'box' | 'celesta'; choir: boolean; harpOct: number; }

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// note names → midi helpers for readability
const N: Record<string, number> = {};
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => { for (let o = 1; o < 8; o++) N[n + o] = 12 * (o + 1) + i; });
N.Bb2 = N['A#2']; N.Bb3 = N['A#3']; N.Bb5 = N['A#5'];
const ch = (...ns: string[]) => ns.map(n => N[n]);

/* ---------------------------- the themes ----------------------------- */
const GLOWMOSS: Theme = {
 bpm: 64, beats: 3, lead: 'box', choir: false, harpOct: 12,
 chords: [
  ch('F3', 'A3', 'C4', 'G4'), ch('D3', 'F3', 'A3', 'C4'), ch('Bb2', 'D3', 'F3', 'A3'), ch('C3', 'E3', 'G3', 'Bb3'),
  ch('F3', 'A3', 'C4', 'E4'), ch('A2', 'E3', 'G3', 'C4'), ch('Bb2', 'D3', 'F3', 'G3'), ch('C3', 'E3', 'G3', 'D4'),
  ch('F3', 'A3', 'C4', 'E4'), ch('D3', 'F3', 'A3', 'C4'), ch('Bb2', 'D3', 'F3', 'A3'), ch('C3', 'E3', 'G3', 'Bb3'),
  ch('A2', 'E3', 'G3', 'C4'), ch('D3', 'F3', 'A3', 'C4'), ch('G2', 'Bb2', 'D3', 'F3'), ch('F3', 'A3', 'C4', 'G4'),
 ],
 melody: [
  [[81, 2], [79, 1]], [[77, 1], [79, 1], [81, 1]], [[82, 2], [81, 1]], [[79, 3]],
  [[81, 2], [84, 1]], [[81, 1], [79, 1], [76, 1]], [[77, 2], [74, 1]], [[79, 3]],
  [[84, 2], [86, 1]], [[84, 1], [81, 1], [79, 1]], [[82, 1.5], [81, .5], [79, 1]], [[79, 2], [76, 1]],
  [[81, 2], [79, 1]], [[77, 1], [76, 1], [74, 1]], [[72, 1], [74, 1], [76, 1]], [[77, 3]],
 ],
};
const CASCADE: Theme = {
 bpm: 72, beats: 3, lead: 'celesta', choir: false, harpOct: 12,
 chords: [
  ch('D3', 'F#3', 'A3', 'E4'), ch('D3', 'E3', 'G#3', 'B3'), ch('B2', 'F#3', 'A3', 'D4'), ch('G2', 'B2', 'D3', 'F#3'),
  ch('F#2', 'A2', 'D3', 'C#4'), ch('G2', 'D3', 'F#3', 'A3'), ch('E2', 'B2', 'D3', 'G3'), ch('A2', 'D3', 'E3', 'A3'),
  ch('D3', 'F#3', 'A3', 'E4'), ch('D3', 'E3', 'G#3', 'B3'), ch('F#2', 'C#3', 'E3', 'A3'), ch('B2', 'D3', 'F#3', 'C#4'),
  ch('G2', 'B2', 'D3', 'F#3'), ch('G2', 'Bb2', 'D3', 'E3'), ch('A2', 'D3', 'F#3', 'C#4'), ch('A2', 'D3', 'E3', 'G3'),
 ],
 melody: [
  [[81, 1], [85, 1], [86, 1]], [[88, 2], [83, 1]], [[85, 1.5], [83, .5], [81, 1]], [[78, 3]],
  [[81, 1], [83, 1], [85, 1]], [[86, 2], [85, 1]], [[83, 1], [81, 1], [79, 1]], [[76, 3]],
  [[81, 1], [85, 1], [86, 1]], [[88, 1], [80, 1], [83, 1]], [[81, 2], [76, 1]], [[78, 1], [81, 1], [85, 1]],
  [[83, 2], [78, 1]], [[82, 2], [81, 1]], [[78, 2], [76, 1]], [[74, 3]],
 ],
};
const KEEP: Theme = {
 bpm: 58, beats: 3, lead: 'celesta', choir: true, harpOct: 12,
 chords: [
  ch('D3', 'A3', 'D4', 'F4'), ch('Bb2', 'F3', 'A3', 'D4'), ch('G2', 'D3', 'F3', 'Bb3'), ch('A2', 'E3', 'G3', 'C#4'),
  ch('F2', 'A2', 'D3', 'F3'), ch('C3', 'G3', 'D4', 'E4'), ch('Bb2', 'F3', 'A3', 'D4'), ch('A2', 'D3', 'E3', 'A3'),
  ch('D3', 'A3', 'E4', 'F4'), ch('Bb2', 'D3', 'G3', 'D4'), ch('C3', 'F3', 'A3', 'E4'), ch('Bb2', 'F3', 'A3', 'E4'),
  ch('G2', 'D3', 'F3', 'Bb3'), ch('A2', 'E3', 'G3', 'C#4'), ch('D3', 'A3', 'D4', 'F4'), ch('D3', 'A3', 'D4', 'F4'),
 ],
 melody: [
  [[81, 2], [77, 1]], [[81, 1], [82, 1], [81, 1]], [[79, 2], [77, 1]], [[76, 3]],
  [[77, 2], [74, 1]], [[76, 1], [79, 1], [84, 1]], [[82, 2], [81, 1]], [[81, 3]],
  [[86, 2], [84, 1]], [[82, 1.5], [81, .5], [79, 1]], [[81, 2], [76, 1]], [[77, 1], [76, 1], [74, 1]],
  [[79, 2], [82, 1]], [[81, 1], [79, 1], [73, 1]], [[74, 3]], [[null, 3]],
 ],
};
const THEMES = [GLOWMOSS, CASCADE, KEEP];

/* ------------------------- danger + battle --------------------------- */
/** Danger: original 8-bar piece written relative to the stage tonic (chords at octave 3, melody two octaves up). */
const DANGER_CHORDS = [[0, 7, 12, 15], [-4, 3, 8, 12], [5, 8, 12, 19], [7, 11, 14, 20], [0, 7, 12, 15], [1, 8, 13, 17], [-1, 2, 5, 8], [7, 12, 14, 17]];
const DANGER_MELODY: Note[][] = [
 [[null, 1], [7, 1], [8, 1]], [[7, 2], [3, 1]], [[null, 1], [5, 1], [8, 1]], [[11, 2], [8, 1]],
 [[null, 1], [12, 1], [15, 1]], [[13, 2], [12, 1]], [[11, 1], [8, 1], [5, 1]], [[2, 1], [null, 2]],
];
const STAGE_TONIC = [N.F3, N.D3, N.D3];
/** Battle: the Hollow Warden's war-waltz — Lanternkeep's motif turned into a galloping D-minor 3/4. */
const BATTLE: {chords: number[][]; melody: Note[][]} = {
 chords: [
  ch('D2', 'A2', 'D3', 'F3'), ch('A#1', 'F2', 'A#2', 'D3'), ch('G1', 'D2', 'G2', 'A#2'), ch('A1', 'E2', 'A2', 'C#3'),
  ch('D2', 'A2', 'D3', 'F3'), ch('D#2', 'A#2', 'D#3', 'G3'), ch('C#2', 'E2', 'G2', 'A#2'), ch('A1', 'E2', 'G2', 'C#3'),
  ch('F2', 'C3', 'F3', 'A3'), ch('C2', 'G2', 'C3', 'E3'), ch('D2', 'A2', 'D3', 'F3'), ch('A#1', 'F2', 'A#2', 'D3'),
  ch('G1', 'D2', 'G2', 'A#2'), ch('D#2', 'A#2', 'D#3', 'G3'), ch('A1', 'E2', 'G2', 'C#3'), ch('A1', 'E2', 'A2', 'C#3'),
 ],
 melody: [
  [[69, 1], [74, 1], [77, 1]], [[77, 2], [74, 1]], [[79, 1], [77, 1], [74, 1]], [[73, 3]],
  [[74, 1], [77, 1], [81, 1]], [[82, 2], [79, 1]], [[79, 1], [76, 1], [73, 1]], [[76, 3]],
  [[77, 1], [81, 1], [84, 1]], [[84, 2], [79, 1]], [[81, 1], [77, 1], [74, 1]], [[77, 2], [82, 1]],
  [[79, 1.5], [77, .5], [74, 1]], [[75, 2], [79, 1]], [[76, 1], [73, 1], [76, 1]], [[81, 3]],
 ],
};

export type QuestMood = 'calm' | 'energy' | 'danger' | 'battle';
const ENERGY_BPM = [138, 144, 132];

/* ------------------------------ engine ------------------------------- */
class LullabyScore {
 private ctx: AudioContext | null = null;
 private master: GainNode | null = null;
 private dry: GainNode | null = null;
 private wet: GainNode | null = null;
 private noise: AudioBuffer | null = null;
 private timer: ReturnType<typeof setInterval> | null = null;
 private stage = 0;
 private theme: Theme = GLOWMOSS;
 private bar = 0; private nextBar = 0;
 private mood: QuestMood = 'calm'; private pending: QuestMood = 'calm';
 /** 0..1 — fear for danger (low health), boss phase / 2 for battle. */
 private intensity = 0;
 private paused = false;
 private level = .85;

 start(stage: number) {
  this.stop(0);
  const ctx = gameAudio.context; if (!ctx) return;
  gameAudio.stopMusic();
  this.build(ctx, stage);
  this.nextBar = ctx.currentTime + .15;
  this.applyLevel(2.5);
  this.timer = setInterval(() => this.tick(), 50);
  this.tick();
 }
 /** Bounce a mood to an OfflineAudioContext (preview WAVs, tests). Does not touch the live score. */
 static async renderOffline(stage: number, seconds: number, mood: QuestMood = 'calm', intensity = 0, rate = 44100): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  const sc = new LullabyScore();
  sc.build(off as unknown as AudioContext, stage);
  sc.mood = sc.pending = mood; sc.intensity = intensity;
  sc.master!.gain.value = sc.level;
  sc.nextBar = .05;
  while (sc.nextBar < seconds - 1) { sc.scheduleBar(sc.nextBar); sc.nextBar += sc.barDur(); sc.bar++; }
  return off.startRendering();
 }
 private build(ctx: AudioContext, stage: number) {
  this.ctx = ctx; this.stage = Math.max(0, Math.min(2, stage)); this.theme = THEMES[this.stage]; this.bar = 0; this.mood = this.pending = 'calm'; this.intensity = 0; this.paused = false;
  this.master = ctx.createGain(); this.master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 2.5; comp.attack.value = .05; comp.release.value = .4;
  this.master.connect(comp); comp.connect(ctx.destination);
  this.dry = ctx.createGain(); this.dry.gain.value = .62; this.dry.connect(this.master);
  const verb = ctx.createConvolver(); verb.buffer = this.hall(ctx, 4.2);
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200;
  this.wet = ctx.createGain(); this.wet.gain.value = .58; this.wet.connect(verb); verb.connect(tone); tone.connect(this.master);
  this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
 }
 /** Request a mood; it takes over at the next bar line so transitions stay musical. */
 setMood(mood: QuestMood, intensity = 0) { this.pending = mood; this.intensity = Math.max(0, Math.min(1, intensity)); }
 get currentMood() { return this.mood; }
 setPaused(p: boolean) { this.paused = p; this.applyLevel(.6); }
 /** Final music-box cadence for a stage clear, then the loop fades away. */
 cadence() {
  const ctx = this.ctx; if (!ctx || !this.dry) return;
  if (this.timer) { clearInterval(this.timer); this.timer = null; }
  const t = Math.max(ctx.currentTime + .05, Math.min(this.nextBar, ctx.currentTime + .6));
  const root = this.theme === GLOWMOSS ? N.F4 : N.D4;
  const triad = this.theme === KEEP && this.mood !== 'battle' ? [0, 3, 7, 12, 15, 19, 24] : [0, 4, 7, 12, 16, 19, 24];
  triad.forEach((iv, i) => this.harp(mtof(root + iv), t + i * .09, .16));
  this.pad(triad.slice(0, 4).map(iv => root - 12 + iv), t, 4.5, .07);
  [24, 28, 31].forEach((iv, i) => this.bell(mtof(root + iv), t + .7 + i * .02, .09));
  setTimeout(() => this.stop(2.5), 3800);
 }
 stop(fade = .8) {
  if (this.timer) { clearInterval(this.timer); this.timer = null; }
  const ctx = this.ctx, m = this.master;
  if (!ctx || !m) return;
  m.gain.cancelScheduledValues(ctx.currentTime); m.gain.setValueAtTime(m.gain.value, ctx.currentTime); m.gain.linearRampToValueAtTime(0, ctx.currentTime + Math.max(.01, fade));
  setTimeout(() => { try { m.disconnect(); } catch { /* gone */ } }, fade * 1000 + 200);
  this.master = null; this.dry = null; this.wet = null;
 }

 private applyLevel(ramp: number) {
  const ctx = this.ctx, m = this.master; if (!ctx || !m) return;
  const target = gameAudio.isMuted ? 0 : this.level * (this.paused ? .35 : 1);
  m.gain.cancelScheduledValues(ctx.currentTime); m.gain.setValueAtTime(m.gain.value, ctx.currentTime); m.gain.linearRampToValueAtTime(target, ctx.currentTime + ramp);
 }
 private lastMuted = false;
 private tick() {
  const ctx = this.ctx; if (!ctx || !this.master) return;
  if (gameAudio.isMuted !== this.lastMuted) { this.lastMuted = gameAudio.isMuted; this.applyLevel(.3); }
  // short look-ahead so mood changes land on the next bar line (the game pauses itself when hidden)
  while (this.nextBar < ctx.currentTime + .45) { this.scheduleBar(this.nextBar); this.nextBar += this.barDur(); this.bar++; }
 }
 private bpm() {
  switch (this.mood) {
   case 'energy': return ENERGY_BPM[this.stage];
   case 'danger': return 54 + this.intensity * 16;
   case 'battle': return 150 + this.intensity * 20;
   default: return this.theme.bpm;
  }
 }
 private barDur() { return this.theme.beats * 60 / this.bpm(); }

 private scheduleBar(t: number) {
  if (this.pending !== this.mood) {
   this.mood = this.pending; this.bar = 0;
   // transition gesture: an air swell into energy/battle, a low cello drop into danger
   if (this.mood === 'energy' || this.mood === 'battle') this.swell(t, .5, .05);
   if (this.mood === 'danger') this.cello(mtof(STAGE_TONIC[this.stage] - 24), t, 3, .1);
  }
  if (this.mood === 'energy') return this.barEnergy(t);
  if (this.mood === 'danger') return this.barDanger(t);
  if (this.mood === 'battle') return this.barBattle(t);
  return this.barCalm(t);
 }

 /* calm — the lullaby */
 private barCalm(t: number) {
  const th = this.theme, i = this.bar % 16, cycle = Math.floor(this.bar / 16) % 2;
  const beat = this.barDur() / th.beats, chord = th.chords[i], dur = this.barDur();
  this.pad(chord, t, dur * 1.05, .055);
  this.cello(mtof(chord[0] - 12), t, dur * .95, .085);
  if (th.choir) this.choir(chord.slice(1).map(n => n + 12), t, dur, .03);
  const arp = [...chord, chord[1] + 12, chord[2] + 12];
  const order = [0, 1, 2, 3, 4, 5].map(k => arp[[0, 2, 1, 3, 4, 2][k] % arp.length]);
  for (let k = 0; k < th.beats * 2; k++) this.harp(mtof(order[k % order.length] + th.harpOct), t + k * beat / 2 + (k % 2 ? beat * .04 : 0), k === 0 ? .11 : .07);
  let at = t;
  for (const [m, b] of th.melody[i]) {
   const d = b * beat;
   if (m !== null) {
    if (cycle === 0) { if (th.lead === 'box') this.musicBox(mtof(m), at, .085); else this.bell(mtof(m), at, .08); }
    else { this.flute(mtof(m - 12), at, d * .95, .075); if (b >= 2) this.bell(mtof(m + 12), at + d * .5, .025); }
   }
   at += d;
  }
  if (cycle === 1 && i % 4 === 0) this.bell(mtof(chord[3] + 24), t + beat * 2.5, .03);
 }

 /* energy — the same stage theme as a galloping adventure */
 private barEnergy(t: number) {
  const th = this.theme, i = this.bar % 16, cycle = Math.floor(this.bar / 16) % 2;
  const beat = this.barDur() / th.beats, chord = th.chords[i], dur = this.barDur(), e = beat / 2;
  this.pad(chord, t, dur, .04);
  // spiccato string ostinato on eighths: root · fifth · octave · fifth · third · fifth
  const pat = [chord[0], chord[2], chord[0] + 12, chord[2], chord[1], chord[2]];
  for (let k = 0; k < 6; k++) this.spiccato(mtof(pat[k]), t + k * e, k % 2 ? .05 : .075);
  for (let k = 0; k < 3; k++) this.cello(mtof(chord[0] - 12), t + k * beat, beat * .4, k ? .06 : .1);
  // frame drum + shaker groove: DUM · ta-ka · ta
  this.drum(t, .2); this.drum(t + beat * 1.5, .09); this.drum(t + beat * 2, .12);
  for (let k = 0; k < 6; k++) this.shaker(t + k * e, k % 2 ? .02 : .035);
  if (i % 2 === 0) this.brass(chord.map(n => n + 12), t, beat * .7, .05);
  if (i % 4 === 3) for (let k = 0; k < 6; k++) this.harp(mtof(chord[k % 4] + 12 + (k >= 4 ? 12 : 0)), t + 2 * beat + k * beat / 6, .06);
  // the melody: horn lead first pass, flute + celesta sparkle on the answer
  let at = t;
  for (const [m, b] of th.melody[i]) {
   const d = b * beat;
   if (m !== null) {
    if (cycle === 0) this.horn(mtof(m - 12), at, d * .9, .07);
    else { this.flute(mtof(m), at, d * .9, .07); this.bell(mtof(m + 12), at, .035); }
   }
   at += d;
  }
  if (i === 15) this.swell(t + beat, beat * 2, .04);
 }

 /* danger / fear — tremolo strings, heartbeat, glassy celesta sighs */
 private barDanger(t: number) {
  const i = this.bar % 8, pass = Math.floor(this.bar / 8) % 2, fear = this.intensity;
  const tonic = STAGE_TONIC[this.stage];
  const beat = this.barDur() / 3, dur = this.barDur();
  const chord = DANGER_CHORDS[i].map(o => tonic + o);
  this.tremolo(chord.map(n => n - 12), t, dur, .05 + fear * .03, 9 + fear * 5);
  this.choir(chord.slice(1).map(n => n + 12), t, dur, .022 + fear * .015);
  this.heart(t, .16 + fear * .12); if (fear > .4 || pass === 1) this.heart(t + beat * 1.5, .1 + fear * .1);
  this.glass(mtof(chord[3] + 24), t, dur, .018 + fear * .01);
  let at = t;
  for (const [m, b] of DANGER_MELODY[i]) { const d = b * beat; if (m !== null) { this.bell(mtof(tonic + 24 + m), at, .06); if (pass === 1) this.flute(mtof(tonic + 12 + m), at, d * .9, .035); } at += d; }
  if (i % 4 === 2) this.creak(t + beat, beat * 2, .05 + fear * .04);
  if (i === 7) this.cello(mtof(tonic - 24), t, dur * 1.4, .1);
 }

 /* battle — the Hollow Warden's war-waltz */
 private barBattle(t: number) {
  const i = this.bar % 16, ph = this.intensity * 2, beat = this.barDur() / 3, e = beat / 2, dur = this.barDur();
  const chord = BATTLE.chords[i];
  this.pad(chord.map(n => n + 12), t, dur, .05);
  this.choir(chord.slice(1).map(n => n + 24), t, dur, .03 + ph * .01);
  this.timp(mtof(chord[0]), t, .26 + ph * .04); this.timp(mtof(chord[0]), t + beat * 2.5, .14 + ph * .04);
  if (ph >= 1) this.timp(mtof(chord[0] + 7), t + beat * 1.5, .1);
  const pat = [chord[0], chord[0] + 12, chord[2], chord[0] + 12, chord[3], chord[2]];
  for (let k = 0; k < 6; k++) this.spiccato(mtof(pat[k] + 12), t + k * e, k % 2 ? .055 : .08);
  this.cello(mtof(chord[0]), t, beat * .6, .11);
  this.drum(t, .22); for (let k = 0; k < 6; k++) this.shaker(t + k * e, .03);
  this.brass(chord.slice(1).map(n => n + 12), t, beat * .8, .06 + ph * .015);
  let at = t;
  for (const [m, b] of BATTLE.melody[i]) { const d = b * beat; if (m !== null) { this.horn(mtof(m - 12), at, d * .92, .08 + ph * .01); if (ph >= 1) this.bell(mtof(m + 12), at, .04); if (ph >= 2) this.flute(mtof(m), at, d * .9, .05); } at += d; }
  if (ph >= 2) this.tremolo(chord.slice(1).map(n => n + 24), t, dur, .025, 14);
  if (i % 8 === 7) this.swell(t, dur, .06);
 }

 /* ----------------------- energetic + dark voices ------------------- */
 private spiccato(f: number, t: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!, g = this.env(t, .008, vol, .03, .12);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 + f; lp.Q.value = .7;
  this.osc('sawtooth', f, t, t + .25, -6).connect(lp); this.osc('sawtooth', f, t, t + .25, 6).connect(lp);
  lp.connect(g); this.out(g, Math.sin(f * .7) * .4, .5);
 }
 private brass(notes: number[], t: number, dur: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!;
  for (const n of notes) {
   const f = mtof(n), end = t + dur + .5, g = this.env(t, .03, vol / notes.length * 2, dur * .4, .35);
   const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
   lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(2600, t + .06); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
   this.osc('sawtooth', f, t, end, -5).connect(lp); this.osc('sawtooth', f, t, end, 5).connect(lp);
   lp.connect(g); this.out(g, (n % 5) / 5 - .4, .7);
  }
 }
 private horn(f: number, t: number, dur: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!, end = t + dur + .4;
  const g = this.env(t, .07, vol, Math.max(0, dur - .15), .3);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .8;
  lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1500 + f, t + .12);
  const o = this.osc('sawtooth', f, t, end), s = this.osc('triangle', f, t, end);
  const lfo = this.osc('sine', 5.4, t, end), ld = ctx.createGain(); ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(6, t + Math.min(.5, dur)); lfo.connect(ld); ld.connect(o.detune);
  o.connect(lp); s.connect(lp); lp.connect(g); this.out(g, .25, .9);
 }
 private drum(t: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!;
  const o = this.osc('sine', 120, t, t + .5); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(55, t + .12);
  const g = this.env(t, .003, vol, 0, .32); o.connect(g); this.out(g, 0, .35);
  if (this.noise) { const n = ctx.createBufferSource(); n.buffer = this.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = .8; const ng = this.env(t, .002, vol * .35, 0, .08); n.connect(bp); bp.connect(ng); this.out(ng, 0, .3); n.start(t, Math.random() * .5); n.stop(t + .15); }
 }
 private shaker(t: number, vol: number) {
  if (!this.dry || !this.noise) return;
  const ctx = this.ctx!, n = ctx.createBufferSource(); n.buffer = this.noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
  const g = this.env(t, .006, vol, 0, .05); n.connect(hp); hp.connect(g); this.out(g, .35, .25); n.start(t, Math.random() * .5); n.stop(t + .1);
 }
 private swell(t: number, dur: number, vol: number) {
  if (!this.dry || !this.noise) return;
  const ctx = this.ctx!, n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(1500, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * .95); g.gain.linearRampToValueAtTime(0, t + dur + .05);
  n.connect(bp); bp.connect(g); this.out(g, 0, 1); n.start(t); n.stop(t + dur + .1);
 }
 private tremolo(notes: number[], t: number, dur: number, vol: number, rate: number) {
  if (!this.dry) return;
  const ctx = this.ctx!;
  notes.forEach((n, k) => {
   const f = mtof(n), end = t + dur + 1;
   const g = this.env(t, .25, vol / notes.length * 2, Math.max(0, dur - .3), .7);
   const trem = ctx.createGain(); trem.gain.value = .55;
   const lfo = this.osc('sine', rate + k * .3, t, end), ld = ctx.createGain(); ld.gain.value = .45; lfo.connect(ld); ld.connect(trem.gain);
   const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + f * .5;
   this.osc('sawtooth', f, t, end, -7).connect(lp); this.osc('sawtooth', f, t, end, 7).connect(lp);
   lp.connect(trem); trem.connect(g); this.out(g, (k / Math.max(1, notes.length - 1) - .5) * .8, 1);
  });
 }
 private heart(t: number, vol: number) {
  if (!this.dry) return;
  for (const [dt, k] of [[0, 1], [.16, .7]] as const) {
   const o = this.osc('sine', 60, t + dt, t + dt + .35); o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + .12);
   const g = this.env(t + dt, .004, vol * k, 0, .22); o.connect(g); this.out(g, 0, .15);
  }
 }
 private glass(f: number, t: number, dur: number, vol: number) {
  if (!this.dry) return;
  const g = this.env(t, dur * .4, vol, dur * .3, dur * .6);
  this.osc('sine', f, t, t + dur * 1.4).connect(g); this.osc('sine', f * 1.006, t, t + dur * 1.4).connect(g); this.out(g, -.4, 1.2);
 }
 private creak(t: number, dur: number, vol: number) {
  if (!this.dry || !this.noise) return;
  const ctx = this.ctx!, n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.setValueAtTime(180, t); bp.frequency.linearRampToValueAtTime(320, t + dur * .6); bp.frequency.linearRampToValueAtTime(140, t + dur);
  const g = this.env(t, dur * .4, vol, dur * .2, dur * .4); n.connect(bp); bp.connect(g); this.out(g, .5, 1.3); n.start(t); n.stop(t + dur + .2);
 }

 /* ----------------------------- voices ------------------------------ */
 private out(v: AudioNode, pan: number, wet = 1) {
  const ctx = this.ctx!; const p = ctx.createStereoPanner(); p.pan.value = pan;
  v.connect(p); p.connect(this.dry!);
  if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.wet!); }
 }
 private env(t: number, a: number, peak: number, hold: number, r: number) {
  const g = this.ctx!.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(.0005, t + a + hold + r);
  return g;
 }
 private osc(type: OscillatorType, f: number, t: number, end: number, detune = 0) {
  const o = this.ctx!.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(t); o.stop(end); return o;
 }
 private pad(notes: number[], t: number, dur: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!;
  notes.forEach((n, i) => {
   const f = mtof(n), end = t + dur + 1.8;
   const g = this.env(t, Math.min(1.1, dur * .45), vol / notes.length * 2.2, Math.max(0, dur - 1.1), 1.6);
   const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(700 + f * .6, t); lp.frequency.linearRampToValueAtTime(1100 + f, t + dur * .6); lp.Q.value = .4;
   for (const det of [-8, 7]) this.osc('sawtooth', f, t, end, det).connect(lp);
   this.osc('triangle', f * 2, t, end).connect(lp);
   lp.connect(g); this.out(g, (i / Math.max(1, notes.length - 1) - .5) * .7, 1.1);
  });
 }
 private harp(f: number, t: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!, g = this.env(t, .004, vol, 0, 2.4);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(900, t + .5);
  this.osc('triangle', f, t, t + 2.6).connect(lp);
  const h = ctx.createGain(); h.gain.value = .25; this.osc('sine', f * 2, t, t + 1.2).connect(h); h.connect(lp);
  lp.connect(g); this.out(g, Math.sin(f) * .45, .9);
 }
 private musicBox(f: number, t: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!;
  const g = this.env(t, .003, vol, 0, 2.2); this.osc('sine', f, t, t + 2.4).connect(g); this.out(g, .15, .8);
  const g2 = this.env(t, .002, vol * .35, 0, .5); this.osc('sine', f * 3.01, t, t + .6).connect(g2); this.out(g2, .2, .6);
  const g3 = this.env(t, .002, vol * .12, 0, .18); this.osc('sine', f * 6.2, t, t + .25).connect(g3); this.out(g3, .25, .4);
  void ctx;
 }
 private bell(f: number, t: number, vol: number) {
  if (!this.dry) return;
  const g = this.env(t, .004, vol, 0, 3); this.osc('sine', f, t, t + 3.2).connect(g); this.out(g, -.15, 1);
  const g2 = this.env(t, .003, vol * .3, 0, 1.2); this.osc('sine', f * 2.76, t, t + 1.4).connect(g2); this.out(g2, -.2, 1);
  const g3 = this.env(t, .002, vol * .1, 0, .4); this.osc('sine', f * 5.4, t, t + .5).connect(g3); this.out(g3, -.25, .8);
 }
 private flute(f: number, t: number, dur: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!, end = t + dur + .5;
  const g = this.env(t, .12, vol, Math.max(0, dur - .3), .35);
  const o = this.osc('sine', f, t, end), o2 = this.osc('triangle', f * 2, t, end);
  const lfo = this.osc('sine', 5.1, t, end); const ld = ctx.createGain(); ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(9, t + Math.min(.6, dur)); lfo.connect(ld); ld.connect(o.detune); ld.connect(o2.detune);
  const h = ctx.createGain(); h.gain.value = .07; o2.connect(h); h.connect(g); o.connect(g);
  if (this.noise) { const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3; const ng = ctx.createGain(); ng.gain.value = .25; n.connect(bp); bp.connect(ng); ng.connect(g); n.start(t); n.stop(end); }
  this.out(g, -.3, 1);
 }
 private cello(f: number, t: number, dur: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!, end = t + dur + 1;
  const g = this.env(t, .18, vol, Math.max(0, dur - .3), .7);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = .6;
  this.osc('sawtooth', f, t, end, -4).connect(lp); this.osc('sawtooth', f, t, end, 5).connect(lp);
  const s = ctx.createGain(); s.gain.value = .6; this.osc('sine', f, t, end).connect(s); s.connect(g);
  lp.connect(g); this.out(g, -.1, .7);
 }
 private choir(notes: number[], t: number, dur: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!;
  for (const n of notes) {
   const f = mtof(n), end = t + dur + 2;
   const g = this.env(t, Math.min(1.4, dur * .5), vol, Math.max(0, dur - 1.2), 1.8);
   const src = ctx.createGain();
   this.osc('sawtooth', f, t, end, -6).connect(src); this.osc('sawtooth', f, t, end, 6).connect(src);
   for (const [ff, q, a] of [[420, 5, 1], [1050, 7, .5], [2600, 8, .18]] as const) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q; const ag = ctx.createGain(); ag.gain.value = a; src.connect(bp); bp.connect(ag); ag.connect(g); }
   this.out(g, Math.cos(f) * .5, 1.3);
  }
 }
 private timp(f: number, t: number, vol: number) {
  if (!this.dry) return;
  const ctx = this.ctx!;
  const o = this.osc('sine', f * 1.6, t, t + 1.6); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + .09);
  const g = this.env(t, .006, vol, 0, 1.3); o.connect(g); this.out(g, 0, .8);
  if (this.noise) { const n = ctx.createBufferSource(); n.buffer = this.noise; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; const ng = this.env(t, .003, vol * .6, 0, .25); n.connect(lp); lp.connect(ng); this.out(ng, 0, .5); n.start(t); n.stop(t + .4); }
 }
 /** Stereo hall impulse: decaying noise with a soft early swell and darker tail. */
 private hall(ctx: AudioContext, sec: number) {
  const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
   const d = buf.getChannelData(c); let lp = 0;
   for (let i = 0; i < len; i++) { const x = i / len; lp += (Math.random() * 2 - 1 - lp) * (.55 - x * .4); d[i] = lp * Math.pow(1 - x, 2.2) * Math.min(1, i / (ctx.sampleRate * .02)); }
  }
  return buf;
 }
}

export const questScore = new LullabyScore();
/** Exposed for tests: the themes are original 16-bar pieces in 3/4. */
export const QUEST_THEMES = THEMES;
export const QUEST_DANGER = {chords: DANGER_CHORDS, melody: DANGER_MELODY};
export const QUEST_BATTLE = BATTLE;
export const renderQuestScore = LullabyScore.renderOffline;
