// model — THE rich-text model for the whole platform: Writer documents, layout frames, vector
// text, storybook pages. One shape everywhere means one composer, one editor, one exporter.
//
// Design rules:
//  • A story is paragraphs; a paragraph is runs of text with character attributes. Paragraph
//    breaks are structure (never "\n" inside a run); U+2028 inside a run is a forced line break,
//    U+0009 is a tab, U+00AD a discretionary hyphen, U+FFFC an inline object.
//  • Positions are { paragraphId, offset } with offset in UTF-16 code units of the paragraph's
//    text. Paragraph ids are stable (CRDT-friendly: a concurrent edit to another paragraph never
//    shifts your position), runs carry no ids and are normalised freely.
//  • Formatting is layered: paragraph style (basedOn chain) → character style (basedOn chain) →
//    local attrs. `undefined` means "inherit". Resolution is pure and cheap.
//  • Every edit is a pure function story → story with structural sharing, and also exists as a
//    serialisable `TextOp` for history, collaboration and replay (`applyOp`).
//
// Units: lengths are document px (1/96 in); font size px; tracking in 1/1000 em (InDesign);
// word spacing %, letter spacing % of the em, glyph scaling %.

// ── Attributes ──────────────────────────────────────────────────────────────────────────────

export type Decoration = boolean | { color?: string; thickness?: number; offset?: number; style?: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy' };

export interface CharAttrs {
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  /** CSS font-stretch %, drives the wdth axis. */
  fontStretch?: number;
  fontSize?: number;
  /** Explicit variation axes ({ opsz: 72, SOFT: 50 }); win over weight/stretch. */
  axes?: Record<string, number>;
  opticalSize?: 'auto' | 'none' | number;
  /** OpenType features by tag (liga, kern, onum, lnum, tnum, pnum, smcp, c2sc, ss01…ss20, swsh, frac, sups, subs, calt, dlig, case, zero, ordn, salt, hist). */
  features?: Record<string, number | boolean>;
  /** Convenience over features. */
  ligatures?: 'common' | 'none' | 'discretionary' | 'historical';
  numerals?: 'default' | 'lining' | 'oldstyle' | 'tabular-lining' | 'tabular-oldstyle' | 'proportional-lining' | 'proportional-oldstyle';
  kerning?: 'metrics' | 'none';
  /** Tracking in 1/1000 em. */
  tracking?: number;
  /** px, up-positive. */
  baselineShift?: number;
  color?: string;
  highlight?: string;
  underline?: Decoration;
  strike?: Decoration;
  caps?: 'normal' | 'small-caps' | 'all-small-caps' | 'all-caps' | 'lowercase';
  /** Synthesized super/subscript; 'superior'/'inferior'/'ordinal' use OpenType sups/subs/ordn. */
  position?: 'normal' | 'super' | 'sub' | 'superior' | 'inferior' | 'ordinal';
  /** BCP 47; drives shaping (locl) and hyphenation patterns. */
  language?: string;
  href?: string;
  noBreak?: boolean;
  /** false suppresses automatic hyphenation for this text. */
  hyphenate?: boolean;
  /** Inline object (U+FFFC) metrics in px. */
  object?: { id: string; width: number; ascent: number; descent: number };
  // ── Document marks (Writer). They ride along with the text through every edit, so ranges
  //    never need re-anchoring; layout ignores them, the document layer renders them. ──
  /** Track changes: text inserted by `ins.author`, pending review. */
  ins?: RevisionMark;
  /** Track changes: text deleted by `del.author`, kept in place until accepted. */
  del?: RevisionMark;
  /** Track changes: a formatting change; `old` holds the attrs it replaced. */
  fmt?: RevisionMark & { old: Partial<CharAttrs> };
  /** Comment threads anchored to this text. */
  comments?: string[];
  /** Bookmarks covering this text. */
  bookmarks?: string[];
  /** Generated inline content on a U+FFFC object: note references, page numbers, cross-references. */
  field?: FieldSpec;
}

/** Who changed what, when (track changes). */
export interface RevisionMark { id: string; author: string; authorId?: string; date: number }

/** Generated inline content; the document layer computes its text at layout time. */
export type FieldSpec = FieldKind & {
  /** Last computed text (Word's field result): written by layout for display, kept in exports. */
  result?: string;
};
export type FieldKind =
  | { kind: 'noteRef'; id: string; note: 'footnote' | 'endnote' }
  /** The number at the start of a note's own text. */
  | { kind: 'noteNumber'; id: string; note: 'footnote' | 'endnote' }
  | { kind: 'page' }
  | { kind: 'pages' }
  | { kind: 'sectionPages' }
  /** Page number of a paragraph id or bookmark name (TOC entries, "see page N"). */
  | { kind: 'pageRef'; target: string }
  /** Text of the target paragraph (cross-reference). */
  | { kind: 'ref'; target: string; mode?: 'text' | 'number' }
  | { kind: 'date'; format?: string; value?: string };

export type Leading = { kind: 'auto'; factor?: number } | { kind: 'fixed'; value: number } | { kind: 'multiple'; value: number };
export type TextAlign = 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | 'justify-all' | 'justify-center' | 'justify-end';

export interface HyphenationAttrs {
  enabled?: boolean;
  minWord?: number;
  before?: number;
  after?: number;
  /** Max consecutive hyphenated lines (0 = unlimited). */
  limit?: number;
  capitalized?: boolean;
  /** Penalty for a hyphen break (TeX \hyphenpenalty). */
  penalty?: number;
  /** Hyphenation zone for ragged text, px (InDesign). */
  zone?: number;
}

export interface JustificationAttrs {
  /** % of the font's space: [min, desired, max]. InDesign default 80/100/133. */
  wordSpacing?: [number, number, number];
  /** % of the em: [min, desired, max]. */
  letterSpacing?: [number, number, number];
  /** %: [min, desired, max], e.g. [98, 100, 102]. */
  glyphScaling?: [number, number, number];
  /** Auto leading %, default 120. */
  autoLeading?: number;
  singleWord?: 'start' | 'full' | 'center' | 'end';
  composer?: 'paragraph' | 'single-line';
  looseness?: number;
  /** Emergency stretch for the last pass, in em. */
  emergencyStretch?: number;
  /** Minimum last-line length as % of the measure. */
  minLastLine?: number;
  /** Optical margin alignment (true = 1). */
  opticalMargin?: boolean | number;
  tolerance?: number;
}

export interface TabStopAttrs { position: number; align?: 'left' | 'right' | 'center' | 'decimal'; leader?: string; alignChar?: string }

export interface DropCapAttrs { lines: number; chars?: number; gap?: number; style?: CharAttrs }

export interface ListAttrs {
  kind: 'bullet' | 'number';
  level?: number;
  format?: 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';
  bullet?: string;
  start?: number;
  /** Marker template, `%1` = number at this level (e.g. "%1." or "(%1)"). */
  template?: string;
  /** Indent per level, px. */
  indent?: number;
  /** Continue numbering across interruptions (same listId). */
  listId?: string;
}

export interface BoxAttrs { color?: string; width?: number; padding?: number; radius?: number }

export interface ParaAttrs {
  align?: TextAlign;
  direction?: 'auto' | 'ltr' | 'rtl';
  indentStart?: number;
  indentEnd?: number;
  /** First-line indent; negative = hanging. */
  indentFirst?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  leading?: Leading;
  /** Snap baselines to the frame's baseline grid. */
  baselineGrid?: boolean;
  hyphenation?: HyphenationAttrs;
  justification?: JustificationAttrs;
  tabs?: TabStopAttrs[];
  defaultTab?: number;
  keepWithNext?: boolean;
  keepTogether?: boolean;
  widows?: number;
  orphans?: number;
  startOn?: 'anywhere' | 'next-column' | 'next-frame';
  dropCap?: DropCapAttrs;
  list?: ListAttrs;
  border?: BoxAttrs;
  shading?: BoxAttrs;
}

// ── Structure ───────────────────────────────────────────────────────────────────────────────

export interface Run { text: string; styleId?: string; attrs?: CharAttrs }
export interface Paragraph {
  id: string;
  styleId?: string;
  attrs?: ParaAttrs;
  runs: Run[];
  /** Host metadata carried verbatim (Tela block roles, lesson data, domain ids). Layout ignores it. */
  meta?: Record<string, unknown>;
  /** A block object occupying this paragraph slot (its runs stay empty). */
  table?: TableBlock;
  /** Track changes on the paragraph itself: `ins`/`del` mark its paragraph mark; `fmt` a style/attr change. */
  rev?: { ins?: RevisionMark; del?: RevisionMark; fmt?: RevisionMark & { old: { styleId?: string; attrs?: ParaAttrs } } };
}

// ── Tables (a table is a block object in the paragraph sequence; every cell is a story) ─────

export interface BorderSpec { width: number; color: string; style?: 'single' | 'double' | 'dashed' | 'dotted' | 'none' }
export interface TableBorders { top?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec; right?: BorderSpec; insideH?: BorderSpec; insideV?: BorderSpec }
export interface TableCell {
  id: string;
  story: TextStory;
  colSpan?: number;
  /** Rows this cell spans downward; the covered cells below carry `vMerged`. */
  rowSpan?: number;
  /** Covered by a vertically merged cell above (content ignored). */
  vMerged?: boolean;
  shading?: string;
  borders?: TableBorders;
  vAlign?: 'top' | 'center' | 'bottom';
}
export interface TableRow {
  id: string;
  cells: TableCell[];
  /** Minimum (or exact) row height, px. */
  height?: number;
  heightRule?: 'auto' | 'atLeast' | 'exact';
  /** Repeat as a header row at the top of every page the table continues on. */
  header?: boolean;
  /** Keep the row on one page. */
  cantSplit?: boolean;
}
export interface TableBlock {
  id: string;
  /** Grid column widths, px. Every row's cells (with colSpan) cover the grid exactly. */
  columns: number[];
  rows: TableRow[];
  borders?: TableBorders;
  align?: 'left' | 'center' | 'right';
  indent?: number;
  /** Cell padding, px (left/right; top/bottom use half). */
  cellPadding?: number;
  styleName?: string;
}
export interface TextStory { id: string; paragraphs: Paragraph[] }

export interface ParagraphStyle { id: string; name: string; basedOn?: string; next?: string; para?: ParaAttrs; char?: CharAttrs }
export interface CharacterStyle { id: string; name: string; basedOn?: string; char: CharAttrs }
export interface StyleSheet {
  paragraph: Record<string, ParagraphStyle>;
  character: Record<string, CharacterStyle>;
  /** Style for paragraphs without styleId. */
  defaultParagraph: string;
}

export interface Position { paragraphId: string; offset: number }
export interface TextRange { anchor: Position; focus: Position }

// ── Defaults ────────────────────────────────────────────────────────────────────────────────

export const BASE_CHAR: Required<Pick<CharAttrs, 'fontFamily' | 'fontWeight' | 'fontStyle' | 'fontSize' | 'tracking' | 'baselineShift' | 'color' | 'caps' | 'position' | 'language' | 'kerning' | 'opticalSize'>> = {
  fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal', fontSize: 16, tracking: 0, baselineShift: 0, color: '#1a1a1a',
  caps: 'normal', position: 'normal', language: 'en', kerning: 'metrics', opticalSize: 'auto',
};

export const BASE_PARA = {
  align: 'start' as TextAlign, direction: 'auto' as const, indentStart: 0, indentEnd: 0, indentFirst: 0, spaceBefore: 0, spaceAfter: 0,
  leading: { kind: 'auto', factor: 1.2 } as Leading, baselineGrid: false,
  hyphenation: { enabled: true, minWord: 6, before: 2, after: 3, limit: 3, capitalized: true, penalty: 50, zone: 0 } as Required<HyphenationAttrs>,
  justification: {
    wordSpacing: [80, 100, 133], letterSpacing: [0, 0, 0], glyphScaling: [100, 100, 100], autoLeading: 120, singleWord: 'start',
    composer: 'paragraph', looseness: 0, emergencyStretch: 1.5, minLastLine: 0, opticalMargin: false, tolerance: 200,
  } as Required<JustificationAttrs>,
  tabs: [] as TabStopAttrs[], defaultTab: 36, keepWithNext: false, keepTogether: false, widows: 2, orphans: 2, startOn: 'anywhere' as const,
};

export type ResolvedPara = typeof BASE_PARA & Pick<ParaAttrs, 'dropCap' | 'list' | 'border' | 'shading'>;
export type ResolvedChar = typeof BASE_CHAR & Omit<CharAttrs, keyof typeof BASE_CHAR>;

/** A sensible document stylesheet (Writer default); apps extend or replace it. */
export function defaultStyleSheet(body: Partial<CharAttrs> = {}): StyleSheet {
  const ps = (id: string, name: string, para: ParaAttrs, char: CharAttrs, basedOn?: string, next?: string): ParagraphStyle => ({ id, name, para, char, basedOn, next });
  return {
    defaultParagraph: 'body',
    paragraph: {
      body: ps('body', 'Body', { spaceAfter: 8, leading: { kind: 'multiple', value: 1.45 } }, { fontFamily: 'Inter', fontSize: 16, ...body }),
      'body-justified': ps('body-justified', 'Body Justified', { align: 'justify', spaceAfter: 0, indentFirst: 18, justification: { opticalMargin: true } }, {}, 'body'),
      title: ps('title', 'Title', { spaceAfter: 16, leading: { kind: 'multiple', value: 1.1 }, keepWithNext: true, hyphenation: { enabled: false } }, { fontSize: 40, fontWeight: 700 }, 'body', 'body'),
      h1: ps('h1', 'Heading 1', { spaceBefore: 24, spaceAfter: 10, leading: { kind: 'multiple', value: 1.15 }, keepWithNext: true, hyphenation: { enabled: false } }, { fontSize: 30, fontWeight: 700 }, 'body', 'body'),
      h2: ps('h2', 'Heading 2', { spaceBefore: 20, spaceAfter: 8, leading: { kind: 'multiple', value: 1.2 }, keepWithNext: true, hyphenation: { enabled: false } }, { fontSize: 23, fontWeight: 650 }, 'body', 'body'),
      h3: ps('h3', 'Heading 3', { spaceBefore: 16, spaceAfter: 6, keepWithNext: true, hyphenation: { enabled: false } }, { fontSize: 18, fontWeight: 650 }, 'body', 'body'),
      quote: ps('quote', 'Quote', { indentStart: 24, indentEnd: 24, justification: { opticalMargin: true } }, { fontStyle: 'italic' }, 'body'),
      caption: ps('caption', 'Caption', { spaceAfter: 4 }, { fontSize: 12, color: '#555' }, 'body'),
      list: ps('list', 'List', { spaceAfter: 4, list: { kind: 'bullet' } }, {}, 'body', 'list'),
      'list-number': ps('list-number', 'Numbered List', { spaceAfter: 4, list: { kind: 'number' } }, {}, 'body', 'list-number'),
      code: ps('code', 'Code', { hyphenation: { enabled: false }, leading: { kind: 'multiple', value: 1.4 } }, { fontFamily: 'JetBrains Mono', fontSize: 14 }, 'body'),
    },
    character: {
      strong: { id: 'strong', name: 'Strong', char: { fontWeight: 700 } },
      emphasis: { id: 'emphasis', name: 'Emphasis', char: { fontStyle: 'italic' } },
      code: { id: 'code', name: 'Code', char: { fontFamily: 'JetBrains Mono', hyphenate: false } },
      link: { id: 'link', name: 'Link', char: { color: '#1f5fbf', underline: true } },
      smallcaps: { id: 'smallcaps', name: 'Small Caps', char: { caps: 'small-caps', tracking: 20 } },
    },
  };
}

// ── Ids ─────────────────────────────────────────────────────────────────────────────────────

let idCounter = 0;
const idSalt = Math.random().toString(36).slice(2, 7);
/** Stable, collision-resistant ids (session salt + counter); callers may supply their own. */
export function newId(prefix = 'p'): string { return `${prefix}_${idSalt}${(++idCounter).toString(36)}`; }

// ── Resolution ──────────────────────────────────────────────────────────────────────────────

function mergeDeep<T extends object>(base: T, over: Partial<T> | undefined): T {
  if (!over) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b) ? mergeDeep(b as object, v as object) : v;
  }
  return out as T;
}

