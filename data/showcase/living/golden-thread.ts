// THE GOLDEN THREAD: the living edition (ages 7-9, papercut). docs/LIVING_BOOKS.md: "touch as storytelling".
//
//   p3  tug, tug, tug: three taps on Glint and the gold thread draws itself across the hills with a rising harp run
//   p4  PULL THE THREAD: drag Glint along the thread; the thread draws on bound to the drag (easing "var:pull"), Glint rides the path,
//       and every eighth of the pull plucks the next harp note up (and back down if you pull back): the thread is a harp
//   p5  stitch the wolf's coat: carry Mira's needle across to the coat; the dashed gold stitches appear as it passes
//   p6  weave the bridge: drag Glint across the river; the deck and planks are drawn behind it as it weaves back and forth
//   p7  flick the thread up to the moon: a quick drag upwards ties the moon's silver sash with a bow
//   p8  climb the stair of stars: drag Mira up the stairs, each step rings a bell
//   p9  unwind the knot: drag the loose end; the windings turn and loosen, then gold spills across the sky
//   p10 give the thread: pull Mira's last spool up to the knot; it shrinks as she gives it away
//   p13 "Follow the thread": three spools, three threads, one house. Drag each numbered bead along its thread: it must reach the end of
//       the thread to count (a snap point), and only the thread that leads to Mira's house wins. Validated, not decorative.
//
// Music: folk harp and a drone that grows richer with every task done: seven cues gt-0 .. gt-6. Each task's completion crossfades to the
// next cue; each page opens at the level the story has reached.  (State does not travel between pages, so a page opens at the level it
// *assumes*; completing the task on the page is what earns the next one. See authorNotes.)
//
// Targets are the real labels the story-folktale designer draws. Ride and draw-on keyframes are computed at build time from the designer's
// own thread paths (svgPathData), so Glint stays on the thread however the art is tuned. All sound is synthesised; nothing plays before the
// reader's first gesture; every interactive behaviour has a hint and a reduced-motion twin; the flat book stands alone.
import type { Action, Behavior, LivingBook, LivingPage, Score, ScoreTrack } from '../../../services/living/contracts';
import { arpeggiate, bassline, chord, chordsToNotes, makeScore, parseNotation, shift, track } from '../../../services/living/audio/compose';
import { band, bhv, center, eq, gt, lt, pageKit, pathPoints, rideKeyframes, sampler, spreadNarration, withoutMotion, type PageKit } from './_blueThreadKit';

const BOOK = 'golden-thread';

// ───────────────────────────── music: folk harp + a drone that grows with every task ─────────────────────────────
const LEVELS = 7;
const PROG: Array<[string, string]> = [['A3', 'min'], ['G3', 'maj'], ['F3', 'maj'], ['E3', 'min'], ['A3', 'min'], ['G3', 'maj'], ['F3', 'maj'], ['E3', 'min']];

/** level 0: a bare drone and a few harp notes. 1 +flute, 2 +harp runs, 3 +kalimba, 4 +voices, 5 +bass, 6 +bells: the whole village. */
function folk(level: number): Score {
  const tracks: ScoreTrack[] = [];
  tracks.push(track('pad', [{ t: 0, n: 'A2', d: 31.6, v: 0.36 }, { t: 0, n: 'E3', d: 31.6, v: 0.27 }], { gain: 0.5, pan: 0.1 }));
  tracks.push(track('harp', PROG.flatMap(([r, q], b) => arpeggiate(chord(r, q), { pattern: 'up', step: 1, count: 3, dur: 3, t0: b * 4, vel: 0.4 })), { gain: 0.75, pan: -0.12 }));
  if (level >= 1) {
    const m1 = parseNotation('E5:2 D5:1 C5:1 | A4:3 rest:1 | rest:2 C5:1 D5:1 | E5:4', { defaultVel: 0.55 }).notes;
    const m2 = shift(parseNotation('G5:2 E5:1 D5:1 | C5:3 rest:1 | rest:2 D5:1 E5:1 | A4:4', { defaultVel: 0.55 }).notes, 16);
    tracks.push(track('flute', [...m1, ...m2], { gain: 0.42, pan: 0.25 }));
  }
  if (level >= 2) tracks.push(track('harp', PROG.flatMap(([r, q], b) => arpeggiate(chord(r, q).map(n => n + 12), { pattern: 'updown', step: 0.5, count: 8, dur: 1, t0: b * 4, vel: 0.28 })), { gain: 0.6, pan: 0.15 }));
  if (level >= 3) {
    const k = ['rest:3 E6:.5 G6:.5 rest:4', 'rest:2 A6:.5 G6:.5 rest:1 E6:.5 D6:.5 rest:3', 'rest:3 D6:.5 E6:.5 rest:4', 'rest:2.5 C6:.5 D6:.5 E6:1 rest:3.5'];
    tracks.push(track('kalimba', k.flatMap((s, i) => shift(parseNotation(s, { defaultVel: 0.32 }).notes, i * 8)), { gain: 0.5, pan: 0.3 }));
  }
  if (level >= 4) tracks.push(track('choir', chordsToNotes(PROG.map(([r, q]) => chord(r, q)), 4, { vel: 0.2, hold: 0.99 }), { gain: 0.45, pan: -0.2 }));
  if (level >= 5) tracks.push(track('bass', bassline(['A2', 'G2', 'F2', 'E2', 'A2', 'G2', 'F2', 'E2'], 'root-fifth', { beatsPerBar: 4, vel: 0.5 }), { gain: 0.6 }));
  if (level >= 6) {
    const bell = ['rest:5 A5:.5 E6:.5 rest:2', 'rest:6 C6:.5 A5:.5 rest:1', 'rest:5 G5:.5 D6:.5 rest:2', 'rest:4 E6:.5 B5:.5 A5:1 rest:2'];
    tracks.push(track('bell', bell.flatMap((s, i) => shift(parseNotation(s, { defaultVel: 0.26 }).notes, i * 8)), { gain: 0.45, pan: 0.2 }));
  }
  return makeScore({ id: `gt-${level}`, tempo: 84, lengthBeats: 32, reverb: 0.38, variation: { seed: 5 + level, humanizeMs: 16, dropout: level >= 2 ? 0.03 : 0.05 }, tracks });
}
const scores: Record<string, Score> = Object.fromEntries(Array.from({ length: LEVELS }, (_, i) => [`gt-${i}`, folk(i)]));
const cue = (level: number) => `gt-${level}`;

// ───────────────────────────── groups ─────────────────────────────
const L = (...labels: string[]) => labels.map(l => `label:${l}`);
const MIRA_BODY = ['Dress', 'Zigzag hem', 'Apron', 'Apron dots', 'Sleeve', 'Hand', 'Braid', 'Braid tie', 'Hair', 'Face', 'Fringe', 'Scarf', 'Scarf tail', 'Scarf trim', 'Scarf diamond', 'Boot'];
const FACE = ['Eye', 'Pupil', 'Eye shine', 'Cheek', 'Smile', 'Open mouth'];
const EYES = L('Eye', 'Pupil', 'Eye shine');
const GLINT = ['Glint glow', 'Glint', 'Winding', 'Thread curl'];
const THREAD = L('Thread glow', 'Golden thread', 'Thread twist', 'Thread highlight');
const DRAWN = L('Thread glow', 'Golden thread', 'Thread highlight');   // solid strokes: these can draw on (the dashed twist cannot)

/** ids of every object on the page whose label is in `labels`, in z order */
const idsOf = (K: PageKit, labels: string[]) => K.objs.filter(o => labels.includes(o.objectLabel ?? '')).map(o => o.id);
/** Mira: her clothes and (where the designer draws it on her) her face */
const miraIds = (K: PageKit) => idsOf(K, [...MIRA_BODY, ...FACE]);
const miraBodyIds = (K: PageKit) => idsOf(K, MIRA_BODY);

