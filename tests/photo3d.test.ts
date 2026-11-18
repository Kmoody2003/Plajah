// Photo → 3D fidelity loop (docs/game-studio-photo-to-3d.md): model ops, gap reports, scoring, planning,
// replay and one synthetic end-to-end loop with a scripted eye.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyModelDoc, type ModelDoc, type ModelPart, type Vec3 } from '../services/gamestudio/photo3d/schema';
import { applyModelOp, describeModelOp, extrudePart, ModelHistory, rotYTo, validateModelOp, type ModelOp } from '../services/gamestudio/photo3d/modelOps';
import { parseGapReport, gapCost, gapPrompt } from '../services/gamestudio/photo3d/gapReport';
import { fidelity, loopVerdict, scoreView, type Picture } from '../services/gamestudio/photo3d/score';
import { composeDistance, rotate } from '../services/gamestudio/photo3d/sdf';
import { framingCamera, project, ray, traceField } from '../services/gamestudio/photo3d/camera';
import { anchorGaps, parseAgentOps, planFromGaps, agentPrompt } from '../services/gamestudio/photo3d/planner';
import { replay, scanField } from '../services/gamestudio/photo3d/replay';
import { renderMesh } from '../services/gamestudio/photo3d/render';
import { alignToPhoto, maskBox } from '../services/gamestudio/photo3d/align';
import { runFidelityLoop, applicable, scaled, ground, steadyGaps } from '../services/gamestudio/photo3d/loop';
import { outlineBlobs } from '../services/gamestudio/photo3d/outline';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const part = (id: string, over: Partial<ModelPart> = {}): ModelPart => ({ id, name: id, op: 'add', shape: 'ellipsoid', center: [0, 0, 0], size: [0.2, 0.2, 0.2], rot: [0, 0, 0], ...over });
const doc0 = (): ModelDoc => ({ ...emptyModelDoc('m1', 'Test', 1), references: [{ name: 'photo', url: 'photo.png' }] });

// ── ops ────────────────────────────────────────────────────────────────────────────────────────────────────

test('every op undoes back to the same document', () => {
  let d = doc0();
  const ops: ModelOp[] = [
    { op: 'setSubject', subject: 'conga drum' },
    { op: 'putMaterial', material: { id: 'brass', name: 'Brass', colour: '#c8a040', metalness: 1, roughness: 0.3 } },
    { op: 'addPart', part: part('rim', { shape: 'torus', size: [0.6, 0.04, 0], material: 'brass' }) },
    { op: 'updatePart', partId: 'rim', patch: { center: [0, 0.5, 0] } },
    { op: 'extrude', id: 'lug', name: 'Lug', from: [0.3, 0.2, 0], dir: [1, 0, 0], length: 0.1, radius: 0.02 },
    { op: 'sculpt', stroke: { id: 's1', name: 'belly', brush: 'clay', points: [[0, 0, 0.3], [0, -0.1, 0.3]], radius: 0.1, strength: 0.5 } },
    { op: 'paint', layer: { id: 'p1', name: 'rim paint', region: { kind: 'part', partId: 'rim' }, colour: '#ffcc00', opacity: 1 } },
    { op: 'useScan', on: false },
  ];
  const states: ModelDoc[] = [d];
  const inverses: ModelOp[] = [];
  for (const o of ops) { const a = applyModelOp(d, o); inverses.push(a.inverse); d = a.doc; states.push(d); }
  for (let i = ops.length - 1; i >= 0; i--) { d = applyModelOp(d, inverses[i]).doc; assert.deepEqual(d, states[i], `undo of ${ops[i].op}`); }
});

test('removing a part takes its pinned paint along, and undo brings both back', () => {
  let d = applyModelOp(doc0(), { op: 'addPart', part: part('knob') }).doc;
  d = applyModelOp(d, { op: 'paint', layer: { id: 'kp', name: 'knob colour', region: { kind: 'part', partId: 'knob' }, colour: '#112233', opacity: 1 } }).doc;
  const { doc, inverse } = applyModelOp(d, { op: 'removePart', partId: 'knob' });
  assert.equal(doc.parts.length, 0); assert.equal(doc.paints.length, 0);
  assert.deepEqual(applyModelOp(doc, inverse).doc, d);
});

test('a material in use cannot be removed; unknown references are refused', () => {
  let d = applyModelOp(doc0(), { op: 'putMaterial', material: { id: 'wood', name: 'Wood', colour: '#6b3f1f', metalness: 0, roughness: 0.7 } }).doc;
  d = applyModelOp(d, { op: 'addPart', part: part('leg', { material: 'wood' }) }).doc;
  assert.throws(() => applyModelOp(d, { op: 'removeMaterial', materialId: 'wood' }), /still used/);
  assert.throws(() => applyModelOp(d, { op: 'addPart', part: part('x', { material: 'nope' }) }), /No material/);
  assert.throws(() => applyModelOp(d, { op: 'paint', layer: { id: 'q', name: 'q', region: { kind: 'part', partId: 'ghost' }, colour: '#000000', opacity: 1 } }), /No part/);
});

