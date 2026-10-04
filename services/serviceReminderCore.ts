// serviceReminderCore - PURE next-service prediction for a vehicle. Intervals here are GENERIC SHOP DEFAULTS
// (rule-of-thumb mileage/time), NOT manufacturer schedules. The owner can override any of them per shop or per
// vehicle. Licensed OEM schedule data is a planned paid add-on and is deliberately not claimed anywhere.
import { latestMileage, milesPerMonth, type MileageReading, type ServiceDone } from './vehicleCore';

export interface ServiceInterval { key: string; label: string; miles?: number; months?: number; keywords: string[] }
export const DEFAULT_INTERVALS: ServiceInterval[] = [
  { key: 'oil', label: 'Oil & filter change', miles: 5000, months: 6, keywords: ['oil change', 'oil & filter', 'oil and filter', 'oil/filter'] },
  { key: 'rotation', label: 'Tire rotation', miles: 6000, months: 6, keywords: ['rotation', 'rotate'] },
  { key: 'brake_inspect', label: 'Brake inspection', miles: 20000, months: 12, keywords: ['brake pad', 'brake inspection', 'brakes'] },
  { key: 'brake_fluid', label: 'Brake fluid flush', miles: 30000, months: 24, keywords: ['brake fluid'] },
  { key: 'coolant', label: 'Coolant flush', miles: 30000, months: 36, keywords: ['coolant'] },
  { key: 'trans', label: 'Transmission fluid service', miles: 60000, months: 48, keywords: ['transmission fluid', 'trans service'] },
  { key: 'air_filter', label: 'Engine air filter', miles: 15000, months: 24, keywords: ['engine air filter', 'air filter'] },
  { key: 'cabin_filter', label: 'Cabin air filter', miles: 15000, months: 12, keywords: ['cabin'] },
  { key: 'battery', label: 'Battery test', months: 24, keywords: ['battery'] },
  { key: 'inspection', label: 'State inspection', months: 12, keywords: ['state safety inspection', 'state inspection'] },
];
export const INTERVALS_DISCLAIMER = 'Shop default intervals, not the manufacturer schedule. Check your owner’s manual for your vehicle’s official schedule.';
export const DEFAULT_MILES_PER_MONTH = 1000;      // ~12,000 mi/yr when we have no history

export type IntervalTable = Record<string, { miles?: number; months?: number }>;
/** Defaults overlaid with shop overrides, then vehicle overrides (later wins; a 0 / null value disables that axis). */
export function resolveIntervals(shop?: IntervalTable, vehicle?: IntervalTable, base: ServiceInterval[] = DEFAULT_INTERVALS): ServiceInterval[] {
  return base.map(i => {
    const o = { ...(shop?.[i.key] || {}), ...(vehicle?.[i.key] || {}) };
    const pick = (k: 'miles' | 'months') => (k in o ? (Number(o[k]) > 0 ? Math.round(Number(o[k])) : undefined) : i[k]);
    return { ...i, miles: pick('miles'), months: pick('months') };
  }).filter(i => i.miles || i.months);
}

/** Which interval keys does a ticket line description count as? (substring match on the keywords) */
export function classifyLine(description: string, intervals: ServiceInterval[] = DEFAULT_INTERVALS): string[] {
  const d = String(description || '').toLowerCase();
  return intervals.filter(i => i.keywords.some(k => d.includes(k))).map(i => i.key);
}

export type DueStatus = 'OVERDUE' | 'DUE_SOON' | 'OK' | 'UNKNOWN';
export interface ServicePrediction {
  key: string; label: string; status: DueStatus;
  lastAt?: number; lastOdometer?: number;
  dueAtMiles?: number; dueAtDate?: number;
  /** Estimated date the miles interval is reached at the current driving rate (or the date interval, whichever comes first). */
  estimatedDueDate?: number;
  /** Miles left by the odometer (negative when overdue), when both last service and current odometer are known. */
  milesLeft?: number;
  basis: 'MILES' | 'TIME' | 'BOTH' | 'NONE';
  /** Rate used to project (miles/month) and where it came from. */
  rate: number; rateSource: 'HISTORY' | 'DEFAULT';
  note: string;
}
const MONTH = 30.4375 * 86_400_000;

