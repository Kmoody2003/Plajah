// storyAudience — who can see a story. Uses the same audiences as posts (services/audienceCore):
// Public · Followers · Close Friends · Family · Colleagues · Custom, plus the account-wide
// "Hidden from" list. A private account can't post Public.
//
// Firestore rules can't check "does the viewer follow the owner" on a list query, so every
// non-public story carries `audienceUids` — the viewers it is shared with — and the tray
// queries `array-contains me`. The owner's client keeps that list current while the story
// lives (services/audienceService syncMyAudiences: list edits, follow approvals, blocks,
// sign-in). Going private narrows live Public stories to followers.
//
// Views are private to the owner: stories/{id}/views/{viewerUid} (owner + that viewer read),
// and each viewer's own "seen" marks live in users/{me}/storySeen/{storyId} for the ring.

import { db, auth } from './firebase';
import { collection, doc, getDocs, query, where, orderBy, writeBatch } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { resolveForMe, syncMyAudiences, getAudienceLists, saveAudienceLists, FOLLOWERS_SPEC, type AudienceSpec } from './audienceService';

/** Stored on the story doc: the preset that was applied (CUSTOM covers combinations). */
export type StoryAudience = AudienceSpec['preset'];

export interface ResolvedStoryAudience { audience: StoryAudience; audienceSpec: AudienceSpec; audienceUids?: string[]; audienceLists?: string[] }

/** Resolve the audience for a new story by the signed-in user. */
export async function resolveStoryAudience(spec: AudienceSpec): Promise<ResolvedStoryAudience> {
  const r = await resolveForMe(spec, { story: true });
  if (r.collection === 'posts') return { audience: 'PUBLIC', audienceSpec: r.spec };
  return { audience: r.spec.preset, audienceSpec: r.spec, audienceUids: r.audienceUids || [], audienceLists: r.audienceLists };
}

/** Blocked → off every list, and out of every live story / list post (as on Instagram). */
export async function removeFromLiveStories(uid: string): Promise<void> {
  const me = auth.currentUser?.uid;
  if (!me) return;
  const lists = await getAudienceLists(me);
  const strip = (a: string[]) => a.filter(u => u !== uid);
  await saveAudienceLists(me, { closeFriends: strip(lists.closeFriends), family: strip(lists.family), colleagues: strip(lists.colleagues), hiddenFrom: lists.hiddenFrom });
}

/** Follow request approved → the new follower sees my live Followers stories and posts. */
export async function addFollowerToLiveStories(_followerUid: string): Promise<void> {
  await syncMyAudiences();
}

/** Account switched to private → live PUBLIC stories narrow to followers. */
export async function narrowPublicStoriesToFollowers(): Promise<void> {
  const me = auth.currentUser?.uid;
  if (!me) return;
  const snap = await getDocs(query(collection(db, 'stories'), where('ownerId', '==', me), where('expiresAt', '>', Date.now()),
    orderBy('expiresAt'), orderBy('timestamp', 'desc')));
  const docs = snap.docs.filter(d => (d.data().audience || 'PUBLIC') === 'PUBLIC');
  if (!docs.length) return;
  const r = await resolveStoryAudience(FOLLOWERS_SPEC);
  const b = writeBatch(db);
  docs.forEach(d => b.update(d.ref, { audience: r.audience, audienceSpec: r.audienceSpec, audienceUids: r.audienceUids || [], audienceLists: r.audienceLists || [], isPublic: false }));
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
