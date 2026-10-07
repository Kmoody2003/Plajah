// shaderLooks — a "look" is a tree of `shaders` components written as DATA, not code.
//
// This is the format the Art Council emits (each director proposes a ShaderLook, validated by
// shaderLookSchema against the library's real component catalog) and the format the Chora FX Stage
// stores, pins per track, and renders. A look is plain JSON, so it can be saved, diffed, disputed in the
// council room and pinned per Tela version.
//
// Nesting follows the library: an effect node (Glitch, Halftone, Duotone, Kaleidoscope …) filters its
// CHILDREN; a generator node (FlowingGradient, Aurora, Plasma, Voronoi …) paints on its own.
// `drive` binds one numeric prop to a live audio feature per frame, with an output range inside the prop's
// own catalog range. The only host token a look may carry is `$cover` (ImageTexture.url) — the playing
// track's art, resolved at render time; no look can name an arbitrary URL.

export const AUDIO_FEATURES = ['intensity', 'mid', 'beat', 'kick', 'snare', 'density'] as const;
export type AudioFeature = typeof AUDIO_FEATURES[number];

export interface ShaderDrive {
  prop: string;
  from: AudioFeature;
  min: number;
  max: number;
  /** 0..1 smoothing toward the target each frame (default .35). Lower = floatier; beats want fast attack. */
  smooth?: number;
}

export interface ShaderNode {
  /** Exact component name from `shaders/react` (e.g. 'Plasma'). Unknown names never reach here — see validateLook. */
  type: string;
  props?: Record<string, unknown>;
  drive?: ShaderDrive[];
  children?: ShaderNode[];
}

export interface ShaderLook {
  id: string;
  name: string;
  /** Which council director's lens this look belongs to (art council ids), if any. */
  director?: string;
  /** CSS gradient painted when WebGPU is unavailable. Derived from the look's own colours by the validator. */
  fallbackCss: string;
  /** True when the look samples the playing track's cover art ('$cover'). */
  needsCover?: boolean;
  root: ShaderNode[];
}

const COVER = { type: 'ImageTexture', props: { url: '$cover', objectFit: 'cover' } } as const;

