// nhtsaCore - PURE helpers for the free NHTSA vPIC (VIN decode) and Recalls APIs. The browser never calls NHTSA;
// the server (services/autoServer.ts) does, with a timeout, retries and a cache, and uses these to build URLs,
// parse DEFENSIVELY (every field may be missing / empty / the wrong type) and decide cache freshness.
// Tests parse FIXTURES written from the documented response shape (tests/fixtures/nhtsa*.json), not live captures.
import { validateVin, type RecallInfo } from './vehicleCore';

export const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';
export const RECALLS_BASE = 'https://api.nhtsa.gov/recalls/recallsByVehicle';
/** Decoded VINs never change: cache forever. Recalls change as campaigns are issued: 24h. */
export const RECALL_TTL_MS = 24 * 3_600_000;
/** A failed lookup is remembered briefly so a slow/down NHTSA does not stall every intake. */
export const NEGATIVE_TTL_MS = 5 * 60_000;

export const decodeUrl = (vin: string): string => `${VPIC_BASE}/${encodeURIComponent(vin)}?format=json`;
export function recallsUrl(make: string, model: string, year: number): string {
  return `${RECALLS_BASE}?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(String(year))}`;
}
/** Cache doc id for a recall lookup (lowercase, safe chars). */
export const recallCacheKey = (make: string, model: string, year: number): string =>
  `${year}_${String(make).toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${String(model).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 120);
export const isFresh = (fetchedAt: number | undefined, ttlMs: number, now = Date.now()): boolean =>
  typeof fetchedAt === 'number' && fetchedAt > 0 && now - fetchedAt < ttlMs;

const str = (v: any, max = 120): string => { if (v === null || v === undefined) return ''; const s = String(v).trim(); return s === 'null' || s === 'Not Applicable' ? '' : s.slice(0, max); };
const title = (s: string): string => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : s);

export interface DecodedVehicle {
  vin: string; year?: number; make?: string; model?: string; trim?: string; engine?: string; drivetrain?: string; fuel?: string; body?: string;
  vehicleType?: string; plantCountry?: string;
}
export interface DecodeParse {
  ok: boolean;
  vehicle?: DecodedVehicle;
  /** Non-fatal: partial decode, check-digit complaint, etc. */
  warnings: string[];
  error?: string;
}

/** vPIC ErrorCode is a comma list: 0 = clean, 1 = check digit problem, 5/6/7/11 = partial or incomplete, 8/9 = no data / bad VIN. */
export function parseDecodeVin(json: any, vin: string): DecodeParse {
  const warnings: string[] = [];
  const row = Array.isArray(json?.Results) ? json.Results[0] : null;
  if (!row || typeof row !== 'object') return { ok: false, warnings, error: 'NHTSA returned no data for this VIN.' };
  const codes = str(row.ErrorCode, 60).split(',').map(x => x.trim()).filter(Boolean);
  const text = str(row.ErrorText, 400);
  const make = title(str(row.Make, 60)), model = str(row.Model, 80);
  const yearN = parseInt(str(row.ModelYear, 6), 10);
  const year = Number.isFinite(yearN) && yearN >= 1950 && yearN <= 2100 ? yearN : undefined;
  const fatal = codes.some(c => c === '8' || c === '9' || c === '400') || (!make && !model && !year);
  if (fatal) return { ok: false, warnings, error: 'NHTSA could not decode this VIN. Check it or enter the vehicle manually.' };
  if (codes.some(c => c === '1')) warnings.push('NHTSA says the VIN check digit does not match. Re-read the VIN.');
  if (codes.some(c => ['5', '6', '7', '11', '14'].includes(c))) warnings.push('NHTSA gave a partial decode. Confirm the details below.');
  else if (codes.some(c => c !== '0') && text && !warnings.length) warnings.push(text.replace(/^\d+(,\d+)* - /, '').slice(0, 200));
  const disp = parseFloat(str(row.DisplacementL, 10)); const cyl = str(row.EngineCylinders, 4); const hp = str(row.EngineHP, 6);
  const turbo = /^(yes|true|turbo)/i.test(str(row.Turbo, 20));
  const engine = [Number.isFinite(disp) ? `${disp.toFixed(1)}L` : '', cyl ? `${cyl}-cyl` : '', turbo ? 'turbo' : '', hp ? `${Math.round(Number(hp)) || hp} hp` : ''].filter(Boolean).join(' ');
  const trim = str(row.Trim, 60) || str(row.Series, 60);
  const v: DecodedVehicle = { vin: validateVin(vin).vin };
  if (year) v.year = year;
  if (make) v.make = make;
  if (model) v.model = model;
  if (trim) v.trim = trim;
  if (engine) v.engine = engine;
  const dt = str(row.DriveType, 60); if (dt) v.drivetrain = dt.replace(/\/.*$/, '').trim();
  const fuel = str(row.FuelTypePrimary, 40); if (fuel) v.fuel = fuel;
  const body = str(row.BodyClass, 60); if (body) v.body = body.replace(/\/.*$/, '').trim();
  const vt = str(row.VehicleType, 40); if (vt) v.vehicleType = vt;
  const pc = str(row.PlantCountry, 40); if (pc) v.plantCountry = pc;
  return { ok: true, vehicle: v, warnings };
}

export interface RecallsParse { ok: boolean; recalls: RecallInfo[]; error?: string }
/** Recalls API: { Count, Message, results: [...] } (lower-case `results`; tolerate `Results`). Zero recalls is a success. */
export function parseRecalls(json: any): RecallsParse {
  const arr = Array.isArray(json?.results) ? json.results : Array.isArray(json?.Results) ? json.Results : null;
  if (!arr) return { ok: false, recalls: [], error: 'NHTSA returned an unexpected recalls response.' };
  const seen = new Set<string>(); const recalls: RecallInfo[] = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const campaign = str(r.NHTSACampaignNumber, 20); if (!campaign || seen.has(campaign)) continue;
    seen.add(campaign);
    recalls.push({
      campaign, component: str(r.Component, 120), summary: str(r.Summary, 700), consequence: str(r.Consequence, 500), remedy: str(r.Remedy, 500),
      ...(r.parkIt === true ? { parkIt: true } : {}), ...(str(r.ReportReceivedDate, 20) ? { reportDate: str(r.ReportReceivedDate, 20) } : {}),
    });
  }
  return { ok: true, recalls: recalls.slice(0, 40) };
}
/** NHTSA's by-vehicle recalls are by model, not by VIN: they MAY apply. The UI must say "may apply; verify by VIN with the manufacturer". */
export const RECALL_DISCLAIMER = 'Recalls are listed by make, model and year. Not every vehicle in a campaign is affected. Confirm by VIN at nhtsa.gov/recalls or with a dealer. Recall repairs are free to the owner and are performed by a dealer.';

/** Ticket line for "inform the customer about a recall". $0, informational: the shop does not perform or bill the recall. */
export function recallInspectionLine(r: RecallInfo): { kind: 'SERVICE'; description: string; qty: 1; unitPriceCents: 0; notes: string; group: 'SAFETY' } {
  return {
    kind: 'SERVICE', qty: 1, unitPriceCents: 0, group: 'SAFETY',
    description: `Open recall ${r.campaign}: ${r.component || 'see summary'}`.slice(0, 190),
    notes: 'Manufacturer safety recall. The repair is free to you and done by a dealer. We are letting you know; this line is not billed by us.',
  };
}

export interface FetchLike { (url: string, init?: any): Promise<{ ok: boolean; status: number; json(): Promise<any> }> }
/** GET JSON with a per-attempt timeout and retries. NHTSA is slow (2.5s+) and occasionally 5xx. Never throws. */
export async function fetchJsonWithRetry(url: string, fetcher: FetchLike, opts: { timeoutMs?: number; retries?: number; backoffMs?: number } = {}): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
  const timeoutMs = opts.timeoutMs ?? 8000, retries = opts.retries ?? 2, backoff = opts.backoffMs ?? 400;
  let last = 'unreachable';
  for (let i = 0; i <= retries; i++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await fetcher(url, { signal: ctl?.signal, headers: { Accept: 'application/json' } });
      if (r.ok) return { ok: true, json: await r.json() };
      last = `HTTP ${r.status}`;
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break;     // do not retry client errors
    } catch (e: any) { last = e?.name === 'AbortError' ? 'timeout' : String(e?.message || 'network error').slice(0, 80); }
    finally { if (timer) clearTimeout(timer); }
    if (i < retries) await new Promise(res => setTimeout(res, backoff * (i + 1)));
  }
  return { ok: false, error: last };
}
export const NHTSA_DOWN_MESSAGE = "Couldn't reach NHTSA. Enter the vehicle details manually; you can decode the VIN again later.";
