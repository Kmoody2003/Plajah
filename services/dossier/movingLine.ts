/**
 * Pure logic for the Ford "Moving Line" experience: the chassis-time figures, the scrub mapping and the
 * formatting. The two chassis times are the documented endpoints; everything between is interpolation
 * and the UI says so.
 */
import type { Claim } from './dossierTypes';

/**
 * Chassis assembly labour time in minutes: 12 h 28 min (the best stationary average, Ford's own figure in My Life and
 * Work, ledger c-chassis-1228) to 1 h 33 min (early 1914, c-93min). The often-repeated 12 h 8 min (728) is a secondary
 * figure that differs from Ford's text by 20 minutes; it is kept in the ledger as c-chassis-728 (contested) and not used here.
 */
export const CHASSIS_BEFORE_MIN = 12 * 60 + 28; // 748
export const CHASSIS_AFTER_MIN = 1 * 60 + 33; // 93

/** Ledger claims the experience reads its numbers from. */
export const LINE_CLAIM_IDS = { time: 'c-93min', start: 'c-chassis-1228', alt: 'c-chassis-728', price: 'c-price', launch: 'c-modelt', stages: 'c-line-stages' } as const;

export const clamp01 = (t: number) => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0);

/** Minutes to build a chassis at scrub position t (0 = bench-built, 1 = moving line). */
export const chassisMinutes = (t: number) => CHASSIS_BEFORE_MIN - (CHASSIS_BEFORE_MIN - CHASSIS_AFTER_MIN) * clamp01(t);

/** "12 h 28 min", "1 h 33 min", "45 min". */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return `${r} min`;
  return `${h} h ${r} min`;
}

/** How many times faster than the start (about 8.0 at the end). */
export const speedUp = (t: number) => CHASSIS_BEFORE_MIN / chassisMinutes(t);

/** Step label for the date the scrub stands at. */
export function periodLabel(t: number): string {
  const k = clamp01(t);
  if (k < 0.2) return 'Oct 1913';
  if (k < 0.8) return 'Winter 1913–14';
  return 'Early 1914';
}

export interface LineStation { id: string; label: string; at: number }
/** Illustrative stations along the belt; the ledger documents only the magneto line (April 1913) and complete chassis (August 1913). */
export const LINE_STATIONS: LineStation[] = [
  { id: 'frame', label: 'Frame', at: 0.04 },
  { id: 'axles', label: 'Axles', at: 0.24 },
  { id: 'engine', label: 'Engine', at: 0.44 },
  { id: 'body', label: 'Body', at: 0.64 },
  { id: 'wheels', label: 'Wheels', at: 0.84 },
];

/** Which stations the chassis has already passed at position t. */
export const stationsPassed = (t: number) => LINE_STATIONS.filter(s => clamp01(t) >= s.at + 0.06).map(s => s.id);

export interface LineFigures {
  /** Claims found in the ledger by id (undefined when absent). */
  time?: Claim; start?: Claim; alt?: Claim; price?: Claim; launch?: Claim; stages?: Claim;
  /** True when every number shown is backed by a ledger claim; otherwise the UI labels the numbers illustrative. */
  sourced: boolean;
  /** Present when another published figure differs from the one shown, so the UI can say so. */
  timeNote: string;
}

export function lineFigures(claims: Claim[]): LineFigures {
  const by = new Map(claims.map(c => [c.id, c]));
  const time = by.get(LINE_CLAIM_IDS.time), start = by.get(LINE_CLAIM_IDS.start), alt = by.get(LINE_CLAIM_IDS.alt);
  const price = by.get(LINE_CLAIM_IDS.price), launch = by.get(LINE_CLAIM_IDS.launch), stages = by.get(LINE_CLAIM_IDS.stages);
  return {
    time, start, alt, price, launch, stages,
    sourced: !!(time && start && price && launch),
    timeNote: alt
      ? "Ford's own book gives 12 h 28 min for the best stationary assembly, so that is the start shown here. Some reference pages say 12 h 8 min (728 minutes); that figure is 20 minutes off Ford's and the page that gives it names no method. Either way it is roughly 12.5 hours."
      : '',
  };
}
