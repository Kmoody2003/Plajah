// Schedules straight from the model: doors and windows (hosted in walls, or placed as library
// blocks), rooms (from the walls, named by tags) and a wall summary. They update every time the
// drawing changes, because they are computed, never typed.

import type { CadModel, CadEntity2D, WallOpening } from './model';
import { MM_PER_UNIT } from './model';
import { detectRooms, formatArea, type Room } from './rooms';
import { LIBRARY, itemById, type LibraryItem } from './library';
import { stationOf } from './walls';

type Wall = Extract<CadEntity2D, { type: 'wall' }>;
export interface Table { title: string; columns: string[]; rows: string[][] }
type P = [number, number];

export const isImperial = (m: CadModel) => m.units === 'in' || m.units === 'ft';
export const unitsPerMmOf = (m: CadModel) => 1 / MM_PER_UNIT[m.units];

/** A length (in mm) as architects write it: 900 / 3'-0". */
export function formatLength(mm: number, imperial: boolean): string {
  if (!imperial) return String(Math.round(mm));
  const totalIn = mm / 25.4; let ft = Math.floor(totalIn / 12); let inch = Math.round((totalIn - ft * 12) * 4) / 4;
  if (inch >= 12) { ft += 1; inch -= 12; }
  const frac = (x: number) => { const w = Math.floor(x), r = x - w; return `${w}${r === 0.25 ? '¼' : r === 0.5 ? '½' : r === 0.75 ? '¾' : ''}`; };
  return `${ft}'-${frac(inch)}"`;
}

/** Library parameters back from a block name made by `blockName` (ITEM_ID_p1xp2x...). */
export function parseLibraryBlock(name: string): { item: LibraryItem; params: Record<string, number | string> } | null {
  for (const item of LIBRARY) {
    const prefix = item.id.toUpperCase().replace(/-/g, '_');
    if (name !== prefix && !name.startsWith(prefix + '_')) continue;
    const rest = name.slice(prefix.length + 1); const parts = rest ? rest.split('x') : [];
    if (parts.length !== item.params.length) continue;
    const params: Record<string, number | string> = {};
    item.params.forEach((d, i) => { const v = parts[i]; params[d.key] = d.kind === 'length' || d.kind === 'count' || d.kind === 'angle' ? Number(v) : v; });
    return { item, params };
  }
  return null;
}

export interface OpeningRef { mark: string; kind: 'door' | 'window'; item?: LibraryItem; params: Record<string, number | string | boolean>; widthMm: number; at: P; wallIndex?: number; opening?: WallOpening; free?: boolean; entityIndex: number }

