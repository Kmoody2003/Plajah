// elevateAccounts — pre-provisioned Plajah accounts for an Elevate organization.
//
// The problem: a church imports 800 people from Servant Keeper / Planning Center / a payroll export. Until now
// every one of them had to be re-entered by hand or invited one at a time. Now each imported (or hand-added)
// person gets a Plajah account PRE-PROVISIONED for them: a managed `users/prov_…` profile (the same
// Firestore-only "managed identity" plumbing the business EMPLOYEE profiles use — see
// organizationService.createManagedEmployee) plus an orgMemberships seat that already carries their role,
// title, department(s) and roster group. The person then CLAIMS it with their member ID (+ last name) or the
// email on file — from an invite, the org's join link / QR code, or the "Claim your account" door on the landing
// page. The claim itself runs on the server (routes/elevateAccounts.ts) so nobody can enumerate members:
// the seat's userId is rewritten to the real uid, the chmsPeople record gets linkedUid, the org member index
// is written, and every org chat room the seat sat in is re-pointed at the real person.
//
//   provisionAccount / provisionAccountsBulk  — staff: create seats for people (import hook, directory, roster)
//   linkPersonToUser                          — staff: tie a congregation record to an EXISTING Plajah user
//   joinUrl / joinQr                          — the org's shareable join link + QR
//   lookupProvisionedSeat / claimProvisionedSeat — the member's side (server-backed)
//   importRoleToKey                           — "Youth Pastor" → PASTOR, "Treasurer" → TREASURER …
import QRCode from 'qrcode';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, opsDb, auth } from './firebase';
import type { Organization, OrgMembership, ChmsPerson, Ministry, RosterGroup, UserProfile } from '../types';
import { getElevateRole, elevateCan } from './elevateRoles';
import { addOrgMember, fetchOrgMembers, fetchOrganization, syncMemberIndex, updateOrganization } from './organizationService';
import { recomputeOrgRoleIndex } from './elevateService';
import { logOrgAction } from './orgAudit';
import { syncOrgChatForUser } from './orgChatService';

const strip = <T>(val: T): T => {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.filter(x => x !== undefined).map(x => strip(x)) as unknown as T;
  const proto = Object.getPrototypeOf(val);
  if (proto !== null && proto !== Object.prototype) return val;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) out[k] = strip(v);
  }
  return out as T;
};

// ── Member & Employment IDs ──────────────────────────────────────────────────

/** "Grace Community Church" → "GCC"; falls back to the org id's first letters. */
export function memberNumberPrefix(org: Pick<Organization, 'name' | 'memberNumberPrefix' | 'id'>): string {
  if (org.memberNumberPrefix?.trim()) return org.memberNumberPrefix.trim().toUpperCase().slice(0, 4);
  const initials = (org.name || '').split(/\s+/).map(w => w[0]).filter(c => /[A-Za-z]/.test(c || '')).join('').toUpperCase().slice(0, 3);
  return initials || org.id.slice(0, 3).toUpperCase();
}
/** Stable 5-digit code from a person id (same person → same number across re-imports). */
function digitsFor(seed: string, min = 10000, span = 90000): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return String(min + (h % span));
}
/** Member ID for a person: the source system's member number when it looks like one, else PREFIX-NNNNN. */
export function memberNumberFor(org: Pick<Organization, 'name' | 'memberNumberPrefix' | 'id'>, person: Pick<ChmsPerson, 'id' | 'memberNumber' | 'source'>, taken?: Set<string>): string {
  if (person.memberNumber) return person.memberNumber;
  const src = (person.source?.id || '').trim();
  if (/^[A-Za-z0-9-]{3,16}$/.test(src) && !taken?.has(src.toUpperCase())) return src.toUpperCase();
  const prefix = memberNumberPrefix(org);
  let n = `${prefix}-${digitsFor(person.id)}`;
  let bump = 1;
  while (taken?.has(n)) n = `${prefix}-${digitsFor(person.id + ':' + bump++)}`;
  taken?.add(n);
  return n;
}
/** Employment / Staff ID for a person: PREFIX-EMP-NNNN (auto-populated on backend approval or provisioning). */
export function employeeNumberFor(org: Pick<Organization, 'name' | 'memberNumberPrefix' | 'id'>, person: Pick<ChmsPerson, 'id' | 'employeeNumber'>, taken?: Set<string>): string {
  if (person.employeeNumber) return person.employeeNumber;
  const prefix = memberNumberPrefix(org);
  let n = `${prefix}-EMP-${digitsFor('emp:' + person.id, 1000, 9000)}`;
  let bump = 1;
  while (taken?.has(n)) n = `${prefix}-EMP-${digitsFor('emp:' + person.id + ':' + bump++, 1000, 9000)}`;
  taken?.add(n);
  return n;
}
export const normalizeMemberNumber = (s: string) => (s || '').trim().toUpperCase().replace(/\s+/g, '');

