// A sample world made purely from the terrain graph (no hand-written height code): warped rolling hills flattened into
// a valley floor, ridged mountains rising toward the edges, a terraced mesa, a crater and a river carved through.
// 2 km × 2 km, centred on the origin. Runs on the CPU or the GPU (gpu.ts) with the same result.
import type { TerrainGraph } from '../graph';

export const HIGHLANDS: TerrainGraph = {
  version: 1,
  name: 'highlands',
  nodes: {
    hillsRaw: { type: 'noise', kind: 'perlin', mode: 'fbm', freq: 1 / 650, amp: 55, octaves: 6, seed: 11 },
    hills: { type: 'warp', input: 'hillsRaw', amount: 140, freq: 1 / 900, seed: 3 },
    // flatten the low ground into a valley floor, keep the tops rolling
    hillsShaped: { type: 'curve', input: 'hills', points: [[-60, -6], [-10, 0], [20, 8], [60, 46]] },
    ridges: { type: 'noise', kind: 'perlin', mode: 'ridged', freq: 1 / 720, amp: 260, octaves: 6, gain: 0.48, seed: 29 },
    centre: { type: 'distance', center: [0, 0] },
    // warp the distance so the valley's edge wanders instead of drawing a circle
    centreWarped: { type: 'warp', input: 'centre', amount: 260, freq: 1 / 750, octaves: 4, seed: 41 },
    mountainMask: { type: 'mask', input: 'centreWarped', from: 380, to: 940 },
    mountains: { type: 'combine', op: 'mul', inputs: ['ridges', 'mountainMask'] },
    mesaRaw: { type: 'radial', center: [-360, 260], radius: 150, height: 72, shape: 'mesa', falloff: 0.3 },
    mesa: { type: 'terrace', input: 'mesaRaw', step: 12, sharpness: 5 },
    crater: { type: 'radial', center: [420, -360], radius: 120, height: 34, shape: 'crater' },
    rocks: { type: 'noise', kind: 'cellular', mode: 'fbm', freq: 1 / 48, amp: 2.5, octaves: 3, seed: 5 },
    land: { type: 'combine', op: 'add', inputs: ['hillsShaped', 'mountains', 'mesa', 'crater', 'rocks'] },
    river: {
      type: 'path', width: 26, depth: 16, falloff: 46,
      points: [[-1000, -620], [-640, -420], [-300, -380], [-60, -120], [120, 60], [260, 420], [520, 700], [1000, 860]],
    },
    out: { type: 'combine', op: 'sub', inputs: ['land', 'river'] },
  },
  output: 'out',
};
