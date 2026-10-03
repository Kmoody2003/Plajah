// acctSpending — the SPENDING side of Elevate finance: submit → route → approve → pay → post to the books,
// plus vendors, recurring bills, 1099 tracking, department-budget awareness and the data behind the Money Inbox.
//
// Rules of the road (Firestore rules enforce role/ownership only; business rules live here):
//  • anyone with SUBMIT_EXPENSES creates a SUBMITTED expense/reimbursement/bill/request (never a status above that);
//  • dept heads (Ministry.headUids) approve their own department; pastors / finance approve the rest; nobody approves
//    their own submission (org owner excepted). Auto-approval is COMPUTED from financeSettings at read time — the
//    client never trusts a flag the submitter could forge;
//  • ≥ financeSettings.dualApprovalAbove needs two different approvals (second = finance countersign);
//  • only accounting writers pay/void/post. Posting uses services/acctPosting.ts with deterministic ids so
//    re-clicking can never double-post. Journals are never deleted — voids post a reversal.
//  • every action is audited (logOrgAction) and the people involved are notified (createNotification).
//
// Ledger IO goes through services/acctService.ts (idempotent journal ids, period locks, reversals).

import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import { logOrgAction, type OrgAuditAction } from './orgAudit';
import { createNotification, uploadFile } from './backendService';
import { callGeminiDetailed } from './geminiService';
import { fetchOrganization, updateOrganization } from './organizationService';
import { ensureChart as svcEnsureChart, postJournal as svcPost, reverseJournal as svcReverse, sysAccounts } from './acctService';
import { elevateCan } from './elevateRoles';
import { isOrgOwner } from './orgPermissions';
import {
  DEFAULT_CHART, accountDocId, sysAccountsOf, expenseEntry, billEntry, billPaymentEntry, periodOf,
  type DraftJournal, type SysAccounts,
} from './acctPosting';
import type {
  Organization, OrgMembership, AcctExpense, AcctVendor, AcctAccount, AcctBankAccount, AcctBankTxn, AcctBudget, AcctJournal, AcctPeriod,
  ChmsPayout, ChmsFinanceSettings, RecurringBill,
} from '../types';
import type { FinanceSnapshot } from './chmsFinance';

// ── small utils ────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDaysISO = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return todayISO(d); };
export const usd = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const strip = <T extends Record<string, any>>(o: T): T => { const out: Record<string, any> = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v; return out as T; };
const uid_ = (): string => { const u = auth.currentUser?.uid; if (!u) throw new Error('Sign in required.'); return u; };
const actorName = () => auth.currentUser?.displayName || auth.currentUser?.email || 'Someone';
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'x';
const normName = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const FINANCE_CHANGED = 'plajah:finance-changed';
/** Tell every mounted hook/badge (Money Inbox, tab counts, ElevateOps nav) to refresh. */
export const emitFinanceChanged = () => { try { window.dispatchEvent(new Event(FINANCE_CHANGED)); } catch { /* ssr */ } };

const audit = (orgId: string, action: OrgAuditAction, target?: string, meta?: Record<string, any>) =>
  logOrgAction(orgId, action, { targetName: target, meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined }).catch(() => {});

// ── permissions ────────────────────────────────────────────────────────────────
export interface SpendingPerms {
  canSubmit: boolean;     // SUBMIT_EXPENSES
  canApprove: boolean;    // APPROVE_EXPENSES (or head of some department)
  canManage: boolean;     // MANAGE_ACCOUNTING — pays, posts, voids, vendors
  canViewBooks: boolean;  // VIEW_ACCOUNTING or better — read-only mode when !canManage
  canGiving: boolean;     // MANAGE_GIVING
  isOwner: boolean;
  readOnly: boolean;      // VIEW_ACCOUNTING only
}
export function spendingPerms(member: OrgMembership | null, org: Organization): SpendingPerms {
  const uid = auth.currentUser?.uid;
  const can = (p: any) => elevateCan(member, org, p);
  const headsDept = !!uid && (org.ministries || []).some(m => m.headUids?.includes(uid));
  const isOwner = isOrgOwner(uid, org);
  const canManage = can('MANAGE_ACCOUNTING');
  const canViewBooks = canManage || can('VIEW_ACCOUNTING');
  return {
    canSubmit: can('SUBMIT_EXPENSES') || headsDept, canApprove: can('APPROVE_EXPENSES') || headsDept, canManage, canViewBooks,
    canGiving: can('MANAGE_GIVING'), isOwner, readOnly: canViewBooks && !canManage,
  };
}

// ── categories (submitters cannot read the chart, so ids are derived deterministically) ──
export const EXPENSE_CATEGORIES = DEFAULT_CHART.filter(a => a.type === 'EXPENSE' && !a.systemKey)
  .map(a => ({ code: a.code, name: a.name }));
export const categoryId = (orgId: string, code: string) => accountDocId(orgId, code);
export const categoryName = (orgId: string, accountId: string, accounts?: AcctAccount[]): string => {
  const live = accounts?.find(a => a.id === accountId); if (live) return live.name;
  const c = EXPENSE_CATEGORIES.find(x => categoryId(orgId, x.code) === accountId); return c?.name || 'Uncategorized';
};

// ── settings helpers (approval policy) ─────────────────────────────────────────
export function spendingSettings(org: Pick<Organization, 'financeSettings'>): ChmsFinanceSettings {
  return org.financeSettings || {};
}
/** Auto-approve limit for a department (dept override → org default → 0 = none). */
export function autoLimitFor(org: Pick<Organization, 'financeSettings'>, deptId?: string): number {
  const s = spendingSettings(org);
  const d = deptId ? s.deptAutoApprove?.[deptId] : undefined;
  return Math.max(0, d ?? s.autoApproveUnder ?? 0);
}
export const requiredApprovalsFor = (org: Pick<Organization, 'financeSettings'>, amount: number): 1 | 2 => {
  const above = spendingSettings(org).dualApprovalAbove;
  return above != null && above > 0 && amount >= above ? 2 : 1;
};

export type Readiness =
  | 'DRAFT' | 'PENDING' | 'NEEDS_SECOND' | 'READY' | 'READY_AUTO' | 'REQUEST_APPROVED' | 'PAID' | 'REJECTED' | 'VOID';
/** Where an expense really is in the pipeline, computed from settings (never from a submitter-set flag). */
export function readiness(org: Pick<Organization, 'financeSettings'>, e: AcctExpense, all: AcctExpense[] = []): Readiness {
  if (e.status === 'PAID' || e.status === 'REJECTED' || e.status === 'VOID' || e.status === 'DRAFT') return e.status;
  const required = e.requiredApprovals ?? requiredApprovalsFor(org, e.amount);
  if (e.status === 'APPROVED') {
    if (e.isRequest) return 'REQUEST_APPROVED';
    const n = new Set((e.approvals || []).map(a => a.uid)).size;
    return !e.approvals?.length || n >= required ? 'READY' : 'NEEDS_SECOND';
  }
  // SUBMITTED
  if (e.isRequest) return autoLimitFor(org, e.deptId) >= e.amount && required === 1 ? 'REQUEST_APPROVED' : 'PENDING';
  if (required === 1 && autoLimitFor(org, e.deptId) >= e.amount) return 'READY_AUTO';
  if (e.requestId) {
    const req = all.find(x => x.id === e.requestId);
    if (req && req.status === 'APPROVED' && e.amount <= req.amount * 1.1 + 1) return 'READY_AUTO';
  }
  return 'PENDING';
}
export const isPayable = (r: Readiness) => r === 'READY' || r === 'READY_AUTO';

export function ministryOf(org: Pick<Organization, 'ministries'>, deptId?: string) { return deptId ? org.ministries?.find(m => m.id === deptId) : undefined; }
export const deptNameOf = (org: Pick<Organization, 'ministries'>, deptId?: string) => ministryOf(org, deptId)?.name || (deptId ? 'Department' : 'General');

