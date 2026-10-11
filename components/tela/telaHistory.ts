// telaHistory — document-level undo/redo for every Tela surface.
//
// Docs are immutable (applyTelaOp returns a new doc and shares untouched
// devices), so a history entry is just the previous doc reference: memory cost
// is the changed path, not a copy. Bursts of the same edit (typing in one
// Writer, dragging one object, scrubbing one slider) coalesce into a single
// step so Ctrl+Z undoes a gesture, not a pixel.
//
// Publish state (locked / currentVersionId) is never part of history: undoing
// an edit must not un-publish a version, so restores keep the live values.

import type { TelaDoc } from '../../types';
import type { TelaOp } from './telaOps';

export interface TelaHistoryEntry { doc: TelaDoc; label: string }

export interface TelaHistory {
  past: TelaHistoryEntry[];
  future: TelaHistoryEntry[];
  /** Coalescing key + time of the last recorded op. */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 200;
/** Ops with the same key closer together than this merge into one undo step. */
export const COALESCE_MS = 900;

export const emptyHistory = (): TelaHistory => ({ past: [], future: [], lastKey: null, lastAt: 0 });

/** Ops that are not edits: they change publish state, not content. */
const UNRECORDED = new Set<TelaOp['type']>(['SET_LOCKED', 'SET_CURRENT_VERSION']);

/** Which ops count as "the same gesture". Null = always its own step. */
export function coalesceKey(op: TelaOp): string | null {
  switch (op.type) {
    case 'SET_WRITER_BLOCKS': return `writer:${op.deviceId}`;
    case 'WRITER_EDIT': return op.coalesce ? `writer:${op.deviceId}:${op.coalesce}` : null;
    case 'UPDATE_NOTES_DEVICE': return `notes:${op.deviceId}`;
    case 'SET_GRID_CELL': return `cell:${op.deviceId}:${op.key}`;
    case 'GRID_WORKBOOK': return op.coalesce ? `gridwb:${op.deviceId}:${op.coalesce}` : null;
    case 'SET_BASE_CELL': return `base:${op.deviceId}:${op.rowId}:${op.fieldId}`;
    case 'MOVE_FRAME': return `move:${op.frameId}`;
    case 'RESIZE_FRAME': return `resize:${op.frameId}`;
    case 'RENAME_FRAME': return `rename:${op.frameId}`;
    case 'SET_TITLE': return 'title';
    case 'UPDATE_VECTOR_OBJECT': return `vec:${op.deviceId}:${op.objectId}:${Object.keys(op.patch).sort().join(',')}`;
    case 'EDIT_VECTOR_DEVICE': return op.coalesce ? `vedit:${op.deviceId}:${op.coalesce}` : null;
    case 'UPDATE_IMAGE_LAYER': return `img:${op.deviceId}:${op.layerId}:${Object.keys(op.patch).sort().join(',')}`;
    case 'UPDATE_IMAGE_GROUP': return `grp:${op.deviceId}:${op.groupId}:${Object.keys(op.patch).sort().join(',')}`;
    case 'UPDATE_CHART_DEVICE': return `chart:${op.deviceId}:${Object.keys(op.patch).sort().join(',')}`;
    case 'UPDATE_FORM_DEVICE': return `form:${op.deviceId}:${Object.keys(op.patch).sort().join(',')}`;
    case 'UPDATE_BASE_FIELD': return `field:${op.deviceId}:${op.fieldId}`;
    case 'SET_LIVING_PAGE': return `living:${op.page.page}`;
    case 'SET_IMAGE_RASTER': return op.coalesce ? `raster:${op.deviceId}:${op.coalesce}` : null;
    default: return null;
  }
}

const LABELS: Partial<Record<TelaOp['type'], string>> = {
  SET_WRITER_BLOCKS: 'Typing', SET_GRID_CELL: 'Cell edit', MOVE_FRAME: 'Move page', RESIZE_FRAME: 'Resize page',
  ADD_FRAME: 'Add page', DELETE_FRAME: 'Delete page', ADD_VECTOR_OBJECT: 'Add object', UPDATE_VECTOR_OBJECT: 'Edit object',
  DELETE_VECTOR_OBJECT: 'Delete object', REORDER_VECTOR_OBJECT: 'Arrange', REPLACE_VECTOR_OBJECTS: 'Edit artwork',
  ADD_IMAGE_LAYER: 'Add layer', UPDATE_IMAGE_LAYER: 'Edit layer', DELETE_IMAGE_LAYER: 'Delete layer', REORDER_IMAGE_LAYER: 'Arrange layers',
  ADD_BINDING: 'Bind', REMOVE_BINDING: 'Unbind', SET_LIVING_PAGE: 'Edit behaviours', SET_TITLE: 'Rename',
};

export const opLabel = (op: TelaOp): string => (op.type === 'WRITER_EDIT' && op.label) || (op.type === 'SET_IMAGE_RASTER' && op.label) || (op.type === 'EDIT_VECTOR_DEVICE' && op.label) || (op.type === 'GRID_WORKBOOK' && op.label) || LABELS[op.type] || op.type.toLowerCase().replace(/_/g, ' ');

/**
 * Record that `before` is about to become the result of `op`. Returns the
 * next history (unchanged reference when the op is unrecorded or merges into
 * the current step).
 */
export function recordOp(h: TelaHistory, before: TelaDoc, op: TelaOp, now = Date.now()): TelaHistory {
  if (UNRECORDED.has(op.type)) return h;
  // Image Studio persistence only swaps runtime asset keys for stored ids — not an edit.
  if (op.type === 'SET_IMAGE_RASTER' && op.persistOnly) return h;
  // Grid cached-value / legacy-view refreshes are derived data, not edits.
  if (op.type === 'GRID_WORKBOOK' && op.cacheOnly) return h;
  const key = coalesceKey(op);
  if (key && key === h.lastKey && now - h.lastAt < COALESCE_MS && h.past.length) {
    return { ...h, lastAt: now, future: [] };
  }
  const past = [...h.past, { doc: before, label: opLabel(op) }];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [], lastKey: key, lastAt: now };
}