function chain<S extends { basedOn?: string }>(map: Record<string, S>, id: string | undefined): S[] {
  const out: S[] = [];
  const seen = new Set<string>();
  let cur = id ? map[id] : undefined;
  while (cur && !seen.has((cur as unknown as { id: string }).id)) {
    seen.add((cur as unknown as { id: string }).id);
    out.unshift(cur);
    cur = cur.basedOn ? map[cur.basedOn] : undefined;
  }
  return out;
}

export interface ResolvedParagraphStyle { para: ResolvedPara; char: ResolvedChar }

/** Paragraph attrs + the paragraph-level character defaults, through the basedOn chain. */
export function resolveParagraph(sheet: StyleSheet, p: Paragraph): ResolvedParagraphStyle {
  let para = BASE_PARA as ResolvedPara;
  let char = BASE_CHAR as ResolvedChar;
  for (const s of chain(sheet.paragraph, p.styleId ?? sheet.defaultParagraph)) {
    para = mergeDeep(para, s.para as Partial<ResolvedPara>);
    char = mergeDeep(char, s.char as Partial<ResolvedChar>);
  }
  para = mergeDeep(para, p.attrs as Partial<ResolvedPara>);
  return { para, char };
}

export function resolveRun(sheet: StyleSheet, paraChar: ResolvedChar, run: Run): ResolvedChar {
  let c = paraChar;
  for (const s of chain(sheet.character, run.styleId)) c = mergeDeep(c, s.char as Partial<ResolvedChar>);
  return mergeDeep(c, run.attrs as Partial<ResolvedChar>);
}

