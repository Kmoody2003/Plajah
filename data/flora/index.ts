// Registry for the Living Forest. One module per gallery; add a specimen by
// editing its gallery module, never by touching the wing.

import type { FloraSpecimen, Gallery } from './types';
import canopy from './canopy';
import ancient from './ancient';

/** Galleries ship in phases — the registry only lists what exists. */
export const FLORA: FloraSpecimen[] = [
  ...canopy,
  ...ancient,
];

export function specimensIn(gallery: Gallery): FloraSpecimen[] {
  return FLORA.filter((s) => s.gallery === gallery);
}

export function specimenById(id: string): FloraSpecimen | undefined {
  return FLORA.find((s) => s.id === id);
}

/** Galleries that currently have at least one specimen. */
export function populatedGalleries(): Gallery[] {
  const seen = new Set<Gallery>();
  for (const s of FLORA) seen.add(s.gallery);
  return [...seen];
}

export * from './types';
