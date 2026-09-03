import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  meshLattice, createMeshSequence, meshReferenceSample, meshNeighbours, vertexIndex, vertexCount,
  repairDisplacements, smoothDisplacements, foldedVertices, trackMeshFrame, upsertMeshSample,
  sampleMeshAt, meshTrackedRange, meshDisplacement, meshDisplacementImage, MESH_DEFAULTS,
  type MeshTrackSequence,
} from '../services/fabula/meshTrack';
import type { Point2, Quad } from '../services/fabula/planarTrack';
import type { GrayFrame } from '../services/fabula/vectorTrack';

const UNIT: Quad = [{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .8, y: .8 }, { x: .2, y: .8 }];
const seq = (cols = 2, rows = 2): MeshTrackSequence => createMeshSequence('asset', 24, 320, 180, 0, UNIT, cols, rows, 'm1');

/**
 * A deterministic non-repeating texture, shifted by (dx, dy) pixels.
 *
 * Deliberately NOT a checkerboard: a periodic pattern is the pathological input for block
 * matching, because every patch matches every other patch one period away, and the tracker
 * confidently locks onto the wrong one. This is the aperture problem in its purest form and it
 * tests the fixture, not the tracker.
 */
function frame(width: number, height: number, dx = 0, dy = 0): GrayFrame {
  const data = new Uint8Array(width * height);
  const value = (x: number, y: number) => {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return Math.floor((h - Math.floor(h)) * 255);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x - dx, sy = y - dy;
      data[y * width + x] = sx >= 0 && sy >= 0 && sx < width && sy < height ? value(sx, sy) : 0;
    }
  }
  return { width, height, data };
}

describe('Mesh lattice', () => {
  it('lays a row-major grid whose corners are the quad corners', () => {
    const grid = meshLattice(UNIT, 2, 2);
    assert.equal(grid.length, vertexCount(2, 2));
    assert.deepEqual(grid[0], UNIT[0]);
    assert.deepEqual(grid[vertexIndex(2, 2, 0)], UNIT[1]);
    assert.deepEqual(grid[vertexIndex(2, 2, 2)], UNIT[2]);
    assert.deepEqual(grid[vertexIndex(2, 0, 2)], UNIT[3]);
  });

  it('indexes rows and columns consistently', () => {
    assert.equal(vertexIndex(4, 0, 0), 0);
    assert.equal(vertexIndex(4, 4, 0), 4);
    assert.equal(vertexIndex(4, 0, 1), 5);
    assert.equal(vertexCount(4, 3), 20);
  });

  it('connects interior vertices to four neighbours and corners to two', () => {
    assert.equal(meshNeighbours(2, 2, vertexIndex(2, 1, 1)).length, 4);
    assert.equal(meshNeighbours(2, 2, vertexIndex(2, 0, 0)).length, 2);
    assert.equal(meshNeighbours(2, 2, vertexIndex(2, 2, 2)).length, 2);
    assert.deepEqual(meshNeighbours(2, 2, 0).sort(), [1, 3]);
  });

  it('starts from an undeformed, fully trusted reference sample', () => {
    const s = meshReferenceSample(seq());
    assert.equal(s.confidence, 1);
    assert.equal(s.lost, false);
    assert.deepEqual(s.vertices, meshLattice(UNIT, 2, 2));
  });
});

describe('Displacement repair', () => {
  const zero = (n: number): Point2[] => Array.from({ length: n }, () => ({ x: 0, y: 0 }));

  it('spreads a trusted neighbour into an untrusted vertex', () => {
    const d = zero(vertexCount(2, 2));
    const trusted = d.map(() => true);
    const target = vertexIndex(2, 1, 1);
    for (let i = 0; i < d.length; i++) d[i] = { x: .05, y: 0 };
    d[target] = { x: -99, y: -99 };                     // a wild bad match
    trusted[target] = false;
    const out = repairDisplacements(2, 2, d, trusted);
    assert.ok(Math.abs(out[target].x - .05) < 1e-9, `rebuilt to ${out[target].x}`);
    assert.equal(out[0].x, .05, 'a trusted vertex must be left alone');
  });

  it('reaches a vertex no trusted neighbour touches directly', () => {
    const n = vertexCount(4, 4);
    const d = zero(n).map(() => ({ x: .02, y: .01 }));
    const trusted = d.map(() => false);
    trusted[0] = true;                                  // one corner only
    d[0] = { x: .02, y: .01 };
    const out = repairDisplacements(4, 4, d, trusted);
    for (const v of out) { assert.ok(Math.abs(v.x - .02) < 1e-9); assert.ok(Math.abs(v.y - .01) < 1e-9); }
  });

  it('leaves the field untouched when nothing is trusted', () => {
    const d = zero(9).map((_, i) => ({ x: i, y: -i }));
    const out = repairDisplacements(2, 2, d, d.map(() => false));
    assert.deepEqual(out, d);
  });
});

