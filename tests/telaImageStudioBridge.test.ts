// Image Studio — the history bridge: pixel journal, reconcile planning, asset aliases, the
// History-panel log, and an end-to-end run of ImageStudioController against Tela's real
// document reducer + undo history (CPU engine in node; no GPU, no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelJournal, planReconcile, parseRev, AssetAliases, StudioHistoryLog } from '../components/tela/image/historyBridge';
import { ImageStudioController, scaleSelection } from '../components/tela/image/controller';
import { applyTelaOp, type TelaOp } from '../components/tela/telaOps';
import { emptyHistory, recordOp, undo as hUndo, redo as hRedo, COALESCE_MS, type TelaHistory } from '../components/tela/telaHistory';
import { createDocument, pixelLayer, findLayer, type RasterDocument, type PixelLayer } from '../services/tela/raster/model';
import { DEFAULT_BRUSH } from '../services/tela/raster/painting';
import { rectSelection } from '../services/tela/raster/selection';
import type { TelaDoc, TelaImageDevice } from '../types';

// ── journal ───────────────────────────────────────────────────────────────────────────────
interface FakePatch { id: number; bytes: number }
function fakeJournal(max = 1000) { const log: string[] = []; const j = new PixelJournal<FakePatch>({ undo: p => log.push(`u${p.id}`), redo: p => log.push(`r${p.id}`), bytes: p => p.bytes }, max, 'ep'); return { j, log }; }
test('journal: absolute cursor, redo tail truncation, seek, byte cap keeps numbering', () => {
  const { j, log } = fakeJournal(250);
  for (let i = 1; i <= 3; i++) j.push({ id: i, bytes: 100 });
  assert.equal(j.rev, 'ep:3'); assert.equal(j.oldest, 1, 'third patch pushed the first off the 250-byte cap');
  assert.deepEqual(j.seek(1), { applied: [{ id: 3, bytes: 100 }, { id: 2, bytes: 100 }], reached: true }); assert.deepEqual(log, ['u3', 'u2']);
  assert.equal(j.seek(0).reached, false, 'cannot go behind the oldest retained patch');
  j.seek(2); assert.equal(j.cursor, 2);
  j.push({ id: 9, bytes: 10 }); assert.equal(j.cursor, 3); assert.equal(j.canRedo, false, 'new patch drops the redo tail');
  assert.deepEqual(j.patchesSince(2).map(p => p.id), [9]);
  assert.equal(j.push(null), false);
});
test('reconcile plan: own echo = none, own epoch = seek, base/legacy = cursor 0, foreign = adopt', () => {
  const r = { a: 1 }, j = { epoch: 'ep', cursor: 4 };
  assert.deepEqual(planReconcile(j, { raster: r, rasterRev: 'ep:4' }, { raster: r, rev: 'ep:4' }), { kind: 'none' });
  assert.deepEqual(planReconcile(j, { raster: {}, rasterRev: 'ep:2' }, { raster: r, rev: 'ep:4' }), { kind: 'seek', cursor: 2 });
  assert.deepEqual(planReconcile(j, { raster: undefined, rasterRev: undefined }, null), { kind: 'seek', cursor: 0 });
  assert.deepEqual(planReconcile(j, { raster: {}, rasterRev: 'old:7' }, null, 'old:7'), { kind: 'seek', cursor: 0 });
  assert.deepEqual(planReconcile(j, { raster: {}, rasterRev: 'other:1' }, null, 'old:7'), { kind: 'adopt' });
  assert.deepEqual(parseRev('a:b:12'), { epoch: 'a:b', cursor: 12 }); assert.equal(parseRev('nope'), null);
});
test('asset aliases: clean runtime keys go out as stored ids and come back as runtime keys', () => {
  const doc: RasterDocument = { ...createDocument(10, 10), layers: [pixelLayer({ assetId: 'mem:a' }, 10, 10, { id: 'L' }), pixelLayer({ assetId: 'mem:b' }, 10, 10, { id: 'M' })] };
  const al = new AssetAliases(); al.record('mem:a', 'asset_1.png'); al.record('mem:b', 'asset_2.png');
  const out = al.toStored(doc, k => k === 'mem:b');
  assert.equal((out.layers[0] as PixelLayer).asset.assetId, 'asset_1.png'); assert.equal((out.layers[1] as PixelLayer).asset.assetId, 'mem:b', 'dirty keys stay runtime');
  assert.ok(!al.fullyStored(doc, k => k === 'mem:b')); assert.ok(al.fullyStored(doc, () => false));
  const back = al.toRuntime(out, () => true); assert.equal((back.layers[0] as PixelLayer).asset.assetId, 'mem:a');
});
test('history log mirrors telaHistory coalescing (one row per Tela undo step)', () => {
  const log = new StudioHistoryLog(COALESCE_MS);
  log.record('Opacity', 'e:0', 'L:opacity', 0); log.record('Opacity', 'e:0', 'L:opacity', 300); log.record('Brush', 'e:1', null, 400);
  assert.deepEqual(log.steps.map(s => s.label), ['Opacity', 'Brush']); assert.equal(log.index, 1);
  log.moved('undo'); assert.equal(log.distanceTo(1), 1); assert.equal(log.distanceTo(-1), -1);
  // the same ops through the real Tela history coalesce identically
  let h = emptyHistory(); const doc: TelaDoc = { id: 'd', ownerId: 'u', title: '', frames: [], devices: {}, createdAt: 0, updatedAt: 0 };
  const op = (coalesce?: string): TelaOp => ({ type: 'SET_IMAGE_RASTER', deviceId: 'x', raster: undefined, coalesce });
  h = recordOp(h, doc, op('L:opacity'), 0); h = recordOp(h, doc, op('L:opacity'), 300); h = recordOp(h, doc, op(), 400);
  assert.equal(h.past.length, 2);
  assert.equal(recordOp(h, doc, { type: 'SET_IMAGE_RASTER', deviceId: 'x', raster: undefined, persistOnly: true }, 500), h, 'persistence is never an undo step');
});
test('scaleSelection keeps coverage through a proxy round trip', () => {
  const s = rectSelection(400, 200, { x: 100, y: 40, width: 200, height: 100 });
  const back = scaleSelection(scaleSelection(s, 100, 50), 400, 200);
  assert.deepEqual(back.bounds && [Math.round(back.bounds.x / 4), Math.round(back.bounds.width / 10)], [25, 20]);
});

