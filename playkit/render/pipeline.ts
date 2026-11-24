// playkit/render/pipeline.ts
//
// Unified Cross-Platform Render Pipeline Configuration & Stage Presets.
// Unifies Era Clash 3D / Ravencrest (`GTAO + SSR + TRAA/FXAA + FSR1 + CSM + Godrays + 3D LUT + KTX2`)
// with Phase 4's Clustered Forward+ Lights, SH9 Irradiance Probes, Parallax Box Reflections,
// Froxel Volumetric Fog, Instanced Decals, and GPU-Driven Culling — PLUS Parlor 3D Stage &
// 2D/2.5D Aesthetic Overhaul Presets so Kith, Firstlight, and Parlor games share one render spine!

import { QUALITY_PROFILES, type QualityProfile, type QualityTier } from '../core/engine';
import type { GameDimension } from '../core/registry';
import { FROXEL_TIER_CONFIGS, type FroxelGridConfig } from './froxelFog';

export interface RenderPipelinePlan {
  tier: QualityTier;
  dimension: GameDimension;
  quality: QualityProfile;
  froxelFog: FroxelGridConfig | null;
  passes: string[];
  estimatedFrameMsDesktop: number;
  estimatedFrameMsMobile: number;
}

export interface StageVisualPreset {
  id: string;
  name: string;
  targetModes: GameDimension[];
  lutName: string;
  exposure: number;
  fogTintHex: number;
  sunTintHex: number;
  rimAccentHex: number;
  enableProbesGi: boolean;
  enableFroxelFog: boolean;
  enableDecals: boolean;
  description: string;
}

/** Shared look presets — includes Parlor 3D broadcast stages & Firstlight/Kith visual overhauls. */
export const STAGE_VISUAL_PRESETS: Record<string, StageVisualPreset> = {
  'fable-void-sanctum': {
    id: 'fable-void-sanctum',
    name: 'Fable Void Sanctum',
    targetModes: ['3d', '2.5d'],
    lutName: 'amber_twilight_filmic',
    exposure: 1.08,
    fogTintHex: 0x0b0e1c,
    sunTintHex: 0xfef3c7,
    rimAccentHex: 0x38bdf8,
    enableProbesGi: true,
    enableFroxelFog: true,
    enableDecals: true,
    description: 'Dark-fantasy stone & torchlight with subtle arcane-cyber rim accents (Rift Realm / Ravencrest).',
  },
  'firstlight-primetime-stadium': {
    id: 'firstlight-primetime-stadium',
    name: 'Firstlight Primetime Stadium',
    targetModes: ['3d'],
    lutName: 'broadcast_crisp_hdr',
    exposure: 1.15,
    fogTintHex: 0x101828,
    sunTintHex: 0xfff8e7,
    rimAccentHex: 0xf59e0b,
    enableProbesGi: true,
    enableFroxelFog: true,
    enableDecals: true,
    description: 'High-contrast stadium floodlights, turf wear decals, volumetric stadium haze, and instanced crowd culling.',
  },
  'kith-storybook-garden': {
    id: 'kith-storybook-garden',
    name: 'Kith Storybook Garden',
    targetModes: ['3d', '2.5d', '2d'],
    lutName: 'vibrant_storybook',
    exposure: 1.12,
    fogTintHex: 0x2a4566,
    sunTintHex: 0xffe8b6,
    rimAccentHex: 0x7dd3fc,
    enableProbesGi: true,
    enableFroxelFog: false,
    enableDecals: true,
    description: 'Lush sunlit vegetation, warm bounce GI, crisp silhouettes, and tactile skid/impact decals (Kith Party & Quest).',
  },
  'parlor-broadcast-studio-3d': {
    id: 'parlor-broadcast-studio-3d',
    name: 'Parlor Live Broadcast Stage (3D)',
    targetModes: ['parlor', '3d'],
    lutName: 'velvet_showstage',
    exposure: 1.1,
    fogTintHex: 0x120c24,
    sunTintHex: 0xffd27d,
    rimAccentHex: 0xe879f9,
    enableProbesGi: true,
    enableFroxelFog: true,
    enableDecals: false,
    description: 'Upgrades Brain Rush, Crowd Says, Impostor Night, and Sketch Rush into an animated 3D game-show stage with volumetric spotlights.',
  },
  'parlor-fable-tavern-3d': {
    id: 'parlor-fable-tavern-3d',
    name: 'Parlor Candlelit Tavern (3D)',
    targetModes: ['parlor', '3d'],
    lutName: 'hearth_warmth',
    exposure: 1.05,
    fogTintHex: 0x1c120d,
    sunTintHex: 0xffa94d,
    rimAccentHex: 0xf59e0b,
    enableProbesGi: true,
    enableFroxelFog: true,
    enableDecals: false,
    description: 'Cozy CAD/BIM tavern interior with warm hearth bounce probes for social deduction and tabletop parlor nights.',
  },
};

/** Assemble the exact ordered pass graph for a given platform quality tier and game dimension. */
export function buildRenderPipelinePlan(tier: QualityTier, dimension: GameDimension = '3d'): RenderPipelinePlan {
  const q = QUALITY_PROFILES[tier];
  const passes: string[] = [];

  if (dimension === '2d') {
    passes.push('2d-tile-background', '2d-sprite-layers', '2d-dynamic-lights');
    if (q.bloom) passes.push(`bloom-${q.bloom}`);
    passes.push('lut3d-grade', '2d-ui-hud');
    return {
      tier,
      dimension,
      quality: q,
      froxelFog: null,
      passes,
      estimatedFrameMsDesktop: 2.2,
      estimatedFrameMsMobile: 5.5,
    };
  }

  passes.push('gpu-frustum-hiz-cull');
  if (q.shadowMapSize > 0) passes.push(`csm-shadows-${q.shadowCascades}x${q.shadowMapSize}`);
  passes.push('clustered-forward-light-binning');
  passes.push('opaque-pbr-detail-sss-probes-gi');
  passes.push('instanced-decals');
  if (q.gtao) passes.push('gtao-halfres');
  if (q.ssr) passes.push(`ssr-scale-${q.ssrScale}`);
  if (q.froxelFog) passes.push('froxel-volumetric-fog');
  passes.push('transparent-water-vfx-aniso-hair');
  if (q.bloom) passes.push(`bloom-${q.bloom}`);
  if (q.antiAliasing !== 'none') passes.push(q.antiAliasing);
  if (q.fsr1Upscale) passes.push('fsr1-upscale-rcas');
  passes.push('tonemap-lut3d-output');
  if (dimension === 'parlor') passes.push('parlor-stage-2d-overlay');

  const desktopMs = tier === 'low' ? 3.5 : tier === 'medium' ? 6.2 : tier === 'high' ? 10.5 : 14.2;
  const mobileMs = tier === 'low' ? 9.8 : tier === 'medium' ? 14.5 : tier === 'high' ? 22.0 : 34.0;

  return {
    tier,
    dimension,
    quality: q,
    froxelFog: q.froxelFog ? FROXEL_TIER_CONFIGS[tier] : null,
    passes,
    estimatedFrameMsDesktop: desktopMs,
    estimatedFrameMsMobile: mobileMs,
  };
}
