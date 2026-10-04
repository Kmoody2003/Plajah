// PickupPanel - what the attendant needs at the counter when the customer comes for the laundry:
//  - which bags are handed over (partial pickup) and which are missing
//  - the customer's Plajah wallet balance, a low-wallet nudge, and a top-up (with the promo bonus) before paying
// Paying itself stays the ticket's existing "Take payment" (RegisterTenderSheet with the WALLET tender).
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { computeTicketTotals, stageKind } from '../../../services/ticketCore';
import { bagsOutstanding, pickUpTags, tagRows } from '../../../services/laundryCore';
import { computeTopUpBonus, walletNudge } from '../../../services/walletPromoCore';
import { Section, useLaundry, useRun, Err, Ok, inp, money, pill, type PanelProps } from './shared';

const RegisterGiftSheet = lazy(() => import('../../RegisterGiftSheet'));

export default function PickupPanel({ api, cfg, ticket: t, apply, closed }: PanelProps) {
  const { laundry, settings } = useLaundry(api);
  const { busy, err, setErr, run } = useRun();
  const [sel, setSel] = useState<string[]>([]); const [msg, setMsg] = useState('');
  const [wallet, setWallet] = useState<number | null | undefined>(undefined); const [topUp, setTopUp] = useState(false);
  const [find, setFind] = useState(''); const [hits, setHits] = useState<{ uid: string; name: string }[]>([]);
  const rows = tagRows(t.subject); const stillOut = bagsOutstanding(t.subject);
  const kind = stageKind(cfg, t.stage); const atCounter = kind === 'READY' || kind === 'DONE';
  const uid = t.customer.uid;
  const due = useMemo(() => computeTicketTotals(t, cfg).balanceCents, [t, cfg]);

  const refreshWallet = useCallback(() => { if (uid && laundry) laundry.walletBalance(uid).then(setWallet).catch(() => setWallet(null)); else setWallet(undefined); }, [uid, laundry]);
  useEffect(refreshWallet, [refreshWallet]);

  const nudge = wallet !== undefined && wallet !== null ? walletNudge({ balanceCents: wallet, dueCents: closed ? 0 : due, promo: settings.promo }) : null;
  const lookup = async (q: string) => {
    setFind(q); if (q.trim().length < 3) return setHits([]);
    try { const { searchUsers } = await import('../../../services/backendService'); const r = await searchUsers(q.trim()); setHits(r.slice(0, 5).map((u: any) => ({ uid: u.uid, name: u.displayName || u.username || u.uid }))); } catch { setHits([]); }
  };
  const handOver = () => run(async () => {
    const r = pickUpTags(t.subject, sel); if (r.unknown.length) throw new Error(`Unknown tag: ${r.unknown[0]}`);
    return api.update(t.id, { subject: { picked_tags: r.subject.picked_tags || [], missing_tags: r.subject.missing_tags || [] }, note: { text: `Handed over ${r.picked.join(', ')}${r.allPicked ? ' (all bags)' : ` (${stillOut - r.picked.length} bag(s) still here)`}`, internal: true } });
  }, nt => { apply(nt); setSel([]); setMsg('Recorded.'); });

  if (!atCounter && !rows.length && !uid) return null;
  return (
    <Section title="Pickup & wallet">
      <Err text={err} /><Ok text={msg} />
      {rows.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-white/50">{stillOut === 0 ? 'All bags have been handed over.' : `${stillOut} of ${rows.length} bag(s) still in the store. Tick the bags the customer is taking now.`}</div>
          <div className="flex flex-wrap gap-1.5">{rows.filter(r => r.state !== 'PICKED_UP').map(r => {
            const on = sel.includes(r.code);
            return <button key={r.code} onClick={() => setSel(on ? sel.filter(c => c !== r.code) : [...sel, r.code])} aria-pressed={on} className={`px-3 py-1.5 rounded-full text-[11px] font-mono font-bold ${on ? 'bg-emerald-400 text-black' : r.state === 'MISSING' ? 'bg-[#D40055]/25 text-[#ff7aa8]' : 'bg-white/10 text-white/70'}`}>{r.code}{r.state === 'MISSING' ? ' (missing)' : ''}</button>;
          })}</div>
          {sel.length > 0 && <button disabled={busy} onClick={handOver} className={pill}>Hand over {sel.length} bag(s)</button>}
          {stillOut > 0 && stillOut < rows.length && !closed && <div className="text-[11px] text-amber-300">Partial pickup: paying settles the whole ticket. The remaining bags stay listed here so nothing is forgotten.</div>}
        </div>)}
      {uid ? (
        <div className="space-y-1.5">
          <div className="text-sm font-bold">Wallet: {wallet === undefined ? '...' : wallet === null ? <span className="text-white/50 font-normal">none yet</span> : money(wallet)}</div>
          {nudge && nudge.level !== 'ok' && <div className={`text-xs rounded-lg px-2.5 py-1.5 ${nudge.level === 'short' ? 'bg-amber-400/15 text-amber-200' : 'bg-white/5 text-white/60'}`}>{nudge.message}</div>}
          {wallet === null && settings.promo.enabled && <div className="text-xs text-white/50">{computeTopUpBonus(settings.promo, settings.promo.tiers[0]?.minLoadCents || 0).label || 'Load the wallet at the counter to pay faster next time.'}</div>}
          <button onClick={() => setTopUp(true)} className={pill}>Top up wallet</button>
        </div>
      ) : !closed ? (
        <div className="space-y-1">
          <div className="text-xs text-white/40">Attach the customer's Plajah account to pay from their wallet.</div>
          <input value={find} onChange={e => lookup(e.target.value)} placeholder="Search name or @handle" aria-label="Find Plajah customer" className={inp} />
          {hits.map(h => <button key={h.uid} disabled={busy} onClick={() => run(() => api.update(t.id, { customer: { uid: h.uid } }), nt => { apply(nt); setHits([]); setFind(''); })} className="block w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10">{h.name}</button>)}
        </div>) : null}
      {topUp && uid && api.ctx && <Suspense fallback={null}><RegisterGiftSheet mode="RELOAD" businessUid={api.ctx.businessUid} token={api.ctx.sessionToken} customer={{ uid, name: t.customer.name }} onClose={() => { setTopUp(false); refreshWallet(); }} /></Suspense>}
    </Section>
  );
}
