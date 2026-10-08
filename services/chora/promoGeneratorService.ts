import type { Album } from '../../types';
import { clampSnippet, selectPromoSnippets } from './audioSnippetService';
import { DSP_NAMES, PROMO_SUITES, PROMO_VERSION, type PromoRecipe, type PromoRelease } from './promoTypes';

export function safePromoUrl(value: string): string | null {
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}
export function promoEligible(album: Album): boolean {
  return album.type === 'MUSIC' && !album.isDraft && !album.isPrivate && !album.isIntimateOnly && !!album.coverImage;
}
/** Idempotent defaults: republishing preserves intentional edits. Missing tracks
 * are reconciled, and the saved recipe can regenerate every suite on any device. */
export function createPromoRecipe(album: PromoRelease, now = Date.now()): PromoRecipe {
  const previous = album.autoPromo;
  const defaults = selectPromoSnippets(album.tracks);
  const snippets = previous?.snippets?.length ? Array.from({ length: 3 }, (_, i) => {
    const old = previous.snippets[i];
    const track = album.tracks.find(t => t.id === old?.trackId && (t.url || t.browserCompatUrl));
    return track ? clampSnippet(track, old.start, old.source) : defaults[i];
  }).filter(Boolean) : defaults;
  const secondaryDsps: PromoRecipe['secondaryDsps'] = {};
  for (const name of DSP_NAMES) {
    const url = safePromoUrl(previous?.secondaryDsps?.[name] || '');
    if (url) secondaryDsps[name] = url;
  }
  return {
    version: PROMO_VERSION,
    template: PROMO_SUITES.some(s => s.id === previous?.template) ? previous!.template : 'kinetic-pulse',
    title: previous?.title ?? album.title,
    artist: previous?.artist ?? album.artist,
    tagline: previous?.tagline ?? 'A new release. A world of its own.',
    secondaryDsps, snippets, updatedAt: previous?.updatedAt ?? now,
  };
}
export function promoDestination(directUrl: string, template: string, format: string): string {
  const safe = safePromoUrl(directUrl);
  if (!safe) throw new Error('A valid release link is required.');
  const url = new URL(safe);
  url.searchParams.set('utm_source', 'chora-promo');
  url.searchParams.set('utm_medium', format);
  url.searchParams.set('utm_campaign', template);
  return url.href;
}
export function promoCaption(recipe: PromoRecipe, directUrl: string): string {
  return `${recipe.title} — ${recipe.artist}\n${recipe.tagline}\n\nListen on Plajah Chora\n${directUrl}`;
}
