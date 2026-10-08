// FinanceHub — Elevate ChMS finance suite (Servant Keeper parity + ARIA insights, two-person integrity,
// check capture, giver self-service). MANAGE_GIVING writes; VIEW_GIVING (trustees) is read-only and sees
// giver-level data only in aggregate. Everything is audited (services/chmsFinance.ts).
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, BarChart3, Calculator, BookOpen, FileText, Gift, Handshake, Home as HomeIcon, Inbox as InboxIcon, Landmark, Layers, Loader2, PenLine, Receipt, RefreshCw, Rocket, Scale, Settings as Cog, ShieldCheck, Store } from 'lucide-react';
import type { HubTab, SpendSub } from '../../../../services/acctSpending';
import { CountBadge, ShortcutSheet, ToastProvider, useHotkeys, useMoneyInbox } from './SpendingUi';
import type { Organization, OrgMembership } from '../../../../types';
import { elevateCan } from '../../../../services/elevateRoles';
import { auth } from '../../../../services/firebase';
import { fetchFinanceSnapshot, type FinanceSnapshot } from '../../../../services/chmsFinance';
import { pendingApprovalCount } from './OverviewTab';
import type { TabProps } from './shared';
import { useBillingNav, SoonPill } from '../../../BillingMounts';

const OverviewTab = lazy(() => import('./OverviewTab'));
const EnterTab = lazy(() => import('./EnterTab'));
const BatchesTab = lazy(() => import('./BatchesTab'));
const FundsTab = lazy(() => import('./FundsTab'));
const PledgesTab = lazy(() => import('./PledgesTab'));
const StatementsTab = lazy(() => import('./StatementsTab'));
const ReportsTab = lazy(() => import('./ReportsTab'));
const ReconcileTab = lazy(() => import('./ReconcileTab'));
const SettingsTab = lazy(() => import('./SettingsTab'));
const AuditTab = lazy(() => import('./AuditTab'));
const FinanceHome = lazy(() => import('./FinanceHome'));
const MoneyInbox = lazy(() => import('./MoneyInbox'));
const SpendingHub = lazy(() => import('./SpendingHub'));
const SpendingVendors = lazy(() => import('./SpendingVendors'));
const SetupGuide = lazy(() => import('./SetupGuide'));
const AccountingHub = lazy(() => import('../accounting/AccountingHub'));
const BudgetPulse = lazy(() => import('./BudgetPulse'));

const BillingHubMount = lazy(() => import('../../../BillingMounts').then(m => ({ default: m.BillingHubMount })));
const BillingSummaryMount = lazy(() => import('../../../BillingMounts').then(m => ({ default: m.BillingSummaryMount })));

type TabKey = 'invoices' | 'pulse' | 'books' | 'home' | 'inbox' | 'spending' | 'vendors' | 'setup' | 'overview' | 'enter' | 'batches' | 'funds' | 'pledges' | 'statements' | 'reports' | 'reconcile' | 'settings' | 'audit';

export interface FinanceHubProps {
  org: Organization;
  myMembership: OrgMembership | null;
  onClose: () => void;
  onOrgChange?: (o: Organization) => void;
  onOpenPerson?: (personId: string) => void;
}

const Fallback = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={22} /></div>;

