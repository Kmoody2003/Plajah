// weighedCore - PURE weight-based pricing + scale-protocol parsing. Used by laundry wash-and-fold tickets
// (BY_WEIGHT lines) and written generically so a grocery produce flow can reuse it. No Firebase, no DOM.
// Tests: npm run test:laundry. All money is INTEGER CENTS; weights are pounds rounded to a step (default 0.1).
//
// Honesty: this module prices and parses. It does NOT make a scale legal-for-trade; the shop must use an
// NTEP-approved scale (see the pack hardware list). Manual entry is always available in the UI.

export type RoundMode = 'nearest' | 'up' | 'down';
export interface WeighBand { /** Upper bound (inclusive) of this band in lb. Omit on the last band. */ upToLb?: number; centsPerLb: number }
export interface WeighPricing {
  /** Marginal bands, ascending. One band = flat per-lb price. */
  bands: WeighBand[];
  /** Bill at least this many lb (e.g. 15 lb minimum). */
  minimumLb?: number;
  /** Bill at least this many cents for the weight charge (a visible top-up line is added). */
  minimumChargeCents?: number;
  roundStepLb?: number; roundMode?: RoundMode;
  taxClass?: string;
  /** Line description, e.g. 'Wash & fold'. */
  label?: string;
  unit?: string;
}
export type AddonMode = 'PER_LB' | 'PER_ITEM' | 'FLAT' | 'PCT';
export interface WeighAddon { key: string; label: string; mode: AddonMode; /** cents per lb / per item / flat. */ cents?: number; /** PCT: percent of the weight charge. */ pct?: number; taxClass?: string }
export interface PieceItem { key: string; label: string; cents: number; taxClass?: string }

export type QuoteLineKind = 'BY_WEIGHT' | 'SERVICE' | 'FEE';
export interface QuoteLine { key: string; kind: QuoteLineKind; description: string; qty: number; unit?: string; unitPriceCents: number; taxClass?: string; grossCents: number }
export interface WeighQuote {
  ok: boolean; errors: string[];
  grossLb: number; tareLb: number; netLb: number; billableLb: number;
  minimumLbApplied: boolean; minimumChargeApplied: boolean;
  lines: QuoteLine[]; weightChargeCents: number; subtotalCents: number;
}

const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const cents = (v: any): number => Math.max(0, Math.round(num(v)));

/** Round a weight to `step` lb. Float-safe (12.35 -> 12.4 at 0.1 nearest). */
export function roundWeight(lb: number, step = 0.1, mode: RoundMode = 'nearest'): number {
  const w = Math.max(0, num(lb)); const s = step > 0 ? step : 0.1;
  const q = w / s; const eps = 1e-9;
  const n = mode === 'up' ? Math.ceil(q - eps) : mode === 'down' ? Math.floor(q + eps) : Math.round(q + eps);
  return Math.round(n * s * 1e6) / 1e6;
}

export const lineGross = (qty: number, unitPriceCents: number): number => Math.max(0, Math.round(num(qty) * num(unitPriceCents)));

/** Validate pricing config (the owner edits this; bad data must not produce odd charges). */
export function validatePricing(p: WeighPricing): string[] {
  const e: string[] = [];
  if (!p.bands?.length) return ['Add at least one price band.'];
  let prev = 0;
  p.bands.forEach((b, i) => {
    if (!(num(b.centsPerLb) >= 0)) e.push(`Band ${i + 1} needs a price per lb.`);
    const last = i === p.bands.length - 1;
    if (b.upToLb === undefined) { if (!last) e.push(`Only the last band can be open ended.`); }
    else { if (b.upToLb <= prev) e.push(`Band ${i + 1} must end above ${prev} lb.`); prev = b.upToLb; }
  });
  if (p.bands[p.bands.length - 1].upToLb !== undefined) e.push('The last band must be open ended (no upper limit).');
  if (p.minimumLb !== undefined && p.minimumLb < 0) e.push('Minimum weight cannot be negative.');
  return e;
}

