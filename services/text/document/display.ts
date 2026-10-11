// document/display — what the paginator actually composes: list numbering, field results and
// review markup applied to model paragraphs WITHOUT changing their text length, so every
// model offset is still a valid display offset (carets, selections and hit tests need no map).
//
//  • Fields (note references, page numbers, cross-references) are U+FFFC objects; the display
//    paragraph gives each object the measured width of its result text and records the result
//    on `field.result` for the renderers.
//  • Revisions: "all" markup underlines insertions and strikes deletions in the author's colour;
//    "simple"/"none" hide deletions and "original" hides insertions — hidden text becomes the same
//    number of zero-width object characters, so offsets survive.
//  • Lists: multilevel counters per list id (Word numbering semantics: numbering continues across
//    interruptions; a level resets every deeper level), with `%1.%2.` templates.
// Every transform is memoised per immutable paragraph + the inputs it depends on, so unchanged
// paragraphs keep their identity and the composition cache keeps hitting.

import { type CharAttrs, type FieldSpec, type Paragraph, type ResolvedChar, type Run, type TextStory, resolveParagraph, resolveRun } from '../model';
import { prepareParagraph, runSpecFor, type LayoutEnv } from '../layout/paragraph';
import { LIST_FORMATS } from '../layout/flow';
import type { ListDefinition, ListLevel, NumberFormat, WriterDocument } from './types';

const OBJ = String.fromCharCode(0xfffc);
export type Markup = 'all' | 'simple' | 'none' | 'original';

export function formatNumber(n: number, f: NumberFormat | undefined): string {
  return (LIST_FORMATS[(f ?? 'decimal') as keyof typeof LIST_FORMATS] ?? LIST_FORMATS.decimal)(n);
}
const SYMBOLS = ['*', '†', '‡', '§', '‖', '¶'];

// ── Author colours ──────────────────────────────────────────────────────────────────────────

const AUTHOR_COLORS = ['#c0392b', '#1f6feb', '#8e44ad', '#16a085', '#d35400', '#2c7a3f', '#b0306a', '#7a5c00'];
export function authorColor(author: string | undefined): string {
  let h = 0;
  for (const c of author ?? '') h = (h * 31 + c.charCodeAt(0)) | 0;
  return AUTHOR_COLORS[Math.abs(h) % AUTHOR_COLORS.length];
}

// ── Numbering ───────────────────────────────────────────────────────────────────────────────

export interface ListInfo { marker: string; level: ListLevel; levelIndex: number }

export function baseListId(id: string): string { const k = id.indexOf('~'); return k < 0 ? id : id.slice(0, k); }

export function listLevelFor(lists: Record<string, ListDefinition>, kind: 'bullet' | 'number', listId: string | undefined, level: number): ListLevel {
  const def = (listId && (lists[listId] ?? lists[baseListId(listId)])) || lists[kind === 'bullet' ? 'bullets' : 'numbers'];
  const lv = def?.levels[Math.max(0, Math.min(8, level - 1))];
  return lv ?? { format: kind === 'bullet' ? 'bullet' : 'decimal', template: '%1.', indent: 24 * level, hanging: 18 };
}

/** List markers for every list paragraph of a story, in order. */
export function numberLists(env: LayoutEnv, story: TextStory, lists: Record<string, ListDefinition>): Map<string, ListInfo> {
  const out = new Map<string, ListInfo>();
  const counters = new Map<string, number[]>();
  for (const p of story.paragraphs) {
    if (p.table) continue;
    const list = prepareParagraph(env, p).para.list;
    if (!list) continue;
    const lvl = Math.max(1, Math.min(9, list.level ?? 1));
    const listId = list.listId ?? (list.kind === 'bullet' ? 'bullets' : 'numbers');
    const def = lists[listId] ?? lists[baseListId(listId)];
    const level = { ...listLevelFor(lists, list.kind, listId, lvl) };
    if (list.format) level.format = list.format;
    if (list.bullet) { level.bullet = list.bullet; level.format = 'bullet'; }
    if (list.template) level.template = list.template;
    if (list.indent) level.indent = list.indent * lvl;
    if (list.kind === 'bullet' && level.format !== 'bullet' && !def) level.format = 'bullet';
    let arr = counters.get(listId);
    if (!arr) counters.set(listId, (arr = []));
    const start = list.start ?? level.start ?? 1;
    arr[lvl - 1] = arr[lvl - 1] === undefined ? start : arr[lvl - 1] + 1;
    arr.length = lvl;
    let marker: string;
    if (level.format === 'bullet' || list.kind === 'bullet' && !list.format) marker = level.bullet ?? '•';
    else if (level.format === 'none') marker = '';
    else {
      const tpl = level.template ?? `%${lvl}.`;
      marker = tpl.replace(/%(\d)/g, (_m, k: string) => {
        const i = Number(k) - 1;
        const lv = i === lvl - 1 ? level : listLevelFor(lists, list.kind, listId, i + 1);
        const n = arr![i] ?? (lv.start ?? 1);
        return lv.format === 'bullet' || lv.format === 'none' ? '' : formatNumber(n, lv.format);
      });
    }
    out.set(p.id, { marker, level, levelIndex: lvl });
  }
  return out;
}

