import React, { useEffect, useState } from 'react';
import { ShoppingBag, Clock, Check, Truck, RefreshCw, Bell, AlertTriangle, MapPin, Package, Copy, ExternalLink, Mail } from 'lucide-react';
import { useContextMenu } from './ui/ContextMenu';
import { Button, IconButton, Chip } from './ui';
import { fetchBusinessStoreOrders, advanceStoreOrder, type StoreOrderRecord } from '../services/businessOpsService';
import { notifyOrderReady, notifyOrderShipped } from '../services/businessMessagingService';
import { CARRIERS, trackingUrl } from '../services/inventoryCore';

/**
 * Seller-side view of incoming store / kiosk / POS orders (the server order spine). Closes the loop:
 *  • PICKUP orders: Start preparing → Mark ready (fires the customer's "order ready" notification).
 *  • SHIP orders: shows the shipping address Stripe collected, then Start packing → Mark shipped (with an
 *    optional tracking number → the customer is notified and sees it in My Orders) → Delivered.
 *  • OVERSOLD orders (two buyers, last unit) are flagged loudly so the seller can restock or refund.
 * Notifications only fire if the customer opted into transactional updates from this seller.
 */
const fmt = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

type Step = { to: string; label: string };
const PICKUP_NEXT: Record<string, Step | undefined> = {
  CONFIRMED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'COMPLETED', label: 'Complete' },
};
const SHIP_NEXT: Record<string, Step | undefined> = {
  CONFIRMED: { to: 'PREPARING', label: 'Start packing' },
  PREPARING: { to: 'OUT_FOR_DELIVERY', label: 'Mark shipped' },
  OUT_FOR_DELIVERY: { to: 'DELIVERED', label: 'Mark delivered' },
};
const stepFor = (o: StoreOrderRecord) => (o.fulfillment === 'SHIP' ? SHIP_NEXT : PICKUP_NEXT)[o.status];

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  CONFIRMED: { bg: 'var(--pj-info-soft)', fg: 'var(--pj-info)' },
  PREPARING: { bg: 'var(--pj-warning-soft)', fg: 'var(--pj-warning)' },
  READY: { bg: 'var(--pj-success-soft)', fg: 'var(--pj-success)' },
  OUT_FOR_DELIVERY: { bg: 'var(--pj-success-soft)', fg: 'var(--pj-success)' },
  DELIVERED: { bg: 'var(--pj-glass-2)', fg: 'var(--on-surface-variant)' },
  COMPLETED: { bg: 'var(--pj-glass-2)', fg: 'var(--on-surface-variant)' },
  CANCELLED: { bg: 'var(--pj-danger-soft)', fg: 'var(--pj-danger)' },
};
const LABEL: Record<string, string> = { OUT_FOR_DELIVERY: 'Shipped', PREPARING: 'Packing' };

