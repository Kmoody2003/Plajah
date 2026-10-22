// audienceService — the Firestore half of Facebook-style audiences (logic in ./audienceCore).
//
//   users/{uid}/storyCircle/lists  { closeFriends, family, colleagues, hiddenFrom }   owner-only
//   users/{uid}/prefs/audience     { posts: AudienceSpec, stories: AudienceSpec }      owner-only
//   circle_posts/{id}              posts shared with a list / custom audience; readable by audienceUids
//
// Lists are live, like Facebook's: add someone to Family and they can see your earlier
// Family posts; take them off and they can't. The owner's client does that upkeep
// (syncMyAudiences) whenever a list changes, a follow request is approved, someone is
// blocked, and once per sign-in (to pick up new followers on Followers-except posts).

import { db, auth } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit, writeBatch,
} from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import type { Post } from '../types';
import {
  EMPTY_LISTS, PUBLIC_SPEC, FOLLOWERS_SPEC, MAX_AUDIENCE, parseSpec, resolveAudience, needsFollowerList,
  type AudienceLists, type AudienceSpec, type ResolvedAudience,
} from './audienceCore';

export * from './audienceCore';

const listsRef = (uid: string) => doc(db, 'users', uid, 'storyCircle', 'lists');
const prefsRef = (uid: string) => doc(db, 'users', uid, 'prefs', 'audience');

export async function getAudienceLists(uid: string): Promise<AudienceLists> {
  try {
    const d = ((await getDoc(listsRef(uid))).data() || {}) as Partial<AudienceLists>;
    return {
      closeFriends: d.closeFriends || [], family: d.family || [], colleagues: d.colleagues || [], hiddenFrom: d.hiddenFrom || [],
    };
  } catch {
    return { ...EMPTY_LISTS };
  }
}

export async function saveAudienceLists(uid: string, lists: AudienceLists): Promise<void> {
  const clean = (a: string[]) => [...new Set(a.filter(u => u && u !== uid))].slice(0, MAX_AUDIENCE);
  await setDoc(listsRef(uid), {
    closeFriends: clean(lists.closeFriends), family: clean(lists.family),
    colleagues: clean(lists.colleagues), hiddenFrom: clean(lists.hiddenFrom),
  });
  void syncMyAudiences().catch(() => {});
}

export interface AudienceDefaults { posts: AudienceSpec; stories: AudienceSpec }

export async function getAudienceDefaults(uid: string): Promise<AudienceDefaults> {
  try {
    const d = (await getDoc(prefsRef(uid))).data() || {};
    return { posts: parseSpec(d.posts, PUBLIC_SPEC), stories: parseSpec(d.stories, PUBLIC_SPEC) };
  } catch {
    return { posts: PUBLIC_SPEC, stories: PUBLIC_SPEC };
  }
}

export async function saveAudienceDefaults(uid: string, defaults: AudienceDefaults): Promise<void> {
  await setDoc(prefsRef(uid), { posts: defaults.posts, stories: defaults.stories }, { merge: true });
}

export async function isAccountPrivate(uid: string): Promise<boolean> {
  try { return (await getDoc(doc(db, 'users', uid))).data()?.isPrivate === true; } catch { return false; }
}

export async function followerUids(uid: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, 'follows'), where('followingId', '==', uid)));
  return snap.docs.map(d => d.data().followerId as string).filter(Boolean);
}

/** Resolve an audience for the signed-in user's next post (or story, with materializeFollowers). */
export async function resolveForMe(spec: AudienceSpec, opts: { story?: boolean } = {}): Promise<ResolvedAudience & { ownerId: string }> {
  const ownerId = auth.currentUser?.uid;
  if (!ownerId) throw new Error('Sign in first');
  const [isPrivate, lists] = await Promise.all([isAccountPrivate(ownerId), getAudienceLists(ownerId)]);
  const base = { ownerId, isPrivate, lists, materializeFollowers: !!opts.story };
  let r = resolveAudience(spec, base);
  if (needsFollowerList(r)) r = resolveAudience(spec, { ...base, followers: await followerUids(ownerId) });
  return { ...r, ownerId };
}

/** People to pick from for lists and Custom: followers, people I follow, and family links. */
export async function audienceCandidates(uid: string): Promise<string[]> {
  const [followers, following, me] = await Promise.all([
    followerUids(uid).catch(() => [] as string[]),
    getDocs(query(collection(db, 'follows'), where('followerId', '==', uid))).then(s => s.docs.map(d => d.data().followingId as string)).catch(() => [] as string[]),
    getDoc(doc(db, 'users', uid)).then(s => s.data() || {}).catch(() => ({} as any)),
  ]);
  const family = [me.guardianUid, me.relationshipPartnerUid, ...(me.childUids || []), ...(me.coGuardianUids || [])].filter(Boolean) as string[];
  return [...new Set([...family, ...followers, ...following])].filter(u => u !== uid);
}

