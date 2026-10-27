// ElevateOps — the unified MANAGE & STUDIO backend of Plajah Elevate (owners / pastors / department heads / staff).
//
// Matches the Plajah Elevate Landing Page (PlajahElevate.tsx) visual language:
// - Deep sanctuary obsidian (#0b0214) + glass cards + Plajah brand gradient (#6B0099 → #D40055 → #FF8C00)
// - Unified "Page & Hero Identity" studio (Live WYSIWYG Hero Cover & Logo uploader, Identity & Welcome Copy,
//   Service Times & Gatherings, Multi-site Campuses, Visibility, and Danger Zone) + Operations pillars.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, Church, Link2, Gift, HandHeart, MonitorPlay, MessagesSquare, ShoppingBag,
  Megaphone, Check, Circle, Loader2, Trash2, Sparkles, Mail, HardDrive, UserCog, Mic2, Wallet, KeyRound, GraduationCap, Music, ShieldCheck,
  Calendar, Radio, Upload, Send, DollarSign, BookOpen, Landmark, Palette, Clock, MapPin, Plus, Globe,
} from 'lucide-react';
import { spendingPerms } from '../../services/acctSpending';
import { CountBadge, useMoneyInbox } from './chms/finance/SpendingUi';
import type { Organization, OrgMembership, OrgPermission, OrgRole, UserProfile, GivingFund, ServiceTime, ChurchCampus } from '../../types';
import { fetchOrgMembers, fetchOrganization, updateOrganization, fetchChurchDonations, sumDonationsByFund } from '../../services/organizationService';
import { elevateCan } from '../../services/elevateRoles';
import { canViewerAccessAnswerKey } from '../../services/orgEducationScopeService';
import { useBillingNav, SoonPill } from '../BillingMounts';
import { isFaithOrg, ensureChurchMusicAndEducationDepartments } from '../../services/elevateTemplates';
import { setupChecklist } from '../../services/elevateService';
import { auth } from '../../services/backendService';
import { connectStripe } from '../../services/stripeService';
import ChurchPrayerWall from '../ChurchPrayerWall';
import OrgThread from './OrgThread';
import OrgStoreSection from './OrgStoreSection';
import OrgSecurityShield, { OrgSecurityPanel } from './OrgSecurityShield';
import IdentityEditor from './IdentityEditor';
import DeleteOrgDialog from './DeleteOrgDialog';
import {
  LECTIO_COUNCIL_PLATES,
  openCouncilPlateInLorea,
  getActiveLectioCouncilPlateId,
  setActiveLectioCouncilPlateId,
  type ArtCouncilLens,
} from '../../services/lectioNonScriptureCouncil';
import { CouncilPlatePreviewCard } from '../scripture/LectioCouncilPlatesModal';

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
const ElevateTelaOperationsSuite = lazy(() => import('./ElevateTelaOperationsSuite'));
const GrowthHub = lazy(() => import('../growth/GrowthHub'));
const GrantHub = lazy(() => import('./GrantHub'));
const OrgCentralCalendarHub = lazy(() => import('./OrgCentralCalendarHub'));
const VolunteerMemberManageHub = lazy(() => import('./VolunteerMemberManageHub'));
import { EV, EvKpiStrip } from './vellum';
import { opsPresetForOrg } from '../../services/opsPresets';
import type { MailRecipient } from '../../services/marketing/handoff';

const card = 'ev-panel';
const SECTION_SUB: Partial<Record<SectionKey, string>> = {
  overview: 'Everything about your organization at a glance.',
  identity: 'Live Hero Cover & Logo Studio, welcome copy, service gatherings, campuses and page visibility.',
  people: 'Your directory — import from Servant Keeper or a CSV, export anytime.',
  giving: 'Funds, recurring gifts and payouts — on your own Stripe account.',
  events: 'Ticketing, RSVPs and check-in — built in.',
  prayer: 'Moderate requests, mark answered, keep private ones private.',
  team: 'Staff, volunteers and roles — grant access to the tools each needs.',
  education: 'Christian Education, Academia Teacher Dashboard, Google Forms/Docs & PDF → Interactive Tela & Mastery.',
  tela_ops: 'Facilities & Room Floorplan Tela, Multi-Week Matrix & Blockouts, Child Ratios & Paging, Automated Workflows, Camp Logistics & Non-Cash IRS Receipts.',
  grants: 'Find federal grants that fit, then let Aria fill in your applications — and learn the process in Grant School.',
  calendar: 'Centralized Organization Calendar built on Postman — detects cross-department timing conflicts and ranks weighted substitutes.',
  content_hq: 'Organization Asset Management — manage Christian Education assignments, Original Docs, Interactive Tela Documents, Answer Keys, and department uploads.',
};
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#FF8C00]/60 transition-all placeholder:text-white/25';