const BusinessOrdersPanel: React.FC<{ businessUid: string; businessName: string; businessPhoto?: string; onChanged?: () => void }> = ({ businessUid, businessName, businessPhoto, onChanged }) => {
  const [orders, setOrders] = useState<StoreOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shipping, setShipping] = useState<string | null>(null);            // order id with the tracking form open
  const [carrier, setCarrier] = useState<string>('USPS');
  const [tracking, setTracking] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => { setLoading(true); setOrders(await fetchBusinessStoreOrders(businessUid).catch(() => [])); setLoading(false); };
  useEffect(() => { load(); }, [businessUid]);

  const label = (o: StoreOrderRecord) => o.items.map(i => `${i.qty}× ${i.title}`).slice(0, 3).join(', ') || 'Your order';

  const advance = async (o: StoreOrderRecord, extra: { trackingNumber?: string; trackingCarrier?: string } = {}) => {
    const step = stepFor(o);
    if (!step || busyId) return;
    setBusyId(o.id); setMsg('');
    try {
      await advanceStoreOrder(o.id, step.to, extra);
      const biz = { uid: businessUid, name: businessName, photo: businessPhoto };
      if (step.to === 'READY') await notifyOrderReady(biz, o.customerUid, label(o)).catch(() => {});
      if (step.to === 'OUT_FOR_DELIVERY') await notifyOrderShipped(biz, o.customerUid, label(o), { carrier: extra.trackingCarrier, number: extra.trackingNumber }).catch(() => {});
      setOrders(os => os.map(x => x.id === o.id ? { ...x, status: step.to, trackingNumber: extra.trackingNumber || x.trackingNumber, trackingCarrier: extra.trackingCarrier || x.trackingCarrier } : x));
      setShipping(null); setTracking('');
      onChanged?.();
    } catch { setMsg('Couldn\'t update that order — check your connection and try again.'); }
    finally { setBusyId(null); }
  };

  const copy = (text: string, ok: string) => { navigator.clipboard.writeText(text).then(() => setMsg(ok)).catch(() => setMsg('Couldn\'t copy.')); setTimeout(() => setMsg(''), 2500); };
  const addressText = (o: StoreOrderRecord) => o.ship ? [o.ship.name, o.ship.line1, o.ship.line2, `${o.ship.city}, ${o.ship.state} ${o.ship.postal}`, o.ship.country].filter(Boolean).join('\n') : '';

  const paid = orders.filter(o => o.status !== 'PENDING_PAYMENT');
  const open = paid.filter(o => !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(o.status));
  const done = paid.filter(o => ['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(o.status));
  const list = showDone ? [...open, ...done] : open;

  const orderMenu = useContextMenu<StoreOrderRecord>((o) => {
    const step = stepFor(o);
    return [
      { kind: 'header' as const, label: `${o.customerName || 'Customer'} · ${fmt(o.totalCents ?? o.subtotalCents)}` },
      { id: 'advance', label: step ? step.label : 'No next step', disabled: !step || !!busyId || step.to === 'OUT_FOR_DELIVERY', onSelect: (ord: StoreOrderRecord) => advance(ord) },
      ...(o.ship ? [{ id: 'addr', label: 'Copy shipping address', onSelect: (ord: StoreOrderRecord) => copy(addressText(ord), 'Address copied') }] : []),
      { id: 'copy', label: 'Copy order ID', onSelect: (ord: StoreOrderRecord) => copy(ord.id, 'Order ID copied') },
    ];
  });

  return (
    <div className="space-y-3">
      {orderMenu.node}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="pj-eyebrow flex items-center gap-1.5"><ShoppingBag size={13} style={{ color: 'var(--pj-orange)' }} /> Orders · {open.length} to do</p>
        <div className="flex items-center gap-2">
          {done.length > 0 && <Chip interactive selected={showDone} onClick={() => setShowDone(v => !v)}>Completed · {done.length}</Chip>}
          <IconButton aria-label="Refresh orders" variant="ghost" size="sm" onClick={load}><RefreshCw className={loading ? 'animate-spin' : ''} /></IconButton>
        </div>
      </div>
      {msg && <p role="status" className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{msg}</p>}

      {loading ? (
        <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--pj-glass-1)' }} />)}</div>
      ) : list.length === 0 ? (
        <div className="py-14 text-center rounded-3xl" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
          <Package size={32} className="mx-auto mb-2" style={{ color: 'var(--on-surface-variant)', opacity: 0.6 }} />
          <p className="type-title-md font-bold">{paid.length ? 'All caught up' : 'No paid orders yet'}</p>
          <p className="type-body-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{paid.length ? 'Nothing is waiting on you.' : 'When someone buys, it shows up here — with their address, ready to pack.'}</p>
        </div>
      ) : list.map(o => {
        const step = stepFor(o);
        const ship = o.fulfillment === 'SHIP';
        const count = o.items.reduce((s, i) => s + (i.qty || 0), 0);
        const tone = STATUS_TONE[o.status] || { bg: 'var(--pj-glass-2)', fg: 'var(--on-surface-variant)' };
        const turl = trackingUrl(o.trackingCarrier, o.trackingNumber);
        return (
          <div key={o.id} className="rounded-2xl p-4" style={{ background: 'var(--pj-glass-1)', border: `1px solid ${o.oversold ? 'var(--pj-danger)' : 'var(--pj-border)'}` }} {...orderMenu.bind(o)}>
            {o.oversold && (
              <p className="type-body-sm flex items-start gap-2 mb-3 rounded-xl p-2.5" style={{ background: 'var(--pj-danger-soft)', color: 'var(--text-primary)' }}>
                <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--pj-danger)' }} />
                <span><b>Oversold.</b> This customer paid for something that had just run out. Restock it, or refund the order in your Stripe dashboard and let them know.</span>
              </p>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="type-label-lg font-bold truncate">{o.customerName || o.ship?.name || 'Customer'} · {fmt(o.totalCents ?? o.subtotalCents)}</p>
                <p className="type-body-sm flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--on-surface-variant)' }}>
                  {ship ? <Truck size={11} /> : <ShoppingBag size={11} />}{o.source === 'POS' ? 'Register' : ship ? 'Ship' : 'Pickup'} · {count} item{count === 1 ? '' : 's'}
                  {o.paidAt ? ` · ${new Date(o.paidAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                </p>
              </div>
              <span className="shrink-0 pj-chip" style={{ height: 22, background: tone.bg, color: tone.fg, borderColor: 'transparent' }}>{LABEL[o.status] || o.status.charAt(0) + o.status.slice(1).toLowerCase().replace(/_/g, ' ')}</span>
            </div>

            <div className="mt-2.5 space-y-1">
              {o.items.slice(0, 6).map((it, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="shrink-0 rounded-lg overflow-hidden" style={{ width: 30, height: 30, background: 'var(--pj-glass-2)' }}>{it.image && <img src={it.image} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}</div>
                  <p className="type-body-md truncate"><b>{it.qty}×</b> {it.title}{it.variantName ? <span style={{ color: 'var(--on-surface-variant)' }}> · {it.variantName}</span> : null}</p>
                </div>
              ))}
              {o.items.length > 6 && <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>+{o.items.length - 6} more</p>}
            </div>

            {ship && o.ship && (
              <div className="mt-3 rounded-xl p-3 flex items-start gap-2.5" style={{ background: 'var(--pj-glass-2)' }}>
                <MapPin size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--pj-orange)' }} />
                <p className="type-body-sm flex-1 whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>{addressText(o)}</p>
                <IconButton aria-label="Copy address" variant="ghost" size="xs" onClick={() => copy(addressText(o), 'Address copied')}><Copy /></IconButton>
              </div>
            )}
            {ship && !o.ship && o.status !== 'CANCELLED' && <p className="type-body-sm mt-3" style={{ color: 'var(--on-surface-variant)' }}>Address not on file — check the order in your Stripe dashboard.</p>}
            {o.customerEmail && <p className="type-body-sm mt-2 flex items-center gap-1.5" style={{ color: 'var(--on-surface-variant)' }}><Mail size={11} />{o.customerEmail}</p>}
            {o.note && <p className="type-body-sm mt-2 italic" style={{ color: 'var(--on-surface-variant)' }}>“{o.note}”</p>}

            {o.trackingNumber && (
              <p className="type-body-sm mt-2 flex items-center gap-1.5" style={{ color: 'var(--on-surface-variant)' }}>
                <Truck size={11} />{o.trackingCarrier} {o.trackingNumber}
                {turl && <a href={turl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: 'var(--pj-orange)' }}>Track <ExternalLink size={10} /></a>}
              </p>
            )}

            {step && (shipping === o.id && step.to === 'OUT_FOR_DELIVERY' ? (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <select value={carrier} onChange={e => setCarrier(e.target.value)} className="pj-input" style={{ width: 'auto' }} aria-label="Carrier">{CARRIERS.map(c => <option key={c}>{c}</option>)}</select>
                  <input value={tracking} onChange={e => setTracking(e.target.value)} className="pj-input flex-1 min-w-0" placeholder="Tracking number (optional)" autoFocus />
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="md" fullWidth icon={<Truck />} loading={busyId === o.id} onClick={() => advance(o, tracking.trim() ? { trackingNumber: tracking.trim(), trackingCarrier: carrier } : {})}>Mark shipped{tracking.trim() ? ' & notify' : ''}</Button>
                  <Button variant="ghost" size="md" onClick={() => setShipping(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button className="mt-3" variant={step.to === 'OUT_FOR_DELIVERY' || step.to === 'READY' ? 'primary' : 'secondary'} size="md" fullWidth loading={busyId === o.id}
                icon={step.to === 'READY' ? <Bell /> : step.to === 'COMPLETED' || step.to === 'DELIVERED' ? <Check /> : step.to === 'OUT_FOR_DELIVERY' ? <Truck /> : <Clock />}
                onClick={() => (step.to === 'OUT_FOR_DELIVERY' ? setShipping(o.id) : advance(o))}>
                {step.label}{step.to === 'READY' ? ' & notify' : ''}
              </Button>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default BusinessOrdersPanel;
