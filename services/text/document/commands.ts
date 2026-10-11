// document/commands — every Writer editing command as a pure function
//   (document, selection, context) → { ops, selection, doc }.
//
// The editor never mutates: it calls a command, dispatches the returned ops (Tela's reducer
// applies the same ops for history, autosave and collaboration) and moves the caret to the
// returned selection. Plain typing produces small insert/delete text ops so undo can coalesce
// a burst into one step; everything else produces paragraph-level diffs on stable ids.
// Track changes, lists, tables, notes, breaks, comments, fields, links, images and the TOC all
// live here so they are testable in node without a browser.

import {
  type CharAttrs, type Paragraph, type ParaAttrs, type Position, type RevisionMark, type Run, type TextOp, type TextRange, type TextStory, type StyleSheet, type ListAttrs,
  applyCharAttrs, deleteRange, insertFragment, insertText, isCollapsed, newId, normalizeRuns, orderRange, paragraphIndex, paragraphIdsInRange,
  paragraphLength, paragraphText, runAt, setCharacterStyle, setParaAttrs, setParagraphStyle, splitParagraph, typingFormat,
} from '../model';
import { moveByGrapheme, moveByWord, wordRangeAt } from '../editing/caret';
import { type StoryTarget, type WriterDocument, type WriterComment, type WriterMedia, type WriterFloat, type DocSection, type HeaderFooterKind, BODY, sameTarget } from './types';
import { type WriterOp, applyWriterOps, findTable, getStory, storyDiff } from './ops';
import { addCommentMark, decideAll, decideById, decideInRange, newMark, removeCommentMark, resolveRevisions, sameAuthor, trackedDelete, trackedFormat, editRuns } from './revisions';
import { cellStory, createTable } from './tables';
import { headingLevel } from './defaults';
import { readingText } from './blocks';

const LSEP = String.fromCharCode(0x2028);
const OBJ = String.fromCharCode(0xfffc);

export interface DocSelection { target: StoryTarget; anchor: Position; focus: Position }
export interface Author { name: string; id?: string }
export interface CommandContext {
  doc: WriterDocument;
  sel: DocSelection;
  author: Author;
  /** Formatting picked with a collapsed caret, applied to the next typed text. */
  pending?: CharAttrs | null;
}
export interface CommandResult { ops: WriterOp[]; sel: DocSelection; doc: WriterDocument; label?: string; pending?: CharAttrs | null }

export const collapsed = (s: DocSelection) => isCollapsed({ anchor: s.anchor, focus: s.focus });
export const rangeOf = (s: DocSelection): TextRange => ({ anchor: s.anchor, focus: s.focus });
export const caretAt = (target: StoryTarget, p: Position): DocSelection => ({ target, anchor: p, focus: p });

function tracking(ctx: CommandContext): RevisionMark | null {
  return ctx.doc.settings.trackChanges ? newMark(ctx.author.name, ctx.author.id) : null;
}

function result(ctx: CommandContext, ops: WriterOp[], sel: DocSelection, label?: string, pending?: CharAttrs | null): CommandResult {
  return { ops, sel, doc: ops.length ? applyWriterOps(ctx.doc, ops) : ctx.doc, label, pending: pending === undefined ? null : pending };
}

/** Run a story transform on the selection's story and diff it into ops. */
function editStory(ctx: CommandContext, f: (s: TextStory) => { story: TextStory; sel?: DocSelection }, label?: string): CommandResult {
  const story = getStory(ctx.doc, ctx.sel.target);
  if (!story) return result(ctx, [], ctx.sel);
  const r = f(story);
  return result(ctx, storyDiff(ctx.sel.target, story, r.story), r.sel ?? ctx.sel, label);
}

function storyOf(ctx: CommandContext): TextStory { return getStory(ctx.doc, ctx.sel.target)!; }

// ── Typing ──────────────────────────────────────────────────────────────────────────────────

/** Formatting for text typed at `pos`: the run before the caret (minus objects/fields/deletions), plus pending. */
export function formatAt(story: TextStory, pos: Position, pending?: CharAttrs | null, mark?: RevisionMark | null): Pick<Run, 'styleId' | 'attrs'> {
  const p = story.paragraphs[paragraphIndex(story, pos.paragraphId)];
  const before = runAt(p, pos.offset);
  const base = typingFormat(before);
  let attrs: CharAttrs | undefined = base.attrs ? { ...base.attrs } : undefined;
  if (attrs?.ins) delete attrs.ins;
  // Links do not extend past their end (Word).
  if (attrs?.href && pos.offset === runEnd(p, pos.offset)) { delete attrs.href; }
  const styleId = base.styleId === 'link' && !attrs?.href ? undefined : base.styleId;
  if (pending) attrs = { ...attrs, ...pending };
  if (mark) {
    // Continue the author's insertion when typing right after it.
    const prevIns = before.attrs?.ins && sameAuthor(before.attrs.ins, mark) && pos.offset > 0 ? before.attrs.ins : null;
    attrs = { ...attrs, ins: prevIns ?? mark };
  }
  for (const k of Object.keys(attrs ?? {})) if ((attrs as Record<string, unknown>)[k] === undefined) delete (attrs as Record<string, unknown>)[k];
  return { styleId, attrs: attrs && Object.keys(attrs).length ? attrs : undefined };
}
function runEnd(p: Paragraph, offset: number): number {
  let pos = 0;
  for (const r of p.runs) { const end = pos + r.text.length; if (offset > pos && offset <= end) return end; pos = end; }
  return 0;
}

/** Delete the selection (tracked or not) and return the collapsed caret. */
function deleteSelection(ctx: CommandContext, story: TextStory, mark: RevisionMark | null): { story: TextStory; at: Position; ops: TextOp[] | null } {
  const range = rangeOf(ctx.sel);
  if (isCollapsed(range)) return { story, at: ctx.sel.focus, ops: [] };
  const safe = safeRange(story, range);
  if (mark) { const r = trackedDelete(story, safe, mark); return { story: r.story, at: r.caret, ops: null }; }
  const r = deleteRange(story, safe);
  return { story: r.story, at: r.caret, ops: [{ type: 'deleteRange', range: safe }] };
}

