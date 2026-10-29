// ─────────────────────────────────────────────────────────────────────────────
// publicDomainRights — one place that answers "is this music free, and where?"
//
// Every shelf, search and label that claims public domain status asks this
// module rather than carrying its own date ceiling. Before it existed the Chora
// library hard-coded a "pre-1929" recording rule, which is the rule for
// COMPOSITIONS, not recordings — and let 1926–1928 sides through as free.
//
// Two separate rights, never confused:
//   • the COMPOSITION (melody, lyrics, the score), and
//   • the SOUND RECORDING (one performance captured on a disc or file).
// A Bach fugue is free; a 2004 recording of it is not. A 1924 record of a 1930
// song is the reverse case and cannot happen, but a 1925 record of a song whose
// composer died in 1960 can — the record is free in the US and the song is not
// free in Europe. Callers should ask about both when they ship both.
//
// The rules (all expiry runs to the END of the calendar year, so a work becomes
// free on 1 January of the following year):
//   US compositions   published ≤ 1926 are free; 1927–1977 run 95 years from
//                     publication. Works never renewed may be free earlier — we
//                     do not model that, so this only ever errs towards caution.
//   US recordings     (Music Modernization Act, 2018) pre-1923 free since 2022;
//                     1923–1946 run 100 years; 1947–1956 run 110 years;
//                     1957–1972 all run to 15 Feb 2067; later ones 95 years.
//   Life + N          most of the world counts from the composer's death. Several
//                     countries lengthened their term WITHOUT reviving works that
//                     were already free — `freeIfDiedBy` carries that rule.
//   EU/UK recordings  70 years from publication, except recordings whose old
//                     50-year term had already run out by 1 Nov 2013 — those stay
//                     free, which covers everything published in 1962 or earlier.
//
// This is a careful rule of thumb for a catalogue, not legal advice. It reports
// UNKNOWN rather than guessing when it is missing the year it needs.
// ─────────────────────────────────────────────────────────────────────────────

export type PDStatus = 'PUBLIC_DOMAIN' | 'PROTECTED' | 'UNKNOWN';

export interface PDVerdict {
  jurisdiction: string;
  status: PDStatus;
  /** 1 January of this year is when it becomes (or became) free here. */
  freeFrom?: number;
  reason: string;
}

export interface CompositionFacts {
  /** Death year of the last surviving composer/lyricist. */
  composerDeathYear?: number;
  /** Year of first publication. Drives the US rule. */
  publishedYear?: number;
  /** A traditional/anonymous folk work with no author to count from. */
  traditional?: boolean;
}

export interface RecordingFacts {
  /** Year the recording was first published (released). */
  publishedYear?: number;
}

export const currentYear = (now: Date = new Date()): number => now.getFullYear();

/** Pull a four-digit year out of an archive date like "1926-12" or "1923-02-07". */
export function parseYear(raw: unknown): number | undefined {
  const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(String(raw ?? ''));
  return m ? Number(m[1]) : undefined;
}

// ── United States ───────────────────────────────────────────────────────────

/** First 1 January on which a US sound recording published in `year` is free. */
export function usRecordingFreeFrom(year: number): number {
  if (year < 1923) return 2022;
  if (year <= 1946) return year + 101;
  if (year <= 1956) return year + 111;
  if (year <= 1972) return 2068; // runs to 15 Feb 2067; the first full year free is 2068
  return year + 96;
}

export function isUsRecordingPublicDomain(year: number, now: Date = new Date()): boolean {
  return usRecordingFreeFrom(year) <= currentYear(now);
}

/** Latest publication year of a US recording that is free today (1925 in 2026). */
export function usRecordingCutoffYear(now: Date = new Date()): number {
  const y = currentYear(now);
  let cutoff = 1922;
  while (usRecordingFreeFrom(cutoff + 1) <= y) cutoff++;
  return cutoff;
}

/** First 1 January on which a work published in the US in `year` is free. */
export function usWorkFreeFrom(year: number): number {
  return year <= 1926 ? 1927 : year + 96;
}

