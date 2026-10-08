import React, { useState } from 'react';
import { Plus, BookOpen, Power } from 'lucide-react';
import type { BillingEntityRef, BillingItem } from '../../types';
import { saveItem, useBillingItems } from '../../services/billingService';
import { Busy, Pill, Sheet, SkeletonRows, btnGhost, btnPrimary, card, field, money, useToast } from './ui';

export const PriceBookTab: React.FC<{ entity: BillingEntityRef; canManage: boolean }> = ({ entity, canManage }) => {
  const toast = useToast(); const { rows, loading, error } = useBillingItems(entity);
  const [edit, setEdit] = useState<(Partial<BillingItem> & { price?: string }) | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    const price = parseFloat(edit?.price ?? String(edit?.unitAmount ?? ''));
    if (!edit?.name?.trim()) { toast('Name is required', { tone: 'warn' }); return; }
    if (!(price >= 0)) { toast('Enter a price', { tone: 'warn' }); return; }
    setBusy(true);
    try { const { price: _p, ...rest } = edit; await saveItem(entity, { ...rest, name: edit.name.trim(), unitAmount: price } as any); toast('Saved to price book'); setEdit(null); } catch (e: any) { toast(e?.message || 'Could not save.', { tone: 'bad' }); } finally { setBusy(false); }
  };
  const toggle = async (it: BillingItem) => { try { await saveItem(entity, { ...it, active: !it.active }); toast(it.active ? 'Hidden from invoices' : 'Back on invoices', { undo: async () => { await saveItem(entity, { ...it }); } }); } catch (e: any) { toast(e?.message || 'Could not update.', { tone: 'bad' }); } };
  if (loading) return <SkeletonRows />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><p className="text-xs text-white/50">Reusable products and services — drop them into any invoice in one tap.</p>{canManage && <button onClick={() => setEdit({ active: true })} className={btnPrimary}><Plus size={13} /> Add item</button>}</div>
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
      {rows.length === 0 ? <div className={`${card} p-10 text-center`}><BookOpen size={28} className="mx-auto text-white/20" /><p className="text-sm font-black text-white mt-3">Build your price book</p><p className="text-xs text-white/40 mt-1">Add what you sell — "Mixing session, $150/hr" — and invoices write themselves.</p></div> : (
        <ul className="space-y-2">{rows.map(it => (
          <li key={it.id} className={`${card} px-4 py-3 flex items-center gap-3 ${it.active ? '' : 'opacity-50'}`}>
            <button onClick={() => canManage && setEdit({ ...it, price: String(it.unitAmount) })} className="flex-1 min-w-0 text-left"><p className="text-sm font-black text-white truncate">{it.name}</p><p className="text-[10px] text-white/40 truncate">{it.description || (it.unit ? `per ${it.unit}` : '')}{it.taxable ? ' · taxable' : ''}</p></button>
            {!it.active && <Pill>Hidden</Pill>}
            <p className="text-sm font-black text-white tabular-nums">{money(it.unitAmount)}{it.unit ? <span className="text-[10px] text-white/40 font-bold"> /{it.unit}</span> : null}</p>
            {canManage && <button onClick={() => toggle(it)} aria-label={it.active ? 'Hide item' : 'Show item'} className="p-2 text-white/40 hover:text-white"><Power size={14} /></button>}
          </li>))}</ul>
      )}
      {edit && (
        <Sheet title={edit.id ? 'Edit item' : 'New item'} onClose={() => setEdit(null)}>
          <div className="space-y-2">
            <input autoFocus value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Name" aria-label="Name" className={field} />
            <input value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} placeholder="Description (optional)" aria-label="Description" className={field} />
            <div className="grid grid-cols-2 gap-2"><input type="number" min={0} step="0.01" inputMode="decimal" value={edit.price ?? ''} onChange={e => setEdit({ ...edit, price: e.target.value })} placeholder="Price ($)" aria-label="Price" className={field} />
              <select value={edit.unit || ''} onChange={e => setEdit({ ...edit, unit: e.target.value || undefined })} aria-label="Unit" className={field}><option value="">each</option><option value="hour">per hour</option><option value="day">per day</option><option value="session">per session</option><option value="month">per month</option></select></div>
            <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={!!edit.taxable} onChange={e => setEdit({ ...edit, taxable: e.target.checked })} /> Taxable by default</label>
            <button onClick={save} disabled={busy} className={btnPrimary + ' w-full'}><Busy on={busy}>Save item</Busy></button>
            {edit.id && <button onClick={() => setEdit(null)} className={btnGhost + ' w-full'}>Cancel</button>}
          </div>
        </Sheet>
      )}
    </div>
  );
};
export default PriceBookTab;
