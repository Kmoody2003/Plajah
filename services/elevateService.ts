// elevateService — the real backend behind the Elevate setup + operations flow.
//
//   • setupElevateOrg      – create an org of a chosen kind, seed default departments, owner = Senior Pastor/lead
//   • createOrgFromAccount – ORGANIZATION / BRAND account → auto-create + link its org (account ⇄ org stay in sync)
//   • departments          – add / rename / reorder / set heads / thread audience
//   • roles + rosters      – assign roles (gated by canAssignRole), roster groups, org-specific about blurbs
//   • invites              – shareable link / QR / email tokens that set up a role (redeem validated by Firestore rules)
//   • profile sync         – mirror a person's org role onto users/{uid}.orgAffiliations (unlimited orgs)
//   • recomputeOrgRoleIndex– denormalized pastor/finance/prayer/leader uid arrays that Firestore rules read

import {
  collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, runTransaction, deleteDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { createOrganization, updateOrganization, fetchOrganization, fetchOrgMembers, syncMemberIndex } from './organizationService';
import { elevatePermissions, getElevateRole, canAssignRole } from './elevateRoles';
import { defaultMinistries, leadTitleFor } from './elevateTemplates';
import { isOrgOwner } from './orgPermissions';
import type {
  Organization, OrgMembership, OrgType, Ministry, OrgInvite, OrgAffiliation, RosterGroup, AccountType,
} from '../types';

const strip = <T extends Record<string, any>>(o: T): T => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
};
const newId = () => Math.random().toString(36).slice(2, 10);
const newToken = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
};

// ── Setup ────────────────────────────────────────────────────────────────────

export interface SetupElevateOptions {
  orgType: OrgType;
  name: string;
  tagline?: string;
  about?: string;
  denomination?: string;
  orgKindLabel?: string;
  logoUrl?: string;
  coverUrl?: string;
  /** Link the org to the signed-in account (account IS the org). */
  linkAccount?: boolean;
  seedDepartments?: boolean;
  /** Explicit (edited) department list; overrides the default seed. */
  ministries?: Ministry[];
}

/** Create the org, seed default departments, make the creator its lead, and (optionally) link their account. */
export async function setupElevateOrg(opts: SetupElevateOptions): Promise<Organization | null> {
  const u = auth.currentUser;
  if (!u) return null;
  const ministries = opts.ministries ? opts.ministries.map(m => strip(m) as Ministry) : opts.seedDepartments === false ? [] : defaultMinistries(opts.orgType);
  const org = await createOrganization({
    orgType: opts.orgType,
    name: opts.name,
    tagline: opts.tagline,
    about: opts.about || '',
    denomination: opts.denomination,
    logoUrl: opts.logoUrl,
    coverUrl: opts.coverUrl,
    ministries,
    isPublic: true,
  });
  if (!org) return null;
  const patch: Partial<Organization> = {
    orgKindLabel: opts.orgKindLabel,
    accountUid: opts.linkAccount ? u.uid : undefined,
    threadAudience: 'ORG',
    setupState: { departmentsSeeded: ministries.length > 0 },
  };
  await updateOrganization(org.id, patch);
  Object.assign(org, patch, { ministries });
  // Creator becomes the lead (Senior Pastor / Director) on the pastoral roster.
  const mem = (await fetchOrgMembers(org.id)).find(m => m.userId === u.uid);
  if (mem) {
    await updateDoc(doc(db, 'orgMemberships', mem.id), strip({
      roleKey: 'SENIOR_PASTOR', title: leadTitleFor(opts.orgType), rosterGroup: 'PASTORAL' as RosterGroup,
      isSenior: true, syncToProfile: true, rosterOrder: 0,
    }));
    await recomputeOrgRoleIndex(org.id);
    await syncMembershipToProfile(org.id, u.uid).catch(() => {});
  }
  if (opts.linkAccount) await linkAccountToOrg(org.id).catch(() => {});
  return org;
}

// ── Account ⇄ Organization link ─────────────────────────────────────────────

/** Persist `users/{uid}.linkedOrgId` and mirror the account's face onto the org. */
export async function linkAccountToOrg(orgId: string): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  await updateDoc(doc(db, 'users', u.uid), { linkedOrgId: orgId });
  await updateOrganization(orgId, { accountUid: u.uid });
}

/**
 * The ORGANIZATION / BRAND account has been chosen: auto-create the matching org (once) populated from the
 * account's profile. If the account already has a linked org it is returned unchanged.
 */
