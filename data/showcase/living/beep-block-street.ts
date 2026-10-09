// BEEP BLOCK STREET: the living edition (ages 3-5, pop). Loud, rhythmic, cause and effect.
//
// What this file demonstrates about the Tela living format: instruments the child plays (Bo's beep changes with WHERE you tap), a traffic-jam chorus that
// builds, drag with a progress variable (pull Pip to POP), and a real game with counters and a celebration (Find Pip in the windows). Everything is data.
//
// Rules this edition keeps: sound is off until a gesture (the reader unlocks it); all audio is synthesised in code; every idle motion is seeded; the flat
// page stands alone (a behaviour that hides something on enter always brings it back, and a timer completes page 7 for readers who never pull);
// every interactive behaviour has a hint (its accessible name) and a reduced twin (a still change plus the same sound, no movement).
//
// Targets are labels the page designer (story-city) really emits. Parts that appear several times on a page (Bo's two eyes among the pigeons' eyes, the
// three window pigeons on page 3, the 16 windows on page 9) are addressed by the stable ids `p<NN>_<slug>_<k>`.
import type { Action, Behavior, LivingBook, LivingPage, Score } from '../../../services/living/contracts';
import { arpeggiate, bassline, chord, chordsToNotes, drums, makeScore, merge, parseNotation, track } from '../../../services/living/audio/compose';
import { beepBlockStreet } from '../books/beepBlockStreet';
import { G, ID, L, PAGE, all, blip, eq, ge, goal, ids, idle, lab, narr, onEnter, page, pg, span, tap, when } from './kitMoonBeep';

const text = (n: number) => beepBlockStreet.spreads[n - 1].text;

// ───────────────────────────── music: a bouncy synthesised groove ─────────────────────────────
// 'groove' = 8 bars of 4/4 at 112 in G (oompah bass, kit, marimba stabs, kalimba hook). 'hush' (page 4: the silent morning) and 'dusk' (pages 8, 10) are
// the same street at other moods. Page 7 raises the tempo with `musicTempo` when the beep comes back.
function groove(): Score {
  const roots = ['G2', 'C3', 'D3', 'G2', 'E2', 'C3', 'D3', 'G2'];
  const bass = bassline(roots, 'oompah', { beatsPerBar: 4, vel: 0.75 });
  const kit = drums({ kick: 'x...x...x..xx...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx', shaker: '..x...x...x...x.' }, { stepBeats: 0.25, bars: 8 });
  const chords = [chord('G4', 'maj'), chord('C4', 'maj'), chord('D4', 'maj'), chord('G4', 'maj'), chord('E4', 'min'), chord('C4', 'maj'), chord('D4', 'maj'), chord('G4', 'maj')];
  const stabs = chords.flatMap((c, b) => c.flatMap(n => [{ t: b * 4 + 0.5, n, d: 0.25, v: 0.45 }, { t: b * 4 + 2.5, n, d: 0.25, v: 0.4 }, { t: b * 4 + 3.5, n, d: 0.2, v: 0.45 }]));
  const hook = parseNotation(
    'rest:.5 G5:.5 B5:.5 D6:.5 G6:1 D6:.5 B5:.5 | E6:1 C6:.5 E6:.5 G6:1 E6:.5 C6:.5 | D6:1 A5:.5 D6:.5 F#6:1 D6:.5 A5:.5 | G6:1.5 D6:.5 B5:1 G5:1 | ' +
    'B5:.5 E6:.5 G6:.5 E6:.5 B5:1 G5:.5 B5:.5 | C6:.5 E6:.5 G6:.5 E6:.5 C6:1 G5:1 | A5:.5 D6:.5 F#6:.5 A6:.5 F#6:1 D6:1 | G6:2 rest:.5 D6:.5 G6:1', { defaultVel: 0.62 });
  return makeScore({
    id: 'groove', tempo: 112, beatsPerBar: 4, lengthBeats: 32, reverb: 0.14,
    variation: { seed: 17, humanizeMs: 8 },
    tracks: [track('bass', bass, { gain: 0.8 }), track('drum', kit, { gain: 0.75 }), track('marimba', stabs, { gain: 0.45, pan: 0.2 }), track('kalimba', hook.notes, { gain: 0.62, pan: -0.2 })],
  });
}
function hush(): Score {
  const prog = [chord('E3', 'min'), chord('C3', 'maj'), chord('G3', 'maj'), chord('D3', 'maj')];
  const pad = chordsToNotes(prog, 4, { vel: 0.3, hold: 0.99 });
  const bass = bassline(['E2', 'C2', 'G2', 'D2'], 'root', { beatsPerBar: 4, vel: 0.5 });
  const tune = parseNotation('rest:2 B4:1 E5:1 | rest:2 G4:1 C5:1 | rest:1 D5:1 B4:2 | A4:2 F#4:2', { defaultVel: 0.45 });
  const tick = drums({ click: 'x...x...x...x...' }, { stepBeats: 0.25, bars: 4 }).map(n => ({ ...n, v: 0.3 }));
  return makeScore({
    id: 'hush', tempo: 88, beatsPerBar: 4, lengthBeats: 16, reverb: 0.3,
    variation: { seed: 4, humanizeMs: 14, dropout: 0.05 },
    tracks: [track('pad', pad, { gain: 0.4 }), track('bass', bass, { gain: 0.5 }), track('marimba', tune.notes, { gain: 0.5 }), track('drum', tick, { gain: 0.35 })],
  });
}
function dusk(): Score {
  const prog = [chord('G3', 'maj'), chord('E3', 'min'), chord('C3', 'maj'), chord('D3', 'maj')];
  const pad = chordsToNotes(prog, 4, { vel: 0.3, hold: 0.99 });
  const harp = prog.flatMap((c, b) => arpeggiate(c.map(n => n + 12), { pattern: 'updown', step: 0.5, count: 8, dur: 1, t0: b * 4, vel: 0.42 }));
  const bass = bassline(['G2', 'E2', 'C2', 'D2'], 'root-fifth', { beatsPerBar: 4, vel: 0.5 });
  const shake = drums({ shaker: '..x...x...x...x.' }, { stepBeats: 0.25, bars: 4 }).map(n => ({ ...n, v: 0.35 }));
  const tune = parseNotation('B5:1.5 A5:.5 G5:2 | G5:1 B5:1 E6:2 | E6:1.5 D6:.5 C6:2 | D6:2 G5:2', { defaultVel: 0.5 });
  return makeScore({
    id: 'dusk', tempo: 80, beatsPerBar: 4, lengthBeats: 16, reverb: 0.3,
    variation: { seed: 9, humanizeMs: 14, dropout: 0.04 },
    tracks: [track('pad', pad, { gain: 0.36 }), track('harp', merge(harp), { gain: 0.5, pan: -0.2 }), track('bass', bass, { gain: 0.55 }), track('drum', shake, { gain: 0.35 }), track('kalimba', tune.notes, { gain: 0.5, pan: 0.2 })],
  });
}

// ───────────────────────────── shared parts ─────────────────────────────
/** Bo's parts, per page (labels are unique to Bo only where the page has no other vehicle; his eyes are addressed by id because the pigeons have eyes too). */
const BO_LABELS = ['Wheel', 'Hubcap', 'Mirror ear', 'Bus body', 'Roof light', 'Roof bulb', 'Windscreen', 'Glass shine', 'Headlamp', 'Bumper'];
const PIP_LABELS = ['Leg', 'Foot', 'Tail', 'Pigeon body', 'Belly', 'Wing', 'Pigeon head', 'Neck patch', 'Upper beak', 'Cheek'];
const eyesOf = (n: number, ks: number[]) => [...ids(n, 'eye', ks), ...ids(n, 'pupil', ks), ...ids(n, 'eye-shine', ks)];
const bo = (n: number, eyeKs: number[], face: string[], extra: string[] = []) => [...lab(...BO_LABELS, ...face), ...eyesOf(n, eyeKs), ...extra];
const pip = (n: number, eyeK: number, more: string[] = []) => [...lab(...PIP_LABELS, ...more), ...eyesOf(n, [eyeK])];
const norm = (e: string) => e.toLowerCase().replace(/[^a-z]/g, '');
const pick = (list: string[], re: RegExp) => list.filter(e => re.test(norm(e)));
const rest = (list: string[], re: RegExp) => list.filter(e => !re.test(norm(e)));
const LOW = /wheel|hubcap|headlamp|bumper/, ROOF = /roof/, MOUTH = /openmouth|tongue|teeth/;

const wave = (n: number, slug: string, ks: number[], delay = 70, amount = 0.7): Action[] => ks.map((k, i) => ({ do: 'animate', target: ID(`${pg(n)}_${slug}_${k}`), anim: { preset: 'bounce', amount, delayMs: i * delay } }));

