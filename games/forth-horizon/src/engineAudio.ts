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
  // Hero & High-Performance Race Cars
  kestrel: 'sc_v8_blower',
  corsair: 'sc_v8_blower',
  vanguard: 'hypercar_tt_v8',
  aurelia: 'supercar_v10',
  kuronuma: 'perf_coupe_i6',
  sidewinder: 'sports_car_gt',
  veloce: 'sports_car_gt',
  apex_tcr: 'sports_sedan_20t',
  stratos_wrc: 'turbo_i5',
  terracorsa: 'sports_car_gt',
  ironhide: 'muscle_v8',
  continental: 'muscle_v8',
  legacy_gtr: 'rotary_twin',
  dunerunner: 'muscle_v8',
  badlands: 'v6_suv_sport',
  overland_suv: 'v8_lux_suv',
  kodiak: 'diesel_pickup',
  titan_fx4: 'pickup_v8',
};

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