// ── Role mapping (imports, payroll, roster forms) ────────────────────────────

const ROLE_PATTERNS: [RegExp, string][] = [
  [/senior\s*pastor|lead\s*pastor|head\s*pastor|bishop|rector|imam|rabbi|executive\s*director/i, 'SENIOR_PASTOR'],
  [/associate\s*pastor|youth\s*pastor|assistant\s*pastor|\bpastor\b|priest|reverend|\brev\b/i, 'PASTOR'],
  [/minister|chaplain|evangelist/i, 'MINISTER'],
  [/elder/i, 'ELDER'],
  [/deacon/i, 'DEACON'],
  [/department\s*admin|ministry\s*admin|department\s*coordinator|ministry\s*coordinator/i, 'DEPARTMENT_ADMIN'],
  [/department\s*head|director|supervisor|manager|lead\b|leader|head\s*of/i, 'DEPARTMENT_HEAD'],
  [/instructor|catechist|sunday\s*school\s*teacher|bible\s*study\s*teacher|class\s*teacher|facilitator|teacher/i, 'INSTRUCTOR'],
  [/finance\s*director|cfo|controller/i, 'FINANCE_DIRECTOR'],
  [/treasurer/i, 'TREASURER'],
  [/bookkeep|payroll|accounts?\s*payable|accounts?\s*receivable/i, 'BOOKKEEPER'],
  [/accountant|cpa|auditor/i, 'ACCOUNTANT'],
  [/trustee/i, 'TRUSTEE'],
  [/media|audio|video|sound|livestream|graphic|tech|production|broadcast|a\/v/i, 'MEDIA_TEAM'],
  [/prayer/i, 'PRAYER_WARRIOR'],
  [/department\s*volunteer|ministry\s*volunteer/i, 'DEPARTMENT_VOLUNTEER'],
  [/volunteer|usher|greeter|server/i, 'VOLUNTEER'],
  [/staff|admin|secretary|assistant|clerk|receptionist|custodian|employee|intern|nurse|office|coordinator/i, 'STAFF'],
];
/** Map a free-text role / job title / membership type to an Elevate role key (MEMBER when unsure). */
export function importRoleToKey(text?: string): string {
  const t = (text || '').trim();
  if (!t) return 'MEMBER';
  const exact = getElevateRole(t.toUpperCase().replace(/\s+/g, '_'));
  if (exact) return exact.key;
  for (const [re, key] of ROLE_PATTERNS) if (re.test(t)) return key;
  return 'MEMBER';
}
/** Match a free-text department name ("Media Ministry", "Youth") to the org's ministries. */
export function matchMinistry(ministries: Ministry[] | undefined, text?: string): Ministry | undefined {
  const t = (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!t || !ministries?.length) return undefined;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return ministries.find(m => norm(m.name) === t)
    || ministries.find(m => t.includes(norm(m.name)) || norm(m.name).includes(t))
    || ministries.find(m => m.templateKey && t.includes(m.templateKey));
}

// ── Provisioning ─────────────────────────────────────────────────────────────

export interface ProvisionOptions {
  roleKey?: string;
  roleKeys?: string[];
  title?: string;
  ministryIds?: string[];
  ministryRoles?: Array<{ ministryId: string; roleKey: string; title?: string }>;
  /** Treat as paid staff (work badge) — default: roles whose roster group is STAFF/PASTORAL/LEADERSHIP. */
  isEmployee?: boolean;
}
export interface ProvisionResult { person: ChmsPerson; membership: OrgMembership; profileUid: string }

const provUid = (orgId: string) => `prov_${orgId.slice(0, 6)}_${Math.random().toString(36).slice(2, 11)}`;

/** Can the viewer pre-provision accounts? Roster staff (pastors, admins, department heads) — same gate as the directory. */
export const canProvision = (org: Organization, m: OrgMembership | null) => elevateCan(m, org, 'MANAGE_ROSTER');