/** Bo's beep depends on WHERE you tap him: wheels = low, body = middle (plus a note that follows your finger), roof light = high, mouth = double. */
function boBeeps(n: number, list: string[], quiet = false): Behavior[] {
  const g = quiet ? 0.7 : 1;
  const mk = (id: string, hint: string, group: string, sound: string, extraDo: Action[] = []): Behavior => tap(id, G(group), hint, [
    { do: 'sfx', sound, params: { gain: g } }, ...extraDo,
    { do: 'animate', target: G('bo'), anim: { preset: 'squash', amount: 0.6 } }, { do: 'burst', kind: 'notes', count: 4 }, { do: 'haptic', pattern: 'tap' }, { do: 'var', name: 'beeps', op: 'inc' },
  ], { cooldownMs: 180, reduced: [{ do: 'sfx', sound }, { do: 'var', name: 'beeps', op: 'inc' }, ...blip(L('Roof bulb'), 0.3, 260)] });
  const out: Behavior[] = [];
  if (pick(list, LOW).length) out.push(mk(`p${n}-beep-low`, 'Tap Bo\'s wheels for a low beep', 'boLow', 'beep-low'));
  if (rest(list, new RegExp(`${LOW.source}|${ROOF.source}|${MOUTH.source}`)).length) out.push(mk(`p${n}-beep-mid`, 'Tap Bo to make him beep. Tap in different places for different notes.', 'boMid', 'beep', [{ do: 'note', instrument: 'kalimba', note: 'scale:C5,E5,G5,A5,C6', durationMs: 260, gain: 0.35 }]));
  if (pick(list, ROOF).length) out.push(mk(`p${n}-beep-high`, 'Tap Bo\'s roof light for a high beep', 'boRoof', 'beep-high'));
  if (pick(list, MOUTH).length) out.push(mk(`p${n}-beep-mouth`, 'Tap Bo\'s mouth for a double beep', 'boMouth', 'beep-double'));
  return out;
}
const boGroups = (list: string[], eyes: string[]): Record<string, string[]> => ({
  bo: list, boLow: pick(list, LOW), boRoof: pick(list, ROOF), boMouth: pick(list, MOUTH), boMid: rest(list, new RegExp(`${LOW.source}|${ROOF.source}|${MOUTH.source}`)), boEyes: eyes,
});
const nonEmpty = (g: Record<string, string[]>): Record<string, string[]> => Object.fromEntries(Object.entries(g).filter(([, v]) => v.length));

const bobBo = (n: number, amount = 0.2) => idle(`p${n}-bo-idle`, G('bo'), 'bob', { amount, durationMs: 1300, delayMs: 0, seed: 2 }, 'Bo idles');
const blinkBo = (n: number) => idle(`p${n}-bo-blink`, G('boEyes'), 'blink', { durationMs: 4600, delayMs: 0 }, 'Bo blinks');
const pipBob = (n: number) => idle(`p${n}-pip-idle`, G('pip'), 'bob', { amount: 0.12, durationMs: 1900, delayMs: 0, seed: 5 }, 'Pip fidgets');
const pipTap = (n: number, sound = 'squeak', pitch = 4): Behavior => tap(`p${n}-pip-tap`, G('pip'), 'Tap Pip to hear him coo', [
  { do: 'sfx', sound, params: { pitch, gain: 0.6 } }, { do: 'animate', anim: { preset: 'wiggle', amount: 0.7 } }, { do: 'burst', kind: 'hearts', count: 3 },
], { cooldownMs: 400, reduced: [{ do: 'sfx', sound, params: { pitch, gain: 0.6 } }, ...blip(L('Pigeon head'), 0.6, 300)] });
const city = (n: number): Behavior[] => [
  idle(`p${n}-windows`, L('Far lit windows'), 'twinkle', { amount: 0.5 }, 'City windows twinkle'),
  idle(`p${n}-clouds`, L('Cloud'), 'drift', { amount: 2.2 }, 'Clouds drift'),
];
const tempo = (n: number, scale: number): Behavior => onEnter(`p${n}-tempo`, PAGE, [{ do: 'musicTempo', scale, rampMs: 1500 }], 'Set the groove tempo');

// ───────────────────────────── the pages ─────────────────────────────
const pages: LivingPage[] = [];

// 1  COVER ─ Bo's BEEP depends on where you tap; the title bounces; Pip squeaks.
{
  const BO = bo(1, [2, 3], ['Brow', 'Open mouth', 'Tongue', 'Teeth']);
  const PIP = pip(1, 1, ['Lower beak']);
  pages.push(page(1, {
    groups: { ...boGroups(BO, eyesOf(1, [2, 3])), pip: PIP, sun: lab('Square sun', 'Rays'), burst: lab('Sound burst'), title: ids(1, 'title-letter', Array.from({ length: 16 }, (_, i) => i + 1)) },
    vars: { beeps: 0 },
    music: { cue: 'groove', fadeMs: 600 }, ambience: { bed: 'city-murmur', gain: 0.14 },
    narration: narr(text(1), 0.9, 'bright'),
    goals: [goal('three-beeps', 'Beeped Bo three times', ge('beeps', 3))],
    a11y: { summary: 'The cover of Beep! Block Street: Bo the red bus grins at the front, Pip the pigeon sits on the sign, and a tall colourful street rises behind.', instructions: 'Tap Bo in different places for different beeps: wheels low, body middle, roof light high, mouth double. Tap the title to make the letters hop.' },
    behaviors: [
      tempo(1, 1), ...city(1), bobBo(1), blinkBo(1), pipBob(1),
      idle('p1-pip-blink', ID('p01_eye_1'), 'blink', { durationMs: 5200, delayMs: 0 }, 'Pip blinks'),
      idle('p1-rays', L('Rays'), 'spin', { durationMs: 90000, easing: 'linear', delayMs: 0 }, 'The sun turns slowly'),
      idle('p1-lamp', L('Lamp light cone'), 'breathe', { amount: 0.8, durationMs: 4200 }, 'The street lamp glows'),
      ...boBeeps(1, BO),
      tap('p1-burst-tap', G('burst'), 'Tap the BEEP! burst', [
        { do: 'sfx', sound: 'beep-double' }, { do: 'animate', anim: { preset: 'pulse', amount: 1 } }, { do: 'burst', kind: 'confetti', count: 10 }, { do: 'var', name: 'beeps', op: 'inc' },
      ], { cooldownMs: 300, reduced: [{ do: 'sfx', sound: 'beep-double' }, { do: 'var', name: 'beeps', op: 'inc' }, ...blip(L('Sound burst'), 0.6, 300)] }),
      tap('p1-title', G('title'), 'Tap the title to make the letters hop', [
        ...wave(1, 'title-letter', Array.from({ length: 16 }, (_, i) => i + 1), 55, 0.6),
        { do: 'note', instrument: 'marimba', note: 'C5', durationMs: 220 }, { do: 'wait', ms: 110 }, { do: 'note', instrument: 'marimba', note: 'E5', durationMs: 220 }, { do: 'wait', ms: 110 },
        { do: 'note', instrument: 'marimba', note: 'G5', durationMs: 220 }, { do: 'wait', ms: 110 }, { do: 'note', instrument: 'marimba', note: 'C6', durationMs: 400 },
      ], { cooldownMs: 1200, reduced: [{ do: 'note', instrument: 'marimba', note: 'C6', durationMs: 400 }, ...blip(L('Title banner'), 0.6, 350)] }),
      tap('p1-sun', G('sun'), 'Tap the square sun', [
        { do: 'sfx', sound: 'ding', params: { gain: 0.7 } }, { do: 'animate', target: L('Square sun'), anim: { preset: 'jelly', amount: 0.6 } }, { do: 'burst', kind: 'sparkles', count: 8 },
      ], { cooldownMs: 500, reduced: [{ do: 'sfx', sound: 'ding', params: { gain: 0.7 } }, ...blip(L('Square sun'), 0.6, 350)] }),
      pipTap(1),
    ],
  }));
}

