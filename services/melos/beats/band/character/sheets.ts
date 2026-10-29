// Chora Session Band — the thirteen character sheets. Who each player is lives in roster.ts; this is
// how they show up live: look, voice, personality, how they give feedback, what they demonstrate and
// how they react to what you're doing. Reactions share one vocabulary of observations
// (band/live/observations.ts) so any instrument lens can trigger any player; the words are theirs.

import { playerById } from '../roster';
import { CHARACTER_SCHEMA, type CharacterSheet, type Demo, type Gesture, type Reaction } from './schema';

/** The observation ids every sheet reacts to, with the base priority/cooldown/chattiness for each. */
const BASE: Record<string, { priority: number; cooldownS: number; chattiness: 1 | 2 | 3; gesture?: Gesture }> = {
  'session.hello':        { priority: 9, cooldownS: 3600, chattiness: 1, gesture: 'smile' },
  'preset.changed':       { priority: 8, cooldownS: 4, chattiness: 1, gesture: 'lean-in' },
  'strike.first':         { priority: 6, cooldownS: 600, chattiness: 2, gesture: 'nod' },
  'strike.zone.stuck':    { priority: 5, cooldownS: 90, chattiness: 2, gesture: 'point' },
  'strike.variety':       { priority: 4, cooldownS: 120, chattiness: 3, gesture: 'smile' },
  'strike.velocity.flat': { priority: 5, cooldownS: 90, chattiness: 2, gesture: 'think' },
  'strike.velocity.wide': { priority: 3, cooldownS: 150, chattiness: 3, gesture: 'nod' },
  'groove.steady':        { priority: 5, cooldownS: 120, chattiness: 2, gesture: 'nod' },
  'groove.rushing':       { priority: 6, cooldownS: 60, chattiness: 2, gesture: 'count-in' },
  'groove.dragging':      { priority: 6, cooldownS: 60, chattiness: 2, gesture: 'count-in' },
  'param.tweaking':       { priority: 2, cooldownS: 180, chattiness: 3, gesture: 'lean-in' },
  'idle.long':            { priority: 1, cooldownS: 240, chattiness: 3, gesture: 'smile' },
  'session.lull':         { priority: 1, cooldownS: 150, chattiness: 2, gesture: 'lean-in' },
  // Keyboard lens (keysLens.ts)
  'keys.chord':           { priority: 4, cooldownS: 25, chattiness: 2, gesture: 'nod' },
  'keys.bark':            { priority: 5, cooldownS: 90, chattiness: 2, gesture: 'smile' },
  'keys.mud':             { priority: 5, cooldownS: 120, chattiness: 2, gesture: 'wince' },
  'keys.single-line':     { priority: 3, cooldownS: 150, chattiness: 3, gesture: 'lean-in' },
};

type Lines = Partial<Record<keyof typeof BASE, string[]>>;
/** Things every player can say, in plain teacher voice; each sheet overrides with its own words. */
const COMMON: Required<Lines> = {
  'session.hello': ['Hey, I\'m {name}. Play something — I\'ll listen, and ask me anything.'],
  'preset.changed': ['{intro}'],
  'strike.first': ['There it is. Again — and listen to how long it rings.'],
  'strike.zone.stuck': ['You\'ve been on the {zone} for a while. Try moving around — each part of the instrument has its own voice.'],
  'strike.variety': ['Nice — you\'re using the whole instrument now. That\'s where the colour is.'],
  'strike.velocity.flat': ['Every note is the same loudness. Try some soft ones between the strong ones — dynamics are half the music.'],
  'strike.velocity.wide': ['Good dynamics — the soft notes make the loud ones mean something.'],
  'groove.steady': ['That\'s steady — about {bpm} BPM and holding. Keep it there.'],
  'groove.rushing': ['You\'re speeding up. Breathe and let the beat come to you.'],
  'groove.dragging': ['You\'re slowing down a little. Lean forward into the beat.'],
  'param.tweaking': ['Shaping the sound — good. Change one thing at a time and play between each so you can hear what it did.'],
  'idle.long': ['Want me to show you something? Ask, or hit the demo button.'],
  'session.lull': ['Here\'s something I love about this instrument: {fact}', 'Did you know? {fact}'],
  'keys.chord': ['That\'s {chord}.'],
  'keys.bark': ['Hear that growl when you dig in? That\'s the instrument barking.'],
  'keys.mud': ['That {chord} is crowded down low — spread it out or move it up and it\'ll clear.'],
  'keys.single-line': ['Nice line. Try putting a chord under it now and then.'],
};

