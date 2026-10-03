// chmsFinance — Firestore IO + business rules for the Elevate ChMS Finance Hub.
//
// Money rules enforced here (UI + service; Firestore rules enforce role/ownership only):
//  • gifts are NEVER deleted — VOID with a reason; posted batches are immutable (no new rows).
//  • a batch cannot post out of balance without a recorded override reason.
//  • two-person integrity: voids / overrides at-or-above `financeSettings.approvalThreshold` become
//    PENDING (voidRequest / overrideRequest on the doc) until a DIFFERENT authorised user approves.
//  • every action is audited (organizations/{id}/audit via logOrgAction + immutable chmsAudit).
// Pure maths lives in chmsFinanceReports.ts.

import {
  collection, doc, getDocs, query, where, writeBatch, setDoc, updateDoc, limit as fbLimit,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { logOrgAction, type OrgAuditAction } from './orgAudit';
import { updateOrganization } from './organizationService';
import { callGemini, callGeminiDetailed } from './geminiService';
import { createNotification } from './backendService';
import type {
  Organization, ChmsContribution, ChmsBatch, ChmsPledge, ChmsPerson, ChmsHousehold, ChmsGiftMethod, ChmsFinanceSettings, GivingFund, ChmsPayout, ChmsPayoutLine,
} from '../types';
import {
  buildLedger, todayStr, round2, sum, addDays, daysBetween, findPledgeFor, dueDates, money, indexPeople, aggregateGivers, live, inRange, yearRange, quarterRange, monthRange,
  lapsedGivers, firstTimeGivers, toMillis,
  type LedgerRow, type NativeDonation, type FundTransfer, type PayoutRec, type RecurringSpec, type StatementData, type DateRange, type PeopleIndex,
} from './chmsFinanceReports';

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? null : v)), (_k, v) => (v === null ? undefined : v));
const clean = (o: Record<string, any>) => { const out: Record<string, any> = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v; return out; };
const uidOrThrow = (): string => { const u = auth.currentUser?.uid; if (!u) throw new Error('Sign in required'); return u; };
const actorName = () => auth.currentUser?.displayName || auth.currentUser?.email || 'Finance user';

export const DEFAULT_APPROVAL_THRESHOLD = 1000;
export const settingsOf = (org: Pick<Organization, 'financeSettings'>): Required<Pick<ChmsFinanceSettings, 'approvalThreshold' | 'anomalyMultiple' | 'lapsedDays' | 'fiscalYearStartMonth'>> & ChmsFinanceSettings => ({
  approvalThreshold: DEFAULT_APPROVAL_THRESHOLD, anomalyMultiple: 5, lapsedDays: 60, fiscalYearStartMonth: 1, ...(org.financeSettings || {}),
});
export const needsApproval = (org: Pick<Organization, 'financeSettings'>, amount: number): boolean => Math.abs(amount) >= settingsOf(org).approvalThreshold;

// ── Meta docs (payouts, transfers, statement log, recurring) ───────────────────
export type MetaKind = 'PAYOUT' | 'TRANSFER' | 'STATEMENT_LOG' | 'RECURRING';
export interface MetaDoc { id: string; orgId: string; kind: MetaKind; createdAt: number; createdBy: string; [k: string]: any }
export interface StatementLog { id: string; rangeLabel: string; from: string; to: string; mode: 'PRINT' | 'NOTIFY' | 'EMAIL' | 'LABELS' | 'PDF'; byHousehold: boolean; keys: string[]; count: number; at: number; by: string }

export interface CareFlag { id: string; orgId: string; personId: string; personName: string; kind: 'LAPSED' | 'FIRST_TIME'; status: 'OPEN' | 'DONE'; month: string; createdAt: number; resolvedBy?: string; resolvedAt?: number }
export interface FinAuditEntry { id: string; orgId: string; actorUid: string; actorName: string; action: string; target?: string; meta?: Record<string, any>; timestamp: number }

export interface FinanceSnapshot {
  contributions: ChmsContribution[]; batches: ChmsBatch[]; pledges: ChmsPledge[]; people: ChmsPerson[]; households: ChmsHousehold[];
  donations: NativeDonation[]; meta: MetaDoc[]; careFlags: CareFlag[];
  ledger: LedgerRow[]; onlineMerged: number; onlineDuplicates: number;
  transfers: FundTransfer[]; payouts: PayoutRec[]; recurring: RecurringSpec[]; statementLogs: StatementLog[];
  /** Server-synced Stripe payouts + their balance-transaction lines (services/stripeSync, server.ts). */
  stripePayouts: ChmsPayout[]; payoutLines: ChmsPayoutLine[];
  idx: PeopleIndex; usersById: Record<string, string>; loadedAt: number; errors: string[];
}

async function listBy<T>(col: string, orgId: string, max = 50000): Promise<T[]> {
  const snap = await getDocs(query(collection(db, col), where('orgId', '==', orgId), fbLimit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as T));
}