/** Can this user approve this expense right now? (UI gate — Firestore rules are the real lock.) */
export function canApproveExpense(org: Organization, member: OrgMembership | null, e: AcctExpense): { ok: boolean; reason?: string } {
  const uid = auth.currentUser?.uid; if (!uid) return { ok: false, reason: 'Sign in.' };
  const owner = isOrgOwner(uid, org);
  if (e.submittedBy === uid && !owner) return { ok: false, reason: 'You can’t approve your own request — someone else needs to.' };
  if ((e.approvals || []).some(a => a.uid === uid)) return { ok: false, reason: 'You already approved this.' };
  const m = ministryOf(org, e.deptId);
  const isHead = !!m?.headUids?.includes(uid);
  if (isHead) return { ok: true };
  if (elevateCan(member, org, 'APPROVE_EXPENSES', e.deptId ? { ministryId: e.deptId } : undefined)) {
    // Department-head ROLE only reaches their own department.
    if (member?.roleKey === 'DEPARTMENT_HEAD' && !owner && !isHead && !member.ministryRoles?.some(r => r.ministryId === e.deptId)) return { ok: false, reason: 'Only this department’s head, a pastor, or finance can approve it.' };
    return { ok: true };
  }
  return { ok: false, reason: 'Only a department head, pastor or finance can approve this.' };
}

/** Who should be nudged to approve: dept heads first; else pastors + finance. */
export function approverUidsFor(org: Organization, e: Pick<AcctExpense, 'deptId' | 'submittedBy'>): string[] {
  const heads = ministryOf(org, e.deptId)?.headUids || [];
  const set = new Set<string>(heads.length ? heads : [...(org.pastorUids || []), ...(org.accountingUids || org.financeUids || [])]);
  if (!set.size) set.add(org.creatorId);
  set.delete(e.submittedBy);
  return Array.from(set);
}

// ── data bundle ────────────────────────────────────────────────────────────────
export interface SpendingBundle {
  expenses: AcctExpense[]; vendors: AcctVendor[]; accounts: AcctAccount[]; bankAccounts: AcctBankAccount[];
  budgets: AcctBudget[]; bankTxns: AcctBankTxn[]; payouts: ChmsPayout[];
  scope: 'ALL' | 'MINE'; errors: string[]; loadedAt: number;
}
export const EMPTY_BUNDLE: SpendingBundle = { expenses: [], vendors: [], accounts: [], bankAccounts: [], budgets: [], bankTxns: [], payouts: [], scope: 'MINE', errors: [], loadedAt: 0 };

async function listBy<T>(col: string, orgId: string, extra?: [string, any]): Promise<T[]> {
  const q = extra ? query(collection(db, col), where('orgId', '==', orgId), where(extra[0], '==', extra[1])) : query(collection(db, col), where('orgId', '==', orgId));
  return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() } as unknown as T));
}

export async function loadSpending(org: Organization, perms: SpendingPerms): Promise<SpendingBundle> {
  const uid = uid_(); const errors: string[] = [];
  const safe = async <T,>(label: string, p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch (e: any) { errors.push(`${label}: ${e?.code || e?.message || 'failed'}`); return fb; } };
  const wantAll = perms.canApprove || perms.canViewBooks || perms.isOwner;
  let scope: 'ALL' | 'MINE' = wantAll ? 'ALL' : 'MINE';
  let expenses: AcctExpense[] = [];
  try { expenses = await listBy<AcctExpense>('acctExpenses', org.id, wantAll ? undefined : ['submittedBy', uid]); }
  catch { scope = 'MINE'; expenses = await safe('expenses', listBy<AcctExpense>('acctExpenses', org.id, ['submittedBy', uid]), []); }
  const books = perms.canViewBooks || perms.isOwner;
  const [vendors, accounts, bankAccounts, bankTxns, budgets, payouts] = await Promise.all([
    books ? safe('vendors', listBy<AcctVendor>('acctVendors', org.id), []) : Promise.resolve([] as AcctVendor[]),
    books ? safe('accounts', listBy<AcctAccount>('acctAccounts', org.id), []) : Promise.resolve([] as AcctAccount[]),
    books ? safe('bank', listBy<AcctBankAccount>('acctBankAccounts', org.id), []) : Promise.resolve([] as AcctBankAccount[]),
    books ? safe('bankTxns', listBy<AcctBankTxn>('acctBankTxns', org.id, ['status', 'UNMATCHED']), []) : Promise.resolve([] as AcctBankTxn[]),
    perms.canApprove || books ? safe('budgets', listBy<AcctBudget>('acctBudgets', org.id), []) : Promise.resolve([] as AcctBudget[]),
    books || perms.canGiving ? safe('payouts', listBy<ChmsPayout>('chmsPayouts', org.id, ['reconciled', false]), []) : Promise.resolve([] as ChmsPayout[]),
  ]);
  expenses.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { expenses, vendors, accounts, bankAccounts, budgets, bankTxns, payouts, scope, errors, loadedAt: Date.now() };
}