// ───────────────────────────── builders ─────────────────────────────
const SAY_TARGET = { label: 'Paper ground' } as const;   // every page has one; `set text` on it is only a screen-reader announcement
const say = (text: string): Action => ({ do: 'set', target: SAY_TARGET, props: { text } });

const idle = (id: string, group: string, preset: NonNullable<Extract<Action, { do: 'animate' }>['anim']['preset']>, amount = 1, extra: Record<string, unknown> = {}): Behavior =>
  bhv(id, { group }, { type: 'idle' }, [{ do: 'animate', anim: { preset, amount, loop: 'infinite', ...extra } }]);

function tap(id: string, target: Behavior['target'], hint: string, doing: Action[], o: { announce?: string; once?: boolean; cooldownMs?: number } = {}): Behavior {
  return bhv(id, target, { type: 'tap' }, doing, {
    hint, ...(o.once ? { once: true } : {}), ...(o.cooldownMs ? { cooldownMs: o.cooldownMs } : {}),
    reduced: [...withoutMotion(doing), ...(o.announce ? [say(o.announce)] : [])],
  });
}
const page = (n: number, p: Omit<LivingPage, 'page' | 'narration'>): LivingPage => ({ page: n, ...p, narration: spreadNarration(BOOK, n, { rate: 0.88 }) });
const musicOn = (level: number, bed: string, gain: number) => ({ music: { cue: cue(level), fadeMs: 2600 }, ambience: { bed, gain } });
/** a task was finished: the music gets richer */
const richer = (level: number): Action => ({ do: 'music', cue: cue(level), fadeMs: 3200 });
const tugHaptic: Action = { do: 'haptic', pattern: 'tug' };

/** the harp scale the thread plays as it is pulled: C major pentatonic, rising */
const RUN = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'];

// ───────────────────────────── pages ─────────────────────────────

function p1(): LivingPage {
  const K = pageKit(BOOK, 1);
  return page(1, {
    groups: { glint: idsOf(K, GLINT), mira: miraIds(K), eyes: EYES, rays: L('Rays'), sunAura: L('Sun aura'), thread: L('Thread highlight', 'Thread twist'), firs: L('Fir tree') },
    ...musicOn(0, 'wind', 0.2),
    a11y: { summary: 'The cover: Mira the weaver in her red cap and Glint the golden thread spirit in front of a sunburst, a long gold thread across the whole cover.', instructions: 'Tap Glint to tug the thread. Tap Mira to hear a harp.' },
    behaviors: [
      idle('p1-rays', 'rays', 'spin', 1, { durationMs: 160000, easing: 'linear' }),
      idle('p1-aura', 'sunAura', 'breathe', 2),
      idle('p1-glint', 'glint', 'bob', 0.4),
      idle('p1-mira-blink', 'eyes', 'blink'),
      idle('p1-thread', 'thread', 'shimmer', 1),
      idle('p1-firs', 'firs', 'sway', 0.5),
      tap('p1-tug', { group: 'glint' }, 'Tap Glint to tug the thread', [
        { do: 'animate', anim: { preset: 'bounce', amount: 1 } }, { do: 'sfx', sound: 'thread-tug' }, { do: 'note', instrument: 'harp', note: 'scale:C4,D4,E4,G4,A4,C5' }, tugHaptic, { do: 'burst', kind: 'sparkles', count: 8 },
      ], { announce: 'Glint tugs the thread.' }),
      tap('p1-mira', { group: 'mira' }, 'Tap Mira to hear a harp', [{ do: 'note', instrument: 'harp', note: 'scale:E4,G4,A4,C5,D5,E5' }, { do: 'sfx', sound: 'sparkle', params: { gain: 0.6 } }, { do: 'burst', kind: 'hearts', count: 6 }], { announce: 'Mira smiles.' }),
    ],
  });
}

function p2(): LivingPage {
  const K = pageKit(BOOK, 2);
  return page(2, {
    groups: { glint: idsOf(K, GLINT), mira: miraIds(K), eyes: EYES, rays: L('Rays'), smoke: L('Smoke'), loom: L('Warp threads'), beam: L('Loom beam'), thread: L('Thread highlight', 'Thread twist'), sun: L('Sun heart', 'Sun core') },
    ...musicOn(0, 'wind', 0.2),
    a11y: { summary: 'The village of Three Hills at dawn. Mira sits at her loom and the gold thread curls out of the window.', instructions: 'Tap the loom to strum its threads like a harp. Tap Glint to say hello.' },
    behaviors: [
      idle('p2-rays', 'rays', 'spin', 1, { durationMs: 200000, easing: 'linear' }),
      idle('p2-sun', 'sun', 'breathe', 2),
      idle('p2-smoke', 'smoke', 'float', 2),
      idle('p2-glint', 'glint', 'bob', 0.4),
      idle('p2-mira-blink', 'eyes', 'blink'),
      idle('p2-thread', 'thread', 'shimmer', 1),
      tap('p2-strum', { group: 'loom' }, 'Tap the loom to strum its threads like a harp', [
        { do: 'animate', anim: { preset: 'wiggle', amount: 1 } }, { do: 'animate', target: { group: 'beam' }, anim: { preset: 'shake', amount: 0.4 } },
        { do: 'sfx', sound: 'harp-gliss' }, { do: 'haptic', pattern: 'soft' },
      ], { announce: 'The loom strums like a harp.' }),
      tap('p2-glint-hello', { group: 'glint' }, 'Tap Glint to say hello', [{ do: 'animate', anim: { preset: 'bounce', amount: 0.8 } }, { do: 'sfx', sound: 'thread-pluck' }, { do: 'burst', kind: 'sparkles', count: 6 }], { announce: 'Glint twinkles hello.' }),
    ],
  });
}

function p3(): LivingPage {
  const K = pageKit(BOOK, 3);
  const thread = idsOf(K, ['Thread glow', 'Golden thread', 'Thread twist', 'Thread highlight']);
  const drawNotes: Action[] = RUN.flatMap((n, i): Action[] => [{ do: 'note', instrument: 'harp', note: n, durationMs: 900, gain: 0.8 }, ...(i < RUN.length - 1 ? [{ do: 'wait', ms: 320 } as Action] : [])]);
  return page(3, {
    groups: { glint: idsOf(K, GLINT), mira: miraIds(K), eyes: EYES, thread, solid: idsOf(K, ['Thread glow', 'Golden thread', 'Thread highlight']), twist: L('Thread twist'), stars: L('Star'), lamp: L('Lamp glow') },
    vars: { tugs: 0 },
    goals: [{ id: 'thread-awake', label: 'Wake the thread with three tugs', when: gt('tugs', 3) }],
    ...musicOn(0, 'night-crickets', 0.22),
    a11y: { summary: 'One night the gold thread gives a tug, slides out of the window glowing, and draws a line across the dark hills.', instructions: 'Tap Glint three times to tug the thread. It draws itself across the hills.' },
    behaviors: [
      // the thread starts coiled up: it only appears when it has been tugged awake
      bhv('p3-coil', { group: 'thread' }, { type: 'enter' }, [{ do: 'set', props: { opacity: 0 } }]),
      idle('p3-stars', 'stars', 'twinkle', 0.8),
      idle('p3-lamp', 'lamp', 'breathe', 1.5),
      idle('p3-glint', 'glint', 'bob', 0.5),
      idle('p3-mira-blink', 'eyes', 'blink'),
      bhv('p3-tug', { group: 'glint' }, { type: 'tap' }, [
        { do: 'var', name: 'tugs', op: 'inc' },
        { do: 'animate', anim: { preset: 'shake', amount: 0.8 } }, { do: 'sfx', sound: 'thread-tug' }, tugHaptic,
        { do: 'if', cond: eq('tugs', 1), then: [{ do: 'note', instrument: 'harp', note: 'C4' }, say('Tug.')] },
        { do: 'if', cond: eq('tugs', 2), then: [{ do: 'note', instrument: 'harp', note: 'E4' }, say('Tug, tug.')] },
        { do: 'if', cond: eq('tugs', 3), then: [{ do: 'note', instrument: 'harp', note: 'G4' }, say('Tug, tug, tug. The thread slides out of the window.')] },
        { do: 'if', cond: gt('tugs', 4), then: [{ do: 'sfx', sound: 'thread-pluck', params: { gain: 0.6 } }] },
      ], {
        hint: 'Tap Glint to tug the thread. Three tugs wake it up',
        reduced: [{ do: 'var', name: 'tugs', op: 'inc' }, { do: 'sfx', sound: 'thread-tug' },
          { do: 'if', cond: eq('tugs', 3), then: [say('Tug, tug, tug. The thread slides out of the window.')], else: [say('Tug.')] }],
      }),
      bhv('p3-awake', { group: 'solid' }, { type: 'when', cond: gt('tugs', 3) }, [
        { do: 'animate', target: { group: 'solid' }, anim: { preset: 'draw-on', durationMs: 2900, easing: 'ease-in-out' } },
        { do: 'animate', target: { group: 'twist' }, anim: { preset: 'fade-in', durationMs: 2900 } },
        ...drawNotes, richer(1), { do: 'burst', at: { group: 'glint' }, kind: 'sparkles', count: 14 }, { do: 'haptic', pattern: 'success' },
      ], {
        reduced: [{ do: 'set', target: { group: 'thread' }, props: { opacity: 1 } }, { do: 'note', instrument: 'harp', note: 'C5' }, richer(1), say('The thread has drawn a line across the hills.')],
      }),
    ],
  });
}

