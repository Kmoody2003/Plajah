// document/paginate — lay a WriterDocument out as pages.
//
// The frame chain is generated, not given: every section's page setup yields pages (size,
// margins, header/footer distances) and each page yields column slots, one vertical REGION per
// section that shares the page (continuous section breaks). Paragraphs flow through the slots
// with the engine's composer (total-fit per paragraph, one measure per line) exactly like
// `layoutStory`, plus what a word processor needs on top:
//
//  • page / column / section breaks, keep-with-next, keep-together, widows and orphans;
//  • tables: rows paginate, header rows repeat, cells are stories laid out by the engine;
//  • footnotes: a line that carries a reference only stays on a page if its note fits in the
//    footnote area at the bottom of that page (TeX's insert logic, simplified: notes don't split);
//  • endnotes flow after the body; headers and footers per page (first / even / default);
//  • floating images anchored to a paragraph become exclusions on its page; when a float first
//    lands on a page the layout re-runs so earlier text on that page wraps too;
//  • fields: note numbers from reference order, page numbers per page, PAGEREF/REF from the
//    previous pass (re-run once when they change, like a TOC update);
//  • incremental: a paragraph's placement is cached by (display paragraph object, start state).
//    After an edit every paragraph before it hits; after it, the first paragraph that starts in
//    the same state hits and so does everything after — typing re-composes one paragraph.

import { type LaidLine, type DecorationRect, type StoryLayout, type GlyphRun, type Slot, type TextFrame, commitLine, addDropCap, decorate, firstBaselineOffset, snap, layoutStory } from '../layout/flow';
import { composeParagraph, lineLeading, prepareParagraph, runSpecFor, type LayoutEnv, type PreparedParagraph } from '../layout/paragraph';
import { freeIntervals, type Exclusion } from '../layout/geometry';
import type { EngineParagraph } from '../engine/wasm';
import { type Paragraph, type Position, type TableBlock, type TableCell, type TextStory, type BorderSpec, paragraphLength } from '../model';
import type { DocSection, HeaderFooterKind, PageSetup, StoryTarget, WriterDocument, WriterFloat } from './types';
import { type FieldContext, type ListInfo, type Markup, type NoteNumbers, displayParagraph, displayStory, formatNumber, numberLists, numberNotes } from './display';

// ── Output ──────────────────────────────────────────────────────────────────────────────────

export interface Box { x: number; y: number; width: number; height: number }

/** A story laid out at the origin and placed on a page by an offset. */
export interface SubLayout { target: StoryTarget; page: number; layout: StoryLayout; dx: number; dy: number; box: Box }

export interface PlacedCell extends SubLayout { tableId: string; rowId: string; cellId: string; row: number; col: number; shading?: string; vAlign?: string }
export interface BorderLine { x1: number; y1: number; x2: number; y2: number; spec: BorderSpec }
export interface PlacedTable { tableId: string; page: number; box: Box; rows: { rowId: string; index: number; y: number; height: number; repeated: boolean }[]; cells: PlacedCell[]; borders: BorderLine[]; columnX: number[] }
export interface PlacedFloat { float: WriterFloat; page: number; box: Box }

export interface PageLayout {
  index: number;
  sectionIndex: number;
  sectionId: string;
  setup: PageSetup;
  width: number;
  height: number;
  /** Page number value and its formatted text. */
  number: number;
  numberText: string;
  hfKind: HeaderFooterKind;
  content: Box;
  columns: { x: number; y: number; width: number; height: number }[];
  /** Body (and endnote) lines on this page. */
  lines: LaidLine[];
  decorations: DecorationRect[];
  markers: GlyphRun[];
  tables: PlacedTable[];
  floats: PlacedFloat[];
  notes: SubLayout[];
  noteSeparator?: { x: number; y: number; width: number };
  header?: SubLayout;
  footer?: SubLayout;
  /** Cache signature: equal signatures render identically. */
  sig: string;
  /** Section column separators. */
  separators: { x: number; y1: number; y2: number }[];
}

export interface DocLayout {
  pages: PageLayout[];
  /** The body as one virtual StoryLayout (frames = pages) for caret / hit-test functions. */
  body: StoryLayout;
  /** Cells, notes, headers and footers. */
  subs: SubLayout[];
  /** paragraph id (body) → page index of its first line. */
  paragraphPage: Map<string, number>;
  notes: NoteNumbers;
  lists: Map<string, ListInfo>;
  stats: { ms: number; paragraphs: number; reused: number; placed: number; passes: number };
}

export interface PaginateOptions {
  markup?: Markup;
  /** The previous layout, for PAGEREF/REF/NUMPAGES fields (two-pass like a word processor). */
  previous?: DocLayout | null;
}

// ── Internal page state ─────────────────────────────────────────────────────────────────────

interface Region { top: number; bottom: number; cols: { x: number; width: number }[]; colBase: number; section: number }
interface PageState {
  index: number;
  section: number;
  setup: PageSetup;
  number: number;
  first: boolean;
  hfKind: HeaderFooterKind;
  content: Box;
  regions: Region[];
  notes: string[];
  notesHeight: number;
  lines: LaidLine[];
  decorations: DecorationRect[];
  markers: GlyphRun[];
  tables: PlacedTable[];
  floats: PlacedFloat[];
  exclusions: Exclusion[];
  sig: string[];
  header?: SubLayout;
  footer?: SubLayout;
}

interface FlowState { page: number; region: number; col: number; y: number; atTop: boolean }

interface Placement {
  serial: number;
  lines: LaidLine[];
  decorations: { page: number; d: DecorationRect }[];
  markers: { page: number; r: GlyphRun }[];
  notes: { page: number; id: string }[];
  tables: PlacedTable[];
  end: FlowState;
  pages: number;
  /** Section index → page creation is replayed by the caller. */
}

let serialCounter = 0;
const placementCache = new WeakMap<Paragraph, Map<string, Placement>>();
const subCache = new WeakMap<TextStory, Map<string, StoryLayout>>();

const NOTE_GAP = 6;
const NOTE_SEP = 14;

