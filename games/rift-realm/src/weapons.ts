// Rift Realm weapons: the three vessel guns as one editable data table (handling, reload timing, recoil, spread,
// ADS, switch, FX and sounds), their models (first-person viewmodel + third-person mesh on the rig's hand_r_weapon
// socket, each with a muzzle socket), the first-person weapon rig (sway, bob, recoil spring, ADS, mag-out / mag-in
// reload, lower / raise switch, dry-fire click) and the per-weapon tracers.
//
// Art: no gun is drawn in the Void Sanctum pack, so each gun is built from its vessel's prop sheet
// (void-sanctum/outfit-props): Halo Lance = Aegis's stone-and-gold lance with cyan soul gems and a spiked gold halo;
// Rift Scatter = Nyx's black chitin, magenta fin membranes, claws and hex visor glow; Chord Repeater = Lumen's white
// enamel and gold filigree, golden wing-blades, halo ring and prism. Fantasy first; the glow inlays are the Tron accent.
//
// Spirit energy (Kenne 2026-11-23: the vessel weapons are magical, not mechanical — no magazines, no reload): each
// vessel holds charge that every shot spends and that only trickles back by itself; firing builds heat, too much heat
// overheats the weapon into a forced cool-down (the vent motion); R vents early for a little charge. The forest
// refills it (discharging fungi, picked charge mushrooms, creature gifts) through WeaponEnergy.addCharge().
//
// Model space: grip (palm centre) at the origin, barrel along +Z, +Y up — the hand_r_weapon socket contract in
// characters.ts (+Z along the fingers = barrel forward, +Y toward the thumb). `tpOffset` corrects a socket that
// disagrees, without touching the model.
import * as THREE from 'three/webgpu';
import { abs, color, float, mix, mx_fractal_noise_float, mx_noise_float, positionLocal, smoothstep, uniform, vec3 } from 'three/tsl';
import type { Recipe } from '../../../services/vfx';
import { RECIPES } from '../../../services/vfx';
import type { VesselId } from './vessels';

// ── Data table (Game Studio edits these; patchWeapon merges a partial over one) ─────────────────────────────────────

/** Reload beats as fractions of the reload, read off the mocap videos the body's reload clips come from (the
 *  sound events in D:/plajah-tmp/rift-sfx/clips/catalog.json): rifle reload 5db86210 0.9–6.6 s → release 1.84 s,
 *  mag out 2.42 s, mag in 4.46 s, charge 5.05 s; pistol reload 95edb996 0.9–6.4 s → 1.95, 2.64, 4.83, 5.63 s. */
export interface ReloadPhases { release: number; out: number; in: number; charge: number }
export const RIFLE_PHASES: ReloadPhases = { release: 0.165, out: 0.27, in: 0.62, charge: 0.73 };
export const PISTOL_PHASES: ReloadPhases = { release: 0.19, out: 0.32, in: 0.71, charge: 0.86 };

/** Spirit energy and heat of one vessel weapon (WeaponEnergy runs it). Charge is in points; heat is 0…1. */
export interface EnergySpec {
  /** Charge the vessel holds, and what one trigger pull spends (the Chord Repeater's burst is one pull). */
  capacity: number;
  costPerShot: number;
  /** Heat one trigger pull adds (1 = overheated). */
  heatPerShot: number;
  /** Heat shed per second once `coolDelay` seconds have passed without firing. */
  coolPerSec: number;
  coolDelay: number;
  /** Forced cool-down after an overheat (the vent motion plays over it). */
  overheatSec: number;
  /** Charge that comes back by itself, per second (slow: the world is where you refill). */
  regenPerSec: number;
  /** R / reload binding: vent the heat early, for this much charge, over `ventSec`. */
  ventCost: number;
  ventSec: number;
  /** On the beat: cost and heat multipliers for PERFECT and GOOD shots (OFF pays full). */
  beat: { perfect: { cost: number; heat: number }; good: { cost: number; heat: number } };
}

export interface WeaponSpec {
  id: VesselId;
  name: string;
  /** Spirit energy, heat, vent and recharge tuning (replaces magazines). */
  energy: EnergySpec;
  /** Shots a full charge gives (HUD / legacy callers): derived from `energy`. */
  magSize: number;
  /** Seconds of the vent (attune) motion; set from energy.ventSec. */
  reloadSec: number;
  /** Body clip the vent / overheat motion plays (CharacterRig name) and its beats. */
  reloadClip: 'reload' | 'reload_pistol';
  phases: ReloadPhases;
  /** Seconds to lower the old gun and raise this one. */
  switchSec: number;
  recoil: {
    /** Aim kick up per shot, radians. */
    pitch: number;
    /** Sideways kick per shot in order (radians, + = right); cycles; resets after `resetSec` without firing. */
    yaw: number[];
    resetSec: number;
    /** Share of the kick that comes back down by itself (0…1) and how fast (1/s). */
    recover: number;
    recoverRate: number;
    /** First-person gun kick: back (m) and muzzle climb (rad) per shot. */
    kickBack: number;
    kickRot: number;
  };
  spread: {
    /** Extra cone (radians) at full bloom, hip fire. */
    hip: number;
    /** Bloom added per shot (0…1). */
    bloomPerShot: number;
    /** Spread multiplier fully aimed (0…1). */
    adsMul: number;
  };
  /** Field of view multiplier fully aimed (zoom). */
  adsFov: number;
  /** Seconds to go fully into ADS. */
  adsSec: number;
  /** Look-speed multiplier fully aimed. */
  adsSens: number;
  fx: { muzzle: string; impact: string; impactPerfect: string; tracer: TracerSpec };
  /** magOut / magIn / charge are the vent's beats (hiss, attune chime, power-up); overheat warns, recharge plays
   *  when the world gives charge, dry when a pull finds no charge. */
  sounds: { magOut: string; magIn: string; charge: string; dry: string; switch: string; impact: string; overheat: string; recharge: string };
  /** Socket correction for the third-person mesh (Euler radians XYZ + metres). */
  tpOffset: { rot: [number, number, number]; pos: [number, number, number] };
  /** First-person hip position in camera space (m). */
  fpHip: [number, number, number];
}

export interface TracerSpec {
  /** beam: the whole line at once; streak: a short dash flying out (pellets); bolt: a long bolt flying out. */
  style: 'beam' | 'streak' | 'bolt';
  core: number;
  glow: number;
  life: number;
  /** Flying styles: m/s and dash length (m). */
  speed?: number;
  length?: number;
  /** Faint full-length line under a flying bolt (opacity). */
  trace?: number;
}

/** hand_r_weapon socket → gun frame on the Forge-built Void Stalker. The socket's +Z points across the palm (toward
 *  the thumb side) in the rifle hold rather than down the barrel as the characters.ts contract says, so this turn
 *  (measured in-game from the aim_idle hold: barrel down the aim, +Y up) lines the gun up. Re-measure if the rig changes. */
export const HAND_R_ROT: [number, number, number] = [2.193, -0.4, 1.929];

