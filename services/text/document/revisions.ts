// document/revisions — track changes and comment marks as pure story transforms.
//
// Revisions are character marks (`ins`, `del`, `fmt`) plus paragraph-mark revisions
// (`Paragraph.rev`), so they survive any edit around them. Tracked deletion keeps the text and
// marks it — except text the same author inserted while tracking, which simply goes away (as in
// Word). Accept/reject resolve marks per revision, per range or for the whole document,
// including inside table cells.

import { type CharAttrs, type Paragraph, type Position, type RevisionMark, type Run, type TextRange, type TextStory, newId, normalizeRuns, orderRange, paragraphIndex, paragraphLength, splitRuns } from '../model';
import type { StoryTarget, WriterDocument } from './types';

const MARK_KEYS = ['ins', 'del', 'fmt', 'comments', 'bookmarks', 'field', 'object'] as const;

export function sameAuthor(a: RevisionMark | undefined, b: RevisionMark): boolean {
  return !!a && (a.authorId && b.authorId ? a.authorId === b.authorId : a.author === b.author);
}

export function newMark(author: string, authorId?: string, date = Date.now()): RevisionMark {
  return { id: newId('rev'), author, authorId, date };
}

/** Map runs in [from, to) of each paragraph in a range. */
export function editRuns(s: TextStory, range: TextRange, f: (run: Run, p: Paragraph) => Run | null): TextStory {
  const [a, b] = orderRange(s, range);
  const ia = paragraphIndex(s, a.paragraphId), ib = paragraphIndex(s, b.paragraphId);
  const paragraphs = s.paragraphs.slice();
  for (let i = ia; i <= ib; i++) {
    const p = paragraphs[i];
    if (p.table) continue;
    const from = i === ia ? a.offset : 0;
    const to = i === ib ? b.offset : paragraphLength(p);
    if (from >= to) continue;
    const [x, rest] = splitRuns(p.runs, from);
    const [mid, y] = splitRuns(rest, to - from);
    const mapped = mid.map(r => (r.text ? f(r, p) : r)).filter((r): r is Run => !!r);
    paragraphs[i] = { ...p, runs: normalizeRuns([...x, ...mapped, ...y]) };
  }
  return { ...s, paragraphs };
}

function withAttrs(r: Run, a: CharAttrs | undefined): Run {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a ?? {})) if (v !== undefined) clean[k] = v;
  return { ...r, attrs: Object.keys(clean).length ? (clean as CharAttrs) : undefined };
}

// ── Tracked edits ───────────────────────────────────────────────────────────────────────────

/** Tracked deletion of a range: mark instead of remove (own pending insertions really go). */
export function trackedDelete(s: TextStory, range: TextRange, mark: RevisionMark): { story: TextStory; caret: Position } {
  const [a, b] = orderRange(s, range);
  const ia = paragraphIndex(s, a.paragraphId), ib = paragraphIndex(s, b.paragraphId);
  let story = editRuns(s, range, r => {
    if (r.attrs?.del) return r;
    if (sameAuthor(r.attrs?.ins, mark)) return null;
    return withAttrs(r, { ...r.attrs, del: mark });
  });
  // Paragraph marks inside the range.
  const merge: string[] = [];
  const paragraphs = story.paragraphs.slice();
  for (let i = ia; i < ib; i++) {
    const p = paragraphs[i];
    if (p.table || paragraphs[i + 1]?.table) continue;
    if (sameAuthor(p.rev?.ins, mark)) merge.push(p.id);
    else if (!p.rev?.del) paragraphs[i] = { ...p, rev: { ...p.rev, del: mark } };
  }
  story = { ...story, paragraphs };
  for (const id of merge.reverse()) story = mergeWithNext(story, id);
  const caretPara = story.paragraphs.find(p => p.id === a.paragraphId) ? a.paragraphId : story.paragraphs[Math.min(ia, story.paragraphs.length - 1)].id;
  return { story, caret: { paragraphId: caretPara, offset: a.offset } };
}

function mergeWithNext(s: TextStory, id: string): TextStory {
  const i = s.paragraphs.findIndex(p => p.id === id);
  const p = s.paragraphs[i], q = s.paragraphs[i + 1];
  if (!p || !q || p.table || q.table) return s;
  const runs = normalizeRuns([...p.runs.filter(r => r.text.length), ...q.runs]);
  const rev = q.rev ? { ...q.rev } : undefined;
  const merged: Paragraph = { ...p, runs, rev: rev && Object.keys(rev).length ? rev : undefined };
  const paragraphs = s.paragraphs.slice();
  paragraphs.splice(i, 2, merged);
  return { ...s, paragraphs };
}

