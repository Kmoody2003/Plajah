// BELOW THE BLUE: the living edition (ages 6-8, watercolor). docs/LIVING_BOOKS.md: "the world changes as you go deeper".
//
//   * Drag Coral DOWN (p4 the descent, p7 the jelly garden): the drag writes a depth variable. The water darkens through the light
//     zones (page tint in bands), the glowing dots appear, the jellies light up, and the AUDIO follows: music and ambience are low-passed,
//     quieter and more reverberant through the `depth` action. Every other page sets its own audio depth on entry, so the whole book
//     sounds deeper as the story sinks and brighter as it rises.
//   * Lumi's glow follows the finger (p5), jellies play glass chimes (p7, p12), Mabel's whale song glides when you hold her eye (p10),
//     Spot-Lumi is a hidden-object game with five real hidden Lumis (p12). Music: an ambient pad plus harp arpeggios.
//
// Targets are the real labels the story-ocean designer draws; characters that the designer builds out of generic "Watercolour wash" pieces
// (Coral, Lumi, each jelly) are groups of ids taken from the designer output at build time (see _blueThreadKit.ts), never typed by hand.
// Every sound is synthesised in code; nothing plays before the reader's first gesture (the runtime enforces that); every interactive
// behaviour has a hint and a reduced-motion twin. The flat rendition stands alone: nothing here is needed to read the book.
import type { Action, Behavior, LivingBook, LivingPage, Score } from '../../../services/living/contracts';
import { arpeggiate, chord, chordsToNotes, makeScore, parseNotation, track } from '../../../services/living/audio/compose';
import { band, bhv, gt, lt, pageKit, spreadNarration, withoutMotion, type PageKit } from './_blueThreadKit';

const BOOK = 'below-the-blue';

// ───────────────────────────── music ─────────────────────────────
// Ambient pad + harp arpeggios, one cue per mood. All seeded (variation.seed) so a thumbnail render and a test hear the same thing.

const pad = (prog: Array<[string, string]>, beats: number, vel = 0.32) => chordsToNotes(prog.map(([r, q]) => chord(r, q)), beats, { vel, hold: 0.99 });
const harp = (prog: Array<[string, string]>, beats: number, o: { pattern?: 'up' | 'down' | 'updown'; step: number; count: number; dur: number; vel: number; lift?: number }) =>
  prog.flatMap(([r, q], b) => arpeggiate(chord(r, q).map(n => n + (o.lift ?? 12)), { pattern: o.pattern ?? 'updown', step: o.step, count: o.count, dur: o.dur, t0: b * beats, vel: o.vel }));

function scoreReef(): Score {
  const prog: Array<[string, string]> = [['C3', 'maj7'], ['A2', 'min7'], ['F3', 'maj7'], ['G2', '6']];
  return makeScore({
    id: 'reef', tempo: 64, lengthBeats: 16, reverb: 0.55, variation: { seed: 11, humanizeMs: 18, dropout: 0.07 },
    tracks: [
      track('pad', pad(prog, 4), { gain: 0.55 }),
      track('harp', harp(prog, 4, { step: 0.5, count: 8, dur: 2, vel: 0.42 }), { gain: 0.7, pan: -0.15 }),
      track('glass', parseNotation('rest:6 E6:2 rest:6 G6:2', { defaultVel: 0.26 }).notes, { gain: 0.35, pan: 0.3 }),
    ],
  });
}
function scoreDescent(): Score {
  const prog: Array<[string, string]> = [['A2', 'min7'], ['F2', 'maj7'], ['D3', 'min7'], ['E3', 'sus4']];
  return makeScore({
    id: 'descent', tempo: 52, lengthBeats: 16, reverb: 0.7, variation: { seed: 23, humanizeMs: 22, dropout: 0.1 },
    tracks: [
      track('pad', pad(prog, 4, 0.3), { gain: 0.6 }),
      track('harp', harp(prog, 4, { pattern: 'down', step: 1, count: 4, dur: 3, vel: 0.36 }), { gain: 0.6, pan: 0.1 }),
      track('bell', parseNotation('rest:7 A5:3 rest:6', { defaultVel: 0.2 }).notes, { gain: 0.3, pan: -0.3 }),
    ],
  });
}
function scoreDeep(): Score {
  const drone = [{ t: 0, n: 'D2', d: 15.8, v: 0.34 }, { t: 0, n: 'A2', d: 15.8, v: 0.26 }];
  return makeScore({
    id: 'deep', tempo: 44, lengthBeats: 16, reverb: 0.85, variation: { seed: 37, humanizeMs: 30, dropout: 0.05 },
    tracks: [
      track('pad', drone, { gain: 0.6 }),
      track('harp', parseNotation('rest:3 A4:2.5 rest:3.5 F4:2 rest:2 E4:3', { defaultVel: 0.3 }).notes, { gain: 0.5, pan: 0.2 }),
      track('glass', parseNotation('rest:5 A5:1.5 rest:3 D6:1.5 rest:2 E5:1.5 rest:1.5', { defaultVel: 0.2 }).notes, { gain: 0.3, pan: -0.3 }),   // a few far-off lights in the dark
    ],
  });
}
function scoreGlow(): Score {
  const prog: Array<[string, string]> = [['D3', 'maj7'], ['B2', 'min7'], ['G3', 'maj7'], ['A2', 'sus4']];
  return makeScore({
    id: 'glow', tempo: 58, lengthBeats: 16, reverb: 0.65, variation: { seed: 41, humanizeMs: 16, dropout: 0.08 },
    tracks: [
      track('pad', pad(prog, 4, 0.3), { gain: 0.5 }),
      track('harp', harp(prog, 4, { pattern: 'up', step: 0.5, count: 6, dur: 2.2, vel: 0.4 }), { gain: 0.65, pan: -0.2 }),
      track('glass', harp(prog, 4, { pattern: 'updown', step: 0.75, count: 4, dur: 1.5, vel: 0.24, lift: 24 }), { gain: 0.4, pan: 0.3 }),
    ],
  });
}
function scoreNight(): Score {
  return makeScore({
    id: 'night', tempo: 46, lengthBeats: 16, reverb: 0.8, variation: { seed: 53, humanizeMs: 28, dropout: 0.04 },
    tracks: [
      track('pad', pad([['A1', 'power'], ['F2', 'maj7'], ['D2', 'min7'], ['E2', 'sus4']], 4, 0.3), { gain: 0.6 }),
      track('harp', parseNotation('A3:2 rest:2 E4:2 rest:2 C4:3 rest:1 B3:3 rest:1', { defaultVel: 0.3 }).notes, { gain: 0.5, pan: -0.15 }),
    ],
  });
}
function scoreDawn(): Score {
  const prog: Array<[string, string]> = [['C3', 'maj'], ['G3', 'maj'], ['A2', 'min'], ['F3', 'maj7']];
  return makeScore({
    id: 'dawn', tempo: 76, lengthBeats: 16, reverb: 0.45, variation: { seed: 61, humanizeMs: 14, dropout: 0.06 },
    tracks: [
      track('pad', pad(prog, 4, 0.3), { gain: 0.45 }),
      track('harp', harp(prog, 4, { step: 0.5, count: 8, dur: 1.8, vel: 0.46 }), { gain: 0.7, pan: -0.2 }),
      track('kalimba', parseNotation('rest:1 E5:.5 G5:.5 C6:1 rest:1 G5:1 E5:.5 D5:.5 rest:2 A5:1 G5:1 rest:1 E5:.5 D5:.5 C5:1 rest:1', { defaultVel: 0.34 }).notes, { gain: 0.5, pan: 0.25 }),
    ],
  });
}
function scorePlay(): Score {
  const prog: Array<[string, string]> = [['F3', 'maj'], ['C3', 'maj'], ['G2', 'maj'], ['C3', 'maj']];
  return makeScore({
    id: 'play', tempo: 88, lengthBeats: 16, reverb: 0.35, variation: { seed: 71, humanizeMs: 12, dropout: 0.08 },
    tracks: [
      track('pad', pad(prog, 4, 0.26), { gain: 0.4 }),
      track('harp', harp(prog, 4, { step: 0.5, count: 8, dur: 1.4, vel: 0.44 }), { gain: 0.65, pan: -0.2 }),
      track('kalimba', parseNotation('C6:.5 rest:.5 E6:.5 rest:1.5 G6:.5 rest:.5 E6:1 rest:1 D6:.5 rest:.5 C6:.5 rest:2.5 G5:.5 rest:3.5', { defaultVel: 0.3 }).notes, { gain: 0.45, pan: 0.3 }),
    ],
  });
}

