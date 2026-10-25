// creativeStudioBridge.ts ââ‚¬” Unified bridge for Plajah's Native Creative Studio.
// Orchestrates on-device execution for:
//   1. Cinema Stills (FLUX.1 schnell/dev)
//   2. Detail Enhancer & 4K Upscaler (Micro-texture hallucination)
//   3. 3D Relighting (Directional key light & ambient environment swap)
//   4. Cinema Motion (Wan 2.1 video generation)
//
// 100% Native Plajah Platform: zero external vendor dependencies.

import { getLocalEngineStatus } from './localEngineDiscovery';
import {
  compileCinemaStillTask,
  compileDetailEnhanceTask,
  compileRelightTask,
  compileCinemaMotionTask,
} from './plajahPipelineEngine';
import { executePlajahNativeTask, NativeExecutionProgress } from './plajahNativeRunner';

export type ProgressCallback = (p: NativeExecutionProgress) => void;

export interface LocalCreativeStudioOptions {
  op: 'cinema_generate' | 'detail_enhance' | 'relight_scene' | 'cinema_motion';
  prompt: string;
  modelId?: string;
  sourceImageUrl?: string;
  aspect?: string;
  loraId?: string;
  loraWeight?: number;
  // Detail Hallucination dials:
  hallucinationLevel?: number; // 0..100 or 0..1
  resemblance?: number;        // 0..100 or 0..1
  engine?: 'none' | 'skin_pores' | 'fabric_weave' | 'architectural_sharp' | 'film_grain_organic' | 'cinematic' | 'photoreal' | 'comic_ink' | 'storybook' | '3d_render' | string;
  scaleFactor?: 2 | 4;
  // Relight dials:
  lightAzimuth?: number;       // -180..180
  lightElevation?: number;     // -90..90
  lightX?: number;             // -1.0..1.0
  lightY?: number;             // -1.0..1.0
  lightZ?: number;             // 0.05..1.0
  lightColorHex?: string;
  ambientColorHex?: string;
  rimColorHex?: string;
  lightIntensity?: number;
  softness?: number;
  shadowDensity?: number;
  rimStrength?: number;
  specularSheen?: number;
  subsurfaceScatter?: number;
  neuralLightWrap?: number;
  envPreset?: string;
  lens?: any;
  lighting?: any;
  cameraAngle?: string;
  // Motion dials:
  cameraMovement?: 'none' | 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'orbit' | 'static';
  motionStrength?: number;
  durationSec?: 3 | 5;
}

export interface CreativeStudioExecutionResult {
  source: 'local_gpu' | 'webgpu' | 'fallback';
  outputUrls: string[];
  /** Post-generation native ISO/IEC 18181 JPEG XL copy (`data:image/jxl;base64,...`). */
  jxlUrl?: string;
  /** Post-generation 320px JPEG XL thumbnail (`data:image/jxl;base64,...`). */
  thumbUrl?: string;
  durationMs: number;
  costCredits: number;
  note?: string;
  error?: string;
  width?: number;
  height?: number;
  seed?: number;
  hardwareBackend?: string;
}

/** Unified creative task execution dispatcher */
export async function executeCreativeStudioTask(
  options: LocalCreativeStudioOptions,
  onProgress?: ProgressCallback
): Promise<CreativeStudioExecutionResult> {
  await getLocalEngineStatus();

  // 1. Compile directorial intent into Plajah Native Task
  let task;
  if (options.op === 'cinema_generate') {
    task = compileCinemaStillTask({
      prompt: options.prompt,
      modelId: options.modelId,
      loraId: options.loraId,
      loraWeight: options.loraWeight,
      aspect: options.aspect as any,
      lens: options.lens,
      lighting: options.lighting,
      cameraAngle: options.cameraAngle,
    });
  } else if (options.op === 'detail_enhance' && options.sourceImageUrl) {
    task = compileDetailEnhanceTask({
      sourceImageUrl: options.sourceImageUrl,
      prompt: options.prompt,
      hallucinationLevel: options.hallucinationLevel ?? 35,
      resemblance: options.resemblance ?? 85,
      engine: options.engine ?? 'none',
      scaleFactor: options.scaleFactor ?? 2,
    });
  } else if (options.op === 'relight_scene' && options.sourceImageUrl) {
    task = compileRelightTask({
      sourceImageUrl: options.sourceImageUrl,
      lightAzimuth: options.lightAzimuth,
      lightElevation: options.lightElevation,
      lightX: options.lightX,
      lightY: options.lightY,
      lightZ: options.lightZ,
      lightColorHex: options.lightColorHex ?? '#ffaa55',
      ambientColorHex: options.ambientColorHex ?? '#182238',
      rimColorHex: options.rimColorHex ?? '#55ccff',
      intensity: options.lightIntensity ?? 1.25,
      softness: options.softness ?? 0.55,
      shadowDensity: options.shadowDensity ?? 0.68,
      rimStrength: options.rimStrength ?? 0.48,
      specularSheen: options.specularSheen ?? 0.42,
      subsurfaceScatter: options.subsurfaceScatter ?? 0.40,
      neuralLightWrap: options.neuralLightWrap ?? 0.20,
      envPreset: options.envPreset ?? 'none',
      ambientPrompt: options.prompt,
    });
  } else if (options.op === 'cinema_motion' && options.sourceImageUrl) {
    task = compileCinemaMotionTask({
      keyframeImageUrl: options.sourceImageUrl,
      motionPrompt: options.prompt,
      cameraMovement: options.cameraMovement,
      motionStrength: options.motionStrength,
      durationSec: options.durationSec,
    });
  } else {
    task = compileCinemaStillTask({
      prompt: options.prompt,
      aspect: options.aspect as any,
    });
  }

  // 2. Execute directly on Plajah's Native on-device runtime
  const result = await executePlajahNativeTask(task, onProgress);

  if (result.success) {
    const isDirectGpu = result.hardwareBackend === 'NVIDIA_TENSORRT' || result.hardwareBackend === 'WINDOWS_DIRECTML';
    return {
      source: isDirectGpu ? 'local_gpu' : 'webgpu',
      outputUrls: [result.mediaUrl],
      jxlUrl: result.jxlUrl,
      thumbUrl: result.thumbUrl,
      durationMs: result.executionTimeMs,
      costCredits: 0,
      note: `Generated on Plajah Native Engine (${result.hardwareBackend}) - 0 credits used (100% free)`,
      width: result.width,
      height: result.height,
      seed: result.seed,
      hardwareBackend: result.hardwareBackend,
    };
  }

  return {
    source: 'fallback',
    outputUrls: [],
    durationMs: result.executionTimeMs,
    costCredits: 0,
    error: result.error || 'Plajah native rendering failed. Ensure your GPU acceleration is enabled.',
  };
}
