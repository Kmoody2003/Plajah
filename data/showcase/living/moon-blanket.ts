// MOON BLANKET: the living edition (ages 2-4, felt). Gentle, tactile, sleepy.
//
// What this file demonstrates about the Tela living format: drag (lift / tuck), state + page tint (the candle dims the room), music tempo
// control (the lullaby slows page by page), haptics, narration ranges and a guessing game. Everything is DATA: open the book in Tela and edit it.
//
// Rules this edition keeps (docs/LIVING_BOOKS.md): no harsh startle for 2-4 (every sfx is gentle, gains are kept low, no honks / pops / confetti),
// sound is off until a gesture, all audio is synthesised, seeds are explicit so the idle motion is deterministic, and the flat page stands alone
// (nothing here is needed to read the page; every behaviour has a reduced twin that shows a still change instead of motion).
//
// Targets are the labels the page designer (story-bedtime) really emits, e.g. "Bear head*" is the head and its felt layers (shadow, fuzzy edge, stitches).
// Objects that appear several times on a page (the three suspects on page 5, the stars) are addressed by their stable ids `p<NN>_<slug>_<k>`.
import type { Action, Behavior, LivingBook, LivingPage, Score } from '../../../services/living/contracts';
import { arpeggiate, chord, chordsToNotes, makeScore, parseNotation, track } from '../../../services/living/audio/compose';
import { moonBlanket } from '../books/moonBlanket';
import { G, ID, L, PAGE, all, blip, eq, ge, goal, ids, idle, lab, narr, onEnter, page, tap, when } from './kitMoonBeep';

const text = (n: number) => moonBlanket.spreads[n - 1].text;

// ───────────────────────────── music: a music-box lullaby that slows page by page ─────────────────────────────
// 'lullaby' is an 8-bar 3/4 tune in F (original). The reader keeps ONE cue running across pages 1-9 and every page's `enter` lowers `musicTempo`,
// so the same tune simply gets slower and sleepier. 'goodnight' (pages 10-11) is a sparse, slower coda.
function lullaby(): Score {
  const melody = parseNotation(
    'A4:1 C5:1 F5:1 | E5:2 C5:1 | D5:1 C5:1 Bb4:1 | A4:3 | A4:1 C5:1 F5:1 | G5:2 E5:1 | D5:1.5 C5:.5 Bb4:1 | F5:3', { defaultVel: 0.62 });
  const roots: Array<[string, string]> = [['F3', 'maj'], ['F3', 'maj'], ['Bb2', 'maj'], ['F3', 'maj'], ['F3', 'maj'], ['C3', 'maj'], ['Bb2', 'maj'], ['F3', 'maj']];
  const harp = roots.flatMap(([r, q], b) => arpeggiate(chord(r, q).map(n => n + 12), { pattern: 'up', step: 1, count: 3, dur: 1.4, t0: b * 3, vel: 0.3 }));
  const pad = chordsToNotes(roots.map(([r, q]) => chord(r, q)), 3, { vel: 0.22, hold: 0.99 });
  return makeScore({
    id: 'lullaby', tempo: 66, beatsPerBar: 3, lengthBeats: melody.lengthBeats, reverb: 0.5,
    variation: { seed: 21, humanizeMs: 16, dropout: 0.03 },
    tracks: [track('musicbox', melody.notes, { gain: 0.8 }), track('harp', harp, { gain: 0.38, pan: -0.25 }), track('pad', pad, { gain: 0.22 })],
  });
}
function goodnight(): Score {
  const melody = parseNotation('A4:3 | C5:2 A4:1 | F4:3 | rest:3 | A4:1.5 C5:1.5 | F5:3 | C5:2 A4:1 | F4:3', { defaultVel: 0.5 });
  const pad = chordsToNotes([chord('F3', 'maj'), chord('F3', 'maj'), chord('Bb2', 'maj'), chord('F3', 'maj'), chord('F3', 'maj'), chord('C3', 'maj'), chord('F3', 'maj'), chord('F3', 'maj')], 3, { vel: 0.2, hold: 0.99 });
  return makeScore({
    id: 'goodnight', tempo: 56, beatsPerBar: 3, lengthBeats: melody.lengthBeats, reverb: 0.6,
    variation: { seed: 8, humanizeMs: 22, dropout: 0.06 },
    tracks: [track('musicbox', melody.notes, { gain: 0.65 }), track('pad', pad, { gain: 0.24 })],
  });
}

// ───────────────────────────── shared parts ─────────────────────────────
/** The lullaby gets slower on every page; the ramp is long so nobody notices a change, only a settling. */
const TEMPO: Record<number, number> = { 1: 1, 2: 0.97, 3: 0.93, 4: 0.9, 5: 0.86, 6: 0.82, 7: 0.78, 8: 0.74, 9: 0.68, 10: 0.9, 11: 0.8 };
/** The Moon's smile grows a little on every page (character bible). */
const SMILE: Record<number, number> = { 1: 1, 3: 1.1, 5: 1.2, 9: 1.4, 10: 1.55 };   // pages with the moon in view
const enterBase = (n: number): Behavior[] => [
  onEnter(`p${n}-tempo`, PAGE, [{ do: 'musicTempo', scale: TEMPO[n], rampMs: 3500 }], 'The lullaby settles'),
  ...(SMILE[n] ? [onEnter(`p${n}-smile`, L('Moon smile*'), [{ do: 'set', props: { scale: SMILE[n] } }], 'The moon smiles a little more')] : []),
];

