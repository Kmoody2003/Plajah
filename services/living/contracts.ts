// LIVING BOOKS: the contract. One Tela document, two renditions.
//
//   FLAT rendition   = each page drawn once from its named vector objects (PNG / PDF / fixed-layout EPUB). Used for EXPORT. Never changes.
//   LIVING rendition = the same page, live: its objects animate, react to touch / pointer / tilt, make sound, play music, and read aloud,
//                      driven by the `LivingBook` data below. Used in the Lorea reader on Plajah.
//
// The living layer is DATA (JSON), stored with the Tela document and published inside the Tela bundle, so:
//   * authors can open a book in Tela and edit its behaviours, sounds and music (a Behaviours inspector),
//   * remixers inherit them, and
//   * export can strip them (flat pages) and list what was left out (export fidelity report).
// Pages are built from NAMED objects (objectLabel / templateRole / id), so a behaviour can target "Bo's left eye" or the group "windows".
//
// Rules that every implementation must honour:
//   1. Reduced motion: prefers-reduced-motion (and the reader's own switch) turns animation into stills and non-motion equivalents
//      (a tap still plays its sound and shows its result, without movement). Nothing may flash more than 3 times per second.
//   2. Sound is OFF until the first user gesture, has a visible mute control, never autoplays loud, and ducks under narration.
//   3. Everything interactive is keyboard-operable and has an accessible name (`Behavior.hint`); drag targets have a tap/keyboard alternative.
//   4. Every sound and every piece of music is SYNTHESISED in code (WebAudio). No audio files, no licensing, fully remixable.
//   5. A page must look finished and be readable with all behaviours disabled (that is the flat rendition).
//   6. Deterministic where it matters: a `seed` makes a preset reproducible (tests, thumbnails).

// ───────────────────────────── targets ─────────────────────────────
/** Which object(s) a behaviour applies to. `label` matches Tela `objectLabel` exactly, or as a prefix when it ends with `*`. */
export type Target =
  | { id: string }
  | { label: string }
  | { role: string }              // Tela templateRole, e.g. 'HEADLINE', 'IMAGE_SLOT'
  | { group: string }             // a name from LivingPage.groups
  | { page: true };               // the whole page (backgrounds, global tint, parallax root)

// ───────────────────────────── animation ─────────────────────────────
export type AnimPreset =
  | 'float' | 'bob' | 'sway' | 'wiggle' | 'spin' | 'pulse' | 'breathe' | 'heartbeat' | 'jelly' | 'squash'
  | 'blink' | 'twinkle' | 'flicker' | 'shimmer' | 'glow'
  | 'drift' | 'orbit' | 'flutter' | 'swim' | 'wave' | 'bounce' | 'shake' | 'rise' | 'fall'
  | 'grow' | 'shrink' | 'pop-in' | 'pop-out' | 'fade-in' | 'fade-out' | 'slide-in' | 'slide-out'
  | 'draw-on' | 'type-on' | 'parallax';

export type AnimProp = 'x' | 'y' | 'rotate' | 'scale' | 'scaleX' | 'scaleY' | 'skewX' | 'opacity' | 'blur' | 'hue';
export interface AnimKeyframe { at: number; /* 0..1 */ x?: number; y?: number; rotate?: number; scale?: number; scaleX?: number; scaleY?: number; skewX?: number; opacity?: number; blur?: number; hue?: number; easing?: string }

export interface AnimSpec {
  /** Either a named preset (with `amount` for intensity) or explicit keyframes. */
  preset?: AnimPreset;
  keyframes?: AnimKeyframe[];
  /** 0..2, 1 = the preset's default strength. */
  amount?: number;
  durationMs?: number;
  delayMs?: number;
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring' | 'bounce' | string;
  /** number of repeats, or 'infinite' for ambient loops (they stop when the page is left or reduced motion is on) */
  loop?: number | 'infinite';
  direction?: 'normal' | 'alternate' | 'reverse';
  /** extra points for orbit / flutter / swim paths, in page coordinates [x0,y0,x1,y1,...] */
  path?: number[];
  /** transform origin as a fraction of the object's box, default centre */
  origin?: { x: number; y: number };
  seed?: number;
}

// ───────────────────────────── state & conditions ─────────────────────────────
export type Scalar = number | string | boolean;
export type Cond =
  | { var: string; op: '==' | '!=' | '>=' | '<=' | '>' | '<'; value: Scalar }
  | { all: Cond[] } | { any: Cond[] } | { not: Cond };

