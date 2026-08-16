// gutenbergImport tests — boilerplate stripping and the K-12 shelf.
//
// The stripping is the risky part: cut too little and every book opens on Gutenberg's licence
// instead of the story; cut too much and the book is quietly truncated. Both fail silently,
// because a shorter-but-still-long text looks perfectly fine in a reader.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripGutenbergBoilerplate, buildGutenbergText, countChapters, addLessonChapters,
  type GutenbergBook,
} from '../services/gutenbergImport';
import {
  GUTENBERG_K12, MCGUFFEY_READERS, GUTENBERG_LITERATURE,
  gutenbergBookId, gutenbergByBand,
} from '../data/gutenbergK12';
import type { GradeBand } from '../data/oerLibrary';

const BOOK: GutenbergBook = {
  id: 1342, title: 'Pride and Prejudice', authors: ['Jane Austen'],
  textUrl: 'https://example.invalid/1342.txt', subjects: [],
};

// ── Boilerplate ─────────────────────────────────────────────────────────────────

test('the modern start/end markers are removed with the licence text', () => {
  const raw = [
    'The Project Gutenberg eBook of Pride and Prejudice',
    'This ebook is for the use of anyone anywhere at no cost...',
    '*** START OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***',
    '',
    'Chapter I',
    '',
    'It is a truth universally acknowledged...',
    '',
    '*** END OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***',
    'Updated editions will replace the previous one...',
  ].join('\n');

  const out = stripGutenbergBoilerplate(raw);
  assert.ok(out.startsWith('Chapter I'), `began with: ${out.slice(0, 40)}`);
  assert.ok(out.includes('truth universally acknowledged'));
  assert.ok(!out.includes('for the use of anyone anywhere'));
  assert.ok(!out.includes('Updated editions'));
});

test('the older SMALL PRINT marker is handled too', () => {
  const raw = [
    'legal preamble here',
    '*END*THE SMALL PRINT! FOR PUBLIC DOMAIN ETEXTS*Ver.04.29.93*END*',
    '',
    'CHAPTER I',
    'The real text begins.',
    "End of Project Gutenberg's Something, by Someone",
    'trailing legalese',
  ].join('\n');
  const out = stripGutenbergBoilerplate(raw);
  assert.ok(out.startsWith('CHAPTER I'));
  assert.ok(!out.includes('legal preamble'));
  assert.ok(!out.includes('trailing legalese'));
});

test('text with no markers is returned intact rather than truncated', () => {
  // Silently dropping a book because a pattern didn't match would be far worse than
  // leaving a licence header in it.
  const raw = 'Chapter I\n\nA book with no Gutenberg markers at all.';
  assert.equal(stripGutenbergBoilerplate(raw), raw);
});

test('carriage returns are normalised so headings still anchor to line starts', () => {
  const raw = '*** START OF THE PROJECT GUTENBERG EBOOK X ***\r\n\r\nCHAPTER I\r\n\r\nBody.';
  const out = stripGutenbergBoilerplate(raw);
  assert.ok(!out.includes('\r'));
  assert.equal(countChapters(out), 1, 'a \\r before the newline would break the ^…$ match');
});

// ── Assembly ────────────────────────────────────────────────────────────────────

test("the source's own chapter headings survive assembly", () => {
  // Unlike OpenStax, Gutenberg texts already carry the structure BookReader looks for —
  // this module must preserve it, never disguise it.
  const body = 'CHAPTER I\n\nFirst.\n\nCHAPTER II\n\nSecond.\n\nCHAPTER III\n\nThird.';
  assert.equal(countChapters(buildGutenbergText(BOOK, body)), 3);
});

test('attribution and the free-to-read policy head the file', () => {
  const text = buildGutenbergText(BOOK, 'CHAPTER I\n\nBody.');
  assert.match(text, /^Pride and Prejudice — Jane Austen/);
  assert.match(text, /gutenberg\.org\/ebooks\/1342/);
  assert.match(text, /Public domain\. No restrictions on use\./);
  assert.match(text, /Plajah does not charge for textbooks\./);
});

test('the attribution header does not invent a chapter', () => {
  assert.equal(countChapters(buildGutenbergText(BOOK, 'Body with no chapters.')), 0);
});

// ── Lesson headings ─────────────────────────────────────────────────────────────

test('lesson headings gain a recognised heading above them, text unchanged', () => {
  const body = 'LESSON I.\n\nThe cat ran.\n\nLESSON II.\n\nThe dog sat.\n\nLESSON III.\n\nThe hen ran.';
  const { text, added } = addLessonChapters(body);
  assert.equal(added, 3);
  assert.equal(countChapters(text), 3, 'the inserted headings must match the reader');
  // The author's own headings survive — nothing is rewritten, only added above.
  assert.ok(text.includes('LESSON I.'));
  assert.ok(text.includes('LESSON II.'));
  assert.ok(text.includes('The cat ran.'));
  assert.match(text, /Section 1 — LESSON I\./);
  assert.match(text, /Section 2 — LESSON II\./);
});

