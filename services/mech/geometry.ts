// Solid-building kit for mechanical parts: extrusions with holes, lathe (revolve), helical tubes,
// and an STL writer. Every solid is closed (watertight), so parts print and machine cleanly.

export type P2 = [number, number];
export interface Solid { positions: number[]; indices: number[] }

export const newSolid = (): Solid => ({ positions: [], indices: [] });
export function merge(...solids: Solid[]): Solid {
  const out = newSolid();
  for (const s of solids) { const base = out.positions.length / 3; out.positions.push(...s.positions); for (const i of s.indices) out.indices.push(i + base); }
  return out;
}
export function translate(s: Solid, dx: number, dy: number, dz: number): Solid { const p = s.positions.slice(); for (let i = 0; i < p.length; i += 3) { p[i] += dx; p[i + 1] += dy; p[i + 2] += dz; } return { positions: p, indices: s.indices.slice() }; }
export function rotateX90(s: Solid): Solid { const p = s.positions.slice(); for (let i = 0; i < p.length; i += 3) { const y = p[i + 1], z = p[i + 2]; p[i + 1] = -z; p[i + 2] = y; } return { positions: p, indices: s.indices.slice() }; }

export const area = (pts: P2[]) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
export const circlePts = (r: number, n = 48, cx = 0, cy = 0, start = 0): P2[] => Array.from({ length: n }, (_, i) => { const a = start + i / n * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
export const regularPolygon = (circumR: number, sides: number, start = 0): P2[] => circlePts(circumR, sides, 0, 0, start);

/** Merge holes into the outer ring with bridge edges (Eberly), so ear clipping can cap a face with holes. */
function bridgeHoles(outer: P2[], holes: P2[][]): P2[] {
  let ring = outer.slice();
  const sorted = holes.map(h => (area(h) > 0 ? h.slice().reverse() : h.slice())) // holes clockwise
    .sort((a, b) => Math.max(...b.map(p => p[0])) - Math.max(...a.map(p => p[0])));
  for (const hole of sorted) {
    let hi = 0; for (let i = 1; i < hole.length; i++) if (hole[i][0] > hole[hi][0]) hi = i;
    const M = hole[hi];
    // Nearest ring vertex to the right of M that is visible (no ring edge crosses the bridge).
    let best = -1, bd = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const V = ring[i]; if (V[0] < M[0] - 1e-12) continue; const d = Math.hypot(V[0] - M[0], V[1] - M[1]); if (d >= bd) continue;
      let blocked = false;
      for (let j = 0; j < ring.length && !blocked; j++) { const a = ring[j], b = ring[(j + 1) % ring.length]; if (j === i || (j + 1) % ring.length === i) continue; if (segCross(M, V, a, b)) blocked = true; }
      if (!blocked) { bd = d; best = i; }
    }
    if (best < 0) best = 0;
    const holeSeq = [...hole.slice(hi), ...hole.slice(0, hi), hole[hi]];
    ring = [...ring.slice(0, best + 1), ...holeSeq, ring[best], ...ring.slice(best + 1)];
  }
  return ring;
}
function segCross(a: P2, b: P2, c: P2, d: P2) {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
}

/** Ear clipping of a (possibly bridged) counter-clockwise ring; returns index triples into `ring`. */
function earClip(ring: P2[]): Array<[number, number, number]> {
  const idx = ring.map((_, i) => i); const out: Array<[number, number, number]> = [];
  const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p: P2, a: P2, b: P2, c: P2) => cross(a, b, p) > 1e-12 && cross(b, c, p) > 1e-12 && cross(c, a, p) > 1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length]; const a = ring[ia], b = ring[ib], c = ring[ic];
      if (cross(a, b, c) <= 1e-12) continue;
      let ok = true; for (const j of idx) { if (j === ia || j === ib || j === ic) continue; const p = ring[j]; if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue; if (inTri(p, a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([ia, ib, ic]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) { // degenerate leftovers: fan them so the cap stays closed
      for (let i = 1; i + 1 < idx.length; i++) out.push([idx[0], idx[i], idx[i + 1]]); return out;
    }
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/** Extrude an outline with holes from z0 to z1 (outer CCW or not; holes any orientation). */
export function extrude(outer: P2[], holes: P2[][], z0: number, z1: number): Solid {
  const s = newSolid(); const out = area(outer) > 0 ? outer : outer.slice().reverse();
  const ringVert = (ring: P2[], z: number) => { const base = s.positions.length / 3; for (const p of ring) s.positions.push(p[0], p[1], z); return base; };
  const walls = (ring: P2[], outward: boolean) => {
    const b0 = ringVert(ring, z0), b1 = ringVert(ring, z1); const n = ring.length;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (outward) s.indices.push(b0 + i, b0 + j, b1 + j, b0 + i, b1 + j, b1 + i); else s.indices.push(b0 + i, b1 + j, b0 + j, b0 + i, b1 + i, b1 + j); }
  };
  walls(out, true);
  const hs = holes.map(h => (area(h) > 0 ? h : h.slice().reverse())); // CCW
  for (const h of hs) walls(h, false);
  // Caps share vertex positions with the walls only by value; weld later if needed.
  const ring = hs.length ? bridgeHoles(out, hs) : out; const tris = earClip(ring);
  const top = ringVert(ring, z1), bot = ringVert(ring, z0);
  for (const [a, b, c] of tris) { s.indices.push(top + a, top + b, top + c); s.indices.push(bot + a, bot + c, bot + b); }
  return s;
}

/** Revolve a closed profile (r, z) around the z axis. Points with r = 0 lie on the axis and become a single vertex (fans), so solids stay manifold. */
export function lathe(profile: P2[], segments = 64): Solid {
  const s = newSolid(); const prof = area(profile) > 0 ? profile : profile.slice().reverse(); const m = prof.length;
  const onAxis = prof.map(([r]) => r <= 1e-9);
  // Vertex index for profile point i at segment k.
  const id: number[][] = prof.map(() => []);
  prof.forEach(([r, z], i) => {
    if (onAxis[i]) { const v = s.positions.length / 3; s.positions.push(0, 0, z); for (let k = 0; k < segments; k++) id[i][k] = v; return; }
    for (let k = 0; k < segments; k++) { const a = k / segments * Math.PI * 2; id[i][k] = s.positions.length / 3; s.positions.push(r * Math.cos(a), r * Math.sin(a), z); }
  });
  for (let k = 0; k < segments; k++) {
    const k2 = (k + 1) % segments;
    for (let i = 0; i < m; i++) {
      const i2 = (i + 1) % m; if (onAxis[i] && onAxis[i2]) continue;
      const a = id[i][k], b = id[i2][k], c = id[i2][k2], d = id[i][k2];
      if (onAxis[i]) s.indices.push(a, c, b);       // fan from the axis point
      else if (onAxis[i2]) s.indices.push(a, d, b);  // fan into the axis point
      else s.indices.push(a, d, c, a, c, b);
    }
  }
  return s;
}

/** Rotate a solid by permuting axes (u, v, h) -> (h, u, v): an extrusion along h ends up along x. */
export function axesToX(s: Solid): Solid { const p = s.positions.slice(); for (let i = 0; i < p.length; i += 3) { const u = p[i], v = p[i + 1], h = p[i + 2]; p[i] = h; p[i + 1] = u; p[i + 2] = v; } return { positions: p, indices: s.indices.slice() }; }

/** A round tube (radius rt) swept along a helix of radius R, pitch p, n turns, with closed ends. */
export function helixTube(R: number, rt: number, pitch: number, turns: number, stepsPerTurn = 48, sides = 12): Solid {
  const s = newSolid(); const steps = Math.max(2, Math.round(turns * stepsPerTurn));
  const pt = (t: number) => { const a = t * Math.PI * 2; return [R * Math.cos(a), R * Math.sin(a), pitch * t] as [number, number, number]; };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps * turns; const c = pt(t); const a = t * Math.PI * 2;
    const T = [-R * Math.sin(a) * Math.PI * 2, R * Math.cos(a) * Math.PI * 2, pitch]; const tl = Math.hypot(T[0], T[1], T[2]); T[0] /= tl; T[1] /= tl; T[2] /= tl;
    const N = [Math.cos(a), Math.sin(a), 0]; const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    for (let j = 0; j < sides; j++) { const th = j / sides * Math.PI * 2; const ca = Math.cos(th) * rt, sa = Math.sin(th) * rt; s.positions.push(c[0] + N[0] * ca + B[0] * sa, c[1] + N[1] * ca + B[1] * sa, c[2] + N[2] * ca + B[2] * sa); }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < sides; j++) { const j2 = (j + 1) % sides; const a = i * sides + j, b = i * sides + j2, c = (i + 1) * sides + j2, d = (i + 1) * sides + j; s.indices.push(a, b, c, a, c, d); }
  // End caps as fans around a centre vertex.
  for (const [ring, flip] of [[0, true], [steps, false]] as const) {
    const t = ring / steps * turns; const c = pt(t); const ci = s.positions.length / 3; s.positions.push(...c);
    for (let j = 0; j < sides; j++) { const j2 = (j + 1) % sides; const a = ring * sides + j, b = ring * sides + j2; if (flip) s.indices.push(ci, b, a); else s.indices.push(ci, a, b); }
  }
  return s;
}

/** Binary STL (little-endian), millimetres by convention. */
export function writeStl(solids: Array<{ positions: ArrayLike<number>; indices: ArrayLike<number> }>, name = 'Plajah part'): Uint8Array {
  const tris = solids.reduce((n, s) => n + s.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + tris * 50); const dv = new DataView(buf); const head = new TextEncoder().encode(name.slice(0, 79)); new Uint8Array(buf).set(head, 0);
  dv.setUint32(80, tris, true); let o = 84;
  for (const s of solids) for (let t = 0; t < s.indices.length; t += 3) {
    const v = [s.indices[t], s.indices[t + 1], s.indices[t + 2]].map(i => [s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2]]);
    const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const x of [nx, ny, nz]) { dv.setFloat32(o, x, true); o += 4; }
    for (const p of v) for (const x of p) { dv.setFloat32(o, x, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}
