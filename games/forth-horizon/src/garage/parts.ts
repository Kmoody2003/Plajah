// Apex Elohim parts: eleven slots, five tiers each (Stock, Street, Sport, Race, Elohim).
// A part changes the car's real physics numbers (power, mass, grip, springs, brakes, downforce) and adds performance-index points (PI), which set the car's class.
// Stock parts are free and always fitted. Every other part has to be UNLOCKED by playing (level, wins, medals, achievements, objectives) and then bought, or it is
// handed over as a reward and waits in the inventory until it is fitted.

export type SlotId = 'engine' | 'induction' | 'exhaust' | 'ecu' | 'gearbox' | 'diff' | 'suspension' | 'brakes' | 'tires' | 'weight' | 'aero';
export type Tier = 0 | 1 | 2 | 3 | 4;
export type Medal = 'bronze' | 'silver' | 'gold' | 'elohim';
export const MEDALS: Medal[] = ['bronze', 'silver', 'gold', 'elohim'];
export const TIER_NAMES = ['Stock', 'Street', 'Sport', 'Race', 'Elohim'] as const;
export type Powertrain = 'ice' | 'ev';

export type Unlock =
  | { kind: 'start' }
  | { kind: 'level'; level: number }
  | { kind: 'wins'; count: number }                              // golds and better, any circuit
  | { kind: 'medals'; count: number; min: Medal }                // this many circuit medals of at least this grade (best per circuit, delivery tiers count too)
  | { kind: 'achievement'; id: string }
  | { kind: 'objective'; id: string }
  | { kind: 'circuit'; circuit: string; medal: Medal };

/** what a part does to the spec. Multipliers are 1 = no change, adders 0 = no change. */
export interface Fx {
  power?: number;          // x peak power and torque
  lowTorque?: number;      // adds to the bottom of the torque curve (more punch out of corners)
  redline?: number;        // x redline rpm
  mass?: number;           // kg added (negative = lighter)
  grip?: number;           // adds to corneringGrip
  offroadGrip?: number;    // adds to the off-road bonus
  wetSens?: number;        // x the wet-road grip loss
  aero?: number;           // adds downforce
  topSpeed?: number;       // x top speed (drag)
  finalDrive?: number;     // x final drive (taller ratio is lower)
  spring?: number; damper?: number; antiRoll?: number; ride?: number; travel?: number;   // suspension multipliers (ride height in m added)
  brakeTorque?: number; brakeCool?: number;
  steer?: number;          // x steering lock
  pitch?: number;          // x engine note pitch
}

export interface PartDef {
  id: string;
  slot: SlotId;
  tier: Tier;
  name: string;
  blurb: string;
  baseCost: number;        // credits before the car's cost factor
  pi: number;
  fx: Fx;
  unlock: Unlock;
  only?: Powertrain;
  /** variants are alternatives at the same tier (rally suspension, rally tyres) */
  variant?: string;
}

export const SLOTS: { id: SlotId; label: string; evLabel?: string; blurb: string; icon: string }[] = [
  { id: 'engine', label: 'Engine', evLabel: 'Motors', blurb: 'Cams, heads, internals, pistons. Power.', icon: 'E' },
  { id: 'induction', label: 'Forced induction', evLabel: 'Inverter & battery', blurb: 'Boost and airflow. Power and punch.', icon: 'T' },
  { id: 'exhaust', label: 'Exhaust', blurb: 'Free-flowing headers and cats. A little power, a lot of noise.', icon: 'X' },
  { id: 'ecu', label: 'Engine tune', evLabel: 'Power map', blurb: 'Fuel and ignition maps. Higher revs.', icon: 'M' },
  { id: 'gearbox', label: 'Gearbox', blurb: 'Gear sets and final drive. Acceleration.', icon: 'G' },
  { id: 'diff', label: 'Differential', blurb: 'Limited slip. Puts the power down out of corners.', icon: 'D' },
  { id: 'suspension', label: 'Suspension', blurb: 'Springs, dampers, bars. Grip and control.', icon: 'S' },
  { id: 'brakes', label: 'Brakes', blurb: 'Discs, pads, ducts. Stopping and fade.', icon: 'B' },
  { id: 'tires', label: 'Tyres', blurb: 'The only thing touching the road.', icon: 'R' },
  { id: 'weight', label: 'Weight reduction', blurb: 'Less mass: everything gets better.', icon: 'W' },
  { id: 'aero', label: 'Aero', blurb: 'Splitter and wing. Downforce, with some drag.', icon: 'A' },
];

