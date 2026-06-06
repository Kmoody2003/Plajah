// Cora Music Analysis — Test Suite
// Run with: npm run test:cora
// Or:       npx tsx --test tests/coraAnalysis.test.ts

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDjBeatDetection,
  getAriaBeatDetection,
  selectBestBeatDetection,
  analyzeTrack,
  analyzeFromPlatformTrack,
  logSystemUsage,
  getSystemLog,
  clearSystemLog,
  type AudioMetadata,
  type PlatformTrack,
  type PlatformAlbumContext,
} from '../services/coraAnalysisService';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const EDM_META: AudioMetadata  = { genre: 'EDM',  duration: 240 };
const JAZZ_META: AudioMetadata = { genre: 'Jazz', duration: 300 };

const TRACK: PlatformTrack = {
  id:       'track-plajah-001',
  title:    'Midnight Circuit',
  artist:   'DJ Nova',
  genre:    'EDM',
  duration: 240,
};

const ALBUM: PlatformAlbumContext = {
  id:      'album-plajah-001',
  genre:   'Electronic',
  ownerId: 'user-abc',
};

// ─── logSystemUsage ───────────────────────────────────────────────────────────

describe('logSystemUsage', () => {
  beforeEach(() => clearSystemLog());

  test('appends entries to the system log', () => {
    logSystemUsage('Test Event', { key: 'value' });
    const log = getSystemLog();
    assert.equal(log.length, 1);
    assert.equal(log[0].event, 'Test Event');
    assert.deepEqual(log[0].details, { key: 'value' });
  });

  test('getSystemLog returns a copy — mutations do not affect internal state', () => {
    logSystemUsage('A');
    const snapshot = getSystemLog();
    snapshot.push({ timestamp: new Date(), event: 'injected' });
    assert.equal(getSystemLog().length, 1);
  });

  test('clearSystemLog empties the log', () => {
    logSystemUsage('X');
    clearSystemLog();
    assert.equal(getSystemLog().length, 0);
  });

  test('entry timestamp is a valid Date', () => {
    logSystemUsage('TS Check');
    const [entry] = getSystemLog();
    assert.ok(entry.timestamp instanceof Date);
    assert.ok(!isNaN(entry.timestamp.getTime()));
  });
});

// ─── getDjBeatDetection ───────────────────────────────────────────────────────

describe('getDjBeatDetection', () => {
  beforeEach(() => clearSystemLog());

  test('returns a valid BeatDetectionResult shape', () => {
    const result = getDjBeatDetection('track-001', EDM_META);
    assert.ok(typeof result.bpm === 'number');
    assert.ok(typeof result.confidence === 'number');
    assert.equal(result.algorithm, 'DJ-OD-v2');
    assert.ok(Array.isArray(result.data.intervals));
    assert.ok(Array.isArray(result.data.onsets));
  });

  test('bpm is in a plausible range (40–250)', () => {
    for (const meta of [EDM_META, JAZZ_META, { genre: 'Hip-Hop' }, {}]) {
      const { bpm } = getDjBeatDetection('track-x', meta);
      assert.ok(bpm >= 40 && bpm <= 250, `BPM out of range: ${bpm}`);
    }
  });

  test('confidence is between 0 and 1', () => {
    const { confidence } = getDjBeatDetection('track-001', EDM_META);
    assert.ok(confidence > 0 && confidence <= 1);
  });

  test('EDM (specialist) gets higher confidence than unknown genre', () => {
    assert.ok(
      getDjBeatDetection('t', EDM_META).confidence >
      getDjBeatDetection('t', {}).confidence,
    );
  });

  test('longer duration increases confidence', () => {
    const hi = getDjBeatDetection('t', { genre: 'EDM', duration: 240 });
    const lo = getDjBeatDetection('t', { genre: 'EDM', duration: 60 });
    assert.ok(hi.confidence >= lo.confidence);
  });

  test('onsets are monotonically increasing', () => {
    const { data } = getDjBeatDetection('track-001', EDM_META);
    for (let i = 1; i < data.onsets.length; i++) {
      assert.ok(data.onsets[i] > data.onsets[i - 1], 'Onsets must increase');
    }
  });

  test('is deterministic', () => {
    const a = getDjBeatDetection('track-42', { genre: 'House', duration: 200 });
    const b = getDjBeatDetection('track-42', { genre: 'House', duration: 200 });
    assert.equal(a.bpm, b.bpm);
    assert.equal(a.confidence, b.confidence);
    assert.deepEqual(a.data.intervals, b.data.intervals);
  });

  test('logs a system event', () => {
    getDjBeatDetection('track-log', EDM_META);
    assert.ok(getSystemLog().some(e => e.event === 'DJ Beat Detection Run'));
  });
});

