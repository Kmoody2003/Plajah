import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageChannel, findSharedChannel } from '../services/fast/channelSharing';
import { isChannelFeed } from '../services/fast/guideLineup';
import { buildShareUrl } from '../services/deepLinkService';

const channels = [
  { id: 'live_a', number: '2.1', ownerId: 'a' },
  { id: 'fast_a', number: '2.2', ownerId: 'a', scheduleOwner: 'a' },
  { id: 'plajah_endless-hour', number: '8.1', plajahId: 'endless-hour' },
];
test('signed-out visitors cannot enter channel management, including ownerless channels', () => {
  for (const c of channels) {
    assert.equal(canManageChannel(c, null), false);
    assert.equal(canManageChannel(c, undefined), false);
  }
  assert.equal(canManageChannel(channels[0], { uid: 'a' }), true);
  assert.equal(canManageChannel(channels[0], { uid: 'b' }), false);
});
test('legacy owner links respect the shared subchannel number', () => {
  assert.equal(findSharedChannel(channels, { ownerId: 'a', number: '2.2' }), 1);
  assert.equal(findSharedChannel(channels, { ownerId: 'missing', number: '2.2' }), -1);
});
test('source identity survives renumbering and waits for delayed channel data', () => {
  assert.equal(findSharedChannel(channels, { sourceId: 'fast_a', number: '2.1' }), 1);
  assert.equal(findSharedChannel(channels.slice(2), { sourceId: 'fast_a', number: '8.1' }), -1);
});
test('share URLs round-trip the exact source', () => {
  (globalThis as any).window = { location: { origin: 'https://plajah.test' } };
  const url = new URL(buildShareUrl('channel', 'owner:a', { n: '2.2', source: 'fast_a' }));
  assert.equal(url.searchParams.get('source'), 'fast_a');
  assert.equal(url.searchParams.get('id'), 'owner:a');
});
test('permanent external channels do not expire with browser sessions', () => {
  assert.equal(isChannelFeed({ url: 'https://example.test/live.m3u8', timestamp: 1 }), true);
  assert.equal(isChannelFeed({ url: 'https://example.test/live.m3u8', status: 'ENDED' }), false);
  assert.equal(isChannelFeed({ url: '/?stream=a', streamSource: 'webrtc', asChannel: true, timestamp: 1 }), false);
});

test('channels 3 through 9 remain eligible even when their publication dates are old', () => {
  const feeds = Array.from({ length: 7 }, (_, i) => ({
    id: `channel-${i + 3}`, channelNumber: i + 3,
    url: `https://example.test/${i + 3}/live.m3u8`, timestamp: 1,
  }));
  assert.deepEqual(feeds.filter(isChannelFeed).map(f => f.channelNumber), [3, 4, 5, 6, 7, 8, 9]);
});

test('Great Faith Church station tunes accurately by channel number, owner ID, or source ID', () => {
  const fullLineup = [
    { id: 'plajah_endless-hour', number: '8.1', plajahId: 'endless-hour', name: 'The Endless Hour' },
    { id: 'fast_great_faith', number: '42.1', ownerId: 'user_gf', scheduleOwner: 'user_gf', name: 'Great Faith Church' },
    { id: 'fast_other', number: '50.1', ownerId: 'user_other', scheduleOwner: 'user_other', name: 'Other Station' },
  ];

  // 1. Direct channel number match
  assert.equal(findSharedChannel(fullLineup, { number: '42.1' }), 1);

  // 2. Direct channel number with source ID and owner ID from QR scan
  assert.equal(findSharedChannel(fullLineup, { number: '42.1', ownerId: 'user_gf', sourceId: 'fast_great_faith' }), 1);

  // 3. Fallback when source ID changed (e.g. live feed changed to fast channel)
  assert.equal(findSharedChannel(fullLineup, { number: '42.1', ownerId: 'user_gf', sourceId: 'live_temporary_feed' }), 1);

  // 4. Major number fallback (e.g. dial 42 matching 42.1)
  assert.equal(findSharedChannel(fullLineup, { number: '42' }), 1);

  // 5. When lineup only has provisional Channel 8.1, scanning Great Faith 42.1 must NOT falsely tune 8.1
  const provisional = fullLineup.slice(0, 1);
  assert.equal(findSharedChannel(provisional, { number: '42.1', ownerId: 'user_gf', sourceId: 'fast_great_faith' }), -1);
});

