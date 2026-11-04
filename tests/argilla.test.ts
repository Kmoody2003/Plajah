import { test } from 'node:test';
import { decodeRuns, lightByLabel, PartMap, placeMap, tidyParts, writeSheet } from '../services/argilla/understand/parts';
import { KIND_SHEETS, parseSheetAnswer, SHEET_BY_KIND, sheetFromWords } from '../services/argilla/understand/buildSheets';
import { MATERIAL_BY_ID } from '../services/argilla/understand/materials';
import { labelSpots, parseLookAnswer } from '../services/argilla/understand/lookAtParts';
import { cameraAt, cameraMove, retime, sceneBounds, setKey } from '../services/argilla/shot/shot';
import { agreementWithPicture, facingWeight, fillUnseen, spreadLabels, visibilityFrom } from '../services/argilla/scene/finishObject';
import assert from 'node:assert/strict';
import { BrickPool, BRICK_STRIDE, BRICK_VOXELS, CELL_INSIDE, isSlot } from '../services/argilla/brickPool';
import { surfaceNets } from '../services/argilla/surfaceNets';
import { voxelizeMesh } from '../services/argilla/voxelize';
import { encodeField, decodeField } from '../services/argilla/document';
import { compileRecipe, primsNear, recipeDistance } from '../services/argilla/bake';
import { CLAY_STARTERS, parseRecipe, starterForPrompt } from '../services/argilla/recipe';
import { stampFor, strokePoints } from '../services/argilla/brushes';
import { meshFromField } from '../services/argilla/engine';
import { inflate, largestShape, pictureToClay } from '../services/argilla/pictureClay';
import { applyLineage, CODEX, CODEX_BY_ID, recognizeFromWords } from '../services/argilla/creature/codex';
import { buildAnatomy, JOINTS, parentOf } from '../services/argilla/creature/anatomy';
import { CreatureMotion } from '../services/argilla/creature/motion';
import { finishCreature, fitPlanToClay } from '../services/argilla/creature/finish';
import { composeViews, detectViews, sheetToClay, suggestBoxes } from '../services/argilla/creature/sheetClay';
import { bevelEdges, boundaryEdges, deleteFaces, edgeFaces, edgeKey, eulerCharacteristic, extrudeFaces, insetFaces, loopCut, makeBox, makeCylinder, makePlane, makeSphere, mergeVerts, mirrorX, PolyMesh, subdivide, toTriangles } from '../services/argilla/poly/polyMesh';
import { readFraming } from '../services/argilla/creature/pipeline';
import { build, type ImageReading } from '../services/argilla/understand/reconstruct';
import { priorFromWords, rankReadings, VOCABULARY_BY_LABEL } from '../services/argilla/understand/vocabulary';
import { blockoutMesh, checkScene, layoutScene, parsePrompt, parseSceneAnswer, settleScene } from '../services/argilla/scene/sceneModel';
import { findSubjects, placeSubject, solveScale } from '../services/argilla/scene/sceneFromImage';
import { wholeSubject } from '../services/argilla/understand/wholeSubject';
import { alignToPicture, clusterMesh, mainPieceShare, placeOnStage } from '../services/argilla/understand/alignShape';

// A plane on a field: the cut-out has only the body, depth has body and wing, the hangar is farther and the ground runs to the camera.
const planeOnField = (S: number) => {
  const mask = new Float32Array(S * S), depth = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S, i = x + y * S;
    depth[i] = v > 0.7 ? 0.3 + (v - 0.7) * 2 : 0.15;
    if (Math.abs(v - 0.45) < 0.03 && u > 0.1 && u < 0.9) depth[i] = 0.5;
    if (Math.abs(u - 0.5) < 0.12 && v > 0.42 && v < 0.72) { depth[i] = 0.5; mask[i] = 1; }
  }
  return { mask, depth };
};

// A long box with a tall fin at one end, so every turn has its own outline and no two match.
const finnedBar = () => {
  const boxes = [[-1, 1, -0.1, 0.1, -0.1, 0.1], [0.6, 0.9, 0.1, 0.8, -0.05, 0.05]];
  const positions: number[] = [], indices: number[] = [];
  for (const [x0, x1, y0, y1, z0, z1] of boxes) {
    const base = positions.length / 3;
    for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) positions.push(x, y, z);
    indices.push(...[0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5].map((n) => n + base));
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
};

test('the whole subject finds a wing the cut-out missed, without taking the ground or the hangar', () => {
  const S = 128, { mask, depth } = planeOnField(S);
  const whole = wholeSubject(mask, S, depth, S);
  const at = (u: number, v: number) => whole.mask[Math.floor(u * S) + Math.floor(v * S) * S];
  assert.ok(whole.grew);
  assert.equal(at(0.15, 0.45), 1, 'wing tip');
  assert.equal(at(0.85, 0.45), 1, 'other wing tip');
  assert.equal(at(0.5, 0.2), 0, 'hangar behind');
  assert.equal(at(0.2, 0.9), 0, 'ground');
});

test('the whole subject drops stray haze and keeps the cut-out when growth has nothing to find', () => {
  const S = 128, mask = discMask(S, 0.2), depth = new Float32Array(S * S);
  mask[3 + 3 * S] = 0.2;
  for (let i = 0; i < depth.length; i++) depth[i] = mask[i] >= 0.5 ? 0.8 : 0.1;
  const whole = wholeSubject(mask, S, depth, S);
  assert.equal(whole.grew, false);
  assert.equal(whole.mask[3 + 3 * S], 0);
  assert.equal(whole.mask[S / 2 + (S / 2) * S], 1);
});

test('the whole subject gives up when growth runs across everything', () => {
  const S = 128, mask = discMask(S, 0.1), depth = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) depth[x + y * S] = 0.5 + 0.3 * Math.sin(x / 40) * Math.cos(y / 40);
  const whole = wholeSubject(mask, S, depth, S);
  assert.equal(whole.grew, false);
  assert.ok(whole.share < 0.1);
});

test('a mesh is turned back to the angle its picture was taken from', async () => {
  const { positions, indices } = finnedBar();
  const yaw = (40 * Math.PI) / 180, S = 128;
  const mask = new Float32Array(S * S);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Draws the true answer as the picture by testing points inside the two boxes.
  for (let n = 0; n < 400000; n++) {
    const inFin = n % 3 === 0;
    const x = inFin ? 0.6 + 0.3 * Math.random() : -1 + 2 * Math.random();
    const y = inFin ? 0.1 + 0.7 * Math.random() : -0.1 + 0.2 * Math.random();
    const z = inFin ? -0.05 + 0.1 * Math.random() : -0.1 + 0.2 * Math.random();
    // Seen through a camera, the same way the picture would be.
    const near = 2.2 / (2.2 - (-x * s + z * c));
    const px = (x * c + z * s) * near;
    mask[Math.floor((px * 0.3 + 0.5) * S) + Math.floor((0.5 - y * near * 0.3) * S) * S] = 1;
  }
  const found = await alignToPicture(positions, indices, { mask, maskSize: S, aspect: 1 });
  assert.ok(found.iou > 0.6, `iou ${found.iou}`);
  // The outline alone can't tell a turn from its mirror, which depth settles on real pictures.
  const degrees = Math.abs((found.yaw * 180) / Math.PI);
  assert.ok(Math.abs(degrees - 40) < 14 || Math.abs(degrees - 140) < 14, `yaw ${degrees}`);
});

test('the main piece share sees a part that has come away', () => {
  const { positions, indices } = finnedBar();
  const apart = mainPieceShare(positions, indices);
  assert.ok(apart > 0.5 && apart < 0.9, `share ${apart}`);
  assert.equal(mainPieceShare(positions, indices.slice(0, 36)), 1);
});

test('a mesh placed on the stage lands on the outline and voxelizes where it was put', async () => {
  const { positions, indices } = finnedBar();
  const placed = placeOnStage(positions, 0, { x0: 0.1, x1: 0.7, y0: -0.3, y1: 0.1 });
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < placed.length; i += 3) { x0 = Math.min(x0, placed[i]); x1 = Math.max(x1, placed[i]); }
  assert.ok(Math.abs((x0 + x1) / 2 - 0.4) < 1e-5, 'centred on the outline');
  const field = await voxelizeMesh(placed, indices, { grid: 32, inPlace: true });
  const mesh = meshFromField(field, 2);
  let mx0 = Infinity, mx1 = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) { mx0 = Math.min(mx0, mesh.positions[i]); mx1 = Math.max(mx1, mesh.positions[i]); }
  assert.ok(Math.abs((mx0 + mx1) / 2 - 0.4) < 0.05, `clay centred at ${(mx0 + mx1) / 2}`);
});

