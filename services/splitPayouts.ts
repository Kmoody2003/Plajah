// Paying creators and their collaborators: the one split config shape (types.ts SplitConfig) and the rules
// for moving money against two ledgers.
//
// Sales with one payee are destination charges (services/payments/directRoute.ts): their earning is recorded
// 'paid_direct' and only touched here to reverse a refund or lost dispute. Sales with collaborators land on the
// platform for a moment, and these rules send each share straight on.
//
// creatorEarnings/{saleId} holds the creator's own share of a sale. creatorSplitPayouts/{saleId}_{uid} holds
// each collaborator's. A row is written before any money moves, so a Stripe failure or a crash leaves a row
// that a later sweep pays, instead of a payment nobody remembers. Checkout refuses a sale unless everyone can
// be paid, so 'awaiting_connect' only happens if a collaborator removes their account after a subscription began.
//
// Paying twice is prevented in two layers, because Stripe only keeps idempotency keys for about 24 hours:
//  1. The key only changes after Stripe definitely refused the request. A timeout or 5xx retries the SAME
//     key, so an in-doubt transfer replays rather than repeats.
//  2. Every attempt except the first looks for an existing transfer carrying this row's id in metadata,
//     which catches a transfer whose row update was lost, however long ago.
//
// Refunds and lost disputes set clawbackCents, the running total to take back. Reversals are sized against
// what Stripe says was already reversed, so repeats and overlapping events can't take back too much.
import type { SplitRecipient } from '../types';

export const SPLIT_PAYOUTS = 'creatorSplitPayouts';
export const MAX_SPLIT_RECIPIENTS = 20;
export const CREATOR_EARNINGS = 'creatorEarnings';
export const DEFAULT_APPLIES_TO = ['digital_sale', 'sanctuary', 'plajahplus'];
// Tips and store orders are destination charges: the money goes straight to the creator, so there's nothing
// for the platform to divide.
const NEVER_SPLIT = new Set(['tip', 'store_order']);
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const RETRY_BASE_MS = 15 * 60_000;
const RETRY_MAX_MS = 24 * 3_600_000;

export type SplitPayoutStatus = 'awaiting_connect' | 'pending' | 'paid_out' | 'refunded';
export type PayResult = 'paid' | 'awaiting_connect' | 'failed' | 'skipped';

export interface SplitLine { creatorUid: string; displayName: string; amountCents: number; percentage: number }

// ── Config ────────────────────────────────────────────────────────────────────

type Checked = { ok: true; recipients: SplitRecipient[]; appliesTo: string[] } | { ok: false; error: string };

/** Validate a split config. Percentages are checked one by one: a negative share must not offset a share over 100. */
export function checkSplitConfig(recipients: unknown, appliesTo: unknown, ownerUid: string): Checked {
  if (!Array.isArray(recipients)) return { ok: false, error: 'recipients required' };
  if (recipients.length > MAX_SPLIT_RECIPIENTS) return { ok: false, error: `At most ${MAX_SPLIT_RECIPIENTS} recipients` };
  const clean: SplitRecipient[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const r of recipients as any[]) {
    const uid = String(r?.creatorUid ?? '');
    const pct = r?.percentage;
    if (!SAFE_UID.test(uid)) return { ok: false, error: 'Each recipient needs a valid user id' };
    if (uid === ownerUid) return { ok: false, error: 'You already keep what remains after splits' };
    if (seen.has(uid)) return { ok: false, error: 'Each recipient can only be listed once' };
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0 || pct >= 100) return { ok: false, error: 'Each percentage must be above 0 and below 100' };
    seen.add(uid);
    total += pct;
    clean.push({ creatorUid: uid, displayName: String(r?.displayName ?? '').slice(0, 120), ...(r?.photoURL ? { photoURL: String(r.photoURL).slice(0, 1000) } : {}), percentage: pct });
  }
  if (total >= 100) return { ok: false, error: 'Split percentages must sum to less than 100' };
  const cats = Array.isArray(appliesTo) ? appliesTo.filter((c): c is string => typeof c === 'string' && !NEVER_SPLIT.has(c)).slice(0, 20) : DEFAULT_APPLIES_TO;
  return { ok: true, recipients: clean, appliesTo: cats };
}