// ── suggestions + duplicates ───────────────────────────────────────────────────
const KEYWORD_RULES: [RegExp, string][] = [
  [/amazon|staples|office depot|officemax|usps|ups store|fedex|postage/i, '5700'],
  [/home depot|lowe'?s|ace hardware|menards|plumb|electric(al)? contractor|hvac|roof|janitor|cleaning/i, '5510'],
  [/dte|consumers energy|duke|xcel|con ?ed|pg&e|national grid|water|sewer|gas co|spectrum|comcast|xfinity|at&t|verizon|t-mobile|electric|energy|utility/i, '5500'],
  [/zoom|adobe|canva|planning center|pushpay|squarespace|godaddy|google|microsoft|dropbox|vimeo|resi|mailchimp|software|subscription|b&h|guitar center/i, '5400'],
  [/insurance|church mutual|brotherhood|guidestone/i, '5600'],
  [/cpa|accountant|attorney|legal|audit|payroll service|gusto|adp/i, '5800'],
  [/hobby lobby|michaels|walmart|costco|target|sam'?s club|dollar|lifeway|vbs|curriculum|craft|snacks|pizza|dominos|publix|kroger|aldi/i, '5100'],
  [/ccli|worship|sheet music|sweetwater|instrument|piano|choir/i, '5300'],
  [/mission|relief|benevolence|food pantry|compassion|orphan/i, '5200'],
];
export interface Suggestion { accountId?: string; fundId?: string; deptId?: string; vendorId?: string; source: 'history' | 'vendor' | 'rule'; why: string }
/** Rule-based memory: vendor defaults → what this vendor was coded to before (most frequent) → keyword rules. */
export function suggestFor(orgId: string, vendorName: string, expenses: AcctExpense[], vendors: AcctVendor[] = []): Suggestion | null {
  const n = normName(vendorName); if (n.length < 3) return null;
  const v = vendors.find(x => normName(x.name) === n);
  if (v && (v.defaultAccountId || v.defaultFundId)) return { accountId: v.defaultAccountId, fundId: v.defaultFundId, vendorId: v.id, source: 'vendor', why: `${v.name}’s saved defaults` };
  const past = expenses.filter(e => normName(e.vendorName) === n && e.status !== 'REJECTED' && e.status !== 'VOID');
  if (past.length) {
    const top = (key: 'accountId' | 'fundId' | 'deptId') => {
      const c: Record<string, number> = {}; past.forEach(e => { const k = e[key]; if (k) c[k] = (c[k] || 0) + 1; });
      return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    return { accountId: top('accountId'), fundId: top('fundId'), deptId: top('deptId'), vendorId: v?.id, source: 'history', why: `you’ve coded ${past.length} past ${past.length === 1 ? 'entry' : 'entries'} from them` };
  }
  for (const [re, code] of KEYWORD_RULES) if (re.test(vendorName)) return { accountId: categoryId(orgId, code), source: 'rule', why: 'common vendor match' };
  return null;
}

export function findDuplicate(c: { vendorName?: string; vendorId?: string; invoiceNumber?: string; amount: number; date: string }, existing: AcctExpense[], selfId?: string): { match: AcctExpense; reason: string } | null {
  const n = normName(c.vendorName);
  for (const e of existing) {
    if (e.id === selfId || e.status === 'VOID' || e.status === 'REJECTED' || e.isRequest) continue;
    const sameVendor = (c.vendorId && e.vendorId === c.vendorId) || (n && normName(e.vendorName) === n);
    if (!sameVendor) continue;
    if (c.invoiceNumber && e.invoiceNumber && normName(c.invoiceNumber) === normName(e.invoiceNumber)) return { match: e, reason: `Invoice ${e.invoiceNumber} from this vendor was already entered` };
    const days = Math.abs((new Date(c.date).getTime() - new Date(e.date).getTime()) / 86400000);
    if (Math.abs(e.amount - c.amount) < 0.005 && days <= 3) return { match: e, reason: `Same vendor and amount (${usd(e.amount)}) on ${e.date}` };
  }
  return null;
}

// ── department budget awareness ────────────────────────────────────────────────
export interface DeptBudgetStatus { deptId: string; deptName: string; budget: number; spent: number; pending: number; left: number; period: string; over: boolean }
function fiscalWindow(org: Pick<Organization, 'financeSettings'>, ref: Date) {
  const fy = (org.financeSettings?.fiscalYearStartMonth || 1) - 1;
  const idx = (ref.getMonth() - fy + 12) % 12;
  const q = Math.floor(idx / 3);
  const months: number[] = [q * 3, q * 3 + 1, q * 3 + 2];        // budget month indexes
  const cal = months.map(i => (i + fy) % 12);                      // calendar months 0-11
  const start = new Date(ref.getFullYear(), cal[0] > ref.getMonth() ? cal[0] - 12 : cal[0], 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  return { months, from: todayISO(start), to: todayISO(end), label: `Q${q + 1}` };
}
/** Quarter budget vs spent for one department. Null when there is no budget line for it (degrade quietly). */
export function deptBudgetStatus(org: Organization, budgets: AcctBudget[], expenses: AcctExpense[], deptId: string, ref = new Date()): DeptBudgetStatus | null {
  if (!budgets.length || !deptId) return null;
  const year = ref.getFullYear();
  const b = [...budgets].sort((x, y) => Math.abs(x.fiscalYear - year) - Math.abs(y.fiscalYear - year))[0];
  const w = fiscalWindow(org, ref);
  const lines = b.lines.filter(l => l.deptId === deptId);
  if (!lines.length) return null;
  const budget = r2(lines.reduce((s, l) => s + w.months.reduce((a, i) => a + (l.amounts?.[i] || 0), 0), 0));
  if (budget <= 0) return null;
  const inQ = expenses.filter(e => e.deptId === deptId && !e.isRequest && e.date >= w.from && e.date <= w.to);
  const spent = r2(inQ.filter(e => e.status === 'PAID' || e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0));
  const pending = r2(inQ.filter(e => e.status === 'SUBMITTED').reduce((s, e) => s + e.amount, 0));
  const left = r2(budget - spent - pending);
  return { deptId, deptName: deptNameOf(org, deptId), budget, spent, pending, left, period: w.label, over: left < 0 };
}
export function allDeptBudgets(org: Organization, budgets: AcctBudget[], expenses: AcctExpense[]): DeptBudgetStatus[] {
  const ids = new Set<string>(); budgets.forEach(b => b.lines.forEach(l => l.deptId && ids.add(l.deptId)));
  return Array.from(ids).map(id => deptBudgetStatus(org, budgets, expenses, id)).filter(Boolean) as DeptBudgetStatus[];
}

// ── receipts: upload + ARIA OCR (graceful) ─────────────────────────────────────
async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.85));
  } catch { return file; }
}
/** Private-by-path (owner-only read rule); the tokenised URL is stored on the expense doc which finance/approvers can read. */
export async function uploadFinanceFile(org: Organization, file: File, folder: 'receipts' | 'w9' = 'receipts'): Promise<string> {
  const uid = uid_();
  const blob = await shrinkImage(file);
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
  return uploadFile(`personal/${uid}/orgFinance/${org.id}/${folder}/${Date.now()}_${name}`, blob);
}
export interface ReceiptExtract { vendor?: string; date?: string; amount?: number; categoryCode?: string; description?: string; invoiceNumber?: string }
const stripFence = (t: string) => t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
export async function extractReceipt(file: File): Promise<{ ok: boolean; data?: ReceiptExtract; message?: string }> {
  if (!file.type.startsWith('image/')) return { ok: false, message: 'Attached. Auto-read works on photos — fill in the details below.' };
  try {
    const blob = await shrinkImage(file);
    const b64: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
    const cats = EXPENSE_CATEGORIES.map(c => `${c.code}=${c.name}`).join('; ');
    const res = await callGeminiDetailed([{ role: 'user', parts: [
      { text: `Read this receipt or invoice. Return JSON only: {"vendor":string|null,"date":"YYYY-MM-DD"|null,"amount":number|null,"categoryCode":string|null,"description":string|null,"invoiceNumber":string|null}. amount = the final TOTAL paid/due. categoryCode must be one of: ${cats}. description = a 3-8 word summary of what was bought. Use null for anything unreadable. Never guess.` },
      { inlineData: { mimeType: 'image/jpeg', data: b64 } },
    ] }], { responseMimeType: 'application/json' }, 'gemini-2.5-flash');
    if (!res.ok) return { ok: false, message: 'Couldn’t auto-read this one — the photo is attached, just type the details.' };
    const j = JSON.parse(stripFence(res.text));
    const data: ReceiptExtract = {
      vendor: j.vendor ? String(j.vendor) : undefined,
      date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : undefined,
      amount: typeof j.amount === 'number' && j.amount > 0 ? j.amount : undefined,
      categoryCode: EXPENSE_CATEGORIES.some(c => c.code === String(j.categoryCode)) ? String(j.categoryCode) : undefined,
      description: j.description ? String(j.description) : undefined,
      invoiceNumber: j.invoiceNumber ? String(j.invoiceNumber) : undefined,
    };
    return { ok: true, data };
  } catch { return { ok: false, message: 'Couldn’t auto-read this one — the photo is attached, just type the details.' }; }
}

// ── notifications ──────────────────────────────────────────────────────────────
async function notify(org: Organization, userIds: string[], title: string, message: string) {
  const me = auth.currentUser; if (!me) return;
  await Promise.all(Array.from(new Set(userIds)).filter(u => u && u !== me.uid).map(u =>
    createNotification({ userId: u, senderId: me.uid, senderName: org.name, senderPhoto: org.logoUrl || '', type: 'SYSTEM', title, message, targetId: org.id }).catch(() => {})));
}

// ── submit ─────────────────────────────────────────────────────────────────────
export type SpendKind = 'EXPENSE' | 'REIMBURSEMENT' | 'BILL' | 'REQUEST';
export const SPEND_KIND_LABEL: Record<SpendKind, { label: string; hint: string }> = {
  EXPENSE: { label: 'Church card', hint: 'I already paid with the church card' },
  REIMBURSEMENT: { label: 'Reimburse me', hint: 'I paid out of pocket' },
  BILL: { label: 'Vendor bill', hint: 'An invoice to pay later' },
  REQUEST: { label: 'Ask first', hint: 'Get approval before I buy' },
};
export const kindOf = (e: AcctExpense): SpendKind => e.isRequest ? 'REQUEST' : e.kind;
export interface SubmitInput {
  kind: SpendKind; vendorName?: string; vendorId?: string; description: string; date: string; dueDate?: string; amount: number;
  accountId: string; fundId?: string; deptId?: string; receiptUrls?: string[]; invoiceNumber?: string; requestId?: string; payee?: string; memo?: string;
  allowDuplicate?: boolean;
}
export function validateSubmit(i: SubmitInput): string | null {
  if (!(i.amount > 0)) return 'Enter the amount.';
  if (!i.description.trim()) return 'Add a short description (what was it for?).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return 'Pick a date.';
  if (!i.accountId) return 'Pick a category.';
  if ((i.kind === 'REIMBURSEMENT' || i.kind === 'EXPENSE') && !i.receiptUrls?.length) return 'Snap or attach the receipt — it keeps the audit happy.';
  return null;
}
export async function submitExpense(org: Organization, input: SubmitInput, existing: AcctExpense[] = []): Promise<AcctExpense> {
  const uid = uid_();
  const err = validateSubmit(input); if (err) throw new Error(err);
  if (!input.allowDuplicate && input.kind !== 'REQUEST') {
    const dup = findDuplicate(input, existing); if (dup) throw new Error(`Possible duplicate: ${dup.reason}.`);
  }
  const ref = doc(collection(db, 'acctExpenses'));
  const exp: AcctExpense = strip({
    id: ref.id, orgId: org.id, kind: input.kind === 'REQUEST' ? 'EXPENSE' : input.kind, isRequest: input.kind === 'REQUEST' ? true : undefined,
    vendorId: input.vendorId, vendorName: input.vendorName?.trim() || undefined, description: input.description.trim(),
    date: input.date, dueDate: input.dueDate || undefined, amount: r2(input.amount), accountId: input.accountId, fundId: input.fundId || undefined, deptId: input.deptId || undefined,
    deptName: input.deptId ? deptNameOf(org, input.deptId) : undefined,
    receiptUrls: input.receiptUrls?.length ? input.receiptUrls : undefined, invoiceNumber: input.invoiceNumber?.trim() || undefined, requestId: input.requestId, payee: input.payee, memo: input.memo?.trim() || undefined,
    status: 'SUBMITTED', requiredApprovals: requiredApprovalsFor(org, input.amount), approvals: [],
    submittedBy: uid, submittedByName: actorName(), submittedAt: Date.now(), createdAt: Date.now(),
  }) as AcctExpense;
  await setDoc(ref, exp);
  audit(org.id, 'FIN_EXP_SUBMITTED', `${usd(exp.amount)} ${exp.description}`, { id: exp.id, kind: kindOf(exp), dept: exp.deptId });
  if (readiness(org, exp, existing) === 'PENDING') {
    notify(org, approverUidsFor(org, exp), `${actorName()} needs your approval`, `${usd(exp.amount)} — ${exp.description}${exp.deptName ? ` (${exp.deptName})` : ''}. Open Money › Inbox to approve in one tap.`);
  }
  emitFinanceChanged();
  return exp;
}