// 2  Good morning ─ Bo rolls in, the shops wake up, Pip yawns, the big BEEP! hops.
{
  const BO = bo(2, [1, 2], ['Open mouth', 'Tongue', 'Teeth']);
  const PIP = pip(2, 3, ['Lower beak']);
  const shop = (k: number) => ids(2, 'building', [k]).concat(ids(2, 'block-shade', [k]), ids(2, 'cornice', [k]), ids(2, 'dark-windows', [k]), ids(2, 'lit-windows', [k]), ids(2, 'door', [k]), ids(2, 'awning', [k]), ids(2, 'shop-sign', [k]), ids(2, 'shop-name', [k]));
  const shopTap = (k: number, name: string, note: string): Behavior => tap(`p2-${name}-wake`, G(name), `Tap the ${name} to wake it up with a ding`, [
    { do: 'sfx', sound: 'ding', params: { pitch: k === 1 ? 0 : 5, gain: 0.8 } }, { do: 'note', instrument: 'marimba', note, durationMs: 300, gain: 0.6 },
    { do: 'animate', target: ID(`p02_lit-windows_${k}`), anim: { preset: 'pulse', amount: 0.3 } }, { do: 'animate', target: ID(`p02_awning_${k}`), anim: { preset: 'wiggle', amount: 0.8 } },
    { do: 'animate', target: ID(`p02_shop-sign_${k}`), anim: { preset: 'jelly', amount: 0.5 } }, { do: 'var', name: 'woke', op: 'inc' },
  ], { cooldownMs: 500, reduced: [{ do: 'sfx', sound: 'ding', params: { pitch: k === 1 ? 0 : 5, gain: 0.8 } }, { do: 'var', name: 'woke', op: 'inc' }, ...blip(ID(`p02_lit-windows_${k}`), 0.5, 350)] });
  pages.push(page(2, {
    groups: { ...boGroups(BO, eyesOf(2, [1, 2])), pip: PIP, bakery: shop(1), shop: shop(2), beep: ids(2, 'title-letter', [1, 2, 3, 4, 5]), enter: [...BO, ...PIP] },
    vars: { beeps: 0, woke: 0 },
    music: { cue: 'groove' }, ambience: { bed: 'city-murmur', gain: 0.14 },
    narration: narr(text(2), 0.9, 'bright'),
    goals: [goal('woke-street', 'Woke up both shops', ge('woke', 2))],
    a11y: { summary: 'A wide sunny street. Bo the bus rolls out of his garage with Pip the pigeon waking on his roof. A bakery on the left and a shop on the right wait to wake up.', instructions: 'Tap Bo for a beep, tap each shop to wake it, tap the big BEEP! word.' },
    behaviors: [
      tempo(2, 1), ...city(2), bobBo(2, 0.25), blinkBo(2), pipBob(2),
      idle('p2-rays', L('Rays'), 'spin', { durationMs: 80000, easing: 'linear', delayMs: 0 }, 'The sun turns slowly'),
      idle('p2-speed', L('Speed lines'), 'drift', { amount: 1.2, durationMs: 1400, delayMs: 0, seed: 3 }, 'Speed lines shimmer'),
      idle('p2-lit', L('Lit windows'), 'twinkle', { amount: 0.5 }, 'Shop windows twinkle'),
      onEnter('p2-roll-in', G('enter'), [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.3 } }, { do: 'animate', anim: { preset: 'slide-in', amount: 2.4, durationMs: 1400 } }], 'Bo rolls out of the garage'),
      ...boBeeps(2, BO),
      shopTap(1, 'bakery', 'C5'), shopTap(2, 'shop', 'G5'),
      tap('p2-big-beep', G('beep'), 'Tap the big BEEP! to make it hop and sound', [
        { do: 'sfx', sound: 'beep-double' }, ...wave(2, 'title-letter', [1, 2, 3, 4, 5], 90, 0.9), { do: 'burst', kind: 'confetti', count: 12 },
      ], { cooldownMs: 800, reduced: [{ do: 'sfx', sound: 'beep-double' }, ...blip(ID('p02_title-letter_1'), 0.5, 300)] }),
      tap('p2-pip-yawn', G('pip'), 'Tap Pip to hear him yawn', [
        { do: 'sfx', sound: 'yawn', params: { gain: 0.6 } }, { do: 'animate', anim: { preset: 'grow', amount: 0.15 } }, { do: 'wait', ms: 700 }, { do: 'animate', anim: { preset: 'shrink', amount: 0.375 } },
      ], { cooldownMs: 1500, reduced: [{ do: 'sfx', sound: 'yawn', params: { gain: 0.6 } }, ...blip(L('Pigeon head'), 0.6, 400)] }),
    ],
  }));
}

// 3  Three windows ─ BEEP wakes the baker, the barber and the pigeons. Each window plays its own instrument; Bo plays them all.
{
  const BO = bo(3, [4, 5], ['Brow', 'Teeth'], [...ids(3, 'open-mouth', [3]), ...ids(3, 'tongue', [3])]);
  const baker = [...ids(3, 'shop-front', [1]), ...ids(3, 'block-shade', [1]), ...ids(3, 'cornice', [1]), ...lab('Bakery window', 'Shelf', 'Loaf', 'Apron', 'Chef hat'), ...ids(3, 'arm-outline', [1, 2]), ...ids(3, 'arm', [1, 2]), ...ids(3, 'face', [1]), ...ids(3, 'closed-eye', [1, 2]), ...ids(3, 'open-mouth', [1]), ...ids(3, 'tongue', [1]), ...ids(3, 'cheek', [1, 2]), ...ids(3, 'hair', [1]), ...ids(3, 'awning', [1]), ...ids(3, 'sound-burst', [1]), ...ids(3, 'title-letter', [1, 2, 3, 4, 5])];
  const barber = [...ids(3, 'shop-front', [2]), ...ids(3, 'block-shade', [2]), ...ids(3, 'cornice', [2]), ...ids(3, 'arm-outline', [3, 4]), ...ids(3, 'arm', [3, 4]), ...ids(3, 'face', [2]), ...ids(3, 'closed-eye', [3, 4]), ...ids(3, 'open-mouth', [2]), ...ids(3, 'tongue', [2]), ...ids(3, 'cheek', [3, 4]), ...ids(3, 'hair', [2]), ...ids(3, 'awning', [2]), ...ids(3, 'sound-burst', [2]), ...ids(3, 'title-letter', [6, 7, 8, 9, 10]), ...lab('Barber window', 'Barber pole', 'Pole stripes', 'Barber coat', 'Moustache')];
  const pigeons = [...ids(3, 'shop-front', [3]), ...ids(3, 'block-shade', [3]), ...ids(3, 'cornice', [3]), ...ids(3, 'cheek', [5, 6, 7]), ...ids(3, 'awning', [3]), ...ids(3, 'sound-burst', [3]), ...ids(3, 'title-letter', [11, 12, 13, 14, 15]), ...lab('Pigeon window', 'Window ledge'), ...ids(3, 'leg', [1, 2, 3, 4, 5, 6]), ...ids(3, 'foot', [1, 2, 3, 4, 5, 6]), ...ids(3, 'tail', [1, 2, 3]), ...ids(3, 'pigeon-body', [1, 2, 3]), ...ids(3, 'belly', [1, 2, 3]), ...ids(3, 'wing', [1, 2, 3]), ...ids(3, 'pigeon-head', [1, 2, 3]), ...ids(3, 'neck-patch', [1, 2, 3]), ...ids(3, 'upper-beak', [1, 2, 3]), ...ids(3, 'lower-beak', [1, 2, 3]), ...eyesOf(3, [1, 2, 3]), ...lab('Flap line')];
  const PIP = [...ids(3, 'cheek', [8]), ...ids(3, 'leg', [7, 8]), ...ids(3, 'foot', [7, 8]), ...ids(3, 'tail', [4]), ...ids(3, 'pigeon-body', [4]), ...ids(3, 'belly', [4]), ...ids(3, 'wing', [4]), ...ids(3, 'pigeon-head', [4]), ...ids(3, 'neck-patch', [4]), ...ids(3, 'upper-beak', [4]), ...ids(3, 'lower-beak', [4]), ...eyesOf(3, [6])];
  const wake = (id: string, who: string, grp: string, hint: string, sound: Action, note: { instrument: string; note: string }, letters: number[], moves: Action[], vr: string): Behavior => tap(id, G(grp), hint, [
    sound, { do: 'note', instrument: note.instrument, note: note.note, durationMs: 350, gain: 0.7 }, ...moves, ...wave(3, 'title-letter', letters, 60, 0.6),
    { do: 'animate', target: G(grp), anim: { preset: 'jelly', amount: 0.25 } }, { do: 'burst', at: G(grp), kind: 'notes', count: 5 }, { do: 'var', name: vr, op: 'set', value: true },
  ], { cooldownMs: 700, reduced: [sound, { do: 'note', instrument: note.instrument, note: note.note, durationMs: 350, gain: 0.7 }, { do: 'var', name: vr, op: 'set', value: true }, ...blip(G(grp), 0.7, 400)] });
  pages.push(page(3, {
    groups: { ...boGroups(BO, eyesOf(3, [4, 5])), pip: PIP, baker, barber, pigeons, bakerArms: ids(3, 'arm', [1, 2]), barberPole: lab('Pole stripes', 'Barber pole'), pigeonBodies: [...ids(3, 'pigeon-body', [1, 2, 3]), ...ids(3, 'pigeon-head', [1, 2, 3]), ...ids(3, 'wing', [1, 2, 3])], flaps: lab('Flap line') },
    vars: { baker: false, barber: false, pigeons: false, beeps: 0 },
    music: { cue: 'groove' }, ambience: { bed: 'city-murmur', gain: 0.14 },
    narration: narr(text(3), 0.9, 'bright'),
    goals: [goal('woke-all', 'Woke the baker, the barber and the pigeons', all(eq('baker'), eq('barber'), eq('pigeons')))],
    a11y: { summary: 'Three little windows: the baker with a loaf, the barber by his striped pole, and three pigeons. Bo the bus waits below with Pip.', instructions: 'Tap each window to wake it up with its own sound, or tap Bo to beep and wake them all.' },
    behaviors: [
      tempo(3, 1), idle('p3-clouds-none', L('Rays'), 'spin', { durationMs: 100000, easing: 'linear', delayMs: 0 }, 'The sunburst turns slowly'),
      bobBo(3, 0.2), blinkBo(3), pipBob(3),
      idle('p3-arms', G('bakerArms'), 'wave', { amount: 0.8, durationMs: 1800, delayMs: 0, seed: 1 }, 'The baker waves'),
      idle('p3-pigeons', G('pigeonBodies'), 'bob', { amount: 0.18, durationMs: 1500, delayMs: 0, seed: 7 }, 'The pigeons bob'),
      idle('p3-flaps', G('flaps'), 'twinkle', { amount: 0.9 }, 'Little flaps'),
      ...boBeeps(3, BO).filter(b => b.id !== 'p3-beep-mid'),
      wake('p3-baker', 'baker', 'baker', 'Tap the baker\'s window to wake him', { do: 'sfx', sound: 'ding', params: { pitch: 2 } }, { instrument: 'marimba', note: 'C5' }, [1, 2, 3, 4, 5], [{ do: 'animate', target: G('bakerArms'), anim: { preset: 'wiggle', amount: 1 } }], 'baker'),
      wake('p3-barber', 'barber', 'barber', 'Tap the barber\'s window to wake him', { do: 'sfx', sound: 'tick', params: { gain: 0.9 } }, { instrument: 'kalimba', note: 'E5' }, [6, 7, 8, 9, 10], [{ do: 'animate', target: G('barberPole'), anim: { preset: 'shake', amount: 0.6 } }], 'barber'),
      wake('p3-pigeons-tap', 'pigeons', 'pigeons', 'Tap the pigeons\' window to make them flap', { do: 'sfx', sound: 'wings', params: { gain: 0.8 } }, { instrument: 'flute', note: 'G5' }, [11, 12, 13, 14, 15], [{ do: 'animate', target: G('pigeonBodies'), anim: { preset: 'bounce', amount: 0.8 } }], 'pigeons'),
      tap('p3-bo-wakes-all', G('boMid'), 'Tap Bo\'s body and his BEEP wakes the whole street', [
        { do: 'sfx', sound: 'beep' }, { do: 'animate', target: G('bo'), anim: { preset: 'squash', amount: 0.6 } },
        { do: 'animate', target: G('baker'), anim: { preset: 'jelly', amount: 0.2 } }, { do: 'animate', target: G('barber'), anim: { preset: 'jelly', amount: 0.2, delayMs: 150 } }, { do: 'animate', target: G('pigeons'), anim: { preset: 'jelly', amount: 0.2, delayMs: 300 } },
        { do: 'note', instrument: 'marimba', note: 'C5', durationMs: 300, gain: 0.6 }, { do: 'wait', ms: 150 }, { do: 'note', instrument: 'kalimba', note: 'E5', durationMs: 300, gain: 0.6 }, { do: 'wait', ms: 150 }, { do: 'note', instrument: 'flute', note: 'G5', durationMs: 500, gain: 0.6 },
        { do: 'burst', kind: 'notes', count: 6 }, { do: 'var', name: 'baker', op: 'set', value: true }, { do: 'var', name: 'barber', op: 'set', value: true }, { do: 'var', name: 'pigeons', op: 'set', value: true },
      ], { cooldownMs: 1200, reduced: [{ do: 'sfx', sound: 'beep' }, { do: 'var', name: 'baker', op: 'set', value: true }, { do: 'var', name: 'barber', op: 'set', value: true }, { do: 'var', name: 'pigeons', op: 'set', value: true }, ...blip(G('baker'), 0.7, 300)] }),
      pipTap(3),
    ],
  }));
}

