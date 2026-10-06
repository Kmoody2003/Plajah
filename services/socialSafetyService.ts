/**
 * Social safety layer: block, mute, report, private accounts / follow requests.
 *
 * Data model
 *   blocks/{blocker_blocked}            { blockerId, blockedId, createdAt }  readable by either party
 *   users/{uid}/mutes/{target}          { targetUid, createdAt }             owner only
 *   follow_requests/{requester_target}  { requesterId, targetId, status, ... } requester + target
 *   content_reports/{reporter_type_id}  see contentSafetyService.reportContent (staff read)
 *   users/{uid}.isPrivate               boolean, public (needed so followers can be gated)
 *
 * PRIVATE ACCOUNTS: posts by a private account are written to `private_posts` (followers-only,
 *   rules-enforced, per-author queries) — see services/privatePostsService.ts for the design and
 *   the rules-provability reasoning. `setAccountPrivate` migrates existing posts. The old
 *   `authorIsPrivate` client soft-gate (PostCard placeholder) remains as defence in depth.
 *
 * RATE LIMITS: follow_requests creates are rate-limited IN RULES (rateLimits/{uid} counter bumped
 *   in the same batch — see requestFollow). Other actions still use the client throttles in
 *   services/socialRateLimit.ts (bypassable; courtesy only).
 *
 * COUNTERS: client +/-1 counters drift; services/socialCountsService.ts recounts from `follows`
 *   via POST /api/social/reconcile-counts (daily, lazy). Called after block/approve below.
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, setDoc, deleteDoc, updateDoc,
  writeBatch, increment, serverTimestamp, Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  blockDocId, followRequestId, computeHidden, filterHidden, planRequestFollow, planFollowRequestCounter,
} from './socialSafetyCore';
import { migrateAccountPostsVisibility } from './privatePostsService';
import { reconcileMyCounts } from './socialCountsService';

export {
  filterHidden, computeHidden, blockDocId, followRequestId, REPORT_REASONS, reportDocId, canViewerSeePost,
} from './socialSafetyCore';
export type { SocialReportReason, ReportTargetType } from './socialSafetyCore';

const me = () => auth.currentUser?.uid ?? null;

const sendNotification = async (n: {
  userId: string; title: string; message: string; link?: string;
}) => {
  const u = auth.currentUser;
  if (!u) return;
  try {
    const { createNotification } = await import('./backendService'); // lazy: avoids an import cycle
    await createNotification({
      userId: n.userId,
      senderId: u.uid,
      senderName: u.displayName || 'Someone',
      senderPhoto: u.photoURL || '',
      type: 'FOLLOW',
      title: n.title,
      message: n.message,
      ...(n.link ? { link: n.link } : {}),
    } as any);
  } catch { /* notifications are best-effort */ }
};

// ─── Live state ──────────────────────────────────────────────────────────────

export interface SocialSafetyState {
  blocked: Set<string>;   // people I blocked
  blockedBy: Set<string>; // people who blocked me
  muted: Set<string>;     // people I muted
  hidden: Set<string>;    // blocked ∪ blockedBy ∪ muted
  loading: boolean;
}

const emptyState = (loading: boolean): SocialSafetyState => ({
  blocked: new Set(), blockedBy: new Set(), muted: new Set(), hidden: new Set(), loading,
});

interface Channel { uid: string; state: SocialSafetyState; subs: Set<(s: SocialSafetyState) => void>; unsubs: Unsubscribe[]; loaded: Set<string>; }
let channel: Channel | null = null;

function startChannel(uid: string): Channel {
  const ch: Channel = { uid, state: emptyState(true), subs: new Set(), unsubs: [], loaded: new Set() };
  const publish = (key: 'blocked' | 'blockedBy' | 'muted', set: Set<string>) => {
    ch.loaded.add(key);
    const next = { ...ch.state, [key]: set } as SocialSafetyState;
    next.hidden = computeHidden(next.blocked, next.blockedBy, next.muted);
    next.loading = ch.loaded.size < 3;
    ch.state = next;
    ch.subs.forEach(fn => fn(next));
  };
  const fail = (key: 'blocked' | 'blockedBy' | 'muted') => () => publish(key, new Set()); // fail open: never brick the feed
  ch.unsubs.push(
    onSnapshot(query(collection(db, 'blocks'), where('blockerId', '==', uid)),
      s => publish('blocked', new Set(s.docs.map(d => String(d.data().blockedId)))), fail('blocked')),
    onSnapshot(query(collection(db, 'blocks'), where('blockedId', '==', uid)),
      s => publish('blockedBy', new Set(s.docs.map(d => String(d.data().blockerId)))), fail('blockedBy')),
    onSnapshot(collection(db, 'users', uid, 'mutes'),
      s => publish('muted', new Set(s.docs.map(d => d.id))), fail('muted')),
  );
  return ch;
}

