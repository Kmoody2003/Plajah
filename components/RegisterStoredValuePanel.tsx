// RegisterStoredValuePanel - back office for gift cards / store credit / wallets: liability report (outstanding
// balance, active cards, issued / redeemed by period, breakage as DATA ONLY), card search by last 4 or customer,
// and void / adjust / comp-issue with a reason (+ manager PIN when the signed-in user is not a manager).
// Full codes are never available here - only the last 4 - because the server stores just a hash.

import React, { useCallback, useEffect, useState } from 'react';
import { svAdmin, svModify, svIssue, type SvAdminCard } from '../services/registerService';
import { CARD_KIND_LABEL, LEDGER_LABEL, type LiabilityReport } from '../services/storedValueCore';
import { rangeBounds, type ReportRange } from '../services/drawerCore';

const money = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 w-full';

export default function RegisterStoredValuePanel({ businessUid, token }: { businessUid: string; token?: string | null }) {
  const [range, setRange] = useState<ReportRange>('30D');
  const [q, setQ] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof svAdmin>> | null>(null);
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<SvAdminCard | null>(null);
  const [reason, setReason] = useState(''); const [pin, setPin] = useState(''); const [delta, setDelta] = useState('');
  const [msg, setMsg] = useState('');
  const [compAmt, setCompAmt] = useState(''); const [compReason, setCompReason] = useState(''); const [compCode, setCompCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { const b = rangeBounds(range); setData(await svAdmin({ businessUid, q, from: b.from, to: b.to, cardId: sel?.id }, token)); }
    catch (e: any) { setErr(e?.message || 'Could not load.'); }
    setLoading(false);
  }, [businessUid, range, q, sel?.id, token]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]);

  const r: LiabilityReport | undefined = data?.report;
  const act = async (action: 'VOID' | 'ADJUST') => {
    if (!sel) return;
    setMsg('');
    try {
      const out = await svModify({ businessUid, cardId: sel.id, action, reason, ...(action === 'ADJUST' ? { deltaCents: Math.round(parseFloat(delta) * 100) } : {}), ...(pin ? { managerPin: pin } : {}) }, token);
      setMsg(`${action === 'VOID' ? 'Voided' : 'Adjusted'}. Balance now ${money(out.balanceCents)}.`); setReason(''); setDelta(''); setPin(''); setSel(null); load();
    } catch (e: any) { setMsg(e?.message || 'Failed.'); }
  };
  const comp = async () => {
    setMsg(''); setCompCode('');
    try {
      const out = await svIssue({ businessUid, kind: 'GIFT', amountCents: Math.round(parseFloat(compAmt) * 100), reason: compReason, ...(pin ? { managerPin: pin } : {}) }, token);
      setCompCode(out.code || ''); setCompAmt(''); setCompReason(''); load();
    } catch (e: any) { setMsg(e?.message || 'Failed.'); }
  };

  return (
    <div className="space-y-3" data-testid="stored-value-panel">
      <div className="flex gap-1.5">{(['TODAY', '7D', '30D'] as ReportRange[]).map(x => <button key={x} onClick={() => setRange(x)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${range === x ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}>{x === 'TODAY' ? 'Today' : x}</button>)}</div>
      {err && <div className="text-xs text-red-300 font-bold">{err}</div>}
      {r && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[['Outstanding (liability)', money(r.outstandingCents)], ['Active cards', String(r.activeCards)], ['Issued', money(r.issuedCents)], ['Redeemed', money(r.redeemedCents)],
            ['Wallet reloads', money(r.reloadedCents)], ['Credit from refunds', money(r.restoredCents)], ['Voided / expired', money(r.voidedCents + r.expiredCents)], ['Dormant 12mo+ (data only)', `${money(r.breakage.dormantCents)} / ${r.breakage.dormantCards}`]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white/5 p-2.5"><div className="text-[9px] uppercase tracking-widest text-white/40 font-bold">{l}</div><div className="text-sm font-black">{v}</div></div>
          ))}
        </div>
      )}
      {r && <div className="text-[10px] text-white/40">Gift cards sold are a liability until redeemed - they are not in Sales revenue. Dormant balances are shown as data only; talk to your accountant (and state unclaimed-property law) before treating any as breakage.</div>}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a card: last 4, customer id, recipient email" aria-label="Search cards" className={inp} />
      <div className="max-h-72 overflow-y-auto space-y-1">
        {loading && !data ? <div className="text-xs text-white/40">Loading...</div> : (data?.cards || []).map(c => (
          <button key={c.id} onClick={() => { setSel(c); setMsg(''); }} className={`w-full text-left rounded-lg px-3 py-2 text-xs flex items-center justify-between ${sel?.id === c.id ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'}`}>
            <span><b>{CARD_KIND_LABEL[c.kind]}</b> ...{c.last4} <span className="text-white/40">{c.customerUid ? `cust ${c.customerUid.slice(0, 8)}` : c.recipientEmail || ''} {new Date(c.createdAt).toLocaleDateString()}</span></span>
            <span className={c.status === 'ACTIVE' ? 'font-black' : 'text-white/40 line-through'}>{money(c.balanceCents)}{c.status !== 'ACTIVE' ? ` ${c.status}` : ''}</span>
          </button>
        ))}
        {data && !data.cards.length && <div className="text-xs text-white/40">No cards yet.</div>}
      </div>
      {data?.truncated && <div className="text-[10px] text-amber-300">Showing the first 1,000 cards / 3,000 ledger entries - the totals above may be incomplete.</div>}

      {sel && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-sm font-black">{CARD_KIND_LABEL[sel.kind]} ...{sel.last4} - {money(sel.balanceCents)} ({sel.status})</div>
          <div className="max-h-32 overflow-y-auto text-[11px] text-white/60 space-y-0.5">
            {(data?.ledger || []).filter(l => l.cardId === sel.id).map(l => <div key={l.id}>{new Date(l.at).toLocaleString()} - {LEDGER_LABEL[l.type]} {money(l.deltaCents)} to {money(l.balanceAfterCents)}{l.byName ? ` - ${l.byName}` : ''}{l.reason ? ` - ${l.reason}` : ''}</div>)}
          </div>
          {sel.status === 'ACTIVE' && (
            <>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required, goes in the audit ledger)" aria-label="Reason" className={inp} />
              <div className="flex gap-2">
                <input value={delta} onChange={e => setDelta(e.target.value.replace(/[^0-9.\-]/g, ''))} placeholder="Adjust by $ (+/-)" aria-label="Adjust amount" className={inp} />
                <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} type="password" placeholder="Manager PIN (if needed)" aria-label="Manager PIN" className={inp} />
              </div>
              <div className="flex gap-2">
                <button disabled={!reason.trim() || !delta} onClick={() => act('ADJUST')} className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase disabled:opacity-30">Adjust</button>
                <button disabled={!reason.trim()} onClick={() => { if (window.confirm(`Void this card and zero its ${money(sel.balanceCents)} balance? This cannot be undone.`)) act('VOID'); }} className="flex-1 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-black uppercase disabled:opacity-30">Void</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Comp a gift card (manager)</div>
        <div className="flex gap-2"><input value={compAmt} onChange={e => setCompAmt(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="$" aria-label="Comp amount" className={inp + ' !w-24'} /><input value={compReason} onChange={e => setCompReason(e.target.value)} placeholder="Reason (required)" aria-label="Comp reason" className={inp} /></div>
        <button disabled={!compAmt || !compReason.trim()} onClick={comp} className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase disabled:opacity-30">Issue comped card</button>
        {compCode && <div className="font-mono text-sm font-black">{compCode}<div className="font-sans text-[10px] text-white/50 font-normal">Shown once. Write it down or hand it over now.</div></div>}
      </div>
      {msg && <div className="text-xs font-bold text-emerald-300">{msg}</div>}
    </div>
  );
}
