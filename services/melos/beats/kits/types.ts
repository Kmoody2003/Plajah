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
  samples: LibrarySample[];
  scannedAt: number;
  skipped: number;
}

export const KITS_INDEX_KEY = 'melos:kits:index';
export const KITS_ROOTS_KEY = 'melos:kits:roots';
export const USER_KITS_KEY = 'melos:kits:user';

export const AUDIO_EXT = /\.(wav|wave|aif|aiff|flac|ogg|mp3|m4a)$/i;
