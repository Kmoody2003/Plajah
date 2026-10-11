// controller — ImageStudioController: the Image Studio's single owner of a RasterSession.
//
// Why a controller outside React: the session (decoded layer bitmaps, GPU textures, pixel
// journal) must outlive component remounts — Tela's document history keeps snapshots that
// reference this session's runtime bitmaps, so Ctrl+Z after leaving and re-entering the
// Studio must still find them. Controllers live in a per-device registry for the life of
// the tab; the React shell (TelaImageStudio) subscribes and renders.
//
// Every edit ends in commit(): the raster JSON (stored asset ids where clean) + the pixel
// journal rev go to the Tela doc as SET_IMAGE_RASTER, so Tela's undo/redo, autosave, Board,
// embeds and Fabula all see one source of truth. See historyBridge.ts for the undo design.

import type { TelaImageDevice } from '../../../types';
import type { TelaOp } from '../telaOps';
import {
  RasterSession, type StrokeHandle,
  type RasterDocument, type RasterLayer, type PixelLayer, type Adjustment, type AdjustmentType, type FillContent, type Filter, type SmartFilter, type Affine, type Rect, type VectorSubpath, type BlendMode, type GradientSpec, type GradientShape, type LayerStyles,
  defaultAdjustment, findLayer, updateLayer, insertLayer, removeLayer, pixelLayer, adjustmentLayer, fillLayer, createDocument, affineInvert, affineApply, affineMul, affineTranslate, affineScale, walkLayers, transformedBounds,
  createBitmap, createMask, cloneBitmap, cloneMask, type Bitmap8, type Mask8,
  BrushStroke, snapshotRect, sealPatch, undoPatch, redoPatch, bucketFill, applyGradientTool, fillCoverage, type UndoPatch, type BrushSettings, type StrokePoint, type PaintTarget, TILE,
  CloneSession, redEye, poissonBlend, type ToneRange,
  combine, invertSelection as invertSel, selectAll as selAll, rectSelection, selectionFromAlpha, expandSelection, contractSelection, smoothSelection, borderSelection, computeBounds, colorRange as colorRangeSel, traceContours, selectionToPath, type Selection, type SelectionOp, type WandOptions, type RefineOptions,
  rasterizeSubpaths, rasterWorker, flattenCpu, decodeImageBlob, bitmapToMask, importPsd, encodeBitmap, encodePng, histogram as histogramOf,
  type WarpMesh,
} from '../../../services/tela/raster';
import { maskToBitmap } from '../../../services/tela/raster/assets';
import { PixelJournal, AssetAliases, StudioHistoryLog, planReconcile } from './historyBridge';
import { cloneLayer, duplicateLayer as dupLayer, groupLayers, ungroup as ungroupDoc, moveLayer as moveDoc, arrange as arrangeDoc, cropDocument, canvasSizeDocument, rotateCanvas as rotateDoc, flipCanvas as flipDoc, transformLayerAboutCenter, type MaskJob, type CanvasAnchor } from './layerOps';
import { encodeForPersist } from './persistWorker';
import { previewKey, previewSize, putPreview, registerLivePreview, PREVIEW_MAX_SIDE } from './previewCache';
import { renderTextLayer, specToLayerText, type TextSpec } from './textLayer';
import type { TransformState } from './freeTransform';
import { corners as tfCorners, outputBounds } from './freeTransform';

export type RGBA = [number, number, number, number];
export interface StudioPath { id: string; name: string; subpaths: VectorSubpath[] }
/** Extra JSON the studio keeps on the raster doc (engine functions spread docs, so it survives). */
export type StudioDoc = RasterDocument & { paths?: StudioPath[]; guides?: { x: number[]; y: number[] } };
export type Listener = (reason: string) => void;

export interface PaintParams {
  tool: 'brush' | 'pencil' | 'color-replace' | 'eraser' | 'clone' | 'heal' | 'history-brush' | 'dodge' | 'burn' | 'sponge' | 'blur' | 'sharpen' | 'smudge' | 'spot-heal';
  brush: BrushSettings; fg: RGBA; bg: RGBA;
  blend?: BlendMode; lockTransparency?: boolean;
  clone?: CloneSession; sampleAll?: boolean;
  range?: ToneRange; exposure?: number; spongeMode?: 'saturate' | 'desaturate'; strength?: number;
}

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isPixel = (l: RasterLayer | null | undefined): l is PixelLayer => !!l && l.kind === 'pixel';

export class ImageStudioController {
  private static registry = new Map<string, ImageStudioController>();
  /** Shared controller for a device (created once per tab; survives Studio remounts). */
  static async acquire(device: TelaImageDevice, dispatch: (op: TelaOp) => void): Promise<ImageStudioController> {
    const hit = ImageStudioController.registry.get(device.id);
    if (hit) { hit.dispatch = dispatch; hit.reconcile(device); return hit; }
    const s = await RasterSession.open(device);
    const c = new ImageStudioController(device, s, dispatch);
    ImageStudioController.registry.set(device.id, c);
    // keep memory bounded: at most 3 live sessions per tab
    if (ImageStudioController.registry.size > 3) { const [oldId, old] = ImageStudioController.registry.entries().next().value as [string, ImageStudioController]; if (old !== c) { void old.flushPersist(); old.detach(); ImageStudioController.registry.delete(oldId); } }
    return c;
  }
  static peek(deviceId: string) { return ImageStudioController.registry.get(deviceId) || null; }

  readonly deviceId: string;
  readonly session: RasterSession;
  readonly journal: PixelJournal<UndoPatch>;
  readonly aliases = new AssetAliases();
  readonly log = new StudioHistoryLog();
  dispatch: (op: TelaOp) => void;
  private baseRev: string | null; private baseRaster: unknown;
  private lastSent: { raster: RasterDocument | undefined; rev: string | undefined } | null;
  activeId: string | null = null;
  selectedIds: string[] = [];
  /** Painting targets the active layer's mask. */
  editMask = false;
  lastSelection: Selection | null = null;
  busy: string | null = null;
  warnings: string[] = [];
  version = 0;
  /** Cursor the History Brush paints back to (default: the state the studio opened at). */
  historySource = 0;
  private listeners = new Set<Listener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persisting: Promise<void> | null = null; private persistAgain = false;
  private mergedCache: { version: number; scale: number; bm: Bitmap8 } | null = null;
  private antsCache: { sel: Selection; ants: [number, number][][] } | null = null;

  private constructor(device: TelaImageDevice, session: RasterSession, dispatch: (op: TelaOp) => void) {
    this.deviceId = device.id; this.session = session; this.dispatch = dispatch;
    this.journal = new PixelJournal<UndoPatch>({ undo: p => { undoPatch(p); }, redo: p => { redoPatch(p); }, bytes: p => p.bytes, empty: p => !p.tiles.length });
    // The engine records every pixel patch through session.history; the journal is a drop-in.
    (session as unknown as { history: unknown }).history = this.journal;
    this.baseRev = device.rasterRev ?? null; this.baseRaster = device.raster;
    this.lastSent = { raster: device.raster, rev: device.rasterRev };
    session.on((_d, why) => this.bump(why));
    const top = this.flatIds().at(-1) || null; this.activeId = top; this.selectedIds = top ? [top] : [];
    registerLivePreview(this.deviceId, maxSide => this.previewBlob(maxSide));
  }

  // ── Subscription ───────────────────────────────────────────────────────────────────────────
  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  bump(reason = 'change') { this.version++; this.mergedCache = reason === 'selection' || reason === 'ui' ? this.mergedCache : null; for (const f of this.listeners) f(reason); }
  get doc(): StudioDoc { return this.session.doc as StudioDoc; }
  get selection(): Selection | null { return this.session.selection; }
  layer(id: string | null | undefined): RasterLayer | null { return id ? findLayer(this.doc, id)?.layer ?? null : null; }
  get active(): RasterLayer | null { return this.layer(this.activeId); }
  flatIds(): string[] { const out: string[] = []; walkLayers(this.doc.layers, l => { out.push(l.id); }); return out; }
  setBusy(msg: string | null) { this.busy = msg; this.bump('ui'); }
  private async withBusy<T>(msg: string, fn: () => Promise<T>): Promise<T> { this.setBusy(msg); try { return await fn(); } finally { this.setBusy(null); } }

