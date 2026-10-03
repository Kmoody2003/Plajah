/**
 * Practice questions — the "Practice" half of the learn → practice → master loop (Khan-style).
 * One QuestionBank per curriculum; every question belongs to a lesson so the course map can show
 * mastery per lesson/unit/course. Questions are checked instantly in the app, with a hint and an
 * explanation shown after the answer.
 */
export interface Question {
  /** Unique within the bank, e.g. 'civics-hall.t1.l2.q3'. */
  id: string;
  /** The Lesson.id this question practices (must exist in the curriculum). */
  lessonId: string;
  /** 'mcq' = pick one of `choices`; 'tf' = choices are fixed to ['True','False']. */
  kind: 'mcq' | 'tf';
  prompt: string;
  /** mcq: 3–4 plausible options. tf: omit. */
  choices?: string[];
  /** mcq: index into `choices`. tf: 0 = True, 1 = False. */
  answer: number;
  /** Nudge shown on request BEFORE answering; must not give the answer away. */
  hint?: string;
  /** Shown AFTER answering: why the right answer is right (1–2 sentences, factual). */
  explanation: string;
  /** 1 = recall, 2 = apply, 3 = analyse. Used to order practice from easy to hard. */
  level: 1 | 2 | 3;
}

export interface QuestionBank {
  /** Matches Curriculum.id, e.g. 'civics-hall'. */
  curriculumId: string;
  questions: Question[];
}
