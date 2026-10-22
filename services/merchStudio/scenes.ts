// services/merchStudio/scenes.ts — the seeded product-photography sets for the Merch Designer.
//
// A scene is a small, fully declarative photo set: backdrop, floor, an optional pedestal, a few
// props, a light rig and a camera, plus the words the generative pass uses to dress it. The 3D
// render of the set is what the generator starts from, so where the lights, pedestal and props sit
// in 3D becomes the composition the finished photo keeps.
//
// Props are placed relative to the product's footprint (radius ≈ 0.6 world units) so every template
// product sits in the same spot on every set. Six sets ship now; adding one is adding an entry.

export type MerchSetPattern = 'none' | 'marble' | 'concrete' | 'wood' | 'rubber' | 'grid';

export interface MerchSetSurface {
  color: string;
  roughness: number;
  metalness: number;
  pattern?: MerchSetPattern;
  /** Secondary colour for the pattern (veins, grain, grid lines). */
  accent?: string;
}

export interface MerchSetProp {
  shape: 'sphere' | 'box' | 'cylinder' | 'torus' | 'cone' | 'capsule';
  /** Centre, in world units; y is height above the floor. */
  position: [number, number, number];
  /** Size of the unit shape on each axis. */
  scale: [number, number, number];
  rotation?: [number, number, number];
  surface: MerchSetSurface;
  emissive?: string;
  emissiveIntensity?: number;
}

export interface MerchSetLight {
  role: 'key' | 'fill' | 'rim' | 'accent';
  kind: 'directional' | 'spot' | 'point' | 'area';
  color: string;
  intensity: number;
  position: [number, number, number];
  castShadow?: boolean;
  /** Spot cone (degrees) and edge softness. */
  angle?: number;
  penumbra?: number;
  /** Rect-area light size. */
  size?: [number, number];
}

export interface MerchScene {
  id: string;
  name: string;
  mood: string;
  /** Card swatch: two colours for the gallery tile gradient. */
  swatch: [string, string];
  backdrop: { kind: 'sweep' | 'void' | 'table'; top: string; bottom: string; surface: MerchSetSurface };
  pedestal?: { shape: 'cylinder' | 'box' | 'stack'; width: number; height: number; surface: MerchSetSurface };
  props: MerchSetProp[];
  lights: MerchSetLight[];
  ambient: { sky: string; ground: string; intensity: number };
  envIntensity: number;
  exposure: number;
  fog?: { color: string; near: number; far: number };
  camera: { yaw: number; pitch: number; distance: number; fov: number };
  prompt: { style: string; negative: string };
  /** How far the generator may move away from the 3D render (0.5 = close to it, 1 = free). */
  genStrength: number;
}

const NEG = 'blurry, distorted product, warped logo, extra text, watermark, duplicate product, low quality, cgi, plastic look';

