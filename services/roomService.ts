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

import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, addDoc, onSnapshot, query, where, orderBy, limit, getDoc } from 'firebase/firestore';

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

export interface RoomMember { uid: string; displayName: string; photoURL?: string | null; joinedAt: number; }
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
  await setDoc(memberRef(id, input.user.uid), { uid: input.user.uid, displayName: room.hostName, photoURL: room.hostPhoto, joinedAt: now });
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

export async function joinRoom(roomId: string, user: HostUser): Promise<void> {
  await setDoc(memberRef(roomId, user.uid), { uid: user.uid, displayName: user.displayName || 'Guest', photoURL: user.photoURL || null, joinedAt: Date.now() });
}
export async function leaveRoom(roomId: string, uid: string): Promise<void> {
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
export function subscribeMembers(roomId: string, cb: (m: RoomMember[]) => void): () => void {
  return onSnapshot(memberCol(roomId), snap => cb(snap.docs.map(d => d.data() as RoomMember)), () => cb([]));
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
export interface RoomPoll {
  id: string; key: string; question: string; hint?: string;
  options: RoomPollOption[]; votes: Record<string, string[]>; createdAt: number;
}
export function subscribeRoomPolls(roomId: string, cb: (p: RoomPoll[]) => void): () => void {
  const q = query(pollCol(roomId), orderBy('createdAt', 'desc'), limit(12));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => cb([]));
}
export async function addRoomPoll(roomId: string, poll: Omit<RoomPoll, 'id' | 'votes' | 'createdAt'>): Promise<void> {
  await addDoc(pollCol(roomId), { ...poll, votes: {}, createdAt: Date.now() });
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