export async function fetchFinanceSnapshot(org: Organization, canSeeGivers = true): Promise<FinanceSnapshot> {
  const errors: string[] = [];
  const safe = async <T,>(label: string, p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch (e: any) { errors.push(`${label}: ${e?.code || e?.message || 'failed'}`); return fb; } };
  const [stripePayouts, payoutLines] = await Promise.all([
    safe('stripe payouts', listBy<ChmsPayout>('chmsPayouts', org.id, 2000), [] as ChmsPayout[]),
    safe('stripe payout lines', listBy<ChmsPayoutLine>('chmsPayoutLines', org.id, 20000), [] as ChmsPayoutLine[]),
  ]);
  const [contributions, batches, pledges, people, households, meta, careFlags, rawDon] = await Promise.all([
    safe('contributions', listBy<ChmsContribution>('chmsContributions', org.id), []),
    safe('batches', listBy<ChmsBatch>('chmsBatches', org.id), []),
    safe('pledges', listBy<ChmsPledge>('chmsPledges', org.id), []),
    safe('people', listBy<ChmsPerson>('chmsPeople', org.id), []),
    safe('households', listBy<ChmsHousehold>('chmsHouseholds', org.id), []),
    safe('meta', listBy<MetaDoc>('chmsFinanceMeta', org.id), []),
    safe('careFlags', listBy<CareFlag>('chmsCareFlags', org.id, 2000), []),
    safe('online gifts', getDocs(query(collection(db, 'donations'), where('churchId', '==', org.id), fbLimit(20000))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }) as any)), [] as any[]),
  ]);
  const donations: NativeDonation[] = rawDon.map((x: any) => ({ id: x.id, fromId: x.fromId, fromName: x.fromName, churchId: x.churchId, fund: x.fund, amount: Number(x.amount) || 0, recurring: !!x.recurring, stripePaymentIntentId: x.stripePaymentIntentId || undefined, stripeSubscriptionId: x.stripeSubscriptionId || undefined, timestamp: toMillis(x.timestamp) }));
  const funds = org.givingFunds || [];
  const { rows, onlineMerged, onlineDuplicates } = buildLedger(org.id, contributions, donations, people, funds);
  const transfers = meta.filter(m => m.kind === 'TRANSFER').map(m => ({ id: m.id, pairId: m.pairId, fundId: m.fundId, fundName: m.fundName, amount: m.amount, date: m.date, reason: m.reason } as FundTransfer));
  const payouts = meta.filter(m => m.kind === 'PAYOUT').map(m => m as unknown as PayoutRec);
  const recurring = meta.filter(m => m.kind === 'RECURRING').map(m => m as unknown as RecurringSpec);
  const statementLogs = meta.filter(m => m.kind === 'STATEMENT_LOG').map(m => m as unknown as StatementLog).sort((a, b) => b.at - a.at);
  const usersById: Record<string, string> = {};
  (org.admins || []).forEach(u => { usersById[u] = usersById[u] || u.slice(0, 6); });
  if (auth.currentUser) usersById[auth.currentUser.uid] = actorName();
  return {
    contributions, batches: batches.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), pledges, people: canSeeGivers ? people : people, households, donations, meta,
    careFlags, ledger: rows, onlineMerged, onlineDuplicates, transfers, payouts, stripePayouts: stripePayouts.sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate)), payoutLines, recurring, statementLogs, idx: indexPeople(people, households), usersById, loadedAt: Date.now(), errors,
  };
}

// ── Audit ──────────────────────────────────────────────────────────────────────
export async function finAudit(orgId: string, action: OrgAuditAction, target?: string, meta?: Record<string, any>): Promise<void> {
  const u = auth.currentUser; if (!u) return;
  const m = meta ? strip(meta) : undefined;
  logOrgAction(orgId, action, { targetName: target, meta: m }).catch(() => {});
  try {
    const ref = doc(collection(db, 'chmsAudit'));
    await setDoc(ref, clean({ id: ref.id, orgId, actorUid: u.uid, actorName: actorName(), action, target, meta: m, timestamp: Date.now() }));
  } catch { /* audit is best-effort and must never block the money action */ }
}
export async function fetchFinAudit(orgId: string, max = 500): Promise<FinAuditEntry[]> {
  try { return (await listBy<FinAuditEntry>('chmsAudit', orgId, 5000)).sort((a, b) => b.timestamp - a.timestamp).slice(0, max); } catch { return []; }
}

// ── Gift entry ─────────────────────────────────────────────────────────────────
export interface GiftSplit { fundId: string; fundName: string; amount: number }
export interface GiftDraft {
  personId?: string; giverName?: string; anonymous?: boolean; envelope?: string;
  splits: GiftSplit[]; date: string; method: ChmsGiftMethod; checkNumber?: string; memo?: string; tributeNote?: string;
  deductible: boolean; batchId?: string; pledgeId?: string; recurringKey?: string;
}
export function validateDraft(d: GiftDraft): string | null {
  if (!d.splits.length) return 'Add at least one fund line.';
  if (d.splits.some(s => !(s.amount > 0) || !s.fundId)) return 'Every split needs a fund and an amount above zero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Enter a valid date.';
  if (d.method === 'CHECK' && !d.checkNumber?.trim()) return 'Enter the check number.';
  if (!d.personId && !d.anonymous && !d.giverName?.trim()) return 'Choose a giver, type a name, or mark the gift anonymous.';
  return null;
}
/** Write gifts (one row per split, sharing a splitGroupId). Returns the created rows. */
export async function enterGifts(org: Organization, drafts: GiftDraft[], people: ChmsPerson[], pledges: ChmsPledge[], batches: ChmsBatch[]): Promise<ChmsContribution[]> {
  const uid = uidOrThrow();
  const created: ChmsContribution[] = [];
  const byId = new Map(people.map(p => [p.id, p]));
  for (let i = 0; i < drafts.length; i += 150) {
    const wb = writeBatch(db);
    for (const d of drafts.slice(i, i + 150)) {
      const err = validateDraft(d); if (err) throw new Error(err);
      if (d.batchId) { const b = batches.find(x => x.id === d.batchId); if (b && (b.status === 'POSTED' || b.status === 'DEPOSITED')) throw new Error(`Batch "${b.name}" is already posted — it is immutable. Open a new batch.`); }
      const p = d.personId ? byId.get(d.personId) : undefined;
      const group = d.splits.length > 1 ? doc(collection(db, 'chmsContributions')).id : undefined;
      for (const s of d.splits) {
        const ref = doc(collection(db, 'chmsContributions'));
        const pledge = d.pledgeId ? pledges.find(x => x.id === d.pledgeId) : findPledgeFor(pledges, { personId: d.personId, householdId: p?.householdId, fundId: s.fundId, date: d.date });
        const row = clean({
          id: ref.id, orgId: org.id, personId: d.personId, householdId: p?.householdId, giverName: d.anonymous ? undefined : (p ? undefined : d.giverName?.trim()),
          fundId: s.fundId, fundName: s.fundName, amount: round2(s.amount), splitGroupId: group, date: d.date, method: d.method,
          checkNumber: d.method === 'CHECK' ? d.checkNumber?.trim() : undefined, batchId: d.batchId, pledgeId: pledge?.id, memo: d.memo?.trim() || undefined,
          tributeNote: d.tributeNote?.trim() || undefined, deductible: d.deductible, status: 'POSTED', enteredBy: uid, createdAt: Date.now(),
          linkedUid: p?.linkedUid, envelope: d.envelope || undefined, anonymous: d.anonymous || undefined, recurringKey: d.recurringKey,
        }) as ChmsContribution;
        wb.set(ref, row); created.push(row);
      }
    }
    await wb.commit();
  }
  const total = round2(created.reduce((a, r) => a + r.amount, 0));
  await finAudit(org.id, 'FIN_GIFT_ENTERED', `${created.length} gift line(s)`, { count: created.length, total, batchId: drafts[0]?.batchId });
  return created;
}

