// telaOps — the Tela op reducer + frame presets, shared by every surface that
// mutates a doc (TelaView canvas AND the reference-embed / flying-menu path).
//
// Every mutation flows through applyTelaOp over an id-based doc model, so the
// same op stream drives the studio, an in-feed embed, and (later) multiplayer.
// Extracted from TelaView (P2b) so the embed + flying menu never duplicate the
// reducer — one canonical code path, no drift.

import type {
  TelaBinding, TelaBlock, TelaDevice, TelaDoc, TelaField, TelaFrame,
  TelaFramePreset, TelaImageLayer, TelaRow, TelaVectorObject,
} from '../../types';

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
  | { type: 'MOVE_FRAME'; frameId: string; x: number; y: number }
  | { type: 'SET_FRAME_PRESET'; frameId: string; preset: TelaFramePreset }
  | { type: 'DELETE_FRAME'; frameId: string }
  | { type: 'SET_WRITER_BLOCKS'; deviceId: string; blocks: TelaBlock[] }
  | { type: 'SET_GRID_CELL'; deviceId: string; key: string; value: string }
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
  // ── Vector (SVG design) ops ─────────────────────────────────────────────────
  | { type: 'ADD_VECTOR_OBJECT'; deviceId: string; object: TelaVectorObject }
  | { type: 'UPDATE_VECTOR_OBJECT'; deviceId: string; objectId: string; patch: Partial<TelaVectorObject> }
  | { type: 'DELETE_VECTOR_OBJECT'; deviceId: string; objectId: string }
  | { type: 'REORDER_VECTOR_OBJECT'; deviceId: string; objectId: string; toIndex: number }
  // ── Image (raster) ops ──────────────────────────────────────────────────────
  | { type: 'ADD_IMAGE_LAYER'; deviceId: string; layer: TelaImageLayer }
  | { type: 'UPDATE_IMAGE_LAYER'; deviceId: string; layerId: string; patch: Partial<TelaImageLayer> }
  | { type: 'DELETE_IMAGE_LAYER'; deviceId: string; layerId: string }
  | { type: 'REORDER_IMAGE_LAYER'; deviceId: string; layerId: string; toIndex: number }
  // ── Binding graph ops ───────────────────────────────────────────────────────
  | { type: 'ADD_BINDING'; binding: TelaBinding }
  | { type: 'REMOVE_BINDING'; bindingId: string }
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
    case 'MOVE_FRAME':
      return { ...doc, frames: doc.frames.map(f => f.id === op.frameId ? { ...f, x: op.x, y: op.y } : f), updatedAt: now };
    case 'SET_FRAME_PRESET': {
      const p = PRESETS[op.preset];
      return { ...doc, frames: doc.frames.map(f => f.id === op.frameId ? { ...f, preset: op.preset, w: p.w, h: p.h } : f), updatedAt: now };
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
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, blocks: op.blocks } }, updatedAt: now };
    }
    case 'SET_GRID_CELL': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'GRID') return doc;
      const cells = { ...d.cells };
      if (op.value === '') delete cells[op.key]; else cells[op.key] = op.value;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, cells } }, updatedAt: now };
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

    // ── Image ─────────────────────────────────────────────────────────────────
    case 'ADD_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: [...d.layers, op.layer] } }, updatedAt: now };
    }
    case 'UPDATE_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: d.layers.map(l => l.id === op.layerId ? { ...l, ...op.patch } : l) } }, updatedAt: now };
    }
    case 'DELETE_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: d.layers.filter(l => l.id !== op.layerId) } }, updatedAt: now };
    }
    case 'REORDER_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: reorderById(d.layers, op.layerId, op.toIndex) } }, updatedAt: now };
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

    // ── Versioning ──────────────────────────────────────────────────────────────
    case 'SET_LOCKED':
      return { ...doc, locked: op.locked, updatedAt: now };
    case 'SET_CURRENT_VERSION':
      return { ...doc, currentVersionId: op.versionId, locked: op.locked ?? doc.locked, updatedAt: now };

    default:
      return doc;
  }
}
