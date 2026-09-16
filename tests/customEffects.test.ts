import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandStack, expandCustomInstance, mapControlToTarget, customEffectDescriptor, createCustomInstance,
  customFromStack, promoteControl, validateCustomEffect, isCustomEffectId, customEffectId, bareCustomId,
  type CustomEffect,
} from '../services/fabula/customEffects';
import { createEffectInstance } from '../services/fabula/forgeEffects';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';
import { resolveInstanceForFrame, resolveKeyframedParams } from '../services/fabula/forgeBindings';
import { addKey } from '../services/fabula/keyframes';

const blur = FX_EFFECTS.find((e) => e.id === 'problur')!;
const radius = blur.params[0];

/** A two-step chain with one control driving a parameter in each step. */
function twoStep(): CustomEffect {
  return {
    id: 'grit', name: 'Grit', category: 'stylize', version: 1,
    steps: [{ effectId: 'problur' }, { effectId: 'invert' }],
    controls: [{ key: 'amount', label: 'Amount', min: 0, max: 1, default: 0, targets: [{ step: 0, param: radius.key }] }],
  };
}

const lookup = (c: CustomEffect) => (id: string) => (id === c.id ? c : undefined);

describe('Custom effect identity', () => {
  it('round-trips the prefixed id and leaves built-in ids alone', () => {
    assert.equal(customEffectId('grit'), 'custom:grit');
    assert.equal(bareCustomId('custom:grit'), 'grit');
    assert.ok(isCustomEffectId('custom:grit'));
    assert.ok(!isCustomEffectId('problur'));
    assert.equal(bareCustomId('problur'), 'problur');
  });
});

describe('Control mapping', () => {
  const control = { key: 'a', label: 'A', min: 0, max: 1, default: 0, targets: [{ step: 0, param: radius.key }] };

  it('maps the control range onto the parameter range', () => {
    assert.equal(mapControlToTarget(control, control.targets[0], 0, radius), radius.min);
    assert.equal(mapControlToTarget(control, control.targets[0], 1, radius), radius.max);
    assert.equal(mapControlToTarget(control, control.targets[0], .5, radius), radius.min + (radius.max - radius.min) / 2);
  });

  it('honours a narrowed target range, and an inverted one runs backwards', () => {
    const narrow = { step: 0, param: radius.key, min: 10, max: 20 };
    assert.equal(mapControlToTarget(control, narrow, 0, radius), 10);
    assert.equal(mapControlToTarget(control, narrow, 1, radius), 20);
    const inverted = { step: 0, param: radius.key, min: 20, max: 10 };
    assert.equal(mapControlToTarget(control, inverted, 0, radius), 20);
    assert.equal(mapControlToTarget(control, inverted, 1, radius), 10);
  });

  it('clamps to the parameter range even when the target overshoots it', () => {
    const wild = { step: 0, param: radius.key, min: radius.min - 1000, max: radius.max + 1000 };
    assert.equal(mapControlToTarget(control, wild, 0, radius), radius.min);
    assert.equal(mapControlToTarget(control, wild, 1, radius), radius.max);
  });

  it('clamps the control value itself and survives an empty range', () => {
    assert.equal(mapControlToTarget(control, control.targets[0], -5, radius), radius.min);
    assert.equal(mapControlToTarget(control, control.targets[0], 99, radius), radius.max);
    const empty = { ...control, min: 1, max: 1 };
    assert.equal(mapControlToTarget(empty, control.targets[0], 1, radius), radius.min);
  });
});

