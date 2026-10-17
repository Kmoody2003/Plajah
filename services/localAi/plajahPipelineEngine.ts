// plajahPipelineEngine.ts — Plajah Native Generative Pipeline Engine.
// Directorial intent compiler that translates creative cinematic parameters
// into Plajah's on-device native diffusion and generative tensor runtime.
//
// 100% Native Plajah Architecture:
// - Runs directly inside Plajah's Windows WinUI 3 shell (DirectML / TensorRT) and browser WebGPU.
// - Zero external vendor dependencies: does NOT require ComfyUI, Forge, or external web servers.

import { plajahLoraRegistry } from './plajahLoraRegistry';
import { LENS_MODIFIERS, LIGHTING_MODIFIERS, CAMERA_ANGLE_MODIFIERS } from './promptEnhancer';

export type DirectorialLens =
  | 'none'
  | 'anamorphic'
  | 'panavision_primo_anamorphic'
  | 'atlas_orion_anamorphic'
  | 'cooke_anamorphic_sf'
  | 'hawk_v_lite_anamorphic'
  | 'arricam_master_anamorphic'
  | 'vintage_anamorphic_flare'
  | 'kowa_prominar_anamorphic'
  | '35mm'
  | '50mm'
  | 'cooke_panchro_classic'
  | '85mm'
  | 'arri_signature_prime_47'
  | 'leica_summilux_c_40'
  | '135mm_telephoto'
  | 'zeiss_super_speed_mk3'
  | 'angenieux_optimo_zoom'
  | 'cine_zoom_24_290'
  | 'canon_k35_vintage'
  | 'super_baltar_vintage'
  | 'helios_44_2_swirl'
  | 'petzval_swirl'
  | 'kubrick_zeiss_planar_f07'
  | 'vintage_16mm_bolex'
  | 'super_8_kodak_ektar'
  | '70mm_imax'
  | 'panavision_system_65'
  | 'hasselblad_xcd_80_f19'
  | 'mamiya_sekor_80_f19'
  | 'pentax_67_takumar_105'
  | 'large_format_8x10_schneider'
  | 'noctilux_f095'
  | 'leica_summilux_35_fle'
  | 'leica_apo_summicron_75'
  | 'canon_rf_85_f12_ds'
  | 'nikon_noct_58_f095'
  | 'sony_gm_135_f18'
  | 'zeiss_otus_55_f14'
  | 'canon_fd_55_f12_ssc'
  | '24mm_cinema_wide'
  | 'ultra_wide_18mm'
  | 'ultra_wide'
  | 'arri_ultra_prime_8r'
  | 'super_wide_12mm'
  | 'laowa_12mm_zero_d'
  | 'fisheye_8mm'
  | 'fisheye_16mm_fullframe'
  | '200mm_f2_telephoto'
  | '300mm_super_telephoto'
  | 'macro_probe'
  | 'macro'
  | 'tilt_shift_45mm'
  | 'lensbaby_composer_sweet'
  | 'split_diopter_70s'
  | 'pinhole_obscura'
  | string;

export type DirectorialLighting =
  | 'none'
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
  | 'butterfly_paramount'
  | 'split_half_shadow'
  | 'loop_portrait_key'
  | 'clamshell_glamour'
  | 'sodium_vapor_street'
  | 'campfire_ember_glow'
  | 'dappled_forest_canopy'
  | 'practical_tungsten_room'
  | string;

export type DirectorialCameraAngle =
  | 'none'
  | 'extreme_wide_shot'
  | 'wide_establishing_shot'
  | 'full_body_shot'
  | 'medium_wide_knees'
  | 'cowboy_american_shot'
  | 'medium_waist_shot'
  | 'medium_close_up'
  | 'close_up_portrait'
  | 'choker_close_up'
  | 'extreme_close_up'
  | 'insert_detail_shot'
  | 'eye_level'
  | 'low_angle_hero'
  | 'extreme_worm_eye'
  | 'subtle_low_authority'
  | 'subtle_high_empathy'
  | 'high_angle_bird'
  | 'overhead_god_view'
  | 'aerial_drone_vista'
  | 'front_portrait'
  | 'three_quarter_left'
  | 'three_quarter_right'
  | 'profile_left'
  | 'profile_right'
  | 'over_shoulder_look_back'
  | 'dorsal_from_behind'
  | 'over_the_shoulder'
  | 'dirty_single_frame'
  | 'clean_single_isolated'
  | 'two_shot_conversational'
  | 'dutch_angle'
  | 'rule_of_thirds_offcenter'
  | 'wes_anderson_symmetry'
  | 'leading_lines_depth'
  | 'frame_within_frame'
  | 'reflection_mirror_shot'
  | 'silhouette_contre_jour'
  | 'first_person_pov'
  | 'low_tracking_stride'
  | 'editorial_vogue_fashion'
  | 'candid_street_moment'
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
  referenceImages?: string[]; // Up to 10 reference images for FLUX.3 [klein]
  resolutionTier?: '1k' | '2k' | '4k';
}