// ── Notes ───────────────────────────────────────────────────────────────────────────────────

export interface NoteNumbers { footnotes: string[]; endnotes: string[]; numberOf: Map<string, string> }

function scanNoteRefs(story: TextStory, out: { foot: string[]; end: string[] }, seen: Set<string>) {
  for (const p of story.paragraphs) {
    if (p.table) { for (const r of p.table.rows) for (const c of r.cells) if (!c.vMerged) scanNoteRefs(c.story, out, seen); continue; }
    for (const r of p.runs) {
      const f = r.attrs?.field;
      if (f?.kind !== 'noteRef' || seen.has(f.id) || r.attrs?.del) continue;
      seen.add(f.id);
      (f.note === 'endnote' ? out.end : out.foot).push(f.id);
    }
  }
}

/** Footnotes and endnotes in reference order with their display numbers. */
export function numberNotes(doc: WriterDocument): NoteNumbers {
  const out = { foot: [] as string[], end: [] as string[] };
  scanNoteRefs(doc.story, out, new Set());
  const numberOf = new Map<string, string>();
  const ff = doc.settings.footnoteFormat ?? 'decimal';
  out.foot.forEach((id, i) => numberOf.set(id, ff === ('symbols' as NumberFormat) ? SYMBOLS[i % SYMBOLS.length].repeat(1 + Math.floor(i / SYMBOLS.length)) : formatNumber(i + 1, ff)));
  out.end.forEach((id, i) => numberOf.set(id, formatNumber(i + 1, doc.settings.endnoteFormat ?? 'lower-roman')));
  return { footnotes: out.foot.filter(id => doc.notes[id]), endnotes: out.end.filter(id => doc.notes[id]), numberOf };
}

// ── Field results ───────────────────────────────────────────────────────────────────────────

export interface FieldContext {
  noteNumber(id: string): string;
  /** Display page number text of the current page (headers/footers) or undefined in the body. */
  page?: string;
  pages?: string;
  sectionPages?: string;
  /** Page number text of a paragraph id or bookmark (from the previous layout pass). */
  pageOf(target: string): string | undefined;
  refText(target: string): string | undefined;
}

