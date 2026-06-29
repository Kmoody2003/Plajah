// educationStandards.ts — the international standards spine for Plajah's Learner Ledger.
//
// Standards are modeled as a GRAPH, not a checklist: each standard knows its prerequisites
// and its cross-walk edges to equivalent standards in other frameworks, so a competency
// mastered once renders in every framework and travels with the learner across borders.
//
// This seed is intentionally representative, not exhaustive — it establishes the schema and
// wires the reading domain to ReadingQuest's pillars/bands so Phase 3 can populate fully.
// New frameworks/standards are added by extending the registries below (or, in production,
// ingested machine-readable via CASE/1EdTech — see the blueprint, §5.2).

// ── Subjects, grades, frameworks ────────────────────────────────────────────────
export type Subject = 'ELA' | 'MATH' | 'SCIENCE' | 'SOCIAL' | 'LANGUAGE' | 'ARTS' | 'CS';

export type GradeId =
  | 'prek' | 'k' | 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6'
  | 'g7' | 'g8' | 'g9' | 'g10' | 'g11' | 'g12' | 'university';

export interface GradeLevel { id: GradeId; label: string; typicalAge: [number, number]; ordinal: number; }

export const GRADES: GradeLevel[] = [
  { id: 'prek', label: 'Pre-K', typicalAge: [3, 5], ordinal: 0 },
  { id: 'k', label: 'Kindergarten', typicalAge: [5, 6], ordinal: 1 },
  { id: 'g1', label: 'Grade 1', typicalAge: [6, 7], ordinal: 2 },
  { id: 'g2', label: 'Grade 2', typicalAge: [7, 8], ordinal: 3 },
  { id: 'g3', label: 'Grade 3', typicalAge: [8, 9], ordinal: 4 },
  { id: 'g4', label: 'Grade 4', typicalAge: [9, 10], ordinal: 5 },
  { id: 'g5', label: 'Grade 5', typicalAge: [10, 11], ordinal: 6 },
  { id: 'g6', label: 'Grade 6', typicalAge: [11, 12], ordinal: 7 },
  { id: 'g7', label: 'Grade 7', typicalAge: [12, 13], ordinal: 8 },
  { id: 'g8', label: 'Grade 8', typicalAge: [13, 14], ordinal: 9 },
  { id: 'g9', label: 'Grade 9', typicalAge: [14, 15], ordinal: 10 },
  { id: 'g10', label: 'Grade 10', typicalAge: [15, 16], ordinal: 11 },
  { id: 'g11', label: 'Grade 11', typicalAge: [16, 17], ordinal: 12 },
  { id: 'g12', label: 'Grade 12', typicalAge: [17, 18], ordinal: 13 },
  { id: 'university', label: 'University / Lifelong', typicalAge: [18, 99], ordinal: 14 },
];

export const gradeByOrdinal = (o: number): GradeLevel | undefined => GRADES.find(g => g.ordinal === o);
export const nextGrade = (id: GradeId): GradeLevel | undefined => {
  const g = GRADES.find(x => x.id === id);
  return g ? gradeByOrdinal(g.ordinal + 1) : undefined;
};

export type FrameworkId =
  | 'CCSS_ELA' | 'CCSS_MATH' | 'NGSS'              // United States
  | 'UK_NC' | 'CAMBRIDGE_PRIMARY' | 'IB_PYP' | 'SG_MATH'; // International

export interface StandardsFramework {
  id: FrameworkId;
  name: string;
  authority: string;
  region: string;
  subjects: Subject[];
}

export const FRAMEWORKS: StandardsFramework[] = [
  { id: 'CCSS_ELA', name: 'Common Core State Standards — ELA', authority: 'CCSSI', region: 'US', subjects: ['ELA'] },
  { id: 'CCSS_MATH', name: 'Common Core State Standards — Mathematics', authority: 'CCSSI', region: 'US', subjects: ['MATH'] },
  { id: 'NGSS', name: 'Next Generation Science Standards', authority: 'Achieve', region: 'US', subjects: ['SCIENCE'] },
  { id: 'UK_NC', name: 'National Curriculum for England', authority: 'DfE', region: 'UK', subjects: ['ELA', 'MATH', 'SCIENCE'] },
  { id: 'CAMBRIDGE_PRIMARY', name: 'Cambridge Primary', authority: 'Cambridge Assessment', region: 'International', subjects: ['ELA', 'MATH', 'SCIENCE'] },
  { id: 'IB_PYP', name: 'IB Primary Years Programme', authority: 'IBO', region: 'International', subjects: ['ELA', 'MATH', 'SCIENCE', 'SOCIAL', 'ARTS'] },
  { id: 'SG_MATH', name: 'Singapore Mathematics Syllabus', authority: 'Singapore MOE', region: 'Singapore', subjects: ['MATH'] },
];

