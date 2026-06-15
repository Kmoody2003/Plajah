// engine/sceneCatalog.ts — one list describing every scene the app can show,
// blending the original AudioVisualizer modes with the new studio scenes so a
// single rail can pick any of them.

import { VisualizerMode } from '../types';
import { CANVAS_PRESETS } from './presets/canvasPresets';
import { GL_PRESETS } from './webgl/glRenderer';
import { STUDIO_SCENE_TO_MODE } from '../types';

export interface SceneEntry {
  mode: VisualizerMode;
  name: string;
  cat: string;
  kind: 'classic' | 'canvas' | 'gl';
}

const CLASSIC: SceneEntry[] = [
  { mode: VisualizerMode.Stage, name: 'Stage', cat: 'Classic · Live', kind: 'classic' },
  { mode: VisualizerMode.Spectrum, name: 'Spectrum', cat: 'Classic · Bars', kind: 'classic' },
  { mode: VisualizerMode.Waveform, name: 'Waveform', cat: 'Classic · Line', kind: 'classic' },
  { mode: VisualizerMode.Particles, name: 'Particles', cat: 'Classic · Particle', kind: 'classic' },
  { mode: VisualizerMode.Nebula, name: 'Nebula', cat: 'Classic · Abstract', kind: 'classic' },
  { mode: VisualizerMode.Storm, name: 'Storm', cat: 'Classic · Energy', kind: 'classic' },
  { mode: VisualizerMode.Luminance, name: 'Luminance', cat: 'Classic · Reactive', kind: 'classic' },
  { mode: VisualizerMode.Tunnel, name: 'Tunnel', cat: 'Classic · 3D', kind: 'classic' },
  { mode: VisualizerMode.Vortex, name: 'Vortex', cat: 'Classic · Spiral', kind: 'classic' },
  { mode: VisualizerMode.Liquid, name: 'Liquid', cat: 'Classic · Fluid', kind: 'classic' },
  { mode: VisualizerMode.Kaleidoscope, name: 'Kaleidoscope', cat: 'Classic · Mirror', kind: 'classic' },
  { mode: VisualizerMode.Cosmic, name: 'Cosmic', cat: 'Classic · Space', kind: 'classic' },
  { mode: VisualizerMode.RetroGrid, name: 'Retro Grid', cat: 'Classic · Grid', kind: 'classic' },
];

const STUDIO: SceneEntry[] = [
  ...CANVAS_PRESETS.map(p => ({ mode: STUDIO_SCENE_TO_MODE[p.id], name: p.name, cat: p.cat, kind: 'canvas' as const })),
  ...GL_PRESETS.map(p => ({ mode: STUDIO_SCENE_TO_MODE[p.id], name: p.name, cat: p.cat, kind: 'gl' as const })),
];

export const SCENE_CATALOG: SceneEntry[] = [...STUDIO, ...CLASSIC];