// ───────────────────────────── groups from the designer output ─────────────────────────────

/** One Coral: from "Lifted paper under fish" to her last face piece. Coral's body is built from generic washes, so this is a run of ids. */
function fish(K: PageKit, k: number): string[] {
  const start = K.nth('Lifted paper under fish', k);
  const ends = K.all('Eye sparkle').filter(id => K.indexOf(id) > K.indexOf(start));
  let end = ends[0]; if (!end) throw new Error(`p${K.n}: Coral ${k} has no eye sparkle`);
  const next = K.after(end);
  if (/^(Small (happy|open) mouth|Ink detail)$/.test(K.labelOf(next))) end = next;
  return K.span(start, end);
}
/** One Lumi: from her glow to her sparkle (her body is generic washes in between). */
function lumi(K: PageKit, k: number): string[] {
  let end = K.nth('Lumi sparkle', k);
  const next = K.after(end);
  if (K.labelOf(next) === 'Ink detail') end = next;
  return K.span(K.nth('Lumi glow', k), end);
}
const LIGHTS = ['Lumi glow', 'Teal halos', 'Glow rings', 'Glowing dots'];
const lightsOf = (K: PageKit, ids: string[]) => ids.filter(id => LIGHTS.includes(K.labelOf(id)));
const eyesOf = (K: PageKit, ids: string[]) => ids.filter(id => ['Eye', 'Pupil', 'Eye sparkle'].includes(K.labelOf(id)));
const BUBBLES = ['label:Bubble tint', 'label:Bubble wet rings', 'label:Bubble glints'];

// ───────────────────────────── small builders ─────────────────────────────

/** A decorative object that exists on every page: `set text` on it changes nothing on screen but is announced by the page's live region. */
const SAY_TARGET = { label: 'Paper edge warmth' } as const;
const say = (text: string): Action => ({ do: 'set', target: SAY_TARGET, props: { text } });
const WATER = '#06203a';
const tint = (opacity: number, fill = WATER): Action => ({ do: 'set', target: { page: true }, props: { fill, opacity } });

const idle = (id: string, group: string, preset: NonNullable<Extract<Action, { do: 'animate' }>['anim']['preset']>, amount = 1, extra: Record<string, unknown> = {}): Behavior =>
  bhv(id, { group }, { type: 'idle' }, [{ do: 'animate', anim: { preset, amount, loop: 'infinite', ...extra } }]);

/** A tap with a reduced-motion twin built from it (sound, state and an announcement stay; movement and particles go). */
function tap(id: string, target: Behavior['target'], hint: string, doing: Action[], o: { still?: Action[]; announce?: string; once?: boolean; cooldownMs?: number } = {}): Behavior {
  return bhv(id, target, { type: 'tap' }, doing, {
    hint, ...(o.once ? { once: true } : {}), ...(o.cooldownMs ? { cooldownMs: o.cooldownMs } : {}),
    reduced: [...withoutMotion(doing), ...(o.still ?? []), ...(o.announce ? [say(o.announce)] : [])],
  });
}

const page = (n: number, p: Omit<LivingPage, 'page' | 'narration'>): LivingPage => ({ page: n, ...p, narration: spreadNarration(BOOK, n) });
const musicOn = (cue: string, bed = 'ocean-hum', gain = 0.28) => ({ music: { cue, fadeMs: 2400 }, ambience: { bed, gain } });
const depthOn = (value: number): Behavior => bhv(`enter-depth`, { page: true }, { type: 'enter' }, [{ do: 'depth', value }]);

const hop: Action = { do: 'animate', anim: { preset: 'bounce', amount: 1.1 } };

// ───────────────────────────── pages ─────────────────────────────

