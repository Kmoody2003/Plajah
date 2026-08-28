// backdrops — photographic cycloramas for the hall.
//
// An ordinary photograph is NOT equirectangular, so it can't be wrapped onto the
// sky. But it is exactly the right shape for a panel standing at the treeline —
// which is the oldest technique in natural-history display: real specimens in
// front, a photographed backdrop behind supplying the depth the room can't.
//
// Three photos at 120° each close a circle. Two work (180° each). One works as a
// single wall if the camera is kept facing it.
//
// ── Adding your own ─────────────────────────────────────────────────────────
//   1. Save the images into public/backdrops/
//   2. List them here, clockwise
//   3. They appear behind the specimens on next load
//
// Landscape photos suit this better than square ones (a square gets stretched
// vertically across the panel). Shots with the horizon near the middle and no
// strong foreground subject blend best, since the bottom fades into the fog.

export interface BackdropSet {
  id: string;
  label: string;
  /** Files under public/backdrops/, arranged clockwise around the hall. */
  images: string[];
  /** How far out the panels stand. Beyond the specimens, inside the fog's far plane. */
  radius: number;
  height: number;
  /** Lift/drop the panel so its treeline sits sensibly against our horizon. */
  yOffset: number;
  /** Brightness trim so the photo sits with the live lighting. */
  intensity: number;
}

export const BACKDROP_SETS: BackdropSet[] = [
  {
    id: 'none',
    label: 'No backdrop',
    images: [],
    radius: 78, height: 62, yOffset: -6, intensity: 1,
  },
  {
    // Drop three forest photographs in as forest-01/02/03.jpg and this lights up.
    // Empty entries are skipped, so this is safe to ship before the files exist.
    id: 'summer-woodland',
    label: 'Summer woodland',
    images: [
      '/backdrops/forest-01.jpg',
      '/backdrops/forest-02.jpg',
      '/backdrops/forest-03.jpg',
    ],
    radius: 74, height: 58, yOffset: -5, intensity: 0.94,
  },
  {
    // Videos work exactly the same way — .mp4 / .webm are detected automatically
    // and play muted on a loop. Motion at the treeline sells depth better than a
    // still, so prefer video where you have it. One or two panels on TV.
    id: 'woodland-motion',
    label: 'Woodland (video)',
    images: [
      '/backdrops/forest-loop-01.mp4',
      '/backdrops/forest-loop-02.mp4',
    ],
    radius: 74, height: 58, yOffset: -5, intensity: 0.96,
  },
];

/** Only sets whose files are actually declared. */
export function availableBackdrops(): BackdropSet[] {
  return BACKDROP_SETS;
}

/**
 * What the hall shows by default. Ships as "none" — a backdrop pointing at
 * missing files would throw inside Suspense and blank the wing, so a set is
 * opt-in until its photos are known to exist.
 */
export function defaultBackdrop(): BackdropSet {
  return BACKDROP_SETS[0];
}

export function backdropById(id: string): BackdropSet {
  return BACKDROP_SETS.find((b) => b.id === id) ?? BACKDROP_SETS[0];
}
