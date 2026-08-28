// richLessonStudio — the shared contract behind Academia's source-to-experience pipeline.
//
// The demo consumes this exact model. Production connectors can resolve the source locators,
// PoKee can reason across the entire source/class context, Claude can shape the narrative,
// and Aria remains the teacher-facing orchestrator. The UI never needs to know which model or
// archive produced a block: provenance and lane receipts travel with the lesson.

export type LessonSourceKind = 'link' | 'file' | 'document' | 'audio' | 'video' | 'image' | 'dataset' | 'model3d';
export type LessonSourceProvider = 'teacher' | 'loc' | 'met' | 'chora' | 'openstax' | 'gutenberg' | 'plajah-labs';
export type LessonBlockKind = 'hook' | 'audio' | 'video' | 'gallery' | 'quote' | 'data-viz' | 'model3d' | 'discussion' | 'check' | 'creation' | 'reflection';
export type LessonTemplateId = 'cinematic' | 'museum' | 'documentary' | 'data-story' | 'field-lab' | 'seminar';

export interface RichLessonSource {
  id: string;
  kind: LessonSourceKind;
  provider: LessonSourceProvider;
  title: string;
  creator?: string;
  url?: string;
  fileName?: string;
  excerpt?: string;
  license: 'PD' | 'CC-BY' | 'CC-BY-SA' | 'teacher-owned' | 'link-only';
  attribution: string;
  quotationReady: boolean;
  durationLabel?: string;
  accent: string;
}

export interface LearnerSignal {
  standard: string;
  mastery: number;
  label: string;
}

export interface DemoLearnerProfile {
  id: string;
  name: string;
  preferredName: string;
  interests: string[];
  strengths: string[];
  growthAreas: string[];
  supports: string[];
  language?: string;
  signals: LearnerSignal[];
}

export interface LessonStandard {
  framework: 'CCSS' | 'C3' | 'NCAS';
  code: string;
  label: string;
  target: string;
}

export interface LessonRubricCriterion {
  id: string;
  label: string;
  target: string;
  levels: string[];
}

export interface RichLessonBlock {
  id: string;
  kind: LessonBlockKind;
  title: string;
  body: string;
  minutes: number;
  sourceIds: string[];
  mediaCue?: string;
  teacherMove?: string;
  checkFor?: string;
}

export interface PersonalizedLessonView {
  learnerId: string;
  greeting: string;
  invitation: string;
  scaffold: string;
  choice: string;
  stretch: string;
  teacherReason: string;
}

export interface RichLessonDraft {
  id: string;
  title: string;
  subtitle: string;
  grade: string;
  subject: string;
  durationMinutes: number;
  templateId: LessonTemplateId;
  essentialQuestion: string;
  objective: string;
  sources: RichLessonSource[];
  standards: LessonStandard[];
  rubric: LessonRubricCriterion[];
  blocks: RichLessonBlock[];
  personalized: PersonalizedLessonView[];
  qualityChecks: Array<{ label: string; status: 'passed' | 'review'; detail: string }>;
  receipts: Array<{ lane: 'Aria' | 'PoKee' | 'Claude' | 'License Gate' | 'Learner Ledger'; work: string }>;
}

export interface LessonTemplate {
  id: LessonTemplateId;
  label: string;
  kicker: string;
  description: string;
  bestFor: string;
  accent: string;
  gradient: string;
  signature: string;
}

