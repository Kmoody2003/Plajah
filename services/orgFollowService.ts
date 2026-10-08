// orgFollowService — public Follow for an organization page or one of its ministries (Elevate).
//
// orgFollowers/{orgId_uid}                 → follows the org (can comment on members-audience threads)
// orgFollowers/{orgId__ministryId__uid}    → follows one ministry (also follows the org)
// Followers keep org.followerCount in sync (rules let anyone bump the counter by one).

import { doc, getDoc, setDoc, deleteDoc, updateDoc, increment, query, collection, where } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './firebase';

const orgDocId = (orgId: string, uid: string) => `${orgId}_${uid}`;
const ministryDocId = (orgId: string, ministryId: string, uid: string) => `${orgId}__${ministryId}__${uid}`;

export async function isFollowing(orgId: string, ministryId?: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'orgFollowers', ministryId ? ministryDocId(orgId, ministryId, uid) : orgDocId(orgId, uid)));
    return snap.exists();
  } catch { return false; }
}

export async function followOrg(orgId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to follow.');
  const ref = doc(db, 'orgFollowers', orgDocId(orgId, uid));
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, { orgId, userId: uid, createdAt: Date.now() });
  updateDoc(doc(db, 'organizations', orgId), { followerCount: increment(1) }).catch(() => {});
}

export async function unfollowOrg(orgId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const ref = doc(db, 'orgFollowers', orgDocId(orgId, uid));
  if (!(await getDoc(ref)).exists()) return;
  await deleteDoc(ref);
  updateDoc(doc(db, 'organizations', orgId), { followerCount: increment(-1) }).catch(() => {});
}

/** Following a ministry also follows the org (so the follower may comment on org-audience threads). */
export async function followMinistry(orgId: string, ministryId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to follow.');
  await followOrg(orgId);
  await setDoc(doc(db, 'orgFollowers', ministryDocId(orgId, ministryId, uid)), { orgId, ministryId, userId: uid, createdAt: Date.now() });
}

export async function unfollowMinistry(orgId: string, ministryId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, 'orgFollowers', ministryDocId(orgId, ministryId, uid)));
}

/** Live follow state for the signed-in viewer: org-level + the set of followed ministry ids. */
export function listenFollowedState(orgId: string, cb: (s: { org: boolean; ministries: string[] }) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { cb({ org: false, ministries: [] }); return () => {}; }
  const q = query(collection(db, 'orgFollowers'), where('orgId', '==', orgId), where('userId', '==', uid));
  return onSnapshot(q, snap => {
    let org = false; const ministries: string[] = [];
    snap.docs.forEach(d => { const m = d.data().ministryId; if (m) ministries.push(m); else org = true; });
    cb({ org, ministries });
  }, () => cb({ org: false, ministries: [] }));
}
