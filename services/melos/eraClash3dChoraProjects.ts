// Era Clash 3D campaign in Chora Studio — Chapter I, "Smoke Over the Valley" (The Falling Petal,
// Sengoku Japan c. 1570: wakō raiders burn the shore villages at dusk; Haru fights up from the beach,
// through the village, to the pagoda on the hill). Like the 2D arena cues
// (eraClashChoraProjects.ts), the project IS the cue: the game plays a bounce of exactly this document
// (eraclash-score-lab.html → scripts/games/buildEraClashAudio.ts music3d).
//
// Brief: ancient, feudal, grounded. No house kit, no four-on-the-floor, no hats/claps/shakers, no synth
// stabs, none of the Ravencrest palette (braams, trailer sub, CS-80 horns, choir pads, horror strings).
// The backbone is a taiko ensemble of SOMA physical models on MEKA Group B; the melody and colour are
// Chora instruments standing in for Japanese ones. Chora has no koto or shamisen model,
// so those roles are played by the closest physical models it does have, and every track says so:
//
//   SOMA (drums)
//     O-Daiko        nagado-daiko-odaiko      — the real thing in SOMA's catalogue (34" nagado-daiko).
//     Chu-Daiko      nagado-daiko-odaiko      — the same nagado model tuned a fifth up (A2): SOMA has
//                                               no separate mid-size nagado preset.
//     Shime-Daiko    shime-daiko-tense        — the real thing (rope-tensioned, bachi).
//     Hira-Daiko*    shamanic-cedar-beater    — APPROXIMATION: a 24" rawhide frame drum with a beater
//                                               standing in for the flat, wide hira-daiko.
//     Kotsuzumi*     talking-drum-gangan      — APPROXIMATION: an hourglass, rope-tensioned drum played
//                                               by hand (the Yoruba gangan), in the kotsuzumi's role.
//   Melody / colour
//     Shakuhachi     PNEUMA pneuma-shakuhachi — a breath model voiced as shakuhachi (bamboo, hard breath);
//                                               short, sparse phrases only, low in the mix, never above G5.
//   No drone, no pad, no reed: Kenne heard the sustained shruti drone + oboe as a whine over the song
//   (2026-11-10), so nothing in this cue holds a tone; everything is struck or plucked, or a short breath.
//     Koto*          LYRA lyra-harp           — APPROXIMATION: long-ringing plucked strings on a big
//                                               soundboard; no bridge-pressing bends.
//     Shamisen*      LYRA lyra-banjo          — APPROXIMATION: strings over a skin head, like the
//                                               shamisen's body; no sawari buzz, no bachi slap.
//
// Pitch: D in-sen (D E♭ G A C), a Japanese pentatonic in theory.ts. 108 BPM.
// Form (4-bar sections): Intro (ma) · [Call 1 · Call 2 · Battle 1 · Battle 2 · Battle 3 · Battle 4 ·
// Ma (breakdown) · Oroshi (rise)] × 2 · Tail = 72 bars. The loop is the second body (like the 2D cues).
//
// Taiko are stick drums: the parts are written out here in kuchi-shōga-like strings (one char per 16th)
// and given a player's feel by Chora's drum performer (humanizeDrumPattern); the kotsuzumi role is a
// hand drum PLAYED by the hand-drum performer (performHandDrum). The melodic parts are played in by
// the Session Band (performDoc). Live devices: the koto arp is held chords through a running ARP
// snapped to in-sen, the koto carries a Humanize note-FX, the shakuhachi an Echo, and two modulators
// move the arp's pan and the kotsuzumi's hand shape.
//
// Pure: no engine, no DOM.

import {
  defaultSendBuses, emptyPad,
  type ArrangeTrack, type GrooveDoc, type MeloNote, type NoteEvent, type PadConfig,
  type Pattern, type Scene, type SongSection, type Step, type TimelineClip,
} from './beats/grooveDoc';
import { syncSongFromSections, SCENE_COLORS } from './beats/songSections';
import { humanizeDrumPattern } from './beats/patterns/humanizeDrums';
import { performHandDrum, type HandMood, type HandRole } from './beats/patterns/handDrumPerformer';
import type { HandRhythm } from './beats/patterns/handRhythms';
import { performDoc } from './beats/patterns/performNotes';
import type { Modulator, ModTarget } from './beats/modulators';
import { defaultArpPatch, defaultStep, euclidean, type ArpPatch } from './arp';
import { strokeKey } from './instruments/soma/handMap';
import { SOMA_PRESETS } from './instruments/soma/presets';
import { newSomaPatch, serializeSomaPatch } from './instruments/soma/patch';
import {
  COLORS, V, clamp, fx, patchFor, persona, presetName, seedOf, somaName,
  type EraClashProjectInfo, type Voice,
} from './eraClashChoraProjects';

