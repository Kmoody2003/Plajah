// Creator split payments: the one config shape (types.ts SplitConfig) and a per-recipient payout ledger.
//
// creatorSplitPayouts/{earningId}_{recipientUid} is the source of truth for what a collaborator is owed
// on a sale. The row is written before any money moves, so a recipient without Connect, a Stripe failure
// or a crash leaves a row that a later sweep pays, instead of a payment nobody remembers.
//
// Paying twice is prevented in two layers, because Stripe only keeps idempotency keys for about 24 hours:
//  1. The key is `split_{rowId}_{rejections}`. It only advances after Stripe definitely refused the
//     request. A timeout or 5xx retries the SAME key, so an in-doubt transfer replays rather than repeats.
//  2. Every attempt except the first looks for an existing transfer carrying this row's id in metadata,
//     which catches a transfer whose row update was lost, however long ago.
import type { SplitRecipient } from '../types';

export const SPLIT_PAYOUTS = 'creatorSplitPayouts';
export const MAX_SPLIT_RECIPIENTS = 20;
export const DEFAULT_APPLIES_TO = ['tip', 'digital_sale', 'sanctuary', 'plajahplus'];
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
  const cats = Array.isArray(appliesTo) ? appliesTo.filter((c): c is string => typeof c === 'string').slice(0, 20) : DEFAULT_APPLIES_TO;
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

