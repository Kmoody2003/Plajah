// raster/engine — RasterSession: the one object the Image-device UI talks to.
//
// Owns the document (immutable updates), decoded assets, the GPU compositor (CPU fallback
// when WebGL2 is missing), selection, paint/undo history and the worker. The UI keeps
// React state = session.doc and calls these methods; nothing here touches React or
// TelaView. Persist with session.save() → JSON for TelaImageDevice.raster.
//
//   const s = await RasterSession.open(device);            // migrates legacy layers
//   s.attachCanvas(canvasEl);  s.renderView({ x, y, scale, width, height });
//   const stroke = s.beginStroke(layerId, { tool: 'brush', brush, color });
//   stroke.add({ x, y, pressure }) …  stroke.end();         // undoable, GPU tiles refreshed
//   s.select(rectSelection(...), 'add');  await s.contentAwareFill();
//   const blob = await s.exportFlattened({ format: 'jpeg', quality: 0.9 });

import type { TelaImageDevice } from '../../../types';
import {
  type RasterDocument, type RasterLayer, type PixelLayer, type Adjustment, type Filter, type Affine, type BlendMode, type FillContent,
  migrateLegacyImageDevice, findLayer, updateLayer, insertLayer, removeLayer, pixelLayer, adjustmentLayer, fillLayer, affineInvert, affineApply, affineMul, affineTranslate, IDENTITY,
} from './model';
import { RasterAssetCache, remapAssets, maskToBitmap } from './assets';
import { GlCompositor } from './gl/glBackend';
import { renderDocumentCpu, flattenCpu } from './cpuBackend';
import type { CompositeView } from './compositeCore';
import { stackApron } from './compositeCore';
import { rasterToBitmap, createBitmap, createMask, cloneBitmap, bitmapToRaster, type Bitmap8, type Mask8 } from './buffer';
import { BrushStroke, PaintHistory, bucketFill, applyGradientTool, snapshotRect, sealPatch, type BrushSettings, type StrokePoint, type UndoPatch, type BucketOptions, type GradientToolOptions } from './painting';
import { createCloneStroke, createHealingStroke, createToneStroke, createSpongeStroke, createFocusStroke, createSmudgeStroke, CloneSession, type ToneRange } from './retouch';
import { combine, invertSelection, selectionToMask, marchingAnts, selectAll, type Selection, type SelectionOp } from './selection';
import { encodeBitmap, encodePng, type ExportOptions } from './codecs';
import { exportPsd, importPsd } from './psd';
import { rasterWorker } from './workerClient';
import { eyedropper, histogram, cmykProofLut, type SampleSize } from './color';
import type { GradientSpec } from './model';

export type PaintTool =
  | { tool: 'brush' | 'pencil'; brush: BrushSettings; color: [number, number, number, number]; blend?: BlendMode }
  | { tool: 'eraser'; brush: BrushSettings }
  | { tool: 'clone'; brush: BrushSettings; clone: CloneSession; sampleAll?: boolean }
  | { tool: 'heal'; brush: BrushSettings; clone: CloneSession; sampleAll?: boolean }
  | { tool: 'dodge' | 'burn'; brush: BrushSettings; range: ToneRange; exposure: number }
  | { tool: 'sponge'; brush: BrushSettings; mode: 'saturate' | 'desaturate'; flow: number }
  | { tool: 'blur' | 'sharpen'; brush: BrushSettings; strength: number }
  | { tool: 'smudge'; brush: BrushSettings; strength: number };

export interface StrokeHandle { add(p: StrokePoint): void; end(): void; cancel(): void }
export type SessionListener = (doc: RasterDocument, reason: string) => void;

export class RasterSession {
  doc: RasterDocument; readonly assets = new RasterAssetCache(); readonly history = new PaintHistory();
  /** Structural undo (layer ops) — snapshots of the immutable doc. */
  private docUndo: RasterDocument[] = []; private docRedo: RasterDocument[] = [];
  gpu: GlCompositor | null = null; selection: Selection | null = null;
  private listeners = new Set<SessionListener>();
  private constructor(doc: RasterDocument) { this.doc = doc; }