// ── Batches ────────────────────────────────────────────────────────────────────
export async function createBatch(org: Organization, name: string, date: string, expectedTotal?: number, expectedCount?: number): Promise<ChmsBatch> {
  const uid = uidOrThrow();
  const ref = doc(collection(db, 'chmsBatches'));
  const b = clean({ id: ref.id, orgId: org.id, name: name.trim() || `Batch ${date}`, date, expectedTotal, expectedCount, status: 'OPEN', openedBy: uid, createdAt: Date.now() }) as ChmsBatch;
  await setDoc(ref, b);
  await finAudit(org.id, 'FIN_BATCH_OPENED', b.name, { batchId: b.id, expectedTotal, expectedCount });
  return b;
}
export async function updateBatchControl(org: Organization, batch: ChmsBatch, patch: { name?: string; date?: string; expectedTotal?: number | null; expectedCount?: number | null }): Promise<void> {
  if (batch.status === 'POSTED' || batch.status === 'DEPOSITED') throw new Error('Posted batches are immutable.');
  const u: Record<string, any> = {};
  if (patch.name !== undefined) u.name = patch.name; if (patch.date !== undefined) u.date = patch.date;
  if (patch.expectedTotal !== undefined) u.expectedTotal = patch.expectedTotal === null ? null : round2(patch.expectedTotal);
  if (patch.expectedCount !== undefined) u.expectedCount = patch.expectedCount;
  await updateDoc(doc(db, 'chmsBatches', batch.id), u);
}
export type PostResult = 'POSTED' | 'PENDING_APPROVAL';
export interface BatchStats { total: number; count: number; variance: number; countVariance: number; balanced: boolean; hasControl: boolean }
export async function postBatch(org: Organization, batch: ChmsBatch, stats: BatchStats, overrideReason?: string): Promise<PostResult> {
  const uid = uidOrThrow();
  if (batch.status === 'POSTED' || batch.status === 'DEPOSITED') throw new Error('Already posted.');
  if (stats.count === 0) throw new Error('Cannot post an empty batch.');
  const clearBalance = stats.hasControl && stats.balanced;
  if (clearBalance) {
    await updateDoc(doc(db, 'chmsBatches', batch.id), { status: 'POSTED', postedAt: Date.now(), closedBy: uid });
    await finAudit(org.id, 'FIN_BATCH_POSTED', batch.name, { batchId: batch.id, total: stats.total, count: stats.count });
    acctSync(org.id); return 'POSTED';
  }
  const reason = overrideReason?.trim();
  if (!reason) throw new Error(stats.hasControl ? 'This batch is out of balance — record an override reason to post it.' : 'No control total was set — enter the deposit-slip total, or record a reason to post without one.');
  const exposure = Math.max(Math.abs(stats.variance), stats.hasControl ? 0 : stats.total);
  if (needsApproval(org, exposure)) {
    await updateDoc(doc(db, 'chmsBatches', batch.id), { overrideRequest: { by: uid, byName: actorName(), reason, variance: stats.variance, at: Date.now() } });
    await finAudit(org.id, 'FIN_BATCH_OVERRIDE', batch.name, { batchId: batch.id, variance: stats.variance, reason, pending: true });
    return 'PENDING_APPROVAL';
  }
  await updateDoc(doc(db, 'chmsBatches', batch.id), { status: 'POSTED', postedAt: Date.now(), closedBy: uid, overrideReason: reason, overrideVariance: stats.variance });
  await finAudit(org.id, 'FIN_BATCH_OVERRIDE', batch.name, { batchId: batch.id, variance: stats.variance, reason, pending: false });
  await finAudit(org.id, 'FIN_BATCH_POSTED', batch.name, { batchId: batch.id, total: stats.total, override: true });
  acctSync(org.id); return 'POSTED';
}
export async function approveBatchOverride(org: Organization, batch: ChmsBatch): Promise<void> {
  const uid = uidOrThrow();
  const req = batch.overrideRequest; if (!req) throw new Error('Nothing to approve.');
  if (req.by === uid) throw new Error('Two-person integrity: a different authorised user must approve this.');
  await updateDoc(doc(db, 'chmsBatches', batch.id), { status: 'POSTED', postedAt: Date.now(), closedBy: req.by, approvedBy: uid, overrideReason: req.reason, overrideVariance: req.variance, overrideRequest: null });
  await finAudit(org.id, 'FIN_APPROVED', batch.name, { batchId: batch.id, kind: 'BATCH_OVERRIDE', requestedBy: req.by });
  await finAudit(org.id, 'FIN_BATCH_POSTED', batch.name, { batchId: batch.id, override: true, approvedBy: uid });
  acctSync(org.id);
}
export async function rejectBatchOverride(org: Organization, batch: ChmsBatch): Promise<void> {
  uidOrThrow();
  await updateDoc(doc(db, 'chmsBatches', batch.id), { overrideRequest: null });
  await finAudit(org.id, 'FIN_VOID_REJECTED', batch.name, { batchId: batch.id, kind: 'BATCH_OVERRIDE' });
}
export async function depositBatch(org: Organization, batch: ChmsBatch, ref?: string): Promise<void> {
  uidOrThrow();
  if (batch.status !== 'POSTED') throw new Error('Post the batch before marking it deposited.');
  await updateDoc(doc(db, 'chmsBatches', batch.id), clean({ status: 'DEPOSITED', depositedAt: Date.now(), depositRef: ref?.trim() || undefined }));
  await finAudit(org.id, 'FIN_BATCH_DEPOSITED', batch.name, { batchId: batch.id, ref });
  acctSync(org.id);
}

