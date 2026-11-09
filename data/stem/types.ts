// STEM track — the shapes. Academia's K–12 Science · Technology · Engineering · Math track, built on Plajah Build.
//
//   data/stem/units.*.ts   scope & sequence per grade band: units → lessons (complete) or lesson titles (outline)
//   data/stem/projects.ts  assignable Build projects: brief + rubric + the Build room and starter they open
//   services/stem/*        launch contract, classwork seeds, Tela worksheets, answer checks
//
// Two kinds of unit sit side by side in every band:
//   'electronics-math'  the math is the point and the circuit is the context (Ohm's law teaches proportion,
//                       RC charging teaches exponentials, the fret formula teaches logarithms…)
//   everything else     science, technology and engineering units where Build is the lab bench
//
// All lesson prose is original Plajah Academia writing. Standards are cited by code, never reproduced.

import type { IntlAlign } from '../../services/yearCurriculum/types';
import type { Rubric } from '../assignmentTemplates';

/** Same spelling as data/oerLibrary GradeBand, so a STEM project becomes an assignment template unchanged. */
export type StemBand = 'K-2' | '3-5' | '6-8' | '9-12';
export const STEM_BANDS: StemBand[] = ['K-2', '3-5', '6-8', '9-12'];
export const STEM_BAND_LABEL: Record<StemBand, string> = {
  'K-2': 'Grades K–2 · Tinkerers',
  '3-5': 'Grades 3–5 · Makers',
  '6-8': 'Grades 6–8 · Designers',
  '9-12': 'Grades 9–12 · Engineers',
};

export type StemStrand = 'science' | 'technology' | 'engineering' | 'math';

/** The Plajah Build rooms a lesson or project can open (launch contract with the Build hub). */
export type BuildRoom = 'elec' | 'cad' | 'sew' | 'bio' | 'exchange' | 'studio';

/**
 * What a lesson or project hands Plajah Build. Dispatched as the `plajah:openBuild` CustomEvent detail and parked
 * in sessionStorage['plajah:pendingBuild'] (services/stem/launch.ts).
 *   elec   `template` = a services/elec/recipes RECIPES id, and/or `prompt` for the describe-it designer
 *   sew    `template` = a services/soft/patterns SOFT_TEMPLATES id
 *   bio    `template` = a services/bio/models STARTERS id
 *   studio `starter.shapes` = Build Studio shape kinds to place; `prompt` describes the object
 *   cad / exchange  `prompt` only
 */
export interface BuildLaunch {
  room: BuildRoom;
  prompt?: string;
  template?: string;
  starter?: { shapes?: string[]; values?: Record<string, number | string | boolean>; note?: string };
  /** The STEM lesson or project id, so the room can show "you came here from …" and route the work back. */
  lesson?: string;
}

export interface StemStandards {
  /** NGSS performance expectations, e.g. '4-PS3-2', 'MS-ETS1-1', 'HS-PS2-6'. */
  ngss?: string[];
  /** Full CCSS-M codes, e.g. 'CCSS.MATH.CONTENT.6.RP.A.3' (same form data/yearCurriculum/mathUnits expands to). */
  ccss?: string[];
  /** CSTA K–12 CS standards, e.g. '1B-AP-10', '2-AP-13', '3A-DA-11'. */
  csta?: string[];
  /** England NC / Cambridge / IB / Singapore equivalents, free-text codes. */
  intl?: IntlAlign;
}

/**
 * A machine-checkable answer. The test suite recomputes `f(args)` with its own independent formulas and compares it
 * to the problem's `value`, so a typo in an answer key fails CI instead of reaching a student.
 *   ohmV [I,R] → V        ohmI [V,R] → I        ohmR [V,I] → R        power [V,I] → P
 *   series [R1,R2,…]      parallel [R1,R2,…]    product [a,b,…]       sum [a,b,…]
 *   quotient [a,b]        difference [a,b]      area [l,w]            perimeter [l,w]
 *   volume [l,w,h]        rcCharge [Vs,R,C,t] → V(t)                  rcTau [R,C] → τ
 *   fret [scale,n] → distance from nut          db [p2,p1] → 10·log10(p2/p1)        dbV [v2,v1] → 20·log10
 *   sine [amp,freq,t] → amp·sin(2πft)           rms [peak]            mean [x1,…]    range [x1,…]
 *   vecMag [x,y]          vecAngle [x,y] → degrees                   slope [x1,y1,x2,y2]
 *   pct [part,whole]      ledR [Vs,Vf,I] → (Vs−Vf)/I                 batteryHours [mAh,mA]
 *   gear [driverTeeth,drivenTeeth] → ratio driven/driver             ma [effortArm,loadArm] (lever)
 *   pow [base,exp]        log2 [x]              log10 [x]            sqrt [x]
 */