test('history: a batch is one undo step and is marked as Aria\'s', () => {
  const h = new ModelHistory(doc0(), () => 5);
  h.apply({ op: 'batch', label: 'Aria, round 1: rings', ops: [{ op: 'addPart', part: part('a') }, { op: 'addPart', part: part('b') }] }, 'aria');
  assert.equal(h.doc.parts.length, 2);
  assert.equal(h.entries[0].by, 'aria');
  assert.equal(h.entries[0].label, 'Aria, round 1: rings');
  h.undo(); assert.equal(h.doc.parts.length, 0);
  h.redo(); assert.equal(h.doc.parts.length, 2);
});

test('ops read as sentences', () => {
  const d = applyModelOp(doc0(), { op: 'putMaterial', material: { id: 'brass', name: 'Brass', colour: '#c8a040', metalness: 1, roughness: 0.3 } }).doc;
  assert.equal(describeModelOp(d, { op: 'addPart', part: part('rim', { name: 'Top rim', shape: 'torus', material: 'brass', center: [0, 0.6, 0] }) }), 'Added Top rim (a ring in Brass) at 0, 0.6, 0');
  assert.match(describeModelOp(d, { op: 'sculpt', stroke: { id: 's', name: 'the belly', brush: 'carve', points: [[0, 0, 0]], radius: 0.1, strength: 1 } }), /^Carved into the belly/);
  assert.equal(describeModelOp(d, { op: 'paint', layer: { id: 'p', name: 'all', region: { kind: 'all' }, projectPhoto: 'photo', opacity: 1 } }), "Painted everything with the photo's colours");
});

test('validateModelOp refuses what a model gets wrong', () => {
  assert.equal(validateModelOp({ op: 'addPart', part: part('ok') }), null);
  assert.match(validateModelOp({ op: 'addPart', part: { ...part('x'), shape: 'teapot' } })!, /shape must be/);
  assert.match(validateModelOp({ op: 'addPart', part: { ...part('x'), center: [0, 9, 0] } })!, /center/);
  assert.match(validateModelOp({ op: 'paint', layer: { id: 'p', name: 'p', region: { kind: 'all' }, opacity: 1 } })!, /needs a colour/);
  assert.match(validateModelOp({ op: 'paint', layer: { id: 'p', name: 'p', region: { kind: 'all' }, colour: 'gold', opacity: 1 } })!, /#rrggbb/);
  assert.match(validateModelOp({ op: 'sculpt', stroke: { id: 's', name: 's', brush: 'smooth', points: [[0, 0, 0]], radius: 0.1, strength: 1 } })!, /brush must be/);
  assert.match(validateModelOp({ op: 'explode' })!, /unknown op/);
  assert.match(validateModelOp({ op: 'batch', label: 'x', ops: [{ op: 'batch', label: 'y', ops: [{ op: 'batch', label: 'z', ops: [] }] }] })!, /nest/);
});

test('extrude becomes a rod from the point along the direction; rotYTo aims +Y', () => {
  const p = extrudePart({ op: 'extrude', id: 'h', name: 'Handle', from: [0.1, 0, 0], dir: [2, 0, 0], length: 0.2, radius: 0.03 });
  assert.equal(p.shape, 'capsule'); assert.deepEqual(p.end!.map(v => +v.toFixed(6)), [0.3, 0, 0]);
  for (const d of [[1, 0, 0], [0, 0, 1], [0.3, -0.5, 0.8], [0, -1, 0]] as Vec3[]) {
    const l = Math.hypot(...d), v = rotate(rotYTo(d), [0, 1, 0]);
    for (let k = 0; k < 3; k++) near(v[k], d[k] / l, 1e-9);
  }
});

// ── gap reports ────────────────────────────────────────────────────────────────────────────────────────────

test('gap reports: fences, 0..1000 boxes, pixel boxes, loose words, dedupe', () => {
  const raw = '```json\n' + JSON.stringify({
    subject: 'conga drum', score: 72, items: [
      { id: 'rim', axis: 'prop', kind: 'missing', view: 'photo', region: [300, 240, 760, 300], description: 'Brass rim at the top', severity: 'high', confidence: 0.9, hint: { shape: 'ring', colour: 'C8A040', metal: true } },
      { id: 'rim2', axis: 'prop', kind: 'missing', view: 'photo', region: [305, 238, 758, 302], description: 'Brass top rim again', severity: 'critical' },
      { axis: 'Colour', view: 'render-photo', region: { x: 0.1, y: 0.5, w: 0.3, h: 0.2 }, description: 'Body is too light', severity: 3 },
      { axis: 'lighting', region: [0, 0, 1, 1], description: 'shadows differ', severity: 'low' },
      { axis: 'geometry', view: 'render-side', region: [10, 20, 200, 300], description: 'Too thin from the side', severity: 'medium' },
    ],
  }) + '\n```';
  const { report, warnings } = parseGapReport(raw, { views: ['photo', 'render-photo', 'render-side'], viewSize: { 'render-side': [384, 384] } });
  assert.equal(report.subject, 'conga drum'); assert.equal(report.visionScore, 72);
  assert.equal(report.items.length, 3, JSON.stringify(warnings));
  const rim = report.items[0];
  assert.equal(rim.severity, 'critical'); // merged with its twin, the more severe kept
  near(rim.region.x0, 0.305); assert.equal(rim.hint?.colour, '#c8a040');
  assert.equal(report.items[1].axis, 'colour'); assert.equal(report.items[1].severity, 'high');
  near(report.items[1].region.x1, 0.4);
  // 0..1000 is assumed unless a box goes past 1000; this one is in 0..1000 too.
  near(report.items[2].region.y1, 0.3);
  assert.ok(warnings.some(w => /unknown axis/.test(w)));
});

test('gap cost is capped per axis and the prompt names every picture', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, axis: 'prop' as const, kind: 'missing' as const, view: 'photo', region: { x0: 0, y0: 0, x1: 1, y1: 1 }, description: 'x', severity: 'critical' as const, confidence: 1 }));
  assert.equal(gapCost(items).prop, 0.6);
  const p = gapPrompt({ renders: ['render-photo', 'render-side'], round: 2 });
  assert.match(p.user, /"render-photo"/); assert.match(p.user, /"render-side"/);
});

