// oerLibrary — the licence-tagged OER catalogue behind Plajah Academia's assignment library,
// plus the standards spine those items align to.
//
// Structure, deliberately:
//   • SPINE   — Common Core (ELA + Math) and NGSS (science). This is what US teachers actually
//               plan against, it's free to use, and existing OER is already tagged to it.
//   • OVERLAY — PISA proficiency levels as a competency layer on grades 6–10. PISA is the OECD's
//               ASSESSMENT framework for 15-year-olds, not a curriculum with grade-by-grade scope
//               and sequence, so it decorates tasks rather than skeletoning them. No mainstream US
//               platform tags to PISA; doing so is what gives Plajah international portability.
//
// The K-7 standards graph in data/educationStandards.ts stays the source of truth for the
// Learner Ledger. This file covers the 6–12 planning codes that graph doesn't reach yet, and
// crosswalks into it via FRAMEWORK_TO_LEDGER below.

import type { FrameworkId } from './educationStandards';
import { composeAttribution, type License } from '../services/oerLicenseGate';

// ── Standards references ──────────────────────────────────────────────────────

export type StandardFramework = 'CCSS' | 'NGSS' | 'PISA';

export interface StandardRef {
  framework: StandardFramework;
  code: string;    // 'CCSS.MATH.6.RP.A.1' | 'MS-PS1-4' | 'PISA.MATH.L4'
  label?: string;
}

/** Bridge into the ledger's framework ids so a template's alignment can write ledger records. */
export const FRAMEWORK_TO_LEDGER: Record<StandardFramework, FrameworkId | null> = {
  CCSS: null,   // resolved per-code below (ELA vs MATH)
  NGSS: 'NGSS',
  PISA: null,   // an overlay, not a ledger framework — see masteryToPISABand()
};

export function ledgerFrameworkFor(ref: StandardRef): FrameworkId | null {
  if (ref.framework === 'NGSS') return 'NGSS';
  if (ref.framework === 'CCSS') return /\.MATH\./i.test(ref.code) ? 'CCSS_MATH' : 'CCSS_ELA';
  return null;
}

export const PISA_DOMAINS = ['MATH', 'READ', 'SCI'] as const;
export type PisaDomain = (typeof PISA_DOMAINS)[number];
export type PisaLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const pisaRef = (domain: PisaDomain, level: PisaLevel): StandardRef =>
  ({ framework: 'PISA', code: `PISA.${domain}.L${level}` });

// Descriptors paraphrased from the OECD PISA proficiency scales, for internal calibration only.
// For released items and the exact scale wording, source from OECD publications directly and
// verify redistribution terms before ingesting item text verbatim.
export const PISA_LEVELS: Record<PisaDomain, Record<PisaLevel, string>> = {
  MATH: {
    1: 'Answer questions in familiar contexts where all information is present and the question is clearly defined.',
    2: 'Interpret and recognise situations needing no more than direct inference; use basic algorithms and procedures.',
    3: 'Execute clearly described procedures including sequential decisions; interpret and use representations.',
    4: 'Work effectively with explicit models for complex concrete situations; select and integrate representations.',
    5: 'Develop and work with models for complex situations; select and evaluate problem-solving strategies.',
    6: 'Conceptualise, generalise, and use information from investigations and modelling of complex situations.',
  },
  READ: {
    1: 'Locate explicitly stated information in short, simple texts on familiar topics.',
    2: 'Locate information meeting several conditions; identify the main idea; make low-level inferences.',
    3: 'Integrate several parts of a text; compare, contrast, or categorise competing information.',
    4: 'Interpret nuanced language; critically evaluate a text; handle unfamiliar content and formats.',
    5: 'Locate and organise deeply embedded information; evaluate critically and build hypotheses.',
    6: 'Make multiple inferences, comparisons and contrasts with precision across multiple full texts.',
  },
  SCI: {
    1: 'Use basic everyday scientific knowledge to recognise simple phenomena.',
    2: 'Draw on everyday and basic procedural knowledge to identify scientific explanations.',
    3: 'Use moderately complex content knowledge to construct explanations of familiar phenomena.',
    4: 'Interpret data and evidence from different sources; justify choices of experimental design.',
    5: 'Evaluate ways of exploring questions scientifically; construct explanations from multiple evidence lines.',
    6: 'Draw on interrelated scientific ideas to justify novel predictions and evaluate competing designs.',
  },
};

