// Chora Session Band — Creative Reference & Story/Music Intelligence Research.
// Resolves inspiration from books, films, songs, styles, or moods into concrete musical decisions:
// tempo, meter, key/mode, chord changes, Session Band genre, swing/energy, arrangement direction,
// narrative liner note, and real playable Chora presets across TONOS, LYRA, SOMA, VELA suite, BAJO,
// AURA, and ONDA. Works deterministically offline via Music Intelligence + Chora Direct StylePacks,
// and optionally enriches via on-device LLM (`deviceLane`) or consented cloud (`cloudConsent()`).

import type { InstrumentType } from '../grooveDoc';
import { listPresets } from '../presetHub';
import { parseKey, prefersFlats } from '../songKey';
import { chooseStyle, realizeProgression } from '../../direct/styleKnowledge';
import { MASTER_COMPOSER_LINEAGES } from '../../council/musicKnowledge';
import { genreInText } from './styles';
import { auth } from '../../../backendService';
import { isWindowsApp, nativeLlmChat } from '../../../windowsBridgeService';
import { cloudConsent, deviceLane, type MindLane } from './bandMind';
import type { StudiedReference } from './audioEar';
import type { StudioContextSnapshot } from './studioContext';

export type ReferenceCategory = 'book' | 'film' | 'song' | 'style' | 'vibe';

export interface PresetRecommendation {
  instrument: InstrumentType;
  presetId: string;
  presetName: string;
  reason: string;
}

export interface ResearchBrief {
  query: string;
  title: string;
  category: ReferenceCategory;
  bpm: number;
  meter: string;
  keyTonic: number;
  keyScale: string;
  keyLabel: string;
  chords: string[];
  chart: string;
  genreId: string;
  swing: number;
  energy: number;
  vibeTags: string[];
  arrangementCue: string;
  narrative: string;
  recommendedPresets: PresetRecommendation[];
  lane: MindLane;
  note?: string;
}

interface CreativeArchetype {
  id: string;
  title: string;
  category: ReferenceCategory;
  match: RegExp;
  bpm: number;
  meter: string;
  tonic: number;
  scale: string;
  keyLabel: string;
  progression: string;
  genreId: string;
  swing: number;
  energy: number;
  vibeTags: string[];
  arrangementCue: string;
  narrative: string;
  presetHints: { instrument: InstrumentType; terms: string[]; reason: string }[];
}