// ── Text helpers ────────────────────────────────────────────────────────────────────────────

export function paragraphText(p: Paragraph): string {
  let s = '';
  for (const r of p.runs) s += r.text;
  return s;
}
export function paragraphLength(p: Paragraph): number {
  let n = 0;
  for (const r of p.runs) n += r.text.length;
  return n;
}
/** Plain text, paragraphs joined by "\n". */
export function storyText(s: TextStory): string { return s.paragraphs.map(paragraphText).join('\n'); }

export function paragraphIndex(s: TextStory, id: string): number {
  const i = s.paragraphs.findIndex(p => p.id === id);
  if (i < 0) throw new Error(`paragraph ${id} not in story`);
  return i;
}

export function comparePositions(s: TextStory, a: Position, b: Position): number {
  const ia = paragraphIndex(s, a.paragraphId), ib = paragraphIndex(s, b.paragraphId);
  return ia !== ib ? ia - ib : a.offset - b.offset;
}
/** [start, end] of a range in document order. */
export function orderRange(s: TextStory, r: TextRange): [Position, Position] {
  return comparePositions(s, r.anchor, r.focus) <= 0 ? [r.anchor, r.focus] : [r.focus, r.anchor];
}
export function isCollapsed(r: TextRange): boolean { return r.anchor.paragraphId === r.focus.paragraphId && r.anchor.offset === r.focus.offset; }
export function clampPosition(s: TextStory, p: Position): Position {
  const i = s.paragraphs.findIndex(x => x.id === p.paragraphId);
  if (i < 0) { const last = s.paragraphs[s.paragraphs.length - 1]; return { paragraphId: last.id, offset: paragraphLength(last) }; }
  return { paragraphId: p.paragraphId, offset: Math.max(0, Math.min(paragraphLength(s.paragraphs[i]), p.offset)) };
}
export function startOf(s: TextStory): Position { return { paragraphId: s.paragraphs[0].id, offset: 0 }; }
export function endOf(s: TextStory): Position { const l = s.paragraphs[s.paragraphs.length - 1]; return { paragraphId: l.id, offset: paragraphLength(l) }; }

