// Raster engine visual proof — runs IN CHROME (bundled by scripts/rasterProof.cjs).
// Renders blend modes, adjustments, filters and styles on the WebGL2 compositor, diffs
// every cell against the CPU reference, and runs healing / content-aware fill so a human
// can judge quality. Returns PNG data URLs + metrics to the node driver.
import { GlCompositor } from '../../services/tela/raster/gl/glBackend';
import { MapAssetSource, renderDocumentCpu } from '../../services/tela/raster/cpuBackend';
import { createDocument, pixelLayer, adjustmentLayer, fillLayer, defaultAdjustment, BLEND_MODES, affineTranslate, type Adjustment, type Filter, type RasterDocument } from '../../services/tela/raster/model';
import { rasterToBitmap, createBitmap, createMask, type Bitmap8 } from '../../services/tela/raster/buffer';
import { resizeBitmap } from '../../services/tela/raster/transform';
import { contentAwareFill } from '../../services/tela/raster/patchmatch';
import { healBrushStroke, spotHeal } from '../../services/tela/raster/retouch';
import { ellipseSelection, rectSelection, featherSelection } from '../../services/tela/raster/selection';
import { RasterWorkerClient } from '../../services/tela/raster/workerClient';

type Out = { images: Record<string, string>; metrics: Record<string, unknown> };

async function decode(dataUrl: string, maxW: number): Promise<Bitmap8> {
  const blob = await (await fetch(dataUrl)).blob(); const ib = await createImageBitmap(blob);
  const c = new OffscreenCanvas(ib.width, ib.height), g = c.getContext('2d')!; g.drawImage(ib, 0, 0);
  const id = g.getImageData(0, 0, ib.width, ib.height); let bm: Bitmap8 = { width: id.width, height: id.height, data: id.data };
  if (bm.width > maxW) bm = resizeBitmap(bm, maxW, Math.round(bm.height * maxW / bm.width), 'lanczos3');
  return bm;
}
function toCanvas(bm: Bitmap8): OffscreenCanvas { const c = new OffscreenCanvas(bm.width, bm.height); c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bm.data), bm.width, bm.height), 0, 0); return c; }
async function sheet(cells: { bm: Bitmap8; label: string }[], cols: number, cellW: number, cellH: number): Promise<string> {
  const rows = Math.ceil(cells.length / cols), pad = 6, lab = 18;
  const c = new OffscreenCanvas(cols * (cellW + pad) + pad, rows * (cellH + lab + pad) + pad), g = c.getContext('2d')!;
  g.fillStyle = '#16131b'; g.fillRect(0, 0, c.width, c.height); g.font = '12px sans-serif';
  cells.forEach((cell, i) => {
    const x = pad + (i % cols) * (cellW + pad), y = pad + Math.floor(i / cols) * (cellH + lab + pad);
    // checkerboard for transparency
    for (let yy = 0; yy < cellH; yy += 8) for (let xx = 0; xx < cellW; xx += 8) { g.fillStyle = ((xx + yy) / 8) % 2 ? '#bbb' : '#ddd'; g.fillRect(x + xx, y + yy, Math.min(8, cellW - xx), Math.min(8, cellH - yy)); }
    g.drawImage(toCanvas(cell.bm), x, y, cellW, cellH);
    g.fillStyle = '#eee'; g.fillText(cell.label, x + 2, y + cellH + 13);
  });
  const blob = await c.convertToBlob({ type: 'image/png' });
  return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
}
function diff(a: Bitmap8, b: Bitmap8) { let max = 0, sum = 0; for (let i = 0; i < a.data.length; i++) { const d = Math.abs(a.data[i] - b.data[i]); if (d > max) max = d; sum += d; } return { max, mean: +(sum / a.data.length).toFixed(3) }; }