/** Build the three docs for one seat (no I/O). Exported so the import engine can stage them in its own batches. */
export function buildProvisionDocs(org: Organization, person: ChmsPerson, opts: ProvisionOptions = {}, taken?: Set<string>): ProvisionResult & { profile: Record<string, any> } {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const now = Date.now();
  const uid = provUid(org.id);
  const roleKey = opts.roleKey || org.accountProvisioning?.defaultRoleKey || 'MEMBER';
  const def = getElevateRole(roleKey) || getElevateRole('MEMBER')!;
  const memberNumber = memberNumberFor(org, person, taken);
  const employeeNumber = employeeNumberFor(org, person, taken);
  const displayName = `${person.preferredName || person.firstName} ${person.lastName}`.trim();
  const rosterGroup: RosterGroup = def.rosterGroup;
  const isEmployee = opts.isEmployee ?? (rosterGroup === 'STAFF' || rosterGroup === 'PASTORAL' || rosterGroup === 'LEADERSHIP');
  const ministryIds = Array.from(new Set([...(opts.ministryIds || []), ...(person.ministryIds || [])]));
  // Strict privacy: never write personal email onto public `users/*` docs
  const profile: Record<string, any> = strip({
    uid, displayName, photoURL: person.photoUrl || '', email: '',
    accountType: 'EMPLOYEE', isEmployee: true, isProvisioned: true,
    employerOrgId: org.id, managedByUid: u.uid,
    provisionedMemberNumber: memberNumber, provisionedEmployeeNumber: employeeNumber, provisionedRoleKey: roleKey,
    followerCount: 0, followingCount: 0, createdAt: now,
  });
  const membership: OrgMembership = strip({
    id: `mem_${uid}`, orgId: org.id, userId: uid,
    role: def.baseRole === 'OWNER' || def.baseRole === 'ADMIN' ? 'STAFF' : def.baseRole, status: 'ACTIVE',
    displayName, photoUrl: person.photoUrl || '', title: opts.title || def.label, joinedAt: now,
    roleKey, roleKeys: Array.from(new Set(['MEMBER', roleKey])), rosterGroup, isEmployee: isEmployee || undefined, employeeProfileUid: uid,
    source: 'OWNER_CREATED', invitedBy: u.uid, acceptedAt: now,
    ministryRoles: ministryIds.length ? ministryIds.map(ministryId => ({ ministryId, roleKey: ['DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN', 'INSTRUCTOR', 'DEPARTMENT_VOLUNTEER', 'MEDIA_TEAM', 'PRAYER_WARRIOR'].includes(roleKey) ? roleKey : 'DEPARTMENT_VOLUNTEER', title: opts.title || def.label })) : undefined,
    isProvisioned: true, provisionedPersonId: person.id, memberNumber, employeeNumber,
    claimEmailLower: person.email ? person.email.trim().toLowerCase() : undefined,
    ministryIds: ministryIds.length ? ministryIds : undefined,
  }) as OrgMembership;
  const updatedPerson: ChmsPerson = { ...person, provisionedUid: uid, memberNumber, employeeNumber, ministryIds: ministryIds.length ? ministryIds : person.ministryIds, updatedAt: now };
  return { person: updatedPerson, membership, profileUid: uid, profile };
}

/** Stamp the provisioned uid + numbers onto the ChMS people (plajah-ops), after their accounts landed in
 *  plajah-prod. Retried once: a person left unstamped would look unprovisioned and get a second account. */
async function linkProvisionedPeople(results: ProvisionResult[]): Promise<void> {
  const write = async () => {
    const b = writeBatch(opsDb);
    for (const r of results) {
      b.set(doc(opsDb, 'chmsPeople', r.person.id), { provisionedUid: r.profileUid, memberNumber: r.person.memberNumber, employeeNumber: r.person.employeeNumber, ministryIds: r.person.ministryIds || [], updatedAt: r.person.updatedAt }, { merge: true });
    }
    await b.commit();
  };
  try { await write(); } catch { await write(); }
}

/** Pre-provision ONE account. Skips (returns null) when the person is already linked or provisioned. */
export async function provisionAccount(org: Organization, person: ChmsPerson, opts: ProvisionOptions = {}): Promise<ProvisionResult | null> {
  if (person.linkedUid || person.provisionedUid) return null;
  const built = buildProvisionDocs(org, person, opts);
  // users + orgMemberships live in plajah-prod, chmsPeople in plajah-ops: two commits (account first).
  const b = writeBatch(db);
  b.set(doc(db, 'users', built.profileUid), built.profile);
  b.set(doc(db, 'orgMemberships', built.membership.id), built.membership);
  await b.commit();
  await linkProvisionedPeople([built]);
  afterProvision(org, [built.membership]).catch(() => {});
  logOrgAction(org.id, 'ELEVATE_ACCOUNT_PROVISIONED', { targetId: person.id, targetName: built.membership.displayName, meta: { roleKey: built.membership.roleKey } });
  return built;
}

