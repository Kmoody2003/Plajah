/**
 * Plajah Art College — catalog model.
 *
 * Shape: Program (major) → Course (catalog entry, scope & sequence) → Unit (weeks of work with a
 * studio assignment, a critique format and, where it earns its place, real museum objects to study).
 * The same Courses are flattened into a `Curriculum` for the shared SchoolView reader (progress +
 * Academic Passport ledger) by data/artCollege/curriculum.ts, so there is one source of truth.
 *
 * AGE / ROLE GATE (decided and documented here, enforced in services/artCollege/audience.ts):
 *   - Nude/figure studies from museum collections are shown ONLY to a verified adult (birthYear on
 *     the profile says 18+, and not a child/teen account). Unknown age = minor = fail-closed.
 *   - Everyone else gets `isEducationSafeArtwork` filtering on every museum fetch, and any studio
 *     that needs the figure carries an `alt` brief (still life, animal, plaster cast, skeleton,
 *     garment-on-form) that satisfies the same outcomes without a model.
 */
import type { MuseumSource } from '../../services/museum';

export type Dept =
  | 'FND' | 'DRP' | 'SCU' | 'GRD' | 'ILL' | 'FAS' | 'PRT' | 'PHO' | 'AHI' | 'CRT' | 'PRO';

export const DEPT_LABEL: Record<Dept, string> = {
  FND: 'Foundation', DRP: 'Drawing & Painting', SCU: 'Sculpture & Ceramics', GRD: 'Graphic Design',
  ILL: 'Illustration', FAS: 'Fashion', PRT: 'Printmaking', PHO: 'Photography', AHI: 'Art History',
  CRT: 'Critical Studies', PRO: 'Professional Practice',
};

/** A pointer into the world's open museum collections: "study this object" for a unit. */
export interface StudyRef {
  /** Search query sent to the unified museum layer (specific beats broad: "Hokusai wave", not "Japanese"). */
  query: string;
  /** Restrict to sources strong in this subject; omit for all. */
  sources?: MuseumSource[];
  /** What to look for — the question the learner brings to the object. One or two sentences. */
  why: string;
  /** Needs the human figure / nudity in the results; shown to verified adults only. */
  figure?: boolean;
  /** Prefer 3D scans (Smithsonian / Europeana) — sculpture, ceramics, garments, architecture. */
  threeD?: boolean;
}

export type CritiqueId = 'feldman' | 'lerman' | 'desk' | 'wall' | 'design' | 'written' | 'seminar' | 'portfolio';

export interface StudioBrief {
  prompt: string;
  /** What gets handed in and photographed/exported for the portfolio. */
  deliverable: string;
  tool?: 'PHOTO' | 'PIXELS' | 'FABULA' | 'LOREA' | 'NONE';
  /** The figure/nude study needs a model; minors and unknown ages do this instead. */
  figure?: boolean;
  alt?: string;
}

export interface CourseUnit {
  id: string;
  title: string;
  weeks: number;
  /** Original teaching text: the idea, the technique, the trap. 2–4 sentences, plain paragraphs. */
  teach: string;
  outcomes: string[];
  studio: StudioBrief;
  critique?: CritiqueId;
  study?: StudyRef[];
}

export type CourseFormat = 'studio' | 'seminar' | 'lecture-lab' | 'review';
export type RubricId = 'studio' | 'design' | 'writing' | 'portfolio';

export interface Course {
  /** 'DRP 201' */
  code: string;
  title: string;
  dept: Dept;
  /** 100 foundation · 200 intermediate · 300 advanced · 400 capstone */
  level: 100 | 200 | 300 | 400;
  credits: number;
  prereq: string[];
  format: CourseFormat;
  blurb: string;
  units: CourseUnit[];
  /** How the course grade is made, in percent; must sum to 100. */
  grading: { label: string; pct: number }[];
  rubric: RubricId;
  /** Portfolio piece(s) this course must leave behind. */
  portfolio: string;
  /** Existing Plajah studio/school this course is taught alongside. */
  bridge?: { label: string; view: string };
  /** Reading/viewing: primary sources and free texts only; prose here is never reproduced. */
  resources?: { label: string; url: string }[];
}

export type DegreeKind = 'BFA' | 'BA' | 'MINOR' | 'CERTIFICATE';

export interface Program {
  id: string;
  title: string;
  degree: DegreeKind;
  blurb: string;
  /** Total credits to graduate. */
  credits: number;
  /** Year-by-year plan: course codes. 'ELECTIVE:studio' etc. are filled by the learner. */
  years: { year: 1 | 2 | 3 | 4; label: string; courses: string[]; /** open 3-credit electives this year */ electives: number; review?: ReviewId }[];
  /** Career paths — real titles, no salary claims. */
  careers: string[];
  /** The thesis/capstone deliverable. */
  capstone: string;
}

export type ReviewId = 'foundation' | 'sophomore' | 'junior' | 'senior';

export interface PortfolioReview {
  id: ReviewId;
  title: string;
  when: string;
  /** What the learner submits. */
  submit: string[];
  /** What the panel asks. */
  panelAsks: string[];
  /** Pass bar, plainly. */
  bar: string;
}

export interface CritiqueFormat {
  id: CritiqueId;
  title: string;
  /** Fit: when to use it. */
  bestFor: string;
  /** Ordered steps, said as the facilitator would say them. */
  steps: { label: string; say: string }[];
  minutes: number;
  /** Tone rules. */
  ground: string[];
  source?: { label: string; url: string };
}

export interface RubricCriterion { id: string; label: string; levels: [string, string, string, string] }
export interface Rubric { id: RubricId; title: string; criteria: RubricCriterion[] }
