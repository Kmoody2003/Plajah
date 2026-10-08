// Pure geometry for the slide editor: snapping, resizing, aligning, distributing.
// Everything is in artboard px (1920×1080), un-rotated boxes unless stated.

export interface Box { x: number; y: number; w: number; h: number }
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export interface Guide { axis: 'x' | 'y'; at: number }

export const unionBox = (bs: Box[]): Box => {
  const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y));
  const x1 = Math.max(...bs.map(b => b.x + b.w)), y1 = Math.max(...bs.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/**
 * Snap a moving box to the artboard (edges, centre, safe-area edges) and to other boxes
 * (edges / centres). Returns the correction to add and the guides to draw.
 */
export function snapMove(box: Box, others: Box[], W: number, H: number, threshold: number, extraX: number[] = [], extraY: number[] = []): { dx: number; dy: number; guides: Guide[] } {
  const tx = [0, W / 2, W, ...extraX], ty = [0, H / 2, H, ...extraY];
  for (const o of others) { tx.push(o.x, o.x + o.w / 2, o.x + o.w); ty.push(o.y, o.y + o.h / 2, o.y + o.h); }
  const mine = (a: number, s: number) => [a, a + s / 2, a + s];
  let bestX: { d: number; at: number } | null = null, bestY: { d: number; at: number } | null = null;
  for (const m of mine(box.x, box.w)) for (const t of tx) { const d = t - m; if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: t }; }
  for (const m of mine(box.y, box.h)) for (const t of ty) { const d = t - m; if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: t }; }
  const guides: Guide[] = [];
  if (bestX) guides.push({ axis: 'x', at: bestX.at });
  if (bestY) guides.push({ axis: 'y', at: bestY.at });
  return { dx: bestX?.d ?? 0, dy: bestY?.d ?? 0, guides };
}

const MIN = 8;

/**
 * Resize an UN-ROTATED box by dragging a handle by (dx, dy). `keepAspect` preserves the starting
 * ratio (corner handles), `fromCenter` resizes symmetrically (Alt).
 */
export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, opts: { keepAspect?: boolean; fromCenter?: boolean } = {}): Box {
  let { x, y, w, h } = start;
  const hasW = handle.includes('w'), hasE = handle.includes('e'), hasN = handle.includes('n'), hasS = handle.includes('s');
  const k = opts.fromCenter ? 2 : 1;
  if (hasE) w = start.w + dx * k; if (hasW) w = start.w - dx * k;
  if (hasS) h = start.h + dy * k; if (hasN) h = start.h - dy * k;
  if (opts.keepAspect && start.w > 0 && start.h > 0) {
    const r = start.w / start.h;
    if ((hasE || hasW) && (hasN || hasS)) { if (Math.abs(w - start.w) / start.w >= Math.abs(h - start.h) / start.h) h = w / r; else w = h * r; }
    else if (hasE || hasW) h = w / r;
    else w = h * r;
  }
  w = Math.max(MIN, w); h = Math.max(MIN, h);
  if (opts.fromCenter) { x = start.x + (start.w - w) / 2; y = start.y + (start.h - h) / 2; }
  else {
    x = hasW ? start.x + start.w - w : (!hasE && opts.keepAspect ? start.x + (start.w - w) / 2 : start.x);
    y = hasN ? start.y + start.h - h : (!hasS && opts.keepAspect ? start.y + (start.h - h) / 2 : start.y);
  }
  return { x, y, w, h };
}

/** Rotate a screen-space delta into a box's local (un-rotated) frame — lets rotated boxes resize along their own axes. */
export function toLocalDelta(dx: number, dy: number, rotationDeg: number): { dx: number; dy: number } {
  const a = -rotationDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { dx: dx * c - dy * s, dy: dx * s + dy * c };
}

/** After a rotated resize the box centre moves; keep the opposite edge fixed by correcting the origin. */
export function fixRotatedOrigin(start: Box, next: Box, rotationDeg: number, handle: Handle): Box {
  if (!rotationDeg) return next;
  const a = rotationDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const anchorLocal = (b: Box) => ({
    x: handle.includes('w') ? b.x + b.w : handle.includes('e') ? b.x : b.x + b.w / 2,
    y: handle.includes('n') ? b.y + b.h : handle.includes('s') ? b.y : b.y + b.h / 2,
  });
  const world = (b: Box) => {
    const p = anchorLocal(b), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rx = p.x - cx, ry = p.y - cy;
    return { x: cx + rx * c - ry * s, y: cy + rx * s + ry * c };
  };
  const w0 = world(start), w1 = world(next);
  return { ...next, x: next.x + (w0.x - w1.x), y: next.y + (w0.y - w1.y) };
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** New x/y per box for an alignment. With one box it aligns to the artboard, otherwise to the selection bounds. */
export function alignBoxes(boxes: Box[], mode: AlignMode, W: number, H: number): Array<{ x: number; y: number }> {
  const ref: Box = boxes.length === 1 ? { x: 0, y: 0, w: W, h: H } : unionBox(boxes);
  return boxes.map(b => {
    switch (mode) {
      case 'left': return { x: ref.x, y: b.y };
      case 'hcenter': return { x: ref.x + (ref.w - b.w) / 2, y: b.y };
      case 'right': return { x: ref.x + ref.w - b.w, y: b.y };
      case 'top': return { x: b.x, y: ref.y };
      case 'vcenter': return { x: b.x, y: ref.y + (ref.h - b.h) / 2 };
      case 'bottom': return { x: b.x, y: ref.y + ref.h - b.h };
    }
  });
}

/** Even spacing between ≥3 boxes along an axis (outer two stay). Returns new x/y per input index. */
export function distributeBoxes(boxes: Box[], axis: 'x' | 'y'): Array<{ x: number; y: number }> {
  const out = boxes.map(b => ({ x: b.x, y: b.y }));
  if (boxes.length < 3) return out;
  const size = axis === 'x' ? 'w' : 'h';
  const order = boxes.map((b, i) => i).sort((a, b) => boxes[a][axis] - boxes[b][axis]);
  const first = boxes[order[0]], last = boxes[order[order.length - 1]];
  const total = last[axis] + last[size] - first[axis];
  const used = order.reduce((s, i) => s + boxes[i][size], 0);
  const gap = (total - used) / (order.length - 1);
  let cursor = first[axis];
  for (const i of order) { out[i][axis] = cursor; cursor += boxes[i][size] + gap; }
  return out;
}

/** Fit the artboard into a viewport (padding in px) → scale. */
export const fitScale = (vw: number, vh: number, W = 1920, H = 1080, pad = 32) => Math.max(0.05, Math.min((vw - pad * 2) / W, (vh - pad * 2) / H));

/** Title-safe (5%) and action-safe (10% margins) rectangles, broadcast convention. */
export const safeAreas = (W = 1920, H = 1080): { action: Box; title: Box } => ({
  action: { x: W * .035, y: H * .035, w: W * .93, h: H * .93 },
  title: { x: W * .05, y: H * .05, w: W * .9, h: H * .9 },
});