export async function createOrgFromAccount(orgType: OrgType, extra?: Partial<SetupElevateOptions>): Promise<Organization | null> {
  const u = auth.currentUser;
  if (!u) return null;
  const snap = await getDoc(doc(db, 'users', u.uid));
  const profile: any = snap.data() || {};
  if (profile.linkedOrgId) {
    const existing = await fetchOrganization(profile.linkedOrgId);
    if (existing) return existing;
  }
  return setupElevateOrg({
    orgType,
    name: extra?.name || profile.displayName || u.displayName || 'My Organization',
    tagline: extra?.tagline,
    about: extra?.about || profile.bio || '',
    logoUrl: extra?.logoUrl || profile.photoURL || u.photoURL || undefined,
    coverUrl: extra?.coverUrl || profile.headerImage || profile.coverUrl || undefined,
    linkAccount: true,
    ...extra,
  });
}

/** Swap the org's logo/cover; if an account is linked, mirror onto the account profile so both stay identical. */
export async function updateOrgIdentity(orgId: string, patch: { logoUrl?: string; coverUrl?: string; name?: string }): Promise<void> {
  await updateOrganization(orgId, patch);
  const org = await fetchOrganization(orgId);
  if (org?.accountUid && org.accountUid === auth.currentUser?.uid) {
    const up: Record<string, any> = {};
    if (patch.logoUrl) up.photoURL = patch.logoUrl;
    if (patch.coverUrl) { up.headerImage = patch.coverUrl; up.coverUrl = patch.coverUrl; }
    if (patch.name) up.displayName = patch.name;
    if (Object.keys(up).length) await updateDoc(doc(db, 'users', org.accountUid), up).catch(() => {});
  }
}

// ── Departments / sub-ministries ─────────────────────────────────────────────

export async function saveMinistries(orgId: string, ministries: Ministry[]): Promise<void> {
  await updateOrganization(orgId, { ministries: ministries.map(m => strip(m) as Ministry) });
  await recomputeOrgRoleIndex(orgId);
}

export const newMinistry = (name: string, kind: Ministry['kind'] = 'MINISTRY', extra?: Partial<Ministry>): Ministry =>
  ({ id: newId(), name, kind, threadAudience: 'ORG', allowFollowers: true, headUids: [], ...extra });

// ── Roles + rosters ──────────────────────────────────────────────────────────

/** Assign a catalog role to a membership. Throws if the acting member may not hand out that role. */
export async function assignRole(
  org: Organization, actor: OrgMembership | null, target: OrgMembership,
  roleKey: string, opts?: { title?: string; ministryId?: string; rosterGroup?: RosterGroup },
): Promise<void> {
  if (!canAssignRole(actor, org, roleKey)) throw new Error('You do not have permission to assign that role.');
  const def = getElevateRole(roleKey);
  if (!def) throw new Error('Unknown role.');
  const patch: Record<string, any> = {};
  if (opts?.ministryId) {
    const rest = (target.ministryRoles || []).filter(r => r.ministryId !== opts.ministryId);
    patch.ministryRoles = [...rest, { ministryId: opts.ministryId, roleKey, title: opts.title }];
    if (roleKey === 'DEPARTMENT_HEAD') {
      const ms = (org.ministries || []).map(m => m.id === opts.ministryId
        ? { ...m, headUids: Array.from(new Set([...(m.headUids || []), target.userId])) } : m);
      await updateOrganization(org.id, { ministries: ms });
    }
  }
  // Org-level role: never let ministry-scoped assignments overwrite a higher org role.
  if (!opts?.ministryId || !target.roleKey || target.roleKey === 'MEMBER' || target.roleKey === 'VOLUNTEER') {
    patch.roleKey = roleKey;
    patch.role = def.baseRole === 'OWNER' ? 'ADMIN' : def.baseRole;
    patch.rosterGroup = opts?.rosterGroup || def.rosterGroup;
    patch.title = opts?.title || def.label;
    patch.isEmployee = def.rosterGroup === 'STAFF' || undefined;
  }
  await updateDoc(doc(db, 'orgMemberships', target.id), strip(patch));
  await recomputeOrgRoleIndex(org.id);
  await syncMemberIndex(org.id, target.userId);
  if (target.syncToProfile) await syncMembershipToProfile(org.id, target.userId).catch(() => {});
}

