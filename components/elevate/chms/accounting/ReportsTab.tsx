// Reports — financial statements, budget vs actual, fund balances, aging, the pastor's simple view, Form 990 worksheet, exports.
import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { downloadText, money } from '../../../../services/chmsFinanceReports';
import { auditExport } from '../../../../services/acctService';
import {
  apAging, budgetVsActual, cashFlow, chartCsv, comparisonRange, financialPosition, fiscalYearOf, form990Worksheet, functionalExpenses, fundBalances, generalLedger, journalsCsv,
  quickBooksJournalIif, rangePresets, simpleView, simpleViewReport, statementOfActivities, trialBalanceReport, type GroupBy, type Rpt,
} from '../../../../services/acctReports';
import { AccountSelect, Help, NextStep, RptView, btnGhost, card, fieldSm, heading, useBooks, useWords } from './shared';

type Key = 'simple' | 'position' | 'activities' | 'cashflow' | 'functional' | 'tb' | 'gl' | 'funds' | 'budget' | 'ap' | 'f990';
const LIST: { key: Key; pro: string; easy: string }[] = [
  { key: 'simple', pro: 'Giving vs spending (pastor view)', easy: 'Giving vs spending' },
  { key: 'activities', pro: 'Statement of Activities', easy: 'Income & spending' },
  { key: 'position', pro: 'Statement of Financial Position', easy: 'What we own & owe' },
  { key: 'cashflow', pro: 'Statement of Cash Flows', easy: 'Where the cash went' },
  { key: 'functional', pro: 'Functional Expenses (990)', easy: 'Spending by purpose' },
  { key: 'budget', pro: 'Budget vs Actual', easy: 'Are we on budget?' },
  { key: 'funds', pro: 'Fund Balances', easy: 'Money by fund' },
  { key: 'tb', pro: 'Trial Balance', easy: 'Trial balance (check)' },
  { key: 'gl', pro: 'General Ledger / Register', easy: 'Account history' },
  { key: 'ap', pro: 'Accounts Payable Aging', easy: 'Bills we owe' },
  { key: 'f990', pro: 'Form 990 Data Worksheet', easy: 'Form 990 worksheet' },
];

