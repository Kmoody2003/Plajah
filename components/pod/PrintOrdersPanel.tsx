// Author/buyer view of print orders (reads the caller's own mirror via /api/pod/orders).
import React, { useEffect, useState } from 'react';
import { podFetch, money } from './podApi';
import { usePodFlags } from '../../services/podFlagsClient';

const LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment', paid: 'Paid, sending to printer', submitted: 'With the printer', in_production: 'Printing', shipped: 'Shipped',
  delivered: 'Delivered', rejected: 'Rejected by printer', canceled: 'Canceled', print_error: 'Needs attention', amount_mismatch: 'Needs attention',
};

export const PrintOrdersPanel: React.FC = () => {
  const flags = usePodFlags();
  const [orders, setOrders] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { podFetch('/orders').then(j => setOrders(j.orders)).catch(e => setError(e.message)); }, []);
  // Existing orders stay visible even if ordering is later switched off; with none and nothing live there is nothing to show.
  if (flags.loaded && !flags.visible('PRINT_ORDERING') && !flags.visible('PRINT_RETAIL') && !(orders && orders.length)) return null;
  if (error) return <p className="text-xs text-red-300" role="alert">{error}</p>;
  if (!orders) return <p className="text-xs text-white/50">Loading print orders...</p>;
  if (!orders.length) return <p className="text-xs text-white/50">No print orders yet.</p>;
  return (
    <div className="space-y-2 text-white">
      {orders.map(o => (
        <div key={o.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
          <div className="flex justify-between gap-2"><b className="truncate">{o.title}</b><span className={o.needsAttention ? 'text-amber-300' : 'text-white/70'}>{LABEL[o.status] || o.status}</span></div>
          <div className="text-white/50 mt-1">
            {o.quantity} x {o.kind === 'retail' ? (o.role === 'author' ? 'sold copy' : 'print copy') : o.kind === 'proof' ? 'proof copy' : 'author copies'} · {new Date(o.createdAt).toLocaleDateString()}
            {o.role === 'author' && o.shipTo ? ` · to ${o.shipTo.name}, ${o.shipTo.city} ${o.shipTo.countryCode}` : ''}
            {o.role === 'author' && o.kind === 'retail' && o.royalty ? ` · your profit ~${money(o.royalty.authorProfitCents * o.quantity)} (estimate)` : ''}
          </div>
          {o.trackingId && <div className="mt-1">Tracking: {o.trackingUrls?.[0] ? <a className="text-sky-300 underline" href={o.trackingUrls[0]} target="_blank" rel="noreferrer noopener">{o.trackingId}</a> : o.trackingId}</div>}
          {o.error && <div className="mt-1 text-amber-300">{o.error}</div>}
        </div>
      ))}
    </div>
  );
};

export default PrintOrdersPanel;
