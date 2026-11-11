// Era Clash in Chora Studio — every arena cue of the fighting game as a real Chora project (GrooveDoc).
// The project IS the song: the game's music is a bounce of exactly these documents (lab:
// eraclash-score-lab.html → scripts/games/buildEraClashAudio.ts), so a player who opens one hears the
// same piece and can mute, re-voice, re-roll and replay it.
//
// What each project shows off:
//   · SOMA physical-model percussion as the backbone, era-matched, on MEKA Group B. Hand drums are
//     PLAYED by the hand-drum performer (performHandDrum × HAND_RHYTHMS, Amara's personas, a mood and a
//     role per section); stick drums (taiko, timpani, concert snare, toms) are Euclidean rhythms
//     (arp.ts euclidean) given a player's feel by humanizeDrumPattern.
//   · A house kit on MEKA Group A built from the MEKA Drum Synth (kick, sub drop, clap, hats, shaker,
//     snare, toms), its groove phrased and filled by Marcus (humanizeDrumPattern).
//   · LYRA physical models (strings, brass, piano/tine, harp/pizz/mandolin, winds) plus AURA, BAJO and
//     the VELA suite (PNEUMA, CANTUS, ISON) playing the hand-written themes in data/gameScores/eraClash.ts,
//     phrased by the Session Band (performDoc).
//   · Live generative devices: the ostinato is held chords through a running ARP, the keys carry a
//     Humanize note-FX, the lead an Echo, the shaker a Chance gate, and two modulators (an LFO panning the
//     shaker, sample-and-hold on the hand drum's hand shape).
//
// Form: Intro 4 · [A 8 · B 8 · Break 4 · Drop 8 · Turn 4] × 2 · Tail 4 (72 bars), as MEKA scenes and
// song sections. The loop region is the first body (bars 5–36); the game loops the second pass.
//
// Pure: no engine, no DOM, no Firebase — Node (the build script) and the browser (Chora Studio, the lab)
// both import it. ONDA and instrumentFactory are deliberately not imported (ONDA's patch module pulls the
// audio engine in); tracks are made here from the instruments' own patch modules.

import { CUES, buildCue, INTRO_BARS, BODY_BARS, TAIL_BARS, TOTAL_BARS, BODY_SECTIONS, type CueSpec } from '../../data/gameScores/eraClash';
import { compileScore } from './score/scoreEngine';
import {
  defaultSendBuses, emptyPad,
  type ArrangeTrack, type GrooveDoc, type InstrumentType, type MeloNote, type NoteEvent, type PadConfig,
  type Pattern, type Scene, type SongSection, type Step, type TimelineClip,
} from './beats/grooveDoc';
import { syncSongFromSections, SCENE_COLORS } from './beats/songSections';
import { newDrumSynth, setPadDrumSynth, type DrumEngine } from './beats/drumSynth';
import { humanizeDrumPattern } from './beats/patterns/humanizeDrums';
import { performHandDrum, type HandMood, type HandRole } from './beats/patterns/handDrumPerformer';
import { HAND_RHYTHMS, type HandRhythm } from './beats/patterns/handRhythms';
import { performDoc } from './beats/patterns/performNotes';
import { NOTE_FX, type NoteFxDevice, type NoteFxKind } from './beats/noteFx';
import type { Modulator, ModTarget } from './beats/modulators';
import { BAND, type PersonaTraits } from './beats/band/roster';
import { defaultArpPatch, defaultStep, euclidean, type ArpOrder, type ArpPatch } from './arp';
import { strokeKey } from './instruments/soma/handMap';
import { SOMA_PRESETS } from './instruments/soma/presets';
import { newSomaPatch, serializeSomaPatch } from './instruments/soma/patch';
import { lyraPatchFor, serializeLyraPatch, LYRA_PRESETS } from './instruments/lyra/patch';
import { AURA_PRESETS } from './instruments/aura/presets';
import { newAuraPatch, serializeAuraPatch } from './instruments/aura/patch';
import { BAJO_PRESETS } from './instruments/bajo/presets';
import { newBajoPatch, serializeBajoPatch } from './instruments/bajo/patch';
import { VELA_PRESETS } from './instruments/vela/presets';
import { presetsFor } from './instruments/vela/suite';
import { newVelaPatch, serializeVelaPatch } from './instruments/vela/patch';

/* ── Instrumentation per cue ──────────────────────────────────────────────────────────────── */

type Role = 'lead' | 'brass' | 'str' | 'choir' | 'stab' | 'pad' | 'ost' | 'vc' | 'bass';
interface Voice { type: InstrumentType; preset: string; label: string; gainDb: number; pan: number }
const V = (type: InstrumentType, preset: string, label: string, gainDb: number, pan = 0): Voice => ({ type, preset, label, gainDb, pan });

type Sec = 'intro' | 'A' | 'B' | 'break' | 'drop' | 'turn' | 'tail';

/** A stick-struck SOMA drum: Euclidean pulses per section (steps of 16, pulses, rotation). */
interface StickDrum {
  kind: 'stick'; preset: string; label: string; gainDb: number; pan: number;
  euclid: Partial<Record<Sec, [number, number] | [number, number, number]>>;
  /** Timpani: hits alternate tonic / dominant (semitones from the pad's note). */
  pitched?: boolean;
  /** Crescendo roll in the last bar of the break (and the intro). */
  roll?: boolean;
  /** Only the downbeat of every bar in these sections (impacts). */
  downbeats?: Sec[];
}
/** A hand drum (hand map on), played by the performer from a rhythm idea. */
interface HandDrum {
  kind: 'hand'; preset: string; label: string; gainDb: number; pan: number;
  rhythm: string | HandRhythm; persona: 'griot' | 'havana' | 'shaker';
}
type SomaDrum = StickDrum | HandDrum;

interface CueChora {
  voices: Partial<Record<Role, Voice>>;
  soma: SomaDrum[];
  arp: { order: ArpOrder; octaves: number; accents: number };
  era: string;
  blurb: string;
}

