// ElevateOps — the OPERATIONS side of Plajah Elevate (staff / pastors / department heads / volunteers).
//
// The public org page is the "Public view"; this is the working dashboard. Every section is gated by
// elevateCan(myMembership, org, <permission>) — sections the viewer lacks permission for are hidden, so a
// Prayer Warrior sees only Prayer, Finance sees only Giving, Media sees Sermons/Media/Store, etc.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, LayoutDashboard, Users, Church, Link2, Gift, HandHeart, MonitorPlay, MessagesSquare, ShoppingBag,
  Briefcase, Megaphone, Check, Circle, Loader2, Trash2, Sparkles, Mail, HardDrive, UserCog, Mic2, Wallet, KeyRound, GraduationCap, Music, ShieldCheck,
  Calendar, Radio, Upload, Send, DollarSign, TrendingUp,
} from 'lucide-react';
import { spendingPerms } from '../../services/acctSpending';
import { CountBadge, useMoneyInbox } from './chms/finance/SpendingUi';
import type { Organization, OrgMembership, OrgPermission, OrgRole, UserProfile, GivingFund } from '../../types';
import { fetchOrgMembers, fetchOrganization, updateOrganization, fetchChurchDonations, sumDonationsByFund } from '../../services/organizationService';
import { elevateCan } from '../../services/elevateRoles';
import { useBillingNav, SoonPill } from '../BillingMounts';
import { isFaithOrg, ensureChurchMusicAndEducationDepartments } from '../../services/elevateTemplates';
import { setupChecklist } from '../../services/elevateService';
import { auth } from '../../services/backendService';
import { connectStripe } from '../../services/stripeService';
import ChurchPrayerWall from '../ChurchPrayerWall';
import OrgThread from './OrgThread';
import OrgStoreSection from './OrgStoreSection';
import OrgSecurityShield, { OrgSecurityPanel } from './OrgSecurityShield';
import CreateEventButton from '../events/CreateEventButton';

// Sibling modules built in parallel — lazy so a missing/late file never breaks the page shell.
const RosterManager = lazy(() => import('./RosterManager'));
const MinistryManager = lazy(() => import('./MinistryManager'));
const InvitesPanel = lazy(() => import('./InvitesPanel'));
const AccountsPanel = lazy(() => import('./AccountsPanel'));
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
const ChurchEducation = lazy(() => import('../church/ChurchEducation'));
const ChurchMusicDepartmentHub = lazy(() => import('./ChurchMusicDepartmentHub'));

const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem]';
const V = '#8B5CF6';   // Grace Chapel violet
const VS = '#B79BF5';
const SECTION_SUB: Partial<Record<SectionKey, string>> = {
  overview: 'Everything about your organization at a glance.',
  people: 'Your directory — import from Servant Keeper or a CSV, export anytime.',
  giving: 'Funds, recurring gifts and payouts — on your own Stripe account.',
  events: 'Ticketing, RSVPs and check-in — built in.',
  prayer: 'Moderate requests, mark answered, keep private ones private.',
  team: 'Staff, volunteers and roles — grant access to the tools each needs.',
  education: 'Sunday school, Bible study & discipleship on the education stack.',
};
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';

