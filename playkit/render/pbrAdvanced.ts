// playkit/render/pbrAdvanced.ts
//
// Next-Gen Cross-Platform Real-Time PBR Shading Contracts & WGSL/TSL Building Blocks:
//   - Dual-scale distance-blended Micro-Detail Normals (never blurry up close)
//   - Skin & Foliage Subsurface Scattering (Wrap + Backlight Thickness Translucency)
//   - Anisotropic Hair Specular (Kajiya-Kay dual-lobe shifted tangent highlight)
//   - Parallax Occlusion Mapping (POM) for deep brick/cobble/rune relief without extra tris
//   - Curvature/AO-Driven Procedural Weathering (edge wear + crevice moss/grime)

import type { Vec3 } from '../physics/runtime';

export interface AdvancedPbrMaterialConfig {
  id: string;
  baseColorHex: number;
  roughness: number;
  metalness: number;
  detailNormal?: {
    enabled: boolean;
    tiling: number;
    strength: number;
    fadeStartM: number;
    fadeEndM: number;
  };
  subsurface?: {
    enabled: boolean;
    wrapFactor: number;
    translucencyPower: number;
    scatterColor: Vec3;
    thicknessScale: number;
  };
  anisotropicHair?: {
    enabled: boolean;
    primaryShift: number;
    secondaryShift: number;
    primaryExponent: number;
    secondaryExponent: number;
  };
  parallaxOcclusion?: {
    enabled: boolean;
    heightScale: number;
    minSteps: number;
    maxSteps: number;
  };
  weathering?: {
    edgeWearStrength: number;
    creviceGrimeStrength: number;
    wetness: number;
  };
}

/** Compute distance-faded micro-detail normal strength so close surfaces stay sharp without distant aliasing. */
export function computeDetailNormalWeight(cameraDistM: number, fadeStartM = 3.5, fadeEndM = 18.0): number {
  if (cameraDistM <= fadeStartM) return 1;
  if (cameraDistM >= fadeEndM) return 0;
  const t = (cameraDistM - fadeStartM) / Math.max(1e-4, fadeEndM - fadeStartM);
  return 1 - t * t * (3 - 2 * t); // smoothstep falloff
}

/**
 * Evaluate Wrap + Backlight Subsurface Scattering contribution (runs fast on mobile & desktop).
 * Gives skin ears/noses and backlit tree foliage realistic warm/botanical translucency.
 */
export function evaluateSubsurfaceScatter(opts: {
  normal: Vec3;
  lightDir: Vec3;
  viewDir: Vec3;
  thickness: number; // 0 = thin/translucent, 1 = thick/opaque
  wrapFactor: number;
  translucencyPower: number;
  scatterColor: Vec3;
}): Vec3 {
  const ndotl = opts.normal[0] * opts.lightDir[0] + opts.normal[1] * opts.lightDir[1] + opts.normal[2] * opts.lightDir[2];
  const wrap = Math.max(0, (ndotl + opts.wrapFactor) / (1 + opts.wrapFactor));

  // View-dependent backlit translucency lobe
  const hx = -(opts.lightDir[0] + opts.normal[0] * 0.35);
  const hy = -(opts.lightDir[1] + opts.normal[1] * 0.35);
  const hz = -(opts.lightDir[2] + opts.normal[2] * 0.35);
  const hLen = Math.hypot(hx, hy, hz) || 1;
  const vDotH = Math.max(0, (opts.viewDir[0] * hx + opts.viewDir[1] * hy + opts.viewDir[2] * hz) / hLen);
  const backLight = Math.pow(vDotH, opts.translucencyPower) * (1 - Math.max(0, Math.min(1, opts.thickness)));
  const total = wrap * 0.45 + backLight;

  return [
    opts.scatterColor[0] * total,
    opts.scatterColor[1] * total,
    opts.scatterColor[2] * total,
  ];
}

/**
 * Kajiya-Kay Anisotropic Hair Specular lobe (shifted strand tangent highlight).
 */
