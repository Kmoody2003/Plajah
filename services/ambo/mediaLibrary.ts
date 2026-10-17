// mediaLibrary — the things an operator drags onto a layer.
//
// Three kinds, deliberately unified so the editor has one grid and one
// drag-and-drop path:
//   · GENERATORS — Pixels' GLSL backgrounds. Zero files, zero storage, no
//     licensing, and they never go missing the week someone tidies a drive.
//     This is the single biggest advantage over a stock-loop workflow.
//   · PROPS      — lower thirds, bugs, logos. Live on their own layer, so they
//     come and go without touching the slide.
//   · MEDIA      — the church's own images, videos and audio.

import type { LayerContent, LayerSlot } from './showModel';
import { STAGE_RIGS, STAGE_TIER_ENERGY } from '../../components/plajahPixels/engine/core/stageRigs';

export interface LibraryItem {
  id: string;
  name: string;
  /** Which layer this naturally lands on when dropped. */
  slot: LayerSlot;
  content: LayerContent;
  /** Grouping in the browser. */
  category: string;
  /** Still or poster for the grid. Generators render their own preview. */
  thumb?: string;
  tags?: string[];
}

// ── Generators — every mode that actually exists in Pixels ──────────────────
//
// Names are the operator's, not the shader's: nobody browsing for a background
// mid-service is looking for "STUDIO_KINETIC".

interface GenDef { mode: string; name: string; category: string; tags: string[]; }

