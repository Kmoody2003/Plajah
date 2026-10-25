/**
 * FAST station idents — the channel logo reveals that air around ad breaks and lead into a feature.
 * Bundled in public/fast-idents so they start instantly, with no library lookup.
 */

const BASE = '/fast-idents';

const HORROR_CLASSICS_IDENTS = [1, 2, 3, 4, 5, 6].map(n => `${BASE}/horror-classics-0${n}.mp4`);

const IDENTS_BY_CHANNEL: Record<string, string[]> = {
  'horror-classics': HORROR_CLASSICS_IDENTS,
};

const HORROR_CLASSICS_VIGNETTES = [1, 2, 3, 4, 5].map(n => `${BASE}/vignettes/horror-vignette-0${n}.mp4`);

const VIGNETTES_BY_CHANNEL: Record<string, string[]> = {
  'horror-classics': HORROR_CLASSICS_VIGNETTES,
};

/** Short fun vignettes that air inside a channel's ad breaks (empty when it has none). */
export function stationVignettesFor(plajahId?: string): string[] {
  return IDENTS_BY_CHANNEL[plajahId || ''] ? [...(VIGNETTES_BY_CHANNEL[plajahId || ''] || [])] : [];
}

/** Idents for a channel (empty when it has none). The order is rotated by `seed` (e.g. the break's
 *  key), so each break opens on a different reveal yet the result is stable across re-renders. */
export function stationIdentsFor(plajahId: string | undefined, seed: string): string[] {
  const pool = IDENTS_BY_CHANNEL[plajahId || ''] || [];
  if (!pool.length) return [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const r = h % pool.length;
  return [...pool.slice(r), ...pool.slice(0, r)];
}
