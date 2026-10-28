// Drum-kit import — the shared shapes. Every foreign kit format (Maschine groups, Battery kits,
// MPC programs, Ableton Drum Racks, Studio One Impact, Bitwig Drum Machine, SFZ, Hydrogen,
// Decent Sampler, SoundFont, a plain folder of one-shots) parses into one `KitSpec`, and one
// function (applyKit.ts) writes a KitSpec onto a MEKA Group. Parsers never touch the file system
// or the engine, so they stay pure and testable.

import type { DrumSynthPatch } from '../drumSynth';

export type KitFormat =
  | 'maschine-group'   // .mxgrp — a Maschine Group (16 Sounds)
  | 'maschine-sound'   // .mxsnd — one Maschine Sound (one pad)
  | 'battery'          // .nbkt — Battery 4 kit
  | 'mpc'              // .xpm — MPC / Force drum program
  | 'ableton'          // .adg — Ableton Drum Rack
  | 'impact'           // .preset — Studio One Impact / Impact XT
  | 'bitwig'           // .bwpreset — Bitwig Drum Machine
  | 'sfz'              // .sfz
  | 'hydrogen'         // drumkit.xml / .h2drumkit
  | 'decent'           // .dspreset — Decent Sampler
  | 'soundfont'        // .sf2 — SoundFont (samples embedded)
  | 'folder';          // a folder of one-shots, laid out by sound type

export const KIT_FORMAT_LABEL: Record<KitFormat, string> = {
  'maschine-group': 'Maschine Group',
  'maschine-sound': 'Maschine Sound',
  battery: 'Battery',
  mpc: 'MPC',
  ableton: 'Ableton Drum Rack',
  impact: 'Studio One Impact',
  bitwig: 'Bitwig Drum Machine',
  sfz: 'SFZ',
  hydrogen: 'Hydrogen',
  decent: 'Decent Sampler',
  soundfont: 'SoundFont',
  folder: 'Sample folder',
};

/** Where a pad's audio comes from: a path to resolve against the library, or bytes already in hand. */
export type KitSampleSource =
  | { kind: 'path'; path: string }                 // as written in the kit file (relative or absolute)
  | { kind: 'bytes'; bytes: Uint8Array; ext: string }; // embedded (SoundFont) or unpacked (zip / tar)

export interface KitPadSpec {
  /** 0-based pad in Maschine order (0 = bottom-left of the first Group). May exceed 15 — a kit
   *  bigger than 16 spills into the following Groups. */
  slot: number;
  name: string;
  sample: KitSampleSource | null;   // null = the source pad holds a plugin / synth we can't carry
  tuneSemis?: number;               // coarse + fine, in semitones
  gainDb?: number;
  pan?: number;                     // -1..1
  choke?: number;                   // 0 = none, 1–8
  color?: string;
  /** Sample start as a fraction of the file (0..1) — resolved to seconds after decode. */
  startFrac?: number;
  startSec?: number;
  /** The source pad is a drum synth (Maschine Drum Synth, Bitwig E-Kick, Live DS Kick…),
   *  translated onto MEKA's Drum Synth — loads with no sample. */
  drumSynth?: DrumSynthPatch;
}

export interface KitSpec {
  name: string;
  format: KitFormat;
  pads: KitPadSpec[];
  /** What the parse could NOT carry over, said plainly in the UI (plugin sounds, FX chains…). */
  notes: string[];
}

/** One kit file found in a library folder (the index — parsing happens when it's opened). */
export interface LibraryKit {
  id: string;            // `${root}:${path}`
  root: number;          // index into the library's roots
  path: string;          // path inside that root, '/'-separated
  name: string;
  format: KitFormat;
  product: string;       // expansion / pack — the top folder under the root
  previewPath?: string;  // NKS-style .previews/<file>.ogg sibling
  /** For kits inside an archive (a Studio One .soundset): the archive's path; `path` is inside it. */
  archive?: string;
}

export type SampleCategory =
  | 'kick' | 'snare' | 'clap' | 'hat-closed' | 'hat-open' | 'hat' | 'cymbal' | 'tom' | 'perc'
  | 'bass' | 'fx' | 'vocal' | 'loop' | 'other';