function subLayout(env: LayoutEnv, story: TextStory, width: number): StoryLayout {
  let m = subCache.get(story);
  if (!m) subCache.set(story, (m = new Map()));
  const k = `${width.toFixed(2)}|${env.fonts.generation}`;
  let l = m.get(k);
  if (!l || (l as unknown as { _sheet?: unknown })._sheet !== env.sheet) {
    l = layoutStory(env, story, [{ id: 'sub', x: 0, y: 0, width: Math.max(8, width), height: 1e6 }]);
    (l as unknown as { _sheet?: unknown })._sheet = env.sheet;
    m.set(k, l);
    if (m.size > 6) m.delete(m.keys().next().value as string);
  }
  return l;
}
function layoutHeight(l: StoryLayout): number {
  let h = 0;
  for (const ln of l.lines) h = Math.max(h, ln.bottom);
  return h;
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────

export function layoutDocument(env: LayoutEnv, doc: WriterDocument, opts: PaginateOptions = {}): DocLayout {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let prev = opts.previous ?? null;
  let out: DocLayout | null = null;
  let passes = 0;
  const knownFloats = new Map<string, number>();
  const stats = { reused: 0, placed: 0 };
  for (let pass = 0; pass < 8; pass++) {
    passes++;
    const r = runPass(env, doc, opts.markup ?? doc.settings.markup ?? 'all', prev, knownFloats, stats);
    out = r.layout;
    if (r.floatsMoved) continue;
    // Fields that depend on layout: re-run once when a page reference changed.
    if (!r.fieldsStable && pass < 3) { prev = out; continue; }
    break;
  }
  out!.stats = { ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, paragraphs: doc.story.paragraphs.length, reused: stats.reused, placed: stats.placed, passes };
  return out!;
}

function sectionIndexMap(doc: WriterDocument): Map<string, number> {
  const m = new Map<string, number>();
  doc.sections.forEach((s, i) => { if (i > 0 && s.startParagraphId) m.set(s.startParagraphId, i); });
  return m;
}

function resolveHF(doc: WriterDocument, sectionIndex: number, kind: HeaderFooterKind, which: 'headers' | 'footers'): string | undefined {
  for (let s = sectionIndex; s >= 0; s--) {
    const id = doc.sections[s][which]?.[kind];
    if (id && doc.headerFooters[id]) return id;
  }
  return undefined;
}

function contentWidth(setup: PageSetup): number {
  return Math.max(48, setup.width - setup.margins.left - setup.margins.right - setup.margins.gutter);
}

function columnsFor(setup: PageSetup, x: number, width: number): { x: number; width: number }[] {
  const n = Math.max(1, setup.columns.widths?.length ?? setup.columns.count ?? 1);
  const gap = setup.columns.gap ?? 36;
  const widths = setup.columns.widths?.length ? setup.columns.widths : Array(n).fill((width - gap * (n - 1)) / n);
  const out: { x: number; width: number }[] = [];
  let cx = x;
  for (let i = 0; i < n; i++) { out.push({ x: cx, width: Math.max(24, widths[i]) }); cx += widths[i] + gap; }
  return out;
}

function runPass(env: LayoutEnv, doc: WriterDocument, markup: Markup, prev: DocLayout | null, knownFloats: Map<string, number>, stats: { reused: number; placed: number }) {
  const story = doc.story;
  const sectionAt = sectionIndexMap(doc);
  const notes = numberNotes(doc);
  const lists = numberLists(env, story, doc.lists);
  const prevPages = prev?.pages.length;
  const pageText = (pi: number) => prev?.pages[pi]?.numberText;
  const refCache = new Map<string, string | undefined>();
  const usedRefs = new Map<string, string | undefined>();
  const bookmarkPara = new Map<string, string>();
  for (const p of story.paragraphs) for (const r of p.runs) for (const b of r.attrs?.bookmarks ?? []) if (!bookmarkPara.has(b)) bookmarkPara.set(b, p.id);
  const baseCtx: FieldContext = {
    noteNumber: id => notes.numberOf.get(id) ?? '?',
    pages: prevPages ? String(prevPages) : undefined,
    pageOf: target => {
      const pid = bookmarkPara.get(target) ?? target;
      const pi = prev?.paragraphPage.get(pid);
      const v = pi === undefined ? undefined : pageText(pi);
      usedRefs.set('p:' + target, v);
      return v;
    },
    refText: target => {
      if (refCache.has(target)) return refCache.get(target);
      const pid = bookmarkPara.get(target) ?? target;
      const p = story.paragraphs.find(q => q.id === pid);
      const v = p ? p.runs.filter(r => !r.attrs?.field && !r.attrs?.del).map(r => r.text).join('').replace(/[\u2028\uFFFC]/g, ' ').trim() : undefined;
      refCache.set(target, v);
      return v;
    },
  };

  const pages: PageState[] = [];
  const subs: SubLayout[] = [];
  const paragraphPage = new Map<string, number>();
  let floatsMoved = false;
  const floatsByAnchor = new Map<string, WriterFloat[]>();
  for (const f of Object.values(doc.floats ?? {})) {
    const a = floatsByAnchor.get(f.anchorParagraphId);
    if (a) a.push(f); else floatsByAnchor.set(f.anchorParagraphId, [f]);
  }

  // ── Pages ───────────────────────────────────────────────────────────────
  const hfHeight = (id: string | undefined, width: number): number => {
    if (!id) return 0;
    const s = doc.headerFooters[id];
    if (!s) return 0;
    return layoutHeight(subLayout(env, displayStory(env, s, markup, { ...baseCtx, page: '8', pages: '88' }), width));
  };
  const newPage = (sectionIndex: number, firstOfSection: boolean): PageState => {
    const sec = doc.sections[sectionIndex];
    const setup = sec.setup;
    const index = pages.length;
    const prevPage = pages[index - 1];
    const startAt = firstOfSection ? setup.pageNumbers?.start : undefined;
    const number = startAt !== undefined ? startAt : (prevPage ? prevPage.number + 1 : 1);
    const hfKind: HeaderFooterKind = firstOfSection && setup.titlePage ? 'first' : doc.settings.oddEvenHeaders && number % 2 === 0 ? 'even' : 'default';
    const m = setup.margins;
    const cw = contentWidth(setup);
    const hh = hfHeight(resolveHF(doc, sectionIndex, hfKind, 'headers'), cw);
    const fh = hfHeight(resolveHF(doc, sectionIndex, hfKind, 'footers'), cw);
    const top = Math.max(m.top, hh ? m.header + hh + 6 : 0);
    const bottom = setup.height - Math.max(m.bottom, fh ? m.footer + fh + 6 : 0);
    const content = { x: m.left + m.gutter, y: top, width: cw, height: Math.max(48, bottom - top) };
    const p: PageState = {
      index, section: sectionIndex, setup, number, first: firstOfSection, hfKind, content,
      regions: [{ top: content.y, bottom: content.y + content.height, cols: columnsFor(setup, content.x, content.width), colBase: 0, section: sectionIndex }],
      notes: [], notesHeight: 0, lines: [], decorations: [], markers: [], tables: [], floats: [], exclusions: [], sig: [],
    };
    // Floats known to land on this page.
    for (const f of Object.values(doc.floats ?? {})) {
      if (knownFloats.get(f.id) !== index) continue;
      const fx = (f.relativeTo === 'page' ? 0 : content.x) + f.x;
      const fy = (f.relativeTo === 'page' ? 0 : content.y) + f.y;
      const box = { x: fx, y: fy, width: f.width, height: f.height };
      p.floats.push({ float: f, page: index, box });
      if (f.wrap !== 'behind' && f.wrap !== 'front') {
        p.exclusions.push({ shape: { kind: 'rect', x: fx, y: fy, w: f.width, h: f.height }, offset: f.distance ?? 9, side: f.wrap === 'topBottom' ? 'jump' : (f.side ?? 'both') });
      }
    }
    pages.push(p);
    return p;
  };
  const pageSig = (pi: number): string => {
    const p = pages[pi];
    if (!p) return '-';
    return `${p.section}|${p.content.y.toFixed(1)}|${p.content.height.toFixed(1)}|${p.regions.map(r => `${r.top.toFixed(1)}:${r.bottom.toFixed(1)}:${r.cols.length}:${r.section}`).join(';')}|${p.notesHeight.toFixed(1)}|${p.floats.map(f => f.float.id + f.box.x + ',' + f.box.y).join(';')}`;
  };

  let curSection = 0;
  newPage(0, true);
  let state: FlowState = { page: 0, region: 0, col: 0, y: pages[0].content.y, atTop: true };

  const ensurePage = (pi: number) => { while (pages.length <= pi) newPage(curSection, false); return pages[pi]; };
  const slotGeom = (s: { page: number; region: number; col: number }) => {
    const p = ensurePage(s.page);
    const r = p.regions[s.region];
    const c = r.cols[s.col];
    const bottom = Math.min(r.bottom, p.content.y + p.content.height - p.notesHeight);
    return { page: p, region: r, x: c.x, width: c.width, top: r.top, bottom, column: r.colBase + s.col };
  };
  const nextSlot = (s: { page: number; region: number; col: number }): FlowState => {
    const p = ensurePage(s.page);
    const r = p.regions[s.region];
    if (s.col + 1 < r.cols.length) return { page: s.page, region: s.region, col: s.col + 1, y: r.top, atTop: true };
    const np = ensurePage(s.page + 1);
    return { page: np.index, region: 0, col: 0, y: np.regions[0].top, atTop: true };
  };

  // ── Paragraph placement ─────────────────────────────────────────────────
  interface Entry { slot: FlowState; baseline: number; x: number; width: number }

  const noteHeight = (id: string, width: number): number => {
    const n = doc.notes[id];
    if (!n) return 0;
    return layoutHeight(subLayout(env, displayStory(env, n.story, markup, baseCtx), width)) + NOTE_GAP;
  };

  const placeParagraph = (p: Paragraph, start: FlowState, nextP: Paragraph | undefined, list: ListInfo | undefined, target: StoryTarget, noteRefs: { offset: number; id: string }[]): Placement => {
    const prep = prepareParagraph(env, p);
    const para = prep.para;
    const listIndent = list ? list.level.indent : 0;
    const linesOut: LaidLine[] = [];
    let st = { ...start };
    // Breaks before.
    if (!st.atTop && para.startOn !== 'anywhere') {
      if (para.startOn === 'next-column') st = nextSlot(st);
      else { const np = ensurePage(st.page + 1); st = { page: np.index, region: 0, col: 0, y: np.regions[0].top, atTop: true }; }
    }
    const spaceBefore = st.atTop ? 0 : para.spaceBefore;

    const buildEntries = (from: FlowState, count: number, leadings: number[], jumps: Set<number>): Entry[] => {
      const entries: Entry[] = [];
      let s = { ...from };
      let first = from.atTop;
      let y = from.y + (from.atTop ? 0 : spaceBefore);
      let prevBaseline = y;
      let line = 0;
      let guard = 0;
      let firstInSlot = true;
      while (entries.length < count && guard++ < count * 40 + 400) {
        const g = slotGeom(s);
        const f: TextFrame = { id: 'p', x: g.x, y: g.top, width: g.width, height: g.bottom - g.top };
        if (jumps.has(line) && !firstInSlot) { s = nextSlot(s); y = s.y; first = true; firstInSlot = true; continue; }
        const lead = leadings[line] ?? prep.nominal.leading;
        let baseline = first ? y + firstBaselineOffset(f, prep.nominal) : prevBaseline + lead;
        if (para.baselineGrid) baseline = snap(f, { frame: 0, column: 0, x: g.x, top: g.top, bottom: g.bottom, width: g.width, contentTop: g.top }, baseline);
        if (baseline + prep.nominal.descent > g.bottom + 0.01 && !(firstInSlot && g.bottom - g.top < lead * 1.5 && s.atTop)) {
          s = nextSlot(s); y = s.y; first = true; firstInSlot = true;
          continue;
        }
        const dropIndent = prep.dropCap && line < prep.dropCap.lines ? prep.dropCap.width + prep.dropCap.gap : 0;
        const startIndent = para.indentStart + listIndent + (line === 0 && !list ? para.indentFirst : 0) + dropIndent;
        const x0 = g.x + Math.max(0, startIndent);
        const x1 = g.x + g.width - para.indentEnd;
        const band0 = baseline - prep.nominal.ascent, band1 = baseline + prep.nominal.descent;
        const excl = g.page.exclusions;
        const minW = Math.max(prep.nominal.size * 4, g.width * 0.15);
        const ivs = excl.length ? freeIntervals(x0, x1, band0, band1, excl, minW) : [{ x: x0, width: Math.max(1, x1 - x0) }];
        if (!ivs.length) { prevBaseline = baseline; first = false; y = baseline; continue; }
        for (const iv of ivs) entries.push({ slot: { ...s }, baseline, x: iv.x, width: iv.width });
        line += ivs.length;
        prevBaseline = baseline;
        first = false;
        firstInSlot = false;
      }
      return entries;
    };

    const place = (from: FlowState, jumps: Set<number>) => {
      let leadings: number[] = [];
      let entries: Entry[] = [];
      let comp: EngineParagraph | null = null;
      let estimate = Math.max(4, Math.ceil((prep.text.length * prep.nominal.size * 0.5) / Math.max(40, slotGeom(from).width) * 1.3) + 3);
      for (let iter = 0; iter < 4; iter++) {
        entries = buildEntries(from, Math.max(estimate, leadings.length + 2), leadings, jumps);
        comp = composeParagraph(env, prep, entries.map(e => e.width));
        const actual = comp.lines.map(l => lineLeading(para.leading, para.justification.autoLeading, Math.max(l.maxSize, 0.01)));
        const needMore = comp.lines.length > entries.length;
        const diff = actual.some((v, i) => Math.abs(v - (leadings[i] ?? prep.nominal.leading)) > 0.25);
        if (!needMore && !diff) break;
        leadings = actual;
        estimate = comp.lines.length + 2;
      }
      const leads = comp!.lines.map(l => lineLeading(para.leading, para.justification.autoLeading, Math.max(l.maxSize, 0.01)));
      return { entries: entries.slice(0, comp!.lines.length), comp: comp!, leadings: leads };
    };

    const slotKey = (s: FlowState) => `${s.page}:${s.region}:${s.col}`;
    let from = st;
    let jumps = new Set<number>();
    let res = place(from, jumps);
    for (let attempt = 0; attempt < 6; attempt++) {
      const groups: { key: string; from: number; count: number }[] = [];
      res.entries.forEach((e, i) => {
        const k = slotKey(e.slot);
        const g = groups[groups.length - 1];
        if (g && g.key === k) g.count++; else groups.push({ key: k, from: i, count: 1 });
      });
      if (groups.length >= 2 && res.comp.lines.length >= 2) {
        if ((para.keepTogether || groups[0].count < para.orphans) && !from.atTop) {
          from = nextSlot(from); jumps = new Set(); res = place(from, jumps); continue;
        }
        const last = groups[groups.length - 1];
        if (last.count < para.widows) {
          const jumpAt = last.from - (para.widows - last.count);
          if (jumpAt >= Math.max(1, para.orphans) && !jumps.has(jumpAt)) { jumps = new Set([...jumps, jumpAt]); res = place(from, jumps); continue; }
          if (!from.atTop && groups.length === 2) { from = nextSlot(from); jumps = new Set(); res = place(from, jumps); continue; }
        }
      }
      // Footnotes: every referenced note must fit on the page of its reference line.
      if (noteRefs.length) {
        const added = new Map<number, number>();
        const seenNotes = new Set<string>();
        let violation = -1;
        res.entries.forEach((e, li) => {
          if (violation >= 0) return;
          const l = res.comp.lines[li];
          const a = l.start + prep.offset, b = l.end + prep.offset;
          const g = slotGeom(e.slot);
          for (const n of noteRefs) {
            if (n.offset < a || n.offset >= b || seenNotes.has(n.id)) continue;
            seenNotes.add(n.id);
            const pg = g.page;
            const extra = (pg.notes.length || added.get(pg.index) ? 0 : NOTE_SEP) + noteHeight(n.id, pg.content.width);
            added.set(pg.index, (added.get(pg.index) ?? 0) + extra);
          }
          const reserve = added.get(g.page.index) ?? 0;
          const firstOfSlot = li === 0 ? e.slot.atTop || from.atTop : slotKey(res.entries[li - 1].slot) !== slotKey(e.slot);
          if (reserve && e.baseline + prep.nominal.descent > g.bottom - reserve + 0.01 && !firstOfSlot) violation = li;
        });
        if (violation >= 0 && !jumps.has(violation)) { jumps = new Set([...jumps, violation]); res = place(from, jumps); continue; }
      }
      break;
    }
    // Keep with next.
    if (para.keepWithNext && nextP && !from.atTop) {
      const lastE = res.entries[res.entries.length - 1];
      if (lastE) {
        const np = prepareParagraph(env, nextP);
        const need = para.spaceAfter + np.para.spaceBefore + np.nominal.leading * Math.max(1, nextP.table ? 1 : np.para.orphans) + np.nominal.descent;
        if (lastE.baseline + need > slotGeom(lastE.slot).bottom) { from = nextSlot(from); res = place(from, new Set()); }
      }
    }
    // Commit.
    const pl: Placement = { serial: ++serialCounter, lines: linesOut, decorations: [], markers: [], notes: [], tables: [], end: from, pages: 0 };
    const seen = new Set<string>();
    for (let li = 0; li < res.comp.lines.length; li++) {
      const e = res.entries[li];
      if (!e) break;
      const g = slotGeom(e.slot);
      const slot: Slot = { frame: g.page.index, column: g.column, x: g.x, top: g.top, bottom: g.bottom, width: g.width, contentTop: g.top };
      const laid = commitLine(env, prep, p, 0, li, res.comp.lines[li], { slot: 0, baseline: e.baseline, x: e.x, width: e.width }, slot, res.leadings[li], res.comp.paraLevel % 2 === 1);
      if (li === 0 && prep.dropCap) addDropCap(env, prep, laid, res.leadings[0]);
      if (li === 0 && list && list.marker) {
        const mk = markerRun(env, prep, laid, list, g.x + para.indentStart);
        if (mk) pl.markers.push({ page: g.page.index, r: mk });
      }
      linesOut.push(laid);
      const decos: DecorationRect[] = [];
      decorate(env, laid, decos);
      for (const d of decos) pl.decorations.push({ page: g.page.index, d });
      for (const n of noteRefs) {
        if (n.offset >= laid.start && n.offset < laid.end && !seen.has(n.id)) { seen.add(n.id); pl.notes.push({ page: g.page.index, id: n.id }); }
      }
    }
    // Paragraph borders / shading per column segment.
    if (para.border || para.shading) {
      const segs: LaidLine[][] = [];
      for (const l of linesOut) { const s = segs[segs.length - 1]; if (s && s[0].frameIndex === l.frameIndex && s[0].column === l.column) s.push(l); else segs.push([l]); }
      for (const s of segs) {
        const pad = para.shading?.padding ?? para.border?.padding ?? 4;
        const x = Math.min(...s.map(l => l.x)) - pad, r = Math.max(...s.map(l => l.x + l.width)) + pad;
        const y = s[0].top - pad, b = s[s.length - 1].bottom + pad;
        if (para.shading?.color) pl.decorations.unshift({ page: s[0].frameIndex, d: { kind: 'shading', x, y, width: r - x, height: b - y, color: para.shading.color, paragraphId: p.id } });
        if (para.border?.color) pl.decorations.push({ page: s[0].frameIndex, d: { kind: 'border', x, y, width: r - x, height: b - y, color: para.border.color, style: String(para.border.width ?? 1), paragraphId: p.id } });
      }
    }
    const lastE = res.entries[res.comp.lines.length - 1];
    // End convention (as layoutStory): the cursor is the last baseline + spaceAfter; the next
    // paragraph's first baseline adds its spaceBefore and its leading.
    pl.end = lastE ? { ...lastE.slot, y: lastE.baseline + para.spaceAfter, atTop: false } : { ...from, atTop: false };
    void target;
    return pl;
  };

  // ── Table placement ─────────────────────────────────────────────────────
  const placeTable = (p: Paragraph, start: FlowState): Placement => {
    const t = p.table!;
    const pl: Placement = { serial: ++serialCounter, lines: [], decorations: [], markers: [], notes: [], tables: [], end: start, pages: 0 };
    let s: FlowState = { ...start };
    // The flow cursor after a paragraph is its last baseline + spaceAfter; tables start below the descent.
    let y = s.atTop ? s.y : s.y + 4;
    const g0 = slotGeom(s);
    const total = t.columns.reduce((a, b) => a + b, 0) || g0.width;
    const scale = total > g0.width ? g0.width / total : 1;
    const cols = t.columns.map(w => w * scale);
    const width = cols.reduce((a, b) => a + b, 0);
    const pad = t.cellPadding ?? 5.4;
    const padY = pad * 0.4;
    // Cell layouts (independent of position).
    const grid = tableGrid(t);
    const cellBox = t.rows.map((row, ri) => row.cells.map((c, ci) => {
      const gc = grid[ri][ci];
      const w = cols.slice(gc, gc + (c.colSpan ?? 1)).reduce((a, b) => a + b, 0);
      if (c.vMerged) return { w, h: 0, layout: null as StoryLayout | null, gc };
      const ds = displayStory(env, c.story, markup, baseCtx);
      const layout = subLayout(env, ds, Math.max(8, w - pad * 2));
      return { w, h: layoutHeight(layout) + padY * 2, layout, gc };
    }));
    const rowH = t.rows.map((row, ri) => {
      let h = 0;
      row.cells.forEach((c, ci) => { if (!c.vMerged && (c.rowSpan ?? 1) <= 1) h = Math.max(h, cellBox[ri][ci].h); });
      if (row.height) h = row.heightRule === 'exact' ? row.height : Math.max(h, row.height);
      return Math.max(h, 8);
    });
    // Vertically merged cells: grow the last row of the span when the content needs it.
    t.rows.forEach((row, ri) => row.cells.forEach((c, ci) => {
      const span = c.rowSpan ?? 1;
      if (span <= 1 || c.vMerged) return;
      const end = Math.min(t.rows.length, ri + span);
      const have = rowH.slice(ri, end).reduce((a, b) => a + b, 0);
      if (cellBox[ri][ci].h > have) rowH[end - 1] += cellBox[ri][ci].h - have;
    }));
    // Row groups that must stay together (vertical merges).
    const groupEnd = t.rows.map((_, ri) => ri);
    t.rows.forEach((row, ri) => row.cells.forEach(c => { if ((c.rowSpan ?? 1) > 1 && !c.vMerged) for (let k = ri; k < Math.min(t.rows.length, ri + (c.rowSpan ?? 1)); k++) groupEnd[ri] = Math.max(groupEnd[ri], ri + (c.rowSpan ?? 1) - 1); }));
    const headerRows: number[] = [];
    for (let ri = 0; ri < t.rows.length && t.rows[ri].header; ri++) headerRows.push(ri);
    const headerH = headerRows.reduce((a, ri) => a + rowH[ri], 0);

    let frag: PlacedTable | null = null;
    const xLeft = (g: { x: number; width: number }) => g.x + (t.align === 'center' ? (g.width - width) / 2 : t.align === 'right' ? g.width - width : (t.indent ?? 0));
    const openFrag = (st: FlowState, yy: number) => {
      const g = slotGeom(st);
      const x = xLeft(g);
      const colX = [x];
      for (const w of cols) colX.push(colX[colX.length - 1] + w);
      frag = { tableId: p.id, page: g.page.index, box: { x, y: yy, width, height: 0 }, rows: [], cells: [], borders: [], columnX: colX };
      pl.tables.push(frag);
    };
    const putRow = (ri: number, yy: number, repeated: boolean) => {
      const f = frag!;
      const row = t.rows[ri];
      f.rows.push({ rowId: row.id, index: ri, y: yy, height: rowH[ri], repeated });
      row.cells.forEach((c, ci) => {
        const b = cellBox[ri][ci];
        if (c.vMerged || !b.layout) return;
        const span = Math.min(t.rows.length - ri, c.rowSpan ?? 1);
        const h = rowH.slice(ri, ri + span).reduce((a, x) => a + x, 0);
        const cx = f.columnX[b.gc];
        const contentH = layoutHeight(b.layout);
        const free = h - padY * 2 - contentH;
        const vOff = c.vAlign === 'center' ? Math.max(0, free / 2) : c.vAlign === 'bottom' ? Math.max(0, free) : 0;
        const cell: PlacedCell = {
          target: { kind: 'cell', tableId: p.id, rowId: row.id, cellId: c.id }, page: f.page, layout: b.layout,
          dx: cx + pad, dy: yy + padY + vOff, box: { x: cx, y: yy, width: b.w, height: h },
          tableId: p.id, rowId: row.id, cellId: c.id, row: ri, col: b.gc, shading: c.shading, vAlign: c.vAlign,
        };
        f.cells.push(cell);
        if (!repeated) for (const ln of b.layout.lines) for (const r of ln.runs) { const fl = r.attrs.field; if (fl?.kind === 'noteRef' && !pl.notes.some(n => n.id === fl.id)) pl.notes.push({ page: f.page, id: fl.id }); }
      });
      f.box.height = yy + rowH[ri] - f.box.y;
    };
    openFrag(s, y);
    for (let ri = 0; ri < t.rows.length;) {
      const gEnd = groupEnd[ri];
      const h = rowH.slice(ri, gEnd + 1).reduce((a, b) => a + b, 0);
      const g = slotGeom(s);
      if (y + h > g.bottom + 0.01 && !(frag!.rows.length === 0 && s.atTop) && !(frag!.rows.every(r => r.repeated) && frag!.rows.length > 0 && y - headerH <= g.top + 0.01 && s.atTop)) {
        // Continue on the next slot, repeating header rows.
        s = nextSlot(s);
        y = s.y;
        openFrag(s, y);
        if (ri > headerRows.length - 1 && headerRows.length) for (const hr of headerRows) { putRow(hr, y, true); y += rowH[hr]; }
        continue;
      }
      for (let k = ri; k <= gEnd; k++) { putRow(k, y, false); y += rowH[k]; }
      s = { ...s, atTop: false };
      ri = gEnd + 1;
    }
    // Borders.
    for (const f of pl.tables) {
      f.borders = tableBorders(t, f);
      f.box.height = Math.max(0, ...f.rows.map(r => r.y + r.height)) - f.box.y;
    }
    const last = pl.tables[pl.tables.length - 1];
    pl.end = { page: last.page, region: s.region, col: s.col, y: last.box.y + last.box.height + 2, atTop: false };
    (pl.end as FlowState & { afterTable?: boolean }).afterTable = true;
    return pl;
  };

  // ── Flow the body ───────────────────────────────────────────────────────
  const flow = (paragraphs: Paragraph[], target: (p: Paragraph) => StoryTarget, isBody: boolean) => {
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const src = paragraphs[pi];
      // Section breaks.
      const si = isBody ? sectionAt.get(src.id) : undefined;
      if (si !== undefined && pi > 0) {
        const sec = doc.sections[si];
        curSection = si;
        const cur = pages[state.page];
        if (sec.break === 'continuous' && cur && state.y < cur.content.y + cur.content.height - 48) {
          const r = cur.regions[state.region];
          const top = state.atTop ? state.y : state.y + 8;
          r.bottom = top;
          const cols = columnsFor(cur.setup, cur.content.x, cur.content.width).length === columnsFor(sec.setup, cur.content.x, cur.content.width).length && sec.setup.columns.count === cur.setup.columns.count ? columnsFor(cur.setup, cur.content.x, cur.content.width) : columnsFor(sec.setup, cur.content.x, cur.content.width);
          const colBase = cur.regions.reduce((n, rr) => n + rr.cols.length, 0);
          cur.regions.push({ top, bottom: cur.content.y + cur.content.height, cols, colBase, section: si });
          state = { page: cur.index, region: cur.regions.length - 1, col: 0, y: top, atTop: true };
        } else {
          let np = newPage(si, true);
          if ((sec.break === 'oddPage' && np.number % 2 === 0) || (sec.break === 'evenPage' && np.number % 2 === 1)) {
            // Blank filler page, then the real first page.
            pages.pop();
            const filler = newPage(si, true);
            filler.sig.push('blank');
            np = newPage(si, false);
          }
          state = { page: np.index, region: 0, col: 0, y: np.regions[0].top, atTop: true };
        }
      }
      const disp = src.table ? src : displayParagraph(env, src, markup, baseCtx);
      const nextSrc = paragraphs[pi + 1];
      const list = lists.get(src.id);
      const startPage = pages[state.page];
      const key = `${state.page}:${state.region}:${state.col}:${state.y.toFixed(2)}:${state.atTop ? 1 : 0}|${pageSig(state.page)}|${pageSig(state.page + 1)}|${curSection}|${list?.marker ?? ''}|${(prepareParagraph(env, src.table ? src : disp).para.keepWithNext && nextSrc && !nextSrc.table) ? prepareParagraph(env, nextSrc).key : ''}|${(state as FlowState & { afterTable?: boolean }).afterTable ? 't' : ''}`;
      let m = placementCache.get(disp);
      if (!m) placementCache.set(disp, (m = new Map()));
      let pl = m.get(key);
      if (pl && (pl as Placement & { sheet?: unknown; gen?: number }).sheet === env.sheet && (pl as Placement & { gen?: number }).gen === env.fonts.generation) {
        stats.reused++;
        // Replay page creation.
        ensurePage(pl.end.page);
      } else {
        const noteRefs: { offset: number; id: string }[] = [];
        if (!src.table) { let off = 0; for (const r of src.runs) { const f = r.attrs?.field; if (f?.kind === 'noteRef' && f.note === 'footnote' && !r.attrs?.del) noteRefs.push({ offset: off, id: f.id }); off += r.text.length; } }
        pl = src.table ? placeTable(src, state) : placeParagraph(disp, state, nextSrc, list, target(src), noteRefs);
        (pl as Placement & { sheet?: unknown; gen?: number }).sheet = env.sheet;
        (pl as Placement & { gen?: number }).gen = env.fonts.generation;
        stats.placed++;
        m.set(key, pl);
        if (m.size > 4) m.delete(m.keys().next().value as string);
      }
      void startPage;
      // Apply effects.
      for (const l of pl.lines) { const pg = ensurePage(l.frameIndex); pg.lines.push(l); }
      for (const d of pl.decorations) ensurePage(d.page).decorations.push(d.d);
      for (const mk of pl.markers) ensurePage(mk.page).markers.push(mk.r);
      for (const t of pl.tables) { const pg = ensurePage(t.page); pg.tables.push(t); for (const c of t.cells) subs.push(c); }
      for (const n of pl.notes) {
        const pg = ensurePage(n.page);
        if (pg.notes.includes(n.id)) continue;
        pg.notesHeight += (pg.notes.length ? 0 : NOTE_SEP) + noteHeight(n.id, pg.content.width);
        pg.notes.push(n.id);
      }
      const touched = new Set<number>([...pl.lines.map(l => l.frameIndex), ...pl.tables.map(t => t.page)]);
      for (const pi2 of touched) pages[pi2].sig.push(String(pl.serial));
      const firstPage = pl.lines[0]?.frameIndex ?? pl.tables[0]?.page;
      if (isBody && firstPage !== undefined) paragraphPage.set(src.id, firstPage);
      // Floats anchored here land on this paragraph's first page.
      const fl = isBody ? floatsByAnchor.get(src.id) : undefined;
      if (fl && firstPage !== undefined) for (const f of fl) if (knownFloats.get(f.id) !== firstPage) { knownFloats.set(f.id, firstPage); floatsMoved = true; }
      if (floatsMoved) return;
      state = pl.end;
    }
  };

  flow(story.paragraphs, () => ({ kind: 'body' }), true);

  // Endnotes flow after the body.
  const endnoteLines = new Map<string, LaidLine[]>();
  if (!floatsMoved && notes.endnotes.length) {
    state = { ...state, y: state.y + 18, atTop: false };
    for (const id of notes.endnotes) {
      const n = doc.notes[id];
      const before = pages.map(p => p.lines.length);
      flow(n.story.paragraphs, () => ({ kind: 'note', id }), false);
      const ls: LaidLine[] = [];
      pages.forEach((p, i) => { for (let k = before[i] ?? 0; k < p.lines.length; k++) ls.push(p.lines[k]); });
      endnoteLines.set(id, ls);
    }
  }

  // ── Per page: headers, footers, footnotes, signatures ───────────────────
  const numberTexts = pages.map(p => formatNumber(p.number, p.setup.pageNumbers?.format));
  const totalPages = String(pages.length);
  let fieldsStable = true;
  for (const [k, v] of usedRefs) {
    const target = k.slice(2);
    const pid = bookmarkPara.get(target) ?? target;
    const pi = paragraphPage.get(pid);
    if ((pi === undefined ? undefined : numberTexts[pi]) !== v) { fieldsStable = false; break; }
  }
  for (const p of pages) {
    const cw = p.content.width;
    const ctx: FieldContext = { ...baseCtx, page: numberTexts[p.index], pages: totalPages, sectionPages: String(pages.filter(q => q.section === p.section).length) };
    const hid = resolveHF(doc, p.section, p.hfKind, 'headers');
    if (hid) {
      const layout = subLayout(env, displayStory(env, doc.headerFooters[hid], markup, ctx), cw);
      const sub: SubLayout = { target: { kind: 'headerFooter', id: hid }, page: p.index, layout, dx: p.content.x, dy: p.setup.margins.header, box: { x: p.content.x, y: p.setup.margins.header, width: cw, height: layoutHeight(layout) } };
      p.header = sub; subs.push(sub);
    }
    const fid = resolveHF(doc, p.section, p.hfKind, 'footers');
    if (fid) {
      const layout = subLayout(env, displayStory(env, doc.headerFooters[fid], markup, ctx), cw);
      const h = layoutHeight(layout);
      const sub: SubLayout = { target: { kind: 'headerFooter', id: fid }, page: p.index, layout, dx: p.content.x, dy: p.setup.height - p.setup.margins.footer - h, box: { x: p.content.x, y: p.setup.height - p.setup.margins.footer - h, width: cw, height: h } };
      p.footer = sub; subs.push(sub);
    }
  }
  const noteSubs: SubLayout[][] = pages.map(p => {
    if (!p.notes.length) return [];
    let y = p.content.y + p.content.height - p.notesHeight + NOTE_SEP;
    return p.notes.map(id => {
      const layout = subLayout(env, displayStory(env, doc.notes[id].story, markup, baseCtx), p.content.width);
      const h = layoutHeight(layout);
      const sub: SubLayout = { target: { kind: 'note', id }, page: p.index, layout, dx: p.content.x, dy: y, box: { x: p.content.x, y, width: p.content.width, height: h } };
      y += h + NOTE_GAP;
      subs.push(sub);
      return sub;
    });
  });
  for (const [id, ls] of endnoteLines) subs.push({ target: { kind: 'note', id }, page: ls[0]?.frameIndex ?? 0, layout: virtualLayout(ls, pages), dx: 0, dy: 0, box: { x: 0, y: 0, width: 0, height: 0 } });

  const pageOut: PageLayout[] = pages.map((p, i) => {
    const sec = doc.sections[p.section];
    const columns: PageLayout['columns'] = [];
    const separators: PageLayout['separators'] = [];
    for (const r of p.regions) {
      for (const c of r.cols) columns.push({ x: c.x, y: r.top, width: c.width, height: r.bottom - r.top });
      const rs = doc.sections[r.section].setup;
      if (rs.columns.separator && r.cols.length > 1) {
        const maxY = Math.max(r.top, ...p.lines.filter(l => l.baseline >= r.top && l.baseline <= r.bottom).map(l => l.bottom));
        for (let k = 1; k < r.cols.length; k++) separators.push({ x: (r.cols[k - 1].x + r.cols[k - 1].width + r.cols[k].x) / 2, y1: r.top, y2: maxY });
      }
    }
    const notesSep = p.notes.length ? { x: p.content.x, y: p.content.y + p.content.height - p.notesHeight + NOTE_SEP / 2, width: Math.min(144, p.content.width * 0.33) } : undefined;
    const hk = p.header ? `h${(p.header.layout as unknown as { _id?: number })._id ?? subId(p.header.layout)}` : '';
    const fk = p.footer ? `f${subId(p.footer.layout)}` : '';
    const nk = noteSubs[i].map(n => subId(n.layout) + '@' + n.dy.toFixed(1)).join(',');
    return {
      index: i, sectionIndex: p.section, sectionId: sec.id, setup: p.setup, width: p.setup.width, height: p.setup.height,
      number: p.number, numberText: numberTexts[i], hfKind: p.hfKind, content: p.content, columns,
      lines: p.lines, decorations: p.decorations, markers: p.markers, tables: p.tables, floats: p.floats, notes: noteSubs[i],
      noteSeparator: notesSep, header: p.header, footer: p.footer, separators,
      sig: `${p.setup.width}x${p.setup.height}|${p.sig.join(',')}|${hk}|${fk}|${nk}|${p.floats.map(f => f.float.id + ':' + f.box.x + ',' + f.box.y + ',' + f.box.width + ',' + f.box.height + ':' + f.float.mediaId).join(';')}|${markup}`,
    };
  });
  const bodyLines: LaidLine[] = [];
  const endIds = new Set([...endnoteLines.values()].flat());
  for (const p of pages) for (const l of p.lines) if (!endIds.has(l)) bodyLines.push(l);
  const layout: DocLayout = {
    pages: pageOut,
    body: virtualLayout(bodyLines, pages),
    subs, paragraphPage, notes, lists,
    stats: { ms: 0, paragraphs: 0, reused: 0, placed: 0, passes: 0 },
  };
  return { layout, floatsMoved, fieldsStable };
}

