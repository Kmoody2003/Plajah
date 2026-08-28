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
  /**
   * Width-over-height of each source, parallel to `images`. Supplying these lets
   * the hall give every panel an arc proportional to its picture's shape, so a
   * square photo, a 2.37:1 ultrawide and a 16:9 clip can sit side by side
   * without any of them being stretched. Omit and the circle is divided evenly.
   */
  aspects?: number[];
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
    // Kenneth's three woodland photographs. They are SQUARE (2048²), so the panel
    // count is chosen to match: at radius 70 and height 72, six 60° panels are
    // 73 units wide — almost exactly 1:1, so nothing stretches. The three images
    // repeat 1,2,3,1,2,3 so adjacent panels are never the same picture.
    id: 'summer-woodland',
    label: 'Summer woodland',
    images: [
      '/backdrops/forest-01.jpg',
      '/backdrops/forest-02.jpg',
      '/backdrops/forest-03.jpg',
      '/backdrops/forest-01.jpg',
      '/backdrops/forest-02.jpg',
      '/backdrops/forest-03.jpg',
    ],
    aspects: [1, 1, 1, 1, 1, 1],
    radius: 70, height: 72, yOffset: -20, intensity: 0.95,
  },
  {
    // Kenneth's three woodland clips. They play muted on a loop and are detected
    // by extension, so nothing else needs configuring.
    //
    // The three were shot at three different shapes — 960x960, 1440x608 and
    // 1280x720 — so they get panels sized to match rather than one shared panel
    // that would stretch two of them. The list runs twice around the circle,
    // which halves the panel height into a sensible treeline band and costs
    // nothing extra: the hall creates one video decode per UNIQUE clip, so six
    // panels here are still only three decoding videos.
    id: 'woodland-motion',
    label: 'Woodland (video)',
    images: [
      '/backdrops/forest-loop-01.mp4',
      '/backdrops/forest-loop-02.mp4',
      '/backdrops/forest-loop-03.mp4',
      '/backdrops/forest-loop-01.mp4',
      '/backdrops/forest-loop-02.mp4',
      '/backdrops/forest-loop-03.mp4',
    ],
    aspects: [1.0, 2.368, 1.778, 1.0, 2.368, 1.778],
    // height is derived from radius and the aspects; the value here is only the
    // fallback used if the aspect list is ever dropped.
    radius: 74, height: 45, yOffset: -6, intensity: 0.96,
  },
];

/** Only sets whose files are actually declared. */
export function availableBackdrops(): BackdropSet[] {
  return BACKDROP_SETS;
}

/**
 * What the hall shows by default. A set must only be made default once its files
 * actually exist — one pointing at a missing image throws inside Suspense and
 * blanks the whole wing.
 */
export function defaultBackdrop(): BackdropSet {
  return backdropById('summer-woodland');
}

export function backdropById(id: string): BackdropSet {
  return BACKDROP_SETS.find((b) => b.id === id) ?? BACKDROP_SETS[0];
}
