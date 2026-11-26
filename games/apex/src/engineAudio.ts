// Maps every vehicle (stock vs upgraded) to one of the 24 real engine-stand audio banks
// and matching 3D engine-bay architecture extracted from the 3D Vehicle Asset Library.
// Rule: quiet everyday cars stay quiet & appropriate when stock, and ONLY upgrade to
// aggressive/race engine audio banks when the player soups them up in Customization.
import manifest from './engineAudioManifest.json';
import type { EngineArch } from './engineModels';
import type { Archetype } from './garage/catalog';

export interface EngineBankMeta {
  id: string;
  label: string;
  arch: EngineArch;
  aggression: number; // 0 = quiet everyday, 1 = utility/refined, 2 = sport, 3 = muscle/super, 4 = hyper/race
  gain: number;
  redlineRpm: number;
  basePath: string;
  texUrl: string;
  sourceFile: string;
  slices: {
    idle: { start: number; centroidHz: number; f0Hz: number };
    mid: { start: number; centroidHz: number; f0Hz: number };
    high: { start: number; centroidHz: number; f0Hz: number };
    decel: { start: number };
  };
}

export const ENGINE_BANKS: Record<string, EngineBankMeta> = manifest.banks as unknown as Record<string, EngineBankMeta>;

/** Explicit stock engine bank per car ID so every hero and everyday car has its authentic voice. */
const STOCK_BANK_BY_CAR: Record<string, string> = {
  // Hero & High-Performance Race Cars (each mapped to its true mechanical architecture!)
  kestrel: 'sc_v8_blower',        // 6.2L Supercharged Foundry V8
  corsair: 'muscle_v8',           // 6.4L Cammed Widebody Muscle V8 (blower whine layered via spec.aspiration)
  vanguard: 'supercar_v12',       // 4.2L High-Rev Screaming Track GT (flat-plane race shriek)
  aurelia: 'supercar_v10',        // 5.2L Exotic Solari V10 howl
  kuronuma: 'perf_coupe_i6',      // 3.6L Twin-Turbo Straight-6 coupe
  sidewinder: 'sports_car_gt',    // 5.0L Carbon-Plenum NA GT V8
  veloce: 'hypercar_tt_v8',       // 4.5L High-Rev Flat-Plane Exotic Spyder V8
  apex_tcr: 'sports_sedan_20t',   // 2.0L Turbocharged Touring I4
  stratos_wrc: 'turbo_i5',        // Group-B / WRC Turbo Anti-Lag Rally Bark
  terracorsa: 'perf_coupe_i6',    // 4.0L High-Rev Naturally Aspirated Flat-6 (distinct flat-6 DNA)
  ironhide: 'muscle_v8',          // 7.0L Big-Block Detroit Muscle V8
  continental: 'pickup_v8',       // 1967 Classic Heritage Small-Block V8 burble
  legacy_gtr: 'perf_coupe_i6',    // 1975 3.0L Vintage Touring Inline-6 (authentic I6, not rotary)
  dunerunner: 'sc_v8_blower',     // Open-Header 6.2L Desert Trophy Buggy V8
  badlands: 'v6_suv_sport',       // 3.5L Twin-Turbo Baja Rally-Raid V6
  overland_suv: 'v8_lux_suv',     // 4.4L Dakar Overland V8
  kodiak: 'diesel_pickup',        // 6.6L Heavy Off-Road Diesel/Big-Block Truck
  titan_fx4: 'pickup_v8',         // 6.8L Long-Travel Trophy Truck V8
  // Distinct iconic street & emergency fleet voices
  vernon_police: 'muscle_v8',     // 5.7L High-Output Pursuit Interceptor V8
  valoris_sc420: 'rotary_twin',   // High-Revving Sport Coupe
  veloce_apex_suv: 'hypercar_tt_v8', // 4.0L Twin-Turbo Super-SUV V8
  aureon_seraph: 'v6_suv_sport',  // 3.0L Twin-Turbo Executive V6
  vertix_terrahatch: 'turbo_i5',  // AWD Hot-Hatch Rally Turbo
  kestrel_defender: 'v8_lux_suv', // 5.0L Twin-Turbo Armored SUV
  vectis_urban12: 'diesel_semi',  // 8.9L Heavy Transit Bus Diesel
  valkyrie_semi: 'diesel_semi',   // 14.8L Class-8 Semi Tractor Diesel
};

