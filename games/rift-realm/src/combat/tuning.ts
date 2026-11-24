// Rift Realm combat tuning: one plain-data table for enemy AI, player melee moves, guard / parry, hit-stop and the
// Soul-Rend executions. Everything here is JSON-safe so the Game Studio can show and edit it:
//   - the Studio (iframe parent) posts { source: STUDIO_SOURCE, type: 'combatTuning', tuning: Partial<CombatTuning> }
//   - localStorage 'rift-realm-combat-tuning' holds a saved override (JSON, same shape, partial is fine)
//   - under ?rrdebug: __rr.combat.tune({ ai: { maxMeleeTokens: 3 } }) / __rr.combat.tuning
// On load the game posts { type: 'combatTuningDefaults', tuning } to the Studio so its editor can list the fields.
//
// Units: seconds, metres, hit points. "startup" = wind-up before the hit window, "active" = the hit window,
// "recovery" = after it. Damage numbers are before the beat bonus (rhythm.ts evaluateBeat).

import { GAME_SOURCE, STUDIO_SOURCE } from '../../../../services/gamestudio/runtime';

export type Archetype = 'rusher' | 'caster' | 'brute' | 'boss';

export interface EnemyAttack {
  id: string;
  kind: 'melee' | 'bolt' | 'slam' | 'charge' | 'barrage';
  /** Seconds of readable wind-up (the telegraph ring fills, the core flares). */
  startup: number;
  active: number;
  recovery: number;
  dmg: number;
  /** Melee reach / slam radius / charge distance, m. */
  range: number;
  /** Half-angle of the melee cone as a dot product threshold (0.3 ≈ ±72°). */
  cone: number;
  /** The player can't block it (a slam), only dash out. */
  unblockable?: boolean;
  /** Hits in a row (a rusher's 2-hit string, the boss' 3-hit). */
  hits?: number;
  /** Bolt speed m/s, bolts per barrage. */
  speed?: number;
  count?: number;
  clip?: string;
  /** Chance weight when several attacks are in range. */
  weight: number;
  /** Use from at least / at most this distance. */
  minDist: number;
  maxDist: number;
}

export interface ArchetypeTuning {
  hp: number;
  hpPerWave: number;
  speed: number;
  /** Preferred distance band (m): it tries to sit between these when it isn't attacking. */
  rangeMin: number;
  rangeMax: number;
  /** 0..1 how much it circles to the player's sides / back instead of coming straight. */
  flank: number;
  strafe: number;
  /** Chance to sidestep a shot aimed at it / a strike coming at it (per threat, with a cooldown). */
  dodgeShot: number;
  dodgeStrike: number;
  dodgeCooldown: number;
  /** Chance to raise its guard against a strike it sees coming, and how much guard it has. */
  block: number;
  guard: number;
  /** Damage a single hit must do to break its wind-up (poise); 0 = any hit interrupts. */
  poise: number;
  /** Stagger meter: shots / strikes fill it, full = dazed (open for a combo). */
  stagger: number;
  dazeSec: number;
  /** Seconds between its attacks, after recovering. */
  attackGap: [number, number];
  /** Health fraction at which it can be executed (Soul-Rend). */
  finishAt: number;
  /** Juggle weight: 1 = normal launch height, 0 = can't be launched. */
  launch: number;
  scale: number;
  tint: number;
  attacks: EnemyAttack[];
}

export interface PlayerMove {
  id: string;
  name: string;
  /** Player clip, then fallbacks (rig.has decides). */
  clips: string[];
  dmg: number;
  guardDmg: number;
  /** Enemy hit-stun, s. */
  hitstun: number;
  knock: number;
  range: number;
  cone: number;
  startup: number;
  active: number;
  recovery: number;
  /** Launches the target into a juggle (vy m/s). */
  launch?: number;
  /** Spikes an airborne target to the floor. */
  spike?: boolean;
  /** Lunge toward the target (m/s for the startup + active time). */
  lunge?: number;
  hitStop: number;
  shake: number;
  /** Slash look: 'slash' | 'perfect' | 'shadow', its roll, scale. */
  slash: 'slash' | 'perfect' | 'shadow';
  tilt: number;
  scale: number;
  /** Resonance gained on a hit (melee reloads resonance). */
  resonance: number;
  /** Hits all enemies around the player (a spin) instead of the cone. */
  around?: boolean;
}

