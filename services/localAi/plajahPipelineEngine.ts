// plajahPipelineEngine.ts — Plajah Native Generative Pipeline Engine.
// Directorial intent compiler that translates creative cinematic parameters
// into Plajah's on-device native diffusion and generative tensor runtime.
//
// 100% Native Plajah Architecture:
// - Runs directly inside Plajah's Windows WinUI 3 shell (DirectML / TensorRT) and browser WebGPU.
// - Zero external vendor dependencies: does NOT require ComfyUI, Forge, or external web servers.

import { plajahLoraRegistry } from './plajahLoraRegistry';

export type DirectorialLens =
  | 'anamorphic'
  | '35mm'
  | '50mm'
  | '85mm'
  | '135mm_telephoto'
  | 'macro_probe'
  | 'macro'
  | 'ultra_wide_18mm'
  | 'ultra_wide'
  | 'super_wide_12mm'
  | 'fisheye_8mm'
  | 'tilt_shift_45mm'
  | 'vintage_16mm_bolex'
  | '70mm_imax'
  | 'noctilux_f095'
  | 'petzval_swirl'
  | 'cine_zoom_24_290'
  | 'vintage_anamorphic_flare'
  | string;

export type DirectorialLighting =
  | 'chiaroscuro'
  | 'golden_hour'
  | 'neon_noir'
  | 'dramatic_rim'
  | 'high_key_commercial'
  | 'low_key_film_noir'
  | 'moonlight_cyan'
  | 'volumetric_godrays'
  | 'warm_candlelight'
  | 'bifrost_neon_synth'
  | 'overcast_softbox'
  | 'ringlight_beauty'
  | 'stage_spotlight'
  | 'underwater_caustics'
  | 'fluorescent_grit'
  | 'sunset_silhouette'
  | 'studio_soft'
  | 'natural_overcast'
  | string;

export type DirectorialCameraAngle =
  | 'eye_level'
  | 'front_portrait'
  | 'three_quarter_left'
  | 'three_quarter_right'
  | 'profile_left'
  | 'profile_right'
  | 'low_angle_hero'
  | 'high_angle_bird'
  | 'overhead_god_view'
  | 'over_the_shoulder'
  | 'dutch_angle'
  | 'extreme_close_up'
  | 'full_body_turnaround'
  | string;

