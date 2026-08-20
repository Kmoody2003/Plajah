// ─── Manager Suite — scheduled posts (queue) ─────────────────────────────────
// Stored at users/{uid}/scheduledPosts/{id} so the existing per-user security
// rules apply and the server publisher can collectionGroup-query them.

import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy,
} from 'firebase/firestore';
import { onSnapshot } from '../safeSnapshot';
import { v4 as uuidv4 } from 'uuid';
import { db, auth } from '../firebase';
import type { ScheduledPost, ScheduledPostStatus, ScheduledPostOwnerKind } from './types';

function colRef(uid: string) {
  return collection(db, 'users', uid, 'scheduledPosts');
}

export interface NewScheduledPostInput {
  text: string;
  mediaUrls?: string[];
  linkUri?: string;
  linkTitle?: string;
  linkDescription?: string;
  targetAccountIds: string[];
  alsoPostToPlajah?: boolean;
  /** Epoch ms; omit for a draft. */
  scheduledAt?: number;
  timezone?: string;
  /** Logical owner of this queue entry. Defaults to the signed-in operator's uid
   *  (CREATOR behavior). Pass a business/org id to file the post under that
   *  managed identity's queue. The document is still stored under the operator's
   *  own subtree — ownerId is the partition key, not the storage path. */
  ownerId?: string;
  ownerKind?: ScheduledPostOwnerKind;
  /** Attribute the Plajah-feed copy to a business/org (createPost authorOrgId). */
  authorOrgId?: string;
}

export async function createScheduledPost(input: NewScheduledPostInput): Promise<ScheduledPost> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  if (!input.text.trim() && !(input.mediaUrls?.length)) {
    throw new Error('Add some text or media before scheduling');
  }
  if (!input.targetAccountIds.length && !input.alsoPostToPlajah) {
    throw new Error('Pick at least one channel to publish to');
  }

  const now = Date.now();
  const post: ScheduledPost = {
    id: uuidv4(),
    // Logical owner: the managed identity (business/org) if supplied, else the
    // operator themselves. The document still lives under colRef(uid) — the only
    // subtree per-user rules let this signed-in operator write to.
    ownerId: input.ownerId ?? uid,
    ownerKind: input.ownerKind ?? 'CREATOR',
    authorOrgId: input.authorOrgId,
    text: input.text.trim(),
    mediaUrls: input.mediaUrls ?? [],
    linkUri: input.linkUri,
    linkTitle: input.linkTitle,
    linkDescription: input.linkDescription,
    targetAccountIds: input.targetAccountIds,
    alsoPostToPlajah: input.alsoPostToPlajah ?? false,
    scheduledAt: input.scheduledAt,
    timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
    createdAt: now,
    updatedAt: now,
  };
  // Firestore rejects undefined — strip them.
  const clean = JSON.parse(JSON.stringify(post));
  await setDoc(doc(colRef(uid), post.id), clean);
  return post;
}

export async function updateScheduledPost(id: string, patch: Partial<ScheduledPost>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const clean = JSON.parse(JSON.stringify({ ...patch, updatedAt: Date.now() }));
  await updateDoc(doc(colRef(uid), id), clean);
}

export async function deleteScheduledPost(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  await deleteDoc(doc(colRef(uid), id));
}

export async function listScheduledPosts(uid?: string): Promise<ScheduledPost[]> {
  const owner = uid ?? auth.currentUser?.uid;
  if (!owner) return [];
  const snap = await getDocs(query(colRef(owner), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => d.data() as ScheduledPost);
}

/** Live queue for a managed identity.
 *  The Firestore query is unchanged (operator's own subtree, ordered by createdAt —
 *  the same single-field index as before), so CREATOR behavior is byte-for-byte.
 *  When `ownerId` names a business/org, results are filtered client-side to that
 *  identity's entries; omitting it (or passing the operator's uid) yields exactly
 *  the personal queue. Filtering is done in memory to avoid a composite
 *  (ownerId + createdAt) index. */
export function listenToQueue(
  callback: (posts: ScheduledPost[]) => void,
  ownerId?: string,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { callback([]); return () => {}; }
  const target = ownerId ?? uid;
  return onSnapshot(query(colRef(uid), orderBy('createdAt', 'desc')), snap => {
    const all = snap.docs.map(d => d.data() as ScheduledPost);
    callback(all.filter(p => (p.ownerId ?? uid) === target));
  });
}

/** How many posts currently occupy a queue slot (DRAFT or SCHEDULED). */
export function countQueueSlots(posts: ScheduledPost[]): number {
  return posts.filter(p => p.status === 'DRAFT' || p.status === 'SCHEDULED').length;
}

/** Posts whose send time has arrived but haven't been published. */
export function dueScheduledPosts(posts: ScheduledPost[], now = Date.now()): ScheduledPost[] {
  return posts.filter(
    p => p.status === 'SCHEDULED' && typeof p.scheduledAt === 'number' && p.scheduledAt <= now,
  );
}

export const QUEUE_STATUSES: ScheduledPostStatus[] = [
  'DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED',
];