// 4  The silent morning ─ Bo opens his mouth and nothing comes out. Hush music, a lamp to click, a pigeon watching.
{
  const BO = bo(4, [1, 2], ['Worried brow', 'Frown']);
  const PIP = pip(4, 3);
  pages.push(page(4, {
    groups: { bo: BO, boEyes: eyesOf(4, [1, 2]), pip: PIP, lamp: lab('Lamp light cone', 'Lamp post', 'Lamp arm', 'Lamp head'), brows: lab('Worried brow') },
    vars: { tries: 0, lampOn: true },
    music: { cue: 'hush', fadeMs: 1200 }, ambience: { bed: 'room-tone', gain: 0.12 },
    narration: narr(text(4), 0.8, 'soft'),
    goals: [goal('tried-beep', 'Tried to make Bo beep', ge('tries', 2))],
    a11y: { summary: 'A night-blue street under one streetlamp. Small, sad Bo opens his mouth and nothing comes out. Pip watches from the lamp.', instructions: 'Tap Bo to try to make him beep. Tap the lamp to switch its light.' },
    behaviors: [
      tempo(4, 0.85), idle('p4-windows', L('Far lit windows'), 'twinkle', { amount: 0.5 }, 'Far windows twinkle'),
      idle('p4-lamp-glow', L('Lamp light cone'), 'breathe', { amount: 0.5, durationMs: 4800, delayMs: 0 }, 'The lamp hums'),
      idle('p4-bo-sad', G('bo'), 'bob', { amount: 0.1, durationMs: 2200, delayMs: 0, seed: 2 }, 'Bo sighs'),
      blinkBo(4), pipBob(4),
      tap('p4-bo-try', G('bo'), 'Tap Bo and see if he can beep', [
        { do: 'sfx', sound: 'squeak', params: { pitch: -9, gain: 0.35 } }, { do: 'animate', anim: { preset: 'shake', amount: 0.5 } }, { do: 'animate', target: G('brows'), anim: { preset: 'wiggle', amount: 1.2 } }, { do: 'var', name: 'tries', op: 'inc' },
      ], { cooldownMs: 700, reduced: [{ do: 'sfx', sound: 'squeak', params: { pitch: -9, gain: 0.35 } }, { do: 'var', name: 'tries', op: 'inc' }, ...blip(L('Worried brow'), 0.5, 400)] }),
      tap('p4-lamp', G('lamp'), 'Tap the street lamp to switch its light', [
        { do: 'sfx', sound: 'tick', params: { gain: 0.8 } }, { do: 'var', name: 'lampOn', op: 'toggle' },
        { do: 'if', cond: eq('lampOn'), then: [{ do: 'show', target: L('Lamp light cone'), anim: { preset: 'fade-in', durationMs: 500 } }], else: [{ do: 'hide', target: L('Lamp light cone'), anim: { preset: 'fade-out', durationMs: 500 } }] },
      ], { cooldownMs: 600, reduced: [{ do: 'sfx', sound: 'tick', params: { gain: 0.8 } }, { do: 'var', name: 'lampOn', op: 'toggle' }, { do: 'if', cond: eq('lampOn'), then: [{ do: 'show', target: L('Lamp light cone') }], else: [{ do: 'hide', target: L('Lamp light cone') }] }] }),
      pipTap(4, 'squeak', 2),
    ],
  }));
}

