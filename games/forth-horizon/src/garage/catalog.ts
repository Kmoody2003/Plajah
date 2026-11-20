// The 24-car roster: who they are, what they cost, how they are unlocked, and the physics spec each one drives with.
// The Kestrel Sovereign and Aurelia Zephyr use their hand-built specs. The rest are generated from their published numbers (power, weight, drivetrain) on top of an
// archetype (GT, muscle, rally, truck, ...), so all of them handle differently. Until a car has its own 3D body it drives with the Sovereign's (see `body`).
import { CARS, type CarSpec } from '../manufacturers';
import { stockSoundBankFor } from '../engineAudio';
import type { Powertrain, Unlock } from './parts';

export type Archetype = 'gt' | 'track' | 'muscle' | 'touring' | 'classic' | 'rally' | 'buggy' | 'truck' | 'suv' | 'ev' | 'sedan' | 'compact' | 'van' | 'commercial';
export type Aspiration = CarSpec['engine']['aspiration'];
export type Body = 'sovereign' | 'scan' | 'procedural' | 'pending';

export interface CarDef {
  id: string;
  make: string;
  name: string;
  pi: number;                       // stock performance index, sets the class
  drivetrain: 'RWD' | 'AWD' | 'FWD';
  powertrain: Powertrain;
  aspiration: Aspiration;
  engineText: string;
  hp: number;
  nm?: number;
  kg: number;
  archetype: Archetype;
  price: number;                    // credits; 0 = a starter
  unlock: Unlock;
  starter?: boolean;                // the car every new player begins with (the Kestrel Sovereign GT-R)
  body: Body;
  summary: string;
  sheetUrl: string;
  videoUrl?: string;
  glbUrl?: string;
  /** Optional explicit stock engine-stand audio bank ID (from 24 real engine videos) */
  soundBank?: string;
  /** True when this vehicle also spawns in everyday Ironport street traffic */
  traffic?: boolean;
}

const CA = '/ironport-assets/concept-art/';
const RR = '/racer-refs/';

