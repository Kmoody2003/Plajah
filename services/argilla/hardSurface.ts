/**
 * hardSurface.ts — Argilla hard-surface SDF primitives & SurfaceNets extraction.
 *
 * Extends Argilla beyond organic roundCone clay (bake.ts) into oriented rounded boxes,
 * swept automotive silhouettes, wheel-arch cylinder carves, and crisp boolean fillets,
 * extracting watertight triangle meshes via surfaceNets.ts.
 */

import { surfaceNets, type SurfaceMesh } from './surfaceNets';

export type HardOp = 'add' | 'carve';

export interface ProfileStation {
  z: number;       // longitudinal coordinate (+Z = front, -Z = rear)
  yBot: number;    // bottom rocker / bumper height (m)
  yTop: number;    // top hood / roof / deck height (m)
  halfW: number;   // half-width at beltline (m)
  tumble?: number; // top half-width ratio vs beltline (0.65..0.98)
  crown?: number;  // center-line crown arch height (m)
  bevel?: number;  // cross-section corner bevel (m)
}

export interface HardPart {
  op: HardOp;
  kind: 'box' | 'cylZ' | 'cylX' | 'ellipsoid' | 'profile' | 'tube';
  center: [number, number, number]; // for 'tube': endpoint A [x1,y1,z1]; for 'profile': offset [0,0,0]
  size: [number, number, number];   // for 'tube': endpoint B [x2,y2,z2]; for 'cyl*': [r, halfLen, 0]
  stations?: ProfileStation[];      // for 'profile': sorted or unsorted longitudinal cross-sections
  round?: number;                   // bevel radius (m), or tube radius for 'tube'
  rotX?: number;                    // pitch (rad)
  rotY?: number;                    // yaw (rad)
  rotZ?: number;                    // roll (rad)
  blend?: number;                   // smooth boolean fillet (m)
  mirror?: boolean;                 // mirror across X = 0
}

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function rotatePoint(
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number
): [number, number, number] {
  let x = px, y = py, z = pz;
  if (ry) {
    const c = Math.cos(-ry), s = Math.sin(-ry);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx; z = nz;
  }
  if (rx) {
    const c = Math.cos(-rx), s = Math.sin(-rx);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny; z = nz;
  }
  if (rz) {
    const c = Math.cos(-rz), s = Math.sin(-rz);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx; y = ny;
  }
  return [x, y, z];
}

function profileDistance(stations: ProfileStation[], x: number, y: number, z: number, endBevel: number): number {
  const n = stations.length;
  if (n === 0) return 10;
  const zMin = stations[0].z;
  const zMax = stations[n - 1].z;

  let s0 = stations[0];
  let s1 = stations[n - 1];
  let t = 0;

  if (z <= zMin) {
    s0 = s1 = stations[0];
  } else if (z >= zMax) {
    s0 = s1 = stations[n - 1];
  } else {
    for (let i = 0; i < n - 1; i++) {
      if (z >= stations[i].z && z <= stations[i + 1].z) {
        s0 = stations[i];
        s1 = stations[i + 1];
        const span = s1.z - s0.z;
        t = span > 1e-5 ? (z - s0.z) / span : 0;
        break;
      }
    }
  }

  const yBot = s0.yBot + (s1.yBot - s0.yBot) * t;
  const yTop = s0.yTop + (s1.yTop - s0.yTop) * t;
  const halfW = s0.halfW + (s1.halfW - s0.halfW) * t;
  const tumble = (s0.tumble ?? 0.86) + ((s1.tumble ?? 0.86) - (s0.tumble ?? 0.86)) * t;
  const crown = (s0.crown ?? 0.03) + ((s1.crown ?? 0.03) - (s0.crown ?? 0.03)) * t;
  const bevel = (s0.bevel ?? 0.05) + ((s1.bevel ?? 0.05) - (s0.bevel ?? 0.05)) * t;

  const yc = (yBot + yTop) * 0.5;
  const hh = Math.max(0.02, (yTop - yBot) * 0.5);
  const dyNorm = Math.max(-1, Math.min(1, (y - yc) / hh));

  // Taper above beltline (tumblehome) and slight rocker tuck below beltline
  const widthScale = dyNorm >= 0 ? 1 - (1 - tumble) * Math.pow(dyNorm, 1.35) : 1 - 0.07 * (-dyNorm);
  const wEff = Math.max(0.03, halfW * widthScale);

  // Subtle center-line roof/hood crown
  const xFrac = Math.min(1, Math.abs(x) / Math.max(0.05, wEff));
  const yTopEff = yTop + crown * (1 - xFrac * xFrac);
  const ycEff = (yBot + yTopEff) * 0.5;
  const hhEff = Math.max(0.02, (yTopEff - yBot) * 0.5);

  const b = Math.min(bevel, wEff * 0.45, hhEff * 0.45);
  const qx = Math.abs(x) - (wEff - b);
  const qy = Math.abs(y - ycEff) - (hhEff - b);
  const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - b;

  const halfLen = Math.max(0.02, (zMax - zMin) * 0.5);
  const zMid = (zMin + zMax) * 0.5;
  const qz = Math.abs(z - zMid) - (halfLen - endBevel);

  return Math.hypot(Math.max(d2, 0), Math.max(qz, 0)) + Math.min(Math.max(d2, qz), 0) - endBevel;
}

