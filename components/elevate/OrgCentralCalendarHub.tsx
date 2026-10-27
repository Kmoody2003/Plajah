/**
 * OrgCentralCalendarHub — Centralized Organization Calendar & Intelligent Conflict / Sub Engine UI.
 *
 * Built on the Post Man Calendar time & recurrence engine (`services/postman/calendarTime.ts`)
 * and `services/orgCentralCalendarService.ts`:
 *  - Unified Point of Truth across all org departments, Christian Education classes,
 *    ChMS volunteer shifts, Mobilize shift drives, room bookings, and worship services.
 *  - Real-time Org-Wide Conflict Detection when the same person is in two overlapping events
 *    at the same time, has a blockout date, or two events clash on the same room.
 *  - Weighted Substitute Suggestion Engine combining Availability (35 pts), Department &
 *    Multi-Role fit (`INSTRUCTOR`, `DEPARTMENT_HEAD`, `DEPARTMENT_ADMIN`, `DEPARTMENT_VOLUNTEER` — 30 pts),
 *    Experience/Skills/Attendance (25 pts), and Youth Safety Clearance (10 pts), with 1-click Sub Assignment.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { Organization, OrgMembership } from '../../types';
import {
  DAY,
  HOUR,
  addDays,
  addMonths,
  dayKey,
  downloadIcs,
  fmtRange,
  fmtTime,
  localZone,
  monthGrid,
  parseQuickAdd,
  sameDay,
  startOfDay,
  startOfWeek,
  type Recurrence,
} from '../../services/postman/calendarTime';
import {
  assignSubstituteToOrgEvent,
  deleteOrgCalendarEvent,
  detectOrgCalendarConflicts,
  loadOrgCentralCalendarSnapshot,
  newOrgCalendarEventId,
  quickAddOrgCalendarEvent,
  rankSubstituteCandidates,
  saveOrgCalendarEvent,
  type ExpandedOrgEvent,
  type OrgCalendarConflict,
  type OrgCalendarEvent,
  type OrgCalendarParticipant,
  type OrgCentralCalendarSnapshot,
  type OrgEventCategory,
  type SubstituteSuggestion,
} from '../../services/orgCentralCalendarService';
import { ELEVATE_ROLES, elevateCan, getElevateRole } from '../../services/elevateRoles';

export interface OrgCentralCalendarHubProps {
  org: Organization;
  myMembership: OrgMembership | null;
  /** Optional initial department filter (e.g. Christian Education ministryId) */
  initialDepartmentId?: string;
  /** Optional compact mode when embedded inside Christian Education or a department tab */
  compact?: boolean;
}

type ViewMode = 'month' | 'week' | 'agenda' | 'conflicts';

const CATEGORY_META: Record<
  OrgEventCategory,
  { label: string; badgeClass: string; dotColor: string }
> = {
  WORSHIP_SERVICE: {
    label: 'Worship Service',
    badgeClass: 'bg-lime-500/15 text-lime-300 border-lime-400/30',
    dotColor: '#a3e635',
  },
  CHRISTIAN_ED_CLASS: {
    label: 'Christian Ed Class',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    dotColor: '#34d399',
  },
  DEPARTMENT_MEETING: {
    label: 'Department Meeting',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    dotColor: '#38bdf8',
  },
  VOLUNTEER_SHIFT: {
    label: 'Volunteer Shift',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    dotColor: '#fbbf24',
  },
  FACILITY_BOOKING: {
    label: 'Facility / Room',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-400/30',
    dotColor: '#c084fc',
  },
  REHEARSAL: {
    label: 'Rehearsal',
    badgeClass: 'bg-pink-500/15 text-pink-300 border-pink-400/30',
    dotColor: '#f472b6',
  },
  SPECIAL_EVENT: {
    label: 'Special Event',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-400/30',
    dotColor: '#fb923c',
  },
};

const ROLE_OPTIONS_FOR_EVENTS = [
  { key: 'INSTRUCTOR', label: 'Instructor (Non-Credentialed Church/Org Class)' },
  { key: 'DEPARTMENT_HEAD', label: 'Department Head' },
  { key: 'DEPARTMENT_ADMIN', label: 'Department Administrator' },
  { key: 'DEPARTMENT_VOLUNTEER', label: 'Department Volunteer' },
  { key: 'VOLUNTEER', label: 'General Volunteer' },
  { key: 'STAFF', label: 'Staff' },
];