export const frameworkById = (id: FrameworkId) => FRAMEWORKS.find(f => f.id === id);

// ── The standard (graph node) ───────────────────────────────────────────────────
export interface LearningStandard {
  id: string;                 // canonical, e.g. 'CCSS.ELA-LITERACY.RF.K.2'
  framework: FrameworkId;
  subject: Subject;
  grade: GradeId;
  domain: string;             // e.g. 'Phonological Awareness'
  code: string;               // short human code, e.g. 'RF.K.2'
  statement: string;          // the can-do, learner-facing
  prerequisites?: string[];   // ids that should precede this one (the graph edges)
  crosswalk?: string[];       // equivalent standards in OTHER frameworks (portability)
  pillar?: string;            // optional link to a ReadingQuest pillar
}

// Reading-domain seed: Common Core ELA foundational + comprehension, prek→g5, pillar-linked,
// with prerequisite edges and a few international cross-walks. This connects directly to
// ReadingQuest's five pillars so game completions can write standard-level ledger records.
export const STANDARDS: LearningStandard[] = [
  // ── Phonemic Awareness ──
  { id: 'CCSS.ELA-LITERACY.RF.PK.2', framework: 'CCSS_ELA', subject: 'ELA', grade: 'prek', domain: 'Phonological Awareness', code: 'RF.PK.2', statement: 'Recognize and produce rhyming words and beginning sounds.', pillar: 'Phonemic Awareness' },
  { id: 'CCSS.ELA-LITERACY.RF.K.2', framework: 'CCSS_ELA', subject: 'ELA', grade: 'k', domain: 'Phonological Awareness', code: 'RF.K.2', statement: 'Blend and segment the sounds (phonemes) in spoken words.', prerequisites: ['CCSS.ELA-LITERACY.RF.PK.2'], crosswalk: ['UK_NC.Y1.WR.BLEND'], pillar: 'Phonemic Awareness' },
  { id: 'CCSS.ELA-LITERACY.RF.1.2', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g1', domain: 'Phonological Awareness', code: 'RF.1.2', statement: 'Distinguish long and short vowel sounds and blend phonemes in single-syllable words.', prerequisites: ['CCSS.ELA-LITERACY.RF.K.2'], pillar: 'Phonemic Awareness' },

  // ── Phonics ──
  { id: 'CCSS.ELA-LITERACY.RF.K.3', framework: 'CCSS_ELA', subject: 'ELA', grade: 'k', domain: 'Phonics & Word Recognition', code: 'RF.K.3', statement: 'Know letter-sound correspondences and decode regular CVC words.', prerequisites: ['CCSS.ELA-LITERACY.RF.K.2'], pillar: 'Phonics' },
  { id: 'CCSS.ELA-LITERACY.RF.1.3', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g1', domain: 'Phonics & Word Recognition', code: 'RF.1.3', statement: 'Decode words with digraphs, blends, and common spelling patterns.', prerequisites: ['CCSS.ELA-LITERACY.RF.K.3'], crosswalk: ['UK_NC.Y1.WR.GPC'], pillar: 'Phonics' },
  { id: 'CCSS.ELA-LITERACY.RF.3.3', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g3', domain: 'Phonics & Word Recognition', code: 'RF.3.3', statement: 'Decode multisyllable words using prefixes, suffixes, and roots.', prerequisites: ['CCSS.ELA-LITERACY.RF.1.3'], pillar: 'Phonics' },

  // ── Fluency ──
  { id: 'CCSS.ELA-LITERACY.RF.1.4', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g1', domain: 'Fluency', code: 'RF.1.4', statement: 'Read grade-level text with accuracy and appropriate rate to support comprehension.', prerequisites: ['CCSS.ELA-LITERACY.RF.1.3'], pillar: 'Fluency' },
  { id: 'CCSS.ELA-LITERACY.RF.4.4', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g4', domain: 'Fluency', code: 'RF.4.4', statement: 'Read grade-level prose and poetry with accuracy, rate, and expression (prosody).', prerequisites: ['CCSS.ELA-LITERACY.RF.1.4'], pillar: 'Fluency' },

  // ── Vocabulary ──
  { id: 'CCSS.ELA-LITERACY.L.1.4', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g1', domain: 'Vocabulary Acquisition', code: 'L.1.4', statement: 'Determine the meaning of unknown words using context and known affixes.', pillar: 'Vocabulary' },
  { id: 'CCSS.ELA-LITERACY.L.4.4', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g4', domain: 'Vocabulary Acquisition', code: 'L.4.4', statement: 'Use context, Greek/Latin roots, and reference tools to determine word meaning.', prerequisites: ['CCSS.ELA-LITERACY.L.1.4'], crosswalk: ['CAMBRIDGE_PRIMARY.S5.RD.VOCAB'], pillar: 'Vocabulary' },

  // ── Comprehension ──
  { id: 'CCSS.ELA-LITERACY.RL.K.1', framework: 'CCSS_ELA', subject: 'ELA', grade: 'k', domain: 'Reading: Literature', code: 'RL.K.1', statement: 'Ask and answer questions about key details in a text with support.', pillar: 'Comprehension' },
  { id: 'CCSS.ELA-LITERACY.RL.2.1', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g2', domain: 'Reading: Literature', code: 'RL.2.1', statement: 'Ask and answer who/what/where/when/why/how to demonstrate understanding.', prerequisites: ['CCSS.ELA-LITERACY.RL.K.1'], pillar: 'Comprehension' },
  { id: 'CCSS.ELA-LITERACY.RL.4.2', framework: 'CCSS_ELA', subject: 'ELA', grade: 'g4', domain: 'Reading: Literature', code: 'RL.4.2', statement: 'Determine theme and main idea and summarize the text.', prerequisites: ['CCSS.ELA-LITERACY.RL.2.1'], crosswalk: ['IB_PYP.UOI.NARRATIVE'], pillar: 'Comprehension' },

  // ── A few international anchors referenced by the cross-walks above ──
  { id: 'UK_NC.Y1.WR.BLEND', framework: 'UK_NC', subject: 'ELA', grade: 'g1', domain: 'Word Reading', code: 'Y1 WR', statement: 'Blend sounds in unfamiliar words using known grapheme-phoneme correspondences.', pillar: 'Phonemic Awareness' },
  { id: 'UK_NC.Y1.WR.GPC', framework: 'UK_NC', subject: 'ELA', grade: 'g1', domain: 'Word Reading', code: 'Y1 WR', statement: 'Apply phonic knowledge to decode words, including digraphs.', pillar: 'Phonics' },
  { id: 'CAMBRIDGE_PRIMARY.S5.RD.VOCAB', framework: 'CAMBRIDGE_PRIMARY', subject: 'ELA', grade: 'g4', domain: 'Reading', code: 'Stage 5 Rd', statement: 'Infer word meaning from context and morphology.', pillar: 'Vocabulary' },
  { id: 'IB_PYP.UOI.NARRATIVE', framework: 'IB_PYP', subject: 'ELA', grade: 'g4', domain: 'Language — Reading', code: 'PYP', statement: 'Identify central ideas and themes in narrative texts.', pillar: 'Comprehension' },
];

export const standardById = (id: string) => STANDARDS.find(s => s.id === id);
export const standardsForPillar = (pillar: string, framework: FrameworkId = 'CCSS_ELA') =>
  STANDARDS.filter(s => s.pillar === pillar && s.framework === framework);

/** Equivalent standards across frameworks (the portability edge), both directions. */
export const crosswalkOf = (id: string): LearningStandard[] => {
  const s = standardById(id);
  if (!s) return [];
  const forward = (s.crosswalk || []).map(standardById).filter(Boolean) as LearningStandard[];
  const backward = STANDARDS.filter(x => (x.crosswalk || []).includes(id));
  return [...forward, ...backward];
};

// Map ReadingQuest's grade bands to canonical grades (the bands span multiple grades).
export const BAND_TO_GRADES: Record<string, GradeId[]> = {
  prek: ['prek', 'k'],
  g12: ['g1', 'g2'],
  g34: ['g3', 'g4'],
  g57: ['g5', 'g6', 'g7'],
};

// ── Proficiency: one internal scale, mapped outward to global benchmarks ─────────
export type ProficiencyLevel = 'emerging' | 'developing' | 'proficient' | 'advanced' | 'turbo';

export interface ProficiencyBand { level: ProficiencyLevel; label: string; min: number; max: number; color: string; }

// Internal mastery is 0–100. "turbo" is a tier ABOVE advanced — beyond grade-level standards.
export const PROFICIENCY_BANDS: ProficiencyBand[] = [
  { level: 'emerging', label: 'Emerging', min: 0, max: 39, color: '#ff8080' },
  { level: 'developing', label: 'Developing', min: 40, max: 64, color: '#f5c542' },
  { level: 'proficient', label: 'Proficient', min: 65, max: 84, color: '#5fd17f' },
  { level: 'advanced', label: 'Advanced', min: 85, max: 96, color: '#36c5f0' },
  { level: 'turbo', label: 'Turbo', min: 97, max: 100, color: '#FF8C00' },
];

export const masteryToLevel = (score: number): ProficiencyLevel =>
  (PROFICIENCY_BANDS.find(b => score >= b.min && score <= b.max) || PROFICIENCY_BANDS[0]).level;

export const bandFor = (score: number): ProficiencyBand =>
  PROFICIENCY_BANDS.find(b => score >= b.min && score <= b.max) || PROFICIENCY_BANDS[0];

// CEFR (languages) — coarse mapping from internal mastery, for the global "where you stand" view.
export const masteryToCEFR = (score: number): string =>
  score >= 95 ? 'C2' : score >= 85 ? 'C1' : score >= 70 ? 'B2' : score >= 55 ? 'B1' : score >= 40 ? 'A2' : 'A1';

// PISA proficiency band (1–6) for global benchmarking of the individual learner.
export const masteryToPISABand = (score: number): number =>
  score >= 95 ? 6 : score >= 85 ? 5 : score >= 70 ? 4 : score >= 55 ? 3 : score >= 40 ? 2 : 1;

// ── Turbo: acceleration AND depth (see blueprint §4) ─────────────────────────────
export interface TurboChallenge {
  id: string;
  kind: 'acceleration' | 'depth' | 'transfer' | 'creative';
  standardId: string;          // the on-grade standard this extends beyond
  title: string;
  prompt: string;
}

export interface TurboTrack {
  subject: Subject;
  grade: GradeId;
  aboveGradeStandards: string[]; // vertical: next-grade standards unlocked early
  challenges: TurboChallenge[];  // horizontal: depth / transfer / creative enrichment
}

// Seed Turbo for early-reading (extends g1 phonics/comprehension upward + sideways).
export const TURBO_TRACKS: TurboTrack[] = [
  {
    subject: 'ELA', grade: 'g1',
    aboveGradeStandards: ['CCSS.ELA-LITERACY.RF.3.3', 'CCSS.ELA-LITERACY.RL.2.1'],
    challenges: [
      { id: 'turbo-morph-1', kind: 'depth', standardId: 'CCSS.ELA-LITERACY.RF.1.3', title: 'Word Architect', prompt: 'Build five new real words from the roots and affixes you just learned, and explain each meaning.' },
      { id: 'turbo-transfer-1', kind: 'transfer', standardId: 'CCSS.ELA-LITERACY.RL.K.1', title: 'Detective Read', prompt: 'Read a story you have never seen and predict the ending from clues — then check yourself.' },
      { id: 'turbo-create-1', kind: 'creative', standardId: 'CCSS.ELA-LITERACY.RF.1.2', title: 'Make a Rhyme Beat', prompt: 'Compose a short rhyming verse to a Chora track where every line blends the target sound.' },
    ],
  },
];

export const turboTrackFor = (subject: Subject, grade: GradeId): TurboTrack | undefined =>
  TURBO_TRACKS.find(t => t.subject === subject && t.grade === grade);

/** True when sustained mastery says the learner is ready to go beyond grade level. */
export const isTurboReady = (masteryByStandard: Record<string, number>, standardIds: string[]): boolean => {
  const scores = standardIds.map(id => masteryByStandard[id]).filter(n => typeof n === 'number');
  if (scores.length < Math.max(2, Math.ceil(standardIds.length * 0.6))) return false;
  return scores.every(s => s >= 90);
};