const discMask = (size: number, radius: number, cx = 0.5, cy = 0.5) => {
  const mask = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    mask[x + y * size] = Math.hypot((x + 0.5) / size - cx, (y + 0.5) / size - cy) < radius ? 1 : 0;
  }
  return mask;
};

test('largest shape ignores stray specks', () => {
  const mask = discMask(64, 0.3);
  mask[0] = 1;
  const shape = largestShape(mask, 64)!;
  assert.ok(shape.u0 > 0.1, 'speck in the corner did not extend the bounds');
  assert.equal(largestShape(new Float32Array(64 * 64), 64), null);
});

test('inflate gives a narrow strip a round section sized to its own width', () => {
  const size = 128, pixel = 2 / size;
  const inside = new Uint8Array(size * size);
  // 20 pixels wide, so a half-width of 10 pixels in world units.
  for (let y = 4; y < size - 4; y++) for (let x = 54; x < 74; x++) inside[x + y * size] = 1;
  const u = inflate(inside, size, pixel);
  const height = Math.sqrt(u[64 + 64 * size]);
  const halfWidth = 10 * pixel;
  assert.ok(Math.abs(height - halfWidth) < halfWidth * 0.2, `height ${height} vs half width ${halfWidth}`);
  assert.equal(u[10 + 64 * size], 0, 'nothing outside the shape');
});

test('a picture bakes into closed clay, with depth pushing only the front', async () => {
  const size = 128, depthSize = 64, grid = 32;
  const band = (2 / (grid * BRICK_VOXELS)) * 3;
  const mask = discMask(size, 0.35);
  const flat = await pictureToClay({ mask, maskSize: size, aspect: 1 }, { grid, band });
  assert.ok(flat.cells.length > 50, 'surface bricks exist');
  assert.ok(flat.states.some((s) => s === 1), 'interior is solid');
  assert.equal(flat.values.length, flat.cells.length * BRICK_STRIDE ** 3);
  const zRange = (field: typeof flat) => {
    const mesh = meshFromField(field, 1);
    let lo = Infinity, hi = -Infinity;
    for (let i = 2; i < mesh.positions.length; i += 3) { lo = Math.min(lo, mesh.positions[i]); hi = Math.max(hi, mesh.positions[i]); }
    return { lo, hi };
  };
  // A ramp that is nearest in the middle.
  const depth = new Float32Array(depthSize * depthSize);
  for (let y = 0; y < depthSize; y++) for (let x = 0; x < depthSize; x++) {
    depth[x + y * depthSize] = 1 - Math.hypot((x + 0.5) / depthSize - 0.5, (y + 0.5) / depthSize - 0.5);
  }
  const deep = await pictureToClay({ mask, maskSize: size, aspect: 1, depth, depthSize }, { grid, band, relief: 1 });
  const a = zRange(flat), b = zRange(deep);
  assert.ok(b.hi - b.lo > a.hi - a.lo, `depth adds relief: ${b.hi - b.lo} vs ${a.hi - a.lo}`);
});

test('a picture with no subject refuses instead of baking nothing', async () => {
  await assert.rejects(pictureToClay({ mask: new Float32Array(64 * 64), maskSize: 64, aspect: 1 }, { grid: 16, band: 0.05 }), /No clear subject/);
});

test('undo and redo restore page entries, and history slots stay reserved', () => {
  const pool = new BrickPool(8, 4);
  pool.beginStroke();
  const first = pool.touch(5)!;
  assert.equal(first.fresh, true);
  pool.endStroke();
  const after = pool.page[5];
  pool.beginStroke();
  const second = pool.touch(5)!;
  assert.notEqual(second.slot, first.slot, 'second stroke writes a new slot');
  assert.equal(second.fresh, true);
  assert.equal(pool.touch(5)!.fresh, false, 'same stroke reuses its slot');
  pool.endStroke();
  assert.equal(pool.usedSlots, 2);
  pool.undo();
  assert.equal(pool.page[5], after);
  pool.undo();
  assert.equal(pool.page[5], 0);
  pool.redo();
  assert.equal(pool.page[5], after);
});

test('a new stroke after undo frees the abandoned branch', () => {
  const pool = new BrickPool(8, 4);
  pool.beginStroke(); pool.touch(1); pool.endStroke();
  pool.undo();
  assert.equal(pool.usedSlots, 1);
  pool.beginStroke();
  assert.equal(pool.canRedo, false);
  assert.equal(pool.usedSlots, 0);
  pool.endStroke();
});

test('running out of slots evicts old history before refusing', () => {
  const pool = new BrickPool(8, 2); // 8 slots
  for (let i = 0; i < 8; i++) { pool.beginStroke(); pool.touch(0); pool.endStroke(); }
  pool.beginStroke();
  assert.ok(pool.touch(0), 'old undo was given up');
  pool.endStroke();
  const fresh = new BrickPool(8, 1);
  fresh.beginStroke();
  assert.ok(fresh.touch(0));
  assert.equal(fresh.touch(1), null, 'nothing left to evict');
});

test('settle and compact release slots and survive undo', () => {
  const pool = new BrickPool(8, 2);
  pool.beginStroke(); pool.touch(3); pool.settle(3, CELL_INSIDE); pool.endStroke();
  assert.equal(pool.page[3], CELL_INSIDE);
  assert.equal(pool.usedSlots, 0);
  pool.undo();
  assert.equal(pool.page[3], 0);

  const p2 = new BrickPool(8, 2);
  p2.beginStroke(); p2.touch(4); p2.endStroke();
  assert.deepEqual(p2.lastStrokeSlots().map((s) => s.cell), [4]);
  p2.compact(4, 0);
  assert.equal(p2.usedSlots, 0);
  assert.equal(p2.page[4], 0);
});

test('coarse occupancy reports only transitions', () => {
  const pool = new BrickPool(16, 2);
  pool.drainDirtyCoarse();
  pool.beginStroke(); pool.touch(0); pool.touch(1); pool.endStroke();
  assert.deepEqual(pool.drainDirtyCoarse(), [{ index: 0, occupied: 1 }]);
  pool.undo();
  assert.deepEqual(pool.drainDirtyCoarse(), [{ index: 0, occupied: 0 }]);
});

const sphereMesh = (resolution: number, radius: number, blockSize = 8) => {
  const c = resolution / 2;
  const blocks: [number, number, number][] = [];
  for (let z = 0; z < resolution; z += blockSize) for (let y = 0; y < resolution; y += blockSize) for (let x = 0; x < resolution; x += blockSize) blocks.push([x, y, z]);
  return surfaceNets({
    resolution, blockSize, blocks,
    sample: (x, y, z) => Math.hypot(x - c, y - c, z - c) - radius,
    toWorld: (v) => (v / resolution) * 2 - 1,
  });
};

const signedVolume = (p: Float32Array, idx: Uint32Array) => {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
       - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
       + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
};