export const CAR_DEFS: CarDef[] = [
  // cheap classics
  { id: 'continental', make: 'Meridian', name: 'Continental 67', pi: 510, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: 'Classic V8', hp: 390, kg: 1640, archetype: 'classic', price: 18000, unlock: { kind: 'start' }, body: 'pending', summary: '1967 Motor City heritage fastback cruiser. Forgiving, heavy, and a lot of fun sideways.', sheetUrl: CA + 'media-generation-meridian-continental-67-v2-0-4c444522-57e5-45b3-a36f-f3d01c5e6a3d.webp' },
  { id: 'legacy_gtr', make: 'Legacy', name: 'GT-R 1975', pi: 610, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '3.0L I6', hp: 340, kg: 1120, archetype: 'classic', price: 32000, unlock: { kind: 'start' }, body: 'pending', summary: '1975 vintage touring racer. Light and honest, with a great engine note.', sheetUrl: RR + 'Vintage_racecar_design_sheet_52244cfd.jpg' },
  { id: 'overland_suv', make: 'Kestrel', name: 'Overland 4x4', pi: 600, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '4.4L V8', hp: 460, kg: 2410, archetype: 'suv', price: 34000, unlock: { kind: 'start' }, body: 'pending', summary: 'Dakar-spec overland 4x4. Heavy, tough and happy on any surface.', sheetUrl: RR + 'Dakar_SUV_design_sheet_4d47548a.jpg' },
  // B
  { id: 'kodiak', make: 'Meridian', name: 'Kodiak 1500', pi: 620, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '6.6L V8', hp: 490, kg: 2350, archetype: 'truck', price: 38000, unlock: { kind: 'level', level: 2 }, body: 'pending', summary: 'Full-size Dune Sea and Baja off-road desert truck.', sheetUrl: CA + 'media-generation-meridian-kodiak-1500-0-aab12f49-d1b3-4259-8661-a7b4a16370d1.webp' },
  { id: 'titan_fx4', make: 'Titan Ridge', name: 'FX4', pi: 640, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '6.8L V8', hp: 580, kg: 2280, archetype: 'truck', price: 42000, unlock: { kind: 'level', level: 3 }, body: 'pending', summary: 'Long-travel Dune Sea trophy truck.', sheetUrl: RR + 'Titan_Ridge_FX4_trophy_truck_dde1c24e.jpg' },
  // A
  { id: 'dunerunner', make: 'DuneRunner', name: 'V8 Buggy', pi: 710, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '6.2L V8', hp: 610, kg: 1390, archetype: 'buggy', price: 76000, unlock: { kind: 'level', level: 4 }, body: 'pending', summary: 'Tubular desert and Silver Lake dune buggy.', sheetUrl: RR + 'DuneRunner_V8_Buggy_design_turna…_29e94c61.jpg' },
  { id: 'badlands', make: 'Kestrel', name: 'Badlands XT', pi: 720, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Twin-Turbo', engineText: '3.5L Twin-Turbo V6', hp: 540, kg: 2040, archetype: 'rally', price: 80000, unlock: { kind: 'level', level: 5 }, body: 'pending', summary: 'Long-travel dune and forest rally-raid runner.', sheetUrl: CA + 'media-generation-kestrel-badlands-xt-0-3b3a5216-2957-4519-8eae-7ee0ab0d3aa5.webp' },
  { id: 'ironhide', make: 'Meridian', name: 'Ironhide 440', pi: 740, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '7.0L V8', hp: 560, kg: 1720, archetype: 'muscle', price: 88000, unlock: { kind: 'level', level: 5 }, body: 'pending', summary: 'Retro-modern Detroit brawler on a heavy steel unibody.', sheetUrl: CA + 'media-generation-meridian-ironhide-440-v2-0-c0626eaf-04fb-47a7-bd4c-fa42eaa4eb2a.webp' },
  { id: 'apex_tcr', make: 'Apex', name: 'TCR Spec-2', pi: 750, drivetrain: 'FWD', powertrain: 'ice', aspiration: 'Twin-Turbo', engineText: '2.0L Turbo I4', hp: 380, kg: 1210, archetype: 'touring', price: 82000, unlock: { kind: 'level', level: 6 }, body: 'scan', summary: 'Homologated touring car for the Ironport Grand Circuit.', sheetUrl: RR + 'Apex_TCR_Spec-2_touring_car_57cda8b3.jpg' },
  { id: 'corsair', make: 'Ironport', name: 'Corsair RS', pi: 760, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Supercharged', engineText: '6.4L V8', hp: 640, kg: 1620, archetype: 'muscle', price: 96000, unlock: { kind: 'level', level: 6 }, body: 'scan', summary: 'Widebody Detroit muscle coupe.', sheetUrl: RR + 'Ironport_Corsair_RS_muscle_car_1eef7ba7.jpg' },
  { id: 'zephyr_emotion', make: 'Zephyr', name: 'E-Motion', pi: 770, drivetrain: 'AWD', powertrain: 'ev', aspiration: 'Electric', engineText: 'Dual-Motor EV', hp: 690, kg: 1860, archetype: 'ev', price: 100000, unlock: { kind: 'level', level: 7 }, body: 'scan', summary: 'Aerodynamic electric fastback sedan.', sheetUrl: RR + 'Zephyr_E-Motion_design_turnaroun…_3d23caa3.jpg' },
  { id: 'sidewinder', make: 'Kestrel', name: 'Sidewinder', pi: 780, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '5.0L V8', hp: 610, kg: 1420, archetype: 'gt', price: 104000, unlock: { kind: 'level', level: 7 }, body: 'scan', summary: 'Lightweight drift and street-circuit coupe.', sheetUrl: CA + 'media-generation-kestrel-sidewinder-v2-0-4fdafafd-313a-4c7d-95a5-cdac76c13ddd.webp' },
  { id: 'terracorsa', make: 'Aurelia', name: 'Terra Corsa', pi: 790, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '4.0L Flat-6', hp: 520, kg: 1340, archetype: 'rally', price: 110000, unlock: { kind: 'level', level: 8 }, body: 'scan', summary: 'Lifted gravel and Pinewood Forest rally supercar.', sheetUrl: CA + 'media-generation-aurelia-terra-corsa-0-fa3d02cf-8594-4669-b613-bd4eb9ae125e.webp' },
  { id: 'stratos_wrc', make: 'Veloce', name: 'Stratos WRC', pi: 790, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Twin-Turbo', engineText: '1.6L Turbo I4', hp: 420, kg: 1190, archetype: 'rally', price: 112000, unlock: { kind: 'level', level: 8 }, body: 'scan', summary: 'Pinewood Forest and gravel rally hatch.', sheetUrl: RR + 'Veloce_Stratos_WRC_rally_car_853f35e3.jpg' },
  // S1
  { id: 'kuronuma', make: 'Kuronuma', name: 'GT-6', pi: 830, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Twin-Turbo', engineText: '3.6L Twin-Turbo', hp: 680, kg: 1360, archetype: 'gt', price: 190000, unlock: { kind: 'level', level: 10 }, body: 'scan', summary: 'Drift-tuned twin-turbo coupe built for Ironport night streets.', sheetUrl: RR + 'Kuronuma_GT-6_coupe_design_sheet_80915908.jpg' },
  { id: 'kestrel', make: 'Kestrel', name: 'Sovereign GT-R', pi: 840, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Supercharged', engineText: '6.2L SC V8', hp: 760, nm: 890, kg: 1480, archetype: 'gt', price: 0, unlock: { kind: 'start' }, starter: true, body: 'sovereign', summary: 'The hero American muscle-GT supercar forged in Ironport. Front-mid V8, widebody carbon aero.', sheetUrl: CA + 'media-generation-kestrel-sovereign-gtr-0-840ec063-92dd-482b-94c0-b7fba02e715a.webp', videoUrl: RR + 'Kestrel_Sovereign_GT-R_turntable…_c2e6795d.mp4' },
  { id: 'voltstrike', make: 'Halcyon', name: 'Voltstrike S', pi: 860, drivetrain: 'AWD', powertrain: 'ev', aspiration: 'Electric', engineText: 'Tri-Motor EV', hp: 920, kg: 1820, archetype: 'ev', price: 250000, unlock: { kind: 'level', level: 12 }, body: 'scan', summary: 'Instant-torque electric performance sedan for the Lakeshore sweepers.', sheetUrl: CA + 'media-generation-halcyon-voltstrike-s-v2-0-8e97db1d-15a2-4c57-b3a0-782ed19051f8.webp' },
  { id: 'veloce', make: 'Aurelia', name: 'Veloce Spyder', pi: 870, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '4.5L V8', hp: 710, kg: 1310, archetype: 'gt', price: 260000, unlock: { kind: 'level', level: 12 }, body: 'scan', summary: 'Open-top coastal GT built for the Lakeshore Bluffs.', sheetUrl: CA + 'media-generation-aurelia-veloce-spyder-0-085cdb7b-af49-41e2-b36a-75ff2d04a8f1.webp' },
  // S2
  { id: 'aurelia', make: 'Aurelia', name: 'Zephyr Apex', pi: 920, drivetrain: 'AWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '5.2L V10', hp: 820, nm: 690, kg: 1260, archetype: 'track', price: 400000, unlock: { kind: 'level', level: 15 }, body: 'scan', summary: 'Carbon-monocoque track weapon with a teardrop canopy and swan-neck rear wing.', sheetUrl: CA + 'media-generation-aurelia-zephyr-apex-0-40b6062a-8596-4f21-bcab-7b1fd984df89.webp' },
  { id: 'vanguard', make: 'Vanguard', name: 'Apex GT', pi: 930, drivetrain: 'RWD', powertrain: 'ice', aspiration: 'Naturally Aspirated', engineText: '4.2L V8', hp: 840, kg: 1240, archetype: 'track', price: 420000, unlock: { kind: 'level', level: 16 }, body: 'scan', summary: 'Flagship circuit GT with an active diffuser and glowing twin-exit exhaust.', sheetUrl: RR + 'Vanguard_Apex_GT_rear_view_ffe2fcfd.jpg' },
  { id: 'solstice', make: 'Halcyon', name: 'Solstice GT', pi: 940, drivetrain: 'AWD', powertrain: 'ev', aspiration: 'Electric', engineText: 'Quad-Motor EV', hp: 1180, kg: 1690, archetype: 'ev', price: 450000, unlock: { kind: 'level', level: 17 }, body: 'scan', summary: 'Active-aero electric grand tourer.', sheetUrl: CA + 'media-generation-halcyon-solstice-gt-v2-0-5ede5a8e-34af-4199-aebc-171f7faceca5.webp' },
  { id: 'solstice_r', make: 'Solstice', name: 'Aero R', pi: 950, drivetrain: 'AWD', powertrain: 'ev', aspiration: 'Electric', engineText: 'Track EV', hp: 1240, kg: 1580, archetype: 'ev', price: 480000, unlock: { kind: 'level', level: 18 }, body: 'scan', summary: 'Track-spec aero evolution of the Solstice GT.', sheetUrl: RR + 'Solstice_Aero_R_rear_view_572ac645.jpg' },
  // X
  { id: 'helios', make: 'Halcyon', name: 'Helios X1', pi: 999, drivetrain: 'AWD', powertrain: 'ev', aspiration: 'Electric', engineText: 'Axial-Flux EV', hp: 1450, kg: 1410, archetype: 'ev', price: 900000, unlock: { kind: 'wins', count: 20 }, body: 'scan', summary: 'The hyper-experimental flagship from the Legend of Elohim future division.', sheetUrl: CA + 'media-generation-halcyon-helios-x1-0-22e19dd0-6992-416a-813d-0154264e4df7.webp' },
];

export const CAR_BY_ID: Record<string, CarDef> = Object.fromEntries(CAR_DEFS.map((c) => [c.id, c]));

export type ClassLetter = 'D' | 'C' | 'B' | 'A' | 'S1' | 'S2' | 'X';
export const CLASS_COLORS: Record<ClassLetter, string> = { D: '#7bd88f', C: '#4cc9f0', B: '#ffd166', A: '#ff9f1c', S1: '#ff5d73', S2: '#c77dff', X: '#00f5d4' };
export function classFor(pi: number): ClassLetter {
  return pi < 500 ? 'D' : pi < 600 ? 'C' : pi < 700 ? 'B' : pi < 800 ? 'A' : pi < 900 ? 'S1' : pi < 990 ? 'S2' : 'X';
}
export const classLabel = (pi: number): string => `${classFor(pi)} · ${Math.round(pi)}`;

interface Arche { grip: number; aero: number; wheelbase: number; trackWidth: number; wheelRadius: number; length: number; width: number; height: number; topScale: number; vehicleClass: NonNullable<CarSpec['vehicleClass']>;
  susp?: { springRateNm: number; damperNsM: number; antiRollFactor: number; travelM: number; rideHeightM: number }; steer?: number; offroadGrip?: number; cg?: number }
const ARCHE: Record<Archetype, Arche> = {
  gt: { grip: 1.11, aero: 3.6, wheelbase: 2.74, trackWidth: 1.66, wheelRadius: 0.35, length: 4.68, width: 1.96, height: 1.28, topScale: 1.03, vehicleClass: 'gt' },
  track: { grip: 1.28, aero: 5.8, wheelbase: 2.68, trackWidth: 1.7, wheelRadius: 0.34, length: 4.54, width: 1.98, height: 1.18, topScale: 1.12, vehicleClass: 'track' },
  muscle: { grip: 1.02, aero: 2.1, wheelbase: 2.78, trackWidth: 1.64, wheelRadius: 0.35, length: 4.8, width: 1.96, height: 1.34, topScale: 0.99, vehicleClass: 'muscle' },
  touring: { grip: 1.08, aero: 2.6, wheelbase: 2.62, trackWidth: 1.6, wheelRadius: 0.33, length: 4.5, width: 1.86, height: 1.3, topScale: 0.96, vehicleClass: 'gt' },
  classic: { grip: 0.91, aero: 0.6, wheelbase: 2.6, trackWidth: 1.54, wheelRadius: 0.34, length: 4.5, width: 1.76, height: 1.32, topScale: 0.90, vehicleClass: 'muscle', steer: 0.5, susp: { springRateNm: 42000, damperNsM: 5400, antiRollFactor: 0.5, travelM: 0.16, rideHeightM: 0.13 } },
  rally: { grip: 1.03, aero: 1.1, wheelbase: 2.6, trackWidth: 1.64, wheelRadius: 0.36, length: 4.4, width: 1.88, height: 1.4, topScale: 0.93, vehicleClass: 'rally', offroadGrip: 0.06, susp: { springRateNm: 40000, damperNsM: 5800, antiRollFactor: 0.5, travelM: 0.24, rideHeightM: 0.2 } },
  buggy: { grip: 0.98, aero: 0.6, wheelbase: 2.55, trackWidth: 1.72, wheelRadius: 0.4, length: 4.1, width: 2.0, height: 1.5, topScale: 0.91, vehicleClass: 'buggy', offroadGrip: 0.08, susp: { springRateNm: 36000, damperNsM: 5200, antiRollFactor: 0.45, travelM: 0.28, rideHeightM: 0.24 } },
  truck: { grip: 0.89, aero: 0.5, wheelbase: 3.1, trackWidth: 1.8, wheelRadius: 0.42, length: 5.5, width: 2.1, height: 1.9, topScale: 0.84, vehicleClass: 'truck', offroadGrip: 0.07, cg: 0.78, susp: { springRateNm: 52000, damperNsM: 7200, antiRollFactor: 0.7, travelM: 0.24, rideHeightM: 0.22 } },
  suv: { grip: 0.92, aero: 0.7, wheelbase: 2.95, trackWidth: 1.7, wheelRadius: 0.39, length: 4.9, width: 1.95, height: 1.8, topScale: 0.85, vehicleClass: 'truck', offroadGrip: 0.04, cg: 0.72, susp: { springRateNm: 54000, damperNsM: 7000, antiRollFactor: 0.7, travelM: 0.22, rideHeightM: 0.2 } },
  ev: { grip: 1.12, aero: 3.4, wheelbase: 2.84, trackWidth: 1.66, wheelRadius: 0.35, length: 4.8, width: 1.96, height: 1.36, topScale: 1.04, vehicleClass: 'ev' },
  sedan: { grip: 0.91, aero: 0.7, wheelbase: 2.82, trackWidth: 1.60, wheelRadius: 0.34, length: 4.85, width: 1.86, height: 1.46, topScale: 0.84, vehicleClass: 'gt', susp: { springRateNm: 44000, damperNsM: 5600, antiRollFactor: 0.60, travelM: 0.16, rideHeightM: 0.15 } },
  compact: { grip: 0.89, aero: 0.5, wheelbase: 2.56, trackWidth: 1.54, wheelRadius: 0.31, length: 4.05, width: 1.78, height: 1.48, topScale: 0.79, vehicleClass: 'gt', susp: { springRateNm: 40000, damperNsM: 5200, antiRollFactor: 0.56, travelM: 0.15, rideHeightM: 0.14 } },
  van: { grip: 0.83, aero: 0.3, wheelbase: 3.25, trackWidth: 1.74, wheelRadius: 0.37, length: 5.45, width: 2.04, height: 2.32, topScale: 0.74, vehicleClass: 'truck', cg: 0.84, susp: { springRateNm: 58000, damperNsM: 7600, antiRollFactor: 0.72, travelM: 0.20, rideHeightM: 0.19 } },
  commercial: { grip: 0.78, aero: 0.2, wheelbase: 4.10, trackWidth: 1.95, wheelRadius: 0.48, length: 6.90, width: 2.38, height: 2.95, topScale: 0.68, vehicleClass: 'truck', cg: 1.05, susp: { springRateNm: 76000, damperNsM: 9400, antiRollFactor: 0.78, travelM: 0.22, rideHeightM: 0.26 } },
};

/** peak torque when the maker does not give it */
export function estimateNm(c: CarDef): number {
  if (c.nm) return c.nm;
  return Math.round(c.hp * (c.powertrain === 'ev' ? 1.75 : c.aspiration === 'Naturally Aspirated' ? 0.95 : 1.2));
}

const ICE_CURVES: Record<string, CarSpec['engine']['torqueCurve']> = {
  'Naturally Aspirated': [0.56, 0.74, 0.88, 0.97, 1.0, 0.93],
  Supercharged: [0.68, 0.88, 0.98, 1.0, 0.94, 0.82],
  'Twin-Turbo': [0.5, 0.82, 1.0, 0.99, 0.92, 0.8],
  Electric: [1.0, 1.0, 0.98, 0.92, 0.84, 0.74],
};

/** the stock physics spec of a car */
export function stockSpec(def: CarDef): CarSpec {
  // The physics was tuned on the Sovereign with the "sport" suspension (68 kN/m springs, 8.6 kN·s/m dampers: a damping ratio that settles the body without ringing).
  // Every car keeps that ratio, so a new car can never be badly underdamped.
  const SPORT = { springRateNm: 68000, damperNsM: 8600, antiRollFactor: 0.85, travelM: 0.13, rideHeightM: 0.12 };
  const bank = stockSoundBankFor(def.id, def.archetype, def.powertrain, def.soundBank);
  if (def.id === 'kestrel') { const k = structuredClone(CARS.kestrel); k.suspension = { ...k.suspension, ...SPORT }; k.engine.soundBank = bank; k.engine.soundUpgradeLevel = 0; return k; }
  if (def.id === 'aurelia') { const k = structuredClone(CARS.aurelia); k.suspension = { ...k.suspension, damperNsM: Math.round(k.suspension.springRateNm * 0.1265) }; k.engine.soundBank = bank; k.engine.soundUpgradeLevel = 0; return k; }
  const a = ARCHE[def.archetype], base = { ...CARS.kestrel, suspension: { ...CARS.kestrel.suspension, ...SPORT } };
  const pw = def.hp / def.kg;
  const top = Math.min(94.5, Math.max(50.5, (81.5 + 30 * Math.log(Math.max(0.06, pw) / 0.513)) * a.topScale));
  const brakeTierMult = def.pi >= 900 ? 1.42 : def.pi >= 800 ? 1.24 : def.pi >= 700 ? 1.10 : def.pi >= 600 ? 0.96 : 0.84;
  const ev = def.powertrain === 'ev';
  const redline = ev ? 8000 : def.aspiration === 'Twin-Turbo' ? 7000 : def.hp / def.kg > 0.55 ? 8200 : 7000;
  const awdBonus = def.drivetrain === 'AWD' ? 0.03 : 0;
  return {
    ...structuredClone(base),
    id: def.id,
    manufacturer: def.make, model: def.name, origin: 'Forth America', tagline: def.summary,
    classLabel: classLabel(def.pi),
    length: a.length, width: a.width, height: a.height, wheelbase: a.wheelbase, trackWidth: a.trackWidth, wheelRadius: a.wheelRadius,
    massKg: def.kg, cgHeightM: a.cg, vehicleClass: a.vehicleClass, drivetrain: def.drivetrain,
    topSpeedMps: top, corneringGrip: a.grip + awdBonus, aeroDownforce: a.aero, steerMaxRad: a.steer ? base.steerMaxRad : base.steerMaxRad,
    offroadGrip: a.offroadGrip ?? 0, wetSensitivity: 1,
    engine: {
      code: def.id.toUpperCase().slice(0, 8), name: def.engineText, layout: def.engineText, displacementL: 0, aspiration: def.aspiration,
      peakHp: def.hp, peakTorqueNm: estimateNm(def), idleRpm: ev ? 1000 : 900, redlineRpm: redline,
      torqueCurve: [...ICE_CURVES[def.aspiration]] as CarSpec['engine']['torqueCurve'], pitchBaseHz: ev ? 60 : 40 + Math.min(20, def.hp / 60),
      soundBank: bank,
      soundUpgradeLevel: 0,
    },
    suspension: { ...base.suspension, ...(a.susp ?? {}), architecture: 'Stock' },
    brakes: { ...base.brakes, systemName: def.pi >= 900 ? 'Carbon-Ceramic' : def.pi >= 800 ? '6-Piston Sport' : 'Stock', maxTorqueNm: Math.round((2400 + def.kg * 1.75) * brakeTierMult), rotorDiameterMm: 340 + Math.round(def.kg / 40) },
  };
}
