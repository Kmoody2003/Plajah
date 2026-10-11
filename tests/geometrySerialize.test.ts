// Geometry engine — canonical serializer (byte-identical to the legacy telaSvg for every
// gallery object), Tela bridge, Scene builder, paints, materials, SVG import, procedural kit.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TelaVectorObject } from '../types';
import { TELA_TEMPLATE_GALLERY } from '../services/tela/telaTemplateRegistry';
import { objectToSvg as legacyObjectToSvg } from './fixtures/legacyTelaSvg';
import { objectToSvg as telaSvgObjectToSvg } from '../services/tela/telaSvg';
import { telaVectorSvg } from '../services/telaPageExport';
import {
  objectToSvg, objectsToSvg, Scene, pathToObject, objectToPath, importSvg, MATERIALS, materialFilter, rectPath, circlePath, parsePathData,
  pathArea, pathBounds, linear, radial, meshGrid, tessellateMesh, boolean, toPathData, PROFILES, mix, shade, parseColor, linearAcross,
} from '../services/tela/geometry';
import * as P from '../services/tela/geometry/procedural';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

describe('canonical serializer', () => {
  it('is byte-identical to the legacy telaSvg for every template-gallery object', () => {
    let n = 0;
    for (const t of TELA_TEMPLATE_GALLERY) for (const p of t.pages) {
      let objs: TelaVectorObject[]; try { objs = p.build(); } catch { continue; }
      for (const o of objs) { n++; assert.equal(objectToSvg(o), legacyObjectToSvg(o), `${t.id} ${o.id}`); }
    }
    assert.ok(n > 10000, `only ${n} objects`);
  });
  it('telaSvg delegates to it; telaPageExport uses it (white page, hidden skipped)', () => {
    const o = pathToObject(circlePath(50, 50, 20), { fill: linear(30, 30, 70, 70, [[0, '#f00'], [1, '#00f']]) }, 'x1');
    assert.equal(telaSvgObjectToSvg(o), objectToSvg(o));
    const svg = telaVectorSvg({ id: 'd', type: 'VECTOR', width: 100, height: 100, objects: [o, { ...o, id: 'h', hidden: true }] } as never);
    assert.ok(svg.includes('fill="#fff"')); assert.ok(svg.includes('linearGradient')); assert.ok(!svg.includes('_h'));
  });
  it('geom finish: fill rule, absolute gradients, stroke style, alignment, material, clip', () => {
    const o = pathToObject(rectPath(0, 0, 100, 50), { fill: linear(0, 0, 100, 0, [[0, '#fff'], [.5, '#f80', .5], [1, '#000']]), stroke: '#123456', strokeWidth: 4, strokeStyle: { cap: 'square', join: 'miter', miterLimit: 6, dash: [4, 2], dashOffset: 1, align: 'inside' }, material: { preset: 'watercolor', seed: 3 }, clip: { d: 'M0 0H50V50H0Z' }, fillRule: 'nonzero' }, 'g1');
    const s = objectToSvg(o);
    for (const k of ['gradientUnits="userSpaceOnUse"', 'stop-opacity="0.5"', 'fill-rule="nonzero"', 'stroke-linecap="square"', 'stroke-miterlimit="6"', 'stroke-dashoffset="1"', 'clip-path="url(#sin_g1)"', 'filter="url(#mat_g1)"', 'feTurbulence', 'clipPath id="clip_g1"']) assert.ok(s.includes(k), k);
    assert.ok(!s.includes('NaN'));
  });
  it('mesh and freeform paints render as clipped layers', () => {
    const m = pathToObject(rectPath(0, 0, 100, 100), { fill: meshGrid({ x: 0, y: 0, w: 100, h: 100 }, [['#000', '#f00'], ['#00f', '#fff']]) }, 'm1');
    const s = objectToSvg(m); assert.ok(s.includes('clip-path="url(#fillclip_m1)"')); assert.ok((s.match(/<path /g) || []).length > 20);
    const f = objectToSvg(pathToObject(circlePath(0, 0, 50), { fill: { type: 'freeform', base: '#222', points: [{ x: 0, y: 0, color: '#f0f', radius: 40 }] } }, 'f1'));
    assert.ok(f.includes('radialGradient id="m_f1_ff0"'));
  });
});