  static async open(device: TelaImageDevice & { raster?: RasterDocument }): Promise<RasterSession> {
    const s = new RasterSession(device.raster ? structuredClone(device.raster) : migrateLegacyImageDevice(device));
    await s.assets.load(s.doc); return s;
  }
  static fromDocument(doc: RasterDocument) { return new RasterSession(doc); }
  on(fn: SessionListener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(reason: string) { for (const f of this.listeners) f(this.doc, reason); }
  /** Apply a structural change (undoable). */
  commit(next: RasterDocument, reason = 'edit') { this.docUndo.push(this.doc); if (this.docUndo.length > 200) this.docUndo.shift(); this.docRedo = []; this.doc = next; this.emit(reason); }

  // ── Display ────────────────────────────────────────────────────────────────
  attachCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    try { this.gpu = new GlCompositor(canvas, this.assets); return true; } catch { this.gpu = null; return false; }
  }
  /** Render the viewport (x, y = doc coords of the top-left, scale = zoom) to the attached canvas. */
  renderView(view: CompositeView, opts: { checker?: boolean } = {}): number {
    if (this.gpu) { this.gpu.renderView(this.doc, view, opts); return this.gpu.stats.lastRenderMs; }
    return -1;
  }
  setSoftProof(on: boolean) { this.gpu?.setProofLut(on ? cmykProofLut(33, { inkLimit: (this.doc.proof?.inkLimit ?? 300) / 100 }) : null); this.doc = { ...this.doc, proof: { cmyk: on, inkLimit: this.doc.proof?.inkLimit } }; }
  /** Composite as a bitmap (thumbnails, eyedropper "sample all", export). */
  flatten(opts: { scale?: number; dither?: boolean } = {}): Bitmap8 { return this.gpu ? this.gpu.flatten(this.doc, opts) : flattenCpu(this.doc, this.assets, opts); }
  sampleColor(x: number, y: number, size: SampleSize = 'point', merged = true, layerId?: string): [number, number, number, number] {
    if (!merged && layerId) { const l = findLayer(this.doc, layerId)?.layer; if (l?.kind === 'pixel') { const bm = this.layerBitmap(l); const [lx, ly] = affineApply(affineInvert(l.transform), x, y); return bm ? eyedropper(bm, lx, ly, size) : [0, 0, 0, 0]; } }
    const r = size === 'point' ? 0 : (parseInt(size, 10) - 1) / 2, w = 2 * r + 1;
    const v: CompositeView = { x: Math.floor(x) - r, y: Math.floor(y) - r, scale: 1, width: w, height: w };
    const bm = this.gpu ? this.gpu.renderToBitmap(this.doc, v) : rasterToBitmap(renderDocumentCpu(this.doc, this.assets, { view: v }), this.doc.blendSpace === 'linear');
    return eyedropper(bm, r, r, size);
  }
  histogram(layerId?: string) { const l = layerId ? findLayer(this.doc, layerId)?.layer : null; const bm = l?.kind === 'pixel' ? this.layerBitmap(l) : this.flatten({ scale: Math.min(1, 1024 / Math.max(this.doc.width, this.doc.height)) }); return histogram(bm || createBitmap(1, 1)); }

