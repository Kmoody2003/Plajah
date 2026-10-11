// Raster engine — transforms/resampling quality, retouching (Poisson, PatchMatch), filters,
// colour, codecs, PSD, worker op table (CPU, node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeBitmap, homographyFromQuads, warpHomography, transformAffine, flip, rotate90, crop, straightenCropRect, canvasSize, warpMesh, defaultWarpMesh, evalWarpMesh, contentAwareScale } from '../services/tela/raster/transform';
import { solveMembrane, poissonBlend, healBrushStroke, spotHeal, redEye, createToneStroke, CloneSession, createCloneStroke } from '../services/tela/raster/retouch';
import { contentAwareFill } from '../services/tela/raster/patchmatch';
import { applyFilter, gaussianBlur, boxBlur, median } from '../services/tela/raster/filters';
import { eyedropper, histogram, srgbToCmyk, cmykToLinear, softProofColor, convertColorSpace } from '../services/tela/raster/color';
import { encodePng, decodePng, encodePng16, iccProfile, injectJpegIcc } from '../services/tela/raster/codecs';
import { importPsd, exportPsd } from '../services/tela/raster/psd';
import { RASTER_OPS } from '../services/tela/raster/rasterWorker';
import { RasterWorkerClient } from '../services/tela/raster/workerClient';
import { MapAssetSource } from '../services/tela/raster/cpuBackend';
import { createDocument, pixelLayer, adjustmentLayer, groupLayer, affineTranslate } from '../services/tela/raster/model';
import { createBitmap, createMask, createRaster, bitmapToRaster, rasterToBitmap, toHalf, fromHalf, srgbToLinear, type Bitmap8 } from '../services/tela/raster/buffer';
import { ellipseSelection } from '../services/tela/raster/selection';

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const psnr = (a: Bitmap8, b: Bitmap8, mask?: Uint8Array) => { let se = 0, n = 0; for (let p = 0; p < a.width * a.height; p++) { if (mask && !mask[p]) continue; for (let c = 0; c < 3; c++) { const d = a.data[p * 4 + c] - b.data[p * 4 + c]; se += d * d; n++; } } return 10 * Math.log10(255 * 255 / (se / n || 1e-9)); };
/** Smooth test image (sum of sinusoids) — band-limited so resampling quality is measurable. */
function smooth(w: number, h: number, f = 1): Bitmap8 {
  const b = createBitmap(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4; b.data[k] = 128 + 100 * Math.sin(x / (7 * f)) * Math.cos(y / (9 * f)); b.data[k + 1] = 128 + 90 * Math.sin((x + y) / (11 * f)); b.data[k + 2] = 128 + 80 * Math.cos((x - 2 * y) / (13 * f)); b.data[k + 3] = 255; }
  return b;
}
/** Stationary texture (fine stripes + noise-free checker) for inpainting tests. */
function texture(w: number, h: number): Bitmap8 { const b = createBitmap(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4, v = ((Math.floor(x / 4) + Math.floor(y / 4)) & 1) ? 200 : 60; b.data[k] = v; b.data[k + 1] = 255 - v; b.data[k + 2] = (x * 3) & 255 ? 120 : 120; b.data[k + 3] = 255; } return b; }

test('resampling quality: down→up round trip PSNR ranks lanczos ≥ bicubic > bilinear > nearest', () => {
  const src = smooth(128, 128), res: Record<string, number> = {};
  for (const f of ['nearest', 'bilinear', 'bicubic', 'lanczos3'] as const) res[f] = psnr(src, resizeBitmap(resizeBitmap(src, 64, 64, f), 128, 128, f));
  assert.ok(res.lanczos3 >= res.bicubic - 2 && res.bicubic > res.bilinear && res.bilinear > res.nearest, JSON.stringify(res));
  assert.ok(res.lanczos3 > 30, `lanczos round trip ${res.lanczos3.toFixed(1)} dB`);
  // minification is prefiltered: a 1-px checker → flat 50% grey, not moiré
  const chk = createBitmap(64, 64); for (let i = 0; i < 64 * 64; i++) { const v = ((i % 64) + Math.floor(i / 64)) & 1 ? 255 : 0; chk.data.set([v, v, v, 255], i * 4); }
  const small = resizeBitmap(chk, 13, 13, 'lanczos3'); for (let i = 0; i < 13 * 13; i++) near(small.data[i * 4], 128, 12, 'checker → grey');
  // identity resize is exact
  assert.deepEqual(resizeBitmap(src, 128, 128, 'lanczos3').data, src.data);
});