// ── scoring ────────────────────────────────────────────────────────────────────────────────────────────────

const disc = (w: number, h: number, cx: number, cy: number, r: number, rgb: [number, number, number]): Picture => {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) { data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255; } else data[o + 3] = 0;
  }
  return { width: w, height: h, data };
};

test('scoreView: same picture scores 1; moved and recoloured score less', () => {
  const a = disc(96, 96, 48, 48, 30, [200, 40, 40]);
  const same = scoreView(a, a);
  near(same.iou, 1); near(same.outline, 0); near(same.deltaE, 0, 1e-9); near(same.colour, 1);
  const moved = scoreView(a, disc(96, 96, 54, 48, 30, [200, 40, 40]));
  assert.ok(moved.iou < 0.9 && moved.shape < same.shape);
  const tinted = scoreView(a, disc(96, 96, 48, 48, 30, [60, 60, 200]));
  near(tinted.iou, 1); assert.ok(tinted.deltaE > 50 && tinted.colour < 0.1);
});

test('fidelity mixes measured axes and open gaps; the eye\'s own score is kept apart', () => {
  const pixel = { iou: 0.98, outline: 0.004, deltaE: 3, colourCover: 1, shape: 0.98, colour: 1 };
  const clean = fidelity(pixel, [], 88);
  near(clean.overall, 0.3 * 0.98 + 0.2 * 1 + 0.2 * 1 + 0.15 + 0.15, 1e-9);
  assert.equal(clean.visionScore, 88);
  const withProp = fidelity(pixel, [{ id: 'g', axis: 'prop', kind: 'missing', view: 'photo', region: { x0: 0, y0: 0, x1: 1, y1: 1 }, description: 'x', severity: 'high', confidence: 1 }]);
  near(clean.overall - withProp.overall, 0.15 * 0.07, 1e-9);
});

test('loopVerdict: aims for 99, stops on flat gains, never calls a stall finished', () => {
  assert.deepEqual(loopVerdict([0.7]), { stop: false, why: 'below target' });
  assert.deepEqual(loopVerdict([0.7, 0.8, 0.995]), { stop: true, why: 'reached aim' });
  assert.deepEqual(loopVerdict([0.8, 0.801, 0.802]), { stop: true, why: 'stalled' });
  assert.deepEqual(loopVerdict([0.9, 0.955, 0.957, 0.958]), { stop: true, why: 'passed target, gains flattened' });
  assert.deepEqual(loopVerdict([0.9, 0.955, 0.97]), { stop: false, why: 'improving' });
  assert.equal(loopVerdict([0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.86, 0.87, 0.88]).why, 'out of rounds');
});

// ── geometry ───────────────────────────────────────────────────────────────────────────────────────────────

