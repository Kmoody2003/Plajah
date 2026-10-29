// organizationService — CRUD + membership for the Organization primitive (Part 2).
//
// An Organization is a first-class PARALLEL account: a merger of a business page
// and a club. Brand accounts are Organizations (orgType 'BRAND'); the church
// vertical (Part 3) specializes the SAME primitive (orgType 'CHURCH'). This
// service mirrors the proven club pattern (createClub): an org doc in
// `organizations/{id}` + an OWNER row in `orgMemberships/{id}`.

import {
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, limit,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, opsDb, auth } from './firebase';
import { permissionsForMember } from './orgPermissions';
import type { ChurchPrayer, UserProfile } from '../types';
import type { Organization, OrgMembership, OrgMembershipOnboarding, OrgRole, OrgType, Ministry, ServiceTime, GivingFund, RosterGroup } from '../types';

/** Firestore rejects `undefined` field values at any depth — strip them recursively before every write. */
function stripUndefined<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.filter(item => item !== undefined).map(item => stripUndefined(item)) as unknown as T;
  }
  const proto = Object.getPrototypeOf(val);
  if (proto !== null && proto !== Object.prototype) return val; // preserve Firestore FieldValue/Timestamp etc.
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) out[k] = stripUndefined(v);
  }
  return out as T;
}

/** Prefix for Member IDs & Employment Numbers (e.g. "Grace Community Church" → "GCC"). */
function orgIdPrefix(org?: Pick<Organization, 'name' | 'memberNumberPrefix' | 'id'> | null, fallbackId?: string): string {
  if (org?.memberNumberPrefix?.trim()) return org.memberNumberPrefix.trim().toUpperCase().slice(0, 4);
  const initials = (org?.name || '').split(/\s+/).map(w => w[0]).filter(c => /[A-Za-z]/.test(c || '')).join('').toUpperCase().slice(0, 3);
  return initials || (org?.id || fallbackId || 'ORG').slice(0, 3).toUpperCase();
}

function hashDigits(seed: string, min = 10000, span = 90000): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return String(min + (h % span));
}

/** Auto-generate a unique Member ID (e.g. "GCC-48213") when approved on the backend/service. */
export function generateOrgMemberNumber(
  org: Pick<Organization, 'name' | 'memberNumberPrefix' | 'id'> | null | undefined,
  seed: string,
  taken?: Set<string>,
): string {
  const prefix = orgIdPrefix(org, seed);
  let code = `${prefix}-${hashDigits(seed, 10000, 90000)}`;
  let bump = 1;
  while (taken?.has(code)) {
    code = `${prefix}-${hashDigits(`${seed}:${bump++}`, 10000, 90000)}`;
  }
  taken?.add(code);
  return code;
}

/** Auto-generate a unique Employment / Staff Number (e.g. "GCC-EMP-4821") when approved on the backend/service. */
export function generateOrgEmployeeNumber(
  org: Pick<Organization, 'name' | 'memberNumberPrefix' | 'id'> | null | undefined,
  seed: string,
  taken?: Set<string>,
): string {
  const prefix = orgIdPrefix(org, seed);
  let code = `${prefix}-EMP-${hashDigits(`emp:${seed}`, 1000, 9000)}`;
  let bump = 1;
  while (taken?.has(code)) {
    code = `${prefix}-EMP-${hashDigits(`emp:${seed}:${bump++}`, 1000, 9000)}`;
  }
  taken?.add(code);
  return code;
}

/** Open the Elevate Gateway modal (claim existing membership or request membership with onboarding). */
export function openElevateGatewayModal(opts: {
  orgKey?: string;
  mode?: 'home' | 'claim' | 'join' | 'create';
  memberNumber?: string;
}): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plajah:open-elevate-gateway', { detail: opts }));
  }
}

/** plajah-ops rules (back office) authorize against a server-kept copy of the org doc. Refresh it right
 *  after a change instead of waiting on the write trigger, so e.g. a brand-new org's onboarding vault
 *  works at once. Best-effort: the trigger and the periodic reconcile catch up regardless. */
async function refreshOpsMirror(orgId: string): Promise<void> {
  try {
    await fetch('/api/ops-mirror/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: 'organizations', id: orgId }), signal: AbortSignal.timeout(4000),
    });
  } catch { /* trigger / reconcile will catch up */ }
}

export async function createOrganization(data: Partial<Organization> & { orgType: OrgType }): Promise<Organization | null> {
  if (!auth.currentUser) return null;
  const now = Date.now();
  const ref = doc(collection(db, 'organizations'));
  const org: Organization = {
    id: ref.id,
    orgType: data.orgType,
    name: data.name || 'Untitled Organization',
    handle: data.handle,
    tagline: data.tagline,
    about: data.about || '',
    logoUrl: data.logoUrl,
    coverUrl: data.coverUrl,
    accentColor: data.accentColor,
    creatorId: auth.currentUser.uid,
    admins: [auth.currentUser.uid],
    channels: data.channels,
    isPrivate: data.isPrivate ?? false,
    joinProcess: data.joinProcess || 'APPROVAL',
    monthlyPrice: data.monthlyPrice,
    yearlyPrice: data.yearlyPrice,
    roster: data.roster,
    featuredIds: data.featuredIds,
    socialLinks: data.socialLinks,
    category: data.category,
    location: data.location,
    hours: data.hours,
    isVerified: false,
    stripeAccountId: data.stripeAccountId,
    followerCount: 0,
    memberCount: 1,
    isPublic: data.isPublic ?? true,
    isDemo: data.isDemo,
    tags: data.tags,
    legacyBrandId: data.legacyBrandId,
    // Church vertical
    ministries: data.ministries,
    serviceTimes: data.serviceTimes,
    givingFunds: data.givingFunds,
    campuses: data.campuses,
    denomination: data.denomination,
    statementOfFaith: data.statementOfFaith,
    givingUrl: data.givingUrl,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, stripUndefined(org));

  const memberRef = doc(collection(db, 'orgMemberships'));
  const owner: OrgMembership = {
    id: memberRef.id,
    orgId: org.id,
    userId: auth.currentUser.uid,
    role: 'OWNER',
    status: 'ACTIVE',
    displayName: auth.currentUser.displayName || 'Owner',
    photoUrl: auth.currentUser.photoURL || '',
    joinedAt: now,
  };
  await setDoc(memberRef, stripUndefined(owner));
  await refreshOpsMirror(org.id);
  return org;
}