/** Submitter withdraws (or finance voids an unpaid) request. Rules allow the submitter DRAFT/SUBMITTED → VOID. */
export async function withdrawExpense(org: Organization, e: AcctExpense, reason = 'Withdrawn by submitter'): Promise<void> {
  const uid = uid_();
  await updateDoc(doc(db, 'acctExpenses', e.id), { status: 'VOID', voidReason: reason, voidedBy: uid, voidedAt: Date.now() });
  audit(org.id, 'FIN_EXP_VOID', `${usd(e.amount)} ${e.description}`, { id: e.id, reason });
  emitFinanceChanged();
}
/** Undo a withdraw (submitter, VOID → SUBMITTED isn't allowed by rules, so we only offer undo to accounting writers). */
export async function restoreExpense(org: Organization, e: AcctExpense): Promise<void> {
  await updateDoc(doc(db, 'acctExpenses', e.id), { status: 'SUBMITTED', voidReason: null, voidedBy: null, voidedAt: null });
  audit(org.id, 'FIN_EXP_VOID', `Restored ${usd(e.amount)} ${e.description}`, { id: e.id, restored: true });
  emitFinanceChanged();
}

// ── approve / reject ───────────────────────────────────────────────────────────
export async function approveExpense(org: Organization, member: OrgMembership | null, e: AcctExpense, note?: string): Promise<{ complete: boolean }> {
  const uid = uid_();
  const g = canApproveExpense(org, member, e); if (!g.ok) throw new Error(g.reason);
  const required = e.requiredApprovals ?? requiredApprovalsFor(org, e.amount);
  const approvals = [...(e.approvals || []), strip({ uid, name: actorName(), at: Date.now(), note: note?.trim() || undefined })];
  const complete = new Set(approvals.map(a => a.uid)).size >= required;
  try {
    await updateDoc(doc(db, 'acctExpenses', e.id), strip({ status: 'APPROVED', approvals, requiredApprovals: required, approvedBy: complete ? uid : e.approvedBy, approvedAt: complete ? Date.now() : e.approvedAt }));
  } catch (err: any) {
    if (err?.code === 'permission-denied') throw new Error('Plajah couldn’t record your approval — ask a pastor or finance to approve this one.');
    throw err;
  }
  audit(org.id, 'FIN_EXP_APPROVED', `${usd(e.amount)} ${e.description}`, { id: e.id, complete, by: uid });
  notify(org, [e.submittedBy], complete ? 'Your request was approved' : 'Approved — waiting on a second approval', `${usd(e.amount)} — ${e.description}${note ? ` · “${note}”` : ''}`);
  if (complete && !e.isRequest) notify(org, (org.accountingUids || org.financeUids || []).slice(0, 5), 'Ready to pay', `${usd(e.amount)} — ${e.description}`);
  emitFinanceChanged();
  return { complete };
}
export async function rejectExpense(org: Organization, member: OrgMembership | null, e: AcctExpense, reason: string): Promise<void> {
  const uid = uid_();
  if (!reason.trim()) throw new Error('Add a short reason so they know what to fix.');
  const g = canApproveExpense(org, member, e); if (!g.ok && !(g.reason || '').includes('already')) throw new Error(g.reason);
  await updateDoc(doc(db, 'acctExpenses', e.id), { status: 'REJECTED', rejectedReason: reason.trim(), rejectedBy: uid, rejectedAt: Date.now() });
  audit(org.id, 'FIN_EXP_REJECTED', `${usd(e.amount)} ${e.description}`, { id: e.id, reason });
  notify(org, [e.submittedBy], 'Your request needs changes', `${usd(e.amount)} — ${e.description}. Reason: ${reason.trim()}`);
  emitFinanceChanged();
}

// ── ledger plumbing (thin wrappers over acctService) ──────────────────────────
export async function assertPeriodOpen(orgId: string, date: string): Promise<void> {
  try {
    const s = await getDocs(query(collection(db, 'acctPeriods'), where('orgId', '==', orgId), where('period', '==', periodOf(date))));
    if (s.docs.some(d => (d.data() as AcctPeriod).status === 'CLOSED')) throw new Error(`${periodOf(date)} is closed. Pick a date in an open month or ask your bookkeeper to reopen it.`);
  } catch (e: any) { if (/is closed/.test(e?.message || '')) throw e; /* no read access / no periods yet → fine */ }
}
export async function ensureChart(org: Pick<Organization, 'id'>): Promise<AcctAccount[]> { return (await svcEnsureChart(org.id)).accounts; }
export const loadSysAccounts = (orgId: string): Promise<SysAccounts> => sysAccounts(orgId);
/** Idempotent (deterministic key) and period-locked via acctService. Returns the journal id. */
export async function postJournal(orgId: string, draft: DraftJournal): Promise<string> { return (await svcPost(orgId, draft, uid_())).id; }
async function reverseJournal(orgId: string, journalId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'acctJournals', journalId)); if (!snap.exists()) return;
  const j = { id: snap.id, ...snap.data() } as AcctJournal; if (j.status === 'REVERSED') return;
  await svcReverse(orgId, j, 'expense voided');
}

// ── vendors ────────────────────────────────────────────────────────────────────
export const vendorDocId = (orgId: string, name: string) => `v_${orgId.replace(/[^A-Za-z0-9_-]/g, '_')}_${slug(name)}`;
export async function saveVendor(org: Organization, v: Partial<AcctVendor> & { name: string }): Promise<AcctVendor> {
  uid_();
  const id = v.id || vendorDocId(org.id, v.name);
  const prev = await getDoc(doc(db, 'acctVendors', id));
  const merged: AcctVendor = strip({ ...(prev.exists() ? prev.data() : {}), ...v, id, orgId: org.id, name: v.name.trim(), active: v.active ?? true, createdAt: (prev.data() as any)?.createdAt || Date.now() }) as AcctVendor;
  await setDoc(doc(db, 'acctVendors', id), merged);
  audit(org.id, 'FIN_VENDOR', merged.name, { id, is1099: !!merged.is1099 });
  emitFinanceChanged();
  return merged;
}
async function ensureVendorFor(org: Organization, e: AcctExpense, vendors: AcctVendor[]): Promise<string | undefined> {
  if (e.vendorId) return e.vendorId;
  const name = e.vendorName?.trim(); if (!name || e.kind === 'REIMBURSEMENT') return undefined;
  const hit = vendors.find(v => normName(v.name) === normName(name)); if (hit) return hit.id;
  try { return (await saveVendor(org, { name, defaultAccountId: e.accountId, defaultFundId: e.fundId })).id; } catch { return undefined; }
}

