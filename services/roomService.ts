// roomService — Plajah's CANONICAL Rooms primitive.
//
// A Room is a live social space: real-time presence + chat, always; plus optional
// capabilities layered on top (banter polls, mesh video, audio stage, synced
// playback). Rooms are the platform-wide standard — sports fan rooms, watch/listen
// parties, study rooms, and per-profile rooms are all the same primitive with a
// different `kind` + `capabilities` + `context`. See docs: unify the four legacy
// Firestore presence+chat variants (matchFanRoom, wcVideoRooms, chat_rooms) onto this.
//
// Two ownership models, both secured in firestore.rules:
//   • HOST-OWNED  (TOPIC / PROFILE / WATCH / LISTEN / STUDY): one host; host-only
//     doc writes; time-boxed by default (15/30/45 min) or persistent.
//   • SHARED      (MATCH / TEAM / LEAGUE): no single owner — a stable, deterministic
//     id so everyone lands in the same room; any signed-in user may create/update
//     (needed for presence + cross-user poll voting). Persistent.
//
// Firestore:
//   rooms/{roomId}                 LiveRoom
//   rooms/{roomId}/members/{uid}   RoomMember (presence)
//   rooms/{roomId}/chat/{msgId}    RoomMessage
//   rooms/{roomId}/polls/{pollId}  RoomPoll   (only when capabilities.polls)
//   rooms/{roomId}/polls/{pollId}/votes/{uid}  RoomPollVote (self-write only; tallied client-side)
//
// Member liveness: joinRoom starts a heartbeat (lastSeen = serverTimestamp, every 25s)
// that runs until leaveRoom; subscribeMembers drops members whose heartbeat stopped
// (services/presenceCore). Member docs carry `expireAt` for an optional TTL policy.

import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, addDoc, onSnapshot, query, where, orderBy, limit, getDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { StaleTracker, toMillisLoose, STALE_MS, HEARTBEAT_MS, EXPIRE_MS, REFILTER_MS, type HeartbeatObservation } from './presenceCore';
import type { RoomPollVote } from './roomPollCore';

export type RoomKind = 'TOPIC' | 'MATCH' | 'TEAM' | 'LEAGUE' | 'WATCH' | 'LISTEN' | 'STUDY' | 'PROFILE';

/** Shared rooms have no single host — a deterministic id gathers everyone in one place. */
export const SHARED_KINDS: ReadonlySet<RoomKind> = new Set<RoomKind>(['MATCH', 'TEAM', 'LEAGUE']);
export const isSharedKind = (k: RoomKind | undefined): boolean => !!k && SHARED_KINDS.has(k);

/** Composable capabilities. chat + presence are always on; the rest are progressive. */
export interface RoomCapabilities {
  chat?: boolean;          // default true
  presence?: boolean;      // default true
  polls?: boolean;         // roster-aware banter polls (sports)
  video?: boolean;         // mesh video via rtcCore
  audioStage?: boolean;    // Clubhouse/Spaces audio via rtcCore 'stage'
  syncedPlayback?: boolean; // host-broadcast playback via partyService
}

/** What this room is attached to — lets any surface open the right shared room. */
export interface RoomContext {
  sport?: string;          // 'FIFA', 'NBA', …
  matchId?: string;
  teamId?: string;
  leagueId?: string;
  contentId?: string;      // video / album / book id for watch/listen/read
  userId?: string;         // whose profile room this is
  emoji?: string;
  accent?: string;         // hex accent for theming
}

export interface RoomMember { uid: string; displayName: string; photoURL?: string | null; joinedAt: number; lastSeenMs?: number; }
export interface RoomMessage { id: string; uid: string; displayName: string; photoURL?: string | null; text: string; at: number; }

export interface LiveRoom {
  id: string;
  kind: RoomKind;
  hostId: string; hostName: string; hostPhoto?: string | null;
  title: string; topic?: string;
  createdAt: number;
  endsAt: number;          // time-boxed expiry; 0 for persistent rooms
  durationMins: number;    // 0 for persistent rooms
  persistent?: boolean;    // no time-box (shared rooms, profile rooms)
  endedAt?: number;        // set when a persistent room is ended early
  capabilities?: RoomCapabilities;
  context?: RoomContext;
  postId?: string;
}

