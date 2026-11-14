// Photo -> 3D room. A depth map from Depth Anything lifts each photo into a relief mesh, scaled by
// the ceiling height the user tells us; each photo faces its own way out from one standing point.
// This is the "Picture Walk" step 1-3 from docs/playable-engine-design.md, kept engine-aligned: the
// mesh math is plain arrays with no renderer, and depth results are cached per photo.

import { get, set, del, keys } from 'idb-keyval';
import type { VenueSpec } from './venues';

export type Facing = 'front' | 'right' | 'back' | 'left';
export const FACING_YAW: Record<Facing, number> = { front: 0, right: -Math.PI / 2, back: Math.PI, left: Math.PI / 2 };

export interface ReliefMesh {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Floor at y = 0, in metres, with this much room above it to the top of the frame. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export interface ReliefOptions {
  /** Grid cells across the long side. */
  grid?: number;
  /** Phone main cameras are about 65° across the long side. */
  hfovDeg?: number;
  ceilingM?: number;
  /** Depth jump (as a fraction of range) where the surface tears instead of stretching. */
  tear?: number;
}

/**
 * Turn relative inverse depth (0..1, near = 1) into a mesh looking along -z from the origin. Depth
 * Anything's output is disparity, so distance = 1 / (a + b d) for a chosen near and far plane.
 */
export function buildRelief(depth: Float32Array | Uint8Array, dw: number, dh: number, options: ReliefOptions = {}): ReliefMesh {
  const { grid = 160, hfovDeg = 65, ceilingM = 2.7, tear = 0.18 } = options;
  const scale = depth instanceof Uint8Array ? 1 / 255 : 1;
  const sample = (u: number, v: number) => depth[Math.min(dh - 1, Math.floor(v * dh)) * dw + Math.min(dw - 1, Math.floor(u * dw))] * scale;

  const aspect = dw / dh;
  const nx = aspect >= 1 ? grid : Math.max(2, Math.round(grid * aspect));
  const ny = aspect >= 1 ? Math.max(2, Math.round(grid / aspect)) : grid;
  const tanH = Math.tan((hfovDeg * Math.PI) / 360) * (aspect >= 1 ? 1 : aspect);
  const tanV = tanH / aspect;

  const count = (nx + 1) * (ny + 1);
  const raw = new Float32Array(count);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) raw[j * (nx + 1) + i] = sample(i / nx, j / ny);

  // Robust range: a few bright or dark pixels mustn't set the room's size.
  const sorted = Float32Array.from(raw).sort();
  const lo = sorted[Math.floor(count * 0.02)], hi = sorted[Math.floor(count * 0.98)];
  const range = Math.max(1e-4, hi - lo);

  const NEAR = 1, FAR = 6;      // unit-scale; the ceiling fit below sets true size
  const a = 1 / FAR, b = 1 / NEAR - 1 / FAR;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const d = Math.min(1, Math.max(0, (raw[k] - lo) / range));
      const dist = 1 / (a + b * d);
      positions[k * 3] = ((i / nx) * 2 - 1) * tanH * dist;
      positions[k * 3 + 1] = (1 - (j / ny) * 2) * tanV * dist;
      positions[k * 3 + 2] = -dist;
      uvs[k * 2] = i / nx;
      uvs[k * 2 + 1] = 1 - j / ny;
    }
  }

  // Fit: the lower and upper frame percentiles are floor and ceiling, or close to them.
  const ys = new Float32Array(count);
  for (let k = 0; k < count; k++) ys[k] = positions[k * 3 + 1];
  ys.sort();
  const yLo = ys[Math.floor(count * 0.01)], yHi = ys[Math.floor(count * 0.99)];
  const metres = ceilingM / Math.max(0.01, yHi - yLo);
  for (let k = 0; k < count; k++) {
    positions[k * 3] *= metres;
    positions[k * 3 + 1] = (positions[k * 3 + 1] - yLo) * metres;
    positions[k * 3 + 2] *= metres;
  }

  // Skip quads spanning a depth edge so a chair doesn't melt into the wall behind it.
  const tris: number[] = [];
  const step = (p: number, q: number) => Math.abs(raw[p] - raw[q]) / range;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p = j * (nx + 1) + i, q = p + 1, r = p + nx + 1, s = r + 1;
      if (Math.max(step(p, q), step(p, r), step(q, s), step(r, s)) > tear) continue;
      tris.push(p, r, q, q, r, s);
    }
  }

  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let k = 0; k < count; k++) {
    const x = positions[k * 3], y = positions[k * 3 + 1], z = positions[k * 3 + 2];
    if (x < bounds.minX) bounds.minX = x; if (x > bounds.maxX) bounds.maxX = x;
    if (y < bounds.minY) bounds.minY = y; if (y > bounds.maxY) bounds.maxY = y;
    if (z < bounds.minZ) bounds.minZ = z; if (z > bounds.maxZ) bounds.maxZ = z;
  }
  return { positions, uvs, indices: Uint32Array.from(tris), bounds };
}