function p1(): LivingPage {
  const K = pageKit(BOOK, 1); const coral = fish(K, 1); const lm = lumi(K, 1);
  return page(1, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm), bubbles: BUBBLES, letters: ['label:Title letter*'], sunGlow: ['label:Surface sun glow'] },
    ...musicOn('reef'),
    a11y: { summary: 'The cover: Coral the reef fish floats in blue water with a tiny glowing fish, Lumi, below her.', instructions: 'Tap Coral to make her hop. Tap Lumi to make her lights twinkle.' },
    behaviors: [
      depthOn(0),
      idle('p1-coral-swim', 'coral', 'swim', 0.6),
      idle('p1-coral-blink', 'coralEyes', 'blink'),
      idle('p1-lumi-twinkle', 'lumiLights', 'twinkle', 0.8),
      idle('p1-bubbles', 'bubbles', 'bob', 0.5),
      idle('p1-sun-breathe', 'sunGlow', 'breathe', 1.5),
      idle('p1-title-float', 'letters', 'float', 0.5),
      tap('p1-tap-coral', { group: 'coral' }, 'Tap Coral to make her hop', [hop, { do: 'sfx', sound: 'bubble', params: { variation: 0.3, gain: 0.8 } }, { do: 'note', instrument: 'harp', note: 'scale:C5,E5,G5,A5,C6' }, { do: 'burst', kind: 'bubbles', count: 8 }, { do: 'haptic', pattern: 'tap' }], { announce: 'Coral hops.' }),
      tap('p1-tap-lumi', { group: 'lumi' }, 'Tap Lumi to make her lights twinkle', [{ do: 'animate', target: { group: 'lumiLights' }, anim: { preset: 'pulse', amount: 1.4 } }, { do: 'sfx', sound: 'twinkle' }, { do: 'burst', kind: 'sparkles', count: 8 }, { do: 'haptic', pattern: 'soft' }], { announce: 'Lumi twinkles.' }),
    ],
  });
}

function p2(): LivingPage {
  const K = pageKit(BOOK, 2); const coral = fish(K, 1);
  const sun = K.span(K.nth('Sun glow'), K.nth('Ink detail'));
  return page(2, {
    groups: { coral, coralEyes: eyesOf(K, coral), sun, sunGlow: ['label:Sun glow'], shafts: ['label:Lifted light shaft'], bubbles: BUBBLES },
    ...musicOn('reef'),
    a11y: { summary: 'A bright reef: golden ribbons of sunlight wobble over the sand, a smiling sun above, Coral turning a happy somersault.', instructions: 'Tap the sun to send out ripples of light. Tap Coral to make her hop.' },
    behaviors: [
      depthOn(0),
      idle('p2-coral-swim', 'coral', 'swim', 0.5),
      idle('p2-coral-blink', 'coralEyes', 'blink'),
      idle('p2-shafts', 'shafts', 'drift', 1.2),
      idle('p2-sun-glow', 'sunGlow', 'breathe', 2),
      idle('p2-bubbles', 'bubbles', 'bob', 0.5),
      tap('p2-tap-sun', { group: 'sun' }, 'Tap the sun to send ripples of light across the water', [
        { do: 'animate', target: { group: 'sunGlow' }, anim: { preset: 'pulse', amount: 1.5 } },
        { do: 'animate', target: { group: 'shafts' }, anim: { preset: 'shimmer', amount: 1.6, loop: 3 } },
        { do: 'sfx', sound: 'harp-gliss', params: { gain: 0.8 } }, { do: 'burst', kind: 'sparkles', count: 10 }, { do: 'haptic', pattern: 'soft' },
      ], { announce: 'The sun sends ripples of light.' }),
      tap('p2-tap-coral', { group: 'coral' }, 'Tap Coral to make her hop', [hop, { do: 'sfx', sound: 'boing', params: { gain: 0.6, pitch: 4 } }, { do: 'burst', kind: 'bubbles', count: 8 }, { do: 'haptic', pattern: 'tap' }], { announce: 'Coral hops for joy.' }),
    ],
  });
}

function p3(): LivingPage {
  const K = pageKit(BOOK, 3); const coral = fish(K, 1);
  return page(3, {
    // the cloud is four lifted-paper highlights plus the grey washes painted between them: one run of ids, under the porthole rim
    groups: { coral, coralEyes: eyesOf(K, coral), cloud: K.span(K.nth('Lifted cloud paper', 1), K.before(K.nth('Porthole rim'))), hiddenSun: ['label:Hidden sun glow'] },
    vars: { peek: 0 },
    ...musicOn('descent'),
    a11y: { summary: 'A round porthole: a big cloud hides the sun, the water goes grey, and small wide-eyed Coral stares into the dark.', instructions: 'Drag the cloud to the left to peek at the sun behind it. It slides back when you let go.' },
    behaviors: [
      depthOn(0.1),
      bhv('p3-gloom', { page: true }, { type: 'enter' }, [tint(0.16, '#33475a')]),
      idle('p3-coral-blink', 'coralEyes', 'blink'),
      idle('p3-cloud-drift', 'cloud', 'drift', 1),
      bhv('p3-sun-scrub', { group: 'hiddenSun' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:peek' } }]),
      bhv('p3-cloud-drag', { group: 'cloud' }, { type: 'drag', axis: 'x', bounds: { minX: -230, maxX: 0 }, snapBack: true, progressVar: 'peek' }, [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.45 } }, { do: 'haptic', pattern: 'soft' }], {
        hint: 'Drag the cloud to the left to peek at the sun behind it', reduced: [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.45 } }, say('The cloud slides aside. The sun is still there.')],
      }),
      bhv('p3-cloud-tap', { group: 'cloud' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'whoosh', params: { gain: 0.45 } }, { do: 'var', name: 'peek', op: 'set', value: 1 }, { do: 'wait', ms: 2200 }, { do: 'var', name: 'peek', op: 'set', value: 0 },
      ], { hint: 'Tap the cloud to peek at the sun behind it for a moment', reduced: [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.45 } }, { do: 'var', name: 'peek', op: 'set', value: 1 }, { do: 'wait', ms: 2200 }, { do: 'var', name: 'peek', op: 'set', value: 0 }] }),
      bhv('p3-peek-light', { page: true }, { type: 'when', cond: gt('peek', 0.35) }, [tint(0)]),
      bhv('p3-peek-gloom', { page: true }, { type: 'when', cond: lt('peek', 0.35) }, [tint(0.16, '#33475a')]),
      bhv('p3-peek-found', { page: true }, { type: 'when', cond: gt('peek', 0.8) }, [{ do: 'sfx', sound: 'twinkle' }, { do: 'note', instrument: 'harp', note: 'G5' }, say('The sun is still there, behind the cloud.')]),
      tap('p3-tap-coral', { group: 'coral' }, 'Tap Coral to make her gasp', [{ do: 'animate', anim: { preset: 'shake', amount: 0.6 } }, { do: 'sfx', sound: 'squeak', params: { gain: 0.5, pitch: 3 } }, { do: 'haptic', pattern: 'soft' }], { announce: 'Coral gasps.' }),
    ],
  });
}

/** The three light zones, from the surface down. Used by the descent (p4) and the jelly garden (p7). */
interface Zone { lo: number; hi: number; tint: number; name?: string; dp?: number }

