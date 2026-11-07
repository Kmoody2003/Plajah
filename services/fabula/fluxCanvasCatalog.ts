// Flux Canvas — still images brought to life as Flux visualizers. Each image plays three ways:
//   SHOW   "canvas:<id>"        directed: cuts between the plate and the world by the song's sections
//   PLATE  "canvas-plate:<id>"  2.5D — the picture as a living relief, its shapes morphing with the music
//   WORLD  "canvas-world:<id>"  3D — the picture rebuilt as a place the director flies through
// Pure data (no three.js, no DOM) so the scene catalog, mode maps and pickers can read it anywhere.
// To add an image: see docs/FLUX_CANVAS.md.
import type { FluxSceneInfo } from './fluxNode';

export interface CanvasImage { id: string; name: string; mood: string; plate: string; world: string }

export const FLUX_CANVAS_IMAGES: CanvasImage[] = [
  { id: 'ember-bark', name: 'Ember Bark', mood: 'Warm · grounded', plate: 'Copper and gold strata stream around the bark; the gold veins melt and glow with the bass, embers lift on the hats.', world: 'A canyon of copper strata under floating bark slabs and distant rock islands, molten gold veins and a rising ember storm.' },
  { id: 'prism-silk', name: 'Prism Silk', mood: 'Bright · flowing', plate: 'The chrome ribbons flow along their own folds, iridescence turns with the mids, light sweeps the glass on the kick.', world: 'Sixty iridescent silk ribbons fluttering to the music between drifting glass panes, giant arcs of silk across the sky.' },
  { id: 'neon-orbit', name: 'Neon Orbit', mood: 'Electric · club', plate: 'Light races along the neon strands, the crystals flash with the hats and the swirl tightens on the bass.', world: 'Ninety orbiting light trails around a shell of holographic crystals inside giant rings of light; drops blow it apart.' },
  { id: 'pastel-veil', name: 'Pastel Veil', mood: 'Soft · worship', plate: 'Silk and glass discs drift and breathe; a pearl sheen travels with the mids.', world: 'Layers of pastel silk and floating glass discs receding into a pale, luminous distance.' },
  { id: 'verdant-cells', name: 'Verdant Grove', mood: 'Organic · alive', plate: 'The fronds sway along their grain and the cell membranes light up like bioluminescence on the bass.', world: 'Living leaves that pulse like tissue on the beat — swelling, contracting, jiggling like goo — against rigid marble and stone.' },
  { id: 'white-mist', name: 'White Mist', mood: 'Airy · calm', plate: 'The smoke streams with the wind; it thickens with the mids and catches cold light on the hats.', world: 'Sheer veils blowing in a wind that is the music — gusts on the kick, a gale on the drop — through drifting mist.' },
  { id: 'bubble-drift', name: 'Bubble Drift', mood: 'Light · playful', plate: 'The pastel field shimmers and the bubbles float up, wobbling on every kick.', world: 'Bubbles near and far with swirling soap film, the world refracted inside them; they wobble on the kick.' },
  { id: 'resin-river', name: 'Resin River', mood: 'Rich · groove', plate: 'The resin rivers flow through still wood grain, glossy highlights sliding with the mids.', world: 'Ride a river of marbled resin between wood-grain banks; it surges with the bass and splashes on the kick.' },
  { id: 'fire-crystals', name: 'Fire Crystals', mood: 'Intense · drop', plate: 'The crystal shards flare on the bass, sparks blaze on the hats, heat ripples across everything.', world: 'A galaxy of faceted crystals that re-form into new geometry on the beat, each to its own part of the music.' },
  { id: 'tidal-glass', name: 'Tidal Glass', mood: 'Fluid · deep', plate: 'The glass waves roll along their crests; ripples ring out from the kick.', world: 'An open ocean of iridescent glass waves that churns with the music; foam breaks and spray leaps on the kick.' },
  { id: 'stone-linen', name: 'Stone & Linen', mood: 'Minimal · elegant', plate: 'The stone and linen shapes morph and breathe in depth; each colour region lights with its own band.', world: 'Kinetic walls of stone and linen tiles, each moving on its own axis to the music; the drop throws them apart.' },
  { id: 'peach-satin', name: 'Peach Satin', mood: 'Warm · gentle', plate: 'Satin folds ripple with the mids and a warm sheen glides across; pearls float in front.', world: 'Vast peach satin folds rolling under soft light, ribbons and pearls drifting between them.' },
];

export type CanvasWay = 'show' | 'plate' | 'world';
export const canvasShowId = (id: string) => `canvas:${id}` as const;
export const canvasPlateId = (id: string) => `canvas-plate:${id}` as const;
export const canvasWorldId = (id: string) => `canvas-world:${id}` as const;
export const canvasSceneId = (id: string, way: CanvasWay) => way === 'show' ? canvasShowId(id) : way === 'plate' ? canvasPlateId(id) : canvasWorldId(id);
export const isCanvasScene = (scene: string) => /^canvas(-plate|-world)?:/.test(scene);

/** The visualizer mode string for an image + way, e.g. FLUX_CANVAS_EMBER_BARK, FLUX_CANVAS_EMBER_BARK_PLATE. */
export const canvasMode = (id: string, way: CanvasWay) => `FLUX_CANVAS_${id.toUpperCase().replace(/-/g, '_')}${way === 'show' ? '' : way === 'plate' ? '_PLATE' : '_WORLD'}`;

export const FLUX_CANVAS_WAYS: CanvasWay[] = ['show', 'plate', 'world'];

/** Catalog entries, in the order they're appended to the platform's mode list (show, plate, world per image). */
export const FLUX_CANVAS_SCENES: FluxSceneInfo[] = FLUX_CANVAS_IMAGES.flatMap(img => [
  { id: canvasShowId(img.id) as any, name: img.name, cat: 'Canvas', built: true, line: `${img.mood}. Directed: the picture for the quiet sections, its 3D world for the drops. ${img.world}` },
  { id: canvasPlateId(img.id) as any, name: `${img.name} · 2.5D`, cat: 'Canvas', built: true, line: img.plate },
  { id: canvasWorldId(img.id) as any, name: `${img.name} · 3D`, cat: 'Canvas', built: true, line: img.world },
]);