export function fieldResult(f: FieldSpec, ctx: FieldContext): string {
  switch (f.kind) {
    case 'noteRef': case 'noteNumber': return ctx.noteNumber(f.id) ?? '?';
    case 'page': return ctx.page ?? f.result ?? '#';
    case 'pages': return ctx.pages ?? f.result ?? '#';
    case 'sectionPages': return ctx.sectionPages ?? ctx.pages ?? '#';
    case 'pageRef': return ctx.pageOf(f.target) ?? f.result ?? '?';
    case 'ref': return ctx.refText(f.target) ?? f.result ?? 'Error! Reference source not found.';
    case 'date': return f.value ?? new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
}

/** Superscript geometry for note references. */
export const NOTE_REF_SCALE = 0.62;
export const NOTE_REF_RAISE = 0.36;

const measureCache = new Map<string, { width: number; ascent: number; descent: number }>();
export function measureGenerated(env: LayoutEnv, c: ResolvedChar, text: string, superscript: boolean): { width: number; ascent: number; descent: number; size: number; rise: number } {
  const size = superscript ? c.fontSize * NOTE_REF_SCALE : c.fontSize;
  const rise = superscript ? c.fontSize * NOTE_REF_RAISE : 0;
  const k = `${c.fontFamily}|${c.fontWeight}|${c.fontStyle}|${size}|${text}`;
  let m = measureCache.get(k);
  if (!m) {
    const para = resolveParagraph(env.sheet, { id: '', runs: [] }).para;
    const run = runSpecFor(env, { ...c, fontSize: size, position: 'normal', field: undefined, object: undefined } as ResolvedChar, 0, text.length, text, para);
    const shaped = text ? env.engine.shape(text, run) : [];
    const met = env.engine.metrics(run.fonts[0]);
    const sc = size / met.upem;
    m = { width: shaped.reduce((w, g) => w + g.xAdvance, 0), ascent: met.ascender * sc, descent: -met.descender * sc };
    if (measureCache.size > 4000) measureCache.clear();
    measureCache.set(k, m);
  }
  return { ...m, ascent: m.ascent + rise, size, rise };
}

// ── Display paragraphs ──────────────────────────────────────────────────────────────────────

const flags = new WeakMap<Paragraph, number>();
const F_FIELD = 1, F_INS = 2, F_DEL = 4, F_FMT = 8;
function paraFlags(p: Paragraph): number {
  let f = flags.get(p);
  if (f === undefined) {
    f = 0;
    for (const r of p.runs) {
      const a = r.attrs;
      if (!a) continue;
      if (a.field) f |= F_FIELD;
      if (a.ins) f |= F_INS;
      if (a.del) f |= F_DEL;
      if (a.fmt) f |= F_FMT;
    }
    flags.set(p, f);
  }
  return f;
}

const memo = new WeakMap<Paragraph, Map<string, Paragraph>>();

/** The paragraph to compose for `p` under the given markup and field context. */
export function displayParagraph(env: LayoutEnv, p: Paragraph, markup: Markup, ctx: FieldContext): Paragraph {
  const f = paraFlags(p);
  if (!f) return p;
  const needsRev = (f & (F_INS | F_DEL)) !== 0 || (markup === 'original' && (f & F_FMT) !== 0);
  const results: string[] = [];
  if (f & F_FIELD) for (const r of p.runs) if (r.attrs?.field) results.push(fieldResult(r.attrs.field, ctx));
  if (!needsRev && !results.length) return p;
  const key = `${needsRev ? markup : '-'}|${results.join('\u0001')}`;
  let m = memo.get(p);
  if (!m) memo.set(p, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const rp = resolveParagraph(env.sheet, p);
  let k = 0;
  const runs: Run[] = p.runs.map(r => {
    let a: CharAttrs | undefined = r.attrs;
    if (!a) return r;
    if (a.field) {
      const text = results[k++];
      const c = resolveRun(env.sheet, rp.char, r);
      const sup = a.field.kind === 'noteRef' || a.field.kind === 'noteNumber';
      const m2 = measureGenerated(env, c, text, sup);
      a = { ...a, position: 'normal', field: { ...a.field, result: text }, object: { id: 'field', width: m2.width, ascent: m2.ascent, descent: m2.descent } };
      return { ...r, attrs: a };
    }
    if (!needsRev) return r;
    const hide = (a.del && markup !== 'all' && markup !== 'original') || (a.ins && markup === 'original');
    if (hide) return { text: OBJ.repeat(r.text.length), styleId: r.styleId, attrs: { ...a, object: { id: 'hidden', width: 0, ascent: 0, descent: 0 } } };
    if (markup === 'all' && (a.ins || a.del)) {
      const color = authorColor((a.del ?? a.ins)!.author);
      return { ...r, attrs: { ...a, color, ...(a.del ? { strike: { color } } : { underline: { color } }) } };
    }
    if (markup === 'original' && a.fmt) return { ...r, attrs: { ...a, ...a.fmt.old, fmt: undefined } };
    return r;
  });
  const out: Paragraph = { ...p, runs };
  m.set(key, out);
  if (m.size > 8) m.delete(m.keys().next().value as string);
  return out;
}

/** Display story for a sub-story (cell, note, header): same transform per paragraph. */
export function displayStory(env: LayoutEnv, s: TextStory, markup: Markup, ctx: FieldContext): TextStory {
  let changed = false;
  const paragraphs = s.paragraphs.map(p => { const d = displayParagraph(env, p, markup, ctx); if (d !== p) changed = true; return d; });
  if (!changed) return s;
  return storyMemo(s, paragraphs);
}
const storyCache = new WeakMap<TextStory, { ps: Paragraph[]; out: TextStory }>();
function storyMemo(s: TextStory, ps: Paragraph[]): TextStory {
  const hit = storyCache.get(s);
  if (hit && hit.ps.length === ps.length && hit.ps.every((p, i) => p === ps[i])) return hit.out;
  const out = { ...s, paragraphs: ps };
  storyCache.set(s, { ps, out });
  return out;
}