export interface LibrarySample {
  root: number;
  path: string;
  name: string;
  category: SampleCategory;
  product: string;
}

export interface KitLibraryIndex {
  roots: string[];       // folder names, in root order
  kits: LibraryKit[];
  /** Melodic multisample instruments (absent in indexes scanned before instruments existed). */
  instruments?: LibraryInstrument[];
  samples: LibrarySample[];
  scannedAt: number;
  skipped: number;
}

export const KITS_INDEX_KEY = 'melos:kits:index';
export const KITS_ROOTS_KEY = 'melos:kits:roots';
export const USER_KITS_KEY = 'melos:kits:user';

export const AUDIO_EXT = /\.(wav|wave|aif|aiff|flac|ogg|mp3|m4a)$/i;

// ── Multisample instruments (keygroups) ──────────────────────────────────────
// Melodic libraries — a piano, a string section, a choir — are many samples spread across keys
// and velocities, played by KERA (the sampler instrument), not by one-shot pads. Every format
// parses into one `InstrumentSpec`; instrumentLibrary.ts resolves its samples and builds a
// KeraProgram from it. Parsers stay pure, like the kit parsers above.

export type InstrumentFormat =
  | 'sfz'                  // .sfz — full regions: key/velocity zones, round robins, loops
  | 'decent'               // .dspreset — Decent Sampler
  | 'soundfont'            // .sf2 — melodic presets, samples embedded
  | 'bitwig-multisample'   // .multisample — zip: multisample.xml + the samples
  | 'exs'                  // .exs — Logic EXS24 / Sampler
  | 'kontakt'              // .nki — unencrypted Kontakt instruments with plain WAV/AIFF
  | 'folder';              // a folder of samples named by note ("Piano C3 v2.wav")

export const INSTRUMENT_FORMAT_LABEL: Record<InstrumentFormat, string> = {
  sfz: 'SFZ',
  decent: 'Decent Sampler',
  soundfont: 'SoundFont',
  'bitwig-multisample': 'Bitwig Multisample',
  exs: 'Logic EXS24',
  kontakt: 'Kontakt',
  folder: 'Sample folder',
};

/** One zone: when a key in [loKey, hiKey] is played in [loVel, hiVel], sound this sample. */
export interface ZoneSpec {
  sample: KitSampleSource;
  /** MIDI note the sample sounds at, untransposed. */
  rootNote: number;
  loKey: number;
  hiKey: number;
  loVel: number;
  hiVel: number;
  /** Round robin: zones sharing a non-zero group cycle in rrIndex order. */
  rrGroup: number;
  rrIndex: number;
  tuneSemis: number;
  tuneCents: number;
  gainDb: number;
  pan: number;          // -1..1
  offGroup: number;
  loopMode: 'off' | 'forward' | 'sustain';
  /** Loop points in frames of the source file (as written by the format). */
  loopStart: number;
  loopEnd: number;
  /** Play window in source frames; endFrame 0 = to the end. */
  startFrame: number;
  endFrame: number;
  /** No loop/root from the format: use the WAV's own `smpl` chunk when it has one. */
  useFileLoop?: boolean;
}

export interface InstrumentSpec {
  name: string;
  format: InstrumentFormat;
  zones: ZoneSpec[];
  amp?: { attack: number; hold: number; decay: number; sustain: number; release: number };
  /** What the import couldn't carry over, in plain words. */
  notes: string[];
  /** SoundFonts: every preset in the file, and which one this spec is. */
  presets?: { name: string; index: number; bank: number }[];
  presetIndex?: number;
  /** The file can't be read at all (encrypted Kontakt) — the notes say why. */
  locked?: boolean;
}

/** One instrument file (or melodic sample folder) found in a library folder. */
export interface LibraryInstrument {
  id: string;
  root: number;
  path: string;          // file inside the root; for 'folder', the folder path ending in '/'
  name: string;
  format: InstrumentFormat;
  product: string;
  previewPath?: string;
}
