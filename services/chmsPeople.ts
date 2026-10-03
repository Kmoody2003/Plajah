// chmsPeople — Elevate ChMS PEOPLE / ATTENDANCE / CARE / COMMS / VOLUNTEERS service layer.
//
// Servant-Keeper parity + extras. All Firestore access is org-scoped (`orgId` field) and gated by firestore.rules
// (chmsPeople / chmsHouseholds / chmsAttendance / chmsNotes + chmsTasks / chmsShifts / chmsMessages / chmsClaims).
// Money never lives here: giving is exposed ONLY as a yes/no flag via getGivingFlags() (null when the caller lacks
// finance read access). Pure helpers (segments, engagement, duplicates, reports) have no I/O and are unit-testable.
//
// Ministry membership: stored as `ChmsPerson.ministryIds` (org.ministries[].id) — additive field in types.ts.
// Volunteer availability: `person.custom.availability` = comma list of weekdays ("Sun,Wed").
import { db, auth } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, writeBatch,
} from 'firebase/firestore';
import type { Organization, OrgMembership, ChmsPerson, ChmsHousehold, ChmsAttendance, ChmsNote, ChmsMemberStatus } from '../types';
import { elevateCan } from './elevateRoles';
import { logOrgAction } from './orgAudit';
import { createNotification } from './backendService';
import { emailBroadcast } from './churchConsoleService';
import { callGemini } from './geminiService';

// ── tiny utils ───────────────────────────────────────────────────────────────
const strip = <T extends Record<string, any>>(o: T): T => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
};
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = 86400000;
const parseISO = (s?: string): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
export const fullName = (p: Pick<ChmsPerson, 'firstName' | 'lastName' | 'preferredName'>) =>
  `${p.preferredName || p.firstName} ${p.lastName}`.trim();
const csvCell = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCSV = (rows: (string | number | undefined | null)[][]) => rows.map(r => r.map(csvCell).join(',')).join('\n');
export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function chunked<T>(items: T[], fn: (b: ReturnType<typeof writeBatch>, item: T) => void) {
  for (let i = 0; i < items.length; i += 400) {
    const b = writeBatch(db);
    items.slice(i, i + 400).forEach(it => fn(b, it));
    await b.commit();
  }
}

// ── Access model ─────────────────────────────────────────────────────────────
export interface PeopleAccess {
  /** MANAGE_ROSTER holders: full read/write incl. minors. */
  staff: boolean;
  /** Pastors/ministers: may read PASTORAL notes. */
  pastoral: boolean;
  /** Finance: directory (non-minor, no notes) read only. */
  financeOnly: boolean;
  /** Leaders without MANAGE_ROSTER see only these ministries' people. null = everyone. */
  ministryScope: string[] | null;
  canSeeAnything: boolean;
}
export function peopleAccess(org: Organization, m: OrgMembership | null): PeopleAccess {
  const staff = elevateCan(m, org, 'MANAGE_ROSTER');
  const finance = elevateCan(m, org, 'MANAGE_GIVING') || elevateCan(m, org, 'VIEW_GIVING');
  const pastoral = elevateCan(m, org, 'VIEW_PRAYER') && (staff || ['SENIOR_PASTOR', 'PASTOR', 'MINISTER'].includes(m?.roleKey || '') || m?.role === 'OWNER' || m?.role === 'ADMIN');
  const led = (org.ministries || []).filter(x => !!m && (x.headUids?.includes(m.userId) || x.leaderId === m.userId)).map(x => x.id);
  (m?.ministryRoles || []).forEach(r => { if (!led.includes(r.ministryId)) led.push(r.ministryId); });
  const leaderOnly = !staff && !finance && led.length > 0;
  return { staff, pastoral, financeOnly: finance && !staff, ministryScope: leaderOnly ? led : null, canSeeAnything: staff || finance || led.length > 0 };
}

// ── Age / privacy ────────────────────────────────────────────────────────────
export function ageOf(p: Pick<ChmsPerson, 'birthDate'>, now = new Date()): number | null {
  const b = parseISO(p.birthDate); if (!b) return null;
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}
export const isMinor = (p: ChmsPerson) => { const a = ageOf(p); return a !== null ? a < 18 : p.householdRole === 'CHILD'; };
export const AGE_BANDS = ['0-2', '3-5', '6-11', '12-17', '18-29', '30-44', '45-64', '65+'] as const;
export function ageBand(p: ChmsPerson): string {
  const a = ageOf(p); if (a === null) return 'Unknown';
  return a <= 2 ? '0-2' : a <= 5 ? '3-5' : a <= 11 ? '6-11' : a <= 17 ? '12-17' : a <= 29 ? '18-29' : a <= 44 ? '30-44' : a <= 64 ? '45-64' : '65+';
}
/** Non-MANAGE_ROSTER viewers get minors with names only (no contact, birthdate, address, photo, custom fields). */
export function redactPerson(p: ChmsPerson, access: PeopleAccess): ChmsPerson {
  if (access.staff || !isMinor(p)) return p;
  return { ...p, email: undefined, phone: undefined, address: undefined, birthDate: undefined, photoUrl: undefined, custom: undefined, linkedUid: undefined };
}
/** People who may appear in a member-facing/printed directory: opted in, adult, active-ish. */
export const directoryPrintable = (p: ChmsPerson) =>
  !p.archived && p.directoryVisible === true && !isMinor(p) && (p.status === 'MEMBER' || p.status === 'REGULAR');
export const auditSensitive = (orgId: string, what: string, p?: ChmsPerson) =>
  logOrgAction(orgId, 'CHMS_VIEW_SENSITIVE', { targetId: p?.id, targetName: p ? fullName(p) : undefined, meta: { what } });

