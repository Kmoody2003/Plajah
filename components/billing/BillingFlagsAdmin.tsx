// BillingFlagsAdmin — admin control panel for Plajah Billing platform flags (Firestore config/billingFlags).
// Flip a switch → feature goes live for everyone (no redeploy). Admins always see OFF features as "preview".
import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { BILLING_FLAGS, useBillingFlags } from '../../services/billingFlags';
import type { BillingFlagKey } from '../../types';
import { ToastProvider, card, label, useToast } from './ui';

/** Stripe-dashboard prerequisites per flag, mirroring docs/STRIPE_SETUP_CHECKLIST.md. */
const STRIPE_STEPS: Partial<Record<BillingFlagKey, string>> = {
  INVOICES: 'Connect enabled; Billing/Invoicing + webhooks (invoice.*, account.updated) pointed at /api/billing/webhook',
  ESTIMATES: 'None beyond INVOICES (quotes are stored by Plajah, converted to Stripe invoices)',
  RECURRING_INVOICES: 'Stripe Billing subscriptions/schedules enabled; webhook events customer.subscription.*',
  INSTALLMENTS: 'None beyond INVOICES',
  REMINDERS: 'Scheduler job live on the server (cron hitting /api/billing/reminders)',
  PAYMENT_LINKS: 'Payment Links enabled on connected accounts',
  CUSTOMERS: 'None',
  PRICE_BOOK: 'None',
  BALANCE_DASHBOARD: 'Connect account balance + payout read access',
  SALES_TAX: 'Stripe Tax enabled and origin address set on each connected account',
  ACCOUNTING_SYNC: 'Elevate books chart of accounts present for the organization',
  CREW_PAY: 'Funds-flow design review signed off (Connect transfers / 1099 handling)',
  PRODUCTION_FINANCE: 'None beyond INVOICES',
};

const Inner: React.FC = () => {
  const toast = useToast(); const f = useBillingFlags(); const [busy, setBusy] = useState<string | null>(null);
  const set = async (key: BillingFlagKey, on: boolean) => {
    setBusy(key);
    try { await setDoc(doc(db, 'config', 'billingFlags'), { [key]: on }, { merge: true }); toast(`${key} is now ${on ? 'ON for everyone' : 'OFF (Coming soon)'}`, { undo: async () => { await setDoc(doc(db, 'config', 'billingFlags'), { [key]: !on }, { merge: true }); } }); }
    catch (e: any) { toast(e?.message || 'Could not update the flag (admin only).', { tone: 'bad' }); } finally { setBusy(null); }
  };
  const onCount = BILLING_FLAGS.filter(x => f.enabled(x.key)).length;
  return (
    <div className="max-w-3xl space-y-4">
      <div><h2 className="text-lg font-black text-white">Billing flags</h2>
        <p className="text-xs text-white/50 mt-1">{onCount} of {BILLING_FLAGS.length} features live. OFF features show "Coming soon" to everyone except admins (who see a preview badge). Turning one ON also requires each customer's own Stripe account to be connected.</p>
        <p className="text-[10px] text-white/30 mt-1">Setup reference: docs/STRIPE_SETUP_CHECKLIST.md</p></div>
      {!f.loaded && <p className="text-xs text-white/40">Loading…</p>}
      <ul className="space-y-2">
        {BILLING_FLAGS.map(m => { const on = f.enabled(m.key); return (
          <li key={m.key} className={`${card} p-4 flex items-start gap-3`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-black text-white">{m.label}</p><code className="text-[9px] text-white/30">{m.key}</code>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${on ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-white/5 text-white/50 border-white/10'}`}>{on ? '● Live' : '○ Coming soon'}</span></div>
              <p className="text-[11px] text-white/50 mt-1">{m.blurb}</p>
              {m.needs && <p className="text-[10px] text-amber-300 mt-1">Needs: {m.needs}</p>}
              {STRIPE_STEPS[m.key] && <p className={`${label} mt-1.5 normal-case tracking-normal font-bold`}>Stripe setup: <span className="text-white/50">{STRIPE_STEPS[m.key]}</span></p>}
            </div>
            <button role="switch" aria-checked={on} aria-label={`${m.label} ${on ? 'on' : 'off'}`} disabled={busy === m.key || !f.loaded} onClick={() => set(m.key, !on)}
              className={`shrink-0 w-12 h-7 rounded-full border transition-all relative disabled:opacity-40 ${on ? 'bg-green-500/80 border-green-400' : 'bg-white/10 border-white/20'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-0.5'}`} />
            </button>
          </li>); })}
      </ul>
    </div>
  );
};
export const BillingFlagsAdmin: React.FC = () => <ToastProvider><Inner /></ToastProvider>;
export default BillingFlagsAdmin;
