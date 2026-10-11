// geometrySpecimen — proof sheets for the vector geometry engine, rendered with headless
// system Chrome to .tela-proofs/geometry/*.png (gitignored).
//   npx tsx scripts/geometrySpecimen.ts            (all sheets)
//   npx tsx scripts/geometrySpecimen.ts vignette   (one sheet)
// Every mark on these sheets is produced by services/tela/geometry (booleans, strokes,
// offsets, warps, materials, procedural kit) and serialised by its canonical serialiser.
import fs from 'node:fs';
import path from 'node:path';
import type { TelaVectorObject } from '../types';
import {
  Scene, rectPath, circlePath, ellipseAt, starPath, polygonPath, smoothThrough, parsePathData, boolean, divide, resolve, offsetPath,
  outlineStroke, variableStroke, PROFILES, dashPath, warp, envelope, makeMesh, linear, radial, linearAcross, meshGrid, objectsToSvg,
  roughen, zigzag, puckerBloat, twist, blend, artBrush, patternBrush, scatterBrush, spiralPath, mix, shade, withAlpha, type CompoundPath,
} from '../services/tela/geometry';
import { transformPath, translate, rotate, compose, scale } from '../services/tela/geometry/transform';
import * as P from '../services/tela/geometry/procedural';

const OUT = path.resolve('.tela-proofs/geometry'); fs.mkdirSync(OUT, { recursive: true });
const INK = '#2a2233', PAPER = '#fbf6ec';
const label = (s: Scene, x: number, y: number, t: string, size = 13, color = '#6b5d72'): void => {
  const o: TelaVectorObject = { id: s.id('t'), kind: 'TEXT', x, y, w: 380, h: size * 1.3, text: t, fill: color, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, fontSize: size, fontFamily: 'Georgia, serif', fontWeight: 600, wrap: false, objectLabel: 'Label', templateRole: 'LABEL' };
  s.add(o);
};
const at = (p: CompoundPath, x: number, y: number) => transformPath(p, translate(x, y));

