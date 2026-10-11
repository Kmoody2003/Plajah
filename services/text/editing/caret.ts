// caret — hit testing, caret and selection geometry, and cursor navigation over a StoryLayout.
//
// Everything works from the per-line caret spans the engine emits: one span per grapheme in
// VISUAL order with its logical [start, end) and x extent, ligatures already split by grapheme
// count and RTL spans marked. A caret at offset k sits on the LEADING edge of the grapheme that
// starts at k (left edge in LTR, right edge in RTL) — or, with upstream affinity, on the trailing
// edge of the grapheme that ends at k, which is how a caret at a soft line end or at a bidi
// boundary stays where the user put it.

import type { LaidLine, StoryLayout } from '../layout/flow';
import { type Position, type TextRange, type TextStory, orderRange, paragraphIndex, paragraphLength, paragraphText } from '../model';

export type Affinity = 'upstream' | 'downstream';
export interface CaretRect { x: number; top: number; bottom: number; frameIndex: number; line: number; rtl: boolean }
export interface Rect { x: number; y: number; width: number; height: number; frameIndex: number }
export interface HitResult { position: Position; affinity: Affinity; line: number }

function paragraphLines(layout: StoryLayout, paragraphId: string): [number, number] {
  const p = layout.paragraphs.find(q => q.id === paragraphId);
  return p ? [p.firstLine, p.lineCount] : [-1, 0];
}

/** Global line index holding `pos` (respecting affinity at soft line boundaries). -1 if overset. */
export function lineForPosition(layout: StoryLayout, pos: Position, affinity: Affinity = 'downstream'): number {
  const [first, count] = paragraphLines(layout, pos.paragraphId);
  if (first < 0 || !count) return -1;
  for (let k = first; k < first + count; k++) {
    const l = layout.lines[k];
    if (pos.offset < l.end || k === first + count - 1) {
      if (affinity === 'upstream' && pos.offset === l.start && k > first) return k - 1;
      return k;
    }
  }
  return first + count - 1;
}

function lineCaretX(l: LaidLine, offset: number, affinity: Affinity): number {
  let lead: number | undefined, trail: number | undefined;
  for (const s of l.spans) {
    if (s.start === offset && lead === undefined) lead = s.rtl ? s.x1 : s.x0;
    if (s.end === offset) trail = s.rtl ? s.x0 : s.x1;
  }
  if (affinity === 'upstream' && trail !== undefined) return trail;
  if (lead !== undefined) return lead;
  if (trail !== undefined) return trail;
  // Inside a grapheme (should not happen for clamped positions) or empty line.
  const inside = l.spans.find(s => offset > s.start && offset < s.end);
  if (inside) return (inside.x0 + inside.x1) / 2;
  if (!l.spans.length) return l.rtl ? l.inkX + l.inkWidth : l.inkX;
  // Past the end: the visual end of the line.
  return l.rtl ? Math.min(...l.spans.map(s => s.x0)) : Math.max(...l.spans.map(s => s.x1));
}

export function positionToCaret(layout: StoryLayout, pos: Position, affinity: Affinity = 'downstream'): CaretRect | null {
  const li = lineForPosition(layout, pos, affinity);
  if (li < 0) return null;
  const l = layout.lines[li];
  const x = lineCaretX(l, pos.offset, affinity);
  return { x, top: l.baseline - l.ascent, bottom: l.baseline + l.descent, frameIndex: l.frameIndex, line: li, rtl: l.rtl };
}

/** Caret stops of a line: every leading/trailing grapheme edge with its offset. */
function stops(l: LaidLine): { x: number; offset: number }[] {
  const out: { x: number; offset: number }[] = [];
  for (const s of l.spans) {
    out.push({ x: s.rtl ? s.x1 : s.x0, offset: s.start });
    out.push({ x: s.rtl ? s.x0 : s.x1, offset: s.end });
  }
  if (!out.length) out.push({ x: l.rtl ? l.inkX + l.inkWidth : l.inkX, offset: l.start });
  return out;
}

