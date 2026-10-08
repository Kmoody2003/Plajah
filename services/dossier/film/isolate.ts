/**
 * Colour isolation for the Foreign Office map: the same feColorMatrix public/dossier/partition-map.html applies, as pixel
 * arithmetic, so the printed red boundary is lifted out of the scan by colour and never redrawn.
 *
 *   alpha = clamp(1.7 R - 0.9 G - 0.9 B - 0.12)         (R, G, B in 0..1; the page's #fRed filter)
 *
 * The result is the map's own line pixels (a 1 px dilation as in the page, no glow) on transparency, tinted with the
 * exhibit's madder. Pure arithmetic on the scan: deterministic across the live player and the render.
 */
export function isolateLine(img: HTMLImageElement, w: number, h: number, rgb: [number, number, number], view?: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const g = src.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (view) g.drawImage(img, view.x * img.naturalWidth, view.y * img.naturalHeight, view.w * img.naturalWidth, view.h * img.naturalHeight, 0, 0, w, h);
  else g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0, k = 0; i < d.length; i += 4, k++) {
    const v = 1.7 * d[i] / 255 - 0.9 * d[i + 1] / 255 - 0.9 * d[i + 2] / 255 - 0.12;
    a[k] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  }
  // 1 px dilation (the page uses radius 1.2): max of the 3x3 neighbourhood.
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const v = a[yy * w + xx]; if (v > m) m = v; } }
    o[y * w + x] = m;
  }
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d')!; const id = og.createImageData(w, h);
  for (let k = 0; k < o.length; k++) { id.data[k * 4] = rgb[0]; id.data[k * 4 + 1] = rgb[1]; id.data[k * 4 + 2] = rgb[2]; id.data[k * 4 + 3] = o[k]; }
  og.putImageData(id, 0, 0);
  return out;
}
