// telaOps — the Tela op reducer + frame presets, shared by every surface that
// mutates a doc (TelaView canvas AND the reference-embed / flying-menu path).
//
// Every mutation flows through applyTelaOp over an id-based doc model, so the
// same op stream drives the studio, an in-feed embed, and (later) multiplayer.
// Extracted from TelaView (P2b) so the embed + flying menu never duplicate the
// reducer — one canonical code path, no drift.

import type {
  TelaBinding, TelaBlock, TelaDevice, TelaDoc, TelaField, TelaFrame,
  TelaFramePreset, TelaImageLayer, TelaImageLayerGroup, TelaNotesDevice, TelaRow, TelaVectorObject,
} from '../../types';
import type { LivingBook, LivingPage } from '../../services/living/contracts';
import { setLivingPage } from '../../services/living/authoring/livingDoc';
import { applyLegacyBlocks, applyWriterEdit } from './writer/writerModel';
import type { RasterDocument } from '../../services/tela/raster/model';
import type { TelaImageRasterPreview } from '../../types';
import { mirrorLegacyAdd, mirrorLegacyDelete, mirrorLegacyUpdate } from './image/rasterLegacyBridge';
import { setCellInput as gridSetCellInput, type Workbook as GridWorkbook } from '../../services/tela/sheet';

// ── Presets ───────────────────────────────────────────────────────────────────
// CSS px at 96dpi, so 816px prints as exactly 8.5in via @page.

export const PRESETS: Record<TelaFramePreset, { w: number; h: number; label: string; page?: string }> = {
  LETTER:            { w: 816,  h: 1056, label: 'Letter 8.5×11″', page: '8.5in 11in' },
  A4:                { w: 794,  h: 1123, label: 'A4 210×297mm',   page: '210mm 297mm' },
  BOOKLET:           { w: 528,  h: 816,  label: 'Booklet 5.5×8.5″', page: '5.5in 8.5in' },
  SIGNAGE_1080x1920: { w: 1080, h: 1920, label: 'Signage 1080×1920' },
  PHONE:             { w: 390,  h: 844,  label: 'Phone 390×844' },
  SQUARE:            { w: 1080, h: 1080, label: 'Square 1080' },
  FREE:              { w: 760,  h: 440,  label: 'Free' },
};

// ── Ops — every mutation flows through here (CRDT-friendly shape) ─────────────