// ── People ───────────────────────────────────────────────────────────────────
export async function fetchPeople(orgId: string, includeArchived = false): Promise<ChmsPerson[]> {
  const snap = await getDocs(query(collection(db, 'chmsPeople'), where('orgId', '==', orgId)));
  const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as ChmsPerson));
  return (includeArchived ? all : all.filter(p => !p.archived && !p.mergedInto))
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));
}
export async function savePerson(orgId: string, p: Partial<ChmsPerson> & { firstName: string; lastName: string }): Promise<ChmsPerson> {
  const now = Date.now();
  const id = p.id || newId('p');
  const status = p.status || 'VISITOR';
  const rec = strip({
    ...p, id, orgId, status,
    statusHistory: p.statusHistory || [{ status, at: now, by: auth.currentUser?.uid }],
    createdAt: p.createdAt || now, updatedAt: now,
  }) as ChmsPerson;
  await setDoc(doc(db, 'chmsPeople', id), rec, { merge: true });
  return rec;
}
export async function changeStatus(p: ChmsPerson, status: ChmsMemberStatus, note?: string): Promise<ChmsPerson> {
  if (p.status === status) return p;
  const hist = [...(p.statusHistory || []), strip({ status, at: Date.now(), by: auth.currentUser?.uid, note })];
  const patch = strip({ status, statusHistory: hist, memberSince: status === 'MEMBER' && !p.memberSince ? todayISO() : p.memberSince, updatedAt: Date.now() });
  await updateDoc(doc(db, 'chmsPeople', p.id), patch);
  return { ...p, ...patch } as ChmsPerson;
}
export const archivePerson = (id: string, archived = true) => updateDoc(doc(db, 'chmsPeople', id), { archived, updatedAt: Date.now() });

/** Bulk edit: set status, add/remove tags, add/remove ministry, archive. */
export interface BulkPatch { status?: ChmsMemberStatus; addTags?: string[]; removeTags?: string[]; addMinistry?: string; removeMinistry?: string; archive?: boolean }
export async function bulkEditPeople(people: ChmsPerson[], patch: BulkPatch): Promise<void> {
  const now = Date.now(); const uid = auth.currentUser?.uid;
  await chunked(people, (b, p) => {
    const next: Record<string, any> = { updatedAt: now };
    if (patch.status && patch.status !== p.status) { next.status = patch.status; next.statusHistory = [...(p.statusHistory || []), { status: patch.status, at: now, by: uid, note: 'Bulk edit' }]; }
    if (patch.addTags || patch.removeTags) next.tags = Array.from(new Set([...(p.tags || []), ...(patch.addTags || [])])).filter(t => !(patch.removeTags || []).includes(t));
    if (patch.addMinistry || patch.removeMinistry) next.ministryIds = Array.from(new Set([...(p.ministryIds || []), ...(patch.addMinistry ? [patch.addMinistry] : [])])).filter(m => m !== patch.removeMinistry);
    if (patch.archive !== undefined) next.archived = patch.archive;
    b.update(doc(db, 'chmsPeople', p.id), next);
  });
}

// ── Households ───────────────────────────────────────────────────────────────
export async function fetchHouseholds(orgId: string): Promise<ChmsHousehold[]> {
  const snap = await getDocs(query(collection(db, 'chmsHouseholds'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ChmsHousehold)).sort((a, b) => a.name.localeCompare(b.name));
}
export async function saveHousehold(orgId: string, h: Partial<ChmsHousehold> & { name: string }): Promise<ChmsHousehold> {
  const id = h.id || newId('hh');
  const rec = strip({ ...h, id, orgId, createdAt: h.createdAt || Date.now() }) as ChmsHousehold;
  await setDoc(doc(db, 'chmsHouseholds', id), rec, { merge: true });
  return rec;
}
export async function moveToHousehold(person: ChmsPerson, householdId: string | null, role?: ChmsPerson['householdRole'], adoptAddress?: ChmsHousehold['address']) {
  const patch: Record<string, any> = { householdId: householdId || null, householdRole: role || null, updatedAt: Date.now() };
  if (adoptAddress) patch.address = adoptAddress;
  await updateDoc(doc(db, 'chmsPeople', person.id), patch);
}
/** Set household address and propagate to every member (shared address). */
export async function setHouseholdAddress(h: ChmsHousehold, members: ChmsPerson[], address: ChmsHousehold['address']) {
  await updateDoc(doc(db, 'chmsHouseholds', h.id), { address: address || null });
  await chunked(members, (b, p) => b.update(doc(db, 'chmsPeople', p.id), { address: address || null, updatedAt: Date.now() }));
}
export const householdMembers = (people: ChmsPerson[], hid: string) => people.filter(p => p.householdId === hid);

/**
 * Household giving link — read via this helper ONLY. Returns the set of personIds with a POSTED gift in the last
 * 12 months, or null when the caller cannot read finance data. Never exposes amounts.
 */
export async function getGivingFlags(orgId: string): Promise<{ people: Set<string>; households: Set<string> } | null> {
  try {
    const snap = await getDocs(query(collection(db, 'chmsContributions'), where('orgId', '==', orgId)));
    const cutoff = todayISO(new Date(Date.now() - 365 * DAY));
    const people = new Set<string>(), households = new Set<string>();
    snap.docs.forEach(d => { const c = d.data() as any; if (c.status === 'POSTED' && (c.date || '') >= cutoff) { if (c.personId) people.add(c.personId); if (c.householdId) households.add(c.householdId); } });
    return { people, households };
  } catch { return null; }
}

// ── Duplicates + merge ───────────────────────────────────────────────────────
export interface DuplicatePair { a: ChmsPerson; b: ChmsPerson; reason: string }
export function findDuplicatePairs(people: ChmsPerson[]): DuplicatePair[] {
  const out: DuplicatePair[] = []; const seen = new Set<string>();
  const add = (a: ChmsPerson, b: ChmsPerson, reason: string) => { const k = [a.id, b.id].sort().join('|'); if (a.id !== b.id && !seen.has(k)) { seen.add(k); out.push({ a, b, reason }); } };
  const buckets = (keyFn: (p: ChmsPerson) => string | null, reason: string) => {
    const m = new Map<string, ChmsPerson[]>();
    people.forEach(p => { const k = keyFn(p); if (k) m.set(k, [...(m.get(k) || []), p]); });
    m.forEach(list => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) add(list[i], list[j], reason); });
  };
  const nm = (p: ChmsPerson) => `${p.firstName}|${p.lastName}`.toLowerCase().replace(/[^a-z|]/g, '');
  buckets(p => p.email ? `e:${p.email.toLowerCase().trim()}` : null, 'Same email — only matters when it is the same person (not a shared family address)');
  buckets(p => p.birthDate && p.firstName ? `nb:${nm(p)}|${p.birthDate}` : null, 'Same name + birth date');
  buckets(p => p.phone && p.phone.replace(/\D/g, '').length >= 7 ? `ph:${nm(p)}|${p.phone.replace(/\D/g, '').slice(-10)}` : null, 'Same name + phone');
  buckets(p => p.firstName && p.lastName ? `n:${nm(p)}` : null, 'Same name');
  const rank = (r: string) => (r.startsWith('Same email') ? 0 : r.includes('birth') ? 1 : r.includes('phone') ? 2 : 3);
  return out.sort((x, y) => rank(x.reason) - rank(y.reason));
}
const MERGE_FIELDS: (keyof ChmsPerson)[] = ['preferredName', 'email', 'phone', 'address', 'birthDate', 'anniversary', 'gender', 'maritalStatus', 'memberSince', 'baptismDate', 'photoUrl', 'householdId', 'householdRole', 'linkedUid'];
export interface MergeResult { merged: ChmsPerson; repointed: Record<string, number>; skipped: string[] }
/**
 * Merge `dropId` into `keepId`: keep's fields win unless `prefer[field]==='drop'` (or keep's is blank); tags, skills,
 * ministries and custom fields are unioned. Repoints attendance, contributions, pledges, notes, tasks and household heads.
 * Collections the caller cannot write (e.g. finance data for non-finance staff) are listed in `skipped`, not failed.
 * The dropped record is archived with `mergedInto` (never hard-deleted).
 */
