import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName } from 'pdf-lib';
import { ellipsePath, parseSvgPath, polyPath, rectPath, transformSegs, type Seg } from '../services/print/svgPath';

const ends = (segs: Seg[]) => segs.filter(s => s.op !== 'Z').map(s => [Math.round((s as any).x * 1000) / 1000, Math.round((s as any).y * 1000) / 1000]);
const ops = (segs: Seg[]) => segs.map(s => s.op).join('');

test('absolute and relative lines, H/V, implicit lineto after M, close', () => {
  const s = parseSvgPath('M10 10 20 10 h10 v5 l-5 5 V30 H10 z');
  assert.equal(ops(s), 'MLLLLLLZ');
  assert.deepEqual(ends(s), [[10, 10], [20, 10], [30, 10], [30, 15], [25, 20], [25, 30], [10, 30]]);
  const r = parseSvgPath('m5 5 l10 0 l0 10z m2 2 l1 1');
  assert.deepEqual(ends(r), [[5, 5], [15, 5], [15, 15], [7, 7], [8, 8]], 'relative m after z starts from the subpath start');
});

test('packed numbers and exponents tokenise', () => {
  assert.deepEqual(ends(parseSvgPath('M.5.5L1e1-2')), [[0.5, 0.5], [10, -2]]);
});

