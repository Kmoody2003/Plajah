// Melos Beats — the groove document.
// One serializable object is the whole project: the Machine, Glass and Timeline views are three
// renderings of this document, and the engine is rebuilt from it on every full reload (dev runs
// with hmr:false, so nothing may live only in module state). Maps 1:1 onto .dawproject
// (pad → Track/Channel, Pattern → Clip of Notes, ArrangeTrack → Lanes) and drops verbatim into
// the blueprint's melosProductions/{prodId}/grooves/{grooveId} (docs/PLAJAH_MELOS_BLUEPRINT.md §7b).

export type PadFilterType = 'off' | 'lowpass' | 'highpass';
export type VelCurve = 'linear' | 'soft' | 'hard';
export type SynthVoiceId = 'kick' | 'snare' | 'hat-closed' | 'hat-open' | 'clap' | 'sub';

export interface SampleRef {
  key: string;          // content-addressed OPFS key: melos/beats/samples/{sha256}
  name: string;
  durationSec: number;
  lockerUrl?: string;   // durable copy in the private locker — re-hydrates an OPFS miss
}

export interface PadConfig {
  id: string;
  name: string;
  color: string;
  source: 'sample' | 'synth' | 'instrument';
  sample: SampleRef | null;
  synthVoice?: SynthVoiceId;
  // source 'instrument' — the pad plays a full ONDA/KERA instrument instead of a one-shot. It
  // references a `padOwned` ArrangeTrack (so every instrument surface — the editor panels, the
  // arp, patch persistence, offline render — is reused verbatim rather than forked onto the pad).
  // The pad plays `instrumentNote` (+ its own pitchSemis + any drawn note offset) as a MIDI note.
  instrumentTrackId?: string;
  instrumentNote?: number;      // base MIDI note the pad triggers (default 60 = C4)
  group: 0 | 1 | 2 | 3;         // bus A–D
  choke: number;                // 0 = none, 1–8 = choke group (open/closed hat pairs etc.)
  mute?: boolean;               // per-channel mute (FL rack style) — scheduler skips, live hits too
  // A greyed placeholder in a Maschine "Group" (bank of 16) — no sound yet. The scheduler and live
  // hits skip it; the pad grid shows it dimmed; adding an instrument fills the first empty pad.
  empty?: boolean;
  gainDb: number;
  pan: number;                  // -1..1
  pitchSemis: number;           // -24..24, via playbackRate — no timestretch in P1
  startSec: number;             // sample start offset
  // AHDSR-lite: decay lands on sustain×peak; sustain HOLDS while the pad is pressed (live) or
  // until the next active step on the same pad (sequenced, legato/303-style gate); release
  // shapes the tail. sustain 0 = one-shot AHD, the classic drum-machine behavior.
  env: { attackMs: number; holdMs: number; decayMs: number; sustain: number; releaseMs: number };
  filter: { type: PadFilterType; cutoff: number; q: number };
  velCurve: VelCurve;
  nks?: { previewPath?: string; uuid?: string }; // provenance when loaded from the NKS browser
  // Provenance when the sound came from the Melos Samples room. The clearance status rides
  // along so an uncleared sample is visible ON THE PAD — you find out before you build a
  // track on it, not at release time. Refreshed from the live Samples room on every render.
  melos?: { sampleId: string; title: string; clearance: string };
  // Mixer channel: this pad's own insert chain + aux sends (Bitwig/Studio One parity — every
  // channel, not just the buses). Loosely serialized like the other engine-agnostic fields.
  inserts?: FxInstance[];
  sends?: number[];  // level per send bus
  // Step Effects (Glass): a small bounded set of per-pad "step FX" slots. A step references one
  // by index (Step.fx); a slot is a device chain + optional send routing that the step's voice
  // runs through. Bounded (not per-unique-step) so the graph stays cheap. The mixer's per-pad
  // Step-FX switch (`stepFxOn`) master-bypasses them.
  stepFx?: StepFxSlot[];
  stepFxOn?: boolean;   // mixer master switch for this pad's step effects (default on)
}

/** One step-effect slot: a named device chain + a send-bus target, assignable to steps. */
export interface StepFxSlot {
  id: string;
  name: string;
  chain: FxInstance[];      // the inline effects the step's voice runs through
  sendBus?: number;         // route this step to send bus index (in addition to dry), or undefined
  sendLevel?: number;       // 0..1.5
}

