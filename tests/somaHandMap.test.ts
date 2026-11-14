// SOMA hand map: keys and pads as hand strokes on the drum, octaves as drums a fourth apart, the mod
// wheel as the shape of the hand, and which drums get the map by default. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SM } from '../services/melos/instruments/soma/params';
import { defaultHandConfig, handHit, somaHandStrike, SOMA_STROKES } from '../services/melos/instruments/soma/handMap';
import { deserializeSomaPatch, newSomaPatch, serializeSomaPatch, somaHandConfig } from '../services/melos/instruments/soma/patch';

const keys = { enabled: true, layout: 'keys' as const };
const pads = { enabled: true, layout: 'pads' as const };
const get = (ps: Array<[number, number]>, id: number) => ps.find(([k]) => k === id)?.[1];

test('keys: right/left pairs on neighbouring keys, every octave', () => {
  assert.deepEqual(handHit(48, 'keys', 48), { stroke: 'bass', hand: 'R', drum: 0 });
  assert.deepEqual(handHit(49, 'keys', 48), { stroke: 'bass', hand: 'L', drum: 0 });
  assert.equal(handHit(50, 'keys', 48).stroke, 'tone');
  assert.deepEqual([handHit(52, 'keys', 48).stroke, handHit(53, 'keys', 48).stroke], ['slap', 'slap']);
  assert.equal(handHit(60, 'keys', 48).drum, 1, 'an octave up is the next drum');
  assert.equal(handHit(36, 'keys', 48).drum, -1);
});

test('pads: 16 strokes from note 36, the next bank is the next drum', () => {
  assert.deepEqual(handHit(36, 'pads', 48), { stroke: 'bass', hand: 'L', drum: 0 });
  assert.equal(handHit(41, 'pads', 48).stroke, 'slap');
  assert.equal(handHit(52, 'pads', 48).drum, 1);
});

test('strike: drum pitch, position and hand per key; octave = a fourth', () => {
  const base = { [SM.STRIKER_HARDNESS]: 0.5, [SM.STRIKER_MASS]: 0.5, [SM.HAND_BRUSH]: 0.2 };
  const slap = somaHandStrike(52, 0.8, 0.5, keys, 48, base);
  assert.equal(slap.note, 48, 'every key plays the home drum, not its own pitch');
  assert.equal(get(slap.params, SM.STRIKE_POS), SOMA_STROKES.slap.pos);
  assert.equal(get(slap.params, SM.STRIKER_TYPE), SOMA_STROKES.slap.striker);
  assert.notEqual(get(somaHandStrike(48, 0.8, 0.5, keys, 48, base).params, SM.STRIKE_ANGLE), get(somaHandStrike(49, 0.8, 0.5, keys, 48, base).params, SM.STRIKE_ANGLE), 'two hands land apart');
  assert.equal(somaHandStrike(62, 0.8, 0.5, keys, 48, base).note, 53);
  assert.equal(somaHandStrike(37, 0.8, 0.5, pads, 48, base).hit.stroke, 'bass');
});

test('mod wheel: relaxed palm is softer and heavier, tight fingers harder and lighter', () => {
  const base = { [SM.STRIKER_HARDNESS]: 0.5, [SM.STRIKER_MASS]: 0.5, [SM.HAND_BRUSH]: 0.2 };
  const relaxed = somaHandStrike(50, 0.8, 0, keys, 48, base).params;
  const tight = somaHandStrike(50, 0.8, 1, keys, 48, base).params;
  assert.ok(get(relaxed, SM.STRIKER_HARDNESS)! < get(tight, SM.STRIKER_HARDNESS)!);
  assert.ok(get(relaxed, SM.STRIKER_MASS)! > get(tight, SM.STRIKER_MASS)!);
  assert.ok(get(tight, SM.HAND_BRUSH)! > get(relaxed, SM.HAND_BRUSH)!);
});

test('defaults: hand drums on, timpani and concert drums off; a choice is saved with the patch', () => {
  assert.equal(defaultHandConfig('afro-cuban').enabled, true);
  assert.equal(defaultHandConfig('frame-ancient').enabled, true);
  assert.equal(defaultHandConfig('timpani').enabled, false);
  assert.equal(defaultHandConfig('taiko-concert').enabled, false);
  const p = { ...newSomaPatch(), hand: { enabled: true, layout: 'pads' as const } };
  const back = deserializeSomaPatch(serializeSomaPatch(p))!;
  assert.deepEqual(back.hand, { enabled: true, layout: 'pads' });
  assert.deepEqual(somaHandConfig(back), { enabled: true, layout: 'pads' });
  assert.equal(deserializeSomaPatch(serializeSomaPatch(newSomaPatch()))!.hand, undefined, 'no choice = drum default');
});