/* ── The cue ──────────────────────────────────────────────────────────────────────────────── */

export const ERA_CLASH_3D_PREFIX = 'eraclash-';
export const ERA_CLASH_3D_FORM = { INTRO_BARS: 4, BODY_BARS: 32, TAIL_BARS: 4, TOTAL_BARS: 72 } as const;

export interface Cue3d { id: string; title: string; bpm: number; tonicPc: number; scale: string; era: string; blurb: string }

export const CUES_3D: Cue3d[] = [
  {
    id: '3d-ch1', title: 'Smoke Over the Valley', bpm: 108, tonicPc: 2, scale: 'in-sen',
    era: 'Sengoku · The Falling Petal I',
    blurb: 'A taiko ensemble (O-Daiko, Chu-Daiko, Shime, hira and kotsuzumi roles) with a koto-role harp, shamisen-role banjo and sparse shakuhachi, in D in-sen. Nothing sustained.',
  },
];

/* ── Drums ────────────────────────────────────────────────────────────────────────────────── */

type Sec = 'intro' | 'call1' | 'call2' | 'bat1' | 'bat2' | 'bat3' | 'bat4' | 'ma' | 'rise' | 'tail';
const BODY: Sec[] = ['call1', 'call2', 'bat1', 'bat2', 'bat3', 'bat4', 'ma', 'rise'];
const SEC_NAME: Record<Sec, string> = {
  intro: 'Intro · Ma', call1: 'Call 1', call2: 'Call 2', bat1: 'Battle 1', bat2: 'Battle 2', bat3: 'Battle 3', bat4: 'Battle 4',
  ma: 'Ma · Breakdown', rise: 'Oroshi · Rise', tail: 'Tail',
};

interface Drum { key: 'o' | 'chu' | 'shime' | 'hira' | 'kotsu'; preset: string; label: string; gainDb: number; pan: number; note?: number; hand?: boolean }

const DRUMS: Drum[] = [
  { key: 'o', preset: 'nagado-daiko-odaiko', label: 'O-Daiko', gainDb: -3, pan: -0.08 },
  { key: 'chu', preset: 'nagado-daiko-odaiko', label: 'Chu-Daiko', gainDb: -6, pan: 0.22, note: 45 },
  { key: 'shime', preset: 'shime-daiko-tense', label: 'Shime-Daiko', gainDb: -11, pan: -0.3 },
  { key: 'hira', preset: 'shamanic-cedar-beater', label: 'Hira-Daiko role', gainDb: -7, pan: 0.05, note: 40 },
  { key: 'kotsu', preset: 'talking-drum-gangan', label: 'Kotsuzumi role', gainDb: -12, pan: 0.4, hand: true },
];

/** One char per 16th: X accent · x stroke · o soft · . ghost · - rest. Bars may be split with '|'. */
const VEL: Record<string, number> = { X: 118, x: 96, o: 72, '.': 46 };
const B = (s: string) => s.replace(/\|/g, '');
const rep = (bar: string, n = 4) => Array.from({ length: n }, () => bar).join('');

type DrumParts = Partial<Record<Drum['key'], string>> & { ramp?: [number, number] };