/** The recipients that apply to one sale, from a stored creatorSplits doc. A bad doc pays no splits, never a wrong amount. */
export function activeRecipients(rawRecipients: string | undefined, rawAppliesTo: string | undefined, ownerUid: string, category: string): SplitRecipient[] {
  try {
    const checked = checkSplitConfig(JSON.parse(rawRecipients ?? '[]'), JSON.parse(rawAppliesTo ?? '[]'), ownerUid);
    if (checked.ok === false) { console.error(`[Splits] ignoring invalid config for ${ownerUid}: ${checked.error}`); return []; }
    return checked.appliesTo.includes(category) ? checked.recipients : [];
  } catch { return []; }
}

/** Divide a sale's net. Recipients round down and the creator keeps the remainder, so the total can't exceed the net. */
export function allocateSplits(netCents: number, recipients: SplitRecipient[]): { creatorNetCents: number; lines: SplitLine[] } {
  const lines = recipients
    .map(r => ({ creatorUid: r.creatorUid, displayName: r.displayName, amountCents: Math.floor(netCents * r.percentage / 100), percentage: r.percentage }))
    .filter(l => l.amountCents > 0);
  return { creatorNetCents: netCents - lines.reduce((s, l) => s + l.amountCents, 0), lines };
}

/**
 * What a re-fired webhook should still make sure is recorded. Only earnings stamped splitLedger qualify:
 * older ones may already have been paid by the transfer call that had no record of itself.
 */
