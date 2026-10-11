// Image Studio — pure logic: tool state machine, view maths, free transform, layer/doc ops,
// preview cache keys and the legacy-op mirror (node, no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialToolState, toolReducer, effectiveTool, nextBrushSize, nextHardness, opacityFromDigits, SPRING_HOLD_MS, TOOL_GROUPS, swapColors, DEFAULT_COLORS } from '../components/tela/image/tools';
import { docToScreen, screenToDoc, zoomAt, fitView, stepZoom, panBy, renderRegion, rulerTicks, pinchView, rotateView, visibleDocRect } from '../components/tela/image/viewport';
import { beginTransform, dragHandle, corners, hitHandle, isAffine, rotateAbout, toWarp, outputBounds, readout } from '../components/tela/image/freeTransform';
import { layerRows, moveLayer, groupLayers, ungroup, duplicateLayer, arrange, cropDocument, canvasSizeDocument, rotateCanvas, flipCanvas, allLayerIds, transformDocument } from '../components/tela/image/layerOps';
import { previewKey, rasterJsonKey, isPreviewFresh, resolvePreview, PreviewLru, previewSize } from '../components/tela/image/previewCache';
import { mirrorLegacyAdd, mirrorLegacyDelete, mirrorLegacyUpdate, legacyLayerToRaster } from '../components/tela/image/rasterLegacyBridge';
import { createDocument, pixelLayer, adjustmentLayer, defaultAdjustment, groupLayer, findLayer, affineApply, migrateLegacyImageDevice, type RasterDocument, type PixelLayer } from '../services/tela/raster/model';
import { applyTelaOp } from '../components/tela/telaOps';
import type { TelaDoc, TelaImageDevice, TelaImageLayer } from '../types';

