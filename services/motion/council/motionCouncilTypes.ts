// motionCouncilTypes — the Motion Graphics & VFX Council as a working team (mirrors services/council for
// art direction and services/melos/council for music). Six experts — Kinetic Typographer, Animator,
// Compositor, Generative Artist, Signal Bender (VJ) and 3D Dramatist — each with a durable lens and a
// grounded knowledge base, who propose → dispute → synthesise on a question about a moving visual.
// Aria is the single face; these are the team behind her. They direct motion graphics, titles, VFX,
// generative/shader work, VJ sets and 3D reveals, and are attributed on the visuals they lead.
import type { AriaMotionDirectorLensId } from '../../aria/ariaCreativeRoles';

export type MotionPersonaId = AriaMotionDirectorLensId; // KINETIC | CHARACTER | COMPOSITOR | GENERATIVE | SIGNAL | CINEMATIC
export const MOTION_PERSONA_IDS: MotionPersonaId[] = ['KINETIC', 'CHARACTER', 'COMPOSITOR', 'GENERATIVE', 'SIGNAL', 'CINEMATIC'];

/** The craft each director owns — used to attribute shaders/generators and pick who leads a medium. */
export type MotionCraft = 'MOTION_TYPE' | 'CHARACTER' | 'VFX_COMP' | 'GENERATIVE' | 'VJ_ANALOG' | 'CINEMA_3D';

/** What a moving visual is for — steers which directors lead and what the deterministic advice measures. */
export type MotionMedium =
  | 'title' | 'lower-third' | 'transition' | 'mograph'
  | 'vj-loop' | 'background' | 'logo-sting' | 'character' | 'vfx-shot' | 'shader' | 'generator';

export interface MotionPersona {
  id: MotionPersonaId;
  name: string;
  epithet: string;         // how Aria refers to them — "the Compositor"
  craft: MotionCraft;
  /** the visual identity/style key this director carries — used to attribute shaders & broadcast work */
  councilStyle: MotionPersonaId;
  vj: boolean;             // every member can VJ, but this flags who leads a live set
  medium: string;          // their discipline / material (from the Aria lens)
  conviction: string;      // what they believe and see first (from the Aria lens)
  protects: string;        // what they will not let get lost
  challenges: string;      // where they push back
  voice: string;           // how they talk
  questions: string[];     // what they always ask
  researchBeats: string[]; // what they go looking for
  /** the standing arguments — who they most often disagree with, and about what (written both ways) */
  tensions: Partial<Record<MotionPersonaId, string>>;
  /** which spec fields / concerns they weigh (keys into MotionSpec, plus qualitative concerns) */
  cares: MotionConcern[];
}

export type MotionConcern = keyof MotionSpec | 'legibility' | 'integration' | 'grain' | 'audioReactive' | 'pacing' | 'performance';

/** The known/measurable spec of the piece — the council reasons on these, not guesses. */
export interface MotionSpec {
  tempo?: number;    // BPM, for beat-sync
  fps?: number;      // frame rate
  energy?: number;   // 0..1 intended intensity
  aspect?: string;   // '16:9' | '9:16' | '1:1' | '2.39:1'
  delivery?: string; // target — a MOTION_DELIVERY id
}

export interface MotionBrief {
  ask: string;          // the question, e.g. "how should this logo enter?"
  medium?: MotionMedium;
  spec?: MotionSpec;
}

/** A move the user can apply in one click on the consuming surface (Pixels / Fabula). */
export type ApplyAction =
  | { kind: 'fps'; fps: number }
  | { kind: 'beatGrid'; bpm: number; division: number }  // snap keyframes/cuts to a 1/division grid at bpm
  | { kind: 'shutter'; angle: number }                   // motion-blur shutter angle in degrees
  | { kind: 'ease'; preset: string }                     // an easing preset id
  | { kind: 'aspect'; value: string };

export interface CouncilMove { text: string; where?: string; personaId?: MotionPersonaId; apply?: ApplyAction; }
export interface Proposal { personaId: MotionPersonaId; headline: string; moves: CouncilMove[]; }

export interface MotionDeliberation {
  intro: string;                // Aria's opening line
  proposals: Proposal[];        // one per contributing persona
  tensions: string[];           // the disagreements said out loud
  plan: CouncilMove[];          // the synthesised, ranked, actionable moves
  summary: string;              // Aria's synthesis, no averaging
  grounded: boolean;            // true = anchored to a real spec (tempo/fps/delivery) vs pure model
  source: 'ai' | 'local';       // where the deliberation came from
}