function partDistance(p: HardPart, x: number, y: number, z: number): number {
  const r = p.round ?? 0.03;

  if (p.kind === 'tube') {
    const ax = p.center[0], ay = p.center[1], az = p.center[2];
    const bx = p.size[0], by = p.size[1], bz = p.size[2];
    const pax = x - ax, pay = y - ay, paz = z - az;
    const bax = bx - ax, bay = by - ay, baz = bz - az;
    const denom = bax * bax + bay * bay + baz * baz;
    const h = denom > 1e-8 ? Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / denom)) : 0;
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  }

  let lx = x - p.center[0];
  let ly = y - p.center[1];
  let lz = z - p.center[2];
  if (p.rotX || p.rotY || p.rotZ) {
    [lx, ly, lz] = rotatePoint(lx, ly, lz, p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0);
  }

  if (p.kind === 'profile') {
    return profileDistance(p.stations ?? [], lx, ly, lz, r);
  }

  if (p.kind === 'cylX') {
    // Cylinder along X axis: size = [radius, halfLen, 0]
    const dr = Math.hypot(ly, lz) - p.size[0];
    const dx = Math.abs(lx) - p.size[1];
    return Math.min(Math.max(dr, dx), 0) + Math.hypot(Math.max(dr, 0), Math.max(dx, 0)) - r;
  }
  if (p.kind === 'cylZ') {
    const dr = Math.hypot(lx, ly) - p.size[0];
    const dz = Math.abs(lz) - p.size[1];
    return Math.min(Math.max(dr, dz), 0) + Math.hypot(Math.max(dr, 0), Math.max(dz, 0)) - r;
  }
  if (p.kind === 'ellipsoid') {
    const sx = Math.max(0.01, p.size[0]);
    const sy = Math.max(0.01, p.size[1]);
    const sz = Math.max(0.01, p.size[2]);
    const k0 = Math.hypot(lx / sx, ly / sy, lz / sz);
    const k1 = Math.hypot(lx / (sx * sx), ly / (sy * sy), lz / (sz * sz));
    return k0 < 1e-6 ? -Math.min(sx, sy, sz) : (k0 * (k0 - 1)) / k1;
  }

  // Rounded Box
  const qx = Math.abs(lx) - (p.size[0] - r);
  const qy = Math.abs(ly) - (p.size[1] - r);
  const qz = Math.abs(lz) - (p.size[2] - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) +
    Math.min(Math.max(qx, qy, qz), 0) -
    r
  );
}

export function compileHardParts(parts: HardPart[]): HardPart[] {
  const out: HardPart[] = [];
  for (const p of parts) {
    const compiled =
      p.kind === 'profile' && p.stations
        ? { ...p, stations: [...p.stations].sort((a, b) => a.z - b.z) }
        : p;
    out.push(compiled);
    if (p.mirror && (Math.abs(p.center[0]) > 1e-4 || (p.kind === 'tube' && Math.abs(p.size[0]) > 1e-4))) {
      out.push({
        ...compiled,
        center: [-p.center[0], p.center[1], p.center[2]],
        size: p.kind === 'tube' ? [-p.size[0], p.size[1], p.size[2]] : p.size,
        rotY: p.rotY ? -p.rotY : 0,
        rotZ: p.rotZ ? -p.rotZ : 0,
      });
    }
  }
  return out;
}

export function sampleHardParts(parts: HardPart[], x: number, y: number, z: number): number {
  let d = 1e3;
  for (const p of parts) {
    const c = partDistance(p, x, y, z);
    const k = p.blend ?? 0.04;
    d = p.op === 'carve' ? -smin(-d, c, k) : smin(d, c, k);
  }
  return d;
}

/**
 * Extracts a SurfaceMesh over a symmetric domain [-halfExtent..+halfExtent] using Argilla's SurfaceNets.
 */
export function extractHardSurface(
  parts: HardPart[],
  halfExtent = 2.8,
  resolution = 112
): SurfaceMesh {
  const compiled = compileHardParts(parts);
  const blockSize = 16;
  const blocksPerSide = Math.ceil(resolution / blockSize);
  const step = (halfExtent * 2) / resolution;
  const toWorld = (v: number) => -halfExtent + v * step;

  // Coarse block culling: only visit blocks whose bounding sphere intersects the surface
  const activeBlocks: [number, number, number][] = [];
  const blockWorld = blockSize * step;
  const blockDiag = blockWorld * 0.9;

  for (let bz = 0; bz < blocksPerSide; bz++) {
    for (let by = 0; by < blocksPerSide; by++) {
      for (let bx = 0; bx < blocksPerSide; bx++) {
        const cx = toWorld((bx + 0.5) * blockSize);
        const cy = toWorld((by + 0.5) * blockSize);
        const cz = toWorld((bz + 0.5) * blockSize);
        const d = sampleHardParts(compiled, cx, cy, cz);
        if (Math.abs(d) <= blockDiag + 0.15) {
          activeBlocks.push([bx * blockSize, by * blockSize, bz * blockSize]);
        }
      }
    }
  }

  return surfaceNets({
    resolution,
    blockSize,
    blocks: activeBlocks,
    toWorld,
    sample: (ix, iy, iz) => sampleHardParts(compiled, toWorld(ix), toWorld(iy), toWorld(iz)),
  });
}