/** The taiko writing, section by section (64 steps = 4 bars each). */
const TAIKO: Record<Sec, DrumParts> = {
  // Ma: single strokes and long silences, an oroshi on the shime into the call.
  intro: {
    o: B('X---------------|--------o-------|X-------x-------|X-------X---X-X-'),
    hira: B('X---------------|----------------|----------------|----------------'),
    shime: B('----------------|----------------|----------------|o---o--o--o-ooxX'),
  },
  // Call and response: O-Daiko calls, Chu-Daiko answers, the shime keeps a soft jiuchi.
  call1: {
    o: B('X--X--X-X-------|----------------|X--X--X-X---X---|----------------'),
    chu: B('----------------|X--X--X-X-------|----------------|X--X--X-X-x-XX--'),
    shime: rep('o-.-o-.-o-.-o-.-'),
    hira: B('X---------------|----------------|X---------------|----------------'),
  },
  call2: {
    o: B('----------------|X--X--X-X-------|----------------|X--X--X-X--XX-XX'),
    chu: B('X--X--X-X-------|----------------|X--X-xX-X-------|X--X--X-X--XX-XX'),
    shime: B(rep('o-.-o-.-o-.-o-.-', 3) + 'x.x.x.x.xxxxXXXX'),
    hira: B('----------------|X---------------|----------------|X-------X-------'),
  },
  // Battle: driving shime kizami (3-3-2 accents), don-doko on the chu, O-Daiko accents.
  bat1: {
    shime: rep('X.x.x.X.x.x.X.x.'),
    chu: B(rep('X-xxX-x-X-xxX---', 3) + 'X-xxX-x-X-xxXxXx'),
    o: B('X-------X-----x-|X-------X-------|X-------X-----x-|X-----X-X-X-X-X-'),
    hira: B('X---------------|----------------|X---------------|--------X-------'),
  },
  bat2: {
    shime: B(rep('X.x.x.X.x.x.X.x.', 3) + 'XxXxXxXxXXXXXXXX'),
    chu: B(rep('X-xxX-x-X-xxX---', 3) + 'X-X-X-X-XXXXXXXX'),
    o: B('X---X---X---X-x-|X---X---X-x-X---|X---X---X---X-x-|X-X-X-X-XXXXXXXX'),
    hira: B('X---------------|X---------------|X---------------|X-------X-------'),
  },
  bat3: {
    shime: B(rep('X.x.X.x.X.x.X.x.', 3) + 'XxXxXxXxXxXxXXXX'),
    chu: B(rep('X-xxX-xxX-xxX-xx', 3) + 'X--X--X-X-X-XXXX'),
    o: B(rep('X--X--X-X--X--X-', 3) + 'X--X--X-X-X-XXXX'),
    hira: rep('X-------X-------'),
  },
  // Ends on one ensemble stroke, then silence: the ma before the breakdown.
  bat4: {
    shime: B(rep('X.x.X.x.X.x.X.x.', 3) + 'X---------------'),
    chu: B(rep('X-xxX-xxX-xxX-xx', 3) + 'X---------------'),
    o: B(rep('X--X--X-X--X--X-', 3) + 'X---------------'),
    hira: B(rep('X-------X-------', 3) + 'X---------------'),
  },
  ma: {
    o: B('x---------------|----------------|X---------------|----------------'),
    hira: B('o---------------|----------------|----------------|----------------'),
  },
  // Oroshi: the shime accelerates from quarters to sixteenths under one long crescendo.
  rise: {
    shime: B('x---x---x---x---|x-x-x-x-x-x-x-x-|x-xxx-xxx-xxxxxx|xxxxxxxxxxxxxxxx'),
    o: B('X---------------|X---------------|X-------X-------|X-------X---X-XX'),
    chu: B('----------------|----------------|x-x-x-x-x-x-x-x-|xxxxxxxxxxxxXXXX'),
    hira: B('X---------------|----------------|X---------------|X---------------'),
    ramp: [0.55, 1.05],
  },
  tail: {
    o: B('X---------------|----------------|----------------|----------------'),
    chu: B('X---------------|----------------|----------------|----------------'),
    shime: B('X---------------|----------------|----------------|----------------'),
    hira: B('X---------------|----------------|----------------|----------------'),
  },
};

/** Kotsuzumi role: hand-drum ideas (pon = open tone T, ta = slap S, chi = fingertip F), performed. */
const kotsuIdea = (id: string, strokes: string, about: string): HandRhythm => ({
  id, name: `Kotsuzumi role · ${id}`, tradition: 'Studio', kind: 'study', meter: '4/4', grid: 16, bars: 1,
  parts: [{ drum: 0, strokes }], bpm: 108, suits: ['west-african'], preset: 'talking-drum-gangan', about,
});
const KOTSU: Partial<Record<Sec, { r: HandRhythm; role: HandRole; mood: HandMood }>> = {
  intro: { r: kotsuIdea('ma', 'T.......S.......', 'Two strokes a bar: pon, then ta.'), role: 'adlib', mood: 'tender' },
  call1: { r: kotsuIdea('call', 'T.....S.....T...', 'Pon, ta, pon across the bar, between the calls.'), role: 'groove', mood: 'steady' },
  call2: { r: kotsuIdea('call', 'T.....S.....T...', 'Pon, ta, pon across the bar, between the calls.'), role: 'fills', mood: 'steady' },
  bat1: { r: kotsuIdea('battle', 'S...T..S..T.S...', 'Ta and pon chattering over the battle.'), role: 'groove', mood: 'intense' },
  bat2: { r: kotsuIdea('battle', 'S...T..S..T.S...', 'Ta and pon chattering over the battle.'), role: 'fills', mood: 'intense' },
  bat3: { r: kotsuIdea('battle', 'S...T..S..T.S...', 'Ta and pon chattering over the battle.'), role: 'groove', mood: 'intense' },
  ma: { r: kotsuIdea('breakdown', 'T.......S...T.T.', 'Sparse strokes in the silence.'), role: 'break', mood: 'tender' },
};

