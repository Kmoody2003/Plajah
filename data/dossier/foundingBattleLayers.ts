/**
 * Hand-authored layer data for the animated painting of Trumbull's "The Battle of Bunker's Hill, June 17, 1775".
 *
 * All coordinates are PIXELS of the source image public/dossier/founding/film/bunker-hill-trumbull-1786.jpg (1920 x 1278).
 * This is the whole per-painting authoring job (see services/dossier/film/animatedPainting.ts):
 *   - flags:  the only places the picture is mesh-warped (a staff line, which side the cloth lies on, and a tight polygon);
 *   - faces:  circles smoke is never allowed to cover;
 *   - blobs:  where the painter put smoke, so ours drifts where his is (a soft density envelope);
 *   - fire:   a colour key inside a region, for the burning town's flicker;
 *   - cameras: focal points (in the demo film file).
 * The sky/figure separation (parallax plane, smoke occlusion) is not hand-drawn: it comes from a Depth Anything V2 map.
 * scripts/dossier/buildPaintingLayers.ts bakes this file + the depth map into the three PNGs next to the painting.
 */
export interface FlagSpec {
  id: string;
  /** Staff line P0 -> P1 (cloth is pinned along it). */
  staff: [[number, number], [number, number]];
  /** Unit-free hint: a point on the cloth side of the staff (decides which way "into the cloth" points). */
  cloth: [number, number];
  /** Distance from the staff (px) at which the cloth is free to move at full amplitude. */
  span: number;
  /** Ripple amplitude at the free end, source px. */
  amp: number;
  /** Waves along the cloth, cycles per second, phase (radians). */
  cycles: number;
  hz: number;
  phase: number;
  /** Tight polygon: the cloth plus a little sky. Nothing outside it is warped. */
  poly: Array<[number, number]>;
}

export const PAINTING_FILE = 'bunker-hill-trumbull-1786.jpg';
export const PAINTING_SIZE = { w: 1920, h: 1278 };

export const FLAGS: FlagSpec[] = [
  { id: 'pine-tree-flag', staff: [[245, 96], [322, 318]], cloth: [520, 230], span: 400, amp: 8, cycles: 1.5, hz: 0.42, phase: 0.4,
    poly: [[236, 92], [300, 106], [370, 126], [440, 158], [482, 190], [522, 226], [562, 272], [612, 332], [656, 396], [692, 440], [704, 454],
      [682, 456], [640, 436], [590, 414], [540, 396], [480, 384], [420, 372], [372, 362], [336, 350], [318, 312], [286, 226], [255, 140]] },
  { id: 'green-flag', staff: [[90, 130], [330, 452]], cloth: [260, 240], span: 280, amp: 6, cycles: 1.2, hz: 0.36, phase: 2.1,
    poly: [[75, 118], [150, 150], [230, 200], [300, 252], [345, 298], [400, 328], [447, 345], [452, 366], [420, 377], [382, 352], [336, 338],
      [300, 362], [262, 330], [215, 290], [170, 236], [120, 176], [85, 140]] },
  { id: 'red-ensign', staff: [[1034, 272], [1148, 470]], cloth: [1250, 400], span: 300, amp: 9, cycles: 1.4, hz: 0.46, phase: 4.0,
    poly: [[1040, 290], [1100, 298], [1170, 328], [1240, 378], [1320, 428], [1386, 488], [1408, 520], [1382, 526], [1330, 508], [1282, 482],
      [1240, 464], [1190, 458], [1142, 454], [1112, 442], [1086, 402], [1060, 350]] },
];

/** Faces smoke must never cover (cx, cy, radius). Checked by eye on the overlay that buildPaintingLayers writes. */
export const FACES: Array<[number, number, number]> = [
  [412, 496, 40], [477, 483, 30], [519, 492, 30], [337, 431, 26], [269, 469, 26], [262, 512, 32], [50, 525, 36],
  [744, 452, 34], [856, 456, 34], [540, 830, 42], [505, 762, 40], [812, 590, 36], [905, 612, 42], [1062, 556, 36],
  [1117, 563, 40], [1167, 559, 40], [1256, 509, 26], [1735, 722, 46], [1812, 722, 34], [1040, 1008, 44],
];

/** Where smoke may drift (cx, cy, rx, ry, weight): the painter's own smoke banks. */
export const SMOKE_BLOBS: Array<[number, number, number, number, number]> = [
  [1650, 250, 440, 320, 1.0], [1500, 90, 520, 220, 0.8], [800, 160, 520, 180, 0.5], [130, 520, 270, 170, 0.7],
  [880, 430, 360, 120, 0.5], [1650, 640, 400, 100, 0.65], [1000, 850, 520, 130, 0.22], [60, 760, 220, 170, 0.3],
];

/** Burning Charlestown: colour-keyed flame pixels inside this box only. */
export const FIRE_REGION = { x0: 1250, y0: 0, x1: 1920, y1: 680 };