export function createSplitPayouts(deps: SplitPayoutDeps) {
  const now = () => deps.now?.() ?? Date.now();

  async function findExistingTransfer(payoutId: string, destination: string, createdAt: number): Promise<any | null> {
    const stripe = deps.getStripe();
    const gte = Math.floor(createdAt / 1000) - 60;
    let starting_after: string | undefined;
    for (;;) {
      const page = await stripe.transfers.list({ destination, created: { gte }, limit: 100, ...(starting_after ? { starting_after } : {}) });
      const hit = page.data.find((t: any) => t.metadata?.payoutId === payoutId);
      if (hit) return hit;
      if (!page.has_more || !page.data.length) return null;
      starting_after = page.data[page.data.length - 1].id;
    }
  }

  async function markPaid(payoutId: string, transferId: string): Promise<void> {
    // A lost write here is safe: the next sweep finds this transfer by its metadata and doesn't send another.
    try { await deps.patch(SPLIT_PAYOUTS, payoutId, { status: 'paid_out', transferId, paidOutAt: now(), lastPayoutError: null }); }
    catch (e: any) { console.error(`[Splits] ${payoutId} paid but not marked:`, e?.message || e); }
  }

  /** Pay one row. `firstAttempt` is only for a row created a moment ago, which can't have a transfer yet. */
  async function payOne(payoutId: string, firstAttempt = false): Promise<PayResult> {
    const row = await deps.read(SPLIT_PAYOUTS, payoutId);
    if (!row || (row.status !== 'pending' && row.status !== 'awaiting_connect') || !(row.amountCents > 0)) return 'skipped';
    const user = await deps.read('users', row.recipientUid);
    const destination = user?.stripeConnectAccountId as string | undefined;
    if (!destination) {
      if (row.status !== 'awaiting_connect') await deps.patch(SPLIT_PAYOUTS, payoutId, { status: 'awaiting_connect' });
      return 'awaiting_connect';
    }
    const attempts = Number(row.attempts) || 0;
    const rejections = Number(row.rejections) || 0;
    try {
      const stripe = deps.getStripe();
      if (!firstAttempt) {
        const existing = await findExistingTransfer(payoutId, destination, Number(row.createdAt) || 0);
        if (existing) { await markPaid(payoutId, existing.id); return 'paid'; }
      }
      const transfer = await stripe.transfers.create({
        amount: row.amountCents,
        currency: 'usd',
        destination,
        ...(row.sourceCharge ? { source_transaction: row.sourceCharge } : {}),
        metadata: { type: 'split', payoutId, earningId: row.earningId, fromCreatorUid: row.fromCreatorUid, toCreatorUid: row.recipientUid, category: row.category },
      }, { idempotencyKey: `split_${payoutId}_${rejections}` });
      await markPaid(payoutId, transfer.id);
      return 'paid';
    } catch (e: any) {
      console.error(`[Splits] ${payoutId} transfer failed:`, e?.message || e);
      // Status is left alone: a concurrent attempt on the same key may have succeeded and marked it paid.
      await deps.patch(SPLIT_PAYOUTS, payoutId, {
        lastPayoutError: String(e?.message || e).slice(0, 300), lastPayoutAttemptAt: now(), attempts: attempts + 1,
        rejections: rejections + (isDefiniteRejection(e) ? 1 : 0),
      }).catch(() => {});
      return 'failed';
    }
  }

  /**
   * Write a sale's rows, then pay the new ones. Safe to repeat: rows have deterministic ids, and rows that
   * already existed are left to the sweep. ok:false means a row wasn't recorded and the webhook must be re-sent.
   */
  async function recordAndPay(sale: { earningId: string; fromCreatorUid: string; category: string; title: string; paymentIntentId: string; lines: SplitLine[] }): Promise<{ ok: boolean }> {
    let sourceCharge = '';
    if (sale.paymentIntentId) {
      // Fixed once on the row, so every retry sends the same parameters under its idempotency key.
      try { sourceCharge = String((await deps.getStripe().paymentIntents.retrieve(sale.paymentIntentId))?.latest_charge || ''); } catch { /* draws on balance */ }
    }
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
        sourceCharge,
        status: 'pending',
        attempts: 0,
        rejections: 0,
        createdAt: now(),
      });
      if (created === 'error') { ok = false; continue; }
      if (created !== 'created') continue;
      if (await payOne(payoutId, true) === 'awaiting_connect') {
        await deps.notifyAwaitingConnect(line.creatorUid).catch((e: any) => console.error('[Splits] notify failed:', e?.message || e));
      }
    }
    return { ok };
  }

  async function sweep(rows: Array<{ id: string; data: Record<string, any> }>): Promise<{ paid: number; waiting: number }> {
    let paid = 0, waiting = 0;
    for (const r of rows) {
      if (!retryDue(r.data, now())) { waiting++; continue; }
      if (await payOne(r.id) === 'paid') paid++; else waiting++;
    }
    return { paid, waiting };
  }

  /** Everything owed to one recipient. Run when they finish Connect onboarding. */
  async function payPendingFor(uid: string): Promise<{ paid: number; waiting: number }> {
    const [awaiting, pending] = await Promise.all(['awaiting_connect', 'pending'].map(status => deps.query(SPLIT_PAYOUTS, [
      { field: 'recipientUid', op: 'EQUAL', value: uid },
      { field: 'status', op: 'EQUAL', value: status },
    ], 200)));
    return sweep([...awaiting, ...pending]);
  }

  /** Retry failed transfers, and catch recipients who connected without the status check running. */
  async function retryFailed(limit = 200): Promise<{ paid: number; waiting: number }> {
    const [pending, awaiting] = await Promise.all(['pending', 'awaiting_connect'].map(status =>
      deps.query(SPLIT_PAYOUTS, [{ field: 'status', op: 'EQUAL', value: status }], limit)));
    return sweep([...pending, ...awaiting]);
  }

  /** A fully refunded sale: cancel unpaid rows and take back paid ones. ok:false means a reversal needs another try. */
  async function reverseForPaymentIntent(paymentIntentId: string): Promise<{ ok: boolean }> {
    if (!paymentIntentId) return { ok: true };
    const rows = await deps.query(SPLIT_PAYOUTS, [{ field: 'stripePaymentIntentId', op: 'EQUAL', value: paymentIntentId }], 50);
    let ok = true;
    for (const r of rows) {
      if (r.data.status === 'refunded') continue;
      if (r.data.status === 'paid_out' && r.data.transferId) {
        try { await deps.getStripe().transfers.createReversal(String(r.data.transferId), {}, { idempotencyKey: `reverse_${r.id}` }); }
        catch (e: any) {
          console.error(`[Splits] reversal for ${r.id} failed:`, e?.message || e);
          await deps.patch(SPLIT_PAYOUTS, r.id, { lastReversalError: String(e?.message || e).slice(0, 300) }).catch(() => {});
          ok = false;
          continue;
        }
      }
      await deps.patch(SPLIT_PAYOUTS, r.id, { status: 'refunded', refundedAt: now() });
    }
    return { ok };
  }

  return { payOne, recordAndPay, payPendingFor, retryFailed, reverseForPaymentIntent };
}

// ── Audit of sales from before this ledger ────────────────────────────────────

/**
 * Old split transfers carry no earning id, so they are matched on recipient, sender, category and amount
 * within a window after the sale. Each transfer can only satisfy one line. Returns the lines with no match.
 */
export function unmatchedLegacySplits(
  earning: { creatorUid: string; category: string; timestamp: number; splits: SplitLine[] },
  transfers: Array<{ id: string; amount: number; created: number; metadata?: Record<string, string> }>,
  used: Set<string>,
  windowMs = 3_600_000,
): SplitLine[] {
  return earning.splits.filter(line => {
    if (!(line.amountCents > 0)) return false;
    const match = transfers.find(t => !used.has(t.id) && t.amount === line.amountCents
      && t.metadata?.type === 'split' && t.metadata?.fromCreatorUid === earning.creatorUid
      && t.metadata?.toCreatorUid === line.creatorUid && t.metadata?.category === earning.category
      && Math.abs(t.created * 1000 - earning.timestamp) <= windowMs);
    if (match) used.add(match.id);
    return !match;
  });
}
