// storyAudience — who can see a story, Instagram/YouTube-style.
//
//   PUBLIC         anyone signed in (public accounts only)
//   FOLLOWERS      your followers — the only "wide" option for a private account
//   CLOSE_FRIENDS  your Close Friends list (green ring)
//
// Plus "Hide story from": people on that list never get your stories, whatever the audience.
//
// Firestore rules can't check "does the viewer follow the owner" on a list query, so a
// non-public story carries `audienceUids` — the viewers it was shared with — and the tray
// queries `array-contains me`. The owner's client keeps that list current while the story
// lives: approving a follow request adds the new follower, blocking someone removes them,
// and switching the account to private narrows PUBLIC stories to followers.
//
// Views are private to the owner: stories/{id}/views/{viewerUid} (owner + that viewer read),
// and each viewer's own "seen" marks live in users/{me}/storySeen/{storyId} for the ring.
//
// Lists: users/{uid}/storyCircle/lists { closeFriends: string[], hiddenFrom: string[] } (owner-only).

import { db, auth } from './firebase';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, setDoc, writeBatch, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';

export type StoryAudience = 'PUBLIC' | 'FOLLOWERS' | 'CLOSE_FRIENDS';
export interface StoryCircle { closeFriends: string[]; hiddenFrom: string[] }

/** Rules cap the list so a story doc stays well under Firestore's 1 MiB limit. */
export const MAX_AUDIENCE = 5000;

const circleRef = (uid: string) => doc(db, 'users', uid, 'storyCircle', 'lists');

export async function getStoryCircle(uid: string): Promise<StoryCircle> {
  try {
    const s = await getDoc(circleRef(uid));
    const d = (s.data() || {}) as Partial<StoryCircle>;
    return { closeFriends: d.closeFriends || [], hiddenFrom: d.hiddenFrom || [] };
  } catch {
    return { closeFriends: [], hiddenFrom: [] };
  }
}

export async function saveStoryCircle(uid: string, circle: StoryCircle): Promise<void> {
  await setDoc(circleRef(uid), {
    closeFriends: [...new Set(circle.closeFriends)].slice(0, MAX_AUDIENCE),
    hiddenFrom: [...new Set(circle.hiddenFrom)].slice(0, MAX_AUDIENCE),
  });
}

export async function isPrivateAccount(uid: string): Promise<boolean> {
  try { return (await getDoc(doc(db, 'users', uid))).data()?.isPrivate === true; } catch { return false; }
}

async function followerUids(uid: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, 'follows'), where('followingId', '==', uid)));
  return snap.docs.map(d => d.data().followerId as string).filter(Boolean);
}

export interface ResolvedAudience { audience: StoryAudience; audienceUids?: string[]; narrowed?: 'private' | 'hidden' }

/** Resolve what a new story is shared with. A private account can't post PUBLIC, and a
 *  "Hide story from" list narrows PUBLIC to followers (a public story can't exclude anyone). */
export async function resolveAudience(ownerId: string, wanted: StoryAudience): Promise<ResolvedAudience> {
  const [priv, circle] = await Promise.all([isPrivateAccount(ownerId), getStoryCircle(ownerId)]);
  const hidden = new Set(circle.hiddenFrom);
  let audience = wanted;
  let narrowed: ResolvedAudience['narrowed'];
  if (audience === 'PUBLIC' && priv) { audience = 'FOLLOWERS'; narrowed = 'private'; }
  if (audience === 'PUBLIC' && hidden.size) { audience = 'FOLLOWERS'; narrowed = 'hidden'; }
  if (audience === 'PUBLIC') return { audience };
  const base = audience === 'CLOSE_FRIENDS' ? circle.closeFriends : await followerUids(ownerId);
  const audienceUids = [...new Set(base)].filter(u => u && u !== ownerId && !hidden.has(u)).slice(0, MAX_AUDIENCE);
  return { audience, audienceUids, ...(narrowed ? { narrowed } : {}) };
}

/** The signed-in owner's stories that are still live. */
async function myLiveStories(ownerId: string) {
  // Same shape as the own-stories listener, so it rides the (ownerId, expiresAt, timestamp) index.
  const snap = await getDocs(query(collection(db, 'stories'), where('ownerId', '==', ownerId), where('expiresAt', '>', Date.now()),
    orderBy('expiresAt'), orderBy('timestamp', 'desc')));
  return snap.docs;
}

/** Follow request approved → the new follower sees my live FOLLOWERS stories (as on Instagram). */
export async function addFollowerToLiveStories(followerUid: string): Promise<void> {
  const me = auth.currentUser?.uid;
  if (!me) return;
  const circle = await getStoryCircle(me);
  if (circle.hiddenFrom.includes(followerUid)) return;
  const docs = (await myLiveStories(me)).filter(d => d.data().audience === 'FOLLOWERS');
  if (!docs.length) return;
  const b = writeBatch(db);
  docs.forEach(d => b.update(d.ref, { audienceUids: arrayUnion(followerUid) }));
  await b.commit();
}

/** Blocked, removed, or hidden → drop them from every live story's audience. */
export async function removeFromLiveStories(uid: string): Promise<void> {
  const me = auth.currentUser?.uid;
  if (!me) return;
  const docs = (await myLiveStories(me)).filter(d => Array.isArray(d.data().audienceUids));
  if (!docs.length) return;
  const b = writeBatch(db);
  docs.forEach(d => b.update(d.ref, { audienceUids: arrayRemove(uid) }));
  await b.commit();
}

/** Account switched to private → live PUBLIC stories narrow to followers. */
export async function narrowPublicStoriesToFollowers(): Promise<void> {
  const me = auth.currentUser?.uid;
  if (!me) return;
  const docs = (await myLiveStories(me)).filter(d => (d.data().audience || 'PUBLIC') === 'PUBLIC');
  if (!docs.length) return;
  const { audienceUids } = await resolveAudience(me, 'FOLLOWERS');
  const b = writeBatch(db);
  docs.forEach(d => b.update(d.ref, { audience: 'FOLLOWERS', audienceUids: audienceUids || [] }));
  await b.commit();
}

// ── Views (owner-private) ────────────────────────────────────────────────────

export async function recordStoryView(story: { id: string; ownerId: string; expiresAt: number }): Promise<void> {
  const me = auth.currentUser?.uid;
  if (!me || me === story.ownerId) return;
  const b = writeBatch(db);
  b.set(doc(db, 'stories', story.id, 'views', me), { viewerId: me, at: Date.now() });
  b.set(doc(db, 'users', me, 'storySeen', story.id), { at: Date.now(), expiresAt: story.expiresAt });
  await b.commit();
}

/** Story ids the signed-in user has already watched (drives the coloured vs grey ring). */
export function listenToSeenStories(cb: (seen: Set<string>) => void): () => void {
  const me = auth.currentUser?.uid;
  if (!me) { cb(new Set()); return () => {}; }
  return onSnapshot(
    query(collection(db, 'users', me, 'storySeen'), where('expiresAt', '>', Date.now())),
    (snap: any) => cb(new Set(snap.docs.map((d: any) => d.id))),
    () => cb(new Set()),
  );
}

/** Owner only: who watched this story, newest first. */
export async function fetchStoryViewers(storyId: string): Promise<Array<{ uid: string; at: number }>> {
  const snap = await getDocs(collection(db, 'stories', storyId, 'views'));
  return snap.docs.map(d => ({ uid: d.id, at: (d.data().at as number) || 0 })).sort((a, b) => b.at - a.at);
}