// ── pay / book / void ──────────────────────────────────────────────────────────
export type PayMethod = NonNullable<AcctExpense['paymentMethod']>;
export interface PayOpts { method: PayMethod; date?: string; bankAccountId?: string; checkNumber?: string }
export const PAY_METHODS: { key: PayMethod; label: string }[] = [{ key: 'CHECK', label: 'Check' }, { key: 'ACH', label: 'ACH / bank transfer' }, { key: 'CARD', label: 'Card' }, { key: 'CASH', label: 'Cash' }, { key: 'ONLINE', label: 'Online' }];

interface Ctx { sys: SysAccounts; banks: AcctBankAccount[]; vendors: AcctVendor[]; all: AcctExpense[] }
export async function payContext(org: Organization, b: SpendingBundle): Promise<Ctx> {
  const accounts = await ensureChart(org);
  return { sys: sysAccountsOf(accounts), banks: b.bankAccounts, vendors: b.vendors, all: b.expenses };
}
const paidFrom = (ctx: Ctx, bankAccountId?: string, method?: PayMethod): string | undefined => {
  const pick = bankAccountId ? ctx.banks.find(x => x.id === bankAccountId) : method === 'CARD' ? ctx.banks.find(x => x.kind === 'CREDIT_CARD' && x.active) : undefined;
  return pick?.accountId;
};
async function assertAccountExists(e: AcctExpense) {
  if (!(await getDoc(doc(db, 'acctAccounts', e.accountId))).exists()) throw new Error(`The category on “${e.description}” isn’t in your chart of accounts — recode it first.`);
}

/** Book a bill to Accounts Payable now (so AP/reports are right) without paying it yet. */
export async function bookBill(org: Organization, e: AcctExpense, ctx: Ctx): Promise<string> {
  if (e.kind !== 'BILL') throw new Error('Only vendor bills go to Accounts Payable.');
  await assertAccountExists(e);
  const id = await postJournal(org.id, billEntry(ctx.sys, { id: e.id, date: e.date, amount: e.amount, accountId: e.accountId, fundId: e.fundId, deptId: e.deptId, memo: `${e.vendorName || 'Bill'}${e.invoiceNumber ? ' #' + e.invoiceNumber : ''} — ${e.description}` }));
  await updateDoc(doc(db, 'acctExpenses', e.id), strip({ journalId: id, status: 'APPROVED', approvedBy: e.approvedBy || uid_(), approvedAt: e.approvedAt || Date.now(), vendorId: await ensureVendorFor(org, e, ctx.vendors) }));
  audit(org.id, 'FIN_EXP_BOOKED', `${usd(e.amount)} ${e.vendorName || e.description}`, { id: e.id });
  emitFinanceChanged();
  return id;
}

