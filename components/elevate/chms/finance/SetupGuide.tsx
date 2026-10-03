// SetupGuide — "Money setup in 10 minutes": a checklist wizard for a brand-new church. Progress is detected from
// real data where possible and persisted on the org doc (setupState.moneySetup) otherwise.
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Circle, PartyPopper, Loader2 } from 'lucide-react';
import type { Organization, OrgMembership } from '../../../../types';
import { accountDocId } from '../../../../services/acctPosting';
import { dismissSetup, ensureChart, markSetupStep, moneySetupSteps, emitFinanceChanged, type HubTab, type SetupStep } from '../../../../services/acctSpending';
import { saveBankAccount, sysAccounts } from '../../../../services/acctService';
import { fetchOrgMembers } from '../../../../services/organizationService';
import { connectStripe } from '../../../../services/stripeService';
import { auth } from '../../../../services/firebase';
import { card, field, label, btnPrimary, btnGhost } from './shared';
import { ApprovalLimits, FinanceTeamInvite } from './SpendingSettings';
import { SkeletonRows, useDo, useSpendingBundle } from './SpendingUi';

const ImportWizard = lazy(() => import('../ImportWizard'));

const SetupGuide: React.FC<{ org: Organization; member: OrgMembership | null; onOrgChange: (o: Organization) => void; onNavigate: (t: HubTab) => void }> = ({ org, member, onOrgChange, onNavigate }) => {
  const { bundle, loading, reload } = useSpendingBundle(org, member);
  const act = useDo();
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { fetchOrgMembers(org.id).then(m => setRoleKeys(m.filter(x => x.status === 'ACTIVE').map(x => x.roleKey || ''))).catch(() => {}); }, [org.id]);
  const steps = useMemo(() => moneySetupSteps(org, bundle, roleKeys), [org, bundle, roleKeys]);
  const done = steps.filter(s => s.done).length;
  useEffect(() => { if (open === null && steps.length) setOpen(steps.find(s => !s.done)?.key || ''); }, [steps.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [bank, setBank] = useState({ name: '', last4: '', kind: 'CHECKING' as 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' });
  const [showImport, setShowImport] = useState(false);

  const mark = (key: string, v = true) => act.run(async () => { onOrgChange(await markSetupStep(org, key, v)); });
  const seed = () => act.run(async () => { await ensureChart(org); emitFinanceChanged(); await reload(true); }, 'Chart of accounts ready');
  const addBank = () => act.run(async () => {
    if (!bank.name.trim()) throw new Error('Give the account a name, e.g. “Operating checking”.');
    await ensureChart(org);
    const sys = await sysAccounts(org.id);
    const accountId = bank.kind === 'CHECKING' ? sys.CASH_OPERATING! : bank.kind === 'SAVINGS' ? accountDocId(org.id, '1010') : accountDocId(org.id, '2200');
    await saveBankAccount(org.id, { name: bank.name, last4: bank.last4.replace(/\D/g, '').slice(-4) || undefined, accountId, kind: bank.kind });
    emitFinanceChanged(); await reload(true); setBank({ name: '', last4: '', kind: 'CHECKING' });
  }, 'Bank account added');
  const stripe = () => act.run(async () => { const t = await auth.currentUser!.getIdToken(); await connectStripe({ orgId: org.id, userIdToken: t }); });

  const body = (s: SetupStep) => {
    switch (s.key) {
      case 'stripe': return <div className="space-y-2"><button onClick={stripe} disabled={act.busy} className={btnPrimary}>Connect Stripe <ArrowRight size={12} /></button><p className="text-[10px] text-white/40">You’ll go to Stripe to verify your org, then land back here. Takes about 3 minutes.</p></div>;
      case 'funds': return <div className="space-y-2"><p className="text-[11px] text-white/60">Most churches start with General, Missions and Building.</p><button onClick={() => onNavigate('funds')} className={btnPrimary}>Name my funds <ArrowRight size={12} /></button></div>;
      case 'chart': return <div className="space-y-2"><p className="text-[11px] text-white/60">A standard church/nonprofit chart: checking, savings, Stripe clearing, payables, contributions, and ~20 expense categories.</p><button onClick={seed} disabled={act.busy} className={btnPrimary}>Create it for me</button></div>;
      case 'bank': return (
        <div className="space-y-2">
          <div className="grid sm:grid-cols-3 gap-2"><input value={bank.name} onChange={e => setBank({ ...bank, name: e.target.value })} placeholder="Operating checking" className={field} /><input value={bank.last4} onChange={e => setBank({ ...bank, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" placeholder="Last 4 digits" className={field} />
            <select value={bank.kind} onChange={e => setBank({ ...bank, kind: e.target.value as any })} className={field}><option value="CHECKING">Checking</option><option value="SAVINGS">Savings</option><option value="CREDIT_CARD">Church credit card</option></select></div>
          <button onClick={addBank} disabled={act.busy} className={btnPrimary}>Add account</button></div>);
      case 'team': return <div className="space-y-2"><FinanceTeamInvite org={org} member={member} defaultRole="BOOKKEEPER" onInvited={() => mark('team')} /><button onClick={() => mark('team')} className={btnGhost}>It’s just me for now</button></div>;
      case 'limits': return <div className="space-y-2"><ApprovalLimits org={org} onSaved={onOrgChange} /></div>;
      case 'import': return (
        <div className="space-y-2">
          <p className="text-[11px] text-white/60">Switching from Servant Keeper or a spreadsheet? Bring people and giving history with you — nothing is lost.</p>
          <div className="flex gap-2 flex-wrap"><button onClick={() => setShowImport(v => !v)} className={btnPrimary}>{showImport ? 'Hide' : 'Open'} import wizard</button><button onClick={() => mark('import')} className={btnGhost}>Skip — starting fresh</button></div>
          {showImport && <Suspense fallback={<p className="text-xs text-white/40">Loading…</p>}><ImportWizard org={org} myMembership={member} onClose={() => setShowImport(false)} onDone={() => { mark('import'); setShowImport(false); }} /></Suspense>}
        </div>);
      default: return null;
    }
  };

  if (loading && !bundle) return <SkeletonRows rows={3} />;
  const finished = done === steps.length;
  return (
    <div className="space-y-5 max-w-2xl">
      <div className={`${card} p-6`}>
        <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-black text-white">Money setup in 10 minutes</h2><span className="text-xs font-black text-white/50">{done}/{steps.length}</span></div>
        <p className="text-[11px] text-white/50 mb-3">Seven small steps. Skip any and come back — each one saves as you go.</p>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-small-orange transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      </div>

      {finished && (
        <div className={`${card} p-6 text-center bg-gradient-to-b from-emerald-500/[0.08] to-transparent`}><PartyPopper className="mx-auto text-emerald-300 mb-2" size={26} /><p className="text-sm font-black text-white">You’re set up. Money will mostly run itself from here.</p>
          <button onClick={() => act.run(async () => { onOrgChange(await dismissSetup(org)); onNavigate('home'); })} className={`${btnPrimary} mt-3`}>Go to Finance Home</button></div>
      )}

      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={s.key} className={`${card} overflow-hidden`}>
            <button onClick={() => setOpen(open === s.key ? '' : s.key)} className="w-full flex items-center gap-3 p-4 text-left">
              {s.done ? <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0"><Check size={14} /></span> : <Circle size={22} className="text-white/20 shrink-0" />}
              <div className="min-w-0 flex-1"><p className={`text-sm font-black ${s.done ? 'text-white/50 line-through' : 'text-white'}`}>{i + 1}. {s.title}</p><p className="text-[10px] text-white/40 mt-0.5 truncate">{s.why}</p></div>
              <span className={`${label} shrink-0`}>{s.done ? 'Done' : `${s.minutes} min`}</span><ChevronDown size={14} className={`text-white/30 transition-transform ${open === s.key ? 'rotate-180' : ''}`} />
            </button>
            {open === s.key && <div className="px-4 pb-4 pt-0 space-y-3">{act.busy && <Loader2 size={13} className="animate-spin text-white/30" />}{body(s)}{!s.done && !['team', 'import'].includes(s.key) && <button onClick={() => mark(s.key)} className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white">Mark as done</button>}</div>}
          </div>
        ))}
      </div>
      {!finished && <button onClick={() => act.run(async () => { onOrgChange(await dismissSetup(org)); onNavigate('home'); })} className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white">Hide this guide (find it later in Settings)</button>}
    </div>
  );
};

export default SetupGuide;