/** Edit roster presentation: group, order, org-specific about blurb, headshot, senior flag. */
export async function updateRosterEntry(
  membershipId: string,
  patch: Partial<Pick<OrgMembership, 'rosterGroup' | 'rosterOrder' | 'isSenior' | 'aboutInOrg' | 'orgPhotoUrl' | 'title' | 'syncToProfile'>>,
): Promise<void> {
  await updateDoc(doc(db, 'orgMemberships', membershipId), strip(patch as any));
}

export function rosterFor(members: OrgMembership[], group: RosterGroup): OrgMembership[] {
  return members
    .filter(m => m.status === 'ACTIVE' && (m.rosterGroup || getElevateRole(m.roleKey)?.rosterGroup) === group)
    .sort((a, b) => Number(!!b.isSenior) - Number(!!a.isSenior) || (a.rosterOrder ?? 99) - (b.rosterOrder ?? 99) || a.displayName.localeCompare(b.displayName));
}

/** Derive pastor/finance/prayer/leader uid arrays from memberships so Firestore rules can read them. */
export async function recomputeOrgRoleIndex(orgId: string): Promise<void> {
  try {
    const members = (await fetchOrgMembers(orgId)).filter(m => m.status === 'ACTIVE');
    const ids = (pred: (m: OrgMembership) => boolean) => Array.from(new Set(members.filter(pred).map(m => m.userId)));
    const has = (m: OrgMembership, p: any) => elevatePermissions(m).has(p);
    await updateDoc(doc(db, 'organizations', orgId), {
      pastorUids: ids(m => !!getElevateRole(m.roleKey)?.isPastoral),
      financeUids: ids(m => has(m, 'MANAGE_GIVING')),
      prayerUids: ids(m => has(m, 'VIEW_PRAYER')),
      givingViewUids: ids(m => has(m, 'VIEW_GIVING')),
      accountingUids: ids(m => has(m, 'MANAGE_ACCOUNTING')),
      accountingViewUids: ids(m => has(m, 'VIEW_ACCOUNTING') || has(m, 'MANAGE_ACCOUNTING')),
      leaderUids: ids(m => m.roleKey === 'DEPARTMENT_HEAD' || !!m.ministryRoles?.length),
      staffUids: ids(m => has(m, 'MANAGE_CONTENT')),
      updatedAt: Date.now(),
    });
  } catch { /* best-effort; owners/admins retain access */ }
}

// ── Profile sync (users/{uid}.orgAffiliations — unlimited orgs) ──────────────

export async function syncMembershipToProfile(orgId: string, uid: string, enable = true): Promise<void> {
  const [org, mems] = await Promise.all([fetchOrganization(orgId), getDocs(query(collection(db, 'orgMemberships'), where('orgId', '==', orgId), where('userId', '==', uid)))]);
  const m = mems.docs[0]?.data() as OrgMembership | undefined;
  if (!org || !m || auth.currentUser?.uid !== uid) return;
  const userRef = doc(db, 'users', uid);
  const cur = ((await getDoc(userRef)).data()?.orgAffiliations || []) as OrgAffiliation[];
  const rest = cur.filter(a => a.orgId !== orgId);
  if (!enable) { await updateDoc(userRef, { orgAffiliations: rest }); await updateDoc(mems.docs[0].ref, { syncToProfile: false }); return; }
  const aff: OrgAffiliation = strip({
    orgId, orgName: org.name, orgLogoUrl: org.logoUrl, roleKey: m.roleKey || 'MEMBER',
    title: m.title || getElevateRole(m.roleKey)?.label || 'Member', about: m.aboutInOrg, since: m.joinedAt,
    ministryName: org.ministries?.find(x => x.id === m.ministryRoles?.[0]?.ministryId)?.name,
  }) as OrgAffiliation;
  await updateDoc(userRef, { orgAffiliations: [...rest, aff] });
  await updateDoc(mems.docs[0].ref, { syncToProfile: true });
}

// ── Invites (link / QR / email) ──────────────────────────────────────────────

export interface CreateInviteInput {
  roleKey: string; title?: string; ministryId?: string; rosterGroup?: RosterGroup;
  inviteeName?: string; inviteeEmail?: string; requireApproval?: boolean;
  maxUses?: number; expiresInDays?: number;
}

