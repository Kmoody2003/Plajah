// Mesh formats makers use (STL, OBJ, 3MF) and the print checks that matter for them:
// size, triangles, surface area, volume, and whether the mesh is closed (watertight).
// All our own code; runs in the browser, the desktop app and node.

import { unzipSync, strFromU8 } from 'fflate';
import { type CadModel, type CadMesh, type CadElement, type CadUnit, emptyModel, emptyBounds, growBounds, boundsValid, cadId } from './model';

// ── Welding: STL is a triangle soup; checks need shared vertices ────────────

export function weld(positions: Float32Array | number[], tolerance = 1e-5): { positions: Float32Array; indices: Uint32Array } {
  const map = new Map<string, number>(); const out: number[] = []; const idx = new Uint32Array(positions.length / 3);
  const q = 1 / tolerance;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let v = map.get(key);
    if (v === undefined) { v = out.length / 3; map.set(key, v); out.push(x, y, z); }
    idx[i / 3] = v;
  }
  return { positions: new Float32Array(out), indices: idx };
}

// ── STL ─────────────────────────────────────────────────────────────────────

export function parseStl(bytes: Uint8Array, name = 'model.stl'): CadModel {
  const m = emptyModel(name, 'stl', 'plajah-mesh'); m.units = 'mm'; // STL carries no units; mm is the printing convention
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.length >= 84 ? dv.getUint32(80, true) : 0;
  const isBinary = bytes.length >= 84 && 84 + count * 50 === bytes.length;
  let soup: number[] = [];
  if (isBinary) {
    soup = new Array(count * 9);
    for (let t = 0; t < count; t++) { const o = 84 + t * 50 + 12; for (let k = 0; k < 9; k++) soup[t * 9 + k] = dv.getFloat32(o + k * 4, true); }
  } else {
    const text = new TextDecoder().decode(bytes);
    const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g; let mm: RegExpExecArray | null;
    while ((mm = re.exec(text))) soup.push(+mm[1], +mm[2], +mm[3]);
    if (!soup.length) m.warnings.push('No triangles found. Is this an STL file?');
    const solid = /^\s*solid\s+(.+)$/m.exec(text); if (solid) m.meta.solid = solid[1].trim();
  }
  const { positions, indices } = weld(soup);
  addMesh(m, { name: name.replace(/\.[^.]+$/, ''), positions, indices });
  return finish(m);
}

// ── OBJ ─────────────────────────────────────────────────────────────────────

export function parseObj(text: string, name = 'model.obj'): CadModel {
  const m = emptyModel(name, 'obj', 'plajah-mesh');
  const v: number[] = []; let cur = { name: 'object', idx: [] as number[] }; const groups = [cur];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v') v.push(+parts[1], +parts[2], +parts[3]);
    else if (parts[0] === 'o' || parts[0] === 'g') { cur = { name: parts.slice(1).join(' ') || 'object', idx: [] }; groups.push(cur); }
    else if (parts[0] === 'f') {
      const ids = parts.slice(1).map(p => { const n = parseInt(p.split('/')[0], 10); return n < 0 ? v.length / 3 + n : n - 1; });
      for (let k = 1; k + 1 < ids.length; k++) cur.idx.push(ids[0], ids[k], ids[k + 1]);
    }
  }
  const all = new Float32Array(v);
  for (const g of groups) if (g.idx.length) {
    // Each group gets only the vertices it uses.
    const remap = new Map<number, number>(); const pos: number[] = []; const ind = new Uint32Array(g.idx.length);
    g.idx.forEach((o, i) => { let n = remap.get(o); if (n === undefined) { n = pos.length / 3; remap.set(o, n); pos.push(all[o * 3], all[o * 3 + 1], all[o * 3 + 2]); } ind[i] = n; });
    addMesh(m, { name: g.name, positions: new Float32Array(pos), indices: ind });
  }
  if (!m.meshes.length) m.warnings.push('No faces found.');
  return finish(m);
}

// ── 3MF (zip + XML; colours, units, build items with transforms) ────────────

const UNIT_3MF: Record<string, CadUnit> = { micron: 'mm', millimeter: 'mm', centimeter: 'cm', meter: 'm', inch: 'in', foot: 'ft' };

