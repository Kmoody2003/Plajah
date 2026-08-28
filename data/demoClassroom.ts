// demoClassroom.ts — a labeled DEMO class so people can see the Class Points classroom
// work: behavior/skill points, attendance, a class story of awards, and a parent view.
// Fully static/bundled (no auth, no Firestore) and clearly marked DEMO. The Class Points
// view seeds its interactive state from this, so visitors can try awarding points live.

export interface ClassBehavior { id: string; label: string; points: number; icon: string; positive: boolean; }
export interface ClassStudent { id: string; name: string; color: string; points: number; isDemoParentChild?: boolean; }
export interface ClassAward { id: string; studentId: string; behaviorId: string; points: number; at: number; }
export type AttendanceStatus = 'present' | 'absent' | 'tardy';

export interface DemoClass {
  id: string;
  isDemo: true;
  name: string;
  teacherName: string;
  grade: string;
  behaviors: ClassBehavior[];
  students: ClassStudent[];
  awards: ClassAward[];                       // the class story (seeded interactions)
  attendance: Record<string, AttendanceStatus>;
  parent: { name: string; childId: string };
}

export const DEMO_BEHAVIORS: ClassBehavior[] = [
  // positive
  { id: 'ontask',  label: 'On Task',         points: 1, icon: '🎯', positive: true },
  { id: 'helping', label: 'Helping Others',  points: 1, icon: '🤝', positive: true },
  { id: 'partic',  label: 'Participating',   points: 1, icon: '🙋', positive: true },
  { id: 'persist', label: 'Persistence',     points: 2, icon: '💪', positive: true },
  { id: 'team',    label: 'Teamwork',        points: 1, icon: '👥', positive: true },
  { id: 'create',  label: 'Creativity',      points: 2, icon: '🎨', positive: true },
  // Reading Quest — awarded automatically when a student finishes a reading activity
  { id: 'reading', label: 'Reading Quest',    points: 3, icon: '📖', positive: true },
  { id: 'phoneme', label: 'Phoneme Beat',     points: 2, icon: '🥁', positive: true },
  { id: 'science', label: 'Science Quest',    points: 3, icon: '🔬', positive: true },
  // needs work
  { id: 'offtask', label: 'Off Task',        points: -1, icon: '😶‍🌫️', positive: false },
  { id: 'talking', label: 'Talking Out',     points: -1, icon: '🗣️', positive: false },
  { id: 'unkind',  label: 'Unkind',          points: -1, icon: '⛈️', positive: false },
];

const C = ['#FF8C00', '#36c5f0', '#2bd67a', '#e23b6d', '#7a2bd6', '#f5c542'];
const T = (mins: number) => 1_750_000_000_000 - mins * 60_000; // deterministic recent times

export const DEMO_CLASS: DemoClass = {
  id: 'demo_class_rivera_4b',
  isDemo: true,
  name: 'Room 4B — Reading & Science',
  teacherName: 'Ms. Rivera',
  grade: '4th Grade',
  behaviors: DEMO_BEHAVIORS,
  students: [
    { id: 's1', name: 'Maya R.',    color: C[0], points: 14, isDemoParentChild: true },
    { id: 's2', name: 'Liam P.',    color: C[1], points: 9 },
    { id: 's3', name: 'Aisha K.',   color: C[2], points: 17 },
    { id: 's4', name: 'Diego M.',   color: C[3], points: 7 },
    { id: 's5', name: 'Emma W.',    color: C[4], points: 12 },
    { id: 's6', name: 'Noah B.',    color: C[5], points: 5 },
  ],
  awards: [
    { id: 'a1', studentId: 's3', behaviorId: 'helping', points: 1, at: T(8) },
    { id: 'a2', studentId: 's1', behaviorId: 'persist', points: 2, at: T(22) },
    { id: 'a3', studentId: 's5', behaviorId: 'create',  points: 2, at: T(35) },
    { id: 'a4', studentId: 's2', behaviorId: 'partic',  points: 1, at: T(52) },
    { id: 'a5', studentId: 's4', behaviorId: 'offtask', points: -1, at: T(70) },
    { id: 'a6', studentId: 's1', behaviorId: 'helping', points: 1, at: T(95) },
    { id: 'a7', studentId: 's3', behaviorId: 'ontask',  points: 1, at: T(120) },
    { id: 'a8', studentId: 's6', behaviorId: 'team',    points: 1, at: T(150) },
  ],
  attendance: { s1: 'present', s2: 'present', s3: 'present', s4: 'tardy', s5: 'present', s6: 'absent' },
  parent: { name: 'Demo Parent', childId: 's1' },
};

