// plajahPipelineEngine.ts — Plajah Native Generative Pipeline Engine.
// Directorial intent compiler that translates creative cinematic parameters
// into Plajah's on-device native diffusion and generative tensor runtime.
//
// 100% Native Plajah Architecture:
// - Runs directly inside Plajah's Windows WinUI 3 shell (DirectML / TensorRT) and browser WebGPU.
// - Zero external vendor dependencies: does NOT require ComfyUI, Forge, or external web servers.

export interface CinemaStillIntent {
  prompt: string;
  negativePrompt?: string;
  aspect?: '16:9' | '2.39:1' | '9:16' | '1:1' | '4:3' | '3:2';
  lens?: 'anamorphic' | '35mm' | '50mm' | '85mm' | 'macro' | 'ultra_wide';
  lighting?: 'chiaroscuro' | 'golden_hour' | 'neon_noir' | 'studio_soft' | 'dramatic_rim' | 'natural_overcast';
  steps?: number;
  seed?: number;
}

export interface DetailEnhanceIntent {
  sourceImageUrl: string;
  prompt?: string;
  hallucinationLevel: number; // 0 to 100 (Detail injection / creativity)
  resemblance: number;       // 0 to 100 (Fidelity to input source)
  engine: 'cinematic' | 'photoreal' | 'comic_ink' | 'storybook' | '3d_render';
  scaleFactor?: 2 | 4;
  hdrStrength?: number;
}

export interface RelightIntent {
  sourceImageUrl: string;
  lightAzimuth: number;    // -180 to 180 degrees (horizontal compass around subject)
  lightElevation: number;  // -90 to 90 degrees (vertical elevation angle)
  lightColorHex?: string;  // e.g. '#ff8833' for warm golden hour
  intensity: number;       // 0.2 to 2.0
  ambientPrompt?: string;  // e.g. "rainy neon city alleyway"
}

export interface CinemaMotionIntent {
  keyframeImageUrl: string;
  motionPrompt: string;
  cameraMovement?: 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'orbit' | 'static';
  motionStrength?: number; // 1 to 10
  durationSec?: 3 | 5;
  seed?: number;
}

export interface VectorArtIntent {
  prompt: string;
  style: 'flat_vector' | 'bold_comic' | 'vintage_poster' | 'minimal_icon' | 'storybook_woodcut';
  paletteHint?: string;
}

export interface ComicPanelIntent {
  characterPrompt: string;
  faceEmbeddingRef?: string; // Character Bible likeness anchor
  sceneActionPrompt: string;
  cameraShot: 'establishing' | 'full_shot' | 'medium' | 'over_the_shoulder' | 'close_up' | 'extreme_close_up' | 'low_angle_hero';
  moodLighting?: string;
  aspect?: '1:1' | '16:9' | '4:5' | '2:3';
}

/** Compute optimal pixel dimensions matching aspect ratio (multiples of 64) */
export function aspectToDimensions(aspect = '16:9', maxPixels = 1048576): { width: number; height: number } {
  let ratio = 16 / 9;
  switch (aspect) {
    case '2.39:1': ratio = 2.39 / 1; break;
    case '9:16': ratio = 9 / 16; break;
    case '1:1': ratio = 1; break;
    case '4:3': ratio = 4 / 3; break;
    case '3:2': ratio = 3 / 2; break;
    case '4:5': ratio = 4 / 5; break;
    case '2:3': ratio = 2 / 3; break;
    case '16:9': default: ratio = 16 / 9; break;
  }

  const height = Math.round(Math.sqrt(maxPixels / ratio) / 64) * 64;
  const width = Math.round((height * ratio) / 64) * 64;
  return { width, height };
}

/** Plajah Native Execution Task Payload */
export interface PlajahNativeTask {
  id: string;
  taskType: 'cinema_still' | 'detail_enhancer' | '3d_relight' | 'cinema_motion' | 'comic_panel' | 'vector_art';
  modelId: string;
  prompt: string;
  negativePrompt: string;
  dimensions: { width: number; height: number };
  steps: number;
  cfgScale: number;
  seed: number;
  sourceImage?: string;
  enhancement?: {
    hallucinationLevel: number;
    resemblance: number;
    engine: string;
    scaleFactor: number;
  };
  relighting?: {
    azimuth: number;
    elevation: number;
    colorHex: string;
    intensity: number;
    ambientPrompt?: string;
  };
  motion?: {
    cameraMovement: string;
    motionStrength: number;
    durationSec: number;
  };
  identity?: {
    characterRef?: string;
    likenessStrength: number;
  };
}