function p4(): LivingPage {
  const K = pageKit(BOOK, 4);
  const glint = idsOf(K, GLINT);
  const path = sampler(pathPoints(K.obj(K.nth('Golden thread'))));
  const rest = center(K.box(glint));
  const T = 850;
  const ride = rideKeyframes({ path, s0: 0.1, s1: 0.97, rest, drag: p => ({ x: p * T, y: 0 }), blend: 0.12, steps: 40 });
  const noteBand = (i: number): Behavior => bhv(`p4-note-${i}`, { page: true }, { type: 'when', cond: band('pull', i === 0 ? 0.02 : i / 8, (i + 1) / 8 + (i === 7 ? 0.01 : 0)) }, [{ do: 'note', instrument: 'harp', note: RUN[i], durationMs: 1000, gain: 0.85 }, ...(i > 0 ? [tugHaptic] : [])]);
  return page(4, {
    groups: { glint, mira: miraIds(K), eyes: EYES, solid: idsOf(K, ['Thread glow', 'Golden thread', 'Thread highlight']), twist: L('Thread twist'), stars: L('Star'), moon: L('Moon') },
    vars: { pull: 0, pulled: 0 },
    goals: [{ id: 'pulled-thread', label: 'Pull the thread across the hills', when: gt('pulled', 1) }],
    ...musicOn(1, 'night-crickets', 0.2),
    a11y: { summary: 'A wide night sky of mountains. The gold thread curves across them with the story words riding on it, and a small golden light bobs ahead of Mira.', instructions: 'Drag Glint to the right to pull the thread across the hills. It plucks a harp note as it goes. Without dragging: tap Glint to pull the thread a little further, or use the arrow keys.' },
    behaviors: [
      idle('p4-stars', 'stars', 'twinkle', 0.8),
      idle('p4-moon', 'moon', 'breathe', 1.5),
      idle('p4-mira-blink', 'eyes', 'blink'),
      // the thread is drawn behind Glint as it is pulled (draw-on bound to the drag progress) and Glint rides the thread
      bhv('p4-draw', { group: 'solid' }, { type: 'enter' }, [{ do: 'animate', anim: { preset: 'draw-on', durationMs: 1000, easing: 'var:pull' } }]),
      bhv('p4-twist', { group: 'twist' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0 }, { at: 0.5, opacity: 0 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:pull' } }]),
      bhv('p4-ride', { group: 'glint' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: ride, durationMs: 1000, easing: 'var:pull' } }]),
      bhv('p4-pull', { group: 'glint' }, { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: T }, progressVar: 'pull' }, [tugHaptic, { do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } }], {
        hint: 'Drag Glint along the thread to pull it across the hills', reduced: [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } }, say('You pull the thread.')],
      }),
      bhv('p4-pull-tap', { group: 'glint' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } },
        { do: 'if', cond: lt('pull', 0.3), then: [{ do: 'set', props: { x: Math.round(T * 0.34) } }, { do: 'var', name: 'pull', op: 'set', value: 0.34 }], else: [{ do: 'if', cond: lt('pull', 0.66), then: [{ do: 'set', props: { x: Math.round(T * 0.68) } }, { do: 'var', name: 'pull', op: 'set', value: 0.68 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'pull', op: 'set', value: 1 }] }] },
      ], { hint: 'Tap Glint to pull the thread a little further', reduced: [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } }, { do: 'if', cond: lt('pull', 0.3), then: [{ do: 'set', props: { x: Math.round(T * 0.34) } }, { do: 'var', name: 'pull', op: 'set', value: 0.34 }], else: [{ do: 'if', cond: lt('pull', 0.66), then: [{ do: 'set', props: { x: Math.round(T * 0.68) } }, { do: 'var', name: 'pull', op: 'set', value: 0.68 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'pull', op: 'set', value: 1 }] }] }] }),
      ...RUN.map((_n, i) => noteBand(i)),
      bhv('p4-done', { page: true }, { type: 'when', cond: gt('pull', 0.97) }, [
        { do: 'var', name: 'pulled', op: 'set', value: 2 }, { do: 'sfx', sound: 'harp-gliss' }, richer(2), { do: 'burst', at: { group: 'glint' }, kind: 'sparkles', count: 14 }, { do: 'haptic', pattern: 'success' }, say('The thread is pulled across the hills.'),
      ]),
    ],
  });
}