export interface Step {
  v: number;      // velocity 1–127
  p?: number;     // probability 0..1 (default 1)
  micro?: number; // -0.5..0.5 of a step — humanization / imported-note residual
  // FL-style per-step performance (Glass graph editor). All optional so old patterns stay valid.
  pitch?: number; // -24..24 semitones, added to the pad's tuning for this hit only
  pan?: number;   // -1..1 pan for this hit only (overrides the pad's pan)
  /** Step Effects: index into the pad's stepFx slots (feature 2), or undefined = dry. */
  fx?: number;
}

// A drawn note in the pitch roll: semitone offset from the pad's own tuning, velocity, and
// length in steps (gates the AHDSR envelope — this is how basslines/melodies hold and release).
export interface MeloNote {
  semi: number;   // -24..24 relative to the pad's base pitch
  v: number;      // 1–127
  len: number;    // in 16th steps, >= 1
}

export interface Pattern {
  id: string;
  name: string;
  length: 16 | 32 | 48 | 64;                       // 16th-note grid
  steps: Record<number, Record<number, Step>>;     // sparse: padIdx → stepIdx → Step
  // Pitch-roll lane per pad: padIdx → stepIdx → chord (multiple notes allowed per step).
  // Coexists with the drum row — a pad can have both hits and drawn notes.
  melo?: Record<number, Record<number, MeloNote[]>>;
}

// The arrangement is the single timeline truth: Glass's Sequence strip renders it compactly,
// the Timeline view (Bitwig/S1 arranger paradigm) edits it in full, and .dawproject import
// lands every foreign track here — nothing is dropped for being "track 17+".
/**
 * A note on an instrument track. Absolute pitch (unlike the pads' `MeloNote`, which is an offset
 * from the pad's tuning) because an instrument track IS a keyboard instrument.
 *
 * ONE note list, three editors: the piano roll edits it freely, the step grid renders it
 * quantized to 16ths, and the timeline draws it as a clip. Same data — no conversion, no drift.
 */
export type OrchestralArticulation =
  | 'legato'
  | 'spiccato'
  | 'staccato'
  | 'marcato'
  | 'tremolo'
  | 'pizzicato'
  | 'sul-ponticello'
  | 'sul-tasto'
  | 'con-sordino'
  | 'portamento'
  | 'flutter-tongue'
  | 'sfz-hairpin';

export type MpeSwellShape =
  | 'sustained'
  | 'hairpin'
  | 'crescendo'
  | 'decrescendo'
  | 'sfz-swell'
  | 'arch';

export interface MpeCurvePoint {
  /** Normalized position within the note duration (0..1) */
  t: number;
  /** MPE Pitch Bend offset in semitones (-24..+24) or normalized (-1..+1) */
  bend?: number;
  /** MPE Pressure / CC11 Expression swell (0..1) */
  pressure?: number;
  /** MPE Timbre / CC74 Harmonic Brightness (0..1) */
  timbre?: number;
}

export interface NoteMpeExpression {
  /** Static or initial MPE pitch bend (-1..1 or semitone offset) */
  bend?: number;
  /** Peak or target MPE pressure / CC11 expression (0..1) */
  pressure?: number;
  /** MPE timbre / CC74 brightness (0..1) */
  timbre?: number;
  /** Continuous dynamic swell envelope shape across the note's duration */
  swellShape?: MpeSwellShape;
  /** Progressive vibrato depth in semitones (0..0.65, typical orchestral string/wind is 0.14..0.32) */
  vibratoDepth?: number;
  /** Vibrato LFO rate in Hz (default ~5.4 Hz for strings/soloists) */
  vibratoRateHz?: number;
  /** Normalized delay (0..0.7) before vibrato blooms on a sustained note */
  vibratoDelay01?: number;
  /** Initial portamento / legato pitch-glide offset in semitones (e.g. -2 glides up 2 semitones into the note) */
  glideFromSemis?: number;
  /** Duration of the portamento glide as a fraction of the note (0.05..0.5) */
  glidePortion01?: number;
  /** Bow rosin / breath airiness transient intensity (0..1) */
  bowBreath01?: number;
  /** Multi-point MPE curve nodes for custom drawn expression automation */
  curvePoints?: MpeCurvePoint[];
}

