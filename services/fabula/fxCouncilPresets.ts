// fxCouncilPresets — a council-authored preset bank for EVERY Fabula FX effect,
// transition and audio device.
//
// Each of the twelve directors (six Art Council, six Motion Council) carries a
// durable lens: how hard they push intensity, saturation, contrast, warmth,
// scale, speed, exposure and detail. A lens reads an effect's declared
// parameters (key + label + range), classifies each one by role, and writes a
// preset in that director's voice. The result is deterministic: the same effect
// always gets the same twelve presets, and new effects get theirs automatically
// the day they're registered.
//
// Rules the generator keeps:
//   • params that are switches/drivers (progress, mode, seed, direction, shape…)
//     are never touched — a preset is a look, not a state part-way through
//   • values stay inside the declared range and snap to the param step
//   • a preset that would equal the defaults is dropped
//   • ids are `council-<member>` so they can't collide with hand-authored ones
// Hand-authored presets always come first; council presets follow.

export type FxLensRole = 'intensity' | 'sat' | 'contrast' | 'hue' | 'size' | 'speed' | 'bright' | 'detail';
export interface FxCouncilLens {
  member: string;
  council: 'art' | 'motion' | 'music';
  name: string;
  ethos: string;
  /** −1..1 push from the default toward min (−) or max (+) per role. */
  push: Record<FxLensRole, number>;
}

const L = (member: string, council: 'art' | 'motion', name: string, ethos: string, push: Record<FxLensRole, number>): FxCouncilLens => ({ member, council, name, ethos, push });

export const FX_COUNCIL_LENSES: FxCouncilLens[] = [
  L('CLASSICAL', 'art', 'Classical Restraint', 'proportion, warmth and nothing louder than the subject', { intensity: -.35, sat: -.1, contrast: .15, hue: .18, size: -.1, speed: -.4, bright: 0, detail: .2 }),
  L('REBEL', 'art', 'Rebel Overdrive', 'pushed past polite — loud, saturated, deliberately rough', { intensity: .85, sat: .6, contrast: .6, hue: -.5, size: .5, speed: .6, bright: .1, detail: -.3 }),
  L('FUTURIST', 'art', 'Futurist Chrome', 'cool, precise and high-detail, like light on machined metal', { intensity: .5, sat: .3, contrast: .35, hue: -.6, size: .2, speed: .4, bright: .15, detail: .6 }),
  L('WORLD_ECLECTIC', 'art', 'World Eclectic', 'sun-warm pigments and rich texture from a travelled palette', { intensity: .25, sat: .45, contrast: .1, hue: .55, size: 0, speed: 0, bright: .05, detail: .35 }),
  L('BAROQUE', 'art', 'Baroque Drama', 'chiaroscuro, depth and ornament — theatre in every frame', { intensity: .6, sat: .35, contrast: .55, hue: .35, size: .35, speed: -.25, bright: -.15, detail: .5 }),
  L('RADICAL_MINIMAL', 'art', 'Radical Minimal', 'the least effect that still reads — almost invisible', { intensity: -.65, sat: -.45, contrast: .05, hue: 0, size: -.4, speed: -.5, bright: 0, detail: -.6 }),
  L('KINETIC', 'motion', 'Kinetic Snap', 'fast, rhythmic and tight — built to cut on the beat', { intensity: .3, sat: .1, contrast: .3, hue: -.1, size: -.2, speed: .8, bright: .05, detail: 0 }),
  L('CHARACTER', 'motion', 'Character Bounce', 'playful, elastic and warm — the effect has a personality', { intensity: .4, sat: .35, contrast: .1, hue: .2, size: .3, speed: .3, bright: .1, detail: -.1 }),
  L('COMPOSITOR', 'motion', 'Compositor Integration', 'sits in the plate: matched, subtle, physically plausible', { intensity: -.2, sat: -.05, contrast: 0, hue: 0, size: -.15, speed: -.1, bright: 0, detail: .4 }),
  L('GENERATIVE', 'motion', 'Generative Bloom', 'systems over strokes — dense, evolving, detailed', { intensity: .45, sat: .2, contrast: .15, hue: -.3, size: .2, speed: .2, bright: .05, detail: .85 }),
  L('SIGNAL', 'motion', 'Signal Bender', 'VJ voltage: maximum signal, cool spectra and broken edges', { intensity: .95, sat: .7, contrast: .4, hue: -.8, size: .3, speed: .75, bright: .1, detail: -.4 }),
  L('CINEMATIC', 'motion', 'Cinematic Depth', 'big-screen weight: deep contrast, slow moves, wide scale', { intensity: .15, sat: -.15, contrast: .35, hue: .25, size: .4, speed: -.55, bright: -.2, detail: .2 }),
];