const HEAD = lab('Bear ear*', 'Mustard ear patch*', 'Bear inner ear*', 'Bear head*', 'Bear muzzle*', 'Bear nose*', 'Bear cheek*', 'Mouth stem*', 'Stitched smile*');
const EYES = lab('Button*', 'Thread cross*');
const BODY = lab('Bear body*', 'Bear tummy*', 'Bear arm*');
const CANDLE = lab('Candle*', 'Wax drip*', 'Wick*', 'Flame*');
const FLAME = lab('Flame*', 'Candle halo*');
const FLIT = lab('Moth*', 'Cream wing spot*', 'Feathery antenna barbs*');
const MOONG = lab('Moon*');

/** Soft idle life every page shares: the stars twinkle, the candle flickers, Bramble's head nods in his sleep. */
const stars = (n: number) => idle(`p${n}-stars`, L('Felt star'), 'twinkle', { amount: 0.8 }, 'Stars twinkle');
const flame = (n: number): Behavior[] => [
  idle(`p${n}-flame`, L('Flame*'), 'flicker', { delayMs: 0, seed: 5 }, 'Candle flame flickers'),
  idle(`p${n}-glow`, L('Candle halo*'), 'breathe', { amount: 1.2, durationMs: 3600, delayMs: 0, seed: 5 }, 'Candle glow breathes'),
];
const nod = (n: number) => idle(`p${n}-nod`, G('head'), 'bob', { amount: 0.14, durationMs: 2600, delayMs: 0, seed: 3 }, 'Bramble nods off');
const breathe = (n: number) => idle(`p${n}-breathe`, G('body'), 'breathe', { amount: 0.6, durationMs: 4200, delayMs: 0, seed: 3, origin: { x: 0.5, y: 1 } }, 'Bramble breathes');
const flitFlutter = (n: number, amount = 0.35) => idle(`p${n}-flit`, G('flit'), 'flutter', { amount, delayMs: 0, seed: 9 }, 'Flit flutters');

/** Tap the candle: blow it out and the room dims (page tint); tap again to relight. */
const candleTap = (n: number): Behavior => tap(`p${n}-candle`, G('candle'), 'Tap the candle to blow it out. Tap again to light it.', [
  { do: 'var', name: 'candleOut', op: 'toggle' },
  { do: 'if', cond: eq('candleOut'), then: [
    { do: 'sfx', sound: 'candle-blow', params: { gain: 0.6 } }, { do: 'stop', target: G('flame') },
    { do: 'hide', target: G('flame'), anim: { preset: 'fade-out', durationMs: 900 } },
    { do: 'set', target: PAGE, props: { fill: '#0a0d2e', opacity: 0.38 } }, { do: 'haptic', pattern: 'soft' },
  ], else: [
    { do: 'sfx', sound: 'candle-flicker', params: { gain: 0.5 } },
    { do: 'show', target: G('flame'), anim: { preset: 'fade-in', durationMs: 900 } },
    { do: 'animate', target: L('Flame*'), anim: { preset: 'flicker', loop: 'infinite', delayMs: 0, seed: 5 } },
    { do: 'set', target: PAGE, props: { opacity: 0 } },
  ] },
], { cooldownMs: 500, reduced: [
  { do: 'var', name: 'candleOut', op: 'toggle' },
  { do: 'if', cond: eq('candleOut'), then: [{ do: 'sfx', sound: 'candle-blow', params: { gain: 0.6 } }, { do: 'hide', target: G('flame') }, { do: 'set', target: PAGE, props: { fill: '#0a0d2e', opacity: 0.38 } }],
    else: [{ do: 'sfx', sound: 'candle-flicker', params: { gain: 0.5 } }, { do: 'show', target: G('flame') }, { do: 'set', target: PAGE, props: { opacity: 0 } }] },
] });

const starTap = (n: number): Behavior => tap(`p${n}-star-tap`, L('Felt star*'), 'Tap a star to hear it twinkle', [
  { do: 'note', instrument: 'glass', note: 'scale:E5,G5,A5,C6', durationMs: 700, gain: 0.5 },
  { do: 'animate', anim: { preset: 'pulse', amount: 0.6 } }, { do: 'burst', kind: 'sparkles', count: 4 },
], { cooldownMs: 300, reduced: [{ do: 'note', instrument: 'glass', note: 'scale:E5,G5,A5,C6', durationMs: 700, gain: 0.5 }, ...blip(L('Felt star'))] });

const bearTap = (n: number, extra: Action[] = []): Behavior => tap(`p${n}-bear-tap`, G('head'), 'Tap Bramble to say hello', [
  { do: 'sfx', sound: 'hum', params: { gain: 0.5 } }, { do: 'animate', anim: { preset: 'squash', amount: 0.5 } }, { do: 'burst', kind: 'hearts', count: 4 }, ...extra,
], { cooldownMs: 600, reduced: [{ do: 'sfx', sound: 'hum', params: { gain: 0.5 } }, ...blip(L('Bear head'), 0.7, 400)] });