function p4(): LivingPage {
  const K = pageKit(BOOK, 4);
  const coral = fish(K, 1), echo2 = fish(K, 2), echo3 = fish(K, 3);
  const MAXY = Math.round(K.box(echo3).y - K.box(coral).y);   // Coral rides down to where the third painted Coral sits
  const zones: Zone[] = [
    { lo: 0, hi: 0.22, tint: 0 },
    { lo: 0.22, hi: 0.5, tint: 0.1, name: 'Twilight zone. About two hundred metres down the sunlight is almost gone.' },
    { lo: 0.5, hi: 0.78, tint: 0.22, name: 'Deep water. The blue is turning to night.' },
    { lo: 0.78, hi: 1.01, tint: 0.36, name: 'Midnight zone. No sunlight reaches here, and tiny lights are glowing below.' },
  ];
  const stepTo = (y: number, depth: number): Action[] => [{ do: 'set', target: { group: 'coral' }, props: { y } }, { do: 'var', name: 'depth', op: 'set', value: depth }, { do: 'depth', value: { fromVar: 'depth' } }];
  return page(4, {
    groups: {
      coral, coralEcho: [...echo2, ...echo3], coralEyes: eyesOf(K, coral), glowDots: ['label:Teal halos', 'label:Glow rings', 'label:Glowing dots'],
      reefTips: ['label:Coral branches', 'label:Coral branch lights', 'label:Coral tips', 'label:Coral trunk'],
    },
    vars: { depth: 0 },
    goals: [{ id: 'dive', label: 'Dive down to the glowing lights', when: gt('depth', 0.95) }],
    ...musicOn('descent', 'ocean-hum', 0.3),
    a11y: { summary: 'Three painted bands, darker from top to bottom. Coral swims down past a starfish towards tiny glowing lights.', instructions: 'Drag Coral down to dive. The water darkens, the lights glow, and the sound gets deeper. Without dragging: tap Coral to dive a little further, or use the arrow keys.' },
    behaviors: [
      bhv('p4-enter', { page: true }, { type: 'enter' }, [{ do: 'depth', value: 0 }, { do: 'set', target: { group: 'coralEcho' }, props: { opacity: 0.26 } }]),
      idle('p4-coral-blink', 'coralEyes', 'blink'),
      idle('p4-reef-sway', 'reefTips', 'sway', 0.5),
      idle('p4-dots-breathe', 'glowDots', 'breathe', 1.2),
      // the glowing dots only appear once the water is deep
      bhv('p4-dots-scrub', { group: 'glowDots' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0 }, { at: 0.4, opacity: 0 }, { at: 0.85, opacity: 1 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:depth' } }]),
      bhv('p4-dive', { group: 'coral' }, { type: 'drag', axis: 'y', bounds: { minY: 0, maxY: MAXY }, progressVar: 'depth' }, [
        { do: 'depth', value: { fromVar: 'depth' } }, { do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, { do: 'haptic', pattern: 'soft' },
      ], { hint: 'Drag Coral down to dive deeper', reduced: [{ do: 'depth', value: { fromVar: 'depth' } }, { do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, say('Coral dives.')] }),
      bhv('p4-dive-tap', { group: 'coral' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'bubble', params: { gain: 0.7 } },
        { do: 'if', cond: lt('depth', 0.3), then: stepTo(Math.round(MAXY / 3), 0.34), else: [{ do: 'if', cond: lt('depth', 0.65), then: stepTo(Math.round(MAXY * 2 / 3), 0.67), else: stepTo(MAXY, 1) }] },
      ], { hint: 'Tap Coral to dive a little deeper', reduced: [{ do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, { do: 'if', cond: lt('depth', 0.3), then: stepTo(Math.round(MAXY / 3), 0.34), else: [{ do: 'if', cond: lt('depth', 0.65), then: stepTo(Math.round(MAXY * 2 / 3), 0.67), else: stepTo(MAXY, 1) }] }] }),
      ...zones.map((z, i): Behavior => bhv(`p4-zone-${i}`, { page: true }, { type: 'when', cond: band('depth', z.lo, z.hi) }, [
        tint(z.tint),
        ...(z.name ? [say(z.name)] : []),
      ])),
      bhv('p4-fireflies', { page: true }, { type: 'when', cond: gt('depth', 0.55) }, [{ do: 'burst', at: { group: 'glowDots' }, kind: 'fireflies', count: 8 }, { do: 'sfx', sound: 'twinkle', params: { gain: 0.6 } }]),
      bhv('p4-found-lights', { page: true }, { type: 'when', cond: gt('depth', 0.95) }, [{ do: 'sfx', sound: 'glass-chime' }, { do: 'note', instrument: 'harp', note: 'E5' }, { do: 'haptic', pattern: 'success' }, say('Coral reaches the glowing lights.')]),
    ],
  });
}

function p5(): LivingPage {
  const K = pageKit(BOOK, 5); const coral = fish(K, 1); const lm = lumi(K, 1);
  return page(5, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm) },
    ...musicOn('deep', 'ocean-hum', 0.22),
    a11y: { summary: 'Deep navy water. Tiny Coral is lower left; a small teal light in the middle turns towards her.', instructions: 'Move your finger over the page and Lumi\'s glow drifts towards it. Tap Lumi to make her glow brighter.' },
    behaviors: [
      depthOn(0.85),
      bhv('p5-lumi-follow', { group: 'lumiLights' }, { type: 'enter' }, [{ do: 'follow', target: { group: 'lumiLights' }, to: 'pointer', lagMs: 420, maxOffset: 70 }]),
      idle('p5-lumi-breathe', 'lumiLights', 'breathe', 1.4),
      idle('p5-coral-blink', 'coralEyes', 'blink'),
      idle('p5-coral-float', 'coral', 'float', 0.4),
      tap('p5-tap-lumi', { group: 'lumi' }, 'Tap Lumi to make her glow brighter', [
        { do: 'animate', target: { group: 'lumiLights' }, anim: { preset: 'pulse', amount: 1.6 } },
        { do: 'sfx', sound: 'glass-chime', params: { gain: 0.7 } }, { do: 'note', instrument: 'glass', note: 'scale:A5,C6,E6' }, { do: 'haptic', pattern: 'soft' },
      ], { announce: 'Lumi glows brighter.' }),
      tap('p5-tap-coral', { group: 'coral' }, 'Tap Coral to hear her whisper', [{ do: 'sfx', sound: 'bubble', params: { gain: 0.5, pitch: -3 } }, { do: 'animate', anim: { preset: 'shake', amount: 0.4 } }], { announce: 'Coral whispers, I want to go back.' }),
    ],
  });
}

function p6(): LivingPage {
  const K = pageKit(BOOK, 6); const coral = fish(K, 1); const lm = lumi(K, 1);
  return page(6, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm), bigGlow: ['label:Lumi big glow'] },
    ...musicOn('glow', 'ocean-hum', 0.22),
    a11y: { summary: 'Lumi close up, her teal lights glowing; Coral small and astonished beside her.', instructions: 'Tap Lumi to hear her bubbly laugh and see her lights shine. Tap Coral for a squeak.' },
    behaviors: [
      depthOn(0.8),
      idle('p6-glow-breathe', 'bigGlow', 'breathe', 1.5),
      idle('p6-lights-twinkle', 'lumiLights', 'twinkle', 0.7),
      idle('p6-coral-blink', 'coralEyes', 'blink'),
      idle('p6-coral-float', 'coral', 'float', 0.4),
      tap('p6-tap-lumi', { group: 'lumi' }, 'Tap Lumi to hear her bubbly laugh', [
        { do: 'animate', target: { group: 'lumiLights' }, anim: { preset: 'pulse', amount: 1.5 } },
        { do: 'note', instrument: 'glass', note: 'scale:C5,D5,E5,G5,A5' }, { do: 'sfx', sound: 'bubble', params: { pitch: 2, gain: 0.6 } },
        { do: 'wait', ms: 180 }, { do: 'sfx', sound: 'bubble', params: { pitch: 5, gain: 0.5 } }, { do: 'wait', ms: 160 }, { do: 'sfx', sound: 'bubble', params: { pitch: 8, gain: 0.45 } },
        { do: 'burst', kind: 'bubbles', count: 6 }, { do: 'haptic', pattern: 'soft' },
      ], { announce: 'Lumi laughs a soft, bubbly laugh.' }),
      tap('p6-tap-coral', { group: 'coral' }, 'Tap Coral to make her squeak', [{ do: 'sfx', sound: 'squeak', params: { pitch: 4, gain: 0.5 } }, hop], { announce: 'Coral squeaks.' }),
    ],
  });
}

