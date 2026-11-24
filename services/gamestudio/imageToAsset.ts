// services/gamestudio/imageToAsset.ts
//
// Reference Image -> Semantic Analysis -> Implied Geometry -> Aria Production Pipeline.
// Enforces Kenne's rule: NEVER lay an image flat onto a primitive.
//   1) Delights source RGBA pixels (`delightAlbedo`) to strip baked directional shadows
//   2) Extracts aspect ratio, dominant material palette, and structural hints
//   3) Classifies into Organic / Vegetation / Architecture+Interior / Hard-Surface / Parlor / 2D
//   4) Infers implied 3D dimensions & structural details (e.g. stories + walkable interior rooms
//      for buildings; species + space-colonization crown for trees; SubD/NURBS assemblies for props)
//   5) Feeds directly into `AriaStudioAgent.produce()` to emit a verified `CompiledPrefabManifest`!

import { delightAlbedo } from './compiler/mapBaker';
import type { AssetPipelineKind } from './compiler/schema';
import {
  AriaStudioAgent,
  classifyProductionBrief,
  type AriaProductionResult,
} from './ariaAgent';
import type { QualityTier } from '../../playkit/core/engine';
import type { Vec3 } from './schema';

export interface ReferenceImageInput {
  filename: string;
  width: number;
  height: number;
  rgba: Uint8Array;
  userPrompt?: string;
  targetTier?: QualityTier;
  targetLevelId?: string;
  placeAt?: Vec3;
}

export interface ImageSemanticReading {
  pipeline: AssetPipelineKind;
  aspectRatio: number;
  dominantHex: number;
  accentHex: number;
  delightedMeanLuminance: number;
  inferredParams: Record<string, unknown>;
  impliedGeometrySteps: string[];
  synthesizedPrompt: string;
}

export interface ImageProductionResult {
  reading: ImageSemanticReading;
  production: AriaProductionResult;
  delightedRgba: Uint8Array;
}

function rgbToHex(r: number, g: number, b: number): number {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return (cr << 16) | (cg << 8) | cb;
}

/**
 * Analyze a reference image's pixels, aspect ratio, filename, and prompt to infer
 * its semantic class, delighted material palette, and implied 3D structural parameters.
 */