// ── Sheet 1: booleans ───────────────────────────────────────────────────────────────
function sheetBooleans(): Scene {
  const s = new Scene({ width: 1600, height: 1000, seed: 'bool' });
  s.fill(rectPath(0, 0, 1600, 1000), PAPER);
  label(s, 40, 24, 'BOOLEANS — curves stay curves; coincident edges, tangencies, holes, self-intersections', 18, INK);
  const A = (x: number, y: number) => circlePath(x + 70, y + 80, 62), B = (x: number, y: number) => rectPath(x + 80, y + 40, 110, 110, 18);
  const ops: Array<[string, (a: CompoundPath, b: CompoundPath) => CompoundPath]> = [
    ['union', (a, b) => boolean('union', [a, b])], ['intersect', (a, b) => boolean('intersect', [a, b])],
    ['subtract (minus front)', (a, b) => boolean('subtract', [a, b])], ['exclude', (a, b) => boolean('exclude', [a, b])],
  ];
  ops.forEach(([name, f], i) => {
    const x = 40 + i * 300, y = 70;
    s.stroke(A(x, y), '#b9a9c4', 1, { dash: [4, 4] }); s.stroke(B(x, y), '#b9a9c4', 1, { dash: [4, 4] });
    s.shape(f(A(x, y), B(x, y)), '#ff6b5b', INK, 2.2, { opacity: .95 });
    label(s, x, y + 200, name);
  });
  // divide with colours
  { const x = 1240, y = 70; const regs = divide([A(x, y), B(x, y), circlePath(x + 150, y + 150, 45)]); const pal = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#8338ec', '#fb5607', '#3a86ff'];
    regs.forEach((r, i) => s.shape(transformPath(r.path, translate(((r.sample.x - x - 120) * .08), ((r.sample.y - y - 110) * .08))), pal[i % pal.length], INK, 1.6)); label(s, x, y + 200, `divide → ${regs.length} regions (exploded)`); }
  // tricky cases row
  const y2 = 330;
  // 1 adjacent squares (shared edge) union
  { const x = 40; s.shape(boolean('union', [rectPath(x, y2, 100, 100), rectPath(x + 100, y2, 100, 100), rectPath(x + 50, y2 + 100, 100, 60)]), '#06d6a0', INK, 2.2); label(s, x, y2 + 180, 'shared edges merge (3 rects → 1)'); }
  // 2 identical shapes subtract → hole frame
  { const x = 300; const big = rectPath(x, y2, 180, 160, 24); const hole = rectPath(x + 40, y2 + 30, 100, 100, 50); const same = rectPath(x + 40, y2 + 30, 100, 100, 50);
    s.shape(boolean('subtract', [boolean('union', [big, same]), hole]), '#118ab2', INK, 2.2); label(s, x, y2 + 180, 'identical curved edges cancel'); }
  // 3 tangent circles union + internal tangency subtract
  { const x = 560; s.shape(boolean('union', [circlePath(x + 50, y2 + 80, 50), circlePath(x + 150, y2 + 80, 50)]), '#ffd166', INK, 2.2);
    s.shape(boolean('subtract', [circlePath(x + 100, y2 + 80, 30), circlePath(x + 115, y2 + 80, 15)]), '#ef476f', INK, 1.6); label(s, x, y2 + 180, 'external + internal tangency'); }
  // 4 self-intersecting star resolved nonzero vs evenodd
  { const x = 800; const st = parsePathData(`M${x + 90} ${y2} L${x + 143} ${y2 + 162} L${x + 5} ${y2 + 62} L${x + 175} ${y2 + 62} L${x + 37} ${y2 + 162} Z`);
    s.shape(resolve({ ...st, fillRule: 'nonzero' }), '#8338ec', INK, 2); s.shape(at(resolve({ ...st, fillRule: 'evenodd' }), 200, 0), '#fb5607', INK, 2); label(s, x, y2 + 180, 'self-intersection: nonzero | evenodd'); }
  // 5 holes: donut ∪ bar, then minus circles
  { const x = 1240; const donut = boolean('subtract', [circlePath(x + 90, y2 + 80, 80), circlePath(x + 90, y2 + 80, 40)]); const bar = rectPath(x + 10, y2 + 70, 300, 22, 11);
    s.shape(boolean('subtract', [boolean('union', [donut, bar]), circlePath(x + 250, y2 + 81, 8), circlePath(x + 210, y2 + 81, 8)]), '#3a86ff', INK, 2); label(s, x, y2 + 180, 'holes kept through union/subtract'); }
  // third row: overlapping coincident partial edges + many-shape union (cloud) + crescent + shape builder merge
  const y3 = 580;
  { const x = 40; s.shape(boolean('union', [rectPath(x, y3, 120, 80), rectPath(x + 60, y3, 120, 40), rectPath(x + 30, y3 + 40, 60, 80)]), '#ff6b5b', INK, 2); label(s, x, y3 + 160, 'partially coincident edges'); }
  { const x = 300; s.shape(P.cloud(x + 110, y3 + 70, 220, 110, { seed: 3 }), '#ffffff', INK, 2.2); label(s, x, y3 + 160, 'cloud = union of 7 circles'); }
  { const x = 560; s.shape(P.crescent(x + 90, y3 + 70, 70, .5), '#ffd166', INK, 2); s.shape(boolean('exclude', [polygonPath(x + 260, y3 + 70, 70, 6), starPath(x + 260, y3 + 70, 80, 35, 6, -90)]), '#06d6a0', INK, 1.6); label(s, x, y3 + 160, 'crescent | exclude hexagon ⊕ star'); }
  { const x = 1000; const regs = divide([circlePath(x + 70, y3 + 70, 60), circlePath(x + 140, y3 + 70, 60), circlePath(x + 105, y3 + 130, 60)]);
    const pick = regs.map((r, i) => ({ r, i })).filter(({ r }) => r.coverage.filter(Boolean).length >= 2).map(({ i }) => i);
    regs.forEach((r, i) => s.shape(r.path, pick.includes(i) ? '#ef476f' : '#f1e6f5', INK, 1.2));
    label(s, x, y3 + 210, 'shape builder: regions covered ≥2× picked'); }
  { const x = 1300; const b2 = blend(starPath(x + 40, y3 + 60, 40, 18, 5), circlePath(x + 230, y3 + 60, 35), 6);
    s.shape(starPath(x + 40, y3 + 60, 40, 18, 5), '#ff6b5b', INK, 1.2); b2.forEach((p, i) => s.shape(p, mix('#ff6b5b', '#3a86ff', (i + 1) / 7), INK, 1.2)); s.shape(circlePath(x + 230, y3 + 60, 35), '#3a86ff', INK, 1.2); label(s, x, y3 + 160, 'blend star → circle, 6 steps'); }
  // row 4: distortions
  const y4 = 800; const base = (x: number) => starPath(x + 80, y4 + 70, 70, 34, 7, -90, 6);
  ([['roughen', (p: CompoundPath) => roughen(p, { size: 6, detail: 14, smooth: true, seed: 2 })], ['zig-zag', (p: CompoundPath) => zigzag(p, 5, 3)], ['pucker', (p: CompoundPath) => puckerBloat(p, -.35)], ['bloat', (p: CompoundPath) => puckerBloat(p, .45)], ['twist', (p: CompoundPath) => twist(p, 70)]] as Array<[string, (p: CompoundPath) => CompoundPath]>)
    .forEach(([n, f], i) => { const x = 40 + i * 230; s.shape(f(base(x)), ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#8338ec'][i], INK, 2); label(s, x + 40, y4 + 160, n); });
  { const x = 1240; s.stroke(spiralPath(x + 120, y4 + 70, 80, .82, 16), INK, 3); label(s, x + 60, y4 + 160, 'spiral tool'); }
  return s;
}

// ── Sheet 2: strokes ────────────────────────────────────────────────────────────────
function sheetStrokes(): Scene {
  const s = new Scene({ width: 1600, height: 1000, seed: 'stroke' });
  s.fill(rectPath(0, 0, 1600, 1000), PAPER);
  label(s, 40, 24, 'STROKES — outlined to geometry (shown filled), joins, caps, dashes, alignment, variable width, brushes', 18, INK);
  const zig = (x: number, y: number) => parsePathData(`M${x} ${y + 90} L${x + 60} ${y} L${x + 120} ${y + 90} L${x + 170} ${y + 20}`);
  (['miter', 'round', 'bevel'] as const).forEach((j, i) => { const x = 40 + i * 230; s.fill(outlineStroke(zig(x, 80), { width: 22, join: j, cap: 'butt' }), '#118ab2'); s.stroke(zig(x, 80), '#ffffff', 1.2); label(s, x, 200, `join: ${j}`); });
  (['butt', 'round', 'square'] as const).forEach((c, i) => { const x = 740 + i * 200, y = 120; s.fill(outlineStroke(parsePathData(`M${x} ${y} L${x + 140} ${y + 30}`), { width: 26, cap: c }), '#ef476f'); s.stroke(parsePathData(`M${x} ${y} L${x + 140} ${y + 30}`), '#fff', 1.2); label(s, x, 200, `cap: ${c}`); });
  // dashes
  { const y = 260; const r = rectPath(40, y, 220, 140, 0); s.fill(outlineStroke(r, { width: 8, dash: [24, 12], alignDashes: true, cap: 'butt', join: 'miter' }), INK); label(s, 40, y + 160, 'dashes aligned to corners');
    const c = circlePath(420, y + 70, 70); s.fill(outlineStroke(c, { width: 9, dash: [2, 14], cap: 'round' }), '#fb5607'); label(s, 340, y + 160, 'round-cap dot dash');
    const w = P.wave(560, 860, y + 70, 30, 120); s.fill(outlineStroke(w, { width: 10, dash: [40, 12, 8, 12], cap: 'round', join: 'round' }), '#8338ec'); label(s, 560, y + 160, 'dash pattern on a curve'); }
  // alignment
  { const y = 260; const x = 960; const sh = starPath(x + 90, y + 75, 75, 36, 5, -90, 4);
    (['inside', 'center', 'outside'] as const).forEach((a, i) => { const p = at(sh, i * 200, 0); s.fill(p, '#ffd166'); s.fill(outlineStroke(p, { width: 12, align: a, join: 'round' }), INK, { opacity: .85 }); label(s, x + i * 200 + 40, y + 160, `align ${a}`); }); }
  // variable width
  const y3 = 470;
  const spine = (x: number) => smoothThrough([{ x, y: y3 + 100 }, { x: x + 60, y: y3 + 20 }, { x: x + 150, y: y3 + 120 }, { x: x + 230, y: y3 + 30 }], false);
  ([['ink', PROFILES.ink], ['brush', PROFILES.brush], ['taper', PROFILES.taper], ['tail', PROFILES.tail], ['comma', PROFILES.comma]] as const).forEach(([n, f], i) => {
    const x = 40 + i * 300; s.fill(variableStroke(spine(x), { width: 30, profile: f }), INK); label(s, x, y3 + 150, `variable width: ${n}`);
  });
  // custom width points + asymmetric + wobble
  const y4 = 680;
  { const x = 40; s.fill(variableStroke(spine(x).subpaths ? at(spine(x), 0, y4 - y3) : spine(x), { width: 40, profile: [{ u: 0, left: 2 }, { u: .3, left: 22, right: 4 }, { u: .6, left: 4, right: 18 }, { u: 1, left: 1 }] }), '#06d6a0'); label(s, x, y4 + 150, 'width points (asymmetric sides)'); }
  { const x = 340; s.fill(variableStroke(at(spine(x), 0, y4 - y3), { width: 18, profile: PROFILES.ink, wobble: 1, seed: 4 }), INK, { material: s.material('ink') }); label(s, x, y4 + 150, 'hand wobble + ink material'); }
  // art brush: a leaf-chain art stretched along a curve
  { const x = 640; const art = [P.leaf({ x: 0, y: 0 }, { x: 200, y: 0 }, { width: .35, bend: 0 })]; for (const p of artBrush(art, at(spine(x), 0, y4 - y3), { width: 40 })) s.shape(p, '#5fa86a', INK, 1.4); label(s, x, y4 + 150, 'art brush (leaf stretched)'); }
  // pattern brush with corner tiles on a rounded square
  { const x = 960; const tile = [rectPath(0, -6, 18, 12, 3), circlePath(24, 0, 5)]; const corner = [starPath(0, 0, 14, 6, 5)];
    for (const p of patternBrush(rectPath(x, y4, 160, 120, 0), { width: 22, side: tile, outerCorner: corner })) s.fill(p, '#ef476f'); label(s, x, y4 + 150, 'pattern brush + corner tiles'); }
  { const x = 1240; const art = [starPath(0, 0, 10, 4, 5)]; for (const p of scatterBrush(art, at(spine(x), 0, y4 - y3), { spacing: 1.6, size: [.5, 1.4], scatter: [-1.2, 1.2], rotation: [-40, 40], seed: 3 })) s.fill(p, '#ffd166', { opacity: .95 }); s.stroke(at(spine(x), 0, y4 - y3), '#b9a9c4', 1, { dash: [3, 4] }); label(s, x, y4 + 150, 'scatter brush'); }
  return s;
}

// ── Sheet 3: offsets, warps, paint, materials ───────────────────────────────────────
function sheetMaterials(): Scene {
  const s = new Scene({ width: 1600, height: 1150, seed: 'mat' });
  s.fill(rectPath(0, 0, 1600, 1150), PAPER);
  label(s, 40, 24, 'OFFSET PATH · ENVELOPE · PAINT · MATERIALS', 18, INK);
  // offsets
  { const st = starPath(170, 180, 80, 38, 6, -90); const cols = ['#ffd166', '#f4a261', '#e76f51', '#c2405b', '#7d2e68'];
    [36, 24, 12, 0].forEach((d, i) => s.fill(offsetPath(st, d, 'round'), cols[i])); [-8, -16].forEach((d, i) => s.fill(offsetPath(st, d, 'miter'), i ? '#fff' : '#7d2e68'));
    label(s, 60, 300, 'offset path (round / miter, ±)'); }
  // envelope warp of a grid of shapes
  { const grid: CompoundPath[] = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) grid.push((r + c) % 2 ? rectPath(380 + c * 40, 90 + r * 40, 34, 34, 6) : circlePath(397 + c * 40, 107 + r * 40, 15));
    const m = makeMesh({ x: 380, y: 90, w: 240, h: 160 }, 2, 3); m.points[1] = { x: m.points[1].x, y: m.points[1].y - 40 }; m.points[2] = { x: m.points[2].x, y: m.points[2].y - 40 }; m.points[9] = { x: m.points[9].x + 30, y: m.points[9].y + 30 }; m.points[4].x += 40; m.points[7].x -= 30;
    grid.forEach((g, i) => s.fill(envelope(g, m), i % 2 ? '#118ab2' : '#06d6a0'));
    label(s, 380, 300, 'envelope mesh warp');
    const word = [rectPath(680, 120, 220, 24, 12), rectPath(680, 150, 220, 24, 12), rectPath(680, 180, 220, 24, 12)];
    word.forEach((g, i) => s.fill(warp(g, 'arc', .5, { x: 680, y: 120, w: 220, h: 84 }), ['#ef476f', '#ffd166', '#118ab2'][i]));
    const fl = rectPath(940, 110, 200, 110, 4); s.fill(warp(fl, 'flag', .35), '#8338ec'); s.fill(warp(circlePath(1260, 165, 60), 'fisheye', .6, { x: 1180, y: 85, w: 160, h: 160 }), '#fb5607');
    label(s, 690, 300, 'warp: arc · flag · fisheye'); }
  // paints: multi-stop, radial focal, mesh, freeform
  { const y = 340;
    s.fill(rectPath(40, y, 260, 160, 16), linear(40, y, 300, y + 160, [[0, '#ff4e50'], [.35, '#f9d423'], [.7, '#24c6dc'], [1, '#514a9d', .3]])); label(s, 40, y + 175, 'linear: 4 stops + opacity stop');
    s.fill(circlePath(420, y + 80, 80), radial(420, y + 80, 80, [[0, '#fff7d6'], [.4, '#ffb347'], [1, '#c2405b']], { x: 390, y: y + 50 })); label(s, 340, y + 175, 'radial with focal point');
    s.fill(rectPath(540, y, 280, 160, 24), meshGrid({ x: 540, y, w: 280, h: 160 }, [['#1d2b64', '#6a3093', '#f8cdda'], ['#0f9b8e', '#f9d423', '#ff4e50'], ['#1d2b64', '#43cea2', '#f8cdda']], (p, r, c) => ({ x: p.x + (r === 1 && c === 1 ? 30 : 0), y: p.y + (r === 1 && c === 1 ? -20 : 0) })));
    label(s, 540, y + 175, 'mesh gradient (vector tessellation)');
    s.fill(P.blob(980, y + 80, 120, 75, { seed: 4 }), { type: 'freeform', base: '#2b2d42', points: [{ x: 920, y: y + 50, color: '#ef476f', radius: 110 }, { x: 1040, y: y + 60, color: '#ffd166', radius: 100 }, { x: 990, y: y + 130, color: '#06d6a0', radius: 90 }] }); label(s, 870, y + 175, 'freeform gradient');
    s.fill(rectPath(1140, y, 200, 160, 12), { type: 'pattern', w: 24, h: 24, background: '#fff3d6', tiles: [{ d: 'M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z', fill: '#ef476f' }], transform: [Math.cos(.3), Math.sin(.3), -Math.sin(.3), Math.cos(.3), 0, 0] }); label(s, 1140, y + 175, 'pattern fill (rotated)');
    // texture marks
    const reg = P.blob(1470, y + 80, 100, 75, { seed: 9 }); s.fill(reg, '#fff'); s.stroke(P.crossHatch(reg, { spacing: 7, tone: P.directionalTone({ x: 1370, y, w: 200, h: 160 }, 225, 1.4), seed: 2 }), INK, 1.1); s.stroke(reg, INK, 2); label(s, 1380, y + 175, 'cross-hatch by tone'); }
  // materials grid
  const mats: Array<[string, string, Record<string, number | string>?]> = [['watercolor', '#2c9ddc'], ['gouache', '#e8743b'], ['crayon', '#e5517c'], ['pencil', '#2e4fd0'], ['chalk', '#6b4eb8'], ['felt', '#17948a'], ['linocut', '#1a1a1d'], ['riso', '#ff3366'], ['paper', '#e6a52c'], ['volume', '#5fa86a'], ['ink', '#26386e'], ['roughEdge', '#c2405b']];
  mats.forEach(([m, col], i) => {
    const cx = 120 + (i % 6) * 250, cy = 640 + Math.floor(i / 6) * 230; const shape = P.blob(cx, cy, 95, 72, { seed: i + 2, wobble: .12 });
    if (m === 'ink') s.fill(variableStroke(P.rough(shape, { seed: 3, roughness: 2 }), { width: 7, profile: PROFILES.ink }), col, { material: s.material('ink') });
    else s.fill(shape, m === 'volume' ? linearAcross({ x: cx - 95, y: cy - 72, w: 190, h: 144 }, 45, [[0, shade(col, .1)], [1, shade(col, -.1)]]) : col, { material: s.material(m), blend: m === 'watercolor' ? 'multiply' : undefined });
    label(s, cx - 60, cy + 92, m);
  });
  // stipple + halftone
  { const r1 = P.blob(1240, 1060, 0, 0); void r1; }
  return s;
}

// ── Sheet 4: storybook vignette (procedural kit only) ───────────────────────────────
function sheetVignette(): Scene {
  const W = 1024, H = 768; const s = new Scene({ width: W, height: H, seed: 'vignette' }); const R = s.random;
  const LIGHT = 215; const sun = { x: 790, y: 170 };
  const atmo: P.Atmosphere = { sky: '#c9dbe0', haze: .62, cool: 22 }; const hz = P.horizon({ x: 0, y: 0, w: W, h: H }, .58);
  // 1. sky: late-afternoon gradient, sun bloom, soft high haze bands
  s.layer(0, () => {
    s.fill(rectPath(0, 0, W, H), linear(0, 0, 0, hz + 60, [[0, '#6fa6cf'], [.45, '#a9cbdc'], [.78, '#efd9bd'], [1, '#f6c79a']]), { label: 'Sky' });
    s.fill(rectPath(0, 0, W, H), radial(sun.x, sun.y, 520, [[0, '#fff1c9', .9], [.18, '#ffe2a6', .55], [.55, '#ffd49a', .18], [1, '#ffd49a', 0]]), { label: 'Sun bloom' });
    s.fill(circlePath(sun.x, sun.y, 38), radial(sun.x, sun.y, 38, [[0, '#fffdf3'], [.85, '#fff4cf'], [1, '#ffe7a8']]), { label: 'Sun', blur: .6 });
    for (let i = 0; i < 3; i++) { const y = 70 + i * 55; s.fill(P.blob(200 + i * 260, y, 260, 10, { seed: 90 + i, wobble: .25 }), '#ffffff', { opacity: .18, blur: 6, label: 'High haze' }); }
  });
  // 2. clouds: boolean-union cumulus, lit from the sun side, cool undersides
  s.layer(1, () => {
    for (const [cx, cy, w, h, seed] of [[230, 150, 280, 96, 3], [560, 92, 170, 58, 8], [960, 285, 130, 44, 12]] as const) {
      const c = P.cloud(cx, cy, w, h, { seed, puff: .7 });
      P.painted(s, c, '#ffffff', { light: LIGHT, medium: 'gouache', shadow: .45, highlight: .3, temperature: .7, label: 'Cloud' });
    }
  });
  // 3. far hills: three planes, atmospheric perspective
  s.layer(2, () => {
    const greens = ['#6a9b62', '#5a8f55', '#4d8549'];
    ([[.95, hz - 64], [.72, hz - 26], [.48, hz + 14]] as const).forEach(([depth, crest], i) => {
      const hl = P.hill(-120, W + 120, hz + 70 + i * 34, crest, { seed: 20 + i, roughness: .1, bottom: H + 10 });
      const col = P.atDepth(greens[i], depth, atmo);
      s.fill(hl, linear(0, crest, 0, hz + 140, [[0, shade(col, .05)], [1, shade(col, -.06)]]), { material: s.material('gouache', { streak: 0, mottle: .05, edge: 1.5 }), label: `Far hill ${i + 1}` });
    });
  });
  // 4. near hill with painterly dabs + grass
  const near = P.hill(-140, W + 140, H - 110, hz + 46, { seed: 31, roughness: .05, bottom: H + 10 });
  s.layer(3, () => {
    s.fill(near, linear(0, hz + 40, 0, H, [[0, '#8fcd6d'], [.35, '#6db45a'], [1, '#3f8243']]), { material: s.material('gouache', { streak: 0, mottle: .06, edge: 1.5 }), label: 'Near hill' });
    s.clip(near, () => {
      // soft value patches (cloud shadows / worn ground) — big, blurred, low contrast
      for (const p of P.poisson({ x: 0, y: hz + 30, w: W, h: H - hz }, { r: 120, seed: 5, region: near })) { const depth = (p.y - hz) / (H - hz); s.fill(P.blob(p.x, p.y, 90 + depth * 60, 22 + depth * 20, { seed: Math.floor(p.x) }), depth < .4 ? '#b6e08f' : '#2f6b34', { opacity: depth < .4 ? .35 : .22, blur: 10, label: 'Ground value' }); }
      for (const p of P.poisson({ x: 0, y: hz + 60, w: W, h: H - hz }, { r: 30, seed: 6, region: near }).slice(0, 120)) for (const g of P.grassBlades(p.x, p.y, 3, 14 + (p.y - hz) * .07, 12, Math.floor(p.x))) s.ink(g, R.pick(['#3f8a3c', '#5aa34c', '#2f6a34']), 2.6, PROFILES.tail, { opacity: .85, label: 'Grass' });
    });
  });
  // 5. the apple tree
  s.layer(4, () => s.group('Tree', () => {
    const tx = 235, ty = hz + 92;
    P.contactShadow(s, tx + 20, ty + 6, 230, 30, '#1f3a22', .4);
    const trunk = smoothThrough([{ x: tx - 4, y: ty + 4 }, { x: tx + 6, y: ty - 60 }, { x: tx - 2, y: ty - 130 }], false);
    const trunkShape = variableStroke(trunk, { width: 36, profile: (u: number) => 1.15 - u * .6, cap: 'butt' });
    const wood = boolean('union', [trunkShape, variableStroke(smoothThrough([{ x: tx + 2, y: ty - 80 }, { x: tx + 40, y: ty - 118 }, { x: tx + 76, y: ty - 128 }], false), { width: 13, profile: PROFILES.tail }), variableStroke(smoothThrough([{ x: tx - 2, y: ty - 96 }, { x: tx - 46, y: ty - 136 }], false), { width: 11, profile: PROFILES.tail })]);
    P.painted(s, wood, '#8a5a3a', { light: LIGHT, medium: 'gouache', shadow: .8, highlight: .4, ink: '#3b2416', inkWidth: 1.6, label: 'Trunk' });
    s.clip(trunkShape, () => { for (let i = 0; i < 6; i++) s.ink(smoothThrough([{ x: tx - 10 + i * 4, y: ty - 4 }, { x: tx - 6 + i * 3 + R.jit(3), y: ty - 60 }, { x: tx - 4 + i * 2, y: ty - 120 }], false), '#5b3a26', 1.6, PROFILES.taper, { opacity: .5, label: 'Bark' }); });
    const crown = boolean('union', [P.blob(tx - 50, ty - 175, 92, 70, { seed: 41 }), P.blob(tx + 58, ty - 168, 86, 66, { seed: 42 }), P.blob(tx + 4, ty - 236, 92, 70, { seed: 43 }), P.blob(tx - 92, ty - 128, 56, 42, { seed: 44 }), P.blob(tx + 100, ty - 120, 54, 40, { seed: 45 })]);
    P.foliage(s, crown, { light: LIGHT, colors: { dark: '#2e6837', mid: '#4f974a', light: '#a6d97e', ink: '#21412a' }, seed: 9, leaves: 140 });
    for (const [ax, ay] of [[tx - 34, ty - 158], [tx + 64, ty - 150], [tx + 14, ty - 214], [tx - 86, ty - 118], [tx + 104, ty - 112]]) P.painted(s, circlePath(ax, ay, 9.5), '#d9443a', { medium: 'flat', shadow: .7, highlight: .9, ink: '#5a1d18', inkWidth: 1, label: 'Apple' });
  }));
  // 6. flowers in the foreground (radial symmetry)
  s.layer(5, () => {
    for (const p of P.poisson({ x: 360, y: H - 140, w: 640, h: 110 }, { r: 58, seed: 77 }).slice(0, 10)) s.group('Flower', () => {
      s.ink(smoothThrough([{ x: p.x + R.jit(4), y: p.y + 34 }, { x: p.x, y: p.y }], false), '#3a7a38', 3.4, PROFILES.tail, { label: 'Stem' });
      const petals = P.radialRepeat(P.petal(p.x, p.y, 13, 10, -90), 5, p, R.float(0, 70)); const col = R.pick(['#fff6f2', '#ffd3df', '#ffe6a6']);
      for (const pt of petals) s.fill(pt, col, { label: 'Petal', material: s.material('volume', { depth: 4, shadow: .25, highlight: .2 }) });
      s.fill(circlePath(p.x, p.y, 4.2), '#e9a23b', { label: 'Flower heart' });
    });
  });
  // 7. Pip — one CharacterSpec, two poses, drawn on model; the far one tinted by atmosphere
  const pip: P.CharacterSpec = { name: 'Pip', seed: 7, build: 'round', headRatio: .64, ears: 'round', height: 170, lineWeight: 2.6, medium: 'gouache', light: LIGHT, palette: { body: '#c98a54', belly: '#f2d6b0', ink: '#3a2418', cheek: '#f08a7e' } };
  s.layer(6, () => {
    P.drawCharacter(s, pip, { x: 600, y: H - 88, facing: -1, armL: 20, armR: 120, expression: { eyes: 'open', mouth: 'open', brows: .4 }, look: { x: -.7, y: -.5 } });
    P.drawCharacter(s, { ...pip, name: 'Pip (far)', palette: { ...pip.palette, body: P.atDepth('#c98a54', .45, atmo), belly: P.atDepth('#f2d6b0', .45, atmo) } }, { x: 878, y: hz + 66, scale: .4, facing: 1, armL: 20, armR: 20, expression: { eyes: 'happy', mouth: 'smile' } });
  });
  // 8. butterfly (mirror symmetry) on the line of Pip's gaze
  s.layer(7, () => s.group('Butterfly', () => {
    const c = { x: 470, y: 330 };
    const wings: Array<[CompoundPath, string]> = [[P.leaf(c, { x: c.x + 24, y: c.y - 20 }, { width: 1, bend: .12 }), '#ff8aa1'], [P.leaf(c, { x: c.x + 16, y: c.y + 14 }, { width: .9 }), '#ffb26b']];
    for (const [w, col] of wings) for (const m of P.mirror(w, 90, c)) s.fill(m, col, { material: s.material('watercolor', { edge: 2.5, grain: .2 }), blend: 'multiply' });
    s.ink(smoothThrough([{ x: c.x, y: c.y + 10 }, { x: c.x, y: c.y - 12 }], false), INK, 3.2, PROFILES.taper);
  }));
  // 9. warm light pass + paper grain over everything
  s.layer(9, () => {
    s.fill(rectPath(0, 0, W, H), radial(sun.x, sun.y, 900, [[0, '#ffe8b0', .22], [.6, '#ffd9a0', .06], [1, '#3a2a4a', .16]]), { blend: 'soft-light', label: 'Light pass' });
    s.fill(rectPath(0, 0, W, H), '#ffffff', { blend: 'multiply', material: s.material('paper', { amount: .028, scale: .45 }), label: 'Paper grain' });
  });
  return s;
}

const SHEETS: Record<string, () => Scene> = { booleans: sheetBooleans, strokes: sheetStrokes, materials: sheetMaterials, vignette: sheetVignette };

async function main() {
  const which = process.argv[2]; const names = which ? [which] : Object.keys(SHEETS);
  const files: Array<{ name: string; svg: string; w: number; h: number }> = [];
  for (const n of names) {
    const t0 = Date.now(); const sc = SHEETS[n](); const objs = sc.build(); const svg = objectsToSvg(objs, sc.width, sc.height);
    fs.writeFileSync(path.join(OUT, `${n}.svg`), svg); files.push({ name: n, svg, w: sc.width, h: sc.height });
    console.log(`${n}: ${objs.length} objects, ${(svg.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
  }
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const f of files) {
    await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${f.svg}</body></html>`, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(OUT, `${f.name}.png`) as `${string}.png`, clip: { x: 0, y: 0, width: f.w, height: f.h } });
    console.log('wrote', path.join(OUT, `${f.name}.png`));
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
export { sheetVignette, sheetBooleans, sheetStrokes, sheetMaterials, compose, rotate, scale, withAlpha, ellipseAt, dashPath };
