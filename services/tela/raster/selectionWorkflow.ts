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
  | 'select_subject'
  | 'brush_inpaint'
  | 'brush_erase';

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
 * Stamps a circular brush shape onto an existing selection mask.
 */
export function stampBrushCircle(
  sel: Selection,
  cx: number,
  cy: number,
  radius: number,
  value: number = 255
): void {
  const r = Math.max(1, Math.round(radius));
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(sel.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(sel.height - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    const row = y * sel.width;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy2 <= r2) {
        sel.data[row + x] = value;
      }
    }
  }
}

/**
 * Stamps an interpolated brush ribbon between two points for continuous paint strokes.
 */
export function stampBrushLine(
  sel: Selection,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  value: number = 255
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, radius * 0.35);
  const count = Math.ceil(dist / step);
  for (let i = 0; i <= count; i++) {
    const t = count === 0 ? 0 : i / count;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    stampBrushCircle(sel, x, y, radius, value);
  }
}

/**
 * Recomputes bounding box for an active selection.
 */
export function recalculateSelectionBounds(sel: Selection): void {
  let x0 = sel.width;
  let y0 = sel.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < sel.height; y++) {
    const row = y * sel.width;
    for (let x = 0; x < sel.width; x++) {
      if (sel.data[row + x] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  sel.bounds = x1 >= 0 ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null;
}


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

import { refineAlphaMatteAndDecontaminate, type AlphaMattingOptions, type AlphaMattingResult } from '../../matting/alphaMattingEngine';
import { samSegmentationService, type PromptPoint, type PromptBox } from '../../samSegmentationService';

/**
 * Refines an existing selection using the 5-stage Compositing Alpha Matting,
 * Hair/Fringe Isolation, and Inter-Strand Background Pass-Through Hole Punching engine.
 */
export async function refineSelectionHairAndFringes(
  sourceLayer: TelaImageLayer,
  selection: Selection,
  canvasW: number,
  canvasH: number,
  options: AlphaMattingOptions = {}
): Promise<{ selection: Selection; decontaminatedDataUrl: string; metrics: AlphaMattingResult['metrics'] } | null> {
  if (!selection.bounds) return null;
  return new Promise((resolve) => {
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

        const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
        const matting = refineAlphaMatteAndDecontaminate(
          imgData.data,
          selection.data,
          canvasW,
          canvasH,
          {
            hairFringeRadius: options.hairFringeRadius ?? 20,
            passThroughSensitivity: options.passThroughSensitivity ?? 0.78,
            decontaminateColors: options.decontaminateColors ?? 0.92,
            ...options,
          }
        );

        const refinedSel: Selection = {
          width: canvasW,
          height: canvasH,
          data: matting.alpha,
          bounds: null,
        };
        recalculateSelectionBounds(refinedSel);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = canvasW;
        outCanvas.height = canvasH;
        const outCtx = outCanvas.getContext('2d')!;
        outCtx.putImageData(new ImageData(new Uint8ClampedArray(matting.decontaminatedRgba), canvasW, canvasH), 0, 0);

        resolve({
          selection: refinedSel,
          decontaminatedDataUrl: outCanvas.toDataURL('image/png'),
          metrics: matting.metrics,
        });
      } catch (err) {
        console.warn('[Tela Selection] Hair/fringe refinement error:', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = sourceLayer.src;
  });
}

/**
 * Runs AI Object/Subject Selection with automatic Hair/Fringe Isolation,
 * Inter-Strand Background Pass-Through Removal, and Foreground Color Decontamination.
 */
export async function selectSubjectWithHairMatting(
  sourceLayer: TelaImageLayer,
  canvasW: number,
  canvasH: number,
  opts: {
    points?: PromptPoint[];
    box?: PromptBox;
    hairFringeRadius?: number;
    passThroughSensitivity?: number;
    decontaminateColors?: number;
  } = {}
): Promise<{
  selection: Selection;
  cutoutDataUrl: string;
  metrics?: AlphaMattingResult['metrics'];
} | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
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

        const segResult = await samSegmentationService.segment(canvas, {
          points: opts.points,
          box: opts.box,
          outputWidth: canvasW,
          outputHeight: canvasH,
          refineHairAndFringes: true,
          hairFringeRadius: opts.hairFringeRadius ?? 20,
          passThroughSensitivity: opts.passThroughSensitivity ?? 0.78,
          decontaminateColors: opts.decontaminateColors ?? 0.92,
        });

        if (!segResult) {
          resolve(null);
          return;
        }

        const sel: Selection = {
          width: canvasW,
          height: canvasH,
          data: segResult.alphaMask,
          bounds: null,
        };
        recalculateSelectionBounds(sel);

        resolve({
          selection: sel,
          cutoutDataUrl: segResult.alphaDataUrl,
          metrics: segResult.mattingMetrics,
        });
      } catch (err) {
        console.warn('[Tela Selection] Subject hair matting error:', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = sourceLayer.src;
  });
}

/**
 * Extracts pixels in the active selection into a brand new non-destructive layer above (Ctrl+J),
 * performing automatic Foreground Color Decontamination (de-spill) on semi-transparent hair and fringe pixels.
 */
export async function layerViaCopy(
  sourceLayer: TelaImageLayer,
  selection: Selection,
  canvasW: number,
  canvasH: number,
  decontaminateColors: boolean = true
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

        if (decontaminateColors) {
          const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
          const matting = refineAlphaMatteAndDecontaminate(
            imgData.data,
            selection.data,
            canvasW,
            canvasH,
            {
              baseEdgeRadius: 2,
              hairFringeRadius: 14,
              passThroughSensitivity: 0.75,
              decontaminateColors: 0.90,
            }
          );
          ctx.putImageData(new ImageData(new Uint8ClampedArray(matting.decontaminatedRgba), canvasW, canvasH), 0, 0);
        } else {
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
        }

        const newSrc = canvas.toDataURL('image/png');
        const newLayer: TelaImageLayer = {
          id: `lyr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: `${sourceLayer.name || 'Layer'} (Cutout)`,
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

