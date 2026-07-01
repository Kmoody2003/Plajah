// organizationService — CRUD + membership for the Organization primitive (Part 2).
//
// An Organization is a first-class PARALLEL account: a merger of a business page
// and a club. Brand accounts are Organizations (orgType 'BRAND'); the church
// vertical (Part 3) specializes the SAME primitive (orgType 'CHURCH'). This
// service mirrors the proven club pattern (createClub): an org doc in
// `organizations/{id}` + an OWNER row in `orgMemberships/{id}`.

import {
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, limit,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Organization, OrgMembership, OrgRole, OrgType } from '../types';

/** Firestore rejects `undefined` field values — strip them before every write. */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
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
    joinProcess: data.joinProcess || 'AUTO',
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
  return org;
}

export async function fetchOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, 'organizations', orgId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Organization) : null;
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<void> {
  await updateDoc(doc(db, 'organizations', orgId), { ...stripUndefined(updates), updatedAt: Date.now() });
}

export async function deleteOrganization(orgId: string): Promise<void> {
  await deleteDoc(doc(db, 'organizations', orgId));
}

/** Public org directory (optionally by type), newest-active first. */
export async function fetchPublicOrganizations(orgType?: OrgType): Promise<Organization[]> {
  const q = orgType
    ? query(collection(db, 'organizations'), where('isPublic', '==', true), where('orgType', '==', orgType), limit(50))
    : query(collection(db, 'organizations'), where('isPublic', '==', true), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Organization))
    .sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0));
}

/** Orgs the user runs (owner/admin/staff) — from their memberships. */
export async function fetchUserOrganizations(uid: string): Promise<Organization[]> {
  const snap = await getDocs(query(collection(db, 'orgMemberships'), where('userId', '==', uid)));
  const memberships = snap.docs.map(d => d.data() as OrgMembership).filter(m => m.status === 'ACTIVE');
  const orgs = await Promise.all(memberships.map(m => fetchOrganization(m.orgId).catch(() => null)));
  return orgs.filter(Boolean) as Organization[];
}

export async function fetchOrgMembers(orgId: string): Promise<OrgMembership[]> {
  const snap = await getDocs(query(collection(db, 'orgMemberships'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgMembership));
}

/** Join (or request to join) an organization. */
export async function joinOrganization(orgId: string, opts?: { role?: OrgRole; title?: string; status?: OrgMembership['status'] }): Promise<OrgMembership | null> {
  if (!auth.currentUser) return null;
  const now = Date.now();
  const ref = doc(collection(db, 'orgMemberships'));
  const membership: OrgMembership = {
    id: ref.id,
    orgId,
    userId: auth.currentUser.uid,
    role: opts?.role || 'MEMBER',
    status: opts?.status || 'ACTIVE',
    displayName: auth.currentUser.displayName || 'Member',
    photoUrl: auth.currentUser.photoURL || '',
    title: opts?.title,
    joinedAt: now,
  };
  await setDoc(ref, stripUndefined(membership));
  return membership;
}

/** Add / promote a staff member (owner/admin action). */
export async function setOrgMemberRole(membershipId: string, role: OrgRole, title?: string): Promise<void> {
  await updateDoc(doc(db, 'orgMemberships', membershipId), stripUndefined({ role, title }));
}
