// services/lessonLibraryStore.ts — the shared Lesson Library (plajah-ops `lessonLibrary`).
//
// Lessons used to live only in the browser that made them (localStorage), so nothing an admin added ever
// reached a teacher. Each lesson is now also one doc here, and the library merges them back into the local
// cache it reads from (curriculumIngestionService.listIngestedUnits).
//
//   tier 'org'      — an organization's library. provisioned 'admin' = put there by the org's admins:
//                     teachers can read and copy it, only admins can change or delete it.
//                     provisioned 'teacher' = a teacher's own lesson (often a copy of an admin one).
//   tier 'user'     — a teacher with no org: their own lessons.
//   tier 'platform' — lessons a teacher shared with the whole platform; anyone signed in can read and copy.
//
// Rules: firestore.ops.rules `lessonLibrary` (admins = org owner/admins, pastors, Content HQ staff;
// teachers = organizations.eduTeacherUids, kept by organizationService.recomputeOrgStaffUids).

import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, opsDb } from './firebase';
import type { Organization } from '../types';
import { isOrgOwner } from './orgPermissions';
import type { IngestedCurriculumUnit } from './curriculumIngestionService';

export type LibraryTier = 'org' | 'user' | 'platform';
export type Provisioned = 'admin' | 'teacher';

export interface LibraryDoc {
  id: string;
  tier: LibraryTier;
  /** org id for tier 'org'; the owner's uid for 'user'; 'platform' for platform. */
  scopeId: string;
  orgId: string;
  ownerUid: string;
  ownerName: string;
  provisioned: Provisioned;
  copiedFromId: string;
  title: string;
  unitJson: string;
  createdAt: number;
  updatedAt: number;
}

const COL = 'lessonLibrary';
const MAX_JSON = 900_000;

/** Admins of an org's library: owner/admins, pastors, and Content HQ staff (MANAGE_CONTENT). Mirrors the rules. */
export function isLibraryAdmin(org: Pick<Organization, 'creatorId' | 'admins'> & { staffUids?: string[]; pastorUids?: string[] } | null | undefined, uid: string | undefined): boolean {
  if (!org || !uid) return false;
  return isOrgOwner(uid, org) || (org.staffUids || []).includes(uid) || (org.pastorUids || []).includes(uid);
}

/** Who provisioned a lesson. Lessons from before this existed count as the org's own (admin). */
export const provisionedOf = (u: Pick<IngestedCurriculumUnit, 'provisioned' | 'scopeKind'>): Provisioned =>
  u.provisioned || (u.scopeKind === 'user' ? 'teacher' : 'admin');

/** May this viewer change or delete the lesson? Admin lessons: admins only. A teacher's own: that teacher (and admins). */
export function canChangeUnit(u: IngestedCurriculumUnit, viewer: { uid: string; isAdmin: boolean }): boolean {
  if (u.tier === 'platform') return !!viewer.uid && u.ownerUid === viewer.uid;
  if (provisionedOf(u) === 'admin') return viewer.isAdmin;
  return viewer.isAdmin || (!!viewer.uid && (u.ownerUid === viewer.uid || !u.ownerUid));
}

// Who is working in the library right now, per scope, so a lesson saved from anywhere (Tela Classwork,
// imports) is marked as the org's (admin) or the teacher's own. Set by the Lesson Library when it opens.
const adminScopes = new Set<string>();
export function setLibraryActor(scopeId: string, isAdmin: boolean): void {
  if (isAdmin) adminScopes.add(scopeId); else adminScopes.delete(scopeId);
}
export const libraryActorIsAdmin = (scopeId: string) => adminScopes.has(scopeId);
export const libraryActorUid = () => auth.currentUser?.uid || '';

const strip = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T;

function toDoc(u: IngestedCurriculumUnit, tier: LibraryTier, scopeId: string): LibraryDoc | null {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const unitJson = JSON.stringify(strip(u));
  if (unitJson.length > MAX_JSON) return null;
  return {
    id: u.id,
    tier,
    scopeId,
    orgId: tier === 'org' ? scopeId : '',
    ownerUid: u.ownerUid || uid,
    ownerName: u.createdByName || auth.currentUser?.displayName || 'Teacher',
    provisioned: tier === 'org' ? provisionedOf(u) : 'teacher',
    copiedFromId: u.copiedFromId || '',
    title: u.title.slice(0, 300),
    unitJson,
    createdAt: u.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

const docId = (tier: LibraryTier, id: string) => (tier === 'platform' ? `p_${id}` : id).replace(/\//g, '_');

/** Saves a lesson to the shared library. Best-effort: offline or refused writes keep the local copy. */
export async function pushLibraryUnit(u: IngestedCurriculumUnit, tier: LibraryTier, scopeId: string): Promise<boolean> {
  const d = toDoc(u, tier, scopeId);
  if (!d) return false;
  try {
    await setDoc(doc(opsDb, COL, docId(tier, u.id)), d);
    return true;
  } catch {
    return false;
  }
}

export async function removeLibraryUnit(id: string, tier: LibraryTier = 'org'): Promise<boolean> {
  try {
    await deleteDoc(doc(opsDb, COL, docId(tier, id)));
    return true;
  } catch {
    return false;
  }
}

function fromDoc(d: LibraryDoc): IngestedCurriculumUnit | null {
  try {
    const u = JSON.parse(d.unitJson) as IngestedCurriculumUnit;
    return { ...u, provisioned: d.provisioned, ownerUid: d.ownerUid, createdByName: u.createdByName || d.ownerName, copiedFromId: d.copiedFromId || undefined, tier: d.tier, remoteUpdatedAt: d.updatedAt };
  } catch {
    return null;
  }
}

/** The shared lessons for one scope. Empty when signed out, offline, or not allowed. */
export async function fetchLibraryUnits(tier: LibraryTier, scopeId: string): Promise<IngestedCurriculumUnit[]> {
  if (!auth.currentUser) return [];
  try {
    const q = tier === 'user'
      ? query(collection(opsDb, COL), where('tier', '==', 'user'), where('ownerUid', '==', auth.currentUser.uid))
      : query(collection(opsDb, COL), where('tier', '==', tier), where('scopeId', '==', scopeId));
    const snap = await getDocs(q);
    return snap.docs.map(s => fromDoc(s.data() as LibraryDoc)).filter((u): u is IngestedCurriculumUnit => !!u);
  } catch {
    return [];
  }
}

/** A teacher's editable copy of a lesson (the original stays as it was). */
export function copyAsTemplate(u: IngestedCurriculumUnit, viewer: { uid: string; name: string }, intoOrgId: string): IngestedCurriculumUnit {
  const stamp = Date.now().toString(36);
  return {
    ...u,
    id: `${u.id.replace(/_copy_[a-z0-9]+$/, '')}_copy_${stamp}`,
    orgId: intoOrgId,
    title: `${u.title} (my copy)`,
    telaDocId: `${u.telaDocId || u.id}_copy_${stamp}`,
    provisioned: 'teacher',
    ownerUid: viewer.uid,
    createdByName: viewer.name,
    copiedFromId: u.id,
    tier: undefined,
    // A copy is the teacher's own document, not the original link's import.
    sourceUrl: undefined,
    sourceLabel: u.sourceLabel ? `Copy of ${u.sourceLabel}` : `Copy of ${u.title}`,
    originalAssetId: undefined,
    telaAssetId: undefined,
    answerKeyAssetId: undefined,
    createdAt: Date.now(),
  };
}
