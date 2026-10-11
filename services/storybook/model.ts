// storybook/model — the persisted StoryBook: the ONE model a Storybook Studio book lives in.
//
// It is a strict superset of the showcase ShowcaseBook (data/showcase/types.ts), so every showcase book converts
// losslessly (fromShowcase.ts) and a remix is just "convert, then edit". It merges the two older character models
// (ShowcaseCharacter's locked look/palette/voice and story/characterBible.ts CharacterSheet's reference images)
// into CharacterBible and adds the geometry engine's CharacterSpec, so the art programs draw ONE likeness
// everywhere (feedback-character-consistency).
//
// What a spread carries:
//   text      a TextStory (services/text model): LIVE text, laid out by the text engine into the text-safe zones
//             the art program declares (never baked into vectors);
//   art       the brief + which designer program draws it (a library program id, a ported showcase designer, or a
//             custom AI-written program source) + its parameters and seed;
//   voca      read-aloud data for Plajah Academia Voca (level, target words with syllables, accepted variants,
//             comprehension question, narration word timings, safety verdict);
//   layout    the layout family (art direction rule 2) and an optional text-zone hint;
//   living    the LivingPage link (behaviours, music, narration) by page number.
//
// The TelaDoc is DERIVED (layout/buildStoryTelaDoc.ts); this model is the source of truth. Pure TS, no I/O.
import type { Beat, ShowcaseBook } from '../../data/showcase/types';
import type { TextStory, Paragraph, CharAttrs, ParaAttrs } from '../text/model';
import type { CharacterSpec, Pose } from '../tela/geometry/procedural/character';
import type { LivingBook } from '../living/contracts';
import type { StyleKit } from './style/kit';

export type { Beat };
export const STORYBOOK_SCHEMA = 1 as const;

// ───────────────────────────── trims ─────────────────────────────

export type TrimId = 'square-8.5' | 'landscape-10x8' | 'landscape-11x8.5' | 'landscape-4x3' | 'portrait-8x10' | 'board-6x6' | 'board-7x7';
export interface TrimSpec {
  id: TrimId;
  label: string;
  /** Trim size in inches (the cut page). */
  wIn: number; hIn: number;
  /** Bleed beyond the trim on every outside edge (0.125 in, services/pod/printSpec BLEED_IN). */
  bleedIn: number;
  /** Live-text / face safe inset from the trim. */
  safeIn: number;
  /** Layout units: Tela px per inch (96, the platform's CSS inch). */
  pxPerIn: 96;
  format: 'picture' | 'board';
  /** Printer trim id in services/pod/printSpec TRIM_SIZES when the printer catalogue has it (else the POD step must add it). */
  podTrimId?: string;
  /** Lulu product trim code when known (unverified until the Lulu cover-dimension endpoint confirms it). */
  luluCode?: string;
}
export const TRIMS: Record<TrimId, TrimSpec> = {
  'square-8.5':       { id: 'square-8.5', label: 'Square 8.5 x 8.5 in', wIn: 8.5, hIn: 8.5, bleedIn: .125, safeIn: .375, pxPerIn: 96, format: 'picture', luluCode: '0850X0850' },
  'landscape-10x8':   { id: 'landscape-10x8', label: 'Landscape 10 x 8 in', wIn: 10, hIn: 8, bleedIn: .125, safeIn: .375, pxPerIn: 96, format: 'picture' },
  'landscape-11x8.5': { id: 'landscape-11x8.5', label: 'Landscape 11 x 8.5 in', wIn: 11, hIn: 8.5, bleedIn: .125, safeIn: .375, pxPerIn: 96, format: 'picture', luluCode: '1100X0850' },
  // the showcase landscape books are laid out at 1024 x 768 px = 10.667 x 8 in (a 4:3 screen-first trim)
  'landscape-4x3':    { id: 'landscape-4x3', label: 'Landscape 4:3 (10.67 x 8 in)', wIn: 1024 / 96, hIn: 8, bleedIn: .125, safeIn: .375, pxPerIn: 96, format: 'picture' },
  'portrait-8x10':    { id: 'portrait-8x10', label: 'Portrait 8 x 10 in', wIn: 8, hIn: 10, bleedIn: .125, safeIn: .375, pxPerIn: 96, format: 'picture', podTrimId: '8x10' },
  'board-6x6':        { id: 'board-6x6', label: 'Board book 6 x 6 in', wIn: 6, hIn: 6, bleedIn: .125, safeIn: .5, pxPerIn: 96, format: 'board' },
  'board-7x7':        { id: 'board-7x7', label: 'Board book 7 x 7 in', wIn: 7, hIn: 7, bleedIn: .125, safeIn: .5, pxPerIn: 96, format: 'board' },
};
export interface TrimPx { W: number; H: number; bleed: number; safe: number; /** safe-area rect in page px */ safeRect: { x: number; y: number; w: number; h: number } }
/** Page geometry in Tela px. Art programs draw in trim coordinates 0..W x 0..H and paint backgrounds out to -bleed..W+bleed. */
export function trimPx(t: TrimSpec): TrimPx {
  const W = Math.round(t.wIn * t.pxPerIn), H = Math.round(t.hIn * t.pxPerIn), bleed = Math.round(t.bleedIn * t.pxPerIn), safe = Math.round(t.safeIn * t.pxPerIn);
  return { W, H, bleed, safe, safeRect: { x: safe, y: safe, w: W - safe * 2, h: H - safe * 2 } };
}
/** The trim whose px size matches (showcase templates: 816x816, 768x960, 1024x768). */
export function trimForPx(W: number, H: number): TrimSpec {
  const t = Object.values(TRIMS).find(t => { const p = trimPx(t); return p.W === W && p.H === H; });
  if (!t) throw new Error(`No storybook trim is ${W}x${H} px`);
  return t;
}