export async function fetchOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, 'organizations', orgId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Organization) : null;
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<void> {
  await updateDoc(doc(db, 'organizations', orgId), { ...stripUndefined(updates), updatedAt: Date.now() });
  await refreshOpsMirror(orgId);
}

export async function deleteOrganization(orgId: string): Promise<void> {
  await deleteDoc(doc(db, 'organizations', orgId));
  await refreshOpsMirror(orgId);
}

/** Public org directory (optionally by type), newest-active first. */
export async function fetchPublicOrganizations(orgType?: OrgType): Promise<Organization[]> {
  // Single equality filter only — a two-equality query (isPublic + orgType) needs a
  // composite index (which fails silently). Filter by orgType server-side, isPublic client-side.
  const q = orgType
    ? query(collection(db, 'organizations'), where('orgType', '==', orgType), limit(80))
    : query(collection(db, 'organizations'), where('isPublic', '==', true), limit(80));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Organization))
    .filter(o => o.isPublic !== false)
    .sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0));
}

/** Orgs the user runs (owner/admin/staff) — from their memberships. */
export async function fetchUserOrganizations(uid: string): Promise<Organization[]> {
  const snap = await getDocs(query(collection(db, 'orgMemberships'), where('userId', '==', uid)));
  const memberships = snap.docs.map(d => d.data() as OrgMembership).filter(m => m.status === 'ACTIVE');
  const orgs = (await Promise.all(memberships.map(m => fetchOrganization(m.orgId).catch(() => null)))).filter(Boolean) as Organization[];
  // Orgs this user created always count as theirs, even if the owner membership row is missing —
  // otherwise a stray duplicate can't be found (or deleted).
  try {
    const created = await getDocs(query(collection(db, 'organizations'), where('creatorId', '==', uid)));
    for (const d of created.docs) if (!orgs.some(o => o.id === d.id)) orgs.push({ id: d.id, ...d.data() } as Organization);
  } catch { /* */ }
  return orgs;
}

export async function fetchOrgMembers(orgId: string): Promise<OrgMembership[]> {
  const snap = await getDocs(query(collection(db, 'orgMemberships'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgMembership));
}

/**
 * Recompute the org's denormalized `staffUids` — the ACTIVE members whose effective permissions
 * include MANAGE_CONTENT (staff/moderators/admins + explicit overrides). Firestore rules read this
 * array to grant Content HQ access to staff (membership docs have random ids, so rules cannot query
 * them). Always derived fresh from the membership source of truth, so it can never drift; only an
 * owner/admin can write the org doc, so a member cannot self-elevate. Best-effort — a failure just
 * defers staff access until the next successful staff mutation.
 */
export async function recomputeOrgStaffUids(orgId: string): Promise<void> {
  try {
    const members = await fetchOrgMembers(orgId);
    const staffUids = Array.from(new Set(
      members.filter(m => m.status === 'ACTIVE' && permissionsForMember(m).has('MANAGE_CONTENT')).map(m => m.userId),
    ));
    await updateDoc(doc(db, 'organizations', orgId), { staffUids, updatedAt: Date.now() });
    await refreshOpsMirror(orgId);
  } catch { /* non-fatal: HQ access falls back to owners/admins until the next staff change */ }
}

/**
 * Elevate: deterministic membership marker orgMemberIndex/{orgId_uid}. Firestore rules cannot query
 * memberships by random id, so thread-comment rules key on this marker (ACTIVE members only, plus
 * the ministry ids they belong to for DEPARTMENT threads). Derived from orgMemberships — best-effort.
 * Call after ANY membership create/accept/remove/role-or-ministry change (exported for elevateService).
 * The server rebuilds it (routes/elevateAccounts.ts /sync-index) — rules refuse a member writing their own
 * marker, since that would let anyone grant themselves members-only and department access. The client write
 * below is the fallback for org admins/pastors when the API is unreachable.
 */
export async function syncMemberIndex(orgId: string, uid: string): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (token) {
      const r = await fetch('/api/elevate/claim/sync-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId, uid }),
      });
      if (r.ok) return;
    }
  } catch { /* API unreachable — try the direct write */ }
  try {
    const snap = await getDocs(query(collection(db, 'orgMemberships'), where('orgId', '==', orgId), where('userId', '==', uid)));
    const active = snap.docs.map(d => d.data() as OrgMembership).filter(m => m.status === 'ACTIVE');
    const ref = doc(db, 'orgMemberIndex', `${orgId}_${uid}`);
    if (!active.length) { await deleteDoc(ref).catch(() => {}); return; }
    const ministryIds = Array.from(new Set(active.flatMap(m => [
      ...(m.ministryIds || []),
      ...(m.ministryRoles || []).map(r => r.ministryId),
    ]).filter(Boolean)));
    await setDoc(ref, { orgId, userId: uid, ministryIds, updatedAt: Date.now() });
  } catch { /* non-fatal: member falls back to following the org to comment */ }
}