test('sdf parts: sphere, torus, box, carve, capsule and a clay stroke', () => {
  const ball = composeDistance(null, [part('b', { size: [1, 1, 1] })], []);
  near(ball(0.5, 0, 0), 0, 1e-9); near(ball(0, 0, 0), -0.5, 1e-9);
  const ring = composeDistance(null, [part('r', { shape: 'torus', size: [1, 0.2, 0] })], []);
  near(ring(0.4, 0, 0), -0.1, 1e-9); near(ring(0, 0, 0), 0.3, 1e-9);
  const boxCut = composeDistance(null, [part('b', { shape: 'box', size: [1, 1, 1] }), part('c', { op: 'carve', size: [0.4, 0.4, 0.4] })], []);
  assert.ok(boxCut(0, 0, 0) > 0, 'carved hollow'); assert.ok(boxCut(0.45, 0.45, 0.45) < 0);
  const rod = composeDistance(null, [part('c', { shape: 'capsule', center: [0, 0, 0], end: [0, 1, 0], size: [0.1, 0.1, 0] })], []);
  near(rod(0, 0.5, 0.1), 0, 1e-9);
  const turned = composeDistance(null, [part('t', { shape: 'box', size: [1, 0.1, 0.1], rot: [0, 0, 90] })], []);
  assert.ok(turned(0, 0.45, 0) < 0 && turned(0.45, 0, 0) > 0, 'rotZ 90 stands the bar up');
  const lumped = composeDistance(null, [part('b', { size: [1, 1, 1] })], [{ id: 's', name: 's', brush: 'clay', points: [[0.5, 0, 0]], radius: 0.2, strength: 1 }]);
  assert.ok(lumped(0.5, 0, 0) < -0.04);
});

test('camera: a projected point comes back along its ray', () => {
  const cam = { ...framingCamera({ yawDeg: 30, pitchDeg: 20, width: 200, height: 300 }), frame: { scale: 1.3, dx: 7, dy: -4 } };
  const p: Vec3 = [0.2, -0.3, 0.1];
  const [x, y, z] = project(cam, p);
  const r = ray(cam, x, y);
  const q = [0, 1, 2].map(k => r.origin[k] + r.dir[k] * Math.hypot(p[0] - r.origin[0], p[1] - r.origin[1], p[2] - r.origin[2]));
  for (let k = 0; k < 3; k++) near(q[k], p[k], 1e-6);
  assert.ok(z > 0);
  const hit = traceField(composeDistance(null, [part('b', { size: [1, 1, 1] })], []), [0, 0, 3], [0, 0, -1]);
  near(hit!.point[2], 0.5, 0.003); near(hit!.normal[2], 1, 1e-3);
});

// ── planning ───────────────────────────────────────────────────────────────────────────────────────────────

/** A drum-ish body: a cylinder standing on +Y. */
const BODY = part('body', { shape: 'cylinder', size: [0.7, 1.4, 0.7], round: 0.02 });
const RING: ModelPart = part('ring', { shape: 'torus', center: [0, 0.2, 0], size: [0.82, 0.08, 0], name: 'Middle band' });

test('planner: a missing band becomes a ring round the body at the right height; repeats are placed round', () => {
  const body = composeDistance(null, [BODY], []);
  const cam = framingCamera({ yawDeg: 0, pitchDeg: 10, width: 300, height: 300 });
  // Where the band sits in the picture.
  const [, ry] = project(cam, [0, 0.2, 0.35]);
  const [lx] = project(cam, [-0.35, 0.2, 0]), [rx] = project(cam, [0.35, 0.2, 0]);
  const report = parseGapReport({
    items: [
      { id: 'band', axis: 'prop', kind: 'missing', view: 'photo', region: [lx / 300, (ry - 6) / 300, rx / 300, (ry + 6) / 300], description: 'Brass band round the middle', severity: 'high', confidence: 0.9, hint: { shape: 'band', material: 'brass', metal: true } },
      { id: 'lugs', axis: 'prop', kind: 'missing', view: 'photo', region: [0.48, 0.25, 0.52, 0.32], description: 'Tuning lug', severity: 'medium', confidence: 0.8, hint: { shape: 'knob', count: 4 } },
    ],
  }, { views: ['photo'] }).report;
  const ctx = { cameras: { photo: cam }, hit: (o: Vec3, d: Vec3) => traceField(body, o, d), bounds: { min: [-0.35, -0.7, -0.35] as Vec3, max: [0.35, 0.7, 0.35] as Vec3 } };
  const { anchors } = anchorGaps(report, ctx);
  assert.equal(anchors.length, 2);
  assert.ok(anchors[0].onSurface);
  let d = { ...doc0(), parts: [BODY] };
  const ops = planFromGaps(d, anchors, ctx, 1);
  const { ok, failed } = applicable(d, ops);
  assert.deepEqual(failed, []);
  for (const o of ok) d = applyModelOp(d, o).doc;
  const ring = d.parts.find(p => p.shape === 'torus')!;
  assert.ok(ring, 'a ring was added');
  near(ring.center[1], 0.2, 0.03); assert.ok(ring.size[0] > 0.7 && ring.size[0] < 0.85, `ring diameter ${ring.size[0]}`);
  assert.equal(ring.material, 'brass'); assert.equal(d.materials[0].metalness, 1);
  assert.equal(d.parts.filter(p => /Tuning lug/.test(p.name)).length, 4);
  assert.ok(d.paints.some(l => l.projectPhoto === 'photo'), 'photo colours go on first');
  assert.ok(ok.every(o => o.op !== 'addPart' || o.part.why), 'every part says which gap it answers');
  const prompt = agentPrompt(d, anchors, ctx, 2);
  assert.match(prompt.user, /"id":"band"/);
});