/** A rhythm idea written for this score (the performer plays it; it's labelled a study, not tradition). */
const idea = (id: string, name: string, strokes: string[], preset: string, about: string): HandRhythm => ({
  id, name, tradition: 'Studio', kind: 'study', meter: '4/4', grid: 16, bars: 1,
  parts: strokes.map((s, i) => ({ drum: i === 0 ? 0 : -1, strokes: s })), bpm: 120, suits: ['frame-ancient'], preset, about,
});

const rhythm = (id: string) => HAND_RHYTHMS.find((r) => r.id === id)!;

const STR = V('lyra', 'lyra-string-quartet', 'Strings', -9, -0.3);
const VC = V('lyra', 'lyra-cello', 'Celli', -12, 0.3);

export const ERA_CLASH_CHORA: Record<string, CueChora> = {
  title: {
    era: 'Main title', blurb: 'Horn theme over a house piano, pizzicato arp and an orchestral battery: timpani, gran cassa, concert snare, with house congas.',
    voices: {
      lead: V('lyra', 'lyra-french-horn', 'Lead Horn', -5, -0.12), brass: V('lyra', 'lyra-trombone', 'Trombones', -9, 0.25), str: STR,
      stab: V('lyra', 'lyra-concert-grand', 'House Piano', -8, -0.08), pad: V('aura', 'aura-obx-warm-poly', 'Warm Poly', -16, 0),
      ost: V('lyra', 'lyra-pizzicato', 'Pizzicato Arp', -10, 0.35), vc: VC, bass: V('bajo', 'deep-round', 'House Bass', -9, 0),
    },
    soma: [
      { kind: 'stick', preset: 'timpani-29-dresden', label: 'Timpani', gainDb: -4, pan: -0.15, pitched: true, roll: true,
        euclid: { intro: [16, 1], A: [16, 2, 0], B: [16, 3], break: [16, 1], drop: [16, 5], turn: [16, 4] } },
      { kind: 'stick', preset: 'concert-gran-cassa', label: 'Gran Cassa', gainDb: -6, pan: 0, euclid: {}, downbeats: ['intro', 'B', 'drop', 'turn', 'tail'] },
      { kind: 'stick', preset: 'orchestral-field-snare', label: 'Concert Snare', gainDb: -12, pan: 0.2, roll: true, euclid: { drop: [16, 7, 2], turn: [16, 5, 2] } },
      { kind: 'hand', preset: 'conga-habana-open', label: 'House Congas', gainDb: -10, pan: 0.4, rhythm: 'house-perc', persona: 'havana' },
    ],
    arp: { order: 'updown', octaves: 2, accents: 5 },
  },
  japan: {
    era: 'Kyoto', blurb: 'Shakuhachi theme, koto-style harp arp and Rhodes chords over O-Daiko and Shime-Daiko.',
    voices: {
      lead: V('pneuma', 'pneuma-shakuhachi', 'Shakuhachi', -4, -0.1), brass: V('lyra', 'lyra-french-horn', 'Horns', -10, 0.25), str: STR,
      stab: V('lyra', 'lyra-tine-mellow', 'Tine Keys', -8, -0.12), pad: V('aura', 'aura-soft-77-pad', 'Soft Pad', -16, 0),
      ost: V('lyra', 'lyra-harp', 'Koto Harp Arp', -9, 0.35), vc: VC, bass: V('bajo', 'deep-round', 'House Bass', -9, 0),
    },
    soma: [
      { kind: 'stick', preset: 'nagado-daiko-odaiko', label: 'O-Daiko', gainDb: -4, pan: -0.1, roll: true,
        euclid: { intro: [16, 1], A: [16, 3], B: [16, 3, 2], break: [16, 1], drop: [16, 5, 1], turn: [16, 6] }, downbeats: ['tail'] },
      { kind: 'stick', preset: 'shime-daiko-tense', label: 'Shime-Daiko', gainDb: -12, pan: 0.3, roll: true,
        euclid: { A: [16, 5, 2], B: [16, 9, 1], break: [16, 4, 2], drop: [16, 11], turn: [16, 13] } },
    ],
    arp: { order: 'up', octaves: 2, accents: 7 },
  },
  norse: {
    era: 'Fjord', blurb: 'Fiddle theme, plucked-lyre arp, kargyraa drone and horns over bodhrán, a shaman frame drum and war toms.',
    voices: {
      lead: V('lyra', 'lyra-fiddle', 'Fiddle', -5, -0.15), brass: V('lyra', 'lyra-french-horn', 'Horns', -8, 0.25), str: STR,
      choir: V('cantus', 'cantus-kargyraa', 'Kargyraa Drone', -12, 0.05),
      stab: V('lyra', 'lyra-concert-grand', 'House Piano', -9, -0.1), pad: V('ison', 'ison-bourdon', 'Bourdon', -16, 0),
      ost: V('lyra', 'lyra-nylon', 'Lyre Arp', -9, 0.35), vc: VC, bass: V('bajo', 'deep-round', 'House Bass', -9, 0),
    },
    soma: [
      { kind: 'hand', preset: 'bodhran-kerry-tipper', label: 'Bodhrán', gainDb: -8, pan: 0.3, rhythm: 'reel', persona: 'griot' },
      { kind: 'hand', preset: 'shamanic-cedar-beater', label: 'Frame Drum', gainDb: -5, pan: -0.2, persona: 'shaker',
        rhythm: idea('ec-fjord-pulse', 'Fjord heartbeat', ['B.....B.B.......'], 'shamanic-cedar-beater', 'A heartbeat on the big frame drum: one, the and of two, three.') },
      { kind: 'stick', preset: 'concert-tom-mahogany', label: 'War Toms', gainDb: -8, pan: 0, roll: true, euclid: { B: [16, 3, 3], drop: [16, 5, 3], turn: [16, 7, 3] } },
    ],
    arp: { order: 'upDownInclusive', octaves: 1, accents: 5 },
  },
  italy: {
    era: 'Piazza', blurb: 'Violin theme, mandolin arp and an Italo house grand over timpani, concert snare and a ringed frame drum in the tamburello role.',
    voices: {
      lead: V('lyra', 'lyra-concert-violin', 'Solo Violin', -5, -0.2), brass: V('lyra', 'lyra-trumpet-open', 'Trumpets', -10, 0.25), str: STR,
      choir: V('lyra', 'lyra-trombone', 'Trombones', -11, 0.1),
      stab: V('lyra', 'lyra-studio-grand', 'Italo Piano', -8, -0.1), pad: V('aura', 'aura-elka-rhapsody', 'Elka Strings', -16, 0),
      ost: V('lyra', 'lyra-mandolin', 'Mandolin Arp', -9, 0.35), vc: VC, bass: V('bajo', 'deep-round', 'House Bass', -9, 0),
    },
    soma: [
      { kind: 'stick', preset: 'timpani-32-profondo', label: 'Timpani', gainDb: -4, pan: -0.15, pitched: true, roll: true,
        euclid: { intro: [16, 1], A: [16, 2], B: [16, 3], break: [16, 1], drop: [16, 5], turn: [16, 4] } },
      { kind: 'stick', preset: 'orchestral-field-snare', label: 'Concert Snare', gainDb: -12, pan: 0.2, roll: true, euclid: { B: [16, 5, 2], drop: [16, 9, 1], turn: [16, 7] } },
      { kind: 'hand', preset: 'daf-persian-rings', label: 'Ringed Frame Drum', gainDb: -10, pan: 0.35, rhythm: 'reel', persona: 'havana' },
    ],
    arp: { order: 'updown', octaves: 1, accents: 6 },
  },
  aztec: {
    era: 'Temple', blurb: 'Clay-flute theme, wooden AURA arp and a log-drum bass over a deep tar (huehuetl role), udu and gong drum.',
    voices: {
      lead: V('pneuma', 'pneuma-ney', 'Clay Flute', -4, -0.1), brass: V('lyra', 'lyra-french-horn', 'Horns', -9, 0.25), str: STR,
      choir: V('lyra', 'lyra-bass-trombone', 'Low Brass', -11, 0.1),
      stab: V('lyra', 'lyra-tine-stage', 'Tine Keys', -9, -0.12), pad: V('vela', 'deep-wash', 'Deep Wash', -16, 0),
      ost: V('aura', 'aura-buchla-bongo', 'Wood Arp', -12, 0.35), vc: VC, bass: V('bajo', 'amapiano-log', 'Log Bass', -9, 0),
    },
    soma: [
      { kind: 'hand', preset: 'tar-nubian-deep', label: 'Deep Tar', gainDb: -5, pan: -0.15, persona: 'griot',
        rhythm: idea('ec-temple-steps', 'Temple steps', ['B..t..B.t.B.t...'], 'tar-nubian-deep', 'Three-against-the-bar bass strokes with open tones between, for the big frame drum.') },
      { kind: 'hand', preset: 'udu-igbo-clay', label: 'Udu', gainDb: -8, pan: 0.35, rhythm: 'malfuf', persona: 'griot' },
      { kind: 'stick', preset: 'gong-drum-boobam', label: 'Gong Drum', gainDb: -6, pan: 0, roll: true, euclid: { intro: [16, 1], B: [16, 2], drop: [16, 3], turn: [16, 3, 1] }, downbeats: ['tail'] },
    ],
    arp: { order: 'spiral', octaves: 1, accents: 5 },
  },
  china: {
    era: 'Shaolin terrace', blurb: 'Flute theme in the dizi role, guzheng-style harp arp and Rhodes over a big barrel drum, a tight high drum and toms.',
    voices: {
      lead: V('lyra', 'lyra-concert-flute', 'Flute', -5, -0.1), brass: V('lyra', 'lyra-french-horn', 'Horns', -10, 0.25), str: STR,
      stab: V('lyra', 'lyra-tine-mellow', 'Tine Keys', -9, -0.12), pad: V('vela', 'vitreous', 'Glass Pad', -16, 0),
      ost: V('lyra', 'lyra-harp', 'Zither Harp Arp', -9, 0.35), vc: VC, bass: V('bajo', 'deep-round', 'House Bass', -9, 0),
    },
    soma: [
      { kind: 'stick', preset: 'nagado-daiko-odaiko', label: 'Barrel Drum', gainDb: -5, pan: -0.1, euclid: { intro: [16, 1], A: [16, 2], B: [16, 2], break: [16, 1], drop: [16, 4], turn: [16, 4, 1] }, downbeats: ['tail'] },
      { kind: 'stick', preset: 'shime-daiko-tense', label: 'High Drum', gainDb: -12, pan: 0.3, roll: true, euclid: { A: [16, 7, 1], B: [16, 10], break: [16, 3], drop: [16, 12], turn: [16, 14] } },
      { kind: 'stick', preset: 'concert-tom-mahogany', label: 'Toms', gainDb: -9, pan: -0.3, euclid: { B: [16, 3, 2], drop: [16, 5, 2], turn: [16, 5] } },
    ],
    arp: { order: 'up', octaves: 2, accents: 6 },
  },
  rome: {
    era: 'Colosseum', blurb: 'Trumpet theme, harp in the kithara role and a bourdon drone over gran cassa, concert snare, toms and a bendir in the tympanum role.',
    voices: {
      lead: V('lyra', 'lyra-trumpet-open', 'Lead Trumpet', -6, -0.15), brass: V('lyra', 'lyra-trombone', 'Trombones', -8, 0.25), str: STR,
      choir: V('lyra', 'lyra-tuba', 'Tuba', -11, 0.05),
      stab: V('lyra', 'lyra-concert-grand', 'House Piano', -9, -0.1), pad: V('ison', 'ison-bourdon', 'Bourdon', -16, 0),
      ost: V('lyra', 'lyra-harp', 'Kithara Harp Arp', -9, 0.35), vc: VC, bass: V('bajo', 'deep-round', 'House Bass', -9, 0),
    },
    soma: [
      { kind: 'stick', preset: 'concert-gran-cassa', label: 'Gran Cassa', gainDb: -10, pan: 0, euclid: { A: [16, 2], drop: [16, 3] }, downbeats: ['intro', 'B', 'turn', 'tail'] },
      { kind: 'stick', preset: 'orchestral-field-snare', label: 'Concert Snare', gainDb: -12, pan: 0.2, roll: true, euclid: { A: [16, 5, 2], B: [16, 7, 2], drop: [16, 9, 2], turn: [16, 11] } },
      { kind: 'stick', preset: 'concert-tom-mahogany', label: 'War Toms', gainDb: -8, pan: -0.25, roll: true, euclid: { B: [16, 3, 1], drop: [16, 5, 1], turn: [16, 6] } },
      { kind: 'hand', preset: 'bendir-atlas-gut', label: 'Bendir', gainDb: -9, pan: 0.35, rhythm: 'frame-maqsum', persona: 'griot' },
    ],
    arp: { order: 'updown', octaves: 2, accents: 5 },
  },
};