// 5  The traffic jam ─ tap each vehicle for its own honk; the chorus builds until everybody has honked.
{
  const cars = [
    { k: 1, ids: [...ids(5, 'wheel', [1, 2]), ...ids(5, 'cabin', [1]), ...ids(5, 'car-body', [1]), ...eyesOf(5, [1, 2]), ...ids(5, 'frown', [1])], sound: 'honk', pitch: -2, name: 'car on the left' },
    { k: 2, ids: [...ids(5, 'wheel', [3, 4]), ...ids(5, 'cabin', [2]), ...ids(5, 'car-body', [2]), ...eyesOf(5, [3, 4]), ...ids(5, 'frown', [2]), ...ids(5, 'brow', [1, 2])], sound: 'honk', pitch: 3, name: 'blue car' },
    { k: 3, ids: [...ids(5, 'wheel', [5, 6]), ...ids(5, 'cabin', [3]), ...ids(5, 'car-body', [3]), ...eyesOf(5, [5, 6]), ...ids(5, 'frown', [3])], sound: 'honk', pitch: 6, name: 'little car' },
    { k: 4, ids: [...ids(5, 'wheel', [7, 8]), ...ids(5, 'cabin', [4]), ...ids(5, 'car-body', [4]), ...eyesOf(5, [7, 8]), ...ids(5, 'frown', [4]), ...ids(5, 'brow', [3, 4])], sound: 'honk', pitch: -5, name: 'car on the right' },
  ];
  const taxi = [...eyesOf(5, [9, 10]), ...ids(5, 'wheel', [9, 10]), ...ids(5, 'hubcap', [1, 2]), ...lab('Taxi cabin', 'Taxi body', 'Taxi windscreen', 'Checker stripe', 'Taxi sign', 'Taxi sign letters', 'Cross brow'), ...ids(5, 'open-mouth', [1]), ...ids(5, 'tongue', [1]), ...ids(5, 'headlamp', [1]), ...ids(5, 'bumper', [1])];
  const gus = [...eyesOf(5, [11, 12]), ...ids(5, 'wheel', [11, 12, 13]), ...ids(5, 'hubcap', [3, 4, 5]), ...ids(5, 'headlamp', [2]), ...lab('Tipper', 'Tipper rib', 'Chassis', 'Cab', 'Cab window', 'Heavy lid', 'Grumble mouth')];
  const BO = [...lab('Mirror ear', 'Bus body', 'Roof light', 'Roof bulb', 'Windscreen', 'Glass shine', 'Teeth'), ...eyesOf(5, [13, 14]), ...ids(5, 'wheel', [14, 15]), ...ids(5, 'hubcap', [6, 7]), ...ids(5, 'brow', [5, 6]), ...ids(5, 'open-mouth', [2]), ...ids(5, 'tongue', [2]), ...ids(5, 'headlamp', [3, 4]), ...ids(5, 'bumper', [2])];
  const PIP = [...lab(...PIP_LABELS), ...eyesOf(5, [15])];
  const vehicles: Record<string, string[]> = { car1: cars[0].ids, car2: cars[1].ids, car3: cars[2].ids, car4: cars[3].ids, taxi, gus };
  const honk = (key: string, hint: string, sound: string, pitch: number, extra: Action[] = []): Behavior => tap(`p5-honk-${key}`, G(key), hint, [
    { do: 'sfx', sound, params: { pitch, gain: 0.9 } }, { do: 'animate', anim: { preset: 'shake', amount: 0.9 } }, { do: 'animate', anim: { preset: 'jelly', amount: 0.25 } }, { do: 'burst', kind: 'notes', count: 3 }, { do: 'haptic', pattern: 'knock' },
    { do: 'var', name: key, op: 'set', value: true }, { do: 'var', name: 'honks', op: 'inc' }, ...extra,
  ], { cooldownMs: 350, reduced: [{ do: 'sfx', sound, params: { pitch, gain: 0.9 } }, { do: 'var', name: key, op: 'set', value: true }, { do: 'var', name: 'honks', op: 'inc' }, ...blip(G(key), 0.65, 300)] });
  const sentence = span(text(5), 'Pip tilted his head.', 'Where did the beep go?');
  const everyone = all(eq('car1'), eq('car2'), eq('car3'), eq('car4'), eq('taxi'), eq('gus'));
  pages.push(page(5, {
    groups: { ...vehicles, bo: BO, boEyes: eyesOf(5, [13, 14]), pip: PIP, brows: [...ids(5, 'brow', [1, 2, 3, 4]), ...lab('Cross brow')] },
    vars: { car1: false, car2: false, car3: false, car4: false, taxi: false, gus: false, honks: 0 },
    music: { cue: 'groove' }, ambience: { bed: 'city-murmur', gain: 0.2 },
    narration: narr(text(5), 0.9, 'bright'),
    goals: [goal('everyone-honked', 'Made the whole traffic jam honk', everyone)],
    a11y: { summary: 'A wide traffic jam: four little cars, Tilly the yellow taxi, Gus the green truck, and Bo in the middle. Pip watches from a banner pole at the top.', instructions: 'Tap each car, the taxi and the truck to make them honk. When all of them have honked, the whole street joins in.' },
    behaviors: [
      tempo(5, 1.05), idle('p5-windows', L('Far lit windows'), 'twinkle', { amount: 0.5 }, 'City windows twinkle'),
      ...['car1', 'car2', 'car3', 'car4'].map((c, i) => idle(`p5-${c}-idle`, G(c), 'bob', { amount: 0.12, durationMs: 1000 + i * 130, delayMs: 0, seed: i + 1 }, 'The car idles')),
      idle('p5-taxi-idle', G('taxi'), 'bob', { amount: 0.14, durationMs: 1300, delayMs: 0, seed: 11 }, 'Tilly idles'),
      idle('p5-gus-idle', G('gus'), 'bob', { amount: 0.1, durationMs: 1700, delayMs: 0, seed: 12 }, 'Gus rumbles'),
      idle('p5-brows', G('brows'), 'wiggle', { amount: 0.3, durationMs: 2600, delayMs: 0, seed: 3 }, 'Cross eyebrows'),
      idle('p5-bo-blink', G('boEyes'), 'blink', { durationMs: 4600, delayMs: 0 }, 'Bo blinks'), pipBob(5),
      honk('car1', 'Tap the little car on the left to make it honk', cars[0].sound, cars[0].pitch),
      honk('car2', 'Tap the blue car to make it honk', cars[1].sound, cars[1].pitch),
      honk('car3', 'Tap the little car to make it honk', cars[2].sound, cars[2].pitch),
      honk('car4', 'Tap the car on the right to make it honk', cars[3].sound, cars[3].pitch),
      honk('taxi', 'Tap Tilly the taxi to make her honk', 'beep-car', 4),
      honk('gus', 'Tap Gus the truck to make him toot', 'toot', -6),
      tap('p5-bo-silent', G('bo'), 'Tap Bo. He has no beep today.', [
        { do: 'sfx', sound: 'squeak', params: { pitch: -9, gain: 0.35 } }, { do: 'animate', anim: { preset: 'shake', amount: 0.4 } },
      ], { cooldownMs: 700, reduced: [{ do: 'sfx', sound: 'squeak', params: { pitch: -9, gain: 0.35 } }, ...blip(L('Roof bulb'), 0.4, 300)] }),
      when('p5-chorus', PAGE, everyone, [
        { do: 'wait', ms: 450 }, { do: 'musicTempo', scale: 1.2, rampMs: 600 },
        { do: 'sfx', sound: 'honk', params: { pitch: 0 } }, { do: 'sfx', sound: 'beep-car', params: { pitch: 4 } }, { do: 'sfx', sound: 'toot', params: { pitch: -7 } }, { do: 'sfx', sound: 'honk', params: { pitch: 7, gain: 0.6 } },
        { do: 'animate', target: G('car1'), anim: { preset: 'bounce', amount: 0.6 } }, { do: 'animate', target: G('car2'), anim: { preset: 'bounce', amount: 0.6, delayMs: 80 } }, { do: 'animate', target: G('car3'), anim: { preset: 'bounce', amount: 0.6, delayMs: 160 } },
        { do: 'animate', target: G('car4'), anim: { preset: 'bounce', amount: 0.6, delayMs: 240 } }, { do: 'animate', target: G('taxi'), anim: { preset: 'bounce', amount: 0.6, delayMs: 120 } }, { do: 'animate', target: G('gus'), anim: { preset: 'bounce', amount: 0.6, delayMs: 200 } },
        { do: 'haptic', pattern: 'success' }, { do: 'wait', ms: 1400 }, { do: 'musicTempo', scale: 1, rampMs: 1200 }, { do: 'animate', target: G('pip'), anim: { preset: 'wiggle', amount: 0.9 } }, { do: 'narrate', from: sentence.from, to: sentence.to },
      ], { once: true, reduced: [{ do: 'sfx', sound: 'honk' }, { do: 'sfx', sound: 'toot', params: { pitch: -7 } }, { do: 'narrate', from: sentence.from, to: sentence.to }] }),
      pipTap(5, 'squeak', 2),
    ],
  }));
}

// 6  Where did the beep go? ─ three panels; drag Pip up into the tailpipe.
{
  const pigeon = (k: number) => [...ids(6, 'leg', [2 * k - 1, 2 * k]), ...ids(6, 'foot', [2 * k - 1, 2 * k]), ...ids(6, 'tail', [k]), ...ids(6, 'pigeon-body', [k]), ...ids(6, 'belly', [k]), ...ids(6, 'wing', [k]), ...ids(6, 'pigeon-head', [k]), ...ids(6, 'neck-patch', [k]), ...ids(6, 'upper-beak', [k]), ...eyesOf(6, [k]), ...ids(6, 'cheek', [k])];
  const pip3 = [...pigeon(3), ...lab('Lower beak')];
  const bakery = [...lab('Oven door', 'Oven glow', 'Loaf', 'Shelf'), ...ids(6, 'panel', [1]), ...ids(6, 'panel-halftone', [1])];
  const barber = [...lab('Barber pole', 'Pole stripes', 'Pole cap'), ...ids(6, 'panel', [2]), ...ids(6, 'panel-halftone', [2])];
  const pipe = lab('Tailpipe', 'Pipe dark', 'Pipe rim', 'Tiny stuck beep');
  pages.push(page(6, {
    groups: { bakery, barber, pipe, pip1: pigeon(1), pip2: pigeon(2), pip3, oven: lab('Oven glow'), stripes: lab('Pole stripes'), sparkles: lab('Sparkle'), tiny: lab('Tiny stuck beep') },
    vars: { bakeryChecked: false, barberChecked: false, inPipe: 0, found: false },
    music: { cue: 'hush', fadeMs: 1000 }, ambience: { bed: 'room-tone', gain: 0.1 },
    narration: narr(text(6), 0.85, 'bright'),
    goals: [goal('found-it', 'Found something tiny in the tailpipe', eq('found'))],
    a11y: { summary: 'Three tall panels: a bakery oven with warm bread, a barber pole, and the dark round of Bo\'s tailpipe with a tiny yellow spark inside. Pip looks in each one.', instructions: 'Tap the oven and the barber pole to look for the beep. Drag Pip up into the tailpipe, or press Enter on him, to look inside.' },
    behaviors: [
      tempo(6, 0.95),
      idle('p6-oven', G('oven'), 'glow', { amount: 0.9, durationMs: 2600, delayMs: 0, seed: 1 }, 'The oven glows'),
      idle('p6-sparkle', G('sparkles'), 'twinkle', { amount: 0.9 }, 'Sparkles twinkle'),
      idle('p6-tiny', G('tiny'), 'glow', { amount: 1.2, durationMs: 1800, delayMs: 0, seed: 2 }, 'Something tiny glints'),
      idle('p6-stripes', G('stripes'), 'shimmer', { amount: 1, delayMs: 0, seed: 2 }, 'The barber pole shimmers'),
      idle('p6-pips', L('Pigeon body'), 'breathe', { amount: 0.5, durationMs: 3600 }, 'The pigeons breathe'),
      tap('p6-bakery', G('bakery'), 'Tap the oven: is the beep in the bakery?', [
        { do: 'sfx', sound: 'ding', params: { gain: 0.8 } }, { do: 'animate', target: G('oven'), anim: { preset: 'pulse', amount: 0.8 } }, { do: 'animate', target: G('pip1'), anim: { preset: 'wiggle', amount: 0.8 } }, { do: 'var', name: 'bakeryChecked', op: 'set', value: true },
      ], { cooldownMs: 700, reduced: [{ do: 'sfx', sound: 'ding', params: { gain: 0.8 } }, { do: 'var', name: 'bakeryChecked', op: 'set', value: true }, ...blip(L('Oven glow'), 0.5, 400)] }),
      tap('p6-barber', G('barber'), 'Tap the barber pole: is the beep at the barber?', [
        { do: 'sfx', sound: 'tick', params: { gain: 0.9 } }, { do: 'wait', ms: 180 }, { do: 'sfx', sound: 'tick', params: { gain: 0.9, pitch: 3 } }, { do: 'animate', target: G('stripes'), anim: { preset: 'shake', amount: 0.7 } }, { do: 'animate', target: G('pip2'), anim: { preset: 'wiggle', amount: 0.8 } }, { do: 'var', name: 'barberChecked', op: 'set', value: true },
      ], { cooldownMs: 700, reduced: [{ do: 'sfx', sound: 'tick', params: { gain: 0.9 } }, { do: 'var', name: 'barberChecked', op: 'set', value: true }, ...blip(L('Pole stripes'), 0.5, 400)] }),
      tap('p6-pipe', G('pipe'), 'Tap the tailpipe: knock, knock', [
        { do: 'sfx', sound: 'knock' }, { do: 'wait', ms: 220 }, { do: 'sfx', sound: 'knock', params: { pitch: 2 } }, { do: 'animate', target: G('tiny'), anim: { preset: 'heartbeat', amount: 1 } }, { do: 'burst', at: L('Tiny stuck beep'), kind: 'sparkles', count: 6 },
      ], { cooldownMs: 800, reduced: [{ do: 'sfx', sound: 'knock' }, ...blip(L('Tiny stuck beep'), 0.4, 400)] }),
      { id: 'p6-pip-in', target: G('pip3'), on: { type: 'drag', axis: 'y', bounds: { minY: -190, maxY: 0 }, progressVar: 'inPipe' }, hint: 'Drag Pip up into the tailpipe to look inside. Or press Enter.',
        do: [{ do: 'sfx', sound: 'squeak', params: { pitch: 2, gain: 0.5 } }, { do: 'haptic', pattern: 'tap' }], reduced: [{ do: 'sfx', sound: 'squeak', params: { pitch: 2, gain: 0.5 } }] },
      when('p6-found', G('tiny'), ge('inPipe', 0.85), [
        { do: 'var', name: 'found', op: 'set', value: true }, { do: 'sfx', sound: 'magic-appear', params: { gain: 0.7 } }, { do: 'animate', anim: { preset: 'heartbeat', amount: 1.4 } }, { do: 'burst', kind: 'sparkles', count: 14 }, { do: 'haptic', pattern: 'success' },
      ], { once: true, reduced: [{ do: 'var', name: 'found', op: 'set', value: true }, { do: 'sfx', sound: 'magic-appear', params: { gain: 0.7 } }] }),
    ],
  }));
}

