// Period Close — a guided month-end checklist computed from live data, with fix-it links. Closing locks posting.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { money, todayStr } from '../../../../services/chmsFinanceReports';
import { backfillGiftJournals, closeFiscalYear, closePeriod, reopenPeriod } from '../../../../services/acctService';
import { closeChecklist, fiscalMonths, fiscalYearOf, fiscalYearRange, monthLabel, statementOfActivities, yearEndReadiness } from '../../../../services/acctReports';
import { Help, Pill, ReadOnlyNote, btnGhost, btnPrimary, card, field, fieldSm, heading, useBooks, useDo } from './shared';

const CloseTab: React.FC = () => {
  const { org, books, ctx, facts, canManage, startMonth, reload, go, goFix } = useBooks(); const { busy, run } = useDo();
  const periods = useMemo(() => { const out: string[] = []; const d = new Date(); for (let i = 0; i < 14; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); } return out; }, []);
  const [period, setPeriod] = useState(periods[1]); const [reopenReason, setReopenReason] = useState(''); const [askReopen, setAskReopen] = useState(false);
  const closed = books.closed.has(period);
  const list = useMemo(() => closeChecklist({ period, contributions: facts.contributions, batches: facts.batches, journals: books.journals, sys: books.sys, payouts: books.payouts, bankAccounts: books.bankAccounts, bankTxns: books.bankTxns, expenses: books.expenses }), [period, facts, books]);
  const blockers = list.filter(c => !c.ok && c.severity === 'block'); const warns = list.filter(c => !c.ok && c.severity === 'warn');
  const todayP = todayStr().slice(0, 7);

  const doClose = () => run(async () => {
    if (warns.length && !window.confirm(`${warns.length} item(s) are not finished (${warns.map(w => w.label).join('; ')}). Close ${monthLabel(period)} anyway?`)) return;
    await closePeriod(org.id, period, Object.fromEntries(list.map(c => [c.key, c.ok]))); await reload();
  }, `${monthLabel(period)} is closed and locked.`);

  const fy = fiscalYearOf(todayStr(), startMonth) - 1;   // default to the fiscal year that just ended
  const [yearSel, setYearSel] = useState(fy);
  const months = fiscalMonths(yearSel, startMonth);
  const openMonths = months.filter(m => !books.closed.has(m) && m <= todayP);
  const yr = useMemo(() => yearEndReadiness({ year: yearSel, contributions: facts.contributions, batches: facts.batches, journals: books.journals, sys: books.sys, org, openPeriods: months.filter(m => !books.closed.has(m)) }), [yearSel, facts, books, org]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = fiscalYearRange(yearSel, startMonth);
  const act = useMemo(() => statementOfActivities(ctx, range), [ctx, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = act.rows.find(r => r.label === 'Change in net assets')?.v?.[2];

  return (
    <div className="space-y-5">
      {!canManage && <ReadOnlyNote />}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={period} onChange={e => { setPeriod(e.target.value); setAskReopen(false); }} className={fieldSm} aria-label="Month to close">{periods.map(p => <option key={p} value={p}>{monthLabel(p)}{books.closed.has(p) ? ' · locked' : ''}</option>)}</select>
        {closed ? <Pill tone="ok"><Lock size={9} className="inline mr-1" />Closed</Pill> : <Pill tone={blockers.length ? 'bad' : warns.length ? 'warn' : 'ok'}>{blockers.length ? `${blockers.length} blocking` : warns.length ? `${warns.length} to review` : 'Ready to close'}</Pill>}
        <Help term="period" />
      </div>

      <div className={`${card} p-5 space-y-2`}>
        <p className={heading}>{monthLabel(period)} checklist</p>
        {list.map(c => (
          <div key={c.key} className="flex items-start gap-3 bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3">
            {c.ok ? <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" /> : <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${c.severity === 'block' ? 'text-red-400' : 'text-amber-300'}`} />}
            <div className="flex-1 min-w-0"><p className="text-xs font-bold text-white">{c.label}</p><p className="text-[11px] text-white/50">{c.detail}</p></div>
            {!c.ok && c.fix && canManage && (c.key === 'gifts-journaled'
              ? <button disabled={busy} onClick={() => run(async () => { const r = await backfillGiftJournals(org.id); await reload(); return r; }, r => `Posted ${r.posted} missing entr${r.posted === 1 ? 'y' : 'ies'}${r.closedSkipped ? ` · ${r.closedSkipped} skipped (period locked)` : ''}.`)} className={btnPrimary}>Post now</button>
              : <button onClick={() => c.fix!.target.startsWith('finance:') ? goFix(c.fix!.target) : go(c.fix!.target as any)} className={btnGhost}>{c.fix.label} <ArrowRight size={11} /></button>)}
          </div>
        ))}
        {canManage && (
          <div className="flex justify-end gap-2 pt-2 flex-wrap">
            {closed ? (askReopen ? (
              <><input autoFocus value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder="Why are you reopening? (recorded)" className={`${field} max-w-xs`} />
                <button disabled={busy || !reopenReason.trim()} onClick={() => run(async () => { await reopenPeriod(org.id, period, reopenReason); setAskReopen(false); setReopenReason(''); await reload(); }, `${monthLabel(period)} reopened.`)} className={btnPrimary}>Reopen</button><button onClick={() => setAskReopen(false)} className={btnGhost}>Cancel</button></>
            ) : <button onClick={() => setAskReopen(true)} className={btnGhost}><Unlock size={12} /> Reopen period</button>)
              : <button disabled={busy || blockers.length > 0} onClick={doClose} className={btnPrimary}><Lock size={12} /> Close {monthLabel(period)}</button>}
          </div>
        )}
        {!closed && blockers.length > 0 && <p className="text-[10px] text-white/40 text-right">Fix the red items to unlock the Close button. Amber items you can close over after confirming.</p>}
      </div>

      <div className={`${card} p-5 space-y-3`}>
        <div className="flex items-center gap-2 flex-wrap"><p className={heading + ' mb-0'}>Year-end close</p>
          <select value={yearSel} onChange={e => setYearSel(Number(e.target.value))} className={fieldSm} aria-label="Fiscal year">{[fy - 1, fy, fy + 1].map(y => <option key={y} value={y}>{fiscalYearRange(y, startMonth).label}</option>)}</select></div>
        <p className="text-xs text-white/50">Year-end locks every month of the year. Your surplus or deficit {typeof change === 'number' ? <b className="text-white">({money(change)})</b> : ''} rolls into net assets automatically — no manual closing entry needed, and reports stay correct.</p>
        {yr.map(c => <div key={c.key} className="flex items-center gap-2 text-xs"><CheckCircle2 size={14} className={c.ok ? 'text-green-400' : 'text-white/20'} /><span className="text-white/80">{c.label}</span><span className="text-white/40">— {c.detail}</span></div>)}
        {canManage && <div className="flex justify-end"><button disabled={busy || openMonths.length === 0} onClick={() => { if (window.confirm(`Lock ${openMonths.length} open month(s) of ${range.label}? You can reopen any month later with a reason.`)) run(async () => { const n = await closeFiscalYear(org.id, months); await reload(); return n; }, n => `Locked ${n} month(s) of ${range.label}.`); }} className={btnPrimary}><Lock size={12} /> Close {range.label}</button></div>}
        <p className="text-[10px] text-white/30">Next: giving statements are generated in Finance Hub › Statements; the Form 990 worksheet is under Reports.</p>
      </div>
    </div>
  );
};
export default CloseTab;