  // ── The bridge ─────────────────────────────────────────────────────────────────────────────
  private isDirty = (k: string) => this.session.assets.dirty.has(k);
  /** Publish the current state as one Tela undo step. */
  commit(label: string, coalesce?: string) {
    const raster = this.aliases.toStored(this.session.doc, this.isDirty), rev = this.journal.rev;
    this.lastSent = { raster, rev };
    this.log.record(label, rev, coalesce ?? null, Date.now());
    (this.log.steps[this.log.index] as { raster?: unknown }).raster = raster;
    this.dispatch({ type: 'SET_IMAGE_RASTER', deviceId: this.deviceId, raster, rev, label, coalesce });
    this.schedulePersist(); this.bump('commit');
  }
  /** The device changed under us (Tela undo/redo, another surface): follow it. */
  reconcile(device: TelaImageDevice) {
    const plan = planReconcile(this.journal, device, this.lastSent, this.baseRev);
    if (plan.kind === 'none') return;
    if (plan.kind === 'seek') {
      const { applied } = this.journal.seek(plan.cursor);
      for (const p of applied) this.afterPatch(p);
    }
    let next: RasterDocument;
    if (device.raster) next = this.aliases.toRuntime(device.raster, k => this.session.assets.bitmaps.has(k) || this.session.assets.masks.has(k));
    else { const { migrateLegacyImageDevice } = require_model(); next = migrateLegacyImageDevice(device); }
    this.lastSent = { raster: device.raster, rev: device.rasterRev };
    const i = this.log.steps.findIndex(s => (s as { raster?: unknown }).raster === device.raster);
    this.log.index = i >= 0 ? i : device.raster === this.baseRaster ? -1 : this.log.index; this.log.seal();
    const missing = [...collectKeys(next)].filter(k => !this.session.assets.bitmaps.has(k) && !this.session.assets.masks.has(k) && !this.session.assets.failed.has(k));
    const adopt = () => { this.session.doc = next; if (!this.layer(this.activeId)) { this.activeId = this.flatIds().at(-1) || null; this.selectedIds = this.activeId ? [this.activeId] : []; } this.mergedCache = null; this.bump('reconcile'); };
    if (missing.length) void this.session.assets.load(next).then(adopt); else adopt();
  }
  private afterPatch(p: UndoPatch) {
    const a = this.session.assets;
    if (p.target.kind === 'rgba') { for (const [k, v] of a.bitmaps) if (v === (p.target as { bitmap: Bitmap8 }).bitmap) { a.markDirty(k); this.session.gpu?.invalidate(k); } }
    else for (const [k, v] of a.masks) if (v === (p.target as { mask: Mask8 }).mask) { a.markDirty(k); this.session.gpu?.invalidate(k, undefined, true); }
  }
  /** Tela undo/redo steps for the History panel (TelaView owns the actual stack). */
  historyJump(index: number, undo: () => void, redo: () => void) { const d = this.log.distanceTo(index); for (let i = 0; i < Math.abs(d); i++) (d < 0 ? undo : redo)(); }