/* ── Melodic parts (D in-sen: D E♭ G A C) ─────────────────────────────────────────────────── */

type Role = 'shaku' | 'koto' | 'kotoArp' | 'shami';

const VOICES: Record<Role, Voice> = {
  shaku: V('pneuma', 'pneuma-shakuhachi', 'Shakuhachi', -12, -0.1),
  koto: V('lyra', 'lyra-harp', 'Koto role (harp model)', -6, -0.28),
  kotoArp: V('lyra', 'lyra-harp', 'Koto Arp (harp model)', -11, 0.3),
  shami: V('lyra', 'lyra-banjo', 'Shamisen role (banjo model)', -8, 0.22),
};
const ROLE_ORDER: Role[] = ['shaku', 'koto', 'kotoArp', 'shami'];

const PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name: string): number {
  const m = /^([A-G])(b|#)?(\d)$/.exec(name);
  if (!m) throw new Error(`eraClash3d: bad note ${name}`);
  return (Number(m[3]) + 1) * 12 + PCS[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
}

interface Ph { beat: number; len: number; keys: number[] }
/** "D5:1.5 Eb5:0.5 r:1 D3+A3:4" — notes (chords with +) and rests, lengths in beats, at most 16 beats. */
function phrase(src: string): Ph[] {
  const out: Ph[] = [];
  let t = 0;
  for (const tok of src.split(/\s+/).filter((x) => x && x !== '|')) {
    const [n, l] = tok.split(':');
    const len = Number(l);
    if (!(len > 0)) throw new Error(`eraClash3d: bad length in ${tok}`);
    if (n !== 'r') out.push({ beat: t, len, keys: n.split('+').map(midi) });
    t += len;
  }
  if (t > 16 + 1e-6) throw new Error(`eraClash3d: phrase longer than a section (${t} beats): ${src}`);
  return out;
}

const SHAMI_BAR = 'D3:0.5 D3:0.25 D3:0.25 Eb3:0.5 D3:0.5 r:0.5 D3:0.5 G3:0.5 A3:0.5';
const SHAMI_TURN = 'C4:0.5 A3:0.5 G3:0.5 Eb3:0.5 D3:0.5 Eb3:0.5 G3:0.5 A3:0.5';
const SHAMI_DRIVE = 'D3:0.25 D3:0.25 D3:0.5 Eb3:0.25 D3:0.25 G3:0.5 D3:0.25 D3:0.25 A3:0.5 G3:0.5 Eb3:0.5';
const ARP_CHORDS = 'D3+A3+D4+Eb4:4 C3+G3+C4+D4:4 Eb3+G3+C4+Eb4:4 A2+D3+A3+C4:4';

const PARTS: Record<Role, Partial<Record<Sec, string>>> = {
  // Short breaths between the drums: one or two little phrases per section, silence in the battles.
  shaku: {
    intro: 'r:1 D5:1.5 Eb5:0.5 D5:1 r:4 C5:1 A4:1.5 r:5.5',
    call1: 'D5:1 Eb5:0.5 G5:1 r:5.5 C5:1 D5:1.5 r:5.5',
    call2: 'r:8 Eb5:1 D5:0.5 C5:0.5 A4:1.5 r:4.5',
    ma: 'r:4 A4:1.5 G4:0.5 Eb4:1 r:5 D4:2 r:2',
    tail: 'D5:2',
  },
  koto: {
    intro: 'r:8 D3+A3:4',
    call1: 'D3:1 A3:0.5 D4:0.5 r:1 Eb4:0.5 D4:0.5 G3:1 D4:0.5 G4:0.5 r:1 A4:0.5 G4:0.5 C4:1 G4:0.5 C5:0.5 r:1 Eb5:0.5 D5:0.5 D3:1 A3:0.5 D4:0.5 A4:2',
    call2: 'A3:1 Eb4:0.5 A4:0.5 r:1 C5:0.5 A4:0.5 G3:1 D4:0.5 G4:0.5 r:1 Eb4:0.5 D4:0.5 C4:1 G4:0.5 C5:0.5 r:1 A4:0.5 G4:0.5 D3:1 A3:0.5 D4:0.5 r:2',
    ma: 'D4:1 r:0.5 Eb4:0.5 G4:2 A4:1 C5:1 A4:2 G4:1 Eb4:1 D4:2 D3+A3:4',
    rise: 'r:14.5 D3:0.125 Eb3:0.125 G3:0.125 A3:0.125 C4:0.125 D4:0.125 Eb4:0.125 G4:0.125 A4:0.125 C5:0.125 D5:0.25',
    tail: 'D3+A3+D4:8',
  },
  kotoArp: { bat1: ARP_CHORDS, bat2: ARP_CHORDS, bat3: ARP_CHORDS, bat4: 'D3+A3+D4+Eb4:4 C3+G3+C4+D4:4 Eb3+G3+C4+Eb4:4 A2+D3+A3+C4:1' },
  shami: {
    call2: 'r:12 D3:0.5 D3:0.5 Eb3:0.5 G3:0.5 A3:0.5 C4:0.5 D4:1',
    bat1: `${SHAMI_BAR} ${SHAMI_BAR} ${SHAMI_BAR} ${SHAMI_TURN}`,
    bat2: `${SHAMI_BAR} ${SHAMI_BAR} ${SHAMI_BAR} ${SHAMI_TURN}`,
    bat3: `${SHAMI_DRIVE} ${SHAMI_DRIVE} ${SHAMI_DRIVE} ${SHAMI_TURN}`,
    bat4: `${SHAMI_DRIVE} ${SHAMI_DRIVE} ${SHAMI_DRIVE} D3+A3:1`,
    rise: `D3:0.5 r:1.5 D3:0.5 r:1.5 ${'D3:0.5 r:0.5 '.repeat(4)}${'D3:0.5 '.repeat(8)}${'D3:0.25 '.repeat(12)}Eb3:0.5 G3:0.5`,
  },
};

/** Section dynamics for the melodic parts (the rise is a crescendo). */
const DYN: Record<Sec, number> = { intro: 70, call1: 84, call2: 90, bat1: 100, bat2: 106, bat3: 112, bat4: 114, ma: 64, rise: 70, tail: 80 };

/* ── Form ─────────────────────────────────────────────────────────────────────────────────── */

interface Span { sec: Sec; name: string; bar: number; bars: number }

export function eraClash3dForm(): Span[] {
  const out: Span[] = [{ sec: 'intro', name: SEC_NAME.intro, bar: 0, bars: 4 }];
  for (let pass = 0; pass < 2; pass++) {
    BODY.forEach((sec, i) => out.push({ sec, name: pass ? `${SEC_NAME[sec]} (loop)` : SEC_NAME[sec], bar: 4 + pass * 32 + i * 4, bars: 4 }));
  }
  out.push({ sec: 'tail', name: SEC_NAME.tail, bar: 68, bars: 4 });
  return out;
}

/* ── Catalogue ────────────────────────────────────────────────────────────────────────────── */

export function eraClash3dProjects(): EraClashProjectInfo[] {
  return CUES_3D.map((c) => ({
    id: ERA_CLASH_3D_PREFIX + c.id, cueId: c.id, title: `Era Clash 3D — ${c.title}`, era: c.era, blurb: c.blurb, bpm: c.bpm,
    key: 'D in-sen', bars: ERA_CLASH_3D_FORM.TOTAL_BARS, durationSec: Math.round(ERA_CLASH_3D_FORM.TOTAL_BARS * 4 * 60 / c.bpm),
    soma: DRUMS.map((d) => `${d.label} (${somaName(d.preset)})`),
    instruments: ROLE_ORDER.map((r) => `${VOICES[r].type.toUpperCase()} ${presetName(VOICES[r])} as ${VOICES[r].label}`),
  }));
}

export const isEraClash3dProjectId = (id: unknown): id is string =>
  typeof id === 'string' && CUES_3D.some((c) => ERA_CLASH_3D_PREFIX + c.id === id);

/* ── Building blocks ──────────────────────────────────────────────────────────────────────── */

interface SomaPad { drum: Drum; padIdx: number; trackId: string; homeNote: number }

function somaTracks(tag: string, drums: Drum[], kit: PadConfig[], arrangement: ArrangeTrack[]): SomaPad[] {
  return drums.map((d, i) => {
    const padIdx = 16 + i;
    const preset = SOMA_PRESETS.find((p) => p.id === d.preset)!;
    const patch = { ...newSomaPatch(preset), id: `${tag}_soma_${i}`, hand: { enabled: !!d.hand, layout: 'keys' as const } };
    const home = d.hand ? Math.floor(preset.defaultNote / 12) * 12 : d.note ?? preset.defaultNote;
    const trackId = `${tag}_trk_soma_${i}`;
    arrangement.push({
      id: trackId, kind: 'instrument', name: `${d.label} · SOMA`, color: COLORS.soma, mute: false, solo: false,
      gainDb: d.gainDb, pan: d.pan, clips: [], padOwned: true, padIndex: padIdx, armed: false, position: [d.pan, 0, -1],
      instrument: { type: 'soma', patch: serializeSomaPatch(patch), presetName: preset.name },
    });
    Object.assign(kit[padIdx], {
      id: `${tag}_pad_soma_${i}`, name: d.label.slice(0, 18), color: COLORS.soma, empty: false,
      source: 'instrument', instrumentTrackId: trackId, instrumentNote: home, group: 1, choke: 0,
    } satisfies Partial<PadConfig>);
    return { drum: d, padIdx, trackId, homeNote: home };
  });
}

function stickRow(s: string, ramp?: [number, number]): Record<number, Step> {
  const out: Record<number, Step> = {};
  for (let i = 0; i < Math.min(64, s.length); i++) {
    const v = VEL[s[i]];
    if (!v) continue;
    const r = ramp ? ramp[0] + (ramp[1] - ramp[0]) * (i / 63) : 1;
    out[i] = { v: Math.round(clamp(v * r, 20, 127)) };
  }
  return out;
}

function kotsuLane(pad: SomaPad, sec: Sec, cueId: string): Record<number, MeloNote[]> | null {
  const k = KOTSU[sec];
  if (!k) return null;
  const perf = performHandDrum({ rhythm: k.r, persona: persona('amara', 'shaker'), mood: k.mood, role: k.role, bars: 4, seed: seedOf(`${cueId}:kotsu:${sec}`) });
  const lane: Record<number, MeloNote[]> = {};
  for (const s of perf.strokes) {
    const n: MeloNote = { semi: clamp(strokeKey(s.stroke, s.hand) + 12 * s.drum, -24, 24), v: s.vel, len: 1 };
    if (s.micro) n.micro = s.micro;
    (lane[s.step] ??= []).push(n);
  }
  return lane;
}

function taikoPattern(cueId: string, pads: SomaPad[], sec: Sec): Pattern {
  const id = `ec3_${cueId}_pat_B_${sec}`, name = `Taiko · ${SEC_NAME[sec]}`;
  const parts = TAIKO[sec];
  const steps: Pattern['steps'] = {};
  const melo: NonNullable<Pattern['melo']> = {};
  for (const p of pads) {
    if (p.drum.hand) { const lane = kotsuLane(p, sec, cueId); if (lane && Object.keys(lane).length) melo[p.padIdx] = lane; continue; }
    const s = parts[p.drum.key];
    if (!s) continue;
    const row = stickRow(s, parts.ramp);
    if (Object.keys(row).length) steps[p.padIdx] = row;
  }
  // Feel only (no fills): an ensemble's push and scatter, the writing stays as written.
  const felt = humanizeDrumPattern({ id, name, length: 64, steps }, persona('marcus', 'thunder'), seedOf(`${cueId}:feel:${sec}`), 1, false);
  return { id, name, length: 64, steps: felt.steps, melo, groupIdx: 1 };
}

function partNotes(role: Role, form: Span[]): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const s of form) {
    const src = PARTS[role][s.sec];
    if (!src) continue;
    for (const ph of phrase(src)) {
      const at = s.bar * 4 + ph.beat;
      const base = s.sec === 'rise' ? 66 + 50 * (ph.beat / 16) : DYN[s.sec];
      const accent = Math.abs(ph.beat % 4) < 1e-6 ? 8 : Math.abs(ph.beat % 1) < 1e-6 ? 3 : 0;
      for (const key of ph.keys) out.push({ id: '', startBeats: at, lengthBeats: ph.len, key, vel: Math.round(clamp(base + accent, 30, 127)) });
    }
  }
  return out;
}

