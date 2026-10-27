import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseChannelShareParams } from '../../../src/lib/launchTarget';
import { buildChannelQrUrl } from '../channelQrService';
import { findSharedChannel, type ChannelIdentity } from '../channelSharing';
import { buildShareUrl } from '../../deepLinkService';

describe('TV Channel Share & Direct Launch', () => {
  const sampleLineup: ChannelIdentity[] = [
    { id: 'plajah_endless-hour', number: '8.1', plajahId: 'endless-hour' },
    { id: 'sci_nasa_iss', number: '9.1' },
    { id: 'fast_creator_1', number: '21.1', ownerId: 'creator_1', scheduleOwner: 'creator_1' },
    { id: 'live_feed_abc', number: '21.2', ownerId: 'creator_1' },
    { id: 'fast_unnumbered', number: '—', ownerId: 'creator_2', scheduleOwner: 'creator_2' },
  ];

  it('parses buildChannelQrUrl links for numbered creator FAST channels and resolves the exact channel', () => {
    const url = buildChannelQrUrl({
      number: '21.1',
      id: 'fast_creator_1',
      ownerId: 'creator_1',
      scheduleOwner: 'creator_1',
    });
    const parsedUrl = new URL(url);
    const focus = parseChannelShareParams(parsedUrl.search, parsedUrl.pathname);

    assert.deepEqual(focus, {
      number: '21.1',
      ownerId: 'creator_1',
      sourceId: 'fast_creator_1',
      plajahId: undefined,
    });
    assert.equal(findSharedChannel(sampleLineup, focus!), 2);
  });

  it('parses buildChannelQrUrl links for unnumbered creator channels (includes type=channel)', () => {
    const url = buildChannelQrUrl({
      number: '—',
      id: 'fast_unnumbered',
      ownerId: 'creator_2',
    });
    const parsedUrl = new URL(url);
    assert.equal(parsedUrl.searchParams.get('type'), 'channel');

    const focus = parseChannelShareParams(parsedUrl.search, parsedUrl.pathname);
    assert.deepEqual(focus, {
      number: undefined,
      ownerId: 'creator_2',
      sourceId: 'fast_unnumbered',
      plajahId: undefined,
    });
    assert.equal(findSharedChannel(sampleLineup, focus!), 4);
  });

  it('parses buildChannelQrUrl links for first-party Plajah channels (e.g. 8.1 Endless Hour)', () => {
    const url = buildChannelQrUrl({
      number: '8.1',
      id: 'plajah_endless-hour',
      plajahId: 'endless-hour',
    });
    const parsedUrl = new URL(url);
    const focus = parseChannelShareParams(parsedUrl.search, parsedUrl.pathname);

    assert.deepEqual(focus, {
      number: '8.1',
      ownerId: undefined,
      sourceId: undefined,
      plajahId: 'endless-hour',
    });
    assert.equal(findSharedChannel(sampleLineup, focus!), 0);
  });

  it('parses /share?type=channel links from buildShareUrl (context menu & social shares)', () => {
    const shareUrl = buildShareUrl('channel', 'owner:creator_1', {
      source: 'live_feed_abc',
      n: '21.2',
      channel: '21.2',
    });
    const parsedUrl = new URL(shareUrl);
    const focus = parseChannelShareParams(parsedUrl.search, parsedUrl.pathname);

    assert.deepEqual(focus, {
      number: '21.2',
      ownerId: 'creator_1',
      sourceId: 'live_feed_abc',
      plajahId: undefined,
    });
    assert.equal(findSharedChannel(sampleLineup, focus!), 3);
  });

  it('parses shorthand ?channel=<num>, ?ch=<num>, and /channel/<num> paths', () => {
    assert.deepEqual(parseChannelShareParams('?channel=9.1', '/'), {
      number: '9.1',
      ownerId: undefined,
      sourceId: undefined,
      plajahId: undefined,
    });
    assert.deepEqual(parseChannelShareParams('?ch=21.1', '/'), {
      number: '21.1',
      ownerId: undefined,
      sourceId: undefined,
      plajahId: undefined,
    });
    assert.deepEqual(parseChannelShareParams('', '/channel/21.2'), {
      number: '21.2',
      ownerId: undefined,
      sourceId: undefined,
      plajahId: undefined,
    });
    assert.equal(findSharedChannel(sampleLineup, parseChannelShareParams('', '/channel/21.2')!), 3);
  });

  it('returns null for non-channel URLs so normal routes are unaffected', () => {
    assert.equal(parseChannelShareParams('', '/'), null);
    assert.equal(parseChannelShareParams('?type=album&id=alb_123', '/share'), null);
    assert.equal(parseChannelShareParams('?view=chora', '/'), null);
  });
});