/** Resolve the parent org id for a membership doc (staff functions that only carry a membershipId). */
async function orgIdOfMembership(membershipId: string): Promise<string | undefined> {
  try { return (await getDoc(doc(db, 'orgMemberships', membershipId))).data()?.orgId as string | undefined; }
  catch { return undefined; }
}

/**
 * Request or join an organization as a member.
 *
 * NOTE: Following an org (`followOrg`) is for public updates and requires no approval.
 * Org Membership is for real people who belong to the organization and ALWAYS defaults
 * to `status: 'PENDING'` requiring approval from the org's leadership (unless redeemed
 * via a pre-approved invite or provisioned seat claim).
 *
 * Also supports attaching `onboarding` (`OrgMembershipOnboarding`) so the membership
 * request doubles as church/org member onboarding.
 */
export async function joinOrganization(
  orgId: string,
  opts?: {
    role?: OrgRole;
    title?: string;
    status?: OrgMembership['status'];
    roleKey?: string;
    rosterGroup?: RosterGroup;
    ministryIds?: string[];
    onboarding?: OrgMembershipOnboarding;
    aboutInOrg?: string;
  },
): Promise<OrgMembership | null> {
  if (!auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const now = Date.now();

  // Check if the user already has a membership record (ACTIVE or PENDING) for this org
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'orgMemberships'), where('orgId', '==', orgId), where('userId', '==', uid)),
    );
    const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as OrgMembership)).find(m => m.status === 'ACTIVE' || m.status === 'PENDING');
    if (existing) return existing;
  } catch { /* fall through */ }

  const fullName = opts?.onboarding
    ? `${opts.onboarding.firstName} ${opts.onboarding.lastName}`.trim()
    : '';
  const displayName = fullName || auth.currentUser.displayName || 'Member';
  const ref = doc(collection(db, 'orgMemberships'));

  // Strict Sanctuary Privacy: never store raw phone, email, street address, or birthDate on public-readable orgMemberships docs.
  // Those live exclusively in `orgOnboardingVault/{membershipId}` and `chmsPeople/{id}` (readable only by the member & authorized church staff).
  const safePublicOnboarding: OrgMembershipOnboarding | undefined = opts?.onboarding
    ? stripUndefined({
        firstName: opts.onboarding.firstName,
        lastName: opts.onboarding.lastName,
        preferredName: opts.onboarding.preferredName,
        memberNumber: opts.onboarding.memberNumber ? opts.onboarding.memberNumber.trim().toUpperCase() : undefined,
        employeeNumber: opts.onboarding.employeeNumber ? opts.onboarding.employeeNumber.trim().toUpperCase() : undefined,
        requestedRoleKey: opts.onboarding.requestedRoleKey,
        ministryIds: opts.onboarding.ministryIds,
        skills: opts.onboarding.skills,
        isExistingCongregant: opts.onboarding.isExistingCongregant,
        directoryVisible: opts.onboarding.directoryVisible ?? false,
        hasPrivateVault: true,
        submittedAt: opts.onboarding.submittedAt || now,
      })
    : undefined;

  const membership: OrgMembership = stripUndefined({
    id: ref.id,
    orgId,
    userId: uid,
    role: opts?.role || 'MEMBER',
    status: opts?.status || 'PENDING',
    displayName,
    photoUrl: auth.currentUser.photoURL || '',
    title: opts?.title || 'Member',
    joinedAt: now,
    roleKey: opts?.roleKey || opts?.onboarding?.requestedRoleKey || 'MEMBER',
    rosterGroup: opts?.rosterGroup || 'MEMBER',
    source: 'SELF_APPLIED',
    ministryIds: opts?.ministryIds?.length ? opts.ministryIds : opts?.onboarding?.ministryIds,
    memberNumber: opts?.onboarding?.memberNumber ? opts.onboarding.memberNumber.trim().toUpperCase() : undefined,
    employeeNumber: opts?.onboarding?.employeeNumber ? opts.onboarding.employeeNumber.trim().toUpperCase() : undefined,
    onboarding: safePublicOnboarding,
  });
  await setDoc(ref, membership);

  // Persist private contact, address, household, and pastoral care notes into the restricted `orgOnboardingVault/{membershipId}` collection
  if (opts?.onboarding) {
    try {
      await setDoc(
        doc(opsDb, 'orgOnboardingVault', ref.id),
        stripUndefined({
          id: ref.id,
          membershipId: ref.id,
          orgId,
          userId: uid,
          ...opts.onboarding,
          email: (opts.onboarding.email || auth.currentUser.email || '').trim().toLowerCase() || undefined,
          directoryVisible: opts.onboarding.directoryVisible ?? false,
          submittedAt: opts.onboarding.submittedAt || now,
          updatedAt: now,
        }),
      );
    } catch { /* non-blocking if rules not yet deployed */ }
  }

  if (membership.status === 'ACTIVE') {
    await syncMemberIndex(orgId, membership.userId);
  } else {
    // Notify org leadership of the pending membership onboarding request (best-effort)
    try {
      const org = await fetchOrganization(orgId);
      const recipients = Array.from(new Set([org?.creatorId, ...(org?.admins || []), ...((org as any)?.pastorUids || [])].filter(Boolean) as string[]));
      for (const adminUid of recipients.slice(0, 5)) {
        if (adminUid === uid) continue;
        const notifRef = doc(collection(db, 'notifications'));
        await setDoc(notifRef, {
          id: notifRef.id,
          userId: adminUid,
          senderId: uid,
          senderName: displayName,
          senderPhoto: auth.currentUser.photoURL || '',
          type: 'SYSTEM',
          title: `Membership claim & onboarding · ${org?.name || 'Organization'}`,
          message: `${displayName} submitted their membership onboarding for ${org?.name || 'your organization'}. Approving will auto-populate their Member ID, Employment #, and Church Directory record.`,
          isRead: false,
          timestamp: now,
          targetId: orgId,
        });
      }
    } catch { /* non-blocking */ }
  }
  return membership;
}

