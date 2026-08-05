// ─────────────────────────────────────────────────────────────────────────────
// History Quest cartridge data — Part 5B of the Experience Expansion blueprint.
//
// The quest itself runs on the shared Reading/Science Quest chassis; this file is
// only its CONTENT + STANDARDS ALIGNMENT layer. Two rules govern it:
//
//  1. Content is DERIVED, not invented. Every question is generated from
//     `data/worldHistoryData.ts` (HISTORY_ERAS, HISTORY_FIGURES, CIVILIZATIONS,
//     PRIMARY_SOURCES), which already ships as the World History discipline seed.
//     No new historical claims are introduced here.
//  2. Standards are REAL and VERIFIED. Every indicator below was checked verbatim
//     against the Smithsonian Learning Lab's published C3 Framework standard pages
//     (learninglab.si.edu/standards) on 2026-07-18 — Change/Continuity & Context,
//     Perspectives, Historical Sources & Evidence, and Causation & Argumentation.
//     Nothing here is a guessed code.
//
// NOTE on the ledger: `data/educationStandards.ts` does not yet carry any SOCIAL
// subject standards or a C3 framework id, so `standardById()` will not resolve these
// ids and domain roll-ups will bucket them under "General" until C3 is added to
// STANDARDS. The ledger write itself is correct and lossless (framework is a free
// string on LearningRecord) — this is graceful degradation, not a bug.
// ─────────────────────────────────────────────────────────────────────────────

import { HISTORY_ERAS, HISTORY_FIGURES, CIVILIZATIONS, PRIMARY_SOURCES } from './worldHistoryData';

// ── Bands (same ids as Reading/Science Quest so BAND_TO_GRADES keeps working) ──
export type HistoryBandId = 'prek' | 'g12' | 'g34' | 'g57';

/** C3 publishes indicators in K-2 / 3-5 / 6-8 / 9-12 spans. Map our bands onto them. */
export type C3Span = 'K-2' | '3-5' | '6-8';
export const C3_SPAN_FOR_BAND: Record<HistoryBandId, C3Span> = {
  prek: 'K-2', g12: 'K-2', g34: '3-5', g57: '6-8',
};

export const HISTORY_BANDS: { id: HistoryBandId; label: string; sub: string }[] = [
  { id: 'prek', label: 'Pre-K · K', sub: 'Long ago and today' },
  { id: 'g12', label: 'Grades 1–2', sub: 'Order the story' },
  { id: 'g34', label: 'Grades 3–4', sub: 'Causes and sources' },
  { id: 'g57', label: 'Grades 5–7', sub: 'Evidence and argument' },
];

// ── Pillars (historical-thinking skills, mirroring C3 Dimension 2 clusters) ────
export const HISTORY_PILLARS = [
  'Chronology & Context',
  'Perspectives',
  'Sources & Evidence',
  'Causation & Argument',
] as const;
export type HistoryPillar = typeof HISTORY_PILLARS[number];

export interface HistoryStandard {
  id: string;           // verified C3 indicator code
  framework: string;    // 'C3_SOCIAL' — NCSS C3 Framework for Social Studies State Standards
  span: C3Span;
  pillar: HistoryPillar;
  statement: string;    // verbatim indicator text
}

export const C3_FRAMEWORK_ID = 'C3_SOCIAL';

/**
 * Verified C3 Dimension 2 (History) indicators. Statements are quoted as published.
 * Source: Smithsonian Learning Lab standards pages for the C3 Framework.
 */
