// Shared primitives for the Finance Hub tabs (styling mirrors components/elevate/ElevateOps).
import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { Organization } from '../../../../types';
import type { FinanceSnapshot } from '../../../../services/chmsFinance';
import { money, tableToCsv, downloadText, type ReportTable } from '../../../../services/chmsFinanceReports';
import { finAudit } from '../../../../services/chmsFinance';

export const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem]';
export const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
export const fieldSm = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
export const btnPrimary = 'px-5 py-3 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:brightness-110 disabled:opacity-30 inline-flex items-center justify-center gap-2';
export const btnGhost = 'px-4 py-2.5 bg-white/5 border border-white/10 text-white/70 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-white/10 disabled:opacity-30 inline-flex items-center justify-center gap-2';
export const label = 'text-[9px] font-black uppercase tracking-widest text-white/40';
export const heading = 'text-[10px] font-black uppercase tracking-widest text-small-orange mb-3';

export interface TabProps {
  org: Organization;
  snap: FinanceSnapshot;
  reload: () => Promise<void>;
  /** MANAGE_GIVING — can write and see giver-level data. */
  canManage: boolean;
  setOrg: (o: Organization) => void;
  uid: string;
  /** Click-through from a gift to the giver's People record (wired by the host if available). */
  onOpenPerson?: (personId: string) => void;
}

export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' }> = ({ label: l, value, sub, tone }) => (
  <div className={`${card} p-5`}>
    <p className={label}>{l}</p>
    <p className={`text-2xl font-black mt-1 ${tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    {sub && <p className="text-[10px] text-white/40 mt-1">{sub}</p>}
  </div>
);

export const Pill: React.FC<{ tone?: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${tone === 'ok' ? 'bg-green-500/10 text-green-400 border-green-500/30' : tone === 'warn' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : tone === 'bad' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-white/5 text-white/50 border-white/10'}`}>{children}</span>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-xs text-white/40 py-6 text-center">{children}</p>;

export const Busy: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) => on ? <><Loader2 size={13} className="animate-spin" /> {children}</> : <>{children}</>;

/** Run an async action with a busy flag + alert on failure. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, errPrefix = ''): Promise<T | undefined> => {
    setBusy(true);
    try { return await fn(); }
    catch (e: any) { alert(`${errPrefix}${e?.message || 'Something went wrong.'}`); }
    finally { setBusy(false); }
    return undefined;
  };
  return { busy, run };
}

const MONEY_HDR = /total|amount|given|pledged|remaining|change|expected|variance|prior|this period|behind|balance|gross|fees|net|^\d{4}$|^q\d/i;
const COUNT_HDR = /gifts|rank|days|%|items/i;

export const DataTable: React.FC<{ table: ReportTable; org?: Organization; auditExport?: boolean; maxRows?: number }> = ({ table, org, auditExport = true, maxRows = 500 }) => {
  const exportCsv = () => {
    downloadText(`${table.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, tableToCsv(table));
    if (org && auditExport) finAudit(org.id, 'FIN_EXPORT', table.title, { rows: table.rows.length });
  };
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h3 className="text-sm font-black text-white">{table.title}</h3>{table.note && <p className="text-[10px] text-white/40 mt-0.5">{table.note}</p>}</div>
        <button onClick={exportCsv} className={btnGhost}><Download size={12} /> CSV</button>
      </div>
      {table.rows.length === 0 ? <Empty>Nothing to show for this selection.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{table.headers.map(h => <th key={h} className={`${label} text-left py-2 px-2 whitespace-nowrap`}>{h}</th>)}</tr></thead>
            <tbody>
              {table.rows.slice(0, maxRows).map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  {r.map((c, j) => {
                    const h = table.headers[j] || '';
                    const isMoney = typeof c === 'number' && MONEY_HDR.test(h) && !COUNT_HDR.test(h);
                    return <td key={j} className={`py-2 px-2 ${typeof c === 'number' ? 'text-right tabular-nums' : ''} ${isMoney && c < 0 ? 'text-red-400' : 'text-white/80'}`}>{isMoney ? money(c as number) : String(c)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > maxRows && <p className="text-[10px] text-white/30 mt-2">Showing first {maxRows} of {table.rows.length} rows — export CSV for all.</p>}
        </div>
      )}
    </div>
  );
};

export const RangePicker: React.FC<{ from: string; to: string; onChange: (from: string, to: string) => void }> = ({ from, to, onChange }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <input type="date" value={from} onChange={e => onChange(e.target.value, to)} className={fieldSm} />
    <span className="text-white/30 text-xs">to</span>
    <input type="date" value={to} onChange={e => onChange(from, e.target.value)} className={fieldSm} />
  </div>
);

export function printHtml(html: string) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.open(); w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch { /* manual */ } }, 350);
}