function p5(): LivingPage {
  const K = pageKit(BOOK, 5);
  const needle = [K.nth('Needle thread')];
  const stitches = [1, 2, 3, 4].map(k => K.nth('Coat stitch', k));
  const T = 310, THRESH = [0.78, 0.85, 0.92, 0.98];
  // The needle is a thin gold line: a fingertip would miss it. So the child drags MIRA (a big, easy target, the one in the middle panel),
  // Mira's own movement is cancelled by an equal and opposite scrubbed offset, and the drag only supplies the progress that carries the needle.
  const handle = miraIds(K).filter(id => { const o = K.obj(id); return o.x >= 590 && o.x <= 745; });
  // the needle sinks from Mira's hands to the coat, then dips in and out for each stitch
  const ride = Array.from({ length: 25 }, (_, i) => {
    const p = i / 24; const q = Math.min(1, p / 0.75);
    const dip = p > 0.72 ? 8 * Math.sin((p - 0.72) * Math.PI * 2 * 9) * Math.min(1, (p - 0.72) / 0.05) : 0;
    return { at: p, x: Math.round(T * p * 10) / 10, y: Math.round((56 * q * (2 - q) + dip) * 10) / 10 };
  });
  return page(5, {
    groups: { mira: miraIds(K), eyes: EYES, handle, needle, coat: L('Gold coat', 'Coat trim'), stitches, wolfTails: L('Wolf tail'), stars: L('Star') },
    vars: { stitch: 0, mended: 0 },
    goals: [{ id: 'mended-coat', label: 'Sew the wolf a coat of gold', when: gt('mended', 1) }],
    ...musicOn(2, 'forest-wind', 0.22),
    a11y: { summary: 'Three arched panels: the grey wolf in shadow with a torn coat, Mira stitching, and the wolf in a golden coat looking away, embarrassed.', instructions: 'Drag Mira to the right and her needle carries gold stitches across to the wolf\'s coat. Without dragging: tap Mira to stitch, or use the arrow keys.' },
    behaviors: [
      idle('p5-stars', 'stars', 'twinkle', 0.7),
      idle('p5-tails', 'wolfTails', 'sway', 0.8),
      idle('p5-mira-blink', 'eyes', 'blink'),
      // the golden coat and its stitches appear as the needle arrives
      bhv('p5-coat', { group: 'coat' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0 }, { at: 0.74, opacity: 0 }, { at: 0.8, opacity: 1 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:stitch' } }]),
      ...stitches.map((id, i): Behavior => bhv(`p5-stitch-show-${i + 1}`, { id }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0 }, { at: THRESH[i] - 0.015, opacity: 0 }, { at: THRESH[i], opacity: 1 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:stitch' } }])),
      bhv('p5-needle-ride', { group: 'needle' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: ride, durationMs: 1000, easing: 'var:stitch' } }]),
      bhv('p5-stay', { group: 'handle' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, x: 0 }, { at: 1, x: -T }], durationMs: 1000, easing: 'var:stitch' } }]),
      bhv('p5-sew', { group: 'handle' }, { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: T }, progressVar: 'stitch' }, [{ do: 'sfx', sound: 'stitch', params: { gain: 0.8 } }, tugHaptic], {
        hint: 'Drag Mira to the right to carry her needle across and sew gold stitches', reduced: [{ do: 'sfx', sound: 'stitch', params: { gain: 0.8 } }, say('You sew the coat.')],
      }),
      bhv('p5-sew-tap', { group: 'handle' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'stitch', params: { gain: 0.8 } },
        { do: 'if', cond: lt('stitch', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.8) } }, { do: 'var', name: 'stitch', op: 'set', value: 0.8 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'stitch', op: 'set', value: 1 }] },
      ], { hint: 'Tap Mira to sew the coat, a few stitches at a time', reduced: [{ do: 'sfx', sound: 'stitch', params: { gain: 0.8 } }, { do: 'if', cond: lt('stitch', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.8) } }, { do: 'var', name: 'stitch', op: 'set', value: 0.8 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'stitch', op: 'set', value: 1 }] }] }),
      ...THRESH.map((th, i): Behavior => bhv(`p5-stitch-${i + 1}`, { page: true }, { type: 'when', cond: gt('stitch', th) }, [{ do: 'sfx', sound: 'stitch', params: { pitch: i * 2, gain: 0.9 } }, { do: 'note', instrument: 'pluck', note: ['E5', 'G5', 'A5', 'C6'][i], durationMs: 500, gain: 0.7 }])),
      bhv('p5-mended', { page: true }, { type: 'when', cond: gt('stitch', 0.97) }, [
        { do: 'var', name: 'mended', op: 'set', value: 1 }, { do: 'sfx', sound: 'success-jingle' }, richer(3), { do: 'animate', target: { group: 'wolfTails' }, anim: { preset: 'wiggle', amount: 1.2, loop: 2 } },
        { do: 'burst', at: { group: 'coat' }, kind: 'hearts', count: 10 }, { do: 'haptic', pattern: 'success' }, say('The wolf has a coat of gold.'),
      ]),
    ],
  });
}

function p6(): LivingPage {
  const K = pageKit(BOOK, 6);
  const glint = idsOf(K, GLINT);
  const deck = K.nth('Bridge deck');
  const path = sampler(pathPoints(K.obj(deck)));
  const rest = center(K.box(glint));
  const T = Math.round(690 - rest.x);
  const ride = rideKeyframes({ path, s0: 0, s1: 1, rest, drag: p => ({ x: p * T, y: 0 }), blend: 0.1, steps: 40, wobble: p => ({ x: 0, y: 11 * Math.sin(p * Math.PI * 12) * Math.sin(Math.PI * Math.min(1, p * 1.05)) }) });
  return page(6, {
    groups: { glint, mira: miraIds(K), eyes: EYES, deck: [deck, K.nth('Bridge shadow')], planks: L('Bridge planks'), stars: L('Star'), river: L('River zigzag'), firs: L('Fir tree') },
    vars: { bridge: 0, crossed: 0 },
    goals: [{ id: 'bridge-woven', label: 'Weave a golden bridge across the river', when: gt('crossed', 1) }],
    ...musicOn(3, 'ocean-hum', 0.2),
    a11y: { summary: 'A wide fast river with the old bridge washed away. On the far bank a family is trapped. Mira\'s golden thread will become the bridge.', instructions: 'Drag Glint across the river. The thread weaves back and forth and a golden bridge appears plank by plank. Without dragging: tap Glint to weave a bit more, or use the arrow keys.' },
    behaviors: [
      idle('p6-stars', 'stars', 'twinkle', 0.7),
      idle('p6-river', 'river', 'drift', 1.4),
      idle('p6-firs', 'firs', 'sway', 0.5),
      idle('p6-mira-blink', 'eyes', 'blink'),
      bhv('p6-deck', { group: 'deck' }, { type: 'enter' }, [{ do: 'animate', anim: { preset: 'draw-on', durationMs: 1000, easing: 'var:bridge' } }]),
      bhv('p6-planks', { group: 'planks' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0 }, { at: 0.25, opacity: 0 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:bridge' } }]),
      bhv('p6-ride', { group: 'glint' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: ride, durationMs: 1000, easing: 'var:bridge' } }]),
      bhv('p6-weave', { group: 'glint' }, { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: T }, progressVar: 'bridge' }, [{ do: 'sfx', sound: 'thread-pluck', params: { gain: 0.8 } }, { do: 'trail', kind: 'sparkles', whileVar: 'bridge.dragging' }, tugHaptic], {
        hint: 'Drag Glint across the river to weave the bridge', reduced: [{ do: 'sfx', sound: 'thread-pluck', params: { gain: 0.8 } }, say('You weave the bridge.')],
      }),
      bhv('p6-weave-tap', { group: 'glint' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'thread-pluck', params: { gain: 0.8 } },
        { do: 'if', cond: lt('bridge', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.5) } }, { do: 'var', name: 'bridge', op: 'set', value: 0.5 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'bridge', op: 'set', value: 1 }] },
      ], { hint: 'Tap Glint to weave some more of the bridge', reduced: [{ do: 'sfx', sound: 'thread-pluck', params: { gain: 0.8 } }, { do: 'if', cond: lt('bridge', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.5) } }, { do: 'var', name: 'bridge', op: 'set', value: 0.5 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'bridge', op: 'set', value: 1 }] }] }),
      ...RUN.map((n, i): Behavior => bhv(`p6-note-${i}`, { page: true }, { type: 'when', cond: band('bridge', i === 0 ? 0.02 : i / 8, (i + 1) / 8 + (i === 7 ? 0.01 : 0)) }, [{ do: 'note', instrument: 'kalimba', note: n, durationMs: 700, gain: 0.7 }])),
      bhv('p6-crossed', { page: true }, { type: 'when', cond: gt('bridge', 0.97) }, [
        { do: 'var', name: 'crossed', op: 'set', value: 1 }, { do: 'sfx', sound: 'success-jingle' }, richer(4), { do: 'burst', at: { group: 'deck' }, kind: 'sparkles', count: 16 }, { do: 'haptic', pattern: 'success' }, say('A golden bridge shines across the water.'),
      ]),
    ],
  });
}

