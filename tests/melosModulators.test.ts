// Parameter animation: the value function, the math tables, probability + randomness, the attach
// gesture's doc-diff, and the promise a bounce leans on — same inputs, same value, in any order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURVES, WAVES, curveById, diffNumericLeaves, modTargetKey, overlayPadHit, modulatorAmount, modulatorPoints, modulatorValue, newModulator, paramWrites, targetFromPath, waveById,
  type ModTarget, type Modulator,
} from '../services/melos/beats/modulators';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc';

const T: ModTarget = { kind: 'param', trackId: 't', id: 100 };
const mod = (over: Partial<Modulator> = {}): Modulator => ({ ...newModulator(T, 'Cutoff', 0, 1), seed: 42, ...over });

test('tables: every wave and curve stays in 0..1, across phases and cycles', () => {
  const rand = (c: number, s = 0) => { const x = Math.sin(c * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
  for (const w of WAVES) {
    for (let i = 0; i <= 40; i++) {
      const v = w.fn({ phase: i / 41, cycle: i % 7, rand });
      assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${w.id} ${i} = ${v}`);
    }
  }
  for (const c of CURVES) {
    for (const amt of [0, 0.3, 1]) {
      for (let i = 0; i <= 20; i++) {
        const v = c.fn(i / 20, amt);
        assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${c.id} ${amt} ${i} = ${v}`);
      }
    }
  }
  assert.equal(new Set(WAVES.map((w) => w.id)).size, WAVES.length);
  assert.equal(new Set(CURVES.map((c) => c.id)).size, CURVES.length);
});

test('the asked-for waves exist and have the right shape', () => {
  const at = (id: string, phase: number) => waveById(id).fn({ phase, cycle: 0, rand: () => 0.5 });
  assert.ok(Math.abs(at('sine', 0)) < 1e-9);
  assert.ok(Math.abs(at('sine', 0.5) - 1) < 1e-9);
  assert.equal(at('triangle', 0.5), 1);
  assert.equal(at('saw', 0), 1);
  assert.equal(at('ramp', 0.75), 0.75);
  assert.equal(at('square', 0.25), 1);
  assert.equal(at('square', 0.75), 0);
  for (const id of ['sh', 'smooth']) assert.equal(waveById(id).id, id);
});

test('value moves within the set range', () => {
  const m = mod({ min: 200, max: 800, syncBeats: 1 });
  assert.ok(Math.abs(modulatorValue(m, 0, 0) - 200) < 1e-6);
  assert.ok(Math.abs(modulatorValue(m, 0.5, 0) - 800) < 1e-6);
  for (let b = 0; b < 8; b += 0.03) {
    const v = modulatorValue(m, b, 0);
    assert.ok(v >= 200 && v <= 800);
  }
});

test('synced follows beats, free follows seconds', () => {
  const synced = mod({ syncBeats: 2 });
  assert.equal(modulatorAmount(synced, 1, 999), modulatorAmount(synced, 1, 0));
  const free = mod({ syncBeats: 0, rateHz: 2 });
  assert.equal(modulatorAmount(free, 999, 0.25), modulatorAmount(free, 0, 0.25));
  assert.ok(Math.abs(modulatorAmount(free, 0, 0.25) - 1) < 1e-9, 'half a cycle in at 2 Hz');
});

test('phase offsets the cycle', () => {
  assert.ok(Math.abs(modulatorAmount(mod({ phase: 0.5 }), 0, 0) - 1) < 1e-9);
});

test('stateless: any beat, any order, always the same value — a seek or a bounce cannot differ', () => {
  for (const wave of WAVES) {
    const m = mod({ wave: wave.id, probability: 0.6, randomness: 0.5, curve: 'scurve' });
    const beats = Array.from({ length: 50 }, (_, i) => i * 0.37);
    const fwd = beats.map((b) => modulatorAmount(m, b, b / 2));
    const rev = [...beats].reverse().map((b) => modulatorAmount(m, b, b / 2)).reverse();
    assert.deepEqual(fwd, rev, wave.id);
  }
});

