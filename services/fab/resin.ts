// Resin (MSLA) slicing: layer masks as PNG images in an SL1 package (the open zip-of-PNGs format
// from Prusa's SL1). UVtools, which is free, opens SL1 and converts it to every vendor format
// (.ctb, .goo, .pwmx, .photon ...), so one writer reaches almost every resin printer.
// Support: a raft, then vertical pillars on a lattice under every overhang (from raster.ts).

import { zipSync, zlibSync, strToU8 } from 'fflate';
import { type MeshIn, meshBounds, sliceMesh } from './slice';
import { rasterize, supportGrids, dilate, or, type Grid } from './raster';
import { resinById } from './materials';

export interface ResinPrinter { id: string; name: string; resX: number; resY: number; pixel: number; notes: string }
export const RESIN_PRINTERS: ResinPrinter[] = [
  { id: 'sl1s', name: 'Prusa SL1 / SL1S (native SL1)', resX: 1440, resY: 2560, pixel: 0.04725, notes: 'Prints the file directly.' },
  { id: 'mono-4k', name: '6.6" 4K mono LCD (convert in UVtools)', resX: 3840, resY: 2400, pixel: 0.0375, notes: 'Open in UVtools, File > Convert to your printer\'s format.' },
  { id: 'mono-8k', name: '10" 8K mono LCD (convert in UVtools)', resX: 7680, resY: 4320, pixel: 0.0285, notes: 'Large file; UVtools converts it.' },
];

// ---------------------------------------------------------------- PNG (8-bit grayscale)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(parts: Uint8Array[]) { let c = 0xffffffff; for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = strToU8(type); const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(t, 4); out.set(data, 8); dv.setUint32(8 + data.length, crc32([t, data])); return out;
}
/** Encode a width×height grayscale image (one byte per pixel) as PNG. */
export function encodePngGray(w: number, h: number, px: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; raw.set(px.subarray(y * w, y * w + w), y * (w + 1) + 1); }
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}

// ---------------------------------------------------------------- slicing
export interface ResinOptions { printer: string; resin: string; layer: number; lift: number; raft: number; pillar: number; spacing: number; supports: boolean; maxLayers?: number }
export const RESIN_DEFAULTS: ResinOptions = { printer: 'sl1s', resin: 'standard', layer: 0.05, lift: 5, raft: 1, pillar: 0.8, spacing: 2.5, supports: true };

export interface ResinJob { layers: Array<{ z: number; mask: Grid }>; printer: ResinPrinter; seconds: number; ml: number; warnings: string[]; fits: boolean; supportLayers: number }