/** Fetch the restricted private onboarding vault record (accessible only to the member themselves or authorized org staff). */
export async function fetchOnboardingVault(membershipId: string): Promise<OrgMembershipOnboarding | null> {
  try {
    const snap = await getDoc(doc(opsDb, 'orgOnboardingVault', membershipId));
    return snap.exists() ? (snap.data() as OrgMembershipOnboarding) : null;
  } catch {
    return null;
  }
}

/** Explicit alias for submitting a membership request with onboarding details (always PENDING approval). */
export async function requestOrgMembership(
  orgId: string,
  onboarding: Omit<OrgMembershipOnboarding, 'submittedAt'>,
): Promise<OrgMembership | null> {
  return joinOrganization(orgId, {
    role: 'MEMBER',
    status: 'PENDING',
    roleKey: onboarding.requestedRoleKey || 'MEMBER',
    rosterGroup: 'MEMBER',
    ministryIds: onboarding.ministryIds,
    onboarding: stripUndefined({
      ...onboarding,
      submittedAt: Date.now(),
    }),
  });
}

export interface ProfileOrgSummary {
  orgId: string;
  orgName: string;
  orgLogoUrl?: string;
  orgType?: OrgType;
  tagline?: string;
  roleTitle?: string;
  ministryName?: string;
  isOfficialAccount?: boolean;
}

/**
 * Resolve all organizations linked to or affiliated with a user profile so visitors on
 * that account's page can open the Org/Elevate page, Follow the org, or Claim / Request
 * their Org Membership.
 */
export async function fetchProfileOrganizations(profile: UserProfile): Promise<ProfileOrgSummary[]> {
  if (!profile?.uid) return [];
  const byId = new Map<string, ProfileOrgSummary>();

  // 1. Direct linkedOrgId (official org/brand account) or employerOrgId (staff/provisioned seat)
  const directIds = Array.from(new Set([profile.linkedOrgId, (profile as any).employerOrgId].filter(Boolean) as string[]));
  for (const orgId of directIds) {
    const o = await fetchOrganization(orgId).catch(() => null);
    if (o) {
      byId.set(o.id, {
        orgId: o.id,
        orgName: o.name,
        orgLogoUrl: o.logoUrl,
        orgType: o.orgType,
        tagline: o.tagline,
        roleTitle: profile.linkedOrgId === o.id ? 'Official Organization Page' : ((profile as any).title || 'Team Member'),
        isOfficialAccount: profile.linkedOrgId === o.id,
      });
    }
  }

  // 2. Synced orgAffiliations on the profile
  if (Array.isArray(profile.orgAffiliations)) {
    for (const a of profile.orgAffiliations) {
      if (!a?.orgId || byId.has(a.orgId)) continue;
      byId.set(a.orgId, {
        orgId: a.orgId,
        orgName: a.orgName,
        orgLogoUrl: a.orgLogoUrl,
        roleTitle: a.title,
        ministryName: a.ministryName,
      });
    }
  }

  // 3. Fallback: if this is an ORGANIZATION / BRAND / CLERGY account (or has no inline orgs yet),
  // check organizations where accountUid == uid or creatorId == uid.
  if (byId.size === 0) {
    try {
      const [acctSnap, creatorSnap] = await Promise.all([
        getDocs(query(collection(db, 'organizations'), where('accountUid', '==', profile.uid), limit(4))).catch(() => null),
        (profile.accountType === 'ORGANIZATION' || profile.accountType === 'BRAND' || profile.accountType === 'CLERGY')
          ? getDocs(query(collection(db, 'organizations'), where('creatorId', '==', profile.uid), limit(4))).catch(() => null)
          : Promise.resolve(null),
      ]);
      const docs = [...(acctSnap?.docs || []), ...(creatorSnap?.docs || [])];
      for (const d of docs) {
        const o = { id: d.id, ...d.data() } as Organization;
        if (o.isPublic === false || byId.has(o.id)) continue;
        byId.set(o.id, {
          orgId: o.id,
          orgName: o.name,
          orgLogoUrl: o.logoUrl,
          orgType: o.orgType,
          tagline: o.tagline,
          roleTitle: o.accountUid === profile.uid ? 'Official Organization Page' : 'Founder / Leader',
          isOfficialAccount: o.accountUid === profile.uid,
        });
      }
    } catch { /* non-fatal */ }
  }

  return Array.from(byId.values());
}

/** Add / promote a staff member (owner/admin action). */
export async function setOrgMemberRole(membershipId: string, role: OrgRole, title?: string): Promise<void> {
  await updateDoc(doc(db, 'orgMemberships', membershipId), stripUndefined({ role, title }));
  const orgId = await orgIdOfMembership(membershipId);
  if (orgId) await recomputeOrgStaffUids(orgId);
}

/** Owner/admin adds another user to the org's staff. */
export async function addOrgMember(orgId: string, member: { userId: string; displayName: string; photoUrl?: string; role?: OrgRole; title?: string }): Promise<OrgMembership | null> {
  const ref = doc(collection(db, 'orgMemberships'));
  const m: OrgMembership = {
    id: ref.id, orgId, userId: member.userId,
    role: member.role || 'STAFF', status: 'ACTIVE',
    displayName: member.displayName, photoUrl: member.photoUrl, title: member.title,
    joinedAt: Date.now(),
  };
  await setDoc(ref, stripUndefined(m));
  await recomputeOrgStaffUids(orgId);
  await syncMemberIndex(orgId, m.userId);
  return m;
}

