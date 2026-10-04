// tenderCore — PURE split-tender validation for the register. Shared by server (authoritative) and
// client (live "remaining" hints). All money is integer cents.
//
// Tender shapes (the union is extensible: add a type to ENABLED_TENDER_TYPES when its backend exists):
//   CASH      { amountCents (applied to the bill), tenderedCents (handed over), changeCents }
//   CARD      external terminal; optional `reference` (auth code / last4). Stripe Terminal stays gated off.
//   EXTERNAL  { kind: EBT_SNAP | EBT_CASH | CHECK | OTHER, reference, balanceCents? } - approved on the
//             merchant's own device; EBT kinds REQUIRE the approval reference.
//   GIFT / STORE_CREDIT / WALLET  stored value (services/storedValueCore). GIFT needs a valid card `code`; STORE_CREDIT and
//             WALLET take a `code` OR (server-side) resolve to the attached customer's credit / wallet. The raw code is
//             only used by the server to find the card - it is stripped before the order is stored.

import { normalizeCode } from './storedValueCore';

export type TenderType = 'CASH' | 'CARD' | 'EXTERNAL' | 'GIFT' | 'STORE_CREDIT' | 'WALLET';
export const STORED_VALUE_TENDERS: TenderType[] = ['GIFT', 'STORE_CREDIT', 'WALLET'];
export const isStoredValueTender = (t: Pick<Tender, 'type'> | string): boolean => STORED_VALUE_TENDERS.includes((typeof t === 'string' ? t : t.type) as TenderType);
export type ExternalKind = 'EBT_SNAP' | 'EBT_CASH' | 'CHECK' | 'OTHER';
export const EXTERNAL_KINDS: ExternalKind[] = ['EBT_SNAP', 'EBT_CASH', 'CHECK', 'OTHER'];
export const ENABLED_TENDER_TYPES: TenderType[] = ['CASH', 'CARD', 'EXTERNAL', 'GIFT', 'STORE_CREDIT', 'WALLET'];

export interface Tender {
  type: TenderType;
  amountCents: number;
  tenderedCents?: number;   // CASH only
  changeCents?: number;     // CASH only
  kind?: ExternalKind;      // EXTERNAL only
  reference?: string;
  balanceCents?: number;    // EBT remaining benefit balance (printed on the receipt); stored value: balance AFTER this sale
  code?: string;            // stored value only: normalized 16-char card code (server strips before storing)
  cardId?: string;          // stored value only: resolved by the server
  cardLast4?: string;       // stored value only: printed on receipts
}

export type TenderResult =
  | { ok: true; tenders: Tender[]; cashCents: number; snapCents: number; changeCents: number }
  | { ok: false; error: string };

