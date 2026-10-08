/**
 * Answer-position balancing. Authors (human or AI) tend to put the right answer first or second, and
 * learners notice. This rotates each multiple-choice question's options so the correct answer lands
 * on a position derived from the question id (stable across sessions, spread evenly across A-D).
 * It only reorders options; the content of the question is untouched.
 */
import type { Question, QuestionBank } from './types';

const hash = (s: string): number => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

export function balanceQuestion(q: Question): Question {
  if (q.kind !== 'mcq' || !q.choices || q.choices.length < 2) return q;
  const n = q.choices.length; const target = hash(q.id) % n;
  if (target === q.answer) return q;
  const shift = (target - q.answer + n) % n; const next = new Array<string>(n);
  q.choices.forEach((c, i) => { next[(i + shift) % n] = c; });
  return { ...q, choices: next, answer: target };
}

export const balanceBank = (b: QuestionBank): QuestionBank => ({ ...b, questions: b.questions.map(balanceQuestion) });
