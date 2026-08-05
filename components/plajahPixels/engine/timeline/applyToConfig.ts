// engine/timeline/applyToConfig.ts — bridge a parsed natural-language
// instruction onto the app's VisualizationConfig. This is what lets a timeline
// marker drive the WHOLE app (scene, palette, speed, glow, sensitivity, …),
// not just the studio-only params.

import { ParamDiff } from './types';
import { PALETTES } from '../params';
import { VisualizationConfig, STUDIO_SCENE_TO_MODE } from '../../types';

export function applyDiffToConfig(diff: ParamDiff): Partial<VisualizationConfig> {
  const patch: Partial<VisualizationConfig> = {};
  if (diff.scene && STUDIO_SCENE_TO_MODE[diff.scene]) patch.mode = STUDIO_SCENE_TO_MODE[diff.scene];
  if (diff.palette != null && PALETTES[diff.palette]) patch.colorPalette = [...PALETTES[diff.palette]];
  for (const [k, v] of Object.entries(diff.set)) {
    if (k === 'speed') patch.speed = v as number;
    else if (k === 'glow') patch.glowIntensity = (v as number) * 15;
    else if (k === 'sens') patch.sensitivity = v as number;
    else if (k === 'trail') patch.studioTrail = v as number;
    else if (k === 'mirror') patch.studioMirror = !!v;
  }
  return patch;
}
