// customEffects — user-authored effects (the Sapphire S_Effect idea).
//
// A LOOK applies a stack and then gets out of the way; editing it afterwards means editing every
// effect in it. A CUSTOM EFFECT keeps the chain but hides it behind a handful of controls the
// author names themselves — "Grit", "Bloom", "Damage" — each wired to parameters across several
// underlying effects at once. It shows up in the library as one effect with its own sliders.
//
// It reaches the renderer by EXPANDING into ordinary ForgeEffectInstances before anything else
// looks at the stack. Nothing new arrives at the compositor, so monitor/export parity is free —
// the same property that makes looks safe.
//
// Control → parameter mapping is a straight range remap: a control at its own minimum drives every
// target to that target's low end, and at its maximum to the high end. Targets may narrow that
// range (`min`/`max`) or run backwards (min > max), which is how one "Damage" knob can raise noise
// while it lowers sharpness.
import { FX_EFFECTS, type FxEffect, type FxParam } from '../../components/plajahPixels/engine/fx/effects';
import { effectDefaults, resolvePreset, type ForgeEffectInstance } from './forgeEffects';
import type { LookStep } from './forgeLooks';

/** Instances of a custom effect carry this prefix in their effectId. */
export const CUSTOM_PREFIX = 'custom:';

export interface ControlTarget {
  /** Index into the custom effect's steps. */
  step: number;
  /** Parameter key on that step's effect. */
  param: string;
  /** Target range ends. Default to the parameter's own declared range; may be inverted. */
  min?: number;
  max?: number;
}

export interface CustomControl {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  targets: ControlTarget[];
}

export interface CustomEffect {
  id: string;
  name: string;
  category: string;
  description?: string;
  version: number;
  steps: LookStep[];
  controls: CustomControl[];
  /** Epoch ms. */
  saved?: number;
}

export const isCustomEffectId = (effectId: string): boolean => effectId.startsWith(CUSTOM_PREFIX);
export const customEffectId = (id: string): string => `${CUSTOM_PREFIX}${id}`;
export const bareCustomId = (effectId: string): string => (isCustomEffectId(effectId) ? effectId.slice(CUSTOM_PREFIX.length) : effectId);

const findEffect = (id: string): FxEffect | undefined => FX_EFFECTS.find((e) => e.id === id);
const findParam = (effect: FxEffect | undefined, key: string): FxParam | undefined => effect?.params.find((p) => p.key === key);

/**
 * A registry-shaped view of a custom effect, so the inspector, the keyframe resolver and the
 * track-binding resolver can all treat it exactly like a built-in one. It has no shader of its
 * own: it is expanded away before any renderer sees it.
 */
export function customEffectDescriptor(custom: CustomEffect): FxEffect {
  return {
    id: customEffectId(custom.id),
    name: custom.name,
    category: (custom.category || 'utility') as FxEffect['category'],
    version: custom.version ?? 1,
    summary: custom.description || `User-built chain of ${custom.steps.length} effects.`,
    params: custom.controls.map((c) => ({ key: c.key, label: c.label, min: c.min, max: c.max, default: c.default, step: c.step ?? 0.01 })),
    presets: [],
    glsl: '',
  } as FxEffect;
}

/**
 * Remap a control value onto one target parameter's range. The caller supplies the target's
 * parameter definition, which is what supplies the default range and the final clamp.
 */
export function mapControlToTarget(control: CustomControl, target: ControlTarget, value: number, param?: FxParam): number {
  const span = control.max - control.min;
  const t = span === 0 ? 0 : (Math.max(control.min, Math.min(control.max, value)) - control.min) / span;
  const lo = target.min ?? param?.min ?? 0;
  const hi = target.max ?? param?.max ?? 1;
  const mapped = lo + (hi - lo) * t;
  // Clamp to the PARAMETER's real range, not the target's, so an inverted or over-wide target
  // still cannot push a shader outside what it declared.
  if (!param) return mapped;
  return Math.max(param.min, Math.min(param.max, mapped));
}

