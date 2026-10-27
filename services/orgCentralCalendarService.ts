/**
 * orgCentralCalendarService — Centralized Organization Calendar & Intelligent Conflict / Substitute Engine.
 *
 * Built directly on the Post Man Calendar infrastructure (`services/postman/calendarTime.ts` and
 * `services/postman/calendarService.ts`), acting as the single point of truth for the entire organization:
 *
 *  1. Unified Point of Truth:
 *     - Direct Org Calendar Events (`org_calendar_events` in Firestore)
 *     - Christian Education Classes (`churchPrograms` — with Non-Credentialed `INSTRUCTOR` & `DEPARTMENT_VOLUNTEER` assignments)
 *     - ChMS Volunteer Shifts (`chmsShifts`)
 *     - Action & Mobilize Shift Drives (`ElevateMobilizeBundle.shiftDrives`)
 *     - Facility & Room Reservations + Matrix Schedules (`ElevateCompoundBundle`)
 *     - Weekly Worship & Service Gatherings (`org.serviceTimes`)
 *
 *  2. Intelligent Org-Wide Timing Conflict Detection:
 *     - Detects when the SAME person (across `uid`, `personId`, or email/name) is assigned to two or more
 *       overlapping events at the same time across any department, class, shift, or rehearsal.
 *     - Detects blockout/unavailability clashes and room/facility clashes (with setup/teardown buffers).
 *
 *  3. Weighted Substitute Suggestion Engine (Full Elevate Stack):
 *     - Combines availability (zero calendar overlap + blockouts + preferred days), department membership,
 *       multi-role match (`INSTRUCTOR`, `DEPARTMENT_ADMIN`, `DEPARTMENT_HEAD`, `DEPARTMENT_VOLUNTEER`),
 *       skills, historical shift experience, ChMS engagement score, and youth safety clearance to rank
 *       the best available substitutes for 1-click swap.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { ChmsAttendance, ChmsPerson, Organization, OrgMembership } from '../types';
import {
  DAY,
  HOUR,
  MIN,
  addDays,
  expandOccurrences,
  fmtRange,
  fmtTime,
  localZone,
  parseQuickAdd,
  startOfDay,
  type Recurrence,
} from './postman/calendarTime';
import type { CalendarEvent, CalLayer } from './postman/calendarService';
import { invalidatePlatformFeed } from './postman/calendarService';
import {
  getElevateRole,
  memberDepartmentIds,
  memberRoleKeys,
} from './elevateRoles';
import { fetchOrgMembers } from './organizationService';
import {
  engagementScore,
  fetchAttendance,
  fetchPeople,
  fetchShifts,
  fullName,
  saveShift,
  type ChmsShift,
} from './chmsPeople';
import {
  ensureDefaultTemplatedClassrooms,
  saveProgram,
  type ChurchProgram,
} from './churchEducationService';
import {
  loadCompoundBundle,
  type ElevateCompoundBundle,
} from './elevateTelaCompoundService';
import { loadElevateMobilizeBundleLocal } from './elevateMobilizeService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrgEventCategory =
  | 'WORSHIP_SERVICE'
  | 'CHRISTIAN_ED_CLASS'
  | 'DEPARTMENT_MEETING'
  | 'VOLUNTEER_SHIFT'
  | 'FACILITY_BOOKING'
  | 'REHEARSAL'
  | 'SPECIAL_EVENT';

export type OrgEventOriginSource =
  | 'ORG_CENTRAL_CALENDAR'
  | 'CHRISTIAN_EDUCATION'
  | 'CHMS_VOLUNTEER_SHIFT'
  | 'MOBILIZE_SHIFT_DRIVE'
  | 'FACILITY_RESERVATION'
  | 'MATRIX_SCHEDULE'
  | 'SERVICE_TIMES';

export interface OrgCalendarParticipant {
  /** Canonical key linking OrgMembership.userId, ChmsPerson.id, and email/name across systems. */
  personKey: string;
  uid?: string;
  personId?: string;
  name: string;
  email?: string;
  roleKey: string;
  roleLabel: string;
  positionId?: string;
  positionTitle?: string;
  ministryId?: string;
  status: 'CONFIRMED' | 'PENDING' | 'DECLINED' | 'SUB_REQUESTED';
}

export interface OrgCalendarEvent extends CalendarEvent {
  orgId: string;
  eventCategory: OrgEventCategory;
  originSource: OrgEventOriginSource;
  originId?: string;
  ministryId?: string;
  ministryName?: string;
  roomId?: string;
  roomName?: string;
  setupMins?: number;
  teardownMins?: number;
  requiredRoleKey?: string;
  requiredSkills?: string[];
  requiresBackgroundCheck?: boolean;
  participants: OrgCalendarParticipant[];
  participantKeys: string[];
  participantUids: string[];
}

export type ExpandedOrgEvent = OrgCalendarEvent & { occurrenceStart: number };

export interface SubstituteSuggestion {
  personKey: string;
  uid?: string;
  personId?: string;
  name: string;
  email?: string;
  photoUrl?: string;
  roleKeys: string[];
  roleLabels: string[];
  departmentIds: string[];
  departmentNames: string[];
  skills: string[];
  totalScore: number; // 0..100
  breakdown: {
    availabilityScore: number;   // max 35
    roleDeptScore: number;       // max 30
    experienceSkillScore: number;// max 25
    safetyScore: number;         // max 10
  };
  reasons: string[];
}

export interface OrgCalendarConflict {
  id: string;
  kind: 'PERSON_DOUBLE_BOOKED' | 'PERSON_BLOCKOUT_CLASH' | 'ROOM_FACILITY_CLASH';
  severity: 'CRITICAL' | 'WARNING';
  dateKey: string;
  overlapStart: number;
  overlapEnd: number;
  overlapLabel: string;
  /** Populated for person conflicts */
  personKey?: string;
  personUid?: string;
  personId?: string;
  personName?: string;
  personRoles?: string[];
  personDepartments?: string[];
  /** Populated for room conflicts */
  roomId?: string;
  roomName?: string;
  /** The primary & clashing events */
  eventA: ExpandedOrgEvent;
  eventB?: ExpandedOrgEvent;
  blockoutReason?: string;
  summary: string;
  /** Ranked substitutes to replace the conflicted person in eventA or eventB */
  substitutesForEventA: SubstituteSuggestion[];
  substitutesForEventB: SubstituteSuggestion[];
}