/** Family links from the profile (guardian, children, co-guardians, partner) — suggested for the Family list. */
export async function familySuggestions(uid: string): Promise<string[]> {
  try {
    const me = (await getDoc(doc(db, 'users', uid))).data() || {};
    return [...new Set([me.guardianUid, me.relationshipPartnerUid, ...(me.childUids || []), ...(me.coGuardianUids || [])].filter(Boolean))] as string[];
  } catch { return []; }
}

// ─── Upkeep: keep circle_posts + live stories in step with lists and followers ──

let syncing: Promise<number> | null = null;

/** Recompute audienceUids on my recent list-based posts and live stories. Returns docs changed. */
export function syncMyAudiences(): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    const me = auth.currentUser?.uid;
    if (!me) return 0;
    const [isPrivate, lists] = await Promise.all([isAccountPrivate(me), getAudienceLists(me)]);
    const [posts, stories] = await Promise.all([
      getDocs(query(collection(db, 'circle_posts'), where('authorId', '==', me), orderBy('timestamp', 'desc'), limit(300))).catch(() => null),
      getDocs(query(collection(db, 'stories'), where('ownerId', '==', me), where('expiresAt', '>', Date.now()), orderBy('expiresAt'), orderBy('timestamp', 'desc'))).catch(() => null),
    ]);
    const docs = [...(posts?.docs || []), ...(stories?.docs || []).filter(d => d.data().audience !== 'PUBLIC')];
    if (!docs.length) return 0;
    let followers: string[] | undefined;
    const needF = docs.some(d => (d.data().audienceLists || []).includes('followers') || d.ref.parent.id === 'stories');
    if (needF) followers = await followerUids(me).catch(() => undefined);
    if (needF && !followers) return 0; // never shrink audiences on a failed read
    let changed = 0;
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of docs) {
      const data = d.data();
      const isStory = d.ref.parent.id === 'stories';
      const spec = parseSpec(data.audienceSpec, isStory ? storySpecFromPreset(data.audience) : FOLLOWERS_SPEC);
      const r = resolveAudience(spec, { ownerId: me, isPrivate, lists, followers, materializeFollowers: isStory });
      const next = r.audienceUids || [];
      const prev: string[] = data.audienceUids || [];
      if (next.length === prev.length && next.every(u => prev.includes(u))) continue;
      batch.update(d.ref, { audienceUids: next, ...(r.audienceLists ? { audienceLists: r.audienceLists } : {}) });
      changed++;
      if (++ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops) await batch.commit();
    return changed;
  })().finally(() => { syncing = null; });
  return syncing;
}

/** Stories saved before audienceSpec existed: map their preset back to a spec. */
function storySpecFromPreset(preset?: string): AudienceSpec {
  return preset && preset !== 'CUSTOM' ? { preset: preset as AudienceSpec['preset'] } : FOLLOWERS_SPEC;
}

/** Once per sign-in (at most every 6h): pick up new followers / list changes made elsewhere. */
export function syncAudiencesOnSignIn(): void {
  const me = auth.currentUser?.uid;
  if (!me) return;
  const key = `plajah:audienceSync:${me}`;
  try {
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 6 * 3600_000) return;
    localStorage.setItem(key, String(Date.now()));
  } catch { /* storage unavailable — still sync */ }
  void syncMyAudiences().catch(() => {});
}

// ─── Reading circle posts ────────────────────────────────────────────────────

const toMillis = (t: any): number => (typeof t === 'number' ? t : t?.toMillis?.() ?? (Number(t) || 0));
const mapCircle = (d: any): Post => ({ id: d.id, ...d.data(), sourceCollection: 'circle_posts', timestamp: toMillis(d.data().timestamp) } as unknown as Post);

/** Posts people shared with me through lists / custom audiences (newest first). */
export async function fetchCirclePostsForMe(max = 30): Promise<Post[]> {
  const me = auth.currentUser?.uid;
  if (!me) return [];
  try {
    const snap = await getDocs(query(collection(db, 'circle_posts'), where('audienceUids', 'array-contains', me), orderBy('timestamp', 'desc'), limit(max)));
    return snap.docs.map(mapCircle);
  } catch { return []; }
}

/** One author's circle posts that I can see (all of them, if the author is me). */
export function listenCirclePostsByAuthor(authorId: string, cb: (posts: Post[]) => void, max = 30): () => void {
  const me = auth.currentUser?.uid;
  if (!me) { cb([]); return () => {}; }
  const q = authorId === me
    ? query(collection(db, 'circle_posts'), where('authorId', '==', me), orderBy('timestamp', 'desc'), limit(max))
    : query(collection(db, 'circle_posts'), where('authorId', '==', authorId), where('audienceUids', 'array-contains', me), orderBy('timestamp', 'desc'), limit(max));
  return onSnapshot(q, (snap: any) => cb(snap.docs.map(mapCircle)), () => cb([]));
}
