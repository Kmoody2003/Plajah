// SOMA hand map — play SOMA from pads and keys like a hand drum. Each key or pad is a stroke at a
// place on the head (bass in the centre, open tone near the edge, slap, muted, heel, toe, fingertip,
// rim), played by the right or the left hand; velocity is how hard the hand lands; the mod wheel is
// the shape of the hand, from a relaxed heavy palm to tight cupped fingers; octaves on the keys step
// between drums tuned a fourth apart (like a tumba / conga / quinto set). Melodic drums (timpani,
// taiko, concert percussion) keep keys = pitch unless you switch the map on. Pure.

import { SM } from './params';
import type { SomaCategory } from './presets';

export type SomaStroke = 'bass' | 'tone' | 'slap' | 'muted' | 'heel' | 'toe' | 'tip' | 'rim';
export type SomaHandLayout = 'keys' | 'pads';
export interface SomaHandConfig { enabled: boolean; layout: SomaHandLayout }

/** Where and how each stroke lands. pos: 0 centre … 0.95 rim; striker: SOMA STRIKER_TYPES index. */
export const SOMA_STROKES: Record<SomaStroke, { pos: number; striker: number; vel: number; label: string; how: string }> = {
  bass:  { pos: 0.06, striker: 1, vel: 1,    label: 'Bass',  how: 'Flat palm in the centre — the low boom.' },
  tone:  { pos: 0.6,  striker: 1, vel: 1,    label: 'Tone',  how: 'Fingers together near the edge, bouncing off — the open tone.' },
  slap:  { pos: 0.8,  striker: 2, vel: 1,    label: 'Slap',  how: 'Relaxed fingers whipped at the edge — the crack.' },
  muted: { pos: 0.5,  striker: 3, vel: 0.9,  label: 'Muted', how: 'Fingers stay pressed on the head — a closed tone.' },
  heel:  { pos: 0.14, striker: 3, vel: 0.55, label: 'Heel',  how: 'Heel of the palm in the centre — the soft first half of heel-toe.' },
  toe:   { pos: 0.3,  striker: 5, vel: 0.5,  label: 'Toe',   how: 'Fingertips rocking down after the heel — the second half of heel-toe.' },
  tip:   { pos: 0.86, striker: 5, vel: 0.8,  label: 'Tip',   how: 'Fingertips near the rim — light ghost notes and rolls.' },
  rim:   { pos: 0.94, striker: 5, vel: 0.9,  label: 'Rim',   how: 'Fingers on the bearing edge — a dry click.' },
};

/**
 * Keys, by pitch class, in right/left pairs on neighbouring keys so two fingers play two hands:
 * C/C# bass, D/D# tone, E/F slap, G/F# muted, G#/A heel-toe, B/A# fingertips. (Rim is on the pads.)
 */
const KEY_LAYOUT: [SomaStroke, 'R' | 'L'][] = [
  ['bass', 'R'], ['bass', 'L'], ['tone', 'R'], ['tone', 'L'], ['slap', 'R'], ['slap', 'L'],
  ['muted', 'L'], ['muted', 'R'], ['heel', 'R'], ['toe', 'R'], ['tip', 'L'], ['tip', 'R'],
];
/** Pads 1–16 (notes 36–51, the usual drum-pad range), bottom row first. */
const PAD_LAYOUT: [SomaStroke, 'R' | 'L'][] = [
  ['bass', 'L'], ['bass', 'R'], ['tone', 'L'], ['tone', 'R'],
  ['slap', 'L'], ['slap', 'R'], ['muted', 'L'], ['muted', 'R'],
  ['heel', 'R'], ['toe', 'R'], ['tip', 'L'], ['tip', 'R'],
  ['rim', 'L'], ['rim', 'R'], ['heel', 'L'], ['toe', 'L'],
];
export const SOMA_PAD_BASE = 36;

export interface HandHit { stroke: SomaStroke; hand: 'R' | 'L'; /** Drum step: 0 = home drum, ±1 = a fourth up/down. */ drum: number }

/** What a key or pad plays. `home` is the patch's default note (its octave is the home drum on keys). */
export function handHit(note: number, layout: SomaHandLayout, home: number): HandHit {
  if (layout === 'pads') {
    const i = ((note - SOMA_PAD_BASE) % 16 + 16) % 16;
    const [stroke, hand] = PAD_LAYOUT[i];
    return { stroke, hand, drum: Math.floor((note - SOMA_PAD_BASE) / 16) };
  }
  const [stroke, hand] = KEY_LAYOUT[((note % 12) + 12) % 12];
  return { stroke, hand, drum: Math.max(-2, Math.min(2, Math.floor(note / 12) - Math.floor(home / 12))) };
}

/** Hand drums get the map by default; pitched/concert drums keep keys = pitch. */
export function defaultHandConfig(category: SomaCategory | undefined): SomaHandConfig {
  const hand = category === 'west-african' || category === 'afro-cuban' || category === 'middle-eastern-india' || category === 'frame-ancient';
  return { enabled: hand, layout: 'keys' };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The engine note, velocity and per-hit SOMA parameters for a key or pad.
 * `base` is the patch's engine parameters (macros applied); `mod` is the mod wheel 0..1.
 */
export function somaHandStrike(note: number, velocity: number, mod: number, cfg: SomaHandConfig, home: number, base: Record<number, number>):
  { note: number; velocity: number; params: Array<[number, number]>; hit: HandHit } {
  const hit = handHit(note, cfg.layout, home);
  const s = SOMA_STROKES[hit.stroke];
  // Hand shape: 0 = relaxed, heavy palm (soft, long contact) … 1 = tight cupped fingers (hard, quick, airy pop).
  const shape = clamp01(mod) - 0.5;
  const hardness = clamp01((base[SM.STRIKER_HARDNESS] ?? 0.5) + shape * 0.6);
  const mass = clamp01((base[SM.STRIKER_MASS] ?? 0.5) - shape * 0.5);
  const brush = clamp01((base[SM.HAND_BRUSH] ?? 0.2) + Math.max(0, shape) * 0.5);
  // The two hands land a little apart around the head, so alternating hands isn't a machine gun.
  const angle = hit.hand === 'R' ? 0.32 : 0.68;
  return {
    note: home + hit.drum * 5,
    velocity: clamp01(velocity * s.vel),
    params: [
      [SM.STRIKE_POS, s.pos], [SM.STRIKE_ANGLE, angle], [SM.STRIKER_TYPE, s.striker],
      [SM.STRIKER_HARDNESS, hardness], [SM.STRIKER_MASS, mass], [SM.HAND_BRUSH, brush],
    ],
    hit,
  };
}

/** Labels for the on-screen map. */
export function handLegend(layout: SomaHandLayout): { slot: string; stroke: SomaStroke; hand: 'R' | 'L' }[] {
  if (layout === 'pads') return PAD_LAYOUT.map(([stroke, hand], i) => ({ slot: `Pad ${i + 1}`, stroke, hand }));
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return KEY_LAYOUT.map(([stroke, hand], i) => ({ slot: names[i], stroke, hand }));
}
