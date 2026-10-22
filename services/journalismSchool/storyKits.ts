// Story kits — the Student Newsroom's assignment scaffolds, one per form per band.
//
// A kit is what turns a School of Journalism lesson into practice: which fields the reporter fills,
// the coaching steps, the checklist the editor ticks, and the rubric a teacher grades with. Kits are
// pure data; the desk (studentDesk.ts) reads them and the UI renders them.
//
// Rubrics reuse the house four-level RubricCriterion shape from data/assignmentTemplates.ts so a
// teacher can grade a newsroom story the same way as any other Academia assignment.

import type { DepthLevel } from '../dossier/dossierTypes';
import type { RubricCriterion } from '../../data/assignmentTemplates';

export type StoryForm =
  | 'picture-news' | 'news-brief' | 'interview' | 'news-story' | 'feature'
  | 'opinion' | 'broadcast' | 'records-request' | 'investigation' | 'newsletter';

/** Which inputs a kit shows. Every kit has a headline and body; these add structure. */
export type KitField = 'picture' | 'caption' | 'fiveWs' | 'lede' | 'quotes' | 'sources' | 'dek' | 'counterpoint' | 'script' | 'records' | 'plan' | 'data';

export interface StoryKit {
  id: string;
  form: StoryForm;
  bands: DepthLevel[];
  title: string;
  emoji: string;
  pitch: string;
  /** Lesson in data/journalismCurriculum.ts that teaches this form. */
  lessonId: string;
  /** Lorea "The First Draft" exhibit room that plays with the same idea. */
  exhibitRoom?: 'newsroom' | 'lede' | 'pyramid' | 'presses';
  fields: KitField[];
  /** Coaching steps, in order. Short imperative lines a child can follow. */
  steps: string[];
  /** Editor's checklist — every item must be ticked before the story moves to review. */
  checklist: string[];
  /** Soft target; the coach nudges, never blocks, on length. */
  words: [min: number, max: number];
  rubric: RubricCriterion[];
}

const c = (name: string, b: string, d: string, p: string, a: string): RubricCriterion => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: b, points: 1 },
    { label: 'Developing', descriptor: d, points: 2 },
    { label: 'Proficient', descriptor: p, points: 3 },
    { label: 'Advanced', descriptor: a, points: 4 },
  ],
});

const ACCURACY = c('Accuracy & verification', 'Facts are unchecked or wrong', 'Most facts checked; some unsourced', 'Every fact checked with a named source', 'Facts checked against independent primary sources; numbers and names double-checked');
const SOURCING = c('Sourcing & attribution', 'No sources named', 'One source, or attribution unclear', 'Multiple sources, each clearly attributed', 'Independent primary sources, fair to every side, quotes read back');
const STRUCTURE = c('Structure', 'No clear order', 'Lede present but buried', 'Clear lede; inverted pyramid or fitting shape', 'Shape chosen deliberately; every paragraph earns its place');
const CLARITY = c('Clarity & style', 'Hard to follow', 'Readable with errors', 'Clear, active, mostly error-free', 'Tight, vivid, style-clean, written for the audience');
const ETHICS = c('Ethics & care', 'Harm ignored', 'Some care for people in the story', 'Consent, fairness and privacy handled', 'Thoughtful about harm, with choices explained to the editor');