// ───────────────────────────── triggers ─────────────────────────────
export type Trigger =
  | { type: 'enter' }                                   // the page became visible (play once per visit)
  | { type: 'exit' }
  | { type: 'idle' }                                    // ambient: runs while the page is visible
  | { type: 'tap' }
  | { type: 'doubleTap' }
  | { type: 'press'; minMs?: number }                   // pressed and held (kazoo, blow-on-candle)
  | { type: 'release' }
  | { type: 'drag'; axis?: 'x' | 'y' | 'both'; bounds?: { minX?: number; maxX?: number; minY?: number; maxY?: number }; snapBack?: boolean; snapTo?: Array<{ x: number; y: number; r: number }>; progressVar?: string /* writes 0..1 here while dragging */ }
  | { type: 'hover' }
  | { type: 'proximity'; radius: number; slowBelow?: number; fastAbove?: number /* px/s pointer speed: Mars peeks for a slow approach, hides for a fast one */ }
  | { type: 'tilt'; axis?: 'x' | 'y' | 'both'; gain?: number }
  | { type: 'timer'; afterMs: number; every?: boolean }
  | { type: 'when'; cond: Cond }                        // fires when the condition becomes true
  | { type: 'event'; name: string }
  | { type: 'key'; key: string };

// ───────────────────────────── actions ─────────────────────────────
export type BurstKind = 'sparkles' | 'confetti' | 'bubbles' | 'petals' | 'hearts' | 'stars' | 'fireflies' | 'leaves' | 'notes' | 'snow' | 'embers';
export type HapticPattern = 'tap' | 'tug' | 'soft' | 'success' | 'knock';

export type Action =
  | { do: 'animate'; target?: Target; anim: AnimSpec }
  | { do: 'stop'; target?: Target }
  | { do: 'set'; target?: Target; props: Partial<{ x: number; y: number; opacity: number; scale: number; rotate: number; visible: boolean; fill: string; text: string }> }
  | { do: 'show' | 'hide' | 'toggle'; target: Target; anim?: AnimSpec }
  | { do: 'sfx'; sound: string; params?: SfxParams }
  | { do: 'note'; instrument: string; note: string | number; durationMs?: number; gain?: number; pan?: 'auto' | number }
  | { do: 'music'; cue: string; fadeMs?: number }
  | { do: 'musicStop'; fadeMs?: number }
  | { do: 'musicTempo'; scale: number; rampMs?: number }
  | { do: 'duck'; amount: number; ms: number }
  | { do: 'ambience'; bed: string | null; gain?: number; fadeMs?: number }
  | { do: 'depth'; value: number | { fromVar: string } }         // 0 surface .. 1 deep: audio low-pass + muffling, used by Below the Blue
  | { do: 'narrate'; from?: number; to?: number }                // read the page text (or a word range) aloud with highlighting
  | { do: 'var'; name: string; op: 'set' | 'inc' | 'dec' | 'toggle'; value?: Scalar }
  | { do: 'goto'; page: number | 'next' | 'prev' }
  | { do: 'burst'; at?: Target | { x: number; y: number }; kind: BurstKind; count?: number }
  | { do: 'trail'; kind: BurstKind; whileVar?: string }          // leave particles behind the pointer while the var is true
  | { do: 'follow'; target: Target; to: 'pointer'; lagMs?: number; lookAt?: boolean; maxOffset?: number }
  | { do: 'haptic'; pattern: HapticPattern }
  | { do: 'emit'; name: string; payload?: unknown }
  | { do: 'wait'; ms: number }
  | { do: 'if'; cond: Cond; then: Action[]; else?: Action[] }
  | { do: 'celebrate' };

export interface SfxParams { pitch?: number /* semitones */; gain?: number; pan?: 'auto' | number; variation?: number /* 0..1 random detune */; durationScale?: number }

// ───────────────────────────── behaviours & pages ─────────────────────────────
export interface Behavior {
  id: string;
  label?: string;
  target: Target;
  on: Trigger;
  when?: Cond;                  // extra guard
  do: Action[];
  once?: boolean;
  cooldownMs?: number;
  /** Accessible name / instruction for interactive behaviours ("Tap Bo to make him beep"). REQUIRED for tap/press/drag/proximity. */
  hint?: string;
  /** What a reduced-motion or no-sound reader gets instead (text shown, state change without movement). */
  reduced?: Action[];
}

export interface Goal { id: string; label: string; when: Cond; celebrate?: boolean }

export interface Narration {
  /** The text to read; defaults to the page's story text. */
  text?: string;
  /** Word timings from a recorded voice or measured TTS; optional (estimated from rate when absent). */
  words?: Array<{ i: number; startMs: number; endMs: number }>;
  voice?: 'aria' | 'warm' | 'bright' | 'soft' | string;
  rate?: number;
}

export interface LivingPage {
  /** 1-based page number, same as the story spread n. */
  page: number;
  /** Named groups of objects for targeting, e.g. { windows: ['label:Window*'], planets: [...] }. Entries are ids or 'label:<name>' / 'role:<ROLE>'. */
  groups?: Record<string, string[]>;
  /** Page-local variables with their starting values (counters, flags, progress). */
  vars?: Record<string, Scalar>;
  behaviors: Behavior[];
  goals?: Goal[];
  /** Music cue to start when the page opens (a key in LivingBook.scores), and an ambience bed. */
  music?: { cue: string; fadeMs?: number };
  ambience?: { bed: string; gain?: number };
  narration?: Narration;
  /** Plain-language description of what this page does, shown to authors and read by screen readers. */
  a11y?: { summary?: string; instructions?: string };
}

