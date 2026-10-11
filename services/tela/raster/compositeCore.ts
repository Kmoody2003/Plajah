// raster/compositeCore — the ONE traversal of the layer stack, shared by the CPU reference
// backend (cpuBackend.ts, node-testable) and the WebGL2 backend (gl/glBackend.ts).
//
// Putting the stack semantics here and only pixel primitives in the backends means the
// GPU cannot drift from the reference: groups, clipping, masks, styles, smart filters and
// adjustment layers are decided once.
//
// Semantics (Photoshop):
//  • Pixel/fill layer: content = draw → smart filters → × (layer mask · vector mask);
//    styles are derived from the masked content; result composited with the layer blend
//    at opacity × fillOpacity (styles at opacity only).
//  • Adjustment layer: backdrop' = lerp(backdrop, B(backdrop, Adj(backdrop)), opacity·mask).
//  • Pass-through group: children render straight onto (a copy of) the backdrop, then
//    lerp by group opacity·mask. Isolated group (any other blend): children render into a
//    transparent buffer which then composites like a pixel layer.
//  • Clipping: a base layer plus the clipped layers above it render into an isolated
//    buffer; clipped layers composite "atop" (alpha locked to the base); the buffer then
//    composites with the BASE's blend/opacity/styles ("clipped layers take on the base's
//    opacity and blend mode").
//  • Layer styles: drop shadow + outer glow under the content, inner shadow + colour
//    overlay + stroke over it; "layer knocks out drop shadow" is always on.
//
// Colour: buffers are premultiplied. In blendSpace 'linear' the backends decode sRGB on
// draw and encode on readback; adjustments always evaluate in sRGB-encoded values.

import type { Adjustment, Affine, BlendMode, FillContent, Filter, LayerMask, LayerStyles, RasterDocument, RasterLayer, RGB, VectorMask, Rect } from './model';
import { affineMul, affineTranslate } from './model';
import { filterApron } from './filters';
import { rasterizeSubpaths } from './vectorPath';
import type { RasterF } from './buffer';

export interface CompositeView {
  /** Document coordinates of the output's top-left corner. */
  x: number; y: number;
  /** Output pixels per document pixel (1 = 100%, 0.25 = 25% zoom). */
  scale: number;
  /** Output size in pixels. */
  width: number; height: number;
}
export type CompositeOp = 'over' | 'atop' | 'keep';

export interface Backend<S> {
  begin(view: CompositeView, doc: RasterDocument): void;
  end(): void;
  alloc(): S;
  release(s: S): void;
  clear(s: S, premul?: [number, number, number, number]): void;
  copy(dst: S, src: S): void;
  /** Draw a bitmap (kind 'rgba') or gray mask (kind 'mask', value in every channel) with bitmap→doc matrix m. */
  drawBitmap(dst: S, key: string, m: Affine, kind: 'rgba' | 'mask', outside?: number): boolean;
  fill(dst: S, fill: FillContent): void;
  uploadCoverage(dst: S, coverage: Float32Array): void;
  /** dst *= m', m' = 1 − density·(1 − (invert ? 1−v : v)), v = mask ALPHA channel (mask surfaces hold v in all channels, so content surfaces double as masks). */
  multiply(dst: S, mask: S, density: number, invert: boolean): void;
  composite(dst: S, src: S, mode: BlendMode, opacity: number, mask: S | null, op: CompositeOp): void;
  lerp(dst: S, other: S, opacity: number, mask: S | null): void;
  adjust(dst: S, adj: Adjustment, opacity: number, mask: S | null): void;
  filter(dst: S, src: S, f: Filter): void;
  tint(dst: S, src: S, color: RGB, invertAlpha: boolean): void;
  translate(dst: S, src: S, dx: number, dy: number): void;
  alphaGain(dst: S, gain: number): void;
  stroke(dst: S, src: S, size: number, position: 'outside' | 'inside' | 'center', color: RGB): void;
  readback(s: S): RasterF;
}

