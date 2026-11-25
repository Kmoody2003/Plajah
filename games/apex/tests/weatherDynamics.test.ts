import test from 'node:test';
import assert from 'node:assert/strict';
import { WetRoad, waterContact } from '../src/wetRoad';
import { LensRain } from '../src/lensRain';

test('wet roads retain water after rain and dry faster in sun and wind', () => {
  const road = new WetRoad();
  for (let i = 0; i < 3600; i++) road.update(1 / 60, 1, 0.1, 0.3);
  assert.ok(road.wetness > 0.9);
  assert.ok(road.pooling > 0.3);
  const wet = road.wetness, pool = road.pooling;
  road.update(1 / 60, 0, 1, 1);
  assert.ok(road.wetness > wet - 0.001 && road.pooling > pool - 0.001);
  const shade = new WetRoad(); shade.wetness = road.wetness; shade.pooling = road.pooling;
  for (let i = 0; i < 1800; i++) { road.update(1 / 60, 0, 1, 1); shade.update(1 / 60, 0, 0, 0); }
  assert.ok(road.wetness < shade.wetness);
  assert.ok(road.wetness >= 0 && road.pooling >= 0);
});

test('water buildup is consistent at 30 and 120 Hz', () => {
  const a = new WetRoad(), b = new WetRoad();
  for (let i = 0; i < 30 * 90; i++) a.update(1 / 30, 0.75, 0.2, 0.4);
  for (let i = 0; i < 120 * 90; i++) b.update(1 / 120, 0.75, 0.2, 0.4);
  assert.ok(Math.abs(a.wetness - b.wetness) < 0.002);
  assert.ok(Math.abs(a.pooling - b.pooling) < 0.002);
});

test('aquaplaning needs standing water and speed; unloaded tyres lose contact earlier', () => {
  assert.equal(waterContact(70, 0, 0).hydro, 0);
  assert.equal(waterContact(4, 1, 6).hydro, 0);
  assert.ok(waterContact(40, 1, 6).hydro > waterContact(20, 1, 6).hydro);
  assert.ok(waterContact(25, 1, 4, 0.55).hydro > waterContact(25, 1, 4, 1.4).hydro);
  assert.ok(waterContact(40, 1, 6).grip < waterContact(40, 1, 0).grip);
});

test('lens drops are sparse, leave the central view clear, drain, and reset outside driving', () => {
  let seed = 98; const random = (): number => (seed = seed * 16807 % 2147483647) / 2147483647;
  const lens = new LensRain(random);
  let peak = 0, seen = 0;
  for (let i = 0; i < 60 * 180; i++) {
    lens.update(1 / 60, 1, 50, true, 16 / 9);
    const drops = lens.uniforms.uLensDrops.value.filter((v) => v.w > 0);
    peak = Math.max(peak, drops.length); if (drops.length) seen++;
    assert.ok(drops.every((v) => v.x < 0.35 || v.x > 0.65 || v.y < 0.25 || v.y > 0.75));
  }
  assert.ok(peak <= 6 && peak > 0 && seen > 0);
  for (let i = 0; i < 60 * 15; i++) lens.update(1 / 60, 0, 0, true, 16 / 9);
  assert.ok(lens.uniforms.uLensDrops.value.every((v) => v.w === 0));
  lens.update(0.1, 1, 50, false, 16 / 9);
  assert.ok(lens.uniforms.uLensDrops.value.every((v) => v.w === 0));
});