/** Net weight after tare (fixed tare + per-bag tare), rounded to the pricing step. */
export function netWeight(grossLb: number, o: { tareLb?: number; bags?: number; tarePerBagLb?: number; roundStepLb?: number; roundMode?: RoundMode } = {}): { grossLb: number; tareLb: number; netLb: number } {
  const step = o.roundStepLb ?? 0.1;
  const gross = roundWeight(num(grossLb), step, 'nearest');
  const tare = roundWeight(Math.max(0, num(o.tareLb)) + Math.max(0, Math.floor(num(o.bags))) * Math.max(0, num(o.tarePerBagLb)), step, 'nearest');
  return { grossLb: gross, tareLb: tare, netLb: roundWeight(Math.max(0, gross - tare), step, o.roundMode ?? 'nearest') };
}

/** Weight charge across marginal bands for `lb` pounds. */
export function bandLines(lb: number, p: WeighPricing): QuoteLine[] {
  const out: QuoteLine[] = []; let from = 0; const label = p.label || 'By the pound'; const unit = p.unit || 'lb';
  for (let i = 0; i < p.bands.length && from < lb - 1e-9; i++) {
    const b = p.bands[i]; const to = b.upToLb === undefined ? lb : Math.min(lb, b.upToLb);
    const q = Math.round((to - from) * 1e6) / 1e6; if (q <= 0) { from = to; continue; }
    const multi = p.bands.length > 1;
    const range = !multi ? '' : b.upToLb === undefined ? ` (over ${from} lb)` : ` (${from === 0 ? 'first' : `${from} to`} ${b.upToLb}${from === 0 ? ' lb' : ' lb'})`;
    const price = cents(b.centsPerLb);
    out.push({ key: `band${i}`, kind: 'BY_WEIGHT', description: `${label}${range}`, qty: q, unit, unitPriceCents: price, ...(p.taxClass ? { taxClass: p.taxClass } : {}), grossCents: lineGross(q, price) });
    from = to;
  }
  return out;
}

export interface QuoteInput {
  grossLb: number; tareLb?: number; bags?: number; tarePerBagLb?: number;
  pricing: WeighPricing;
  addons?: { def: WeighAddon; qty?: number }[];
  pieces?: { def: PieceItem; qty: number }[];
}