// ── Voids (with two-person integrity) ──────────────────────────────────────────
const groupRows = (row: LedgerRow, all: LedgerRow[]) => row.splitGroupId ? all.filter(r => r.splitGroupId === row.splitGroupId && r.status !== 'VOID') : [row];
export type VoidResult = 'VOIDED' | 'PENDING_APPROVAL';
export async function voidGift(org: Organization, row: LedgerRow, all: LedgerRow[], reason: string): Promise<VoidResult> {
  const uid = uidOrThrow();
  if (row.origin === 'ONLINE') throw new Error('Online (Stripe) gifts are refunded in Stripe, not voided here.');
  if (!reason.trim()) throw new Error('A reason is required to void a gift.');
  const rows = groupRows(row, all);
  const total = sum(rows);
  const wb = writeBatch(db);
  if (needsApproval(org, total)) {
    rows.forEach(r => wb.update(doc(db, 'chmsContributions', r.id), { voidRequest: { by: uid, byName: actorName(), reason: reason.trim(), at: Date.now() } }));
    await wb.commit();
    await finAudit(org.id, 'FIN_VOID_REQUESTED', `${money(total)} ${row.fundName}`, { ids: rows.map(r => r.id), total, reason, date: row.date });
    return 'PENDING_APPROVAL';
  }
  rows.forEach(r => wb.update(doc(db, 'chmsContributions', r.id), { status: 'VOID', voidedBy: uid, voidReason: reason.trim(), voidedAt: Date.now() }));
  await wb.commit();
  await finAudit(org.id, 'FIN_VOID', `${money(total)} ${row.fundName}`, { ids: rows.map(r => r.id), total, reason, date: row.date });
  acctSync(org.id); return 'VOIDED';
}
export async function approveVoid(org: Organization, row: LedgerRow, all: LedgerRow[]): Promise<void> {
  const uid = uidOrThrow();
  const req = row.voidRequest; if (!req) throw new Error('No pending void.');
  if (req.by === uid) throw new Error('Two-person integrity: a different authorised user must approve this void.');
  const rows = groupRows(row, all);
  const wb = writeBatch(db);
  rows.forEach(r => wb.update(doc(db, 'chmsContributions', r.id), { status: 'VOID', voidedBy: req.by, voidReason: req.reason, voidedAt: Date.now(), voidRequest: null }));
  await wb.commit();
  await finAudit(org.id, 'FIN_APPROVED', `${money(sum(rows))} ${row.fundName}`, { kind: 'VOID', ids: rows.map(r => r.id), requestedBy: req.by, reason: req.reason });
  await finAudit(org.id, 'FIN_VOID', `${money(sum(rows))} ${row.fundName}`, { ids: rows.map(r => r.id), reason: req.reason, approvedBy: uid });
  acctSync(org.id);
}
export async function rejectVoid(org: Organization, row: LedgerRow, all: LedgerRow[]): Promise<void> {
  uidOrThrow();
  const rows = groupRows(row, all);
  const wb = writeBatch(db);
  rows.forEach(r => wb.update(doc(db, 'chmsContributions', r.id), { voidRequest: null }));
  await wb.commit();
  await finAudit(org.id, 'FIN_VOID_REJECTED', row.fundName, { ids: rows.map(r => r.id) });
}

// ── Pledges ────────────────────────────────────────────────────────────────────
export async function savePledge(org: Organization, p: Omit<ChmsPledge, 'id' | 'createdAt' | 'orgId'> & { id?: string }): Promise<void> {
  uidOrThrow();
  if (!(p.amount > 0)) throw new Error('Pledge amount must be above zero.');
  const ref = p.id ? doc(db, 'chmsPledges', p.id) : doc(collection(db, 'chmsPledges'));
  if (p.id) await updateDoc(ref, clean({ ...p, orgId: org.id }));
  else await setDoc(ref, clean({ ...p, id: ref.id, orgId: org.id, createdAt: Date.now() }));
  await finAudit(org.id, 'FIN_PLEDGE', p.giverName || p.personId, { pledgeId: ref.id, amount: p.amount, fund: p.fundName, status: p.status });
}
/** Attach existing unattached matching gifts to a pledge (auto-match backfill). */
export async function attachMatchingGifts(org: Organization, pledge: ChmsPledge, rows: LedgerRow[]): Promise<number> {
  const mine = rows.filter(r => r.origin === 'LEDGER' && r.status !== 'VOID' && !r.pledgeId && r.fundId === pledge.fundId && r.date >= pledge.startDate && r.date <= (pledge.endDate || addDays(pledge.startDate, 365)) && ((pledge.personId && r.personId === pledge.personId) || (pledge.householdId && r.householdId === pledge.householdId)));
  for (let i = 0; i < mine.length; i += 400) { const wb = writeBatch(db); mine.slice(i, i + 400).forEach(r => wb.update(doc(db, 'chmsContributions', r.id), { pledgeId: pledge.id })); await wb.commit(); }
  if (mine.length) await finAudit(org.id, 'FIN_PLEDGE', pledge.giverName || pledge.personId, { pledgeId: pledge.id, attached: mine.length });
  return mine.length;
}