test('free transform / homography / warp / flip / rotate / crop / canvas size', () => {
  const src = smooth(64, 64);
  const id = transformAffine(src, [1, 0, 0, 1, 0, 0], { width: 64, height: 64 }); assert.ok(psnr(src, id) > 45, 'identity affine');
  const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]], dst: [number, number][] = [[2, 3], [14, 1], [12, 15], [1, 11]];
  const H = homographyFromQuads(sq, dst); const m = (x: number, y: number) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
  dst.forEach((d, i) => { const p = m(sq[i][0], sq[i][1]); near(p[0], d[0], 1e-6); near(p[1], d[1], 1e-6); });
  const shifted = warpHomography(src, [1, 0, 5, 0, 1, 0, 0, 0, 1], { width: 64, height: 64, filter: 'bicubic' }); near(shifted.data[(10 * 64 + 20) * 4], src.data[(10 * 64 + 15) * 4], 1);
  const mesh = defaultWarpMesh(64, 64, 2, 2); const p = evalWarpMesh(mesh, 0.3, 0.7); near(p[0], 19.2, 1e-6); near(p[1], 44.8, 1e-6);
  assert.ok(psnr(src, warpMesh(src, mesh, { width: 64, height: 64 })) > 40, 'identity warp mesh');
  assert.deepEqual(flip(flip(src, 'horizontal'), 'horizontal').data, src.data);
  assert.deepEqual(rotate90(rotate90(rotate90(rotate90(src, 'cw'), 'cw'), 'cw'), 'cw').data, src.data);
  const r = rotate90(src, 'cw'); assert.deepEqual([...r.data.slice(0, 4)], [...src.data.slice((63 * 64) * 4, (63 * 64) * 4 + 4)]);
  const c = crop(src, { rect: { x: 10, y: 5, width: 20, height: 30 } }); assert.equal(c.width, 20); assert.deepEqual([...c.data.slice(0, 4)], [...src.data.slice((5 * 64 + 10) * 4, (5 * 64 + 10) * 4 + 4)]);
  const st = straightenCropRect(100, 60, 10); assert.ok(st.width < 100 && st.height < 60 && st.width > 60);
  const cs = canvasSize(src, 80, 70, 'br'); assert.equal(cs.data[3], 0); assert.deepEqual([...cs.data.slice((69 * 80 + 79) * 4, (69 * 80 + 79) * 4 + 4)], [...src.data.slice((63 * 64 + 63) * 4, (63 * 64 + 63) * 4 + 4)]);
});

test('content-aware scale removes low-energy seams and keeps the protected subject', () => {
  const b = createBitmap(60, 20, [120, 120, 120, 255]); for (let y = 0; y < 20; y++) for (let x = 25; x < 35; x++) b.data.set([255, 0, 0, 255], (y * 60 + x) * 4);
  const out = contentAwareScale(b, 40, 20); assert.equal(out.width, 40);
  let red = 0; for (let i = 0; i < 40 * 20; i++) if (out.data[i * 4] === 255 && out.data[i * 4 + 1] === 0) red++;
  assert.ok(red >= 190, `subject survived (${red}/200 px)`);
  const wide = contentAwareScale(b, 70, 20); assert.equal(wide.width, 70);
});

