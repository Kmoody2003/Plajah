import React, { useMemo, useRef, useState } from 'react';
import { Plus, Search, Send, Bell, Ban, Copy, Download, CopyPlus, BadgeCheck, FileText, RefreshCw, Pencil, X } from 'lucide-react';
import type { BillingEntityRef, Invoice, InvoiceStatus } from '../../types';
import { billingApi, copyText, effectiveStatus, fmtDate, summarize, useBillingInvoices } from '../../services/billingService';
import { useDeferred } from '../elevate/chms/finance/SpendingUi';
import { InvoiceComposer } from './InvoiceComposer';
import { Busy, Empty, Sheet, SkeletonRows, StatusChip, btnGhost, btnPrimary, card, field, fieldSm, label, money, useHotkeys, useToast } from './ui';

const FILTERS: ('ALL' | InvoiceStatus)[] = ['ALL', 'DRAFT', 'OPEN', 'OVERDUE', 'PARTIAL', 'PAID', 'VOID'];

export const InvoicesTab: React.FC<{ entity: BillingEntityRef; entityName: string; logoUrl?: string; canManage: boolean; presetCustomerId?: string }> = ({ entity, entityName, logoUrl, canManage, presetCustomerId }) => {
  const toast = useToast(); const defer = useDeferred();
  const { rows, loading, error } = useBillingInvoices(entity);
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<'ALL' | InvoiceStatus>('ALL');
  const [composer, setComposer] = useState<Invoice | 'new' | null>(presetCustomerId ? 'new' : null);
  const [open, setOpen] = useState<Invoice | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkeys({ n: () => canManage && setComposer('new'), '/': () => searchRef.current?.focus() }, !composer && !open);

  const withStatus = useMemo(() => rows.map(r => ({ ...r, eff: effectiveStatus(r) })), [rows]);
  const list = withStatus.filter(r => (filter === 'ALL' || r.eff === filter) && (!q || `${r.number} ${r.customerName} ${r.memo || ''}`.toLowerCase().includes(q.toLowerCase())));
  const sum = useMemo(() => summarize(rows), [rows]);
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const act = async (a: 'send' | 'remind' | 'duplicate' | 'sync', inv: Invoice, ok: string) => {
    setBusy(true);
    try { await billingApi.invoiceAction(a, entity, inv.id); toast(ok); } catch (e: any) { toast(e?.message || 'That did not go through — nothing was changed.', { tone: 'bad' }); } finally { setBusy(false); }
  };
  const voidInv = (inv: Invoice) => { setOpen(null); defer(`Voiding ${inv.number}…`, () => billingApi.invoiceAction('void', entity, inv.id), () => { /* undo = nothing committed yet */ }); };
  const bulk = async (a: 'remind' | 'void') => {
    const targets = rows.filter(r => sel.has(r.id)); setBusy(true); let ok = 0;
    for (const t of targets) { try { await billingApi.invoiceAction(a, entity, t.id); ok++; } catch { /* continue */ } }
    setBusy(false); setSel(new Set()); toast(`${a === 'remind' ? 'Reminded' : 'Voided'} ${ok} of ${targets.length}`, { tone: ok === targets.length ? 'ok' : 'warn' });
  };
  const exportCsv = () => {
    const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['Number,Customer,Status,Issued,Due,Total,Due amount', ...list.map(r => [r.number, r.customerName, r.eff, r.issueDate, r.dueDate, r.total, r.amountDue].map(esc).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'invoices.csv'; a.click();
  };

  if (loading) return <SkeletonRows />;
  return (
    <div className="space-y-4">
      {/* aging */}
      {sum.openCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="Aging summary">
          {sum.aging.map(a => <div key={a.bucket} className={`${card} px-4 py-3`}><p className={label}>{a.bucket}</p><p className={`text-lg font-black tabular-nums ${a.bucket !== 'Current' && a.amount > 0 ? 'text-red-400' : 'text-white'}`}>{money(a.amount)}</p><p className="text-[10px] text-white/30">{a.count} invoice{a.count === 1 ? '' : 's'}</p></div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[10rem]"><Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" /><input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search invoices  ( / )" aria-label="Search invoices" className={field + ' pl-9'} /></div>
        <button onClick={exportCsv} className={btnGhost} disabled={!list.length}><Download size={12} /> CSV</button>
        {canManage && <button onClick={() => setComposer('new')} className={btnPrimary}><Plus size={13} /> New invoice</button>}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
        {FILTERS.map(f => { const n = f === 'ALL' ? withStatus.length : withStatus.filter(r => r.eff === f).length; return (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${filter === f ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 text-white/60 border-white/10'}`}>{f === 'ALL' ? 'All' : f.toLowerCase()} {n > 0 && <span className="opacity-60">{n}</span>}</button>); })}
      </div>

      {sel.size > 0 && canManage && (
        <div className={`${card} px-4 py-3 flex flex-wrap items-center gap-2`} role="toolbar" aria-label="Bulk actions">
          <p className="text-xs font-black text-white mr-auto">{sel.size} selected</p>
          <button disabled={busy} onClick={() => bulk('remind')} className={btnGhost}><Bell size={12} /> Remind</button>
          <button disabled={busy} onClick={() => bulk('void')} className={btnGhost}><Ban size={12} /> Void</button>
          <button onClick={() => setSel(new Set())} aria-label="Clear selection" className="p-2 text-white/40"><X size={14} /></button>
        </div>
      )}

      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
      {list.length === 0 ? (
        rows.length === 0 ? (
          <div className={`${card} p-10 text-center`}><FileText size={28} className="mx-auto text-white/20" /><p className="text-sm font-black text-white mt-3">Send your first invoice</p><p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">Pick a customer, add what you did, hit send. They pay by card or bank, and the money lands in your Stripe account.</p>
            {canManage && <button onClick={() => setComposer('new')} className={btnPrimary + ' mt-5'}><Plus size={13} /> Create invoice</button>}</div>
        ) : <Empty>No invoices match. Try a different filter or search.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map(r => (
            <li key={r.id} className={`${card} px-4 py-3 flex items-center gap-3 hover:bg-white/[0.06]`}>
              {canManage && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.number}`} />}
              <button onClick={() => setOpen(r)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-black text-white truncate">{r.customerName}</p><StatusChip status={r.eff} /></div>
                <p className="text-[10px] text-white/40 mt-0.5">{r.number || 'Draft'} · {r.status === 'PAID' ? `paid ${r.paidAt ? new Date(r.paidAt).toLocaleDateString() : ''}` : `due ${fmtDate(r.dueDate)}`}{r.recurring ? ' · repeats' : ''}</p>
              </button>
              <div className="text-right shrink-0"><p className="text-sm font-black text-white tabular-nums">{money(r.total, r.currency)}</p>{r.amountDue > 0 && r.amountDue !== r.total && <p className="text-[10px] text-amber-300 tabular-nums">{money(r.amountDue)} due</p>}</div>
            </li>
          ))}
        </ul>
      )}

      {composer && <InvoiceComposer entity={entity} entityName={entityName} logoUrl={logoUrl} initial={composer === 'new' ? null : composer} presetCustomerId={presetCustomerId} onDone={() => setComposer(null)} onCancel={() => setComposer(null)} />}
      {open && !composer && <InvoiceDetail inv={open} entity={entity} canManage={canManage} busy={busy}
        onClose={() => setOpen(null)} onEdit={() => { setComposer(open); setOpen(null); }} onAct={async (a, ok) => { await act(a, open, ok); setOpen(null); }} onVoid={() => voidInv(open)} />}
    </div>
  );
};

const InvoiceDetail: React.FC<{ inv: Invoice; entity: BillingEntityRef; canManage: boolean; busy: boolean; onClose: () => void; onEdit: () => void; onAct: (a: 'send' | 'remind' | 'duplicate' | 'sync', ok: string) => void; onVoid: () => void }> = ({ inv, entity, canManage, busy, onClose, onEdit, onAct, onVoid }) => {
  const toast = useToast(); const eff = effectiveStatus(inv);
  const [paying, setPaying] = useState(false); const [reason, setReason] = useState(''); const [working, setWorking] = useState(false);
  const live = eff === 'OPEN' || eff === 'PARTIAL' || eff === 'OVERDUE';
  const markPaid = async () => {
    if (!reason.trim()) { toast('Add a short reason (e.g. "Cash, 3/2")', { tone: 'warn' }); return; }
    setWorking(true);
    try { await billingApi.invoiceAction('mark-paid', entity, inv.id, { reason: reason.trim() }); toast('Marked as paid'); onClose(); } catch (e: any) { toast(e?.message || 'Could not mark paid.', { tone: 'bad' }); } finally { setWorking(false); }
  };
  const pdf = async () => { try { window.open(inv.pdfUrl || await billingApi.invoicePdf(entity, inv.id), '_blank'); } catch (e: any) { toast(e?.message || 'PDF not ready.', { tone: 'bad' }); } };
  return (
    <Sheet title={`${inv.number || 'Draft invoice'} · ${inv.customerName}`} onClose={onClose}>
      <div className="flex items-center gap-2 mb-3"><StatusChip status={eff} /><span className="text-[10px] text-white/40">Issued {fmtDate(inv.issueDate)} · Due {fmtDate(inv.dueDate)}</span></div>
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        {[['Total', inv.total], ['Paid', inv.amountPaid], ['Due', inv.amountDue]].map(([l, v]) => <div key={l as string} className="bg-black/30 rounded-2xl py-3"><p className={label}>{l}</p><p className="text-sm font-black text-white tabular-nums">{money(v as number, inv.currency)}</p></div>)}
      </div>
      <ul className="text-xs text-white/70 divide-y divide-white/5 mb-4">{inv.lines.map((l, i) => <li key={i} className="py-1.5 flex justify-between gap-3"><span>{l.quantity} × {l.description}</span><span className="tabular-nums">{money(l.quantity * l.unitAmount)}</span></li>)}</ul>
      <p className="text-[10px] text-white/30 mb-4">{inv.sentAt ? `Sent ${new Date(inv.sentAt).toLocaleString()}` : 'Not sent yet'}{inv.viewedAt ? ` · viewed ${new Date(inv.viewedAt).toLocaleString()}` : ''}{inv.paidAt ? ` · paid ${new Date(inv.paidAt).toLocaleString()}` : ''}{inv.offlinePayment ? ` · offline: ${inv.offlinePayment.reason}` : ''}</p>
      {paying ? (
        <div className="space-y-2"><input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason / how they paid (cash, check #…)" aria-label="Reason" className={field} />
          <div className="flex gap-2"><button onClick={markPaid} disabled={working} className={btnPrimary}><Busy on={working}><BadgeCheck size={12} /> Confirm paid</Busy></button><button onClick={() => setPaying(false)} className={btnGhost}>Cancel</button></div></div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canManage && eff === 'DRAFT' && <><button onClick={onEdit} className={btnGhost}><Pencil size={12} /> Edit</button><button disabled={busy} onClick={() => onAct('send', 'Invoice sent')} className={btnPrimary}><Send size={12} /> Send</button></>}
          {canManage && live && <button disabled={busy} onClick={() => onAct('remind', 'Reminder sent')} className={btnPrimary}><Bell size={12} /> Remind</button>}
          {inv.hostedUrl && <button onClick={async () => toast((await copyText(inv.hostedUrl!)) ? 'Link copied' : 'Copy failed', { tone: 'info' })} className={btnGhost}><Copy size={12} /> Copy link</button>}
          {eff !== 'DRAFT' && <button onClick={pdf} className={btnGhost}><Download size={12} /> PDF</button>}
          {canManage && <button disabled={busy} onClick={() => onAct('duplicate', 'Duplicated as a new draft')} className={btnGhost}><CopyPlus size={12} /> Duplicate</button>}
          {canManage && live && <button onClick={() => setPaying(true)} className={btnGhost}><BadgeCheck size={12} /> Mark paid (offline)</button>}
          {canManage && inv.stripeInvoiceId && <button disabled={busy} onClick={() => onAct('sync', 'Synced with Stripe')} className={btnGhost}><RefreshCw size={12} /> Sync</button>}
          {canManage && (live || eff === 'DRAFT') && <button onClick={onVoid} className={btnGhost + ' text-red-300'}><Ban size={12} /> {eff === 'DRAFT' ? 'Delete draft' : 'Void'}</button>}
        </div>
      )}
    </Sheet>
  );
};
export default InvoicesTab;