describe('Displacement smoothing', () => {
  it('does nothing at strength zero and averages towards neighbours above it', () => {
    const d = Array.from({ length: vertexCount(2, 2) }, () => ({ x: 0, y: 0 }));
    const spike = vertexIndex(2, 1, 1);
    d[spike] = { x: 1, y: 1 };
    assert.deepEqual(smoothDisplacements(2, 2, d, 0)[spike], { x: 1, y: 1 });
    const soft = smoothDisplacements(2, 2, d, 1);
    assert.ok(soft[spike].x < 0.2, `spike should collapse towards its neighbours, got ${soft[spike].x}`);
    assert.ok(soft[0].x >= 0, 'a corner with no motion stays put');
  });

  it('never moves a uniform field', () => {
    const d = Array.from({ length: vertexCount(3, 3) }, () => ({ x: .04, y: -.02 }));
    for (const v of smoothDisplacements(3, 3, d, 1)) {
      assert.ok(Math.abs(v.x - .04) < 1e-9 && Math.abs(v.y + .02) < 1e-9);
    }
  });
});

describe('Fold detection', () => {
  it('accepts the undeformed lattice', () => {
    assert.deepEqual(foldedVertices(2, 2, meshLattice(UNIT, 2, 2)), []);
  });

  it('accepts a uniformly translated and scaled lattice', () => {
    const grid = meshLattice(UNIT, 3, 3).map((p) => ({ x: p.x * 1.3 + .05, y: p.y * 1.3 - .02 }));
    assert.deepEqual(foldedVertices(3, 3, grid), []);
  });

  it('catches a vertex dragged across its own quad', () => {
    const grid = meshLattice(UNIT, 2, 2);
    const bad = vertexIndex(2, 1, 1);
    grid[bad] = { x: grid[bad].x - .6, y: grid[bad].y - .6 };   // yanked past its neighbours
    assert.ok(foldedVertices(2, 2, grid).includes(bad));
  });
});

describe('Tracking a frame', () => {
  it('follows a translating surface and stays confident', () => {
    const s = seq(2, 2);
    const a = frame(160, 120, 0, 0);
    const b = frame(160, 120, 4, 0);
    const result = trackMeshFrame(s, a, b, 1, s.reference);
    assert.ok(result, 'tracker returned nothing');
    assert.equal(result!.sample.vertices.length, vertexCount(2, 2));
    const dx = meshDisplacement(s, result!.sample).map((d) => d.x);
    const mean = dx.reduce((t, v) => t + v, 0) / dx.length;
    assert.ok(mean > 0.01, `expected rightward motion, got ${mean}`);
    assert.deepEqual(foldedVertices(2, 2, result!.sample.vertices), [], 'a clean translation must not fold');
  });

  it('refuses a vertex count that does not match the lattice', () => {
    const s = seq(2, 2);
    const a = frame(80, 60);
    assert.equal(trackMeshFrame(s, a, a, 1, [{ x: .5, y: .5 }]), null);
  });

  it('marks a frame lost, with a reason, when the surface has nothing to match', () => {
    const s = seq(2, 2);
    const flat: GrayFrame = { width: 80, height: 60, data: new Uint8Array(80 * 60).fill(128) };
    const result = trackMeshFrame(s, flat, flat, 1, s.reference);
    assert.ok(result);
    assert.ok(result!.sample.lost, 'a featureless frame must not be reported as tracked');
    assert.ok(result!.reason && result!.reason.length > 0, 'a lost frame must say why');
  });
});

