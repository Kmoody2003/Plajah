// storybook/style/kit — the StyleKit: everything a designer program needs to know about HOW a book is drawn,
// separated from WHAT is drawn (the spread's brief). One kit per book; every spread's program reads it, so a
// 32-page book stays in one medium, one palette, one line and one light (CHILDRENS_BOOK_ART_DIRECTION.md rules 5-8).
//
// A kit comes from one of three places:
//   • a showcase book: its medium is already a hand-tuned kit (feltKit, watercolorKit, cut paper, linocut...),
//     so SHOWCASE_KITS below transcribes those kits' real constants (FT, SP, FP, palette tables in the designers);
//   • the author's example images: style/extract.ts measures them (palette, edges, texture, saturation) and
//     kitFromStats() maps the numbers onto these fields deterministically (no key needed);
//   • an optional art-director pass (style/artDirector.ts) that turns the numbers + the author's words into kit
//     choices through the Art Council. It may only CHOOSE among valid values; validateKit() clamps whatever it says.
//
// Everything here is plain JSON (persisted inside the StoryBook manifest, small: ~1.5 KB).
import type { FontKey } from '../../tela/telaFonts';

/** Material presets the geometry engine can render (services/tela/geometry/materials/filters.ts) plus 'flat' and 'cutpaper' (geometry, no filter). */
export type KitMaterial = 'watercolor' | 'gouache' | 'crayon' | 'pencil' | 'chalk' | 'felt' | 'linocut' | 'riso' | 'ink' | 'flat' | 'cutpaper';
export const KIT_MATERIALS: KitMaterial[] = ['watercolor', 'gouache', 'crayon', 'pencil', 'chalk', 'felt', 'linocut', 'riso', 'ink', 'flat', 'cutpaper'];
export type ShapeLanguage = 'organic' | 'circles' | 'columns' | 'arcs' | 'blocks' | 'triangles';
export type TextPanel = 'none' | 'patch' | 'sheet' | 'banner' | 'cloud' | 'band';

export interface KitPalette {
  /** Sky / backdrop colours, top to horizon. */
  sky: string[];
  /** Ground / environment colours, far to near. */
  ground: string[];
  /** Character body / skin tones the kit favours (the bible palette always wins for a named character). */
  skin: string[];
  /** Saturated accents (>= 3 clearly different hues, art direction rule 5). */
  accents: string[];
  /** The one deep dark (line + type ink). */
  ink: string;
  /** The bright light / paper colour. */
  paper: string;
  /** Night ground for bedtime / space pages. */
  night: string;
}