/* ── Public catalogue ─────────────────────────────────────────────────────────────────────── */

export const ERA_CLASH_PROJECT_PREFIX = 'eraclash-';

export interface EraClashProjectInfo {
  id: string;          // eraclash-<cueId>
  cueId: string;
  title: string;
  era: string;
  blurb: string;
  bpm: number;
  key: string;
  bars: number;
  durationSec: number;
  soma: string[];
  instruments: string[];
}

const KEY_NAMES: Record<number, string> = { 0: 'A minor', 1: 'E minor', [-1]: 'D minor', [-2]: 'G minor', [-3]: 'C minor' };
/** Relative-minor tonic pitch class for a key signature (fifths). */
const minorTonicPc = (fifths: number) => (((fifths * 7) % 12) + 12 + 9) % 12;

export function eraClashProjects(): EraClashProjectInfo[] {
  return CUES.map((c) => {
    const ch = ERA_CLASH_CHORA[c.id];
    return {
      id: ERA_CLASH_PROJECT_PREFIX + c.id, cueId: c.id, title: c.title, era: ch.era, blurb: ch.blurb, bpm: c.bpm,
      key: KEY_NAMES[c.keyFifths] ?? 'minor', bars: TOTAL_BARS, durationSec: Math.round(TOTAL_BARS * 4 * 60 / c.bpm),
      soma: ch.soma.map((s) => somaName(s.preset)),
      instruments: Object.values(ch.voices).filter(Boolean).map((v) => `${v!.type.toUpperCase()} ${presetName(v!)}`),
    };
  });
}