export interface CombatTuning {
  ai: {
    /** How many enemies may be winding up / swinging a melee attack at once, and ranged. */
    maxMeleeTokens: number;
    maxRangedTokens: number;
    /** Taking turns: an enemy that has waited this much longer for a token goes before the one asking now. */
    tokenCooldown: number;
    /** Suppressing fire: while a squad-mate presses the player in melee, casters / the boss without a token pin them with
     *  quick, light, untelegraphed bolts aimed where the player is heading (no hit-stun: they chip, they don't stop a combo). */
    suppress: { dmg: number; gap: [number, number]; spread: number; speed: number; minDist: number; maxDist: number };
    /** Beyond this the old navigation (control points / stairs routing) takes over. */
    engageDist: number;
    /** Distance at which enemies waiting for a token circle. */
    circleDist: number;
    archetypes: Record<Archetype, ArchetypeTuning>;
    /** Archetype mix of the endless trials by wave: [rusher, caster, brute] weights; brutes start at wave 2. */
    mix: [number, number, number];
  };
  player: {
    /** Seconds after a move's active window in which the next input continues the chain. */
    comboWindow: number;
    /** Inputs pressed this early are buffered. */
    buffer: number;
    /** Light within this long after a dash = the dash-in strike. */
    dashStrikeWindow: number;
    /** Gun-fu: a strike within this long after a shot that hit lunges in to that enemy as the dash-in strike (up to
     *  shotLinkRange m away), for shotLinkMul damage. Shots cancel a strike's recovery once it has landed. */
    shotLinkWindow: number;
    shotLinkRange: number;
    shotLinkMul: number;
    /** Block: damage taken while guarding, guard meter, regen per s, perfect-parry window (s before a hit). */
    blockMul: number;
    guard: number;
    guardRegen: number;
    parryWindow: number;
    /** After a perfect parry: seconds the riposte is ready, its damage multiplier, slow-mo. */
    counterSec: number;
    counterMul: number;
    /** Beat multipliers on melee damage. */
    beatPerfect: number;
    beatGood: number;
    /** Dash i-frames, s (dodging through an attack). */
    dashIFrames: number;
    /** Juggle: gravity on launched enemies, extra lift per air hit, max air hits before they drop. */
    juggleGravity: number;
    juggleLift: number;
    juggleMax: number;
    /** A shot on an airborne enemy keeps it up (m/s). */
    airShotLift: number;
    moves: Record<string, PlayerMove>;
    /** Chains: input string -> move id ('L' light, 'H' heavy; prefixes: 'D' after a dash, 'A' in the air, 'C' counter). */
    chains: Record<string, string>;
  };
  feel: {
    /** Hit-stop multiplier (0 = off), slow-mo scale during a Soul-Rend, its length. */
    hitStop: number;
    finisherSlowmo: number;
    finisherSec: number;
    shake: number;
  };
}

const A = (o: Partial<EnemyAttack> & Pick<EnemyAttack, 'id' | 'kind'>): EnemyAttack => ({
  startup: 0.5, active: 0.12, recovery: 0.5, dmg: 10, range: 2.6, cone: 0.35, weight: 1, minDist: 0, maxDist: 3, ...o,
});

