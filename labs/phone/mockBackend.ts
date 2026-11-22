// labs/phone/mockBackend.ts — the bits of services/backendService usePhoneBook needs, with two
// fake Plajah friends: Andre (also in the phone book, matched by email) and Kiara (Plajah only).
const me = { uid: 'me', displayName: 'Kenne' };
export const auth = { currentUser: me };

const rooms = [
  { id: 'dm_andre', type: 'PRIVATE', participants: ['me', 'andre'], name: '', updatedAt: Date.now() },
  { id: 'dm_kiara', type: 'PRIVATE', participants: ['me', 'kiara'], name: '', updatedAt: Date.now() - 3600_000 },
];
const profiles: Record<string, any> = {
  andre: { uid: 'andre', displayName: 'Andre M.', username: 'dre313', email: 'andre@example.com' },
  kiara: { uid: 'kiara', displayName: 'Kiara Stone', username: 'kiarasings' },
};

export const listenToChatRooms = (cb: (r: any[]) => void) => { setTimeout(() => cb(rooms), 10); return () => {}; };
export const fetchUserProfiles = async (uids: string[]) => uids.map(u => profiles[u]).filter(Boolean);
export const createChatRoom = async (participants: string[]) => `dm_${participants.join('_')}`;