export const HISTORY_STANDARDS: HistoryStandard[] = [
  // Change, Continuity, and Context → Chronology & Context
  { id: 'D2.His.1.K-2', framework: C3_FRAMEWORK_ID, span: 'K-2', pillar: 'Chronology & Context', statement: 'Create a chronological sequence of multiple events.' },
  { id: 'D2.His.1.3-5', framework: C3_FRAMEWORK_ID, span: '3-5', pillar: 'Chronology & Context', statement: 'Create and use a chronological sequence of related events to compare developments that happened at the same time.' },
  { id: 'D2.His.1.6-8', framework: C3_FRAMEWORK_ID, span: '6-8', pillar: 'Chronology & Context', statement: 'Analyze connections among events and developments in broader historical contexts.' },

  // Perspectives
  { id: 'D2.His.4.K-2', framework: C3_FRAMEWORK_ID, span: 'K-2', pillar: 'Perspectives', statement: 'Compare perspectives of people in the past to those of people in the present.' },
  { id: 'D2.His.4.3-5', framework: C3_FRAMEWORK_ID, span: '3-5', pillar: 'Perspectives', statement: 'Explain why individuals and groups during the same historical period differed in their perspectives.' },
  { id: 'D2.His.4.6-8', framework: C3_FRAMEWORK_ID, span: '6-8', pillar: 'Perspectives', statement: 'Analyze multiple factors that influenced the perspectives of people during different historical eras.' },

  // Historical Sources and Evidence
  { id: 'D2.His.10.K-2', framework: C3_FRAMEWORK_ID, span: 'K-2', pillar: 'Sources & Evidence', statement: 'Explain how historical sources can be used to study the past.' },
  { id: 'D2.His.10.3-5', framework: C3_FRAMEWORK_ID, span: '3-5', pillar: 'Sources & Evidence', statement: 'Compare information provided by different historical sources about the past.' },
  { id: 'D2.His.10.6-8', framework: C3_FRAMEWORK_ID, span: '6-8', pillar: 'Sources & Evidence', statement: 'Detect possible limitations in the historical record based on evidence collected from different kinds of historical sources.' },

  // Causation and Argumentation
  { id: 'D2.His.14.K-2', framework: C3_FRAMEWORK_ID, span: 'K-2', pillar: 'Causation & Argument', statement: 'Generate possible reasons for an event or development in the past.' },
  { id: 'D2.His.14.3-5', framework: C3_FRAMEWORK_ID, span: '3-5', pillar: 'Causation & Argument', statement: 'Explain probable causes and effects of events and developments.' },
  { id: 'D2.His.14.6-8', framework: C3_FRAMEWORK_ID, span: '6-8', pillar: 'Causation & Argument', statement: 'Explain multiple causes and effects of events and developments in the past.' },
];

/** The indicator this pillar targets for a learner in this band (undefined = no match). */
export const standardForPillar = (pillar: HistoryPillar, band: HistoryBandId): HistoryStandard | undefined => {
  const span = C3_SPAN_FOR_BAND[band];
  return HISTORY_STANDARDS.find(s => s.pillar === pillar && s.span === span);
};

// ── Question generation ───────────────────────────────────────────────────────
export interface HistoryQuestion { prompt: string; options: string[]; answer: number; note?: string; }

/** Deterministic PRNG so a given (game, band, seed) always yields the same paper. */
const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
};

const pick = <T,>(arr: T[], n: number, rand: () => number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};

/** Shuffle options and report where the correct one landed. */
const build = (prompt: string, correct: string, distractors: string[], rand: () => number, note?: string): HistoryQuestion => {
  const options = [correct, ...distractors];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const q: HistoryQuestion = { prompt, options, answer: options.indexOf(correct) };
  if (note) q.note = note;
  return q;
};

/** Younger bands get 3 choices, older bands 4. */
const choicesFor = (band: HistoryBandId) => (band === 'prek' || band === 'g12' ? 2 : 3);

// Eras ship in chronological order in worldHistoryData — index IS the timeline.
const eraIndex = (id: string) => HISTORY_ERAS.findIndex(e => e.id === id);

/** Chronology & Context — order eras, and place turning points in their era. */
export function chronologyQuestions(band: HistoryBandId, seed: number, count = 3): HistoryQuestion[] {
  const rand = rng(seed);
  const out: HistoryQuestion[] = [];
  const d = choicesFor(band);

  // Which era BEGAN first? ("began" rather than "came" — era spans overlap, e.g. the Age
  // of Revolutions and the Industrial Age, so only start order is unambiguous. Just one
  // of these per paper; repeating an identical prompt reads as a bug.)
  {
    const chosen = pick(HISTORY_ERAS, d + 1, rand);
    const earliest = chosen.reduce((a, b) => (eraIndex(a.id) <= eraIndex(b.id) ? a : b));
    out.push(build(
      'Which of these ages BEGAN first?',
      `${earliest.title} (${earliest.span})`,
      chosen.filter(e => e.id !== earliest.id).map(e => `${e.title} (${e.span})`),
      rand,
      `${earliest.title}: ${earliest.span}.`,
    ));
  }

  // Which era does this turning point belong to?
  while (out.length < count) {
    const [era, ...others] = pick(HISTORY_ERAS, d + 1, rand);
    if (!era || !era.turningPoints.length) break;
    const tp = era.turningPoints[Math.floor(rand() * era.turningPoints.length)];
    out.push(build(
      `In which era does this belong? — "${tp}"`,
      era.title,
      others.map(e => e.title),
      rand,
      `${era.title} spans ${era.span}.`,
    ));
  }
  return out.slice(0, count);
}