export interface NoteEvent {
  id: string;
  startBeats: number;   // relative to the clip start
  lengthBeats: number;
  key: number;          // MIDI note number
  vel: number;          // 1–127
  /** Orchestral performance articulation (legato, spiccato, tremolo, pizzicato, marcato, etc.) */
  articulation?: OrchestralArticulation;
  /** MPE per-note continuous expression, swell curves, vibrato, and portamento glide. */
  expr?: NoteMpeExpression;
}

export type TrackAutomationTarget =
  | 'cc1-modwheel'
  | 'cc11-expression'
  | 'cc74-timbre'
  | 'cc64-sustain'
  | 'tempo-rubato';

export interface AutomationPoint {
  beat: number;
  value: number; // 0..1 (or BPM multiplier 0.75..1.35 for tempo-rubato)
  curve?: 'linear' | 'smooth' | 'exp';
}

export interface TrackAutomationLane {
  id: string;
  target: TrackAutomationTarget;
  label: string;
  points: AutomationPoint[];
}

export interface FilmScoreSectionMarker {
  id: string;
  romanNumeral: string;
  title: string;
  dramaticCue: string;
  startBeats: number;
  lengthBeats: number;
  dynamicMarking: 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff' | 'sfz';
  tempoBpm?: number;
  keySignature?: string;
  generativeModel?: string;
  color: string;
}

/**
 * Evaluates a note's continuous MPE expression (`bend`, `pressure`, `timbre`, `gainMultiplier`, `vibratoSemis`)
 * at normalized progress `progress01` (0..1) and elapsed time `elapsedSec` within the note.
 */
export function evaluateNoteMpeAtProgress(
  note: NoteEvent,
  progress01: number,
  elapsedSec: number,
): {
  bend: number;
  pressure: number;
  timbre: number;
  gainMultiplier: number;
  pitchOffsetSemis: number;
} {
  const p = Math.max(0, Math.min(1, progress01));
  const expr = note.expr;
  const art = note.articulation ?? 'legato';

  const basePressure = expr?.pressure ?? Math.min(1, Math.max(0.25, note.vel / 127));
  const baseTimbre = expr?.timbre ?? (art === 'sul-ponticello' ? 0.88 : art === 'con-sordino' || art === 'sul-tasto' ? 0.34 : 0.62);
  const baseBend = expr?.bend ?? 0;

  // 1. Evaluate dynamic swell envelope
  const shape: MpeSwellShape =
    expr?.swellShape ??
    (art === 'sfz-hairpin'
      ? 'sfz-swell'
      : art === 'spiccato' || art === 'staccato' || art === 'pizzicato'
        ? 'decrescendo'
        : note.lengthBeats >= 2.5
          ? 'hairpin'
          : 'arch');

  let swellEnv = 1.0;
  if (shape === 'hairpin') {
    // Expressive orchestral hairpin (< >): starts at 45%, swells to 118% at 58% of the note, tapers to 55%
    const peakPos = 0.58;
    const arch = p <= peakPos ? p / peakPos : 1 - (p - peakPos) / (1 - peakPos);
    swellEnv = 0.45 + 0.73 * Math.sin(arch * Math.PI * 0.5);
  } else if (shape === 'crescendo') {
    swellEnv = 0.38 + 0.78 * Math.pow(p, 1.25);
  } else if (shape === 'decrescendo') {
    swellEnv = (1 - Math.exp(-elapsedSec * 90)) * Math.pow(Math.max(0.05, 1 - p), 1.4);
  } else if (shape === 'sfz-swell') {
    // Immediate sforzando bite followed by dramatic drop and secondary crescendo
    const bite = Math.exp(-p * 9) * 0.65;
    const build = Math.pow(p, 1.6) * 0.85;
    swellEnv = Math.min(1.25, 0.35 + bite + build);
  } else if (shape === 'arch') {
    swellEnv = 0.68 + 0.38 * Math.sin(p * Math.PI);
  }

  // 2. Apply custom multi-point MPE curve if drawn in Piano Roll
  let customPressure = basePressure * swellEnv;
  let customTimbre = Math.min(1, Math.max(0.08, baseTimbre * (0.75 + 0.35 * swellEnv)));
  let customBend = baseBend;

  if (expr?.curvePoints && expr.curvePoints.length >= 2) {
    const pts = expr.curvePoints;
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].t < p) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const span = Math.max(0.0001, b.t - a.t);
    const frac = Math.max(0, Math.min(1, (p - a.t) / span));
    if (a.pressure !== undefined && b.pressure !== undefined) {
      customPressure = a.pressure + (b.pressure - a.pressure) * frac;
      swellEnv = 0.35 + customPressure * 0.85;
    }
    if (a.timbre !== undefined && b.timbre !== undefined) {
      customTimbre = a.timbre + (b.timbre - a.timbre) * frac;
    }
    if (a.bend !== undefined && b.bend !== undefined) {
      customBend = a.bend + (b.bend - a.bend) * frac;
    }
  }

  // 3. Articulation modulation (bow tremolo, flutter-tongue, marcato punch)
  if (art === 'tremolo') {
    // 11.5 Hz bow tremolo modulation
    swellEnv *= 0.76 + 0.28 * Math.sin(2 * Math.PI * 11.5 * elapsedSec);
  } else if (art === 'flutter-tongue') {
    swellEnv *= 0.82 + 0.22 * Math.sin(2 * Math.PI * 16.0 * elapsedSec);
  } else if (art === 'marcato') {
    swellEnv *= 1.0 + 0.28 * Math.exp(-elapsedSec * 12);
  }

  // 4. Progressive vibrato + legato portamento glide
  const vibDelay = expr?.vibratoDelay01 ?? 0.22;
  const vibRate = expr?.vibratoRateHz ?? 5.4;
  const vibDepth =
    expr?.vibratoDepth ??
    (art === 'pizzicato' || art === 'spiccato' || art === 'staccato'
      ? 0
      : note.lengthBeats >= 1.5
        ? 0.18
        : 0.06);
  const vibRamp = p > vibDelay ? Math.min(1, (p - vibDelay) / Math.max(0.1, 0.55 - vibDelay)) : 0;
  const vibratoSemis = vibDepth * vibRamp * Math.sin(2 * Math.PI * vibRate * elapsedSec);

  let glideSemis = 0;
  if (expr?.glideFromSemis && Math.abs(expr.glideFromSemis) > 0.01) {
    const glidePortion = Math.max(0.05, Math.min(0.65, expr.glidePortion01 ?? 0.24));
    if (p < glidePortion) {
      const gFrac = 1 - p / glidePortion;
      glideSemis = expr.glideFromSemis * gFrac * gFrac;
    }
  }

  const pitchOffsetSemis = customBend + glideSemis + vibratoSemis;

  return {
    bend: Math.max(-1, Math.min(1, pitchOffsetSemis / 2)),
    pressure: Math.max(0.05, Math.min(1, customPressure)),
    timbre: Math.max(0.05, Math.min(1, customTimbre)),
    gainMultiplier: Math.max(0.1, Math.min(1.45, swellEnv)),
    pitchOffsetSemis,
  };
}

