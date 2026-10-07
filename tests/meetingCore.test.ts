import test from 'node:test';
import assert from 'node:assert/strict';
import { canModerateMeeting, changeMeeting, meetingRoomFor, meetingPeerAllowed, newMeeting } from '../services/meetingCore';
const members = ['host', 'mod', 'guest'];
test('only the host can appoint moderators; regular and removed members cannot govern', () => {
  const base = newMeeting('host');
  assert.throws(() => changeMeeting(base, 'guest', members, { type: 'close-rooms' }));
  const state = changeMeeting(base, 'host', members, { type: 'moderator', uid: 'mod', enabled: true });
  assert.ok(canModerateMeeting(state, 'mod'));
  assert.throws(() => changeMeeting(state, 'mod', members, { type: 'moderator', uid: 'guest', enabled: true }));
  const removed = changeMeeting(state, 'host', members, { type: 'remove', uid: 'mod', removed: true });
  assert.throws(() => changeMeeting(removed, 'mod', members, { type: 'close-rooms' }));
});
test('room assignment and closing rooms return everyone to main without mutating the old state', () => {
  const base = newMeeting('host');
  const withRoom = changeMeeting(base, 'host', members, { type: 'create-room', id: 'breakout_a', name: ' Design ' });
  const assigned = changeMeeting(withRoom, 'host', members, { type: 'assign', uid: 'guest', roomId: 'breakout_a' });
  assert.equal(meetingRoomFor(assigned, 'guest'), 'breakout_a');
  assert.equal(meetingPeerAllowed(assigned, 'host', 'guest'), false);
  assert.equal(meetingPeerAllowed(assigned, 'host', 'mod'), true);
  assert.equal(meetingRoomFor(withRoom, 'guest'), 'main');
  assert.deepEqual(base.breakoutRooms, {});
  const closed = changeMeeting(assigned, 'host', members, { type: 'close-rooms' });
  assert.equal(meetingRoomFor(closed, 'guest'), 'main');
  assert.equal(meetingPeerAllowed(closed, 'host', 'guest'), true);
  assert.equal(closed.revision, 3);
  assert.equal(meetingRoomFor(null, 'guest'), 'main');
});
test('rejects invalid room ids, names, missing rooms, outsiders and excess rooms', () => {
  const state = newMeeting('host');
  for (const id of ['main', 'breakout_bad/path', '']) assert.throws(() => changeMeeting(state, 'host', members, { type: 'create-room', id, name: 'Test' }));
  for (const name of ['', ' ', 'a'.repeat(81)]) assert.throws(() => changeMeeting(state, 'host', members, { type: 'create-room', id: 'breakout_x', name }));
  assert.throws(() => changeMeeting(state, 'host', members, { type: 'assign', uid: 'guest', roomId: 'breakout_missing' }));
  assert.throws(() => changeMeeting(state, 'host', members, { type: 'assign', uid: 'outsider', roomId: 'main' }));
  let full = state;
  for (let i = 0; i < 12; i++) full = changeMeeting(full, 'host', members, { type: 'create-room', id: `breakout_${i}`, name: `${i}` });
  assert.throws(() => changeMeeting(full, 'host', members, { type: 'create-room', id: 'breakout_13', name: 'Extra' }));
});
test('host cannot be removed, rejoin clears removal, and mute requests remain monotonic', () => {
  const base = newMeeting('host');
  assert.throws(() => changeMeeting(base, 'host', members, { type: 'remove', uid: 'host', removed: true }));
  const removed = changeMeeting(base, 'host', members, { type: 'remove', uid: 'guest', removed: true });
  assert.deepEqual(removed.removedIds, ['guest']);
  assert.equal(meetingPeerAllowed(removed, 'host', 'guest'), false);
  assert.deepEqual(changeMeeting(removed, 'host', members, { type: 'remove', uid: 'guest', removed: false }).removedIds, []);
  const muted = changeMeeting(base, 'host', members, { type: 'mute', uid: 'guest' });
  assert.equal(changeMeeting(muted, 'host', members, { type: 'mute', uid: 'guest' }).muteRequests.guest, 2);
});