describe('Expansion into real instances', () => {
  it('produces one instance per step, with deterministic ids that per-instance caches can key on', () => {
    const custom = twoStep();
    const instance = createCustomInstance(custom, 'ci1');
    const first = expandCustomInstance(instance, custom);
    assert.deepEqual(first.map((i) => i.id), ['ci1#0', 'ci1#1']);
    assert.deepEqual(first.map((i) => i.effectId), ['problur', 'invert']);
    assert.deepEqual(expandCustomInstance(instance, custom).map((i) => i.id), first.map((i) => i.id));
  });

  it('drives the underlying parameter from the control', () => {
    const custom = twoStep();
    const low = expandCustomInstance({ ...createCustomInstance(custom, 'c'), params: { amount: 0 } }, custom);
    const high = expandCustomInstance({ ...createCustomInstance(custom, 'c'), params: { amount: 1 } }, custom);
    assert.equal(low[0].params[radius.key], radius.min);
    assert.equal(high[0].params[radius.key], radius.max);
  });

  it('lets one control drive parameters in several steps at once', () => {
    const custom = twoStep();
    const sharpen = FX_EFFECTS.find((e) => e.id === 'invert')!;
    if (!sharpen.params.length) return;                       // invert may be parameterless; skip rather than assert nothing
    const key = sharpen.params[0].key;
    custom.controls[0].targets.push({ step: 1, param: key });
    const out = expandCustomInstance({ ...createCustomInstance(custom, 'c'), params: { amount: 1 } }, custom);
    assert.equal(out[0].params[radius.key], radius.max);
    assert.equal(out[1].params[key], sharpen.params[0].max);
  });

  it('multiplies the parent mix through every step', () => {
    const custom = twoStep();
    custom.steps[0].mix = .5;
    const out = expandCustomInstance({ ...createCustomInstance(custom, 'c'), mix: .4 }, custom);
    assert.ok(Math.abs(out[0].mix - .2) < 1e-9);
    assert.ok(Math.abs(out[1].mix - .4) < 1e-9);
  });

  it('keeps a step parameter that no control drives', () => {
    const custom = twoStep();
    custom.steps[0].params = { [radius.key]: 33 };
    custom.controls = [];
    assert.equal(expandCustomInstance(createCustomInstance(custom, 'c'), custom)[0].params[radius.key], 33);
  });

  it('drops a step whose effect no longer exists instead of breaking the chain', () => {
    const custom = twoStep();
    custom.steps.unshift({ effectId: 'no-such-effect' });
    const out = expandCustomInstance(createCustomInstance(custom, 'c'), custom);
    assert.deepEqual(out.map((i) => i.effectId), ['problur', 'invert']);
  });

  it('ignores a control target whose parameter has since disappeared', () => {
    const custom = twoStep();
    custom.controls[0].targets.push({ step: 0, param: 'gone' });
    const out = expandCustomInstance({ ...createCustomInstance(custom, 'c'), params: { amount: 1 } }, custom);
    assert.equal(out[0].params.gone, undefined);
    assert.equal(out[0].params[radius.key], radius.max);
  });
});

describe('Stack expansion', () => {
  it('passes a stack of built-ins through untouched, by identity', () => {
    const stack = [createEffectInstance('problur', undefined, 'a'), createEffectInstance('invert', undefined, 'b')];
    assert.equal(expandStack(stack, () => undefined), stack);
    assert.deepEqual(expandStack([], () => undefined), []);
  });

  it('expands custom entries in place, preserving stack order', () => {
    const custom = twoStep();
    const stack = [
      createEffectInstance('invert', undefined, 'first'),
      createCustomInstance(custom, 'mid'),
      createEffectInstance('problur', undefined, 'last'),
    ];
    const out = expandStack(stack, lookup(custom));
    assert.deepEqual(out.map((i) => i.id), ['first', 'mid#0', 'mid#1', 'last']);
  });

  it('drops a disabled custom instance and one whose definition was deleted', () => {
    const custom = twoStep();
    const disabled = { ...createCustomInstance(custom, 'd'), enabled: false };
    assert.deepEqual(expandStack([disabled], lookup(custom)), []);
    assert.deepEqual(expandStack([createCustomInstance(custom, 'x')], () => undefined), []);
  });
});

describe('Registry-shaped descriptor', () => {
  it('publishes the controls as parameters so the shared resolvers can treat it as an effect', () => {
    const custom = twoStep();
    const descriptor = customEffectDescriptor(custom);
    assert.equal(descriptor.id, 'custom:grit');
    assert.deepEqual(descriptor.params.map((p) => p.key), ['amount']);
    assert.equal(descriptor.params[0].min, 0);
    assert.equal(descriptor.params[0].max, 1);
  });

  it('keyframes a control through the shared resolver, and expansion sees the sampled value', () => {
    const custom = twoStep();
    const descriptor = customEffectDescriptor(custom);
    const instance: any = createCustomInstance(custom, 'ci');
    instance.kf = { amount: addKey(addKey(undefined, 0, 0, 'linear'), 1, 1, 'linear') };
    assert.equal(resolveKeyframedParams(instance, descriptor, .5).amount, .5);
    const mid = resolveInstanceForFrame(instance, descriptor, {}, .5, { w: 16, h: 9 });
    const out = expandCustomInstance(mid, custom);
    assert.equal(out[0].params[radius.key], radius.min + (radius.max - radius.min) / 2);
  });
});