// ── Funds, transfers, settings ─────────────────────────────────────────────────
export async function saveFunds(org: Organization, funds: GivingFund[]): Promise<void> {
  uidOrThrow();
  await updateOrganization(org.id, { givingFunds: strip(funds) });
  await finAudit(org.id, 'FIN_SETTINGS', 'funds', { count: funds.length });
}
export async function recordTransfer(org: Organization, from: GivingFund, to: GivingFund, amount: number, date: string, reason: string): Promise<void> {
  uidOrThrow();
  if (!(amount > 0)) throw new Error('Amount must be above zero.');
  if (from.id === to.id) throw new Error('Choose two different funds.');
  if (!reason.trim()) throw new Error('A reason is required for a fund transfer.');
  const pairId = doc(collection(db, 'chmsFinanceMeta')).id;
  const wb = writeBatch(db);
  for (const [f, signed] of [[from, -round2(amount)], [to, round2(amount)]] as [GivingFund, number][]) {
    const ref = doc(collection(db, 'chmsFinanceMeta'));
    wb.set(ref, { id: ref.id, orgId: org.id, kind: 'TRANSFER', pairId, fundId: f.id, fundName: f.name, amount: signed, date, reason: reason.trim(), createdAt: Date.now(), createdBy: auth.currentUser!.uid });
  }
  await wb.commit();
  await finAudit(org.id, 'FIN_TRANSFER', `${from.name} → ${to.name}`, { amount, date, reason, pairId });
}
export async function saveFinanceSettings(org: Organization, patch: { legalName?: string; ein?: string; statementFooter?: string; financeSettings?: ChmsFinanceSettings }): Promise<Partial<Organization>> {
  uidOrThrow();
  const out: Partial<Organization> = strip({ legalName: patch.legalName?.trim() || undefined, ein: patch.ein?.trim() || undefined, statementFooter: patch.statementFooter?.trim() || undefined, financeSettings: patch.financeSettings });
  await updateOrganization(org.id, out);
  await finAudit(org.id, 'FIN_SETTINGS', 'finance settings', { fields: Object.keys(out) });
  return out;
}

// ── Payouts + statements log + recurring ───────────────────────────────────────
export async function savePayout(org: Organization, p: Omit<PayoutRec, 'id'>): Promise<void> {
  uidOrThrow();
  const ref = doc(collection(db, 'chmsFinanceMeta'));
  await setDoc(ref, clean({ ...p, id: ref.id, orgId: org.id, kind: 'PAYOUT', createdAt: Date.now(), createdBy: auth.currentUser!.uid }));
  await finAudit(org.id, 'FIN_PAYOUT', p.ref || p.payoutDate, { gross: p.gross, fees: p.fees, net: p.net });
}
export async function logStatementRun(org: Organization, range: DateRange, mode: StatementLog['mode'], byHousehold: boolean, stmts: StatementData[]): Promise<void> {
  const uid = uidOrThrow();
  const ref = doc(collection(db, 'chmsFinanceMeta'));
  await setDoc(ref, { id: ref.id, orgId: org.id, kind: 'STATEMENT_LOG', rangeLabel: range.label, from: range.from, to: range.to, mode, byHousehold, keys: stmts.map(s => s.key), count: stmts.length, at: Date.now(), by: uid, createdAt: Date.now(), createdBy: uid });
  await finAudit(org.id, 'FIN_STATEMENT', `${range.label} · ${mode}`, { count: stmts.length, mode, from: range.from, to: range.to });
}
/** Statement keys already generated for exactly this range (duplicate-statement log). */
export function alreadySent(logs: StatementLog[], range: DateRange, mode?: StatementLog['mode']): Set<string> {
  const s = new Set<string>();
  logs.filter(l => l.from === range.from && l.to === range.to && (!mode || l.mode === mode)).forEach(l => l.keys.forEach(k => s.add(k)));
  return s;
}
/** Plajah-notify delivery: a "statement ready" notification to linked accounts — deliberately contains NO amounts. */
export async function notifyStatements(org: Organization, stmts: StatementData[]): Promise<{ sent: number; skipped: number }> {
  const me = auth.currentUser; if (!me) throw new Error('Sign in required');
  let sent = 0, skipped = 0;
  for (const s of stmts) {
    if (!s.linkedUids.length) { skipped++; continue; }
    for (const uid of s.linkedUids) {
      await createNotification({ userId: uid, senderId: me.uid, senderName: org.name, senderPhoto: org.logoUrl || '', type: 'SYSTEM', title: `Your ${s.range.label} giving statement is ready`, message: `${org.legalName || org.name} has published your giving statement. Open ${org.name} › My Giving to view or print it.`, targetId: org.id });
    }
    sent++;
  }
  return { sent, skipped };
}
export const statementMailto = (s: StatementData, org: Organization): string =>
  s.email ? `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(`${s.range.label} giving statement — ${org.legalName || org.name}`)}&body=${encodeURIComponent(`Dear ${s.name},\n\nThank you for your generous support of ${org.name}. Your ${s.range.label} contribution statement is attached.\n\n${org.statementFooter || ''}`)}` : '';

export async function saveRecurring(org: Organization, r: Omit<RecurringSpec, 'id' | 'orgId'> & { id?: string }): Promise<void> {
  uidOrThrow();
  const ref = r.id ? doc(db, 'chmsFinanceMeta', r.id) : doc(collection(db, 'chmsFinanceMeta'));
  await setDoc(ref, clean({ ...r, id: ref.id, orgId: org.id, kind: 'RECURRING', createdAt: Date.now(), createdBy: auth.currentUser!.uid }), { merge: true });
  await finAudit(org.id, 'FIN_SETTINGS', 'recurring gift', { amount: r.amount, frequency: r.frequency });
}
/** Generate the contributions each active schedule owes through today into `batchId`. */
export async function runRecurring(org: Organization, specs: RecurringSpec[], people: ChmsPerson[], pledges: ChmsPledge[], batches: ChmsBatch[], batchId: string): Promise<number> {
  const drafts: GiftDraft[] = []; const updates: { id: string; last: string }[] = [];
  for (const s of specs.filter(x => x.active)) {
    const ds = dueDates(s);
    ds.forEach(d => drafts.push({ personId: s.personId, giverName: s.giverName, splits: [{ fundId: s.fundId, fundName: s.fundName, amount: s.amount }], date: d, method: s.method, checkNumber: s.method === 'CHECK' ? 'RECUR' : undefined, memo: s.memo || 'Recurring gift', deductible: true, batchId, recurringKey: `${s.id}:${d}` }));
    if (ds.length) updates.push({ id: s.id, last: ds[ds.length - 1] });
  }
  if (!drafts.length) return 0;
  await enterGifts(org, drafts, people, pledges, batches);
  const wb = writeBatch(db); updates.forEach(u => wb.update(doc(db, 'chmsFinanceMeta', u.id), { lastGenerated: u.last })); await wb.commit();
  return drafts.length;
}