/** Perspectives — who saw the world how; whose vantage point is this? */
export function perspectiveQuestions(band: HistoryBandId, seed: number, count = 3): HistoryQuestion[] {
  const rand = rng(seed);
  const out: HistoryQuestion[] = [];
  const d = choicesFor(band);

  // Only figures that actually carry a tagline can anchor a "whose view is this?"
  // prompt — tagline/role are optional on MuseumFigure, so degrade by skipping.
  const usable = HISTORY_FIGURES.filter(f => !!f.tagline);
  let guard = 0;
  while (out.length < count && guard++ < 40) {
    const [figure, ...others] = pick(usable, d + 1, rand);
    if (!figure) break;
    // Prefer distractors from the same hall so the discrimination is about the person,
    // not the category — falls back to any figure when the hall is thin.
    const sameHall = usable.filter(f => f.hall === figure.hall && f.id !== figure.id);
    const pool = sameHall.length >= d ? pick(sameHall, d, rand) : others.slice(0, d);
    if (pool.length < d) break;
    const q = build(
      `Whose point of view is this? — "${figure.tagline}"`,
      figure.name,
      pool.map(f => f.name),
      rand,
      `${figure.name}${figure.role ? ` — ${figure.role}` : ''}${figure.years ? `, ${figure.years}` : ''}.`,
    );
    if (out.some(x => x.prompt === q.prompt)) continue;  // no duplicate papers
    out.push(q);
  }
  return out.slice(0, count);
}

/** Sources & Evidence — what a source is, and which archive holds what. */
export function sourceQuestions(band: HistoryBandId, seed: number, count = 3): HistoryQuestion[] {
  const rand = rng(seed);
  const out: HistoryQuestion[] = [];
  const d = choicesFor(band);

  // Archive identification — grounded entirely in the shipped PRIMARY_SOURCES list.
  while (out.length < Math.ceil(count / 2)) {
    const [src, ...others] = pick(PRIMARY_SOURCES, d + 1, rand);
    if (!src) break;
    out.push(build(
      `Which archive would you search? — ${src.desc.split('.')[0]}.`,
      src.name,
      others.map(s => s.name),
      rand,
      `${src.name} · ${src.org} · ${src.access}.`,
    ));
  }

  // Sourcing reasoning — the C3 skill itself, phrased for the band.
  const reasoning: Record<C3Span, HistoryQuestion[]> = {
    'K-2': [
      { prompt: 'Which one is a source that tells us about the past?', options: ['an old letter', 'a new toy', 'tomorrow'], answer: 0 },
      { prompt: 'A photograph from long ago can show us:', options: ['what people wore then', 'what happens next year', 'nothing at all'], answer: 0 },
      { prompt: 'Historians study the past by looking at:', options: ['things people left behind', 'only guesses', 'cartoons'], answer: 0 },
    ],
    '3-5': [
      { prompt: 'Two sources describe the same battle differently. A historian should:', options: ['compare both and look for more evidence', 'believe the longer one', 'ignore both'], answer: 0 },
      { prompt: 'A diary written the same week as an event is a:', options: ['primary source', 'secondary source', 'textbook'], answer: 0 },
      { prompt: 'A history book written today about ancient Rome is a:', options: ['secondary source', 'primary source', 'artefact'], answer: 0 },
    ],
    '6-8': [
      { prompt: 'Most surviving records from an era were written by the powerful. This means the historical record is:', options: ['incomplete — some voices are missing', 'perfectly balanced', 'entirely false'], answer: 0 },
      { prompt: 'A memoir written 40 years after the events it describes is limited mainly by:', options: ['memory and hindsight', 'its length', 'its language'], answer: 0 },
      { prompt: 'The strongest way to test a claim about the past is to:', options: ['corroborate it across independent sources', 'find one source that agrees', 'trust the oldest source'], answer: 0 },
    ],
  };
  const span = C3_SPAN_FOR_BAND[band];
  out.push(...pick(reasoning[span], count, rand));
  return out.slice(0, count);
}

