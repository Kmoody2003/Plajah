// vehicleCore - PURE vehicle record rules for the auto-repair vertical (and the customer-owned Vehicle Passport).
// VIN validation (check digit WARNS, never blocks: only North American VINs are required to have a valid check
// digit), plate normalisation, mileage sanity + odometer-rollback flag, storage codec. No Firebase / node imports.
// Tests: npm run test:auto

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Clean a typed / scanned VIN: uppercase, strip spaces/dashes, drop the leading "I" some Code-39 labels add. */
export function normalizeVin(raw: string): string {
  let v = String(raw ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
  if (v.length === 18 && v[0] === 'I') v = v.slice(1);           // Code 39 VIN labels are sometimes prefixed with "I"
  return v.slice(0, 20);
}

/** Expected check digit (position 9) for a 17-char VIN, or null if it contains characters that cannot be scored. */
export function vinCheckDigit(vin: string): string | null {
  const v = normalizeVin(vin);
  if (v.length !== 17) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = v[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : TRANSLIT[ch];
    if (val === undefined) return null;
    sum += val * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}

export interface VinCheck {
  vin: string;
  /** Structurally usable: 17 chars from the allowed alphabet (no I, O, Q). The ONLY blocking test. */
  valid: boolean;
  /** Position-9 check digit matches. Informational: not all markets use it. */
  checkDigitOk: boolean | null;
  errors: string[];
  warnings: string[];
}
export function validateVin(raw: string): VinCheck {
  const vin = normalizeVin(raw);
  const errors: string[] = [], warnings: string[] = [];
  if (vin.length !== 17) errors.push(`A VIN is 17 characters (this has ${vin.length}).`);
  else if (/[IOQ]/.test(vin)) errors.push('A VIN never contains the letters I, O or Q.');
  else if (!VIN_RE.test(vin)) errors.push('A VIN only has letters and digits.');
  const valid = errors.length === 0;
  let checkDigitOk: boolean | null = null;
  if (valid) {
    checkDigitOk = vinCheckDigit(vin) === vin[8];
    if (!checkDigitOk) warnings.push('The VIN check digit does not match. Re-read the VIN; if it is right, this may be a non-North-American vehicle.');
  }
  return { vin, valid, checkDigitOk, errors, warnings };
}

/** Model year from VIN position 10 (30-year cycle; the ambiguity is resolved by position 7 for NA cars). Best effort, hint only. */
export function vinModelYearHint(vin: string, nowYear = new Date().getFullYear()): number | null {
  const v = normalizeVin(vin);
  if (v.length !== 17) return null;
  const codes = 'ABCDEFGHJKLMNPRSTVWXY123456789';
  const i = codes.indexOf(v[9]); if (i < 0) return null;
  let y = 1980 + i;
  while (y + 30 <= nowYear + 1) y += 30;                 // choose the latest plausible year in the cycle
  return y;
}

// ── Plates ────────────────────────────────────────────────────────────────────────────────────────
export const normalizePlate = (raw: string): string => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
export const normalizeState = (raw: string): string => String(raw ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
/** Stable identity: VIN when we have a valid one, else plate+state. null when neither is usable. */
export function vehicleKey(a: { vin?: string; plate?: string; state?: string }): string | null {
  const v = validateVin(a.vin || '');
  if (v.valid) return `vin_${v.vin}`;
  const p = normalizePlate(a.plate || ''), s = normalizeState(a.state || '');
  return p.length >= 2 && s.length === 2 ? `plate_${s}_${p}` : null;
}

// ── Mileage ───────────────────────────────────────────────────────────────────────────────────────
export interface MileageReading { odometer: number; at: number; source: string; ticketId?: string; unit?: 'mi' | 'km'; rollback?: boolean; note?: string }
export const MAX_ODOMETER = 1_500_000;
export interface MileageCheck { ok: boolean; error?: string; warning?: string; rollback?: boolean }

/**
 * Can `next` be recorded after `history`? A reading LOWER than the latest one is refused unless `override`
 * (then it is flagged `rollback` so it shows up in the history as a possible rollback / cluster replacement).
 * Very large single jumps and implausible per-day rates only warn.
 */
export function checkMileage(history: MileageReading[], nextOdo: number, at: number, opts: { override?: boolean } = {}): MileageCheck {
  const n = Math.round(Number(nextOdo));
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Enter the odometer reading.' };
  if (n > MAX_ODOMETER) return { ok: false, error: 'That odometer reading is not plausible.' };
  const sorted = [...history].sort((a, b) => a.at - b.at);
  const prev = [...sorted].reverse().find(r => r.at <= at) ?? sorted[sorted.length - 1];
  if (!prev) return { ok: true };
  if (n < prev.odometer) {
    if (!opts.override) return { ok: false, error: `That is ${prev.odometer - n} lower than the last reading (${prev.odometer}). Confirm with an override if the odometer was replaced.` };
    return { ok: true, rollback: true, warning: 'Recorded as a possible odometer rollback / replaced cluster.' };
  }
  const days = Math.max(1, (at - prev.at) / 86_400_000);
  const perDay = (n - prev.odometer) / days;
  if (perDay > 1000 && n - prev.odometer > 5000) return { ok: true, warning: `That is ${Math.round(perDay)} miles per day since the last reading. Double-check it.` };
  return { ok: true };
}
export function addMileage(history: MileageReading[], r: MileageReading, opts: { override?: boolean } = {}): { history: MileageReading[]; check: MileageCheck } {
  const check = checkMileage(history, r.odometer, r.at, opts);
  if (!check.ok) return { history, check };
  const next = [...history, { ...r, odometer: Math.round(r.odometer), ...(check.rollback ? { rollback: true } : {}) }].sort((a, b) => a.at - b.at).slice(-60);
  return { history: next, check };
}
export const hasRollbackFlag = (h: MileageReading[]): boolean => h.some(r => r.rollback);
export const latestMileage = (h: MileageReading[]): MileageReading | null => (h.length ? [...h].sort((a, b) => a.at - b.at)[h.length - 1] : null);

/** Miles per 30 days from the vehicle's own history (needs two readings >= 14 days apart, ignoring rollback points). null otherwise. */
export function milesPerMonth(h: MileageReading[]): number | null {
  const pts = h.filter(r => !r.rollback).sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const days = (last.at - first.at) / 86_400_000;
  if (days < 14 || last.odometer < first.odometer) return null;
  return Math.round(((last.odometer - first.odometer) / days) * 30);
}

// ── Vehicle record ────────────────────────────────────────────────────────────────────────────────
export interface RecallInfo { campaign: string; component: string; summary: string; consequence: string; remedy: string; parkIt?: boolean; reportDate?: string }
export interface VehicleNote { id: string; text: string; by: string; at: number }
export interface VehiclePhoto { url: string; at: number; caption?: string }
export interface ServiceDone { key: string; odometer?: number; at: number; ticketId?: string; label?: string }
export interface Vehicle {
  id: string; businessUid: string;
  key: string;                                // vehicleKey()
  vin?: string; plate?: string; state?: string;
  year?: number; make?: string; model?: string; trim?: string; engine?: string; drivetrain?: string; fuel?: string; body?: string;
  decodeSource?: 'NHTSA' | 'MANUAL';
  ownerCustomerName?: string; ownerUid?: string; ownerPhone?: string; ownerEmail?: string;
  mileage: MileageReading[];
  services: ServiceDone[];
  notes: VehicleNote[]; photos: VehiclePhoto[];
  recalls?: { checkedAt: number; open: RecallInfo[]; error?: string };
  /** Per-vehicle interval overrides: serviceKey -> {miles, months}. */
  intervalOverrides?: Record<string, { miles?: number; months?: number }>;
  createdAt: number; updatedAt: number;
}

/** Clean an untrusted vehicle patch. Returns only well-formed fields (no undefined). */
export function cleanVehicleInput(raw: any): { value: Partial<Vehicle>; errors: string[]; warnings: string[] } {
  const value: Partial<Vehicle> = {}; const errors: string[] = []; const warnings: string[] = [];
  const s = (x: any, n: number) => String(x ?? '').trim().slice(0, n);
  if (raw?.vin) { const c = validateVin(raw.vin); if (!c.valid) errors.push(c.errors[0]); else { value.vin = c.vin; warnings.push(...c.warnings); } }
  if (raw?.plate) value.plate = normalizePlate(raw.plate);
  if (raw?.state) value.state = normalizeState(raw.state);
  const y = Math.round(Number(raw?.year)); if (Number.isFinite(y) && y >= 1950 && y <= new Date().getFullYear() + 2) value.year = y;
  for (const k of ['make', 'model', 'trim', 'engine', 'drivetrain', 'fuel', 'body'] as const) if (raw?.[k]) value[k] = s(raw[k], 60);
  if (raw?.ownerCustomerName) value.ownerCustomerName = s(raw.ownerCustomerName, 80);
  if (raw?.ownerUid) value.ownerUid = s(raw.ownerUid, 128);
  if (raw?.ownerPhone) value.ownerPhone = s(raw.ownerPhone, 30);
  if (raw?.ownerEmail && /^\S+@\S+\.\S+$/.test(String(raw.ownerEmail))) value.ownerEmail = s(raw.ownerEmail, 120);
  if (raw?.decodeSource === 'NHTSA' || raw?.decodeSource === 'MANUAL') value.decodeSource = raw.decodeSource;
  return { value, errors, warnings };
}

export const describeVehicle = (v: Pick<Vehicle, 'year' | 'make' | 'model' | 'trim'>): string =>
  [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Vehicle';

// ── Storage codec (flat doc; object arrays JSON-stringified; no undefined) ───────────────────────
const jp = (s: any, d: any) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v ?? d; } catch { return d; } };
export function serializeVehicle(v: Vehicle): Record<string, any> {
  return {
    id: v.id, businessUid: v.businessUid, key: v.key, vin: v.vin || '', plate: v.plate || '', state: v.state || '',
    year: v.year || 0, make: v.make || '', model: v.model || '', trim: v.trim || '', engine: v.engine || '', drivetrain: v.drivetrain || '', fuel: v.fuel || '', body: v.body || '',
    decodeSource: v.decodeSource || 'MANUAL',
    ownerCustomerName: v.ownerCustomerName || '', ownerUid: v.ownerUid || '', ownerPhone: v.ownerPhone || '', ownerEmail: v.ownerEmail || '',
    mileage: JSON.stringify(v.mileage || []), services: JSON.stringify(v.services || []), notes: JSON.stringify(v.notes || []), photos: JSON.stringify(v.photos || []),
    recalls: JSON.stringify(v.recalls || null), intervalOverrides: JSON.stringify(v.intervalOverrides || {}),
    lastOdometer: latestMileage(v.mileage || [])?.odometer || 0,
    search: [v.vin, v.plate, v.make, v.model, v.ownerCustomerName, v.year].filter(Boolean).join(' ').toLowerCase(),
    createdAt: v.createdAt, updatedAt: v.updatedAt,
  };
}
export function parseVehicle(d: Record<string, any>): Vehicle {
  const o = (x: any) => (x === '' || x === 0 || x === undefined || x === null ? undefined : x);
  return {
    id: String(d.id), businessUid: String(d.businessUid || ''), key: String(d.key || ''),
    vin: o(d.vin), plate: o(d.plate), state: o(d.state), year: o(d.year ? Number(d.year) : 0),
    make: o(d.make), model: o(d.model), trim: o(d.trim), engine: o(d.engine), drivetrain: o(d.drivetrain), fuel: o(d.fuel), body: o(d.body),
    decodeSource: d.decodeSource === 'NHTSA' ? 'NHTSA' : 'MANUAL',
    ownerCustomerName: o(d.ownerCustomerName), ownerUid: o(d.ownerUid), ownerPhone: o(d.ownerPhone), ownerEmail: o(d.ownerEmail),
    mileage: jp(d.mileage, []), services: jp(d.services, []), notes: jp(d.notes, []), photos: jp(d.photos, []),
    recalls: jp(d.recalls, null) || undefined, intervalOverrides: jp(d.intervalOverrides, {}),
    createdAt: Number(d.createdAt) || 0, updatedAt: Number(d.updatedAt) || 0,
  };
}