export interface StyleKit {
  id: string;
  name: string;
  version: 1;
  /** Where the kit came from (shown in the studio; drives what "re-extract" means). */
  source: { kind: 'showcase' | 'images' | 'preset' | 'manual'; ref?: string; examples?: number };
  palette: KitPalette;
  line: {
    /** Contour weight in px at a 1024 px page width (scaled with the page). 0 = no contour. */
    weight: number;
    /** 0..1 hand wobble on contours. */
    wobble: number;
    /** Width profile of the contour. */
    taper: 'none' | 'ink' | 'brush' | 'taper';
    /** Contour colour rule. */
    color: 'ink' | 'darker-fill' | 'none';
  };
  shape: { /** 0 = sharp corners, 1 = everything rounded. */ roundness: number; /** 0 = organic, 1 = geometric. */ geometric: number; language: ShapeLanguage };
  texture: {
    material: KitMaterial;
    /** Material knobs passed to Scene.material (see GEOMETRY_ENGINE.md "Paint and materials"). */
    params?: Record<string, number>;
    /** 0..1 paper grain over the whole page. */
    grain: number;
    /** Optional mark-making overlay. */
    overlay: 'none' | 'halftone' | 'stipple' | 'hatch' | 'flecks';
  };
  lighting: {
    /** Where the light comes FROM, degrees (225 = upper-left on screen). One light per book (rule 7). */
    direction: number;
    /** 0..1 form-shadow strength. */
    contrast: number;
    shadow: 'none' | 'soft' | 'cast' | 'cel';
    /** 0..1 how much glow/bloom the light source gets (candle, sun, bioluminescence). */
    glow: number;
    /** -1 cool .. +1 warm colour temperature of lights (shadows go the other way). */
    temperature: number;
  };
  composition: {
    horizon: 'low' | 'mid' | 'high';
    /** 0..1 how hard pages play with scale (tiny hero / giant close-up). */
    scaleContrast: number;
    bleed: 'full' | 'vignette' | 'mixed';
    /** 0..1 preference for mirror symmetry (folk papercut = high). */
    symmetry: number;
  };
  type: {
    display: FontKey;
    body: FontKey;
    bodyWeight: number;
    displayWeight: number;
    /** Body size range in px at 1024 wide (>= 22 for picture books, art direction rule 4). */
    sizeMax: number;
    sizeMin: number;
    leading: number;
    ink: string;
    /** What the live text sits on inside the art (never a plain box on a plain ground, rule 4). */
    panel: TextPanel;
    panelFill: string;
  };
  /** 0..1 detail density (how many props / flecks / leaves a page carries). */
  detail: number;
  /** 0..1 overall saturation the palette is pushed to. */
  saturation: number;
  /** When this kit is a showcase book's own medium, the ported designer that draws it natively. */
  designer?: { templateId: string };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const HEX = /^#[0-9a-f]{6}$/i;
const hexOr = (c: unknown, d: string) => (typeof c === 'string' && HEX.test(c) ? c : d);

/** Clamp every field to a valid value (anything an LLM or an old manifest says passes through this). */
export function validateKit(k: StyleKit): StyleKit {
  const pal = (a: unknown, d: string[]) => { const v = Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && HEX.test(x)).slice(0, 8) : []; return v.length ? v : d; };
  return {
    ...k, version: 1,
    palette: {
      sky: pal(k.palette?.sky, ['#8fb8d8', '#f3d9b6']), ground: pal(k.palette?.ground, ['#6a9b62', '#3f8243']), skin: pal(k.palette?.skin, ['#c98a54']),
      accents: pal(k.palette?.accents, ['#e5517c', '#f5b800', '#2e4fd0']), ink: hexOr(k.palette?.ink, '#2a1e1a'), paper: hexOr(k.palette?.paper, '#fbf6ec'), night: hexOr(k.palette?.night, '#16113e'),
    },
    line: { weight: Math.max(0, Math.min(12, k.line?.weight ?? 2.6)), wobble: clamp01(k.line?.wobble ?? .2), taper: k.line?.taper ?? 'ink', color: k.line?.color ?? 'ink' },
    shape: { roundness: clamp01(k.shape?.roundness ?? .6), geometric: clamp01(k.shape?.geometric ?? .3), language: k.shape?.language ?? 'organic' },
    texture: { material: KIT_MATERIALS.includes(k.texture?.material) ? k.texture.material : 'gouache', params: k.texture?.params, grain: clamp01(k.texture?.grain ?? .3), overlay: k.texture?.overlay ?? 'none' },
    lighting: { direction: ((k.lighting?.direction ?? 225) % 360 + 360) % 360, contrast: clamp01(k.lighting?.contrast ?? .5), shadow: k.lighting?.shadow ?? 'soft', glow: clamp01(k.lighting?.glow ?? .3), temperature: Math.max(-1, Math.min(1, k.lighting?.temperature ?? .4)) },
    composition: { horizon: k.composition?.horizon ?? 'mid', scaleContrast: clamp01(k.composition?.scaleContrast ?? .5), bleed: k.composition?.bleed ?? 'full', symmetry: clamp01(k.composition?.symmetry ?? .1) },
    type: {
      display: k.type?.display ?? 'fredoka', body: k.type?.body ?? 'andika', bodyWeight: k.type?.bodyWeight ?? 600, displayWeight: k.type?.displayWeight ?? 800,
      sizeMax: Math.max(18, Math.min(96, k.type?.sizeMax ?? 40)), sizeMin: Math.max(14, Math.min(k.type?.sizeMax ?? 40, k.type?.sizeMin ?? 22)), leading: Math.max(1, Math.min(2, k.type?.leading ?? 1.35)),
      ink: hexOr(k.type?.ink, '#2a1e1a'), panel: k.type?.panel ?? 'patch', panelFill: hexOr(k.type?.panelFill, '#fbf6ec'),
    },
    detail: clamp01(k.detail ?? .5), saturation: clamp01(k.saturation ?? .6),
  };
}

