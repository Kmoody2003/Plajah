// magazines — twelve MAGAZINE publication systems, each a different periodical
// with its own trim, grid, type stack and masthead idea (see magazinesA.ts for
// 1–4, magazinesB.ts for 5–8, magazinesC.ts for 9–12, magazineKit.ts for the shared furniture).
//
// Every issue is twelve pages: cover · contents | editor’s letter · department |
// ad · feature opener | feature body · feature body | interview · photo essay |
// colophon · back cover. Page 1 is the cover (a recto), so the facing-page spreads
// are 2–3, 4–5, 6–7, 8–9 and 10–11, with 12 the back cover.
import type { PublicationDesigner } from './types';
import type { DesignLesson } from '../types';
import type { TelaPublicationPrint } from '../../../telaPublicationTemplates';
import { DESIGNS_A, LESSONS_A } from './magazinesA';
import { DESIGNS_B, LESSONS_B } from './magazinesB';
import { DESIGNS_C, LESSONS_C } from './magazinesC';

export const DESIGNS: Record<string, PublicationDesigner> = { ...DESIGNS_A, ...DESIGNS_B, ...DESIGNS_C };
export const LESSONS: Record<string, DesignLesson> = { ...LESSONS_A, ...LESSONS_B, ...LESSONS_C };

/** Facing-page pairs for a 12-page issue (1-based page numbers; the cover and back cover stand alone). */
const SPREADS: Array<[number, number]> = [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];
const pr = (trimIn: [number, number], binding: TelaPublicationPrint['binding'], grid: TelaPublicationPrint['grid']): TelaPublicationPrint => ({ trimIn, bleedIn: .125, safeIn: .25, binding, pxPerIn: 96, facing: true, spreads: SPREADS, grid });
const g = (columns: number, gutterPx: number, baselinePx: number, top: number, bottom: number, inner: number, outer: number): TelaPublicationPrint['grid'] => ({ columns, gutterPx, baselinePx, marginPx: { top, bottom, inner, outer } });

/** Print metadata per magazine id: trim size, bleed, binding, facing-page spreads, grid constants (px at 96/in). */
export const MAGAZINE_PRINT: Record<string, TelaPublicationPrint> = {
  'mag-fashion-monthly': pr([8.375, 10.875], 'PERFECT', g(6, 14, 14, 70, 74, 64, 46)),
  'mag-tech-review': pr([8.5, 11], 'PERFECT', g(12, 12, 12, 72, 72, 60, 44)),
  'mag-culture-quarterly': pr([7.5, 10], 'PERFECT', g(8, 14, 16, 96, 100, 84, 112)),
  'mag-sports-weekly': pr([8.5, 11], 'SADDLE', g(6, 12, 12, 74, 70, 48, 40)),
  'mag-food-travel': pr([8.375, 10.875], 'PERFECT', g(6, 16, 15, 82, 82, 66, 50)),
  'mag-business-weekly': pr([11, 17], 'SADDLE', g(8, 14, 12, 104, 88, 48, 48)),
  'mag-nightlife-zine': pr([8.5, 11], 'STAPLED', g(12, 8, 14, 62, 62, 44, 30)),
  'mag-home-design': pr([9, 11], 'PERFECT', g(12, 16, 17, 84, 92, 76, 64)),
  'mag-literary-journal': pr([6, 9], 'PERFECT', g(6, 12, 17, 80, 88, 68, 52)),
  'mag-community-digest': pr([8.5, 11], 'SADDLE', g(6, 14, 14, 84, 74, 54, 44)),
  'mag-kids-family': pr([8.5, 11], 'SADDLE', g(6, 16, 20, 80, 76, 52, 46)),
  'mag-photojournal': pr([9.5, 12], 'PERFECT', g(12, 12, 16, 76, 84, 72, 56)),
};
