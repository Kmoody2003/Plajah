// laundryDefaults - the owner-editable laundromat settings (prices, add-ons, turnaround, reminders, delivery,
// wallet promo) with safe defaults + a defensive cleaner. Pure. Stored server-side as one JSON string in
// laundrySettings/{businessUid}.json (edited through /api/laundry/settings). Tests: npm run test:laundry.
import type { WeighAddon, WeighPricing, PieceItem } from './weighedCore';
import { validatePricing } from './weighedCore';
import { DEFAULT_TURNAROUND, DEFAULT_UNCLAIMED, DEFAULT_DELIVERY, type TurnaroundRules, type UnclaimedRules, type DeliveryRules, type WeekHours } from './laundryCore';
import { DEFAULT_PROMO, cleanPromo, type WalletPromo } from './walletPromoCore';

export interface LaundrySettings {
  pricing: WeighPricing;
  addons: WeighAddon[];
  pieces: PieceItem[];
  /** Empty-bag weight subtracted per bag (lb) and a fixed cart/basket tare (lb). */
  tarePerBagLb: number; tareLb: number;
  turnaround: TurnaroundRules; unclaimed: UnclaimedRules; delivery: DeliveryRules;
  promo: WalletPromo;
  /** Minutes east of UTC for the shop's local clock (e.g. -300 for US Central standard). */
  tzOffsetMin: number;
  /** Opening hours used for due times (same shape as the pack's defaultHours). */
  hours: WeekHours;
  /** Owner-set tax class for laundry service lines (varies by state: SERVICE or STANDARD or EXEMPT). */
  serviceTaxClass: string;
}

export const DEFAULT_HOURS: WeekHours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(d => [d, { open: '06:00', close: '22:00' }])
  .concat([['sunday', { open: '07:00', close: '21:00' }]])) as WeekHours;

export const DEFAULT_LAUNDRY: LaundrySettings = {
  // First 15 lb is the minimum order; $1.85/lb, dropping to $1.65/lb above 40 lb.
  pricing: { label: 'Wash & fold', unit: 'lb', roundStepLb: 0.1, roundMode: 'nearest', minimumLb: 0, minimumChargeCents: 1850, taxClass: 'SERVICE',
    bands: [{ upToLb: 40, centsPerLb: 185 }, { centsPerLb: 165 }] },
  addons: [
    { key: 'rush', label: 'Same-day rush', mode: 'PER_LB', cents: 100 },
    { key: 'hang_dry', label: 'Hang dry / delicates', mode: 'PER_LB', cents: 65 },
    { key: 'hypo', label: 'Free & clear detergent', mode: 'FLAT', cents: 300 },
  ],
  pieces: [
    { key: 'comforter_q', label: 'Comforter, queen/full', cents: 2200 },
    { key: 'comforter_k', label: 'Comforter, king', cents: 2800 },
    { key: 'sleeping_bag', label: 'Sleeping bag', cents: 2000 },
    { key: 'pillow', label: 'Pillow', cents: 900 },
    { key: 'rug_small', label: 'Small area rug', cents: 2500 },
  ],
  tarePerBagLb: 0, tareLb: 0,
  turnaround: { ...DEFAULT_TURNAROUND, bulkyExtraHours: 8 }, unclaimed: { ...DEFAULT_UNCLAIMED }, delivery: { ...DEFAULT_DELIVERY },
  promo: { ...DEFAULT_PROMO, enabled: false },
  tzOffsetMin: -300, hours: DEFAULT_HOURS, serviceTaxClass: 'SERVICE',
};

const n = (v: any, d: number, lo: number, hi: number): number => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? d : Math.min(hi, Math.max(lo, Number(v))));
const TAX_CLASSES = ['STANDARD', 'GROCERY_FOOD', 'PREPARED_FOOD', 'CLOTHING', 'SERVICE', 'EXEMPT', 'LABOR'];

