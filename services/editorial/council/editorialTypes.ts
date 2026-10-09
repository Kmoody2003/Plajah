// editorialTypes — the Editorial & Copyright Council as a working team.
//
// Eighteen editors (developmental by genre, line/copy, proofreading, acquisitions, publishing operations,
// sensitivity & accuracy, copyright & permissions, journalism verification + ethics, a reader advocate,
// world-literature and oral-narrative voices). Same two-layer shape as the art council: a deliberate AI
// service and a deterministic `localAdvice`. Aria is the only voice the author hears.
//
// OUTPUT CONTRACT (guidance, not orders): what is working (quoted + located) -> a plain-language verdict
// per dimension in words, never numbers -> notes that offer OPTIONS and end with "Your call" -> disagreement
// between editors surfaced -> severity Craft / Clarity / Risk -> the author accepts, adapts or declines each
// note and the decision is recorded.
import type { AriaEditorialLensId } from '../../aria/ariaCreativeRoles';

export type EditorId = AriaEditorialLensId;
export const EDITOR_IDS: EditorId[] = [
  'DEV_LITERARY', 'DEV_GENRE', 'DEV_YA_CHILDREN', 'DEV_NARRATIVE_NF', 'DEV_EXPOSITORY', 'DEV_POETRY', 'DEV_SERIAL',
  'LINE_COPY', 'PROOFREADER', 'ACQUISITIONS', 'PUB_OPS', 'SENSITIVITY', 'COPYRIGHT', 'JOURNALISM_VERIFY', 'JOURNALISM_ETHICS',
  'READER_ADVOCATE', 'WORLD_LIT', 'ORAL_NARRATIVE',
];

/** What kind of text is on the table. Steers who sits in and which deterministic checks run. */
export type ManuscriptKind = 'FICTION' | 'NONFICTION' | 'MEMOIR' | 'POETRY' | 'YOUNG_READERS' | 'SERIAL' | 'ARTICLE' | 'NEWSLETTER';
export const MANUSCRIPT_KINDS: ManuscriptKind[] = ['FICTION', 'NONFICTION', 'MEMOIR', 'POETRY', 'YOUNG_READERS', 'SERIAL', 'ARTICLE', 'NEWSLETTER'];
export const isJournalistic = (k: ManuscriptKind) => k === 'ARTICLE' || k === 'NEWSLETTER';

export type Severity = 'Craft' | 'Clarity' | 'Risk';
export type Band = 'Strong' | 'Developing' | 'Needs a rethink';
export const DIMENSIONS = ['premise', 'structure', 'character', 'voice', 'pacing', 'prose', 'market fit', 'readiness'] as const;
export type Dimension = typeof DIMENSIONS[number];
/** Journalism swaps character/premise for the integrity dimensions. */
export const JOURNALISM_DIMENSIONS = ['sourcing', 'fairness', 'harm', 'transparency', 'clarity', 'readiness'] as const;

export interface Editor {
  id: EditorId;
  name: string;
  epithet: string;
  medium: string;
  conviction: string;
  challenges: string;
  protects: string;
  background: string;
  genres: string[];
  /** kinds of text this editor is naturally cast for */
  kinds: ManuscriptKind[];
  voice: string;
  questions: string[];
  researchBeats: string[];
  blindSpots: string[];
  /** standing arguments, written BOTH ways: each side states its half */
  tensions: Partial<Record<EditorId, string>>;
  /** dimensions this editor is qualified to speak on */
  dimensions: string[];
}

/** A passage in the author's text, addressed by character offsets into the combined text plus a chapter label. */
export interface Anchor { chapterId?: string; chapterTitle?: string; start: number; end: number; quote: string }

export interface Working { editorId: EditorId; text: string; anchor?: Anchor }

export interface Note {
  id: string;
  editorId: EditorId;
  severity: Severity;
  dimension: string;
  /** stable fingerprint so a declined note is never raised again */
  fingerprint: string;
  headline: string;
  observation: string;
  anchor?: Anchor;
  /** options, not commands */
  options: string[];
  /** "Your call: X would change if you..." */
  yourCall: string;
  /** set when a metric (not a model) raised it */
  metric?: { name: string; value: string; explanation: string };
  source: 'ai' | 'local';
  /** set after the author pushed back and the council reconsidered */
  stance?: 'HOLDS' | 'SOFTENS' | 'WITHDRAWS';
}

