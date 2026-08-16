// scriptureRef — Test Suite
// Run with: npm run test:scripture
// Or:       npx tsx --test tests/scriptureRef.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRef,
  findRefs,
  formatRef,
  refId,
  parseRefId,
  lookupBook,
  expandRef,
  isSameRef,
  refOverlaps,
  matchPrediction,
  normalizeSpoken,
  type ScriptureRef,
} from '../services/scriptureRef';

const d = (s: string) => formatRef(parseRef(s)!, 'display');

describe('parseRef — the forms an operator actually types', () => {
  test('canonical', () => {
    assert.equal(d('John 3:16'), 'John 3:16');
    assert.equal(d('Romans 8:28'), 'Romans 8:28');
  });

  test('Ambo shorthand — dot separator, no space, lowercase', () => {
    assert.equal(d('rom 8.28'), 'Romans 8:28');
    assert.equal(d('rom8:28'), 'Romans 8:28');
    assert.equal(d('1cor13'), '1 Corinthians 13');
    assert.equal(d('jn3.16'), 'John 3:16');
  });

  test('verse ranges', () => {
    assert.equal(d('Romans 8:28-31'), 'Romans 8:28–31');
    assert.equal(d('Rom 8:28–31'), 'Romans 8:28–31');   // en dash
    assert.equal(d('1 Cor 13:4-7'), '1 Corinthians 13:4–7');
  });

  test('cross-chapter range', () => {
    assert.equal(d('Genesis 1:1-2:3'), 'Genesis 1:1–2:3');
  });

  test('chapter-only and chapter ranges', () => {
    assert.equal(d('Romans 8'), 'Romans 8');
    assert.equal(d('Matthew 5-7'), 'Matthew 5–7');
  });

  test('numbered books in every prefix style', () => {
    const want = '1 John 4:8';
    assert.equal(d('1 John 4:8'), want);
    assert.equal(d('1John 4:8'), want);
    assert.equal(d('1st John 4:8'), want);
    assert.equal(d('First John 4:8'), want);
    assert.equal(d('I John 4:8'), want);
    assert.equal(d('1 Jn 4:8'), want);
    assert.equal(d('II Timothy 1:7'), '2 Timothy 1:7');
    assert.equal(d('III John 4'), '3 John 1:4');
  });

  test('the unnumbered book still wins without a prefix', () => {
    assert.equal(parseRef('John 3:16')!.book, 43);
    assert.equal(parseRef('1 John 3:16')!.book, 62);
  });

  test('single-chapter books read a lone number as a verse', () => {
    assert.equal(d('Jude 5'), 'Jude 1:5');
    assert.equal(d('Jude 1:5'), 'Jude 1:5');
    assert.equal(d('Jude 3-5'), 'Jude 1:3–5');
    assert.equal(d('Philemon 6'), 'Philemon 1:6');
    assert.equal(d('Obadiah 15'), 'Obadiah 1:15');
    // …but multi-chapter books do not.
    assert.equal(d('Romans 8'), 'Romans 8');
  });

  test('Psalm and Psalms are the same book', () => {
    assert.equal(d('Psalm 23:1'), 'Psalms 23:1');
    assert.equal(d('Psalms 23:1'), 'Psalms 23:1');
    assert.equal(d('Ps 119:105'), 'Psalms 119:105');
  });

  test('multi-word book names', () => {
    assert.equal(d('Song of Solomon 2:1'), 'Song of Solomon 2:1');
    assert.equal(d('Song of Songs 2:1'), 'Song of Solomon 2:1');
  });

  test('trailing period abbreviations', () => {
    assert.equal(d('Gen. 1:1'), 'Genesis 1:1');
    assert.equal(d('Rev. 21:4'), 'Revelation 21:4');
  });

  test('rejects nonsense rather than guessing', () => {
    assert.equal(parseRef(''), null);
    assert.equal(parseRef('Hobbits 3:16'), null);
    assert.equal(parseRef('just some prose'), null);
    assert.equal(parseRef('Corinthians 13:4'), null);  // needs its ordinal
  });

  test('validates against the real canon', () => {
    assert.equal(parseRef('Romans 99:1'), null);        // Romans has 16 chapters
    assert.equal(parseRef('Jude 2:1'), null);           // Jude has 1
    assert.ok(parseRef('Romans 99:1', { validate: false }));
  });

  test('bare verse continuation resolves against context', () => {
    const context = parseRef('Romans 8:28')!;
    assert.equal(formatRef(parseRef('v. 31', { context })!, 'display'), 'Romans 8:31');
    assert.equal(formatRef(parseRef('verses 38-39', { context })!, 'display'), 'Romans 8:38–39');
    assert.equal(parseRef('v. 31'), null);              // no context, no match
  });
});