/** Extra context pixels a full render needs so neighbourhood ops are seamless at tile edges. */
export function stackApron(doc: RasterDocument, scale = 1): number {
  let apron = 0;
  const styleApron = (st?: LayerStyles) => {
    if (!st || st.enabled === false) return 0; let a = 0;
    for (const s of [st.dropShadow, st.innerShadow]) if (s?.enabled) a = Math.max(a, (s.distance + s.size * 1.5) * scale);
    if (st.outerGlow?.enabled) a = Math.max(a, st.outerGlow.size * 1.5 * scale);
    if (st.stroke?.enabled) a = Math.max(a, st.stroke.size * scale);
    return Math.ceil(a) + 2;
  };
  const visit = (layers: RasterLayer[]) => {
    for (const l of layers) {
      if (!l.visible) continue;
      let a = 0;
      if (l.kind === 'pixel') for (const f of l.smartFilters || []) if (f.enabled) a += filterApron(f.filter, scale);
      if (l.kind === 'pixel' || l.kind === 'fill') a += styleApron(l.styles);
      if (l.mask?.feather) a += Math.ceil(l.mask.feather * 1.5 * scale);
      if (l.vectorMask?.feather) a += Math.ceil(l.vectorMask.feather * 1.5 * scale);
      apron = Math.max(apron, a);
      if (l.kind === 'group') visit(l.children);
    }
  };
  visit(doc.layers);
  return Math.min(256, apron);
}

const assetKey = (a: { assetId?: string; src?: string }) => a.assetId || a.src || '';

/** Coverage for procedural masks evaluated on the CPU at view resolution. */
function gradientMaskCoverage(m: Extract<LayerMask, { kind: 'gradient' }>, doc: RasterDocument, view: CompositeView, layerBox: Rect): Float32Array {
  const cov = new Float32Array(view.width * view.height);
  // CSS linear-gradient(angle): 0deg = bottom→top, 90deg = left→right, over the layer box.
  const r = m.angle * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r);
  const half = (Math.abs(layerBox.width * dx) + Math.abs(layerBox.height * dy)) / 2;
  const cx = layerBox.x + layerBox.width / 2, cy = layerBox.y + layerBox.height / 2;
  const b = m.blackPoint, w = Math.max(b + 1e-4, m.whitePoint), mid = Math.min(w, Math.max(b, m.midpoint));
  for (let j = 0; j < view.height; j++) for (let i = 0; i < view.width; i++) {
    const X = view.x + (i + 0.5) / view.scale, Y = view.y + (j + 0.5) / view.scale;
    const t = ((X - cx) * dx + (Y - cy) * dy) / (2 * half || 1) + 0.5;
    const v = t <= b ? 0 : t >= w ? 1 : t < mid ? 0.5 * (t - b) / Math.max(1e-6, mid - b) : 0.5 + 0.5 * (t - mid) / Math.max(1e-6, w - mid);
    cov[j * view.width + i] = v;
  }
  void doc; return cov;
}

export interface CompositeOptions { /** Skip layers by id (used by "sample current layer" tools). */ skip?: Set<string>; /** Render only these root-level ids. */ only?: Set<string> }

/** Render `doc` through `backend` into a surface for `view`. Caller releases the result. */
export function compositeDocument<S>(doc: RasterDocument, backend: Backend<S>, view: CompositeView, opts: CompositeOptions = {}): S {
  backend.begin(view, doc);
  const out = backend.alloc();
  if (doc.background) {
    const lin = doc.blendSpace === 'linear';
    const c = doc.background.map(v => { const s = v / 255; return lin ? (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)) : s; });
    backend.clear(out, [c[0], c[1], c[2], 1]);
  } else backend.clear(out);
  const layers = opts.only ? doc.layers.filter(l => opts.only!.has(l.id)) : doc.layers;
  renderStack(layers, out, backend, doc, view, opts);
  return out;
}

