// KERA — the multisample zone model.
//
// This is the lingua franca of the sampler: the SF2 parser, the SFZ parser and a plain
// dragged-in file all produce a `KeraProgram`, and the engine plays one. Keeping the model in
// one place is what lets three very different input formats feel like one instrument, and it is
// the same design that lets Kontakt, SFZ and SoundFonts describe the same idea their own ways.
//
// A zone is "when a note in THIS key range is played at THIS velocity, sound THIS sample, tuned
// so its root lands on the note." Round-robins, velocity layers and key-splits are all just
// several zones whose ranges overlap.

/** One sample buffer, decoded to interleaved-by-channel Float32 (mono or stereo). */
export interface KeraSample {
  id: string;
  name: string;
  /** Channel data — [L] for mono, [L, R] for stereo. */
  channels: Float32Array[];
  sampleRate: number;
  /** MIDI note the sample was recorded at (its natural pitch). */
  rootNote: number;
  /** Fine tune in cents, applied on top of the root. */
  fineTune: number;
  /** Loop points in frames; loop is off when `loopEnd <= loopStart`. */
  loopStart: number;
  loopEnd: number;
  loopMode: 'off' | 'forward' | 'sustain';
}

export interface KeraZone {
  sampleId: string;
  /** Inclusive MIDI note range. */
  loKey: number;
  hiKey: number;
  /** Inclusive velocity range, 1–127. Velocity layers stack zones on the same keys. */
  loVel: number;
  hiVel: number;
  /** Round-robin group: zones sharing a group and range are cycled in turn. 0 = not grouped. */
  rrGroup: number;
  rrIndex: number;
  /** Per-zone offsets, layered on the program's own settings. */
  tuneSemis: number;
  tuneCents: number;
  gainDb: number;
  pan: number;
  /** Exclusive/mute group (hi-hat open/closed): a new note here chokes others in the group. */
  offGroup: number;
}

/** Amp envelope in seconds — the sampler's own, before the shared engine chain. */
export interface KeraAmpEnv {
  attack: number;
  hold: number;
  decay: number;
  sustain: number; // 0..1
  release: number;
}

export type KeraPlayMode = 'repitch' | 'stretch' | 'textures' | 'slice';

export interface KeraProgram {
  id: string;
  name: string;
  /** Where it came from, so the UI can be honest about what round-trips. */
  source: 'sf2' | 'sfz' | 'file' | 'empty';
  samples: KeraSample[];
  zones: KeraZone[];
  amp: KeraAmpEnv;
  playMode: KeraPlayMode;
  /** Master tuning and level for the whole program. */
  transpose: number;
  gainDb: number;
  /** Global voice cap; polyphonic by default. */
  polyphony: number;
}

export function emptyProgram(name = 'Empty'): KeraProgram {
  return {
    id: `kp_${Date.now().toString(36)}`,
    name,
    source: 'empty',
    samples: [],
    zones: [],
    amp: { attack: 0.001, hold: 0, decay: 0.4, sustain: 1, release: 0.15 },
    playMode: 'repitch',
    transpose: 0,
    gainDb: 0,
    polyphony: 24,
  };
}

/**
 * Pick the zone(s) a note+velocity triggers. Returns every matching zone (velocity layers can
 * overlap), with round-robins already resolved to the one whose turn it is.
 *
 * `rrState` carries the per-group counters between calls so consecutive notes advance the cycle;
 * it is mutated, which is the point — the caller owns one map per playing instance.
 */
export function selectZones(
  program: KeraProgram,
  note: number,
  velocity: number,
  rrState: Map<number, number>,
): KeraZone[] {
  const candidates = program.zones.filter(
    (z) => note >= z.loKey && note <= z.hiKey && velocity >= z.loVel && velocity <= z.hiVel,
  );
  if (!candidates.length) return [];

  // Group by round-robin group. Group 0 means "always play"; other groups cycle.
  const byGroup = new Map<number, KeraZone[]>();
  for (const z of candidates) {
    const g = z.rrGroup || 0;
    (byGroup.get(g) || byGroup.set(g, []).get(g)!).push(z);
  }

  const chosen: KeraZone[] = [];
  for (const [group, zones] of byGroup) {
    if (group === 0 || zones.length === 1) {
      chosen.push(...zones);
      continue;
    }
    // Advance this group's counter and pick the matching rrIndex; fall back to modulo position
    // so an SFZ that used seq_position rather than a dense rrIndex still cycles evenly.
    const sorted = [...zones].sort((a, b) => a.rrIndex - b.rrIndex);
    const next = (rrState.get(group) ?? -1) + 1;
    rrState.set(group, next);
    chosen.push(sorted[next % sorted.length]);
  }
  return chosen;
}

/** Playback rate for a zone at a given note — the resampling ratio the engine reads at. */
export function playbackRate(sample: KeraSample, zone: KeraZone, note: number, programTranspose: number): number {
  const semis = note - sample.rootNote + zone.tuneSemis + programTranspose;
  const cents = sample.fineTune + zone.tuneCents;
  return Math.pow(2, semis / 12) * Math.pow(2, cents / 1200);
}

/** A tidy summary for the browser/library row and the zone-map header. */
export function programStats(p: KeraProgram): { zones: number; samples: number; keyLo: number; keyHi: number; layers: number } {
  if (!p.zones.length) return { zones: 0, samples: p.samples.length, keyLo: 0, keyHi: 0, layers: 0 };
  let keyLo = 127, keyHi = 0, layers = 0;
  for (const z of p.zones) {
    keyLo = Math.min(keyLo, z.loKey);
    keyHi = Math.max(keyHi, z.hiKey);
    layers = Math.max(layers, z.hiVel < 127 || z.loVel > 1 ? 2 : 1);
  }
  return { zones: p.zones.length, samples: p.samples.length, keyLo, keyHi, layers };
}