const ARCHETYPES: CreativeArchetype[] = [
  {
    id: 'sci-fi-noir',
    title: 'Neon Cyberpunk / Blade Runner Nocturne',
    category: 'film',
    match: /\b(blade\s*runner|neuromancer|cyberpunk|vangelis|ghost in the shell|matrix|noir sci|dystopi|rainy neon|do androids)\b/i,
    bpm: 78,
    meter: '4/4',
    tonic: 9,
    scale: 'minor',
    keyLabel: 'A minor',
    progression: 'i | bVI | bVII | i',
    genreId: 'cinematic',
    swing: 0.04,
    energy: 0.48,
    vibeTags: ['cs-80 brass', 'rain-soaked', 'anamorphic', 'slow sustain'],
    arrangementCue: 'Hold wide analog brass swells over a slow minor-sixth bass pulse; leave cavernous tails between melodic calls.',
    narrative: 'Synthesizer brass sighs over dark minor-sixth pedal gravity — rain against glass in an electronic megacity.',
    presetHints: [
      { instrument: 'aura', terms: ['bladerunner', 'cs80', 'cs-80'], reason: 'CS-80 brass sweep for wide neon horizon leads' },
      { instrument: 'bajo', terms: ['dune', 'sub', 'menace'], reason: 'Deep analog sub-bass undertow' },
      { instrument: 'lyra', terms: ['tine', 'dyno', 'stage'], reason: 'Crystalline electric piano reflections' },
      { instrument: 'pneuma', terms: ['ney', 'shakuhachi'], reason: 'Breathy woodwind solitude over synth pads' },
    ],
  },
  {
    id: 'desert-myth',
    title: 'Mythic Desert Epic (Dune / Lawrence / Silk Road)',
    category: 'book',
    match: /\b(dune|arrakis|frank herbert|silk road|desert|sand|caravan|epic sci-fi|zimmer|goransson|odyssey|mad max)\b/i,
    bpm: 92,
    meter: '4/4',
    tonic: 2,
    scale: 'phrygian-dominant',
    keyLabel: 'D Phrygian Dominant',
    progression: 'i | bII | i | bVII',
    genreId: 'cinematic',
    swing: 0.02,
    energy: 0.72,
    vibeTags: ['phrygian', 'frame drum', 'oud', 'monolithic sub'],
    arrangementCue: 'Anchor beat 1 with heavy frame-drum thuds and a low bourdon drone while plucked oud/saz lines carve flat-second tension.',
    narrative: 'Heat-haze flat-second intervals, ancient hand-frame drums, and towering brass/cello drones built for vast horizons.',
    presetHints: [
      { instrument: 'bajo', terms: ['dune', 'braam', 'cello'], reason: 'Tectonic low-end drone and desert brass foundation' },
      { instrument: 'tonos', terms: ['oud', 'tanbur', 'tar'], reason: 'Authentic Maqam/Dastgah plucked chordophone lead' },
      { instrument: 'pneuma', terms: ['ney', 'duduk'], reason: 'Desert reed lament suspended above the pulse' },
      { instrument: 'soma', terms: ['daff', 'frame', 'darbuka'], reason: 'Earth-shaken skin drum groove' },
    ],
  },
  {
    id: 'gothic-novel',
    title: 'Gothic Manor & Velvet Chiaroscuro (Dracula / Poe / Mary Shelley)',
    category: 'book',
    match: /\b(dracula|frankenstein|edgar allan|poe|gothic|bronte|wuthering|vampire|candlelit|haunted|cathedral|victorian|nosferatu|tim burton|elfman)\b/i,
    bpm: 108,
    meter: '3/4',
    tonic: 2,
    scale: 'harmonic-minor',
    keyLabel: 'D Harmonic Minor',
    progression: 'i | iv | i/V | V7',
    genreId: 'classical',
    swing: 0.0,
    energy: 0.62,
    vibeTags: ['waltz', 'harpsichord', 'pipe organ', 'bowed menace'],
    arrangementCue: 'Drive a taut 3/4 cello ostinato under icy celesta/harpsichord arpeggios and aching minor-sixth violin swells.',
    narrative: 'Candlelit minor-mode counterpoint with sharp harmonic-minor leading tones, baroque woodwork, and stone-vault choir.',
    presetHints: [
      { instrument: 'cantus', terms: ['vault', 'plainsong', 'byzantine'], reason: 'Monastic vault choir sustain' },
      { instrument: 'ison', terms: ['bourdon', 'pipe', 'cathedral'], reason: '32-foot cathedral organ pedal anchor' },
      { instrument: 'lyra', terms: ['violin', 'cello', 'piano'], reason: 'Tragic solo string cantilena or parlor piano' },
      { instrument: 'aura', terms: ['celesta', 'harpsichord'], reason: 'Delicate nocturnal bell & harpsichord filigree' },
    ],
  },
  {
    id: 'regency-literary',
    title: 'Regency Chamber & Quiet Rainy Drawing Room (Austen / Tolstoy)',
    category: 'book',
    match: /\b(austen|pride and prejudice|regency|chamber|bronte|tolstoy|little women|pastoral|marianelli|string quartet|piano sonata|piano concerto)\b/i,
    bpm: 112,
    meter: '4/4',
    tonic: 7,
    scale: 'major',
    keyLabel: 'G major',
    progression: 'I | V | vi | IV',
    genreId: 'classical',
    swing: 0.0,
    energy: 0.45,
    vibeTags: ['fortepiano', 'broken chords', 'cantabile', 'chamber strings'],
    arrangementCue: 'Flowing piano broken-chord eighth notes supporting lyrical woodwind and sweet legato violin conversations.',
    narrative: 'Transparent acoustic warmth — wooden piano hammers, singing gut strings, and unhurried harmonic suspensions.',
    presetHints: [
      { instrument: 'lyra', terms: ['piano', 'concert grand', 'violin'], reason: 'Expressive hammer-and-string acoustic lead' },
      { instrument: 'pneuma', terms: ['flute', 'ney'], reason: 'Pastoral breath-toned woodwind counter-melody' },
      { instrument: 'bajo', terms: ['contrabass', 'upright'], reason: 'Warm woody pizzicato/bowed bass continuo' },
      { instrument: 'tonos', terms: ['harp', 'lute', 'mandolin'], reason: 'Plucked gut/wire chamber intimacy' },
    ],
  },
  {
    id: 'jazz-noir',
    title: 'Midnight Jazz Noir & Rainy Detective Streets (Chandler / Miles)',
    category: 'film',
    match: /\b(noir|detective|chandler|hammett|chinatown|taxi driver|cowboy bebop|miles davis|elevator to the gallows|rainy street|midnight sax)\b/i,
    bpm: 74,
    meter: '4/4',
    tonic: 5,
    scale: 'dorian',
    keyLabel: 'F Dorian',
    progression: 'i7 | IV7 | bVIImaj7 | V7alt',
    genreId: 'jazz',
    swing: 0.56,
    energy: 0.4,
    vibeTags: ['muted trumpet', 'brush snare', 'walking bass', 'smoke'],
    arrangementCue: 'Let the upright bass walk softly behind brushed ride cymbals while Rhodes chords and muted horn/sax trade slow phrases.',
    narrative: 'Hard-boiled neon reflections off wet asphalt — smoky Dorian ninths, swinging brush drums, and intimate horn breath.',
    presetHints: [
      { instrument: 'lyra', terms: ['sax', 'trumpet', 'tine', 'stage'], reason: 'Muted brass/tenor sax confession over Stage tine' },
      { instrument: 'bajo', terms: ['upright', 'jazz', 'contrabass'], reason: 'Acoustic gut walking upright bass' },
      { instrument: 'soma', terms: ['brush', 'jazz', 'snare'], reason: 'Whip-soft jazz snare & ride texture' },
      { instrument: 'aura', terms: ['rhodes', 'ep', 'warm'], reason: 'Velvety nocturnal harmonic cushion' },
    ],
  },
  {
    id: 'magical-realism',
    title: 'Wind-Swept Magical Realism & Sky Tale (Miyazaki / Marquez / Ghibli)',
    category: 'film',
    match: /\b(miyazaki|ghibli|spirited away|howl|totoro|marquez|magical realism|celeste|wonder|hisaishi|waltz of|wind|fantasy)\b/i,
    bpm: 104,
    meter: '4/4',
    tonic: 5,
    scale: 'lydian',
    keyLabel: 'F Lydian',
    progression: 'I | II | iii | IV',
    genreId: 'pop',
    swing: 0.08,
    energy: 0.58,
    vibeTags: ['lydian', 'quartal piano', 'floating strings', 'nostalgic'],
    arrangementCue: 'Float bright fourth-rich piano voicings over sweeping string sustains and delicate mallet chimes; lift into major-seventh cadences.',
    narrative: 'Wistful #4 Lydian light — soaring string arches, hand-touched piano quartals, and breeze-carried flute/harp sparkles.',
    presetHints: [
      { instrument: 'lyra', terms: ['piano', 'flute', 'violin'], reason: 'Luminous piano lead and singing solo flute' },
      { instrument: 'aura', terms: ['celesta', 'mellotron-flute', 'solina'], reason: 'Storybook celesta sparkle & tape-warm flutes' },
      { instrument: 'tonos', terms: ['koto', 'harp', 'guzheng'], reason: 'Glistening Asian plucked harp cascades' },
      { instrument: 'vela', terms: ['vitreous', 'halo', 'bell'], reason: 'Shimmering harmonic aura' },
    ],
  },
  {
    id: 'tokyo-lofi',
    title: 'Late-Night Subway & Analog Study Notebook (Haruki Murakami / Lo-Fi)',
    category: 'book',
    match: /\b(murakami|kafka|norwegian wood|wind-up bird|lofi|lo-fi|chillhop|rainy study|cassette|analog cafe|nujabes|samurai champloo)\b/i,
    bpm: 84,
    meter: '4/4',
    tonic: 3,
    scale: 'major-pent',
    keyLabel: 'Eb major',
    progression: 'Imaj7 | vi7 | ii7 | V9',
    genreId: 'lofi',
    swing: 0.34,
    energy: 0.38,
    vibeTags: ['dusty vinyl', 'rhodes', 'laid-back pocket', 'jazz seventh'],
    arrangementCue: 'Pull the snare behind the beat, warm up electric piano 9ths with gentle flutter, and anchor with sub-round pocket bass.',
    narrative: 'Analog tape hush after midnight — lazy boom-bap dust, warm tine chords, and unhurried jazz-guitar licks.',
    presetHints: [
      { instrument: 'lyra', terms: ['tine', 'reed', 'stage', 'guitar'], reason: 'Worn tine Rhodes & warm jazz archtop' },
      { instrument: 'bajo', terms: ['warm', 'sub', 'finger', 'lofi'], reason: 'Round pillowy fingered pocket bass' },
      { instrument: 'soma', terms: ['lofi', 'cajon', 'shaker'], reason: 'Tactile thudding kick & brushed pocket percussion' },
      { instrument: 'aura', terms: ['tape', 'warm', 'pad'], reason: 'Nostalgic analog flutter bed' },
    ],
  },
  {
    id: 'western-folk',
    title: 'Dusty Horizon & Western Myth (Cormac McCarthy / Morricone)',
    category: 'book',
    match: /\b(mccarthy|blood meridian|western|morricone|frontier|cowboy|desert guitar|banjo|blues|folk|american gothic|steel string)\b/i,
    bpm: 86,
    meter: '4/4',
    tonic: 4,
    scale: 'minor',
    keyLabel: 'E minor',
    progression: 'i | bVI | bIII | VII',
    genreId: 'rock',
    swing: 0.08,
    energy: 0.54,
    vibeTags: ['twang baritone', 'whistle reed', 'spaghetti western', 'open fifth'],
    arrangementCue: 'Let resonant steel/nylon guitar tremolos hang in spring space over tom rolls and lonely low bells.',
    narrative: 'Sun-bleached frontier silence — echoing plucked steel, lonely whistling reeds, and solemn slow-motion drum cadence.',
    presetHints: [
      { instrument: 'lyra', terms: ['guitar', 'pluck', 'trumpet'], reason: 'Twanging western guitar & lonely desert brass' },
      { instrument: 'tonos', terms: ['guitar', 'dobro', 'banjo', 'charango'], reason: 'Earthy steel/acoustic plucked body' },
      { instrument: 'soma', terms: ['tom', 'frame', 'timpani'], reason: 'Wide canyon tom cadence' },
      { instrument: 'bajo', terms: ['fretless', 'upright', 'pick'], reason: 'Dusty low-string bass twang' },
    ],
  },
  {
    id: 'west-african-griot',
    title: 'West African Griot Polyrhythm & Palm-Wine Groove',
    category: 'style',
    match: /\b(griot|kora|west africa|mali|afrobeat|talking drum|djembe|highlife|palm.?wine|toure|fela)\b/i,
    bpm: 114,
    meter: '4/4',
    tonic: 0,
    scale: 'mixolydian',
    keyLabel: 'C Mixolydian',
    progression: 'I | IV | I | bVII',
    genreId: 'afrobeat',
    swing: 0.22,
    energy: 0.72,
    vibeTags: ['kora waterfall', '12/8 pocket', 'djembe slap', 'mixolydian'],
    arrangementCue: 'Interlock rippling kora/harp cross-rhythms against warm talking-drum pitch inflections and supple bass syncopation.',
    narrative: 'Cascade of twenty-one harp strings over earthy djembe slaps and joyous Mixolydian bass conversation.',
    presetHints: [
      { instrument: 'tonos', terms: ['kora', 'ngoni', 'oud'], reason: '21-string West African bridge-harp ripple' },
      { instrument: 'soma', terms: ['djembe', 'talking', 'bata', 'conga'], reason: 'Expressive hand-drum slap & tone conversation' },
      { instrument: 'bajo', terms: ['finger', 'jazz', 'dub'], reason: 'Supple melodic bass counterpoint' },
      { instrument: 'lyra', terms: ['sax', 'guitar'], reason: 'Clean highlife horn & picked guitar accents' },
    ],
  },
  {
    id: 'japanese-zen',
    title: 'Moss Temple & Kyoto Dawn (Shakuhachi / Koto / Basho)',
    category: 'book',
    match: /\b(basho|haiku|kyoto|zen|japanese|shogun|koto|shakuhachi|hirajoshi|shamisen|kurusawa|kurosawa|temple|bamboo)\b/i,
    bpm: 68,
    meter: '4/4',
    tonic: 2,
    scale: 'hirajoshi',
    keyLabel: 'D Hirajoshi',
    progression: 'i | bVI | i | bVI',
    genreId: 'cinematic',
    swing: 0.0,
    energy: 0.34,
    vibeTags: ['hirajoshi', 'muraiki breath', 'koto pitch bend', 'taiko resonance'],
    arrangementCue: 'Leave wide silences between expressive bamboo breath bends and crystalline koto plucks; punctuate phrase ends on a deep drum.',
    narrative: 'Architecture of stillness — Hirajoshi intervals suspended between bamboo air resonance and trembling silk-string glissandos.',
    presetHints: [
      { instrument: 'pneuma', terms: ['shakuhachi', 'bamboo'], reason: 'Muraiki breath transient & microtonal woodwind bend' },
      { instrument: 'tonos', terms: ['koto', 'shamisen', 'guqin'], reason: 'Movable-bridge Japanese plucked koto & shamisen' },
      { instrument: 'soma', terms: ['taiko', 'surdo', 'frame'], reason: 'Ceremonial wooden-barrel resonance' },
      { instrument: 'vela', terms: ['shimmer', 'glass', 'mist'], reason: 'Ambient temple bell & air shimmer' },
    ],
  },
];

