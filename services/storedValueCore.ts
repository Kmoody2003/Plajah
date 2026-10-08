// storedValueCore - PURE stored-value primitive: gift cards, store credit and prepaid wallets on ONE model.
// Shared by the server (authoritative) and the register/back-office UI (previews, formatting). All money is
// integer cents. No I/O and no node:crypto here - the server injects randomness and does the code hashing.
//
//   GIFT    bearer card, code-based. Sold at the register / online, or comped by a manager.
//   CREDIT  issued for refunds/returns (STORE_CREDIT). Consolidated per customer when tied to one; bearer otherwise.
//   WALLET  tied to a Plajah customer uid, reloadable (laundromat wallet, later auto/spa prepaid plans).
//           `autoReload` is DATA ONLY for now (planned): nothing charges a card automatically yet.
//
// Money safety model: the card doc is the balance of record. Every change goes through applyOp(), a
// compare-and-swap (casCore) on the card doc that ALSO records the idempotency key + resulting ledger entry on
// the card in the same write, so a retried request replays the original result and can never double-apply.
// The append-only ledger doc (create-once, id = cardId_idemKey) is written afterwards and is repairable from
// the card's `applied` list.
//
// EXPIRY: default is NONE. Several US states (and the federal CARD Act for gift certificates) restrict or
// forbid gift-card expiry, so `expiresAt` is OWNER OPT-IN only - the issuing routes only set it when the
// owner's register settings say so. Nothing in this module invents an expiry.

import { casUpdate, type CasStore } from './casCore';

export type CardKind = 'GIFT' | 'CREDIT' | 'WALLET';
export type CardStatus = 'ACTIVE' | 'VOID' | 'EXPIRED';
export type LedgerType = 'ISSUE' | 'RELOAD' | 'REDEEM' | 'REFUND_RESTORE' | 'ADJUST' | 'VOID' | 'EXPIRE';
export const CARD_KINDS: CardKind[] = ['GIFT', 'CREDIT', 'WALLET'];
export const CARD_KIND_LABEL: Record<CardKind, string> = { GIFT: 'Gift card', CREDIT: 'Store credit', WALLET: 'Wallet' };
export const LEDGER_LABEL: Record<LedgerType, string> = {
  ISSUE: 'Issued', RELOAD: 'Reloaded', REDEEM: 'Redeemed', REFUND_RESTORE: 'Refund credited', ADJUST: 'Adjusted', VOID: 'Voided', EXPIRE: 'Expired',
};

export interface StoredValueLimits {
  minIssueGiftCents: number;   // smallest gift card that can be SOLD
  maxBalanceCents: number;     // no card may be issued/reloaded above this
  minReloadCents: number;
}
export const DEFAULT_LIMITS: StoredValueLimits = { minIssueGiftCents: 500, maxBalanceCents: 200_000, minReloadCents: 500 };
export const GIFT_PRESETS_CENTS = [1000, 2500, 5000, 10000];

/** Fields persisted on businesses/{b}/storedValue/{cardId}. The code HASH lives only in the server-only index doc. */
export interface StoredValueCard {
  kind: CardKind; status: CardStatus; balanceCents: number; initialCents: number; last4: string;
  customerUid?: string; recipientEmail?: string; recipientName?: string;
  expiresAt?: number; createdAt: number; updatedAt: number;
  /** JSON string (server writer cannot store object arrays): [{k: idemKey, e: LedgerEntryBody}] newest last, capped. */
  applied?: string;
  /** DATA ONLY (planned feature): wallet auto-reload settings. */
  autoReload?: string;
}

export interface LedgerEntryBody { type: LedgerType; deltaCents: number; balanceAfterCents: number; at: number; ref?: string; reason?: string; by?: string; byName?: string }
export interface LedgerEntry extends LedgerEntryBody { id: string; cardId: string; idemKey: string }

// ── Codes ─────────────────────────────────────────────────────────────────────────────────────────
// 16 chars of Crockford base32 = 15 random chars (75 bits, unguessable) + 1 check char, shown 4-4-4-4.
// The check char is a weighted sum mod 31 (a prime < 32, so it fits the alphabet): it catches every
// single-character typo (bar the 0<->V-class wraparound) and adjacent transpositions at the keypad/scanner.
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const valOf = (ch: string) => CODE_ALPHABET.indexOf(ch);