const ROOM_COL = 'rooms';
const memberCol = (rid: string) => collection(db, ROOM_COL, rid, 'members');
const memberRef = (rid: string, uid: string) => doc(db, ROOM_COL, rid, 'members', uid);
const chatCol = (rid: string) => collection(db, ROOM_COL, rid, 'chat');
const pollCol = (rid: string) => collection(db, ROOM_COL, rid, 'polls');

export const ALLOWED_DURATIONS = [15, 30, 45] as const;
export const isLive = (room: LiveRoom | null): boolean => {
  if (!room) return false;
  if (room.endedAt) return false;
  if (room.persistent) return true;
  return Date.now() < room.endsAt;
};
export const minsLeft = (room: LiveRoom): number => {
  if (room.persistent) return -1; // no countdown
  return Math.max(0, Math.ceil((room.endsAt - Date.now()) / 60000));
};

const DEFAULT_CAPS: RoomCapabilities = { chat: true, presence: true };

type HostUser = { uid: string; displayName?: string | null; photoURL?: string | null };

function slug(s: string | undefined): string {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'x';
}

/** Deterministic id so everyone opening the same match / team / league shares one room. */
export function roomIdForContext(kind: RoomKind, ctx: RoomContext): string {
  if (kind === 'MATCH' && ctx.matchId) return `match_${slug(ctx.sport)}_${slug(ctx.matchId)}`;
  if (kind === 'TEAM' && ctx.teamId) return `team_${slug(ctx.sport)}_${slug(ctx.teamId)}`;
  if (kind === 'LEAGUE' && ctx.leagueId) return `league_${slug(ctx.leagueId)}`;
  if (kind === 'PROFILE' && ctx.userId) return `profile_${slug(ctx.userId)}`;
  if ((kind === 'WATCH' || kind === 'LISTEN') && ctx.contentId) return `${kind.toLowerCase()}_${slug(ctx.contentId)}`;
  // STUDY rooms are addressable too, so Ora's focus rooms are a stable place people
  // arrive at rather than a new random room per visit — body doubling only works if
  // everyone lands in the same room.
  if (kind === 'STUDY' && ctx.contentId) return `study_${slug(ctx.contentId)}`;
  return `room_${slug(kind)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Create a time-boxed HOST-OWNED room (the classic "start a room" flow). */
export async function createRoom(input: {
  title: string; durationMins?: number; topic?: string; user: HostUser;
  kind?: RoomKind; capabilities?: RoomCapabilities; context?: RoomContext;
}): Promise<LiveRoom> {
  const kind = input.kind ?? 'TOPIC';
  const dur = ALLOWED_DURATIONS.includes(input.durationMins as any) ? (input.durationMins as number) : 30;
  const id = `room_${slug(kind)}_${input.user.uid.slice(0, 6)}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  const room: LiveRoom = {
    id, kind,
    hostId: input.user.uid,
    hostName: input.user.displayName || 'Host',
    hostPhoto: input.user.photoURL || null,
    title: input.title.trim().slice(0, 120),
    ...(input.topic ? { topic: input.topic } : {}),
    createdAt: now,
    endsAt: now + dur * 60000,
    durationMins: dur,
    capabilities: { ...DEFAULT_CAPS, ...(input.capabilities || {}) },
    ...(input.context ? { context: input.context } : {}),
  };
  await setDoc(doc(db, ROOM_COL, id), room);
  await joinRoom(id, { uid: input.user.uid, displayName: room.hostName, photoURL: room.hostPhoto });
  return room;
}

/**
 * Open (or lazily create) a SHARED context room — the standard way any sports or
 * content surface joins the one room for a match / team / league. Idempotent:
 * the first visitor materializes it, everyone after joins the same doc.
 */
