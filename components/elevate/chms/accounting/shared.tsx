// Shared primitives for the Elevate Books (accounting) hub. Styling mirrors components/elevate/chms/finance/*.
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, HelpCircle, Loader2, Printer, XCircle } from 'lucide-react';
import type { ChmsBatch, ChmsContribution, Organization } from '../../../../types';
import type { Books } from '../../../../services/acctService';
import { auditExport } from '../../../../services/acctService';
import { money, downloadText } from '../../../../services/chmsFinanceReports';
import { rptToCsv, rptToHtml, type BookCtx, type Rpt, type FixTarget } from '../../../../services/acctReports';
import { card, fieldSm, btnGhost, label as labelCls } from '../finance/shared';

export { card, field, fieldSm, btnPrimary, btnGhost, label, heading, Stat, Pill, Empty, Busy, printHtml } from '../finance/shared';

// ── Context ────────────────────────────────────────────────────────────────────
export type BooksTab = 'overview' | 'journal' | 'chart' | 'bank' | 'reports' | 'budgets' | 'close' | 'setup';
export interface BooksApi {
  org: Organization; books: Books; ctx: BookCtx; uid: string;
  facts: { contributions: ChmsContribution[]; batches: ChmsBatch[]; restricted: boolean };
  /** MANAGE_ACCOUNTING — false means read-only (trustees, external accountant). */
  canManage: boolean;
  /** Simple view hides debits/credits and speaks in "money in / money out". */
  simple: boolean;
  startMonth: number;
  reload: () => Promise<void>;
  /** Update the org in the host after saving org-level settings (funds, fiscal year). */
  setOrg: (o: Organization) => void;
  toast: (msg: string, tone?: 'ok' | 'bad') => void;
  go: (tab: BooksTab) => void;
  /** Jump to a Finance Hub tab (batches, reconcile, spending…) when the host supports it. */
  goFix: (t: FixTarget) => void;
}
const Ctx = createContext<BooksApi | null>(null);
export const BooksProvider = Ctx.Provider;
export const useBooks = (): BooksApi => { const c = useContext(Ctx); if (!c) throw new Error('useBooks outside provider'); return c; };

/** Pro-vs-simple wording: t('Debit', 'Money in') */
export const useWords = () => { const { simple } = useBooks(); return (pro: string, easy: string) => (simple ? easy : pro); };