export const WEAPONS: Record<VesselId, WeaponSpec> = {
  aegis: {
    id: 'aegis', name: 'Halo Lance',
    energy: { capacity: 100, costPerShot: 6, heatPerShot: 0.17, coolPerSec: 0.55, coolDelay: 0.35, overheatSec: 1.6, regenPerSec: 0.9, ventCost: 6, ventSec: 0.9, beat: { perfect: { cost: 0.5, heat: 0.3 }, good: { cost: 0.8, heat: 0.75 } } },
    magSize: 16, reloadSec: 0.9, reloadClip: 'reload', phases: RIFLE_PHASES, switchSec: 0.5,
    recoil: { pitch: 0.022, yaw: [0.002, -0.003, 0.004, -0.002, 0.003], resetSec: 0.45, recover: 0.7, recoverRate: 9, kickBack: 0.075, kickRot: 0.09 },
    spread: { hip: 0.012, bloomPerShot: 0.22, adsMul: 0.2 },
    adsFov: 0.66, adsSec: 0.16, adsSens: 0.7,
    fx: { muzzle: 'muzzle_lance', impact: 'impact_lance', impactPerfect: 'hit_perfect', tracer: { style: 'beam', core: 0.032, glow: 0.12, life: 0.24 } },
    sounds: { magOut: 'vent_hiss', magIn: 'vent_chime', charge: 'charge_r', dry: 'dry', switch: 'switch', impact: 'imp_lance', overheat: 'overheat', recharge: 'recharge' },
    tpOffset: { rot: HAND_R_ROT, pos: [0, 0, 0] },
    fpHip: [0.15, -0.235, -0.5],
  },
  stalker: {
    id: 'stalker', name: 'Rift Scatter',
    energy: { capacity: 90, costPerShot: 11, heatPerShot: 0.3, coolPerSec: 0.7, coolDelay: 0.3, overheatSec: 1.4, regenPerSec: 0.8, ventCost: 5, ventSec: 0.8, beat: { perfect: { cost: 0.5, heat: 0.3 }, good: { cost: 0.8, heat: 0.75 } } },
    magSize: 8, reloadSec: 0.8, reloadClip: 'reload_pistol', phases: PISTOL_PHASES, switchSec: 0.42,
    recoil: { pitch: 0.04, yaw: [0.006, -0.008, 0.005], resetSec: 0.6, recover: 0.55, recoverRate: 7, kickBack: 0.11, kickRot: 0.16 },
    spread: { hip: 0.016, bloomPerShot: 0.4, adsMul: 0.55 },
    adsFov: 0.88, adsSec: 0.13, adsSens: 0.85,
    fx: { muzzle: 'muzzle_scatter', impact: 'impact_scatter', impactPerfect: 'hit_perfect', tracer: { style: 'streak', core: 0.012, glow: 0.04, life: 0.12, speed: 210, length: 2.2 } },
    sounds: { magOut: 'vent_hiss', magIn: 'vent_chime', charge: 'charge_p', dry: 'dry', switch: 'switch', impact: 'imp_scatter', overheat: 'overheat', recharge: 'recharge' },
    tpOffset: { rot: HAND_R_ROT, pos: [0, 0, 0] },
    fpHip: [0.16, -0.22, -0.44],
  },
  seraph: {
    id: 'seraph', name: 'Chord Repeater',
    energy: { capacity: 120, costPerShot: 5, heatPerShot: 0.1, coolPerSec: 0.6, coolDelay: 0.3, overheatSec: 1.5, regenPerSec: 1.1, ventCost: 6, ventSec: 0.9, beat: { perfect: { cost: 0.5, heat: 0.3 }, good: { cost: 0.8, heat: 0.75 } } },
    magSize: 24, reloadSec: 0.9, reloadClip: 'reload', phases: RIFLE_PHASES, switchSec: 0.46,
    recoil: { pitch: 0.011, yaw: [0.003, 0.004, -0.002, -0.004, 0.002, 0.003], resetSec: 0.35, recover: 0.8, recoverRate: 12, kickBack: 0.035, kickRot: 0.045 },
    spread: { hip: 0.01, bloomPerShot: 0.13, adsMul: 0.3 },
    adsFov: 0.76, adsSec: 0.15, adsSens: 0.75,
    fx: { muzzle: 'muzzle_chord', impact: 'impact_chord', impactPerfect: 'hit_perfect', tracer: { style: 'bolt', core: 0.016, glow: 0.06, life: 0.16, speed: 150, length: 3.2, trace: 0.12 } },
    sounds: { magOut: 'vent_hiss', magIn: 'vent_chime', charge: 'charge_r', dry: 'dry', switch: 'switch', impact: 'imp_chord', overheat: 'overheat', recharge: 'recharge' },
    tpOffset: { rot: HAND_R_ROT, pos: [0, 0, 0] },
    fpHip: [0.15, -0.225, -0.48],
  },
};

/** Merge a partial spec over a weapon (Game Studio / a level's project). */
export function patchWeapon(id: VesselId, patch: Partial<WeaponSpec>) {
  const w = WEAPONS[id] as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    w[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(w[k] as object), ...v } : v;
  }
}

// ── Spirit energy runtime ─────────────────────────────────────────────────────────────────────────────────────────

/** Where charge came from (the forage / creature systems pass their own names too). */
export type ChargeSource = 'regen' | 'fungus' | 'mushroom' | 'creature' | 'pickup' | 'vent' | (string & {});
export interface ChargeState { charge: number; max: number; frac: number; heat: number; overheated: boolean; venting: boolean; shotsLeft: number }
/** Result of a trigger pull: fired, no charge (dry), or the weapon is cooling (overheated / venting). */
export type SpendResult = 'ok' | 'dry' | 'hot';

/**
 * Charge and heat for every vessel (each keeps its own while holstered; holstered ones cool and regen too).
 * The player owns one (`player.weapons`); the world refills it with addCharge(). Events: onDry (a vessel ran out),
 * onOverheat, onCharge (charge added from outside), onVentDone.
 */
export class WeaponEnergy {
  /** The drawn vessel (the player sets it). */
  current: VesselId = 'aegis';
  private s = new Map<VesselId, { charge: number; heat: number; cool: number; vent: number; since: number }>();
  onDry?: (id: VesselId) => void;
  onOverheat?: (id: VesselId) => void;
  onCharge?: (id: VesselId, added: number, source: ChargeSource) => void;
  onVentDone?: (id: VesselId) => void;

  private st(id: VesselId) {
    let v = this.s.get(id);
    if (!v) { v = { charge: WEAPONS[id].energy.capacity, heat: 0, cool: 0, vent: 0, since: 9 }; this.s.set(id, v); }
    return v;
  }

  /** Charge state of a vessel (the drawn one by default). */
  getCharge(id: VesselId = this.current): ChargeState {
    const v = this.st(id), e = WEAPONS[id].energy;
    return { charge: v.charge, max: e.capacity, frac: v.charge / e.capacity, heat: v.heat, overheated: v.cool > 0, venting: v.vent > 0, shotsLeft: Math.floor(v.charge / e.costPerShot) };
  }

  /** Give charge (fungus discharge, an eaten mushroom, a creature's gift…). Returns what was actually added. */
  addCharge(amount: number, source: ChargeSource = 'pickup', id: VesselId = this.current): number {
    const v = this.st(id), cap = WEAPONS[id].energy.capacity;
    const add = Math.max(0, Math.min(cap - v.charge, amount));
    v.charge += add;
    if (add > 0 && source !== 'regen') this.onCharge?.(id, add, source);
    return add;
  }

  /** Can the drawn vessel fire right now (without spending)? */
  canFire(id: VesselId = this.current): SpendResult {
    const v = this.st(id), e = WEAPONS[id].energy;
    if (v.cool > 0 || v.vent > 0) return 'hot';
    return v.charge + 1e-6 >= e.costPerShot ? 'ok' : 'dry';
  }

  /** A trigger pull: spend charge and add heat (cheaper and cooler on the beat). Overheating starts the cool-down. */
  spend(quality: 'PERFECT' | 'GOOD' | 'OFF' = 'OFF', id: VesselId = this.current): SpendResult {
    const r = this.canFire(id);
    if (r !== 'ok') return r;
    const v = this.st(id), e = WEAPONS[id].energy;
    const m = quality === 'PERFECT' ? e.beat.perfect : quality === 'GOOD' ? e.beat.good : { cost: 1, heat: 1 };
    v.charge = Math.max(0, v.charge - e.costPerShot * m.cost);
    v.heat = Math.min(1, v.heat + e.heatPerShot * m.heat);
    v.since = 0;
    if (v.heat >= 1) { v.cool = e.overheatSec; this.onOverheat?.(id); }
    if (v.charge + 1e-6 < e.costPerShot) this.onDry?.(id);
    return 'ok';
  }

  /** Vent early (R): dump the heat over ventSec for a little charge. False if there's nothing to vent or it's busy. */
  vent(id: VesselId = this.current): boolean {
    const v = this.st(id), e = WEAPONS[id].energy;
    if (v.cool > 0 || v.vent > 0 || v.heat < 0.05) return false;
    v.charge = Math.max(0, v.charge - e.ventCost);
    v.vent = e.ventSec;
    return true;
  }

  /** After being downed: cool, and at least half charged. */
  reset() { for (const id of ['aegis', 'stalker', 'seraph'] as VesselId[]) { const v = this.st(id); v.heat = 0; v.cool = 0; v.vent = 0; v.charge = Math.max(v.charge, WEAPONS[id].energy.capacity * 0.5); } }

