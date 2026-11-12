/**
 * Terra Law Library — shared types.
 *
 * Laws are stored as a provision tree (code → chapter → act → division → section) with stable ids,
 * the same shape the Terra Civic blueprint (docs/TERRA_CIVIC_FORUM_BLUEPRINT.md §2, §8) builds on.
 *
 * ── Honesty rules ───────────────────────────────────────────────────────────
 * - Every page renders as an UNOFFICIAL copy with its source and "current through" line.
 * - Text is never paraphrased in these records. Body blocks carry the source text verbatim; inline
 *   markup is reduced to plain text (emphasis is kept as a flag, never re-worded).
 * - Bold catchlines, history and compiler's notes are editorial matter of the source, not law, and
 *   are labelled that way in the UI.
 */

export type LawJurisdiction = 'mi';

/** One block of section body text, in source order. */
export type LawBlock =
  | { t: 'p'; text: string; /** e.g. "(1)", "(a)" */ num?: string; heading?: string; /** nesting depth from the source markup */ depth?: number }
  | { t: 'table'; rows: string[][] }
  | { t: 'pre'; text: string };

export interface LawSection {
  k: 'sec';
  /** Stable id, e.g. "mcl-125.3101" or "const-I-1". */
  id: string;
  /** Citation number as the source prints it, e.g. "125.3101". */
  num: string;
  /** Section label inside its act, e.g. "101" (Sec. 101). */
  label?: string;
  /** Catchline — the source's short title for the section (editorial, not law). */
  catch: string;
  body: LawBlock[];
  /** Enactment/amendment history lines, verbatim. */
  hist: string[];
  /** Compiler's / editor's notes, verbatim. */
  notes: string[];
  repealed?: boolean;
}

export interface LawDivision {
  k: 'div';
  /** "Article", "Part", "Chapter", "Division", "Subpart"… as the source names it. */
  type: string;
  number: string;
  title: string;
  /** Introductory text printed under the division heading, if any. */
  intro?: string;
  repealed?: boolean;
  children: LawNode[];
}

export interface LawAct {
  k: 'act';
  /** "Act 110 of 2006" */
  name: string;
  /** "MICHIGAN ZONING ENABLING ACT" */
  heading: string;
  longTitle?: string;
  shortTitle?: string;
  repealed?: boolean;
  children: LawNode[];
}

export type LawNode = LawAct | LawDivision | LawSection;

export interface LawChapter {
  jurisdiction: LawJurisdiction;
  code: 'mcl';
  /** Chapter number as a string ("125"). */
  n: string;
  title: string;
  repealed?: boolean;
  children: LawNode[];
}

export interface ConstitutionArticle {
  /** "I" … "XII", or "Schedule" */
  n: string;
  title: string;
  intro?: string;
  sections: LawSection[];
}

export interface Constitution {
  jurisdiction: LawJurisdiction;
  title: string;
  preamble?: string;
  articles: ConstitutionArticle[];
}

/** Lightweight row for client-side search: [id, num, catchline, context, chapter]. */
export type LawSearchRow = [string, string, string, string, string];

export interface LawLibraryIndex {
  jurisdiction: LawJurisdiction;
  name: string;
  source: { publisher: string; url: string; retrievedAt: string; currentThrough?: string; notice: string };
  chapters: { n: string; title: string; acts: number; sections: number; repealed?: boolean }[];
  constitution?: { articles: { n: string; title: string; sections: number }[] };
  totals: { chapters: number; acts: number; sections: number };
}

/** Official page for a section on the Legislature's site (for "verify on the official source"). */
export function officialUrlFor(id: string): string | null {
  if (id.startsWith('mcl-')) return `https://legislature.mi.gov/Laws/MCL?objectName=mcl-${id.slice(4).replace(/\./g, '-')}`;
  const m = /^const-([^-]+)-(.+)$/.exec(id);
  if (m && m[1] === 'Schedule') return `https://legislature.mi.gov/Laws/MCL?objectName=mcl-Schedule-${m[2] === 'vote-record' ? 'SigBlock' : m[2]}`;
  if (m) return `https://legislature.mi.gov/Laws/MCL?objectName=mcl-Article-${m[1]}-${m[2]}`;
  return null;
}