function p7(): LivingPage {
  const K = pageKit(BOOK, 7);
  const glint = idsOf(K, GLINT);
  const rest = center(K.box(glint));
  const sash = K.nth('Silver sash'); const sashC = center(K.box([sash]));
  const UP = Math.round(rest.y - sashC.y);       // how far Glint has to fly
  const sideways = Math.round(sashC.x - rest.x);
  const ride = Array.from({ length: 13 }, (_, i) => { const p = i / 12; const s = p * p * (3 - 2 * p); return { at: p, x: Math.round(sideways * s * 10) / 10, y: 0 }; });
  return page(7, {
    groups: { glint, mira: miraIds(K), eyes: EYES, moon: L('Moon', 'Crater', 'Sleepy eye'), moonGlow: L('Moon glow'), sash: [sash], bow: L('Bow', 'Bow knot'), stars: L('Star'), rays: L('Rays') },
    vars: { flick: 0, tied: 0 },
    goals: [{ id: 'sash-tied', label: 'Tie the moon\'s sash', when: gt('tied', 1) }],
    ...musicOn(4, 'wind', 0.2),
    a11y: { summary: 'Three arched panels: the moon in the night sky with a frayed silver sash, the thread flying up, and the moon glowing again with a gold bow.', instructions: 'Flick Glint up towards the moon: drag it upwards in one quick swoop. It ties the moon\'s sash with a bow. Without dragging: tap Glint to throw the thread, or use the arrow keys.' },
    behaviors: [
      bhv('p7-frayed', { page: true }, { type: 'enter' }, [
        { do: 'set', target: { group: 'sash' }, props: { opacity: 0.55 } }, { do: 'set', target: { group: 'bow' }, props: { opacity: 0 } }, { do: 'set', target: { group: 'moonGlow' }, props: { opacity: 0.3 } },
      ]),
      idle('p7-stars', 'stars', 'twinkle', 0.8),
      idle('p7-rays', 'rays', 'twinkle', 0.6),
      idle('p7-glint', 'glint', 'bob', 0.4),
      idle('p7-mira-blink', 'eyes', 'blink'),
      bhv('p7-ride', { group: 'glint' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: ride, durationMs: 1000, easing: 'var:flick' } }]),
      bhv('p7-flick', { group: 'glint' }, { type: 'drag', axis: 'y', bounds: { minY: -UP, maxY: 0 }, snapBack: true, progressVar: 'flick' }, [
        { do: 'sfx', sound: 'whoosh', params: { gain: 0.5 } }, { do: 'trail', kind: 'stars', whileVar: 'flick.dragging' }, { do: 'haptic', pattern: 'soft' },
      ], { hint: 'Flick Glint up towards the moon', reduced: [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.5 } }, say('You throw the thread up to the moon.')] }),
      bhv('p7-flick-tap', { group: 'glint' }, { type: 'tap' }, [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.5 } }, { do: 'var', name: 'flick', op: 'set', value: 1 }], { hint: 'Tap Glint to throw the thread up to the moon', reduced: [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.5 } }, { do: 'var', name: 'flick', op: 'set', value: 1 }] }),
      bhv('p7-tied', { page: true }, { type: 'when', cond: gt('flick', 0.8) }, [
        { do: 'var', name: 'tied', op: 'set', value: 1 },
        { do: 'set', target: { group: 'sash' }, props: { opacity: 1, fill: '#EEF4F8' } }, { do: 'show', target: { group: 'bow' }, anim: { preset: 'pop-in', durationMs: 450 } },
        { do: 'set', target: { group: 'moonGlow' }, props: { opacity: 1 } }, { do: 'animate', target: { group: 'moonGlow' }, anim: { preset: 'pulse', amount: 1.2 } },
        { do: 'sfx', sound: 'harp-gliss' }, { do: 'sfx', sound: 'chime', params: { gain: 0.7 } }, richer(5), { do: 'burst', at: { group: 'sash' }, kind: 'stars', count: 14 }, { do: 'haptic', pattern: 'success' }, say('The thread ties the moon\'s sash. The moon glows again.'),
      ], { reduced: [{ do: 'var', name: 'tied', op: 'set', value: 1 }, { do: 'set', target: { group: 'sash' }, props: { opacity: 1, fill: '#EEF4F8' } }, { do: 'set', target: { group: 'bow' }, props: { opacity: 1 } }, { do: 'set', target: { group: 'moonGlow' }, props: { opacity: 1 } }, { do: 'sfx', sound: 'chime', params: { gain: 0.7 } }, richer(5), say('The thread ties the moon\'s sash. The moon glows again.')] }),
      tap('p7-moon', { group: 'moon' }, 'Tap the moon to hear her yawn', [{ do: 'sfx', sound: 'yawn', params: { gain: 0.5 } }, { do: 'animate', anim: { preset: 'bob', amount: 0.8, loop: 2 } }], { announce: 'The moon yawns.' }),
    ],
  });
}

function p8(): LivingPage {
  const K = pageKit(BOOK, 8);
  const mira = miraIds(K);
  const steps = [1, 2, 3, 4, 5, 6, 7].map(k => K.nth('Star step glow', k));
  const first = K.obj(steps[0]), last = K.obj(steps[6]);
  const T = Math.round(last.x - first.x);       // Mira climbs from the first step to the last
  const UP = Math.round(first.y - last.y);
  const bells = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6'];
  const ride = Array.from({ length: 29 }, (_, i) => { const p = i / 28; return { at: p, x: 0, y: -Math.round((UP * p + 6 * Math.abs(Math.sin(p * Math.PI * 7)) * -1) * 10) / 10 }; });
  return page(8, {
    groups: { mira, eyes: EYES, stars: L('Star'), knot: L('Knot', 'Knot glow', 'Knot aura'), knotGlow: L('Knot glow', 'Knot aura'), tangle: L('Tangle'), ...Object.fromEntries(steps.map((s, i) => [`step${i + 1}`, [s]])) },
    vars: { climb: 0, climbed: 0 },
    goals: [{ id: 'top-of-world', label: 'Climb the stair of stars', when: gt('climbed', 1) }],
    ...musicOn(5, 'space-drone', 0.18),
    a11y: { summary: 'A dark wine page with a ring of stars: tiny Mira at the bottom and a huge gold knot at the top edge. A stair of stars climbs towards it.', instructions: 'Drag Mira up the stair of stars: every step rings a bell. Tap the knot to hear it hum. Without dragging: tap Mira to climb a few steps, or use the arrow keys.' },
    behaviors: [
      idle('p8-stars', 'stars', 'twinkle', 0.7),
      idle('p8-knot-glow', 'knotGlow', 'breathe', 1.5),
      idle('p8-tangle', 'tangle', 'drift', 0.6),
      idle('p8-mira-blink', 'eyes', 'blink'),
      bhv('p8-ride', { group: 'mira' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: ride, durationMs: 1000, easing: 'var:climb' } }]),
      bhv('p8-climb', { group: 'mira' }, { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: T }, progressVar: 'climb' }, [{ do: 'sfx', sound: 'footstep', params: { gain: 0.6 } }, { do: 'haptic', pattern: 'soft' }], {
        hint: 'Drag Mira up the stair of stars', reduced: [{ do: 'sfx', sound: 'footstep', params: { gain: 0.6 } }, say('Mira climbs.')],
      }),
      bhv('p8-climb-tap', { group: 'mira' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'footstep', params: { gain: 0.6 } },
        { do: 'if', cond: lt('climb', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.5) } }, { do: 'var', name: 'climb', op: 'set', value: 0.5 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'climb', op: 'set', value: 1 }] },
      ], { hint: 'Tap Mira to climb a few steps', reduced: [{ do: 'sfx', sound: 'footstep', params: { gain: 0.6 } }, { do: 'if', cond: lt('climb', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.5) } }, { do: 'var', name: 'climb', op: 'set', value: 0.5 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'climb', op: 'set', value: 1 }] }] }),
      ...bells.map((n, i): Behavior => bhv(`p8-step-${i + 1}`, { page: true }, { type: 'when', cond: gt('climb', (i + 0.35) / 7) }, [
        { do: 'note', instrument: 'bell', note: n, durationMs: 1400, gain: 0.8 }, { do: 'animate', target: { group: `step${i + 1}` }, anim: { preset: 'pulse', amount: 2.5 } },
      ], { reduced: [{ do: 'note', instrument: 'bell', note: n, durationMs: 1400, gain: 0.8 }] })),
      bhv('p8-top', { page: true }, { type: 'when', cond: gt('climb', 0.97) }, [
        { do: 'var', name: 'climbed', op: 'set', value: 1 }, { do: 'sfx', sound: 'harp-gliss' }, { do: 'burst', at: { group: 'knot' }, kind: 'stars', count: 14 }, { do: 'haptic', pattern: 'success' }, say('Mira reaches the top of the world.'),
      ]),
      tap('p8-knot', { group: 'knot' }, 'Tap the great knot to hear it hum', [{ do: 'sfx', sound: 'hum', params: { gain: 0.7 } }, { do: 'animate', target: { group: 'knotGlow' }, anim: { preset: 'pulse', amount: 1.1 } }, { do: 'haptic', pattern: 'soft' }], { announce: 'The great knot hums.' }),
    ],
  });
}