export type TelaOp =
  | { type: 'SET_TITLE'; title: string }
  | { type: 'ADD_FRAME'; frame: TelaFrame; devices: TelaDevice[] }
  | { type: 'ADD_DEVICES_TO_FRAME'; frameId: string; devices: TelaDevice[] }
  | { type: 'MOVE_FRAME'; frameId: string; x: number; y: number }
  | { type: 'RESIZE_FRAME'; frameId: string; w: number; h: number }
  | { type: 'RENAME_FRAME'; frameId: string; label: string }
  | { type: 'SET_FRAME_PRESET'; frameId: string; preset: TelaFramePreset }
  | { type: 'SET_FRAME_ORIENTATION'; frameId: string; orientation: 'PORTRAIT' | 'LANDSCAPE' }
  /** Print production (services/print): the job spec; `resizeFrameIds` snaps those pages to the trim size. */
  | { type: 'SET_PRINT_SPEC'; spec: import('../../services/print/types').DocPrintSpec | null; resizeFrameIds?: string[] }
  | { type: 'DELETE_FRAME'; frameId: string }
  | { type: 'SET_WRITER_BLOCKS'; deviceId: string; blocks: TelaBlock[] }
  /** Writer document edit (text engine): serialisable WriterOps on the story / document parts.
   *  Typing bursts in one story share `coalesce` so undo takes back a burst, not a keystroke. */
  | { type: 'WRITER_EDIT'; deviceId: string; ops: import('../../services/text/document/ops').WriterOp[]; label?: string; coalesce?: string | null }
  | { type: 'UPDATE_NOTES_DEVICE'; deviceId: string; patch: Partial<TelaNotesDevice> }
  | { type: 'SET_GRID_CELL'; deviceId: string; key: string; value: string }
  // Grid workbook (sheet engine): the whole immutable workbook after one user
  // action (edit, paste, sort…). Workbooks share untouched rows, so this is a
  // pointer swap, and history keeps one doc per action. `cells/rows/cols` carry
  // the derived legacy view; `cacheOnly` marks a cached-values refresh that is
  // not an edit (never recorded in undo history).
  | { type: 'GRID_WORKBOOK'; deviceId: string; workbook: GridWorkbook; cells?: Record<string, string>; rows?: number; cols?: number; label?: string; coalesce?: string; cacheOnly?: boolean }
  // ── Base (database) ops ────────────────────────────────────────────────────
  | { type: 'ADD_BASE_FIELD'; deviceId: string; field: TelaField }
  | { type: 'UPDATE_BASE_FIELD'; deviceId: string; fieldId: string; patch: Partial<TelaField> }
  | { type: 'DELETE_BASE_FIELD'; deviceId: string; fieldId: string }
  | { type: 'ADD_BASE_ROW'; deviceId: string; row: TelaRow }
  | { type: 'SET_BASE_CELL'; deviceId: string; rowId: string; fieldId: string; value: string }
  | { type: 'DELETE_BASE_ROW'; deviceId: string; rowId: string }
  /** Re-sync a binding's derived rows — replaces only rows tagged with it,
   *  leaving every manual (user-entered) row untouched. */
  | { type: 'REPLACE_DERIVED_ROWS'; deviceId: string; bindingId: string; rows: TelaRow[] }
  // ── Form ops ────────────────────────────────────────────────────────────────
  | { type: 'SET_FORM_BASE'; deviceId: string; baseDeviceId: string }
  | { type: 'UPDATE_FORM_DEVICE'; deviceId: string; patch: Partial<Extract<TelaDevice, { type: 'FORM' }>> }
  | { type: 'UPDATE_CHART_DEVICE'; deviceId: string; patch: Partial<Extract<TelaDevice, { type: 'CHART' }>> }
  // ── Vector (SVG design) ops ─────────────────────────────────────────────────
  | { type: 'ADD_VECTOR_OBJECT'; deviceId: string; object: TelaVectorObject }
  | { type: 'UPDATE_VECTOR_OBJECT'; deviceId: string; objectId: string; patch: Partial<TelaVectorObject> }
  | { type: 'DELETE_VECTOR_OBJECT'; deviceId: string; objectId: string }
  | { type: 'REORDER_VECTOR_OBJECT'; deviceId: string; objectId: string; toIndex: number }
  | { type: 'REPLACE_VECTOR_OBJECTS'; deviceId: string; objects: TelaVectorObject[] }
  /** Studio vector editor: one atomic, single-undo-step edit of a vector device — a full object
   *  list OR per-object patches, plus optional device-level Studio data (groups, symbols,
   *  swatches…). `coalesce` merges a scrub (slider, live drag) into one step; `label` names it. */
  | { type: 'EDIT_VECTOR_DEVICE'; deviceId: string; objects?: TelaVectorObject[]; patches?: Record<string, Partial<TelaVectorObject>>; studio?: import('../../services/tela/studio/model').TelaStudioDeviceExt; size?: { width: number; height: number }; label?: string; coalesce?: string }
  // ── Image (raster) ops ──────────────────────────────────────────────────────
  | { type: 'ADD_IMAGE_LAYER'; deviceId: string; layer: TelaImageLayer }
  | { type: 'UPDATE_IMAGE_LAYER'; deviceId: string; layerId: string; patch: Partial<TelaImageLayer> }
  | { type: 'DELETE_IMAGE_LAYER'; deviceId: string; layerId: string }
  | { type: 'REORDER_IMAGE_LAYER'; deviceId: string; layerId: string; toIndex: number }
  | { type: 'ADD_IMAGE_GROUP'; deviceId: string; group: TelaImageLayerGroup }
  | { type: 'UPDATE_IMAGE_GROUP'; deviceId: string; groupId: string; patch: Partial<TelaImageLayerGroup> }
  | { type: 'DELETE_IMAGE_GROUP'; deviceId: string; groupId: string }
  /** Image Studio: the raster document (source of truth) + its pixel-history rev. `persistOnly` swaps runtime asset keys for stored ids and is not an undo step. */
  | { type: 'SET_IMAGE_RASTER'; deviceId: string; raster: RasterDocument | undefined; rev?: string; preview?: TelaImageRasterPreview | null; label?: string; coalesce?: string; persistOnly?: boolean }
  // ── Binding graph ops ───────────────────────────────────────────────────────
  | { type: 'ADD_BINDING'; binding: TelaBinding }
  | { type: 'REMOVE_BINDING'; bindingId: string }
  // ── Living layer (behaviours, scores, narration): one page at a time, or the whole book (JSON import) ──
  | { type: 'SET_LIVING_PAGE'; page: LivingPage }
  | { type: 'SET_LIVING_BOOK'; living: LivingBook | undefined }
  // ── Versioning (P2b) — lock/unlock is a doc-level mutation ───────────────────
  | { type: 'SET_LOCKED'; locked: boolean }
  | { type: 'SET_CURRENT_VERSION'; versionId: string; locked?: boolean };

