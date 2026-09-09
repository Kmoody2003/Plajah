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
