import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_TALK_MAX_PARTICIPANTS, LIVE_TALK_MAX_SPEAKERS, HOST_STALE_MS, MEMBER_STALE_MS,
  toMillis, isTalkAlive, isHostStale, isModerator, joinBlocker, capacityLabel, headcount, talkCapacityLabel,
  canSetRole, sortMembers, isMemberStale, deriveDenorm, denormEqual, takeoverCandidate, allowedPeerIds,
  talkPhase, sanitizeChat, coalesceReactions, formatElapsed, type TalkMember, type TalkDocLike,
} from '../services/liveTalk/liveTalkCore';
import { normalizeIceResponse } from '../routes/rtcIce';

const NOW = 1_800_000_000_000;
const ts = (ms: number) => ({ toMillis: () => ms });
const talk = (over: Partial<TalkDocLike> = {}): TalkDocLike => ({ hostId: 'h', isActive: true, timestamp: NOW - 5_000, lastHeartbeat: ts(NOW - 1_000), ...over });
const m = (uid: string, role: TalkMember['role'], over: Partial<TalkMember> = {}): TalkMember => ({ uid, role, name: uid, lastSeen: ts(NOW - 1_000), joinedAt: ts(NOW - 10_000), ...over });

test('toMillis handles numbers, Timestamps, {seconds}, null', () => {
  assert.equal(toMillis(5), 5);
  assert.equal(toMillis(ts(7)), 7);
  assert.equal(toMillis({ seconds: 2, nanoseconds: 5_000_000 }), 2005);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis('x'), null);
});

test('isTalkAlive: heartbeat within 60s, legacy only when fresh', () => {
  assert.equal(isTalkAlive(talk(), NOW), true);
  assert.equal(isTalkAlive(talk({ lastHeartbeat: ts(NOW - HOST_STALE_MS - 1) }), NOW), false);
  assert.equal(isTalkAlive(talk({ isActive: false }), NOW), false);
  // legacy (no heartbeat) — fresh creation trusted, old zombie hidden
  assert.equal(isTalkAlive(talk({ lastHeartbeat: undefined, timestamp: NOW - 60_000 }), NOW), true);
  assert.equal(isTalkAlive(talk({ lastHeartbeat: undefined, timestamp: NOW - 3_600_000 }), NOW), false);
  // pending serverTimestamp on host's own client (null) → falls back to creation time
  assert.equal(isTalkAlive(talk({ lastHeartbeat: null }), NOW), true);
});

test('isHostStale', () => {
  assert.equal(isHostStale(talk(), NOW), false);
  assert.equal(isHostStale(talk({ lastHeartbeat: ts(NOW - 61_000) }), NOW), true);
  assert.equal(isHostStale(talk({ lastHeartbeat: undefined, timestamp: NOW - 120_000 }), NOW), true);
});

test('joinBlocker: ended, signin, kicked, blocked, full (20 cap), host + rejoin bypass the cap', () => {
  assert.equal(joinBlocker(null, 'u'), 'ended');
  assert.equal(joinBlocker(talk({ isActive: false }), 'u'), 'ended');
  assert.equal(joinBlocker(talk(), null), 'signin');
  assert.equal(joinBlocker(talk({ kicked: ['u'] }), 'u'), 'kicked');
  assert.equal(joinBlocker(talk(), 'u', { blocked: true }), 'blocked');
  assert.equal(joinBlocker(talk({ memberCount: LIVE_TALK_MAX_PARTICIPANTS - 1 }), 'u'), null);
  assert.equal(joinBlocker(talk({ memberCount: LIVE_TALK_MAX_PARTICIPANTS }), 'u'), 'full');
  assert.equal(joinBlocker(talk({ memberCount: LIVE_TALK_MAX_PARTICIPANTS }), 'h'), null);
  assert.equal(joinBlocker(talk({ memberCount: LIVE_TALK_MAX_PARTICIPANTS }), 'u', { alreadyMember: true }), null);
});

test('capacity labels', () => {
  assert.equal(LIVE_TALK_MAX_PARTICIPANTS, 20);
  assert.equal(capacityLabel(12), '12/20');
  assert.equal(headcount({ memberCount: 3, listeners: [1, 2, 3, 4] }), 3);
  assert.equal(headcount({ listeners: ['a', 'b'], speakers: [{}] }), 3);
  assert.equal(talkCapacityLabel(null), '0/20');
});

test('moderation permissions mirror the rules', () => {
  const t = talk({ cohostUids: ['c'] });
  assert.equal(isModerator(t, 'h'), true);
  assert.equal(isModerator(t, 'c'), true);
  assert.equal(isModerator(t, 'x'), false);
  // listener cannot change anyone
  assert.equal(canSetRole(t, 'x', m('l', 'listener'), 'speaker', 1), false);
  // co-host can promote listeners and demote speakers, but not touch co-hosts or the host
  assert.equal(canSetRole(t, 'c', m('l', 'listener'), 'speaker', 2), true);
  assert.equal(canSetRole(t, 'c', m('s', 'speaker'), 'listener', 2), true);
  assert.equal(canSetRole(t, 'c', m('l', 'listener'), 'cohost', 2), false);
  assert.equal(canSetRole(t, 'c', m('c2', 'cohost'), 'listener', 2), false);
  assert.equal(canSetRole(t, 'c', m('h', 'host'), 'listener', 2), false);
  // host can make co-hosts; nobody can mint a second host
  assert.equal(canSetRole(t, 'h', m('l', 'listener'), 'cohost', 2), true);
  assert.equal(canSetRole(t, 'h', m('l', 'listener'), 'host', 2), false);
  // speaker cap
  assert.equal(canSetRole(t, 'h', m('l', 'listener'), 'speaker', LIVE_TALK_MAX_SPEAKERS), false);
  assert.equal(canSetRole(t, 'h', m('s', 'speaker'), 'cohost', LIVE_TALK_MAX_SPEAKERS), true);
});