export interface BulkProgress { done: number; total: number; skipped: number }
/** Pre-provision many (import hook / "provision everyone"). 3 docs per person, 150 people per batch. */
export async function provisionAccountsBulk(
  org: Organization, people: ChmsPerson[], opts: ProvisionOptions | ((p: ChmsPerson) => ProvisionOptions) = {},
  onProgress?: (p: BulkProgress) => void,
): Promise<{ provisioned: ProvisionResult[]; skipped: number }> {
  const todo = people.filter(p => !p.linkedUid && !p.provisionedUid && !p.archived && !p.mergedInto);
  const skipped = people.length - todo.length;
  const taken = new Set(people.flatMap(p => [p.memberNumber, p.employeeNumber]).filter(Boolean) as string[]);
  const out: ProvisionResult[] = [];
  for (let i = 0; i < todo.length; i += 150) {
    const slice = todo.slice(i, i + 150);
    const b = writeBatch(db);
    const built: ProvisionResult[] = [];
    for (const person of slice) {
      const r = buildProvisionDocs(org, person, typeof opts === 'function' ? opts(person) : opts, taken);
      b.set(doc(db, 'users', r.profileUid), r.profile);
      b.set(doc(db, 'orgMemberships', r.membership.id), r.membership);
      built.push(r);
    }
    await b.commit();
    await linkProvisionedPeople(built);
    out.push(...built);
    onProgress?.({ done: Math.min(i + 150, todo.length), total: todo.length, skipped });
  }
  if (out.length) {
    await updateOrganization(org.id, { accountProvisioning: { ...(org.accountProvisioning || {}), lastRunAt: Date.now() } }).catch(() => {});
    afterProvision(org, out.map(r => r.membership)).catch(() => {});
    logOrgAction(org.id, 'ELEVATE_ACCOUNTS_PROVISIONED', { meta: { count: out.length, skipped } });
  }
  return { provisioned: out, skipped };
}

/** Role index + chat seats for the new provisioned memberships (best effort, after the batch lands). */
async function afterProvision(org: Organization, memberships: OrgMembership[]) {
  await recomputeOrgRoleIndex(org.id);
  // Seat each provisioned profile in the org rooms it belongs to, so the claimant lands in a live chat.
  for (const m of memberships.slice(0, 400)) await syncOrgChatForUser(org, m).catch(() => {});
}

/** Re-point a provisioned seat at a different role / department (staff edit before it is claimed). */
export async function updateProvisionedSeat(org: Organization, membership: OrgMembership, patch: { roleKey?: string; title?: string; ministryIds?: string[] }) {
  const def = patch.roleKey ? getElevateRole(patch.roleKey) : undefined;
  const ministryIds = patch.ministryIds;
  await updateDoc(doc(db, 'orgMemberships', membership.id), strip({
    roleKey: patch.roleKey, title: patch.title ?? def?.label, rosterGroup: def?.rosterGroup,
    role: def ? (def.baseRole === 'OWNER' || def.baseRole === 'ADMIN' ? 'STAFF' : def.baseRole) : undefined,
    ministryIds, ministryRoles: ministryIds ? ministryIds.map(ministryId => ({ ministryId, roleKey: patch.roleKey && ['DEPARTMENT_HEAD', 'DEPARTMENT_ADMIN', 'INSTRUCTOR', 'DEPARTMENT_VOLUNTEER', 'MEDIA_TEAM', 'PRAYER_WARRIOR'].includes(patch.roleKey) ? patch.roleKey : (membership.roleKey || 'DEPARTMENT_VOLUNTEER') })) : undefined,
  }));
  if (membership.provisionedPersonId && ministryIds) await updateDoc(doc(opsDb, 'chmsPeople', membership.provisionedPersonId), { ministryIds, updatedAt: Date.now() }).catch(() => {});
  if (patch.roleKey && membership.userId.startsWith('prov_')) await updateDoc(doc(db, 'users', membership.userId), { provisionedRoleKey: patch.roleKey }).catch(() => {});
  await recomputeOrgRoleIndex(org.id);
}