  update(dt: number) {
    for (const id of ['aegis', 'stalker', 'seraph'] as VesselId[]) {
      const v = this.st(id), e = WEAPONS[id].energy;
      v.since += dt;
      if (v.cool > 0) {                         // overheated: the heat bleeds off over the forced cool-down
        v.heat = Math.max(0, v.heat - dt / e.overheatSec);
        v.cool -= dt;
        if (v.cool <= 0) { v.cool = 0; v.heat = 0; this.onVentDone?.(id); }
      } else if (v.vent > 0) {                  // venting: the heat drains over the vent
        v.heat = Math.max(0, v.heat - dt / Math.max(0.05, e.ventSec) * 1.2);
        v.vent -= dt;
        if (v.vent <= 0) { v.vent = 0; v.heat = 0; this.onVentDone?.(id); }
      } else if (v.since > e.coolDelay) v.heat = Math.max(0, v.heat - e.coolPerSec * dt);
      if (v.since > 1) this.addCharge(e.regenPerSec * dt, 'regen', id);
    }
  }
}

/** Steam and motes off the weapon while it vents or cools after an overheat. */
export const VENT_STEAM: Recipe = {
  id: 'vent_steam', sound: 'vent_hiss',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [3, 5], life: [0.5, 0.9], speed: [0.6, 1.6], spread: 0.7, size: [0.06, 0.34], color: [0xdff6ff, 0x9ab4c4], alpha: [0.45, 0], drag: 2.5, lift: [0.4, 0.9], spin: [0.3, 1] },
    { layer: 'add', shape: 'soft', count: [4, 7], life: [0.3, 0.6], speed: [0.5, 1.8], spread: 1.2, size: [0.025, 0.006], color: ['tint+white', 'tint'], intensity: 2, drag: 2, turbulence: 3, lift: [0.3, 0.8] },
  ],
};
/** Spirit energy flowing in (a fungus pulse, a mushroom, a gift): motes rising round the body. */
export const CHARGE_IN: Recipe = {
  id: 'charge_in', sound: 'recharge',
  emitters: [
    { layer: 'add', shape: 'soft', count: [10, 16], life: [0.5, 0.9], speed: [0.2, 0.8], spread: Math.PI, radius: 0.6, size: [0.04, 0.01], color: [0xe0fbff, 'tint'], intensity: 2.4, drag: 1, turbulence: 2, lift: [0.8, 1.6] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.35, speed: 0, size: [0.2, 1.3], color: ['tint+white', 'tint'], intensity: 0.8, alpha: [0.7, 0] },
  ],
};

// ── Per-weapon effect recipes (services/vfx building blocks; registered in RECIPES so the Studio lists them) ───────

/** Halo Lance: a cyan star flash, a spiked halo ring opening at the tip, a tight forward spray. */
export const MUZZLE_LANCE: Recipe = {
  id: 'muzzle_lance',
  light: { color: 0x67e8f9, intensity: 5, range: 4, life: 0.07 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.06, speed: 0, size: [0.22, 0.34], color: [0xffffff, 'tint'], intensity: 3.5, alpha: [1, 0] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.12, speed: 0, size: [0.05, 0.32], color: ['tint+white', 0xf5c76a], intensity: 1.6, alpha: [0.9, 0] },
    { layer: 'add', shape: 'spark', count: [5, 8], life: [0.06, 0.12], speed: [8, 15], spread: 0.18, size: [0.02, 0.006], color: [0xffffff, 'tint'], intensity: 2.5, drag: 5, stretch: 0.025 },
  ],
};
/** Rift Scatter: a wide magenta bloom, a cone of sparks and a puff of violet smoke out of the claws. */
export const MUZZLE_SCATTER: Recipe = {
  id: 'muzzle_scatter',
  light: { color: 0xe879f9, intensity: 7, range: 4.5, life: 0.08 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.07, speed: 0, size: [0.3, 0.46], color: ['tint+white', 'tint'], intensity: 3, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [12, 18], life: [0.07, 0.16], speed: [6, 14], spread: 0.5, size: [0.024, 0.008], color: [0xffe4fb, 'tint'], intensity: 2.4, drag: 4, stretch: 0.022 },
    { layer: 'alpha', shape: 'smoke', count: [2, 3], life: [0.35, 0.7], speed: [0.6, 1.6], spread: 0.6, size: [0.08, 0.32], color: [0x3b2148, 0x1a1020], alpha: [0.4, 0], drag: 3, lift: [0.1, 0.3], spin: [0.3, 1] },
  ],
};
/** Chord Repeater: a small gold halo pulse and violet "note" motes drifting off the three barrels. */
export const MUZZLE_CHORD: Recipe = {
  id: 'muzzle_chord',
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.045, speed: 0, size: [0.14, 0.2], color: [0xffffff, 'tint'], intensity: 3, alpha: [1, 0] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.09, speed: 0, size: [0.04, 0.18], color: [0xfde68a, 'tint'], intensity: 1.4, alpha: [0.9, 0] },
    { layer: 'add', shape: 'soft', count: [3, 5], life: [0.2, 0.4], speed: [0.4, 1.4], spread: 1.2, size: [0.025, 0.006], color: [0xe9d5ff, 0xa855f7], intensity: 2.2, drag: 2, turbulence: 2, lift: [0.2, 0.5] },
  ],
};
/** Lance impact: a cyan flash, a ring, light shards and a gold-white spark shell. */
export const IMPACT_LANCE: Recipe = {
  id: 'impact_lance', sound: 'imp_lance',
  light: { color: 'tint', intensity: 7, range: 4.5, life: 0.14 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.1, speed: 0, size: [0.5, 0.95], color: [0xffffff, 'tint'], intensity: 2.4, alpha: [1, 0] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.2, speed: 0, size: [0.15, 1.1], color: ['tint+white', 'tint'], intensity: 1, alpha: [0.85, 0] },
    { layer: 'add', shape: 'spark', count: [14, 20], life: [0.2, 0.45], speed: [5, 12], spread: 1.0, size: [0.035, 0.01], color: [0xfff4d6, 'tint'], intensity: [2, 3], gravity: 8, drag: 2.4, stretch: 0.03, bounce: 0.35 },
    { layer: 'shard', count: [4, 7], life: [0.4, 0.7], speed: [2, 5], spread: 1.1, size: [0.06, 0.02], color: ['tint+white', 'tint'], intensity: 1.4, alpha: [1, 0], gravity: 9, drag: 1, spin: [5, 12], bounce: 0.3 },
  ],
};
/** Scatter impact (per pellet): a small magenta pop, a few sparks, a dark wisp. */
export const IMPACT_SCATTER: Recipe = {
  id: 'impact_scatter', sound: 'imp_scatter',
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.07, speed: 0, size: [0.22, 0.4], color: ['tint+white', 'tint'], intensity: 2.2, alpha: [1, 0] },
    { layer: 'add', shape: 'spark', count: [5, 8], life: [0.12, 0.3], speed: [3, 8], spread: 1.1, size: [0.025, 0.008], color: [0xffd6fb, 'tint'], intensity: 2, gravity: 9, drag: 2.5, stretch: 0.025, bounce: 0.3 },
    { layer: 'alpha', shape: 'smoke', count: 1, life: [0.4, 0.8], speed: [0.3, 0.8], spread: 0.8, size: [0.1, 0.4], color: [0x2a1830, 0x140c18], alpha: [0.35, 0], drag: 2.5, lift: [0.1, 0.3], spin: [0.3, 0.8] },
  ],
};
/** Chord impact: a gold ring that rings out, violet motes floating up (a struck chord). */
export const IMPACT_CHORD: Recipe = {
  id: 'impact_chord', sound: 'imp_chord',
  light: { color: 0xfbbf24, intensity: 4, range: 3.5, life: 0.1 },
  emitters: [
    { layer: 'add', shape: 'soft', count: 1, life: 0.08, speed: 0, size: [0.3, 0.55], color: [0xffffff, 'tint'], intensity: 2.4, alpha: [1, 0] },
    { layer: 'add', shape: 'ring', count: 1, life: 0.26, speed: 0, size: [0.1, 0.8], color: [0xfde68a, 'tint'], intensity: 1.1, alpha: [0.9, 0] },
    { layer: 'add', shape: 'spark', count: [6, 10], life: [0.15, 0.3], speed: [3, 7], spread: 1.0, size: [0.02, 0.006], color: [0xfff4d6, 'tint'], intensity: 2.2, drag: 3, stretch: 0.02 },
    { layer: 'add', shape: 'soft', count: [5, 8], life: [0.4, 0.8], speed: [0.3, 1], spread: Math.PI, size: [0.03, 0.008], color: [0xe9d5ff, 0xa855f7], intensity: 2.2, drag: 1.5, turbulence: 3, lift: [0.5, 1.1] },
  ],
};
export const WEAPON_RECIPES: Record<string, Recipe> = Object.fromEntries(
  [MUZZLE_LANCE, MUZZLE_SCATTER, MUZZLE_CHORD, IMPACT_LANCE, IMPACT_SCATTER, IMPACT_CHORD, VENT_STEAM, CHARGE_IN].map((r) => [r.id, r]),
);
Object.assign(RECIPES, WEAPON_RECIPES);
/** A recipe by id (the weapon recipes, then the shared ones). */
export const recipe = (id: string): Recipe => WEAPON_RECIPES[id] ?? RECIPES[id];

