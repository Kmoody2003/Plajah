import { collection, doc, getDoc, onSnapshot, runTransaction, writeBatch, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { ChatRoom, LiveClassSession } from '../types';
export const classroomMeetingRoomId = (sessionId: string) => `class_meeting_${sessionId}`;
export async function scheduleClassroomMeeting(classroomId: string, form: { title: string; scheduledAt: number; durationMinutes: number; meetingUrl?: string }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to schedule a class meeting.');
  if (!form.title.trim() || !Number.isFinite(form.scheduledAt) || !Number.isFinite(form.durationMinutes) || form.durationMinutes < 1 || form.durationMinutes > 1440) throw new Error('Choose a title, date, and duration.');
  const snapshot = await getDoc(doc(db, 'classrooms', classroomId));
  if (!snapshot.exists() || snapshot.data().ownerId !== uid) throw new Error('Only the classroom teacher can schedule meetings.');
  const classroom = snapshot.data();
  const ref = doc(collection(db, 'liveClassSessions'));
  const url = form.meetingUrl?.trim().replace(/^https:/i, 'https:');
  if (url && !/^https:\/\//i.test(url)) throw new Error('Use an HTTPS meeting link, or leave it blank for Plajah.');
  const session = { classroomId, hostId: uid, title: form.title.trim().slice(0, 200), scheduledAt: form.scheduledAt, durationMinutes: form.durationMinutes, status: 'SCHEDULED', attendeeIds: [], createdAt: Date.now(), ...(url ? { meetingUrl: url } : {}) };
  const batch = writeBatch(db);
  batch.set(ref, session);
  if (!url) batch.set(doc(db, 'chat_rooms', classroomMeetingRoomId(ref.id)), {
    workspaceType: 'CLASSROOM_MEETING', classroomId, liveClassSessionId: ref.id, ownerId: uid, type: 'GROUP',
    name: session.title, participants: [...new Set([uid, ...(classroom.enrolledStudents || [])])], updatedAt: Date.now(), nibblesEnabled: false,
  });
  await batch.commit();
  return ref.id;
}
export async function joinClassroomMeeting(sessionId: string): Promise<ChatRoom> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to join your class meeting.');
  return runTransaction(db, async transaction => {
    const sessionRef = doc(db, 'liveClassSessions', sessionId);
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists()) throw new Error('Meeting unavailable.');
    const session = sessionSnap.data() as LiveClassSession;
    const classroomSnap = await transaction.get(doc(db, 'classrooms', session.classroomId));
    const roomRef = doc(db, 'chat_rooms', classroomMeetingRoomId(sessionId));
    const roomSnap = await transaction.get(roomRef);
    if (!classroomSnap.exists() || !roomSnap.exists()) throw new Error('Ask your teacher to schedule a native Plajah meeting.');
    const classroom = classroomSnap.data();
    if (session.status === 'ENDED' || session.meetingUrl) throw new Error('This native meeting is unavailable.');
    if (classroom.ownerId !== uid && !classroom.enrolledStudents?.includes(uid)) throw new Error('This meeting is for enrolled students and their teacher.');
    if (session.status !== 'LIVE' && classroom.ownerId !== uid) throw new Error('Your teacher has not started this meeting yet.');
    const participants = [...new Set<string>([classroom.ownerId, ...(classroom.enrolledStudents || [])])];
    if (classroom.ownerId === uid) {
      transaction.update(sessionRef, { status: 'LIVE' });
      transaction.update(roomRef, { participants, updatedAt: Date.now() });
    }
    return { ...roomSnap.data(), id: roomRef.id, participants } as ChatRoom;
  });
}
export async function endClassroomMeeting(sessionId: string) {
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'liveClassSessions', sessionId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().hostId !== auth.currentUser?.uid) throw new Error('Only the host can end this meeting.');
    transaction.update(ref, { status: 'ENDED' });
  });
}
/** Keeps authorization tied to the current roster, rather than a copied participant list. */
export function watchClassroomMeeting(room: ChatRoom, receiveRoster: (ids: string[]) => void, ended: () => void) {
  const stops = [
    onSnapshot(doc(db, 'classrooms', room.classroomId!), snapshot => {
      if (!snapshot.exists()) { ended(); return; }
      const classroom = snapshot.data();
      const participants = [...new Set<string>([classroom.ownerId, ...(classroom.enrolledStudents || [])])];
      receiveRoster(participants);
      if (auth.currentUser?.uid === classroom.ownerId) void updateDoc(doc(db, 'chat_rooms', room.id), { participants, updatedAt: Date.now() }).catch(ended);
    }, ended),
    onSnapshot(doc(db, 'liveClassSessions', room.liveClassSessionId!), snapshot => { if (!snapshot.exists() || snapshot.data().status === 'ENDED') ended(); }, ended),
  ];
  return () => stops.forEach(stop => stop());
}