/** Record a whole-doc replacement (auto-format, import into the open doc, Aria rewrite). */
export function recordReplace(h: TelaHistory, before: TelaDoc, label: string): TelaHistory {
  const past = [...h.past, { doc: before, label }];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [], lastKey: null, lastAt: 0 };
}

/** Keep live publish state when restoring an older snapshot. */
const withLivePublishState = (restored: TelaDoc, live: TelaDoc): TelaDoc =>
  ({ ...restored, locked: live.locked, currentVersionId: live.currentVersionId, updatedAt: Date.now() });

export function undo(h: TelaHistory, current: TelaDoc): { history: TelaHistory; doc: TelaDoc; label: string } | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, { doc: current, label: entry.label }], lastKey: null, lastAt: 0 },
    doc: withLivePublishState(entry.doc, current),
    label: entry.label,
  };
}

export function redo(h: TelaHistory, current: TelaDoc): { history: TelaHistory; doc: TelaDoc; label: string } | null {
  const entry = h.future[h.future.length - 1];
  if (!entry) return null;
  return {
    history: { past: [...h.past, { doc: current, label: entry.label }], future: h.future.slice(0, -1), lastKey: null, lastAt: 0 },
    doc: withLivePublishState(entry.doc, current),
    label: entry.label,
  };
}

/** Break coalescing so the next op starts a fresh step (pointer-up, blur). */
export const sealStep = (h: TelaHistory): TelaHistory => (h.lastKey ? { ...h, lastKey: null } : h);

/** True when focus is in a field whose own native undo should win (not doc-bound text). */
export function isNativeUndoTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.closest?.('[data-tela-undo="native"]')) return true;
  return false;
}
