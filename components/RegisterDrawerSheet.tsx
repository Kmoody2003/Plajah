// RegisterDrawerSheet - open the drawer with a starting float, record cash in / paid-outs / safe drops,
// and close with a blind-ish count -> variance + printable Z report. All math is drawerCore (pure) and the
// authoritative close happens server-side (/api/register/drawer), so a cashier cannot edit the Z report.

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { drawerStatus, drawerOpen, drawerMove, drawerClose, type DrawerView } from '../services/registerService';
import { MOVEMENT_LABEL, varianceLabel, type ZReport } from '../services/drawerCore';
import { printReport } from '../services/posPeripherals';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const toCents = (s: string) => { const v = Math.round(parseFloat(s) * 100); return Number.isFinite(v) ? v : 0; };

export function zRows(z: ZReport): Array<[string, string] | string> {
  const r: Array<[string, string] | string> = [
    [`Sales (${z.saleCount})`, money(z.grossSalesCents)], ['Discounts', money(-z.discountsCents)], [`Refunds (${z.refundCount})`, money(-z.refundsNetCents)],
    ['NET SALES', money(z.netSalesCents)], ['Tax collected', money(z.taxCollectedCents)], ['Tips', money(z.tipsCents)], '',
    'BY TENDER', ...z.byTender.map(t => [t.label, money(t.netCents)] as [string, string]), '',
    ...(z.storedValue && (z.storedValue.soldCents || z.storedValue.redeemedCents || z.storedValue.creditIssuedCents) ? ['GIFT CARDS / CREDIT / WALLETS (liability, not revenue)', ['Sold + reloaded', money(z.storedValue.soldCents)], ['Redeemed as payment', money(z.storedValue.redeemedCents)], ['Store credit issued (refunds)', money(z.storedValue.creditIssuedCents)], ''] as Array<[string, string] | string> : []),
    'BY STAFF', ...z.byStaff.map(s => [s.name, money(s.salesCents)] as [string, string]), '',
    'CASH DRAWER', ['Starting float', money(z.cash.startFloatCents)], ['Cash sales', money(z.cash.salesCents)], ['Cash refunds', money(-z.cash.refundsCents)],
    ['Cash in', money(z.cash.inCents)], ['Paid out', money(-z.cash.outCents)], ['Safe drops', money(-z.cash.dropsCents)], ['Expected', money(z.cash.expectedCents)],
  ];
  if (z.cash.countedCents !== undefined) r.push(['Counted', money(z.cash.countedCents)], ['Variance', varianceLabel(z.cash.varianceCents ?? 0)]);
  r.push('', 'TOP ITEMS', ...z.topItems.slice(0, 5).map(i => [`${i.qty}x ${i.title}`, money(i.revenueCents)] as [string, string]));
  return r;
}