export const isEraClashProjectId = (id: unknown): id is string =>
  typeof id === 'string' && CUES.some((c) => ERA_CLASH_PROJECT_PREFIX + c.id === id);

/* ── Helpers ──────────────────────────────────────────────────────────────────────────────── */

const COLORS: Record<InstrumentType, string> = {
  onda: '#B84DFF', kera: '#00DAF3', bajo: '#FF4B1C', aura: '#E59A38', soma: '#E86A33', lyra: '#D9B36C',
  vela: '#7FD1C7', cantus: '#C9A0FF', ison: '#9AA7FF', pneuma: '#8FE3B0',
};

function somaName(id: string): string { return SOMA_PRESETS.find((p) => p.id === id)?.name ?? id; }
function presetName(v: Voice): string {
  switch (v.type) {
    case 'lyra': return LYRA_PRESETS.find((p) => p.id === v.preset)?.name ?? v.preset;
    case 'aura': return AURA_PRESETS.find((p) => p.id === v.preset)?.name ?? v.preset;
    case 'bajo': return BAJO_PRESETS.find((p) => p.id === v.preset)?.name ?? v.preset;
    case 'vela': return VELA_PRESETS.find((p) => p.id === v.preset)?.name ?? v.preset;
    case 'cantus': case 'ison': case 'pneuma': return presetsFor(v.type).find((p) => p.id === v.preset)?.name ?? v.preset;
    default: return v.preset;
  }
}

function patchFor(v: Voice): Record<string, unknown> {
  switch (v.type) {
    case 'lyra': return serializeLyraPatch(lyraPatchFor(v.preset));
    case 'aura': { const p = AURA_PRESETS.find((x) => x.id === v.preset); return serializeAuraPatch(newAuraPatch(p)); }
    case 'bajo': { const p = BAJO_PRESETS.find((x) => x.id === v.preset); return serializeBajoPatch(newBajoPatch(p)) as Record<string, unknown>; }
    case 'vela': { const p = VELA_PRESETS.find((x) => x.id === v.preset); return serializeVelaPatch(newVelaPatch(p)); }
    case 'cantus': case 'ison': case 'pneuma': { const p = presetsFor(v.type).find((x) => x.id === v.preset); return serializeVelaPatch(newVelaPatch(p)); }
    default: throw new Error(`eraClashChora: no patch builder for ${v.type}`);
  }
}

/** Deterministic noise so the same cue always builds the same project (and the same bounce). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function persona(player: string, id: string): PersonaTraits {
  const p = BAND.find((x) => x.id === player)!;
  return (p.personas.find((x) => x.id === id) ?? p.personas[0]).traits;
}

function fx(kind: NoteFxKind, id: string, params: Record<string, number | string>): NoteFxDevice {
  const def = NOTE_FX.find((d) => d.kind === kind)!;
  const base: Record<string, number | string> = {};
  for (const s of def.params) base[s.key] = s.default;
  return { id, kind, on: true, params: { ...base, ...params } };
}

/* ── Song form ────────────────────────────────────────────────────────────────────────────── */

interface Span { sec: Sec; name: string; bar: number; bars: number }

/** The 12 song sections, 0-based bars. */
export function eraClashForm(): Span[] {
  const out: Span[] = [{ sec: 'intro', name: 'Intro', bar: 0, bars: INTRO_BARS }];
  const label: Record<string, [Sec, string]> = { A: ['A', 'A · Theme'], B: ['B', 'B · Strings'], break: ['break', 'Break'], drop: ['drop', 'Drop'], turn: ['turn', 'Turn'] };
  for (let pass = 0; pass < 2; pass++) {
    for (const s of BODY_SECTIONS) {
      const [sec, name] = label[s.type];
      out.push({ sec, name: pass ? `${name} (loop)` : name, bar: INTRO_BARS + pass * BODY_BARS + s.from, bars: s.to - s.from + 1 });
    }
  }
  out.push({ sec: 'tail', name: 'Tail', bar: INTRO_BARS + 2 * BODY_BARS, bars: TAIL_BARS });
  return out;
}