// ─── getAriaBeatDetection ─────────────────────────────────────────────────────

describe('getAriaBeatDetection', () => {
  beforeEach(() => clearSystemLog());

  test('returns valid BeatDetectionResult shape', () => {
    const result = getAriaBeatDetection('track-001', JAZZ_META);
    assert.ok(typeof result.bpm === 'number');
    assert.ok(result.confidence > 0 && result.confidence <= 1);
    assert.equal(result.algorithm, 'Aria-SF-v3');
    assert.ok(Array.isArray(result.data.intervals));
  });

  test('bpm is in plausible range for all genres', () => {
    for (const meta of [JAZZ_META, EDM_META, { genre: 'Classical' }, {}]) {
      const { bpm } = getAriaBeatDetection('t', meta);
      assert.ok(bpm >= 38 && bpm <= 252, `BPM out of range: ${bpm}`);
    }
  });

  test('Jazz (specialist) gets higher confidence than unknown genre', () => {
    assert.ok(
      getAriaBeatDetection('t', JAZZ_META).confidence >
      getAriaBeatDetection('t', {}).confidence,
    );
  });

  test('is deterministic', () => {
    const a = getAriaBeatDetection('track-99', { genre: 'Classical', duration: 300 });
    const b = getAriaBeatDetection('track-99', { genre: 'Classical', duration: 300 });
    assert.equal(a.bpm, b.bpm);
    assert.equal(a.confidence, b.confidence);
  });

  test('logs a system event', () => {
    getAriaBeatDetection('track-log', JAZZ_META);
    assert.ok(getSystemLog().some(e => e.event === 'Aria Beat Detection Run'));
  });
});

// ─── selectBestBeatDetection ──────────────────────────────────────────────────

describe('selectBestBeatDetection', () => {
  beforeEach(() => clearSystemLog());

  test('returns a BeatData object', () => {
    const result = selectBestBeatDetection('track-bridge', EDM_META);
    assert.ok(typeof result.bpm === 'number');
    assert.ok(typeof result.confidence === 'number');
    assert.ok(typeof result.method === 'string');
    assert.ok(Array.isArray(result.intervals));
    assert.ok(Array.isArray(result.onsets));
  });

  test('confidence equals the higher of the two algorithms', () => {
    const dj   = getDjBeatDetection('t', EDM_META);
    const aria = getAriaBeatDetection('t', EDM_META);
    const best = selectBestBeatDetection('t', EDM_META);
    assert.equal(best.confidence, Math.max(dj.confidence, aria.confidence));
  });

  test('selected BPM matches the winning algorithm', () => {
    const dj   = getDjBeatDetection('t', JAZZ_META);
    const aria = getAriaBeatDetection('t', JAZZ_META);
    const best = selectBestBeatDetection('t', JAZZ_META);
    assert.equal(best.bpm, dj.confidence > aria.confidence ? dj.bpm : aria.bpm);
  });

  test('logs which algorithm was selected', () => {
    selectBestBeatDetection('track-log', EDM_META);
    const log = getSystemLog();
    const selectionEvents = log.filter(e =>
      e.event === 'DJ Beat Detection Selected' ||
      e.event === 'Aria Beat Detection Selected',
    );
    assert.equal(selectionEvents.length, 1);
  });

  test('works with empty metadata', () => {
    assert.doesNotThrow(() => selectBestBeatDetection('t', {}));
  });

  test('works with no metadata argument', () => {
    assert.doesNotThrow(() => selectBestBeatDetection('t'));
  });

  test('is deterministic', () => {
    const a = selectBestBeatDetection('t', { genre: 'Techno', duration: 180 });
    const b = selectBestBeatDetection('t', { genre: 'Techno', duration: 180 });
    assert.equal(a.bpm, b.bpm);
    assert.equal(a.method, b.method);
  });

  test('EDM → DJ algorithm wins (kick-transient specialist)', () => {
    const result = selectBestBeatDetection('edm-track', { genre: 'EDM', duration: 240 });
    assert.equal(result.method, 'onset-energy-v2');
  });

  test('Jazz → Aria algorithm wins (harmonic specialist)', () => {
    const result = selectBestBeatDetection('jazz-track', { genre: 'Jazz', duration: 300 });
    assert.equal(result.method, 'spectral-flux-v3');
  });
});