function clipsFor(trackId: string, notes: NoteEvent[], form: Span[], color: string): TimelineClip[] {
  const clips: TimelineClip[] = [];
  for (const s of form) {
    const start = s.bar * 4, end = (s.bar + s.bars) * 4;
    const inside = notes.filter((n) => n.startBeats >= start - 1e-6 && n.startBeats < end - 1e-6);
    if (!inside.length) continue;
    clips.push({
      id: `${trackId}_${s.bar}`, name: s.name, startBeats: start, lengthBeats: end - start, color,
      notes: inside.map((n, i) => ({ ...n, id: `${trackId}_${s.bar}_${i}`, startBeats: +(n.startBeats - start).toFixed(4), lengthBeats: Math.max(0.0625, Math.min(n.lengthBeats, end - n.startBeats)) })),
    });
  }
  return clips;
}

function arpFor(c: Cue3d): ArpPatch {
  const acc = euclidean(16, 5, 0);
  return {
    ...defaultArpPatch(), enabled: true, order: 'upDownInclusive', rate: 4, octaves: 1, gate: 0.5, length: 16,
    steps: acc.map((on) => ({ ...defaultStep(), velocity: on ? 110 : 72 })),
    scale: { rootPc: c.tonicPc, scaleId: c.scale, enabled: true },
    seed: seedOf(`${c.id}:arp`),
  };
}

