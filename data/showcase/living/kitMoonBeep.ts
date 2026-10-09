// Small builders shared by the Moon Blanket and Beep Block Street living editions. They only return plain Behavior / Action JSON
// (the LivingBook stays pure data an author can edit), they just keep the page files readable.
import type { Action, AnimSpec, Behavior, Cond, Goal, LivingPage, Narration, Score, Target } from '../../../services/living/contracts';

export const pg = (n: number) => `p${String(n).padStart(2, '0')}`;
/** Ids the showcase builder mints: `p<NN>_<label-slug>_<k>` (k = k-th object with that label on the page). */
export const ids = (page: number, slug: string, ks: number[]): string[] => ks.map(k => `${pg(page)}_${slug}_${k}`);
/** `label:` group entries (a trailing * matches as a prefix). */
export const lab = (...labels: string[]): string[] => labels.map(l => `label:${l}`);
export const L = (label: string): Target => ({ label });
export const G = (group: string): Target => ({ group });
export const ID = (id: string): Target => ({ id });
export const PAGE: Target = { page: true };

export const loop = (preset: NonNullable<AnimSpec['preset']>, o: Partial<AnimSpec> = {}): AnimSpec => ({ preset, loop: 'infinite', ...o });

/** Quiet ambient life: loops while the page is visible (and compiles to a still in reduced motion). */
export const idle = (id: string, target: Target, preset: NonNullable<AnimSpec['preset']>, o: Partial<AnimSpec> = {}, label?: string): Behavior =>
  ({ id, ...(label ? { label } : {}), target, on: { type: 'idle' }, do: [{ do: 'animate', anim: loop(preset, o) }] });

export const onEnter = (id: string, target: Target, doIt: Action[], label?: string): Behavior => ({ id, ...(label ? { label } : {}), target, on: { type: 'enter' }, do: doIt });

export interface Extra { reduced?: Action[]; cooldownMs?: number; once?: boolean; when?: Cond; label?: string }
export const tap = (id: string, target: Target, hint: string, doIt: Action[], x: Extra = {}): Behavior => ({ id, target, on: { type: 'tap' }, hint, do: doIt, ...x });
export const when = (id: string, target: Target, cond: Cond, doIt: Action[], x: Extra = {}): Behavior => ({ id, target, on: { type: 'when', cond }, do: doIt, ...x });

export const spreadText = (text: string): string => text.replace(/\s+/g, ' ').trim();
export const narr = (text: string, rate = 0.8, voice = 'soft'): Narration => ({ text: spreadText(text), voice, rate });

export const eq = (v: string, value: string | number | boolean = true): Cond => ({ var: v, op: '==', value });
export const ge = (v: string, value: number): Cond => ({ var: v, op: '>=', value });
export const all = (...c: Cond[]): Cond => ({ all: c });

export const goal = (id: string, label: string, whenCond: Cond): Goal => ({ id, label, when: whenCond });

/** Everything a page needs, with the music cue and the quiet bed the book wants on it. */
export function page(n: number, p: Omit<LivingPage, 'page'>): LivingPage { return { page: n, ...p }; }

export function withScore(scores: Record<string, Score>, s: Score): void { scores[s.id] = s; }

/** A still, non-moving acknowledgement for reduced-motion readers: the object dims for a moment and comes back (opacity only, once). */
export const blip = (target: Target, lo = 0.55, ms = 320): Action[] => [{ do: 'set', target, props: { opacity: lo } }, { do: 'wait', ms }, { do: 'set', target, props: { opacity: 1 } }];

/** Word range (inclusive, as `narrate` wants) of a phrase inside the page text: span(text, 'Pip tilted his head.', 'Where did the beep go?'). */
export function span(text: string, start: string, end?: string): { from: number; to: number } {
  const ws = spreadText(text).split(' ');
  const sw = start.split(/\s+/); const ew = (end ?? start).split(/\s+/);
  const find = (w: string[], from: number) => { for (let i = from; i + w.length <= ws.length; i++) if (w.every((x, k) => ws[i + k] === x)) return i; return -1; };
  const a = find(sw, 0); if (a < 0) throw new Error(`span: "${start}" not found in "${text}"`);
  const b = find(ew, a); if (b < 0) throw new Error(`span: "${end}" not found after "${start}"`);
  return { from: a, to: b + ew.length - 1 };
}
