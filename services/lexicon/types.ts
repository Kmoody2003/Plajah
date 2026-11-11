/**
 * Lexicon — Plajah's dictionary, thesaurus, etymology, slang and multilingual word engine.
 *
 * Lives in Lorea (view LOREA_LEXICON) but is a platform service: any surface can call /api/lexicon,
 * use services/lexicon/client.ts, or fire `plajah:openLexicon` {word, lang?, tab?}.
 *
 * Pure types; no runtime deps, so parsers and the meaning-comparison engine test in plain node.
 *
 * Open sources only (see docs/LOREA_LEXICON.md):
 *   Wiktionary (CC BY-SA 4.0) — senses, labels, etymology, cognates, translations, IPA, audio
 *   Datamuse (free, WordNet-backed) — thesaurus relations, frequency
 *   Google Books Ngram (data CC BY 3.0) — usage across 1800–2019
 *   Grose, Dictionary of the Vulgar Tongue, 1811 (public domain, via Project Gutenberg) — historical slang
 *   Plajah community slang — moderated member submissions
 */

/** A run of definition text; `w` set when the run is a link to another headword. */
export interface Seg { t: string; w?: string; lang?: string }

export interface Sense {
  id: string;
  /** Definition as segments, so linked words are clickable. */
  text: Seg[];
  /** Labels such as "slang", "archaic", "figurative", "US". */
  labels: string[];
  examples: string[];
  /** "from 14th c." when Wiktionary carries {{defdate}}. */
  dated?: string;
  synonyms: string[];
  antonyms: string[];
  /** Depth 1 = top sense, 2 = subsense. */
  depth: number;
}

export interface PosBlock { pos: string; senses: Sense[]; forms?: string }

export type EtymRelation = 'inherited' | 'borrowed' | 'derived' | 'calque' | 'root' | 'compound' | 'learned' | 'semantic';

export interface EtymStep {
  lang: string;
  langName: string;
  word: string;
  gloss?: string;
  relation: EtymRelation;
}

export interface Cognate { lang: string; langName: string; word: string; gloss?: string }

export interface Etymology {
  /** Readable prose with templates rendered. */
  prose: Seg[];
  /** Ancestor chain, nearest first (Middle English → Old English → Proto-Germanic → PIE). */
  chain: EtymStep[];
  cognates: Cognate[];
  roots: EtymStep[];
  doublets: string[];
  /** "first attested 1340" style notes pulled from the prose. */
  attested?: string;
}

export interface Pronunciation { ipa: string[]; audio: { file: string; url: string; accent?: string }[]; rhymes?: string; syllables?: string }

export interface Translation { lang: string; langName: string; word: string; gender?: string; tr?: string; note?: string }

export interface TranslationSense { gloss: string; items: Translation[] }

/** One language section of a Wiktionary page ("gift" has English, German, Danish, Swedish…). */
export interface LangEntry {
  lang: string;
  langName: string;
  etymologies: { etymology?: Etymology; pos: PosBlock[] }[];
  pronunciation?: Pronunciation;
  synonyms: string[];
  antonyms: string[];
  derived: string[];
  related: string[];
  descendants: Translation[];
  translations: TranslationSense[];
}

export interface WordEntry {
  word: string;
  /** The page actually found (case may differ from what was typed). */
  title: string;
  langs: LangEntry[];
  source: { wiktionaryUrl: string; revision?: number; fetchedAt: number };
}

export type ThesaurusRelation = 'synonym' | 'antonym' | 'similar' | 'broader' | 'narrower' | 'partOf' | 'hasPart' | 'triggers' | 'rhyme' | 'sounds';

export interface ThesaurusNode { word: string; relation: ThesaurusRelation; score: number; pos?: string; freq?: number; source: 'wiktionary' | 'datamuse' }

export interface UsagePoint { year: number; perMillion: number }

export interface SlangEntry {
  id: string;
  word: string;
  meaning: string;
  example?: string;
  source: 'community' | 'wiktionary' | 'grose1811';
  era?: string;
  region?: string;
  explicit: boolean;
  votes?: number;
  byName?: string;
  createdAt?: number;
}

/** How a word in another language relates to the looked-up word. */
export type Kinship = 'same' | 'shifted' | 'drifted' | 'false-friend' | 'unrelated';

export interface KinshipVerdict {
  lang: string;
  langName: string;
  word: string;
  gloss: string;
  kinship: Kinship;
  /** 0..1 meaning overlap with the closest home sense. */
  overlap: number;
  closestSense?: string;
  sharedOrigin: boolean;
  why: string;
}

/** Per-language view of how the home word's senses split across that language's words. */
export interface PrismRow {
  lang: string;
  langName: string;
  /** cells[i] = words used for home sense i (empty = no data). */
  cells: string[][];
  /** Distinct words used across all senses. */
  distinct: number;
  /** "splits" = needs several words for what English says with one; "mirrors" = one word covers them all. */
  shape: 'mirrors' | 'splits' | 'partial';
}

export interface MeaningPrism { senses: string[]; rows: PrismRow[] }

export interface SenseAlignment { a: string; b: string; overlap: number }

export interface CompareResult {
  a: { word: string; lang: string; senses: string[] };
  b: { word: string; lang: string; senses: string[] };
  pairs: SenseAlignment[];
  /** Overall 0..1 similarity. */
  score: number;
  verdict: Kinship;
  sharedOrigin: boolean;
  summary: string;
  /** An obsolete/archaic sense that still carries the shared meaning (German Gift → "gift; something given"). */
  echo?: SenseAlignment;
}

export type LexiconTab = 'meaning' | 'thesaurus' | 'origins' | 'languages' | 'slang' | 'life';
