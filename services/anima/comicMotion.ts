/**
 * services/anima/comicMotion.ts
 *
 * Plajah Unified Motion & Animation System ("Anima") - Comic & Manga Panel Animation Suite
 *
 * Provides:
 * 1. Preset panel entrance transitions (smash zoom, manga shutter wipe, page curl, elastic pop, ink bleed)
 * 2. Dynamic action phrases / SFX onomatopoeia (BAM!, POW!, SLASH!, WHAM!, DON!!, etc.) with 3D extrusion and line boil
 * 3. Animated speech/thought balloons with dynamic pointing tails and breathing float
 * 4. Action motion effects (radial/horizontal manga speed lines, halftone screentones, impact shockwaves, slash trails)
 * 5. 2.5D multi-plane panel parallax controls (pointer hover, device gyro, camera drift, webtoon scroll)
 */

import type { AnimaLayer, AnimaChannel, Keyframe } from './types';

export type PanelEntranceKind =
  | 'smash_zoom'
  | 'manga_shutter_wipe'
  | 'page_curl'
  | 'elastic_pop'
  | 'split_panel_slide'
  | 'ink_bleed_reveal';

export type OnomatopoeiaPhrase =
  | 'BAM!'
  | 'POW!'
  | 'SLASH!'
  | 'WHAM!'
  | 'BOOM!'
  | 'ZOOM!'
  | 'KABOOM!'
  | 'CRASH!'
  | 'DON!!'
  | 'GO GO GO...'
  | 'DOKI DOKI'
  | 'SWOOSH!';

export type BalloonKind =
  | 'speech'
  | 'shout'
  | 'thought'
  | 'whisper'
  | 'radio';

export type SpeedLineMode =
  | 'radial_focus'
  | 'horizontal_sprint'
  | 'vertical_fall';

export interface ParallaxPlaneConfig {
  id: string;
  name: string;
  depth: number; // 0.1 (distant sky) .. 1.0 (hero character) .. 2.0 (foreground)
  layerId: string;
  blurDepthOfField?: boolean;
}

export interface PanelParallaxConfig {
  enabled: boolean;
  driverMode: 'pointer_hover' | 'device_gyro' | 'camera_drift' | 'reading_scroll';
  intensityX: number; // max px offset
  intensityY: number;
  perspectiveZ: number;
  planes: ParallaxPlaneConfig[];
}

export interface ComicActionPhraseConfig {
  phrase: OnomatopoeiaPhrase;
  position: { x: number; y: number };
  scale?: number;
  rotation?: number;
  primaryColor?: string;
  outlineColor?: string;
  shadowColor?: string;
  lineBoil?: boolean;
  entranceTime?: number;
  durationSec?: number;
}

export interface ComicBalloonConfig {
  text: string;
  kind: BalloonKind;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  tailTarget?: { x: number; y: number }; // coords to point to (e.g. character mouth)
  entranceTime?: number;
  durationSec?: number;
  fontSize?: number;
  fontColor?: string;
  bgColor?: string;
}

// --------------------------------------------------------------------------
// 1. PANEL ENTRANCE TRANSITIONS
// --------------------------------------------------------------------------

/**
 * Applies a cinematic panel entrance transition to a layer's transform channels
 */