const NAMES: Record<SlotId, { ice: string[]; ev?: string[] }> = {
  engine: { ice: ['Stock engine', 'Street cams and intake', 'Sport head and cams', 'Race-built block', 'Elohim forged internals'], ev: ['Stock motors', 'Street windings', 'Sport stator', 'Race-wound motors', 'Elohim axial-flux set'] },
  induction: { ice: ['Stock airbox', 'Street boost kit', 'Sport boost kit', 'Race boost kit', 'Elohim twin-stage boost'], ev: ['Stock inverter', 'Street inverter', 'Sport inverter', 'Race inverter and cells', 'Elohim solid-state pack'] },
  exhaust: { ice: ['Stock exhaust', 'Street cat-back', 'Sport headers', 'Race straight-through', 'Elohim tuned-length system'] },
  ecu: { ice: ['Stock map', 'Street map', 'Sport map', 'Race map', 'Elohim map'], ev: ['Stock map', 'Street map', 'Sport map', 'Race map', 'Elohim map'] },
  gearbox: { ice: ['Stock gearbox', 'Street gear set', 'Sport gear set', 'Race close-ratio set', 'Elohim dog-box'], ev: ['Stock reduction', 'Street reduction', 'Sport reduction', 'Race reduction', 'Elohim reduction'] },
  diff: { ice: ['Open differential', 'Street limited slip', 'Sport limited slip', 'Race limited slip', 'Elohim active diff'] },
  suspension: { ice: ['Stock suspension', 'Street springs and dampers', 'Sport coilovers', 'Race coilovers', 'Elohim active suspension'] },
  brakes: { ice: ['Stock brakes', 'Street pads and discs', 'Sport pads and discs', 'Race big-brake kit', 'Elohim carbon-ceramic kit'] },
  tires: { ice: ['Stock tyres', 'Street tyres', 'Sport tyres', 'Semi-slick tyres', 'Slick tyres'] },
  weight: { ice: ['Stock weight', 'Stage 1: interior strip', 'Stage 2: lightweight panels', 'Stage 3: carbon body', 'Stage 4: race shell'] },
  aero: { ice: ['No aero', 'Street lip and spoiler', 'Sport splitter and wing', 'Race aero kit', 'Elohim active aero'] },
};

/** credits for each tier before the car's cost factor */
const SLOT_BASE: Record<SlotId, number> = { engine: 2400, induction: 2600, exhaust: 900, ecu: 1100, gearbox: 1900, diff: 1500, suspension: 2000, brakes: 1700, tires: 1600, weight: 1800, aero: 1500 };
const TIER_MULT = [0, 1, 2.6, 6, 14];

const PI_TABLE: Record<SlotId, number[]> = {
  engine: [0, 10, 22, 38, 58], induction: [0, 6, 14, 24, 36], exhaust: [0, 2, 5, 9, 13], ecu: [0, 3, 8, 14, 20], gearbox: [0, 4, 9, 15, 22], diff: [0, 3, 7, 12, 18],
  suspension: [0, 5, 12, 22, 34], brakes: [0, 3, 8, 14, 21], tires: [0, 8, 20, 34, 48], weight: [0, 4, 10, 18, 28], aero: [0, 3, 8, 16, 26],
};

const FX_TABLE: Record<SlotId, Fx[]> = {
  engine: [{}, { power: 1.06, lowTorque: 0.02 }, { power: 1.13, lowTorque: 0.02, redline: 1.02 }, { power: 1.22, redline: 1.04, lowTorque: 0.01 }, { power: 1.34, redline: 1.06 }],
  induction: [{}, { power: 1.04, lowTorque: 0.04 }, { power: 1.09, lowTorque: 0.05 }, { power: 1.15, lowTorque: 0.05 }, { power: 1.22, lowTorque: 0.06 }],
  exhaust: [{}, { power: 1.015, pitch: 1.02 }, { power: 1.03, pitch: 1.04 }, { power: 1.05, pitch: 1.06 }, { power: 1.07, pitch: 1.08 }],
  ecu: [{}, { power: 1.01, redline: 1.0 }, { power: 1.025, redline: 1.02 }, { power: 1.04, redline: 1.03 }, { power: 1.055, redline: 1.05 }],
  gearbox: [{}, { finalDrive: 1.02 }, { finalDrive: 1.04, topSpeed: 1.005 }, { finalDrive: 1.06, topSpeed: 1.01 }, { finalDrive: 1.08, topSpeed: 1.02 }],
  diff: [{}, { grip: 0.005 }, { grip: 0.01 }, { grip: 0.016 }, { grip: 0.022 }],
  suspension: [{}, { spring: 1.08, damper: 1.08, grip: 0.01 }, { spring: 1.2, damper: 1.2, antiRoll: 1.1, grip: 0.022, ride: -0.01 }, { spring: 1.38, damper: 1.4, antiRoll: 1.2, grip: 0.036, ride: -0.025, travel: 0.9 }, { spring: 1.5, damper: 1.6, antiRoll: 1.25, grip: 0.05, ride: -0.03, travel: 0.9 }],
  brakes: [{}, { brakeTorque: 1.1, brakeCool: 1.1 }, { brakeTorque: 1.22, brakeCool: 1.25 }, { brakeTorque: 1.38, brakeCool: 1.45 }, { brakeTorque: 1.55, brakeCool: 1.7 }],
  tires: [{}, { grip: 0.03, wetSens: 0.95 }, { grip: 0.07, wetSens: 1.05 }, { grip: 0.11, wetSens: 1.25 }, { grip: 0.15, wetSens: 1.5 }],
  weight: [{}, { mass: -30 }, { mass: -70 }, { mass: -120 }, { mass: -180 }],
  aero: [{}, { aero: 0.6, topSpeed: 0.998 }, { aero: 1.3, topSpeed: 0.99 }, { aero: 2.2, topSpeed: 0.98 }, { aero: 3.2, topSpeed: 0.97 }],
};

