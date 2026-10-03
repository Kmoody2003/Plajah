/**
 * Math practice adapter — turns Plajah's two generators into PracticeItems for the shared practice
 * session: MathClassroom's grade 1-8 generators and mathAdvanced's grade 9-12 skills. Loaded
 * lazily (MathClassroom is a large component) so the course map's first paint stays light.
 */
import type { PracticeItem } from '../components/learn/PracticeView';
import { ADVANCED_SKILLS, ADVANCED_TOPICS_BY_GRADE, advancedItems } from './mathAdvanced';

export interface MathTopics { byGrade: Record<number, string[]> }

export async function loadMathTopics(): Promise<MathTopics> {
  const { GRADE_TOPICS } = await import('../components/MathClassroom');
  return { byGrade: { ...GRADE_TOPICS, ...ADVANCED_TOPICS_BY_GRADE } };
}

const isAdvanced = (grade: number, topic: string) => ADVANCED_SKILLS.some(s => s.grade === grade && s.topic === topic);

export async function loadMathPool(grade: number, topic: string, count = 30): Promise<PracticeItem[]> {
  if (isAdvanced(grade, topic)) return advancedItems(grade, topic, count);
  const { generateProblem } = await import('../components/MathClassroom');
  const out: PracticeItem[] = []; const seen = new Set<string>();
  for (let i = 0; i < count * 4 && out.length < count; i++) {
    const p = generateProblem(grade, topic);
    if (!p?.question || seen.has(p.question) || !p.choices?.length) continue;
    const answer = p.choices.indexOf(p.answer);
    if (answer < 0) continue;
    seen.add(p.question);
    out.push({
      id: `g${grade}.${topic}.${i}`, prompt: p.question, choices: p.choices, answer,
      hint: p.hint, explanation: `The answer is ${p.answer}.`, level: grade <= 3 ? 1 : grade <= 6 ? 2 : 3,
    });
  }
  return out;
}