// ── Materials ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The glow drive uniform (a float node with a settable `.value`). */
const makeGlow = () => uniform(1);
type Glow = ReturnType<typeof makeGlow>;

/** Noise-broken surface: two colours mixed by fractal noise in model space; roughness follows. */
function surface(a: number, b: number, scale: number, rough: [number, number], metal: number, physical = false, cracks = 0) {
  const m = physical ? new THREE.MeshPhysicalNodeMaterial({ metalness: metal, clearcoat: 0.6, clearcoatRoughness: 0.25 }) : new THREE.MeshStandardNodeMaterial({ metalness: metal });
  const n = mx_fractal_noise_float(positionLocal.mul(scale), 3, 2, 0.5).mul(0.5).add(0.5).clamp();
  // hairline cracks where a second noise field crosses zero (weathered stone)
  const crack = cracks > 0 ? mix(float(1 - cracks), float(1), smoothstep(0.0, 0.025, abs(mx_noise_float(positionLocal.mul(scale * 0.55))))) : float(1);
  m.colorNode = mix(color(a), color(b), n).mul(crack);
  m.roughnessNode = mix(float(rough[0]), float(rough[1]), n);
  return m;
}
/** Emissive inlay that brightens with the weapon's glow uniform (beat pulse + muzzle flash). */
function glowMat(hex: number, glow: Glow, base = 1.4, opacity = 1) {
  const m = new THREE.MeshStandardNodeMaterial({ color: hex, roughness: 0.2, metalness: 0, transparent: opacity < 1, opacity });
  const c = new THREE.Color(hex);
  // heat (0…1) runs the inlays from the vessel's colour to a white-hot ember and brightens them
  const h = (glow as unknown as { heat: Glow }).heat ?? float(0);
  m.emissiveNode = mix(vec3(c.r, c.g, c.b), vec3(1.0, 0.38, 0.12), h).mul(glow.mul(base)).mul(h.mul(0.8).add(1));
  return m;
}

interface Mats {
  stone: THREE.Material; gold: THREE.Material; goldDark: THREE.Material; leather: THREE.Material; moss: THREE.Material;
  chitin: THREE.Material; enamel: THREE.Material; iron: THREE.Material;
}
let shared: Mats | null = null;
function mats(): Mats {
  return shared ??= {
    stone: surface(0x34332e, 0x6e695c, 26, [0.75, 0.95], 0, false, 0.7),
    gold: surface(0xb08232, 0xf2c867, 40, [0.24, 0.42], 0.85),
    goldDark: surface(0x5e4419, 0xa8822f, 30, [0.35, 0.55], 1),
    leather: surface(0x24170e, 0x4a3020, 60, [0.7, 0.9], 0),
    moss: surface(0x2f4a1c, 0x6d8a32, 70, [0.85, 1], 0),
    chitin: surface(0x030204, 0x160a1c, 18, [0.2, 0.36], 0.1, true),
    enamel: surface(0xb9b1a2, 0xddd6c8, 22, [0.24, 0.34], 0, true),
    iron: surface(0x1c1d22, 0x3a3b42, 34, [0.35, 0.55], 0.9),
  };
}

// ── Geometry helpers ────────────────────────────────────────────────────────────────────────────────────────────

/** A side profile [z, y][] (smoothed corners) extruded `width` across X, centred, with a bevel. */
function side(pts: [number, number][], width: number, bevel = 0.006, smooth = true): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  if (smooth) {
    // rounded polygon: each corner becomes a short quadratic curve
    const n = pts.length, r = 0.35;
    const mid = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const start = mid(pts[n - 1], pts[0], 1 - r);
    shape.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], nx = pts[(i + 1) % n];
      const a = mid(pts[(i - 1 + n) % n], p, 1 - r * 0.5 > 0.5 ? 1 - r : 0.5), b = mid(p, nx, r);
      shape.lineTo(a[0], a[1]);
      shape.quadraticCurveTo(p[0], p[1], b[0], b[1]);
    }
    shape.closePath();
  } else {
    shape.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) shape.lineTo(p[0], p[1]);
    shape.closePath();
  }
  const d = Math.max(0.001, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  g.rotateY(-Math.PI / 2); // shape x → +Z, extrude → X
  g.computeVertexNormals();
  return g;
}
/** Cylinder along +Z from z0 to z1. */
function rod(r0: number, r1: number, z0: number, z1: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}
/** Torus around the Z axis at z. */
function ring(R: number, r: number, z: number, seg = 32): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(R, r, 8, seg);
  g.translate(0, 0, z);
  return g;
}
/** A tapered tube along a curve (claws, veins, filigree). */
function tube(points: THREE.Vector3[], r0: number, r1: number, segs = 16, radial = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position, nor = g.attributes.normal;
  // TubeGeometry has radius 1: pull each ring in toward its centre line, tapering r0 → r1
  const p = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      nn.fromBufferAttribute(nor, k);
      p.copy(c).addScaledVector(nn, r);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
  return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

// ── Models ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface WeaponModel {
  root: THREE.Group;
  /** Barrel tip (shots and the muzzle flash start here). */
  muzzle: THREE.Object3D;
  /** The magazine (moves out / in on a reload); `magHome` is its seated transform. */
  mag: THREE.Object3D;
  magHome: THREE.Vector3;
  /** Point the eye looks along when aiming down sights (model space). */
  sight: THREE.Vector3;
  /** Where the support hand holds (model space), and the charging handle. */
  support: THREE.Vector3;
  charge: THREE.Vector3;
  /** Glow drive: 1 at rest, the beat pulse and each shot lift it. */
  glow: Glow;
  /** Heat 0…1: the inlays run toward ember orange as the weapon heats up. */
  heat: Glow;
  /** For the Chord Repeater: the three barrel tips (shots cycle through them). */
  tips?: THREE.Object3D[];
}

function finish(root: THREE.Group, fp: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = !fp; m.receiveShadow = !fp;
    if (fp) { m.frustumCulled = false; m.renderOrder = 2; }
  });
}

/** Halo Lance — Aegis: mossy stone stock and receiver in gold frames, cyan soul gems along an octagonal shroud, a
 *  spiked gold halo ring and a four-edged spear tip; a cyan crystal cell for a magazine. ~1.3 m. */
