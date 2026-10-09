/**
 * liveTalkService — Firestore side of Live Talk. Pure rules live in liveTalkCore.ts; the matching
 * security rules are in firestore.rules (match /liveTalks) and docs/rules-patches/live-talk.rules.snippet.
 *
 * Never writes `undefined` (Firestore throws) — every payload is built from explicit values.
 */
import {
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, writeBatch, query, where,
  orderBy, limit, limitToLast, serverTimestamp, increment, arrayUnion, arrayRemove, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { onSnapshot } from '../safeSnapshot';
import type { LiveTalk, ChatMessage } from '../../types';
import {
  type TalkMember, type TalkRole, type TalkDenorm, sanitizeChat, isTalkAlive, CHAT_MAX_LEN,
} from './liveTalkCore';

const talkRef = (id: string) => doc(db, 'liveTalks', id);
const membersCol = (id: string) => collection(db, 'liveTalks', id, 'members');
const memberRef = (id: string, uid: string) => doc(db, 'liveTalks', id, 'members', uid);
const chatCol = (id: string) => collection(db, 'liveTalks', id, 'chat');
const reactionsCol = (id: string) => collection(db, 'liveTalks', id, 'reactions');

export interface Me { uid: string; name: string; photo: string }

export type LiveTalkDoc = LiveTalk & {
  lastHeartbeat?: unknown; cohostUids?: string[]; speakerUids?: string[]; kicked?: string[];
  memberCount?: number; listenerCount?: number; speakerCount?: number; raisedHandCount?: number;
  isRecording?: boolean; recordingStartedAt?: number; endedAt?: unknown;
};

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

// ── Talk doc ───────────────────────────────────────────────────────────────────

export async function getTalk(talkId: string): Promise<LiveTalkDoc | null> {
  const s = await getDoc(talkRef(talkId));
  return s.exists() ? ({ id: s.id, ...(s.data() as any) } as LiveTalkDoc) : null;
}

export function listenToTalk(talkId: string, cb: (t: LiveTalkDoc | null) => void, onErr?: (e: Error) => void) {
  return onSnapshot(talkRef(talkId), s => cb(s.exists() ? ({ id: s.id, ...(s.data() as any) } as LiveTalkDoc) : null), e => onErr?.(e));
}

/** Host-only: initialise the fields the new model relies on, right after createLiveTalk. */
export async function initTalkAsHost(talkId: string, me: Me): Promise<void> {
  await updateDoc(talkRef(talkId), {
    lastHeartbeat: serverTimestamp(),
    cohostUids: [], kicked: [], speakerUids: [me.uid], listeners: [],
    memberCount: 0, listenerCount: 0, speakerCount: 1, raisedHandCount: 0, isRecording: false,
  });
}

export const hostHeartbeat = (talkId: string) => updateDoc(talkRef(talkId), { lastHeartbeat: serverTimestamp() });

/** Host-only: write the denormalized roster (discovery cards, rtc allow-lists, rule checks). */
export const writeDenorm = (talkId: string, d: TalkDenorm) => updateDoc(talkRef(talkId), {
  speakerUids: d.speakerUids, speakers: d.speakers, listeners: d.listeners, cohostUids: d.cohostUids,
  speakerCount: d.speakerCount, listenerCount: d.listenerCount, memberCount: d.memberCount, raisedHandCount: d.raisedHandCount,
});

export const endTalk = (talkId: string) =>
  updateDoc(talkRef(talkId), { isActive: false, endedAt: serverTimestamp(), isRecording: false });

/** Host leaves without ending: the room passes to an existing co-host. */
export async function handOffHost(talk: LiveTalkDoc, to: TalkMember): Promise<void> {
  await updateDoc(talkRef(talk.id), {
    hostId: to.uid, hostName: clip(to.name || 'Host', 100), hostPhoto: clip(to.photo || '', 2048),
    cohostUids: (talk.cohostUids || []).filter(u => u !== to.uid),
    lastHeartbeat: serverTimestamp(),
  });
}

/** Co-host claims an abandoned room (host heartbeat silent > 60s — enforced by rules). */
export async function takeOverHost(talk: LiveTalkDoc, me: Me): Promise<void> {
  await updateDoc(talkRef(talk.id), {
    hostId: me.uid, hostName: clip(me.name || 'Host', 100), hostPhoto: clip(me.photo, 2048),
    cohostUids: (talk.cohostUids || []).filter(u => u !== me.uid),
    lastHeartbeat: serverTimestamp(),
  });
}

export const setRecording = (talkId: string, on: boolean) =>
  updateDoc(talkRef(talkId), on ? { isRecording: true, recordingStartedAt: Date.now() } : { isRecording: false });

export async function shareAsset(talkId: string, uid: string, a: { type: 'MUSIC' | 'VIDEO'; title: string; url: string; mediaId?: string }) {
  const asset: Record<string, unknown> = {
    id: `asset_${Date.now()}`, type: a.type, title: clip(a.title || 'Untitled', 200), url: clip(a.url, 2048),
    sharedBy: uid, timestamp: Date.now(),
  };
  if (a.mediaId) asset.mediaId = a.mediaId; // never write undefined
  await updateDoc(talkRef(talkId), { sharedAssets: arrayUnion(asset) });
}

// ── Membership ───────────────────────────────────────────────────────────────

export function listenToMembers(talkId: string, cb: (m: TalkMember[]) => void, onErr?: (e: Error) => void) {
  return onSnapshot(query(membersCol(talkId), limit(200)),
    s => cb(s.docs.map(d => ({ uid: d.id, ...(d.data() as any) } as TalkMember))),
    e => onErr?.(e));
}

/** Enter the room. A fresh member creates its doc and bumps memberCount in ONE batch (rules check
 *  the cap against that count). A rejoin (doc survived a crash) only refreshes presence. */
export async function joinTalk(talkId: string, me: Me, asHost: boolean): Promise<'joined' | 'rejoined'> {
  const ref = memberRef(talkId, me.uid);
  const existing = await getDoc(ref).catch(() => null);
  if (existing?.exists()) {
    const role = (existing.data() as any).role as TalkRole;
    await updateDoc(ref, {
      lastSeen: serverTimestamp(), handRaised: false, name: clip(me.name, 100), photo: clip(me.photo, 2048),
      ...(asHost && role !== 'host' ? { role: 'host' } : {}),
    });
    return 'rejoined';
  }
  const b = writeBatch(db);
  b.set(ref, {
    role: asHost ? 'host' : 'listener', name: clip(me.name || 'Guest', 100), photo: clip(me.photo, 2048),
    joinedAt: serverTimestamp(), lastSeen: serverTimestamp(),
    handRaised: false, mutedByHost: false, selfMuted: !asHost,
  });
  b.update(talkRef(talkId), { memberCount: increment(1) });
  await b.commit();
  return 'joined';
}

export async function isMember(talkId: string, uid: string): Promise<boolean> {
  try { return (await getDoc(memberRef(talkId, uid))).exists(); } catch { return false; }
}

export async function leaveTalk(talkId: string, uid: string): Promise<void> {
  const b = writeBatch(db);
  b.delete(memberRef(talkId, uid));
  b.update(talkRef(talkId), { memberCount: increment(-1) });
  try { await b.commit(); }
  catch { await deleteDoc(memberRef(talkId, uid)).catch(() => {}); }
}

export const memberHeartbeat = (talkId: string, uid: string) => updateDoc(memberRef(talkId, uid), { lastSeen: serverTimestamp() });
export const setHandRaised = (talkId: string, uid: string, on: boolean) => updateDoc(memberRef(talkId, uid), { handRaised: on });
export const setSelfMuted = (talkId: string, uid: string, muted: boolean) => updateDoc(memberRef(talkId, uid), { selfMuted: muted });
/** Self: leave the stage, back to the audience. */
export const stepDown = (talkId: string, uid: string) => updateDoc(memberRef(talkId, uid), { role: 'listener', handRaised: false });
/** New host (after hand-off/takeover) promotes their own member doc. Rules check talk.hostId == uid. */
export const claimHostRole = (talkId: string, uid: string) => updateDoc(memberRef(talkId, uid), { role: 'host', handRaised: false, mutedByHost: false });

// ── Moderation (host / co-host) ─────────────────────────────────────────────────

/** Promote/demote. Also patches speakerUids right away so the rtc role flips without waiting
 *  for the host's roster reconcile. */
export async function setMemberRole(talkId: string, uid: string, role: Exclude<TalkRole, 'host'>): Promise<void> {
  const b = writeBatch(db);
  b.update(memberRef(talkId, uid), role === 'listener'
    ? { role, handRaised: false }
    : { role, handRaised: false, mutedByHost: false });
  // cohostUids is what the rules use to recognise a moderator, so it moves with the role.
  b.update(talkRef(talkId), {
    speakerUids: role === 'listener' ? arrayRemove(uid) : arrayUnion(uid),
    cohostUids: role === 'cohost' ? arrayUnion(uid) : arrayRemove(uid),
  });
  await b.commit();
}

export const setMutedByHost = (talkId: string, uid: string, muted: boolean) => updateDoc(memberRef(talkId, uid), { mutedByHost: muted });
export const lowerHandFor = (talkId: string, uid: string) => updateDoc(memberRef(talkId, uid), { handRaised: false });

/** Kick: banned from rejoining this talk (rules deny member create for uids in `kicked`). */
export async function kickMember(talkId: string, uid: string): Promise<void> {
  const b = writeBatch(db);
  b.update(talkRef(talkId), { kicked: arrayUnion(uid), speakerUids: arrayRemove(uid), memberCount: increment(-1) });
  b.delete(memberRef(talkId, uid));
  await b.commit();
}

/** Host housekeeping: drop member docs whose presence went stale (crashed tabs). */
export async function pruneMembers(talkId: string, uids: string[]): Promise<void> {
  await Promise.all(uids.map(u => deleteDoc(memberRef(talkId, u)).catch(() => {})));
}

/** Either side of a block between me and the host keeps me out (mirrors the rules' blocks check). */
export async function isBlockedWithHost(hostId: string, uid: string): Promise<boolean> {
  if (!hostId || !uid || hostId === uid) return false;
  const blocks = collection(db, 'blocks');
  try {
    const [a, b] = await Promise.all([
      getDocs(query(blocks, where('blockerId', '==', hostId), where('blockedId', '==', uid), limit(1))),
      getDocs(query(blocks, where('blockerId', '==', uid), where('blockedId', '==', hostId), limit(1))),
    ]);
    return !a.empty || !b.empty;
  } catch { return false; } // rules will still deny the member create if a block exists
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export function listenToTalkChat(talkId: string, count: number, cb: (m: ChatMessage[]) => void) {
  return onSnapshot(query(chatCol(talkId), orderBy('timestamp', 'asc'), limitToLast(count)),
    s => cb(s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ChatMessage))),
    () => cb([]));
}

