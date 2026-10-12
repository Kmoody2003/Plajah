// services/tela/raster/selectionWorkflow.ts
// Comprehensive Photoshop-grade selection workflow engine for Tela image editing.
// Provides mask conversions, animated marching ants path generators, inverse selection,
// feather/expand/contract/smooth/border transformations, layer cutting/copying, and generative fill bridge.

import {
  Selection,
  SelectionOp,
  emptySelection,
  selectAll,
  combine,
  invertSelection,
  featherSelection,
  expandSelection,
  contractSelection,
  smoothSelection,
  borderSelection,
  marchingAnts,
  rectSelection,
  ellipseSelection,
  lassoSelection,
  polygonalLassoSelection,
  magicWand,
  quickSelect,
  type WandOptions,
  type QuickSelectOptions,
} from './selection';
import type { Bitmap8 } from './buffer';
import type { TelaImageLayer } from '../../types';

export type SelectionTool =
  | 'none'
  | 'marquee_rect'
  | 'marquee_ellipse'
  | 'lasso_free'
  | 'lasso_poly'
  | 'magic_wand'
  | 'quick_select'
  | 'select_subject';

export {
  emptySelection,
  selectAll,
  invertSelection,
  featherSelection,
  expandSelection,
  contractSelection,
  smoothSelection,
  borderSelection,
  rectSelection,
  ellipseSelection,
  lassoSelection,
  polygonalLassoSelection,
  magicWand,
  quickSelect,
};
export type { Selection, SelectionOp, WandOptions, QuickSelectOptions };

/**
 * Converts an 8-bit selection mask to a PNG Data URL.
 * - 'alpha': RGB is white with opacity = mask coverage (ideal for CSS layer mask / cutout).
 * - 'black-white': White (255) inside selection, Black (0) outside selection (standard for AI inpainting).
 */
export function selectionToDataUrl(
  selection: Selection,
  mode: 'alpha' | 'black-white' = 'alpha'
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, selection.width);
  canvas.height = Math.max(1, selection.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(canvas.width, canvas.height);
  const data = imgData.data;
  const selData = selection.data;
  const len = selData.length;

  if (mode === 'black-white') {
    for (let i = 0; i < len; i++) {
      const v = selData[i];
      const idx = i * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  } else {
    for (let i = 0; i < len; i++) {
      const v = selData[i];
      const idx = i * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = v;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Traces marching ants SVG contours for real-time visualization over the canvas.
 * Returns an SVG path string `d="..."` encompassing all sub-contours.
 */
export function selectionToSvgPath(selection: Selection | null): string {
  if (!selection || !selection.bounds) return '';
  try {
    const loops = marchingAnts(selection);
    if (!loops || loops.length === 0) return '';

    let d = '';
    for (const loop of loops) {
      if (loop.length < 2) continue;
      d += `M ${loop[0][0].toFixed(1)} ${loop[0][1].toFixed(1)} `;
      for (let i = 1; i < loop.length; i++) {
        d += `L ${loop[i][0].toFixed(1)} ${loop[i][1].toFixed(1)} `;
      }
      d += 'Z ';
    }
    return d.trim();
  } catch (err) {
    console.warn('[Tela Selection] Error tracing marching ants contours:', err);
    return '';
  }
}

/**
 * Converts an image element or URL to Bitmap8 format for pixel-level sampling (e.g. Magic Wand).
 */
export async function loadLayerAsBitmap8(
  src: string,
  width: number,
  height: number
): Promise<Bitmap8> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const imgData = ctx.getImageData(0, 0, width, height);
      resolve({
        width,
        height,
        data: imgData.data,
      });
    };
    img.onerror = (e) => reject(new Error('Failed to load image for selection analysis'));
    img.src = src;
  });
}

/**
 * Extracts pixels in the active selection into a brand new non-destructive layer above (Ctrl+J).
 */
export async function layerViaCopy(
  sourceLayer: TelaImageLayer,
  selection: Selection,
  canvasW: number,
  canvasH: number
): Promise<TelaImageLayer | null> {
  if (!selection.bounds) return null;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        // Draw source layer with its transform
        ctx.save();
        ctx.translate(sourceLayer.x, sourceLayer.y);
        if (sourceLayer.rotation) {
          ctx.rotate((sourceLayer.rotation * Math.PI) / 180);
        }
        ctx.scale(sourceLayer.scale, sourceLayer.scale);
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        // Mask out non-selected pixels using the selection mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasW;
        maskCanvas.height = canvasH;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
          const maskImgData = maskCtx.createImageData(canvasW, canvasH);
          for (let i = 0; i < selection.data.length; i++) {
            const v = selection.data[i];
            const idx = i * 4;
            maskImgData.data[idx] = 0;
            maskImgData.data[idx + 1] = 0;
            maskImgData.data[idx + 2] = 0;
            maskImgData.data[idx + 3] = v;
          }
          maskCtx.putImageData(maskImgData, 0, 0);

          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(maskCanvas, 0, 0);
        }

        const newSrc = canvas.toDataURL('image/png');
        const newLayer: TelaImageLayer = {
          id: `lyr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: `${sourceLayer.name || 'Layer'} (Copy)`,
          src: newSrc,
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          blend: sourceLayer.blend || 'normal',
          visible: true,
          adjust: { brightness: 1, contrast: 1, saturate: 1, exposure: 0, blur: 0 },
        };
        resolve(newLayer);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => resolve(null);
    img.src = sourceLayer.src;
  });
}

/**
 * Erases pixels within the active selection from the source layer (Delete / Backspace).
 */
export async function deleteSelectedPixels(
  sourceLayer: TelaImageLayer,
  selection: Selection,
  canvasW: number,
  canvasH: number
): Promise<string | null> {
  if (!selection.bounds) return null;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.save();
        ctx.translate(sourceLayer.x, sourceLayer.y);
        if (sourceLayer.rotation) {
          ctx.rotate((sourceLayer.rotation * Math.PI) / 180);
        }
        ctx.scale(sourceLayer.scale, sourceLayer.scale);
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        // Punch out pixels inside selection
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasW;
        maskCanvas.height = canvasH;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
          const maskImgData = maskCtx.createImageData(canvasW, canvasH);
          for (let i = 0; i < selection.data.length; i++) {
            const v = selection.data[i];
            const idx = i * 4;
            maskImgData.data[idx] = 0;
            maskImgData.data[idx + 1] = 0;
            maskImgData.data[idx + 2] = 0;
            maskImgData.data[idx + 3] = v;
          }
          maskCtx.putImageData(maskImgData, 0, 0);

          ctx.globalCompositeOperation = 'destination-out';
          ctx.drawImage(maskCanvas, 0, 0);
        }

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => resolve(null);
    img.src = sourceLayer.src;
  });
}