// ── Richer demo objects so the "Tour Academia" walkthrough threads a complete loop:
//    a real lesson (with Plajah's rights-cleared archives attached), an assignment,
//    a parent↔teacher message thread, and a learner-ledger snapshot for the demo child.

/** A lesson with Plajah content attached — showcases the teacher content-surfacing that no
 *  ClassDojo has: Chora music history + the Vault, film history, and Labs arts/history. */
export interface DemoLessonContent { kind: 'MUSIC' | 'FILM' | 'ART' | 'READING'; title: string; source: string; note: string; icon: string; }
export interface DemoLesson { id: string; subject: string; title: string; standard: string; summary: string; content: DemoLessonContent[]; }
export const DEMO_LESSON: DemoLesson = {
  id: 'lesson_harlem',
  subject: 'Cross-Arts / Social Studies',
  title: 'The Harlem Renaissance — Music, Film & Art',
  standard: 'CCSS.ELA-Literacy.RH · Arts Integration',
  summary: "A cross-arts unit where students explore the 1920s–30s Black cultural movement through the music, film, and painting of the era — pulled straight from Plajah's archives.",
  content: [
    { kind: 'MUSIC', title: 'Duke Ellington & the sound of the Cotton Club', source: 'Chora · The Vault (National Jukebox, LOC)', note: 'Listen to the era. Rights-cleared from the Library of Congress.', icon: '🎷' },
    { kind: 'FILM',  title: 'Harlem street life, c. 1930s (archival footage)', source: 'Taleo · Film History (Internet Archive)', note: 'Primary-source moving image of the neighborhood.', icon: '🎞️' },
    { kind: 'ART',   title: 'Aaron Douglas — "Aspects of Negro Life"', source: 'Museion · Art Masters hall', note: 'Study the muralist of the movement.', icon: '🖼️' },
    { kind: 'READING', title: 'Langston Hughes — "Dreams" (guided read + vocabulary)', source: 'Lorea · Reading Quest', note: 'Comprehension + a Spanish/French vocabulary side-quest.', icon: '📖' },
  ],
};

export interface DemoAssignment { id: string; title: string; dueLabel: string; instructions: string; submissions: Record<string, 'submitted' | 'graded' | 'missing'>; }
export const DEMO_ASSIGNMENT: DemoAssignment = {
  id: 'asg_harlem_1',
  title: 'Pick an artist from the unit — 3 sentences on why they mattered',
  dueLabel: 'Due Friday',
  instructions: 'Choose the musician, filmmaker, or painter that stood out to you and write 3 sentences about their impact. Record a voice note if you prefer.',
  submissions: { s1: 'graded', s2: 'submitted', s3: 'graded', s4: 'missing', s5: 'submitted', s6: 'missing' },
};

export interface DemoMessage { id: string; from: 'teacher' | 'parent'; text: string; at: number; }
export const DEMO_MESSAGES: DemoMessage[] = [
  { id: 'm1', from: 'teacher', text: "Hi! Maya did a wonderful job on the Harlem Renaissance unit today — she picked Aaron Douglas and her writing was thoughtful. 📖", at: T(200) },
  { id: 'm2', from: 'parent',  text: 'That\'s great to hear, thank you! She was humming jazz at dinner 😄 Is the assignment due Friday?', at: T(140) },
  { id: 'm3', from: 'teacher', text: 'Yes, Friday — she\'s already submitted and I\'ve graded it. All set!', at: T(120) },
];

export interface DemoLedgerRecord { id: string; label: string; subject: string; standard: string; level: string; date: string; }
export const DEMO_LEDGER: { student: string; records: DemoLedgerRecord[] } = {
  student: 'Maya R.',
  records: [
    { id: 'l1', label: 'Reading comprehension — inference', subject: 'ELA', standard: 'CCSS.RL.4.1', level: 'Proficient', date: 'This week' },
    { id: 'l2', label: 'Phonemic fluency (Reading Quest)', subject: 'ELA', standard: 'CCSS.RF.4.4', level: 'Advancing', date: 'This week' },
    { id: 'l3', label: 'Arts integration — Harlem Renaissance', subject: 'Social Studies', standard: 'Arts', level: 'Proficient', date: 'Today' },
    { id: 'l4', label: 'Spanish vocabulary — 20 words', subject: 'Language (CEFR A1)', standard: 'ACTFL Novice', level: 'On track', date: 'This week' },
  ],
};
