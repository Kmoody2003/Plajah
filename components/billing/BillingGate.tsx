import React, { useState } from 'react';
import type { BillingEntityRef, BillingFlagKey } from '../../types';
import { useBillingFlags, BILLING_FLAGS } from '../../services/billingFlags';
import { useBillingConnection } from '../../services/billingService';
import { ComingSoon } from './ComingSoon';
import { ConnectStripeCard } from './ConnectStripeCard';
import { PreviewBadge, SkeletonRows } from './ui';

/**
 * Three-state gate for every Billing feature:
 *   flag OFF            → <ComingSoon/>   (admins get a "preview" badge and see the real UI)
 *   flag ON, no Stripe  → <ConnectStripeCard/> one-tap connect   (needsStripe=false skips this, e.g. customers / price book)
 *   both OK             → children
 */
export const BillingGate: React.FC<{
  entity: BillingEntityRef; flag: BillingFlagKey; feature?: string; children: React.ReactNode;
  needsStripe?: boolean; canManage?: boolean; compact?: boolean;
}> = ({ entity, flag, feature, children, needsStripe = true, canManage = true, compact }) => {
  const flags = useBillingFlags();
  const on = flags.enabled(flag); const previewing = flags.preview(flag);
  const name = feature || BILLING_FLAGS.find(f => f.key === flag)?.label || 'this';
  const visible = on || previewing;
  const c = useBillingConnection(entity, { enabled: visible && needsStripe });
  const [skip, setSkip] = useState(false);

  if (!flags.loaded) return <SkeletonRows rows={2} />;
  if (!visible) return <ComingSoon flag={flag} feature={feature} compact={compact} />;

  const badge = previewing ? <div className="mb-3"><PreviewBadge /></div> : null;
  if (needsStripe && !c.ready && !(previewing && skip)) {
    if (c.loading) return <SkeletonRows rows={2} />;
    return (
      <>
        {badge}
        <ConnectStripeCard feature={name} conn={c.conn} error={c.comingSoon ? null : c.error} canManage={canManage}
          onConnect={c.connect} onRecheck={() => c.refresh(true)} onSkipPreview={previewing ? () => setSkip(true) : undefined} />
      </>
    );
  }
  return <>{badge}{children}</>;
};
export default BillingGate;
