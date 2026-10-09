// articles — ARTICLE group registry (12 article systems). Designers live in articlesA/B/C.
import type { PublicationDesigner } from './types';
import type { DesignLesson } from '../types';
import { DESIGNS_A, LESSONS_A } from './articlesA';
import { DESIGNS_B, LESSONS_B } from './articlesB';
import { DESIGNS_C, LESSONS_C } from './articlesC';
import { safeDesigns } from './pubKit';

export const DESIGNS: Record<string, PublicationDesigner> = safeDesigns({ ...DESIGNS_A, ...DESIGNS_B, ...DESIGNS_C });
export const LESSONS: Record<string, DesignLesson> = { ...LESSONS_A, ...LESSONS_B, ...LESSONS_C };