/** how each tier is unlocked, slot by slot, so the parts open up across the whole career and not all at once */
const UNLOCKS: Record<SlotId, Unlock[]> = {
  engine: [{ kind: 'start' }, { kind: 'level', level: 2 }, { kind: 'level', level: 5 }, { kind: 'wins', count: 5 }, { kind: 'circuit', circuit: 'ironport_grand_circuit', medal: 'elohim' }],
  induction: [{ kind: 'start' }, { kind: 'level', level: 3 }, { kind: 'level', level: 6 }, { kind: 'medals', count: 3, min: 'gold' }, { kind: 'medals', count: 6, min: 'gold' }],
  exhaust: [{ kind: 'start' }, { kind: 'start' }, { kind: 'level', level: 4 }, { kind: 'objective', id: 'obj_clean_5' }, { kind: 'objective', id: 'obj_drift_50k' }],
  ecu: [{ kind: 'start' }, { kind: 'level', level: 2 }, { kind: 'level', level: 7 }, { kind: 'achievement', id: 'forth_150_mph' }, { kind: 'objective', id: 'obj_200_mph' }],
  gearbox: [{ kind: 'start' }, { kind: 'level', level: 3 }, { kind: 'level', level: 8 }, { kind: 'wins', count: 8 }, { kind: 'objective', id: 'obj_deliv_chain_8' }],
  diff: [{ kind: 'start' }, { kind: 'level', level: 4 }, { kind: 'level', level: 9 }, { kind: 'objective', id: 'obj_drift_10k' }, { kind: 'wins', count: 25 }],
  suspension: [{ kind: 'start' }, { kind: 'level', level: 3 }, { kind: 'level', level: 6 }, { kind: 'circuit', circuit: 'great_lakes_cliff_raceway', medal: 'silver' }, { kind: 'level', level: 24 }],
  brakes: [{ kind: 'start' }, { kind: 'level', level: 3 }, { kind: 'level', level: 7 }, { kind: 'objective', id: 'obj_dist_100' }, { kind: 'circuit', circuit: 'great_lakes_cliff_raceway', medal: 'elohim' }],
  tires: [{ kind: 'start' }, { kind: 'start' }, { kind: 'level', level: 4 }, { kind: 'wins', count: 3 }, { kind: 'medals', count: 9, min: 'gold' }],
  weight: [{ kind: 'start' }, { kind: 'level', level: 4 }, { kind: 'level', level: 9 }, { kind: 'objective', id: 'obj_dist_300' }, { kind: 'objective', id: 'obj_deliv_100' }],
  aero: [{ kind: 'start' }, { kind: 'level', level: 5 }, { kind: 'level', level: 10 }, { kind: 'circuit', circuit: 'pinewood_rally_stage', medal: 'silver' }, { kind: 'achievement', id: 'forth_race_win' }],
};

const BLURBS: Record<SlotId, string> = {
  engine: 'More power across the rev range.', induction: 'More boost and punch out of corners.', exhaust: 'A little power and a better note.', ecu: 'Re-mapped for more revs and power.',
  gearbox: 'Shorter gearing: quicker acceleration, a touch more top end from the closer ratios.', diff: 'Better traction when you get on the power.', suspension: 'Stiffer and better controlled: more grip, less body roll.',
  brakes: 'More stopping power and less fade.', tires: 'More grip. The softer the compound, the more the rain hurts.', weight: 'Strips weight out of the car.', aero: 'More downforce. Costs a little top speed.',
};

