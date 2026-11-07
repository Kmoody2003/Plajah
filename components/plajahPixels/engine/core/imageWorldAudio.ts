// imageWorldAudio — the image worlds' ears, built the way the platform's other visualizers hear.
//
// Like the RIG_* stages (stageAudio.ts) and the GEN_GLSL generators (audioTexture.ts), the signal is
// SPLIT before anything reacts to it: kick 40–130 Hz, snare crack ~1.8–5 kHz, hats 7–16 kHz, the bass
// body for wobble, the vocal estimate and the harmonic colour. StageAudio (the lighting desk's ears)
// turns the drum bands into onsets, a flywheel beat clock, drops and energy. On top of that:
//
//   wobble     signed bass modulation (the LFO on a dubstep bass, a sidechain pump) and its depth
//   build      rising energy + snare density, or the song map's build section
//   breakdown  the kick gone for a couple of bars while the energy sits below its long average
//   pump       a tempo-locked envelope (1 on every beat, decaying) that holds time even when onsets miss
//   song       with a song map (Music Intelligence), the section, its progress, the energy curve now
//              and ahead, and seconds to the next drop — so builds wind toward a drop that's coming
//
// It runs on FluxAudio (16 log-spaced spectrum regions), so it works everywhere Flux runs: the DJ
// console, Pixels, Fabula export and the labs. Frame-rate independent; seeks reset it.
import type { FluxAudio } from '../../../../services/fabula/fluxNode';
import { songCueAt, type SongMap } from '../../../../services/fabula/songMap';
import { StageAudio } from './stageAudio';
import type { SectionKind } from './imageWorldDirection';

export interface SongInput { map: SongMap; t: number }
/** FluxAudio plus an optional song map + playback time (attached by hosts that know the track). */
export type WorldAudioIn = FluxAudio & { song?: SongInput | null };

export interface WorldCues {
  t: number; dt: number;
  bass: number; mid: number; tre: number; level: number; voice: number; hue: number;
  kick: number; snare: number; hat: number;
  kickHit: boolean; snareHit: boolean;
  beat: number; beatLen: number; beatHit: boolean; barHit: boolean; pump: number;
  energy: number;        // live, 0..1.2
  curve: number;         // the energy curve the camera follows (song map when known), 0..1
  curveAhead: number;
  drop: number; dropHit: boolean;
  build: number; breakdown: number;
  wob: number; wobDepth: number;
  section: SectionKind; sectionProgress: number; toDrop: number; songKnown: boolean;
}

const avg = (s: readonly number[] | undefined, a: number, b: number, fb: number) => {
  if (!s || s.length < 16) return fb; let t = 0; for (let i = a; i <= b; i++) t += s[i] ?? 0; return t / (b - a + 1);
};

export class WorldEars {
  private stage = new StageAudio();
  private last = -1;
  private prevBeat = 0; private prevKick = 0; private prevSnare = 0; private prevDrop = 0;
  private bassFast = 0; private bassSlow = 0; private wobDepth = 0;
  private eFast = 0; private eSlow = 0; private eLong = 0.1; private curve = 0;
  private snareRate = 0; private kickGone = 0; private build = 0; private brk = 0;
  private lastSongT = -1;
  readonly c: WorldCues = {
    t: 0, dt: 1 / 60, bass: 0, mid: 0, tre: 0, level: 0, voice: 0, hue: 0, kick: 0, snare: 0, hat: 0, kickHit: false, snareHit: false,
    beat: 0, beatLen: 0.5, beatHit: false, barHit: false, pump: 0, energy: 0, curve: 0, curveAhead: 0, drop: 0, dropHit: false,
    build: 0, breakdown: 0, wob: 0, wobDepth: 0, section: 'verse', sectionProgress: 0, toDrop: Infinity, songKnown: false,
  };