/** Starter CCSS-domain → PISA overlay. Extend during content calibration against released items. */
export const CCSS_TO_PISA_STARTER: Record<string, StandardRef> = {
  'CCSS.MATH.6.RP': pisaRef('MATH', 2),
  'CCSS.MATH.7.RP': pisaRef('MATH', 3),
  'CCSS.MATH.8.EE': pisaRef('MATH', 3),
  'CCSS.MATH.8.F': pisaRef('MATH', 4),
  'CCSS.MATH.HSA': pisaRef('MATH', 4),
  'CCSS.MATH.HSF': pisaRef('MATH', 5),
  'CCSS.ELA.RI.6': pisaRef('READ', 2),
  'CCSS.ELA.RI.8': pisaRef('READ', 3),
  'CCSS.ELA.RI.9-10': pisaRef('READ', 4),
};

/** Suggest a PISA overlay for a CCSS code by longest-prefix match. */
export function suggestPisaOverlay(ccssCode: string): StandardRef | null {
  const keys = Object.keys(CCSS_TO_PISA_STARTER).sort((a, b) => b.length - a.length);
  const hit = keys.find(k => ccssCode.startsWith(k));
  return hit ? CCSS_TO_PISA_STARTER[hit] : null;
}

/** Human-readable rendering for any supported code. */
export function describeStandard(ref: StandardRef): { framework: string; display: string; detail?: string } {
  switch (ref.framework) {
    case 'CCSS':
      return { framework: 'Common Core', display: ref.code.replace(/^CCSS\./, '') };
    case 'NGSS':
      return { framework: 'NGSS', display: ref.code };
    case 'PISA': {
      const m = /^PISA\.(MATH|READ|SCI)\.L([1-6])$/.exec(ref.code);
      if (!m) return { framework: 'PISA', display: ref.code };
      const domain = m[1] as PisaDomain;
      const level = Number(m[2]) as PisaLevel;
      const name = domain === 'MATH' ? 'Mathematical' : domain === 'READ' ? 'Reading' : 'Scientific';
      return {
        framework: 'PISA',
        display: `${name} literacy — Level ${level}`,
        detail: PISA_LEVELS[domain][level],
      };
    }
  }
}

// ── Library items ─────────────────────────────────────────────────────────────

export type LibrarySubject = 'ela' | 'math' | 'science' | 'socialStudies' | 'worldLang' | 'arts';
export type GradeBand = 'K-2' | '3-5' | '6-8' | '9-12';
export type LibraryFormat = 'textbook' | 'chapter' | 'exercise-set' | 'reading' | 'primary-source';

export interface LibraryItem {
  id: string;
  source: string;
  sourceUrl: string;
  license: License;
  /** Derived from license — never hand-set. Drives free/paid tier placement. */
  commercialOk: boolean;
  shareAlike: boolean;
  attribution: string;
  subjects: LibrarySubject[];
  gradeBands: GradeBand[];
  standards: StandardRef[];
  title: string;
  format: LibraryFormat;
  /** True when Plajah links out rather than mirroring. */
  linkOutOnly: boolean;
  /**
   * The `albums/{id}` document holding a Plajah-hosted copy, when one has been ingested —
   * so the item opens in the Lorea reader instead of sending the reader off-platform.
   *
   * Present on every OpenStax title, including the CC BY-NC-SA ones: NonCommercial restricts
   * commercial USE, not hosting, and Plajah textbooks are free to every account and never part
   * of Plajah+ — so mirroring them is fine while attaching them to a PAID course is not. That
   * second restriction is `commercialOk`, and it is unaffected by this field.
   *
   * Set optimistically: the id is deterministic, but the book only exists once
   * scripts/ingestOpenStaxBook.ts has run, so callers must confirm with
   * resolveHostedBooks() before offering to open it.
   */
  readerBookId?: string;
}

type SeedSpec = Omit<LibraryItem, 'attribution' | 'commercialOk' | 'shareAlike'> & { author?: string };

const seed = (s: SeedSpec): LibraryItem => ({
  ...s,
  commercialOk: s.license === 'PD' || s.license === 'CC-BY' || s.license === 'CC-BY-SA',
  shareAlike: s.license === 'CC-BY-SA' || s.license === 'CC-BY-NC-SA',
  attribution: composeAttribution(
    s.source,
    s.author ? `${s.title} — ${s.author}` : s.title,
    s.license,
    s.sourceUrl,
  ),
});

