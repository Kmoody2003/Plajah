// Deterministic reading-level checks for the showcase books. These do not judge quality (a person or model does that); they make sure a
// book written for a 2-year-old is not accidentally written for an 8-year-old, and that nothing leaked in from another book.
import type { ShowcaseBook } from '../../data/showcase/types';

const words = (t: string): string[] => (t.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []);

/** Rough English syllable counter (good enough for grade estimates on children's text). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

/** Sentences end at . ! ? (an ellipsis or a bare line break does not end one, so verse-like lines stay together). */
export function sentences(text: string): string[] {
  return text.replace(/\.\.\./g, '…').split(/(?<=[.!?])\s+|\n(?=[A-Z"])/).map(s => s.trim()).filter(s => words(s).length > 0);
}

export interface StoryMetrics {
  totalWords: number; storyWords: number; sentenceCount: number; avgSentenceWords: number; longestSentenceWords: number;
  fkGrade: number; maxWordsOnASpread: number; uniqueWordRatio: number; refrainCount: number;
}

export function measure(book: ShowcaseBook): StoryMetrics {
  const story = book.spreads.filter(s => s.beat !== 'cover' && s.beat !== 'back' && s.beat !== 'activity');
  const text = story.map(s => s.text).join('\n');
  const w = words(text), sents = sentences(text);
  const syl = w.reduce((n, x) => n + syllables(x), 0);
  const asl = sents.length ? w.length / sents.length : 0;
  const fk = 0.39 * asl + 11.8 * (w.length ? syl / w.length : 0) - 15.59;
  const perSpread = story.map(s => words(s.text).length);
  const refrain = (book.refrain ?? '').toLowerCase().replace(/[.!?]$/, '');
  return {
    totalWords: words(book.spreads.map(s => s.text).join('\n')).length,
    storyWords: w.length,
    sentenceCount: sents.length,
    avgSentenceWords: +asl.toFixed(1),
    longestSentenceWords: Math.max(0, ...sents.map(s => words(s).length)),
    fkGrade: +fk.toFixed(1),
    maxWordsOnASpread: Math.max(0, ...perSpread),
    uniqueWordRatio: +(new Set(w).size / Math.max(1, w.length)).toFixed(2),
    refrainCount: refrain ? text.toLowerCase().split(refrain).length - 1 : 0,
  };
}

/** What each band allows. Guard rails tuned to the book's real audience, not a standard. */
export const BAND_LIMITS: Record<ShowcaseBook['band'], { minWords: number; maxWords: number; maxAvgSentence: number; maxLongest: number; maxFk: number; maxPerSpread: number }> = {
  'toddler':       { minWords: 50,  maxWords: 150,  maxAvgSentence: 7,  maxLongest: 12, maxFk: 1.5, maxPerSpread: 26 },
  'preschool':     { minWords: 120, maxWords: 260,  maxAvgSentence: 9,  maxLongest: 18, maxFk: 2.5, maxPerSpread: 42 },
  'early-picture': { minWords: 200, maxWords: 420,  maxAvgSentence: 10, maxLongest: 24, maxFk: 3.5, maxPerSpread: 70 },
  'picture':       { minWords: 330, maxWords: 560,  maxAvgSentence: 12, maxLongest: 30, maxFk: 4.5, maxPerSpread: 85 },
  'read-alone':    { minWords: 450, maxWords: 800,  maxAvgSentence: 14, maxLongest: 34, maxFk: 5.5, maxPerSpread: 110 },
  'story':         { minWords: 650, maxWords: 1250, maxAvgSentence: 16, maxLongest: 40, maxFk: 6.5, maxPerSpread: 135 },
};

/** Names that must only appear in their own book (catches copy leaking between templates). */
export function ownedNames(book: ShowcaseBook): string[] {
  // Generic "The ..." characters (The Moon, The Big Trees, The jellies) are common nouns many books may use; only proper names are protected.
  return book.characters.filter(c => !/^the\s/i.test(c.name)).map(c => c.name.replace(/^Mama\s+/i, '')).filter(n => n.length > 2);
}