/**
 * Compiles Cinema Stills directorial parameters into a Plajah Native execution task.
 */
export function compileCinemaStillTask(intent: CinemaStillIntent): PlajahNativeTask {
  const { width, height } = aspectToDimensions(intent.aspect || '16:9');

  let lensMod = '';
  switch (intent.lens) {
    case 'anamorphic':
      lensMod = 'shot on 35mm Panavision anamorphic lens, subtle horizontal anamorphic lens flare, cinematic shallow depth of field, natural bokeh';
      break;
    case '35mm':
      lensMod = 'shot on Arri Alexa 35mm cinema camera, master prime lens, natural film grain, sharp focus';
      break;
    case '85mm':
      lensMod = '85mm f/1.4 portrait cinema prime, creamy background compression, razor sharp subject separation';
      break;
    case 'ultra_wide':
      lensMod = '18mm ultra wide angle cinematography, grand perspective, deep focus, architectural scale';
      break;
    case 'macro':
      lensMod = 'macro cinema lens, extreme textural detail, tactile surface focus, 100mm macro optics';
      break;
    default:
      lensMod = '50mm standard cinema prime, natural human perspective, authentic color grading';
  }

  let lightMod = '';
  switch (intent.lighting) {
    case 'chiaroscuro':
      lightMod = 'dramatic chiaroscuro lighting, deep rich shadow falloff, high contrast rim light, Rembrandt lighting';
      break;
    case 'golden_hour':
      lightMod = 'warm golden hour sun, low angle warm backlight, cinematic volumetric haze, soft atmospheric glow';
      break;
    case 'neon_noir':
      lightMod = 'cyberpunk neon noir lighting, cyan and magenta ambient reflections, wet ground specular highlights';
      break;
    case 'dramatic_rim':
      lightMod = 'strong theatrical edge lighting, sharp silhouette outline, atmospheric kicker light, moody backdrop';
      break;
    default:
      lightMod = 'soft diffuse studio lighting, natural balanced shadows, beauty lighting setup';
  }

  const fullPrompt = `${intent.prompt}, ${lensMod}, ${lightMod}, cinematic color grading, 8k resolution, raw photography, master film still`;
  const negPrompt = intent.negativePrompt || 'cgi, 3d render, blurry, distorted, plastic skin, oversaturated, amateur, watermark, bad anatomy';

  return {
    id: `plajah_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'cinema_still',
    modelId: 'flux_schnell',
    prompt: fullPrompt,
    negativePrompt: negPrompt,
    dimensions: { width, height },
    steps: intent.steps || 4,
    cfgScale: 1.0,
    seed: intent.seed ?? Math.floor(Math.random() * 2147483647),
  };
}

/**
 * Compiles Detail Enhancer parameters into a Plajah Native execution task.
 */
export function compileDetailEnhanceTask(intent: DetailEnhanceIntent): PlajahNativeTask {
  const scale = intent.scaleFactor || 2;
  const hallucinationRatio = Math.max(0, Math.min(100, intent.hallucinationLevel)) / 100;
  const fidelityRatio = Math.max(0, Math.min(100, intent.resemblance)) / 100;

  // Compute adaptive denoising step budget based on hallucination dial
  const denoiseSteps = Math.round(15 + hallucinationRatio * 35); // 15 to 50 steps
  const cfg = 4.0 + hallucinationRatio * 4.0;

  return {
    id: `plajah_enhance_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'detail_enhancer',
    modelId: 'supir_detail',
    prompt: intent.prompt || 'ultra high definition, photographic micro-texture, 8k raw detail, authentic surface pores and fibers',
    negativePrompt: 'blurry, pixelated, jpeg compression artifacts, flat plastic texture, over-smoothed',
    dimensions: { width: 1024, height: 1024 },
    steps: denoiseSteps,
    cfgScale: cfg,
    seed: Math.floor(Math.random() * 2147483647),
    sourceImage: intent.sourceImageUrl,
    enhancement: {
      hallucinationLevel: intent.hallucinationLevel,
      resemblance: intent.resemblance,
      engine: intent.engine,
      scaleFactor: scale,
    },
  };
}

/**
 * Compiles 3D Relighting parameters into a Plajah Native execution task.
 */