let subIds = 0;
const subIdMap = new WeakMap<StoryLayout, number>();
function subId(l: StoryLayout): number {
  let v = subIdMap.get(l);
  if (v === undefined) { v = ++subIds; subIdMap.set(l, v); }
  return v;
}

/** A StoryLayout over lines that live on pages (frames = pages), for caret / hit-test functions. */
export function virtualLayout(lines: LaidLine[], pages: { setup: PageSetup; regions?: Region[]; content: Box }[]): StoryLayout {
  // Lines must be in story order; they already are (flow order).
  const paragraphs: StoryLayout['paragraphs'] = [];
  lines.forEach((l, i) => {
    const last = paragraphs[paragraphs.length - 1];
    if (last && last.id === l.paragraphId) last.lineCount++;
    else paragraphs.push({ id: l.paragraphId, firstLine: i, lineCount: 1 });
  });
  const frames = pages.map((p, i) => {
    const columns: { x: number; y: number; width: number; height: number }[] = [];
    for (const r of p.regions ?? []) for (const c of r.cols) columns.push({ x: c.x, y: r.top, width: c.width, height: r.bottom - r.top });
    if (!columns.length) columns.push({ x: p.content.x, y: p.content.y, width: p.content.width, height: p.content.height });
    return { frame: { id: `page${i}`, x: 0, y: 0, width: p.setup.width, height: p.setup.height } as TextFrame, columns, lines: lines.filter(l => l.frameIndex === i), decorations: [] };
  });
  return { frames, lines, paragraphs, overflow: false, missing: [], stats: { paragraphs: paragraphs.length, lines: lines.length, ms: 0 } };
}