export async function getOrCreateContextRoom(input: {
  kind: RoomKind; context: RoomContext; title: string;
  capabilities?: RoomCapabilities; user?: HostUser;
}): Promise<LiveRoom> {
  const id = roomIdForContext(input.kind, input.context);
  const existing = await getRoom(id);
  if (existing) {
    // Deterministic host-owned rooms (PROFILE/WATCH/LISTEN/STUDY) reuse one id forever, so an
    // ended room must be reopenable by its host — otherwise it is dead for good.
    if (existing.endedAt && existing.hostId && input.user?.uid === existing.hostId) {
      try {
        await setDoc(doc(db, ROOM_COL, id), { endedAt: deleteField(), endsAt: 0, durationMins: 0, persistent: true }, { merge: true });
        delete existing.endedAt;
        Object.assign(existing, { endsAt: 0, durationMins: 0, persistent: true });
      } catch { /* rules/offline — fall through with the ended room */ }
    }
    if (input.user?.uid) await joinRoom(id, input.user).catch(() => {});
    return existing;
  }
  const shared = isSharedKind(input.kind);
  const now = Date.now();
  const room: LiveRoom = {
    id, kind: input.kind,
    hostId: shared ? '' : (input.user?.uid || ''),
    hostName: shared ? input.title.slice(0, 60) : (input.user?.displayName || 'Host'),
    hostPhoto: shared ? null : (input.user?.photoURL || null),
    title: input.title.trim().slice(0, 120),
    createdAt: now,
    endsAt: 0,
    durationMins: 0,
    persistent: true,
    capabilities: { ...DEFAULT_CAPS, ...(input.capabilities || {}) },
    context: input.context,
  };
  await setDoc(doc(db, ROOM_COL, id), room, { merge: true });
  if (input.user?.uid) await joinRoom(id, input.user).catch(() => {});
  return room;
}

/** Link the room to the feed post created for it. */
export async function setRoomPost(roomId: string, postId: string): Promise<void> {
  try { await setDoc(doc(db, ROOM_COL, roomId), { postId }, { merge: true }); } catch { /* */ }
}

// ── Member heartbeat registry ────────────────────────────────────────────────
// One heartbeat per (room, uid), idempotent: join starts/refreshes it, leave stops it and
// deletes the member doc. pagehide removes the doc best-effort; pageshow / tab-visible
// re-publishes it. Without this, a closed tab left a member doc (a ghost) forever.
interface MemberBeat {
  roomId: string; user: HostUser; joinedAt: number;
  timer: ReturnType<typeof setInterval> | null; lastWriteLocal: number;
  onHide: () => void; onShow: () => void; onVis: () => void;
}
const beats = new Map<string, MemberBeat>();
const beatKey = (rid: string, uid: string) => `${rid}::${uid}`;

function writeMember(b: MemberBeat): Promise<void> {
  b.lastWriteLocal = Date.now();
  return setDoc(memberRef(b.roomId, b.user.uid), {
    uid: b.user.uid,
    displayName: b.user.displayName || 'Guest',
    photoURL: b.user.photoURL || null,
    joinedAt: b.joinedAt,
    lastSeen: serverTimestamp(),
    expireAt: new Date(b.lastWriteLocal + EXPIRE_MS), // optional TTL policy target
  });
}
function startBeat(b: MemberBeat): void {
  if (b.timer) clearInterval(b.timer);
  b.timer = setInterval(() => { writeMember(b).catch(() => {}); }, HEARTBEAT_MS);
}

