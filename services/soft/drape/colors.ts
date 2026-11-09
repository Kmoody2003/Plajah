// Vertex colours for the cloth: the fabric's own colour per piece, or a fit map (strain, contact
// pressure, gap) on a perceptual blue→green→yellow→red ramp with fixed, labelled scales so every
// size compares on the same legend.

import type { ClothModel } from './cloth';
import type { FitMaps } from './fit';

export type MapMode = 'fabric' | 'strain' | 'pressure' | 'gap';
export const MAP_SCALE: Record<Exclude<MapMode, 'fabric'>, { max: number; unit: string; label: string; ticks: string[] }> = {
  strain: { max: 0.2, unit: '%', label: 'Stretch', ticks: ['0%', '5%', '10%', '15%', '20%+'] },
  pressure: { max: 4, unit: 'kPa', label: 'Pressure on the body', ticks: ['0', '1', '2', '3', '4+ kPa'] },
  gap: { max: 60, unit: 'mm', label: 'Gap to body (ease)', ticks: ['touching', '15', '30', '45', '60+ mm'] },
};

const STOPS: Array<[number, number, number]> = [[0.16, 0.3, 0.75], [0.1, 0.65, 0.75], [0.35, 0.8, 0.35], [0.98, 0.85, 0.2], [0.95, 0.3, 0.2]];
export function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1); const i = Math.min(STOPS.length - 2, Math.floor(x)); const f = x - i; const a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export const rampCss = (t: number) => { const [r, g, b] = ramp(t); return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`; };

function hex(c: string): [number, number, number] { const n = parseInt(c.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

export function clothColors(m: ClothModel, mode: MapMode, maps?: FitMaps | null, out = new Float32Array(3 * m.n)) {
  if (mode === 'fabric' || !maps) {
    m.pieces.forEach((p, k) => { const c = hex(p.fabric.colour); const shade = 0.92 + 0.08 * ((k * 37) % 3) / 2; for (let i = p.v0; i < p.v0 + p.vn; i++) { out[3 * i] = c[0] * shade; out[3 * i + 1] = c[1] * shade; out[3 * i + 2] = c[2] * shade; } });
    return out;
  }
  const src = mode === 'strain' ? maps.strain : mode === 'pressure' ? maps.pressure : maps.gap; const max = MAP_SCALE[mode].max;
  for (let i = 0; i < m.n; i++) { const t = mode === 'gap' ? 1 - Math.min(1, src[i] / max) : src[i] / max; const c = ramp(t); out[3 * i] = c[0]; out[3 * i + 1] = c[1]; out[3 * i + 2] = c[2]; }
  return out;
}
