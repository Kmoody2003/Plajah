/**
 * meetingSchedule — scheduled meetings, guest links and the waiting room (rules: firestore.rules,
 * chat_rooms/{room}/scheduled_meetings and public_meetings). Pure rules: ./scheduleCore.
 */
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { sendMessage, ensureGuestAuth } from '../backendService';
import { encryptText } from '../cryptoService';
import {
  validateSchedule, cleanGuestName, describeWhen,
  type ScheduledMeeting, type PublicMeeting, type LobbyEntry, type LobbyStatus,
} from './scheduleCore';
import type { Recurrence } from '../postman/calendarTime';

const schedCol = (roomId: string) => collection(db, 'chat_rooms', roomId, 'scheduled_meetings');
const pubDoc = (id: string) => doc(db, 'public_meetings', id);
const lobbyCol = (id: string) => collection(db, 'public_meetings', id, 'lobby');

/** 24 random letters/digits: the meeting id doubles as the guest link's secret. */
export function newMeetingId(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, b => abc[b % abc.length]).join('');
}

/** Small reference stored on the chat message that announces a meeting. */
export interface MeetingInviteRef { meetingId: string; title: string; startsAt: number; durationMin: number; recurrence?: Recurrence; guestsAllowed: boolean }

export async function scheduleMeeting(roomId: string, input: {
  title: string; startsAt: number; durationMin: number; agenda?: string; recurrence?: Recurrence; guestsAllowed: boolean;
}): Promise<ScheduledMeeting> {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) throw new Error('Sign in to schedule a meeting.');
  const problem = validateSchedule(input);
  if (problem) throw new Error(problem);
  const id = newMeetingId();
  const m: ScheduledMeeting = {
    id, roomId, title: input.title.trim(), startsAt: input.startsAt, durationMin: input.durationMin,
    ...(input.agenda?.trim() ? { agenda: input.agenda.trim().slice(0, 2000) } : {}),
    ...(input.recurrence && input.recurrence !== 'none' ? { recurrence: input.recurrence } : {}),
    guestsAllowed: input.guestsAllowed, createdBy: u.uid, createdByName: u.displayName || 'Host', createdAt: Date.now(),
  };
  const { id: _id, ...stored } = m;
  await setDoc(doc(schedCol(roomId), id), stored);
  // The public stub lets the link resolve for members and (if allowed) guests.
  const pub: PublicMeeting & { guestsAllowed: boolean } = {
    roomId, title: m.title, startsAt: m.startsAt, durationMin: m.durationMin, hostUid: u.uid, hostName: m.createdByName,
    guestsAllowed: m.guestsAllowed,
  };
  await setDoc(pubDoc(id), pub);
  const invite: MeetingInviteRef = {
    meetingId: id, title: m.title, startsAt: m.startsAt, durationMin: m.durationMin, guestsAllowed: m.guestsAllowed,
    ...(m.recurrence ? { recurrence: m.recurrence } : {}),
  };
  await sendMessage(roomId, {
    senderId: u.uid, senderName: u.displayName || 'Host', senderPhoto: u.photoURL || '',
    type: 'ACTION',
    text: await encryptText(`Meeting scheduled: ${m.title} · ${describeWhen(m.startsAt)}`, roomId),
    meetingInvite: invite,
    isPinned: true,
  } as any);
  return m;
}

export async function cancelMeeting(roomId: string, meetingId: string): Promise<void> {
  const at = Date.now();
  await updateDoc(doc(schedCol(roomId), meetingId), { canceledAt: at });
  await updateDoc(pubDoc(meetingId), { canceledAt: at }).catch(() => {});
}

export async function getScheduledMeeting(roomId: string, meetingId: string): Promise<ScheduledMeeting | null> {
  const s = await getDoc(doc(schedCol(roomId), meetingId));
  return s.exists() ? { ...(s.data() as ScheduledMeeting), id: s.id } : null;
}