test('probability: skipped cycles sit at rest, about that share of the time', () => {
  const m = mod({ probability: 0.5, rest: 0.5, wave: 'square' });
  let resting = 0;
  const N = 800;
  for (let c = 0; c < N; c++) if (modulatorAmount(m, c + 0.25, 0) === 0.5) resting++;
  assert.ok(resting > N * 0.4 && resting < N * 0.6, String(resting));
  assert.equal(modulatorAmount(mod({ probability: 0, rest: 0.25 }), 3.5, 0), 0.25);
  // Whole cycle, not per sample: a skipped cycle is still for its whole length.
  const held = Array.from({ length: 10 }, (_, i) => modulatorAmount(mod({ probability: 0, rest: 0.1 }), 5 + i / 10, 0));
  assert.ok(held.every((v) => v === 0.1));
});

test('randomness: 0 repeats exactly, more makes cycles differ', () => {
  const cycle = (m: Modulator, c: number) => Array.from({ length: 16 }, (_, i) => modulatorAmount(m, c + i / 16, 0));
  assert.deepEqual(cycle(mod({ randomness: 0 }), 0), cycle(mod({ randomness: 0 }), 7));
  assert.notDeepEqual(cycle(mod({ randomness: 1 }), 0), cycle(mod({ randomness: 1 }), 7));
  const inRange = Array.from({ length: 200 }, (_, i) => modulatorAmount(mod({ randomness: 1 }), i * 0.13, 0));
  assert.ok(inRange.every((v) => v >= 0 && v <= 1));
});

test('curves shape the motion: exponential holds low longer, invert flips', () => {
  assert.ok(curveById('exp').fn(0.5, 1) < 0.2);
  assert.ok(curveById('log').fn(0.5, 1) > 0.7);
  assert.equal(curveById('invert').fn(0.2, 1), 0.8);
  assert.ok(Math.abs(curveById('linear').fn(0.37, 1) - 0.37) < 1e-12);
  const sine = mod({ wave: 'ramp', curve: 'exp', curveAmt: 1 });
  assert.ok(modulatorAmount(sine, 0.5, 0) < 0.2);
});

test('an unknown wave or curve (a newer project on an older build) falls back, never throws', () => {
  assert.doesNotThrow(() => modulatorAmount(mod({ wave: 'from-the-future', curve: 'also-new' }), 1, 1));
});

test('print points cover the range the bounce renders', () => {
  const pts = modulatorPoints(mod({ syncBeats: 1 }), 0, 4, (b) => b / 2);
  assert.equal(pts[0].beat, 0);
  assert.ok(pts[pts.length - 1].beat >= 3.96);
  assert.ok(pts.every((p) => p.value >= 0 && p.value <= 1));
});

test('a stored modulator survives the trip through JSON', () => {
  const doc = newGrooveDoc('j');
  doc.modulators = [mod({ wave: 'golden', curve: 'fold', probability: 0.4, randomness: 0.3 })];
  const back = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(back.modulators, doc.modulators);
  assert.equal(modulatorAmount(back.modulators[0], 3.3, 1.1), modulatorAmount(doc.modulators[0], 3.3, 1.1));
});

test('a knob that writes several engine values animates all of them, in their own units', () => {
  const t: ModTarget = { kind: 'param', trackId: 't', id: 1, knobBase: 0.5, links: [{ id: 1, base: 0.5, slope: 1 }, { id: 2, base: 100, slope: -40 }] };
  assert.deepEqual(paramWrites(t as Extract<ModTarget, { kind: 'param' }>, 0.75), [[1, 0.75], [2, 90]]);
});

