/**
 * polyMesh.ts — the polygon kernel for Argilla's modeling room.
 *
 * Plain data: vertices and faces as vertex lists, quads and n-gons alike. Every tool is a pure function from a mesh
 * to a new mesh, so undo is keeping the old one and "adjust the last tool" is running it again from there.
 * Edges are never stored; they are found from the faces whenever a tool needs them.
 */

export type V3 = [number, number, number];
export interface PolyMesh { verts: V3[]; faces: number[][] }
export type EdgeKey = string;

export const edgeKey = (a: number, b: number): EdgeKey => (a < b ? `${a}_${b}` : `${b}_${a}`);
export const parseEdge = (key: EdgeKey): [number, number] => key.split('_').map(Number) as [number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clone = (m: PolyMesh): PolyMesh => ({ verts: m.verts.map((v) => [...v] as V3), faces: m.faces.map((f) => [...f]) });

export function faceNormal(m: PolyMesh, face: number[]): V3 {
  // Newell's method: stays right on a slightly non-flat n-gon.
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < face.length; i++) {
    const a = m.verts[face[i]], b = m.verts[face[(i + 1) % face.length]];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([x, y, z]);
}

export function faceCentre(m: PolyMesh, face: number[]): V3 {
  let c: V3 = [0, 0, 0];
  for (const v of face) c = add(c, m.verts[v]);
  return mul(c, 1 / face.length);
}

/** Every edge and the faces on it. */
export function edgeFaces(m: PolyMesh): Map<EdgeKey, number[]> {
  const out = new Map<EdgeKey, number[]>();
  m.faces.forEach((face, f) => {
    for (let i = 0; i < face.length; i++) {
      const key = edgeKey(face[i], face[(i + 1) % face.length]);
      const list = out.get(key);
      if (list) list.push(f); else out.set(key, [f]);
    }
  });
  return out;
}

/** Edges with a single face: an open mesh's rim. Empty on a closed solid. */
export function boundaryEdges(m: PolyMesh): EdgeKey[] {
  return [...edgeFaces(m)].filter(([, list]) => list.length === 1).map(([key]) => key);
}

// ---- Primitives ---------------------------------------------------------------------------------

export function makeBox(size = 1): PolyMesh {
  const s = size / 2;
  return {
    verts: [[-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]],
    faces: [[4, 5, 6, 7], [1, 0, 3, 2], [0, 4, 7, 3], [5, 1, 2, 6], [7, 6, 2, 3], [0, 1, 5, 4]],
  };
}

export function makePlane(size = 1, cuts = 1): PolyMesh {
  const n = Math.max(1, cuts);
  const verts: V3[] = [], faces: number[][] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) verts.push([(i / n - 0.5) * size, 0, (0.5 - j / n) * size]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = i + j * (n + 1);
    faces.push([a, a + 1, a + n + 2, a + n + 1]);
  }
  return { verts, faces };
}

export function makeCylinder(radius = 0.5, height = 1, sides = 16): PolyMesh {
  const verts: V3[] = [], faces: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    verts.push([Math.cos(t) * radius, -height / 2, Math.sin(t) * radius], [Math.cos(t) * radius, height / 2, Math.sin(t) * radius]);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([i * 2, i * 2 + 1, j * 2 + 1, j * 2]);
  }
  faces.push(Array.from({ length: sides }, (_, i) => i * 2));
  faces.push(Array.from({ length: sides }, (_, i) => (sides - 1 - i) * 2 + 1));
  return { verts, faces };
}

export function makeSphere(radius = 0.5, rings = 10, sides = 16): PolyMesh {
  const verts: V3[] = [[0, -radius, 0]];
  for (let r = 1; r < rings; r++) {
    const a = -Math.PI / 2 + (r / rings) * Math.PI;
    for (let s = 0; s < sides; s++) {
      const t = (s / sides) * Math.PI * 2;
      verts.push([Math.cos(a) * Math.cos(t) * radius, Math.sin(a) * radius, Math.cos(a) * Math.sin(t) * radius]);
    }
  }
  const top = verts.length;
  verts.push([0, radius, 0]);
  const at = (r: number, s: number) => 1 + (r - 1) * sides + ((s + sides) % sides);
  const faces: number[][] = [];
  for (let s = 0; s < sides; s++) {
    faces.push([0, at(1, s), at(1, s + 1)]);
    faces.push([top, at(rings - 1, s + 1), at(rings - 1, s)]);
    for (let r = 1; r < rings - 1; r++) faces.push([at(r, s), at(r + 1, s), at(r + 1, s + 1), at(r, s + 1)]);
  }
  return { verts, faces };
}