export function checkChar(body15: string): string {
  let sum = 0;
  for (let i = 0; i < body15.length; i++) sum += valOf(body15[i]) * (i + 1);
  return CODE_ALPHABET[sum % 31];
}

/** `rand(n)` must return n cryptographically-random bytes (server passes node:crypto randomBytes). */
export function generateCode(rand: (n: number) => ArrayLike<number>): string {
  const bytes = rand(15);
  let body = '';
  for (let i = 0; i < 15; i++) body += CODE_ALPHABET[(bytes[i] as number) & 31];
  return body + checkChar(body);
}
export const formatCode = (code16: string): string => code16.replace(/(.{4})(?=.)/g, '$1-');
export const last4Of = (code16: string): string => code16.slice(-4);

/** Typed/scanned input -> canonical 16-char code, or null when malformed / check char wrong. Crockford folds: I,L->1, O->0. */
export function normalizeCode(input: any): string | null {
  const raw = String(input ?? '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (raw.length !== 16) return null;
  for (const ch of raw) if (valOf(ch) < 0) return null;
  return checkChar(raw.slice(0, 15)) === raw[15] ? raw : null;
}

/** Pull a code out of a scanned QR payload (plain code, or a URL carrying ?gc=CODE / #CODE). */
export function codeFromScan(payload: string): string | null {
  const s = String(payload || '').trim();
  const m = s.match(/[?&#]gc=([A-Za-z0-9\-_ ]+)/i);
  return normalizeCode(m ? m[1] : s);
}

// ── Card helpers ──────────────────────────────────────────────────────────────────────────────────
export const isExpired = (c: Pick<StoredValueCard, 'expiresAt'>, now: number): boolean => !!c.expiresAt && now > c.expiresAt;
export const isSpendable = (c: Pick<StoredValueCard, 'status' | 'expiresAt' | 'balanceCents'>, now: number): boolean =>
  c.status === 'ACTIVE' && !isExpired(c, now) && c.balanceCents > 0;
/** The most this card can pay toward a ticket: capped at the balance AND at what is due. */
export const maxRedeemable = (c: Pick<StoredValueCard, 'status' | 'expiresAt' | 'balanceCents'>, dueCents: number, now: number): number =>
  isSpendable(c, now) ? Math.max(0, Math.min(Math.round(c.balanceCents), Math.round(dueCents))) : 0;

const int = (n: any): number => { const v = Math.round(Number(n)); return Number.isFinite(v) ? v : NaN; };
export const sanitizeIssueAmount = (n: any, limits = DEFAULT_LIMITS): { ok: true; cents: number } | { ok: false; error: string } => {
  const v = int(n);
  if (!Number.isFinite(v) || v <= 0) return { ok: false, error: 'Enter an amount above $0.' };
  if (v > limits.maxBalanceCents) return { ok: false, error: `Maximum is $${(limits.maxBalanceCents / 100).toFixed(2)}.` };
  return { ok: true, cents: v };
};

// ── The ledger operation (pure decision) ──────────────────────────────────────────────────────────
export interface CardInit { kind: CardKind; last4: string; initialCents: number; customerUid?: string; recipientEmail?: string; recipientName?: string; expiresAt?: number }
export interface LedgerOp {
  type: LedgerType;
  /** Required. Same key = same operation: replays return the original entry and change nothing. */
  idemKey: string;
  /** Magnitude (>0) for ISSUE/RELOAD/REDEEM/REFUND_RESTORE; SIGNED delta for ADJUST; ignored for VOID/EXPIRE. */
  amountCents?: number;
  ref?: string; reason?: string; by?: string; byName?: string;
  now: number;
  init?: CardInit;          // ISSUE only
  limits?: StoredValueLimits;
}
export type OpCode = 'EXISTS' | 'NOT_FOUND' | 'VOID' | 'EXPIRED' | 'INSUFFICIENT' | 'LIMIT' | 'BAD_AMOUNT' | 'NEEDS_REASON' | 'BAD_KIND' | 'ERROR' | 'CONFLICT';
export type OpResult =
  | { ok: true; duplicate: boolean; entry: LedgerEntryBody; balanceCents: number; kind: CardKind; last4: string; customerUid?: string }
  | { ok: false; error: string; code: OpCode; balanceCents?: number };

const APPLIED_CAP = 40;
export const parseApplied = (v: any): { k: string; e: LedgerEntryBody }[] => {
  try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; }
};

type Decision = { patch: Record<string, any>; result: OpResult } | { abort: true; result: OpResult };

export function decideOp(cur: Record<string, any> | null, op: LedgerOp): Decision {
  const limits = op.limits || DEFAULT_LIMITS;
  const fail = (code: OpCode, error: string, balanceCents?: number): Decision => ({ abort: true, result: { ok: false, code, error, ...(balanceCents !== undefined ? { balanceCents } : {}) } });
  if (!op.idemKey) return fail('ERROR', 'Missing idempotency key.');

  // Replay: the key is already recorded on the card.
  if (cur) {
    const hit = parseApplied(cur.applied).find(a => a.k === op.idemKey);
    if (hit) return { abort: true, result: { ok: true, duplicate: true, entry: hit.e, balanceCents: Math.round(Number(cur.balanceCents) || 0), kind: cur.kind, last4: String(cur.last4 || ''), ...(cur.customerUid ? { customerUid: String(cur.customerUid) } : {}) } };
  }

  const finish = (card: Record<string, any>, body: LedgerEntryBody, extra: Record<string, any> = {}): Decision => {
    const applied = [...parseApplied(card.applied), { k: op.idemKey, e: body }].slice(-APPLIED_CAP);
    return {
      patch: { balanceCents: body.balanceAfterCents, applied: JSON.stringify(applied), updatedAt: op.now, ...extra },
      result: { ok: true, duplicate: false, entry: body, balanceCents: body.balanceAfterCents, kind: card.kind, last4: String(card.last4 || ''), ...(card.customerUid ? { customerUid: String(card.customerUid) } : {}) },
    };
  };
  const body = (type: LedgerType, delta: number, after: number): LedgerEntryBody => ({
    type, deltaCents: delta, balanceAfterCents: after, at: op.now,
    ...(op.ref ? { ref: String(op.ref).slice(0, 80) } : {}), ...(op.reason ? { reason: String(op.reason).slice(0, 200) } : {}),
    ...(op.by ? { by: String(op.by).slice(0, 80) } : {}), ...(op.byName ? { byName: String(op.byName).slice(0, 80) } : {}),
  });

  if (op.type === 'ISSUE') {
    if (cur) return fail('EXISTS', 'That card already exists.');
    const init = op.init; if (!init || !CARD_KINDS.includes(init.kind)) return fail('BAD_KIND', 'Unknown card type.');
    const amt = int(init.initialCents);
    if (!Number.isFinite(amt) || amt < 0) return fail('BAD_AMOUNT', 'Enter a valid amount.');
    if (amt === 0 && init.kind !== 'WALLET') return fail('BAD_AMOUNT', 'Enter an amount above $0.');
    if (amt > limits.maxBalanceCents) return fail('LIMIT', `Maximum balance is $${(limits.maxBalanceCents / 100).toFixed(2)}.`);
    if (init.kind === 'GIFT' && amt < limits.minIssueGiftCents) return fail('LIMIT', `Minimum gift card is $${(limits.minIssueGiftCents / 100).toFixed(2)}.`);
    const card = {
      kind: init.kind, status: 'ACTIVE', balanceCents: amt, initialCents: amt, last4: init.last4, createdAt: op.now,
      ...(init.customerUid ? { customerUid: init.customerUid } : {}), ...(init.recipientEmail ? { recipientEmail: init.recipientEmail } : {}),
      ...(init.recipientName ? { recipientName: init.recipientName } : {}), ...(init.expiresAt ? { expiresAt: init.expiresAt } : {}),
    };
    return finish(card, body('ISSUE', amt, amt), card);
  }

  if (!cur) return fail('NOT_FOUND', 'Card not found.');
  const bal = Math.max(0, Math.round(Number(cur.balanceCents) || 0));
  const status = String(cur.status || 'ACTIVE') as CardStatus;
  const amt = int(op.amountCents);

  switch (op.type) {
    case 'REDEEM': {
      if (status === 'VOID') return fail('VOID', 'This card has been voided.');
      if (status === 'EXPIRED' || isExpired(cur as any, op.now)) return fail('EXPIRED', 'This card has expired.');
      if (!(amt > 0)) return fail('BAD_AMOUNT', 'Amount must be above $0.');
      if (amt > bal) return fail('INSUFFICIENT', `Card balance is only $${(bal / 100).toFixed(2)}.`, bal);
      return finish(cur, body('REDEEM', -amt, bal - amt));
    }
    case 'RELOAD': {
      if (cur.kind === 'CREDIT') return fail('BAD_KIND', 'Store credit cannot be reloaded.');
      if (status !== 'ACTIVE' || isExpired(cur as any, op.now)) return fail(status === 'VOID' ? 'VOID' : 'EXPIRED', 'This card cannot be reloaded.');
      if (!(amt > 0)) return fail('BAD_AMOUNT', 'Amount must be above $0.');
      if (amt < limits.minReloadCents) return fail('LIMIT', `Minimum reload is $${(limits.minReloadCents / 100).toFixed(2)}.`);
      if (bal + amt > limits.maxBalanceCents) return fail('LIMIT', `That would exceed the $${(limits.maxBalanceCents / 100).toFixed(2)} maximum balance.`, bal);
      return finish(cur, body('RELOAD', amt, bal + amt));
    }
    case 'REFUND_RESTORE': {
      // Money coming back (refund to the original card, or refund consolidated into a customer's credit).
      if (status !== 'ACTIVE') return fail(status === 'VOID' ? 'VOID' : 'EXPIRED', 'That card is no longer active.');
      if (!(amt > 0)) return fail('BAD_AMOUNT', 'Amount must be above $0.');
      return finish(cur, body('REFUND_RESTORE', amt, bal + amt));
    }
    case 'ADJUST': {
      if (!String(op.reason || '').trim()) return fail('NEEDS_REASON', 'A reason is required for an adjustment.');
      if (!Number.isFinite(amt) || amt === 0) return fail('BAD_AMOUNT', 'Enter a non-zero adjustment.');
      if (bal + amt < 0) return fail('INSUFFICIENT', 'That would take the balance below $0.', bal);
      if (bal + amt > limits.maxBalanceCents) return fail('LIMIT', `That would exceed the $${(limits.maxBalanceCents / 100).toFixed(2)} maximum balance.`, bal);
      return finish(cur, body('ADJUST', amt, bal + amt));
    }
    case 'VOID': {
      if (!String(op.reason || '').trim()) return fail('NEEDS_REASON', 'A reason is required to void a card.');
      if (status === 'VOID') return fail('VOID', 'Already voided.');
      return finish(cur, body('VOID', -bal, 0), { status: 'VOID' });
    }
    case 'EXPIRE': {
      if (!isExpired(cur as any, op.now)) return fail('ERROR', 'Card has not expired.');
      if (status !== 'ACTIVE') return fail(status === 'VOID' ? 'VOID' : 'EXPIRED', 'Already closed.');
      return finish(cur, body('EXPIRE', -bal, 0), { status: 'EXPIRED' });
    }
  }
  return fail('ERROR', 'Unknown operation.');
}

/** Apply one ledger operation to a card with compare-and-swap. `store` is rooted at the business's storedValue collection. */
export async function applyOp(store: CasStore, cardId: string, op: LedgerOp): Promise<OpResult> {
  const out = await casUpdate<OpResult>(store, cardId, cur => decideOp(cur, op));
  if (out.ok === true) return out.result;
  if (out.reason === 'ABORT' && out.result) return out.result;
  return out.reason === 'CONFLICT'
    ? { ok: false, code: 'CONFLICT', error: 'The card is busy - try again.' }
    : { ok: false, code: 'ERROR', error: 'Could not update the card. Nothing was changed.' };
}

export const ledgerEntryId = (cardId: string, idemKey: string): string => `${cardId}_${idemKey}`.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 200);
export const cleanIdem = (s: any, fallback: string): string => String(s ?? '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 80) || fallback;

// ── Rate limiting (pure state machine; the server keeps a Map<key,state> per instance) ─────────────
export interface RateState { count: number; windowStart: number }
export function rateCheck(prev: RateState | undefined, now: number, o: { max?: number; windowMs?: number } = {}): { allowed: boolean; state: RateState; retryAfterMs: number } {
  const max = o.max ?? 12, windowMs = o.windowMs ?? 10 * 60_000;
  const st = !prev || now - prev.windowStart >= windowMs ? { count: 0, windowStart: now } : prev;
  const next = { count: st.count + 1, windowStart: st.windowStart };
  return next.count > max ? { allowed: false, state: next, retryAfterMs: st.windowStart + windowMs - now } : { allowed: true, state: next, retryAfterMs: 0 };
}

// ── Back-office: search + liability report ─────────────────────────────────────────────────────────
export interface CardRow extends Partial<StoredValueCard> { id: string; kind: CardKind; status: CardStatus; balanceCents: number; last4: string; createdAt: number }
export function searchCards<T extends CardRow>(cards: T[], q: string): T[] {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return cards;
  return cards.filter(c => c.last4.toLowerCase() === s.replace(/[^a-z0-9]/g, '') || c.id.toLowerCase().includes(s)
    || String(c.customerUid || '').toLowerCase().includes(s) || String(c.recipientEmail || '').toLowerCase().includes(s) || String(c.recipientName || '').toLowerCase().includes(s));
}

export interface LiabilityReport {
  outstandingCents: number; activeCards: number; cardCount: number;
  byKind: Record<CardKind, { outstandingCents: number; activeCards: number }>;
  issuedCents: number; reloadedCents: number; redeemedCents: number; restoredCents: number; adjustedCents: number; voidedCents: number; expiredCents: number;
  /** DATA ONLY (no accounting treatment): cards with a balance and no activity for `dormantDays`. */
  breakage: { dormantDays: number; dormantCards: number; dormantCents: number };
}
export function buildLiabilityReport(cards: CardRow[], ledger: Pick<LedgerEntry, 'type' | 'deltaCents' | 'at'>[], range: { from: number; to: number }, now = Date.now(), dormantDays = 365): LiabilityReport {
  const live = cards.filter(c => c.status === 'ACTIVE' && !isExpired(c as any, now) && c.balanceCents > 0);
  const byKind = { GIFT: { outstandingCents: 0, activeCards: 0 }, CREDIT: { outstandingCents: 0, activeCards: 0 }, WALLET: { outstandingCents: 0, activeCards: 0 } } as LiabilityReport['byKind'];
  for (const c of live) { byKind[c.kind].outstandingCents += c.balanceCents; byKind[c.kind].activeCards++; }
  const sumOf = (t: LedgerType) => ledger.filter(e => e.type === t && e.at >= range.from && e.at <= range.to).reduce((s, e) => s + e.deltaCents, 0);
  const cutoff = now - dormantDays * 86_400_000;
  const dormant = live.filter(c => Math.max(c.updatedAt || 0, c.createdAt) < cutoff);
  return {
    outstandingCents: live.reduce((s, c) => s + c.balanceCents, 0), activeCards: live.length, cardCount: cards.length, byKind,
    issuedCents: sumOf('ISSUE'), reloadedCents: sumOf('RELOAD'), redeemedCents: -sumOf('REDEEM'), restoredCents: sumOf('REFUND_RESTORE'),
    adjustedCents: sumOf('ADJUST'), voidedCents: -sumOf('VOID'), expiredCents: -sumOf('EXPIRE'),
    breakage: { dormantDays, dormantCards: dormant.length, dormantCents: dormant.reduce((s, c) => s + c.balanceCents, 0) },
  };
}

// ── Messaging ─────────────────────────────────────────────────────────────────────────────────────
export function giftCardEmailText(o: { businessName: string; code16: string; amountCents: number; recipientName?: string; message?: string; redeemUrl?: string }): string {
  return [
    `${o.recipientName ? `Hi ${o.recipientName}, you` : 'You'} have a ${o.businessName} gift card for $${(o.amountCents / 100).toFixed(2)}.`,
    o.message ? `\n"${String(o.message).slice(0, 300)}"\n` : '',
    `Card code: ${formatCode(o.code16)}`,
    o.redeemUrl ? `Check your balance: ${o.redeemUrl}` : '',
    '\nShow this code (or the QR on the link) at checkout. Keep it safe - anyone with the code can spend it.',
  ].filter(Boolean).join('\n');
}