// ── Pastoral-care bridge (NO amounts cross this line) ──────────────────────────
export async function syncCareFlags(org: Organization, rows: LedgerRow[], idx: PeopleIndex, existing: CareFlag[], lapsedDays: number): Promise<number> {
  uidOrThrow();
  const month = todayStr().slice(0, 7);
  const have = new Set(existing.map(f => `${f.kind}_${f.personId}_${f.month}`));
  const mk = (kind: CareFlag['kind'], personId: string, personName: string): CareFlag | null => {
    const key = `${kind}_${personId}_${month}`;
    if (have.has(key)) return null;
    return { id: key, orgId: org.id, personId, personName, kind, status: 'OPEN', month, createdAt: Date.now() };
  };
  const flags: CareFlag[] = [];
  for (const g of lapsedGivers(rows, idx, lapsedDays)) { if (g.personId) { const f = mk('LAPSED', g.personId, g.name); if (f) flags.push(f); } }
  for (const g of firstTimeGivers(rows, idx, 30)) { if (g.personId) { const f = mk('FIRST_TIME', g.personId, g.name); if (f) flags.push(f); } }
  // Never re-open something a pastor already resolved within the last 90 days.
  const recentDone = new Set(existing.filter(f => f.status === 'DONE' && Date.now() - (f.resolvedAt || 0) < 90 * 86400000).map(f => `${f.kind}_${f.personId}`));
  const fresh = flags.filter(f => !recentDone.has(`${f.kind}_${f.personId}`));
  for (let i = 0; i < fresh.length; i += 400) { const wb = writeBatch(db); fresh.slice(i, i + 400).forEach(f => wb.set(doc(db, 'chmsCareFlags', f.id), f)); await wb.commit(); }
  if (fresh.length) await finAudit(org.id, 'FIN_CARE_FLAG', `${fresh.length} care prompt(s) created`, { count: fresh.length });
  return fresh.length;
}
export async function fetchCareFlags(orgId: string): Promise<CareFlag[]> { try { return (await listBy<CareFlag>('chmsCareFlags', orgId, 2000)).sort((a, b) => b.createdAt - a.createdAt); } catch { return []; } }
export async function resolveCareFlag(flag: CareFlag): Promise<void> { await updateDoc(doc(db, 'chmsCareFlags', flag.id), { status: 'DONE', resolvedBy: uidOrThrow(), resolvedAt: Date.now() }); }

// ── Linked-uid backfill (so givers can read their own gifts) ───────────────────
export async function backfillLinkedUid(org: Organization, rows: LedgerRow[], people: ChmsPerson[]): Promise<number> {
  const byId = new Map(people.map(p => [p.id, p]));
  const todo = rows.filter(r => r.origin === 'LEDGER' && r.personId && byId.get(r.personId)?.linkedUid && r.linkedUid !== byId.get(r.personId)!.linkedUid);
  for (let i = 0; i < todo.length; i += 400) { const wb = writeBatch(db); todo.slice(i, i + 400).forEach(r => wb.update(doc(db, 'chmsContributions', r.id), { linkedUid: byId.get(r.personId!)!.linkedUid })); await wb.commit(); }
  if (todo.length) await finAudit(org.id, 'FIN_SETTINGS', 'linkedUid backfill', { updated: todo.length });
  return todo.length;
}

// ── Giver self-service ─────────────────────────────────────────────────────────
export interface MyGiving { person: ChmsPerson | null; rows: LedgerRow[]; org: Organization | null }
export async function fetchMyGiving(orgId: string, uid: string): Promise<MyGiving> {
  const [contribSnap, personSnap, donSnap] = await Promise.all([
    getDocs(query(collection(db, 'chmsContributions'), where('linkedUid', '==', uid), where('orgId', '==', orgId), fbLimit(5000))).catch(() => null),
    getDocs(query(collection(db, 'chmsPeople'), where('linkedUid', '==', uid), where('orgId', '==', orgId), fbLimit(1))).catch(() => null),
    getDocs(query(collection(db, 'donations'), where('fromId', '==', uid), where('churchId', '==', orgId), fbLimit(2000))).catch(() => null),
  ]);
  const contribs = (contribSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }) as ChmsContribution);
  const person = personSnap && personSnap.docs[0] ? ({ id: personSnap.docs[0].id, ...personSnap.docs[0].data() } as ChmsPerson) : null;
  const dons: NativeDonation[] = (donSnap?.docs || []).map(d => { const x: any = d.data(); return { id: d.id, fromId: x.fromId, fromName: x.fromName, churchId: x.churchId, fund: x.fund, amount: Number(x.amount) || 0, stripePaymentIntentId: x.stripePaymentIntentId || undefined, stripeSubscriptionId: x.stripeSubscriptionId || undefined, timestamp: toMillis(x.timestamp) }; });
  const { rows } = buildLedger(orgId, contribs, dons, person ? [person] : [], []);
  let org: Organization | null = null;
  try { const { fetchOrganization } = await import('./organizationService'); org = await fetchOrganization(orgId); } catch { /* optional */ }
  return { person, rows: rows.map(r => ({ ...r, personId: r.personId || person?.id })), org };
}

