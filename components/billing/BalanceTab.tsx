import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Landmark } from 'lucide-react';
import type { BillingBalance, BillingEntityRef } from '../../types';
import { billingApi, fmtDate } from '../../services/billingService';
import { Pill, SkeletonRows, Stat, btnGhost, card, label, money } from './ui';

export const BalanceTab: React.FC<{ entity: BillingEntityRef; compact?: boolean }> = ({ entity, compact }) => {
  const [b, setB] = useState<BillingBalance | null>(null); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { setB(await billingApi.balance(entity)); setErr(null); } catch (e: any) { setErr(e?.message || 'Could not load your balance.'); } finally { setLoading(false); } }, [entity.kind, entity.id]);
  useEffect(() => { load(); }, [load]);
  if (loading && !b) return <SkeletonRows rows={2} />;
  if (err && !b) return <div className={`${card} p-6 text-center`}><p className="text-xs text-red-300" role="alert">{err}</p><button onClick={load} className={btnGhost + ' mt-3'}><RefreshCw size={12} /> Try again</button></div>;
  if (!b) return null;
  const cur = b.currency || 'usd';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><Stat label="Available to pay out" value={money(b.available, cur)} tone="ok" /><Stat label="Pending" value={money(b.pending, cur)} sub="Clearing from recent payments" /></div>
      {!compact && <>
        <div className={`${card} p-5`}><div className="flex items-center justify-between mb-3"><p className={label}>Last 30 days</p><button onClick={load} aria-label="Refresh" className="text-white/40 hover:text-white"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button></div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">{([['Gross', b.last30.gross], ['Fees', -b.last30.fees], ['Refunds', -b.last30.refunds], ['Net', b.last30.net]] as [string, number][]).map(([l, v]) => <div key={l}><dt className={label}>{l}</dt><dd className={`text-base font-black tabular-nums ${v < 0 ? 'text-red-400' : 'text-white'}`}>{money(v, cur)}</dd></div>)}</dl></div>
        <div className={`${card} p-5`}><p className={label + ' mb-2'}>Payouts</p>
          {b.payouts.length === 0 ? <p className="text-xs text-white/40 py-4 text-center">No payouts yet. Stripe pays out to your bank automatically once you've been paid.</p> :
            <ul className="divide-y divide-white/5">{b.payouts.map(p => <li key={p.id} className="py-2.5 flex items-center gap-3 text-xs"><Landmark size={14} className="text-white/30 shrink-0" /><span className="flex-1 text-white/70">{fmtDate(p.arrivalDate)}{p.method ? ` · ${p.method}` : ''}</span><Pill tone={p.status === 'paid' ? 'ok' : p.status === 'failed' || p.status === 'canceled' ? 'bad' : 'warn'}>{p.status === 'paid' ? '✓ ' : ''}{p.status.replace('_', ' ')}</Pill><span className="font-black text-white tabular-nums w-24 text-right">{money(p.amount, cur)}</span></li>)}</ul>}</div>
      </>}
    </div>
  );
};
export default BalanceTab;