const moonTap = (n: number): Behavior => tap(`p${n}-moon-tap`, G('moon'), 'Tap the moon to make it chime', [
  { do: 'sfx', sound: 'glass-chime', params: { gain: 0.55 } },
  { do: 'note', instrument: 'musicbox', note: 'scale:E5,G5,A5,C6', durationMs: 900, gain: 0.45 },
  { do: 'animate', target: L('Moon halo'), anim: { preset: 'pulse', amount: 0.5 } }, { do: 'burst', at: L('Moon'), kind: 'stars', count: 5 },
], { cooldownMs: 500, reduced: [{ do: 'sfx', sound: 'glass-chime', params: { gain: 0.55 } }, ...blip(L('Moon halo'), 0.6, 450)] });

const flitTap = (n: number, extra: Action[] = []): Behavior => tap(`p${n}-flit-tap`, G('flit'), 'Tap Flit and she will chime', [
  { do: 'sfx', sound: 'wings', params: { gain: 0.4 } }, { do: 'sfx', sound: 'chime', params: { gain: 0.5, pitch: 7 } },
  { do: 'animate', anim: { preset: 'wiggle', amount: 0.9 } }, { do: 'burst', kind: 'sparkles', count: 5 }, ...extra,
], { cooldownMs: 700, reduced: [{ do: 'sfx', sound: 'chime', params: { gain: 0.5, pitch: 7 } }, ...blip(L('Moth wing'), 0.6, 420)] });

// ───────────────────────────── the pages ─────────────────────────────
const pages: LivingPage[] = [];

// 1  COVER ─ the title is sewn in thread; the moon, the candle and Flit are all alive.
pages.push(page(1, {
  groups: { moon: MOONG, head: HEAD, candle: CANDLE, flame: FLAME, flit: FLIT },
  vars: { candleOut: false },
  music: { cue: 'lullaby', fadeMs: 900 },
  narration: narr(text(1)),
  a11y: { summary: 'The cover of Moon Blanket: a sleepy felt bear under a moon-coloured blanket, a candle, a small moth and a smiling moon.', instructions: 'Tap the moon to make it chime, tap the candle to blow it out, tap the little moth to hear her.' },
  behaviors: [
    ...enterBase(1), stars(1), ...flame(1), nod(1), flitFlutter(1),
    idle('p1-moon-glow', L('Moon halo'), 'breathe', { amount: 0.7, durationMs: 5200, delayMs: 0, seed: 2 }, 'The moon glows'),
    idle('p1-title', L('Satin stitch letter*'), 'shimmer', { amount: 0.5 }, 'The sewn title shimmers'),
    moonTap(1), candleTap(1), flitTap(1), bearTap(1), starTap(1),
  ],
}));

// 2  Bramble had a blanket ─ a breathing bear, a big soft blanket, stars.
pages.push(page(2, {
  groups: { head: [...HEAD, ...EYES], body: BODY, blanket: lab('Moon-coloured blanket spread out*', 'Blanket puff*') },
  music: { cue: 'lullaby' }, ambience: { bed: 'room-tone', gain: 0.18 },
  narration: narr(text(2)),
  a11y: { summary: 'Bramble the bear sits in his bed in front of his big, soft, moon-coloured blanket. Stars twinkle at the side.', instructions: 'Tap Bramble, the blanket or a star.' },
  behaviors: [
    ...enterBase(2), stars(2), nod(2), breathe(2),
    idle('p2-blanket', G('blanket'), 'breathe', { amount: 0.3, durationMs: 4200, delayMs: 0, seed: 3, origin: { x: 0.5, y: 1 } }, 'The blanket rises and falls'),
    bearTap(2),
    tap('p2-blanket-tap', G('blanket'), 'Tap the big soft blanket to play a soft note', [
      { do: 'note', instrument: 'felt-piano', note: 'scale:C4,E4,G4,A4,C5', durationMs: 900, gain: 0.55 },
      { do: 'animate', anim: { preset: 'jelly', amount: 0.3 } },
    ], { cooldownMs: 300, reduced: [{ do: 'note', instrument: 'felt-piano', note: 'scale:C4,E4,G4,A4,C5', durationMs: 900, gain: 0.55 }, ...blip(L('Moon-coloured blanket spread out'), 0.7, 400)] }),
    starTap(2),
  ],
}));

// 3  Snug as a stitch ─ the candle, the window moon, and a first tuck (drag the blanket up).
pages.push(page(3, {
  groups: { moon: [...MOONG, ...lab('Night pane*')], head: [...HEAD, ...lab('Heavy eyelid*', 'Lid stitch*'), ...EYES], candle: CANDLE, flame: FLAME, tuck: lab('Blanket patch (moon-coloured felt)*', 'Bear paw*') },
  vars: { candleOut: false, pull: 0 },
  music: { cue: 'lullaby' }, ambience: { bed: 'room-tone', gain: 0.18 },
  narration: narr(text(3)),
  goals: [goal('snug', 'Pulled the blanket up to his chin', ge('pull', 0.8))],
  a11y: { summary: 'Bramble is almost asleep, a candle glows beside the bed and the moon smiles in the window.', instructions: 'Drag the blanket up to Bramble\'s chin, or press Enter on it. Tap the candle to blow it out. Tap the moon.' },
  behaviors: [
    ...enterBase(3), ...flame(3), nod(3),
    idle('p3-moon-glow', L('Moon halo'), 'breathe', { amount: 0.6, durationMs: 5200, delayMs: 0, seed: 2 }, 'The moon glows'),
    candleTap(3), moonTap(3), bearTap(3),
    { id: 'p3-tuck', target: G('tuck'), on: { type: 'drag', axis: 'y', bounds: { minY: -60, maxY: 0 }, progressVar: 'pull' }, hint: 'Drag the blanket up to Bramble\'s chin. Or press Enter.',
      do: [{ do: 'sfx', sound: 'swoosh', params: { gain: 0.3 } }, { do: 'haptic', pattern: 'soft' }], reduced: [{ do: 'sfx', sound: 'swoosh', params: { gain: 0.3 } }] },
    when('p3-snug', G('head'), ge('pull', 0.8), [
      { do: 'narrate', from: 9, to: 12 }, { do: 'sfx', sound: 'hum', params: { gain: 0.5 } }, { do: 'burst', kind: 'hearts', count: 5 }, { do: 'haptic', pattern: 'soft' },
    ], { once: true, reduced: [{ do: 'sfx', sound: 'hum', params: { gain: 0.5 } }] }),
  ],
}));

