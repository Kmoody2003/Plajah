// creativeStudioBridge.ts — Unified bridge for Plajah's Native Creative Studio.
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
  sourceImageUrl?: string;
  aspect?: string;
  // Detail Hallucination dials:
  hallucinationLevel?: number; // 0..100
  resemblance?: number;        // 0..100
  engine?: 'cinematic' | 'photoreal' | 'comic_ink' | 'storybook' | '3d_render';
  scaleFactor?: 2 | 4;
  // Relight dials:
  lightAzimuth?: number;       // -180..180
  lightElevation?: number;     // -90..90
  lightColorHex?: string;
  lightIntensity?: number;
  // Directorial lens & lighting:
  lens?: 'anamorphic' | '35mm' | '50mm' | '85mm' | 'macro' | 'ultra_wide';
  lighting?: 'chiaroscuro' | 'golden_hour' | 'neon_noir' | 'studio_soft' | 'dramatic_rim' | 'natural_overcast';
  // Motion dials:
  cameraMovement?: 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'orbit' | 'static';
  motionStrength?: number;
  durationSec?: 3 | 5;
}

export interface CreativeStudioExecutionResult {
  source: 'local_gpu' | 'webgpu' | 'fallback';
  outputUrls: string[];
  durationMs: number;
  costCredits: number;
  note?: string;
  error?: string;
}

/** Unified creative task execution dispatcher */
export async function executeCreativeStudioTask(
  options: LocalCreativeStudioOptions,
  onProgress?: ProgressCallback
): Promise<CreativeStudioExecutionResult> {
  const engineStatus = await getLocalEngineStatus();

  // 1. Compile directorial intent into Plajah Native Task
  let task;
  if (options.op === 'cinema_generate') {
    task = compileCinemaStillTask({
      prompt: options.prompt,
      aspect: options.aspect as any,
      lens: options.lens,
      lighting: options.lighting,
    });
  } else if (options.op === 'detail_enhance' && options.sourceImageUrl) {
    task = compileDetailEnhanceTask({
      sourceImageUrl: options.sourceImageUrl,
      prompt: options.prompt,
      hallucinationLevel: options.hallucinationLevel ?? 50,
      resemblance: options.resemblance ?? 70,
      engine: options.engine ?? 'cinematic',
      scaleFactor: options.scaleFactor ?? 2,
    });
  } else if (options.op === 'relight_scene' && options.sourceImageUrl) {
    task = compileRelightTask({
      sourceImageUrl: options.sourceImageUrl,
      lightAzimuth: options.lightAzimuth ?? 45,
      lightElevation: options.lightElevation ?? 30,
      lightColorHex: options.lightColorHex ?? '#fff5ea',
      intensity: options.lightIntensity ?? 1.0,
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
      durationMs: result.executionTimeMs,
      costCredits: 0,
      note: `Generated on Plajah Native Engine (${result.hardwareBackend}) - 0 credits used (100% free)`,
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