export function hitLine(layout: StoryLayout, li: number, x: number): HitResult {
  const l = layout.lines[li];
  const lastOfPara = li + 1 >= layout.lines.length || layout.lines[li + 1].paragraphId !== l.paragraphId;
  let best = { x: 0, offset: l.start }, bd = Infinity;
  for (const s of stops(l)) {
    // Soft-wrapped lines: offsets in trailing whitespace past contentEnd map to the line end.
    const d = Math.abs(s.x - x);
    if (d < bd - 1e-6 || (Math.abs(d - bd) < 1e-6 && s.offset > best.offset)) { bd = d; best = s; }
  }
  const offset = Math.min(best.offset, l.end);
  const affinity: Affinity = !lastOfPara && offset === l.end ? 'upstream' : 'downstream';
  return { position: { paragraphId: l.paragraphId, offset }, affinity, line: li };
}

/** Point (page px) → position. `frameIndex` restricts the search to one frame. */
export function pointToPosition(layout: StoryLayout, x: number, y: number, frameIndex?: number): HitResult | null {
  let best = -1, bd = Infinity;
  layout.lines.forEach((l, i) => {
    if (frameIndex !== undefined && l.frameIndex !== frameIndex) return;
    const col = layout.frames[l.frameIndex].columns[l.column];
    const dx = col ? (x < col.x ? col.x - x : x > col.x + col.width ? x - (col.x + col.width) : 0) : 0;
    const dy = y < l.top ? l.top - y : y > l.bottom ? y - l.bottom : 0;
    const d = dy * 4 + dx; // vertical distance dominates
    if (d < bd) { bd = d; best = i; }
  });
  return best < 0 ? null : hitLine(layout, best, x);
}

/** Selection rectangles (one per line fragment; bidi ranges may give several per line). */
export function rangeToRects(layout: StoryLayout, story: TextStory, range: TextRange): Rect[] {
  const [a, b] = orderRange(story, range);
  if (a.paragraphId === b.paragraphId && a.offset === b.offset) return [];
  const ia = paragraphIndex(story, a.paragraphId), ib = paragraphIndex(story, b.paragraphId);
  const out: Rect[] = [];
  for (let pi = ia; pi <= ib; pi++) {
    const p = story.paragraphs[pi];
    const from = pi === ia ? a.offset : 0;
    const to = pi === ib ? b.offset : paragraphLength(p) + 1; // +1: the paragraph break itself
    const [first, count] = paragraphLines(layout, p.id);
    for (let k = first; k >= 0 && k < first + count; k++) {
      const l = layout.lines[k];
      if (l.end <= from && !(l.end === from && k === first + count - 1 && to > from)) continue;
      if (l.start >= to) break;
      const xs: [number, number][] = [];
      for (const s of l.spans) {
        if (s.end <= from || s.start >= to) continue;
        xs.push([Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)]);
      }
      // Selected line break / paragraph mark: a sliver at the visual end.
      const lastOfPara = k === first + count - 1;
      if ((lastOfPara && to > paragraphLength(p)) || (!lastOfPara && to > l.end)) {
        const ex = l.rtl ? l.inkX : l.inkX + l.inkWidth;
        const w = Math.max(3, (l.ascent + l.descent) * 0.25);
        xs.push(l.rtl ? [ex - w, ex] : [ex, ex + w]);
      }
      xs.sort((u, v) => u[0] - v[0]);
      const merged: [number, number][] = [];
      for (const r of xs) {
        const m = merged[merged.length - 1];
        if (m && r[0] <= m[1] + 0.5) m[1] = Math.max(m[1], r[1]);
        else merged.push([r[0], r[1]]);
      }
      for (const [x0, x1] of merged) out.push({ x: x0, y: l.top, width: x1 - x0, height: l.bottom - l.top, frameIndex: l.frameIndex });
    }
  }
  return out;
}

// ── Navigation ──────────────────────────────────────────────────────────────────────────────

const segmenters = new Map<string, Intl.Segmenter>();
function seg(g: 'grapheme' | 'word'): Intl.Segmenter {
  let s = segmenters.get(g);
  if (!s) segmenters.set(g, (s = new Intl.Segmenter(undefined, { granularity: g })));
  return s;
}