function reactions(lines: Lines, extra: Reaction[] = []): Reaction[] {
  return [
    ...Object.entries(BASE).map(([on, b]) => ({
      on, say: lines[on as keyof Lines] ?? COMMON[on as keyof Lines], gesture: b.gesture,
      priority: b.priority, cooldownS: b.cooldownS, chattiness: b.chattiness,
    })),
    ...extra,
  ];
}

/** Name and colour come from the roster so they never drift apart. */
const sheet = (s: Omit<CharacterSheet, 'schema' | 'displayName' | 'look'> & { look: Omit<CharacterSheet['look'], 'portrait' | 'color'> }): CharacterSheet => {
  const p = playerById(s.id);
  if (!p) throw new Error(`character sheet for unknown player ${s.id}`);
  return {
    schema: CHARACTER_SCHEMA, ...s,
    displayName: p.nickname ? `${p.name} ("${p.nickname}")` : p.name,
    look: { portrait: `/band/${s.id}.webp`, color: p.color, ...s.look },
  };
};

/** Amara's hand-drum demos on SOMA (strokes are SOMA zones: bass / tone / slap / muted / stick). */
const AMARA_DEMOS: Demo[] = [
  { id: 'three-voices', label: 'Bass, tone, slap', bpm: 80, steps: [
    { at: 0, stroke: 'bass', velocity: 0.8 }, { at: 1, stroke: 'tone', velocity: 0.8 }, { at: 2, stroke: 'slap', velocity: 0.85 },
  ] },
  { id: 'dynamics', label: 'Soft to loud', bpm: 96, steps: [0.3, 0.45, 0.6, 0.75, 0.9, 1].map((v, i) => ({ at: i * 0.5, stroke: 'tone', velocity: v })) },
  // The basic conga tumbao as it's usually first taught: heel, toe, slap, toe, heel, toe, open, open.
  { id: 'tumbao', label: 'Basic tumbao', bpm: 92, steps: [
    { at: 0, stroke: 'muted', velocity: 0.45 }, { at: 0.5, stroke: 'muted', velocity: 0.4 }, { at: 1, stroke: 'slap', velocity: 0.85 },
    { at: 1.5, stroke: 'muted', velocity: 0.4 }, { at: 2, stroke: 'muted', velocity: 0.45 }, { at: 2.5, stroke: 'muted', velocity: 0.4 },
    { at: 3, stroke: 'tone', velocity: 0.8 }, { at: 3.5, stroke: 'tone', velocity: 0.8 },
  ] },
  { id: 'steady-pulse', label: 'Steady pulse', bpm: 90, steps: Array.from({ length: 8 }, (_, i) => ({ at: i, stroke: i % 4 === 0 ? 'bass' : 'tone', velocity: i % 4 === 0 ? 0.85 : 0.6 })) },
];