export function joinMeshes(a: PolyMesh, b: PolyMesh): PolyMesh {
  const base = a.verts.length;
  return { verts: [...a.verts.map((v) => [...v] as V3), ...b.verts.map((v) => [...v] as V3)], faces: [...a.faces.map((f) => [...f]), ...b.faces.map((f) => f.map((v) => v + base))] };
}

// ---- Tools --------------------------------------------------------------------------------------

/** Removes vertices no face uses and renumbers. */
export function compact(m: PolyMesh): PolyMesh {
  const remap = new Map<number, number>();
  const verts: V3[] = [];
  const faces = m.faces.map((face) => face.map((v) => {
    let to = remap.get(v);
    if (to === undefined) { to = verts.length; remap.set(v, to); verts.push([...m.verts[v]] as V3); }
    return to;
  }));
  return { verts, faces };
}

export function deleteFaces(m: PolyMesh, ids: number[]): PolyMesh {
  const gone = new Set(ids);
  return compact({ verts: m.verts, faces: m.faces.filter((_, f) => !gone.has(f)) });
}

export function flipFaces(m: PolyMesh, ids?: number[]): PolyMesh {
  const out = clone(m);
  for (const f of ids ?? out.faces.map((_, i) => i)) out.faces[f].reverse();
  return out;
}

/**
 * Extrudes faces as one region: shared edges stay inside it and only its rim grows walls. Each vertex moves along
 * the average of its region's normals, lengthened so a corner keeps the wall thickness even.
 */
export function extrudeFaces(m: PolyMesh, ids: number[], distance: number): { mesh: PolyMesh; faces: number[] } {
  const out = clone(m);
  const region = new Set(ids);
  const normals = new Map<number, V3[]>();
  for (const f of ids) {
    const n = faceNormal(m, m.faces[f]);
    for (const v of m.faces[f]) normals.set(v, [...(normals.get(v) ?? []), n]);
  }
  const copies = new Map<number, number>();
  for (const [v, list] of normals) {
    const average = norm(list.reduce(add, [0, 0, 0] as V3));
    const stretch = 1 / Math.max(0.35, list[0][0] * average[0] + list[0][1] * average[1] + list[0][2] * average[2]);
    copies.set(v, out.verts.length);
    out.verts.push(add(m.verts[v], mul(average, distance * stretch)));
  }
  // An edge in the region once is its rim, walked in that face's direction so the wall faces outward.
  const counts = new Map<EdgeKey, number>();
  for (const f of ids) {
    const face = m.faces[f];
    for (let i = 0; i < face.length; i++) { const key = edgeKey(face[i], face[(i + 1) % face.length]); counts.set(key, (counts.get(key) ?? 0) + 1); }
  }
  for (const f of ids) {
    const face = m.faces[f];
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      if (counts.get(edgeKey(a, b)) === 1) out.faces.push([a, b, copies.get(b)!, copies.get(a)!]);
    }
    out.faces[f] = face.map((v) => copies.get(v)!);
  }
  void region;
  return { mesh: out, faces: [...ids] };
}

/** Insets each face on its own, leaving a ring of quads round a smaller copy. `amount` is 0 to 1 toward the centre. */
export function insetFaces(m: PolyMesh, ids: number[], amount: number): { mesh: PolyMesh; faces: number[] } {
  const out = clone(m);
  const t = Math.max(0, Math.min(0.98, amount));
  for (const f of ids) {
    const face = m.faces[f];
    const c = faceCentre(m, face);
    const inner = face.map((v) => { out.verts.push(lerp(m.verts[v], c, t)); return out.verts.length - 1; });
    for (let i = 0; i < face.length; i++) {
      const j = (i + 1) % face.length;
      out.faces.push([face[i], face[j], inner[j], inner[i]]);
    }
    out.faces[f] = inner;
  }
  return { mesh: out, faces: [...ids] };
}