export const LESSON_TEMPLATES: LessonTemplate[] = [
  { id: 'cinematic', label: 'Cinematic Journey', kicker: 'Emotion → evidence', description: 'Full-bleed media, chapter cards, score cues and a decisive closing reflection.', bestFor: 'history, literature, music', accent: '#FF8C00', gradient: 'linear-gradient(135deg,#6B0099,#D40055,#FF8C00)', signature: 'Opens like a film, lands like an argument.' },
  { id: 'museum', label: 'Living Museum', kicker: 'Objects tell the story', description: 'Gallery rooms, zoomable details, curatorial labels and student-made exhibition cards.', bestFor: 'art, culture, primary sources', accent: '#D0BCFF', gradient: 'linear-gradient(135deg,#6B0099,#D0BCFF)', signature: 'Every source becomes an object with provenance.' },
  { id: 'documentary', label: 'Documentary Desk', kicker: 'Claim → source → cut', description: 'Archive reels, quotations, transcripts and an evidence-editing challenge.', bestFor: 'civics, ELA, media literacy', accent: '#D40055', gradient: 'linear-gradient(135deg,#32003f,#D40055)', signature: 'Students edit evidence into a defensible point of view.' },
  { id: 'data-story', label: 'Data Story', kicker: 'Pattern → explanation', description: 'Animated charts, maps, annotated evidence and a visual claim builder.', bestFor: 'science, geography, economics', accent: '#00DAF3', gradient: 'linear-gradient(135deg,#6B0099,#00DAF3)', signature: 'Numbers become a narrative students can interrogate.' },
  { id: 'field-lab', label: 'Field Lab', kicker: 'Observe → test → build', description: '3D specimens, simulations, notebook prompts and a creation checkpoint.', bestFor: 'science, engineering, archaeology', accent: '#06D6A0', gradient: 'linear-gradient(135deg,#103a42,#06D6A0)', signature: 'Museion tools live inside the lesson.' },
  { id: 'seminar', label: 'Socratic Studio', kicker: 'Text → voice → revision', description: 'Close reading, quotations, discussion roles and a polished synthesis.', bestFor: 'ELA, philosophy, social studies', accent: '#F59E0B', gradient: 'linear-gradient(135deg,#5b2400,#F59E0B)', signature: 'Every student arrives with a way into the conversation.' },
];

export const LESSON_STUDIO_SOURCES: RichLessonSource[] = [
  { id: 'src-song', kind: 'audio', provider: 'chora', title: 'A Change Is Gonna Come', creator: 'Sam Cooke', url: 'https://www.loc.gov/', excerpt: 'Historical recording context and listening excerpt.', license: 'link-only', attribution: 'Recording context via Chora Vault / Library of Congress catalog', quotationReady: false, durationLabel: '0:42 excerpt', accent: '#FF8C00' },
  { id: 'src-photo', kind: 'image', provider: 'loc', title: 'Walk to Freedom, Detroit, 1963', creator: 'Library of Congress collection', url: 'https://www.loc.gov/', excerpt: 'Marchers fill Woodward Avenue during the Detroit Walk to Freedom.', license: 'PD', attribution: 'Library of Congress, public-domain collection record', quotationReady: true, accent: '#00DAF3' },
  { id: 'src-speech', kind: 'document', provider: 'teacher', title: 'Detroit Walk to Freedom speech excerpt', fileName: 'detroit_walk_to_freedom_excerpt.pdf', excerpt: 'A teacher-provided primary-source excerpt with page anchors retained for quotation.', license: 'teacher-owned', attribution: 'Teacher-provided course document, pp. 2–3', quotationReady: true, accent: '#D0BCFF' },
  { id: 'src-map', kind: 'dataset', provider: 'plajah-labs', title: 'Detroit population & migration, 1910–1970', excerpt: 'Decennial population series prepared for classroom visualization.', license: 'PD', attribution: 'U.S. Census historical tables; visualization by Museion', quotationReady: true, accent: '#06D6A0' },
  { id: 'src-art', kind: 'image', provider: 'met', title: 'The Block', creator: 'Romare Bearden', url: 'https://www.metmuseum.org/', excerpt: 'A visual source for examining movement, community and urban memory.', license: 'link-only', attribution: 'The Metropolitan Museum of Art collection page', quotationReady: true, accent: '#D40055' },
  { id: 'src-model', kind: 'model3d', provider: 'plajah-labs', title: 'Motown Studio A spatial model', excerpt: 'A reconstructed 3D room for exploring how space shaped a recorded sound.', license: 'teacher-owned', attribution: 'Museion educational reconstruction', quotationReady: false, accent: '#6B0099' },
];

