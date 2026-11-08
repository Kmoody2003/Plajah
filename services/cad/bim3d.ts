// Our own BIM geometry: the 2D drawing's walls, hosted openings and rooms become a 3D model.
// Walls rise to their height in pieces around each opening (doors leave the wall above the head,
// windows leave it below the sill and above the head); door leaves and glazing fill the openings;
// rooms get floor slabs. The result is an ordinary CadModel with IFC classes on its elements,
// so the existing 3D view, tree, properties and section tools show it.

import { type CadModel, type CadElement, type Vec3, MM_PER_UNIT, emptyModel } from './model';
import { addMesh, finish } from './mesh';
import { findJoins, wallFaces, stationOf, type Wall } from './walls';
import { detectRooms } from './rooms';
import { collectOpenings } from './schedules';

type P = [number, number];

export interface BimDefaults { doorHeadMm: number; windowSillMm: number; windowHeadMm: number; slabMm: number }
export const BIM_DEFAULTS: BimDefaults = { doorHeadMm: 2100, windowSillMm: 900, windowHeadMm: 2100, slabMm: 200 };

/** Prism from a plan polygon (counter-clockwise or not) between z0 and z1, with flat-shaded faces. */
export function prism(poly: P[], z0: number, z1: number): { positions: Float32Array; indices: Uint32Array; normals: Float32Array } {
  const ccw = polyArea(poly) > 0 ? poly : [...poly].reverse();
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = pos.length / 3; for (const v of [a, b, c, d]) { pos.push(...v); nor.push(nx, ny, nz); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const n = ccw.length;
  for (let i = 0; i < n; i++) { const p = ccw[i], q = ccw[(i + 1) % n]; quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]); }
  // Caps: ear-clipped triangles (top facing +z, bottom facing -z).
  const tris = earcut(ccw);
  const cap = (z: number, up: boolean) => { const base = pos.length / 3; for (const p of ccw) { pos.push(p[0], p[1], z); nor.push(0, 0, up ? 1 : -1); } for (const [a, b, c] of tris) idx.push(...(up ? [base + a, base + b, base + c] : [base + a, base + c, base + b])); };
  cap(z1, true); cap(z0, false);
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), normals: new Float32Array(nor) };
}

export const polyArea = (pts: P[]) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