// ───────────────────────────── the six showcase kits (transcribed from the designers) ─────────────────────────────

const kit = (k: Omit<StyleKit, 'version'>): StyleKit => ({ ...k, version: 1 });

/** Moon Blanket: felt & stitched textile (feltKit.ts FT palette, quiltGround, satin-stitch Sniglet). */
const FELT = kit({
  id: 'kit-felt', name: 'Felt & stitched textile', source: { kind: 'showcase', ref: 'moon-blanket' },
  palette: { sky: ['#241F70', '#16113E'], ground: ['#17948A', '#0E6B68', '#972250'], skin: ['#C98B4B', '#F3E2C0'], accents: ['#E8A91C', '#EE6C8E', '#17948A', '#F0793E'], ink: '#1C1747', paper: '#F8EACB', night: '#16113E' },
  line: { weight: 2.6, wobble: .1, taper: 'none', color: 'darker-fill' },
  shape: { roundness: .9, geometric: .25, language: 'arcs' },
  texture: { material: 'felt', params: { fuzz: 1, fleck: .6, depth: .5 }, grain: .35, overlay: 'flecks' },
  lighting: { direction: 225, contrast: .45, shadow: 'soft', glow: .8, temperature: .7 },
  composition: { horizon: 'mid', scaleContrast: .7, bleed: 'full', symmetry: .2 },
  type: { display: 'sniglet', body: 'sniglet', bodyWeight: 800, displayWeight: 800, sizeMax: 54, sizeMin: 24, leading: 1.28, ink: '#1C1747', panel: 'patch', panelFill: '#F8EACB' },
  detail: .7, saturation: .6, designer: { templateId: 'story-bedtime' },
});
/** Orbit Party!: torn cut-paper collage, circles only (storybooksA SP palette, Fredoka 600 sheets). */
const CUTPAPER = kit({
  id: 'kit-cutpaper', name: 'Torn cut-paper collage', source: { kind: 'showcase', ref: 'orbit-party' },
  palette: { sky: ['#7000FF', '#2B0072'], ground: ['#0D0015'], skin: ['#FFFFFF', '#FFE58A'], accents: ['#FF0055', '#00FFCC', '#FFF200', '#FF8A00'], ink: '#0D0015', paper: '#FFFFFF', night: '#0D0015' },
  line: { weight: 0, wobble: .5, taper: 'none', color: 'none' },
  shape: { roundness: 1, geometric: .85, language: 'circles' },
  texture: { material: 'cutpaper', grain: .25, overlay: 'halftone' },
  lighting: { direction: 300, contrast: .5, shadow: 'cast', glow: .5, temperature: .5 },
  composition: { horizon: 'low', scaleContrast: .9, bleed: 'full', symmetry: .1 },
  type: { display: 'chango', body: 'fredoka', bodyWeight: 600, displayWeight: 400, sizeMax: 40, sizeMin: 22, leading: 1.38, ink: '#0D0015', panel: 'sheet', panelFill: '#FFFFFF' },
  detail: .6, saturation: 1, designer: { templateId: 'story-space' },
});
/** Little Fox, Big Trees: linocut / woodblock, off-register, columns + triangles (storybooksA FP palette). */
const LINOCUT = kit({
  id: 'kit-linocut', name: 'Linocut / woodblock', source: { kind: 'showcase', ref: 'little-fox-big-trees' },
  palette: { sky: ['#FFF3D6', '#FFD700'], ground: ['#0B3C1A', '#062A12', '#8B4513'], skin: ['#FF4500', '#B8651C'], accents: ['#FF4500', '#FFD700', '#ADFF2F'], ink: '#1E0B00', paper: '#FFF3D6', night: '#062A12' },
  line: { weight: 3.4, wobble: .35, taper: 'brush', color: 'ink' },
  shape: { roundness: .2, geometric: .8, language: 'triangles' },
  texture: { material: 'linocut', params: { gouge: .5, angle: 20, edge: 2 }, grain: .4, overlay: 'hatch' },
  lighting: { direction: 200, contrast: .7, shadow: 'cel', glow: .6, temperature: .8 },
  composition: { horizon: 'high', scaleContrast: .8, bleed: 'full', symmetry: .2 },
  type: { display: 'slackey', body: 'andika', bodyWeight: 700, displayWeight: 400, sizeMax: 38, sizeMin: 22, leading: 1.38, ink: '#1E0B00', panel: 'banner', panelFill: '#FFF3D6' },
  detail: .6, saturation: .95, designer: { templateId: 'story-forest' },
});
/** Below the Blue: watercolour (watercolorKit washes, blooms, wet edges, salt, pencil line). */
const WATERCOLOR = kit({
  id: 'kit-watercolor', name: 'Watercolour painting', source: { kind: 'showcase', ref: 'below-the-blue' },
  palette: { sky: ['#9FD3E6', '#2E4FD0'], ground: ['#26386E', '#1B2A55'], skin: ['#E5517C', '#F2B134'], accents: ['#E5517C', '#2E4FD0', '#2BB3A4', '#F2B134'], ink: '#26386E', paper: '#FBF6EC', night: '#121B3A' },
  line: { weight: 1.4, wobble: .55, taper: 'ink', color: 'darker-fill' },
  shape: { roundness: .8, geometric: .15, language: 'organic' },
  texture: { material: 'watercolor', params: { edge: 8, mottle: .5, grain: .4 }, grain: .5, overlay: 'none' },
  lighting: { direction: 250, contrast: .35, shadow: 'soft', glow: .7, temperature: -.2 },
  composition: { horizon: 'mid', scaleContrast: .7, bleed: 'mixed', symmetry: 0 },
  type: { display: 'fraunces', body: 'fraunces', bodyWeight: 500, displayWeight: 700, sizeMax: 34, sizeMin: 20, leading: 1.42, ink: '#26386E', panel: 'none', panelFill: '#FBF6EC' },
  detail: .6, saturation: .55, designer: { templateId: 'story-ocean' },
});
/** Beep Block Street: mid-century pop / screen print, 90-degree blocks (story-city). */
const POP = kit({
  id: 'kit-pop', name: 'Pop screen print', source: { kind: 'showcase', ref: 'beep-block-street' },
  palette: { sky: ['#1E88E5', '#FFC300'], ground: ['#1A1A1D', '#E5173F'], skin: ['#E5173F', '#00D68F'], accents: ['#E5173F', '#FFC300', '#1E88E5', '#00D68F'], ink: '#1A1A1D', paper: '#FFF6E5', night: '#1A1A1D' },
  line: { weight: 4, wobble: 0, taper: 'none', color: 'ink' },
  shape: { roundness: .15, geometric: 1, language: 'blocks' },
  texture: { material: 'riso', params: { grain: .5, offsetX: 3, offsetY: 2 }, grain: .3, overlay: 'halftone' },
  lighting: { direction: 270, contrast: .6, shadow: 'cel', glow: .3, temperature: .4 },
  composition: { horizon: 'mid', scaleContrast: .8, bleed: 'full', symmetry: .3 },
  type: { display: 'bungee', body: 'rubik', bodyWeight: 600, displayWeight: 400, sizeMax: 40, sizeMin: 22, leading: 1.38, ink: '#1A1A1D', panel: 'banner', panelFill: '#FFF6E5' },
  detail: .5, saturation: 1, designer: { templateId: 'story-city' },
});
/** The Golden Thread: folk papercut with gold, 45-degree triangles and mirror symmetry (story-folktale). */
const PAPERCUT = kit({
  id: 'kit-papercut', name: 'Folk papercut with gold', source: { kind: 'showcase', ref: 'golden-thread' },
  palette: { sky: ['#14505C', '#4A1525'], ground: ['#4A1525', '#C0392B'], skin: ['#E67E22', '#F1E6CF'], accents: ['#C0392B', '#E67E22', '#F1C40F', '#14505C'], ink: '#4A1525', paper: '#F1E6CF', night: '#14505C' },
  line: { weight: 0, wobble: .05, taper: 'none', color: 'none' },
  shape: { roundness: .3, geometric: .8, language: 'triangles' },
  texture: { material: 'flat', grain: .2, overlay: 'none' },
  lighting: { direction: 270, contrast: .3, shadow: 'cast', glow: .9, temperature: .9 },
  composition: { horizon: 'mid', scaleContrast: .5, bleed: 'full', symmetry: .9 },
  type: { display: 'almendraDisplay', body: 'andika', bodyWeight: 700, displayWeight: 400, sizeMax: 30, sizeMin: 20, leading: 1.38, ink: '#4A1525', panel: 'band', panelFill: '#F1E6CF' },
  detail: .7, saturation: .85, designer: { templateId: 'story-folktale' },
});
/** A neutral painterly gouache kit for new books with no examples yet (the geometry vignette's look). */
const GOUACHE = kit({
  id: 'kit-gouache', name: 'Painterly gouache', source: { kind: 'preset' },
  palette: { sky: ['#6fa6cf', '#a9cbdc', '#f6c79a'], ground: ['#8fcd6d', '#5a8f55', '#3f8243'], skin: ['#c98a54', '#f2d6b0'], accents: ['#e5517c', '#f5b800', '#2e7fd0', '#ef7d3b'], ink: '#3a2418', paper: '#fbf6ec', night: '#1d1a3f' },
  line: { weight: 2.4, wobble: .25, taper: 'ink', color: 'ink' },
  shape: { roundness: .75, geometric: .2, language: 'organic' },
  texture: { material: 'gouache', params: { streak: 0, mottle: .06, edge: 1.5 }, grain: .3, overlay: 'none' },
  lighting: { direction: 215, contrast: .55, shadow: 'soft', glow: .5, temperature: .6 },
  composition: { horizon: 'mid', scaleContrast: .6, bleed: 'full', symmetry: 0 },
  type: { display: 'fredoka', body: 'andika', bodyWeight: 700, displayWeight: 700, sizeMax: 40, sizeMin: 22, leading: 1.38, ink: '#2a1e1a', panel: 'cloud', panelFill: '#fffaf0' },
  detail: .55, saturation: .65,
});

