// document/ops — serialisable document edits and their pure reducer.
//
// Two op kinds cover everything:
//   • `text`  — text-model ops (`TextOp`, including the paragraph-granular replace / insert /
//               remove ops) applied to ONE story: the body, a table cell, a note or a header /
//               footer. Typing produces small insert/delete ops (cheap to coalesce, CRDT-shaped);
//               complex commands (tracked edits, review, tables, TOC) produce paragraph-level
//               diffs via `diffParagraphOps`, so every change is still an op on stable ids.
//   • `set`   — last-writer-wins on one record of the document parts (a comment, a note, a
//               section list, the stylesheet, settings…), keyed by id where the part is a record.
// `applyWriterOps` is pure and shares structure, so Tela's snapshot history stays cheap.

import { type Paragraph, type Position, type StyleSheet, type TextOp, type TextRange, type TextStory, applyOp, newId, paragraphLength } from '../model';
import type { DocSection, StoryTarget, WriterDocument, WriterDocumentParts } from './types';

export type RecordKey = 'headerFooters' | 'notes' | 'comments' | 'media' | 'floats' | 'lists';

export type WriterOp =
  | { type: 'text'; target: StoryTarget; ops: TextOp[] }
  | { type: 'set'; key: RecordKey; id: string; value: unknown | null }
  | { type: 'set'; key: 'sections' | 'styles' | 'settings' | 'properties'; value: unknown };

// ── Story access ────────────────────────────────────────────────────────────────────────────

export function findTable(story: TextStory, tableId: string): Paragraph | undefined {
  return story.paragraphs.find(p => p.id === tableId && p.table);
}

export function getStory(doc: WriterDocument, t: StoryTarget): TextStory | undefined {
  switch (t.kind) {
    case 'body': return doc.story;
    case 'note': return doc.notes[t.id]?.story;
    case 'headerFooter': return doc.headerFooters[t.id];
    case 'cell': {
      const tp = findTable(doc.story, t.tableId);
      const row = tp?.table?.rows.find(r => r.id === t.rowId);
      return row?.cells.find(c => c.id === t.cellId)?.story;
    }
  }
}

export function setStory(doc: WriterDocument, t: StoryTarget, story: TextStory): WriterDocument {
  switch (t.kind) {
    case 'body': return { ...doc, story };
    case 'note': { const n = doc.notes[t.id]; return n ? { ...doc, notes: { ...doc.notes, [t.id]: { ...n, story } } } : doc; }
    case 'headerFooter': return { ...doc, headerFooters: { ...doc.headerFooters, [t.id]: story } };
    case 'cell': {
      const paragraphs = doc.story.paragraphs.map(p => {
        if (p.id !== t.tableId || !p.table) return p;
        return { ...p, table: { ...p.table, rows: p.table.rows.map(r => r.id !== t.rowId ? r : { ...r, cells: r.cells.map(c => c.id !== t.cellId ? c : { ...c, story }) }) } };
      });
      return { ...doc, story: { ...doc.story, paragraphs } };
    }
  }
}

// ── Reducer ─────────────────────────────────────────────────────────────────────────────────

export function applyTextOps(story: TextStory, ops: TextOp[], sheet?: StyleSheet): TextStory {
  let s = story;
  for (const op of ops) s = applyOp(s, op, sheet).story;
  return s;
}

export function applyWriterOp(doc: WriterDocument, op: WriterOp): WriterDocument {
  if (op.type === 'text') {
    const story = getStory(doc, op.target);
    if (!story) return doc;
    let next = applyTextOps(story, op.ops, doc.styles);
    if (op.target.kind === 'body') next = normalizeBody(next);
    return setStory(doc, op.target, next);
  }
  if ('id' in op) {
    const rec = { ...(doc[op.key] as Record<string, unknown>) };
    if (op.value === null || op.value === undefined) delete rec[op.id]; else rec[op.id] = op.value;
    return { ...doc, [op.key]: rec };
  }
  return { ...doc, [op.key]: op.value } as WriterDocument;
}

export function applyWriterOps(doc: WriterDocument, ops: WriterOp[]): WriterDocument {
  let d = doc;
  for (const op of ops) d = applyWriterOp(d, op);
  return pruneSections(d);
}

/** Body invariants: a table is never the last block (the caret needs somewhere to land after it). */
export function normalizeBody(s: TextStory): TextStory {
  const last = s.paragraphs[s.paragraphs.length - 1];
  if (last?.table) return { ...s, paragraphs: [...s.paragraphs, { id: newId(), runs: [{ text: '' }] }] };
  return s;
}

/** Sections whose first paragraph was deleted merge into the previous section. */
export function pruneSections(d: WriterDocument): WriterDocument {
  if (d.sections.length <= 1) return d;
  const ids = new Set(d.story.paragraphs.map(p => p.id));
  const keep = d.sections.filter((s, i) => i === 0 || (s.startParagraphId && ids.has(s.startParagraphId)));
  if (keep.length === d.sections.length) {
    // Keep section order consistent with paragraph order.
    const order = new Map(d.story.paragraphs.map((p, i) => [p.id, i]));
    let sorted = true;
    for (let i = 2; i < keep.length; i++) if ((order.get(keep[i].startParagraphId!) ?? 0) < (order.get(keep[i - 1].startParagraphId!) ?? 0)) sorted = false;
    if (sorted) return d;
    const [first, ...rest] = keep;
    return { ...d, sections: [first, ...rest.sort((a, b) => (order.get(a.startParagraphId!) ?? 0) - (order.get(b.startParagraphId!) ?? 0))] };
  }
  return { ...d, sections: keep };
}