// ── ARIA: plain-language questions (numbers computed in code; ARIA only parses + narrates) ──
export interface QuerySpec {
  intent: 'GAVE_A_NOT_B' | 'INCREASED' | 'DECREASED' | 'TOP' | 'FIRST_TIME' | 'TOTAL';
  a: DateRange; b: DateRange; fund?: string; minA?: number; limit?: number; source: 'ARIA' | 'RULES';
}
export interface QueryAnswer { spec: QuerySpec; summary: string; headers: string[]; rows: (string | number)[][]; narrated?: string | null }

const stripFence = (s: string) => s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

/** Offline parser — used when ARIA is unavailable, and as the fallback for unparseable ARIA output. */
export function heuristicSpec(q: string, today = new Date()): QuerySpec {
  const s = q.toLowerCase();
  const y = today.getFullYear(); const cq = Math.floor(today.getMonth() / 3) + 1;
  const periods: { at: number; r: DateRange }[] = [];
  const add = (re: RegExp, r: DateRange) => { const m = re.exec(s); if (m) periods.push({ at: m.index, r }); };
  add(/last year/, yearRange(y - 1)); add(/this year|year to date|ytd/, { ...yearRange(y), to: todayStr(today) });
  add(/this quarter/, { ...quarterRange(y, cq), to: todayStr(today) });
  add(/last quarter/, cq === 1 ? quarterRange(y - 1, 4) : quarterRange(y, cq - 1));
  add(/this month/, { ...monthRange(y, today.getMonth()), to: todayStr(today) });
  add(/last month/, today.getMonth() === 0 ? monthRange(y - 1, 11) : monthRange(y, today.getMonth() - 1));
  periods.sort((p, q2) => p.at - q2.at);
  const yr = /\b(20\d\d)\b/.exec(s); if (yr && periods.length === 0) periods.push({ at: 0, r: yearRange(Number(yr[1])) });
  let a: DateRange, b: DateRange;
  if (periods.length >= 2) { a = periods[0].r; b = periods[1].r; }
  else if (periods.length === 1) { b = periods[0].r; const len = daysBetween(b.from, b.to) + 1; a = { from: addDays(b.from, -len), to: addDays(b.from, -1), label: 'prior period' }; }
  else { b = { ...yearRange(y), to: todayStr(today) }; a = yearRange(y - 1); }
  let intent: QuerySpec['intent'] = 'TOTAL';
  if (/(nothing|haven'?t|stopped|no gift|lapsed|didn'?t give|not given|but not|but nothing)/.test(s)) intent = 'GAVE_A_NOT_B';
  else if (/(increas|more than|gave more|up from|grew)/.test(s)) intent = 'INCREASED';
  else if (/(decreas|less than|gave less|fewer|down from|dropped)/.test(s)) intent = 'DECREASED';
  else if (/first[- ]time|new giver|first gift/.test(s)) intent = 'FIRST_TIME';
  else if (/(top|biggest|largest|most)/.test(s)) intent = 'TOP';
  const min = /\$\s?([\d,]+)/.exec(s);
  return { intent, a, b, minA: min ? Number(min[1].replace(/,/g, '')) : undefined, limit: 25, source: 'RULES' };
}

export async function parseQuestion(q: string, funds: string[]): Promise<QuerySpec> {
  const fallback = heuristicSpec(q);
  const today = todayStr();
  const prompt = `You convert a church finance question into a JSON query. Today is ${today}. Reply with JSON only:
{"intent":"GAVE_A_NOT_B|INCREASED|DECREASED|TOP|FIRST_TIME|TOTAL","a":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","label":"..."},"b":{"from":"...","to":"...","label":"..."},"fund":null|"<one of: ${funds.join(' | ')}>","minA":null|number}
Meaning: period "a" is the baseline period, "b" the comparison/current period. GAVE_A_NOT_B = gave in a but nothing in b. INCREASED/DECREASED = total in b vs a. TOP/FIRST_TIME/TOTAL use b. If only one period is mentioned set it as b and a as the equal-length period before it.
Question: ${q.slice(0, 400)}`;
  try {
    const raw = await callGemini(prompt, { responseMimeType: 'application/json' }, 'gemini-flash-latest');
    if (!raw) return fallback;
    const j = JSON.parse(stripFence(raw));
    const okR = (r: any) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.to) && r.from <= r.to;
    if (!okR(j.a) || !okR(j.b) || !['GAVE_A_NOT_B', 'INCREASED', 'DECREASED', 'TOP', 'FIRST_TIME', 'TOTAL'].includes(j.intent)) return fallback;
    return { intent: j.intent, a: { from: j.a.from, to: j.a.to, label: String(j.a.label || `${j.a.from}…${j.a.to}`) }, b: { from: j.b.from, to: j.b.to, label: String(j.b.label || `${j.b.from}…${j.b.to}`) }, fund: j.fund || undefined, minA: typeof j.minA === 'number' ? j.minA : undefined, limit: 25, source: 'ARIA' };
  } catch { return fallback; }
}

