import { FX_EFFECTS, FxEffect, FxPreset } from '../../components/plajahPixels/engine/fx/effects';

/** Portable, host-neutral instance stored by Fabula clips and translatable to OFX later. */
export interface ForgeEffectInstance {
  id: string;
  effectId: string;
  version: number;
  enabled: boolean;
  mix: number;
  params: Record<string, number>;
  presetId?: string;
  auxAssetId?: string;
}

export function effectDefaults(effect: FxEffect): Record<string, number> {
  return Object.fromEntries(effect.params.map((param) => [param.key, param.default]));
}

export function resolvePreset(effect: FxEffect, presetId: string): FxPreset | undefined {
  return effect.presets?.find((preset) => preset.id === presetId);
}

export function createEffectInstance(effectId: string, presetId?: string, instanceId = `${effectId}-${Date.now()}`): ForgeEffectInstance {
  const effect = FX_EFFECTS.find((candidate) => candidate.id === effectId);
  if (!effect) throw new Error(`Unknown Forge effect: ${effectId}`);
  const preset = presetId ? resolvePreset(effect, presetId) : undefined;
  return {
    id: instanceId,
    effectId,
    version: effect.version ?? 1,
    enabled: true,
    mix: 1,
    params: { ...effectDefaults(effect), ...(preset?.params || {}) },
    ...(preset ? { presetId: preset.id } : {}),
  };
}

/** Renderer order is the declaration order, with defaults for missing/legacy values. */
export function instanceParamArray(instance: ForgeEffectInstance): number[] {
  const effect = FX_EFFECTS.find((candidate) => candidate.id === instance.effectId);
  if (!effect) return [];
  return effect.params.map((param) => instance.params[param.key] ?? param.default);
}

export function effectsByCategory() {
  return FX_EFFECTS.reduce<Record<string, FxEffect[]>>((groups, effect) => {
    (groups[effect.category || 'utility'] ||= []).push(effect);
    return groups;
  }, {});
}