  // ── Persistence (OPFS assets + preview), never an undo step ───────────────────────────────
  schedulePersist(ms = 1400) { if (this.persistTimer) clearTimeout(this.persistTimer); this.persistTimer = setTimeout(() => { this.persistTimer = null; void this.persist(); }, ms); }
  async flushPersist() { if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; } await this.persist(); }
  persist(): Promise<void> {
    if (this.persisting) { this.persistAgain = true; return this.persisting; }
    this.persisting = (async () => {
      try {
        const store = await import('../../../services/tela/telaAssetStore');
        const a = this.session.assets, used = collectKeys(this.session.doc);
        for (const key of [...a.dirty]) {
          a.dirty.delete(key);
          if (!used.has(key)) continue; // orphaned (undone layer) — persists later if it comes back
          const bm = a.bitmaps.get(key), mk = a.masks.get(key); if (!bm && !mk) continue;
          const png = await encodeForPersist(bm || maskToBitmap(mk!), this.doc.colorSpace);
          const { assetId } = await store.putTelaAsset(new Blob([png as BlobPart], { type: 'image/png' }), 'png');
          if (!a.dirty.has(key)) this.aliases.record(key, assetId);
        }
        const raster = this.aliases.toStored(this.session.doc, this.isDirty);
        const rev = this.lastSent?.rev ?? this.journal.rev;
        let preview = undefined as TelaImageDevice['rasterPreview'] | undefined;
        if (this.aliases.fullyStored(this.session.doc, this.isDirty)) {
          const blob = await this.previewBlob(PREVIEW_MAX_SIDE);
          const key = previewKey({ raster, rasterRev: rev })!;
          if (blob) { putPreview(key, blob); const { assetId } = await store.putTelaAsset(blob, 'webp'); const sz = previewSize(this.doc.width, this.doc.height); preview = { key, width: sz.width, height: sz.height, assetId, at: Date.now() }; }
        }
        if (this.lastSent && raster === this.lastSent.raster && !preview) return;
        const prev = this.lastSent?.raster;
        this.lastSent = { raster, rev };
        for (const s of this.log.steps) if ((s as { raster?: unknown }).raster === prev) (s as { raster?: unknown }).raster = raster;
        this.dispatch({ type: 'SET_IMAGE_RASTER', deviceId: this.deviceId, raster, rev, persistOnly: true, ...(preview ? { preview } : {}) });
      } catch (e) { console.warn('[ImageStudio] persist failed', e); }
    })().finally(() => { this.persisting = null; if (this.persistAgain) { this.persistAgain = false; this.schedulePersist(300); } });
    return this.persisting;
  }
  /** Upload the preview so other devices / Post Man recipients see this image (signed-in only). */
  async publishPreview(device: TelaImageDevice) {
    const p = device.rasterPreview; if (!p || p.src || !p.assetId) return;
    try {
      const [{ getTelaAssetBlob }, { uploadTelaImage }] = await Promise.all([import('../../../services/tela/telaAssetStore'), import('../../../services/telaAssets')]);
      const blob = await getTelaAssetBlob(p.assetId); if (!blob) return;
      const r = await uploadTelaImage(new File([blob], `${(device.name || 'image').replace(/\W+/g, '_')}.webp`, { type: 'image/webp' }));
      if (r.sessionOnly) return;
      if (this.lastSent?.raster === device.raster) this.dispatch({ type: 'SET_IMAGE_RASTER', deviceId: this.deviceId, raster: device.raster, rev: device.rasterRev, persistOnly: true, preview: { ...p, src: r.src } });
    } catch (e) { console.warn('[ImageStudio] preview upload skipped', e); }
  }
  async previewBlob(maxSide: number): Promise<Blob | null> {
    if (!this.session.gpu) return null;
    const { scale } = previewSize(this.doc.width, this.doc.height, maxSide);
    return encodeBitmap(this.session.flatten({ scale, dither: true }), { format: 'webp', quality: 0.92, colorSpace: this.doc.colorSpace });
  }

  // ── Display ────────────────────────────────────────────────────────────────────────────────
  attach(canvas: HTMLCanvasElement) { this.detach(); const ok = this.session.attachCanvas(canvas); this.bump('attach'); return ok; }
  detach() { if (this.session.gpu) { this.session.gpu.dispose(); this.session.gpu = null; } }
  /** Merged pixels at `scale` (cached per edit) — eyedropper sample-all, wand, quick select. */
  merged(scale = 1): Bitmap8 {
    if (this.mergedCache && this.mergedCache.version === this.version && this.mergedCache.scale === scale) return this.mergedCache.bm;
    const bm = this.session.flatten({ scale }); this.mergedCache = { version: this.version, scale, bm }; return bm;
  }
  ants(): [number, number][][] {
    const s = this.selection; if (!s) return [];
    if (this.antsCache?.sel === s) return this.antsCache.ants;
    const ants = traceContours(s) as [number, number][][]; this.antsCache = { sel: s, ants }; return ants;
  }

  // ── Layers ─────────────────────────────────────────────────────────────────────────────────
  setActive(id: string | null, mode: 'replace' | 'toggle' | 'range' = 'replace') {
    if (!id) { this.activeId = null; this.selectedIds = []; this.bump('ui'); return; }
    if (mode === 'toggle') this.selectedIds = this.selectedIds.includes(id) ? this.selectedIds.filter(x => x !== id) : [...this.selectedIds, id];
    else if (mode === 'range' && this.activeId) { const ids = this.flatIds(), a = ids.indexOf(this.activeId), b = ids.indexOf(id); this.selectedIds = ids.slice(Math.min(a, b), Math.max(a, b) + 1); }
    else this.selectedIds = [id];
    this.activeId = id; const l = this.layer(id); if (!l?.mask) this.editMask = false; this.bump('ui');
  }
  private where(): { aboveId?: string } { return this.activeId ? { aboveId: this.activeId } : {}; }
  private insert(l: RasterLayer, label: string) { this.session.doc = insertLayer(this.doc, l, this.where()); this.activeId = l.id; this.selectedIds = [l.id]; this.editMask = false; this.commit(label); return l; }
  addPixelLayer(bm: Bitmap8, patch: Partial<PixelLayer> = {}, label = 'New Layer') {
    const key = this.session.assets.putBitmap(bm);
    return this.insert(pixelLayer({ assetId: key }, bm.width, bm.height, { name: 'Layer', ...patch }), label) as PixelLayer;
  }
  newLayer() { const n = this.flatIds().length + 1; return this.addPixelLayer(createBitmap(this.doc.width, this.doc.height), { name: `Layer ${n}` }); }
  /** A mask that reveals everything (or the selection, Photoshop-style). */
  private revealMask(): RasterLayer['mask'] {
    const sel = this.selection;
    if (sel?.bounds) { const full = createMask(this.doc.width, this.doc.height); full.data.set(sel.data); return { kind: 'bitmap', enabled: true, assetId: this.session.assets.putMask(full), bounds: { x: 0, y: 0, width: this.doc.width, height: this.doc.height }, defaultColor: 0 }; }
    return { kind: 'bitmap', enabled: true, assetId: this.session.assets.putMask(createMask(1, 1, 255)), bounds: { x: 0, y: 0, width: 1, height: 1 }, defaultColor: 255 };
  }
  addAdjustment(type: AdjustmentType, opts: { clip?: boolean; adjustment?: Adjustment } = {}) {
    const l = adjustmentLayer(opts.adjustment || defaultAdjustment(type), { mask: this.revealMask(), clipped: opts.clip });
    return this.insert(l, `New ${l.name} Layer`);
  }
  addFill(fill: FillContent, patch: Partial<RasterLayer> = {}) { const l = fillLayer(fill, { mask: this.revealMask(), ...patch } as never); return this.insert(l, `New ${l.name} Layer`); }
  update(id: string, patch: Partial<RasterLayer> | ((l: RasterLayer) => RasterLayer), label = 'Layer Properties', coalesce?: string) {
    if (!this.layer(id)) return; this.session.doc = updateLayer(this.doc, id, patch); this.commit(label, coalesce ?? `${id}:${typeof patch === 'function' ? 'fn' : Object.keys(patch).sort().join(',')}`);
  }
  updateMany(ids: string[], patch: Partial<RasterLayer>, label = 'Layer Properties', coalesce?: string) { let d = this.doc; for (const id of ids) if (findLayer(d, id)) d = updateLayer(d, id, patch); this.session.doc = d; this.commit(label, coalesce); }
  remove(ids = this.selectedIds) {
    if (!ids.length) return; let d = this.doc; for (const id of ids) d = removeLayer(d, id); this.session.doc = d;
    this.activeId = this.flatIds().at(-1) || null; this.selectedIds = this.activeId ? [this.activeId] : []; this.commit(ids.length > 1 ? 'Delete Layers' : 'Delete Layer');
  }
  private copyAsset = (key: string, kind: 'bitmap' | 'mask') => {
    const a = this.session.assets;
    if (kind === 'bitmap') { const b = a.bitmap(key); return b ? a.putBitmap(cloneBitmap(b)) : key; }
    const m = a.mask(key); return m ? a.putMask(cloneMask(m)) : key;
  };
  duplicate(ids = this.selectedIds) {
    let d = this.doc; const made: string[] = [];
    for (const id of ids) { const r = dupLayer(d, id, this.copyAsset); d = r.doc; made.push(r.id); }
    this.session.doc = d; if (made.length) { this.activeId = made.at(-1)!; this.selectedIds = made; } this.commit('Duplicate Layer');
  }
  group(ids = this.selectedIds) { const r = groupLayers(this.doc, ids, `Group ${this.countGroups() + 1}`); if (!r.groupId) return; this.session.doc = r.doc; this.activeId = r.groupId; this.selectedIds = [r.groupId]; this.commit('Group Layers'); }
  private countGroups() { let n = 0; walkLayers(this.doc.layers, l => { if (l.kind === 'group') n++; }); return n; }
  ungroup(id = this.activeId) { const l = this.layer(id); if (!l || l.kind !== 'group') return; this.session.doc = ungroupDoc(this.doc, l.id); this.activeId = l.children.at(-1)?.id || null; this.selectedIds = l.children.map(c => c.id); this.commit('Ungroup Layers'); }
  moveLayer(id: string, target: string | null, where: 'above' | 'below' | 'into') { const next = moveDoc(this.doc, id, target, where); if (next === this.doc) return; this.session.doc = next; this.commit('Arrange Layers'); }
  arrange(how: 'forward' | 'backward' | 'front' | 'back') { if (!this.activeId) return; const next = arrangeDoc(this.doc, this.activeId, how); if (next === this.doc) return; this.session.doc = next; this.commit('Arrange'); }
  toggleClip(id = this.activeId) { const l = this.layer(id); if (!l) return; this.update(l.id, { clipped: !l.clipped }, l.clipped ? 'Release Clipping Mask' : 'Create Clipping Mask'); }

  /** Render a subset of layers alone at document size (merge/rasterize/apply mask/alpha). */
  private renderAlone(layers: RasterLayer[], withBackground = false): Bitmap8 {
    const mini: RasterDocument = { ...this.doc, background: withBackground ? this.doc.background : null, layers };
    return this.session.gpu ? this.session.gpu.flatten(mini) : flattenCpu(mini, this.session.assets);
  }
  mergeDown() {
    const hit = this.activeId ? findLayer(this.doc, this.activeId) : null; if (!hit) return;
    const sib = hit.parent ? hit.parent.children : this.doc.layers; const below = sib[hit.index - 1]; if (!below) return;
    const bm = this.renderAlone([below, hit.layer]);
    const merged = pixelLayer({ assetId: this.session.assets.putBitmap(bm) }, bm.width, bm.height, { name: below.name, opacity: 1, blend: 'normal' });
    let d = insertLayer(this.doc, merged, { aboveId: hit.layer.id }); d = removeLayer(removeLayer(d, hit.layer.id), below.id);
    this.session.doc = d; this.activeId = merged.id; this.selectedIds = [merged.id]; this.commit('Merge Down');
  }
  mergeSelected() {
    if (this.selectedIds.length < 2) return this.mergeDown();
    const order = this.flatIds().filter(id => this.selectedIds.includes(id)), layers = order.map(id => this.layer(id)!).filter(Boolean);
    const bm = this.renderAlone(layers), top = order.at(-1)!;
    const merged = pixelLayer({ assetId: this.session.assets.putBitmap(bm) }, bm.width, bm.height, { name: layers.at(-1)!.name });
    let d = insertLayer(this.doc, merged, { aboveId: top }); for (const id of order) d = removeLayer(d, id);
    this.session.doc = d; this.activeId = merged.id; this.selectedIds = [merged.id]; this.commit('Merge Layers');
  }
  mergeVisible() {
    const vis = this.doc.layers.filter(l => l.visible); if (!vis.length) return;
    const bm = this.renderAlone(vis); const merged = pixelLayer({ assetId: this.session.assets.putBitmap(bm) }, bm.width, bm.height, { name: 'Merged' });
    this.session.doc = { ...this.doc, layers: [...this.doc.layers.filter(l => !l.visible), merged] }; this.activeId = merged.id; this.selectedIds = [merged.id]; this.commit('Merge Visible');
  }
  flattenImage() {
    const bm = this.renderAlone(this.doc.layers.filter(l => l.visible), true);
    const l = pixelLayer({ assetId: this.session.assets.putBitmap(bm) }, bm.width, bm.height, { name: 'Background' });
    this.session.doc = { ...this.doc, layers: [l] }; this.activeId = l.id; this.selectedIds = [l.id]; this.commit('Flatten Image');
  }
  /** Bake content + smart filters into plain pixels (text, fill, adjusted layers). Mask and styles stay live. */
  rasterize(id = this.activeId) {
    const l = this.layer(id); if (!l || l.kind === 'adjustment' || l.kind === 'group') return;
    const bare = { ...l, mask: undefined, vectorMask: undefined, styles: undefined, opacity: 1, fillOpacity: 1, blend: 'normal', visible: true, clipped: false } as RasterLayer;
    const bm = this.renderAlone([bare]);
    const p = pixelLayer({ assetId: this.session.assets.putBitmap(bm) }, bm.width, bm.height, { id: l.id, name: l.name, opacity: l.opacity, blend: l.blend as BlendMode, visible: l.visible, clipped: l.clipped, mask: l.mask, vectorMask: l.vectorMask, styles: (l as PixelLayer).styles, fillOpacity: l.fillOpacity });
    this.session.doc = updateLayer(this.doc, l.id, () => p); this.commit('Rasterize Layer');
  }
  setStyles(id: string, styles: LayerStyles | undefined, coalesce?: string) { this.update(id, { styles } as Partial<RasterLayer>, 'Layer Style', coalesce ?? `${id}:styles`); }
  setSmartFilters(id: string, smartFilters: SmartFilter[], label = 'Smart Filter', coalesce?: string) { this.update(id, { smartFilters } as Partial<RasterLayer>, label, coalesce); }
  /** Live preview without an undo step (filter dialogs). Call commit() or revertPreview(). */
  previewPatch(id: string, patch: Partial<RasterLayer>) { if (!this.previewBase) this.previewBase = this.doc; this.session.doc = updateLayer(this.previewBase, id, patch); this.bump('preview'); }
  private previewBase: RasterDocument | null = null;
  endPreview(apply: boolean, label = 'Smart Filter') { if (!this.previewBase) return; if (apply) { this.previewBase = null; this.commit(label); } else { this.session.doc = this.previewBase; this.previewBase = null; this.bump('preview'); } }

  // ── Masks ──────────────────────────────────────────────────────────────────────────────────
  addMask(mode: 'reveal-all' | 'hide-all' | 'reveal-selection' | 'hide-selection', id = this.activeId) {
    const l = this.layer(id); if (!l) return; const W = this.doc.width, H = this.doc.height, sel = this.selection;
    let mask: RasterLayer['mask'];
    if ((mode === 'reveal-selection' || mode === 'hide-selection') && sel?.bounds) { const m = createMask(W, H); for (let i = 0; i < m.data.length; i++) m.data[i] = mode === 'reveal-selection' ? sel.data[i] : 255 - sel.data[i]; mask = { kind: 'bitmap', enabled: true, assetId: this.session.assets.putMask(m), bounds: { x: 0, y: 0, width: W, height: H }, defaultColor: 0 }; }
    else { const v = mode === 'hide-all' ? 0 : 255; mask = { kind: 'bitmap', enabled: true, assetId: this.session.assets.putMask(createMask(1, 1, v)), bounds: { x: 0, y: 0, width: 1, height: 1 }, defaultColor: v as 0 | 255 }; }
    this.session.doc = updateLayer(this.doc, l.id, { mask } as Partial<RasterLayer>); this.editMask = true; this.commit('Add Layer Mask');
  }
  deleteMask(id = this.activeId) { const l = this.layer(id); if (!l?.mask) return; this.session.doc = updateLayer(this.doc, l.id, { mask: undefined } as Partial<RasterLayer>); this.editMask = false; this.commit('Delete Layer Mask'); }
  toggleMask(id = this.activeId) { const l = this.layer(id); if (!l?.mask) return; this.update(l.id, { mask: { ...l.mask, enabled: !l.mask.enabled } } as Partial<RasterLayer>, l.mask.enabled ? 'Disable Layer Mask' : 'Enable Layer Mask'); }
  applyMask(id = this.activeId) {
    const l = this.layer(id); if (!isPixel(l) || !l.mask) return; this.rasterize(l.id);
    const p = this.layer(l.id) as PixelLayer, withMask = { ...p, opacity: 1, blend: 'normal', styles: undefined, visible: true, clipped: false } as PixelLayer;
    const bm = this.renderAlone([withMask]);
    this.session.doc = updateLayer(this.doc, l.id, { asset: { assetId: this.session.assets.putBitmap(bm) }, width: bm.width, height: bm.height, transform: [1, 0, 0, 1, 0, 0], mask: undefined } as Partial<RasterLayer>);
    this.editMask = false; this.commit('Apply Layer Mask');
  }
  /** Vector mask from subpaths (shape layers, pen paths). */
  setVectorMask(id: string, subpaths: VectorSubpath[] | null, label = 'Vector Mask') { this.update(id, { vectorMask: subpaths ? { enabled: true, subpaths } : undefined } as Partial<RasterLayer>, label); }

  /** Make sure a layer's bitmap mask covers the whole doc (lazy expansion before painting). */
  private fullMask(l: RasterLayer): { key: string; mask: Mask8; toMask: Affine } | null {
    if (l.mask?.kind !== 'bitmap') return null; const a = this.session.assets; const m = l.mask;
    let mask = a.mask(m.assetId); if (!mask) return null;
    const linked = !!m.linked && l.kind === 'pixel';
    const W = linked ? (l as PixelLayer).width : this.doc.width, H = linked ? (l as PixelLayer).height : this.doc.height;
    let key = m.assetId;
    if (m.bounds.x !== 0 || m.bounds.y !== 0 || m.bounds.width !== W || m.bounds.height !== H || mask.width !== W || mask.height !== H || !key.startsWith('mem:')) {
      const full = createMask(W, H, m.defaultColor);
      for (let y = 0; y < m.bounds.height; y++) for (let x = 0; x < m.bounds.width; x++) { const X = x + m.bounds.x, Y = y + m.bounds.y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; full.data[Y * W + X] = mask.data[Math.min(mask.height - 1, y) * mask.width + Math.min(mask.width - 1, x)]; }
      key = a.putMask(full); mask = full;
      this.session.doc = updateLayer(this.doc, l.id, { mask: { ...m, assetId: key, bounds: { x: 0, y: 0, width: W, height: H } } } as Partial<RasterLayer>);
    }
    const toMask = linked ? affineInvert((l as PixelLayer).transform) : ([1, 0, 0, 1, 0, 0] as Affine);
    return { key, mask, toMask };
  }
  invertMask(id = this.activeId) {
    const l = this.layer(id); if (!l) return; const fm = this.fullMask(l); if (!fm) return;
    const t: PaintTarget = { kind: 'mask', mask: fm.mask }, p = snapshotRect(t, { x: 0, y: 0, width: fm.mask.width, height: fm.mask.height }, 'Invert');
    for (let i = 0; i < fm.mask.data.length; i++) fm.mask.data[i] = 255 - fm.mask.data[i];
    if (this.pushPatch(sealPatch(p), fm.key, true)) this.commit('Invert Mask');
  }

  // ── Selection ──────────────────────────────────────────────────────────────────────────────
  select(sel: Selection | null, op: SelectionOp = 'replace') {
    if (this.selection) this.lastSelection = this.selection;
    if (sel && !sel.bounds && op === 'replace') sel = null;
    this.session.select(sel, op);
    if (this.selection && !this.selection.bounds) this.session.select(null);
  }
  selectAll() { this.select(selAll(this.doc.width, this.doc.height)); }
  deselect() { this.select(null); }
  reselect() { if (this.lastSelection) this.session.select(this.lastSelection); }
  inverse() { if (this.selection) this.session.select(invertSel(this.selection)); else this.selectAll(); }
  async modify(kind: 'feather' | 'expand' | 'contract' | 'smooth' | 'border', px: number) {
    const s = this.selection; if (!s) return;
    const out = await this.withBusy('Modifying selection…', async () => kind === 'feather' ? rasterWorker().run('feather', { selection: s, radius: px }) : kind === 'expand' ? expandSelection(s, px) : kind === 'contract' ? contractSelection(s, px) : kind === 'smooth' ? smoothSelection(s, px) : borderSelection(s, px));
    this.select(out);
  }
  async refine(o: RefineOptions): Promise<Selection | null> { const s = this.selection; if (!s) return null; return this.withBusy('Refining edge…', () => rasterWorker().run('refineEdge', { selection: s, image: this.merged(1), opts: o })); }
  async magicWand(x: number, y: number, o: WandOptions, op: SelectionOp, sampleMerged = true) {
    const img = sampleMerged ? this.merged(1) : this.layerPixelsInDocSpace(this.activeId);
    if (!img) return; const s = await rasterWorker().run('magicWand', { image: img, x, y, opts: o }); this.select(s, op);
  }
  /** Quick Selection: runs on a ≤1536 px proxy (interactive at 4k), upsampled with AA. */
  async quickSelect(stroke: { x: number; y: number }[], brushSize: number, op: SelectionOp) {
    const W = this.doc.width, H = this.doc.height, sc = Math.min(1, 1536 / Math.max(W, H)), img = this.merged(sc);
    const pts = stroke.map(p => ({ x: p.x * sc, y: p.y * sc })), base = this.selection ? scaleSelection(this.selection, img.width, img.height) : null;
    const small = await rasterWorker().run('quickSelect', { image: img, stroke: pts, brushSize: Math.max(2, brushSize * sc), base, subtract: op === 'subtract' });
    const full = sc < 1 ? scaleSelection(small, W, H) : small;
    this.session.select(full, 'replace'); if (this.selection && !this.selection.bounds) this.session.select(null);
  }
  colorRange(samples: [number, number, number][], fuzziness: number, op: SelectionOp = 'replace') { this.select(colorRangeSel(this.merged(1), samples, fuzziness), op); }
  async selectSubject(box?: Rect, op: SelectionOp = 'replace') {
    await this.withBusy('Finding the subject (on-device SAM)…', async () => {
      const { selectSubject } = await import('../../../services/tela/raster/selection');
      const bm = this.merged(Math.min(1, 1024 / Math.max(this.doc.width, this.doc.height)));
      const url = await bitmapToDataUrl(bm), sx = this.doc.width / bm.width;
      const s = await selectSubject(url, bm.width, bm.height, decodeAlphaUrl, box ? { x: box.x / sx, y: box.y / sx, width: box.width / sx, height: box.height / sx } : undefined);
      this.select(sx !== 1 ? scaleSelection(s, this.doc.width, this.doc.height) : s, op);
    });
  }
  /** Ctrl+click a thumbnail: the layer's alpha (through its transform) as a selection. */
  selectionFromLayer(id: string, op: SelectionOp = 'replace') {
    const l = this.layer(id); if (!l) return;
    const bm = this.renderAlone([{ ...l, opacity: 1, visible: true, clipped: false, styles: undefined, blend: 'normal' } as RasterLayer]);
    this.select(selectionFromAlpha(bm, 0, 0, this.doc.width, this.doc.height), op);
  }
  selectionToPath(): StudioPath | null { const s = this.selection; if (!s) return null; const p: StudioPath = { id: uid('path'), name: `Work Path`, subpaths: selectionToPath(s, 1.5) }; this.setPaths([...(this.doc.paths || []), p], 'Make Work Path'); return p; }

  // ── Pixels ─────────────────────────────────────────────────────────────────────────────────
  /** Copy-on-write the active layer bitmap (same contract as the engine's editableBitmap). */
  private editable(id: string): { layer: PixelLayer; bm: Bitmap8; key: string } | null {
    const l = this.layer(id); if (!isPixel(l)) return null; const a = this.session.assets;
    const key = l.asset.assetId || l.asset.src || ''; let bm = a.bitmap(key);
    if (!bm) bm = createBitmap(Math.max(1, l.width || this.doc.width), Math.max(1, l.height || this.doc.height));
    if (!l.asset.assetId || !key.startsWith('mem:')) {
      const k = a.putBitmap(bm === a.bitmap(key) ? cloneBitmap(bm) : bm);
      this.session.doc = updateLayer(this.doc, l.id, { asset: { assetId: k }, width: bm.width, height: bm.height } as Partial<RasterLayer>);
      return { layer: this.layer(id) as PixelLayer, bm: a.bitmap(k)!, key: k };
    }
    return { layer: l, bm, key };
  }
  private pushPatch(p: UndoPatch | null, key: string, mask = false): boolean {
    if (!p || !this.journal.push(p)) return false;
    this.session.assets.markDirty(key); this.session.gpu?.invalidate(key, undefined, mask); return true;
  }
  /** Selection mapped into a layer's bitmap space (soft edges preserved). */
  private selectionIn(l: PixelLayer, w: number, h: number): Mask8 | undefined {
    const s = this.selection; if (!s) return undefined;
    const m = createMask(w, h), fwd = l.transform;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [X, Y] = affineApply(fwd, x + 0.5, y + 0.5); const xi = Math.floor(X), yi = Math.floor(Y); if (xi >= 0 && yi >= 0 && xi < s.width && yi < s.height) m.data[y * w + x] = s.data[yi * s.width + xi]; }
    return m;
  }
  /** Run a whole-layer pixel edit with a tile-diff undo patch. `fn` may return a new bitmap to copy in. */
  pixelOp(id: string | null, label: string, fn: (bm: Bitmap8, layer: PixelLayer) => Bitmap8 | void, rect?: Rect): boolean {
    const e = id ? this.editable(id) : null; if (!e) { this.warn('Select a pixel layer first (rasterize text or fills to paint pixels).'); return false; }
    const t: PaintTarget = { kind: 'rgba', bitmap: e.bm }, patch = snapshotRect(t, rect || { x: 0, y: 0, width: e.bm.width, height: e.bm.height }, label);
    const out = fn(e.bm, e.layer); if (out && out !== e.bm) e.bm.data.set(out.data);
    if (this.pushPatch(sealPatch(patch), e.key)) { this.commit(label); return true; }
    return false;
  }
  warn(msg: string) { this.warnings = [msg]; this.bump('warn'); }
  /** Edit › Fill (colour) / Delete key (clear) over the selection or the whole layer. */
  fillSelection(color: RGBA, opacity = 1, label = 'Fill') {
    const id = this.activeId, l = this.layer(id);
    if (l && !isPixel(l) && l.mask && this.editMask) return this.maskFill(l, color[0], label);
    this.pixelOp(id, label, (bm, layer) => { const sel = this.selectionIn(layer, bm.width, bm.height); fillCoverage(bm, sel || { width: bm.width, height: bm.height, data: new Uint8Array(bm.width * bm.height).fill(255) }, color, opacity); });
  }
  private maskFill(l: RasterLayer, value: number, label: string) {
    const fm = this.fullMask(l); if (!fm) return; const sel = this.selection;
    const t: PaintTarget = { kind: 'mask', mask: fm.mask }, p = snapshotRect(t, { x: 0, y: 0, width: fm.mask.width, height: fm.mask.height }, label);
    for (let i = 0; i < fm.mask.data.length; i++) { const k = sel ? sel.data[i] / 255 : 1; fm.mask.data[i] = Math.round(fm.mask.data[i] + (value - fm.mask.data[i]) * k); }
    if (this.pushPatch(sealPatch(p), fm.key, true)) this.commit(label);
  }
  clearSelection() {
    const l = this.active; if (!l) return;
    if (this.editMask || !isPixel(l)) { if (l.mask) this.maskFill(l, 0, 'Clear'); return; }
    if (!this.selection) { this.remove([l.id]); return; }
    this.pixelOp(l.id, 'Clear', (bm, layer) => { const sel = this.selectionIn(layer, bm.width, bm.height)!; for (let i = 0; i < sel.data.length; i++) { const k = sel.data[i] / 255; if (k > 0) bm.data[i * 4 + 3] = Math.round(bm.data[i * 4 + 3] * (1 - k)); } });
  }
  bucket(x: number, y: number, color: RGBA, o: { tolerance: number; contiguous: boolean; antiAlias: boolean; opacity?: number; sampleMerged?: boolean }) {
    this.pixelOp(this.activeId, 'Paint Bucket', (bm, layer) => {
      const inv = affineInvert(layer.transform), [lx, ly] = affineApply(inv, x, y);
      const sample = o.sampleMerged ? this.layerSpace(this.merged(1), layer, bm.width, bm.height) : undefined;
      bucketFill(bm, lx, ly, color, { tolerance: o.tolerance, contiguous: o.contiguous, antiAlias: o.antiAlias, opacity: o.opacity, sample, selection: this.selectionIn(layer, bm.width, bm.height) }); // pixelOp's patch records the result
    });
  }
  gradient(spec: GradientSpec, shape: GradientShape, p0: [number, number], p1: [number, number], o: { opacity?: number; blend?: BlendMode; reverse?: boolean; dither?: boolean; transparency?: boolean } = {}) {
    const l = this.active;
    if (l && (!isPixel(l) || this.editMask) && l.mask) { // gradient on a mask
      const fm = this.fullMask(l); if (!fm) return; const bm = createBitmap(fm.mask.width, fm.mask.height);
      for (let i = 0; i < fm.mask.data.length; i++) { const v = fm.mask.data[i]; bm.data[i * 4] = bm.data[i * 4 + 1] = bm.data[i * 4 + 2] = v; bm.data[i * 4 + 3] = 255; }
      const [x0, y0] = affineApply(fm.toMask, p0[0], p0[1]), [x1, y1] = affineApply(fm.toMask, p1[0], p1[1]);
      const t: PaintTarget = { kind: 'mask', mask: fm.mask }, patch = snapshotRect(t, { x: 0, y: 0, width: fm.mask.width, height: fm.mask.height }, 'Gradient');
      applyGradientTool(bm, spec, { shape, x0, y0, x1, y1, ...o, selection: this.selection || undefined });
      for (let i = 0; i < fm.mask.data.length; i++) fm.mask.data[i] = Math.round(0.299 * bm.data[i * 4] + 0.587 * bm.data[i * 4 + 1] + 0.114 * bm.data[i * 4 + 2]);
      if (this.pushPatch(sealPatch(patch), fm.key, true)) this.commit('Gradient');
      return;
    }
    this.pixelOp(this.activeId, 'Gradient', (bm, layer) => {
      const inv = affineInvert(layer.transform), [x0, y0] = affineApply(inv, p0[0], p0[1]), [x1, y1] = affineApply(inv, p1[0], p1[1]);
      applyGradientTool(bm, spec, { shape, x0, y0, x1, y1, ...o, selection: this.selectionIn(layer, bm.width, bm.height) });
    });
  }
  /** Doc-sized pixels → layer bitmap space (sample merged for layer-space tools). */
  private layerSpace(docBm: Bitmap8, l: PixelLayer, w: number, h: number): Bitmap8 {
    const out = createBitmap(w, h), fwd = l.transform;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [X, Y] = affineApply(fwd, x + 0.5, y + 0.5); const xi = Math.floor(X), yi = Math.floor(Y); if (xi < 0 || yi < 0 || xi >= docBm.width || yi >= docBm.height) continue; out.data.set(docBm.data.subarray((yi * docBm.width + xi) * 4, (yi * docBm.width + xi) * 4 + 4), (y * w + x) * 4); }
    return out;
  }
  private layerPixelsInDocSpace(id: string | null): Bitmap8 | null { const l = this.layer(id); if (!l) return null; return this.renderAlone([{ ...l, visible: true, opacity: 1, blend: 'normal', clipped: false } as RasterLayer]); }

  /** One painting gesture. Points are DOCUMENT coordinates. */
  beginPaint(p: PaintParams): StrokeHandle | null {
    const l = this.active; if (!l) { this.warn('Select a layer to paint on.'); return null; }
    const before = this.journal.cursor;
    const label = ({ brush: 'Brush Tool', pencil: 'Pencil', 'color-replace': 'Color Replacement', eraser: 'Eraser', clone: 'Clone Stamp', heal: 'Healing Brush', 'history-brush': 'History Brush', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge', blur: 'Blur', sharpen: 'Sharpen', smudge: 'Smudge', 'spot-heal': 'Spot Healing Brush' } as const)[p.tool];
    const done = () => { if (this.journal.cursor !== before) this.commit(label); else this.bump('paint'); };
    const wrap = (h: StrokeHandle): StrokeHandle => ({ add: pt => h.add(pt), end: () => { h.end(); done(); }, cancel: () => { h.cancel(); this.bump('paint'); } });
    // masks: painting on a mask (selected mask, or any adjustment/fill/group layer)
    if ((this.editMask || !isPixel(l)) && l.mask?.kind === 'bitmap') {
      if (!['brush', 'pencil', 'eraser', 'color-replace', 'blur', 'smudge', 'sharpen', 'dodge', 'burn'].includes(p.tool)) { this.warn(`${label} paints pixels — select the layer thumbnail, not its mask.`); return null; }
      const fm = this.fullMask(l)!; const gray = (c: RGBA) => Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
      const value = p.tool === 'eraser' ? gray(p.bg) : gray(p.fg);
      const stroke = new BrushStroke({ kind: 'mask', mask: fm.mask }, p.tool === 'pencil' ? { ...p.brush, hardness: 1 } : p.brush, 'paint', [value, value, value, 255]);
      if (this.selection && fm.mask.width === this.doc.width && fm.mask.height === this.doc.height) stroke.selection = this.selection;
      return wrap(this.customStroke(stroke, fm.key, true, fm.toMask, label));
    }
    if (!isPixel(l)) { this.warn('This layer has no pixels. Add a layer mask, or rasterize it.'); return null; }
    if (l.locked?.pixels || l.locked?.all) { this.warn('The layer is locked.'); return null; }
    const lockT = !!(p.lockTransparency || l.locked?.transparency);
    switch (p.tool) {
      case 'brush': case 'pencil': return wrap(this.session.beginStroke(l.id, { tool: p.tool, brush: p.brush, color: p.fg, blend: p.blend }, { lockTransparency: lockT }));
      case 'color-replace': return wrap(this.session.beginStroke(l.id, { tool: 'brush', brush: p.brush, color: p.fg, blend: 'color' }, { lockTransparency: true }));
      case 'eraser': return wrap(this.session.beginStroke(l.id, { tool: 'eraser', brush: p.brush }, { lockTransparency: lockT }));
      case 'clone': case 'heal': if (!p.clone) { this.warn('Alt-click to set the source first.'); return null; } return wrap(this.session.beginStroke(l.id, { tool: p.tool, brush: p.brush, clone: p.clone, sampleAll: p.sampleAll }));
      case 'dodge': case 'burn': return wrap(this.session.beginStroke(l.id, { tool: p.tool, brush: p.brush, range: p.range || 'midtones', exposure: p.exposure ?? 0.5 }));
      case 'sponge': return wrap(this.session.beginStroke(l.id, { tool: 'sponge', brush: p.brush, mode: p.spongeMode || 'desaturate', flow: p.strength ?? 0.5 }));
      case 'blur': case 'sharpen': return wrap(this.session.beginStroke(l.id, { tool: p.tool, brush: p.brush, strength: p.strength ?? 0.5 }));
      case 'smudge': return wrap(this.session.beginStroke(l.id, { tool: 'smudge', brush: p.brush, strength: p.strength ?? 0.5 }));
      case 'history-brush': {
        const e = this.editable(l.id)!; const src = this.reconstruct(e.bm, this.historySource);
        const { createCloneStroke } = require_retouch();
        const stroke = createCloneStroke({ kind: 'rgba', bitmap: e.bm }, src, { dx: 0, dy: 0 }, p.brush);
        stroke.selection = this.selectionIn(e.layer, e.bm.width, e.bm.height) || null;
        return wrap(this.customStroke(stroke, e.key, false, affineInvert(e.layer.transform), label));
      }
      case 'spot-heal': return this.spotHealStroke(l, p.brush, label);
    }
  }
  /** Drive a BrushStroke we built ourselves (masks, history brush) like the engine's strokes. */
  private customStroke(stroke: BrushStroke, key: string, mask: boolean, toTarget: Affine, label: string): StrokeHandle {
    const flush = () => { const d = stroke.takeDirty(); if (d) this.session.gpu?.invalidate(key, d, mask); };
    return {
      add: pt => { const [x, y] = affineApply(toTarget, pt.x, pt.y); stroke.addPoint({ ...pt, x, y }); flush(); },
      end: () => { const patch = stroke.end(label); this.pushPatch(patch, key, mask); flush(); },
      cancel: () => { const patch = stroke.end(); undoPatch(patch); this.session.gpu?.invalidate(key, undefined, mask); },
    };
  }
  /** Layer pixels as they were at journal cursor `at` (History Brush source). */
  private reconstruct(bm: Bitmap8, at: number): Bitmap8 {
    const out = cloneBitmap(bm);
    for (const p of this.journal.patchesSince(at)) { if (p.target.kind !== 'rgba' || p.target.bitmap !== bm) continue; for (const t of p.tiles) writeTileInto(out, t.tx, t.ty, t.w, t.h, t.before); }
    return out;
  }
  private spotHealStroke(l: PixelLayer, brush: BrushSettings, label: string): StrokeHandle {
    const e = this.editable(l.id)!; const inv = affineInvert(e.layer.transform);
    const mask = createMask(e.bm.width, e.bm.height), probe = new BrushStroke({ kind: 'mask', mask }, { ...brush, opacity: 1, flow: 1, hardness: Math.min(brush.hardness, 0.7) }, 'paint', [255, 255, 255, 255]);
    const overlay = { pts: [] as StrokePoint[] };
    return {
      add: pt => { const [x, y] = affineApply(inv, pt.x, pt.y); probe.addPoint({ ...pt, x, y }); overlay.pts.push(pt); },
      end: () => {
        probe.end(); const b = computeBounds(mask); if (!b) return;
        void this.withBusy('Spot healing…', async () => {
          const healed = await rasterWorker().run('spotHealMask', { image: e.bm, mask });
          const pad = 2, rect = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(e.bm.width, b.x + b.width + pad) - Math.max(0, b.x - pad), height: Math.min(e.bm.height, b.y + b.height + pad) - Math.max(0, b.y - pad) };
          const cur = this.editable(l.id)!; const t: PaintTarget = { kind: 'rgba', bitmap: cur.bm }, patch = snapshotRect(t, rect, label);
          for (let y = rect.y; y < rect.y + rect.height; y++) { const o = (y * cur.bm.width + rect.x) * 4; cur.bm.data.set(healed.data.subarray(o, o + rect.width * 4), o); }
          if (this.pushPatch(sealPatch(patch), cur.key)) this.commit(label);
        });
      },
      cancel: () => { /* nothing applied until end() */ },
    };
  }
  /** Patch tool: replace the selection with content from `offset` away, Poisson-blended. */
  async patch(dx: number, dy: number) {
    const l = this.active, s = this.selection; if (!isPixel(l) || !s?.bounds) return;
    await this.withBusy('Patching…', async () => {
      this.pixelOp(l.id, 'Patch', (bm, layer) => {
        const sel = this.selectionIn(layer, bm.width, bm.height)!, b = computeBounds(sel); if (!b) return;
        const inv = affineInvert(layer.transform), [ox, oy] = [inv[0] * dx + inv[2] * dy, inv[1] * dx + inv[3] * dy];
        const m = 4, x0 = Math.max(0, b.x - m), y0 = Math.max(0, b.y - m), x1 = Math.min(bm.width, b.x + b.width + m), y1 = Math.min(bm.height, b.y + b.height + m), W = x1 - x0, H = y1 - y0;
        const dst = new Float32Array(W * H * 3), tex = new Float32Array(W * H * 3), cov = new Float32Array(W * H), px = [0, 0, 0, 0];
        const { sampleBitmap } = require_retouch();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, k = ((y + y0) * bm.width + x + x0) * 4; for (let c = 0; c < 3; c++) dst[i * 3 + c] = bm.data[k + c]; sampleBitmap(bm, x + x0 + 0.5 + ox, y + y0 + 0.5 + oy, px); tex[i * 3] = px[0]; tex[i * 3 + 1] = px[1]; tex[i * 3 + 2] = px[2]; cov[i] = sel.data[(y + y0) * bm.width + x + x0] / 255; }
        const out = poissonBlend(W, H, dst, tex, cov);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (cov[i] <= 0) continue; const k = ((y + y0) * bm.width + x + x0) * 4; for (let c = 0; c < 3; c++) bm.data[k + c] = Math.round(out[i * 3 + c]); }
      });
    });
  }
  redEye(rect: Rect, darken = 0.5) { this.pixelOp(this.activeId, 'Red Eye', (bm, layer) => { const inv = affineInvert(layer.transform), [x0, y0] = affineApply(inv, rect.x, rect.y), [x1, y1] = affineApply(inv, rect.x + rect.width, rect.y + rect.height); return redEye(bm, { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }, { darken }); }); }
  async contentAwareFill() {
    if (!this.selection?.bounds) { this.warn('Make a selection around what to remove first.'); return; }
    await this.withBusy('Content-Aware Fill…', async () => {
      const before = this.doc; const l = await this.session.contentAwareFill();
      if (l) { this.activeId = l.id; this.selectedIds = [l.id]; void before; this.commit('Content-Aware Fill'); }
    });
  }
  /** Destructive filter on the active layer (respects the selection). Smart filters use setSmartFilters. */
  async applyFilter(f: Filter, label: string) {
    const l = this.active; if (!isPixel(l)) { this.warn('Filters apply to pixel layers.'); return; }
    await this.withBusy(`${label}…`, async () => { const before = this.journal.cursor; await this.session.applyFilter(l.id, f); if (this.journal.cursor !== before) this.commit(label); });
  }

  // ── Transform ──────────────────────────────────────────────────────────────────────────────
  /** Free Transform target: a pixel layer (selection → floated into its own layer first). */
  beginTransform(): { layerId: string; w: number; h: number; m: Affine } | null {
    let l = this.active; if (!l) return null;
    if (isPixel(l) && this.selection?.bounds && !this.editMask) { this.layerViaCopy(true); l = this.active; }
    if (l && l.kind === 'pixel') { if (l.locked?.position || l.locked?.all) { this.warn('The layer position is locked.'); return null; } return { layerId: l.id, w: l.width || this.doc.width, h: l.height || this.doc.height, m: [...l.transform] as Affine }; }
    if (l && l.kind === 'fill') { this.warn('Rasterize the fill layer to transform it, or edit its vector mask with the Path Selection tool.'); }
    return null;
  }
  /** Live affine preview (no undo step). */
  previewTransform(layerId: string, m: Affine) { this.session.doc = updateLayer(this.doc, layerId, { transform: m } as Partial<RasterLayer>); this.bump('transform'); }
  cancelTransform(layerId: string, original: Affine) { if (!this.layer(layerId)) return; this.session.doc = updateLayer(this.doc, layerId, { transform: original } as Partial<RasterLayer>); this.bump('transform'); }
  async commitTransform(layerId: string, s: TransformState, original: Affine) {
    const l = this.layer(layerId); if (!isPixel(l)) return;
    if (!s.quad && !s.mesh) { this.session.doc = updateLayer(this.doc, layerId, { transform: s.m } as Partial<RasterLayer>); this.commit('Free Transform'); return; }
    const src = this.session.assets.bitmap(l.asset.assetId || l.asset.src || ''); if (!src) return;
    await this.withBusy('Transforming…', async () => {
      const ob = outputBounds(s); let out: Bitmap8;
      if (s.mesh) { const mesh: WarpMesh = { cols: 1, rows: 1, points: s.mesh.map(p => [p[0] - ob.x, p[1] - ob.y] as [number, number]) }; out = await rasterWorker().run('warp', { image: src, mesh, width: ob.width, height: ob.height }); }
      else out = await rasterWorker().run('distort', { image: src, corners: tfCorners(s).map(p => [p[0] - ob.x, p[1] - ob.y] as [number, number]), width: ob.width, height: ob.height });
      this.session.doc = updateLayer(this.doc, layerId, { asset: { assetId: this.session.assets.putBitmap(out) }, width: out.width, height: out.height, transform: affineTranslate(ob.x, ob.y) } as Partial<RasterLayer>);
      void original; this.commit(s.mesh ? 'Warp' : s.mode === 'perspective' ? 'Perspective' : 'Distort');
    });
  }
  transformLayer(op: 'flip-h' | 'flip-v' | 'cw' | 'ccw' | '180') { const l = this.active; if (!isPixel(l)) return; this.update(l.id, transformLayerAboutCenter(l, op), { 'flip-h': 'Flip Horizontal', 'flip-v': 'Flip Vertical', cw: 'Rotate 90° Clockwise', ccw: 'Rotate 90° Counter Clockwise', '180': 'Rotate 180°' }[op]); }
  nudge(dx: number, dy: number) {
    const ids = this.selectedIds.length ? this.selectedIds : this.activeId ? [this.activeId] : []; let d = this.doc;
    for (const id of ids) { const l = findLayer(d, id)?.layer; if (isPixel(l) && !l.locked?.position) d = updateLayer(d, id, { transform: affineMul(affineTranslate(dx, dy), l.transform) } as Partial<RasterLayer>); }
    this.session.doc = d; this.commit('Nudge', 'nudge');
  }
  /** Ctrl+J / Ctrl+Shift+J: selection (or whole layer) into a new layer. */
  layerViaCopy(cut = false) {
    const l = this.active; if (!isPixel(l)) { this.duplicate(); return; }
    const sel = this.selection; if (!sel?.bounds) { this.duplicate([l.id]); return; }
    const e = this.editable(l.id)!; const m = this.selectionIn(e.layer, e.bm.width, e.bm.height)!, out = createBitmap(e.bm.width, e.bm.height);
    for (let i = 0; i < m.data.length; i++) { const k = m.data[i] / 255; if (k <= 0) continue; out.data.set(e.bm.data.subarray(i * 4, i * 4 + 3), i * 4); out.data[i * 4 + 3] = Math.round(e.bm.data[i * 4 + 3] * k); }
    if (cut) { const t: PaintTarget = { kind: 'rgba', bitmap: e.bm }, patch = snapshotRect(t, { x: 0, y: 0, width: e.bm.width, height: e.bm.height }, 'Cut'); for (let i = 0; i < m.data.length; i++) { const k = m.data[i] / 255; if (k > 0) e.bm.data[i * 4 + 3] = Math.round(e.bm.data[i * 4 + 3] * (1 - k)); } this.pushPatch(sealPatch(patch), e.key); }
    const key = this.session.assets.putBitmap(out);
    const nl = pixelLayer({ assetId: key }, out.width, out.height, { name: cut ? 'Layer via Cut' : 'Layer via Copy', transform: [...e.layer.transform] as Affine });
    this.session.select(null);
    this.insert(nl, cut ? 'Layer via Cut' : 'Layer via Copy');
  }

  // ── Document geometry ──────────────────────────────────────────────────────────────────────
  private async runMaskJobs(jobs: MaskJob[], doc: RasterDocument): Promise<RasterDocument> {
    let d = doc;
    for (const j of jobs) {
      const src = this.session.assets.mask(j.mask.assetId); if (!src) continue;
      const M = affineMul(affineTranslate(-j.newBounds.x, -j.newBounds.y), affineMul(j.m, affineTranslate(j.mask.bounds.x, j.mask.bounds.y)));
      const out = await rasterWorker().run('transformAffine', { image: maskToBitmap(src), m: M, width: Math.max(1, j.newBounds.width), height: Math.max(1, j.newBounds.height), filter: 'bilinear' });
      const key = this.session.assets.putMask(bitmapToMask(out, 'red'));
      d = updateLayer(d, j.layerId, l => ({ ...l, mask: { ...(l.mask as object), assetId: key, bounds: j.newBounds } } as RasterLayer));
    }
    return d;
  }
  async crop(rect: Rect, angle = 0) {
    const r = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
    const { doc, maskJobs } = cropDocument(this.doc, r, angle);
    this.session.doc = await this.runMaskJobs(maskJobs, doc); this.session.select(null); this.commit('Crop');
  }
  cropToSelection() { const b = this.selection?.bounds; if (b) void this.crop(b); }
  async perspectiveCrop(quad: [number, number][], outW: number, outH: number) {
    await this.withBusy('Perspective crop…', async () => {
      const { homographyFromQuads } = await import('../../../services/tela/raster/transform');
      const H = homographyFromQuads(quad, [[0, 0], [outW, 0], [outW, outH], [0, outH]]);
      const map = (x: number, y: number): [number, number] => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
      const layers: RasterLayer[] = [];
      for (const l of this.doc.layers) {
        // bake each top-level layer (groups/adjustments included) to doc pixels, then warp
        const bm = this.renderAlone([{ ...l, visible: true } as RasterLayer]);
        const corners = [map(0, 0), map(bm.width, 0), map(bm.width, bm.height), map(0, bm.height)];
        const out = await rasterWorker().run('distort', { image: bm, corners, width: outW, height: outH });
        layers.push(pixelLayer({ assetId: this.session.assets.putBitmap(out) }, outW, outH, { id: l.id, name: l.name, visible: l.visible, opacity: 1, blend: (l.kind === 'group' ? 'normal' : l.blend) as BlendMode }));
      }
      this.session.doc = { ...this.doc, width: outW, height: outH, layers }; this.session.select(null); this.commit('Perspective Crop');
    });
  }
  async canvasSize(w: number, h: number, anchor: CanvasAnchor = 'c') { const { doc, maskJobs } = canvasSizeDocument(this.doc, Math.round(w), Math.round(h), anchor); this.session.doc = await this.runMaskJobs(maskJobs, doc); this.session.select(null); this.commit('Canvas Size'); }
  async imageSize(w: number, h: number, filter: 'bicubic' | 'lanczos3' | 'bilinear' | 'nearest' = 'lanczos3') {
    await this.withBusy('Resampling…', async () => {
      // non-destructive: scale every transform (pixels resample at render, like smart objects);
      // pixel-dense layers that would upsample/minify a lot are resampled for quality.
      const sx = w / this.doc.width, sy = h / this.doc.height, S = affineScale(sx, sy);
      const { transformDocument } = await import('./layerOps');
      const { doc, maskJobs } = transformDocument(this.doc, S, Math.round(w), Math.round(h));
      let d = await this.runMaskJobs(maskJobs, doc);
      if (filter !== 'bilinear') {
        const jobs: Promise<void>[] = [];
        walkLayers(d.layers, l => {
          if (l.kind !== 'pixel') return; const bm = this.session.assets.bitmap(l.asset.assetId || l.asset.src || ''); if (!bm) return;
          const lx = Math.hypot(l.transform[0], l.transform[1]), ly = Math.hypot(l.transform[2], l.transform[3]);
          if (Math.abs(lx - 1) < 0.02 && Math.abs(ly - 1) < 0.02) return;
          if (Math.abs(l.transform[1]) > 1e-6 || Math.abs(l.transform[2]) > 1e-6) return; // rotated: leave to render-time resampling
          const nw = Math.max(1, Math.round(bm.width * lx)), nh = Math.max(1, Math.round(bm.height * ly)), id = l.id, t = l.transform;
          jobs.push(rasterWorker().run('resize', { image: bm, width: nw, height: nh, filter }).then(r => { d = updateLayer(d, id, { asset: { assetId: this.session.assets.putBitmap(r) }, width: nw, height: nh, transform: [Math.sign(t[0]) || 1, 0, 0, Math.sign(t[3]) || 1, t[4], t[5]] } as Partial<RasterLayer>); }));
        });
        await Promise.all(jobs);
      }
      this.session.doc = d; this.session.select(null); this.commit('Image Size');
    });
  }
  async rotateCanvas(how: 'cw' | 'ccw' | '180') { const { doc, maskJobs } = rotateDoc(this.doc, how); this.session.doc = await this.runMaskJobs(maskJobs, doc); this.session.select(null); this.commit(how === '180' ? 'Rotate Canvas 180°' : `Rotate Canvas 90° ${how === 'cw' ? 'CW' : 'CCW'}`); }
  async flipCanvas(axis: 'horizontal' | 'vertical') { const { doc, maskJobs } = flipDoc(this.doc, axis); this.session.doc = await this.runMaskJobs(maskJobs, doc); this.session.select(null); this.commit(`Flip Canvas ${axis === 'horizontal' ? 'Horizontal' : 'Vertical'}`); }
  /** Image › Trim: crop away transparent (or top-left-coloured) borders. */
  async trim(based: 'transparent' | 'top-left' = 'transparent') {
    const bm = this.merged(1), W = bm.width, H = bm.height, d = bm.data, ref = [d[0], d[1], d[2], d[3]];
    const keep = (i: number) => based === 'transparent' ? d[i * 4 + 3] > 0 : Math.abs(d[i * 4] - ref[0]) + Math.abs(d[i * 4 + 1] - ref[1]) + Math.abs(d[i * 4 + 2] - ref[2]) + Math.abs(d[i * 4 + 3] - ref[3]) > 6;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (keep(y * W + x)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return; await this.crop({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  }
  setDocumentProps(patch: Partial<Pick<RasterDocument, 'colorSpace' | 'blendSpace' | 'bitDepth' | 'background' | 'dpi'>>, label = 'Document Settings') { this.session.doc = { ...this.doc, ...patch }; this.commit(label); }
  setGuides(guides: { x: number[]; y: number[] }) { this.session.doc = { ...this.doc, guides } as StudioDoc; this.commit('Guides', 'guides'); }
  setPaths(paths: StudioPath[], label = 'Path', coalesce?: string) { this.session.doc = { ...this.doc, paths } as StudioDoc; this.commit(label, coalesce); }
  pathSelection(subpaths: VectorSubpath[], op: SelectionOp = 'replace', feather = 0) {
    const W = this.doc.width, H = this.doc.height, cov = rasterizeSubpaths(subpaths, W, H), m = createMask(W, H);
    for (let i = 0; i < cov.length; i++) m.data[i] = Math.round(Math.min(1, Math.max(0, cov[i])) * 255);
    let s: Selection = { ...m, bounds: computeBounds(m) };
    if (feather > 0) void rasterWorker().run('feather', { selection: s, radius: feather }).then(f => this.select(f, op)); else this.select(s, op);
  }
  /** Stroke a path with the current brush (Paths panel › Stroke Path). */
  strokePath(subpaths: VectorSubpath[], p: PaintParams) {
    const { flattenSubpath } = require_vector(); const h = this.beginPaint(p); if (!h) return;
    for (const sp of subpaths) for (const [x, y] of flattenSubpath(sp)) h.add({ x, y, pressure: 1 });
    h.end();
  }
  /** Shape tool: a solid Fill layer clipped by a vector mask (exactly how Photoshop shape layers work). */
  addShape(subpaths: VectorSubpath[], color: [number, number, number], name = 'Shape') {
    const l = fillLayer({ type: 'solid', color }, { name, vectorMask: { enabled: true, subpaths } });
    return this.insert(l, `New ${name}`);
  }

  // ── Type ───────────────────────────────────────────────────────────────────────────────────
  async addText(spec: TextSpec, at: { x: number; y: number }, editId?: string) {
    const r = await renderTextLayer(spec);
    const key = this.session.assets.putBitmap(r.bitmap);
    // base = where the engine's bitmap sits for this anchor; any later move/rotate the user
    // applied is kept as `extra` so re-editing the words never resets the layer's placement.
    const base: Affine = affineMul(affineTranslate(at.x + r.dx, at.y + r.dy), affineScale(1 / r.scale));
    const text = { ...specToLayerText(spec, at), raw: { ...specToLayerText(spec, at).raw, engine: r.engine, base } };
    const name = spec.value.split(/\r?\n/)[0].slice(0, 40) || 'Text';
    const prev = editId ? this.layer(editId) : null;
    if (isPixel(prev)) {
      const prevBase = (prev.text?.raw as { base?: Affine } | undefined)?.base;
      const extra: Affine = prevBase ? affineMul(prev.transform, affineInvert(prevBase)) : [1, 0, 0, 1, 0, 0];
      this.session.doc = updateLayer(this.doc, prev.id, { asset: { assetId: key }, width: r.bitmap.width, height: r.bitmap.height, transform: affineMul(extra, base), text, name } as Partial<RasterLayer>);
      this.commit('Edit Type Layer'); return prev.id;
    }
    const l = pixelLayer({ assetId: key }, r.bitmap.width, r.bitmap.height, { name, transform: base, text });
    this.insert(l, 'Type Layer'); return l.id;
  }

  // ── Import / export / clipboard ────────────────────────────────────────────────────────────
  async importFile(file: File, mode: 'open' | 'place') {
    await this.withBusy(`${mode === 'open' ? 'Opening' : 'Placing'} ${file.name}…`, async () => {
      if (/\.psd$/i.test(file.name) || file.type === 'image/vnd.adobe.photoshop') {
        const r = importPsd(await file.arrayBuffer(), { putBitmap: bm => this.session.assets.putBitmap(bm), putMask: m => this.session.assets.putMask(m) });
        this.warnings = r.warnings;
        if (mode === 'open' || !this.doc.layers.length) { this.session.doc = { ...r.doc, paths: this.doc.paths } as StudioDoc; this.activeId = this.flatIds().at(-1) || null; this.selectedIds = this.activeId ? [this.activeId] : []; this.session.select(null); this.commit(`Open ${file.name}`); }
        else { const { groupLayer } = require_model(); const g = groupLayer(r.doc.layers, { name: file.name.replace(/\.psd$/i, '') }); this.insert(g, `Place ${file.name}`); }
        return;
      }
      const bm = await decodeImageBlob(file);
      const name = file.name.replace(/\.[^.]+$/, '') || 'Image';
      if (mode === 'open' || !this.doc.layers.length) {
        const key = this.session.assets.putBitmap(bm);
        this.session.doc = { ...createDocument(bm.width, bm.height, { background: null }), layers: [pixelLayer({ assetId: key }, bm.width, bm.height, { name })], paths: [] } as StudioDoc;
        this.activeId = this.flatIds()[0]; this.selectedIds = [this.activeId]; this.session.select(null); this.commit(`Open ${file.name}`);
      } else this.placeBitmap(bm, name);
    });
  }
  /** Place centred, scaled down to fit (Photoshop's Place Embedded). */
  placeBitmap(bm: Bitmap8, name = 'Placed', at?: { x: number; y: number }) {
    const W = this.doc.width, H = this.doc.height, s = Math.min(1, W / bm.width, H / bm.height);
    const x = at ? at.x - bm.width * s / 2 : (W - bm.width * s) / 2, y = at ? at.y - bm.height * s / 2 : (H - bm.height * s) / 2;
    return this.addPixelLayer(bm, { name, transform: [s, 0, 0, s, Math.round(x), Math.round(y)] }, `Place ${name}`);
  }
  async exportFlattened(format: 'png' | 'jpeg' | 'webp', quality = 0.92) { return this.session.exportFlattened({ format, quality }); }
  exportPsd() { return this.session.exportPsd(); }
  exportLayer(id: string) { return this.session.exportLayerPng(id); }
  /** Pixels of the selection (active layer, or merged) as a PNG blob + its doc rect. */
  async copyPixels(merged: boolean): Promise<{ blob: Blob; rect: Rect } | null> {
    const src = merged ? this.merged(1) : this.layerPixelsInDocSpace(this.activeId); if (!src) return null;
    const s = this.selection, b = s?.bounds || { x: 0, y: 0, width: src.width, height: src.height };
    const out = createBitmap(b.width, b.height);
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) { const si = ((y + b.y) * src.width + x + b.x) * 4, di = (y * b.width + x) * 4; out.data.set(src.data.subarray(si, si + 4), di); if (s) out.data[di + 3] = Math.round(out.data[di + 3] * s.data[(y + b.y) * s.width + x + b.x] / 255); }
    return { blob: new Blob([await encodePng(out) as BlobPart], { type: 'image/png' }), rect: b };
  }
  async pasteBlob(blob: Blob, at?: Rect) { const bm = await decodeImageBlob(blob); if (at && bm.width === at.width && bm.height === at.height) return this.addPixelLayer(bm, { name: 'Pasted', transform: [1, 0, 0, 1, at.x, at.y] }, 'Paste'); return this.placeBitmap(bm, 'Pasted'); }

  // ── Info ───────────────────────────────────────────────────────────────────────────────────
  sample(x: number, y: number, size: '3x3' | '5x5' | 'point' | '11x11' | '31x31' = 'point', merged = true) {
    if (x < 0 || y < 0 || x >= this.doc.width || y >= this.doc.height) return null;
    try { return this.session.sampleColor(x, y, size, merged, this.activeId || undefined); } catch { return null; }
  }
  histogram(layerId?: string) { if (layerId) return this.session.histogram(layerId); const sc = Math.min(1, 1024 / Math.max(this.doc.width, this.doc.height)); return histogramOf(this.merged(sc)); }
}

// ── helpers ────────────────────────────────────────────────────────────────────────────────
function collectKeys(doc: RasterDocument): Set<string> { const out = new Set<string>(); walkLayers(doc.layers, l => { if (l.kind === 'pixel' && l.asset.assetId) out.add(l.asset.assetId); if (l.mask?.kind === 'bitmap') out.add(l.mask.assetId); if (l.kind === 'fill' && l.fill.type === 'pattern') out.add(l.fill.assetId); }); return out; }
function writeTileInto(bm: Bitmap8, tx: number, ty: number, w: number, h: number, data: Uint8Array) { for (let y = 0; y < h; y++) bm.data.set(data.subarray(y * w * 4, (y + 1) * w * 4), ((ty * TILE + y) * bm.width + tx * TILE) * 4); }
/** Bilinear resample of a selection's coverage (quick select proxy ⇄ document). */
export function scaleSelection(s: Selection, w: number, h: number): Selection {
  const m = createMask(w, h), sx = s.width / w, sy = s.height / h;
  for (let y = 0; y < h; y++) { const fy = Math.max(0, (y + 0.5) * sy - 0.5), y0 = Math.floor(fy), y1 = Math.min(s.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) { const fx = Math.max(0, (x + 0.5) * sx - 0.5), x0 = Math.floor(fx), x1 = Math.min(s.width - 1, x0 + 1), tx = fx - x0, d = s.data, W = s.width;
      m.data[y * w + x] = Math.round((d[y0 * W + x0] * (1 - tx) + d[y0 * W + x1] * tx) * (1 - ty) + (d[y1 * W + x0] * (1 - tx) + d[y1 * W + x1] * tx) * ty); } }
  return { ...m, bounds: computeBounds(m) };
}
async function bitmapToDataUrl(bm: Bitmap8): Promise<string> { const blob = await encodeBitmap(bm, { format: 'png' }); return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
async function decodeAlphaUrl(url: string, w: number, h: number): Promise<Bitmap8> {
  const blob = await (await fetch(url)).blob(), ib = await createImageBitmap(blob), c = new OffscreenCanvas(w, h), g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  g.drawImage(ib, 0, 0, w, h); const id = g.getImageData(0, 0, w, h); return { width: w, height: h, data: id.data };
}
// Synchronous access to modules the main bundle already loaded (kept out of the top import list for clarity).
import * as modelModule from '../../../services/tela/raster/model';
import * as retouchModule from '../../../services/tela/raster/retouch';
import * as vectorModule from '../../../services/tela/raster/vectorPath';
const require_model = () => modelModule;
const require_retouch = () => retouchModule;
const require_vector = () => vectorModule;
export { transformedBounds, rectSelection, combine };
