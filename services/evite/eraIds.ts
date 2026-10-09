// eraIds — the "Design eras" evite ids, with no dependencies at all, so the server (eviteServer save validation, link
// previews) can recognise an era design without importing the Tela designers or anything that touches the DOM.
//
// An era evite id is "era/<eraId>", where <eraId> is a key of ERA_DESIGNS (services/tela/designs/eras). The plate is
// drawn procedurally in the browser from that era's designer, palette and ornaments (services/evite/eraEvites.ts), so
// there is no raster on the evite bucket. tests/eviteEras.test.ts keeps this list in step with ERA_DESIGNS.

export const ERA_EVITE_IDS = [
  'classical', 'egyptian-revival', 'roman-mosaic', 'byzantine', 'insular', 'gothic', 'renaissance', 'baroque', 'rococo', 'neoclassical',
  'victorian', 'arts-crafts', 'art-nouveau', 'vienna-secession', 'art-deco', 'bauhaus', 'constructivist', 'de-stijl', 'dada', 'surrealist',
  'swiss', 'midcentury', 'space-age', 'psychedelic', 'punk', 'new-wave', 'memphis', 'grunge', 'brutalist', 'minimalist',
  'postmodern', 'vaporwave', 'y2k', 'solarpunk', 'afrofuturist', 'harlem', 'ukiyoe', 'islamic-geometry', 'mughal', 'mexican-modern',
  'tropical-modern',
] as const;
export type EraEviteId = typeof ERA_EVITE_IDS[number];

/**
 * Eras with a Tela designer that deliberately do NOT become a send-anywhere evite, and why. The era's own cultural note
 * decides it: a generic party card would be exactly the pan-community motif use the note rules out.
 */
export const ERA_EVITE_EXCLUDED: Record<string, string> = {
  'indigenous-contemporary': 'Its cultural note requires a named community, licensed assets and cultural permission; a generic invitation design cannot meet that.',
};

const SET = new Set<string>(ERA_EVITE_IDS);
export const ERA_PREFIX = 'era/';
/** "era/art-deco" → "art-deco"; null for anything that is not a shipped era evite. */
export function eraIdOf(id: unknown): EraEviteId | null {
  if (typeof id !== 'string' || !id.startsWith(ERA_PREFIX)) return null;
  const e = id.slice(ERA_PREFIX.length);
  return SET.has(e) ? e as EraEviteId : null;
}
export const isEraId = (id: unknown): id is string => eraIdOf(id) !== null;
export const eraPlateId = (eraId: string) => `${ERA_PREFIX}${eraId}`;