function sameAttrs(a: Run, b: Run): boolean {
  return a.styleId === b.styleId && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

/** Merge equal neighbours, drop empty runs (keeping one so an empty paragraph keeps its format). */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text.length) continue;
    const last = out[out.length - 1];
    if (last && sameAttrs(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push(r);
  }
  if (!out.length) {
    const keep = runs[runs.length - 1] ?? { text: '' };
    out.push({ ...keep, text: '' });
  }
  return out;
}

/** Split runs at `offset`: [runs before, runs after] (never splits a surrogate pair). */
export function splitRuns(runs: Run[], offset: number): [Run[], Run[]] {
  const a: Run[] = [], b: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    if (end <= offset) a.push(r);
    else if (pos >= offset) b.push(r);
    else {
      let k = offset - pos;
      const c = r.text.charCodeAt(k - 1);
      if (c >= 0xD800 && c < 0xDC00) k++;
      a.push({ ...r, text: r.text.slice(0, k) });
      b.push({ ...r, text: r.text.slice(k) });
    }
    pos = end;
  }
  if (!a.length) a.push({ ...(runs[0] ?? { text: '' }), text: '' });
  if (!b.length) b.push({ ...(runs[runs.length - 1] ?? { text: '' }), text: '' });
  return [a, b];
}

