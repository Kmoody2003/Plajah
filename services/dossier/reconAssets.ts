/**
 * Turns generated reconstruction images into labelled DossierAssets and attaches each to its room.
 * Used by the registry so subjects whose data files were written before any image existed
 * (Ford, Persia) get the same "Reconstruction" treatment as Douglass without editing those files.
 */
import type { Dossier, DossierAsset } from './dossierTypes';

export interface ReconManifestEntry { id: string; file: string; generator: string }
export interface ReconScene {
  id: string; roomId: string; title: string; basis: string; claimIds: string[];
  spec: { cast: Array<{ characterId: string }> };
}

export function applyReconstructions(dossier: Dossier, scenes: ReconScene[], manifest: ReconManifestEntry[]): Dossier {
  const byId = new Map(scenes.map(s => [s.id, s]));
  const recon: DossierAsset[] = manifest.flatMap(m => {
    const s = byId.get(m.id);
    if (!s) return [];
    return [{
      id: s.id,
      kind: 'recreation' as const,
      title: s.title,
      url: m.file,
      rights: { status: 'generated' as const, credit: `Reconstruction generated with ${m.generator} for Plajah` },
      claimIds: s.claimIds,
      reconstruction: { characterIds: s.spec.cast.map(c => c.characterId), basis: s.basis, generator: m.generator },
    }];
  });
  // Faceless scenes lead a room, so the banner is a place or an object before it is a painted person.
  const roomOf = (assetId: string) => byId.get(assetId)?.roomId;
  return {
    ...dossier,
    assets: [...dossier.assets, ...recon],
    rooms: dossier.rooms.map(room => ({
      ...room,
      nodes: room.nodes.map((n, i) => i === 0
        ? { ...n, assetIds: [...n.assetIds, ...recon.filter(a => roomOf(a.id) === room.id).sort((a, b) => (a.reconstruction?.characterIds.length ? 1 : 0) - (b.reconstruction?.characterIds.length ? 1 : 0)).map(a => a.id)] }
        : n),
    })),
  };
}
