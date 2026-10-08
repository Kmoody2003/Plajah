import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORICAL_EVIDENCE } from '../data/sacredLibrary/historicalEvidence';
import { evidenceForPassage, searchHistoricalEvidence } from '../services/lectioHistory';
import { parseRef } from '../services/scriptureRef';
test('all historical entries have traceable institutional sources, bounded dates and valid passage links', () => {
  assert.equal(new Set(HISTORICAL_EVIDENCE.map(e => e.id)).size, HISTORICAL_EVIDENCE.length);
  for (const e of HISTORICAL_EVIDENCE) {
    assert.ok(e.date.from <= e.date.to); assert.ok(e.date.basis && e.limits && e.observation && e.sources.length);
    e.passages.forEach(ref => assert.ok(parseRef(ref), ref));
    e.sources.forEach(source => assert.equal(new URL(source.url).protocol, 'https:'));
  }
});
test('passage context includes linked chapters without leaking unrelated contexts', () => {
  assert.ok(evidenceForPassage(parseRef('2 Kings 18:13')!).some(e => e.id === 'taylor-prism'));
  assert.ok(!evidenceForPassage(parseRef('John 3:16')!).some(e => e.id === 'taylor-prism'));
  assert.ok(evidenceForPassage(parseRef('John 3:16')!).some(e => e.id === 'sinaiticus'));
});
test('timeline searches and filters are ordered chronologically', () => {
  assert.equal(searchHistoricalEvidence('cyrus')[0].id, 'cyrus-cylinder');
  assert.equal(searchHistoricalEvidence('cyrus', 'manuscript').length, 0);
  const entries = searchHistoricalEvidence('');
  assert.ok(entries.every((entry, i) => !i || entries[i - 1].date.from <= entry.date.from));
});