test('surface nets makes a closed, outward-facing sphere of the right volume', () => {
  const { positions, normals, indices } = sphereMesh(64, 20);
  assert.ok(indices.length > 1000);
  assert.equal(indices.length % 3, 0);
  // Closed: every undirected edge is used exactly twice, once in each direction.
  const edges = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) for (let k = 0; k < 3; k++) {
    const key = `${indices[i + k]}>${indices[i + (k + 1) % 3]}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  for (const [key, n] of edges) {
    const [a, b] = key.split('>');
    assert.equal(n, 1, `edge ${key} repeated`);
    assert.equal(edges.get(`${b}>${a}`), 1, `edge ${key} has no twin`);
  }
  const r = (20 / 64) * 2;
  const expected = (4 / 3) * Math.PI * r ** 3;
  const volume = signedVolume(positions, indices);
  assert.ok(Math.abs(volume - expected) / expected < 0.02, `volume ${volume} vs ${expected}`);
  const x = positions[0], y = positions[1], z = positions[2];
  assert.ok(x * normals[0] + y * normals[1] + z * normals[2] > 0, 'normals point out');
});

const icosphere = (radius: number, cx = 0) => {
  const seg = 48;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    const t = (j / seg) * Math.PI, f = (i / seg) * 2 * Math.PI;
    pos.push(cx + radius * Math.sin(t) * Math.cos(f), radius * Math.cos(t), radius * Math.sin(t) * Math.sin(f));
  }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
};

test('voxelize: inside is solid, the surface lands where the mesh was, and a mesh comes back out', async () => {
  const { positions, indices } = icosphere(0.5);
  const field = await voxelizeMesh(positions, indices, { grid: 32, fit: 0.5 });
  assert.equal(field.states[16 + 32 * (16 + 32 * 16)], 1, 'centre cell is solid');
  assert.equal(field.states[0], 0, 'corner is empty');
  const mesh = meshFromField(field, 1);
  const volume = signedVolume(mesh.positions, mesh.indices);
  const expected = (4 / 3) * Math.PI * 0.5 ** 3;
  assert.ok(Math.abs(volume - expected) / expected < 0.03, `volume ${volume} vs ${expected}`);
  // Band values stay in range.
  assert.ok(field.values.every((v) => Math.abs(v) <= field.band + 1e-6));
});

test('a saved field reads back the same', async () => {
  const { positions, indices } = icosphere(0.4);
  const field = await voxelizeMesh(positions, indices, { grid: 16, fit: 0.5 });
  const back = await decodeField(await encodeField(field));
  assert.equal(back.grid, 16);
  assert.deepEqual([...back.cells], [...field.cells]);
  assert.deepEqual([...back.states], [...field.states]);
  const tolerance = field.band / 30000;
  for (let i = 0; i < field.values.length; i += 97) assert.ok(Math.abs(back.values[i] - field.values[i]) < tolerance);
  assert.equal(back.values.length, field.cells.length * BRICK_STRIDE ** 3);
});

test('recipes from a model are bounded and malformed ones are refused', () => {
  assert.equal(parseRecipe('sorry, no', 'x'), null);
  assert.equal(parseRecipe('{"parts":"nope"}', 'x'), null);
  const r = parseRecipe('Here you go: {"parts":[{"a":[9,0,0],"ra":40,"op":"evil"},{"a":[1]},{"op":"carve","a":[0,0,0],"ra":0.1,"b":[0,0.2,0]}]} done', 'x')!;
  assert.equal(r.parts.length, 2);
  assert.deepEqual(r.parts[0].a, [0.95, 0, 0]);
  assert.equal(r.parts[0].ra, 0.7);
  assert.equal(r.parts[0].op, 'add');
  assert.equal(r.parts[1].op, 'carve');
  assert.equal(r.parts[1].rb, 0.1);
});

test('prompts find a starter, and unmatched words say so', () => {
  assert.equal(starterForPrompt('An old wizard head').recipe.name, 'Head');
  assert.equal(starterForPrompt('a sleeping dragon').recipe.name, 'Four-legged creature');
  assert.equal(starterForPrompt('quantum teapot').matched, false);
  for (const s of CLAY_STARTERS) {
    assert.ok(recipeDistance(compileRecipe(s.recipe.parts), 0, 0, 0) < 1);
    for (const p of s.recipe.parts) for (const c of p.a) assert.ok(Math.abs(c) < 1 - p.ra * 0.2, `${s.id} out of bounds`);
  }
});

test('brushes: clay pushes out, carve pushes in, Alt reverses, stamps stay gentle', () => {
  const hit = { point: [0, 0, 0.5] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };
  const base = { brush: 'clay' as const, radius: 0.1, strength: 0.5, invert: false, mirrorX: true, voxel: 2 / (96 * BRICK_VOXELS) };
  const clay = stampFor(hit, base);
  assert.equal(clay.op, 'grab');
  assert.ok(clay.dir![2] > 0);
  assert.ok(stampFor(hit, { ...base, invert: true }).dir![2] < 0);
  assert.ok(stampFor(hit, { ...base, brush: 'carve' }).dir![2] < 0);
  assert.ok(stampFor(hit, { ...base, brush: 'carve', invert: true }).dir![2] > 0);
  assert.ok(Math.abs(stampFor(hit, { ...base, brush: 'inflate', strength: 1 }).strength!) <= base.voxel * 2.5 + 1e-9);
  assert.equal(clay.mirrorX, true);
});

test('recipe distance: blend widens the join, carve removes, mirror doubles', () => {
  const ball = compileRecipe([{ op: 'add', a: [0, 0, 0], ra: 0.5 }]);
  assert.ok(Math.abs(recipeDistance(ball, 0.5, 0, 0)) < 1e-6);
  const cone = compileRecipe([{ op: 'add', a: [0, 0, 0], ra: 0.2, b: [0, 0.5, 0], rb: 0.1 }]);
  assert.ok(Math.abs(recipeDistance(cone, 0, 0.6, 0)) < 1e-6);
  const carved = compileRecipe([{ op: 'add', a: [0, 0, 0], ra: 0.5 }, { op: 'carve', a: [0, 0, 0], ra: 0.2 }]);
  assert.ok(recipeDistance(carved, 0, 0, 0) > 0);
  const mirrored = compileRecipe([{ op: 'add', a: [0.3, 0, 0], ra: 0.1, mirror: true }]);
  assert.equal(mirrored.length, 2);
  assert.ok(recipeDistance(mirrored, -0.3, 0, 0) < 0);
  const hard = compileRecipe([{ op: 'add', a: [-0.2, 0, 0], ra: 0.15 }, { op: 'add', a: [0.2, 0, 0], ra: 0.15 }]);
  const soft = compileRecipe([{ op: 'add', a: [-0.2, 0, 0], ra: 0.15 }, { op: 'add', a: [0.2, 0, 0], ra: 0.15, blend: 0.2 }]);
  assert.ok(recipeDistance(soft, 0, 0, 0) < recipeDistance(hard, 0, 0, 0));
});

test('stroke points are evenly spaced and never bridge a jump', () => {
  const at = (x: number) => ({ point: [x, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number] });
  assert.equal(strokePoints(null, at(0), 0.1).length, 1);
  assert.equal(strokePoints(at(0), at(0.001), 0.1).length, 0, 'too close');
  const pts = strokePoints(at(0), at(0.14), 0.1);
  assert.equal(pts.length, 5);
  assert.ok(Math.abs(pts[4].point[0] - 0.14) < 1e-9);
  assert.equal(strokePoints(at(0), at(2), 0.1).length, 1, 'a jump starts over');
});

test('isSlot separates the two reserved states from real slots', () => {
  assert.equal(isSlot(0), false);
  assert.equal(isSlot(1), false);
  assert.equal(isSlot(2), true);
});

// ---- Creature: from what it is to a living model ------------------------------------------------
test('words name the creature, and two creatures make a hybrid', () => {
  assert.equal(recognizeFromWords('a snarling werewolf')!.entry.id, 'werewolf');
  assert.equal(recognizeFromWords('The Wolfman')!.entry.id, 'werewolf');
  assert.equal(recognizeFromWords('old Count Dracula')!.entry.id, 'vampire');
  const hybrid = recognizeFromWords('a bear man')!;
  assert.equal(hybrid.entry.id, 'human+bear');
  assert.equal(hybrid.entry.tune.quadruped, 0, 'a half-man hybrid stands up');
  assert.equal(recognizeFromWords('a teapot'), null);
});

test('a lineage changes how the werewolf is built and moves', () => {
  const man = applyLineage(CODEX_BY_ID.werewolf, 'cursed-man');
  const beast = applyLineage(CODEX_BY_ID.werewolf, 'four-legs');
  assert.ok(man.tune.digitigrade < beast.tune.digitigrade);
  assert.ok(man.tune.muzzle < beast.tune.muzzle);
  assert.equal(man.motion.runsOnAllFours, false);
  assert.equal(beast.motion.runsOnAllFours, true);
});

test('every body plan fits the domain with a full skeleton in skeleton order', () => {
  for (const entry of CODEX) {
    const body = buildAnatomy(entry.tune);
    assert.deepEqual(body.bones.map((b) => b.name), [...JOINTS], entry.id);
    for (const part of body.parts) for (const v of [part.a, part.b ?? part.a]) {
      for (const c of v) assert.ok(Math.abs(c) < 1, `${entry.id} part inside the clay`);
    }
    const prims = compileRecipe(body.parts);
    const inBody = recipeDistance(prims, ...body.byName.chest.at);
    assert.ok(inBody < 0, `${entry.id} chest joint is inside the body`);
  }
});

test('the short list of nearby parts gives the same surface as all of them', () => {
  const prims = compileRecipe(buildAnatomy(CODEX_BY_ID.werewolf.tune).parts);
  const radius = 0.08;
  for (let i = 0; i < 400; i++) {
    const x = Math.sin(i * 1.3) * 0.8, y = Math.cos(i * 0.7) * 0.9, z = Math.sin(i * 2.1) * 0.5;
    const near = primsNear(prims, x, y, z, radius);
    const full = recipeDistance(prims, x, y, z);
    if (Math.abs(full) < radius) assert.ok(Math.abs(recipeDistance(near, x, y, z) - full) < 0.01, `same answer at ${x},${y},${z}`);
  }
});

test('feet reach the floor targets and bones keep their length through a walk', () => {
  const entry = CODEX_BY_ID.werewolf;
  const body = buildAnatomy(entry.tune);
  const motion = new CreatureMotion(body, entry.motion);
  for (const clip of ['idle', 'walk', 'run', 'signature'] as const) for (let t = 0; t < 3; t += 0.37) {
    const out = motion.evaluate({ clip, t });
    for (const name of JOINTS) {
      const parent = parentOf(name);
      if (!parent) continue;
      const length = out.world[name].distanceTo(out.world[parent]);
      assert.ok(Math.abs(length - motion.offsets[name].length()) < 1e-3, `${clip} ${name} stays ${motion.offsets[name].length()}, got ${length}`);
    }
    assert.ok(out.world.footL.y >= body.floor, 'no foot through the floor');
    for (const v of out.rotations) assert.ok(Number.isFinite(v));
  }
});

test('a bent elbow works the biceps harder than a straight arm', () => {
  const entry = CODEX_BY_ID.human;
  const body = buildAnatomy(entry.tune);
  const motion = new CreatureMotion(body, { ...entry.motion, signature: 'lunge' });
  const biceps = body.muscles.findIndex((m) => m.id === 'bicepsL');
  const rest = motion.evaluate({ clip: 'idle', t: 0 }).muscles[biceps];
  let most = rest;
  for (let t = 0; t < 4.5; t += 0.1) most = Math.max(most, motion.evaluate({ clip: 'signature', t }).muscles[biceps]);
  assert.ok(most >= rest, `biceps ${rest} -> ${most}`);
  assert.ok(body.muscles.length >= 25);
});

test('finishing clay gives a skin that sums to one, muscles on the limbs, and fur only where it grows', () => {
  const entry = CODEX_BY_ID.werewolf;
  const body = buildAnatomy(entry.tune);
  // A coarse field keeps the test quick; the steps are the same as at full size.
  const grid = 32, band = 0.08;
  const prims = compileRecipe(body.parts);
  const count = BRICK_STRIDE ** 3, voxel = 2 / (grid * BRICK_VOXELS);
  const states = new Uint8Array(grid ** 3), cells: number[] = [], values: number[] = [];
  for (let z = 0; z < grid; z++) for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const cell = 2 / grid;
    const d = recipeDistance(prims, (x + 0.5) * cell - 1, (y + 0.5) * cell - 1, (z + 0.5) * cell - 1);
    if (d < -cell * 1.2) { states[x + grid * (y + grid * z)] = 1; continue; }
    if (d > cell * 1.2) continue;
    cells.push(x + grid * (y + grid * z));
    for (let k = 0; k < BRICK_STRIDE; k++) for (let j = 0; j < BRICK_STRIDE; j++) for (let i = 0; i < BRICK_STRIDE; i++) {
      values.push(Math.max(-band, Math.min(band, recipeDistance(prims, x * cell - 1 + (i - 1) * voxel, y * cell - 1 + (j - 1) * voxel, z * cell - 1 + (k - 1) * voxel))));
    }
  }
  assert.equal(values.length, cells.length * count);
  const model = finishCreature({ grid, band, states, cells: new Uint32Array(cells), values: new Float32Array(values) }, body, entry.surface, { stride: 2, textureSize: 512 });
  const vertices = model.positions.length / 3;
  assert.ok(vertices > 500, `${vertices} vertices`);
  for (let v = 0; v < vertices; v++) {
    const sum = model.skinWeight[v * 4] + model.skinWeight[v * 4 + 1] + model.skinWeight[v * 4 + 2] + model.skinWeight[v * 4 + 3];
    assert.ok(Math.abs(sum - 1) < 1e-3, 'weights sum to one');
  }
  for (const uv of model.uvs) assert.ok(uv >= 0 && uv <= 1, 'uv in the atlas');
  assert.ok(model.muscles.some((m) => m.id === 'bicepsL' && m.verts.length > 0), 'the biceps touches skin');
  assert.ok(model.furReach > 0.01, 'a werewolf has a coat');
  const bare = finishCreature({ grid, band, states, cells: new Uint32Array(cells), values: new Float32Array(values) }, body, CODEX_BY_ID.vampire.surface, { stride: 2, textureSize: 256 });
  assert.equal(bare.furReach, 0, 'a vampire has none');
});

test('framing finds a crop and a whole figure from the outline', () => {
  const size = 128;
  const figure = new Float32Array(size * size);
  const paint = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) figure[x + y * size] = 1; };
  paint(54, 8, 74, 28); paint(60, 28, 68, 34); paint(40, 34, 88, 118);
  const whole = readFraming(figure, size)!;
  assert.equal(whole.cropped, false);
  assert.ok(whole.headShare > 0.1 && whole.headShare < 0.45, `head share ${whole.headShare}`);
  const crop = new Float32Array(size * size);
  for (let y = 40; y < size; y++) for (let x = 30; x < 98; x++) crop[x + y * size] = 1;
  assert.equal(readFraming(crop, size)!.cropped, true);
});

// ---- Polygon modeling ---------------------------------------------------------------------------
const closed = (m: PolyMesh, label: string) => {
  assert.equal(boundaryEdges(m).length, 0, `${label} has no open edges`);
  assert.equal(eulerCharacteristic(m), 2, `${label} stays one closed solid`);
  for (const [, faces] of edgeFaces(m)) assert.equal(faces.length, 2, `${label} is manifold`);
};
/** Signed volume is only right when every face winds outward, so it catches inside-out walls. */
const volume = (m: PolyMesh) => {
  const { positions: p, indices: t } = toTriangles(m);
  let v = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
};

test('primitives are closed solids that wind outward', () => {
  closed(makeBox(1), 'box'); closed(makeCylinder(), 'cylinder'); closed(makeSphere(), 'sphere');
  assert.ok(Math.abs(volume(makeBox(2)) - 8) < 1e-6);
  assert.ok(volume(makeCylinder()) > 0.7 && volume(makeSphere()) > 0.45);
});

test('extrude grows the right volume and stays closed, alone and as a region', () => {
  const one = extrudeFaces(makeBox(1), [0], 1).mesh;
  closed(one, 'extrude');
  assert.ok(Math.abs(volume(one) - 2) < 1e-6);
  const plane = makePlane(1, 2);
  const region = extrudeFaces(plane, [0, 1], 0.5);
  assert.equal(region.mesh.faces.length, 4 + 6, 'shared edge grows no wall');
});

test('inset keeps the solid and its volume', () => {
  const m = insetFaces(makeBox(1), [0], 0.5).mesh;
  closed(m, 'inset');
  assert.equal(m.faces.length, 10);
  assert.ok(Math.abs(volume(m) - 1) < 1e-6);
});

test('loop cut goes all the way round without zig-zag', () => {
  const box = makeBox(1);
  const m = loopCut(box, edgeKey(0, 1), 0.25);
  closed(m, 'loop cut');
  assert.equal(m.faces.length, 10);
  assert.ok(Math.abs(volume(m) - 1) < 1e-6, 'a cut does not change the shape');
  const fresh = m.verts.slice(8);
  assert.equal(fresh.length, 4);
  for (const v of fresh) assert.ok(Math.abs(v[0] - fresh[0][0]) < 1e-6, 'all new points lie in one plane');
});

test('bevel chamfers an edge and closes up, with the corner gone', () => {
  const m = bevelEdges(makeBox(1), [edgeKey(5, 6)], 0.1);
  closed(m, 'bevel');
  assert.ok(m.faces.length === 7, `${m.faces.length} faces`);
  const removed = 0.5 * 0.1 * 0.1 * 1;
  assert.ok(Math.abs(volume(m) - (1 - removed)) < 1e-6, `volume ${volume(m)}`);
  assert.ok(!m.verts.some((v) => v[0] === 0.5 && v[2] === 0.5), 'the sharp edge is gone');
});

test('Catmull-Clark rounds a box and keeps it closed, all quads', () => {
  let m = subdivide(makeBox(1));
  closed(m, 'subdivided');
  assert.equal(m.faces.length, 24);
  assert.ok(m.faces.every((f) => f.length === 4));
  m = subdivide(m);
  assert.ok(volume(m) < 1 && volume(m) > 0.3, `rounder and smaller, ${volume(m)}`);
});

test('mirror heals its seam, and merge collapses', () => {
  const box = makeBox(1);
  const whole = mirrorX({ verts: box.verts.map((v) => [v[0] + 0.5, v[1], v[2]] as PolyMesh['verts'][number]), faces: box.faces });
  closed(whole, 'mirror');
  assert.ok(Math.abs(volume(whole) - 2) < 1e-6);
  const merged = mergeVerts(makeBox(1), [5, 6]);
  assert.equal(merged.verts.length, 7);
  assert.equal(boundaryEdges(merged).length, 0);
});

// ---- Character sheets and fitting ------------------------------------------------------------------
test('a sheet finds its figures, and carving keeps the form inside every outline', () => {
  const size = 160, mask = new Float32Array(size * size);
  const ellipse = (cx: number, rx: number) => { for (let y = 20; y < 140; y++) for (let x = 0; x < size; x++) if (((x - cx) / rx) ** 2 + ((y - 80) / 60) ** 2 < 1) mask[x + y * size] = 1; };
  ellipse(40, 28); ellipse(84, 13); ellipse(128, 28);
  const views = detectViews(mask, size, 1);
  assert.deepEqual(views.map((v) => v.role), ['front', 'side', 'back']);
  const field = sheetToClay(mask, size, 1, views, { grid: 24, band: 0.1 });
  const mesh = meshFromField(field, 1);
  assert.ok(mesh.positions.length > 300);
  let wide = 0, deep = 0;
  for (let v = 0; v < mesh.positions.length; v += 3) { wide = Math.max(wide, Math.abs(mesh.positions[v])); deep = Math.max(deep, Math.abs(mesh.positions[v + 2])); }
  assert.ok(deep < wide * 0.75, `the narrow side view limits depth: wide ${wide}, deep ${deep}`);
});

test('fitting a plan moves its bones onto a differently proportioned form', () => {
  const body = buildAnatomy(CODEX_BY_ID.human.tune);
  const stretched = new Float32Array(body.bones.flatMap((b) => [b.at[0] * 0.5, b.at[1] * 0.5, b.at[2], b.tip[0] * 0.5, b.tip[1] * 0.5, b.tip[2]]));
  const fitted = fitPlanToClay(body, stretched);
  const height = (a: typeof body) => a.byName.head.tip[1] - a.floor;
  assert.ok(height(fitted) < height(body) * 0.7, 'the plan shrank to the form');
  assert.deepEqual(fitted.bones.map((b) => b.name), [...JOINTS]);
});

test('panels on a designed sheet are found, and swatches and close-ups are left out', () => {
  const width = 300, height = 200, gray = new Float32Array(width * height).fill(0.1);
  const frame = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = x0; x <= x1; x++) { gray[x + y0 * width] = 0.6; gray[x + y1 * width] = 0.6; }
    for (let y = y0; y <= y1; y++) { gray[x0 + y * width] = 0.6; gray[x1 + y * width] = 0.6; }
  };
  frame(5, 20, 125, 170); frame(135, 20, 205, 110); frame(212, 20, 292, 110); frame(135, 120, 292, 170);
  const boxes = suggestBoxes(gray, width, height);
  assert.deepEqual(boxes.map((b) => b.role), ['front', 'side', 'back']);
  assert.ok(Math.abs(boxes[0].u1 - 125 / width) < 0.02, 'the front panel');
  assert.ok(boxes.every((b) => b.v1 - b.v0 > 0.4), 'the wide close-up is not a view');
  const blank = suggestBoxes(new Float32Array(width * height), width, height);
  assert.equal(blank.length, 3, 'a plain sheet falls back to thirds');
});

test('per-view cut-outs compose into one map with tight views', () => {
  const cut = new Float32Array(64 * 64);
  for (let y = 16; y < 48; y++) for (let x = 24; x < 40; x++) cut[x + y * 64] = 1;
  const { views } = composeViews([{ box: { role: 'front', u0: 0, v0: 0, u1: 0.5, v1: 1 }, mask: cut, size: 64 }], 128);
  assert.ok(Math.abs(views[0].u0 - 0.1875) < 0.01 && Math.abs(views[0].v0 - 0.25) < 0.01);
});

// ---- Understanding objects, building from depth, scenes ---------------------------------------------
test('proportions correct a name that cannot be right', () => {
  const ranked = rankReadings([{ label: 'snare drum', score: 0.65 }, { label: 'conga drum', score: 0.2 }], 0.4);
  assert.equal(ranked[0].label, 'conga drum', 'a tall thing is not a snare drum');
  assert.equal(priorFromWords('a big wine bottle')!.label, 'wine bottle');
  assert.equal(priorFromWords('qwerty'), null);
});

const vaseReading = (): ImageReading => {
  const size = 160, mask = new Float32Array(size * size);
  for (let y = 20; y < 140; y++) {
    const r = 18 + 14 * Math.sin(((y - 20) / 120) * Math.PI);
    for (let x = 0; x < size; x++) if (Math.abs(x - 80) < r) mask[x + y * size] = 1;
  }
  return { mask, maskSize: size, aspect: 1 };
};

test('a round thing is really round, and the checks can say so', () => {
  const r = build(vaseReading(), { grid: 32, band: 0.1, prior: VOCABULARY_BY_LABEL.get('vase')! });
  assert.equal(r.plan.structure, 'round');
  const check = (id: string) => r.checks.find((c) => c.id === id)!;
  assert.ok(check('outline').pass, check('outline').detail);
  assert.ok(check('round').pass, check('round').detail);
  assert.ok(check('piece').pass);
  assert.equal(r.needsGenerated, null);
});

test('a flat thing comes out flat, and a real size is reported', () => {
  const size = 160, mask = new Float32Array(size * size);
  for (let y = 25; y < 135; y++) for (let x = 45; x < 115; x++) mask[x + y * size] = 1;
  const r = build({ mask, maskSize: size, aspect: 1 }, { grid: 32, band: 0.1, prior: VOCABULARY_BY_LABEL.get('book')! });
  assert.ok(r.size![2] < r.size![0] * 0.45, `book depth ${r.size}`);
});

test('a thing with hard parts is told honestly that depth is not enough', () => {
  const size = 160, mask = new Float32Array(size * size);
  for (let y = 70; y < 90; y++) for (let x = 10; x < 150; x++) mask[x + y * size] = 1;
  for (let y = 40; y < 120; y++) for (let x = 70; x < 90; x++) mask[x + y * size] = 1;
  const r = build({ mask, maskSize: size, aspect: 1 }, { grid: 32, band: 0.1, prior: VOCABULARY_BY_LABEL.get('airplane')! });
  assert.ok(r.needsGenerated, 'an airplane needs real geometry');
  assert.equal(r.checks.find((c) => c.id === 'capture')!.pass, false);
});

test('words become a scene at real sizes, with what stands on what', () => {
  const asked = parsePrompt('A wooden table with a lamp on the desk, two chairs and a tree');
  assert.ok(asked.some((r) => r.label === 'chair' && r.count === 2));
  const requests = parsePrompt('a lamp on a table, two chairs and a tree');
  assert.equal(requests.find((r) => r.label === 'lamp')!.on, 'table');
  const scene = settleScene(layoutScene(requests, 'a lamp on a table, two chairs and a tree'));
  assert.equal(scene.objects.length, 5);
  for (const c of scene.checks) assert.ok(c.pass, `${c.id}: ${c.detail}`);
  const lamp = scene.objects.find((o) => o.label === 'lamp')!, table = scene.objects.find((o) => o.label === 'table')!;
  assert.ok(Math.abs(lamp.position[1] - table.size[1]) < 0.02, 'the lamp stands on the table');
  const tree = scene.objects.find((o) => o.label === 'tree')!, chair = scene.objects.find((o) => o.label === 'chair')!;
  assert.ok(tree.size[1] > chair.size[1] * 5, 'real sizes');
});

test('the checks catch a scene that makes no sense, and settling fixes it', () => {
  const scene = layoutScene(parsePrompt('a table and a chair'), 'room');
  scene.objects[1].position = [...scene.objects[0].position];
  scene.objects[0].position[1] = 2;
  const before = checkScene(scene);
  assert.equal(before.find((c) => c.id === 'float')!.pass, false);
  assert.equal(before.find((c) => c.id === 'overlap')!.pass, false);
  const after = settleScene(scene);
  assert.ok(after.checks.every((c) => c.pass), JSON.stringify(after.checks));
  assert.ok(after.corrections.length > 0);
});

test('a model answer for a scene is untrusted, and unknown things are dropped', () => {
  const r = parseSceneAnswer('Sure! {"objects":[{"label":"Table","count":99},{"label":"flux capacitor"},{"label":"old oak tree","count":2,"color":"green"}]}')!;
  assert.deepEqual(r.map((o) => o.label), ['table', 'tree']);
  assert.equal(r[0].count, 8);
  assert.equal(parseSceneAnswer('no json'), null);
});

test('every block-out comes out at its real size, feet on the ground', () => {
  for (const label of ['table', 'chair', 'lamp', 'tree', 'car', 'vase', 'book', 'person']) {
    const scene = layoutScene([{ label, count: 1, words: '' }], label);
    const mesh = blockoutMesh(scene.objects[0])!;
    assert.ok(mesh && mesh.positions.length > 90, `${label} has a mesh`);
    let lo = Infinity, hi = -Infinity;
    for (let v = 1; v < mesh.positions.length; v += 3) { lo = Math.min(lo, mesh.positions[v]); hi = Math.max(hi, mesh.positions[v]); }
    assert.ok(Math.abs(lo) < 1e-3 && Math.abs(hi - scene.objects[0].size[1]) < 1e-3, `${label} ${lo}..${hi}`);
  }
});

test('subjects in a picture are told apart, and known sizes set the scale', () => {
  const size = 100, mask = new Float32Array(size * size);
  for (let y = 40; y < 90; y++) for (let x = 10; x < 25; x++) mask[x + y * size] = 1;
  for (let y = 50; y < 90; y++) for (let x = 60; x < 90; x++) mask[x + y * size] = 1;
  mask[5] = 1;
  const { subjects } = findSubjects(mask, size);
  assert.equal(subjects.length, 2, 'two things, and a speck is not one');
  const person = VOCABULARY_BY_LABEL.get('person')!;
  const k = solveScale([{ label: 'person', prior: person, distance: 2, frameHeight: 0.5, frameWidth: 0.1, u: 0.5, v: 0.9 }]);
  const placed = placeSubject({ label: 'person', prior: person, distance: 2, frameHeight: 0.5, frameWidth: 0.1, u: 0.5, v: 0.9 }, k);
  assert.ok(Math.abs(placed.height - person.size[1]) < 1e-3, 'comes out person-sized');
  assert.ok(placed.position[2] < 0, 'in front of the camera');
});

test('parts: run lengths decode, starting on a zero run', () => {
  assert.deepEqual([...decodeRuns([1, 2, 1], 2, 2)], [0, 1, 1, 0]);
  assert.deepEqual([...decodeRuns([0, 2, 2], 2, 2)], [1, 1, 0, 0]);
});

const runsOf = (mask: Uint8Array) => {
  const runs: number[] = [];
  let on = 0, length = 0;
  for (const v of mask) { if (v === on) length++; else { runs.push(length); on = v; length = 1; } }
  runs.push(length);
  return runs;
};

test('parts: a badge on a shirt keeps its own label, and the subject and background are not parts', () => {
  const S = 100;
  const rect = (x0: number, y0: number, x1: number, y1: number) => { const m = new Uint8Array(S * S); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[x + y * S] = 1; return m; };
  const subject = rect(20, 10, 80, 90);
  const region = (m: Uint8Array) => ({ runs: runsOf(m), score: 0.95, stability: 0.95 });
  const map = tidyParts([region(subject), region(rect(0, 0, 100, 100)), region(rect(20, 10, 80, 50)), region(rect(55, 20, 62, 27)), region(rect(0, 0, 15, 15))], subject, S, S);
  assert.equal(map.regions.length, 3);
  const shirt = map.labels[30 + 15 * S], badge = map.labels[58 + 23 * S];
  assert.ok(shirt && badge && shirt !== badge);
  assert.equal(map.labels[5 + 5 * S], 0);
  const body = map.labels[30 + 70 * S];
  assert.ok(body && body !== shirt && body !== badge);
});

test('parts: a near-identical region is only counted once', () => {
  const S = 50;
  const rect = (x0: number, x1: number) => { const m = new Uint8Array(S * S); for (let y = 10; y < 30; y++) for (let x = x0; x < x1; x++) m[x + y * S] = 1; return m; };
  const subject = new Uint8Array(S * S).fill(1);
  const map = tidyParts([rect(10, 30), rect(10, 31)].map((m) => ({ runs: runsOf(m), score: 0.9, stability: 0.9 })), subject, S, S);
  assert.equal(map.regions.length, 2);
});

const twoPartMap = (): PartMap => ({ width: 2, height: 1, labels: new Uint8Array([1, 2]), regions: [
  { id: 1, area: 1, share: 0.8, score: 0.9, u0: 0, v0: 0, u1: 0.5, v1: 1 },
  { id: 2, area: 1, share: 0.2, score: 0.9, u0: 0.5, v0: 0, u1: 1, v1: 1 },
] });

test('build sheet: context names the part, and expected materials stand when the picture is unsure', () => {
  const police = SHEET_BY_KIND.get('police officer in uniform')!;
  const sheet = writeSheet(twoPartMap(), new Map([
    [1, { parts: { 'uniform top': 0.3, shirt: 0.35 }, materials: { cotton: 0.4, 'poly-twill': 0.3 } }],
    [2, { parts: { 'police badge': 0.2, logo: 0.4 }, materials: { plastic: 0.3, brass: 0.2 } }],
  ]), police, 'vision');
  assert.equal(sheet.parts[0].name, 'uniform top');
  assert.equal(sheet.parts[0].material, 'poly-twill');
  assert.equal(sheet.parts[0].evidence, 'expected');
  assert.equal(sheet.parts[0].behaviour, 'stiff cloth');
  assert.equal(sheet.parts[1].name, 'police badge');
  assert.equal(sheet.parts[1].material, 'brass');
});

test('build sheet: a clear picture overrules the expectation', () => {
  const police = SHEET_BY_KIND.get('police officer in uniform')!;
  const sheet = writeSheet(twoPartMap(), new Map([[1, { parts: { 'uniform top': 0.9 }, materials: { denim: 0.8, 'poly-twill': 0.01 } }]]), police, 'vision');
  assert.equal(sheet.parts[0].material, 'denim');
  assert.equal(sheet.parts[0].evidence, 'seen');
});

test('build sheet: usual parts the picture lacks are listed, and only-sometimes parts are not', () => {
  const police = SHEET_BY_KIND.get('police officer in uniform')!;
  const sheet = writeSheet(twoPartMap(), new Map([[1, { parts: { 'uniform top': 0.9 }, materials: { 'poly-twill': 0.9 } }]]), police, 'vision');
  const missing = sheet.notSeen.map((l) => l.name);
  assert.ok(missing.includes('police badge'));
  assert.ok(!missing.includes('holster'));
  assert.ok(!missing.includes('uniform top'));
});

test('look: the answer is kept only for numbers asked about, with real materials and honest nulls', () => {
  const got = parseLookAnswer('Sure! ```json\n{"parts":[{"n":1,"name":"Fuel Tank","material":"painted-metal"},{"n":2,"name":null,"material":"steel"},{"n":3,"name":"mirror","material":"unobtainium"},{"n":9,"name":"x","material":"steel"},{"n":1,"name":"again","material":"steel"}]}\n```', [1, 2, 3]);
  assert.deepEqual(got.get(1), { name: 'fuel tank', material: 'painted-metal' });
  assert.deepEqual(got.get(2), { name: null, material: 'steel' });
  assert.deepEqual(got.get(3), { name: 'mirror', material: null });
  assert.equal(got.has(9), false);
  assert.equal(parseLookAnswer('no json here', [1]).size, 0);
  // Stray NULs between entries, and an answer cut off at the token limit.
  const rough = parseLookAnswer('{"parts":[{"n":1,"name":"tire","material":"rubber"},\u0000{"n":2,"name":"wing","material":"aluminium"},\u0000{"n":3,"name":"fusel', [1, 2, 3]);
  assert.deepEqual([...rough.keys()], [1, 2]);
});

test('look: a part\'s number sits deep inside it, not on the edge it shares', () => {
  const W = 30, H = 20;
  const labels = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) labels[x + y * W] = x < 20 ? 1 : 2;
  const spots = labelSpots({ width: W, height: H, labels, regions: [] });
  const one = spots.get(1)!, two = spots.get(2)!;
  assert.ok(one.x * W > 5 && one.x * W < 15, `part 1 at ${one.x * W}`);
  assert.ok(two.x * W > 20 && two.x * W < 30);
  assert.ok(Math.abs(one.y * H - 10) <= 1.5);
});

test('look: the whole-picture model outranks crops, and its "can\'t tell" stays unnamed', () => {
  const police = SHEET_BY_KIND.get('police officer in uniform')!;
  const sheet = writeSheet(twoPartMap(), new Map([
    [1, { parts: { 'duty belt': 0.6 }, materials: { cotton: 0.4, 'poly-twill': 0.3 } }],
    [2, { parts: { 'duty belt': 0.6 }, materials: { brass: 0.6 } }],
  ]), police, 'vision', new Map([[1, { name: 'uniform top', material: null }], [2, { name: null, material: 'brass' }]]));
  assert.equal(sheet.parts[0].name, 'uniform top');
  assert.equal(sheet.parts[0].material, 'poly-twill');
  assert.equal(sheet.parts[0].evidence, 'expected');
  assert.equal(sheet.parts[1].name, 'unnamed part');
  assert.equal(sheet.parts[1].material, 'brass');
});

test('build sheet: every line in every sheet names a real material', () => {
  for (const s of KIND_SHEETS) for (const l of s.lines) assert.ok(MATERIAL_BY_ID.has(l.material), `${s.kind}: ${l.name} -> ${l.material}`);
});

test('build sheet: words find a sheet, and a model answer is filtered', () => {
  assert.equal(sheetFromWords('a police uniform')?.kind, 'police officer in uniform');
  assert.equal(sheetFromWords('qqq'), null);
  const answer = parseSheetAnswer('kettle', 'Sure! {"parts":[{"name":"Body","material":"steel"},{"name":"body","material":"steel"},{"name":"spout","material":"unobtainium"},{"name":"handle","material":"plastic","usual":false}]}');
  assert.deepEqual(answer?.lines, [{ name: 'body', material: 'steel', usual: true }, { name: 'handle', material: 'plastic', usual: false }]);
  assert.equal(parseSheetAnswer('x', 'no json here'), null);
});

test('parts: light per label comes from the material, and unclaimed pixels take the largest part', () => {
  const sheet = writeSheet(twoPartMap(), new Map([[1, { parts: { x: 1 }, materials: { steel: 0.9 } }], [2, { parts: { y: 1 }, materials: { rubber: 0.9 } }]]), null, 'none');
  const { roughness, metalness } = lightByLabel(sheet);
  assert.equal(metalness[1], 1);
  assert.equal(metalness[2], 0);
  assert.equal(metalness[0], 1);
  assert.ok(Math.abs(roughness[2] - 0.85) < 1e-6);
});

test('finish: labels spread past the outline without overwriting one another', () => {
  const out = spreadLabels(new Uint8Array([0, 1, 0, 0, 0, 2, 0]), 7, 1);
  assert.equal(out[1], 1);
  assert.equal(out[5], 2);
  assert.equal(out[0], 1);
  assert.equal(out[6], 2);
  assert.ok(out.every((v) => v));
});

test('build sheet: the main mass takes the main part, and an unsure piece stays unnamed', () => {
  const plane = SHEET_BY_KIND.get('propeller airplane')!;
  const sheet = writeSheet(twoPartMap(), new Map([
    [1, { parts: { 'landing gear': 0.2 }, materials: { aluminium: 0.3 } }],
    [2, { parts: { tire: 0.01, base: 0.02 }, materials: { iron: 0.3 } }],
  ]), plane, 'words');
  assert.equal(sheet.parts[0].name, 'fuselage');
  assert.equal(sheet.parts[0].material, 'aluminium');
  assert.equal(sheet.parts[1].name, 'unnamed part');
  assert.equal(sheet.parts[1].evidence, 'seen');
});

test('parts: a close-up map lands back in the right place on the whole picture', () => {
  const map: PartMap = { width: 2, height: 2, labels: new Uint8Array([1, 0, 0, 2]), regions: [{ id: 1, area: 1, share: 0.5, score: 1, u0: 0, v0: 0, u1: 0.5, v1: 0.5 }] };
  const placed = placeMap(map, { u0: 0.5, v0: 0.5, u1: 1, v1: 1 });
  assert.deepEqual([placed.width, placed.height], [4, 4]);
  assert.equal(placed.labels[2 + 2 * 4], 1);
  assert.equal(placed.labels[3 + 3 * 4], 2);
  assert.equal(placed.labels[0], 0);
  assert.deepEqual([placed.regions[0].u0, placed.regions[0].u1], [0.5, 0.75]);
});

test('paint: the surface behind another is not visible, and a surface does not shadow itself', () => {
  // Two squares facing the camera, one in front of the other, the far one reaching further to the right.
  const positions = new Float32Array([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 2, 0, 0, 2, 1, 0, 0, 1, 0]);
  const see = visibilityFrom(positions, [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7], 64);
  assert.equal(see(0.5, 0.5, 1), true);
  assert.equal(see(0.5, 0.5, 0), false);
  assert.equal(see(1.5, 0.5, 0), true);
});

test('paint: a surface turning away stops taking the picture before it can streak', () => {
  assert.equal(facingWeight(1), 1);
  assert.equal(facingWeight(0.2), 0);
  assert.equal(facingWeight(-1), 0);
  assert.ok(facingWeight(0.46) > 0 && facingWeight(0.46) < 1);
});

test('paint: unseen colour travels over the surface, across split vertices, and leaves seen colour alone', () => {
  // A strip of three quads. Its middle edge is split in two, as a texture seam would.
  const positions = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 2, 0, 0, 2, 1, 0]);
  const indices = [0, 2, 3, 0, 3, 1, 4, 6, 7, 4, 7, 5];
  const out = fillUnseen(positions, indices, (v) => (v < 2 ? [1, 0, 0] : null), [0, 1, 0], 4);
  assert.deepEqual([out[0], out[1], out[2]], [1, 0, 0]);
  assert.equal(out[7 * 3], 1);
  assert.equal(out[7 * 3 + 1], 0);
  assert.equal(out[2 * 3], out[4 * 3]);
});

test('paint: with nothing seen it falls back rather than leaving black', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const out = fillUnseen(positions, [0, 1, 2], () => null, [0.2, 0.4, 0.6], 2);
  assert.ok(Math.abs(out[0] - 0.2) < 1e-6 && Math.abs(out[8] - 0.6) < 1e-6);
});

test('paint: a surface pointing against the picture depth is not painted, and one that agrees is', () => {
  // A flat picture depth with a slope: nearer towards the right, so its surface faces left.
  const size = 64, values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) values[x + y * size] = x / size;
  const n = 2000, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3);
  const l = Math.SQRT1_2;
  for (let v = 0; v < n; v++) {
    positions[v * 3] = ((v % 40) / 40) * 0.9 + 0.05; positions[v * 3 + 1] = (Math.floor(v / 40) / 50) * 0.9 + 0.05;
    // Almost everything follows the slope. The last vertices point the other way, like a head turned from the picture.
    const against = v >= n - 40;
    normals[v * 3] = against ? l : -l; normals[v * 3 + 2] = l;
  }
  const agrees = agreementWithPicture(positions, normals, { values, size, box: { u0: 0, v0: 0, u1: 1, v1: 1 } }, (x) => x, (y) => 1 - y);
  assert.ok(agrees[100] > 0.9, `agreeing ${agrees[100]}`);
  assert.ok(agrees[n - 1] < 0.1, `against ${agrees[n - 1]}`);
});

test('paint: flat depth tells it nothing, so paint is left alone', () => {
  const positions = new Float32Array([0.5, 0.5, 0]), normals = new Float32Array([0, 0, 1]);
  const agrees = agreementWithPicture(positions, normals, { values: new Float32Array(16), size: 4, box: { u0: 0, v0: 0, u1: 1, v1: 1 } }, (x) => x, (y) => y);
  assert.equal(agrees[0], 1);
});

test('paint: unseen colour stays inside its own part before it crosses to another', () => {
  // A strip of four vertex pairs: part 1 seen red, part 2 seen blue on its far end, with an unseen stretch of each between.
  const positions = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 2, 0, 0, 2, 1, 0, 3, 0, 0, 3, 1, 0]);
  const indices = [0, 2, 3, 0, 3, 1, 2, 4, 5, 2, 5, 3, 4, 6, 7, 4, 7, 5];
  const part = (v: number) => (v < 4 ? 1 : 2);
  const out = fillUnseen(positions, indices, (v) => (v < 2 ? [1, 0, 0] : v >= 6 ? [0, 0, 1] : null), [0, 1, 0], 0, part);
  assert.equal(out[2 * 3], 1);
  assert.equal(out[4 * 3 + 2], 1);
  // A part with nothing seen still gets filled from its neighbour instead of the fallback.
  const lone = fillUnseen(positions, indices, (v) => (v < 2 ? [1, 0, 0] : null), [0, 1, 0], 0, part);
  assert.equal(lone[6 * 3], 1);
  assert.equal(lone[6 * 3 + 1], 0);
});

test('speed: a lighter mesh keeps the outline, and alignment on it finds the same turn', async () => {
  // A long box, split finely so it has many triangles to merge.
  const positions: number[] = [], indices: number[] = [];
  const N = 40;
  const side = (at: (u: number, v: number) => [number, number, number]) => {
    const base = positions.length / 3;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) positions.push(...at(i / N * 2 - 1, j / N * 2 - 1));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = base + i + j * (N + 1); indices.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1); }
  };
  const w = 0.8, h = 0.3, d = 0.2;
  side((u, v) => [u * w, v * h, d]); side((u, v) => [-u * w, v * h, -d]);
  side((u, v) => [w, v * h, -u * d]); side((u, v) => [-w, v * h, u * d]);
  side((u, v) => [u * w, h, -v * d]); side((u, v) => [u * w, -h, v * d]);
  const P = new Float32Array(positions);
  const light = clusterMesh(P, indices, 16);
  assert.ok(light.indices.length < indices.length / 3);
  const span = (a: Float32Array, k: number) => { let lo = Infinity, hi = -Infinity; for (let i = k; i < a.length; i += 3) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } return hi - lo; };
  assert.ok(Math.abs(span(light.positions, 0) - span(P, 0)) < 0.15);
  assert.ok(Math.abs(span(light.positions, 1) - span(P, 1)) < 0.15);
  assert.equal(mainPieceShare(light.positions, light.indices), 1);
});

test('names: a short list cannot force a name, and a clear outsider wins', () => {
  const moto = SHEET_BY_KIND.get('motorcycle')!;
  const sheet = writeSheet(twoPartMap(), new Map([
    // The listed name barely registers against everything the model knows.
    [1, { parts: { handlebar: 0.02, cape: 0.03, bumper: 0.03 }, materials: { chrome: 0.5 } }],
    // Listed name weak, an outside name clear.
    [2, { parts: { handlebar: 0.05, headlight: 0.6 }, materials: { glass: 0.5 } }],
  ]), moto, 'vision');
  assert.equal(sheet.parts.find((p) => p.id === 2)?.name, 'headlight');
  assert.equal(sheet.parts.find((p) => p.id === 2)?.evidence, 'seen');
  const small = { ...twoPartMap(), regions: [{ id: 1, area: 1, share: 0.2, score: 1, u0: 0, v0: 0, u1: 0.5, v1: 1 }] };
  const unsure = writeSheet(small, new Map([[1, { parts: { handlebar: 0.02, cape: 0.03 }, materials: { chrome: 0.5 } }]]), moto, 'vision');
  assert.equal(unsure.parts[0].name, 'unnamed part');
});

test('names: where a piece sits and its material decide between lookalikes', () => {
  const police = SHEET_BY_KIND.get('police officer in uniform')!;
  const map: PartMap = { width: 100, height: 100, labels: new Uint8Array(10000), regions: [
    { id: 1, area: 9000, share: 0.5, score: 1, u0: 0, v0: 0, u1: 1, v1: 1 },
    { id: 2, area: 300, share: 0.04, score: 1, u0: 0.4, v0: 0.05, u1: 0.6, v1: 0.25 },
  ] };
  const sheet = writeSheet(map, new Map([[1, { parts: { 'uniform top': 0.3 }, materials: { 'poly-twill': 0.5 } }], [2, { parts: { 'police helmet': 0.4, face: 0.2 }, materials: { skin: 0.5 } }]]), police, 'vision');
  assert.equal(sheet.parts.find((p) => p.id === 2)?.name, 'face');
  assert.equal(sheet.parts.find((p) => p.id === 2)?.material, 'skin');
});

test('shot camera: holds its keys at the ends, eases out and in, and never stops at a key in between', () => {
  const keys = [
    { t: 0, position: [0, 1, 5] as [number, number, number], target: [0, 1, 0] as [number, number, number], fov: 38 },
    { t: 5, position: [5, 1, 0] as [number, number, number], target: [0, 1, 0] as [number, number, number], fov: 38 },
    { t: 10, position: [0, 1, -5] as [number, number, number], target: [0, 1, 0] as [number, number, number], fov: 30 },
  ];
  assert.deepEqual(cameraAt(keys, -1)!.position, [0, 1, 5]);
  assert.deepEqual(cameraAt(keys, 12)!.position, [0, 1, -5]);
  assert.equal(cameraAt(keys, 10)!.fov, 30);
  const speed = (t: number) => { const a = cameraAt(keys, t - 0.05)!.position, b = cameraAt(keys, t + 0.05)!.position; return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.1; };
  assert.ok(speed(0.1) < speed(5) * 0.2, 'starts gently');
  assert.ok(speed(9.9) < speed(5) * 0.2, 'settles gently');
  assert.ok(speed(5) > 0.5, 'keeps moving through the middle key');
  assert.equal(cameraAt([], 3), null);
});

test('shot camera: a key near an existing one replaces it, and lengths retime the whole move', () => {
  const k = (t: number) => ({ t, position: [t, 0, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 38 });
  const keys = setKey(setKey(setKey([], k(0)), k(4)), k(4.1));
  assert.deepEqual(keys.map((x) => x.t), [0, 4.1]);
  assert.deepEqual(retime(keys, 10, 5).map((x) => +x.t.toFixed(2)), [0, 2.05]);
});

test('shot camera: ready-made moves frame the scene from the viewer\'s side', () => {
  const scene = { objects: [{ position: [0, 0, 0], size: [1, 2, 1] }, { position: [3, 0, 0], size: [1, 1, 1] }] } as never;
  const { centre, radius } = sceneBounds(scene);
  assert.deepEqual(centre.map((v) => +v.toFixed(2)), [1.5, 1, 0]);
  const from: [number, number, number] = [1.5, 2, 10];
  const push = cameraMove('push-in', scene, 8, from);
  const dist = (p: number[]) => Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
  assert.equal(push.length, 2);
  assert.equal(push[1].t, 8);
  assert.ok(dist(push[1].position) < dist(push[0].position));
  assert.ok(push[0].position[2] > centre[2], 'stays on the side the viewer looked from');
  assert.ok(dist(push[0].position) > radius, 'starts outside the scene');
  const orbit = cameraMove('orbit', scene, 10, from);
  assert.ok(orbit.every((o) => Math.abs(dist(o.position) - dist(orbit[0].position)) < 1e-6), 'orbits at one distance');
  for (const m of ['pull-back', 'crane-up', 'slide-past'] as const) assert.ok(cameraMove(m, scene, 5, from).every((x) => x.position.every(Number.isFinite)));
});
