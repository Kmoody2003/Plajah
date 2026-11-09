// STEM track authoring kit: small helpers shared by the per-unit files in data/stem/units/*.
// Answer keys built with num() carry a `check` the test suite recomputes with its own independent formulas.

import type { RubricCriterion } from '../assignmentTemplates';
import type { Check, CheckFn, PracticeItem } from './types';

export const M = (code: string) => `CCSS.MATH.CONTENT.${code}`;
export const MP = (n: number) => `CCSS.MATH.PRACTICE.MP${n}`;

/** A numeric practice item whose key the tests recompute from `check`. */
export const num = (q: string, answer: string, value: number, f: CheckFn, args: number[], level: 1 | 2 | 3, unit?: string, tol?: number): PracticeItem => {
  const check: Check = { f, args };
  const item: PracticeItem = { q, answer, value, check, level };
  if (unit) item.unit = unit;
  if (tol !== undefined) item.tol = tol;
  return item;
};

/** A practice item answered in words (patterns, explanations, choices). */
export const say = (q: string, answer: string, level: 1 | 2 | 3): PracticeItem => ({ q, answer, level });

export const crit = (name: string, beginning: string, developing: string, proficient: string, advanced: string): RubricCriterion => ({
  name,
  levels: [
    { label: 'Beginning', descriptor: beginning, points: 1 },
    { label: 'Developing', descriptor: developing, points: 2 },
    { label: 'Proficient', descriptor: proficient, points: 3 },
    { label: 'Advanced', descriptor: advanced, points: 4 },
  ],
});

// Safety notes reused across bands.
export const K2_ELEC_SIM = 'Simulated Electronics Lab only: nothing physical to touch.';
export const K2_COIN_CELL = 'Coin cells are a serious swallowing hazard: an adult keeps them, places them in the holder and collects them at the end. No battery ever goes home in a pocket.';
export const G35_AA_PACK = 'Simulate first. If you build for real: AA alkaline cells in a holder (6 V or less), every LED with its own resistor, and never connect a wire straight from + to −, because the battery and wire get hot. Unclip the pack before changing anything.';
export const G68_BATTERY = 'Simulate first. If you build it, use a 3 × AA pack (4.5 V) or USB 5 V only, give every LED its own resistor, and never connect the battery terminals straight to each other: a shorted pack gets hot fast.';
export const G912_BENCH = 'Simulate first. Bench work uses a current-limited supply or USB 5 V, never mains wiring. Soldering only with an adult present, eye protection, fume extraction and a heat-proof mat; unplug before changing wiring.';
