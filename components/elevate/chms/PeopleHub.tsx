// PeopleHub — "People" in Elevate Manage: the ONE place for everyone in the org.
//   Everyone (directory + full profile) · Roles & Access (roster role matrix) · Requests (join requests +
//   onboarding vault) · Add & Onboard (join link/QR, claimable accounts, role invite links, CSV import,
//   payroll import) · Staff & Volunteers — plus Households, Attendance, Check-in, Groups, Care, Workflows,
//   Messages and Reports under "More".
// Every tab is gated by elevateCan via peopleAccess():
//   staff (MANAGE_ROSTER)  → everything; leaders → their ministries' people + attendance + groups;
//   finance               → directory/households/reports only, never notes, minors redacted.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Users, Home, CalendarCheck, MonitorSmartphone, Church, HandHeart, HeartHandshake, Mail, BarChart3, Upload, Sparkles,
  KeyRound, Inbox, UserPlus, Briefcase, QrCode, Link2, UserCog, Mic2,
} from 'lucide-react';
import type { Organization, OrgMembership, ChmsPerson, ChmsHousehold, ChmsAttendance } from '../../../types';
import { fetchOrgMembers } from '../../../services/organizationService';
import {
  peopleAccess, fetchPeople, fetchHouseholds, fetchAttendance, fetchTasks, fetchShifts, getGivingFlags, redactPerson,
} from '../../../services/chmsPeople';
import type { ChmsTask, ChmsShift } from '../../../services/chmsPeople';
import { elevateCan } from '../../../services/elevateRoles';
import { canProvision } from '../../../services/elevateAccounts';
import { PeopleCtx, card } from './PeopleUI';
import type { PeopleCtxValue } from './PeopleUI';

const PeopleDirectory = lazy(() => import('./PeopleDirectory'));
const PeopleHouseholds = lazy(() => import('./PeopleHouseholds'));
const Attendance = lazy(() => import('./Attendance'));
const AttendanceKiosk = lazy(() => import('./AttendanceKiosk'));
const PeopleGroups = lazy(() => import('./PeopleGroups'));
const PeopleVolunteers = lazy(() => import('./PeopleVolunteers'));
const CareHub = lazy(() => import('./CareHub'));
const CommsHub = lazy(() => import('./CommsHub'));
const PeopleReports = lazy(() => import('./PeopleReports'));
const ImportWizard = lazy(() => import('./ImportWizard'));
const ElevateTelaOperationsSuite = lazy(() => import('../ElevateTelaOperationsSuite'));
const RosterManager = lazy(() => import('../RosterManager'));
const AccountsPanel = lazy(() => import('../AccountsPanel'));
const InvitesPanel = lazy(() => import('../InvitesPanel'));

export type PeopleTab =
  | 'directory' | 'roles' | 'requests' | 'onboarding' | 'staff'
  | 'households' | 'attendance' | 'kiosk' | 'groups' | 'care' | 'tela_workflows' | 'comms' | 'reports';
type OnboardView = 'join' | 'invites' | 'import' | 'payroll';

interface Props {
  org: Organization;
  myMembership: OrgMembership | null;
  onClose: () => void;
  initialTab?: PeopleTab;
  /** Full-screen staff tools that live in ElevateOps (Employees, Open roles / Hiring). */
  onOpenTool?: (t: 'employees' | 'hiring') => void;
  /** Roster changed (roles, approvals) — lets the host refresh its own member counts. */
  onMembersChanged?: () => void;
  onOrgChange?: (o: Organization) => void;
}

const Fallback = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={22} /></div>;

