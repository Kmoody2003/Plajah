// One-click starting points the guide offers: a lot with its setback lines, and an outside shell of
// walls. Both come out as ordinary entities, so everything after them is normal drafting.

import type { CadModel, CadEntity2D } from '../model';
import { MM_PER_UNIT } from '../model';
import { addEntities, wallsFrom, insertBlock } from '../draft';
import { itemById, defaultParams, makeBlock, ensureBlockAndLayer } from '../library';
import { wallAt, addOpening } from '../walls';

type P = [number, number];
const upmOf = (m: CadModel) => 1 / (MM_PER_UNIT[m.units] || 1);

const ensureLayers = (m: CadModel, layers: Array<{ name: string; color: string }>): CadModel => {
  const have = new Set(m.layers.map(l => l.name)); const add = layers.filter(l => !have.has(l.name)).map(l => ({ ...l, visible: true }));
  return add.length ? { ...m, layers: [...m.layers, ...add] } : m;
};

export interface LotSpec { width: number; depth: number; front: number; side: number; rear: number } // mm

/** Property line plus the buildable area inside the setbacks, with labels. Origin is the lot's front-left corner. */
export function addLot(m: CadModel, s: LotSpec): CadModel {
  const u = upmOf(m); const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const poly = (layer: string, pts: P[]): CadEntity2D => ({ type: 'polyline', layer, points: pts.map(p => [p[0] * u, p[1] * u, 0]), closed: true });
  const text = (layer: string, at: P, t: string, h: number): CadEntity2D => ({ type: 'text', layer, at: [at[0] * u, at[1] * u, 0], height: h * u, rotation: 0, text: t, align: 'center' });
  const bx0 = s.side, by0 = s.front, bx1 = s.width - s.side, by1 = s.depth - s.rear;
  const out: CadEntity2D[] = [
    poly('C-PROP', rect(0, 0, s.width, s.depth)),
    poly('C-SETB', rect(bx0, by0, bx1, by1)),
    text('C-PROP', [s.width / 2, -900], 'STREET (FRONT)', 450),
    text('C-SETB', [(bx0 + bx1) / 2, by1 - 600], 'BUILD INSIDE THIS LINE', 300),
  ];
  return addEntities(ensureLayers(m, [{ name: 'C-PROP', color: '#22c55e' }, { name: 'C-SETB', color: '#f59e0b' }]), out);
}

/** The buildable rectangle (mm) of the lot drawn by addLot, if there is one. */
export function buildableArea(m: CadModel): { x0: number; y0: number; x1: number; y1: number } | null {
  const k = MM_PER_UNIT[m.units] || 1; const pl = m.entities.find(e => e.type === 'polyline' && e.layer === 'C-SETB') as Extract<CadEntity2D, { type: 'polyline' }> | undefined;
  if (!pl) return null; const xs = pl.points.map(p => p[0] * k), ys = pl.points.map(p => p[1] * k);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** A closed rectangle of outside walls, width × depth measured to the outside faces (mm). Placed inside the lot when there is one. */
export function addShell(m: CadModel, width: number, depth: number, thickness = 250, height = 2700): CadModel {
  const u = upmOf(m); const b = buildableArea(m);
  const ox = b ? b.x0 + Math.max(0, (b.x1 - b.x0 - width) / 2) : 0, oy = b ? b.y0 : 0;
  const h = thickness / 2; // walls are drawn on their centreline
  const pts: P[] = [[ox + h, oy + h], [ox + width - h, oy + h], [ox + width - h, oy + depth - h], [ox + h, oy + depth - h]].map(p => [p[0] * u, p[1] * u]);
  return addEntities(ensureLayers(m, [{ name: 'A-WALL', color: '#ff0000' }]), wallsFrom(pts, thickness * u, height * u, 'A-WALL', u, true));
}

/** Does the building stay inside the setback lines? */
export function insideSetbacks(m: CadModel): boolean | null {
  const b = buildableArea(m); if (!b) return null; const k = MM_PER_UNIT[m.units] || 1; const eps = 1;
  return m.entities.every(e => e.type !== 'wall' || [e.a, e.b].every(p => { const x = p[0] * k, y = p[1] * k, t = e.thickness * k / 2; return x - t >= b.x0 - eps && x + t <= b.x1 + eps && y - t >= b.y0 - eps && y + t <= b.y1 + eps; }));
}

/** Place a library item the way the drafting view does: doors and windows host into the wall under the point. Points in mm. */
export function placeLibraryItem(m: CadModel, id: string, at: P, params: Record<string, number | string | boolean> = {}, rotation = 0): CadModel {
  const it = itemById(id); if (!it) throw new Error(`No library item ${id}`);
  const u = upmOf(m); const q: P = [at[0] * u, at[1] * u]; const p = { ...defaultParams(it), ...params };
  if (it.category === 'Doors' || it.category === 'Windows') {
    const hit = wallAt(m.entities, q, 50 * u); if (!hit) throw new Error(`No wall under ${id}`);
    const next = addOpening(hit.wall, q, { kind: it.category === 'Windows' ? 'window' : 'door', width: Number(p.width ?? 900) * u, item: it.id, params: p });
    if (!next) throw new Error(`${id} does not fit there`);
    return { ...m, entities: m.entities.map((e, i) => (i === hit.index ? next : e)) };
  }
  const block = makeBlock(it, p, m.units);
  return insertBlock(ensureBlockAndLayer(m, block, it.layer), block.name, q, rotation, false, it.layer);
}
