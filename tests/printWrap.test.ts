import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVehicleWrap, tilePanels, wrapPreflight, cylinderWrap, coneSleeve, tuckEndBox, stickerCut, wrapTemplateSvg,
  printableWidthIn, DEFAULT_VEHICLE_MATERIAL, VEHICLE_TEMPLATES, type WrapSurface, type VehicleTemplateId,
} from '../services/print/wrap';

const near = (a: number, b: number, eps = 1e-3, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≉ ${b}`);
const M = DEFAULT_VEHICLE_MATERIAL;

function assertCovers(s: WrapSurface, bleed: number, mat = M) {
  const t = tilePanels(s, mat, bleed);
  const P = printableWidthIn(mat);
  const vertical = t.orientation === 'vertical';
  const a = (p: typeof t.panels[0]) => vertical ? p.rect.x : p.rect.y;
  const len = (p: typeof t.panels[0]) => vertical ? p.rect.w : p.rect.h;
  const ps = [...t.panels].sort((p, q) => a(p) - a(q));
  near(a(ps[0]), -bleed);
  near(a(ps[ps.length - 1]) + len(ps[ps.length - 1]), (vertical ? s.w : s.h) + bleed);
  for (const p of ps) {
    assert.ok(p.printW <= P + 1e-6, `${s.id} panel ${p.index} ${p.printW} > ${P}`);
    // The other axis spans the whole surface + bleed.
    near(vertical ? p.rect.h : p.rect.w, (vertical ? s.h : s.w) + 2 * bleed);
  }
  for (let i = 1; i < ps.length; i++) {
    const overlap = a(ps[i - 1]) + len(ps[i - 1]) - a(ps[i]);
    near(overlap, mat.overlapIn, 1e-3, `${s.id} overlap between ${i - 1} and ${i} is ${overlap}`);
    assert.equal(ps[i].overlapLeft, mat.overlapIn);
  }
  return t;
}

test('every template tiles every surface with full coverage, roll-width panels and overlaps', () => {
  for (const id of Object.keys(VEHICLE_TEMPLATES) as VehicleTemplateId[]) {
    const t = VEHICLE_TEMPLATES[id].typical;
    const job = buildVehicleWrap(id, { lengthIn: t.lengthIn[1], heightIn: t.heightIn[1], widthIn: t.widthIn[1] });
    assert.ok(job.surfaces.length >= 3);
    for (const s of job.surfaces) assertCovers(s, job.bleedIn);
  }
});

test('a 53 ft trailer side needs many panels and reports media', () => {
  const job = buildVehicleWrap('trailer-53ft', { lengthIn: 636, heightIn: 162, widthIn: 102 });
  const side = job.surfaces.find(s => s.id === 'driver-side')!;
  const t = assertCovers(side, 3);
  assert.ok(t.panels.length >= 3);
  assert.ok(t.linearIn > 0 && t.mediaSqFt > t.surfaceSqFt && t.wasteSqFt > 0);
});

test('seams snap to a door gap within ±6 in, and stay put without one', () => {
  const plain: WrapSurface = { id: 'driver-side', label: 'test', w: 100, h: 80, zones: [] };
  const free = tilePanels(plain, M, 3);
  assert.equal(free.orientation, 'vertical');
  assert.deepEqual(free.seams, [50]);
  const withGap: WrapSurface = { ...plain, zones: [{ kind: 'door-gap', rect: { x: 51.75, y: 20, w: 0.5, h: 50 }, note: '' }] };
  const snapped = assertCovers(withGap, 3);
  assert.deepEqual(snapped.seams, [52]);
  assert.deepEqual(snapped.snapped, [52]);
  const farGap: WrapSurface = { ...plain, zones: [{ kind: 'door-gap', rect: { x: 64.75, y: 20, w: 0.5, h: 50 }, note: '' }] };
  assert.deepEqual(tilePanels(farGap, M, 3).seams, [50]);
});

test('seams step out of a handle', () => {
  const s: WrapSurface = { id: 'driver-side', label: 'test', w: 100, h: 80, zones: [{ kind: 'handle', rect: { x: 48, y: 30, w: 4, h: 3 }, note: '' }] };
  const t = assertCovers(s, 3);
  assert.ok(t.seams[0] < 47.5 || t.seams[0] > 52.5, `seam ${t.seams[0]} inside handle`);
});

test('a short wide surface prints sideways when the height fits the roll', () => {
  const s: WrapSurface = { id: 'driver-side', label: 'car side', w: 180, h: 42, zones: [] };
  const t = assertCovers(s, 3);
  assert.equal(t.orientation, 'sideways');
  assert.equal(t.panels.length, 1);
  near(t.linearIn, 186);
});

test('cylinder label flat width = π·d + overlap', () => {
  const c = cylinderWrap(2.6, 4, 0.25);
  near(c.flatIn[0], Math.PI * 2.6 + 0.25);
  assert.equal(c.flatIn[1], 4);
});

test('cone sleeve unwrap matches a hand-computed case (top 3.5, bottom 2.5, h 4)', () => {
  const c = coneSleeve(3.5, 2.5, 4);
  const g = c.geometry!;
  near(g.slantIn, Math.sqrt(16.25));          // 4.0311
  near(g.outerRadiusIn, 14.1090, 1e-3);        // s·D/(D−d) = 4.0311·3.5/1
  near(g.innerRadiusIn, 10.0778, 1e-3);        // R − s
  near(g.sweepRad, 0.77933, 1e-4);             // π·3.5 / 14.109
  near(g.innerRadiusIn * g.sweepRad, Math.PI * 2.5, 2e-3); // inner arc = bottom circumference
  near(g.outerRadiusIn * g.sweepRad, Math.PI * 3.5, 2e-3); // outer arc = top circumference
  // Flat box: sweep < 180° so width = 2R·sin(sweep/2), height = R − r·cos(sweep/2).
  const sw = g.sweepRad + g.tabRad;
  near(c.flatIn[0], 2 * g.outerRadiusIn * Math.sin(sw / 2), 2e-3);
  near(c.flatIn[1], g.outerRadiusIn - g.innerRadiusIn * Math.cos(sw / 2), 2e-3);
  for (const p of [...c.cut, c.bleedPath!]) assert.match(p, /^[MLCZ0-9 .\-]+$/);
});

test('cone sleeve with equal diameters degenerates to a cylinder', () => {
  const c = coneSleeve(3, 3, 4, 0.375);
  near(c.flatIn[0], Math.PI * 3 + 0.375);
  assert.equal(c.flatIn[1], 4);
});

test('tuck-end box flat size is sane', () => {
  const b = tuckEndBox(4, 2, 6, 0.018);
  const [w, h] = b.flatIn;
  assert.ok(w > 2 * (4 + 2) && w < 2 * (4 + 2) + 1, `width ${w}`);
  assert.ok(h > 6 + 2 * 2 && h < 6 + 2 * 2 + 1.5, `height ${h}`);
  assert.ok(b.crease.length >= 8 && b.cut.length === 1);
  for (const p of [...b.cut, ...b.crease]) {
    assert.match(p, /^[MLCZ0-9 .\-]+$/);
    for (const n of p.match(/-?\d+(\.\d+)?/g)!.map(Number)) assert.ok(n >= -1e-9 && n <= Math.max(w, h) + 1e-9);
  }
});

test('sticker paths use only M/L/C/Z', () => {
  for (const s of [stickerCut('circle', 3, 3), stickerCut('rounded-rect', 3, 2, 0.25), stickerCut('rect', 2, 2)]) {
    for (const p of [...s.cut, s.bleedPath!]) assert.match(p, /^[MLCZ0-9 .\-]+$/);
  }
});

test('preflight flags low ppi, thin bleed and content on windows', () => {
  const job = buildVehicleWrap('box-truck-16ft', { lengthIn: 276, heightIn: 125, widthIn: 94 });
  const side = job.surfaces[0];
  const low = wrapPreflight(job, { [side.id]: { pixelW: 2000, pixelH: 900 } });
  assert.ok(low.some(f => f.code === 'wrap-low-ppi' && f.level === 'error'));
  const ok = wrapPreflight(job, { [side.id]: { pixelW: (side.w + 6) * 150, pixelH: (side.h + 6) * 150 } });
  assert.ok(!ok.some(f => f.code === 'wrap-low-ppi'));
  assert.ok(ok.some(f => f.code === 'wrap-area' && f.level === 'info'));
  assert.ok(wrapPreflight({ ...job, bleedIn: 1 }).some(f => f.code === 'wrap-bleed' && f.level === 'error'));

  const car = buildVehicleWrap('sedan', { lengthIn: 192, heightIn: 57, widthIn: 72 });
  const ds = car.surfaces.find(s => s.id === 'driver-side')!;
  const win = ds.zones.find(z => z.kind === 'window')!.rect;
  const f = wrapPreflight(car, { [ds.id]: { pixelW: 30000, pixelH: 10000, keyRects: [{ x: win.x + 2, y: win.y + 2, w: 5, h: 5 }] } });
  assert.ok(f.some(x => x.code === 'wrap-content-on-window'));
});

test('guide SVG renders surfaces, panels and dielines', () => {
  const svg = wrapTemplateSvg(buildVehicleWrap('suv', { lengthIn: 190, heightIn: 70, widthIn: 76 }));
  assert.match(svg, /^<svg[^>]+viewBox="0 0 [\d.]+ [\d.]+"/);
  assert.match(svg, /P1 /);
  assert.match(wrapTemplateSvg(tuckEndBox(4, 2, 6)), /data-spot="Crease"/);
});
