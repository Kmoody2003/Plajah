// engine/params.ts — shared visual parameter state, palettes, helpers.

export interface VizParams {
  sens: number; smooth: number; bassFocus: number;
  speed: number; glow: number; trail: number;
  flash: boolean; mirror: boolean; palette: number;
}

export const defaultParams: VizParams = {
  sens: 1.4, smooth: 0.78, bassFocus: 1.0,
  speed: 1.0, glow: 1.0, trail: 0.5,
  flash: true, mirror: false, palette: 0,
};

export const PALETTES: string[][] = [
  ['#b56cff', '#ff5db1', '#5ad7ff', '#ffffff'], // neon violet
  ['#00f5d4', '#00bbf9', '#9b5de5', '#f15bb5'], // synth pop
  ['#ff9e00', '#ff5400', '#ff206e', '#fbff12'], // sunset heat
  ['#06d6a0', '#118ab2', '#073b4c', '#caf0f8'], // deep ocean
  ['#e0aaff', '#c77dff', '#9d4edd', '#3c096c'], // amethyst
  ['#f8f9fa', '#ced4da', '#6c757d', '#ff006e'], // mono accent
];
export const PALETTE_NAMES = ['neon violet', 'synth pop', 'sunset heat', 'deep ocean', 'amethyst', 'mono accent'];

export function hexA(h: string, a: number): string {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function hexV(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Audio band readings scaled by sensitivity / bass focus. */
export interface AudioBands {
  bass: number; mid: number; treble: number; level: number; beat: number;
}