export function listenScheduledMeeting(roomId: string, meetingId: string, cb: (m: ScheduledMeeting | null) => void): () => void {
  return onSnapshot(doc(schedCol(roomId), meetingId), s => cb(s.exists() ? { ...(s.data() as ScheduledMeeting), id: s.id } : null), () => cb(null));
}

/** Upcoming (and recurring) meetings in a room, soonest first. */
export function listenRoomMeetings(roomId: string, cb: (m: ScheduledMeeting[]) => void): () => void {
  return onSnapshot(query(schedCol(roomId), orderBy('startsAt', 'desc'), limit(40)),
    snap => cb(snap.docs.map(d => ({ ...(d.data() as ScheduledMeeting), id: d.id }))), () => cb([]));
}

// ── Link + waiting room ──────────────────────────────────────────────────────

/** Wait for a saved login to load, so a member opening a link is never swapped for a guest session. */
async function authReady(): Promise<void> {
  try { await (auth as unknown as { authStateReady?: () => Promise<void> }).authStateReady?.(); } catch { /* older SDK */ }
}

export async function getPublicMeeting(meetingId: string): Promise<(PublicMeeting & { guestsAllowed: boolean }) | null> {
  await authReady();
  const user = await ensureGuestAuth();
  if (!user) throw new Error('This browser could not open the meeting. Allow cookies for this site and try again.');
  const s = await getDoc(pubDoc(meetingId));
  return s.exists() ? (s.data() as PublicMeeting & { guestsAllowed: boolean }) : null;
}

/** Whether the signed-in person is a member of the meeting's chat (members skip the waiting room). */
export async function isRoomMember(roomId: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || auth.currentUser?.isAnonymous) return false;
  try {
    const s = await getDoc(doc(db, 'chat_rooms', roomId));
    return s.exists() && (s.data().participants || []).includes(uid);
  } catch { return false; }
}

/** A guest knocks: their entry waits for someone in the chat to let them in. */
export async function requestEntry(meetingId: string, name: string): Promise<void> {
  const clean = cleanGuestName(name);
  if (!clean) throw new Error('Enter your name (2 to 60 characters).');
  await authReady();
  const user = await ensureGuestAuth();
  if (!user) throw new Error('This browser could not open the meeting.');
  await setDoc(doc(lobbyCol(meetingId), user.uid), { name: clean, status: 'WAITING', requestedAt: Date.now() });
}

export function listenMyEntry(meetingId: string, cb: (e: LobbyEntry | null) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { cb(null); return () => {}; }
  return onSnapshot(doc(lobbyCol(meetingId), uid), s => cb(s.exists() ? { ...(s.data() as LobbyEntry), uid: s.id } : null), () => cb(null));
}

export async function leaveLobby(meetingId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) await deleteDoc(doc(lobbyCol(meetingId), uid)).catch(() => {});
}

/** For people in the chat: everyone waiting or already admitted. */
export function listenLobby(meetingId: string, cb: (entries: LobbyEntry[]) => void): () => void {
  return onSnapshot(query(lobbyCol(meetingId), where('status', 'in', ['WAITING', 'ADMITTED'])),
    snap => cb(snap.docs.map(d => ({ ...(d.data() as LobbyEntry), uid: d.id })).sort((a, b) => a.requestedAt - b.requestedAt)),
    () => cb([]));
}

export async function decideEntry(meetingId: string, guestUid: string, status: Exclude<LobbyStatus, 'WAITING'>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to manage the waiting room.');
  await updateDoc(doc(lobbyCol(meetingId), guestUid), { status, decidedBy: uid, decidedAt: serverTimestamp() });
}

/** The call session a scheduled meeting uses: the room's own for members-only, a shared one when guests can join. */
export function meetingRtcCollection(meeting: { id: string; guestsAllowed: boolean }, roomId: string): string {
  return meeting.guestsAllowed ? `public_meetings/${meeting.id}/rtc` : `chat_rooms/${roomId}/meeting_rtc`;
}