/** Next/previous grapheme boundary, crossing paragraph breaks. */
export function moveByGrapheme(story: TextStory, pos: Position, dir: 1 | -1): Position {
  const pi = paragraphIndex(story, pos.paragraphId);
  const p = story.paragraphs[pi];
  const t = paragraphText(p);
  if (dir > 0) {
    if (pos.offset >= t.length) return pi + 1 < story.paragraphs.length ? { paragraphId: story.paragraphs[pi + 1].id, offset: 0 } : pos;
    for (const s of seg('grapheme').segment(t)) if (s.index > pos.offset) return { paragraphId: p.id, offset: s.index };
    return { paragraphId: p.id, offset: t.length };
  }
  if (pos.offset <= 0) {
    if (pi === 0) return pos;
    const q = story.paragraphs[pi - 1];
    return { paragraphId: q.id, offset: paragraphLength(q) };
  }
  let prev = 0;
  for (const s of seg('grapheme').segment(t)) { if (s.index >= pos.offset) break; prev = s.index; }
  return { paragraphId: p.id, offset: prev };
}

/** Word-wise movement (Ctrl/Alt+arrow): to the next word end / previous word start. */
export function moveByWord(story: TextStory, pos: Position, dir: 1 | -1): Position {
  const pi = paragraphIndex(story, pos.paragraphId);
  const p = story.paragraphs[pi];
  const t = paragraphText(p);
  const words = [...seg('word').segment(t)].filter(s => s.isWordLike);
  if (dir > 0) {
    const w = words.find(s => s.index + s.segment.length > pos.offset);
    if (w) return { paragraphId: p.id, offset: w.index + w.segment.length };
    return pi + 1 < story.paragraphs.length && pos.offset >= t.length ? moveByWord(story, { paragraphId: story.paragraphs[pi + 1].id, offset: 0 }, 1) : { paragraphId: p.id, offset: t.length };
  }
  const w = [...words].reverse().find(s => s.index < pos.offset);
  if (w) return { paragraphId: p.id, offset: w.index };
  if (pos.offset > 0) return { paragraphId: p.id, offset: 0 };
  if (pi === 0) return pos;
  const q = story.paragraphs[pi - 1];
  return moveByWord(story, { paragraphId: q.id, offset: paragraphLength(q) }, -1);
}

/** The word (or whitespace/punctuation run) around a position — double-click selection. */
export function wordRangeAt(story: TextStory, pos: Position): TextRange {
  const p = story.paragraphs[paragraphIndex(story, pos.paragraphId)];
  const t = paragraphText(p);
  for (const s of seg('word').segment(t)) {
    if (pos.offset >= s.index && pos.offset < s.index + s.segment.length) return { anchor: { paragraphId: p.id, offset: s.index }, focus: { paragraphId: p.id, offset: s.index + s.segment.length } };
  }
  return { anchor: pos, focus: pos };
}

/** Visual line start/end (Home/End). End is the content end on soft-wrapped lines. */
export function lineBoundary(layout: StoryLayout, pos: Position, which: 'start' | 'end', affinity: Affinity = 'downstream'): { position: Position; affinity: Affinity } {
  const li = lineForPosition(layout, pos, affinity);
  if (li < 0) return { position: pos, affinity };
  const l = layout.lines[li];
  const lastOfPara = li + 1 >= layout.lines.length || layout.lines[li + 1].paragraphId !== l.paragraphId;
  if (which === 'start') return { position: { paragraphId: l.paragraphId, offset: l.start }, affinity: 'downstream' };
  const off = lastOfPara ? l.end : l.contentEnd;
  return { position: { paragraphId: l.paragraphId, offset: off }, affinity: !lastOfPara && off === l.end ? 'upstream' : 'downstream' };
}

/** Up/down with a remembered goal x (pass back `goalX` on repeated presses). */
export function moveVertical(layout: StoryLayout, story: TextStory, pos: Position, affinity: Affinity, dir: 1 | -1, goalX?: number): { position: Position; affinity: Affinity; goalX: number } {
  const caret = positionToCaret(layout, pos, affinity);
  if (!caret) return { position: pos, affinity, goalX: goalX ?? 0 };
  const gx = goalX ?? caret.x;
  const target = caret.line + dir;
  if (target < 0) return { position: { paragraphId: story.paragraphs[0].id, offset: 0 }, affinity: 'downstream', goalX: gx };
  if (target >= layout.lines.length) {
    const last = story.paragraphs[story.paragraphs.length - 1];
    return { position: { paragraphId: last.id, offset: paragraphLength(last) }, affinity: 'downstream', goalX: gx };
  }
  const h = hitLine(layout, target, gx);
  return { position: h.position, affinity: h.affinity, goalX: gx };
}
