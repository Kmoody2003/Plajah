// Registry of hand-designed publications. Group files export DESIGNS (by
// template id) and LESSONS (by template id).
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import * as campaigns from './campaigns';
import * as editorial from './editorial';
import * as books from './books';
import * as comics from './comics';

const groups = [campaigns, editorial, books, comics];
export const PUBLICATION_DESIGNS: Record<string, PublicationDesigner> = Object.assign({}, ...groups.map(g => g.DESIGNS));
export const PUBLICATION_LESSONS: Record<string, DesignLesson> = Object.assign({}, ...groups.map(g => g.LESSONS));
export type { PublicationCtx, PublicationDesigner } from './types';