export async function mergePeople(orgId: string, keepId: string, dropId: string, prefer: Partial<Record<keyof ChmsPerson, 'keep' | 'drop'>> = {}): Promise<MergeResult> {
  if (keepId === dropId) throw new Error('Pick two different people.');
  const [ks, ds] = await Promise.all([getDoc(doc(db, 'chmsPeople', keepId)), getDoc(doc(db, 'chmsPeople', dropId))]);
  if (!ks.exists() || !ds.exists()) throw new Error('Person not found.');
  const keep = { ...ks.data(), id: keepId } as ChmsPerson, drop = { ...ds.data(), id: dropId } as ChmsPerson;
  if (keep.orgId !== orgId || drop.orgId !== orgId) throw new Error('Both people must belong to this organization.');
  const patch: Record<string, any> = {};
  MERGE_FIELDS.forEach(f => {
    const kv = (keep as any)[f], dv = (drop as any)[f];
    if ((prefer[f] === 'drop' && dv != null && dv !== '') || ((kv == null || kv === '') && dv != null && dv !== '')) patch[f as string] = dv;
  });
  patch.tags = Array.from(new Set([...(keep.tags || []), ...(drop.tags || [])]));
  patch.skills = Array.from(new Set([...(keep.skills || []), ...(drop.skills || [])]));
  patch.ministryIds = Array.from(new Set([...(keep.ministryIds || []), ...(drop.ministryIds || [])]));
  patch.custom = { ...(drop.custom || {}), ...(keep.custom || {}) };
  patch.statusHistory = [...(keep.statusHistory || []), ...(drop.statusHistory || [])].sort((a, b) => a.at - b.at);
  patch.updatedAt = Date.now();
  await updateDoc(doc(db, 'chmsPeople', keepId), strip(patch));

  const repointed: Record<string, number> = {}; const skipped: string[] = [];
  for (const col of ['chmsAttendance', 'chmsContributions', 'chmsPledges', 'chmsNotes', 'chmsTasks']) {
    try {
      const snap = await getDocs(query(collection(db, col), where('orgId', '==', orgId), where('personId', '==', dropId)));
      await chunked(snap.docs, (b, d) => b.update(d.ref, { personId: keepId }));
      repointed[col] = snap.size;
    } catch { skipped.push(col); }
  }
  try {
    const hs = await getDocs(query(collection(db, 'chmsHouseholds'), where('orgId', '==', orgId), where('headPersonId', '==', dropId)));
    await chunked(hs.docs, (b, d) => b.update(d.ref, { headPersonId: keepId }));
  } catch { skipped.push('chmsHouseholds'); }
  await updateDoc(doc(db, 'chmsPeople', dropId), { archived: true, mergedInto: keepId, linkedUid: null, updatedAt: Date.now() });
  logOrgAction(orgId, 'CHMS_MERGE', { targetId: keepId, targetName: fullName(keep), meta: { dropId, dropName: fullName(drop), repointed, skipped } });
  return { merged: { ...keep, ...patch } as ChmsPerson, repointed, skipped };
}

// ── Attendance ───────────────────────────────────────────────────────────────
export const serviceKey = (date: string, label: string) => `service:${date}:${label.toLowerCase().replace(/\s+/g, '')}`;
export const groupKey = (ministryId: string, date: string) => `group:${ministryId}:${date}`;
export interface AttEvent { eventKey: string; eventLabel: string; date: string; ministryId?: string }

