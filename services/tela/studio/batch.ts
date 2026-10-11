// studio/batch — turn an edit (before → after object lists) into ONE document op.
//
// Why: the old editor dispatched a full-document update on every pointer move. The Studio
// previews gestures locally and commits once; this module decides the smallest faithful op:
// per-object patches when only some objects changed in place, the full list when objects
// were added, removed or reordered. Either way it is one EDIT_VECTOR_DEVICE op = one undo
// step, and clip groups are re-synced so masks always follow their art.
import type { TelaVectorObject } from '../../../types';
import type { TelaStudioDeviceExt } from './model';
import { syncClips } from './structure';

export interface VectorEdit {
  type: 'EDIT_VECTOR_DEVICE'; deviceId: string;
  objects?: TelaVectorObject[]; patches?: Record<string, Partial<TelaVectorObject>>;
  studio?: TelaStudioDeviceExt; size?: { width: number; height: number }; label?: string; coalesce?: string;
}

/** Shallow per-key patch from a to b (keys removed in b become undefined). */
export function objectPatch(a: TelaVectorObject, b: TelaVectorObject): Partial<TelaVectorObject> | null {
  if (a === b) return null;
  const patch: Record<string, unknown> = {}; let n = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) { const va = (a as unknown as Record<string, unknown>)[k], vb = (b as unknown as Record<string, unknown>)[k]; if (va !== vb) { patch[k] = vb; n++; } }
  return n ? patch as Partial<TelaVectorObject> : null;
}

/** Same ids in the same order? */
export function sameOrder(a: TelaVectorObject[], b: TelaVectorObject[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
  return true;
}

/**
 * The op for an edit, or null when nothing changed. Clips are synced against `groups`
 * (pass the device's studio groups, or the new ones if the edit changed them).
 */
export function editOp(deviceId: string, before: TelaVectorObject[], after: TelaVectorObject[], o: { studio?: TelaStudioDeviceExt; prevStudio?: TelaStudioDeviceExt; label?: string; coalesce?: string; size?: { width: number; height: number } } = {}): VectorEdit | null {
  const groups = (o.studio ?? o.prevStudio)?.groups ?? {};
  const synced = syncClips(after, groups);
  const studioChanged = !!o.studio && o.studio !== o.prevStudio;
  if (!sameOrder(before, synced)) return { type: 'EDIT_VECTOR_DEVICE', deviceId, objects: synced, studio: studioChanged ? o.studio : undefined, label: o.label, coalesce: o.coalesce, size: o.size };
  const patches: Record<string, Partial<TelaVectorObject>> = {}; let n = 0;
  for (let i = 0; i < before.length; i++) { const p = objectPatch(before[i], synced[i]); if (p) { patches[before[i].id] = p; n++; } }
  if (!n && !studioChanged && !o.size) return null;
  // Patching most of a big document is no cheaper than replacing it.
  if (n > before.length * .6 && n > 50) return { type: 'EDIT_VECTOR_DEVICE', deviceId, objects: synced, studio: studioChanged ? o.studio : undefined, label: o.label, coalesce: o.coalesce, size: o.size };
  return { type: 'EDIT_VECTOR_DEVICE', deviceId, patches: n ? patches : undefined, studio: studioChanged ? o.studio : undefined, label: o.label, coalesce: o.coalesce, size: o.size };
}

/** Apply an op locally (tests, previews) exactly as telaOps does. */
export function applyEdit(objects: TelaVectorObject[], op: VectorEdit): TelaVectorObject[] {
  let out = op.objects ?? objects;
  if (op.patches) { const P = op.patches; out = out.map(x => P[x.id] ? { ...x, ...P[x.id] } : x); }
  return out;
}

/**
 * rAF batcher for pointer streams: many `push`es per frame → one `flush(latest)` per frame,
 * plus a final flush on `end()`. Used by the canvas for previews that need React state.
 */
export function frameBatcher<T>(flush: (v: T) => void, raf: (cb: () => void) => unknown = (cb) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : setTimeout(cb, 16))) {
  let pending: { v: T } | null = null; let scheduled = false; let count = 0;
  const run = () => { scheduled = false; if (pending) { const v = pending.v; pending = null; count++; flush(v); } };
  return {
    push(v: T) { pending = { v }; if (!scheduled) { scheduled = true; raf(run); } },
    end() { run(); },
    get flushes() { return count; },
  };
}
