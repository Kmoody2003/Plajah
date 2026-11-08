// Schedules and live code checks for the open drawing. Both are computed from the model on every
// change, so they are never out of date.

import React from 'react';
import { Download, FilePlus2, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import type { Table } from '../../services/cad/schedules';
import { toCsv } from '../../services/cad/schedules';
import type { Finding } from '../../services/cad/codeCheck';
import { DISCLAIMER } from '../../services/cad/codeCheck';

const DIM = 'rgba(255,255,255,.5)';
const COLOR = { pass: '#34d399', warn: '#fbbf24', fail: '#f87171' } as const;

export default function SchedulesPanel({ tables, findings, onPickFinding, onSendTable, drawingName }: { tables: Table[]; findings: Finding[]; onPickFinding: (f: Finding) => void; onSendTable?: (t: Table) => void; drawingName: string }) {
  const fails = findings.filter(f => f.status === 'fail'), warns = findings.filter(f => f.status === 'warn'), passes = findings.filter(f => f.status === 'pass');
  const download = (t: Table) => { const url = URL.createObjectURL(new Blob([toCsv(t)], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `${drawingName.replace(/\.[^.]+$/, '')} - ${t.title}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); };
  const order = [...fails, ...warns, ...passes];
  return <div className="text-[12px]" data-testid="cad-schedules">
    <div className="flex items-center gap-1.5 mb-1.5"><ShieldCheck size={13} style={{ color: '#7dd3fc' }}/><span className="text-[10px] font-extrabold uppercase tracking-[.12em]" style={{ color: DIM }}>Accessibility pre-check</span></div>
    <div className="flex gap-1.5 mb-2" data-testid="cad-check-counts">
      {([['fail', fails.length, 'issues'], ['warn', warns.length, 'to look at'], ['pass', passes.length, 'passing']] as const).map(([k, n, l]) => <div key={k} className="flex-1 rounded-md px-2 py-1 text-center" style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${n && k !== 'pass' ? COLOR[k] + '66' : 'rgba(255,255,255,.08)'}` }}><div className="text-[15px] font-bold" style={{ color: n ? COLOR[k] : DIM }}>{n}</div><div className="text-[9.5px]" style={{ color: DIM }}>{l}</div></div>)}
    </div>
    {!findings.length && <div className="text-[11px] mb-2" style={{ color: DIM }}>Draw walls with doors, tag a bathroom, or place toilets and stairs from the Library, and checks appear here as you go.</div>}
    <div className="space-y-1 mb-2">
      {order.slice(0, 60).map((f, i) => { const Icon = f.status === 'pass' ? CheckCircle2 : f.status === 'warn' ? AlertTriangle : XCircle; return <button key={i} onClick={() => onPickFinding(f)} className="w-full text-left flex gap-2 items-start px-2 py-1.5 rounded-md hover:bg-white/5" style={{ border: '1px solid rgba(255,255,255,.06)' }} data-testid={`cad-finding-${f.status}`}>
        <Icon size={13} className="shrink-0 mt-0.5" style={{ color: COLOR[f.status] }}/>
        <div className="min-w-0"><div className="font-semibold text-[11.5px]">{f.title}</div><div className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.7)' }}>{f.detail}</div><div className="text-[9.5px]" style={{ color: DIM }}>{f.citation}</div></div>
      </button>; })}
    </div>
    <div className="text-[9.5px] leading-snug mb-3" style={{ color: DIM }}>{DISCLAIMER}</div>

    {tables.map(t => <section key={t.title} className="mb-3" data-testid={`cad-table-${t.title.split(' ')[0].toLowerCase()}`}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] font-extrabold uppercase tracking-[.12em] flex-1" style={{ color: DIM }}>{t.title} ({t.rows.filter(r => r[1] !== 'Total').length})</span>
        <button className="cad-btn" style={{ height: 24, padding: '0 6px' }} onClick={() => download(t)} disabled={!t.rows.length} title="Download CSV" aria-label={`Download ${t.title} as CSV`}><Download size={12}/></button>
        {onSendTable && <button className="cad-btn" style={{ height: 24, padding: '0 6px' }} onClick={() => onSendTable(t)} disabled={!t.rows.length} title="Add to the document as a table" aria-label={`Add ${t.title} to the document`} data-testid={`cad-send-table-${t.title.split(' ')[0].toLowerCase()}`}><FilePlus2 size={12}/></button>}
      </div>
      {t.rows.length ? <div className="overflow-x-auto rounded-md" style={{ border: '1px solid rgba(255,255,255,.08)' }}>
        <table className="w-full text-[10.5px]" style={{ borderCollapse: 'collapse' }}>
          <thead><tr>{t.columns.map(c => <th key={c} className="text-left px-1.5 py-1 font-semibold whitespace-nowrap" style={{ color: DIM, background: 'rgba(255,255,255,.04)' }}>{c}</th>)}</tr></thead>
          <tbody>{t.rows.map((r, i) => <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,.05)', fontWeight: r[1] === 'Total' ? 700 : 400 }}>{r.map((c, j) => <td key={j} className="px-1.5 py-1 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
        </table>
      </div> : <div className="text-[10.5px]" style={{ color: DIM }}>Nothing yet.</div>}
    </section>)}
  </div>;
}