test('membrane (Laplace) solver: linear boundary → exact linear interior', () => {
  const W = 32, H = 32, v = new Float32Array(W * H), u = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { v[y * W + x] = 3 * x + 2 * y; if (x > 4 && x < 27 && y > 4 && y < 27) { u[y * W + x] = 1; v[y * W + x] = 0; } }
  solveMembrane(W, H, 1, v, u); near(v[16 * W + 16], 80, 0.05, 'harmonic interior');
});

test('Poisson blend keeps source texture, adopts destination lighting', () => {
  const W = 40, H = 40, dst = new Float32Array(W * H * 3).fill(50), tex = new Float32Array(W * H * 3), cov = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const x = i % W; for (let c = 0; c < 3; c++) tex[i * 3 + c] = 200 + (x % 2 ? 10 : -10); const y = (i / W) | 0; if (x > 10 && x < 30 && y > 10 && y < 30) cov[i] = 1; }
  const out = poissonBlend(W, H, dst, tex, cov), a = out[(20 * W + 20) * 3], b = out[(20 * W + 21) * 3];
  near((a + b) / 2, 50, 7, 'mean pulled to destination'); // boundary mismatch averages −145 (left/right) and −150 (top/bottom) near(Math.abs(a - b), 20, 1, 'texture amplitude kept');
});

test('healing brush + spot healing remove a blemish on texture', () => {
  const img = smooth(96, 96, 0.6), blem = createBitmap(96, 96); blem.data.set(img.data);
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) { const k = ((48 + y) * 96 + 48 + x) * 4; blem.data[k] = blem.data[k + 1] = blem.data[k + 2] = 0; }
  const mask = new Uint8Array(96 * 96); for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) mask[(48 + y) * 96 + 48 + x] = 1;
  const before = psnr(img, blem, mask), spot = psnr(img, spotHeal(blem, 48.5, 48.5, 8), mask);
  assert.ok(spot > before + 12, `spot heal ${before.toFixed(1)} → ${spot.toFixed(1)} dB`);
  // healing brush: texture × lighting ramp; the source (30 px left) is darker — healing must
  // keep the texture but adopt the destination's lighting (what Poisson blending is for)
  const lit = createBitmap(96, 96); for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const k = (y * 96 + x) * 4, t = ((x >> 2) + (y >> 2)) & 1 ? 1.15 : 0.85, l = 60 + x * 1.6; lit.data.set([l * t, l * t, l * t, 255], k); }
  const litBlem = createBitmap(96, 96); litBlem.data.set(lit.data); for (let p = 0; p < 96 * 96; p++) if (mask[p]) litBlem.data.set([0, 0, 0, 255], p * 4);
  const healed = healBrushStroke(litBlem, [{ x: 48.5, y: 48.5 }], { size: 18, hardness: 0.9, offsetX: -32, offsetY: 0 });
  const meanIn = (b: Bitmap8) => { let s = 0, n = 0; for (let p = 0; p < 96 * 96; p++) if (mask[p]) { s += b.data[p * 4 + 1]; n++; } return s / n; };
  assert.ok(Math.abs(meanIn(healed) - meanIn(lit)) < 8, `healed mean ${meanIn(healed).toFixed(0)} vs original ${meanIn(lit).toFixed(0)} (source area is ~51 darker)`);
  assert.ok(psnr(lit, healed, mask) > 22, `healing brush PSNR ${psnr(lit, healed, mask).toFixed(1)} dB`);
});