const PeopleHub: React.FC<Props> = ({ org, myMembership, onClose, initialTab, onOpenTool, onMembersChanged, onOrgChange }) => {
  const access = useMemo(() => peopleAccess(org, myMembership), [org, myMembership]);
  const canRoster = elevateCan(myMembership, org, 'MANAGE_ROSTER') || elevateCan(myMembership, org, 'ASSIGN_ROLES');
  const canInvite = elevateCan(myMembership, org, 'MANAGE_INVITES');
  const canAccounts = canProvision(org, myMembership);
  const canStaff = elevateCan(myMembership, org, 'MANAGE_EMPLOYEES');
  const [tab, setTab] = useState<PeopleTab>(initialTab || 'directory');
  const [onboard, setOnboard] = useState<OnboardView>('join');
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState<ChmsPerson[]>([]);
  const [households, setHouseholds] = useState<ChmsHousehold[]>([]);
  const [attendance, setAttendance] = useState<ChmsAttendance[]>([]);
  const [tasks, setTasks] = useState<ChmsTask[]>([]);
  const [shifts, setShifts] = useState<ChmsShift[]>([]);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [gave, setGave] = useState<Set<string> | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const finance = elevateCan(myMembership, org, 'MANAGE_GIVING') || elevateCan(myMembership, org, 'VIEW_GIVING');
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  // Phones: keep the active tab visible in the scrolling tab row.
  const tabRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabRow.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab, loading]);

  const reload = useCallback(async () => {
    const [p, h, a, t, s, m, g] = await Promise.all([
      access.canSeeAnything ? fetchPeople(org.id).catch(() => [] as ChmsPerson[]) : Promise.resolve([] as ChmsPerson[]),
      access.canSeeAnything ? fetchHouseholds(org.id).catch(() => [] as ChmsHousehold[]) : Promise.resolve([] as ChmsHousehold[]),
      access.staff || access.ministryScope ? fetchAttendance(org.id).catch(() => [] as ChmsAttendance[]) : Promise.resolve([] as ChmsAttendance[]),
      access.staff ? fetchTasks(org.id).catch(() => [] as ChmsTask[]) : Promise.resolve([] as ChmsTask[]),
      access.staff ? fetchShifts(org.id).catch(() => [] as ChmsShift[]) : Promise.resolve([] as ChmsShift[]),
      access.staff || canRoster ? fetchOrgMembers(org.id).catch(() => [] as OrgMembership[]) : Promise.resolve([] as OrgMembership[]),
      finance ? getGivingFlags(org.id) : Promise.resolve(null),
    ]);
    setRaw(p); setHouseholds(h); setAttendance(a); setTasks(t); setShifts(s); setMembers(m); setGave(g ? g.people : null);
  }, [org.id, access.staff, access.ministryScope, access.canSeeAnything, canRoster, finance]);

  useEffect(() => { setLoading(true); reload().finally(() => setLoading(false)); }, [reload]);

  // Visibility: leaders see only their ministries' people; non-roster viewers get minors redacted.
  const people = useMemo(() => {
    const scoped = access.ministryScope ? raw.filter(p => p.ministryIds?.some(m => access.ministryScope!.includes(m))) : raw;
    return scoped.map(p => redactPerson(p, access));
  }, [raw, access]);
  const pendingCount = members.filter(m => m.status === 'PENDING').length;

  const primary = useMemo(() => ([
    { key: 'directory' as const, label: 'Everyone', icon: Users, show: access.canSeeAnything },
    { key: 'roles' as const, label: 'Roles & Access', icon: KeyRound, show: canRoster },
    { key: 'requests' as const, label: 'Requests', icon: Inbox, show: canRoster, badge: pendingCount },
    { key: 'onboarding' as const, label: 'Add & Onboard', icon: UserPlus, show: canAccounts || canInvite || access.staff },
    { key: 'staff' as const, label: 'Staff & Volunteers', icon: Briefcase, show: (canStaff && !!onOpenTool) || access.staff },
  ] as { key: PeopleTab; label: string; icon: any; show: boolean; badge?: number }[]).filter(t => t.show),
  [access, canRoster, canAccounts, canInvite, canStaff, onOpenTool, pendingCount]);
  const more = useMemo(() => ([
    { key: 'households' as const, label: 'Households', icon: Home, show: access.staff || access.financeOnly },
    { key: 'attendance' as const, label: 'Attendance', icon: CalendarCheck, show: access.staff || !!access.ministryScope },
    { key: 'kiosk' as const, label: 'Check-in', icon: MonitorSmartphone, show: access.staff },
    { key: 'groups' as const, label: 'Groups', icon: Church, show: access.staff || !!access.ministryScope },
    { key: 'care' as const, label: 'Care', icon: HeartHandshake, show: access.staff || access.pastoral },
    { key: 'tela_workflows' as const, label: 'Workflows & Safety', icon: Sparkles, show: access.staff || access.pastoral },
    { key: 'comms' as const, label: 'Messages', icon: Mail, show: access.staff },
    { key: 'reports' as const, label: 'Reports', icon: BarChart3, show: access.staff || access.financeOnly },
  ] as { key: PeopleTab; label: string; icon: any; show: boolean }[]).filter(t => t.show), [access]);
  const tabKeys = [...primary, ...more].map(t => t.key).join();
  useEffect(() => {
    const keys = tabKeys.split(',').filter(Boolean) as PeopleTab[];
    if (keys.length && !keys.includes(tab)) setTab(keys[0]);
  }, [tabKeys, tab]);

  const ctx: PeopleCtxValue = {
    org, myMembership, access, people, households, attendance, tasks, shifts, gaveFlags: gave, members, reload,
    patchAttendance: fn => setAttendance(fn),
    openPerson: id => { setFocus({ id, n: Date.now() }); setTab('directory'); },
  };
  const rosterChanged = () => { reload(); onMembersChanged?.(); };
  /** Roster row → that person's directory record (claimed or pre-provisioned). */
  const openMemberProfile = (m: OrgMembership) => {
    const p = raw.find(x => (m.userId && (x.linkedUid === m.userId || x.provisionedUid === m.userId)) || x.id === m.provisionedPersonId);
    if (!p) {
      alert(`${m.displayName} doesn't have a directory record yet. Add them from Everyone → Add person and link their Plajah account there.`);
      return false;
    }
    ctx.openPerson(p.id);
    return true;
  };

  if (!access.canSeeAnything && !canRoster) return <div className={`${card} p-10 text-center text-sm text-white/50`}>You don't have access to the people directory.</div>;

  const onboardViews = ([
    { key: 'join' as const, label: 'Join link & accounts', icon: QrCode, show: canAccounts },
    { key: 'invites' as const, label: 'Role invite links', icon: Link2, show: canInvite },
    { key: 'import' as const, label: 'Import people', icon: Upload, show: access.staff },
    { key: 'payroll' as const, label: 'Import staff from payroll', icon: Briefcase, show: canAccounts },
  ]).filter(v => v.show);
  const ob = onboardViews.some(v => v.key === onboard) ? onboard : onboardViews[0]?.key;

  return (
    <PeopleCtx.Provider value={ctx}>
      <div className="space-y-4">
        <div className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible scrollbar-hide -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }} ref={tabRow} role="tablist" aria-label="People">
          {primary.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${tab === t.key ? 'bg-white text-black' : 'bg-white/5 text-white/55 hover:text-white hover:bg-white/10'}`}>
              <t.icon size={13} /> {t.label}
              {!!t.badge && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D40055] text-white text-[10px] grid place-items-center">{t.badge}</span>}
            </button>
          ))}
        </div>
        {more.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto md:flex-wrap md:overflow-visible scrollbar-hide -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 pr-1 shrink-0">More</span>
            {more.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition-all border ${tab === t.key ? 'bg-[#FF8C00]/20 text-[#FFB866] border-[#FF8C00]/40' : 'text-white/45 hover:text-white border-transparent'}`}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        )}
        {loading ? <Fallback /> : (
          <Suspense fallback={<Fallback />}>
            {tab === 'directory' && <PeopleDirectory key={focus?.n || 0} initialPersonId={focus?.id} />}
            {tab === 'roles' && canRoster && (
              <RosterManager org={org} myMembership={myMembership} only="roles" onChanged={rosterChanged}
                onOpenPerson={access.canSeeAnything ? openMemberProfile : undefined} />
            )}
            {tab === 'requests' && canRoster && <RosterManager org={org} myMembership={myMembership} only="requests" onChanged={rosterChanged} />}
            {tab === 'onboarding' && (
              <div className="space-y-4">
                <p className="text-xs text-white/45">Bring people in: one join link for everyone, accounts they can claim, role-specific invites, or a list import.</p>
                {onboardViews.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible scrollbar-hide -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                    {onboardViews.map(v => (
                      <button key={v.key} onClick={() => setOnboard(v.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 border ${ob === v.key ? 'bg-[#FF8C00] text-black border-[#FF8C00]' : 'bg-white/5 text-white/55 border-white/10 hover:text-white'}`}>
                        <v.icon size={12} /> {v.label}
                      </button>
                    ))}
                  </div>
                )}
                {ob === 'join' && <AccountsPanel org={org} myMembership={myMembership} onOrgChange={onOrgChange} view="access" />}
                {ob === 'payroll' && <AccountsPanel org={org} myMembership={myMembership} onOrgChange={onOrgChange} view="payroll" />}
                {ob === 'invites' && <InvitesPanel org={org} myMembership={myMembership} />}
                {ob === 'import' && access.staff && <ImportWizard {...({ org, myMembership, onClose: () => { setTab('directory'); reload(); }, onDone: reload } as any)} />}
              </div>
            )}
            {tab === 'staff' && (
              <div className="space-y-5">
                {canStaff && onOpenTool && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <button onClick={() => onOpenTool('employees')} className={`${card} p-5 text-left hover:bg-white/[0.06] transition-all flex items-center gap-4`}>
                      <div className="p-3 rounded-2xl bg-[#FF8C00]/15"><UserCog size={18} className="text-[#FF8C00]" /></div>
                      <div className="min-w-0"><p className="text-sm font-black text-white">Employees</p><p className="text-[11px] text-white/40 mt-0.5">Staff records, schedules, pay details</p></div>
                    </button>
                    <button onClick={() => onOpenTool('hiring')} className={`${card} p-5 text-left hover:bg-white/[0.06] transition-all flex items-center gap-4`}>
                      <div className="p-3 rounded-2xl bg-[#FF8C00]/15"><Mic2 size={18} className="text-[#FF8C00]" /></div>
                      <div className="min-w-0"><p className="text-sm font-black text-white">Open roles &amp; sign-ups</p><p className="text-[11px] text-white/40 mt-0.5">Volunteer and job openings, applicants</p></div>
                    </button>
                  </div>
                )}
                {access.staff && (
                  <>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><HandHeart size={12} /> Volunteer teams &amp; scheduling</p>
                    <PeopleVolunteers />
                  </>
                )}
              </div>
            )}
            {tab === 'households' && <PeopleHouseholds />}
            {tab === 'attendance' && <Attendance />}
            {tab === 'kiosk' && <AttendanceKiosk />}
            {tab === 'groups' && <PeopleGroups />}
            {tab === 'care' && <CareHub />}
            {tab === 'tela_workflows' && <ElevateTelaOperationsSuite org={org} canManage={access.staff} initialTab="WORKFLOWS_FORMS" />}
            {tab === 'comms' && <CommsHub />}
            {tab === 'reports' && <PeopleReports />}
          </Suspense>
        )}
        <button onClick={onClose} className="sr-only">Close</button>
      </div>
    </PeopleCtx.Provider>
  );
};

export default PeopleHub;