/** Tie a congregation record to an EXISTING Plajah user (staff picked them from search). Creates the membership if missing. */
export async function linkPersonToUser(org: Organization, person: ChmsPerson, user: Pick<UserProfile, 'uid' | 'displayName' | 'photoURL'>, opts: ProvisionOptions = {}): Promise<OrgMembership | null> {
  const now = Date.now();
  const memberNumber = person.memberNumber || memberNumberFor(org, person);
  const employeeNumber = person.employeeNumber || employeeNumberFor(org, person);
  await setDoc(doc(opsDb, 'chmsPeople', person.id), { linkedUid: user.uid, memberNumber, employeeNumber, updatedAt: now }, { merge: true });
  const existing = (await fetchOrgMembers(org.id)).find(m => m.userId === user.uid);
  let membership: OrgMembership | null = existing || null;
  if (!existing) {
    const roleKey = opts.roleKey || 'MEMBER';
    const def = getElevateRole(roleKey);
    membership = await addOrgMember(org.id, { userId: user.uid, displayName: user.displayName, photoUrl: user.photoURL, role: def?.baseRole === 'OWNER' || def?.baseRole === 'ADMIN' ? 'STAFF' : (def?.baseRole || 'MEMBER'), title: opts.title || def?.label });
    if (membership) {
      await updateDoc(doc(db, 'orgMemberships', membership.id), strip({ roleKey, rosterGroup: def?.rosterGroup, provisionedPersonId: person.id, memberNumber, employeeNumber, ministryIds: opts.ministryIds?.length ? opts.ministryIds : undefined,
        ministryRoles: opts.ministryIds?.length ? opts.ministryIds.map(ministryId => ({ ministryId, roleKey: 'VOLUNTEER' })) : undefined }));
    }
  }
  await syncMemberIndex(org.id, user.uid);
  await recomputeOrgRoleIndex(org.id);
  if (membership) await syncOrgChatForUser(org, { ...membership, userId: user.uid }).catch(() => {});
  logOrgAction(org.id, 'ELEVATE_ACCOUNT_LINKED', { targetId: person.id, targetName: user.displayName, meta: { uid: user.uid } });
  return membership;
}

// ── Join link + QR ───────────────────────────────────────────────────────────

const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com');
/** The org's public door: claim a pre-provisioned account, or join / request to join as a new member. */
export const joinUrl = (org: Pick<Organization, 'id' | 'handle'>) => `${origin()}/?elevateJoin=${encodeURIComponent(org.handle || org.id)}`;
export const joinQr = (org: Pick<Organization, 'id' | 'handle'>, size = 512) => QRCode.toDataURL(joinUrl(org), { width: size, margin: 2 });
/** Deep link straight to the claim form (printed on a card: "Claim your account — member ID GC-48213"). */
export const claimUrl = (org: Pick<Organization, 'id' | 'handle'>, memberNumber?: string) =>
  `${origin()}/?elevateJoin=${encodeURIComponent(org.handle || org.id)}&claim=1${memberNumber ? `&member=${encodeURIComponent(memberNumber)}` : ''}`;

// ── Stats ────────────────────────────────────────────────────────────────────

export interface AccountStats { people: number; provisioned: number; claimed: number; unlinked: number }
export function accountStats(people: ChmsPerson[], members: OrgMembership[]): AccountStats {
  const live = people.filter(p => !p.archived && !p.mergedInto);
  const provisioned = members.filter(m => m.isProvisioned && m.status === 'ACTIVE').length;
  const claimed = live.filter(p => !!p.linkedUid).length;
  return { people: live.length, provisioned, claimed, unlinked: live.filter(p => !p.linkedUid && !p.provisionedUid).length };
}

// ── The member's side (server-backed; routes/elevateAccounts.ts + client fallback) ──

export interface SeatLookup {
  found: boolean;
  orgId?: string; orgName?: string; orgLogoUrl?: string;
  /** "J••• S••••" — enough to confirm it's them, never the full record. */
  maskedName?: string;
  roleLabel?: string;
  departments?: string[];
  memberNumber?: string;
  employeeNumber?: string;
  /** Why a claim can't proceed (e.g. no pre-provisioned seat yet) — shown verbatim. */
  reason?: string;
  alreadyClaimed?: boolean;
}
export interface ClaimInput {
  org: string;
  firstName?: string;
  lastName?: string;
  memberNumber?: string;
  employeeNumber?: string;
  email?: string;
}

