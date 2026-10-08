import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrenceCount, concordance, tokenize, buildConcordanceIndex, searchConcordanceIndex } from '../services/lectioConcordance';

test('word boundaries and repeated occurrences do not conflate love with beloved', () => {
  assert.equal(occurrenceCount('Love, love; beloved.', 'love', 'word'), 2);
  assert.equal(occurrenceCount('love thy neighbour', 'love thy', 'word'), 0);
});
test('Hebrew vowel marks stay attached and optional folding matches an unpointed query', () => {
  assert.deepEqual(tokenize('בְּרֵאשִׁית'), ['בְּרֵאשִׁית'.normalize('NFC')]);
  assert.deepEqual(tokenize('בְּרֵאשִׁית', true), ['בראשית']);
  const hit = { ref: { book: 1, bookName: 'Genesis', chapter: 1, verse: 1 }, label: 'Genesis 1:1', text: 'בְּרֵאשִׁית' };
  assert.equal(searchConcordanceIndex(buildConcordanceIndex([hit], true), 'בראשית', 'word').matches.length, 1);
  assert.equal(searchConcordanceIndex(buildConcordanceIndex([hit]), 'בראשית', 'word').matches.length, 0);
});
test('postings support prefixes, exclusions, testament and chapter bounds', () => {
  const hits = [
    { ref: { book: 1, bookName: 'Genesis', chapter: 1, verse: 1 }, label: 'Genesis 1:1', text: 'love beloved' },
    { ref: { book: 43, bookName: 'John', chapter: 1, verse: 1 }, label: 'John 1:1', text: 'loved loveth light' },
    { ref: { book: 43, bookName: 'John', chapter: 3, verse: 1 }, label: 'John 3:1', text: 'love loved' },
  ];
  const index = buildConcordanceIndex(hits);
  assert.equal(searchConcordanceIndex(index, 'lov', 'prefix').occurrences, 5);
  assert.equal(searchConcordanceIndex(index, 'lov', 'prefix', { testament: 'NT', exclude: 'light' }).occurrences, 2);
  assert.equal(searchConcordanceIndex(index, 'love', 'word', { book: 43, fromChapter: 2, toChapter: 3 }).matches.length, 1);
  assert.equal(searchConcordanceIndex(index, 'missing love', 'all').matches.length, 0);
  assert.equal(searchConcordanceIndex(index, 'missing love', 'any').matches.length, 2);
});
test('phrase matching handles punctuation, Unicode, and overlapping occurrences', () => {
  assert.equal(occurrenceCount('In—the beginning', 'in the beginning', 'phrase'), 1);
  assert.equal(occurrenceCount('a a a', 'a a', 'phrase'), 2);
  assert.equal(occurrenceCount('ἀγάπη ἀγάπη', 'ἀγάπη', 'word'), 2);
  assert.equal(occurrenceCount('cafe\u0301', 'café', 'word'), 1);
});
test('all and any words preserve their distinct semantics', () => {
  assert.equal(occurrenceCount('faith faith', 'faith hope', 'all'), 0);
  assert.equal(occurrenceCount('faith faith', 'faith hope', 'any'), 2);
  assert.equal(occurrenceCount('faith hope', 'faith faith hope', 'all'), 2);
  assert.equal(occurrenceCount('faith', '', 'any'), 0);
});
test('counts include all results, with deterministic book filters', () => {
  const hits = Array.from({ length: 140 }, (_, i) => ({
    ref: { book: i < 120 ? 43 : 45, bookName: i < 120 ? 'John' : 'Romans', chapter: 1, verse: i + 1 },
    label: String(i), text: 'Love love',
  }));
  const all = concordance(hits, 'love', 'word');
  assert.equal(all.matches.length, 140); assert.equal(all.occurrences, 280);
  const filtered = concordance(hits, 'love', 'word', 45);
  assert.equal(filtered.matches.length, 20); assert.equal(filtered.occurrences, 40);
});
