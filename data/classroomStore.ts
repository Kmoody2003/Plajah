// classroomStore.ts — a tiny shared, observable store for the DEMO classroom so the
// Class Points view and Reading Quest view stay in sync. Both read/write this one singleton,
// which means a reading activity finished in Reading Quest lands in the class story
// (and bumps the student's point total) live, and vice-versa. Seeded from demoClassroom,
// fully local/bundled — no auth, no Firestore. Clearly DEMO, nothing is persisted.

import { useSyncExternalStore } from 'react';
import {
  DEMO_CLASS,
  ClassAward,
  ClassStudent,
  AttendanceStatus,
} from './demoClassroom';

export interface ClassroomState {
  students: ClassStudent[];
  awards: ClassAward[];                       // class story, newest first
  attendance: Record<string, AttendanceStatus>;
}

// Demo clock anchor — ClassPointsView renders "x min ago" relative to this, so new
// awards stamped here read as "just now" and sort to the top of the class story.
const NOW = 1_750_000_000_000;
const uid = () => `aw_${Math.random().toString(36).slice(2, 9)}`;
const behaviorById = Object.fromEntries(DEMO_CLASS.behaviors.map(b => [b.id, b]));

let state: ClassroomState = {
  students: DEMO_CLASS.students.map(s => ({ ...s })),
  awards: [...DEMO_CLASS.awards],
  attendance: { ...DEMO_CLASS.attendance },
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => state;

/** Award a behavior's points to a student and push it onto the class story. */
export function award(studentId: string, behaviorId: string) {
  const b = behaviorById[behaviorId];
  if (!b) return;
  state = {
    ...state,
    students: state.students.map(s =>
      s.id === studentId ? { ...s, points: s.points + b.points } : s
    ),
    awards: [{ id: uid(), studentId, behaviorId, points: b.points, at: NOW }, ...state.awards],
  };
  emit();
}

/** Cycle a student's attendance present → tardy → absent → present. */
export function cycleAttendance(id: string) {
  const cur = state.attendance[id];
  const next: AttendanceStatus = cur === 'present' ? 'tardy' : cur === 'tardy' ? 'absent' : 'present';
  state = { ...state, attendance: { ...state.attendance, [id]: next } };
  emit();
}

/** React binding — re-renders the caller whenever the shared class state changes. */
export function useClassroom(): ClassroomState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const classroomStore = { award, cycleAttendance, getSnapshot, subscribe };