async function authed(path: string, body: unknown, allowUnauthed = false): Promise<Response> {
  const u = auth.currentUser;
  if (!u && !allowUnauthed) throw new Error('Sign in first.');
  const token = u ? await u.getIdToken().catch(() => null) : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

const maskWord = (s: string) => {
  const t = (s || '').trim();
  return t ? t[0] + '•'.repeat(Math.max(2, Math.min(6, t.length - 1))) : '';
};

/** Locate a pre-provisioned seat + its Organization from email, ID code, or name. */
async function findProvisionedSeatClientSide(input: ClaimInput): Promise<{ org: Organization | null; match: OrgMembership | null; alreadyClaimed?: boolean }> {
  let org = input.org ? await resolveJoinTarget(input.org) : null;
  const idCode = normalizeMemberNumber(input.memberNumber || input.employeeNumber || '');
  const fName = (input.firstName || '').trim().toLowerCase();
  const lName = (input.lastName || '').trim().toLowerCase();
  const em = (input.email || auth.currentUser?.email || '').trim().toLowerCase();

  const matchesInput = (m: OrgMembership) => {
    if (!m.isProvisioned) return false;
    if (em && m.claimEmailLower && m.claimEmailLower.toLowerCase() === em) return true;
    if (idCode && (normalizeMemberNumber(m.memberNumber || '') === idCode || normalizeMemberNumber(m.employeeNumber || '') === idCode)) {
      return !lName || m.displayName.toLowerCase().includes(lName);
    }
    if (fName && lName && m.displayName.trim().toLowerCase() === `${fName} ${lName}`.trim()) return true;
    if (!fName && lName && m.displayName.trim().toLowerCase().endsWith(` ${lName}`)) return true;
    return false;
  };

  if (org) {
    const members = await fetchOrgMembers(org.id).catch(() => [] as OrgMembership[]);
    const match = members.find(matchesInput) || null;
    if (match) return { org, match };
  }

  // Fallback: query orgMemberships directly by claimEmailLower or memberNumber (handles missing org key or duplicate org shell)
  if (em) {
    const snap = await getDocs(query(collection(db, 'orgMemberships'), where('claimEmailLower', '==', em))).catch(() => null);
    const docs = snap?.docs.map(d => ({ id: d.id, ...(d.data() as any) } as OrgMembership)) || [];
    const provisioned = docs.find(d => d.isProvisioned) || docs[0];
    if (provisioned) {
      const resolvedOrg = (!org || org.id !== provisioned.orgId) ? await fetchOrganization(provisioned.orgId).catch(() => org) : org;
      if (!provisioned.isProvisioned) return { org: resolvedOrg, match: null, alreadyClaimed: true };
      return { org: resolvedOrg, match: provisioned };
    }
  }

  if (idCode) {
    const snapMem = await getDocs(query(collection(db, 'orgMemberships'), where('memberNumber', '==', idCode))).catch(() => null);
    const snapEmp = snapMem?.docs.length ? null : await getDocs(query(collection(db, 'orgMemberships'), where('employeeNumber', '==', idCode))).catch(() => null);
    const docs = [...(snapMem?.docs || []), ...(snapEmp?.docs || [])].map(d => ({ id: d.id, ...(d.data() as any) } as OrgMembership));
    const provisioned = docs.find(d => d.isProvisioned && (!lName || d.displayName.toLowerCase().includes(lName)));
    if (provisioned) {
      const resolvedOrg = (!org || org.id !== provisioned.orgId) ? await fetchOrganization(provisioned.orgId).catch(() => org) : org;
      return { org: resolvedOrg, match: provisioned };
    }
  }

  return { org, match: null };
}

/** Find a pre-provisioned seat in Firestore directly when the server claim endpoint is unconfigured (local dev). */
async function clientSideLookupSeat(input: ClaimInput): Promise<SeatLookup> {
  const { org, match, alreadyClaimed } = await findProvisionedSeatClientSide(input);
  if (!org) return { found: false, reason: 'Enter the email address or Member ID from your organization to locate your pre-provisioned account.' };
  if (alreadyClaimed) {
    return {
      found: false,
      orgId: org.id,
      orgName: org.name,
      orgLogoUrl: org.logoUrl,
      alreadyClaimed: true,
      reason: 'This account has already been claimed. Sign in with the account you used, or ask your organization admin to reset it.',
    };
  }
  if (!match) {
    return {
      found: false,
      orgId: org.id,
      orgName: org.name,
      orgLogoUrl: org.logoUrl,
      reason: 'No pre-provisioned seat found yet — you can submit your claim below without knowing any ID number, and your Member ID & Employment Number will auto-populate upon approval.',
    };
  }
  const [first = '', ...rest] = (match.displayName || 'Member').split(' ');
  const depts = (match.ministryIds || []).map(id => (org.ministries || []).find(min => min.id === id)?.name).filter(Boolean) as string[];
  return {
    found: true,
    orgId: org.id,
    orgName: org.name,
    orgLogoUrl: org.logoUrl,
    maskedName: `${maskWord(first)} ${maskWord(rest.join(' '))}`.trim(),
    roleLabel: match.title || getElevateRole(match.roleKey)?.label || 'Member',
    departments: depts,
    memberNumber: match.memberNumber,
    employeeNumber: match.employeeNumber,
  };
}

/** Redeem a pre-provisioned seat directly via Firestore client SDK when server REST endpoint is unavailable. */
async function clientSideClaimSeat(input: ClaimInput): Promise<{ orgId: string; orgName: string; roleLabel: string; memberNumber?: string; employeeNumber?: string }> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const { org, match } = await findProvisionedSeatClientSide(input);
  if (!org || !match) throw new Error('No pre-provisioned seat found for that email or Member ID.');
  const now = Date.now();
  const provUid = match.userId;
  const assignedMemberNumber = match.memberNumber || memberNumberFor(org, { id: match.provisionedPersonId || u.uid });
  const assignedEmployeeNumber = match.employeeNumber || employeeNumberFor(org, { id: match.provisionedPersonId || u.uid });
  const submittedFullName = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(' ').trim();
  const userSnap = await getDoc(doc(db, 'users', u.uid)).catch(() => null);
  const userData = userSnap?.data() as Record<string, any> | undefined;
  const displayName = submittedFullName || userData?.displayName || u.displayName || match.displayName || 'Member';
  const photoUrl = userData?.photoURL || u.photoURL || match.photoUrl || '';

  const existingSnap = await getDocs(query(collection(db, 'orgMemberships'), where('orgId', '==', org.id), where('userId', '==', u.uid))).catch(() => null);
  const existingMine = existingSnap?.docs.find(d => d.id !== match.id);

  const claimedPatch: Record<string, any> = {
    isProvisioned: false,
    claimedAt: now,
    userId: u.uid,
    displayName,
    photoUrl,
    status: 'ACTIVE',
    acceptedAt: now,
    employeeProfileUid: null,
    claimEmailLower: null,
    memberNumber: assignedMemberNumber,
    employeeNumber: assignedEmployeeNumber,
  };

  if (existingMine) {
    await updateDoc(doc(db, 'orgMemberships', existingMine.id), strip({
      ...claimedPatch,
      role: match.role,
      roleKey: match.roleKey,
      title: match.title,
      rosterGroup: match.rosterGroup,
      isEmployee: match.isEmployee,
      ministryIds: match.ministryIds || [],
      ministryRoles: match.ministryRoles || [],
      provisionedPersonId: match.provisionedPersonId,
    }));
    await deleteDoc(doc(db, 'orgMemberships', match.id)).catch(() => {});
  } else {
    await updateDoc(doc(db, 'orgMemberships', match.id), claimedPatch);
  }

  if (provUid && provUid.startsWith('prov_')) {
    await updateDoc(doc(db, 'users', provUid), { claimedByUid: u.uid, claimedAt: now }).catch(() => {});
  }

  if (match.provisionedPersonId) {
    await setDoc(doc(opsDb, 'chmsPeople', match.provisionedPersonId), strip({
      linkedUid: u.uid,
      provisionedUid: null,
      memberNumber: assignedMemberNumber,
      employeeNumber: assignedEmployeeNumber,
      firstName: input.firstName?.trim() || undefined,
      lastName: input.lastName?.trim() || undefined,
      updatedAt: now,
    }), { merge: true }).catch(() => {});
  }

  await syncMemberIndex(org.id, u.uid).catch(() => {});
  await recomputeOrgRoleIndex(org.id).catch(() => {});
  await syncOrgChatForUser(org, { ...match, userId: u.uid, isProvisioned: false }).catch(() => {});

  const roleLabel = match.title || getElevateRole(match.roleKey)?.label || 'Member';
  const curAffs = Array.isArray(userData?.orgAffiliations) ? userData!.orgAffiliations : [];
  const nextAff = strip({
    orgId: org.id,
    orgName: org.name,
    orgLogoUrl: org.logoUrl || undefined,
    roleKey: match.roleKey || 'MEMBER',
    title: roleLabel,
    memberNumber: assignedMemberNumber,
    employeeNumber: assignedEmployeeNumber,
    since: now,
  });
  await setDoc(doc(db, 'users', u.uid), {
    orgAffiliations: [...curAffs.filter((a: any) => a?.orgId !== org.id), nextAff],
  }, { merge: true }).catch(() => {});

  return {
    orgId: org.id,
    orgName: org.name,
    roleLabel,
    memberNumber: assignedMemberNumber,
    employeeNumber: assignedEmployeeNumber,
  };
}

