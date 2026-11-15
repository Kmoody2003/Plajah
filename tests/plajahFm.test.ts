import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStationAlbum, stationAlbumId, nextInRotation, getSatellitePosition } from '../services/radioEngine';
import { todaysLineup, blockHoursLabel } from '../services/onair/station';

test('station albums: Plajah FM and artist stations are stations, playlists are not', () => {
  assert.equal(stationAlbumId(), 'radio_station');
  assert.equal(stationAlbumId('u1'), 'artist_radio_u1');
  assert.ok(isStationAlbum({ id: 'radio_station' }));
  assert.ok(isStationAlbum({ id: 'artist_radio_u1' }));
  assert.ok(!isStationAlbum({ id: 'exclusive_t1' }));
  assert.ok(!isStationAlbum({ id: 'album123' }));
  assert.ok(!isStationAlbum(null));
});

test('rotation advances and wraps like a 24/7 broadcast', () => {
  const r = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(nextInRotation(r, 'a')?.id, 'b');
  assert.equal(nextInRotation(r, 'c')?.id, 'a');      // end of rotation → back to the top, never stops
  assert.equal(nextInRotation(r, 'zzz')?.id, 'a');    // unknown → top
  assert.equal(nextInRotation([{ id: 'solo' }], 'solo')?.id, 'solo');
  assert.equal(nextInRotation([], 'a'), null);
});

test('satellite position stays inside the rotation', () => {
  const r = [{ id: 'a', duration: 200 }, { id: 'b', duration: 100 }] as any;
  const p = getSatellitePosition(r);
  assert.ok(p.trackIndex >= 0 && p.trackIndex < 2);
  assert.ok(p.offsetSeconds >= 0 && p.offsetSeconds < r[p.trackIndex].duration);
});

test('lineup: covers the whole station day, exactly one block on air', () => {
  // A Monday 9am ET → Mari's Wake-Up Call (6–10) is on.
  const mon9 = Date.parse('2026-11-16T14:00:00Z');
  const day = todaysLineup(mon9);
  assert.equal(day[0].start, 0);
  assert.equal(day[day.length - 1].end, 24);
  for (let i = 1; i < day.length; i++) assert.equal(day[i].start, day[i - 1].end);
  const on = day.filter(b => b.onAir);
  assert.equal(on.length, 1);
  assert.equal(on[0].host?.id, 'mari');
  assert.equal(blockHoursLabel(on[0]), '6am–10am');
});

// ── Station clock: real lengths, rotation, tune-in ─────────────────────────────────────────────────
import { buildRotation, tuneInPoint, stationLength, getSatellitePositionAt, FALLBACK_SONG_SEC } from '../services/radioEngine';
import { wavDuration, mp3Duration, id3v2Size, probeDuration } from '../services/onair/audioDuration';
import { createOnAirRouter, isStationMediaUrl } from '../routes/onair';
import express from 'express';

const T = (id: string, albumId: string, extra: any = {}) => ({ id, albumId, title: id, artist: 'A', url: `https://firebasestorage.googleapis.com/${id}.mp3`, ...extra }) as any;

test('lengths: real seconds win, ms are converted, missing falls back', () => {
  assert.equal(stationLength({ duration: 245 }), 245);
  assert.equal(stationLength({ duration: 245_000 }), 245);
  assert.equal(stationLength({}), FALLBACK_SONG_SEC);
  assert.equal(stationLength({ duration: '3:45' }), FALLBACK_SONG_SEC);
});

test('rotation: same for everyone, albums spread out, empty files and duplicates dropped', () => {
  const songs = [
    ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map(id => T(id, 'A')),
    ...['b1', 'b2', 'b3'].map(id => T(id, 'B')),
    ...['c1', 'c2'].map(id => T(id, 'C')),
    T('a1', 'A'),                                      // duplicate id
    T('dupfile', 'C', { url: 'https://firebasestorage.googleapis.com/c1.mp3?token=x' }), // same file as c1
    T('empty', 'B'),
  ];
  const lengths = { a1: 200, empty: 0 };
  const r1 = buildRotation(songs, lengths, '2026-11-14');
  const r2 = buildRotation([...songs].reverse(), lengths, '2026-11-14');
  assert.deepEqual(r1.map(t => t.id), r2.map(t => t.id), 'Firestore order must not change the rotation');
  assert.equal(r1.length, 11);
  assert.ok(!r1.some(t => t.id === 'empty' || t.id === 'dupfile'));
  assert.equal(r1.find(t => t.id === 'a1')!.duration, 200);
  // Never more than 2 songs from one album back to back (6 of 11 are album A).
  let run = 1, worst = 1;
  for (let i = 1; i < r1.length; i++) { run = r1[i].albumId === r1[i - 1].albumId ? run + 1 : 1; worst = Math.max(worst, run); }
  assert.ok(worst <= 2, `album run of ${worst}`);
  assert.notDeepEqual(buildRotation(songs, lengths, '2026-11-15').map(t => t.id), r1.map(t => t.id), 'reshuffles daily');
});