function modulator(id: string, label: string, target: ModTarget, min: number, max: number, wave: string, syncBeats: number, randomness = 0): Modulator {
  return { id, on: true, label, target, min, max, wave, syncBeats, rateHz: 0.5, phase: 0, probability: 1, rest: 0.5, randomness, curve: 'linear', curveAmt: 0.5, seed: seedOf(id) };
}

function finish(doc: GrooveDoc, tag: string, groupName: string): GrooveDoc {
  syncSongFromSections(doc);
  doc.arrangement.filter((t) => t.songGroup !== undefined).forEach((t) => { t.id = `${tag}_trk_group_${t.songGroup}`; t.name = groupName; });
  doc.kit.forEach((p, i) => { if (p.empty) p.id = `${tag}_pad_${i}`; });
  for (const t of doc.arrangement) { const p = t.instrument?.patch as { id?: unknown } | undefined; if (p && 'id' in p) p.id = `${t.id}_patch`; }
  return doc;
}

function shell(id: string, name: string, ownerId: string, bpm: number, key: GrooveDoc['key'], kit: PadConfig[], groupName: string): GrooveDoc {
  const now = Date.now();
  return {
    id, name, ownerId, bpm, swing: 0, key, kit, patterns: [], scenes: [], sections: [],
    groupMeta: [{ name: 'Group A (empty: no kit in this cue)', color: '#555555' }, { name: groupName, color: COLORS.soma }],
    modulators: [], arrangement: [],
    mixer: {
      groups: [0, 1, 2, 3].map(() => ({ gainDb: 0, mute: false, solo: false })),
      sendBuses: defaultSendBuses(),
      master: { gainDb: 0, limiterOn: true },
    },
    version: 1, createdAt: now, updatedAt: now,
  };
}

