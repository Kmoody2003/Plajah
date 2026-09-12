import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FORGE_LOOKS, LOOK_CATEGORIES, instantiateLook, lookFromStack, validateLook } from '../services/fabula/forgeLooks';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';

describe('Forge Looks', () => {
  it('ships built-in looks that reference real effects, presets and in-range params', () => {
    assert.ok(FORGE_LOOKS.length >= 20);
    const problems = FORGE_LOOKS.flatMap(validateLook);
    assert.deepEqual(problems, [], problems.join('\n'));
  });

  it('keeps look ids unique and categories known', () => {
    const ids = FORGE_LOOKS.map(l => l.id);
    assert.equal(new Set(ids).size, ids.length);
    const cats = new Set(LOOK_CATEGORIES.map(c => c.id));
    for (const l of FORGE_LOOKS) {
      assert.ok(cats.has(l.category), `${l.id} has category ${l.category}`);
      assert.ok(l.description.length > 20, `${l.id} needs a real description`);
      assert.ok(l.steps.length >= 2, `${l.id} is a single effect, not a look`);
    }
    for (const c of LOOK_CATEGORIES) assert.ok(FORGE_LOOKS.some(l => l.category === c.id), `no look in ${c.id}`);
  });

  it('instantiates a look into an ordered, editable effect stack', () => {
    const look = FORGE_LOOKS.find(l => l.id === 'teal-amber')!;
    const stack = instantiateLook(look, (id, i) => `fx-${i}-${id}`);
    assert.equal(stack.length, look.steps.length);
    assert.deepEqual(stack.map(s => s.effectId), look.steps.map(s => s.effectId));
    assert.equal(stack[0].presetId, 'teal-amber');
    assert.equal(stack[1].mix, .5);
    assert.equal(stack[0].mix, 1);
    assert.ok(stack.every(s => s.enabled));
    // deterministic given the same id factory
    assert.deepEqual(stack, instantiateLook(look, (id, i) => `fx-${i}-${id}`));
    // every instantiated param is a real param of its effect
    for (const inst of stack) {
      const effect = FX_EFFECTS.find(e => e.id === inst.effectId)!;
      for (const key of Object.keys(inst.params)) assert.ok(effect.params.some(p => p.key === key), `${inst.effectId}.${key}`);
    }
  });

  it('applies param overrides on top of a preset and drops the preset label', () => {
    const look = { id: 'x', name: 'X', category: 'cinematic' as const, description: '', steps: [{ effectId: 'regrain', presetId: 'fine-35', params: { amount: 0.5 } }] };
    const [inst] = instantiateLook(look, () => 'i1');
    assert.equal(inst.params.amount, 0.5);
    assert.equal(inst.presetId, undefined);
    assert.deepEqual(validateLook(look), []);
  });

  it('round-trips a clip stack into a saveable look', () => {
    const source = instantiateLook(FORGE_LOOKS.find(l => l.id === 'noir')!, (id, i) => `s${i}`);
    const look = lookFromStack(source, 'My Show Look', 'genre', 'from a clip');
    assert.equal(look.steps.length, source.length);
    assert.deepEqual(look.steps.map(s => s.effectId), source.map(s => s.effectId));
    assert.deepEqual(validateLook(look), []);
    assert.ok(look.id.startsWith('user-my-show-look-'));
    // mixes below 1 survive the round trip; a full-strength step stays unmarked
    assert.equal(look.steps[1].mix, .7);
    assert.equal(look.steps[0].mix, undefined);
  });

  it('reports problems instead of throwing on a broken look', () => {
    const bad = { id: 'bad', name: 'Bad', category: 'genre' as const, description: '', steps: [{ effectId: 'nope' }, { effectId: 'regrain', presetId: 'ghost' }, { effectId: 'regrain', params: { notAParam: 1 } }, { effectId: 'regrain', mix: 4 }] };
    const problems = validateLook(bad);
    assert.equal(problems.length, 4);
    assert.match(problems[0], /unknown effect/);
    assert.match(problems[1], /unknown preset/);
    assert.match(problems[2], /unknown param/);
    assert.match(problems[3], /mix/);
  });
});