export const STORY_KITS: StoryKit[] = [
  {
    id: 'kit-picture-news', form: 'picture-news', bands: ['early'], title: 'Picture News', emoji: '🖍️',
    pitch: 'Draw something that really happened and write one caption that says who and what.',
    lessonId: 'jr-notice-2', exhibitRoom: 'newsroom', fields: ['picture', 'caption'],
    steps: ['Think of one thing that really happened.', 'Draw it or take a picture.', 'Say who and what in one sentence.', 'Ask: would someone who wasn’t there understand?'],
    checklist: ['It really happened', 'The caption says who and what', 'The words match the picture', 'I asked my friend before putting them in'],
    words: [5, 30],
    rubric: [c('Who and what', 'Missing who or what', 'Has one of who/what', 'Has who and what', 'Has who, what and where'), c('Words match picture', 'Do not match', 'Partly match', 'Match', 'Match and add something the picture can’t show')],
  },
  {
    id: 'kit-news-brief', form: 'news-brief', bands: ['early', 'elementary'], title: 'News Brief', emoji: '🗞️',
    pitch: 'A short, complete news story: the 5 Ws and How, and a lede that puts the most important one first.',
    lessonId: 'jr-cub-2', exhibitRoom: 'lede', fields: ['fiveWs', 'lede', 'sources'],
    steps: ['Fill in who, what, when, where, why and how.', 'Circle the most important one.', 'Write a first sentence that starts with it.', 'Write two or three more sentences.', 'Say how you know each fact.'],
    checklist: ['All six questions answered (or "I don’t know yet")', 'The lede has the most important W', 'Every name is spelled right', 'I said how I know'],
    words: [40, 150],
    rubric: [ACCURACY, STRUCTURE, CLARITY],
  },
  {
    id: 'kit-interview', form: 'interview', bands: ['elementary', 'middle'], title: 'Interview Profile', emoji: '🎤',
    pitch: 'Interview one person and write a short profile built on their exact words.',
    lessonId: 'jr-cub-3', exhibitRoom: 'newsroom', fields: ['lede', 'quotes', 'sources'],
    steps: ['Write five open questions; circle your top two.', 'Tell them who you are and what it’s for.', 'Ask the circled questions first.', 'Write exact words and read them back.', 'Write it up the same day.'],
    checklist: ['They agreed to be interviewed', 'Every quote was read back', 'Quotes are exact; paraphrases have no quote marks', 'I told them when it comes out'],
    words: [120, 400],
    rubric: [SOURCING, STRUCTURE, CLARITY, ETHICS],
  },
  {
    id: 'kit-news-story', form: 'news-story', bands: ['middle', 'high', 'university'], title: 'Hard News Story', emoji: '📰',
    pitch: 'An inverted-pyramid news story with attributed sources, exact quotes and a headline that keeps its promise.',
    lessonId: 'jr-ms-1', exhibitRoom: 'pyramid', fields: ['dek', 'lede', 'quotes', 'sources', 'data'],
    steps: ['Write the lede: most important news first.', 'Add the next most important facts.', 'Attribute every fact you did not witness.', 'Add quotes only a person could say.', 'Put background last.', 'Write three headlines; keep the most accurate.'],
    checklist: ['Lede under ~35 words', 'Every unwitnessed fact attributed', 'At least two independent sources', 'Quotes read back', 'Numbers checked against the original', 'Headline matches the story'],
    words: [250, 800],
    rubric: [ACCURACY, SOURCING, STRUCTURE, CLARITY, ETHICS],
  },
  {
    id: 'kit-feature', form: 'feature', bands: ['middle', 'high', 'university'], title: 'Feature', emoji: '✨',
    pitch: 'A story about people, place or a trend — scene, character and a reason it matters now.',
    lessonId: 'jr-hs-1', exhibitRoom: 'presses', fields: ['dek', 'lede', 'quotes', 'sources'],
    steps: ['Open on a scene or a person.', 'Say why it matters now (the "nut graf").', 'Alternate scene and information.', 'End on an image or a quote, not a summary.'],
    checklist: ['Nut graf within the first five paragraphs', 'Scenes are reported, not imagined', 'Every person consented', 'Facts attributed'],
    words: [400, 1500],
    rubric: [SOURCING, STRUCTURE, CLARITY, ETHICS],
  },
  {
    id: 'kit-opinion', form: 'opinion', bands: ['elementary', 'middle', 'high', 'university'], title: 'Opinion / Editorial', emoji: '🗣️',
    pitch: 'Take a side, openly — with reporting, the strongest counterargument, and what readers can do.',
    lessonId: 'jr-hs-6', exhibitRoom: 'newsroom', fields: ['dek', 'counterpoint', 'sources'],
    steps: ['State the issue in one sentence.', 'Say your position early.', 'Give your best evidence, with sources.', 'State the strongest counterargument fairly.', 'Answer it.', 'Tell readers what they can do.'],
    checklist: ['Labelled as opinion', 'Evidence is checkable and sourced', 'Strongest counterargument stated fairly', 'Not written about my own beat'],
    words: [250, 700],
    rubric: [c('Position & reasoning', 'No clear position', 'Position with weak support', 'Clear position, sourced support', 'Compelling, sourced, anticipates objections'), c('Counterargument', 'Ignored', 'Stated weakly', 'Stated fairly and answered', 'Strongest version stated and convincingly answered'), CLARITY, ETHICS],
  },
  {
    id: 'kit-broadcast', form: 'broadcast', bands: ['elementary', 'middle', 'high', 'university'], title: 'Broadcast / Podcast Script', emoji: '📻',
    pitch: 'A timed script written for the ear, ready to record in Fabula.',
    lessonId: 'jr-hs-5', fields: ['script', 'sources'],
    steps: ['Short sentences, one idea each.', 'Attribution first.', 'Round the numbers.', 'Repeat the key fact near the end.', 'Read it aloud and time it.'],
    checklist: ['Under the time limit at reading speed', 'Attribution before claims', 'Key fact repeated', 'Sound and video cues noted'],
    words: [60, 350],
    rubric: [ACCURACY, c('Written for the ear', 'Long, complex sentences', 'Some sentences too long', 'Short, clear, attribution first', 'Natural, timed, easy to follow on one listen'), CLARITY],
  },
  {
    id: 'kit-records', form: 'records-request', bands: ['high', 'university'], title: 'Public Records Request', emoji: '🗂️',
    pitch: 'Draft a specific, statute-cited request for public records.',
    lessonId: 'jr-u-1', fields: ['records'],
    steps: ['Name the agency and its records officer.', 'Cite the statute (FOIA or your state law).', 'Describe the exact records, dates and format.', 'Ask for a fee waiver if you qualify.', 'Note the legal response deadline.'],
    checklist: ['Statute cited', 'Records described specifically', 'Date range included', 'Format requested', 'Deadline noted on your calendar'],
    words: [120, 500],
    rubric: [c('Specificity', 'Vague', 'Partly specific', 'Specific records, dates, format', 'Precise and hard to deny'), c('Legal basis', 'None', 'Statute named', 'Statute cited with deadlines', 'Cites statute, exemptions anticipated, fee waiver argued')],
  },
  {
    id: 'kit-investigation', form: 'investigation', bands: ['university'], title: 'Investigation Plan', emoji: '🔎',
    pitch: 'Hypothesis, paper trail, people in order, and the no-surprises letter.',
    lessonId: 'jr-u-2', fields: ['plan', 'records', 'sources', 'data'],
    steps: ['Write a testable hypothesis.', 'List ten documents that could prove or disprove it.', 'List people from the outside in.', 'Build a timeline.', 'Draft the no-surprises letter.'],
    checklist: ['Hypothesis is testable', 'Document plan has sources for each', 'Subject interviewed last', 'No-surprises letter lists every allegation', 'Every sentence traces to a file'],
    words: [400, 2500],
    rubric: [ACCURACY, SOURCING, c('Method', 'No plan', 'Partial plan', 'Hypothesis, documents, people', 'Rigorous plan that could disprove itself'), ETHICS],
  },
  {
    id: 'kit-newsletter', form: 'newsletter', bands: ['elementary', 'middle', 'high', 'university'], title: 'Newsletter Issue', emoji: '✉️',
    pitch: 'One lead story and a few briefs, with an honest subject line, for readers who asked for it.',
    lessonId: 'jr-pub-2', fields: ['dek'],
    steps: ['Write a subject line that tells the truth.', 'Pick one lead story.', 'Add two or three briefs.', 'Add a way to reply.'],
    checklist: ['Subject line is honest', 'Only approved stories included', 'Sent only to people who asked', 'Unsubscribe and contact included'],
    words: [100, 1200],
    rubric: [CLARITY, c('Audience fit', 'Unclear audience', 'Audience named', 'Content chosen for the audience', 'Useful, scannable, invites replies')],
  },
];

