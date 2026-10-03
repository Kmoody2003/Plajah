// Budgets — fiscal-year budget builder: account × department × fund × month. Copy last year, start from actuals, apply a % increase.
import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Trash2, TrendingUp } from 'lucide-react';
import type { AcctBudget } from '../../../../types';
import { money, round2, todayStr } from '../../../../services/chmsFinanceReports';
import { saveBudget } from '../../../../services/acctService';
import { fiscalMonths, fiscalYearOf, fiscalYearRange, monthLabel } from '../../../../services/acctReports';
import { AccountSelect, Help, NextStep, ReadOnlyNote, btnGhost, btnPrimary, card, fieldSm, heading, useBooks, useDo } from './shared';

type Line = AcctBudget['lines'][number];
const blank = (): Line => ({ accountId: '', amounts: Array(12).fill(0) });

const BudgetsTab: React.FC = () => {
  const { org, books, canManage, startMonth, reload } = useBooks(); const { busy, run } = useDo();
  const thisFy = fiscalYearOf(todayStr(), startMonth);
  const [fy, setFy] = useState(thisFy);
  const saved = books.budgets.find(b => b.fiscalYear === fy);
  const [lines, setLines] = useState<Line[]>([]); const [dirty, setDirty] = useState(false); const [pct, setPct] = useState('3');
  useEffect(() => { setLines(saved ? saved.lines.map(l => ({ ...l, amounts: [...l.amounts] })) : []); setDirty(false); }, [fy, saved?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = fiscalMonths(fy, startMonth);
  const acct = useMemo(() => new Map(books.accounts.map(a => [a.id, a])), [books.accounts]);
  const set = (i: number, p: Partial<Line>) => { setLines(ls => ls.map((l, x) => x === i ? { ...l, ...p } : l)); setDirty(true); };
  const setMonth = (i: number, m: number, v: number) => { setLines(ls => ls.map((l, x) => x === i ? { ...l, amounts: l.amounts.map((a, k) => k === m ? v : a) } : l)); setDirty(true); };
  const spread = (i: number, annual: number) => set(i, { amounts: Array.from({ length: 12 }, (_, k) => round2(annual / 12 + (k === 11 ? annual - round2(annual / 12) * 12 : 0))) });
  const total = (l: Line) => round2(l.amounts.reduce((s, a) => s + (a || 0), 0));
  const sumType = (t: 'REVENUE' | 'EXPENSE') => round2(lines.filter(l => acct.get(l.accountId)?.type === t).reduce((s, l) => s + total(l), 0));
  const prev = books.budgets.find(b => b.fiscalYear === fy - 1);

  const fromActuals = () => {
    const pm = fiscalMonths(fy - 1, startMonth); const map = new Map<string, Line>();
    for (const j of books.journals) { const idx = pm.indexOf(j.period); if (idx < 0) continue;
      for (const l of j.lines) { const a = acct.get(l.accountId); if (!a || (a.type !== 'REVENUE' && a.type !== 'EXPENSE')) continue;
        const k = `${l.accountId}|${l.deptId || ''}|${l.fundId || ''}`; const e = map.get(k) || { accountId: l.accountId, deptId: l.deptId, fundId: l.fundId, amounts: Array(12).fill(0) };
        e.amounts[idx] = round2(e.amounts[idx] + (a.type === 'REVENUE' ? l.credit - l.debit : l.debit - l.credit)); map.set(k, e); } }
    const out = [...map.values()].filter(l => l.amounts.some(a => a)); setLines(out); setDirty(true); return out.length;
  };

  if (!books.accounts.length) return <NextStep title="Set up your chart first" body="Budgets are built on your income and spending categories." />;
  const range = fiscalYearRange(fy, startMonth);

  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <div className="flex flex-wrap items-center gap-2">
        <select value={fy} onChange={e => setFy(Number(e.target.value))} className={fieldSm} aria-label="Fiscal year">{[thisFy - 1, thisFy, thisFy + 1].map(y => <option key={y} value={y}>{fiscalYearRange(y, startMonth).label} · {monthLabel(fiscalMonths(y, startMonth)[0])} – {monthLabel(fiscalMonths(y, startMonth)[11])}</option>)}</select>
        {saved && <span className="text-[10px] text-white/40">Saved {new Date(saved.updatedAt).toLocaleDateString()}</span>}
        {dirty && <span className="text-[10px] text-amber-300">Unsaved changes</span>}
        {canManage && (
          <div className="flex flex-wrap gap-2 ml-auto items-center">
            <button disabled={!prev} onClick={() => { setLines(prev!.lines.map(l => ({ ...l, amounts: [...l.amounts] }))); setDirty(true); }} title={prev ? '' : 'No budget saved for last year'} className={btnGhost}><Copy size={12} /> Copy last year</button>
            <button onClick={() => { const n = fromActuals(); if (!n) alert('No actuals found for last fiscal year.'); }} className={btnGhost}><TrendingUp size={12} /> Start from last year's actuals</button>
            <div className="flex items-center gap-1"><input value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal" className={`${fieldSm} w-14 text-right`} aria-label="Percent" /><span className="text-xs text-white/40">%</span>
              <button disabled={!lines.length} onClick={() => { const f = 1 + (Number(pct) || 0) / 100; setLines(ls => ls.map(l => ({ ...l, amounts: l.amounts.map(a => round2(a * f)) }))); setDirty(true); }} className={btnGhost}>Apply increase</button></div>
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <NextStep title={`No ${range.label} budget yet`} body="Start from last year's actuals (fastest), copy last year's budget, or add lines by hand. Department heads will see only their own department." action={canManage ? { label: 'Add first line', onClick: () => setLines([blank()]) } : undefined} />
      ) : (
        <div className={`${card} p-4 overflow-x-auto`}>
          <p className={heading}>{range.label} budget <Help term="budget" /></p>
          <table className="text-[11px] min-w-[1100px] w-full">
            <thead><tr className="text-[9px] uppercase tracking-widest text-white/40 text-left"><th className="py-1 pr-2 w-52">Account</th><th className="w-28">Dept</th><th className="w-24">Fund</th>{months.map(m => <th key={m} className="text-right px-1 w-16">{monthLabel(m).split(' ')[0]}</th>)}<th className="text-right px-1 w-24">Year</th><th className="w-20">Spread</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-1 pr-2">{canManage ? <AccountSelect value={l.accountId} onChange={v => set(i, { accountId: v })} accounts={books.accounts} types={['REVENUE', 'EXPENSE']} className="w-full" /> : acct.get(l.accountId)?.name}</td>
                  <td><select disabled={!canManage} value={l.deptId || ''} onChange={e => set(i, { deptId: e.target.value || undefined })} className={`${fieldSm} w-full`}><option value="">All</option>{(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></td>
                  <td><select disabled={!canManage} value={l.fundId || ''} onChange={e => set(i, { fundId: e.target.value || undefined })} className={`${fieldSm} w-full`}><option value="">Any</option>{(org.givingFunds || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></td>
                  {l.amounts.map((a, m) => <td key={m} className="px-0.5"><input disabled={!canManage} inputMode="decimal" value={a || ''} onChange={e => setMonth(i, m, Number(e.target.value) || 0)} className={`${fieldSm} w-16 text-right px-1.5`} aria-label={`${monthLabel(months[m])} amount`} /></td>)}
                  <td className="text-right px-1 font-bold text-white tabular-nums">{money(total(l))}</td>
                  <td>{canManage && <input inputMode="decimal" placeholder="Annual $" onKeyDown={e => { if (e.key === 'Enter') { spread(i, Number((e.target as HTMLInputElement).value) || 0); (e.target as HTMLInputElement).value = ''; } }} className={`${fieldSm} w-20 px-1.5`} title="Type a yearly amount and press Enter to spread it evenly across 12 months" />}</td>
                  <td>{canManage && <button onClick={() => { setLines(ls => ls.filter((_, x) => x !== i)); setDirty(true); }} className="p-1.5 text-white/30 hover:text-red-400" aria-label="Remove line"><Trash2 size={12} /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-white/20 text-white"><td colSpan={3} className="py-2 font-black">Revenue {money(sumType('REVENUE'))} · Expenses {money(sumType('EXPENSE'))}</td><td colSpan={14} className={`font-black ${sumType('REVENUE') - sumType('EXPENSE') < 0 ? 'text-red-400' : 'text-green-400'}`}>{sumType('REVENUE') - sumType('EXPENSE') < 0 ? 'Planned deficit' : 'Planned surplus'} {money(round2(sumType('REVENUE') - sumType('EXPENSE')))}</td></tr></tfoot>
          </table>
          {canManage && <div className="flex justify-between mt-3 flex-wrap gap-2">
            <button onClick={() => { setLines(ls => [...ls, blank()]); setDirty(true); }} className={btnGhost}><Plus size={12} /> Add line</button>
            <button disabled={busy || !dirty} onClick={() => run(async () => { await saveBudget(org.id, fy, lines.filter(l => l.accountId)); await reload(); setDirty(false); }, 'Budget saved.')} className={btnPrimary}>Save budget</button>
          </div>}
        </div>
      )}
      <p className="text-[10px] text-white/30">Tip: pick a department on a line to give that department head a budget they can see. Leave it on "All" for church-wide lines. Type a yearly amount in "Spread" and press Enter to fill twelve months.</p>
    </div>
  );
};
export default BudgetsTab;