/** Find the seat behind a name, email, or optional member/employee ID. */
export async function lookupProvisionedSeat(input: ClaimInput): Promise<SeatLookup> {
  try {
    const r = await authed('/api/elevate/claim/lookup', input, true);
    if (r.status === 503 || r.status === 404 || r.status === 401) {
      return await clientSideLookupSeat(input);
    }
    const j = await r.json().catch(() => ({})) as SeatLookup & { error?: string };
    if (!r.ok || !j.found) {
      const fallback = await clientSideLookupSeat(input);
      if (fallback.found || fallback.alreadyClaimed) return fallback;
    }
    if (!r.ok) return await clientSideLookupSeat(input);
    return j;
  } catch {
    return await clientSideLookupSeat(input);
  }
}

/** Claim it: the seat becomes the signed-in user's membership. Returns the org id + auto-populated IDs. */
export async function claimProvisionedSeat(input: ClaimInput): Promise<{ orgId: string; orgName: string; roleLabel: string; memberNumber?: string; employeeNumber?: string }> {
  try {
    const r = await authed('/api/elevate/claim/redeem', input);
    const j = await r.json().catch(() => ({})) as { orgId: string; orgName: string; roleLabel: string; memberNumber?: string; employeeNumber?: string; error?: string };
    if (r.ok && j.orgId) {
      try { window.dispatchEvent(new CustomEvent('plajah:elevate-claimed', { detail: j })); } catch { /* */ }
      return j;
    }
  } catch { /* fall through to client-side claim */ }
  const claimed = await clientSideClaimSeat(input);
  try { window.dispatchEvent(new CustomEvent('plajah:elevate-claimed', { detail: claimed })); } catch { /* */ }
  return claimed;
}