export const LESSON_STUDIO_LEARNERS: DemoLearnerProfile[] = [
  { id: 'maya', name: 'Maya Rivera', preferredName: 'Maya', interests: ['drawing', 'family stories', 'dance'], strengths: ['visual inference', 'discussion'], growthAreas: ['quoting precisely'], supports: ['sentence stems'], signals: [{ standard: 'CCSS.RH.6-8.1', mastery: 58, label: 'Citing evidence' }, { standard: 'CCSS.SL.7.1', mastery: 86, label: 'Collaborative discussion' }] },
  { id: 'diego', name: 'Diego Morales', preferredName: 'Diego', interests: ['beat making', 'soccer', 'Detroit history'], strengths: ['audio pattern recognition', 'oral explanation'], growthAreas: ['academic vocabulary', 'long-form reading'], supports: ['Spanish glossary', 'chunked text', 'audio transcript'], language: 'Spanish', signals: [{ standard: 'CCSS.RH.6-8.1', mastery: 64, label: 'Citing evidence' }, { standard: 'CCSS.L.7.6', mastery: 47, label: 'Academic vocabulary' }] },
  { id: 'aisha', name: 'Aisha Khan', preferredName: 'Aisha', interests: ['coding', 'maps', 'debate'], strengths: ['data interpretation', 'counterclaims'], growthAreas: ['connecting emotion to evidence'], supports: ['extension pathway'], signals: [{ standard: 'CCSS.RH.6-8.1', mastery: 91, label: 'Citing evidence' }, { standard: 'C3.D2.His.14.6-8', mastery: 78, label: 'Historical argument' }] },
];

const standards: LessonStandard[] = [
  { framework: 'CCSS', code: 'CCSS.ELA-LITERACY.RH.6-8.1', label: 'Cite specific textual evidence', target: 'I can use details from at least two sources to support a historical claim.' },
  { framework: 'C3', code: 'D2.His.14.6-8', label: 'Explain multiple causes and effects', target: 'I can connect music, migration and public action without reducing the story to one cause.' },
  { framework: 'NCAS', code: 'MU:Re7.2.7a', label: 'Analyze musical response', target: 'I can explain how a musical choice shapes meaning for an audience.' },
];

const rubric: LessonRubricCriterion[] = [
  { id: 'claim', label: 'Historical claim', target: 'Makes a clear, defensible answer to the essential question.', levels: ['Beginning', 'Developing', 'Proficient', 'Insightful'] },
  { id: 'evidence', label: 'Source evidence', target: 'Uses and accurately attributes at least two different source types.', levels: ['Unclear', 'Partial', 'Specific', 'Synthesized'] },
  { id: 'reasoning', label: 'Reasoning', target: 'Explains how the evidence supports the claim and acknowledges complexity.', levels: ['Listed', 'Connected', 'Explained', 'Nuanced'] },
  { id: 'craft', label: 'Communication craft', target: 'Uses the chosen medium deliberately for the intended audience.', levels: ['Incomplete', 'Understandable', 'Effective', 'Compelling'] },
];

const personalize = (learner: DemoLearnerProfile): PersonalizedLessonView => {
  const weakest = [...learner.signals].sort((a, b) => a.mastery - b.mastery)[0];
  const strongest = [...learner.signals].sort((a, b) => b.mastery - a.mastery)[0];
  return {
    learnerId: learner.id,
    greeting: `${learner.preferredName}, today Detroit's sound is asking you a question.`,
    invitation: `Start with ${learner.interests[0]}: notice one detail that someone else might miss.`,
    scaffold: learner.language === 'Spanish' ? 'Key terms appear in English and Spanish, with the speech chunked beside its audio transcript.' : `Use this stem: “The source shows ___; this matters because ___.”`,
    choice: `Choose your evidence path: ${learner.strengths[0]} or a source pairing selected by Aria.`,
    stretch: strongest.mastery >= 85 ? 'Add a counterclaim or create a visual/audio layer that changes how an audience reads the evidence.' : 'Connect two source types before you make your final claim.',
    teacherReason: `Chosen from ${weakest.label} (${weakest.mastery}% mastery), ${strongest.label} (${strongest.mastery}% mastery), and interests in ${learner.interests.slice(0, 2).join(' + ')}.`,
  };
};

