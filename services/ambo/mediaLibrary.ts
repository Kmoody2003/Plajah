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

/** Guess the kind from a filename — the drop handler's job. */
export function kindForFile(nameOrUrl: string): MediaKind | null {
  const ext = (nameOrUrl.split('?')[0].split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(ext)) return 'IMAGE';
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext)) return 'VIDEO';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'AUDIO';
  if (['lottie', 'json'].includes(ext)) return 'LOTTIE';
  return null;
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