  update(t: number, a: WorldAudioIn): WorldCues {
    const c = this.c;
    const jump = this.last < 0 || t < this.last || t - this.last > 1;
    if (jump && this.last >= 0) { this.stage = new StageAudio(); this.build = this.brk = 0; }
    const dt = jump ? 1 / 60 : Math.max(1e-4, t - this.last); this.last = t;
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    const s = a.spectrum;

    // ── the split ──
    // wobble lives where a filter-swept bass sweeps (~150–650 Hz), above the kick's thump
    const kickBand = avg(s, 1, 3, a.bass), bassBody = avg(s, 4, 7, a.bass * 0.8 + a.mid * 0.2);
    const snareBand = avg(s, 11, 12, a.treble * 0.8 + a.mid * 0.2), hatBand = avg(s, 14, 15, a.treble);
    const st = this.stage.update({ drums: [kickBand, snareBand, hatBand], level: a.level, bass: a.bass, mid: a.mid, treble: a.treble } as any, t);
    c.kick = st.stage[0]; c.snare = st.stage[1]; c.hat = st.stage2[1];
    c.kickHit = c.kick > 0.999 && this.prevKick < 0.999; c.snareHit = c.snare > 0.999 && this.prevSnare < 0.999;
    this.prevKick = c.kick; this.prevSnare = c.snare;
    c.bass = a.bass; c.mid = a.mid; c.tre = a.treble; c.level = a.level; c.voice = a.voice ?? 0; c.hue = a.harmonicHue ?? 0;

    // ── wobble: the bass body against its own quarter-second average ──
    this.bassFast += (bassBody - this.bassFast) * k(0.018);
    this.bassSlow += (bassBody - this.bassSlow) * k(0.3);
    const w = (this.bassFast - this.bassSlow) / Math.max(0.12, this.bassSlow);
    const present = Math.min(1, Math.max(0, (this.bassSlow - 0.12) * 4));   // a sustained bass, not a passing hit
    c.wob = Math.max(-1, Math.min(1, w * 1.6)) * present;
    // depth: modulation that keeps going (decays slowly), minus what the kick alone would explain
    const kickShare = c.kickHit ? 0.6 : 0;
    // shallow modulation (detuned pads beating, vibrato) sits under the dead zone; a filter-swept bass swings far past it
    const swing = Math.max(0, Math.abs(c.wob) - 0.35 - kickShare);
    this.wobDepth += (swing - this.wobDepth) * k(swing > this.wobDepth ? 0.12 : 0.9);
    c.wobDepth = Math.min(1, this.wobDepth * 1.8);

    // ── energy ──
    c.energy = st.stage[3];
    this.eFast += (c.energy - this.eFast) * k(0.4); this.eSlow += (c.energy - this.eSlow) * k(4); this.eLong += (c.energy - this.eLong) * k(14);

    // ── song map (Music Intelligence) when the host knows the track ──
    const song = a.song;
    c.songKnown = !!song?.map;
    let dropHit = false;
    if (song?.map) {
      const q = songCueAt(song.map, song.t);
      if (this.lastSongT >= 0 && song.t > this.lastSongT && song.t - this.lastSongT < 0.5) dropHit = song.map.drops.some(d => d > this.lastSongT && d <= song.t);
      this.lastSongT = song.t;
      c.section = q.kind; c.sectionProgress = q.progress; c.toDrop = q.toDrop;
      c.beat = q.beat; c.beatLen = q.beatLen;
      // the camera follows the measured curve, nudged by what's actually playing
      const target = Math.min(1, q.energy * 0.75 + Math.min(1, c.energy) * 0.25);
      this.curve += (target - this.curve) * k(0.6);
      c.curveAhead = q.energyAhead;
      this.build += ((q.kind === 'build' ? 0.35 + 0.65 * q.progress : 0) - this.build) * k(0.25);
      this.brk += ((q.kind === 'breakdown' ? 1 : 0) - this.brk) * k(0.8);
    } else {
      this.lastSongT = -1;
      c.beat = st.stage[2]; c.beatLen = st.stage2[3];
      this.curve += (Math.min(1, this.eFast * 0.6 + this.eSlow * 0.4) - this.curve) * k(1.2);
      c.curveAhead = this.curve;
      // live build: energy climbing over seconds with the snare getting busier
      this.snareRate += ((c.snareHit ? 1 / dt : 0) - this.snareRate) * k(2.5);
      const climbing = Math.max(0, this.eFast - this.eSlow) * 3 + Math.max(0, this.snareRate / (2 / c.beatLen) - 0.6);
      this.build += (Math.min(1, climbing) - this.build) * k(climbing > this.build ? 0.8 : 0.35);
      // live breakdown: no kick for two bars and the level under its long average
      this.kickGone = c.kickHit ? 0 : this.kickGone + dt;
      const gone = this.kickGone > c.beatLen * 8 && this.eFast < this.eLong * 0.8 && this.eLong > 0.12;   // silence isn't a breakdown
      this.brk += ((gone ? 1 : 0) - this.brk) * k(gone ? 1.2 : 0.3);
      c.section = this.brk > 0.5 ? 'breakdown' : this.build > 0.45 ? 'build' : this.eFast > Math.max(0.55, this.eLong * 1.15) ? 'drop' : this.eLong < 0.15 && t < 20 ? 'intro' : 'verse';
      c.sectionProgress = 0; c.toDrop = Infinity;
    }
    c.curve = this.curve; c.build = this.build; c.breakdown = this.brk;

    // ── drop: the song map's drop time, or the desk's own detector ──
    const liveDrop = st.stage2[2] > 0.999 && this.prevDrop < 0.999; this.prevDrop = st.stage2[2];
    c.dropHit = dropHit || (!song?.map && liveDrop);
    c.drop = c.dropHit ? 1 : c.drop * Math.exp(-dt / 2.2);
    if (c.dropHit) this.build = 0;

    // ── tempo-locked pulse ──
    const bi = Math.floor(c.beat);
    c.beatHit = bi !== Math.floor(this.prevBeat) && c.beat > this.prevBeat;
    c.barHit = c.beatHit && ((bi % 4) + 4) % 4 === 0;
    this.prevBeat = c.beat;
    const ph = c.beat - Math.floor(c.beat);
    c.pump = Math.pow(1 - ph, 3);
    c.t = t; c.dt = dt;
    return c;
  }
}