function p9(): LivingPage {
  const K = pageKit(BOOK, 9);
  const windings = K.all('Winding'); const curl = K.nth('Thread curl');
  const T = 240;
  // The loose end is a thin stroke at the top edge of the page: too small to grab. The child drags the great round Glint instead (a huge,
  // easy target), Glint's own movement is cancelled by an equal and opposite scrubbed offset, and the drag only supplies the progress.
  const turn = (sign: number, extra: Record<string, number> = {}) => [{ at: 0, rotate: 0, scale: 1, opacity: 0.7, ...extra }, { at: 1, rotate: 540 * sign, scale: 1.2, opacity: 0.12 }];
  return page(9, {
    groups: { mira: miraBodyIds(K), windings, end: [curl], handle: [K.nth('Glint')], rays: L('Rays'), great: L('Great glow', 'Glint glow'), face: ['label:Eye', 'label:Pupil', 'label:Eye shine', 'label:Open mouth', 'label:Cheek'], stars: L('Star') },
    vars: { unwind: 0, free: 0 },
    goals: [{ id: 'knot-undone', label: 'Unwind the knot', when: gt('free', 1), celebrate: true }],
    ...musicOn(5, 'wind', 0.2),
    a11y: { summary: 'A giant glowing ball of thread with a big surprised face, a tiny Mira in front of it and a burst of gold rays.', instructions: 'Drag the great round Glint to the right to unwind the knot. The loose end of the thread flies out, the windings loosen and turn, and gold spills across the sky. Without dragging: tap Glint, or use the arrow keys.' },
    behaviors: [
      idle('p9-rays', 'rays', 'spin', 1, { durationMs: 220000, easing: 'linear' }),
      idle('p9-glow', 'great', 'breathe', 1.5),
      idle('p9-stars', 'stars', 'twinkle', 0.8),
      idle('p9-face', 'face', 'blink'),
      bhv('p9-windings', { group: 'windings' }, { type: 'enter' }, windings.map((id, i): Action => ({ do: 'animate', target: { id }, anim: { keyframes: turn(i % 2 ? -1 : 1), durationMs: 1000, easing: 'var:unwind' } }))),
      bhv('p9-end-spin', { group: 'end' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, x: 0, y: 0, rotate: 0 }, { at: 1, x: T, y: 60, rotate: 720 }], durationMs: 1000, easing: 'var:unwind' } }]),
      bhv('p9-stay', { group: 'handle' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, x: 0 }, { at: 1, x: -T }], durationMs: 1000, easing: 'var:unwind' } }]),
      bhv('p9-unwind', { group: 'handle' }, { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: T }, progressVar: 'unwind' }, [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } }, { do: 'trail', kind: 'embers', whileVar: 'unwind.dragging' }, tugHaptic], {
        hint: 'Drag the great round Glint to the right to unwind the knot', reduced: [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } }, say('You unwind the knot.')],
      }),
      bhv('p9-unwind-tap', { group: 'handle' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } },
        { do: 'if', cond: lt('unwind', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.55) } }, { do: 'var', name: 'unwind', op: 'set', value: 0.55 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'unwind', op: 'set', value: 1 }] },
      ], { hint: 'Tap the great round Glint to unwind the knot a little', reduced: [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.8 } }, { do: 'if', cond: lt('unwind', 0.5), then: [{ do: 'set', props: { x: Math.round(T * 0.55) } }, { do: 'var', name: 'unwind', op: 'set', value: 0.55 }], else: [{ do: 'set', props: { x: T } }, { do: 'var', name: 'unwind', op: 'set', value: 1 }] }] }),
      bhv('p9-loosening', { page: true }, { type: 'when', cond: gt('unwind', 0.5) }, [{ do: 'sfx', sound: 'unravel', params: { gain: 0.6 } }, say('The knot loosens.')]),
      bhv('p9-free', { page: true }, { type: 'when', cond: gt('unwind', 0.96) }, [
        { do: 'var', name: 'free', op: 'set', value: 1 }, { do: 'set', target: { page: true }, props: { fill: '#FFC928', opacity: 0.22 } },
        { do: 'sfx', sound: 'success-jingle' }, richer(6), { do: 'burst', at: { x: 220, y: 200 }, kind: 'sparkles', count: 24 }, { do: 'burst', at: { x: 560, y: 160 }, kind: 'stars', count: 18 }, { do: 'haptic', pattern: 'success' },
        say('The knot sighs and loosens. Gold flies across the sky.'), { do: 'wait', ms: 1800 }, { do: 'set', target: { page: true }, props: { opacity: 0 } },
      ], { reduced: [{ do: 'var', name: 'free', op: 'set', value: 1 }, { do: 'sfx', sound: 'success-jingle' }, richer(6), say('The knot sighs and loosens. Gold flies across the sky.')] }),
    ],
  });
}

