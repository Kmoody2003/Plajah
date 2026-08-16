// vespersService — Test Suite
// Run with: npm run test:vespers
//
// The contract that matters: a recap must be a real, usable briefing built from
// the cue log ALONE — no transcription, no model. AI prose is a layer on top.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildRecap, recapRefs, replayUrlAt, formatTC } from '../services/vespersService';
import { CLEAR_REF, type KairosCue, type ScriptureSession } from '../services/kairosService';

const cue = (refId: string, label: string, tc: number, seq: number): KairosCue => ({
  refId, label, lines: [label], translation: 'King James',
  variant: 'LOWER_THIRD', wallClock: 0, programTC: tc, seq,
});

const clearAt = (tc: number, seq: number): KairosCue => ({
  refId: CLEAR_REF, label: '', lines: [], translation: '',
  variant: 'LOWER_THIRD', wallClock: 0, programTC: tc, seq,
});

const START = 1_700_000_000_000;

function session(over: Partial<ScriptureSession> = {}): ScriptureSession {
  return {
    id: 'svc_org1_2026-08-14', orgId: 'org1', hostId: 'h1',
    title: 'All Things', translation: 'kjv', isActive: false, current: null,
    cues: [
      cue('43.1.1', 'John 1:1', 380, 1),
      cue('19.23.1', 'Psalms 23:1', 845, 2),
      cue('45.8.1', 'Romans 8:1', 1230, 3),
      clearAt(1300, 4),
      cue('45.8.28', 'Romans 8:28', 1453, 5),
    ],
    startedAt: START,
    endedAt: START + 2760 * 1000,
    ...over,
  };
}

describe('buildRecap — works with no AI at all', () => {
  const r = buildRecap(session());

  test('every taught passage is present, in order, with its timecode', () => {
    assert.deepEqual(r.passages.map(p => `${p.label}@${p.programTC}`), [
      'John 1:1@380', 'Psalms 23:1@845', 'Romans 8:1@1230', 'Romans 8:28@1453',
    ]);
  });

  test('clears are not passages', () => {
    assert.ok(!r.passages.some(p => p.refId === CLEAR_REF));
    assert.equal(r.passages.length, 4);
  });

  test('dwell is the gap to the next cue; the last has none', () => {
    assert.equal(r.passages[0].dwellSec, 465);   // 845 - 380
    assert.equal(r.passages[2].dwellSec, 223);   // 1453 - 1230
    assert.equal(r.passages[3].dwellSec, undefined);
  });

  test('duration comes from the wall clock', () => {
    assert.equal(r.durationSec, 2760);
  });

  test('falls back to the last cue when wall clock is unusable', () => {
    // An imported session with no endedAt and a startedAt of 0.
    const odd = buildRecap(session({ startedAt: 0, endedAt: 0 }), { endedAt: 0 });
    assert.equal(odd.durationSec, 1453);
  });

  test('no summary, no article, and that is a valid recap', () => {
    assert.equal(r.summary, undefined);
    assert.equal(r.article, undefined);
    assert.equal(r.status, 'READY');
    assert.ok(r.passages.length > 0, 'still useful without prose');
  });

  test('id is derived from the session so it cannot be duplicated', () => {
    assert.equal(r.id, 'recap_svc_org1_2026-08-14');
    assert.equal(buildRecap(session()).id, r.id);
  });

  test('a service where nothing was taught still produces a valid recap', () => {
    const empty = buildRecap(session({ cues: [] }));
    assert.deepEqual(empty.passages, []);
    assert.equal(empty.durationSec, 2760);
  });

  test('undefined fields are stripped — Firestore rejects them', () => {
    const json = JSON.parse(JSON.stringify(r));
    assert.ok(!('replayUrl' in json), 'replayUrl should be absent, not undefined');
    assert.ok(!('dwellSec' in json.passages[3]), 'trailing dwellSec should be absent');
  });
});

describe('recapRefs — passages round-trip to real references', () => {
  test('parses back to book/chapter/verse', () => {
    const refs = recapRefs(buildRecap(session()));
    assert.equal(refs.length, 4);
    assert.equal(refs[3].bookName, 'Romans');
    assert.equal(refs[3].chapter, 8);
    assert.equal(refs[3].verse, 28);
  });

  test('null recap is not an error', () => {
    assert.deepEqual(recapRefs(null), []);
  });
});

describe('replay deep links', () => {
  test('appends a timecode', () => {
    const r = buildRecap(session(), { replayUrl: 'https://plajah.com/watch/abc' });
    assert.equal(replayUrlAt(r, 1453), 'https://plajah.com/watch/abc?t=1453');
  });

  test('respects an existing query string', () => {
    const r = buildRecap(session(), { replayUrl: 'https://plajah.com/w?id=1' });
    assert.equal(replayUrlAt(r, 380), 'https://plajah.com/w?id=1&t=380');
  });

  test('no replay means no link, not a broken one', () => {
    assert.equal(replayUrlAt(buildRecap(session()), 380), null);
  });
});

describe('formatTC', () => {
  test('service timecodes', () => {
    assert.equal(formatTC(380), '6:20');
    assert.equal(formatTC(1453), '24:13');
    assert.equal(formatTC(0), '0:00');
  });
});
