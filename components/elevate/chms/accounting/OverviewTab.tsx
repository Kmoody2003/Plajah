// Overview — cash position, this month in/out, budget health, giving-vs-spending, close checklist, and what needs attention.
import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { money, todayStr } from '../../../../services/chmsFinanceReports';
import { budgetHealth, budgetVsActual, closeChecklist, fiscalYearOf, fiscalYearRange, monthLabel, periodRange, planGiftJournals, simpleView } from '../../../../services/acctReports';
import { Stat, card, heading, Pill, NextStep, useBooks, Help, ReadOnlyNote } from './shared';

const Bars: React.FC<{ trend: { month: string; in: number; out: number }[] }> = ({ trend }) => {
  const max = Math.max(1, ...trend.flatMap(t => [t.in, t.out]));
  return (
    <div className="flex items-end gap-3 h-28" aria-label="Money in and out for the last six months">
      {trend.map(t => (
        <div key={t.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="flex items-end gap-1 h-20 w-full justify-center">
            <div title={`In ${money(t.in)}`} className="w-3 rounded-t bg-green-400/80" style={{ height: `${Math.max(2, (t.in / max) * 100)}%` }} />
            <div title={`Out ${money(t.out)}`} className="w-3 rounded-t bg-small-orange/80" style={{ height: `${Math.max(2, (t.out / max) * 100)}%` }} />
          </div>
          <span className="text-[9px] text-white/40">{monthLabel(t.month).split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
};

const OverviewTab: React.FC = () => {
  const { org, books, ctx, facts, canManage, simple, startMonth, go, goFix } = useBooks();
  const today = todayStr(); const month = today.slice(0, 7);
  const monthR = periodRange(month);
  const sv = useMemo(() => simpleView(ctx, monthR), [ctx, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const sv6 = useMemo(() => simpleView(ctx, { from: `${month}-01`, to: today, label: 'last 6 months' }), [ctx, month, today]);
  const cashAccts = books.accounts.filter(a => a.type === 'ASSET' && (a.subtype === 'cash' || a.systemKey === 'CASH_OPERATING'));
  const bal = useMemo(() => { const m = new Map<string, number>(); books.journals.forEach(j => { if (j.date <= today) j.lines.forEach(l => m.set(l.accountId, (m.get(l.accountId) || 0) + Math.round(l.debit * 100) - Math.round(l.credit * 100))); }); return m; }, [books.journals, today]);
  const cashRows = cashAccts.map(a => ({ a, v: (bal.get(a.id) || 0) / 100 })).filter(r => r.v !== 0 || r.a.systemKey === 'CASH_OPERATING');
  const inTransit = ['STRIPE_CLEARING', 'UNDEPOSITED_FUNDS'].map(k => { const id = books.sys[k as 'STRIPE_CLEARING']; const a = books.accounts.find(x => x.id === id); return a ? { a, v: (bal.get(a.id) || 0) / 100 } : null; }).filter(Boolean) as { a: { name: string }; v: number }[];
  const fy = fiscalYearOf(today, startMonth);
  const budget = books.budgets.find(b => b.fiscalYear === fy) || null;
  const health = useMemo(() => budget ? budgetHealth(budgetVsActual(ctx, budget, { ...fiscalYearRange(fy, startMonth), to: today, label: 'YTD' }, { groupBy: 'account', startMonth })) : null, [ctx, budget, fy, startMonth, today]);
  const lastP = (() => { const [y, m] = month.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
  const lastClosed = books.closed.has(lastP);
  const checklist = useMemo(() => closeChecklist({ period: lastP, contributions: facts.contributions, batches: facts.batches, journals: books.journals, sys: books.sys, payouts: books.payouts, bankAccounts: books.bankAccounts, bankTxns: books.bankTxns, expenses: books.expenses }), [lastP, facts, books]);
  const passed = checklist.filter(c => c.ok).length;
  const plan = useMemo(() => planGiftJournals({ contributions: facts.contributions, batches: facts.batches, journals: books.journals, sys: books.sys }), [facts, books]);
  const unmatched = books.bankTxns.filter(t => t.status === 'UNMATCHED').length;
  const pendingExp = books.expenses.filter(e => e.status === 'SUBMITTED').length;
  const todo: { text: string; onClick: () => void; tone: 'warn' | 'bad' }[] = [];
  if (!books.bankAccounts.length) todo.push({ text: 'Add your bank account so we can match your statements.', onClick: () => go('setup'), tone: 'warn' });
  if (unmatched) todo.push({ text: `${unmatched} bank line${unmatched === 1 ? '' : 's'} need a match.`, onClick: () => go('bank'), tone: 'warn' });
  if (plan.drafts.length) todo.push({ text: `${plan.drafts.length} gift/deposit entr${plan.drafts.length === 1 ? 'y is' : 'ies are'} not in the books yet.`, onClick: () => go('close'), tone: 'warn' });
  if (pendingExp) todo.push({ text: `${pendingExp} expense${pendingExp === 1 ? '' : 's'} waiting for approval.`, onClick: () => goFix('finance:spending'), tone: 'warn' });
  if (!budget) todo.push({ text: `No ${fiscalYearRange(fy, startMonth).label} budget yet.`, onClick: () => go('budgets'), tone: 'warn' });
  if (!lastClosed && passed < checklist.length) todo.push({ text: `${monthLabel(lastP)} is not ready to close (${passed}/${checklist.length} checks).`, onClick: () => go('close'), tone: 'warn' });

  if (!books.accounts.length) return <NextStep title="Your books are empty" body="We will create a standard church chart of accounts for you — it takes a second and you can rename anything later." action={canManage ? { label: 'Start the 5-minute setup', onClick: () => go('setup') } : undefined} />;

  return (
    <div className="space-y-5">
      {!canManage && <ReadOnlyNote />}
      {canManage && !books.bankAccounts.length && books.journals.length === 0 && (
        <div className={`${card} p-5 flex items-center justify-between gap-3 flex-wrap border-small-orange/30`}>
          <div><p className="text-sm font-black text-white">Set up your books in 5 minutes</p><p className="text-xs text-white/50">Chart of accounts, bank accounts, fiscal year and (optionally) opening balances.</p></div>
          <button onClick={() => go('setup')} className="px-5 py-3 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2">Start <ArrowRight size={12} /></button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Cash on hand" value={money(cashRows.reduce((s, r) => s + r.v, 0))} sub={cashRows.map(r => `${r.a.name} ${money(r.v)}`).join(' · ') || 'No bank accounts yet'} />
        <Stat label={simple ? 'Money in this month' : 'Revenue this month'} value={money(sv.moneyIn)} sub={monthLabel(month)} />
        <Stat label={simple ? 'Money out this month' : 'Expenses this month'} value={money(sv.moneyOut)} sub={sv.monthsOfCash !== null ? `≈ ${sv.monthsOfCash} months of cash at this pace` : undefined} />
        <Stat label="Left over" value={money(sv.net)} tone={sv.net < 0 ? 'bad' : undefined} sub={sv.ratio !== null ? `Giving covers ${Math.round(sv.ratio * 100)}% of spending` : undefined} />
      </div>
      {inTransit.some(r => r.v !== 0) && (
        <p className="text-[11px] text-white/50">In transit: {inTransit.filter(r => r.v !== 0).map(r => `${r.a.name} ${money(r.v)}`).join(' · ')} <Help term="clearing" /></p>
      )}

      {todo.length > 0 && (
        <div className={`${card} p-5`}>
          <p className={heading}>Needs your attention</p>
          <ul className="space-y-2">
            {todo.map((t, i) => (
              <li key={i}><button onClick={t.onClick} className="w-full flex items-center gap-3 text-left text-xs text-white/80 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3">
                <AlertTriangle size={14} className="text-amber-300 shrink-0" /><span className="flex-1">{t.text}</span><ArrowRight size={12} className="text-white/30" />
              </button></li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className={`${card} p-5`}>
          <p className={heading}>{simple ? 'Giving vs spending — last 6 months' : 'Revenue vs expenses — last 6 months'}</p>
          <Bars trend={sv6.trend} />
          <p className="text-[10px] text-white/40 mt-2 flex gap-3"><span><span className="inline-block w-2 h-2 rounded-full bg-green-400/80 mr-1" />{simple ? 'Money in' : 'Revenue'}</span><span><span className="inline-block w-2 h-2 rounded-full bg-small-orange/80 mr-1" />{simple ? 'Money out' : 'Expenses'}</span></p>
        </div>
        <div className={`${card} p-5`}>
          <p className={heading}>Budget health · {fiscalYearRange(fy, startMonth).label} to date</p>
          {health ? (
            <div className="flex gap-3 flex-wrap items-center">
              <Pill tone="ok">{health.good} on track</Pill><Pill tone="warn">{health.warn} watch</Pill><Pill tone="bad">{health.bad} over / behind</Pill>
              <button onClick={() => go('reports')} className="text-[10px] font-black uppercase tracking-widest text-small-orange ml-auto">See details</button>
            </div>
          ) : <NextStep title="No budget yet" body="A budget turns every report into a traffic light: on track, watch, or over." action={canManage ? { label: 'Build a budget', onClick: () => go('budgets') } : undefined} />}
        </div>
      </div>

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className={heading + ' mb-0'}>{monthLabel(lastP)} close · {lastClosed ? 'locked' : `${passed} of ${checklist.length} ready`}</p>
          <button onClick={() => go('close')} className="text-[10px] font-black uppercase tracking-widest text-small-orange">Open checklist</button>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className={`h-full ${lastClosed || passed === checklist.length ? 'bg-green-400' : 'bg-small-orange'}`} style={{ width: `${lastClosed ? 100 : (passed / checklist.length) * 100}%` }} /></div>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
          {checklist.map(c => <li key={c.key} className="flex items-center gap-2 text-[11px] text-white/60"><CheckCircle2 size={12} className={c.ok || lastClosed ? 'text-green-400' : 'text-white/20'} />{c.label}</li>)}
        </ul>
      </div>
    </div>
  );
};
export default OverviewTab;