export function resinJob(meshes: MeshIn[], opt: Partial<ResinOptions> = {}): ResinJob {
  const o = { ...RESIN_DEFAULTS, ...opt }; const pr = RESIN_PRINTERS.find(p => p.id === o.printer) ?? RESIN_PRINTERS[0]; const resin = resinById(o.resin) ?? resinById('standard')!;
  const warnings: string[] = []; const b = meshBounds(meshes);
  const W = pr.resX * pr.pixel, H = pr.resY * pr.pixel; const size = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
  const fits = size[0] <= W && size[1] <= H; if (!fits) warnings.push(`Part is ${size[0].toFixed(1)} × ${size[1].toFixed(1)} mm; the screen is ${W.toFixed(1)} × ${H.toFixed(1)} mm.`);
  const dx = -(b.min[0] + b.max[0]) / 2, dy = -(b.min[1] + b.max[1]) / 2, dz = -b.min[2];
  const placed = meshes.map(m => { const P = Float32Array.from(m.positions); for (let i = 0; i < P.length; i += 3) { P[i] += dx; P[i + 1] += dy; P[i + 2] += dz; } return { positions: P, indices: m.indices }; });
  const model = sliceMesh(placed, o.layer, o.maxLayers ?? 6000);
  const screen: Grid = { w: pr.resX, h: pr.resY, x0: -W / 2, y0: -H / 2, cell: pr.pixel, bits: new Uint8Array(0) };
  const lift = o.supports ? o.lift : 0; const out: ResinJob['layers'] = [];
  let pillarCells: Grid | null = null; let sup: ReturnType<typeof supportGrids> | null = null;
  if (o.supports && model.length > 2) {
    sup = supportGrids(model, { min: [b.min[0] + dx, b.min[1] + dy], max: [b.max[0] + dx, b.max[1] + dy] }, { overhang: 45, layer: o.layer, cell: 0.5, xyGap: 0.1, zGapLayers: 0, mode: 'everywhere' });
    pillarCells = sup.grids.reduce((a, g) => or(a, g));
  }
  // Pillars: discs on a lattice where the support column exists.
  const pillarMask = (src: Grid | null): Grid => {
    const g: Grid = { ...screen, bits: new Uint8Array(screen.w * screen.h) }; if (!src) return g;
    const r = o.pillar / 2; const rp = Math.ceil(r / pr.pixel);
    for (let y = Math.ceil(src.y0 / o.spacing) * o.spacing; y < src.y0 + src.h * src.cell; y += o.spacing)
      for (let x = Math.ceil(src.x0 / o.spacing) * o.spacing; x < src.x0 + src.w * src.cell; x += o.spacing) {
        const c = Math.floor((x - src.x0) / src.cell), rr = Math.floor((y - src.y0) / src.cell); if (!src.bits[rr * src.w + c]) continue;
        const pc = Math.round((x - g.x0) / pr.pixel), pr0 = Math.round((y - g.y0) / pr.pixel);
        for (let j = -rp; j <= rp; j++) for (let i = -rp; i <= rp; i++) if (i * i + j * j <= rp * rp) { const X = pc + i, Y = pr0 + j; if (X >= 0 && Y >= 0 && X < g.w && Y < g.h) g.bits[Y * g.w + X] = 1; }
      }
    return g;
  };
  if (o.supports && pillarCells) {
    const raft = dilate(pillarMask(pillarCells), Math.round(1.5 / pr.pixel));
    const nRaft = Math.max(1, Math.round(o.raft / o.layer)); for (let k = 0; k < nRaft; k++) out.push({ z: (k + 1) * o.layer, mask: raft });
    const column = pillarMask(pillarCells); const nLift = Math.round((lift - o.raft) / o.layer);
    for (let k = 0; k < nLift; k++) out.push({ z: o.raft + (k + 1) * o.layer, mask: column });
  }
  const supportLayers = out.length;
  model.forEach((L, i) => {
    let m = rasterize(screen, L.loops);
    if (sup && sup.area[i] > 0) m = or(m, pillarMask(sup.grids[i]));
    out.push({ z: lift + L.z, mask: m });
  });
  let px = 0; for (const L of out) for (let i = 0; i < L.mask.bits.length; i++) px += L.mask.bits[i];
  const ml = px * pr.pixel * pr.pixel * o.layer / 1000;
  const bottom = 5; const seconds = out.reduce((s, _, i) => s + (i < bottom ? resin.bottomExposure : resin.exposure) + 6, 0);
  if (size[0] * size[1] > 400 && model.length > 20 && !o.supports) warnings.push('Large flat areas peel hard from the FEP without supports: tilt the part 30-45° or turn supports on.');
  return { layers: out, printer: pr, seconds, ml, warnings, fits, supportLayers };
}

/** Package as SL1: config.ini plus one PNG per layer. `progress` is called per layer. */
export function writeSl1(job: ResinJob, name: string, o: Partial<ResinOptions> = {}, progress?: (i: number, n: number) => void): Uint8Array {
  const opt = { ...RESIN_DEFAULTS, ...o }; const resin = resinById(opt.resin) ?? resinById('standard')!;
  const jobDir = name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'plajah';
  const files: Record<string, Uint8Array> = {};
  const now = new Date(); const ts = `${now.toISOString().slice(0, 10)} at ${now.toISOString().slice(11, 19)} UTC`;
  files['config.ini'] = strToU8([
    'action = print', `jobDir = ${jobDir}`, `expTime = ${resin.exposure}`, `expTimeFirst = ${resin.bottomExposure}`, `fileCreationTimestamp = ${ts}`,
    `layerHeight = ${opt.layer}`, `materialName = ${resin.name}`, 'numFade = 5', `numFast = ${job.layers.length}`, 'numSlow = 0',
    'printProfile = Plajah Build', `printTime = ${Math.round(job.seconds)}`, 'printerModel = SL1', `printerProfile = ${job.printer.name}`, 'printerVariant = default',
    'prusaSlicerVersion = Plajah Build', `usedMaterial = ${job.ml.toFixed(2)}`, 'hollow = 0', '',
  ].join('\n'));
  files['prusaslicer.ini'] = strToU8([`display_pixels_x = ${job.printer.resX}`, `display_pixels_y = ${job.printer.resY}`, `display_width = ${(job.printer.resX * job.printer.pixel).toFixed(3)}`, `display_height = ${(job.printer.resY * job.printer.pixel).toFixed(3)}`, `layer_height = ${opt.layer}`, `exposure_time = ${resin.exposure}`, `initial_exposure_time = ${resin.bottomExposure}`, ''].join('\n'));
  job.layers.forEach((L, i) => {
    const px = new Uint8Array(L.mask.w * L.mask.h);
    // Image rows run top to bottom; flip Y so the part is not mirrored.
    for (let y = 0; y < L.mask.h; y++) { const src = (L.mask.h - 1 - y) * L.mask.w; for (let x = 0; x < L.mask.w; x++) px[y * L.mask.w + x] = L.mask.bits[src + x] ? 255 : 0; }
    files[`${jobDir}${String(i).padStart(5, '0')}.png`] = encodePngGray(L.mask.w, L.mask.h, px);
    progress?.(i + 1, job.layers.length);
  });
  return zipSync(files, { level: 0 });
}