/** Deterministic execution. `canSeeGivers=false` (VIEW_GIVING-only trustees) blocks person-level answers. */
export function runQuery(spec: QuerySpec, rows: LedgerRow[], idx: PeopleIndex, canSeeGivers: boolean): QueryAnswer {
  let rl = live(rows);
  if (spec.fund) rl = rl.filter(r => r.fundName.toLowerCase() === spec.fund!.toLowerCase());
  const inA = rl.filter(r => inRange(r.date, spec.a)); const inB = rl.filter(r => inRange(r.date, spec.b));
  if (spec.intent === 'TOTAL') {
    const byFund: Record<string, number> = {}; inB.forEach(r => { byFund[r.fundName] = round2((byFund[r.fundName] || 0) + r.amount); });
    return { spec, summary: `${money(sum(inB))} across ${inB.length} gifts in ${spec.b.label}${spec.fund ? ` to ${spec.fund}` : ''}.`, headers: ['Fund', 'Total'], rows: Object.entries(byFund).sort((x, y) => y[1] - x[1]) };
  }
  if (!canSeeGivers) return { spec, summary: 'Giver-level answers are limited to finance roles. Ask about totals by fund or period instead.', headers: [], rows: [] };
  const A = new Map(aggregateGivers(inA, idx).filter(g => g.key !== 'anon').map(g => [g.key, g]));
  const B = new Map(aggregateGivers(inB, idx).filter(g => g.key !== 'anon').map(g => [g.key, g]));
  const lim = spec.limit || 25;
  if (spec.intent === 'GAVE_A_NOT_B') {
    const r = [...A.values()].filter(g => !B.has(g.key) && g.total >= (spec.minA || 0)).sort((x, y) => y.total - x.total);
    return { spec, summary: `${r.length} giver(s) gave in ${spec.a.label} but nothing in ${spec.b.label}.`, headers: ['Giver', `Given in ${spec.a.label}`, 'Last gift'], rows: r.slice(0, lim).map(g => [g.name, g.total, g.last]) };
  }
  if (spec.intent === 'FIRST_TIME') {
    const prior = new Set(aggregateGivers(rl.filter(r => r.date < spec.b.from), idx).map(g => g.key));
    const r = [...B.values()].filter(g => !prior.has(g.key)).sort((x, y) => y.total - x.total);
    return { spec, summary: `${r.length} first-time giver(s) in ${spec.b.label}.`, headers: ['Giver', 'First gift', 'Total'], rows: r.slice(0, lim).map(g => [g.name, g.first, g.total]) };
  }
  if (spec.intent === 'TOP') {
    const r = [...B.values()].sort((x, y) => y.total - x.total).slice(0, lim);
    return { spec, summary: `Top ${r.length} givers in ${spec.b.label}.`, headers: ['Giver', 'Total', 'Gifts'], rows: r.map(g => [g.name, g.total, g.count]) };
  }
  const keys = new Set([...A.keys(), ...B.keys()]);
  const diffs = [...keys].map(k => { const a = A.get(k)?.total || 0, b = B.get(k)?.total || 0; return { name: (B.get(k) || A.get(k))!.name, a, b, d: round2(b - a) }; });
  const r = (spec.intent === 'INCREASED' ? diffs.filter(x => x.d > 0 && x.a >= (spec.minA || 0)).sort((x, y) => y.d - x.d) : diffs.filter(x => x.d < 0 && x.a >= (spec.minA || 0)).sort((x, y) => x.d - y.d));
  return { spec, summary: `${r.length} giver(s) ${spec.intent === 'INCREASED' ? 'increased' : 'decreased'} from ${spec.a.label} to ${spec.b.label}.`, headers: ['Giver', spec.a.label, spec.b.label, 'Change'], rows: r.slice(0, lim).map(x => [x.name, x.a, x.b, x.d]) };
}

export async function askLedger(q: string, rows: LedgerRow[], idx: PeopleIndex, funds: string[], canSeeGivers: boolean): Promise<QueryAnswer> {
  const spec = await parseQuestion(q, funds);
  const ans = runQuery(spec, rows, idx, canSeeGivers);
  // ARIA narrates AGGREGATES ONLY — no names, no per-giver amounts leave the device.
  const agg = `intent=${spec.intent}; periods=${spec.a.label} vs ${spec.b.label}; result_rows=${ans.rows.length}; summary=${ans.summary}`;
  ans.narrated = await callGemini(`You are Aria, a warm, precise church finance assistant. In 2 sentences, plainly restate this result for a finance director. Do not invent numbers or names. ${agg}`, {}, 'gemini-flash-latest').catch(() => null);
  return ans;
}
export async function narrateDigest(lines: string[]): Promise<string | null> {
  if (!lines.length) return null;
  try { return await callGemini(`You are Aria, a church finance assistant. Write a 3-sentence, calm weekly digest from these deterministic findings (no names, no new numbers):\n- ${lines.join('\n- ')}`, {}, 'gemini-flash-latest'); } catch { return null; }
}

// ── Mobile check capture (Gemini vision → pre-filled entry; always human-confirmed) ──
export interface CheckExtract { amount?: number; date?: string; checkNumber?: string; payer?: string; memo?: string }
async function fileToJpegBase64(file: File, maxSide = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}
export async function extractCheck(file: File): Promise<{ ok: boolean; data?: CheckExtract; message?: string }> {
  try {
    const b64 = await fileToJpegBase64(file);
    const res = await callGeminiDetailed([{ role: 'user', parts: [
      { text: 'Read this personal check image. Return JSON only: {"amount":number|null,"date":"YYYY-MM-DD"|null,"checkNumber":string|null,"payer":string|null,"memo":string|null}. Use the numeric amount box; if unreadable use null. Never guess.' },
      { inlineData: { mimeType: 'image/jpeg', data: b64 } },
    ] }], { responseMimeType: 'application/json' }, 'gemini-2.5-flash');
    if (!res.ok) return { ok: false, message: res.message || 'Check reading is unavailable right now — enter it manually.' };
    const j = JSON.parse(stripFence(res.text));
    const data: CheckExtract = { amount: typeof j.amount === 'number' && j.amount > 0 ? j.amount : undefined, date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : undefined, checkNumber: j.checkNumber ? String(j.checkNumber) : undefined, payer: j.payer ? String(j.payer) : undefined, memo: j.memo ? String(j.memo) : undefined };
    return { ok: true, data };
  } catch (e: any) { return { ok: false, message: 'Could not read that image — enter the check manually.' }; }
}

export { todayStr };

/** Keep the double-entry books in step after a batch posts / deposits or a gift is voided (best-effort, never blocks). */
function acctSync(orgId: string): void { import('./acctService').then(m => m.onFinanceChange(orgId)).catch(() => {}); }
