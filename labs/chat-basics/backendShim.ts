// Lab-only stand-in for services/backendService: real exports, plus sample rooms/messages and a
// signed-in user so ChatWindow renders without Firebase. Wired by chat-basics-lab.vite.config.mjs.
export * from '../../services/backendService';
import type { ChatMessage, ChatRoom, UserProfile } from '../../types';

const ME = 'lab-me';
export const auth: any = {
  currentUser: { uid: ME, displayName: 'Kenne', photoURL: '', isAnonymous: false, getIdToken: async () => 'lab' },
  onAuthStateChanged: (cb: (u: unknown) => void) => { cb(auth.currentUser); return () => {}; },
};

const t0 = Date.now() - 60 * 60 * 1000;
const at = (min: number) => t0 + min * 60 * 1000;
const base = (id: string, senderId: string, senderName: string, min: number, extra: Partial<ChatMessage>): ChatMessage =>
  ({ id, senderId, senderName, senderPhoto: '', timestamp: at(min), type: 'TEXT', ...extra } as ChatMessage);

export const LAB_ROOM: ChatRoom = {
  id: 'lab-room', type: 'GROUP', name: 'Worship Team', participants: [ME, 'lab-dana', 'lab-sam'],
  updatedAt: at(40), lastSenderId: 'lab-sam', ownerId: ME,
} as ChatRoom;

let messages: ChatMessage[] = [
  base('m1', 'lab-dana', 'Dana Reyes', 1, { text: 'Set list for Sunday is in the shared folder 🙌' }),
  base('m2', 'lab-dana', 'Dana Reyes', 2, { attachment: { url: '#', name: 'Sunday Set List - Nov 2.pdf', size: 248_000, mime: 'application/pdf', kind: 'pdf' } }),
  base('m3', ME, 'Kenne', 5, { text: 'Thanks! Can we move rehearsal to 6:30?', editedAt: at(6) }),
  base('m4', 'lab-sam', 'Sam Okafor', 8, { deletedAt: at(9) }),
  base('m5', 'lab-sam', 'Sam Okafor', 12, {
    text: 'Chord charts are here https://www.example.org/charts',
    linkPreview: { url: 'https://www.example.org/charts', title: 'Chord charts for "Way Maker"', description: 'Capo 2, key of E. Bridge repeats x3.', siteName: 'example.org' },
  }),
  base('m6', ME, 'Kenne', 20, { text: 'Parking lot will be closed Saturday morning for the fall festival setup.', forwardedFrom: 'Pastor James' }),
  base('m7', 'lab-dana', 'Dana Reyes', 30, { attachment: { url: '#', name: 'Volunteer roster.xlsx', size: 31_500, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'sheet' } }),
  base('m8', ME, 'Kenne', 40, { text: 'Sounds good, see everyone at 6:30.' }),
];
const subs = new Set<(m: ChatMessage[]) => void>();
const emit = () => subs.forEach(s => s([...messages]));

export const listenToMessages = (_roomId: string, cb: (m: ChatMessage[], meta?: any) => void) => {
  const s = (m: ChatMessage[]) => cb(m, { hasMore: false, cursor: null });
  subs.add(s); s([...messages]);
  return () => { subs.delete(s); };
};
export const sendMessage = async (_roomId: string, m: any) => {
  const id = `local-${Date.now()}`;
  messages = [...messages, { ...m, id, timestamp: Date.now() }];
  emit();
  return id;
};
export const listenToChatRooms = (cb: (r: ChatRoom[]) => void) => {
  cb([
    LAB_ROOM,
    { id: 'lab-dm-dana', type: 'PRIVATE', participants: [ME, 'lab-dana'], updatedAt: at(35) } as ChatRoom,
    { id: 'lab-staff', type: 'GROUP', name: 'Staff', participants: [ME, 'lab-sam'], updatedAt: at(10) } as ChatRoom,
  ]);
  return () => {};
};
const people: Record<string, Partial<UserProfile>> = {
  [ME]: { uid: ME, displayName: 'Kenne' },
  'lab-dana': { uid: 'lab-dana', displayName: 'Dana Reyes' },
  'lab-sam': { uid: 'lab-sam', displayName: 'Sam Okafor' },
};
export const fetchUserProfiles = async (uids: string[]) => uids.map(u => people[u]).filter(Boolean) as UserProfile[];
export const fetchCollabProjects = async () => [];
export const fetchUserContent = async () => [];
export const markMessageAsSeen = async () => {};
export const updateTypingStatus = async () => {};
export const uploadFile = async (_path: string, blob: Blob) => URL.createObjectURL(blob);
