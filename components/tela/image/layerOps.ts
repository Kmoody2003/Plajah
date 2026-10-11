// layerOps — pure RasterDocument edits the Image Studio needs beyond the engine's
// insert/update/remove: tree listing for the Layers panel, drag-reorder into/out of groups,
// group/ungroup, duplicate, arrange, and whole-document geometry (crop with straighten,
// canvas size with anchor, rotate/flip canvas) done NON-destructively by composing an affine
// into every layer transform. Unlinked bitmap masks live in document space with axis-aligned
// bounds, so a rotation/flip cannot be expressed on them; those come back as `maskJobs` for
// the controller to resample. Tested in node.

import {
  type RasterDocument, type RasterLayer, type GroupLayer, type Affine, type PixelLayer, type VectorMask, type BitmapMask, type Rect,
  findLayer, removeLayer, insertLayer, updateLayer, groupLayer, newLayerId, affineMul, affineApply, affineTranslate, transformedBounds,
} from '../../../services/tela/raster/model';

export interface TreeRow { layer: RasterLayer; depth: number; parentId: string | null; index: number }
/** Top → bottom rows for the Layers panel (collapsed groups hide their children). */
export function layerRows(doc: RasterDocument): TreeRow[] {
  const out: TreeRow[] = [];
  const walk = (list: RasterLayer[], depth: number, parentId: string | null) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i]; out.push({ layer: l, depth, parentId, index: i });
      if (l.kind === 'group' && !l.collapsed) walk(l.children, depth + 1, l.id);
    }
  };
  walk(doc.layers, 0, null); return out;
}
/** Every layer id bottom → top (flattened, groups included). */
export function allLayerIds(doc: RasterDocument): string[] {
  const out: string[] = []; const walk = (l: RasterLayer[]) => l.forEach(x => { out.push(x.id); if (x.kind === 'group') walk(x.children); }); walk(doc.layers); return out;
}
export function siblingsOf(doc: RasterDocument, id: string): RasterLayer[] {
  const hit = findLayer(doc, id); if (!hit) return []; return hit.parent ? hit.parent.children : doc.layers;
}
const isAncestor = (doc: RasterDocument, maybeAncestor: string, id: string): boolean => {
  const a = findLayer(doc, maybeAncestor)?.layer; if (!a || a.kind !== 'group') return false;
  let found = false; const walk = (l: RasterLayer[]) => l.forEach(x => { if (x.id === id) found = true; if (x.kind === 'group') walk(x.children); }); walk(a.children); return found;
};

