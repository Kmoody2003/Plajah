// Year Curriculum: a full school year (36 weeks × 5 days) of Math and ELA lessons for K–8, each lesson carrying a
// worksheet that is generated, adapted to the learner and laid out as a native Tela document.
//
//   data/yearCurriculum/*      scope & sequence (units → weeks) and the reading passage library
//   services/yearCurriculum/*  lesson expansion, item generators, adaptation, story intelligence, Tela layout
//
// Everything here is deterministic: the same lesson + profile + seed always yields the same worksheet, so a teacher's
// printed copy, the student's fillable copy and the answer key never drift apart.

export type YearSubject = 'math' | 'ela';
export type YearGrade = 'k' | 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'g7' | 'g8';
export const YEAR_GRADES: YearGrade[] = ['k', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'];
export const GRADE_LABEL: Record<YearGrade, string> = { k: 'Kindergarten', g1: 'Grade 1', g2: 'Grade 2', g3: 'Grade 3', g4: 'Grade 4', g5: 'Grade 5', g6: 'Grade 6', g7: 'Grade 7', g8: 'Grade 8' };
export const gradeNum = (g: YearGrade) => (g === 'k' ? 0 : Number(g.slice(1)));

export type PassageBand = 'k2' | '35' | '68';
export const bandOf = (g: YearGrade): PassageBand => (gradeNum(g) <= 2 ? 'k2' : gradeNum(g) <= 5 ? '35' : '68');

/** International alignment shown beside the US (CCSS) code. Free text codes, e.g. uk: 'Y3 Number — multiplication'. */
export interface IntlAlign {
  /** England National Curriculum (Year = US grade + 1). */
  uk?: string;
  /** Cambridge Primary / Lower Secondary (Stage = US grade + 1). */
  cambridge?: string;
  /** IB PYP / MYP phase or strand. */
  ib?: string;
  /** Singapore MOE syllabus (math) or EL syllabus (ELA). */
  singapore?: string;
}

/** A skill a lesson practises: `skill` keys into the math or ELA generator catalog. */
export interface SkillRef {
  skill: string;
  /** Generator knobs (ranges, denominators, word lists…); each generator documents its own. */
  params?: Record<string, number | string>;
  /** The learner-facing target, written as "I can …". */
  can: string;
}

export interface UnitSpec {
  id: string;
  grade: YearGrade;
  subject: YearSubject;
  /** 1-based order in the year. */
  n: number;
  title: string;
  weeks: number;
  ccss: string[];
  intl: IntlAlign;
  bigIdea: string;
  essentialQuestion: string;
  vocab: string[];
  /** Skills in teaching order; the lesson expander spreads them across the unit's days. */
  skills: SkillRef[];
  /** ELA: the genres the unit's reading passages are drawn from. */
  genres?: PassageGenre[];
  /** ELA: the writing mode the unit builds toward. */
  writing?: 'opinion' | 'informative' | 'narrative' | 'research' | 'poetry' | 'argument';
  /** Culminating performance task for the unit's last day. */
  performanceTask: string;
}

export type LessonKind = 'launch' | 'learn' | 'practice' | 'review' | 'assess' | 'project';

export interface MiniLesson { iDo: string; weDo: string; youDo: string }

export interface DayLesson {
  id: string;
  grade: YearGrade;
  subject: YearSubject;
  week: number;          // 1..36
  day: number;           // 1..5
  dayOfYear: number;     // 1..180
  unitId: string;
  unitTitle: string;
  kind: LessonKind;
  title: string;
  objective: string;     // "I can …"
  ccss: string[];
  intl: IntlAlign;
  skills: SkillRef[];
  warmUp: string;
  miniLesson: MiniLesson;
  discussion: string;
  exitTicket: string;
  materials: string[];
  minutes: number;
  passageId?: string;
  writing?: UnitSpec['writing'];
  vocab: string[];
}

// ── Reading passages (story intelligence reads these) ───────────────────────

export type PassageGenre = 'fiction' | 'informational' | 'poetry' | 'folktale' | 'biography' | 'opinion' | 'drama';

export interface PassageQuestion {
  q: string;
  /** Correct answer first; the builder shuffles deterministically. */
  choices: string[];
  type: 'detail' | 'main-idea' | 'inference' | 'vocab' | 'craft' | 'theme' | 'sequence' | 'evidence' | 'compare';
  level: 1 | 2 | 3;
}

export interface Passage {
  id: string;
  band: PassageBand;
  genre: PassageGenre;
  title: string;
  /** "Original — Plajah Academia", or the tradition a folktale is retold from, or a public-domain source. */
  origin: string;
  /** Paragraphs separated by a blank line; poetry stanzas likewise, lines by single \n. */
  text: string;
  /** ELA focus skills the passage is strongest for (character, setting, main-idea, text-features, theme…). */
  focus: string[];
  /** [word, kid-friendly definition] — every word appears in the text. */
  vocab: Array<[string, string]>;
  questions: PassageQuestion[];
  writePrompt: string;
}

// ── Worksheets ───────────────────────────────────────────────────────────────

export type Tier = 'support' | 'core' | 'stretch';
export const TIER_LABEL: Record<Tier, string> = { support: 'Support', core: 'On level', stretch: 'Stretch' };

export type Visual =
  | { type: 'dots'; n: number; cols?: number; second?: number }
  | { type: 'tenframe'; n: number; frames?: number }
  | { type: 'numberline'; min: number; max: number; step: number; marks?: number[]; jumps?: Array<[number, number]>; labels?: 'all' | 'ends' | 'none'; fractionDen?: number }
  | { type: 'fraction'; parts: number; shaded: number; shape?: 'bar' | 'circle' }
  | { type: 'array'; rows: number; cols: number }
  | { type: 'shape'; shape: 'circle' | 'square' | 'triangle' | 'rectangle' | 'hexagon' | 'pentagon' | 'trapezoid' | 'rhombus' | 'cube' | 'cylinder' | 'cone' | 'sphere' }
  | { type: 'clock'; h: number; m: number }
  | { type: 'base10'; hundreds: number; tens: number; ones: number }
  | { type: 'coins'; coins: Array<'penny' | 'nickel' | 'dime' | 'quarter'> }
  | { type: 'gridRect'; w: number; h: number; showGrid: boolean; label?: boolean }
  | { type: 'coord'; points: Array<[number, number, string?]>; size: number; line?: [number, number, number, number] }
  | { type: 'barModel'; parts: Array<{ label: string; size: number }>; total?: string }
  | { type: 'tally'; n: number }
  | { type: 'barChart'; labels: string[]; values: number[]; scale: number }
  | { type: 'angle'; degrees: number }
  | { type: 'rightTriangle'; a: string; b: string; c: string }
  | { type: 'prism'; l: number; w: number; h: number };

export type ItemKind = 'answer' | 'choice' | 'write' | 'fill' | 'sort';

export interface WsItem {
  id: string;
  kind: ItemKind;
  /** Plain text; `___` marks an inline blank. */
  prompt: string;
  /** Teacher key. For `write`, a model answer or what to look for. */
  answer: string;
  choices?: string[];
  visual?: Visual;
  hint?: string;
  /** Lines of writing space (write) or answer-box height multiplier. */
  lines?: number;
  tolerance?: number;
  /** Numeric answers check by value; others by normalized text. */
  numeric?: boolean;
  points: number;
  skill: string;
  /** Item difficulty 1 (entry) … 3 (challenge). */
  level: 1 | 2 | 3;
}

export interface WorkedExample { prompt: string; steps: string[]; visual?: Visual }

export interface WsSection {
  id: string;
  title: string;
  directions: string;
  kind: 'warmup' | 'worked' | 'practice' | 'reading' | 'vocab' | 'writing' | 'challenge' | 'reflect';
  items: WsItem[];
  passageId?: string;
  example?: WorkedExample;
  /** Writing organizer boxes (e.g. ['Opinion', 'Reason 1', 'Reason 2', 'Conclusion']). */
  organizer?: string[];
  /** Two-column word bank shown above the items. */
  wordBank?: string[];
  /** Chunked support: render the section on its own page with a checkpoint. */
  ownPage?: boolean;
  checkpoint?: string;
}

export interface AdaptProfile {
  tier: Tier;
  /** services/learningSupport Supports subset that changes the page. */
  supports?: {
    easyRead?: boolean; textSize?: 0 | 1 | 2; lineFocus?: boolean; readAloud?: boolean; readQuestions?: boolean;
    calm?: boolean; mutedColor?: boolean; chunk?: boolean; untimed?: boolean; extraTime?: 1 | 1.5 | 2;
    fewerChoices?: boolean; retryFree?: boolean;
  };
  /** services/learningSupport Identity ids (dyslexic, dyscalculic, adhd, autistic, ell, …). */
  identities?: string[];
  /** Interests personalise word problems and writing prompts (soccer, space, cooking, music…). */
  interests?: string[];
  learnerName?: string;
  /** BCP-47 home language: adds a glossary line for vocab when not English. */
  homeLanguage?: string;
}

export interface Worksheet {
  id: string;
  lessonId: string;
  title: string;
  kicker: string;
  grade: YearGrade;
  subject: YearSubject;
  objective: string;
  ccss: string[];
  intl: IntlAlign;
  profile: AdaptProfile;
  sections: WsSection[];
  themeId: string;
  /** Plain-language list of what adaptation changed, printed on the teacher key and shown in the planner. */
  adaptations: string[];
  minutes: number;
  seed: number;
}
