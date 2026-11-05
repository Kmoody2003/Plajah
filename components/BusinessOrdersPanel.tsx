import React, { useEffect, useRef, useState } from 'react';
import { ShoppingBag, Clock, Check, Truck, RefreshCw, Bell, AlertTriangle, MapPin, Package, Copy, ExternalLink, Mail, RotateCcw, XCircle, Printer, Wallet } from 'lucide-react';
import { useContextMenu } from './ui/ContextMenu';
import { Button, IconButton, Chip } from './ui';
import { fetchBusinessStoreOrders, advanceStoreOrder, advanceOnlineOrder, fetchShopSettings, fetchShopConnections, printfulOrderAction, type StoreOrderRecord } from '../services/businessOpsService';
import LabelBuyer from './store/LabelBuyer';
import { packingSlipHtml, ONLINE_CANCELLABLE } from '../services/storeShopCore';
import { openStripeDashboard } from '../services/backendService';
import OrderRefundForm from './store/OrderRefundForm';
import ShopSettingsPanel from './store/ShopSettingsPanel';
import SalesReportPanel from './store/SalesReportPanel';
import { notifyOrderReady, notifyOrderShipped } from '../services/businessMessagingService';
import { CARRIERS, trackingUrl } from '../services/inventoryCore';
import { subscribeOrders, emitCommerce, onCommerce } from '../services/commerceBus';

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
  REFUNDED: { bg: 'var(--pj-danger-soft)', fg: 'var(--pj-danger)' },
};
const LABEL: Record<string, string> = { OUT_FOR_DELIVERY: 'Shipped', PREPARING: 'Packing' };
const CLOSED = ['COMPLETED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
type Tab = 'orders' | 'sales' | 'settings' | 'codes';
const TABS: { id: Tab; label: string }[] = [{ id: 'orders', label: 'Orders' }, { id: 'sales', label: 'Sales' }, { id: 'settings', label: 'Policies & shipping' }, { id: 'codes', label: 'Discount codes' }];

const BusinessOrdersPanel: React.FC<{ businessUid: string; businessName: string; businessPhoto?: string; onChanged?: () => void }> = ({ businessUid, businessName, businessPhoto, onChanged }) => {
  const [orders, setOrders] = useState<StoreOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shipping, setShipping] = useState<string | null>(null);            // order id with the tracking form open
  const [carrier, setCarrier] = useState<string>('USPS');
  const [tracking, setTracking] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<Tab>('orders');
  const [refunding, setRefunding] = useState<{ id: string; mode: 'refund' | 'cancel' } | null>(null);
  const [labelFor, setLabelFor] = useState<string | null>(null);
  const [conns, setConns] = useState<{ shippo: boolean; printful: boolean }>({ shippo: false, printful: false });
  useEffect(() => { fetchShopConnections(businessUid).then(setConns).catch(() => {}); }, [businessUid, tab]);
  const printer = async (o: StoreOrderRecord, action: 'send' | 'sync') => {
    setBusyId(o.id); setMsg('');
    try {
      const r = await printfulOrderAction(o.id, action);
      setMsg(action === 'send' ? `Sent to Printful${r.status ? ` (${r.status})` : ''}.` : r.shipped ? 'Printful shipped it. The buyer has their tracking.' : `Printful status: ${r.printfulStatus || 'unknown'}.`);
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusyId(null); }
  };
  /** A bought label means the box is ready: move the order to shipped with its tracking (emails the buyer). */
  const labelBought = async (o: StoreOrderRecord, t: { trackingNumber: string; trackingCarrier: string }) => {
    setLabelFor(null);
    try {
      if (o.status === 'CONFIRMED') await advanceOnlineOrder(o.id, 'PREPARING');
      if (o.status === 'CONFIRMED' || o.status === 'PREPARING') await advanceOnlineOrder(o.id, 'OUT_FOR_DELIVERY', { trackingNumber: t.trackingNumber, trackingCarrier: t.trackingCarrier });
      setMsg(`Label bought. Tracking ${t.trackingNumber} is on the order and the buyer has been emailed.`);
    } catch (e: any) { setMsg(`Label bought (tracking ${t.trackingNumber}), but the order didn’t update: ${e.message}`); }
    await load();
  };

  const load = async () => { setLoading(true); setOrders(await fetchBusinessStoreOrders(businessUid).catch(() => [])); setLoading(false); };

  // Live orders (commerceBus). New paid orders announce themselves; the one-shot read is the fallback if
  // the listener can't start (and what the refresh button does).
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    known.current = null;
    setLoading(true);
    let gotLive = false;
    const un = subscribeOrders(businessUid, list => {
      gotLive = true;
      const paidNow = list.filter(o => o.status !== 'PENDING_PAYMENT');
      if (known.current) {
        const fresh = paidNow.filter(o => !known.current!.has(o.id));
        if (fresh.length) {
          const o = fresh[0];
          setMsg(fresh.length > 1 ? `${fresh.length} new orders just came in.` : `New ${o.source === 'POS' ? 'register sale' : 'order'}: ${o.customerName || 'Customer'} · ${fmt(o.totalCents ?? o.subtotalCents)}`);
        }
      }
      known.current = new Set(paidNow.map(o => o.id));
      setOrders(list);
      setLoading(false);
    }, { onError: () => { if (!gotLive) load(); } });
    // Same-device instant nudge (e.g. the register in another window just rang a sale).
    const off = onCommerce(e => { if (e.type === 'SALE' && e.sellerUid === businessUid) setMsg('Sale rung up — updating…'); });
    return () => { un(); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessUid]);

  const label = (o: StoreOrderRecord) => o.items.map(i => `${i.qty}× ${i.title}`).slice(0, 3).join(', ') || 'Your order';

  const advance = async (o: StoreOrderRecord, extra: { trackingNumber?: string; trackingCarrier?: string } = {}) => {
    const step = stepFor(o);
    if (!step || busyId) return;
    setBusyId(o.id); setMsg('');
    try {
      // Online orders advance on the server, which emails the buyer; register orders stay a direct update.
      if (o.source === 'POS') await advanceStoreOrder(o.id, step.to, extra); else await advanceOnlineOrder(o.id, step.to, extra);
      const biz = { uid: businessUid, name: businessName, photo: businessPhoto };
      if (step.to === 'READY') await notifyOrderReady(biz, o.customerUid, label(o)).catch(() => {});
      if (step.to === 'OUT_FOR_DELIVERY') await notifyOrderShipped(biz, o.customerUid, label(o), { carrier: extra.trackingCarrier, number: extra.trackingNumber }).catch(() => {});
      setOrders(os => os.map(x => x.id === o.id ? { ...x, status: step.to, trackingNumber: extra.trackingNumber || x.trackingNumber, trackingCarrier: extra.trackingCarrier || x.trackingCarrier } : x));
      setShipping(null); setTracking('');
      emitCommerce({ type: 'ORDER', sellerUid: businessUid, orderId: o.id, status: step.to });
      onChanged?.();
    } catch (e: any) { setMsg(e?.message || 'Couldn\'t update that order — check your connection and try again.'); }
    finally { setBusyId(null); }
  };

  const copy = (text: string, ok: string) => { navigator.clipboard.writeText(text).then(() => setMsg(ok)).catch(() => setMsg('Couldn\'t copy.')); setTimeout(() => setMsg(''), 2500); };
  const addressText = (o: StoreOrderRecord) => o.ship ? [o.ship.name, o.ship.line1, o.ship.line2, `${o.ship.city}, ${o.ship.state} ${o.ship.postal}`, o.ship.country].filter(Boolean).join('\n') : '';

  const paid = orders.filter(o => o.status !== 'PENDING_PAYMENT' && o.status !== 'EXPIRED');
  const open = paid.filter(o => !CLOSED.includes(o.status));
  const done = paid.filter(o => CLOSED.includes(o.status));
  const canRefund = (o: StoreOrderRecord) => o.source !== 'POS' && !!o.stripePaymentIntentId && (o.refundedCents || 0) < (o.totalCents || 0);

  const printSlip = async (o: StoreOrderRecord) => {
    const w = window.open('', '_blank');
    if (!w) { setMsg('Allow pop-ups to print packing slips.'); return; }
    const st = await fetchShopSettings(businessUid).catch(() => null);
    w.document.write(packingSlipHtml({ id: o.id, createdAt: o.paidAt || o.createdAt, customerName: o.customerName, note: o.note, items: o.items.map(i => ({ title: i.title, qty: i.qty, variantName: i.variantName, sku: i.sku || undefined })), ship: o.ship }, { name: businessName, contactEmail: st?.settings.contactEmail, returnPolicy: st?.returnPolicy }));
    w.document.close();
  };
  const list = showDone ? [...open, ...done] : open;

  const orderMenu = useContextMenu<StoreOrderRecord>((o) => {
    const step = stepFor(o);
    return [
      { kind: 'header' as const, label: `${o.customerName || 'Customer'} · ${fmt(o.totalCents ?? o.subtotalCents)}` },
      { id: 'advance', label: step ? step.label : 'No next step', disabled: !step || !!busyId || step.to === 'OUT_FOR_DELIVERY', onSelect: (ord: StoreOrderRecord) => advance(ord) },
      ...(o.ship ? [{ id: 'addr', label: 'Copy shipping address', onSelect: (ord: StoreOrderRecord) => copy(addressText(ord), 'Address copied') }] : []),
      ...(o.fulfillment === 'SHIP' ? [{ id: 'slip', label: 'Print packing slip', onSelect: (ord: StoreOrderRecord) => { void printSlip(ord); } }] : []),
      ...(canRefund(o) ? [{ id: 'refund', label: 'Refund…', onSelect: (ord: StoreOrderRecord) => setRefunding({ id: ord.id, mode: 'refund' }) }] : []),
      ...(canRefund(o) && ONLINE_CANCELLABLE.has(o.status) ? [{ id: 'cancel', label: 'Cancel order…', onSelect: (ord: StoreOrderRecord) => setRefunding({ id: ord.id, mode: 'cancel' }) }] : []),
      { id: 'copy', label: 'Copy order ID', onSelect: (ord: StoreOrderRecord) => copy(ord.id, 'Order ID copied') },
    ];
  });

  return (
    <div className="space-y-3">
      {orderMenu.node}
      <div className="flex gap-1.5 flex-wrap items-center">
        {TABS.map(t => <Chip key={t.id} interactive selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>)}
        <Button className="ml-auto" variant="ghost" size="sm" icon={<Wallet />} onClick={() => openStripeDashboard().catch(() => setMsg('Couldn’t open Stripe. Finish connecting payouts first.'))}>Payouts</Button>
      </div>
      {tab === 'sales' && <SalesReportPanel orders={orders} shopName={businessName} />}
      {(tab === 'settings' || tab === 'codes') && <ShopSettingsPanel businessUid={businessUid} section={tab} />}
      {tab === 'orders' && <>
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
                <span><b>Oversold.</b> This customer paid for something that had just run out. Restock it, or refund that item below.</span>
              </p>
            )}
            {o.disputed && (
              <p className="type-body-sm flex items-start gap-2 mb-3 rounded-xl p-2.5" style={{ background: 'var(--pj-danger-soft)', color: 'var(--text-primary)' }}>
                <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--pj-danger)' }} />
                <span><b>Disputed.</b> The buyer’s bank opened a chargeback.{o.disputeReversedCents ? ` ${fmt(o.disputeReversedCents)} was taken back from your Stripe balance until it’s decided.` : ''} Email Plajah support your tracking, proof of delivery and any messages with the buyer{o.disputeDueBy ? ` before ${new Date(o.disputeDueBy).toLocaleDateString()}` : ' right away'}.</span>
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
            {ship && !o.ship && o.status !== 'CANCELLED' && <p className="type-body-sm mt-3" style={{ color: 'var(--on-surface-variant)' }}>Address not on file yet. It arrives when the payment confirms.</p>}
            {(o.discountCents || 0) > 0 && <p className="type-body-sm mt-2" style={{ color: 'var(--on-surface-variant)' }}>Code {o.discountCode} · -{fmt(o.discountCents || 0)}</p>}
            {(o.refundedCents || 0) > 0 && <p className="type-body-sm mt-2 flex items-center gap-1.5" style={{ color: 'var(--pj-danger)' }}><RotateCcw size={11} />Refunded {fmt(o.refundedCents || 0)}{o.status !== 'REFUNDED' && o.status !== 'CANCELLED' ? ` of ${fmt(o.totalCents || 0)}` : ''}</p>}
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
            {(o.printfulStatus || (conns.printful && ship && o.source !== 'POS' && !CLOSED.includes(o.status))) && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap type-body-sm" style={{ color: o.printfulStatus === 'FAILED' ? 'var(--pj-danger)' : 'var(--on-surface-variant)' }}>
                <span>Printer: {o.printfulStatus ? o.printfulStatus.toLowerCase().replace(/_/g, ' ') : 'nothing sent'}{o.printfulError ? ` · ${o.printfulError}` : ''}</span>
                {(!o.printfulStatus || o.printfulStatus === 'FAILED') && <Button variant="ghost" size="xs" loading={busyId === o.id} onClick={() => printer(o, 'send')}>Send to printer</Button>}
                {o.printfulStatus && o.printfulStatus !== 'FAILED' && <Button variant="ghost" size="xs" loading={busyId === o.id} onClick={() => printer(o, 'sync')}>Check printer</Button>}
              </div>
            )}
            {labelFor === o.id && <LabelBuyer orderId={o.id} onClose={() => setLabelFor(null)} onBought={t => labelBought(o, t)} />}
            {refunding?.id === o.id ? (
              <OrderRefundForm order={o} mode={refunding.mode} onClose={() => setRefunding(null)} onDone={m => { setRefunding(null); setMsg(m); load(); onChanged?.(); }} />
            ) : (ship || canRefund(o)) && (
              <div className="mt-2 flex gap-1.5 flex-wrap">
                {ship && o.source !== 'POS' && o.ship && conns.shippo && !o.labelUrl && ['CONFIRMED', 'PREPARING'].includes(o.status) && labelFor !== o.id && <Button variant="secondary" size="sm" icon={<Truck />} onClick={() => setLabelFor(o.id)}>Buy label</Button>}
                {o.labelUrl && <Button as="a" href={o.labelUrl} target="_blank" rel="noopener noreferrer" variant="ghost" size="sm" icon={<Printer />}>Label</Button>}
                {ship && <Button variant="ghost" size="sm" icon={<Printer />} onClick={() => printSlip(o)}>Packing slip</Button>}
                {canRefund(o) && <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={() => setRefunding({ id: o.id, mode: 'refund' })}>Refund</Button>}
                {canRefund(o) && ONLINE_CANCELLABLE.has(o.status) && <Button variant="danger-quiet" size="sm" icon={<XCircle />} onClick={() => setRefunding({ id: o.id, mode: 'cancel' })}>Cancel order</Button>}
              </div>
            )}
          </div>
        );
      })}
      </>}
    </div>
  );
};

export default BusinessOrdersPanel;