function p7(): LivingPage {
  const K = pageKit(BOOK, 7); const coral = fish(K, 1); const lm = lumi(K, 1);
  const jellyStart = [1, 2, 3, 4].map(k => K.nth('Jelly glow', k)); const j5 = K.nth('Lifted paper under jelly', 5);
  const jellies: string[][] = [
    K.span(jellyStart[0], K.before(jellyStart[1])), K.span(jellyStart[1], K.before(jellyStart[2])), K.span(jellyStart[2], K.before(jellyStart[3])),
    K.span(jellyStart[3], K.before(j5)), K.span(j5, K.before(K.nth('Lumi glow'))),
  ];
  const MAXY = 120;   // Coral stops above the second paragraph
  const zones: Zone[] = [
    { lo: 0, hi: 0.2, tint: 0, dp: 0.45 }, { lo: 0.2, hi: 0.4, tint: 0.06, dp: 0.55 }, { lo: 0.4, hi: 0.6, tint: 0.12, dp: 0.66 },
    { lo: 0.6, hi: 0.8, tint: 0.18, dp: 0.78 }, { lo: 0.8, hi: 1.01, tint: 0.24, dp: 0.92 },
  ];
  const notes = ['E5', 'G5', 'A5', 'C6', 'D6'];
  return page(7, {
    groups: {
      coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm), glows: ['label:Jelly glow', 'label:Ring of light'], allJellies: jellies.flat(),
      ...Object.fromEntries(jellies.map((j, i) => [`jelly${i + 1}`, j])), ...Object.fromEntries(jellies.slice(0, 4).map((j, i) => [`glow${i + 1}`, [K.nth('Jelly glow', i + 1), K.nth('Ring of light', i + 1)]])),
    },
    vars: { dive: 0, dp: 0.45 },
    ...musicOn('glow', 'ocean-hum', 0.24),
    a11y: { summary: 'A deep panorama of glowing jellies in rings of blue and violet, with Lumi and Coral swimming between them.', instructions: 'Drag Coral down and the water darkens and the jellies light up. Tap a jelly to hear its glass chime. Without dragging: tap Coral to dive deeper, or use the arrow keys.' },
    behaviors: [
      bhv('p7-enter', { page: true }, { type: 'enter' }, [{ do: 'depth', value: { fromVar: 'dp' } }]),
      idle('p7-coral-blink', 'coralEyes', 'blink'),
      idle('p7-lumi-twinkle', 'lumiLights', 'twinkle', 0.6),
      ...jellies.map((_j, i) => idle(`p7-jelly${i + 1}-float`, `jelly${i + 1}`, 'float', 0.5 + (i % 3) * 0.15)),
      // the jellies are dim near the surface and light up as Coral dives
      bhv('p7-glows-scrub', { group: 'glows' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0.3 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:dive' } }]),
      bhv('p7-lights-scrub', { group: 'lumiLights' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0.45 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:dive' } }]),
      bhv('p7-dive', { group: 'coral' }, { type: 'drag', axis: 'y', bounds: { minY: 0, maxY: MAXY }, progressVar: 'dive' }, [{ do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, { do: 'haptic', pattern: 'soft' }], {
        hint: 'Drag Coral down to dive deeper and light up the jellies', reduced: [{ do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, say('Coral dives and the jellies glow.')],
      }),
      bhv('p7-dive-tap', { group: 'coral' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'bubble', params: { gain: 0.7 } },
        { do: 'if', cond: lt('dive', 0.45), then: [{ do: 'set', target: { group: 'coral' }, props: { y: Math.round(MAXY * 0.5) } }, { do: 'var', name: 'dive', op: 'set', value: 0.5 }], else: [{ do: 'set', target: { group: 'coral' }, props: { y: MAXY } }, { do: 'var', name: 'dive', op: 'set', value: 1 }] },
      ], { hint: 'Tap Coral to dive a little deeper', reduced: [{ do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, { do: 'if', cond: lt('dive', 0.45), then: [{ do: 'set', target: { group: 'coral' }, props: { y: Math.round(MAXY * 0.5) } }, { do: 'var', name: 'dive', op: 'set', value: 0.5 }], else: [{ do: 'set', target: { group: 'coral' }, props: { y: MAXY } }, { do: 'var', name: 'dive', op: 'set', value: 1 }] }] }),
      ...zones.map((z, i): Behavior => bhv(`p7-zone-${i}`, { page: true }, { type: 'when', cond: band('dive', z.lo, z.hi) }, [tint(z.tint), { do: 'var', name: 'dp', op: 'set', value: z.dp! }])),
      ...jellies.map((_j, i): Behavior => tap(`p7-tap-jelly${i + 1}`, { group: `jelly${i + 1}` }, `Tap jelly number ${i + 1} to hear its glass chime`, [
        { do: 'animate', anim: { preset: 'bob', amount: 1.4, loop: 2 } },
        ...(i < 4 ? [{ do: 'animate', target: { group: `glow${i + 1}` }, anim: { preset: 'pulse', amount: 1.4 } } as Action] : []),
        { do: 'sfx', sound: 'glass-chime', params: { pitch: [0, 3, 5, 8, 10][i], gain: 0.8 } }, { do: 'note', instrument: 'glass', note: notes[i], durationMs: 900 },
        { do: 'burst', kind: 'sparkles', count: 6 }, { do: 'haptic', pattern: 'soft' },
      ], { announce: `Jelly ${i + 1} chimes.` })),
    ],
  });
}

function p8(): LivingPage {
  const K = pageKit(BOOK, 8); const coral = fish(K, 1); const lm = lumi(K, 1);
  const RISE = 200;
  const stage = (id: string, lo: number, hi: number, dp: number, t: number): Behavior => bhv(id, { page: true }, { type: 'when', cond: band('rise', lo, hi) }, [{ do: 'depth', value: dp }, tint(t)]);
  return page(8, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm), pooled: ['label:Pooled light'] },
    vars: { rise: 0 },
    goals: [{ id: 'surface', label: 'Rise up towards the light', when: gt('rise', 0.9) }],
    ...musicOn('glow', 'ocean-hum', 0.22),
    a11y: { summary: 'Coral and Lumi rise together through the dim blue, their lights pooling around them.', instructions: 'Drag Coral upwards and Lumi rises with her. The water gets lighter and the sound brightens. Without dragging: tap Coral to rise, or use the arrow keys.' },
    behaviors: [
      bhv('p8-enter', { page: true }, { type: 'enter' }, [{ do: 'depth', value: 0.6 }, tint(0.28)]),
      idle('p8-coral-blink', 'coralEyes', 'blink'),
      idle('p8-lumi-twinkle', 'lumiLights', 'twinkle', 0.7),
      idle('p8-pool-breathe', 'pooled', 'breathe', 1.5),
      // Lumi swims up beside her
      bhv('p8-lumi-rides', { group: 'lumi' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, y: 0 }, { at: 1, y: -RISE }], durationMs: 1000, easing: 'var:rise' } }]),
      bhv('p8-rise', { group: 'coral' }, { type: 'drag', axis: 'y', bounds: { minY: -RISE, maxY: 0 }, progressVar: 'rise' }, [
        { do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, { do: 'trail', kind: 'bubbles', whileVar: 'rise.dragging' }, { do: 'haptic', pattern: 'soft' },
      ], { hint: 'Drag Coral upwards to swim up with Lumi', reduced: [{ do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, say('Coral and Lumi swim up.')] }),
      bhv('p8-rise-tap', { group: 'coral' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'bubble', params: { gain: 0.7 } },
        { do: 'if', cond: lt('rise', 0.45), then: [{ do: 'set', target: { group: 'coral' }, props: { y: -Math.round(RISE / 2) } }, { do: 'set', target: { group: 'lumi' }, props: { y: -Math.round(RISE / 2) } }, { do: 'var', name: 'rise', op: 'set', value: 0.5 }], else: [{ do: 'set', target: { group: 'coral' }, props: { y: -RISE } }, { do: 'set', target: { group: 'lumi' }, props: { y: -RISE } }, { do: 'var', name: 'rise', op: 'set', value: 1 }] },
      ], { hint: 'Tap Coral to swim up a little', reduced: [{ do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, { do: 'if', cond: lt('rise', 0.45), then: [{ do: 'set', target: { group: 'coral' }, props: { y: -Math.round(RISE / 2) } }, { do: 'var', name: 'rise', op: 'set', value: 0.5 }], else: [{ do: 'set', target: { group: 'coral' }, props: { y: -RISE } }, { do: 'var', name: 'rise', op: 'set', value: 1 }] }] }),
      stage('p8-stage-0', 0, 0.3, 0.6, 0.28), stage('p8-stage-1', 0.3, 0.6, 0.4, 0.18), stage('p8-stage-2', 0.6, 0.9, 0.22, 0.08), stage('p8-stage-3', 0.9, 1.01, 0.08, 0),
      bhv('p8-arrived', { page: true }, { type: 'when', cond: gt('rise', 0.9) }, [{ do: 'sfx', sound: 'harp-gliss', params: { gain: 0.7 } }, { do: 'burst', at: { group: 'lumiLights' }, kind: 'sparkles', count: 10 }, say('Coral and Lumi are almost back in the light.')]),
    ],
  });
}