function build(): PartDef[] {
  const out: PartDef[] = [];
  for (const s of SLOTS) {
    const slot = s.id;
    for (let t = 0; t <= 4; t++) {
      const tier = t as Tier;
      const mk = (only: Powertrain | undefined, name: string): PartDef => ({
        id: `${slot}.${tier}${only === 'ev' ? '.ev' : ''}`, slot, tier, name, blurb: tier === 0 ? 'What the car shipped with.' : BLURBS[slot],
        baseCost: Math.round(SLOT_BASE[slot] * TIER_MULT[tier]), pi: PI_TABLE[slot][tier], fx: { ...FX_TABLE[slot][tier] }, unlock: UNLOCKS[slot][tier], only,
      });
      const n = NAMES[slot];
      if (n.ev) { out.push(mk('ice', n.ice[tier])); out.push(mk('ev', n.ev[tier])); } else if (slot === 'exhaust') out.push(mk('ice', n.ice[tier])); else out.push(mk(undefined, n.ice[tier]));
    }
  }
  // rally alternatives at the same tier: longer travel and loose-surface grip, at a cost on tarmac
  out.push({ id: 'suspension.3.rally', slot: 'suspension', tier: 3, variant: 'rally', name: 'Rally long-travel suspension', blurb: 'Soft, tall and tough: far better on gravel and dirt, a little loose on tarmac.', baseCost: 12000, pi: 20, fx: { spring: 0.72, damper: 0.8, antiRoll: 0.7, grip: 0.0, travel: 1.9, ride: 0.07, offroadGrip: 0.12 }, unlock: { kind: 'circuit', circuit: 'pinewood_rally_stage', medal: 'bronze' } });
  out.push({ id: 'tires.3.rally', slot: 'tires', tier: 3, variant: 'rally', name: 'Rally gravel tyres', blurb: 'Deep tread. Bites on loose surfaces and in the wet, gives up a little on dry tarmac.', baseCost: 9000, pi: 22, fx: { grip: 0.02, offroadGrip: 0.18, wetSens: 0.7 }, unlock: { kind: 'circuit', circuit: 'pinewood_rally_stage', medal: 'bronze' } });
  out.push({ id: 'tires.3.wet', slot: 'tires', tier: 3, variant: 'wet', name: 'Wet-weather tyres', blurb: 'Grooved, soft and cool-running. Far less grip lost on a wet road.', baseCost: 9500, pi: 22, fx: { grip: 0.07, wetSens: 0.45 }, unlock: { kind: 'level', level: 6 } });
  return out;
}

export const PARTS: PartDef[] = build();
export const PART_BY_ID: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export function stockPart(slot: SlotId, pt: Powertrain): PartDef {
  return PARTS.find((p) => p.slot === slot && p.tier === 0 && (!p.only || p.only === pt))!;
}
/** the parts a car of this powertrain can take in one slot (stock included) */
export function partsFor(slot: SlotId, pt: Powertrain): PartDef[] {
  return PARTS.filter((p) => p.slot === slot && (!p.only || p.only === pt));
}
export function slotAvailable(slot: SlotId, pt: Powertrain): boolean {
  return partsFor(slot, pt).length > 0;
}
export function slotLabel(slot: SlotId, pt: Powertrain): string {
  const s = SLOTS.find((x) => x.id === slot)!;
  return pt === 'ev' && s.evLabel ? s.evLabel : s.label;
}
/** a plain-language line for an unlock condition */
export function unlockText(u: Unlock, objectiveTitle?: (id: string) => string | undefined, circuitName?: (id: string) => string): string {
  const cn = (id: string): string => circuitName?.(id) ?? id;
  switch (u.kind) {
    case 'start': return 'Available from the start';
    case 'level': return `Reach level ${u.level}`;
    case 'wins': return `Win ${u.count} events (gold medal or better)`;
    case 'medals': return `Earn ${u.count} ${u.min} medals or better`;
    case 'achievement': return `Achievement: ${ACH_NAMES[u.id] ?? u.id}`;
    case 'objective': return `Objective: ${objectiveTitle?.(u.id) ?? u.id}`;
    case 'circuit': return `${u.medal[0].toUpperCase()}${u.medal.slice(1)} medal at ${cn(u.circuit)}`;
  }
}
export const ACH_NAMES: Record<string, string> = {
  forth_first_lap: 'Ironport Circuit: First Lap', forth_race_win: 'King of the Great Lakes', forth_150_mph: '150 MPH Club', forth_coastal_explorer: 'West Coast Explorer',
  forth_first_delivery: 'First Drop', forth_courier_streak: 'Hot Streak', forth_full_garage: 'Collector',
};