export default function RegisterDrawerSheet({ businessUid, token, onClose }: { businessUid: string; token?: string | null; onClose: () => void }) {
  const [open, setOpen] = useState<DrawerView | null>(null);
  const [live, setLive] = useState<ZReport | null>(null);
  const [done, setDone] = useState<ZReport | null>(null);
  const [float, setFloat] = useState('100.00');
  const [mvType, setMvType] = useState('PAID_OUT');
  const [mvAmt, setMvAmt] = useState('');
  const [mvNote, setMvNote] = useState('');
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const r = await drawerStatus(businessUid, token); setOpen(r.open); setLive(r.z || null); }
    catch (e: any) { setErr(e?.message || 'Could not load the drawer.'); }
    setLoading(false);
  }, [businessUid, token]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e?.message || 'Failed.'); } setBusy(false); };
  const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 w-full';

  return createPortal(
    <div className="fixed inset-0 z-[210] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Cash drawer">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121a] border border-white/10 text-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-black italic" style={{ fontFamily: 'Outfit, sans-serif' }}>Cash drawer</div>
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Close</button>
        </div>
        {loading && <div className="text-white/40 text-sm py-8 text-center">Loading...</div>}
        {err && <div className="text-red-400 text-xs font-bold">{err}</div>}

        {!loading && done && (
          <div className="space-y-2" data-testid="z-report">
            <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/30 p-3 text-sm font-bold text-emerald-200">Drawer closed - {varianceLabel(done.cash.varianceCents ?? 0)}</div>
            <div className="rounded-xl bg-white/5 p-3 text-sm space-y-0.5 font-mono">
              {zRows(done).map((r, i) => typeof r === 'string' ? <div key={i} className={r ? 'pt-1 text-[10px] font-black tracking-widest text-white/40' : 'h-1'}>{r}</div> : <div key={i} className="flex justify-between"><span>{r[0]}</span><span>{r[1]}</span></div>)}
            </div>
            <button onClick={() => printReport('Z REPORT', zRows(done))} className="w-full py-3 rounded-xl font-black text-white" style={{ background: GRAD }}>Print Z report</button>
          </div>
        )}

        {!loading && !done && !open && (
          <div className="space-y-2">
            <div className="text-sm text-white/60">Count the cash in the drawer and enter it as the starting float.</div>
            <input value={float} onChange={e => setFloat(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inp} aria-label="Starting float" />
            <button disabled={busy} onClick={() => run(async () => { const r = await drawerOpen(businessUid, toCents(float), token); setOpen(r.open); })} className="w-full py-3 rounded-xl font-black text-white disabled:opacity-40" style={{ background: GRAD }}>Open drawer</button>
          </div>
        )}

        {!loading && !done && open && (
          <div className="space-y-3">
            <div className="rounded-xl bg-white/5 p-3 text-sm">
              <div className="flex justify-between"><span className="text-white/50">Opened by</span><span className="font-bold">{open.openedByName || 'Staff'} - {new Date(open.openedAt).toLocaleTimeString()}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Starting float</span><span className="font-bold">{money(open.startFloatCents)}</span></div>
              {live && <div className="flex justify-between"><span className="text-white/50">Expected cash now</span><span className="font-black text-emerald-300">{money(live.cash.expectedCents)}</span></div>}
              {open.movements.map((m, i) => <div key={i} className="flex justify-between text-xs text-white/60"><span>{MOVEMENT_LABEL[m.type]}{m.note ? ` - ${m.note}` : ''}</span><span>{m.type === 'PAID_IN' ? '+' : '-'}{money(m.amountCents)}</span></div>)}
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Cash in / paid out / safe drop</div>
              <div className="flex gap-2">
                <select value={mvType} onChange={e => setMvType(e.target.value)} className={inp + ' !w-auto'} aria-label="Movement type"><option value="PAID_OUT">Paid out</option><option value="PAID_IN">Cash in</option><option value="DROP">Safe drop</option></select>
                <input value={mvAmt} onChange={e => setMvAmt(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="$" inputMode="decimal" className={inp + ' !w-24'} aria-label="Movement amount" />
                <input value={mvNote} onChange={e => setMvNote(e.target.value)} placeholder="Note (ice, change...)" className={inp} />
              </div>
              <button disabled={busy || !(toCents(mvAmt) > 0)} onClick={() => run(async () => { const r = await drawerMove(businessUid, { type: mvType, amountCents: toCents(mvAmt), note: mvNote }, token); setOpen(r.open); setMvAmt(''); setMvNote(''); load(); })} className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest disabled:opacity-30">Record</button>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Close and count</div>
              <input value={counted} onChange={e => setCounted(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Cash counted $" inputMode="decimal" className={inp} aria-label="Counted cash" />
              <button disabled={busy || counted === ''} onClick={() => run(async () => { const r = await drawerClose(businessUid, toCents(counted), token); setDone(r.z); setOpen(null); })} className="w-full py-3 rounded-xl font-black text-white disabled:opacity-30" style={{ background: GRAD }}>Close drawer + Z report</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
