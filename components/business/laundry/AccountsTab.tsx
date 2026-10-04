// AccountsTab - commercial / recurring accounts (hotels, gyms, restaurants, salons): terms, negotiated price, standing
// pickup schedules, net-terms INVOICES built from completed tickets, aging, statement, and "mark paid".
// INVOICE-ONLY: payments are recorded here (cash / check / external); Plajah does not collect them.
import React, { useEffect, useState } from 'react';
import { agingBuckets, invoiceBalance, invoiceHtml, statementHtml, type CommercialAccount, type Invoice } from '../../../services/commercialCore';
import { printHtml } from '../../../services/laundryPrint';
import { useLaundry, useRun, Err, Ok, inp, lbl, money, pill, toCents, type ToolProps } from './shared';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
type Draft = Partial<CommercialAccount> & { name: string };
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function AccountsTab({ api, businessName }: ToolProps) {
  const { laundry } = useLaundry(api);
  const { busy, err, msg, setMsg, run } = useRun();
  const [accts, setAccts] = useState<CommercialAccount[]>([]); const [invs, setInvs] = useState<Invoice[]>([]);
  const [edit, setEdit] = useState<Draft | null>(null); const [sel, setSel] = useState('');
  const [period, setPeriod] = useState({ from: iso(Date.now() - 30 * 86_400_000), to: iso(Date.now()) });
  const [pay, setPay] = useState<{ id: string; amount: string; method: string; ref: string } | null>(null);
  const load = () => { if (!laundry) return; laundry.accounts().then(setAccts).catch(() => {}); laundry.invoices().then(setInvs).catch(() => {}); };
  useEffect(load, [laundry]); // eslint-disable-line
  if (!laundry) return <div className="text-xs text-white/40">Not available in this view.</div>;
  const aging = agingBuckets(invs); const acc = accts.find(a => a.id === sel);
  const mine = invs.filter(i => !sel || i.accountId === sel);

  return (
    <div className="space-y-3">
      <Err text={err} /><Ok text={msg} />
      <div className="grid grid-cols-5 gap-1.5 text-center">{([['Current', aging.current], ['1-30', aging.d1_30], ['31-60', aging.d31_60], ['61-90', aging.d61_90], ['90+', aging.d90plus]] as [string, number][]).map(([l, v]) => <div key={l} className="rounded-xl bg-white/5 p-2"><div className={lbl}>{l}</div><div className="font-black text-sm">{money(v)}</div></div>)}</div>
      <div className="flex gap-2 flex-wrap items-center">
        <select value={sel} onChange={e => setSel(e.target.value)} aria-label="Account" className={inp + ' !w-auto'}><option value="">All accounts</option>{accts.map(a => <option key={a.id} value={a.id}>{a.name}{a.active ? '' : ' (inactive)'}</option>)}</select>
        <button onClick={() => setEdit({ name: '', termsDays: 30, taxExempt: false, schedules: [], active: true })} className={pill}>+ New account</button>
        {acc && <button onClick={() => setEdit({ ...acc })} className={pill}>Edit</button>}
        {acc && <button disabled={busy} onClick={() => run(() => laundry.statement(acc.id), s => printHtml(statementHtml(s, { businessName })))} className={pill}>Print statement</button>}
      </div>
      {edit && (
        <div className="rounded-2xl bg-white/5 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Business name *" aria-label="Account name" className={inp + ' col-span-2'} />
            <input value={edit.contactName || ''} onChange={e => setEdit({ ...edit, contactName: e.target.value })} placeholder="Contact" aria-label="Contact" className={inp} />
            <input value={edit.email || ''} onChange={e => setEdit({ ...edit, email: e.target.value })} placeholder="Billing email" aria-label="Billing email" className={inp} />
            <label className="text-xs text-white/50 space-y-1">Price per lb ($, blank = shop price)<input value={edit.pricePerLbCents !== undefined ? (edit.pricePerLbCents / 100).toString() : ''} onChange={e => setEdit({ ...edit, pricePerLbCents: e.target.value === '' ? undefined : toCents(e.target.value) })} inputMode="decimal" className={inp} /></label>
            <label className="text-xs text-white/50 space-y-1">Terms<select value={edit.termsDays ?? 30} onChange={e => setEdit({ ...edit, termsDays: Number(e.target.value) })} className={inp}>{[0, 7, 15, 30, 45].map(n => <option key={n} value={n}>{n === 0 ? 'Due on receipt' : `Net ${n}`}</option>)}</select></label>
            <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={!!edit.taxExempt} onChange={e => setEdit({ ...edit, taxExempt: e.target.checked })} /> Tax exempt (keep the certificate on file)</label>
            <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
          </div>
          <div className={lbl}>Standing pickups</div>
          {(edit.schedules || []).map((s, i) => (
            <div key={s.id} className="rounded-xl bg-white/5 p-2 space-y-1.5">
              <div className="flex gap-1">{DOW.map((d, di) => { const on = s.days.includes(di); return <button key={d} onClick={() => setEdit({ ...edit, schedules: edit.schedules!.map((x, xi) => (xi === i ? { ...x, days: on ? x.days.filter(v => v !== di) : [...x.days, di].sort() } : x)) })} aria-pressed={on} className={`w-8 h-8 rounded-full text-[10px] font-black ${on ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}>{d}</button>; })}
                <button onClick={() => setEdit({ ...edit, schedules: edit.schedules!.filter((_, xi) => xi !== i) })} className="ml-auto text-xs text-white/40 hover:text-[#ff7aa8]">remove</button></div>
              <div className="grid grid-cols-2 gap-1.5"><input type="time" value={s.start} onChange={e => setEdit({ ...edit, schedules: edit.schedules!.map((x, xi) => (xi === i ? { ...x, start: e.target.value } : x)) })} className={inp} aria-label="Window start" /><input type="time" value={s.end} onChange={e => setEdit({ ...edit, schedules: edit.schedules!.map((x, xi) => (xi === i ? { ...x, end: e.target.value } : x)) })} className={inp} aria-label="Window end" />
                <input value={s.address} onChange={e => setEdit({ ...edit, schedules: edit.schedules!.map((x, xi) => (xi === i ? { ...x, address: e.target.value } : x)) })} placeholder="Pickup address" className={inp + ' col-span-2'} aria-label="Pickup address" /></div>
            </div>))}
          <button onClick={() => setEdit({ ...edit, schedules: [...(edit.schedules || []), { id: `s${(edit.schedules?.length || 0) + 1}`, days: [1, 3, 5], start: '08:00', end: '10:00', address: '', active: true }] })} className={pill}>+ Add schedule</button>
          <div className="flex gap-2"><button disabled={busy || !edit.name.trim()} onClick={() => run(() => laundry.saveAccount(edit), a => { setEdit(null); setSel(a.id); setMsg('Account saved.'); load(); })} className="px-4 py-2 rounded-lg text-xs font-black uppercase text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>Save account</button><button onClick={() => setEdit(null)} className={pill}>Cancel</button></div>
        </div>)}
      {acc && (
        <div className="rounded-2xl bg-white/5 p-3 space-y-2">
          <div className={lbl}>Invoice {acc.name}</div>
          <div className="flex gap-2 flex-wrap items-center"><input type="date" value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} className={inp + ' !w-auto'} aria-label="Period from" /><span className="text-white/40 text-xs">to</span><input type="date" value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} className={inp + ' !w-auto'} aria-label="Period to" />
            <button disabled={busy} onClick={() => run(() => laundry.generateInvoice({ accountId: acc.id, periodFrom: period.from, periodTo: period.to }), r => { setMsg(`Created ${r.invoice.number} for ${money(r.invoice.totalCents)}.`); load(); })} className={pill}>Create invoice</button></div>
          <div className="text-[11px] text-white/40">Includes finished tickets that were "charged to account" in that period and are not on another invoice. Invoice only: you collect payment yourself.</div>
        </div>)}
      <div className="space-y-1.5">
        {mine.map(i => (
          <div key={i.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm space-y-1">
            <div className="flex items-center gap-2 flex-wrap"><b>{i.number}</b><span className="truncate">{i.accountName}</span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${i.status === 'PAID' ? 'bg-emerald-400/20 text-emerald-300' : i.status === 'VOID' ? 'bg-white/10 text-white/40' : Date.now() > i.dueAt ? 'bg-[#D40055]/25 text-[#ff7aa8]' : 'bg-white/10 text-white/70'}`}>{i.status === 'OPEN' && Date.now() > i.dueAt ? 'overdue' : i.status.toLowerCase()}</span>
              <span className="ml-auto font-black">{money(invoiceBalance(i))} <span className="text-white/40 font-normal text-xs">of {money(i.totalCents)}</span></span></div>
            <div className="text-[11px] text-white/40">{i.periodFrom} to {i.periodTo} · due {iso(i.dueAt)} · {i.lines.length} ticket(s)</div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => printHtml(invoiceHtml(i, { businessName }))} className={pill}>Print</button>
              {i.status === 'OPEN' && <button onClick={() => setPay({ id: i.id, amount: (invoiceBalance(i) / 100).toFixed(2), method: 'CHECK', ref: '' })} className={pill}>Mark paid</button>}
              {i.status === 'OPEN' && i.paidCents === 0 && <button disabled={busy} onClick={() => { const reason = window.prompt('Why void this invoice?'); if (reason) run(() => laundry.voidInvoice(i.id, reason), () => { setMsg('Invoice voided; its tickets can be invoiced again.'); load(); }); }} className={pill}>Void</button>}
            </div>
            {pay?.id === i.id && <div className="flex gap-1.5 flex-wrap items-center pt-1">
              <input value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" aria-label="Amount received" className={inp + ' !w-24'} />
              <select value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })} aria-label="How it was paid" className={inp + ' !w-28'}><option value="CHECK">Check</option><option value="CASH">Cash</option><option value="EXTERNAL">Bank / other</option></select>
              <input value={pay.ref} onChange={e => setPay({ ...pay, ref: e.target.value })} placeholder="Check # / ref" aria-label="Reference" className={inp + ' !w-32'} />
              <button disabled={busy} onClick={() => run(() => laundry.payInvoice(i.id, { amountCents: toCents(pay.amount), method: pay.method, reference: pay.ref || undefined }), () => { setPay(null); setMsg('Payment recorded.'); load(); })} className={pill}>Record</button>
              <button onClick={() => setPay(null)} className={pill}>Cancel</button></div>}
          </div>))}
        {!mine.length && <div className="text-xs text-white/40">No invoices yet.</div>}
      </div>
    </div>
  );
}
