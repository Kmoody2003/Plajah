import test from 'node:test';
import assert from 'node:assert/strict';
import { applyListen, mergeEntries, recentAlbums, recentPlaylists, recentMixes, recentArtists, mostPlayedTracks, recentLocker, type ListenEntry } from '../services/listenHistoryService';

const mk = (o: Partial<ListenEntry>): Omit<ListenEntry, 'playCount'> => ({
  trackId: 't', albumId: 'a', title: '', artist: '', artistId: 'u', albumTitle: '', cover: '', subType: '', isLocker: false, lastPlayedAt: 1, ...o,
});

test('applyListen dedupes, counts, caps', () => {
  let l: ListenEntry[] = [];
  l = applyListen(l, mk({ trackId: '1', lastPlayedAt: 1 }));
  l = applyListen(l, mk({ trackId: '2', lastPlayedAt: 2 }));
  l = applyListen(l, mk({ trackId: '1', lastPlayedAt: 3 }));
  assert.equal(l.length, 2);
  assert.equal(l[0].trackId, '1');
  assert.equal(l[0].playCount, 2);
  assert.equal(applyListen(l, mk({ trackId: '9' }), 2).length, 2);
});

test('derivations', () => {
  let l: ListenEntry[] = [];
  l = applyListen(l, mk({ trackId: '1', albumId: 'A', artistId: 'x', lastPlayedAt: 1 }));
  l = applyListen(l, mk({ trackId: '2', albumId: 'A', artistId: 'x', lastPlayedAt: 2 }));
  l = applyListen(l, mk({ trackId: '3', albumId: 'P', subType: 'PLAYLIST', artistId: 'y', lastPlayedAt: 3 }));
  l = applyListen(l, mk({ trackId: '4', albumId: 'M', subType: 'MIX', artistId: 'z', lastPlayedAt: 4 }));
  l = applyListen(l, mk({ trackId: '5', albumId: 'L', isLocker: true, artistId: 'q', lastPlayedAt: 5 }));
  l = applyListen(l, mk({ trackId: '1', albumId: 'A', artistId: 'x', lastPlayedAt: 6 }));
  assert.deepEqual(recentAlbums(l).map(e => e.albumId), ['A']);
  assert.deepEqual(recentPlaylists(l).map(e => e.albumId), ['P']);
  assert.deepEqual(recentMixes(l).map(e => e.albumId), ['M']);
  assert.deepEqual(recentLocker(l).map(e => e.trackId), ['5']);
  assert.deepEqual(recentArtists(l).map(e => e.artistId), ['x', 'z', 'y']);
  assert.deepEqual(mostPlayedTracks(l).map(e => e.trackId), ['1']);
});

test('mergeEntries keeps newest and max count', () => {
  const a = applyListen([], mk({ trackId: '1', lastPlayedAt: 1 }));
  const b = [{ ...mk({ trackId: '1', lastPlayedAt: 5 }), playCount: 4 }, { ...mk({ trackId: '2', lastPlayedAt: 2 }), playCount: 1 }];
  const m = mergeEntries(a, b);
  assert.equal(m[0].trackId, '1'); assert.equal(m[0].playCount, 4); assert.equal(m.length, 2);
});