const FinanceHub: React.FC<FinanceHubProps> = ({ org: initialOrg, myMembership, onClose, onOrgChange, onOpenPerson }) => {
  const [org, setOrgState] = useState<Organization>(initialOrg);
  const [snap, setSnap] = useState<FinanceSnapshot | null>(null);
  const [tab, setTab] = useState<TabKey>('home');
  const [spendSub, setSpendSub] = useState<SpendSub | undefined>(undefined);
  const [keysOpen, setKeysOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid || '';
  const canManage = elevateCan(myMembership, org, 'MANAGE_GIVING');
  const canView = canManage || elevateCan(myMembership, org, 'VIEW_GIVING');

  const setOrg = useCallback((o: Organization) => { setOrgState(o); onOrgChange?.(o); }, [onOrgChange]);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setSnap(await fetchFinanceSnapshot(org, canManage)); } finally { setLoading(false); }
  }, [org, canManage]);
  useEffect(() => { if (canView) reload(); }, [org.id, canView]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = snap ? pendingApprovalCount(snap) : 0;
  const inbox = useMoneyInbox(org, myMembership, snap, canView);
  const go = useCallback((t: HubTab, sub?: SpendSub) => {
    // 'books'/'payouts' are mounted by the Books/Payouts builders; fall back gracefully when absent.
    const target: TabKey = t === 'books' ? 'books' : t === 'payouts' ? 'reconcile' : (t as TabKey);
    setSpendSub(sub); setTab(target); window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, []);
  useHotkeys({ 'g h': () => go('home'), 'g i': () => go('inbox'), 'g s': () => go('spending'), 'g v': () => go('vendors'), 'n': () => go('spending', 'submit'), '?': () => setKeysOpen(v => !v) }, canView);
  const billingNav = useBillingNav();
  // Invoices (Plajah Billing): finance roles only — MANAGE_GIVING / MANAGE_ACCOUNTING manage, VIEW_ACCOUNTING reads.
  const canBillManage = canManage || elevateCan(myMembership, org, 'MANAGE_ACCOUNTING');
  const canBillView = canBillManage || elevateCan(myMembership, org, 'VIEW_ACCOUNTING');
  const tabs = useMemo(() => ([
    { key: 'home' as const, label: 'Home', icon: HomeIcon, show: true },
    { key: 'invoices' as const, label: 'Invoices', icon: FileText, show: canBillView, soon: billingNav.state === 'soon' },
    { key: 'inbox' as const, label: 'Inbox', icon: InboxIcon, show: true, badge: inbox.count },
    { key: 'spending' as const, label: 'Spending', icon: Receipt, show: true },
    { key: 'pulse' as const, label: 'Pulse', icon: Activity, show: true },
    { key: 'vendors' as const, label: 'Vendors', icon: Store, show: inbox.perms.canViewBooks || inbox.perms.isOwner },
    { key: 'books' as const, label: 'Books', icon: Calculator, show: inbox.perms.canViewBooks || inbox.perms.isOwner || (org.ministries || []).some(m => (m.headUids || []).includes(uid)) },
    { key: 'overview' as const, label: 'Overview', icon: BarChart3, show: true },
    { key: 'setup' as const, label: 'Setup', icon: Rocket, show: canManage },
    { key: 'enter' as const, label: 'Enter Gifts', icon: PenLine, show: canManage },
    { key: 'batches' as const, label: pending ? `Batches (${pending})` : 'Batches', icon: Layers, show: true },
    { key: 'funds' as const, label: 'Funds', icon: Landmark, show: true },
    { key: 'pledges' as const, label: 'Pledges', icon: Handshake, show: canManage },
    { key: 'statements' as const, label: 'Statements', icon: FileText, show: canManage },
    { key: 'reports' as const, label: 'Reports', icon: BookOpen, show: true },
    { key: 'reconcile' as const, label: 'Reconciliation', icon: Scale, show: true },
    { key: 'settings' as const, label: 'Settings', icon: Cog, show: canManage },
    { key: 'audit' as const, label: 'Audit', icon: ShieldCheck, show: true },
  ] as { key: TabKey; label: string; icon: any; show: boolean; badge?: number; soon?: boolean }[]).filter(t => t.show), [canBillView, billingNav.state, canManage, pending, inbox.count, inbox.perms.canViewBooks, inbox.perms.isOwner, org.ministries, uid]);

  if (!canView) return <p className="text-xs text-white/40 py-8 text-center">The Finance Hub is limited to finance roles, pastors and trustees.</p>;

  const props: TabProps | null = snap ? { org, snap, reload, canManage, setOrg, uid, onOpenPerson } : null;

  return (
    <ToastProvider>
    <div>
      <ShortcutSheet open={keysOpen} onClose={() => setKeysOpen(false)} />
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onClose} className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><h2 className="text-lg font-black text-white flex items-center gap-2"><Gift size={16} className="text-small-orange" />Finance Hub</h2><p className="text-[10px] text-white/40 truncate">{org.legalName || org.name}{!canManage && ' · read-only (trustee view)'}</p></div>
        <button onClick={reload} disabled={loading} title="Refresh" className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${tab === t.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
            <t.icon size={12} />{t.label}<CountBadge n={t.badge || 0} />{t.soon && <SoonPill />}
          </button>
        ))}
      </div>

      {inbox.perms.readOnly && <div className="mb-4 px-4 py-2.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-[11px] text-sky-200">Read-only access — you can view and export everything; nothing here can be changed.</div>}

      {tab === 'books' && <Suspense fallback={<Fallback />}><AccountingHub org={org} myMembership={myMembership} onClose={() => setTab('home')} onOrgChange={setOrg} onOpenFinanceTab={k => (k === 'spending' ? go('spending') : setTab(k as TabKey))} /></Suspense>}
      {tab === 'invoices' && canBillView && <Suspense fallback={<Fallback />}><BillingHubMount entity={{ kind: 'ORG', id: org.id }} entityName={org.legalName || org.name} canManage={canBillManage} accounting /></Suspense>}
      {tab === 'home' && canBillView && billingNav.state !== 'soon' && <Suspense fallback={null}><div className="mb-4"><BillingSummaryMount entity={{ kind: 'ORG', id: org.id }} /></div></Suspense>}
      {tab === 'pulse' && <Suspense fallback={<Fallback />}><BudgetPulse org={org} myMembership={myMembership} onNavigate={go} onOrgChange={setOrg} /></Suspense>}
      {(tab === 'inbox' || tab === 'spending' || tab === 'vendors' || tab === 'setup') && (
        <Suspense fallback={<Fallback />}>
          {tab === 'inbox' && <MoneyInbox org={org} member={myMembership} snap={snap} onNavigate={go} />}
          {tab === 'spending' && <SpendingHub org={org} member={myMembership} initialSub={spendSub} onNavigate={go} />}
          {tab === 'vendors' && <SpendingVendors org={org} member={myMembership} />}
          {tab === 'setup' && canManage && <SetupGuide org={org} member={myMembership} onOrgChange={setOrg} onNavigate={go} />}
        </Suspense>
      )}
      {tab !== 'invoices' && tab !== 'pulse' && tab !== 'books' && tab !== 'inbox' && tab !== 'spending' && tab !== 'vendors' && tab !== 'setup' && (!props ? <Fallback /> : (
        <Suspense fallback={<Fallback />}>
          {tab === 'home' && <FinanceHome org={org} member={myMembership} snap={snap} canManage={canManage} onNavigate={go} />}
          {tab === 'overview' && <OverviewTab {...props} />}
          {tab === 'enter' && canManage && <EnterTab {...props} />}
          {tab === 'batches' && <BatchesTab {...props} />}
          {tab === 'funds' && <FundsTab {...props} />}
          {tab === 'pledges' && canManage && <PledgesTab {...props} />}
          {tab === 'statements' && canManage && <StatementsTab {...props} />}
          {tab === 'reports' && <ReportsTab {...props} />}
          {tab === 'reconcile' && <ReconcileTab {...props} />}
          {tab === 'settings' && canManage && <SettingsTab {...props} myMembership={myMembership} />}
          {tab === 'audit' && <AuditTab {...props} />}
        </Suspense>
      ))}
    </div>
    </ToastProvider>
  );
};

export default FinanceHub;
export { default as MyGivingPanel } from './MyGivingPanel';
export { default as CareFlagsPanel } from './CareFlagsPanel';
