// Tests for the in-app Motion switch: the preference store and how it reaches the generated art.
//
//   npx tsx --test tests/motionPref.test.ts

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_KEY, applyProfileMotion, getMotionPref, isMotionPref, motionAnimates, readMotionPref, registerMotionPersist, setMotionPref, subscribeMotion } from '../services/motionPref';
import { chalkBoard, getArtMotion } from '../services/creatorArt';

const decode = (u: string) => decodeURIComponent(u.slice(u.indexOf(',') + 1));
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

beforeEach(() => setMotionPref('auto', mem()));

test('auto follows the device; on and off override it', () => {
  assert.equal(motionAnimates('auto', false), true);
  assert.equal(motionAnimates('auto', true), false);
  assert.equal(motionAnimates('on', true), true);
  assert.equal(motionAnimates('off', false), false);
});

test('only the three known values are accepted, and bad stored values fall back to auto', () => {
  assert.ok(isMotionPref('auto') && isMotionPref('on') && isMotionPref('off'));
  assert.ok(!isMotionPref('yes') && !isMotionPref(null));
  const s = mem(); s.setItem(MOTION_KEY, 'banana');
  assert.equal(readMotionPref(s), 'auto');
  s.setItem(MOTION_KEY, 'on');
  assert.equal(readMotionPref(s), 'on');
});

test('setting the preference persists it, notifies listeners and reaches the art', () => {
  const s = mem(); let calls = 0;
  const off = subscribeMotion(() => { calls++; });
  setMotionPref('on', s);
  assert.equal(getMotionPref(), 'on');
  assert.equal(s.m.get(MOTION_KEY), 'on');
  assert.equal(getArtMotion(), 'on');
  assert.equal(calls, 1);
  off();
  setMotionPref('off', s);
  assert.equal(calls, 1, 'unsubscribed listeners are not called');
});

test('storage that throws never breaks the switch', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readMotionPref(broken as any), 'auto');
  setMotionPref('on', broken as any);
  assert.equal(getMotionPref(), 'on');
});

test('art: auto keeps the device rule, on removes it, off is fully static', () => {
  setMotionPref('auto', mem());
  const auto = decode(chalkBoard('Business'));
  assert.ok(auto.includes('@keyframes') && auto.includes('prefers-reduced-motion'));
  setMotionPref('on', mem());
  const on = decode(chalkBoard('Business'));
  assert.ok(on.includes('@keyframes') && !on.includes('prefers-reduced-motion'), 'overrides the device setting');
  setMotionPref('off', mem());
  const off = decode(chalkBoard('Business'));
  assert.ok(!off.includes('@keyframes'));
  assert.ok(off.includes('filter="url(#ch)"'), 'static art keeps the chalk roughness');
});

test('art cache does not leak one mode into another', () => {
  setMotionPref('on', mem()); const a = chalkBoard('Music');
  setMotionPref('off', mem()); const b = chalkBoard('Music');
  setMotionPref('on', mem()); const c = chalkBoard('Music');
  assert.notEqual(a, b);
  assert.equal(a, c);
});

test('a choice is saved to the profile; applying the saved profile value never writes back', () => {
  const saved: string[] = [];
  const off = registerMotionPersist(p => { saved.push(p); });
  setMotionPref('on', mem());
  assert.deepEqual(saved, ['on']);
  assert.equal(applyProfileMotion('off', mem()), true, 'profile value applied');
  assert.equal(getMotionPref(), 'off');
  assert.deepEqual(saved, ['on'], 'no write-back loop');
  assert.equal(applyProfileMotion('off', mem()), false, 'unchanged value is a no-op');
  assert.equal(applyProfileMotion('banana', mem()), false, 'garbage is ignored');
  assert.equal(applyProfileMotion(undefined, mem()), false);
  off();
  setMotionPref('auto', mem());
  assert.deepEqual(saved, ['on'], 'unregistered: nothing saved');
});

test('a failing profile save never breaks the switch', () => {
  const off = registerMotionPersist(() => { throw new Error('offline'); });
  setMotionPref('on', mem());
  assert.equal(getMotionPref(), 'on');
  off();
});
