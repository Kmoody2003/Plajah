import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diversifyByKey, interleaveNativeFirst, type UpNextItem } from '../services/musicRecommender';
import { audiusTrackToNativeAlbum, audiusStreamUrlSync } from '../services/audiusService';
import type { Album, Track } from '../types';

const makeNativeItem = (albumId: string, trackNum: number, artist: string): UpNextItem => {
  const track: Track = {
    id: `${albumId}_t${trackNum}`,
    title: `Track ${trackNum}`,
    artist,
    url: `https://example.com/${albumId}_${trackNum}.mp3`,
  };
  const album: Album = {
    id: albumId,
    ownerId: `chora_${artist.toLowerCase()}`,
    title: `Album ${albumId}`,
    artist,
    coverImage: 'https://example.com/cover.jpg',
    tracks: [track],
    type: 'MUSIC',
    createdAt: Date.now(),
    themeColor: '#FF8C00',
  };
  return { track, album, native: true, reason: 'same genre' };
};

const makeAudiusItem = (trackId: string, artistId: string, artist: string): UpNextItem => {
  const album = audiusTrackToNativeAlbum({
    id: `audius_${trackId}`,
    title: `Audius Song ${trackId}`,
    artist,
    artistId,
    url: audiusStreamUrlSync(`audius_${trackId}`),
    thumbnailUrl: 'https://audius.example/thumb.jpg',
    source: 'AUDIUS',
  });
  return { track: album.tracks[0], album, native: false, reason: 'discover on Audius' };
};

describe('Chora Native-First + Audius Discovery Recommender', () => {
  it('diversifies multi-track native albums so one album does not monopolize consecutive slots', () => {
    const raw: UpNextItem[] = [
      ...Array.from({ length: 10 }, (_, i) => makeNativeItem('alb_A', i + 1, 'Kai')),
      ...Array.from({ length: 8 }, (_, i) => makeNativeItem('alb_B', i + 1, 'Nia')),
      ...Array.from({ length: 6 }, (_, i) => makeNativeItem('alb_C', i + 1, 'Sol')),
    ];
    const diversified = diversifyByKey(raw, it => it.album.id);
    assert.equal(diversified[0].album.id, 'alb_A');
    assert.equal(diversified[1].album.id, 'alb_B');
    assert.equal(diversified[2].album.id, 'alb_C');
    assert.equal(diversified[3].album.id, 'alb_A');
  });

  it('prioritizes native Plajah Chora albums first while weaving Audius tracks and artists into the mix', () => {
    // Even with 25 native tracks (which previously pushed Audius past the 20-track limit),
    // interleaveNativeFirst guarantees native priority first AND Audius artists in the mix.
    const native = Array.from({ length: 25 }, (_, i) => makeNativeItem(`alb_${(i % 3) + 1}`, i + 1, `NativeArtist${(i % 3) + 1}`));
    const audius = [
      makeAudiusItem('a1', 'u1', 'Zeph'),
      makeAudiusItem('a2', 'u2', 'Vex'),
      makeAudiusItem('a3', 'u3', 'Aether'),
      makeAudiusItem('a4', 'u4', 'Morrow'),
      makeAudiusItem('a5', 'u5', 'Kora'),
      makeAudiusItem('a6', 'u6', 'Lumen'),
      makeAudiusItem('a7', 'u7', 'Pulse'),
    ];

    const queue = interleaveNativeFirst(native, audius, 12, 2);
    assert.equal(queue.length, 12);

    // First two tracks are ALWAYS Native Plajah Chora tracks
    assert.equal(queue[0].native, true);
    assert.equal(queue[1].native, true);

    // Every 3rd track weaves in an Audius artist track for discovery (indices 2, 5, 8, 11)
    assert.equal(queue[2].native, false);
    assert.equal(queue[3].native, true);
    assert.equal(queue[4].native, true);
    assert.equal(queue[5].native, false);

    const nativeCount = queue.filter(x => x.native).length;
    const audiusCount = queue.filter(x => !x.native).length;
    assert.equal(nativeCount, 8);
    assert.equal(audiusCount, 4);

    // Distinct Audius artists in the mix
    const audiusArtists = new Set(queue.filter(x => !x.native).map(x => x.track.artist));
    assert.equal(audiusArtists.size, 4);
  });

  it('falls back gracefully when native pool is smaller than limit by filling remaining slots with Audius', () => {
    const native = [makeNativeItem('alb_1', 1, 'Kai')];
    const audius = [
      makeAudiusItem('a1', 'u1', 'Zeph'),
      makeAudiusItem('a2', 'u2', 'Vex'),
      makeAudiusItem('a3', 'u3', 'Aether'),
    ];
    const queue = interleaveNativeFirst(native, audius, 4, 2);
    assert.equal(queue.length, 4);
    assert.equal(queue[0].native, true);
    assert.equal(queue[1].native, false);
    assert.equal(queue[2].native, false);
    assert.equal(queue[3].native, false);
  });
});