function p10(): LivingPage {
  const K = pageKit(BOOK, 10);
  const spool = [K.nth('Last spool'), K.nth('Spool hole')];
  const glintFace = idsOf(K, [...GLINT, 'Eye', 'Pupil', 'Eye shine', 'Cheek', 'Open mouth']);
  const UP = Math.round(K.box(spool).y - (K.obj(K.nth('Glint')).y + K.obj(K.nth('Glint')).h) - 6);
  return page(10, {
    groups: { spool, mira: miraBodyIds(K), glint: glintFace, glow: L('Knot glow', 'Glint glow'), stars: L('Star') },
    vars: { give: 0, gave: 0 },
    goals: [{ id: 'gave-thread', label: 'Give the last of the thread freely', when: gt('gave', 1) }],
    ...musicOn(6, 'wind', 0.18),
    a11y: { summary: 'Mira holds out the last of her golden spool; the thread glows and leaves her hands to reach the knot.', instructions: 'Drag the last spool up to the knot. It gets smaller as Mira gives the thread away. Without dragging: tap the spool, or use the arrow keys.' },
    behaviors: [
      idle('p10-stars', 'stars', 'twinkle', 0.8),
      idle('p10-glow', 'glow', 'breathe', 1.4),
      idle('p10-spool', 'spool', 'bob', 0.5),
      bhv('p10-shrink', { group: 'spool' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, scale: 1 }, { at: 1, scale: 0.3 }], durationMs: 1000, easing: 'var:give' } }]),
      bhv('p10-glow-up', { group: 'glow' }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: [{ at: 0, opacity: 0.45 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:give' } }]),
      bhv('p10-give', { group: 'spool' }, { type: 'drag', axis: 'y', bounds: { minY: -UP, maxY: 0 }, progressVar: 'give' }, [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.7 } }, { do: 'trail', kind: 'fireflies', whileVar: 'give.dragging' }, { do: 'haptic', pattern: 'soft' }], {
        hint: 'Drag the last spool up to the knot to give the thread away', reduced: [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.7 } }, say('Mira gives her thread to the knot.')],
      }),
      bhv('p10-give-tap', { group: 'spool' }, { type: 'tap' }, [
        { do: 'sfx', sound: 'thread-tug', params: { gain: 0.7 } },
        { do: 'if', cond: lt('give', 0.5), then: [{ do: 'set', props: { y: -Math.round(UP * 0.55) } }, { do: 'var', name: 'give', op: 'set', value: 0.55 }], else: [{ do: 'set', props: { y: -UP } }, { do: 'var', name: 'give', op: 'set', value: 1 }] },
      ], { hint: 'Tap the spool to give a little of the thread', reduced: [{ do: 'sfx', sound: 'thread-tug', params: { gain: 0.7 } }, { do: 'if', cond: lt('give', 0.5), then: [{ do: 'set', props: { y: -Math.round(UP * 0.55) } }, { do: 'var', name: 'give', op: 'set', value: 0.55 }], else: [{ do: 'set', props: { y: -UP } }, { do: 'var', name: 'give', op: 'set', value: 1 }] }] }),
      bhv('p10-gave', { page: true }, { type: 'when', cond: gt('give', 0.95) }, [
        { do: 'var', name: 'gave', op: 'set', value: 1 }, { do: 'sfx', sound: 'unravel', params: { gain: 0.7 } }, { do: 'note', instrument: 'bell', note: 'E6', durationMs: 1800 }, { do: 'animate', target: { group: 'glint' }, anim: { preset: 'pulse', amount: 1.2 } },
        { do: 'burst', at: { group: 'glint' }, kind: 'sparkles', count: 16 }, { do: 'haptic', pattern: 'success' }, say('The knot sighs. It has been given freely.'),
      ]),
    ],
  });
}

function p11(): LivingPage {
  const K = pageKit(BOOK, 11);
  return page(11, {
    groups: { newSpool: L('New spool', 'Spool glow'), spoolGlow: L('Spool glow'), mira: miraBodyIds(K), rays: L('Rays'), goldGlow: L('Gold glow'), stars: L('Star'), quilt: L('Quilt triangles'), glintFace: ['label:Eye', 'label:Pupil', 'label:Eye shine'], glint: idsOf(K, GLINT) },
    ...musicOn(6, 'wind', 0.16),
    a11y: { summary: 'A quilt-like epilogue: gold thread spreading across the world, Mira at the centre with a new glowing spool, and Glint relaxed and smiling.', instructions: 'Tap the new spool to see the thread come back to Mira.' },
    behaviors: [
      idle('p11-rays', 'rays', 'spin', 1, { durationMs: 200000, easing: 'linear' }),
      idle('p11-glow', 'goldGlow', 'breathe', 1.5),
      idle('p11-stars', 'stars', 'twinkle', 0.8),
      idle('p11-spool', 'spoolGlow', 'breathe', 2),
      idle('p11-eyes', 'glintFace', 'blink'),
      idle('p11-quilt', 'quilt', 'shimmer', 0.8),
      tap('p11-spool-tap', { group: 'newSpool' }, 'Tap the new spool to see the thread come back', [
        { do: 'animate', target: { group: 'spoolGlow' }, anim: { preset: 'pulse', amount: 2 } }, { do: 'sfx', sound: 'harp-gliss' }, { do: 'note', instrument: 'harp', note: 'scale:C5,E5,G5,A5,C6' }, { do: 'burst', kind: 'sparkles', count: 14 }, { do: 'haptic', pattern: 'success' },
      ], { announce: 'The new spool glows. Thread that is given is thread that comes back.' }),
      tap('p11-glint', { group: 'glint' }, 'Tap Glint to say thank you', [{ do: 'animate', anim: { preset: 'bounce', amount: 0.8 } }, { do: 'sfx', sound: 'thread-pluck' }, { do: 'burst', kind: 'hearts', count: 8 }], { announce: 'Glint smiles.' }),
    ],
  });
}

function p12(): LivingPage {
  const K = pageKit(BOOK, 12);
  return page(12, {
    groups: { blanket: L('Golden blanket', 'Blanket stitches', 'Blanket glow'), blanketGlow: L('Blanket glow'), smoke: L('Smoke'), stars: L('Star'), glint: idsOf(K, GLINT), thread: L('Thread highlight', 'Thread twist'), mira: miraIds(K), eyes: EYES },
    ...musicOn(6, 'night-crickets', 0.16),
    a11y: { summary: 'A wine-dark page with a single golden blanket glowing over the three hills at night, Mira small at the window of her house, Glint a tiny spark beside her.', instructions: 'Tap the blanket for a harp sparkle. Press and hold it to hum along: slide your finger up or down to bend the note.' },
    behaviors: [
      idle('p12-stars', 'stars', 'twinkle', 0.8),
      idle('p12-smoke', 'smoke', 'float', 2),
      idle('p12-blanket', 'blanketGlow', 'breathe', 1.6),
      idle('p12-glint', 'glint', 'bob', 0.4),
      idle('p12-thread', 'thread', 'shimmer', 1),
      idle('p12-eyes', 'eyes', 'blink'),
      tap('p12-tap-blanket', { group: 'blanket' }, 'Tap the blanket to hear a harp sparkle', [{ do: 'animate', target: { group: 'blanketGlow' }, anim: { preset: 'pulse', amount: 1.3 } }, { do: 'note', instrument: 'harp', note: 'scale:A3,C4,E4,G4,A4,C5' }, { do: 'sfx', sound: 'sparkle', params: { gain: 0.5 } }, { do: 'burst', kind: 'sparkles', count: 8 }], { announce: 'The blanket sparkles.' }),
      bhv('p12-hold-blanket', { group: 'blanket' }, { type: 'press', minMs: 380 }, [{ do: 'note', instrument: 'hum', note: 'A3', gain: 0.9 }, { do: 'animate', target: { group: 'blanketGlow' }, anim: { preset: 'pulse', amount: 1.3 } }, { do: 'haptic', pattern: 'soft' }], {
        hint: 'Press and hold the blanket to hum along, slide up or down to bend the note', reduced: [{ do: 'note', instrument: 'hum', note: 'A3', gain: 0.9 }, say('The blanket hums.')],
      }),
    ],
  });
}