export function evaluateKajiyaKayHair(
  tangent: Vec3,
  normal: Vec3,
  halfVec: Vec3,
  tangentShift: number,
  exponent: number,
): number {
  const tx = tangent[0] + normal[0] * tangentShift;
  const ty = tangent[1] + normal[1] * tangentShift;
  const tz = tangent[2] + normal[2] * tangentShift;
  const len = Math.hypot(tx, ty, tz) || 1;
  const tDotH = (tx * halfVec[0] + ty * halfVec[1] + tz * halfVec[2]) / len;
  const sinTH = Math.sqrt(Math.max(0, 1 - tDotH * tDotH));
  return Math.pow(sinTH, exponent);
}

/** Preset factory for Plajah's 4 headline material families. */
export const ADVANCED_PBR_PRESETS: Record<'hero-skin' | 'hero-hair' | 'fable-masonry' | 'foliage-canopy', AdvancedPbrMaterialConfig> = {
  'hero-skin': {
    id: 'pbr.hero_skin',
    baseColorHex: 0xd9a88f,
    roughness: 0.46,
    metalness: 0.0,
    detailNormal: { enabled: true, tiling: 28, strength: 0.35, fadeStartM: 1.5, fadeEndM: 6.5 },
    subsurface: { enabled: true, wrapFactor: 0.5, translucencyPower: 3.0, scatterColor: [0.95, 0.34, 0.22], thicknessScale: 1.0 },
  },
  'hero-hair': {
    id: 'pbr.hero_hair',
    baseColorHex: 0x2c2019,
    roughness: 0.38,
    metalness: 0.0,
    anisotropicHair: { enabled: true, primaryShift: -0.08, secondaryShift: 0.14, primaryExponent: 64, secondaryExponent: 24 },
  },
  'fable-masonry': {
    id: 'pbr.fable_masonry',
    baseColorHex: 0x5c6068,
    roughness: 0.84,
    metalness: 0.05,
    detailNormal: { enabled: true, tiling: 14, strength: 0.55, fadeStartM: 4, fadeEndM: 22 },
    parallaxOcclusion: { enabled: true, heightScale: 0.035, minSteps: 4, maxSteps: 14 },
    weathering: { edgeWearStrength: 0.45, creviceGrimeStrength: 0.7, wetness: 0.15 },
  },
  'foliage-canopy': {
    id: 'pbr.foliage_canopy',
    baseColorHex: 0x3a6e32,
    roughness: 0.58,
    metalness: 0.0,
    subsurface: { enabled: true, wrapFactor: 0.65, translucencyPower: 2.5, scatterColor: [0.45, 0.78, 0.2], thicknessScale: 0.5 },
  },
};

/** Reusable WGSL snippet for Parallax Occlusion Mapping (POM) in custom WebGPU/TSL passes. */
export const WGSL_POM_FUNCTION = /* wgsl */ `
fn parallaxOcclusionUv(uvIn: vec2<f32>, viewDirTS: vec3<f32>, heightScale: f32, steps: i32, heightTex: texture_2d<f32>, samp: sampler) -> vec2<f32> {
  let layerDepth = 1.0 / f32(steps);
  var curDepth = 0.0;
  let deltaUv = (viewDirTS.xy / max(0.2, viewDirTS.z)) * heightScale / f32(steps);
  var curUv = uvIn;
  var sampled = 1.0 - textureSampleLevel(heightTex, samp, curUv, 0.0).b;
  for (var i: i32 = 0; i < steps; i = i + 1) {
    if (curDepth >= sampled) { break; }
    curUv = curUv - deltaUv;
    sampled = 1.0 - textureSampleLevel(heightTex, samp, curUv, 0.0).b;
    curDepth = curDepth + layerDepth;
  }
  let prevUv = curUv + deltaUv;
  let afterD = sampled - curDepth;
  let beforeD = (1.0 - textureSampleLevel(heightTex, samp, prevUv, 0.0).b) - curDepth + layerDepth;
  let w = afterD / max(1e-4, afterD - beforeD);
  return mix(curUv, prevUv, clamp(w, 0.0, 1.0));
}
`;