export interface UnifiedPersonProfile {
  personKey: string;
  uid?: string;
  personId?: string;
  name: string;
  emailLower?: string;
  photoUrl?: string;
  roleKeys: string[];
  roleLabels: string[];
  departmentIds: string[];
  departmentNames: string[];
  skills: string[];
  availabilityDays: string[]; // ['Sun', 'Wed', ...]
  historicalShiftsCount: number;
  engagementScore: number;
  backgroundCheckCleared: boolean;
  blockouts: Array<{ startISO: string; endISO: string; reason?: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORG_CAL_COLLECTION = 'org_calendar_events';
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0, sundays: 0,
  monday: 1, mon: 1, mondays: 1,
  tuesday: 2, tue: 2, tues: 2, tuesdays: 2,
  wednesday: 3, wed: 3, wednesdays: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, thursdays: 4,
  friday: 5, fri: 5, fridays: 5,
  saturday: 6, sat: 6, saturdays: 6,
};

const clean = <T extends Record<string, any>>(o: T): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

const normName = (s?: string) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normEmail = (s?: string) => (s || '').trim().toLowerCase();

/** Parse "9:15 AM" / "18:30" into minutes after midnight. */
export function parseClockMinutes(raw?: string): number | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || mins < 0 || mins > 59) return null;
  return h * 60 + mins;
}

/** Parse a free-text schedule like "Sundays · 9:15 AM · Children's Chapel B-101" into next occurrence + recurrence. */
export function parseScheduleString(
  scheduleText?: string,
  now = new Date(),
): { start: number; end: number; recurrence: Recurrence; location?: string } {
  const raw = (scheduleText || '').trim();
  const parts = raw.split('·').map(s => s.trim()).filter(Boolean);
  const dayPart = parts[0] || 'Sundays';
  const timePart = parts[1] || '9:15 AM';
  const location = parts[2] || undefined;

  let targetDow = 0; // default Sunday
  for (const [word, idx] of Object.entries(WEEKDAY_MAP)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(dayPart)) {
      targetDow = idx;
      break;
    }
  }
  const clockMins = parseClockMinutes(timePart) ?? (9 * 60 + 15);
  const base = startOfDay(now);
  const first = addDays(base, (targetDow - base.getDay() + 7) % 7);
  first.setMinutes(clockMins);
  const start = first.getTime();
  return {
    start,
    end: start + 75 * MIN,
    recurrence: 'weekly',
    location,
  };
}

/** Parse an ISO date ("2026-11-01") + optional clock time ("9:00 AM" / "09:00") into epoch ms. */
export function parseDateAndTime(dateISO: string, timeStr?: string, durationMins = 90): { start: number; end: number } {
  const m = String(dateISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0) : startOfDay(Date.now());
  const mins = parseClockMinutes(timeStr) ?? 9 * 60;
  const start = base.getTime() + mins * MIN;
  return { start, end: start + Math.max(15, durationMins) * MIN };
}

export const CATEGORY_META: Record<OrgEventCategory, { label: string; color: string; layer: CalLayer }> = {
  WORSHIP_SERVICE:    { label: 'Worship Service',      color: '#a3e635', layer: 'worship' },
  CHRISTIAN_ED_CLASS: { label: 'Christian Ed Class',   color: '#34d399', layer: 'learning' },
  DEPARTMENT_MEETING: { label: 'Department Meeting',   color: '#c084fc', layer: 'events' },
  VOLUNTEER_SHIFT:    { label: 'Volunteer Schedule',   color: '#f59e0b', layer: 'events' },
  FACILITY_BOOKING:   { label: 'Facility & Room',      color: '#38bdf8', layer: 'events' },
  REHEARSAL:          { label: 'Music & Rehearsal',    color: '#f43f5e', layer: 'live' },
  SPECIAL_EVENT:      { label: 'Special Event',        color: '#fb923c', layer: 'events' },
};

// ── Unified Directory Index (Links OrgMembership ↔ ChmsPerson ↔ Safety/Blockouts) ─