export function applyPanelEntranceTransition(
  layer: AnimaLayer,
  transition: PanelEntranceKind,
  startTimeSec = 0,
  durationSec = 0.5
): void {
  const t0 = startTimeSec;
  const t1 = t0 + durationSec;

  const mkKf = (id: string, t: number, v: number, ease: any = 'smooth'): Keyframe<number> => ({
    id,
    t: Number(t.toFixed(3)),
    v: Number(v.toFixed(3)),
    ease,
  });

  const mkCh = (path: string, defVal: number, kfs: Keyframe<number>[]): AnimaChannel<number> => ({
    id: `ch_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
    name: path,
    path,
    defaultValue: defVal,
    keyframes: kfs,
  });

  switch (transition) {
    case 'smash_zoom':
      // Flies in from 3.5x scale with sudden stop and camera impact shake
      layer.channels['transform.scaleX'] = mkCh('transform.scaleX', 1, [
        mkKf('sz_sx0', t0, 3.5, 'in'),
        mkKf('sz_sx1', t0 + durationSec * 0.7, 0.95, 'bounce'),
        mkKf('sz_sx2', t1, 1.0, 'smooth'),
      ]);
      layer.channels['transform.scaleY'] = mkCh('transform.scaleY', 1, [
        mkKf('sz_sy0', t0, 3.5, 'in'),
        mkKf('sz_sy1', t0 + durationSec * 0.7, 0.95, 'bounce'),
        mkKf('sz_sy2', t1, 1.0, 'smooth'),
      ]);
      layer.channels['opacity'] = mkCh('opacity', 1, [
        mkKf('sz_op0', t0, 0, 'linear'),
        mkKf('sz_op1', t0 + 0.05, 1, 'hold'),
      ]);
      layer.channels['transform.x'] = mkCh('transform.x', 0, [
        mkKf('sz_x0', t0, 0),
        mkKf('sz_x1', t0 + durationSec * 0.7, 18, 'bounce'),
        mkKf('sz_x2', t0 + durationSec * 0.8, -12, 'bounce'),
        mkKf('sz_x3', t0 + durationSec * 0.9, 6, 'smooth'),
        mkKf('sz_x4', t1, 0, 'smooth'),
      ]);
      break;

    case 'elastic_pop':
      // Classic cartoon punch bounce with squashing overshoot
      layer.channels['transform.scaleX'] = mkCh('transform.scaleX', 1, [
        mkKf('ep_sx0', t0, 0, 'elastic'),
        mkKf('ep_sx1', t0 + durationSec * 0.5, 1.25, 'elastic'),
        mkKf('ep_sx2', t0 + durationSec * 0.75, 0.9, 'smooth'),
        mkKf('ep_sx3', t1, 1.0, 'smooth'),
      ]);
      layer.channels['transform.scaleY'] = mkCh('transform.scaleY', 1, [
        mkKf('ep_sy0', t0, 0, 'elastic'),
        mkKf('ep_sy1', t0 + durationSec * 0.5, 0.8, 'elastic'),
        mkKf('ep_sy2', t0 + durationSec * 0.75, 1.1, 'smooth'),
        mkKf('ep_sy3', t1, 1.0, 'smooth'),
      ]);
      break;

    case 'manga_shutter_wipe':
      // Diagonal slicing reveal
      layer.channels['panel_wipe_progress'] = mkCh('panel_wipe_progress', 0, [
        mkKf('sw_p0', t0, 0, 'in'),
        mkKf('sw_p1', t1, 1.0, 'out'),
      ]);
      layer.channels['opacity'] = mkCh('opacity', 1, [
        mkKf('sw_op0', t0, 0.2),
        mkKf('sw_op1', t0 + 0.1, 1.0),
      ]);
      break;

    case 'page_curl':
      // Stylized corner turn unfolding
      layer.channels['curl_angle'] = mkCh('curl_angle', 0, [
        mkKf('pc_a0', t0, 60, 'smooth'),
        mkKf('pc_a1', t1, 0, 'smooth'),
      ]);
      layer.channels['curl_radius'] = mkCh('curl_radius', 0, [
        mkKf('pc_r0', t0, 200, 'smooth'),
        mkKf('pc_r1', t1, 0, 'smooth'),
      ]);
      break;

    case 'split_panel_slide':
      // Two halves slide into place from opposite edges
      layer.channels['transform.x'] = mkCh('transform.x', 0, [
        mkKf('sps_x0', t0, -400, 'out'),
        mkKf('sps_x1', t1, 0, 'bounce'),
      ]);
      layer.channels['opacity'] = mkCh('opacity', 1, [
        mkKf('sps_o0', t0, 0),
        mkKf('sps_o1', t0 + 0.1, 1.0),
      ]);
      break;

    case 'ink_bleed_reveal':
      // Sumi ink splatter bloom
      layer.channels['ink_radius'] = mkCh('ink_radius', 0, [
        mkKf('ib_r0', t0, 0, 'smooth'),
        mkKf('ib_r1', t1, 100, 'smooth'),
      ]);
      break;
  }
}

// --------------------------------------------------------------------------
// 2. DYNAMIC ACTION PHRASES & ONOMATOPOEIA (SFX)
// --------------------------------------------------------------------------

/**
 * Creates an animated Action SFX layer with explosive entrance, line boil, and 3D extrusion
 */
export function createOnomatopoeiaLayer(
  config: ComicActionPhraseConfig,
  id = `sfx_${Date.now()}`
): AnimaLayer {
  const t0 = config.entranceTime ?? 0;
  const dur = config.durationSec ?? 1.5;
  const t1 = t0 + dur;

  const mkKf = (kid: string, t: number, v: number, ease: any = 'smooth'): Keyframe<number> => ({
    id: kid,
    t: Number(t.toFixed(3)),
    v: Number(v.toFixed(3)),
    ease,
  });

  const mkCh = (path: string, defVal: number, kfs: Keyframe<number>[]): AnimaChannel<number> => ({
    id: `ch_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
    name: path,
    path,
    defaultValue: defVal,
    keyframes: kfs,
  });

  const channels: Record<string, AnimaChannel<number>> = {
    // Explosive pop entry
    'transform.scaleX': mkCh('transform.scaleX', 1, [
      mkKf('sfx_sx0', t0, 0, 'elastic'),
      mkKf('sfx_sx1', t0 + 0.12, (config.scale ?? 1) * 1.45, 'bounce'),
      mkKf('sfx_sx2', t0 + 0.25, (config.scale ?? 1) * 0.95, 'smooth'),
      mkKf('sfx_sx3', t0 + 0.4, config.scale ?? 1, 'smooth'),
      mkKf('sfx_sx4', t1 - 0.2, config.scale ?? 1, 'smooth'),
      mkKf('sfx_sx5', t1, 0, 'in'), // disappear
    ]),
    'transform.scaleY': mkCh('transform.scaleY', 1, [
      mkKf('sfx_sy0', t0, 0, 'elastic'),
      mkKf('sfx_sy1', t0 + 0.12, (config.scale ?? 1) * 1.45, 'bounce'),
      mkKf('sfx_sy2', t0 + 0.25, (config.scale ?? 1) * 0.95, 'smooth'),
      mkKf('sfx_sy3', t0 + 0.4, config.scale ?? 1, 'smooth'),
      mkKf('sfx_sy4', t1 - 0.2, config.scale ?? 1, 'smooth'),
      mkKf('sfx_sy5', t1, 0, 'in'),
    ]),
    'transform.rotationZ': mkCh('transform.rotationZ', config.rotation ?? -8, [
      mkKf('sfx_r0', t0, (config.rotation ?? -8) - 15),
      mkKf('sfx_r1', t0 + 0.15, (config.rotation ?? -8) + 8),
      mkKf('sfx_r2', t0 + 0.35, config.rotation ?? -8),
    ]),
    'opacity': mkCh('opacity', 1, [
      mkKf('sfx_op0', t0, 0),
      mkKf('sfx_op1', t0 + 0.05, 1),
      mkKf('sfx_op2', t1 - 0.15, 1),
      mkKf('sfx_op3', t1, 0),
    ]),
    // 3D Extrusion Depth
    'extrusion_depth': mkCh('extrusion_depth', 16, [
      mkKf('sfx_ex0', t0, 0),
      mkKf('sfx_ex1', t0 + 0.15, 24, 'bounce'),
      mkKf('sfx_ex2', t0 + 0.35, 16, 'smooth'),
    ]),
  };

  // Attach expression for continuous authentic hand-drawn line boil vibration if enabled
  if (config.lineBoil !== false) {
    channels['line_boil_seed'] = {
      id: 'ch_line_boil_seed',
      name: 'Line Boil Seed',
      path: 'line_boil_seed',
      defaultValue: 0,
      keyframes: [],
      expression: {
        enabled: true,
        code: 'Math.floor(time * 12) % 3', // 3-frame cycling line boil on 2s
      },
    };
  }

  return {
    id,
    name: `SFX: ${config.phrase}`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: {
      x: config.position.x,
      y: config.position.y,
      z: 10,
      rotationX: 0,
      rotationY: 0,
      rotationZ: config.rotation ?? -8,
      scaleX: config.scale ?? 1,
      scaleY: config.scale ?? 1,
      scaleZ: 1,
    },
    channels,
  };
}

