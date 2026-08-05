import React, { useEffect, useState } from 'react';
import { ShoppingBag, Clock, Check, Truck, Loader2, RefreshCw, Bell } from 'lucide-react';
import { fetchBusinessStoreOrders, advanceStoreOrder, type StoreOrderRecord } from '../services/businessOpsService';
import { notifyOrderReady } from '../services/businessMessagingService';

/**
 * Business-side view of incoming store/kiosk/POS orders (the server order spine). Closes the loop:
 * the business advances an order's status, and marking it READY fires the customer's "order ready"
 * notification (Phase-1 comms) — but only if that customer opted into transactional updates.
 */
const fmt = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

// The stage a business can move an order TO from its current one (payment → CONFIRMED is automatic).
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  CONFIRMED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'COMPLETED', label: 'Complete' },
};
const STATUS_STYLE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-white/10 text-white/40', CONFIRMED: 'bg-blue-500/20 text-blue-300',
  PREPARING: 'bg-amber-500/20 text-amber-300', READY: 'bg-green-500/20 text-green-300',
  OUT_FOR_DELIVERY: 'bg-green-500/20 text-green-300', COMPLETED: 'bg-white/10 text-white/50',
  CANCELLED: 'bg-red-500/20 text-red-300',
};

const BusinessOrdersPanel: React.FC<{ businessUid: string; businessName: string; businessPhoto?: string }> = ({ businessUid, businessName, businessPhoto }) => {
  const [orders, setOrders] = useState<StoreOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => { setLoading(true); setOrders(await fetchBusinessStoreOrders(businessUid).catch(() => [])); setLoading(false); };
  useEffect(() => { load(); }, [businessUid]);

  const advance = async (o: StoreOrderRecord) => {
    const step = NEXT[o.status];
    if (!step || busyId) return;
    setBusyId(o.id);
    try {
      await advanceStoreOrder(o.id, step.to);
      // Marking ready → let the customer know (only fires if they opted into transactional updates).
      if (step.to === 'READY') {
        const label = o.items.map(i => `${i.qty}× ${i.title}`).slice(0, 3).join(', ') || 'Your order';
        await notifyOrderReady({ uid: businessUid, name: businessName, photo: businessPhoto }, o.customerUid, label).catch(() => {});
      }
      setOrders(os => os.map(x => x.id === o.id ? { ...x, status: step.to } : x));
    } catch { /* */ } finally { setBusyId(null); }
  };

  const active = orders.filter(o => o.status !== 'PENDING_PAYMENT'); // paid orders the business acts on

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5"><ShoppingBag size={13} className="text-small-orange" /> Store & kiosk orders</p>
        <button onClick={load} className="p-2 rounded-full bg-white/5 hover:bg-white/10"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/40" /></div>
      ) : active.length === 0 ? (
        <div className="py-12 text-center text-white/30"><ShoppingBag size={34} className="mx-auto mb-2" /><p className="text-[11px] font-black uppercase tracking-widest">No paid orders yet</p></div>
      ) : (
        active.map(o => {
          const step = NEXT[o.status];
          const count = o.items.reduce((s, i) => s + (i.qty || 0), 0);
          return (
            <div key={o.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black truncate">{o.customerName || 'Customer'} · {fmt(o.subtotalCents)}</p>
                  <p className="text-[10px] text-white/40 flex items-center gap-1.5">
                    {o.fulfillment === 'SHIP' ? <Truck size={10} /> : <ShoppingBag size={10} />} {o.fulfillment === 'SHIP' ? 'Delivery' : 'Pickup'} · {count} item{count === 1 ? '' : 's'}
                  </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${STATUS_STYLE[o.status] || 'bg-white/10 text-white/50'}`}>{o.status.replace(/_/g, ' ')}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                {o.items.slice(0, 5).map((it, i) => <p key={i} className="text-[12px] text-white/70 truncate">{it.qty}× {it.title}{it.variantName ? ` (${it.variantName})` : ''}</p>)}
              </div>
              {o.note && <p className="text-[10px] text-white/30 mt-2 italic">“{o.note}”</p>}
              {step && (
                <button onClick={() => advance(o)} disabled={busyId === o.id} className="mt-3 w-full py-2.5 rounded-xl bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
                  {busyId === o.id ? <Loader2 size={13} className="animate-spin" /> : step.to === 'READY' ? <Bell size={13} /> : step.to === 'COMPLETED' ? <Check size={13} /> : <Clock size={13} />}
                  {step.label}{step.to === 'READY' ? ' & notify' : ''}
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default BusinessOrdersPanel;