/** Clamp range ends off table paragraphs (a body selection never starts or ends inside a table). */
export function safeRange(story: TextStory, range: TextRange): TextRange {
  const [a, b] = orderRange(story, range);
  let ia = paragraphIndex(story, a.paragraphId), ib = paragraphIndex(story, b.paragraphId);
  let A = a, B = b;
  while (story.paragraphs[ia]?.table && ia < ib) { ia++; A = { paragraphId: story.paragraphs[ia].id, offset: 0 }; }
  while (story.paragraphs[ib]?.table && ib > ia) { ib--; B = { paragraphId: story.paragraphs[ib].id, offset: paragraphLength(story.paragraphs[ib]) }; }
  return { anchor: A, focus: B };
}

export function typeText(ctx: CommandContext, text: string): CommandResult {
  const story = storyOf(ctx);
  const mark = tracking(ctx);
  const del = deleteSelection(ctx, story, mark);
  let s = del.story;
  const at = del.at;
  const format = formatAt(s, at, ctx.pending, mark);
  const newIds: string[] = [];
  const r = insertText(s, at, text, format, () => { const id = newId(); newIds.push(id); return id; });
  if (mark && newIds.length) {
    // Tracked paragraph splits inside the typed text mark the new paragraph marks as inserted.
    const ids = [at.paragraphId, ...newIds.slice(0, -1)];
    s = { ...r.story, paragraphs: r.story.paragraphs.map(p => (ids.includes(p.id) ? { ...p, rev: { ...p.rev, ins: mark } } : p)) };
  } else s = r.story;
  const sel = caretAt(ctx.sel.target, r.caret);
  if (del.ops && !mark && !newIds.length) {
    const ops: TextOp[] = [...del.ops, { type: 'insertText', at, text, format, newIds }];
    return result(ctx, [{ type: 'text', target: ctx.sel.target, ops }], sel, 'Typing');
  }
  return result(ctx, storyDiff(ctx.sel.target, story, s), sel, 'Typing');
}

export function insertLineBreak(ctx: CommandContext): CommandResult { return typeText(ctx, LSEP); }

/** Backspace (dir -1) / Delete (dir 1); `word` with Ctrl. */
export function deleteCmd(ctx: CommandContext, dir: 1 | -1, word = false): CommandResult {
  const story = storyOf(ctx);
  const mark = tracking(ctx);
  if (!collapsed(ctx.sel)) {
    const del = deleteSelection(ctx, story, mark);
    if (del.ops) return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: del.ops }], caretAt(ctx.sel.target, del.at), 'Delete');
    return result(ctx, storyDiff(ctx.sel.target, story, del.story), caretAt(ctx.sel.target, del.at), 'Delete');
  }
  const from = ctx.sel.focus;
  const pi = paragraphIndex(story, from.paragraphId);
  const p = story.paragraphs[pi];
  // Paragraph boundary.
  if (dir < 0 && from.offset === 0) {
    const a = p.attrs;
    if (a?.list) {
      const lvl = a.list.level ?? 1;
      const next: Partial<ParaAttrs> = lvl > 1 ? { list: { ...a.list, level: lvl - 1 } } : { list: undefined };
      return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'setParaAttrs', paragraphIds: [p.id], patch: next }] }], ctx.sel, 'Remove bullet');
    }
    if (a?.startOn && a.startOn !== 'anywhere') {
      return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'setParaAttrs', paragraphIds: [p.id], patch: { startOn: undefined } }] }], ctx.sel, 'Remove break');
    }
    if (pi === 0) return result(ctx, [], ctx.sel);
    const prev = story.paragraphs[pi - 1];
    if (prev.table) return result(ctx, [], ctx.sel);
    if (mark) {
      if (prev.rev?.del) return result(ctx, [], caretAt(ctx.sel.target, { paragraphId: prev.id, offset: paragraphLength(prev) }));
      const r = trackedDelete(story, { anchor: { paragraphId: prev.id, offset: paragraphLength(prev) }, focus: from }, mark);
      return result(ctx, storyDiff(ctx.sel.target, story, r.story), caretAt(ctx.sel.target, r.caret), 'Delete');
    }
    if (!paragraphLength(prev) && !prev.meta) {
      return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'removeParagraphs', ids: [prev.id] }] }], ctx.sel, 'Delete');
    }
    return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'mergeParagraphs', paragraphId: prev.id }] }], caretAt(ctx.sel.target, { paragraphId: prev.id, offset: paragraphLength(prev) }), 'Delete');
  }
  if (dir > 0 && from.offset >= paragraphLength(p)) {
    const next = story.paragraphs[pi + 1];
    if (!next || next.table) return result(ctx, [], ctx.sel);
    if (mark) {
      const r = trackedDelete(story, { anchor: from, focus: { paragraphId: next.id, offset: 0 } }, mark);
      return result(ctx, storyDiff(ctx.sel.target, story, r.story), ctx.sel, 'Delete');
    }
    return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'mergeParagraphs', paragraphId: p.id }] }], ctx.sel, 'Delete');
  }
  let to = word ? moveByWord(story, from, dir) : moveByGrapheme(story, from, dir);
  if (to.paragraphId !== from.paragraphId) to = { paragraphId: from.paragraphId, offset: dir < 0 ? 0 : paragraphLength(p) };
  const range = { anchor: from, focus: to };
  if (mark) {
    // Stepping over text that is already deleted just moves the caret.
    const [a, b] = orderRange(story, range);
    const already = p.runs.length && runsIn(p, a.offset, b.offset).every(r => r.attrs?.del);
    if (already) return result(ctx, [], caretAt(ctx.sel.target, dir < 0 ? a : b));
    const r = trackedDelete(story, range, mark);
    const caret = dir < 0 ? r.caret : (r.story.paragraphs.find(q => q.id === p.id) && paragraphLength(r.story.paragraphs.find(q => q.id === p.id)!) >= b.offset ? b : r.caret);
    return result(ctx, storyDiff(ctx.sel.target, story, r.story), caretAt(ctx.sel.target, caret), 'Delete');
  }
  const [a] = orderRange(story, range);
  return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'deleteRange', range }] }], caretAt(ctx.sel.target, a), 'Delete');
}

function runsIn(p: Paragraph, from: number, to: number): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of p.runs) { const end = pos + r.text.length; if (end > from && pos < to) out.push(r); pos = end; }
  return out;
}