// 7  POP! ─ drag Pip to pull the stuck beep out; the beep returns with a big sound and confetti.
{
  const BO = bo(7, [1, 2], ['Brow', 'Open mouth', 'Tongue', 'Teeth']);
  const PIP = pip(7, 3, ['Lower beak']);
  const BEEP = ids(7, 'title-letter', [1, 2, 3, 4, 5]);
  const POPW = [...ids(7, 'title-letter', [6, 7, 8, 9]), ...lab('Sound burst')];
  const spark = lab('Sparkle');
  const afterPop: Action[] = [
    { do: 'sfx', sound: 'pop', params: { gain: 1 } }, { do: 'show', target: G('popWord'), anim: { preset: 'pop-in', durationMs: 400 } }, { do: 'wait', ms: 350 },
    { do: 'sfx', sound: 'beep-double', params: { gain: 1 } }, { do: 'musicTempo', scale: 1.15, rampMs: 800 }, { do: 'animate', target: G('beepWord'), anim: { preset: 'pop-in', durationMs: 600 } },
    { do: 'animate', target: G('sparkles'), anim: { preset: 'pop-in', durationMs: 500 } }, { do: 'animate', target: G('bo'), anim: { preset: 'jelly', amount: 0.9 } },
    { do: 'burst', at: { x: 512, y: 380 }, kind: 'confetti', count: 40 }, { do: 'burst', at: L('Bus body'), kind: 'notes', count: 12 }, { do: 'haptic', pattern: 'success' },
  ];
  const reducedPop: Action[] = [
    { do: 'sfx', sound: 'pop' }, { do: 'set', target: G('popWord'), props: { opacity: 1 } }, { do: 'sfx', sound: 'beep-double' }, { do: 'set', target: G('beepWord'), props: { opacity: 1 } }, { do: 'set', target: G('sparkles'), props: { opacity: 1 } },
  ];
  pages.push(page(7, {
    groups: { ...boGroups(BO, eyesOf(7, [1, 2])), pip: PIP, beepWord: BEEP, popWord: POPW, sparkles: spark },
    vars: { pull: 0, tugs: 0, popped: false },
    music: { cue: 'hush' }, ambience: { bed: 'city-murmur', gain: 0.1 },
    narration: narr(text(7), 0.9, 'bright'),
    goals: [goal('pop', 'Pulled the beep out. POP!', eq('popped'))],
    a11y: { summary: 'A red burst page. Tiny Bo and Pip at the bottom right. Pip tugs and pulls and, POP, the beep comes out and Bo says it as loud as he can.', instructions: 'Drag Pip to the left to pull, or press Enter on him. You can also tap Pip three times. If you do nothing the beep comes back by itself.' },
    behaviors: [
      tempo(7, 0.95), blinkBo(7), bobBo(7, 0.15), pipBob(7),
      onEnter('p7-hide', PAGE, [{ do: 'set', target: G('beepWord'), props: { opacity: 0 } }, { do: 'set', target: G('popWord'), props: { opacity: 0 } }, { do: 'set', target: G('sparkles'), props: { opacity: 0 } }], 'Start with the beep stuck'),
      idle('p7-rays', L('Rays'), 'spin', { durationMs: 70000, easing: 'linear', delayMs: 0 }, 'The burst turns slowly'),
      { id: 'p7-pull', target: G('pip'), on: { type: 'drag', axis: 'x', bounds: { minX: -200, maxX: 0 }, progressVar: 'pull' }, hint: 'Drag Pip to the left to pull the beep out. Or press Enter.',
        do: [{ do: 'sfx', sound: 'jelly-squish', params: { gain: 0.7 } }, { do: 'haptic', pattern: 'tug' }, { do: 'animate', target: G('bo'), anim: { preset: 'shake', amount: 0.5, loop: 5, durationMs: 420 } }],
        reduced: [{ do: 'sfx', sound: 'jelly-squish', params: { gain: 0.7 } }] },
      tap('p7-tug', G('pip'), 'Tap Pip to give the beep a tug. Three tugs pull it out.', [
        { do: 'sfx', sound: 'boing', params: { gain: 0.6, pitch: 2 } }, { do: 'animate', anim: { preset: 'jelly', amount: 0.6 } }, { do: 'animate', target: G('bo'), anim: { preset: 'shake', amount: 0.4 } }, { do: 'var', name: 'tugs', op: 'inc' },
      ], { cooldownMs: 400, reduced: [{ do: 'sfx', sound: 'boing', params: { gain: 0.6, pitch: 2 } }, { do: 'var', name: 'tugs', op: 'inc' }] }),
      when('p7-pop-pull', PAGE, ge('pull', 0.92), [{ do: 'var', name: 'popped', op: 'set', value: true }], { once: true }),
      when('p7-pop-tugs', PAGE, ge('tugs', 3), [{ do: 'var', name: 'popped', op: 'set', value: true }], { once: true }),
      { id: 'p7-pop-timer', target: PAGE, on: { type: 'timer', afterMs: 22000 }, do: [{ do: 'var', name: 'popped', op: 'set', value: true }] },
      when('p7-pop', PAGE, eq('popped'), afterPop, { once: true, reduced: reducedPop }),
      ...boBeeps(7, BO).map(b => ({ ...b, when: eq('popped') as Behavior['when'] })),
    ],
  }));
}