test('parseAgentOps keeps the valid ops and says why the rest were dropped', () => {
  const r = parseAgentOps('```json\n{"ops":[{"op":"addPart","part":' + JSON.stringify(part('ok')) + '},{"op":"addPart","part":{"id":"bad"}},{"op":"warp"}]}\n```');
  assert.equal(r.ops.length, 1); assert.equal(r.dropped.length, 2);
  assert.deepEqual(parseAgentOps('sorry').dropped, ['no ops in the answer']);
});

// ── replay, align and one synthetic loop ───────────────────────────────────────────────────────────────────

test('replay + align + loop: a scripted eye finds the missing band and the loop adds it', { timeout: 120_000 }, async () => {
  // "Photo": the body WITH its band, rendered from a known camera. "Scan": the body without the band.
  const truth = replay({ ...doc0(), parts: [BODY, { ...RING, material: 'gold' }], materials: [{ id: 'gold', name: 'Gold', colour: '#c8a040', metalness: 1, roughness: 0.3 }] }, { scan: null, resolution: 72 });
  const trueCam = { ...framingCamera({ yawDeg: 0, pitchDeg: 15, width: 160, height: 240, radius: 0.9 }) };
  const photo = renderMesh(truth.mesh, trueCam).picture;
  const scanMesh = replay({ ...doc0(), parts: [BODY] }, { scan: null, resolution: 72 }).mesh;
  scanMesh.colours = new Float32Array(scanMesh.positions.length).fill(0.71);
  const scan = await scanField(scanMesh, 12);

  const al = alignToPhoto(scanMesh, photo, { workHeight: 96, pitches: [0, 15, 30] });
  assert.ok(al.iou > 0.85, `aligned IoU ${al.iou}`);

  const h = new ModelHistory({ ...doc0(), base: { kind: 'scan', glb: 'scan.glb', backend: 'test', centre: [0, 0, 0], scale: 1 } });
  h.apply({ op: 'setCamera', view: 'photo', camera: al.camera }, 'aria');
  const box = maskBox(photo)!;
  // The scripted eye: reports the band (once) while the render has no ring there.
  const [, by] = project(trueCam, [0, 0.2, 0.36]);
  let looks = 0;
  const rounds = await runFidelityLoop(h, {
    scan, scanUntextured: true, photo, pictures: { photo }, resolution: 72, viewSize: 96,
    policy: { target: 0.95, aim: 0.99, minGain: 0.005, patience: 1, maxRounds: 3 },
  }, {
    look: async () => {
      looks++;
      const hasRing = h.doc.parts.some(p => p.shape === 'torus');
      return { source: 'scripted', raw: { subject: 'drum', items: hasRing ? [] : [{ id: 'band', axis: 'prop', kind: 'missing', view: 'photo', region: [box.x0 / 160, (by - 5) / 240, box.x1 / 160, (by + 5) / 240], description: 'Gold band round the middle', severity: 'high', confidence: 1, hint: { shape: 'band', colour: '#c8a040', material: 'gold', metal: true } }] } };
    },
  });
  assert.ok(looks >= 2);
  assert.equal(rounds[0].planner, 'rules');
  assert.ok(rounds[0].applied.some(s => /ring/.test(s)), rounds[0].applied.join(' | '));
  const last = rounds[rounds.length - 1];
  assert.ok(last.score.overall > rounds[0].score.overall, `${rounds.map(r => r.score.overall.toFixed(3)).join(' → ')}`);
  // Every round that was kept scores at least as well as the one before it.
  const kept = rounds.filter(r => !r.rejected).map(r => r.score.overall);
  for (let i = 1; i < kept.length; i++) assert.ok(kept[i] >= kept[i - 1], kept.join(" → "));
  // Photo colours went on as the setup step, before round 1 was measured.
  assert.ok(h.doc.paints.some(l => l.projectPhoto === 'photo' && l.fillUnseen === 'mirror'));
  assert.ok(rounds[0].score.pixel!.colour > 0.85, `colour ${rounds[0].score.pixel!.colour}`);
  assert.equal(h.doc.subject, 'drum');
  // Each round is one undo step: undoing Aria's round batches, newest first, takes the ring away again.
  let undone = 0;
  while (h.doc.parts.some(p => p.shape === 'torus') && h.entries[h.entries.length - 1]?.label.startsWith('Aria, round')) { h.undo(); undone++; }
  assert.ok(undone >= 1 && undone < rounds.length + 1, `undid ${undone}`);
  assert.ok(!h.doc.parts.some(p => p.shape === 'torus'));
  assert.ok(h.doc.references[0].camera, 'the camera alignment is untouched');
});