export function buildUnifiedPersonDirectory(
  org: Organization,
  members: OrgMembership[],
  people: ChmsPerson[],
  attendance: ChmsAttendance[],
  shifts: ChmsShift[],
  compoundBundle?: ElevateCompoundBundle,
): {
  list: UnifiedPersonProfile[];
  resolveKey: (ref: { uid?: string; personId?: string; email?: string; name?: string }) => string;
  byKey: Map<string, UnifiedPersonProfile>;
} {
  const ministriesById = new Map((org.ministries || []).map(m => [m.id, m.name]));
  const byUid = new Map<string, UnifiedPersonProfile>();
  const byPersonId = new Map<string, UnifiedPersonProfile>();
  const byEmail = new Map<string, UnifiedPersonProfile>();
  const byName = new Map<string, UnifiedPersonProfile>();
  const byKey = new Map<string, UnifiedPersonProfile>();

  // Count historical shifts per person
  const shiftCounts = new Map<string, number>();
  for (const s of shifts) {
    for (const a of s.assignments || []) {
      if (a.status === 'DECLINED') continue;
      if (a.personId) shiftCounts.set(a.personId, (shiftCounts.get(a.personId) || 0) + 1);
      if (a.uid) shiftCounts.set(a.uid, (shiftCounts.get(a.uid) || 0) + 1);
    }
  }

  const safetyByPerson = new Map(
    (compoundBundle?.safetyRecords || []).map(sr => [sr.personId, sr]),
  );
  const blockoutsByPerson = new Map<string, Array<{ startISO: string; endISO: string; reason?: string }>>();
  for (const b of compoundBundle?.blockouts || []) {
    const arr = blockoutsByPerson.get(b.personId) || [];
    arr.push({ startISO: b.startISO, endISO: b.endISO, reason: b.reason });
    blockoutsByPerson.set(b.personId, arr);
    if (b.personName) {
      const k = normName(b.personName);
      blockoutsByPerson.set(k, arr);
    }
  }

  const peopleById = new Map(people.filter(p => !p.archived).map(p => [p.id, p]));
  const peopleByUid = new Map<string, ChmsPerson>();
  for (const p of people) {
    if (p.archived) continue;
    if (p.linkedUid) peopleByUid.set(p.linkedUid, p);
    if (p.provisionedUid) peopleByUid.set(p.provisionedUid, p);
  }

  const register = (prof: UnifiedPersonProfile) => {
    byKey.set(prof.personKey, prof);
    if (prof.uid) byUid.set(prof.uid, prof);
    if (prof.personId) byPersonId.set(prof.personId, prof);
    if (prof.emailLower) byEmail.set(prof.emailLower, prof);
    if (prof.name) byName.set(normName(prof.name), prof);
  };

  // 1. Seed from active OrgMemberships
  for (const m of members.filter(x => x.status === 'ACTIVE')) {
    const linkedPerson =
      (m.provisionedPersonId ? peopleById.get(m.provisionedPersonId) : undefined) ||
      peopleByUid.get(m.userId);
    const personKey = m.userId || linkedPerson?.id || `mem_${m.id}`;
    const rKeys = memberRoleKeys(m);
    const dIds = Array.from(
      new Set([...memberDepartmentIds(m, org), ...(linkedPerson?.ministryIds || [])]),
    );
    const safety =
      (linkedPerson?.id ? safetyByPerson.get(linkedPerson.id) : undefined) ||
      safetyByPerson.get(m.userId);
    const skills = Array.from(
      new Set([
        ...(linkedPerson?.skills || []),
        ...(linkedPerson?.tags || []),
        ...(safety?.roleSkills || []),
        ...(rKeys.includes('INSTRUCTOR') ? ['Instructor', 'Christian Education', 'Teaching'] : []),
      ]),
    );
    const availRaw = linkedPerson?.custom?.availability || '';
    const availabilityDays = availRaw
      ? availRaw.split(',').map(x => x.trim()).filter(Boolean)
      : ['Sun', 'Wed']; // Default church gathering availability when not restricted
    const eng = linkedPerson
      ? engagementScore(linkedPerson, attendance, { servedRecently: dIds.length > 0 }).score
      : 75;
    const histCount =
      (shiftCounts.get(m.userId) || 0) + (linkedPerson?.id ? shiftCounts.get(linkedPerson.id) || 0 : 0);

    const prof: UnifiedPersonProfile = {
      personKey,
      uid: m.userId,
      personId: linkedPerson?.id || m.provisionedPersonId,
      name: m.displayName || (linkedPerson ? fullName(linkedPerson) : 'Member'),
      emailLower: normEmail(m.claimEmailLower || linkedPerson?.email),
      photoUrl: m.orgPhotoUrl || m.photoUrl || linkedPerson?.photoUrl,
      roleKeys: rKeys.length ? rKeys : ['MEMBER'],
      roleLabels: (rKeys.length ? rKeys : ['MEMBER']).map(k => getElevateRole(k)?.label || k),
      departmentIds: dIds,
      departmentNames: dIds.map(id => ministriesById.get(id) || id),
      skills,
      availabilityDays,
      historicalShiftsCount: histCount,
      engagementScore: eng,
      backgroundCheckCleared: safety ? safety.backgroundCheckStatus === 'CLEARED' : true,
      blockouts: [
        ...(linkedPerson?.id ? blockoutsByPerson.get(linkedPerson.id) || [] : []),
        ...(blockoutsByPerson.get(m.userId) || []),
        ...(blockoutsByPerson.get(normName(m.displayName)) || []),
      ],
    };
    register(prof);
  }

  // 2. Include any ChmsPerson not already represented in OrgMemberships
  for (const p of people) {
    if (p.archived) continue;
    if ((p.linkedUid && byUid.has(p.linkedUid)) || (p.provisionedUid && byUid.has(p.provisionedUid)) || byPersonId.has(p.id)) {
      continue;
    }
    const personKey = p.linkedUid || p.provisionedUid || p.id;
    const dIds = p.ministryIds || [];
    const safety = safetyByPerson.get(p.id);
    const rKeys = (p.tags || []).some(t => /instructor|teacher|catechist/i.test(t))
      ? ['INSTRUCTOR', 'DEPARTMENT_VOLUNTEER']
      : (p.tags || []).some(t => /volunteer/i.test(t))
      ? ['DEPARTMENT_VOLUNTEER', 'MEMBER']
      : ['MEMBER'];
    const availRaw = p.custom?.availability || '';
    const prof: UnifiedPersonProfile = {
      personKey,
      uid: p.linkedUid || p.provisionedUid,
      personId: p.id,
      name: fullName(p),
      emailLower: normEmail(p.email),
      photoUrl: p.photoUrl,
      roleKeys: rKeys,
      roleLabels: rKeys.map(k => getElevateRole(k)?.label || k),
      departmentIds: dIds,
      departmentNames: dIds.map(id => ministriesById.get(id) || id),
      skills: Array.from(new Set([...(p.skills || []), ...(p.tags || []), ...(safety?.roleSkills || [])])),
      availabilityDays: availRaw ? availRaw.split(',').map(x => x.trim()).filter(Boolean) : ['Sun', 'Wed'],
      historicalShiftsCount: shiftCounts.get(p.id) || 0,
      engagementScore: engagementScore(p, attendance, { servedRecently: dIds.length > 0 }).score,
      backgroundCheckCleared: safety ? safety.backgroundCheckStatus === 'CLEARED' : true,
      blockouts: [
        ...(blockoutsByPerson.get(p.id) || []),
        ...(blockoutsByPerson.get(normName(fullName(p))) || []),
      ],
    };
    register(prof);
  }

  const resolveKey = (ref: { uid?: string; personId?: string; email?: string; name?: string }): string => {
    if (ref.uid && byUid.has(ref.uid)) return byUid.get(ref.uid)!.personKey;
    if (ref.personId && byPersonId.has(ref.personId)) return byPersonId.get(ref.personId)!.personKey;
    if (ref.email && byEmail.has(normEmail(ref.email))) return byEmail.get(normEmail(ref.email))!.personKey;
    if (ref.name && byName.has(normName(ref.name))) return byName.get(normName(ref.name))!.personKey;
    return ref.uid || ref.personId || normEmail(ref.email) || `name:${normName(ref.name)}`;
  };

  return {
    list: Array.from(byKey.values()),
    resolveKey,
    byKey,
  };
}

// ── CRUD for Direct Centralized Org Calendar Events (`org_calendar_events`) ──