test('fewer than three headings is not treated as a structure', () => {
  // Two matches are as likely to be coincidence as structure; demanding three is what stops a
  // stray numeral shredding a book into false chapters.
  assert.equal(addLessonChapters('LESSON I.\n\nx\n\nLESSON II.\n\ny').added, 0);
});

test('a stray number before the real headings does not suppress them', () => {
  // The Scarlet Letter prints "1878." before chapter "I.". Anchoring on that first number
  // rejected every genuine heading after it and left the book with no contents at all.
  const body = '1878.\n\nPreamble.\n\nI.\n\nFirst.\n\nII.\n\nSecond.\n\nIII.\n\nThird.\n\nIV.\n\nFourth.';
  assert.ok(addLessonChapters(body).added >= 4, 'the four roman chapters must survive the stray year');
});

test('a book with no lessons is returned untouched', () => {
  const body = 'CHAPTER I\n\nOnce upon a time.';
  const { text, added } = addLessonChapters(body);
  assert.equal(added, 0);
  assert.equal(text, body);
});

test('arabic-numbered lessons work as well as roman', () => {
  assert.equal(addLessonChapters('LESSON 1.\n\nx\n\nLESSON 2.\n\ny\n\nLESSON 3.\n\nz').added, 3);
});

test('word-numbered chapters are recognised and ordered', () => {
  // Little Women numbers in words; without this its 47 chapters were read as 2.
  const body = ['CHAPTER ONE PLAYING PILGRIMS', 'a', 'CHAPTER TWO A MERRY CHRISTMAS', 'b',
    'CHAPTER THREE THE LAURENCE BOY', 'c', 'CHAPTER FOUR BURDENS', 'd'].join('\n\n');
  const { text, added } = addLessonChapters(body);
  assert.equal(added, 4);
  assert.match(text, /Section 1 — CHAPTER ONE PLAYING PILGRIMS/);
  assert.match(text, /Section 4 — CHAPTER FOUR BURDENS/);
});

test('an unknown word after the keyword is not a chapter number', () => {
  // "CHAPTER SUMMARY" must not be numbered — only real number-words count.
  assert.equal(addLessonChapters('CHAPTER SUMMARY\n\na\n\nCHAPTER NOTES\n\nb\n\nCHAPTER INDEX\n\nc').added, 0);
});

test('indented and non-standard headings are recognised', () => {
  // Two real cases from the shelf: an INDENTED "CHAPTER I" (indentation alone defeats the
  // reader's ^ anchor) and A Christmas Carol's "Stave", a word the reader does not know.
  assert.equal(addLessonChapters('   CHAPTER I\n\na\n\n   CHAPTER II\n\nb\n\n   CHAPTER III\n\nc').added, 3);
  assert.equal(addLessonChapters('Stave I: Marley\n\na\n\nStave II: Spirits\n\nb\n\nStave III: End\n\nc').added, 3);
});

test('a lesson reference inside a sentence is not a heading', () => {
  // The pattern anchors to a whole line, so prose mentioning a lesson is left alone.
  const { added } = addLessonChapters('See LESSON IV. for more practice on this sound.');
  assert.equal(added, 0);
});

// ── The shelf ───────────────────────────────────────────────────────────────────

test('every seeded title has a unique id, a band and a subject', () => {
  const ids = GUTENBERG_K12.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate Gutenberg id in the shelf');
  for (const b of GUTENBERG_K12) {
    assert.ok(b.id > 0, `${b.title} has no Gutenberg id`);
    assert.ok(b.gradeBands.length, `${b.title} has no grade band`);
    assert.ok(b.subjects.length, `${b.title} has no subject`);
  }
});

test('all four grade bands are covered', () => {
  for (const band of ['K-2', '3-5', '6-8', '9-12'] as GradeBand[]) {
    assert.ok(gutenbergByBand(band).length > 0, `nothing seeded for ${band}`);
  }
});

test('every McGuffey reader is marked a period piece, and no literature is', () => {
  // These are 19th-century schoolbooks. The flag is what lets the UI say so rather than
  // presenting them as current material.
  for (const b of MCGUFFEY_READERS) assert.equal(b.periodPiece, true, `${b.title} not flagged`);
  for (const b of GUTENBERG_LITERATURE) assert.notEqual(b.periodPiece, true, `${b.title} wrongly flagged`);
});

test('the graded readers run in order across the bands', () => {
  assert.equal(MCGUFFEY_READERS.length, 6);
  assert.ok(MCGUFFEY_READERS[0].gradeBands.includes('K-2'), 'the First Reader should start at K-2');
  assert.ok(MCGUFFEY_READERS[5].gradeBands.includes('6-8'), 'the Sixth Reader should reach 6-8');
});

test('album ids are deterministic and namespaced', () => {
  assert.equal(gutenbergBookId(1342), 'gutenberg_1342');
  // Must not collide with the OpenStax namespace.
  assert.ok(!gutenbergBookId(1342).startsWith('openstax_'));
});