/** The run whose formatting new text typed at `offset` should take (the run before the caret). */
export function runAt(p: Paragraph, offset: number): Run {
  let pos = 0;
  for (const r of p.runs) {
    const end = pos + r.text.length;
    if (offset > pos && offset <= end) return r;
    pos = end;
  }
  return p.runs[0] ?? { text: '' };
}

/** The format new text takes from a neighbouring run: never an object's metrics, a field or a
 *  pending deletion/format-change mark (those belong to the run, not to what is typed next). */
export function typingFormat(r: Pick<Run, 'styleId' | 'attrs'>): Pick<Run, 'styleId' | 'attrs'> {
  const a = r.attrs;
  if (!a || !(a.object || a.field || a.del || a.fmt)) return r;
  const { object: _o, field: _f, del: _d, fmt: _m, ...rest } = a;
  return { styleId: r.styleId, attrs: Object.keys(rest).length ? rest : undefined };
}

// ── Edit operations (pure) ──────────────────────────────────────────────────────────────────

export interface EditResult { story: TextStory; caret: Position }

function replaceParagraphs(s: TextStory, from: number, count: number, ps: Paragraph[]): TextStory {
  const paragraphs = s.paragraphs.slice();
  paragraphs.splice(from, count, ...ps);
  return { ...s, paragraphs };
}

