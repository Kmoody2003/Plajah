import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName } from 'pdf-lib';
import { preflight, preflightSummary, effectivePpi, isNearBlackNotPure } from '../services/print/preflight';
import { buildPressPdf, extendEdges, parsePath, toPressCmyk } from '../services/print/pressPdf';
import { defaultSpecFor, PRINT_PRODUCTS, productById } from '../services/print/products';
import { OUTPUT_CONDITIONS } from '../services/print/conditions';
import type { JobPage, PrintJob } from '../services/print/types';

const page = (id: string, items: JobPage['items'], trimIn: [number, number] = [8.5, 11]): JobPage => ({ id, label: `Page ${id}`, trimIn, items });
const job = (productId: string, pages: JobPage[], over = {}): PrintJob => ({ title: 'T', spec: defaultSpecFor(productId, over), pages });

const solid = (w: number, h: number, rgb: [number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; }
  return { width: w, height: h, data };
};

test('catalog: every product names a real condition and sane geometry', () => {
  for (const p of PRINT_PRODUCTS) {
    assert.ok(OUTPUT_CONDITIONS.some(c => c.id === p.defaultCondition), p.id);
    assert.ok(p.trimIn[0] > 0 && p.trimIn[1] > 0 && p.safeIn >= 0 && p.bleedIn >= 0, p.id);
  }
  assert.equal(productById('magazine-letter-saddle')!.pageMultiple, 4);
});

test('preflight: low-res image is an error at press, fine at home', () => {
  const img = { kind: 'image' as const, id: 'i1', rect: { x: 1, y: 1, w: 4, h: 3 }, pixelW: 600, pixelH: 450, colorSpace: 'rgb' as const, label: 'photo' };
  assert.equal(effectivePpi(img), 150);
  const press = preflight(job('flyer-letter', [page('1', [img])]));
  assert.ok(press.some(f => f.code === 'LOW_RES' && f.level === 'error'));
  assert.ok(press.some(f => f.code === 'RGB_IMAGE'));
  const home = preflight(job('flyer-letter', [page('1', [img])], { conditionId: 'HOME_RGB', intent: 'home' }));
  assert.ok(!home.some(f => f.code === 'LOW_RES'));
});

test('preflight: text near trim, rich black text, hairlines, bleed, page multiples', () => {
  const items: JobPage['items'] = [
    { kind: 'text', id: 't1', rect: { x: 0.05, y: 2, w: 3, h: 0.3 }, fontFamily: 'Inter', fontSizePt: 10, color: '#111111', label: 'kicker' },
    { kind: 'shape', id: 's1', rect: { x: 1, y: 5, w: 2, h: 0.01 }, stroke: '#000', strokePt: 0.1 },
    { kind: 'shape', id: 's2', rect: { x: 0, y: 0, w: 8.5, h: 2 }, fill: '#c00' },
  ];
  const f = preflight(job('magazine-letter-saddle', [page('1', items, [8.375, 10.875]), page('2', [], [8.375, 10.875])]));
  const codes = f.map(x => x.code);
  for (const c of ['TEXT_OUTSIDE_SAFE', 'RICH_BLACK_TEXT', 'HAIRLINE', 'BLEED_EXTENDED', 'PAGE_MULTIPLE']) assert.ok(codes.includes(c), c);
  assert.equal(f.find(x => x.code === 'PAGE_MULTIPLE')!.level, 'error', 'saddle stitch must be a multiple of 4');
  assert.equal(preflightSummary(f).ready, false);
  assert.ok(isNearBlackNotPure('#111') && !isNearBlackNotPure('#000000') && !isNearBlackNotPure('#333366'));
});

test('raster: edge extension and K-only black with ink limit', () => {
  const src = solid(2, 2, [255, 0, 0]);
  src.data[0] = 0; // top-left pixel differs
  const ext = extendEdges(src, 3);
  assert.equal(ext.width, 8);
  assert.equal(ext.data[0], 0, 'corner repeats the corner pixel');
  const black = toPressCmyk(solid(2, 2, [0, 0, 0]), 240, 0.8);
  assert.deepEqual([...black.cmyk.slice(0, 4)], [0, 0, 0, 255]);
  const dark = toPressCmyk(solid(2, 2, [20, 30, 40]), 240, 0.8);
  assert.ok(dark.maxTac <= 241, `ink limited to 240, got ${dark.maxTac}`);
});

test('path parser handles M/L/C/Z and implicit lineto', () => {
  const p = parsePath('M0 0 L1 0 1 1 C1 2 2 2 2 1 Z');
  assert.deepEqual(p.map(c => c.op), ['M', 'L', 'L', 'C', 'Z']);
});

test('press PDF: CMYK, boxes, marks, output intent; home RGB booklet', async () => {
  const spec = defaultSpecFor('flyer-a5');
  const w = Math.round(spec.trimIn[0] * 20), h = Math.round(spec.trimIn[1] * 20);
  const res = await buildPressPdf({ title: 'Flyer', spec, dpi: 20, pages: [{ label: 'Front', ...solid(w, h, [200, 30, 30]), includesBleed: false }],
    dielines: [{ pageIndex: 0, paths: ['M0.5 0.5 L2 0.5 L2 2 Z'], spot: { name: 'CutContour', previewHex: '#ff00ff', cmykFallback: [0, 100, 0, 0], technical: 'cut' } }] });
  assert.equal(res.colorModel, 'CMYK');
  assert.match(res.conformance, /PDF\/X-1a/);
  assert.equal(new TextDecoder().decode(res.bytes.slice(0, 8)), '%PDF-1.4', 'PDF/X-1a:2003 needs a 1.4 header');
  const doc = await PDFDocument.load(res.bytes);
  const pg = doc.getPage(0);
  const trim = pg.node.get(PDFName.of('TrimBox'))!.toString();
  assert.ok(trim.includes('['), 'TrimBox set');
  assert.ok(pg.getWidth() > spec.trimIn[0] * 72, 'media larger than trim for marks');
  assert.ok(doc.catalog.get(PDFName.of('OutputIntents')), 'output intent present');
  assert.ok(new TextDecoder('latin1').decode(res.bytes).includes('/Separation /CutContour'));

  const home = defaultSpecFor('zine-half-letter');
  const pages = Array.from({ length: 8 }, (_, i) => ({ label: `p${i + 1}`, ...solid(11, 17, [i * 20, 100, 100]), includesBleed: false }));
  const booklet = await buildPressPdf({ title: 'Zine', spec: home, dpi: 2, pages, impose: 'home-booklet' });
  assert.equal(booklet.colorModel, 'RGB');
  assert.equal(booklet.pageCount, 4, '8 pages → 2 sheets → 4 printed sides');
  const bdoc = await PDFDocument.load(booklet.bytes);
  assert.equal(Math.round(bdoc.getPage(0).getWidth()), Math.round(home.trimIn[0] * 2 * 72), 'two pages side by side');
});
