// Plajah Terrain — baked raster files (docs/plajah-terrain.md, phase 3).
//
// One small binary holds a world's baked layers (erosion delta, flow, wetness, deposition…), each on its own grid:
//   'PTRS' · u32 version · u32 header bytes · JSON header (padded to 4) · layer data (each padded to 4)
// Heights ship as int16 at a fixed step (1 cm → ±327 m), 0…1 maps as uint8. Decoding gives HeightGrids to sample.
import { HeightGrid } from './field';

export interface RasterLayer {
  name: string;
  x0: number; z0: number; size: number; cell: number;
  data: Float32Array;
  /** i16: value / step (heights, deltas); u8: 0…1 maps. */
  type: 'i16' | 'u8';
  /** Metres per i16 step (default 0.01). */
  step?: number;
}

interface LayerHeader { name: string; x0: number; z0: number; size: number; cell: number; n: number; type: 'i16' | 'u8'; step: number; bytes: number }

const MAGIC = 0x53525450; // 'PTRS' little-endian
const pad4 = (b: number) => (b + 3) & ~3;

export function encodeRaster(layers: RasterLayer[], meta: Record<string, unknown> = {}): ArrayBuffer {
  const heads: LayerHeader[] = layers.map((l) => {
    const n = Math.round(l.size / l.cell) + 1;
    if (l.data.length !== n * n) throw new Error(`raster layer ${l.name}: ${l.data.length} samples for ${n}²`);
    return { name: l.name, x0: l.x0, z0: l.z0, size: l.size, cell: l.cell, n, type: l.type, step: l.step ?? 0.01, bytes: n * n * (l.type === 'i16' ? 2 : 1) };
  });
  const json = new TextEncoder().encode(JSON.stringify({ meta, layers: heads }));
  const total = 12 + pad4(json.length) + heads.reduce((s, h) => s + pad4(h.bytes), 0);
  const buf = new ArrayBuffer(total), dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, 1, true); dv.setUint32(8, json.length, true);
  new Uint8Array(buf, 12, json.length).set(json);
  let off = 12 + pad4(json.length);
  layers.forEach((l, k) => {
    const h = heads[k];
    if (h.type === 'i16') { const q = new Int16Array(buf, off, h.n * h.n); for (let i = 0; i < q.length; i++) q[i] = Math.max(-32767, Math.min(32767, Math.round(l.data[i] / h.step))); }
    else { const q = new Uint8Array(buf, off, h.n * h.n); for (let i = 0; i < q.length; i++) q[i] = Math.round(Math.min(1, Math.max(0, l.data[i])) * 255); }
    off += pad4(h.bytes);
  });
  return buf;
}

export interface DecodedRaster { meta: Record<string, unknown>; layers: Record<string, HeightGrid> }

export function decodeRaster(buf: ArrayBuffer): DecodedRaster {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a Plajah terrain raster');
  const len = dv.getUint32(8, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, len))) as { meta: Record<string, unknown>; layers: LayerHeader[] };
  let off = 12 + pad4(len);
  const layers: Record<string, HeightGrid> = {};
  for (const h of head.layers) {
    const out = new Float32Array(h.n * h.n);
    if (h.type === 'i16') { const q = new Int16Array(buf, off, h.n * h.n); for (let i = 0; i < q.length; i++) out[i] = q[i] * h.step; }
    else { const q = new Uint8Array(buf, off, h.n * h.n); for (let i = 0; i < q.length; i++) out[i] = q[i] / 255; }
    layers[h.name] = new HeightGrid(h.x0, h.z0, h.size, h.cell, out);
    off += pad4(h.bytes);
  }
  return { meta: head.meta, layers };
}

/** Fetch and decode a raster file (browser). */
export async function loadRaster(url: string): Promise<DecodedRaster> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`raster ${url}: HTTP ${r.status}`);
  return decodeRaster(await r.arrayBuffer());
}
