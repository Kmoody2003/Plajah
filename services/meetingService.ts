import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import { encryptText, decryptText } from './cryptoService';
import { changeMeeting, MeetingAction, MeetingControl, newMeeting } from './meetingCore';
export type MeetingMessage = { id: string; senderId: string; senderName: string; text: string; timestamp: number };
const controlRef = (roomId: string) => doc(db, 'chat_rooms', roomId, 'meetings', 'control');
export const watchMeeting = (roomId: string, receive: (state: MeetingControl | null) => void, fail: (error: Error) => void) => onSnapshot(controlRef(roomId), snap => receive(snap.exists() ? snap.data() as MeetingControl : null), fail);
export async function updateMeeting(roomId: string, action: MeetingAction) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to manage this meeting.');
  await runTransaction(db, async transaction => {
    const parent = await transaction.get(doc(db, 'chat_rooms', roomId));
    const current = await transaction.get(controlRef(roomId));
    if (!parent.exists()) throw new Error('Conversation unavailable.');
    const room = parent.data();
    if (!current.exists() && room.ownerId !== uid) throw new Error('The conversation owner must start meeting controls.');
    const state = current.exists() ? current.data() as MeetingControl : newMeeting(uid);
    transaction.set(controlRef(roomId), changeMeeting(state, uid, room.participants || [], action));
  });
}
export function watchMeetingMessages(roomId: string, sessionId: string, receive: (messages: MeetingMessage[]) => void, fail: (error: Error) => void) {
  let generation = 0;
  const unsubscribe = onSnapshot(query(collection(db, 'chat_rooms', roomId, 'meeting_rtc', sessionId, 'messages'), orderBy('timestamp', 'desc'), limit(100)), async snap => {
    const version = ++generation;
    try {
      const messages = await Promise.all(snap.docs.map(async entry => {
        const data = entry.data() as Omit<MeetingMessage, 'id'>;
        return { ...data, id: entry.id, text: await decryptText(data.text, `${roomId}:meeting:${sessionId}`) };
      }));
      if (version === generation) receive(messages.reverse());
    } catch (error) { if (version === generation) fail(error as Error); }
  }, fail);
  return () => { generation++; unsubscribe(); };
}
export async function sendMeetingMessage(roomId: string, sessionId: string, text: string) {
  const user = auth.currentUser;
  if (!user || !text.trim() || text.trim().length > 2000) throw new Error('Write a message up to 2,000 characters.');
  await addDoc(collection(db, 'chat_rooms', roomId, 'meeting_rtc', sessionId, 'messages'), {
    senderId: user.uid, senderName: (user.displayName || 'Participant').slice(0, 100), timestamp: Date.now(),
    text: await encryptText(text.trim(), `${roomId}:meeting:${sessionId}`),
  });
}
