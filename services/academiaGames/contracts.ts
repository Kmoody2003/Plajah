/**
 * Core contracts for the Plajah Academia & Elevate Handmade Game Suite.
 * Pure TypeScript types — zero React, Firebase, or WebAudio dependencies so
 * pedagogy, affective pacing, mentor hints, and journal compilation stay 100% deterministic and unit-tested.
 */

export type GradeBand = 'prek2' | 'g35' | 'g68' | 'g912';

export type WorldId =
  | 'reading'   // PreK–2+ Woodland Brook & Reading Nook (Voca + Living Books)
  | 'math'      // Grades 3–5+ Hillside Mill & Aqueduct (Singapore CPA)
  | 'science'   // Grades 6–8+ Dusk Conservatory & Bench (Museion + Bio/Elec)
  | 'studio'    // Grades 9–12 Archival Press & Flux Vitrine (Parametric/Topology)
  | 'history'   // Cross-Band Living Watercolor Map & Tabletop Diorama (ErasAtlas)
  | 'elevate';  // Phase 2 Preview: Elevate Church Olive-Grove Parable Pack

export type OraMood = 1 | 2 | 3 | 4 | 5; // Matches services/oraEdu.ts (1=Stormy .. 5=Sunny)

export type AtmospherePreset = 'sunlit' | 'rain' | 'dusk';

export type OerLicense = 'PD' | 'CC-BY' | 'CC-BY-SA' | 'ORIGINAL';

export interface StandardsTag {
  framework: 'CCSS' | 'NGSS' | 'C3' | 'PISA' | 'SINGAPORE' | 'LECTIO';
  code: string;
  label: string;
}

export type CpaStage = 'concrete' | 'pictorial' | 'abstract';

export interface UdlPrefs {
  dyslexiaSpacing: boolean;
  highContrastInk: boolean;
  reducedMotion: boolean;
  soundOn: boolean;
  voiceConsent: boolean; // Mirrors services/voca guardian speech-recognition rule
  showSyllables: boolean;
}

export const DEFAULT_UDL_PREFS: UdlPrefs = {
  dyslexiaSpacing: false,
  highContrastInk: false,
  reducedMotion: false,
  soundOn: false,
  voiceConsent: false,
  showSyllables: true,
};

export interface ReadingQuest {
  id: string;
  world: 'reading' | 'elevate';
  band: GradeBand;
  word: string;
  tiles: string[];          // Ordered letters / sound chunks to spell
  distractors: string[];    // Extra carved wooden tiles on the tray
  syllables: string[];
  storyLine: string;        // Warm storybook sentence spoken via childrensSpeech
  cognateHint?: string;     // Yasmin (ELL) cognate / visual meaning bridge
  scriptureRef?: string;    // Only populated for Elevate pack
  standards: StandardsTag[];
  license: OerLicense;
}

export interface MathWaterwheelQuest {
  id: string;
  band: GradeBand;
  title: string;
  storyPrompt: string;
  /** Target total in `denom` units (e.g. denom=8, targetTotal=8 means 1 whole). */
  denom: number;
  targetTotal: number;
  /** Fixed sluice A numerator (gives concrete anchor). */
  fixedA: number;
  /** Fixed sluice C numerator (0 if only 2 channels active). */
  fixedC: number;
  /** Starting numerator for player-adjustable sluice B. */
  initialB: number;
  minB: number;
  maxB: number;
  /** Optional second adjustable channel for Grades 4–5 multi-step challenges. */
  adjustableA?: boolean;
  standards: StandardsTag[];
  license: OerLicense;
}

export interface ScienceBenchQuest {
  id: string;
  band: GradeBand;
  specimenLatin: string;
  specimenTitle: string;
  assayTitle: string;
  prompt: string;
  /** Target healthy ranges (0..100) for canopy light, soil moisture, and galvanic voltage. */
  targetLight: [number, number];
  targetMoisture: [number, number];
  targetVoltage: [number, number];
  explanation: string;
  standards: StandardsTag[];
  license: OerLicense;
}

export interface FluxStudioQuest {
  id: string;
  band: GradeBand;
  folioTitle: string;
  prompt: string;
  /** Evaluation rule: coprime single knot, exact linked ring count, or specific (p,q) parity. */
  goalKind: 'single-knot' | 'linked-rings' | 'high-order-knot';
  targetLinks?: number;
  minP?: number;
  minQ?: number;
  insight: string;
  standards: StandardsTag[];
  license: OerLicense;
}

export interface HistoryDispatchQuest {
  id: string;
  band: GradeBand;
  era: 'ancient' | 'crossroads' | 'modern';
  eraLabel: string;
  ledgerTitle: string;
  yearLabel: string;
  place: string;
  scenario: string;
  sources: Array<{ id: string; speaker: string; role: string; excerpt: string }>;
  question: string;
  choices: Array<{ id: string; text: string; outcome: string; accurate: boolean }>;
  standards: StandardsTag[];
  license: OerLicense;
}

export interface MentorHint {
  seatId: string;
  seatName: string;
  seatTitle: string;
  seatColor: string;
  tier: 1 | 2 | 3; // 1=Socratic nudge, 2=Visual model, 3=Worked example scaffold
  heading: string;
  message: string;
  /** Explicitly states deterministic local engine vs. opt-in cloud AI. */
  provenance: 'deterministic-council';
}

export interface JournalEntry {
  id: string;
  createdAt: number;
  world: WorldId;
  band: GradeBand;
  title: string;
  summary: string;
  artifactNote: string;
  standards: StandardsTag[];
  /** Optional SVG sketch thumbnail or glyph kind rendered on the keepsake page. */
  emblem: 'lantern' | 'waterwheel' | 'oak' | 'knot' | 'astrolabe' | 'olive';
}

export interface WorldMeta {
  id: WorldId;
  simpleTitle: string;
  subtitle: string;
  defaultBand: GradeBand;
  plateUrl: string;
  accentHex: string;
  paperBg: string;
  inkHex: string;
  plajahEngines: string[];
}