function p13(): LivingPage {
  const K = pageKit(BOOK, 13);
  const colours = ['red', 'blue-green', 'orange'];
  const HOME = 1;   // thread 1 ends at the middle house, next to Mira
  const beads = [1, 2, 3].map(k => [K.nth('Spool badge', k), K.nth('Spool number', k)]);
  const traces = beads.map((b, i) => {
    const k = i + 1; const threadId = K.nth('Golden thread', k);
    const path = sampler(pathPoints(K.obj(threadId)));
    const rest = center(K.box(b)); const end = path(1);
    const T = Math.round(end.x - rest.x);
    return { k, b, threadId, T, ride: rideKeyframes({ path, s0: 0, s1: 1, rest, drag: p => ({ x: p * T, y: 0 }), blend: 0.1, steps: 28 }) };
  });
  const winWindows = [K.nth('Diamond window', 2)];
  const miraBody = miraIds(K);
  return page(13, {
    groups: {
      mira: miraBody, smoke: L('Smoke'), letters: L('Title letter*'), glint: idsOf(K, GLINT), homeWindow: winWindows, ...Object.fromEntries(traces.map(t => [`bead${t.k}`, t.b])),
    },
    vars: { t1: 0, t2: 0, t3: 0, home: 0, tries: 0 },
    goals: [{ id: 'followed-thread', label: 'Follow the thread that leads Mira home', when: gt('home', 1), celebrate: true }],
    ...musicOn(6, 'room-tone', 0.14),
    a11y: { summary: 'Three gold threads wander from numbered spools to three houses. Only one leads Mira home; she waits by the middle house.', instructions: 'Drag each numbered bead along its thread to the house at the end. A bead only counts if it reaches the end of its thread. Thread one: red spool. Thread two: blue-green spool. Thread three: orange spool. Without dragging: select a bead and press Enter to follow its thread all the way.' },
    behaviors: [
      idle('p13-smoke', 'smoke', 'float', 2),
      idle('p13-title', 'letters', 'float', 0.35),
      idle('p13-glint', 'glint', 'bob', 0.4),
      ...traces.map((t): Behavior => bhv(`p13-ride${t.k}`, { group: `bead${t.k}` }, { type: 'enter' }, [{ do: 'animate', anim: { keyframes: t.ride, durationMs: 1000, easing: `var:t${t.k}` } }])),
      ...traces.map((t): Behavior => bhv(`p13-trace${t.k}`, { group: `bead${t.k}` }, { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: t.T }, snapBack: true, snapTo: [{ x: t.T, y: 0, r: 90 }], progressVar: `t${t.k}` }, [
        { do: 'var', name: 'tries', op: 'inc' }, { do: 'sfx', sound: 'thread-pluck', params: { gain: 0.6 } }, { do: 'trail', kind: 'sparkles', whileVar: `t${t.k}.dragging` }, { do: 'haptic', pattern: 'soft' },
      ], {
        hint: `Follow thread ${t.k}, the ${colours[t.k - 1]} spool, to the house at its end: drag the number along the thread`,
        reduced: [{ do: 'var', name: 'tries', op: 'inc' }, { do: 'sfx', sound: 'thread-pluck', params: { gain: 0.6 } }, say(`You follow thread ${t.k}.`)],
      })),
      // no drag? tap a bead to send it all the way along its thread: the same result goes through the same arrival event
      ...traces.map((t): Behavior => {
        const go: Action[] = [{ do: 'sfx', sound: 'thread-pluck', params: { gain: 0.6 } }, { do: 'set', props: { x: t.T } }, { do: 'var', name: `t${t.k}`, op: 'set', value: 1 }, { do: 'emit', name: `drag:snap:p13-trace${t.k}` }];
        return bhv(`p13-tap${t.k}`, { group: `bead${t.k}` }, { type: 'tap' }, go, { hint: `Tap the number ${t.k} to follow thread ${t.k}, the ${colours[t.k - 1]} spool, all the way to its house`, reduced: go });
      }),
      // the finger only counts if it brings the bead all the way to the end of the thread: that is the snap point, and the only thing that fires these
      ...traces.map((t): Behavior => t.k === HOME
        ? bhv(`p13-arrive${t.k}`, { page: true }, { type: 'event', name: `drag:snap:p13-trace${t.k}` }, [
          { do: 'var', name: 'home', op: 'set', value: 1 }, { do: 'sfx', sound: 'success-jingle' }, { do: 'animate', target: { group: 'mira' }, anim: { preset: 'bounce', amount: 1 } },
          { do: 'set', target: { group: 'homeWindow' }, props: { fill: '#FFE27A' } }, { do: 'music', cue: cue(6), fadeMs: 1500 }, { do: 'burst', at: { group: 'mira' }, kind: 'hearts', count: 12 }, { do: 'haptic', pattern: 'success' },
          say('Thread one leads Mira home. Well done!'),
        ], { reduced: [{ do: 'var', name: 'home', op: 'set', value: 1 }, { do: 'set', target: { group: 'homeWindow' }, props: { fill: '#FFE27A' } }, { do: 'sfx', sound: 'success-jingle' }, say('Thread one leads Mira home. Well done!')] })
        : bhv(`p13-arrive${t.k}`, { page: true }, { type: 'event', name: `drag:snap:p13-trace${t.k}` }, [
          { do: 'sfx', sound: 'gentle-no' }, say(`Thread ${t.k} reaches a different house. Mira is not there. Try another thread.`), { do: 'wait', ms: 1100 },
          { do: 'set', target: { group: `bead${t.k}` }, props: { x: 0, y: 0 } }, { do: 'var', name: `t${t.k}`, op: 'set', value: 0 },
        ], { reduced: [{ do: 'sfx', sound: 'gentle-no' }, say(`Thread ${t.k} reaches a different house. Mira is not there. Try another thread.`), { do: 'set', target: { group: `bead${t.k}` }, props: { x: 0, y: 0 } }, { do: 'var', name: `t${t.k}`, op: 'set', value: 0 }] })),
      tap('p13-glint-hint', { group: 'glint' }, 'Tap Glint for a hint', [{ do: 'animate', anim: { preset: 'bounce', amount: 0.8 } }, { do: 'sfx', sound: 'thread-pluck' }], { announce: 'Glint says: Mira is by the middle house. Which thread reaches it?' }),
    ],
  });
}

function p14(): LivingPage {
  const K = pageKit(BOOK, 14);
  return page(14, {
    groups: { glint: idsOf(K, GLINT), thread: L('Thread highlight', 'Thread twist'), eyes: ['label:Eye', 'label:Pupil', 'label:Eye shine'], rosette: L('Rosette petals') },
    ...musicOn(6, 'room-tone', 0.12),
    a11y: { summary: 'The back cover: a wine ground with Glint in the corner and the book\'s blurb on a folk-art arch.', instructions: 'Tap Glint to hear the thread.' },
    behaviors: [
      idle('p14-glint', 'glint', 'bob', 0.4),
      idle('p14-eyes', 'eyes', 'blink'),
      idle('p14-thread', 'thread', 'shimmer', 1),
      idle('p14-rosette', 'rosette', 'breathe', 1.5),
      tap('p14-glint-tap', { group: 'glint' }, 'Tap Glint to hear the thread', [{ do: 'animate', anim: { preset: 'bounce', amount: 0.8 } }, { do: 'sfx', sound: 'thread-pluck' }, { do: 'note', instrument: 'harp', note: 'scale:A3,C4,E4,G4,A4,C5' }, { do: 'burst', kind: 'sparkles', count: 6 }], { announce: 'Glint plucks the thread.' }),
    ],
  });
}

export const goldenThreadLiving: LivingBook = {
  version: 1,
  bookId: BOOK,
  pages: [p1(), p2(), p3(), p4(), p5(), p6(), p7(), p8(), p9(), p10(), p11(), p12(), p13(), p14()],
  scores,
  defaults: { musicGain: 0.5, sfxGain: 0.8, narrate: 'on-demand', ambient: true },
  authorNotes:
    'The Golden Thread shows touch as storytelling. p4, p6, p13: a drag writes a progress variable; the thread DRAWS ON bound to that variable (easing "var:<name>") and Glint rides the thread path, which is computed from the designer\'s own svgPathData when this file is built. ' +
    'p13 validates the child\'s trace: each bead has a snap point at the end of its thread, and only the thread that reaches Mira\'s house counts. ' +
    'Music: folk harp and a drone that grows with every task. gt-0 .. gt-6 add flute, harp runs, kalimba, voices, bass and bells; completing a task crossfades to the next level, and each page opens at the level the story has reached. Variables do not travel between pages, so a page cannot know whether an earlier task was really done: that is why levels are keyed to the page order as well as to completion.',
};

export default goldenThreadLiving;