export async function removeOrgMember(membershipId: string): Promise<void> {
  const prev = (await getDoc(doc(db, 'orgMemberships', membershipId)).catch(() => null))?.data();
  const orgId = prev?.orgId as string | undefined;
  await deleteDoc(doc(db, 'orgMemberships', membershipId));
  if (orgId) await recomputeOrgStaffUids(orgId);
  if (orgId && prev?.userId) await syncMemberIndex(orgId, prev.userId);
}

/** Grant/revoke edit rights by putting a member's uid in (or out of) org.admins. */
export async function setOrgAdmin(orgId: string, uid: string, isAdmin: boolean, currentAdmins: string[]): Promise<string[]> {
  const admins = isAdmin ? Array.from(new Set([...currentAdmins, uid])) : currentAdmins.filter(a => a !== uid);
  await updateOrganization(orgId, { admins });
  return admins;
}

// ── Employees: managed profiles + apply→accept handshake ────────────────────
// Two ways someone becomes an employee:
//   1. The owner CREATES a managed profile (no login) — instantly ACTIVE. A real person can
//      later claim it (claimEmployeeProfile) to link it into their own account/switcher.
//   2. A real user SELF-APPLIES (applyToOrg → PENDING); an owner/admin accepts (acceptOrgMember).
// UI gates these with orgCan(...); Firestore rules enforce that only the org's admins can write.

