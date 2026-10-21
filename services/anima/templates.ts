/**
 * services/anima/templates.ts — new Anima projects. Every project starts empty unless the
 * author picks a template; nothing ships pre-filled with stock media.
 */

import type { AnimaChannel, AnimaEffect, AnimaLayer, AnimaPlate, AnimaProject, AnimaRigId } from './types';
import { SmartMotionPresets } from './worldClassEngine';
import { frameToTime } from './evaluator';

export const ANIMA_SCHEMA = 'plajah.animaProject' as const;
export const ANIMA_W = 1280;
export const ANIMA_H = 720;

export const newAnimaId = (prefix = 'anima') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const IDENTITY = { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

export function makeLayer(type: AnimaLayer['type'], name: string, extra: Partial<AnimaLayer> = {}): AnimaLayer {
  const id = newAnimaId('layer');
  return {
    id,
    name,
    type,
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { ...IDENTITY },
    channels: {},
    origin: { x: ANIMA_W / 2, y: ANIMA_H / 2 },
    ...(type === 'cel' ? { celTrack: { id: `cel_${id}`, name: 'Exposures', layerId: id, stepRate: 2 as const, exposures: [] } } : {}),
    ...extra,
  };
}

export const RIG_CHOICES: { id: AnimaRigId; name: string }[] = [
  { id: 'rello', name: 'Reello (Lumi) · Film' },
  { id: 'chora', name: 'Chora (Lorik) · Music' },
  { id: 'steamboat_willie', name: 'Willie (1928)' },
  { id: 'felix_the_cat', name: 'Felix (1919)' },
  { id: 'fleischer_flapper', name: 'Jazz Flapper (1930)' },
  { id: 'oswald_rabbit', name: 'Oswald (1927)' },
  { id: 'sailor_swagger', name: 'Sailor (1933)' },
];

export const makeDrawingLayer = (name = 'Drawing') => makeLayer('cel', name);
export const makeCharacterLayer = (rigId: AnimaRigId) =>
  makeLayer('character', RIG_CHOICES.find((r) => r.id === rigId)?.name ?? 'Character', { rigId, origin: { x: ANIMA_W / 2, y: ANIMA_H - 170 } });
export const makePlateLayer = (plate?: AnimaPlate) => makeLayer('plate', plate?.name || 'Plate', plate ? { plate } : {});
/** The camera: move, zoom (scale) and roll (rotation) it like any layer; the stage shows what it sees. */
export const makeCameraLayer = () => makeLayer('camera', 'Camera');

export const EFFECT_CHOICES: { kind: AnimaEffect['kind']; name: string; color: string }[] = [
  { kind: 'rain', name: 'Rain', color: '#9fd8ff' },
  { kind: 'snow', name: 'Snow', color: '#ffffff' },
  { kind: 'fireflies', name: 'Fireflies', color: '#ffe27a' },
  { kind: 'sparkles', name: 'Sparkles', color: '#D0BCFF' },
  { kind: 'hair', name: 'Hair & cape flutter', color: '#00DAF3' },
  { kind: 'smoke', name: 'Magic smoke', color: '#b26bff' },
  { kind: 'speed_lines', name: 'Manga speed lines', color: '#ffffff' },
  { kind: 'balloon', name: 'Speech balloon', color: '#ffffff' },
];

export const makeEffectLayer = (kind: AnimaEffect['kind']) => {
  const choice = EFFECT_CHOICES.find((e) => e.kind === kind);
  return makeLayer('effect', choice?.name ?? 'Effect', {
    effect: { kind, color: choice?.color, intensity: 1, ...(kind === 'balloon' ? { text: 'Hello!' } : {}) },
    ...(kind === 'balloon' ? { origin: { x: ANIMA_W / 2, y: 220 } } : {}),
  });
};

export function blankAnimaProject(name = 'Untitled animation'): AnimaProject {
  const now = Date.now();
  return {
    schema: ANIMA_SCHEMA,
    id: newAnimaId(),
    name,
    fps: 24,
    durationFrames: 72,
    width: ANIMA_W,
    height: ANIMA_H,
    currentFrame: 1,
    drawingBank: {},
    layers: [makeDrawingLayer('Drawing 1')],
    onionSkin: {
      enabled: false,
      prevFrames: 2,
      nextFrames: 1,
      prevColor: 'rgba(0, 218, 243, 0.45)',
      nextColor: 'rgba(212, 0, 85, 0.45)',
      opacityFalloff: 0.5,
    },
    camera: { x: 0, y: 0, z: 1000, zoom: 1, rotation: 0 },
    selectedLayerId: null,
    selectedBoneId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function scaleKeys(from: number, to: number, seconds: number): AnimaChannel<number> {
  return {
    id: 'ch_push_in',
    name: 'Scale',
    path: 'transform.scaleX',
    defaultValue: 1,
    keyframes: [
      { id: 'kp1', t: 0, v: from, ease: 'smooth' },
      { id: 'kp2', t: seconds, v: to, ease: 'smooth' },
    ],
  };
}

export interface AnimaTemplate {
  id: string;
  name: string;
  blurb: string;
  build: () => AnimaProject;
}

export const ANIMA_TEMPLATES: AnimaTemplate[] = [
  { id: 'blank', name: 'Blank', blurb: 'One drawing layer, 3 seconds at 24 fps.', build: () => blankAnimaProject() },
  {
    id: 'kaiju-walk',
    name: 'Kaiju walk',
    blurb: 'Reello walking across the frame, with a drawing layer on top.',
    build: () => {
      const p = blankAnimaProject('Kaiju walk');
      const rig = makeCharacterLayer('rello');
      // Motion ends on the last frame (frame 72 at 24 fps is t = 71/24).
      rig.channels = SmartMotionPresets.generateAutoWalk({ durationSeconds: frameToTime(p.durationFrames, p.fps), intensity: 1 });
      return { ...p, layers: [makeDrawingLayer('Drawing 1'), rig] };
    },
  },
  {
    id: 'living-plate',
    name: 'Living plate',
    blurb: 'Import a still or video, add rain and a slow push-in.',
    build: () => {
      const p = blankAnimaProject('Living plate');
      const plate = makePlateLayer();
      const end = frameToTime(p.durationFrames, p.fps);
      plate.channels = { 'transform.scaleX': scaleKeys(1, 1.08, end), 'transform.scaleY': { ...scaleKeys(1, 1.08, end), id: 'ch_push_in_y', path: 'transform.scaleY' } };
      return { ...p, durationFrames: 72, layers: [makeEffectLayer('rain'), plate] };
    },
  },
];