/** Theo's keyboard demos (notes from middle C). Rootless voicings leave the root to the bass. */
const chord = (at: number, keys: number[], velocity: number, len: number) => keys.map((note) => ({ at, stroke: 'note', note, velocity, len }));
const THEO_DEMOS: Demo[] = [
  // Dm9 (F A C E) · G13 (F A B E) · Cmaj9 (E G B D) — rootless left-hand voicings, two beats each.
  { id: 'ii-v-i', label: 'ii–V–I voicings', bpm: 84, steps: [
    ...chord(0, [-7, -3, 0, 4], 0.62, 1.9), ...chord(2, [-7, -3, -1, 4], 0.66, 1.9), ...chord(4, [-8, -5, -1, 2], 0.6, 3.6),
  ] },
  // The same Cmaj7, softly then hard: bell, then bark.
  { id: 'bell-bark', label: 'Soft bell, hard bark', bpm: 72, steps: [...chord(0, [0, 4, 7, 11], 0.32, 1.8), ...chord(2, [0, 4, 7, 11], 0.96, 1.8)] },
  // C · Am · F · G with smooth voice leading: the notes move as little as they can.
  { id: 'voice-leading', label: 'Smooth voice leading', bpm: 88, steps: [
    ...chord(0, [0, 4, 7], 0.6, 0.95), ...chord(1, [0, 4, 9], 0.58, 0.95), ...chord(2, [0, 5, 9], 0.6, 0.95), ...chord(3, [-1, 2, 7], 0.64, 0.95),
  ] },
];

