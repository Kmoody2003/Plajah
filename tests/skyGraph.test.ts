// skyGraph tests — the constellation must describe the real standards graph, not decorate it.
//
// The load-bearing claim of the Sky is that its edges MEAN something. If layout drifts between
// renders, or an edge appears that has no prerequisite behind it, the map stops being a map.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSkyGraph, unlockedBy, requires, suggestNext, SUBJECT_HUE, separation, MIN_SEPARATION } from '../services/skyGraph';
import { STANDARDS } from '../data/educationStandards';

test('every node is a real domain holding real standards', () => {
  const g = buildSkyGraph();
  assert.ok(g.nodes.length > 0);
  const realDomains = new Set(STANDARDS.map(s => `${s.subject}::${s.domain}`));
  for (const n of g.nodes) {
    assert.ok(realDomains.has(n.id), `${n.id} is not a domain in the data`);
    assert.ok(n.standardIds.length > 0, `${n.id} has no standards`);
    for (const id of n.standardIds) {
      assert.ok(STANDARDS.some(s => s.id === id), `${id} is not a real standard`);
    }
  }
});

test('every edge traces back to an actual prerequisite', () => {
  // The whole point. An edge with nothing behind it is a fabricated claim about learning.
  const g = buildSkyGraph();
  const byId = new Map(STANDARDS.map(s => [s.id, s]));
  for (const e of g.edges) {
    const supported = STANDARDS.some(s =>
      `${s.subject}::${s.domain}` === e.to &&
      (s.prerequisites ?? []).some(p => {
        const from = byId.get(p);
        return from && `${from.subject}::${from.domain}` === e.from;
      }));
    assert.ok(supported, `edge ${e.from} → ${e.to} has no prerequisite behind it`);
  }
});

test('no self-edges and no duplicates', () => {
  const g = buildSkyGraph();
  const seen = new Set<string>();
  for (const e of g.edges) {
    assert.notEqual(e.from, e.to, 'a domain cannot be its own prerequisite');
    const k = `${e.from}→${e.to}`;
    assert.ok(!seen.has(k), `duplicate edge ${k}`);
    seen.add(k);
  }
});

test('layout is deterministic — the same sky every time', () => {
  // A map that rearranges itself between sessions is not a map. This also guards against
  // anyone reaching for Math.random() to "scatter" the stars.
  const a = buildSkyGraph();
  const b = buildSkyGraph();
  assert.deepEqual(a.nodes.map(n => [n.id, n.x, n.y]), b.nodes.map(n => [n.id, n.x, n.y]));
});

test('mastery does not move the stars', () => {
  // Progress changes brightness, never position — otherwise a learner's map shifts under them
  // as they work, which is exactly when they most need it to stay put.
  const empty = buildSkyGraph();
  const withProgress = buildSkyGraph(Object.fromEntries(STANDARDS.map(s => [s.id, 80])));
  assert.deepEqual(
    empty.nodes.map(n => [n.id, n.x, n.y]),
    withProgress.nodes.map(n => [n.id, n.x, n.y]),
  );
});

test('every node lands inside the canvas', () => {
  for (const n of buildSkyGraph().nodes) {
    assert.ok(n.x >= 0 && n.x <= 1, `${n.id} x=${n.x} is off-canvas`);
    assert.ok(n.y >= 0 && n.y <= 1, `${n.id} y=${n.y} is off-canvas`);
  }
});

test('no two stars are closer than a label is wide', () => {
  // The first version of this test measured raw normalised distance and passed with 29
  // overlapping labels on screen — the canvas is nearly twice as wide as it is tall, so a
  // vertical gap buys far fewer pixels than the same number horizontally. Measure the way the
  // render does, or the test certifies a layout nobody can read.
  const nodes = buildSkyGraph().nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = separation(nodes[i], nodes[j]);
      assert.ok(d >= MIN_SEPARATION - 0.001,
        `${nodes[i].id} and ${nodes[j].id} are ${d.toFixed(4)} apart, need ${MIN_SEPARATION}`);
    }
  }
});