function buildLance(glow: Glow): Omit<WeaponModel, 'heat'> {
  const M = mats(), cyan = glowMat(0x22d3ee, glow, 1.6), cyanCell = glowMat(0x67e8f9, glow, 1.1, 0.88);
  const root = new THREE.Group();
  // receiver (stone) framed in gold
  root.add(mesh(side([[-0.11, 0.045], [0.22, 0.045], [0.24, 0.085], [0.22, 0.13], [-0.06, 0.135], [-0.11, 0.11]], 0.068, 0.006), M.stone));
  root.add(mesh(side([[-0.115, 0.125], [0.225, 0.122], [0.225, 0.138], [-0.115, 0.142]], 0.074, 0.003, false), M.gold));
  root.add(mesh(side([[-0.115, 0.04], [0.225, 0.04], [0.225, 0.053], [-0.115, 0.053]], 0.074, 0.003, false), M.gold));
  for (const z of [-0.07, 0.03, 0.17]) root.add(mesh(new THREE.BoxGeometry(0.076, 0.095, 0.012), M.gold, 0, 0.09, z));
  // soul gems on both flanks in gold bezels
  for (const sx of [-1, 1]) {
    const gem = mesh(new THREE.OctahedronGeometry(0.019, 0), cyan, sx * 0.04, 0.09, 0.1);
    gem.scale.set(0.55, 1, 1);
    root.add(gem);
    const bez = mesh(new THREE.TorusGeometry(0.021, 0.004, 6, 16), M.gold, sx * 0.037, 0.09, 0.1);
    bez.rotation.y = Math.PI / 2;
    root.add(bez);
  }
  // stock: tapering stone, gold butt plate, moss in the cracks
  root.add(mesh(side([[-0.1, 0.125], [-0.42, 0.105], [-0.45, 0.06], [-0.43, -0.03], [-0.36, -0.035], [-0.2, 0.02], [-0.1, 0.05]], 0.054, 0.007), M.stone));
  root.add(mesh(side([[-0.44, 0.11], [-0.465, 0.105], [-0.455, -0.04], [-0.43, -0.035]], 0.06, 0.003, false), M.gold));
  for (const [x, y, z, s] of [[0.026, 0.09, -0.3, 1], [-0.026, 0.03, -0.38, 0.8], [0.024, 0.05, -0.22, 0.6]] as const) {
    const ms = mesh(new THREE.IcosahedronGeometry(0.014 * s, 1), M.moss, x, y, z);
    ms.scale.set(0.5, 1, 1.6);
    root.add(ms);
  }
  // grip, leather wrap, gold pommel band; trigger guard
  root.add(mesh(side([[0.03, 0.05], [0.055, 0.05], [0.03, -0.085], [-0.02, -0.09], [-0.015, 0.05]], 0.036, 0.005), M.leather));
  root.add(mesh(new THREE.BoxGeometry(0.04, 0.012, 0.05), M.gold, 0, -0.083, 0.005));
  const guard = mesh(new THREE.TorusGeometry(0.032, 0.004, 6, 16, Math.PI), M.gold, 0, 0.045, 0.07);
  guard.rotation.set(Math.PI, Math.PI / 2, 0);
  root.add(guard);
  // shroud: octagonal stone-bronze shaft with gem studs, gold barrel through it
  root.add(mesh(rod(0.038, 0.032, 0.22, 0.62, 8), M.stone, 0, 0.09, 0));
  root.add(mesh(rod(0.03, 0.03, 0.2, 0.64, 8), M.goldDark, 0, 0.09, 0));
  root.add(mesh(rod(0.016, 0.016, 0.6, 0.76, 12), M.gold, 0, 0.09, 0));
  for (let i = 0; i < 5; i++) {
    const z = 0.27 + i * 0.075;
    for (const sx of [-1, 1]) {
      const st = mesh(new THREE.BoxGeometry(0.008, 0.02, 0.03), cyan, sx * 0.036, 0.09, z);
      root.add(st);
    }
    root.add(mesh(ring(0.039, 0.005, z + 0.037, 8), M.gold, 0, 0.09, 0));
  }
  // the halo: spiked gold ring with a cyan inner light, spokes to the barrel
  const halo = new THREE.Group();
  halo.position.set(0, 0.09, 0.66);
  halo.scale.setScalar(1.35);
  halo.add(mesh(ring(0.062, 0.007, 0), M.gold));
  halo.add(mesh(ring(0.053, 0.0035, 0), cyan));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = mesh(new THREE.ConeGeometry(0.008, i % 2 ? 0.022 : 0.036, 4), M.gold, Math.cos(a) * 0.074, Math.sin(a) * 0.074, 0);
    sp.rotation.z = a - Math.PI / 2;
    halo.add(sp);
    if (i % 2 === 0) { const spoke = mesh(new THREE.BoxGeometry(0.004, 0.04, 0.006), M.gold, Math.cos(a) * 0.036, Math.sin(a) * 0.036, 0); spoke.rotation.z = a - Math.PI / 2; halo.add(spoke); }
  }
  root.add(halo);
  // spear tip: four-edged gold blade over a cyan core
  const tip = mesh(new THREE.ConeGeometry(0.042, 0.2, 4), M.gold, 0, 0.09, 0.86);
  tip.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  tip.scale.set(1, 1, 0.55);
  root.add(tip);
  const core = mesh(new THREE.ConeGeometry(0.016, 0.15, 6), cyan, 0, 0.09, 0.85);
  core.rotation.x = Math.PI / 2;
  root.add(core);
  root.add(mesh(rod(0.024, 0.02, 0.75, 0.775, 8), M.gold, 0, 0.09, 0));
  // sight: a small gold ring on a stone post
  root.add(mesh(new THREE.BoxGeometry(0.01, 0.022, 0.03), M.gold, 0, 0.15, 0.0));
  const sightRing = mesh(new THREE.TorusGeometry(0.011, 0.0025, 6, 16), M.gold, 0, 0.172, 0.0);
  root.add(sightRing);
  root.add(mesh(new THREE.OctahedronGeometry(0.005, 0), cyan, 0, 0.145, 0.6));
  // magazine: hexagonal cyan crystal cell in a gold cage
  const mag = new THREE.Group();
  mag.add(mesh(rod(0.02, 0.02, -0.04, 0.04, 6).rotateX(Math.PI / 2), cyanCell, 0, -0.035, 0));
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i / 4) * Math.PI * 2; mag.add(mesh(new THREE.BoxGeometry(0.004, 0.09, 0.004), M.gold, Math.cos(a) * 0.022, -0.035, Math.sin(a) * 0.022)); }
  mag.add(mesh(new THREE.BoxGeometry(0.05, 0.01, 0.05), M.gold, 0, -0.082, 0));
  mag.add(mesh(new THREE.BoxGeometry(0.046, 0.008, 0.046), M.gold, 0, 0.005, 0));
  const magHome = V(0, 0.045, 0.11);
  mag.position.copy(magHome);
  root.add(mag);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.09, 0.96); root.add(muzzle);
  return { root, muzzle, mag, magHome, sight: V(0, 0.172, 0.0), support: V(0, 0.06, 0.38), charge: V(0.04, 0.11, -0.02), glow };
}

/** Rift Scatter — Nyx: a hunched black chitin carapace, magenta fin membranes on black ribs down the spine, a hex
 *  visor window, twin bores inside three hooked claws; a void-shell canister for a magazine. ~0.85 m. */
function buildScatter(glow: Glow): Omit<WeaponModel, 'heat'> {
  const M = mats(), mag = glowMat(0xd946ef, glow, 1.7), memb = glowMat(0xc026d3, glow, 0.9, 0.82), shell = glowMat(0xf0abfc, glow, 1.2, 0.9);
  const root = new THREE.Group();
  // carapace body and short spined stock
  root.add(mesh(side([[-0.12, 0.05], [-0.05, 0.15], [0.1, 0.17], [0.28, 0.135], [0.31, 0.06], [0.16, 0.035], [0.03, 0.04], [-0.12, 0.025]], 0.082, 0.01), M.chitin));
  root.add(mesh(side([[-0.11, 0.13], [-0.28, 0.105], [-0.37, 0.03], [-0.35, -0.02], [-0.3, -0.0], [-0.22, 0.04], [-0.11, 0.035]], 0.05, 0.008), M.chitin));
  // overlapping plates on the flanks (chitin segments)
  for (let i = 0; i < 4; i++) {
    const z = -0.06 + i * 0.085;
    for (const sx of [-1, 1]) {
      const pl = mesh(side([[0, 0.055], [0.1, 0.045], [0.085, 0.13], [-0.01, 0.15]], 0.008, 0.002, false), M.chitin, sx * 0.043, 0, z);
      pl.rotation.y = sx * 0.12;
      root.add(pl);
    }
  }
  // magenta veins running back along the flanks
  for (const sx of [-1, 1]) {
    root.add(mesh(tube([V(sx * 0.044, 0.1, 0.27), V(sx * 0.047, 0.12, 0.15), V(sx * 0.047, 0.11, 0.02), V(sx * 0.03, 0.09, -0.15), V(sx * 0.027, 0.06, -0.3)], 0.004, 0.0015, 20, 5), mag));
    // hex visor window
    const hex = mesh(new THREE.CircleGeometry(0.026, 6), mag, sx * 0.0465, 0.1, 0.09);
    hex.rotation.y = sx * Math.PI / 2;
    root.add(hex);
    const frame = mesh(new THREE.TorusGeometry(0.028, 0.004, 4, 6), M.iron, sx * 0.046, 0.1, 0.09);
    frame.rotation.y = Math.PI / 2;
    root.add(frame);
  }
  // fins: magenta membranes on black ribs, swept back along the spine
  for (let i = 0; i < 3; i++) {
    const z = 0.22 - i * 0.11, h = 0.15 - i * 0.025;
    const fin = new THREE.Group();
    fin.position.set(0, 0.155 + i * 0.004, z);
    fin.rotation.x = -0.35;
    const shape: [number, number][] = [[0, 0], [0.11, 0.0], [-0.03, h * 0.7], [-0.1, h]];
    fin.add(mesh(side(shape, 0.004, 0, true), memb));
    fin.add(mesh(tube([V(0, 0, 0.1), V(0, h * 0.4, 0.0), V(0, h, -0.1)], 0.006, 0.0015, 10, 5), M.chitin));
    root.add(fin);
  }
  // grip and guard
  root.add(mesh(side([[0.035, 0.04], [0.06, 0.035], [0.035, -0.085], [-0.02, -0.09], [-0.015, 0.035]], 0.04, 0.006), M.chitin));
  root.add(mesh(tube([V(0, -0.02, 0.05), V(0, -0.06, 0.03), V(0, -0.085, 0.0)], 0.0025, 0.002, 8, 4), mag));
  const guard = mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 12, Math.PI), M.iron, 0, 0.04, 0.075);
  guard.rotation.set(Math.PI, Math.PI / 2, 0);
  root.add(guard);
  // twin bores in a chitin muzzle collar
  for (const sx of [-1, 1]) {
    root.add(mesh(rod(0.022, 0.022, 0.28, 0.47, 14), M.iron, sx * 0.022, 0.095, 0));
    const glowDisc = mesh(new THREE.CircleGeometry(0.016, 14), mag, sx * 0.022, 0.095, 0.471);
    root.add(glowDisc);
  }
  const collar = mesh(rod(0.055, 0.05, 0.42, 0.47, 10), M.chitin, 0, 0.095, 0);
  collar.scale.set(1, 0.72, 1);
  root.add(collar);
  // three hooked claws around the muzzle
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
    const cx = Math.cos(a), cy = Math.sin(a);
    root.add(mesh(tube([V(cx * 0.05, 0.095 + cy * 0.04, 0.4), V(cx * 0.07, 0.095 + cy * 0.06, 0.5), V(cx * 0.05, 0.095 + cy * 0.045, 0.58), V(cx * 0.02, 0.095 + cy * 0.02, 0.6)], 0.012, 0.001, 16, 6), M.chitin));
  }
  // sight: a magenta notch on a fang
  root.add(mesh(new THREE.ConeGeometry(0.009, 0.03, 4), M.chitin, 0, 0.18, 0.06));
  root.add(mesh(new THREE.BoxGeometry(0.012, 0.004, 0.004), mag, 0, 0.192, 0.055));
  // magazine: a void-shell canister in a claw holder
  const mg = new THREE.Group();
  mg.add(mesh(new THREE.SphereGeometry(0.03, 12, 10).scale(0.8, 1.15, 1), shell, 0, -0.035, 0));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; mg.add(mesh(tube([V(Math.cos(a) * 0.012, 0.0, Math.sin(a) * 0.012), V(Math.cos(a) * 0.03, -0.035, Math.sin(a) * 0.03), V(Math.cos(a) * 0.012, -0.075, Math.sin(a) * 0.012)], 0.004, 0.002, 8, 4), M.chitin)); }
  const magHome = V(0, 0.035, 0.13);
  mg.position.copy(magHome);
  root.add(mg);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.095, 0.5); root.add(muzzle);
  return { root, muzzle, mag: mg, magHome, sight: V(0, 0.192, 0.06), support: V(0, 0.05, 0.28), charge: V(0.045, 0.12, 0.02), glow };
}