test('content-aware fill (PatchMatch) reconstructs a stationary texture hole', () => {
  const img = texture(96, 96), hole = ellipseSelection(96, 96, { x: 34, y: 30, width: 26, height: 30 });
  const holed = createBitmap(96, 96); holed.data.set(img.data); const m = new Uint8Array(96 * 96);
  for (let i = 0; i < 96 * 96; i++) if (hole.data[i]) { m[i] = 1; holed.data[i * 4] = 255; holed.data[i * 4 + 1] = 0; holed.data[i * 4 + 2] = 255; }
  const t0 = Date.now(), out = contentAwareFill(holed, hole, { seed: 2 }), ms = Date.now() - t0;
  const q = psnr(img, out, m);
  assert.ok(q > 14, `CAF PSNR in hole ${q.toFixed(1)} dB (${ms} ms)`);
  // pixels outside the hole are untouched
  let changed = 0; for (let i = 0; i < 96 * 96; i++) if (!hole.data[i] && Math.abs(out.data[i * 4] - holed.data[i * 4]) > 0) changed++;
  assert.ok(changed < 400, `outside mostly untouched (${changed} ring px blended)`);
  // source-area exclusion: forbid the left half → fill only copies from the right half
  const src = createMask(96, 96); for (let y = 0; y < 96; y++) for (let x = 48; x < 96; x++) src.data[y * 96 + x] = 255;
  assert.ok(contentAwareFill(holed, hole, { seed: 2, sourceMask: src }).width === 96);
});

test('red eye, dodge, clone stamp aligned offsets', () => {
  const b = createBitmap(20, 20, [200, 30, 30, 255]); const r = redEye(b, { x: 5, y: 5, width: 10, height: 10 }); assert.ok(r.data[(10 * 20 + 10) * 4] < 80, 'pupil no longer red');
  const d = createBitmap(20, 20, [100, 100, 100, 255]); const s = createToneStroke({ kind: 'rgba', bitmap: d }, { size: 10, hardness: 1, spacing: 0.25, flow: 1, opacity: 1 }, 'dodge', 'midtones', 0.5); s.addPoint({ x: 10, y: 10 }); s.end();
  assert.ok(d.data[(10 * 20 + 10) * 4] > 130, 'dodge lightens midtones');
  const cs = new CloneSession(5, 5, true); assert.deepEqual(cs.begin(20, 20), { dx: -15, dy: -15 }); assert.deepEqual(cs.begin(30, 40), { dx: -15, dy: -15 }, 'aligned keeps offset');
  const na = new CloneSession(5, 5, false); na.begin(20, 20); assert.deepEqual(na.begin(30, 40), { dx: -25, dy: -35 });
  const src = createBitmap(40, 40); for (let i = 0; i < 1600; i++) src.data.set([i % 40 * 6, 0, 0, 255], i * 4);
  const dst = createBitmap(40, 40, [0, 0, 0, 255]); const st = createCloneStroke({ kind: 'rgba', bitmap: dst }, src, { dx: -10, dy: 0 }, { size: 6, hardness: 1, spacing: 0.25, flow: 1, opacity: 1 });
  st.addPoint({ x: 30.5, y: 20.5 }); st.end(); near(dst.data[(20 * 40 + 30) * 4], 20 * 6, 3, 'cloned from x−10');
});