describe('Tela bridge', () => {
  it('pathToObject → objectToPath round-trips geometry with an identity origin box', () => {
    const p = parsePathData('M10 10 C40 -10 80 30 110 10 L110 80 L10 80 Z');
    const o = pathToObject(p, { fill: '#abc' }); assert.equal(o.pathOriginW, o.w); assert.equal(o.x, o.pathOriginX);
    near(pathArea(objectToPath(o)!), pathArea(p), .05);
  });
  it('legacy objects become paths drawn as the renderers draw them', () => {
    const rect: TelaVectorObject = { id: 'r', kind: 'RECT', x: 0, y: 0, w: 100, h: 50, fill: '#000', stroke: 'none', strokeWidth: 0, rotation: 90, opacity: 1 };
    const b = pathBounds(objectToPath(rect)!); near(b.w, 50, 1e-6); near(b.h, 100, 1e-6); // rotated about the centre
    near(Math.abs(pathArea(objectToPath({ ...rect, rotation: 0 })!)), 5000 - 4 * 4 * (1 - Math.PI / 4), .05); // default rx 2
    const scaled: TelaVectorObject = { id: 's', kind: 'PATH', x: 0, y: 0, w: 200, h: 200, fill: '#000', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, svgPathData: 'M0 0H100V100H0Z', pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100 };
    near(pathArea(objectToPath(scaled)!), 40000, 1e-9);
  });
});

describe('Scene builder', () => {
  it('is deterministic and emits Tela PATH objects with stable ids', () => {
    const build = () => { const s = new Scene({ width: 200, height: 200, seed: 'det' }); s.group('Thing', () => { s.fill(P.blob(100, 100, 50, 40, { seed: 2 }), '#f00', { material: s.material('gouache') }); s.ink(parsePathData('M10 10 C60 0 100 60 190 20'), '#000', 6, PROFILES.ink); }); return s.build(); };
    const a = build(), b = build(); assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.ok(a.every(o => o.kind === 'PATH' && o.svgPathData && o.groupId === a[0].groupId));
  });
  it('geometric clip: fills are intersected, strokes are cut, closed stroked shapes split', () => {
    const s = new Scene({ width: 100, height: 100, seed: 1 });
    s.clip(rectPath(0, 0, 50, 100), () => { s.fill(rectPath(0, 0, 100, 100), '#f00'); s.stroke(parsePathData('M0 50 L100 50'), '#000', 2); s.shape(circlePath(50, 50, 20), '#0f0', '#000', 3); });
    const o = s.build(); near(pathBounds(objectToPath(o[0])!).w, 50, 1e-9); assert.ok(pathBounds(objectToPath(o[1])!).w <= 50 + 1e-9); assert.equal(o.length, 4);
  });
  it('layers sort by depth then call order', () => {
    const s = new Scene({ width: 10, height: 10 }); s.layer(5, () => s.fill(rectPath(0, 0, 1, 1), '#111', { label: 'front' })); s.layer(0, () => s.fill(rectPath(0, 0, 1, 1), '#222', { label: 'back' }));
    assert.deepEqual(s.build().map(o => o.objectLabel), ['back', 'front']);
  });
});

describe('materials', () => {
  it('every preset builds a well-formed filter with a user-space region', () => {
    for (const k of Object.keys(MATERIALS)) {
      const f = materialFilter('m', { preset: k, seed: 7 }, { x: 10, y: 10, w: 0, h: 50 });
      assert.ok(f.startsWith('<filter id="m" filterUnits="userSpaceOnUse"'), k); assert.ok(f.endsWith('</filter>'), k); assert.ok(!f.includes('NaN') && !f.includes('undefined'), k);
      assert.ok(/result="out"/.test(f), `${k} ends in "out"`);
      assert.equal((f.match(/<fe/g) || []).length, (f.match(/\/>|<\/fe/g) || []).length - (f.match(/<\/fe[A-Za-z]+>/g) || []).length * 0, k);
    }
  });
});