export async function createOrgInvite(org: Organization, actor: OrgMembership | null, input: CreateInviteInput): Promise<OrgInvite> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const allowedToInvite = isOrgOwner(u.uid, org) || (actor && elevatePermissions(actor).has('MANAGE_INVITES'));
  if (!allowedToInvite) throw new Error('You do not have permission to create invites.');
  if (!canAssignRole(actor, org, input.roleKey)) throw new Error('You cannot hand out that role.');
  const now = Date.now();
  const inv: OrgInvite = strip({
    id: newToken(), orgId: org.id, orgName: org.name, roleKey: input.roleKey,
    title: input.title, ministryId: input.ministryId, rosterGroup: input.rosterGroup,
    inviteeName: input.inviteeName, inviteeEmail: input.inviteeEmail,
    requireApproval: input.requireApproval, maxUses: input.maxUses ?? 1, uses: 0,
    expiresAt: now + (input.expiresInDays ?? 14) * 86400000, createdBy: u.uid, createdAt: now,
  }) as OrgInvite;
  await setDoc(doc(db, 'orgInvites', inv.id), inv);
  return inv;
}

export const inviteUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com'}/?elevateInvite=${token}`;
export const inviteMailto = (inv: OrgInvite) =>
  `mailto:${inv.inviteeEmail || ''}?subject=${encodeURIComponent(`Join ${inv.orgName} on Plajah`)}&body=${encodeURIComponent(`You've been invited to set up your ${inv.title || 'role'} at ${inv.orgName}.\n\n${inviteUrl(inv.id)}`)}`;

export async function fetchOrgInvites(orgId: string): Promise<OrgInvite[]> {
  const s = await getDocs(query(collection(db, 'orgInvites'), where('orgId', '==', orgId)));
  return s.docs.map(d => d.data() as OrgInvite).sort((a, b) => b.createdAt - a.createdAt);
}
export const revokeOrgInvite = (token: string) => updateDoc(doc(db, 'orgInvites', token), { revoked: true });
export async function fetchInvite(token: string): Promise<OrgInvite | null> {
  const s = await getDoc(doc(db, 'orgInvites', token));
  return s.exists() ? (s.data() as OrgInvite) : null;
}

/** Redeem an invite as the signed-in user. Rules re-verify token/org/role/expiry/uses on the membership create. */
export async function redeemOrgInvite(token: string, opts?: { syncToProfile?: boolean; aboutInOrg?: string }): Promise<OrgMembership> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to accept this invite.');
  const inv = await fetchInvite(token);
  if (!inv || inv.revoked) throw new Error('This invite is no longer valid.');
  if (inv.expiresAt < Date.now()) throw new Error('This invite has expired.');
  if (inv.uses >= inv.maxUses) throw new Error('This invite has already been used.');
  const existing = (await getDocs(query(collection(db, 'orgMemberships'), where('orgId', '==', inv.orgId), where('userId', '==', u.uid)))).docs[0];
  const def = getElevateRole(inv.roleKey);
  const mRef = existing?.ref || doc(collection(db, 'orgMemberships'));
  const mem: OrgMembership = strip({
    id: mRef.id, orgId: inv.orgId, userId: u.uid,
    role: (def?.baseRole === 'ADMIN' || def?.baseRole === 'OWNER') ? 'STAFF' : (def?.baseRole || 'MEMBER'),
    status: inv.requireApproval ? 'PENDING' : 'ACTIVE',
    displayName: u.displayName || inv.inviteeName || 'Member', photoUrl: u.photoURL || '',
    title: inv.title || def?.label, roleKey: inv.roleKey, rosterGroup: inv.rosterGroup || def?.rosterGroup,
    ministryRoles: inv.ministryId ? [{ ministryId: inv.ministryId, roleKey: inv.roleKey, title: inv.title }] : undefined,
    aboutInOrg: opts?.aboutInOrg, syncToProfile: !!opts?.syncToProfile,
    inviteToken: token, invitedBy: inv.createdBy, joinedAt: existing ? (existing.data() as any).joinedAt : Date.now(),
  }) as OrgMembership;
  await runTransaction(db, async tx => {
    const iRef = doc(db, 'orgInvites', token);
    const fresh = (await tx.get(iRef)).data() as OrgInvite | undefined;
    if (!fresh || fresh.revoked || fresh.uses >= fresh.maxUses) throw new Error('This invite has already been used.');
    tx.set(mRef, mem);
    tx.update(iRef, { uses: fresh.uses + 1 });
  });
  if (mem.status === 'ACTIVE') await syncMemberIndex(inv.orgId, u.uid);
  if (mem.status === 'ACTIVE' && opts?.syncToProfile) await syncMembershipToProfile(inv.orgId, u.uid).catch(() => {});
  return mem;
}

