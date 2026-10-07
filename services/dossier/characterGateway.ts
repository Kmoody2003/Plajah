/**
 * Character-consistent image requests.
 *
 * No caller writes a free-text prompt about a person. They pass a scene action plus character
 * ids; this module composes the prompt from the CharacterBible (locked descriptor, variant
 * for the right age, wardrobe for the era, forbidden list) and attaches the same seed and the
 * real reference images every time.
 */
import type { CharacterBible, DossierAsset, LikenessVariant } from './dossierTypes';

export interface ImageRequest {
  prompt: string;
  negativePrompt: string;
  seed: number;
  referenceUrls: string[];
  providerCharacterIds: string[];
  aspect: '1:1' | '16:9' | '9:16' | '4:3';
}

export interface SceneSpec {
  /** What happens, with no description of the person's looks (the bible supplies that). */
  action: string;
  setting: string;
  /** Character id -> age in this scene. */
  cast: { characterId: string; age: number; eraKey?: string }[];
  style: string;
  aspect?: ImageRequest['aspect'];
}

export interface ImageProvider {
  name: string;
  generate(req: ImageRequest): Promise<{ url: string; providerRef?: string }>;
}

export function pickVariant(bible: CharacterBible, age: number): LikenessVariant {
  const inRange = bible.variants.filter(v => age >= v.ageRange[0] && age <= v.ageRange[1]);
  if (inRange.length) return inRange[0];
  // nearest by distance to the range edge, never silently falling back to an unrelated age
  return [...bible.variants].sort((a, b) => dist(age, a.ageRange) - dist(age, b.ageRange))[0];
}
const dist = (age: number, [lo, hi]: [number, number]) => (age < lo ? lo - age : age > hi ? age - hi : 0);

/** The first four-digit year in the setting text (e.g. "Highland Park ... 1913"), or null for ancient/undated scenes. */
export function sceneYear(scene: SceneSpec): number | null {
  const m = scene.setting.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return m ? Number(m[1]) : null;
}

export function buildImageRequest(
  scene: SceneSpec,
  bibles: CharacterBible[],
  assets: DossierAsset[],
): ImageRequest {
  const byId = new Map(bibles.map(b => [b.id, b]));
  const assetById = new Map(assets.map(a => [a.id, a]));
  const parts: string[] = [];
  const year = sceneYear(scene);
  const forbid = new Set<string>(['modern clothing', 'text or captions in the image', 'garbled lettering', 'caricature', 'modern objects', 'anachronistic technology']);
  // Anachronism guard is era-aware: electric light is wrong in 1847 and right in 1913.
  if (year == null || year < 1900) {
    ['light switch', 'electrical outlet', 'floor vent', 'air conditioning vent', 'radiator grille'].forEach(f => forbid.add(f));
  }
  if (year == null || year < 1890) ['electric lamp', 'gooseneck lamp', 'light bulb', 'power lines', 'utility poles'].forEach(f => forbid.add(f));
  if (year == null || year < 1880) ['typewriter', 'keyboard', 'filing cabinet'].forEach(f => forbid.add(f));
  if (year == null || year < 1845) forbid.add('telegraph pole');
  if (year != null && year >= 1900) ['plastic', 'LED lights', 'modern cars', 'neon signs'].forEach(f => forbid.add(f));
  const refs: string[] = [];
  const pcids: string[] = [];
  let seed = 0;

  for (const c of scene.cast) {
    const bible = byId.get(c.characterId);
    if (!bible) throw new Error(`Unknown character "${c.characterId}" — add a CharacterBible before depicting them`);
    const v = pickVariant(bible, c.age);
    // No photograph exists below the earliest documented variant: never invent a face.
    const earliest = Math.min(...bible.variants.map(x => x.ageRange[0]));
    if (c.age < earliest) {
      parts.push(`${bible.name} as a ${c.age}-year-old, shown only from behind, in silhouette, or by hands and posture; face not visible`);
      forbid.add('visible face of the child or youth');
      bible.forbidden.forEach(f => forbid.add(f));
      seed = seed ^ bible.seed;
      continue;
    }
    const wardrobe = c.eraKey ? bible.wardrobe?.[c.eraKey] : undefined;
    parts.push(`${bible.name}, ${bible.coreDescriptor}, ${v.descriptor}${wardrobe ? `, wearing ${wardrobe}` : ''}`);
    bible.forbidden.forEach(f => forbid.add(f));
    for (const id of v.referenceAssetIds) {
      const a = assetById.get(id);
      if (a) refs.push(a.url);
    }
    if (bible.providerCharacterId) pcids.push(bible.providerCharacterId);
    seed = seed ^ bible.seed; // stable for a given cast
  }

  return {
    prompt: `${scene.style}. ${parts.join('; ')}. ${scene.action}. Setting: ${scene.setting}. ${year != null && year >= 1890 ? `Only objects and technology that existed in ${year}.` : 'Only objects and technology that existed at the time and place; oil lamps and candles for light.'}`,
    negativePrompt: [...forbid].join(', '),
    seed: seed >>> 0,
    referenceUrls: refs,
    providerCharacterIds: pcids,
    aspect: scene.aspect ?? '16:9',
  };
}

/** Generates an image and returns the DossierAsset record with the mandatory reconstruction label. */
export async function generateScene(
  provider: ImageProvider,
  scene: SceneSpec,
  bibles: CharacterBible[],
  assets: DossierAsset[],
  meta: { id: string; title: string; basis: string; claimIds: string[] },
): Promise<DossierAsset> {
  const req = buildImageRequest(scene, bibles, assets);
  const out = await provider.generate(req);
  return {
    id: meta.id,
    kind: 'recreation',
    title: meta.title,
    url: out.url,
    rights: { status: 'generated', credit: `Reconstruction generated with ${provider.name} for Plajah` },
    claimIds: meta.claimIds,
    reconstruction: {
      characterIds: scene.cast.map(c => c.characterId),
      basis: meta.basis,
      generator: provider.name,
    },
  };
}
