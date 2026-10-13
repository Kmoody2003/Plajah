// data/showcase/comics/index.ts — Master Registry of the 6 Showcase Comic & Manga Books
// Provides lossless access to the 6 genre flagship titles for the Comic & Manga Studio.

import { ShowcaseComicBook } from '../comicTypes';
import { obsidianShroud } from './obsidianShroud';
import { chromeApostle } from './chromeApostle';
import { singularityGods } from './singularityGods';
import { silentCrater } from './silentCrater';
import { gildedVanguard } from './gildedVanguard';
import { paleHydrangeas } from './paleHydrangeas';

export {
  obsidianShroud,
  chromeApostle,
  singularityGods,
  silentCrater,
  gildedVanguard,
  paleHydrangeas,
};

export const SHOWCASE_COMICS: ShowcaseComicBook[] = [
  obsidianShroud,
  chromeApostle,
  singularityGods,
  silentCrater,
  gildedVanguard,
  paleHydrangeas,
];

export const showcaseComicById: Record<string, ShowcaseComicBook> = {
  'obsidian-shroud': obsidianShroud,
  'chrome-apostle': chromeApostle,
  'singularity-gods': singularityGods,
  'silent-crater': silentCrater,
  'gilded-vanguard': gildedVanguard,
  'pale-hydrangeas': paleHydrangeas,
};

export function getShowcaseComic(id: string): ShowcaseComicBook | undefined {
  return showcaseComicById[id];
}

export function listShowcaseComics(): ShowcaseComicBook[] {
  return SHOWCASE_COMICS;
}