// 4  The hole ─ threads sway, Bramble peeks through.
pages.push(page(4, {
  groups: { hole: [...lab('Hole', 'Frayed hole rim*', 'Loose threads')], peek: lab('Bramble fur seen through the hole*', 'Bramble muzzle through the hole*', 'Bear cheek*', 'Button*', 'Thread cross*', 'Eyebrow stitch*') },
  vars: { peeks: 0, holes: 0 },
  music: { cue: 'lullaby' }, ambience: { bed: 'room-tone', gain: 0.18 },
  narration: narr(text(4)),
  goals: [goal('hello', 'Said hello through the hole', all(ge('peeks', 1), ge('holes', 1)))],
  a11y: { summary: 'A close-up of the blanket with one small round hole. Bramble peeks through it with one button eye.', instructions: 'Tap the hole, then tap Bramble\'s eye.' },
  behaviors: [
    ...enterBase(4),
    idle('p4-threads', L('Loose threads'), 'sway', { amount: 0.6, durationMs: 3200, delayMs: 0, seed: 4 }, 'Loose threads sway'),
    idle('p4-peek', G('peek'), 'breathe', { amount: 0.35, durationMs: 4200, delayMs: 0, seed: 4 }, 'Bramble breathes behind the hole'),
    tap('p4-hole', G('hole'), 'Tap the little hole', [
      { do: 'sfx', sound: 'boop', params: { gain: 0.5, pitch: -4 } }, { do: 'animate', target: L('Loose threads'), anim: { preset: 'wiggle', amount: 0.8 } }, { do: 'var', name: 'holes', op: 'inc' },
    ], { cooldownMs: 400, reduced: [{ do: 'sfx', sound: 'boop', params: { gain: 0.5, pitch: -4 } }, { do: 'var', name: 'holes', op: 'inc' }, ...blip(L('Hole'), 0.6, 400)] }),
    tap('p4-eye', G('peek'), 'Tap Bramble\'s eye to say hello', [
      { do: 'sfx', sound: 'boop', params: { gain: 0.45, pitch: 3 } }, { do: 'animate', target: L('Eyebrow stitch*'), anim: { preset: 'bounce', amount: 0.4 } },
      { do: 'burst', kind: 'hearts', count: 3 }, { do: 'var', name: 'peeks', op: 'inc' },
    ], { cooldownMs: 500, reduced: [{ do: 'sfx', sound: 'boop', params: { gain: 0.45, pitch: 3 } }, { do: 'var', name: 'peeks', op: 'inc' }, ...blip(L('Bramble fur seen through the hole'), 0.7, 400)] }),
  ],
}));