  // ── Layers ─────────────────────────────────────────────────────────────────
  layerBitmap(l: PixelLayer): Bitmap8 | null { return this.assets.bitmap(l.asset.assetId || l.asset.src || ''); }
  addPixelLayer(bm: Bitmap8, patch: Partial<PixelLayer> = {}, where?: { aboveId?: string; parentId?: string }): PixelLayer {
    const key = this.assets.putBitmap(bm), l = pixelLayer({ assetId: key }, bm.width, bm.height, { name: 'Layer', ...patch });
    this.commit(insertLayer(this.doc, l, where), 'add-layer'); return l;
  }
  addAdjustment(a: Adjustment, where?: { aboveId?: string; parentId?: string }) { const l = adjustmentLayer(a); this.commit(insertLayer(this.doc, l, where), 'add-adjustment'); return l; }
  addFill(f: FillContent, where?: { aboveId?: string; parentId?: string }) { const l = fillLayer(f); this.commit(insertLayer(this.doc, l, where), 'add-fill'); return l; }
  update(id: string, patch: Partial<RasterLayer> | ((l: RasterLayer) => RasterLayer), reason = 'update') { this.commit(updateLayer(this.doc, id, patch), reason); }
  remove(id: string) { this.commit(removeLayer(this.doc, id), 'remove-layer'); }
  /** Ensure a pixel layer owns an editable runtime bitmap (legacy URL layers get copied once). */
  private editableBitmap(l: PixelLayer): Bitmap8 {
    const key = l.asset.assetId || l.asset.src || ''; let bm = this.assets.bitmap(key);
    if (!bm) { bm = createBitmap(Math.max(1, l.width || this.doc.width), Math.max(1, l.height || this.doc.height)); }
    if (!l.asset.assetId || !key.startsWith('mem:')) {
      const k = this.assets.putBitmap(bm === this.assets.bitmap(key) ? cloneBitmap(bm) : bm);
      this.doc = updateLayer(this.doc, l.id, { asset: { assetId: k } } as Partial<PixelLayer>);
      return this.assets.bitmap(k)!;
    }
    return bm;
  }