/** The quads a loop cut passes through, starting across one edge and going straight on both ways. */
export function edgeRing(m: PolyMesh, start: EdgeKey): EdgeKey[] {
  const onEdge = edgeFaces(m);
  const ring = new Set<EdgeKey>([start]);
  const walk = (from: EdgeKey) => {
    let edge = from;
    const seenFaces = new Set<number>();
    const queue = [...(onEdge.get(from) ?? [])];
    while (queue.length) {
      const f = queue.shift()!;
      if (seenFaces.has(f)) continue;
      seenFaces.add(f);
      const face = m.faces[f];
      if (face.length !== 4) continue;
      const [a, b] = parseEdge(edge);
      const at = face.findIndex((v, i) => edgeKey(v, face[(i + 1) % 4]) === edgeKey(a, b));
      if (at < 0) continue;
      const opposite = edgeKey(face[(at + 2) % 4], face[(at + 3) % 4]);
      ring.add(opposite);
      edge = opposite;
      for (const next of onEdge.get(opposite) ?? []) if (!seenFaces.has(next)) queue.unshift(next);
    }
  };
  for (const f of onEdge.get(start) ?? []) {
    const single: EdgeKey = start;
    // Each side of the start edge walks its own way round.
    const before = onEdge.get(single)!;
    onEdge.set(single, [f]);
    walk(single);
    onEdge.set(single, before);
  }
  return [...ring];
}

/** Adds an edge loop through the ring across `start`. `position` slides it along, 0 to 1. */
export function loopCut(m: PolyMesh, start: EdgeKey, position = 0.5): PolyMesh {
  const out = clone(m);
  const ring = edgeRing(m, start);
  const onRing = new Set(ring);
  const mid = new Map<EdgeKey, number>();
  const [sa] = parseEdge(start);
  // Every ring edge has to split at the same side, or the loop zig-zags: `side` is carried across each quad.
  const low = new Map<EdgeKey, number>([[start, sa]]);
  const pending = [start];
  const onEdge = edgeFaces(m);
  while (pending.length) {
    const edge = pending.pop()!;
    const from = low.get(edge)!;
    const [a, b] = parseEdge(edge);
    for (const f of onEdge.get(edge) ?? []) {
      const face = m.faces[f];
      if (face.length !== 4) continue;
      const at = face.findIndex((v, i) => edgeKey(v, face[(i + 1) % 4]) === edgeKey(a, b));
      const oppositeKey = edgeKey(face[(at + 2) % 4], face[(at + 3) % 4]);
      if (!onRing.has(oppositeKey) || low.has(oppositeKey)) continue;
      // The vertex joined to `from` by a side of the quad is the same side of the cut.
      const i = face.indexOf(from);
      const neighbour = face[(i + 1) % 4] === (from === a ? b : a) ? face[(i + 3) % 4] : face[(i + 1) % 4];
      low.set(oppositeKey, neighbour);
      pending.push(oppositeKey);
    }
  }
  for (const edge of ring) {
    const [a, b] = parseEdge(edge);
    const from = low.get(edge) ?? a;
    const to = from === a ? b : a;
    mid.set(edge, out.verts.length);
    out.verts.push(lerp(m.verts[from], m.verts[to], position));
  }
  const faces: number[][] = [];
  m.faces.forEach((face) => {
    const cuts = face.map((v, i) => mid.get(edgeKey(v, face[(i + 1) % face.length])));
    const hits = cuts.filter((c) => c !== undefined).length;
    if (hits === 2 && face.length === 4) {
      const i = cuts.findIndex((c) => c !== undefined);
      const a = face[i], b = face[(i + 1) % 4], c = face[(i + 2) % 4], d = face[(i + 3) % 4];
      const p = cuts[i]!, q = cuts[(i + 2) % 4]!;
      faces.push([a, p, q, d], [p, b, c, q]);
    } else if (hits) {
      // A cut that ends on an n-gon adds its point to the outline, so the mesh stays closed.
      const next: number[] = [];
      face.forEach((v, i) => { next.push(v); if (cuts[i] !== undefined) next.push(cuts[i]!); });
      faces.push(next);
    } else faces.push(face);
  });
  out.faces = faces;
  return out;
}

