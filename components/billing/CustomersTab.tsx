import React, { useMemo, useState } from 'react';
import { Plus, Search, Users, FilePlus2, Archive } from 'lucide-react';
import type { BillingCustomer, BillingEntityRef } from '../../types';
import { effectiveStatus, fmtDate, isEmail, saveCustomer, toCents, fromCents, useBillingCustomers, useBillingInvoices } from '../../services/billingService';
import { Busy, Empty, Sheet, SkeletonRows, StatusChip, btnGhost, btnPrimary, card, field, label, money, useToast } from './ui';

export const CustomersTab: React.FC<{ entity: BillingEntityRef; canManage: boolean; onInvoice?: (customerId: string) => void }> = ({ entity, canManage, onInvoice }) => {
  const toast = useToast(); const { rows, loading, error } = useBillingCustomers(entity); const { rows: invs } = useBillingInvoices(entity);
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<Partial<BillingCustomer> | null>(null); const [open, setOpen] = useState<BillingCustomer | null>(null); const [busy, setBusy] = useState(false);
  const stats = useMemo(() => {
    const m = new Map<string, { billed: number; paid: number; due: number }>();
    for (const i of invs) { if (i.status === 'DRAFT' || i.status === 'VOID') continue; const s = m.get(i.customerId) || { billed: 0, paid: 0, due: 0 }; s.billed += toCents(i.total); s.paid += toCents(i.amountPaid); s.due += toCents(i.amountDue); m.set(i.customerId, s); }
    return m;
  }, [invs]);
  const list = rows.filter(c => !c.archived && (!q || `${c.name} ${c.email || ''} ${c.company || ''}`.toLowerCase().includes(q.toLowerCase())));

  const save = async () => {
    if (!edit?.name?.trim()) { toast('Name is required', { tone: 'warn' }); return; }
    if (edit.email && !isEmail(edit.email)) { toast('That email looks off', { tone: 'warn' }); return; }
    setBusy(true);
    try { await saveCustomer(entity, { ...edit, name: edit.name.trim() } as any); toast('Customer saved'); setEdit(null); } catch (e: any) { toast(e?.message || 'Could not save.', { tone: 'bad' }); } finally { setBusy(false); }
  };
  const archive = async (c: BillingCustomer) => { try { await saveCustomer(entity, { ...c, archived: true }); setOpen(null); toast(`${c.name} archived`, { undo: async () => { await saveCustomer(entity, { ...c, archived: false }); } }); } catch (e: any) { toast(e?.message || 'Could not archive.', { tone: 'bad' }); } };
  const set = (k: keyof BillingCustomer, v: string) => setEdit(e => ({ ...(e || {}), [k]: v }));

  if (loading) return <SkeletonRows />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><div className="relative flex-1 min-w-[10rem]"><Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers" aria-label="Search customers" className={field + ' pl-9'} /></div>
        {canManage && <button onClick={() => setEdit({})} className={btnPrimary}><Plus size={13} /> Add customer</button>}</div>
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
      {list.length === 0 ? (rows.length === 0
        ? <div className={`${card} p-10 text-center`}><Users size={28} className="mx-auto text-white/20" /><p className="text-sm font-black text-white mt-3">Add your first customer</p><p className="text-xs text-white/40 mt-1">Or just add them while creating an invoice — they'll show up here.</p></div>
        : <Empty>No customers match.</Empty>) : (
        <ul className="space-y-2">{list.map(c => { const s = stats.get(c.id); return (
          <li key={c.id}><button onClick={() => setOpen(c)} className={`${card} w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.06]`}>
            <div className="w-9 h-9 rounded-full bg-small-orange/15 text-small-orange font-black flex items-center justify-center shrink-0">{c.name.slice(0, 1).toUpperCase()}</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-black text-white truncate">{c.name}</p><p className="text-[10px] text-white/40 truncate">{c.email || c.company || 'No email'}{c.plajahUid ? ' · on Plajah' : ''}</p></div>
            {s && <div className="text-right"><p className="text-xs font-black text-white tabular-nums">{money(fromCents(s.billed))}</p>{s.due > 0 && <p className="text-[10px] text-amber-300 tabular-nums">{money(fromCents(s.due))} due</p>}</div>}
          </button></li>); })}</ul>
      )}
      {edit && (
        <Sheet title={edit.id ? 'Edit customer' : 'New customer'} onClose={() => setEdit(null)}>
          <div className="space-y-2">
            <input autoFocus value={edit.name || ''} onChange={e => set('name', e.target.value)} placeholder="Name" aria-label="Name" className={field} />
            <input value={edit.company || ''} onChange={e => set('company', e.target.value)} placeholder="Company (optional)" aria-label="Company" className={field} />
            <input value={edit.email || ''} onChange={e => set('email', e.target.value)} placeholder="Email" inputMode="email" aria-label="Email" className={field} />
            <input value={edit.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="Phone" inputMode="tel" aria-label="Phone" className={field} />
            <textarea value={edit.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Private notes" aria-label="Notes" className={field} />
            <button onClick={save} disabled={busy} className={btnPrimary + ' w-full'}><Busy on={busy}>Save customer</Busy></button>
          </div>
        </Sheet>
      )}
      {open && (() => { const mine = invs.filter(i => i.customerId === open.id); const s = stats.get(open.id) || { billed: 0, paid: 0, due: 0 }; return (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <p className="text-xs text-white/50">{[open.company, open.email, open.phone].filter(Boolean).join(' · ') || 'No contact details yet'}</p>
          <div className="grid grid-cols-3 gap-2 my-4 text-center">{[['Billed', s.billed], ['Paid', s.paid], ['Due', s.due]].map(([l, v]) => <div key={l as string} className="bg-black/30 rounded-2xl py-3"><p className={label}>{l}</p><p className="text-sm font-black text-white tabular-nums">{money(fromCents(v as number))}</p></div>)}</div>
          <p className={label}>History</p>
          {mine.length === 0 ? <p className="text-[11px] text-white/30 py-3">No invoices yet.</p> : <ul className="divide-y divide-white/5">{mine.slice(0, 20).map(i => <li key={i.id} className="py-2 flex items-center gap-2 text-xs"><span className="text-white/70 flex-1 truncate">{i.number || 'Draft'} · {fmtDate(i.issueDate)}</span><StatusChip status={effectiveStatus(i)} /><span className="tabular-nums text-white w-20 text-right">{money(i.total)}</span></li>)}</ul>}
          {open.notes && <p className="text-[11px] text-white/40 mt-3 whitespace-pre-wrap">{open.notes}</p>}
          {canManage && <div className="flex flex-wrap gap-2 mt-5">{onInvoice && <button onClick={() => { onInvoice(open.id); setOpen(null); }} className={btnPrimary}><FilePlus2 size={12} /> New invoice</button>}
            <button onClick={() => { setEdit(open); setOpen(null); }} className={btnGhost}>Edit</button><button onClick={() => archive(open)} className={btnGhost}><Archive size={12} /> Archive</button></div>}
        </Sheet>); })()}
    </div>
  );
};
export default CustomersTab;
