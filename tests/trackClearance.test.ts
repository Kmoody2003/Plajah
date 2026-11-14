import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAirTrack, clearanceOf, isSongTrack, publishBlockers, type TrackRights } from '../services/rights/trackClearance';

const sole: TrackRights = { writing: 'sole', source: 'original', deal: 'none' };
const song = (rights?: TrackRights) => ({ trackMeta: { rights } });

test('a sole writer with an original song and no deal is cleared', () => {
  assert.equal(clearanceOf(sole), 'cleared');
  assert.equal(canAirTrack(song(sole)), true);
});

test('any missing answer is unanswered', () => {
  assert.equal(clearanceOf(undefined), 'unanswered');
  assert.equal(clearanceOf({ writing: 'sole', source: 'original' }), 'unanswered');
});

test('co-writers and publishers can sell but are held from air until recorded', () => {
  for (const r of [{ ...sole, writing: 'cowriters' }, { ...sole, deal: 'publisher' }] as TrackRights[]) {
    assert.equal(clearanceOf(r), 'needs_signoff');
    assert.equal(canAirTrack(song(r)), false);
    assert.equal(publishBlockers([song(r)]).length, 0);
    const signed = { ...r, proof: 'Signed by Dana Reyes, 2026-10-01' };
    assert.equal(clearanceOf(signed), 'declared');
    assert.equal(canAirTrack(song(signed)), true);
  }
});

test('a cover or sample cannot publish or air without a recorded licence', () => {
  for (const source of ['cover', 'sample'] as const) {
    const r: TrackRights = { ...sole, source };
    assert.equal(clearanceOf(r), 'needs_license');
    assert.equal(canAirTrack(song(r)), false);
    assert.equal(publishBlockers([song(r)]).length, 1);
    assert.equal(clearanceOf({ ...r, proof: 'Mechanical licence 12345' }), 'declared');
  }
});

test('whitespace or a stub is not proof', () => {
  assert.equal(clearanceOf({ ...sole, source: 'cover', proof: '   ' }), 'needs_license');
  assert.equal(clearanceOf({ ...sole, source: 'cover', proof: 'ok' }), 'needs_license');
});

test('a cover with co-writers still needs a licence first', () => {
  assert.equal(clearanceOf({ writing: 'cowriters', source: 'cover', deal: 'publisher' }), 'needs_license');
});

test('older unanswered catalog stays on air but blocks a new publish', () => {
  assert.equal(canAirTrack(song()), true);
  assert.equal(publishBlockers([song()]).length, 1);
});

test('non-song tracks are never blocked', () => {
  assert.equal(isSongTrack({ mediaKind: 'VIDEO' }), false);
  assert.equal(isSongTrack({ kind: 'PODCAST' }), false);
  assert.equal(isSongTrack({}), true);
  assert.equal(publishBlockers([{ kind: 'PODCAST' }, { mediaKind: 'VIDEO' }]).length, 0);
});