// --------------------------------------------------------------------------
// 3. ANIMATED SPEECH & THOUGHT BALLOONS
// --------------------------------------------------------------------------

/**
 * Creates an animated speech or thought balloon layer with pointing tail
 */
export function createComicBalloonLayer(
  config: ComicBalloonConfig,
  id = `balloon_${Date.now()}`
): AnimaLayer {
  const t0 = config.entranceTime ?? 0;
  const dur = config.durationSec ?? 3.0;
  const t1 = t0 + dur;

  const mkKf = (kid: string, t: number, v: number, ease: any = 'smooth'): Keyframe<number> => ({
    id: kid,
    t: Number(t.toFixed(3)),
    v: Number(v.toFixed(3)),
    ease,
  });

  const mkCh = (path: string, defVal: number, kfs: Keyframe<number>[]): AnimaChannel<number> => ({
    id: `ch_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
    name: path,
    path,
    defaultValue: defVal,
    keyframes: kfs,
  });

  const channels: Record<string, AnimaChannel<number>> = {
    // Pop entrance with subtle breathing float
    'transform.scaleX': mkCh('transform.scaleX', 1, [
      mkKf('bal_sx0', t0, 0, 'elastic'),
      mkKf('bal_sx1', t0 + 0.2, 1.12, 'bounce'),
      mkKf('bal_sx2', t0 + 0.35, 1.0, 'smooth'),
      mkKf('bal_sx3', t1 - 0.15, 1.0),
      mkKf('bal_sx4', t1, 0, 'in'),
    ]),
    'transform.scaleY': mkCh('transform.scaleY', 1, [
      mkKf('bal_sy0', t0, 0, 'elastic'),
      mkKf('bal_sy1', t0 + 0.2, 1.12, 'bounce'),
      mkKf('bal_sy2', t0 + 0.35, 1.0, 'smooth'),
      mkKf('bal_sy3', t1 - 0.15, 1.0),
      mkKf('bal_sy4', t1, 0, 'in'),
    ]),
    'opacity': mkCh('opacity', 1, [
      mkKf('bal_op0', t0, 0),
      mkKf('bal_op1', t0 + 0.08, 1.0),
      mkKf('bal_op2', t1 - 0.1, 1.0),
      mkKf('bal_op3', t1, 0),
    ]),
    // Gentle floating breathing expression
    'transform.y': {
      id: 'ch_balloon_float_y',
      name: 'transform.y',
      path: 'transform.y',
      defaultValue: config.position.y,
      keyframes: [],
      expression: {
        enabled: true,
        code: `wiggle(1.2, 4)`,
      },
    },
  };

  // If dynamic tail target is specified, store tail coordinate channels
  if (config.tailTarget) {
    channels['tail.targetX'] = mkCh('tail.targetX', config.tailTarget.x, []);
    channels['tail.targetY'] = mkCh('tail.targetY', config.tailTarget.y, []);
  }

  return {
    id,
    name: `Balloon: ${config.kind} ("${config.text.slice(0, 16)}...")`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: {
      x: config.position.x,
      y: config.position.y,
      z: 8,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    },
    channels,
  };
}

// --------------------------------------------------------------------------
// 4. ACTION MOTION EFFECTS (Speed lines, Halftones, Shockwaves)
// --------------------------------------------------------------------------

/**
 * Creates Manga Action Speed Lines Layer
 */
export function createSpeedLinesLayer(
  mode: SpeedLineMode = 'radial_focus',
  origin = { x: 400, y: 300 },
  id = `speedlines_${Date.now()}`
): AnimaLayer {
  const channels: Record<string, AnimaChannel<number>> = {
    'line_density': {
      id: 'ch_line_density',
      name: 'Line Density',
      path: 'line_density',
      defaultValue: 60,
      keyframes: [],
    },
    'flicker_phase': {
      id: 'ch_flicker_phase',
      name: 'Flicker Phase',
      path: 'flicker_phase',
      defaultValue: 0,
      keyframes: [],
      expression: {
        enabled: true,
        code: 'Math.floor(time * 24) % 4', // strobe on 1s
      },
    },
    'opacity': {
      id: 'ch_speedline_opacity',
      name: 'opacity',
      path: 'opacity',
      defaultValue: 0.85,
      keyframes: [
        { id: 'k1', t: 0, v: 0.85 },
        { id: 'k2', t: 0.5, v: 1.0 },
        { id: 'k3', t: 1.0, v: 0.85 },
      ],
    },
  };

  return {
    id,
    name: `Speed Lines (${mode})`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 0.85,
    parentId: null,
    transform: {
      x: origin.x,
      y: origin.y,
      z: 5,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    },
    channels,
  };
}

/**
 * Creates Impact Shockwave Ring Layer
 */
export function createShockwaveLayer(
  position = { x: 400, y: 300 },
  durationSec = 0.6,
  id = `shockwave_${Date.now()}`
): AnimaLayer {
  const d = durationSec;
  const channels: Record<string, AnimaChannel<number>> = {
    'shockwave_radius': {
      id: 'ch_shockwave_radius',
      name: 'Shockwave Radius',
      path: 'shockwave_radius',
      defaultValue: 0,
      keyframes: [
        { id: 'sw_r0', t: 0, v: 10, ease: 'smooth' },
        { id: 'sw_r1', t: d, v: 350, ease: 'out' },
      ],
    },
    'shockwave_width': {
      id: 'ch_shockwave_width',
      name: 'Shockwave Width',
      path: 'shockwave_width',
      defaultValue: 25,
      keyframes: [
        { id: 'sw_w0', t: 0, v: 35, ease: 'smooth' },
        { id: 'sw_w1', t: d, v: 2, ease: 'smooth' },
      ],
    },
    'opacity': {
      id: 'ch_shockwave_opacity',
      name: 'opacity',
      path: 'opacity',
      defaultValue: 1,
      keyframes: [
        { id: 'sw_o0', t: 0, v: 1.0 },
        { id: 'sw_o1', t: d * 0.8, v: 0.9 },
        { id: 'sw_o2', t: d, v: 0.0, ease: 'smooth' },
      ],
    },
  };

  return {
    id,
    name: 'Impact Shockwave Ring',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: {
      x: position.x,
      y: position.y,
      z: 6,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    },
    channels,
  };
}

// --------------------------------------------------------------------------
// 5. 2.5D MULTI-PLANE PANEL PARALLAX ENGINE
// --------------------------------------------------------------------------

export class PanelParallaxEngine {
  private config: PanelParallaxConfig;
  private pointer: { x: number; y: number } = { x: 0, y: 0 };
  private gyro: { pitch: number; roll: number } = { pitch: 0, roll: 0 };
  private scrollProgress = 0; // 0..1

  constructor(config?: Partial<PanelParallaxConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      driverMode: config?.driverMode ?? 'pointer_hover',
      intensityX: config?.intensityX ?? 30,
      intensityY: config?.intensityY ?? 20,
      perspectiveZ: config?.perspectiveZ ?? 800,
      planes: config?.planes ?? [
        { id: 'p_bg_deep', name: 'Deep Sky', depth: 0.15, layerId: 'layer_sky' },
        { id: 'p_bg_scenery', name: 'Scenery', depth: 0.45, layerId: 'layer_bg' },
        { id: 'p_mid_hero', name: 'Hero Character', depth: 1.0, layerId: 'layer_hero' },
        { id: 'p_fg_props', name: 'Foreground Debris', depth: 1.75, layerId: 'layer_fg', blurDepthOfField: true },
      ],
    };
  }

  public updatePointer(normX: number, normY: number): void {
    // normX, normY in [-1, +1]
    this.pointer.x = Math.max(-1, Math.min(1, normX));
    this.pointer.y = Math.max(-1, Math.min(1, normY));
  }

  public updateGyro(pitchDeg: number, rollDeg: number): void {
    this.gyro.pitch = Math.max(-30, Math.min(30, pitchDeg));
    this.gyro.roll = Math.max(-30, Math.min(30, rollDeg));
  }

  public updateScroll(progress: number): void {
    this.scrollProgress = Math.max(0, Math.min(1, progress));
  }

  /**
   * Calculates 2.5D plane offset transforms for current frame
   */
  public computePlaneOffsets(timeSec = 0): Record<string, { x: number; y: number; blurPx: number; scale: number }> {
    if (!this.config.enabled) {
      const zeros: Record<string, any> = {};
      for (const p of this.config.planes) {
        zeros[p.layerId] = { x: 0, y: 0, blurPx: 0, scale: 1.0 };
      }
      return zeros;
    }

    let inputX = 0;
    let inputY = 0;

    switch (this.config.driverMode) {
      case 'pointer_hover':
        inputX = this.pointer.x;
        inputY = this.pointer.y;
        break;
      case 'device_gyro':
        inputX = this.gyro.roll / 30;
        inputY = this.gyro.pitch / 30;
        break;
      case 'camera_drift':
        inputX = Math.sin(timeSec * 0.8) * 0.7;
        inputY = Math.cos(timeSec * 0.5) * 0.5;
        break;
      case 'reading_scroll':
        inputX = (this.scrollProgress - 0.5) * 1.5;
        inputY = (this.scrollProgress - 0.5) * 2.0;
        break;
    }

    const result: Record<string, { x: number; y: number; blurPx: number; scale: number }> = {};

    for (const plane of this.config.planes) {
      // Parallax formula: (depth - 1.0) * intensity * input
      // Focal depth is 1.0 (midground hero does not shift horizontally relative to frame)
      const depthFactor = plane.depth - 1.0;
      const offsetX = inputX * this.config.intensityX * depthFactor;
      const offsetY = inputY * this.config.intensityY * depthFactor;

      // Depth of Field calculation: plane distance from focal plane (1.0)
      const distFromFocal = Math.abs(plane.depth - 1.0);
      const blurPx = plane.blurDepthOfField ? Math.max(0, distFromFocal * 3.5) : 0;
      const scale = 1.0 + (plane.depth - 1.0) * 0.05;

      result[plane.layerId] = {
        x: Number(offsetX.toFixed(2)),
        y: Number(offsetY.toFixed(2)),
        blurPx: Number(blurPx.toFixed(1)),
        scale: Number(scale.toFixed(3)),
      };
    }

    return result;
  }
}
