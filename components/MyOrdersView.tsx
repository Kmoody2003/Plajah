import React, { useEffect, useState } from 'react';
import { Package, Check, Clock, Truck, ShoppingBag, Loader2, ChevronRight } from 'lucide-react';
import { fetchMyStoreOrders, type StoreOrderRecord } from '../services/businessOpsService';

/**
 * Customer-facing order tracking — the orders a person has placed through the store/kiosk/POS spine,
 * with a live status timeline. Reads storeOrders by customerUid (the shape the server order spine
 * writes). Pickup orders track PENDING → CONFIRMED → PREPARING → READY → COMPLETED; shipped orders
 * swap in OUT-FOR-DELIVERY. Later phases fold in courier ETA / tracking numbers (Uber Direct,
 * DoorDash Drive, Shippo).
 */
const fmt = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

const PICKUP_STEPS = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];
const SHIP_STEPS = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Placed', CONFIRMED: 'Confirmed', PREPARING: 'Preparing',
  READY: 'Ready', COMPLETED: 'Done', OUT_FOR_DELIVERY: 'On the way', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

const Timeline: React.FC<{ status: string; ship: boolean }> = ({ status, ship }) => {
  const steps = ship ? SHIP_STEPS : PICKUP_STEPS;
  const idx = Math.max(0, steps.indexOf(status));
  const cancelled = status === 'CANCELLED';
  return (
    <div className="flex items-center gap-1 mt-3">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-1">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${cancelled ? 'bg-red-500/20 text-red-400' : i <= idx ? 'text-white' : 'bg-white/8 text-white/30'}`} style={!cancelled && i <= idx ? { background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' } : {}}>
              {i < idx ? <Check size={11} /> : i === idx ? <Clock size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
            </div>
            <span className={`text-[7px] font-black uppercase tracking-wider ${i <= idx && !cancelled ? 'text-white/70' : 'text-white/25'}`}>{LABEL[s] || s}</span>
          </div>
          {i < steps.length - 1 && <div className={`flex-1 h-0.5 rounded-full ${i < idx && !cancelled ? 'bg-small-orange' : 'bg-white/10'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
};

const MyOrdersView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [orders, setOrders] = useState<StoreOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMyStoreOrders().then(setOrders).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <div className="w-full max-w-2xl mx-auto p-5 text-white">
      <div className="flex items-center gap-3 mb-5">
        {onBack && <button onClick={onBack} className="p-2 rounded-full bg-white/5"><ChevronRight size={18} className="rotate-180" /></button>}
        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2"><ShoppingBag size={20} className="text-small-orange" /> My Orders</h2>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={22} className="animate-spin text-white/40" /></div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center text-white/30"><Package size={40} className="mx-auto mb-3" /><p className="text-[11px] font-black uppercase tracking-widest">No orders yet</p></div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const ship = o.fulfillment === 'SHIP';
            const count = o.items.reduce((s, i) => s + (i.qty || 0), 0);
            return (
              <div key={o.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/50">
                    {ship ? <Truck size={13} /> : <ShoppingBag size={13} />} {ship ? 'Delivery' : 'Pickup'} · {count} item{count === 1 ? '' : 's'}
                  </div>
                  <span className="text-sm font-black">{fmt(o.subtotalCents)}</span>
                </div>
                <div className="mt-2 space-y-0.5">
                  {o.items.slice(0, 4).map((it, i) => (
                    <p key={i} className="text-[12px] text-white/70 truncate">{it.qty}× {it.title}{it.variantName ? ` (${it.variantName})` : ''}</p>
                  ))}
                  {o.items.length > 4 && <p className="text-[10px] text-white/30">+{o.items.length - 4} more</p>}
                </div>
                <Timeline status={o.status} ship={ship} />
                {o.note && <p className="text-[10px] text-white/30 mt-2 italic">“{o.note}”</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyOrdersView;