const near = (a: number, b: number, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

// ── tools ─────────────────────────────────────────────────────────────────────────────────
test('tool keys: letter selects the group, Shift+letter cycles, groups remember their tool', () => {
  let s = initialToolState('move');
  s = toolReducer(s, { type: 'keydown', key: 'm', at: 0 }); assert.equal(s.tool, 'marquee-rect');
  s = toolReducer(s, { type: 'keyup', key: 'm', at: 50 });
  s = toolReducer(s, { type: 'keydown', key: 'm', shift: true, at: 100 }); assert.equal(s.tool, 'marquee-ellipse');
  s = toolReducer(s, { type: 'keyup', key: 'm', at: 150 });
  s = toolReducer(s, { type: 'keydown', key: 'm', shift: true, at: 200 }); assert.equal(s.tool, 'marquee-rect', 'single row/col are not in the Shift cycle');
  s = toolReducer(s, { type: 'keyup', key: 'm', at: 250 });
  s = toolReducer(s, { type: 'keydown', key: 'j', shift: false, at: 300 }); s = toolReducer(s, { type: 'keyup', key: 'j', at: 320 });
  s = toolReducer(s, { type: 'keydown', key: 'j', shift: true, at: 400 }); s = toolReducer(s, { type: 'keyup', key: 'j', at: 420 });
  assert.equal(s.tool, 'heal');
  s = toolReducer(s, { type: 'keydown', key: 'b', at: 500 }); s = toolReducer(s, { type: 'keyup', key: 'b', at: 520 });
  s = toolReducer(s, { type: 'keydown', key: 'j', at: 600 }); assert.equal(s.tool, 'heal', 'J returns to the last healing tool');
  assert.ok(TOOL_GROUPS.every(g => !g.key || g.key.length === 1));
});
test('spring-loaded tools: hold a letter, use it, release → previous tool; a tap keeps the new tool', () => {
  let s = initialToolState('brush');
  s = toolReducer(s, { type: 'keydown', key: 'e', at: 0 }); assert.equal(s.tool, 'eraser');
  s = toolReducer(s, { type: 'used' });
  s = toolReducer(s, { type: 'keyup', key: 'e', at: 120 }); assert.equal(s.tool, 'brush');
  s = toolReducer(s, { type: 'keydown', key: 'e', at: 1000 }); s = toolReducer(s, { type: 'keyup', key: 'e', at: 1080 });
  assert.equal(s.tool, 'eraser', 'quick tap switches for good');
  s = toolReducer(s, { type: 'keydown', key: 'b', at: 2000 }); s = toolReducer(s, { type: 'keyup', key: 'b', at: 2000 + SPRING_HOLD_MS + 10 });
  assert.equal(s.tool, 'eraser', 'a long hold springs back even unused');
});
test('momentary tools: Space = hand, Ctrl+Space zoom, Alt = eyedropper for painters, Ctrl = move', () => {
  let s = initialToolState('brush');
  s = toolReducer(s, { type: 'modifiers', space: true, alt: false, ctrl: false }); assert.equal(effectiveTool(s), 'hand');
  s = toolReducer(s, { type: 'modifiers', space: true, alt: false, ctrl: true }); assert.equal(s.momentary, 'zoom-in'); assert.equal(effectiveTool(s), 'zoom');
  s = toolReducer(s, { type: 'modifiers', space: false, alt: true, ctrl: false }); assert.equal(effectiveTool(s), 'eyedropper');
  s = toolReducer(s, { type: 'modifiers', space: false, alt: false, ctrl: true }); assert.equal(effectiveTool(s), 'move');
  s = toolReducer(s, { type: 'modifiers', space: false, alt: false, ctrl: false }); assert.equal(effectiveTool(s), 'brush');
  let c = toolReducer(initialToolState('clone'), { type: 'modifiers', space: false, alt: true, ctrl: false });
  assert.equal(effectiveTool(c), 'clone', 'Alt on clone sets the source, not the eyedropper');
  c = toolReducer(initialToolState('type'), { type: 'modifiers', space: false, alt: false, ctrl: true }); assert.equal(effectiveTool(c), 'type');
});
test('brush size / hardness / opacity keys follow Photoshop steps', () => {
  assert.equal(nextBrushSize(9, 1), 10); assert.equal(nextBrushSize(10, 1), 15); assert.equal(nextBrushSize(10, -1), 9);
  assert.equal(nextBrushSize(50, -1), 45); assert.equal(nextBrushSize(100, 1), 125); assert.equal(nextBrushSize(1, -1), 1);
  assert.equal(nextHardness(0.5, 1), 0.75); assert.equal(nextHardness(1, 1), 1);
  const a = opacityFromDigits(null, '5', 0); assert.equal(a.value, 0.5);
  const b = opacityFromDigits(a.memo, '5', 200); assert.equal(b.value, 0.55);
  assert.equal(opacityFromDigits(null, '0', 0).value, 1);
  assert.equal(opacityFromDigits(a.memo, '7', 2000).value, 0.7, 'slow second digit starts over');
  assert.deepEqual(swapColors(DEFAULT_COLORS), { fg: [255, 255, 255], bg: [0, 0, 0] });
});

// ── viewport ──────────────────────────────────────────────────────────────────────────────
test('view mapping round-trips with zoom + rotation; zoomAt keeps the cursor point fixed', () => {
  const vp = { width: 1200, height: 800 }, v = { cx: 1900, cy: 1100, zoom: 0.37, rotation: 23 };
  const [sx, sy] = docToScreen(v, vp, 2500, 700), [dx, dy] = screenToDoc(v, vp, sx, sy); near(dx, 2500, 1e-6); near(dy, 700, 1e-6);
  const z = zoomAt(v, vp, 300, 200, 2), before = screenToDoc(v, vp, 300, 200), after = screenToDoc(z, vp, 300, 200);
  near(after[0], before[0], 1e-6); near(after[1], before[1], 1e-6); assert.equal(z.zoom, 2);
  const p = panBy(v, 40, -10), [ax, ay] = docToScreen(p, vp, 2500, 700); near(ax, sx + 40, 1e-6); near(ay, sy - 10, 1e-6);
  assert.equal(rotateView({ ...v, rotation: 170 }, 20).rotation, -170);
});
test('fit / zoom steps / rotated render region / visible rect', () => {
  const f = fitView({ width: 3840, height: 2160 }, { width: 1200, height: 800 }, 32);
  near(f.zoom, (1200 - 64) / 3840, 1e-9); assert.equal(f.cx, 1920);
  assert.equal(stepZoom(1, 1), 2); assert.equal(stepZoom(1, -1), 2 / 3); assert.equal(stepZoom(0.3, 1), 1 / 3);
  const r0 = renderRegion({ cx: 100, cy: 50, zoom: 2, rotation: 0 }, { width: 400, height: 300 }, 2);
  assert.deepEqual([r0.view.width, r0.view.height, r0.view.scale], [800, 600, 4]); near(r0.view.x, 0); near(r0.view.y, -25);
  const r1 = renderRegion({ cx: 100, cy: 50, zoom: 1, rotation: 30 }, { width: 400, height: 300 }, 1);
  assert.equal(r1.css.width, 500); assert.equal(r1.css.rotate, 30); near(r1.css.left, -50); near(r1.css.top, -100);
  const vis = visibleDocRect({ cx: 500, cy: 500, zoom: 1, rotation: 0 }, { width: 200, height: 100 }); assert.deepEqual(vis, { x: 400, y: 450, width: 200, height: 100 });
});
test('ruler ticks pick a readable step at any zoom', () => {
  const t = rulerTicks(0, 1000, 1); const majors = t.filter(x => x.major);
  assert.ok(majors.length >= 5 && majors.length <= 20); assert.equal(majors[0].label, '0');
  const z = rulerTicks(0, 40, 32).filter(x => x.major); assert.ok(z.length >= 10, 'zoomed in: fine ticks');
});
test('pinch: two-finger zoom anchors the midpoint', () => {
  const vp = { width: 800, height: 600 }, v = { cx: 400, cy: 300, zoom: 1, rotation: 0 };
  const n = pinchView(v, vp, [300, 300], [500, 300], [250, 300], [550, 300]);
  near(n.zoom, 1.5); const m = screenToDoc(n, vp, 400, 300); near(m[0], 400); near(m[1], 300);
});

// ── free transform ────────────────────────────────────────────────────────────────────────
test('free transform: corner scales proportionally, Shift frees aspect, Alt scales about the pivot', () => {
  const s = beginTransform(200, 100, [1, 0, 0, 1, 10, 20]);
  const a = dragHandle(s, 'br', [210, 120], [410, 150]);
  const q = corners(a); near(q[2][0], 410); near(q[2][1], 220, 1e-6, 'proportional: height follows width'); near(q[0][0], 10); near(q[0][1], 20);
  const b = dragHandle(s, 'br', [210, 120], [410, 150], { shift: true }); near(corners(b)[2][1], 150);
  const c = dragHandle(s, 'r', [210, 70], [310, 70]); near(corners(c)[1][0], 310); near(corners(c)[2][1], 120, 1e-6, 'edge: one axis');
  const d = dragHandle(s, 'br', [210, 120], [310, 170], { alt: true }); const qd = corners(d);
  near((qd[0][0] + qd[2][0]) / 2, 110); near((qd[0][1] + qd[2][1]) / 2, 70, 1e-6, 'about the centre');
  assert.ok(isAffine(a));
});
test('free transform: rotate about pivot with 15° snapping, move, skew, distort, perspective, warp', () => {
  const s = beginTransform(100, 100, [1, 0, 0, 1, 0, 0]);
  const r = dragHandle(s, 'rotate', [150, 50], [50 + 100 * Math.cos(0.4), 50 + 100 * Math.sin(0.4)], { shift: true });
  near(readout(r).angle, 30, 1e-6, 'snapped to 30°'); near(corners(r)[0][0] + corners(r)[2][0], 100, 1e-9, 'centre stays');
  const m = dragHandle(s, 'move', [50, 50], [60, 45]); near(corners(m)[0][0], 10); near(corners(m)[0][1], -5);
  const k = dragHandle(s, 't', [50, 0], [80, 0], { ctrl: true }); assert.ok(isAffine(k)); near(corners(k)[0][0], 30); near(corners(k)[3][0], 0);
  const dd = dragHandle(s, 'tr', [100, 0], [130, 20], { ctrl: true }); assert.ok(!isAffine(dd)); assert.deepEqual(corners(dd)[1], [130, 20]);
  const p = dragHandle({ ...s, mode: 'perspective' }, 'tl', [0, 0], [20, 0]); const qp = corners(p);
  near(qp[0][0], 20); near(qp[1][0], 80, 1e-9, 'partner mirrors'); near(qp[3][0], 0);
  const w = toWarp(s); assert.equal(w.mesh!.length, 16); const w2 = dragHandle(w, 'mesh:5', w.mesh![5], [w.mesh![5][0] + 10, w.mesh![5][1]]);
  near(w2.mesh![5][0] - w.mesh![5][0], 10); assert.deepEqual(outputBounds(w), { x: 0, y: 0, width: 100, height: 100 });
  assert.equal(hitHandle(s, [100, 100], 4), 'br'); assert.equal(hitHandle(s, [30, 30], 4), 'move'); assert.equal(hitHandle(s, [50, 50], 4), 'pivot'); assert.equal(hitHandle(s, [108, 108], 4), 'rotate');
  const rr = rotateAbout(s, 90); near(corners(rr)[0][0], 100);
});

// ── layer / document ops ──────────────────────────────────────────────────────────────────
const px = (name: string, w = 10, h = 10) => pixelLayer({ assetId: `mem:${name}` }, w, h, { id: name, name });
function doc3(): RasterDocument { return { ...createDocument(100, 80), layers: [px('a'), px('b'), px('c')] }; }
test('layers panel rows, drag into/out of groups, group / ungroup / arrange', () => {
  let d = doc3(); assert.deepEqual(layerRows(d).map(r => r.layer.id), ['c', 'b', 'a']);
  const g = groupLayers(d, ['a', 'c'], 'G'); d = g.doc;
  assert.deepEqual(layerRows(d).map(r => `${r.layer.id}:${r.depth}`), [`${g.groupId}:0`, 'c:1', 'a:1', 'b:0']);
  d = moveLayer(d, 'b', g.groupId, 'into'); assert.equal(findLayer(d, 'b')!.parent!.id, g.groupId);
  assert.equal(moveLayer(d, g.groupId, 'b', 'above'), d, 'a group never moves into itself');
  d = moveLayer(d, 'b', g.groupId, 'below'); assert.equal(findLayer(d, 'b')!.parent, null);
  d = ungroup(d, g.groupId); assert.deepEqual(allLayerIds(d), ['b', 'a', 'c']);
  d = arrange(d, 'b', 'front'); assert.deepEqual(allLayerIds(d), ['a', 'c', 'b']);
  d = arrange(d, 'b', 'backward'); assert.deepEqual(allLayerIds(d), ['a', 'b', 'c']);
});
test('duplicate deep-copies with fresh ids and copied assets', () => {
  const d0: RasterDocument = { ...createDocument(50, 50), layers: [groupLayer([px('a')], { id: 'g' })] };
  const copied: string[] = [];
  const r = duplicateLayer(d0, 'g', k => { copied.push(k); return k + '-copy'; });
  assert.equal(r.doc.layers.length, 2); const dup = r.doc.layers[1] as any;
  assert.notEqual(dup.id, 'g'); assert.notEqual(dup.children[0].id, 'a'); assert.equal(dup.children[0].asset.assetId, 'mem:a-copy'); assert.deepEqual(copied, ['mem:a']);
});
test('crop / canvas size / rotate / flip are non-destructive transform compositions', () => {
  const d = doc3();
  const c = cropDocument(d, { x: 20, y: 10, width: 40, height: 30 }).doc; assert.deepEqual([c.width, c.height], [40, 30]);
  assert.deepEqual(affineApply((c.layers[0] as PixelLayer).transform, 20, 10), [0, 0]);
  const cs = canvasSizeDocument(d, 200, 80, 'r').doc; assert.equal((cs.layers[0] as PixelLayer).transform[4], 100);
  const rc = rotateCanvas(d, 'cw').doc; assert.deepEqual([rc.width, rc.height], [80, 100]);
  assert.deepEqual(affineApply((rc.layers[0] as PixelLayer).transform, 0, 0), [80, 0], 'top-left goes to the top-right');
  const ff = flipCanvas(flipCanvas(d, 'horizontal').doc, 'horizontal').doc; assert.deepEqual((ff.layers[0] as PixelLayer).transform, [1, 0, 0, 1, 0, 0]);
  const straight = cropDocument(d, { x: 0, y: 0, width: 100, height: 80 }, 10).doc; const t = (straight.layers[0] as PixelLayer).transform; near(Math.atan2(t[1], t[0]) * 180 / Math.PI, -10, 1e-9, 'straighten rotates content');
  // unlinked bitmap masks cannot rotate by bounds alone → mask jobs
  const withMask: RasterDocument = { ...d, layers: [{ ...px('m'), mask: { kind: 'bitmap', enabled: true, assetId: 'mem:mk', bounds: { x: 5, y: 5, width: 10, height: 10 }, defaultColor: 0 } }] };
  assert.equal(transformDocument(withMask, [1, 0, 0, 1, 3, 4], 100, 80).maskJobs.length, 0);
  assert.equal(rotateCanvas(withMask, 'cw').maskJobs.length, 1);
});

// ── preview cache ─────────────────────────────────────────────────────────────────────────
test('preview key: changes with the raster JSON or the pixel rev, stable otherwise; resolve order', () => {
  const r: RasterDocument = { ...createDocument(40, 30), layers: [px('a')] };
  const k1 = previewKey({ raster: r, rasterRev: 'e:1' })!, k2 = previewKey({ raster: r, rasterRev: 'e:2' })!;
  assert.notEqual(k1, k2); assert.equal(rasterJsonKey(r), rasterJsonKey(structuredClone(r)), 'content-keyed, not identity');
  const r2 = { ...r, layers: [{ ...r.layers[0], opacity: 0.5 }] } as RasterDocument; assert.notEqual(previewKey({ raster: r2, rasterRev: 'e:1' }), k1);
  assert.equal(previewKey({ raster: undefined }), null);
  const fresh = { raster: r, rasterRev: 'e:1', rasterPreview: { key: k1, width: 40, height: 30, assetId: 'asset_x', at: 0 } };
  assert.ok(isPreviewFresh(fresh)); assert.ok(!isPreviewFresh({ ...fresh, rasterRev: 'e:2' }));
  const mem = new Map<string, string>();
  assert.equal(resolvePreview(fresh, mem).kind, 'stored');
  const stale = { ...fresh, rasterRev: 'e:2' }; const res = resolvePreview(stale, mem); assert.equal(res.kind, 'compute'); assert.equal((res as any).stale.assetId, 'asset_x');
  mem.set(k2, 'blob:1'); assert.deepEqual(resolvePreview(stale, mem), { kind: 'memory', key: k2, url: 'blob:1' });
  assert.equal(resolvePreview({ raster: undefined }, mem).kind, 'legacy');
  const evicted: string[] = []; const lru = new PreviewLru<number>(2, (_v, k) => evicted.push(k)); lru.set('a', 1); lru.set('b', 2); lru.get('a'); lru.set('c', 3); assert.deepEqual(evicted, ['b']);
  assert.deepEqual(previewSize(4096, 2048, 2048), { width: 2048, height: 1024, scale: 0.5 });
});

// ── legacy devices ────────────────────────────────────────────────────────────────────────
const legacyLayer = (id: string, extra: Partial<TelaImageLayer> = {}): TelaImageLayer => ({ id, name: id, src: `https://x/${id}.png`, x: 10, y: 20, scale: 0.5, rotation: 0, opacity: 0.8, blend: 'multiply', visible: true, adjust: { brightness: 1, contrast: 1, saturate: 1, exposure: 0, blur: 0 }, intrinsicWidth: 200, intrinsicHeight: 100, ...extra });
test('legacy ops keep working on a raster device (mirrored), and change nothing for legacy devices', () => {
  const legacy: TelaImageDevice = { id: 'img', type: 'IMAGE', width: 400, height: 300, layers: [legacyLayer('l1')] };
  assert.deepEqual(mirrorLegacyAdd(legacy, legacyLayer('l2')), {}, 'legacy device: untouched');
  const raster = migrateLegacyImageDevice(legacy); const dev: TelaImageDevice = { ...legacy, raster };
  const migrated = legacyLayerToRaster(legacy, legacy.layers[0]) as PixelLayer; const inDoc = raster.layers[0] as PixelLayer;
  assert.deepEqual(migrated.transform, inDoc.transform); assert.equal(migrated.opacity, 0.8); assert.equal(migrated.blend, 'multiply'); assert.equal(migrated.id, 'l1');
  const doc: TelaDoc = { id: 'd', ownerId: 'u', title: 'T', frames: [], devices: { img: dev }, createdAt: 0, updatedAt: 0 };
  const added = applyTelaOp(doc, { type: 'ADD_IMAGE_LAYER', deviceId: 'img', layer: legacyLayer('l2', { x: 50 }) }).devices.img as TelaImageDevice;
  assert.deepEqual(added.raster!.layers.map(l => l.id), ['l1', 'l2']); assert.equal((added.raster!.layers[1] as PixelLayer).asset.src, 'https://x/l2.png');
  const upd = mirrorLegacyUpdate(added, 'l2', { visible: false, x: 70 }).raster!; const l2 = findLayer(upd, 'l2')!.layer as PixelLayer;
  assert.equal(l2.visible, false); assert.equal(l2.transform[4], 70);
  assert.deepEqual(mirrorLegacyDelete(added, 'l1').raster!.layers.map(l => l.id), ['l2']);
  const setR = applyTelaOp(doc, { type: 'SET_IMAGE_RASTER', deviceId: 'img', raster: { ...raster, width: 999 }, rev: 'e:3', preview: { key: 'k', width: 1, height: 1, at: 0 } }).devices.img as TelaImageDevice;
  assert.equal(setR.raster!.width, 999); assert.equal(setR.rasterRev, 'e:3'); assert.equal(setR.rasterPreview!.key, 'k'); assert.equal(setR.layers.length, 1, 'legacy view kept');
  void adjustmentLayer(defaultAdjustment('curves'));
});
