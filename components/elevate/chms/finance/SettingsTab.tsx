// Settings — legal name / EIN / statement footer, approval threshold (two-person integrity), insight tuning,
// QuickBooks mapping, linked-giver backfill, and the Servant Keeper import entry point.
import React, { Suspense, lazy, useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import type { OrgMembership } from '../../../../types';
import { DEFAULT_APPROVAL_THRESHOLD, backfillLinkedUid, saveFinanceSettings, settingsOf } from '../../../../services/chmsFinance';
import { money } from '../../../../services/chmsFinanceReports';
import { card, field, btnPrimary, btnGhost, heading, label, useAction, Busy, type TabProps } from './shared';

const ImportWizard = lazy(() => import('../ImportWizard'));
const SpendingSettings = lazy(() => import('./SpendingSettings'));

const SettingsTab: React.FC<TabProps & { myMembership: OrgMembership | null }> = ({ org, snap, reload, canManage, setOrg, myMembership }) => {
  const s = settingsOf(org);
  const [f, setF] = useState({
    legalName: org.legalName || '', ein: org.ein || '', footer: org.statementFooter || '', intro: org.financeSettings?.statementIntro || '',
    threshold: String(s.approvalThreshold), mult: String(s.anomalyMultiple), lapsed: String(s.lapsedDays), fy: String(s.fiscalYearStartMonth),
    qbDep: org.financeSettings?.qbDepositAccount || '', qbPre: org.financeSettings?.qbIncomeAccountPrefix ?? 'Contributions:',
  });
  const [donorFees, setDonorFees] = useState(org.financeSettings?.donorCoversFees !== false);
  const [showImport, setShowImport] = useState(false);
  const [msg, setMsg] = useState('');
  const act = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  const num = (v: string) => v.replace(/[^0-9.]/g, '');

  if (!canManage) return <p className="text-xs text-white/40">Finance settings are limited to finance roles.</p>;

  const save = () => act.run(async () => {
    const ein = f.ein.trim();
    if (ein && !/^\d{2}-?\d{7}$/.test(ein)) { alert('EIN should look like 12-3456789.'); return; }
    const patch = await saveFinanceSettings(org, {
      legalName: f.legalName, ein, statementFooter: f.footer,
      financeSettings: { ...(org.financeSettings || {}), approvalThreshold: f.threshold === '' ? undefined : Number(f.threshold), anomalyMultiple: Number(f.mult) || 5, lapsedDays: Number(f.lapsed) || 60, fiscalYearStartMonth: Math.min(12, Math.max(1, Number(f.fy) || 1)), donorCoversFees: donorFees, statementIntro: f.intro.trim() || undefined, qbDepositAccount: f.qbDep.trim() || undefined, qbIncomeAccountPrefix: f.qbPre },
    });
    setOrg({ ...org, ...patch }); setMsg('Saved.'); setTimeout(() => setMsg(''), 2000);
  });
  const backfill = () => act.run(async () => { const n = await backfillLinkedUid(org, snap.ledger, snap.people); setMsg(n ? `Linked ${n} gift(s) to their givers’ Plajah accounts.` : 'Every gift is already linked.'); await reload(); });
  const linkable = snap.people.filter(p => p.linkedUid).length;

  return (
    <div className="space-y-6">
      <div className={`${card} p-5`}>
        <h3 className={heading}>Statement identity</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div><p className={`${label} mb-1`}>Legal name</p><input value={f.legalName} onChange={set('legalName')} placeholder="e.g. Grace Community Church, Inc." className={field} /></div>
          <div><p className={`${label} mb-1`}>EIN</p><input value={f.ein} onChange={set('ein')} placeholder="12-3456789" className={field} /></div>
        </div>
        <p className={`${label} mt-3 mb-1`}>Statement introduction (optional)</p>
        <textarea value={f.intro} onChange={set('intro')} rows={2} className={field} placeholder={`Thank you for your generous support of ${org.name}.`} />
        <p className={`${label} mt-3 mb-1`}>Statement footer (optional)</p>
        <textarea value={f.footer} onChange={set('footer')} rows={2} className={field} placeholder="e.g. Questions? Contact the finance office at …" />
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Online giving fees</h3>
        <button type="button" onClick={() => setDonorFees(v => !v)} aria-pressed={donorFees} className="flex items-start gap-3 text-left w-full">
          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border grid place-items-center text-[11px] font-black ${donorFees ? 'bg-small-orange border-small-orange text-black' : 'border-white/30 text-transparent'}`}>✓</span>
          <span><span className="block text-sm font-bold text-white">Donors cover the processing fee</span>
            <span className="block text-[11px] text-white/50 mt-0.5 leading-snug">At checkout the donor sees a pre-ticked option to add the card fee so {org.name} receives 100% of the gift. The church always receives the full gift amount and payouts match gifts to the cent. Donors can untick it. Turn this off to stop offering it (the platform then absorbs the fee).</span></span>
        </button>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Two-person integrity</h3>
        <p className="text-[11px] text-white/50 mb-3">Voids and out-of-balance batch overrides at or above this amount stay pending until a <b className="text-white">different</b> authorised user approves them. Default {money(DEFAULT_APPROVAL_THRESHOLD)}. Use 0 to require approval for everything.</p>
        <div className="flex items-center gap-2"><span className="text-white/40">$</span><input value={f.threshold} onChange={e => setF(v => ({ ...v, threshold: num(e.target.value) }))} className={`${field} max-w-[10rem]`} /></div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Insights & fiscal year</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><p className={`${label} mb-1`}>Lapsed after (days)</p><input value={f.lapsed} onChange={e => setF(v => ({ ...v, lapsed: num(e.target.value) }))} className={field} /></div>
          <div><p className={`${label} mb-1`}>Flag gifts ×median</p><input value={f.mult} onChange={e => setF(v => ({ ...v, mult: num(e.target.value) }))} className={field} /></div>
          <div><p className={`${label} mb-1`}>Fiscal year starts (month 1-12)</p><input value={f.fy} onChange={e => setF(v => ({ ...v, fy: num(e.target.value) }))} className={field} /></div>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>QuickBooks mapping</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div><p className={`${label} mb-1`}>Deposit account</p><input value={f.qbDep} onChange={set('qbDep')} placeholder="Checking" className={field} /></div>
          <div><p className={`${label} mb-1`}>Income account prefix</p><input value={f.qbPre} onChange={set('qbPre')} placeholder="Contributions:" className={field} /></div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={act.busy} className={btnPrimary}><Busy on={act.busy}>Save settings</Busy></button>
        {msg && <span className="text-[11px] text-green-400">{msg}</span>}
      </div>

      <Suspense fallback={null}><SpendingSettings org={org} member={myMembership} snap={snap} onSaved={setOrg} /></Suspense>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Giver self-service</h3>
        <p className="text-[11px] text-white/50 mb-3">Givers with a linked Plajah account see only their own giving and statement (<code>MyGivingPanel</code>). {linkable} person(s) are linked. Older gifts entered before linking need a one-time backfill.</p>
        <button onClick={backfill} disabled={act.busy} className={btnGhost}><Link2 size={12} /> Link existing gifts to accounts</button>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Switching from Servant Keeper?</h3>
        <button onClick={() => setShowImport(v => !v)} className={btnGhost}><Upload size={12} /> {showImport ? 'Hide' : 'Open'} import wizard</button>
        {showImport && <div className="mt-4"><Suspense fallback={<p className="text-xs text-white/40">Loading…</p>}><ImportWizard org={org} myMembership={myMembership} onClose={() => setShowImport(false)} onDone={() => reload()} /></Suspense></div>}
      </div>
    </div>
  );
};

export default SettingsTab;
