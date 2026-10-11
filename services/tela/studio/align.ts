// studio/align — Align & Distribute panel on Tela objects (selection, key object or artboard;
// geometric or visual bounds; distribute by edges/centres or by exact spacing).
// Groups move as units: alignment treats each selection unit (a group, a symbol instance)
// as one item, like Illustrator.
import type { TelaVectorObject } from '../../../types';
import type { Rect } from '../geometry/vec';
import { align, distribute, type AlignH, type AlignV, type AlignTo, type DistributeMode, type Alignable } from '../geometry/transform';
import { boundsOf, translateObject, unionBounds } from './objectGeom';

export interface AlignTarget { to: AlignTo; keyId?: string | null; artboard: Rect; useVisual?: boolean }

/** Selection units: an array of object-id lists (each group / instance is one unit). */
export type Units = string[][];

function items(objects: TelaVectorObject[], units: Units, useVisual: boolean): Alignable[] {
  const byId = new Map(objects.map(o => [o.id, o]));
  return units.map(u => {
    const os = u.map(id => byId.get(id)).filter((o): o is TelaVectorObject => !!o);
    const bounds = unionBounds(os.map(boundsOf)) ?? { x: 0, y: 0, w: 0, h: 0 };
    const sw = useVisual ? Math.max(0, ...os.map(o => o.stroke !== 'none' ? o.strokeWidth / 2 : 0)) : 0;
    return { id: u[0], bounds, visual: { x: bounds.x - sw, y: bounds.y - sw, w: bounds.w + sw * 2, h: bounds.h + sw * 2 } };
  });
}
function applyDeltas(objects: TelaVectorObject[], units: Units, d: Record<string, { x: number; y: number }>): TelaVectorObject[] {
  const delta = new Map<string, { x: number; y: number }>();
  for (const u of units) { const v = d[u[0]]; if (v && (v.x || v.y)) for (const id of u) delta.set(id, v); }
  if (!delta.size) return objects;
  return objects.map(o => { const v = delta.get(o.id); return v && !o.locked ? translateObject(o, v.x, v.y) : o; });
}
const keyUnit = (units: Units, keyId?: string | null) => keyId ? units.find(u => u.includes(keyId))?.[0] : undefined;

export function alignObjects(objects: TelaVectorObject[], units: Units, h: AlignH | null, v: AlignV | null, t: AlignTarget): TelaVectorObject[] {
  const to: AlignTo = units.length === 1 && t.to === 'selection' ? 'artboard' : t.to;
  const d = align(items(objects, units, !!t.useVisual), h, v, { to, keyId: keyUnit(units, t.keyId), artboard: t.artboard, useVisual: t.useVisual });
  return applyDeltas(objects, units, d);
}
export function distributeObjects(objects: TelaVectorObject[], units: Units, mode: DistributeMode, t: AlignTarget & { spacing?: number }): TelaVectorObject[] {
  const d = distribute(items(objects, units, !!t.useVisual), mode, { to: t.to, keyId: keyUnit(units, t.keyId), artboard: t.artboard, useVisual: t.useVisual, spacing: t.spacing });
  return applyDeltas(objects, units, d);
}
export type { AlignH, AlignV, AlignTo, DistributeMode };
