// Replay a ModelDoc into a coloured mesh on the CPU: the scan becomes clay (Argilla's voxelize), the doc's
// parts and strokes are applied to the field (sdf.ts), surface nets make triangles, then colour goes on:
// scan colour → part materials → paint layers in order (photo projection included).
//
// In the app the same doc replays on the GPU through Argilla's bake; this is the reference version used by
// tests and the Node loop, and it is what a desktop worker can run without WebGPU.

import { voxelizeMesh } from '../../argilla/voxelize';
import { BRICK_STRIDE, BRICK_VOXELS } from '../../argilla/brickPool';
import { surfaceNets } from '../../argilla/surfaceNets';
import { basis, project } from './camera';
import { hexToRgb } from './modelOps';
import { NearestVertex, boundsOf, vertexNormals, type TriMesh, type DecodedImage } from './mesh';
import { composeDistance, partAt, type DistanceFn } from './sdf';
import { renderMesh } from './render';
import { FIT, type ModelDoc, type PaintLayer, type ScanBase, type Vec3 } from './schema';

const CLAY: [number, number, number] = [0.71, 0.68, 0.65];

/** The fit a scan gets into clay space (largest half-extent FIT, centred). */
export function fitToClay(positions: Float32Array): { centre: Vec3; scale: number } {
  const { min, max } = boundsOf(positions);
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  return { centre: [0, 1, 2].map(k => (min[k] + max[k]) / 2) as Vec3, scale: (2 * FIT) / extent };
}

export function toClay(mesh: TriMesh, fit: { centre: Vec3; scale: number }): TriMesh {
  const P = new Float32Array(mesh.positions.length);
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) P[i + k] = (mesh.positions[i + k] - fit.centre[k]) * fit.scale;
  return { ...mesh, positions: P, normals: undefined };
}

export interface ScanField { sample: DistanceFn; colourAt: (x: number, y: number, z: number) => [number, number, number] | null; mesh: TriMesh }

