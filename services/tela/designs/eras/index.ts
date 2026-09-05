// Registry of hand-designed style-era documents.
//
// Each group file exports:
//   DESIGNS:   Record<eraId, EraDesigner>            — the pages
//   LESSONS:   Record<eraId, DesignLesson>           — principle + history + exercise
//   OVERRIDES: Record<eraId, Partial<TelaStyleEra>>  — palette / typography refinements (optional)
import type { DesignLesson, EraDesigner } from '../types';
import type { TelaStyleEra } from '../../../telaStyleEraLibrary';
import * as ancientMedieval from './ancientMedieval';
import * as industrialModern from './industrialModern';
import * as modernismLate from './modernismLate';
import * as counterculture from './counterculture';
import * as digitalContemporary from './digitalContemporary';
import * as globalTraditions from './globalTraditions';

interface Group { DESIGNS: Record<string, EraDesigner>; LESSONS: Record<string, DesignLesson>; OVERRIDES?: Record<string, Partial<TelaStyleEra>> }
const groups: Group[] = [ancientMedieval, industrialModern, modernismLate, counterculture, digitalContemporary, globalTraditions];

export const ERA_DESIGNS: Record<string, EraDesigner> = Object.assign({}, ...groups.map(g => g.DESIGNS));
export const ERA_LESSONS: Record<string, DesignLesson> = Object.assign({}, ...groups.map(g => g.LESSONS));
export const ERA_OVERRIDES: Record<string, Partial<TelaStyleEra>> = Object.assign({}, ...groups.map(g => g.OVERRIDES || {}));