const attr = (tag: string, a: string) => { const r = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`).exec(tag); return r ? r[1] : undefined; };

/** 3MF transform "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" (row vectors). */
type T3 = number[];
const parseT = (s?: string): T3 => { const n = (s || '').trim().split(/\s+/).map(Number); return n.length === 12 && n.every(Number.isFinite) ? n : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; };
const mulT = (a: T3, b: T3): T3 => { // apply a then b
  const r = new Array(12).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  for (let j = 0; j < 3; j++) r[9 + j] = a[9] * b[j] + a[10] * b[3 + j] + a[11] * b[6 + j] + b[9 + j];
  return r;
};

export function parse3mf(bytes: Uint8Array, name = 'model.3mf'): CadModel {
  const m = emptyModel(name, '3mf', 'plajah-mesh');
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { m.warnings.push('Not a valid 3MF (zip) file.'); return m; }
  const modelPath = Object.keys(files).find(p => /^3D\/.*\.model$/i.test(p)) ?? Object.keys(files).find(p => p.toLowerCase().endsWith('.model'));
  if (!modelPath) { m.warnings.push('No 3D model part inside this 3MF.'); return m; }
  const xml = strFromU8(files[modelPath]);
  const modelTag = /<model\b[^>]*>/.exec(xml)?.[0] ?? '';
  const unit = attr(modelTag, 'unit') ?? 'millimeter'; m.units = UNIT_3MF[unit] ?? 'mm';
  const micron = unit === 'micron';
  for (const meta of xml.matchAll(/<metadata\s+name="([^"]+)"[^>]*>([^<]*)<\/metadata>/g)) m.meta[meta[1]] = meta[2];

  // Colour groups and base materials -> colour per (group id, index)
  const colours = new Map<string, string[]>();
  for (const g of xml.matchAll(/<(?:m:)?colorgroup\b[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/(?:m:)?colorgroup>/g)) colours.set(g[1], [...g[2].matchAll(/color="(#[0-9a-fA-F]{6,8})"/g)].map(c => c[1].slice(0, 7)));
  for (const g of xml.matchAll(/<basematerials\b[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/basematerials>/g)) colours.set(g[1], [...g[2].matchAll(/displaycolor="(#[0-9a-fA-F]{6,8})"/g)].map(c => c[1].slice(0, 7)));

  interface Obj { id: string; name: string; pos?: Float32Array; ind?: Uint32Array; color?: string; components: Array<{ id: string; t: T3 }> }
  const objs = new Map<string, Obj>();
  for (const o of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const head = o[1]; const body = o[2]; const id = attr(head, 'id')!;
    const obj: Obj = { id, name: attr(head, 'name') || `Object ${id}`, components: [] };
    const pid = attr(head, 'pid'), pindex = attr(head, 'pindex');
    if (pid && colours.has(pid)) obj.color = colours.get(pid)![+(pindex ?? 0)];
    const vs = body.indexOf('<vertices');
    if (vs >= 0) {
      const pos: number[] = []; const s = micron ? 0.001 : 1;
      for (const v of body.slice(vs, body.indexOf('</vertices>')).matchAll(/<vertex\b([^>]*)\/?>/g)) pos.push(+attr(v[1], 'x')! * s, +attr(v[1], 'y')! * s, +attr(v[1], 'z')! * s);
      const ind: number[] = [];
      const ts = body.indexOf('<triangles');
      if (ts >= 0) for (const t of body.slice(ts, body.indexOf('</triangles>')).matchAll(/<triangle\b([^>]*)\/?>/g)) {
        ind.push(+attr(t[1], 'v1')!, +attr(t[1], 'v2')!, +attr(t[1], 'v3')!);
        if (!obj.color) { const tp = attr(t[1], 'pid') ?? pid; const p1 = attr(t[1], 'p1'); if (tp && p1 && colours.has(tp)) obj.color = colours.get(tp)![+p1]; }
      }
      obj.pos = new Float32Array(pos); obj.ind = new Uint32Array(ind);
    }
    for (const c of body.matchAll(/<component\b([^>]*)\/?>/g)) obj.components.push({ id: attr(c[1], 'objectid')!, t: parseT(attr(c[1], 'transform')) });
    objs.set(id, obj);
  }

  const place = (obj: Obj, t: T3, parentEl: string | undefined, depth: number) => {
    const el: CadElement = { id: cadId('el'), cls: obj.components.length ? 'Assembly' : 'Object', name: obj.name, parent: parentEl, meshIds: [], props: {} };
    m.elements.push(el);
    if (obj.pos && obj.ind && obj.ind.length) {
      const p = new Float32Array(obj.pos.length);
      for (let i = 0; i < p.length; i += 3) { const x = obj.pos[i], y = obj.pos[i + 1], z = obj.pos[i + 2]; p[i] = x * t[0] + y * t[3] + z * t[6] + t[9]; p[i + 1] = x * t[1] + y * t[4] + z * t[7] + t[10]; p[i + 2] = x * t[2] + y * t[5] + z * t[8] + t[11]; }
      const mesh = addMesh(m, { name: obj.name, positions: p, indices: obj.ind, color: obj.color, elementId: el.id });
      el.meshIds.push(mesh.id);
    }
    if (depth < 16) for (const c of obj.components) { const child = objs.get(c.id); if (child) place(child, mulT(c.t, t), el.id, depth + 1); }
  };
  const build = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(xml)?.[1] ?? '';
  const items = [...build.matchAll(/<item\b([^>]*)\/?>/g)];
  if (items.length) for (const it of items) { const o = objs.get(attr(it[1], 'objectid')!); if (o) place(o, parseT(attr(it[1], 'transform')), undefined, 0); }
  else for (const o of objs.values()) place(o, parseT(), undefined, 0);
  if (!m.meshes.length) m.warnings.push('The 3MF build has no triangles.');
  const slicer = Object.keys(files).filter(p => /Metadata\/.*\.(config|json)$/i.test(p));
  if (slicer.length) m.meta.printSettings = slicer.join(', ');
  return finish(m);
}

// ── Shared ──────────────────────────────────────────────────────────────────

export function addMesh(m: CadModel, part: Omit<CadMesh, 'id'> & { id?: string }): CadMesh {
  const mesh: CadMesh = { id: part.id ?? cadId('mesh'), ...part } as CadMesh;
  m.meshes.push(mesh);
  return mesh;
}

export function meshBounds(meshes: CadMesh[]) {
  const b = emptyBounds();
  for (const mesh of meshes) for (let i = 0; i < mesh.positions.length; i += 3) growBounds(b, mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
  return boundsValid(b) ? b : { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
}

export function finish(m: CadModel): CadModel {
  m.bounds = meshBounds(m.meshes);
  if (!m.elements.length && m.meshes.length) {
    for (const mesh of m.meshes) { const el: CadElement = { id: cadId('el'), cls: 'Part', name: mesh.name, meshIds: [mesh.id], props: {} }; mesh.elementId = el.id; m.elements.push(el); }
  }
  return m;
}

export interface MeshStats { triangles: number; vertices: number; area: number; volume: number; watertight: boolean; openEdges: number; nonManifoldEdges: number }

/** Print checks for one indexed mesh. Volume is only meaningful when the mesh is closed. */
export function meshStats(positions: Float32Array, indices: Uint32Array): MeshStats {
  let area = 0, vol = 0; const edges = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const ux = positions[b] - ax, uy = positions[b + 1] - ay, uz = positions[b + 2] - az;
    const vx = positions[c] - ax, vy = positions[c + 1] - ay, vz = positions[c + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    area += Math.hypot(cx, cy, cz) / 2;
    vol += (ax * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) - ay * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) + az * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) / 6;
    for (const [p, q] of [[indices[t], indices[t + 1]], [indices[t + 1], indices[t + 2]], [indices[t + 2], indices[t]]]) {
      const k = p < q ? `${p}_${q}` : `${q}_${p}`; edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let open = 0, nonManifold = 0; for (const n of edges.values()) { if (n === 1) open++; else if (n > 2) nonManifold++; }
  return { triangles: indices.length / 3, vertices: positions.length / 3, area, volume: Math.abs(vol), watertight: open === 0 && nonManifold === 0 && indices.length > 0, openEdges: open, nonManifoldEdges: nonManifold };
}

export function modelStats(m: CadModel): MeshStats {
  const s: MeshStats = { triangles: 0, vertices: 0, area: 0, volume: 0, watertight: m.meshes.length > 0, openEdges: 0, nonManifoldEdges: 0 };
  for (const mesh of m.meshes) {
    // Always weld first: generated parts (and some exporters) keep separate corners per face, which
    // would read as open edges even on a closed solid. Welding an already-welded mesh changes nothing.
    const w = { ...mesh, ...weld(expand(mesh)) };
    const r = meshStats(w.positions, w.indices);
    s.triangles += r.triangles; s.vertices += r.vertices; s.area += r.area; s.volume += r.volume; s.openEdges += r.openEdges; s.nonManifoldEdges += r.nonManifoldEdges; s.watertight &&= r.watertight;
  }
  return s;
}

/** Indexed -> soup, so meshes with split normals (STEP/IFC) can be welded for edge checks. */
function expand(mesh: CadMesh): Float32Array {
  const out = new Float32Array(mesh.indices.length * 3);
  for (let i = 0; i < mesh.indices.length; i++) { const v = mesh.indices[i] * 3; out[i * 3] = mesh.positions[v]; out[i * 3 + 1] = mesh.positions[v + 1]; out[i * 3 + 2] = mesh.positions[v + 2]; }
  return out;
}