export const newOrgCalendarEventId = () =>
  `orgcal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export async function fetchDirectOrgCalendarEvents(orgId: string): Promise<OrgCalendarEvent[]> {
  try {
    const snap = await getDocs(
      query(collection(db, ORG_CAL_COLLECTION), where('orgId', '==', orgId), limit(500)),
    );
    return snap.docs.map(d => ({ ...(d.data() as OrgCalendarEvent), id: d.id }));
  } catch {
    return [];
  }
}

export async function saveOrgCalendarEvent(ev: OrgCalendarEvent): Promise<OrgCalendarEvent> {
  const id = ev.id || newOrgCalendarEventId();
  const now = Date.now();
  const participantKeys = Array.from(new Set((ev.participants || []).map(p => p.personKey).filter(Boolean)));
  const participantUids = Array.from(new Set((ev.participants || []).map(p => p.uid).filter(Boolean) as string[]));
  const meta = CATEGORY_META[ev.eventCategory || 'DEPARTMENT_MEETING'];
  const docData: OrgCalendarEvent = clean({
    ...ev,
    id,
    tz: ev.tz || localZone(),
    layer: ev.layer || meta.layer,
    source: 'platform',
    kindLabel: ev.kindLabel || `${meta.label}${ev.ministryName ? ` · ${ev.ministryName}` : ''}`,
    participantKeys,
    participantUids,
    createdAt: ev.createdAt || now,
    updatedAt: now,
  }) as OrgCalendarEvent;

  await setDoc(doc(db, ORG_CAL_COLLECTION, id), docData, { merge: true });
  invalidatePlatformFeed();
  return docData;
}

export async function deleteOrgCalendarEvent(eventId: string): Promise<void> {
  await deleteDoc(doc(db, ORG_CAL_COLLECTION, eventId));
  invalidatePlatformFeed();
}

/** Quick-add a sentence directly into the Organization Central Calendar using Postman's `parseQuickAdd`. */
export async function quickAddOrgCalendarEvent(
  org: Organization,
  sentence: string,
  opts?: {
    ministryId?: string;
    eventCategory?: OrgEventCategory;
    roomId?: string;
    roomName?: string;
    requiredRoleKey?: string;
    participants?: OrgCalendarParticipant[];
  },
): Promise<OrgCalendarEvent> {
  const parsed = parseQuickAdd(sentence);
  const ministry = (org.ministries || []).find(m => m.id === opts?.ministryId);
  const category = opts?.eventCategory || (ministry && /christian\s*ed|education/i.test(ministry.name) ? 'CHRISTIAN_ED_CLASS' : 'DEPARTMENT_MEETING');
  const meta = CATEGORY_META[category];
  const ev: OrgCalendarEvent = {
    id: newOrgCalendarEventId(),
    orgId: org.id,
    title: parsed.title,
    start: parsed.start,
    end: parsed.end,
    allDay: parsed.allDay,
    recurrence: parsed.recurrence,
    location: opts?.roomName || parsed.location,
    tz: localZone(),
    layer: meta.layer,
    source: 'platform',
    eventCategory: category,
    originSource: 'ORG_CENTRAL_CALENDAR',
    ministryId: ministry?.id,
    ministryName: ministry?.name,
    roomId: opts?.roomId,
    roomName: opts?.roomName || parsed.location,
    requiredRoleKey: opts?.requiredRoleKey || (category === 'CHRISTIAN_ED_CLASS' ? 'INSTRUCTOR' : 'DEPARTMENT_VOLUNTEER'),
    participants: opts?.participants || [],
    participantKeys: (opts?.participants || []).map(p => p.personKey),
    participantUids: (opts?.participants || []).map(p => p.uid).filter(Boolean) as string[],
    byUid: auth.currentUser?.uid,
    byName: org.name,
  };
  return saveOrgCalendarEvent(ev);
}

// ── Full Org Point-of-Truth Feed Aggregation ──────────────────────────────────

export interface OrgCentralCalendarSnapshot {
  events: OrgCalendarEvent[];
  directory: ReturnType<typeof buildUnifiedPersonDirectory>;
  programs: ChurchProgram[];
  shifts: ChmsShift[];
  compoundBundle: ElevateCompoundBundle;
}

export async function loadOrgCentralCalendarSnapshot(org: Organization): Promise<OrgCentralCalendarSnapshot> {
  const [directEvents, members, people, attendance, shifts, programs] = await Promise.all([
    fetchDirectOrgCalendarEvents(org.id),
    fetchOrgMembers(org.id).catch(() => [] as OrgMembership[]),
    fetchPeople(org.id).catch(() => [] as ChmsPerson[]),
    fetchAttendance(org.id).catch(() => [] as ChmsAttendance[]),
    fetchShifts(org.id).catch(() => [] as ChmsShift[]),
    ensureDefaultTemplatedClassrooms(org).catch(() => [] as ChurchProgram[]),
  ]);
  const compoundBundle = loadCompoundBundle(org);
  const mobilizeBundle = loadElevateMobilizeBundleLocal(org);
  const directory = buildUnifiedPersonDirectory(org, members, people, attendance, shifts, compoundBundle);

  const ministriesById = new Map((org.ministries || []).map(m => [m.id, m.name]));
  const christianEdMinistry = (org.ministries || []).find(m => /christian\s*ed|education|sunday\s*school/i.test(m.name));
  const allEvents: OrgCalendarEvent[] = [...directEvents];

  // 1. Christian Education Classrooms (`churchPrograms`)
  const christianEdTeam = directory.list.filter(
    p =>
      (christianEdMinistry && p.departmentIds.includes(christianEdMinistry.id)) ||
      p.roleKeys.includes('INSTRUCTOR'),
  );
  for (const prog of programs) {
    const sched = parseScheduleString(prog.meetingSchedule);
    const participants: OrgCalendarParticipant[] = [];
    if (prog.leadInstructor) {
      const k = directory.resolveKey({ name: prog.leadInstructor });
      const known = directory.byKey.get(k);
      participants.push({
        personKey: k,
        uid: known?.uid,
        personId: known?.personId,
        name: known?.name || prog.leadInstructor,
        email: known?.emailLower,
        roleKey: 'INSTRUCTOR',
        roleLabel: 'Lead Instructor (Non-Credentialed)',
        ministryId: christianEdMinistry?.id,
        status: 'CONFIRMED',
      });
    }
    // Also attach explicitly assigned class instructors/volunteers stored on the program or Christian Ed roster
    const extraInstructors: Array<{ uid?: string; personId?: string; name: string; roleKey?: string }> =
      (prog as any).assignedTeam || [];
    for (const inst of extraInstructors) {
      const k = directory.resolveKey(inst);
      if (participants.some(p => p.personKey === k)) continue;
      const known = directory.byKey.get(k);
      const rk = inst.roleKey || 'INSTRUCTOR';
      participants.push({
        personKey: k,
        uid: known?.uid || inst.uid,
        personId: known?.personId || inst.personId,
        name: known?.name || inst.name,
        email: known?.emailLower,
        roleKey: rk,
        roleLabel: getElevateRole(rk)?.label || rk,
        ministryId: christianEdMinistry?.id,
        status: 'CONFIRMED',
      });
    }
    // If no instructors were explicitly set on a real church's first class, attach Christian Ed instructors
    if (participants.length === 0 && christianEdTeam.length > 0 && prog === programs[0]) {
      for (const member of christianEdTeam.slice(0, 3)) {
        const rk = member.roleKeys.includes('INSTRUCTOR')
          ? 'INSTRUCTOR'
          : member.roleKeys.includes('DEPARTMENT_HEAD')
          ? 'DEPARTMENT_HEAD'
          : member.roleKeys.includes('DEPARTMENT_ADMIN')
          ? 'DEPARTMENT_ADMIN'
          : 'DEPARTMENT_VOLUNTEER';
        participants.push({
          personKey: member.personKey,
          uid: member.uid,
          personId: member.personId,
          name: member.name,
          email: member.emailLower,
          roleKey: rk,
          roleLabel: getElevateRole(rk)?.label || rk,
          ministryId: christianEdMinistry?.id,
          status: 'CONFIRMED',
        });
      }
    }

    allEvents.push({
      id: `ce_prog_${prog.id}`,
      orgId: org.id,
      title: prog.name,
      start: sched.start,
      end: sched.end,
      allDay: false,
      recurrence: sched.recurrence,
      location: sched.location || 'Christian Education Classroom',
      tz: localZone(),
      layer: 'learning',
      source: 'platform',
      kindLabel: `Christian Ed · ${prog.ageBand}`,
      eventCategory: 'CHRISTIAN_ED_CLASS',
      originSource: 'CHRISTIAN_EDUCATION',
      originId: prog.id,
      ministryId: christianEdMinistry?.id,
      ministryName: christianEdMinistry?.name || 'Christian Education',
      roomName: sched.location,
      requiredRoleKey: 'INSTRUCTOR',
      requiredSkills: ['Christian Education', 'Instructor', 'Teaching'],
      requiresBackgroundCheck: /children|youth|kid|ages\s*[0-9]/i.test(prog.ageBand),
      participants,
      participantKeys: participants.map(p => p.personKey),
      participantUids: participants.map(p => p.uid).filter(Boolean) as string[],
    });
  }

  // 2. ChMS Volunteer Shifts (`chmsShifts`)
  for (const sh of shifts) {
    const { start, end } = parseDateAndTime(sh.date, sh.time, 105);
    const minName = sh.ministryId ? ministriesById.get(sh.ministryId) : undefined;
    const participants: OrgCalendarParticipant[] = (sh.assignments || [])
      .filter(a => a.status !== 'DECLINED')
      .map(a => {
        const pos = sh.positions.find(p => p.id === a.positionId);
        const k = directory.resolveKey({ uid: a.uid, personId: a.personId, name: a.personName });
        const known = directory.byKey.get(k);
        return {
          personKey: k,
          uid: a.uid || known?.uid,
          personId: a.personId || known?.personId,
          name: a.personName || known?.name || 'Volunteer',
          email: known?.emailLower,
          roleKey: 'DEPARTMENT_VOLUNTEER',
          roleLabel: pos?.name || 'Department Volunteer',
          positionId: a.positionId,
          positionTitle: pos?.name,
          ministryId: sh.ministryId,
          status: a.swapRequested ? 'SUB_REQUESTED' : a.status,
        };
      });
    const reqSkills = Array.from(new Set(sh.positions.map(p => p.skill).filter(Boolean) as string[]));
    allEvents.push({
      id: `chms_shift_${sh.id}`,
      orgId: org.id,
      title: sh.title,
      start,
      end,
      allDay: false,
      recurrence: 'none',
      tz: localZone(),
      layer: 'events',
      source: 'platform',
      kindLabel: `Volunteer Schedule${minName ? ` · ${minName}` : ''}`,
      eventCategory: 'VOLUNTEER_SHIFT',
      originSource: 'CHMS_VOLUNTEER_SHIFT',
      originId: sh.id,
      ministryId: sh.ministryId,
      ministryName: minName,
      requiredRoleKey: 'DEPARTMENT_VOLUNTEER',
      requiredSkills: reqSkills,
      participants,
      participantKeys: participants.map(p => p.personKey),
      participantUids: participants.map(p => p.uid).filter(Boolean) as string[],
    });
  }

  // 3. Action & Mobilize Shift Drives (`ElevateMobilizeBundle.shiftDrives`)
  for (const drive of mobilizeBundle.shiftDrives || []) {
    for (const slot of drive.slots || []) {
      const { start, end } = parseDateAndTime(slot.dateISO, slot.startTime, (slot.durationHours || 2) * 60);
      const signups = (mobilizeBundle.shiftSignups || []).filter(su => su.slotId === slot.id && su.status !== 'CANCELLED');
      const participants: OrgCalendarParticipant[] = signups.map(su => {
        const suUid = (su as any).userId || (su as any).uid || (su as any).volunteerUid;
        const k = directory.resolveKey({ uid: suUid, email: su.userEmail, name: su.userName });
        const known = directory.byKey.get(k);
        const stStr = String(su.status || '');
        return {
          personKey: k,
          uid: suUid || known?.uid,
          personId: known?.personId,
          name: su.userName || known?.name || 'Volunteer',
          email: su.userEmail || known?.emailLower,
          roleKey: 'DEPARTMENT_VOLUNTEER',
          roleLabel: slot.roleTitle,
          positionId: slot.id,
          positionTitle: slot.roleTitle,
          status: stStr === 'CONFIRMED' || stStr === 'CONFIRMED_24H' || stStr === 'CHECKED_IN' ? 'CONFIRMED' : 'PENDING',
        };
      });
      allEvents.push({
        id: `mob_slot_${drive.id}_${slot.id}`,
        orgId: org.id,
        title: `${drive.title} — ${slot.roleTitle}`,
        start,
        end,
        allDay: false,
        recurrence: 'none',
        location: slot.locationLabel,
        tz: localZone(),
        layer: 'events',
        source: 'platform',
        kindLabel: `Mobilize Shift · ${(drive as any).department || 'Outreach'}`,
        eventCategory: 'VOLUNTEER_SHIFT',
        originSource: 'MOBILIZE_SHIFT_DRIVE',
        originId: slot.id,
        ministryName: (drive as any).department,
        roomName: slot.locationLabel,
        requiredRoleKey: 'DEPARTMENT_VOLUNTEER',
        requiredSkills: (slot as any).requiredSkills || [],
        participants,
        participantKeys: participants.map(p => p.personKey),
        participantUids: participants.map(p => p.uid).filter(Boolean) as string[],
      });
    }
  }

  // 4. Facilities & Room Reservations + Matrix Schedules (`ElevateCompoundBundle`)
  const roomsById = new Map((compoundBundle.rooms || []).map(r => [r.id, r.name]));
  for (const resv of compoundBundle.reservations || []) {
    const startMins = parseClockMinutes(resv.startTime) ?? 9 * 60;
    const endMins = parseClockMinutes(resv.endTime) ?? 11 * 60;
    const dur = Math.max(30, endMins - startMins);
    const { start, end } = parseDateAndTime(resv.dateISO, resv.startTime, dur);
    const roomName = roomsById.get(resv.roomId) || resv.roomId;
    allEvents.push({
      id: `fac_resv_${resv.id}`,
      orgId: org.id,
      title: resv.title,
      start,
      end,
      allDay: false,
      recurrence: 'none',
      location: roomName,
      tz: localZone(),
      layer: 'events',
      source: 'platform',
      kindLabel: `Room Booking · ${resv.departmentName}`,
      eventCategory: 'FACILITY_BOOKING',
      originSource: 'FACILITY_RESERVATION',
      originId: resv.id,
      ministryName: resv.departmentName,
      roomId: resv.roomId,
      roomName,
      setupMins: resv.setupMins,
      teardownMins: resv.teardownMins,
      participants: [],
      participantKeys: [],
      participantUids: [],
    });
  }

  for (const mSlot of compoundBundle.matrixSlots || []) {
    for (const [dateISO, assign] of Object.entries(mSlot.assignmentsByDate || {})) {
      if (!assign || assign.status === 'DECLINED') continue;
      const { start, end } = parseDateAndTime(dateISO, '09:00', 105);
      const k = directory.resolveKey({ personId: assign.personId, name: assign.personName });
      const known = directory.byKey.get(k);
      const participant: OrgCalendarParticipant = {
        personKey: k,
        uid: known?.uid,
        personId: assign.personId || known?.personId,
        name: assign.personName,
        email: known?.emailLower,
        roleKey: 'DEPARTMENT_VOLUNTEER',
        roleLabel: `${mSlot.teamName} · ${mSlot.positionTitle}`,
        positionId: mSlot.id,
        positionTitle: mSlot.positionTitle,
        status: assign.status,
      };
      allEvents.push({
        id: `mtx_${mSlot.id}_${dateISO}`,
        orgId: org.id,
        title: `${mSlot.teamName}: ${mSlot.positionTitle}`,
        start,
        end,
        allDay: false,
        recurrence: 'none',
        tz: localZone(),
        layer: 'worship',
        source: 'platform',
        kindLabel: `Service Matrix · ${mSlot.teamName}`,
        eventCategory: 'VOLUNTEER_SHIFT',
        originSource: 'MATRIX_SCHEDULE',
        originId: `${mSlot.id}:${dateISO}`,
        ministryName: mSlot.teamName,
        requiredRoleKey: 'DEPARTMENT_VOLUNTEER',
        requiredSkills: mSlot.requiredSkill ? [mSlot.requiredSkill] : [],
        requiresBackgroundCheck: mSlot.requiresBackgroundCheck,
        participants: [participant],
        participantKeys: [k],
        participantUids: known?.uid ? [known.uid] : [],
      });
    }
  }

  // 5. Organization Weekly Service Times (`org.serviceTimes`)
  const now = new Date();
  for (const st of org.serviceTimes || []) {
    const wd = WEEKDAY_MAP[String(st.day || '').toLowerCase()];
    const mins = parseClockMinutes(st.time);
    if (wd === undefined || mins === null) continue;
    const base = startOfDay(now);
    const first = addDays(base, (wd - base.getDay() + 7) % 7);
    first.setMinutes(mins);
    const start = first.getTime();
    allEvents.push({
      id: `org_svc_${org.id}_${st.id || wd}_${mins}`,
      orgId: org.id,
      title: `${st.label || 'Worship Service'}${(st as any).campusName ? ` (${(st as any).campusName})` : ''}`,
      start,
      end: start + 90 * MIN,
      allDay: false,
      recurrence: 'weekly',
      location: (st as any).campusName || org.location?.address || org.location?.city,
      tz: localZone(),
      layer: 'worship',
      source: 'platform',
      kindLabel: 'Weekly Worship Service',
      eventCategory: 'WORSHIP_SERVICE',
      originSource: 'SERVICE_TIMES',
      participants: [],
      participantKeys: [],
      participantUids: [],
    });
  }

  return {
    events: allEvents,
    directory,
    programs,
    shifts,
    compoundBundle,
  };
}

// ── Weighted Substitute Suggestion Engine ─────────────────────────────────────

export function rankSubstituteCandidates(
  targetEvent: ExpandedOrgEvent,
  snapshot: OrgCentralCalendarSnapshot,
  allExpandedOccurrences: ExpandedOrgEvent[],
  excludePersonKeys: string[] = [],
): SubstituteSuggestion[] {
  const excluded = new Set([
    ...excludePersonKeys,
    ...(targetEvent.participants || []).map(p => p.personKey),
  ]);
  const eventDate = new Date(targetEvent.start);
  const dateISO = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
  const dow = DOW_SHORT[eventDate.getDay()];

  // Find everyone who is already booked during [targetEvent.start, targetEvent.end]
  const busyAtSameTime = new Set<string>();
  const sameDayCount = new Map<string, number>();

  for (const occ of allExpandedOccurrences) {
    if (occ.id === targetEvent.id && occ.occurrenceStart === targetEvent.occurrenceStart) continue;
    const occDate = new Date(occ.start);
    const occDateISO = `${occDate.getFullYear()}-${String(occDate.getMonth() + 1).padStart(2, '0')}-${String(occDate.getDate()).padStart(2, '0')}`;
    const overlapsTime = !occ.allDay && occ.start < targetEvent.end && targetEvent.start < occ.end;

    for (const part of occ.participants || []) {
      if (part.status === 'DECLINED') continue;
      if (overlapsTime) busyAtSameTime.add(part.personKey);
      if (occDateISO === dateISO) {
        sameDayCount.set(part.personKey, (sameDayCount.get(part.personKey) || 0) + 1);
      }
    }
  }

  const reqRole = targetEvent.requiredRoleKey || (targetEvent.eventCategory === 'CHRISTIAN_ED_CLASS' ? 'INSTRUCTOR' : 'DEPARTMENT_VOLUNTEER');
  const reqSkills = (targetEvent.requiredSkills || []).map(s => s.toLowerCase());

  const suggestions: SubstituteSuggestion[] = [];

  for (const candidate of snapshot.directory.list) {
    if (excluded.has(candidate.personKey)) continue;
    // Hard gate 1: Never suggest someone who is already booked in an overlapping event!
    if (busyAtSameTime.has(candidate.personKey)) continue;
    // Hard gate 2: Never suggest someone who has an active blockout covering this date
    const onBlockout = candidate.blockouts.some(b => dateISO >= b.startISO && dateISO <= b.endISO);
    if (onBlockout) continue;
    // Hard gate 3: If background check is required, require CLEARED status
    if (targetEvent.requiresBackgroundCheck && !candidate.backgroundCheckCleared) continue;

    const reasons: string[] = [];

    // 1. Availability Score (max 35)
    let availabilityScore = 20; // Free during exact time window
    reasons.push(`Free ${fmtTime(targetEvent.start)}–${fmtTime(targetEvent.end)}`);
    if (candidate.availabilityDays.some(d => d.toLowerCase().startsWith(dow.toLowerCase()))) {
      availabilityScore += 10;
      reasons.push(`Available ${dow}s`);
    }
    const dayLoad = sameDayCount.get(candidate.personKey) || 0;
    if (dayLoad === 0) {
      availabilityScore += 5;
    } else {
      reasons.push(`${dayLoad} other commitment(s) that day`);
    }

    // 2. Department & Multi-Role Score (max 30)
    let roleDeptScore = 0;
    const inTargetDept =
      (targetEvent.ministryId && candidate.departmentIds.includes(targetEvent.ministryId)) ||
      (targetEvent.ministryName &&
        candidate.departmentNames.some(dn => dn.toLowerCase() === targetEvent.ministryName!.toLowerCase()));
    if (inTargetDept) {
      roleDeptScore += 16;
      reasons.push(`In ${targetEvent.ministryName || 'Department'}`);
    }
    if (candidate.roleKeys.includes(reqRole)) {
      roleDeptScore += 14;
      reasons.push(`Role: ${getElevateRole(reqRole)?.label || reqRole}`);
    } else if (
      reqRole === 'INSTRUCTOR' &&
      (candidate.roleKeys.includes('DEPARTMENT_HEAD') ||
        candidate.roleKeys.includes('DEPARTMENT_ADMIN') ||
        candidate.roleKeys.includes('PASTOR'))
    ) {
      roleDeptScore += 11;
      reasons.push('Department Leader / Facilitator');
    } else if (
      candidate.roleKeys.includes('DEPARTMENT_VOLUNTEER') ||
      candidate.roleKeys.includes('VOLUNTEER')
    ) {
      roleDeptScore += 8;
      reasons.push('Active Volunteer');
    }

    // 3. Experience, Skills & ChMS Engagement Score (max 25)
    let experienceSkillScore = 0;
    const candSkillsLower = candidate.skills.map(s => s.toLowerCase());
    const matchedSkills = reqSkills.filter(rs => candSkillsLower.some(cs => cs.includes(rs) || rs.includes(cs)));
    if (matchedSkills.length > 0) {
      experienceSkillScore += Math.min(13, matchedSkills.length * 7);
      reasons.push(`Skills: ${matchedSkills.slice(0, 2).join(', ')}`);
    } else if (inTargetDept && candidate.skills.length > 0) {
      experienceSkillScore += 6;
    }
    const shiftBonus = Math.min(6, candidate.historicalShiftsCount * 2);
    experienceSkillScore += shiftBonus;
    if (candidate.historicalShiftsCount > 0) {
      reasons.push(`${candidate.historicalShiftsCount} prior shift(s)`);
    }
    const engBonus = Math.round((candidate.engagementScore / 100) * 6);
    experienceSkillScore += engBonus;

    // 4. Safety & Clearance Score (max 10)
    const safetyScore = candidate.backgroundCheckCleared ? 10 : 4;
    if (targetEvent.requiresBackgroundCheck && candidate.backgroundCheckCleared) {
      reasons.push('Safety cleared');
    }

    const totalScore = Math.min(
      100,
      availabilityScore + roleDeptScore + experienceSkillScore + safetyScore,
    );

    suggestions.push({
      personKey: candidate.personKey,
      uid: candidate.uid,
      personId: candidate.personId,
      name: candidate.name,
      email: candidate.emailLower,
      photoUrl: candidate.photoUrl,
      roleKeys: candidate.roleKeys,
      roleLabels: candidate.roleLabels,
      departmentIds: candidate.departmentIds,
      departmentNames: candidate.departmentNames,
      skills: candidate.skills,
      totalScore,
      breakdown: {
        availabilityScore,
        roleDeptScore,
        experienceSkillScore,
        safetyScore,
      },
      reasons,
    });
  }

  return suggestions.sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name));
}

// ── Intelligent Org-Wide Timing Conflict Detector ─────────────────────────────

export function detectOrgCalendarConflicts(
  snapshot: OrgCentralCalendarSnapshot,
  from: number,
  to: number,
): {
  occurrences: ExpandedOrgEvent[];
  conflicts: OrgCalendarConflict[];
  conflictsByOccurrenceKey: Map<string, OrgCalendarConflict[]>;
} {
  const occurrences: ExpandedOrgEvent[] = snapshot.events
    .flatMap(ev => expandOccurrences(ev, from, to))
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));

  const conflicts: OrgCalendarConflict[] = [];
  const seenConflictIds = new Set<string>();
  const conflictsByOccurrenceKey = new Map<string, OrgCalendarConflict[]>();

  const registerConflict = (c: OrgCalendarConflict) => {
    if (seenConflictIds.has(c.id)) return;
    seenConflictIds.add(c.id);
    conflicts.push(c);
    const keyA = `${c.eventA.id}@${c.eventA.occurrenceStart}`;
    conflictsByOccurrenceKey.set(keyA, [...(conflictsByOccurrenceKey.get(keyA) || []), c]);
    if (c.eventB) {
      const keyB = `${c.eventB.id}@${c.eventB.occurrenceStart}`;
      conflictsByOccurrenceKey.set(keyB, [...(conflictsByOccurrenceKey.get(keyB) || []), c]);
    }
  };

  // 1. Person Double-Booking & Overlap Detection across all timed events
  const timed = occurrences.filter(o => !o.allDay);
  for (let i = 0; i < timed.length; i++) {
    const a = timed[i];
    const aDate = new Date(a.start);
    const aDateISO = `${aDate.getFullYear()}-${String(aDate.getMonth() + 1).padStart(2, '0')}-${String(aDate.getDate()).padStart(2, '0')}`;

    // Check blockout clashes on event `a`
    for (const part of a.participants || []) {
      if (part.status === 'DECLINED') continue;
      const prof = snapshot.directory.byKey.get(part.personKey);
      const activeBlockout = prof?.blockouts.find(b => aDateISO >= b.startISO && aDateISO <= b.endISO);
      if (activeBlockout || part.status === 'SUB_REQUESTED') {
        const cid = `blockout__${part.personKey}__${a.id}@${a.occurrenceStart}`;
        const subsA = rankSubstituteCandidates(a, snapshot, occurrences, [part.personKey]).slice(0, 6);
        registerConflict({
          id: cid,
          kind: 'PERSON_BLOCKOUT_CLASH',
          severity: 'WARNING',
          dateKey: aDateISO,
          overlapStart: a.start,
          overlapEnd: a.end,
          overlapLabel: fmtRange(a.start, a.end),
          personKey: part.personKey,
          personUid: part.uid || prof?.uid,
          personId: part.personId || prof?.personId,
          personName: part.name || prof?.name || 'Member',
          personRoles: prof?.roleLabels || [part.roleLabel],
          personDepartments: prof?.departmentNames || (a.ministryName ? [a.ministryName] : []),
          eventA: a,
          blockoutReason: activeBlockout?.reason || 'Volunteer requested a swap / sub',
          summary: `${part.name} is scheduled for "${a.title}" on ${aDateISO} during an active blockout or swap request (${activeBlockout?.reason || 'Sub requested'}).`,
          substitutesForEventA: subsA,
          substitutesForEventB: [],
        });
      }
    }

    // Check pairwise overlaps with subsequent events `b`
    for (let j = i + 1; j < timed.length && timed[j].start < a.end; j++) {
      const b = timed[j];
      if (a.id === b.id) continue;
      const overlapStart = Math.max(a.start, b.start);
      const overlapEnd = Math.min(a.end, b.end);
      if (overlapStart >= overlapEnd) continue;

      // 1a. Check shared participants between `a` and `b`
      for (const partA of a.participants || []) {
        if (partA.status === 'DECLINED') continue;
        const partB = (b.participants || []).find(
          pb =>
            pb.status !== 'DECLINED' &&
            (pb.personKey === partA.personKey ||
              (pb.uid && pb.uid === partA.uid) ||
              (pb.personId && pb.personId === partA.personId) ||
              normName(pb.name) === normName(partA.name)),
        );
        if (!partB) continue;

        const prof = snapshot.directory.byKey.get(partA.personKey);
        const cid = `dbl__${partA.personKey}__${a.id}@${a.occurrenceStart}__${b.id}@${b.occurrenceStart}`;
        const subsA = rankSubstituteCandidates(a, snapshot, occurrences, [partA.personKey]).slice(0, 5);
        const subsB = rankSubstituteCandidates(b, snapshot, occurrences, [partA.personKey]).slice(0, 5);

        registerConflict({
          id: cid,
          kind: 'PERSON_DOUBLE_BOOKED',
          severity: 'CRITICAL',
          dateKey: aDateISO,
          overlapStart,
          overlapEnd,
          overlapLabel: `${fmtTime(overlapStart)} – ${fmtTime(overlapEnd)}`,
          personKey: partA.personKey,
          personUid: partA.uid || prof?.uid,
          personId: partA.personId || prof?.personId,
          personName: partA.name || prof?.name || 'Member',
          personRoles: prof?.roleLabels || [partA.roleLabel, partB.roleLabel],
          personDepartments: prof?.departmentNames || [a.ministryName, b.ministryName].filter(Boolean) as string[],
          eventA: a,
          eventB: b,
          summary: `${partA.name} is double-booked between "${a.title}" (${partA.roleLabel}) and "${b.title}" (${partB.roleLabel}) from ${fmtTime(overlapStart)} to ${fmtTime(overlapEnd)}.`,
          substitutesForEventA: subsA,
          substitutesForEventB: subsB,
        });
      }

      // 1b. Check room/facility clash between `a` and `b`
      const sameRoom =
        (a.roomId && b.roomId && a.roomId === b.roomId) ||
        (a.roomName && b.roomName && normName(a.roomName) === normName(b.roomName));
      if (sameRoom && a.originSource !== 'SERVICE_TIMES' && b.originSource !== 'SERVICE_TIMES') {
        const roomLabel = a.roomName || b.roomName || a.roomId || 'Room';
        const cid = `room__${normName(roomLabel)}__${a.id}@${a.occurrenceStart}__${b.id}@${b.occurrenceStart}`;
        registerConflict({
          id: cid,
          kind: 'ROOM_FACILITY_CLASH',
          severity: 'WARNING',
          dateKey: aDateISO,
          overlapStart,
          overlapEnd,
          overlapLabel: `${fmtTime(overlapStart)} – ${fmtTime(overlapEnd)}`,
          roomId: a.roomId || b.roomId,
          roomName: roomLabel,
          eventA: a,
          eventB: b,
          summary: `Room "${roomLabel}" is double-booked by "${a.title}" and "${b.title}" (${fmtTime(overlapStart)} – ${fmtTime(overlapEnd)}).`,
          substitutesForEventA: [],
          substitutesForEventB: [],
        });
      }
    }
  }

  return {
    occurrences,
    conflicts: conflicts.sort((a, b) => a.overlapStart - b.overlapStart),
    conflictsByOccurrenceKey,
  };
}

// ── 1-Click Substitute Assignment & Conflict Resolution ───────────────────────

export async function assignSubstituteToOrgEvent(
  org: Organization,
  targetEvent: ExpandedOrgEvent,
  replacedPersonKey: string | undefined,
  substitute: SubstituteSuggestion,
  snapshot: OrgCentralCalendarSnapshot,
): Promise<void> {
  const newParticipant: OrgCalendarParticipant = {
    personKey: substitute.personKey,
    uid: substitute.uid,
    personId: substitute.personId,
    name: substitute.name,
    email: substitute.email,
    roleKey: targetEvent.requiredRoleKey || (targetEvent.eventCategory === 'CHRISTIAN_ED_CLASS' ? 'INSTRUCTOR' : 'DEPARTMENT_VOLUNTEER'),
    roleLabel: getElevateRole(targetEvent.requiredRoleKey || 'INSTRUCTOR')?.label || 'Substitute',
    ministryId: targetEvent.ministryId,
    status: 'CONFIRMED',
  };

  if (targetEvent.originSource === 'ORG_CENTRAL_CALENDAR') {
    const filtered = (targetEvent.participants || []).filter(p => p.personKey !== replacedPersonKey);
    await saveOrgCalendarEvent({
      ...targetEvent,
      participants: [...filtered, newParticipant],
      participantKeys: [...filtered.map(p => p.personKey), newParticipant.personKey],
      participantUids: [...filtered.map(p => p.uid).filter(Boolean) as string[], ...(newParticipant.uid ? [newParticipant.uid] : [])],
    });
    return;
  }

  if (targetEvent.originSource === 'CHMS_VOLUNTEER_SHIFT' && targetEvent.originId) {
    const shift = snapshot.shifts.find(s => s.id === targetEvent.originId);
    if (shift) {
      const oldAssignment = shift.assignments.find(a => {
        const k = snapshot.directory.resolveKey({ uid: a.uid, personId: a.personId, name: a.personName });
        return k === replacedPersonKey;
      });
      const positionId = oldAssignment?.positionId || shift.positions[0]?.id || 'pos_default';
      const remaining = shift.assignments.filter(a => a !== oldAssignment);
      await saveShift(org.id, {
        ...shift,
        assignments: [
          ...remaining,
          {
            positionId,
            personId: substitute.personId || substitute.personKey,
            personName: substitute.name,
            uid: substitute.uid,
            status: 'CONFIRMED',
          },
        ],
      });
      return;
    }
  }

  if (targetEvent.originSource === 'CHRISTIAN_EDUCATION' && targetEvent.originId) {
    const prog = snapshot.programs.find(p => p.id === targetEvent.originId);
    if (prog) {
      const existingTeam: Array<{ uid?: string; personId?: string; name: string; roleKey?: string }> =
        (prog as any).assignedTeam || [];
      const filteredTeam = existingTeam.filter(
        t => snapshot.directory.resolveKey(t) !== replacedPersonKey,
      );
      const nextLead =
        prog.leadInstructor && snapshot.directory.resolveKey({ name: prog.leadInstructor }) === replacedPersonKey
          ? substitute.name
          : prog.leadInstructor || substitute.name;
      await saveProgram({
        ...prog,
        leadInstructor: nextLead,
        assignedTeam: [
          ...filteredTeam,
          {
            uid: substitute.uid,
            personId: substitute.personId,
            name: substitute.name,
            roleKey: substitute.roleKeys.includes('INSTRUCTOR') ? 'INSTRUCTOR' : 'DEPARTMENT_VOLUNTEER',
          },
        ],
      } as ChurchProgram);
      return;
    }
  }

  // Fallback for any other source: create/override a central calendar event record
  const filtered = (targetEvent.participants || []).filter(p => p.personKey !== replacedPersonKey);
  await saveOrgCalendarEvent({
    ...targetEvent,
    id: targetEvent.id.startsWith('orgcal_') ? targetEvent.id : `orgcal_${targetEvent.id}`,
    originSource: 'ORG_CENTRAL_CALENDAR',
    participants: [...filtered, newParticipant],
    participantKeys: [...filtered.map(p => p.personKey), newParticipant.personKey],
    participantUids: [...filtered.map(p => p.uid).filter(Boolean) as string[], ...(newParticipant.uid ? [newParticipant.uid] : [])],
  });
}