/**
 * Expand ONE custom-effect instance into the real instances it stands for.
 *
 * Step instance ids are derived deterministically from the parent (`<id>#<n>`) so every
 * per-instance cache downstream — temporal history, aux textures, rasterised masks — stays keyed
 * to the same step across frames.
 */
export function expandCustomInstance(instance: ForgeEffectInstance, custom: CustomEffect): ForgeEffectInstance[] {
  const out: ForgeEffectInstance[] = [];
  for (let i = 0; i < custom.steps.length; i++) {
    const step = custom.steps[i];
    const effect = findEffect(step.effectId);
    if (!effect) continue;                                  // a missing effect drops its step, not the chain
    const preset = step.presetId ? resolvePreset(effect, step.presetId) : undefined;
    const params: Record<string, number> = { ...effectDefaults(effect), ...(preset?.params || {}), ...(step.params || {}) };
    for (const control of custom.controls) {
      const value = instance.params?.[control.key] ?? control.default;
      for (const target of control.targets) {
        if (target.step !== i) continue;
        const param = findParam(effect, target.param);
        if (!param) continue;                               // stale target after an effect changed
        params[target.param] = mapControlToTarget(control, target, value, param);
      }
    }
    out.push({
      id: `${instance.id}#${i}`,
      effectId: step.effectId,
      version: effect.version ?? 1,
      enabled: true,
      // The parent's mix scales the whole chain; a step's own mix still applies within it.
      mix: (step.mix ?? 1) * (instance.mix ?? 1),
      params,
      ...(step.presetId ? { presetId: step.presetId } : {}),
    });
  }
  return out;
}

/**
 * Expand a whole stack. Built-in instances pass through untouched, so both hosts can call this
 * unconditionally on the stack before resolving anything.
 */
export function expandStack(stack: ForgeEffectInstance[], lookup: (id: string) => CustomEffect | undefined): ForgeEffectInstance[] {
  if (!stack?.length) return stack || [];
  if (!stack.some((i) => isCustomEffectId(i.effectId))) return stack;
  const out: ForgeEffectInstance[] = [];
  for (const instance of stack) {
    if (!isCustomEffectId(instance.effectId)) { out.push(instance); continue; }
    if (instance.enabled === false) continue;
    const custom = lookup(bareCustomId(instance.effectId));
    if (!custom) continue;                                  // deleted definition: drop, never crash
    out.push(...expandCustomInstance(instance, custom));
  }
  return out;
}

/** A fresh instance of a custom effect, with every control at its default. */
export function createCustomInstance(custom: CustomEffect, instanceId = `${custom.id}-${Date.now()}`): ForgeEffectInstance {
  return {
    id: instanceId,
    effectId: customEffectId(custom.id),
    version: custom.version ?? 1,
    enabled: true,
    mix: 1,
    params: Object.fromEntries(custom.controls.map((c) => [c.key, c.default])),
  };
}

/**
 * Seed a custom effect from a stack the author has already tuned, promoting nothing. The builder
 * UI then picks which parameters become controls.
 */
export function customFromStack(stack: ForgeEffectInstance[], name: string, category = 'stylize', description = ''): CustomEffect {
  const steps: LookStep[] = stack
    .filter((instance) => instance.enabled !== false && !isCustomEffectId(instance.effectId))
    .map((instance) => ({
      effectId: instance.effectId,
      ...(instance.presetId ? { presetId: instance.presetId } : {}),
      params: { ...instance.params },
      ...(instance.mix !== undefined && instance.mix !== 1 ? { mix: instance.mix } : {}),
    }));
  return { id: `u${Date.now().toString(36)}`, name, category, description, version: 1, steps, controls: [], saved: Date.now() };
}

/**
 * Promote one step parameter to a named control, carrying its current value across as the
 * control's default so adding a knob never changes how the effect currently looks.
 */
