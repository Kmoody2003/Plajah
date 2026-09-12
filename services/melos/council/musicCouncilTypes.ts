// musicCouncilTypes — the Music Council as a working team (mirrors services/council for art direction).
// Five experts — Producer, Mix Engineer, Master Engineer, Musician, Composer — each with a durable lens
// and a grounded knowledge base, who propose → dispute → synthesise on a question about the user's music.
// Aria is the single face; these are the team behind her. See docs/MELOS_COUNCIL_AND_COMPOSER.md.

export type MusicPersonaId = 'PRODUCER' | 'MIX' | 'MASTER' | 'MUSICIAN' | 'COMPOSER';
export const MUSIC_PERSONA_IDS: MusicPersonaId[] = ['PRODUCER', 'MIX', 'MASTER', 'MUSICIAN', 'COMPOSER'];

export interface MusicPersona {
  id: MusicPersonaId;
  name: string;
  epithet: string;         // how Aria refers to them — "the Mix Engineer"
  lens: string;            // what they hear first
  protects: string;        // what they will not let get lost
  challenges: string;      // where they push back
  voice: string;           // how they talk
  questions: string[];     // what they always ask
  /** which measurements they weigh (keys into MeasuredMix) */
  cares: Array<keyof MeasuredMix>;
}

/** Optional measurements from the Meter Bridge — the council reasons on these, not guesses. */
export interface MeasuredMix {
  lufsIntegrated?: number;
  truePeakDb?: number;
  plr?: number;                 // peak-to-loudness (dynamics)
  corr?: number;                // stereo correlation −1..1
  tone?: { sub: number; low: number; lowMid: number; mid: number; highMid: number; high: number };
}

export interface MusicBrief {
  ask: string;                  // the question, e.g. "why does my mix sound small?"
  genre?: string;
  platform?: string;            // delivery target platform
}

/** A move the user can apply in one click. EQ adds a bell band on the master; loudness sets a target. */
export type ApplyAction =
  | { kind: 'eq'; freq: number; gainDb: number; q?: number }
  | { kind: 'loudness'; trimDb: number };   // adjust master gain by trimDb (negative = quieter)
export interface CouncilMove { text: string; where?: string; personaId?: MusicPersonaId; apply?: ApplyAction; }
export interface Proposal { personaId: MusicPersonaId; headline: string; moves: CouncilMove[]; }

export interface MusicDeliberation {
  intro: string;                // Aria's opening line
  proposals: Proposal[];        // one per persona
  tensions: string[];           // the disagreements said out loud
  plan: CouncilMove[];          // the synthesised, ranked, actionable moves
  summary: string;              // Aria's synthesis, no averaging
  grounded: boolean;            // true = anchored to real measurements/knowledge (vs pure model)
  source: 'ai' | 'local';       // where the deliberation came from
}