/** Enter. */
export function splitCmd(ctx: CommandContext, sheet: StyleSheet): CommandResult {
  const story = storyOf(ctx);
  const mark = tracking(ctx);
  const del = deleteSelection(ctx, story, mark);
  let s = del.story;
  const at = del.at;
  const p = s.paragraphs[paragraphIndex(s, at.paragraphId)];
  // Enter on an empty list item leaves the list (or outdents a level).
  if (!paragraphLength(p) && p.attrs?.list) {
    const lvl = p.attrs.list.level ?? 1;
    const patch: Partial<ParaAttrs> = lvl > 1 ? { list: { ...p.attrs.list, level: lvl - 1 } } : { list: undefined };
    const s2 = setParaAttrs(s, [p.id], patch);
    return result(ctx, storyDiff(ctx.sel.target, story, s2), caretAt(ctx.sel.target, at), 'Paragraph');
  }
  const id = newId();
  const r = splitParagraph(s, at, id, sheet);
  s = r.story;
  // A page/column break stays with the first half; the meta (block roles) stays with the original.
  s = { ...s, paragraphs: s.paragraphs.map(q => q.id === id ? { ...q, attrs: q.attrs ? { ...q.attrs, startOn: undefined } : q.attrs } : q) };
  if (mark) s = { ...s, paragraphs: s.paragraphs.map(q => (q.id === p.id ? { ...q, rev: { ...q.rev, ins: mark } } : q)) };
  const sel = caretAt(ctx.sel.target, r.caret);
  if (!mark && del.ops) {
    const second = s.paragraphs.find(q => q.id === id)!;
    const ops: TextOp[] = [...del.ops, { type: 'splitParagraph', at, newId: id }];
    if (second.attrs?.startOn === undefined && p.attrs?.startOn && p.attrs.startOn !== 'anywhere') ops.push({ type: 'setParaAttrs', paragraphIds: [id], patch: { startOn: undefined } });
    return result(ctx, [{ type: 'text', target: ctx.sel.target, ops }], sel, 'Typing', ctx.pending);
  }
  return result(ctx, storyDiff(ctx.sel.target, story, s), sel, 'Typing', ctx.pending);
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────

/** The range a character command acts on: the selection, or the word around a collapsed caret. */
export function formatRange(story: TextStory, sel: DocSelection): TextRange | null {
  if (!collapsed(sel)) return rangeOf(sel);
  const w = wordRangeAt(story, sel.focus);
  const [a, b] = orderRange(story, w);
  const text = paragraphText(story.paragraphs[paragraphIndex(story, a.paragraphId)]).slice(a.offset, b.offset);
  if (sel.focus.offset > a.offset && sel.focus.offset < b.offset && /[\p{L}\p{N}]/u.test(text)) return w;
  return null;
}

export function formatChars(ctx: CommandContext, patch: Partial<CharAttrs>): CommandResult {
  const story = storyOf(ctx);
  const range = formatRange(story, ctx.sel);
  if (!range) return result(ctx, [], ctx.sel, undefined, { ...(ctx.pending ?? {}), ...patch } as CharAttrs);
  const mark = tracking(ctx);
  if (mark) return result(ctx, storyDiff(ctx.sel.target, story, trackedFormat(story, range, patch, mark)), ctx.sel, 'Format');
  return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'applyCharAttrs', range, patch }] }], ctx.sel, 'Format');
}

export function clearFormatting(ctx: CommandContext): CommandResult {
  const story = storyOf(ctx);
  const range = formatRange(story, ctx.sel) ?? rangeOf(ctx.sel);
  const s1 = editRuns(story, range, r => {
    const a = r.attrs ?? {};
    const keep: CharAttrs = {};
    for (const k of ['ins', 'del', 'fmt', 'comments', 'bookmarks', 'field', 'object', 'href'] as const) if (a[k] !== undefined) (keep as Record<string, unknown>)[k] = a[k];
    return { text: r.text, styleId: a.href ? r.styleId : undefined, attrs: Object.keys(keep).length ? keep : undefined };
  });
  const s2 = setParagraphStyle(s1, paragraphIdsInRange(s1, range).filter(id => !s1.paragraphs.find(p => p.id === id)?.table), undefined, true);
  return result(ctx, storyDiff(ctx.sel.target, story, s2), ctx.sel, 'Clear formatting');
}

export function setStyle(ctx: CommandContext, styleId: string | undefined): CommandResult {
  const story = storyOf(ctx);
  const sheet = ctx.doc.styles;
  if (styleId && sheet.character[styleId]) {
    const range = formatRange(story, ctx.sel);
    if (!range) return result(ctx, [], ctx.sel);
    return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'setCharacterStyle', range, styleId }] }], ctx.sel, 'Style');
  }
  const ids = textParagraphIds(story, rangeOf(ctx.sel));
  const mark = tracking(ctx);
  let s = setParagraphStyle(story, ids, styleId === sheet.defaultParagraph ? undefined : styleId);
  // A list style replaces direct list formatting; a non-list style keeps it.
  if (styleId && sheet.paragraph[styleId]?.para?.list) s = setParaAttrs(s, ids, { list: undefined });
  if (mark) s = { ...s, paragraphs: s.paragraphs.map(p => { if (!ids.includes(p.id)) return p; const o = story.paragraphs.find(q => q.id === p.id)!; return { ...p, rev: { ...p.rev, fmt: p.rev?.fmt ?? { ...mark, old: { styleId: o.styleId, attrs: o.attrs } } } }; }) };
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, 'Style');
}

function textParagraphIds(story: TextStory, range: TextRange): string[] {
  return paragraphIdsInRange(story, range).filter(id => !story.paragraphs.find(p => p.id === id)?.table);
}

export function setParagraph(ctx: CommandContext, patch: Partial<ParaAttrs>): CommandResult {
  const story = storyOf(ctx);
  const ids = textParagraphIds(story, rangeOf(ctx.sel));
  const mark = tracking(ctx);
  let s = setParaAttrs(story, ids, patch);
  if (mark) s = { ...s, paragraphs: s.paragraphs.map(p => { if (!ids.includes(p.id)) return p; const o = story.paragraphs.find(q => q.id === p.id)!; return { ...p, rev: { ...p.rev, fmt: p.rev?.fmt ?? { ...mark, old: { styleId: o.styleId, attrs: o.attrs } } } }; }) };
  if (!mark) return result(ctx, [{ type: 'text', target: ctx.sel.target, ops: [{ type: 'setParaAttrs', paragraphIds: ids, patch }] }], ctx.sel, 'Paragraph');
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, 'Paragraph');
}