/** Move the id-matched item to `toIndex` (id-stable reorder for arrays). */
function reorderById<T extends { id: string }>(list: T[], id: string, toIndex: number): T[] {
  const from = list.findIndex(x => x.id === id);
  if (from < 0) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(list.length - 1, toIndex)), 0, item);
  return next;
}

export function applyTelaOp(doc: TelaDoc, op: TelaOp): TelaDoc {
  const now = Date.now();
  switch (op.type) {
    case 'SET_TITLE':
      return { ...doc, title: op.title, updatedAt: now };
    case 'ADD_FRAME': {
      const devices = { ...doc.devices };
      for (const d of op.devices) devices[d.id] = d;
      return { ...doc, frames: [...doc.frames, op.frame], devices, updatedAt: now };
    }
    case 'ADD_DEVICES_TO_FRAME': {
      const devices = { ...doc.devices };
      for (const device of op.devices) devices[device.id] = device;
      const ids = op.devices.map(device => device.id);
      return { ...doc, frames: doc.frames.map(frame => frame.id === op.frameId ? { ...frame, deviceIds: [...frame.deviceIds.filter(id => !ids.includes(id)), ...ids] } : frame), devices, updatedAt: now };
    }
    case 'RESIZE_FRAME':
      return { ...doc, frames: doc.frames.map(f => f.id === op.frameId ? { ...f, w: Math.max(80, Math.round(op.w)), h: Math.max(40, Math.round(op.h)) } : f), updatedAt: now };
    case 'MOVE_FRAME':
      return { ...doc, frames: doc.frames.map(f => f.id === op.frameId ? { ...f, x: op.x, y: op.y } : f), updatedAt: now };
    case 'RENAME_FRAME':
      return { ...doc, frames: doc.frames.map(f => f.id === op.frameId ? { ...f, label: op.label } : f), updatedAt: now };
    case 'SET_FRAME_PRESET': {
      const p = PRESETS[op.preset];
      const frame = doc.frames.find(item => item.id === op.frameId); if (!frame) return doc;
      const w = frame.orientation === 'LANDSCAPE' ? Math.max(p.w, p.h) : frame.orientation === 'PORTRAIT' ? Math.min(p.w, p.h) : p.w;
      const h = frame.orientation === 'LANDSCAPE' ? Math.min(p.w, p.h) : frame.orientation === 'PORTRAIT' ? Math.max(p.w, p.h) : p.h;
      const devices = { ...doc.devices };
      for (const id of frame.deviceIds) { const device = devices[id]; if (device?.type === 'VECTOR' || device?.type === 'IMAGE' || device?.type === 'CHART') devices[id] = { ...device, width: w, height: h }; }
      return { ...doc, frames: doc.frames.map(item => item.id === op.frameId ? { ...item, preset: op.preset, w, h } : item), devices, updatedAt: now };
    }
    case 'SET_FRAME_ORIENTATION': {
      const frame = doc.frames.find(item => item.id === op.frameId); if (!frame) return doc;
      const p = PRESETS[frame.preset];
      const w = op.orientation === 'LANDSCAPE' ? Math.max(p.w, p.h) : Math.min(p.w, p.h);
      const h = op.orientation === 'LANDSCAPE' ? Math.min(p.w, p.h) : Math.max(p.w, p.h);
      const devices = { ...doc.devices };
      for (const id of frame.deviceIds) { const device = devices[id]; if (device?.type === 'VECTOR' || device?.type === 'IMAGE' || device?.type === 'CHART') devices[id] = { ...device, width: w, height: h }; }
      return { ...doc, frames: doc.frames.map(item => item.id === op.frameId ? { ...item, orientation: op.orientation, w, h } : item), devices, updatedAt: now };
    }
    case 'SET_PRINT_SPEC': {
      if (!op.spec) { const { print: _drop, ...rest } = doc; return { ...rest, updatedAt: now }; }
      const ids = new Set(op.resizeFrameIds || []);
      if (!ids.size) return { ...doc, print: op.spec, updatedAt: now };
      const w = Math.round(op.spec.trimIn[0] * 96), h = Math.round(op.spec.trimIn[1] * 96);
      const devices = { ...doc.devices };
      const frames = doc.frames.map(frame => {
        if (!ids.has(frame.id)) return frame;
        for (const id of frame.deviceIds) { const device = devices[id]; if (device?.type === 'VECTOR' || device?.type === 'IMAGE' || device?.type === 'CHART') devices[id] = { ...device, width: w, height: h }; }
        return { ...frame, kind: 'PAPER' as const, preset: 'FREE' as const, w, h, orientation: w > h ? 'LANDSCAPE' as const : 'PORTRAIT' as const };
      });
      return { ...doc, print: op.spec, frames, devices, updatedAt: now };
    }
    case 'DELETE_FRAME': {
      const frame = doc.frames.find(f => f.id === op.frameId);
      const devices = { ...doc.devices };
      for (const id of frame?.deviceIds || []) delete devices[id];
      return { ...doc, frames: doc.frames.filter(f => f.id !== op.frameId), devices, updatedAt: now };
    }
    case 'SET_WRITER_BLOCKS': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'WRITER') return doc;
      // Story-backed Writers fold legacy block edits (metadata, Aria, flying menu) into the story.
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: d.story ? applyLegacyBlocks(d, op.blocks) : { ...d, blocks: op.blocks } }, updatedAt: now };
    }
    case 'WRITER_EDIT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'WRITER' || !op.ops.length) return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: applyWriterEdit(d, op.ops) }, updatedAt: now };
    }
    case 'UPDATE_NOTES_DEVICE': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'NOTES') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, ...op.patch, id: d.id, type: 'NOTES' } }, updatedAt: now };
    }
    case 'SET_GRID_CELL': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'GRID') return doc;
      const cells = { ...d.cells };
      if (op.value === '') delete cells[op.key]; else cells[op.key] = op.value;
      // Workbook-backed grids: the legacy key addresses sheet 1 of the workbook.
      let workbook = d.workbook;
      if (workbook?.sheets[0]) { try { workbook = gridSetCellInput(workbook, workbook.sheets[0].id, op.key, op.value).workbook; } catch { /* bad key: legacy view only */ } }
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, cells, ...(workbook ? { workbook } : {}) } }, updatedAt: now };
    }
    case 'GRID_WORKBOOK': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'GRID') return doc;
      if (d.workbook === op.workbook && !op.cells) return doc;
      const next = { ...d, workbook: op.workbook, ...(op.cells ? { cells: op.cells } : {}), ...(op.rows ? { rows: op.rows } : {}), ...(op.cols ? { cols: op.cols } : {}) };
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: next }, updatedAt: now };
    }

    // ── Base ────────────────────────────────────────────────────────────────
    case 'ADD_BASE_FIELD': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, fields: [...d.fields, op.field] } }, updatedAt: now };
    }
    case 'UPDATE_BASE_FIELD': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, fields: d.fields.map(f => f.id === op.fieldId ? { ...f, ...op.patch } : f) } }, updatedAt: now };
    }
    case 'DELETE_BASE_FIELD': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      const rows = d.rows.map(r => {
        if (!(op.fieldId in r.values)) return r;
        const values = { ...r.values }; delete values[op.fieldId];
        return { ...r, values };
      });
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, fields: d.fields.filter(f => f.id !== op.fieldId), rows } }, updatedAt: now };
    }
    case 'ADD_BASE_ROW': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows: [...d.rows, op.row] } }, updatedAt: now };
    }
    case 'SET_BASE_CELL': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      const rows = d.rows.map(r => {
        if (r.id !== op.rowId) return r;
        const values = { ...r.values };
        if (op.value === '') delete values[op.fieldId]; else values[op.fieldId] = op.value;
        return { ...r, values };
      });
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows } }, updatedAt: now };
    }
    case 'DELETE_BASE_ROW': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows: d.rows.filter(r => r.id !== op.rowId) } }, updatedAt: now };
    }
    case 'REPLACE_DERIVED_ROWS': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      // Manual rows (and rows from OTHER bindings) stay exactly as they are.
      const kept = d.rows.filter(r => r.derivedFromBindingId !== op.bindingId);
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows: [...kept, ...op.rows] } }, updatedAt: now };
    }

    // ── Form ────────────────────────────────────────────────────────────────
    case 'SET_FORM_BASE': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'FORM') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, baseDeviceId: op.baseDeviceId } }, updatedAt: now };
    }
    case 'UPDATE_FORM_DEVICE': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'FORM') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, ...op.patch, id: d.id, type: 'FORM' } }, updatedAt: now };
    }
    case 'UPDATE_CHART_DEVICE': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'CHART') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, ...op.patch, id:d.id, type:'CHART' } }, updatedAt: now };
    }

    // ── Vector ────────────────────────────────────────────────────────────────
    case 'ADD_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: [...d.objects, op.object] } }, updatedAt: now };
    }
    case 'UPDATE_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: d.objects.map(o => o.id === op.objectId ? { ...o, ...op.patch } : o) } }, updatedAt: now };
    }
    case 'DELETE_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: d.objects.filter(o => o.id !== op.objectId) } }, updatedAt: now };
    }
    case 'REORDER_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: reorderById(d.objects, op.objectId, op.toIndex) } }, updatedAt: now };
    }
    case 'EDIT_VECTOR_DEVICE': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      let objects = op.objects ?? d.objects;
      if (op.patches) { const P = op.patches; objects = objects.map(o => P[o.id] ? { ...o, ...P[o.id] } : o); }
      const next = { ...d, objects, ...(op.studio ? { studio: op.studio } : {}), ...(op.size ? { width: op.size.width, height: op.size.height } : {}) };
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: next }, updatedAt: now };
    }
    case 'REPLACE_VECTOR_OBJECTS': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: op.objects, trace: d.trace ? { ...d.trace, pathCount: op.objects.length } : d.trace } }, updatedAt: now };
    }

    // ── Image ─────────────────────────────────────────────────────────────────
    case 'ADD_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: [...d.layers, op.layer], ...mirrorLegacyAdd(d, op.layer) } }, updatedAt: now };
    }
    case 'UPDATE_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: d.layers.map(l => l.id === op.layerId ? { ...l, ...op.patch } : l), ...mirrorLegacyUpdate(d, op.layerId, op.patch) } }, updatedAt: now };
    }
    case 'DELETE_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: d.layers.filter(l => l.id !== op.layerId), ...mirrorLegacyDelete(d, op.layerId) } }, updatedAt: now };
    }
    case 'REORDER_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: reorderById(d.layers, op.layerId, op.toIndex) } }, updatedAt: now };
    }
    case 'ADD_IMAGE_GROUP': {
      const d = doc.devices[op.deviceId]; if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, groups: [...(d.groups || []), op.group] } }, updatedAt: now };
    }
    case 'UPDATE_IMAGE_GROUP': {
      const d = doc.devices[op.deviceId]; if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, groups: (d.groups || []).map(group => group.id === op.groupId ? { ...group, ...op.patch } : group) } }, updatedAt: now };
    }
    case 'DELETE_IMAGE_GROUP': {
      const d = doc.devices[op.deviceId]; if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, groups: (d.groups || []).filter(group => group.id !== op.groupId), layers: d.layers.map(layer => layer.groupId === op.groupId ? { ...layer, groupId: undefined } : layer) } }, updatedAt: now };
    }

    case 'SET_IMAGE_RASTER': {
      const d = doc.devices[op.deviceId]; if (!d || d.type !== 'IMAGE') return doc;
      const next = { ...d, raster: op.raster, rasterRev: op.rev };
      if (op.preview !== undefined) { if (op.preview) next.rasterPreview = op.preview; else delete next.rasterPreview; }
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: next }, updatedAt: now };
    }

    // ── Binding graph ─────────────────────────────────────────────────────────
    case 'ADD_BINDING':
      return { ...doc, bindings: [...(doc.bindings ?? []), op.binding], updatedAt: now };
    case 'REMOVE_BINDING': {
      const bindings = (doc.bindings ?? []).filter(b => b.id !== op.bindingId);
      // Drop any rows this binding derived, so removing a link cleans up after itself.
      const devices = { ...doc.devices };
      for (const id in devices) {
        const dv = devices[id];
        if (dv.type === 'BASE' && dv.rows.some(r => r.derivedFromBindingId === op.bindingId)) {
          devices[id] = { ...dv, rows: dv.rows.filter(r => r.derivedFromBindingId !== op.bindingId) };
        }
      }
      return { ...doc, bindings, devices, updatedAt: now };
    }

    // ── Living layer ────────────────────────────────────────────────────────────
    case 'SET_LIVING_PAGE':
      return { ...doc, living: setLivingPage(doc.living, op.page, doc.id), updatedAt: now };
    case 'SET_LIVING_BOOK':
      return { ...doc, living: op.living, updatedAt: now };

    // ── Versioning ──────────────────────────────────────────────────────────────
    case 'SET_LOCKED':
      return { ...doc, locked: op.locked, updatedAt: now };
    case 'SET_CURRENT_VERSION':
      return { ...doc, currentVersionId: op.versionId, locked: op.locked ?? doc.locked, updatedAt: now };

    default:
      return doc;
  }
}