/** Chord Repeater — Seraph / Lumen: white enamel with gold filigree, golden wing-blades sweeping back from the
 *  receiver, three gold barrels (a chord) held by enamel rings, a gold halo at the muzzle and a prism sight. ~1 m. */
function buildChord(glow: Glow): Omit<WeaponModel, 'heat'> {
  const M = mats(), gold = glowMat(0xfbbf24, glow, 1.3), violet = glowMat(0xa855f7, glow, 1.6), prismMat = glowMat(0xfde68a, glow, 0.7, 0.8);
  const root = new THREE.Group();
  const bodyPts: [number, number][] = [[-0.1, 0.05], [-0.06, 0.13], [0.2, 0.138], [0.27, 0.105], [0.27, 0.055], [0.0, 0.04]];
  root.add(mesh(side(bodyPts, 0.07, 0.008), M.enamel));
  root.add(mesh(side([[-0.02, 0.125], [-0.36, 0.115], [-0.4, 0.05], [-0.39, 0.0], [-0.33, -0.01], [-0.02, 0.05]], 0.05, 0.008), M.enamel));
  for (const z of [-0.09, 0.22]) root.add(mesh(new THREE.BoxGeometry(0.074, 0.1, 0.014), M.gold, 0, 0.09, z));
  root.add(mesh(new THREE.BoxGeometry(0.056, 0.13, 0.014), M.gold, 0, 0.06, -0.38));
  // gold filigree tracing the body and stock on both flanks
  for (const sx of [-1, 1]) {
    root.add(mesh(tube([V(sx * 0.0365, 0.125, -0.06), V(sx * 0.0365, 0.13, 0.08), V(sx * 0.0365, 0.13, 0.2), V(sx * 0.0365, 0.1, 0.265)], 0.0025, 0.0025, 18, 4), M.gold));
    root.add(mesh(tube([V(sx * 0.0365, 0.05, 0.0), V(sx * 0.0365, 0.06, 0.12), V(sx * 0.0365, 0.055, 0.26)], 0.0025, 0.0025, 12, 4), M.gold));
    root.add(mesh(tube([V(sx * 0.026, 0.11, -0.12), V(sx * 0.026, 0.09, -0.22), V(sx * 0.026, 0.06, -0.25), V(sx * 0.026, 0.07, -0.3), V(sx * 0.026, 0.1, -0.33)], 0.002, 0.0015, 16, 4), M.gold));
    // golden wing-blade sweeping back (feathered edge = three stepped vanes)
    const wing = new THREE.Group();
    wing.position.set(sx * 0.038, 0.11, 0.12);
    wing.rotation.set(0, sx * 0.12, sx * -0.25);
    for (let v = 0; v < 3; v++) {
      wing.add(mesh(side([[0, 0], [0.04, 0.02], [-0.14 + v * 0.03, 0.05 - v * 0.012], [-0.2 + v * 0.04, 0.03 - v * 0.012]], 0.004, 0.0015), M.gold, sx * 0.004 * v, -v * 0.012, -v * 0.01));
    }
    root.add(wing);
    // violet resonance window
    const win = mesh(new THREE.PlaneGeometry(0.06, 0.018), violet, sx * 0.0362, 0.09, 0.15);
    win.rotation.y = sx * Math.PI / 2;
    root.add(win);
  }
  // three barrels in a triangle, held by enamel rings with gold edges
  const tips: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2, x = Math.cos(a) * 0.016, y = 0.095 + Math.sin(a) * 0.016;
    root.add(mesh(rod(0.0095, 0.008, 0.26, 0.64, 10), M.gold, x, y, 0));
    const t = new THREE.Object3D(); t.position.set(x, y, 0.645); root.add(t); tips.push(t);
  }
  for (const z of [0.34, 0.5]) { root.add(mesh(rod(0.031, 0.031, z - 0.012, z + 0.012, 16), M.enamel, 0, 0.095, 0)); root.add(mesh(ring(0.029, 0.0025, z + 0.012, 24), M.gold, 0, 0.095, 0)); }
  // halo at the muzzle: gold ring, glowing inner ring, four fleur points
  const halo = new THREE.Group(); halo.position.set(0, 0.095, 0.6); halo.scale.setScalar(1.4);
  halo.add(mesh(ring(0.046, 0.005, 0), M.gold));
  halo.add(mesh(ring(0.04, 0.003, 0), gold));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = mesh(new THREE.ConeGeometry(0.006, 0.024, 4), M.gold, Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0);
    f.rotation.z = a - Math.PI / 2;
    halo.add(f);
  }
  root.add(halo);
  // prism sight on a gold cradle, violet heart
  root.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.05), M.gold, 0, 0.145, 0.06));
  const prism = mesh(new THREE.OctahedronGeometry(0.022, 0), prismMat, 0, 0.18, 0.06);
  prism.scale.set(0.8, 1.4, 0.8);
  root.add(prism);
  root.add(mesh(new THREE.OctahedronGeometry(0.007, 0), violet, 0, 0.18, 0.06));
  // grip, gold guard
  root.add(mesh(side([[0.03, 0.045], [0.055, 0.045], [0.03, -0.085], [-0.02, -0.09], [-0.015, 0.045]], 0.034, 0.005), M.enamel));
  root.add(mesh(new THREE.BoxGeometry(0.038, 0.012, 0.05), M.gold, 0, -0.083, 0.005));
  const guard = mesh(new THREE.TorusGeometry(0.03, 0.0035, 6, 16, Math.PI), M.gold, 0, 0.045, 0.07);
  guard.rotation.set(Math.PI, Math.PI / 2, 0);
  root.add(guard);
  // magazine: gold cartridge with a violet window
  const mg = new THREE.Group();
  mg.add(mesh(side([[-0.022, 0.0], [0.022, 0.0], [0.03, -0.085], [-0.014, -0.085]], 0.03, 0.004), M.gold));
  const mw = mesh(new THREE.PlaneGeometry(0.012, 0.05), violet, 0.0155, -0.042, 0.004); mw.rotation.y = Math.PI / 2; mg.add(mw);
  const mw2 = mw.clone(); mw2.position.x = -0.0155; mw2.rotation.y = -Math.PI / 2; mg.add(mw2);
  const magHome = V(0, 0.045, 0.12);
  mg.position.copy(magHome);
  root.add(mg);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.095, 0.65); root.add(muzzle);
  return { root, muzzle, mag: mg, magHome, sight: V(0, 0.208, 0.06), support: V(0, 0.07, 0.4), charge: V(0.04, 0.115, -0.01), glow, tips };
}

