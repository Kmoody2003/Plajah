import React, { useState } from 'react';
import { Plus, Send, Copy, ArrowRightLeft, Pencil, FileText } from 'lucide-react';
import type { BillingEntityRef, Estimate } from '../../types';
import { billingApi, copyText, fmtDate, useBillingEstimates } from '../../services/billingService';
import { InvoiceComposer } from './InvoiceComposer';
import { Busy, EstimateChip, Empty, SkeletonRows, btnGhost, btnPrimary, card, money, useToast } from './ui';

export const EstimatesTab: React.FC<{ entity: BillingEntityRef; entityName: string; logoUrl?: string; canManage: boolean; onConverted?: () => void }> = ({ entity, entityName, logoUrl, canManage, onConverted }) => {
  const toast = useToast(); const { rows, loading, error } = useBillingEstimates(entity);
  const [composer, setComposer] = useState<Estimate | 'new' | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => { setBusy(id); try { await fn(); toast(ok); } catch (e: any) { toast(e?.message || 'That did not go through.', { tone: 'bad' }); } finally { setBusy(null); } };
  const link = (e: Estimate) => e.acceptToken ? `${window.location.origin}/estimate/${e.acceptToken}` : '';
  if (loading) return <SkeletonRows />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><p className="text-xs text-white/50">Quotes your customers can accept in one tap, then you convert to an invoice.</p>
        {canManage && <button onClick={() => setComposer('new')} className={btnPrimary}><Plus size={13} /> New estimate</button>}</div>
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
      {rows.length === 0 ? (
        <div className={`${card} p-10 text-center`}><FileText size={28} className="mx-auto text-white/20" /><p className="text-sm font-black text-white mt-3">No estimates yet</p><p className="text-xs text-white/40 mt-1">Quote a job before you start. When they accept, convert it to an invoice with one tap.</p></div>
      ) : (
        <ul className="space-y-2">{rows.map(e => (
          <li key={e.id} className={`${card} px-4 py-3`}>
            <div className="flex items-center gap-3"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-black text-white truncate">{e.customerName}</p><EstimateChip status={e.status} /></div>
              <p className="text-[10px] text-white/40 mt-0.5">{e.number || 'Draft'}{e.validUntil ? ` · valid until ${fmtDate(e.validUntil)}` : ''}</p></div>
              <p className="text-sm font-black text-white tabular-nums">{money(e.total)}</p></div>
            {canManage && (
              <div className="flex flex-wrap gap-2 mt-3">
                {e.status === 'DRAFT' && <><button onClick={() => setComposer(e)} className={btnGhost}><Pencil size={12} /> Edit</button>
                  <button disabled={busy === e.id} onClick={() => run(e.id, () => billingApi.sendEstimate(entity, e.id), 'Estimate sent')} className={btnPrimary}><Busy on={busy === e.id}><Send size={12} /> Send</Busy></button></>}
                {link(e) && ['SENT', 'ACCEPTED'].includes(e.status) && <button onClick={async () => toast((await copyText(link(e))) ? 'Accept link copied' : 'Copy failed', { tone: 'info' })} className={btnGhost}><Copy size={12} /> Copy accept link</button>}
                {(e.status === 'ACCEPTED' || e.status === 'SENT') && <button disabled={busy === e.id} onClick={() => run(e.id, async () => { await billingApi.convertEstimate(entity, e.id); onConverted?.(); }, 'Converted — find it in Invoices as a draft')} className={e.status === 'ACCEPTED' ? btnPrimary : btnGhost}><Busy on={busy === e.id}><ArrowRightLeft size={12} /> Convert to invoice</Busy></button>}
              </div>
            )}
          </li>))}
        </ul>
      )}
      {rows.length > 0 && rows.every(r => r.status === 'CONVERTED') && <Empty>Everything is converted. Nice.</Empty>}
      {composer && <InvoiceComposer mode="estimate" entity={entity} entityName={entityName} logoUrl={logoUrl} initial={composer === 'new' ? null : composer} onDone={() => setComposer(null)} onCancel={() => setComposer(null)} />}
    </div>
  );
};
export default EstimatesTab;
