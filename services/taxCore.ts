// taxCore — PURE sales-tax rules for the register / kiosk / online checkout. Shared by server + client
// + tests (npm run test:tax). All money is INTEGER CENTS here (StoreProduct.price is dollars; convert
// with unitPriceCents before calling).
//
// DESIGN
//  - Rates are OWNER-ENTERED basis points (825 = 8.25%). There are deliberately NO state/county rate
//    tables in this codebase. TODO(later add-on): auto-lookup by address via Stripe Tax (or similar)
//    that fills `RegisterSettings.tax.rates` — the engine below would not change.
//  - Each product has a `taxClass`. STANDARD uses defaultRateBps; EXEMPT is always 0; any other
//    class (GROCERY_FOOD, PREPARED_FOOD, custom) uses settings.rates[class] and falls back to the
//    default rate if the owner has not set one (safer to collect than to silently skip tax).
//  - Discounts reduce the taxable base PROPORTIONALLY across lines (largest remainder, so the shares
//    sum exactly to the discount).
//  - ROUNDING: per-TICKET. We sum the exact fractional tax of every line, round that ONCE to cents, then
//    hand the rounded total back to lines by largest fractional remainder. Line taxes always sum to the
//    ticket tax (no penny drift) and the ticket tax equals a single-rate computation.
//  - Exclusive (default, US-style): total = net + tax. Inclusive (VAT-style): shelf price already
//    contains tax; tax is extracted, total = net.
//  - SNAP: SNAP-eligible items paid with SNAP tender are never taxed. `snapCents` is the SNAP tender
//    amount (charge cents); it is capped at the eligible charge and allocated to eligible lines.
//    In inclusive mode the embedded tax on the SNAP-covered part is stripped (so the total drops).

export const TAX_CLASS_STANDARD = 'STANDARD';
export const TAX_CLASS_EXEMPT = 'EXEMPT';
export const BUILTIN_TAX_CLASSES = ['STANDARD', 'EXEMPT', 'GROCERY_FOOD', 'PREPARED_FOOD'] as const;
export const TAX_CLASS_LABEL: Record<string, string> = {
  STANDARD: 'Standard', EXEMPT: 'Exempt', GROCERY_FOOD: 'Grocery food', PREPARED_FOOD: 'Prepared food',
};

export interface TaxSettings {
  defaultRateBps: number;
  inclusive?: boolean;
  /** taxClass -> basis points. Missing class -> defaultRateBps (except EXEMPT = 0). */
  rates?: Record<string, number>;
}
export const NO_TAX: TaxSettings = { defaultRateBps: 0 };

export interface TaxLineIn {
  /** Shelf price x qty in cents (BEFORE discount). */
  grossCents: number;
  taxClass?: string;
  snapEligible?: boolean;
}
export interface TaxLineOut {
  grossCents: number;
  discountCents: number;
  /** After discount, before tax (exclusive) / tax-included (inclusive). */
  netCents: number;
  rateBps: number;
  taxCents: number;
  /** What the customer pays for the line (net + tax if exclusive; net minus stripped tax if inclusive+SNAP). */
  chargeCents: number;
  snapCoveredCents: number;
}
export interface TaxResult {
  lines: TaxLineOut[];
  subtotalCents: number;     // sum of gross
  discountCents: number;     // applied (capped at subtotal)
  taxCents: number;
  totalCents: number;        // what the customer owes (excl. tip)
  snapCoveredCents: number;
  inclusive: boolean;
}

export const clampBps = (n: any): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(3000, v)) : 0;   // 0-30%
};

/** Normalise untrusted settings (from Firestore JSON) into a safe TaxSettings. */
export function parseTaxSettings(raw: any): TaxSettings {
  if (!raw || typeof raw !== 'object') return NO_TAX;
  const rates: Record<string, number> = {};
  if (raw.rates && typeof raw.rates === 'object') {
    for (const [k, v] of Object.entries(raw.rates)) {
      const key = String(k).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 32);
      if (key && key !== TAX_CLASS_EXEMPT) rates[key] = clampBps(v);
    }
  }
  return { defaultRateBps: clampBps(raw.defaultRateBps), inclusive: !!raw.inclusive, rates };
}

export function normalizeTaxClass(c?: string): string {
  const k = String(c || TAX_CLASS_STANDARD).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return k || TAX_CLASS_STANDARD;
}

export function rateBpsFor(settings: TaxSettings, taxClass?: string): number {
  const k = normalizeTaxClass(taxClass);
  if (k === TAX_CLASS_EXEMPT) return 0;
  if (k === TAX_CLASS_STANDARD) return clampBps(settings.defaultRateBps);
  const r = settings.rates?.[k];
  return typeof r === 'number' ? clampBps(r) : clampBps(settings.defaultRateBps);
}

