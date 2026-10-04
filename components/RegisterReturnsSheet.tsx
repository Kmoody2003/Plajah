// RegisterReturnsSheet - the Returns flow: find a recent POS order (order number, customer, amount, or a
// scanned receipt code), pick lines + quantities (+ restock toggle), choose how to refund, give a reason.
// The preview uses the same pure planRefund() the server runs; the server is authoritative and also
// enforces the manager-PIN rule for big refunds.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchPosOrders, fetchRefunds, posRefund } from '../services/registerService';
import { planRefund, REFUND_REASONS, REFUND_REASON_LABEL, refundedSoFar, type OrderLine, type RefundMethod, type RefundRecord } from '../services/refundCore';
import { parseTenders } from '../services/tenderCore';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const jp = (v: any, d: any) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? d); } catch { return d; } };

const linesOf = (o: any): OrderLine[] => (jp(o.items, []) as any[]).map(i => ({
  productId: String(i.productId || ''), variantId: i.variantId || null, title: String(i.title || 'Item') + (i.variantName ? ` (${i.variantName})` : ''), qty: Math.max(1, Number(i.qty) || 1),
  chargeCents: i.chargeCents !== undefined ? Number(i.chargeCents) : Number(i.unitAmount || 0) * Math.max(1, Number(i.qty) || 1), taxCents: Number(i.taxCents) || 0,
}));

