// Album Arranger ⇄ Chora playlist running-order merge. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrangementToPlaylistOrder, playlistToArrangementOrder, reconcileOrder,
} from '../services/melosChoraOrder';

// s1..s4 have rendered audio (t1..t4); sX has none and is never on the playlist.
const map = { s1: 't1', s2: 't2', s3: 't3', s4: 't4' };
const songs = ['s1', 'sX', 's2', 's3', 's4'];
const base = ['t1', 't2', 't3', 't4'];

test('in sync → nothing to do', () => {
  const r = reconcileOrder({ songIds: songs, trackMap: map, playlistTrackIds: base, base, newer: 'playlist' });
  assert.equal(r.action, 'none');
});

test('reorder in Chora pulls into the arranger; song with no audio keeps its slot', () => {
  const pl = ['t4', 't3', 't2', 't1'];
  const r = reconcileOrder({ songIds: songs, trackMap: map, playlistTrackIds: pl, base, newer: 'arrangement' });
  assert.equal(r.action, 'pull');
  assert.deepEqual(r.songIds, ['s4', 'sX', 's3', 's2', 's1']);
});

test('reorder in the arranger pushes to Chora; hand-added playlist tracks stay put', () => {
  const pl = ['t1', 'tForeign', 't2', 't3', 't4'];
  const arr = ['s2', 'sX', 's1', 's4', 's3'];
  const r = reconcileOrder({ songIds: arr, trackMap: map, playlistTrackIds: pl, base: pl, newer: 'playlist' });
  assert.equal(r.action, 'push');
  assert.deepEqual(r.playlistTrackIds, ['t2', 'tForeign', 't1', 't4', 't3']);
});

test('both moved → the newer edit wins', () => {
  const pl = ['t2', 't1', 't3', 't4'];
  const arr = ['s1', 'sX', 's2', 's4', 's3'];
  const a = reconcileOrder({ songIds: arr, trackMap: map, playlistTrackIds: pl, base, newer: 'arrangement' });
  assert.equal(a.action, 'push');
  assert.deepEqual(a.playlistTrackIds, ['t1', 't2', 't4', 't3']);
  const p = reconcileOrder({ songIds: arr, trackMap: map, playlistTrackIds: pl, base, newer: 'playlist' });
  assert.equal(p.action, 'pull');
  assert.deepEqual(p.songIds, ['s2', 'sX', 's1', 's3', 's4']);
});

test('song added to the arranger is appended to the playlist', () => {
  const m = { ...map, s5: 't5' };
  const r = reconcileOrder({ songIds: [...songs, 's5'], trackMap: m, playlistTrackIds: base, base, newer: 'playlist' });
  assert.equal(r.action, 'push');
  assert.deepEqual(r.playlistTrackIds, ['t1', 't2', 't3', 't4', 't5']);
});

test('song removed in either place leaves the other', () => {
  assert.deepEqual(arrangementToPlaylistOrder(['s1', 'sX', 's3', 's4'], map, base), ['t1', 't3', 't4']);
  assert.deepEqual(playlistToArrangementOrder(songs, map, ['t1', 't3', 't4']), ['s1', 'sX', 's3', 's4']);
});

test('both sides agree after a pull and after a push (no ping-pong)', () => {
  const pl = ['t3', 't1', 't4', 't2'];
  const pulled = reconcileOrder({ songIds: songs, trackMap: map, playlistTrackIds: pl, base, newer: 'arrangement' });
  const again = reconcileOrder({ songIds: pulled.songIds, trackMap: map, playlistTrackIds: pl, base: pl, newer: 'arrangement' });
  assert.equal(again.action, 'none');
});