  // ── Painting ───────────────────────────────────────────────────────────────
  /**
   * Begin a stroke on a pixel layer (or its mask with target 'mask'). Points are DOCUMENT
   * coordinates; they're mapped into layer-bitmap space here. GPU tiles refresh per add().
   */
  beginStroke(layerId: string, t: PaintTool, opts: { target?: 'pixels' | 'mask'; lockTransparency?: boolean } = {}): StrokeHandle {
    const hit = findLayer(this.doc, layerId); if (!hit || hit.layer.kind !== 'pixel') throw new Error('Paint target must be a pixel layer');
    const layer = hit.layer, toMask = opts.target === 'mask';
    const bm = toMask ? null : this.editableBitmap(layer);
    const cur = findLayer(this.doc, layerId)!.layer as PixelLayer;
    let maskKey = '';
    if (toMask) { if (cur.mask?.kind !== 'bitmap') throw new Error('Layer has no bitmap mask'); maskKey = cur.mask.assetId; }
    const mask = toMask ? this.assets.mask(maskKey) : null; if (toMask && !mask) throw new Error('mask pixels not loaded');
    const target = toMask ? { kind: 'mask' as const, mask: mask! } : { kind: 'rgba' as const, bitmap: bm! };
    const inv = toMask && cur.mask?.kind === 'bitmap' ? affineInvert(cur.mask.linked ? affineMul(cur.transform, affineTranslate(cur.mask.bounds.x, cur.mask.bounds.y)) : affineTranslate(cur.mask.bounds.x, cur.mask.bounds.y)) : affineInvert(cur.transform);
    const key = toMask ? maskKey : (findLayer(this.doc, layerId)!.layer as PixelLayer).asset.assetId!;
    let stroke: BrushStroke, finish: (() => UndoPatch) | null = null;
    const snapshotSource = (all?: boolean) => all ? this.flattenInLayerSpace(cur) : cloneBitmap(bm!);
    switch (t.tool) {
      case 'brush': case 'pencil': stroke = new BrushStroke(target, t.tool === 'pencil' ? { ...t.brush, hardness: 1 } : t.brush, 'paint', toMask ? [t.color[0], t.color[0], t.color[0], 255] : t.color); if (t.blend) stroke.blend = t.blend; break;
      case 'eraser': stroke = new BrushStroke(target, t.brush, 'erase'); break;
      case 'clone': case 'heal': {
        if (toMask) throw new Error('clone/heal paint pixels only');
        const src = snapshotSource(t.sampleAll); let offset: { dx: number; dy: number } | null = null;
        // the source offset is fixed by the first point of the stroke (aligned / non-aligned)
        const make = (p: StrokePoint) => { const o = t.clone.begin(p.x, p.y); offset = { dx: o.dx, dy: o.dy }; };
        const proxy: StrokeHandle = {
          add: p => {
            const lp = this.mapPoint(inv, p);
            if (!offset) { make(p); const o = offset!; if (t.tool === 'clone') { stroke = createCloneStroke(target, src, o, t.brush); } else { const h = createHealingStroke(target as any, src, o, t.brush); stroke = h.stroke; finish = h.finish; } }
            stroke.addPoint(lp); this.flushDirty(key, stroke, toMask);
          },
          end: () => { if (!offset) return; const patch = finish ? finish() : stroke.end(t.tool === 'clone' ? 'Clone Stamp' : 'Healing Brush'); this.history.push(patch); this.flushDirty(key, stroke, toMask, true); this.assets.markDirty(key); this.emit('paint'); },
          cancel: () => { if (offset) { const p = stroke.end(); import('./painting').then(m => m.undoPatch(p)); this.gpu?.invalidate(key, undefined, toMask); } },
        };
        return proxy;
      }
      case 'dodge': case 'burn': stroke = createToneStroke(target as any, t.brush, t.tool, t.range, t.exposure); break;
      case 'sponge': stroke = createSpongeStroke(target as any, t.brush, t.mode, t.flow); break;
      case 'blur': case 'sharpen': stroke = createFocusStroke(target as any, t.brush, t.tool, t.strength); break;
      case 'smudge': stroke = createSmudgeStroke(target as any, t.brush, t.strength); break;
    }
    stroke!.lockTransparency = !!opts.lockTransparency;
    if (this.selection) stroke!.selection = this.selectionInLayerSpace(cur, target.kind === 'mask' ? target.mask.width : bm!.width, target.kind === 'mask' ? target.mask.height : bm!.height, inv);
    return {
      add: p => { stroke.addPoint(this.mapPoint(inv, p)); this.flushDirty(key, stroke, toMask); },
      end: () => { const patch = stroke.end(); this.history.push(patch); this.flushDirty(key, stroke, toMask, true); this.assets.markDirty(key); this.emit('paint'); },
      cancel: () => { const p = stroke.end(); import('./painting').then(m => { m.undoPatch(p); this.gpu?.invalidate(key, undefined, toMask); }); },
    };
  }
  private mapPoint(inv: Affine, p: StrokePoint): StrokePoint { const [x, y] = affineApply(inv, p.x, p.y); return { ...p, x, y }; }
  private flushDirty(key: string, s: BrushStroke, mask: boolean, all = false) { const d = s.takeDirty(); if (this.gpu && (d || all)) this.gpu.invalidate(key, d || undefined, mask); }
  private flattenInLayerSpace(l: PixelLayer): Bitmap8 {
    const bm = this.layerBitmap(l)!; const doc: RasterDocument = { ...this.doc, layers: this.doc.layers };
    const inv = l.transform; // layer px → doc
    const out = createBitmap(bm.width, bm.height); const r = renderDocumentCpu(doc, this.assets, { view: { x: inv[4], y: inv[5], scale: Math.hypot(inv[0], inv[1]) || 1, width: bm.width, height: bm.height } });
    out.data.set(rasterToBitmap(r, doc.blendSpace === 'linear').data); return out;
  }
  private selectionInLayerSpace(l: PixelLayer, w: number, h: number, inv: Affine): Mask8 {
    const sel = this.selection!, m = createMask(w, h), fwd = affineInvert(inv);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [X, Y] = affineApply(fwd, x + 0.5, y + 0.5); const xi = Math.floor(X), yi = Math.floor(Y); if (xi >= 0 && yi >= 0 && xi < sel.width && yi < sel.height) m.data[y * w + x] = sel.data[yi * sel.width + xi]; }
    void l; return m;
  }
  bucketFill(layerId: string, x: number, y: number, color: [number, number, number, number], o: Omit<BucketOptions, 'sample'> & { sampleMerged?: boolean }) {
    const l = findLayer(this.doc, layerId)?.layer as PixelLayer; const bm = this.editableBitmap(l); const [lx, ly] = affineApply(affineInvert(l.transform), x, y);
    const patch = bucketFill(bm, lx, ly, color, { ...o, sample: o.sampleMerged ? this.flattenInLayerSpace(l) : undefined });
    this.history.push(patch); this.afterPixels(l.id);
  }
  gradient(layerId: string, spec: GradientSpec, o: GradientToolOptions) {
    const l = findLayer(this.doc, layerId)?.layer as PixelLayer; const bm = this.editableBitmap(l), inv = affineInvert(l.transform);
    const [x0, y0] = affineApply(inv, o.x0, o.y0), [x1, y1] = affineApply(inv, o.x1, o.y1);
    this.history.push(applyGradientTool(bm, spec, { ...o, x0, y0, x1, y1 })); this.afterPixels(l.id);
  }
  private afterPixels(layerId: string) { const l = findLayer(this.doc, layerId)?.layer as PixelLayer; const key = l.asset.assetId!; this.assets.markDirty(key); this.gpu?.invalidate(key); this.emit('paint'); }
  undo() { const p = this.history.undo(); if (p) { this.gpu?.assets.clear(); this.emit('undo'); return true; } const d = this.docUndo.pop(); if (!d) return false; this.docRedo.push(this.doc); this.doc = d; this.emit('undo'); return true; }
  redo() { const p = this.history.redo(); if (p) { this.gpu?.assets.clear(); this.emit('redo'); return true; } const d = this.docRedo.pop(); if (!d) return false; this.docUndo.push(this.doc); this.doc = d; this.emit('redo'); return true; }

  // ── Selection ──────────────────────────────────────────────────────────────
  select(sel: Selection | null, op: SelectionOp = 'replace') { this.selection = sel ? combine(this.selection, sel, op) : null; this.emit('selection'); }
  selectAll() { this.select(selectAll(this.doc.width, this.doc.height)); }
  invertSelection() { if (this.selection) this.select(invertSelection(this.selection)); }
  marchingAnts() { return this.selection ? marchingAnts(this.selection) : []; }
  /** Selection → layer mask on `layerId` (Photoshop "Add layer mask: reveal selection"). */
  selectionToLayerMask(layerId: string) {
    const r = this.selection && selectionToMask(this.selection); if (!r) return;
    const key = this.assets.putMask(r.mask);
    this.update(layerId, { mask: { kind: 'bitmap', enabled: true, assetId: key, bounds: r.bounds, defaultColor: 0 } } as Partial<RasterLayer>, 'add-mask');
  }

  // ── Retouch / filters (destructive ops on a layer, undoable, run in the worker) ──
  /** Content-Aware Fill of the selection into a NEW layer (non-destructive, Photoshop's "output to new layer"). */
  async contentAwareFill(opts: { sampleAll?: boolean; sourceMask?: Mask8; seed?: number } = {}): Promise<PixelLayer | null> {
    if (!this.selection?.bounds) return null;
    const image = this.flatten(), hole: Mask8 = { width: this.selection.width, height: this.selection.height, data: this.selection.data.map(v => (v > 8 ? 255 : 0)) };
    const filled = await rasterWorker().run('contentAwareFill', { image, hole, opts: { seed: opts.seed, sourceMask: opts.sourceMask } }, { transfer: true });
    // keep only the selected area in the new layer
    const b = this.selection.bounds, out = createBitmap(b.width, b.height);
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) { const s = ((y + b.y) * filled.width + x + b.x) * 4, d = (y * b.width + x) * 4; out.data.set(filled.data.subarray(s, s + 4), d); out.data[d + 3] = Math.round(filled.data[s + 3] * this.selection.data[(y + b.y) * filled.width + x + b.x] / 255); }
    return this.addPixelLayer(out, { name: 'Content-Aware Fill', transform: affineTranslate(b.x, b.y) });
  }
  async applyFilter(layerId: string, f: Filter) {
    const l = findLayer(this.doc, layerId)?.layer as PixelLayer; const bm = this.editableBitmap(l);
    const t = { kind: 'rgba' as const, bitmap: bm }, patch = snapshotRect(t, { x: 0, y: 0, width: bm.width, height: bm.height }, f.type);
    const r = await rasterWorker().run('filter', { raster: bitmapToRaster(bm), filter: f }, { transfer: true });
    const res = rasterToBitmap(r); if (this.selection) { const m = this.selectionInLayerSpace(l, bm.width, bm.height, affineInvert(l.transform)); for (let i = 0; i < m.data.length; i++) { const k = m.data[i] / 255; for (let c = 0; c < 4; c++) bm.data[i * 4 + c] = Math.round(bm.data[i * 4 + c] + (res.data[i * 4 + c] - bm.data[i * 4 + c]) * k); } } else bm.data.set(res.data);
    this.history.push(sealPatch(patch)); this.afterPixels(layerId);
  }
  /** Image › Image Size (all pixel layers + masks resampled). */
  async resizeImage(w: number, h: number, filter: 'bicubic' | 'lanczos3' | 'bilinear' | 'nearest' = 'lanczos3') {
    const sx = w / this.doc.width, sy = h / this.doc.height; let doc = { ...this.doc, width: w, height: h };
    const jobs: Promise<void>[] = [];
    const walk = (ls: RasterLayer[]): RasterLayer[] => ls.map(l => {
      if (l.kind === 'group') return { ...l, children: walk(l.children) };
      if (l.kind !== 'pixel') return l;
      const bm = this.layerBitmap(l); if (!bm) return l;
      const nw = Math.max(1, Math.round(bm.width * sx)), nh = Math.max(1, Math.round(bm.height * sy)), key = this.assets.putBitmap(createBitmap(1, 1));
      jobs.push(rasterWorker().run('resize', { image: bm, width: nw, height: nh, filter }).then(r => { this.assets.bitmaps.set(key, r); }));
      const t = l.transform; return { ...l, asset: { assetId: key }, width: nw, height: nh, transform: [t[0] * bm.width / nw * sx, t[1] * bm.width / nw * sy, t[2] * bm.height / nh * sx, t[3] * bm.height / nh * sy, t[4] * sx, t[5] * sy] as Affine };
    });
    doc = { ...doc, layers: walk(doc.layers) }; await Promise.all(jobs); this.gpu?.assets.clear(); this.commit(doc, 'image-size');
  }

  // ── Import / export ────────────────────────────────────────────────────────
  async exportFlattened(o: ExportOptions & { scale?: number }): Promise<Blob> { return encodeBitmap(this.flatten({ scale: o.scale, dither: true }), { ...o, colorSpace: o.colorSpace ?? this.doc.colorSpace }); }
  async exportLayerPng(layerId: string): Promise<Blob> {
    const l = findLayer(this.doc, layerId)?.layer; if (!l) throw new Error('no layer');
    const mini: RasterDocument = { ...this.doc, background: null, layers: [{ ...l, visible: true, clipped: false } as RasterLayer] };
    const bm = this.gpu ? this.gpu.flatten(mini) : flattenCpu(mini, this.assets);
    return new Blob([await encodePng(bm, { colorSpace: this.doc.colorSpace }) as BlobPart], { type: 'image/png' });
  }
  exportPsd(): { blob: Blob; warnings: string[] } { const r = exportPsd(this.doc, this.assets); return { blob: new Blob([r.bytes as BlobPart], { type: 'image/vnd.adobe.photoshop' }), warnings: r.warnings }; }
  static async openPsd(bytes: ArrayBuffer): Promise<{ session: RasterSession; warnings: string[] }> {
    const s = new RasterSession({ version: 1, width: 1, height: 1, colorSpace: 'srgb', blendSpace: 'srgb', bitDepth: 16, background: null, layers: [] });
    const r = importPsd(bytes, { putBitmap: bm => s.assets.putBitmap(bm), putMask: m => s.assets.putMask(m) });
    s.doc = r.doc; return { session: s, warnings: r.warnings };
  }
  /** Persist dirty pixels to the asset store and return the JSON for TelaImageDevice.raster. */
  async save(): Promise<RasterDocument> { const map = await this.assets.persist(); this.doc = remapAssets(this.doc, map); this.gpu?.assets.clear(); return this.doc; }
  dispose() { this.gpu?.dispose(); this.gpu = null; this.listeners.clear(); }
  /** Apron the UI should add when it renders tiles itself. */
  get apron() { return stackApron(this.doc, 1); }
}
export { IDENTITY, maskToBitmap };