// 5  Who made the hole? ─ the guessing game: tap the mouse, the cat, the moon; each answers a gentle "No!" with its own soft sound.
const mouse = [...lab('Mouse*'), ...ids(5, 'button', [1, 2]), ...ids(5, 'button-shadow', [1, 2]), ...ids(5, 'button-rim-ring', [1, 2]), ...ids(5, 'button-hole', [1, 2, 3, 4, 5, 6, 7, 8]), ...ids(5, 'thread-cross', [1, 2]), ...ids(5, 'button-shine', [1, 2]), ...ids(5, 'whisker', [1, 2, 3, 4]), ...ids(5, 'whisker-shadow', [1, 2, 3, 4])];
const cat = [...lab('Cat*'), ...ids(5, 'button', [3, 4]), ...ids(5, 'button-shadow', [3, 4]), ...ids(5, 'button-rim-ring', [3, 4]), ...ids(5, 'button-hole', [9, 10, 11, 12, 13, 14, 15, 16]), ...ids(5, 'thread-cross', [3, 4]), ...ids(5, 'button-shine', [3, 4]), ...ids(5, 'whisker', [5, 6, 7, 8]), ...ids(5, 'whisker-shadow', [5, 6, 7, 8])];
const noAnswer = (id: string, who: string, grp: string, line: number, vr: string, sound: { instrument: string; note: string; pitch: number }): Behavior => tap(id, G(grp), `Tap the ${who}. Was it the ${who}? Listen for the answer.`, [
  { do: 'sfx', sound: 'gentle-no', params: { gain: 0.6, pitch: sound.pitch } }, { do: 'note', instrument: sound.instrument, note: sound.note, durationMs: 700, gain: 0.45 },
  { do: 'animate', anim: { preset: 'shake', amount: 0.5 } }, { do: 'animate', target: ID(`p05_read-aloud-text_${line}`), anim: { preset: 'pulse', amount: 0.4 } }, { do: 'var', name: vr, op: 'set', value: true },
], { cooldownMs: 700, reduced: [{ do: 'sfx', sound: 'gentle-no', params: { gain: 0.6, pitch: sound.pitch } }, { do: 'var', name: vr, op: 'set', value: true }, ...blip(ID(`p05_read-aloud-text_${line}`), 0.6, 500)] });
pages.push(page(5, {
  groups: { mouse, cat, moon: [...MOONG, ...lab('Night window*', 'Window sill*')], marks: lab('Satin stitch letter ?', 'Thread outline ?', 'Thread highlight ?', 'Embroidery shadow') },
  vars: { mouse: false, cat: false, moon: false },
  music: { cue: 'lullaby' }, ambience: { bed: 'room-tone', gain: 0.18 },
  narration: narr(text(5)),
  goals: [goal('three-nos', 'Said no to the mouse, the cat and the moon', all(eq('mouse'), eq('cat'), eq('moon')))],
  a11y: { summary: 'Three quilt panels: a stitched mouse, a cat, and the moon in the window. Each has a question mark above it.', instructions: 'Was it the mouse? Tap each one and listen: each answers "No!" in its own soft voice.' },
  behaviors: [
    ...enterBase(5), stars(5),
    idle('p5-marks', G('marks'), 'bob', { amount: 0.22, durationMs: 2200, delayMs: 0, seed: 6 }, 'The question marks bob'),
    idle('p5-tail', L('Cat tail*'), 'sway', { amount: 0.8, durationMs: 3400, delayMs: 0, seed: 6 }, 'The cat swishes her tail'),
    idle('p5-whiskers', L('Whisker*'), 'wave', { amount: 0.3, durationMs: 3000, delayMs: 0, seed: 6 }, 'Whiskers twitch'),
    idle('p5-moon-glow', L('Moon halo'), 'breathe', { amount: 0.6, durationMs: 5200, delayMs: 0, seed: 2 }, 'The moon glows'),
    noAnswer('p5-mouse', 'mouse', 'mouse', 2, 'mouse', { instrument: 'kalimba', note: 'E5', pitch: 5 }),
    noAnswer('p5-cat', 'cat', 'cat', 3, 'cat', { instrument: 'felt-piano', note: 'C4', pitch: 0 }),
    noAnswer('p5-moon', 'moon', 'moon', 4, 'moon', { instrument: 'musicbox', note: 'G4', pitch: -4 }),
    when('p5-all-no', PAGE, all(eq('mouse'), eq('cat'), eq('moon')), [
      { do: 'wait', ms: 700 }, { do: 'sfx', sound: 'twinkle', params: { gain: 0.5 } }, { do: 'burst', at: { x: 384, y: 330 }, kind: 'stars', count: 8 }, { do: 'sfx', sound: 'wings', params: { gain: 0.3 } },
    ], { once: true, reduced: [{ do: 'sfx', sound: 'twinkle', params: { gain: 0.5 } }] }),
  ],
}));

// 6  Flutter, flutter ─ something small comes out of the hole.
pages.push(page(6, {
  groups: { candle: CANDLE, flame: FLAME, antennae: lab('Moth antenna*', 'Feathery antenna barbs*'), hole: lab('Hole', 'Frayed hole rim*', 'Loose threads') },
  vars: { candleOut: false, peeks: 0 },
  music: { cue: 'lullaby' }, ambience: { bed: 'room-tone', gain: 0.18 },
  narration: narr(text(6)),
  goals: [goal('hello-flit', 'Said hello to the little antennae', ge('peeks', 2))],
  a11y: { summary: 'A quiet, dark page. Two orange antennae peek out of the hole in the blanket corner. A candle glows at the left.', instructions: 'Tap the antennae or the hole. Tap the candle to dim the room.' },
  behaviors: [
    ...enterBase(6), ...flame(6),
    idle('p6-antennae', G('antennae'), 'sway', { amount: 1, durationMs: 2600, delayMs: 0, seed: 8 }, 'The antennae feel the air'),
    idle('p6-threads', L('Loose threads'), 'sway', { amount: 0.5, durationMs: 3200, delayMs: 0, seed: 4 }, 'Loose threads sway'),
    candleTap(6),
    tap('p6-antennae-tap', G('antennae'), 'Tap the little antennae', [
      { do: 'sfx', sound: 'wings', params: { gain: 0.35 } }, { do: 'sfx', sound: 'chime', params: { gain: 0.4, pitch: 9 } },
      { do: 'animate', anim: { keyframes: [{ at: 0, y: 0 }, { at: 0.45, y: -16, rotate: -4 }, { at: 1, y: 0 }], durationMs: 1200 } }, { do: 'var', name: 'peeks', op: 'inc' },
    ], { cooldownMs: 800, reduced: [{ do: 'sfx', sound: 'chime', params: { gain: 0.4, pitch: 9 } }, { do: 'var', name: 'peeks', op: 'inc' }, ...blip(L('Moth antenna'), 0.6, 450)] }),
    tap('p6-hole-tap', G('hole'), 'Tap the hole: knock, knock', [
      { do: 'sfx', sound: 'knock', params: { gain: 0.4 } }, { do: 'wait', ms: 260 }, { do: 'sfx', sound: 'knock', params: { gain: 0.35, pitch: -2 } },
      { do: 'animate', target: G('antennae'), anim: { keyframes: [{ at: 0, y: 0 }, { at: 0.5, y: -10 }, { at: 1, y: 0 }], durationMs: 900 } }, { do: 'var', name: 'peeks', op: 'inc' },
    ], { cooldownMs: 900, reduced: [{ do: 'sfx', sound: 'knock', params: { gain: 0.4 } }, { do: 'var', name: 'peeks', op: 'inc' }, ...blip(L('Hole'), 0.6, 400)] }),
  ],
}));