export async function joinRoom(roomId: string, user: HostUser): Promise<void> {
  const k = beatKey(roomId, user.uid);
  let b = beats.get(k);
  if (!b) {
    const nb: MemberBeat = {
      roomId, user, joinedAt: Date.now(), timer: null, lastWriteLocal: 0,
      onHide: () => { if (nb.timer) { clearInterval(nb.timer); nb.timer = null; } deleteDoc(memberRef(roomId, user.uid)).catch(() => {}); },
      onShow: () => { if (!nb.timer) { writeMember(nb).catch(() => {}); startBeat(nb); } },
      onVis: () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') { writeMember(nb).catch(() => {}); startBeat(nb); }
      },
    };
    b = nb;
    beats.set(k, b);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', b.onHide);
      window.addEventListener('pageshow', b.onShow);
      document.addEventListener('visibilitychange', b.onVis);
    }
  } else {
    b.user = user;
  }
  startBeat(b);
  await writeMember(b);
}
export async function leaveRoom(roomId: string, uid: string): Promise<void> {
  const k = beatKey(roomId, uid);
  const b = beats.get(k);
  if (b) {
    if (b.timer) clearInterval(b.timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', b.onHide);
      window.removeEventListener('pageshow', b.onShow);
      document.removeEventListener('visibilitychange', b.onVis);
    }
    beats.delete(k);
  }
  try { await deleteDoc(memberRef(roomId, uid)); } catch { /* */ }
}
/** Host ends the room early — sets endsAt to now (and endedAt for persistent rooms). */
export async function endRoom(roomId: string): Promise<void> {
  try { await setDoc(doc(db, ROOM_COL, roomId), { endsAt: Date.now(), endedAt: Date.now() }, { merge: true }); } catch { /* */ }
}

export async function getRoom(roomId: string): Promise<LiveRoom | null> {
  try { const s = await getDoc(doc(db, ROOM_COL, roomId)); return s.exists() ? (s.data() as LiveRoom) : null; } catch { return null; }
}
export function subscribeRoom(roomId: string, cb: (room: LiveRoom | null) => void): () => void {
  return onSnapshot(doc(db, ROOM_COL, roomId), s => cb(s.exists() ? (s.data() as LiveRoom) : null), () => cb(null));
}
/** Live members only — stale heartbeats (closed tabs, crashed apps) are filtered out. */
export function subscribeMembers(roomId: string, cb: (m: RoomMember[]) => void): () => void {
  const tracker = new StaleTracker(STALE_MS);
  let latest: RoomMember[] = [];
  let lastSig = '';
  const emit = (force = false) => {
    const fresh = tracker.freshIds(Date.now());
    const list = latest.filter(m => fresh.has(m.uid));
    const sig = list.map(m => `${m.uid}|${m.displayName}|${m.photoURL ?? ''}`).join(',');
    if (!force && sig === lastSig) return;
    lastSig = sig;
    cb(list);
  };
  const unsub = onSnapshot(memberCol(roomId), snap => {
    const now = Date.now();
    const obs: HeartbeatObservation[] = [];
    latest = snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      const hb = toMillisLoose(data.lastSeen);
      const own = beats.get(beatKey(roomId, d.id));
      if (own && !d.metadata.hasPendingWrites) tracker.noteOwnHeartbeat(hb, own.lastWriteLocal);
      const joinedAt = typeof data.joinedAt === 'number' ? data.joinedAt : 0;
      // Legacy member docs (no lastSeen) age from joinedAt — old ghosts vanish immediately.
      obs.push({ id: d.id, heartbeatMs: hb, legacyTs: hb == null && !d.metadata.hasPendingWrites ? joinedAt : null });
      const m: RoomMember = {
        uid: d.id,
        displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : 'Guest',
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        joinedAt,
      };
      if (hb != null) m.lastSeenMs = hb;
      return m;
    });
    tracker.observe(obs, now);
    emit(true);
  }, () => cb([]));
  const refilter = setInterval(() => emit(), REFILTER_MS);
  return () => { clearInterval(refilter); unsub(); };
}
export async function sendRoomMessage(roomId: string, msg: Omit<RoomMessage, 'id' | 'at'>): Promise<void> {
  await addDoc(chatCol(roomId), { ...msg, at: Date.now() });
}
export function subscribeRoomChat(roomId: string, cb: (m: RoomMessage[]) => void): () => void {
  const q = query(chatCol(roomId), orderBy('at', 'desc'), limit(80));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).reverse()), () => cb([]));
}

