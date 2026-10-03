import React from 'react';
import { Sparkles } from 'lucide-react';
import { BILLING_FLAGS } from '../../services/billingFlags';
import type { BillingFlagKey } from '../../types';
import { card } from './ui';

/** Polished placeholder for a feature whose platform flag is OFF. Never renders half-working UI. */
export const ComingSoon: React.FC<{ flag: BillingFlagKey; feature?: string; compact?: boolean }> = ({ flag, feature, compact }) => {
  const meta = BILLING_FLAGS.find(f => f.key === flag);
  const title = feature || meta?.label || 'This feature';
  return (
    <div className={`${card} ${compact ? 'p-5' : 'p-8 sm:p-12'} text-center`} role="status">
      <div className={`mx-auto ${compact ? 'w-10 h-10' : 'w-14 h-14'} rounded-2xl bg-small-orange/10 border border-small-orange/30 flex items-center justify-center text-small-orange mb-4`}><Sparkles size={compact ? 18 : 24} /></div>
      <p className="text-[9px] font-black uppercase tracking-widest text-small-orange">Coming soon</p>
      <h3 className={`${compact ? 'text-sm' : 'text-xl'} font-black text-white mt-1`}>{title}</h3>
      {meta?.blurb && <p className="text-xs text-white/50 mt-2 max-w-md mx-auto leading-relaxed">{meta.blurb}</p>}
      <p className="text-[10px] text-white/30 mt-4">We're putting the finishing touches on this. It will appear here automatically — nothing for you to set up yet.</p>
    </div>
  );
};
export default ComingSoon;