// ── Paragraph diff → ops ────────────────────────────────────────────────────────────────────

/** Ops that turn `before` into `after` at paragraph granularity (ids stable where kept). */
export function diffParagraphOps(before: TextStory, after: TextStory): TextOp[] {
  const ops: TextOp[] = [];
  const afterIds = new Set(after.paragraphs.map(p => p.id));
  const removed = before.paragraphs.filter(p => !afterIds.has(p.id)).map(p => p.id);
  if (removed.length) ops.push({ type: 'removeParagraphs', ids: removed });
  const beforeMap = new Map(before.paragraphs.map(p => [p.id, p]));
  // Kept paragraphs must appear in the same relative order; a moved paragraph is removed + inserted.
  const keptOrder = before.paragraphs.filter(p => afterIds.has(p.id)).map(p => p.id);
  let k = 0;
  const moved = new Set<string>();
  for (const p of after.paragraphs) {
    if (!beforeMap.has(p.id)) continue;
    if (keptOrder[k] === p.id) { k++; continue; }
    moved.add(p.id);
  }
  if (moved.size) { ops.push({ type: 'removeParagraphs', ids: [...moved] }); }
  let prev: string | null = null;
  let pending: Paragraph[] = [];
  let pendingAfter: string | null = null;
  const flush = () => { if (pending.length) { ops.push({ type: 'insertParagraphs', afterId: pendingAfter, paragraphs: pending }); pending = []; } };
  for (const p of after.paragraphs) {
    const old = beforeMap.get(p.id);
    if (old && !moved.has(p.id)) {
      flush();
      if (old !== p) ops.push({ type: 'replaceParagraph', paragraph: p });
    } else {
      if (!pending.length) pendingAfter = prev;
      pending.push(p);
    }
    prev = p.id;
  }
  flush();
  return ops;
}

/** A `text` op from a before/after pair of one story (empty array when nothing changed). */
export function storyDiff(target: StoryTarget, before: TextStory, after: TextStory): WriterOp[] {
  if (before === after) return [];
  const ops = diffParagraphOps(before, after);
  return ops.length ? [{ type: 'text', target, ops }] : [];
}

// ── Position mapping (keeps a selection valid across an op) ────────────────────────────────

export function mapPosition(before: TextStory, after: TextStory, pos: Position): Position {
  const p = after.paragraphs.find(q => q.id === pos.paragraphId);
  if (p) return { paragraphId: p.id, offset: Math.min(pos.offset, paragraphLength(p)) };
  // Paragraph vanished: land at the nearest surviving paragraph before it.
  const i = before.paragraphs.findIndex(q => q.id === pos.paragraphId);
  const ids = new Set(after.paragraphs.map(q => q.id));
  for (let k = i - 1; k >= 0; k--) if (ids.has(before.paragraphs[k].id)) { const q = after.paragraphs.find(x => x.id === before.paragraphs[k].id)!; return { paragraphId: q.id, offset: paragraphLength(q) }; }
  const q = after.paragraphs[0];
  return { paragraphId: q.id, offset: 0 };
}
export function mapRange(before: TextStory, after: TextStory, r: TextRange): TextRange {
  return { anchor: mapPosition(before, after, r.anchor), focus: mapPosition(before, after, r.focus) };
}

/** First position where two versions of a story differ (caret placement after undo/redo). */
export function firstDifference(a: TextStory, b: TextStory): Position | null {
  const n = Math.min(a.paragraphs.length, b.paragraphs.length);
  for (let i = 0; i < n; i++) {
    if (a.paragraphs[i] === b.paragraphs[i]) continue;
    const pb = b.paragraphs[i];
    if (a.paragraphs[i].id !== pb.id) return { paragraphId: pb.id, offset: 0 };
    const ta = a.paragraphs[i].runs.map(r => r.text).join(''), tb = pb.runs.map(r => r.text).join('');
    let k = 0;
    while (k < ta.length && k < tb.length && ta[k] === tb[k]) k++;
    // Caret after the inserted text (or at the deletion point).
    let e = 0;
    while (e < ta.length - k && e < tb.length - k && ta[ta.length - 1 - e] === tb[tb.length - 1 - e]) e++;
    return { paragraphId: pb.id, offset: Math.max(k, tb.length - e) };
  }
  if (a.paragraphs.length !== b.paragraphs.length) {
    const p = b.paragraphs[Math.min(n, b.paragraphs.length - 1)];
    return { paragraphId: p.id, offset: 0 };
  }
  return null;
}

// ── Coalescing (undo granularity) ───────────────────────────────────────────────────────────

const TYPING = new Set<TextOp['type']>(['insertText', 'deleteRange', 'splitParagraph', 'mergeParagraphs']);
/** 'typing:<target>' when the batch is plain typing in one story (merges into one undo step). */
export function writerCoalesce(ops: WriterOp[]): string | null {
  if (!ops.length || ops.some(o => o.type !== 'text')) return null;
  const t = ops as Extract<WriterOp, { type: 'text' }>[];
  const target = JSON.stringify(t[0].target);
  if (t.some(o => JSON.stringify(o.target) !== target || o.ops.some(x => !TYPING.has(x.type)))) return null;
  // A paragraph split ends a typing burst after it (Enter starts a new undo step in Word).
  return `typing:${target}`;
}

export function setSections(sections: DocSection[]): WriterOp { return { type: 'set', key: 'sections', value: sections }; }
export type { WriterDocumentParts };