function layerBoxOf(l: RasterLayer, doc: RasterDocument): Rect {
  if (l.kind === 'pixel' && l.width && l.height) {
    const m = l.transform; const xs = [0, l.width].flatMap(x => [0, l.height].map(y => m[0] * x + m[2] * y + m[4])), ys = [0, l.width].flatMap(x => [0, l.height].map(y => m[1] * x + m[3] * y + m[5]));
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: 0, y: 0, width: doc.width, height: doc.height };
}

/** Build the combined mask surface for a layer, or null when unmasked. */
function buildMask<S>(l: RasterLayer, b: Backend<S>, doc: RasterDocument, view: CompositeView): S | null {
  const parts: S[] = [];
  const m = l.mask;
  if (m && m.enabled) {
    const s = b.alloc();
    if (m.kind === 'bitmap') {
      const base: Affine = m.linked && l.kind === 'pixel' ? affineMul(l.transform, affineTranslate(m.bounds.x, m.bounds.y)) : affineTranslate(m.bounds.x, m.bounds.y);
      const ok = b.drawBitmap(s, m.assetId, base, 'mask', m.defaultColor / 255);
      if (!ok) b.clear(s, [1, 1, 1, 1]);
    } else b.uploadCoverage(s, gradientMaskCoverage(m, doc, view, layerBoxOf(l, doc)));
    if (m.feather && m.feather > 0) { const t = b.alloc(); b.filter(t, s, { type: 'gaussianBlur', radius: m.feather / 2 }); b.release(s); parts.push(t); } else parts.push(s);
    if (m.invert || (m.density ?? 1) < 1) { const one = b.alloc(); b.clear(one, [1, 1, 1, 1]); b.multiply(one, parts[parts.length - 1], m.density ?? 1, !!m.invert); b.release(parts.pop()!); parts.push(one); }
  }
  const vm = l.vectorMask;
  if (vm && vm.enabled && vm.subpaths.length) {
    const s = b.alloc();
    b.uploadCoverage(s, vectorMaskCoverage(vm, l, view));
    let v = s;
    if (vm.feather && vm.feather > 0) { const t = b.alloc(); b.filter(t, s, { type: 'gaussianBlur', radius: vm.feather / 2 }); b.release(s); v = t; }
    if (vm.invert || (vm.density ?? 1) < 1) { const one = b.alloc(); b.clear(one, [1, 1, 1, 1]); b.multiply(one, v, vm.density ?? 1, !!vm.invert); b.release(v); v = one; }
    parts.push(v);
  }
  if (!parts.length) return null;
  const first = parts[0];
  for (let i = 1; i < parts.length; i++) { b.multiply(first, parts[i], 1, false); b.release(parts[i]); }
  return first;
}
function vectorMaskCoverage(vm: VectorMask, l: RasterLayer, view: CompositeView): Float32Array {
  const m: Affine = vm.linked && l.kind === 'pixel' ? l.transform : [1, 0, 0, 1, 0, 0];
  // doc → output pixels
  const toOut: Affine = affineMul([view.scale, 0, 0, view.scale, -view.x * view.scale, -view.y * view.scale], m);
  return rasterizeSubpaths(vm.subpaths, view.width, view.height, toOut);
}

function renderStack<S>(layers: RasterLayer[], dst: S, b: Backend<S>, doc: RasterDocument, view: CompositeView, opts: CompositeOptions): void {
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.clipped) continue; // handled with its base
    // gather clipped layers above
    const clipped: RasterLayer[] = [];
    for (let j = i + 1; j < layers.length && layers[j].clipped; j++) clipped.push(layers[j]);
    if (!l.visible || opts.skip?.has(l.id)) continue;
    if (clipped.some(c => c.visible && !opts.skip?.has(c.id)) && l.kind !== 'adjustment') { renderClippingGroup(l, clipped, dst, b, doc, view, opts); continue; }
    renderLayer(l, dst, b, doc, view, opts);
  }
}