// ── Toasts ─────────────────────────────────────────────────────────────────────
export interface ToastItem { id: number; msg: string; tone: 'ok' | 'bad' }
export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]); const n = useRef(0);
  const toast = useCallback((msg: string, tone: 'ok' | 'bad' = 'ok') => { const id = ++n.current; setItems(x => [...x, { id, msg, tone }]); setTimeout(() => setItems(x => x.filter(t => t.id !== id)), tone === 'bad' ? 7000 : 3500); }, []);
  return { items, toast };
}
export const ToastStack: React.FC<{ items: ToastItem[] }> = ({ items }) => (
  <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 items-center pointer-events-none" role="status" aria-live="polite">
    {items.map(t => (
      <div key={t.id} className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold border shadow-xl backdrop-blur ${t.tone === 'bad' ? 'bg-red-950/90 border-red-500/40 text-red-200' : 'bg-zinc-900/95 border-green-500/30 text-white'}`}>
        {t.tone === 'bad' ? <XCircle size={14} className="text-red-400" /> : <CheckCircle2 size={14} className="text-green-400" />}{t.msg}
      </div>
    ))}
  </div>
);

/** Run an async action with a busy flag; success → toast, failure → red toast (never an alert()). */
export function useDo() {
  const { toast } = useBooks(); const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); return r; }
    catch (e: any) { toast(e?.message || 'Something went wrong.', 'bad'); }
    finally { setBusy(false); }
    return undefined;
  }, [toast]);
  return { busy, run };
}

// ── Inline help ────────────────────────────────────────────────────────────────
export const GLOSSARY: Record<string, string> = {
  debit: 'A debit increases assets and expenses, and decreases liabilities, net assets and revenue. Every entry has equal debits and credits.',
  credit: 'A credit increases liabilities, net assets and revenue, and decreases assets and expenses.',
  journal: 'A journal entry is one balanced record of money moving: where it came from and where it went. Entries are never deleted — you reverse them.',
  reversal: 'A reversal posts the exact opposite of an entry so the books net to zero. The original stays visible for the audit trail.',
  fund: 'A fund tracks money by purpose (General, Missions, Building). Donor-restricted funds can only be spent for their stated purpose.',
  restricted: 'Donor-restricted money must be used for the purpose the giver named. It is reported separately from "without donor restrictions".',
  clearing: 'A holding account for money in transit — online gifts waiting on a Stripe payout, or cash/checks waiting to be deposited.',
  reconcile: 'Reconciling confirms your books match the bank statement. Match each bank line to an entry until the difference is $0.00.',
  period: 'A period is one month. Closing it locks it so nobody changes last month\'s numbers after you have reported them.',
  functional: 'Churches that file a Form 990 split expenses into program services, management & general, and fundraising.',
  netassets: 'Net assets are what the church owns minus what it owes — split into with and without donor restrictions.',
  budget: 'Variance is budget minus actual for expenses (positive = under budget) and actual minus budget for income.',
};
export const Help: React.FC<{ term: keyof typeof GLOSSARY | string; children?: React.ReactNode }> = ({ term, children }) => {
  const [open, setOpen] = useState(false); const text = GLOSSARY[term];
  return (
    <span className="inline-flex flex-col align-baseline">
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-white/50 hover:text-small-orange" aria-expanded={open} title="What does this mean?">
        {children}<HelpCircle size={11} />
      </button>
      {open && text && <span className="block mt-1 max-w-xs text-[10px] font-normal normal-case tracking-normal text-white/60 bg-white/[0.04] border border-white/10 rounded-xl p-2">{text}</span>}
    </span>
  );
};

/** A friendly "what to do next" empty state. Never a dead end. */
export const NextStep: React.FC<{ title: string; body: string; action?: { label: string; onClick: () => void } }> = ({ title, body, action }) => (
  <div className={`${card} p-8 text-center`}>
    <p className="text-sm font-black text-white">{title}</p>
    <p className="text-xs text-white/50 mt-1 max-w-md mx-auto">{body}</p>
    {action && <button onClick={action.onClick} className="mt-4 px-5 py-2.5 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:brightness-110">{action.label}</button>}
  </div>
);

export const Loading: React.FC = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={22} /></div>;
export const ReadOnlyNote: React.FC = () => <p className="text-[10px] text-white/40 mb-3">View only — you can read and export everything here. Ask a finance admin if you need to make changes.</p>;

// ── Report renderer (screen + CSV + print) ─────────────────────────────────────
const dot = { good: 'bg-green-400', warn: 'bg-amber-400', bad: 'bg-red-400' } as const;
export const RptView: React.FC<{ rpt: Rpt; onDrill?: (accountId: string) => void; maxRows?: number; org?: Organization }> = ({ rpt, onDrill, maxRows = 800, org: orgProp }) => {
  const api = useContext(Ctx); const org = (orgProp || api?.org)!;
  const [busy, setBusy] = useState(false);
  const exportCsv = () => { downloadText(`${rpt.id}-${new Date().toISOString().slice(0, 10)}.csv`, rptToCsv(rpt)); auditExport(org.id, rpt.title, { format: 'csv' }); };
  const print = () => {
    setBusy(true); auditExport(org.id, rpt.title, { format: 'print' });
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); setBusy(false); return; }
    w.document.open(); w.document.write(rptToHtml(rpt, org.legalName || org.name)); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch { /* manual */ } setBusy(false); }, 350);
  };
  const fmt = (c: any) => typeof c === 'number' ? <span className={c < 0 ? 'text-red-400' : ''}>{money(c)}</span> : (c ?? '');
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div><h3 className="text-sm font-black text-white">{rpt.title}</h3><p className="text-[10px] text-white/40 mt-0.5">{rpt.subtitle}</p></div>
        <div className="flex gap-2"><button onClick={exportCsv} className={btnGhost}><Download size={12} /> CSV</button><button onClick={print} disabled={busy} className={btnGhost}><Printer size={12} /> Print / PDF</button></div>
      </div>
      {rpt.rows.length === 0 ? <p className="text-xs text-white/40 py-6 text-center">Nothing to show for this selection yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr><th className={`${labelCls} text-left py-2 px-2`}>{rpt.labelHeader}</th>{rpt.columns.map(c => <th key={c} className={`${labelCls} text-right py-2 px-2 whitespace-nowrap`}>{c}</th>)}</tr></thead>
            <tbody>
              {rpt.rows.slice(0, maxRows).map((r, i) => r.kind === 'section' ? (
                <tr key={i}><td colSpan={rpt.columns.length + 1} className="pt-4 pb-1 px-2 text-[10px] font-black uppercase tracking-widest text-small-orange">{r.label}</td></tr>
              ) : (
                <tr key={i} className={`border-t ${r.kind === 'total' ? 'border-white/30 bg-white/[0.04] font-black text-white' : r.kind === 'subtotal' ? 'border-white/20 font-bold text-white' : r.kind === 'note' ? 'border-white/5 italic text-white/40' : 'border-white/5 text-white/80'}`}>
                  <td className="py-1.5 px-2" style={{ paddingLeft: 8 + (r.level || 0) * 12 }}>
                    {r.flag && <span className={`inline-block w-2 h-2 rounded-full mr-2 ${dot[r.flag]}`} />}
                    {r.accountId && onDrill ? <button onClick={() => onDrill(r.accountId!)} className="hover:text-small-orange underline-offset-2 hover:underline text-left">{r.label}</button> : r.label}
                  </td>
                  {(r.v || rpt.columns.map(() => null)).map((c, j) => <td key={j} className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{fmt(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {rpt.rows.length > maxRows && <p className="text-[10px] text-white/30 mt-2">Showing the first {maxRows} rows — export CSV for everything.</p>}
        </div>
      )}
      {rpt.notes?.map((n, i) => <p key={i} className="text-[10px] text-white/40 mt-2">{n}</p>)}
    </div>
  );
};

// ── Tiny helpers ───────────────────────────────────────────────────────────────
export const useBookCtx = (org: Organization, books: Books | null): BookCtx | null => useMemo(() => books ? ({
  accounts: books.accounts, journals: books.journals, funds: org.givingFunds || [], ministries: (org.ministries || []).map(m => ({ id: m.id, name: m.name })),
}) : null, [books, org.givingFunds, org.ministries]);

export const AccountSelect: React.FC<{ value: string; onChange: (id: string) => void; types?: string[]; accounts: Books['accounts']; className?: string; placeholder?: string; autoFocus?: boolean }> = ({ value, onChange, types, accounts, className = '', placeholder = 'Choose account…', autoFocus }) => (
  <select value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus} className={`${fieldSm} ${className}`}>
    <option value="">{placeholder}</option>
    {[...accounts].filter(a => a.active && (!types || types.includes(a.type))).sort((a, b) => a.code.localeCompare(b.code)).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
  </select>
);
export const monthOptions = (from: number, count: number): string[] => { const d = new Date(); const out: string[] = []; for (let i = 0; i < count; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); } void from; return out; };