const cleanRef = (s: any): string => String(s ?? '').replace(/[^A-Za-z0-9 _\-#.]/g, '').trim().slice(0, 40);
const int = (n: any): number => { const v = Math.round(Number(n)); return Number.isFinite(v) ? v : NaN; };

export const MAX_TIP_CENTS = 1_000_000;

/** Tip must be a non-negative integer, capped (a typo like $5000 should not go through). */
export function sanitizeTip(n: any): number {
  const v = int(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(MAX_TIP_CENTS, v)) : 0;
}

/** Tip from a percent preset on the pre-tax net (server and UI agree). */
export function tipFromPercent(netCents: number, pct: number): number {
  return sanitizeTip(Math.round(Math.max(0, netCents) * Math.max(0, pct) / 100));
}

/**
 * Validate `raw` tenders against `dueCents` (total + tip). Rules:
 *  - at least one tender, every amount a positive integer, type enabled
 *  - amounts SUM EXACTLY to dueCents
 *  - CASH: tenderedCents (if sent) must cover its amount; change = tendered - amount
 *  - EXTERNAL: valid kind; EBT_* needs an approval reference
 *  - total EBT_SNAP can never exceed `snapMaxCents` (eligible subtotal)
 */
export function validateTenders(raw: any, dueCents: number, opts: { snapMaxCents?: number; storedValueMaxCents?: number } = {}): TenderResult {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'Choose how the customer is paying.' };
  if (raw.length > 6) return { ok: false, error: 'Too many tenders on one ticket.' };
  const due = Math.round(dueCents);
  const out: Tender[] = [];
  let sum = 0, cash = 0, snap = 0, change = 0, stored = 0;
  for (const r of raw) {
    const type = String(r?.type || '').toUpperCase() as TenderType;
    if (!ENABLED_TENDER_TYPES.includes(type)) return { ok: false, error: `${type || 'That'} tender is not available yet.` };
    const amount = int(r?.amountCents);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Each tender needs an amount above $0.' };
    const t: Tender = { type, amountCents: amount };
    if (type === 'CASH') {
      const tendered = r?.tenderedCents === undefined || r?.tenderedCents === null ? amount : int(r.tenderedCents);
      if (!Number.isFinite(tendered) || tendered < amount) return { ok: false, error: 'Cash handed over is less than the cash amount.' };
      t.tenderedCents = tendered; t.changeCents = tendered - amount;
      cash += amount; change += t.changeCents;
    } else if (type === 'CARD') {
      const ref = cleanRef(r?.reference); if (ref) t.reference = ref;
    } else if (type === 'EXTERNAL') {
      const kind = String(r?.kind || '').toUpperCase() as ExternalKind;
      if (!EXTERNAL_KINDS.includes(kind)) return { ok: false, error: 'Pick the external tender type (EBT SNAP, EBT cash, check, other).' };
      t.kind = kind;
      const ref = cleanRef(r?.reference);
      if ((kind === 'EBT_SNAP' || kind === 'EBT_CASH') && ref.length < 4) return { ok: false, error: 'Enter the EBT approval reference from the terminal.' };
      if (ref) t.reference = ref;
      if ((kind === 'EBT_SNAP' || kind === 'EBT_CASH') && r?.balanceCents !== undefined && r?.balanceCents !== null && r?.balanceCents !== '') {
        const b = int(r.balanceCents); if (Number.isFinite(b) && b >= 0) t.balanceCents = b;
      }
      if (kind === 'EBT_SNAP') snap += amount;
    } else if (isStoredValueTender(type)) {
      const rawCode = String(r?.code ?? '').trim();
      if (rawCode) {
        const code = normalizeCode(rawCode);
        if (!code) return { ok: false, error: 'That card code is not valid - check it and try again.' };
        t.code = code;
      } else if (type === 'GIFT') return { ok: false, error: 'Scan or type the gift card code.' };
      stored += amount;
    }
    sum += amount; out.push(t);
  }
  if (snap > Math.max(0, Math.round(opts.snapMaxCents ?? 0))) {
    return { ok: false, error: `EBT SNAP can cover at most $${(Math.max(0, opts.snapMaxCents ?? 0) / 100).toFixed(2)} (eligible items only).` };
  }
  if (opts.storedValueMaxCents !== undefined && stored > Math.max(0, Math.round(opts.storedValueMaxCents))) {
    return { ok: false, error: 'Gift cards, store credit and wallets cannot pay for gift cards or wallet reloads.' };
  }
  if (sum !== due) return { ok: false, error: `Tenders add up to $${(sum / 100).toFixed(2)} but the ticket is $${(due / 100).toFixed(2)}.` };
  return { ok: true, tenders: out, cashCents: cash, snapCents: snap, changeCents: change };
}

/** Compact label for receipts / reports, e.g. 'EBT SNAP', 'Cash', 'Card'. */
export function tenderLabel(t: Pick<Tender, 'type' | 'kind'>): string {
  if (t.type === 'EXTERNAL') return ({ EBT_SNAP: 'EBT SNAP', EBT_CASH: 'EBT Cash', CHECK: 'Check', OTHER: 'Other' } as Record<string, string>)[t.kind || 'OTHER'] || 'Other';
  return ({ CASH: 'Cash', CARD: 'Card', GIFT: 'Gift card', STORE_CREDIT: 'Store credit', WALLET: 'Wallet' } as Record<string, string>)[t.type] || t.type;
}
/** Stable bucket key for reports: CASH, CARD, EBT_SNAP, EBT_CASH, CHECK, OTHER... */
export const tenderKey = (t: Pick<Tender, 'type' | 'kind'>): string => (t.type === 'EXTERNAL' ? (t.kind || 'OTHER') : t.type);

/** Parse the JSON string stored on the order; tolerant of legacy orders (single `tender` string). */
export function parseTenders(json: any, legacyTender?: string, totalCents = 0): Tender[] {
  try { const v = typeof json === 'string' ? JSON.parse(json) : json; if (Array.isArray(v)) return v as Tender[]; } catch { /* legacy */ }
  const type = legacyTender === 'CARD' ? 'CARD' : 'CASH';
  return totalCents > 0 ? [{ type, amountCents: totalCents }] : [];
}