// ───────────────────────────── characters ─────────────────────────────

export type CharacterView = 'front' | 'threeQuarter' | 'side' | 'back';
/** A named, reusable pose: the turnaround and expression sheet entries, and what a spread's cast refers to. */
export interface NamedPose { id: string; label: string; view: CharacterView; pose: Omit<Pose, 'x' | 'y'> }

export interface CharacterBible {
  id: string;
  name: string;
  kind: string;
  role: 'hero' | 'companion' | 'supporting' | 'chorus';
  personality: string[];
  /** LOCKED visual descriptor (one likeness everywhere): every program, prompt and translation follows this wording. */
  look: string;
  /** Palette (hex) the character is always drawn in. */
  palette: string[];
  voice: string;
  signature: string;
  arc: string;
  /** Reference images (CharacterSheet.turnaroundUrls + author examples). Storage URLs or OPFS keys. */
  refs: { front?: string; threeQuarter?: string; profile?: string; closeUp?: string; examples?: string[] };
  /** Face/feature embedding cache key for image-model consistency (optional; never a real person's likeness). */
  embeddingRef?: string;
  /** The geometry engine's definition of the character: identity = this spec. */
  spec: CharacterSpec;
  /**
   * 'kit'      P.drawCharacter(spec, pose) draws it (any generic program can);
   * 'designer' the book's ported showcase designer draws it with its own construction (a bus, a moth, a planet),
   *            coloured from `palette`; generic programs fall back to a silhouette prop and preflight says so.
   */
  renderer: 'kit' | 'designer';
  /** Turnaround + expression sheet (the model sheet renders these). */
  turnarounds: NamedPose[];
  /** Locked by the author: spec, look and palette may not change without unlocking (Cast stage). */
  locked: boolean;
}

/** Stable hash of a character's identity (spec + palette + look). The consistency QA compares these. */
export function characterHash(c: Pick<CharacterBible, 'spec' | 'palette' | 'look'>): string {
  return fnv(stableJson({ spec: c.spec, palette: c.palette, look: c.look }));
}
export function specHash(spec: CharacterSpec): string { return fnv(stableJson(spec)); }

// ───────────────────────────── spreads ─────────────────────────────

