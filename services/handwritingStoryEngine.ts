// handwritingStoryEngine — the pure state machine behind Penna's Story Mode. The child handwrites
// the words of a public-domain fable one letter at a time; when a word's letters are all formed
// correctly, that word "counts" and paints in the next piece of the page's illustration; finishing
// every page completes the book (→ an achievement). This module owns the page → word → letter
// cursor and the progress math the view turns into the reveal and the reward. No React, no I/O,
// deterministic — unit-tested under node:test. Letters lacking a stroke model fall back to a
// forgiving "trace anything" in the view, so any word is writable.
//
//   npx tsx --test tests/handwritingStoryEngine.test.ts

export interface StoryPage {
  text: string;      // the sentence shown on the page (with normal capitalization/punctuation)
  words: string[];   // the words to write, in order, lowercased & letters-only
  scene: string;     // illustration scene id (the view draws it, revealed as words are written)
}

export interface Story {
  id: string;
  title: string;
  moral: string;
  source: string;        // e.g. "Aesop's Fables"
  license: 'PD';         // public domain only
  accent: string;        // theme accent for the reader
  pages: StoryPage[];
}

/** Cursor into a story: which page, which word on it, which letter of that word. */
export interface StoryPos { page: number; word: number; letter: number; }

export const START_POS: StoryPos = { page: 0, word: 0, letter: 0 };

/** Split a word into its writable letter characters (lowercased, letters only). */
export function wordLetters(word: string): string[] {
  return (word || '').toLowerCase().split('').filter(c => c >= 'a' && c <= 'z');
}

export function currentPage(story: Story, pos: StoryPos): StoryPage | undefined {
  return story.pages[pos.page];
}
export function currentWord(story: Story, pos: StoryPos): string | undefined {
  return currentPage(story, pos)?.words[pos.word];
}
/** The letter char the learner should be forming now, or null if none. */
export function currentLetterChar(story: Story, pos: StoryPos): string | null {
  const w = currentWord(story, pos);
  if (!w) return null;
  const letters = wordLetters(w);
  return letters[pos.letter] ?? null;
}

export interface AdvanceResult {
  pos: StoryPos;
  wordCompleted: boolean;
  pageCompleted: boolean;
  bookCompleted: boolean;
}

/**
 * Advance the cursor after the current letter is written correctly. Rolls a finished word to the
 * next word, a finished page to the next page, and reports book completion. Idempotent at the end:
 * once the book is complete it stays put.
 */
export function advanceLetter(story: Story, pos: StoryPos): AdvanceResult {
  const page = story.pages[pos.page];
  if (!page) return { pos, wordCompleted: false, pageCompleted: false, bookCompleted: true };

  const letters = wordLetters(page.words[pos.word] || '');
  const nextLetter = pos.letter + 1;

  if (nextLetter < letters.length) {
    return { pos: { ...pos, letter: nextLetter }, wordCompleted: false, pageCompleted: false, bookCompleted: false };
  }

  // word finished
  const nextWord = pos.word + 1;
  if (nextWord < page.words.length) {
    return { pos: { page: pos.page, word: nextWord, letter: 0 }, wordCompleted: true, pageCompleted: false, bookCompleted: false };
  }

  // page finished
  const nextPage = pos.page + 1;
  if (nextPage < story.pages.length) {
    return { pos: { page: nextPage, word: 0, letter: 0 }, wordCompleted: true, pageCompleted: true, bookCompleted: false };
  }

  // book finished — hold at the last position
  return { pos, wordCompleted: true, pageCompleted: true, bookCompleted: true };
}

/** How much of the current page's illustration is earned (0..1), by words written. */
export function pageProgress(story: Story, pos: StoryPos, bookDone = false): { wordsDone: number; totalWords: number; fraction: number } {
  const page = story.pages[pos.page];
  const totalWords = page ? page.words.length : 0;
  const wordsDone = bookDone ? totalWords : Math.min(pos.word, totalWords);
  return { wordsDone, totalWords, fraction: totalWords ? wordsDone / totalWords : 0 };
}

export const totalWords = (story: Story): number => story.pages.reduce((n, p) => n + p.words.length, 0);

/** Letters in the story that have no stroke model (informational — the view falls back for these). */
export function unmodeledLetters(story: Story, hasModel: (c: string) => boolean): string[] {
  const set = new Set<string>();
  for (const page of story.pages)
    for (const w of page.words)
      for (const c of wordLetters(w))
        if (!hasModel(c)) set.add(c);
  return [...set].sort();
}
