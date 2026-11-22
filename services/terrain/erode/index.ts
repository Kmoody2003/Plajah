// Plajah Terrain — the erosion pass (docs/plajah-terrain.md, phase 3): hydraulic drops, then thermal slip, then the maps.
import { hydraulicErosion, type HydraulicOptions } from './hydraulic';
import { thermalErosion, type ThermalOptions } from './thermal';
import { flowAccumulation, logNormalise, slopeMap, wetnessMap } from '../maps';

export interface ErosionOptions {
  /** Drops per cell (0.3 = light weathering, 1 = strong). */
  dropsPerCell?: number;
  hydraulic?: Omit<HydraulicOptions, 'droplets' | 'protect'>;
  thermal?: Omit<ThermalOptions, 'protect'> | false;
  /** 0…1 per cell, 1 = untouched (authored places, water, the arena). */
  protect?: Float32Array;
  /** Clamp the final change per cell (metres): keeps basins and channels where the design put them. */
  maxCut?: number;
  maxFill?: number;
  seed?: number;
}

export interface ErosionResult {
  height: Float32Array;
  /** height − input (metres). */
  delta: Float32Array;
  /** Drainage, log-scaled 0…1 (1 = the biggest river). */
  flow: Float32Array;
  /** Topographic wetness 0…1. */
  wetness: Float32Array;
  /** Fresh sediment 0…1 (fans, valley floors). */
  deposition: Float32Array;
  ms: number;
}

/** Tuned on the Highlands sample (2 m and 4 m give the same look). */
export const EROSION_PRESETS = {
  /** Soft weathering: rounded crests, faint rills. */
  light: { dropsPerCell: 0.5, hydraulic: { erode: 0.15, deposit: 0.12, radius: 2 }, thermal: { iterations: 8, talus: 40, rate: 0.15 }, maxCut: 20, maxFill: 6 },
  /** Gullies on steep ground, drainage networks, fans at the foot of slopes. */
  weathered: { dropsPerCell: 1, hydraulic: { erode: 0.35, deposit: 0.08, radius: 2, inertia: 0.1, evaporate: 0.015 }, thermal: { iterations: 5, talus: 42, rate: 0.12 }, maxCut: 24, maxFill: 5 },
} satisfies Record<string, ErosionOptions>;

/** Erode an n × n height grid (cell size `cell` m). The input is left unchanged. */
export function erodeGrid(input: Float32Array, n: number, cell: number, o: ErosionOptions = {}): ErosionResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const h = Float32Array.from(input);
  const drops = Math.round((o.dropsPerCell ?? 0.6) * n * n);
  if (drops > 0) hydraulicErosion(h, n, cell, { ...o.hydraulic, droplets: drops, seed: o.seed ?? 1, protect: o.protect });
  if (o.thermal !== false) thermalErosion(h, n, cell, { ...(o.thermal || {}), protect: o.protect });
  const delta = new Float32Array(n * n), maxCut = o.maxCut ?? Infinity, maxFill = o.maxFill ?? Infinity;
  let fillHi = 1e-6;
  for (let i = 0; i < h.length; i++) {
    let d = h[i] - input[i];
    d = Math.max(-maxCut, Math.min(maxFill, d));
    if (o.protect) d *= 1 - o.protect[i];
    delta[i] = d; h[i] = input[i] + d;
    if (d > fillHi) fillHi = d;
  }
  const slope = slopeMap(h, n, cell), acc = flowAccumulation(h, n);
  const deposition = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) deposition[i] = Math.max(0, delta[i]) / fillHi;
  return { height: h, delta, flow: logNormalise(acc), wetness: wetnessMap(acc, slope, cell), deposition, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 };
}

export { hydraulicErosion, thermalErosion };
export type { HydraulicOptions, ThermalOptions };