/** Drag-reorder: put `id` above / below `targetId`, or inside group `targetId` (top). */
export function moveLayer(doc: RasterDocument, id: string, targetId: string | null, where: 'above' | 'below' | 'into'): RasterDocument {
  if (id === targetId) return doc;
  const hit = findLayer(doc, id); if (!hit) return doc;
  if (targetId && isAncestor(doc, id, targetId)) return doc; // never into its own subtree
  const layer = hit.layer; let next = removeLayer(doc, id);
  if (!targetId) return { ...next, layers: where === 'below' ? [layer, ...next.layers] : [...next.layers, layer] };
  const t = findLayer(next, targetId); if (!t) return doc;
  if (where === 'into' && t.layer.kind === 'group') return updateLayer(next, targetId, g => ({ ...(g as GroupLayer), children: [...(g as GroupLayer).children, layer], collapsed: false }));
  const place = (list: RasterLayer[]): RasterLayer[] => {
    const i = list.findIndex(l => l.id === targetId);
    if (i >= 0) return where === 'below' ? [...list.slice(0, i), layer, ...list.slice(i)] : [...list.slice(0, i + 1), layer, ...list.slice(i + 1)];
    return list.map(l => l.kind === 'group' ? { ...l, children: place(l.children) } : l);
  };
  next = { ...next, layers: place(next.layers) }; return next;
}
export function arrange(doc: RasterDocument, id: string, how: 'forward' | 'backward' | 'front' | 'back'): RasterDocument {
  const sib = siblingsOf(doc, id), i = sib.findIndex(l => l.id === id); if (i < 0) return doc;
  const j = how === 'forward' ? Math.min(sib.length - 1, i + 1) : how === 'backward' ? Math.max(0, i - 1) : how === 'front' ? sib.length - 1 : 0;
  if (j === i) return doc;
  return moveLayer(doc, id, sib[j].id, j > i ? 'above' : 'below');
}
/** Ctrl+G: wrap the given layers (siblings or not) in a new group at the topmost one's place. */
export function groupLayers(doc: RasterDocument, ids: string[], name = 'Group'): { doc: RasterDocument; groupId: string } {
  const order = allLayerIds(doc).filter(id => ids.includes(id)); if (!order.length) return { doc, groupId: '' };
  const layers = order.map(id => findLayer(doc, id)!.layer).filter(l => !order.some(o => o !== l.id && isAncestor(doc, o, l.id)));
  const top = order[order.length - 1], topHit = findLayer(doc, top)!;
  const g = groupLayer(layers, { name });
  // insert the group where the topmost member sits, then remove the members
  let next = topHit.parent ? insertLayer(doc, g, { aboveId: top }) : insertLayer(doc, g, { aboveId: top });
  for (const l of layers) next = removeLayerShallow(next, l.id, g.id);
  return { doc: next, groupId: g.id };
}
/** Remove a layer by id everywhere EXCEPT inside group `keepIn`. */
function removeLayerShallow(doc: RasterDocument, id: string, keepIn: string): RasterDocument {
  const f = (list: RasterLayer[], inKeep: boolean): RasterLayer[] => list.filter(l => inKeep || l.id !== id).map(l => l.kind === 'group' ? { ...l, children: f(l.children, l.id === keepIn) } : l);
  return { ...doc, layers: f(doc.layers, false) };
}
export function ungroup(doc: RasterDocument, groupId: string): RasterDocument {
  const hit = findLayer(doc, groupId); if (!hit || hit.layer.kind !== 'group') return doc;
  const g = hit.layer; const kids = g.children.map(c => ({ ...c, opacity: c.opacity * g.opacity, visible: c.visible && g.visible }));
  const splice = (list: RasterLayer[]): RasterLayer[] => { const i = list.findIndex(l => l.id === groupId); if (i >= 0) return [...list.slice(0, i), ...kids, ...list.slice(i + 1)]; return list.map(l => l.kind === 'group' ? { ...l, children: splice(l.children) } : l); };
  return { ...doc, layers: splice(doc.layers) };
}
/** Deep copy with fresh ids; `copyAsset` returns the key a duplicated bitmap/mask should use. */
export function cloneLayer(l: RasterLayer, copyAsset: (key: string, kind: 'bitmap' | 'mask') => string, rename = true): RasterLayer {
  const c: RasterLayer = structuredClone(l); const fix = (x: RasterLayer, top: boolean): RasterLayer => {
    const id = newLayerId(x.kind === 'group' ? 'grp' : x.kind === 'adjustment' ? 'adj' : x.kind === 'fill' ? 'fill' : 'rl');
    let n = { ...x, id, name: top && rename ? `${x.name} copy` : x.name } as RasterLayer;
    if (n.kind === 'pixel' && n.asset.assetId) n = { ...n, asset: { assetId: copyAsset(n.asset.assetId, 'bitmap') } };
    if (n.mask?.kind === 'bitmap') n = { ...n, mask: { ...n.mask, assetId: copyAsset(n.mask.assetId, 'mask') } };
    if (n.kind === 'group') n = { ...n, children: n.children.map(ch => fix(ch, false)) };
    return n;
  };
  return fix(c, true);
}
export function duplicateLayer(doc: RasterDocument, id: string, copyAsset: (key: string, kind: 'bitmap' | 'mask') => string): { doc: RasterDocument; id: string } {
  const hit = findLayer(doc, id); if (!hit) return { doc, id };
  const dup = cloneLayer(hit.layer, copyAsset); return { doc: insertLayer(doc, dup, { aboveId: id }), id: dup.id };
}

// ── Whole-document geometry ─────────────────────────────────────────────────────────────────
export interface MaskJob { layerId: string; mask: BitmapMask; /** old doc → new doc */ m: Affine; newBounds: Rect }
const isTranslation = (m: Affine) => Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;
const rotationDeg = (m: Affine) => Math.atan2(m[1], m[0]) * 180 / Math.PI;
const mapVector = (v: VectorMask, m: Affine): VectorMask => ({ ...v, subpaths: v.subpaths.map(sp => ({ ...sp, points: sp.points.map(p => { const [x, y] = affineApply(m, p.x, p.y); const h = (q?: { x: number; y: number }) => q && (([a, b]) => ({ x: a, y: b }))(affineApply(m, q.x, q.y)); return { x, y, in: h(p.in), out: h(p.out) }; }) })) });

/**
 * Compose `m` (old doc px → new doc px) into every layer; the document becomes newW × newH.
 * Pixel layers only change their transform (no resampling). Returns mask jobs for unlinked
 * bitmap masks under a non-translation `m`.
 */