// ── Claim invitations by email (routes/elevateInvites.ts) ─────────────────────
export type InviteSkipReason = 'claimed' | 'no_email' | 'bounced' | 'opted_out' | 'cooldown' | 'limit';
export interface InviteSendResult { sent: number; failed: number; skipped: Partial<Record<InviteSkipReason, number>>; remaining: number }

/** Whether this server can send email at all (false until Resend is configured). */
export async function claimInvitesConfigured(): Promise<boolean> {
  try { const r = await fetch('/api/elevate/invites/status'); return r.ok && !!(await r.json()).configured; } catch { return false; }
}

/** Email claim invitations to specific seats, or `all` unclaimed seats. Addresses come from the org's records. */
export async function sendClaimInvites(orgId: string, target: { seatIds: string[] } | { all: true }): Promise<InviteSendResult> {
  const r = await authed('/api/elevate/invites/send', { orgId, ...target });
  const j = await r.json().catch(() => ({})) as InviteSendResult & { error?: string };
  if (!r.ok) throw new Error(j.error || 'Could not send invitations.');
  return j;
}

const SKIP_LABELS: Record<InviteSkipReason, string> = {
  claimed: 'already claimed', no_email: 'no email on file', bounced: 'bounced', opted_out: 'opted out',
  cooldown: 'invited in the last 24 h', limit: 'invited 5 times already',
};
export function describeInviteResult(r: InviteSendResult): string {
  const parts = [`${r.sent} sent`];
  if (r.failed) parts.push(`${r.failed} failed`);
  for (const [k, n] of Object.entries(r.skipped)) if (n) parts.push(`${n} skipped (${SKIP_LABELS[k as InviteSkipReason]})`);
  if (r.remaining) parts.push(`${r.remaining} more waiting — send again tomorrow`);
  return parts.join(' · ') + '.';
}

/** "Invited Oct 29 · bounced" for a seat, or '' if never invited. */
export function inviteStatusLabel(m: Pick<OrgMembership, 'claimInviteStatus' | 'claimInviteSentAt' | 'claimInviteCount'>): string {
  if (!m.claimInviteStatus) return '';
  const when = m.claimInviteSentAt ? new Date(m.claimInviteSentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const base = when ? `Invited ${when}${(m.claimInviteCount || 0) > 1 ? ` (${m.claimInviteCount}×)` : ''}` : '';
  const tail = ({ SENT: '', FAILED: 'last send failed', BOUNCED: 'bounced — check the address', OPTED_OUT: 'they stopped invitations' } as const)[m.claimInviteStatus];
  return [base, tail].filter(Boolean).join(' · ');
}

/** Resolve the org behind a join link (id or @handle). */
export async function resolveJoinTarget(key: string): Promise<Organization | null> {
  const k = (key || '').trim().replace(/^@/, '');
  if (!k) return null;
  const direct = await fetchOrganization(k).catch(() => null);
  if (direct) return direct;
  const s = await getDocs(query(collection(db, 'organizations'), where('handle', '==', k.toLowerCase()))).catch(() => null);
  const d = s?.docs[0];
  return d ? ({ id: d.id, ...d.data() } as Organization) : null;
}