/** Chamfers edges: each face pulls back from the selected edges, and new faces fill what opens up. */
export function bevelEdges(m: PolyMesh, selected: EdgeKey[], width: number): PolyMesh {
  const picked = new Set(selected);
  const touched = new Set<number>();
  for (const key of picked) for (const v of parseEdge(key)) touched.add(v);
  const out: PolyMesh = { verts: m.verts.map((v) => [...v] as V3), faces: [] };
  // A point `width` along an unselected edge away from v, shared by both faces on that edge.
  const slid = new Map<string, number>();
  const slideTo = (v: number, toward: number) => {
    const key = `${v}>${toward}`;
    let at = slid.get(key);
    if (at === undefined) {
      const direction = sub(m.verts[toward], m.verts[v]);
      const t = Math.min(0.48, width / Math.max(len(direction), 1e-6));
      at = out.verts.length;
      out.verts.push(lerp(m.verts[v], m.verts[toward], t));
      slid.set(key, at);
    }
    return at;
  };
  const cornerOnEdge = new Map<string, number>();
  m.faces.forEach((face, f) => {
    const next: number[] = [];
    face.forEach((v, i) => {
      if (!touched.has(v)) { next.push(v); return; }
      const before = face[(i + face.length - 1) % face.length], after = face[(i + 1) % face.length];
      const pickedBefore = picked.has(edgeKey(before, v)), pickedAfter = picked.has(edgeKey(v, after));
      let corners: number[];
      if (pickedBefore && pickedAfter) {
        // Both sides move: pulled in along the two edges' combined direction.
        const pull = add(norm(sub(m.verts[before], m.verts[v])), norm(sub(m.verts[after], m.verts[v])));
        out.verts.push(add(m.verts[v], mul(pull, width)));
        corners = [out.verts.length - 1];
      } else if (pickedAfter) corners = [slideTo(v, before)];
      else if (pickedBefore) corners = [slideTo(v, after)];
      else corners = [slideTo(v, before), slideTo(v, after)];
      if (pickedAfter) cornerOnEdge.set(`${f}:${v}:${after}`, corners[0]);
      if (pickedBefore) cornerOnEdge.set(`${f}:${v}:${before}`, corners[corners.length - 1]);
      next.push(...corners);
    });
    out.faces.push(next);
  });
  // The chamfer strip: one quad per edge between the two faces' pulled-back corners.
  const onEdge = edgeFaces(m);
  for (const key of picked) {
    const list = onEdge.get(key) ?? [];
    if (list.length !== 2) continue;
    const [a, b] = parseEdge(key);
    const [f1, f2] = list;
    const a1 = cornerOnEdge.get(`${f1}:${a}:${b}`), b1 = cornerOnEdge.get(`${f1}:${b}:${a}`);
    const a2 = cornerOnEdge.get(`${f2}:${a}:${b}`), b2 = cornerOnEdge.get(`${f2}:${b}:${a}`);
    if (a1 === undefined || b1 === undefined || a2 === undefined || b2 === undefined) continue;
    const face = m.faces[f1];
    const i = face.indexOf(a);
    // In f1 the edge runs a to b when b follows a; the strip runs the other way along that side.
    out.faces.push(face[(i + 1) % face.length] === b ? [b1, a1, a2, b2] : [a1, b1, b2, a2]);
  }
  return fillHoles(compact(out), m.verts.length ? boundaryEdges(m).length : 0);
}

/** Closes rims left by a tool. `keep` is how many open edges the mesh was meant to have: open meshes are left alone. */
export function fillHoles(m: PolyMesh, keep = 0): PolyMesh {
  if (keep > 0) return m;
  const next = new Map<number, number>();
  const counts = new Map<EdgeKey, number>();
  for (const face of m.faces) face.forEach((v, i) => { const key = edgeKey(v, face[(i + 1) % face.length]); counts.set(key, (counts.get(key) ?? 0) + 1); });
  for (const face of m.faces) face.forEach((v, i) => {
    const w = face[(i + 1) % face.length];
    // The hole runs the opposite way round to the faces beside it.
    if (counts.get(edgeKey(v, w)) === 1) next.set(w, v);
  });
  const out = clone(m);
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let at: number | undefined = start;
    while (at !== undefined && !seen.has(at)) { seen.add(at); loop.push(at); at = next.get(at); }
    if (at === start && loop.length >= 3) out.faces.push(loop);
  }
  return out;
}