/** Art-direction layout families (CHILDRENS_BOOK_ART_DIRECTION.md rule 2). */
export type LayoutKind = 'full-bleed' | 'vignette' | 'strip' | 'colour-block' | 'scale-play' | 'text-as-shape' | 'cover' | 'back';
export type ZoneHint = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'centre' | 'panels';
export type EnvironmentKind = 'forest' | 'meadow' | 'ocean' | 'night-sky' | 'city' | 'bedroom' | 'village' | 'snow' | 'desert';

export interface ArtBrief {
  /** What the picture shows (ShowcaseSpread.art): the brief for programs, councils and optional image models. */
  brief: string;
  setting?: EnvironmentKind;
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  mood?: 'calm' | 'joyful' | 'tense' | 'wonder' | 'sleepy' | 'sad';
  props?: string[];
}
export interface SpreadCast {
  /** CharacterBible id. */
  id: string;
  /** A bible turnaround pose id, or an inline pose (position is chosen by the program). */
  pose?: string | Omit<Pose, 'x' | 'y'>;
  /** Where the program should put them (0..1 of the page); programs may ignore it to keep the composition. */
  at?: { x: number; y: number; scale?: number };
}
export interface SpreadArt extends ArtBrief {
  /** Program that draws the spread: 'lib:<beat>' (generic library), 'port:<templateId>' (ported showcase designer), 'src:<sourceId>' (custom program source). */
  programId: string;
  params?: Record<string, number | string | boolean>;
  /** Seed for the program's deterministic randomness (defaults to `${bookId}/${spreadId}`). */
  seed?: string;
}
export interface SpreadLayout { kind: LayoutKind; zone?: ZoneHint }

export interface WordTimingMs { i: number; startMs: number; endMs: number }
export interface VocaQuestionDraft {
  prompt: string;
  choices: [string, string, string];
  answer: 0 | 1 | 2;
  /** Where it came from: deterministic template, an LLM draft, or the author. Only 'author' or approved drafts go to readers. */
  source: 'template' | 'llm' | 'author';
  approved: boolean;
}
export interface TargetWord { word: string; syllables: string[]; /** accepted pronunciation spellings (dialect-fair), normalised lower-case */ variants?: string[] }
export interface SpreadVoca {
  /** Voca level 1..10 (data/vocaPassages VOCA_LEVELS). */
  level: number;
  /** true = derived from the text (re-derived on edit); false = the author pinned it. */
  auto: boolean;
  targetWords: TargetWord[];
  /** Accepted pronunciation variants per normalised word (merged into the passage for the aligner). */
  variants?: Record<string, string[]>;
  question?: VocaQuestionDraft;
  /** Narration word timings, shared with the read-along highlight (LivingPage.narration.words). */
  timings?: WordTimingMs[];
  timingSource?: 'estimate' | 'tts' | 'recording' | 'taps';
  safety?: { ok: boolean; problems: Array<{ word: string; tier: 'block' | 'mature' | 'soft' }>; checkedAt: number };
}

export interface StorySpread {
  /** Stable id (survives reordering; living behaviours and stable object ids hang off the page number, see layout). */
  id: string;
  /** 1-based reading order including cover (1) and back cover (last). */
  n: number;
  beat: Beat;
  /** What this page sets up for the page turn (ShowcaseSpread.turn). */
  turn?: string;
  /** The live story text of the page. One paragraph per deliberate line of the manuscript. */
  text: TextStory;
  art: SpreadArt;
  cast: SpreadCast[];
  sfx?: string;
  voca: SpreadVoca;
  layout: SpreadLayout;
  /** The LivingPage for this spread is StoryBook.living.pages[page - 1] (page === n after any reorder is renumbered). */
  living?: { page: number };
}

// ───────────────────────────── the book ─────────────────────────────

export type StoryBookStatus = 'draft' | 'review' | 'proofed' | 'published' | 'archived';
export type ReadingBand = ShowcaseBook['band'];