export function promoteControl(custom: CustomEffect, stepIndex: number, paramKey: string, label?: string): CustomEffect {
  const step = custom.steps[stepIndex];
  const effect = findEffect(step?.effectId || '');
  const param = findParam(effect, paramKey);
  if (!param) return custom;
  const base = (step.params?.[paramKey] ?? param.default);
  let key = paramKey;
  for (let n = 2; custom.controls.some((c) => c.key === key); n++) key = `${paramKey}${n}`;
  const control: CustomControl = {
    key, label: label || param.label, min: param.min, max: param.max, default: base, step: param.step,
    targets: [{ step: stepIndex, param: paramKey }],
  };
  return { ...custom, controls: [...custom.controls, control] };
}

/** Every problem with a definition, as sentences. Empty means it is safe to publish. */
export function validateCustomEffect(custom: CustomEffect): string[] {
  const errors: string[] = [];
  if (!custom.name?.trim()) errors.push('The effect needs a name.');
  if (!custom.steps?.length) errors.push('The effect needs at least one step.');
  custom.steps?.forEach((step, i) => {
    const effect = findEffect(step.effectId);
    if (!effect) { errors.push(`Step ${i + 1} names an effect that no longer exists (${step.effectId}).`); return; }
    if (step.presetId && !resolvePreset(effect, step.presetId)) errors.push(`Step ${i + 1} names a preset ${effect.name} does not have (${step.presetId}).`);
    for (const [key, value] of Object.entries(step.params || {})) {
      const param = findParam(effect, key);
      if (!param) { errors.push(`Step ${i + 1} sets ${key}, which ${effect.name} does not have.`); continue; }
      if (value < param.min || value > param.max) errors.push(`Step ${i + 1}: ${param.label} is ${value}, outside ${param.min}–${param.max}.`);
    }
  });
  const keys = new Set<string>();
  for (const control of custom.controls || []) {
    if (!control.key?.trim()) errors.push('A control has no key.');
    if (keys.has(control.key)) errors.push(`Two controls share the key ${control.key}.`);
    keys.add(control.key);
    if (!(control.min < control.max)) errors.push(`Control ${control.label || control.key} has an empty range.`);
    if (control.default < control.min || control.default > control.max) errors.push(`Control ${control.label || control.key} defaults outside its own range.`);
    if (!control.targets?.length) errors.push(`Control ${control.label || control.key} drives nothing.`);
    for (const target of control.targets || []) {
      const step = custom.steps?.[target.step];
      if (!step) { errors.push(`Control ${control.label || control.key} points at step ${target.step + 1}, which does not exist.`); continue; }
      if (!findParam(findEffect(step.effectId), target.param)) errors.push(`Control ${control.label || control.key} points at ${target.param}, which step ${target.step + 1} does not have.`);
    }
  }
  return errors;
}

// ── persistence (per browser, like user looks) ────────────────────────────────────────────────
const STORE = 'plajah_forge_custom_effects_v1';

export function loadCustomEffects(): CustomEffect[] {
  try {
    const raw = localStorage.getItem(STORE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.steps)) : [];
  } catch { return []; }
}

export function saveCustomEffect(custom: CustomEffect): CustomEffect[] {
  const next = [...loadCustomEffects().filter((c) => c.id !== custom.id), { ...custom, saved: Date.now() }];
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* quota or private mode */ }
  invalidateCustomLookup();
  return next;
}

export function deleteCustomEffect(id: string): CustomEffect[] {
  const next = loadCustomEffects().filter((c) => c.id !== id);
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* quota or private mode */ }
  invalidateCustomLookup();
  return next;
}

// A stack is expanded on every rendered frame, in both hosts. Reading localStorage that often
// would be silly, so the definitions are cached briefly and dropped whenever one is written.
let lookupCache: { at: number; map: Map<string, CustomEffect> } | null = null;

export function customLookup(): (id: string) => CustomEffect | undefined {
  if (!lookupCache || Date.now() - lookupCache.at > 2000) {
    lookupCache = { at: Date.now(), map: new Map(loadCustomEffects().map((c) => [c.id, c])) };
  }
  const map = lookupCache.map;
  return (id: string) => map.get(id);
}

export function invalidateCustomLookup(): void { lookupCache = null; }