/** The scan as clay: a signed distance with trilinear filtering, and the scan's colour at any point near it. */
export async function scanField(clayMesh: TriMesh, grid = 24): Promise<ScanField> {
  const field = await voxelizeMesh(clayMesh.positions, clayMesh.indices, { grid, inPlace: true });
  const voxel = 2 / (grid * BRICK_VOXELS), S = BRICK_STRIDE, band = field.band;
  const slot = new Int32Array(grid ** 3).fill(-1);
  field.cells.forEach((c, i) => { slot[c] = i; });
  const L = grid * BRICK_VOXELS; // lattice points per side minus one
  const at = (ix: number, iy: number, iz: number): number => {
    ix = Math.max(0, Math.min(L, ix)); iy = Math.max(0, Math.min(L, iy)); iz = Math.max(0, Math.min(L, iz));
    const gx = Math.min(grid - 1, (ix / BRICK_VOXELS) | 0), gy = Math.min(grid - 1, (iy / BRICK_VOXELS) | 0), gz = Math.min(grid - 1, (iz / BRICK_VOXELS) | 0);
    const cell = gx + grid * (gy + grid * gz);
    const s = slot[cell];
    if (s < 0) return field.states[cell] === 1 ? -band : band;
    const lx = ix - gx * BRICK_VOXELS + 1, ly = iy - gy * BRICK_VOXELS + 1, lz = iz - gz * BRICK_VOXELS + 1;
    return field.values[s * S * S * S + lx + S * (ly + S * lz)];
  };
  const { min, max } = boundsOf(clayMesh.positions);
  const sample: DistanceFn = (x, y, z) => {
    // Far outside the scan's box, the box distance is a safe (smaller) step for ray marching.
    const ox = Math.max(min[0] - x, 0, x - max[0]), oy = Math.max(min[1] - y, 0, y - max[1]), oz = Math.max(min[2] - z, 0, z - max[2]);
    const out = Math.hypot(ox, oy, oz);
    if (out > band) return out;
    const fx = (x + 1) / voxel, fy = (y + 1) / voxel, fz = (z + 1) / voxel;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const c00 = at(ix, iy, iz) * (1 - tx) + at(ix + 1, iy, iz) * tx, c10 = at(ix, iy + 1, iz) * (1 - tx) + at(ix + 1, iy + 1, iz) * tx;
    const c01 = at(ix, iy, iz + 1) * (1 - tx) + at(ix + 1, iy, iz + 1) * tx, c11 = at(ix, iy + 1, iz + 1) * (1 - tx) + at(ix + 1, iy + 1, iz + 1) * tx;
    const d = (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
    return out > 0 ? Math.max(d, out) : d;
  };
  const near = new NearestVertex(clayMesh.positions, voxel * 4);
  const colourAt = (x: number, y: number, z: number): [number, number, number] | null => {
    if (!clayMesh.colours) return null;
    const i = near.find(x, y, z, 2);
    return i < 0 ? null : [clayMesh.colours[i * 3], clayMesh.colours[i * 3 + 1], clayMesh.colours[i * 3 + 2]];
  };
  return { sample, colourAt, mesh: clayMesh };
}

export interface ReplayInputs {
  scan: ScanField | null;
  /** Decoded reference pictures by view name, with the photo's subject mask in alpha. */
  pictures?: Record<string, DecodedImage>;
  /** Lattice resolution over [-1, 1]. */
  resolution?: number;
  /** True when the scan's own colours are just the engine's grey (shape-only backends): paint over them. */
  scanUntextured?: boolean;
}

export interface Replayed { mesh: TriMesh; distance: DistanceFn; bounds: { min: Vec3; max: Vec3 } }

export function replay(doc: ModelDoc, inp: ReplayInputs): Replayed {
  const R = inp.resolution ?? 160;
  const base = doc.useScan && inp.scan ? inp.scan.sample : null;
  const distance = composeDistance(base, doc.parts, doc.strokes);
  const step = 2 / R, toWorld = (v: number) => -1 + v * step;
  const blockSize = 8, per = Math.ceil(R / blockSize), reach = blockSize * step * 0.9;
  const blocks: [number, number, number][] = [];
  for (let bz = 0; bz < per; bz++) for (let by = 0; by < per; by++) for (let bx = 0; bx < per; bx++) {
    const d = distance(toWorld((bx + 0.5) * blockSize), toWorld((by + 0.5) * blockSize), toWorld((bz + 0.5) * blockSize));
    if (Math.abs(d) <= reach + step) blocks.push([bx * blockSize, by * blockSize, bz * blockSize]);
  }
  const cache = new Map<number, number>();
  const side = R + 3;
  const sm = surfaceNets({
    resolution: R, blockSize, blocks, toWorld,
    sample: (x, y, z) => {
      const k = x + side * (y + side * z);
      let v = cache.get(k);
      if (v === undefined) { v = distance(toWorld(x), toWorld(y), toWorld(z)); cache.set(k, v); }
      return v;
    },
  });
  const mesh: TriMesh = { positions: sm.positions, indices: sm.indices, normals: sm.normals.length ? sm.normals : undefined };
  if (!mesh.normals) mesh.normals = vertexNormals(mesh);
  mesh.colours = colourize(doc, mesh, inp, step * 2);
  return { mesh, distance, bounds: boundsOf(mesh.positions) };
}

function inRegion(doc: ModelDoc, l: PaintLayer, x: number, y: number, z: number, part: string | null): number {
  const r = l.region, fe = Math.max(1e-4, l.feather ?? 0);
  switch (r.kind) {
    case 'all': return 1;
    case 'part': return part === r.partId ? 1 : 0;
    case 'sphere': {
      const t = Math.hypot(x - r.center[0], y - r.center[1], z - r.center[2]) / r.radius;
      return t >= 1 ? 0 : t <= 1 - fe ? 1 : (1 - t) / fe;
    }
    case 'box': {
      let w = 1;
      for (let k = 0; k < 3; k++) {
        const t = Math.abs([x, y, z][k] - r.center[k]) / (r.size[k] / 2);
        if (t >= 1) return 0;
        if (t > 1 - fe) w = Math.min(w, (1 - t) / fe);
      }
      return w;
    }
  }
}

function colourize(doc: ModelDoc, mesh: TriMesh, inp: ReplayInputs, tol: number): Float32Array {
  const P = mesh.positions, N = mesh.normals!, nv = P.length / 3;
  const out = new Float32Array(nv * 3);
  const mats = new Map(doc.materials.map(m => [m.id, hexToRgb(m.colour)]));
  // Photo projections need to know which vertices the photo's camera sees: a depth pass from that camera.
  const projections = new Map<string, Projection>();
  for (const l of doc.paints) {
    if (!l.projectPhoto || projections.has(l.projectPhoto)) continue;
    const ref = doc.references.find(v => v.name === l.projectPhoto), pic = inp.pictures?.[l.projectPhoto];
    if (!ref?.camera || !pic) continue;
    projections.set(l.projectPhoto, { depth: renderMesh(mesh, ref.camera, { depthOnly: true }).depth, pic, cam: ref.camera, centre: boundsCentre(mesh) });
  }
  for (let i = 0; i < nv; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let c: [number, number, number] = CLAY;
    const part = partAt(doc.parts, x, y, z, tol);
    if (part) c = part.material ? mats.get(part.material) ?? CLAY : CLAY;
    else if (doc.useScan && inp.scan && !inp.scanUntextured) {
      const s = Math.abs(inp.scan.sample(x, y, z)) < tol * 2 ? inp.scan.colourAt(x, y, z) : null;
      if (s) c = s;
    }
    for (const l of doc.paints) {
      const w = inRegion(doc, l, x, y, z, part?.id ?? null) * l.opacity;
      if (w <= 0) continue;
      let lc: [number, number, number] | null = null;
      if (l.projectPhoto) {
        const pr = projections.get(l.projectPhoto);
        if (!pr) continue;
        const n: Vec3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
        lc = photoColour(pr, [x, y, z], n);
        if (!lc && l.fillUnseen && l.fillUnseen !== 'none') lc = unseenColour(pr, [x, y, z], n, l.fillUnseen);
        // Parts the agent added keep their material where the photo's colour would just repeat the old surface.
        if (lc && part?.material && l.region.kind === 'all') lc = null;
      } else if (l.material) lc = mats.get(l.material) ?? null;
      else if (l.colour) lc = hexToRgb(l.colour);
      if (!lc) continue;
      c = [c[0] + (lc[0] - c[0]) * w, c[1] + (lc[1] - c[1]) * w, c[2] + (lc[2] - c[2]) * w];
    }
    out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
  }
  return out;
}

type Projection = { depth: Float32Array; pic: DecodedImage; cam: NonNullable<ModelDoc['references'][number]['camera']>; centre: Vec3 };

function boundsCentre(m: TriMesh): Vec3 { const { min, max } = boundsOf(m.positions); return [0, 1, 2].map(k => (min[k] + max[k]) / 2) as Vec3; }

/** A face the photo can't see borrows the colour of its stand-in on the seen side (mirror or turn, see PaintLayer). */
function unseenColour(pr: Projection, p: Vec3, n: Vec3, how: 'mirror' | 'turn'): [number, number, number] | null {
  const b = basis(pr.cam), c = pr.centre;
  // The camera's horizontal forward: the axis "front to back" runs along.
  const fl = Math.hypot(b.fwd[0], b.fwd[2]) || 1, f: Vec3 = [b.fwd[0] / fl, 0, b.fwd[2] / fl];
  let q: Vec3, m: Vec3;
  if (how === 'mirror') {
    const s = (p[0] - c[0]) * f[0] + (p[2] - c[2]) * f[2], sn = n[0] * f[0] + n[2] * f[2];
    q = [p[0] - 2 * s * f[0], p[1], p[2] - 2 * s * f[2]];
    m = [n[0] - 2 * sn * f[0], n[1], n[2] - 2 * sn * f[2]];
  } else {
    // Same height and distance from the vertical axis, swung round to face the camera.
    const r = Math.hypot(p[0] - c[0], p[2] - c[2]);
    q = [c[0] - f[0] * r, p[1], c[2] - f[2] * r];
    const nr = Math.hypot(n[0], n[2]);
    m = [-f[0] * nr, n[1], -f[2] * nr];
  }
  // No depth test: the stand-in point is not on this mesh's surface in general; the photo mask decides.
  return photoColour({ ...pr, depth: null }, q, m);
}

function photoColour(pr: Omit<Projection, 'depth'> & { depth: Float32Array | null }, p: Vec3, n: Vec3): [number, number, number] | null {
  const b = basis(pr.cam);
  // Faces turned away from the camera get nothing (no smearing round the back).
  const facing = -(n[0] * b.fwd[0] + n[1] * b.fwd[1] + n[2] * b.fwd[2]);
  if (facing < 0.15) return null;
  const [px, py, z] = project(pr.cam, p, b);
  const ix = Math.floor(px), iy = Math.floor(py);
  if (ix < 0 || iy < 0 || ix >= pr.cam.width || iy >= pr.cam.height) return null;
  const k = iy * pr.cam.width + ix;
  if (pr.depth && z > pr.depth[k] + 0.02) return null; // hidden behind something nearer
  // The picture may be a different size than the camera's frame (camera is in the picture's pixels).
  const sx = pr.pic.width / pr.cam.width, sy = pr.pic.height / pr.cam.height;
  const qx = Math.min(pr.pic.width - 1, Math.floor(px * sx)), qy = Math.min(pr.pic.height - 1, Math.floor(py * sy));
  const o = (qy * pr.pic.width + qx) * 4;
  if (pr.pic.data[o + 3] < 128) return null; // off the subject in the photo
  return [pr.pic.data[o] / 255, pr.pic.data[o + 1] / 255, pr.pic.data[o + 2] / 255];
}

export const scanBase = (glb: string, backend: string, fit: { centre: Vec3; scale: number }): ScanBase => ({ kind: 'scan', glb, backend, centre: fit.centre, scale: fit.scale });