export function predictNextService(a: {
  mileage: MileageReading[]; services: ServiceDone[]; intervals?: ServiceInterval[]; now?: number;
  /** Fall back to this when the vehicle has no usable history. */
  defaultMilesPerMonth?: number; soonMiles?: number; soonDays?: number;
}): ServicePrediction[] {
  const now = a.now ?? Date.now();
  const intervals = a.intervals ?? DEFAULT_INTERVALS;
  const hist = milesPerMonth(a.mileage);
  const rate = hist && hist > 0 ? hist : (a.defaultMilesPerMonth ?? DEFAULT_MILES_PER_MONTH);
  const rateSource: 'HISTORY' | 'DEFAULT' = hist && hist > 0 ? 'HISTORY' : 'DEFAULT';
  const soonMiles = a.soonMiles ?? 500, soonDays = a.soonDays ?? 21;
  const cur = latestMileage(a.mileage);
  const out: ServicePrediction[] = [];
  for (const iv of intervals) {
    const done = a.services.filter(s => s.key === iv.key).sort((x, y) => y.at - x.at)[0];
    if (!done) { out.push({ key: iv.key, label: iv.label, status: 'UNKNOWN', basis: 'NONE', rate, rateSource, note: 'No record of this service on file.' }); continue; }
    const dueAtMiles = iv.miles && done.odometer !== undefined ? done.odometer + iv.miles : undefined;
    const dueAtDate = iv.months ? done.at + iv.months * MONTH : undefined;
    // current odometer: latest reading, projected forward from its date at the driving rate
    const curOdo = cur ? cur.odometer + Math.max(0, ((now - cur.at) / MONTH) * rate) : undefined;
    const milesLeft = dueAtMiles !== undefined && curOdo !== undefined ? Math.round(dueAtMiles - curOdo) : undefined;
    let milesDate: number | undefined;
    if (dueAtMiles !== undefined && cur && rate > 0) milesDate = cur.at + ((dueAtMiles - cur.odometer) / rate) * MONTH;
    const dates = [milesDate, dueAtDate].filter((x): x is number => x !== undefined);
    const estimatedDueDate = dates.length ? Math.min(...dates) : undefined;
    const overdue = (milesLeft !== undefined && milesLeft <= 0) || (dueAtDate !== undefined && now >= dueAtDate);
    const soon = !overdue && ((milesLeft !== undefined && milesLeft <= soonMiles) || (estimatedDueDate !== undefined && estimatedDueDate - now <= soonDays * 86_400_000));
    const basis: ServicePrediction['basis'] = dueAtMiles !== undefined && dueAtDate !== undefined ? 'BOTH' : dueAtMiles !== undefined ? 'MILES' : dueAtDate !== undefined ? 'TIME' : 'NONE';
    out.push({
      key: iv.key, label: iv.label, status: overdue ? 'OVERDUE' : soon ? 'DUE_SOON' : 'OK', lastAt: done.at, ...(done.odometer !== undefined ? { lastOdometer: done.odometer } : {}),
      ...(dueAtMiles !== undefined ? { dueAtMiles } : {}), ...(dueAtDate !== undefined ? { dueAtDate } : {}), ...(estimatedDueDate !== undefined ? { estimatedDueDate } : {}),
      ...(milesLeft !== undefined ? { milesLeft } : {}), basis, rate, rateSource,
      note: rateSource === 'HISTORY' ? `Projected at ${rate} mi/month from this vehicle’s own history.` : `Projected at the default ${rate} mi/month (no odometer history yet).`,
    });
  }
  const rank: Record<DueStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2, UNKNOWN: 3 };
  return out.sort((x, y) => rank[x.status] - rank[y.status] || (x.estimatedDueDate ?? Infinity) - (y.estimatedDueDate ?? Infinity));
}

/** Customer-facing reminder wording. Always labelled as a shop reminder, never as OEM-required. */
export function reminderMessage(shop: string, vehicleLabel: string, p: Pick<ServicePrediction, 'label' | 'status' | 'milesLeft' | 'estimatedDueDate'>): { title: string; body: string } {
  const when = p.status === 'OVERDUE' ? 'looks overdue' : 'is coming due';
  const extra = p.milesLeft !== undefined && p.milesLeft > 0 ? ` (about ${Math.round(p.milesLeft / 100) * 100} miles left)` : '';
  return { title: `${shop}: ${p.label} ${when}`, body: `Your ${vehicleLabel}: ${p.label.toLowerCase()} ${when}${extra}. This is a shop reminder based on typical intervals; check your owner’s manual too. Reply or book a time with us.` };
}