describe('findRefs — scanning prose and outlines', () => {
  test('finds every ref in a sermon outline with usable offsets', () => {
    const outline =
      'I. No condemnation — Romans 8:1. II. Contrast with Rom 7:15-20. ' +
      'III. The hinge: Romans 8:28. IV. Land on 2 Corinthians 4:17.';
    const found = findRefs(outline);
    assert.deepEqual(found.map(r => formatRef(r, 'compact')),
      ['ROM 8:1', 'ROM 7:15–20', 'ROM 8:28', '2 COR 4:17']);
    for (const r of found) {
      assert.equal(outline.slice(r.start, r.end), r.raw);
    }
  });

  test('comma chains expand into one cue each', () => {
    const found = findRefs('Romans 8:28, 31, 38-39');
    assert.deepEqual(found.map(r => formatRef(r, 'compact')),
      ['ROM 8:28', 'ROM 8:31', 'ROM 8:38–39']);
  });

  test('semicolon-separated refs stay distinct', () => {
    const found = findRefs('See Rom 8:28; 1 Cor 13:4; Ps 23:1');
    assert.equal(found.length, 3);
    assert.deepEqual(found.map(r => r.book), [45, 46, 19]);
  });

  test('ignores prose with no reference', () => {
    assert.deepEqual(findRefs('The meeting is at 3:16 and costs 1.50'), []);
    assert.deepEqual(findRefs('version 2.1 shipped in 2024'), []);
  });

  test('confidence separates a citation from a bare chapter', () => {
    const [withVerse] = findRefs('Romans 8:28');
    const [chapterOnly] = findRefs('Romans 8');
    assert.ok(withVerse.confidence > chapterOnly.confidence);
    assert.ok(withVerse.confidence >= 0.95);
  });

  test('prose mode keeps ordinary words out of the decoration pass', () => {
    const prose = (s: string) => findRefs(s, { prose: true }).map(r => formatRef(r, 'compact'));
    // Words that happen to be book aliases, followed by a number.
    assert.deepEqual(prose('he acts 2 ways when nervous'), []);
    assert.deepEqual(prose('my song 3 is the best one'), []);
    assert.deepEqual(prose('the show is 4 hours long'), []);
    // A real citation still resolves, capitalised or with an explicit verse.
    assert.deepEqual(prose('read Acts 2 tonight'), ['ACTS 2']);
    assert.deepEqual(prose('read acts 2:38 tonight'), ['ACTS 2:38']);
    assert.deepEqual(prose('Romans 8:28 got me through this week'), ['ROM 8:28']);
    // Operator input is unaffected — prose mode is opt-in.
    assert.deepEqual(findRefs('acts 2').map(r => formatRef(r, 'compact')), ['ACTS 2']);
  });

  test('minConfidence drops weak detections', () => {
    assert.deepEqual(findRefs('Jud 5:1', { minConfidence: 0.6 }), []);
    assert.equal(findRefs('Romans 8:28', { minConfidence: 0.6 }).length, 1);
  });

  test('ambiguous abbreviations are capped so Kairos never auto-fires them', () => {
    const [jud] = findRefs('Jud 5:1');
    assert.equal(jud.bookName, 'Judges');
    assert.ok(jud.confidence <= 0.5);
  });
});

describe('formatRef and identity', () => {
  const ref = parseRef('Romans 8:28-31')!;

  test('the three styles', () => {
    assert.equal(formatRef(ref, 'display'), 'Romans 8:28–31');
    assert.equal(formatRef(ref, 'compact'), 'ROM 8:28–31');
    assert.equal(formatRef(ref, 'osis'), '45.8.28-45.8.31');
  });

  test('compact names are set for all 66 books', () => {
    for (let n = 1; n <= 66; n++) {
      const r: ScriptureRef = { book: n, bookName: '', chapter: 1, verse: 1 };
      assert.ok(/^[0-9A-Z ]+ 1:1$/.test(formatRef(r, 'compact')), `book ${n}`);
    }
  });

  test('refId round-trips through parseRefId', () => {
    for (const s of ['John 3:16', 'Romans 8:28-31', 'Genesis 1:1-2:3', 'Romans 8', 'Matthew 5-7', 'Jude 5']) {
      const original = parseRef(s)!;
      const back = parseRefId(refId(original))!;
      assert.equal(formatRef(back, 'display'), formatRef(original, 'display'), s);
    }
  });

  test('parseRefId rejects junk', () => {
    assert.equal(parseRefId(''), null);
    assert.equal(parseRefId('99.1.1'), null);
    assert.equal(parseRefId('nonsense'), null);
  });
});