export function transformDocument(doc: RasterDocument, m: Affine, newW: number, newH: number): { doc: RasterDocument; maskJobs: MaskJob[] } {
  const jobs: MaskJob[] = [], rot = rotationDeg(m), flipped = m[0] * m[3] - m[1] * m[2] < 0, trans = isTranslation(m);
  const oldC = [doc.width / 2, doc.height / 2], newC = [newW / 2, newH / 2];
  const fix = (l: RasterLayer): RasterLayer => {
    let n: RasterLayer = l;
    if (n.kind === 'pixel') n = { ...n, transform: affineMul(m, n.transform) } as PixelLayer;
    if (n.mask?.kind === 'bitmap' && !n.mask.linked) {
      const b = n.mask.bounds;
      if (trans) n = { ...n, mask: { ...n.mask, bounds: { ...b, x: b.x + m[4], y: b.y + m[5] } } };
      else { const nb = transformedBounds(m, 0, 0); void nb; const tb = transformedBounds(affineMul(m, affineTranslate(b.x, b.y)), b.width, b.height); jobs.push({ layerId: n.id, mask: n.mask, m, newBounds: tb }); n = { ...n, mask: { ...n.mask, bounds: tb } }; }
    }
    if (n.mask?.kind === 'gradient') n = { ...n, mask: { ...n.mask, angle: n.mask.angle + (flipped ? -rot : rot) } };
    if (n.vectorMask && !n.vectorMask.linked) n = { ...n, vectorMask: mapVector(n.vectorMask, m) };
    if (n.kind === 'fill' && (n.fill.type === 'gradient' || n.fill.type === 'pattern')) {
      const f = n.fill, [cx, cy] = affineApply(m, oldC[0] + (f.offsetX || 0), oldC[1] + (f.offsetY || 0));
      n = { ...n, fill: { ...f, offsetX: cx - newC[0], offsetY: cy - newC[1], angle: (f.angle || 0) + rot } as typeof f };
    }
    if (n.kind === 'group') n = { ...n, children: n.children.map(fix) };
    return n;
  };
  return { doc: { ...doc, width: Math.max(1, Math.round(newW)), height: Math.max(1, Math.round(newH)), layers: doc.layers.map(fix) }, maskJobs: jobs };
}
/** Crop (non-destructive): `rect` in doc px, optional straighten angle about the rect centre. */
export function cropDocument(doc: RasterDocument, rect: Rect, angleDeg = 0) {
  const a = -angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const m: Affine = affineMul(affineTranslate(rect.width / 2, rect.height / 2), affineMul([c, s, -s, c, 0, 0], affineTranslate(-cx, -cy)));
  return transformDocument(doc, m, rect.width, rect.height);
}
export type CanvasAnchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';
export function canvasSizeDocument(doc: RasterDocument, w: number, h: number, anchor: CanvasAnchor = 'c') {
  const fx = anchor.includes('l') ? 0 : anchor.includes('r') ? 1 : 0.5, fy = anchor.startsWith('t') ? 0 : anchor.startsWith('b') ? 1 : 0.5;
  return transformDocument(doc, affineTranslate(Math.round((w - doc.width) * fx), Math.round((h - doc.height) * fy)), w, h);
}
export function rotateCanvas(doc: RasterDocument, how: 'cw' | 'ccw' | '180') {
  const W = doc.width, H = doc.height;
  if (how === '180') return transformDocument(doc, [-1, 0, 0, -1, W, H], W, H);
  return how === 'cw' ? transformDocument(doc, [0, 1, -1, 0, H, 0], H, W) : transformDocument(doc, [0, -1, 1, 0, 0, W], H, W);
}
export function flipCanvas(doc: RasterDocument, axis: 'horizontal' | 'vertical') {
  return transformDocument(doc, axis === 'horizontal' ? [-1, 0, 0, 1, doc.width, 0] : [1, 0, 0, -1, 0, doc.height], doc.width, doc.height);
}
/** Flip/rotate ONE layer about its own centre (Edit › Transform › Flip/Rotate). */
export function transformLayerAboutCenter(l: PixelLayer, op: 'flip-h' | 'flip-v' | 'cw' | 'ccw' | '180'): PixelLayer {
  const [cx, cy] = affineApply(l.transform, l.width / 2, l.height / 2);
  const local: Affine = op === 'flip-h' ? [-1, 0, 0, 1, 0, 0] : op === 'flip-v' ? [1, 0, 0, -1, 0, 0] : op === 'cw' ? [0, 1, -1, 0, 0, 0] : op === 'ccw' ? [0, -1, 1, 0, 0, 0] : [-1, 0, 0, -1, 0, 0];
  const m = affineMul(affineTranslate(cx, cy), affineMul(local, affineTranslate(-cx, -cy)));
  return { ...l, transform: affineMul(m, l.transform) };
}
