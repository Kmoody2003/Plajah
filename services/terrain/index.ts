// Plajah Terrain — the shared terrain service (docs/plajah-terrain.md).
// Phase 1: height fields, columns, streamed chunks (chunks.ts, needs three). Phase 2: noise, the terrain graph, GPU bake (gpu.ts, needs three).
export { HeightGrid, HeightField, ColumnGrid } from './field';
export type { TerrainField, SurfaceSource, HeightFn, GridRegion, HeightFieldOptions } from './field';
export { hash2, valueNoise, gradientNoise, cellularNoise, fractal } from './noise';
export type { NoiseKind, FractalMode, FractalOptions } from './noise';
export { compileGraph, validateGraph, gpuReady, polylineDistance } from './graph';
export type { TerrainGraph, GraphNode, Ref, HeightFns } from './graph';
export { HIGHLANDS } from './presets/highlands';
