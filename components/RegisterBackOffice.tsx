// RegisterBackOffice - owner-side register floor: sales tax settings, refund approval threshold, the cash
// drawer / end-of-day (Z report), and Sales reports (today / 7d / 30d, by item, by staff, margin from
// costPrice). Mounted in the Business dashboard's Inventory tab; reuses the existing dark glass panels.

import React, { useEffect, useMemo, useState } from 'react';
import { fetchRegisterSettings, saveRegisterSettings, fetchPosOrders, fetchRefunds } from '../services/registerService';
import { sellerProducts } from '../services/inventoryService';
import { buildSalesReport, normalizeOrder, normalizeRefund, rangeBounds, type ReportRange } from '../services/drawerCore';
import { BUILTIN_TAX_CLASSES, TAX_CLASS_LABEL, clampBps } from '../services/taxCore';
import RegisterDrawerSheet from './RegisterDrawerSheet';
import RegisterStoredValuePanel from './RegisterStoredValuePanel';

const money = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const bpsToPct = (b?: number) => (b === undefined ? '' : String(b / 100));
const pctToBps = (s: string) => clampBps(Math.round(parseFloat(s) * 100));
const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 w-full';

export default function RegisterBackOffice({ businessUid }: { businessUid: string }) {
  const [tab, setTab] = useState<'REPORTS' | 'TAX' | 'DRAWER' | 'GIFT'>('REPORTS');
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 space-y-3 text-white">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-black italic" style={{ fontFamily: 'Outfit, sans-serif' }}>Register back office</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{open ? 'Hide' : 'Sales reports, tax, drawer'}</span>
      </button>
      {open && (
        <>
          <div className="flex gap-1.5">
            {([['REPORTS', 'Sales'], ['TAX', 'Tax & rules'], ['DRAWER', 'Drawer / Z'], ['GIFT', 'Gift cards']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${tab === id ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}>{label}</button>
            ))}
          </div>
          {tab === 'REPORTS' && <SalesReports businessUid={businessUid} />}
          {tab === 'TAX' && <TaxSettings businessUid={businessUid} />}
          {tab === 'DRAWER' && <DrawerPanel businessUid={businessUid} />}
          {tab === 'GIFT' && <RegisterStoredValuePanel businessUid={businessUid} />}
        </>
      )}
    </div>
  );
}

function DrawerPanel({ businessUid }: { businessUid: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="text-xs text-white/60">Open the drawer with a float, record paid-outs and drops, then close with a count for the variance and a printable Z report.</div>
      <button onClick={() => setShow(true)} className="px-4 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>Open drawer panel</button>
      {show && <RegisterDrawerSheet businessUid={businessUid} onClose={() => setShow(false)} />}
    </div>
  );
}