export interface DetailEnhanceIntent {
  sourceImageUrl: string;
  prompt?: string;
  hallucinationLevel: number; // 0 to 100 or 0.0 to 1.0 (Detail injection / creativity)
  resemblance: number;       // 0 to 100 or 0.0 to 1.0 (Fidelity to input source)
  engine: 'none' | 'skin_pores' | 'fabric_weave' | 'architectural_sharp' | 'film_grain_organic' | 'cinematic' | 'photoreal' | 'comic_ink' | 'storybook' | '3d_render' | string;
  scaleFactor?: 2 | 4;
  hdrStrength?: number;
}

export interface RelightIntent {
  sourceImageUrl: string;
  lightAzimuth?: number;    // -180 to 180 degrees (horizontal compass around subject)
  lightElevation?: number;  // -90 to 90 degrees (vertical elevation angle)
  lightX?: number;          // -1.0 to 1.0 normalized horizontal key light vector
  lightY?: number;          // -1.0 to 1.0 normalized vertical key light vector
  lightZ?: number;          // 0.05 to 1.0 normalized depth key light vector
  lightColorHex?: string;   // e.g. '#ffaa55' for warm golden hour key
  ambientColorHex?: string; // e.g. '#182238' for deep cinema shadow fill
  rimColorHex?: string;     // e.g. '#55ccff' for opposing kicker/rim light
  intensity: number;        // 0.2 to 2.5
  softness?: number;        // 0.05 to 1.0 (Half-Lambert light wrap & diffuser size)
  shadowDensity?: number;   // 0.0 to 0.98 (depth of shadow side attenuation)
  rimStrength?: number;     // 0.0 to 2.0 (grazing Fresnel silhouette rim intensity)
  specularSheen?: number;   // 0.0 to 1.5 (Blinn-Phong eye/skin/surface specular highlights)
  subsurfaceScatter?: number; // 0.0 to 1.0 (warm dermal scatter along terminator band)
  neuralLightWrap?: number; // 0.0 to 0.65 (optional low-denoise latent ray-bounce pass)
  envPreset?: string;       // 'none' | 'rembrandt_key' | 'cyberpunk_dual_neon' | 'golden_hour_backlight' | 'moonlit_noir_venetian' | 'window_dappled_foliage' | 'butterfly_paramount' | 'campfire_flicker' | 'bioluminescent_abyss'
  ambientPrompt?: string;   // e.g. "rainy neon city alleyway"
}