function renderLayer<S>(l: RasterLayer, dst: S, b: Backend<S>, doc: RasterDocument, view: CompositeView, opts: CompositeOptions): void {
  if (l.kind === 'adjustment') {
    const mask = buildMask(l, b, doc, view);
    if (l.blend === 'normal') b.adjust(dst, l.adjustment, l.opacity, mask);
    else { const t = b.alloc(); b.copy(t, dst); b.adjust(t, l.adjustment, 1, null); b.composite(dst, t, l.blend, l.opacity, mask, 'keep'); b.release(t); }
    if (mask) b.release(mask);
    return;
  }
  if (l.kind === 'group' && l.blend === 'pass-through') {
    const mask = buildMask(l, b, doc, view);
    if (l.opacity >= 1 && !mask) { renderStack(l.children, dst, b, doc, view, opts); return; }
    const t = b.alloc(); b.copy(t, dst); renderStack(l.children, t, b, doc, view, opts);
    b.lerp(dst, t, l.opacity, mask); b.release(t); if (mask) b.release(mask);
    return;
  }
  const content = renderContent(l, b, doc, view, opts);
  if (!content) return;
  compositeContent(l, content, dst, b, view);
  b.release(content);
}

/** Masked content of a pixel / fill / isolated group layer, or null when nothing to draw. */
function renderContent<S>(l: RasterLayer, b: Backend<S>, doc: RasterDocument, view: CompositeView, opts: CompositeOptions): S | null {
  let s = b.alloc(); b.clear(s);
  if (l.kind === 'pixel') {
    if (!b.drawBitmap(s, assetKey(l.asset), l.transform, 'rgba')) { b.release(s); return null; }
    for (const sf of l.smartFilters || []) {
      if (!sf.enabled) continue;
      const t = b.alloc(); b.filter(t, s, sf.filter);
      if (sf.blend && sf.blend !== 'normal') { b.composite(s, t, sf.blend, sf.opacity ?? 1, null, 'keep'); b.release(t); }
      else if ((sf.opacity ?? 1) < 1) { b.lerp(s, t, sf.opacity ?? 1, null); b.release(t); }
      else { b.release(s); s = t; }
    }
  } else if (l.kind === 'fill') b.fill(s, l.fill);
  else if (l.kind === 'group') renderStack(l.children, s, b, doc, view, opts);
  else { b.release(s); return null; }
  const mask = buildMask(l, b, doc, view);
  if (mask) { b.multiply(s, mask, 1, false); b.release(mask); }
  return s;
}