test('filters: gaussian ≈ box³, median kills salt noise, every filter runs', () => {
  const r = bitmapToRaster(smooth(48, 48));
  const g = gaussianBlur(r, 3); let sum0 = 0, sum1 = 0; for (let y = 12; y < 36; y++) for (let x = 12; x < 36; x++) { const i = (y * 48 + x) * 4; sum0 += r.data[i]; sum1 += g.data[i]; }
  near(sum1 / sum0, 1, 0.03, 'blur preserves energy (interior)');
  const salt = createRaster(9, 9); for (let i = 0; i < 81; i++) salt.data.set([0.5, 0.5, 0.5, 1], i * 4); salt.data.set([1, 1, 1, 1], 40 * 4);
  near(median(salt, 1).data[40 * 4], 0.5, 1e-6); near(boxBlur(salt, 1).data[40 * 4], 0.5 + 0.5 / 9, 1e-6);
  const all = [{ type: 'motionBlur', angle: 30, distance: 6 }, { type: 'radialBlur', mode: 'zoom', amount: 10, cx: 0.5, cy: 0.5 }, { type: 'surfaceBlur', radius: 2, threshold: 20 }, { type: 'unsharpMask', amount: 100, radius: 1, threshold: 0 }, { type: 'smartSharpen', amount: 100, radius: 1, reduceNoise: 10 }, { type: 'highPass', radius: 2 }, { type: 'addNoise', amount: 10, gaussian: true, monochromatic: false }, { type: 'reduceNoise', strength: 5, preserveDetails: 50 }, { type: 'reduceNoise', strength: 5, preserveDetails: 50, method: 'nlm' }, { type: 'dustAndScratches', radius: 1, threshold: 10 }, { type: 'emboss', angle: 45, height: 1, amount: 100 }, { type: 'findEdges' }, { type: 'pixelate', cellSize: 4 }, { type: 'oilPaint', radius: 2 }, { type: 'halftone', cellSize: 4, angle: 45 }, { type: 'posterizeEdges', edgeThickness: 2, edgeIntensity: 2, levels: 4 }] as const;
  for (const f of all) { const o = applyFilter(r, f as any, { originX: 0, originY: 0, docWidth: 48, docHeight: 48, scale: 1, linear: false }); assert.equal(o.data.length, r.data.length, f.type); assert.ok(o.data.every(Number.isFinite), `${f.type} finite`); }
  const flat = createRaster(16, 16); for (let i = 0; i < 256; i++) flat.data.set([0.3, 0.6, 0.9, 1], i * 4);
  const hp = applyFilter(flat, { type: 'highPass', radius: 3 }); near(hp.data[(8 * 16 + 8) * 4], 0.5, 1e-4, 'high pass of a flat image = 50% grey');
});

test('colour: eyedropper averages, histogram stats, half floats, P3 round trip, CMYK model', () => {
  const b = createBitmap(3, 3); for (let i = 0; i < 9; i++) b.data.set([i * 10, 0, 0, 255], i * 4);
  assert.deepEqual(eyedropper(b, 1, 1, '3x3'), [40, 0, 0, 255]); assert.deepEqual(eyedropper(b, 1, 1), [40, 0, 0, 255]);
  const h = histogram(b); near(h.stats.r.mean, 40, 1e-9); assert.equal(h.stats.r.min, 0); assert.equal(h.stats.r.max, 80); assert.equal(h.stats.r.median, 40);
  for (const v of [0, 1, 0.5, 0.333, 1e-4, 65504]) near(fromHalf(toHalf(v)), v, Math.abs(v) * 1e-3 + 1e-7, `half ${v}`);
  const p3 = convertColorSpace(convertColorSpace(b, 'srgb', 'display-p3'), 'display-p3', 'srgb'); for (let i = 0; i < 9; i++) near(p3.data[i * 4], b.data[i * 4], 1);
  const w = srgbToCmyk(1, 1, 1); assert.ok(w.every(v => v < 0.02), 'white = no ink');
  const k = srgbToCmyk(0, 0, 0); assert.ok(k[3] > 0.6 && k[0] + k[1] + k[2] + k[3] <= 3.0001, `black uses K and the ink limit ${k}`);
  const grey = softProofColor(0.5, 0.5, 0.5); near(grey[0], 0.5, 0.03, 'grey reproduces');
  const vivid = softProofColor(0, 0, 1); assert.ok(vivid[2] < 0.95 || vivid[0] > 0.05, 'sRGB blue is out of press gamut → dulled');
  const lin = cmykToLinear(0, 0, 0, 0); near(lin[0], 1, 1e-6); near(srgbToLinear(1), 1, 1e-9);
});