export interface Verdict { dimension: string; band: Band | 'Not judged offline'; reasoning: string; editorId?: EditorId }
export interface Disagreement { between: [EditorId, EditorId]; about: string; sideA: string; sideB: string }
export interface RightsItem { id: string; severity: Severity; title: string; why: string; nextSteps: string[]; anchor?: Anchor; fingerprint: string }

export interface AuthorReply { at: number; noteId?: string; text: string; reconsideration?: string; stance?: 'HOLDS' | 'SOFTENS' | 'WITHDRAWS'; editorId?: EditorId }

export type DecisionChoice = 'ACCEPT' | 'ADAPT' | 'DECLINE';
export interface Decision { noteId: string; fingerprint: string; choice: DecisionChoice; note?: string; at: number }

export interface EditorialReport {
  working: Working[];
  verdicts: Verdict[];
  notes: Note[];
  disagreements: Disagreement[];
  rights: RightsItem[];
  /** Aria speaking to the author, naming the lead / counterpoint / editor without averaging */
  ariaSummary: string;
  synthesis?: { lead: EditorId; counterpoint: EditorId; editor: EditorId; keepFromCounterpoint: string };
  /** metrics shown with their explanations; never verdicts */
  metrics: MetricReading[];
  source: 'ai' | 'local' | 'mixed';
  limits: string[];
}

export interface MetricReading { name: string; value: string; explanation: string; where?: Anchor }

export type Scope = { kind: 'BOOK' } | { kind: 'CHAPTER'; chapterId: string } | { kind: 'SELECTION'; start: number; end: number };

export interface ManuscriptChapterInput { id: string; title: string; text: string; kind?: 'chapter' | 'front' | 'back' | 'toc' }

export interface ManuscriptInput {
  title?: string;
  kind: ManuscriptKind;
  genre?: string;
  chapters: ManuscriptChapterInput[];
  /** book metadata the author already entered (optional; unlocks front-matter / rights checks) */
  meta?: ManuscriptMeta;
  /** journalism only */
  article?: ArticleContext;
}
export interface ManuscriptMeta {
  description?: string; keywords?: string[]; bisac?: string[]; isbnMode?: 'none' | 'own' | 'platform';
  copyrightHolder?: string; copyrightYear?: string; license?: string;
  aiText?: 'none' | 'assisted' | 'generated'; aiImages?: 'none' | 'assisted' | 'generated'; aiTools?: string;
  publicDomain?: boolean; language?: string; hasCover?: boolean; penName?: string;
  contentWarnings?: string[]; audienceMinAge?: number | null;
}
export interface ArticleContext {
  headline?: string;
  disclosures?: { aiAssisted: boolean; aiNote?: string; sponsored: boolean; sponsorName?: string; affiliateLinks: boolean; conflictOfInterest: boolean; conflictNote?: string };
  imageRights?: Array<{ ref: string; credit: string; license: string; sourceUrl?: string }>;
  imageRefs?: string[];
  /** read-only view of the fact-check workbench. The council NEVER sets a status. */
  claims?: Array<{ text: string; status: 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED'; sources: number; humanVerified: boolean }>;
  aiUsedInEditor?: boolean;
  notices?: number;
}

export type Depth = 'QUICK' | 'FULL';
export type SessionStatus = 'RUNNING' | 'DONE' | 'FAILED';

export interface EditorialSession {
  id: string;
  uid: string;
  createdAt: number;
  depth: Depth;
  status: SessionStatus;
  kind: ManuscriptKind;
  title: string;
  scope: Scope;
  editors: EditorId[];
  wordCount: number;
  report?: EditorialReport;
  decisions: Decision[];
  replies: AuthorReply[];
  /** how many times the council reconsidered after the author pushed back */
  reconsiderations: number;
  reflections?: Array<{ editorId: EditorId; note: string }>;
  mode?: 'WHOLE' | 'DIGEST';
  error?: string;
}

export const NOT_LEGAL_ADVICE = 'This is not legal advice. It is orientation to help you ask better questions. Consult a qualified attorney for decisions.';
export const AI_EDITORS_LIMIT = 'These editors are AI. They read quickly and consistently but they are not human editors: they can misread tone, miss context only you hold, and be confidently wrong. Treat every note as a conversation starter and keep the decision.';
