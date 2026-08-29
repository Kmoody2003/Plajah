// Registry for the Living Forest. One module per gallery; add a specimen by
// editing its gallery module, never by touching the wing.

import type { CreditedImage, FloraSpecimen, Gallery } from './types';
import canopy from './canopy';
import ancient from './ancient';
import photoCredits from './photoCredits.json';

/**
 * Photographs are attached here rather than typed into each species file.
 *
 * scripts/fetchFloraPhotos.mjs writes photoCredits.json — every image with the
 * photographer and licence read from Wikimedia's own metadata in the same
 * request as the pixels. Merging it at the registry means re-running the script
 * updates the exhibit, and no one hand-copies a photographer's name (and
 * misspells it) into a data file. A species with no entry simply has no photos,
 * which the card already handles.
 */
const PHOTOS = photoCredits as Record<string, CreditedImage[]>;

const withPhotos = (s: FloraSpecimen): FloraSpecimen =>
  PHOTOS[s.id]?.length ? { ...s, photos: PHOTOS[s.id] } : s;

/** Galleries ship in phases — the registry only lists what exists. */
export const FLORA: FloraSpecimen[] = [
  ...canopy,
  ...ancient,
].map(withPhotos);

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
