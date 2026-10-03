// ElevateOps — the OPERATIONS side of Plajah Elevate (staff / pastors / department heads / volunteers).
//
// The public org page is the "Public view"; this is the working dashboard. Every section is gated by
// elevateCan(myMembership, org, <permission>) — sections the viewer lacks permission for are hidden, so a
// Prayer Warrior sees only Prayer, Finance sees only Giving, Media sees Sermons/Media/Store, etc.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, LayoutDashboard, Users, Church, Link2, Gift, HandHeart, MonitorPlay, MessagesSquare, ShoppingBag,
  Briefcase, Megaphone, Check, Circle, Loader2, Trash2, Sparkles, Mail, HardDrive, UserCog, Mic2, Wallet,
} from 'lucide-react';
import { spendingPerms } from '../../services/acctSpending';
import { CountBadge, useMoneyInbox } from './chms/finance/SpendingUi';
import type { Organization, OrgMembership, OrgPermission, OrgRole, UserProfile, GivingFund } from '../../types';
import { fetchOrgMembers, fetchOrganization, updateOrganization, fetchChurchDonations, sumDonationsByFund } from '../../services/organizationService';
import { elevateCan } from '../../services/elevateRoles';
import { useBillingNav, SoonPill } from '../BillingMounts';
import { isFaithOrg } from '../../services/elevateTemplates';
import { setupChecklist } from '../../services/elevateService';
import { auth } from '../../services/backendService';
import { connectStripe } from '../../services/stripeService';
import ChurchPrayerWall from '../ChurchPrayerWall';
import OrgThread from './OrgThread';
import OrgStoreSection from './OrgStoreSection';

// Sibling modules built in parallel — lazy so a missing/late file never breaks the page shell.
const RosterManager = lazy(() => import('./RosterManager'));
const MinistryManager = lazy(() => import('./MinistryManager'));
const InvitesPanel = lazy(() => import('./InvitesPanel'));
const SermonStudio = lazy(() => import('../SermonStudio'));
const ChurchMasterControl = lazy(() => import('../ChurchMasterControl'));
const ChurchConsole = lazy(() => import('../ChurchConsole'));
const ContentHQ = lazy(() => import('../ContentHQ'));
const EmployeeManager = lazy(() => import('../business/EmployeeManager'));
const HiringBoard = lazy(() => import('../business/HiringBoard'));
const MarketingKit = lazy(() => import('../MarketingKit'));
const FinanceHub = lazy(() => import('./chms/finance/FinanceHub'));
const BillingHubMount = lazy(() => import('../BillingMounts').then(m => ({ default: m.BillingHubMount })));
const PeopleHub = lazy(() => import('./chms/PeopleHub'));
const SpendingDesk = lazy(() => import('./chms/finance/SpendingDesk'));

const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem]';
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';

type SectionKey = 'overview' | 'people' | 'ministries' | 'invites' | 'giving' | 'money' | 'prayer' | 'media' | 'social' | 'store' | 'team' | 'marketing';
type Tool = null | 'sermons' | 'master' | 'console' | 'hq' | 'employees' | 'hiring' | 'marketing';

interface Props {
  /** Open a tool straight away (e.g. 'hq' from a Content HQ deep link). */
  initialTool?: Tool;
  org: Organization;
  isOwner: boolean;
  onClose: () => void;
  onOrgChange?: (o: Organization) => void;
  onVisitUser?: (uid: string) => void;
}

const Fallback = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={22} /></div>;