/** All memberships for a user (any status) — powers the identity switcher's employee identities. */
export async function fetchUserMemberships(uid: string): Promise<OrgMembership[]> {
  const snap = await getDocs(query(collection(db, 'orgMemberships'), where('userId', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgMembership));
}

/** Owner/admin creates a managed EMPLOYEE profile (Firestore-only, no login) + an ACTIVE membership. */
export async function createManagedEmployee(
  orgId: string,
  data: { displayName: string; roleKey?: string; role?: OrgRole; title?: string; photoURL?: string },
): Promise<{ employee: UserProfile; membership: OrgMembership } | null> {
  if (!auth.currentUser) return null;
  const now = Date.now();
  const employeeUid = `emp_${orgId.slice(0, 6)}_${Math.random().toString(36).slice(2, 9)}`;
  const employee = {
    uid: employeeUid,
    displayName: data.displayName || 'Employee',
    photoURL: data.photoURL || '',
    email: '',
    accountType: 'EMPLOYEE',
    isEmployee: true,
    employerOrgId: orgId,
    managedByUid: auth.currentUser.uid,
    followerCount: 0,
    followingCount: 0,
    createdAt: now,
  } as UserProfile;
  await setDoc(doc(db, 'users', employeeUid), stripUndefined(employee as any));

  const memberRef = doc(collection(db, 'orgMemberships'));
  const membership: OrgMembership = {
    id: memberRef.id,
    orgId,
    userId: employeeUid,
    role: data.role || 'STAFF',
    status: 'ACTIVE',
    displayName: employee.displayName,
    photoUrl: employee.photoURL,
    title: data.title,
    joinedAt: now,
    roleKey: data.roleKey,
    isEmployee: true,
    employeeProfileUid: employeeUid,
    source: 'OWNER_CREATED',
    invitedBy: auth.currentUser.uid,
    acceptedAt: now,
  };
  await setDoc(memberRef, stripUndefined(membership));
  await recomputeOrgStaffUids(orgId);
  return { employee, membership };
}

/** A real user applies to work at an org — creates a PENDING membership for the owner to accept. */
export async function applyToOrg(
  orgId: string,
  opts?: { roleKey?: string; role?: OrgRole; title?: string },
): Promise<OrgMembership | null> {
  if (!auth.currentUser) return null;
  const now = Date.now();
  const ref = doc(collection(db, 'orgMemberships'));
  const membership: OrgMembership = {
    id: ref.id,
    orgId,
    userId: auth.currentUser.uid,
    role: opts?.role || 'MEMBER',
    status: 'PENDING',
    displayName: auth.currentUser.displayName || 'Applicant',
    photoUrl: auth.currentUser.photoURL || '',
    title: opts?.title,
    joinedAt: now,
    roleKey: opts?.roleKey,
    isEmployee: true,
    source: 'SELF_APPLIED',
  };
  await setDoc(ref, stripUndefined(membership));
  return membership;
}

/**
 * Owner/admin/pastor accepts a PENDING applicant → ACTIVE (optionally setting their final role/roleKey).
 * Automatically generates and populates the member's `memberNumber` (e.g. GCC-48213) and `employeeNumber`
 * (e.g. GCC-EMP-4821) on the backend upon approval so users can claim/onboard without knowing their IDs upfront.
 * Also populates the church's private `chmsPeople` & `chmsHouseholds` records from `orgOnboardingVault`.
 */
export async function acceptOrgMember(membershipId: string, role?: OrgRole, roleKeyOverride?: string): Promise<void> {
  const now = Date.now();
  const memSnap = await getDoc(doc(db, 'orgMemberships', membershipId)).catch(() => null);
  const memData = (memSnap?.exists() ? memSnap.data() : undefined) as OrgMembership | undefined;
  const orgId = memData?.orgId;
  const uid = memData?.userId;

  const [org, vault] = await Promise.all([
    orgId ? fetchOrganization(orgId).catch(() => null) : Promise.resolve(null),
    fetchOnboardingVault(membershipId),
  ]);

  const ob: Partial<OrgMembershipOnboarding> = {
    ...(memData?.onboarding || {}),
    ...(vault || {}),
  };

  const finalRoleKey = roleKeyOverride || ob.requestedRoleKey || memData?.roleKey || 'MEMBER';
  const finalRole: OrgRole = role || memData?.role || (finalRoleKey === 'STAFF' || finalRoleKey === 'PASTOR' || finalRoleKey === 'SENIOR_PASTOR' || finalRoleKey === 'DEPARTMENT_HEAD' ? 'STAFF' : 'MEMBER');
  const isStaffOrLeader = finalRole !== 'MEMBER' || ['SENIOR_PASTOR', 'PASTOR', 'MINISTER', 'ELDER', 'DEACON', 'DEPARTMENT_HEAD', 'FINANCE_DIRECTOR', 'TREASURER', 'BOOKKEEPER', 'ACCOUNTANT', 'TRUSTEE', 'STAFF', 'MEDIA_TEAM'].includes(finalRoleKey);

  let assignedMemberNumber = (ob.memberNumber || memData?.memberNumber || '').trim().toUpperCase();
  let assignedEmployeeNumber = (ob.employeeNumber || memData?.employeeNumber || '').trim().toUpperCase();

  // Look up existing chmsPeople records to match by uid, memberNumber, email, or full name and ensure ID uniqueness
  let existingPeople: any[] = [];
  let matched: any = null;
  if (orgId && uid) {
    try {
      const peopleSnap = await getDocs(query(collection(opsDb, 'chmsPeople'), where('orgId', '==', orgId))).catch(() => null);
      existingPeople = (peopleSnap?.docs || []).map(d => ({ id: d.id, ...d.data() } as any));
      const fullTarget = `${ob.firstName || ''} ${ob.lastName || ''}`.trim().toLowerCase() || (memData?.displayName || '').trim().toLowerCase();
      matched = existingPeople.find(p =>
        p.linkedUid === uid ||
        (assignedMemberNumber && p.memberNumber && String(p.memberNumber).toUpperCase() === assignedMemberNumber) ||
        (assignedEmployeeNumber && p.employeeNumber && String(p.employeeNumber).toUpperCase() === assignedEmployeeNumber) ||
        (ob.email && p.email && String(p.email).toLowerCase() === ob.email.trim().toLowerCase()) ||
        (fullTarget && `${p.firstName || ''} ${p.lastName || ''}`.trim().toLowerCase() === fullTarget),
      );
    } catch { /* non-blocking */ }
  }

  const takenMemberIds = new Set(existingPeople.map(p => String(p.memberNumber || '').toUpperCase()).filter(Boolean));
  const takenEmpIds = new Set(existingPeople.map(p => String(p.employeeNumber || '').toUpperCase()).filter(Boolean));

  if (!assignedMemberNumber) {
    assignedMemberNumber = matched?.memberNumber
      ? String(matched.memberNumber).toUpperCase()
      : generateOrgMemberNumber(org, matched?.id || uid || membershipId, takenMemberIds);
  }
  if (!assignedEmployeeNumber) {
    assignedEmployeeNumber = matched?.employeeNumber
      ? String(matched.employeeNumber).toUpperCase()
      : generateOrgEmployeeNumber(org, matched?.id || uid || membershipId, takenEmpIds);
  }

  await updateDoc(
    doc(db, 'orgMemberships', membershipId),
    stripUndefined({
      status: 'ACTIVE',
      acceptedAt: now,
      role: finalRole,
      roleKey: finalRoleKey,
      rosterGroup: memData?.rosterGroup || (isStaffOrLeader ? 'STAFF' : 'MEMBER'),
      isEmployee: memData?.isEmployee ?? isStaffOrLeader,
      memberNumber: assignedMemberNumber,
      employeeNumber: assignedEmployeeNumber,
      onboarding: memData?.onboarding
        ? stripUndefined({
            ...memData.onboarding,
            memberNumber: assignedMemberNumber,
            employeeNumber: assignedEmployeeNumber,
          })
        : undefined,
    }),
  );

  if (orgId) await recomputeOrgStaffUids(orgId);
  if (orgId && uid) await syncMemberIndex(orgId, uid);

  // Populate or update the church's private congregation record (`chmsPeople`) and household (`chmsHouseholds`)
  if (orgId && uid && memData) {
    try {
      const nameParts = (memData.displayName || 'Member').trim().split(/\s+/);
      const firstName = ob.firstName?.trim() || nameParts[0] || 'Member';
      const lastName = ob.lastName?.trim() || nameParts.slice(1).join(' ') || '';
      const hasAddress = !!(ob.address?.line1 || ob.address?.city || ob.address?.region || ob.address?.postal);

      let householdId = matched?.householdId as string | undefined;
      if (!householdId && (hasAddress || ob.familyMembers?.trim() || ob.householdNote?.trim())) {
        try {
          const hRef = doc(collection(opsDb, 'chmsHouseholds'));
          householdId = hRef.id;
          await setDoc(hRef, stripUndefined({
            id: hRef.id,
            orgId,
            name: `${lastName || firstName} Household`,
            address: hasAddress ? ob.address : undefined,
            notes: [ob.familyMembers ? `Family members: ${ob.familyMembers}` : '', ob.householdNote || ''].filter(Boolean).join(' · ') || undefined,
            createdAt: now,
            updatedAt: now,
          }));
        } catch { /* non-blocking */ }
      }

      if (matched) {
        await updateDoc(doc(opsDb, 'chmsPeople', matched.id), stripUndefined({
          linkedUid: uid,
          status: 'MEMBER',
          preferredName: ob.preferredName || matched.preferredName,
          phone: ob.phone || matched.phone,
          email: ob.email || matched.email,
          address: hasAddress ? ob.address : matched.address,
          birthDate: ob.birthDate || matched.birthDate,
          maritalStatus: ob.maritalStatus || matched.maritalStatus,
          skills: ob.skills?.length ? ob.skills : matched.skills,
          householdId: householdId || matched.householdId,
          memberNumber: assignedMemberNumber,
          employeeNumber: assignedEmployeeNumber,
          directoryVisible: ob.directoryVisible ?? matched.directoryVisible ?? false,
          ministryIds: memData.ministryIds || ob.ministryIds || matched.ministryIds,
          updatedAt: now,
        }));
      } else {
        const pRef = doc(collection(opsDb, 'chmsPeople'));
        await setDoc(pRef, stripUndefined({
          id: pRef.id,
          orgId,
          householdId,
          householdRole: householdId ? 'HEAD' : undefined,
          firstName,
          lastName,
          preferredName: ob.preferredName || undefined,
          email: ob.email || undefined,
          phone: ob.phone || undefined,
          address: hasAddress ? ob.address : undefined,
          birthDate: ob.birthDate || undefined,
          maritalStatus: ob.maritalStatus || undefined,
          skills: ob.skills?.length ? ob.skills : undefined,
          memberNumber: assignedMemberNumber,
          employeeNumber: assignedEmployeeNumber,
          directoryVisible: ob.directoryVisible ?? false,
          status: 'MEMBER',
          memberSince: new Date(now).toISOString().slice(0, 10),
          joinedAt: now,
          linkedUid: uid,
          ministryIds: memData.ministryIds || ob.ministryIds || [],
          notes: [ob.note, ob.householdNote, ob.familyMembers ? `Family: ${ob.familyMembers}` : ''].filter(Boolean).join(' | ') || undefined,
          createdAt: now,
          updatedAt: now,
        }));
      }
    } catch { /* non-blocking if caller is not chmsPeopleStaff */ }

    // Notify the approved member with their auto-populated Member ID & Employment Number
    try {
      const notifRef = doc(collection(db, 'notifications'));
      await setDoc(notifRef, {
        id: notifRef.id,
        userId: uid,
        senderId: auth.currentUser?.uid || orgId,
        senderName: org?.name || 'Organization',
        senderPhoto: org?.logoUrl || '',
        type: 'SYSTEM',
        title: `Membership approved · ${org?.name || 'Organization'} 🎉`,
        message: `Your membership at ${org?.name || 'the organization'} is approved! Your Member ID (${assignedMemberNumber}) and Staff/Employment ID (${assignedEmployeeNumber}) have been automatically populated on your account.`,
        isRead: false,
        timestamp: now,
        targetId: orgId,
      });
    } catch { /* non-blocking */ }
  }
}

/** Owner/admin declines a PENDING applicant (removes the request and any private onboarding vault entry). */
export async function declineOrgMember(membershipId: string): Promise<void> {
  await deleteDoc(doc(db, 'orgMemberships', membershipId));
  await deleteDoc(doc(opsDb, 'orgOnboardingVault', membershipId)).catch(() => {});
}

/**
 * A real user claims a managed employee profile, linking it to their account: re-points the
 * managed profile's memberships to the real uid (so the employee identity appears in the user's
 * switcher) and stamps claimedByUid. The user keeps their personal identity separate — this only
 * links the work identity in; it never merges the two accounts.
 */
export async function claimEmployeeProfile(employeeUid: string, personalUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', employeeUid), { claimedByUid: personalUid });
  const snap = await getDocs(query(collection(db, 'orgMemberships'), where('employeeProfileUid', '==', employeeUid)));
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { userId: personalUid })));
}