export const FX_MUSIC_LENSES: FxCouncilLens[] = [
  { member: 'PRODUCER', council: 'music', name: 'Producer Punch', ethos: 'forward, exciting and radio-ready', push: { intensity: .55, sat: .4, contrast: .45, hue: .1, size: .1, speed: .3, bright: .2, detail: .1 } },
  { member: 'MIX', council: 'music', name: 'Mix Engineer Balance', ethos: 'clarity and space — every element earns its place', push: { intensity: -.15, sat: -.05, contrast: .1, hue: 0, size: .05, speed: 0, bright: 0, detail: .3 } },
  { member: 'MASTER', council: 'music', name: 'Mastering Glue', ethos: 'transparent cohesion and safe headroom', push: { intensity: -.35, sat: -.15, contrast: .2, hue: 0, size: -.1, speed: -.2, bright: -.05, detail: .1 } },
  { member: 'MUSICIAN', council: 'music', name: 'Virtuoso Colour', ethos: 'expressive, characterful tone you can feel', push: { intensity: .4, sat: .5, contrast: .1, hue: .3, size: .25, speed: .1, bright: .05, detail: .2 } },
  { member: 'COMPOSER', council: 'music', name: 'Composer Hall', ethos: 'orchestral air, depth and long tails', push: { intensity: .25, sat: -.1, contrast: -.1, hue: .2, size: .7, speed: -.5, bright: -.1, detail: .3 } },
  { member: 'LD', council: 'music', name: 'Lighting Director Pulse', ethos: 'motion you can see: rhythmic, modulated, bright', push: { intensity: .6, sat: .3, contrast: .3, hue: -.3, size: .2, speed: .7, bright: .25, detail: -.1 } },
];

export interface FxParamLike { key: string; label?: string; min?: number; max?: number; default: number; step?: number }
export interface FxCouncilPreset { id: string; name: string; description: string; params: Record<string, number>; council: { council: string; member: string } }

/** Params a preset must never move (drivers, switches, seeds, geometry selectors). */
const FROZEN = /^(progress|mode|seed|direction|shape|type|variant|style|invert|flip|mirror|axis|count?Mode|blend|channel|phase|time|offset|offsetx|offsety|centerx|centery|cx|cy|x|y|posx|posy|angle|rotation|pan|loop|sync|on|enabled|bypass)$/i;
/** Per-effect drivers that the test-suite requires to stay un-triggered. */
const DRIVERS: Record<string, string[]> = { shatterpieces: ['progress'], carddance: ['amount'] };

export function classifyParam(p: FxParamLike): FxLensRole | null {
  const s = `${p.key} ${p.label || ''}`.toLowerCase();
  if (FROZEN.test(p.key)) return null;
  if (/sat|chroma|vibran|colorful|colour amount/.test(s)) return 'sat';
  if (/contrast|punch|crunch|ratio|threshold|knee/.test(s)) return 'contrast';
  if (/hue|tint|temp|warm|cool|split|tone/.test(s)) return 'hue';
  if (/expos|bright|lift|gamma|gain|level|output|makeup|volume|luma/.test(s)) return 'bright';
  if (/speed|rate|freq|tempo|hz|rpm|time|delay|attack|release|decay|jitter|flicker/.test(s)) return 'speed';
  if (/radius|size|scale|blur|soft|spread|width|length|distance|zoom|room|space|feather|bokeh|depth/.test(s)) return 'size';
  if (/count|density|detail|octave|segment|band|cells|grain size|lines|rows|cols|steps|levels|\bres\b|resolution|quality|complex/.test(s)) return 'detail';
  if (/amount|strength|intens|mix|opacity|glow|grain|noise|distort|power|drive|boost|warp|displace|bloom|wet|dry|feedback|resonance|q\b|edge|fringe|aberr|vignette|sharp|halation/.test(s)) return 'intensity';
  return 'intensity';
}