export function buildSeededRichLesson(templateId: LessonTemplateId = 'cinematic'): RichLessonDraft {
  return {
    id: 'demo-rich-lesson-detroit-sound',
    title: 'When a City Finds Its Voice',
    subtitle: 'Detroit sound, migration and the movement for freedom',
    grade: 'Grade 7', subject: 'Humanities · Music · Data', durationMinutes: 48, templateId,
    essentialQuestion: 'How can a sound become evidence of a city changing?',
    objective: 'Students will synthesize audio, visual, textual and quantitative evidence into a sourced historical claim.',
    sources: LESSON_STUDIO_SOURCES.map(s => ({ ...s })), standards: standards.map(s => ({ ...s })), rubric: rubric.map(r => ({ ...r, levels: [...r.levels] })),
    blocks: [
      { id: 'b1', kind: 'hook', title: 'Hear the city before you name it', body: 'Enter through a 42-second listening excerpt. Students mark what they notice before title, artist or date are revealed.', minutes: 4, sourceIds: ['src-song'], mediaCue: 'Waveform blooms into the Detroit street grid.', teacherMove: 'Collect sensory language without correcting it yet.', checkFor: 'Observation before interpretation.' },
      { id: 'b2', kind: 'gallery', title: 'Walk Woodward Avenue', body: 'A cinematic photo sequence pairs crowd details with anchored lines from the Detroit speech excerpt.', minutes: 8, sourceIds: ['src-photo','src-speech'], mediaCue: 'Ken Burns pan with quotation anchors and source labels.', teacherMove: 'Ask who is visible, who is speaking and what each source cannot show.', checkFor: 'Specific visual and textual evidence.' },
      { id: 'b3', kind: 'data-viz', title: 'A city in motion', body: 'Students scrub a migration timeline and annotate a population change that complicates the opening impression.', minutes: 8, sourceIds: ['src-map'], mediaCue: 'Animated line + map; values remain inspectable and source-linked.', teacherMove: 'Model the difference between correlation, context and cause.', checkFor: 'Responsible interpretation of quantitative evidence.' },
      { id: 'b4', kind: 'model3d', title: 'Step inside the sound', body: 'Rotate the Motown Studio A model, place musicians, and test how room position changes the listening focus.', minutes: 9, sourceIds: ['src-model','src-song'], mediaCue: 'Museion 3D viewer with spatial-audio hotspots.', teacherMove: 'Connect a production choice to an audience effect.', checkFor: 'Causal language grounded in the model.' },
      { id: 'b5', kind: 'discussion', title: 'The evidence table', body: 'Pairs build one claim using two different source types. Aria offers learner-specific entry points without changing the common target.', minutes: 9, sourceIds: ['src-song','src-photo','src-speech','src-map','src-art'], teacherMove: 'Press for an attributed quotation and a reasoning sentence.', checkFor: 'Evidence synthesis, not source summary.' },
      { id: 'b6', kind: 'creation', title: 'Make the city speak', body: 'Create a 45-second narrated visual, mini data story, exhibition card or audio essay answering the essential question.', minutes: 8, sourceIds: ['src-song','src-photo','src-speech','src-map','src-art','src-model'], mediaCue: 'Plajah slideshow, audio, gallery and data-story tools available in place.', teacherMove: 'Assess the same rubric across every medium.', checkFor: 'Claim, attribution, reasoning and deliberate craft.' },
      { id: 'b7', kind: 'reflection', title: 'Leave a trace', body: 'Students name the evidence that changed their thinking. The response, sources and rubric judgment become a Learner Ledger event.', minutes: 2, sourceIds: [], teacherMove: 'Capture a next step, not only a score.', checkFor: 'Metacognition tied to evidence.' },
    ],
    personalized: LESSON_STUDIO_LEARNERS.map(personalize),
    qualityChecks: [
      { label: 'Standards ↔ task', status: 'passed', detail: 'Every target is practiced and visible in the common rubric.' },
      { label: 'Quotation integrity', status: 'passed', detail: 'Teacher PDF retains page anchors; quotations never appear without source context.' },
      { label: 'Rights & attribution', status: 'passed', detail: 'Public-domain, teacher-owned and link-only uses remain distinct.' },
      { label: 'Accessibility', status: 'passed', detail: 'Transcript, captions, alt descriptions, keyboard route and reduced motion are planned.' },
      { label: 'Teacher review', status: 'review', detail: 'Aria prepared the draft. Ms. Rivera must approve before launch.' },
    ],
    receipts: [
      { lane: 'Aria', work: 'Orchestrated the brief, class context, tools and teacher review.' },
      { lane: 'PoKee', work: 'Reasoned across mixed sources, standards, rubric and learner evidence as one long context.' },
      { lane: 'Claude', work: 'Shaped the narrative arc, media choreography, prompts and age-appropriate voice.' },
      { lane: 'License Gate', work: 'Kept allowed use and attribution attached to every source.' },
      { lane: 'Learner Ledger', work: 'Supplied mastery signals and receives assessed evidence after the lesson.' },
    ],
  };
}