export const MERCH_SCENES: MerchScene[] = [
  {
    id: 'clean-studio',
    name: 'Clean Studio',
    mood: 'E-commerce white sweep, even soft light',
    swatch: ['#ffffff', '#dfe3ea'],
    backdrop: { kind: 'sweep', top: '#f7f8fa', bottom: '#e9ecf1', surface: { color: '#f2f3f6', roughness: 0.9, metalness: 0 } },
    props: [],
    lights: [
      { role: 'key', kind: 'area', color: '#ffffff', intensity: 5, position: [-2.2, 3, 2.6], size: [2.6, 2.6] },
      { role: 'fill', kind: 'area', color: '#f4f7ff', intensity: 2, position: [2.6, 1.8, 2.2], size: [2.4, 2.4] },
      { role: 'rim', kind: 'directional', color: '#ffffff', intensity: 1.4, position: [0.5, 3.5, -3], castShadow: false },
      { role: 'key', kind: 'directional', color: '#ffffff', intensity: 1.2, position: [-1.5, 5, 2], castShadow: true },
    ],
    ambient: { sky: '#ffffff', ground: '#dfe2e8', intensity: 0.45 },
    envIntensity: 0.7,
    exposure: 0.92,
    camera: { yaw: 18, pitch: 12, distance: 1.05, fov: 32 },
    prompt: {
      style: 'professional e-commerce product photograph on a seamless white studio sweep, soft diffused softbox lighting, gentle contact shadow, crisp detail, high-end catalog look',
      negative: NEG,
    },
    genStrength: 0.6,
  },
  {
    id: 'beauty-blush',
    name: 'Beauty & Fashion',
    mood: 'Blush marble, silk-soft window light, gold accents',
    swatch: ['#f6d9d3', '#c99a8e'],
    backdrop: { kind: 'sweep', top: '#f7e1dc', bottom: '#eac6bd', surface: { color: '#f1d3cb', roughness: 0.85, metalness: 0 } },
    pedestal: { shape: 'cylinder', width: 1.5, height: 0.32, surface: { color: '#f4ece8', roughness: 0.18, metalness: 0, pattern: 'marble', accent: '#c9a9a0' } },
    props: [
      { shape: 'sphere', position: [-0.95, 0.2, -0.35], scale: [0.2, 0.2, 0.2], surface: { color: '#d8b46a', roughness: 0.18, metalness: 1 } },
      { shape: 'sphere', position: [0.92, 0.12, 0.2], scale: [0.12, 0.12, 0.12], surface: { color: '#f8e7e2', roughness: 0.3, metalness: 0 } },
      { shape: 'cylinder', position: [1.15, 0.6, -0.6], scale: [0.22, 1.2, 0.22], surface: { color: '#ead0c8', roughness: 0.5, metalness: 0 } },
      { shape: 'torus', position: [-0.7, 0.025, 0.55], scale: [0.18, 0.18, 0.18], rotation: [Math.PI / 2, 0, 0], surface: { color: '#d8b46a', roughness: 0.15, metalness: 1 } },
    ],
    lights: [
      { role: 'key', kind: 'area', color: '#fff3ec', intensity: 11, position: [-2.4, 2.8, 1.6], size: [3, 3] },
      { role: 'fill', kind: 'area', color: '#ffe4e8', intensity: 3.5, position: [2.4, 1.4, 2.4], size: [2.2, 2.2] },
      { role: 'rim', kind: 'spot', color: '#ffd9c4', intensity: 30, position: [1.6, 3, -2.2], angle: 32, penumbra: 0.9 },
      { role: 'key', kind: 'directional', color: '#fff0e6', intensity: 1.1, position: [-2, 4.5, 1.5], castShadow: true },
    ],
    ambient: { sky: '#fff1ee', ground: '#e2b9ae', intensity: 0.6 },
    envIntensity: 0.8,
    exposure: 1.08,
    camera: { yaw: 22, pitch: 10, distance: 1.25, fov: 34 },
    prompt: {
      style: 'luxury beauty and fashion editorial product photograph, blush pink marble pedestal, draped silk, delicate dried florals, polished gold accents, soft window light, creamy bokeh, magazine campaign',
      negative: NEG,
    },
    genStrength: 0.72,
  },
  {
    id: 'slate-gentleman',
    name: 'Masculine',
    mood: 'Charcoal slate, warm tungsten key, cool rim',
    swatch: ['#2d2f33', '#8a5a2b'],
    backdrop: { kind: 'sweep', top: '#24262a', bottom: '#15161a', surface: { color: '#2a2c30', roughness: 0.75, metalness: 0.05, pattern: 'concrete', accent: '#1d1e21' } },
    pedestal: { shape: 'box', width: 1.5, height: 0.36, surface: { color: '#4a4b4f', roughness: 0.9, metalness: 0, pattern: 'concrete', accent: '#35363a' } },
    props: [
      { shape: 'box', position: [1.05, 0.12, -0.55], scale: [0.55, 0.24, 0.4], rotation: [0, 0.4, 0], surface: { color: '#5a3b22', roughness: 0.55, metalness: 0, pattern: 'wood', accent: '#3a2414' } },
      { shape: 'cylinder', position: [-1.05, 0.22, -0.4], scale: [0.18, 0.44, 0.18], surface: { color: '#8a5a2b', roughness: 0.05, metalness: 0.1 } },
      { shape: 'box', position: [-0.85, 0.05, 0.6], scale: [0.5, 0.1, 0.32], rotation: [0, -0.3, 0], surface: { color: '#3b2a20', roughness: 0.7, metalness: 0 } },
    ],
    lights: [
      { role: 'key', kind: 'spot', color: '#ffb46b', intensity: 70, position: [-2.4, 3.2, 1.8], angle: 28, penumbra: 0.55, castShadow: true },
      { role: 'rim', kind: 'spot', color: '#8fb4ff', intensity: 55, position: [2.2, 2.6, -2.4], angle: 30, penumbra: 0.6 },
      { role: 'fill', kind: 'area', color: '#c7d3e6', intensity: 1.2, position: [2.5, 1.2, 2.5], size: [2, 2] },
    ],
    ambient: { sky: '#3a3f48', ground: '#121214', intensity: 0.25 },
    envIntensity: 0.35,
    exposure: 1.0,
    fog: { color: '#16171a', near: 6, far: 16 },
    camera: { yaw: 28, pitch: 8, distance: 1.2, fov: 30 },
    prompt: {
      style: 'moody masculine product photograph, dark slate and raw concrete, warm tungsten key light, cool rim light, walnut and leather details, whiskey glass, deep shadows, premium menswear campaign',
      negative: NEG,
    },
    genStrength: 0.72,
  },
  {
    id: 'fitness-power',
    name: 'Fitness',
    mood: 'Rubber gym floor, punchy teal and orange rims',
    swatch: ['#121417', '#ff6a2b'],
    backdrop: { kind: 'sweep', top: '#1b1e22', bottom: '#0f1113', surface: { color: '#1a1c1f', roughness: 0.95, metalness: 0, pattern: 'rubber', accent: '#2a2d31' } },
    pedestal: { shape: 'stack', width: 1.3, height: 0.3, surface: { color: '#1f2124', roughness: 0.6, metalness: 0.2 } },
    props: [
      { shape: 'cylinder', position: [-1.2, 0.05, -0.2], scale: [0.62, 0.1, 0.62], surface: { color: '#202225', roughness: 0.5, metalness: 0.3 } },
      { shape: 'cylinder', position: [-1.2, 0.15, -0.2], scale: [0.5, 0.1, 0.5], surface: { color: '#ff6a2b', roughness: 0.45, metalness: 0.1 } },
      { shape: 'capsule', position: [1.15, 0.065, 0.3], scale: [0.12, 0.62, 0.12], rotation: [0, 0, Math.PI / 2], surface: { color: '#2b2e33', roughness: 0.35, metalness: 0.8 } },
      { shape: 'box', position: [1.1, 0.3, -0.7], scale: [0.4, 0.6, 0.3], rotation: [0, -0.4, 0], surface: { color: '#00c2b8', roughness: 0.5, metalness: 0.1 } },
    ],
    lights: [
      { role: 'key', kind: 'area', color: '#ffffff', intensity: 8, position: [0.4, 3.4, 2.6], size: [1.6, 3] },
      { role: 'rim', kind: 'spot', color: '#00e0d0', intensity: 90, position: [-2.6, 1.8, -1.8], angle: 30, penumbra: 0.4 },
      { role: 'rim', kind: 'spot', color: '#ff6a2b', intensity: 90, position: [2.6, 1.8, -1.8], angle: 30, penumbra: 0.4 },
      { role: 'key', kind: 'directional', color: '#ffffff', intensity: 1.2, position: [0.6, 5, 2.2], castShadow: true },
    ],
    ambient: { sky: '#2a3036', ground: '#0c0d0f', intensity: 0.3 },
    envIntensity: 0.4,
    exposure: 1.05,
    camera: { yaw: 12, pitch: 6, distance: 1.2, fov: 34 },
    prompt: {
      style: 'high-energy fitness product photograph, gym setting, black rubber floor, iron weight plates and dumbbells, dramatic teal and orange rim lights, chalk dust in the air, sweat-proof athletic brand campaign',
      negative: NEG,
    },
    genStrength: 0.75,
  },
  {
    id: 'tech-noir',
    name: 'Tech',
    mood: 'Glossy black floor, cyan and violet edge light',
    swatch: ['#0a0f1f', '#29d3ff'],
    backdrop: { kind: 'void', top: '#0b1022', bottom: '#04060c', surface: { color: '#05070d', roughness: 0.14, metalness: 0.6, pattern: 'grid', accent: '#1b3a6b' } },
    pedestal: { shape: 'cylinder', width: 1.4, height: 0.12, surface: { color: '#0d1220', roughness: 0.2, metalness: 0.8 } },
    props: [
      { shape: 'box', position: [-1.1, 0.4, -0.7], scale: [0.3, 0.3, 0.3], rotation: [0.6, 0.7, 0.2], surface: { color: '#0f1730', roughness: 0.1, metalness: 0.9 }, emissive: '#29d3ff', emissiveIntensity: 0.25 },
      { shape: 'box', position: [1.1, 0.75, -0.9], scale: [0.18, 0.18, 0.18], rotation: [0.3, 0.2, 0.8], surface: { color: '#14102a', roughness: 0.1, metalness: 0.9 }, emissive: '#9b5cff', emissiveIntensity: 0.35 },
      { shape: 'torus', position: [0, 0.03, 0], scale: [0.74, 0.74, 0.25], rotation: [Math.PI / 2, 0, 0], surface: { color: '#29d3ff', roughness: 0.3, metalness: 0 }, emissive: '#29d3ff', emissiveIntensity: 1.4 },
    ],
    lights: [
      { role: 'key', kind: 'area', color: '#dfe9ff', intensity: 6, position: [-1.6, 3, 2.4], size: [1.4, 2.6] },
      { role: 'rim', kind: 'spot', color: '#29d3ff', intensity: 110, position: [-2.4, 1.5, -2.2], angle: 26, penumbra: 0.5 },
      { role: 'rim', kind: 'spot', color: '#9b5cff', intensity: 110, position: [2.4, 1.5, -2.2], angle: 26, penumbra: 0.5 },
      { role: 'key', kind: 'directional', color: '#cfe0ff', intensity: 0.8, position: [-1, 5, 2], castShadow: true },
    ],
    ambient: { sky: '#1a2240', ground: '#020306', intensity: 0.2 },
    envIntensity: 0.6,
    exposure: 1.0,
    fog: { color: '#04060c', near: 5, far: 14 },
    camera: { yaw: 20, pitch: 9, distance: 1.2, fov: 30 },
    prompt: {
      style: 'sleek futuristic tech product photograph, glossy black reflective floor, glowing cyan and violet edge lighting, floating geometric shapes, subtle haze, premium gadget launch keynote render',
      negative: NEG,
    },
    genStrength: 0.7,
  },
  {
    id: 'golden-hour',
    name: 'Lifestyle',
    mood: 'Sunlit oak table, golden-hour warmth',
    swatch: ['#f3d9a4', '#7a5a3a'],
    backdrop: { kind: 'table', top: '#f6e2bd', bottom: '#d8b98a', surface: { color: '#b98a5a', roughness: 0.55, metalness: 0, pattern: 'wood', accent: '#8a6038' } },
    props: [
      { shape: 'cone', position: [-1.15, 0.69, -0.75], scale: [0.35, 0.9, 0.35], surface: { color: '#5d7b45', roughness: 0.8, metalness: 0 } },
      { shape: 'cylinder', position: [-1.15, 0.12, -0.75], scale: [0.26, 0.24, 0.26], surface: { color: '#d7c3a5', roughness: 0.7, metalness: 0 } },
      { shape: 'box', position: [1.1, 0.06, 0.35], scale: [0.62, 0.12, 0.44], rotation: [0, 0.35, 0], surface: { color: '#efe7d9', roughness: 0.85, metalness: 0 } },
      { shape: 'sphere', position: [0.95, 0.14, -0.6], scale: [0.14, 0.14, 0.14], surface: { color: '#e09b3d', roughness: 0.6, metalness: 0 } },
    ],
    lights: [
      { role: 'key', kind: 'directional', color: '#ffc27a', intensity: 4.2, position: [-3.5, 2.2, 1.2], castShadow: true },
      { role: 'fill', kind: 'area', color: '#e6efff', intensity: 2.6, position: [2.4, 2.2, 2.6], size: [3, 3] },
      { role: 'rim', kind: 'directional', color: '#ffd9a0', intensity: 1.6, position: [1.5, 2.5, -3] },
    ],
    ambient: { sky: '#ffe9c7', ground: '#8a6a48', intensity: 0.55 },
    envIntensity: 0.75,
    exposure: 1.06,
    camera: { yaw: 24, pitch: 14, distance: 1.2, fov: 34 },
    prompt: {
      style: 'warm lifestyle product photograph on a sunlit oak table, golden hour light through a window, long soft shadows, potted plant, linen and coffee, cozy cafe atmosphere, shallow depth of field',
      negative: NEG,
    },
    genStrength: 0.75,
  },
];

export function getMerchScene(id: string | undefined): MerchScene {
  return MERCH_SCENES.find((s) => s.id === id) ?? MERCH_SCENES[0];
}

/** The full prompt for one generated shot of `noun` on `scene`. */
export function merchShotPrompt(scene: MerchScene, noun: string, extra?: string): string {
  const parts = [`${noun}, centered hero product`, scene.prompt.style];
  if (extra?.trim()) parts.push(extra.trim());
  return parts.join(', ');
}
