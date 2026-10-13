// services/tela/raster/colorSampler.ts
// Precision color sampling engine with multi-aperture kernel averaging (1x1, 3x3, 5x5, 11x11)
// and real-time color space translation for colorist inspection.

import { measureColor, type ColorMeasurement } from './colorWorkspace';

export type SampleAperture = 1 | 3 | 5 | 11;

export interface SamplerResult {
  x: number;
  y: number;
  aperture: SampleAperture;
  measurement: ColorMeasurement;
  pixelGrid?: Uint8ClampedArray; // 11x11 grid data for loupe rendering
}

/**
 * Samples a color from an HTMLCanvasElement or ImageData with multi-aperture averaging.
 */
export function sampleCanvasPixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aperture: SampleAperture = 1,
  canvasWidth?: number,
  canvasHeight?: number
): SamplerResult {
  const W = canvasWidth ?? ctx.canvas.width;
  const H = canvasHeight ?? ctx.canvas.height;
  const cx = Math.max(0, Math.min(W - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(H - 1, Math.round(y)));

  const half = Math.floor(aperture / 2);
  const x0 = Math.max(0, cx - half);
  const y0 = Math.max(0, cy - half);
  const x1 = Math.min(W - 1, cx + half);
  const y1 = Math.min(H - 1, cy + half);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;

  const imgData = ctx.getImageData(x0, y0, w, h);
  const data = imgData.data;

  let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
  const total = w * h;

  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
    sumA += data[i + 3];
  }

  const avgR = (sumR / total) / 255;
  const avgG = (sumG / total) / 255;
  const avgB = (sumB / total) / 255;
  const avgA = (sumA / total) / 255;

  const measurement = measureColor(avgR, avgG, avgB, avgA);

  // Extract 11x11 loupe neighborhood
  const loupeHalf = 5;
  const lx0 = Math.max(0, cx - loupeHalf);
  const ly0 = Math.max(0, cy - loupeHalf);
  const lw = Math.min(W - lx0, 11);
  const lh = Math.min(H - ly0, 11);
  const loupeData = ctx.getImageData(lx0, ly0, lw, lh).data;

  return {
    x: cx,
    y: cy,
    aperture,
    measurement,
    pixelGrid: loupeData,
  };
}
