// ElevateOps — the OPERATIONS side of Plajah Elevate (staff / pastors / department heads / volunteers).
//
// The public org page is the "Public view"; this is the working dashboard. Every section is gated by
// elevateCan(myMembership, org, <permission>) — sections the viewer lacks permission for are hidden, so a
// Prayer Warrior sees only Prayer, Finance sees only Giving, Media sees Sermons/Media/Store, etc.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, LayoutDashboard, Users, Church, Link2, Gift, HandHeart, MonitorPlay, MessagesSquare, ShoppingBag,
  Briefcase, Megaphone, Check, Circle, Loader2, Trash2, Sparkles, Mail, HardDrive, UserCog, Mic2, Wallet, KeyRound, GraduationCap, Music, ShieldCheck,
  Calendar, Radio, Upload, Send, DollarSign, TrendingUp, BookOpen,
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
const SermonPrep = lazy(() => import('./SermonPrep'));
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
const ElevateMobilizeHub = lazy(() => import('./ElevateMobilizeHub'));
const GrowthHub = lazy(() => import('../growth/GrowthHub'));
import { EV, EvLabel, EvKpiStrip } from './vellum';
import { opsPresetForOrg } from '../../services/opsPresets';
import type { MailRecipient } from '../../services/marketing/handoff';

const card = 'ev-panel';
const V = EV.violet;
const VS = EV.violetText;
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