/** Catmull-Clark: every face becomes quads and the form rounds toward its limit surface. Rims stay put as curves. */
export function subdivide(m: PolyMesh): PolyMesh {
  const facePoints = m.faces.map((f) => faceCentre(m, f));
  const onEdge = edgeFaces(m);
  const verts: V3[] = [];
  const faceIndex = facePoints.map((p) => { verts.push(p); return verts.length - 1; });
  const edgeIndex = new Map<EdgeKey, number>();
  const edgeMids = new Map<number, V3[]>();
  const vertFaces = new Map<number, V3[]>();
  for (const [key, list] of onEdge) {
    const [a, b] = parseEdge(key);
    const mid = lerp(m.verts[a], m.verts[b], 0.5);
    const point = list.length === 2
      ? mul(add(add(m.verts[a], m.verts[b]), add(facePoints[list[0]], facePoints[list[1]])), 0.25)
      : mid;
    edgeIndex.set(key, verts.length);
    verts.push(point);
    for (const v of [a, b]) edgeMids.set(v, [...(edgeMids.get(v) ?? []), mid]);
  }
  m.faces.forEach((f, i) => { for (const v of f) vertFaces.set(v, [...(vertFaces.get(v) ?? []), facePoints[i]]); });
  const rim = new Set<number>();
  for (const key of boundaryEdges(m)) for (const v of parseEdge(key)) rim.add(v);
  const rimMids = new Map<number, V3[]>();
  for (const [key, list] of onEdge) if (list.length === 1) {
    const [a, b] = parseEdge(key);
    const mid = lerp(m.verts[a], m.verts[b], 0.5);
    for (const v of [a, b]) rimMids.set(v, [...(rimMids.get(v) ?? []), mid]);
  }
  const vertIndex = m.verts.map((p, v) => {
    const mids = edgeMids.get(v), fps = vertFaces.get(v);
    let moved: V3 = p;
    if (rim.has(v)) {
      const r = rimMids.get(v) ?? [];
      if (r.length === 2) moved = mul(add(mul(p, 2), add(r[0], r[1])), 0.25);
    } else if (mids && fps) {
      const n = fps.length;
      const F = mul(fps.reduce(add, [0, 0, 0] as V3), 1 / n), R = mul(mids.reduce(add, [0, 0, 0] as V3), 1 / mids.length);
      moved = mul(add(add(F, mul(R, 2)), mul(p, n - 3)), 1 / n);
    }
    verts.push(moved);
    return verts.length - 1;
  });
  const faces: number[][] = [];
  m.faces.forEach((face, f) => {
    face.forEach((v, i) => {
      const before = face[(i + face.length - 1) % face.length], after = face[(i + 1) % face.length];
      faces.push([vertIndex[v], edgeIndex.get(edgeKey(v, after))!, faceIndex[f], edgeIndex.get(edgeKey(before, v))!]);
    });
  });
  return compact({ verts, faces });
}

/** Merges vertices at one point, dropping faces that collapse. */
export function mergeVerts(m: PolyMesh, ids: number[]): PolyMesh {
  if (ids.length < 2) return m;
  let c: V3 = [0, 0, 0];
  for (const v of ids) c = add(c, m.verts[v]);
  c = mul(c, 1 / ids.length);
  const out = clone(m);
  const target = ids[0];
  out.verts[target] = c;
  const set = new Set(ids);
  out.faces = out.faces.map((face) => {
    const mapped = face.map((v) => (set.has(v) ? target : v));
    return mapped.filter((v, i) => v !== mapped[(i + mapped.length - 1) % mapped.length]);
  }).filter((f) => f.length >= 3);
  return compact(out);
}

/** Vertices closer than `tolerance` become one, which is what heals a mirror seam. */
export function weld(m: PolyMesh, tolerance = 1e-4): PolyMesh {
  const cells = new Map<string, number>();
  const remap = m.verts.map((p, i) => {
    const key = p.map((c) => Math.round(c / tolerance)).join(',');
    const at = cells.get(key);
    if (at !== undefined) return at;
    cells.set(key, i);
    return i;
  });
  const faces = m.faces.map((f) => {
    const mapped = f.map((v) => remap[v]);
    return mapped.filter((v, i) => v !== mapped[(i + mapped.length - 1) % mapped.length]);
  }).filter((f) => f.length >= 3);
  return compact({ verts: m.verts, faces });
}