// ── Lists ───────────────────────────────────────────────────────────────────────────────────

export function resolvedList(ctx: CommandContext, p: Paragraph): ListAttrs | undefined {
  if (p.attrs && 'list' in p.attrs) return p.attrs.list;
  const chainList = (id?: string): ListAttrs | undefined => { const st = id ? ctx.doc.styles.paragraph[id] : undefined; return st ? st.para?.list ?? chainList(st.basedOn) : undefined; };
  return chainList(p.styleId);
}

export function toggleList(ctx: CommandContext, kind: 'bullet' | 'number', listId?: string): CommandResult {
  const story = storyOf(ctx);
  const ids = textParagraphIds(story, rangeOf(ctx.sel));
  const ps = story.paragraphs.filter(p => ids.includes(p.id));
  const want = listId ?? (kind === 'bullet' ? 'bullets' : 'numbers');
  const all = ps.every(p => { const l = resolvedList(ctx, p); return l?.kind === kind && (!listId || (l.listId ?? '').split('~')[0] === listId); });
  let s = story;
  if (all) {
    s = setParaAttrs(s, ids, { list: undefined });
    s = { ...s, paragraphs: s.paragraphs.map(p => ids.includes(p.id) && (p.styleId === 'list' || p.styleId === 'list-number') ? { ...p, styleId: undefined } : p) };
    // A list style would still apply: mask it.
    s = { ...s, paragraphs: s.paragraphs.map(p => ids.includes(p.id) && resolvedList({ ...ctx, doc: { ...ctx.doc, story: s } }, { ...p, attrs: { ...p.attrs, list: undefined } }) ? p : p) };
  } else {
    // Join the list of the paragraph just above when it has the same kind (continue numbering).
    const first = paragraphIndex(story, ids[0]);
    const above = first > 0 ? resolvedList(ctx, story.paragraphs[first - 1]) : undefined;
    const lid = above?.kind === kind && (!listId || above.listId?.split('~')[0] === listId) ? above.listId ?? want : want;
    s = { ...s, paragraphs: s.paragraphs.map(p => { if (!ids.includes(p.id)) return p; const cur = resolvedList(ctx, p); return { ...p, attrs: { ...p.attrs, list: { kind, level: cur?.level ?? 1, listId: lid } } }; }) };
  }
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, all ? 'Remove list' : 'List');
}

/** Tab / Shift+Tab on list items (level ±1), Increase/Decrease Indent elsewhere. */
export function changeIndent(ctx: CommandContext, delta: 1 | -1): CommandResult {
  const story = storyOf(ctx);
  const ids = textParagraphIds(story, rangeOf(ctx.sel));
  const s: TextStory = { ...story, paragraphs: story.paragraphs.map(p => {
    if (!ids.includes(p.id)) return p;
    const l = resolvedList(ctx, p);
    if (l) return { ...p, attrs: { ...p.attrs, list: { ...l, level: Math.max(1, Math.min(9, (l.level ?? 1) + delta)) } } };
    const cur = p.attrs?.indentStart ?? 0;
    return { ...p, attrs: { ...p.attrs, indentStart: Math.max(0, Math.round((cur + delta * 48) / 48) * 48) } };
  }) };
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, 'Indent');
}

export function restartNumbering(ctx: CommandContext, start = 1): CommandResult {
  const story = storyOf(ctx);
  const p = story.paragraphs[paragraphIndex(story, ctx.sel.focus.paragraphId)];
  const l = resolvedList(ctx, p);
  if (!l) return result(ctx, [], ctx.sel);
  const oldId = l.listId ?? (l.kind === 'bullet' ? 'bullets' : 'numbers');
  const fresh = `${oldId.split('~')[0]}~${newId('n')}`;
  const i0 = paragraphIndex(story, p.id);
  const s: TextStory = { ...story, paragraphs: story.paragraphs.map((q, i) => {
    if (i < i0) return q;
    const ql = resolvedList(ctx, q);
    if (!ql || (ql.listId ?? oldId) !== oldId) return q;
    return { ...q, attrs: { ...q.attrs, list: { ...ql, listId: fresh, start: i === i0 ? start : undefined } } };
  }) };
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, 'Restart numbering');
}

export function continueNumbering(ctx: CommandContext): CommandResult {
  const story = storyOf(ctx);
  const i0 = paragraphIndex(story, ctx.sel.focus.paragraphId);
  const l = resolvedList(ctx, story.paragraphs[i0]);
  if (!l) return result(ctx, [], ctx.sel);
  let prevId: string | undefined;
  for (let i = i0 - 1; i >= 0; i--) { const pl = resolvedList(ctx, story.paragraphs[i]); if (pl?.kind === l.kind && pl.listId !== l.listId) { prevId = pl.listId; break; } }
  if (!prevId) return result(ctx, [], ctx.sel);
  const cur = l.listId;
  const s: TextStory = { ...story, paragraphs: story.paragraphs.map((q, i) => { if (i < i0) return q; const ql = resolvedList(ctx, q); return ql && ql.listId === cur ? { ...q, attrs: { ...q.attrs, list: { ...ql, listId: prevId, start: undefined } } } : q; }) };
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, 'Continue numbering');
}

// ── Breaks & sections ───────────────────────────────────────────────────────────────────────

function splitAtCaret(ctx: CommandContext, story: TextStory): { story: TextStory; second: string } {
  const at = ctx.sel.focus;
  const p = story.paragraphs[paragraphIndex(story, at.paragraphId)];
  if (at.offset === 0 && paragraphLength(p) > 0) {
    // At the start of a paragraph: the break goes before it, nothing to split.
    return { story, second: p.id };
  }
  const id = newId();
  return { story: splitParagraph(story, at, id, ctx.doc.styles).story, second: id };
}