/** Latest publication year of a US composition that is free today (1930 in 2026). */
export function usWorkCutoffYear(now: Date = new Date()): number {
  return Math.max(1926, currentYear(now) - 96);
}

// ── Life + N jurisdictions (compositions) ───────────────────────────────────

interface LifeTerm {
  name: string;
  /** Years after the composer's death. */
  years: number;
  /** Term was lengthened without reviving works already free: anyone dead by this year stays free. */
  freeIfDiedBy?: number;
  /** A longer term only for authors who died before a cut-over year (Spain's life + 80). */
  older?: { diedBefore: number; years: number };
  note?: string;
}

export const LIFE_TERMS: Record<string, LifeTerm> = {
  EU: { name: 'European Union', years: 70, note: 'Spain keeps life + 80 for authors who died before 1987.' },
  ES: { name: 'Spain', years: 70, older: { diedBefore: 1987, years: 80 } },
  UK: { name: 'United Kingdom', years: 70 },
  CH: { name: 'Switzerland', years: 70 },
  NO: { name: 'Norway', years: 70 },
  CA: { name: 'Canada', years: 70, freeIfDiedBy: 1971 },
  MX: { name: 'Mexico', years: 100 },
  BR: { name: 'Brazil', years: 70 },
  AR: { name: 'Argentina', years: 70 },
  CO: { name: 'Colombia', years: 80 },
  JM: { name: 'Jamaica', years: 95, freeIfDiedBy: 1962 },
  JP: { name: 'Japan', years: 70, freeIfDiedBy: 1967 },
  KR: { name: 'South Korea', years: 70, freeIfDiedBy: 1962 },
  CN: { name: 'China', years: 50 },
  IN: { name: 'India', years: 60 },
  AU: { name: 'Australia', years: 70, freeIfDiedBy: 1954 },
  NZ: { name: 'New Zealand', years: 70, freeIfDiedBy: 1972 },
  RU: { name: 'Russia', years: 70, note: 'Four extra years for authors who served or worked in the Second World War.' },
  TR: { name: 'Turkey', years: 70 },
  IL: { name: 'Israel', years: 70 },
  EG: { name: 'Egypt', years: 50 },
  ZA: { name: 'South Africa', years: 50 },
  NG: { name: 'Nigeria', years: 70 },
  KE: { name: 'Kenya', years: 50 },
  PH: { name: 'Philippines', years: 50 },
  ID: { name: 'Indonesia', years: 70 },
};

export const DEFAULT_COMPOSITION_JURISDICTIONS = ['US', 'EU', 'UK', 'CA', 'MX', 'BR', 'JP', 'IN', 'CN', 'AU'];

function lifeVerdict(code: string, term: LifeTerm, death: number, now: Date): PDVerdict {
  const years = term.older && death < term.older.diedBefore ? term.older.years : term.years;
  let freeFrom = death + years + 1;
  if (term.freeIfDiedBy !== undefined && death <= term.freeIfDiedBy) {
    freeFrom = Math.min(freeFrom, term.freeIfDiedBy + 1);
  }
  const free = freeFrom <= currentYear(now);
  return {
    jurisdiction: code,
    status: free ? 'PUBLIC_DOMAIN' : 'PROTECTED',
    freeFrom,
    reason: `${term.name}: life + ${years}. Composer died ${death}, so ${free ? 'free since' : 'free from'} ${freeFrom}.` +
      (term.note ? ` ${term.note}` : ''),
  };
}

function usCompositionVerdict(facts: CompositionFacts, now: Date): PDVerdict {
  if (facts.traditional) {
    return { jurisdiction: 'US', status: 'PUBLIC_DOMAIN', reason: 'Traditional work with no author: the tune and words are free. A modern arrangement or transcription can carry its own copyright.' };
  }
  if (facts.publishedYear === undefined) {
    // Anything a composer who died by 1926 published in their lifetime was published by 1926.
    // Only a first edition printed after their death could still be protected.
    const d = facts.composerDeathYear;
    if (d !== undefined && d <= 1926 && d + 70 < currentYear(now)) {
      return { jurisdiction: 'US', status: 'PUBLIC_DOMAIN', reason: `United States: composer died ${d}, so everything published in their lifetime is free. A first edition printed after their death may differ.` };
    }
    return { jurisdiction: 'US', status: 'UNKNOWN', reason: 'The US counts from first publication, and no publication year is known.' };
  }
  const freeFrom = usWorkFreeFrom(facts.publishedYear);
  const free = freeFrom <= currentYear(now);
  return {
    jurisdiction: 'US',
    status: free ? 'PUBLIC_DOMAIN' : 'PROTECTED',
    freeFrom,
    reason: `United States: published ${facts.publishedYear}, so ${free ? 'free since' : 'free from'} ${freeFrom} (95 years from publication).`,
  };
}