export async function fetchAttendance(orgId: string): Promise<ChmsAttendance[]> {
  const snap = await getDocs(query(collection(db, 'chmsAttendance'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ChmsAttendance));
}
/** Idempotent per (event, person): re-checking someone in never double-counts. */
export async function recordAttendance(orgId: string, ev: AttEvent, who: { personId?: string; guestName?: string; householdId?: string; securityCode?: string; visitor?: ChmsAttendance['visitor'] }): Promise<ChmsAttendance> {
  const id = who.personId ? `${orgId}__${ev.eventKey}__${who.personId}`.replace(/[\/]/g, '_') : newId('att');
  const rec = strip({ id, orgId, ...ev, ...who, checkedInBy: auth.currentUser?.uid, checkedInAt: Date.now() }) as ChmsAttendance;
  await setDoc(doc(db, 'chmsAttendance', id), rec);
  return rec;
}
export async function removeAttendance(id: string) { const { deleteDoc } = await import('firebase/firestore'); await deleteDoc(doc(db, 'chmsAttendance', id)); }
/** A congregant checks THEMSELVES in (rules: attendance create allowed when person.linkedUid == auth.uid). */
export const selfCheckIn = (orgId: string, ev: AttEvent, person: ChmsPerson) => recordAttendance(orgId, ev, { personId: person.id, householdId: person.householdId });

const SEC_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newSecurityCode = () => Array.from({ length: 4 }, () => SEC_CHARS[Math.floor(Math.random() * SEC_CHARS.length)]).join('');
export const selfCheckInUrl = (orgId: string, eventKey: string) =>
  `${typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com'}/?elevateCheckin=${encodeURIComponent(orgId)}&event=${encodeURIComponent(eventKey)}`;

export const lastAttendanceByPerson = (att: ChmsAttendance[]) => {
  const m = new Map<string, string>();
  att.forEach(a => { if (a.personId && a.date > (m.get(a.personId) || '')) m.set(a.personId, a.date); });
  return m;
};
export const weeksSince = (iso?: string, now = new Date()) => { const d = parseISO(iso); return d ? Math.floor((now.getTime() - d.getTime()) / (7 * DAY)) : null; };
const weekStart = (iso: string) => { const d = parseISO(iso)!; d.setDate(d.getDate() - d.getDay()); return todayISO(d); };
export function weeklyTotals(att: ChmsAttendance[], opts?: { ministryId?: string; servicesOnly?: boolean }): { week: string; people: number; guests: number; total: number }[] {
  const m = new Map<string, { p: Set<string>; g: number }>();
  att.filter(a => (!opts?.ministryId || a.ministryId === opts.ministryId) && (!opts?.servicesOnly || a.eventKey.startsWith('service:'))).forEach(a => {
    if (!parseISO(a.date)) return;
    const w = weekStart(a.date); const e = m.get(w) || { p: new Set<string>(), g: 0 };
    if (a.personId) e.p.add(a.personId); else e.g++;
    m.set(w, e);
  });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, e]) => ({ week, people: e.p.size, guests: e.g, total: e.p.size + e.g }));
}
/** Share of people seen in the prior `win` weeks who also attended in the latest `win` weeks. */
export function retentionRate(att: ChmsAttendance[], win = 4, now = new Date()): number | null {
  const prev = new Set<string>(), cur = new Set<string>();
  att.forEach(a => { if (!a.personId) return; const w = weeksSince(a.date, now); if (w === null) return; if (w < win) cur.add(a.personId); else if (w < win * 2) prev.add(a.personId); });
  if (!prev.size) return null;
  let kept = 0; prev.forEach(id => { if (cur.has(id)) kept++; });
  return Math.round((kept / prev.size) * 100);
}
/** "Hasn't attended in N weeks" — only people who HAVE attended before (never-attended are visitors, not lapsed). */
export function lapsedPeople(people: ChmsPerson[], att: ChmsAttendance[], weeks: number, now = new Date()) {
  const last = lastAttendanceByPerson(att);
  return people.filter(p => (p.status === 'MEMBER' || p.status === 'REGULAR') && !p.archived && last.has(p.id))
    .map(p => ({ person: p, last: last.get(p.id)!, weeks: weeksSince(last.get(p.id), now) ?? 0 }))
    .filter(x => x.weeks >= weeks).sort((a, b) => b.weeks - a.weeks);
}
export function attendanceCSV(att: ChmsAttendance[], people: ChmsPerson[]) {
  const by = new Map(people.map(p => [p.id, p]));
  return toCSV([['Date', 'Event', 'Person', 'Guest', 'Ministry', 'Security code'],
    ...att.sort((a, b) => b.date.localeCompare(a.date)).map(a => [a.date, a.eventLabel, a.personId ? fullName(by.get(a.personId) || { firstName: '?', lastName: '' }) : '', a.guestName || '', a.ministryId || '', a.securityCode || ''])]);
}

// ── Engagement ───────────────────────────────────────────────────────────────
export interface Engagement { score: number; band: 'HIGH' | 'STEADY' | 'DRIFTING' | 'DORMANT'; drifting: boolean; reasons: string[] }
/** attendance (12 wk, 50) + serving (25) + giving YES/NO flag (15) + status (10). `gave` null = unknown (excluded + rescaled). */
export function engagementScore(p: ChmsPerson, att: ChmsAttendance[], opts: { servedRecently?: boolean; gave?: boolean | null; now?: Date } = {}): Engagement {
  const now = opts.now || new Date(); const reasons: string[] = [];
  const weeksAtt = new Set<string>(), prior = new Set<string>(); let recent4 = 0;
  att.forEach(a => { if (a.personId !== p.id) return; const w = weeksSince(a.date, now); if (w === null) return; if (w < 12) weeksAtt.add(weekStart(a.date)); if (w < 4) recent4++; else if (w < 12) prior.add(a.date); });
  let pts = Math.min(50, (weeksAtt.size / 12) * 50 * 1.5);
  if (weeksAtt.size) reasons.push(`${weeksAtt.size}/12 recent weeks attended`); else reasons.push('No attendance in 12 weeks');
  const serving = !!opts.servedRecently || !!p.ministryIds?.length; if (serving) { pts += 25; reasons.push('Serving'); }
  let max = 75;
  if (opts.gave !== null && opts.gave !== undefined) { max += 15; if (opts.gave) { pts += 15; reasons.push('Gives'); } }
  pts += p.status === 'MEMBER' ? 10 : p.status === 'REGULAR' ? 7 : p.status === 'VISITOR' ? 3 : 0; max += 10;
  const score = Math.round((pts / max) * 100);
  const drifting = (p.status === 'MEMBER' || p.status === 'REGULAR') && prior.size >= 2 && recent4 === 0;
  if (drifting) reasons.push('Attended before, none in the last 4 weeks');
  return { score, drifting, reasons, band: drifting ? 'DRIFTING' : score >= 65 ? 'HIGH' : score >= 35 ? 'STEADY' : 'DORMANT' };
}