/** Recorded gifts for a church (from the `donations` collection). */
export async function fetchChurchDonations(churchId: string): Promise<Array<{ fund?: string; amount: number }>> {
  try {
    const snap = await getDocs(query(collection(opsDb, 'donations'), where('churchId', '==', churchId)));
    return snap.docs.map(d => d.data() as any).map(x => ({ fund: x.fund, amount: Number(x.amount) || 0 }));
  } catch { return []; }
}

/** Sum recorded gifts by fund name — the live "raised" total per fund. */
export function sumDonationsByFund(donations: Array<{ fund?: string; amount: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of donations) { const f = d.fund || 'General'; out[f] = (out[f] || 0) + d.amount; }
  return out;
}

// ── Prayer wall (church/org community feature) ──────────────────────────────────
export async function submitChurchPrayer(orgId: string, request: string, isPrivate = false): Promise<string | null> {
  if (!auth.currentUser || !request.trim()) return null;
  const ref = doc(collection(opsDb, 'churchPrayers'));
  const prayer: ChurchPrayer = {
    id: ref.id, orgId,
    authorId: auth.currentUser.uid,
    authorName: auth.currentUser.displayName || 'Member',
    authorPhoto: auth.currentUser.photoURL || '',
    request: request.trim(),
    isPrivate,
    prayingIds: [],
    timestamp: Date.now(),
  };
  await setDoc(ref, prayer);
  return ref.id;
}

/** `canSeePrivate` = pastor / minister / prayer warrior / admin. Everyone else only queries the public wall (rules enforce this). */
export function listenToChurchPrayers(orgId: string, callback: (prayers: ChurchPrayer[]) => void, canSeePrivate = true) {
  const q = canSeePrivate
    ? query(collection(opsDb, 'churchPrayers'), where('orgId', '==', orgId), limit(100))
    : query(collection(opsDb, 'churchPrayers'), where('orgId', '==', orgId), where('isPrivate', '==', false), limit(100));
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChurchPrayer)).sort((a, b) => b.timestamp - a.timestamp)),
    err => console.warn('[church] prayers listener:', err.message),
  );
}

export async function toggleChurchPraying(prayerId: string, praying: boolean): Promise<void> {
  if (!auth.currentUser) return;
  await updateDoc(doc(opsDb, 'churchPrayers', prayerId), {
    prayingIds: praying ? arrayUnion(auth.currentUser.uid) : arrayRemove(auth.currentUser.uid),
  });
}