function findBestPreset(instrument: InstrumentType, terms: string[], reason: string): PresetRecommendation | null {
  const bank = listPresets(instrument);
  if (!bank.length) return null;
  for (const term of terms) {
    const low = term.toLowerCase();
    const hit = bank.find((p) => `${p.name} ${p.id} ${p.category ?? ''} ${p.description ?? ''}`.toLowerCase().includes(low));
    if (hit) return { instrument, presetId: hit.id, presetName: hit.name, reason };
  }
  const first = bank[0];
  return { instrument, presetId: first.id, presetName: first.name, reason };
}

function inferCategory(q: string): ReferenceCategory {
  if (/\b(book|novel|poem|story|author|chapter|read)\b/i.test(q)) return 'book';
  if (/\b(movie|film|cinema|score|soundtrack|scene|director|anime|series|show)\b/i.test(q)) return 'film';
  if (/\b(song|track|album|artist|band|record)\b/i.test(q)) return 'song';
  if (genreInText(q)) return 'style';
  return 'vibe';
}

function presetsFromComposerLineage(q: string, activeInstrument?: InstrumentType): PresetRecommendation[] {
  const recs: PresetRecommendation[] = [];
  const low = q.toLowerCase();
  const lineage = MASTER_COMPOSER_LINEAGES.find((c) =>
    low.includes(c.composer.toLowerCase().split(',')[0])
    || c.era.toLowerCase().split(/[\s(),/]+/).some((w) => w.length > 4 && low.includes(w)),
  );
  if (lineage) {
    const types: InstrumentType[] = activeInstrument
      ? [activeInstrument, 'aura', 'bajo', 'pneuma', 'tonos', 'lyra', 'soma']
      : ['aura', 'bajo', 'pneuma', 'lyra', 'tonos', 'soma'];
    const seen = new Set<InstrumentType>();
    for (const type of types) {
      if (seen.has(type)) continue;
      const bank = listPresets(type);
      const match = bank.find((p) => lineage.melosPresets.some((mp) => p.id.includes(mp.replace(/^f_/, '')) || mp === p.id));
      if (match) {
        seen.add(type);
        recs.push({ instrument: type, presetId: match.id, presetName: match.name, reason: `${lineage.composer} palette` });
      }
    }
  }
  return recs;
}

