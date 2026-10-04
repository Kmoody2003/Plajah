// walletPromoCore - PURE wallet top-up bonus ("load $50, get $5") and the low-wallet nudge.
// The bonus is issued by the server as a stored-value ADJUST ledger entry with a deterministic idempotency key
// (bonus_<reloadOrderId>), so a retried reload can never pay the bonus twice. Bonus value is a business COST
// (promo spend), not revenue and not a customer payment. Tests: npm run test:laundry.

export interface PromoTier { /** Reload at least this much to qualify. */ minLoadCents: number; /** Fixed bonus, or ... */ bonusCents?: number; /** ... percent of the load. */ bonusPct?: number }
export interface WalletPromo {
  enabled: boolean; tiers: PromoTier[];
  /** Hard cap on a single bonus. */ maxBonusCents?: number;
  startsAt?: number; endsAt?: number;
  /** Nudge the customer to top up below this balance. */ lowBalanceCents?: number;
  label?: string;
}
export const DEFAULT_PROMO: WalletPromo = { enabled: false, tiers: [{ minLoadCents: 5000, bonusCents: 500 }, { minLoadCents: 10000, bonusCents: 1500 }], maxBonusCents: 5000, lowBalanceCents: 500, label: 'Top-up bonus' };

const int = (v: any): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };

/** Defensive parse of stored/owner-supplied promo config. */
export function cleanPromo(raw: any): WalletPromo {
  let r = raw; if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  if (!r || typeof r !== 'object') return { ...DEFAULT_PROMO, enabled: false };
  const tiers: PromoTier[] = (Array.isArray(r.tiers) ? r.tiers : []).slice(0, 8).map((t: any) => ({
    minLoadCents: Math.max(100, Math.min(1_000_000, int(t?.minLoadCents))),
    ...(t?.bonusCents !== undefined && t.bonusCents !== null && t.bonusCents !== '' ? { bonusCents: Math.max(0, Math.min(1_000_000, int(t.bonusCents))) } : {}),
    ...(t?.bonusPct !== undefined && t.bonusPct !== null && t.bonusPct !== '' ? { bonusPct: Math.max(0, Math.min(100, Number(t.bonusPct) || 0)) } : {}),
  })).filter((t: PromoTier) => t.bonusCents !== undefined || t.bonusPct !== undefined);
  return {
    enabled: r.enabled === true, tiers,
    ...(r.maxBonusCents ? { maxBonusCents: Math.max(0, int(r.maxBonusCents)) } : {}),
    ...(r.startsAt ? { startsAt: int(r.startsAt) } : {}), ...(r.endsAt ? { endsAt: int(r.endsAt) } : {}),
    lowBalanceCents: Math.max(0, int(r.lowBalanceCents ?? DEFAULT_PROMO.lowBalanceCents)),
    label: String(r.label || DEFAULT_PROMO.label).slice(0, 60),
  };
}

export const promoActive = (p: WalletPromo, now: number): boolean => p.enabled && p.tiers.length > 0 && (!p.startsAt || now >= p.startsAt) && (!p.endsAt || now <= p.endsAt);

export interface BonusResult { bonusCents: number; tier?: PromoTier; label: string }
/** Best qualifying tier (highest min that the load meets). Percent tiers round to the cent; the cap applies last. */
export function computeTopUpBonus(p: WalletPromo, loadCents: number, now = Date.now()): BonusResult {
  const load = int(loadCents); const none: BonusResult = { bonusCents: 0, label: '' };
  if (!promoActive(p, now) || load <= 0) return none;
  const tiers = [...p.tiers].sort((a, b) => b.minLoadCents - a.minLoadCents);
  const tier = tiers.find(t => load >= t.minLoadCents); if (!tier) return none;
  let bonus = tier.bonusCents !== undefined ? tier.bonusCents : Math.round(load * (tier.bonusPct || 0) / 100);
  if (p.maxBonusCents !== undefined && p.maxBonusCents > 0) bonus = Math.min(bonus, p.maxBonusCents);
  bonus = Math.max(0, bonus);
  return bonus > 0 ? { bonusCents: bonus, tier, label: `${p.label || 'Top-up bonus'}: load $${(tier.minLoadCents / 100).toFixed(0)}, get $${(bonus / 100).toFixed(2)}` } : none;
}
export const bonusIdemKey = (reloadOrderId: string): string => `bonus_${String(reloadOrderId).replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 70)}`;

/** Next tier up from a given load: "add $X more to get $Y". */
export function nextTierHint(p: WalletPromo, loadCents: number, now = Date.now()): { addCents: number; bonusCents: number } | null {
  if (!promoActive(p, now)) return null;
  const cur = computeTopUpBonus(p, loadCents, now).bonusCents;
  for (const t of [...p.tiers].sort((a, b) => a.minLoadCents - b.minLoadCents)) {
    if (t.minLoadCents <= loadCents) continue;
    const b = computeTopUpBonus(p, t.minLoadCents, now).bonusCents;
    if (b > cur) return { addCents: t.minLoadCents - Math.max(0, loadCents), bonusCents: b };
  }
  return null;
}

export type NudgeLevel = 'ok' | 'low' | 'short';
export interface WalletNudge { level: NudgeLevel; message: string; suggestLoadCents: number; shortfallCents: number }
/** At pickup: is the wallet enough for what's owed, and is it getting low? `suggestLoadCents` rounds up to a promo tier when that's close. */
export function walletNudge(a: { balanceCents: number; dueCents: number; promo?: WalletPromo; now?: number }): WalletNudge {
  const bal = Math.max(0, int(a.balanceCents)), due = Math.max(0, int(a.dueCents)); const p = a.promo || DEFAULT_PROMO; const now = a.now ?? Date.now();
  const low = p.lowBalanceCents ?? 500;
  const shortfall = Math.max(0, due - bal);
  const round5 = (c: number) => Math.ceil(c / 500) * 500;
  if (shortfall > 0) {
    let load = Math.max(500, round5(shortfall));
    const tiers = [...p.tiers].filter(t => t.minLoadCents >= load).sort((x, y) => x.minLoadCents - y.minLoadCents);
    const near = promoActive(p, now) ? tiers.find(t => t.minLoadCents - load <= 2000) : undefined;
    if (near) load = near.minLoadCents;
    const b = computeTopUpBonus(p, load, now);
    return { level: 'short', shortfallCents: shortfall, suggestLoadCents: load, message: `Wallet is $${(shortfall / 100).toFixed(2)} short.${b.bonusCents ? ` Load $${(load / 100).toFixed(0)} and get $${(b.bonusCents / 100).toFixed(2)} free.` : ''}` };
  }
  if (bal - due < low) {
    const target = promoActive(p, now) ? [...p.tiers].sort((x, y) => x.minLoadCents - y.minLoadCents)[0]?.minLoadCents ?? 2000 : 2000;
    const b = computeTopUpBonus(p, target, now);
    return { level: 'low', shortfallCents: 0, suggestLoadCents: target, message: `Only $${((bal - due) / 100).toFixed(2)} will be left after this.${b.bonusCents ? ` Top up $${(target / 100).toFixed(0)} and get $${(b.bonusCents / 100).toFixed(2)} free.` : ' Top up to skip the line next time.'}` };
  }
  return { level: 'ok', shortfallCents: 0, suggestLoadCents: 0, message: '' };
}
