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
export type Subject =
  | 'ELA' | 'MATH' | 'SCIENCE' | 'SOCIAL' | 'LANGUAGE' | 'ARTS' | 'CS'
  // Flagship-program subjects (see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md).
  | 'FINLIT' | 'ECON' | 'CIVICS' | 'PHILOSOPHY' | 'REALESTATE';

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
  | 'UK_NC' | 'CAMBRIDGE_PRIMARY' | 'IB_PYP' | 'SG_MATH' // International
  // ── Flagship-program frameworks ──────────────────────────────────────────────
  // C3_SOCIAL must stay byte-identical to data/historyQuestData.ts C3_FRAMEWORK_ID
  // or History Quest's ledger records bucket under "General".
  | 'C3_SOCIAL'                                    // NCSS C3 Framework (civics/history/econ)
  | 'CEE_FINLIT'                                   // CEE + Jump$tart Personal Financial Education (2021)
  | 'CEE_ECON'                                     // CEE Voluntary National Content Standards in Economics
  | 'NCAS_MUSIC' | 'NCAS_MEDIA'                    // National Core Arts Standards (music / media arts)
  | 'PLAJAH_RE' | 'PLAJAH_PHIL'                    // Plajah-authored (no open national standard exists)
  | 'CEFR';                                        // Common European Framework of Reference for Languages                   // Plajah-authored (no open national standard exists)

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
  // ── Flagship-program frameworks. The standards DOCUMENTS are all-rights-reserved
  // (CEE/Jump$tart/NCSS/NCAS): we ALIGN and CITE, never host their text. Statements
  // below are learner-facing paraphrases authored for Plajah.
  { id: 'C3_SOCIAL', name: 'College, Career & Civic Life (C3) Framework', authority: 'NCSS', region: 'US', subjects: ['SOCIAL', 'CIVICS', 'ECON'] },
  { id: 'CEE_FINLIT', name: 'National Standards for Personal Financial Education', authority: 'CEE & Jump$tart Coalition', region: 'US', subjects: ['FINLIT'] },
  { id: 'CEE_ECON', name: 'Voluntary National Content Standards in Economics', authority: 'Council for Economic Education', region: 'US', subjects: ['ECON'] },
  { id: 'NCAS_MUSIC', name: 'National Core Arts Standards — Music', authority: 'NCCAS', region: 'US', subjects: ['ARTS'] },
  { id: 'NCAS_MEDIA', name: 'National Core Arts Standards — Media Arts', authority: 'NCCAS', region: 'US', subjects: ['ARTS'] },
  { id: 'PLAJAH_RE', name: 'Plajah Real Estate Progression', authority: 'Plajah Academia', region: 'US', subjects: ['REALESTATE'] },
  { id: 'PLAJAH_PHIL', name: 'Plajah Philosophy Progression', authority: 'Plajah Academia', region: 'International', subjects: ['PHILOSOPHY'] },
  { id: 'CEFR', name: 'Common European Framework of Reference for Languages', authority: 'Council of Europe', region: 'International', subjects: ['LANGUAGE'] },
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

  // ── Science (NGSS) — pillar-linked to ScienceQuest's practices ──
  { id: 'NGSS.K-LS1-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'k', domain: 'Living Things', code: 'K-LS1-1', statement: 'Observe what plants and animals need to survive.', pillar: 'Observe & Question' },
  { id: 'NGSS.K-PS2-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'k', domain: 'Forces & Motion', code: 'K-PS2-1', statement: 'Investigate how pushes and pulls change the motion of an object.', pillar: 'Investigate' },
  { id: 'NGSS.2-PS1-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'g2', domain: 'Matter', code: '2-PS1-1', statement: 'Describe and classify materials by their observable properties.', pillar: 'Observe & Question' },
  { id: 'NGSS.1-LS3-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'g1', domain: 'Heredity', code: '1-LS3-1', statement: 'Notice that young plants and animals are like, but not exactly like, their parents.', pillar: 'Analyze Data' },
  { id: 'NGSS.3-LS1-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'g3', domain: 'Life Cycles', code: '3-LS1-1', statement: 'Develop a model of the life cycles of different organisms.', pillar: 'Model & Design', prerequisites: ['NGSS.K-LS1-1'] },
  { id: 'NGSS.4-PS3-2', framework: 'NGSS', subject: 'SCIENCE', grade: 'g4', domain: 'Energy', code: '4-PS3-2', statement: 'Explain how energy is transferred by sound, light, heat, and electric currents.', pillar: 'Explain' },
  { id: 'NGSS.4-ESS2-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'g4', domain: 'Earth Systems', code: '4-ESS2-1', statement: 'Analyze observations of weathering and erosion shaping the land.', pillar: 'Analyze Data' },
  { id: 'NGSS.5-PS1-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'g5', domain: 'Matter', code: '5-PS1-1', statement: 'Develop a model showing that matter is made of particles too small to see.', pillar: 'Model & Design', prerequisites: ['NGSS.2-PS1-1'] },
  { id: 'NGSS.MS-LS1-1', framework: 'NGSS', subject: 'SCIENCE', grade: 'g7', domain: 'Cells', code: 'MS-LS1-1', statement: 'Provide evidence that living things are made of cells.', pillar: 'Explain' },
  { id: 'NGSS.MS-PS1-2', framework: 'NGSS', subject: 'SCIENCE', grade: 'g6', domain: 'Chemical Reactions', code: 'MS-PS1-2', statement: 'Analyze data to determine whether a chemical reaction has occurred.', pillar: 'Analyze Data' },

  // ── Math (Common Core) — one core standard per grade, used by MathClassroom (grades 1–8) ──
  { id: 'CCSS.MATH.1.OA', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g1', domain: 'Operations & Algebraic Thinking', code: '1.OA', statement: 'Add and subtract within 20.' },
  { id: 'CCSS.MATH.2.NBT', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g2', domain: 'Number & Operations in Base Ten', code: '2.NBT', statement: 'Add and subtract within 100 using place value.', prerequisites: ['CCSS.MATH.1.OA'] },
  { id: 'CCSS.MATH.3.OA', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g3', domain: 'Operations & Algebraic Thinking', code: '3.OA', statement: 'Multiply and divide within 100 and understand fractions.', prerequisites: ['CCSS.MATH.2.NBT'] },
  { id: 'CCSS.MATH.4.NF', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g4', domain: 'Number & Operations — Fractions', code: '4.NF', statement: 'Build, compare, and operate on fractions; multi-digit arithmetic.', prerequisites: ['CCSS.MATH.3.OA'] },
  { id: 'CCSS.MATH.5.NF', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g5', domain: 'Number & Operations — Fractions', code: '5.NF', statement: 'Add, subtract, multiply, and divide fractions and decimals.', prerequisites: ['CCSS.MATH.4.NF'] },
  { id: 'CCSS.MATH.6.RP', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g6', domain: 'Ratios & Proportional Relationships', code: '6.RP', statement: 'Understand ratios, unit rates, and percent.', prerequisites: ['CCSS.MATH.5.NF'] },
  { id: 'CCSS.MATH.7.EE', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g7', domain: 'Expressions & Equations', code: '7.EE', statement: 'Solve linear equations and inequalities.', prerequisites: ['CCSS.MATH.6.RP'] },
  { id: 'CCSS.MATH.8.EE', framework: 'CCSS_MATH', subject: 'MATH', grade: 'g8', domain: 'Expressions & Equations', code: '8.EE', statement: 'Work with linear functions, systems, and integer exponents.', prerequisites: ['CCSS.MATH.7.EE'] },

  // ══════════════════════════════════════════════════════════════════════════════
  // C3 FRAMEWORK (NCSS) — history, civics, economics.
  // The D2.His.* ids MIRROR data/historyQuestData.ts byte-for-byte so History Quest
  // ledger records roll up by domain instead of bucketing under "General".
  // Grade spans map to their terminal grade: K-2 -> g2, 3-5 -> g5, 6-8 -> g8, 9-12 -> g12.
  // We ALIGN and CITE the C3 Framework; its text is not hosted. Statements are
  // learner-facing paraphrases authored for Plajah.
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'D2.His.1.K-2', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g2', domain: 'Chronology & Context', code: 'D2.His.1', statement: 'Create a chronological sequence of multiple events.', pillar: 'Chronology & Context' },
  { id: 'D2.His.1.3-5', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g5', domain: 'Chronology & Context', code: 'D2.His.1', statement: 'Create and use a chronological sequence of related events to compare developments that happened at the same time.', pillar: 'Chronology & Context', prerequisites: ['D2.His.1.K-2'] },
  { id: 'D2.His.1.6-8', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g8', domain: 'Chronology & Context', code: 'D2.His.1', statement: 'Analyze connections among events and developments in broader historical contexts.', pillar: 'Chronology & Context', prerequisites: ['D2.His.1.3-5'] },
  { id: 'D2.His.4.K-2', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g2', domain: 'Perspectives', code: 'D2.His.4', statement: 'Compare perspectives of people in the past to those of people in the present.', pillar: 'Perspectives' },
  { id: 'D2.His.4.3-5', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g5', domain: 'Perspectives', code: 'D2.His.4', statement: 'Explain why individuals and groups during the same historical period differed in their perspectives.', pillar: 'Perspectives', prerequisites: ['D2.His.4.K-2'] },
  { id: 'D2.His.4.6-8', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g8', domain: 'Perspectives', code: 'D2.His.4', statement: 'Analyze multiple factors that influenced the perspectives of people during different historical eras.', pillar: 'Perspectives', prerequisites: ['D2.His.4.3-5'] },
  { id: 'D2.His.10.K-2', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g2', domain: 'Sources & Evidence', code: 'D2.His.10', statement: 'Explain what a source tells us about life in the past.', pillar: 'Sources & Evidence' },
  { id: 'D2.His.10.3-5', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g5', domain: 'Sources & Evidence', code: 'D2.His.10', statement: 'Compare information from multiple sources about the same historical event.', pillar: 'Sources & Evidence', prerequisites: ['D2.His.10.K-2'] },
  { id: 'D2.His.10.6-8', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g8', domain: 'Sources & Evidence', code: 'D2.His.10', statement: 'Detect possible limitations in the historical record based on evidence collected from different sources.', pillar: 'Sources & Evidence', prerequisites: ['D2.His.10.3-5'] },
  { id: 'D2.His.14.K-2', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g2', domain: 'Causation & Argument', code: 'D2.His.14', statement: 'Generate possible reasons for an event or development in the past.', pillar: 'Causation & Argument' },
  { id: 'D2.His.14.3-5', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g5', domain: 'Causation & Argument', code: 'D2.His.14', statement: 'Explain probable causes and effects of events and developments.', pillar: 'Causation & Argument', prerequisites: ['D2.His.14.K-2'] },
  { id: 'D2.His.14.6-8', framework: 'C3_SOCIAL', subject: 'SOCIAL', grade: 'g8', domain: 'Causation & Argument', code: 'D2.His.14', statement: 'Explain multiple causes and effects of events and developments in the past.', pillar: 'Causation & Argument', prerequisites: ['D2.His.14.3-5'] },
  { id: 'D2.Civ.1.K-2', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g2', domain: 'Civic & Political Institutions', code: 'D2.Civ.1', statement: 'Describe roles and responsibilities of people in authority.', pillar: 'Structure of Government' },
  { id: 'D2.Civ.1.3-5', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g5', domain: 'Civic & Political Institutions', code: 'D2.Civ.1', statement: 'Distinguish the responsibilities and powers of government officials at various levels and branches of government.', pillar: 'Structure of Government', prerequisites: ['D2.Civ.1.K-2'] },
  { id: 'D2.Civ.1.6-8', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g8', domain: 'Civic & Political Institutions', code: 'D2.Civ.1', statement: 'Distinguish the powers and responsibilities of citizens, political parties, interest groups, and the media.', pillar: 'Structure of Government', prerequisites: ['D2.Civ.1.3-5'] },
  { id: 'D2.Civ.1.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Civic & Political Institutions', code: 'D2.Civ.1', statement: 'Distinguish the powers and responsibilities of local, state, tribal, national, and international civic and political institutions.', pillar: 'Structure of Government', prerequisites: ['D2.Civ.1.6-8'] },
  { id: 'D2.Civ.2.K-2', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g2', domain: 'Participation & Deliberation', code: 'D2.Civ.2', statement: 'Explain how all people, not just official leaders, play important roles in a community.', pillar: 'Rights & the Citizen' },
  { id: 'D2.Civ.2.3-5', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g5', domain: 'Participation & Deliberation', code: 'D2.Civ.2', statement: 'Explain how a democracy relies on responsible participation, and draw implications for how individuals should participate.', pillar: 'Rights & the Citizen', prerequisites: ['D2.Civ.2.K-2'] },
  { id: 'D2.Civ.2.6-8', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g8', domain: 'Participation & Deliberation', code: 'D2.Civ.2', statement: 'Explain specific roles played by citizens — voters, jurors, taxpayers, petitioners, protesters, and office-holders.', pillar: 'Rights & the Citizen', prerequisites: ['D2.Civ.2.3-5'] },
  { id: 'D2.Civ.2.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Participation & Deliberation', code: 'D2.Civ.2', statement: 'Analyze the role of citizens in the U.S. political system, with attention to theories of democracy and alternative models from other countries.', pillar: 'Rights & the Citizen', prerequisites: ['D2.Civ.2.6-8'] },
  { id: 'D2.Civ.3.6-8', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g8', domain: 'Processes, Rules & Laws', code: 'D2.Civ.3', statement: 'Examine the origins, purposes, and impact of constitutions, laws, treaties, and international agreements.', pillar: 'The Living Constitution' },
  { id: 'D2.Civ.3.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Processes, Rules & Laws', code: 'D2.Civ.3', statement: 'Analyze the impact of constitutions, laws, treaties, and international agreements on the maintenance of national and international order.', pillar: 'The Living Constitution', prerequisites: ['D2.Civ.3.6-8'] },
  { id: 'D2.Civ.8.K-2', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g2', domain: 'Civic Virtues & Democratic Principles', code: 'D2.Civ.8', statement: 'Describe democratic principles such as equality, fairness, and respect for rules.', pillar: 'Foundations of Liberty' },
  { id: 'D2.Civ.8.3-5', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g5', domain: 'Civic Virtues & Democratic Principles', code: 'D2.Civ.8', statement: 'Identify core civic virtues and democratic principles that guide government, society, and communities.', pillar: 'Foundations of Liberty', prerequisites: ['D2.Civ.8.K-2'] },
  { id: 'D2.Civ.8.6-8', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g8', domain: 'Civic Virtues & Democratic Principles', code: 'D2.Civ.8', statement: 'Analyze ideas and principles contained in the founding documents of the United States, and explain how they influence the social and political system.', pillar: 'Foundations of Liberty', prerequisites: ['D2.Civ.8.3-5'] },
  { id: 'D2.Civ.8.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Civic Virtues & Democratic Principles', code: 'D2.Civ.8', statement: 'Evaluate social and political systems in different contexts, times, and places, that promote civic virtues and enact democratic principles.', pillar: 'Foundations of Liberty', prerequisites: ['D2.Civ.8.6-8'] },
  { id: 'D2.Civ.12.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Processes, Rules & Laws', code: 'D2.Civ.12', statement: 'Analyze how people use and challenge local, state, national, and international laws to address a variety of public issues.', pillar: 'Civic Action' },
  { id: 'D2.Civ.14.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Processes, Rules & Laws', code: 'D2.Civ.14', statement: 'Analyze historical, contemporary, and emerging means of changing societies, promoting the common good, and protecting rights.', pillar: 'Civic Action', prerequisites: ['D2.Civ.12.9-12'] },

  // ── Comparative government (Civics Hall Strand VI) ──
  // C3 supports comparison explicitly: Civ.4 (institutions, including international), Civ.6
  // (government/civil society/market relationships), Civ.10 (perspective), Civ.13 (policy outcomes).
  // Statements are written learner-facing in original wording — the C3 document is NCSS-copyrighted
  // and is aligned to and cited, never reproduced.
  { id: 'D2.Civ.4.6-8', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g8', domain: 'Participation & Deliberation', code: 'D2.Civ.4', statement: 'Compare what different institutions of government are allowed to do, and who holds each of them to account.', pillar: 'Comparative Civics' },
  { id: 'D2.Civ.4.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Participation & Deliberation', code: 'D2.Civ.4', statement: 'Explain how the design of a political institution — how it is chosen, what can overrule it, how it is changed — decides what that government can and cannot do.', pillar: 'Comparative Civics', prerequisites: ['D2.Civ.4.6-8'] },
  { id: 'D2.Civ.6.6-8', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g8', domain: 'Civic & Political Institutions', code: 'D2.Civ.6', statement: 'Describe how government, independent civil society and the market relate to one another in more than one country.', pillar: 'Comparative Civics' },
  { id: 'D2.Civ.6.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Civic & Political Institutions', code: 'D2.Civ.6', statement: 'Critique how governments, civil societies and markets check or fail to check one another across different political systems.', pillar: 'Comparative Civics', prerequisites: ['D2.Civ.6.6-8'] },
  { id: 'D2.Civ.10.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Civic Virtues & Democratic Principles', code: 'D2.Civ.10', statement: 'Analyse how your own position and interests shape which rights you notice being upheld and which you notice being broken.', pillar: 'Comparative Civics' },
  { id: 'D2.Civ.13.9-12', framework: 'C3_SOCIAL', subject: 'CIVICS', grade: 'g12', domain: 'Processes, Rules & Laws', code: 'D2.Civ.13', statement: 'Evaluate a constitutional rule by what it actually produced, including the consequences its authors did not intend.', pillar: 'Comparative Civics', prerequisites: ['D2.Civ.3.9-12'] },
  { id: 'D2.Eco.1.K-2', framework: 'C3_SOCIAL', subject: 'ECON', grade: 'g2', domain: 'Economic Decision Making', code: 'D2.Eco.1', statement: 'Explain how scarcity necessitates decision making.', pillar: 'Scarcity & Choice' },
  { id: 'D2.Eco.1.3-5', framework: 'C3_SOCIAL', subject: 'ECON', grade: 'g5', domain: 'Economic Decision Making', code: 'D2.Eco.1', statement: 'Compare the benefits and costs of individual choices.', pillar: 'Scarcity & Choice', prerequisites: ['D2.Eco.1.K-2'] },
  { id: 'D2.Eco.1.6-8', framework: 'C3_SOCIAL', subject: 'ECON', grade: 'g8', domain: 'Economic Decision Making', code: 'D2.Eco.1', statement: 'Explain how economic decisions affect the well-being of individuals, businesses, and society.', pillar: 'Scarcity & Choice', prerequisites: ['D2.Eco.1.3-5'] },
  { id: 'D2.Eco.1.9-12', framework: 'C3_SOCIAL', subject: 'ECON', grade: 'g12', domain: 'Economic Decision Making', code: 'D2.Eco.1', statement: 'Analyze how incentives influence choices that may result in policies with a range of costs and benefits for different groups.', pillar: 'Scarcity & Choice', prerequisites: ['D2.Eco.1.6-8'] },

  // ══════════════════════════════════════════════════════════════════════════════
  // CEE + JUMP$TART — National Standards for Personal Financial Education (2021)
  // Six topics, benchmarks at grades 4/8/12, plus Plajah Strand 6 (The Money of Business).
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'PFL.EARN.4', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g4', domain: 'Earning Income', code: 'PFL.EARN', statement: 'Explain that people earn income by working, and that different jobs pay different amounts.', pillar: 'Earning & Income' },
  { id: 'PFL.EARN.8', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g8', domain: 'Earning Income', code: 'PFL.EARN', statement: 'Analyze how education, skills, and career choices affect income, and explain payroll deductions and taxes.', pillar: 'Earning & Income', prerequisites: ['PFL.EARN.4'] },
  { id: 'PFL.EARN.12', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g12', domain: 'Earning Income', code: 'PFL.EARN', statement: 'Evaluate the costs and benefits of education and training decisions, and interpret a paycheck, W-4, and tax return.', pillar: 'Earning & Income', prerequisites: ['PFL.EARN.8'] },
  { id: 'PFL.SPEND.4', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g4', domain: 'Spending', code: 'PFL.SPEND', statement: 'Distinguish needs from wants and make a simple spending plan for a goal.', pillar: 'Spending & Budgeting' },
  { id: 'PFL.SPEND.8', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g8', domain: 'Spending', code: 'PFL.SPEND', statement: 'Build and adjust a budget, compare payment methods, and evaluate advertising claims.', pillar: 'Spending & Budgeting', prerequisites: ['PFL.SPEND.4'] },
  { id: 'PFL.SPEND.12', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g12', domain: 'Spending', code: 'PFL.SPEND', statement: 'Manage a personal budget across changing income and expenses, and evaluate major purchase decisions such as housing and transportation.', pillar: 'Spending & Budgeting', prerequisites: ['PFL.SPEND.8'] },
  { id: 'PFL.SAVE.4', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g4', domain: 'Saving', code: 'PFL.SAVE', statement: 'Explain why people save, and describe where savings can be kept safely.', pillar: 'Saving & Investing' },
  { id: 'PFL.SAVE.8', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g8', domain: 'Saving', code: 'PFL.SAVE', statement: 'Calculate simple and compound interest and explain how time affects savings growth.', pillar: 'Saving & Investing', prerequisites: ['PFL.SAVE.4'] },
  { id: 'PFL.SAVE.12', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g12', domain: 'Saving', code: 'PFL.SAVE', statement: 'Compare savings vehicles by return, liquidity, insurance, and fees, and plan an emergency fund.', pillar: 'Saving & Investing', prerequisites: ['PFL.SAVE.8'] },
  { id: 'PFL.INVEST.8', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g8', domain: 'Investing', code: 'PFL.INVEST', statement: 'Explain how investing differs from saving and how diversification reduces risk.', pillar: 'Saving & Investing' },
  { id: 'PFL.INVEST.12', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g12', domain: 'Investing', code: 'PFL.INVEST', statement: 'Analyze the risk and return of stocks, bonds, and funds, and explain the role of time horizon, fees, and retirement accounts.', pillar: 'Saving & Investing', prerequisites: ['PFL.INVEST.8'] },
  { id: 'PFL.CREDIT.4', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g4', domain: 'Managing Credit', code: 'PFL.CREDIT', statement: 'Explain that borrowing means repaying more than was borrowed.', pillar: 'Credit & Debt' },
  { id: 'PFL.CREDIT.8', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g8', domain: 'Managing Credit', code: 'PFL.CREDIT', statement: 'Describe how credit reports and credit scores work and what behaviors affect them.', pillar: 'Credit & Debt', prerequisites: ['PFL.CREDIT.4'] },
  { id: 'PFL.CREDIT.12', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g12', domain: 'Managing Credit', code: 'PFL.CREDIT', statement: 'Compare loan terms and total cost of credit, and construct a strategy to build credit and manage debt.', pillar: 'Credit & Debt', prerequisites: ['PFL.CREDIT.8'] },
  { id: 'PFL.RISK.4', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g4', domain: 'Managing Risk', code: 'PFL.RISK', statement: 'Identify everyday risks to money and property and simple ways to reduce them.', pillar: 'Risk & Protection' },
  { id: 'PFL.RISK.8', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g8', domain: 'Managing Risk', code: 'PFL.RISK', statement: 'Explain how insurance shares risk, and recognise common frauds and identity-theft tactics.', pillar: 'Risk & Protection', prerequisites: ['PFL.RISK.4'] },
  { id: 'PFL.RISK.12', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g12', domain: 'Managing Risk', code: 'PFL.RISK', statement: 'Evaluate insurance types and coverage levels, and take steps to protect identity and personal data.', pillar: 'Risk & Protection', prerequisites: ['PFL.RISK.8'] },
  { id: 'PFL.BIZ.12', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'g12', domain: 'The Money of Business', code: 'PFL.BIZ', statement: 'Explain how a venture earns revenue, incurs costs, and reports profit, and read a simple income statement.', pillar: 'The Money of Business', prerequisites: ['PFL.SPEND.12'] },
  { id: 'PFL.BIZ.ACCT', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'university', domain: 'The Money of Business', code: 'PFL.BIZ.ACCT', statement: 'Record transactions in a chart of accounts and prepare an income statement and balance sheet for a venture.', pillar: 'The Money of Business', prerequisites: ['PFL.BIZ.12'] },
  { id: 'PFL.BIZ.FIN', framework: 'CEE_FINLIT', subject: 'FINLIT', grade: 'university', domain: 'The Money of Business', code: 'PFL.BIZ.FIN', statement: 'Apply time value of money, unit economics, and cost of capital to evaluate a business decision or raise.', pillar: 'The Money of Business', prerequisites: ['PFL.BIZ.ACCT'] },

  // ══════════════════════════════════════════════════════════════════════════════
  // CEE — Voluntary National Content Standards in Economics (2nd ed.)
  // The canonical K-12 economics framework; we align and cite, we do not host its text.
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'CEE.ECON.1.4', framework: 'CEE_ECON', subject: 'ECON', grade: 'g4', domain: 'Scarcity', code: 'CEE.1', statement: 'Explain that people cannot have everything they want, so they must choose.', pillar: 'Scarcity & Choice' },
  { id: 'CEE.ECON.1.8', framework: 'CEE_ECON', subject: 'ECON', grade: 'g8', domain: 'Scarcity', code: 'CEE.1', statement: 'Explain how scarcity forces individuals and societies to make choices with opportunity costs.', pillar: 'Scarcity & Choice', prerequisites: ['CEE.ECON.1.4'] },
  { id: 'CEE.ECON.1.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Scarcity', code: 'CEE.1', statement: 'Analyze how scarcity and opportunity cost shape production, distribution, and consumption decisions.', pillar: 'Scarcity & Choice', prerequisites: ['CEE.ECON.1.8'] },
  { id: 'CEE.ECON.2.8', framework: 'CEE_ECON', subject: 'ECON', grade: 'g8', domain: 'Decision Making', code: 'CEE.2', statement: 'Compare marginal benefits and marginal costs to make a decision.', pillar: 'Scarcity & Choice' },
  { id: 'CEE.ECON.4.8', framework: 'CEE_ECON', subject: 'ECON', grade: 'g8', domain: 'Incentives', code: 'CEE.4', statement: 'Explain how people respond predictably to positive and negative incentives.', pillar: 'Markets & Prices' },
  { id: 'CEE.ECON.5.8', framework: 'CEE_ECON', subject: 'ECON', grade: 'g8', domain: 'Trade', code: 'CEE.5', statement: 'Explain how voluntary exchange makes both parties better off.', pillar: 'Markets & Prices' },
  { id: 'CEE.ECON.6.8', framework: 'CEE_ECON', subject: 'ECON', grade: 'g8', domain: 'Specialization', code: 'CEE.6', statement: 'Explain how specialization and division of labour increase productivity.', pillar: 'Markets & Prices', prerequisites: ['CEE.ECON.5.8'] },
  { id: 'CEE.ECON.7.8', framework: 'CEE_ECON', subject: 'ECON', grade: 'g8', domain: 'Markets & Prices', code: 'CEE.7', statement: 'Explain how supply and demand interact to determine market prices.', pillar: 'Markets & Prices', prerequisites: ['CEE.ECON.4.8'] },
  { id: 'CEE.ECON.7.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Markets & Prices', code: 'CEE.7', statement: 'Analyze how shifts in supply and demand affect equilibrium price and quantity in real markets.', pillar: 'Markets & Prices', prerequisites: ['CEE.ECON.7.8'] },
  { id: 'CEE.ECON.8.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Role of Prices', code: 'CEE.8', statement: 'Explain how prices signal information and allocate resources across an economy.', pillar: 'Markets & Prices', prerequisites: ['CEE.ECON.7.12'] },
  { id: 'CEE.ECON.9.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Competition & Market Structure', code: 'CEE.9', statement: 'Compare market structures and explain how competition affects price, quality, and innovation.', pillar: 'Markets & Prices', prerequisites: ['CEE.ECON.8.12'] },
  { id: 'CEE.ECON.11.8', framework: 'CEE_ECON', subject: 'ECON', grade: 'g8', domain: 'Money & Inflation', code: 'CEE.11', statement: 'Explain what money is, why it has value, and how inflation reduces purchasing power.', pillar: 'Money, Banking & the Fed' },
  { id: 'CEE.ECON.12.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Interest Rates', code: 'CEE.12', statement: 'Explain how interest rates are determined and how they affect saving, borrowing, and investment.', pillar: 'Money, Banking & the Fed', prerequisites: ['CEE.ECON.11.8'] },
  { id: 'CEE.ECON.14.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Entrepreneurship', code: 'CEE.14', statement: 'Explain how entrepreneurs take risks to organise resources and how innovation drives growth.', pillar: 'Systems & Policy' },
  { id: 'CEE.ECON.15.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Economic Growth', code: 'CEE.15', statement: 'Analyze how investment in capital, technology, and human capital raises productivity and living standards.', pillar: 'Systems & Policy', prerequisites: ['CEE.ECON.14.12'] },
  { id: 'CEE.ECON.18.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Economic Fluctuations', code: 'CEE.18', statement: 'Interpret GDP, unemployment, and price-level data to describe the state of an economy.', pillar: 'Economic Data & Reasoning', prerequisites: ['CEE.ECON.12.12'] },
  { id: 'CEE.ECON.20.12', framework: 'CEE_ECON', subject: 'ECON', grade: 'g12', domain: 'Fiscal & Monetary Policy', code: 'CEE.20', statement: 'Analyze how fiscal and monetary policy actions affect employment, output, and prices.', pillar: 'Systems & Policy', prerequisites: ['CEE.ECON.18.12'] },

  // ══════════════════════════════════════════════════════════════════════════════
  // NATIONAL CORE ARTS STANDARDS — MUSIC
  // Ids MIRROR data/choraCurriculum.ts so Conservatory completions roll up properly.
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'MU:Cr1.1', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g8', domain: 'Creating — Imagine', code: 'MU:Cr1.1', statement: 'Generate musical ideas for various purposes and contexts.', pillar: 'Creating' },
  { id: 'MU:Pr4.2', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g8', domain: 'Performing — Analyze', code: 'MU:Pr4.2', statement: 'Analyze the structure and context of varied musical works and their implications for performance.', pillar: 'Performing' },
  { id: 'MU:Re7.1', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g8', domain: 'Responding — Select', code: 'MU:Re7.1', statement: 'Choose music appropriate for a specific purpose or context and explain the choice.', pillar: 'Responding' },
  { id: 'MU:Re7.2', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g8', domain: 'Responding — Analyze', code: 'MU:Re7.2', statement: 'Analyze how the elements of music and context inform the response to a musical work.', pillar: 'Responding', prerequisites: ['MU:Re7.1'] },
  { id: 'MU:Re8.1', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g8', domain: 'Responding — Interpret', code: 'MU:Re8.1', statement: 'Support an interpretation of a musical work that reflects the creators or performers expressive intent.', pillar: 'Responding', prerequisites: ['MU:Re7.2'] },
  { id: 'MU:Re9.1', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g12', domain: 'Responding — Evaluate', code: 'MU:Re9.1', statement: 'Evaluate musical works and performances against established criteria.', pillar: 'Responding', prerequisites: ['MU:Re8.1'] },
  { id: 'MU:Cn11.0', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g12', domain: 'Connecting — Context', code: 'MU:Cn11.0', statement: 'Relate musical ideas and works to varied historical, social, and cultural contexts.', pillar: 'Connecting', prerequisites: ['MU:Re9.1'] },

  // ── Music Theory Studio (7 lessons x NOVICE/INTERMEDIATE/MAESTRO) — mirrors
  // components/MusicTheoryStudio.tsx LESSONS ids so completions roll up, crosswalked
  // to the NCAS MU:* anchors. NOVICE -> g5, INTERMEDIATE -> g8, MAESTRO -> g12.
  { id: 'THEORY.notes-basics', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g5', domain: 'Pitch & Notation', code: 'notes-basics', statement: 'Name pitches on the staff and locate them on an instrument.', pillar: 'Music Theory', crosswalk: ['MU:Pr4.2'] },
  { id: 'THEORY.rhythm-basics', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g5', domain: 'Rhythm & Metre', code: 'rhythm-basics', statement: 'Read and perform rhythms in common metres using standard note values.', pillar: 'Music Theory', prerequisites: ['THEORY.notes-basics'], crosswalk: ['MU:Pr4.2'] },
  { id: 'THEORY.major-scales', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g5', domain: 'Scales & Key', code: 'major-scales', statement: 'Build major scales and identify the key of a passage.', pillar: 'Music Theory', prerequisites: ['THEORY.rhythm-basics'], crosswalk: ['MU:Pr4.2', 'MU:Cr1.1'] },
  { id: 'THEORY.intervals', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g8', domain: 'Intervals', code: 'intervals', statement: 'Identify and construct intervals by ear and on the staff.', pillar: 'Music Theory', prerequisites: ['THEORY.major-scales'], crosswalk: ['MU:Re7.2'] },
  { id: 'THEORY.chords', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g8', domain: 'Harmony', code: 'chords', statement: 'Build triads and seventh chords and explain their function in a progression.', pillar: 'Music Theory', prerequisites: ['THEORY.intervals'], crosswalk: ['MU:Cr1.1', 'MU:Re8.1'] },
  { id: 'THEORY.modes', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g12', domain: 'Modes', code: 'modes', statement: 'Distinguish the diatonic modes and explain their characteristic colour.', pillar: 'Music Theory', prerequisites: ['THEORY.chords'], crosswalk: ['MU:Re9.1'] },
  { id: 'THEORY.counterpoint', framework: 'NCAS_MUSIC', subject: 'ARTS', grade: 'g12', domain: 'Counterpoint', code: 'counterpoint', statement: 'Write and analyse independent melodic lines following species-counterpoint principles.', pillar: 'Music Theory', prerequisites: ['THEORY.modes'], crosswalk: ['MU:Cr1.1', 'MU:Re9.1'] },

  // ── Language Quest (CEFR) — ids mirror the lesson ids in data/languageDecks.ts as
  // CEFR.<level>.<lesson>, so spaced-repetition completions roll up on the ledger.
  // Statements are learner-facing paraphrases, not reproduced CEFR descriptor text.
  { id: 'CEFR.A1.greetings', framework: 'CEFR', subject: 'LANGUAGE', grade: 'g5', domain: 'Spoken Interaction', code: 'A1', statement: 'Can use simple greetings, farewells, and basic courtesy expressions.', pillar: 'CEFR A1' },
  { id: 'CEFR.A1.numbers', framework: 'CEFR', subject: 'LANGUAGE', grade: 'g5', domain: 'Vocabulary & Everyday Use', code: 'A1', statement: 'Can understand and use numbers in everyday contexts such as counting, prices, and times.', pillar: 'CEFR A1', prerequisites: ['CEFR.A1.greetings'] },
  { id: 'CEFR.A1.colors', framework: 'CEFR', subject: 'LANGUAGE', grade: 'g5', domain: 'Vocabulary & Everyday Use', code: 'A1', statement: 'Can name common colours and use them to describe familiar objects.', pillar: 'CEFR A1', prerequisites: ['CEFR.A1.numbers'] },
  { id: 'CEFR.A1.food', framework: 'CEFR', subject: 'LANGUAGE', grade: 'g5', domain: 'Spoken Interaction', code: 'A1', statement: 'Can name common foods and drinks and order simple items.', pillar: 'CEFR A1', prerequisites: ['CEFR.A1.colors'] },
  { id: 'CEFR.A2.everyday', framework: 'CEFR', subject: 'LANGUAGE', grade: 'g8', domain: 'Spoken Interaction', code: 'A2', statement: 'Can handle short social exchanges on familiar everyday topics.', pillar: 'CEFR A2', prerequisites: ['CEFR.A1.food'] },
  { id: 'CEFR.A2.description', framework: 'CEFR', subject: 'LANGUAGE', grade: 'g8', domain: 'Production', code: 'A2', statement: 'Can describe people, places, and routines in a series of simple sentences.', pillar: 'CEFR A2', prerequisites: ['CEFR.A2.everyday'] },

  // ══════════════════════════════════════════════════════════════════════════════
  // NATIONAL CORE ARTS STANDARDS — MEDIA ARTS
  // Backs the 8-track Film School (was the bespoke PLAJAH-FILM framework).
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'MA:Cr1.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g8', domain: 'Creating — Conceive', code: 'MA:Cr1.1', statement: 'Generate ideas, goals, and solutions for original media artworks.', pillar: 'Creating' },
  { id: 'MA:Cr2.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g8', domain: 'Creating — Develop', code: 'MA:Cr2.1', statement: 'Organize and design artistic ideas, plans, prototypes, and production processes.', pillar: 'Creating', prerequisites: ['MA:Cr1.1'] },
  { id: 'MA:Cr3.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Creating — Construct', code: 'MA:Cr3.1', statement: 'Construct and refine media artworks through aesthetic and technical choices.', pillar: 'Creating', prerequisites: ['MA:Cr2.1'] },
  { id: 'MA:Pr5.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Producing — Skills', code: 'MA:Pr5.1', statement: 'Develop and apply creative, technical, and organizational skills in media production.', pillar: 'Producing', prerequisites: ['MA:Cr3.1'] },
  { id: 'MA:Pr6.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Producing — Present', code: 'MA:Pr6.1', statement: 'Present or distribute media artworks and evaluate their impact on an audience.', pillar: 'Producing', prerequisites: ['MA:Pr5.1'] },
  { id: 'MA:Re7.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g8', domain: 'Responding — Perceive', code: 'MA:Re7.1', statement: 'Analyze the qualities and relationships of the components in media artworks.', pillar: 'Responding' },
  { id: 'MA:Re8.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Responding — Interpret', code: 'MA:Re8.1', statement: 'Interpret meaning and intent in media artworks using evidence from the work and its context.', pillar: 'Responding', prerequisites: ['MA:Re7.1'] },
  { id: 'MA:Re9.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Responding — Evaluate', code: 'MA:Re9.1', statement: 'Evaluate media artworks against criteria including form, craft, and cultural context.', pillar: 'Responding', prerequisites: ['MA:Re8.1'] },
  { id: 'MA:Cn11.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Connecting — Context', code: 'MA:Cn11.1', statement: 'Relate media artworks to their social, cultural, historical, and ethical contexts.', pillar: 'Connecting', prerequisites: ['MA:Re9.1'] },

  // ── Film School (8 tracks, 59 lessons) — the bespoke FILM.* ids the curriculum
  // already emits, seeded under the real NCAS Media Arts framework and crosswalked
  // to their NCAS anchors. Generated from data/filmSchoolCurriculum.ts, so each
  // statement is the lesson's own learning claim. Keeps track-level granularity
  // that collapsing to ~9 NCAS codes would have thrown away.
  { id: 'FILM.FOUND.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.1', statement: 'What Cinema Actually Is', pillar: 'Foundations', crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.FOUND.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.2', statement: 'The Shot: Size, Angle, and What They Mean', pillar: 'Foundations', prerequisites: ['FILM.FOUND.1'], crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.FOUND.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.3', statement: 'The Cut: Why the Audience Doesn\'t Notice', pillar: 'Foundations', prerequisites: ['FILM.FOUND.2'], crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.FOUND.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.4', statement: 'Mise-en-Scène: Everything Inside the Frame', pillar: 'Foundations', prerequisites: ['FILM.FOUND.3'], crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.FOUND.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.5', statement: 'Sound Is Half the Picture', pillar: 'Foundations', prerequisites: ['FILM.FOUND.4'], crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.FOUND.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.6', statement: 'Movement: Camera, Subject, and the Frame as a Field', pillar: 'Foundations', prerequisites: ['FILM.FOUND.5'], crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.FOUND.7', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.7', statement: 'Genre and the Contract with the Audience', pillar: 'Foundations', prerequisites: ['FILM.FOUND.6'], crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.FOUND.8', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Film Foundations', code: 'FOUND.8', statement: 'How to Watch a Film Like a Filmmaker', pillar: 'Foundations', prerequisites: ['FILM.FOUND.7'], crosswalk: ['MA:Re7.1', 'MA:Cn11.1'] },
  { id: 'FILM.WRITE.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.1', statement: 'Premise, Logline, and the Idea That Can Carry Ninety Minutes', pillar: 'Screenwriting', crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.WRITE.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.2', statement: 'Three-Act Structure and What It Is Actually Describing', pillar: 'Screenwriting', prerequisites: ['FILM.WRITE.1'], crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.WRITE.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.3', statement: 'Format: The Page as a Production Document', pillar: 'Screenwriting', prerequisites: ['FILM.WRITE.2'], crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.WRITE.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.4', statement: 'The Scene: Conflict, Turn, and Getting Out Early', pillar: 'Screenwriting', prerequisites: ['FILM.WRITE.3'], crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.WRITE.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.5', statement: 'Dialogue and Subtext', pillar: 'Screenwriting', prerequisites: ['FILM.WRITE.4'], crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.WRITE.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.6', statement: 'Character: Want, Need, Wound, and the Lie', pillar: 'Screenwriting', prerequisites: ['FILM.WRITE.5'], crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.WRITE.7', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.7', statement: 'The Rewrite', pillar: 'Screenwriting', prerequisites: ['FILM.WRITE.6'], crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.WRITE.8', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Screenwriting', code: 'WRITE.8', statement: 'Writing Comedy: Structure, Not Jokes', pillar: 'Screenwriting', prerequisites: ['FILM.WRITE.7'], crosswalk: ['MA:Cr1.1', 'MA:Cr2.1'] },
  { id: 'FILM.DIR.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.1', statement: 'The Director\'s Actual Job', pillar: 'Directing', crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.DIR.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.2', statement: 'Coverage, Blocking, and the Shot List', pillar: 'Directing', prerequisites: ['FILM.DIR.1'], crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.DIR.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.3', statement: 'Composition and Perspective', pillar: 'Directing', prerequisites: ['FILM.DIR.2'], crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.DIR.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.4', statement: 'Camera Movement as Meaning', pillar: 'Directing', prerequisites: ['FILM.DIR.3'], crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.DIR.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.5', statement: 'Directing Actors', pillar: 'Directing', prerequisites: ['FILM.DIR.4'], crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.DIR.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.6', statement: 'Precision, Repetition, and Knowing When You Have It', pillar: 'Directing', prerequisites: ['FILM.DIR.5'], crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.DIR.7', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.7', statement: 'Directing Action and Physical Comedy', pillar: 'Directing', prerequisites: ['FILM.DIR.6'], crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.DIR.8', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Directing', code: 'DIR.8', statement: 'Tone: Holding One Note Across a Hundred Days', pillar: 'Directing', prerequisites: ['FILM.DIR.7'], crosswalk: ['MA:Cr3.1', 'MA:Pr5.1'] },
  { id: 'FILM.CINE.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Cinematography', code: 'CINE.1', statement: 'Exposure: Aperture, Shutter, ISO', pillar: 'Cinematography', crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.CINE.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Cinematography', code: 'CINE.2', statement: 'Lenses: Focal Length and the Shape of a Face', pillar: 'Cinematography', prerequisites: ['FILM.CINE.1'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.CINE.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Cinematography', code: 'CINE.3', statement: 'Lighting: Key, Fill, Back and the Ratio Between Them', pillar: 'Cinematography', prerequisites: ['FILM.CINE.2'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.CINE.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Cinematography', code: 'CINE.4', statement: 'Available Light, Night, and Shooting With Nothing', pillar: 'Cinematography', prerequisites: ['FILM.CINE.3'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.CINE.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Cinematography', code: 'CINE.5', statement: 'Colour: Temperature, Palette, and Grading', pillar: 'Cinematography', prerequisites: ['FILM.CINE.4'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.CINE.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Cinematography', code: 'CINE.6', statement: 'Camera Support and Operating', pillar: 'Cinematography', prerequisites: ['FILM.CINE.5'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.CINE.7', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Cinematography', code: 'CINE.7', statement: 'The Director–DP Partnership', pillar: 'Cinematography', prerequisites: ['FILM.CINE.6'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.EDIT.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Editing', code: 'EDIT.1', statement: 'What an Editor Is Deciding', pillar: 'Editing', crosswalk: ['MA:Cr3.1', 'MA:Re8.1'] },
  { id: 'FILM.EDIT.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Editing', code: 'EDIT.2', statement: 'The Rule of Six: What a Cut Owes', pillar: 'Editing', prerequisites: ['FILM.EDIT.1'], crosswalk: ['MA:Cr3.1', 'MA:Re8.1'] },
  { id: 'FILM.EDIT.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Editing', code: 'EDIT.3', statement: 'Montage: Meaning Made by Collision', pillar: 'Editing', prerequisites: ['FILM.EDIT.2'], crosswalk: ['MA:Cr3.1', 'MA:Re8.1'] },
  { id: 'FILM.EDIT.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Editing', code: 'EDIT.4', statement: 'Rhythm, Pace, and Time', pillar: 'Editing', prerequisites: ['FILM.EDIT.3'], crosswalk: ['MA:Cr3.1', 'MA:Re8.1'] },
  { id: 'FILM.EDIT.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Editing', code: 'EDIT.5', statement: 'Comedy Editing: Timing Is the Whole Craft', pillar: 'Editing', prerequisites: ['FILM.EDIT.4'], crosswalk: ['MA:Cr3.1', 'MA:Re8.1'] },
  { id: 'FILM.EDIT.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Editing', code: 'EDIT.6', statement: 'From Assembly to Picture Lock', pillar: 'Editing', prerequisites: ['FILM.EDIT.5'], crosswalk: ['MA:Cr3.1', 'MA:Re8.1'] },
  { id: 'FILM.EDIT.7', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Editing', code: 'EDIT.7', statement: 'Editing for Subjectivity', pillar: 'Editing', prerequisites: ['FILM.EDIT.6'], crosswalk: ['MA:Cr3.1', 'MA:Re8.1'] },
  { id: 'FILM.SND.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Sound', code: 'SND.1', statement: 'The Four Elements of a Soundtrack', pillar: 'Sound', crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.SND.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Sound', code: 'SND.2', statement: 'Production Sound: Get It Right on the Day', pillar: 'Sound', prerequisites: ['FILM.SND.1'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.SND.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Sound', code: 'SND.3', statement: 'Dialogue Editing and ADR', pillar: 'Sound', prerequisites: ['FILM.SND.2'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.SND.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Sound', code: 'SND.4', statement: 'Sound Design: Building a World That Was Never Recorded', pillar: 'Sound', prerequisites: ['FILM.SND.3'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.SND.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Sound', code: 'SND.5', statement: 'Score: What Music Is Allowed to Say', pillar: 'Sound', prerequisites: ['FILM.SND.4'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.SND.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'g12', domain: 'Sound', code: 'SND.6', statement: 'The Mix', pillar: 'Sound', prerequisites: ['FILM.SND.5'], crosswalk: ['MA:Pr5.1', 'MA:Cr3.1'] },
  { id: 'FILM.PROD.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Producing', code: 'PROD.1', statement: 'What a Producer Does', pillar: 'Producing', crosswalk: ['MA:Pr6.1', 'MA:Cr2.1'] },
  { id: 'FILM.PROD.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Producing', code: 'PROD.2', statement: 'Development and Rights', pillar: 'Producing', prerequisites: ['FILM.PROD.1'], crosswalk: ['MA:Pr6.1', 'MA:Cr2.1'] },
  { id: 'FILM.PROD.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Producing', code: 'PROD.3', statement: 'Budget and Schedule', pillar: 'Producing', prerequisites: ['FILM.PROD.2'], crosswalk: ['MA:Pr6.1', 'MA:Cr2.1'] },
  { id: 'FILM.PROD.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Producing', code: 'PROD.4', statement: 'Locations and the Geography Lie', pillar: 'Producing', prerequisites: ['FILM.PROD.3'], crosswalk: ['MA:Pr6.1', 'MA:Cr2.1'] },
  { id: 'FILM.PROD.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Producing', code: 'PROD.5', statement: 'Clearance, Copyright and the Public Domain', pillar: 'Producing', prerequisites: ['FILM.PROD.4'], crosswalk: ['MA:Pr6.1', 'MA:Cr2.1'] },
  { id: 'FILM.PROD.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Producing', code: 'PROD.6', statement: 'Post Pipeline and Delivery', pillar: 'Producing', prerequisites: ['FILM.PROD.5'], crosswalk: ['MA:Pr6.1', 'MA:Cr2.1'] },
  { id: 'FILM.PROD.7', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Producing', code: 'PROD.7', statement: 'Distribution, Festivals and Finding an Audience', pillar: 'Producing', prerequisites: ['FILM.PROD.6'], crosswalk: ['MA:Pr6.1', 'MA:Cr2.1'] },
  { id: 'FILM.ACT.1', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.1', statement: 'Stanislavski: The Root of Everything', pillar: 'Acting & the Craft', crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },
  { id: 'FILM.ACT.2', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.2', statement: 'The Method, Adler, and the American Split', pillar: 'Acting & the Craft', prerequisites: ['FILM.ACT.1'], crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },
  { id: 'FILM.ACT.3', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.3', statement: 'Meisner: Get Out of Your Own Head', pillar: 'Acting & the Craft', prerequisites: ['FILM.ACT.2'], crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },
  { id: 'FILM.ACT.4', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.4', statement: 'Practical Aesthetics: Play the Action', pillar: 'Acting & the Craft', prerequisites: ['FILM.ACT.3'], crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },
  { id: 'FILM.ACT.5', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.5', statement: 'Scene Study: Objectives, Obstacles, Beats and Tactics', pillar: 'Acting & the Craft', prerequisites: ['FILM.ACT.4'], crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },
  { id: 'FILM.ACT.6', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.6', statement: 'Acting for the Camera', pillar: 'Acting & the Craft', prerequisites: ['FILM.ACT.5'], crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },
  { id: 'FILM.ACT.7', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.7', statement: 'Audition and Self-Tape Craft', pillar: 'Acting & the Craft', prerequisites: ['FILM.ACT.6'], crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },
  { id: 'FILM.ACT.8', framework: 'NCAS_MEDIA', subject: 'ARTS', grade: 'university', domain: 'Acting & the Craft', code: 'ACT.8', statement: 'Voice and Movement: The Body as Instrument', pillar: 'Acting & the Craft', prerequisites: ['FILM.ACT.7'], crosswalk: ['MA:Pr5.1', 'MA:Re9.1'] },

  // ══════════════════════════════════════════════════════════════════════════════
  // PLAJAH REAL ESTATE PROGRESSION (authored)
  // No open national real-estate standard exists; this ladder is Plajah-authored and labelled as such.
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'PJRE.PROP.MS', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'g8', domain: 'Property & Home', code: 'PJRE.PROP', statement: 'Explain what owning property means, how renting differs from owning, and read a real parcel record.', pillar: 'Property & Home' },
  { id: 'PJRE.HOME.HS', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'g12', domain: 'Property & Home', code: 'PJRE.HOME', statement: 'Walk the homebuying journey end to end and interpret a Loan Estimate and Closing Disclosure.', pillar: 'Property & Home', prerequisites: ['PJRE.PROP.MS'] },
  { id: 'PJRE.AGENCY.HS', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'g12', domain: 'Agency & Transactions', code: 'PJRE.AGENCY', statement: 'Explain agency duties, purchase contracts, and how title transfers.', pillar: 'Agency & Transactions', prerequisites: ['PJRE.HOME.HS'] },
  { id: 'PJRE.VAL.HS', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'g12', domain: 'Valuation & Appraisal', code: 'PJRE.VAL', statement: 'Estimate value using the sales-comparison approach from real comparable sales.', pillar: 'Valuation & Appraisal', prerequisites: ['PJRE.HOME.HS'] },
  { id: 'PJRE.VAL.COL', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'university', domain: 'Valuation & Appraisal', code: 'PJRE.VAL.COL', statement: 'Apply the sales-comparison, cost, and income approaches, and reconcile an appraised value.', pillar: 'Valuation & Appraisal', prerequisites: ['PJRE.VAL.HS'] },
  { id: 'PJRE.FIN.COL', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'university', domain: 'Finance & Investment', code: 'PJRE.FIN', statement: 'Build a multi-year discounted-cash-flow pro forma with cap rate, NPV, IRR, and leverage.', pillar: 'Finance & Investment', prerequisites: ['PJRE.VAL.COL'] },
  { id: 'PJRE.FIN.PRO', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'university', domain: 'Finance & Investment', code: 'PJRE.FIN.PRO', statement: 'Analyze REIT, MBS, and CMBS structures and model an equity waterfall.', pillar: 'Finance & Investment', prerequisites: ['PJRE.FIN.COL'] },
  { id: 'PJRE.DEV.COL', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'university', domain: 'Development & Planning', code: 'PJRE.DEV', statement: 'Determine a legal buildable envelope from parcel dimensions and zoning, and test a massing for compliance.', pillar: 'Development & Planning', prerequisites: ['PJRE.VAL.COL'] },
  { id: 'PJRE.MKT.COL', framework: 'PLAJAH_RE', subject: 'REALESTATE', grade: 'university', domain: 'Markets, Data & Policy', code: 'PJRE.MKT', statement: 'Analyze a submarket using public housing data and defend a buy, hold, or pass recommendation.', pillar: 'Markets, Data & Policy', prerequisites: ['PJRE.FIN.COL'] },

  // ══════════════════════════════════════════════════════════════════════════════
  // PLAJAH PHILOSOPHY PROGRESSION (authored)
  // No US national philosophy standard exists; this ladder is Plajah-authored and labelled as such.
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'PJPH.WONDER.K2', framework: 'PLAJAH_PHIL', subject: 'PHILOSOPHY', grade: 'g2', domain: 'Inquiry', code: 'PJPH.WONDER', statement: 'Ask a philosophical question and give a reason for an answer in a community of inquiry.', pillar: 'Wonder & Inquiry' },
  { id: 'PJPH.INQ.35', framework: 'PLAJAH_PHIL', subject: 'PHILOSOPHY', grade: 'g5', domain: 'Inquiry', code: 'PJPH.INQ', statement: 'Build on and respectfully challenge the reasons others give, and change a view when the reasons warrant it.', pillar: 'Wonder & Inquiry', prerequisites: ['PJPH.WONDER.K2'] },
  { id: 'PJPH.ARG.68', framework: 'PLAJAH_PHIL', subject: 'PHILOSOPHY', grade: 'g8', domain: 'Argument & Logic', code: 'PJPH.ARG', statement: 'Identify premises and conclusions and name common informal fallacies.', pillar: 'Argument & Logic', prerequisites: ['PJPH.INQ.35'] },
  { id: 'PJPH.LOGIC.HS', framework: 'PLAJAH_PHIL', subject: 'PHILOSOPHY', grade: 'g12', domain: 'Argument & Logic', code: 'PJPH.LOGIC', statement: 'Translate arguments into truth-functional logic and construct a valid proof.', pillar: 'Argument & Logic', prerequisites: ['PJPH.ARG.68'] },
  { id: 'PJPH.ETH.HS', framework: 'PLAJAH_PHIL', subject: 'PHILOSOPHY', grade: 'g12', domain: 'Ethics', code: 'PJPH.ETH', statement: 'Apply consequentialist, deontological, and virtue frameworks to a contested case and defend a position.', pillar: 'Ethics', prerequisites: ['PJPH.ARG.68'] },
  { id: 'PJPH.HIST.COL', framework: 'PLAJAH_PHIL', subject: 'PHILOSOPHY', grade: 'university', domain: 'History of Philosophy', code: 'PJPH.HIST', statement: 'Trace a philosophical problem across ancient, early modern, and nineteenth-century primary texts.', pillar: 'History of Philosophy', prerequisites: ['PJPH.ETH.HS'] },
  { id: 'PJPH.POL.COL', framework: 'PLAJAH_PHIL', subject: 'PHILOSOPHY', grade: 'university', domain: 'Political Philosophy', code: 'PJPH.POL', statement: 'Analyze consent, liberty, and legitimacy in primary texts and connect them to constitutional practice.', pillar: 'Political Philosophy', prerequisites: ['PJPH.HIST.COL'] },
];

export const SCIENCE_PILLARS = ['Observe & Question', 'Investigate', 'Analyze Data', 'Explain', 'Model & Design'] as const;

// MathClassroom uses numeric grades (1–8) — map to the grade's core CCSS math standard.
const MATH_DOMAIN_BY_GRADE: Record<number, string> = { 1: 'OA', 2: 'NBT', 3: 'OA', 4: 'NF', 5: 'NF', 6: 'RP', 7: 'EE', 8: 'EE' };
export const mathStandardForGrade = (grade: number): LearningStandard | undefined => {
  const g = Math.max(1, Math.min(8, Math.round(grade)));
  return standardById(`CCSS.MATH.${g}.${MATH_DOMAIN_BY_GRADE[g]}`);
};

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

// Seed Turbo across reading bands — each extends grade-level standards upward (acceleration)
// and sideways (depth / transfer / creative). turboTrackFor() keys off the band's first grade.
export const TURBO_TRACKS: TurboTrack[] = [
  {
    subject: 'ELA', grade: 'prek',
    aboveGradeStandards: ['CCSS.ELA-LITERACY.RF.K.3', 'CCSS.ELA-LITERACY.RF.1.2'],
    challenges: [
      { id: 'turbo-prek-depth', kind: 'depth', standardId: 'CCSS.ELA-LITERACY.RF.PK.2', title: 'Sound Hunter', prompt: 'Find five things in the room that start with the same sound, and say each one out loud.' },
      { id: 'turbo-prek-transfer', kind: 'transfer', standardId: 'CCSS.ELA-LITERACY.RF.PK.2', title: 'Rhyme Maker', prompt: 'Make up a brand-new rhyming pair nobody taught you (real or silly) and use it in a sentence.' },
      { id: 'turbo-prek-create', kind: 'creative', standardId: 'CCSS.ELA-LITERACY.RF.PK.2', title: 'Clap-a-Word', prompt: 'Pick your favorite long word and clap out every beat (syllable) to a Chora track.' },
    ],
  },
  {
    subject: 'ELA', grade: 'g1',
    aboveGradeStandards: ['CCSS.ELA-LITERACY.RF.3.3', 'CCSS.ELA-LITERACY.RL.2.1'],
    challenges: [
      { id: 'turbo-morph-1', kind: 'depth', standardId: 'CCSS.ELA-LITERACY.RF.1.3', title: 'Word Architect', prompt: 'Build five new real words from the roots and affixes you just learned, and explain each meaning.' },
      { id: 'turbo-transfer-1', kind: 'transfer', standardId: 'CCSS.ELA-LITERACY.RL.K.1', title: 'Detective Read', prompt: 'Read a story you have never seen and predict the ending from clues — then check yourself.' },
      { id: 'turbo-create-1', kind: 'creative', standardId: 'CCSS.ELA-LITERACY.RF.1.2', title: 'Make a Rhyme Beat', prompt: 'Compose a short rhyming verse to a Chora track where every line blends the target sound.' },
    ],
  },
  {
    subject: 'ELA', grade: 'g3',
    aboveGradeStandards: ['CCSS.ELA-LITERACY.L.4.4', 'CCSS.ELA-LITERACY.RL.4.2'],
    challenges: [
      { id: 'turbo-g3-depth', kind: 'depth', standardId: 'CCSS.ELA-LITERACY.RF.3.3', title: 'Root Detective', prompt: 'Pick a Greek or Latin root and list four words that share it — predict each meaning before you check.' },
      { id: 'turbo-g3-transfer', kind: 'transfer', standardId: 'CCSS.ELA-LITERACY.RL.2.1', title: 'Two-Text Tie', prompt: 'Read two short texts on one topic and explain one thing they agree on and one they don\'t.' },
      { id: 'turbo-g3-create', kind: 'creative', standardId: 'CCSS.ELA-LITERACY.RL.4.2', title: 'Retell It Your Way', prompt: 'Retell a story you read as a short comic, song, or scene — keep the theme but change the setting.' },
    ],
  },
  {
    subject: 'ELA', grade: 'g5',
    aboveGradeStandards: ['CCSS.ELA-LITERACY.RL.4.2', 'CCSS.ELA-LITERACY.L.4.4'],
    challenges: [
      { id: 'turbo-g5-depth', kind: 'depth', standardId: 'CCSS.ELA-LITERACY.L.4.4', title: 'Shades of Meaning', prompt: 'Take one word and rank five synonyms from mildest to strongest — defend your order.' },
      { id: 'turbo-g5-transfer', kind: 'transfer', standardId: 'CCSS.ELA-LITERACY.RL.4.2', title: 'Theme Across Stories', prompt: 'Find the same theme in a book, a song, and a film, and explain how each one shows it differently.' },
      { id: 'turbo-g5-create', kind: 'creative', standardId: 'CCSS.ELA-LITERACY.RL.4.2', title: 'Author\'s Chair', prompt: 'Write an alternate ending that changes the theme — then explain what you changed and why.' },
    ],
  },
  {
    subject: 'SCIENCE', grade: 'g3',
    aboveGradeStandards: ['NGSS.5-PS1-1', 'NGSS.MS-LS1-1'],
    challenges: [
      { id: 'turbo-sci-g3-depth', kind: 'depth', standardId: 'NGSS.3-LS1-1', title: 'System Mapper', prompt: 'Pick an ecosystem and map five ways its living and non-living parts depend on each other.' },
      { id: 'turbo-sci-g3-transfer', kind: 'transfer', standardId: 'NGSS.4-PS3-2', title: 'Energy Detective', prompt: 'Trace the energy in something you use every day from its source all the way to its final form.' },
      { id: 'turbo-sci-g3-create', kind: 'creative', standardId: 'NGSS.3-LS1-1', title: 'Design an Investigation', prompt: 'Write a testable question and design a fair experiment to answer it — name your variables.' },
    ],
  },
  {
    subject: 'SCIENCE', grade: 'g5',
    aboveGradeStandards: ['NGSS.MS-PS1-2', 'NGSS.MS-LS1-1'],
    challenges: [
      { id: 'turbo-sci-g5-depth', kind: 'depth', standardId: 'NGSS.5-PS1-1', title: 'Particle Modeler', prompt: 'Draw a particle model that explains why a balloon shrinks in the cold — defend it with evidence.' },
      { id: 'turbo-sci-g5-transfer', kind: 'transfer', standardId: 'NGSS.MS-PS1-2', title: 'Reaction Hunter', prompt: 'Find three chemical reactions in your kitchen and list the evidence each one really happened.' },
      { id: 'turbo-sci-g5-create', kind: 'creative', standardId: 'NGSS.MS-LS1-1', title: 'Cell City', prompt: 'Invent a city where each building is a cell part — explain what each one does for the cell.' },
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
