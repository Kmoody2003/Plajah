import React, { useState } from 'react';
import { Landmark, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { BillingConnection } from '../../types';
import { card, btnPrimary, btnGhost, useToast } from './ui';

const humanize = (r: string) => r.replace(/^(individual|company|business_profile|representative|person_\w+)\./, '').replace(/[._]/g, ' ');

/** "Connect Stripe to turn this on" — explains direct payouts and starts onboarding in one tap. */
export const ConnectStripeCard: React.FC<{
  feature: string; conn: BillingConnection | null; busy?: boolean; error?: string | null;
  onConnect: () => Promise<void>; onRecheck: () => Promise<void> | void; canManage?: boolean; onSkipPreview?: () => void;
}> = ({ feature, conn, busy, error, onConnect, onRecheck, canManage = true, onSkipPreview }) => {
  const toast = useToast(); const [working, setWorking] = useState(false);
  const started = !!conn?.stripeAccountId; const due = conn?.requirementsDue || [];
  const go = async () => { setWorking(true); try { await onConnect(); } catch (e: any) { toast(e?.message || 'Could not open Stripe.', { tone: 'bad' }); setWorking(false); } };
  return (
    <div className={`${card} p-6 sm:p-10 max-w-xl mx-auto text-center`}>
      <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4"><Landmark size={24} /></div>
      <h3 className="text-lg font-black text-white">Connect Stripe to turn {feature} on</h3>
      <p className="text-xs text-white/50 mt-2 leading-relaxed">
        {started ? 'Your Stripe account is created but Stripe still needs a few details before you can take payments.' : 'Payments go straight to your own Stripe account and pay out to your bank. Plajah never holds your money.'}
      </p>
      {started && due.length > 0 && (
        <ul className="mt-4 text-left text-[11px] text-amber-200/90 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3 space-y-1" aria-label="Details Stripe still needs">
          {due.slice(0, 6).map(r => <li key={r} className="capitalize">• {humanize(r)}</li>)}
          {due.length > 6 && <li>…and {due.length - 6} more</li>}
        </ul>
      )}
      {error && <p className="text-[11px] text-red-300 mt-3" role="alert">{error}</p>}
      {canManage ? (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-5">
          <button onClick={go} disabled={working || busy} className={`${btnPrimary} w-full sm:w-auto`}>{working ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} {started ? 'Finish Stripe setup' : 'Connect Stripe'}</button>
          {started && <button onClick={() => onRecheck()} className={`${btnGhost} w-full sm:w-auto`}><RefreshCw size={12} /> I've finished — re-check</button>}
        </div>
      ) : <p className="text-[11px] text-white/40 mt-5">Ask an owner or admin of this account to connect Stripe.</p>}
      {onSkipPreview && <button onClick={onSkipPreview} className="mt-4 text-[10px] font-black uppercase tracking-widest text-violet-300 hover:text-violet-200">Admin: preview the UI without Stripe</button>}
      <p className="text-[10px] text-white/30 mt-5">Takes about 5 minutes. Stripe handles identity and bank details securely.</p>
    </div>
  );
};
export default ConnectStripeCard;