/** Subscribe to the signed-in user's block/mute state. One shared set of listeners, ref-counted. */
export function subscribeSocialSafety(uid: string | null | undefined, cb: (s: SocialSafetyState) => void): () => void {
  if (!uid) { cb(emptyState(false)); return () => {}; }
  if (channel && channel.uid !== uid) { channel.unsubs.forEach(u => u()); channel = null; }
  if (!channel) channel = startChannel(uid);
  const ch = channel;
  ch.subs.add(cb);
  cb(ch.state);
  return () => {
    ch.subs.delete(cb);
    if (ch.subs.size === 0) {
      // Linger briefly so route changes don't tear down + rebuild listeners.
      setTimeout(() => {
        if (ch.subs.size === 0 && channel === ch) { ch.unsubs.forEach(u => u()); channel = null; }
      }, 15_000);
    }
  };
}

/** Snapshot of the current cached state (empty before first subscribe). */
export const getCachedSocialSafety = (): SocialSafetyState => channel?.state ?? emptyState(true);

/** One-shot (non-hook) version of `hidden` for services/search code. */
export async function fetchHiddenUids(uid: string): Promise<Set<string>> {
  if (!uid) return new Set();
  const [a, b, c] = await Promise.all([
    getDocs(query(collection(db, 'blocks'), where('blockerId', '==', uid))).catch(() => null),
    getDocs(query(collection(db, 'blocks'), where('blockedId', '==', uid))).catch(() => null),
    getDocs(collection(db, 'users', uid, 'mutes')).catch(() => null),
  ]);
  return computeHidden(
    a?.docs.map(d => String(d.data().blockedId)) ?? [],
    b?.docs.map(d => String(d.data().blockerId)) ?? [],
    c?.docs.map(d => d.id) ?? [],
  );
}

// ─── Block / mute ────────────────────────────────────────────────────────────

/** True if either party has blocked the other (hard gate for follow / DM / say-hi). */
export async function isBlockedEitherWay(targetUid: string): Promise<boolean> {
  const uid = me();
  if (!uid) return false;
  const [a, b] = await Promise.all([
    getDoc(doc(db, 'blocks', blockDocId(uid, targetUid))).catch(() => null),
    getDoc(doc(db, 'blocks', blockDocId(targetUid, uid))).catch(() => null),
  ]);
  return !!(a?.exists() || b?.exists());
}

export async function blockUser(targetUid: string): Promise<void> {
  const uid = me();
  if (!uid || uid === targetUid) return;
  await setDoc(doc(db, 'blocks', blockDocId(uid, targetUid)), {
    blockerId: uid, blockedId: targetUid, createdAt: serverTimestamp(),
  });
  // Best-effort cleanup — each step is independent and may legitimately fail.
  const step = (p: Promise<unknown>) => p.catch(() => {});
  await Promise.all([
    removeFollowEdge(uid, targetUid),   // I stop following them
    removeFollowEdge(targetUid, uid),   // they stop following me (rule: followed party may delete)
    step(deleteDoc(doc(db, 'follow_requests', followRequestId(uid, targetUid)))),
    step(deleteDoc(doc(db, 'follow_requests', followRequestId(targetUid, uid)))),
    step(deleteDoc(doc(db, 'users', uid, 'mutes', targetUid))), // a block supersedes a mute
  ]);
  void reconcileMyCounts(); // counters drift on block cleanup; recount (daily-guarded)
}

/**
 * Delete follows/{follower_following} if present and fix the counters we are allowed to touch:
 * `followerCount` of the followed account (any signed-in user may +/-1 it) and `followingCount`
 * of the follower only when the follower is me (own doc). The other party's followingCount
 * cannot be written by us and is left as-is.
 */