export async function payExpense(org: Organization, e: AcctExpense, opts: PayOpts, ctx: Ctx, extra?: { payBatchId?: string }): Promise<void> {
  const uid = uid_();
  if (e.isRequest) throw new Error('A purchase request is an approval, not a payment — pay the expense once it’s submitted.');
  const r = readiness(org, e, ctx.all);
  if (!isPayable(r)) throw new Error(r === 'NEEDS_SECOND' ? 'This needs a second approval first.' : r === 'PAID' ? 'Already paid.' : 'This isn’t approved yet.');
  if (opts.method === 'CHECK' && !opts.checkNumber?.trim()) throw new Error('Enter the check number.');
  const date = opts.date || todayISO();
  await assertPeriodOpen(org.id, date); await assertAccountExists(e);
  const from = paidFrom(ctx, opts.bankAccountId, opts.method);
  const memo = `${e.vendorName || e.submittedByName || 'Expense'}${e.invoiceNumber ? ' #' + e.invoiceNumber : ''} — ${e.description}`;
  let journalId = e.journalId; let paymentJournalId: string | undefined;
  if (e.kind === 'BILL') {
    if (!journalId) journalId = await postJournal(org.id, billEntry(ctx.sys, { id: e.id, date: e.date, amount: e.amount, accountId: e.accountId, fundId: e.fundId, deptId: e.deptId, memo }));
    paymentJournalId = await postJournal(org.id, billPaymentEntry(ctx.sys, { id: e.id, date, amount: e.amount, memo: `Paid: ${memo}`, paidFromAccountId: from }));
  } else {
    journalId = await postJournal(org.id, expenseEntry(ctx.sys, { id: e.id, date: e.kind === 'REIMBURSEMENT' ? date : e.date, amount: e.amount, accountId: e.accountId, fundId: e.fundId, deptId: e.deptId, memo: e.kind === 'REIMBURSEMENT' ? `Reimbursement to ${e.payee || e.submittedByName || 'staff'} — ${e.description}` : memo, paidFromAccountId: from }));
  }
  const vendorId = await ensureVendorFor(org, e, ctx.vendors);
  await updateDoc(doc(db, 'acctExpenses', e.id), strip({
    status: 'PAID', paidAt: Date.now(), paymentMethod: opts.method, checkNumber: opts.checkNumber?.trim() || undefined, bankAccountId: opts.bankAccountId || undefined,
    journalId, paymentJournalId, vendorId, approvedBy: e.approvedBy || (r === 'READY_AUTO' ? 'auto' : uid), approvedAt: e.approvedAt || Date.now(), payBatchId: extra?.payBatchId,
  }));
  if (e.requestId) { try { await updateDoc(doc(db, 'acctExpenses', e.requestId), { status: 'PAID', memo: `Fulfilled by ${e.id}` }); } catch { /* best effort */ } }
  audit(org.id, 'FIN_EXP_PAID', `${usd(e.amount)} ${e.vendorName || e.description}`, { id: e.id, method: opts.method, check: opts.checkNumber, journalId, paymentJournalId });
  notify(org, [e.submittedBy], e.kind === 'REIMBURSEMENT' ? 'You’ve been reimbursed' : 'Your expense was recorded as paid', `${usd(e.amount)} — ${e.description}${opts.checkNumber ? ` (check #${opts.checkNumber})` : ''}`);
  emitFinanceChanged();
}

/** Pay many at once. Checks auto-increment from `startCheck`. Returns what succeeded / failed (never throws midway). */
export async function batchPay(org: Organization, list: AcctExpense[], opts: PayOpts & { startCheck?: number }, ctx: Ctx): Promise<{ paid: string[]; failed: { id: string; message: string }[] }> {
  const batchId = `pb_${Date.now().toString(36)}`; let n = opts.startCheck; const paid: string[] = []; const failed: { id: string; message: string }[] = [];
  for (const e of list) {
    try {
      await payExpense(org, e, { ...opts, checkNumber: opts.method === 'CHECK' ? String(n ?? '') : undefined }, ctx, { payBatchId: batchId });
      if (opts.method === 'CHECK' && n != null) n++;
      paid.push(e.id);
    } catch (err: any) { failed.push({ id: e.id, message: err?.message || 'failed' }); }
  }
  return { paid, failed };
}

/** Void with a reason; posted journals are reversed (never deleted). */
export async function voidExpense(org: Organization, e: AcctExpense, reason: string, perms: SpendingPerms): Promise<void> {
  const uid = uid_();
  if (!reason.trim()) throw new Error('A reason is required to void.');
  if (e.status === 'VOID') return;
  const hadBooks = !!(e.journalId || e.paymentJournalId);
  if (hadBooks && !perms.canManage) throw new Error('Only finance can void something already posted to the books.');
  const date = todayISO();
  if (hadBooks) await assertPeriodOpen(org.id, date);
  if (e.paymentJournalId) await reverseJournal(org.id, e.paymentJournalId);
  if (e.journalId) await reverseJournal(org.id, e.journalId);
  await updateDoc(doc(db, 'acctExpenses', e.id), { status: 'VOID', voidReason: reason.trim(), voidedBy: uid, voidedAt: Date.now() });
  audit(org.id, 'FIN_EXP_VOID', `${usd(e.amount)} ${e.description}`, { id: e.id, reason: reason.trim(), reversed: hadBooks });
  emitFinanceChanged();
}

/** Finance-side edit of coding before paying (category/fund/dept/vendor). */
export async function recodeExpense(org: Organization, e: AcctExpense, patch: Partial<Pick<AcctExpense, 'accountId' | 'fundId' | 'deptId' | 'vendorName' | 'vendorId' | 'dueDate' | 'invoiceNumber' | 'description'>>): Promise<void> {
  if (e.journalId) throw new Error('Already posted — void and re-enter to change the coding.');
  await updateDoc(doc(db, 'acctExpenses', e.id), strip({ ...patch, deptName: patch.deptId ? deptNameOf(org, patch.deptId) : undefined }));
  emitFinanceChanged();
}

// ── recurring bills ────────────────────────────────────────────────────────────
export function nextRecurringDate(date: string, f: RecurringBill['frequency']): string {
  const d = new Date(date + 'T00:00:00'); const day = d.getDate();
  if (f === 'WEEKLY') d.setDate(d.getDate() + 7);
  else { d.setDate(1); d.setMonth(d.getMonth() + (f === 'MONTHLY' ? 1 : f === 'QUARTERLY' ? 3 : 12)); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return todayISO(d);
}
export const dueRecurring = (org: Pick<Organization, 'financeSettings'>, today = todayISO()) => (org.financeSettings?.recurringBills || []).filter(r => r.active && r.nextDate <= today);

/** Auto-draft due recurring bills as APPROVED (the template itself was finance-approved). Deterministic ids ⇒ safe to run from any client. */
export async function draftRecurringBills(org: Organization): Promise<number> {
  const uid = uid_(); const today = todayISO();
  const fresh = (await fetchOrganization(org.id)) || org;
  const list = fresh.financeSettings?.recurringBills || []; let made = 0; let changed = false;
  const next: RecurringBill[] = [];
  for (const r of list) {
    let cur = r; let guard = 0;
    while (cur.active && cur.nextDate <= today && guard++ < 4) {
      const id = `rec_${org.id.replace(/[^A-Za-z0-9_-]/g, '_')}_${r.id}_${cur.nextDate}`;
      const ref = doc(db, 'acctExpenses', id);
      if (!(await getDoc(ref)).exists()) {
        const e: AcctExpense = strip({
          id, orgId: org.id, kind: 'BILL', vendorId: r.vendorId, vendorName: r.vendorName, description: r.description, date: cur.nextDate, dueDate: addDaysISO(cur.nextDate, r.dueInDays ?? 0),
          amount: r.amount, accountId: r.accountId, fundId: r.fundId, deptId: r.deptId, deptName: r.deptId ? deptNameOf(fresh, r.deptId) : undefined, recurringId: r.id,
          status: 'SUBMITTED', submittedBy: uid, submittedByName: 'Recurring bill', submittedAt: Date.now(), createdAt: Date.now(), approvals: [], requiredApprovals: 1,
        }) as AcctExpense;
        await setDoc(ref, e);
        await updateDoc(ref, { status: 'APPROVED', approvedBy: uid, approvedAt: Date.now(), approvals: [{ uid: 'recurring', name: 'Recurring schedule', at: Date.now() }] });
        made++;
      }
      cur = { ...cur, nextDate: nextRecurringDate(cur.nextDate, cur.frequency) }; changed = true;
    }
    next.push(cur);
  }
  if (changed) {
    await updateOrganization(org.id, { financeSettings: { ...(fresh.financeSettings || {}), recurringBills: next, recurringSweptAt: today } });
    audit(org.id, 'FIN_RECURRING', `${made} recurring bill(s) drafted`, { made });
  }
  if (made) emitFinanceChanged();
  return made;
}

// ── 1099-NEC tracking ──────────────────────────────────────────────────────────
/** 1099-NEC reporting threshold: $600 through TY2025; $2,000 for payments made from 2026. */
export const threshold1099 = (year: number) => (year >= 2026 ? 2000 : 600);
export interface Vendor1099Row { vendorId: string; name: string; taxId?: string; address: string; flagged: boolean; ytd: number; needsW9: boolean; over: boolean }
export function vendor1099(vendors: AcctVendor[], expenses: AcctExpense[], year: number): Vendor1099Row[] {
  return vendors.map(v => {
    // 1099-NEC excludes payments made by card/third-party network (those are on the processor's 1099-K).
    const ytd = r2(expenses.filter(e => e.status === 'PAID' && e.kind !== 'REIMBURSEMENT' && !e.isRequest && (e.vendorId === v.id || normName(e.vendorName) === normName(v.name)) && e.paymentMethod !== 'CARD' && e.paymentMethod !== 'ONLINE' && todayISO(new Date(e.paidAt || 0)).startsWith(String(year))).reduce((s, e) => s + e.amount, 0));
    const a = v.address || {};
    return { vendorId: v.id, name: v.name, taxId: v.taxId, address: [a.line1, a.city, a.region, a.postal].filter(Boolean).join(', '), flagged: !!v.is1099, ytd, needsW9: (!!v.is1099 || ytd >= threshold1099(year)) && !v.w9Url && !v.taxId, over: ytd >= threshold1099(year) };
  }).filter(r => r.flagged || r.ytd > 0).sort((a, b) => b.ytd - a.ytd);
}
export function nec1099Csv(rows: Vendor1099Row[], year: number): string {
  const q = (s: string | number | undefined) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['Recipient', 'TIN', 'Address', `Box 1 nonemployee compensation ${year}`, 'W-9 on file'].map(q).join(',')];
  rows.filter(r => r.flagged && r.over).forEach(r => lines.push([q(r.name), q(r.taxId), q(r.address), q(r.ytd.toFixed(2)), q(r.needsW9 ? 'NO' : 'yes')].join(',')));
  return lines.join('\n');
}
export const registerCsv = (rows: AcctExpense[]) => {
  const q = (s: string | number | undefined) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return [['Check #', 'Date paid', 'Payee', 'Memo', 'Amount'].map(q).join(','), ...rows.map(e => [q(e.checkNumber), q(todayISO(new Date(e.paidAt || 0))), q(e.vendorName || e.payee || e.submittedByName), q(e.description), q(e.amount.toFixed(2))].join(','))].join('\n');
};

// ── Money Inbox ────────────────────────────────────────────────────────────────
export type HubTab = 'home' | 'inbox' | 'spending' | 'vendors' | 'enter' | 'batches' | 'funds' | 'pledges' | 'statements' | 'reports' | 'reconcile' | 'settings' | 'audit' | 'setup' | 'books' | 'payouts';
export type SpendSub = 'mine' | 'approve' | 'pay' | 'register' | 'recurring' | 'submit';
export interface InboxItem {
  id: string;
  kind: 'APPROVE' | 'COUNTERSIGN' | 'PAY' | 'OVERDUE' | 'GIFTS' | 'PAYOUTS' | 'BANK' | 'BATCH' | 'VOIDS' | 'STATEMENTS' | 'CARE' | 'MINE_REJECTED' | 'MINE_OPEN' | 'MINE_APPROVED' | 'W9' | 'RECURRING' | 'SETUP';
  tone: 'action' | 'watch' | 'info';
  title: string; detail?: string; cta: string;
  tab?: HubTab; sub?: SpendSub;
  expense?: AcctExpense;           // inline approve/reject card
  count: number;                   // how many "to-dos" this represents (drives the badge)
  audience: 'me' | 'team';         // 'me' = personal status line (not counted as work when informational)
}
export interface InboxArgs { org: Organization; member: OrgMembership | null; perms: SpendingPerms; bundle: SpendingBundle; snap?: FinanceSnapshot | null; seen?: Set<string> }
export function buildInbox({ org, member, perms, bundle, snap, seen }: InboxArgs): InboxItem[] {
  const uid = auth.currentUser?.uid || ''; const out: InboxItem[] = []; const today = todayISO(); const week = addDaysISO(today, 7);
  const ex = bundle.expenses;
  // 1. approvals waiting on me
  if (perms.canApprove) {
    ex.filter(e => e.status === 'SUBMITTED' && readiness(org, e, ex) === 'PENDING' && canApproveExpense(org, member, e).ok)
      .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
      .forEach(e => out.push({ id: `ap_${e.id}`, kind: 'APPROVE', tone: 'action', title: `${e.submittedByName || 'Someone'} · ${usd(e.amount)}`, detail: `${SPEND_KIND_LABEL[kindOf(e)].label} — ${e.description}${e.deptName ? ` · ${e.deptName}` : ''}`, cta: 'Review', expense: e, tab: 'spending', sub: 'approve', count: 1, audience: 'me' }));
  }
  if (perms.canManage) {
    // 2. countersign
    ex.filter(e => readiness(org, e, ex) === 'NEEDS_SECOND' && !(e.approvals || []).some(a => a.uid === uid) && canApproveExpense(org, member, e).ok)
      .forEach(e => out.push({ id: `cs_${e.id}`, kind: 'COUNTERSIGN', tone: 'action', title: `Countersign ${usd(e.amount)}`, detail: `${e.description} · needs a second approval (over ${usd(spendingSettings(org).dualApprovalAbove || 0)})`, cta: 'Review', expense: e, tab: 'spending', sub: 'approve', count: 1, audience: 'me' }));
    // 3. money out
    const payable = ex.filter(e => isPayable(readiness(org, e, ex)) && !e.isRequest);
    const overdue = payable.filter(e => e.dueDate && e.dueDate < today); const soon = payable.filter(e => !(e.dueDate && e.dueDate < today) && (!e.dueDate || e.dueDate <= week));
    if (overdue.length) out.push({ id: 'pay_overdue', kind: 'OVERDUE', tone: 'action', title: `${overdue.length} overdue ${overdue.length === 1 ? 'bill' : 'bills'} · ${usd(overdue.reduce((s, e) => s + e.amount, 0))}`, detail: 'Approved and past due — pay them in one batch.', cta: 'Pay now', tab: 'spending', sub: 'pay', count: overdue.length, audience: 'team' });
    if (soon.length) out.push({ id: 'pay_soon', kind: 'PAY', tone: 'watch', title: `${soon.length} ready to pay · ${usd(soon.reduce((s, e) => s + e.amount, 0))}`, detail: 'Approved bills and reimbursements due this week.', cta: 'Open queue', tab: 'spending', sub: 'pay', count: soon.length, audience: 'team' });
    const dueRec = dueRecurring(org, today);
    if (dueRec.length) out.push({ id: 'rec_due', kind: 'RECURRING', tone: 'watch', title: `${dueRec.length} recurring ${dueRec.length === 1 ? 'bill is' : 'bills are'} due to draft`, detail: dueRec.slice(0, 3).map(r => r.vendorName).join(', '), cta: 'Draft them', tab: 'spending', sub: 'recurring', count: dueRec.length, audience: 'team' });
    const yr = new Date().getFullYear(); const w9 = vendor1099(bundle.vendors, ex, yr).filter(r => r.needsW9);
    if (w9.length) out.push({ id: 'w9', kind: 'W9', tone: 'watch', title: `${w9.length} vendor${w9.length === 1 ? '' : 's'} need a W-9`, detail: w9.slice(0, 3).map(r => r.name).join(', '), cta: 'Collect', tab: 'vendors', count: w9.length, audience: 'team' });
  }
  // 4. books & giving chores (read from the finance snapshot / books)
  if (perms.canManage || perms.canGiving) {
    if (bundle.payouts.length) out.push({ id: 'payouts', kind: 'PAYOUTS', tone: 'watch', title: `${bundle.payouts.length} Stripe payout${bundle.payouts.length === 1 ? '' : 's'} to reconcile`, detail: usd(bundle.payouts.reduce((s, p) => s + (p.net ?? p.amount), 0)) + ' waiting to be matched to the bank.', cta: 'Reconcile', tab: 'reconcile', count: bundle.payouts.length, audience: 'team' });
    if (bundle.bankTxns.length) out.push({ id: 'bank', kind: 'BANK', tone: 'watch', title: `${bundle.bankTxns.length} bank line${bundle.bankTxns.length === 1 ? '' : 's'} unmatched`, detail: 'Imported from your bank, not yet matched to anything.', cta: 'Match', tab: 'reconcile', count: bundle.bankTxns.length, audience: 'team' });
  }
  if (snap && perms.canGiving) {
    const open = snap.batches.filter(b => b.status === 'OPEN' || b.status === 'BALANCED');
    if (open.length) out.push({ id: 'batches', kind: 'BATCH', tone: 'watch', title: `${open.length} batch${open.length === 1 ? '' : 'es'} to balance or post`, detail: open.slice(0, 3).map(b => b.name).join(', '), cta: 'Open', tab: 'batches', count: open.length, audience: 'team' });
    const voids = new Set(snap.ledger.filter(r => r.voidRequest && r.status !== 'VOID' && r.voidRequest.by !== uid).map(r => r.splitGroupId || r.id)).size + snap.batches.filter(b => b.overrideRequest && b.overrideRequest.by !== uid).length;
    if (voids) out.push({ id: 'voids', kind: 'VOIDS', tone: 'action', title: `${voids} void${voids === 1 ? '' : 's'}/override${voids === 1 ? '' : 's'} need a second approver`, detail: 'Two-person integrity — you didn’t request these, so you can approve.', cta: 'Approve', tab: 'batches', count: voids, audience: 'team' });
    const unlinked = snap.ledger.filter(r => r.origin === 'ONLINE' && !r.personId && !r.anonymous && r.status !== 'VOID');
    if (unlinked.length) out.push({ id: 'gifts', kind: 'GIFTS', tone: 'info', title: `${unlinked.length} online gift${unlinked.length === 1 ? '' : 's'} not linked to a person`, detail: 'Link them so statements and thank-yous reach the right household.', cta: 'Link gifts', tab: 'enter', count: unlinked.length, audience: 'team' });
    const m = new Date().getMonth(); const py = new Date().getFullYear() - 1;
    if (m <= 2 && !snap.statementLogs.some(l => l.from.startsWith(String(py)))) out.push({ id: 'stmts', kind: 'STATEMENTS', tone: 'watch', title: `${py} giving statements aren’t sent yet`, detail: 'Givers need them for taxes — generate and send in a few clicks.', cta: 'Run statements', tab: 'statements', count: 1, audience: 'team' });
  }
  if (snap && (perms.canGiving || member?.roleKey === 'PASTOR' || member?.roleKey === 'SENIOR_PASTOR' || member?.roleKey === 'MINISTER')) {
    const care = snap.careFlags.filter(c => c.status === 'OPEN');
    if (care.length) out.push({ id: 'care', kind: 'CARE', tone: 'info', title: `${care.length} care follow-up${care.length === 1 ? '' : 's'}`, detail: 'People who may need a call or a thank-you (no amounts shown).', cta: 'Open', tab: 'home', count: care.length, audience: 'team' });
  }
  // 5. my own requests (everyone)
  const mine = ex.filter(e => e.submittedBy === uid && e.status !== 'VOID');
  mine.filter(e => e.status === 'REJECTED' && !seen?.has(`rj_${e.id}`)).forEach(e => out.push({ id: `rj_${e.id}`, kind: 'MINE_REJECTED', tone: 'action', title: `Needs changes · ${usd(e.amount)}`, detail: `${e.description} — ${e.rejectedReason || 'ask your approver'}`, cta: 'Fix & resubmit', expense: e, tab: 'spending', sub: 'mine', count: 1, audience: 'me' }));
  const open = mine.filter(e => e.status === 'SUBMITTED' || (e.status === 'APPROVED' && !e.isRequest));
  if (open.length) out.push({ id: 'mine_open', kind: 'MINE_OPEN', tone: 'info', title: `${open.length} of your requests in progress`, detail: open.slice(0, 3).map(e => `${usd(e.amount)} ${e.description} — ${statusLine(org, e, ex)}`).join(' · '), cta: 'Track', tab: 'spending', sub: 'mine', count: 0, audience: 'me' });
  mine.filter(e => (e.status === 'APPROVED' && e.isRequest) && !seen?.has(`ra_${e.id}`)).forEach(e => out.push({ id: `ra_${e.id}`, kind: 'MINE_APPROVED', tone: 'watch', title: `Approved — go buy it · ${usd(e.amount)}`, detail: `${e.description}. After you buy, snap the receipt and submit it as “Church card” or “Reimburse me”.`, cta: 'Submit receipt', tab: 'spending', sub: 'submit', expense: e, count: 1, audience: 'me' }));
  return out;
}
export function statusLine(org: Organization, e: AcctExpense, all: AcctExpense[] = []): string {
  const r = readiness(org, e, all);
  switch (r) {
    case 'PENDING': { const h = ministryOf(org, e.deptId)?.headUids?.length ? `${deptNameOf(org, e.deptId)} head` : 'a pastor or finance'; return `waiting on ${h}`; }
    case 'NEEDS_SECOND': return 'needs finance countersign';
    case 'READY': return e.kind === 'REIMBURSEMENT' ? 'approved — reimbursement queued' : 'approved — queued for payment';
    case 'READY_AUTO': return 'auto-approved — queued for payment';
    case 'REQUEST_APPROVED': return 'approved — you can buy it';
    case 'PAID': return e.paymentMethod === 'CHECK' && e.checkNumber ? `paid · check #${e.checkNumber}` : 'paid';
    case 'REJECTED': return `declined${e.rejectedReason ? ` — ${e.rejectedReason}` : ''}`;
    case 'VOID': return 'withdrawn';
    default: return 'draft';
  }
}
/** Work items that count toward the badge (personal info lines don't). */
export const inboxCount = (items: InboxItem[]) => items.reduce((s, i) => s + (i.kind === 'MINE_OPEN' ? 0 : i.count), 0);

// ── Finance home numbers ───────────────────────────────────────────────────────
export interface CashPosition { cash: number; ap: number; net: number; hasBooks: boolean }
export async function fetchCashPosition(org: Organization): Promise<CashPosition> {
  try {
    const [accts, js] = await Promise.all([listBy<AcctAccount>('acctAccounts', org.id), listBy<AcctJournal>('acctJournals', org.id)]);
    if (!accts.length) return { cash: 0, ap: 0, net: 0, hasBooks: false };
    const bal: Record<string, number> = {};
    js.forEach(j => j.lines.forEach(l => { bal[l.accountId] = (bal[l.accountId] || 0) + l.debit - l.credit; }));
    const cash = r2(accts.filter(a => a.type === 'ASSET' && (a.subtype === 'cash' || a.systemKey === 'CASH_OPERATING' || a.systemKey === 'STRIPE_CLEARING')).reduce((s, a) => s + (bal[a.id] || 0), 0));
    const ap = r2(-(bal[accounts_apId(accts)] || 0));
    return { cash, ap, net: r2(cash - ap), hasBooks: true };
  } catch { return { cash: 0, ap: 0, net: 0, hasBooks: false }; }
}
const accounts_apId = (a: AcctAccount[]) => a.find(x => x.systemKey === 'ACCOUNTS_PAYABLE')?.id || '';
export function monthInOut(org: Organization, snap: FinanceSnapshot | null | undefined, expenses: AcctExpense[], ref = new Date()) {
  const ym = todayISO(ref).slice(0, 7);
  const inn = r2((snap?.ledger || []).filter(r => r.status !== 'VOID' && r.date.startsWith(ym)).reduce((s, r) => s + r.amount, 0));
  const out = r2(expenses.filter(e => e.status === 'PAID' && !e.isRequest && todayISO(new Date(e.paidAt || 0)).startsWith(ym)).reduce((s, e) => s + e.amount, 0));
  return { in: inn, out, net: r2(inn - out) };
}
export function givingTrend(snap: FinanceSnapshot | null | undefined, months = 6, ref = new Date()): { label: string; total: number }[] {
  const out: { label: string; total: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1); const ym = todayISO(d).slice(0, 7);
    out.push({ label: d.toLocaleString('en-US', { month: 'short' }), total: r2((snap?.ledger || []).filter(r => r.status !== 'VOID' && r.date.startsWith(ym)).reduce((s, r) => s + r.amount, 0)) });
  }
  return out;
}

// ── Money setup guide state ────────────────────────────────────────────────────
export interface SetupStep { key: string; title: string; why: string; done: boolean; tab?: HubTab; manual?: boolean; minutes: number }
export function moneySetupSteps(org: Organization, bundle: SpendingBundle | null, teamRoleKeys: string[] = []): SetupStep[] {
  const flags = org.setupState?.moneySetup || {}; const s = org.financeSettings || {};
  return [
    { key: 'stripe', title: 'Connect Stripe for online giving', why: 'Cards and ACH land in your bank automatically — Plajah never holds your money.', done: !!org.stripeAccountId || !!flags.stripe, tab: 'settings', minutes: 3 },
    { key: 'funds', title: 'Name your funds', why: 'General, Missions, Building… so every gift is tracked to its purpose.', done: (org.givingFunds || []).length > 0 || !!flags.funds, tab: 'funds', minutes: 2 },
    { key: 'chart', title: 'Create your chart of accounts', why: 'A church-ready chart in one click — you can rename anything later.', done: (bundle?.accounts.length || 0) > 0 || !!flags.chart, manual: false, minutes: 1 },
    { key: 'bank', title: 'Add your bank account', why: 'Lets us match deposits, checks and Stripe payouts to the bank.', done: (bundle?.bankAccounts.length || 0) > 0 || !!flags.bank, minutes: 1 },
    { key: 'team', title: 'Invite your finance team', why: 'Bookkeeper, treasurer, or an outside accountant (read-only).', done: teamRoleKeys.some(k => ['BOOKKEEPER', 'ACCOUNTANT', 'TREASURER', 'FINANCE_DIRECTOR'].includes(k)) || !!flags.team, tab: 'settings', minutes: 2 },
    { key: 'limits', title: 'Set approval limits', why: 'Auto-approve small spend; require two approvals on big checks.', done: s.autoApproveUnder != null || s.dualApprovalAbove != null || !!flags.limits, tab: 'settings', minutes: 1 },
    { key: 'import', title: 'Bring your history over (optional)', why: 'Import people and giving from Servant Keeper or a spreadsheet.', done: !!flags.import, manual: true, tab: 'settings', minutes: 5 },
  ];
}
export async function markSetupStep(org: Organization, key: string, done = true): Promise<Organization> {
  const fresh = (await fetchOrganization(org.id)) || org;
  const setupState = { ...(fresh.setupState || {}), moneySetup: { ...(fresh.setupState?.moneySetup || {}), [key]: done } };
  await updateOrganization(org.id, { setupState });
  audit(org.id, 'FIN_SETUP', key, { done });
  return { ...fresh, setupState };
}
export async function dismissSetup(org: Organization, dismissed = true): Promise<Organization> {
  const fresh = (await fetchOrganization(org.id)) || org;
  const setupState = { ...(fresh.setupState || {}), moneySetupDismissed: dismissed };
  await updateOrganization(org.id, { setupState });
  return { ...fresh, setupState };
}
export async function saveSpendingSettings(org: Organization, patch: Pick<ChmsFinanceSettings, 'autoApproveUnder' | 'deptAutoApprove' | 'dualApprovalAbove'>): Promise<Organization> {
  const fresh = (await fetchOrganization(org.id)) || org;
  const financeSettings: ChmsFinanceSettings = { ...(fresh.financeSettings || {}), ...patch };
  (Object.keys(financeSettings) as (keyof ChmsFinanceSettings)[]).forEach(k => { if (financeSettings[k] === undefined) delete financeSettings[k]; });
  await updateOrganization(org.id, { financeSettings });
  audit(org.id, 'FIN_SETTINGS', 'approval limits', patch as any);
  return { ...fresh, financeSettings };
}
export async function saveRecurringBills(org: Organization, list: RecurringBill[]): Promise<Organization> {
  const fresh = (await fetchOrganization(org.id)) || org;
  const financeSettings = { ...(fresh.financeSettings || {}), recurringBills: list };
  await updateOrganization(org.id, { financeSettings });
  audit(org.id, 'FIN_RECURRING', `${list.length} recurring bill(s)`, {});
  return { ...fresh, financeSettings };
}