/** Mirrors across X and heals the seam. Faces lying on the plane would turn inward, so they are removed first. */
export function mirrorX(m: PolyMesh, tolerance = 1e-3): PolyMesh {
  const flat = m.faces.map((f, i) => (f.every((v) => Math.abs(m.verts[v][0]) < tolerance) ? i : -1)).filter((i) => i >= 0);
  const base = deleteFaces(m, flat);
  const snapped: PolyMesh = { verts: base.verts.map((v) => (Math.abs(v[0]) < tolerance ? [0, v[1], v[2]] as V3 : [...v] as V3)), faces: base.faces };
  const other: PolyMesh = { verts: snapped.verts.map((v) => [-v[0], v[1], v[2]] as V3), faces: snapped.faces.map((f) => [...f].reverse()) };
  return weld(joinMeshes(snapped, other), tolerance);
}

/** Triangles and smooth normals for display and export. A face fans from its first vertex. */
export function toTriangles(m: PolyMesh, flat = false) {
  const triFace: number[] = [];
  if (flat) {
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    m.faces.forEach((face, f) => {
      const n = faceNormal(m, face);
      const base = positions.length / 3;
      for (const v of face) { positions.push(...m.verts[v]); normals.push(...n); }
      for (let i = 1; i < face.length - 1; i++) { indices.push(base, base + i, base + i + 1); triFace.push(f); }
    });
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), triFace };
  }
  const normals = new Float32Array(m.verts.length * 3);
  const indices: number[] = [];
  m.faces.forEach((face, f) => {
    const n = faceNormal(m, face);
    for (const v of face) { normals[v * 3] += n[0]; normals[v * 3 + 1] += n[1]; normals[v * 3 + 2] += n[2]; }
    for (let i = 1; i < face.length - 1; i++) { indices.push(face[0], face[i], face[i + 1]); triFace.push(f); }
  });
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l;
  }
  return { positions: new Float32Array(m.verts.flat()), normals, indices: new Uint32Array(indices), triFace };
}

/** V - E + F. A closed, hole-free solid is 2, which is what tests hold every tool to. */
export function eulerCharacteristic(m: PolyMesh) {
  return m.verts.length - edgeFaces(m).size + m.faces.length;
}

/** Average smooth vertex normals across incident faces (falls back to +Y if degenerate). */
export function smoothVertexNormals(m: PolyMesh): V3[] {
  const acc: V3[] = m.verts.map(() => [0, 0, 0]);
  for (const face of m.faces) {
    const n = faceNormal(m, face);
    for (const v of face) {
      acc[v][0] += n[0];
      acc[v][1] += n[1];
      acc[v][2] += n[2];
    }
  }
  return acc.map((n) => (len(n) > 1e-8 ? norm(n) : [0, 1, 0]));
}

/**
 * Gives an open sheet or armor shell real physical wall thickness and watertight rim walls.
 * Keeps `offset` centered (`0`), pushed outward (`+1`), or inward (`-1`).
 */
export function solidifyMesh(m: PolyMesh, thickness = 0.02, offset = 0): PolyMesh {
  if (!m.verts.length || !m.faces.length) return clone(m);
  const vNorms = smoothVertexNormals(m);
  const outerDist = thickness * 0.5 * (1 + offset);
  const innerDist = -thickness * 0.5 * (1 - offset);
  const n = m.verts.length;
  const verts: V3[] = new Array(n * 2);
  for (let i = 0; i < n; i++) {
    verts[i] = add(m.verts[i], mul(vNorms[i], outerDist));
    verts[i + n] = add(m.verts[i], mul(vNorms[i], innerDist));
  }
  const faces: number[][] = [];
  // Outer skin keeps original winding; inner skin is flipped so normals face outward.
  for (const f of m.faces) faces.push([...f]);
  for (const f of m.faces) faces.push([...f].reverse().map((v) => v + n));

  // Bridge boundary edges (directed edge a->b with single incident face) into watertight side quads.
  const ef = edgeFaces(m);
  for (const f of m.faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      if ((ef.get(edgeKey(a, b))?.length ?? 0) === 1) {
        faces.push([b, a, a + n, b + n]);
      }
    }
  }
  return compact({ verts, faces });
}

/**
 * Topology-preserving edge bevel/chamfer on closed manifold meshes (`ratio` in 0..0.45 pulls face corners inward),
 * turning razor-sharp hard CG corners into specular catchlights for console rendering.
 */