/** Where is this composition (the score, the song itself) free today? */
export function assessComposition(
  facts: CompositionFacts,
  jurisdictions: string[] = DEFAULT_COMPOSITION_JURISDICTIONS,
  now: Date = new Date(),
): PDVerdict[] {
  return jurisdictions.map(code => {
    if (code === 'US') return usCompositionVerdict(facts, now);
    const term = LIFE_TERMS[code];
    if (!term) return { jurisdiction: code, status: 'UNKNOWN', reason: `No rule recorded for ${code}.` };
    if (facts.traditional) {
      return { jurisdiction: code, status: 'PUBLIC_DOMAIN', reason: `${term.name}: traditional work with no author to count from. A modern arrangement or transcription can carry its own copyright.` };
    }
    if (facts.composerDeathYear === undefined) {
      return { jurisdiction: code, status: 'UNKNOWN', reason: `${term.name} counts from the composer's death, which is not known.` };
    }
    return lifeVerdict(code, term, facts.composerDeathYear, now);
  });
}

// ── Recordings ──────────────────────────────────────────────────────────────

export const DEFAULT_RECORDING_JURISDICTIONS = ['US', 'EU', 'UK'];

/** First 1 January on which an EU/UK recording published in `year` is free. */
export function euRecordingFreeFrom(year: number): number {
  return year <= 1962 ? 2013 : year + 71;
}

/** Where is this sound recording free today? */
export function assessRecording(
  facts: RecordingFacts,
  jurisdictions: string[] = DEFAULT_RECORDING_JURISDICTIONS,
  now: Date = new Date(),
): PDVerdict[] {
  const y = facts.publishedYear;
  return jurisdictions.map(code => {
    if (y === undefined) {
      return { jurisdiction: code, status: 'UNKNOWN', reason: 'No recording date, so its status cannot be established.' };
    }
    if (code === 'US') {
      const freeFrom = usRecordingFreeFrom(y);
      const free = freeFrom <= currentYear(now);
      return {
        jurisdiction: 'US', status: free ? 'PUBLIC_DOMAIN' : 'PROTECTED', freeFrom,
        reason: `United States (Music Modernization Act): recorded ${y}, so ${free ? 'free since' : 'free from'} ${freeFrom}.`,
      };
    }
    if (code === 'EU' || code === 'UK') {
      const freeFrom = euRecordingFreeFrom(y);
      const free = freeFrom <= currentYear(now);
      return {
        jurisdiction: code, status: free ? 'PUBLIC_DOMAIN' : 'PROTECTED', freeFrom,
        reason: `${code === 'EU' ? 'European Union' : 'United Kingdom'}: recordings run 70 years from release, and anything released by 1962 is free. Recorded ${y}.`,
      };
    }
    return { jurisdiction: code, status: 'UNKNOWN', reason: `No recording rule recorded for ${code}.` };
  });
}

/** Short "Free in US · EU · UK" style summary of a verdict list. */
export function summarizeVerdicts(verdicts: PDVerdict[]): string {
  const free = verdicts.filter(v => v.status === 'PUBLIC_DOMAIN').map(v => v.jurisdiction);
  const held = verdicts.filter(v => v.status === 'PROTECTED').map(v => v.jurisdiction);
  if (!free.length && !held.length) return 'Rights not established';
  if (!held.length) return `Free in ${free.join(' · ')}`;
  if (!free.length) return `Protected in ${held.join(' · ')}`;
  return `Free in ${free.join(' · ')} — protected in ${held.join(' · ')}`;
}