export interface StoryBook {
  schema: typeof STORYBOOK_SCHEMA;
  id: string;
  ownerId: string;
  title: string;
  logline: string;
  blurb: string;
  ageMin: number; ageMax: number;
  band: ReadingBand;
  /** BCP 47. */
  language: string;
  license: 'CC_BY' | 'ALL_RIGHTS_RESERVED' | 'CC_BY_NC';
  /** Always disclosed (AI writing/structuring, procedural illustration). */
  aiDisclosure: string;
  author: string;
  medium: string;
  theme: string;
  refrain?: string;
  /** Set on remixes: the source book and the attribution line CC BY requires. */
  remixOf?: { bookId: string; title: string; author: string; license: string; credit: string };
  /** Where a converted showcase book came from (keeps its template id for the ported designers). */
  origin?: { showcaseId: string; templateId: string };
  remixIdeas: string[];
  discussion: string[];
  glossary?: Array<{ word: string; meaning: string }>;
  characters: CharacterBible[];
  spreads: StorySpread[];
  style: StyleKit;
  trim: TrimSpec;
  voca: { level: number; auto: boolean; fkGrade?: number };
  living?: LivingBook;
  status: StoryBookStatus;
  /** Monotonic edit version (optimistic concurrency for the manifest). */
  version: number;
  createdAt: number;
  updatedAt: number;
  publishedVersionId?: string;
}

// ───────────────────────────── text helpers (deterministic ids) ─────────────────────────────

export interface StoryTextStyle { fontFamily: string; fontSize: number; fontWeight: number; color: string; align: 'left' | 'center' | 'right'; leading: number }
/** A spread's TextStory from manuscript text. One paragraph per "\n" line; ids are `${spreadId}_t<k>` so rebuilds are byte-identical. */
export function storyFromText(spreadId: string, text: string, style?: Partial<StoryTextStyle>): TextStory {
  const char: CharAttrs = {};
  if (style?.fontFamily) char.fontFamily = style.fontFamily;
  if (style?.fontSize) char.fontSize = style.fontSize;
  if (style?.fontWeight) char.fontWeight = style.fontWeight;
  if (style?.color) char.color = style.color;
  const para: ParaAttrs = { align: style?.align ?? 'center', leading: { kind: 'multiple', value: style?.leading ?? 1.35 }, hyphenation: { enabled: false }, widows: 1, orphans: 1 };
  const paragraphs: Paragraph[] = text.split('\n').map((line, k) => ({ id: `${spreadId}_t${k + 1}`, attrs: para, runs: [{ text: line, ...(Object.keys(char).length ? { attrs: char } : {}) }] }));
  return { id: `${spreadId}_story`, paragraphs };
}
/** Plain manuscript text of a story (paragraphs joined by "\n"): the inverse of storyFromText for unstyled runs. */
export function storyPlain(s: TextStory): string { return s.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n'); }
export const spreadText = (sp: StorySpread) => storyPlain(sp.text);

/** Restyle every run of a story (keeps ids and text; used when the kit's type changes or a zone is fitted). */
export function restyleStory(s: TextStory, style: Partial<StoryTextStyle>): TextStory {
  return {
    ...s, paragraphs: s.paragraphs.map(p => ({
      ...p,
      attrs: { ...p.attrs, ...(style.align ? { align: style.align } : {}), ...(style.leading ? { leading: { kind: 'multiple' as const, value: style.leading } } : {}) },
      runs: p.runs.map(r => ({ ...r, attrs: { ...r.attrs, ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}), ...(style.fontSize ? { fontSize: style.fontSize } : {}), ...(style.fontWeight ? { fontWeight: style.fontWeight } : {}), ...(style.color ? { color: style.color } : {}) } })),
    })),
  };
}

// ───────────────────────────── construction + edits ─────────────────────────────

