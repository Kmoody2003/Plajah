// The season on the land (set every frame from core/climate.ts): read by the trees (core/forest.ts), the grass
// (grassField.ts), the plants (undergrowth.ts) and the ground (ground.ts groundWeather).
import { uniform } from 'three/tsl';

export const seasonU = {
  /** 1 in autumn: leaves to gold, orange and red; the meadow to straw; ferns brown. */
  autumn: uniform(0),
  /** 1 in winter: the broadleaf trees and the cherries bare. */
  bare: uniform(0),
  /** 1 in spring: the cherries in blossom, the azaleas and kerria in flower. */
  bloom: uniform(1),
  /** Wildflowers out: spring 1, summer about half, none in autumn and winter. */
  flowers: uniform(1),
  /** Snow lying (0…1): the grass pressed under it, snow on the evergreens. */
  snow: uniform(0),
};