test('separation weights the vertical axis by the canvas aspect', () => {
  // Guards the fix itself: the same normalised gap must count for less vertically.
  const horizontal = separation({ x: 0, y: 0 }, { x: 0.1, y: 0 });
  const vertical = separation({ x: 0, y: 0 }, { x: 0, y: 0.1 });
  assert.ok(vertical < horizontal, 'a vertical gap must be worth fewer pixels than a horizontal one');
});

test('a mutually-prerequisite pair does not hang the depth walk', () => {
  // MATH's Operations ⇄ Base Ten genuinely reinforce each other in the real data. A naive
  // longest-path walk recurses forever on that; the graph must still build.
  const g = buildSkyGraph();
  for (const n of g.nodes) {
    assert.ok(Number.isFinite(n.depth) && n.depth >= 0, `${n.id} has depth ${n.depth}`);
  }
});

test('untouched domains report null mastery, not zero', () => {
  // Zero means "assessed and scored nothing". Null means "never been here". Collapsing them
  // would paint a beginner's whole sky as failure.
  const g = buildSkyGraph();
  assert.equal(g.unopened.length, g.nodes.length, 'with no ledger, everything is unopened');
  for (const n of g.nodes) assert.equal(n.mastery, null);
});

test('mastery is averaged only over standards actually attempted', () => {
  const target = STANDARDS.find(s => s.domain === 'Fluency')!;
  const g = buildSkyGraph({ [target.id]: 90 });
  const node = g.nodes.find(n => n.id === `${target.subject}::${target.domain}`)!;
  assert.equal(node.mastery, 90, 'an untouched sibling standard must not dilute the score');
  assert.ok(!g.unopened.includes(node.id));
});

test('travelled edges need history at both ends', () => {
  const g = buildSkyGraph();
  assert.ok(g.edges.every(e => !e.travelled), 'nothing is travelled without a ledger');

  const all = buildSkyGraph(Object.fromEntries(STANDARDS.map(s => [s.id, 70])));
  assert.ok(all.edges.every(e => e.travelled), 'with full history every edge is travelled');
});

test('requires and unlockedBy are exact inverses', () => {
  const g = buildSkyGraph();
  for (const e of g.edges) {
    assert.ok(unlockedBy(g, e.from).some(n => n.id === e.to), `${e.from} should unlock ${e.to}`);
    assert.ok(requires(g, e.to).some(n => n.id === e.from), `${e.to} should require ${e.from}`);
  }
});

test('the suggestion is always reachable, never something already done', () => {
  const g = buildSkyGraph();
  assert.equal(suggestNext(g), null, 'with no history there is no earned next step');

  // Light up one foundation and its follow-on should become the suggestion.
  const phon = STANDARDS.filter(s => s.domain === 'Phonological Awareness').map(s => s.id);
  const seeded = buildSkyGraph(Object.fromEntries(phon.map(id => [id, 85])));
  const next = suggestNext(seeded);
  assert.ok(next, 'a lit foundation should open a next step');
  assert.equal(next!.mastery, null, 'never suggest somewhere already visited');
  assert.ok(requires(seeded, next!.id).every(p => (p.mastery ?? 0) >= 50), 'prerequisites must be met');
});

test('every subject present in the data has a colour', () => {
  for (const n of buildSkyGraph().nodes) {
    assert.ok(SUBJECT_HUE[n.subject], `no hue for ${n.subject}`);
  }
});

test('the data still has no cross-subject edges', () => {
  // Documents the honest limit of the current graph: this is why the Sky shows prerequisite
  // chains rather than the cross-subject wonder the concept promised. When someone does the
  // editorial work to link, say, frequency ratios to numeric ratios, this test will fail — and
  // that failure is the signal to redesign the Sky, not to delete the assertion.
  const g = buildSkyGraph();
  const subjectOf = (id: string) => id.split('::')[0];
  const cross = g.edges.filter(e => subjectOf(e.from) !== subjectOf(e.to));
  assert.equal(cross.length, 0,
    `cross-subject edges now exist (${cross.map(e => `${e.from}→${e.to}`).join(', ')}) — the Sky can show them`);
});