export const kitById = (id: string): StoryKit | undefined => STORY_KITS.find(k => k.id === id);
export const kitsForBand = (band: DepthLevel): StoryKit[] => STORY_KITS.filter(k => k.bands.includes(band));
/** Lessons whose "Make your own" step opens a kit other than the one that teaches it. */
const LESSON_KIT: Record<string, string> = {
  'jr-notice-1': 'kit-picture-news', 'jr-cub-4': 'kit-news-brief', 'jr-cub-5': 'kit-news-brief',
  'jr-ms-2': 'kit-news-story', 'jr-ms-3': 'kit-news-story', 'jr-ms-4': 'kit-news-story', 'jr-hs-1': 'kit-news-story', 'jr-hs-4': 'kit-news-story',
  'jr-hs-2': 'kit-opinion', 'jr-u-5': 'kit-news-story', 'jr-pub-4': 'kit-news-story',
};
/** Lessons whose assignment is distribution, not drafting — they open the Press Room. */
export const PRESS_LESSONS = new Set(['jr-cub-6', 'jr-hs-7', 'jr-pub-1']);

export const kitForLesson = (lessonId: string): StoryKit | undefined =>
  (LESSON_KIT[lessonId] && kitById(LESSON_KIT[lessonId])) || STORY_KITS.find(k => k.lessonId === lessonId);

/** Academia assignment seeds (data/assignmentTemplates.ts) → the kit students draft them in. */
export const SEED_KIT: Record<string, string> = {
  'seed-ela-35-interview': 'kit-interview',
  'seed-ela-68-news-story': 'kit-news-story',
  'seed-ela-912-editorial': 'kit-opinion',
};

/** Writers Desk project types → the kit that practises that form. */
export const KIT_FOR_DESK_TYPE: Record<string, string> = {
  ARTICLE: 'kit-news-story', COLUMN: 'kit-opinion', ESSAY: 'kit-opinion', NEWSLETTER: 'kit-newsletter', PODCAST: 'kit-broadcast', SCRIPT: 'kit-broadcast',
};

export const BAND_LABEL: Record<DepthLevel, string> = {
  early: 'PreK–2', elementary: 'Grades 3–5', middle: 'Grades 6–8', high: 'Grades 9–12', university: 'University',
};
