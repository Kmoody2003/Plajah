// An 8 km × 8 km sample world for streaming (docs/plajah-terrain.md, phase 6): broad valleys between ridged ranges,
// a plateau with terraced mesas, and a long river crossing the map. Pure terrain graph (CPU or GPU), centred on 0.
import type { TerrainGraph } from '../graph';

export const EXPANSE_SIZE = 8000;

export const EXPANSE: TerrainGraph = {
  version: 1,
  name: 'expanse',
  nodes: {
    rollRaw: { type: 'noise', kind: 'perlin', mode: 'fbm', freq: 1 / 900, amp: 70, octaves: 6, seed: 101 },
    roll: { type: 'warp', input: 'rollRaw', amount: 260, freq: 1 / 1600, seed: 7 },
    valleys: { type: 'curve', input: 'roll', points: [[-70, -10], [-15, 0], [25, 10], [70, 55]] },
    // where the ranges stand: a slow noise field, warped, thresholded
    rangeField: { type: 'noise', kind: 'perlin', mode: 'fbm', freq: 1 / 2600, amp: 1, octaves: 3, seed: 55 },
    rangeWarp: { type: 'warp', input: 'rangeField', amount: 500, freq: 1 / 2000, seed: 9 },
    rangeMask: { type: 'mask', input: 'rangeWarp', from: 0.05, to: 0.45 },
    ridges: { type: 'noise', kind: 'perlin', mode: 'ridged', freq: 1 / 1100, amp: 420, octaves: 7, gain: 0.47, seed: 77 },
    ranges: { type: 'combine', op: 'mul', inputs: ['ridges', 'rangeMask'] },
    // a plateau in the south-west with terraced mesas
    plateauMask: { type: 'mask', input: 'plateauDist', from: 1500, to: 900 },
    plateauDist: { type: 'distance', center: [-2200, 2000] },
    plateau: { type: 'combine', op: 'mul', inputs: ['plateauMask', 60] },
    mesa1: { type: 'radial', center: [-2500, 1700], radius: 260, height: 90, shape: 'mesa', falloff: 0.25 },
    mesa2: { type: 'radial', center: [-1800, 2400], radius: 180, height: 70, shape: 'mesa', falloff: 0.3 },
    mesas: { type: 'terrace', input: 'mesaSum', step: 15, sharpness: 5 },
    mesaSum: { type: 'combine', op: 'add', inputs: ['mesa1', 'mesa2'] },
    rocks: { type: 'noise', kind: 'cellular', mode: 'fbm', freq: 1 / 55, amp: 2.2, octaves: 3, seed: 13 },
    land: { type: 'combine', op: 'add', inputs: ['valleys', 'ranges', 'plateau', 'mesas', 'rocks'] },
    river: {
      type: 'path', width: 34, depth: 22, falloff: 70,
      points: [[-4000, -1800], [-2600, -1300], [-1500, -1500], [-400, -600], [300, 200], [1200, 600], [2100, 1500], [3000, 1900], [4000, 2600]],
    },
    out: { type: 'combine', op: 'sub', inputs: ['land', 'river'] },
  },
  output: 'out',
};
