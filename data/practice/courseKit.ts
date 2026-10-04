/**
 * Authoring kit for Law and Medicine course modules (data/practice/courses/law-*.ts, med-*.ts).
 * Question order is balanced at load time (balanceBank), so authors just write the correct answer
 * wherever is natural and use the SAME helper for every item.
 */
import type { Question } from './types';
import type { Track } from '../../services/schoolChassis';
import type { CourseModule } from './courseModule';

/** One track plus the practice questions for its lessons. One file per track keeps every write small. */
export interface CoursePart { track: Track; questions: Question[] }

/** Join track files into the course module. Course meta (id, label, blurb, accent, framework) goes here. */
export const assemble = (meta: { id: string; label: string; blurb: string; accent: string; framework: string }, parts: CoursePart[]): CourseModule => ({
  curriculum: { ...meta, tracks: parts.map(p => p.track) },
  bank: { curriculumId: meta.id, questions: parts.flatMap(p => p.questions) },
});

/** Multiple choice, exactly four options. `answer` is the index of the correct option. */
export const mcq = (
  lessonId: string, n: number, level: 1 | 2 | 3,
  prompt: string, choices: [string, string, string, string], answer: 0 | 1 | 2 | 3,
  hint: string, explanation: string,
): Question => ({ id: `${lessonId}.q${n}`, lessonId, kind: 'mcq', prompt, choices: [...choices], answer, hint, explanation, level });

/** True/false. `answer` 0 = True, 1 = False. */
export const tf = (
  lessonId: string, n: number, level: 1 | 2 | 3,
  prompt: string, answer: 0 | 1, hint: string, explanation: string,
): Question => ({ id: `${lessonId}.q${n}`, lessonId, kind: 'tf', prompt, answer, hint, explanation, level });

/** Shown in the course panel for every Law and Medicine course. */
export const LAW_NOTICE = 'Educational use only. This is general legal education, mostly about United States law, and it is not legal advice. Laws differ by place and change over time, so talk to a licensed lawyer about a real situation.';
export const MEDICINE_NOTICE = 'Educational use only. This is general health and medical education, not medical advice, diagnosis or treatment. It is not a substitute for a clinician. In an emergency call your local emergency number.';
/** Shown in the course panel for Machines and Trades courses (Machine Atlas). */
export const MACHINES_NOTICE = 'Educational use only, and a Draft. Brakes are a safety system: this course is general, generic-vehicle teaching, not a repair procedure for any specific vehicle. Always follow the factory service manual, use proper stands and tools, and have safety-critical work done or checked by a qualified technician. Content needs review by an ASE-certified master technician before any verified label.';