function TaxSettings({ businessUid }: { businessUid: string }) {
  const [def, setDef] = useState(''); const [incl, setIncl] = useState(false);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState(''); const [refundAt, setRefundAt] = useState('50.00');
  const [msg, setMsg] = useState(''); const [loaded, setLoaded] = useState(false);
  useEffect(() => { fetchRegisterSettings(businessUid).then(s => {
    setDef(bpsToPct(s.tax.defaultRateBps)); setIncl(!!s.tax.inclusive);
    setRates(Object.fromEntries(Object.entries(s.tax.rates || {}).map(([k, v]) => [k, bpsToPct(v)])));
    setRefundAt((s.refundApprovalCents / 100).toFixed(2)); setLoaded(true);
  }); }, [businessUid]);
  const classes = [...new Set([...BUILTIN_TAX_CLASSES.filter(c => c !== 'STANDARD' && c !== 'EXEMPT'), ...Object.keys(rates)])];
  async function save() {
    const r: Record<string, number> = {};
    for (const c of classes) if (rates[c] !== undefined && rates[c] !== '') r[c] = pctToBps(rates[c]);
    try {
      await saveRegisterSettings(businessUid, { tax: { defaultRateBps: pctToBps(def || '0'), inclusive: incl, rates: r }, refundApprovalCents: Math.round(parseFloat(refundAt || '0') * 100) });
      setMsg('Saved.');
    } catch (e: any) { setMsg(e?.message || 'Could not save.'); }
  }
  if (!loaded) return <div className="text-white/40 text-sm">Loading...</div>;
  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-white/50">You enter your own rates - Plajah does not look them up. (Automatic address-based rates, e.g. via Stripe Tax, are a later add-on.) Mark each product's tax class and SNAP eligibility in the product editor.</div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40">Standard sales tax %<input value={def} onChange={e => setDef(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="e.g. 8.25" className={inp + ' mt-1'} /></label>
      {classes.map(c => (
        <label key={c} className="block text-[10px] font-black uppercase tracking-widest text-white/40">{TAX_CLASS_LABEL[c] || c} % <span className="normal-case font-medium">(blank = standard rate)</span>
          <input value={rates[c] ?? ''} onChange={e => setRates(r => ({ ...r, [c]: e.target.value.replace(/[^0-9.]/g, '') }))} inputMode="decimal" className={inp + ' mt-1'} /></label>
      ))}
      <div className="flex gap-2"><input value={custom} onChange={e => setCustom(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} placeholder="New class, e.g. CLOTHING" className={inp} />
        <button onClick={() => { if (custom) { setRates(r => ({ ...r, [custom]: '' })); setCustom(''); } }} className="shrink-0 px-3 rounded-lg bg-white/10 text-xs font-black">Add</button></div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={incl} onChange={e => setIncl(e.target.checked)} className="accent-orange-400" />Prices already include tax</label>
      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40">Refunds at or above ($) need a manager PIN<input value={refundAt} onChange={e => setRefundAt(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inp + ' mt-1'} /></label>
      <button onClick={save} className="px-4 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>Save</button>
      {msg && <span className="ml-3 text-xs text-emerald-300 font-bold">{msg}</span>}
    </div>
  );
}

function SalesReports({ businessUid }: { businessUid: string }) {
  const [range, setRange] = useState<ReportRange>('TODAY');
  const [orders, setOrders] = useState<ReturnType<typeof normalizeOrder>[]>([]);
  const [refunds, setRefunds] = useState<ReturnType<typeof normalizeRefund>[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fetchPosOrders(businessUid), fetchRefunds(businessUid), sellerProducts(businessUid).catch(() => [])]).then(([o, r, p]) => {
      setOrders(o.map(normalizeOrder)); setRefunds(r.map(normalizeRefund));
      setCosts(Object.fromEntries((p as any[]).filter(x => x.costPrice > 0).map(x => [x.id, Math.round(x.costPrice * 100)])));   // costPrice is DOLLARS
      setLoading(false);
    });
  }, [businessUid]);
  const rep = useMemo(() => buildSalesReport(orders, refunds, rangeBounds(range), costs), [orders, refunds, range, costs]);
  if (loading) return <div className="text-white/40 text-sm">Loading sales...</div>;
  const maxDay = Math.max(1, ...rep.byDay.map(d => d.salesCents));
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">{(['TODAY', '7D', '30D'] as ReportRange[]).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-full text-[10px] font-black ${range === r ? 'bg-orange-400 text-black' : 'bg-white/10 text-white/60'}`}>{r === 'TODAY' ? 'Today' : r === '7D' ? '7 days' : '30 days'}</button>)}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Net sales', money(rep.netSalesCents)], ['Sales', String(rep.orderCount)], ['Avg ticket', money(rep.avgTicketCents)], ['Margin', rep.marginCents === null ? 'add item costs' : money(rep.marginCents)]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/5 p-2.5"><div className="text-[9px] font-black uppercase tracking-widest text-white/40">{k}</div><div className="text-lg font-black">{v}</div></div>
        ))}
      </div>
      {rep.refundsCents > 0 && <div className="text-xs text-amber-300 font-bold">Refunds in range: {money(rep.refundsCents)}</div>}
      {rep.byDay.length > 1 && <div className="flex items-end gap-1 h-14" aria-label="Sales by day">{rep.byDay.map(d => <div key={d.day} title={`${d.day} ${money(d.salesCents)}`} className="flex-1 rounded-t" style={{ height: `${Math.max(6, d.salesCents / maxDay * 100)}%`, background: 'linear-gradient(180deg,#FF8C00,#D40055)' }} />)}</div>}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">By item</div>
        {rep.byItem.length === 0 ? <div className="text-xs text-white/40">No sales in this range.</div> : rep.byItem.slice(0, 10).map(i => (
          <div key={i.productId + i.title} className="flex justify-between text-xs py-0.5"><span className="truncate pr-2">{i.qty}x {i.title}</span><span className="shrink-0 text-white/70">{money(i.revenueCents)}{i.marginCents !== null ? <span className="text-emerald-300"> ({money(i.marginCents)} margin)</span> : null}</span></div>
        ))}
      </div>
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">By staff</div>
        {rep.byStaff.map(s => <div key={s.staffId} className="flex justify-between text-xs py-0.5"><span>{s.name} - {s.sales} sale{s.sales === 1 ? '' : 's'}{s.refunds ? `, ${s.refunds} refund(s)` : ''}</span><span className="text-white/70">{money(s.salesCents)}</span></div>)}
      </div>
    </div>
  );
}