export const DEFAULT_TUNING: CombatTuning = {
  ai: {
    maxMeleeTokens: 2,
    maxRangedTokens: 2,
    tokenCooldown: 0.6,
    suppress: { dmg: 3, gap: [0.45, 0.8], spread: 0.12, speed: 26, minDist: 5, maxDist: 24 },
    engageDist: 28,
    circleDist: 6.5,
    mix: [5, 3, 2],
    archetypes: {
      rusher: {
        hp: 60, hpPerWave: 14, speed: 6.2, rangeMin: 1.6, rangeMax: 2.6, flank: 0.75, strafe: 0.7,
        dodgeShot: 0.28, dodgeStrike: 0.2, dodgeCooldown: 2.2, block: 0.22, guard: 40, poise: 0,
        stagger: 45, dazeSec: 1.4, attackGap: [0.7, 1.4], finishAt: 0.3, launch: 1, scale: 1, tint: 0xf43f5e,
        attacks: [
          A({ id: 'rusher_string', kind: 'melee', startup: 0.42, active: 0.12, recovery: 0.45, dmg: 8, range: 2.5, hits: 2, clip: 'attack_1', weight: 3, maxDist: 2.8 }),
          A({ id: 'rusher_lunge', kind: 'charge', startup: 0.5, active: 0.3, recovery: 0.6, dmg: 12, range: 7, clip: 'attack_3', weight: 1, minDist: 4, maxDist: 8 }),
        ],
      },
      caster: {
        hp: 48, hpPerWave: 10, speed: 5.0, rangeMin: 9, rangeMax: 16, flank: 0.35, strafe: 1,
        dodgeShot: 0.35, dodgeStrike: 0.45, dodgeCooldown: 2.6, block: 0, guard: 20, poise: 0,
        stagger: 30, dazeSec: 1.6, attackGap: [1.2, 2.0], finishAt: 0.35, launch: 1.15, scale: 0.92, tint: 0xa855f7,
        attacks: [
          A({ id: 'void_bolt', kind: 'bolt', startup: 0.7, active: 0.05, recovery: 0.5, dmg: 11, range: 30, speed: 19, clip: 'shoot', weight: 3, minDist: 3, maxDist: 30 }),
          A({ id: 'void_fan', kind: 'barrage', startup: 0.95, active: 0.3, recovery: 0.8, dmg: 7, range: 24, speed: 16, count: 3, clip: 'shoot', weight: 1, minDist: 5, maxDist: 22 }),
          A({ id: 'caster_shove', kind: 'melee', startup: 0.35, active: 0.1, recovery: 0.4, dmg: 6, range: 2.4, clip: 'attack_2', weight: 2, maxDist: 2.6 }),
        ],
      },
      brute: {
        hp: 170, hpPerWave: 30, speed: 3.8, rangeMin: 2.2, rangeMax: 3.4, flank: 0.15, strafe: 0.25,
        dodgeShot: 0, dodgeStrike: 0, dodgeCooldown: 9, block: 0.45, guard: 110, poise: 26,
        stagger: 120, dazeSec: 1.8, attackGap: [0.9, 1.6], finishAt: 0.22, launch: 0.55, scale: 1.3, tint: 0xf97316,
        attacks: [
          A({ id: 'brute_slam', kind: 'slam', startup: 1.0, active: 0.12, recovery: 0.9, dmg: 24, range: 4.2, unblockable: true, clip: 'attack_3', weight: 2, maxDist: 3.6 }),
          A({ id: 'brute_hook', kind: 'melee', startup: 0.6, active: 0.14, recovery: 0.6, dmg: 16, range: 3.2, cone: 0.2, clip: 'attack_1', weight: 2, maxDist: 3.3 }),
          A({ id: 'brute_charge', kind: 'charge', startup: 0.8, active: 0.55, recovery: 1.0, dmg: 20, range: 12, clip: 'run', weight: 1, minDist: 6, maxDist: 13 }),
        ],
      },
      boss: {
        hp: 560, hpPerWave: 0, speed: 4.2, rangeMin: 2.4, rangeMax: 6, flank: 0.3, strafe: 0.6,
        dodgeShot: 0.18, dodgeStrike: 0.12, dodgeCooldown: 3, block: 0.35, guard: 160, poise: 34,
        stagger: 200, dazeSec: 2.0, attackGap: [0.6, 1.2], finishAt: 0.12, launch: 0.35, scale: 1.6, tint: 0xe11d48,
        attacks: [
          A({ id: 'boss_triad', kind: 'melee', startup: 0.55, active: 0.12, recovery: 0.7, dmg: 12, range: 3.6, hits: 3, clip: 'attack_1', weight: 3, maxDist: 3.8 }),
          A({ id: 'boss_quake', kind: 'slam', startup: 1.1, active: 0.15, recovery: 1.0, dmg: 28, range: 5.5, unblockable: true, clip: 'attack_3', weight: 2, maxDist: 4.5 }),
          A({ id: 'boss_barrage', kind: 'barrage', startup: 0.9, active: 0.6, recovery: 0.8, dmg: 9, range: 30, speed: 18, count: 5, clip: 'shoot', weight: 2, minDist: 5, maxDist: 30 }),
          A({ id: 'boss_charge', kind: 'charge', startup: 0.8, active: 0.6, recovery: 1.1, dmg: 22, range: 14, clip: 'run', weight: 1, minDist: 7, maxDist: 15 }),
        ],
      },
    },
  },
  player: {
    comboWindow: 0.42,
    buffer: 0.25,
    dashStrikeWindow: 0.35,
    shotLinkWindow: 0.5,
    shotLinkRange: 9,
    shotLinkMul: 1.15,
    blockMul: 0.2,
    guard: 100,
    guardRegen: 22,
    parryWindow: 0.16,
    counterSec: 0.9,
    counterMul: 2.2,
    beatPerfect: 1.5,
    beatGood: 1.2,
    dashIFrames: 0.2,
    juggleGravity: 17,
    juggleLift: 2.8,
    juggleMax: 9,
    airShotLift: 2.2,
    moves: {
      l1: { id: 'l1', name: 'RIFT JAB', clips: ['light_1', 'attack_1'], dmg: 13, guardDmg: 12, hitstun: 0.38, knock: 0.35, range: 3.0, cone: 0.3, startup: 0.07, active: 0.1, recovery: 0.18, hitStop: 0.045, shake: 0.1, slash: 'slash', tilt: -0.45, scale: 0.9, resonance: 0.06 },
      l2: { id: 'l2', name: 'CROSS SEVER', clips: ['light_2', 'attack_3'], dmg: 15, guardDmg: 14, hitstun: 0.4, knock: 0.4, range: 3.0, cone: 0.3, startup: 0.07, active: 0.1, recovery: 0.2, hitStop: 0.05, shake: 0.12, slash: 'slash', tilt: 0.55, scale: 0.95, resonance: 0.07 },
      l3: { id: 'l3', name: 'TIDAL ARC', clips: ['light_3', 'attack_2'], dmg: 21, guardDmg: 22, hitstun: 0.55, knock: 2.2, range: 3.2, cone: 0.15, startup: 0.1, active: 0.12, recovery: 0.32, hitStop: 0.08, shake: 0.25, slash: 'perfect', tilt: 0.05, scale: 1.15, resonance: 0.12, around: true },
      h1: { id: 'h1', name: 'RIFT CLEAVER', clips: ['heavy_1', 'attack_3'], dmg: 28, guardDmg: 55, hitstun: 0.6, knock: 3.0, range: 3.3, cone: 0.25, startup: 0.22, active: 0.12, recovery: 0.38, hitStop: 0.1, shake: 0.35, slash: 'perfect', tilt: 1.2, scale: 1.2, resonance: 0.12 },
      h2: { id: 'h2', name: 'ASCENDING REND', clips: ['heavy_3', 'heavy_2', 'attack_2'], dmg: 18, guardDmg: 30, hitstun: 0.8, knock: 0.5, range: 3.1, cone: 0.25, startup: 0.16, active: 0.12, recovery: 0.3, launch: 9.5, hitStop: 0.09, shake: 0.3, slash: 'perfect', tilt: 1.55, scale: 1.15, resonance: 0.14 },
      h3: { id: 'h3', name: 'SUNDER', clips: ['heavy_2', 'heavy_1', 'attack_1'], dmg: 22, guardDmg: 140, hitstun: 0.7, knock: 2.6, range: 3.2, cone: 0.25, startup: 0.2, active: 0.12, recovery: 0.4, hitStop: 0.12, shake: 0.4, slash: 'shadow', tilt: -1.1, scale: 1.1, resonance: 0.12 },
      dash: { id: 'dash', name: 'RIFT LUNGE', clips: ['attack_1', 'light_1'], dmg: 18, guardDmg: 25, hitstun: 0.5, knock: 1.2, range: 3.0, cone: 0.3, startup: 0.05, active: 0.14, recovery: 0.22, lunge: 16, hitStop: 0.07, shake: 0.2, slash: 'slash', tilt: -0.2, scale: 1.1, resonance: 0.1 },
      air: { id: 'air', name: 'SKY THREAD', clips: ['light_2', 'attack_2'], dmg: 11, guardDmg: 10, hitstun: 0.5, knock: 0.2, range: 3.2, cone: 0.2, startup: 0.05, active: 0.1, recovery: 0.16, hitStop: 0.05, shake: 0.1, slash: 'slash', tilt: 0.9, scale: 0.9, resonance: 0.08 },
      spike: { id: 'spike', name: 'STARFALL', clips: ['finisher', 'heavy_1', 'attack_3'], dmg: 26, guardDmg: 40, hitstun: 0.9, knock: 0.8, range: 3.6, cone: 0.1, startup: 0.12, active: 0.14, recovery: 0.35, spike: true, hitStop: 0.12, shake: 0.5, slash: 'shadow', tilt: 1.5, scale: 1.25, resonance: 0.16 },
      counter: { id: 'counter', name: 'RIPOSTE', clips: ['light_3', 'heavy_1', 'attack_3'], dmg: 20, guardDmg: 80, hitstun: 0.9, knock: 2.4, range: 3.4, cone: 0.1, startup: 0.04, active: 0.12, recovery: 0.25, hitStop: 0.14, shake: 0.4, slash: 'perfect', tilt: -0.8, scale: 1.3, resonance: 0.3 },
    },
    chains: {
      L: 'l1', LL: 'l2', LLL: 'l3', LLLL: 'l1',
      H: 'h1', LH: 'h3', LLH: 'h2', HH: 'h1', HL: 'l2',
      DL: 'dash', DH: 'h2',
      AL: 'air', AH: 'spike',
      CL: 'counter', CH: 'counter',
    },
  },
  feel: {
    hitStop: 1,
    finisherSlowmo: 0.25,
    finisherSec: 1.25,
    shake: 1,
  },
};