/* ── Group A: the house kit (MEKA Drum Synth) ─────────────────────────────────────────────── */

/** Pad layout follows DEFAULT_KIT so humanizeDrumPattern's voice roles line up. */
const KIT = { kick: 0, sub: 1, snare: 4, clap: 5, hat: 8, ohat: 9, tomHi: 12, tomLo: 13, shaker: 14 } as const;

function kitPads(cueId: string): PadConfig[] {
  const pads = Array.from({ length: 16 }, (_, i) => emptyPad(i));
  const put = (idx: number, name: string, color: string, engine: DrumEngine, model: string, params: Record<string, number>, extra: Partial<PadConfig> = {}) => {
    const p = pads[idx];
    p.id = `ec_${cueId}_kit_${idx}`;
    p.name = name; p.color = color; p.group = 0; p.choke = 0;
    setPadDrumSynth(p, newDrumSynth(engine, model, params));
    Object.assign(p, extra);
  };
  put(KIT.kick, 'House Kick', '#FF8C00', 'kick', 'analog', { tune: 49, decay: 0.42, pitchAmt: 22, pitchDecay: 0.03, click: 0.3, drive: 0.18, tone: 0.45 }, { gainDb: -3 });
  put(KIT.sub, 'Sub Drop', '#D40055', 'kick', 'sub', { tune: 38, decay: 1.8, pitchAmt: 14, pitchDecay: 0.12, click: 0 }, { gainDb: -5 });
  put(KIT.snare, 'Roll Snare', '#00DAF3', 'snare', 'acoustic', { tune: 210, decay: 0.12, noiseDecay: 0.18, mix: 0.75, snap: 0.5 });
  put(KIT.clap, 'Clap', '#00DAF3', 'clap', 'room', { tune: 1300, decay: 0.32, bursts: 4, spread: 0.012 }, { gainDb: 2 });
  put(KIT.hat, 'Closed Hat', '#F5F0FA', 'hat', 'metal', { decay: 0.045, tone: 0.72, ring: 0.3, mix: 0.55 }, { choke: 1, gainDb: 5 });
  put(KIT.ohat, 'Open Hat', '#F5F0FA', 'hat', 'hybrid', { decay: 0.26, tone: 0.65, ring: 0.35, mix: 0.5 }, { choke: 1, gainDb: 4 });
  put(KIT.tomHi, 'Tom Hi', '#D0BCFF', 'tom', 'acoustic', { tune: 190, decay: 0.35 });
  put(KIT.tomLo, 'Tom Lo', '#D0BCFF', 'tom', 'acoustic', { tune: 115, decay: 0.45 });
  put(KIT.shaker, 'Shaker', '#D0BCFF', 'perc', 'shaker', { decay: 0.07 }, {
    gainDb: 4, pan: 0.3,
    // A live generative gate: each shaker note plays only some of the time, never the same bar twice.
    noteFx: [fx('chance', `ec_${cueId}_nfx_shaker`, { p: 0.82 }), fx('velocity', `ec_${cueId}_nfx_shakervel`, { random: 18 })],
  });
  return pads;
}

type Rows = Pattern['steps'];
const row = (rows: Rows, pad: number) => (rows[pad] ??= {});

/** One bar of house groove (16 steps). */
function houseBar(sec: Sec): Rows {
  const r: Rows = {};
  const drop = sec === 'drop';
  for (const s of [0, 4, 8, 12]) row(r, KIT.kick)[s] = { v: drop ? 124 : 116 };
  for (const s of [4, 12]) row(r, KIT.clap)[s] = { v: drop ? 104 : 96 };
  for (let s = 0; s < 16; s++) row(r, KIT.hat)[s] = { v: s % 4 === 2 ? 92 : s % 2 ? 58 : 70 };
  if (sec !== 'A') for (const s of [2, 6, 10, 14]) { row(r, KIT.ohat)[s] = { v: 84 }; delete row(r, KIT.hat)[s]; }
  if (sec === 'B' || sec === 'drop' || sec === 'turn') for (let s = 0; s < 16; s++) row(r, KIT.shaker)[s] = { v: s % 2 ? 76 : 54 };
  return r;
}

function rollInto(r: Rows, pad: number, from: number, to: number, every: number, v0: number, v1: number) {
  for (let s = from; s < to; s += every) row(r, pad)[s] = { v: Math.round(v0 + (v1 - v0) * ((s - from) / Math.max(1, to - from - 1))) };
}

function kitPattern(c: CueSpec, sec: Sec, idx: number): Pattern {
  const drummer = persona('marcus', 'clockwork');
  const seed = seedOf(`${c.id}:kit:${sec}`);
  const id = `ec_${c.id}_pat_A_${sec}`;
  const name = `Kit · ${sec}`;
  if (sec === 'intro' || sec === 'break' || sec === 'tail') {
    const r: Rows = {};
    if (sec === 'intro') {
      row(r, KIT.sub)[0] = { v: 110 }; row(r, KIT.sub)[32] = { v: 84 };
      for (let s = 34; s < 64; s += 4) row(r, KIT.hat)[s] = { v: 48 + (s - 34) };
      rollInto(r, KIT.snare, 48, 56, 2, 46, 70); rollInto(r, KIT.snare, 56, 64, 1, 72, 118);
    } else if (sec === 'break') {
      row(r, KIT.sub)[0] = { v: 112 };
      for (let b = 0; b < 4; b++) for (const s of [2, 6, 10, 14]) row(r, KIT.hat)[b * 16 + s] = { v: 52 };
      rollInto(r, KIT.snare, 32, 48, 2, 40, 76); rollInto(r, KIT.snare, 48, 64, 1, 78, 122);
      row(r, KIT.clap)[60] = { v: 90 }; row(r, KIT.clap)[62] = { v: 104 };
    } else {
      row(r, KIT.kick)[0] = { v: 118 }; row(r, KIT.sub)[0] = { v: 104 };
    }
    // Feel only: Marcus plays the written bars (no extra fills, the build is the fill).
    const p: Pattern = { id, name, length: 64, steps: r };
    return { ...humanizeDrumPattern(p, drummer, seed, 1, false), id, name };
  }
  // Groove sections: one written bar → Marcus plays it as a four-bar phrase with a fill into the next.
  const src: Pattern = { id, name, length: 16, steps: houseBar(sec) };
  const played = humanizeDrumPattern(src, drummer, seed, 4, sec !== 'A' || idx > 0);
  if (sec === 'drop' || sec === 'A') row(played.steps, KIT.sub)[0] = { v: sec === 'drop' ? 116 : 96 };
  return { ...played, id, name };
}

