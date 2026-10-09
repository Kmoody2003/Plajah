import type { ShowcaseBook } from './types';
import { moonBlanket } from './books/moonBlanket';
import { beepBlockStreet } from './books/beepBlockStreet';
import { orbitParty } from './books/orbitParty';
import { littleFoxBigTrees } from './books/littleFoxBigTrees';
import { belowTheBlue } from './books/belowTheBlue';
import { goldenThread } from './books/goldenThread';

/** The six launch showcase books, youngest to oldest. Each targets a different age range and uses a different Tela template and art medium. */
export const SHOWCASE_BOOKS: ShowcaseBook[] = [moonBlanket, beepBlockStreet, orbitParty, littleFoxBigTrees, belowTheBlue, goldenThread];

export const showcaseByTemplate = (templateId: string): ShowcaseBook | undefined => SHOWCASE_BOOKS.find(b => b.templateId === templateId);
export const showcaseById = (id: string): ShowcaseBook | undefined => SHOWCASE_BOOKS.find(b => b.id === id);
export * from './types';
