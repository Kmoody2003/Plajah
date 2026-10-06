// "Say hi" — a one-way, low-pressure greeting between two people.
//
//   hellos/{from_to}  (created ONLY by `from`, once per ordered pair — see firestore.rules)
//
// Opt-OUT: anyone may be greeted unless the recipient set users/{uid}.sayHiOptOut. Blocked users
// (either direction) can never say hi. A mutual hello (A->B and B->A) offers opening a DM.
// Rate limited by SAFETY's pure module (services/socialRateLimit.ts, action 'hello').

import { collection, doc, getDoc, limit, query, updateDoc, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { auth, db, createNotification, createChatRoom, fetchUserProfile, followUser, type FollowResult } from './backendService';
import { isBlockedEitherWay } from './socialSafetyService';
import { tryConsume } from './socialRateLimit';
import { planHelloCounter, helloCounterFields } from './sayHiCore';

export const helloId = (from: string, to: string) => `${from}_${to}`;

export interface Hello {
  id: string;
  fromUid: string;
  toUid: string;
  fromName?: string;
  fromPhoto?: string;
  message?: string;
  timestamp: number;
  seenAt?: number;
}

export type HelloFailure = 'signed-out' | 'self' | 'blocked' | 'opted-out' | 'not-allowed' | 'already' | 'rate' | 'error';
export type HelloResult =
  | { ok: true; mutual: boolean; reason?: undefined; retryAfterMs?: undefined }
  | { ok: false; reason: HelloFailure; retryAfterMs?: number; mutual?: undefined };

const toMs = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);

const mapHello = (d: { id: string; data: () => any }): Hello => {
  const x = d.data();
  return { id: d.id, fromUid: x.fromUid, toUid: x.toUid, fromName: x.fromName, fromPhoto: x.fromPhoto, message: x.message, timestamp: toMs(x.timestamp), seenAt: toMs(x.seenAt) || undefined };
};

export const FAILURE_COPY: Record<HelloFailure, string> = {
  'signed-out': 'Sign in to say hi.',
  self: "That's you!",
  blocked: "You can't say hi to this person.",
  'opted-out': 'This person has turned off Say hi.',
  'not-allowed': "Say hi isn't available for this account.",
  already: "You've already said hi.",
  rate: "You're saying hi a lot — try again a bit later.",
  error: "Couldn't send that — try again.",
};

/** Say hi to `toUid`. Never throws; returns a typed result. */
export async function sendHello(toUid: string, message?: string): Promise<HelloResult> {
  const me = auth.currentUser;
  if (!me) return { ok: false, reason: 'signed-out' };
  if (!toUid) return { ok: false, reason: 'error' };
  if (toUid === me.uid) return { ok: false, reason: 'self' };
  try {
    if (await isBlockedEitherWay(toUid)) return { ok: false, reason: 'blocked' };

    const [target, mine, existing] = await Promise.all([
      fetchUserProfile(toUid),
      fetchUserProfile(me.uid),
      getDoc(doc(db, 'hellos', helloId(me.uid, toUid))),
    ]);
    if (!target) return { ok: false, reason: 'error' };
    if (existing.exists()) return { ok: false, reason: 'already' };
    if (target.sayHiOptOut) return { ok: false, reason: 'opted-out' };
    // Child accounts neither send nor receive stranger greetings.
    if (target.isChild || target.accountType === 'CHILD' || mine?.isChild || mine?.accountType === 'CHILD') return { ok: false, reason: 'not-allowed' };

    const rate = tryConsume(me.uid, 'hello', mine?.createdAt ?? mine?.joinedAt ?? null);
    if (!rate.ok) return { ok: false, reason: 'rate', retryAfterMs: rate.retryAfterMs };

    // Server-enforced limit: the same batch bumps rateLimits/{me} (firestore.rules rlHlAdvance + getAfter on hellos).
    const rlRef = doc(db, 'rateLimits', me.uid);
    const rlSnap = await getDoc(rlRef).catch(() => null);
    const rl = rlSnap?.exists() ? (rlSnap.data() as any) : null;
    const ms = (t: any): number | undefined => (t?.toMillis ? t.toMillis() : typeof t === 'number' ? t : undefined);
    const cp = planHelloCounter(rl ? { hlCount: rl.hlCount, hlWindowStartMs: ms(rl.hlWindowStart), lastHelloAtMs: ms(rl.lastHelloAt) } : null, Date.now());
    if (!cp.ok) return { ok: false, reason: 'rate', retryAfterMs: cp.retryAfterMs };

    const cleanMsg = (message || '').trim().slice(0, 140);
    const batch = writeBatch(db);
    batch.set(rlRef, helloCounterFields(cp, serverTimestamp()), { merge: true });
    batch.set(doc(db, 'hellos', helloId(me.uid, toUid)), {
      fromUid: me.uid,
      toUid,
      fromName: mine?.displayName || me.displayName || 'Someone',
      fromPhoto: mine?.photoURL || me.photoURL || '',
      ...(cleanMsg ? { message: cleanMsg } : {}),
      timestamp: serverTimestamp(),
    });
    try { await batch.commit(); } catch (e: any) {
      if (e?.code === 'permission-denied') return { ok: false, reason: 'rate' }; // counter rules rejected (race / cap / clock skew)
      throw e;
    }

    const reverse = await getDoc(doc(db, 'hellos', helloId(toUid, me.uid))).catch(() => null);
    const mutual = !!reverse?.exists();
    const name = mine?.displayName || me.displayName || 'Someone';
    void createNotification({
      userId: toUid,
      senderId: me.uid,
      senderName: name,
      senderPhoto: mine?.photoURL || me.photoURL || '',
      type: 'HELLO',
      title: mutual ? 'You said hi to each other' : `${name} said hi`,
      message: mutual ? `You and ${name} both said hi — start a chat?` : `${name} waved at you. Wave back or follow back?`,
      link: 'USER_PROFILE',
      targetId: me.uid,
      actions: mutual ? ['OPEN_DM'] : ['WAVE_BACK', 'FOLLOW_BACK'],
    });
    return { ok: true, mutual };
  } catch (e) {
    console.warn('[sayHi] failed', e);
    return { ok: false, reason: 'error' };
  }
}