export function analyzeReferenceImage(input: ReferenceImageInput): {
  reading: ImageSemanticReading;
  delightedRgba: Uint8Array;
} {
  const delightedRgba = delightAlbedo(input.rgba, input.width, input.height, 0.72);
  const aspectRatio = input.width / Math.max(1, input.height);
  const pxCount = Math.max(1, input.width * input.height);

  let sumR = 0, sumG = 0, sumB = 0;
  let greenDominantPx = 0;
  let warmGoldPx = 0;
  let coolCyanPx = 0;
  let darkStonePx = 0;
  let sumLum = 0;

  for (let i = 0; i < pxCount; i++) {
    const r = delightedRgba[i * 4];
    const g = delightedRgba[i * 4 + 1];
    const b = delightedRgba[i * 4 + 2];
    sumR += r; sumG += g; sumB += b;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sumLum += lum;
    if (g > r * 1.15 && g > b * 1.1 && g > 45) greenDominantPx++;
    if (r > 150 && g > 95 && b < 110) warmGoldPx++;
    if (b > 125 && g > 110 && r < 110) coolCyanPx++;
    if (lum < 0.32 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) darkStonePx++;
  }

  const meanR = sumR / pxCount;
  const meanG = sumG / pxCount;
  const meanB = sumB / pxCount;
  const greenRatio = greenDominantPx / pxCount;
  const warmRatio = warmGoldPx / pxCount;
  const cyanRatio = coolCyanPx / pxCount;
  const stoneRatio = darkStonePx / pxCount;

  const combinedText = `${input.userPrompt ?? ''} ${input.filename.replace(/[_-]+/g, ' ')}`.trim();
  let pipeline: AssetPipelineKind = classifyProductionBrief({ prompt: combinedText });

  // If no strong keyword matched (defaulted to organic), refine using image color/aspect signals
  const hasExplicitKeyword = /\b(parlor|trivia|impostor|2d|sprite|tree|oak|pine|forest|willow|building|tavern|cathedral|house|castle|bunker|stadium|shrine|tower|facade|ruins|keep|fortress|car|kart|vehicle|machine|furniture|chair|table|weapon|sword|rifle|hero|angel|monster|character|creature|player)\b/i.test(combinedText);
  if (!hasExplicitKeyword) {
    if (greenRatio > 0.28) pipeline = 'vegetation';
    else if (stoneRatio > 0.35) pipeline = 'architecture';
    else if (aspectRatio > 1.55) pipeline = 'hard-surface';
  }

  const inferredParams: Record<string, unknown> = {};
  const impliedGeometrySteps: string[] = [
    'Delighted reference albedo to remove baked directional lighting',
  ];

  let synthesizedPrompt = combinedText || input.filename;
  if (pipeline === 'architecture') {
    const stories = aspectRatio < 0.85 ? 3 : aspectRatio < 1.25 ? 2 : 1;
    const widthM = Math.round(Math.max(8, Math.min(20, 10 * aspectRatio)));
    const depthM = Math.round(Math.max(8, widthM * 0.82));
    inferredParams.stories = stories;
    inferredParams.widthM = widthM;
    inferredParams.depthM = depthM;
    const styleWord = cyanRatio > 0.15 ? 'cyber citadel' : warmRatio > 0.18 ? 'fable timber tavern' : 'gothic stone cathedral';
    if (!hasExplicitKeyword) synthesizedPrompt = `${styleWord} building (${stories} stories)`;
    impliedGeometrySteps.push(
      `Inferred ${stories}-story ${widthM}m × ${depthM}m CAD/BIM structural envelope`,
      'Generated walkable interior room layout, ≥0.95m doorways, recessed windows & IFC slabs',
      'Baked interior L2 SH9 GI probes & room parallax reflection boxes',
    );
  } else if (pipeline === 'vegetation') {
    const speciesWord = cyanRatio > 0.12 ? 'cyber willow tree' : warmRatio > 0.2 ? 'autumn maple tree' : 'fable ancient oak tree';
    if (!hasExplicitKeyword) synthesizedPrompt = speciesWord;
    impliedGeometrySteps.push(
      'Grew botanical branch skeleton via space-colonization + Leonardo pipe-model radii',
      'Applied ellipsoidal 3D crown normal-transfer & wind sway vertex weights',
      'Compiled LOD0/LOD1/LOD2 + 16-view octahedral impostor',
    );
  } else if (pipeline === 'hard-surface') {
    impliedGeometrySteps.push(
      'Constructed smooth NURBS loft/revolve geometry with curvature-adaptive UVs',
      'Decomposed movable sub-assemblies with explicit physics hinge/spring joints',
      'Substituted semantic PBR micro-detail metal/wood shaders',
    );
  } else if (pipeline === 'organic') {
    inferredParams.heightM = aspectRatio < 0.7 ? 2.1 : 1.85;
    impliedGeometrySteps.push(
      'Built watertight Catmull-Clark SubD anatomical volume',
      'Bound pose-space muscle/wrinkle drivers, WebGPU cloth & Prop Class sockets',
      'Generated ragdoll capsule chain & skin SSS material graph',
    );
  }

  const dominantHex = rgbToHex(meanR, meanG, meanB);
  const accentHex = cyanRatio > warmRatio ? 0x38bdf8 : warmRatio > 0.08 ? 0xf59e0b : 0xa855f7;

  return {
    delightedRgba,
    reading: {
      pipeline,
      aspectRatio: Number(aspectRatio.toFixed(2)),
      dominantHex,
      accentHex,
      delightedMeanLuminance: Number((sumLum / pxCount).toFixed(3)),
      inferredParams,
      impliedGeometrySteps,
      synthesizedPrompt,
    },
  };
}

/** Run the complete Reference-Image -> Implied-Geometry -> Aria Studio Production pipeline. */
export function produceFromReferenceImage(
  input: ReferenceImageInput,
  agent = new AriaStudioAgent(),
): ImageProductionResult {
  const { reading, delightedRgba } = analyzeReferenceImage(input);
  const production = agent.produce({
    prompt: reading.synthesizedPrompt,
    name: input.userPrompt?.trim() || input.filename.replace(/\.[^.]+$/, ''),
    pipelineHint: reading.pipeline,
    targetTier: input.targetTier ?? 'medium',
    targetLevelId: input.targetLevelId,
    placeAt: input.placeAt,
    params: reading.inferredParams,
  });

  // Append implied-geometry notes into QA report for full creator transparency
  production.qa.notes.push(...reading.impliedGeometrySteps);
  return { reading, production, delightedRgba };
}
