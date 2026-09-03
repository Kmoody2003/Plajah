import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateShaderCost, estimateEffectCost, tierFor, COST_THRESHOLDS } from '../services/fabula/effectCost';
import { FX_EFFECTS, getEffect } from '../components/plajahPixels/engine/fx/effects';

const score = (glsl: string) => estimateShaderCost(glsl).score;

describe('Shader cost analysis', () => {
  it('weights work inside a loop by the loop trip count', () => {
    const once = score('vec4 fx(vec2 uv){ return inp(uv); }');
    const many = score('vec4 fx(vec2 uv){ vec4 c = vec4(0.0); for (int i = 0; i < 20; i++){ c += inp(uv); } return c; }');
    assert.ok(many > once * 15, `expected the loop to multiply the cost, got ${once} then ${many}`);
  });

  it('multiplies nested loops together', () => {
    const flat = score('vec4 fx(vec2 uv){ vec4 c = vec4(0.0); for (int i = 0; i < 8; i++){ c += inp(uv); } return c; }');
    const nested = score('vec4 fx(vec2 uv){ vec4 c = vec4(0.0); for (int i = 0; i < 8; i++){ for (int j = 0; j < 8; j++){ c += inp(uv); } } return c; }');
    assert.ok(nested > flat * 6, `nested loops should compound, got ${flat} then ${nested}`);
  });

  it('stops counting a loop once its body closes', () => {
    const inside = score('vec4 fx(vec2 uv){ vec4 c = vec4(0.0); for (int i = 0; i < 50; i++){ c += inp(uv); } return c; }');
    const after = score('vec4 fx(vec2 uv){ vec4 c = vec4(0.0); for (int i = 0; i < 50; i++){ c += vec4(0.0); } return c + inp(uv); }');
    assert.ok(after < inside / 5, `a fetch after the loop must not be multiplied, got ${inside} then ${after}`);
  });

  it('expands helper functions, including work they hide behind another helper', () => {
    // This is the failure that ranked the suite's most expensive effect as its cheapest: all the
    // real work sat two calls deep, so reading only fx() saw almost nothing.
    const direct = score('vec4 fx(vec2 uv){ float v = 0.0; for (int i = 0; i < 30; i++){ v += sin(v) * cos(v); } return vec4(v); }');
    const hidden = score('float leaf(float x){ return sin(x) * cos(x); } float mid(float x){ float v = 0.0; for (int i = 0; i < 30; i++){ v += leaf(v); } return v; } vec4 fx(vec2 uv){ return vec4(mid(1.0)); }');
    assert.ok(hidden > direct * 0.8, `helper work must be counted, direct ${direct} vs hidden ${hidden}`);
  });

  it('counts plain arithmetic, so an ALU-bound shader is not read as free', () => {
    const trivial = score('vec4 fx(vec2 uv){ return inp(uv); }');
    const alu = score('vec4 fx(vec2 uv){ float v = 0.0; for (int i = 0; i < 60; i++){ v = v * 1.03 + 0.7 - v * 0.2; } return inp(uv) * v; }');
    assert.ok(alu > trivial * 10, `arithmetic must count, got ${trivial} then ${alu}`);
  });

  it('ignores a name that is not being called', () => {
    const called = score('vec4 fx(vec2 uv){ return vec4(length(uv)); }');
    const variable = score('vec4 fx(vec2 uv){ float length = uv.x; return vec4(length); }');
    assert.ok(variable < called, `a variable named like a builtin must not count, got ${variable} vs ${called}`);
  });

  it('does not count a function prototype as a definition, and survives an empty shader', () => {
    assert.equal(score(''), 0);
    assert.doesNotThrow(() => score('float helper(float x); vec4 fx(vec2 uv){ return inp(uv); }'));
  });

  it('ignores commented-out work', () => {
    const live = score('vec4 fx(vec2 uv){ vec4 c = vec4(0.0); for (int i = 0; i < 40; i++){ c += inp(uv); } return c; }');
    const dead = score('vec4 fx(vec2 uv){ /* for (int i = 0; i < 40; i++){ c += inp(uv); } */ return inp(uv); }');
    assert.ok(dead < live / 10, `comments must not count, got ${live} then ${dead}`);
  });
});

describe('Cost tiers', () => {
  it('buckets on the published thresholds', () => {
    assert.equal(tierFor(0), 'light');
    assert.equal(tierFor(COST_THRESHOLDS.moderate - 1), 'light');
    assert.equal(tierFor(COST_THRESHOLDS.moderate), 'moderate');
    assert.equal(tierFor(COST_THRESHOLDS.heavy), 'heavy');
  });

  it('ranks the registry the way the GPU actually measured it', () => {
    // Measured on an RTX-class GPU at 1080p with EXT_disjoint_timer_query_webgl2: the raymarched
    // generators cost roughly an order of magnitude more than a colour operation, terrain most of
    // all. The estimate has to reproduce that ORDER; it does not claim to predict milliseconds.
    const cost = (id: string) => estimateEffectCost(getEffect(id)!);
    const terrain = cost('terrain3d');
    const particles = cost('particlefield3d');
    const path = cost('pathextrude3d');
    const blur = cost('problur');
    const invert = cost('invert');

    assert.equal(invert.tier, 'light');
    assert.equal(terrain.tier, 'heavy');
    assert.equal(particles.tier, 'heavy');
    assert.equal(path.tier, 'heavy');
    assert.ok(terrain.score > particles.score, 'terrain3d measured as the most expensive effect');
    assert.ok(Math.min(particles.score, path.score) > blur.score * 4, 'raymarchers must rank well above a blur');
    assert.ok(blur.score > invert.score * 5, 'a blur must rank above a single colour operation');
  });

  it('scores every registered effect without throwing, and keeps heavy effects rare', () => {
    let heavy = 0;
    for (const effect of FX_EFFECTS) {
      const c = estimateEffectCost(effect);
      assert.ok(Number.isFinite(c.score) && c.score >= 0, `${effect.id} produced ${c.score}`);
      if (c.tier === 'heavy') heavy++;
    }
    // A warning everything triggers is a warning nobody reads.
    assert.ok(heavy < FX_EFFECTS.length * 0.12, `${heavy} of ${FX_EFFECTS.length} effects flagged heavy`);
  });
});