// ── Notes (visibility tiers) ─────────────────────────────────────────────────
export async function fetchNotes(orgId: string, personId: string, pastoral: boolean): Promise<ChmsNote[]> {
  const col = collection(db, 'chmsNotes');
  const run = async (staffOnly: boolean) => (await getDocs(staffOnly
    ? query(col, where('orgId', '==', orgId), where('personId', '==', personId), where('visibility', '==', 'STAFF'))
    : query(col, where('orgId', '==', orgId), where('personId', '==', personId)))).docs.map(d => ({ ...d.data(), id: d.id } as ChmsNote));
  let notes: ChmsNote[];
  try { notes = await run(!pastoral); } catch { notes = pastoral ? await run(true) : []; }
  return notes.sort((a, b) => b.createdAt - a.createdAt);
}
export async function addNote(orgId: string, personId: string, text: string, kind: ChmsNote['kind'], visibility: ChmsNote['visibility'], authorName: string) {
  const u = auth.currentUser; if (!u) throw new Error('Sign in first.');
  const id = newId('note');
  await setDoc(doc(db, 'chmsNotes', id), { id, orgId, personId, authorUid: u.uid, authorName, text, kind, visibility, createdAt: Date.now() });
  if (visibility === 'PASTORAL') logOrgAction(orgId, 'CHMS_VIEW_SENSITIVE', { targetId: personId, meta: { what: 'pastoral-note-added' } });
}