/* ── Group B: SOMA ────────────────────────────────────────────────────────────────────────── */

const HAND_PLAY: Record<Sec, { role: HandRole; mood: HandMood } | null> = {
  intro: { role: 'intro', mood: 'hypnotic' },
  A: { role: 'groove', mood: 'steady' },
  B: { role: 'fills', mood: 'joyful' },
  break: { role: 'break', mood: 'tender' },
  drop: { role: 'fills', mood: 'intense' },
  turn: { role: 'fills', mood: 'intense' },
  tail: null,
};

interface SomaPadInfo { drum: SomaDrum; padIdx: number; trackId: string; homeNote: number }

function stickRows(c: CueSpec, d: StickDrum, padIdx: number, sec: Sec, rand: () => number): Record<number, Step> {
  const out: Record<number, Step> = {};
  const e = d.euclid[sec];
  const accent = (s: number) => (s % 16 === 0 ? 1 : s % 4 === 0 ? 0.7 : s % 2 === 0 ? 0.45 : 0.3);
  const loud = sec === 'drop' ? 1 : sec === 'turn' ? 0.95 : sec === 'B' ? 0.88 : sec === 'A' ? 0.8 : 0.72;
  const hit = (s: number, v: number, k: number) => {
    const st: Step = { v: Math.round(clamp(v, 20, 127)) };
    if (d.pitched) st.pitch = s % 16 === 0 || k % 2 === 0 ? 0 : -5; // tonic on the beat, the dominant below between
    out[s] = st;
  };
  if (e) {
    for (let bar = 0; bar < 4; bar++) {
      // The fourth bar of a driving section pushes: two more pulses.
      const pulses = e[1] + (bar === 3 && (sec === 'drop' || sec === 'turn' || sec === 'B') ? 2 : 0);
      const pat = euclidean(e[0], Math.min(e[0], pulses), e[2] ?? 0);
      let k = 0;
      pat.forEach((on, s) => { if (on) hit(bar * 16 + s, (64 + 60 * accent(s)) * loud + (rand() - 0.5) * 10, k++); });
    }
  }
  if (d.downbeats?.includes(sec)) for (let bar = 0; bar < (sec === 'tail' ? 1 : 4); bar++) hit(bar * 16, 118 * (sec === 'intro' && bar % 2 ? 0.75 : 1), 0);
  if (d.roll && (sec === 'break' || sec === 'intro')) {
    for (let s = 48; s < 64; s++) hit(s, 40 + (s - 48) * 5.5, s);
    if (sec === 'break') hit(0, 112, 0);
  }
  if (d.roll && sec === 'turn') for (let s = 60; s < 64; s++) hit(s, 90 + (s - 60) * 9, s);
  void c; void padIdx;
  return out;
}

function handLane(c: CueSpec, info: SomaPadInfo, sec: Sec): Record<number, MeloNote[]> | null {
  const d = info.drum as HandDrum;
  const play = HAND_PLAY[sec];
  const lane: Record<number, MeloNote[]> = {};
  const push = (step: number, note: number, v: number, micro?: number) => {
    const n: MeloNote = { semi: clamp(note - info.homeNote, -24, 24), v, len: 1 };
    if (micro) n.micro = micro;
    (lane[step] ??= []).push(n);
  };
  if (!play) { push(0, info.homeNote + strokeKey('bass', 'R'), 110); return lane; }
  const r = typeof d.rhythm === 'string' ? HAND_RHYTHMS.find((x) => x.id === d.rhythm)! : d.rhythm;
  const perf = performHandDrum({ rhythm: r, persona: persona('amara', d.persona), mood: play.mood, role: play.role, bars: 4, seed: seedOf(`${c.id}:${d.preset}:${sec}`) });
  for (const s of perf.strokes) push(s.step, info.homeNote + strokeKey(s.stroke, s.hand) + 12 * s.drum, s.vel, s.micro || undefined);
  return lane;
}

function somaPattern(c: CueSpec, pads: SomaPadInfo[], sec: Sec): Pattern {
  const id = `ec_${c.id}_pat_B_${sec}`, name = `SOMA · ${sec}`;
  const rand = rng(seedOf(`${c.id}:soma:${sec}`));
  const steps: Rows = {};
  const melo: NonNullable<Pattern['melo']> = {};
  for (const info of pads) {
    if (info.drum.kind === 'stick') {
      const r = stickRows(c, info.drum, info.padIdx, sec, rand);
      if (Object.keys(r).length) steps[info.padIdx] = r;
    } else {
      const lane = handLane(c, info, sec);
      if (lane && Object.keys(lane).length) melo[info.padIdx] = lane;
    }
  }
  // The stick drums get a player's feel (no fills: the writing already phrases them).
  const felt = humanizeDrumPattern({ id, name, length: 64, steps }, persona('amara', 'griot'), seedOf(`${c.id}:feel:${sec}`), 1, false);
  return { id, name, length: 64, steps: felt.steps, melo, groupIdx: 1 };
}

/* ── Instrument parts from the score ──────────────────────────────────────────────────────── */