test('size guard: a part that would bury the scan is refused; a small one passes', () => {
  const d: ModelDoc = { ...doc0(), base: { kind: 'scan', glb: 's.glb', backend: 't', centre: [0, 0, 0], scale: 1 } };
  const bounds = { min: [-0.35, -0.7, -0.35] as Vec3, max: [0.35, 0.7, 0.35] as Vec3 };
  const big: ModelOp = { op: 'addPart', part: part('shell', { shape: 'cylinder', size: [0.72, 1.4, 0.72] }) };
  const small: ModelOp = { op: 'addPart', part: part('lug', { size: [0.05, 0.12, 0.05] }) };
  const r = applicable(d, [big, small], { bounds });
  assert.equal(r.ok.length, 1); assert.match(r.failed[0], /bury the scan/);
  // With the scan turned off (a hero rebuild), the body has to come from parts, so the guard steps aside.
  assert.equal(applicable({ ...d, useScan: false }, [big], { bounds }).ok.length, 1);
});

// ── rounds must not get worse ──────────────────────────────────────────────────────────────────────────────

/** A drum body as the "photo", the same body as the scan, and a history with the photo camera set. */
async function plainDrum() {
  const photoMesh = replay({ ...doc0(), parts: [BODY] }, { scan: null, resolution: 64 }).mesh;
  const cam = framingCamera({ yawDeg: 0, pitchDeg: 15, width: 120, height: 180, radius: 0.9 });
  const photo = renderMesh(photoMesh, cam).picture;
  const scan = await scanField(photoMesh, 10);
  const h = new ModelHistory({ ...doc0(), base: { kind: 'scan', glb: 's.glb', backend: 't', centre: [0, 0, 0], scale: 1 } });
  h.apply({ op: 'setCamera', view: 'photo', camera: cam }, 'aria');
  const env = { scan, scanUntextured: true, photo, pictures: { photo }, resolution: 64, viewSize: 64, policy: { target: 0.95, aim: 0.999, minGain: 0.005, patience: 2, maxRounds: 3 } };
  return { h, env };
}
const dent = { id: 'dent', axis: 'geometry', kind: 'wrong', view: 'photo', region: [0.3, 0.3, 0.7, 0.7], description: 'Middle looks off', severity: 'low', confidence: 0.5 };

test('a harmful edit is tried on its own, found worse at every strength, and never reaches the model', { timeout: 120_000 }, async () => {
  const { h, env } = await plainDrum();
  const rounds = await runFidelityLoop(h, env, {
    look: async () => ({ source: 'scripted', raw: { items: [dent] } }),
    // A bad agent: a big cut through the bottom edge, which the photo sees at every strength.
    agent: async () => JSON.stringify({ ops: [
      { op: 'addPart', part: { id: 'hole', name: 'Hole', op: 'carve', shape: 'ellipsoid', center: [0.3, -0.7, 0.2], size: [0.5, 0.5, 0.5], rot: [0, 0, 0], why: 'dent' } },
    ] }),
  });
  assert.ok(!h.doc.parts.some(p => p.id === 'hole'), rounds.map(r => r.trials.concat(r.dropped).join(' / ') + ' @' + r.score.overall).join(' ## '));
  assert.match(rounds[0].trials.join('\n'), /dropped Carved Hole.*no strength improved/);
  const s = rounds.map(r => r.score.overall);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1] - 1e-9, `round ${i + 1} went down: ${s.join(' → ')}`);
});