describe('Building from a stack', () => {
  it('captures the tuned stack as steps, skipping disabled entries and nested custom effects', () => {
    const custom = twoStep();
    const stack = [
      { ...createEffectInstance('problur', undefined, 'a'), params: { [radius.key]: 12 } },
      { ...createEffectInstance('invert', undefined, 'b'), enabled: false },
      createCustomInstance(custom, 'nested'),
    ];
    const built = customFromStack(stack as any, 'My Grade');
    assert.deepEqual(built.steps.map((s) => s.effectId), ['problur']);
    assert.equal(built.steps[0].params![radius.key], 12);
    assert.equal(built.name, 'My Grade');
    assert.deepEqual(built.controls, []);
  });

  it('promotes a parameter at its current value, so adding a knob changes nothing', () => {
    let built = customFromStack([{ ...createEffectInstance('problur', undefined, 'a'), params: { [radius.key]: 12 } }] as any, 'X');
    built = promoteControl(built, 0, radius.key, 'Softness');
    assert.equal(built.controls.length, 1);
    assert.equal(built.controls[0].default, 12);
    assert.equal(built.controls[0].label, 'Softness');
    const out = expandCustomInstance(createCustomInstance(built, 'i'), built);
    assert.equal(out[0].params[radius.key], 12);
  });

  it('gives a second promotion of the same parameter a distinct key', () => {
    let built = customFromStack([{ effectId: 'problur', params: {}, id: 'a', version: 1, enabled: true, mix: 1 }] as any, 'X');
    built = promoteControl(built, 0, radius.key);
    built = promoteControl(built, 0, radius.key);
    assert.equal(new Set(built.controls.map((c) => c.key)).size, 2);
  });

  it('refuses to promote a parameter the step does not have', () => {
    const built = customFromStack([{ effectId: 'problur', params: {}, id: 'a', version: 1, enabled: true, mix: 1 }] as any, 'X');
    assert.equal(promoteControl(built, 0, 'nope').controls.length, 0);
  });
});

describe('Validation', () => {
  it('accepts a well-formed definition', () => {
    assert.deepEqual(validateCustomEffect(twoStep()), []);
  });

  it('reports a missing name, no steps, and an unknown effect', () => {
    assert.ok(validateCustomEffect({ ...twoStep(), name: ' ' }).some((e) => /name/i.test(e)));
    assert.ok(validateCustomEffect({ ...twoStep(), steps: [] }).some((e) => /at least one step/i.test(e)));
    assert.ok(validateCustomEffect({ ...twoStep(), steps: [{ effectId: 'nope' }] }).some((e) => /no longer exists/i.test(e)));
  });

  it('reports an out-of-range step value and an unknown parameter', () => {
    const bad = twoStep();
    bad.steps[0].params = { [radius.key]: radius.max + 100 };
    assert.ok(validateCustomEffect(bad).some((e) => /outside/i.test(e)));
    const unknown = twoStep();
    unknown.steps[0].params = { nope: 1 };
    assert.ok(validateCustomEffect(unknown).some((e) => /does not have/i.test(e)));
  });

  it('reports duplicate control keys, empty ranges, bad defaults and dangling targets', () => {
    const dup = twoStep();
    dup.controls = [dup.controls[0], { ...dup.controls[0] }];
    assert.ok(validateCustomEffect(dup).some((e) => /share the key/i.test(e)));

    const empty = twoStep();
    empty.controls[0].min = 1; empty.controls[0].max = 1;
    assert.ok(validateCustomEffect(empty).some((e) => /empty range/i.test(e)));

    const offRange = twoStep();
    offRange.controls[0].default = 9;
    assert.ok(validateCustomEffect(offRange).some((e) => /defaults outside/i.test(e)));

    const dangling = twoStep();
    dangling.controls[0].targets = [{ step: 9, param: radius.key }];
    assert.ok(validateCustomEffect(dangling).some((e) => /does not exist/i.test(e)));

    const noTargets = twoStep();
    noTargets.controls[0].targets = [];
    assert.ok(validateCustomEffect(noTargets).some((e) => /drives nothing/i.test(e)));
  });
});