// ── end to end: controller × Tela doc history ─────────────────────────────────────────────
class Host {
  doc: TelaDoc; h: TelaHistory = emptyHistory(); t = 10_000; ctl!: ImageStudioController; id: string;
  constructor(dev: TelaImageDevice) { this.id = dev.id; this.doc = { id: 'd', ownerId: 'u', title: 'T', frames: [], devices: { [dev.id]: dev }, createdAt: 0, updatedAt: 0 }; }
  dispatch = (op: TelaOp) => { const next = applyTelaOp(this.doc, op); if (next !== this.doc) this.h = recordOp(this.h, this.doc, op, (this.t += COALESCE_MS * 2)); this.doc = next; this.sync(); };
  /** What React does on every render: hand the controller the current device. */
  sync() { this.ctl?.reconcile(this.doc.devices[this.id] as TelaImageDevice); }
  undo() { const r = hUndo(this.h, this.doc)!; this.h = r.history; this.doc = r.doc; this.sync(); return r.label; }
  redo() { const r = hRedo(this.h, this.doc)!; this.h = r.history; this.doc = r.doc; this.sync(); return r.label; }
  get dev() { return this.doc.devices[this.id] as TelaImageDevice; }
}
const px = (c: ImageStudioController, id: string, x: number, y: number) => { const l = findLayer(c.doc, id)!.layer as PixelLayer; const bm = c.session.assets.bitmap(l.asset.assetId!)!; const i = (y * bm.width + x) * 4; return [bm.data[i], bm.data[i + 1], bm.data[i + 2], bm.data[i + 3]]; };
const stroke = (c: ImageStudioController, y: number, color: [number, number, number, number]) => {
  const h = c.beginPaint({ tool: 'brush', brush: { ...DEFAULT_BRUSH, size: 6, hardness: 1 }, fg: color, bg: [255, 255, 255, 255] })!;
  for (let x = 4; x <= 40; x += 2) h.add({ x, y, pressure: 1 }); h.end();
};

