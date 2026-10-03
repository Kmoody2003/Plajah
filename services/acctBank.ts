// acctBank — PURE bank-feed logic for Elevate Books: CSV statement parsing (auto-detects columns),
// de-duplication, the auto-match engine (deposits / Stripe payouts / checks) with confidence scores,
// and categorisation memory. No Firebase, no React — unit-testable.

import type { AcctAccount, AcctBankAccount, AcctBankTxn, AcctExpense, AcctJournal, ChmsPayout } from '../types';
import { cents, dollars } from './acctPosting';

// ── CSV parsing ────────────────────────────────────────────────────────────────
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const delim = (['\t', ';', ','] as const).map(d => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows.map(r => r.map(c => c.trim()));
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
export function parseDate(s: string, dayFirst = false): string | null {
  const v = s.trim().replace(/\s+\d{1,2}:\d{2}.*$/, ''); let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(v))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(v))) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return dayFirst ? iso(y, +m[2], +m[1]) : iso(y, +m[1], +m[2]); }
  if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ,]+(\d{2,4})$/.exec(v))) { const mo = MON[m[2].toLowerCase()]; const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return mo ? iso(y, mo, +m[1]) : null; }
  if ((m = /^([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}),? (\d{4})$/.exec(v))) { const mo = MON[m[1].toLowerCase()]; return mo ? iso(+m[3], mo, +m[2]) : null; }
  return null;
}
export function parseAmount(s: string): number | null {
  let v = (s || '').trim(); if (!v) return null;
  let neg = false;
  if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1); }
  if (/-$/.test(v)) { neg = true; v = v.slice(0, -1); }
  if (/^-/.test(v)) { neg = true; v = v.slice(1); }
  if (/\bCR\b/i.test(v)) v = v.replace(/\bCR\b/i, ''); if (/\bDR\b/i.test(v)) { neg = true; v = v.replace(/\bDR\b/i, ''); }
  v = v.replace(/[$€£,\s]/g, ''); if (!/^\d*\.?\d+$/.test(v)) return null;
  const n = Math.round(parseFloat(v) * 100) / 100; return neg ? -n : n;
}