export interface TimelineClip {
  id: string;
  startBeats: number;
  lengthBeats: number;
  /** Optional clip-local color. Unset clips inherit their track color. */
  color?: string;
  /** Optional clip title / film cue section label */
  name?: string;
  patternId?: string;                              // kind 'pattern'
  /** kind 'pattern' — per-pad loop-length override IN 16th STEPS inside this clip. MEKA's
   *  pattern length is the default; a pad listed here loops its own shorter cycle instead
   *  (independent per-track clip lengths, Bitwig-style polymeter). */
  padLens?: Record<number, number>;
  /** kind 'instrument' — a MIDI clip with MPE per-note expression and articulations. */
  notes?: NoteEvent[];
  /** Optional CC & MPE automation lanes attached to this clip */
  automationLanes?: TrackAutomationLane[];
  /** Optional generative model badge that created or hybrid-layered this clip (e.g. 'ace-step-2.5', 'yue2') */
  generativeEngine?: string;
  audio?: { sampleKey: string; name: string; offsetSec: number; gainDb: number;
            durationSec: number; stretch?: number /* simple linear rate only */;
            /** Durable private-locker fallback for reopening on another device. */
            lockerUrl?: string;
            /** Downsampled channel peak envelope used by every timeline renderer. */
            peaks?: number[]; detectedBpm?: number;
            /** Optional generative model provenance for ACE-Step 2.5 / YuE2 / HeartMuLa stems */
            generativeEngine?: string;
            stemPrompt?: string };
}


/** The meditation suite (vela/cantus/ison/pneuma) shares one engine and one editor; they are
 *  separate types because they are separate instruments — different purpose, different preset
 *  bank, different thing you reach for. See instruments/vela/suite.ts. */