test('Ctrl+Z interleaves raster strokes with layer ops and other doc edits, in order', async () => {
  const host = new Host({ id: 'img', type: 'IMAGE', width: 48, height: 32, layers: [] });
  const c = host.ctl = await ImageStudioController.acquire(host.dev, host.dispatch);
  c.newLayer(); const L = c.activeId!;                                   // 1 struct
  stroke(c, 8, [255, 0, 0, 255]);                                        // 2 pixels
  c.addAdjustment('invert'); const A = c.activeId!;                      // 3 struct
  c.setActive(L); stroke(c, 20, [0, 0, 255, 255]);                       // 4 pixels
  host.dispatch({ type: 'SET_TITLE', title: 'Renamed' });                // 5 another surface
  c.update(L, { opacity: 0.5 }, 'Opacity');                              // 6 struct
  assert.equal(host.h.past.length, 6);
  assert.deepEqual(px(c, L, 20, 8), [255, 0, 0, 255]); assert.deepEqual(px(c, L, 20, 20), [0, 0, 255, 255]);

  assert.equal(host.undo(), 'Opacity'); assert.equal((findLayer(c.doc, L)!.layer).opacity, 1);
  host.undo(); assert.equal(host.doc.title, 'T'); assert.deepEqual(px(c, L, 20, 20), [0, 0, 255, 255], 'title undo leaves pixels alone');
  assert.equal(host.undo(), 'Brush Tool'); assert.deepEqual(px(c, L, 20, 20), [0, 0, 0, 0]); assert.deepEqual(px(c, L, 20, 8), [255, 0, 0, 255]);
  host.undo(); assert.equal(findLayer(c.doc, A), null, 'adjustment layer undone after the later stroke');
  host.undo(); assert.deepEqual(px(c, L, 20, 8), [0, 0, 0, 0], 'first stroke undone');
  host.undo(); assert.equal(findLayer(c.doc, L), null); assert.equal(c.doc.layers.length, 0);

  for (let i = 0; i < 6; i++) host.redo();
  assert.equal(host.doc.title, 'Renamed'); assert.equal(findLayer(c.doc, L)!.layer.opacity, 0.5); assert.ok(findLayer(c.doc, A));
  assert.deepEqual(px(c, L, 20, 8), [255, 0, 0, 255]); assert.deepEqual(px(c, L, 20, 20), [0, 0, 255, 255]);

  // a new edit after undo drops the redo tail in BOTH histories
  host.undo(); host.undo(); host.undo();                                  // back to after stroke 1 + adjustment
  stroke(c, 28, [0, 255, 0, 255]);
  assert.equal(host.h.future.length, 0); assert.equal(c.journal.canRedo, false);
  assert.deepEqual(px(c, L, 20, 20), [0, 0, 0, 0]); assert.deepEqual(px(c, L, 20, 28), [0, 255, 0, 255]);
});

test('persistence swaps in stored ids without an undo step, and undo still finds the pixels', async () => {
  const host = new Host({ id: 'img2', type: 'IMAGE', width: 32, height: 24, layers: [] });
  const c = host.ctl = await ImageStudioController.acquire(host.dev, host.dispatch);
  c.newLayer(); const L = c.activeId!; stroke(c, 10, [10, 200, 30, 255]);
  const steps = host.h.past.length;
  await c.flushPersist();
  assert.equal(host.h.past.length, steps, 'persist recorded no history');
  const stored = (host.dev.raster!.layers[0] as PixelLayer).asset.assetId!;
  assert.ok(stored.startsWith('asset_'), `stored id, got ${stored}`);
  assert.ok((findLayer(c.doc, L)!.layer as PixelLayer).asset.assetId!.startsWith('mem:'), 'the live session keeps its runtime key (no 4k clone on the next stroke)');
  stroke(c, 18, [200, 0, 0, 255]);
  host.undo(); assert.deepEqual(px(c, L, 20, 18), [0, 0, 0, 0]); assert.deepEqual(px(c, L, 20, 10), [10, 200, 30, 255]);
  host.redo(); assert.deepEqual(px(c, L, 20, 18), [200, 0, 0, 255]);
});

test('selection-scoped fills, layer via copy and merge down are undoable steps', async () => {
  const host = new Host({ id: 'img3', type: 'IMAGE', width: 40, height: 40, layers: [] });
  const c = host.ctl = await ImageStudioController.acquire(host.dev, host.dispatch);
  c.newLayer(); const L = c.activeId!;
  c.select(rectSelection(40, 40, { x: 0, y: 0, width: 20, height: 40 })); c.fillSelection([255, 255, 0, 255]);
  assert.deepEqual(px(c, L, 5, 5), [255, 255, 0, 255]); assert.deepEqual(px(c, L, 30, 5), [0, 0, 0, 0]);
  c.layerViaCopy(); const C = c.activeId!; assert.notEqual(C, L); assert.equal(c.selection, null);
  c.mergeDown(); assert.equal(c.doc.layers.length, 1);
  host.undo(); assert.equal(c.doc.layers.length, 2); host.undo(); assert.equal(c.doc.layers.length, 1);
  host.undo(); assert.deepEqual(px(c, L, 5, 5), [0, 0, 0, 0]);
});
