// services/livewire/contentAdapt.ts — notice what is on screen and spend bits accordingly.
//
// The program feed tells us how much the picture changes. A sermon with lyric slides changes
// almost nothing for minutes; a worship set with moving lights changes every frame. Feeding a
// motion score here lets the encoder host pick the content kind at start (ladder.ts) and, on the
// native engine, retune bitrate live (NVENC supports reconfiguration without a new keyframe).
// Hysteresis + a minimum hold stop the bitrate from flapping on a single camera cut.
// Pure: the caller measures motion (mean absolute luma difference between frames, 0..1).

import type { ContentKind } from './types';
import { CONTENT_FACTOR } from './ladder';

export interface AdaptState {
  ema: number;
  kind: ContentKind;
  /** Seconds since the kind last changed. */
  heldFor: number;
}

/** Motion thresholds (EMA of per-frame luma diff) → content kind. */
const BANDS: Array<{ max: number; kind: ContentKind }> = [
  { max: 0.004, kind: 'slides' },
  { max: 0.015, kind: 'talk' },
  { max: 0.04, kind: 'worship' },
  { max: 0.08, kind: 'music' },
  { max: Infinity, kind: 'sports' },
];

export const MIN_HOLD_SEC = 20;
const HYSTERESIS = 0.25; // must clear a band edge by 25% to move

export function initialAdapt(kind: ContentKind = 'talk'): AdaptState {
  return { ema: 0, kind, heldFor: 0 };
}

function bandOf(v: number): number {
  return BANDS.findIndex(b => v <= b.max);
}

/** Band index for a kind; 'game' shares the top band with sports. */
const bandOfKind = (k: ContentKind) => (k === 'game' ? BANDS.length - 1 : BANDS.findIndex(b => b.kind === k));

/**
 * Feed one motion sample taken `dtSec` after the previous one.
 * `floor` keeps a creator's chosen kind as the minimum (a game stream never drops to 'slides').
 */
export function stepAdapt(s: AdaptState, motion: number, dtSec: number, floor?: ContentKind): AdaptState {
  const alpha = Math.min(1, dtSec / 8); // ~8 s smoothing
  const ema = s.ema + alpha * (Math.max(0, motion) - s.ema);
  const heldFor = s.heldFor + dtSec;
  const cur = bandOfKind(s.kind);
  let target = bandOf(ema);
  if (target > cur && ema < BANDS[cur].max * (1 + HYSTERESIS)) target = cur;
  if (target < cur && cur > 0 && ema > BANDS[cur - 1].max * (1 - HYSTERESIS)) target = cur;
  if (floor) target = Math.max(target, bandOfKind(floor));
  // Going UP in quality is allowed immediately (never starve motion); going down waits.
  if (target === cur || (target < cur && heldFor < MIN_HOLD_SEC)) return { ema, kind: s.kind, heldFor };
  return { ema, kind: BANDS[target].kind, heldFor: 0 };
}

/** Bitrate multiplier relative to a sports-grade ladder. */
export const adaptFactor = (kind: ContentKind) => CONTENT_FACTOR[kind];
