// Chora Session Band — the character sheet. Everything a player needs to exist as a live, real-time
// character on top of who they are in the roster (bio, personas, knowledge, lessons stay there):
// how they look and move, how they sound, how they teach and give feedback, and the reactions they
// have to what you do in Chora. A sheet is pure data — the live director (band/live/director.ts)
// reads it, an instrument "lens" turns raw studio events into observations, and the avatar UI plays
// the result. Versioned so sheets can be stored, shared and validated.
//
// The players are fictional characters; the music history they teach is real. Sheets never let a
// character claim to be a real person or to belong to a tradition their bio doesn't give them.

export const CHARACTER_SCHEMA = 'plajah.band.character/1' as const;

/** What the avatar is doing right now — drives the portrait animation and what it's allowed to do. */
export type AvatarState =
  | 'idle'        // breathing, sways with the beat if music is playing
  | 'listening'   // the user is talking (mic open) — never interrupts
  | 'watching'    // the user is playing — nods along, saves comments for a gap
  | 'thinking'    // waiting on an answer from the mind
  | 'speaking'    // talking; captions + mouth driven by word timing
  | 'playing';    // demonstrating on the instrument

/** Short body-language beats layered on a state. */
export type Gesture = 'nod' | 'smile' | 'lean-in' | 'point' | 'count-in' | 'hands-up' | 'think' | 'laugh' | 'wince' | 'bow';

/** One thing a character can play to demonstrate, as the host instrument understands it. */
export interface DemoStep {
  /** Beats from the start of the demo (at the demo tempo). */
  at: number;
  /** Named stroke/zone the host maps to its own controls (SOMA: 'bass' | 'tone' | 'slap' | 'muted' | 'stick'). */
  stroke: string;
  /** 0–1. */
  velocity: number;
  /** Optional semitone offset from the host's default note. */
  note?: number;
}
export interface Demo { id: string; label: string; bpm: number; steps: DemoStep[] }

/**
 * A reaction: when the lens reports `on` (an observation id), the character may say one of `say`
 * (templated with {name}, {drum}, {preset}, {count}, {bpm}, {zone}, {stroke}), make a gesture and/or
 * play a demo. `cooldownS` keeps them from repeating themselves; `priority` decides who wins when
 * several things are noticed at once (higher first). `chattiness` is the lowest coaching level at
 * which the reaction fires (1 = only essentials, 3 = chatty).
 */
export interface Reaction {
  on: string;
  say: string[];
  gesture?: Gesture;
  demo?: string;
  priority: number;
  cooldownS: number;
  chattiness: 1 | 2 | 3;
}

export interface CharacterSheet {
  schema: typeof CHARACTER_SCHEMA;
  /** Same id as the roster player. */
  id: string;
  displayName: string;
  pronouns: string;
  age: string;

  look: {
    /** Square portrait (public/band/<id>.webp). */
    portrait: string;
    color: string;
    wardrobe: string;
    props: string[];
    /** Optional 3D/VRM body for a future embodied avatar; the 2D portrait is the baseline. */
    vrm?: string;
  };

  voice: {
    /** On-device TTS voice id (Kokoro), with the system voice as fallback. */
    kokoro: string;
    rate: number;
    pitch: number;
    /** How they sound, for anyone casting or tuning the voice. */
    timbre: string;
    /** How they talk. */
    style: { sentences: 'short' | 'medium' | 'long'; warmth: number; humor: number; directness: number };
    /** Things they actually say — used sparingly. */
    phrases: string[];
  };

  personality: {
    core: string[];
    teaching: string;
    /** How they give feedback: what they lead with and how much at once. */
    feedback: { leadWith: 'praise' | 'question' | 'observation'; tipsPerMinute: number; neverSays: string[] };
    quirks: string[];
  };

  expertise: {
    /** Chora engines / instruments they're at home on (e.g. 'soma', 'kit', 'lyra'). */
    instruments: string[];
    topics: string[];
  };

  /** What they can demonstrate on their seat instrument. */
  demos: Demo[];
  /** How they react live. Lens-agnostic: any lens that reports the same observation ids triggers them. */
  reactions: Reaction[];
}

/** Light runtime check for sheets loaded from storage or the network. Returns the problems found. */
export function validateSheet(s: unknown): string[] {
  const out: string[] = [];
  const x = s as Partial<CharacterSheet>;
  if (!x || typeof x !== 'object') return ['not an object'];
  if (x.schema !== CHARACTER_SCHEMA) out.push(`schema must be ${CHARACTER_SCHEMA}`);
  for (const k of ['id', 'displayName', 'pronouns'] as const) if (typeof x[k] !== 'string' || !x[k]) out.push(`${k} missing`);
  if (!x.look?.portrait) out.push('look.portrait missing');
  if (!x.voice?.kokoro) out.push('voice.kokoro missing');
  const demoIds = new Set((x.demos ?? []).map((d) => d.id));
  for (const r of x.reactions ?? []) {
    if (!r.on || !Array.isArray(r.say)) out.push('reaction needs on + say[]');
    if (r.demo && !demoIds.has(r.demo)) out.push(`reaction ${r.on} names unknown demo ${r.demo}`);
  }
  return out;
}
