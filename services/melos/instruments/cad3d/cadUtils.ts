// CAD-to-Three.js geometry primitives for Chora's 3D physical instruments.
// Built strictly atop Plajah's CAD Solid/extrude/lathe kernel and CadModel container so
// every instrument stays manifold, inspectable, and compatible with modelToGroup().

import { emptyModel, type CadModel } from '../../../cad/model';
import { addMesh, finish } from '../../../cad/mesh';
import { extrude, lathe, merge, newSolid, rotateX90, translate, type P2, type Solid } from '../../../mech/geometry';

export interface InstrumentViewSpec {
  family: string;
  cameraPos: [number, number, number];
  target: [number, number, number];
  accentHex: string;
  subtitle?: string;
}

/** Shift any solid around the X, Y, or Z axis in radians. */
export function rotateX(s: Solid, rad: number): Solid {
  const c = Math.cos(rad), si = Math.sin(rad);
  const p = s.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    const y = p[i + 1]!, z = p[i + 2]!;
    p[i + 1] = y * c - z * si;
    p[i + 2] = y * si + z * c;
  }
  return { positions: p, indices: s.indices.slice() };
}

export function rotateY(s: Solid, rad: number): Solid {
  const c = Math.cos(rad), si = Math.sin(rad);
  const p = s.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!, z = p[i + 2]!;
    p[i] = x * c + z * si;
    p[i + 2] = -x * si + z * c;
  }
  return { positions: p, indices: s.indices.slice() };
}

export function rotateZ(s: Solid, rad: number): Solid {
  const c = Math.cos(rad), si = Math.sin(rad);
  const p = s.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!, y = p[i + 1]!;
    p[i] = x * c - y * si;
    p[i + 1] = x * si + y * c;
  }
  return { positions: p, indices: s.indices.slice() };
}

export function scaleSolid(s: Solid, sx: number, sy: number, sz: number): Solid {
  const p = s.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i]! *= sx;
    p[i + 1]! *= sy;
    p[i + 2]! *= sz;
  }
  return { positions: p, indices: s.indices.slice() };
}

export function boxSolid(wx: number, wy: number, wz: number, cx = 0, cy = 0, z0 = 0): Solid {
  const hx = wx * 0.5, hy = wy * 0.5;
  const rect: P2[] = [
    [cx - hx, cy - hy],
    [cx + hx, cy - hy],
    [cx + hx, cy + hy],
    [cx - hx, cy + hy],
  ];
  return extrude(rect, [], z0, z0 + wz);
}

/** Tapered cylinder/frustum revolved around +Z from z0 to z1. */
export function cylinderZ(r0: number, r1: number, z0: number, z1: number, segs = 20): Solid {
  const prof: P2[] = [
    [0, z0],
    [Math.max(0.0005, r0), z0],
    [Math.max(0.0005, r1), z1],
    [0, z1],
  ];
  return lathe(prof, segs);
}