/** Deterministic offline research engine combining Literary/Film Archetypes + Chora Direct StylePacks + Music Knowledge. */
export function researchReferenceOffline(
  query: string,
  opts: {
    ctx?: StudioContextSnapshot;
    studied?: StudiedReference | null;
    activeInstrument?: InstrumentType;
  } = {},
): ResearchBrief {
  const clean = query.trim() || 'cinematic inspiration';
  const arch = ARCHETYPES.find((a) => a.match.test(clean));
  if (arch) {
    const chordBars = realizeProgression(arch.progression, arch.tonic, arch.scale);
    const chords = chordBars.map((b) => b[0]).filter(Boolean);
    const recs = arch.presetHints
      .map((h) => findBestPreset(h.instrument, h.terms, h.reason))
      .filter((x): x is PresetRecommendation => Boolean(x));

    // If the user currently has a different instrument open, ensure we include at least 1 pick for it!
    if (opts.activeInstrument && !recs.some((r) => r.instrument === opts.activeInstrument)) {
      const extra = findBestPreset(opts.activeInstrument, arch.vibeTags, `Matches "${arch.title}" on ${opts.activeInstrument.toUpperCase()}`);
      if (extra) recs.unshift(extra);
    }

    return {
      query: clean,
      title: arch.title,
      category: arch.category,
      bpm: opts.studied?.bpmConfidence && opts.studied.bpmConfidence > 0.35 ? opts.studied.bpm : arch.bpm,
      meter: arch.meter,
      keyTonic: arch.tonic,
      keyScale: arch.scale,
      keyLabel: arch.keyLabel,
      chords,
      chart: chords.join(' | '),
      genreId: arch.genreId,
      swing: arch.swing,
      energy: arch.energy,
      vibeTags: arch.vibeTags,
      arrangementCue: arch.arrangementCue,
      narrative: arch.narrative,
      recommendedPresets: recs,
      lane: 'built-in',
    };
  }

  // Fallback to Chora Direct StylePack + Session Band Genre + Master Composer Lineages + Studied Ear.
  const tokens = clean.split(/[,;/]+|\s+/).filter((w) => w.length > 1);
  const { pack, matched } = chooseStyle(tokens.length ? tokens : [clean]);
  const bandGenre = genreInText(clean)?.id ?? pack.bandGenre ?? opts.ctx?.genre ?? 'pop';

  const tonic = opts.studied ? opts.studied.keyTonic : (pack.tonics[0] ?? opts.ctx?.keyTonic ?? 0);
  const mode = opts.studied ? opts.studied.keyScale : (pack.modes[0] ?? opts.ctx?.keyScale ?? 'minor');
  const flat = prefersFlats({ tonic, scale: mode });
  const NOTE_NAMES = flat ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const keyLabelStr = `${NOTE_NAMES[((tonic % 12) + 12) % 12]} ${mode}`;

  let chords = opts.studied?.chords.length ? opts.studied.chords.slice(0, 4) : [];
  if (!chords.length) {
    try {
      chords = realizeProgression(pack.progressions[0] || 'i | VI | III | VII', tonic, mode).map((b) => b[0]).filter(Boolean);
    } catch {
      chords = [NOTE_NAMES[tonic], NOTE_NAMES[(tonic + 5) % 12], NOTE_NAMES[(tonic + 7) % 12], NOTE_NAMES[tonic]];
    }
  }

  const bpm = opts.studied?.bpm && opts.studied.bpmConfidence > 0.3
    ? opts.studied.bpm
    : matched
      ? pack.defaultTempo
      : opts.ctx?.bpm ?? pack.defaultTempo;

  const lineageRecs = presetsFromComposerLineage(clean, opts.activeInstrument);
  const recs: PresetRecommendation[] = [...lineageRecs];
  const candidateTypes: InstrumentType[] = opts.activeInstrument
    ? [opts.activeInstrument, 'lyra', 'tonos', 'bajo', 'aura', 'soma']
    : ['lyra', 'bajo', 'aura', 'soma', 'tonos'];
  for (const inst of candidateTypes) {
    if (recs.some((r) => r.instrument === inst)) continue;
    const hit = findBestPreset(inst, [...tokens, pack.family, bandGenre], `${pack.label} color on ${inst.toUpperCase()}`);
    if (hit) recs.push(hit);
    if (recs.length >= 4) break;
  }

  const moodTagList = [...new Set([...tokens.slice(0, 3), pack.family, bandGenre, mode])].slice(0, 5);
  const narrative = matched
    ? `${pack.label} perspective shaped around "${clean}": ${pack.harmonyNotes[0] || pack.rhythm[0] || 'tight pocket and clean harmonic motion'}.`
    : `Creative study on "${clean}" in ${keyLabelStr} at ${bpm} BPM (${bandGenre} pocket)${opts.studied ? `, anchored by your studied audio contour` : ''}.`;

  return {
    query: clean,
    title: matched ? `${pack.label} · ${clean}` : `Creative Study: ${clean}`,
    category: inferCategory(clean),
    bpm,
    meter: `${pack.meter[0]}/${pack.meter[1]}`,
    keyTonic: tonic,
    keyScale: mode,
    keyLabel: keyLabelStr,
    chords,
    chart: chords.join(' | '),
    genreId: bandGenre,
    swing: pack.swing,
    energy: opts.studied?.energy ?? 0.56,
    vibeTags: moodTagList,
    arrangementCue: pack.arrangement[0] || pack.rhythm[0] || 'Keep dynamic arcs breathing with clear chord-tone resolutions.',
    narrative,
    recommendedPresets: recs,
    lane: 'built-in',
  };
}