export interface ColumnMap { hasHeader: boolean; date: number; desc: number; amount: number; debit: number; credit: number; externalId: number; dayFirst: boolean }
export function detectColumns(rows: string[][]): ColumnMap {
  const head = rows[0] || []; const sample = rows.slice(1, 40);
  const idx = (re: RegExp, skip: number[] = []) => head.findIndex((h, i) => re.test(h) && !skip.includes(i));
  let hasHeader = head.some(h => /[A-Za-z]{3,}/.test(h)) && !head.some(h => parseDate(h) && /\d/.test(h) && /[-/]/.test(h));
  const body = hasHeader ? sample : rows.slice(0, 40);
  const cols = Math.max(...rows.slice(0, 40).map(r => r.length), 0);
  const stat = (i: number) => { const vals = body.map(r => r[i] || '').filter(Boolean); return { dates: vals.filter(v => parseDate(v)).length, nums: vals.filter(v => parseAmount(v) !== null).length, n: vals.length }; };
  let date = hasHeader ? idx(/^(posted?|post(ing)? date|transaction date|trans(action)? date|date)\b|date/i) : -1;
  let debit = hasHeader ? idx(/debit|withdraw|paid out|money out|\bout\b/i) : -1;
  let credit = hasHeader ? idx(/credit|deposit|paid in|money in|\bin\b/i, [debit]) : -1;
  let amount = hasHeader ? idx(/^(amount|amt|transaction amount|value)\b|amount/i, [debit, credit]) : -1;
  let desc = hasHeader ? idx(/desc|memo|payee|narrat|detail|name|particulars|merchant/i) : -1;
  let externalId = hasHeader ? idx(/fitid|transaction id|trans(action)? ?id|reference|ref\b|check ?(no|num|#)|serial/i, [desc]) : -1;
  if (date < 0) { let best = -1, bs = 0; for (let i = 0; i < cols; i++) { const s = stat(i); if (s.n && s.dates / s.n > 0.6 && s.dates > bs) { best = i; bs = s.dates; } } date = best; }
  if (amount < 0 && debit < 0 && credit < 0) { let best = -1, bs = 0; for (let i = 0; i < cols; i++) { if (i === date) continue; const s = stat(i); if (s.n && s.nums / s.n > 0.7 && s.nums > bs) { best = i; bs = s.nums; } } amount = best; }
  if (desc < 0) { let best = -1, bl = 0; for (let i = 0; i < cols; i++) { if ([date, amount, debit, credit].includes(i)) continue; const l = body.reduce((t, r) => t + (r[i] || '').length, 0); if (l > bl) { best = i; bl = l; } } desc = best; }
  // d/m/y vs m/d/y: if any first part > 12 it must be day-first
  const dv = body.map(r => r[date] || '').filter(Boolean);
  const dayFirst = dv.some(v => { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/.exec(v); return !!m && +m[1] > 12; });
  return { hasHeader, date, desc, amount, debit, credit, externalId, dayFirst };
}
export interface BankLineDraft { date: string; amount: number; description: string; externalId?: string; key: string }
export function toBankLines(rows: string[][], map: ColumnMap, flipSign = false): { lines: BankLineDraft[]; skipped: number } {
  const body = map.hasHeader ? rows.slice(1) : rows; const lines: BankLineDraft[] = []; let skipped = 0;
  const seen = new Map<string, number>();
  for (const r of body) {
    const date = map.date >= 0 ? parseDate(r[map.date] || '', map.dayFirst) : null;
    let amt: number | null = null;
    if (map.amount >= 0) amt = parseAmount(r[map.amount] || '');
    if (amt === null && (map.debit >= 0 || map.credit >= 0)) {
      const d = map.debit >= 0 ? parseAmount(r[map.debit] || '') : null; const c = map.credit >= 0 ? parseAmount(r[map.credit] || '') : null;
      if (d !== null || c !== null) amt = Math.round(((c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0)) * 100) / 100;
    }
    if (!date || amt === null || amt === 0) { skipped++; continue; }
    if (flipSign) amt = -amt;
    const description = (map.desc >= 0 ? r[map.desc] : '').replace(/\s+/g, ' ').trim() || '(no description)';
    const externalId = map.externalId >= 0 && r[map.externalId] ? r[map.externalId] : undefined;
    const base = externalId ? `x|${externalId}` : `${date}|${amt.toFixed(2)}|${normDesc(description)}`;
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    lines.push({ date, amount: amt, description, externalId, key: `${base}#${n}` });
  }
  return { lines, skipped };
}
/** Small deterministic hash → doc id suffix so re-importing the same statement is a no-op. */
export function hashKey(s: string): string { let h1 = 5381, h2 = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; } return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)); }
export const bankTxnDocId = (orgId: string, bankId: string, key: string) => `bt_${orgId.replace(/[^A-Za-z0-9_-]/g, '_')}_${bankId.replace(/[^A-Za-z0-9_-]/g, '_')}_${hashKey(key)}`;