test('sortMembers: host, cohost, speaker, listener then join time', () => {
  const out = sortMembers([m('l1', 'listener'), m('s', 'speaker'), m('h', 'host'), m('c', 'cohost'),
    m('l0', 'listener', { joinedAt: ts(NOW - 99_000) })]).map(x => x.uid);
  assert.deepEqual(out, ['h', 'c', 's', 'l0', 'l1']);
});

test('deriveDenorm builds roster, drops stale members, keeps host on stage, caps stage', () => {
  const members = [
    m('h', 'host'), m('c', 'cohost'), m('s', 'speaker', { selfMuted: true }), m('l', 'listener', { handRaised: true }),
    m('ghost', 'listener', { lastSeen: ts(NOW - MEMBER_STALE_MS - 1) }),
  ];
  const d = deriveDenorm(members, 'h', NOW);
  assert.deepEqual(d.speakerUids, ['h', 'c', 's']);
  assert.deepEqual(d.listeners, ['l']);
  assert.deepEqual(d.cohostUids, ['c']);
  assert.equal(d.memberCount, 4);
  assert.equal(d.raisedHandCount, 1);
  assert.equal(d.speakers.find(x => x.uid === 's')!.isMuted, true);
  // host missing from members still listed on stage
  assert.deepEqual(deriveDenorm([m('l', 'listener')], 'h', NOW).speakerUids, ['h']);
  // cap
  const many = Array.from({ length: 14 }, (_, i) => m(`s${i}`, 'speaker'));
  assert.equal(deriveDenorm([m('h', 'host'), ...many], 'h', NOW).speakerUids.length, LIVE_TALK_MAX_SPEAKERS);
  assert.equal(denormEqual(d, d), true);
  assert.equal(denormEqual({ ...d, memberCount: 9 }, d), false);
  assert.equal(denormEqual(null, d), false);
});

test('isMemberStale tolerates pending writes', () => {
  assert.equal(isMemberStale(m('a', 'listener', { lastSeen: null, joinedAt: null }), NOW), false);
  assert.equal(isMemberStale(m('a', 'listener', { lastSeen: ts(NOW - MEMBER_STALE_MS - 5) }), NOW), true);
});

test('takeoverCandidate: first fresh co-host, only when host is stale', () => {
  const members = [m('c1', 'cohost', { lastSeen: ts(NOW - MEMBER_STALE_MS - 1) }), m('c2', 'cohost')];
  assert.equal(takeoverCandidate(talk({ cohostUids: ['c1', 'c2'] }), members, NOW), null); // host fresh
  const dead = talk({ cohostUids: ['c1', 'c2'], lastHeartbeat: ts(NOW - 70_000) });
  assert.equal(takeoverCandidate(dead, members, NOW), 'c2');
  assert.equal(takeoverCandidate({ ...dead, cohostUids: [] }, members, NOW), null);
});

test('allowedPeerIds: listeners hear the stage only; stage serves all members', () => {
  assert.deepEqual(allowedPeerIds('l', false, ['h', 's'], ['h', 's', 'l', 'x']), ['h', 's']);
  assert.deepEqual(allowedPeerIds('s', true, ['h', 's'], ['h', 's', 'l']), ['h', 'l']);
});

test('talkPhase gives one clear state', () => {
  const base = { ended: false, signedIn: true, memberJoined: true, peerStates: [] as string[], expectedPeers: 1 };
  assert.equal(talkPhase({ ...base, ended: true }), 'ended');
  assert.equal(talkPhase({ ...base, signedIn: false }), 'signin');
  assert.equal(talkPhase({ ...base, full: true }), 'full');
  assert.equal(talkPhase({ ...base, memberJoined: false }), 'joining');
  assert.equal(talkPhase(base), 'connecting');
  assert.equal(talkPhase({ ...base, peerStates: ['connecting', 'connected'] }), 'live');
  assert.equal(talkPhase({ ...base, peerStates: ['disconnected'] }), 'reconnecting');
  assert.equal(talkPhase({ ...base, peerStates: ['failed', 'connected'] }), 'live');
  assert.equal(talkPhase({ ...base, expectedPeers: 0 }), 'live');
});

test('chat + reactions helpers', () => {
  assert.equal(sanitizeChat('  hi \n there  '), 'hi there');
  assert.equal(sanitizeChat('x'.repeat(900)).length, 500);
  assert.deepEqual(coalesceReactions(['🔥', '🔥', '❤️', '', '🔥']), [{ emoji: '🔥', count: 3 }, { emoji: '❤️', count: 1 }]);
  assert.equal(coalesceReactions(Array(50).fill('👏'))[0].count, 30);
  assert.equal(formatElapsed(65_000), '1:05');
  assert.equal(formatElapsed(3_725_000), '1:02:05');
});

test('normalizeIceResponse accepts Cloudflare object, array and Metered shapes', () => {
  assert.deepEqual(normalizeIceResponse({ iceServers: { urls: ['turn:a'], username: 'u', credential: 'p' } }),
    [{ urls: ['turn:a'], username: 'u', credential: 'p' }]);
  assert.deepEqual(normalizeIceResponse({ iceServers: [{ urls: 'stun:x' }, { urls: ['turn:y'], username: 'u', credential: 'c' }] }).length, 2);
  assert.deepEqual(normalizeIceResponse([{ urls: 'turn:m', username: 'u', credential: 'c' }, { bogus: 1 }]),
    [{ urls: 'turn:m', username: 'u', credential: 'c' }]);
  assert.deepEqual(normalizeIceResponse(null), []);
});
