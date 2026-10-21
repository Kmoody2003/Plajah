import type { PlatformMediaAsset } from '../types';
import { PUMPKIN_PATCH_HERO_ALBUM, CURATED_HALLOWEEN_FILMS } from './archiveContentService';

/**
 * Cinema (formerly Taleo) studio idents — the logo reveal that plays in front of every feature.
 * Bundled in public/cinema-idents so they start instantly, with no library lookup.
 *
 *   - Pumpkin Patch           → the werewolf reveal, always.
 *   - Horror / suspense / thriller, and anything in the Halloween Vault
 *                             → one of the horror reveals, at random.
 *   - Everything else         → the general Plajah Cinema reveal.
 */

const BASE = '/cinema-idents';
export const CINEMA_IDENT_GENERAL = `${BASE}/cinema-general.mp4`;
export const CINEMA_IDENT_PUMPKIN_PATCH = `${BASE}/horror-werewolf.mp4`;
export const CINEMA_IDENTS_HORROR = [
  `${BASE}/horror-werewolf.mp4`,
  `${BASE}/horror-01.mp4`,
  `${BASE}/horror-02.mp4`,
  `${BASE}/horror-03.mp4`,
];

const HORROR_TEXT = /horror|thriller|suspense|halloween|slasher|terror|macabre|supernatural|zombie|vampire|werewolf|haunt/i;
const HALLOWEEN_IDS = new Set(CURATED_HALLOWEEN_FILMS.map(f => f.identifier));

const idOf = (x: any) => String(x?.identifier || x?.id || '').replace(/^public_domain_/, '');

function isPumpkinPatch(item: any): boolean {
  return item?.id === PUMPKIN_PATCH_HERO_ALBUM.id || /pumpkin\s*patch/i.test(String(item?.title || ''));
}

function isHorrorish(item: any): boolean {
  if (!item) return false;
  if (item._isHalloween || HALLOWEEN_IDS.has(idOf(item))) return true;
  const tags = [
    item.genre, item.subGenre, item.genres, item.tags, item.collection, item.subject,
    item.movieMetadata?.genre, item.movieMetadata?.genres,
  ].flat().filter(Boolean).join(' ');
  return HORROR_TEXT.test(tags);
}

/** Pick the ident for a title. Any of the passed objects (catalog item, playback payload) may carry the genre. */
export function pickCinemaIdentUrl(...items: any[]): string {
  if (items.some(isPumpkinPatch)) return CINEMA_IDENT_PUMPKIN_PATCH;
  if (items.some(isHorrorish)) return CINEMA_IDENTS_HORROR[Math.floor(Math.random() * CINEMA_IDENTS_HORROR.length)];
  return CINEMA_IDENT_GENERAL;
}

export function pickCinemaIdent(...items: any[]): PlatformMediaAsset {
  return {
    id: 'bundled-cinema-ident', kind: 'TALEO_PREROLL', title: 'Plajah Cinema',
    url: pickCinemaIdentUrl(...items), isActive: true, createdAt: 0, updatedAt: 0,
  } as PlatformMediaAsset;
}