// ───────────────────────────── audio data ─────────────────────────────
export type Instrument = 'musicbox' | 'marimba' | 'felt-piano' | 'harp' | 'pluck' | 'flute' | 'whistle' | 'pad' | 'bass' | 'kalimba' | 'bell' | 'glass' | 'kazoo' | 'drum' | 'shaker' | 'click' | 'choir' | string;

export interface ScoreNote { /** start, in beats */ t: number; /** note name 'C4' / 'F#3' or MIDI number, or 'x' for an unpitched hit */ n: string | number; /** length in beats */ d: number; /** velocity 0..1 */ v?: number }
export interface ScoreTrack { instrument: Instrument; notes: ScoreNote[]; gain?: number; pan?: number; loop?: boolean }
export interface Score {
  id: string;
  tempo: number;                 // beats per minute
  beatsPerBar?: number;
  /** length in beats of one loop of the cue */
  lengthBeats: number;
  tracks: ScoreTrack[];
  /** simple generative variation: swap octaves, drop notes, humanise timing (seeded) */
  variation?: { seed?: number; humanizeMs?: number; dropout?: number };
  reverb?: number;               // 0..1
}

export interface LivingBook {
  version: 1;
  bookId: string;
  pages: LivingPage[];
  scores: Record<string, Score>;
  /** Book-wide defaults the reader may override. */
  defaults?: { musicGain?: number; sfxGain?: number; narrate?: 'off' | 'on-demand' | 'auto'; ambient?: boolean };
  /** Free text for authors: what the book teaches about the format. */
  authorNotes?: string;
}

// ───────────────────────────── the audio engine API (implemented by services/living/audio) ─────────────────────────────
export interface AudioReadyState { unlocked: boolean; muted: boolean; musicGain: number; sfxGain: number; reducedSound: boolean }

export interface BookAudioApi {
  /** Create/resume the AudioContext. MUST be called from a user gesture (tap) before any sound plays. Safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly state: AudioReadyState;
  setMuted(m: boolean): void;
  setGains(g: { music?: number; sfx?: number }): void;

  /** One-shot sound effect by catalogue id (see services/living/audio/sfxCatalog.ts). `pan` 'auto' pans by the object's x. */
  sfx(id: string, params?: SfxParams & { x01?: number }): void;
  /** One pitched note on an instrument (for instruments the child plays: planet xylophone, Bo's beep scale, kazoo). */
  note(instrument: Instrument, note: string | number, opts?: { durationMs?: number; gain?: number; pan?: number }): { stop(): void } | void;
  /** Start / hold a sustained, pitch-bendable voice (kazoo, whale song, thread hum). Returns a handle. */
  voice(instrument: Instrument, note: string | number, opts?: { gain?: number }): { setPitch(note: string | number, glideMs?: number): void; setGain(g: number): void; stop(releaseMs?: number): void } | null;

  /** Music cues from the book's scores. */
  registerScores(scores: Record<string, Score>): void;
  playCue(id: string, opts?: { fadeMs?: number }): void;
  stopMusic(opts?: { fadeMs?: number }): void;
  setTempoScale(scale: number, rampMs?: number): void;
  /** Ambience beds ('night-crickets', 'forest-wind', 'ocean-hum', 'city-murmur', 'room-tone', 'space-drone', 'wind'): synthesised noise + tones. */
  setAmbience(bed: string | null, opts?: { gain?: number; fadeMs?: number }): void;
  /** Lower music + ambience under speech or a key moment. */
  duck(amount: number, ms: number): void;
  /** 0 surface .. 1 deep: music and ambience get progressively low-passed, quieter and more reverberant. */
  setDepth(depth01: number): void;

  /** Read-aloud: resolves when finished. Highlights are reported through onWord. */
  speak(text: string, opts?: { voice?: string; rate?: number; onWord?: (wordIndex: number) => void }): { cancel(): void; done: Promise<void> };
  /** Stop everything (page change, unmount). */
  stopAll(): void;
  dispose(): void;
}

// ───────────────────────────── the runtime API (implemented by services/living/runtime + components/living) ─────────────────────────────
export interface LivingRuntimeOptions {
  reducedMotion: boolean;
  soundEnabled: boolean;
  /** Called when a behaviour asks to move pages. */
  onGoto?: (page: number | 'next' | 'prev') => void;
  /** Called when a goal completes (the reader may save progress). */
  onGoal?: (pageNumber: number, goalId: string) => void;
}

export const LIVING_SCHEMA_VERSION = 1 as const;
export const emptyLivingPage = (page: number): LivingPage => ({ page, behaviors: [] });
