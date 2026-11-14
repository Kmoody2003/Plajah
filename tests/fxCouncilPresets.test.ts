import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';
import { PHASE3_TRANSITIONS } from '../components/plajahPixels/engine/fx/phase3Transitions';
import { councilPresetsForEffect, councilPresetsForParams, councilPresetsForTransition, classifyParam, FX_COUNCIL_LENSES, FX_MUSIC_LENSES } from '../services/fabula/fxCouncilPresets';

describe('Council FX preset bank', () => {
  it('gives almost every effect a council bank with unique, non-colliding ids', () => {
    let total = 0; const missing: string[] = [];
    for (const e of FX_EFFECTS) {
      const council = councilPresetsForEffect(e);
      total += council.length;
      if (!council.length) missing.push(e.id);
      const ids = [...(e.presets || []).map(p => p.id), ...council.map(p => p.id)];
      assert.equal(new Set(ids).size, ids.length, `duplicate preset id in ${e.id}`);
    }
    assert.ok(total >= FX_EFFECTS.length * 10, `only ${total} council presets`);
    // An effect whose every control is a switch (e.g. mirror axis) legitimately gets none.
    assert.ok(missing.length <= 3, `no council presets for ${missing.join(', ')}`);
  });

  it('keeps every value inside the declared range', () => {
    for (const e of FX_EFFECTS) for (const pr of councilPresetsForEffect(e)) for (const p of e.params) {
      const v = pr.params[p.key];
      assert.ok(v >= p.min - 1e-9 && v <= p.max + 1e-9, `${e.id}/${pr.id}/${p.key}=${v} outside [${p.min}, ${p.max}]`);
    }
    for (const t of PHASE3_TRANSITIONS) for (const pr of councilPresetsForParams(t.id, t.name, t.params)) for (const p of t.params) {
      const v = pr.params[p.key];
      assert.ok(v >= p.min - 1e-9 && v <= p.max + 1e-9, `${t.id}/${pr.id}/${p.key}=${v}`);
    }
  });

  it('never moves drivers or switches — a preset is a look, not a state part-way through', () => {
    for (const [id, key] of [['shatterpieces', 'progress'], ['carddance', 'amount']] as const) {
      const e = FX_EFFECTS.find(x => x.id === id)!;
      for (const pr of councilPresetsForEffect(e)) assert.equal(pr.params[key], 0, `${id}/${pr.id}`);
    }
    assert.equal(classifyParam({ key: 'seed', default: 1 }), null);
    assert.equal(classifyParam({ key: 'direction', default: 1 }), null);
    assert.equal(classifyParam({ key: 'sat', label: 'Saturation', default: 1 }), 'sat');
  });

  it('credits a real lens and differs from the defaults', () => {
    const lensIds = new Set([...FX_COUNCIL_LENSES, ...FX_MUSIC_LENSES].map(l => l.member));
    for (const e of FX_EFFECTS.slice(0, 40)) for (const pr of councilPresetsForEffect(e)) {
      assert.ok(lensIds.has(pr.council.member));
      assert.ok(e.params.some(p => pr.params[p.key] !== p.default), `${e.id}/${pr.id} equals defaults`);
    }
  });

  it('is deterministic', () => {
    const e = FX_EFFECTS.find(x => x.id === 'cinematiccolor')!;
    const a = councilPresetsForParams(e.id, e.name, e.params), b = councilPresetsForParams(e.id, e.name, e.params);
    assert.deepEqual(a, b);
  });

  it('covers range-less inline transitions by inferring a span from the default', () => {
    const t = { id: 'film-dissolve', name: 'Film Dissolve', defaults: { softness: .5, bloom: .08 }, presets: [] };
    const out = councilPresetsForTransition(t);
    assert.ok(out.length >= 6);
    for (const p of out) assert.ok(p.params.softness >= 0 && p.params.bloom >= 0);
  });
});