function tryMergeLlmBrief(base: ResearchBrief, rawText: string, lane: MindLane, model?: string): ResearchBrief {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const cleanText = rawText.trim();
    return cleanText ? { ...base, narrative: cleanText.slice(0, 360), lane, note: model } : base;
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<{
      title: string;
      category: ReferenceCategory;
      bpm: number;
      key: string;
      chords: string[];
      genreId: string;
      swing: number;
      energy: number;
      vibeTags: string[];
      arrangementCue: string;
      narrative: string;
      presetHints: string[];
    }>;

    const merged: ResearchBrief = { ...base, lane, note: model };
    if (typeof parsed.title === 'string' && parsed.title.trim()) merged.title = parsed.title.trim().slice(0, 90);
    if (parsed.category && ['book', 'film', 'song', 'style', 'vibe'].includes(parsed.category)) merged.category = parsed.category;
    if (typeof parsed.bpm === 'number' && parsed.bpm >= 45 && parsed.bpm <= 200) merged.bpm = Math.round(parsed.bpm);
    if (typeof parsed.key === 'string') {
      const k = parseKey(parsed.key);
      if (k) { merged.keyTonic = k.tonic; merged.keyScale = k.scale; merged.keyLabel = parsed.key.trim(); }
    }
    if (Array.isArray(parsed.chords) && parsed.chords.length >= 2) {
      merged.chords = parsed.chords.filter((c): c is string => typeof c === 'string' && Boolean(c.trim())).slice(0, 8);
      if (merged.chords.length) merged.chart = merged.chords.join(' | ');
    }
    if (typeof parsed.swing === 'number') merged.swing = Math.max(0, Math.min(0.75, parsed.swing));
    if (typeof parsed.energy === 'number') merged.energy = Math.max(0.1, Math.min(1, parsed.energy));
    if (Array.isArray(parsed.vibeTags)) {
      const tags = parsed.vibeTags.filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).slice(0, 5);
      if (tags.length) merged.vibeTags = tags;
    }
    if (typeof parsed.arrangementCue === 'string' && parsed.arrangementCue.trim()) {
      merged.arrangementCue = parsed.arrangementCue.trim().slice(0, 260);
    }
    if (typeof parsed.narrative === 'string' && parsed.narrative.trim()) {
      merged.narrative = parsed.narrative.trim().slice(0, 380);
    }
    if (Array.isArray(parsed.presetHints) && parsed.presetHints.length) {
      const types: InstrumentType[] = [...new Set(base.recommendedPresets.map((p) => p.instrument))];
      const upgraded: PresetRecommendation[] = [];
      for (const inst of types) {
        const hit = findBestPreset(inst, parsed.presetHints, merged.arrangementCue);
        if (hit) upgraded.push(hit);
      }
      if (upgraded.length) merged.recommendedPresets = upgraded;
    }
    return merged;
  } catch {
    return base;
  }
}