// 7  A moth! ─ Flit is huge and shivering. Comfort her and she settles.
pages.push(page(7, {
  groups: { flit: lab('Moth*', 'Cream wing spot*', 'Feathery antenna barbs*', 'Stitched tear*'), bramble: [...lab('Bear head*', 'Bear ear*', 'Bear inner ear*', 'Mustard ear patch*', 'Bear muzzle*', 'Bear nose*', 'Bear cheek*', 'Bear body*', 'Bear tummy*', 'Bear arm*', 'Mouth stem*', 'Open mouth*')], tear: lab('Stitched tear*') },
  vars: { comfort: 0 },
  music: { cue: 'lullaby' }, ambience: { bed: 'room-tone', gain: 0.18 },
  narration: narr(text(7)),
  goals: [goal('warm', 'Helped Flit feel warm', ge('comfort', 1))],
  a11y: { summary: 'Flit the moth fills the page, trembling with cold. Tiny Bramble watches from the bottom corner.', instructions: 'Tap Flit to comfort her. Tap Bramble to say hello.' },
  behaviors: [
    ...enterBase(7),
    idle('p7-shiver', G('flit'), 'shake', { amount: 0.14, durationMs: 900, delayMs: 0, seed: 12 }, 'Flit shivers'),
    idle('p7-bramble', L('Bear body*'), 'breathe', { amount: 0.5, durationMs: 4200, delayMs: 0, seed: 3, origin: { x: 0.5, y: 1 } }, 'Bramble breathes'),
    tap('p7-comfort', G('flit'), 'Tap Flit to make her warm and cosy', [
      { do: 'stop', target: G('flit') }, { do: 'sfx', sound: 'hum', params: { gain: 0.5 } }, { do: 'sfx', sound: 'chime', params: { gain: 0.4, pitch: 4 } },
      { do: 'hide', target: G('tear'), anim: { preset: 'fade-out', durationMs: 900 } },
      { do: 'animate', target: G('flit'), anim: { preset: 'breathe', amount: 0.8, loop: 'infinite', durationMs: 4200, delayMs: 0, seed: 12 } },
      { do: 'burst', kind: 'hearts', count: 6 }, { do: 'haptic', pattern: 'soft' }, { do: 'var', name: 'comfort', op: 'inc' },
    ], { cooldownMs: 900, reduced: [{ do: 'sfx', sound: 'hum', params: { gain: 0.5 } }, { do: 'hide', target: G('tear') }, { do: 'var', name: 'comfort', op: 'inc' }] }),
    tap('p7-bramble-tap', G('bramble'), 'Tap tiny Bramble to say hello', [
      { do: 'sfx', sound: 'hum', params: { gain: 0.4, pitch: 3 } }, { do: 'animate', anim: { preset: 'squash', amount: 0.6 } }, { do: 'burst', kind: 'hearts', count: 3 },
    ], { cooldownMs: 600, reduced: [{ do: 'sfx', sound: 'hum', params: { gain: 0.4, pitch: 3 } }, ...blip(L('Bear head'), 0.7, 400)] }),
  ],
}));

// 8  "Come in" ─ lift the blanket corner; golden light spills out and Flit flutters in.
pages.push(page(8, {
  groups: { head: [...HEAD, ...EYES], body: lab('Bear body*', 'Bear tummy*', 'Bear arm*'), flit: lab('Moth*', 'Cream wing spot*', 'Feathery antenna barbs*', 'Flutter trail*'), corner: lab('Lifted blanket corner (golden lining)*'), light: lab('Warm light*') },
  vars: { lift: 0, arrived: false },
  music: { cue: 'lullaby' }, ambience: { bed: 'room-tone', gain: 0.18 },
  narration: narr(text(8)),
  goals: [goal('come-in', 'Let Flit in', eq('arrived'))],
  a11y: { summary: 'Bramble lifts a corner of his blanket. Warm golden light spills out. Flit flutters nearby.', instructions: 'Drag the blanket corner up, or press Enter on it, and Flit will flutter in. You can also tap Flit.' },
  behaviors: [
    ...enterBase(8), stars(8), nod(8), breathe(8), flitFlutter(8, 0.5),
    onEnter('p8-light-follows', G('light'), [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0.55, scale: 1 }, { at: 1, opacity: 1, scale: 1.2 }], durationMs: 1000, easing: 'var:lift' } }], 'The light grows as you lift'),
    { id: 'p8-lift', target: G('corner'), on: { type: 'drag', axis: 'y', bounds: { minY: -90, maxY: 0 }, progressVar: 'lift' }, hint: 'Drag the blanket corner up to let the light out. Or press Enter.',
      do: [{ do: 'sfx', sound: 'swoosh', params: { gain: 0.3 } }, { do: 'haptic', pattern: 'soft' }], reduced: [{ do: 'sfx', sound: 'swoosh', params: { gain: 0.3 } }] },
    when('p8-flit-in', G('flit'), ge('lift', 0.6), [
      { do: 'sfx', sound: 'harp-gliss', params: { gain: 0.45 } }, { do: 'burst', at: L('Warm light core'), kind: 'fireflies', count: 8 },
      { do: 'animate', anim: { keyframes: [{ at: 0, x: 0, y: 0, rotate: 0 }, { at: 0.5, x: -70, y: 80, rotate: -12 }, { at: 1, x: -150, y: 170, rotate: 0 }], durationMs: 2400, easing: 'ease-in-out' } },
      { do: 'wait', ms: 2400 }, { do: 'set', props: { x: -150, y: 170 } }, { do: 'sfx', sound: 'chime', params: { gain: 0.5, pitch: 9 } }, { do: 'var', name: 'arrived', op: 'set', value: true },
    ], { once: true, reduced: [{ do: 'sfx', sound: 'chime', params: { gain: 0.5, pitch: 9 } }, { do: 'set', props: { x: -150, y: 170 } }, { do: 'var', name: 'arrived', op: 'set', value: true }] }),
    flitTap(8), bearTap(8),
  ],
}));