describe('paint & colour', () => {
  it('mesh tessellation stays within the quad limit and interpolates corners', () => {
    const q = tessellateMesh(meshGrid({ x: 0, y: 0, w: 100, h: 100 }, [['#000000', '#ffffff'], ['#000000', '#ffffff']]));
    assert.ok(q.length > 4 && q.length < 6000); const left = q.reduce((a, b) => (a.pts[0].x < b.pts[0].x ? a : b)); assert.ok(parseColor(left.color).r < 60);
  });
  it('OKLab mixing and shading', () => { const m = parseColor(mix('#ff0000', '#0000ff', .5)); assert.ok(m.r > 80 && m.b > 80); assert.ok(parseColor(shade('#808080', .2)).r > 128); });
  it('linearAcross spans the box along the angle', () => { const g = linearAcross({ x: 0, y: 0, w: 100, h: 50 }, 0, [[0, '#000'], [1, '#fff']]); near(g.x1, 0, 1e-9); near(g.x2, 100, 1e-9); void radial; });
});

describe('SVG import (editable vectors)', () => {
  const svg = `<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" viewBox="0 0 100 50">
    <style>.hot{fill:#ff0000} #b{stroke:blue;stroke-width:2}</style>
    <defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" style="stop-color:#fff;stop-opacity:.5"/></linearGradient>
      <clipPath id="c"><rect x="0" y="0" width="25" height="50"/></clipPath><symbol id="s" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></symbol></defs>
    <g transform="translate(10 0)" fill="green" opacity=".5"><rect class="hot" x="0" y="0" width="10" height="10" rx="2"/><circle id="b" cx="30" cy="10" r="5" fill="url(#g)"/></g>
    <path d="M0 40 L20 40 L10 30 Z" fill-rule="evenodd" fill="currentColor" style="color:#123"/>
    <rect x="0" y="0" width="50" height="50" fill="#0f0" clip-path="url(#c)"/>
    <use xlink:href="#s" x="60" y="20" width="20" height="20"/><text x="5" y="48" font-size="6" fill="#333">Hello &amp; welcome</text>
    <polyline points="70,5 80,15 90,5" fill="none" stroke="#000"/><g display="none"><rect width="100" height="100"/></g></svg>`;
  const r = importSvg(svg);
  it('maps viewBox, keeps vectors, resolves CSS and inheritance', () => {
    assert.equal(r.width, 200); const hot = r.objects[0]; assert.equal(hot.fill, '#ff0000'); near(hot.opacity, .5, 1e-9);
    const b = pathBounds(objectToPath(hot)!); near(b.x, 20, 1e-6); near(b.w, 20, 1e-6); // translate(10)·scale 2
    const circ = r.objects[1]; assert.equal(circ.geom?.fill && typeof circ.geom.fill !== 'string' && circ.geom.fill.type, 'linear'); assert.equal(circ.stroke, 'blue'); near(circ.strokeWidth, 4, 1e-9);
  });
  it('currentColor, fill-rule, geometric clip, use/symbol, text, display:none', () => {
    const tri = r.objects[2]; assert.equal(tri.fill, '#123'); assert.equal(tri.geom?.fillRule, 'evenodd');
    near(pathBounds(objectToPath(r.objects[3])!).w, 50, 1e-6); // clipped to 25 user units → 50 px
    const use = r.objects[4]; near(pathBounds(objectToPath(use)!).w, 40, 1e-3);
    const text = r.objects.find(o => o.kind === 'TEXT')!; assert.equal(text.text, 'Hello & welcome'); near(text.fontSize!, 12, 1e-9);
    assert.ok(r.objects.every(o => o.kind !== 'RECT')); assert.equal(r.objects.filter(o => o.kind === 'PATH').length, 6);
  });
  it('round-trips through the canonical serializer', () => { const out = objectsToSvg(r.objects, r.width, r.height); assert.ok(!out.includes('NaN')); assert.equal(importSvg(out).objects.filter(o => o.kind === 'PATH').length, 6); });
});