export function bevelMeshEdges(m: PolyMesh, ratio = 0.18): PolyMesh {
  const t = Math.max(0.02, Math.min(0.45, ratio));
  const verts: V3[] = [];
  const faces: number[][] = [];
  const cornerVert = new Map<string, number>(); // `${f}_${v}` -> new vert index
  const vertFaces = new Map<number, number[]>();
  const directedHalfEdge = new Map<string, { f: number; prev: number; next: number }>();

  m.faces.forEach((face, f) => {
    const centre = faceCentre(m, face);
    const insetFace: number[] = [];
    for (let i = 0; i < face.length; i++) {
      const v = face[i];
      const prev = face[(i + face.length - 1) % face.length];
      const next = face[(i + 1) % face.length];
      directedHalfEdge.set(`${v}_${next}`, { f, prev, next });
      (vertFaces.get(v) ?? vertFaces.set(v, []).get(v)!).push(f);
      const id = verts.length;
      verts.push(lerp(m.verts[v], centre, t));
      cornerVert.set(`${f}_${v}`, id);
      insetFace.push(id);
    }
    faces.push(insetFace);
  });

  // Edge bevel quads for every manifold interior edge shared by two oppositely oriented half-edges.
  const seenEdges = new Set<EdgeKey>();
  m.faces.forEach((face, fA) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const ek = edgeKey(a, b);
      if (seenEdges.has(ek)) continue;
      seenEdges.add(ek);
      const opp = directedHalfEdge.get(`${b}_${a}`);
      if (!opp) continue;
      const ca = cornerVert.get(`${fA}_${a}`), cb = cornerVert.get(`${fA}_${b}`);
      const oa = cornerVert.get(`${opp.f}_${a}`), ob = cornerVert.get(`${opp.f}_${b}`);
      if (ca !== undefined && cb !== undefined && oa !== undefined && ob !== undefined) {
        faces.push([cb, ca, oa, ob]);
      }
    }
  });

  // Vertex corner faces by walking half-edges clockwise around each interior vertex.
  for (const [v, flist] of vertFaces.entries()) {
    if (flist.length < 3) continue;
    const fStart = flist[0];
    const face0 = m.faces[fStart];
    const idx0 = face0.indexOf(v);
    let curF = fStart;
    let curNext = face0[(idx0 + 1) % face0.length];
    const loop: number[] = [];
    let guard = 0;
    let closed = false;
    while (guard++ <= flist.length) {
      const cv = cornerVert.get(`${curF}_${v}`);
      if (cv === undefined) break;
      loop.push(cv);
      const twin = directedHalfEdge.get(`${curNext}_${v}`);
      if (!twin) break;
      if (twin.f === fStart) { closed = true; break; }
      curF = twin.f;
      const tf = m.faces[curF];
      const ti = tf.indexOf(v);
      curNext = tf[(ti + 1) % tf.length];
    }
    if (closed && loop.length === flist.length) {
      faces.push(loop.reverse());
    }
  }
  return compact({ verts, faces });
}

/** Welds near-coincident vertices and strips degenerate or zero-area polygons. */
export function cleanManifold(m: PolyMesh, weldTol = 1e-5, areaTol = 1e-10): PolyMesh {
  const welded = weld(m, weldTol);
  const faces = welded.faces.filter((f) => {
    if (f.length < 3 || new Set(f).size < 3) return false;
    const a = welded.verts[f[0]], b = welded.verts[f[1]], c = welded.verts[f[2]];
    const ab = sub(b, a), ac = sub(c, a);
    const cx = ab[1] * ac[2] - ab[2] * ac[1];
    const cy = ab[2] * ac[0] - ab[0] * ac[2];
    const cz = ab[0] * ac[1] - ab[1] * ac[0];
    return cx * cx + cy * cy + cz * cz > areaTol;
  });
  return compact({ verts: welded.verts, faces });
}

/** Generates seam-aware triplanar box UVs per vertex (`Float32Array` length = verts * 2) for procedural meshes. */
export function computeBoxUVs(m: PolyMesh, scale = 1): Float32Array {
  const uvs = new Float32Array(m.verts.length * 2);
  const norms = smoothVertexNormals(m);
  for (let i = 0; i < m.verts.length; i++) {
    const [x, y, z] = m.verts[i];
    const [nx, ny, nz] = norms[i];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ax >= ay && ax >= az) {
      uvs[i * 2] = z * scale;
      uvs[i * 2 + 1] = y * scale;
    } else if (ay >= ax && ay >= az) {
      uvs[i * 2] = x * scale;
      uvs[i * 2 + 1] = z * scale;
    } else {
      uvs[i * 2] = x * scale;
      uvs[i * 2 + 1] = y * scale;
    }
  }
  return uvs;
}
