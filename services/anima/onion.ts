/**
 * services/anima/onion.ts — which neighbouring drawings an onion skin shows.
 *
 * Animators onion-skin by drawing, not by frame: on 2s, the previous frame usually shows the
 * same drawing. So this walks the exposure sheet to the previous / next *different* drawings.
 */

import type { AnimaLayer } from './types';

export interface OnionGhost {
  drawingId: string;
  /** −1 = previous drawing, −2 = the one before, +1 = next … */
  step: number;
  /** First frame that drawing is exposed on (to evaluate the layer's motion there). */
  frame: number;
}

export function onionGhosts(layer: AnimaLayer, frame: number, prev: number, next: number): OnionGhost[] {
  const exposures = [...(layer.celTrack?.exposures ?? [])].filter((e) => e.drawingId !== '__EMPTY__').sort((a, b) => a.startFrame - b.startFrame);
  if (!exposures.length) return [];
  const cur = exposures.findIndex((e) => frame >= e.startFrame && frame < e.startFrame + e.durationFrames);
  // Between exposures: the "current" slot is where `frame` would sit.
  const pivot = cur >= 0 ? cur : exposures.findIndex((e) => e.startFrame > frame);
  const currentId = cur >= 0 ? exposures[cur].drawingId : null;
  const out: OnionGhost[] = [];

  let seen = currentId;
  let step = 0;
  for (let i = (cur >= 0 ? cur : pivot < 0 ? exposures.length : pivot) - 1; i >= 0 && step < prev; i--) {
    if (exposures[i].drawingId === seen) continue;
    seen = exposures[i].drawingId;
    out.push({ drawingId: seen, step: -(++step), frame: exposures[i].startFrame });
  }
  seen = currentId;
  step = 0;
  for (let i = cur >= 0 ? cur + 1 : pivot < 0 ? exposures.length : pivot; i < exposures.length && step < next; i++) {
    if (exposures[i].drawingId === seen) continue;
    seen = exposures[i].drawingId;
    out.push({ drawingId: seen, step: ++step, frame: exposures[i].startFrame });
  }
  return out;
}
