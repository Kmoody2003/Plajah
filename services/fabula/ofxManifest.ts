// ofxManifest — the host-neutral descriptor side of the Forge/OFX contract (W5, step 1).
//
// Every Forge effect and transition is already a stable id + ordered typed params + declared
// inputs. This module turns that registry into OpenFX-shaped plugin descriptors: the exact
// data an OFX `describe` / `describeInContext` call needs (identifier, grouping, contexts,
// clips, param types/ranges/defaults, presets) plus the kernel ABI the native shell executes.
// Nothing here renders; it is the manifest the Rust/C++ OFX shell will read so the same
// effects run in Resolve, Nuke, Fusion, Flame and VEGAS without a second effect codebase.
import { FX_EFFECTS, FX_HEADER, type FxEffect, type FxParam } from '../../components/plajahPixels/engine/fx/effects';
import { FORGE_TRANSITIONS, type ForgeTransition } from './forgeTransitions';

export const OFX_VENDOR_PREFIX = 'com.plajah.fabula';
export const OFX_API_VERSION = '1.4';

export type OfxParamType = 'OfxParamTypeDouble' | 'OfxParamTypeInteger' | 'OfxParamTypeChoice' | 'OfxParamTypeBoolean';
export interface OfxParamDescriptor {
  name: string; label: string; type: OfxParamType;
  default: number; min: number; max: number; displayMin: number; displayMax: number;
  increment?: number; hint?: string; animates: true;
  /** For choices: option labels in value order (value = index). */
  options?: string[];
  /** Position in the kernel's ordered uniform ABI (P0..P7). */
  abiIndex: number;
}
export interface OfxClipDescriptor { name: 'Source' | 'Aux' | 'Outgoing' | 'Incoming' | 'Output'; optional: boolean; temporalAccess?: boolean; }
export interface OfxPluginDescriptor {
  pluginIdentifier: string;
  label: string;
  grouping: string;
  description: string;
  versionMajor: number; versionMinor: number;
  contexts: ('OfxImageEffectContextFilter' | 'OfxImageEffectContextGeneral' | 'OfxImageEffectContextTransition' | 'OfxImageEffectContextGenerator')[];
  clips: OfxClipDescriptor[];
  params: OfxParamDescriptor[];
  presets: { id: string; name: string; description?: string; params: Record<string, number> }[];
  supportsTiles: false;
  temporalClipAccess: boolean;
  supportsMultiResolution: false;
  renderThreadSafety: 'OfxImageEffectRenderInstanceSafe';
  kernel: {
    language: 'glsl-es-300';
    entry: 'fx';
    /** Names the shell must bind, in order, to the P0..P7 float uniforms. */
    paramAbi: string[];
    passes: { id: string; source: string }[];
    uniforms: { input: 'uInput'; source: 'uSource'; aux: 'uAux'; prev: 'uPrev'; prevSrc: 'uPrevSrc'; resolution: 'uResolution'; time: 'uTime'; deltaT: 'uDeltaT'; frame: 'uFrame'; audio: ['iBass', 'iMid', 'iTreble', 'iLevel'] };
    headerHash: string;
    temporal: boolean;
  } | null;
}
export interface OfxManifest {
  generator: 'fabula-forge';
  apiVersion: string;
  vendorPrefix: string;
  header: string;
  plugins: OfxPluginDescriptor[];
}

/** Stable, dependency-free string hash (FNV-1a) so shells can detect ABI header drift. */
export function stableHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** "Blend (0 max · 1 add · 2 screen)" → ['max','add','screen']; null when not an enumeration. */
export function parseChoiceLabel(label: string): { base: string; options: string[] } | null {
  const m = label.match(/^(.*?)\s*\(((?:\s*\d+\s+[^·()]+·?)+)\)\s*$/);
  if (!m) return null;
  const parts = m[2].split('·').map(s => s.trim()).filter(Boolean);
  const options: string[] = [];
  for (const p of parts) { const mm = p.match(/^(\d+)\s+(.+)$/); if (!mm) return null; const idx = parseInt(mm[1], 10); if (idx !== options.length) return null; options.push(mm[2].trim()); }
  return options.length >= 2 ? { base: m[1].trim() || label, options } : null;
}

export function ofxParam(param: FxParam, abiIndex: number): OfxParamDescriptor {
  const choice = parseChoiceLabel(param.label);
  const integer = !!param.step && param.step >= 1 && Number.isInteger(param.min) && Number.isInteger(param.max);
  const boolean = integer && param.min === 0 && param.max === 1 && /invert|enable|on\b|mono|flip|mirror/i.test(param.label);
  const type: OfxParamType = choice ? 'OfxParamTypeChoice' : boolean ? 'OfxParamTypeBoolean' : integer ? 'OfxParamTypeInteger' : 'OfxParamTypeDouble';
  return {
    name: param.key, label: choice ? choice.base : param.label, type,
    default: param.default, min: param.min, max: param.max, displayMin: param.min, displayMax: param.max,
    ...(param.step ? { increment: param.step } : {}),
    ...(param.unit ? { hint: `Unit: ${param.unit}` } : {}),
    ...(choice ? { options: choice.options } : {}),
    animates: true, abiIndex,
  };
}

