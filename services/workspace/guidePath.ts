// The guide-path contract every workspace's Aria guide follows. Generalised from the CAD room's
// "Design a home" journey (services/cad/guide/journey.ts), which was the first path.
//
// A path is an ordered set of steps. Each step has Simple and Pro words for what / why / how,
// a few vocabulary words, and the actions its card offers. Progress is never ticked by hand: the
// path's evaluate() reads it from the work itself, so people can draft freely and the guide keeps up.

export type Level = 'simple' | 'pro';
/** One string per level: Simple for a ten-year-old, Pro for a professional. */
export interface Two { simple: string; pro: string }
export interface Word { term: string; simple: string }

export interface PathStep<Id extends string = string, Action = unknown> {
  id: Id;
  title: Two; what: Two; why: Two;
  how: { simple: string[]; pro: string[] };
  words: Word[];
  actions: Action[];
  /** Optional steps are skipped by currentStepOf once any later step is done. */
  optional?: boolean;
}

/** A status line under a step: ok true = done, false = still to do, null = information. */
export interface Line { ok: boolean | null; text: string }
export interface StepState<Id extends string = string> { id: Id; done: boolean; lines: Line[] }

export interface GuidePath<Id extends string = string, Action = unknown> {
  id: string;
  /** Workspace the path lives in (services/workspace/workspaces.ts). */
  workspace: string;
  title: Two;
  blurb: Two;
  steps: PathStep<Id, Action>[];
  /** Tool ids that stay on the rail for good once the path is finished (services/workspace/tools.ts). */
  unlocks?: string[];
}

/** The step to work on: the first one not done, skipping optional steps that later work has passed. */
export function currentStepOf<Id extends string>(steps: Array<{ id: Id; optional?: boolean }>, states: StepState<Id>[]): Id {
  const later = (i: number) => states.slice(i + 1).some(s => s.done);
  const s = states.find((x, i) => !x.done && !(steps[i]?.optional && later(i)));
  return (s ?? states[states.length - 1]).id;
}

/** Done / total, counting a skipped optional step as done once later work passes it. */
export function pathProgress<Id extends string>(steps: Array<{ id: Id; optional?: boolean }>, states: StepState<Id>[]): { done: number; total: number; finished: boolean } {
  const later = (i: number) => states.slice(i + 1).some(s => s.done);
  const done = states.filter((s, i) => s.done || (steps[i]?.optional && later(i))).length;
  return { done, total: states.length, finished: states.length > 0 && done === states.length };
}

/** A path another workspace will offer, listed before it's built so the shell can show it honestly as coming. */
export interface PlannedPath { id: string; workspace: string; title: Two; blurb: Two }