export const spreadId = (k: number) => `s${String(k).padStart(2, '0')}`;
export const pageNumberOf = (book: StoryBook, id: string) => book.spreads.findIndex(s => s.id === id) + 1;
export const spreadById = (book: StoryBook, id: string): StorySpread => { const s = book.spreads.find(x => x.id === id); if (!s) throw new Error(`No spread "${id}" in "${book.id}"`); return s; };
export const characterById = (book: StoryBook, id: string): CharacterBible | undefined => book.characters.find(c => c.id === id);
/** How many earlier spreads share this spread's beat (0 = first hero, 1 = second hero...). Programs pick variants with it. */
export function beatOccurrence(book: Pick<StoryBook, 'spreads'>, index: number): number {
  const beat = book.spreads[index]?.beat; let k = 0; for (let i = 0; i < index; i++) if (book.spreads[i].beat === beat) k++; return k;
}

/** Renumber after a reorder / insert / delete: n = position, living page links follow, living pages move with their spread. */
export function renumber(book: StoryBook): StoryBook {
  const oldPages = book.living?.pages ?? [];
  const spreads = book.spreads.map((s, i) => ({ ...s, n: i + 1, living: s.living ? { page: i + 1 } : s.living }));
  let living = book.living;
  if (living) {
    const byOld = new Map(oldPages.map(p => [p.page, p]));
    living = { ...living, pages: book.spreads.map((s, i) => { const p = s.living ? byOld.get(s.living.page) : undefined; return { ...(p ?? { behaviors: [] }), page: i + 1 }; }) };
  }
  return { ...book, spreads, living };
}
export function moveSpread(book: StoryBook, id: string, to: number): StoryBook {
  const from = book.spreads.findIndex(s => s.id === id); if (from < 0) throw new Error(`No spread "${id}"`);
  const spreads = book.spreads.slice(); const [s] = spreads.splice(from, 1); spreads.splice(Math.max(0, Math.min(spreads.length, to)), 0, s);
  return touch(renumber({ ...book, spreads }));
}
export const touch = (b: StoryBook, now = Date.now()): StoryBook => ({ ...b, version: b.version + 1, updatedAt: now });

// ───────────────────────────── validation (structure, not taste) ─────────────────────────────

export function validateStoryBook(b: StoryBook): string[] {
  const p: string[] = [];
  if (b.schema !== STORYBOOK_SCHEMA) p.push(`schema ${b.schema} is not ${STORYBOOK_SCHEMA}`);
  if (!b.id || !/^[a-z0-9][a-z0-9_-]{2,80}$/i.test(b.id)) p.push('id must be 3-80 url-safe characters');
  if (!b.title.trim()) p.push('title is empty');
  if (!b.spreads.length) p.push('the book has no spreads');
  const ids = new Set<string>();
  b.spreads.forEach((s, i) => {
    if (ids.has(s.id)) p.push(`duplicate spread id ${s.id}`); ids.add(s.id);
    if (s.n !== i + 1) p.push(`spread ${s.id} has n=${s.n} at position ${i + 1} (renumber)`);
    for (const c of s.cast) if (!b.characters.some(x => x.id === c.id)) p.push(`spread ${s.n}: unknown character "${c.id}"`);
    if (s.voca.level < 1 || s.voca.level > 10) p.push(`spread ${s.n}: voca level ${s.voca.level} outside 1..10`);
    if (s.living && (s.living.page !== s.n)) p.push(`spread ${s.n}: living page link ${s.living.page} (renumber)`);
  });
  if (b.spreads[0] && b.spreads[0].beat !== 'cover') p.push('the first spread should be the cover');
  const chars = new Set<string>(); for (const c of b.characters) { if (chars.has(c.id)) p.push(`duplicate character id ${c.id}`); chars.add(c.id); }
  if (b.license === 'CC_BY' && b.remixOf && !b.remixOf.credit) p.push('a CC BY remix must carry its credit line');
  if (b.living && b.living.pages.length !== b.spreads.length) p.push(`living has ${b.living.pages.length} pages for ${b.spreads.length} spreads`);
  return p;
}

// ───────────────────────────── small deterministic utils ─────────────────────────────

/** JSON with sorted keys (stable hashing). */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
}
/** FNV-1a 32-bit, hex. Not cryptographic; identity checks only. */
export function fnv(s: string): string { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