/** Marker glyph run (bullet / number) left-aligned at the level's hanging position. */
function markerRun(env: LayoutEnv, prep: PreparedParagraph, line: LaidLine, list: ListInfo, base: number): GlyphRun | null {
  const c = prep.styles[0] ?? prep.char;
  const text = list.marker;
  const run = runSpecFor(env, { ...c, field: undefined, object: undefined, position: 'normal' } as typeof c, 0, text.length, text, prep.para);
  const shaped = env.engine.shape(text, run);
  const w = shaped.reduce((s, g) => s + g.xAdvance, 0);
  const textX = base + list.level.indent;
  let x = base + list.level.indent - list.level.hanging;
  if (x + w > textX - 3) x = Math.max(base, textX - 3 - w);
  const x0 = x;
  const xs: number[] = [], ys: number[] = [];
  for (const g of shaped) { xs.push(x + g.xOffset); ys.push(line.baseline - g.yOffset); x += g.xAdvance; }
  return { font: shaped[0]?.font ?? run.fonts[0], size: c.fontSize, color: c.color, y: line.baseline, x: x0, width: w, scaleX: 1, level: 0, flags: 0, glyphs: shaped.map(g => g.gid), xs, ys, clusters: shaped.map(() => -1), styleIndex: -2, attrs: c, paragraphId: line.paragraphId };
}