/** Tracked formatting: apply `patch` and remember the attributes it replaced. */
export function trackedFormat(s: TextStory, range: TextRange, patch: Partial<CharAttrs>, mark: RevisionMark): TextStory {
  return editRuns(s, range, r => {
    const before = r.attrs ?? {};
    const old: Partial<CharAttrs> = before.fmt ? before.fmt.old : stripMarks(before);
    const next: CharAttrs = { ...before };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null) delete (next as Record<string, unknown>)[k]; else (next as Record<string, unknown>)[k] = v; }
    if (r.attrs?.ins && sameAuthor(r.attrs.ins, mark)) return withAttrs(r, next); // own insertion: formatting is part of it
    next.fmt = { ...(before.fmt ?? mark), old };
    return withAttrs(r, next);
  });
}

export function stripMarks(a: CharAttrs): Partial<CharAttrs> {
  const o: Record<string, unknown> = { ...a };
  for (const k of MARK_KEYS) delete o[k];
  return o as Partial<CharAttrs>;
}

// ── Review ──────────────────────────────────────────────────────────────────────────────────

export type RevisionKind = 'ins' | 'del' | 'fmt' | 'para-ins' | 'para-del' | 'para-fmt';
export interface RevisionInfo { id: string; kind: RevisionKind; author: string; authorId?: string; date: number; text: string; target: StoryTarget; range: TextRange }

/** Every pending revision, in document order (contiguous runs of one mark id are one revision). */
export function listRevisions(doc: WriterDocument): RevisionInfo[] {
  const out: RevisionInfo[] = [];
  const scan = (s: TextStory, target: StoryTarget) => {
    for (const p of s.paragraphs) {
      if (p.table) { for (const r of p.table.rows) for (const c of r.cells) scan(c.story, { kind: 'cell', tableId: p.id, rowId: r.id, cellId: c.id }); continue; }
      let off = 0;
      for (const r of p.runs) {
        const a = r.attrs;
        for (const kind of ['ins', 'del', 'fmt'] as const) {
          const m = a?.[kind];
          if (!m) continue;
          const last = out[out.length - 1];
          if (last && last.id === m.id && last.kind === kind && last.range.focus.paragraphId === p.id && last.range.focus.offset === off) {
            last.range.focus = { paragraphId: p.id, offset: off + r.text.length };
            last.text += r.text;
          } else {
            out.push({ id: m.id, kind, author: m.author, authorId: m.authorId, date: m.date, text: r.text, target, range: { anchor: { paragraphId: p.id, offset: off }, focus: { paragraphId: p.id, offset: off + r.text.length } } });
          }
        }
        off += r.text.length;
      }
      const end = { paragraphId: p.id, offset: off };
      if (p.rev?.ins) out.push({ id: p.rev.ins.id + ':p', kind: 'para-ins', author: p.rev.ins.author, authorId: p.rev.ins.authorId, date: p.rev.ins.date, text: '¶', target, range: { anchor: end, focus: end } });
      if (p.rev?.del) out.push({ id: p.rev.del.id + ':p', kind: 'para-del', author: p.rev.del.author, authorId: p.rev.del.authorId, date: p.rev.del.date, text: '¶', target, range: { anchor: end, focus: end } });
      if (p.rev?.fmt) out.push({ id: p.rev.fmt.id + ':pf', kind: 'para-fmt', author: p.rev.fmt.author, authorId: p.rev.fmt.authorId, date: p.rev.fmt.date, text: 'Paragraph formatting', target, range: { anchor: { paragraphId: p.id, offset: 0 }, focus: end } });
    }
  };
  scan(doc.story, { kind: 'body' });
  for (const n of Object.values(doc.notes)) scan(n.story, { kind: 'note', id: n.id });
  for (const [id, h] of Object.entries(doc.headerFooters)) scan(h, { kind: 'headerFooter', id });
  return out;
}

export type Decide = (mark: RevisionMark, kind: RevisionKind, paragraphId: string) => 'accept' | 'reject' | null;

