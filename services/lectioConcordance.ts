import type { SearchHit } from './scriptureText';

export type MatchMode = 'word' | 'phrase' | 'all' | 'any' | 'prefix';
export const tokenize = (text: string, ignoreAccents = false): string[] => {
  const normalized = ignoreAccents ? text.normalize('NFD').replace(/\p{M}/gu, '') : text.normalize('NFC');
  return normalized.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) ?? [];
};
export interface ConcordanceFilters { book?: number; testament?: 'OT' | 'NT'; fromChapter?: number; toChapter?: number; exclude?: string; }
interface IndexedVerse extends SearchHit { tokens: string[]; }
export interface ConcordanceIndex { verses: IndexedVerse[]; postings: Map<string, Set<number>>; ignoreAccents: boolean; }
export function buildConcordanceIndex(hits: SearchHit[], ignoreAccents = false): ConcordanceIndex {
  const verses = hits.map(hit => ({ ...hit, tokens: tokenize(hit.text, ignoreAccents) }));
  const postings = new Map<string, Set<number>>();
  verses.forEach((verse, index) => new Set(verse.tokens).forEach(token => {
    const posting = postings.get(token) ?? new Set<number>(); posting.add(index); postings.set(token, posting);
  }));
  return { verses, postings, ignoreAccents };
}
function countTokens(words: string[], terms: string[], mode: MatchMode): number {
  if (!terms.length || ((mode === 'word' || mode === 'prefix') && terms.length !== 1)) return 0;
  if (mode === 'phrase') return words.reduce((n, _, i) => n + Number(terms.every((term, j) => words[i + j] === term)), 0);
  if (mode === 'prefix') return words.filter(word => word.startsWith(terms[0])).length;
  const unique = new Set(terms);
  if (mode === 'all' && ![...unique].every(term => words.includes(term))) return 0;
  return words.filter(word => unique.has(word)).length;
}

/** Translation surface forms only: never infer lemmas or theological equivalence. */
export function occurrenceCount(text: string, query: string, mode: MatchMode): number {
  return countTokens(tokenize(text), tokenize(query), mode);
}

export function concordance(hits: SearchHit[], query: string, mode: MatchMode, book?: number) {
  return searchConcordanceIndex(buildConcordanceIndex(hits), query, mode, { book });
}
export function searchConcordanceIndex(index: ConcordanceIndex, query: string, mode: MatchMode, filters: ConcordanceFilters = {}) {
  const terms = tokenize(query, index.ignoreAccents), unique = [...new Set(terms)];
  const exclude = tokenize(filters.exclude ?? '', index.ignoreAccents);
  let candidates = new Set<number>();
  if (mode === 'prefix' && terms.length === 1) {
    for (const [token, postings] of index.postings) if (token.startsWith(terms[0])) for (const i of postings) candidates.add(i);
  } else if (mode === 'any') {
    for (const term of unique) for (const i of index.postings.get(term) ?? []) candidates.add(i);
  } else if (unique.length && !(mode === 'word' && terms.length !== 1)) {
    const postings = unique.map(term => index.postings.get(term) ?? new Set<number>()).sort((a, b) => a.size - b.size);
    candidates = new Set([...postings[0]].filter(i => postings.every(posting => posting.has(i))));
  }
  const matches = [...candidates].sort((a, b) => a - b).map(i => index.verses[i]).filter(hit =>
    (!filters.book || hit.ref.book === filters.book) && (!filters.testament || (hit.ref.book >= 40 && hit.ref.book <= 66 ? 'NT' : 'OT') === filters.testament) &&
    (!filters.fromChapter || hit.ref.chapter >= filters.fromChapter) && (!filters.toChapter || hit.ref.chapter <= filters.toChapter) &&
    !exclude.some(term => hit.tokens.includes(term)))
    .map(({ tokens, ...hit }) => ({ ...hit, occurrences: countTokens(tokens, terms, mode) })).filter(hit => hit.occurrences > 0);
  const books = new Map<number, { name: string; verses: number; occurrences: number }>();
  for (const hit of matches) {
    const summary = books.get(hit.ref.book) ?? { name: hit.ref.bookName, verses: 0, occurrences: 0 };
    summary.verses++; summary.occurrences += hit.occurrences; books.set(hit.ref.book, summary);
  }
  return { matches, books: [...books.entries()], occurrences: matches.reduce((n, h) => n + h.occurrences, 0) };
}