export function splitsOwedByEarning(earning: Record<string, any> | null | undefined): SplitLine[] {
  if (!earning || earning.splitLedger !== true || earning.status === 'refunded') return [];
  try { const v = JSON.parse(earning.splits ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ── Retry rules ───────────────────────────────────────────────────────────────

/** True only when Stripe definitely refused and created nothing, so a new idempotency key is safe. */
export function isDefiniteRejection(e: any): boolean {
  if (e?.type === 'StripeIdempotencyError' || e?.code === 'idempotency_key_in_use') return false;
  return [400, 402, 403, 404].includes(Number(e?.statusCode));
}

export function retryDue(row: Record<string, any>, now: number): boolean {
  const attempts = Number(row.attempts) || 0;
  if (!attempts) return true;
  const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1));
  return now - (Number(row.lastPayoutAttemptAt) || 0) >= wait;
}

// ── Ledger ────────────────────────────────────────────────────────────────────

export interface SplitPayoutDeps {
  read(collection: string, id: string): Promise<Record<string, any> | null>;
  createOnce(collection: string, id: string, data: Record<string, any>): Promise<'created' | 'exists' | 'error'>;
  patch(collection: string, id: string, data: Record<string, any>): Promise<unknown>;
  query(collection: string, filters: Array<{ field: string; op: string; value: any }>, limit: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
  getStripe(): any;
  /** Tell a recipient they have money waiting behind Connect onboarding. */
  notifyAwaitingConnect(uid: string): Promise<unknown>;
  now?(): number;
}

interface RowKind {
  collection: string;
  payee(row: Record<string, any>): string;
  cents(row: Record<string, any>): number;
  createdAt(row: Record<string, any>): number;
  payable(id: string, row: Record<string, any>): boolean;
  key(id: string, rejections: number): string;
  isThisTransfer(id: string, transfer: any): boolean;
  metadata(id: string, row: Record<string, any>): Record<string, string>;
}

const SPLIT: RowKind = {
  collection: SPLIT_PAYOUTS,
  payee: r => r.recipientUid,
  cents: r => Number(r.amountCents) || 0,
  createdAt: r => Number(r.createdAt) || 0,
  payable: (_id, r) => r.status === 'pending' || r.status === 'awaiting_connect',
  key: (id, rejections) => `split_${id}_${rejections}`,
  isThisTransfer: (id, t) => t.metadata?.payoutId === id,
  metadata: (id, r) => ({ type: 'split', payoutId: id, earningId: r.earningId, fromCreatorUid: r.fromCreatorUid, toCreatorUid: r.recipientUid, category: r.category }),
};

// Every platform-collected category the webhook records as 'pending'. Destination charges are 'paid_direct'.
const SWEEPABLE = new Set(['content_purchase', 'sanctuary', 'club', 'seedraiser', 'digital_sale', 'plajahplus']);
const EARNING: RowKind = {
  collection: CREATOR_EARNINGS,
  payee: r => r.creatorUid,
  cents: r => Number(r.creatorNetCents) || 0,
  createdAt: r => Number(r.timestamp) || 0,
  // Older club/seedraiser rows could name the BUYER as creatorUid, so only rows written since that fix
  // (payeeVerified) are paid out; content sales always resolved the payee server-side.
  payable: (id, r) => r.status === 'pending' && SWEEPABLE.has(r.category) && (id.startsWith('cs_') || id.startsWith('inv_'))
    && (r.category === 'content_purchase' || r.payeeVerified === true),
  // Rows first attempted before this ledger used the bare key, so the first attempt keeps it.
  key: (id, rejections) => rejections ? `earning_${id}_${rejections}` : `earning_${id}`,
  isThisTransfer: (id, t) => t.metadata?.type === 'creator_earning' && t.metadata?.earningId === id,
  metadata: (id, r) => ({ type: 'creator_earning', earningId: id, creatorUid: r.creatorUid, category: r.category }),
};
const KINDS = [EARNING, SPLIT];

export function createCreatorPayouts(deps: SplitPayoutDeps) {
  const now = () => deps.now?.() ?? Date.now();

  async function findExistingTransfer(kind: RowKind, id: string, destination: string, createdAt: number): Promise<any | null> {
    const stripe = deps.getStripe();
    const gte = Math.floor(createdAt / 1000) - 60;
    let starting_after: string | undefined;
    for (;;) {
      const page = await stripe.transfers.list({ destination, created: { gte }, limit: 100, ...(starting_after ? { starting_after } : {}) });
      const hit = page.data.find((t: any) => kind.isThisTransfer(id, t));
      if (hit) return hit;
      if (!page.has_more || !page.data.length) return null;
      starting_after = page.data[page.data.length - 1].id;
    }
  }

  async function markPaid(kind: RowKind, id: string, transferId: string): Promise<void> {
    // A lost write here is safe: the next sweep finds this transfer by its metadata and doesn't send another.
    try { await deps.patch(kind.collection, id, { status: 'paid_out', transferId, paidOutAt: now(), lastPayoutError: null, payoutFailing: false }); }
    catch (e: any) { console.error(`[Payouts] ${id} paid but not marked:`, e?.message || e); }
  }

  /** The buyer's charge for this row, fixed once so every retry sends the same parameters under its key. */
  async function sourceChargeFor(kind: RowKind, id: string, row: Record<string, any>): Promise<string> {
    if (typeof row.sourceCharge === 'string') return row.sourceCharge;
    if (!row.stripePaymentIntentId) return '';
    try {
      const charge = (await deps.getStripe().paymentIntents.retrieve(row.stripePaymentIntentId))?.latest_charge;
      if (!charge) return '';
      await deps.patch(kind.collection, id, { sourceCharge: String(charge) }).catch(() => {});
      return String(charge);
    } catch { return ''; }   // draws on balance
  }

  async function payRow(kind: RowKind, id: string, firstAttempt = false): Promise<PayResult> {
    const row = await deps.read(kind.collection, id);
    if (!row || !kind.payable(id, row) || row.disputeHold === true) return 'skipped';
    const clawback = Number(row.clawbackCents) || 0;
    const amount = kind.cents(row) - clawback;
    if (!(amount > 0)) {
      if (clawback > 0) await deps.patch(kind.collection, id, { status: 'refunded', refundedAt: now() });
      return 'skipped';
    }
    const destination = (await deps.read('users', kind.payee(row)))?.stripeConnectAccountId as string | undefined;
    if (!destination) {
      if (kind === SPLIT && row.status !== 'awaiting_connect') await deps.patch(kind.collection, id, { status: 'awaiting_connect' });
      return 'awaiting_connect';
    }
    const attempts = Number(row.attempts) || 0;
    const rejections = Number(row.rejections) || 0;
    try {
      const stripe = deps.getStripe();
      if (!firstAttempt) {
        const existing = await findExistingTransfer(kind, id, destination, kind.createdAt(row));
        if (existing) {
          await markPaid(kind, id, existing.id);
          if (clawback > 0) await settle(kind, id);   // it went out at full price before the refund arrived
          return 'paid';
        }
      }
      const source = await sourceChargeFor(kind, id, row);
      const transfer = await stripe.transfers.create({
        amount,
        currency: 'usd',
        destination,
        ...(source ? { source_transaction: source } : {}),
        metadata: kind.metadata(id, row),
      }, { idempotencyKey: kind.key(id, rejections) + (clawback ? `_c${clawback}` : '') });
      await markPaid(kind, id, transfer.id);
      return 'paid';
    } catch (e: any) {
      console.error(`[Payouts] ${id} transfer failed:`, e?.message || e);
      // Status is left alone: a concurrent attempt on the same key may have succeeded and marked it paid.
      await deps.patch(kind.collection, id, {
        lastPayoutError: String(e?.message || e).slice(0, 300), lastPayoutAttemptAt: now(), attempts: attempts + 1,
        rejections: rejections + (isDefiniteRejection(e) ? 1 : 0), payoutFailing: true,
      }).catch(() => {});
      return 'failed';
    }
  }

  /** Bring one row in line with its clawbackCents. Failures stay on the row for retryReversals. */
  async function settle(kind: RowKind, id: string): Promise<boolean> {
    const row = await deps.read(kind.collection, id);
    if (!row) return true;
    const target = Number(row.clawbackCents) || 0;
    const fully = target >= kind.cents(row);
    if (row.status === 'pending' || row.status === 'awaiting_connect') {
      if (fully) await deps.patch(kind.collection, id, { status: 'refunded', refundedAt: now() });
      return true;   // a later payment is reduced by clawbackCents
    }
    if (row.status !== 'paid_out' && row.status !== 'paid_direct') return true;
    try {
      const stripe = deps.getStripe();
      // A destination charge made its own transfer, which only the charge knows about.
      const transferId = row.transferId || (row.status === 'paid_direct' && row.stripePaymentIntentId
        ? (await stripe.paymentIntents.retrieve(row.stripePaymentIntentId, { expand: ['latest_charge'] }))?.latest_charge?.transfer
        : '');
      if (!transferId) return true;
      const transfer = await stripe.transfers.retrieve(String(transferId));
      const delta = target - (Number(transfer.amount_reversed) || 0);
      if (delta > 0) await stripe.transfers.createReversal(String(transferId), { amount: delta }, { idempotencyKey: `reverse_${id}_${target}` });
      await deps.patch(kind.collection, id, { reversalDue: false, lastReversalError: null, ...(fully ? { status: 'refunded', refundedAt: now() } : {}) });
      return true;
    } catch (e: any) {
      console.error(`[Payouts] reversal for ${id} failed:`, e?.message || e);
      await deps.patch(kind.collection, id, { reversalDue: true, lastReversalError: String(e?.message || e).slice(0, 300) }).catch(() => {});
      return false;
    }
  }

  /**
   * Write a sale's collaborator rows, then pay the new ones. Safe to repeat: rows have deterministic ids, and
   * rows that already existed are left to the sweep. ok:false means a row wasn't recorded and the webhook must be re-sent.
   */
  async function recordAndPay(sale: { earningId: string; fromCreatorUid: string; category: string; title: string; paymentIntentId: string; lines: SplitLine[] }): Promise<{ ok: boolean }> {
    let ok = true;
    for (const line of sale.lines) {
      if (!(line.amountCents > 0)) continue;
      const payoutId = `${sale.earningId}_${line.creatorUid}`;
      const created = await deps.createOnce(SPLIT_PAYOUTS, payoutId, {
        earningId: sale.earningId,
        fromCreatorUid: sale.fromCreatorUid,
        recipientUid: line.creatorUid,
        displayName: line.displayName || '',
        amountCents: line.amountCents,
        percentage: line.percentage,
        category: sale.category,
        title: sale.title,
        stripePaymentIntentId: sale.paymentIntentId,
        status: 'pending',
        attempts: 0,
        rejections: 0,
        createdAt: now(),
      });
      if (created === 'error') { ok = false; continue; }
      if (created !== 'created') continue;
      if (await payRow(SPLIT, payoutId, true) === 'awaiting_connect') {
        await deps.notifyAwaitingConnect(line.creatorUid).catch((e: any) => console.error('[Payouts] notify failed:', e?.message || e));
      }
    }
    return { ok };
  }

  type Row = { id: string; data: Record<string, any> };
  async function sweep(kind: RowKind, rows: Row[]): Promise<{ paid: number; waiting: number }> {
    let paid = 0, waiting = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (!kind.payable(r.id, r.data) || !retryDue(r.data, now())) { waiting++; continue; }
      if (await payRow(kind, r.id) === 'paid') paid++; else waiting++;
    }
    return { paid, waiting };
  }
  const add = (a: { paid: number; waiting: number }, b: { paid: number; waiting: number }) => ({ paid: a.paid + b.paid, waiting: a.waiting + b.waiting });
  const q = (collection: string, filters: Record<string, any>, limit: number) =>
    deps.query(collection, Object.entries(filters).map(([field, value]) => ({ field, op: 'EQUAL', value })), limit);

  /** Everything owed to one person. Run when they finish Connect onboarding. */
  async function payPendingFor(uid: string): Promise<{ paid: number; waiting: number }> {
    const [earnings, awaiting, pending] = await Promise.all([
      q(CREATOR_EARNINGS, { creatorUid: uid, status: 'pending' }, 200),
      q(SPLIT_PAYOUTS, { recipientUid: uid, status: 'awaiting_connect' }, 200),
      q(SPLIT_PAYOUTS, { recipientUid: uid, status: 'pending' }, 200),
    ]);
    return add(await sweep(EARNING, earnings), await sweep(SPLIT, [...awaiting, ...pending]));
  }

  /**
   * The retry job: failed transfers first, so people waiting on Connect can't crowd them out of the limit,
   * then everything unpaid, which catches anyone who connected without the status check running.
   */
  async function retryFailed(limit = 200): Promise<{ paid: number; waiting: number }> {
    const [failingEarnings, earnings, failingSplits, pending, awaiting] = await Promise.all([
      q(CREATOR_EARNINGS, { status: 'pending', payoutFailing: true }, limit),
      q(CREATOR_EARNINGS, { status: 'pending' }, limit),
      q(SPLIT_PAYOUTS, { status: 'pending', payoutFailing: true }, limit),
      q(SPLIT_PAYOUTS, { status: 'pending' }, limit),
      q(SPLIT_PAYOUTS, { status: 'awaiting_connect' }, limit),
    ]);
    return add(await sweep(EARNING, [...failingEarnings, ...earnings]), await sweep(SPLIT, [...failingSplits, ...pending, ...awaiting]));
  }

  /** Reversals that failed, usually because the recipient's balance was already paid out. */
  async function retryReversals(limit = 100): Promise<number> {
    let done = 0;
    for (const kind of KINDS) {
      for (const r of await q(kind.collection, { reversalDue: true }, limit)) if (await settle(kind, r.id)) done++;
    }
    return done;
  }

  /** Stripe's running total refunded on a charge: take back the same fraction of every share of the sale. */
  async function applyRefund(paymentIntentId: string, refundedCents: number, chargeCents: number): Promise<void> {
    if (!paymentIntentId || !(chargeCents > 0) || !(refundedCents > 0)) return;
    const fraction = Math.min(1, refundedCents / chargeCents);
    for (const kind of KINDS) {
      for (const r of await q(kind.collection, { stripePaymentIntentId: paymentIntentId }, 50)) {
        if (r.data.status === 'refunded') continue;
        const target = Math.round(kind.cents(r.data) * fraction);
        if (target > (Number(r.data.clawbackCents) || 0)) await deps.patch(kind.collection, r.id, { clawbackCents: target });
        await settle(kind, r.id);
      }
    }
  }

  /** An open dispute holds unpaid shares. Paid ones stay out unless it's lost; a win releases the hold. */
  async function applyDispute(paymentIntentId: string, status: string, disputedCents: number, chargeCents: number): Promise<void> {
    if (!paymentIntentId) return;
    const closed = ['won', 'warning_closed', 'lost'].includes(status);
    for (const kind of KINDS) {
      for (const r of await q(kind.collection, { stripePaymentIntentId: paymentIntentId }, 50)) {
        if (r.data.status === 'refunded') continue;
        await deps.patch(kind.collection, r.id, { disputeHold: !closed, disputeStatus: status });
      }
    }
    if (status === 'lost') { await applyRefund(paymentIntentId, disputedCents, chargeCents); return; }
    if (!closed) return;
    for (const kind of KINDS) {
      for (const r of await q(kind.collection, { stripePaymentIntentId: paymentIntentId }, 50)) await payRow(kind, r.id);
    }
  }

  return {
    payEarning: (id: string, firstAttempt = false) => payRow(EARNING, id, firstAttempt),
    paySplit: (id: string, firstAttempt = false) => payRow(SPLIT, id, firstAttempt),
    recordAndPay, payPendingFor, retryFailed, retryReversals, applyRefund, applyDispute,
  };
}