async function removeFollowEdge(followerId: string, followingId: string): Promise<void> {
  const uid = me();
  if (!uid) return;
  try {
    const ref = doc(db, 'follows', `${followerId}_${followingId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await deleteDoc(ref);
    await updateDoc(doc(db, 'users', followingId), { followerCount: increment(-1) }).catch(() => {});
    if (followerId === uid) await updateDoc(doc(db, 'users', uid), { followingCount: increment(-1) }).catch(() => {});
  } catch { /* best effort */ }
}

export async function unblockUser(targetUid: string): Promise<void> {
  const uid = me();
  if (!uid) return;
  await deleteDoc(doc(db, 'blocks', blockDocId(uid, targetUid)));
}

export async function muteUser(targetUid: string): Promise<void> {
  const uid = me();
  if (!uid || uid === targetUid) return;
  await setDoc(doc(db, 'users', uid, 'mutes', targetUid), { targetUid, createdAt: serverTimestamp() });
}

export async function unmuteUser(targetUid: string): Promise<void> {
  const uid = me();
  if (!uid) return;
  await deleteDoc(doc(db, 'users', uid, 'mutes', targetUid));
}

/** Profiles for a management view (best effort; missing profiles come back as bare uids). */
export async function fetchProfilesLite(uids: string[]): Promise<Array<{ uid: string; displayName: string; photoURL: string }>> {
  return Promise.all(uids.map(async u => {
    try {
      const s = await getDoc(doc(db, 'users', u));
      const d = s.data() as any;
      return { uid: u, displayName: d?.displayName || d?.username || u.slice(0, 8), photoURL: d?.photoURL || '' };
    } catch { return { uid: u, displayName: u.slice(0, 8), photoURL: '' }; }
  }));
}

// ─── Private accounts / follow requests ──────────────────────────────────────

/**
 * UI MUST confirm first: "Your existing posts will become followers-only." (going private) /
 * "Your existing followers-only posts will become public." (going public). Comments on existing
 * posts do not carry over (see privatePostsService header) — mention it in the confirm copy.
 * The flag flips first (so new posts route correctly), then posts are moved in resumable batches.
 */
export const PRIVACY_CONFIRM_COPY = {
  toPrivate: 'Your existing posts will become followers-only. Comments on them will not carry over.',
  toPublic: 'Your existing followers-only posts will become public. Comments on them will not carry over.',
} as const;

export async function setAccountPrivate(isPrivate: boolean): Promise<{ moved: number; done: boolean }> {
  const uid = me();
  if (!uid) return { moved: 0, done: true };
  await updateDoc(doc(db, 'users', uid), { isPrivate });
  try {
    const r = await migrateAccountPostsVisibility(uid, isPrivate);
    return { moved: r.moved, done: r.done };
  } catch {
    return { moved: 0, done: false }; // marker left in localStorage; resumePendingMigration() finishes it
  }
}

/** Does following `targetUid` need their approval? Fails open (false) on read errors. */
export async function followNeedsApproval(targetUid: string): Promise<boolean> {
  try {
    const s = await getDoc(doc(db, 'users', targetUid));
    return (s.data() as any)?.isPrivate === true;
  } catch { return false; }
}

/** Alias for GRAPH: true when a follow can be written immediately. */
export const canFollowDirectly = async (targetUid: string): Promise<boolean> => !(await followNeedsApproval(targetUid));

export type FollowRequestStatus = 'pending' | 'approved' | 'declined';
export interface FollowRequest {
  id: string;
  requesterId: string;
  targetId: string;
  status: FollowRequestStatus;
  requesterName?: string;
  requesterPhoto?: string;
  createdAt?: unknown;
}

/**
 * Ask to follow a private account. Returns the state the REQUESTER should see: a declined request
 * inside its 7-day cooldown is reported as 'pending' ("Requested") and NOT re-written (no spam, no
 * re-notification, decline not revealed). After the cooldown the old doc is cleared and a new
 * request is created. Creation is rate-limited in rules: the same batch bumps rateLimits/{me}.
 */
export async function requestFollow(targetUid: string): Promise<FollowRequestStatus | 'blocked' | 'rate_limited'> {
  const u = auth.currentUser;
  if (!u || u.uid === targetUid) return 'blocked';
  if (await isBlockedEitherWay(targetUid)) return 'blocked';
  const ref = doc(db, 'follow_requests', followRequestId(u.uid, targetUid));
  const existingSnap = await getDoc(ref).catch(() => null);
  const ex = existingSnap?.exists() ? (existingSnap.data() as any) : null;
  const edge = ex?.status === 'approved'
    ? (await getDoc(doc(db, 'follows', `${u.uid}_${targetUid}`)).catch(() => null))?.exists() === true
    : false;
  const resolvedAtMs = ex?.resolvedAt?.toMillis ? ex.resolvedAt.toMillis() : (typeof ex?.resolvedAt === 'number' ? ex.resolvedAt : null);
  const plan = planRequestFollow(ex ? { status: ex.status, resolvedAtMs } : null, edge, Date.now());
  if (plan.action === 'none') return plan.shown;
  if (plan.action === 'recreate') await deleteDoc(ref); // rules: allowed for stale approved, or declined past the cooldown

  // Rate-limit counter doc, bumped in the SAME batch (rules verify via getAfter).
  const rlRef = doc(db, 'rateLimits', u.uid);
  const rlSnap = await getDoc(rlRef).catch(() => null);
  const rl = rlSnap?.exists() ? (rlSnap.data() as any) : null;
  const ms = (t: any): number | undefined => (t?.toMillis ? t.toMillis() : typeof t === 'number' ? t : undefined);
  const cp = planFollowRequestCounter(rl ? { frCount: rl.frCount, frWindowStartMs: ms(rl.frWindowStart), lastFollowRequestAtMs: ms(rl.lastFollowRequestAt) } : null, Date.now());
  if (!cp.ok) return 'rate_limited';
  const batch = writeBatch(db);
  batch.set(rlRef, cp.resetWindow
    ? { frCount: 1, frWindowStart: serverTimestamp(), lastFollowRequestAt: serverTimestamp() }
    : { frCount: cp.nextCount, lastFollowRequestAt: serverTimestamp() }, { merge: true });
  batch.set(ref, {
    requesterId: u.uid,
    targetId: targetUid,
    status: 'pending',
    requesterName: u.displayName || '',
    requesterPhoto: u.photoURL || '',
    createdAt: serverTimestamp(),
  });
  try { await batch.commit(); } catch (e: any) {
    if (e?.code === 'permission-denied') return 'rate_limited'; // counter rules rejected (race / clock skew / cap)
    throw e;
  }
  void sendNotification({ userId: targetUid, title: 'Follow request', message: `${u.displayName || 'Someone'} wants to follow you` });
  return 'pending';
}

export async function getFollowRequestStatus(targetUid: string): Promise<FollowRequestStatus | null> {
  const uid = me();
  if (!uid) return null;
  try {
    const s = await getDoc(doc(db, 'follow_requests', followRequestId(uid, targetUid)));
    if (!s.exists()) return null;
    const st = (s.data() as any).status as FollowRequestStatus;
    return st === 'declined' ? 'pending' : st; // requester never sees a decline (cooldown re-request, no spam)
  } catch { return null; }
}

export async function cancelFollowRequest(targetUid: string): Promise<void> {
  const uid = me();
  if (!uid) return;
  await deleteDoc(doc(db, 'follow_requests', followRequestId(uid, targetUid)));
}

const toRequest = (d: { id: string; data(): any }): FollowRequest => ({ id: d.id, ...(d.data() as any) });

export async function listIncomingFollowRequests(): Promise<FollowRequest[]> {
  const uid = me();
  if (!uid) return [];
  const s = await getDocs(query(collection(db, 'follow_requests'), where('targetId', '==', uid), where('status', '==', 'pending')));
  return s.docs.map(toRequest);
}

/** Live version for inboxes/badges. */
export function listenIncomingFollowRequests(cb: (reqs: FollowRequest[]) => void): Unsubscribe {
  const uid = me();
  if (!uid) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, 'follow_requests'), where('targetId', '==', uid), where('status', '==', 'pending')),
    s => cb(s.docs.map(toRequest)),
    () => cb([]),
  );
}

/**
 * Approve: one batch creates follows/{requester_me} (rules allow this ONLY while a pending
 * request exists) and marks the request approved. followerCount on my own doc is bumped after;
 * the requester's followingCount is theirs to own and is not touched here.
 */
export async function approveFollowRequest(requesterUid: string): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  const batch = writeBatch(db);
  batch.set(doc(db, 'follows', `${requesterUid}_${u.uid}`), {
    followerId: requesterUid,
    followingId: u.uid,
    timestamp: serverTimestamp(),
    approvedRequest: true,
  });
  batch.update(doc(db, 'follow_requests', followRequestId(requesterUid, u.uid)), {
    status: 'approved', resolvedAt: serverTimestamp(),
  });
  await batch.commit();
  updateDoc(doc(db, 'users', u.uid), { followerCount: increment(1) }).catch(() => {});
  void reconcileMyCounts(); // requester's followingCount is theirs; the server recount corrects both sides over time
  void sendNotification({ userId: requesterUid, title: 'Follow request approved', message: `${u.displayName || 'Someone'} accepted your follow request` });
}

export async function declineFollowRequest(requesterUid: string): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  await updateDoc(doc(db, 'follow_requests', followRequestId(requesterUid, u.uid)), {
    status: 'declined', resolvedAt: serverTimestamp(),
  });
}

// ─── Reporting (re-export for one import site) ───────────────────────────────

export { reportContent } from './contentSafetyService';
