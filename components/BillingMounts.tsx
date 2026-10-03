// BillingMounts — shared, defensive mount helpers for Plajah Billing inside host surfaces (Finance Hub, Business
// dashboard, Creator Hub, Film suite). Lazy so a late/missing billing component never breaks a host; every
// mount is behind the platform flags in services/billingFlags.ts (OFF = "Soon" pill / Coming-soon card).
import React, { Suspense, lazy } from 'react';
import type { BillingEntityRef } from '../types';
import { useBillingFlags } from '../services/billingFlags';

const BillingHubLazy = lazy(() => import('./billing/BillingHub').then(m => ({ default: ((m as any).BillingHub || (m as any).default) as React.ComponentType<any> })));
const BillingSummaryCardLazy = lazy(() => import('./billing/BillingSummaryCard').then(m => ({ default: ((m as any).BillingSummaryCard || (m as any).default) as React.ComponentType<any> })));

class Boundary extends React.Component<{ children?: React.ReactNode; label?: string }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    return this.state.err
      ? <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/40">{this.props.label || 'Billing'} is not available right now.</div>
      : this.props.children;
  }
}
const Spin = () => <div className="p-6 text-center text-[11px] text-white/30">Loading billing…</div>;

/** 'on' = live for everyone, 'preview' = flag OFF but the viewer is an admin, 'soon' = OFF (roadmap pill). */
export function useBillingNav(): { state: 'on' | 'preview' | 'soon'; loaded: boolean } {
  const f = useBillingFlags();
  return { state: f.enabled('INVOICES') ? 'on' : f.preview('INVOICES') ? 'preview' : 'soon', loaded: f.loaded };
}

export const SoonPill: React.FC<{ label?: string }> = ({ label = 'Soon' }) => (
  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 text-[8px] font-black uppercase tracking-widest align-middle">{label}</span>
);

export const ComingSoonCard: React.FC<{ title: string; blurb: string; preview?: boolean }> = ({ title, blurb, preview }) => (
  <div className="p-6 rounded-2xl bg-white/[0.03] border border-dashed border-white/15 text-center space-y-1.5">
    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{preview ? 'Admin preview · off for everyone else' : 'Coming soon'}</p>
    <p className="text-sm font-black text-white">{title}</p>
    <p className="text-xs text-white/50 max-w-md mx-auto">{blurb}</p>
  </div>
);

/** Full billing hub for an entity. Shows a Coming-soon card while INVOICES is OFF (admins get a preview). */
export const BillingHubMount: React.FC<{
  entity: BillingEntityRef; entityName: string; canManage: boolean; accounting?: boolean; onClose?: () => void;
}> = props => {
  const { state } = useBillingNav();
  if (state === 'soon') return <ComingSoonCard title="Plajah Billing" blurb="Invoices, estimates, payment links and payouts — paid straight to your own Stripe account. Launching soon." />;
  return (
    <Boundary>
      <Suspense fallback={<Spin />}>
        {state === 'preview' && <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-amber-400/80">Admin preview · billing is off for everyone else</p>}
        <BillingHubLazy {...props} />
      </Suspense>
    </Boundary>
  );
};

/** Compact summary card (outstanding / overdue / paid). Renders nothing while billing is OFF for the viewer. */
export const BillingSummaryMount: React.FC<{ entity: BillingEntityRef }> = ({ entity }) => {
  const { state } = useBillingNav();
  if (state === 'soon') return null;
  return <Boundary><Suspense fallback={null}><BillingSummaryCardLazy entity={entity} /></Suspense></Boundary>;
};
