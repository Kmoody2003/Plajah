// rasterLegacyBridge — keeps legacy image-layer ops meaningful once a device has a raster doc.
//
// Why: once the Image Studio has written `TelaImageDevice.raster`, that document is the
// source of truth and `layers` is only the legacy view. Several older surfaces still emit
// legacy ops against an Image device — dropping a file on it in Page posture
// (ADD_IMAGE_LAYER), the flying menu / context menu (UPDATE_ / DELETE_IMAGE_LAYER). Without
// a mirror those edits would land in `layers` and silently never show. These helpers return
// the extra fields applyTelaOp spreads into the device: nothing for legacy-only devices (so
// their behaviour is byte-identical), a mirrored raster doc otherwise. Pure; ids are kept.

import type { TelaImageDevice, TelaImageLayer } from '../../../types';
import { migrateLegacyImageDevice, insertLayer, removeLayer, updateLayer, findLayer, affineMul, affineTranslate, affineRotate, affineScale, legacyAdjustToSmartFilters, type RasterLayer, type PixelLayer, type BlendMode } from '../../../services/tela/raster/model';

type Mirror = Partial<Pick<TelaImageDevice, 'raster'>>;

/** The raster PixelLayer a legacy layer becomes (same migration the engine uses on open). */
export function legacyLayerToRaster(d: TelaImageDevice, layer: TelaImageLayer): RasterLayer | null {
  const doc = migrateLegacyImageDevice({ ...d, layers: [layer], groups: [], raster: undefined });
  return doc.layers[0] ?? null;
}

export function mirrorLegacyAdd(d: TelaImageDevice, layer: TelaImageLayer): Mirror {
  if (!d.raster) return {};
  const l = legacyLayerToRaster(d, { ...layer, groupId: undefined });
  return l ? { raster: insertLayer(d.raster, l) } : {};
}

export function mirrorLegacyDelete(d: TelaImageDevice, layerId: string): Mirror {
  if (!d.raster || !findLayer(d.raster, layerId)) return {};
  return { raster: removeLayer(d.raster, layerId) };
}

export function mirrorLegacyUpdate(d: TelaImageDevice, layerId: string, patch: Partial<TelaImageLayer>): Mirror {
  if (!d.raster) return {};
  const hit = findLayer(d.raster, layerId); if (!hit) return {};
  const legacy = d.layers.find(l => l.id === layerId), merged = legacy ? { ...legacy, ...patch } : null;
  const next: Record<string, unknown> = {};
  if (patch.visible !== undefined) next.visible = patch.visible;
  if (patch.opacity !== undefined) next.opacity = patch.opacity;
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.blend !== undefined && hit.layer.kind !== 'group') next.blend = patch.blend as BlendMode;
  if (merged && hit.layer.kind === 'pixel' && ('x' in patch || 'y' in patch || 'scale' in patch || 'rotation' in patch))
    next.transform = affineMul(affineTranslate(merged.x, merged.y), affineMul(affineRotate(merged.rotation || 0), affineScale(merged.scale || 1)));
  if (merged && hit.layer.kind === 'pixel' && patch.adjust) {
    const keep = ((hit.layer as PixelLayer).smartFilters || []).filter(f => !(f.filter.type === 'adjust' && f.filter.adjustment.type === 'cssColor') && f.filter.type !== 'gaussianBlur');
    next.smartFilters = [...keep, ...legacyAdjustToSmartFilters(merged.adjust)];
  }
  if (!Object.keys(next).length) return {};
  return { raster: updateLayer(d.raster, layerId, next as Partial<RasterLayer>) };
}
