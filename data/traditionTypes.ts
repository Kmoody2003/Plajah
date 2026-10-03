/**
 * Tradition layer: faith-based connections that a school or family can switch on (see
 * services/schoolProfile.ts). The layer is ADDITIVE and perspective-labelled: it never changes the
 * facts of a lesson, it adds "here is how this connects to scripture / the tradition".
 *
 * Accuracy rules for every note:
 *  - Scripture references must be real (book, chapter and verse exist) and are validated by code and tests.
 *  - A connection is either one the author explicitly intended (an allusion, an epigraph, a named source)
 *    or a widely recognised literary or historical echo. Never forced.
 *  - The `connection` text is written from within the tradition, in the voice of "Christians read this as...",
 *    "In Catholic tradition...", or "The author alludes to...". It must not make claims about secular
 *    history, science or the book's facts that a standard reference would contradict.
 *  - No denominational polemics. Where Catholic, Protestant and Orthodox canons differ (deuterocanonical
 *    books), say so plainly rather than hiding it.
 */
export type TraditionFamily = 'christian';

export interface TraditionNote {
  /** Learn-map course id, e.g. 'classic-literature', 'lab-history', 'civics-hall'. */
  courseId: string;
  /** Lesson id inside that course (for classics, the Gutenberg id string). */
  lessonId: string;
  tradition: TraditionFamily;
  /** echo = the work alludes to or retells a passage; context = scripture the history/idea grows from; church-history = a Church event or figure; devotional = a passage for reflection. */
  kind: 'echo' | 'context' | 'church-history' | 'devotional';
  /** Real references in plain form, e.g. 'John 11:1-44', 'Luke 10:25-37', 'Tobit 1:1' for deuterocanonical. */
  passages: string[];
  /** One or two sentences, perspective-labelled. */
  connection: string;
  /** Present only when the passage is deuterocanonical or the canons differ. */
  canonNote?: string;
}

export interface FaithReading {
  /** Project Gutenberg ebook number as a string. MUST be verified against gutenberg.org. */
  gutenbergId: string;
  title: string;
  author: string;
  /** Who it suits. 'all-christian' = broadly shared. */
  traditions: Array<'catholic' | 'protestant' | 'orthodox' | 'all-christian'>;
  gradeBand: '3-5' | '6-8' | '9-12' | 'college';
  /** One sentence on why it is worth reading, in the tradition's own terms. */
  why: string;
}
