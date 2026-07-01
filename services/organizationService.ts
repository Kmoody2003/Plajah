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
import type { Organization, OrgMembership, OrgRole, OrgType, Ministry, ServiceTime, GivingFund } from '../types';

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
  return m;
}

export async function removeOrgMember(membershipId: string): Promise<void> {
  await deleteDoc(doc(db, 'orgMemberships', membershipId));
}

/** Grant/revoke edit rights by putting a member's uid in (or out of) org.admins. */
export async function setOrgAdmin(orgId: string, uid: string, isAdmin: boolean, currentAdmins: string[]): Promise<string[]> {
  const admins = isAdmin ? Array.from(new Set([...currentAdmins, uid])) : currentAdmins.filter(a => a !== uid);
  await updateOrganization(orgId, { admins });
  return admins;
}

/** Recorded gifts for a church (from the `donations` collection). */
export async function fetchChurchDonations(churchId: string): Promise<Array<{ fund?: string; amount: number }>> {
  try {
    const snap = await getDocs(query(collection(db, 'donations'), where('churchId', '==', churchId)));
    return snap.docs.map(d => d.data() as any).map(x => ({ fund: x.fund, amount: Number(x.amount) || 0 }));
  } catch { return []; }
}

/** Sum recorded gifts by fund name — the live "raised" total per fund. */
export function sumDonationsByFund(donations: Array<{ fund?: string; amount: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of donations) { const f = d.fund || 'General'; out[f] = (out[f] || 0) + d.amount; }
  return out;
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

/** Stand up a fully-structured demo church to showcase the vertical. */
export async function createDemoChurch(): Promise<Organization | null> {
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
  return created;
}