/** Build one vessel's gun. `fp` = first-person copy (no shadows, drawn over the world). */
export function buildWeapon(id: VesselId, fp = false): WeaponModel {
  const glow = makeGlow();
  const heat = uniform(0);
  (glow as unknown as { heat: Glow }).heat = heat;   // glowMat reads it
  const m: WeaponModel = { ...(id === 'aegis' ? buildLance(glow) : id === 'stalker' ? buildScatter(glow) : buildChord(glow)), heat };
  m.root.name = `weapon_${id}${fp ? '_fp' : ''}`;
  finish(m.root, fp);
  return m;
}

// ── First-person hands (armoured gauntlets of the Void Stalker body) ────────────────────────────────────────────

/** Right hand wrapped round the pistol grip (model space: grip at the origin), forearm running back and down. */
function gripHand(trim: THREE.Material): THREE.Group {
  const M = mats(), g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.072, 0.085, 0.034), M.chitin, 0, -0.012, -0.03));
  for (let f = 0; f < 4; f++) {
    const fi = mesh(new THREE.CapsuleGeometry(0.0085, 0.05, 3, 6), M.chitin, 0, 0.012 - f * 0.02, 0.028);
    fi.rotation.z = Math.PI / 2;
    g.add(fi);
  }
  const th = mesh(new THREE.CapsuleGeometry(0.009, 0.035, 3, 6), M.chitin, -0.03, 0.035, 0.0);
  th.rotation.x = Math.PI / 2;
  g.add(th);
  g.add(mesh(tube([V(0, -0.02, -0.035), V(0.01, -0.06, -0.16), V(0.04, -0.12, -0.36)], 0.026, 0.032, 10, 10), M.chitin));
  g.add(mesh(new THREE.TorusGeometry(0.036, 0.005, 6, 16).rotateX(0.35).translate(0.006, -0.045, -0.1), trim));
  finish(g, true);
  return g;
}
/** Left hand cupped under the fore-end, fingers up the sides, forearm running back, down and inward. */
function supportHand(trim: THREE.Material): THREE.Group {
  const M = mats(), g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.026, 0.085), M.chitin, 0, -0.03, 0));
  for (let f = 0; f < 3; f++) {
    const fi = mesh(new THREE.CapsuleGeometry(0.008, 0.035, 3, 6), M.chitin, 0.034, -0.008, 0.025 - f * 0.022);
    g.add(fi);
  }
  const th = mesh(new THREE.CapsuleGeometry(0.009, 0.03, 3, 6), M.chitin, -0.034, -0.012, 0.0);
  g.add(th);
  g.add(mesh(tube([V(0, -0.035, -0.04), V(-0.02, -0.07, -0.16), V(-0.06, -0.12, -0.3)], 0.024, 0.03, 10, 10), M.chitin));
  g.add(mesh(new THREE.TorusGeometry(0.034, 0.005, 6, 16).translate(-0.012, -0.06, -0.1), trim));
  finish(g, true);
  return g;
}

// ── First-person weapon rig ─────────────────────────────────────────────────────────────────────────────────────

const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (t: number, a: number, b: number) => ease(THREE.MathUtils.clamp((t - a) / Math.max(1e-4, b - a), 0, 1));

/** Everything the first-person view does with the gun. The player controller owns timing (reload, switch); this only
 *  draws it. Sounds for the reload beats are raised through `onBeat`. */
export class WeaponViewmodel {
  readonly root = new THREE.Group();
  private models = new Map<VesselId, WeaponModel>();
  private hands: { r: THREE.Group; l: THREE.Group };
  private trim: THREE.MeshStandardNodeMaterial;
  private current: VesselId = 'aegis';
  private shown: VesselId = 'aegis';
  // springs
  private kickZ = 0; private kickZv = 0; private kickR = 0; private kickRv = 0; private kickY = 0; private kickYv = 0;
  private swayX = 0; private swayY = 0; private bobT = 0; private dry = 0;
  private lastYaw = 0; private lastPitch = 0; private initLook = false;
  private lastReload = -1;
  /** Reload beat crossed: 'release' | 'out' | 'in' | 'charge'. */
  onBeat?: (beat: keyof ReloadPhases | 'done') => void;