test('a too-strong edit is kept at the strength that helps (line search)', { timeout: 120_000 }, async () => {
  // Photo: the body with a band. Scan: the body alone. The agent's band is three times too thick.
  const truth = replay({ ...doc0(), parts: [BODY, RING] }, { scan: null, resolution: 64 }).mesh;
  const { h, env } = await plainDrum();
  const cam = h.doc.references[0].camera!;
  const photo = renderMesh(truth, cam).picture;
  const rounds = await runFidelityLoop(h, { ...env, photo, pictures: { photo } }, {
    look: async () => ({ source: 'scripted', raw: { items: h.doc.parts.length ? [] : [{ ...dent, id: 'band', axis: 'prop', kind: 'missing', description: 'Band round the middle' }] } }),
    agent: async () => JSON.stringify({ ops: [{ op: 'addPart', part: { ...RING, id: 'band', size: [0.9, 0.16, 0], why: 'band' } }] }),
  });
  const band = h.doc.parts.find(p => p.id === 'band');
  assert.ok(band, rounds[0].trials.join('\n'));
  assert.ok(band!.size[1] < 0.16, `kept at a lower strength: tube ${band!.size[1]} (${rounds[0].trials.join(' | ')})`);
  assert.ok(rounds[rounds.length - 1].score.pixel!.iou >= rounds[0].score.pixel!.iou);
});

test('the round-level guard still undoes what the photo cannot see, when the eye says it got worse', { timeout: 120_000 }, async () => {
  const { h, env } = await plainDrum();
  const prompts: string[] = [];
  const rounds = await runFidelityLoop(h, env, {
    // After the back lump goes on, the eye reports a new critical problem on the back.
    look: async () => ({ source: 'scripted', raw: { items: h.doc.parts.some(p => p.id === 'lump-1')
      ? [dent, { id: 'blob', axis: 'geometry', kind: 'extra', view: 'render-back', region: [0.3, 0.3, 0.7, 0.7], description: 'A blob on the back', severity: 'critical', confidence: 1 }]
      : [dent] } }),
    // Invisible from the photo: a lump on the back.
    agent: async (p) => { prompts.push(p.user); return JSON.stringify({ ops: [{ op: 'addPart', part: { id: `lump-${prompts.length}`, name: 'Lump', op: 'add', shape: 'ellipsoid', center: [0, 0, -0.36], size: [0.15, 0.15, 0.1], rot: [0, 0, 0], why: 'dent' } }] }); },
  });
  assert.ok(rounds[1].rejected, 'round 2 found round 1 worse and undid it');
  assert.match(prompts[1], /was undone because it lowered the score/);
  assert.ok(!h.doc.parts.some(p => p.id === 'lump-1'));
});

test('steadyGaps: the eye cannot re-rate an untouched gap as worse; touched ones take the new rating', () => {
  const g = (id: string, severity: 'low' | 'medium' | 'high' | 'critical', confidence = 0.9) => ({ id, axis: 'colour' as const, kind: 'wrong' as const, view: 'photo', region: { x0: 0, y0: 0, x1: 1, y1: 1 }, description: id, severity, confidence });
  const out = steadyGaps([g('a', 'critical'), g('b', 'critical'), g('c', 'high'), g('d', 'low')], [g('a', 'medium', 0.7), g('b', 'medium'), g('d', 'high')], new Set(['b']));
  assert.deepEqual(out.map(i => [i.id, i.severity]), [['a', 'medium'], ['b', 'critical'], ['c', 'high'], ['d', 'low']]);
  near(out[0].confidence, 0.7);
});

test('scaled and ground: weaker versions of an edit, and rings moved onto the body axis', () => {
  const d = { ...doc0(), parts: [part('p', { center: [0, 0, 0], size: [0.2, 0.2, 0.2] })] };
  const half = scaled(d, { op: 'addPart', part: part('q', { shape: 'torus', size: [0.8, 0.1, 0] }) }, 0.5) as Extract<ModelOp, { op: 'addPart' }>;
  assert.deepEqual(half.part.size, [0.7, 0.05, 0]); // inner edge (0.3) stays on the body
  const moved = scaled(d, { op: 'updatePart', partId: 'p', patch: { center: [0.2, 0, 0] } }, 0.5) as Extract<ModelOp, { op: 'updatePart' }>;
  assert.deepEqual(moved.patch.center, [0.1, 0, 0]);
  assert.equal(scaled(d, { op: 'paint', layer: { id: 'x', name: 'x', region: { kind: 'all' }, projectPhoto: 'photo', opacity: 1 } }, 0.5), null);
  const bounds = { min: [-0.35, -0.7, -0.35] as Vec3, max: [0.35, 0.7, 0.35] as Vec3 };
  const off = ground({ op: 'addPart', part: part('r', { shape: 'torus', center: [-0.22, 0.64, -0.27], size: [0.72, 0.05, 0] }) }, bounds) as Extract<ModelOp, { op: 'addPart' }>;
  assert.deepEqual(off.part.center, [0, 0.64, 0]);
  const lug = { op: 'addPart' as const, part: part('l', { center: [0.3, 0.2, 0] }) };
  assert.equal(ground(lug, bounds), lug);
});

