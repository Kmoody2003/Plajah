// kaijuEnergyDirector — the stage director shared by the 2D and 3D Kaiju disco.
//
// Watches the music's energy and decides what is on stage: when it is quiet the scene dims and a follow-spot
// picks out the dancers; when it's up the disco ball comes down with moving heads, lasers and speaker stacks;
// drops pop confetti. Props glide in and out (no popping) and every state change has hysteresis so the room
// never flickers. Pure TypeScript — no three.js, no DOM — so the 2D stage doesn't pull in the 3D engine.

import type { KaijuStyle, VocalMode } from '../kaijuAudio';

export interface DirectorInput {
  dt: number; t: number;
  beats: number; beat: boolean; kick: number; onset: number;
  level: number; bass: number; treble: number; intensity: number; bpm: number;
  silent: boolean; style: KaijuStyle; vocalMode: VocalMode;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (u: number) => u * u * (3 - 2 * u);
const approach = (v: number, target: number, up: number, down: number, dt: number) => {
  const rate = target > v ? up : down; const d = target - v;
  return Math.abs(d) < 1e-4 ? target : v + Math.sign(d) * Math.min(Math.abs(d), rate * dt);
};

// ====================================================================== props / energy
export type PropId = 'ball' | 'heads' | 'lasers' | 'speakers' | 'truss' | 'strobe';
export type Tier = 'silent' | 'quiet' | 'groove' | 'peak';

export interface StageState {
  tier: Tier;
  /** 0..1 smoothed energy (fast / slow). */
  eFast: number; eSlow: number;
  /** 0..1 how deployed each prop is (ball: 0 = up in the rafters, 1 = hanging at show height). */
  prop: Record<PropId, number>;
  /** 0..1 scene dimming (ambient + floor + wall down) and the follow-spot strength. */
  dim: number; spot: number;
  /** One-frame events. */
  drop: boolean; confetti: number; flash: number;
  /** Which special (random, time-limited) prop is currently running, if any. */
  special: PropId | null;
  /** 0..1 floor brightness multiplier. */
  floor: number;
}

export class StageDirector {
  readonly s: StageState = {
    tier: 'silent', eFast: 0, eSlow: 0, drop: false, confetti: 0, flash: 0, special: null, dim: 0.8, spot: 0, floor: 0.35,
    prop: { ball: 0, heads: 0, lasers: 0, speakers: 0, truss: 0, strobe: 0 },
  };
  /** Pin the tier (inspection / a manual "lights" control). null = follow the music. */
  force: Tier | null = null;
  private tierSince = 0; private peakSince = -1; private quietSince = -1; private lastDrop = -99;
  private specialUntil = 0; private nextSpecial = 24; private specialCount = 0; private clock = 0;
  private strobe = 0;

  update(i: DirectorInput): StageState {
    const s = this.s, dt = Math.min(0.1, i.dt); this.clock += dt;
    s.drop = false; s.confetti = 0;
    const raw = i.silent ? 0 : clamp(0.5 * i.level + 0.5 * clamp((i.intensity - 0.6) / 1.0, 0, 1.2));
    s.eFast += (raw - s.eFast) * (1 - Math.exp(-dt / 0.5));
    s.eSlow += (raw - s.eSlow) * (1 - Math.exp(-dt / (i.silent ? 1.5 : 6)));

    // ---- tier with hysteresis (held for a couple of seconds before it changes)
    const prev = s.tier;
    if (i.silent && this.clock > 0.5) s.tier = 'silent';
    else {
      const wantPeak = s.eSlow > (prev === 'peak' ? 0.46 : 0.58);
      const wantQuiet = s.eSlow < (prev === 'quiet' ? 0.38 : 0.27);
      if (wantPeak) { if (this.peakSince < 0) this.peakSince = this.clock; } else this.peakSince = -1;
      if (wantQuiet) { if (this.quietSince < 0) this.quietSince = this.clock; } else this.quietSince = -1;
      if (prev === 'silent') s.tier = 'groove';
      if (s.tier !== 'peak' && this.peakSince >= 0 && this.clock - this.peakSince > 2) s.tier = 'peak';
      else if (s.tier !== 'quiet' && this.quietSince >= 0 && this.clock - this.quietSince > 2.5) s.tier = 'quiet';
      else if (s.tier === 'peak' && !wantPeak) s.tier = 'groove';
      else if (s.tier === 'quiet' && !wantQuiet) s.tier = 'groove';
    }
    if (this.force) s.tier = this.force;
    if (s.tier !== prev) this.tierSince = this.clock;
    const inTier = this.clock - this.tierSince;

    // ---- drops: fast energy leaping over the long-term level
    if (!i.silent && s.eFast - s.eSlow > 0.2 && this.clock - this.lastDrop > 12 && s.tier !== 'quiet') {
      this.lastDrop = this.clock; s.drop = true; s.confetti = s.tier === 'peak' ? 220 : 120; s.flash = 1;
    }

    // ---- specials: every so often one extra prop makes an appearance for a few bars
    let special = s.special;
    if (special && i.beats > this.specialUntil) { special = null; this.nextSpecial = i.beats + 24 + hash(this.specialCount * 3.1) * 40; }
    if (!special && s.tier === 'groove' && i.beats > this.nextSpecial) {
      const pick = (['ball', 'lasers', 'speakers'] as PropId[])[Math.floor(hash(this.specialCount * 7.7 + 1) * 3)];
      special = pick; this.specialUntil = i.beats + 24 + Math.floor(hash(this.specialCount * 1.9) * 3) * 8; this.specialCount++;
    }
    if (s.tier !== 'groove') special = null;               // a special only runs inside a groove — quiet/peak take over the rig
    s.special = special;

    // ---- targets by tier
    const peak = s.tier === 'peak', quiet = s.tier === 'quiet' || s.tier === 'silent', groove = s.tier === 'groove';
    const rocky = i.style === 'rock', edmy = i.style === 'edm';
    const tgt: Record<PropId, number> = {
      ball: peak || special === 'ball' ? 1 : 0,
      heads: peak || groove ? 1 : 0,
      lasers: (peak && (edmy || rocky || s.eSlow > 0.7)) || special === 'lasers' ? 1 : 0,
      speakers: (peak && inTier > 10) || special === 'speakers' ? 1 : 0,
      truss: peak || groove ? 1 : 0,
      strobe: 0,
    };
    for (const k of ['ball', 'heads', 'lasers', 'speakers', 'truss'] as PropId[]) {
      const slow = k === 'ball' ? 0.22 : k === 'speakers' ? 0.3 : 0.5;     // the ball takes ~4.5 s to lower
      s.prop[k] = approach(s.prop[k], tgt[k], slow, slow * 1.4, dt);
    }
    // strobe: only on hard hits at the very top
    this.strobe = Math.max(this.strobe - dt * 7, 0);
    if (peak && (rocky || edmy) && i.kick > 0.95 && s.eFast > 0.75) this.strobe = 1;
    s.prop.strobe = this.strobe;
    s.flash = Math.max(0, s.flash - dt * 2.6);

    // dim + follow-spot: quiet → the room drops away and a spot finds the dancers
    s.dim = approach(s.dim, i.silent ? 0.78 : quiet ? 0.72 : groove ? 0.08 : 0, 0.5, 0.35, dt);
    s.spot = approach(s.spot, quiet ? 1 : 0, 0.55, 0.5, dt);
    s.floor = approach(s.floor, quiet ? 0.4 : peak ? 1 : 0.8, 0.5, 0.5, dt);
    return s;
  }
}