test('codecs: PNG 8/16-bit round trip with sRGB chunk, ICC profile, JPEG APP2 injection', async () => {
  const b = smooth(17, 9); b.data[3] = 128;
  const png = await encodePng(b, { dpi: 300 }); const back = await decodePng(png);
  assert.deepEqual(back.data, b.data); assert.ok(back.chunks.includes('sRGB') && back.chunks.includes('pHYs'));
  const p3 = await decodePng(await encodePng(b, { colorSpace: 'display-p3' })); assert.ok(p3.chunks.includes('iCCP'));
  const r16 = bitmapToRaster(b); const png16 = await encodePng16(r16); assert.equal(png16[24], 16, 'bit depth 16');
  const icc = iccProfile('srgb'); assert.equal(new DataView(icc.buffer).getUint32(0), icc.length); assert.equal(String.fromCharCode(...icc.slice(36, 40)), 'acsp');
  const fakeJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xd9]); const tagged = injectJpegIcc(fakeJpeg, icc);
  assert.equal(tagged[8], 0xff); assert.equal(tagged[9], 0xe2); assert.equal(String.fromCharCode(...tagged.slice(12, 23)), 'ICC_PROFILE');
  void rasterToBitmap;
});

test('PSD export → import round trip (layers, groups, blend, opacity, masks, adjustments, clipping)', () => {
  const A = new MapAssetSource(); A.bitmaps.set('a', smooth(32, 24)); A.bitmaps.set('b', createBitmap(10, 10, [255, 0, 0, 200]));
  const mk = createMask(10, 10, 255); mk.data.fill(0, 0, 50); A.masks.set('m', mk);
  const doc = createDocument(40, 30, { background: null });
  doc.layers = [
    pixelLayer({ assetId: 'a' }, 32, 24, { name: 'Photo', transform: affineTranslate(4, 3) }),
    groupLayer([pixelLayer({ assetId: 'b' }, 10, 10, { name: 'Red', blend: 'multiply', opacity: 0.6, transform: affineTranslate(5, 5), mask: { kind: 'bitmap', enabled: true, assetId: 'm', bounds: { x: 5, y: 5, width: 10, height: 10 }, defaultColor: 0 } }), adjustmentLayer({ type: 'levels', master: { inBlack: 0.1, inWhite: 0.9, gamma: 1.2, outBlack: 0, outWhite: 1 } }, { clipped: true })], { name: 'Grp', blend: 'pass-through' }),
    adjustmentLayer({ type: 'curves', master: [[0, 0], [0.5, 0.6], [1, 1]] }, { name: 'Curves', blend: 'soft-light' }),
  ];
  const { bytes, warnings } = exportPsd(doc, A);
  assert.ok(bytes.length > 1000); assert.deepEqual(warnings, []);
  const stored = new Map<string, Bitmap8>();
  const r = importPsd(bytes, { putBitmap: (bm, n) => { stored.set(n, bm); return 'k:' + n; }, putMask: (_m, n) => 'mk:' + n });
  assert.equal(r.doc.width, 40); assert.equal(r.doc.layers.length, 3);
  const [photo, grp, curves] = r.doc.layers as any[];
  assert.equal(photo.name, 'Photo'); assert.equal(photo.transform[4], 4); assert.equal(photo.transform[5], 3);
  assert.deepEqual([...stored.get('Photo')!.data.slice(0, 8)], [...A.bitmaps.get('a')!.data.slice(0, 8)]);
  assert.equal(grp.kind, 'group'); assert.equal(grp.blend, 'pass-through'); assert.equal(grp.children.length, 2);
  assert.equal(grp.children[0].blend, 'multiply'); near(grp.children[0].opacity, 0.6, 0.01); assert.equal(grp.children[0].mask.bounds.x, 5);
  assert.equal(grp.children[1].kind, 'adjustment'); assert.equal(grp.children[1].clipped, true); near(grp.children[1].adjustment.master.gamma, 1.2, 0.01);
  assert.equal(curves.adjustment.type, 'curves'); assert.equal(curves.blend, 'soft-light'); near(curves.adjustment.master[1][1], 0.6, 0.01);
});

test('worker op table runs inline (node) with identical results', async () => {
  const c = new RasterWorkerClient(); const img = smooth(32, 32);
  const viaClient = await c.run('resize', { image: img, width: 16, height: 16, filter: 'lanczos3' });
  assert.deepEqual(viaClient.data, RASTER_OPS.resize({ image: img, width: 16, height: 16, filter: 'lanczos3' }).data);
});
