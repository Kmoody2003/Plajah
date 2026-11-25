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
  base('m9', ME, 'Kenne', 55, {
    type: 'ACTION',
    text: 'Meeting recap: Worship Team · Oct 28\nRehearsal moves to 6:30 on Thursdays. Dana sends the new schedule by Friday; Sam brings the extra mic stands Saturday.',
    meetingRecap: { recordingId: 'lab-rec', title: 'Worship Team · Oct 28', durationSec: 1742, mode: 'CLOUD', hostName: 'Kenne', speakers: ['Kenne', 'Dana Reyes', 'Sam Okafor'], actionCount: 2 },
  }),
  // Plajah content shared in — plays inline (components/chat/ChatEmbedCard).
  base('e1', 'lab-dana', 'Dana Reyes', 56, { type: 'MEDIA', text: 'Shared: Sunday Anthems', embed: { kind: 'ALBUM', id: 'lab-album', title: 'Sunday Anthems' } }),
  base('e2', 'lab-sam', 'Sam Okafor', 57, { text: 'This one for the opener 🔥 http://127.0.0.1:3183/share?type=album&id=lab-album&track=t2' }),
  base('e3', ME, 'Kenne', 58, { type: 'MEDIA', text: 'Shared: Forest walk', embed: { kind: 'REELLO', id: 'lab-video', title: 'Forest walk' } }),
  base('e4', 'lab-dana', 'Dana Reyes', 59, { type: 'MEDIA', text: 'Shared: The Fall Festival', embed: { kind: 'MOVIE', id: 'lab-film', title: 'The Fall Festival' } }),
  base('e5', 'lab-sam', 'Sam Okafor', 60, { text: 'Photos from setup http://127.0.0.1:3183/?view=transfer&id=lab-transfer' }),
  base('e6', ME, 'Kenne', 61, { attachment: { url: '/academia/baobab.jpg', name: 'stage-plot.jpg', size: 120_000, mime: 'image/jpeg', kind: 'image' } }),
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
// ?view=dm: people to search. Priya's DM already exists but sits outside the live list (the listener
// never fires for it); Blocked Bo's create is refused by rules.
const dmPeople = [
  { uid: 'lab-priya', displayName: 'Priya Nair', bio: 'Existing DM outside the live list' },
  { uid: 'lab-new', displayName: 'Priya New', bio: 'No DM yet' },
  { uid: 'lab-blocked', displayName: 'Priya Blocked', bio: 'Create is denied' },
] as UserProfile[];
export const searchUserProfiles = async (term: string) => dmPeople.filter(u => u.displayName.toLowerCase().includes(term.toLowerCase()));
export const createChatRoom = async (participants: string[]) => {
  if (participants.includes('lab-blocked')) throw new Error('Missing or insufficient permissions.');
  return 'dm_' + [...participants].sort().join('_');
};
export const fetchUserProfiles = async (uids: string[]) => uids.map(u => people[u]).filter(Boolean) as UserProfile[];
export const fetchCollabProjects = async () => [];
export const fetchUserContent = async () => [];
export const markMessageAsSeen = async () => {};
export const updateTypingStatus = async () => {};
export const uploadFile = async (_path: string, blob: Blob) => URL.createObjectURL(blob);

// Shared-content lookups for the inline embed samples.
const labAlbum: any = {
  id: 'lab-album', title: 'Sunday Anthems', artist: 'Worship Team', coverImage: '/academia/cherry.jpg',
  tracks: [
    { id: 't1', title: 'Opening Anthem', artist: 'Worship Team', url: '/audio/anthems/aus.mp3', duration: 60 },
    { id: 't2', title: 'Second Anthem', artist: 'Worship Team', url: '/audio/anthems/bra.mp3', duration: 60 },
  ],
};
export const fetchAlbumById = async (id: string) => (id === 'lab-album' ? labAlbum : null);
export const fetchProjectFromCloud = async (id: string) =>
  id === 'lab-film' ? { id, title: 'The Fall Festival', artist: 'Plajah Films', price: 4.99, coverImage: '/academia/archipelago.jpg', tracks: [] } : null;
export const fetchVideoById = async (id: string) =>
  id === 'lab-video' ? { id, title: 'Forest walk', artist: 'Sam Okafor', url: '/backdrops/forest-loop-03.mp4', thumbnailUrl: '/academia/baobab.jpg', isRello: true } : null;
