import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Chip } from '../ui';
import type { StoreOrderRecord } from '../../services/businessOpsService';
import { salesReport, ordersCsv, type ReportOrder } from '../../services/storeShopCore';

const fmt = (c: number) => `$${((c || 0) / 100).toFixed(2)}`;
const DAY = 24 * 3600 * 1000;
const RANGES = [
  { id: 'today', label: 'Today' }, { id: '7', label: '7 days' }, { id: '30', label: '30 days' },
  { id: 'month', label: 'This month' }, { id: 'year', label: 'This year' }, { id: 'all', label: 'All time' },
] as const;
type RangeId = typeof RANGES[number]['id'];

const rangeOf = (id: RangeId): [number, number] => {
  const now = Date.now(), d = new Date();
  if (id === 'today') return [new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), now];
  if (id === '7' || id === '30') return [now - Number(id) * DAY, now];
  if (id === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), now];
  if (id === 'year') return [new Date(d.getFullYear(), 0, 1).getTime(), now];
  return [0, now];
};
export const toReportOrder = (o: StoreOrderRecord): ReportOrder => ({
  id: o.id, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt, source: o.source, customerName: o.customerName, customerEmail: o.customerEmail,
  fulfillment: o.fulfillment, items: o.items, subtotalCents: o.subtotalCents, discountCents: o.discountCents, discountCode: o.discountCode,
  shippingCents: (o.shippingCents || 0) + (o.shippingTaxCents || 0), taxCents: o.taxCents, totalCents: o.totalCents, refundedCents: o.refundedCents,
  ship: o.ship, trackingCarrier: o.trackingCarrier, trackingNumber: o.trackingNumber,
});

/** Sales for a period (online + register), tax collected for filing, best sellers, and the orders CSV. */
const SalesReportPanel: React.FC<{ orders: StoreOrderRecord[]; shopName: string }> = ({ orders, shopName }) => {
  const [range, setRange] = useState<RangeId>('30');
  const [from, to] = rangeOf(range);
  const rows = useMemo(() => orders.map(toReportOrder), [orders]);
  const r = useMemo(() => salesReport(rows, from, to), [rows, from, to]);
  const max = Math.max(1, ...r.byDay.map(d => d.cents));

  const exportCsv = () => {
    const inRange = rows.filter(o => (o.paidAt || o.createdAt) >= from && (o.paidAt || o.createdAt) <= to);
    const blob = new Blob([`﻿${ordersCsv(inRange)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${shopName.replace(/[^\w-]+/g, '-').toLowerCase() || 'shop'}-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const card = { background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' };
  const Stat = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
    <div className="rounded-2xl p-3" style={card}><p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{k}</p><p className="type-title-md font-bold">{v}</p>{sub && <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{sub}</p>}</div>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap items-center">
        {RANGES.map(x => <Chip key={x.id} interactive selected={range === x.id} onClick={() => setRange(x.id)}>{x.label}</Chip>)}
        <Button className="ml-auto" variant="secondary" size="sm" icon={<Download />} onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat k="Net sales" v={fmt(r.netCents)} sub={r.refundsCents ? `${fmt(r.grossCents)} before ${fmt(r.refundsCents)} refunded` : undefined} />
        <Stat k="Orders" v={String(r.orders)} sub={r.orders ? `${fmt(r.averageOrderCents)} average` : undefined} />
        <Stat k="Items sold" v={String(r.units)} />
        <Stat k="Sales tax collected" v={fmt(r.taxCents)} sub="Set aside to file" />
        <Stat k="Shipping charged" v={fmt(r.shippingCents)} />
        <Stat k="Discounts given" v={fmt(r.discountCents)} />
      </div>
      {r.byDay.length > 1 && (
        <div className="rounded-2xl p-3" style={card}>
          <p className="type-label-lg mb-2">Sales by day</p>
          <div className="flex items-end gap-0.5 h-24" role="img" aria-label="Sales by day">
            {r.byDay.map(d => <div key={d.day} title={`${d.day}: ${fmt(d.cents)} · ${d.orders} order${d.orders === 1 ? '' : 's'}`} className="flex-1 rounded-t" style={{ height: `${Math.max(3, (d.cents / max) * 100)}%`, background: 'var(--pj-orange)', opacity: 0.85 }} />)}
          </div>
        </div>
      )}
      <div className="rounded-2xl p-3" style={card}>
        <p className="type-label-lg mb-2">Best sellers</p>
        {r.byProduct.length === 0 ? <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>No sales in this period.</p> : r.byProduct.slice(0, 10).map(p => (
          <div key={p.key} className="flex items-center justify-between gap-2 py-1"><p className="type-body-md truncate">{p.title}</p><p className="type-body-sm shrink-0" style={{ color: 'var(--on-surface-variant)' }}>{p.units} sold · {fmt(p.cents)}</p></div>
        ))}
      </div>
    </div>
  );
};

export default SalesReportPanel;