/** The live table (a deep copy of the defaults with any overrides merged in). */
export const COMBAT: CombatTuning = structuredClone(DEFAULT_TUNING);

function merge(into: any, from: any) {
  if (!from || typeof from !== 'object') return;
  for (const k of Object.keys(from)) {
    const v = from[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && into[k] && typeof into[k] === 'object' && !Array.isArray(into[k])) merge(into[k], v);
    else if (v !== undefined) into[k] = structuredClone(v);
  }
}

export function applyCombatTuning(partial: unknown) { merge(COMBAT, partial); }
export function resetCombatTuning() { for (const k of Object.keys(COMBAT)) delete (COMBAT as any)[k]; Object.assign(COMBAT, structuredClone(DEFAULT_TUNING)); }

/** Saved override, Studio messages. Call once at boot. */
export function initCombatTuning() {
  try { const s = localStorage.getItem('rift-realm-combat-tuning'); if (s) applyCombatTuning(JSON.parse(s)); } catch { /* bad JSON / private mode */ }
  if (window.parent !== window) {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== window.parent || !d || d.source !== STUDIO_SOURCE || d.type !== 'combatTuning') return;
      applyCombatTuning(d.tuning);
    });
    try { window.parent.postMessage({ source: GAME_SOURCE, type: 'combatTuningDefaults', tuning: DEFAULT_TUNING }, '*'); } catch { /* cross-origin */ }
  }
}