/** Composite masked content (+ styles) onto dst with the layer's blend/opacity/fill. */
function compositeContent<S>(l: RasterLayer, content: S, dst: S, b: Backend<S>, view: CompositeView): void {
  const blend = (l.blend === 'pass-through' ? 'normal' : l.blend) as BlendMode;
  const fillOp = l.fillOpacity ?? 1;
  const st = (l.kind === 'pixel' || l.kind === 'fill') ? l.styles : undefined;
  const hasStyles = !!st && st.enabled !== false && !!(st.dropShadow?.enabled || st.innerShadow?.enabled || st.outerGlow?.enabled || st.stroke?.enabled || st.colorOverlay?.enabled);
  if (!hasStyles) { b.composite(dst, content, blend, l.opacity * fillOp, null, 'over'); return; }
  const s = view.scale;
  const t = b.alloc(); b.copy(t, dst);
  const ds = st!.dropShadow, og = st!.outerGlow, is = st!.innerShadow, co = st!.colorOverlay, sk = st!.stroke;
  if (ds?.enabled) {
    const sh = b.alloc(); b.tint(sh, content, ds.color, false);
    if (ds.spread > 0) b.alphaGain(sh, 1 / Math.max(0.01, 1 - ds.spread / 100));
    const bl = b.alloc(); b.filter(bl, sh, { type: 'gaussianBlur', radius: ds.size / 2 });
    const a = ds.angle * Math.PI / 180; b.translate(sh, bl, -Math.cos(a) * ds.distance * s, Math.sin(a) * ds.distance * s);
    b.multiply(sh, content, 1, true); // knockout: shadow hidden under the layer's own pixels
    b.composite(t, sh, ds.blend, ds.opacity, null, 'over'); b.release(sh); b.release(bl);
  }
  if (og?.enabled) {
    const g = b.alloc(); b.tint(g, content, og.color, false);
    if (og.spread > 0) b.alphaGain(g, 1 / Math.max(0.01, 1 - og.spread / 100));
    const bl = b.alloc(); b.filter(bl, g, { type: 'gaussianBlur', radius: og.size / 2 }); b.multiply(bl, content, 1, true);
    b.composite(t, bl, og.blend, og.opacity, null, 'over'); b.release(g); b.release(bl);
  }
  b.composite(t, content, blend, fillOp, null, 'over');
  if (is?.enabled) {
    const sh = b.alloc(); b.tint(sh, content, is.color, true);
    if (is.spread > 0) b.alphaGain(sh, 1 / Math.max(0.01, 1 - is.spread / 100));
    const bl = b.alloc(); b.filter(bl, sh, { type: 'gaussianBlur', radius: is.size / 2 });
    const a = is.angle * Math.PI / 180; b.translate(sh, bl, -Math.cos(a) * is.distance * s, Math.sin(a) * is.distance * s);
    b.multiply(sh, content, 1, false);
    b.composite(t, sh, is.blend, is.opacity, null, 'over'); b.release(sh); b.release(bl);
  }
  if (co?.enabled) { const o = b.alloc(); b.tint(o, content, co.color, false); b.composite(t, o, co.blend, co.opacity, null, 'over'); b.release(o); }
  if (sk?.enabled) { const o = b.alloc(); b.stroke(o, content, sk.size * s, sk.position, sk.color); b.composite(t, o, sk.blend, sk.opacity, null, 'over'); b.release(o); }
  // Layer blend for styled layers: Photoshop blends each effect with its own mode; the
  // layer opacity then fades the whole stack of effects + content.
  b.lerp(dst, t, l.opacity, null); b.release(t);
}

function renderClippingGroup<S>(base: RasterLayer, clipped: RasterLayer[], dst: S, b: Backend<S>, doc: RasterDocument, view: CompositeView, opts: CompositeOptions): void {
  const content = base.kind === 'group' && base.blend === 'pass-through' ? renderContent({ ...base, blend: 'normal' }, b, doc, view, opts) : renderContent(base, b, doc, view, opts);
  if (!content) return;
  // base content was rendered with fill opacity applied inside the isolated buffer
  const fillOp = base.fillOpacity ?? 1;
  if (fillOp < 1) { const t = b.alloc(); b.clear(t); b.composite(t, content, 'normal', fillOp, null, 'over'); b.copy(content, t); b.release(t); }
  for (const c of clipped) {
    if (!c.visible || opts.skip?.has(c.id)) continue;
    if (c.kind === 'adjustment') {
      const mask = buildMask(c, b, doc, view);
      if (c.blend === 'normal') b.adjust(content, c.adjustment, c.opacity, mask);
      else { const t = b.alloc(); b.copy(t, content); b.adjust(t, c.adjustment, 1, null); b.composite(content, t, c.blend, c.opacity, mask, 'keep'); b.release(t); }
      if (mask) b.release(mask); continue;
    }
    const cc = renderContent(c.kind === 'group' && c.blend === 'pass-through' ? { ...c, blend: 'normal' } : c, b, doc, view, opts);
    if (!cc) continue;
    b.composite(content, cc, (c.blend === 'pass-through' ? 'normal' : c.blend) as BlendMode, c.opacity * (c.fillOpacity ?? 1), null, 'atop');
    b.release(cc);
  }
  compositeContent({ ...base, fillOpacity: 1 } as RasterLayer, content, dst, b, view);
  b.release(content);
}
