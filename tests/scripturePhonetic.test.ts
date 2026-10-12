// Phonetic book correction for spoken references (auto-scripture).
// Run with: npx tsx --test tests/scripturePhonetic.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findRefs, formatRef, normalizeSpoken } from '../services/scriptureRef';

const heard = (s: string) => {
  const r = findRefs(normalizeSpoken(s));
  return r.length ? formatRef(r[0], 'display') : null;
};

describe('mis-heard book names resolve to the closest-sounding book', () => {
  const cases: Array<[string, string]> = [
    ['turn with me to collisions three sixteen', 'Colossians 3:16'],
    ['fill a pians four thirteen', 'Philippians 4:13'],
    ['jenna says one one', 'Genesis 1:1'],
    ['romance eight twenty eight', 'Romans 8:28'],
    ['open to he brews eleven one', 'Hebrews 11:1'],
    ['duderonomy six four', 'Deuteronomy 6:4'],
    ['is equal thirty seven one', 'Ezekiel 37:1'],
    ['the salonians four sixteen', '1 Thessalonians 4:16'],
    ['a fusions two eight', 'Ephesians 2:8'],
    ['matthew 5 3', 'Matthew 5:3'],
    ['galations five twenty two', 'Galatians 5:22'],
    ['revelations twenty one four', 'Revelation 21:4'],
    ['jeremiah twenty nine eleven', 'Jeremiah 29:11'],
    ['proverb three five', 'Proverbs 3:5'],
    ['phillipians four six', 'Philippians 4:6'],
    ['lamentation three twenty two', 'Lamentations 3:22'],
    ['nehemiah eight ten', 'Nehemiah 8:10'],
    ['zachariah four six', 'Zechariah 4:6'],
    ['habakuk two four', 'Habakkuk 2:4'],
    ['levitikus nineteen eighteen', 'Leviticus 19:18'],
    ['dutronomy thirty one six', 'Deuteronomy 31:6'],
    ['isiah forty thirty one', 'Isaiah 40:31'],
    ['colossian three twenty three', 'Colossians 3:23'],
  ];
  for (const [said, want] of cases) test(`"${said}" → ${want}`, () => assert.equal(heard(said), want));
});

describe('a forgotten ordinal means the first book', () => {
  test('corinthians 13 4', () => assert.equal(heard('corinthians thirteen four'), '1 Corinthians 13:4'));
  test('second still respected', () => assert.equal(heard('second corinthians five seventeen'), '2 Corinthians 5:17'));
  test('timothy', () => assert.equal(heard('timothy four twelve'), '1 Timothy 4:12'));
  test('peter', () => assert.equal(heard('peter five seven'), '1 Peter 5:7'));
});

describe('first number = chapter, second = verse', () => {
  test('two numbers', () => assert.equal(heard('psalm twenty three one'), 'Psalms 23:1'));
});

describe('ordinary speech is left alone', () => {
  for (const s of ['we have two three options', 'i was five six years old', 'about 2 3 people came', 'see you at 10 30']) {
    test(s, () => assert.equal(heard(s), null));
  }
});