function hash01(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

function snap(v: number, p: FxParamLike, lo: number, hi: number): number {
  v = Math.max(lo, Math.min(hi, v));
  const step = p.step && p.step > 0 ? p.step : (hi - lo) / 1000;
  const n = Math.round((v - lo) / step) * step + lo;
  const dec = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
  return Number(Math.max(lo, Math.min(hi, n)).toFixed(dec));
}

function rangeOf(p: FxParamLike): [number, number] {
  if (Number.isFinite(p.min) && Number.isFinite(p.max) && (p.max as number) > (p.min as number)) return [p.min as number, p.max as number];
  // Range-less (inline transitions): infer a sensible span around the default.
  const d = p.default;
  if (d === 0) return [0, 1];
  return d > 0 ? [0, d * 2.2] : [d * 2.2, -d * 2.2];
}

/** Council presets for one parameter list. */
export function councilPresetsForParams(ownerId: string, ownerName: string, params: FxParamLike[], lenses: FxCouncilLens[] = FX_COUNCIL_LENSES): FxCouncilPreset[] {
  const frozen = new Set(DRIVERS[ownerId] || []);
  const out: FxCouncilPreset[] = [];
  const seen = new Set<string>();
  for (const lens of lenses) {
    const values: Record<string, number> = {};
    let moved = 0;
    for (const p of params) {
      const role = frozen.has(p.key) ? null : classifyParam(p);
      const [lo, hi] = rangeOf(p);
      if (!role) { values[p.key] = p.default; continue; }
      const jitter = (hash01(`${ownerId}|${lens.member}|${p.key}`) - .5) * .16;
      const push = Math.max(-1, Math.min(1, lens.push[role] + jitter));
      const d = Math.max(lo, Math.min(hi, p.default));
      const v = push >= 0 ? d + push * (hi - d) * .85 : d + push * (d - lo) * .85;
      const s = snap(v, p, lo, hi);
      values[p.key] = s;
      if (Math.abs(s - p.default) > 1e-9) moved++;
    }
    if (!moved) continue;
    const sig = JSON.stringify(values);
    if (seen.has(sig)) continue; // two lenses landing on the same values (tiny ranges)
    seen.add(sig);
    out.push({
      id: `council-${lens.member.toLowerCase()}`,
      name: lens.name,
      description: `${ownerName} through the ${lens.council === 'art' ? 'Art Council' : lens.council === 'motion' ? 'Motion Council' : 'Music Council'} lens — ${lens.ethos}.`,
      params: values,
      council: { council: lens.council, member: lens.member },
    });
  }
  return out;
}

// ── typed adapters (structural, so this file doesn't import the registries) ──
interface EffectLike { id: string; name: string; params: FxParamLike[]; presets?: { id: string; name: string; description?: string; params: Record<string, number> }[] }
interface TransitionLike { id: string; name: string; defaults: Record<string, number>; presets: { id: string; name: string; params: Record<string, number> }[] }
interface AudioDeviceLike { type: string; label: string; params: FxParamLike[] }

const effectCache = new WeakMap<object, FxCouncilPreset[]>();
export function councilPresetsForEffect(e: EffectLike): FxCouncilPreset[] {
  let v = effectCache.get(e);
  if (!v) { v = councilPresetsForParams(e.id, e.name, e.params); effectCache.set(e, v); }
  return v;
}
/** Hand-authored presets first, then the council bank. */
export function allPresetsForEffect<T extends EffectLike>(e: T): Array<NonNullable<T['presets']>[number] | FxCouncilPreset> {
  return [...(e.presets || []), ...councilPresetsForEffect(e)];
}

const transCache = new WeakMap<object, FxCouncilPreset[]>();
/** Transitions: the ranges come from the phase-3 registry when available, else inferred from defaults. */
export function councilPresetsForTransition(t: TransitionLike, ranges?: FxParamLike[]): FxCouncilPreset[] {
  let v = transCache.get(t);
  if (!v) {
    const params: FxParamLike[] = ranges && ranges.length ? ranges : Object.entries(t.defaults).map(([key, d]) => ({ key, default: d }));
    v = councilPresetsForParams(t.id, t.name, params);
    transCache.set(t, v);
  }
  return v;
}
export function allPresetsForTransition<T extends TransitionLike>(t: T, ranges?: FxParamLike[]) {
  return [...t.presets, ...councilPresetsForTransition(t, ranges)];
}

const audioCache = new WeakMap<object, FxCouncilPreset[]>();
export function councilPresetsForAudioDevice(d: AudioDeviceLike): FxCouncilPreset[] {
  let v = audioCache.get(d);
  if (!v) { v = councilPresetsForParams(d.type, d.label, d.params, FX_MUSIC_LENSES); audioCache.set(d, v); }
  return v;
}

export function isCouncilPresetId(id: string | undefined): boolean { return !!id && id.startsWith('council-'); }