/** Per-car deterministic acoustic DNA so EVERY one of the 81 cars has a distinct exhaust tone, pitch, and mechanical character. */
export interface CarAcousticDna {
  /** Base pitch scale (0.86..1.18) derived from car ID, displacement, and redline */
  pitchScale: number;
  /** Exhaust header resonance shift (0.78..1.28) */
  exhaustShift: number;
  /** Intake plenum formant shift (0.80..1.25) */
  intakeShift: number;
  /** Harmonic brightness tilt (-0.28 warm/deep .. +0.32 raspy/exotic) */
  brightTilt: number;
  /** Idle cam lope depth multiplier (0.5..2.2) */
  lopeMult: number;
  /** Exhaust overrun / shift crackle bonus (-0.15..+0.35) */
  popDelta: number;
  /** Optional firing-order override (e.g. flat-6 boxer, flat-plane V8, vintage I6) */
  pulsesOverride?: number;
  subOrderOverride?: number;
  /** EV powertrain acoustic character */
  evVoice: 'commuter' | 'sport' | 'tri' | 'quad' | 'axial';
}

function hashId(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10000) / 10000;
}

const HERO_DNA_OVERRIDES: Record<string, Partial<CarAcousticDna>> = {
  kestrel:        { pitchScale: 0.96, exhaustShift: 0.92, intakeShift: 1.04, brightTilt: 0.14, lopeMult: 1.55, popDelta: 0.18 },
  corsair:        { pitchScale: 0.89, exhaustShift: 0.82, intakeShift: 0.90, brightTilt: -0.06, lopeMult: 2.1, popDelta: 0.22 },
  ironhide:       { pitchScale: 0.84, exhaustShift: 0.78, intakeShift: 0.84, brightTilt: -0.14, lopeMult: 2.2, popDelta: 0.16 },
  continental:    { pitchScale: 0.87, exhaustShift: 0.84, intakeShift: 0.86, brightTilt: -0.18, lopeMult: 1.75, popDelta: 0.08 },
  vernon_police:  { pitchScale: 0.93, exhaustShift: 0.88, intakeShift: 0.96, brightTilt: 0.05, lopeMult: 1.35, popDelta: 0.10 },
  sidewinder:     { pitchScale: 1.05, exhaustShift: 1.08, intakeShift: 1.08, brightTilt: 0.16, lopeMult: 1.15, popDelta: 0.22 },
  veloce:         { pitchScale: 1.14, exhaustShift: 1.22, intakeShift: 1.18, brightTilt: 0.28, lopeMult: 0.75, popDelta: 0.25, pulsesOverride: 4.0, subOrderOverride: 1.0 }, // crisp flat-plane V8!
  vanguard:       { pitchScale: 1.12, exhaustShift: 1.24, intakeShift: 1.20, brightTilt: 0.30, lopeMult: 0.8, popDelta: 0.28 },
  aurelia:        { pitchScale: 1.06, exhaustShift: 1.18, intakeShift: 1.16, brightTilt: 0.26, lopeMult: 0.85, popDelta: 0.26 },
  terracorsa:     { pitchScale: 1.10, exhaustShift: 1.16, intakeShift: 1.14, brightTilt: 0.22, lopeMult: 1.1, popDelta: 0.24, pulsesOverride: 3.0, subOrderOverride: 0.667 }, // iconic 4.0L Flat-6 wail!
  legacy_gtr:     { pitchScale: 1.02, exhaustShift: 1.04, intakeShift: 1.10, brightTilt: 0.18, lopeMult: 1.4, popDelta: 0.22, pulsesOverride: 3.0, subOrderOverride: 0.5 },
  kuronuma:       { pitchScale: 0.98, exhaustShift: 1.06, intakeShift: 1.02, brightTilt: 0.14, lopeMult: 1.0, popDelta: 0.28 },
  stratos_wrc:    { pitchScale: 1.08, exhaustShift: 1.12, intakeShift: 1.15, brightTilt: 0.24, lopeMult: 1.5, popDelta: 0.35 },
  apex_tcr:       { pitchScale: 1.12, exhaustShift: 1.14, intakeShift: 1.12, brightTilt: 0.20, lopeMult: 1.0, popDelta: 0.30 },
  dunerunner:     { pitchScale: 0.94, exhaustShift: 1.16, intakeShift: 1.08, brightTilt: 0.26, lopeMult: 1.9, popDelta: 0.30 },
  titan_fx4:      { pitchScale: 0.86, exhaustShift: 0.84, intakeShift: 0.92, brightTilt: 0.08, lopeMult: 1.8, popDelta: 0.14 },
  kodiak:         { pitchScale: 0.82, exhaustShift: 0.80, intakeShift: 0.85, brightTilt: -0.10, lopeMult: 1.4, popDelta: -0.05 },
  // Distinct EV acoustic identities
  helios:         { pitchScale: 1.24, exhaustShift: 1.28, intakeShift: 1.24, brightTilt: 0.32, evVoice: 'axial' },
  solstice_r:     { pitchScale: 1.16, exhaustShift: 1.20, intakeShift: 1.18, brightTilt: 0.24, evVoice: 'quad' },
  solstice:       { pitchScale: 1.10, exhaustShift: 1.14, intakeShift: 1.12, brightTilt: 0.16, evVoice: 'quad' },
  voltstrike:     { pitchScale: 1.02, exhaustShift: 1.06, intakeShift: 1.05, brightTilt: 0.10, evVoice: 'tri' },
  zephyr_emotion: { pitchScale: 0.95, exhaustShift: 0.96, intakeShift: 0.98, brightTilt: 0.02, evVoice: 'sport' },
  zephyr_titan_ev:{ pitchScale: 0.84, exhaustShift: 0.86, intakeShift: 0.88, brightTilt: -0.12, evVoice: 'sport' },
  zephyr_majestic_ev: { pitchScale: 0.88, exhaustShift: 0.90, intakeShift: 0.92, brightTilt: -0.06, evVoice: 'tri' },
  nexis_e03:      { pitchScale: 0.92, exhaustShift: 0.88, intakeShift: 0.90, brightTilt: -0.15, evVoice: 'commuter' },
  zephyr_spark_ev:{ pitchScale: 1.04, exhaustShift: 0.94, intakeShift: 0.96, brightTilt: -0.08, evVoice: 'commuter' },
};