test('an edit with no visible effect from any angle (buried in the body) is dropped as clutter', { timeout: 120_000 }, async () => {
  const { h, env } = await plainDrum();
  const rounds = await runFidelityLoop(h, env, {
    look: async () => ({ source: 'scripted', raw: { items: [dent] } }),
    agent: async () => JSON.stringify({ ops: [{ op: 'addPart', part: { id: 'core', name: 'Core', op: 'add', shape: 'ellipsoid', center: [0, 0, 0], size: [0.2, 0.2, 0.2], rot: [0, 0, 0], why: 'dent' } }] }),
  });
  assert.ok(!h.doc.parts.some(p => p.id === 'core'));
  assert.match(rounds[0].trials.join('\n'), /dropped Added Core.*no effect/);
});

test('outline blobs: where the model sticks out and where it falls short', () => {
  const photo = disc(80, 80, 40, 40, 20, [200, 50, 50]);
  const render = disc(80, 80, 44, 40, 20, [200, 50, 50]);
  const blobs = outlineBlobs(photo, render);
  assert.equal(blobs.length, 2);
  const extra = blobs.find(b => b.kind === 'extra')!, missing = blobs.find(b => b.kind === 'missing')!;
  assert.ok(extra.cx > 50 && missing.cx < 30, `${extra.cx} ${missing.cx}`);
  assert.deepEqual(outlineBlobs(photo, photo), []);
});

test('outline fixes pull a model toward a photo with a band the scan lacks, and each fix is tried', { timeout: 120_000 }, async () => {
  const truth = replay({ ...doc0(), parts: [BODY, RING] }, { scan: null, resolution: 64 }).mesh;
  const { h, env } = await plainDrum();
  const photo = renderMesh(truth, h.doc.references[0].camera!).picture;
  // No eye items at all: only the measured outline drives the edits.
  const rounds = await runFidelityLoop(h, { ...env, photo, pictures: { photo } }, { look: async () => ({ source: 'scripted', raw: { items: [] } }) });
  const fixes = h.doc.parts.filter(p => p.why === 'outline');
  assert.ok(fixes.length > 0, rounds.map(r => r.trials.join(' | ')).join(' ## '));
  assert.ok(rounds[rounds.length - 1].score.pixel!.iou > rounds[0].score.pixel!.iou, rounds.map(r => r.score.pixel!.iou.toFixed(4)).join(' → '));
  const kept = rounds.filter(r => !r.rejected).map(r => r.score.overall);
  for (let i = 1; i < kept.length; i++) assert.ok(kept[i] >= kept[i - 1], kept.join(' → '));
});

test('an eye claim the photo keeps contradicting loses weight round by round', { timeout: 180_000 }, async () => {
  const { h, env } = await plainDrum();
  // The eye insists the photo-side middle needs a big lump; the photo shows a plain body, so every try is worse.
  const claim = { id: 'lump-claim', axis: 'geometry', kind: 'missing', view: 'photo', region: [0.55, 0.4, 0.75, 0.6], description: 'A big lump is missing on the right', severity: 'high', confidence: 1 };
  const rounds = await runFidelityLoop(h, { ...env, outlineFixes: false, policy: { ...env.policy, maxRounds: 4, patience: 3 } }, {
    look: async () => ({ source: 'scripted', raw: { items: [claim] } }),
    agent: async (p) => JSON.stringify({ ops: [{ op: 'addPart', part: { id: `lump-${p.user.match(/Round (\d+)/)?.[1]}`, name: 'Lump', op: 'add', shape: 'ellipsoid', center: [0.4, 0, 0.1], size: [0.3, 0.3, 0.3], rot: [0, 0, 0], why: 'lump-claim' } }] }),
  });
  const conf = rounds.map(r => r.report.items.find(i => i.id === 'lump-claim')?.confidence ?? 0);
  assert.ok(conf[conf.length - 1] < conf[0], conf.join(' → '));
  // The strict score keeps the claim at full weight, so it reads lower than the loop's own.
  const last = rounds[rounds.length - 1];
  assert.ok(last.strictScore.overall < last.score.overall, `${last.strictScore.overall} vs ${last.score.overall}`);
  assert.ok(!h.doc.parts.some(p => p.id.startsWith('lump-')));
  const s = rounds.map(r => r.score.overall);
  assert.ok(s[s.length - 1] > s[0], s.join(' → '));
});