function p9(): LivingPage {
  const K = pageKit(BOOK, 9); const coral = fish(K, 1); const lm = lumi(K, 1);
  return page(9, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm), sun: ['label:Sun glow'], ribbons: ['label:Bristle streaks', 'label:Bristle streaks (lifted)'], tentacles: ['label:Jelly tentacle', 'label:Jelly tentacle core'] },
    ...musicOn('reef', 'ocean-hum', 0.2),
    a11y: { summary: 'The cloud slides away and golden ribbons of sunlight ripple across the sand again. Coral and Lumi swim up through the blue.', instructions: 'Tap the sun to make the golden ribbons ripple. Tap Coral to make her hop.' },
    behaviors: [
      depthOn(0.12),
      idle('p9-coral-blink', 'coralEyes', 'blink'),
      idle('p9-coral-swim', 'coral', 'swim', 0.5),
      idle('p9-ribbons', 'ribbons', 'drift', 1.2),
      idle('p9-sun', 'sun', 'breathe', 2),
      idle('p9-tentacles', 'tentacles', 'sway', 0.6),
      idle('p9-lumi-twinkle', 'lumiLights', 'twinkle', 0.6),
      tap('p9-tap-sun', { group: 'sun' }, 'Tap the sun to make the golden ribbons ripple', [
        { do: 'animate', target: { group: 'ribbons' }, anim: { preset: 'wave', amount: 1.5, loop: 3 } }, { do: 'animate', anim: { preset: 'pulse', amount: 1.6 } },
        { do: 'sfx', sound: 'harp-gliss' }, { do: 'burst', kind: 'sparkles', count: 12 }, { do: 'haptic', pattern: 'success' },
      ], { announce: 'The sun shines and the golden ribbons ripple.' }),
      tap('p9-tap-coral', { group: 'coral' }, 'Tap Coral to make her hop', [hop, { do: 'sfx', sound: 'boing', params: { gain: 0.6, pitch: 5 } }, { do: 'burst', kind: 'bubbles', count: 8 }], { announce: 'Coral hops. The sun was there all along.' }),
    ],
  });
}