// ── Setup checklist ──────────────────────────────────────────────────────────

export function setupChecklist(org: Organization, members: OrgMembership[]) {
  return [
    { key: 'departments', label: 'Departments & ministries named', done: (org.ministries?.length || 0) > 0 },
    { key: 'pastoral', label: 'Pastoral / lead roster filled', done: members.some(m => m.rosterGroup === 'PASTORAL' && m.userId !== org.creatorId) },
    { key: 'leaders', label: 'Department heads assigned', done: (org.ministries || []).some(m => m.headUids?.length) },
    { key: 'giving', label: 'Giving connected (Stripe)', done: !!org.stripeAccountId || !!org.givingUrl },
    { key: 'brand', label: 'Logo & cover set', done: !!org.logoUrl && !!org.coverUrl },
  ];
}

export type { AccountType };

// ── Delete an organization ───────────────────────────────────────────────────

export interface OrgDeletionPreview { members: number; invites: number; followers: number; prayers: number; people: number; gifts: number; journals: number }

/** What deleting would remove / seal. Counts are best-effort (a viewer without access to a collection sees 0). */
export async function previewOrgDeletion(orgId: string): Promise<OrgDeletionPreview> {
  const n = async (col: string) => {
    try { return (await getDocs(query(collection(db, col), where('orgId', '==', orgId)))).size; } catch { return 0; }
  };
  const [members, invites, followers, prayers, people, gifts, journals] = await Promise.all([
    n('orgMemberships'), n('orgInvites'), n('orgFollowers'), n('churchPrayers'), n('chmsPeople'), n('chmsContributions'), n('acctJournals'),
  ]);
  return { members, invites, followers, prayers, people, gifts, journals };
}

/**
 * Permanently delete an organization the caller created (or a platform admin).
 * Removes the page and its community data (memberships, invites, followers, prayers, congregation records).
 * Financial records (gifts, journals) are append-only by design and CANNOT be erased: once the org doc is gone
 * Firestore rules can no longer resolve anyone's access to them, so they are sealed, not shown anywhere.
 * The org doc is deleted LAST because rules for the child collections resolve access through it.
 */
export async function deleteElevateOrg(org: Organization): Promise<{ removed: Record<string, number>; sealedGifts: number }> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  if (org.creatorId !== u.uid) throw new Error('Only the person who created this organization can delete it.');
  if (org.isDemo) throw new Error('Demo organizations cannot be deleted.');

  const removed: Record<string, number> = {};
  const sweep = async (col: string) => {
    let count = 0;
    try {
      const snap = await getDocs(query(collection(db, col), where('orgId', '==', org.id)));
      for (const d of snap.docs) { try { await deleteDoc(d.ref); count++; } catch { /* rules may forbid (e.g. others' notes) — leave sealed */ } }
    } catch { /* collection not readable by this user — nothing to sweep */ }
    removed[col] = count;
  };
  const preview = await previewOrgDeletion(org.id);

  // Community + operational data first (rules need the org doc to still exist).
  for (const col of ['orgInvites', 'orgFollowers', 'orgMemberIndex', 'churchPrayers', 'chmsAttendance', 'chmsHouseholds', 'chmsPeople', 'chmsNotes', 'chmsTasks', 'chmsShifts', 'chmsClaims', 'jobPostings', 'applications']) await sweep(col);
  // Org-authored posts (announcements / department threads).
  try {
    const posts = await getDocs(query(collection(db, 'posts'), where('authorOrgId', '==', org.id)));
    let c = 0;
    for (const d of posts.docs) { try { await deleteDoc(d.ref); c++; } catch { /* */ } }
    removed.posts = c;
  } catch { /* */ }
  // Memberships last among children; the caller's own goes with them.
  await sweep('orgMemberships');

  // Unlink the account that IS this org and drop its profile affiliation.
  try {
    const ref = doc(db, 'users', u.uid);
    const data = (await getDoc(ref)).data() || {};
    const patch: Record<string, any> = {};
    if (data.linkedOrgId === org.id) patch.linkedOrgId = null;
    if (Array.isArray(data.orgAffiliations)) patch.orgAffiliations = data.orgAffiliations.filter((a: any) => a.orgId !== org.id);
    if (Object.keys(patch).length) await updateDoc(ref, patch);
  } catch { /* non-fatal */ }

  await deleteDoc(doc(db, 'organizations', org.id));
  return { removed, sealedGifts: preview.gifts + preview.journals };
}