/** Frustum oriented from point a -> b in 3D space. */
export function rodBetween(a: [number, number, number], b: [number, number, number], r0: number, r1 = r0, segs = 10): Solid {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return newSolid();
  const s = newSolid();
  // Orthonormal basis with Z_local = dir
  const zx = dx / len, zy = dy / len, zz = dz / len;
  const up: [number, number, number] = Math.abs(zz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let xx = zy * up[2] - zz * up[1];
  let xy = zz * up[0] - zx * up[2];
  let xz = zx * up[1] - zy * up[0];
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  for (let ring = 0; ring <= 1; ring++) {
    const cx = ring === 0 ? a[0] : b[0];
    const cy = ring === 0 ? a[1] : b[1];
    const cz = ring === 0 ? a[2] : b[2];
    const r = ring === 0 ? r0 : r1;
    for (let k = 0; k < segs; k++) {
      const th = (k / segs) * Math.PI * 2;
      const ca = Math.cos(th) * r, sa = Math.sin(th) * r;
      s.positions.push(cx + xx * ca + yx * sa, cy + xy * ca + yy * sa, cz + xz * ca + yz * sa);
    }
  }
  for (let k = 0; k < segs; k++) {
    const k2 = (k + 1) % segs;
    const i0 = k, i1 = k2, j0 = segs + k, j1 = segs + k2;
    s.indices.push(i0, i1, j1, i0, j1, j0);
  }
  // Caps
  const c0 = s.positions.length / 3; s.positions.push(a[0], a[1], a[2]);
  const c1 = s.positions.length / 3; s.positions.push(b[0], b[1], b[2]);
  for (let k = 0; k < segs; k++) {
    const k2 = (k + 1) % segs;
    s.indices.push(c0, k2, k, c1, segs + k, segs + k2);
  }
  return s;
}

/** Sweep a circular tube along a 3D polyline (for brass horns, bow arcs, soundbox scrolls). */
export function tubeAlong(pts: Array<[number, number, number]>, radii: number | number[], sides = 12): Solid {
  if (pts.length < 2) return newSolid();
  const s = newSolid();
  const rAt = (i: number) => (Array.isArray(radii) ? radii[Math.min(radii.length - 1, i)]! : radii);
  let prevN: [number, number, number] | null = null;
  for (let i = 0; i < pts.length; i++) {
    const pPrev = pts[Math.max(0, i - 1)]!;
    const pNext = pts[Math.min(pts.length - 1, i + 1)]!;
    let tx = pNext[0] - pPrev[0], ty = pNext[1] - pPrev[1], tz = pNext[2] - pPrev[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;

    let nx: number, ny: number, nz: number;
    if (!prevN) {
      const ref: [number, number, number] = Math.abs(tz) < 0.85 ? [0, 0, 1] : [1, 0, 0];
      nx = ty * ref[2] - tz * ref[1];
      ny = tz * ref[0] - tx * ref[2];
      nz = tx * ref[1] - ty * ref[0];
    } else {
      const dot = prevN[0] * tx + prevN[1] * ty + prevN[2] * tz;
      nx = prevN[0] - tx * dot;
      ny = prevN[1] - ty * dot;
      nz = prevN[2] - tz * dot;
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    prevN = [nx, ny, nz];
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;
    const r = rAt(i);
    const c = pts[i]!;
    for (let j = 0; j < sides; j++) {
      const th = (j / sides) * Math.PI * 2;
      const ca = Math.cos(th) * r, sa = Math.sin(th) * r;
      s.positions.push(c[0] + nx * ca + bx * sa, c[1] + ny * ca + by * sa, c[2] + nz * ca + bz * sa);
    }
  }
  const steps = pts.length - 1;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      const a = i * sides + j, b = i * sides + j2, c = (i + 1) * sides + j2, d = (i + 1) * sides + j;
      s.indices.push(a, b, c, a, c, d);
    }
  }
  // Closed end caps
  const c0 = s.positions.length / 3; s.positions.push(...pts[0]!);
  const c1 = s.positions.length / 3; s.positions.push(...pts[steps]!);
  for (let j = 0; j < sides; j++) {
    const j2 = (j + 1) % sides;
    s.indices.push(c0, j2, j, c1, steps * sides + j, steps * sides + j2);
  }
  return s;
}

/** Subdivided vibrating string/ribbon between A and B so real-time standing waves animate GPU-cheaply. */
export function segmentedString(
  a: [number, number, number],
  b: [number, number, number],
  radius: number,
  segments = 24,
): Solid {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return tubeAlong(pts, radius, 6);
}

/** Subdivided circular disc in XY at z0 so drumhead Bessel (m,n) ripples deform cleanly in 3D. */
export function polarMembraneDisc(radius: number, z0: number, rings = 12, segs = 32): Solid {
  const s = newSolid();
  s.positions.push(0, 0, z0); // vertex 0 = center
  for (let r = 1; r <= rings; r++) {
    const rr = (r / rings) * radius;
    for (let k = 0; k < segs; k++) {
      const th = (k / segs) * Math.PI * 2;
      s.positions.push(rr * Math.cos(th), rr * Math.sin(th), z0);
    }
  }
  for (let k = 0; k < segs; k++) {
    const k2 = (k + 1) % segs;
    s.indices.push(0, 1 + k, 1 + k2);
  }
  for (let r = 1; r < rings; r++) {
    const base0 = 1 + (r - 1) * segs;
    const base1 = 1 + r * segs;
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const a = base0 + k, b = base0 + k2, c = base1 + k2, d = base1 + k;
      s.indices.push(a, d, c, a, c, b);
    }
  }
  return s;
}

/** Linearly blend two #rrggbb hex colors (`t` 0..1) so heritage aging warms tones continuously. */
export function lerpHex(hexA: string, hexB: string, t: number): string {
  const cl = Math.max(0, Math.min(1, t));
  const a = parseInt(hexA.replace('#', ''), 16);
  const b = parseInt(hexB.replace('#', ''), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - cl) + ((b >> 16) & 255) * cl);
  const g = Math.round(((a >> 8) & 255) * (1 - cl) + ((b >> 8) & 255) * cl);
  const bl = Math.round((a & 255) * (1 - cl) + (b & 255) * cl);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function newInstrumentCad(name: string): CadModel {
  const m = emptyModel(name, 'step', 'plajah-cad');
  m.units = 'm';
  m.meta.upAxis = 'Z';
  return m;
}

export function addSolidMesh(
  m: CadModel,
  id: string,
  name: string,
  solid: Solid,
  color: string,
  opacity = 1,
): void {
  if (!solid.positions.length || !solid.indices.length) return;
  addMesh(m, {
    id,
    name,
    positions: new Float32Array(solid.positions),
    indices: new Uint32Array(solid.indices),
    color,
    opacity,
  });
}

export { finish, extrude, lathe, merge, rotateX90, translate, newSolid };