const GENERATORS: GenDef[] = [
  { mode: 'STUDIO_AURORA',  name: 'Aurora',        category: 'Atmosphere', tags: ['calm', 'worship', 'slow'] },
  { mode: 'STUDIO_NEBULA',  name: 'Deep Nebula',   category: 'Atmosphere', tags: ['space', 'calm'] },
  { mode: 'NEBULA',         name: 'Nebula',        category: 'Atmosphere', tags: ['space'] },
  { mode: 'COSMIC',         name: 'Cosmic',        category: 'Atmosphere', tags: ['space', 'bright'] },
  { mode: 'LIQUID',         name: 'Liquid Light',  category: 'Atmosphere', tags: ['flow', 'calm', 'worship'] },
  { mode: 'STUDIO_RIPPLE',  name: 'Ripple',        category: 'Atmosphere', tags: ['water', 'calm'] },
  { mode: 'LUMINANCE',      name: 'Luminance',     category: 'Atmosphere', tags: ['soft', 'light'] },

  { mode: 'STORM',          name: 'Storm',         category: 'Energy',     tags: ['dark', 'dramatic'] },
  { mode: 'PARTICLES',      name: 'Particles',     category: 'Energy',     tags: ['motion'] },
  { mode: 'STUDIO_GRAVITY', name: 'Gravity',       category: 'Energy',     tags: ['motion', 'dark'] },
  { mode: 'STUDIO_KINETIC', name: 'Kinetic',       category: 'Energy',     tags: ['fast', 'youth'] },
  { mode: 'VORTEX',         name: 'Vortex',        category: 'Energy',     tags: ['fast'] },
  { mode: 'TUNNEL',         name: 'Tunnel',        category: 'Energy',     tags: ['fast', 'youth'] },

  { mode: 'STUDIO_BAUHAUS', name: 'Bauhaus',       category: 'Graphic',    tags: ['clean', 'geometric'] },
  { mode: 'STUDIO_CHROME',  name: 'Chrome',        category: 'Graphic',    tags: ['clean', 'bright'] },
  { mode: 'RETROGRID',      name: 'Retro Grid',    category: 'Graphic',    tags: ['youth', 'retro'] },
  { mode: 'KALEIDOSCOPE',   name: 'Kaleidoscope',  category: 'Graphic',    tags: ['pattern'] },
  { mode: 'STAGE',          name: 'Stage Wash',    category: 'Graphic',    tags: ['lights'] },

  { mode: 'WAVEFORM',       name: 'Waveform',      category: 'Reactive',   tags: ['audio', 'music'] },
  { mode: 'SPECTRUM',       name: 'Spectrum',      category: 'Reactive',   tags: ['audio', 'music'] },
  { mode: 'POLAR_DRIFT',    name: 'Polar Drift',   category: 'Reactive',   tags: ['audio', 'music', 'dark', 'space', 'energy:medium'] },

  // Cosmos: photographic nebulae and aurorae, calm, breathing with the music.
  { mode: 'COSMIC_PILLARS',     name: 'Pillars of Creation', category: 'Cosmos', tags: ['space', 'nebula', 'calm', 'worship', 'audio', 'energy:low'] },
  { mode: 'COSMIC_PILLARS_DIRECTOR', name: 'Pillars of Creation · Director', category: 'Cosmos', tags: ['space', 'nebula', 'calm', 'worship', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_AURORA_VEIL', name: 'Aurora Veil',         category: 'Cosmos', tags: ['aurora', 'night', 'calm', 'worship', 'audio', 'energy:low'] },
  { mode: 'COSMIC_AURORA_VEIL_DIRECTOR', name: 'Aurora Veil · Director', category: 'Cosmos', tags: ['aurora', 'night', 'calm', 'worship', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_ORION',       name: 'Orion Bloom',         category: 'Cosmos', tags: ['space', 'nebula', 'bright', 'audio', 'energy:medium'] },
  { mode: 'COSMIC_ORION_DIRECTOR', name: 'Orion Bloom · Director', category: 'Cosmos', tags: ['space', 'nebula', 'bright', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_REMNANT',     name: 'Veil Remnant',        category: 'Cosmos', tags: ['space', 'nebula', 'dark', 'audio', 'energy:medium'] },
  { mode: 'COSMIC_REMNANT_DIRECTOR', name: 'Veil Remnant · Director', category: 'Cosmos', tags: ['space', 'nebula', 'dark', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_GALAXY',      name: 'Galactic Spiral',     category: 'Cosmos', tags: ['space', 'galaxy', 'calm', 'audio', 'energy:low'] },
  { mode: 'COSMIC_GALAXY_DIRECTOR', name: 'Galactic Spiral · Director', category: 'Cosmos', tags: ['space', 'galaxy', 'calm', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_CORONA',      name: 'Aurora Corona',       category: 'Cosmos', tags: ['aurora', 'night', 'worship', 'audio', 'energy:medium'] },
  { mode: 'COSMIC_CORONA_DIRECTOR', name: 'Aurora Corona · Director', category: 'Cosmos', tags: ['aurora', 'night', 'worship', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_MILKYWAY',    name: 'Milky River',         category: 'Cosmos', tags: ['space', 'night', 'calm', 'worship', 'audio', 'energy:low'] },
  { mode: 'COSMIC_MILKYWAY_DIRECTOR', name: 'Milky River · Director', category: 'Cosmos', tags: ['space', 'night', 'calm', 'worship', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_PLANETARY',   name: 'Planetary Eye',       category: 'Cosmos', tags: ['space', 'nebula', 'calm', 'audio', 'energy:low'] },
  { mode: 'COSMIC_PLANETARY_DIRECTOR', name: 'Planetary Eye · Director', category: 'Cosmos', tags: ['space', 'nebula', 'calm', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_NURSERY',     name: 'Stellar Nursery',     category: 'Cosmos', tags: ['space', 'nebula', 'motion', 'audio', 'energy:medium'] },
  { mode: 'COSMIC_NURSERY_DIRECTOR', name: 'Stellar Nursery · Director', category: 'Cosmos', tags: ['space', 'nebula', 'motion', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'COSMIC_AURORA_LAKE', name: 'Aurora Lake',         category: 'Cosmos', tags: ['aurora', 'water', 'calm', 'worship', 'audio', 'energy:low'] },
  { mode: 'COSMIC_AURORA_LAKE_DIRECTOR', name: 'Aurora Lake · Director', category: 'Cosmos', tags: ['aurora', 'water', 'calm', 'worship', 'audio', 'energy:medium', 'director', 'camera'] },

  // Fluid: vibrant colours mixing like liquids in a vessel.
  { mode: 'FLUID_INK',        name: 'Ink Bloom',        category: 'Fluid', tags: ['flow', 'ink', 'calm', 'audio', 'energy:low'] },
  { mode: 'FLUID_INK_DIRECTOR', name: 'Ink Bloom · Director', category: 'Fluid', tags: ['flow', 'ink', 'calm', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_MARBLE',     name: 'Marbled Pour',     category: 'Fluid', tags: ['flow', 'paint', 'bright', 'audio', 'energy:low'] },
  { mode: 'FLUID_MARBLE_DIRECTOR', name: 'Marbled Pour · Director', category: 'Fluid', tags: ['flow', 'paint', 'bright', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_LAMP',       name: 'Lumen Lamp',       category: 'Fluid', tags: ['flow', 'retro', 'calm', 'audio', 'energy:low'] },
  { mode: 'FLUID_LAMP_DIRECTOR', name: 'Lumen Lamp · Director', category: 'Fluid', tags: ['flow', 'retro', 'calm', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_OILFILM',    name: 'Iridescent Oil',   category: 'Fluid', tags: ['flow', 'iridescent', 'audio', 'energy:medium'] },
  { mode: 'FLUID_OILFILM_DIRECTOR', name: 'Iridescent Oil · Director', category: 'Fluid', tags: ['flow', 'iridescent', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_VORTEX',     name: 'Stirred Dye',      category: 'Fluid', tags: ['flow', 'swirl', 'audio', 'energy:medium'] },
  { mode: 'FLUID_VORTEX_DIRECTOR', name: 'Stirred Dye · Director', category: 'Fluid', tags: ['flow', 'swirl', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_DENSITY',    name: 'Density Column',   category: 'Fluid', tags: ['flow', 'layers', 'calm', 'audio', 'energy:low'] },
  { mode: 'FLUID_DENSITY_DIRECTOR', name: 'Density Column · Director', category: 'Fluid', tags: ['flow', 'layers', 'calm', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_SILK',       name: 'Liquid Silk',      category: 'Fluid', tags: ['flow', 'satin', 'calm', 'worship', 'audio', 'energy:low'] },
  { mode: 'FLUID_SILK_DIRECTOR', name: 'Liquid Silk · Director', category: 'Fluid', tags: ['flow', 'satin', 'calm', 'worship', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_SHEAR',      name: 'Shear Billows',    category: 'Fluid', tags: ['flow', 'waves', 'audio', 'energy:medium'] },
  { mode: 'FLUID_SHEAR_DIRECTOR', name: 'Shear Billows · Director', category: 'Fluid', tags: ['flow', 'waves', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_CONVECTION', name: 'Convection Cells', category: 'Fluid', tags: ['flow', 'warm', 'audio', 'energy:medium'] },
  { mode: 'FLUID_CONVECTION_DIRECTOR', name: 'Convection Cells · Director', category: 'Fluid', tags: ['flow', 'warm', 'audio', 'energy:medium', 'director', 'camera'] },
  { mode: 'FLUID_CAUSTIC',    name: 'Caustic Bowl',     category: 'Fluid', tags: ['flow', 'water', 'calm', 'audio', 'energy:low'] },
  { mode: 'FLUID_CAUSTIC_DIRECTOR', name: 'Caustic Bowl · Director', category: 'Fluid', tags: ['flow', 'water', 'calm', 'audio', 'energy:medium', 'director', 'camera'] },

  // Planes: colourful, textured sheets that fold and interleave with the music (calm to mid tempo),
  // and Optics: abstract studies of light — halo, refraction, lens ghosts, leaks, caustics, glass.
  ...([
    ['Planes', 'PLANES_PLEATS',   'Origami Pleats',      ['paper', 'fold', 'calm', 'worship']],
    ['Planes', 'PLANES_WEAVE',    'Silk Loom',           ['satin', 'weave', 'calm', 'worship']],
    ['Planes', 'PLANES_STAINED',  'Stained Sashes',      ['glass', 'fold', 'bright']],
    ['Planes', 'PLANES_TIDE',     'Paper Tide',          ['paper', 'water', 'calm', 'worship']],
    ['Planes', 'PLANES_FAN',      'Fan Vault',           ['paper', 'fold', 'calm', 'worship']],
    ['Planes', 'PLANES_CHEVRON',  'Chevron Cascade',     ['foil', 'fold', 'metal']],
    ['Planes', 'PLANES_LATTICE',  'Kinetic Lattice',     ['tiles', 'motion', 'clean']],
    ['Planes', 'PLANES_LAYERS',   'Paper Lightbox',      ['paper', 'layers', 'calm', 'worship']],
    ['Planes', 'PLANES_BRAID',    'Satin Braid',         ['satin', 'braid', 'calm', 'worship']],
    ['Planes', 'PLANES_TAPESTRY', 'Crossed Tapestry',    ['fold', 'night', 'glitter']],
    ['Optics', 'OPTIC_HALO',      'Ice Halo',            ['halo', 'sky', 'calm', 'worship']],
    ['Optics', 'OPTIC_PRISM',     'Prism Dispersion',    ['refraction', 'spectrum', 'calm']],
    ['Optics', 'OPTIC_FLARE',     'Lens Reticulation',   ['flare', 'lens', 'calm']],
    ['Optics', 'OPTIC_LEAKS',     'Film Light Leaks',    ['leaks', 'film', 'warm', 'calm']],
    ['Optics', 'OPTIC_STREAKS',   'Anamorphic Bokeh',    ['bokeh', 'flare', 'night', 'calm', 'worship']],
    ['Optics', 'OPTIC_CAUSTIC',   'Water-Glass Caustic', ['caustic', 'glass', 'warm', 'calm']],
    ['Optics', 'OPTIC_FILM',      'Soap Film',           ['iridescent', 'interference', 'calm']],
    ['Optics', 'OPTIC_FLUTED',    'Fluted Glass',        ['glass', 'refraction', 'calm', 'worship']],
    ['Optics', 'OPTIC_RAYS',      'Dust Shafts',         ['rays', 'dust', 'calm', 'worship']],
    ['Optics', 'OPTIC_SPHERE',    'Crystal Sphere',      ['glass', 'refraction', 'calm']],
  ] as Array<[string, string, string, string[]]>).flatMap(([category, mode, name, tags]): GenDef[] => [
    { mode, name, category, tags: [...tags, 'audio', 'energy:low'] },
    { mode: `${mode}_DIRECTOR`, name: `${name} · Director`, category, tags: [...tags, 'audio', 'energy:medium', 'director', 'camera'] },
  ]),

  // Concert stages: photoreal arenas, festival main stages, warehouses and theatres with
  // virtual lighting rigs (lasers, beams, strobes, blinders, pyro) cued by the music.
  // Each rig comes four ways: the show from front of house, a Director version (a 3D camera cutting
  // between crowd, crane, long-lens, wing, high and reverse shots on the bar lines), an Empty stage
  // (no performers, locked off) to composite real talent onto, and the Empty stage shot by the Director.
  ...STAGE_RIGS.flatMap((r): GenDef[] => {
    const tags = ['stage', 'concert', 'lights', 'audio', r.venue, r.tier, `energy:${STAGE_TIER_ENERGY[r.tier]}`, ...(r.tier === 'mellow' ? ['calm'] : [])];
    return [
      { mode: r.mode, name: r.name, category: 'Concert Stage', tags },
      { mode: r.mode + '_DIRECTOR', name: `${r.name} · Director`, category: 'Concert Stage', tags: [...tags, 'director', 'camera'] },
      { mode: r.mode + '_EMPTY', name: `${r.name} · Empty stage`, category: 'Concert Stage', tags: [...tags, 'empty stage', 'set extension', 'backdrop'] },
      { mode: r.mode + '_EMPTY_DIRECTOR', name: `${r.name} · Empty stage · Director`, category: 'Concert Stage', tags: [...tags, 'empty stage', 'backdrop', 'director', 'camera'] },
    ];
  }),
];

export const GENERATOR_ITEMS: LibraryItem[] = GENERATORS.map(g => ({
  id: `gen_${g.mode}`,
  name: g.name,
  slot: 'background',
  category: g.category,
  tags: g.tags,
  content: { kind: 'GENERATOR', mode: g.mode },
}));

// ── Props — the lower-third / bug library ───────────────────────────────────
//
// Built as text+shape layers rather than baked images, so a church's own colour
// and typeface apply everywhere at once and nothing needs re-exporting.

export interface PropTemplate {
  id: string;
  name: string;
  category: 'Lower third' | 'Bug' | 'Fullscreen' | 'Ticker';
  /** Where it sits, normalised. */
  rect: { x: number; y: number; w: number; h: number };
  align: 'left' | 'center' | 'right';
  fields: Array<'title' | 'subtitle'>;
}

export const PROP_TEMPLATES: PropTemplate[] = [
  { id: 'lt_name',    name: 'Name & role',     category: 'Lower third', rect: { x: 0.05, y: 0.74, w: 0.55, h: 0.16 }, align: 'left',   fields: ['title', 'subtitle'] },
  { id: 'lt_minimal', name: 'Minimal bar',     category: 'Lower third', rect: { x: 0.05, y: 0.80, w: 0.45, h: 0.10 }, align: 'left',   fields: ['title'] },
  { id: 'lt_centre',  name: 'Centred title',   category: 'Lower third', rect: { x: 0.20, y: 0.78, w: 0.60, h: 0.14 }, align: 'center', fields: ['title', 'subtitle'] },
  { id: 'bug_corner', name: 'Corner logo',     category: 'Bug',         rect: { x: 0.86, y: 0.04, w: 0.10, h: 0.10 }, align: 'center', fields: [] },
  { id: 'bug_live',   name: 'Live badge',      category: 'Bug',         rect: { x: 0.04, y: 0.04, w: 0.12, h: 0.06 }, align: 'center', fields: ['title'] },
  { id: 'full_verse', name: 'Fullscreen text', category: 'Fullscreen',  rect: { x: 0.10, y: 0.20, w: 0.80, h: 0.60 }, align: 'center', fields: ['title', 'subtitle'] },
  { id: 'ticker',     name: 'Ticker',          category: 'Ticker',      rect: { x: 0.00, y: 0.92, w: 1.00, h: 0.08 }, align: 'left',   fields: ['title'] },
];

/** Turn a prop template plus its text into a real layer. */
export function propToLayer(t: PropTemplate, title = '', subtitle = ''): LayerContent {
  const blocks = [] as Array<{ text: string; role: 'title' | 'caption' }>;
  if (t.fields.includes('title')) blocks.push({ text: title, role: 'title' });
  if (t.fields.includes('subtitle')) blocks.push({ text: subtitle, role: 'caption' });
  return {
    kind: 'TEXT',
    blocks: blocks.length ? blocks : [{ text: title }],
    style: { align: t.align, valign: 'middle', size: 54, shadow: true },
  };
}

export const PROP_ITEMS: LibraryItem[] = PROP_TEMPLATES.map(t => ({
  id: `prop_${t.id}`,
  name: t.name,
  slot: 'prop',
  category: t.category,
  content: propToLayer(t, t.name),
  tags: ['prop'],
}));

// ── Scripture — drops onto its OWN layer, above the slide ───────────────────
//
// This is the difference between Ambo and a slide tool: a verse composites over
// whatever is already on screen. A sermon point can stay visible under the
// reading, and clearing the verse leaves the point standing.

export const SCRIPTURE_ITEMS: LibraryItem[] = [
  {
    id: 'scr_live',
    name: 'Live verse',
    slot: 'scripture',
    category: 'Scripture',
    tags: ['bible', 'verse', 'kairos'],
    content: { kind: 'SCRIPTURE', refId: '', lines: [], reference: '' },
  },
  {
    id: 'scr_ref_only',
    name: 'Reference only',
    slot: 'scripture',
    category: 'Scripture',
    tags: ['bible', 'citation'],
    content: { kind: 'TEXT', blocks: [{ text: '', role: 'reference' }], style: { align: 'right', valign: 'bottom', size: 40 } },
  },
];

// ── The church's own media ──────────────────────────────────────────────────

export type MediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'LOTTIE';

export function mediaItem(id: string, name: string, kind: MediaKind, src: string, thumb?: string): LibraryItem {
  const content: LayerContent =
    kind === 'IMAGE' ? { kind: 'IMAGE', src, fit: 'cover' }
    : kind === 'VIDEO' ? { kind: 'VIDEO', src, loop: true, muted: true }
    : kind === 'AUDIO' ? { kind: 'AUDIO', src, volume: 1 }
    : { kind: 'LOTTIE', src, loop: true };

  return {
    id, name, thumb,
    slot: kind === 'AUDIO' ? 'overlay' : kind === 'LOTTIE' ? 'prop' : 'background',
    category: kind === 'IMAGE' ? 'Stills' : kind === 'VIDEO' ? 'Loops' : kind === 'AUDIO' ? 'Audio' : 'Motion graphics',
    content,
    tags: [kind.toLowerCase()],
  };
}

/**
 * The ONE extension -> kind table. Folder scans (services/ambo/mediaFolders.ts), the
 * Media tab and every drop handler use it, so a file is never "media" in one place and
 * ignored in another.
 */
export type MediaKindOrDoc = MediaKind | 'DOC';
export const MEDIA_EXTENSIONS: Record<MediaKindOrDoc, readonly string[]> = {
  IMAGE: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'tif', 'tiff'],
  VIDEO: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'mpg', 'mpeg', 'wmv'],
  AUDIO: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aiff', 'aif', 'wma'],
  LOTTIE: ['lottie', 'json'],
  DOC: ['pdf', 'ppt', 'pptx', 'key', 'odp'],
};

function extOf(nameOrUrl: string): string {
  const base = nameOrUrl.split('?')[0].split('#')[0];
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/**
 * Classify by filename, falling back to the MIME type (OS drops often carry one).
 * `.json` only counts as Lottie when `allowJson` (a drop on purpose); a folder scan
 * passes false so config files do not flood the grid.
 */
export function classifyFile(nameOrUrl: string, mime = '', allowJson = true): MediaKindOrDoc | null {
  const ext = extOf(nameOrUrl);
  for (const kind of ['IMAGE', 'VIDEO', 'AUDIO', 'LOTTIE', 'DOC'] as MediaKindOrDoc[]) {
    if (kind === 'LOTTIE' && ext === 'json' && !allowJson) continue;
    if (ext && MEDIA_EXTENSIONS[kind].includes(ext)) return kind;
  }
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'IMAGE';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m.startsWith('audio/')) return 'AUDIO';
  if (m === 'application/pdf') return 'DOC';
  return null;
}

/** Guess the kind from a filename — the drop handler's job. (DOC files are not layer media.) */
export function kindForFile(nameOrUrl: string, mime = ''): MediaKind | null {
  const k = classifyFile(nameOrUrl, mime);
  return k && k !== 'DOC' ? k : null;
}

// ── Browsing ────────────────────────────────────────────────────────────────

export function searchLibrary(items: LibraryItem[], query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.category.toLowerCase().includes(q) ||
    (i.tags ?? []).some(t => t.includes(q)));
}

export function categoriesOf(items: LibraryItem[]): string[] {
  return [...new Set(items.map(i => i.category))];
}