// 9  Snug as a stitch ─ THE TUCK-IN FINALE. Drag the blanket up to Bramble's chin: the lights dim, the lullaby slows, the moon smiles more, a soft hum.
pages.push(page(9, {
  groups: { moon: [...MOONG, ...lab('Night pane*')], head: [...HEAD, ...EYES], tuck: lab('Blanket patch (moon-coloured felt)*', 'Bear paw*'), flit: lab('Moth*', 'Cream wing spot*', 'Feathery antenna barbs*') },
  vars: { pull: 0, tucked: false },
  music: { cue: 'lullaby' }, ambience: { bed: 'night-crickets', gain: 0.22 },
  narration: narr(text(9)),
  goals: [goal('tucked-in', 'Tucked Bramble in, snug as a stitch', eq('tucked'))],
  a11y: { summary: 'Bramble and Flit are under the blanket, only their faces showing. The moon smiles at the window.', instructions: 'Drag the blanket up to Bramble\'s chin, or press Enter on it. The room gets sleepier. Tap the moon or Flit.' },
  behaviors: [
    ...enterBase(9), stars(9), nod(9), flitFlutter(9, 0.25),
    idle('p9-moon-glow', L('Moon halo'), 'breathe', { amount: 0.6, durationMs: 5200, delayMs: 0, seed: 2 }, 'The moon glows'),
    { id: 'p9-tuck', target: G('tuck'), on: { type: 'drag', axis: 'y', bounds: { minY: -70, maxY: 0 }, progressVar: 'pull' }, hint: 'Drag the blanket up to Bramble\'s chin. Or press Enter.',
      do: [{ do: 'sfx', sound: 'swoosh', params: { gain: 0.3 } }, { do: 'haptic', pattern: 'soft' }], reduced: [{ do: 'sfx', sound: 'swoosh', params: { gain: 0.3 } }] },
    when('p9-snug', PAGE, ge('pull', 0.85), [
      { do: 'var', name: 'tucked', op: 'set', value: true },
      { do: 'musicTempo', scale: 0.55, rampMs: 5000 }, { do: 'set', target: PAGE, props: { fill: '#0a0d2e', opacity: 0.34 } },
      { do: 'set', target: L('Moon smile*'), props: { scale: 1.9 } }, { do: 'set', target: L('Moon cheek*'), props: { scale: 1.2 } },
      { do: 'sfx', sound: 'hum', params: { gain: 0.5 } }, { do: 'haptic', pattern: 'soft' }, { do: 'narrate', from: 10, to: 17 },
      { do: 'burst', at: L('Moon'), kind: 'stars', count: 6 },
    ], { once: true, reduced: [{ do: 'var', name: 'tucked', op: 'set', value: true }, { do: 'musicTempo', scale: 0.55, rampMs: 5000 }, { do: 'set', target: PAGE, props: { fill: '#0a0d2e', opacity: 0.34 } }, { do: 'set', target: L('Moon smile*'), props: { scale: 1.9 } }, { do: 'sfx', sound: 'hum', params: { gain: 0.5 } }] }),
    moonTap(9), flitTap(9), bearTap(9), starTap(9),
  ],
}));

