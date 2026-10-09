// catalogs — CATALOG group registry (6 catalog systems). Designers live in catalogsA/B.
import type { PublicationDesigner } from './types';
import type { DesignLesson } from '../types';
import { DESIGNS_CA, LESSONS_CA } from './catalogsA';
import { DESIGNS_CB, LESSONS_CB } from './catalogsB';
import { safeDesigns } from './pubKit';

export const DESIGNS: Record<string, PublicationDesigner> = safeDesigns({ ...DESIGNS_CA, ...DESIGNS_CB });
export const LESSONS: Record<string, DesignLesson> = { ...LESSONS_CA, ...LESSONS_CB };