export function insertBreak(ctx: CommandContext, kind: 'page' | 'column'): CommandResult {
  if (ctx.sel.target.kind !== 'body') return result(ctx, [], ctx.sel);
  const story = storyOf(ctx);
  const r = splitAtCaret(ctx, story);
  const s = setParaAttrs(r.story, [r.second], { startOn: kind === 'page' ? 'next-frame' : 'next-column' });
  return result(ctx, storyDiff(BODY, story, s), caretAt(BODY, { paragraphId: r.second, offset: 0 }), kind === 'page' ? 'Page break' : 'Column break');
}

export function sectionIndexOf(doc: WriterDocument, paragraphId: string): number {
  const order = new Map(doc.story.paragraphs.map((p, i) => [p.id, i]));
  const at = order.get(paragraphId) ?? 0;
  let si = 0;
  doc.sections.forEach((s, i) => { if (i > 0 && s.startParagraphId && (order.get(s.startParagraphId) ?? Infinity) <= at) si = i; });
  return si;
}

export function insertSectionBreak(ctx: CommandContext, kind: DocSection['break']): CommandResult {
  if (ctx.sel.target.kind !== 'body') return result(ctx, [], ctx.sel);
  const story = storyOf(ctx);
  const r = splitAtCaret(ctx, story);
  const si = sectionIndexOf(ctx.doc, ctx.sel.focus.paragraphId);
  const cur = ctx.doc.sections[si];
  const sec: DocSection = { id: newId('sec'), startParagraphId: r.second, break: kind, setup: cur.setup };
  const sections = ctx.doc.sections.slice();
  sections.splice(si + 1, 0, sec);
  const ops: WriterOp[] = [...storyDiff(BODY, story, r.story), { type: 'set', key: 'sections', value: sections }];
  return result(ctx, ops, caretAt(BODY, { paragraphId: r.second, offset: 0 }), 'Section break');
}

export function setSection(doc: WriterDocument, index: number, patch: Partial<DocSection>): WriterOp {
  return { type: 'set', key: 'sections', value: doc.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

/** The header/footer story for a section and kind, created (unlinked) when missing. */
export function editHeaderFooter(doc: WriterDocument, sectionIndex: number, kind: HeaderFooterKind, which: 'headers' | 'footers'): { ops: WriterOp[]; id: string } {
  const sec = doc.sections[sectionIndex];
  const own = sec[which]?.[kind];
  if (own && doc.headerFooters[own]) return { ops: [], id: own };
  // Linked to a previous section: edit that one (Word's "Link to Previous").
  for (let s = sectionIndex - 1; s >= 0; s--) { const id = doc.sections[s][which]?.[kind]; if (id && doc.headerFooters[id]) return { ops: [], id }; }
  const id = newId('hf');
  const story: TextStory = { id: newId('s'), paragraphs: [{ id: newId(), styleId: which === 'headers' ? 'header' : 'footer', runs: [{ text: '' }] }] };
  return { id, ops: [{ type: 'set', key: 'headerFooters', id, value: story }, setSection(doc, sectionIndex, { [which]: { ...sec[which], [kind]: id } })] };
}

// ── Objects: notes, fields, images, links, bookmarks ───────────────────────────────────────

export function insertNote(ctx: CommandContext, kind: 'footnote' | 'endnote'): CommandResult {
  const story = storyOf(ctx);
  if (ctx.sel.target.kind === 'note' || ctx.sel.target.kind === 'headerFooter') return result(ctx, [], ctx.sel);
  const id = newId('fn');
  const mark = tracking(ctx);
  const at = orderRange(story, rangeOf(ctx.sel))[1];
  const ref: Run = { text: OBJ, styleId: 'note-ref', attrs: { field: { kind: 'noteRef', id, note: kind }, object: { id: 'field', width: 6, ascent: 8, descent: 0 }, ...(mark ? { ins: mark } : {}) } };
  const r = insertText(story, at, OBJ, ref);
  const noteStory: TextStory = { id: newId('s'), paragraphs: [{ id: newId(), styleId: kind === 'footnote' ? 'footnote' : 'endnote', runs: [{ text: OBJ, styleId: 'note-ref', attrs: { field: { kind: 'noteNumber', id, note: kind }, object: { id: 'field', width: 6, ascent: 8, descent: 0 } } }, { text: ' ' }] }] };
  const ops: WriterOp[] = [{ type: 'set', key: 'notes', id, value: { id, kind, story: noteStory } }, ...storyDiff(ctx.sel.target, story, r.story)];
  const p0 = noteStory.paragraphs[0];
  return result(ctx, ops, caretAt({ kind: 'note', id }, { paragraphId: p0.id, offset: 2 }), kind === 'footnote' ? 'Footnote' : 'Endnote');
}

export function insertField(ctx: CommandContext, field: NonNullable<CharAttrs['field']>): CommandResult {
  const story = storyOf(ctx);
  const del = deleteSelection(ctx, story, null);
  const fmt = formatAt(del.story, del.at, null, tracking(ctx));
  const r = insertText(del.story, del.at, OBJ, { styleId: fmt.styleId, attrs: { ...fmt.attrs, field, object: { id: 'field', width: 8, ascent: 10, descent: 2 } } });
  return result(ctx, storyDiff(ctx.sel.target, story, r.story), caretAt(ctx.sel.target, r.caret), 'Field');
}

export function insertInlineImage(ctx: CommandContext, media: WriterMedia, maxWidth: number): CommandResult {
  const story = storyOf(ctx);
  const del = deleteSelection(ctx, story, null);
  const scale = Math.min(1, maxWidth / Math.max(1, media.width));
  const w = media.width * scale, h = media.height * scale;
  const mark = tracking(ctx);
  const r = insertText(del.story, del.at, OBJ, { attrs: { object: { id: media.id, width: w, ascent: h, descent: 0 }, ...(mark ? { ins: mark } : {}) } });
  const ops: WriterOp[] = [{ type: 'set', key: 'media', id: media.id, value: media }, ...storyDiff(ctx.sel.target, story, r.story)];
  return result(ctx, ops, caretAt(ctx.sel.target, r.caret), 'Picture');
}

/** Resize an inline image object (all occurrences of the media id in the story). */
export function resizeInlineImage(ctx: CommandContext, mediaId: string, width: number, height: number): CommandResult {
  const story = storyOf(ctx);
  const s: TextStory = { ...story, paragraphs: story.paragraphs.map(p => p.runs.some(r => r.attrs?.object?.id === mediaId) ? { ...p, runs: p.runs.map(r => r.attrs?.object?.id === mediaId ? { ...r, attrs: { ...r.attrs, object: { id: mediaId, width, ascent: height, descent: 0 } } } : r) } : p) };
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, 'Resize picture');
}

export function insertFloat(ctx: CommandContext, media: WriterMedia, f: Partial<WriterFloat> & { width: number; height: number }): CommandResult {
  const id = newId('fl');
  const anchor = ctx.sel.target.kind === 'body' ? ctx.sel.focus.paragraphId : ctx.doc.story.paragraphs[0].id;
  const float: WriterFloat = { id, mediaId: media.id, anchorParagraphId: anchor, relativeTo: 'margin', x: 0, y: 0, wrap: 'square', distance: 9, ...f };
  return result(ctx, [{ type: 'set', key: 'media', id: media.id, value: media }, { type: 'set', key: 'floats', id, value: float }], ctx.sel, 'Picture');
}

export function setLink(ctx: CommandContext, href: string | null, text?: string): CommandResult {
  const story = storyOf(ctx);
  if (collapsed(ctx.sel)) {
    const w = formatRange(story, ctx.sel);
    if (!w && text && href) {
      const r = insertText(story, ctx.sel.focus, text, { styleId: 'link', attrs: { href } });
      return result(ctx, storyDiff(ctx.sel.target, story, r.story), caretAt(ctx.sel.target, r.caret), 'Link');
    }
    if (!w) return result(ctx, [], ctx.sel);
    return setLink({ ...ctx, sel: { ...ctx.sel, anchor: w.anchor, focus: w.focus } }, href, text);
  }
  const range = rangeOf(ctx.sel);
  let s = applyCharAttrs(story, range, { href: href ?? undefined });
  s = setCharacterStyle(s, range, href ? 'link' : undefined);
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, href ? 'Link' : 'Remove link');
}

