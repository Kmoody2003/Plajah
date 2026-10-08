import React, { useEffect, useState } from 'react';
import { Save, ExternalLink } from 'lucide-react';
import type { BillingEntityRef, BillingSettings } from '../../types';
import { saveSettings, useBillingConnection, useBillingSettings } from '../../services/billingService';
import { Busy, SkeletonRows, btnPrimary, btnGhost, card, field, label, useToast } from './ui';

export const BillingSettingsTab: React.FC<{ entity: BillingEntityRef; entityName: string; canManage: boolean }> = ({ entity, canManage }) => {
  const toast = useToast(); const { settings, loading } = useBillingSettings(entity); const c = useBillingConnection(entity);
  const [s, setS] = useState<Partial<BillingSettings>>({ numberPrefix: 'INV-', defaultTermsDays: 30, acceptCard: true, acceptAch: true });
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  useEffect(() => { if (settings && !dirty) setS(settings); }, [settings, dirty]);
  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => { setDirty(true); setS(x => ({ ...x, [k]: v })); };
  const save = async () => { setBusy(true); try { await saveSettings(entity, s); setDirty(false); toast('Billing settings saved'); } catch (e: any) { toast(e?.message || 'Could not save.', { tone: 'bad' }); } finally { setBusy(false); } };
  if (loading) return <SkeletonRows rows={2} />;
  const dis = !canManage;
  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${card} p-5 space-y-3`}>
        <p className={label}>Stripe account</p>
        {c.ready ? <p className="text-xs text-green-400">✓ Connected — payments and payouts go to your own Stripe account.</p> : <p className="text-xs text-amber-300">Not fully connected yet.</p>}
        {canManage && <div className="flex flex-wrap gap-2"><button onClick={() => c.connect().catch((e: any) => toast(e?.message || 'Could not open Stripe.', { tone: 'bad' }))} className={btnGhost}><ExternalLink size={12} /> {c.conn?.stripeAccountId ? 'Manage in Stripe' : 'Connect Stripe'}</button></div>}
      </div>
      <div className={`${card} p-5 space-y-3`}>
        <p className={label}>Branding on invoices</p>
        <input disabled={dis} value={s.businessName || ''} onChange={e => set('businessName', e.target.value)} placeholder="Name shown on invoices (defaults to your page name)" aria-label="Business name" className={field} />
        <input disabled={dis} value={s.logoUrl || ''} onChange={e => set('logoUrl', e.target.value)} placeholder="Logo URL (optional)" aria-label="Logo URL" className={field} />
        <input disabled={dis} value={s.replyToEmail || ''} onChange={e => set('replyToEmail', e.target.value)} placeholder="Reply-to email" inputMode="email" aria-label="Reply-to email" className={field} />
      </div>
      <div className={`${card} p-5 space-y-3`}>
        <p className={label}>Defaults for new invoices</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Number prefix<input disabled={dis} value={s.numberPrefix || ''} onChange={e => set('numberPrefix', e.target.value)} placeholder="INV-" className={field + ' mt-1'} /></label>
          <label className={label}>Payment terms<select disabled={dis} value={s.defaultTermsDays ?? 30} onChange={e => set('defaultTermsDays', parseInt(e.target.value))} className={field + ' mt-1'}><option value={0}>On receipt</option><option value={7}>Net 7</option><option value={15}>Net 15</option><option value={30}>Net 30</option><option value={45}>Net 45</option><option value={60}>Net 60</option></select></label>
        </div>
        <textarea disabled={dis} value={s.defaultMemo || ''} onChange={e => set('defaultMemo', e.target.value)} rows={2} placeholder="Default memo — e.g. Thank you for your business!" aria-label="Default memo" className={field} />
        <textarea disabled={dis} value={s.defaultFooter || ''} onChange={e => set('defaultFooter', e.target.value)} rows={2} placeholder="Default footer — late-fee policy, tax ID…" aria-label="Default footer" className={field} />
        <label className="flex items-center gap-2 text-xs text-white/70"><input disabled={dis} type="checkbox" checked={!!s.defaultReminders} onChange={e => set('defaultReminders', e.target.checked)} /> Turn on automatic reminders for new invoices</label>
      </div>
      <div className={`${card} p-5 space-y-2`}>
        <p className={label}>Payment methods</p>
        <label className="flex items-center gap-2 text-xs text-white/70"><input disabled={dis} type="checkbox" checked={s.acceptCard !== false} onChange={e => set('acceptCard', e.target.checked)} /> Cards (Apple Pay / Google Pay included)</label>
        <label className="flex items-center gap-2 text-xs text-white/70"><input disabled={dis} type="checkbox" checked={s.acceptAch !== false} onChange={e => set('acceptAch', e.target.checked)} /> US bank transfer (ACH) — lower fees</label>
      </div>
      {canManage && <button onClick={save} disabled={busy || !dirty} className={btnPrimary}><Busy on={busy}><Save size={12} /> Save settings</Busy></button>}
    </div>
  );
};
export default BillingSettingsTab;