const ReportsTab: React.FC<{ initialGl?: string }> = ({ initialGl }) => {
  const { org, books, ctx, startMonth, canManage } = useBooks(); const w = useWords();
  const presets = useMemo(() => rangePresets(undefined, startMonth), [startMonth]);
  const [key, setKey] = useState<Key>('simple'); const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [cmp, setCmp] = useState<'' | 'prior' | 'lastyear'>(''); const [group, setGroup] = useState<GroupBy>('account'); const [glAcct, setGlAcct] = useState(initialGl || '');
  const base = presets.find(p => p.key === preset)!.range;
  const range = custom ? { ...custom, label: `${custom.from} – ${custom.to}` } : base;
  const cmpR = cmp ? comparisonRange(range, cmp) : undefined;

  const rpt: Rpt | null = useMemo(() => {
    switch (key) {
      case 'position': return financialPosition(ctx, range.to, cmpR?.to);
      case 'activities': return statementOfActivities(ctx, range, cmpR);
      case 'cashflow': return cashFlow(ctx, range);
      case 'functional': return functionalExpenses(ctx, range);
      case 'tb': return trialBalanceReport(ctx, range.to);
      case 'gl': return glAcct ? generalLedger(ctx, glAcct, range) : null;
      case 'funds': return fundBalances(ctx, range);
      case 'budget': return budgetVsActual(ctx, books.budgets.find(b => b.fiscalYear === fiscalYearOf(range.from, startMonth)) || null, range, { groupBy: group, startMonth });
      case 'ap': return apAging(books.expenses, range.to);
      case 'f990': return form990Worksheet(ctx, range);
      case 'simple': return simpleViewReport(simpleView(ctx, range));
    }
  }, [key, ctx, range.from, range.to, cmp, group, glAcct, books.budgets, books.expenses, startMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  const sv = useMemo(() => key === 'simple' ? simpleView(ctx, range) : null, [key, ctx, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const dl = (name: string, text: string, what: string, mime?: string) => { downloadText(name, text, mime); auditExport(org.id, what, { from: range.from, to: range.to }); };
  if (!books.journals.length) return <NextStep title="No numbers to report yet" body="Reports fill in as gifts, deposits and expenses post. Importing a bank statement or posting opening balances gets you started." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">{LIST.map(r => <button key={r.key} onClick={() => setKey(r.key)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${key === r.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>{w(r.pro, r.easy)}</button>)}</div>
      <div className={`${card} p-4 flex flex-wrap items-center gap-3`}>
        <select value={custom ? 'custom' : preset} onChange={e => { if (e.target.value === 'custom') setCustom({ from: range.from, to: range.to }); else { setCustom(null); setPreset(e.target.value); } }} className={fieldSm} aria-label="Period">{presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}<option value="custom">Custom range…</option></select>
        {custom && <><input type="date" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} className={fieldSm} /><span className="text-white/30 text-xs">to</span><input type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} className={fieldSm} /></>}
        {(key === 'activities' || key === 'position') && <select value={cmp} onChange={e => setCmp(e.target.value as any)} className={fieldSm} aria-label="Compare with"><option value="">No comparison</option><option value="prior">Compare: previous period</option><option value="lastyear">Compare: same period last year</option></select>}
        {key === 'budget' && <select value={group} onChange={e => setGroup(e.target.value as GroupBy)} className={fieldSm} aria-label="Group by"><option value="account">By account</option><option value="dept">By department</option><option value="fund">By fund</option></select>}
        {key === 'gl' && <AccountSelect value={glAcct} onChange={setGlAcct} accounts={books.accounts} placeholder="Choose an account…" />}
        <span className="text-[10px] text-white/40 ml-auto">{range.from} → {range.to}</span>
      </div>

      {sv && (
        <div className={`${card} p-5`}>
          <p className={heading}>The short version — {range.label}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
            {[['Money in', money(sv.moneyIn)], ['Money out', money(sv.moneyOut)], ['Left over', money(sv.net)], ['Cash in bank', money(sv.cash)]].map(([l, v]) => <div key={l} className="bg-white/[0.03] border border-white/10 rounded-2xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-white/40">{l}</p><p className="text-lg font-black text-white mt-1">{v}</p></div>)}
          </div>
          <p className="text-xs text-white/60 mt-3">
            {sv.ratio === null ? 'No spending recorded in this period.' : sv.ratio >= 1 ? `Giving covered spending ${Math.round(sv.ratio * 100)}% — ${money(sv.net)} left over.` : `Giving covered ${Math.round(sv.ratio * 100)}% of spending — ${money(-sv.net)} came out of reserves.`}
            {sv.monthsOfCash !== null && ` At this pace the cash on hand lasts about ${sv.monthsOfCash} months.`}
          </p>
        </div>
      )}
      {key === 'gl' && !glAcct ? <p className="text-xs text-white/40 py-6 text-center">Choose an account above to see every entry that touched it, with a running balance.</p> : rpt && <RptView rpt={rpt} onDrill={key === 'gl' ? undefined : id => { setGlAcct(id); setKey('gl'); }} />}
      {key === 'ap' && books.expenses.length === 0 && <p className="text-[10px] text-white/40">Bills appear here once they are entered in Spending.</p>}

      <div className={`${card} p-5`}>
        <p className={heading}>Exports for your accountant <Help term="journal" /></p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => dl(`quickbooks-${range.from}-${range.to}.iif`, quickBooksJournalIif(ctx, range), 'QuickBooks IIF', 'text/plain;charset=utf-8')} className={btnGhost}><Download size={12} /> QuickBooks (IIF)</button>
          <button onClick={() => dl(`journal-${range.from}-${range.to}.csv`, journalsCsv(ctx, range), 'Journal CSV')} className={btnGhost}><Download size={12} /> Journal (CSV)</button>
          <button onClick={() => dl('chart-of-accounts.csv', chartCsv(books.accounts), 'Chart of accounts CSV')} className={btnGhost}><Download size={12} /> Chart of accounts</button>
        </div>
        <p className="text-[10px] text-white/40 mt-2">The IIF contains your real chart and every journal in the selected range as general-journal entries — import it into QuickBooks Desktop; the CSVs open in Excel, Xero or any bookkeeping tool. Exports are recorded in the audit trail{canManage ? '' : ''}.</p>
      </div>
    </div>
  );
};
export default ReportsTab;