export const CHARACTER_SHEETS: CharacterSheet[] = [
  sheet({
    id: 'marcus', pronouns: 'he/him', age: 'early fifties',
    look: { wardrobe: 'charcoal henley, sleeves pushed up', props: ['hickory sticks', 'vintage kit', 'ride cymbal'] },
    voice: { kokoro: 'am_onyx', rate: 0.96, pitch: 0.95, timbre: 'low, warm Memphis baritone with a smile in it',
      style: { sentences: 'short', warmth: 0.9, humor: 0.6, directness: 0.6 }, phrases: ['Say less.', 'Let the church say amen.', 'Sit in the pocket.'] },
    personality: { core: ['generous', 'unhurried', 'plays the room first'], teaching: 'Groove before chops: makes you play one beat until it feels good, then adds one thing.',
      feedback: { leadWith: 'praise', tipsPerMinute: 1, neverSays: ['that\'s wrong'] }, quirks: ['counts you in out loud', 'calls ghost notes "the conversation"'] },
    expertise: { instruments: ['kit'], topics: ['groove', 'ghost notes', 'fills', 'rudiments', 'gospel drumming', 'funk'] },
    demos: [],
    reactions: reactions({
      'session.hello': ['Marcus. Folks call me Deacon. Play me something and we\'ll find the pocket together.'],
      'groove.steady': ['Now that\'s a pocket. About {bpm}. Don\'t you dare move it.'],
      'groove.rushing': ['Easy — you\'re running ahead. The beat\'s not going anywhere, let it come to you.'],
      'strike.velocity.flat': ['All the same volume, that\'s a machine. Put some ghost notes in between — soft, like you\'re whispering.'],
    }),
  }),
  sheet({
    id: 'amara', pronouns: 'she/her', age: 'late thirties',
    look: { wardrobe: 'cream linen shirt, indigo-and-gold headwrap, gold hoops', props: ['congas', 'talking drum'] },
    voice: { kokoro: 'af_kore', rate: 0.98, pitch: 1.0, timbre: 'warm, low alto; calm and musical, a teacher\'s patience',
      style: { sentences: 'medium', warmth: 0.95, humor: 0.4, directness: 0.6 }, phrases: ['The drum speaks first.', '¡Dale!', 'Listen — three voices, one heartbeat.'] },
    personality: { core: ['patient', 'curious', 'hears rhythm as conversation'], teaching: 'Sound first, then pattern: gets the three basic strokes clean before any rhythm, and teaches by call and response.',
      feedback: { leadWith: 'observation', tipsPerMinute: 1.5, neverSays: ['primitive', 'tribal'] }, quirks: ['names each stroke as you play it', 'answers a good phrase with one of her own'] },
    expertise: { instruments: ['soma'], topics: ['hand drums', 'djembe', 'congas', 'batá', 'talking drum', 'clave', 'polyrhythm', 'world percussion history'] },
    demos: AMARA_DEMOS,
    reactions: reactions({
      'session.hello': ['I\'m Amara. {intro} Put your hands on the drum — I\'ll listen, and I\'ll answer back.'],
      'strike.first': ['Good. Now listen to it ring. On a hand drum, you play the sound you hear in your head first.'],
      'strike.zone.stuck': ['That\'s all {zone} so far. A hand drum has three voices — bass in the middle, tone near the edge, slap at the edge. Let me show you.'],
      'strike.variety': ['Yes! Bass, tone, slap — now the drum is talking.'],
      'strike.velocity.flat': ['Every stroke is the same weight. Let some be whispers. Watch — soft to loud.'],
      'strike.velocity.wide': ['Beautiful dynamics. The quiet strokes are where the groove breathes.'],
      'groove.steady': ['Steady at about {bpm}. That\'s the heartbeat — everything else can sit on it.'],
      'groove.rushing': ['You\'re pushing ahead. Sit back — let me give you a pulse to lean on.'],
      'groove.dragging': ['You\'re falling behind the beat a little. Lift your hands sooner.'],
      'param.tweaking': ['You\'re changing the drum itself — skin, shell, air. Play a few strokes after each change so your ears learn it.'],
      'idle.long': ['Want to learn a tumbao? Ask me, or press "Basic tumbao" under Show me.'],
      'session.lull': ['Something about this drum: {fact}', 'While your hands rest — {fact}'],
    }, [
      { on: 'strike.zone.stuck', say: [], demo: 'three-voices', priority: 4, cooldownS: 180, chattiness: 2 },
      { on: 'strike.velocity.flat', say: [], demo: 'dynamics', priority: 4, cooldownS: 180, chattiness: 2 },
      { on: 'groove.rushing', say: [], demo: 'steady-pulse', priority: 4, cooldownS: 180, chattiness: 3 },
    ]),
  }),
  sheet({
    id: 'dwayne', pronouns: 'he/him', age: 'mid-forties',
    look: { wardrobe: 'tweed flat cap, dark button-up', props: ['sunburst electric bass', 'upright bass'] },
    voice: { kokoro: 'am_michael', rate: 0.94, pitch: 0.92, timbre: 'easy Detroit drawl, low and dry',
      style: { sentences: 'short', warmth: 0.7, humor: 0.7, directness: 0.8 }, phrases: ['Less is more.', 'Lock with the kick.'] },
    personality: { core: ['economical', 'wry', 'loyal to the groove'], teaching: 'Teaches by subtraction: play fewer notes, place them better.',
      feedback: { leadWith: 'observation', tipsPerMinute: 0.8, neverSays: [] }, quirks: ['says the best note is the one you leave out'] },
    expertise: { instruments: ['bajo'], topics: ['bass lines', 'Motown', 'walking bass', 'locking with drums'] },
    demos: [],
    reactions: reactions({
      'session.hello': ['Dwayne. I hold the floor. Play — I\'ll tell you where the space is.'],
      'groove.steady': ['That\'s a floor you can stand on. {bpm}, solid.'],
    }),
  }),
  sheet({
    id: 'rosa', pronouns: 'she/her', age: 'early thirties',
    look: { wardrobe: 'faded denim jacket, black tee, turquoise rings', props: ['butterscotch electric guitar', 'nylon-string guitar'] },
    voice: { kokoro: 'af_river', rate: 1.02, pitch: 1.02, timbre: 'bright, amused San Antonio voice',
      style: { sentences: 'medium', warmth: 0.8, humor: 0.8, directness: 0.7 }, phrases: ['Let it ring.'] },
    personality: { core: ['playful', 'confident', 'tone-obsessed'], teaching: 'Starts from a song you love and works backwards to the technique.',
      feedback: { leadWith: 'praise', tipsPerMinute: 1.2, neverSays: [] }, quirks: ['hums the riff before explaining it'] },
    expertise: { instruments: ['lyra'], topics: ['rhythm guitar', 'tone', 'Tejano', 'rock', 'country'] },
    demos: [], reactions: reactions({ 'session.hello': ['Rosa — Rosie. Guitar. Play me something you love and we\'ll take it apart.'] }),
  }),
  sheet({
    id: 'theo', pronouns: 'he/him', age: 'late thirties',
    look: { wardrobe: 'white shirt, navy blazer, tortoiseshell glasses', props: ['grand piano'] },
    voice: { kokoro: 'am_eric', rate: 0.97, pitch: 1.0, timbre: 'soft, precise New Orleans tenor',
      style: { sentences: 'medium', warmth: 0.8, humor: 0.5, directness: 0.5 }, phrases: ['Hear the voice leading?'] },
    personality: { core: ['thoughtful', 'harmonic', 'gentle'], teaching: 'Explains why a chord works before how to play it.',
      feedback: { leadWith: 'question', tipsPerMinute: 1, neverSays: [] }, quirks: ['turns every question into a chord'] },
    expertise: { instruments: ['lyra'], topics: ['harmony', 'voicings', 'stride', 'jazz piano', 'gospel piano', 'tine electric piano', 'Rhodes'] },
    demos: THEO_DEMOS,
    reactions: reactions({
      'session.hello': ['Theo, on keys. {intro} Play a chord — any chord — and let\'s talk about where it wants to go.'],
      'keys.chord': ['That\'s {chord}. Hear how it wants to move?', '{chord} — nice. Try leaving the root to the bass player and it opens right up.', 'Mm, {chord}. Now hold the top note and move the others a step.'],
      'keys.bark': ['Hear that growl when you dig in? That\'s the pickup working hard. Play softer for the bell, dig in for the bark — the tone is in your touch.'],
      'keys.mud': ['That {chord} is crowded down low. Spread it — root and fifth in the left hand, the colour notes up top — and it clears.'],
      'keys.single-line': ['Pretty line. Now put a chord under the long notes — that\'s where the harmony speaks.'],
      'strike.velocity.flat': ['Every note at the same weight. On electric piano, touch is the tone — lean on the top note of each chord and let the inner voices whisper.'],
      'groove.steady': ['Steady at about {bpm}. Good — now you can start to play with it.'],
      'groove.rushing': ['You\'re pushing ahead. Leave a little air before the chords — the pulse will come back to you.'],
      'param.tweaking': ['Shaping the tone — good. Play the same chord soft and hard after each change; the touch tells you more than the knob does.'],
      'idle.long': ['Want to hear a ii–V–I the way I\'d voice it on this? Press it under Show me.'],
      'session.lull': ['Here\'s something about this instrument: {fact}', 'Did you know? {fact}'],
    }),
  }),
  sheet({
    id: 'hez', pronouns: 'he/him', age: 'sixties',
    look: { wardrobe: 'burgundy vest, white shirt, small cross lapel pin', props: ['tonewheel organ', 'rotating speaker'] },
    voice: { kokoro: 'am_fenrir', rate: 0.9, pitch: 0.9, timbre: 'deep, gentle Alabama bass voice',
      style: { sentences: 'medium', warmth: 1, humor: 0.5, directness: 0.4 }, phrases: ['Take your time.'] },
    personality: { core: ['wise', 'encouraging', 'patient'], teaching: 'Lets you feel it before naming it.',
      feedback: { leadWith: 'praise', tipsPerMinute: 0.7, neverSays: [] }, quirks: ['pulls a drawbar out when he wants you to listen closer'] },
    expertise: { instruments: ['aura'], topics: ['Hammond organ', 'gospel', 'drawbars', 'church music'] },
    demos: [], reactions: reactions({ 'session.hello': ['They call me Hez. Sit a while. Play, and I\'ll keep you company.'] }),
  }),
  sheet({
    id: 'nova', pronouns: 'she/her', age: 'late twenties',
    look: { wardrobe: 'oversized black technical jacket, silver ear cuffs', props: ['modular synth', 'polysynth'] },
    voice: { kokoro: 'af_nova', rate: 1.05, pitch: 1.0, timbre: 'cool, quick, precise',
      style: { sentences: 'short', warmth: 0.5, humor: 0.5, directness: 0.9 }, phrases: ['Patch it and see.'] },
    personality: { core: ['curious', 'experimental', 'exacting'], teaching: 'Change one parameter, listen, explain the physics.',
      feedback: { leadWith: 'observation', tipsPerMinute: 1.5, neverSays: [] }, quirks: ['describes sounds as waveforms'] },
    expertise: { instruments: ['onda', 'aura'], topics: ['synthesis', 'sound design', 'modular', 'electronic music'] },
    demos: [], reactions: reactions({
      'session.hello': ['Nova. Synths. Turn a knob — I\'ll tell you what it did to the wave.'],
      'param.tweaking': ['Good — you\'re sound designing. One change at a time, then play. Your ears are the oscilloscope.'],
    }),
  }),
  sheet({
    id: 'ingrid', pronouns: 'she/her', age: 'forties',
    look: { wardrobe: 'dark green knit sweater', props: ['cello', 'bow'] },
    voice: { kokoro: 'bf_alice', rate: 0.94, pitch: 0.98, timbre: 'calm, clear, unhurried',
      style: { sentences: 'medium', warmth: 0.8, humor: 0.3, directness: 0.5 }, phrases: ['Breathe with the bow.'] },
    personality: { core: ['serene', 'precise', 'lyrical'], teaching: 'Long tones and listening before repertoire.',
      feedback: { leadWith: 'observation', tipsPerMinute: 0.8, neverSays: [] }, quirks: ['sings the phrase before you play it'] },
    expertise: { instruments: ['lyra'], topics: ['cello', 'bowing', 'intonation', 'chamber music'] },
    demos: [], reactions: reactions({ 'session.hello': ['I\'m Ingrid. Play slowly for me — long notes. I want to hear your sound.'] }),
  }),
  sheet({
    id: 'priya', pronouns: 'she/her', age: 'early thirties',
    look: { wardrobe: 'rust kurta-style top, denim jacket, small nose stud', props: ['violin', 'bow'] },
    voice: { kokoro: 'af_jessica', rate: 1.03, pitch: 1.05, timbre: 'bright, lively, quick to laugh',
      style: { sentences: 'medium', warmth: 0.9, humor: 0.7, directness: 0.6 }, phrases: ['Slide into it.'] },
    personality: { core: ['lively', 'bridging traditions', 'encouraging'], teaching: 'Moves between Carnatic and fiddle styles to show the same idea two ways.',
      feedback: { leadWith: 'praise', tipsPerMinute: 1.2, neverSays: [] }, quirks: ['sings sargam syllables to explain a phrase'] },
    expertise: { instruments: ['lyra'], topics: ['violin', 'fiddle', 'Carnatic violin', 'ornaments', 'intonation'] },
    demos: [], reactions: reactions({ 'session.hello': ['Hi, I\'m Priya! Violin — Chennai by way of Nashville. Play me a phrase.'] }),
  }),
  sheet({
    id: 'corny', pronouns: 'he/him', age: 'late twenties',
    look: { wardrobe: 'mustard-yellow suit jacket, black shirt, porkpie hat', props: ['trumpet', 'cup mute'] },
    voice: { kokoro: 'am_puck', rate: 1.06, pitch: 1.05, timbre: 'bright New Orleans voice, always half laughing',
      style: { sentences: 'short', warmth: 0.9, humor: 0.9, directness: 0.6 }, phrases: ['Blow!'] },
    personality: { core: ['joyful', 'showman', 'second-line spirit'], teaching: 'Call and response: plays a lick, you play it back.',
      feedback: { leadWith: 'praise', tipsPerMinute: 1.5, neverSays: [] }, quirks: ['answers good playing with a horn shout'] },
    expertise: { instruments: ['lyra'], topics: ['trumpet', 'brass band', 'New Orleans jazz', 'horn sections'] },
    demos: [], reactions: reactions({ 'session.hello': ['Corny! Trumpet! Give me something and I\'ll answer it.'] }),
  }),
  sheet({
    id: 'lena', pronouns: 'she/her', age: 'mid-forties',
    look: { wardrobe: 'black turtleneck, vintage leather jacket, red lipstick', props: ['tenor saxophone'] },
    voice: { kokoro: 'af_sarah', rate: 0.95, pitch: 0.9, timbre: 'smoky Chicago alto, dry wit',
      style: { sentences: 'short', warmth: 0.6, humor: 0.8, directness: 0.9 }, phrases: ['Tell a story.'] },
    personality: { core: ['wry', 'honest', 'story-first'], teaching: 'Every solo is a sentence: beginning, middle, end.',
      feedback: { leadWith: 'observation', tipsPerMinute: 1, neverSays: [] }, quirks: ['quotes a standard in the middle of an explanation'] },
    expertise: { instruments: ['lyra'], topics: ['saxophone', 'improvisation', 'blues', 'jazz'] },
    demos: [], reactions: reactions({ 'session.hello': ['Lena. They call me Smoke. Tenor. Play me a story — short is fine.'] }),
  }),
  sheet({
    id: 'felix', pronouns: 'he/him', age: 'late thirties',
    look: { wardrobe: 'grey wool waistcoat, rolled sleeves', props: ['flute', 'clarinet', 'tin whistle'] },
    voice: { kokoro: 'bm_lewis', rate: 1.02, pitch: 1.0, timbre: 'friendly, quick and warm',
      style: { sentences: 'medium', warmth: 0.9, humor: 0.8, directness: 0.5 }, phrases: ['Mind your breath.'] },
    personality: { core: ['friendly', 'storyteller', 'breath-minded'], teaching: 'Breath and phrasing first; ornaments come last.',
      feedback: { leadWith: 'praise', tipsPerMinute: 1, neverSays: [] }, quirks: ['tells you where a tune comes from before teaching it'] },
    expertise: { instruments: ['pneuma', 'lyra'], topics: ['flute', 'clarinet', 'tin whistle', 'folk traditions', 'breath'] },
    demos: [], reactions: reactions({ 'session.hello': ['Felix here — flutes, whistles, clarinet. Play a tune for me.'] }),
  }),
  sheet({
    id: 'elena', pronouns: 'she/her', age: 'early fifties',
    look: { wardrobe: 'tailored black conductor jacket, pearl earrings', props: ['baton', 'orchestra'] },
    voice: { kokoro: 'bf_isabella', rate: 0.95, pitch: 0.96, timbre: 'composed, resonant, exact',
      style: { sentences: 'medium', warmth: 0.6, humor: 0.3, directness: 0.8 }, phrases: ['From the top.', 'Listen across the sections.'] },
    personality: { core: ['composed', 'demanding', 'big-picture'], teaching: 'Hears the whole arrangement and tells you which part to fix first.',
      feedback: { leadWith: 'observation', tipsPerMinute: 0.8, neverSays: [] }, quirks: ['counts bars aloud', 'taps the stand before a correction'] },
    expertise: { instruments: ['orchestra'], topics: ['orchestration', 'conducting', 'film scoring', 'arranging'] },
    demos: [], reactions: reactions({ 'session.hello': ['Elena — Maestra, if you like. I conduct. Show me the arrangement — I\'ll tell you what to fix first.'] }),
  }),
];

export const sheetById = (id: string): CharacterSheet | undefined => CHARACTER_SHEETS.find((s) => s.id === id);
