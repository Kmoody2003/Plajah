/** Shared meeting state, independent of any particular chat or classroom UI. */
export interface MeetingControl {
  hostId: string;
  moderatorIds: string[];
  breakoutRooms: Record<string, string>;
  assignments: Record<string, string>;
  removedIds: string[];
  muteRequests: Record<string, number>;
  revision: number;
}
export const newMeeting = (hostId: string): MeetingControl => ({ hostId, moderatorIds: [], breakoutRooms: {}, assignments: {}, removedIds: [], muteRequests: {}, revision: 0 });
export const canModerateMeeting = (state: MeetingControl, uid: string) => !state.removedIds.includes(uid) && (state.hostId === uid || state.moderatorIds.includes(uid));
export function meetingRoomFor(state: MeetingControl | null, uid: string): string {
  const assigned = state?.assignments[uid];
  return assigned && state?.breakoutRooms[assigned] ? assigned : 'main';
}
export function meetingPeerAllowed(state: MeetingControl | null, selfId: string, peerId: string): boolean {
  return !state?.removedIds.includes(selfId) && !state?.removedIds.includes(peerId) && meetingRoomFor(state, selfId) === meetingRoomFor(state, peerId);
}
export type MeetingAction =
  | { type: 'create-room'; id: string; name: string }
  | { type: 'close-rooms' }
  | { type: 'assign'; uid: string; roomId: string }
  | { type: 'moderator'; uid: string; enabled: boolean }
  | { type: 'remove'; uid: string; removed: boolean }
  | { type: 'mute'; uid: string };
export function changeMeeting(state: MeetingControl, actor: string, members: string[], action: MeetingAction): MeetingControl {
  if (!members.includes(actor) || state.removedIds.includes(actor) || !canModerateMeeting(state, actor)) throw new Error('Only meeting hosts and moderators can change the meeting.');
  const next: MeetingControl = { ...state, moderatorIds: [...state.moderatorIds], breakoutRooms: { ...state.breakoutRooms }, assignments: { ...state.assignments }, removedIds: [...state.removedIds], muteRequests: { ...state.muteRequests }, revision: state.revision + 1 };
  if ('uid' in action && !members.includes(action.uid)) throw new Error('Choose a member of this conversation.');
  switch (action.type) {
    case 'create-room':
      if (!/^breakout_[a-zA-Z0-9_-]{1,80}$/.test(action.id) || !action.name.trim() || action.name.trim().length > 80 || Object.keys(next.breakoutRooms).length >= 12) throw new Error('Use a room name up to 80 characters, with at most 12 breakout rooms.');
      next.breakoutRooms[action.id] = action.name.trim(); break;
    case 'close-rooms': next.breakoutRooms = {}; next.assignments = {}; break;
    case 'assign':
      if (action.roomId !== 'main' && !next.breakoutRooms[action.roomId]) throw new Error('That breakout room is closed.');
      next.assignments[action.uid] = action.roomId; break;
    case 'moderator':
      if (actor !== state.hostId || action.uid === state.hostId) throw new Error('Only the host can appoint moderators.');
      next.moderatorIds = next.moderatorIds.filter(id => id !== action.uid);
      if (action.enabled) next.moderatorIds.push(action.uid); break;
    case 'remove':
      if (action.uid === state.hostId || action.uid === actor) throw new Error('The host and acting moderator cannot be removed.');
      next.removedIds = next.removedIds.filter(id => id !== action.uid);
      if (action.removed) next.removedIds.push(action.uid); break;
    case 'mute': next.muteRequests[action.uid] = (next.muteRequests[action.uid] || 0) + 1; break;
  }
  return next;
}