// OpenStax (Rice University).
//
// CORRECTION, verified against the OpenStax archive API's own `license` field (2026-08):
// OpenStax is NOT uniformly CC BY. Its catalogue is mixed, and the NON-commercial titles are
// the majority of what a K-12 teacher reaches for — Prealgebra, Elementary Algebra, Algebra
// & Trigonometry and Biology for AP Courses are all CC BY-NC-SA. Only some titles (Physics
// among them) are CC BY.
//
// Treating "OpenStax" as a blanket CC BY source is the exact mistake that puts non-commercial
// material behind a paywall, so licences here are per-title and must be re-read from upstream
// at ingest (scripts/ingestOerLibrary.ts does this) rather than assumed from the publisher.
//
// All five are MIRRORED (linkOutOnly: false) and read natively in the Lorea reader, including
// the NC ones — Plajah textbooks are free to every account and never part of Plajah+, so
// hosting them is not commercial use. The NC titles still carry commercialOk: false, which is
// the separate and still-closed gate on putting them inside a PAID course.
const OPENSTAX: LibraryItem[] = [
  seed({ id: 'openstax-prealgebra-2e', source: 'OpenStax (Rice University)', sourceUrl: 'https://openstax.org/books/prealgebra-2e', license: 'CC-BY-NC-SA', title: 'Prealgebra 2e', subjects: ['math'], gradeBands: ['6-8'], format: 'textbook', readerBookId: 'openstax_prealgebra_2e', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.MATH.6.RP.A.1' }, { framework: 'CCSS', code: 'CCSS.MATH.6.RP.A.2' }] }),
  seed({ id: 'openstax-elementary-algebra-2e', source: 'OpenStax (Rice University)', sourceUrl: 'https://openstax.org/books/elementary-algebra-2e', license: 'CC-BY-NC-SA', title: 'Elementary Algebra 2e', subjects: ['math'], gradeBands: ['6-8', '9-12'], format: 'textbook', readerBookId: 'openstax_elementary_algebra_2e', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.MATH.8.EE' }] }),
  seed({ id: 'openstax-algebra-trig-2e', source: 'OpenStax (Rice University)', sourceUrl: 'https://openstax.org/books/algebra-and-trigonometry-2e', license: 'CC-BY-NC-SA', title: 'Algebra and Trigonometry 2e', subjects: ['math'], gradeBands: ['9-12'], format: 'textbook', readerBookId: 'openstax_algebra_and_trigonometry_2e', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.MATH.HSA' }, { framework: 'CCSS', code: 'CCSS.MATH.HSF' }] }),
  seed({ id: 'openstax-biology-ap', source: 'OpenStax (Rice University)', sourceUrl: 'https://openstax.org/books/biology-ap-courses', license: 'CC-BY-NC-SA', title: 'Biology for AP Courses', subjects: ['science'], gradeBands: ['9-12'], format: 'textbook', readerBookId: 'openstax_biology_ap_courses', linkOutOnly: false, standards: [{ framework: 'NGSS', code: 'HS-LS1-2' }] }),
  // Verified CC BY — the one title here that may be mirrored and used commercially.
  seed({ id: 'openstax-physics', source: 'OpenStax (Rice University)', sourceUrl: 'https://openstax.org/books/physics', license: 'CC-BY', title: 'Physics', subjects: ['science'], gradeBands: ['9-12'], format: 'textbook', readerBookId: 'openstax_physics', linkOutOnly: false, standards: [{ framework: 'NGSS', code: 'HS-PS2-1' }] }),
];

// Project Gutenberg — public domain. Zero restrictions; the ELA reading backbone.
const GUTENBERG: LibraryItem[] = [
  seed({ id: 'pg-1342', source: 'Project Gutenberg', sourceUrl: 'https://www.gutenberg.org/ebooks/1342', license: 'PD', title: 'Pride and Prejudice', author: 'Jane Austen', subjects: ['ela'], gradeBands: ['9-12'], format: 'reading', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.ELA.RL.9-10.3' }] }),
  seed({ id: 'pg-84', source: 'Project Gutenberg', sourceUrl: 'https://www.gutenberg.org/ebooks/84', license: 'PD', title: 'Frankenstein', author: 'Mary Wollstonecraft Shelley', subjects: ['ela'], gradeBands: ['9-12'], format: 'reading', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.ELA.RL.9-10.2' }] }),
  seed({ id: 'pg-11', source: 'Project Gutenberg', sourceUrl: 'https://www.gutenberg.org/ebooks/11', license: 'PD', title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', subjects: ['ela'], gradeBands: ['3-5', '6-8'], format: 'reading', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.ELA.RL.5.3' }] }),
  seed({ id: 'pg-23', source: 'Project Gutenberg', sourceUrl: 'https://www.gutenberg.org/ebooks/23', license: 'PD', title: 'Narrative of the Life of Frederick Douglass', author: 'Frederick Douglass', subjects: ['ela', 'socialStudies'], gradeBands: ['9-12'], format: 'primary-source', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.ELA.RI.9-10.8' }] }),
];

// CK-12 — CC BY-NC. METADATA + OUTBOUND LINKS ONLY. Never mirrored, never behind a paid
// feature. Changing this posture requires a separate agreement with the CK-12 Foundation.
const CK12: LibraryItem[] = [
  seed({ id: 'ck12-ms-math-6', source: 'CK-12 Foundation', sourceUrl: 'https://www.ck12.org/c/middle-school-math-grade-6/', license: 'CC-BY-NC', title: 'CK-12 Middle School Math — Grade 6', subjects: ['math'], gradeBands: ['6-8'], format: 'textbook', linkOutOnly: true, standards: [{ framework: 'CCSS', code: 'CCSS.MATH.6.RP' }] }),
  seed({ id: 'ck12-earth-science-ms', source: 'CK-12 Foundation', sourceUrl: 'https://www.ck12.org/c/earth-science/', license: 'CC-BY-NC', title: 'CK-12 Earth Science for Middle School', subjects: ['science'], gradeBands: ['6-8'], format: 'textbook', linkOutOnly: true, standards: [{ framework: 'NGSS', code: 'MS-ESS2-1' }] }),
];

// Mathematics Vision Project — CC BY. Strong integrated secondary math sequence.
const MVP: LibraryItem[] = [
  seed({ id: 'mvp-math-1', source: 'Mathematics Vision Project', sourceUrl: 'https://www.mathematicsvisionproject.org/', license: 'CC-BY', title: 'MVP Secondary Mathematics I', subjects: ['math'], gradeBands: ['9-12'], format: 'exercise-set', linkOutOnly: false, standards: [{ framework: 'CCSS', code: 'CCSS.MATH.HSF' }] }),
];

export const OER_LIBRARY: LibraryItem[] = [...OPENSTAX, ...GUTENBERG, ...CK12, ...MVP];

export const libraryItemById = (id: string): LibraryItem | undefined =>
  OER_LIBRARY.find(i => i.id === id);

export function filterLibrary(opts: {
  subject?: LibrarySubject;
  gradeBand?: GradeBand;
  /** true → only items that may be packaged into a paid offering. */
  commercialOnly?: boolean;
}): LibraryItem[] {
  return OER_LIBRARY.filter(i =>
    (!opts.subject || i.subjects.includes(opts.subject)) &&
    (!opts.gradeBand || i.gradeBands.includes(opts.gradeBand)) &&
    (!opts.commercialOnly || i.commercialOk)
  );
}

/**
 * Sources reviewed for ingest, with the licence posture that decides placement. Kept in code
 * (not a doc) so the reasoning travels with the pipeline that acts on it.
 */
export const OER_SOURCE_REGISTER: Array<{
  source: string; coverage: string; license: License | 'OECD terms'; commercialOk: boolean; note: string;
}> = [
  { source: 'OpenStax (CC BY titles)', coverage: 'Some HS/AP + college science, e.g. Physics', license: 'CC-BY', commercialOk: true, note: 'Remixable into paid products with attribution. Verify PER TITLE — the catalogue is mixed.' },
  { source: 'OpenStax (CC BY-NC-SA titles)', coverage: 'Most K-12-facing math + AP Biology', license: 'CC-BY-NC-SA', commercialOk: false, note: 'Prealgebra, Elementary Algebra, Algebra & Trig, Biology for AP are NON-commercial. Free tier / link-out only.' },
  { source: 'Project Gutenberg / Standard Ebooks / DPLA', coverage: 'Literature, primary sources', license: 'PD', commercialOk: true, note: 'The ELA reading backbone — zero restrictions.' },
  { source: 'Utah OER (UEN)', coverage: 'K-12, standards-aligned', license: 'CC-BY', commercialOk: true, note: 'Check per item; built to be re-aligned to other standards.' },
  { source: 'Mathematics Vision Project', coverage: 'Secondary math', license: 'CC-BY', commercialOk: true, note: 'Strong integrated-math sequence.' },
  { source: 'Saylor Academy', coverage: '~100 full courses, HS-adaptable', license: 'CC-BY', commercialOk: true, note: 'Includes practice questions.' },
  { source: 'CK-12', coverage: 'K-12 FlexBooks', license: 'CC-BY-NC', commercialOk: false, note: 'Link-out / free tier only. Separate agreement required for paid placement.' },
  { source: 'EngageNY / Eureka Math', coverage: 'Full K-12 math + ELA', license: 'CC-BY-NC-SA', commercialOk: false, note: 'Same posture as CK-12.' },
  { source: 'PISA released items (OECD/NCES)', coverage: 'Math, reading, science tasks + rubrics', license: 'OECD terms', commercialOk: false, note: 'Exemplars + difficulty calibration. Framework ALIGNMENT needs no licence; verify terms before ingesting item text verbatim.' },
];