/** "Wave back" — say hi to someone who said hi to you (which makes it mutual). */
export const waveBack = (fromUid: string) => sendHello(fromUid);

/** "Follow back" from a hello notification. */
export const followBack = (fromUid: string): Promise<FollowResult> => followUser(fromUid);

/** Open (or create) the 1:1 DM room with someone you have a mutual hello with. Returns the room id. */
export async function openDmForMutualHello(otherUid: string): Promise<string | null> {
  const me = auth.currentUser;
  if (!me) return null;
  if (await isBlockedEitherWay(otherUid)) return null;
  const [a, b] = await Promise.all([
    getDoc(doc(db, 'hellos', helloId(me.uid, otherUid))),
    getDoc(doc(db, 'hellos', helloId(otherUid, me.uid))),
  ]);
  if (!a.exists() || !b.exists()) return null;           // only mutual hellos unlock the offer
  return createChatRoom([me.uid, otherUid], 'PRIVATE');
}

/** Live: hellos received by `uid` (newest first). */
export function listenReceivedHellos(uid: string, cb: (h: Hello[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'hellos'), where('toUid', '==', uid), limit(100)),
    snap => cb(snap.docs.map(mapHello).sort((x, y) => y.timestamp - x.timestamp)),
    () => cb([]),
  );
}

/** Live: uids that `uid` has already said hi to (so the UI can show "Said hi"). */
export function listenSentHelloTargets(uid: string, cb: (toUids: Set<string>) => void): () => void {
  return onSnapshot(
    query(collection(db, 'hellos'), where('fromUid', '==', uid), limit(500)),
    snap => cb(new Set(snap.docs.map(d => String(d.data().toUid)))),
    () => cb(new Set()),
  );
}

export async function markHelloSeen(fromUid: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;
  try { await updateDoc(doc(db, 'hellos', helloId(fromUid, me.uid)), { seenAt: Date.now() }); } catch { /* best effort */ }
}

// ── Welcome committee ─────────────────────────────────────────────────────────

const greetedKey = (uid: string) => `plajah.welcomeGreeted.${uid}`;
const safeLS = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
const NEW_ACCOUNT_GREET_MS = 3 * 86_400_000;

/**
 * Called on a brand-new account's FIRST suggestion view (client-side, once per device/account).
 * Posts ONE friendly system notification to themself naming up to two welcome ambassadors from
 * the suggestions. It is a platform greeting ("from the Welcome Committee"), not a message that
 * pretends to be typed by the ambassadors. Rate-limited by the once-only localStorage flag.
 */
export async function greetNewAccountOnce(
  viewerUid: string,
  viewerCreatedAt: number | undefined,
  ambassadors: { uid: string; displayName: string }[],
): Promise<boolean> {
  const ls = safeLS();
  if (!viewerUid || !viewerCreatedAt || Date.now() - viewerCreatedAt > NEW_ACCOUNT_GREET_MS) return false;
  try { if (ls?.getItem(greetedKey(viewerUid))) return false; ls?.setItem(greetedKey(viewerUid), String(Date.now())); } catch { /* ignore */ }
  const names = ambassadors.slice(0, 2).map(a => a.displayName).filter(Boolean);
  const who = names.length === 2 ? `${names[0]} and ${names[1]} from our Welcome Committee are` : names.length === 1 ? `${names[0]} from our Welcome Committee is` : 'The Welcome Committee is';
  try {
    await createNotification({
      userId: viewerUid,
      senderId: viewerUid,
      senderName: 'Plajah Welcome Committee',
      senderPhoto: '',
      type: 'SYSTEM',
      title: 'Welcome to Plajah',
      message: `${who} glad you're here. Follow a few people and say hi — everyone was new once.`,
      link: names.length ? 'USER_PROFILE' : undefined,
      targetId: ambassadors[0]?.uid,
    } as any);
    return true;
  } catch { return false; }
}

/** An ambassador's "welcome everyone" button: say hi to up to `max` new members (rate-limited per hello). */
export async function welcomeNewMembers(uids: string[], max = 5): Promise<{ sent: number; skipped: number }> {
  let sent = 0, skipped = 0;
  for (const uid of uids.slice(0, max)) {
    const r = await sendHello(uid, 'Welcome to Plajah!');
    if (r.ok) sent++; else { skipped++; if (!r.ok && r.reason === 'rate') break; }
  }
  return { sent, skipped };
}

/** Existing hellos between two users, for "Said hi" / "Waved back" labels (one-off read). */
export async function getHelloPair(a: string, b: string): Promise<{ aToB: boolean; bToA: boolean }> {
  const [x, y] = await Promise.all([getDoc(doc(db, 'hellos', helloId(a, b))), getDoc(doc(db, 'hellos', helloId(b, a)))]);
  return { aToB: x.exists(), bToA: y.exists() };
}