const ElevateOps: React.FC<Props> = ({ org: initialOrg, isOwner, onClose, onOrgChange, onVisitUser, initialTool }) => {
  const [org, setOrgState] = useState<Organization>(initialOrg);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [section, setSection] = useState<SectionKey>('overview');
  const [tool, setTool] = useState<Tool>(initialTool ?? null);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const billingNav = useBillingNav();
  const [peopleView, setPeopleView] = useState<'congregation' | 'roster'>('congregation');
  const [donationTotals, setDonationTotals] = useState<Record<string, number>>({});
  const uid = auth.currentUser?.uid;

  const setOrg = useCallback((o: Organization) => { setOrgState(o); onOrgChange?.(o); }, [onOrgChange]);
  const reload = useCallback(() => { fetchOrgMembers(org.id).then(setMembers).catch(() => {}); }, [org.id]);
  useEffect(() => { reload(); }, [reload]);

  // myMembership — same derivation as OrgProfile.
  const myMembership: OrgMembership | null = members.find(m => m.userId === uid) ||
    (isOwner && auth.currentUser
      ? { id: '', orgId: org.id, userId: auth.currentUser.uid, role: 'OWNER' as OrgRole, status: 'ACTIVE' as const, displayName: '', joinedAt: 0 }
      : null);
  const can = useCallback((p: OrgPermission) => elevateCan(myMembership, org, p), [myMembership, org]);
  const faith = isFaithOrg(org.orgType);

  useEffect(() => {
    if (can('VIEW_GIVING')) fetchChurchDonations(org.id).then(d => setDonationTotals(sumDonationsByFund(d))).catch(() => {});
  }, [org.id, can('VIEW_GIVING')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Money Inbox: spending/approvals for anyone who touches money; the count badges the nav item.
  const sp = spendingPerms(myMembership, org);
  const showMoney = !!myMembership && (sp.canSubmit || sp.canApprove || sp.canViewBooks);
  const moneyInbox = useMoneyInbox(org, myMembership, null, showMoney);

  const nav = useMemo(() => ([
    { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard, show: !!myMembership },
    { key: 'people' as const, label: 'People & Roster', icon: Users, show: can('MANAGE_ROSTER') || can('ASSIGN_ROLES') || (!!uid && (org.ministries || []).some(m => m.headUids?.includes(uid))) },
    { key: 'ministries' as const, label: 'Ministries', icon: Church, show: can('MANAGE_MINISTRIES') },
    { key: 'invites' as const, label: 'Invites', icon: Link2, show: can('MANAGE_INVITES') },
    { key: 'giving' as const, label: 'Giving', icon: Gift, show: can('MANAGE_GIVING') || can('VIEW_GIVING') || can('MANAGE_ACCOUNTING') || can('VIEW_ACCOUNTING') },
    { key: 'money' as const, label: 'Money', icon: Wallet, show: showMoney, badge: moneyInbox.count },
    { key: 'prayer' as const, label: 'Prayer', icon: HandHeart, show: faith && can('VIEW_PRAYER') },
    { key: 'media' as const, label: 'Media & Sermons', icon: MonitorPlay, show: can('MANAGE_SERMONS') || can('MANAGE_MEDIA') || can('MANAGE_CONTENT') },
    { key: 'social' as const, label: 'Social', icon: MessagesSquare, show: can('MODERATE_THREADS') || can('POST_AS_ORG') },
    { key: 'store' as const, label: 'Store', icon: ShoppingBag, show: can('MANAGE_STORE') },
    { key: 'team' as const, label: faith ? 'Volunteers & Staff' : 'Hiring & Staff', icon: Briefcase, show: can('MANAGE_EMPLOYEES') },
    { key: 'marketing' as const, label: 'Marketing', icon: Megaphone, show: can('MANAGE_CONTENT') || can('VIEW_ANALYTICS') },
  ] as { key: SectionKey; label: string; icon: any; show: boolean; badge?: number }[]).filter(n => n.show), [can, faith, myMembership, showMoney, moneyInbox.count]);

  // If the active section was hidden by a permission change, fall back.
  useEffect(() => { if (nav.length && !nav.some(n => n.key === section)) setSection(nav[0].key); }, [nav, section]);

  // ── Full-screen tools ─────────────────────────────────────────────────────
  const closeTool = () => setTool(null);
  if (tool) {
    return (
      <Suspense fallback={<Fallback />}>
        {tool === 'sermons' && can('MANAGE_SERMONS') && <SermonStudio church={org} onClose={closeTool} />}
        {tool === 'master' && can('MANAGE_MEDIA') && <ChurchMasterControl church={org} onClose={closeTool} />}
        {tool === 'console' && can('MANAGE_MEDIA') && <ChurchConsole church={org} onClose={closeTool} />}
        {tool === 'hq' && (can('MANAGE_CONTENT') || can('MANAGE_MEDIA') || myMembership?.status === 'ACTIVE') && (
          <ContentHQ scope={{ kind: 'org', id: org.id, ownerUid: org.creatorId, adminUids: org.admins, label: org.name }}
            canEdit={can('MANAGE_CONTENT') || can('MANAGE_MEDIA')} mediaOwnerUid={org.creatorId} onClose={closeTool} />
        )}
        {tool === 'employees' && can('MANAGE_EMPLOYEES') && <EmployeeManager org={org} myMembership={myMembership} onClose={closeTool} />}
        {tool === 'hiring' && can('MANAGE_EMPLOYEES') && <HiringBoard org={org} myMembership={myMembership} onClose={closeTool} />}
        {tool === 'marketing' && (
          <div className="min-h-full">
            <MarketingKit scope={{ kind: 'ORG', id: org.id, name: org.name }}
              currentUser={{ uid: uid || '', displayName: org.name } as UserProfile} onClose={closeTool} />
          </div>
        )}
      </Suspense>
    );
  }

  const checklist = setupChecklist(org, members);
  const done = checklist.filter(c => c.done).length;
  const pending = members.filter(m => m.status === 'PENDING').length;
  const active = members.filter(m => m.status === 'ACTIVE').length;
  const totalGiven = Object.values(donationTotals).reduce((a, b) => a + b, 0);

  const toolBtn = (t: Tool, label: string, Icon: any, show: boolean, hint?: string) => show && (
    <button key={label} onClick={() => setTool(t)} className={`${card} p-5 text-left hover:bg-white/[0.06] transition-all flex items-center gap-4`}>
      <div className="p-3 rounded-2xl bg-small-orange/15"><Icon size={18} className="text-small-orange" /></div>
      <div className="min-w-0"><p className="text-sm font-black text-white">{label}</p>{hint && <p className="text-[10px] text-white/40 mt-0.5">{hint}</p>}</div>
    </button>
  );

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onClose} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest"><ArrowLeft size={14} /> Public view</button>
        <div className="min-w-0">
          <h1 className="text-xl lg:text-3xl font-black uppercase tracking-tight text-white truncate">{org.name} · Operations</h1>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{myMembership?.title || myMembership?.roleKey || myMembership?.role || 'Member'}</p>
        </div>
      </div>

      {nav.length === 0 ? (
        <div className={`${card} p-10 text-center text-sm text-white/50`}>You don't have operations access for this organization yet.</div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          <nav className="md:w-56 shrink-0 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {nav.map(n => (
              <button key={n.key} onClick={() => setSection(n.key)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${section === n.key ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}>
                <n.icon size={14} /> {n.label}<CountBadge n={n.badge || 0} />
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0">
            <Suspense fallback={<Fallback />}>
              {section === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      ['Members', active], ['Pending', pending], ['Followers', org.followerCount ?? 0],
                      ...(can('VIEW_GIVING') ? [['Given', `$${totalGiven.toLocaleString()}`]] : [['Ministries', org.ministries?.length || 0]]),
                    ].map(([l, v]) => (
                      <div key={String(l)} className={`${card} p-4`}>
                        <p className="text-2xl font-black text-white">{v as any}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-1">{l}</p>
                      </div>
                    ))}
                  </div>
                  <div className={`${card} p-6`}>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Setup</h2>
                      <span className="text-[10px] font-black text-white/50">{done}/{checklist.length}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4"><div className="h-full bg-small-orange" style={{ width: `${(done / checklist.length) * 100}%` }} /></div>
                    <div className="space-y-2">
                      {checklist.map(c => (
                        <div key={c.key} className="flex items-center gap-2.5 text-xs">
                          {c.done ? <Check size={14} className="text-emerald-400" /> : <Circle size={14} className="text-white/25" />}
                          <span className={c.done ? 'text-white/50 line-through' : 'text-white/80 font-bold'}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {pending > 0 && can('MANAGE_ROSTER') && (
                    <button onClick={() => setSection('people')} className="w-full p-4 rounded-2xl bg-small-orange/10 border border-small-orange/30 text-left text-xs font-bold text-small-orange">
                      {pending} pending request{pending === 1 ? '' : 's'} waiting for review →
                    </button>
                  )}
                </div>
              )}

              {section === 'people' && (
                <div className="space-y-5">
                  <div className="flex gap-1.5">
                    {([['congregation', 'Congregation (ChMS)'], ['roster', 'Platform roster & roles']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setPeopleView(k)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${peopleView === k ? 'bg-small-orange text-black' : 'bg-white/5 text-white/50 hover:text-white'}`}>{l}</button>
                    ))}
                  </div>
                  {peopleView === 'congregation'
                    ? <PeopleHub org={org} myMembership={myMembership} onClose={() => setSection('overview')} />
                    : <RosterManager org={org} myMembership={myMembership} onClose={() => setSection('overview')} onChanged={() => { reload(); }} />}
                </div>
              )}
              {section === 'ministries' && <MinistryManager org={org} myMembership={myMembership} onClose={() => setSection('overview')} onChanged={() => { fetchOrganization(org.id).then(o => { if (o) setOrg(o); }).catch(() => {}); reload(); }} />}
              {section === 'invites' && <InvitesPanel org={org} myMembership={myMembership} />}

              {section === 'giving' && billingOpen && (can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING') || can('VIEW_ACCOUNTING')) && (
                <div className="space-y-4">
                  <button onClick={() => setBillingOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">← Back</button>
                  <Suspense fallback={null}><BillingHubMount entity={{ kind: 'ORG', id: org.id }} entityName={org.legalName || org.name} canManage={can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING')} accounting /></Suspense>
                </div>
              )}
              {section === 'giving' && !billingOpen && (financeOpen && (can('MANAGE_GIVING') || can('VIEW_GIVING')) ? (
                <FinanceHub org={org} myMembership={myMembership} onClose={() => setFinanceOpen(false)} onOrgChange={setOrg} />
              ) : (
                <div className="space-y-6">
                  {(can('MANAGE_GIVING') || can('VIEW_GIVING')) && (
                    <button onClick={() => setFinanceOpen(true)} className="w-full text-left px-5 py-4 rounded-[2rem] bg-small-orange/10 border border-small-orange/30 hover:bg-small-orange/20 transition-all">
                      <p className="text-sm font-black text-white">Finance Hub</p>
                      <p className="text-[10px] text-white/50 mt-0.5">Gift entry, batches, funds, pledges, statements, reports, QuickBooks export, reconciliation, audit</p>
                    </button>
                  )}
                  {(can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING') || can('VIEW_ACCOUNTING')) && (
                    <button onClick={() => setBillingOpen(true)} className="w-full text-left px-5 py-4 rounded-[2rem] bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                      <p className="text-sm font-black text-white">Billing &amp; Invoices{billingNav.state === 'soon' && <SoonPill />}</p>
                      <p className="text-[10px] text-white/50 mt-0.5">Invoice facility rentals, sponsors and vendors — paid to your organization&apos;s own Stripe account{!(can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING')) ? ' · read-only' : ''}</p>
                    </button>
                  )}
                  <GivingPanel org={org} canManage={can('MANAGE_GIVING')} totals={donationTotals} onSaved={setOrg} />
                </div>
              ))}

              {section === 'money' && showMoney && <SpendingDesk org={org} member={myMembership} onOpenFinanceHub={() => { setSection('giving'); setFinanceOpen(true); }} />}

              {section === 'prayer' && (
                <ChurchPrayerWall orgId={org.id} canSeePrivate={can('VIEW_PRAYER')} canManage={can('MANAGE_PRAYER')} />
              )}

              {section === 'media' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {toolBtn('sermons', 'Sermon Studio', Sparkles, can('MANAGE_SERMONS') && faith, 'Record, auto-transcribe → article / book')}
                  {toolBtn('master', 'Master Control', MonitorPlay, can('MANAGE_MEDIA') && faith, 'Livestream + service run-of-show')}
                  {toolBtn('console', 'Console', Mail, can('MANAGE_MEDIA') && faith, 'Messages & communications')}
                  {toolBtn('hq', 'Content HQ', HardDrive, true, 'Private files, brand assets, media library')}
                </div>
              )}

              {section === 'social' && (
                <SocialPanel org={org} myMembership={myMembership} onOrgChange={setOrg} onVisitUser={onVisitUser} />
              )}

              {section === 'store' && <OrgStoreSection org={org} mode="manage" onVisitUser={onVisitUser} onOrgChange={setOrg} />}

              {section === 'team' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {toolBtn('employees', 'Employees', UserCog, can('MANAGE_EMPLOYEES'), 'Staff records, roles, schedules')}
                  {toolBtn('hiring', faith ? 'Volunteers' : 'Hiring', Mic2, can('MANAGE_EMPLOYEES'), 'Open roles, applicants, sign-ups')}
                </div>
              )}

              {section === 'marketing' && (
                <div className="grid sm:grid-cols-2 gap-3">{toolBtn('marketing', 'Marketing Kit', Megaphone, true, 'Campaigns, social posting, share cards')}</div>
              )}
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Social: org-wide thread + each ministry/department thread ───────────────
const SocialPanel: React.FC<{ org: Organization; myMembership: OrgMembership | null; onOrgChange: (o: Organization) => void; onVisitUser?: (uid: string) => void }> = ({ org, myMembership, onOrgChange, onVisitUser }) => {
  const [sel, setSel] = useState<string>('ORG');
  const ministry = org.ministries?.find(m => m.id === sel);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button onClick={() => setSel('ORG')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${sel === 'ORG' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{org.name}</button>
        {(org.ministries || []).map(m => (
          <button key={m.id} onClick={() => setSel(m.id)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${sel === m.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{m.iconEmoji} {m.name}</button>
        ))}
      </div>
      <OrgThread key={sel} org={org} myMembership={myMembership} ministry={ministry} onVisitUser={onVisitUser} onOrgChange={onOrgChange} />
    </div>
  );
};

// ── Giving: funds, Stripe connect, external link. MANAGE_GIVING edits; VIEW_GIVING sees totals. ──
const GivingPanel: React.FC<{ org: Organization; canManage: boolean; totals: Record<string, number>; onSaved: (o: Organization) => void }> = ({ org, canManage, totals, onSaved }) => {
  const [funds, setFunds] = useState<GivingFund[]>(org.givingFunds || []);
  const [stripeAcct, setStripeAcct] = useState(org.stripeAccountId || '');
  const [givingUrl, setGivingUrl] = useState(org.givingUrl || '');
  const [newFund, setNewFund] = useState({ name: '', goal: '' });
  const [busy, setBusy] = useState(false);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);

  const save = async () => {
    setBusy(true);
    try {
      // Only fields finance roles may write (see organizations update rule).
      const patch: Partial<Organization> = {
        givingFunds: funds, givingUrl: givingUrl.trim() || undefined, stripeAccountId: stripeAcct.trim() || undefined,
        setupState: { ...(org.setupState || {}), givingReady: !!(stripeAcct.trim() || givingUrl.trim()) },
      };
      await updateOrganization(org.id, patch);
      onSaved({ ...org, ...patch } as Organization);
    } catch { alert('Could not save giving settings.'); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div className={`${card} p-5`}>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Total given</p>
        <p className="text-3xl font-black text-white mt-1">${total.toLocaleString()}</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          {Object.entries(totals).map(([f, v]) => (
            <div key={f} className="flex justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs"><span className="font-bold text-white">{f}</span><span className="text-white/60">${v.toLocaleString()}</span></div>
          ))}
        </div>
      </div>

      {canManage ? (
        <div className={`${card} p-5`}>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-3">Funds</h3>
          <div className="space-y-2 mb-3">
            {funds.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <span className="flex-1 text-xs font-bold text-white">{f.name}{f.goal ? <span className="text-white/30 font-medium"> · goal ${f.goal.toLocaleString()}</span> : ''}</span>
                <button onClick={() => setFunds(fs => fs.filter(x => x.id !== f.id))} className="text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-5">
            <input value={newFund.name} onChange={e => setNewFund(v => ({ ...v, name: e.target.value }))} placeholder="Fund name (e.g. Missions)" className={field} />
            <input value={newFund.goal} onChange={e => setNewFund(v => ({ ...v, goal: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Goal $" className={`${field} max-w-[30%]`} />
            <button onClick={() => { if (newFund.name.trim()) { setFunds(fs => [...fs, { id: Math.random().toString(36).slice(2, 9), name: newFund.name.trim(), goal: newFund.goal ? Number(newFund.goal) : undefined, raised: 0 }]); setNewFund({ name: '', goal: '' }); } }}
              className="px-4 rounded-2xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 shrink-0">Add</button>
          </div>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-3">Payouts</h3>
          <div className="flex items-center gap-2 mb-3">
            <input value={stripeAcct} onChange={e => setStripeAcct(e.target.value.trim())} placeholder="Stripe payout account (acct_…)" className={field} />
            <button type="button" onClick={async () => { const t = await auth.currentUser?.getIdToken(); if (t) connectStripe({ orgId: org.id, userIdToken: t }).catch(e => alert(e?.message || 'Could not start Stripe onboarding')); }}
              className="px-4 py-3 rounded-2xl bg-[#635bff] text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 shrink-0 whitespace-nowrap">Connect Stripe</button>
          </div>
          {stripeAcct && <p className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-3 flex items-center gap-1.5"><Check size={11} /> Payouts connected</p>}
          <input value={givingUrl} onChange={e => setGivingUrl(e.target.value)} placeholder="External giving link (optional — overrides native Stripe giving)" className={`${field} mb-5`} />
          <button onClick={save} disabled={busy} className="w-full py-4 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save giving settings'}
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-white/40">You can view giving totals. Setup is limited to finance roles and pastors.</p>
      )}
    </div>
  );
};

export default ElevateOps;