// ── Polls capability (shared rooms) ──────────────────────────────────────────
export interface RoomPollOption { label: string; tag?: string | null; }
// Votes are one doc per voter under polls/{pollId}/votes/{uid} (self-write only in rules) —
// the poll doc itself carries no vote map, so nobody can overwrite anyone else's vote.
// Tally with tallyPollVotes() from ./roomPollCore.
export const MAX_POLL_OPTIONS = 8;
export interface RoomPoll {
  id: string; key?: string; question: string; hint?: string;
  options: RoomPollOption[]; createdBy: string; createdAt: number;
}
export function subscribeRoomPolls(roomId: string, cb: (p: RoomPoll[]) => void): () => void {
  const q = query(pollCol(roomId), orderBy('createdAt', 'desc'), limit(12));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => cb([]));
}
export async function addRoomPoll(
  roomId: string,
  poll: { key?: string; question: string; hint?: string; options: RoomPollOption[] },
  createdBy: string,
): Promise<void> {
  const options = poll.options.slice(0, MAX_POLL_OPTIONS).map(o => ({ label: o.label.slice(0, 80), tag: o.tag ?? null }));
  await addDoc(pollCol(roomId), {
    question: poll.question.slice(0, 300),
    options,
    createdBy,
    createdAt: Date.now(),
    ...(poll.key ? { key: poll.key.slice(0, 80) } : {}),
    ...(poll.hint ? { hint: poll.hint.slice(0, 200) } : {}),
  });
}
const voteCol = (rid: string, pid: string) => collection(db, ROOM_COL, rid, 'polls', pid, 'votes');
/** Cast / change the viewer's own vote (option index). */
export async function castRoomPollVote(roomId: string, pollId: string, uid: string, choice: number): Promise<void> {
  await setDoc(doc(voteCol(roomId, pollId), uid), { uid, choice: Math.floor(choice), at: Date.now() });
}
export async function clearRoomPollVote(roomId: string, pollId: string, uid: string): Promise<void> {
  try { await deleteDoc(doc(voteCol(roomId, pollId), uid)); } catch { /* */ }
}
export function subscribeRoomPollVotes(roomId: string, pollId: string, cb: (v: RoomPollVote[]) => void): () => void {
  return onSnapshot(voteCol(roomId, pollId), snap => cb(snap.docs.map(d => {
    const data = d.data() as Record<string, unknown>;
    return { uid: d.id, choice: typeof data.choice === 'number' ? data.choice : -1, at: typeof data.at === 'number' ? data.at : 0 };
  })), () => cb([]));
}

/**
 * Live room a user is currently hosting — powers the "Join {name}'s room" banner on
 * profiles. Uses a plain `where(hostId)` query (no orderBy) to avoid a composite index
 * (see firestore gotchas), filtering/sorting for the freshest LIVE room client-side.
 */
export function subscribeHostLiveRoom(userId: string, cb: (room: LiveRoom | null) => void): () => void {
  const q = query(collection(db, ROOM_COL), where('hostId', '==', userId), limit(12));
  return onSnapshot(
    q,
    snap => {
      const live = snap.docs
        .map(d => d.data() as LiveRoom)
        .filter(r => isLive(r))
        .sort((a, b) => b.createdAt - a.createdAt);
      cb(live[0] ?? null);
    },
    () => cb(null),
  );
}

/** Share URL for a room — a deep link the app opens straight into the room. */
export const roomShareUrl = (roomId: string): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://plajah.app';
  return `${origin}/?room=${roomId}`;
};

// ── Unified opener helpers (dispatch the canonical open event) ────────────────

/** Open an existing room by id anywhere in the app. */
export function openRoom(roomId: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('plajah:open-room', { detail: { roomId } }));
}

/**
 * Open (creating if needed) the shared room for a sports/content context. This is
 * the one call every surface should use — "join the Mexico–USA room", "join the
 * Lakers room", etc. — instead of bespoke fan-room plumbing.
 */
export async function openContextRoom(input: {
  kind: RoomKind; context: RoomContext; title: string;
  capabilities?: RoomCapabilities; user?: HostUser;
}): Promise<void> {
  const room = await getOrCreateContextRoom(input);
  openRoom(room.id);
}
