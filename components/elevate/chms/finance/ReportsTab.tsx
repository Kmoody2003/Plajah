// Reports — every Servant Keeper giving report + QuickBooks / Servant-Keeper-compatible exports.
// Giver-level reports (top givers, giver lists…) are hidden from VIEW_GIVING-only trustees.
import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { finAudit, settingsOf } from '../../../../services/chmsFinance';
import {
  REPORTS, contributionsCsv, downloadText, inRange, journalCsv, pledgeProgress, quickBooksIif, runReport, servantKeeperCsv, todayStr, live, type ReportKey,
} from '../../../../services/chmsFinanceReports';
import { card, btnGhost, heading, label, DataTable, RangePicker, type TabProps } from './shared';

const ReportsTab: React.FC<TabProps> = ({ org, snap, canManage }) => {
  const y = new Date().getFullYear();
  const avail = REPORTS.filter(r => canManage || !r.givers);
  const [key, setKey] = useState<ReportKey>(avail[0].key);
  const [from, setFrom] = useState(`${y}-01-01`); const [to, setTo] = useState(todayStr());
  const st = settingsOf(org);

  const users = snap.usersById;
  const table = useMemo(() => {
    const pledges = snap.pledges.map(p => pledgeProgress(p, snap.ledger, snap.idx));
    return runReport(key, { rows: snap.ledger, range: { from, to, label: `${from} – ${to}` }, batches: snap.batches, pledges, idx: snap.idx, settings: st, users });
  }, [key, from, to, snap, st, users]);

  const rangeRows = useMemo(() => snap.ledger.filter(r => inRange(r.date, { from, to })), [snap.ledger, from, to]);
  const qb = { depositAccount: st.qbDepositAccount || 'Checking', incomePrefix: st.qbIncomeAccountPrefix ?? 'Contributions:', funds: org.givingFunds || [] };
  const exp = (name: string, text: string, mime?: string) => { downloadText(name, text, mime); finAudit(org.id, 'FIN_EXPORT', name, { from, to, rows: rangeRows.length }); };
  const preset = (a: string, b: string) => { setFrom(a); setTo(b); };

  return (
    <div className="space-y-6">
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {avail.map(r => <button key={r.key} onClick={() => setKey(r.key)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${key === r.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>{r.label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          <div className="flex gap-1.5">
            <button className={btnGhost} onClick={() => preset(`${y}-01-01`, todayStr())}>YTD</button>
            <button className={btnGhost} onClick={() => preset(`${y - 1}-01-01`, `${y - 1}-12-31`)}>Last year</button>
            <button className={btnGhost} onClick={() => { const d = new Date(); preset(todayStr(new Date(d.getFullYear(), d.getMonth(), 1)), todayStr()); }}>This month</button>
          </div>
        </div>
        {!canManage && <p className="text-[9px] text-white/30 mt-3">Giver-level reports (top givers, giver lists) are limited to finance roles to protect donor privacy.</p>}
      </div>

      <DataTable table={table} org={org} />

      {canManage && (
        <div className={`${card} p-5`}>
          <h3 className={heading}>Exports — {from} to {to} ({live(rangeRows).length} gifts)</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { t: 'Full contribution ledger (CSV)', d: 'Every field incl. voids, memo, tribute.', f: () => exp(`contributions-${from}-${to}.csv`, contributionsCsv(rangeRows, snap.idx, snap.batches)) },
              { t: 'Servant Keeper–compatible contributions (CSV)', d: 'Flat Individual / Family / Fund / Amount layout for re-import.', f: () => exp(`sk-contributions-${from}-${to}.csv`, servantKeeperCsv(rangeRows, snap.idx, snap.batches)) },
              { t: 'QuickBooks Desktop (IIF)', d: `One DEPOSIT per batch into “${qb.depositAccount}”, split to ${qb.incomePrefix}<fund>.`, f: () => exp(`quickbooks-${from}-${to}.iif`, quickBooksIif(rangeRows, snap.batches, qb), 'text/plain;charset=utf-8') },
              { t: 'Journal by fund / class (CSV)', d: 'Debit deposit, credit each fund — for QuickBooks Online or any GL.', f: () => exp(`journal-${from}-${to}.csv`, journalCsv(rangeRows, snap.batches, qb)) },
            ].map(x => (
              <button key={x.t} onClick={x.f} className="text-left rounded-2xl bg-white/[0.04] border border-white/10 p-4 hover:bg-white/10 transition-all">
                <p className="text-xs font-black text-white flex items-center gap-2"><Download size={12} />{x.t}</p>
                <p className={`${label} normal-case tracking-normal mt-1`}>{x.d}</p>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 mt-3">Set your QuickBooks deposit account and income prefix in Settings. Each fund’s GL code (Funds tab) becomes its account/class. Exports are audited.</p>
        </div>
      )}
    </div>
  );
};

export default ReportsTab;
