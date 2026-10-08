// PeopleHub — Elevate ChMS people / attendance / care / communications hub (Servant Keeper parity + beyond).
// Mounted in ElevateOps' "People & Roster" section. Every tab is gated by elevateCan via peopleAccess():
//   staff (MANAGE_ROSTER)  → everything; leaders → their ministries' people + attendance + groups;
//   finance               → directory/households/reports only, never notes, minors redacted.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Users, Home, CalendarCheck, MonitorSmartphone, Church, HandHeart, HeartHandshake, Mail, BarChart3, Upload } from 'lucide-react';
import type { Organization, OrgMembership, ChmsPerson, ChmsHousehold, ChmsAttendance } from '../../../types';
import { fetchOrgMembers } from '../../../services/organizationService';
import {
  peopleAccess, fetchPeople, fetchHouseholds, fetchAttendance, fetchTasks, fetchShifts, getGivingFlags, redactPerson,
} from '../../../services/chmsPeople';
import type { ChmsTask, ChmsShift } from '../../../services/chmsPeople';
import { elevateCan } from '../../../services/elevateRoles';
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

type Tab = 'directory' | 'households' | 'attendance' | 'kiosk' | 'groups' | 'volunteers' | 'care' | 'comms' | 'reports' | 'import';
interface Props { org: Organization; myMembership: OrgMembership | null; onClose: () => void }

const Fallback = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={22} /></div>;

const PeopleHub: React.FC<Props> = ({ org, myMembership, onClose }) => {
  const access = useMemo(() => peopleAccess(org, myMembership), [org, myMembership]);
  const [tab, setTab] = useState<Tab>('directory');
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

  const reload = useCallback(async () => {
    const [p, h, a, t, s, m, g] = await Promise.all([
      fetchPeople(org.id).catch(() => [] as ChmsPerson[]),
      fetchHouseholds(org.id).catch(() => [] as ChmsHousehold[]),
      access.staff || access.ministryScope ? fetchAttendance(org.id).catch(() => [] as ChmsAttendance[]) : Promise.resolve([] as ChmsAttendance[]),
      access.staff ? fetchTasks(org.id).catch(() => [] as ChmsTask[]) : Promise.resolve([] as ChmsTask[]),
      access.staff ? fetchShifts(org.id).catch(() => [] as ChmsShift[]) : Promise.resolve([] as ChmsShift[]),
      access.staff ? fetchOrgMembers(org.id).catch(() => [] as OrgMembership[]) : Promise.resolve([] as OrgMembership[]),
      finance ? getGivingFlags(org.id) : Promise.resolve(null),
    ]);
    setRaw(p); setHouseholds(h); setAttendance(a); setTasks(t); setShifts(s); setMembers(m); setGave(g ? g.people : null);
  }, [org.id, access.staff, access.ministryScope, finance]);

  useEffect(() => { setLoading(true); reload().finally(() => setLoading(false)); }, [reload]);

  // Visibility: leaders see only their ministries' people; non-roster viewers get minors redacted.
  const people = useMemo(() => {
    const scoped = access.ministryScope ? raw.filter(p => p.ministryIds?.some(m => access.ministryScope!.includes(m))) : raw;
    return scoped.map(p => redactPerson(p, access));
  }, [raw, access]);

  const tabs = useMemo(() => ([
    { key: 'directory' as const, label: 'Directory', icon: Users, show: access.canSeeAnything },
    { key: 'households' as const, label: 'Households', icon: Home, show: access.staff || access.financeOnly },
    { key: 'attendance' as const, label: 'Attendance', icon: CalendarCheck, show: access.staff || !!access.ministryScope },
    { key: 'kiosk' as const, label: 'Check-in Kiosk', icon: MonitorSmartphone, show: access.staff },
    { key: 'groups' as const, label: 'Groups', icon: Church, show: access.staff || !!access.ministryScope },
    { key: 'volunteers' as const, label: 'Volunteers', icon: HandHeart, show: access.staff },
    { key: 'care' as const, label: 'Care', icon: HeartHandshake, show: access.staff || access.pastoral },
    { key: 'comms' as const, label: 'Communications', icon: Mail, show: access.staff },
    { key: 'reports' as const, label: 'Reports', icon: BarChart3, show: access.staff || access.financeOnly },
    { key: 'import' as const, label: 'Import', icon: Upload, show: access.staff },
  ]).filter(t => t.show), [access]);
  useEffect(() => { if (tabs.length && !tabs.some(t => t.key === tab)) setTab(tabs[0].key); }, [tabs, tab]);

  const ctx: PeopleCtxValue = {
    org, myMembership, access, people, households, attendance, tasks, shifts, gaveFlags: gave, members, reload,
    patchAttendance: fn => setAttendance(fn),
    openPerson: id => { setFocus({ id, n: Date.now() }); setTab('directory'); },
  };

  if (!access.canSeeAnything) return <div className={`${card} p-10 text-center text-sm text-white/50`}>You don't have access to the congregation directory.</div>;

  return (
    <PeopleCtx.Provider value={ctx}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${tab === t.key ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
        {loading ? <Fallback /> : (
          <Suspense fallback={<Fallback />}>
            {tab === 'directory' && <PeopleDirectory key={focus?.n || 0} initialPersonId={focus?.id} />}
            {tab === 'households' && <PeopleHouseholds />}
            {tab === 'attendance' && <Attendance />}
            {tab === 'kiosk' && <AttendanceKiosk />}
            {tab === 'groups' && <PeopleGroups />}
            {tab === 'volunteers' && <PeopleVolunteers />}
            {tab === 'care' && <CareHub />}
            {tab === 'comms' && <CommsHub />}
            {tab === 'reports' && <PeopleReports />}
            {tab === 'import' && access.staff && <ImportWizard {...({ org, myMembership, onClose: () => { setTab('directory'); reload(); }, onDone: reload } as any)} />}
          </Suspense>
        )}
        <button onClick={onClose} className="sr-only">Close</button>
      </div>
    </PeopleCtx.Provider>
  );
};

export default PeopleHub;