export const OrgCentralCalendarHub: React.FC<OrgCentralCalendarHubProps> = ({
  org,
  myMembership,
  initialDepartmentId = 'ALL',
  compact = false,
}) => {
  const [snapshot, setSnapshot] = useState<OrgCentralCalendarSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());
  const [selectedDayMs, setSelectedDayMs] = useState<number>(() => startOfDay(new Date()).getTime());

  // Filters
  const [deptFilter, setDeptFilter] = useState<string>(initialDepartmentId);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [personFilter, setPersonFilter] = useState<string>('ALL');

  // Postman Natural-Language Quick-Add bar
  const [quickText, setQuickText] = useState('');
  const [quickDeptId, setQuickDeptId] = useState<string>(
    initialDepartmentId !== 'ALL' ? initialDepartmentId : org.ministries?.[0]?.id || '',
  );
  const [quickCategory, setQuickCategory] = useState<OrgEventCategory>('CHRISTIAN_ED_CLASS');

  // Structured Create / Edit Event Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftStartTime, setDraftStartTime] = useState('10:00');
  const [draftEndTime, setDraftEndTime] = useState('11:30');
  const [draftCategory, setDraftCategory] = useState<OrgEventCategory>('CHRISTIAN_ED_CLASS');
  const [draftDeptId, setDraftDeptId] = useState<string>(
    initialDepartmentId !== 'ALL' ? initialDepartmentId : org.ministries?.[0]?.id || '',
  );
  const [draftRoomName, setDraftRoomName] = useState('');
  const [draftRecurrence, setDraftRecurrence] = useState<Recurrence>('none');
  const [draftRequiredRole, setDraftRequiredRole] = useState('INSTRUCTOR');
  const [draftRequiresBgCheck, setDraftRequiresBgCheck] = useState(false);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftParticipants, setDraftParticipants] = useState<
    Array<{ personKey: string; roleKey: string }>
  >([]);

  // Selected occurrence for detail / on-demand Sub Finder drawer
  const [inspectedOccurrence, setInspectedOccurrence] = useState<ExpandedOrgEvent | null>(null);
  const [subTargetPersonKey, setSubTargetPersonKey] = useState<string | undefined>(undefined);

  const canSchedule =
    elevateCan(myMembership, org, 'POST_AS_ORG') ||
    elevateCan(myMembership, org, 'MANAGE_CONTENT') ||
    elevateCan(myMembership, org, 'MANAGE_MINISTRIES') ||
    elevateCan(myMembership, org, 'MANAGE_ROSTER') ||
    Boolean(myMembership);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await loadOrgCentralCalendarSnapshot(org);
      setSnapshot(snap);
    } catch (err: any) {
      console.warn('[OrgCentralCalendarHub] failed to load snapshot:', err);
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Compute time window (14 days back to 75 days ahead of cursorDate)
  const windowRange = useMemo(() => {
    const base = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1).getTime();
    return {
      from: base - 14 * DAY,
      to: base + 75 * DAY,
    };
  }, [cursorDate]);

  // Run conflict & occurrence expansion engine across the entire organization first,
  // then filter occurrences/conflicts for the active view
  const engineResult = useMemo(() => {
    if (!snapshot) {
      return {
        occurrences: [] as ExpandedOrgEvent[],
        conflicts: [] as OrgCalendarConflict[],
        conflictsByOccurrenceKey: new Map<string, OrgCalendarConflict[]>(),
      };
    }
    return detectOrgCalendarConflicts(snapshot, windowRange.from, windowRange.to);
  }, [snapshot, windowRange]);

  const filteredOccurrences = useMemo(() => {
    return engineResult.occurrences.filter(occ => {
      if (deptFilter !== 'ALL' && occ.ministryId !== deptFilter) return false;
      if (categoryFilter !== 'ALL' && occ.eventCategory !== categoryFilter) return false;
      if (
        personFilter !== 'ALL' &&
        !(occ.participants || []).some(p => p.personKey === personFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [engineResult.occurrences, deptFilter, categoryFilter, personFilter]);

  const filteredConflicts = useMemo(() => {
    return engineResult.conflicts.filter(c => {
      if (deptFilter !== 'ALL') {
        const matchA = c.eventA.ministryId === deptFilter;
        const matchB = c.eventB?.ministryId === deptFilter;
        if (!matchA && !matchB) return false;
      }
      if (personFilter !== 'ALL' && c.personKey !== personFilter) return false;
      return true;
    });
  }, [engineResult.conflicts, deptFilter, personFilter]);

  // Quick-add live preview from Postman's `parseQuickAdd`
  const quickPreview = useMemo(() => {
    if (!quickText.trim()) return null;
    return parseQuickAdd(quickText, new Date(selectedDayMs));
  }, [quickText, selectedDayMs]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim() || !snapshot) return;
    setBusyAction('quick-add');
    try {
      const dept = (org.ministries || []).find(m => m.id === quickDeptId);
      const created = await quickAddOrgCalendarEvent(org, quickText.trim(), {
        ministryId: dept?.id,
        eventCategory: quickCategory,
        requiredRoleKey: quickCategory === 'CHRISTIAN_ED_CLASS' ? 'INSTRUCTOR' : 'DEPARTMENT_VOLUNTEER',
      });
      if (created) {
        setQuickText('');
        setToast(`Added "${created.title}" to the Central Calendar.`);
        await refresh();
      }
    } catch (err: any) {
      setToast(err?.message || 'Could not add event.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateStructuredEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim() || !snapshot) return;
    setBusyAction('create-structured');
    try {
      const [y, m, d] = draftDate.split('-').map(Number);
      const [sh, sm] = draftStartTime.split(':').map(Number);
      const [eh, em] = draftEndTime.split(':').map(Number);
      const startDt = new Date(y, (m || 1) - 1, d || 1, sh || 9, sm || 0, 0, 0);
      const endDt = new Date(y, (m || 1) - 1, d || 1, eh || 10, em || 30, 0, 0);
      const start = startDt.getTime();
      const end = endDt.getTime() > start ? endDt.getTime() : start + HOUR;

      const dept = (org.ministries || []).find(min => min.id === draftDeptId);
      const participants: OrgCalendarParticipant[] = draftParticipants
        .map(dp => {
          const prof = snapshot.directory.byKey.get(dp.personKey);
          if (!prof) return null;
          return {
            personKey: prof.personKey,
            uid: prof.uid,
            personId: prof.personId,
            name: prof.name,
            email: prof.emailLower,
            roleKey: dp.roleKey,
            roleLabel: getElevateRole(dp.roleKey)?.label || dp.roleKey,
            ministryId: dept?.id,
            status: 'CONFIRMED' as const,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const ev: OrgCalendarEvent = {
        id: newOrgCalendarEventId(),
        orgId: org.id,
        title: draftTitle.trim(),
        start,
        end,
        allDay: false,
        tz: localZone(),
        location: draftRoomName.trim() || undefined,
        notes: draftNotes.trim() || undefined,
        layer: draftCategory === 'CHRISTIAN_ED_CLASS' ? 'learning' : draftCategory === 'WORSHIP_SERVICE' ? 'worship' : 'events',
        source: 'manual',
        recurrence: draftRecurrence,
        kindLabel: `${dept?.name ? `${dept.name} · ` : ''}${CATEGORY_META[draftCategory].label}`,
        eventCategory: draftCategory,
        originSource: 'ORG_CENTRAL_CALENDAR',
        ministryId: dept?.id,
        ministryName: dept?.name,
        roomName: draftRoomName.trim() || undefined,
        requiredRoleKey: draftRequiredRole,
        requiresBackgroundCheck: draftRequiresBgCheck,
        participants,
        participantKeys: participants.map(p => p.personKey),
        participantUids: participants.map(p => p.uid).filter(Boolean) as string[],
      };

      await saveOrgCalendarEvent(ev);
      setShowCreateModal(false);
      setDraftTitle('');
      setDraftNotes('');
      setDraftParticipants([]);
      setToast(`Scheduled "${ev.title}" on the Central Organization Calendar.`);
      await refresh();
    } catch (err: any) {
      setToast(err?.message || 'Failed to save event.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAssignSubstitute = async (
    targetEvent: ExpandedOrgEvent,
    replacedPersonKey: string | undefined,
    sub: SubstituteSuggestion,
  ) => {
    if (!snapshot) return;
    const actionKey = `sub_${targetEvent.id}_${sub.personKey}`;
    setBusyAction(actionKey);
    try {
      await assignSubstituteToOrgEvent(org, targetEvent, replacedPersonKey, sub, snapshot);
      const replacedName =
        targetEvent.participants.find(p => p.personKey === replacedPersonKey)?.name || 'open slot';
      setToast(
        `Assigned ${sub.name} (${sub.roleLabels[0] || 'Sub'} · ${sub.totalScore}/100 match) to "${targetEvent.title}" in place of ${replacedName}.`,
      );
      setInspectedOccurrence(null);
      await refresh();
    } catch (err: any) {
      setToast(err?.message || 'Could not assign substitute.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDirectEvent = async (ev: ExpandedOrgEvent) => {
    if (ev.originSource !== 'ORG_CENTRAL_CALENDAR') return;
    setBusyAction(`del_${ev.id}`);
    try {
      await deleteOrgCalendarEvent(ev.id);
      setInspectedOccurrence(null);
      setToast(`Removed "${ev.title}" from the Central Calendar.`);
      await refresh();
    } catch (err: any) {
      setToast(err?.message || 'Could not delete event.');
    } finally {
      setBusyAction(null);
    }
  };

  // Live substitute candidates for the currently inspected event occurrence
  const inspectedSubCandidates = useMemo(() => {
    if (!inspectedOccurrence || !snapshot) return [];
    const excludeKeys = subTargetPersonKey
      ? [subTargetPersonKey]
      : inspectedOccurrence.participantKeys;
    return rankSubstituteCandidates(
      inspectedOccurrence,
      snapshot,
      engineResult.occurrences,
      excludeKeys,
    ).slice(0, 8);
  }, [inspectedOccurrence, snapshot, engineResult.occurrences, subTargetPersonKey]);

  // Month grid cells from Postman's `monthGrid`
  const monthDays = useMemo(() => monthGrid(cursorDate, 0), [cursorDate]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursorDate, 0);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursorDate]);

  const occurrencesByDayKey = useMemo(() => {
    const map = new Map<string, ExpandedOrgEvent[]>();
    for (const occ of filteredOccurrences) {
      const k = dayKey(occ.occurrenceStart);
      const bucket = map.get(k) || [];
      bucket.push(occ);
      map.set(k, bucket);
    }
    return map;
  }, [filteredOccurrences]);

  const selectedDayOccurrences = useMemo(() => {
    return occurrencesByDayKey.get(dayKey(selectedDayMs)) || [];
  }, [occurrencesByDayKey, selectedDayMs]);

  return (
    <div className="space-y-5 text-white">
      {/* Top Header Banner */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-[#101118] to-emerald-500/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-300 border border-amber-400/30">
                <CalendarIcon size={12} /> Postman Central Calendar Engine
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                <Sparkles size={12} /> Multi-Dept Conflict &amp; Sub AI
              </span>
              {filteredConflicts.length > 0 ? (
                <button
                  onClick={() => setViewMode('conflicts')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-200 border border-rose-400/40 animate-pulse"
                >
                  <AlertTriangle size={12} /> {filteredConflicts.length} Active Timing{' '}
                  {filteredConflicts.length === 1 ? 'Conflict' : 'Conflicts'}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10">
                  <CheckCircle2 size={12} className="text-emerald-400" /> Zero Schedule Clashes
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {org.name} — Central Organization Calendar
            </h2>
            <p className="text-xs text-white/60 max-w-3xl">
              Single point of truth built on the Post Man calendar engine. Aggregates all Department
              schedules, Christian Education classes (Non-Credentialed{' '}
              <span className="text-emerald-300 font-semibold">Instructors</span> &amp;{' '}
              <span className="text-sky-300 font-semibold">Department Volunteers</span>), ChMS
              shifts, Mobilize drives, and Facility bookings — detecting cross-department person
              overlaps and ranking weighted substitutes automatically.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={refresh}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/80 flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Sync
            </button>
            <button
              onClick={() => {
                const first = filteredOccurrences[0];
                if (first) {
                  downloadIcs({
                    uid: first.id,
                    title: `${org.name}: ${first.title}`,
                    start: first.start,
                    end: first.end,
                    allDay: first.allDay,
                    location: first.roomName || first.location,
                    description: first.notes,
                  });
                }
              }}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/80 flex items-center gap-1.5"
              title="Export organization schedule to Apple Calendar, Google Calendar, or Outlook (.ics)"
            >
              <Download size={13} /> Export .ICS
            </button>
            {canSchedule && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5"
              >
                <Plus size={14} /> Schedule Event / Class
              </button>
            )}
          </div>
        </div>

        {/* Postman Natural Language Quick-Add Bar */}
        {canSchedule && !compact && (
          <form onSubmit={handleQuickAdd} className="mt-4 pt-4 border-t border-white/10">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Zap
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400"
                />
                <input
                  value={quickText}
                  onChange={e => setQuickText(e.target.value)}
                  placeholder='Postman Quick-Add: e.g. "Christian Ed Instructors Prep Tue 6:30pm-8pm @ Room 202 every week"'
                  className="w-full bg-black/50 border border-white/15 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder:text-white/35 outline-none focus:border-amber-400/60"
                />
              </div>
              <select
                value={quickDeptId}
                onChange={e => setQuickDeptId(e.target.value)}
                className="bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">All / Org-Wide</option>
                {(org.ministries || []).map(m => (
                  <option key={m.id} value={m.id}>
                    Dept: {m.name}
                  </option>
                ))}
              </select>
              <select
                value={quickCategory}
                onChange={e => setQuickCategory(e.target.value as OrgEventCategory)}
                className="bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
              >
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!quickText.trim() || busyAction === 'quick-add'}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/15 text-xs font-black uppercase tracking-wider text-white whitespace-nowrap"
              >
                {busyAction === 'quick-add' ? 'Adding…' : 'Quick Add'}
              </button>
            </div>
            {quickPreview && (
              <div className="mt-2 flex items-center gap-3 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-1.5">
                <Sparkles size={12} className="shrink-0" />
                <span>
                  Parsed: <strong>{quickPreview.title}</strong> ·{' '}
                  {fmtRange(quickPreview.start, quickPreview.end, quickPreview.allDay)}
                  {quickPreview.location ? ` · @ ${quickPreview.location}` : ''}
                  {quickPreview.recurrence !== 'none'
                    ? ` · Repeats ${quickPreview.recurrence}`
                    : ''}
                </span>
              </div>
            )}
          </form>
        )}
      </div>

      {toast && (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 text-xs font-semibold text-emerald-200 flex items-center justify-between">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-white/50 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Controls: View Switcher + Department / Category / Person Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] border border-white/10 rounded-2xl p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              ['month', 'Month Grid'],
              ['week', 'Week View'],
              ['agenda', 'Unified Agenda'],
              ['conflicts', `Conflict & Sub Radar (${filteredConflicts.length})`],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                viewMode === mode
                  ? mode === 'conflicts'
                    ? 'bg-rose-500 text-white'
                    : 'bg-white text-black'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Month / Week Date Navigator */}
        {viewMode !== 'conflicts' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setCursorDate(d => (viewMode === 'week' ? addDays(d, -7) : addMonths(d, -1)))
              }
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs font-black uppercase tracking-widest min-w-[140px] text-center">
              {cursorDate.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              onClick={() =>
                setCursorDate(d => (viewMode === 'week' ? addDays(d, 7) : addMonths(d, 1)))
              }
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70"
            >
              <ChevronRight size={15} />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCursorDate(now);
                setSelectedDayMs(startOfDay(now).getTime());
              }}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-white/70"
            >
              Today
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="text-white/40" />
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="bg-black/50 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white"
          >
            <option value="ALL">All Departments ({(org.ministries || []).length})</option>
            {(org.ministries || []).map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-black/50 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white"
          >
            <option value="ALL">All Event Categories</option>
            {Object.entries(CATEGORY_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          <select
            value={personFilter}
            onChange={e => setPersonFilter(e.target.value)}
            className="bg-black/50 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white max-w-[200px]"
          >
            <option value="ALL">All People ({snapshot?.directory.list.length || 0})</option>
            {(snapshot?.directory.list || []).map(p => (
              <option key={p.personKey} value={p.personKey}>
                {p.name} ({p.roleLabels.join(', ')})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-16 grid place-items-center text-white/50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-amber-400" size={28} />
            <p className="text-xs">
              Syncing Postman Central Calendar &amp; checking cross-department conflicts…
            </p>
          </div>
        </div>
      ) : viewMode === 'conflicts' ? (
        /* ── CONFLICT RADAR & WEIGHTED SUBSTITUTE ENGINE VIEW ── */
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-400" />
                Organization-Wide Timing Conflict &amp; Weighted Substitute Engine
              </h3>
              <p className="text-xs text-white/55 mt-0.5">
                Detects when any person (Instructor, Department Head, Department Admin, or
                Department Volunteer) is double-booked across two overlapping events, has an active
                blockout, or when two events double-book a room. Ranks substitutes using
                Availability (35 pts), Department &amp; Role fit (30 pts), Experience &amp; Skills
                (25 pts), and Safety Clearance (10 pts).
              </p>
            </div>
          </div>

          {filteredConflicts.length === 0 ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center space-y-2">
              <CheckCircle2 size={32} className="text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-emerald-200">
                No Timing Conflicts Detected Across the Organization
              </p>
              <p className="text-xs text-white/50 max-w-md mx-auto">
                Every Instructor, Department Administrator, Department Head, and Volunteer has a
                conflict-free schedule in this window. You can also click any event on the Month,
                Week, or Agenda views to run the Weighted Substitute Finder on demand.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredConflicts.map(conflict => (
                <div
                  key={conflict.id}
                  className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.05] p-4 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-200 border border-rose-400/30">
                          {conflict.kind === 'PERSON_DOUBLE_BOOKED'
                            ? 'Person Double-Booked Across Events'
                            : conflict.kind === 'PERSON_BLOCKOUT_CLASH'
                            ? 'Blockout / Sub Requested Clash'
                            : 'Room / Facility Double-Booked'}
                        </span>
                        <span className="text-xs font-bold text-white/70">
                          {conflict.dateKey} · {conflict.overlapLabel}
                        </span>
                        {conflict.personDepartments && conflict.personDepartments.length > 0 && (
                          <span className="text-[11px] text-sky-300 font-semibold">
                            Depts: {conflict.personDepartments.join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-white">{conflict.summary}</p>
                      {conflict.personRoles && conflict.personRoles.length > 0 && (
                        <p className="text-[11px] text-white/50">
                          Held Roles: {conflict.personRoles.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Clashing Events Comparison */}
                  <div className="grid md:grid-cols-2 gap-3">
                    {[conflict.eventA, conflict.eventB].filter(Boolean).map((ev, idx) => {
                      if (!ev) return null;
                      const subs =
                        idx === 0 ? conflict.substitutesForEventA : conflict.substitutesForEventB;
                      return (
                        <div
                          key={`${ev.id}_${idx}`}
                          className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  CATEGORY_META[ev.eventCategory]?.badgeClass ||
                                  'bg-white/10 text-white/70 border-white/15'
                                }`}
                              >
                                {ev.ministryName ? `${ev.ministryName} · ` : ''}
                                {CATEGORY_META[ev.eventCategory]?.label || ev.eventCategory}
                              </span>
                              <h4 className="text-sm font-bold text-white mt-1">{ev.title}</h4>
                              <p className="text-xs text-white/55">
                                {fmtRange(ev.start, ev.end, ev.allDay)}
                                {ev.roomName || ev.location
                                  ? ` · 📍 ${ev.roomName || ev.location}`
                                  : ''}
                              </p>
                            </div>
                          </div>

                          {/* Weighted Substitute Suggestions for this event */}
                          {subs.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-white/10">
                              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1">
                                <Sparkles size={11} /> Top Weighted Substitute Recommendations
                              </p>
                              <div className="space-y-1.5">
                                {subs.slice(0, 3).map(sub => {
                                  const actKey = `sub_${ev.id}_${sub.personKey}`;
                                  return (
                                    <div
                                      key={sub.personKey}
                                      className="rounded-xl bg-white/[0.03] border border-white/10 p-2.5 flex items-center justify-between gap-2 flex-wrap"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-xs font-bold text-white">
                                            {sub.name}
                                          </span>
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
                                            {sub.totalScore}% Match
                                          </span>
                                          {sub.roleKeys.includes('INSTRUCTOR') && (
                                            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 text-[9px] font-bold">
                                              Instructor
                                            </span>
                                          )}
                                          {sub.breakdown.safetyScore >= 8 && (
                                            <span
                                              title="Youth Safety & Background Checked"
                                              className="text-emerald-400"
                                            >
                                              <ShieldCheck size={12} />
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-white/50 truncate">
                                          {sub.reasons.slice(0, 3).join(' · ')}
                                        </p>
                                      </div>
                                      {canSchedule && (
                                        <button
                                          onClick={() =>
                                            handleAssignSubstitute(ev, conflict.personKey, sub)
                                          }
                                          disabled={busyAction === actKey}
                                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shrink-0"
                                        >
                                          {busyAction === actKey ? (
                                            <Loader2 size={11} className="animate-spin" />
                                          ) : (
                                            <UserCheck size={11} />
                                          )}
                                          Assign Sub
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : viewMode === 'month' ? (
        /* ── POSTMAN MONTH GRID + SELECTED DAY INSPECTOR ── */
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <div className="grid grid-cols-7 text-center text-[10px] font-black uppercase tracking-widest text-white/40 pb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map(d => {
                const k = dayKey(d);
                const dayEvs = occurrencesByDayKey.get(k) || [];
                const inMonth = d.getMonth() === cursorDate.getMonth();
                const isToday = sameDay(d, new Date());
                const isSelected = sameDay(d, new Date(selectedDayMs));
                const hasConflict = dayEvs.some(e =>
                  engineResult.conflictsByOccurrenceKey.has(`${e.id}@${e.occurrenceStart}`),
                );
                return (
                  <button
                    key={k}
                    onClick={() => setSelectedDayMs(d.getTime())}
                    className={`min-h-[82px] rounded-xl p-1.5 text-left border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/10'
                        : hasConflict
                        ? 'border-rose-500/40 bg-rose-500/[0.06]'
                        : inMonth
                        ? 'border-white/10 bg-black/30 hover:bg-white/[0.05]'
                        : 'border-white/5 bg-black/10 opacity-40'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-bold w-6 h-6 rounded-full grid place-items-center ${
                          isToday ? 'bg-amber-400 text-black font-black' : 'text-white/80'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {hasConflict && (
                        <span
                          title="Timing conflict on this day"
                          className="w-2 h-2 rounded-full bg-rose-500 animate-ping"
                        />
                      )}
                    </div>
                    <div className="space-y-0.5 mt-1 w-full overflow-hidden">
                      {dayEvs.slice(0, 3).map(ev => {
                        const occConflicts =
                          engineResult.conflictsByOccurrenceKey.get(
                            `${ev.id}@${ev.occurrenceStart}`,
                          ) || [];
                        return (
                          <div
                            key={`${ev.id}_${ev.occurrenceStart}`}
                            className={`truncate text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              occConflicts.length > 0
                                ? 'bg-rose-500/30 text-rose-200 border border-rose-400/40'
                                : 'bg-white/10 text-white/85'
                            }`}
                          >
                            {fmtTime(ev.start)} {ev.title}
                          </div>
                        );
                      })}
                      {dayEvs.length > 3 && (
                        <div className="text-[9px] text-white/45 pl-1">
                          +{dayEvs.length - 3} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Schedule & Sub Finder Trigger */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                  Selected Day Schedule
                </p>
                <h4 className="text-sm font-black text-white">
                  {new Date(selectedDayMs).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h4>
              </div>
              <span className="text-xs text-white/50">{selectedDayOccurrences.length} events</span>
            </div>

            {selectedDayOccurrences.length === 0 ? (
              <p className="text-xs text-white/40 py-8 text-center">
                No events scheduled on this day for the current filter.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {selectedDayOccurrences.map(occ => {
                  const occConflicts =
                    engineResult.conflictsByOccurrenceKey.get(
                      `${occ.id}@${occ.occurrenceStart}`,
                    ) || [];
                  return (
                    <div
                      key={`${occ.id}_${occ.occurrenceStart}`}
                      onClick={() => {
                        setInspectedOccurrence(occ);
                        setSubTargetPersonKey(occ.participants[0]?.personKey);
                      }}
                      className={`cursor-pointer rounded-xl border p-3 transition-all space-y-2 ${
                        occConflicts.length > 0
                          ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15'
                          : 'border-white/10 bg-black/40 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            CATEGORY_META[occ.eventCategory]?.badgeClass ||
                            'bg-white/10 text-white/70 border-white/15'
                          }`}
                        >
                          {occ.ministryName ? `${occ.ministryName} · ` : ''}
                          {CATEGORY_META[occ.eventCategory]?.label}
                        </span>
                        {occConflicts.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase">
                            Conflict ({occConflicts.length})
                          </span>
                        )}
                      </div>
                      <div>
                        <h5 className="text-sm font-bold text-white">{occ.title}</h5>
                        <p className="text-xs text-white/55 flex items-center gap-1.5 mt-0.5">
                          <Clock size={11} /> {fmtRange(occ.start, occ.end, occ.allDay)}
                        </p>
                        {(occ.roomName || occ.location) && (
                          <p className="text-xs text-white/55 flex items-center gap-1.5 mt-0.5">
                            <MapPin size={11} /> {occ.roomName || occ.location}
                          </p>
                        )}
                      </div>

                      {occ.participants.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {occ.participants.map(p => (
                            <span
                              key={`${p.personKey}_${p.roleKey}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-[10px] text-white/85"
                            >
                              <Users size={10} className="text-sky-300" />
                              {p.name}{' '}
                              <span className="text-white/45">({p.roleLabel})</span>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="pt-1 flex items-center justify-between text-[10px] text-amber-300 font-bold">
                        <span>Click to inspect &amp; find weighted substitutes →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'week' ? (
        /* ── WEEK VIEW ── */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {weekDays.map(d => {
            const k = dayKey(d);
            const evs = occurrencesByDayKey.get(k) || [];
            const isToday = sameDay(d, new Date());
            return (
              <div
                key={k}
                className={`rounded-2xl border p-2.5 space-y-2 min-h-[260px] ${
                  isToday
                    ? 'border-amber-400/50 bg-amber-400/[0.04]'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="text-center pb-2 border-b border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/45">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className="text-sm font-black text-white">{d.getDate()}</p>
                </div>
                <div className="space-y-1.5">
                  {evs.map(occ => {
                    const hasC = engineResult.conflictsByOccurrenceKey.has(
                      `${occ.id}@${occ.occurrenceStart}`,
                    );
                    return (
                      <button
                        key={`${occ.id}_${occ.occurrenceStart}`}
                        onClick={() => {
                          setInspectedOccurrence(occ);
                          setSubTargetPersonKey(occ.participants[0]?.personKey);
                        }}
                        className={`w-full text-left rounded-xl p-2 border text-xs space-y-1 ${
                          hasC
                            ? 'border-rose-500/50 bg-rose-500/15'
                            : 'border-white/10 bg-black/40 hover:bg-white/[0.06]'
                        }`}
                      >
                        <p className="font-bold text-white truncate">{occ.title}</p>
                        <p className="text-[10px] text-white/55">{fmtTime(occ.start)}</p>
                        {occ.ministryName && (
                          <p className="text-[9px] text-emerald-300 truncate">{occ.ministryName}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── UNIFIED AGENDA VIEW ── */
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/10">
          {filteredOccurrences.length === 0 ? (
            <p className="p-8 text-center text-xs text-white/40">
              No upcoming events in this range.
            </p>
          ) : (
            filteredOccurrences.slice(0, 60).map(occ => {
              const occConflicts =
                engineResult.conflictsByOccurrenceKey.get(`${occ.id}@${occ.occurrenceStart}`) || [];
              return (
                <div
                  key={`${occ.id}_${occ.occurrenceStart}`}
                  className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-white/[0.02]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          CATEGORY_META[occ.eventCategory]?.badgeClass ||
                          'bg-white/10 text-white/70 border-white/15'
                        }`}
                      >
                        {occ.ministryName ? `${occ.ministryName} · ` : ''}
                        {CATEGORY_META[occ.eventCategory]?.label}
                      </span>
                      <span className="text-xs font-bold text-white">{occ.title}</span>
                      {occConflicts.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[10px] font-black">
                          {occConflicts.length} Timing Clash
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/55">
                      {fmtRange(occ.start, occ.end, occ.allDay)}
                      {occ.roomName || occ.location ? ` · 📍 ${occ.roomName || occ.location}` : ''}
                    </p>
                    {occ.participants.length > 0 && (
                      <p className="text-[11px] text-white/65">
                        Team:{' '}
                        {occ.participants.map(p => `${p.name} (${p.roleLabel})`).join(' · ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setInspectedOccurrence(occ);
                      setSubTargetPersonKey(occ.participants[0]?.personKey);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-amber-300"
                  >
                    Inspect / Find Sub
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── INSPECTED EVENT & WEIGHTED SUBSTITUTE FINDER DRAWER ── */}
      {inspectedOccurrence && snapshot && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/15 bg-[#12131a] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                    CATEGORY_META[inspectedOccurrence.eventCategory]?.badgeClass
                  }`}
                >
                  {inspectedOccurrence.ministryName
                    ? `${inspectedOccurrence.ministryName} · `
                    : ''}
                  {CATEGORY_META[inspectedOccurrence.eventCategory]?.label}
                </span>
                <h3 className="text-lg font-black text-white mt-1">
                  {inspectedOccurrence.title}
                </h3>
                <p className="text-xs text-white/60">
                  {fmtRange(
                    inspectedOccurrence.start,
                    inspectedOccurrence.end,
                    inspectedOccurrence.allDay,
                  )}
                  {inspectedOccurrence.roomName || inspectedOccurrence.location
                    ? ` · 📍 ${inspectedOccurrence.roomName || inspectedOccurrence.location}`
                    : ''}
                </p>
              </div>
              <button
                onClick={() => setInspectedOccurrence(null)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60"
              >
                <X size={16} />
              </button>
            </div>

            {/* Current Assigned Team */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/45">
                Scheduled Team (Select a person to replace, or leave blank to add a sub)
              </p>
              {inspectedOccurrence.participants.length === 0 ? (
                <p className="text-xs text-white/45">No team members assigned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {inspectedOccurrence.participants.map(p => {
                    const selected = subTargetPersonKey === p.personKey;
                    return (
                      <button
                        key={p.personKey}
                        onClick={() =>
                          setSubTargetPersonKey(selected ? undefined : p.personKey)
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          selected
                            ? 'bg-amber-400 text-black border-amber-400'
                            : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {p.name} · {p.roleLabel}
                        {selected ? ' (Replacing)' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Weighted Substitute Candidates */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                  <Sparkles size={14} /> Weighted Substitute Candidates (Availability + Dept/Role +
                  Experience)
                </p>
                <span className="text-[11px] text-white/45">
                  Required Role:{' '}
                  {getElevateRole(inspectedOccurrence.requiredRoleKey || 'INSTRUCTOR')?.label ||
                    'Instructor / Volunteer'}
                </span>
              </div>

              {inspectedSubCandidates.length === 0 ? (
                <p className="text-xs text-white/45 py-4 text-center">
                  No available substitute candidates found without a schedule conflict at this time.
                </p>
              ) : (
                <div className="space-y-2">
                  {inspectedSubCandidates.map(sub => {
                    const actKey = `sub_${inspectedOccurrence.id}_${sub.personKey}`;
                    return (
                      <div
                        key={sub.personKey}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3 flex-wrap"
                      >
                        <div className="space-y-1 flex-1 min-w-[220px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white">{sub.name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-black">
                              {sub.totalScore}/100 Match
                            </span>
                            {sub.roleLabels.map(rl => (
                              <span
                                key={rl}
                                className="px-2 py-0.5 rounded-md bg-white/10 text-white/80 text-[10px] font-semibold"
                              >
                                {rl}
                              </span>
                            ))}
                          </div>
                          <p className="text-[11px] text-white/55">{sub.reasons.join(' · ')}</p>
                          <div className="flex flex-wrap gap-3 text-[10px] text-white/40 pt-0.5">
                            <span>Availability: {sub.breakdown.availabilityScore}/35</span>
                            <span>Dept &amp; Role: {sub.breakdown.roleDeptScore}/30</span>
                            <span>Experience: {sub.breakdown.experienceSkillScore}/25</span>
                            <span>Safety: {sub.breakdown.safetyScore}/10</span>
                          </div>
                        </div>

                        {canSchedule && (
                          <button
                            onClick={() =>
                              handleAssignSubstitute(
                                inspectedOccurrence,
                                subTargetPersonKey,
                                sub,
                              )
                            }
                            disabled={busyAction === actKey}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5"
                          >
                            {busyAction === actKey ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <UserCheck size={13} />
                            )}
                            {subTargetPersonKey ? 'Swap In Sub' : 'Add to Team'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {inspectedOccurrence.originSource === 'ORG_CENTRAL_CALENDAR' && canSchedule && (
              <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                <button
                  onClick={() => handleDeleteDirectEvent(inspectedOccurrence)}
                  className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 size={13} /> Delete Event from Central Calendar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STRUCTURED EVENT CREATOR MODAL ── */}
      {showCreateModal && snapshot && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4">
          <form
            onSubmit={handleCreateStructuredEvent}
            className="w-full max-w-2xl rounded-3xl border border-white/15 bg-[#12131a] p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white">
                  Schedule on Central Organization Calendar
                </h3>
                <p className="text-xs text-white/50">
                  Syncs with Postman personal calendars and runs real-time conflict detection across
                  all departments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Event / Class Title
                </label>
                <input
                  required
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  placeholder="e.g. Foundations of Faith — Christian Education Class"
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Department / Ministry
                </label>
                <select
                  value={draftDeptId}
                  onChange={e => setDraftDeptId(e.target.value)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white"
                >
                  <option value="">Org-Wide (All Departments)</option>
                  {(org.ministries || []).map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Category
                </label>
                <select
                  value={draftCategory}
                  onChange={e => setDraftCategory(e.target.value as OrgEventCategory)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white"
                >
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Date
                </label>
                <input
                  type="date"
                  value={draftDate}
                  onChange={e => setDraftDate(e.target.value)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                    Start
                  </label>
                  <input
                    type="time"
                    value={draftStartTime}
                    onChange={e => setDraftStartTime(e.target.value)}
                    className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                    End
                  </label>
                  <input
                    type="time"
                    value={draftEndTime}
                    onChange={e => setDraftEndTime(e.target.value)}
                    className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Room / Facility Location
                </label>
                <input
                  value={draftRoomName}
                  onChange={e => setDraftRoomName(e.target.value)}
                  placeholder="e.g. Room 204 / Fellowship Hall"
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Recurrence
                </label>
                <select
                  value={draftRecurrence}
                  onChange={e => setDraftRecurrence(e.target.value as Recurrence)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="none">One-time event</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  Primary Required Role (for Sub AI)
                </label>
                <select
                  value={draftRequiredRole}
                  onChange={e => setDraftRequiredRole(e.target.value)}
                  className="mt-1 w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {ROLE_OPTIONS_FOR_EVENTS.map(r => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input
                  id="reqBgCheck"
                  type="checkbox"
                  checked={draftRequiresBgCheck}
                  onChange={e => setDraftRequiresBgCheck(e.target.checked)}
                />
                <label htmlFor="reqBgCheck" className="text-xs text-white/80">
                  Requires Youth Safety / Background Clearance
                </label>
              </div>
            </div>

            {/* Assign Instructors / Department Leaders / Volunteers */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
                <UserPlus size={12} /> Assign Instructors, Department Leaders &amp; Volunteers
              </label>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-2 space-y-1">
                {snapshot.directory.list.map(prof => {
                  const existing = draftParticipants.find(p => p.personKey === prof.personKey);
                  const defaultRole = prof.roleKeys.includes('INSTRUCTOR')
                    ? 'INSTRUCTOR'
                    : prof.roleKeys.includes('DEPARTMENT_HEAD')
                    ? 'DEPARTMENT_HEAD'
                    : prof.roleKeys.includes('DEPARTMENT_ADMIN')
                    ? 'DEPARTMENT_ADMIN'
                    : 'DEPARTMENT_VOLUNTEER';
                  return (
                    <div
                      key={prof.personKey}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/5"
                    >
                      <label className="flex items-center gap-2 text-xs text-white cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={Boolean(existing)}
                          onChange={e => {
                            if (e.target.checked) {
                              setDraftParticipants(prev => [
                                ...prev,
                                { personKey: prof.personKey, roleKey: defaultRole },
                              ]);
                            } else {
                              setDraftParticipants(prev =>
                                prev.filter(p => p.personKey !== prof.personKey),
                              );
                            }
                          }}
                        />
                        <span className="font-semibold">{prof.name}</span>
                        <span className="text-[10px] text-white/45">
                          ({prof.roleLabels.join(', ')})
                        </span>
                      </label>
                      {existing && (
                        <select
                          value={existing.roleKey}
                          onChange={e =>
                            setDraftParticipants(prev =>
                              prev.map(p =>
                                p.personKey === prof.personKey
                                  ? { ...p, roleKey: e.target.value }
                                  : p,
                              ),
                            )
                          }
                          className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-[10px] text-white"
                        >
                          {ROLE_OPTIONS_FOR_EVENTS.map(r => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 text-xs font-bold text-white/70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction === 'create-structured'}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider"
              >
                {busyAction === 'create-structured' ? 'Saving…' : 'Save to Central Calendar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default OrgCentralCalendarHub;