export async function sendTalkChat(talkId: string, me: Me, text: string): Promise<void> {
  const clean = sanitizeChat(text);
  if (!clean) return;
  await addDoc(chatCol(talkId), {
    senderId: me.uid, senderName: clip(me.name || 'Guest', 99), senderPhoto: clip(me.photo, 2048),
    text: clean.slice(0, CHAT_MAX_LEN), timestamp: Date.now(), type: 'TEXT',
  });
}

export const deleteTalkChat = (talkId: string, msgId: string) => deleteDoc(doc(db, 'liveTalks', talkId, 'chat', msgId));

// ── Reactions ────────────────────────────────────────────────────────────────

export async function sendReaction(talkId: string, uid: string, emoji: string, count: number): Promise<void> {
  await addDoc(reactionsCol(talkId), {
    uid, emoji: clip(emoji, 16), count: Math.max(1, Math.min(30, Math.round(count))),
    at: serverTimestamp(),
    // Configure a Firestore TTL policy on reactions.expireAt (see docs/LIVE_TALK.md).
    expireAt: Timestamp.fromMillis(Date.now() + 60 * 60_000),
  });
}

/** Fires only for reactions that arrive AFTER subscribing (the initial page is skipped). */
export function listenToReactions(talkId: string, cb: (r: { uid: string; emoji: string; count: number }) => void) {
  let primed = false;
  return onSnapshot(query(reactionsCol(talkId), orderBy('at', 'desc'), limit(20)), s => {
    if (!primed) { primed = true; return; }
    s.docChanges().forEach(ch => {
      if (ch.type !== 'added') return;
      const d = ch.doc.data() as any;
      if (d?.emoji) cb({ uid: String(d.uid || ''), emoji: String(d.emoji), count: Number(d.count) || 1 });
    });
  }, () => {});
}

// ── Discovery ────────────────────────────────────────────────────────────────

/** Active talks, minus zombies whose host stopped heart-beating. Re-evaluates every 15s because a
 *  talk can die without any doc change. Needs the liveTalks(isActive ASC, timestamp DESC) index. */
export function listenToLiveTalkDiscovery(cb: (talks: LiveTalkDoc[]) => void) {
  let latest: LiveTalkDoc[] = [];
  const emit = () => cb(latest.filter(t => isTalkAlive(t as any, Date.now())));
  const unsub = onSnapshot(
    query(collection(db, 'liveTalks'), where('isActive', '==', true), orderBy('timestamp', 'desc'), limit(50)),
    s => { latest = s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as LiveTalkDoc)); emit(); },
    () => { latest = []; emit(); });
  const timer = setInterval(emit, 15_000);
  return () => { clearInterval(timer); unsub(); };
}