export type InstrumentType = 'onda' | 'kera' | 'vela' | 'cantus' | 'ison' | 'pneuma' | 'bajo' | 'aura' | 'soma';

export interface TrackInstrument {
  type: InstrumentType;
  /** Serialized patch — an OndaPatch today; typed loosely here so grooveDoc stays engine-agnostic. */
  patch: Record<string, unknown>;
  presetName?: string;
  /** Serialized ArpPatch. Loosely typed for the same reason as `patch`. */
  arp?: Record<string, unknown>;
  /** type 'kera' — a SerializedKeraProgram: zones + amp + sample refs (PCM lives in the owner's
   *  OPFS/locker, not in this doc). Loosely typed so grooveDoc stays engine-agnostic. */
  kera?: Record<string, unknown>;
}

export interface ArrangeTrack {
  id: string;
  kind: 'pattern' | 'audio' | 'instrument';
  name: string;
  color: string;
  mute: boolean;
  solo: boolean;
  gainDb: number;
  pan: number;
  clips: TimelineClip[];
  /** kind 'instrument' — the sound this track plays. */
  instrument?: TrackInstrument;
  /** Armed for live play and recording. Only one track is armed at a time. */
  armed?: boolean;
  /** Spatial source position — the engine pans from this, stereo is just one rendering. */
  position?: [number, number, number];
  // Created to back a pad's `source:'instrument'` — driven by the pad sequencer, not by clips, so
  // it's hidden from the arranger and skipped by song-mode clip scheduling. `padIndex` is the pad
  // it belongs to (its notes come from that pad's steps).
  padOwned?: boolean;
  padIndex?: number;
  foreign?: { trackXml: string }; // imported .dawproject track we render but don't fully model
  // Mixer channel: this track's own insert chain + aux sends.
  inserts?: FxInstance[];
  sends?: number[];
  /** Optional DAW folder hierarchy. Folder tracks contain no clips and collapse their children. */
  folderId?: string;
  isFolder?: boolean;
  collapsed?: boolean;
  /** Per-track lane height in the arrangement timeline (px). Undefined = default LANE_H. */
  laneH?: number;
  /** Optional track-level CC & MPE automation lanes */
  automationLanes?: TrackAutomationLane[];
  /** Optional generative model badge for hybrid AI + synth tracks (e.g. 'ace-step-2.5', 'yue2', 'qwen-score') */
  generativeEngine?: string;
}

import type { FxInstance } from './fx/devices';

/** A console channel with a real insert chain + aux sends — the mixer's slot architecture. */
export interface MixerChannel {
  gainDb: number;
  mute: boolean;
  solo: boolean;
  /** Insert FX chain (fx/devices.ts) — runs in the bus signal path. */
  inserts?: FxInstance[];
  /** Aux send level per send bus, index = send-bus index. */
  sends?: number[];
}

/** A send/return bus (FX 1, FX 2) with its own insert chain — typically a reverb or delay. */
export interface SendBusConfig {
  name: string;
  gainDb: number;       // return level
  inserts?: FxInstance[];
}

export interface MixerState {
  groups: MixerChannel[]; // length 4 (A–D)
  /** FX 1 / FX 2 return buses. Optional for back-compat; consumers default to two. */
  sendBuses?: SendBusConfig[];
  // master.eq is a serialized SpectraState (EQ + dynamics on the mix bus); master.mastering is a
  // serialized MasteringState (the Pressing — era engine + width + drive, fx/mastering.ts). Both
  // loosely typed so grooveDoc stays engine-agnostic, like instrument.patch / instrument.kera.
  master: { gainDb: number; limiterOn: boolean; eq?: Record<string, unknown>; mastering?: Record<string, unknown> };
}

/** The default two send buses — created lazily so old docs upgrade cleanly. */
export function defaultSendBuses(): SendBusConfig[] {
  return [{ name: 'FX 1', gainDb: 0 }, { name: 'FX 2', gainDb: 0 }];
}