/** Causation & Argument — why things happened; effects of developments. */
export function causationQuestions(band: HistoryBandId, seed: number, count = 3): HistoryQuestion[] {
  const rand = rng(seed);
  const out: HistoryQuestion[] = [];
  const d = choicesFor(band);

  // "Which development belongs to this era?" — a causation-adjacent read of the
  // era essays, built straight from HISTORY_ERAS.developments.
  while (out.length < Math.ceil(count / 2)) {
    const [era, ...others] = pick(HISTORY_ERAS, d + 1, rand);
    if (!era || !era.developments.length) break;
    const dev = era.developments[Math.floor(rand() * era.developments.length)];
    // Distractor developments must come from other eras so exactly one is correct.
    const wrong = others
      .map(e => e.developments[Math.floor(rand() * e.developments.length)])
      .filter(Boolean)
      .filter(x => x !== dev)
      .slice(0, d);
    if (wrong.length < d) break;
    out.push(build(
      `Which development came out of ${era.title} (${era.span})?`,
      dev,
      wrong,
      rand,
      era.essay.split('.')[0] + '.',
    ));
  }

  // Civilisation hallmarks — cause/effect of a culture's achievements.
  while (out.length < count) {
    const [civ, ...others] = pick(CIVILIZATIONS, d + 1, rand);
    if (!civ || !civ.hallmarks.length) break;
    const hallmark = civ.hallmarks[Math.floor(rand() * civ.hallmarks.length)];
    out.push(build(
      `"${hallmark}" — which civilisation is this a hallmark of?`,
      civ.name,
      others.map(c => c.name),
      rand,
      `${civ.name} · ${civ.region} · ${civ.span}.`,
    ));
  }
  return out.slice(0, count);
}

// ── Games (the lab map) ───────────────────────────────────────────────────────
export interface HistoryGame {
  id: string;
  title: string;
  icon: string;
  pillar: HistoryPillar;
  blurb: string;
  make: (band: HistoryBandId, seed: number) => HistoryQuestion[];
}

// ── Turbo (beyond grade level) ────────────────────────────────────────────────
// `turboTrackFor()` in educationStandards only ships ELA / MATH / SCIENCE tracks —
// there is no SOCIAL track yet, so History Quest carries its own. Same shape as
// TurboChallenge so it can be lifted into TURBO_TRACKS unchanged later.
export interface HistoryTurboChallenge { id: string; kind: 'acceleration' | 'depth' | 'transfer' | 'creative'; title: string; prompt: string; }

export const HISTORY_TURBO: HistoryTurboChallenge[] = [
  { id: 'ht-depth', kind: 'depth', title: 'Read against the grain', prompt: 'Pick any figure in the History hall. Whose voices are MISSING from the sources about them — and how would the story change if those voices had been written down?' },
  { id: 'ht-transfer', kind: 'transfer', title: 'Two eras, one problem', prompt: 'Choose a problem that appears in two different eras (plague, migration, information overload). Explain how each era’s tools and beliefs shaped its response.' },
  { id: 'ht-accel', kind: 'acceleration', title: 'Corroborate it', prompt: 'Take one turning point from the eras atlas. Find three independent sources in the archives (Library of Congress, Europeana, Wikisource) and note exactly where they disagree.' },
  { id: 'ht-create', kind: 'creative', title: 'Write the counterfactual', prompt: 'Pick a turning point and argue, with evidence, what would plausibly have followed if it had gone the other way — and what would NOT have changed.' },
];

export const HISTORY_GAMES: HistoryGame[] = [
  { id: 'timeline', title: 'Timeline', icon: '⏳', pillar: 'Chronology & Context', blurb: 'Put the ages of the world in order.', make: (b, s) => chronologyQuestions(b, s) },
  { id: 'voices',   title: 'Voices',   icon: '🗣️', pillar: 'Perspectives',        blurb: 'Whose eyes are you seeing through?', make: (b, s) => perspectiveQuestions(b, s) },
  { id: 'evidence', title: 'Evidence', icon: '🔍', pillar: 'Sources & Evidence',  blurb: 'Read the record — and its gaps.',   make: (b, s) => sourceQuestions(b, s) },
  { id: 'because',  title: 'Because',  icon: '🧭', pillar: 'Causation & Argument', blurb: 'Why it happened, and what followed.', make: (b, s) => causationQuestions(b, s) },
];