/** The ostinato part as held chords — the ARP plays them, so the figure is generated live. */
function ostChords(notes: NoteEvent[]): NoteEvent[] {
  const byHalf = new Map<number, { keys: Set<number>; vel: number }>();
  for (const n of notes) {
    const h = Math.floor(n.startBeats / 2 + 1e-6);
    const g = byHalf.get(h) ?? { keys: new Set<number>(), vel: 0 };
    g.keys.add(n.key); g.vel = Math.max(g.vel, n.vel);
    byHalf.set(h, g);
  }
  const out: NoteEvent[] = [];
  for (const [h, g] of [...byHalf.entries()].sort((a, b) => a[0] - b[0])) {
    for (const key of [...g.keys].sort((a, b) => a - b).slice(0, 4)) out.push({ id: '', startBeats: h * 2, lengthBeats: 2, key, vel: g.vel });
  }
  return out;
}

function arpFor(c: CueSpec, ch: CueChora): ArpPatch {
  const a = defaultArpPatch();
  const acc = euclidean(16, ch.arp.accents, 0);
  return {
    ...a, enabled: true, order: ch.arp.order, rate: 4, octaves: ch.arp.octaves, gate: 0.55, length: 16,
    steps: acc.map((on) => ({ ...defaultStep(), velocity: on ? 108 : 74 })),
    scale: { rootPc: minorTonicPc(c.keyFifths), scaleId: 'minor', enabled: true },
    seed: seedOf(`${c.id}:arp`),
  };
}

function clipsFor(trackId: string, notes: NoteEvent[], form: Span[], color: string, role: Role): TimelineClip[] {
  const clips: TimelineClip[] = [];
  for (const s of form) {
    const start = s.bar * 4, end = (s.bar + s.bars) * 4;
    const inside = notes.filter((n) => n.startBeats >= start - 1e-6 && n.startBeats < end - 1e-6);
    if (!inside.length) continue;
    clips.push({
      id: `${trackId}_${s.bar}`, name: s.name, startBeats: start, lengthBeats: end - start, color,
      notes: inside.map((n, i) => ({
        ...n, id: `${trackId}_${s.bar}_${i}`, startBeats: +(n.startBeats - start).toFixed(4),
        lengthBeats: Math.max(0.0625, Math.min(n.lengthBeats, end - n.startBeats)),
        // Strings keep their tremolo marking; everything else plays plain (LYRA reads the notes).
        articulation: role === 'str' ? n.articulation : undefined,
      })),
    });
  }
  return clips;
}

/* ── The project ──────────────────────────────────────────────────────────────────────────── */

const PART_OF: Record<Role, string> = { lead: 'lead', brass: 'brass', str: 'str', choir: 'choir', stab: 'stab', pad: 'pad', ost: 'ost', vc: 'vc', bass: 'bass' };
const ROLE_ORDER: Role[] = ['lead', 'str', 'brass', 'choir', 'stab', 'ost', 'pad', 'vc', 'bass'];

/**
 * Build the Chora Studio project for one Era Clash cue. Deterministic: the same cue always gives the
 * same notes, patterns and devices (ids included), which is what makes the game's audio a bounce of it.
 */