/** Insert text (newlines/U+2029 split paragraphs) with the caret's formatting or `format`. */
export function insertText(s: TextStory, at: Position, text: string, format?: Pick<Run, 'styleId' | 'attrs'>, newIds?: () => string): EditResult {
  const parts = text.replace(/\r\n?/g, '\n').split(new RegExp('[\\n\\u2029]'));
  let story = s;
  let caret = clampPosition(s, at);
  for (let k = 0; k < parts.length; k++) {
    if (k > 0) {
      const r = splitParagraph(story, caret, newIds?.());
      story = r.story;
      caret = r.caret;
    }
    const part = parts[k];
    if (!part) continue;
    const i = paragraphIndex(story, caret.paragraphId);
    const p = story.paragraphs[i];
    const base = format ?? typingFormat(runAt(p, caret.offset));
    const [a, b] = splitRuns(p.runs, caret.offset);
    const runs = normalizeRuns([...a, { text: part, styleId: base.styleId, attrs: base.attrs }, ...b]);
    story = replaceParagraphs(story, i, 1, [{ ...p, runs }]);
    caret = { paragraphId: p.id, offset: caret.offset + part.length };
  }
  return { story, caret };
}

/** Split the paragraph at `at`; the new paragraph takes `next` style when split at the end. */
export function splitParagraph(s: TextStory, at: Position, newParagraphId = newId(), sheet?: StyleSheet): EditResult {
  const i = paragraphIndex(s, at.paragraphId);
  const p = s.paragraphs[i];
  const [a, b] = splitRuns(p.runs, at.offset);
  const atEnd = at.offset >= paragraphLength(p);
  const nextStyle = atEnd && sheet && p.styleId ? sheet.paragraph[p.styleId]?.next ?? p.styleId : p.styleId;
  const first: Paragraph = { ...p, runs: normalizeRuns(a) };
  const attrs = p.attrs ? { ...p.attrs, dropCap: undefined } : undefined;
  const second: Paragraph = { id: newParagraphId, styleId: nextStyle, attrs: nextStyle !== p.styleId ? undefined : attrs, runs: normalizeRuns(b) };
  return { story: replaceParagraphs(s, i, 1, [first, second]), caret: { paragraphId: second.id, offset: 0 } };
}

/** Merge paragraph `id` with the one after it (keeps the first paragraph's id and attrs). */
export function mergeParagraphs(s: TextStory, id: string): EditResult {
  const i = paragraphIndex(s, id);
  const p = s.paragraphs[i];
  const q = s.paragraphs[i + 1];
  if (!q) return { story: s, caret: { paragraphId: id, offset: paragraphLength(p) } };
  const len = paragraphLength(p);
  const runs = normalizeRuns([...p.runs.filter(r => r.text.length), ...q.runs]);
  return { story: replaceParagraphs(s, i, 2, [{ ...p, runs: len ? runs : normalizeRuns([...q.runs]) }]), caret: { paragraphId: id, offset: len } };
}

export function deleteRange(s: TextStory, range: TextRange): EditResult {
  const [a, b] = orderRange(s, range);
  const ia = paragraphIndex(s, a.paragraphId), ib = paragraphIndex(s, b.paragraphId);
  const pa = s.paragraphs[ia], pb = s.paragraphs[ib];
  const [keepA] = splitRuns(pa.runs, a.offset);
  const [, keepB] = splitRuns(pb.runs, b.offset);
  const merged: Paragraph = { ...pa, runs: normalizeRuns([...keepA, ...keepB]) };
  return { story: replaceParagraphs(s, ia, ib - ia + 1, [merged]), caret: { paragraphId: pa.id, offset: a.offset } };
}