export default function RegisterReturnsSheet({ businessUid, token, onClose, onDone }: { businessUid: string; token?: string | null; onClose: () => void; onDone?: (amountCents: number) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<any | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [method, setMethod] = useState<RefundMethod>('ORIGINAL');
  const [reason, setReason] = useState('CUSTOMER_RETURN');
  const [mgrPin, setMgrPin] = useState('');
  const [needMgr, setNeedMgr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ amountCents: number; restocked: number; credits: { kind: string; last4: string; amountCents: number; code: string | null; restoredToOriginal: boolean }[] } | null>(null);
  const keyRef = useRef(`${Date.now()}${Math.random().toString(36).slice(2, 8)}`);   // idempotency key: a retry of THIS return can never double-refund

  useEffect(() => { Promise.all([fetchPosOrders(businessUid), fetchRefunds(businessUid)]).then(([o, r]) => { setOrders(o); setRefunds(r); setLoading(false); }); }, [businessUid]);

  const found = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^.*\//, '');
    const list = !s ? orders : orders.filter(o => String(o.id).toLowerCase().includes(s) || String(o.customerUid || '').toLowerCase().includes(s) || String(((o.paidCents ?? o.totalCents) || 0) / 100).includes(s));
    return list.slice(0, 12);
  }, [orders, q]);

  const prior: RefundRecord[] = useMemo(() => picked ? refunds.filter(r => r.orderId === picked.id).map(r => ({ lines: jp(r.lines, []), allocations: jp(r.allocations, []) })) : [], [picked, refunds]);
  const lines = useMemo(() => picked ? linesOf(picked) : [], [picked]);
  const done = useMemo(() => refundedSoFar(lines, prior), [lines, prior]);

  const preview = useMemo(() => {
    if (!picked) return null;
    const req = Object.entries(qty).filter(([, v]) => v > 0).map(([i, v]) => ({ index: Number(i), qty: v, restock: !!restock[Number(i)] }));
    if (!req.length) return null;
    return planRefund({ lines, tenders: parseTenders(picked.tenders, picked.tender, Number(picked.paidCents ?? picked.totalCents) || 0) }, prior, { lines: req, method });
  }, [picked, qty, restock, method, lines, prior]);

  async function submit() {
    if (!picked || !preview || preview.ok === false || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await posRefund({
        businessUid, orderId: picked.id, method, reason, idempotencyKey: keyRef.current,
        lines: Object.entries(qty).filter(([, v]) => v > 0).map(([i, v]) => ({ index: Number(i), qty: v, restock: !!restock[Number(i)] })),
        ...(mgrPin ? { managerPin: mgrPin } : {}),
      }, token);
      setResult({ amountCents: r.amountCents, restocked: r.restocked, credits: r.credits || [] }); onDone?.(r.amountCents);
    } catch (e: any) {
      if (e?.code === 'MANAGER_PIN') setNeedMgr(e.message);
      setErr(e?.message || 'Refund failed.');
    }
    setBusy(false);
  }

  const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 w-full';
  return createPortal(
    <div className="fixed inset-0 z-[210] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Returns">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121a] border border-white/10 text-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-black italic" style={{ fontFamily: 'Outfit, sans-serif' }}>Returns</div>
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Close</button>
        </div>

        {result ? (
          <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/30 p-4 space-y-1">
            <div className="font-black text-emerald-200">Refunded {money(result.amountCents)}</div>
            {result.credits.map((c, i) => (
              <div key={i} className="rounded-lg bg-white/5 p-2 text-xs">
                <div className="font-black text-emerald-200">{c.restoredToOriginal ? `${money(c.amountCents)} put back on the original card ...${c.last4}` : `${money(c.amountCents)} store credit issued ...${c.last4}`}</div>
                {c.code && <div className="font-mono text-sm font-black mt-1">{c.code}<div className="font-sans text-[10px] text-white/50 font-normal">Bearer credit - write this code on the receipt or tell the customer; it is shown only once.</div></div>}
                {!c.code && !c.restoredToOriginal && <div className="text-white/50">Added to the customer's account credit; they can use it as a Store credit tender.</div>}
              </div>
            ))}
            <div className="text-xs text-white/60">{result.credits.length ? '' : method === 'CASH' ? 'Hand the customer cash from the drawer.' : 'Return it to the original payment (cash from the drawer; card / EBT on your terminal).'}{result.restocked ? ` ${result.restocked} item line(s) put back in stock.` : ''}</div>
          </div>
        ) : !picked ? (
          <div className="space-y-2">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Order number, scan receipt, customer or amount" className={inp} aria-label="Find order" />
            {loading ? <div className="text-white/40 text-sm text-center py-6">Loading recent sales...</div> : found.length === 0 ? <div className="text-white/40 text-sm text-center py-6">No matching sales.</div> :
              found.map(o => (
                <button key={o.id} onClick={() => { setPicked(o); setErr(''); }} className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 p-3 flex justify-between gap-3">
                  <span className="min-w-0"><span className="block text-xs font-black truncate">{String(o.id).slice(-10)}</span><span className="block text-[11px] text-white/50">{new Date(o.createdAt).toLocaleString()} {o.staffName ? `- ${o.staffName}` : ''}{o.status === 'REFUNDED' ? ' - refunded' : o.partiallyRefunded ? ' - partly refunded' : ''}</span></span>
                  <span className="font-black">{money(Number(o.paidCents ?? o.totalCents) || 0)}</span>
                </button>
              ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => { setPicked(null); setQty({}); setErr(''); setNeedMgr(''); }} className="text-[11px] font-bold text-white/50 hover:text-white">&larr; Different sale</button>
            <div className="space-y-2">
              {lines.map((l, i) => {
                const remaining = l.qty - done.qty[i];
                return (
                  <div key={i} className={`rounded-xl bg-white/5 p-2.5 flex items-center gap-2 ${remaining <= 0 ? 'opacity-40' : ''}`}>
                    <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{l.title}</div><div className="text-[10px] text-white/50">{l.qty} sold - {done.qty[i]} returned - {money(l.chargeCents)} paid</div></div>
                    {remaining > 0 && <>
                      <label className="text-[10px] text-white/50 flex items-center gap-1"><input type="checkbox" checked={!!restock[i]} onChange={e => setRestock(r => ({ ...r, [i]: e.target.checked }))} className="accent-orange-400" />restock</label>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setQty(s => ({ ...s, [i]: Math.max(0, (s[i] || 0) - 1) }))} className="w-6 h-6 rounded-full bg-white/10">-</button>
                        <span className="w-5 text-center text-xs font-black">{qty[i] || 0}</span>
                        <button onClick={() => setQty(s => ({ ...s, [i]: Math.min(remaining, (s[i] || 0) + 1) }))} className="w-6 h-6 rounded-full bg-white/10">+</button>
                      </div>
                    </>}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={method} onChange={e => setMethod(e.target.value as RefundMethod)} className={inp} aria-label="Refund to"><option value="ORIGINAL">Original payment</option><option value="CASH">Cash</option><option value="STORE_CREDIT">Store credit</option></select>
              <select value={reason} onChange={e => setReason(e.target.value)} className={inp} aria-label="Reason">{REFUND_REASONS.map(r => <option key={r} value={r}>{REFUND_REASON_LABEL[r]}</option>)}</select>
            </div>
            {preview && preview.ok === false && <div className="text-xs text-red-300 font-bold">{preview.error}</div>}
            {preview && preview.ok && (
              <div className="rounded-xl bg-white/5 p-3 text-sm space-y-0.5">
                <div className="flex justify-between"><span className="text-white/50">Tax refunded</span><span>{money(preview.plan.taxCents)}</span></div>
                {preview.plan.allocations.map((a, i) => <div key={i} className="flex justify-between text-xs text-white/60"><span>Back to {a.kind ? a.kind.replace('_', ' ') : a.type.toLowerCase()}</span><span>{money(a.amountCents)}</span></div>)}
                <div className="flex justify-between text-lg font-black pt-1"><span>Refund</span><span>{money(preview.plan.amountCents)}</span></div>
              </div>
            )}
            {needMgr && <input value={mgrPin} onChange={e => setMgrPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Manager PIN" inputMode="numeric" type="password" className={inp} aria-label="Manager PIN" />}
            {err && <div className="text-xs text-red-400 font-bold">{err}</div>}
            <button disabled={!preview || preview.ok === false || busy || (!!needMgr && mgrPin.length < 4)} onClick={submit} className="w-full py-3 rounded-xl font-black text-white disabled:opacity-30" style={{ background: GRAD }}>{busy ? 'Refunding...' : 'Issue refund'}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