export function addBookmark(ctx: CommandContext, name: string): CommandResult {
  const story = storyOf(ctx);
  const range = collapsed(ctx.sel) ? wordRangeAt(story, ctx.sel.focus) : rangeOf(ctx.sel);
  const s = editRuns(story, range, r => ({ ...r, attrs: { ...r.attrs, bookmarks: [...(r.attrs?.bookmarks ?? []).filter(b => b !== name), name] } }));
  return result(ctx, storyDiff(ctx.sel.target, story, s), ctx.sel, 'Bookmark');
}

// ── Tables ──────────────────────────────────────────────────────────────────────────────────

export function insertTable(ctx: CommandContext, rows: number, cols: number, width: number, header = true): CommandResult {
  if (ctx.sel.target.kind !== 'body') return result(ctx, [], ctx.sel);
  const story = storyOf(ctx);
  const at = ctx.sel.focus;
  const pi = paragraphIndex(story, at.paragraphId);
  const p = story.paragraphs[pi];
  const t = createTable(rows, cols, width, { header });
  const id = newId('tbl');
  t.id = id;
  const tablePara: Paragraph = { id, runs: [{ text: '' }], table: t };
  let s: TextStory;
  if (!paragraphLength(p)) {
    const ps = story.paragraphs.slice();
    ps.splice(pi, 0, tablePara);
    s = { ...story, paragraphs: ps };
  } else {
    const second = newId();
    const sp = at.offset >= paragraphLength(p) ? { story: { ...story, paragraphs: [...story.paragraphs.slice(0, pi + 1), { id: second, runs: [{ text: '' }] }, ...story.paragraphs.slice(pi + 1)] } } : splitParagraph(story, at, second, ctx.doc.styles);
    const ps = sp.story.paragraphs.slice();
    ps.splice(pi + 1, 0, tablePara);
    s = { ...sp.story, paragraphs: ps };
  }
  const c0 = t.rows[0].cells[0];
  return result(ctx, storyDiff(BODY, story, s), caretAt({ kind: 'cell', tableId: id, rowId: t.rows[0].id, cellId: c0.id }, { paragraphId: c0.story.paragraphs[0].id, offset: 0 }), 'Insert table');
}

/** Replace a table block (structure edits from ./tables). `null` deletes the table. */
export function replaceTable(ctx: CommandContext, tableId: string, table: Paragraph['table'] | null): CommandResult {
  const story = ctx.doc.story;
  const tp = findTable(story, tableId);
  if (!tp) return result(ctx, [], ctx.sel);
  if (!table) {
    const i = paragraphIndex(story, tableId);
    const next = story.paragraphs[i + 1] ?? story.paragraphs[i - 1];
    const ops: WriterOp[] = [{ type: 'text', target: BODY, ops: [{ type: 'removeParagraphs', ids: [tableId] }] }];
    return result(ctx, ops, caretAt(BODY, { paragraphId: next.id, offset: 0 }), 'Delete table');
  }
  const ops: WriterOp[] = [{ type: 'text', target: BODY, ops: [{ type: 'replaceParagraph', paragraph: { ...tp, table } }] }];
  const r = result(ctx, ops, ctx.sel, 'Table');
  // Keep the caret in a cell that still exists.
  if (ctx.sel.target.kind === 'cell' && ctx.sel.target.tableId === tableId) {
    const t = ctx.sel.target;
    const row = table.rows.find(x => x.id === t.rowId);
    const cell = row?.cells.find(c => c.id === t.cellId && !c.vMerged);
    if (!cell) {
      const fr = table.rows[0], fc = fr.cells.find(c => !c.vMerged)!;
      r.sel = caretAt({ kind: 'cell', tableId, rowId: fr.id, cellId: fc.id }, { paragraphId: fc.story.paragraphs[0].id, offset: 0 });
    } else if (!cell.story.paragraphs.some(p => p.id === ctx.sel.focus.paragraphId)) {
      r.sel = caretAt(t, { paragraphId: cell.story.paragraphs[0].id, offset: 0 });
    }
  }
  return r;
}

// ── Comments ────────────────────────────────────────────────────────────────────────────────

