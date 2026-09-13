// designLessons — the teaching layer of the template gallery.
//
// Every template carries a lesson: one principle it demonstrates, a brief
// history of the style or genre, an exercise, and an interest tag the user can
// save to their profile. Era lessons live beside their designs; publication and
// creative-template lessons are keyed here.
import type { DesignLesson } from './designs/types';
import { ERA_LESSONS } from './designs/eras';
import { PUBLICATION_LESSONS } from './designs/publicationLessons';
import { CREATIVE_LESSONS } from './designs/creativeLessons';

export type LessonKind = 'era' | 'publication' | 'creative' | 'lowerThird';

const GENERIC: DesignLesson = {
  principle: 'Hierarchy first: decide what the reader sees first, second and third, then let everything else recede.',
  history: 'Template-led design descends from the job printer’s specimen book and the magazine art director’s grid: reusable structures that carry a voice while the content changes.',
  tryThis: 'Delete every element you can without losing the message. What remains is the design.',
  interestTag: 'Graphic design',
};

export function lessonFor(kind: LessonKind, id: string, fallback: Partial<DesignLesson> = {}): DesignLesson {
  const table = kind === 'era' ? ERA_LESSONS : kind === 'publication' ? PUBLICATION_LESSONS : kind === 'creative' ? CREATIVE_LESSONS : {};
  return table[id] || { ...GENERIC, ...fallback };
}

export { ERA_LESSONS, PUBLICATION_LESSONS, CREATIVE_LESSONS };