// ── Care tasks ───────────────────────────────────────────────────────────────
export interface ChmsTask {
  id: string; orgId: string; personId?: string; personName: string;
  kind: 'FOLLOW_UP' | 'VISIT' | 'HOSPITAL' | 'CALL' | 'WELCOME' | 'OTHER';
  title: string; dueDate: string; assignedUid?: string; assignedName?: string;
  status: 'OPEN' | 'DONE'; createdBy: string; createdAt: number; doneAt?: number;
}
export async function fetchTasks(orgId: string): Promise<ChmsTask[]> {
  const snap = await getDocs(query(collection(db, 'chmsTasks'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ChmsTask)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
export async function saveTask(orgId: string, t: Partial<ChmsTask> & { title: string; personName: string; dueDate: string; kind: ChmsTask['kind'] }) {
  const id = t.id || newId('task');
  const rec = strip({ status: 'OPEN' as const, ...t, id, orgId, createdBy: t.createdBy || auth.currentUser?.uid || '', createdAt: t.createdAt || Date.now() }) as ChmsTask;
  await setDoc(doc(db, 'chmsTasks', id), rec, { merge: true });
  if (!t.id && rec.assignedUid && rec.assignedUid !== auth.currentUser?.uid) {
    createNotification({ userId: rec.assignedUid, senderId: auth.currentUser?.uid || orgId, senderName: 'Care queue', senderPhoto: '', type: 'SYSTEM', title: 'New care task', message: `${rec.title} — ${rec.personName} (due ${rec.dueDate})`, targetId: orgId } as any).catch(() => {});
  }
  return rec;
}
export const completeTask = (id: string, done = true) => updateDoc(doc(db, 'chmsTasks', id), { status: done ? 'DONE' : 'OPEN', doneAt: done ? Date.now() : null });

// ── Milestones / follow-up candidates (deterministic) ────────────────────────
/** Days until the next occurrence (month/day) of an annual date; 0 = today. */
export function daysUntilAnnual(iso?: string, now = new Date()): number | null {
  const d = parseISO(iso); if (!d) return null;
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let n = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (n < t0) n = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((n.getTime() - t0.getTime()) / DAY);
}
export interface Milestone { person: ChmsPerson; kind: 'Birthday' | 'Anniversary' | 'Baptism anniversary' | 'Membership anniversary'; days: number; years: number | null; date: string }
export function upcomingMilestones(people: ChmsPerson[], withinDays = 7, now = new Date()): Milestone[] {
  const out: Milestone[] = [];
  people.filter(p => !p.archived && p.status !== 'DECEASED' && p.status !== 'TRANSFERRED').forEach(p => {
    const defs: [Milestone['kind'], string | undefined][] = [['Birthday', p.birthDate], ['Anniversary', p.anniversary], ['Baptism anniversary', p.baptismDate], ['Membership anniversary', p.memberSince]];
    defs.forEach(([kind, date]) => {
      const days = daysUntilAnnual(date, now); if (days === null || days > withinDays) return;
      const y = parseISO(date)!.getFullYear();
      const occYear = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).getFullYear();
      out.push({ person: p, kind, days, years: occYear - y, date: date! });
    });
  });
  return out.sort((a, b) => a.days - b.days);
}
export interface FollowUpCandidates {
  newVisitors: ChmsPerson[];
  lapsed: { person: ChmsPerson; weeks: number }[];
  milestones: Milestone[];
  drifting: { person: ChmsPerson; engagement: Engagement }[];
}
export function followUpCandidates(people: ChmsPerson[], att: ChmsAttendance[], tasks: ChmsTask[], gave: Set<string> | null = null, now = new Date()): FollowUpCandidates {
  const live = people.filter(p => !p.archived);
  const touched = new Set(tasks.filter(t => t.personId && (t.kind === 'FOLLOW_UP' || t.kind === 'WELCOME')).map(t => t.personId!));
  const firstSeen = new Map<string, string>(); att.forEach(a => { if (a.personId && (!firstSeen.get(a.personId) || a.date < firstSeen.get(a.personId)!)) firstSeen.set(a.personId, a.date); });
  const newVisitors = live.filter(p => p.status === 'VISITOR' && !touched.has(p.id) && ((now.getTime() - (parseISO(firstSeen.get(p.id)) || new Date(p.createdAt)).getTime()) < 21 * DAY));
  const lapsed = lapsedPeople(live, att, 3, now).map(x => ({ person: x.person, weeks: x.weeks }));
  const drifting = live.map(p => ({ person: p, engagement: engagementScore(p, att, { gave: gave ? gave.has(p.id) : null, now }) })).filter(x => x.engagement.drifting);
  return { newVisitors, lapsed, drifting, milestones: upcomingMilestones(live, 7, now) };
}
/** ARIA writes ONLY the narrative; the lists above are computed in code. Names are first names, no notes/amounts are sent. */
export async function ariaFollowUpPlan(org: Organization, c: FollowUpCandidates): Promise<{ text: string; ai: boolean }> {
  const lines = [
    ...c.newVisitors.slice(0, 12).map(p => `NEW VISITOR: ${p.firstName}`),
    ...c.lapsed.slice(0, 12).map(x => `LAPSED ${x.weeks} weeks: ${x.person.firstName}`),
    ...c.drifting.slice(0, 8).map(x => `DRIFTING: ${x.person.firstName} (${x.engagement.reasons.join('; ')})`),
    ...c.milestones.slice(0, 12).map(m => `${m.kind.toUpperCase()} in ${m.days}d: ${m.person.firstName}`),
  ];
  const fallback = [
    c.newVisitors.length ? `Reach out to ${c.newVisitors.length} new visitor(s) within 48 hours — a short, warm text or call, and an invitation back.` : '',
    c.lapsed.length ? `${c.lapsed.length} regular attender(s) have been away 3+ weeks — a no-pressure "we missed you" check-in.` : '',
    c.drifting.length ? `${c.drifting.length} member(s) look to be drifting; a pastor or small-group leader should personally connect.` : '',
    c.milestones.length ? `${c.milestones.length} birthday/anniversary milestone(s) this week — send a card or message.` : '',
  ].filter(Boolean).join('\n') || 'No follow-up candidates this week.';
  if (!lines.length) return { text: fallback, ai: false };
  const raw = await callGemini(`You are ARIA, a pastoral-care assistant for "${org.name}". Below is this week's deterministic follow-up list (first names only). Write a brief, warm, practical plan for the pastoral team: group by category, suggest one concrete outreach action per person or group, and a 2-sentence sample message for new visitors. Do not invent facts about anyone. Plain text, no markdown tables.\n\n${lines.join('\n')}`, {}, 'gemini-flash-latest').catch(() => null);
  return raw ? { text: raw, ai: true } : { text: fallback, ai: false };
}

// ── Volunteer scheduling ─────────────────────────────────────────────────────
export interface ShiftPosition { id: string; name: string; needed: number; skill?: string }
export interface ShiftAssignment { positionId: string; personId: string; personName: string; uid?: string; status: 'PENDING' | 'CONFIRMED' | 'DECLINED'; swapRequested?: boolean; swapNote?: string }
export interface ChmsShift {
  id: string; orgId: string; title: string; date: string; time?: string; ministryId?: string;
  positions: ShiftPosition[]; assignments: ShiftAssignment[]; assignedUids: string[];
  createdBy: string; createdAt: number; updatedAt: number; remindedAt?: number;
}
export async function fetchShifts(orgId: string): Promise<ChmsShift[]> {
  const snap = await getDocs(query(collection(db, 'chmsShifts'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ChmsShift)).sort((a, b) => a.date.localeCompare(b.date));
}
export async function saveShift(orgId: string, s: Partial<ChmsShift> & { title: string; date: string; positions: ShiftPosition[] }) {
  const id = s.id || newId('shift'); const assignments = s.assignments || [];
  const rec = strip({ ...s, id, orgId, assignments, assignedUids: Array.from(new Set(assignments.map(a => a.uid).filter(Boolean) as string[])), createdBy: s.createdBy || auth.currentUser?.uid || '', createdAt: s.createdAt || Date.now(), updatedAt: Date.now() }) as ChmsShift;
  await setDoc(doc(db, 'chmsShifts', id), rec, { merge: true });
  return rec;
}
export const deleteShift = async (id: string) => { const { deleteDoc } = await import('firebase/firestore'); await deleteDoc(doc(db, 'chmsShifts', id)); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Ranked volunteer suggestions for a position: skill match, ministry membership, availability, not double-booked. */
export function matchVolunteers(people: ChmsPerson[], shift: ChmsShift, pos: ShiftPosition, allShifts: ChmsShift[]) {
  const d = parseISO(shift.date); const dow = d ? DOW[d.getDay()] : '';
  const busy = new Set(allShifts.filter(s => s.date === shift.date && s.id !== shift.id).flatMap(s => s.assignments.filter(a => a.status !== 'DECLINED').map(a => a.personId)));
  const already = new Set(shift.assignments.filter(a => a.status !== 'DECLINED').map(a => a.personId));
  return people.filter(p => !p.archived && !isMinor(p) && (p.status === 'MEMBER' || p.status === 'REGULAR') && !already.has(p.id)).map(p => {
    let score = 0; const why: string[] = [];
    if (pos.skill && (p.skills || []).some(s => s.toLowerCase().includes(pos.skill!.toLowerCase()))) { score += 5; why.push(`skill: ${pos.skill}`); }
    if (shift.ministryId && p.ministryIds?.includes(shift.ministryId)) { score += 3; why.push('in ministry'); }
    const av = (p.custom?.availability || '').split(',').map(x => x.trim()); if (av.includes(dow)) { score += 2; why.push(`free ${dow}`); }
    if (busy.has(p.id)) { score -= 10; why.push('booked same day'); }
    return { person: p, score, why };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
}
export async function assignVolunteer(shift: ChmsShift, positionId: string, person: ChmsPerson) {
  const assignments = [...shift.assignments, { positionId, personId: person.id, personName: fullName(person), uid: person.linkedUid, status: 'PENDING' as const }];
  const rec = await saveShift(shift.orgId, { ...shift, assignments });
  if (person.linkedUid) createNotification({ userId: person.linkedUid, senderId: auth.currentUser?.uid || shift.orgId, senderName: 'Volunteer scheduling', senderPhoto: '', type: 'SYSTEM', title: `You're scheduled: ${shift.title}`, message: `${shift.date}${shift.time ? ' ' + shift.time : ''} — please confirm or request a swap.`, targetId: shift.orgId } as any).catch(() => {});
  return rec;
}
export async function respondToShift(shift: ChmsShift, personId: string, patch: { status?: ShiftAssignment['status']; swapRequested?: boolean; swapNote?: string }) {
  const assignments = shift.assignments.map(a => a.personId === personId ? strip({ ...a, ...patch }) : a);
  await updateDoc(doc(db, 'chmsShifts', shift.id), { assignments, updatedAt: Date.now() });
  return { ...shift, assignments };
}
export async function sendShiftReminders(shifts: ChmsShift[], withinDays = 3): Promise<number> {
  const now = todayISO(), cut = todayISO(new Date(Date.now() + withinDays * DAY)); let n = 0;
  for (const s of shifts.filter(x => x.date >= now && x.date <= cut)) {
    for (const a of s.assignments.filter(x => x.uid && x.status !== 'DECLINED')) {
      await createNotification({ userId: a.uid!, senderId: auth.currentUser?.uid || s.orgId, senderName: 'Volunteer scheduling', senderPhoto: '', type: 'SYSTEM', title: `Reminder: ${s.title}`, message: `${s.date}${s.time ? ' ' + s.time : ''}`, targetId: s.orgId } as any).catch(() => {}); n++;
    }
    await updateDoc(doc(db, 'chmsShifts', s.id), { remindedAt: Date.now() }).catch(() => {});
  }
  return n;
}

// ── Communications ───────────────────────────────────────────────────────────
export interface Segment {
  statuses?: ChmsMemberStatus[]; ministryIds?: string[]; tags?: string[]; skills?: string[];
  minAge?: number; maxAge?: number; lapsedWeeks?: number; attendedWithinWeeks?: number;
  birthdayMonth?: number; hasEmail?: boolean; linkedOnly?: boolean; hasChildren?: boolean;
}
export function applySegment(people: ChmsPerson[], att: ChmsAttendance[], s: Segment, now = new Date()): ChmsPerson[] {
  const last = lastAttendanceByPerson(att);
  const parents = new Set<string>(); if (s.hasChildren) people.forEach(p => { if (isMinor(p) && p.householdId) parents.add(p.householdId); });
  return people.filter(p => {
    if (p.archived || p.status === 'DECEASED') return false;
    if ((p.tags || []).includes('do-not-contact')) return false;
    if (s.statuses?.length && !s.statuses.includes(p.status)) return false;
    if (s.ministryIds?.length && !s.ministryIds.some(m => p.ministryIds?.includes(m))) return false;
    if (s.tags?.length && !s.tags.every(t => p.tags?.includes(t))) return false;
    if (s.skills?.length && !s.skills.some(k => p.skills?.some(x => x.toLowerCase().includes(k.toLowerCase())))) return false;
    const a = ageOf(p, now);
    if ((s.minAge !== undefined || s.maxAge !== undefined) && a === null) return false;
    if (s.minAge !== undefined && a! < s.minAge) return false;
    if (s.maxAge !== undefined && a! > s.maxAge) return false;
    if (s.birthdayMonth && (parseISO(p.birthDate)?.getMonth() ?? -9) + 1 !== s.birthdayMonth) return false;
    const w = weeksSince(last.get(p.id), now);
    if (s.lapsedWeeks && (w === null || w < s.lapsedWeeks)) return false;
    if (s.attendedWithinWeeks && (w === null || w >= s.attendedWithinWeeks)) return false;
    if (s.hasEmail && !p.email) return false;
    if (s.linkedOnly && !p.linkedUid) return false;
    if (s.hasChildren && !(p.householdId && parents.has(p.householdId) && !isMinor(p))) return false;
    return true;
  });
}
export function mergeTokens(tpl: string, p: ChmsPerson, extra: { household?: ChmsHousehold; org?: Organization } = {}): string {
  const a = p.address || extra.household?.address || {};
  const map: Record<string, string> = {
    first_name: p.preferredName || p.firstName, last_name: p.lastName, full_name: fullName(p),
    household_name: extra.household?.name || `The ${p.lastName} Family`, email: p.email || '', phone: p.phone || '',
    address: [a.line1, a.line2].filter(Boolean).join(', '), city: a.city || '', state: a.region || '', zip: a.postal || '',
    church_name: extra.org?.name || '', today: new Date().toLocaleDateString(),
  };
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => map[String(k).toLowerCase()] ?? '');
}
/** One label per household (heads preferred), skipping people without a postal address. */
export function mailingLabels(people: ChmsPerson[], households: ChmsHousehold[]) {
  const hh = new Map(households.map(h => [h.id, h])); const seen = new Set<string>(); const out: { name: string; line1: string; line2: string; city: string; region: string; postal: string }[] = [];
  [...people].sort((a, b) => (a.householdRole === 'HEAD' ? -1 : 0) - (b.householdRole === 'HEAD' ? -1 : 0)).forEach(p => {
    if (p.archived || isMinor(p)) return;
    const h = p.householdId ? hh.get(p.householdId) : undefined; const a = p.address || h?.address; if (!a?.line1) return;
    const key = p.householdId || p.id; if (seen.has(key)) return; seen.add(key);
    out.push({ name: h?.name || fullName(p), line1: a.line1 || '', line2: a.line2 || '', city: a.city || '', region: a.region || '', postal: a.postal || '' });
  });
  return out;
}
export const mailingLabelsCSV = (l: ReturnType<typeof mailingLabels>) => toCSV([['Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip'], ...l.map(x => [x.name, x.line1, x.line2, x.city, x.region, x.postal])]);

export interface ChmsMessageLog { id: string; orgId: string; channels: string[]; subject: string; body: string; segmentLabel: string; recipientCount: number; sentBy: string; sentByName: string; sentAt: number; results: Record<string, number | string> }
export async function fetchMessageLog(orgId: string): Promise<ChmsMessageLog[]> {
  const snap = await getDocs(query(collection(db, 'chmsMessages'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ChmsMessageLog)).sort((a, b) => b.sentAt - a.sentAt);
}
/** SMS hook: no provider is wired yet — returns configured:false so the UI can say so honestly. */
export async function smsBroadcast(_body: string, _phones: string[]): Promise<{ sent: number; configured: boolean }> { return { sent: 0, configured: false }; }
export async function sendSegmentMessage(org: Organization, recipients: ChmsPerson[], msg: { subject: string; body: string; channels: { notify: boolean; email: boolean; sms: boolean }; segmentLabel: string }, senderName: string) {
  const u = auth.currentUser; if (!u) throw new Error('Sign in first.');
  const results: Record<string, number | string> = {};
  const adults = recipients.filter(p => !isMinor(p));   // never message minors directly
  if (msg.channels.notify) {
    const linked = adults.filter(p => p.linkedUid && p.linkedUid !== u.uid);
    await Promise.all(linked.map(p => createNotification({ userId: p.linkedUid!, senderId: u.uid, senderName: org.name, senderPhoto: org.logoUrl || '', type: 'SYSTEM', title: mergeTokens(msg.subject, p, { org }) || org.name, message: mergeTokens(msg.body, p, { org }), link: 'CHAT', targetId: org.id } as any).catch(() => {})));
    results.notified = linked.length;
  }
  if (msg.channels.email) {
    const e = await emailBroadcast(msg.subject, msg.body.replace(/\{\{\s*first_name\s*\}\}/gi, 'friend'), adults.map(p => p.email || ''));
    results.emailed = e.sent; if (!e.configured) results.emailNote = 'Email service not configured';
  }
  if (msg.channels.sms) {
    const s = await smsBroadcast(msg.body, adults.map(p => p.phone || '').filter(Boolean));
    results.sms = s.sent; if (!s.configured) results.smsNote = 'No SMS provider connected';
  }
  const id = newId('msg');
  await setDoc(doc(db, 'chmsMessages', id), { id, orgId: org.id, channels: Object.entries(msg.channels).filter(([, v]) => v).map(([k]) => k), subject: msg.subject, body: msg.body, segmentLabel: msg.segmentLabel, recipientCount: adults.length, sentBy: u.uid, sentByName: senderName, sentAt: Date.now(), results });
  logOrgAction(org.id, 'CHMS_BROADCAST', { meta: { segment: msg.segmentLabel, recipients: adults.length } });
  return results;
}

// ── Plajah account linking (claim token) ─────────────────────────────────────
export interface ChmsClaim { id: string; orgId: string; orgName: string; personId: string; personName: string; createdBy: string; createdAt: number; expiresAt: number; usedBy?: string; usedAt?: number }
export const claimUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com'}/?elevateClaim=${token}`;
export async function createClaim(org: Organization, person: ChmsPerson, days = 30): Promise<ChmsClaim> {
  const u = auth.currentUser; if (!u) throw new Error('Sign in first.');
  const id = newId('clm') + Math.random().toString(36).slice(2, 10);
  const rec: ChmsClaim = { id, orgId: org.id, orgName: org.name, personId: person.id, personName: fullName(person), createdBy: u.uid, createdAt: Date.now(), expiresAt: Date.now() + days * DAY };
  await setDoc(doc(db, 'chmsClaims', id), rec);
  return rec;
}
export async function fetchClaim(token: string): Promise<ChmsClaim | null> {
  try { const s = await getDoc(doc(db, 'chmsClaims', token)); return s.exists() ? ({ ...s.data(), id: s.id } as ChmsClaim) : null; } catch { return null; }
}
/** Signed-in congregant redeems a claim → ChmsPerson.linkedUid = uid. Rules verify the claim (unused, unexpired, same person). */
export async function redeemClaim(token: string): Promise<ChmsClaim> {
  const u = auth.currentUser; if (!u) throw new Error('Sign in to claim your record.');
  const c = await fetchClaim(token);
  if (!c) throw new Error('This link is invalid.');
  if (c.usedBy) throw new Error('This link was already used.');
  if (c.expiresAt < Date.now()) throw new Error('This link has expired.');
  await updateDoc(doc(db, 'chmsPeople', c.personId), { linkedUid: u.uid, claimToken: token, updatedAt: Date.now() });
  await updateDoc(doc(db, 'chmsClaims', token), { usedBy: u.uid, usedAt: Date.now() }).catch(() => {});
  return c;
}
export async function fetchMyPerson(orgId: string, uid: string): Promise<ChmsPerson | null> {
  const snap = await getDocs(query(collection(db, 'chmsPeople'), where('orgId', '==', orgId), where('linkedUid', '==', uid)));
  const d = snap.docs[0]; return d ? ({ ...d.data(), id: d.id } as ChmsPerson) : null;
}
/** Self-service update — limited to the fields firestore.rules allow a linked person to change. */
export async function updateMyContact(personId: string, patch: Partial<Pick<ChmsPerson, 'email' | 'phone' | 'address' | 'preferredName' | 'photoUrl' | 'directoryVisible'>>) {
  await updateDoc(doc(db, 'chmsPeople', personId), { ...strip(patch as any), updatedAt: Date.now() });
}

// ── Reports ──────────────────────────────────────────────────────────────────
export const membershipRollCSV = (people: ChmsPerson[]) => toCSV([['Last', 'First', 'Status', 'Member since', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip'],
  ...people.filter(p => p.status === 'MEMBER' && !p.archived).map(p => [p.lastName, p.firstName, p.status, p.memberSince || '', p.email || '', p.phone || '', [p.address?.line1, p.address?.line2].filter(Boolean).join(' '), p.address?.city || '', p.address?.region || '', p.address?.postal || ''])]);
export const directoryCSV = (people: ChmsPerson[]) => toCSV([['Last', 'First', 'Email', 'Phone', 'Address'], ...people.filter(directoryPrintable).map(p => [p.lastName, p.firstName, p.email || '', p.phone || '', [p.address?.line1, p.address?.city, p.address?.region, p.address?.postal].filter(Boolean).join(', ')])]);
export function demographics(people: ChmsPerson[]) {
  const live = people.filter(p => !p.archived); const count = (f: (p: ChmsPerson) => string) => { const m: Record<string, number> = {}; live.forEach(p => { const k = f(p) || 'Unknown'; m[k] = (m[k] || 0) + 1; }); return m; };
  return { total: live.length, status: count(p => p.status), age: count(ageBand), gender: count(p => p.gender || ''), marital: count(p => p.maritalStatus || '') };
}
export function growthByMonth(people: ChmsPerson[], months = 12) {
  const out: { month: string; added: number; members: number }[] = []; const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ month: key, added: people.filter(p => !p.archived && new Date(p.createdAt).toISOString().slice(0, 7) === key).length, members: people.filter(p => !p.archived && p.status === 'MEMBER' && (p.memberSince || '').slice(0, 7) === key).length });
  }
  return out;
}
export const statusChanges = (people: ChmsPerson[], sinceMs: number) => people.flatMap(p => (p.statusHistory || []).slice(1).filter(h => h.at >= sinceMs).map(h => ({ person: p, ...h }))).sort((a, b) => b.at - a.at);