export function buildEraClashGrooveDoc(cueOrProjectId: string, ownerId = 'eraclash-showcase'): GrooveDoc {
  const cueId = cueOrProjectId.startsWith(ERA_CLASH_PROJECT_PREFIX) ? cueOrProjectId.slice(ERA_CLASH_PROJECT_PREFIX.length) : cueOrProjectId;
  const c = CUES.find((x) => x.id === cueId);
  const ch = ERA_CLASH_CHORA[cueId];
  if (!c || !ch) throw new Error(`Unknown Era Clash cue: ${cueOrProjectId}`);
  const form = eraClashForm();
  const now = Date.now();
  const tonicPc = minorTonicPc(c.keyFifths);

  // ── Kit: Group A house kit + Group B SOMA drums
  const kit: PadConfig[] = [...kitPads(c.id), ...Array.from({ length: 16 }, (_, i) => emptyPad(16 + i))];
  const arrangement: ArrangeTrack[] = [];
  const somaPads: SomaPadInfo[] = ch.soma.map((d, i) => {
    const padIdx = 16 + i;
    const preset = SOMA_PRESETS.find((p) => p.id === d.preset)!;
    let patch = newSomaPatch(preset);
    patch = { ...patch, id: `ec_${c.id}_soma_${i}`, hand: { enabled: d.kind === 'hand', layout: 'keys' } };
    // Hand drums: the home drum's C is the bass stroke (as the hand-pattern library writes them).
    // Pitched timpani: the pad sits on the key's tonic in the drum's own register.
    let home = preset.defaultNote;
    if (d.kind === 'hand') home = Math.floor(preset.defaultNote / 12) * 12;
    else if (d.pitched) home = preset.defaultNote + ((tonicPc - (preset.defaultNote % 12) + 18) % 12) - 6;
    const trackId = `ec_${c.id}_trk_soma_${i}`;
    arrangement.push({
      id: trackId, kind: 'instrument', name: `${d.label} · SOMA`, color: COLORS.soma, mute: false, solo: false,
      gainDb: d.gainDb, pan: d.pan, clips: [], padOwned: true, padIndex: padIdx, armed: false, position: [d.pan, 0, -1],
      instrument: { type: 'soma', patch: serializeSomaPatch(patch), presetName: preset.name },
    });
    const pad = kit[padIdx];
    Object.assign(pad, {
      id: `ec_${c.id}_pad_soma_${i}`, name: d.label.slice(0, 18), color: COLORS.soma, empty: false,
      source: 'instrument', instrumentTrackId: trackId, instrumentNote: home, group: 1, choke: 0,
    } satisfies Partial<PadConfig>);
    return { drum: d, padIdx, trackId, homeNote: home };
  });

  // ── Patterns and scenes: one Group A + one Group B pattern per section type
  const secs: Sec[] = ['intro', 'A', 'B', 'break', 'drop', 'turn', 'tail'];
  const patterns: Pattern[] = [];
  const scenes: Scene[] = [];
  const sceneName: Record<Sec, string> = { intro: 'Intro', A: 'A · Theme', B: 'B · Strings', break: 'Break', drop: 'Drop', turn: 'Turn', tail: 'Tail' };
  secs.forEach((sec, i) => {
    const pa = kitPattern(c, sec, i);
    const pb = somaPattern(c, somaPads, sec);
    patterns.push(pa, pb);
    scenes.push({ id: `ec_${c.id}_scene_${sec}`, name: sceneName[sec], color: SCENE_COLORS[i % SCENE_COLORS.length], slots: { 0: pa.id, 1: pb.id } });
  });
  const sections: SongSection[] = form.map((s) => ({ id: `ec_${c.id}_sec_${s.bar}`, sceneId: `ec_${c.id}_scene_${s.sec}`, bars: s.bars, name: s.name }));

  // ── Instrument tracks: the score's parts, re-voiced for Chora's instruments
  const score = buildCue(c);
  const notes = compileScore(score);
  const instTracks: ArrangeTrack[] = [];
  for (const role of ROLE_ORDER) {
    const v = ch.voices[role];
    if (!v) continue;
    let partNotes = notes[PART_OF[role]] ?? [];
    if (!partNotes.length) continue;
    const trackId = `ec_${c.id}_trk_${role}`;
    const color = COLORS[v.type];
    const t: ArrangeTrack = {
      id: trackId, kind: 'instrument', name: `${v.label} · ${v.type.toUpperCase()}`, color, mute: false, solo: false,
      gainDb: v.gainDb, pan: v.pan, clips: [], armed: role === 'lead', position: [v.pan, 0.1, -0.9],
      instrument: { type: v.type, patch: patchFor(v), presetName: presetName(v) },
    };
    if (role === 'ost') {
      partNotes = ostChords(partNotes);
      t.instrument!.arp = arpFor(c, ch) as unknown as Record<string, unknown>;
    }
    if (role === 'stab') t.instrument!.noteFx = [fx('humanize', `ec_${c.id}_nfx_stab`, { timing: 0.01, vel: 10, len: 0.08 })];
    if (role === 'lead') t.instrument!.noteFx = [fx('echo', `ec_${c.id}_nfx_lead`, { repeats: 2, time: 3, decay: 0.32 })];
    t.clips = clipsFor(trackId, partNotes, form, color, role);
    instTracks.push(t);
  }

  // ── Modulators: generative motion users can see and change
  const handTrack = somaPads.find((p) => p.drum.kind === 'hand')?.trackId;
  const mod = (id: string, label: string, target: ModTarget, min: number, max: number, wave: string, syncBeats: number, randomness = 0): Modulator => ({
    id, on: true, label, target, min, max, wave, syncBeats, rateHz: 0.5, phase: 0, probability: 1, rest: 0.5, randomness, curve: 'linear', curveAmt: 0.5, seed: seedOf(id),
  });
  const modulators: Modulator[] = [
    mod(`ec_${c.id}_mod_shaker`, 'Pan — Shaker', { kind: 'pad', padIdx: KIT.shaker, field: 'pan' }, -0.55, 0.55, 'sine', 2),
  ];
  if (handTrack) modulators.push(mod(`ec_${c.id}_mod_hand`, 'Hand shape — SOMA', { kind: 'track', trackId: handTrack, target: { kind: 'mod-wheel' } }, 0.25, 0.85, 'sh', 1, 0.3));

  const doc: GrooveDoc = {
    id: `eraclash_${c.id}`,
    name: `Era Clash · ${c.title}`,
    ownerId,
    bpm: c.bpm,
    swing: 0,
    key: { tonic: tonicPc, scale: 'minor' },
    loop: { on: true, startBeats: INTRO_BARS * 4, endBeats: (INTRO_BARS + BODY_BARS) * 4 },
    kit,
    patterns,
    scenes,
    sections,
    groupMeta: [{ name: 'House Kit', color: '#FF8C00' }, { name: `SOMA · ${ch.era}`, color: COLORS.soma }],
    modulators,
    arrangement: [...arrangement, ...instTracks],
    mixer: {
      groups: [{ gainDb: -3, mute: false, solo: false }, { gainDb: 0, mute: false, solo: false }, { gainDb: 0, mute: false, solo: false }, { gainDb: 0, mute: false, solo: false }],
      sendBuses: defaultSendBuses(),
      master: { gainDb: 0, limiterOn: true },
    },
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  // The song: sections → managed Group tracks (one clip per section).
  syncSongFromSections(doc);
  doc.arrangement.filter((t) => t.songGroup !== undefined).forEach((t) => {
    t.id = `ec_${c.id}_trk_group_${t.songGroup}`;
    t.name = t.songGroup === 0 ? 'House Kit · MEKA' : `SOMA · ${ch.era}`;
  });
  // Stable ids everywhere (empty pads, patches), so two builds of a cue are identical documents.
  kit.forEach((p, i) => { if (p.empty) p.id = `ec_${c.id}_pad_${i}`; });
  for (const t of doc.arrangement) { const p = t.instrument?.patch as { id?: unknown } | undefined; if (p && 'id' in p) p.id = `${t.id}_patch`; }
  // The Session Band plays the written parts in (timing, dynamics, phrasing — same take every build).
  performDoc(doc, seedOf(`eraclash:${c.id}`), 'house');
  return doc;
}

/** A fresh, editable copy for a user: new id, their ownership, today's timestamps. */
export function eraClashProjectCopy(projectId: string, ownerId: string): GrooveDoc {
  const doc = buildEraClashGrooveDoc(projectId, ownerId);
  const now = Date.now();
  doc.id = `${doc.id}_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  doc.createdAt = now; doc.updatedAt = now;
  return doc;
}

/** Song-time facts the bounce pipeline needs (bars are 0-based; anchor = renderGroove's lead-in). */
export const ERA_CLASH_FORM = { INTRO_BARS, BODY_BARS, TAIL_BARS, TOTAL_BARS } as const;
