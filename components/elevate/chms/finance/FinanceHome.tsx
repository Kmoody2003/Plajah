// FinanceHome — the new default landing of the Finance Hub: where the money is, what moved this month,
// what's coming, and what needs you — with one-tap quick actions.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck, FilePlus2, Gift, Landmark, Mailbox, PenLine, Rocket, Receipt } from 'lucide-react';
import type { Organization, OrgMembership } from '../../../../types';
import { allDeptBudgets, fetchCashPosition, givingTrend, moneySetupSteps, monthInOut, usd, type CashPosition, type HubTab, type SpendSub } from '../../../../services/acctSpending';
import type { FinanceSnapshot } from '../../../../services/chmsFinance';
import { card, heading, label, Stat, Empty } from './shared';
import MoneyInbox from './MoneyInbox';
import BudgetPulseCard from './BudgetPulseCard';
import { SkeletonRows, useSpendingBundle } from './SpendingUi';

const FinanceHome: React.FC<{ org: Organization; member: OrgMembership | null; snap: FinanceSnapshot | null; canManage: boolean; onNavigate: (t: HubTab, s?: SpendSub) => void }> = ({ org, member, snap, canManage, onNavigate }) => {
  const { bundle, perms, loading } = useSpendingBundle(org, member);
  const [cash, setCash] = useState<CashPosition | null>(null);
  useEffect(() => { if (perms.canViewBooks || perms.isOwner) fetchCashPosition(org).then(setCash); }, [org.id, perms.canViewBooks, perms.isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  const ex = bundle?.expenses ?? [];
  const mo = useMemo(() => monthInOut(org, snap, ex), [org, snap, ex]);
  const trend = useMemo(() => givingTrend(snap), [snap]);
  const max = Math.max(1, ...trend.map(t => t.total));
  const depts = useMemo(() => bundle ? allDeptBudgets(org, bundle.budgets, ex).sort((a, b) => a.left - b.left) : [], [bundle, org, ex]);
  const next = (bundle?.payouts || []).filter(p => p.status === 'pending' || p.status === 'in_transit').sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))[0];
  const steps = useMemo(() => moneySetupSteps(org, bundle), [org, bundle]);
  const doneN = steps.filter(s => s.done).length;
  const showSetup = canManage && !org.setupState?.moneySetupDismissed && doneN < steps.length;
  const month = new Date().toLocaleString('en-US', { month: 'long' });

  const quick: { l: string; i: any; go: () => void; show: boolean }[] = [
    { l: 'Enter gifts', i: PenLine, go: () => onNavigate('enter'), show: canManage },
    { l: 'New bill', i: FilePlus2, go: () => onNavigate('spending', 'submit'), show: perms.canSubmit },
    { l: 'Submit expense', i: Receipt, go: () => onNavigate('spending', 'submit'), show: perms.canSubmit },
    { l: 'Run statements', i: Mailbox, go: () => onNavigate('statements'), show: canManage },
    { l: 'Close month', i: CalendarCheck, go: () => onNavigate('books'), show: perms.canManage },
  ];

  return (
    <div className="space-y-6">
      {showSetup && (
        <button onClick={() => onNavigate('setup')} className="w-full text-left px-5 py-4 rounded-[2rem] bg-small-orange/10 border border-small-orange/30 hover:bg-small-orange/20 transition-all flex items-center gap-4">
          <Rocket size={20} className="text-small-orange shrink-0" />
          <div className="flex-1 min-w-0"><p className="text-sm font-black text-white">Money setup in 10 minutes · {doneN}/{steps.length}</p><div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2"><div className="h-full bg-small-orange" style={{ width: `${(doneN / steps.length) * 100}%` }} /></div></div>
          <ArrowRight size={16} className="text-small-orange" />
        </button>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">{quick.filter(q => q.show).map(q => <button key={q.l} onClick={q.go} className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white"><q.i size={14} className="text-small-orange" />{q.l}</button>)}</div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Cash position" value={cash?.hasBooks ? usd(cash.cash) : '—'} sub={cash?.hasBooks ? (cash.ap ? `${usd(cash.ap)} owed to vendors` : 'No bills owed') : perms.canViewBooks ? 'Set up your books to see this' : 'Finance team only'} />
        <Stat label={`${month} in`} value={snap ? usd(mo.in) : '…'} sub="gifts received" />
        <Stat label={`${month} out`} value={usd(mo.out)} sub={mo.out || mo.in ? `${mo.net >= 0 ? '+' : ''}${usd(mo.net)} net` : 'paid so far'} tone={mo.net < 0 ? 'warn' : undefined} />
        <Stat label="Next Stripe payout" value={next ? usd(next.net ?? next.amount) : '—'} sub={next ? `arrives ${next.arrivalDate}${next.bankLast4 ? ` · ····${next.bankLast4}` : ''}` : org.stripeAccountId ? 'Nothing in transit' : 'Connect Stripe to start'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h3 className={heading}>Needs you</h3>
          <MoneyInbox org={org} member={member} snap={snap} onNavigate={onNavigate} compact limit={4} />
        </section>
        <div className="space-y-6">
          <BudgetPulseCard org={org} onOpen={() => onNavigate('pulse' as HubTab)} />
          <section className={`${card} p-5`}>
            <h3 className={heading}>Giving, last 6 months</h3>
            {!snap ? <SkeletonRows rows={1} /> : (
              <div className="flex items-end gap-2 h-28">{trend.map(t => (
                <div key={t.label} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[9px] text-white/40 tabular-nums">{t.total ? `$${Math.round(t.total / 100) / 10}k` : ''}</span>
                  <div className="w-full rounded-t-lg bg-small-orange/80" style={{ height: `${Math.max(3, (t.total / max) * 72)}px` }} title={usd(t.total)} />
                  <span className={label}>{t.label}</span>
                </div>))}</div>
            )}
          </section>
          <section className={`${card} p-5`}>
            <div className="flex items-center justify-between"><h3 className={heading}>Spending vs budget · this quarter</h3><Landmark size={14} className="text-white/20 -mt-3" /></div>
            {loading && !bundle ? <SkeletonRows rows={1} /> : !depts.length ? <Empty>No department budgets yet — add them in Books and each ministry will see how much it has left.</Empty> : (
              <div className="space-y-3">{depts.slice(0, 6).map(d => { const used = Math.min(100, ((d.spent + d.pending) / d.budget) * 100); return (
                <div key={d.deptId}><div className="flex justify-between text-[11px]"><span className="text-white/80 font-bold truncate">{d.deptName}</span><span className={`tabular-nums ${d.over ? 'text-red-400' : 'text-white/50'}`}>{d.over ? `${usd(-d.left)} over` : `${usd(d.left)} left`}</span></div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1"><div className={`h-full ${d.over ? 'bg-red-500' : used > 85 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${used}%` }} /></div></div>); })}</div>
            )}
          </section>
        </div>
      </div>
      <p className="text-[10px] text-white/25 text-center"><Gift size={10} className="inline -mt-0.5 mr-1" />Press <kbd className="px-1.5 py-0.5 rounded bg-white/10">?</kbd> for keyboard shortcuts</p>
    </div>
  );
};

export default FinanceHome;