// The house set. Every prop and range here is checked by tests/shaderLooks.test.ts against the generated
// catalog (zero clamp issues), so a bad edit fails the suite instead of rendering wrong.
export const STARTER_LOOKS: ShaderLook[] = [
  {
    id: 'aurora-bloom', name: 'Aurora Bloom', director: 'BAROQUE', fallbackCss: '',
    root: [{
      type: 'ChromaticAberration', props: { strength: 0.06 },
      drive: [{ prop: 'strength', from: 'kick', min: 0.06, max: 0.45 }],
      children: [
        { type: 'FlowingGradient', props: { colorA: '#0b1020', colorB: '#3b1d6e', colorC: '#8b5cf6', colorD: '#ff8c00', speed: 0.6 },
          drive: [{ prop: 'distortion', from: 'intensity', min: 0.3, max: 1.6 }] },
        { type: 'Aurora', props: { colorA: '#22d3ee', colorB: '#8b5cf6', colorC: '#ff8c00', curtainCount: 4, speed: 3 },
          drive: [{ prop: 'intensity', from: 'mid', min: 35, max: 100 }, { prop: 'waviness', from: 'density', min: 30, max: 120 }] },
      ],
    }],
  },
  {
    id: 'signal-glitch', name: 'Signal Glitch', director: 'REBEL', fallbackCss: '',
    root: [{
      type: 'Glitch', props: { intensity: 0.12, scanlineIntensity: 0.4, speed: 1.4 },
      drive: [{ prop: 'intensity', from: 'snare', min: 0.12, max: 1 }, { prop: 'rgbShift', from: 'kick', min: 2, max: 14 }],
      children: [
        { type: 'Plasma', props: { colorA: '#ff2d6f', colorB: '#0a0414', speed: 1.4 },
          drive: [{ prop: 'warp', from: 'intensity', min: 0.15, max: 0.9 }] },
      ],
    }],
  },
  {
    id: 'dot-pulse', name: 'Dot Pulse', director: 'RADICAL_MINIMAL', fallbackCss: '',
    root: [{
      type: 'Halftone', props: { frequency: 90, angle: 45 },
      drive: [{ prop: 'frequency', from: 'intensity', min: 70, max: 200 }],
      children: [
        { type: 'FlowingGradient', props: { colorA: '#111111', colorB: '#f5f1e8', colorC: '#ff8c00', colorD: '#111111', speed: 0.5 } },
      ],
    }],
  },
  {
    id: 'cell-lattice', name: 'Cell Lattice', director: 'FUTURIST', fallbackCss: '',
    root: [{
      type: 'Voronoi', props: { colorA: '#041014', colorB: '#22d3ee', colorBorder: '#ff8c00', scale: 6, speed: 0.6 },
      drive: [{ prop: 'edgeIntensity', from: 'beat', min: 0.25, max: 1 }, { prop: 'scale', from: 'density', min: 4, max: 14 }],
    }],
  },
  {
    id: 'marble-pool', name: 'Marble Pool', director: 'CLASSICAL', fallbackCss: '',
    root: [{
      type: 'Vignette', props: { color: '#05050a', radius: 0.85, falloff: 0.7, intensity: 0.8 },
      children: [
        { type: 'Marble', props: { colorA: '#f4eee2', colorB: '#3a2d54', colorC: '#0f0f0f', scale: 1.6, speed: 0.12 },
          drive: [{ prop: 'turbulence', from: 'intensity', min: 6, max: 30 }] },
      ],
    }],
  },
  {
    id: 'sun-gong', name: 'Sun Gong', director: 'WORLD_ECLECTIC', fallbackCss: '',
    root: [{
      type: 'ChromaticAberration', props: { strength: 0.04 },
      drive: [{ prop: 'strength', from: 'beat', min: 0.04, max: 0.3 }],
      children: [
        { type: 'SunBurst', props: { color: '#ffb347', background: '#2a0b05', rayCount: 16, speed: 0.3 },
          drive: [{ prop: 'radius', from: 'intensity', min: 0.5, max: 1.1 }, { prop: 'rayCount', from: 'density', min: 10, max: 36 }] },
      ],
    }],
  },
  {
    id: 'god-rays', name: 'Cathedral Rays', director: 'BAROQUE', fallbackCss: '',
    root: [
      { type: 'MeshGradient', props: { colorA: '#120a24', colorB: '#c98a3c', count: 4, speed: 0.4 } },
      { type: 'Godrays', props: { rayColor: '#ffd9a0', speed: 0.3, density: 0.35 },
        drive: [{ prop: 'intensity', from: 'mid', min: 0.4, max: 1 }] },
    ],
  },
  {
    id: 'stage-bars', name: 'Stage Bars', director: 'FUTURIST', fallbackCss: '',
    root: [
      { type: 'MeshGradient', props: { colorA: '#05060f', colorB: '#1b2a6b', count: 3, speed: 0.5 } },
      { type: 'Waveform', props: { style: 'bars', colorA: '#22d3ee', colorB: '#ff3bd4', count: 48, align: 'mirrored' },
        drive: [{ prop: 'amplitude', from: 'intensity', min: 0.3, max: 1.8, smooth: 0.5 }] },
    ],
  },
  {
    id: 'ripple-pool', name: 'Still Water', director: 'CLASSICAL', fallbackCss: '',
    root: [{
      type: 'Blur', props: { intensity: 6 },
      children: [
        { type: 'Ripples', props: { colorA: '#bfe8ff', colorB: '#06121f', frequency: 14, softness: 1, thickness: 0.35, speed: 0.8 },
          drive: [{ prop: 'frequency', from: 'kick', min: 10, max: 34 }] },
      ],
    }],
  },
  {
    id: 'woven-signal', name: 'Woven Signal', director: 'WORLD_ECLECTIC', fallbackCss: '',
    root: [{
      type: 'Truchet', props: { colorA: '#2a120a', colorB: '#e8a33d', cells: 12, thickness: 6 },
      drive: [{ prop: 'cells', from: 'density', min: 8, max: 26 }, { prop: 'rotation', from: 'intensity', min: 0, max: 45, smooth: 0.15 }],
    }],
  },

  // ── Cover-art looks: the playing track's own art, treated and driven by the music ──
  {
    id: 'cover-halftone', name: 'Cover · Halftone Press', director: 'REBEL', fallbackCss: '',
    root: [{
      type: 'Halftone', props: { style: 'cmyk', frequency: 110, misprint: 0.004 },
      drive: [{ prop: 'frequency', from: 'intensity', min: 70, max: 190 }, { prop: 'misprint', from: 'snare', min: 0.001, max: 0.01 }],
      children: [COVER],
    }],
  },
  {
    id: 'cover-glass-tiles', name: 'Cover · Glass Tiles', director: 'FUTURIST', fallbackCss: '',
    root: [{
      type: 'GlassTiles', props: { intensity: 2, tileCount: 22, roundness: 0.3 },
      drive: [{ prop: 'intensity', from: 'kick', min: 1.5, max: 6 }, { prop: 'tileCount', from: 'density', min: 14, max: 40 }],
      children: [COVER],
    }],
  },
  {
    id: 'cover-watercolor', name: 'Cover · Wet Paper', director: 'CLASSICAL', fallbackCss: '',
    root: [{
      type: 'Vignette', props: { color: '#0b0b12', radius: 0.9, falloff: 0.8, intensity: 0.7 },
      children: [{
        type: 'Watercolor', props: { radius: 4, strength: 1, paper: 0.45 },
        drive: [{ prop: 'bleed', from: 'mid', min: 0.4, max: 2.4 }],
        children: [COVER],
      }],
    }],
  },
  {
    id: 'cover-kaleido', name: 'Cover · Kaleidoscope', director: 'BAROQUE', fallbackCss: '',
    root: [{
      type: 'Kaleidoscope', props: { segments: 8, edges: 'mirror' },
      drive: [{ prop: 'segments', from: 'density', min: 4, max: 14 }, { prop: 'angle', from: 'intensity', min: 0, max: 90, smooth: 0.1 }],
      children: [COVER],
    }],
  },
  {
    id: 'cover-dither', name: 'Cover · Bit Press', director: 'RADICAL_MINIMAL', fallbackCss: '',
    root: [{
      type: 'Dither', props: { pattern: 'bayer8', colorMode: 'custom', colorA: '#0b0b12', colorB: '#ff8c00', pixelSize: 3 },
      drive: [{ prop: 'pixelSize', from: 'kick', min: 2, max: 9 }],
      children: [COVER],
    }],
  },
  {
    id: 'cover-glitch', name: 'Cover · Tape Rot', director: 'REBEL', fallbackCss: '',
    root: [{
      type: 'Glitch', props: { intensity: 0.06, scanlineIntensity: 0.3, blockDensity: 14 },
      drive: [{ prop: 'intensity', from: 'snare', min: 0.06, max: 0.9 }, { prop: 'rgbShift', from: 'kick', min: 1, max: 14 }, { prop: 'mirrorAmount', from: 'density', min: 0.1, max: 0.6 }],
      children: [COVER],
    }],
  },
  {
    id: 'cover-mosaic', name: 'Cover · Mosaic Tide', director: 'WORLD_ECLECTIC', fallbackCss: '',
    root: [{
      type: 'Pixelate', props: { scale: 48, gap: 0.08, roundness: 0.6 },
      drive: [{ prop: 'scale', from: 'intensity', min: 24, max: 110, smooth: 0.2 }],
      children: [COVER],
    }],
  },
];

/** Build-time derivation: fallbackCss is never hand-authored (see validateLook). Filled lazily to avoid an import cycle. */
export function lookColors(nodes: ShaderNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    for (const v of Object.values(n.props ?? {})) if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) out.push(v);
    if (n.children) lookColors(n.children, out);
  }
  return out;
}
