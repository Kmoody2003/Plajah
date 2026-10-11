// Raster engine — layer-stack semantics on the CPU reference compositor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocumentCpu, flattenCpu, MapAssetSource } from '../services/tela/raster/cpuBackend';
import { createDocument, pixelLayer, adjustmentLayer, fillLayer, groupLayer, migrateLegacyImageDevice, affineTranslate, rectPath, type RasterDocument } from '../services/tela/raster/model';
import { createBitmap, createMask, type Bitmap8 } from '../services/tela/raster/buffer';

const near = (a: number, b: number, eps = 2e-3, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
function px(doc: RasterDocument, assets: MapAssetSource, x: number, y: number) {
  const r = renderDocumentCpu(doc, assets); const i = (y * r.width + x) * 4, a = r.data[i + 3];
  return a > 0 ? [r.data[i] / a, r.data[i + 1] / a, r.data[i + 2] / a, a] : [0, 0, 0, 0];
}
function solid(w: number, h: number, c: [number, number, number, number]): Bitmap8 { return createBitmap(w, h, c); }

test('pixel layer over background, translate, opacity, blend', () => {
  const A = new MapAssetSource(); A.bitmaps.set('red', solid(4, 4, [255, 0, 0, 255]));
  const doc = createDocument(8, 8, { background: [255, 255, 255] });
  doc.layers = [pixelLayer({ assetId: 'red' }, 4, 4, { transform: affineTranslate(2, 2) })];
  assert.deepEqual(px(doc, A, 3, 3).map(v => +v.toFixed(3)), [1, 0, 0, 1]);
  assert.deepEqual(px(doc, A, 0, 0).map(v => +v.toFixed(3)), [1, 1, 1, 1]);
  doc.layers[0].opacity = 0.5; near(px(doc, A, 3, 3)[1], 0.5);
  doc.layers[0].opacity = 1; (doc.layers[0] as any).blend = 'multiply';
  doc.background = [128, 128, 128]; near(px(doc, A, 3, 3)[0], 128 / 255); near(px(doc, A, 3, 3)[1], 0);
});

test('adjustment layer affects everything below; clipped adjustment only its base', () => {
  const A = new MapAssetSource(); A.bitmaps.set('g', solid(4, 4, [0, 255, 0, 255]));
  const doc = createDocument(8, 8, { background: [255, 255, 255] });
  doc.layers = [pixelLayer({ assetId: 'g' }, 4, 4), adjustmentLayer({ type: 'invert' })];
  assert.deepEqual(px(doc, A, 1, 1).map(Math.round), [1, 0, 1, 1]);
  assert.deepEqual(px(doc, A, 6, 6).map(Math.round), [0, 0, 0, 1]);
  doc.layers[1].clipped = true;
  assert.deepEqual(px(doc, A, 1, 1).map(Math.round), [1, 0, 1, 1]);
  assert.deepEqual(px(doc, A, 6, 6).map(Math.round), [1, 1, 1, 1]);
});

test('clipping mask: clipped layer shows only inside base alpha, takes base opacity', () => {
  const A = new MapAssetSource(); A.bitmaps.set('sq', solid(2, 2, [0, 0, 255, 255])); A.bitmaps.set('red', solid(8, 8, [255, 0, 0, 255]));
  const doc = createDocument(8, 8, { background: [255, 255, 255] });
  doc.layers = [pixelLayer({ assetId: 'sq' }, 2, 2, { transform: affineTranslate(3, 3) }), pixelLayer({ assetId: 'red' }, 8, 8, { clipped: true })];
  assert.deepEqual(px(doc, A, 3, 3).map(Math.round), [1, 0, 0, 1]);
  assert.deepEqual(px(doc, A, 0, 0).map(Math.round), [1, 1, 1, 1]);
  doc.layers[0].opacity = 0.5; near(px(doc, A, 3, 3)[1], 0.5); // red at 50% over white
});

test('groups: pass-through lets inner adjustments reach below; isolated does not', () => {
  const A = new MapAssetSource(); A.bitmaps.set('k', solid(8, 8, [0, 0, 0, 255])); A.bitmaps.set('w', solid(2, 2, [255, 255, 255, 255]));
  const doc = createDocument(8, 8, { background: null });
  const inner = [pixelLayer({ assetId: 'w' }, 2, 2), adjustmentLayer({ type: 'invert' })];
  doc.layers = [pixelLayer({ assetId: 'k' }, 8, 8), groupLayer(inner, { blend: 'pass-through' })];
  assert.deepEqual(px(doc, A, 5, 5).map(Math.round), [1, 1, 1, 1]); // black below inverted
  assert.deepEqual(px(doc, A, 0, 0).map(Math.round), [0, 0, 0, 1]); // white square inverted
  (doc.layers[1] as any).blend = 'normal';
  assert.deepEqual(px(doc, A, 5, 5).map(Math.round), [0, 0, 0, 1]); // isolated: below untouched
  assert.deepEqual(px(doc, A, 0, 0).map(Math.round), [0, 0, 0, 1]);
  // group opacity
  doc.layers[1].opacity = 0.5; doc.layers[1].visible = true;
});

test('layer masks: bitmap (with default colour) and vector', () => {
  const A = new MapAssetSource(); A.bitmaps.set('r', solid(8, 8, [255, 0, 0, 255]));
  const m = createMask(4, 8, 255); A.masks.set('m', m);
  const doc = createDocument(8, 8, { background: [0, 0, 0] });
  doc.layers = [pixelLayer({ assetId: 'r' }, 8, 8, { mask: { kind: 'bitmap', enabled: true, assetId: 'm', bounds: { x: 0, y: 0, width: 4, height: 8 }, defaultColor: 0 } })];
  near(px(doc, A, 1, 4)[0], 1); near(px(doc, A, 6, 4)[0], 0);
  doc.layers[0].mask = { ...(doc.layers[0].mask as any), invert: true }; near(px(doc, A, 1, 4)[0], 0); near(px(doc, A, 6, 4)[0], 1);
  doc.layers[0].mask = undefined; doc.layers[0].vectorMask = { enabled: true, subpaths: [rectPath(2, 2, 4, 4)] };
  near(px(doc, A, 3, 3)[0], 1); near(px(doc, A, 0, 0)[0], 0);
});

test('fill layers: solid and gradient', () => {
  const A = new MapAssetSource();
  const doc = createDocument(10, 1, { background: null });
  doc.layers = [fillLayer({ type: 'gradient', shape: 'linear', angle: 0, scale: 1, gradient: { stops: [{ offset: 0, color: [0, 0, 0] }, { offset: 1, color: [255, 255, 255] }] } })];
  const r = renderDocumentCpu(doc, A);
  near(r.data[0], 0.05, 0.01); near(r.data[9 * 4], 0.95, 0.01);
  doc.layers = [fillLayer({ type: 'solid', color: [10, 20, 30] })];
  near(px(doc, A, 4, 0)[2], 30 / 255);
});

test('layer styles: drop shadow lands offset, stroke outside surrounds', () => {
  const A = new MapAssetSource(); A.bitmaps.set('sq', solid(4, 4, [255, 255, 255, 255]));
  const doc = createDocument(16, 16, { background: [255, 255, 255] });
  doc.layers = [pixelLayer({ assetId: 'sq' }, 4, 4, { transform: affineTranslate(4, 4), styles: { dropShadow: { enabled: true, blend: 'multiply', color: [0, 0, 0], opacity: 1, angle: 135, distance: 4, spread: 100, size: 0 } } })];
  // light from 135° (upper-left) → shadow moves right/down by 4/√2·… : x+=2.83, y+=2.83
  assert.ok(px(doc, A, 9, 9)[0] < 0.05, 'shadow below-right');
  assert.ok(px(doc, A, 2, 2)[0] > 0.99, 'no shadow above-left');
  near(px(doc, A, 5, 5)[0], 1, 1e-3, 'knockout under layer');
  doc.layers[0].styles = { stroke: { enabled: true, blend: 'normal', color: [255, 0, 0], opacity: 1, size: 2, position: 'outside' } };
  doc.background = [0, 0, 0];
  near(px(doc, A, 3, 5)[0], 1); near(px(doc, A, 3, 5)[1], 0); // 1px left of the square: stroke
  near(px(doc, A, 5, 5)[1], 1); // inside: white
  near(px(doc, A, 0, 0)[0], 0); // far away: background
});

test('tiled flatten == single render (blur smart filter is seamless across tiles)', () => {
  const A = new MapAssetSource(); const bm = createBitmap(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const k = (y * 64 + x) * 4; bm.data[k] = (x * 4) & 255; bm.data[k + 1] = (y * 4) & 255; bm.data[k + 2] = ((x ^ y) * 8) & 255; bm.data[k + 3] = 255; }
  A.bitmaps.set('img', bm);
  const doc = createDocument(64, 64);
  doc.layers = [pixelLayer({ assetId: 'img' }, 64, 64, { smartFilters: [{ id: 'f', enabled: true, filter: { type: 'gaussianBlur', radius: 3 } }] })];
  const whole = flattenCpu(doc, A, { tile: 4096 }), tiled = flattenCpu(doc, A, { tile: 16 });
  let worst = 0; for (let i = 0; i < whole.data.length; i++) worst = Math.max(worst, Math.abs(whole.data[i] - tiled.data[i]));
  assert.ok(worst <= 1, `tile seam error ${worst}`);
});

test('zoomed-out preview uses mip levels (checkerboard → grey, no aliasing)', () => {
  const A = new MapAssetSource(); const bm = createBitmap(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = (x + y) & 1 ? 255 : 0; const k = (y * 64 + x) * 4; bm.data[k] = bm.data[k + 1] = bm.data[k + 2] = v; bm.data[k + 3] = 255; }
  A.bitmaps.set('c', bm); const doc = createDocument(64, 64); doc.layers = [pixelLayer({ assetId: 'c' }, 64, 64)];
  const r = renderDocumentCpu(doc, A, { view: { scale: 0.125, width: 8, height: 8 } });
  for (let i = 0; i < 64; i++) near(r.data[i * 4], 0.5, 0.02, 'mip grey');
});

test('linear blend space differs from sRGB for 50% normal blend (documented behaviour)', () => {
  const A = new MapAssetSource(); A.bitmaps.set('w', solid(1, 1, [255, 255, 255, 255]));
  const doc = createDocument(1, 1, { background: [0, 0, 0] }); doc.layers = [pixelLayer({ assetId: 'w' }, 1, 1, { opacity: 0.5 })];
  near(flattenCpu(doc, A).data[0], 128, 1);
  doc.blendSpace = 'linear'; near(flattenCpu(doc, A).data[0], 188, 1); // linear 0.5 → sRGB 0.735
});

test('legacy TelaImageDevice migration keeps transform, blend, groups, CSS adjust', () => {
  const doc = migrateLegacyImageDevice({
    id: 'd', type: 'IMAGE', width: 100, height: 80,
    groups: [{ id: 'g1', name: 'G', visible: true, opacity: 0.5, blend: 'multiply' }],
    layers: [
      { id: 'a', src: 'https://x/a.png', x: 10, y: 20, scale: 2, rotation: 90, opacity: 1, blend: 'screen', visible: true, adjust: { brightness: 1.2, contrast: 1, saturate: 1, exposure: 0, blur: 3 }, intrinsicWidth: 10, intrinsicHeight: 10 },
      { id: 'b', src: 'https://x/b.png', x: 0, y: 0, scale: 1, opacity: 0.8, blend: 'normal', visible: true, groupId: 'g1', adjust: { brightness: 1, contrast: 1, saturate: 1, exposure: 0, blur: 0 }, mask: { kind: 'SHAPE', enabled: true, shape: 'ELLIPSE' } },
    ],
  } as any);
  assert.equal(doc.layers.length, 2);
  const a = doc.layers[0] as any; assert.equal(a.blend, 'screen');
  near(a.transform[0], 0, 1e-9); near(a.transform[1], 2); near(a.transform[2], -2); near(a.transform[4], 10); near(a.transform[5], 20);
  assert.equal(a.smartFilters.length, 2); assert.equal(a.smartFilters[0].filter.adjustment.type, 'cssColor'); assert.equal(a.smartFilters[1].filter.radius, 3);
  const g = doc.layers[1] as any; assert.equal(g.kind, 'group'); assert.equal(g.blend, 'pass-through');
  const b = g.children[0]; assert.equal(b.blend, 'multiply'); near(b.opacity, 0.4); assert.ok(b.vectorMask?.enabled);
});