/** Split `total` across `weights` proportionally; shares are integers that sum EXACTLY to total (largest remainder). */
export function allocateProportional(total: number, weights: number[]): number[] {
  const n = weights.length;
  const out: number[] = new Array(n).fill(0);
  const t = Math.max(0, Math.round(total));
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (!n || !t || sum <= 0) return out;
  const exact = weights.map(w => (Math.max(0, w) * t) / sum);
  let left = t;
  exact.forEach((x, i) => { out[i] = Math.floor(x + 1e-9); left -= out[i]; });
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x + 1e-9) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length * 2; k++, left--) out[order[k % order.length].i] += 1;
  return out;
}

/** Hand an integer total to lines by largest fractional remainder of their exact (float) shares. */
function distributeRounded(exact: number[], total: number): number[] {
  const out = exact.map(x => Math.floor(x + 1e-9));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x + 1e-9) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && order.length && k < order.length * 2; k++, left--) out[order[k % order.length].i] += 1;
  for (let k = 0; left < 0 && order.length && k < order.length * 2; k++, left++) { const j = order[order.length - 1 - (k % order.length)].i; if (out[j] > 0) out[j] -= 1; }
  return out;
}

export interface ComputeOpts {
  /** Ticket-level discount in cents (offers + loyalty), spread across lines. */
  discountCents?: number;
  /** SNAP tender amount (charge cents) — eligible lines covered by it are untaxed. */
  snapCents?: number;
}

export function computeTax(lines: TaxLineIn[], settings: TaxSettings = NO_TAX, opts: ComputeOpts = {}): TaxResult {
  const inclusive = !!settings.inclusive;
  const gross = lines.map(l => Math.max(0, Math.round(l.grossCents || 0)));
  const subtotal = gross.reduce((a, b) => a + b, 0);
  const discount = Math.min(subtotal, Math.max(0, Math.round(opts.discountCents || 0)));
  const disc = allocateProportional(discount, gross);
  const net = gross.map((g, i) => g - disc[i]);
  const rate = lines.map(l => rateBpsFor(settings, l.taxClass));

  // SNAP allocation: eligible lines' "charge if SNAP-covered" (tax stripped in inclusive mode).
  const eligCharge = lines.map((l, i) => (l.snapEligible ? Math.floor((inclusive ? net[i] * 10000 / (10000 + rate[i]) : net[i]) + 1e-9) : 0));
  const eligTotal = eligCharge.reduce((a, b) => a + b, 0);
  const snapReq = Math.min(Math.max(0, Math.round(Math.min(opts.snapCents || 0, Number.MAX_SAFE_INTEGER))), eligTotal);
  const snapShare = allocateProportional(snapReq, eligCharge);

  const exactTax: number[] = [];
  const exactCharge: number[] = [];
  lines.forEach((_, i) => {
    const r = rate[i] / 10000;
    // exemptShelf = the part of the shelf price covered by SNAP (mode-adjusted); the rest is taxable.
    const exemptShelf = inclusive ? Math.min(net[i], snapShare[i] * (1 + r)) : Math.min(net[i], snapShare[i]);
    const taxable = net[i] - exemptShelf;
    if (inclusive) {
      exactTax.push(taxable * r / (1 + r));
      exactCharge.push(taxable + exemptShelf / (1 + r));
    } else {
      exactTax.push(taxable * r);
      exactCharge.push(net[i] + taxable * r);
    }
  });
  const taxCents = Math.round(exactTax.reduce((a, b) => a + b, 0) + 1e-9);
  const lineTax = distributeRounded(exactTax, taxCents);
  const totalCents = inclusive
    ? Math.round(exactCharge.reduce((a, b) => a + b, 0) + 1e-9)
    : (subtotal - discount) + taxCents;
  // Per-line charge: exclusive = net + tax exactly; inclusive = distribute the rounded total.
  const lineCharge = inclusive ? distributeRounded(exactCharge, totalCents) : net.map((n, i) => n + lineTax[i]);

  return {
    lines: lines.map((_, i) => ({
      grossCents: gross[i], discountCents: disc[i], netCents: net[i], rateBps: rate[i],
      taxCents: lineTax[i], chargeCents: lineCharge[i], snapCoveredCents: snapShare[i],
    })),
    subtotalCents: subtotal, discountCents: discount, taxCents, totalCents,
    snapCoveredCents: snapShare.reduce((a, b) => a + b, 0), inclusive,
  };
}

/** Human label for the tax row, e.g. "Tax (8.25%)" or "Tax" when classes differ. */
export function taxLabel(settings: TaxSettings, lines: TaxLineOut[]): string {
  const rates = new Set(lines.filter(l => l.taxCents > 0 || l.rateBps > 0).map(l => l.rateBps));
  const base = settings.inclusive ? 'Tax incl.' : 'Tax';
  if (rates.size === 1) return `${base} (${([...rates][0] / 100).toFixed(2).replace(/\.?0+$/, '')}%)`;
  return base;
}