// ── Auto-match engine ──────────────────────────────────────────────────────────
export interface MatchCandidate {
  txnId: string; kind: 'JOURNAL' | 'PAYOUT'; journalId?: string; payoutId?: string; payoutDocId?: string;
  label: string; amount: number; date: string; confidence: number; reasons: string[];
}
export const HIGH_CONFIDENCE = 0.85;
const dayDiff = (a: string, b: string) => Math.abs(Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000));
export function checkNumberOf(desc: string): string | null {
  const m = /(?:check|chk|ck|cheque)\s*(?:no\.?|number|#)?\s*#?\s*(\d{3,8})/i.exec(desc) || /#\s*(\d{3,8})\b/.exec(desc);
  return m ? m[1] : null;
}
interface BookItem { id: string; kind: 'JOURNAL' | 'PAYOUT'; amount: number; date: string; label: string; journalId?: string; payoutId?: string; payoutDocId?: string; checkNo?: string }

export function autoMatch(txns: AcctBankTxn[], bank: AcctBankAccount, journals: AcctJournal[], payouts: ChmsPayout[], expenses: AcctExpense[], allTxns: AcctBankTxn[] = txns): MatchCandidate[] {
  const pool = txns.filter(t => t.status === 'UNMATCHED' && t.bankAccountId === bank.id);
  const taken = new Set(allTxns.filter(t => t.status === 'MATCHED' && t.matchedJournalId).map(t => t.matchedJournalId!));
  const takenPayout = new Set(allTxns.filter(t => t.status === 'MATCHED' && t.matchedPayoutId).map(t => t.matchedPayoutId!));
  const payoutByStripe = new Map(payouts.map(p => [p.stripePayoutId, p]));
  const checkByJournal = new Map<string, string>();
  expenses.forEach(e => { if (e.checkNumber) { if (e.paymentJournalId) checkByJournal.set(e.paymentJournalId, e.checkNumber); if (e.journalId) checkByJournal.set(e.journalId, e.checkNumber); } });
  const items: BookItem[] = [];
  for (const j of journals) {
    if (j.status === 'REVERSED' || j.reversalOf || taken.has(j.id)) continue;
    const net = j.lines.filter(l => l.accountId === bank.accountId).reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0);
    if (!net) continue;
    const po = j.source.kind === 'PAYOUT' && j.source.id ? payoutByStripe.get(j.source.id) : undefined;
    if (po && takenPayout.has(po.id)) continue;
    items.push({ id: `J:${j.id}`, kind: 'JOURNAL', amount: dollars(net), date: j.date, label: j.memo, journalId: j.id, payoutId: po?.stripePayoutId, payoutDocId: po?.id, checkNo: checkByJournal.get(j.id) });
  }
  const journaledPayouts = new Set(items.map(i => i.payoutDocId).filter(Boolean) as string[]);
  for (const p of payouts) {
    if (p.reconciled || p.bankTxnId || takenPayout.has(p.id) || journaledPayouts.has(p.id) || (p.status !== 'paid' && p.status !== 'in_transit')) continue;
    items.push({ id: `P:${p.id}`, kind: 'PAYOUT', amount: p.amount, date: p.arrivalDate, label: `Stripe payout ${p.stripePayoutId}`, payoutId: p.stripePayoutId, payoutDocId: p.id });
  }
  type Pair = { t: AcctBankTxn; it: BookItem; score: number; reasons: string[] };
  const pairs: Pair[] = [];
  for (const t of pool) {
    const chk = checkNumberOf(t.description);
    for (const it of items) {
      if (cents(it.amount) !== cents(t.amount)) continue;
      const dd = dayDiff(t.date, it.date); const limit = it.kind === 'PAYOUT' ? 7 : 14; if (dd > limit) continue;
      const reasons = ['Exact amount']; let s = dd === 0 ? 0.95 : dd <= 1 ? 0.9 : dd <= 3 ? 0.85 : dd <= 7 ? 0.7 : 0.6;
      reasons.push(dd === 0 ? 'same day' : `${dd} day${dd === 1 ? '' : 's'} apart`);
      if (chk && it.checkNo && chk === it.checkNo) { s = Math.min(0.99, s + 0.1); reasons.push(`check #${chk}`); }
      if (it.kind === 'PAYOUT' || it.payoutId) { s = Math.min(0.99, s + 0.04); reasons.push('Stripe payout'); }
      pairs.push({ t, it, score: s, reasons });
    }
  }
  // Ambiguity penalty: several equally good book items (or txns) for the same amount.
  const perTxn = new Map<string, Pair[]>(); const perItem = new Map<string, Pair[]>();
  pairs.forEach(p => { (perTxn.get(p.t.id) || perTxn.set(p.t.id, []).get(p.t.id)!).push(p); (perItem.get(p.it.id) || perItem.set(p.it.id, []).get(p.it.id)!).push(p); });
  const orig = new Map(pairs.map(p => [p, p.score] as const));
  pairs.forEach(p => { const rivals = [...(perTxn.get(p.t.id) || []), ...(perItem.get(p.it.id) || [])].filter(q => q !== p && Math.abs(orig.get(q)! - orig.get(p)!) < 0.06); if (rivals.length) { p.score = Math.max(0.3, orig.get(p)! - 0.2); p.reasons.push('several possible matches — please confirm'); } });
  pairs.sort((a, b) => b.score - a.score);
  const usedT = new Set<string>(), usedI = new Set<string>(); const out: MatchCandidate[] = [];
  for (const p of pairs) {
    if (usedT.has(p.t.id) || usedI.has(p.it.id)) continue; usedT.add(p.t.id); usedI.add(p.it.id);
    out.push({ txnId: p.t.id, kind: p.it.kind, journalId: p.it.journalId, payoutId: p.it.payoutId, payoutDocId: p.it.payoutDocId, label: p.it.label, amount: p.it.amount, date: p.it.date, confidence: Math.round(p.score * 100) / 100, reasons: p.reasons });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

// ── Categorisation memory + rules ──────────────────────────────────────────────
export function normDesc(s: string): string {
  return s.toLowerCase().replace(/\b(pos|debit|purchase|ach|pmt|payment|ref|card|visa|check ?card|online|web|id|xx+\d*|trace)\b/g, ' ').replace(/[0-9#*]+/g, ' ').replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export interface CategoryGuess { accountId: string; fundId?: string; deptId?: string; source: 'memory' | 'rule' | 'aria'; confidence: number; note?: string }
type Mem = Map<string, { accountId: string; fundId?: string; deptId?: string; n: number }>;
/** Learn from bank lines you already turned into entries: description → account/fund/dept. */
export function buildCategoryMemory(txns: AcctBankTxn[], journals: AcctJournal[], bankGlIds: Set<string>): Mem {
  const mem: Mem = new Map(); const byId = new Map(journals.map(j => [j.id, j]));
  for (const t of txns) {
    if (t.status !== 'MATCHED' || !t.matchedJournalId) continue;
    const j = byId.get(t.matchedJournalId); if (!j || j.source.kind !== 'BANK' || j.source.id !== t.id) continue;
    const counter = j.lines.find(l => !bankGlIds.has(l.accountId)); if (!counter) continue;
    const k = normDesc(t.description); if (!k) continue;
    const e = mem.get(k); mem.set(k, { accountId: counter.accountId, fundId: counter.fundId, deptId: counter.deptId, n: (e?.n || 0) + 1 });
  }
  return mem;
}
const RULES: [RegExp, string, boolean | null][] = [
  [/payroll|gusto|adp|paychex|salary|wages/i, '5000', false], [/irs|eftps|payroll tax|941/i, '5020', false],
  [/electric|energy|gas co|water|sewer|utility|comcast|xfinity|spectrum|at&t|verizon|t-mobile|waste/i, '5500', false],
  [/insurance|church mutual|guidestone|allstate|state farm/i, '5600', false], [/repair|plumb|hvac|roof|lawn|janitor|cleaning|lowe|home depot|handyman/i, '5510', false],
  [/staples|office depot|amazon|usps|postage|paper|printing/i, '5700', false], [/spotify|apple|google|zoom|adobe|microsoft|subsplash|planning center|software|hosting|domain|vimeo|youtube/i, '5400', false],
  [/cpa|attorney|legal|accounting|audit|bookkeep/i, '5800', false], [/mission|benevolence|relief|food pantry|compassion/i, '5200', false],
  [/ccli|worship|guitar|music|sheet|instrument|piano/i, '5300', false],
  [/stripe fee|merchant fee|processing fee/i, '5900', false],
  [/rent|facility use|rental/i, '4200', true], [/interest|dividend/i, '4900', true], [/donation|tithe|offering|mobile deposit|deposit/i, '4000', true],
];
export function suggestCategory(desc: string, amount: number, mem: Mem, accounts: AcctAccount[]): CategoryGuess | null {
  const key = normDesc(desc); const byCode = new Map(accounts.map(a => [a.code, a]));
  const hit = mem.get(key);
  if (hit && accounts.some(a => a.id === hit.accountId)) return { accountId: hit.accountId, fundId: hit.fundId, deptId: hit.deptId, source: 'memory', confidence: Math.min(0.97, 0.85 + hit.n * 0.03), note: `Same as ${hit.n} earlier line${hit.n === 1 ? '' : 's'}` };
  if (key) {
    const toks = new Set(key.split(' ').filter(w => w.length > 2)); let best: { v: NonNullable<ReturnType<Mem['get']>>; s: number } | null = null;
    for (const [k, v] of mem) { const kt = new Set(k.split(' ').filter(w => w.length > 2)); if (!kt.size || !toks.size) continue; const inter = [...toks].filter(w => kt.has(w)).length; const s = inter / (toks.size + kt.size - inter); if (s >= 0.5 && (!best || s > best.s)) best = { v, s }; }
    if (best && accounts.some(a => a.id === best!.v.accountId)) return { accountId: best.v.accountId, fundId: best.v.fundId, deptId: best.v.deptId, source: 'memory', confidence: 0.7, note: 'Similar to an earlier line' };
  }
  for (const [re, code, income] of RULES) {
    if (!re.test(desc)) continue; if (income !== null && income !== amount > 0) continue;
    const a = byCode.get(code); if (a) return { accountId: a.id, source: 'rule', confidence: 0.55, note: 'Matched a keyword' };
  }
  return null;
}
