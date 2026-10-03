// EstimatePublicView — the page a customer lands on from an estimate link (/estimate/<token>).
// No sign-in needed: the unguessable token is the credential. Shows the quote, lets them accept or decline.
// Server: GET /api/billing/estimates/public?token=…  ·  POST /api/billing/estimates/respond {token, decision}.
import React, { useEffect, useState } from 'react';
import { Check, Clock, Loader2, X } from 'lucide-react';

interface PublicEstimate {
  number: string; entityName?: string; customerName?: string;
  lines: { description: string; quantity: number; unitAmount: number }[];
  subtotal?: number; discount?: number; tax?: number; total: number; currency?: string;
  validUntil?: string; memo?: string; status: string;
}

const money = (n: number | undefined, cur = 'usd') => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur.toUpperCase() }).format(n || 0); }
  catch { return `$${(n || 0).toFixed(2)}`; }
};

const EstimatePublicView: React.FC<{ token: string; onClose?: () => void }> = ({ token, onClose }) => {
  const [est, setEst] = useState<PublicEstimate | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<'ACCEPT' | 'DECLINE' | null>(null);
  const [done, setDone] = useState<string>('');

  useEffect(() => {
    let alive = true;
    fetch(`/api/billing/estimates/public?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setMsg(j.code === 'COMING_SOON' ? 'Online estimates are not available yet.' : (j.error || 'We could not find this estimate.')); setState('error'); return; }
        setEst(j.estimate); setState('ready');
      })
      .catch(() => { if (alive) { setMsg('Could not load this estimate. Check your connection and try again.'); setState('error'); } });
    return () => { alive = false; };
  }, [token]);

  const respond = async (decision: 'ACCEPT' | 'DECLINE') => {
    setBusy(decision); setMsg('');
    try {
      const r = await fetch('/api/billing/estimates/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, decision }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'That did not go through.'); if (j.status) setEst(e => e ? { ...e, status: j.status } : e); }
      else setDone(j.status);
    } catch { setMsg('Could not send your response. Please try again.'); }
    setBusy(null);
  };

  const status = done || est?.status;
  const canRespond = state === 'ready' && est?.status === 'SENT' && !done;

  return (
    <div className="fixed inset-0 z-[320] bg-black/80 backdrop-blur overflow-y-auto p-4 flex items-start sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Estimate">
      <div className="w-full max-w-lg bg-[#0c0c0f] border border-white/10 rounded-3xl p-6 sm:p-8 relative my-6">
        {onClose && <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white" aria-label="Close"><X size={16} /></button>}
        {state === 'loading' && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/40" /></div>}
        {state === 'error' && <p className="text-center text-white/70 py-12 text-sm">{msg}</p>}
        {state === 'ready' && est && (
          <>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Estimate {est.number}</p>
            <h1 className="text-2xl font-black text-white mt-1">{est.entityName || 'Estimate'}</h1>
            {est.customerName && <p className="text-sm text-white/50 mt-1">Prepared for {est.customerName}</p>}
            {est.validUntil && <p className="text-[11px] text-white/40 mt-1 flex items-center gap-1.5"><Clock size={11} /> Valid until {est.validUntil}</p>}

            <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
              {est.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-4 py-3 text-sm">
                  <span className="text-white/80">{l.description}{l.quantity !== 1 && <span className="text-white/40"> × {l.quantity}</span>}</span>
                  <span className="text-white font-bold shrink-0">{money(l.quantity * l.unitAmount, est.currency)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 text-sm">
              {!!est.discount && <div className="flex justify-between text-white/50"><span>Discount</span><span>−{money(est.discount, est.currency)}</span></div>}
              {!!est.tax && <div className="flex justify-between text-white/50"><span>Tax</span><span>{money(est.tax, est.currency)}</span></div>}
              <div className="flex justify-between text-lg font-black text-white pt-1"><span>Total</span><span>{money(est.total, est.currency)}</span></div>
            </div>
            {est.memo && <p className="mt-4 text-xs text-white/50 leading-relaxed whitespace-pre-wrap">{est.memo}</p>}

            {msg && <p className="mt-4 text-xs text-red-400">{msg}</p>}

            {canRespond ? (
              <div className="mt-6 flex gap-2">
                <button onClick={() => respond('DECLINE')} disabled={!!busy} className="flex-1 py-3 rounded-full border border-white/15 bg-white/5 text-white/70 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-40">{busy === 'DECLINE' ? '…' : 'Decline'}</button>
                <button onClick={() => respond('ACCEPT')} disabled={!!busy} className="flex-1 py-3 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2">{busy === 'ACCEPT' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Accept estimate</button>
              </div>
            ) : (
              <p className="mt-6 text-center text-sm font-bold text-white/70">
                {status === 'ACCEPTED' ? 'Thanks — you accepted this estimate. They will be in touch with an invoice.' :
                  status === 'DECLINED' ? 'You declined this estimate.' :
                  status === 'EXPIRED' ? 'This estimate has expired.' :
                  status === 'CONVERTED' ? 'This estimate has already been accepted and invoiced.' : 'This estimate is not open for a response.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EstimatePublicView;