// ─── analyzeTrack ─────────────────────────────────────────────────────────────

describe('analyzeTrack', () => {
  beforeEach(() => clearSystemLog());

  test('returns correct AnalysisResult shape', async () => {
    const result = await analyzeTrack('t-1', { title: 'Test Song', artist: 'Artist', metadata: EDM_META });
    assert.equal(result.songInput.title, 'Test Song');
    assert.ok(typeof result.detectedTempo === 'number');
    assert.ok(typeof result.beatDetectionVersion === 'string');
    assert.ok(result.beatData.confidence > 0);
  });

  test('manual tempo override is respected', async () => {
    const result = await analyzeTrack('t-2', {
      title: 'Fixed', artist: 'Artist', tempo: 142, metadata: EDM_META,
    });
    assert.equal(result.detectedTempo, 142);
  });

  test('genreRules seeds genre when metadata.genre is absent', async () => {
    const result = await analyzeTrack('t-3', {
      title: 'No Genre', artist: 'Artist', genreRules: 'House, Uplifting',
    });
    assert.equal(result.metadata.genre, 'House');
    assert.ok(result.detectedTempo >= 40 && result.detectedTempo <= 250);
  });

  test('logs pipeline start and complete events', async () => {
    await analyzeTrack('t-4', { title: 'Log Test', artist: 'Artist' });
    const events = getSystemLog().map(e => e.event);
    assert.ok(events.includes('Analysis Pipeline Start'));
    assert.ok(events.includes('Analysis Pipeline Complete'));
  });

  test('handles minimal input without throwing', async () => {
    await assert.doesNotReject(() =>
      analyzeTrack('t-5', { title: 'Minimal', artist: 'Artist' }),
    );
  });
});

// ─── analyzeFromPlatformTrack ─────────────────────────────────────────────────

describe('analyzeFromPlatformTrack', () => {
  beforeEach(() => clearSystemLog());

  test('uses track genre over album genre', async () => {
    const result = await analyzeFromPlatformTrack(TRACK, ALBUM);
    // EDM track genre should take priority over Electronic album genre
    assert.equal(result.metadata.genre, 'EDM');
  });

  test('falls back to album genre when track has none', async () => {
    const trackNoGenre: PlatformTrack = { ...TRACK, genre: undefined };
    const result = await analyzeFromPlatformTrack(trackNoGenre, ALBUM);
    assert.equal(result.metadata.genre, 'Electronic');
  });

  test('includes songInput title and artist from track', async () => {
    const result = await analyzeFromPlatformTrack(TRACK, ALBUM);
    assert.equal(result.songInput.title,  TRACK.title);
    assert.equal(result.songInput.artist, TRACK.artist);
  });

  test('lyrics are carried through when present', async () => {
    const trackWithLyrics: PlatformTrack = { ...TRACK, lyrics: 'verse one...' };
    const result = await analyzeFromPlatformTrack(trackWithLyrics, ALBUM);
    assert.equal(result.songInput.lyrics, 'verse one...');
  });

  test('detectedTempo is a positive number', async () => {
    const result = await analyzeFromPlatformTrack(TRACK, ALBUM);
    assert.ok(result.detectedTempo > 0);
  });

  test('handles missing optional fields without throwing', async () => {
    const minimal: PlatformTrack = { id: 't-min', title: 'Min', artist: 'Artist' };
    const minAlbum: PlatformAlbumContext = { id: 'a-min' };
    await assert.doesNotReject(() => analyzeFromPlatformTrack(minimal, minAlbum));
  });
});
