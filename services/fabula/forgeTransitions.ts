export interface ForgeTransition {
  id: string;
  name: string;
  family: 'dissolve' | 'light' | 'motion' | 'graphic' | 'distort';
  description: string;
  defaults: Record<string, number>;
  presets: Array<{ id: string; name: string; params: Record<string, number> }>;
}

/** Transition contract is deliberately two-input and separate from one-input effects.
 * The renderer adapter receives outgoing/incoming textures plus progress 0..1. */
export const FORGE_TRANSITIONS: ForgeTransition[] = [
  { id: 'film-dissolve', name: 'Film Dissolve', family: 'dissolve', description: 'Gamma-aware optical dissolve with optional exposure bloom.', defaults: { softness: .5, bloom: .08 }, presets: [{ id: 'clean', name: 'Clean Optical', params: { softness: .5, bloom: .04 } }, { id: 'dream', name: 'Dream Bloom', params: { softness: .72, bloom: .38 } }] },
  { id: 'luma-dissolve', name: 'Luma Dissolve', family: 'dissolve', description: 'Reveals the incoming image through its luminance structure.', defaults: { softness: .12, direction: 1 }, presets: [{ id: 'highlights', name: 'Highlights First', params: { softness: .1, direction: 1 } }, { id: 'shadows', name: 'Shadows First', params: { softness: .14, direction: -1 } }] },
  { id: 'light-leak', name: 'Light Leak', family: 'light', description: 'Organic warm flare wipes between shots.', defaults: { intensity: .8, angle: 0 }, presets: [{ id: 'amber', name: 'Amber Sweep', params: { intensity: .9, angle: 8 } }, { id: 'rose', name: 'Rose Flash', params: { intensity: 1.2, angle: -22 } }] },
  { id: 'whip', name: 'Whip Pan', family: 'motion', description: 'Directional blur and position handoff with natural easing.', defaults: { angle: 0, blur: 80 }, presets: [{ id: 'left', name: 'Whip Left', params: { angle: 180, blur: 92 } }, { id: 'right', name: 'Whip Right', params: { angle: 0, blur: 92 } }] },
  { id: 'prism-warp', name: 'Prism Warp', family: 'distort', description: 'Chromatic refraction folds one shot into the next.', defaults: { amount: .6, fringe: .35 }, presets: [{ id: 'glass', name: 'Glass Fold', params: { amount: .48, fringe: .16 } }, { id: 'rainbow', name: 'Rainbow Fold', params: { amount: .82, fringe: .68 } }] },
  { id: 'ink-reveal', name: 'Ink Reveal', family: 'graphic', description: 'Organic spreading matte for editorial and title transitions.', defaults: { scale: 3, edge: .16 }, presets: [{ id: 'soft', name: 'Soft Ink', params: { scale: 2.4, edge: .22 } }, { id: 'bold', name: 'Bold Ink', params: { scale: 5.2, edge: .08 } }] },
  { id: 'glow-dissolve', name: 'Glow Dissolve', family: 'light', description: 'Highlight bloom swells through the cut and settles cleanly.', defaults: { glow: .8, threshold: .55 }, presets: [{ id: 'silk', name: 'Silk Glow', params: { glow: .55, threshold: .68 } }, { id: 'radiant', name: 'Radiant Cut', params: { glow: 1.35, threshold: .38 } }] },
  { id: 'blur-dissolve', name: 'Blur Dissolve', family: 'dissolve', description: 'Both shots defocus through the midpoint of a gamma-aware dissolve.', defaults: { radius: 34, softness: .5 }, presets: [{ id: 'cinema', name: 'Cinema Blur', params: { radius: 28, softness: .55 } }, { id: 'dream', name: 'Dream Blur', params: { radius: 58, softness: .75 } }] },
  { id: 'bokeh-dissolve', name: 'Bokeh Dissolve', family: 'light', description: 'Lens-shaped highlight defocus carries one shot into the next.', defaults: { radius: 42, highlights: .8 }, presets: [{ id: 'portrait', name: 'Portrait Bokeh', params: { radius: 36, highlights: .55 } }, { id: 'night', name: 'Night Bokeh', params: { radius: 64, highlights: 1.4 } }] },
  { id: 'zoom-pull', name: 'Zoom Pull', family: 'motion', description: 'Center-weighted optical zoom handoff with natural easing.', defaults: { amount: .28, blur: .35 }, presets: [{ id: 'push', name: 'Push Through', params: { amount: .32, blur: .4 } }, { id: 'hyper', name: 'Hyper Pull', params: { amount: .68, blur: .72 } }] },
  { id: 'film-roll', name: 'Film Roll', family: 'motion', description: 'Vertical frame-roll handoff with gate softness.', defaults: { direction: 1, softness: .03 }, presets: [{ id: 'up', name: 'Roll Up', params: { direction: 1, softness: .025 } }, { id: 'down', name: 'Roll Down', params: { direction: -1, softness: .04 } }] },
  { id: 'glitch-cut', name: 'Glitch Cut', family: 'graphic', description: 'Block tears and signal corruption bridge the edit.', defaults: { amount: .55, blocks: 18 }, presets: [{ id: 'clean', name: 'Clean Glitch', params: { amount: .32, blocks: 28 } }, { id: 'break', name: 'Signal Break', params: { amount: .88, blocks: 12 } }] },
  { id: 'rgb-split', name: 'RGB Split', family: 'distort', description: 'Spectral channel separation snaps across the cut.', defaults: { amount: .04, angle: 0 }, presets: [{ id: 'subtle', name: 'Subtle Split', params: { amount: .018, angle: 0 } }, { id: 'impact', name: 'Impact Split', params: { amount: .075, angle: -12 } }] },
  { id: 'burn-flash', name: 'Burn & Flash', family: 'light', description: 'Warm film-burn exposure wipes across the edit.', defaults: { intensity: 1, angle: 0 }, presets: [{ id: 'film-burn', name: 'Film Burn', params: { intensity: .9, angle: 8 } }, { id: 'white-flash', name: 'White Flash', params: { intensity: 1.6, angle: 0 } }] },
  { id: 'push-slide', name: 'Push & Slide', family: 'motion', description: 'Clean spatial push with optional directional softness.', defaults: { angle: 0, softness: .02 }, presets: [{ id: 'left', name: 'Push Left', params: { angle: 180, softness: .015 } }, { id: 'up', name: 'Push Up', params: { angle: 90, softness: .02 } }] },
  { id: 'shape-wipe', name: 'Shape Wipe', family: 'graphic', description: 'Circular, diamond-like reveal with a refined controllable edge.', defaults: { shape: 0, softness: .06 }, presets: [{ id: 'circle', name: 'Circle Open', params: { shape: 0, softness: .055 } }, { id: 'diamond', name: 'Diamond Open', params: { shape: 1, softness: .035 } }] },
  { id: 'camera-shake', name: 'Camera Shake Cut', family: 'motion', description: 'Impact-driven two-shot handoff with positional shake and blur-safe easing.', defaults: { amount: .035, frequency: 18 }, presets: [{ id: 'handheld', name: 'Handheld Hit', params: { amount: .018, frequency: 13 } }, { id: 'impact', name: 'Impact Shake', params: { amount: .065, frequency: 24 } }] },
];

export function createForgeTransition(id: string, presetId?: string, dur = 1) {
  const transition = FORGE_TRANSITIONS.find((candidate) => candidate.id === id);
  if (!transition) throw new Error(`Unknown Forge transition: ${id}`);
  const preset = presetId ? transition.presets.find((candidate) => candidate.id === presetId) : undefined;
  if (presetId && !preset) throw new Error(`Unknown preset ${presetId} for ${id}`);
  return { type: 'forge', forgeId: id, presetId: preset?.id, dur, params: { ...transition.defaults, ...(preset?.params || {}) } };
}
