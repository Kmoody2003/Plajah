// demoClassroom.ts — a labeled DEMO class so people can see the ClassDojo-style classroom
// work: behavior/skill points, attendance, a class story of awards, and a parent view.
// Fully static/bundled (no auth, no Firestore) and clearly marked DEMO. The ClassroomDojo
// view seeds its interactive state from this, so visitors can try awarding points live.

export interface DojoBehavior { id: string; label: string; points: number; icon: string; positive: boolean; }
export interface DojoStudent { id: string; name: string; color: string; points: number; isDemoParentChild?: boolean; }
export interface DojoAward { id: string; studentId: string; behaviorId: string; points: number; at: number; }
export type AttendanceStatus = 'present' | 'absent' | 'tardy';

export interface DemoClass {
  id: string;
  isDemo: true;
  name: string;
  teacherName: string;
  grade: string;
  behaviors: DojoBehavior[];
  students: DojoStudent[];
  awards: DojoAward[];                       // the class story (seeded interactions)
  attendance: Record<string, AttendanceStatus>;
  parent: { name: string; childId: string };
}

export const DEMO_BEHAVIORS: DojoBehavior[] = [
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