function p10(): LivingPage {
  const K = pageKit(BOOK, 10); const coral = fish(K, 1); const lm = lumi(K, 1);
  return page(10, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm), mabelEye: ['label:Whale eye white', 'label:Whale pupil', 'label:Eye glint', 'label:Eye glint small'], pupil: ['label:Whale pupil', 'label:Eye glint', 'label:Eye glint small'], brow: ['label:Whale brow'] },
    ...musicOn('night', 'ocean-hum', 0.2),
    a11y: { summary: 'Mabel, an old humpback whale, fills the page: her enormous kind eye, with a tiny Coral and Lumi in the corners.', instructions: 'Tap Mabel\'s eye to hear a long whale call. Press and hold it to sing with her: slide your finger up or down to bend the note.' },
    behaviors: [
      depthOn(0.3),
      idle('p10-eye-blink', 'mabelEye', 'blink'),
      idle('p10-brow', 'brow', 'sway', 0.5),
      idle('p10-pupil', 'pupil', 'breathe', 1),
      idle('p10-lumi-twinkle', 'lumiLights', 'twinkle', 0.6),
      idle('p10-coral-blink', 'coralEyes', 'blink'),
      tap('p10-tap-eye', { group: 'mabelEye' }, 'Tap Mabel\'s eye to hear her whale call', [
        { do: 'sfx', sound: 'whale-call', params: { gain: 0.9 } }, { do: 'duck', amount: 0.5, ms: 3200 },
        { do: 'animate', target: { group: 'pupil' }, anim: { preset: 'pulse', amount: 0.8 } }, { do: 'burst', kind: 'bubbles', count: 8 }, { do: 'haptic', pattern: 'soft' },
      ], { announce: 'Mabel sings a long, low song.' }),
      bhv('p10-hold-eye', { group: 'mabelEye' }, { type: 'press', minMs: 380 }, [
        { do: 'note', instrument: 'whale', note: 'A2', gain: 0.9 }, { do: 'duck', amount: 0.5, ms: 4500 }, { do: 'animate', target: { group: 'pupil' }, anim: { preset: 'pulse', amount: 0.8 } }, { do: 'haptic', pattern: 'soft' },
      ], { hint: 'Press and hold Mabel\'s eye to sing with her, slide up or down to bend the note', reduced: [{ do: 'note', instrument: 'whale', note: 'A2', gain: 0.9 }, say('Mabel sings with you.')] }),
    ],
  });
}

function p11(): LivingPage {
  const K = pageKit(BOOK, 11); const coral = fish(K, 1); const lm = lumi(K, 1);
  return page(11, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm), stars: ['label:Fading stars'], dawn: ['label:Dawn glow'], ribbons: ['label:Bristle streaks', 'label:Bristle streaks (lifted)'] },
    ...musicOn('dawn', 'ocean-hum', 0.18),
    a11y: { summary: 'A calm wash of dawn: Coral and Lumi swim side by side under fading stars, a golden ribbon of light behind them.', instructions: 'Tap the stars to play them like a kalimba. Tap Lumi to make her shine.' },
    behaviors: [
      depthOn(0.05),
      idle('p11-dawn', 'dawn', 'breathe', 1.6),
      idle('p11-ribbons', 'ribbons', 'drift', 1),
      idle('p11-coral-blink', 'coralEyes', 'blink'),
      idle('p11-coral-swim', 'coral', 'swim', 0.5),
      idle('p11-lumi-twinkle', 'lumiLights', 'twinkle', 0.7),
      idle('p11-stars', 'stars', 'twinkle', 1),
      tap('p11-tap-stars', { group: 'stars' }, 'Tap the fading stars to play a gentle tune', [
        { do: 'animate', anim: { preset: 'pulse', amount: 1.2 } }, { do: 'note', instrument: 'kalimba', note: 'scale:C5,D5,E5,G5,A5,C6' }, { do: 'sfx', sound: 'twinkle', params: { gain: 0.6 } }, { do: 'burst', kind: 'stars', count: 6 },
      ], { announce: 'The stars twinkle a tune.' }),
      tap('p11-tap-lumi', { group: 'lumi' }, 'Tap Lumi to make her shine', [
        { do: 'animate', target: { group: 'lumiLights' }, anim: { preset: 'pulse', amount: 1.5 } }, { do: 'sfx', sound: 'glass-chime', params: { gain: 0.7 } }, { do: 'burst', kind: 'sparkles', count: 8 }, { do: 'haptic', pattern: 'soft' },
      ], { announce: 'Lumi shines. The dark is never empty.' }),
    ],
  });
}

