// roomService — platform-wide Live Rooms. Generalizes the sports fan-room mechanic into a
// time-boxed live space any user can start (15–45 min) on any topic. Same proven principle:
// Firestore presence (members) + real-time chat via onSnapshot. The room surfaces as a social
// post in the feed and on the host's profile, and auto-expires at endsAt.
//
// Firestore:
//   rooms/{roomId}                 LiveRoom (host, title, endsAt, …)
//   rooms/{roomId}/members/{uid}   RoomMember (presence)
//   rooms/{roomId}/chat/{msgId}    RoomMessage

import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, limit, getDoc } from 'firebase/firestore';

export interface RoomMember { uid: string; displayName: string; photoURL?: string | null; joinedAt: number; }
export interface RoomMessage { id: string; uid: string; displayName: string; photoURL?: string | null; text: string; at: number; }
export interface LiveRoom {
  id: string;
  hostId: string; hostName: string; hostPhoto?: string | null;
  title: string; topic?: string;
  createdAt: number; endsAt: number; durationMins: number;
  postId?: string;
}

const ROOM_COL = 'rooms';
const memberCol = (rid: string) => collection(db, ROOM_COL, rid, 'members');
const memberRef = (rid: string, uid: string) => doc(db, ROOM_COL, rid, 'members', uid);
const chatCol = (rid: string) => collection(db, ROOM_COL, rid, 'chat');

export const ALLOWED_DURATIONS = [15, 30, 45] as const;
export const isLive = (room: LiveRoom | null): boolean => !!room && Date.now() < room.endsAt;
export const minsLeft = (room: LiveRoom): number => Math.max(0, Math.ceil((room.endsAt - Date.now()) / 60000));

type HostUser = { uid: string; displayName?: string | null; photoURL?: string | null };

/** Create a time-boxed room and seat the host as the first member. */
export async function createRoom(input: { title: string; durationMins: number; topic?: string; user: HostUser }): Promise<LiveRoom> {
  const dur = ALLOWED_DURATIONS.includes(input.durationMins as any) ? input.durationMins : 30;
  const id = `room_${input.user.uid.slice(0, 6)}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  const room: LiveRoom = {
    id,
    hostId: input.user.uid,
    hostName: input.user.displayName || 'Host',
    hostPhoto: input.user.photoURL || null,
    title: input.title.trim().slice(0, 120),
    ...(input.topic ? { topic: input.topic } : {}),
    createdAt: now,
    endsAt: now + dur * 60000,
    durationMins: dur,
  };
  await setDoc(doc(db, ROOM_COL, id), room);
  await setDoc(memberRef(id, input.user.uid), { uid: input.user.uid, displayName: room.hostName, photoURL: room.hostPhoto, joinedAt: now });
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
/** Host ends the room early — sets endsAt to now. */
export async function endRoom(roomId: string): Promise<void> {
  try { await setDoc(doc(db, ROOM_COL, roomId), { endsAt: Date.now() }, { merge: true }); } catch { /* */ }
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

/** Share URL for a room — a deep link the app opens straight into the room. */
export const roomShareUrl = (roomId: string): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://plajah.app';
  return `${origin}/?room=${roomId}`;
};