export function carAcousticDna(carId: string, peakHp = 350, redlineRpm = 7000, engineText = ''): CarAcousticDna {
  const h1 = hashId(carId + ':pitch');
  const h2 = hashId(carId + ':exh');
  const h3 = hashId(carId + ':int');
  const h4 = hashId(carId + ':brt');
  // Natural displacement & redline physics nudge: big-displacement low-rev = deeper; small high-rev = tighter/higher
  const redFactor = Math.max(-0.08, Math.min(0.10, (redlineRpm - 6800) / 22000));
  const hpFactor = Math.max(-0.06, Math.min(0.08, (peakHp - 420) / 4800));
  const isFlat = /flat-6|boxer/i.test(engineText);
  const isDiesel = /diesel/i.test(engineText);
  const base: CarAcousticDna = {
    pitchScale: Math.max(0.80, Math.min(1.24, 0.93 + h1 * 0.16 + redFactor - (isDiesel ? 0.07 : 0))),
    exhaustShift: Math.max(0.76, Math.min(1.28, 0.88 + h2 * 0.24 + hpFactor)),
    intakeShift: Math.max(0.78, Math.min(1.25, 0.90 + h3 * 0.20 + redFactor)),
    brightTilt: Math.max(-0.25, Math.min(0.32, (h4 - 0.45) * 0.34 + hpFactor)),
    lopeMult: 0.85 + h2 * 0.65,
    popDelta: (h3 - 0.5) * 0.14,
    ...(isFlat ? { pulsesOverride: 3.0, subOrderOverride: 0.667 } : {}),
    evVoice: peakHp >= 1300 ? 'axial' : peakHp >= 1050 ? 'quad' : peakHp >= 800 ? 'tri' : peakHp >= 420 ? 'sport' : 'commuter',
  };
  const ov = HERO_DNA_OVERRIDES[carId];
  return ov ? { ...base, ...ov } : base;
}