test('attach: a doc edit traces to its target', () => {
  const doc = newGrooveDoc('d');
  doc.arrangement.unshift({ id: 'tr', kind: 'audio', name: 'A', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0, clips: [], inserts: [{ id: 'fx1', type: 'delay', on: true, params: { mix: 0.3 } }] });
  const after = JSON.parse(JSON.stringify(doc));
  after.arrangement[0].inserts[0].params.mix = 0.4;
  after.updatedAt = 99;
  const d = diffNumericLeaves(doc, after);
  assert.equal(d.length, 1, 'updatedAt ignored');
  assert.deepEqual(targetFromPath(after, d[0].path), { kind: 'fx', scope: 'track', owner: 'tr', fxId: 'fx1', param: 'mix' });

  assert.deepEqual(targetFromPath(after, ['arrangement', 0, 'gainDb']), { kind: 'track', trackId: 'tr', target: { kind: 'volume' } });
  assert.deepEqual(targetFromPath(after, ['arrangement', 0, 'sends', 1]), { kind: 'track', trackId: 'tr', target: { kind: 'send', index: 1 } });
  assert.deepEqual(targetFromPath(after, ['kit', 3, 'pan']), { kind: 'pad', padIdx: 3, field: 'pan' });
  assert.equal(targetFromPath(after, ['bpm']), null);
  after.mixer.groups[1].inserts = [{ id: 'g', type: 'x', on: true, params: { a: 1 } }];
  assert.deepEqual(targetFromPath(after, ['mixer', 'groups', 1, 'inserts', 0, 'params', 'a']), { kind: 'fx', scope: 'group', owner: '1', fxId: 'g', param: 'a' });
});

test('target keys are stable and distinct', () => {
  const keys = [T, { kind: 'param', trackId: 't', id: 101 }, { kind: 'track', trackId: 't', target: { kind: 'volume' } }, { kind: 'track', trackId: 't', target: { kind: 'send', index: 1 } }, { kind: 'pad', padIdx: 1, field: 'pan' }]
    .map((t) => modTargetKey(t as ModTarget));
  assert.equal(new Set(keys).size, keys.length);
});

test('per-hit modulator: laid over for one strike, doc back exactly as it was', () => {
  const doc = newGrooveDoc('h');
  doc.kit[0] = { ...doc.kit[0], env: { ...doc.kit[0].env, decay: 0.2 } };
  doc.modulators = [{ ...newModulator({ kind: 'padHit', padIdx: 0, path: ['env', 'decay'] }, 'Decay', 0, 1), wave: 'ramp', syncBeats: 1, seed: 1 }];
  const undo = overlayPadHit(doc, 0, 0.5, 0);
  assert.equal(doc.kit[0].env.decay, 0.5);
  undo!();
  assert.equal(doc.kit[0].env.decay, 0.2);
  assert.equal(overlayPadHit(doc, 1, 0.5, 0), null, 'other pads untouched');
  doc.modulators[0].on = false;
  assert.equal(overlayPadHit(doc, 0, 0.5, 0), null, 'off is off');
});

test('attach: patch params, macros, pad settings and faders all trace', () => {
  const doc = newGrooveDoc('p');
  doc.arrangement.unshift({ id: 'i', kind: 'instrument', name: 'I', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0, clips: [] });
  assert.deepEqual(targetFromPath(doc, ['arrangement', 0, 'instrument', 'patch', 'params', '700']), { kind: 'param', trackId: 'i', id: 700 });
  assert.deepEqual(targetFromPath(doc, ['arrangement', 0, 'instrument', 'patch', 'macros', 2, 'value']), { kind: 'track', trackId: 'i', target: { kind: 'macro', index: 2 } });
  assert.deepEqual(targetFromPath(doc, ['kit', 0, 'drumSynth', 'tune']), { kind: 'padHit', padIdx: 0, path: ['drumSynth', 'tune'] });
  assert.deepEqual(targetFromPath(doc, ['mixer', 'groups', 2, 'gainDb']), { kind: 'mixer', scope: 'group', index: 2 });
  assert.deepEqual(targetFromPath(doc, ['mixer', 'master', 'gainDb']), { kind: 'mixer', scope: 'master', index: 0 });
  assert.equal(targetFromPath(doc, ['kit', 0, 'sends', 0]), null);
});