function mapRange(s: TextStory, range: TextRange, f: (run: Run) => Run): TextStory {
  const [a, b] = orderRange(s, range);
  const ia = paragraphIndex(s, a.paragraphId), ib = paragraphIndex(s, b.paragraphId);
  const paragraphs = s.paragraphs.slice();
  for (let i = ia; i <= ib; i++) {
    const p = paragraphs[i];
    const from = i === ia ? a.offset : 0;
    const to = i === ib ? b.offset : paragraphLength(p);
    if (from >= to && !(from === 0 && to === 0 && paragraphLength(p) === 0)) continue;
    const [x, rest] = splitRuns(p.runs, from);
    const [mid, y] = splitRuns(rest, to - from);
    paragraphs[i] = { ...p, runs: normalizeRuns([...x, ...mid.map(f), ...y]) };
  }
  return { ...s, paragraphs };
}

function patchAttrs<T extends object>(base: T | undefined, patch: Partial<T>): T | undefined {
  const out = { ...(base ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) delete out[k];
    else out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

/** Set (or with `undefined` values, clear) local character attributes over a range. */
export function applyCharAttrs(s: TextStory, range: TextRange, patch: Partial<CharAttrs>): TextStory {
  return mapRange(s, range, r => ({ ...r, attrs: patchAttrs(r.attrs, patch) }));
}

export function setCharacterStyle(s: TextStory, range: TextRange, styleId: string | undefined): TextStory {
  return mapRange(s, range, r => ({ ...r, styleId }));
}

export function paragraphIdsInRange(s: TextStory, range: TextRange): string[] {
  const [a, b] = orderRange(s, range);
  const ia = paragraphIndex(s, a.paragraphId), ib = paragraphIndex(s, b.paragraphId);
  return s.paragraphs.slice(ia, ib + 1).map(p => p.id);
}

export function setParaAttrs(s: TextStory, ids: string[], patch: Partial<ParaAttrs>): TextStory {
  const set = new Set(ids);
  return { ...s, paragraphs: s.paragraphs.map(p => (set.has(p.id) ? { ...p, attrs: patchAttrs(p.attrs, patch) } : p)) };
}

export function setParagraphStyle(s: TextStory, ids: string[], styleId: string | undefined, clearOverrides = false): TextStory {
  const set = new Set(ids);
  return { ...s, paragraphs: s.paragraphs.map(p => (set.has(p.id) ? { ...p, styleId, attrs: clearOverrides ? undefined : p.attrs } : p)) };
}

/** Copy of a range as a standalone story (fresh paragraph ids). */
export function sliceStory(s: TextStory, range: TextRange): TextStory {
  const [a, b] = orderRange(s, range);
  const ia = paragraphIndex(s, a.paragraphId), ib = paragraphIndex(s, b.paragraphId);
  const paragraphs: Paragraph[] = [];
  for (let i = ia; i <= ib; i++) {
    const p = s.paragraphs[i];
    const from = i === ia ? a.offset : 0;
    const to = i === ib ? b.offset : paragraphLength(p);
    const [, rest] = splitRuns(p.runs, from);
    const [mid] = splitRuns(rest, to - from);
    paragraphs.push({ ...p, id: newId(), runs: normalizeRuns(mid) });
  }
  return { id: newId('s'), paragraphs };
}

/** Paste a fragment at `at`: first/last fragment paragraphs merge into the surrounding text. */
export function insertFragment(s: TextStory, at: Position, frag: TextStory): EditResult {
  if (!frag.paragraphs.length) return { story: s, caret: at };
  const i = paragraphIndex(s, at.paragraphId);
  const p = s.paragraphs[i];
  const [a, b] = splitRuns(p.runs, at.offset);
  const fp = frag.paragraphs;
  if (fp.length === 1) {
    const runs = normalizeRuns([...a, ...fp[0].runs, ...b]);
    return { story: replaceParagraphs(s, i, 1, [{ ...p, runs }]), caret: { paragraphId: p.id, offset: at.offset + paragraphLength(fp[0]) } };
  }
  const first: Paragraph = { ...p, runs: normalizeRuns([...a, ...fp[0].runs]) };
  const middle = fp.slice(1, -1).map(q => ({ ...q, id: newId() }));
  const lastFrag = fp[fp.length - 1];
  const last: Paragraph = { ...lastFrag, id: newId(), runs: normalizeRuns([...lastFrag.runs, ...b]) };
  return { story: replaceParagraphs(s, i, 1, [first, ...middle, last]), caret: { paragraphId: last.id, offset: paragraphLength(lastFrag) } };
}

// ── Serialisable ops (history / collaboration) ──────────────────────────────────────────────

export type TextOp =
  | { type: 'insertText'; at: Position; text: string; format?: Pick<Run, 'styleId' | 'attrs'>; newIds?: string[] }
  | { type: 'deleteRange'; range: TextRange }
  | { type: 'splitParagraph'; at: Position; newId: string }
  | { type: 'mergeParagraphs'; paragraphId: string }
  | { type: 'applyCharAttrs'; range: TextRange; patch: Partial<CharAttrs> }
  | { type: 'setCharacterStyle'; range: TextRange; styleId?: string }
  | { type: 'setParaAttrs'; paragraphIds: string[]; patch: Partial<ParaAttrs> }
  | { type: 'setParagraphStyle'; paragraphIds: string[]; styleId?: string; clearOverrides?: boolean }
  | { type: 'insertFragment'; at: Position; fragment: TextStory }
  // Paragraph-granular ops (block objects, metadata, review marks): replace by id, insert, remove.
  | { type: 'replaceParagraph'; paragraph: Paragraph }
  | { type: 'insertParagraphs'; afterId: string | null; paragraphs: Paragraph[] }
  | { type: 'removeParagraphs'; ids: string[] };

export function applyOp(s: TextStory, op: TextOp, sheet?: StyleSheet): EditResult {
  switch (op.type) {
    case 'insertText': {
      const ids = op.newIds?.slice();
      return insertText(s, op.at, op.text, op.format, ids ? () => ids.shift() ?? newId() : undefined);
    }
    case 'deleteRange': return deleteRange(s, op.range);
    case 'splitParagraph': return splitParagraph(s, op.at, op.newId, sheet);
    case 'mergeParagraphs': return mergeParagraphs(s, op.paragraphId);
    case 'applyCharAttrs': return { story: applyCharAttrs(s, op.range, op.patch), caret: op.range.focus };
    case 'setCharacterStyle': return { story: setCharacterStyle(s, op.range, op.styleId), caret: op.range.focus };
    case 'setParaAttrs': return { story: setParaAttrs(s, op.paragraphIds, op.patch), caret: { paragraphId: op.paragraphIds[0], offset: 0 } };
    case 'setParagraphStyle': return { story: setParagraphStyle(s, op.paragraphIds, op.styleId, op.clearOverrides), caret: { paragraphId: op.paragraphIds[0], offset: 0 } };
    case 'insertFragment': return insertFragment(s, op.at, op.fragment);
    case 'replaceParagraph': {
      const i = paragraphIndex(s, op.paragraph.id);
      return { story: replaceParagraphs(s, i, 1, [op.paragraph]), caret: { paragraphId: op.paragraph.id, offset: 0 } };
    }
    case 'insertParagraphs': {
      if (!op.paragraphs.length) return { story: s, caret: startOf(s) };
      const at = op.afterId === null ? 0 : paragraphIndex(s, op.afterId) + 1;
      const last = op.paragraphs[op.paragraphs.length - 1];
      return { story: replaceParagraphs(s, at, 0, op.paragraphs), caret: { paragraphId: last.id, offset: paragraphLength(last) } };
    }
    case 'removeParagraphs': {
      const drop = new Set(op.ids);
      const keep = s.paragraphs.filter(p => !drop.has(p.id));
      const story = { ...s, paragraphs: keep.length ? keep : [{ id: newId(), runs: [{ text: '' }] }] };
      return { story, caret: startOf(story) };
    }
  }
}

// ── Construction ────────────────────────────────────────────────────────────────────────────

export function createStory(paragraphs: (string | Partial<Paragraph>)[] = [''], id = newId('s')): TextStory {
  const ps = paragraphs.map(p => (typeof p === 'string' ? { id: newId(), runs: [{ text: p }] } : { id: p.id ?? newId(), styleId: p.styleId, attrs: p.attrs, runs: p.runs?.length ? p.runs : [{ text: '' }] }));
  return { id, paragraphs: ps.length ? ps : [{ id: newId(), runs: [{ text: '' }] }] };
}