/** The whole weigh-in: net weight, tiers, minimums, add-ons, pieces -> ticket-ready lines. */
export function quoteWeighIn(inp: QuoteInput): WeighQuote {
  const p = inp.pricing; const errors = validatePricing(p);
  const step = p.roundStepLb ?? 0.1;
  const nw = netWeight(inp.grossLb, { tareLb: inp.tareLb, bags: inp.bags, tarePerBagLb: inp.tarePerBagLb, roundStepLb: step, roundMode: p.roundMode });
  if (num(inp.grossLb) < 0) errors.push('Weight cannot be negative.');
  if (nw.netLb > 5000) errors.push('That weight looks wrong.');
  const empty = (): WeighQuote => ({ ok: false, errors, ...nw, billableLb: 0, minimumLbApplied: false, minimumChargeApplied: false, lines: [], weightChargeCents: 0, subtotalCents: 0 });
  if (errors.length) return empty();

  const pieces = (inp.pieces || []).filter(x => x.qty > 0);
  const hasWeight = nw.netLb > 0;
  const minLb = Math.max(0, num(p.minimumLb));
  const minimumLbApplied = hasWeight && minLb > 0 && nw.netLb < minLb;
  const billableLb = hasWeight ? (minimumLbApplied ? minLb : nw.netLb) : 0;
  const lines: QuoteLine[] = hasWeight ? bandLines(billableLb, p) : [];
  if (minimumLbApplied && lines.length) lines[0] = { ...lines[0], description: `${lines[0].description}, ${minLb} lb minimum` };
  let weightCharge = lines.reduce((n, l) => n + l.grossCents, 0);
  let minimumChargeApplied = false;
  const minC = cents(p.minimumChargeCents);
  if (hasWeight && minC > weightCharge) {
    const diff = minC - weightCharge; minimumChargeApplied = true;
    lines.push({ key: 'min_charge', kind: 'FEE', description: `Minimum order top-up (${(minC / 100).toFixed(2)} minimum)`, qty: 1, unitPriceCents: diff, ...(p.taxClass ? { taxClass: p.taxClass } : {}), grossCents: diff });
    weightCharge = minC;
  }
  for (const a of inp.addons || []) {
    const d = a.def; const q = a.qty === undefined ? 1 : num(a.qty); if (q <= 0) continue;
    const tc = d.taxClass || p.taxClass; const tcf = tc ? { taxClass: tc } : {};
    if (d.mode === 'PER_LB') { if (!hasWeight) continue; lines.push({ key: d.key, kind: 'BY_WEIGHT', description: d.label, qty: billableLb, unit: 'lb', unitPriceCents: cents(d.cents), ...tcf, grossCents: lineGross(billableLb, cents(d.cents)) }); }
    else if (d.mode === 'PER_ITEM') lines.push({ key: d.key, kind: 'SERVICE', description: d.label, qty: Math.round(q * 1000) / 1000, unitPriceCents: cents(d.cents), ...tcf, grossCents: lineGross(q, cents(d.cents)) });
    else if (d.mode === 'FLAT') lines.push({ key: d.key, kind: 'FEE', description: d.label, qty: 1, unitPriceCents: cents(d.cents), ...tcf, grossCents: cents(d.cents) });
    else if (d.mode === 'PCT') { if (!weightCharge) continue; const amt = Math.round(weightCharge * Math.max(0, num(d.pct)) / 100); lines.push({ key: d.key, kind: 'FEE', description: `${d.label} (${num(d.pct)}%)`, qty: 1, unitPriceCents: amt, ...tcf, grossCents: amt }); }
  }
  for (const pc of pieces) {
    const price = cents(pc.def.cents); const tc = pc.def.taxClass || p.taxClass;
    lines.push({ key: pc.def.key, kind: 'SERVICE', description: pc.def.label, qty: Math.round(pc.qty * 1000) / 1000, unitPriceCents: price, ...(tc ? { taxClass: tc } : {}), grossCents: lineGross(pc.qty, price) });
  }
  if (!lines.length) { errors.push('Enter a weight or add an item.'); return empty(); }
  return { ok: true, errors, ...nw, billableLb, minimumLbApplied, minimumChargeApplied, lines, weightChargeCents: weightCharge, subtotalCents: lines.reduce((n, l) => n + l.grossCents, 0) };
}

/** Ticket-line payloads (the `line` body of POST /api/tickets/line op=add). */
export const quoteToTicketLines = (q: WeighQuote): { kind: QuoteLineKind; description: string; qty: number; unit?: string; unitPriceCents: number; taxClass?: string }[] =>
  q.lines.map(l => ({ kind: l.kind, description: l.description, qty: l.qty, ...(l.unit ? { unit: l.unit } : {}), unitPriceCents: l.unitPriceCents, ...(l.taxClass ? { taxClass: l.taxClass } : {}) }));

/** Simple per-unit produce price (grocery): weight x price, rounded to the cent. */
export const produceTotalCents = (weight: number, centsPerUnit: number, step = 0.01): number => lineGross(roundWeight(weight, step), centsPerUnit);

// ── Scale protocols (defensive: scales differ wildly) ─────────────────────────────────────────────
export interface ScaleReading { weightLb: number; value: number; unit: 'lb' | 'kg' | 'g' | 'oz'; assumedUnit: boolean; /** true=stable, false=in motion, null=unknown. */ stable: boolean | null; negative: boolean; raw: string }
const TO_LB: Record<string, number> = { lb: 1, kg: 2.2046226218, g: 0.0022046226218, oz: 0.0625 };