/* ── The project ──────────────────────────────────────────────────────────────────────────── */

export function buildEraClash3dGrooveDoc(cueOrProjectId: string, ownerId = 'eraclash-showcase'): GrooveDoc {
  const cueId = cueOrProjectId.startsWith(ERA_CLASH_3D_PREFIX) ? cueOrProjectId.slice(ERA_CLASH_3D_PREFIX.length) : cueOrProjectId;
  const c = CUES_3D.find((x) => x.id === cueId);
  if (!c) throw new Error(`Unknown Era Clash 3D cue: ${cueOrProjectId}`);
  const tag = `ec3_${c.id.replace(/[^a-z0-9]/gi, '')}`;
  const form = eraClash3dForm();
  const groupName = 'SOMA · Taiko ensemble';
  const kit = Array.from({ length: 32 }, (_, i) => emptyPad(i));
  const doc = shell(`eraclash_${c.id}`, `Era Clash 3D · ${c.title}`, ownerId, c.bpm, { tonic: c.tonicPc, scale: c.scale }, kit, groupName);

  doc.loop = { on: true, startBeats: ERA_CLASH_3D_FORM.INTRO_BARS * 4, endBeats: (ERA_CLASH_3D_FORM.INTRO_BARS + ERA_CLASH_3D_FORM.BODY_BARS) * 4 };
  const pads = somaTracks(tag, DRUMS, kit, doc.arrangement);
  const secs: Sec[] = ['intro', ...BODY, 'tail'];
  secs.forEach((sec, i) => {
    const pb = taikoPattern(c.id, pads, sec);
    doc.patterns.push(pb);
    doc.scenes.push({ id: `${tag}_scene_${sec}`, name: SEC_NAME[sec], color: SCENE_COLORS[i % SCENE_COLORS.length], slots: { 1: pb.id } } satisfies Scene);
  });
  doc.sections = form.map((s): SongSection => ({ id: `${tag}_sec_${s.bar}`, sceneId: `${tag}_scene_${s.sec}`, bars: s.bars, name: s.name }));

  for (const role of ROLE_ORDER) {
    const v = VOICES[role];
    const notes = partNotes(role, form);
    if (!notes.length) continue;
    const trackId = `${tag}_trk_${role}`;
    const color = COLORS[v.type];
    const t: ArrangeTrack = {
      id: trackId, kind: 'instrument', name: `${v.label} · ${v.type.toUpperCase()}`, color, mute: false, solo: false,
      gainDb: v.gainDb, pan: v.pan, clips: clipsFor(trackId, notes, form, color), armed: role === 'shaku', position: [v.pan, 0.1, -0.9],
      instrument: { type: v.type, patch: patchFor(v), presetName: presetName(v) },
    };
    if (role === 'kotoArp') t.instrument!.arp = arpFor(c) as unknown as Record<string, unknown>;
    if (role === 'koto') t.instrument!.noteFx = [fx('humanize', `${tag}_nfx_koto`, { timing: 0.012, vel: 10, len: 0.1 })];
    doc.arrangement.push(t);
  }

  const kotsu = pads.find((p) => p.drum.hand)!;
  doc.modulators = [
    modulator(`${tag}_mod_arp`, 'Pan — Koto Arp', { kind: 'track', trackId: `${tag}_trk_kotoArp`, target: { kind: 'pan' } }, -0.5, 0.5, 'sine', 8),
    modulator(`${tag}_mod_hand`, 'Hand shape — Kotsuzumi role', { kind: 'track', trackId: kotsu.trackId, target: { kind: 'mod-wheel' } }, 0.3, 0.9, 'sh', 1, 0.3),
  ];
  finish(doc, tag, groupName);
  performDoc(doc, seedOf(`eraclash3d:${c.id}`), 'cinematic');
  return doc;
}