export function compileRelightTask(intent: RelightIntent): PlajahNativeTask {
  const hex = intent.lightColorHex || '#ffffff';
  const ambient = intent.ambientPrompt || 'cinematic atmosphere';

  return {
    id: `plajah_relight_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: '3d_relight',
    modelId: 'ic_light_fc',
    prompt: `subject illuminated by strong directional light vector, ${ambient}, photorealistic light wrap, accurate shadow casting, natural specular highlight, 8k`,
    negativePrompt: 'harsh flat flash, unrealistic reflections, unnatural contours, bad shading',
    dimensions: { width: 1024, height: 1024 },
    steps: 25,
    cfgScale: 7.0,
    seed: Math.floor(Math.random() * 2147483647),
    sourceImage: intent.sourceImageUrl,
    relighting: {
      azimuth: intent.lightAzimuth,
      elevation: intent.lightElevation,
      colorHex: hex,
      intensity: intent.intensity || 1.0,
      ambientPrompt: intent.ambientPrompt,
    },
  };
}

/**
 * Compiles Cinema Motion parameters into a Plajah Native execution task.
 */
export function compileCinemaMotionTask(intent: CinemaMotionIntent): PlajahNativeTask {
  let motionTrajectory = '';
  switch (intent.cameraMovement) {
    case 'push_in': motionTrajectory = 'slow cinematic camera push-in dolly forward, dramatic focal immersion'; break;
    case 'pull_out': motionTrajectory = 'smooth camera pull-out crane shot, revealing wide environment'; break;
    case 'pan_left': motionTrajectory = 'graceful horizontal camera pan left, sweeping cinematic view'; break;
    case 'pan_right': motionTrajectory = 'graceful horizontal camera pan right, cinematic movement'; break;
    case 'tilt_up': motionTrajectory = 'low angle camera tilt up, monumental scale'; break;
    case 'orbit': motionTrajectory = 'subtle 360 cinematic camera orbit around subject, parallax depth'; break;
    default: motionTrajectory = 'gentle organic cinematic camera breathing, high production value';
  }

  return {
    id: `plajah_motion_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'cinema_motion',
    modelId: 'wan_video_14b',
    prompt: `${intent.motionPrompt}, ${motionTrajectory}, 24 frames per second, filmic motion blur, smooth physical dynamics`,
    negativePrompt: 'jerky movement, camera stutter, morphing artifacts, distorted limbs, static freeze',
    dimensions: { width: 832, height: 480 },
    steps: 30,
    cfgScale: 6.0,
    seed: intent.seed ?? Math.floor(Math.random() * 2147483647),
    sourceImage: intent.keyframeImageUrl,
    motion: {
      cameraMovement: intent.cameraMovement || 'push_in',
      motionStrength: intent.motionStrength || 5,
      durationSec: intent.durationSec || 3,
    },
  };
}

/**
 * Compiles Comic Panel parameters into a Plajah Native execution task.
 */
export function compileComicPanelTask(intent: ComicPanelIntent): PlajahNativeTask {
  const { width, height } = aspectToDimensions(intent.aspect || '1:1');

  let shotComp = '';
  switch (intent.cameraShot) {
    case 'establishing': shotComp = 'wide establishing shot, environmental storytelling, comic panel composition'; break;
    case 'close_up': shotComp = 'dramatic close-up, intense emotional facial expression, sharp line work'; break;
    case 'extreme_close_up': shotComp = 'extreme close-up on eyes, cinematic tension, ink crosshatching'; break;
    case 'over_the_shoulder': shotComp = 'over-the-shoulder perspective shot, graphic novel dialogue framing'; break;
    case 'low_angle_hero': shotComp = 'low-angle hero shot, triumphant dynamic angle, bold silhouette'; break;
    default: shotComp = 'medium comic book panel framing, clear character posing';
  }

  const prompt = `${intent.characterPrompt}, ${intent.sceneActionPrompt}, ${shotComp}, ${intent.moodLighting || 'bold ink lighting'}, graphic novel art style, crisp lineart, professional comic illustration, high detail`;

  return {
    id: `plajah_comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'comic_panel',
    modelId: 'animagine_xl',
    prompt,
    negativePrompt: 'photorealistic, messy sketch, blurry lines, flat colors, bad hands, mutated fingers',
    dimensions: { width, height },
    steps: 28,
    cfgScale: 7.5,
    seed: Math.floor(Math.random() * 2147483647),
    identity: {
      characterRef: intent.faceEmbeddingRef,
      likenessStrength: 0.85,
    },
  };
}