/** Ear clipping for a simple counter-clockwise polygon (no holes). */
export function earcut(poly: P[]): Array<[number, number, number]> {
  const idx = poly.map((_, i) => i); const out: Array<[number, number, number]> = [];
  const cross = (a: P, b: P, c: P) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p: P, a: P, b: P, c: P) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length]; const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross(a, b, c) <= 1e-12) continue; // reflex or degenerate
      if (idx.some(j => j !== ia && j !== ib && j !== ic && inTri(poly[j], a, b, c))) continue;
      out.push([ia, ib, ic]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break; // self-touching input: stop rather than loop
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/** The plan quadrilateral of a wall between stations sa and sb (ends use the mitred face corners). */
function wallPiece(w: Wall, faces: { left: [P, P]; right: [P, P] }, sa: number, sb: number, atStart: boolean, atEnd: boolean): P[] {
  const a: P = [w.a[0], w.a[1]], b: P = [w.b[0], w.b[1]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const u: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; const n: P = [-u[1], u[0]]; const h = w.thickness / 2;
  const at = (s: number, side: number): P => [a[0] + u[0] * s + n[0] * h * side, a[1] + u[1] * s + n[1] * h * side];
  return [atStart ? faces.right[0] : at(sa, -1), atEnd ? faces.right[1] : at(sb, -1), atEnd ? faces.left[1] : at(sb, 1), atStart ? faces.left[0] : at(sa, 1)];
}

export function bimTo3D(m: CadModel, d: BimDefaults = BIM_DEFAULTS): CadModel {
  const out = emptyModel(m.name.replace(/\.[^.]+$/, '') + ' (3D)', 'ifc', 'plajah-bim'); out.units = m.units; out.meta.upAxis = 'Z'; out.meta.source = 'Plajah BIM';
  const upm = 1 / MM_PER_UNIT[m.units];
  const walls = m.entities.filter((e): e is Wall => e.type === 'wall'); const joins = findJoins(walls);
  const marks = new Map(collectOpenings(m).filter(o => o.opening).map(o => [o.opening!.id, o.mark]));
  const el = (cls: string, name: string, props: CadElement['props'] = {}): CadElement => { const e: CadElement = { id: `bim_${out.elements.length + 1}`, cls, name, meshIds: [], props }; out.elements.push(e); return e; };
  const mesh = (e: CadElement, geo: ReturnType<typeof prism>, color: string, opacity = 1) => { const mm = addMesh(out, { name: e.name, ...geo, color, opacity, elementId: e.id, layer: e.cls }); e.meshIds.push(mm.id); };
  const len = (v: number) => `${Math.round(v / upm)} mm`;

  walls.forEach((w, wi) => {
    const faces = wallFaces(w, joins.get(w) ?? []); const H = w.height; const L = stationOf(w, [w.b[0], w.b[1]]).s;
    const s0 = Math.min(stationOf(w, faces.left[0]).s, stationOf(w, faces.right[0]).s), s1 = Math.max(stationOf(w, faces.left[1]).s, stationOf(w, faces.right[1]).s);
    const wallEl = el('IfcWall', `Wall ${wi + 1}`, { Dimensions: { Length: len(L), Thickness: len(w.thickness), Height: len(H) }, Pset_WallCommon: { IsExternal: null, LoadBearing: null } });
    const ops = [...w.openings].sort((x, y) => x.at - y.at);
    let cur = s0; const pieces: Array<{ sa: number; sb: number; z0: number; z1: number }> = [];
    for (const o of ops) {
      const head = (o.head ?? (o.kind === 'window' ? Number(o.params?.head ?? d.windowHeadMm) : Number(o.params?.height ?? d.doorHeadMm)) * upm);
      const sill = o.kind === 'window' ? (o.sill ?? Number(o.params?.sill ?? d.windowSillMm) * upm) : 0;
      if (o.at > cur) pieces.push({ sa: cur, sb: o.at, z0: 0, z1: H });
      if (sill > 0) pieces.push({ sa: o.at, sb: o.at + o.width, z0: 0, z1: Math.min(sill, H) });
      if (head < H) pieces.push({ sa: o.at, sb: o.at + o.width, z0: head, z1: H });
      cur = Math.max(cur, o.at + o.width);
      // The filling element.
      const a: P = [w.a[0], w.a[1]], u: P = [(w.b[0] - w.a[0]) / (L || 1), (w.b[1] - w.a[1]) / (L || 1)], n: P = [-u[1], u[0]];
      const panel = (s: number, e2: number, th: number): P[] => [[a[0] + u[0] * s - n[0] * th, a[1] + u[1] * s - n[1] * th], [a[0] + u[0] * e2 - n[0] * th, a[1] + u[1] * e2 - n[1] * th], [a[0] + u[0] * e2 + n[0] * th, a[1] + u[1] * e2 + n[1] * th], [a[0] + u[0] * s + n[0] * th, a[1] + u[1] * s + n[1] * th]];
      const mark = marks.get(o.id) ?? '';
      if (o.kind === 'door') {
        const de = el('IfcDoor', mark || 'Door', { Pset_DoorCommon: { Reference: o.item ?? 'door' }, Dimensions: { Width: len(o.width), Height: len(head) } });
        mesh(de, prism(panel(o.at, o.at + o.width, 20 * upm), 0, head), '#b08a5a');
      } else if (o.kind === 'window') {
        const we = el('IfcWindow', mark || 'Window', { Pset_WindowCommon: { Reference: o.item ?? 'window' }, Dimensions: { Width: len(o.width), Height: len(head - sill), Sill: len(sill) } });
        mesh(we, prism(panel(o.at, o.at + o.width, 6 * upm), sill, head), '#9fd8ff', 0.35);
      }
    }
    if (cur < s1) pieces.push({ sa: cur, sb: s1, z0: 0, z1: H });
    for (const pc of pieces) {
      if (pc.sb - pc.sa < 1e-9 || pc.z1 - pc.z0 < 1e-9) continue;
      const poly = wallPiece(w, faces, pc.sa, pc.sb, pc.sa <= s0 + 1e-9, pc.sb >= s1 - 1e-9);
      mesh(wallEl, prism(poly, pc.z0, pc.z1), '#e8e4dc');
    }
  });

  for (const r of detectRooms(m.entities)) {
    const name = r.name ? `${r.number ?? ''} ${r.name}`.trim() : r.id;
    const slab = el('IfcSlab', `Floor ${name}`, { Dimensions: { Thickness: len(d.slabMm * upm) } });
    mesh(slab, prism(r.net, -d.slabMm * upm, 0), '#cfc8b8');
  }
  return finish(out);
}