export function addComment(ctx: CommandContext, text: string): CommandResult {
  const story = storyOf(ctx);
  const range = collapsed(ctx.sel) ? wordRangeAt(story, ctx.sel.focus) : rangeOf(ctx.sel);
  const id = newId('cm');
  const [a, b] = orderRange(story, range);
  const quote = story.paragraphs.slice(paragraphIndex(story, a.paragraphId), paragraphIndex(story, b.paragraphId) + 1).map((p, i, arr) => {
    const t = readingText(p);
    return t.slice(i === 0 ? a.offset : 0, i === arr.length - 1 ? b.offset : undefined);
  }).join('\n').slice(0, 200);
  const comment: WriterComment = { id, author: ctx.author.name, authorId: ctx.author.id, date: Date.now(), text, replies: [], quote };
  const s = addCommentMark(story, range, id);
  return result(ctx, [{ type: 'set', key: 'comments', id, value: comment }, ...storyDiff(ctx.sel.target, story, s)], ctx.sel, 'Comment');
}

export function replyComment(doc: WriterDocument, id: string, author: Author, text: string): WriterOp[] {
  const c = doc.comments[id];
  if (!c) return [];
  return [{ type: 'set', key: 'comments', id, value: { ...c, replies: [...c.replies, { id: newId('re'), author: author.name, authorId: author.id, date: Date.now(), text }] } }];
}
export function resolveComment(doc: WriterDocument, id: string, resolved: boolean): WriterOp[] {
  const c = doc.comments[id];
  return c ? [{ type: 'set', key: 'comments', id, value: { ...c, resolved } }] : [];
}
export function editComment(doc: WriterDocument, id: string, text: string): WriterOp[] {
  const c = doc.comments[id];
  return c ? [{ type: 'set', key: 'comments', id, value: { ...c, text } }] : [];
}
export function deleteComment(doc: WriterDocument, id: string): WriterOp[] {
  const ops: WriterOp[] = [{ type: 'set', key: 'comments', id, value: null }];
  ops.push(...storyDiff(BODY, doc.story, removeCommentMark(doc.story, id)));
  for (const n of Object.values(doc.notes)) ops.push(...storyDiff({ kind: 'note', id: n.id }, n.story, removeCommentMark(n.story, id)));
  return ops;
}

// ── Review ──────────────────────────────────────────────────────────────────────────────────

function reviewAll(doc: WriterDocument, decide: Parameters<typeof resolveRevisions>[1]): WriterOp[] {
  const ops: WriterOp[] = [...storyDiff(BODY, doc.story, resolveRevisions(doc.story, decide))];
  for (const n of Object.values(doc.notes)) ops.push(...storyDiff({ kind: 'note', id: n.id }, n.story, resolveRevisions(n.story, decide)));
  for (const [id, h] of Object.entries(doc.headerFooters)) ops.push(...storyDiff({ kind: 'headerFooter', id }, h, resolveRevisions(h, decide)));
  return ops;
}

export function reviewRevision(ctx: CommandContext, id: string, d: 'accept' | 'reject'): CommandResult {
  return result(ctx, reviewAll(ctx.doc, decideById(id, d)), clampSel(ctx), d === 'accept' ? 'Accept change' : 'Reject change');
}
export function reviewAllRevisions(ctx: CommandContext, d: 'accept' | 'reject'): CommandResult {
  return result(ctx, reviewAll(ctx.doc, decideAll(d)), clampSel(ctx), d === 'accept' ? 'Accept all changes' : 'Reject all changes');
}
export function reviewSelection(ctx: CommandContext, d: 'accept' | 'reject'): CommandResult {
  const story = storyOf(ctx);
  const s = resolveRevisions(story, decideInRange(story, rangeOf(ctx.sel), d));
  return result(ctx, storyDiff(ctx.sel.target, story, s), clampSel(ctx), d === 'accept' ? 'Accept change' : 'Reject change');
}
function clampSel(ctx: CommandContext): DocSelection { return ctx.sel; }

// ── Table of contents ───────────────────────────────────────────────────────────────────────

export function tocParagraphs(doc: WriterDocument, tocId: string, contentWidth: number, levels = 3): Paragraph[] {
  const out: Paragraph[] = [{ id: newId(), styleId: 'toc-heading', runs: [{ text: 'Contents' }], meta: { toc: tocId, tocHeading: true } }];
  for (const p of doc.story.paragraphs) {
    if (p.table || p.meta?.toc) continue;
    const lvl = headingLevel(p.styleId, doc.styles);
    if (!lvl || lvl > levels) continue;
    const text = readingText(p).replace(/[\u2028\t]/g, ' ').trim();
    if (!text) continue;
    const indent = (lvl - 1) * 24;
    out.push({
      id: newId(), styleId: `toc${Math.min(3, lvl)}`, meta: { toc: tocId },
      attrs: { indentStart: indent, tabs: [{ position: Math.max(40, contentWidth - indent - 2), align: 'right', leader: '.' }] },
      runs: [{ text, styleId: undefined, attrs: { href: `#${p.id}` } }, { text: '\t', attrs: { href: `#${p.id}` } }, { text: OBJ, attrs: { href: `#${p.id}`, field: { kind: 'pageRef', target: p.id }, object: { id: 'field', width: 10, ascent: 10, descent: 2 } } }],
    });
  }
  if (out.length === 1) out.push({ id: newId(), styleId: 'toc1', meta: { toc: tocId }, runs: [{ text: 'No headings yet — apply Heading 1–3 styles, then Update Table.' }] });
  return out;
}

export function insertTOC(ctx: CommandContext, contentWidth: number): CommandResult {
  if (ctx.sel.target.kind !== 'body') return result(ctx, [], ctx.sel);
  const story = storyOf(ctx);
  const tocId = newId('toc');
  const paras = tocParagraphs(ctx.doc, tocId, contentWidth);
  const p = story.paragraphs[paragraphIndex(story, ctx.sel.focus.paragraphId)];
  const i = paragraphIndex(story, p.id);
  const ps = story.paragraphs.slice();
  ps.splice(paragraphLength(p) ? i + 1 : i, 0, ...paras);
  const s = { ...story, paragraphs: ps };
  return result(ctx, storyDiff(BODY, story, s), ctx.sel, 'Table of contents');
}