/** Every door and window, hosted or free, in a stable order with marks D01... / W01... */
export function collectOpenings(m: CadModel): OpeningRef[] {
  const upm = unitsPerMmOf(m); const out: OpeningRef[] = [];
  m.entities.forEach((e, i) => {
    if (e.type === 'wall') {
      const a: P = [e.a[0], e.a[1]], b: P = [e.b[0], e.b[1]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const u: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      for (const o of [...e.openings].sort((x, y) => x.at - y.at)) {
        if (o.kind === 'opening') continue; const s = o.at + o.width / 2;
        out.push({ mark: '', kind: o.kind, item: o.item ? itemById(o.item) : undefined, params: o.params ?? {}, widthMm: o.width / (e.unitsPerMm || upm), at: [a[0] + u[0] * s, a[1] + u[1] * s], wallIndex: i, opening: o, entityIndex: i });
      }
    } else if (e.type === 'insert') {
      const lib = parseLibraryBlock(e.block); if (!lib || (lib.item.category !== 'Doors' && lib.item.category !== 'Windows')) return;
      out.push({ mark: '', kind: lib.item.category === 'Windows' ? 'window' : 'door', item: lib.item, params: lib.params, widthMm: Number(lib.params.width ?? 0), at: [e.at[0], e.at[1]], free: true, entityIndex: i });
    }
  });
  let d = 0, w = 0;
  for (const o of out) o.mark = o.kind === 'door' ? `D${String(++d).padStart(2, '0')}` : `W${String(++w).padStart(2, '0')}`;
  return out;
}

/** Which room an opening serves: the room on its swing side (doors) or the inside (windows). */
function roomOf(o: OpeningRef, m: CadModel, rooms: Room[]): Room | undefined {
  if (o.wallIndex === undefined || !o.opening) return undefined;
  const w = m.entities[o.wallIndex] as Wall; const a: P = [w.a[0], w.a[1]], b: P = [w.b[0], w.b[1]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: P = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; const side = o.opening.flip ? -1 : 1; const reach = w.thickness;
  const p: P = [o.at[0] + n[0] * side * reach, o.at[1] + n[1] * side * reach];
  return rooms.find(r => { let c = false; const poly = r.net; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; });
}

export function doorSchedule(m: CadModel): Table {
  const imp = isImperial(m); const rooms = detectRooms(m.entities); const upm = unitsPerMmOf(m);
  const rows = collectOpenings(m).filter(o => o.kind === 'door').map(o => {
    const r = roomOf(o, m, rooms); const height = Number(o.params.height ?? 2100); const wall = o.wallIndex !== undefined ? m.entities[o.wallIndex] as Wall : undefined;
    return [o.mark, o.item?.name ?? 'Door', formatLength(o.widthMm, imp), formatLength(height, imp), String(o.params.hand ?? (o.item?.id === 'door-double' ? 'pair' : '—')), r ? `${r.number ?? ''} ${r.name ?? ''}`.trim() || r.id : '—', wall ? formatLength(wall.thickness / upm, imp) : 'free', o.free ? 'free block' : 'in wall'];
  });
  return { title: 'Door schedule', columns: ['Mark', 'Type', 'Width', 'Height', 'Hinge', 'Room', 'Wall', 'Placed'], rows };
}

export function windowSchedule(m: CadModel): Table {
  const imp = isImperial(m); const rooms = detectRooms(m.entities);
  const rows = collectOpenings(m).filter(o => o.kind === 'window').map(o => {
    const sill = Number(o.params.sill ?? 900), head = Number(o.params.head ?? 2100); const r = roomOf(o, m, rooms);
    return [o.mark, o.item?.name ?? 'Window', formatLength(o.widthMm, imp), formatLength(head - sill, imp), formatLength(sill, imp), formatLength(head, imp), r ? `${r.number ?? ''} ${r.name ?? ''}`.trim() || r.id : '—'];
  });
  return { title: 'Window schedule', columns: ['Mark', 'Type', 'Width', 'Height', 'Sill', 'Head', 'Room'], rows };
}

export function roomSchedule(m: CadModel): Table {
  const imp = isImperial(m); const upm = unitsPerMmOf(m);
  const rooms = detectRooms(m.entities);
  const rows = rooms.map((r, i) => [r.number ?? String(i + 1), r.name ?? '(untagged)', formatArea(r.area, upm), formatLength(r.perimeter / upm, imp), formatArea(r.grossArea, upm)]);
  if (rooms.length) rows.push(['', 'Total', formatArea(rooms.reduce((s, r) => s + r.area, 0), upm), '', formatArea(rooms.reduce((s, r) => s + r.grossArea, 0), upm)]);
  return { title: 'Room schedule', columns: ['Number', 'Name', 'Net area', 'Perimeter', 'Gross (centreline)'], rows };
}

export function wallSummary(m: CadModel): Table {
  const imp = isImperial(m); const upm = unitsPerMmOf(m);
  const by = new Map<number, { n: number; len: number; area: number }>();
  for (const e of m.entities) if (e.type === 'wall') {
    const t = Math.round(e.thickness / upm); const l = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) / upm;
    const openingArea = e.openings.reduce((s, o) => s + (o.width / upm) * (o.kind === 'window' ? Number(o.params?.head ?? 2100) - Number(o.params?.sill ?? 900) : Number(o.params?.height ?? 2100)), 0);
    const g = by.get(t) ?? { n: 0, len: 0, area: 0 }; g.n++; g.len += l; g.area += l * (e.height / upm) - openingArea; by.set(t, g);
  }
  const rows = [...by.entries()].sort((a, b) => b[0] - a[0]).map(([t, g]) => [formatLength(t, imp), String(g.n), imp ? formatLength(g.len, true) : `${(g.len / 1000).toFixed(2)} m`, imp ? `${(g.area / 92903.04).toFixed(0)} ft²` : `${(g.area / 1e6).toFixed(2)} m²`]);
  return { title: 'Wall summary', columns: ['Thickness', 'Walls', 'Length', 'Face area (less openings)'], rows };
}

export const allSchedules = (m: CadModel): Table[] => [doorSchedule(m), windowSchedule(m), roomSchedule(m), wallSummary(m)];

export function toCsv(t: Table): string {
  const q = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [t.columns, ...t.rows].map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/** Where along its wall a door's hinge and latch are (distances from the wall start). */
export function hingeAndLatch(w: Wall, o: WallOpening): { hinge: number; latch: number } {
  const right = o.params?.hand === 'right';
  // Unflipped: library x = 0 sits at the opening start; flipped (rotated 180), at its end. A right-hand door hinges at library x = width.
  const startHinge = (!o.flip && !right) || (o.flip && right);
  return startHinge ? { hinge: o.at, latch: o.at + o.width } : { hinge: o.at + o.width, latch: o.at };
}

export { stationOf };
