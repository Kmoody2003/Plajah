// Tests for Penna's Story-Mode engine + fable library.
//
// The state machine drives the whole mode: a wrong roll-over would strand a child mid-word, reveal
// the wrong amount of art, or never fire the book achievement. So these walk a real story letter by
// letter and assert the word/page/book boundaries and the reveal fraction, plus that every fable is
// well-formed public-domain data.
//
//   npx tsx --test tests/handwritingStoryEngine.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  START_POS, wordLetters, currentLetterChar, currentWord, advanceLetter, pageProgress, totalWords,
  unmodeledLetters, type Story, type StoryPos,
} from '../services/handwritingStoryEngine';
import { HANDWRITING_STORIES, storyById } from '../data/handwritingStories';
import { letterByKey } from '../data/handwritingLetters';

const STORY: Story = {
  id: 't', title: 'T', moral: 'm', source: 's', license: 'PD', accent: '#000',
  pages: [
    { text: 'a b', words: ['a', 'b'], scene: 's1' },   // 1 + 1 letters
    { text: 'cd', words: ['cd'], scene: 's2' },         // 2 letters
  ],
};

/** Walk the whole story, calling advanceLetter once per letter; collect the boundary events. */
function walk(story: Story) {
  let pos: StoryPos = { ...START_POS };
  const events: string[] = [];
  let guard = 0;
  while (guard++ < 200) {
    const r = advanceLetter(story, pos);
    if (r.wordCompleted) events.push('word');
    if (r.pageCompleted) events.push('page');
    if (r.bookCompleted) { events.push('book'); break; }
    pos = r.pos;
  }
  return events;
}

// ── letter splitting ────────────────────────────────────────────────────────────────

test('wordLetters keeps only a–z, lowercased', () => {
  assert.deepEqual(wordLetters('The'), ['t', 'h', 'e']);
  assert.deepEqual(wordLetters("don't!"), ['d', 'o', 'n', 't']);
  assert.deepEqual(wordLetters('123'), []);
});

// ── the cursor ────────────────────────────────────────────────────────────────────

test('currentWord / currentLetterChar read the cursor', () => {
  assert.equal(currentWord(STORY, START_POS), 'a');
  assert.equal(currentLetterChar(STORY, START_POS), 'a');
  assert.equal(currentLetterChar(STORY, { page: 1, word: 0, letter: 1 }), 'd');
});

test('advancing the last letter of a one-letter word completes the word', () => {
  const r = advanceLetter(STORY, START_POS);
  assert.equal(r.wordCompleted, true);
  assert.equal(r.pageCompleted, false);
  assert.deepEqual(r.pos, { page: 0, word: 1, letter: 0 });
});

test('finishing the last word of a page rolls to the next page', () => {
  const r = advanceLetter(STORY, { page: 0, word: 1, letter: 0 });
  assert.equal(r.pageCompleted, true);
  assert.equal(r.bookCompleted, false);
  assert.deepEqual(r.pos, { page: 1, word: 0, letter: 0 });
});

test('a multi-letter word advances letter by letter before completing', () => {
  const mid = advanceLetter(STORY, { page: 1, word: 0, letter: 0 }); // c -> d
  assert.equal(mid.wordCompleted, false);
  assert.deepEqual(mid.pos, { page: 1, word: 0, letter: 1 });
  const end = advanceLetter(STORY, mid.pos); // d -> book done
  assert.equal(end.bookCompleted, true);
});

test('walking the whole story fires the right boundary sequence', () => {
  // page0: "a"(word) "b"(word,page) ; page1: "c" "d"(word,page,book)
  assert.deepEqual(walk(STORY), ['word', 'word', 'page', 'word', 'page', 'book']);
});

test('pageProgress reports the earned fraction of the illustration', () => {
  assert.deepEqual(pageProgress(STORY, { page: 0, word: 0, letter: 0 }), { wordsDone: 0, totalWords: 2, fraction: 0 });
  assert.deepEqual(pageProgress(STORY, { page: 0, word: 1, letter: 0 }), { wordsDone: 1, totalWords: 2, fraction: 0.5 });
  assert.deepEqual(pageProgress(STORY, { page: 1, word: 0, letter: 0 }, true), { wordsDone: 1, totalWords: 1, fraction: 1 });
});

test('totalWords counts every word across pages', () => {
  assert.equal(totalWords(STORY), 3);
});

// ── the fable library ────────────────────────────────────────────────────────────────

test('every fable is well-formed, public-domain data', () => {
  assert.ok(HANDWRITING_STORIES.length >= 1);
  const ids = new Set<string>();
  for (const st of HANDWRITING_STORIES) {
    assert.equal(st.license, 'PD', `${st.id} must be public domain`);
    assert.ok(st.title && st.moral && st.source, `${st.id} missing metadata`);
    assert.ok(!ids.has(st.id), `duplicate story id ${st.id}`); ids.add(st.id);
    assert.ok(st.pages.length >= 1, `${st.id} has no pages`);
    for (const pg of st.pages) {
      assert.ok(pg.words.length >= 1, `${st.id} page has no words`);
      assert.ok(pg.scene, `${st.id} page missing a scene id`);
      for (const w of pg.words) assert.ok(wordLetters(w).length >= 1, `${st.id} word "${w}" has no writable letters`);
    }
  }
});

test('storyById resolves a known story', () => {
  assert.ok(storyById('ant-and-grasshopper'));
  assert.equal(storyById('nope'), undefined);
});

test('report which fable letters lack a stroke model (informational)', () => {
  const hasModel = (c: string) => !!letterByKey(c);
  for (const st of HANDWRITING_STORIES) {
    const missing = unmodeledLetters(st, hasModel);
    // Not a failure — the reader falls back for these — but the featured fables should be
    // MOSTLY modeled, so flag if a story is more than half unmodeled letters.
    const distinct = new Set(st.pages.flatMap(p => p.words).flatMap(w => wordLetters(w)));
    assert.ok(missing.length <= distinct.size / 2, `${st.id}: too many unmodeled letters ${missing.join('')}`);
  }
});
