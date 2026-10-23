// MyGivingPanel — a member sees ONLY their own giving + downloadable statement (via ChmsPerson.linkedUid,
// denormalized onto each contribution; Firestore rules let a member read only rows where linkedUid == their uid).
import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { fetchMyGiving, type MyGiving } from '../../../../services/chmsFinance';
import { buildStatements, money, statementsHtml, sum, yearRange, live } from '../../../../services/chmsFinanceReports';
import { statementOrgOf } from '../../../../services/givingEmailCore';
import { downloadPdf, statementsPdf } from '../../../../services/givingPdf';
import { card, heading, label, btnGhost, Empty, printHtml } from './shared';

export interface MyGivingPanelProps { orgId: string; uid: string }

const MyGivingPanel: React.FC<MyGivingPanelProps> = ({ orgId, uid }) => {
  const [d, setD] = useState<MyGiving | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  useEffect(() => { setD(null); fetchMyGiving(orgId, uid).then(setD).catch(() => setD({ person: null, rows: [], org: null })); }, [orgId, uid]);

  const rows = useMemo(() => live(d?.rows || []), [d]);
  const years = useMemo(() => [...new Set(rows.map(r => Number(r.date.slice(0, 4))))].sort((a, b) => b - a), [rows]);
  const yr = rows.filter(r => r.date.startsWith(String(year)));
  const byFund = useMemo(() => { const m: Record<string, number> = {}; yr.forEach(r => { m[r.fundName] = (m[r.fundName] || 0) + r.amount; }); return m; }, [yr]);

  if (!d) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" size={20} /></div>;
  if (!rows.length) return <Empty>No giving on record for your account yet. If you give by check or cash, ask the finance office to link your gifts to your Plajah account.</Empty>;

  const org = d.org;
  const myStatements = () => {
    const person = d.person ? [d.person] : [{ id: 'me', orgId, firstName: 'Giver', lastName: '', status: 'MEMBER', createdAt: 0, updatedAt: 0 } as any];
    const stmts = buildStatements(d.rows.map(r => ({ ...r, personId: r.personId || person[0].id })), person, [], yearRange(year), false);
    if (!stmts.length) alert('No deductible gifts in that year.');
    return stmts;
  };
  const orgInfo = org ? statementOrgOf(org) : { name: 'Organization', faith: true };
  const printStatement = () => { const s = myStatements(); if (s.length) printHtml(statementsHtml(s, orgInfo)); };
  const pdfStatement = async () => { const s = myStatements(); if (s.length) downloadPdf(`${year}-giving-statement.pdf`, await statementsPdf(s, orgInfo)); };

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1"><p className={label}>My giving · {year}</p><p className="text-3xl font-black text-white mt-1 tabular-nums">{money(sum(yr))}</p></div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white">{(years.length ? years : [year]).map(y => <option key={y} value={y}>{y}</option>)}</select>
          <button onClick={pdfStatement} className={btnGhost}><Download size={12} /> Statement PDF</button>
          <button onClick={printStatement} className={btnGhost}><Printer size={12} /> Print</button>
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-white/50">{Object.entries(byFund).map(([f, v]) => <span key={f}>{f}: <b className="text-white">{money(v)}</b></span>)}</div>
      </div>
      <div className={`${card} p-5`}>
        <h3 className={heading}>Gifts</h3>
        <div className="space-y-1">
          {yr.sort((a, b) => b.date.localeCompare(a.date)).map(r => (
            <div key={r.id} className="flex gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03]"><span className="text-white/40 w-24 shrink-0">{r.date}</span><span className="flex-1 text-white">{r.fundName} <span className="text-white/30">· {r.method}</span></span><span className="tabular-nums text-white">{money(r.amount)}</span></div>
          ))}
          {yr.length === 0 && <Empty>No gifts in {year}.</Empty>}
        </div>
      </div>
    </div>
  );
};

export default MyGivingPanel;
