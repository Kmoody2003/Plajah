// DeptBudgetView — department heads see ONLY their own department's budget and spending.
// Rules let leaders read budgets, accounts and expenses (not the journal), so actuals come from approved/paid expenses.
import React, { useEffect, useMemo, useState } from 'react';
import type { Organization, AcctJournal } from '../../../../types';
import { loadDeptBooks } from '../../../../services/acctService';
import { budgetVsActual, fiscalYearOf, fiscalYearRange, rangePresets } from '../../../../services/acctReports';
import { todayStr } from '../../../../services/chmsFinanceReports';
import { Loading, RptView, card, fieldSm } from './shared';

const DeptBudgetView: React.FC<{ org: Organization; uid: string; startMonth: number }> = ({ org, uid, startMonth }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadDeptBooks>> | null>(null);
  const [preset, setPreset] = useState('ytd');
  useEffect(() => { loadDeptBooks(org.id).then(setData); }, [org.id]);
  const mine = useMemo(() => (org.ministries || []).filter(m => (m.headUids || []).includes(uid)), [org.ministries, uid]);
  const presets = useMemo(() => rangePresets(undefined, startMonth), [startMonth]);
  const range = presets.find(p => p.key === preset)!.range;
  const rpt = useMemo(() => {
    if (!data) return null;
    const journals: AcctJournal[] = data.expenses.filter(e => (e.status === 'APPROVED' || e.status === 'PAID') && e.deptId && mine.some(m => m.id === e.deptId)).map(e => ({
      id: e.id, orgId: org.id, date: e.date, period: e.date.slice(0, 7), memo: e.description, status: 'POSTED' as const, createdBy: e.submittedBy, createdAt: e.createdAt, source: { kind: 'EXPENSE' as const, id: e.id },
      lines: [{ accountId: e.accountId, debit: e.amount, credit: 0, fundId: e.fundId, deptId: e.deptId }],
    }));
    const fy = fiscalYearOf(range.from, startMonth);
    const ctx = { accounts: data.accounts, journals, funds: org.givingFunds || [], ministries: (org.ministries || []).map(m => ({ id: m.id, name: m.name })) };
    return budgetVsActual(ctx, data.budgets.find(b => b.fiscalYear === fy) || null, range, { groupBy: 'account', deptIds: mine.map(m => m.id), startMonth });
  }, [data, mine, range.from, range.to, startMonth, org]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !rpt) return <Loading />;
  if (!mine.length) return <p className="text-xs text-white/40 py-8 text-center">You are not listed as the head of a department yet.</p>;
  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex flex-wrap items-center gap-3`}>
        <p className="text-xs text-white/70">Your department{mine.length > 1 ? 's' : ''}: <b className="text-white">{mine.map(m => m.name).join(', ')}</b></p>
        <select value={preset} onChange={e => setPreset(e.target.value)} className={`${fieldSm} ml-auto`} aria-label="Period">{presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
      </div>
      <RptView rpt={{ ...rpt, title: 'My Department — Budget vs Actual', notes: [...(rpt.notes || []), 'Actuals count approved and paid expenses charged to your department. Revenue lines appear only if your church budgets income to your department.'] }} org={org} />
      <p className="text-[10px] text-white/30">{fiscalYearRange(fiscalYearOf(todayStr(), startMonth), startMonth).label} · Need more room? Ask the finance team to adjust your budget. Submit expenses from Spending.</p>
    </div>
  );
};
export default DeptBudgetView;