export function updateTOC(ctx: CommandContext, contentWidth: number): CommandResult {
  const story = ctx.doc.story;
  const ids = [...new Set(story.paragraphs.map(p => p.meta?.toc).filter((x): x is string => typeof x === 'string'))];
  if (!ids.length) return result(ctx, [], ctx.sel);
  let s = story;
  for (const tocId of ids) {
    const first = s.paragraphs.findIndex(p => p.meta?.toc === tocId);
    const keep = s.paragraphs.filter(p => p.meta?.toc !== tocId);
    const fresh = tocParagraphs({ ...ctx.doc, story: { ...s, paragraphs: keep } }, tocId, contentWidth);
    const before = s.paragraphs.slice(0, first).filter(p => p.meta?.toc !== tocId);
    s = { ...s, paragraphs: [...before, ...fresh, ...keep.slice(before.length)] };
  }
  const inToc = ctx.sel.target.kind === 'body' && !s.paragraphs.some(p => p.id === ctx.sel.focus.paragraphId);
  return result(ctx, storyDiff(BODY, story, s), inToc ? caretAt(BODY, { paragraphId: s.paragraphs[0].id, offset: 0 }) : ctx.sel, 'Update table');
}

// ── Find & replace ──────────────────────────────────────────────────────────────────────────

export interface FindOptions { matchCase?: boolean; wholeWord?: boolean; regex?: boolean }
export interface FindMatch { target: StoryTarget; range: TextRange; text: string }

export function findPattern(query: string, o: FindOptions): RegExp | null {
  if (!query) return null;
  let src = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  try { return new RegExp(src, `g${o.matchCase ? '' : 'i'}u`); } catch { return null; }
}

export function findAll(doc: WriterDocument, query: string, o: FindOptions = {}): FindMatch[] {
  const re = findPattern(query, o);
  if (!re) return [];
  const out: FindMatch[] = [];
  const scan = (s: TextStory, target: StoryTarget) => {
    for (const p of s.paragraphs) {
      if (p.table) { for (const r of p.table.rows) for (const c of r.cells) if (!c.vMerged) scan(c.story, { kind: 'cell', tableId: p.id, rowId: r.id, cellId: c.id }); continue; }
      const t = paragraphText(p);
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        // Skip matches inside deleted (tracked) text.
        if (runsIn(p, m.index, m.index + m[0].length).every(r => r.attrs?.del)) continue;
        out.push({ target, range: { anchor: { paragraphId: p.id, offset: m.index }, focus: { paragraphId: p.id, offset: m.index + m[0].length } }, text: m[0] });
      }
    }
  };
  scan(doc.story, BODY);
  for (const n of Object.values(doc.notes)) scan(n.story, { kind: 'note', id: n.id });
  return out;
}

/** Replace one match (regex replacements support $1…). */
export function replaceMatch(ctx: CommandContext, m: FindMatch, replacement: string, query: string, o: FindOptions = {}): CommandResult {
  const re = o.regex ? findPattern(query, o) : null;
  const text = re ? m.text.replace(new RegExp(re.source, re.flags.replace('g', '')), replacement) : replacement;
  return typeText({ ...ctx, pending: null, sel: { target: m.target, anchor: m.range.anchor, focus: m.range.focus } }, text);
}

export function replaceAll(ctx: CommandContext, query: string, replacement: string, o: FindOptions = {}): CommandResult & { count: number } {
  const matches = findAll(ctx.doc, query, o);
  let doc = ctx.doc;
  const ops: WriterOp[] = [];
  const re = findPattern(query, o);
  // Back to front per paragraph keeps earlier offsets valid.
  for (const m of matches.slice().reverse()) {
    const text = o.regex && re ? m.text.replace(new RegExp(re.source, re.flags.replace('g', '')), replacement) : replacement;
    const r = typeText({ ...ctx, doc, sel: { target: m.target, anchor: m.range.anchor, focus: m.range.focus }, pending: null }, text);
    ops.push(...r.ops);
    doc = r.doc;
  }
  return { ops, sel: ctx.sel, doc, label: 'Replace all', count: matches.length, pending: null };
}

// ── Paste ───────────────────────────────────────────────────────────────────────────────────

export function pasteFragment(ctx: CommandContext, fragment: TextStory): CommandResult {
  const story = storyOf(ctx);
  const mark = tracking(ctx);
  const del = deleteSelection(ctx, story, mark);
  // Pasted paragraphs never carry host metadata or review marks from elsewhere.
  const frag: TextStory = { ...fragment, paragraphs: fragment.paragraphs.filter(p => !p.table || ctx.sel.target.kind === 'body').map(p => ({
    id: p.id, styleId: p.styleId && ctx.doc.styles.paragraph[p.styleId] ? p.styleId : undefined, attrs: p.attrs, table: p.table,
    runs: normalizeRuns(p.runs.map(r => { const a = { ...r.attrs }; delete a.ins; delete a.del; delete a.fmt; delete a.comments; if (mark) a.ins = mark; return { text: r.text, styleId: r.styleId && ctx.doc.styles.character[r.styleId] ? r.styleId : undefined, attrs: Object.keys(a).length ? a : undefined }; })),
  })) };
  if (!frag.paragraphs.length) return result(ctx, [], ctx.sel);
  const r = insertFragment(del.story, del.at, frag);
  return result(ctx, storyDiff(ctx.sel.target, story, r.story), caretAt(ctx.sel.target, r.caret), 'Paste');
}

// ── Queries for the UI ──────────────────────────────────────────────────────────────────────

/** Attributes at the caret / selection start, for toolbar state. */
export function selectionFormat(doc: WriterDocument, sel: DocSelection): { char: CharAttrs; styleId?: string; charStyleId?: string; para: ParaAttrs; paragraph?: Paragraph } {
  const story = getStory(doc, sel.target);
  if (!story) return { char: {}, para: {} };
  const [a] = orderRange(story, rangeOf(sel));
  const p = story.paragraphs.find(q => q.id === a.paragraphId);
  if (!p) return { char: {}, para: {} };
  const r = runAt(p, collapsed(sel) ? a.offset : a.offset + 1);
  return { char: r.attrs ?? {}, styleId: p.styleId, charStyleId: r.styleId, para: p.attrs ?? {}, paragraph: p };
}

export function sameSel(a: DocSelection, b: DocSelection): boolean {
  return sameTarget(a.target, b.target) && a.anchor.paragraphId === b.anchor.paragraphId && a.anchor.offset === b.anchor.offset && a.focus.paragraphId === b.focus.paragraphId && a.focus.offset === b.focus.offset;
}

export { cellStory };