// 10  Goodnight ─ say goodnight to Bramble, Flit and (last) the moon.
pages.push(page(10, {
  groups: { moon: MOONG, head: HEAD, flit: lab('Moth*', 'Cream wing spot*', 'Feathery antenna barbs*'), mound: lab('Blanket patch (moon-coloured felt)*'), smoke: lab('Smoke thread*') },
  vars: { bramble: false, flit: false, moon: false },
  music: { cue: 'goodnight', fadeMs: 2500 }, ambience: { bed: 'night-crickets', gain: 0.22 },
  narration: narr(text(10)),
  goals: [goal('goodnights', 'Said goodnight to Bramble, Flit and the moon', all(eq('bramble'), eq('flit'), eq('moon')))],
  a11y: { summary: 'The moon sleeps in the sky. Below, the blanket mound rises and falls as Bramble and Flit sleep. A thin thread of candle smoke curls up.', instructions: 'Say goodnight: tap Bramble, tap Flit, and last of all tap the moon.' },
  behaviors: [
    ...enterBase(10), stars(10), nod(10),
    onEnter('p10-dim', PAGE, [{ do: 'set', target: PAGE, props: { fill: '#0a0d2e', opacity: 0.22 } }], 'The lights are low'),
    idle('p10-mound', G('mound'), 'breathe', { amount: 0.9, durationMs: 4600, delayMs: 0, seed: 3, origin: { x: 0.5, y: 1 } }, 'The blanket rises and falls'),
    idle('p10-smoke', G('smoke'), 'sway', { amount: 1, durationMs: 4200, delayMs: 0, seed: 2, origin: { x: 0.5, y: 1 } }, 'Smoke curls'),
    idle('p10-moon-glow', L('Moon halo'), 'breathe', { amount: 0.6, durationMs: 6200, delayMs: 0, seed: 2 }, 'The moon glows'),
    idle('p10-flit', G('flit'), 'breathe', { amount: 0.6, durationMs: 4600, delayMs: 0, seed: 9 }, 'Flit sleeps'),
    tap('p10-bramble', G('head'), 'Say goodnight to Bramble', [
      { do: 'narrate', from: 0, to: 1 }, { do: 'sfx', sound: 'snore', params: { gain: 0.35 } }, { do: 'animate', anim: { preset: 'squash', amount: 0.4 } }, { do: 'var', name: 'bramble', op: 'set', value: true },
    ], { cooldownMs: 900, reduced: [{ do: 'narrate', from: 0, to: 1 }, { do: 'var', name: 'bramble', op: 'set', value: true }, ...blip(L('Bear head'), 0.7, 400)] }),
    tap('p10-flit-tap', G('flit'), 'Say goodnight to Flit', [
      { do: 'narrate', from: 2, to: 3 }, { do: 'sfx', sound: 'chime', params: { gain: 0.35, pitch: 9 } }, { do: 'animate', anim: { preset: 'pulse', amount: 0.6 } }, { do: 'var', name: 'flit', op: 'set', value: true },
    ], { cooldownMs: 900, reduced: [{ do: 'narrate', from: 2, to: 3 }, { do: 'var', name: 'flit', op: 'set', value: true }, ...blip(L('Moth wing'), 0.6, 400)] }),
    tap('p10-moon-tap', G('moon'), 'Say goodnight to the moon', [
      { do: 'narrate', from: 4, to: 5 }, { do: 'sfx', sound: 'glass-chime', params: { gain: 0.4, pitch: -3 } }, { do: 'animate', target: L('Moon halo'), anim: { preset: 'pulse', amount: 0.5 } },
      { do: 'burst', at: L('Moon'), kind: 'stars', count: 6 }, { do: 'var', name: 'moon', op: 'set', value: true },
    ], { cooldownMs: 900, reduced: [{ do: 'narrate', from: 4, to: 5 }, { do: 'var', name: 'moon', op: 'set', value: true }, ...blip(L('Moon halo'), 0.6, 450)] }),
    when('p10-lights-out', PAGE, all(eq('bramble'), eq('flit'), eq('moon')), [
      { do: 'wait', ms: 2500 }, { do: 'set', target: PAGE, props: { fill: '#0a0d2e', opacity: 0.4 } }, { do: 'musicStop', fadeMs: 9000 }, { do: 'set', target: L('Moon smile*'), props: { scale: 1.9 } },
    ], { once: true, reduced: [{ do: 'set', target: PAGE, props: { fill: '#0a0d2e', opacity: 0.4 } }, { do: 'musicStop', fadeMs: 9000 }] }),
  ],
}));

// 11  BACK COVER ─ the blurb, the candle, Flit and Bramble again.
pages.push(page(11, {
  groups: { head: [...HEAD, ...EYES], candle: CANDLE, flame: FLAME, flit: FLIT },
  vars: { candleOut: false },
  music: { cue: 'goodnight' }, ambience: { bed: 'night-crickets', gain: 0.2 },
  narration: narr(text(11)),
  a11y: { summary: 'The back cover: the story blurb on a felt patch, a stitched night sky, a candle, Bramble and Flit.', instructions: 'Tap the candle, Bramble, Flit or a star.' },
  behaviors: [
    ...enterBase(11), stars(11), ...flame(11), nod(11), flitFlutter(11, 0.3),
    candleTap(11), bearTap(11), flitTap(11), starTap(11),
  ],
}));

const scores: Record<string, Score> = { lullaby: lullaby(), goodnight: goodnight() };

export const moonBlanketLiving: LivingBook = {
  version: 1, bookId: 'moon-blanket', pages, scores,
  defaults: { musicGain: 0.7, sfxGain: 0.8, narrate: 'on-demand', ambient: true },
  authorNotes: 'Moon Blanket shows the gentle end of the format: drag (lift the blanket corner, tuck Bramble in), state (the candle dims the room through a page tint), music tempo (one music-box lullaby, `musicTempo` lowered on every page), haptics, narration ranges and a "No!" guessing game. '
    + 'Every idle motion has an explicit seed, every interactive behaviour a hint and a reduced twin. Change the animal or the sounds by editing targets and `sfx` ids; keep gains low for the youngest readers.',
};

export default moonBlanketLiving;
