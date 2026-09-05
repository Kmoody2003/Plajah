// Registry of hand-designed creative templates (documents, posters, social,
// presentations, web, menus). Group files export DESIGNS and LESSONS keyed by
// template NAME.
import type { DesignLesson } from '../types';
import type { CreativeDesigner } from './types';
import * as documents from './documents';
import * as posters from './posters';
import * as screens from './screens';
import * as menus from './menus';

const groups = [documents, posters, screens, menus];
export const CREATIVE_DESIGNS: Record<string, CreativeDesigner> = Object.assign({}, ...groups.map(g => g.DESIGNS));
export const CREATIVE_LESSONS: Record<string, DesignLesson> = Object.assign({}, ...groups.map(g => g.LESSONS));
export type { CreativeCtx, CreativeDesigner } from './types';