type SectionKey = 'overview' | 'messages' | 'events' | 'multisite' | 'people' | 'ministries' | 'education' | 'music' | 'invites' | 'accounts' | 'security' | 'giving' | 'money' | 'prayer' | 'media' | 'social' | 'store' | 'team' | 'marketing';
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
  const [org, setOrgState] = useState<Organization>(() => ({
    ...initialOrg,
    ministries: ensureChurchMusicAndEducationDepartments(initialOrg),
  }));
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

  // Grace Chapel admin-backend order first (Overview → Classes), then the deeper tools.
  const nav = useMemo(() => ([
    { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard, show: !!myMembership },
    { key: 'messages' as const, label: 'Messages', icon: Mail, show: can('MANAGE_MEDIA') },
    { key: 'people' as const, label: 'People', icon: Users, show: can('MANAGE_ROSTER') || can('ASSIGN_ROLES') || (!!uid && (org.ministries || []).some(m => m.headUids?.includes(uid))) },
    { key: 'giving' as const, label: 'Giving', icon: Gift, show: can('MANAGE_GIVING') || can('VIEW_GIVING') || can('MANAGE_ACCOUNTING') || can('VIEW_ACCOUNTING') },
    { key: 'events' as const, label: 'Events', icon: Calendar, show: can('POST_AS_ORG') || can('MANAGE_CONTENT') || isOwner },
    { key: 'prayer' as const, label: 'Prayer', icon: HandHeart, show: faith && can('VIEW_PRAYER') },
    { key: 'team' as const, label: 'Team & Roles', icon: UserCog, show: can('MANAGE_EMPLOYEES') || can('ASSIGN_ROLES') },
    { key: 'multisite' as const, label: 'Multi-site', icon: MonitorPlay, show: faith && can('MANAGE_MEDIA') },
    { key: 'education' as const, label: 'Classes', icon: GraduationCap, show: faith && !!myMembership },
    { key: 'ministries' as const, label: faith ? 'Ministries' : 'Departments', icon: Church, show: can('MANAGE_MINISTRIES') },
    { key: 'music' as const, label: 'Music Department', icon: Music, show: faith && !!myMembership },
    { key: 'invites' as const, label: 'Invites', icon: Link2, show: can('MANAGE_INVITES') },
    { key: 'accounts' as const, label: 'Accounts & Access', icon: KeyRound, show: can('MANAGE_ROSTER') },
    { key: 'security' as const, label: 'Security & Privacy', icon: ShieldCheck, show: can('MANAGE_ROSTER') || can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING') || isOwner },
    { key: 'money' as const, label: 'Money', icon: Wallet, show: showMoney, badge: moneyInbox.count },
    { key: 'media' as const, label: 'Media & Sermons', icon: Radio, show: can('MANAGE_SERMONS') || can('MANAGE_MEDIA') || can('MANAGE_CONTENT') },
    { key: 'social' as const, label: 'Social', icon: MessagesSquare, show: can('MODERATE_THREADS') || can('POST_AS_ORG') },
    { key: 'store' as const, label: 'Store', icon: ShoppingBag, show: can('MANAGE_STORE') },
    { key: 'marketing' as const, label: 'Marketing', icon: Megaphone, show: can('MANAGE_CONTENT') || can('VIEW_ANALYTICS') },
  ] as { key: SectionKey; label: string; icon: any; show: boolean; badge?: number }[]).filter(n => n.show), [can, faith, isOwner, myMembership, showMoney, moneyInbox.count, org.ministries, uid]);

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

  const current = nav.find(n => n.key === section);
  const kpi = (label: string, value: React.ReactNode, sub: string | undefined, Icon: any) => (
    <div key={label} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
      <div className="flex items-center justify-between mb-2"><span className="text-[9px] font-black uppercase tracking-widest text-white/35">{label}</span><Icon size={14} style={{ color: VS }} /></div>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      {sub && <p className="text-[10px] font-bold mt-0.5" style={{ color: VS }}>{sub}</p>}
    </div>
  );
  const quick = (label: string, Icon: any, to: SectionKey) => nav.some(n => n.key === to) && (
    <button key={label} onClick={() => setSection(to)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white/60 hover:text-white transition-all">
      <Icon size={12} /> {label}
    </button>
  );

  // Same shell as the Grace Chapel admin backend (ChurchAdminDemoView): violet strip, icon sidebar, section header.
  return (
    <div className="flex flex-col bg-[#0d0b12]" style={{ minHeight: 'calc(100dvh - 48px)' }}>
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-white/8" style={{ background: 'rgba(139,92,246,0.10)' }}>
        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md text-white shrink-0" style={{ background: V }}>Admin Backend</span>
        <p className="type-body-sm font-bold text-white/60 truncate">{org.name} · {faith ? 'Ministry admin' : 'Organization admin'} · {myMembership?.title || myMembership?.roleKey || myMembership?.role || 'Member'}</p>
        <button onClick={onClose} className="ml-auto shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white bg-white/5 border border-white/10"><ArrowLeft size={12} /> Public page</button>
      </div>

      {nav.length === 0 ? (
        <div className="m-6 rounded-2xl p-10 text-center text-sm text-white/50 bg-white/[0.03] border border-white/10">You don't have admin access for this organization yet.</div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <nav className="w-16 lg:w-52 shrink-0 border-r border-white/8 p-2 lg:p-3 overflow-y-auto scrollbar-hide">
            {nav.map(n => (
              <button key={n.key} onClick={() => setSection(n.key)} title={n.label}
                className={`w-full flex items-center gap-2.5 px-2 lg:px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mb-1 ${section === n.key ? 'text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                style={section === n.key ? { background: 'rgba(139,92,246,0.18)' } : undefined}>
                <n.icon size={15} className="shrink-0" /> <span className="hidden lg:inline truncate">{n.label}</span><CountBadge n={n.badge || 0} />
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide p-4 sm:p-5 lg:p-8">
            {current && section !== 'messages' && section !== 'multisite' && (
              <div className="mb-5"><h2 className="text-xl font-black uppercase tracking-tight text-white">{current.label}</h2>{SECTION_SUB[section] && <p className="type-body-sm text-white/40 mt-0.5">{SECTION_SUB[section]}</p>}</div>
            )}
            <Suspense fallback={<Fallback />}>
              {section === 'overview' && (
                <div className="space-y-5 max-w-4xl">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {kpi('Members', active, pending ? `${pending} pending` : undefined, Users)}
                    {can('VIEW_GIVING') ? kpi('Giving · all time', `$${totalGiven.toLocaleString()}`, undefined, TrendingUp) : kpi(faith ? 'Ministries' : 'Departments', org.ministries?.length || 0, undefined, Church)}
                    {kpi('Followers', org.followerCount ?? 0, undefined, Sparkles)}
                    {kpi('Campuses', Math.max(1, org.campuses?.length || 0), undefined, MonitorPlay)}
                  </div>
                  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Quick actions</p>
                    <div className="flex flex-wrap gap-2">
                      {quick('Broadcast', Send, 'messages')}
                      {quick('Import people', Upload, 'people')}
                      {quick('Giving', DollarSign, 'giving')}
                    </div>
                  </div>
                  <div className="rounded-2xl p-5 bg-white/[0.03] border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[10px] font-black uppercase tracking-widest" style={{ color: VS }}>Setup</h2>
                      <span className="text-[10px] font-black text-white/50">{done}/{checklist.length}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4"><div className="h-full" style={{ width: `${(done / checklist.length) * 100}%`, background: V }} /></div>
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


              {section === 'messages' && can('MANAGE_MEDIA') && <ChurchConsole church={org} onClose={() => setSection('overview')} />}
              {section === 'multisite' && can('MANAGE_MEDIA') && <ChurchMasterControl church={org} onClose={() => setSection('overview')} />}

              {section === 'events' && (
                <div className="max-w-3xl space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CreateEventButton host={{ kind: 'org', id: org.id, label: org.name }} />
                  </div>
                  <p className="type-body-sm text-white/40">Events you create here appear on the public page's Events tab, with RSVPs, ticketing and check-in.</p>
                </div>
              )}

              {section === 'people' && (
                <OrgSecurityShield org={org} surface="People & Congregation Directory" mode="pii">
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
                </OrgSecurityShield>
              )}
              {section === 'ministries' && <MinistryManager org={org} myMembership={myMembership} onClose={() => setSection('overview')} onChanged={() => { fetchOrganization(org.id).then(o => { if (o) setOrg(o); }).catch(() => {}); reload(); }} />}
              {section === 'education' && <ChurchEducation church={org} canEdit={can('MANAGE_MINISTRIES') || can('MANAGE_CONTENT') || isOwner} />}
              {section === 'music' && <ChurchMusicDepartmentHub church={org} canEdit={can('MANAGE_MINISTRIES') || can('MANAGE_CONTENT') || isOwner} />}
              {section === 'invites' && <InvitesPanel org={org} myMembership={myMembership} />}
              {section === 'accounts' && <AccountsPanel org={org} myMembership={myMembership} onOrgChange={setOrg} />}
              {section === 'security' && <OrgSecurityPanel org={org} myMembership={myMembership} onOrgChange={setOrg} />}

              {section === 'giving' && billingOpen && (can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING') || can('VIEW_ACCOUNTING')) && (
                <OrgSecurityShield org={org} surface="Billing & Invoices" mode="financial">
                  <div className="space-y-4">
                    <button onClick={() => setBillingOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">← Back</button>
                    <Suspense fallback={null}><BillingHubMount entity={{ kind: 'ORG', id: org.id }} entityName={org.legalName || org.name} canManage={can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING')} accounting /></Suspense>
                  </div>
                </OrgSecurityShield>
              )}
              {section === 'giving' && !billingOpen && (financeOpen && (can('MANAGE_GIVING') || can('VIEW_GIVING')) ? (
                <FinanceHub org={org} myMembership={myMembership} onClose={() => setFinanceOpen(false)} onOrgChange={setOrg} />
              ) : (
                <OrgSecurityShield org={org} surface="Giving & Funds" mode="financial">
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
                </OrgSecurityShield>
              ))}

              {section === 'money' && showMoney && (
                <OrgSecurityShield org={org} surface="Money & Spending Desk" mode="financial">
                  <SpendingDesk org={org} member={myMembership} onOpenFinanceHub={() => { setSection('giving'); setFinanceOpen(true); }} />
                </OrgSecurityShield>
              )}

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
                <div className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {toolBtn('employees', 'Employees', UserCog, can('MANAGE_EMPLOYEES'), 'Staff records, roles, schedules')}
                    {toolBtn('hiring', faith ? 'Volunteers' : 'Hiring', Mic2, can('MANAGE_EMPLOYEES'), 'Open roles, applicants, sign-ups')}
                  </div>
                  {(can('MANAGE_ROSTER') || can('ASSIGN_ROLES')) && (
                    <RosterManager org={org} myMembership={myMembership} onClose={() => setSection('overview')} onChanged={() => { reload(); }} />
                  )}
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