export interface CinemaStillIntent {
  prompt: string;
  negativePrompt?: string;
  modelId?: string;
  loraId?: string;
  loraWeight?: number;
  aspect?: '16:9' | '2.39:1' | '9:16' | '1:1' | '4:3' | '3:2';
  lens?: DirectorialLens;
  lighting?: DirectorialLighting;
  cameraAngle?: DirectorialCameraAngle;
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
  motionPrompt: string;
  mode?: 'single_keyframe' | 'first_and_last_frame' | 'text_to_video';
  startKeyframeUrl?: string; // First Frame (Frame 0)
  endKeyframeUrl?: string;   // Last Frame (Frame N)
  keyframeImageUrl?: string; // backwards-compatible alias for startKeyframeUrl
  modelId?: 'wan_video_14b' | 'wan_video_fl' | 'wan_2_2' | 'ltx_video' | 'svd_video';
  cameraMovement?: 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'orbit' | 'orbit_360' | 'crane_down' | 'crane_up' | 'whip_pan' | 'drone_aerial' | 'static';
  motionStrength?: number; // 1 to 10
  durationSec?: number;    // e.g. 3, 4, 5, or snapped to dialogue seconds
  resolution?: '480p' | '720p';
  aspect?: '16:9' | '9:16' | '2.39:1' | '1:1';
  dialogueDurationSec?: number; // Automatic audio cradle snap
  dialogueAudioRef?: string;
  fps?: number; // default 24
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
    mode: 'single_keyframe' | 'first_and_last_frame' | 'text_to_video';
    cameraMovement: string;
    motionStrength: number;
    durationSec: number;
    fps: number;
    startKeyframeUrl?: string;
    endKeyframeUrl?: string;
    resolution: '480p' | '720p';
    audioDurationSnapped?: boolean;
    dialogueDurationSec?: number;
  };
  identity?: {
    characterRef?: string;
    likenessStrength: number;
  };
  lora?: {
    id: string;
    weight: number;
    triggerWords: string[];
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
      lensMod = 'shot on 35mm Panavision anamorphic lens, subtle horizontal anamorphic lens flare, oval cinematic bokeh, widescreen 2.39:1 depth';
      break;
    case '35mm':
      lensMod = 'shot on Arri Alexa 35mm cinema camera, Arri Master Prime 35mm optics, natural film grain, razor sharp optical focus';
      break;
    case '50mm':
      lensMod = 'Cooke S4/i 50mm cinema prime, authentic Cooke Look, gentle organic sharpness, creamy dimensional falloff';
      break;
    case '85mm':
      lensMod = 'Zeiss Supreme Prime 85mm f/1.4 portrait cinema prime, creamy background compression, razor sharp subject isolation';
      break;
    case '135mm_telephoto':
      lensMod = 'Leica Summilux-C 135mm telephoto prime, dramatic focal plane compression, distant background intimacy, razor thin depth slice';
      break;
    case 'macro_probe':
    case 'macro':
      lensMod = 'Laowa 24mm f/14 2x Macro Probe lens, microscopic tactile surface detail, ultra-close perspective with deep ambient background';
      break;
    case 'ultra_wide_18mm':
    case 'ultra_wide':
      lensMod = 'Zeiss Ultra Prime 18mm wide angle cinematography, grand perspective scale, deep sharp architectural focus';
      break;
    case 'super_wide_12mm':
      lensMod = 'Voigtlander 12mm ultra-wide rectilinear optics, sweeping panoramic immersion, dramatic vertical perspective';
      break;
    case 'fisheye_8mm':
      lensMod = '8mm circular fisheye lens, 180-degree hemispherical barrel distortion, dramatic curved horizon perspective';
      break;
    case 'tilt_shift_45mm':
      lensMod = 'Canon TS-E 45mm tilt-shift lens, selective miniature diorama focal plane, architectural perspective control';
      break;
    case 'vintage_16mm_bolex':
      lensMod = '16mm Switar vintage cinema prime, nostalgic 16mm optical halation, soft chromatic aberration, authentic analog film grain';
      break;
    case '70mm_imax':
      lensMod = 'IMAX 15-perf 70mm large format camera, Hasselblad optics, breathtaking spatial clarity, infinite textural resolution';
      break;
    case 'noctilux_f095':
      lensMod = 'Leica Noctilux-M 50mm f/0.95 lens, hyper-shallow ethereal depth of field, dreamlike liquid bokeh background';
      break;
    case 'petzval_swirl':
      lensMod = '19th-century Petzval 85mm brass lens, swirling vortex radial bokeh, razor sharp center sweet spot, vintage optical character';
      break;
    case 'cine_zoom_24_290':
      lensMod = 'Angenieux Optimo 24-290mm cine zoom lens, smooth optical vertigo compression, classic Hollywood cinema optics';
      break;
    case 'vintage_anamorphic_flare':
      lensMod = 'Lomo Roundfront Soviet anamorphic lens, warm golden organic streaks, expressive flare dynamics, vintage cinema patina';
      break;
    default:
      lensMod = '50mm standard cinema prime, natural human perspective, authentic color grading';
  }

  let lightMod = '';
  switch (intent.lighting) {
    case 'chiaroscuro':
      lightMod = 'dramatic chiaroscuro lighting, deep rich shadow falloff, triangular Rembrandt cheek highlight, moody key light';
      break;
    case 'golden_hour':
      lightMod = 'warm magic golden hour sun, low angle warm backlight, cinematic volumetric haze, soft amber atmospheric glow';
      break;
    case 'neon_noir':
      lightMod = 'cyberpunk neon noir lighting, cyan and magenta ambient reflections, wet asphalt specular rim highlights';
      break;
    case 'dramatic_rim':
      lightMod = 'strong theatrical edge lighting, sharp silhouette outline, atmospheric kicker light, moody backdrop separation';
      break;
    case 'high_key_commercial':
      lightMod = 'high-key commercial studio lighting, pure radiant clean daylight, soft wrap-around bounce, zero harsh shadows';
      break;
    case 'low_key_film_noir':
      lightMod = 'classic 1940s film noir lighting, Venetian blind shadow slits, harsh tungsten key light, smoke and cigarette haze';
      break;
    case 'moonlight_cyan':
      lightMod = 'cinematic cool moonlight, desaturated cyan ambient fill, midnight deep blue shadows, crisp silver edge highlights';
      break;
    case 'volumetric_godrays':
      lightMod = 'cathedral volumetric god rays, intense directional shafts of sunlight piercing misty dust motes, divine atmosphere';
      break;
    case 'warm_candlelight':
      lightMod = 'intimate 1800K flickering candlelight, soft amber inverse-square falloff, warm shadows, cozy fireplace glow';
      break;
    case 'bifrost_neon_synth':
      lightMod = 'synthwave bifrost dual-tone lighting, saturated electric violet key paired with burning neon crimson rim light';
      break;
    case 'overcast_softbox':
      lightMod = 'northern sky softbox lighting, overcast diffuse cloud illumination, natural skin tones, smooth micro-contrast';
      break;
    case 'ringlight_beauty':
      lightMod = 'editorial beauty ring light, circular ocular catchlights in eyes, flawless even facial illumination, beauty dish fill';
      break;
    case 'stage_spotlight':
      lightMod = 'theatrical overhead follow-spotlight, intense focused beam cutting through pure pitch black darkness, stark isolation';
      break;
    case 'underwater_caustics':
      lightMod = 'underwater caustic light refractions, undulating turquoise ripples dancing across subject, deep ocean light scattering';
      break;
    case 'fluorescent_grit':
      lightMod = 'industrial fluorescent tube lighting, cold green-tinted institutional glare, gritty urban realism, flickering tungsten';
      break;
    case 'sunset_silhouette':
      lightMod = 'blazing crimson-orange sunset horizon, total subject silhouette, stark black graphic profile against vibrant sky';
      break;
    default:
      lightMod = 'soft diffuse studio lighting, natural balanced shadows, beauty lighting setup';
  }

  let angleMod = '';
  switch (intent.cameraAngle) {
    case 'front_portrait':
      angleMod = 'frontal direct camera angle, 0-degree eye-level gaze, centered symmetrical framing';
      break;
    case 'three_quarter_left':
      angleMod = 'three-quarter view turned 45 degrees to the left, dynamic facial depth, locked character likeness';
      break;
    case 'three_quarter_right':
      angleMod = 'three-quarter view turned 45 degrees to the right, dynamic facial depth, locked character likeness';
      break;
    case 'profile_left':
      angleMod = 'sharp 90-degree side profile view looking left, crisp silhouette jawline, clean lateral perspective';
      break;
    case 'profile_right':
      angleMod = 'sharp 90-degree side profile view looking right, crisp silhouette jawline, clean lateral perspective';
      break;
    case 'low_angle_hero':
      angleMod = 'heroic low camera angle looking upward, powerful commanding stature, ground-level lens perspective';
      break;
    case 'high_angle_bird':
      angleMod = 'high camera angle looking downward at 45 degrees, vulnerable perspective, expansive floor plane';
      break;
    case 'overhead_god_view':
      angleMod = '90-degree top-down nadir overhead god view, flat perpendicular perspective, architectural geometric layout';
      break;
    case 'over_the_shoulder':
      angleMod = 'over-the-shoulder conversation shot, foreground shoulder framing, narrative depth of field';
      break;
    case 'dutch_angle':
      angleMod = 'dramatic 15-degree Dutch angle camera tilt, canted horizon line, psychological tension';
      break;
    case 'extreme_close_up':
      angleMod = 'extreme close-up macro framing, intimate focus on eyes and facial expression, razor thin depth';
      break;
    case 'full_body_turnaround':
      angleMod = 'multi-angle character model sheet turnaround, simultaneous front view, three-quarter view, profile view and rear view, consistent character design, neutral background';
      break;
    default:
      angleMod = '';
  }

  const promptElements = [intent.prompt];
  if (angleMod) promptElements.push(angleMod);
  if (lensMod) promptElements.push(lensMod);
  if (lightMod) promptElements.push(lightMod);
  promptElements.push('cinematic color grading, 8k resolution, raw photography, master film still');

  let fullPrompt = promptElements.join(', ');
  let activeLora: PlajahNativeTask['lora'];

  if (intent.loraId) {
    const enriched = plajahLoraRegistry.applyLoraToPrompt(fullPrompt, intent.loraId, intent.loraWeight);
    fullPrompt = enriched.prompt;
    const loraDef = plajahLoraRegistry.getLoraById(intent.loraId);
    if (loraDef) {
      activeLora = {
        id: loraDef.id,
        weight: enriched.activeWeight,
        triggerWords: loraDef.triggerWords,
      };
    }
  }

  const negPrompt = intent.negativePrompt || 'cgi, 3d render, blurry, distorted, plastic skin, oversaturated, amateur, watermark, bad anatomy';

  const targetModel = intent.modelId || (intent.loraId?.includes('flux') ? 'flux2_klein_4b' : 'sdxl_turbo');

  return {
    id: `plajah_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'cinema_still',
    modelId: targetModel,
    prompt: fullPrompt,
    negativePrompt: negPrompt,
    dimensions: { width, height },
    steps: intent.steps || (targetModel === 'flux2_klein_4b' ? 12 : targetModel === 'sdxl_lightning' ? 4 : 1),
    cfgScale: targetModel === 'flux2_klein_4b' ? 3.5 : 1.0,
    seed: intent.seed ?? Math.floor(Math.random() * 2147483647),
    lora: activeLora,
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
  const startKeyframe = intent.startKeyframeUrl || intent.keyframeImageUrl;
  const endKeyframe = intent.endKeyframeUrl;
  const mode = intent.mode || (endKeyframe ? 'first_and_last_frame' : 'single_keyframe');

  // Compute duration: snapped to dialogue duration (+0.6s breathing cradle) or user specified
  let duration = intent.durationSec || 3;
  let audioSnapped = false;
  if (intent.dialogueDurationSec) {
    duration = Math.min(8, Math.max(2, Math.round(intent.dialogueDurationSec + 0.6)));
    audioSnapped = true;
  }

  // Determine model: use First & Last Frame model (wan_video_fl) if interpolating between two keyframes
  const modelId = intent.modelId || (mode === 'first_and_last_frame' ? 'wan_video_fl' : 'wan_video_14b');

  // Dimensions based on resolution & aspect ratio
  const res = intent.resolution || '480p';
  let width = 832;
  let height = 480;

  if (res === '720p') {
    if (intent.aspect === '9:16') {
      width = 720; height = 1280;
    } else {
      width = 1280; height = 720;
    }
  } else {
    if (intent.aspect === '9:16') {
      width = 480; height = 832;
    } else {
      width = 832; height = 480;
    }
  }

  let motionTrajectory = '';
  switch (intent.cameraMovement) {
    case 'push_in': motionTrajectory = 'slow cinematic camera push-in dolly forward, dramatic focal immersion'; break;
    case 'crane_down':
    case 'pull_out': motionTrajectory = 'smooth camera pull-out crane shot descending, revealing wide environment'; break;
    case 'crane_up': motionTrajectory = 'smooth camera crane shot ascending, sweeping monumental perspective'; break;
    case 'pan_left': motionTrajectory = 'graceful horizontal camera pan left, sweeping cinematic view'; break;
    case 'pan_right': motionTrajectory = 'graceful horizontal camera pan right, cinematic movement'; break;
    case 'tilt_up': motionTrajectory = 'low angle camera tilt up, monumental scale'; break;
    case 'orbit':
    case 'orbit_360': motionTrajectory = 'subtle dynamic 360-degree rotational arc orbit around subject, parallax depth'; break;
    case 'whip_pan': motionTrajectory = 'dynamic whip pan kinetic camera movement, energy and speed'; break;
    case 'drone_aerial': motionTrajectory = 'smooth sweeping drone aerial shot, grand bird-eye vista'; break;
    default: motionTrajectory = 'gentle organic cinematic camera breathing, high production value';
  }

  let fullPrompt = intent.motionPrompt;
  if (mode === 'first_and_last_frame') {
    fullPrompt = `${fullPrompt}, first and last frame interpolation, seamless physical transition from start keyframe to end keyframe, continuous subject morphology, physics-based movement`;
  }
  fullPrompt = `${fullPrompt}, ${motionTrajectory}, 24 frames per second, filmic motion blur, smooth physical dynamics`;

  return {
    id: `plajah_motion_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'cinema_motion',
    modelId,
    prompt: fullPrompt,
    negativePrompt: 'jerky movement, camera stutter, morphing artifacts, distorted limbs, static freeze, watermark',
    dimensions: { width, height },
    steps: res === '720p' ? 35 : 28,
    cfgScale: 6.0,
    seed: intent.seed ?? Math.floor(Math.random() * 2147483647),
    sourceImage: startKeyframe,
    motion: {
      mode,
      cameraMovement: intent.cameraMovement || 'push_in',
      motionStrength: intent.motionStrength || 5,
      durationSec: duration,
      fps: intent.fps || 24,
      startKeyframeUrl: startKeyframe,
      endKeyframeUrl: endKeyframe,
      resolution: res,
      audioDurationSnapped: audioSnapped,
      dialogueDurationSec: intent.dialogueDurationSec,
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

  let prompt = `${intent.characterPrompt}, ${intent.sceneActionPrompt}, ${shotComp}, ${intent.moodLighting || 'bold ink lighting'}, graphic novel art style, crisp lineart, professional comic illustration, high detail`;
  let activeLora: PlajahNativeTask['lora'];

  if (intent.loraId) {
    const enriched = plajahLoraRegistry.applyLoraToPrompt(prompt, intent.loraId, intent.loraWeight);
    prompt = enriched.prompt;
    const loraDef = plajahLoraRegistry.getLoraById(intent.loraId);
    if (loraDef) {
      activeLora = {
        id: loraDef.id,
        weight: enriched.activeWeight,
        triggerWords: loraDef.triggerWords,
      };
    }
  }

  const loraDef = intent.loraId ? plajahLoraRegistry.getLoraById(intent.loraId) : undefined;
  const isFlux = intent.loraId?.includes('flux') || loraDef?.baseModel === 'FLUX.2-Klein-4B' || loraDef?.baseModel === 'FLUX.1-Schnell';
  const targetModel = intent.modelId || (isFlux ? 'flux2_klein_4b' : 'animagine_xl');

  return {
    id: `plajah_comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'comic_panel',
    modelId: targetModel,
    prompt,
    negativePrompt: 'photorealistic, messy sketch, blurry lines, flat colors, bad hands, mutated fingers',
    dimensions: { width, height },
    steps: isFlux ? 12 : 28,
    cfgScale: isFlux ? 3.5 : 7.5,
    seed: Math.floor(Math.random() * 2147483647),
    identity: {
      characterRef: intent.faceEmbeddingRef,
      likenessStrength: 0.85,
    },
    lora: activeLora,
  };
}
