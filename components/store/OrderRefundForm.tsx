import React, { useMemo, useState } from 'react';
import { RotateCcw, XCircle } from 'lucide-react';
import { Button } from '../ui';
import { refundOnlineOrder, type StoreOrderRecord } from '../../services/businessOpsService';
import { onlineRefundOrder, planOnlineRefund, remainingRefundLines } from '../../services/storeShopCore';
import { REFUND_REASONS, REFUND_REASON_LABEL, refundedSoFar, type RefundReason } from '../../services/refundCore';

const fmt = (c: number) => `$${((c || 0) / 100).toFixed(2)}`;

/**
 * Refund or cancel an online order. The seller picks items (and shipping), sees the exact amount before
 * confirming, and the server moves the money back through Stripe and restocks. Same math as the server.
 */
const OrderRefundForm: React.FC<{ order: StoreOrderRecord; mode: 'refund' | 'cancel'; onDone: (msg: string) => void; onClose: () => void }> = ({ order, mode, onDone, onClose }) => {
  // The server's order doc shape, rebuilt from the record (items carry chargeCents/taxCents on new orders).
  const doc = useMemo(() => ({
    items: JSON.stringify(order.items), shippingCents: order.shippingCents || 0, shippingTaxCents: order.shippingTaxCents || 0,
    taxCents: order.taxCents || 0, totalCents: order.totalCents || 0, refundLog: JSON.stringify(order.refundLog || []), refundedCents: order.refundedCents || 0,
  }), [order]);
  const ord = useMemo(() => onlineRefundOrder(doc), [doc]);
  const done = useMemo(() => refundedSoFar(ord.lines, (order.refundLog || []) as any), [ord, order.refundLog]);
  const left = ord.lines.map((l, i) => l.qty - done.qty[i]);
  const [qty, setQty] = useState<number[]>(() => (mode === 'cancel' ? left : ord.lines.map(() => 0)));
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState<RefundReason>(mode === 'cancel' ? 'OTHER' : 'CUSTOMER_RETURN');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [key] = useState(() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

  const lines = mode === 'cancel' ? remainingRefundLines(doc, restock) : qty.map((q, i) => ({ index: i, qty: q, restock: restock && i !== ord.shippingIndex })).filter(l => l.qty > 0);
  const plan = lines.length ? planOnlineRefund(doc, lines) : null;
  const amount = plan && plan.ok ? plan.plan.amountCents : 0;

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await refundOnlineOrder(order.id, mode === 'cancel' ? { cancel: true, restock, reason, note, idempotencyKey: key } : { lines, restock, reason, note, idempotencyKey: key });
      onDone(mode === 'cancel' ? `Order cancelled. ${fmt(r.amountCents)} is on its way back to the buyer.` : `Refunded ${fmt(r.amountCents)}. The buyer has been told.`);
    } catch (e: any) { setErr(e?.message || 'Refund failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-xl p-3 space-y-2.5" style={{ background: 'var(--pj-glass-2)', border: '1px solid var(--pj-border)' }}>
      <p className="type-label-lg font-bold">{mode === 'cancel' ? 'Cancel this order' : 'Refund items'}</p>
      {mode === 'refund' ? ord.lines.map((l, i) => left[i] > 0 && (
        <div key={i} className="flex items-center gap-2">
          <p className="type-body-sm flex-1 min-w-0 truncate">{l.title}{i === ord.shippingIndex ? '' : ` · ${fmt(Math.round(l.chargeCents / l.qty))} each`}</p>
          {i === ord.shippingIndex ? (
            <label className="type-body-sm flex items-center gap-1.5"><input type="checkbox" checked={qty[i] > 0} onChange={e => setQty(q => q.map((x, j) => (j === i ? (e.target.checked ? 1 : 0) : x)))} /> {fmt(l.chargeCents - done.amt[i])}</label>
          ) : (
            <select className="pj-input" style={{ width: 'auto' }} aria-label={`How many ${l.title} to refund`} value={qty[i]} onChange={e => setQty(q => q.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
              {Array.from({ length: left[i] + 1 }, (_, n) => <option key={n} value={n}>{n} of {left[i]}</option>)}
            </select>
          )}
        </div>
      )) : <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Everything not yet refunded, including shipping, goes back to the buyer.</p>}
      {mode === 'refund' && <Button variant="ghost" size="sm" onClick={() => setQty(left)}>Select everything</Button>}
      <label className="type-body-sm flex items-center gap-2"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} /> Put items back in stock</label>
      <div className="flex gap-2 flex-wrap">
        <select className="pj-input" style={{ width: 'auto' }} aria-label="Reason" value={reason} onChange={e => setReason(e.target.value as RefundReason)}>
          {REFUND_REASONS.map(r => <option key={r} value={r}>{REFUND_REASON_LABEL[r]}</option>)}
        </select>
        <input className="pj-input flex-1 min-w-0" placeholder="Note for your records (optional)" value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
      </div>
      {plan && plan.ok === false && <p className="type-body-sm" style={{ color: 'var(--pj-danger)' }}>{plan.error}</p>}
      {err && <p role="alert" className="type-body-sm" style={{ color: 'var(--pj-danger)' }}>{err}</p>}
      <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>The refund comes out of your Stripe balance. Plajah returns its fee on the refunded part; card processing isn’t returned by Stripe.</p>
      <div className="flex gap-2">
        <Button variant={mode === 'cancel' ? 'danger' : 'primary'} size="md" fullWidth loading={busy} disabled={!amount} icon={mode === 'cancel' ? <XCircle /> : <RotateCcw />} onClick={submit}>
          {mode === 'cancel' ? `Cancel and refund ${fmt(amount)}` : `Refund ${fmt(amount)}`}
        </Button>
        <Button variant="ghost" size="md" onClick={onClose}>Back</Button>
      </div>
    </div>
  );
};

export default OrderRefundForm;