describe('Sequence storage', () => {
  it('replaces a sample for the same frame rather than duplicating it', () => {
    let s = seq();
    const base = meshReferenceSample(s);
    s = upsertMeshSample(s, { ...base, frame: 5, confidence: .5 });
    s = upsertMeshSample(s, { ...base, frame: 5, confidence: .9 });
    assert.equal(s.samples.length, 1);
    assert.equal(s.samples[0].confidence, .9);
  });

  it('holds the last sample at or before the requested frame', () => {
    let s = seq();
    const base = meshReferenceSample(s);
    s = upsertMeshSample(s, { ...base, frame: 2 });
    s = upsertMeshSample(s, { ...base, frame: 8 });
    assert.equal(sampleMeshAt(s, 2)!.frame, 2);
    assert.equal(sampleMeshAt(s, 5)!.frame, 2, 'must hold, not interpolate to the next key');
    assert.equal(sampleMeshAt(s, 99)!.frame, 8);
    assert.equal(sampleMeshAt(s, 0)!.frame, 2, 'before the first sample, the first is the best guess');
  });

  it('reports the tracked range and the first lost frame', () => {
    let s = seq();
    const base = meshReferenceSample(s);
    s = upsertMeshSample(s, { ...base, frame: 1 });
    s = upsertMeshSample(s, { ...base, frame: 4, lost: true });
    s = upsertMeshSample(s, { ...base, frame: 7 });
    assert.deepEqual(meshTrackedRange(s), { start: 1, end: 7, lostAt: 4 });
  });
});

describe('Displacement image', () => {
  it('is the size of the lattice, not the frame', () => {
    const s = seq(4, 3);
    const image = meshDisplacementImage(s, meshReferenceSample(s));
    assert.equal(image.width, 5);
    assert.equal(image.height, 4);
    assert.equal(image.data.length, 5 * 4 * 4);
  });

  it('encodes no displacement as the midpoint, so an untracked mesh warps nothing', () => {
    const s = seq(2, 2);
    const image = meshDisplacementImage(s, meshReferenceSample(s));
    for (let i = 0; i < image.data.length; i += 4) {
      assert.ok(Math.abs(image.data[i] - 128) <= 1, `x channel ${image.data[i]}`);
      assert.ok(Math.abs(image.data[i + 1] - 128) <= 1, `y channel ${image.data[i + 1]}`);
      assert.equal(image.data[i + 3], 255);
    }
  });

  it('encodes direction and carries confidence, and clamps beyond the range', () => {
    const s = seq(1, 1);
    const base = meshReferenceSample(s);
    const moved = {
      ...base,
      vertices: s.reference.map((p, i) => (i === 0 ? { x: p.x + .1, y: p.y - .1 } : { ...p })),
      vertexConfidence: s.reference.map((_, i) => (i === 0 ? .5 : 1)),
    };
    const image = meshDisplacementImage(s, moved, .2);
    assert.ok(image.data[0] > 128, 'a rightward move must encode above the midpoint');
    assert.ok(image.data[1] < 128, 'an upward move must encode below it');
    assert.ok(Math.abs(image.data[2] - 128) <= 2, 'confidence rides in blue');

    const far = { ...base, vertices: s.reference.map((p, i) => (i === 0 ? { x: p.x + 9, y: p.y } : { ...p })) };
    assert.equal(meshDisplacementImage(s, far, .2).data[0], 255, 'a wild vertex clamps instead of wrapping');
  });
});

describe('Shader coupling', () => {
  it('decodes with the same range the encoder uses', async () => {
    // The encoder scales displacement into 0..1 by MESH_DISPLACEMENT_RANGE and the shader scales
    // it back out by a literal. A mismatch does not throw or render black — every warp is just
    // silently the wrong size — so the two numbers are pinned to each other here.
    const { FX_EFFECTS } = await import('../components/plajahPixels/engine/fx/effects');
    const { MESH_DISPLACEMENT_RANGE } = await import('../services/fabula/meshTrack');
    const effect = FX_EFFECTS.find((e) => e.auxInput?.kind === 'mesh');
    assert.ok(effect, 'no mesh-input effect is registered');
    assert.ok(
      effect!.glsl.includes(`* ${MESH_DISPLACEMENT_RANGE}`),
      `shader must decode with ${MESH_DISPLACEMENT_RANGE}; its body is ${effect!.glsl.slice(0, 200)}`,
    );
  });
});

describe('Defaults', () => {
  it('ships settings a caller can override piecemeal', () => {
    const s = createMeshSequence('a', 24, 320, 180, 0, UNIT, 3, 3, 'x', { smoothing: 0 });
    assert.equal(s.settings.smoothing, 0);
    assert.equal(s.settings.patchRadius, MESH_DEFAULTS.patchRadius);
    assert.equal(s.cols, 3);
    assert.equal(s.reference.length, vertexCount(3, 3));
  });
});