test('tune-in: lands on the live song, but never in its last 20 seconds', () => {
  const r = [T('x', 'A', { duration: 100 }), T('y', 'A', { duration: 100 })];
  const day = Date.parse('2026-11-14T00:00:00Z');
  assert.deepEqual(getSatellitePositionAt(r, day + 50_000), { trackIndex: 0, offsetSeconds: 50 });
  assert.deepEqual(tuneInPoint(r, day + 50_000), { trackIndex: 0, offsetSeconds: 50 });
  assert.deepEqual(tuneInPoint(r, day + 90_000), { trackIndex: 1, offsetSeconds: 0 });
  assert.deepEqual(tuneInPoint(r, day + 195_000), { trackIndex: 0, offsetSeconds: 0 }); // wraps
});

function wav(seconds: number, byteRate = 176_400): Uint8Array {
  const b = new Uint8Array(44); const dv = new DataView(b.buffer);
  b.set([...'RIFF'].map(c => c.charCodeAt(0)), 0); b.set([...'WAVE'].map(c => c.charCodeAt(0)), 8);
  b.set([...'fmt '].map(c => c.charCodeAt(0)), 12); dv.setUint32(16, 16, true); dv.setUint32(28, byteRate, true);
  b.set([...'data'].map(c => c.charCodeAt(0)), 36); dv.setUint32(40, seconds * byteRate, true);
  return b;
}

test('header reader: WAV exact, MP3 Xing frame count, MP3 CBR from size, ID3 skipped', () => {
  assert.equal(wavDuration(wav(187)), 187);
  // MPEG1 L3 128 kbps 44.1k stereo frame + Xing with 7000 frames → 7000*1152/44100 s
  const frameLen = Math.floor(144 * 128000 / 44100);
  const f = new Uint8Array(frameLen * 2);
  f.set([0xff, 0xfb, 0x90, 0x00], 0); f.set([0xff, 0xfb, 0x90, 0x00], frameLen);
  const x = 4 + 32; f.set([...'Xing'].map(c => c.charCodeAt(0)), x); f[x + 7] = 1; f.set([0, 0, 0x1b, 0x58], x + 8);
  assert.ok(Math.abs(mp3Duration(f)! - 7000 * 1152 / 44100) < 0.01);
  const cbr = new Uint8Array(frameLen * 2); cbr.set([0xff, 0xfb, 0x90, 0x00], 0); cbr.set([0xff, 0xfb, 0x90, 0x00], frameLen);
  assert.ok(Math.abs(mp3Duration(cbr, 128000 / 8 * 200)! - 200) < 0.01);
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0x01, 0x00]);
  assert.equal(id3v2Size(id3), 10 + 128);
});

test('probe: an empty stored file reads as 0 (skipped), not a crash', async () => {
  assert.equal(await probeDuration('u', async () => ({ bytes: new Uint8Array(0), total: 0 })), 0);
  assert.equal(await probeDuration('u', async () => ({ bytes: wav(61), total: 44 + 61 * 176_400 })), 61);
});

test('/durations: reads each station file once, refuses non-storage URLs', async () => {
  assert.ok(isStationMediaUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a.mp3?alt=media'));
  assert.ok(!isStationMediaUrl('http://firebasestorage.googleapis.com/a.mp3'));
  assert.ok(!isStationMediaUrl('https://169.254.169.254/latest'));
  assert.ok(!isStationMediaUrl('https://evil.example/firebasestorage.googleapis.com'));
  let calls = 0;
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/', createOnAirRouter({ mind: null, probe: async (u) => { calls++; return u.includes('empty') ? 0 : 180.04; } }));
  const srv = app.listen(0); const port = (srv.address() as any).port;
  const post = (tracks: any[]) => fetch(`http://127.0.0.1:${port}/durations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tracks }) }).then(r => r.json());
  const tracks = [
    { id: 'a', url: 'https://firebasestorage.googleapis.com/a.mp3' },
    { id: 'e', url: 'https://firebasestorage.googleapis.com/empty.wav' },
    { id: 'bad', url: 'https://169.254.169.254/x' },
  ];
  const one = await post(tracks);
  assert.deepEqual(one, { durations: { a: 180, e: 0 }, pending: 0 });
  await post(tracks);
  assert.equal(calls, 2, 'cached after the first read');
  srv.close();
});