function p12(): LivingPage {
  const K = pageKit(BOOK, 12);
  const lumis = [1, 2, 3, 4, 5].map(k => lumi(K, k));
  const lights = lumis.map(l => lightsOf(K, l));
  // the four jellies: each starts at its first tentacle and runs to just before the next one starts
  const ten = (k: number) => K.nth('Jelly tentacle', k);
  const jellyBlocks = [K.span(ten(1), K.before(ten(6))), K.span(ten(6), K.before(ten(9))), K.span(ten(9), K.before(ten(14))), K.span(ten(14), K.before(K.nth('Lifted paper under fish')))];
  const notes = ['C5', 'D5', 'E5', 'G5', 'A5'];
  const count = (name: string, total: number, noun: string): Action[] => Array.from({ length: total }, (_x, i): Action => ({ do: 'if', cond: { var: name, op: '==', value: i + 1 }, then: [say(`${noun}: ${i + 1} of ${total}.`)] }));
  return page(12, {
    groups: {
      allLights: lights.flat(), reefTips: ['label:Coral branches', 'label:Coral branch lights', 'label:Coral tips', 'label:Coral trunk'], letters: ['label:Title letter*'],
      ...Object.fromEntries(lumis.map((l, i) => [`lumi${i + 1}`, l])), ...Object.fromEntries(lights.map((l, i) => [`lights${i + 1}`, l])),
      ...Object.fromEntries(jellyBlocks.map((j, i) => [`jelly${i + 1}`, j])),
    },
    vars: { found: 0, jellies: 0 },
    goals: [
      { id: 'found-all-lumis', label: 'Find all five Lumis', when: gt('found', 5), celebrate: true },
      { id: 'counted-jellies', label: 'Count the four jellies', when: gt('jellies', 4) },
    ],
    ...musicOn('play', 'ocean-hum', 0.18),
    a11y: { summary: 'A framed underwater scene with five tiny lanterns hidden in it, four jellies, and a circle to draw your own glowing fish.', instructions: 'Find the five hidden Lumis and tap each one. Then tap each jelly to count them.' },
    behaviors: [
      depthOn(0.35),
      // the lights of every hidden Lumi start dark: they glow when found
      bhv('p12-hide-lights', { group: 'allLights' }, { type: 'enter' }, [{ do: 'set', props: { opacity: 0 } }]),
      idle('p12-reef', 'reefTips', 'sway', 0.5),
      idle('p12-title', 'letters', 'float', 0.4),
      ...lumis.map((_l, i): Behavior => bhv(`p12-find-lumi${i + 1}`, { group: `lumi${i + 1}` }, { type: 'tap' }, [
        { do: 'set', target: { group: `lights${i + 1}` }, props: { opacity: 1 } },
        { do: 'animate', target: { group: `lights${i + 1}` }, anim: { preset: 'pop-in', amount: 1 } },
        { do: 'sfx', sound: 'glass-chime', params: { pitch: [0, 2, 4, 7, 9][i], gain: 0.8 } }, { do: 'note', instrument: 'glass', note: notes[i], durationMs: 900 },
        { do: 'burst', at: { group: `lights${i + 1}` }, kind: 'sparkles', count: 8 }, { do: 'haptic', pattern: 'success' },
        { do: 'var', name: 'found', op: 'inc' }, ...count('found', 5, 'Found a Lumi'),
      ], {
        hint: `Tap here if you spot hidden Lumi number ${i + 1}`, once: true,
        reduced: [{ do: 'set', target: { group: `lights${i + 1}` }, props: { opacity: 1 } }, { do: 'sfx', sound: 'glass-chime', params: { pitch: [0, 2, 4, 7, 9][i], gain: 0.8 } }, { do: 'var', name: 'found', op: 'inc' }, ...count('found', 5, 'Found a Lumi')],
      })),
      // the runtime's own celebrate() asks for a sound called "celebrate" that the audio catalogue does not have (see the report), so the win has its own
      bhv('p12-all-found', { page: true }, { type: 'when', cond: gt('found', 5) }, [{ do: 'sfx', sound: 'success-jingle' }, { do: 'note', instrument: 'harp', note: 'scale:C5,E5,G5,C6' }, say('You found all five Lumis!')], { reduced: [{ do: 'sfx', sound: 'success-jingle' }, say('You found all five Lumis!')] }),
      ...jellyBlocks.map((_j, i): Behavior => bhv(`p12-count-jelly${i + 1}`, { group: `jelly${i + 1}` }, { type: 'tap' }, [
        { do: 'animate', anim: { preset: 'bob', amount: 1.2, loop: 2 } }, { do: 'sfx', sound: 'jelly-squish', params: { gain: 0.6 } }, { do: 'note', instrument: 'glass', note: ['E5', 'G5', 'A5', 'C6'][i], durationMs: 700 },
        { do: 'var', name: 'jellies', op: 'inc' }, ...count('jellies', 4, 'Jellies counted'),
      ], {
        hint: `Tap jelly number ${i + 1} to count it`, once: true,
        reduced: [{ do: 'sfx', sound: 'jelly-squish', params: { gain: 0.6 } }, { do: 'var', name: 'jellies', op: 'inc' }, ...count('jellies', 4, 'Jellies counted')],
      })),
    ],
  });
}

function p13(): LivingPage {
  const K = pageKit(BOOK, 13); const coral = fish(K, 1); const lm = lumi(K, 1);
  return page(13, {
    groups: { coral, coralEyes: eyesOf(K, coral), lumi: lm, lumiLights: lightsOf(K, lm) },
    ...musicOn('reef', 'ocean-hum', 0.16),
    a11y: { summary: 'The back cover: a quiet watercolor wash of the open sea with Coral and Lumi in the corner, and the blurb.', instructions: 'Tap Coral or Lumi to say goodbye.' },
    behaviors: [
      depthOn(0),
      idle('p13-coral-blink', 'coralEyes', 'blink'),
      idle('p13-coral-swim', 'coral', 'swim', 0.4),
      idle('p13-lumi-twinkle', 'lumiLights', 'twinkle', 0.7),
      tap('p13-tap-coral', { group: 'coral' }, 'Tap Coral to say goodbye', [hop, { do: 'sfx', sound: 'bubble', params: { gain: 0.7 } }, { do: 'burst', kind: 'bubbles', count: 8 }], { announce: 'Coral waves goodbye.' }),
      tap('p13-tap-lumi', { group: 'lumi' }, 'Tap Lumi to say goodnight', [{ do: 'animate', target: { group: 'lumiLights' }, anim: { preset: 'pulse', amount: 1.4 } }, { do: 'sfx', sound: 'glass-chime', params: { gain: 0.7 } }, { do: 'burst', kind: 'sparkles', count: 8 }], { announce: 'Lumi glows goodnight.' }),
    ],
  });
}

export const belowTheBlueLiving: LivingBook = {
  version: 1,
  bookId: BOOK,
  pages: [p1(), p2(), p3(), p4(), p5(), p6(), p7(), p8(), p9(), p10(), p11(), p12(), p13()],
  scores: { reef: scoreReef(), descent: scoreDescent(), deep: scoreDeep(), glow: scoreGlow(), night: scoreNight(), dawn: scoreDawn(), play: scorePlay() },
  defaults: { musicGain: 0.5, sfxGain: 0.8, narrate: 'on-demand', ambient: true },
  authorNotes:
    'Below the Blue shows a variable driving visuals AND audio. On p4 and p7 the child drags Coral down: the drag writes a variable (progressVar), animations scrub with it (easing "var:<name>"), page tint bands darken the water, and the "depth" action low-passes, quiets and reverberates the music and ambience. ' +
    'Characters made of generic washes (Coral, Lumi, each jelly) are targeted as groups of ids taken from the designer output when this file is built. Press-and-hold on Mabel\'s eye plays a held, pitch-bendable "whale" voice. ' +
    'p12 is a hidden-object game: the five Lumis start dark and light up when found. Everything is synthesised in code; every interactive behaviour has a hint and a reduced-motion twin.',
};

export default belowTheBlueLiving;
