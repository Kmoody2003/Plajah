// services/merchStudio/artwork.ts — composites a print area's artwork layers into one canvas.
//
// The same canvas is the 3D print texture and (at print resolution) the downloadable print file,
// so what's on the product in the photo is exactly what gets printed.

import type { MerchArtLayer, MerchAsset } from './types';
import type { MerchPrintArea } from './products';
import { resolveMerchSrc } from './store';

export const MERCH_FONTS = [
  { id: 'Inter, system-ui, sans-serif', label: 'Sans' },
  { id: '"Bebas Neue", Impact, "Arial Narrow", sans-serif', label: 'Condensed' },
  { id: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { id: '"Playfair Display", Didot, Georgia, serif', label: 'Display' },
  { id: '"Courier New", ui-monospace, monospace', label: 'Mono' },
  { id: '"Brush Script MT", "Segoe Script", cursive', label: 'Script' },
];

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

/** Canvas pixel size for an area whose long side is `longSide`. */
export function printCanvasSize(area: MerchPrintArea, longSide: number): { width: number; height: number } {
  return area.aspect >= 1
    ? { width: longSide, height: Math.round(longSide / area.aspect) }
    : { width: Math.round(longSide * area.aspect), height: longSide };
}

export async function renderPrintArea(
  area: MerchPrintArea,
  layers: MerchArtLayer[] | undefined,
  assets: Record<string, MerchAsset>,
  longSide = 1024,
  target?: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const { width, height } = printCanvasSize(area, longSide);
  const canvas = target ?? document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (area.cornerRadius) {
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, area.cornerRadius * width);
    ctx.clip();
  }
  for (const layer of layers ?? []) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.x * width, layer.y * height);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    const w = layer.scale * width;
    if (layer.kind === 'image') {
      const url = await resolveMerchSrc(layer.src, assets);
      const img = url ? await loadImage(url) : null;
      if (img && img.naturalWidth) {
        const h = (w * img.naturalHeight) / img.naturalWidth;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
    } else if (layer.text) {
      // Size the text so its widest line fills the layer width.
      const lines = layer.text.split('\n');
      const font = (px: number) => `${layer.weight ?? 800} ${px}px ${layer.font ?? 'Inter, system-ui, sans-serif'}`;
      ctx.font = font(100);
      const widest = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
      const px = (100 * w) / widest;
      ctx.font = font(px);
      ctx.fillStyle = layer.color ?? '#111111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lh = px * 1.05;
      lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh));
    }
    ctx.restore();
  }
  ctx.restore();
  return canvas;
}

/** A 300-dpi PNG of a print area, sized to its physical print dimensions (capped at 6000 px). */
export async function exportPrintFile(area: MerchPrintArea, layers: MerchArtLayer[] | undefined, assets: Record<string, MerchAsset>): Promise<Blob> {
  const longIn = Math.max(area.printInches[0], area.printInches[1]);
  const canvas = await renderPrintArea(area, layers, assets, Math.min(6000, Math.round(longIn * 300)));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'));
}