export async function markChurchPrayerAnswered(prayerId: string, answered: boolean, answeredNote?: string): Promise<void> {
  await updateDoc(doc(opsDb, 'churchPrayers', prayerId), { answered, ...(answeredNote ? { answeredNote } : {}) });
}

export async function deleteChurchPrayer(prayerId: string): Promise<void> {
  await deleteDoc(doc(opsDb, 'churchPrayers', prayerId));
}

// ── Legacy brand migration (slice 5) ────────────────────────────────────────
// Fold the old BrandAccount records (brand_accounts collection) into real
// Organizations. Idempotent: an org carries legacyBrandId so a brand migrates once.

export async function fetchUnmigratedBrands(): Promise<Array<{ id: string; name?: string; description?: string; logoUrl?: string; coverUrl?: string }>> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'brand_accounts'), where('managers', 'array-contains', uid)));
    const brands = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const orgs = await fetchUserOrganizations(uid);
    const migrated = new Set(orgs.map(o => o.legacyBrandId).filter(Boolean));
    return brands.filter(b => !migrated.has(b.id));
  } catch { return []; }
}

// ── Church vertical helpers (Part 3) ────────────────────────────────────────
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** Stand up a fully-structured demo church to showcase the vertical.
 *  Idempotent — if a demo church already exists it's returned instead of
 *  creating a duplicate, so "turn on the demo church" is safe to call repeatedly. */
export async function createDemoChurch(): Promise<Organization | null> {
  try {
    const existing = await fetchPublicOrganizations('CHURCH');
    const demo = existing.find(o => o.isDemo && (o.name || '').startsWith('Grace Chapel'));
    if (demo) return demo;
  } catch { /* fall through to create */ }
  const ministries: Ministry[] = [
    { id: rid('min'), name: 'Youth Ministry',   description: 'Middle & high school students.', meetingTime: 'Wednesdays 7:00 PM', iconEmoji: '🔥' },
    { id: rid('min'), name: 'Worship',          description: 'Music & production team.',       meetingTime: 'Thursdays 6:30 PM', iconEmoji: '🎵' },
    { id: rid('min'), name: "Women's Fellowship", description: 'Study, prayer & community.',    meetingTime: 'Tuesdays 10:00 AM', iconEmoji: '💐' },
    { id: rid('min'), name: 'Kids / Sunday School', description: 'Nursery through 5th grade.',  meetingTime: 'Sundays 10:00 AM', iconEmoji: '🧒' },
    { id: rid('min'), name: 'Prayer',           description: 'Intercessory prayer team.',       meetingTime: 'Daily 6:00 AM', iconEmoji: '🙏' },
    { id: rid('min'), name: 'Outreach & Missions', description: 'Local & global service.',       meetingTime: 'Monthly', iconEmoji: '🌍' },
  ];
  const serviceTimes: ServiceTime[] = [
    { id: rid('svc'), label: 'Sunday Worship', day: 'Sunday', time: '10:00 AM', isOnline: true },
    { id: rid('svc'), label: 'Sunday Evening', day: 'Sunday', time: '6:00 PM' },
    { id: rid('svc'), label: 'Midweek Service', day: 'Wednesday', time: '7:00 PM', isOnline: true },
  ];
  const givingFunds: GivingFund[] = [
    { id: rid('fund'), name: 'General', description: 'Supports the everyday ministry of the church.', goal: 100000, raised: 62500 },
    { id: rid('fund'), name: 'Missions', description: 'Local & global outreach.', goal: 40000, raised: 18200 },
    { id: rid('fund'), name: 'Building', description: 'Facilities & expansion.', goal: 250000, raised: 91000 },
  ];
  return createOrganization({
    orgType: 'CHURCH',
    name: 'Grace Chapel (Demo)',
    tagline: 'A place to belong, believe, and become.',
    about: 'A demo church showcasing the Plajah ministry platform — sub-ministries, staff, service times, streaming, giving, and a sacred library, all under one roof.',
    category: 'Non-denominational',
    denomination: 'Non-denominational',
    statementOfFaith: 'We believe in the good news of Jesus Christ and the call to love God and neighbor.',
    isDemo: true,
    ministries,
    serviceTimes,
    givingFunds,
    campuses: [
      { id: rid('cmp'), name: 'Downtown Campus', location: 'Main St', isPrimary: true },
      { id: rid('cmp'), name: 'North Campus', location: 'Northside' },
      { id: rid('cmp'), name: 'Online Campus', location: 'Everywhere' },
    ],
    location: { city: 'Anytown, USA' },
    socialLinks: { website: '' },
  });
}

/** Create an Organization for each of the user's un-migrated legacy brands. */
export async function migrateLegacyBrands(): Promise<Organization[]> {
  const brands = await fetchUnmigratedBrands();
  const created: Organization[] = [];
  for (const b of brands) {
    const org = await createOrganization({
      orgType: 'BRAND',
      name: b.name || 'Brand',
      about: b.description || '',
      logoUrl: b.logoUrl,
      coverUrl: b.coverUrl,
      legacyBrandId: b.id,
    }).catch(() => null);
    if (org) created.push(org);
  }
  // Link the account to its first migrated brand org (account <-> org stay in sync) unless already linked.
  try {
    const uid = auth.currentUser?.uid;
    if (uid && created[0]) {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!(snap.data() as any)?.linkedOrgId) {
        await updateDoc(doc(db, 'users', uid), { linkedOrgId: created[0].id });
        await updateOrganization(created[0].id, { accountUid: uid });
      }
    }
  } catch { /* non-fatal */ }
  return created;
}
