// AccountingHub — the Elevate Books: double-entry, fund-aware accounting made friendly for church finance
// teams. MANAGE_ACCOUNTING writes; VIEW_ACCOUNTING (trustees, external CPA) is read-only. Department heads
// get a budget-only view. Everything posts through services/acctService.ts (idempotent, period-locked, audited).
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, BookOpen, Calculator, CalendarCheck, Landmark, ListTree, Loader2, PiggyBank, RefreshCw, Settings as Cog, ScrollText } from 'lucide-react';
import type { Organization, OrgMembership } from '../../../../types';
import { elevateCan } from '../../../../services/elevateRoles';
import { auth } from '../../../../services/firebase';
import { ensureChart, loadBooks, loadGivingFacts, debouncedBackfill, type Books } from '../../../../services/acctService';
import { settingsOf } from '../../../../services/chmsFinance';
import type { FixTarget } from '../../../../services/acctReports';
import { BooksProvider, ToastStack, useBookCtx, useToasts, Loading, type BooksApi, type BooksTab } from './shared';

const OverviewTab = lazy(() => import('./OverviewTab'));
const JournalTab = lazy(() => import('./JournalTab'));
const ChartTab = lazy(() => import('./ChartTab'));
const BankTab = lazy(() => import('./BankTab'));
const ReportsTab = lazy(() => import('./ReportsTab'));
const BudgetsTab = lazy(() => import('./BudgetsTab'));
const CloseTab = lazy(() => import('./CloseTab'));
const SetupTab = lazy(() => import('./SetupTab'));
const DeptBudgetView = lazy(() => import('./DeptBudgetView'));

export interface AccountingHubProps {
  org: Organization;
  myMembership: OrgMembership | null;
  onClose: () => void;
  /** Optional: jump to a Finance Hub tab (e.g. 'batches', 'reconcile') from a fix-it link. */
  onOpenFinanceTab?: (key: string) => void;
  onOrgChange?: (o: Organization) => void;
}

const FINANCE_TAB: Record<string, string> = { 'finance:batches': 'batches', 'finance:reconcile': 'reconcile', 'finance:spending': 'spending' };