test('smooth cubic reflects the previous control point', () => {
  const s = parseSvgPath('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
  const c2 = s[2] as Extract<Seg, { op: 'C' }>;
  assert.deepEqual([c2.x1, c2.y1], [10, -10]);
});

test('quadratics raise to exact cubics; T reflects', () => {
  const s = parseSvgPath('M0 0 Q10 10 20 0 T40 0');
  const q = s[1] as Extract<Seg, { op: 'C' }>;
  assert.ok(Math.abs(q.x1 - 20 / 3) < 1e-9 && Math.abs(q.y1 - 20 / 3) < 1e-9);
  const t = s[2] as Extract<Seg, { op: 'C' }>;
  // reflected control is (30,-10): first cubic handle = 20 + 2/3·(10) = 26.67, -6.67
  assert.ok(Math.abs(t.x1 - (20 + (2 / 3) * 10)) < 1e-9 && Math.abs(t.y1 + 20 / 3) < 1e-9);
});

test('arcs: a semicircle splits into ≤90° cubics that stay on the circle', () => {
  const s = parseSvgPath('M0 0 A10 10 0 0 1 20 0');
  const cubics = s.filter(x => x.op === 'C') as Array<Extract<Seg, { op: 'C' }>>;
  assert.equal(cubics.length, 2);
  for (const c of cubics) assert.ok(Math.abs(Math.hypot(c.x - 10, c.y) - 10) < 1e-9);
  const last = cubics[1];
  assert.deepEqual([Math.round(last.x), Math.round(last.y)], [20, 0]);
  // sweep=1 from (0,0) to (20,0) with y-down passes through (10,-10)
  assert.ok(Math.abs(cubics[0].y + 10) < 1e-9);
  assert.equal(parseSvgPath('M0 0 A0 5 0 0 1 10 0')[1].op, 'L', 'zero radius is a line');
  const big = parseSvgPath('M0 0 A1 1 0 0 1 10 0').filter(x => x.op === 'C') as Array<Extract<Seg, { op: 'C' }>>;
  assert.ok(Math.abs(big[big.length - 1].x - 10) < 1e-9, 'radii scale up when too small');
});

test('press PDF: vector words in an embedded subset font, vector shapes, CMYK ink, K-only black', async () => {
  const { buildPressPdf } = await import('../services/print/pressPdf');
  const { defaultSpecFor } = await import('../services/print/products');
  const { fontKey } = await import('../services/print/vector');
  const { unzlibSync } = await import('fflate');
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff')));
  const key = fontKey('EB Garamond', 400, false);
  const spec = defaultSpecFor('flyer-a5');
  const w = 40, h = 56, data = new Uint8ClampedArray(w * h * 4).fill(255);
  const res = await buildPressPdf({
    title: 'Vector', spec, dpi: 5, fonts: { [key]: { bytes, family: 'EB Garamond', weight: 400, italic: false } },
    pages: [{ label: 'p1', width: w, height: h, data, includesBleed: false, vector: {
      texts: [
        { text: 'Robotics', xIn: 1, baselineIn: 2, widthIn: 1.1, sizePt: 24, fontKey: key, color: [0, 0, 0], letterSpacingPt: 0 },
        { text: 'second', xIn: 1, baselineIn: 3, widthIn: 0.6, sizePt: 12, fontKey: key, color: [212, 0, 85], letterSpacingPt: 0.5 },
      ],
      shapes: [{ d: 'M0.5 0.5 L3 0.5 L3 1 Z', fill: [107, 0, 153], stroke: [0, 0, 0], strokePt: 0.5, evenOdd: true }],
      rasterized: { 'images': 1 },
    } }],
  });
  assert.equal(res.colorModel, 'CMYK');
  assert.ok(res.notes.some(n => /Vector: 2 words .* 1 embedded font, 1 shapes/.test(n)), res.notes.join(' | '));
  assert.ok(res.notes.some(n => /Kept as raster: 1 images/.test(n)));
  const doc = await PDFDocument.load(res.bytes);
  const raw = new TextDecoder('latin1').decode(res.bytes);
  assert.ok(raw.includes('/FontFile2') || raw.includes('/FontFile3'), 'font program embedded');
  assert.ok(raw.includes('+EBGaramond') || /\/BaseFont \/[A-Z]{6}\+/.test(raw), 'subset font tag');
  // Decode the page content stream and check the text and paint operators.
  const contents = doc.getPage(0).node.Contents();
  const streams = contents && 'asArray' in contents ? (contents as any).asArray().map((r: any) => doc.context.lookup(r)) : [contents];
  const text = streams.map((s: any) => new TextDecoder('latin1').decode(s.getContents ? (s.dict.get(PDFName.of('Filter')) ? unzlibSync(s.getContents()) : s.getContents()) : new Uint8Array())).join('\n');
  assert.match(text, /BT[\s\S]*Tf[\s\S]*Tz[\s\S]*Tm[\s\S]*Tj[\s\S]*ET/, 'text drawn with Tf/Tz/Tm/Tj');
  assert.match(text, /0 0 0 1 k[\s\S]*BT/, 'pure black text in black ink only');
  assert.match(text, /\bB\*/, 'even-odd fill and stroke');
  assert.match(text, /0\.5 Tc/, 'letter spacing');
});

test('subset check: sound subsets pass; the Inter subsetting defect is caught when the file is available', async () => {
  const { subsetKeepsGlyphs } = await import('../services/print/pressPdf');
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  const garamond = new Uint8Array(readFileSync(join(process.cwd(), 'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff')));
  assert.equal(await subsetKeepsGlyphs(garamond, ['Our robotics team placed second'], fontkit), true);
  // Inter's static TTF (Google Fonts, server fetch) loses outlines when subset. Optional: only when cached locally.
  const inter = process.env.INTER_TTF;
  if (inter) assert.equal(await subsetKeepsGlyphs(new Uint8Array(readFileSync(inter)), ['Our robotics team'], fontkit), false);
});

test('font classes, substitution and the preflight note', async () => {
  const { classifyFamily, isSystemFamily, resolveFont, clearFontCache } = await import('../services/print/fontSource');
  const { preflight } = await import('../services/print/preflight');
  const { defaultSpecFor } = await import('../services/print/products');
  assert.equal(classifyFamily('Georgia, serif'), 'serif');
  assert.equal(classifyFamily('"Playfair Display", Georgia, serif'), 'serif');
  assert.equal(classifyFamily('Inter, system-ui, sans-serif'), 'sans');
  assert.equal(classifyFamily('Consolas, monospace'), 'mono');
  assert.ok(isSystemFamily('Georgia') && !isSystemFamily('Inter'));

  // Resolution: a fake proxy that serves TrueType CSS + bytes for Source Serif 4 only.
  clearFontCache();
  const ttf = new Uint8Array([0, 1, 0, 0, 9, 9]);
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    const u = decodeURIComponent(url);
    if (u.includes('css2?family=Source+Serif+4')) return new Response(`@font-face { src: url(https://fonts.gstatic.com/s/x/v1/a.ttf) format('truetype'); }`);
    if (u.endsWith('a.ttf')) return new Response(ttf);
    return new Response('', { status: 400 });
  }) as unknown as typeof fetch;
  const r = await resolveFont('Georgia, serif', 700, false, { proxy: '/p', fetchFn });
  assert.equal(r?.family, 'Source Serif 4');
  assert.equal(r?.substitutedFor, 'Georgia');
  assert.ok(calls.every(c => !c.includes('family=Georgia')), 'system families are never requested');

  const job = { title: 'T', spec: defaultSpecFor('flyer-letter'), pages: [{ id: 'p', label: 'Page 1', trimIn: [8.5, 11] as [number, number], items: [
    { kind: 'text' as const, id: 't', rect: { x: 1, y: 1, w: 2, h: 0.3 }, fontFamily: 'Georgia', fontSizePt: 12, color: '#000000' },
  ] }] };
  const f = preflight(job).find(x => x.code === 'FONT_SUBSTITUTE');
  assert.ok(f && f.level === 'info' && /Source Serif 4/.test(f.fix));
});

test('shape helpers and transforms', () => {
  assert.equal(ops(parseSvgPath(rectPath(0, 0, 10, 5))), 'MLLLZ');
  const rr = parseSvgPath(rectPath(0, 0, 10, 10, 2));
  assert.equal(rr.filter(s => s.op === 'C').length, 4);
  assert.equal(parseSvgPath(ellipsePath(5, 5, 5, 3)).filter(s => s.op === 'C').length, 4);
  assert.equal(polyPath('0,0 10,0 10,10', true), 'M0 0L10 0L10 10Z');
  const t = transformSegs(parseSvgPath('M1 2 L3 4'), [2, 0, 0, 2, 10, 20]);
  assert.deepEqual(ends(t), [[12, 24], [16, 28]]);
});