export interface GrooveDoc {
  id: string;
  name: string;
  ownerId: string;
  bpm: number;      // 20–300
  swing: number;    // 0..1 on offbeat 16ths
  // Song-mode loop/cycle region (beats). Optional for back-compat with docs saved before it
  // existed — consumers default it off. Pattern mode loops the pattern itself, independently.
  loop?: { on: boolean; startBeats: number; endBeats: number };
  kit: PadConfig[]; // a MULTIPLE of 16 (Maschine "Groups" — banks of 16); index 0 = bank 0's bottom-left
  patterns: Pattern[];
  arrangement: ArrangeTrack[];
  mixer: MixerState;
  /** Film cue section markers across the arrangement timeline (Overture, Theme A, Theme B, Development, Climax, Coda) */
  sectionMarkers?: FilmScoreSectionMarker[];
  /** Optional Chora DAW Showcase & Template project metadata */
  showcaseMetadata?: {
    isShowcaseTemplate: boolean;
    bookThemeId: string;
    bookId?: string;
    bookTitle: string;
    trackIndex: number;
    activeMovementIdx?: number;
    trackTitle: string;
    activeMovementTitle?: string;
    keySignature?: string;
    characterOrTheme: string;
    scoreMode: 'full-film-score' | 'light-background';
    durationFormatted: string;
    generativeModelsUsed: string[];
    composerLineage: string[];
  };
  // Unmodeled .dawproject XML preserved verbatim so importing a Bitwig project and re-exporting
  // destroys nothing (plugin Devices, complex Warps, automation Points…).
  foreignXml?: string;
  version: 1;
  createdAt: number;
  updatedAt: number;
}

// Deliberately CUT from Phase 1 (add in P2, bump version): ratchets/repeats, ties, per-step
// pitch, parameter locks, AHDSR, per-pad sends.

export const PAD_COUNT = 16;
export const PAD_BANK = 16;                       // pads per Maschine "Group"
export const GROUP_NAMES = ['A', 'B', 'C', 'D'] as const;  // BUS groups A–D (distinct from pad banks)
export const BANK_LETTERS = 'ABCDEFGHIJKLMNOP';   // pad-bank labels (Group A, B, …)

/** How many banks of 16 the kit currently spans (min 1). */
export function bankCount(kit: PadConfig[]): number { return Math.max(1, Math.ceil(kit.length / PAD_BANK)); }

/** Index of the first empty (soundless) pad, or -1 if every pad is filled. */
export function firstEmptyPadIndex(kit: PadConfig[]): number { return kit.findIndex((p) => p.empty); }

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_KIT: { name: string; synthVoice: SynthVoiceId; color: string; group: 0 | 1 | 2 | 3; choke: number; sustain?: number; releaseMs?: number; decayMs?: number }[] = [
  // Bottom row up, Maschine order — a playable 808-ish starter kit so first-run makes sound.
  { name: 'Kick',       synthVoice: 'kick',       color: '#FF8C00', group: 0, choke: 0 },
  { name: 'Kick 2',     synthVoice: 'kick',       color: '#FF8C00', group: 0, choke: 0 },
  { name: 'Sub',        synthVoice: 'sub',        color: '#D40055', group: 1, choke: 0, sustain: 0.7, releaseMs: 220, decayMs: 300 },
  { name: 'Sub 2',      synthVoice: 'sub',        color: '#D40055', group: 1, choke: 0, sustain: 0.7, releaseMs: 220, decayMs: 300 },
  { name: 'Snare',      synthVoice: 'snare',      color: '#00DAF3', group: 0, choke: 0 },
  { name: 'Clap',       synthVoice: 'clap',       color: '#00DAF3', group: 0, choke: 0 },
  { name: 'Snare 2',    synthVoice: 'snare',      color: '#00DAF3', group: 0, choke: 0 },
  { name: 'Rim',        synthVoice: 'snare',      color: '#D0BCFF', group: 0, choke: 0 },
  { name: 'Closed Hat', synthVoice: 'hat-closed', color: '#F5F0FA', group: 0, choke: 1 },
  { name: 'Open Hat',   synthVoice: 'hat-open',   color: '#F5F0FA', group: 0, choke: 1 },
  { name: 'Hat 2',      synthVoice: 'hat-closed', color: '#F5F0FA', group: 0, choke: 2 },
  { name: 'Hat 3',      synthVoice: 'hat-open',   color: '#F5F0FA', group: 0, choke: 2 },
  { name: 'Perc 1',     synthVoice: 'clap',       color: '#D0BCFF', group: 2, choke: 0 },
  { name: 'Perc 2',     synthVoice: 'snare',      color: '#D0BCFF', group: 2, choke: 0 },
  { name: 'FX',         synthVoice: 'clap',       color: '#D0BCFF', group: 3, choke: 0 },
  { name: 'Voice',      synthVoice: 'sub',        color: '#D0BCFF', group: 3, choke: 0 },
];