export interface CinemaMotionIntent {
  motionPrompt: string;
  mode?: 'single_keyframe' | 'first_and_last_frame' | 'text_to_video';
  startKeyframeUrl?: string; // First Frame (Frame 0)
  endKeyframeUrl?: string;   // Last Frame (Frame N)
  keyframeImageUrl?: string; // backwards-compatible alias for startKeyframeUrl
  modelId?: 'wan_video_14b' | 'wan_video_fl' | 'wan_2_2' | 'ltx_video' | 'svd_video';
  cameraMovement?: 'none' | 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'orbit' | 'orbit_360' | 'crane_down' | 'crane_up' | 'whip_pan' | 'drone_aerial' | 'static';
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
  referenceImages?: string[]; // Up to 10 reference images (FLUX.3 [klein])
  sceneActionPrompt: string;
  cameraShot: 'establishing' | 'full_shot' | 'medium' | 'over_the_shoulder' | 'close_up' | 'extreme_close_up' | 'low_angle_hero';
  moodLighting?: string;
  aspect?: '1:1' | '16:9' | '4:5' | '2:3';
  modelId?: string;
  loraId?: string;
  loraWeight?: number;
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
  referenceImages?: string[];
  resolutionTier?: '1k' | '2k' | '4k';
  /** Preferred image output format from model inference (defaults to 'jxl'). */
  outputFormat?: 'jxl' | 'webp' | 'png';
  enhancement?: {
    hallucinationLevel: number;
    resemblance: number;
    engine: string;
    scaleFactor: number;
  };
  relighting?: {
    azimuth: number;
    elevation: number;
    lightX: number;
    lightY: number;
    lightZ: number;
    colorHex: string;
    ambientColorHex: string;
    rimColorHex: string;
    intensity: number;
    softness: number;
    shadowDensity: number;
    rimStrength: number;
    specularSheen: number;
    subsurfaceScatter: number;
    neuralLightWrap: number;
    envPreset: string;
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
 * Respects 'none' selections across lens, lighting, and cameraAngle and avoids duplicate clauses.
 */
export function compileCinemaStillTask(intent: CinemaStillIntent): PlajahNativeTask {
  const { width, height } = aspectToDimensions(intent.aspect || '16:9');

  const lensKey = intent.lens ?? 'none';
  const lightKey = intent.lighting ?? 'none';
  const angleKey = intent.cameraAngle ?? 'none';

  const lensMod = lensKey !== 'none' ? (LENS_MODIFIERS[lensKey] ?? '') : '';
  const lightMod = lightKey !== 'none' ? (LIGHTING_MODIFIERS[lightKey] ?? '') : '';
  const angleMod = angleKey !== 'none' ? (CAMERA_ANGLE_MODIFIERS[angleKey] ?? '') : '';

  const basePrompt = (intent.prompt || '').trim();
  const lowerBase = basePrompt.toLowerCase();
  const promptElements: string[] = [basePrompt];

  // Avoid double-appending if promptEnhancer already injected the modifier
  if (angleMod && !lowerBase.includes(angleMod.slice(0, 20).toLowerCase())) {
    promptElements.push(angleMod);
  }
  if (lensMod && !lowerBase.includes(lensMod.slice(0, 20).toLowerCase())) {
    promptElements.push(lensMod);
  }
  if (lightMod && !lowerBase.includes(lightMod.slice(0, 20).toLowerCase())) {
    promptElements.push(lightMod);
  }
  if (!lowerBase.includes('natural skin') && !lowerBase.includes('coherent')) {
    promptElements.push('single coherent subject, natural human anatomy, realistic skin micro-texture, focused expressive eyes, master cinema still');
  }

  let fullPrompt = promptElements.filter(Boolean).join(', ');
  let activeLora: PlajahNativeTask['lora'];

  if (intent.loraId && intent.loraId !== 'none') {
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

  const negPrompt =
    intent.negativePrompt ||
    'multiple heads, two heads, extra heads, duplicate person, cloned body, twin bodies, split frame, conjoined body, extra limbs, mutated hands, extra fingers, fused fingers, bad anatomy, deformed body, asymmetrical eyes, melted face, plastic skin, doll skin, blurry, watermark, text';

  const targetModel = intent.modelId || (intent.loraId?.includes('flux') ? 'flux3_klein' : 'flux3_klein');

  return {
    id: `plajah_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'cinema_still',
    modelId: targetModel,
    prompt: fullPrompt,
    negativePrompt: negPrompt,
    dimensions: { width, height },
    steps: intent.steps || (targetModel === 'flux3_klein' ? 4 : targetModel === 'flux2_klein_4b' ? 8 : targetModel === 'sdxl_lightning' ? 4 : 4),
    cfgScale: targetModel === 'flux3_klein' ? 1.18 : targetModel === 'flux2_klein_4b' ? 3.5 : 1.18,
    seed: intent.seed ?? Math.floor(Math.random() * 2147483647),
    referenceImages: intent.referenceImages?.slice(0, 10),
    resolutionTier: intent.resolutionTier,
    lora: activeLora,
  };
}

/**
 * Compiles Detail Enhancer parameters into a Plajah Native execution task.
 */
export function compileDetailEnhanceTask(intent: DetailEnhanceIntent): PlajahNativeTask {
  const scale = intent.scaleFactor || 2;
  const rawHallucination = intent.hallucinationLevel <= 1.0 ? intent.hallucinationLevel : intent.hallucinationLevel / 100;
  const rawResemblance = intent.resemblance <= 1.0 ? intent.resemblance : intent.resemblance / 100;
  const hallucinationRatio = Math.max(0, Math.min(1, rawHallucination));
  const fidelityRatio = Math.max(0, Math.min(1, rawResemblance));

  const denoiseSteps = Math.round(3 + hallucinationRatio * 3);
  const cfg = 1.12 + hallucinationRatio * 0.35;

  return {
    id: `plajah_enhance_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'detail_enhancer',
    modelId: 'flux3_klein',
    prompt: intent.prompt || 'ultra high definition, natural human skin pores, crisp iris catchlights, tactile fabric weave, 8k raw optical detail',
    negativePrompt: 'multiple heads, duplicate person, blurry, pixelated, jpeg compression artifacts, flat plastic texture, over-smoothed',
    dimensions: { width: 1024, height: 1024 },
    steps: denoiseSteps,
    cfgScale: cfg,
    seed: Math.floor(Math.random() * 2147483647),
    sourceImage: intent.sourceImageUrl,
    enhancement: {
      hallucinationLevel: hallucinationRatio,
      resemblance: fidelityRatio,
      engine: intent.engine || 'none',
      scaleFactor: scale,
    },
  };
}

/**
 * Compiles 3D Relighting parameters into a Plajah Native execution task.
 */
export function compileRelightTask(intent: RelightIntent): PlajahNativeTask {
  const hex = intent.lightColorHex || '#ffaa55';
  const ambHex = intent.ambientColorHex || '#182238';
  const rimHex = intent.rimColorHex || '#55ccff';
  const ambient = intent.ambientPrompt || 'dramatic directional cinema relighting, natural subsurface skin scatter, realistic specular catchlights';

  // Convert azimuth/elevation or direct lightX/Y/Z into consistent both representations
  const lx = intent.lightX !== undefined
    ? intent.lightX
    : Math.sin(((intent.lightAzimuth || 35) * Math.PI) / 180);
  const ly = intent.lightY !== undefined
    ? intent.lightY
    : -Math.sin(((intent.lightElevation || 25) * Math.PI) / 180);
  const lz = intent.lightZ !== undefined
    ? intent.lightZ
    : Math.max(0.15, Math.sqrt(Math.max(0.02, 1 - lx * lx - ly * ly)));

  const azimuth = intent.lightAzimuth !== undefined ? intent.lightAzimuth : Math.round(lx * 90);
  const elevation = intent.lightElevation !== undefined ? intent.lightElevation : Math.round(-ly * 90);

  return {
    id: `plajah_relight_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: '3d_relight',
    modelId: 'flux3_klein',
    prompt: `subject illuminated by directional cinema key light, ${ambient}, photorealistic light wrap, accurate normal-mapped shadow casting, natural skin subsurface scattering, crisp ocular catchlights`,
    negativePrompt: 'harsh flat flash, blown highlights, unnatural contours, bad anatomy, multiple heads',
    dimensions: { width: 1024, height: 1024 },
    steps: 3,
    cfgScale: 1.12,
    seed: Math.floor(Math.random() * 2147483647),
    sourceImage: intent.sourceImageUrl,
    relighting: {
      azimuth,
      elevation,
      lightX: lx,
      lightY: ly,
      lightZ: lz,
      colorHex: hex,
      ambientColorHex: ambHex,
      rimColorHex: rimHex,
      intensity: intent.intensity ?? 1.25,
      softness: intent.softness ?? 0.55,
      shadowDensity: intent.shadowDensity ?? 0.68,
      rimStrength: intent.rimStrength ?? 0.48,
      specularSheen: intent.specularSheen ?? 0.42,
      subsurfaceScatter: intent.subsurfaceScatter ?? 0.40,
      neuralLightWrap: intent.neuralLightWrap ?? 0.20,
      envPreset: intent.envPreset ?? 'none',
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
    case 'none': motionTrajectory = ''; break;
    case 'static': motionTrajectory = 'locked-off tripod static camera, subtle natural subject movement'; break;
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
  fullPrompt = [fullPrompt, motionTrajectory, '24 frames per second, filmic motion blur, smooth physical dynamics'].filter(Boolean).join(', ');

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
  const isFlux = intent.loraId?.includes('flux') || loraDef?.baseModel === 'FLUX.2-Klein-4B' || loraDef?.baseModel === 'FLUX.1-Schnell' || intent.modelId === 'flux3_klein' || intent.modelId === 'flux2_klein_4b';
  const targetModel = intent.modelId || (isFlux ? 'flux3_klein' : 'animagine_xl');

  return {
    id: `plajah_comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    taskType: 'comic_panel',
    modelId: targetModel,
    prompt,
    negativePrompt: 'photorealistic, messy sketch, blurry lines, flat colors, bad hands, mutated fingers',
    dimensions: { width, height },
    steps: targetModel === 'flux3_klein' ? 4 : isFlux ? 8 : 28,
    cfgScale: targetModel === 'flux3_klein' ? 1.0 : isFlux ? 3.5 : 7.5,
    seed: Math.floor(Math.random() * 2147483647),
    referenceImages: intent.referenceImages?.slice(0, 10) || (intent.faceEmbeddingRef ? [intent.faceEmbeddingRef] : undefined),
    identity: {
      characterRef: intent.faceEmbeddingRef,
      likenessStrength: 0.85,
    },
    lora: activeLora,
  };
}