  constructor() {
    this.trim = new THREE.MeshStandardNodeMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.2, roughness: 0.3 });
    for (const id of ['aegis', 'stalker', 'seraph'] as VesselId[]) {
      const m = buildWeapon(id, true);
      m.root.visible = id === this.current;
      this.models.set(id, m);
      this.root.add(m.root);
    }
    this.hands = { r: gripHand(this.trim), l: supportHand(this.trim) };
    this.root.add(this.hands.r, this.hands.l);
  }

  model(id: VesselId = this.current) { return this.models.get(id)!; }
  setTrim(hex: number) { this.trim.color.setHex(hex); this.trim.emissive.setHex(hex); }
  /** The gun to show (the swap happens at the bottom of the switch). */
  select(id: VesselId) { this.current = id; }

  /** A shot: kick the springs (spec.recoil), flash the glow. */
  kick(spec: WeaponSpec, ads: number) {
    const k = 1 - ads * 0.5;
    this.kickZv += spec.recoil.kickBack * 60 * k;
    this.kickRv += spec.recoil.kickRot * 60 * k;
    this.kickYv += (Math.random() - 0.5) * spec.recoil.kickRot * 25 * k;
    this.model().glow.value = 3.2;
  }
  /** Trigger on an empty magazine: a small dry jolt. */
  dryFire() { this.dry = 1; }

  /**
   * @param reload 0…1 progress of a running reload, or -1
   * @param sw 0…1 progress of a running switch, or -1 (swaps at 0.5)
   */
  update(dt: number, o: { spec: WeaponSpec; yaw: number; pitch: number; speed: number; onGround: boolean; ads: number; reload: number; sw: number; pulse: number; crouched: boolean }) {
    const spec = o.spec, t = dt;
    // which gun is up: during a switch the old one lowers, the new one rises
    const want = o.sw >= 0 && o.sw < 0.5 ? this.shown : this.current;
    if (want !== this.shown || !this.models.get(this.shown)!.root.visible) {
      for (const [id, m] of this.models) m.root.visible = id === want;
      this.shown = want;
    }
    const m = this.models.get(this.shown)!;
    m.glow.value += (1 + o.pulse * 0.7 - m.glow.value) * Math.min(1, dt * 10);

    // springs (critically-damped-ish)
    const spring = (x: number, v: number, k: number, d: number) => { v += (-k * x - d * v) * t; return [x + v * t, v] as const; };
    [this.kickZ, this.kickZv] = spring(this.kickZ, this.kickZv, 260, 24);
    [this.kickR, this.kickRv] = spring(this.kickR, this.kickRv, 220, 20);
    [this.kickY, this.kickYv] = spring(this.kickY, this.kickYv, 200, 20);
    this.dry = Math.max(0, this.dry - dt * 6);

    // sway follows the look (lags behind a turn), bob follows the stride
    if (!this.initLook) { this.lastYaw = o.yaw; this.lastPitch = o.pitch; this.initLook = true; }
    let dyaw = o.yaw - this.lastYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const dpitch = o.pitch - this.lastPitch;
    this.lastYaw = o.yaw; this.lastPitch = o.pitch;
    const swayK = (1 - o.ads * 0.8);
    this.swayX += (THREE.MathUtils.clamp(dyaw * 1.6, -0.08, 0.08) * swayK - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (THREE.MathUtils.clamp(dpitch * 1.6, -0.08, 0.08) * swayK - this.swayY) * Math.min(1, dt * 9);
    const stride = o.onGround ? Math.min(1, o.speed / 9) : 0;
    this.bobT += dt * (6 + o.speed * 0.9) * (stride > 0.05 ? 1 : 0);
    const bobAmp = stride * (1 - o.ads * 0.85) * (o.crouched ? 0.6 : 1);
    const bobX = Math.sin(this.bobT) * 0.012 * bobAmp, bobY = -Math.abs(Math.cos(this.bobT)) * 0.014 * bobAmp;
    const breathe = Math.sin(performance.now() * 0.0016) * 0.003 * (1 - o.ads);

    // hip → ADS: the sight goes onto the view axis
    const hip = V(...spec.fpHip);
    // the model is turned 180° about Y, so model (x, y, z) sits at (-x, y, -z): put the sight 0.34 m down the view axis
    const ads = V(m.sight.x, -m.sight.y, -0.34 + m.sight.z);
    const a = ease(o.ads);
    const pos = hip.lerp(ads, a);

    // switch: lower (0 → 0.5), raise (0.5 → 1)
    const swDown = o.sw >= 0 ? Math.sin(Math.min(1, o.sw) * Math.PI) : 0;
    // reload pose: tilt the gun, mag out / in with the support hand
    const p = o.reload, ph = spec.phases;
    let tilt = 0, lift = 0, magOff = 0, handT = 0, chargePull = 0, seatJolt = 0;
    if (p >= 0) {
      tilt = seg(p, 0, ph.release) * (1 - seg(p, ph.charge + 0.08, 1));
      lift = tilt;
      // mag drops out after the release, is away, comes back up and seats at `in`
      const mid = (ph.out + ph.in) / 2;
      magOff = p < ph.out ? seg(p, ph.release, ph.out) * 0.06
        : p < mid ? 0.06 + seg(p, ph.out, mid) * 0.34
        : p < ph.in - 0.06 ? 0.4 - seg(p, mid, ph.in - 0.06) * 0.34
        : 0.06 * (1 - seg(p, ph.in - 0.06, ph.in));
      handT = seg(p, ph.release - 0.08, ph.release) * (1 - seg(p, ph.in + 0.02, ph.in + 0.1));
      chargePull = p >= ph.in + 0.04 ? Math.sin(seg(p, ph.charge - 0.06, ph.charge + 0.08) * Math.PI) : 0;
      seatJolt = Math.max(0, 1 - Math.abs(p - ph.in) * 40);
      // beats for the sounds (crossing each one once)
      for (const k of ['release', 'out', 'in', 'charge'] as const) if (this.lastReload < ph[k] && p >= ph[k]) this.onBeat?.(k);
      this.lastReload = p;
    } else if (this.lastReload >= 0) { this.lastReload = -1; this.onBeat?.('done'); }

    this.root.position.set(
      pos.x - tilt * 0.07 + bobX + this.swayX * 0.4 + this.kickY * 0.2,
      pos.y + bobY + breathe - this.swayY * 0.3 - swDown * 0.32 + lift * 0.03 - this.dry * 0.006 + seatJolt * 0.01,
      pos.z + this.kickZ + swDown * 0.05,
    );
    this.root.rotation.set(
      // model frame (turned 180°): +X rotation dips the muzzle, so climbs are negative
      -this.kickR + this.swayY * 0.8 + swDown * 0.7 - lift * 0.22 - this.dry * 0.04 - seatJolt * 0.05,
      Math.PI + this.swayX * 1.2 + this.kickY + tilt * 0.12,
      tilt * 0.45 * (1 - a) + this.swayX * 0.6,
      'YXZ',
    );
    // the mag drops (in model space, down and a bit forward)
    m.mag.position.set(m.magHome.x, m.magHome.y - magOff, m.magHome.z + magOff * 0.15);
    m.mag.visible = !(p >= ph.out + 0.03 && p < ph.in - 0.12);

    // hands: right on the grip, left on the support point (or at the mag / charging handle while reloading)
    const r = this.hands.r, l = this.hands.l;
    r.position.set(0, 0, 0);
    const sup = m.support.clone(), magP = m.magHome.clone().add(V(0, -magOff - 0.05, 0)), ch = m.charge.clone();
    const lp = sup.lerp(magP, handT);
    if (chargePull > 0) lp.lerp(ch.add(V(0.02, 0, -0.04 * chargePull)), Math.min(1, chargePull * 1.5));
    l.position.copy(lp);
    l.rotation.set(handT * 0.5, 0, handT * -0.5);
  }
}

// ── Tracers ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface Tracer { core: THREE.Mesh; glow: THREE.Mesh; trace: THREE.Mesh | null; from: THREE.Vector3; to: THREE.Vector3; dir: THREE.Vector3; dist: number; t: number; spec: TracerSpec }

/** Pooled per-weapon tracers (one shared unit cylinder, a material per pooled mesh so each fades on its own). */
export class Tracers {
  readonly group = new THREE.Group();
  private unit: THREE.BufferGeometry;
  private pool: THREE.Mesh[] = [];
  private live: Tracer[] = [];

  constructor() {
    this.unit = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.unit.rotateX(Math.PI / 2);
    this.group.name = 'tracers';
  }

  private take(hex: number, opacity: number): THREE.Mesh {
    const m = this.pool.pop() ?? (() => {
      const mesh = new THREE.Mesh(this.unit, new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    })();
    const mat = m.material as THREE.MeshBasicNodeMaterial;
    mat.color.setHex(hex); mat.opacity = opacity; m.visible = true;
    m.userData.op = opacity;
    return m;
  }

  /** A shot's tracer from the muzzle to where it landed. PERFECT shots run gold. */
  spawn(from: THREE.Vector3, to: THREE.Vector3, spec: TracerSpec, tint: number, perfect: boolean) {
    const col = perfect ? 0xfbbf24 : tint;
    const coreCol = new THREE.Color(0xffffff).lerp(new THREE.Color(col), 0.35).getHex();
    const dist = Math.max(0.01, from.distanceTo(to));
    const tr: Tracer = {
      core: this.take(coreCol, 1), glow: this.take(col, perfect ? 0.45 : 0.32),
      trace: spec.trace ? this.take(col, spec.trace) : null,
      from: from.clone(), to: to.clone(), dir: to.clone().sub(from).divideScalar(dist), dist, t: 0, spec,
    };
    const w = perfect ? 1.35 : 1;
    tr.core.userData.r = spec.core * w; tr.glow.userData.r = spec.glow * w;
    if (tr.trace) tr.trace.userData.r = spec.core * 0.6;
    this.live.push(tr);
    this.place(tr);
  }

  private seg(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    const len = a.distanceTo(b);
    m.position.copy(a).lerp(b, 0.5);
    m.scale.set(m.userData.r, m.userData.r, Math.max(1e-3, len));
    m.lookAt(b);
  }

  private head = new THREE.Vector3(); private tail = new THREE.Vector3();
  private place(tr: Tracer) {
    const s = tr.spec;
    if (s.style === 'beam') {
      this.seg(tr.core, tr.from, tr.to); this.seg(tr.glow, tr.from, tr.to);
    } else {
      const h = Math.min(tr.dist, tr.t * (s.speed ?? 150));
      this.head.copy(tr.from).addScaledVector(tr.dir, h);
      this.tail.copy(tr.from).addScaledVector(tr.dir, Math.max(0, h - (s.length ?? 2)));
      this.seg(tr.core, this.tail, this.head); this.seg(tr.glow, this.tail, this.head);
      if (tr.trace) this.seg(tr.trace, tr.from, tr.to);
    }
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const tr = this.live[i];
      tr.t += dt;
      const s = tr.spec;
      const travel = s.style === 'beam' ? 0 : tr.dist / (s.speed ?? 150);
      const life = travel + s.life;
      const fade = s.style === 'beam' ? 1 - tr.t / life : tr.t < travel ? 1 : 1 - (tr.t - travel) / s.life;
      if (tr.t >= life) {
        for (const m of [tr.core, tr.glow, tr.trace]) if (m) { m.visible = false; this.pool.push(m); }
        this.live.splice(i, 1);
        continue;
      }
      this.place(tr);
      for (const m of [tr.core, tr.glow, tr.trace]) if (m) (m.material as THREE.MeshBasicNodeMaterial).opacity = m.userData.op * Math.max(0, fade) ** 1.5;
      // a beam thins as it fades
      if (s.style === 'beam') { tr.core.scale.x = tr.core.scale.y = tr.core.userData.r * (0.4 + 0.6 * fade); tr.glow.scale.x = tr.glow.scale.y = tr.glow.userData.r * (0.6 + 0.4 * fade); }
    }
  }
}