export function defaultPad(idx: number): PadConfig {
  const d = DEFAULT_KIT[idx] || DEFAULT_KIT[0];
  return {
    id: uid(), name: d.name, color: d.color,
    source: 'synth', sample: null, synthVoice: d.synthVoice,
    group: d.group, choke: d.choke,
    gainDb: 0, pan: 0, pitchSemis: 0, startSec: 0,
    env: { attackMs: 0, holdMs: 0, decayMs: d.decayMs ?? 400, sustain: d.sustain ?? 0, releaseMs: d.releaseMs ?? 80 },
    filter: { type: 'off', cutoff: 8000, q: 0.8 },
    velCurve: 'linear',
  };
}

/** A greyed placeholder pad — no sound until an instrument fills it. `group` cycles the bus by
 *  bank so a new Group lands on a fresh bus by default. */
export function emptyPad(idx: number): PadConfig {
  return {
    id: uid(), name: 'Empty', color: '#2A2431',
    source: 'synth', sample: null, synthVoice: 'sub',
    group: (Math.floor(idx / PAD_BANK) % 4) as 0 | 1 | 2 | 3, choke: 0,
    empty: true,
    gainDb: 0, pan: 0, pitchSemis: 0, startSec: 0,
    env: { attackMs: 0, holdMs: 0, decayMs: 400, sustain: 0, releaseMs: 80 },
    filter: { type: 'off', cutoff: 8000, q: 0.8 },
    velCurve: 'linear',
  };
}

/** Append a fresh Group (bank of 16 empty pads) to the kit. Returns the new bank's first index. */
export function addPadBank(kit: PadConfig[]): number {
  const start = kit.length;
  for (let i = 0; i < PAD_BANK; i++) kit.push(emptyPad(start + i));
  return start;
}

export function defaultPattern(name = 'Pattern A'): Pattern {
  return { id: uid(), name, length: 16, steps: {} };
}

export function newGrooveDoc(ownerId: string, name = 'New Groove'): GrooveDoc {
  const pattern = defaultPattern();
  return {
    id: uid() + uid(),
    name, ownerId,
    bpm: 120, swing: 0,
    loop: { on: false, startBeats: 0, endBeats: 16 },
    kit: Array.from({ length: PAD_COUNT }, (_, i) => defaultPad(i)),
    patterns: [pattern],
    // One pattern track by default — the FL-style Sequence experience; Timeline view and
    // .dawproject import grow real tracks from here.
    arrangement: [{
      id: uid(), kind: 'pattern', name: 'Grooves', color: '#B84DFF',
      mute: false, solo: false, gainDb: 0, pan: 0,
      clips: [{ id: uid(), startBeats: 0, lengthBeats: 4, patternId: pattern.id }],
    }],
    mixer: {
      groups: Array.from({ length: 4 }, () => ({ gainDb: 0, mute: false, solo: false })),
      master: { gainDb: 0, limiterOn: true },
    },
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Firestore rejects undefined field values (they throw, and via merge they fail silently in
// batch paths) — strip them before any setDoc. JSON round-trip drops undefined and functions.
export function serializeGroove(doc: GrooveDoc): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ ...doc, updatedAt: Date.now() }));
}

export function deserializeGroove(raw: unknown): GrooveDoc | null {
  const d = raw as GrooveDoc;
  if (!d || typeof d !== 'object' || !Array.isArray(d.kit) || !Array.isArray(d.patterns)) return null;
  // Forward-compat guards: tolerate older docs missing arrangement (pre-Timeline schema drafts).
  if (!Array.isArray(d.arrangement)) (d as GrooveDoc).arrangement = [];
  if (!d.mixer) d.mixer = newGrooveDoc(d.ownerId || '').mixer;
  while (d.kit.length < PAD_COUNT) d.kit.push(defaultPad(d.kit.length));
  // Docs saved before the sustain/release upgrade get one-shot semantics (sustain 0).
  for (const p of d.kit) {
    if (p.env && p.env.sustain === undefined) { p.env.sustain = 0; p.env.releaseMs = 80; }
  }
  return d;
}

export const grooveUid = uid;