type SectionKey = 'overview' | 'mobilize' | 'messages' | 'events' | 'multisite' | 'people' | 'ministries' | 'education' | 'music' | 'invites' | 'accounts' | 'security' | 'giving' | 'money' | 'prayer' | 'media' | 'social' | 'store' | 'team' | 'marketing';
type Tool = null | 'sermons' | 'sermonprep' | 'master' | 'console' | 'hq' | 'employees' | 'hiring' | 'marketing';

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
    { key: 'mobilize' as const, label: 'Action & Shifts', icon: Sparkles, show: !!myMembership || isOwner },
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

  // Ops preset: the events / social / marketing playbooks wired for this kind of org.
  const preset = useMemo(() => opsPresetForOrg(org), [org.orgType, org.templateId]);
  const growthHost = { kind: 'org' as const, id: org.id, name: org.name };
  const growthIdentity = {
    name: org.name, phone: org.location?.phone, website: org.location?.website, logoUrl: org.logoUrl,
    address: { line1: org.location?.address, city: org.location?.city },
  };
  /** Mailing list for mail hand-offs: ChMS people with a full address (never minors' own records; households carry the address). */
  const loadOrgRecipients = useCallback(async (): Promise<MailRecipient[]> => {
    const { fetchPeople } = await import('../../services/chmsPeople');
    const people = await fetchPeople(org.id).catch(() => []);
    return people
      .filter(x => x.householdRole !== 'CHILD' && x.address?.line1 && x.address.city && x.address.region && x.address.postal)
      .map(x => ({ name: `${x.preferredName || x.firstName} ${x.lastName}`.trim(), line1: x.address!.line1!, line2: x.address!.line2, city: x.address!.city!, region: x.address!.region!, postal: x.address!.postal! }));
  }, [org.id]);
  const growth = (only: 'events' | 'social' | 'marketing') => (
    <GrowthHub
      preset={preset}
      host={growthHost}
      currentUser={{ uid: uid || '', displayName: org.name }}
      identity={growthIdentity}
      canManage={isOwner || can('POST_AS_ORG') || can('MANAGE_CONTENT')}
      loadRecipients={loadOrgRecipients}
      onOpenSuite={() => setTool('marketing')}
      only={only}
    />
  );
  if (tool) {
    return (
      <Suspense fallback={<Fallback />}>
        {tool === 'sermons' && can('MANAGE_SERMONS') && <SermonStudio church={org} onClose={closeTool} />}
        {tool === 'sermonprep' && can('MANAGE_SERMONS') && <SermonPrep church={org} onClose={closeTool} />}
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
  const quick = (label: string, Icon: any, to: SectionKey) => nav.some(n => n.key === to) && (
    <button key={label} onClick={() => setSection(to)} className="ev-btn ev-btn-ghost" style={{ minHeight: 40, fontSize: 13 }}>
      <Icon size={14} /> {label}
    </button>
  );
  const roleLine = myMembership?.title || myMembership?.roleKey || myMembership?.role || 'Member';

  // Same shell as the Grace Chapel admin backend (ChurchAdminDemoView): violet strip, icon sidebar, section header.
  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 48px)' }}>
      {nav.length === 0 ? (
        <div className="m-6 ev-panel p-10 text-center text-sm text-[#A49CB2]">You don't have staff access for this organization yet.</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* A labelled, swipeable tab strip on a phone; the icon rail from tablet up. */}
          <nav aria-label="Staff" className="shrink-0 flex md:block gap-1 md:gap-0 border-b md:border-b-0 md:border-r p-2 lg:p-4 md:w-16 lg:w-56 overflow-x-auto md:overflow-x-visible md:overflow-y-auto scrollbar-hide" style={{ borderColor: EV.line }}>
            {nav.map(n => (
              <button key={n.key} onClick={() => setSection(n.key)} title={n.label} aria-current={section === n.key ? 'page' : undefined}
                className={`md:w-full shrink-0 whitespace-nowrap flex items-center gap-2 md:gap-3 px-3 md:px-2.5 lg:px-3 py-2.5 rounded-xl text-sm transition-colors md:mb-0.5 ${section === n.key ? 'text-white font-semibold' : 'text-[#A49CB2] hover:text-white hover:bg-white/[0.04]'}`}
                style={section === n.key ? { background: EV.raised } : undefined}>
                <n.icon size={16} className="shrink-0" /> <span className="md:hidden lg:inline truncate">{n.label}</span><CountBadge n={n.badge || 0} />
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide p-4 sm:p-6 lg:p-10">
            {current && section !== 'overview' && section !== 'mobilize' && section !== 'messages' && section !== 'multisite' && (
              <div className="mb-6"><h2 className="m-0 ev-display text-white" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.5rem)', lineHeight: 1.05 }}>{current.label}</h2>{SECTION_SUB[section] && <p className="text-[15px] text-[#A49CB2] mt-2 mb-0">{SECTION_SUB[section]}</p>}</div>
            )}
            <Suspense fallback={<Fallback />}>
              {section === 'overview' && (
                <div className="ev-fade space-y-8 max-w-[1100px]">
                  <div>
                    <div className="text-[13px] text-[#A49CB2] pb-1.5">{roleLine} · {org.name}</div>
                    <h2 className="m-0 ev-display text-white" style={{ fontSize: 'clamp(2.25rem, 4vw, 3rem)', lineHeight: 1 }}>{faith ? 'This week' : 'Overview'}</h2>
                  </div>
                  <EvKpiStrip items={[
                    { label: 'Members', value: String(active), note: pending ? `${pending} pending` : undefined, tone: pending ? 'warn' : 'flat' },
                    can('VIEW_GIVING')
                      ? { label: 'Giving · all time', value: `$${totalGiven.toLocaleString()}` }
                      : { label: faith ? 'Ministries' : 'Departments', value: String(org.ministries?.length || 0) },
                    { label: 'Followers', value: String(org.followerCount ?? 0) },
                    { label: 'Campuses', value: String(Math.max(1, org.campuses?.length || 0)) },
                  ]} />
                  {pending > 0 && can('MANAGE_ROSTER') && (
                    <button onClick={() => setSection('people')} className="w-full ev-panel p-5 text-left text-[15px] font-medium flex items-center gap-3" style={{ color: EV.warn }}>
                      <span className="ev-live-dot" /> {pending} membership request{pending === 1 ? '' : 's'} waiting for review
                    </button>
                  )}
                  <div className="flex flex-wrap gap-5 items-start">
                    <div className="ev-panel p-6" style={{ flex: '1 1 420px', minWidth: 0 }}>
                      <div className="flex items-baseline justify-between mb-3">
                        <h3 className="m-0 ev-title text-[22px] text-white">Setup</h3>
                        <span className="ev-num text-[15px] text-[#A49CB2]">{done}/{checklist.length}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: EV.raised }}><div className="h-full rounded-full" style={{ width: `${(done / checklist.length) * 100}%`, background: EV.brand }} /></div>
                      <div className="ev-rule">
                        {checklist.map(c => (
                          <div key={c.key} className="flex items-center gap-3 py-2.5 text-sm">
                            {c.done ? <Check size={15} style={{ color: EV.success }} /> : <Circle size={15} className="text-white/25" />}
                            <span className={c.done ? 'text-[#A49CB2] line-through' : 'text-white'}>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="ev-panel p-6" style={{ flex: '1 1 300px', minWidth: 0 }}>
                      <h3 className="m-0 mb-4 ev-title text-[22px] text-white">Quick actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {quick('Serve & shifts', Sparkles, 'mobilize')}
                        {quick('Broadcast', Send, 'messages')}
                        {quick('Import people', Upload, 'people')}
                        {quick('Giving', DollarSign, 'giving')}
                        {faith && (
                          <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_AMBO'))} className="ev-btn ev-btn-ghost" style={{ minHeight: 40, fontSize: 13 }}>
                            <MonitorPlay size={14} /> Open Stage
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {section === 'mobilize' && (
                <ElevateMobilizeHub
                  org={org}
                  currentUserId={uid || ''}
                  currentUserName={myMembership?.displayName || auth.currentUser?.displayName || 'Ministry Leader'}
                  currentUserEmail={auth.currentUser?.email || undefined}
                  canManage={can('MANAGE_MINISTRIES') || can('MANAGE_ROSTER') || can('MANAGE_EMPLOYEES') || isOwner}
                  initialContext="ops"
                />
              )}

              {section === 'messages' && can('MANAGE_MEDIA') && <ChurchConsole church={org} onClose={() => setSection('overview')} />}
              {section === 'multisite' && can('MANAGE_MEDIA') && <ChurchMasterControl church={org} onClose={() => setSection('overview')} />}

              {section === 'events' && growth('events')}

              {section === 'people' && (
                <OrgSecurityShield org={org} surface="People & Congregation Directory" mode="pii">
                  <div className="space-y-5">
                    <div className="flex gap-1.5">
                      {([['congregation', 'Congregation (ChMS)'], ['roster', 'Platform roster & roles']] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setPeopleView(k)} className={`px-4 py-2 rounded-full text-[10px] font-semibold ${peopleView === k ? 'bg-small-orange text-black' : 'bg-white/5 text-white/50 hover:text-white'}`}>{l}</button>
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
                    <button onClick={() => setBillingOpen(false)} className="text-[10px] font-semibold text-white/50 hover:text-white">← Back</button>
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
                <div className="ev-fade grid sm:grid-cols-2 gap-3">
                  {toolBtn('sermonprep', 'Sermon Prep', BookOpen, can('MANAGE_SERMONS') && faith, 'Study, outline, write and preach: works from your phone')}
                  {toolBtn('sermons', 'Sermon Studio', Sparkles, can('MANAGE_SERMONS') && faith, 'Record, auto-transcribe → article / book')}
                  {toolBtn('master', 'Master Control', MonitorPlay, can('MANAGE_MEDIA') && faith, 'Livestream + service run-of-show')}
                  {toolBtn('console', 'Console', Mail, can('MANAGE_MEDIA') && faith, 'Messages & communications')}
                  {toolBtn('hq', 'Content HQ', HardDrive, true, 'Private files, brand assets, media library')}
                </div>
              )}

              {section === 'social' && (
                <div className="ev-fade space-y-12">
                  {(can('POST_AS_ORG') || isOwner) && growth('social')}
                  <SocialPanel org={org} myMembership={myMembership} onOrgChange={setOrg} onVisitUser={onVisitUser} />
                </div>
              )}

              {section === 'store' && <OrgStoreSection org={org} mode="manage" canManage accent={EV.violet} onVisitUser={onVisitUser} onOrgChange={setOrg} />}

              {section === 'team' && (
                <div className="ev-fade space-y-5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {toolBtn('employees', 'Employees', UserCog, can('MANAGE_EMPLOYEES'), 'Staff records, roles, schedules')}
                    {toolBtn('hiring', faith ? 'Volunteers' : 'Hiring', Mic2, can('MANAGE_EMPLOYEES'), 'Open roles, applicants, sign-ups')}
                  </div>
                  {(can('MANAGE_ROSTER') || can('ASSIGN_ROLES')) && (
                    <RosterManager org={org} myMembership={myMembership} onClose={() => setSection('overview')} onChanged={() => { reload(); }} />
                  )}
                </div>
              )}

              {section === 'marketing' && growth('marketing')}
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
        <button onClick={() => setSel('ORG')} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border ${sel === 'ORG' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{org.name}</button>
        {(org.ministries || []).map(m => (
          <button key={m.id} onClick={() => setSel(m.id)} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border ${sel === m.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{m.iconEmoji} {m.name}</button>
        ))}
      </div>
      <OrgThread key={sel} org={org} myMembership={myMembership} ministry={ministry} onVisitUser={onVisitUser} onOrgChange={onOrgChange} />
    </div>
  );
};

// ── Giving: funds, Stripe connect, external link. MANAGE_GIVING edits; VIEW_GIVING sees totals. ──
const GivingPanel: React.FC<{ org: Organization; canManage: boolean; totals: Record<string, number>; onSaved: (o: Organization) => void }> = ({ org, canManage, totals, onSaved }) => {
  const [funds, setFunds] = useState<GivingFund[]>(org.givingFunds || []);
  const [givingUrl, setGivingUrl] = useState(org.givingUrl || '');
  const [newFund, setNewFund] = useState({ name: '', goal: '' });
  const [busy, setBusy] = useState(false);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);

  const save = async () => {
    setBusy(true);
    try {
      // Funds go through saveFunds: merged onto the latest list and blocked from dropping/unrestricting
      // a restricted fund that still holds money. stripeAccountId is server-written only (Connect onboarding).
      const [{ saveFunds }, { loadFundBalances }] = await Promise.all([import('../../services/chmsFinance'), import('../../services/acctService')]);
      const bal = await loadFundBalances(org.id, org.givingFunds || []);
      const saved = await saveFunds(org, funds, id => bal?.get(id) ?? totals[(org.givingFunds || []).find(f => f.id === id)?.name || ''] ?? 0);
      const patch: Partial<Organization> = {
        givingUrl: givingUrl.trim() || undefined,
        setupState: { ...(org.setupState || {}), givingReady: !!(org.stripeAccountId || givingUrl.trim()) },
      };
      await updateOrganization(org.id, patch);
      setFunds(saved);
      onSaved({ ...org, ...patch, givingFunds: saved } as Organization);
    } catch (e: any) { alert(e?.message || 'Could not save giving settings.'); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div className={`${card} p-5`}>
        <p className="text-[9px] font-semibold text-white/40">Total given</p>
        <p className="text-3xl font-black text-white mt-1">${total.toLocaleString()}</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          {Object.entries(totals).map(([f, v]) => (
            <div key={f} className="flex justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs"><span className="font-bold text-white">{f}</span><span className="text-white/60">${v.toLocaleString()}</span></div>
          ))}
        </div>
      </div>

      {canManage ? (
        <div className={`${card} p-5`}>
          <h3 className="text-[10px] font-semibold text-small-orange mb-3">Funds</h3>
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
              className="px-4 rounded-2xl bg-white/10 text-white text-[10px] font-semibold hover:bg-white/20 shrink-0">Add</button>
          </div>
          <h3 className="text-[10px] font-semibold text-small-orange mb-3">Payouts</h3>
          <div className="flex items-center gap-2 mb-3">
            <p className="flex-1 text-[11px] text-white/50">{org.stripeAccountId ? 'Stripe is connected. Payout details are managed in Stripe.' : 'Connect Stripe to accept card and bank gifts. Stripe verifies the account; nobody types an account number here.'}</p>
            <button type="button" onClick={async () => { const t = await auth.currentUser?.getIdToken(); if (t) connectStripe({ orgId: org.id, userIdToken: t }).catch(e => alert(e?.message || 'Could not start Stripe onboarding')); }}
              className="px-4 py-3 rounded-2xl bg-[#635bff] text-white text-[10px] font-semibold hover:brightness-110 shrink-0 whitespace-nowrap">Connect Stripe</button>
          </div>
          {org.stripeAccountId && <p className="text-[9px] font-semibold text-green-400 mb-3 flex items-center gap-1.5"><Check size={11} /> Payouts connected</p>}
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