// 8  Thank you ─ dusk; Bo beeps good morning, good afternoon, goodnight; the sun sets; the lamps click.
{
  const BO = [...lab(...BO_LABELS, 'Calm mouth'), ...ids(8, 'closed-eye', [1, 2])];
  const PIP = [...lab(...PIP_LABELS), ...ids(8, 'closed-eye', [3])];
  const thanks = ids(8, 'title-letter', [1, 2, 3, 4, 5, 6]);
  const lamp = (k: number) => [...ids(8, 'lamp-light-cone', [k]), ...ids(8, 'lamp-post', [k]), ...ids(8, 'lamp-arm', [k]), ...ids(8, 'lamp-head', [k])];
  const greet = (n: number, sound: string, pitch: number, gain: number): Action[] => [{ do: 'var', name: 'greet', op: 'set', value: n }, { do: 'sfx', sound, params: { pitch, gain } }];
  pages.push(page(8, {
    groups: { bo: BO, pip: PIP, sun: lab('Setting square sun', 'Rays'), thanks, lampL: lamp(1), lampR: lamp(2) },
    vars: { greet: 0, lampL: true, lampR: true, greeted: 0 },
    music: { cue: 'dusk', fadeMs: 1500 }, ambience: { bed: 'city-murmur', gain: 0.08 },
    narration: narr(text(8), 0.85, 'soft'),
    goals: [goal('three-greetings', 'Heard Bo say good morning, good afternoon and goodnight', ge('greeted', 3))],
    a11y: { summary: 'A pink dusk street. Bo sleeps with a sleepy smile and Pip tucks in on his roof. Two lamps glow and the square sun is setting.', instructions: 'Tap Bo to hear his three beeps: good morning, good afternoon, goodnight. Tap the lamps. Tap the sun.' },
    behaviors: [
      tempo(8, 1), idle('p8-windows', L('Far lit windows'), 'twinkle', { amount: 0.5 }, 'Windows twinkle'),
      idle('p8-bo-sleep', G('bo'), 'breathe', { amount: 0.5, durationMs: 4200, delayMs: 0, seed: 3, origin: { x: 0.5, y: 1 } }, 'Bo sleeps'),
      idle('p8-pip-sleep', G('pip'), 'breathe', { amount: 0.5, durationMs: 3800, delayMs: 0, seed: 4 }, 'Pip sleeps'),
      idle('p8-lamps', L('Lamp light cone'), 'breathe', { amount: 0.6, durationMs: 4800 }, 'Lamps glow'),
      idle('p8-thanks', G('thanks'), 'bob', { amount: 0.2, durationMs: 1800 }, 'The thank-you letters bob'),
      idle('p8-rays', L('Rays'), 'spin', { durationMs: 100000, easing: 'linear', delayMs: 0 }, 'The sun turns slowly'),
      tap('p8-bo-greets', G('bo'), 'Tap Bo to hear a beep: good morning, then good afternoon, then goodnight', [
        { do: 'if', cond: { var: 'greet', op: '==', value: 0 }, then: greet(1, 'beep', 0, 0.9), else: [
          { do: 'if', cond: { var: 'greet', op: '==', value: 1 }, then: greet(2, 'beep-high', 0, 0.9), else: [{ do: 'var', name: 'greet', op: 'set', value: 0 }, { do: 'sfx', sound: 'beep', params: { pitch: -5, gain: 0.35 } }] },
        ] },
        { do: 'animate', anim: { preset: 'squash', amount: 0.4 } }, { do: 'burst', kind: 'hearts', count: 3 }, { do: 'var', name: 'greeted', op: 'inc' },
      ], { cooldownMs: 600, reduced: [{ do: 'sfx', sound: 'beep', params: { gain: 0.6 } }, { do: 'var', name: 'greeted', op: 'inc' }, ...blip(L('Roof bulb'), 0.4, 350)] }),
      tap('p8-thanks-tap', G('thanks'), 'Tap the thank-you letters for a thank-you beep-beep', [
        { do: 'sfx', sound: 'beep', params: { gain: 0.7 } }, { do: 'wait', ms: 140 }, { do: 'sfx', sound: 'beep', params: { gain: 0.7, pitch: 3 } }, ...wave(8, 'title-letter', [1, 2, 3, 4, 5, 6], 60, 0.6),
      ], { cooldownMs: 800, reduced: [{ do: 'sfx', sound: 'beep', params: { gain: 0.7 } }, ...blip(ID('p08_title-letter_1'), 0.5, 300)] }),
      ...(['lampL', 'lampR'] as const).map(side => tap(`p8-${side}`, G(side), `Tap the ${side === 'lampL' ? 'left' : 'right'} street lamp to switch its light`, [
        { do: 'sfx', sound: 'tick', params: { gain: 0.8 } }, { do: 'var', name: side, op: 'toggle' },
        { do: 'if', cond: eq(side), then: [{ do: 'show', target: ID(`p08_lamp-light-cone_${side === 'lampL' ? 1 : 2}`), anim: { preset: 'fade-in', durationMs: 500 } }], else: [{ do: 'hide', target: ID(`p08_lamp-light-cone_${side === 'lampL' ? 1 : 2}`), anim: { preset: 'fade-out', durationMs: 500 } }] },
      ], { cooldownMs: 500, reduced: [{ do: 'sfx', sound: 'tick', params: { gain: 0.8 } }, { do: 'var', name: side, op: 'toggle' }, { do: 'if', cond: eq(side), then: [{ do: 'show', target: ID(`p08_lamp-light-cone_${side === 'lampL' ? 1 : 2}`) }], else: [{ do: 'hide', target: ID(`p08_lamp-light-cone_${side === 'lampL' ? 1 : 2}`) }] }] })),
      tap('p8-sun', G('sun'), 'Tap the sun to help it set', [
        { do: 'sfx', sound: 'whoosh', params: { gain: 0.3 } }, { do: 'animate', target: L('Setting square sun'), anim: { preset: 'fall', amount: 0.5 } }, { do: 'set', target: PAGE, props: { fill: '#2a1a4a', opacity: 0.25 } },
      ], { once: true, reduced: [{ do: 'sfx', sound: 'whoosh', params: { gain: 0.3 } }, { do: 'set', target: PAGE, props: { fill: '#2a1a4a', opacity: 0.25 } }] }),
      tap('p8-pip', G('pip'), 'Tap Pip to hear him coo goodnight', [{ do: 'sfx', sound: 'squeak', params: { pitch: -2, gain: 0.4 } }, { do: 'animate', anim: { preset: 'pulse', amount: 0.5 } }], { cooldownMs: 600, reduced: [{ do: 'sfx', sound: 'squeak', params: { pitch: -2, gain: 0.4 } }, ...blip(L('Pigeon head'), 0.7, 300)] }),
    ],
  }));
}