const AccountingHub: React.FC<AccountingHubProps> = ({ org: initialOrg, myMembership, onClose, onOpenFinanceTab, onOrgChange }) => {
  const [org, setOrgState] = useState<Organization>(initialOrg);
  const setOrg = useCallback((o: Organization) => { setOrgState(o); onOrgChange?.(o); }, [onOrgChange]);
  const uid = auth.currentUser?.uid || '';
  const canManage = elevateCan(myMembership, org, 'MANAGE_ACCOUNTING');
  const canView = canManage || elevateCan(myMembership, org, 'VIEW_ACCOUNTING');
  const isDeptHead = (org.ministries || []).some(m => (m.headUids || []).includes(uid));
  const [books, setBooks] = useState<Books | null>(null);
  const [facts, setFacts] = useState<BooksApi['facts']>({ contributions: [], batches: [], restricted: false });
  const [tab, setTab] = useState<BooksTab>('overview');
  const [loading, setLoading] = useState(true);
  const [simple, setSimple] = useState<boolean>(() => { try { const v = localStorage.getItem(`books_simple_${org.id}`); return v === null ? true : v === '1'; } catch { return true; } });
  const { items, toast } = useToasts();
  const startMonth = settingsOf(org).fiscalYearStartMonth || 1;

  const reload = useCallback(async () => {
    setLoading(true);
    try { const [b, f] = await Promise.all([loadBooks(org.id), loadGivingFacts(org.id)]); setBooks(b); setFacts(f); }
    finally { setLoading(false); }
  }, [org.id]);

  // On open: seed the chart (idempotent) and catch up any gifts without journals, then load the snapshot.
  useEffect(() => {
    if (!canView) return;
    let off = false;
    (async () => {
      if (canManage) {
        try {
          await ensureChart(org.id);
          const r = await debouncedBackfill(org.id);
          if (r && (r.posted || r.reversed) && !off) toast(`Caught up the books: ${r.posted} gift/deposit entr${r.posted === 1 ? 'y' : 'ies'} posted${r.reversed ? `, ${r.reversed} reversed` : ''}.`);
          if (r?.errors.length && !off) toast(r.errors[0], 'bad');
        } catch (e: any) { if (!off) toast(`Could not prepare the books: ${e?.message || 'permission denied'}`, 'bad'); }
      }
      if (!off) await reload();
    })();
    return () => { off = true; };
  }, [org.id, canView, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  // First run → straight into the setup wizard.
  const [didRoute, setDidRoute] = useState(false);
  useEffect(() => {
    if (!books || didRoute) return; setDidRoute(true);
    let skipped = false; try { skipped = localStorage.getItem(`books_setup_skip_${org.id}`) === '1'; } catch { /* */ }
    if (canManage && !skipped && books.bankAccounts.length === 0 && books.journals.length === 0) setTab('setup');
  }, [books, didRoute, canManage, org.id]);

  const toggleSimple = (v: boolean) => { setSimple(v); try { localStorage.setItem(`books_simple_${org.id}`, v ? '1' : '0'); } catch { /* */ } };
  const ctx = useBookCtx(org, books);

  const tabs = useMemo(() => ([
    { key: 'overview' as const, label: 'Overview', icon: BarChart3, show: true },
    { key: 'journal' as const, label: simple ? 'Money activity' : 'Journal', icon: ScrollText, show: true },
    { key: 'chart' as const, label: simple ? 'Categories' : 'Chart of Accounts', icon: ListTree, show: true },
    { key: 'bank' as const, label: 'Bank & Reconcile', icon: Landmark, show: true },
    { key: 'reports' as const, label: 'Reports', icon: BookOpen, show: true },
    { key: 'budgets' as const, label: 'Budgets', icon: PiggyBank, show: true },
    { key: 'close' as const, label: 'Period Close', icon: CalendarCheck, show: true },
    { key: 'setup' as const, label: 'Setup', icon: Cog, show: canManage },
  ]).filter(t => t.show), [simple, canManage]);

  // Alt+1…8 jumps between tabs.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (!e.altKey || e.ctrlKey || e.metaKey) return; const n = Number(e.key); if (n >= 1 && n <= tabs.length) { e.preventDefault(); setTab(tabs[n - 1].key); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [tabs]);

  if (!canView) {
    if (isDeptHead) return (
      <div>
        <Header title="My Department Budget" sub={org.legalName || org.name} onClose={onClose} />
        <Suspense fallback={<Loading />}><DeptBudgetView org={org} uid={uid} startMonth={startMonth} /></Suspense>
      </div>
    );
    return <p className="text-xs text-white/40 py-8 text-center">The Books are limited to the finance team, pastors, trustees and your accountant. Ask a finance admin to add you.</p>;
  }

  const api: BooksApi | null = books && ctx ? {
    org, books, ctx, uid, facts, canManage, simple, startMonth, reload, setOrg, toast, go: setTab,
    goFix: (t: FixTarget) => { if (t.startsWith('finance:')) { if (onOpenFinanceTab) onOpenFinanceTab(FINANCE_TAB[t]); else toast('Open the Finance Hub tab named in the message — the Books and the Finance Hub live side by side.'); } else setTab(t as BooksTab); },
  } : null;

  return (
    <div>
      <Header title="Books" sub={`${org.legalName || org.name}${canManage ? '' : ' · view only'}`} onClose={onClose}
        right={<>
          <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5" role="group" aria-label="View mode">
            {[{ v: true, l: 'Simple' }, { v: false, l: 'Pro' }].map(o => <button key={o.l} onClick={() => toggleSimple(o.v)} title={o.v ? 'Plain language: money in / money out' : 'Debits, credits and account codes'} className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${simple === o.v ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>{o.l}</button>)}
          </div>
          <button onClick={reload} disabled={loading} title="Refresh" className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </>} />

      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 no-scrollbar" role="tablist">
        {tabs.map((t, i) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} title={`Alt+${i + 1}`} onClick={() => setTab(t.key)} className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${tab === t.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>

      {books?.errors.length ? <p className="text-[10px] text-amber-300/80 mb-3">Some data could not be loaded ({books.errors.slice(0, 2).join('; ')}). You may be missing a permission.</p> : null}
      {!api ? <Loading /> : (
        <BooksProvider value={api}>
          <Suspense fallback={<Loading />}>
            {tab === 'overview' && <OverviewTab />}
            {tab === 'journal' && <JournalTab />}
            {tab === 'chart' && <ChartTab />}
            {tab === 'bank' && <BankTab />}
            {tab === 'reports' && <ReportsTab />}
            {tab === 'budgets' && <BudgetsTab />}
            {tab === 'close' && <CloseTab />}
            {tab === 'setup' && canManage && <SetupTab />}
          </Suspense>
        </BooksProvider>
      )}
      <ToastStack items={items} />
    </div>
  );
};

const Header: React.FC<{ title: string; sub: string; onClose: () => void; right?: React.ReactNode }> = ({ title, sub, onClose, right }) => (
  <div className="flex items-center gap-3 mb-5">
    <button onClick={onClose} aria-label="Back" className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white"><ArrowLeft size={16} /></button>
    <div className="flex-1 min-w-0"><h2 className="text-lg font-black text-white flex items-center gap-2"><Calculator size={16} className="text-small-orange" />{title}</h2><p className="text-[10px] text-white/40 truncate">{sub}</p></div>
    {right}
  </div>
);
void Loader2;

export default AccountingHub;