export function eraClash3dProjectCopy(projectId: string, ownerId: string): GrooveDoc {
  const doc = buildEraClash3dGrooveDoc(projectId, ownerId);
  const now = Date.now();
  doc.id = `${doc.id}_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  doc.createdAt = now; doc.updatedAt = now;
  return doc;
}

/* ── Stingers (same SOMA ensemble, rendered by the same lab) ──────────────────────────────── */

export const ERA_CLASH_3D_STINGERS = ['taikoWin', 'taikoWave'] as const;
export type Stinger3d = typeof ERA_CLASH_3D_STINGERS[number];

/**
 * taikoWin — an O-Daiko roll (alternating hands, growing), the full ensemble's strike, a shime
 * flourish, one last don. taikoWave — two O-Daiko strokes with the hira role under the second.
 * 120 BPM, so a 16th is 125 ms.
 */
export function buildEraClash3dStingerDoc(id: Stinger3d): GrooveDoc {
  const tag = `ec3_sting_${id}`;
  const kit = Array.from({ length: 32 }, (_, i) => emptyPad(i));
  const doc = shell(`eraclash_sting_${id}`, `Era Clash 3D · ${id}`, 'eraclash-showcase', 120, { tonic: 2, scale: 'in-sen' }, kit, 'SOMA · Taiko stinger');
  const drums = DRUMS.filter((d) => !d.hand);
  const pads = somaTracks(tag, drums, kit, doc.arrangement);
  const pad = (k: Drum['key']) => pads.find((p) => p.drum.key === k)!.padIdx;
  const steps: Pattern['steps'] = {};
  const hit = (k: Drum['key'], s: number, v: number, micro = 0) => { (steps[pad(k)] ??= {})[s] = { v: Math.round(clamp(v, 20, 127)), ...(micro ? { micro } : {}) }; };
  if (id === 'taikoWin') {
    // Roll: 16ths over two bars' worth of beats 0–4 (2 s), alternating O-Daiko and Chu, crescendo.
    for (let s = 0; s < 16; s++) {
      // Starts near a whisper: the drums' long tails pile up, so the written crescendo is steep.
      const v = 26 + 66 * (s / 15) ** 1.6;
      hit(s % 2 ? 'chu' : 'o', s, v, s % 2 ? 0.04 : -0.02);
      if (s >= 8) hit('shime', s, 34 + 54 * ((s - 8) / 7));
    }
    // The strike (beat 4), the shime flourish (tsu-ku tsu-ku), the last don (beat 6).
    for (const k of ['o', 'chu', 'hira', 'shime'] as const) hit(k, 16, 127);
    for (const [s, v] of [[20, 70], [21, 82], [22, 94], [23, 110]] as const) hit('shime', s, v);
    for (const k of ['o', 'chu', 'hira'] as const) hit(k, 24, 120);
    hit('shime', 24, 118);
  } else {
    hit('o', 0, 112); hit('o', 4, 127); hit('hira', 4, 118); hit('chu', 4, 96);
  }
  const p: Pattern = { id: `${tag}_pat`, name: id, length: 32, steps, groupIdx: 1 };
  doc.patterns.push(p);
  doc.scenes.push({ id: `${tag}_scene`, name: id, color: SCENE_COLORS[0], slots: { 1: p.id } });
  doc.sections = [{ id: `${tag}_sec`, sceneId: `${tag}_scene`, bars: 2, name: id }];
  return finish(doc, tag, 'SOMA · Taiko stinger');
}
