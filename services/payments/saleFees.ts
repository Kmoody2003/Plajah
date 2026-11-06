// The one rule for what a direct sale costs a seller, and how the rest is shared.
//   Plajah: 5%, or 0% when the seller holds Plajah+.
//   Card processing: passed through to the seller, on every sale, whichever rate applies.
// Processing is an estimate of Stripe's US card rate, so the amount is known at checkout. Plajah
// carries any difference on the real charge.

export const DIRECT_SALE_FEE_PCT = 5;

export const estimateProcessingCents = (grossCents: number) =>
  grossCents > 0 ? Math.ceil(grossCents * 0.029) + 30 : 0;

export interface SaleBreakdown {
  feePct: number;
  platformFeeCents: number;
  processingCents: number;
  /** What the seller receives before any collaborator splits. */
  sellerCents: number;
  /** What a destination charge withholds: Plajah's fee plus the processing it pays Stripe. */
  applicationFeeCents: number;
}

export function saleBreakdown(grossCents: number, sellerHasPlus: boolean): SaleBreakdown {
  const gross = Math.max(0, Math.round(grossCents));
  const feePct = sellerHasPlus ? 0 : DIRECT_SALE_FEE_PCT;
  const platformFeeCents = Math.round(gross * feePct / 100);
  const processingCents = Math.min(gross - platformFeeCents, estimateProcessingCents(gross));
  const applicationFeeCents = platformFeeCents + processingCents;
  return { feePct, platformFeeCents, processingCents, sellerCents: gross - applicationFeeCents, applicationFeeCents };
}

/** What a bound creator receives from one month of Plajah+ dues, by tier. Plajah's share covers processing. */
export const PLAJAH_PLUS_CREATOR_CENTS: Record<number, number> = { 1: 299, 2: 599, 3: 999 };

export function plajahPlusBreakdown(grossCents: number, tier: number): SaleBreakdown {
  const gross = Math.max(0, Math.round(grossCents));
  // A discounted charge can't pay out more than was collected.
  const sellerCents = Math.min(gross, PLAJAH_PLUS_CREATOR_CENTS[tier] ?? PLAJAH_PLUS_CREATOR_CENTS[1]);
  const platformFeeCents = gross - sellerCents;
  return { feePct: gross ? Math.round(platformFeeCents / gross * 100) : 0, platformFeeCents, processingCents: 0, sellerCents, applicationFeeCents: platformFeeCents };
}

export interface SplitRecipient { creatorUid?: unknown; displayName?: unknown; percentage?: unknown }
export interface SplitShare { creatorUid: string; displayName: string; percentage: number; amountCents: number }

/**
 * Share a seller's net with their collaborators. Each share rounds down and the seller keeps the
 * rest, so the parts always add up to exactly `netCents`. Shares are limited to 99% in total, and
 * a recipient with no account id or no positive percentage is ignored.
 */
export function allocateSplits(netCents: number, recipients: SplitRecipient[]): { sellerCents: number; splits: SplitShare[] } {
  const net = Math.max(0, Math.round(netCents));
  const splits: SplitShare[] = [];
  let usedPct = 0, usedCents = 0;
  for (const r of recipients) {
    const creatorUid = typeof r?.creatorUid === 'string' ? r.creatorUid.trim() : '';
    const wanted = Number(r?.percentage);
    if (!creatorUid || !(wanted > 0)) continue;
    const percentage = Math.min(wanted, 99 - usedPct);
    if (!(percentage > 0)) break;
    const amountCents = Math.floor(net * percentage / 100);
    usedPct += percentage;
    usedCents += amountCents;
    splits.push({ creatorUid, displayName: String(r.displayName ?? ''), percentage, amountCents });
  }
  return { sellerCents: net - usedCents, splits };
}