(window as any).__run = async (photos: Record<string, string>): Promise<Out> => {
  const out: Out = { images: {}, metrics: {} };
  const photo = await decode(photos.a, 360), photo2 = await decode(photos.b, 360);
  const W = photo.width, H = photo.height;
  const A = new MapAssetSource(); A.bitmaps.set('photo', photo); A.bitmaps.set('photo2', resizeBitmap(photo2, W, H, 'bicubic'));
  const canvas = new OffscreenCanvas(W, H); const gpu = new GlCompositor(canvas, A);
  const both = (doc: RasterDocument) => {
    const t0 = performance.now(); const g = rasterToBitmap(gpu.renderToRaster(doc, { x: 0, y: 0, scale: 1, width: doc.width, height: doc.height }), doc.blendSpace === 'linear'); const tg = performance.now() - t0;
    const t1 = performance.now(); const c = rasterToBitmap(renderDocumentCpu(doc, A), doc.blendSpace === 'linear'); const tc = performance.now() - t1;
    return { g, c, d: diff(g, c), tg, tc };
  };
  // ── Blend modes: photo2 (top) over photo (bottom) ─────────────────────────
  const blendCells: { bm: Bitmap8; label: string }[] = []; const blendDiff: Record<string, unknown> = {};
  for (const mode of BLEND_MODES) {
    const doc = createDocument(W, H, { background: null });
    doc.layers = [pixelLayer({ assetId: 'photo' }, W, H), pixelLayer({ assetId: 'photo2' }, W, H, { blend: mode, opacity: mode === 'dissolve' ? 0.5 : 1 })];
    const r = both(doc); blendCells.push({ bm: r.g, label: `${mode}  Δmax ${r.d.max}` }); blendDiff[mode] = r.d;
  }
  out.images['blend-modes'] = await sheet(blendCells, 6, W / 2, H / 2); out.metrics.blendGpuVsCpu = blendDiff;
  // ── Adjustments ─────────────────────────────────────────────────────────
  const adjs: [string, Adjustment][] = [
    ['levels', { type: 'levels', master: { inBlack: 0.08, inWhite: 0.85, gamma: 1.2, outBlack: 0, outWhite: 1 } }],
    ['curves S', { type: 'curves', master: [[0, 0], [0.25, 0.18], [0.75, 0.85], [1, 1]], b: [[0, 0.05], [1, 0.95]] }],
    ['hue/sat +40 −reds', { type: 'hueSaturation', hue: 40, saturation: 25, lightness: 0, ranges: [{ range: 'greens', hue: 0, saturation: -100, lightness: 0 }] }],
    ['colorize', { type: 'hueSaturation', hue: 30, saturation: 45, lightness: 0, colorize: true }],
    ['color balance', { type: 'colorBalance', shadows: [-20, 0, 30], midtones: [25, 0, -25], highlights: [10, 0, -10], preserveLuminosity: true }],
    ['vibrance +80', { type: 'vibrance', vibrance: 80, saturation: 0 }],
    ['exposure +1', { type: 'exposure', exposure: 1, offset: 0, gamma: 1 }],
    ['brightness/contrast', { type: 'brightnessContrast', brightness: 30, contrast: 50 }],
    ['black & white', defaultAdjustment('blackWhite')],
    ['photo filter warm', { type: 'photoFilter', color: [236, 138, 0], density: 0.5, preserveLuminosity: true }],
    ['channel mixer', { type: 'channelMixer', red: [0, 100, 0, 0], green: [100, 0, 0, 0], blue: [0, 0, 100, 0] }],
    ['gradient map', { type: 'gradientMap', gradient: { stops: [{ offset: 0, color: [20, 0, 60] }, { offset: 0.5, color: [220, 40, 90] }, { offset: 1, color: [255, 230, 120] }] } }],
    ['selective color', { type: 'selectiveColor', method: 'relative', greens: [60, -40, 40, 0], neutrals: [0, 0, -15, 0] }],
    ['invert', { type: 'invert' }], ['posterize 5', { type: 'posterize', levels: 5 }], ['threshold', { type: 'threshold', level: 0.5 }],
  ];
  const lutLines = ['LUT_3D_SIZE 17']; for (let b = 0; b < 17; b++) for (let g = 0; g < 17; g++) for (let r = 0; r < 17; r++) { const R = r / 16, G = g / 16, B = b / 16; lutLines.push(`${(0.9 * R + 0.1 * B).toFixed(5)} ${(G * G * 0.3 + G * 0.7).toFixed(5)} ${(B * 0.8 + 0.2 * R).toFixed(5)}`); }
  adjs.push(['3D LUT (.cube)', { type: 'lut3d', cube: lutLines.join('\n') }]);
  const adjCells: { bm: Bitmap8; label: string }[] = [{ bm: photo, label: 'original' }]; const adjDiff: Record<string, unknown> = {};
  for (const [name, a] of adjs) {
    const doc = createDocument(W, H); doc.layers = [pixelLayer({ assetId: 'photo' }, W, H), adjustmentLayer(a)];
    const r = both(doc); adjCells.push({ bm: r.g, label: `${name}  Δ ${r.d.max}/${r.d.mean}` }); adjDiff[name] = r.d;
  }
  out.images['adjustments'] = await sheet(adjCells, 6, W / 2, H / 2); out.metrics.adjustGpuVsCpu = adjDiff;
  // ── Filters (smart filters) ──────────────────────────────────────────────
  const filters: [string, Filter][] = [
    ['gaussian 4', { type: 'gaussianBlur', radius: 4 }], ['box 6', { type: 'boxBlur', radius: 6 }], ['motion 20°', { type: 'motionBlur', angle: 20, distance: 24 }],
    ['zoom blur', { type: 'radialBlur', mode: 'zoom', amount: 20, cx: 0.5, cy: 0.5 }], ['spin blur', { type: 'radialBlur', mode: 'spin', amount: 12, cx: 0.5, cy: 0.5 }],
    ['surface blur', { type: 'surfaceBlur', radius: 5, threshold: 25 }], ['unsharp 150%', { type: 'unsharpMask', amount: 150, radius: 2, threshold: 0 }],
    ['high pass', { type: 'highPass', radius: 3 }], ['add noise', { type: 'addNoise', amount: 12, gaussian: true, monochromatic: true }],
    ['reduce noise', { type: 'reduceNoise', strength: 6, preserveDetails: 40 }], ['median 3', { type: 'median', radius: 3 }],
    ['emboss', { type: 'emboss', angle: 135, height: 2, amount: 300 }], ['find edges', { type: 'findEdges' }], ['pixelate 10', { type: 'pixelate', cellSize: 10 }],
    ['oil paint (Kuwahara)', { type: 'oilPaint', radius: 4 }], ['halftone', { type: 'halftone', cellSize: 6, angle: 45 }],
    ['posterize edges', { type: 'posterizeEdges', edgeThickness: 3, edgeIntensity: 3, levels: 5 }], ['dust & scratches', { type: 'dustAndScratches', radius: 2, threshold: 20 }],
  ];
  const fCells: { bm: Bitmap8; label: string }[] = []; const fDiff: Record<string, unknown> = {};
  for (const [name, f] of filters) {
    const doc = createDocument(W, H); doc.layers = [pixelLayer({ assetId: 'photo' }, W, H, { smartFilters: [{ id: 'f', enabled: true, filter: f }] })];
    const r = both(doc); fCells.push({ bm: r.g, label: `${name}  Δ ${r.d.max}/${r.d.mean}` }); fDiff[name] = { ...r.d, gpuMs: +r.tg.toFixed(1), cpuMs: +r.tc.toFixed(1) };
  }
  out.images['filters'] = await sheet(fCells, 6, W / 2, H / 2); out.metrics.filtersGpuVsCpu = fDiff;
  // ── Layer styles + masks + clipping + fill layers ────────────────────────
  {
    const sq = createBitmap(120, 120, [255, 255, 255, 255]); for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) { const dx = x - 60, dy = y - 60; if (dx * dx + dy * dy > 3600) sq.data[(y * 120 + x) * 4 + 3] = 0; }
    A.bitmaps.set('disc', sq);
    const doc = createDocument(W, H);
    doc.layers = [
      fillLayer({ type: 'gradient', shape: 'linear', angle: 30, scale: 1, gradient: { stops: [{ offset: 0, color: [40, 30, 80] }, { offset: 1, color: [240, 200, 160] }] }, dither: true }),
      pixelLayer({ assetId: 'disc' }, 120, 120, { transform: affineTranslate(40, 40), styles: { dropShadow: { enabled: true, blend: 'multiply', color: [0, 0, 0], opacity: 0.6, angle: 120, distance: 12, spread: 0, size: 14 }, stroke: { enabled: true, blend: 'normal', color: [212, 0, 85], opacity: 1, size: 4, position: 'outside' } } }),
      pixelLayer({ assetId: 'photo' }, W, H, { clipped: true, opacity: 1 }),
      pixelLayer({ assetId: 'disc' }, 120, 120, { transform: affineTranslate(190, 60), styles: { outerGlow: { enabled: true, blend: 'screen', color: [255, 220, 120], opacity: 0.9, spread: 10, size: 24 }, innerShadow: { enabled: true, blend: 'multiply', color: [60, 0, 40], opacity: 0.8, angle: 120, distance: 8, spread: 0, size: 10 }, colorOverlay: { enabled: true, blend: 'normal', color: [0, 160, 200], opacity: 0.7 } } }),
    ];
    const r = both(doc);
    out.images['styles-clipping'] = await sheet([{ bm: r.g, label: `GPU (Δmax ${r.d.max}, mean ${r.d.mean})` }, { bm: r.c, label: 'CPU reference' }], 2, W, H);
    out.metrics.styles = r.d;
  }
  // ── Retouching: content-aware fill + healing ─────────────────────────────
  {
    const big = await decode(photos.c, 640); const bw = big.width, bh = big.height;
    const hole = ellipseSelection(bw, bh, { x: bw * 0.42, y: bh * 0.35, width: bw * 0.16, height: bh * 0.3 });
    const holed = { width: bw, height: bh, data: new Uint8ClampedArray(big.data) };
    for (let i = 0; i < bw * bh; i++) if (hole.data[i] > 0) { holed.data[i * 4] = 255; holed.data[i * 4 + 1] = 0; holed.data[i * 4 + 2] = 255; }
    const t0 = performance.now(); const filled = contentAwareFill(big, hole, { seed: 3 }); const caf = performance.now() - t0;
    const rect = rectSelection(bw, bh, { x: bw * 0.62, y: bh * 0.55, width: bw * 0.18, height: bh * 0.2 });
    const holed2 = { width: bw, height: bh, data: new Uint8ClampedArray(big.data) };
    for (let i = 0; i < bw * bh; i++) if (rect.data[i] > 0) { holed2.data[i * 4] = 0; holed2.data[i * 4 + 1] = 255; holed2.data[i * 4 + 2] = 0; }
    const t1 = performance.now(); const filled2 = contentAwareFill(big, rect, { seed: 5 }); const caf2 = performance.now() - t1;
    out.images['content-aware-fill'] = await sheet([{ bm: holed, label: 'hole (magenta)' }, { bm: filled, label: `PatchMatch fill ${caf.toFixed(0)} ms` }, { bm: holed2, label: 'hole 2 (green)' }, { bm: filled2, label: `fill ${caf2.toFixed(0)} ms` }], 2, bw, bh);
    out.metrics.contentAwareMs = [Math.round(caf), Math.round(caf2)];
    // Healing: paint a blemish (dark blob) then heal it with spot healing + a healing-brush stroke sampled from elsewhere.
    const blem = { width: bw, height: bh, data: new Uint8ClampedArray(big.data) };
    const spots = [[0.3, 0.7, 10], [0.55, 0.2, 14], [0.8, 0.4, 8]];
    for (const [fx, fy, r] of spots) { const cx = fx * bw, cy = fy * bh; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) { const k = ((Math.round(cy) + y) * bw + Math.round(cx) + x) * 4; blem.data[k] *= 0.25; blem.data[k + 1] *= 0.2; blem.data[k + 2] *= 0.2; } }
    let healed = blem; const t2 = performance.now();
    for (const [fx, fy, r] of spots) healed = spotHeal(healed, fx * bw, fy * bh, r * 1.4, { seed: 1 });
    const spot = performance.now() - t2;
    const t3 = performance.now();
    let brushHealed = blem; for (const [fx, fy, r] of spots) brushHealed = healBrushStroke(brushHealed, [{ x: fx * bw, y: fy * bh }], { size: r * 3.2, hardness: 0.8, offsetX: r * 3.5, offsetY: 0 });
    const hb = performance.now() - t3;
    out.images['healing'] = await sheet([{ bm: blem, label: 'blemishes added' }, { bm: healed, label: `spot healing ×3 (${spot.toFixed(0)} ms)` }, { bm: brushHealed, label: `healing brush, 3 dabs (${hb.toFixed(0)} ms)` }, { bm: big, label: 'original' }], 2, bw, bh);
    out.metrics.healMs = { spot: Math.round(spot), brush: Math.round(hb) };
  }
  // ── Perf: 8k × 8k document via tiles ─────────────────────────────────────
  {
    const big = resizeBitmap(photo, 2048, Math.round(2048 * H / W), 'bilinear');
    A.bitmaps.set('big', big);
    const doc = createDocument(8192, 8192);
    doc.layers = [pixelLayer({ assetId: 'big' }, big.width, big.height, { transform: [4, 0, 0, 4, 0, 0] }), adjustmentLayer({ type: 'curves', master: [[0, 0], [0.3, 0.25], [0.7, 0.8], [1, 1]] }), pixelLayer({ assetId: 'photo2' }, W, H, { blend: 'overlay', transform: [8192 / W, 0, 0, 8192 / H, 0, 0], opacity: 0.6 })];
    const t0 = performance.now(); let tiles = 0;
    gpu.flattenTiled(doc, () => { tiles++; }, { tile: 2048 });
    const full = performance.now() - t0;
    const t1 = performance.now(); gpu.renderToRaster(doc, { x: 0, y: 0, scale: 1024 / 8192, width: 1024, height: 1024 }); const prev = performance.now() - t1;
    const t2 = performance.now(); gpu.renderToRaster(doc, { x: 3000, y: 3000, scale: 1, width: 1600, height: 1000 }); const view = performance.now() - t2;
    out.metrics.perf8k = { flattenMs: Math.round(full), tiles, preview1024Ms: Math.round(prev), viewport1600x1000Ms: Math.round(view), textureMB: Math.round(gpu.stats.textureBytes / 1048576), float16: gpu.stats.float16 };
  }
  // ── Worker: same content-aware fill off the main thread (transferable buffers) ──
  if (photos.__worker) {
    const client = new RasterWorkerClient(() => new Worker(URL.createObjectURL(new Blob([photos.__worker], { type: 'text/javascript' }))));
    const big = await decode(photos.c, 640), hole = ellipseSelection(big.width, big.height, { x: big.width * 0.42, y: big.height * 0.35, width: big.width * 0.16, height: big.height * 0.3 });
    const inline = contentAwareFill(big, hole, { seed: 3 });
    const t0 = performance.now(); const viaWorker = await client.run('contentAwareFill', { image: big, hole, opts: { seed: 3 } }); const ms = performance.now() - t0;
    out.metrics.worker = { contentAwareFillMs: Math.round(ms), identicalToInline: diff(inline, viaWorker).max === 0 };
    client.dispose();
  }
  void createMask; void featherSelection;
  gpu.dispose();
  return out;
};