const CATEGORY_GROUP: Record<string, string> = { color: 'Color', light: 'Light', blur: 'Blur & Focus', stylize: 'Stylize', distort: 'Distort & Warp', utility: 'Key & Utility', time: 'Time', generator: 'Generators', mask: 'Masks' };

export function ofxDescriptorFor(effect: FxEffect): OfxPluginDescriptor {
  const passes = effect.passes?.length ? effect.passes : [{ id: 'main', glsl: effect.glsl }];
  const clips: OfxClipDescriptor[] = [{ name: 'Source', optional: false, temporalAccess: !!effect.temporal }];
  if (effect.auxInput) clips.push({ name: 'Aux', optional: !!effect.auxInput.optional });
  clips.push({ name: 'Output', optional: false });
  const version = effect.version ?? 1;
  return {
    pluginIdentifier: `${OFX_VENDOR_PREFIX}.${effect.id}`,
    label: effect.name,
    grouping: `Fabula/${CATEGORY_GROUP[effect.category || 'utility'] || 'Effects'}`,
    description: effect.summary || effect.name,
    versionMajor: Math.floor(version), versionMinor: Math.round((version % 1) * 10),
    contexts: effect.category === 'generator' ? ['OfxImageEffectContextGenerator', 'OfxImageEffectContextFilter'] : effect.auxInput ? ['OfxImageEffectContextGeneral', 'OfxImageEffectContextFilter'] : ['OfxImageEffectContextFilter'],
    clips,
    params: effect.params.map((p, i) => ofxParam(p, i)),
    presets: (effect.presets || []).map(p => ({ id: p.id, name: p.name, description: p.description, params: p.params })),
    supportsTiles: false,
    temporalClipAccess: !!effect.temporal,
    supportsMultiResolution: false,
    renderThreadSafety: 'OfxImageEffectRenderInstanceSafe',
    kernel: {
      language: 'glsl-es-300', entry: 'fx',
      paramAbi: effect.params.map(p => p.key),
      passes: passes.map(p => ({ id: p.id, source: p.glsl })),
      uniforms: { input: 'uInput', source: 'uSource', aux: 'uAux', prev: 'uPrev', prevSrc: 'uPrevSrc', resolution: 'uResolution', time: 'uTime', deltaT: 'uDeltaT', frame: 'uFrame', audio: ['iBass', 'iMid', 'iTreble', 'iLevel'] },
      headerHash: stableHash(FX_HEADER),
      temporal: !!effect.temporal,
    },
  };
}

/** Transitions describe as OFX Transition-context plugins; their kernels live in the
 *  transition renderer, so the descriptor carries params/presets and a kernel reference only. */
export function ofxTransitionDescriptor(t: ForgeTransition): OfxPluginDescriptor {
  const keys = Object.keys(t.defaults);
  return {
    pluginIdentifier: `${OFX_VENDOR_PREFIX}.transition.${t.id}`,
    label: t.name,
    grouping: `Fabula/Transitions/${t.family[0].toUpperCase()}${t.family.slice(1)}`,
    description: t.description,
    versionMajor: 1, versionMinor: 0,
    contexts: ['OfxImageEffectContextTransition'],
    clips: [{ name: 'Outgoing', optional: false }, { name: 'Incoming', optional: false }, { name: 'Output', optional: false }],
    params: keys.map((k, i) => ({ name: k, label: k, type: 'OfxParamTypeDouble', default: t.defaults[k], min: -1e6, max: 1e6, displayMin: 0, displayMax: Math.max(1, Math.abs(t.defaults[k]) * 2), animates: true, abiIndex: i })),
    presets: t.presets.map(p => ({ id: p.id, name: p.name, params: p.params })),
    supportsTiles: false,
    temporalClipAccess: false,
    supportsMultiResolution: false,
    renderThreadSafety: 'OfxImageEffectRenderInstanceSafe',
    kernel: null,
  };
}

export function buildOfxManifest(): OfxManifest {
  return {
    generator: 'fabula-forge', apiVersion: OFX_API_VERSION, vendorPrefix: OFX_VENDOR_PREFIX, header: FX_HEADER,
    plugins: [...FX_EFFECTS.map(ofxDescriptorFor), ...FORGE_TRANSITIONS.map(ofxTransitionDescriptor)],
  };
}

/** Deterministic JSON (no timestamps) — safe to commit and diff. */
export function ofxManifestJson(): string { return JSON.stringify(buildOfxManifest(), null, 2); }
