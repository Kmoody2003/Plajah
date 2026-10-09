// Registry of hand-designed publications. Group files export DESIGNS (by
// template id) and LESSONS (by template id).
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import * as campaigns from './campaigns';
import * as editorial from './editorial';
import * as books from './books';
import * as storybooksB from './storybooksB';
import * as storybooksA from './storybooksA';
import * as comics from './comics';
import * as articles from './articles';
import * as catalogs from './catalogs';
import * as magazines from './magazines';
import * as storybooksC from './storybooksC';
import * as storyAnime from './storyAnime';
import * as storyPixel from './storyPixel';
import * as storyBoard from './storyBoard';
import * as storyDoodle from './storyDoodle';

const groups = [campaigns, editorial, books, storybooksB, storybooksA, comics, articles, catalogs, magazines, storybooksC, storyBoard, storyDoodle, storyAnime, storyPixel];
export const PUBLICATION_DESIGNS: Record<string, PublicationDesigner> = Object.assign({}, ...groups.map(g => g.DESIGNS));
export const PUBLICATION_LESSONS: Record<string, DesignLesson> = Object.assign({}, ...groups.map(g => g.LESSONS));
export type { PublicationCtx, PublicationDesigner } from './types';
