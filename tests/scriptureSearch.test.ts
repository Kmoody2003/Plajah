// scriptureSearch — the operator's anticipating scripture box (Ambo + Lectio).
// Run with: npx tsx --test tests/scriptureSearch.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveScriptureQuery, searchBooks, queryLabel } from '../services/scriptureSearch';
import { normalizeSpoken } from '../services/scriptureRef';
import { detectSpoken } from '../services/ambo/scriptureListener';

const top = (q: string) => resolveScriptureQuery(q).book?.name;
const label = (q: string) => queryLabel(resolveScriptureQuery(q));
const names = (q: string) => searchBooks(q).map(m => m.book.name);

describe('book anticipation', () => {
  test('partial names', () => {
    assert.equal(top('gen'), 'Genesis');
    assert.equal(top('deu'), 'Deuteronomy');
    assert.equal(top('phili'), 'Philippians');
    assert.equal(top('rev'), 'Revelation');
    assert.equal(top('ps'), 'Psalms');
    assert.equal(top('jn'), 'John');
    assert.equal(top('mt'), 'Matthew');
  });
  test('misspellings', () => {
    assert.equal(top('phillipians'), 'Philippians');
    assert.equal(top('revalation'), 'Revelation');
    assert.equal(top('revelations'), 'Revelation');
    assert.equal(top('ecclesiates'), 'Ecclesiastes');
    assert.equal(top('mathew'), 'Matthew');
    assert.equal(top('habakuk'), 'Habakkuk');
  });
  test('a word inside the name', () => {
    assert.equal(top('solomon'), 'Song of Solomon');
  });
  test('john means John first, numbered Johns still listed', () => {
    assert.deepEqual(names('john').slice(0, 4), ['John', '1 John', '2 John', '3 John']);
  });
});

describe('ordinals', () => {
  const SECOND = ['2 Samuel', '2 Kings', '2 Chronicles', '2 Corinthians', '2 Thessalonians', '2 Timothy', '2 Peter', '2 John'];
  test('an ordinal alone filters to every book that has one', () => {
    for (const q of ['2', 'second', 'II', 'ii', '2nd', 'sec']) {
      const r = resolveScriptureQuery(q);
      assert.equal(r.ordinalOnly, true, q);
      assert.deepEqual(r.matches.map(m => m.book.name), SECOND, q);
    }
    assert.deepEqual(names('3'), ['3 John']);
  });
  test('every spelling of "2 Peter"', () => {
    for (const q of ['2 peter', '2peter', '2 pet', '2pet', 'II Peter', 'ii pet', 'second peter', '2nd peter', 'Second Pet']) {
      assert.equal(top(q), '2 Peter', q);
    }
  });
  test('ordinal narrows a shared base', () => {
    assert.equal(top('1 cor'), '1 Corinthians');
    assert.equal(top('1cor13'), '1 Corinthians');
    assert.equal(top('iii jn'), '3 John');
    assert.equal(top('first kings'), '1 Kings');
  });
  test('roman numeral I does not swallow Isaiah', () => {
    assert.equal(top('isa 53'), 'Isaiah');
    assert.equal(top('is 53'), 'Isaiah');
  });
});

describe('chapter and verse without operators', () => {
  test('first number chapter, second verse', () => {
    assert.equal(label('john 3 16'), 'John 3:16');
    assert.equal(label('john 3:16'), 'John 3:16');
    assert.equal(label('john 3.16'), 'John 3:16');
    assert.equal(label('jn3 16'), 'John 3:16');
    assert.equal(label('2 pet 3 9'), '2 Peter 3:9');
    assert.equal(label('second peter 3 9'), '2 Peter 3:9');
    assert.equal(label('rom 8 28'), 'Romans 8:28');
    assert.equal(label('ps 23'), 'Psalms 23');
    assert.equal(label('john 3 v16'), 'John 3:16');
    assert.equal(label('john chapter 3 verse 16'), 'John 3:16');
  });
  test('a third number is the end verse', () => {
    assert.equal(label('john 3 16 18'), 'John 3:16–18');
    assert.equal(label('john 3:16-18'), 'John 3:16–18');
    assert.equal(label('rom 8 28 to 31'), 'Romans 8:28–31');
  });
  test('a chapter dash stays a chapter', () => {
    const r = resolveScriptureQuery('matt 5-7');
    assert.equal(r.chapter, 5); assert.equal(r.verse, undefined);
  });
  test('single-chapter books read a lone number as a verse', () => {
    assert.equal(label('jude 5'), 'Jude 1:5');
    assert.equal(label('jude 1 5'), 'Jude 1:5');
  });
  test('the ref is built only when the chapter exists', () => {
    assert.ok(resolveScriptureQuery('john 3 16').ref);
    assert.equal(resolveScriptureQuery('john 30').ref, null);
  });
  test('numbers alone apply to the open book', () => {
    const r = resolveScriptureQuery('3 16');
    assert.equal(r.contextual, true); assert.equal(r.chapter, 3); assert.equal(r.verse, 16);
  });
});

describe('spoken run-together numbers', () => {
  test('ASR "John 316" is John 3:16', () => {
    assert.equal(normalizeSpoken('John 316'), 'John 3:16');
    assert.equal(normalizeSpoken('Romans 828'), 'Romans 8:28');
    assert.equal(normalizeSpoken('Psalm 1191'), 'Psalm 119:1');
    assert.equal(normalizeSpoken('Psalm 119'), 'Psalm 119');
    assert.equal(detectSpoken('turn to John 316')[0]?.ref.verse, 16);
  });
});

describe('operator mic channel', () => {
  test('a bare chapter needs a cue from the room, not from the operator', () => {
    assert.equal(detectSpoken('psalm 23').length, 0);
    assert.equal(detectSpoken('psalm 23', 0.6, false)[0]?.ref.chapter, 23);
    assert.equal(detectSpoken('second peter three nine', 0.6, false)[0]?.ref.book, 61);
  });
});
