// Plain-language presets for the Behaviours panel. Each expands into ordinary Behavior JSON (nothing hidden): the author can
// open the result and edit every field. Pure, so every preset is unit-tested against the validator.
import type { Behavior, Goal, LivingPage, Scalar, Target } from '../contracts';

export interface PresetParams { target: Target; /** short human name of the target, used in hints ("Bo") */ name: string; cue?: string; revealLabel?: string; sound?: string; instrument?: string; note?: string }
export interface PresetResult { behaviors: Behavior[]; vars?: Record<string, Scalar>; goals?: Goal[]; music?: LivingPage['music']; ambience?: LivingPage['ambience'] }
export interface PresetDef {
  id: string;
  title: string;
  blurb: string;
  group: 'Idle life' | 'Reactions' | 'Play' | 'Page';
  /** What the author must pick before adding. */
  needs: 'object' | 'page';
  build(p: PresetParams, nid: (base: string) => string): PresetResult;
}

const loop = 'infinite' as const;

export const PRESETS: PresetDef[] = [
  { id: 'float', title: 'Float', blurb: 'Drifts gently up and down, forever.', group: 'Idle life', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('float'), label: `${p.name} floats`, target: p.target, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'float', loop } }] }] }) },
  { id: 'blink', title: 'Blink', blurb: 'Blinks every few seconds (use on eyes).', group: 'Idle life', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('blink'), label: `${p.name} blinks`, target: p.target, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'blink', loop } }] }] }) },
  { id: 'breathe', title: 'Breathe', blurb: 'Slow, sleepy breathing.', group: 'Idle life', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('breathe'), label: `${p.name} breathes`, target: p.target, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'breathe', loop } }] }] }) },
  { id: 'twinkle', title: 'Twinkle', blurb: 'Stars and lights that softly twinkle.', group: 'Idle life', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('twinkle'), label: `${p.name} twinkles`, target: p.target, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'twinkle', loop } }] }] }) },

  { id: 'tap-wiggle', title: 'Tap to wiggle', blurb: 'A tap makes it wiggle.', group: 'Reactions', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('wiggle'), label: `Tap ${p.name}`, target: p.target, on: { type: 'tap' }, hint: `Tap ${p.name} to make it wiggle`, do: [{ do: 'animate', anim: { preset: 'wiggle' } }, { do: 'haptic', pattern: 'tap' }] }] }) },
  { id: 'tap-sound', title: 'Tap to play a sound', blurb: 'A tap plays a sound and pulses.', group: 'Reactions', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('sound'), label: `Tap ${p.name} for a sound`, target: p.target, on: { type: 'tap' }, hint: `Tap ${p.name} to hear a sound`, do: [{ do: 'sfx', sound: p.sound ?? 'pop' }, { do: 'animate', anim: { preset: 'pulse' } }], reduced: [{ do: 'animate', anim: { preset: 'fade-in', durationMs: 200 } }] }] }) },
  { id: 'tap-burst', title: 'Tap to burst sparkles', blurb: 'A tap sprinkles sparkles and chimes.', group: 'Reactions', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('sparkle'), label: `Tap ${p.name} for sparkles`, target: p.target, on: { type: 'tap' }, hint: `Tap ${p.name} for sparkles`, do: [{ do: 'burst', kind: 'sparkles', count: 14 }, { do: 'sfx', sound: p.sound ?? 'chime' }] }] }) },
  { id: 'follow', title: 'Follow the pointer', blurb: 'Eyes (or a little friend) follow your finger.', group: 'Reactions', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('follow'), label: `${p.name} follows the pointer`, target: p.target, on: { type: 'enter' }, do: [{ do: 'follow', target: p.target, to: 'pointer', lookAt: true, maxOffset: 6 }] }] }) },
  { id: 'peek', title: 'Peek when approached slowly', blurb: 'Shy: peeks out for a slow approach, hides if you rush.', group: 'Reactions', needs: 'object',
    build: (p, id) => ({ behaviors: [
      { id: id('peek-start'), label: `${p.name} starts hidden`, target: p.target, on: { type: 'enter' }, do: [{ do: 'set', props: { opacity: 0 } }] },
      { id: id('peek-slow'), label: `${p.name} peeks`, target: p.target, on: { type: 'proximity', radius: 140, slowBelow: 260 }, hint: `Move slowly towards ${p.name} and see what happens`, do: [{ do: 'animate', anim: { preset: 'pop-in' } }, { do: 'sfx', sound: p.sound ?? 'pop' }] },
      { id: id('peek-fast'), label: `${p.name} hides`, target: p.target, on: { type: 'proximity', radius: 140, fastAbove: 700 }, hint: `Rush at ${p.name} and it hides`, do: [{ do: 'animate', anim: { preset: 'fade-out', durationMs: 250 } }] },
    ] }) },

  { id: 'hold-note', title: 'Press to hold a note', blurb: 'Press and hold to sound a note; slide up and down to bend it.', group: 'Play', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('hold'), label: `Hold ${p.name}`, target: p.target, on: { type: 'press', minMs: 0 }, hint: `Press and hold ${p.name} to play a note`, do: [{ do: 'note', instrument: p.instrument ?? 'kazoo', note: p.note ?? 'C4' }, { do: 'animate', anim: { preset: 'pulse', durationMs: 400 } }], reduced: [{ do: 'animate', anim: { preset: 'fade-in', durationMs: 200 } }] }] }) },
  { id: 'drag-reveal', title: 'Drag to reveal', blurb: 'Drag it away to uncover what is underneath.', group: 'Play', needs: 'object',
    build: (p, id) => { const v = id('reveal').replace(/[^a-z0-9]/gi, '_'); return {
      vars: { [v]: 0 },
      behaviors: [
        { id: id('drag'), label: `Drag ${p.name}`, target: p.target, on: { type: 'drag', axis: 'y', bounds: { minY: -140, maxY: 0 }, progressVar: v }, hint: `Drag ${p.name} up to see what is underneath. Or press Enter to lift it.`, do: [{ do: 'sfx', sound: 'whoosh' }] },
        { id: id('uncover'), label: 'Uncover', target: { label: p.revealLabel ?? 'Hidden*' }, on: { type: 'when', cond: { var: v, op: '>=', value: 0.7 } }, once: true, do: [{ do: 'show', target: { label: p.revealLabel ?? 'Hidden*' }, anim: { preset: 'pop-in' } }, { do: 'burst', kind: 'sparkles', count: 10 }, { do: 'sfx', sound: 'chime' }] },
      ] }; } },
  { id: 'counter', title: 'Counter + goal', blurb: 'Count taps; reaching 3 completes a goal and celebrates.', group: 'Play', needs: 'object',
    build: (p, id) => { const v = id('count').replace(/[^a-z0-9]/gi, '_'); return {
      vars: { [v]: 0 },
      behaviors: [{ id: id('count-tap'), label: `Count ${p.name}`, target: p.target, on: { type: 'tap' }, once: false, cooldownMs: 250, hint: `Tap ${p.name}. Find them all: 3 to win.`, do: [{ do: 'var', name: v, op: 'inc' }, { do: 'sfx', sound: 'pop' }, { do: 'burst', kind: 'stars', count: 8 }] }],
      goals: [{ id: id('goal'), label: 'Found all three', when: { var: v, op: '>=', value: 3 }, celebrate: true }],
    }; } },

  { id: 'fade-in', title: 'Fade in on enter', blurb: 'Fades in softly when the page opens.', group: 'Page', needs: 'object',
    build: (p, id) => ({ behaviors: [{ id: id('fadein'), label: `${p.name} fades in`, target: p.target, on: { type: 'enter' }, do: [{ do: 'animate', anim: { preset: 'fade-in', durationMs: 900 } }] }] }) },
  { id: 'music', title: 'Play music when page opens', blurb: 'Starts a music cue from the book when this page opens.', group: 'Page', needs: 'page',
    build: (p) => ({ behaviors: [], music: { cue: p.cue ?? 'main', fadeMs: 800 } }) },
];

export const presetById = (id: string) => PRESETS.find(p => p.id === id);

/** Unique behaviour id on a page: base, base-2, base-3... */
export function uniqueId(page: LivingPage, base: string, extra: Iterable<string> = []): string {
  const used = new Set([...page.behaviors.map(b => b.id), ...(page.goals ?? []).map(g => g.id), ...Object.keys(page.vars ?? {}), ...extra]);
  let id = base, n = 1; while (used.has(id)) id = `${base}-${++n}`;
  return id;
}

/** Add a preset's output to a page (returns a new page; never mutates). */
export function applyPreset(page: LivingPage, def: PresetDef, p: PresetParams): LivingPage {
  const taken = new Set<string>();
  const nid = (base: string) => { const id = uniqueId(page, base, taken); taken.add(id); return id; };
  const r = def.build(p, nid);
  return {
    ...page,
    behaviors: [...page.behaviors, ...r.behaviors],
    vars: r.vars ? { ...page.vars, ...r.vars } : page.vars,
    goals: r.goals ? [...(page.goals ?? []), ...r.goals] : page.goals,
    music: r.music ?? page.music,
    ambience: r.ambience ?? page.ambience,
  };
}
