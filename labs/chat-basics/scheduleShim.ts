// Lab-only stand-in for services/meetings/meetingSchedule: real helpers, sample meeting + waiting room.
export * from '../../services/meetings/meetingSchedule';
import type { ScheduledMeeting, PublicMeeting, LobbyEntry } from '../../services/meetings/scheduleCore';

const soon = Date.now() + 4 * 60_000;
export const LAB_MEETING: ScheduledMeeting = {
  id: 'LabMeet23Def45Ghi67Jkl', roomId: 'lab-room', title: 'Worship Team planning', startsAt: soon, durationMin: 45,
  agenda: 'Sunday set list\nVolunteer schedule\nFall festival setup', recurrence: 'weekly', guestsAllowed: true,
  createdBy: 'lab-me', createdByName: 'Kenne', createdAt: Date.now() - 86_400_000,
};
const pub = { roomId: LAB_MEETING.roomId, title: LAB_MEETING.title, startsAt: soon, durationMin: 45, hostUid: 'lab-me', hostName: 'Kenne', guestsAllowed: true };
export const listenScheduledMeeting = (_r: string, _id: string, cb: (m: ScheduledMeeting | null) => void) => { cb(LAB_MEETING); return () => {}; };
export const scheduleMeeting = async (roomId: string, input: any): Promise<ScheduledMeeting> => ({ ...LAB_MEETING, ...input, roomId });
export const cancelMeeting = async () => {};
export const getPublicMeeting = async (): Promise<PublicMeeting & { guestsAllowed: boolean }> => pub;
export const isRoomMember = async () => new URLSearchParams(location.search).get('as') === 'member';
let entryCb: ((e: LobbyEntry | null) => void) | null = null;
export const requestEntry = async (_id: string, name: string) => {
  // Let the guest in after a moment, as a member would.
  setTimeout(() => entryCb?.({ uid: 'guest', name, status: new URLSearchParams(location.search).get('deny') ? 'DENIED' : 'WAITING', requestedAt: Date.now() }), 50);
};
export const listenMyEntry = (_id: string, cb: (e: LobbyEntry | null) => void) => { entryCb = cb; return () => { entryCb = null; }; };
export const listenLobby = (_id: string, cb: (e: LobbyEntry[]) => void) => { cb([{ uid: 'g1', name: 'Pat Lee', status: 'WAITING', requestedAt: Date.now() }]); return () => {}; };
export const leaveLobby = async () => {};