/** Resolve revisions in one story (cells recurse). */
export function resolveRevisions(s: TextStory, decide: Decide): TextStory {
  let changed = false;
  const merges: string[] = [];
  const paragraphs = s.paragraphs.map(p => {
    if (p.table) {
      let tChanged = false;
      const rows = p.table.rows.map(r => ({ ...r, cells: r.cells.map(c => { const ns = resolveRevisions(c.story, decide); if (ns !== c.story) tChanged = true; return ns === c.story ? c : { ...c, story: ns }; }) }));
      if (!tChanged) return p;
      changed = true;
      return { ...p, table: { ...p.table, rows } };
    }
    let pc = false;
    const runs: Run[] = [];
    for (const r of p.runs) {
      let a = r.attrs;
      let drop = false;
      if (a?.ins) { const d = decide(a.ins, 'ins', p.id); if (d === 'accept') { a = { ...a, ins: undefined }; pc = true; } else if (d === 'reject') { drop = true; pc = true; } }
      if (!drop && a?.del) { const d = decide(a.del, 'del', p.id); if (d === 'accept') { drop = true; pc = true; } else if (d === 'reject') { a = { ...a, del: undefined }; pc = true; } }
      if (!drop && a?.fmt) {
        const d = decide(a.fmt, 'fmt', p.id);
        if (d === 'accept') { a = { ...a, fmt: undefined }; pc = true; }
        else if (d === 'reject') {
          const keep: Partial<CharAttrs> = {};
          for (const k of MARK_KEYS) if (k !== 'fmt' && a[k] !== undefined) (keep as Record<string, unknown>)[k] = a[k];
          a = { ...a.fmt.old, ...keep };
          pc = true;
        }
      }
      if (!drop) runs.push(withAttrs(r, a));
    }
    let rev = p.rev;
    let styleId = p.styleId, attrs = p.attrs;
    if (rev?.ins) { const d = decide(rev.ins, 'para-ins', p.id); if (d === 'accept') { rev = { ...rev, ins: undefined }; pc = true; } else if (d === 'reject') { rev = { ...rev, ins: undefined }; merges.push(p.id); pc = true; } }
    if (rev?.del) { const d = decide(rev.del, 'para-del', p.id); if (d === 'accept') { rev = { ...rev, del: undefined }; merges.push(p.id); pc = true; } else if (d === 'reject') { rev = { ...rev, del: undefined }; pc = true; } }
    if (rev?.fmt) { const d = decide(rev.fmt, 'para-fmt', p.id); if (d === 'accept') { rev = { ...rev, fmt: undefined }; pc = true; } else if (d === 'reject') { styleId = rev.fmt.old.styleId; attrs = rev.fmt.old.attrs; rev = { ...rev, fmt: undefined }; pc = true; } }
    if (!pc) return p;
    changed = true;
    const cleanRev = rev && (rev.ins || rev.del || rev.fmt) ? rev : undefined;
    return { ...p, styleId, attrs, runs: normalizeRuns(runs), rev: cleanRev };
  });
  if (!changed) return s;
  let story: TextStory = { ...s, paragraphs };
  for (const id of merges.reverse()) story = mergeWithNext(story, id);
  return story;
}

/** Decide functions. */
export const decideAll = (d: 'accept' | 'reject'): Decide => () => d;
export const decideById = (id: string, d: 'accept' | 'reject'): Decide => (m, kind) => (m.id === id || `${m.id}:p` === id || `${m.id}:pf` === id) ? d : null;
export function decideInRange(story: TextStory, range: TextRange, d: 'accept' | 'reject'): Decide {
  // Revisions touching the range (by mark id).
  const ids = new Set<string>();
  editRuns(story, range, r => { for (const k of ['ins', 'del', 'fmt'] as const) { const m = r.attrs?.[k]; if (m) ids.add(m.id); } return r; });
  const [a, b] = orderRange(story, range);
  const ia = paragraphIndex(story, a.paragraphId), ib = paragraphIndex(story, b.paragraphId);
  for (let i = ia; i <= ib; i++) { const r = story.paragraphs[i].rev; if (r?.ins) ids.add(r.ins.id); if (r?.del && i < ib) ids.add(r.del.id); if (r?.fmt) ids.add(r.fmt.id); }
  return m => (ids.has(m.id) ? d : null);
}

// ── Comment marks ───────────────────────────────────────────────────────────────────────────

export function addCommentMark(s: TextStory, range: TextRange, id: string): TextStory {
  return editRuns(s, range, r => withAttrs(r, { ...r.attrs, comments: [...(r.attrs?.comments ?? []).filter(c => c !== id), id] }));
}

export function removeCommentMark(s: TextStory, id: string): TextStory {
  let changed = false;
  const paragraphs = s.paragraphs.map(p => {
    if (p.table) {
      let tc = false;
      const rows = p.table.rows.map(r => ({ ...r, cells: r.cells.map(c => { const ns = removeCommentMark(c.story, id); if (ns !== c.story) tc = true; return ns === c.story ? c : { ...c, story: ns }; }) }));
      if (!tc) return p;
      changed = true;
      return { ...p, table: { ...p.table, rows } };
    }
    if (!p.runs.some(r => r.attrs?.comments?.includes(id))) return p;
    changed = true;
    return { ...p, runs: normalizeRuns(p.runs.map(r => { if (!r.attrs?.comments?.includes(id)) return r; const c = r.attrs.comments.filter(x => x !== id); return withAttrs(r, { ...r.attrs, comments: c.length ? c : undefined }); })) };
  });
  return changed ? { ...s, paragraphs } : s;
}

/** Ranges of every comment in a story (first to last marked character). */
export function commentRanges(s: TextStory): Map<string, TextRange> {
  const out = new Map<string, TextRange>();
  for (const p of s.paragraphs) {
    let off = 0;
    for (const r of p.runs) {
      for (const id of r.attrs?.comments ?? []) {
        const cur = out.get(id);
        const end = { paragraphId: p.id, offset: off + r.text.length };
        if (!cur) out.set(id, { anchor: { paragraphId: p.id, offset: off }, focus: end });
        else cur.focus = end;
      }
      off += r.text.length;
    }
  }
  return out;
}