/** Merge owner/stored settings over the defaults. Invalid sections fall back to the default for that section. */
export function cleanLaundrySettings(raw: any): LaundrySettings {
  let r = raw; if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  const D = DEFAULT_LAUNDRY; if (!r || typeof r !== 'object') return D;
  const tax = TAX_CLASSES.includes(String(r.serviceTaxClass)) ? String(r.serviceTaxClass) : D.serviceTaxClass;
  let pricing = D.pricing;
  if (r.pricing && Array.isArray(r.pricing.bands)) {
    const cand: WeighPricing = {
      label: String(r.pricing.label || D.pricing.label).slice(0, 40), unit: 'lb',
      roundStepLb: [0.01, 0.05, 0.1, 0.25, 0.5, 1].includes(Number(r.pricing.roundStepLb)) ? Number(r.pricing.roundStepLb) : 0.1,
      roundMode: ['nearest', 'up', 'down'].includes(r.pricing.roundMode) ? r.pricing.roundMode : 'nearest',
      minimumLb: n(r.pricing.minimumLb, 0, 0, 500), minimumChargeCents: Math.round(n(r.pricing.minimumChargeCents, 0, 0, 1_000_000)),
      bands: r.pricing.bands.slice(0, 5).map((b: any) => ({ ...(b?.upToLb !== undefined && b.upToLb !== null && b.upToLb !== '' ? { upToLb: n(b.upToLb, 0, 0, 5000) } : {}), centsPerLb: Math.round(n(b?.centsPerLb, 0, 0, 100_000)) })),
    };
    if (!validatePricing(cand).length) pricing = cand;
  }
  pricing = { ...pricing, taxClass: tax };
  const addons: WeighAddon[] = Array.isArray(r.addons) ? r.addons.slice(0, 12).filter((a: any) => a?.key && a?.label && ['PER_LB', 'PER_ITEM', 'FLAT', 'PCT'].includes(a.mode)).map((a: any) => ({
    key: String(a.key).replace(/[^A-Za-z0-9_]/g, '').slice(0, 24), label: String(a.label).slice(0, 50), mode: a.mode,
    ...(a.mode === 'PCT' ? { pct: n(a.pct, 0, 0, 500) } : { cents: Math.round(n(a.cents, 0, 0, 1_000_000)) }),
  })) : D.addons;
  const pieces: PieceItem[] = Array.isArray(r.pieces) ? r.pieces.slice(0, 20).filter((p: any) => p?.key && p?.label).map((p: any) => ({ key: String(p.key).replace(/[^A-Za-z0-9_]/g, '').slice(0, 24), label: String(p.label).slice(0, 50), cents: Math.round(n(p.cents, 0, 0, 1_000_000)) })) : D.pieces;
  const t = r.turnaround || {}, u = r.unclaimed || {}, dl = r.delivery || {};
  const hours: WeekHours = r.hours && typeof r.hours === 'object' ? Object.fromEntries(Object.entries(r.hours).filter(([k]) => /^(sun|mon|tues|wednes|thurs|fri|satur)day$/.test(k)).map(([k, v]: [string, any]) => [k, { open: /^\d{2}:\d{2}$/.test(v?.open) ? v.open : '06:00', close: /^\d{2}:\d{2}$/.test(v?.close) ? v.close : '22:00', ...(v?.closed ? { closed: true } : {}) }])) as WeekHours : D.hours;
  return {
    pricing, addons, pieces,
    tarePerBagLb: n(r.tarePerBagLb, D.tarePerBagLb, 0, 20), tareLb: n(r.tareLb, D.tareLb, 0, 100),
    turnaround: { standardHours: n(t.standardHours, D.turnaround.standardHours, 1, 200), rushHours: n(t.rushHours, D.turnaround.rushHours, 1, 100), rushCutoff: /^\d{2}:\d{2}$/.test(t.rushCutoff) ? t.rushCutoff : D.turnaround.rushCutoff, bulkyExtraHours: n(t.bulkyExtraHours, D.turnaround.bulkyExtraHours ?? 0, 0, 100) },
    unclaimed: { remindDays: Array.isArray(u.remindDays) ? u.remindDays.map(Number).filter((x: number) => x >= 1 && x <= 365).slice(0, 5) : D.unclaimed.remindDays, disposalDays: n(u.disposalDays, D.unclaimed.disposalDays, 7, 365), warnDaysBefore: n(u.warnDaysBefore, D.unclaimed.warnDaysBefore, 1, 60) },
    delivery: { flatFeeCents: Math.round(n(dl.flatFeeCents, D.delivery.flatFeeCents, 0, 100_000)), freeOverCents: dl.freeOverCents ? Math.round(n(dl.freeOverCents, 0, 0, 10_000_000)) : D.delivery.freeOverCents, pickupFeeCents: Math.round(n(dl.pickupFeeCents, D.delivery.pickupFeeCents ?? 0, 0, 100_000)) },
    promo: cleanPromo(r.promo ?? D.promo),
    tzOffsetMin: Math.round(n(r.tzOffsetMin, D.tzOffsetMin, -840, 840)), hours, serviceTaxClass: tax,
  };
}