export type CheckFn =
  | 'ohmV' | 'ohmI' | 'ohmR' | 'power' | 'series' | 'parallel' | 'product' | 'sum' | 'quotient' | 'difference'
  | 'area' | 'perimeter' | 'volume' | 'rcCharge' | 'rcTau' | 'fret' | 'db' | 'dbV' | 'sine' | 'rms' | 'mean' | 'range'
  | 'vecMag' | 'vecAngle' | 'slope' | 'pct' | 'ledR' | 'batteryHours' | 'gear' | 'ma' | 'pow' | 'log2' | 'log10' | 'sqrt';
export interface Check { f: CheckFn; args: number[] }

export interface PracticeItem {
  q: string;
  /** Teacher key in words, with units. */
  answer: string;
  /** Numeric answer (in `unit`) when the item has one; checked against `check` by the tests. */
  value?: number;
  unit?: string;
  /** Absolute tolerance for `value` (default: 1% of |value|, min 0.01). */
  tol?: number;
  check?: Check;
  level: 1 | 2 | 3;
}

export interface WorkedExample { prompt: string; steps: string[]; answer: string }

export interface BuildActivity {
  title: string;
  /** What students do in the Build room, in order. Simulated first; a physical build only where safe for the band. */
  steps: string[];
  launch: BuildLaunch;
  /** Physical kit, if any. Simulation-only activities leave this empty. */
  materials?: string[];
}

export interface Differentiation {
  support: string[];
  extension: string[];
  /** English learners: sentence frames, cognates, visuals. */
  ell?: string;
  /** services/learningSupport Supports keys this lesson is designed to honour (readAloud, chunk, untimed, …). */
  supports?: string[];
}

export type SafetyLevel = 'sim-only' | 'low' | 'supervised';
export interface SafetyNote {
  /** sim-only: nothing physical; low: coin cells / AA packs ≤ 6 V, no heat; supervised: an adult runs the hazardous step. */
  level: SafetyLevel;
  note: string;
}

export interface StemLesson {
  id: string;
  title: string;
  minutes: number;
  strands: StemStrand[];
  /** "I can …" statements. */
  objectives: string[];
  /** [term, kid-appropriate definition]. */
  vocab: Array<[string, string]>;
  /** The opening question or demo, two or three sentences. */
  hook: string;
  build: BuildActivity;
  worked: WorkedExample[];
  practice: PracticeItem[];
  exitTicket: { q: string; answer: string };
  differentiation: Differentiation;
  safety: SafetyNote;
  standards: StemStandards;
  /** For electronics-math lessons: the math idea in one phrase ("unit rate", "exponential decay"). */
  mathFocus?: string;
  /** Museion discipline to send curious students to (data/scienceDisciplines ids: physics, engineering, cs, …). */
  museion?: string;
}

export type UnitKind = 'electronics-math' | 'science' | 'engineering' | 'technology';

export interface StemUnit {
  id: string;
  band: StemBand;
  /** Order within the band's year. */
  n: number;
  title: string;
  kind: UnitKind;
  strands: StemStrand[];
  /** complete = every lesson authored; outline = scope & sequence entry with lesson titles, authored next. */
  status: 'complete' | 'outline';
  weeks: number;
  bigIdea: string;
  essentialQuestion: string;
  standards: StemStandards;
  lessons: StemLesson[];
  /** Outline units: the planned lesson titles in order. */
  outline?: string[];
  /** Build projects (data/stem/projects.ts) that close the unit. */
  projectIds: string[];
  museion?: string;
}

export interface StemProject {
  id: string;
  band: StemBand;
  unitId: string;
  title: string;
  /** Which assignment-template subject it files under in the gradebook. */
  subject: 'math' | 'science';
  drivingQuestion: string;
  brief: string;
  deliverables: string[];
  /** Become the assignment's checklist steps (templateAssignments.steps). */
  steps: string[];
  launch: BuildLaunch;
  rubric: Rubric;
  standards: StemStandards;
  minutes: number;
  differentiation: { support: string; extension: string };
  safety: SafetyNote;
}
