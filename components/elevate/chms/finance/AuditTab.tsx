// Audit — immutable trail of who entered / voided / approved / exported what, and when.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { fetchFinAudit, type FinAuditEntry } from '../../../../services/chmsFinance';
import { card, fieldSm, heading, DataTable, Empty, Pill, type TabProps } from './shared';

const tone = (a: string) => /VOID|OVERRIDE|REJECT/.test(a) ? 'bad' : /APPROV|EXPORT|SETTINGS/.test(a) ? 'warn' : 'info';

const AuditTab: React.FC<TabProps> = ({ org }) => {
  const [rows, setRows] = useState<FinAuditEntry[] | null>(null);
  const [f, setF] = useState('');
  useEffect(() => { fetchFinAudit(org.id).then(setRows); }, [org.id]);
  const shown = useMemo(() => (rows || []).filter(r => !f || `${r.action} ${r.actorName} ${r.target || ''}`.toLowerCase().includes(f.toLowerCase())), [rows, f]);
  if (!rows) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-white/30" size={20} /></div>;
  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h3 className={`${heading} !mb-0 flex-1`}><ShieldCheck size={12} className="inline mr-1.5" />Immutable audit trail</h3>
          <input value={f} onChange={e => setF(e.target.value)} placeholder="Filter: VOID, name, batch…" className={`${fieldSm} w-56`} />
        </div>
        <p className="text-[10px] text-white/30 mb-3">Entries can be created but never edited or deleted (enforced by Firestore rules). Showing the latest {rows.length}.</p>
        {shown.length === 0 ? <Empty>No audit entries.</Empty> : (
          <div className="space-y-1 max-h-[520px] overflow-y-auto">
            {shown.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03]">
                <span className="text-white/40 w-36 shrink-0">{new Date(r.timestamp).toLocaleString()}</span>
                <Pill tone={tone(r.action)}>{r.action.replace('FIN_', '').replace(/_/g, ' ')}</Pill>
                <span className="text-white flex-1 min-w-[140px] truncate">{r.target || ''}</span>
                <span className="text-white/50">{r.actorName || r.actorUid.slice(0, 6)}</span>
                {r.meta && Object.keys(r.meta).length > 0 && <span className="text-[10px] text-white/30 max-w-[260px] truncate" title={JSON.stringify(r.meta)}>{Object.entries(r.meta).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <DataTable auditExport={false} table={{ title: 'Audit trail export', headers: ['When', 'Who', 'Action', 'Target', 'Detail'], rows: shown.map(r => [new Date(r.timestamp).toISOString(), r.actorName || r.actorUid, r.action, r.target || '', JSON.stringify(r.meta || {})]) }} maxRows={0} />
    </div>
  );
};

export default AuditTab;
