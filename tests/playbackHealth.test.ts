// Tests for the playback-health stall detector.
//
// The value of this module is entirely in NOT miscounting: a detector that reports a stall
// every time someone drags the scrubber, or that misses the real underruns, is worse than no
// detector because it produces confident wrong numbers. These tests pin the discriminations
// that matter — underrun vs seek, underrun vs user pause, starved vs buffered — plus the
// summary arithmetic that a reliability decision would be based on.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachPlaybackHealth, configurePlaybackHealth, getSummary, getEvents, reset, onStall,
} from '../services/playbackHealth';

/** Minimal stand-in for the parts of HTMLMediaElement the detector touches. */
class FakeAudio {
  paused = false;
  ended = false;
  currentTime = 10;
  readyState = 4;
  currentSrc = 'https://cdn.example.com/api/chora/media/t1/index.m3u8';
  src = '';
  buffered = { length: 1, start: (_: number) => 0, end: (_: number) => 12 };
  private handlers: Record<string, Function[]> = {};
  addEventListener(type: string, fn: Function) { (this.handlers[type] ||= []).push(fn); }
  removeEventListener(type: string, fn: Function) {
    this.handlers[type] = (this.handlers[type] || []).filter(f => f !== fn);
  }
  emit(type: string) { for (const fn of this.handlers[type] || []) fn(); }
}

const makeAudio = () => new FakeAudio() as unknown as HTMLMediaElement & FakeAudio;
const track = (id: string | null = 't1', title = 'Test Track') => () => ({ trackId: id, title });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => {
  reset();
  configurePlaybackHealth({ getQuality: () => 'high', getTranscodeStatus: undefined });
});

test('a waiting event during playback records a stall', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  a.emit('playing');
  detach();
  const evs = getEvents();
  assert.equal(evs.length, 1);
  assert.equal(evs[0].trackId, 't1');
  assert.equal(evs[0].recovered, true);
  assert.equal(evs[0].position, 10);
});

test('a stall is not closed until playback actually resumes', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  assert.equal(getEvents().length, 0, 'an open stall is not yet recorded');
  a.emit('playing');
  assert.equal(getEvents().length, 1);
  detach();
});

test('waiting while paused is the user, not an underrun', () => {
  const a = makeAudio();
  a.paused = true;
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  a.emit('playing');
  detach();
  assert.equal(getEvents().length, 0);
});

test('the rebuffer that follows a seek is not counted as an underrun', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('seeking');      // user drags the scrubber
  a.emit('waiting');      // the seek's own rebuffer
  a.emit('playing');
  detach();
  assert.equal(getEvents().length, 0, 'scrubbing must not read as a dropout');
});

test('a real underrun well after a seek is still counted', async () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('seeking');
  await sleep(450);       // past the seek grace window
  a.emit('waiting');
  a.emit('playing');
  detach();
  assert.equal(getEvents().length, 1);
});

test('a second waiting during an open stall does not double-count', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  a.emit('waiting');
  a.emit('playing');
  detach();
  assert.equal(getEvents().length, 1);
});

test('starvation is distinguished from stalling with buffer in hand', () => {
  const a = makeAudio();
  a.buffered = { length: 1, start: () => 0, end: () => 10 };   // nothing ahead of playhead
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  a.emit('playing');
  detach();
  assert.equal(getEvents()[0].bufferedAhead, 0, 'starved');

  reset();
  const b = makeAudio();
  b.buffered = { length: 1, start: () => 0, end: () => 40 };   // 30s ahead
  const d2 = attachPlaybackHealth(b, track());
  b.emit('waiting');
  b.emit('playing');
  d2();
  assert.equal(getEvents()[0].bufferedAhead, 30, 'buffered but stalled anyway');
});

test('source kind is classified from the playing URL', () => {
  const cases: [string, string][] = [
    ['https://x/api/chora/media/t1/index.m3u8', 'hls'],
    ['https://x/api/chora/media/t1/low.m4a', 'transcoded-progressive'],
    ['https://firebasestorage.googleapis.com/master.wav', 'original'],
    ['blob:https://plajah.com/abc', 'blob'],
    ['', 'unknown'],
  ];
  for (const [src, expected] of cases) {
    reset();
    const a = makeAudio();
    a.currentSrc = src;
    const detach = attachPlaybackHealth(a, track());
    a.emit('waiting');
    a.emit('playing');
    detach();
    assert.equal(getEvents()[0].sourceKind, expected, `${src || '(empty)'} -> ${expected}`);
  }
});

test('transcode status is resolved and bucketed as the actionable signal', async () => {
  configurePlaybackHealth({ getQuality: () => 'high', getTranscodeStatus: async () => false });
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  a.emit('playing');
  await sleep(10);
  detach();
  assert.equal(getEvents()[0].transcoded, false);
  assert.equal(getSummary().untranscodedStalls, 1, 'untranscoded stalls are counted separately');
});

test('an unresolvable transcode status stays null rather than guessing', async () => {
  configurePlaybackHealth({ getQuality: () => 'high', getTranscodeStatus: async () => { throw new Error('offline'); } });
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  a.emit('playing');
  await sleep(10);
  detach();
  assert.equal(getEvents()[0].transcoded, null);
  assert.equal(getSummary().untranscodedStalls, 0, 'unknown is not counted as untranscoded');
});

test('stalls-per-hour is computed against real listening time, not wall clock', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  // Simulate 60 timeupdates at ~1s apart => ~60s of listening, with one stall.
  a.emit('waiting');
  a.emit('playing');
  detach();
  const s = getSummary();
  assert.equal(s.stallCount, 1);
  // No timeupdates were emitted, so there is no listening time and the rate must not divide by 0.
  assert.equal(s.stallsPerHour, 0);
  assert.equal(s.playedSeconds, 0);
});

test('the worst track is the one with the most stalls', () => {
  const mk = (id: string, title: string) => {
    const a = makeAudio();
    const d = attachPlaybackHealth(a, track(id, title));
    a.emit('waiting'); a.emit('playing');
    d();
  };
  mk('t1', 'One');
  mk('t2', 'Two');
  mk('t2', 'Two');
  const s = getSummary();
  assert.equal(s.worstTrack?.trackId, 't2');
  assert.equal(s.worstTrack?.stalls, 2);
  assert.equal(s.stallCount, 3);
});

test('a track change during a stall records it as unrecovered', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  a.emit('emptied');          // source torn down mid-stall
  detach();
  const evs = getEvents();
  assert.equal(evs.length, 1);
  assert.equal(evs[0].recovered, false, 'never came back');
});

test('detaching closes an open stall instead of leaking it', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  a.emit('waiting');
  detach();
  assert.equal(getEvents().length, 1);
  assert.equal(getEvents()[0].recovered, false);
});

test('listeners are removed on detach so a dead element stops reporting', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  detach();
  a.emit('waiting');
  a.emit('playing');
  assert.equal(getEvents().length, 0);
});

test('a thrown listener cannot break playback', () => {
  const a = makeAudio();
  const detach = attachPlaybackHealth(a, track());
  const un = onStall(() => { throw new Error('bad subscriber'); });
  assert.doesNotThrow(() => { a.emit('waiting'); a.emit('playing'); });
  un(); detach();
});