export type SectionKey =
  | 'overview'
  | 'content_hq'
  | 'identity'
  | 'tela_ops'
  | 'mobilize'
  | 'messages'
  | 'events'
  | 'multisite'
  | 'people'
  | 'ministries'
  | 'education'
  | 'music'
  | 'invites'
  | 'accounts'
  | 'security'
  | 'giving'
  | 'money'
  | 'prayer'
  | 'media'
  | 'social'
  | 'store'
  | 'team'
  | 'marketing'
  | 'calendar'
  | 'my_settings'
  | 'grants';
type Tool = null | 'sermons' | 'sermonprep' | 'master' | 'console' | 'hq' | 'employees' | 'hiring' | 'marketing';

interface Props {
  /** Open a tool straight away (e.g. 'hq' from a Content HQ deep link). */
  initialTool?: Tool;
  /** Open a specific studio section straight away (e.g. 'identity' when clicking Manage). */
  initialSection?: SectionKey;
  org: Organization;
  isOwner: boolean;
  onClose: () => void;
  onOrgChange?: (o: Organization) => void;
  onDeleted?: () => void;
  onVisitUser?: (uid: string) => void;
}

const Fallback = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={22} /></div>;

const ElevateOps: React.FC<Props> = ({ org: initialOrg, isOwner, onClose, onOrgChange, onDeleted, onVisitUser, initialTool, initialSection }) => {
  const [org, setOrgState] = useState<Organization>(() => ({
    ...initialOrg,
    ministries: ensureChurchMusicAndEducationDepartments(initialOrg),
  }));
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [section, setSection] = useState<SectionKey>(initialSection ?? 'overview');
  const [tool, setTool] = useState<Tool>(initialTool ?? null);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const billingNav = useBillingNav();
  const [peopleView, setPeopleView] = useState<'congregation' | 'roster'>('congregation');
  const [donationTotals, setDonationTotals] = useState<Record<string, number>>({});
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

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

  // Unified Manage & Studio navigation order: Overview → Content HQ → Page & Hero Identity → Ministries/Classes/Ops.
  const nav = useMemo(() => ([
    { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard, show: !!myMembership },
    { key: 'content_hq' as const, label: 'Content HQ · Assets', icon: HardDrive, show: !!myMembership || isOwner },
    { key: 'my_settings' as const, label: 'My Settings, Giving & Uploads', icon: UserCog, show: !!myMembership || isOwner },
    { key: 'calendar' as const, label: 'Central Calendar & Sub AI', icon: Calendar, show: !!myMembership || isOwner },
    { key: 'identity' as const, label: 'Page & Hero Identity', icon: Palette, show: isOwner || can('MANAGE_CONTENT') || can('MANAGE_MEDIA') },
    { key: 'tela_ops' as const, label: 'Facilities, Matrix & Tela Ops', icon: Calendar, show: !!myMembership || isOwner },
    { key: 'mobilize' as const, label: 'Action & Shifts', icon: Sparkles, show: !!myMembership || isOwner },
    { key: 'social' as const, label: 'Social & Feeds', icon: MessagesSquare, show: can('MODERATE_THREADS') || can('POST_AS_ORG') || isOwner },
    { key: 'ministries' as const, label: faith ? 'Ministries & Groups' : 'Departments & Groups', icon: Church, show: can('MANAGE_MINISTRIES') || isOwner },
    { key: 'education' as const, label: faith ? 'Christian Ed & Tela' : 'Classes & Tela', icon: GraduationCap, show: !!myMembership || isOwner },
    { key: 'music' as const, label: 'Music Department', icon: Music, show: faith && (!!myMembership || isOwner) },
    { key: 'people' as const, label: 'People & Roster', icon: Users, show: can('MANAGE_ROSTER') || can('ASSIGN_ROLES') || (!!uid && (org.ministries || []).some(m => m.headUids?.includes(uid))) },
    { key: 'giving' as const, label: 'Giving & Funds', icon: Gift, show: can('MANAGE_GIVING') || can('VIEW_GIVING') || can('MANAGE_ACCOUNTING') || can('VIEW_ACCOUNTING') },
    { key: 'grants' as const, label: 'Grants', icon: Landmark, show: can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING') || isOwner },
    { key: 'events' as const, label: 'Events', icon: Calendar, show: can('POST_AS_ORG') || can('MANAGE_CONTENT') || isOwner },
    { key: 'prayer' as const, label: 'Prayer Wall', icon: HandHeart, show: faith && can('VIEW_PRAYER') },
    { key: 'messages' as const, label: 'Messages', icon: Mail, show: can('MANAGE_MEDIA') },
    { key: 'team' as const, label: 'Team & Roles', icon: UserCog, show: can('MANAGE_EMPLOYEES') || can('ASSIGN_ROLES') },
    { key: 'multisite' as const, label: 'Multi-site', icon: MonitorPlay, show: faith && can('MANAGE_MEDIA') },
    { key: 'invites' as const, label: 'Invites', icon: Link2, show: can('MANAGE_INVITES') },
    { key: 'accounts' as const, label: 'Accounts & Access', icon: KeyRound, show: can('MANAGE_ROSTER') },
    { key: 'security' as const, label: 'Security & Privacy', icon: ShieldCheck, show: can('MANAGE_ROSTER') || can('MANAGE_GIVING') || can('MANAGE_ACCOUNTING') || isOwner },
    { key: 'money' as const, label: 'Money', icon: Wallet, show: showMoney, badge: moneyInbox.count },
    { key: 'media' as const, label: 'Media & Sermons', icon: Radio, show: can('MANAGE_SERMONS') || can('MANAGE_MEDIA') || can('MANAGE_CONTENT') },
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
            canEdit={can('MANAGE_CONTENT') || can('MANAGE_MEDIA')}
            canViewAnswerKey={canViewerAccessAnswerKey({ membership: myMembership, org, user: auth.currentUser as any, explicitCanEdit: isOwner })}
            mediaOwnerUid={org.creatorId} onClose={closeTool} />
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
      <div className="p-3 rounded-2xl bg-[#FF8C00]/15"><Icon size={18} className="text-[#FF8C00]" /></div>
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

  return (
    <div className="flex flex-col bg-[#0b0214] text-white" style={{ minHeight: 'calc(100dvh - 48px)' }}>
      {nav.length === 0 ? (
        <div className="m-6 ev-panel p-10 text-center text-sm text-[#A49CB2]">You don't have staff access for this organization yet.</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Unified Elevate Landing Page Sidebar Rail */}
          <nav
            aria-label="Manage & Studio"
            className="shrink-0 flex md:block gap-1 md:gap-0 border-b md:border-b-0 md:border-r p-2 lg:p-4 md:w-16 lg:w-60 overflow-x-auto md:overflow-x-visible md:overflow-y-auto scrollbar-hide bg-[#090312]/90"
            style={{ borderColor: EV.line }}
          >
            <div className="hidden lg:flex items-center gap-2.5 px-2.5 pb-4 mb-3 border-b border-white/[0.08]">
              <div
                className="w-8 h-8 rounded-xl grid place-items-center text-white shrink-0 shadow-md"
                style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
              >
                <Landmark size={15} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black tracking-tight text-white truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Manage &amp; Studio
                </div>
                <div className="text-[10px] text-white/45 truncate">{org.name}</div>
              </div>
            </div>

            {nav.map(n => {
              const activeItem = section === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setSection(n.key)}
                  title={n.label}
                  aria-current={activeItem ? 'page' : undefined}
                  className={`md:w-full shrink-0 whitespace-nowrap flex items-center gap-2 md:gap-3 px-3 md:px-2.5 lg:px-3 py-2.5 rounded-xl text-sm transition-all md:mb-1 ${
                    activeItem
                      ? 'text-white font-bold shadow-md'
                      : 'text-[#A49CB2] hover:text-white hover:bg-white/[0.04]'
                  }`}
                  style={
                    activeItem
                      ? {
                          background:
                            'linear-gradient(135deg, rgba(107,0,153,0.42), rgba(212,0,85,0.28) 60%, rgba(255,140,0,0.18))',
                          border: '1px solid rgba(212,0,85,0.45)',
                        }
                      : undefined
                  }
                >
                  <n.icon size={16} className={activeItem ? 'text-[#FF8C00] shrink-0' : 'shrink-0'} />
                  <span className="md:hidden lg:inline truncate">{n.label}</span>
                  <CountBadge n={n.badge || 0} />
                </button>
              );
            })}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide p-4 sm:p-6 lg:p-10">
            {current && section !== 'overview' && section !== 'mobilize' && section !== 'messages' && section !== 'multisite' && (
              <div className="mb-6">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FF8C00] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Plajah Elevate · {org.name} Studio
                </div>
                <h2 className="m-0 ev-display text-white" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.5rem)', lineHeight: 1.05, fontFamily: 'Outfit, sans-serif' }}>
                  {current.label}
                </h2>
                {SECTION_SUB[section] && <p className="text-[15px] text-[#A49CB2] mt-2 mb-0">{SECTION_SUB[section]}</p>}
              </div>
            )}
            <Suspense fallback={<Fallback />}>
              {section === 'overview' && (
                <div className="ev-fade space-y-8 max-w-[1100px]">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.25em] text-[#FF8C00] pb-1.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        {roleLine} · {org.name}
                      </div>
                      <h2 className="m-0 ev-display text-white" style={{ fontSize: 'clamp(2.25rem, 4vw, 3rem)', lineHeight: 1, fontFamily: 'Outfit, sans-serif' }}>
                        {faith ? 'Sanctuary & Operations Studio' : 'Organization Studio'}
                      </h2>
                    </div>
                    {(isOwner || can('MANAGE_CONTENT')) && (
                      <button
                        type="button"
                        onClick={() => setSection('identity')}
                        className="px-4 py-2.5 rounded-full text-xs font-black text-white inline-flex items-center gap-2 shadow-lg"
                        style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', fontFamily: 'Outfit, sans-serif' }}
                      >
                        <Palette size={14} /> Edit Cover, Logo &amp; Page Identity
                      </button>
                    )}
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
                        <h3 className="m-0 ev-title text-[22px] text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Setup Progress</h3>
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
                      <h3 className="m-0 mb-4 ev-title text-[22px] text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Quick Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {quick('Content HQ · Assets', HardDrive, 'content_hq')}
                        {quick('Page & Hero Identity', Palette, 'identity')}
                        {quick('Facilities, Matrix & Tela Ops', Calendar, 'tela_ops')}
                        {quick('Social & Feeds', MessagesSquare, 'social')}
                        {quick('Christian Ed & Tela', GraduationCap, 'education')}
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

              {section === 'content_hq' && (
                <div className="ev-fade h-[calc(100dvh-200px)] min-h-[640px] rounded-3xl border border-white/10 bg-[#0a0a0f] overflow-hidden shadow-2xl">
                  <ContentHQ
                    scope={{
                      kind: 'org',
                      id: org.id,
                      ownerUid: org.creatorId,
                      adminUids: org.admins,
                      label: org.name,
                    }}
                    canEdit={isOwner || can('MANAGE_CONTENT') || can('MANAGE_MEDIA') || !!myMembership}
                    canViewAnswerKey={canViewerAccessAnswerKey({ membership: myMembership, org, user: auth.currentUser as any, explicitCanEdit: isOwner })}
                    mediaOwnerUid={org.creatorId}
                  />
                </div>
              )}

              {section === 'identity' && (
                <PageIdentityStudio
                  org={org}
                  isOwner={isOwner}
                  onSaved={setOrg}
                  onDeleted={onDeleted || onClose}
                />
              )}

              {section === 'tela_ops' && (
                <ElevateTelaOperationsSuite
                  org={org}
                  currentUserId={uid || ''}
                  canManage={can('MANAGE_MINISTRIES') || can('MANAGE_ROSTER') || can('MANAGE_CONTENT') || isOwner}
                />
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
                        <button key={k} onClick={() => setPeopleView(k)} className={`px-4 py-2 rounded-full text-[10px] font-semibold ${peopleView === k ? 'bg-[#FF8C00] text-black' : 'bg-white/5 text-white/50 hover:text-white'}`}>{l}</button>
                      ))}
                    </div>
                    {peopleView === 'congregation'
                      ? <PeopleHub org={org} myMembership={myMembership} onClose={() => setSection('overview')} />
                      : <RosterManager org={org} myMembership={myMembership} onClose={() => setSection('overview')} onChanged={() => { reload(); }} />}
                  </div>
                </OrgSecurityShield>
              )}
              {section === 'ministries' && <MinistryManager org={org} myMembership={myMembership} onClose={() => setSection('overview')} onChanged={() => { fetchOrganization(org.id).then(o => { if (o) setOrg(o); }).catch(() => {}); reload(); }} />}
              {section === 'education' && <ChurchEducation church={org} canEdit={can('MANAGE_MINISTRIES') || can('MANAGE_CONTENT') || isOwner} membership={myMembership} />}
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
                      <button onClick={() => setFinanceOpen(true)} className="w-full text-left px-5 py-4 rounded-[2rem] bg-[#FF8C00]/10 border border-[#FF8C00]/30 hover:bg-[#FF8C00]/20 transition-all">
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
              {section === 'calendar' && <OrgCentralCalendarHub org={org} myMembership={myMembership} />}
              {section === 'my_settings' && (
                <VolunteerMemberManageHub
                  org={org}
                  membership={myMembership}
                  user={auth.currentUser}
                  onMembershipUpdated={reload}
                />
              )}
              {section === 'grants' && <GrantHub org={org} />}
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page & Hero Identity Studio (Unified Manage Experience Matching PlajahElevate.tsx) ──
const PageIdentityStudio: React.FC<{
  org: Organization;
  isOwner: boolean;
  onSaved: (o: Organization) => void;
  onDeleted: () => void;
}> = ({ org, isOwner, onSaved, onDeleted }) => {
  const [name, setName] = useState(org.name || '');
  const [tagline, setTagline] = useState(org.tagline || '');
  const [about, setAbout] = useState(org.about || '');
  const [denomination, setDenomination] = useState(org.denomination || org.category || '');
  const [website, setWebsite] = useState(org.socialLinks?.website || '');
  const [city, setCity] = useState(org.location?.city || '');
  const [address, setAddress] = useState(org.location?.address || '');
  const [isPrivate, setIsPrivate] = useState(!!org.isPrivate);
  const [monthly, setMonthly] = useState(org.monthlyPrice ? String(org.monthlyPrice) : '');

  const [services, setServices] = useState<ServiceTime[]>(org.serviceTimes || []);
  const [newSvc, setNewSvc] = useState({ label: '', day: 'Sunday', time: '10:00 AM' });

  const [campuses, setCampuses] = useState<ChurchCampus[]>(org.campuses || []);
  const [newCampus, setNewCampus] = useState({ name: '', location: '' });

  const [busy, setBusy] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSacredPlateTemplates, setShowSacredPlateTemplates] = useState(false);
  const [plateLensFilter, setPlateLensFilter] = useState<'ALL' | ArtCouncilLens>('ALL');
  const [activePlateId, setActivePlateId] = useState<string>(() => getActiveLectioCouncilPlateId());

  const saveAllIdentity = async () => {
    setBusy(true);
    setSavedToast(false);
    try {
      const patch: Partial<Organization> = {
        name: name.trim() || org.name,
        tagline: tagline.trim(),
        about: about.trim(),
        denomination: denomination.trim() || undefined,
        category: denomination.trim() || undefined,
        isPrivate,
        monthlyPrice: monthly ? Number(monthly) : undefined,
        socialLinks: { ...(org.socialLinks || {}), website: website.trim() || undefined },
        location: {
          ...(org.location || {}),
          city: city.trim() || undefined,
          address: address.trim() || undefined,
        },
        serviceTimes: services,
        campuses,
      };
      await updateOrganization(org.id, patch);
      onSaved({ ...org, ...patch } as Organization);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e: any) {
      alert(e?.message || 'Could not save organization details.');
    }
    setBusy(false);
  };

  return (
    <div className="ev-fade space-y-6 max-w-[1100px]">
      {/* 1. Live WYSIWYG Hero Cover & Logo Studio */}
      <IdentityEditor org={org} onSaved={onSaved} />

      {/* 2. Two-Column Bento Cards for Identity, Gatherings & Multi-Site Campuses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Card A: Identity, Welcome Copy & Location (7 cols) */}
        <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#FF8C00]">
                Editorial Copy &amp; Directory Profile
              </span>
              <h3 className="text-lg font-black text-white mt-0.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Organization Identity &amp; Welcome Story
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate(p => !p)}
              className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition ${
                isPrivate
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                  : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
              }`}
            >
              {isPrivate ? 'Members-Only Page' : 'Public in Directory'}
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
                Organization Name
              </label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Organization name" className={field} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
                Tradition / Denomination / Category
              </label>
              <input value={denomination} onChange={e => setDenomination(e.target.value)} placeholder="e.g. Non-Denominational · Cultural" className={field} />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
              Hero Display Tagline
            </label>
            <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="A house of prayer, table fellowship & sacred music..." className={field} />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
              About &amp; Welcome Introduction
            </label>
            <textarea value={about} onChange={e => setAbout(e.target.value)} rows={3} placeholder="Tell visitors and members what your organization is about..." className={`${field} resize-none`} />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
                City / Region
              </label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Atlanta, GA" className={field} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
                Street Address
              </label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="742 Sanctuary Way" className={field} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">
                Website URL
              </label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" className={field} />
            </div>
          </div>
        </div>

        {/* Card B: Service Times & Multi-Site Campuses (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Gatherings / Service Times */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#D0BCFF]">
              <Clock size={14} /> Gatherings &amp; Service Times
            </div>
            <div className="space-y-2">
              {services.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-xs">
                  <div>
                    <span className="font-bold text-white">{s.label}</span>
                    <span className="text-white/50 ml-1.5">· {s.day} {s.time}</span>
                  </div>
                  <button onClick={() => setServices(ss => ss.filter(x => x.id !== s.id))} className="text-white/30 hover:text-rose-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input value={newSvc.label} onChange={e => setNewSvc(v => ({ ...v, label: e.target.value }))} placeholder="Service label" className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
              <input value={newSvc.day} onChange={e => setNewSvc(v => ({ ...v, day: e.target.value }))} placeholder="Sunday" className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
              <div className="flex gap-1.5">
                <input value={newSvc.time} onChange={e => setNewSvc(v => ({ ...v, time: e.target.value }))} placeholder="10:00 AM" className="w-full bg-black/40 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white" />
                <button
                  type="button"
                  onClick={() => {
                    if (newSvc.label.trim()) {
                      setServices(ss => [...ss, { id: Math.random().toString(36).slice(2, 9), label: newSvc.label.trim(), day: newSvc.day.trim(), time: newSvc.time.trim() }]);
                      setNewSvc({ label: '', day: 'Sunday', time: '10:00 AM' });
                    }
                  }}
                  className="px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black shrink-0"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Multi-Site Campuses */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#06D6A0]">
              <MapPin size={14} /> Campuses &amp; Locations
            </div>
            <div className="space-y-2">
              {campuses.map(c => (
                <div key={c.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-xs">
                  <div>
                    <span className="font-bold text-white">{c.name}</span>
                    {c.location && <span className="text-white/50 ml-1.5">· {c.location}</span>}
                  </div>
                  <button onClick={() => setCampuses(cs => cs.filter(x => x.id !== c.id))} className="text-white/30 hover:text-rose-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newCampus.name} onChange={e => setNewCampus(v => ({ ...v, name: e.target.value }))} placeholder="Campus name" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
              <input value={newCampus.location} onChange={e => setNewCampus(v => ({ ...v, location: e.target.value }))} placeholder="City / Address" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
              <button
                type="button"
                onClick={() => {
                  if (newCampus.name.trim()) {
                    setCampuses(cs => [...cs, { id: Math.random().toString(36).slice(2, 9), name: newCampus.name.trim(), location: newCampus.location.trim() || undefined, isPrimary: cs.length === 0 }]);
                    setNewCampus({ name: '', location: '' });
                  }
                }}
                className="px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black shrink-0"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/12 bg-white/[0.03] p-4">
        <div className="text-xs text-white/60">
          {savedToast ? (
            <span className="text-emerald-300 font-bold inline-flex items-center gap-1.5">
              <Check size={14} /> Saved! Your public hero banner, directory card, and gathering times are live.
            </span>
          ) : (
            'Changes to your identity, service times, and campuses update your public page immediately.'
          )}
        </div>
        <button
          type="button"
          onClick={saveAllIdentity}
          disabled={busy}
          className="px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest text-white shadow-lg inline-flex items-center gap-2 disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)',
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {busy ? 'Saving Identity...' : 'Save Page & Hero Identity'}
        </button>
      </div>

      {/* Sacred Text Plate Templates (Chosen in Manage & in Verse Bible Experience) */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#E2C27E]">
              Verse &amp; Lorea · Sacred Text Plate Templates
            </span>
            <h3 className="text-lg font-black text-white mt-0.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Sacred Text Plate Template Library
            </h3>
            <p className="text-xs text-white/60 mt-0.5">
              Choose the active sacred text plate template used for prayers, creeds, and liturgical readings in Manage and in the Verse experience.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSacredPlateTemplates(prev => !prev)}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-black text-[#E2C27E]"
          >
            {showSacredPlateTemplates ? 'Hide Template Picker' : 'Choose Sacred Text Plate Template'}
          </button>
        </div>

        {showSacredPlateTemplates && (
          <div className="space-y-4 pt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  ['ALL', 'All 12 Templates'],
                  ['CLASSICAL', 'Classical'],
                  ['RADICAL_MINIMAL', 'Radical Minimal'],
                  ['REBEL', 'Rebel'],
                  ['WORLD_ECLECTIC', 'World Eclectic'],
                  ['FUTURIST', 'Futurist'],
                  ['BAROQUE', 'Baroque'],
                ] as const
              ).map(([id, lbl]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlateLensFilter(id)}
                  className={`px-3 py-1 rounded-full text-[10.5px] font-bold transition-all ${
                    plateLensFilter === id
                      ? 'bg-[#E2C27E] text-black'
                      : 'bg-white/5 text-white/70 border border-white/10 hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {LECTIO_COUNCIL_PLATES.filter(
                p => plateLensFilter === 'ALL' || p.lens === plateLensFilter
              ).map(plate => (
                <CouncilPlatePreviewCard
                  key={plate.id}
                  plate={plate}
                  isSelected={activePlateId === plate.id}
                  onSelect={pl => {
                    setActiveLectioCouncilPlateId(pl.id);
                    setActivePlateId(pl.id);
                  }}
                  onOpenLorea={openCouncilPlateInLorea}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      {isOwner && !org.isDemo && (
        <div className="rounded-3xl border border-rose-500/25 bg-rose-500/[0.04] p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest text-rose-300 flex items-center gap-1.5">
              <Trash2 size={13} /> Danger Zone
            </h4>
            <p className="text-xs text-white/55 mt-1">
              Permanently delete {org.name}, its members, roles, invites, and community feeds. Financial audit records remain sealed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2.5 rounded-full border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 text-[11px] font-black uppercase tracking-widest"
          >
            Delete Organization
          </button>
        </div>
      )}

      {confirmDelete && (
        <DeleteOrgDialog
          org={org}
          onClose={() => setConfirmDelete(false)}
          onDeleted={() => {
            setConfirmDelete(false);
            onDeleted();
          }}
        />
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
          <h3 className="text-[10px] font-semibold text-[#FF8C00] mb-3">Funds</h3>
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
          <h3 className="text-[10px] font-semibold text-[#FF8C00] mb-3">Payouts</h3>
          <div className="flex items-center gap-2 mb-3">
            <p className="flex-1 text-[11px] text-white/50">{org.stripeAccountId ? 'Stripe is connected. Payout details are managed in Stripe.' : 'Connect Stripe to accept card and bank gifts. Stripe verifies the account; nobody types an account number here.'}</p>
            <button type="button" onClick={async () => { const t = await auth.currentUser?.getIdToken(); if (t) connectStripe({ orgId: org.id, userIdToken: t }).catch(e => alert(e?.message || 'Could not start Stripe onboarding')); }}
              className="px-4 py-3 rounded-2xl bg-[#635bff] text-white text-[10px] font-semibold hover:brightness-110 shrink-0 whitespace-nowrap">Connect Stripe</button>
          </div>
          {org.stripeAccountId && <p className="text-[9px] font-semibold text-green-400 mb-3 flex items-center gap-1.5"><Check size={11} /> Payouts connected</p>}
          <input value={givingUrl} onChange={e => setGivingUrl(e.target.value)} placeholder="External giving link (optional — overrides native Stripe giving)" className={`${field} mb-5`} />
          <button onClick={save} disabled={busy} className="w-full py-4 rounded-full font-black text-xs uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>
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