/**
 * Full creative research pipeline: instant offline Story+Music analysis, optionally deepened via
 * on-device Windows LLM (`deviceLane`) or consented cloud route (`POST /api/band/research`).
 */
export async function researchCreativeReference(
  query: string,
  opts: {
    ctx?: StudioContextSnapshot;
    studied?: StudiedReference | null;
    activeInstrument?: InstrumentType;
    playerId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ResearchBrief> {
  const base = researchReferenceOffline(query, opts);
  const dev = isWindowsApp() ? await deviceLane() : { ok: false };

  const promptBody = [
    `Reference to research creatively for a live music session: "${base.query}"`,
    opts.ctx ? `Current Chora project: ${opts.ctx.promptSummary}` : '',
    opts.studied ? `Studied audio snippet: ${opts.studied.summary}` : '',
    'Respond ONLY with compact JSON containing: { "title", "category": "book|film|song|style|vibe", "bpm", "key", "chords": ["..."], "swing": 0..0.7, "energy": 0.1..1, "vibeTags": ["..."], "arrangementCue", "narrative", "presetHints": ["instrument keywords"] }.',
  ].filter(Boolean).join('\n');

  if (dev.ok) {
    try {
      const r = await nativeLlmChat(
        [
          { role: 'system', content: 'You are a Chora conservatory film & song arranger translating books, movies, songs, and moods into concrete musical briefs.' },
          { role: 'user', content: promptBody },
        ],
        { maxTokens: 380, temperature: 0.45, signal: opts.signal, timeoutMs: 90_000 },
      );
      if (r.success && r.text.trim()) return tryMergeLlmBrief(base, r.text, 'device', r.model);
    } catch { /* fallback to cloud/offline */ }
  }

  if (cloudConsent()) {
    try {
      const token = await auth.currentUser?.getIdToken?.();
      if (!token) return { ...base, note: 'Sign in for cloud book/film research; using built-in creative knowledge.' };
      const res = await fetch('/api/band/research', {
        method: 'POST',
        signal: opts.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: base.query,
          playerId: opts.playerId,
          activeInstrument: opts.activeInstrument,
          studioSummary: opts.ctx?.promptSummary,
          studiedSummary: opts.studied?.summary,
          cloudConsent: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.reply) return tryMergeLlmBrief(base, String(j.reply), 'cloud', j.model);
      return { ...base, note: j.error || 'Using built-in creative knowledge.' };
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      return { ...base, note: 'Using built-in creative knowledge.' };
    }
  }

  return base;
}