export const SHOWCASE_KITS: Record<string, StyleKit> = {
  'story-bedtime': FELT, 'story-space': CUTPAPER, 'story-forest': LINOCUT, 'story-ocean': WATERCOLOR, 'story-city': POP, 'story-folktale': PAPERCUT,
};
export const PRESET_KITS: StyleKit[] = [FELT, CUTPAPER, LINOCUT, WATERCOLOR, POP, PAPERCUT, GOUACHE];
export const DEFAULT_KIT = GOUACHE;

/** The kit of a showcase book's template (read directly, no image analysis). */
export function kitForTemplate(templateId: string): StyleKit {
  const k = SHOWCASE_KITS[templateId]; if (!k) throw new Error(`No style kit for template "${templateId}"`);
  return structuredClone(k);
}

/** A copy of a kit WITHOUT its native designer: what a NEW book gets when it borrows a showcase book's style (generic programs only). */
export function borrowKit(k: StyleKit, name?: string): StyleKit {
  const { designer: _d, ...rest } = structuredClone(k); void _d;
  return { ...rest, id: `${k.id}-borrowed`, name: name ?? `${k.name} (borrowed)`, source: { kind: 'preset', ref: k.source.ref ?? k.id } };
}

/** Scale a kit length (designed at 1024 px wide) to a page width. */
export const kitScale = (pageW: number) => pageW / 1024;