// 9  FIND PIP ─ the game. Three Pips hide in the windows (and a lamp count). Counter + celebration.
{
  const WINDOWS = Array.from({ length: 16 }, (_, i) => i + 1);
  const pipAt = (k: number, w: number) => [`p09_window_${w}`, ...ids(9, 'leg', [2 * k - 1, 2 * k]), ...ids(9, 'foot', [2 * k - 1, 2 * k]), ...ids(9, 'tail', [k]), ...ids(9, 'pigeon-body', [k]), ...ids(9, 'belly', [k]), ...ids(9, 'wing', [k]), ...ids(9, 'pigeon-head', [k]), ...ids(9, 'neck-patch', [k]), ...ids(9, 'upper-beak', [k]), ...ids(9, 'cheek', [k]), ...ids(9, 'eye', [k === 1 ? 1 : k + 2]), ...ids(9, 'pupil', [k === 1 ? 1 : k + 2]), ...ids(9, 'eye-shine', [k === 1 ? 1 : k + 2])];
  const PIPS = [{ k: 1, w: 1, note: 'C5' }, { k: 2, w: 10, note: 'E5' }, { k: 3, w: 15, note: 'G5' }];
  const LAMPS = [{ j: 1, w: 4, pitch: 0 }, { j: 2, w: 7, pitch: 2 }, { j: 3, w: 11, pitch: 4 }, { j: 4, w: 16, pitch: 7 }];
  const lampGroup = (j: number, w: number) => [`p09_window_${w}`, ...ids(9, 'lamp', [j]), ...ids(9, 'lamp-glow', [j])];
  const cats = [{ w: 3, j: 1 }, { w: 8, j: 2 }, { w: 13, j: 3 }];
  const pots = [{ w: 2, j: 1 }, { w: 6, j: 2 }, { w: 12, j: 3 }];
  const BO9 = [...lab('Wheel', 'Hubcap', 'Mirror ear', 'Bus body', 'Roof light', 'Roof bulb', 'Windscreen', 'Glass shine', 'Open mouth', 'Tongue', 'Teeth', 'Headlamp', 'Bumper'), ...eyesOf(9, [2, 3])];
  const groups: Record<string, string[]> = { bo9: [`p09_window_5`, ...BO9], bo9eyes: eyesOf(9, [2, 3]) };
  const winName = (w: number) => `row ${Math.ceil(w / 4)}, column ${((w - 1) % 4) + 1}`;
  PIPS.forEach(p => { groups[`pip${p.k}`] = pipAt(p.k, p.w); });
  LAMPS.forEach(l => { groups[`lamp${l.j}`] = lampGroup(l.j, l.w); });
  cats.forEach(c => { groups[`cat${c.j}`] = [`p09_window_${c.w}`, ...ids(9, 'cat', [c.j]), ...ids(9, 'ear', [2 * c.j - 1, 2 * c.j]), ...ids(9, 'cat-eye', [2 * c.j - 1, 2 * c.j])]; });
  pots.forEach(p => { groups[`pot${p.j}`] = [`p09_window_${p.w}`, ...ids(9, 'pot', [p.j]), ...ids(9, 'leaf', [2 * p.j - 1, 2 * p.j])]; });
  const special = new Set([1, 10, 15, 4, 7, 11, 16, 3, 8, 13, 2, 6, 12, 5]);
  const plain = WINDOWS.filter(w => !special.has(w));
  const pipsText = (n: number): Action => ({ do: 'set', target: ID('p09_answer-label_1'), props: { text: `Pips: ${n}` } });
  const lampsText = (n: number): Action => ({ do: 'set', target: ID('p09_answer-label_2'), props: { text: `Lamps: ${n}` } });
  const counter = (vr: string, mk: (n: number) => Action, max: number): Action[] => Array.from({ length: max }, (_, i) => ({ do: 'if' as const, cond: eq(vr, i + 1), then: [mk(i + 1)] }));
  const notThere = (w: number, hint: string, sound: Action, extra: Action[] = [], reducedExtra: Action[] = []): Behavior => tap(`p9-window-${w}`, ID(`p09_window_${w}`), hint, [sound, { do: 'animate', anim: { preset: 'wiggle', amount: 0.6 } }, ...extra, { do: 'var', name: 'wrong', op: 'inc' }],
    { cooldownMs: 350, reduced: [sound, { do: 'var', name: 'wrong', op: 'inc' }, ...reducedExtra, ...blip(ID(`p09_window_${w}`), 0.6, 300)] });
  const found: Behavior[] = PIPS.map(p => tap(`p9-find-pip-${p.k}`, G(`pip${p.k}`), `Tap the window in ${winName(p.w)}: is Pip hiding here?`, [
    { do: 'var', name: 'pips', op: 'inc' }, { do: 'var', name: `pip${p.k}`, op: 'set', value: true },
    { do: 'sfx', sound: 'pop', params: { gain: 0.8 } }, { do: 'note', instrument: 'kalimba', note: p.note, durationMs: 500, gain: 0.8 }, { do: 'animate', anim: { preset: 'bounce', amount: 0.9 } },
    { do: 'burst', kind: 'confetti', count: 14 }, { do: 'haptic', pattern: 'tap' }, ...counter('pips', pipsText, 3),
  ], { once: true, reduced: [{ do: 'var', name: 'pips', op: 'inc' }, { do: 'var', name: `pip${p.k}`, op: 'set', value: true }, { do: 'sfx', sound: 'pop', params: { gain: 0.8 } }, { do: 'note', instrument: 'kalimba', note: p.note, durationMs: 500, gain: 0.8 }, ...counter('pips', pipsText, 3), ...blip(G(`pip${p.k}`), 0.55, 350)] }));
  const lampsB: Behavior[] = LAMPS.map(l => tap(`p9-lamp-${l.j}`, G(`lamp${l.j}`), `Tap the yellow lamp in ${winName(l.w)} to count it`, [
    { do: 'var', name: 'lamps', op: 'inc' }, { do: 'sfx', sound: 'ding', params: { pitch: l.pitch, gain: 0.8 } }, { do: 'animate', target: ID(`p09_lamp-glow_${l.j}`), anim: { preset: 'pulse', amount: 1.4 } },
    { do: 'burst', kind: 'sparkles', count: 6 }, ...counter('lamps', lampsText, 4),
  ], { once: true, reduced: [{ do: 'var', name: 'lamps', op: 'inc' }, { do: 'sfx', sound: 'ding', params: { pitch: l.pitch, gain: 0.8 } }, ...counter('lamps', lampsText, 4), ...blip(ID(`p09_lamp-glow_${l.j}`), 0.4, 350)] }));
  pages.push(page(9, {
    groups: nonEmpty(groups),
    vars: { pips: 0, lamps: 0, wrong: 0, pip1: false, pip2: false, pip3: false },
    music: { cue: 'groove' }, ambience: { bed: 'city-murmur', gain: 0.1 },
    narration: narr(text(9), 0.85, 'bright'),
    goals: [goal('found-pips', 'Found all three Pips', ge('pips', 3)), goal('counted-lamps', 'Counted all four yellow lamps', ge('lamps', 4))],
    a11y: { summary: 'A tall building with sixteen windows. Pip the pigeon hides in three of them. Bo, cats, flower pots and four yellow lamps hide in others. Counting boxes sit on the right.', instructions: 'Tap a window to look inside. Find the three Pips, then count the yellow lamps. Tap a window and press Enter to look with the keyboard.' },
    behaviors: [
      tempo(9, 1),
      idle('p9-lamps-glow', L('Lamp glow'), 'twinkle', { amount: 0.5 }, 'The lamps glow'),
      idle('p9-pips-bob', L('Pigeon head'), 'bob', { amount: 0.1, durationMs: 1800 }, 'The Pips fidget'),
      idle('p9-leaves', L('Leaf'), 'sway', { amount: 0.8, durationMs: 3000 }, 'Leaves sway'),
      idle('p9-cats', L('Cat eye'), 'blink', { durationMs: 5400 }, 'The cats blink'),
      idle('p9-bo-blink', G('bo9eyes'), 'blink', { durationMs: 4600, delayMs: 0 }, 'Bo blinks'),
      ...found, ...lampsB,
      ...cats.map(c => notThere(c.w, `Tap the window in ${winName(c.w)}: a cat lives here`, { do: 'sfx', sound: 'squeak', params: { pitch: -3, gain: 0.5 } }, [{ do: 'animate', target: ID(`p09_cat_${c.j}`), anim: { preset: 'bounce', amount: 0.5 } }])),
      ...pots.map(p => notThere(p.w, `Tap the window in ${winName(p.w)}: a flower pot`, { do: 'sfx', sound: 'bubble', params: { gain: 0.8 } }, [{ do: 'animate', target: G(`pot${p.j}`), anim: { preset: 'jelly', amount: 0.3 } }])),
      tap('p9-window-5', G('bo9'), `Tap the window in ${winName(5)}: Bo is hiding here`, [{ do: 'sfx', sound: 'beep', params: { gain: 0.6 } }, { do: 'animate', anim: { preset: 'squash', amount: 0.8 } }, { do: 'burst', kind: 'notes', count: 3 }, { do: 'var', name: 'wrong', op: 'inc' }],
        { cooldownMs: 400, reduced: [{ do: 'sfx', sound: 'beep', params: { gain: 0.6 } }, { do: 'var', name: 'wrong', op: 'inc' }, ...blip(ID('p09_window_5'), 0.6, 300)] }),
      ...plain.map(w => notThere(w, `Tap the window in ${winName(w)} to look inside`, { do: 'sfx', sound: 'boop', params: { pitch: -3, gain: 0.7 } })),
      when('p9-hint', PAGE, ge('wrong', 5), [
        { do: 'if', cond: eq('pip1', false), then: [{ do: 'animate', target: G('pip1'), anim: { preset: 'pulse', amount: 0.6 } }] },
        { do: 'if', cond: eq('pip2', false), then: [{ do: 'animate', target: G('pip2'), anim: { preset: 'pulse', amount: 0.6, delayMs: 250 } }] },
        { do: 'if', cond: eq('pip3', false), then: [{ do: 'animate', target: G('pip3'), anim: { preset: 'pulse', amount: 0.6, delayMs: 500 } }] },
      ], { once: true }),
      when('p9-win-pips', PAGE, ge('pips', 3), [
        { do: 'wait', ms: 500 }, { do: 'sfx', sound: 'success-jingle' }, { do: 'burst', at: { x: 512, y: 380 }, kind: 'confetti', count: 40 }, { do: 'burst', at: { x: 512, y: 380 }, kind: 'stars', count: 14 },
        { do: 'animate', target: L('Pigeon body'), anim: { preset: 'bounce', amount: 0.8 } }, { do: 'haptic', pattern: 'success' }, { do: 'musicTempo', scale: 1.1, rampMs: 800 },
        { do: 'set', target: ID('p09_answer-label_1'), props: { text: 'Pips: 3!' } },
      ], { once: true, reduced: [{ do: 'sfx', sound: 'success-jingle' }, { do: 'set', target: ID('p09_answer-label_1'), props: { text: 'Pips: 3!' } }] }),
      when('p9-win-lamps', PAGE, ge('lamps', 4), [{ do: 'wait', ms: 300 }, { do: 'sfx', sound: 'twinkle' }, { do: 'burst', at: { x: 745, y: 630 }, kind: 'stars', count: 10 }, { do: 'set', target: ID('p09_answer-label_2'), props: { text: 'Lamps: 4!' } }], { once: true, reduced: [{ do: 'sfx', sound: 'twinkle' }, { do: 'set', target: ID('p09_answer-label_2'), props: { text: 'Lamps: 4!' } }] }),
    ],
  }));
}

// 10  BACK COVER ─ the same street at noon.
{
  const BO = bo(10, [1, 2], ['Open mouth', 'Tongue', 'Teeth']);
  const PIP = pip(10, 3);
  pages.push(page(10, {
    groups: { ...boGroups(BO, eyesOf(10, [1, 2])), pip: PIP, title: ids(10, 'title-letter', Array.from({ length: 15 }, (_, i) => i + 1)) },
    vars: { beeps: 0 },
    music: { cue: 'groove' }, ambience: { bed: 'city-murmur', gain: 0.12 },
    narration: narr(text(10), 0.9, 'bright'),
    a11y: { summary: 'The back cover: the street at noon with Bo and Pip, the story blurb on a sign, and a barcode.', instructions: 'Tap Bo for a beep, tap Pip, or tap the title letters.' },
    behaviors: [
      tempo(10, 1), ...city(10), bobBo(10, 0.2), blinkBo(10), pipBob(10),
      idle('p10-pip-blink', ID('p10_eye_3'), 'blink', { durationMs: 5200, delayMs: 0 }, 'Pip blinks'),
      ...boBeeps(10, BO),
      tap('p10-title', G('title'), 'Tap the title letters to make them hop', [
        ...wave(10, 'title-letter', Array.from({ length: 15 }, (_, i) => i + 1), 50, 0.6), { do: 'note', instrument: 'marimba', note: 'G5', durationMs: 220 }, { do: 'wait', ms: 120 }, { do: 'note', instrument: 'marimba', note: 'C6', durationMs: 400 },
      ], { cooldownMs: 1000, reduced: [{ do: 'note', instrument: 'marimba', note: 'C6', durationMs: 400 }, ...blip(ID('p10_title-letter_1'), 0.5, 300)] }),
      pipTap(10),
    ],
  }));
}

const scores: Record<string, Score> = { groove: groove(), hush: hush(), dusk: dusk() };

export const beepBlockStreetLiving: LivingBook = {
  version: 1, bookId: 'beep-block-street', pages, scores,
  defaults: { musicGain: 0.7, sfxGain: 0.9, narrate: 'on-demand', ambient: true },
  authorNotes: 'Beep Block Street shows the lively end of the format: Bo\'s beep changes with WHERE you tap (wheels low, body middle with a note that follows your finger, roof light high, mouth double), a traffic jam whose honks build into a chorus, '
    + 'a drag with a progress variable (pull Pip to POP, with a timer fallback so the page always completes), and a real game with counters, hints after wrong guesses and a celebration (Find Pip). '
    + 'Remix it: change a vehicle\'s `sfx` id and pitch, move the three Pips by editing the three groups on page 9, or swap the groove for your own score.',
};

export default beepBlockStreetLiving;