// ── Table geometry ──────────────────────────────────────────────────────────────────────────

/** Grid column index of every cell (cells × colSpan cover the grid). */
export function tableGrid(t: TableBlock): number[][] {
  return t.rows.map(r => { let gc = 0; return r.cells.map(c => { const s = gc; gc += c.colSpan ?? 1; return s; }); });
}

const DEFAULT_BORDER: BorderSpec = { width: 0.75, color: '#3a3448', style: 'single' };

function tableBorders(t: TableBlock, f: PlacedTable): BorderLine[] {
  const out: BorderLine[] = [];
  const tb = t.borders ?? { top: DEFAULT_BORDER, bottom: DEFAULT_BORDER, left: DEFAULT_BORDER, right: DEFAULT_BORDER, insideH: DEFAULT_BORDER, insideV: DEFAULT_BORDER };
  const x0 = f.box.x, x1 = f.box.x + f.box.width;
  const y0 = f.box.y, y1 = f.box.y + f.box.height;
  for (const c of f.cells) {
    const cell = t.rows[c.row].cells.find(q => q.id === c.cellId) as TableCell | undefined;
    const b = cell?.borders ?? {};
    const L = c.box.x, R = c.box.x + c.box.width, T = c.box.y, B = c.box.y + c.box.height;
    const pick = (own: BorderSpec | undefined, outer: BorderSpec | undefined, inner: BorderSpec | undefined, isOuter: boolean) => own ?? (isOuter ? outer : inner);
    const sides: [BorderSpec | undefined, number, number, number, number][] = [
      [pick(b.top, tb.top, tb.insideH, Math.abs(T - y0) < 0.5), L, T, R, T],
      [pick(b.bottom, tb.bottom, tb.insideH, Math.abs(B - y1) < 0.5), L, B, R, B],
      [pick(b.left, tb.left, tb.insideV, Math.abs(L - x0) < 0.5), L, T, L, B],
      [pick(b.right, tb.right, tb.insideV, Math.abs(R - x1) < 0.5), R, T, R, B],
    ];
    for (const [spec, a, b2, c2, d] of sides) if (spec && spec.style !== 'none' && spec.width > 0) out.push({ x1: a, y1: b2, x2: c2, y2: d, spec });
  }
  // De-duplicate shared edges.
  const seen = new Set<string>();
  return out.filter(l => { const k = [l.x1, l.y1, l.x2, l.y2].map(v => v.toFixed(1)).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ── Queries ─────────────────────────────────────────────────────────────────────────────────

/** Page index holding a body position (-1 when not laid out). */
export function pageOfPosition(layout: DocLayout, pos: Position): number {
  const pr = layout.body.paragraphs.find(p => p.id === pos.paragraphId);
  if (!pr) return layout.paragraphPage.get(pos.paragraphId) ?? -1;
  for (let k = pr.firstLine; k < pr.firstLine + pr.lineCount; k++) {
    const l = layout.body.lines[k];
    if (pos.offset < l.end || k === pr.firstLine + pr.lineCount - 1) return l.frameIndex;
  }
  return -1;
}

export function findSub(layout: DocLayout, target: StoryTarget, page?: number): SubLayout | undefined {
  const k = JSON.stringify(target);
  let best: SubLayout | undefined;
  for (const s of layout.subs) if (JSON.stringify(s.target) === k) { if (page === undefined || s.page === page) return s; best ??= s; }
  return best;
}

export { paragraphLength };
