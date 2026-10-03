// billingFlags — platform switches for Plajah Billing. Every feature ships built but OFF: the UI shows
// "Coming soon" until Kenne flips it on (no redeploy) at Firestore doc `config/billingFlags`
// ({ INVOICES: true, ... }). Admins always see features (marked "preview") so they can test before launch.
// Separate from the per-entity READINESS check: flag on + Stripe not connected → "Connect Stripe to turn this on".

import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onSnapshot } from './safeSnapshot';
import type { BillingFlagKey } from '../types';

export interface BillingFlagMeta { key: BillingFlagKey; label: string; blurb: string; needs?: string }

export const BILLING_FLAGS: BillingFlagMeta[] = [
  { key: 'INVOICES',           label: 'Invoices',                 blurb: 'Create, send and collect invoices paid straight to your own Stripe account.' },
  { key: 'ESTIMATES',          label: 'Estimates & quotes',       blurb: 'Send a quote, get it accepted, convert it to an invoice in one tap.' },
  { key: 'RECURRING_INVOICES', label: 'Recurring invoices',       blurb: 'Retainers, rent and memberships billed automatically.' },
  { key: 'INSTALLMENTS',       label: 'Deposits & milestones',    blurb: 'Split an invoice into deposit + milestone payments.' },
  { key: 'REMINDERS',          label: 'Automatic reminders',      blurb: 'Gentle nudges before and after the due date.' },
  { key: 'PAYMENT_LINKS',      label: 'Payment links & QR',       blurb: 'A pay-me link or QR for tips, deposits and one-off payments.' },
  { key: 'CUSTOMERS',          label: 'Customers',                blurb: 'A simple customer list with billing history.' },
  { key: 'PRICE_BOOK',         label: 'Price book',               blurb: 'Reusable products and services to drop into invoices.' },
  { key: 'BALANCE_DASHBOARD',  label: 'Balance & payouts',        blurb: 'Live Stripe balance, payouts, fees and refunds for your account.' },
  { key: 'SALES_TAX',          label: 'Sales tax',                blurb: 'Automatic tax calculation via Stripe Tax.', needs: 'Stripe Tax enabled on the connected account' },
  { key: 'ACCOUNTING_SYNC',    label: 'Books sync (organizations)', blurb: 'Invoices and payments post to your Elevate books automatically.' },
  { key: 'CREW_PAY',           label: 'Pay crew & contractors',   blurb: 'Pay film crew and contractors with 1099 tracking.', needs: 'Needs a funds-flow design review' },
  { key: 'PRODUCTION_FINANCE', label: 'Production finance',       blurb: 'Budget, cost reports and invoices per film production.' },
];

const ALL_OFF = Object.fromEntries(BILLING_FLAGS.map(f => [f.key, false])) as Record<BillingFlagKey, boolean>;

export interface BillingFlagState { flags: Record<BillingFlagKey, boolean>; loaded: boolean; isAdmin: boolean }

/** Live flags. `isAdmin` comes from the user's token claims/doc so admins can preview OFF features. */
export function useBillingFlags(): BillingFlagState & { enabled: (k: BillingFlagKey) => boolean; preview: (k: BillingFlagKey) => boolean } {
  const [state, setState] = useState<BillingFlagState>({ flags: ALL_OFF, loaded: false, isAdmin: false });
  useEffect(() => {
    let admin = false;
    auth.currentUser?.getIdTokenResult().then(r => { admin = r.claims?.admin === true; setState(s => ({ ...s, isAdmin: admin })); }).catch(() => {});
    const unsub = onSnapshot(doc(db, 'config', 'billingFlags'),
      snap => setState(s => ({ ...s, flags: { ...ALL_OFF, ...((snap.data() as any) || {}) }, loaded: true })),
      () => setState(s => ({ ...s, loaded: true })));   // unreadable → everything stays OFF (safe default)
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, []);
  return {
    ...state,
    enabled: k => !!state.flags[k],
    /** Admin preview: visible to admins even while OFF for everyone else. */
    preview: k => !state.flags[k] && state.isAdmin,
  };
}
