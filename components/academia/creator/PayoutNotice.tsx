/**
 * PayoutNotice — shown wherever a creator sets a price. Paid enrollment pays the instructor straight
 * to their Stripe Connect account, so a priced course with no payout account can be listed but not
 * bought (the checkout refuses). Better to say so before launch than to lose a first sale.
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function PayoutNotice({ price, hasPayouts, onSetup }: { price: number; hasPayouts: boolean; onSetup?: () => void }) {
  if (!(price > 0) || hasPayouts) return null;
  return (
    <div role="note" className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 flex flex-wrap items-center gap-3 text-sm text-amber-100">
      <AlertTriangle size={18} className="shrink-0 text-amber-300" />
      <div className="flex-1 min-w-[200px]">{onSetup ? "Set up payouts before you launch. Learners can't buy a paid course until you have a payout account." : "You'll set up payouts right after you save. Learners can't buy a paid course until you have a payout account."}</div>
      {onSetup && <button type="button" onClick={onSetup} className="px-4 py-2 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-widest">Set up payouts</button>}
    </div>
  );
}