/** Upgrade progression ladders: [stock, street/mild, sport, race, elohim] */
const UPGRADE_LADDERS: Record<string, [string, string, string, string, string]> = {
  // Everyday quiet cars -> stay quiet at stock/street, wake up only when souped up!
  i4_commuter:      ['i4_commuter',      'hatch_i4',         'sports_sedan_20t', 'turbo_i5',        'perf_coupe_i6'],
  hatch_i4:         ['hatch_i4',         'hatch_i4',         'sports_sedan_20t', 'turbo_i5',        'rotary_twin'],
  hybrid_i4:        ['hybrid_i4',        'hybrid_i4',        'sports_sedan_20t', 'perf_coupe_i6',   'sports_car_gt'],
  v6_sedan:         ['v6_sedan',         'v6_sedan',         'sports_sedan_20t', 'perf_coupe_i6',   'sports_car_gt'],
  suv_v6_stock:     ['suv_v6_stock',     'crossover_turbo',  'v6_suv_sport',     'v8_lux_suv',      'sc_v8_blower'],
  crossover_turbo:  ['crossover_turbo',  'crossover_turbo',  'v6_suv_sport',     'v8_lux_suv',      'sc_v8_blower'],
  v6_suv_sport:     ['v6_suv_sport',     'v6_suv_sport',     'v8_lux_suv',       'sc_v8_blower',    'hypercar_tt_v8'],
  v8_lux_suv:       ['v8_lux_suv',       'v8_lux_suv',       'muscle_v8',        'sc_v8_blower',    'hypercar_tt_v8'],
  pickup_v8:        ['pickup_v8',        'pickup_v8',        'muscle_v8',        'sc_v8_blower',    'sc_v8_blower'],
  diesel_van:       ['diesel_van',       'diesel_van',       'diesel_pickup',    'diesel_semi',     'v8_lux_suv'],
  diesel_pickup:    ['diesel_pickup',    'diesel_pickup',    'diesel_truck_a',   'diesel_semi',     'sc_v8_blower'],
  diesel_truck_a:   ['diesel_truck_a',   'diesel_truck_a',   'diesel_semi',      'diesel_semi',     'muscle_v8'],
  diesel_semi:      ['diesel_semi',      'diesel_semi',      'diesel_semi',      'diesel_semi',     'diesel_semi'],
  // Dedicated race / performance cars keep their signature family & peak into exotic/megacar on Elohim tier
  sports_sedan_20t: ['sports_sedan_20t', 'sports_sedan_20t', 'turbo_i5',         'turbo_i5',        'perf_coupe_i6'],
  turbo_i5:         ['turbo_i5',         'turbo_i5',         'turbo_i5',         'perf_coupe_i6',   'hypercar_tt_v8'],
  rotary_twin:      ['rotary_twin',      'rotary_twin',      'rotary_twin',      'rotary_twin',     'rotary_twin'],
  perf_coupe_i6:    ['perf_coupe_i6',    'perf_coupe_i6',    'perf_coupe_i6',    'sports_car_gt',   'hypercar_tt_v8'],
  muscle_v8:        ['muscle_v8',        'muscle_v8',        'muscle_v8',        'sc_v8_blower',    'sc_v8_blower'],
  sc_v8_blower:     ['sc_v8_blower',     'sc_v8_blower',     'sc_v8_blower',     'sc_v8_blower',    'megacar_w16'],
  sports_car_gt:    ['sports_car_gt',    'sports_car_gt',    'sports_car_gt',    'supercar_v10',    'supercar_v12'],
  supercar_v10:     ['supercar_v10',     'supercar_v10',     'supercar_v10',     'supercar_v12',    'megacar_w16'],
  hypercar_tt_v8:   ['hypercar_tt_v8',   'hypercar_tt_v8',   'hypercar_tt_v8',   'hypercar_tt_v8',  'megacar_w16'],
  supercar_v12:     ['supercar_v12',     'supercar_v12',     'supercar_v12',     'supercar_v12',    'megacar_w16'],
  megacar_w16:      ['megacar_w16',      'megacar_w16',      'megacar_w16',      'megacar_w16',     'megacar_w16'],
};

export function stockSoundBankFor(carId: string, archetype: Archetype, powertrain: 'ice' | 'ev', explicitBank?: string): string | undefined {
  if (powertrain === 'ev') return undefined;
  if (explicitBank && ENGINE_BANKS[explicitBank]) return explicitBank;
  if (STOCK_BANK_BY_CAR[carId]) return STOCK_BANK_BY_CAR[carId];
  switch (archetype) {
    case 'track': return 'hypercar_tt_v8';
    case 'gt': return 'sports_car_gt';
    case 'muscle': return 'muscle_v8';
    case 'classic': return 'muscle_v8';
    case 'touring': return 'sports_sedan_20t';
    case 'rally': return 'turbo_i5';
    case 'buggy': return 'muscle_v8';
    case 'truck': return 'pickup_v8';
    case 'suv': return 'suv_v6_stock';
    case 'sedan': return 'v6_sedan';
    case 'compact': return 'i4_commuter';
    case 'van': return 'diesel_van';
    case 'commercial': return 'diesel_truck_a';
    default: return 'i4_commuter';
  }
}

/**
 * Computes the active sound bank and upgrade intensity (0..4) based on fitted engine,
 * forced-induction, and exhaust tiers. Stock everyday cars stay quiet; fitting Sport/Race/Elohim
 * performance hardware unlocks throatier, higher-performance engine audio banks.
 */
export function resolveUpgradedSoundBank(
  stockBank: string | undefined,
  engineTier: number,
  inductionTier: number,
  exhaustTier: number
): { soundBank?: string; soundUpgradeLevel: number } {
  if (!stockBank || !ENGINE_BANKS[stockBank]) return { soundBank: undefined, soundUpgradeLevel: 0 };
  // Weighted customization score: exhaust + induction + engine upgrades drive sound escalation
  const score = exhaustTier * 0.45 + inductionTier * 0.30 + engineTier * 0.25;
  const level = Math.min(4, Math.max(0, Math.round(score)));
  const ladder = UPGRADE_LADDERS[stockBank];
  const bank = ladder ? ladder[level] : stockBank;
  return { soundBank: bank, soundUpgradeLevel: level };
}

export function getEngineBank(id?: string): EngineBankMeta | null {
  if (!id) return null;
  return ENGINE_BANKS[id] ?? null;
}