// ── Saved rooms ─────────────────────────────────────────────────────────────

export interface CapturedPhoto {
  /** JPEG, as a Blob so it stays out of localStorage. */
  image: Blob;
  /** Depth as bytes, near = 255. */
  depth: Uint8Array;
  depthWidth: number;
  depthHeight: number;
  facing: Facing;
}

export interface CapturedRoom {
  id: string;
  name: string;
  ceilingM: number;
  hfovDeg: number;
  photos: CapturedPhoto[];
  createdAt: number;
}

const KEY = 'plajah.lightboard.room.';

export const saveRoom = (room: CapturedRoom) => set(KEY + room.id, room);
export const deleteRoom = (id: string) => del(KEY + id);
export const loadRoom = (id: string) => get<CapturedRoom>(KEY + id);
export async function listRooms(): Promise<CapturedRoom[]> {
  const all = (await keys()).filter((k) => typeof k === 'string' && k.startsWith(KEY)) as string[];
  const rooms = await Promise.all(all.map((k) => get<CapturedRoom>(k)));
  return (rooms.filter(Boolean) as CapturedRoom[]).sort((a, b) => b.createdAt - a.createdAt);
}

/** Depth from a photo. Flat output means the model failed quietly (fp16 on some GPUs) rather than a flat wall. */
export async function depthFromPhoto(image: HTMLImageElement | HTMLCanvasElement): Promise<{ depth: Uint8Array; width: number; height: number } | null> {
  const { estimateDepth } = await import('../fabula/depthMatte');
  const iw = (image as HTMLImageElement).naturalWidth || image.width, ih = (image as HTMLImageElement).naturalHeight || image.height;
  const s = 512 / Math.max(iw, ih);
  const width = Math.max(2, Math.round(iw * s)), height = Math.max(2, Math.round(ih * s));
  const canvas = await estimateDepth(image, width, height);
  const data = canvas?.getContext('2d')?.getImageData(0, 0, width, height)?.data;
  if (!data) return null;
  const depth = new Uint8Array(width * height);
  let min = 255, max = 0;
  for (let i = 0; i < depth.length; i++) {
    depth[i] = data[i * 4];
    if (depth[i] < min) min = depth[i];
    if (depth[i] > max) max = depth[i];
  }
  return max - min < 8 ? null : { depth, width, height };
}

/** A photo room behaves like any venue: a ceiling grid of slots sized from what was built. */
export function venueFromRoom(room: Pick<CapturedRoom, 'id' | 'name' | 'ceilingM'>, width: number, depth: number): VenueSpec {
  const y = Math.max(1.8, room.ceilingM - 0.15);
  return {
    id: `photo-${room.id}`, name: room.name, kind: 'photo', capacity: 'Your photos', blurb: 'Built from your photos.',
    width, depth, height: room.ceilingM, stage: { width: 0, depth: Math.min(3, depth / 2), height: 0 },
    trusses: [{ y, z: 0, span: Math.max(1, width * 0.7), use: 'wash' }, { y, z: -Math.min(2.5, depth / 3), span: Math.max(1, width * 0.7), use: 'movers' }],
    rig: [{ profileId: 'par-rgbwau-6', count: 4, name: 'Par' }], crowd: 0,
    view: { height: Math.min(1.5, room.ceilingM / 2), distance: 0.01 },
  };
}