/**
 * Parse one line from a serial/USB scale. Handles the common shapes:
 *   "ST,GS,  12.50 lb"  (Ohaus / generic CAS)    "US,GS,  12.50lb"  (US = unstable)
 *   "  12.5 lb" / "+00012.50 kg" / "WT:  0.250 kg" / "\x02  12.50\x0d" / "S S     12.5 g" (Mettler)
 * Returns null when no plausible number is found. Never throws.
 */
export function parseScaleLine(input: string): ScaleReading | null {
  try {
    const raw = String(input ?? '');
    const s = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').trim();
    if (!s) return null;
    const re = /([+-]?\d+(?:\.\d+)?|[+-]?\.\d+)\s*(lbs?|kgs?|g|oz)?(?![a-z])/gi;
    let m: RegExpExecArray | null; let best: RegExpExecArray | null = null;
    while ((m = re.exec(s))) { if (m[2]) { best = m; break; } best = m; }
    // Prefer the first numeric token that carries a unit, else the last number on the line.
    if (!best) return null;
    const value = parseFloat(best[1]);
    if (!Number.isFinite(value)) return null;
    const unitRaw = (best[2] || '').toLowerCase().replace(/s$/, '');
    const unit = (['lb', 'kg', 'g', 'oz'].includes(unitRaw) ? unitRaw : 'lb') as ScaleReading['unit'];
    const head = s.slice(0, best.index);
    const motion = /(^|[^A-Za-z])(US|MOTION|M)([^A-Za-z]|$)/i.test(head) || /\?/.test(head);
    const stable = motion ? false : /(^|[^A-Za-z])(ST|NT|STABLE|S\s?S)([^A-Za-z]|$)/i.test(head) ? true : null;
    const weightLb = Math.round(Math.abs(value) * TO_LB[unit] * 1000) / 1000;
    if (weightLb > 10000) return null;
    return { weightLb, value, unit, assumedUnit: !unitRaw, stable, negative: value < 0, raw };
  } catch { return null; }
}

/** Bluetooth GATT Weight Measurement (0x2A9D). flags bit0: 0 = SI (kg, 0.005), 1 = imperial (lb, 0.01). */
export function parseBleWeightMeasurement(bytes: ArrayLike<number>): ScaleReading | null {
  if (!bytes || bytes.length < 3) return null;
  const flags = bytes[0] & 0xff; const raw = (bytes[1] & 0xff) | ((bytes[2] & 0xff) << 8);
  if (raw === 0xffff) return null;           // measurement unsuccessful
  const imperial = (flags & 1) === 1;
  const value = raw * (imperial ? 0.01 : 0.005);
  const unit: 'lb' | 'kg' = imperial ? 'lb' : 'kg';
  return { weightLb: Math.round(value * TO_LB[unit] * 1000) / 1000, value, unit, assumedUnit: false, stable: null, negative: false, raw: Array.from(bytes as any).join(',') };
}

/** Wait for a steady reading: `needed` consecutive readings within `tolLb` (scales without a stable flag). */
export function createStabilizer(o: { needed?: number; tolLb?: number } = {}) {
  const needed = Math.max(2, o.needed ?? 3), tol = o.tolLb ?? 0.05; let run: number[] = [];
  return {
    push(r: ScaleReading | null): { stable: boolean; weightLb: number | null } {
      if (!r || r.negative) { run = []; return { stable: false, weightLb: null }; }
      if (r.stable === false) { run = []; return { stable: false, weightLb: r.weightLb }; }
      run.push(r.weightLb); if (run.length > needed) run.shift();
      const ok = run.length >= needed && Math.max(...run) - Math.min(...run) <= tol || (r.stable === true && run.length >= 1);
      return { stable: ok, weightLb: ok ? run[run.length - 1] : r.weightLb };
    },
    reset() { run = []; },
  };
}
