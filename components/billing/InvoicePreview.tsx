import React from 'react';
import type { InvoiceLine } from '../../types';
import { fmtDate, formatMoney, lineAmount, type Totals } from '../../services/billingService';

export interface PreviewData {
  kind: 'invoice' | 'estimate'; number?: string; entityName: string; logoUrl?: string;
  customerName?: string; customerEmail?: string; issueDate?: string; dueDate?: string; validUntil?: string;
  lines: InvoiceLine[]; totals: Totals; memo?: string; footer?: string; poNumber?: string; currency?: string;
  schedule?: { label: string; amount: number; dueDate: string }[]; amountPaid?: number;
}

/** Light "paper" preview of the hosted look — intentionally always light so it reads like the real document. */
export const InvoicePreview: React.FC<{ d: PreviewData }> = ({ d }) => {
  const m = (n: number) => formatMoney(n, d.currency || 'usd');
  const title = d.kind === 'estimate' ? 'Estimate' : 'Invoice';
  return (
    <div className="bg-white text-zinc-900 rounded-2xl shadow-xl p-5 sm:p-7 text-[11px] leading-relaxed" aria-label={`${title} preview`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {d.logoUrl ? <img src={d.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-black">{(d.entityName || '?').slice(0, 1).toUpperCase()}</div>}
          <p className="font-black text-sm truncate">{d.entityName || 'Your business'}</p>
        </div>
        <div className="text-right shrink-0"><p className="font-black text-lg tracking-tight uppercase">{title}</p><p className="text-zinc-500">{d.number || 'Draft'}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div><p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Bill to</p><p className="font-bold">{d.customerName || '—'}</p>{d.customerEmail && <p className="text-zinc-500 break-all">{d.customerEmail}</p>}</div>
        <div className="text-right space-y-0.5">
          {d.issueDate && <p><span className="text-zinc-400">Issued</span> {fmtDate(d.issueDate)}</p>}
          {d.dueDate && <p><span className="text-zinc-400">Due</span> <b>{fmtDate(d.dueDate)}</b></p>}
          {d.validUntil && <p><span className="text-zinc-400">Valid until</span> <b>{fmtDate(d.validUntil)}</b></p>}
          {d.poNumber && <p><span className="text-zinc-400">PO</span> {d.poNumber}</p>}
        </div>
      </div>
      <table className="w-full mt-6">
        <thead><tr className="text-[9px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-200"><th className="text-left py-1.5">Description</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {d.lines.filter(l => l.description || l.unitAmount).map((l, i) => (
            <tr key={i} className="border-b border-zinc-100 align-top"><td className="py-1.5 pr-2">{l.description || '—'}</td><td className="text-right tabular-nums">{l.quantity}</td><td className="text-right tabular-nums">{m(l.unitAmount)}</td><td className="text-right tabular-nums">{m(lineAmount(l))}</td></tr>
          ))}
          {d.lines.every(l => !l.description && !l.unitAmount) && <tr><td colSpan={4} className="py-4 text-center text-zinc-400">Add a line item to see it here</td></tr>}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-full sm:w-2/3 space-y-1 tabular-nums">
        <div className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span>{m(d.totals.subtotal)}</span></div>
        {d.totals.discount > 0 && <div className="flex justify-between"><span className="text-zinc-500">Discount</span><span>−{m(d.totals.discount)}</span></div>}
        {d.totals.tax > 0 && <div className="flex justify-between"><span className="text-zinc-500">Tax</span><span>{m(d.totals.tax)}</span></div>}
        <div className="flex justify-between border-t border-zinc-300 pt-1.5 text-sm font-black"><span>Total</span><span>{m(d.totals.total)}</span></div>
        {!!d.amountPaid && <div className="flex justify-between text-zinc-500"><span>Paid</span><span>−{m(d.amountPaid)}</span></div>}
      </div>
      {d.schedule && d.schedule.length > 0 && (
        <div className="mt-5"><p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Payment schedule</p>
          {d.schedule.map((s, i) => <div key={i} className="flex justify-between py-0.5"><span>{s.label || `Payment ${i + 1}`} · {fmtDate(s.dueDate)}</span><span className="tabular-nums">{m(s.amount)}</span></div>)}
        </div>
      )}
      {d.memo && <p className="mt-5 whitespace-pre-wrap text-zinc-600">{d.memo}</p>}
      {d.footer && <p className="mt-4 pt-3 border-t border-zinc-100 whitespace-pre-wrap text-zinc-400">{d.footer}</p>}
    </div>
  );
};
export default InvoicePreview;