describe('range maths', () => {
  test('expandRef covers a verse range', () => {
    assert.deepEqual(expandRef(parseRef('Romans 8:28-31')!).map(v => v.verse), [28, 29, 30, 31]);
    assert.deepEqual(expandRef(parseRef('John 3:16')!).map(v => v.verse), [16]);
    assert.deepEqual(expandRef(parseRef('Romans 8')!), []);   // whole chapter, no verse span
  });

  test('expandRef is capped', () => {
    assert.equal(expandRef(parseRef('Genesis 1:1-50:26')!, 25).length, 25);
  });

  test('isSameRef / refOverlaps', () => {
    assert.ok(isSameRef(parseRef('Rom 8:28')!, parseRef('Romans 8:28')!));
    assert.ok(!isSameRef(parseRef('Rom 8:28')!, parseRef('Rom 8:29')!));

    assert.ok(refOverlaps(parseRef('Rom 8:28-31')!, parseRef('Rom 8:30')!));
    assert.ok(refOverlaps(parseRef('Rom 8')!, parseRef('Rom 8:28')!));
    assert.ok(!refOverlaps(parseRef('Rom 8:28')!, parseRef('Rom 8:31')!));
    assert.ok(!refOverlaps(parseRef('Rom 8:28')!, parseRef('John 3:16')!));
  });
});

describe('matchPrediction — the Kairos hot path', () => {
  const cues = ['Romans 8:1', 'Romans 7:15-20', 'Romans 8:28', 'Romans 8:31', '2 Corinthians 4:17']
    .map(s => parseRef(s)!);

  test('an exact prepared cue scores 1', () => {
    const m = matchPrediction(parseRef('Rom 8:28')!, cues)!;
    assert.equal(m.score, 1);
    assert.equal(m.index, 2);
  });

  test('a verse inside a prepared range still matches strongly', () => {
    const m = matchPrediction(parseRef('Romans 7:18')!, cues)!;
    assert.ok(m.score >= 0.85);
    assert.equal(m.index, 1);
  });

  test('same chapter, unprepared verse scores lower but still resolves', () => {
    const m = matchPrediction(parseRef('Romans 8:15')!, cues)!;
    assert.ok(m.score > 0 && m.score < 0.85);
  });

  test('an off-script book returns no match', () => {
    assert.equal(matchPrediction(parseRef('Psalm 23:1')!, cues), null);
  });
});

describe('normalizeSpoken — ASR chunks', () => {
  const spoken = (s: string) => findRefs(normalizeSpoken(s)).map(r => formatRef(r, 'display'));

  test('explicit chapter/verse scaffolding', () => {
    assert.deepEqual(spoken('turn with me to Romans chapter eight verse twenty eight'), ['Romans 8:28']);
    assert.deepEqual(spoken('Romans chapter 8 verse 28'), ['Romans 8:28']);
  });

  test('ordinal chapter phrasing', () => {
    assert.deepEqual(spoken('look at the eighth chapter of Romans'), ['Romans 8']);
  });

  test('spoken numbered books', () => {
    assert.deepEqual(spoken('first john four eight'), ['1 John 4:8']);
    assert.deepEqual(spoken('second timothy one seven'), ['2 Timothy 1:7']);
  });

  test('two bare numbers after a book name', () => {
    assert.deepEqual(spoken('John three sixteen'), ['John 3:16']);
    assert.deepEqual(spoken('Psalm one hundred nineteen verse one hundred five'), ['Psalms 119:105']);
  });

  test('spoken ranges', () => {
    assert.deepEqual(spoken('Romans chapter eight verses twenty eight through thirty one'), ['Romans 8:28–31']);
  });

  test('ordinary speech is left alone', () => {
    assert.deepEqual(spoken('and I want to talk about grace this morning'), []);
    assert.deepEqual(spoken('there were about five hundred people there'), []);
  });
});