describe('procedural kit', () => {
  it('RNG / noise / poisson are deterministic; poisson respects spacing and region', () => {
    assert.equal(new P.Random('a').float(), new P.Random('a').float()); assert.notEqual(new P.Random('a').float(), new P.Random('b').float());
    const n = P.simplex2(3); assert.equal(n(.3, .7), P.simplex2(3)(.3, .7)); assert.ok(Math.abs(n(1.2, 3.4)) <= 1);
    const region = circlePath(50, 50, 40); const pts = P.poisson(null, { r: 8, region, seed: 2 });
    assert.ok(pts.length > 40); for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 8 - 1e-9);
  });
  it('organic generators return closed, valid paths', () => {
    for (const p of [P.blob(0, 0, 50, 30, { seed: 1 }), P.cloud(0, 0, 200, 80, { seed: 2 }), P.hill(0, 400, 300, 200, { seed: 3 }), P.leaf({ x: 0, y: 0 }, { x: 0, y: -60 }), P.crescent(0, 0, 40), P.sparkle(0, 0, 10), P.rock(0, 0, 40, 20)]) { assert.ok(p.subpaths.length >= 1); assert.ok(Math.abs(pathArea(p)) > 10); }
  });
  it('hatching stays inside its region (any fill rule)', () => {
    const ring = { fillRule: 'evenodd' as const, subpaths: [...circlePath(50, 50, 40).subpaths, ...circlePath(50, 50, 15).subpaths] };
    const h = P.hatch(ring, { spacing: 4, wobble: 0, inset: 0, seed: 1 }); assert.ok(h.subpaths.length > 10);
    for (const s of h.subpaths) for (const a of s.anchors) { const d = Math.hypot(a.x - 50, a.y - 50); assert.ok(d <= 40.5 && d >= 14.5, `${d}`); }
    assert.ok(P.stipple(circlePath(0, 0, 30), { r: 4 }).subpaths.length > 20); assert.ok(P.halftone(circlePath(0, 0, 30), () => .5).subpaths.length > 10);
  });
  it('rough lines are deterministic and stay near the source', () => {
    const src = rectPath(0, 0, 100, 100); const a = P.rough(src, { seed: 4, roughness: 2 }); assert.equal(JSON.stringify(a), JSON.stringify(P.rough(src, { seed: 4, roughness: 2 })));
    const b = pathBounds(a); assert.ok(b.x > -12 && b.x + b.w < 112);
  });
  it('atmospheric perspective: far colours move toward the sky and lose chroma', () => {
    const far = parseColor(P.atDepth('#2e8b57', 1, { sky: '#cfe0ff' })), front = parseColor(P.atDepth('#2e8b57', 0, { sky: '#cfe0ff' }));
    assert.ok(far.b > front.b && far.r > front.r);
  });
  it('characters are on model: same spec + pose → identical objects; pose changes only placement', () => {
    const spec: P.CharacterSpec = { name: 'Pip', seed: 7, build: 'round', palette: { body: '#c98a54', belly: '#f2d6b0', ink: '#3a2418', cheek: '#f08a7e' } };
    const draw = (x: number) => { const s = new Scene({ width: 400, height: 300, seed: 'c' }); P.drawCharacter(s, spec, { x, y: 280, expression: { mouth: 'smile' } }); return s.build(); };
    const a = draw(100), b = draw(100), c = draw(300);
    assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.equal(a.length, c.length);
    near(c[3].x - a[3].x, 200, 1e-6);
  });
  it('a painted shape is a small coherent stack', () => {
    const s = new Scene({ width: 300, height: 300, seed: 9 }); P.painted(s, P.blob(150, 150, 80, 60, { seed: 3 }), '#4f9a4a', { ink: '#222' });
    const o = s.build(); assert.ok(o.length >= 4 && o.length <= 8, `${o.length}`); void boolean; void toPathData;
  });
});
