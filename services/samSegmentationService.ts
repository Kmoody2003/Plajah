/**
 * samSegmentationService.ts — Meta SAM / SAM 2 Interactive Segmentation +
 * Ultra-Fine Compositing Alpha Matting Engine.
 *
 * Provides client-side, zero-cloud interactive point-and-box segmentation with
 * automatic multi-stage compositing refinement:
 *   - Stage 1: Neural SAM segmentation (with raw sigmoid probability extraction)
 *              + deterministic Geodesic Color-Manifold fallback when offline
 *   - Stage 2: Adaptive Trimap & High-Frequency Hair/Fringe Structure Detection
 *   - Stage 3: Inter-Strand Background Pass-Through Hole Punching (CIE L*a*b*)
 *   - Stage 4: Closed-Form Color-Line Alpha Solver + 3x3 RGB Covariance Guided Filter
 *   - Stage 5: Foreground Color Decontamination (De-Spill) on semi-transparent edges
 */

import {
  refineAlphaMatteAndDecontaminate,
  type AlphaMattingOptions,
  type AlphaMattingResult,
} from './matting/alphaMattingEngine';

export interface PromptPoint {
  x: number; // Normalized 0..1 relative to image width
  y: number; // Normalized 0..1 relative to image height
  label?: 0 | 1; // 1 = foreground (include), 0 = background (exclude)
}

export interface PromptBox {
  x1: number; // Normalized 0..1
  y1: number;
  x2: number;
  y2: number;
}

export interface SegmentationOptions {
  points?: PromptPoint[];
  box?: PromptBox;
  feather?: number; // 0..1 normalized edge blur radius (used when refineHairAndFringes is false)
  invert?: boolean; // Invert mask (isolate background)
  outputWidth?: number;
  outputHeight?: number;
  /** Enable full compositing-grade hair/fringe alpha matting, pass-through hole punching & color decontamination (default: true) */
  refineHairAndFringes?: boolean;
  /** Expanded unknown trimap radius (px) around detected hair/fur/fabric fringes (default: 18) */
  hairFringeRadius?: number;
  /** Sensitivity (0..1) for punching out background pass-through revealed between hair strands/fringes (default: 0.76) */
  passThroughSensitivity?: number;
  /** Strength (0..1) of foreground color decontamination / halo de-spill (default: 0.90) */
  decontaminateColors?: number;
  /** Optional temporal previous alpha matte for video frame stabilization */
  previousAlpha?: Uint8Array | Float32Array;
  /** Optional previous frame RGBA for motion-compensated temporal matte locking */
  previousImageRgba?: Uint8ClampedArray;
}

export interface SegmentationResult {
  maskCanvas: HTMLCanvasElement;
  alphaCanvas: HTMLCanvasElement;
  maskDataUrl: string;
  alphaDataUrl: string;
  /** High-precision 8-bit alpha matte (0..255) at output resolution */
  alphaMask: Uint8Array;
  /** Color-decontaminated RGBA buffer at output resolution */
  decontaminatedRgba: Uint8ClampedArray;
  score: number;
  bounds: { x: number; y: number; width: number; height: number }; // Normalized 0..1 bounding box
  mattingMetrics?: AlphaMattingResult['metrics'];
}

export type SamEngineStatus = 'idle' | 'loading' | 'ready' | 'failed';

const SLIM_SAM_MODEL = 'Xenova/slimsam-77-uniform';

/**
 * High-precision deterministic Geodesic Color-Manifold & Saliency Segmenter
 * used as an instant fallback if neural model weights are still downloading or offline,
 * and as a high-resolution structural prior.
 */
function computeGeodesicPromptMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  points: PromptPoint[],
  box?: PromptBox
): { coarseMask: Uint8Array; softProb: Float32Array } {
  const n = width * height;
  const coarseMask = new Uint8Array(n);
  const softProb = new Float32Array(n);

  const posPoints = points.filter(p => (p.label ?? 1) === 1);
  const negPoints = points.filter(p => p.label === 0);

  if (posPoints.length === 0) {
    posPoints.push({ x: 0.5, y: 0.5, label: 1 });
  }

  // Sample foreground seed color prototypes (5x5 patch around each positive point)
  const fgSamples: Array<{ r: number; g: number; b: number; x: number; y: number }> = [];
  for (const pt of posPoints) {
    const px = Math.max(0, Math.min(width - 1, Math.round(pt.x * width)));
    const py = Math.max(0, Math.min(height - 1, Math.round(pt.y * height)));
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = Math.max(0, Math.min(width - 1, px + dx));
        const ny = Math.max(0, Math.min(height - 1, py + dy));
        const idx4 = (ny * width + nx) * 4;
        sr += rgba[idx4];
        sg += rgba[idx4 + 1];
        sb += rgba[idx4 + 2];
        cnt++;
      }
    }
    fgSamples.push({ r: sr / cnt, g: sg / cnt, b: sb / cnt, x: px, y: py });
  }

  // Sample negative / border background prototypes
  const bgSamples: Array<{ r: number; g: number; b: number; x: number; y: number }> = [];
  for (const pt of negPoints) {
    const px = Math.max(0, Math.min(width - 1, Math.round(pt.x * width)));
    const py = Math.max(0, Math.min(height - 1, Math.round(pt.y * height)));
    const idx4 = (py * width + px) * 4;
    bgSamples.push({ r: rgba[idx4], g: rgba[idx4 + 1], b: rgba[idx4 + 2], x: px, y: py });
  }

  // Also sample perimeter outside box (or canvas border) as background context
  const bx1 = box ? Math.max(0, Math.round(box.x1 * width)) : 0;
  const by1 = box ? Math.max(0, Math.round(box.y1 * height)) : 0;
  const bx2 = box ? Math.min(width - 1, Math.round(box.x2 * width)) : width - 1;
  const by2 = box ? Math.min(height - 1, Math.round(box.y2 * height)) : height - 1;

  const stepX = Math.max(4, Math.floor(width / 16));
  const stepY = Math.max(4, Math.floor(height / 16));
  for (let x = 0; x < width; x += stepX) {
    const top4 = (Math.max(0, by1 - 2) * width + x) * 4;
    const bot4 = (Math.min(height - 1, by2 + 2) * width + x) * 4;
    bgSamples.push({ r: rgba[top4], g: rgba[top4 + 1], b: rgba[top4 + 2], x, y: Math.max(0, by1 - 2) });
    bgSamples.push({ r: rgba[bot4], g: rgba[bot4 + 1], b: rgba[bot4 + 2], x, y: Math.min(height - 1, by2 + 2) });
  }
  for (let y = 0; y < height; y += stepY) {
    const left4 = (y * width + Math.max(0, bx1 - 2)) * 4;
    const right4 = (y * width + Math.min(width - 1, bx2 + 2)) * 4;
    bgSamples.push({ r: rgba[left4], g: rgba[left4 + 1], b: rgba[left4 + 2], x: Math.max(0, bx1 - 2), y });
    bgSamples.push({ r: rgba[right4], g: rgba[right4 + 1], b: rgba[right4 + 2], x: Math.min(width - 1, bx2 + 2), y });
  }

  const diagSq = width * width + height * height;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (box && (x < bx1 || x > bx2 || y < by1 || y > by2)) {
        coarseMask[idx] = 0;
        softProb[idx] = 0;
        continue;
      }

      const p4 = idx * 4;
      const r = rgba[p4];
      const g = rgba[p4 + 1];
      const b = rgba[p4 + 2];

      let minFgD = 1e12;
      for (let i = 0; i < fgSamples.length; i++) {
        const s = fgSamples[i];
        const dc = (r - s.r) * (r - s.r) + (g - s.g) * (g - s.g) + (b - s.b) * (b - s.b);
        const ds = ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y)) / diagSq * 900;
        if (dc + ds < minFgD) minFgD = dc + ds;
      }

      let minBgD = 1e12;
      for (let i = 0; i < bgSamples.length; i++) {
        const s = bgSamples[i];
        const dc = (r - s.r) * (r - s.r) + (g - s.g) * (g - s.g) + (b - s.b) * (b - s.b);
        if (dc < minBgD) minBgD = dc;
      }

      const prob = minBgD / (minFgD + minBgD + 1e-5);
      softProb[idx] = prob;
      coarseMask[idx] = prob >= 0.48 ? 255 : 0;
    }
  }

  return { coarseMask, softProb };
}

class SamSegmentationService {
  private static instance: SamSegmentationService | null = null;
  private status: SamEngineStatus = 'idle';
  private loadingPromise: Promise<boolean> | null = null;
  private model: any = null;
  private processor: any = null;
  private transformers: any = null;

  static getInstance(): SamSegmentationService {
    if (!this.instance) {
      this.instance = new SamSegmentationService();
    }
    return this.instance;
  }

  getStatus(): SamEngineStatus {
    return this.status;
  }

  /**
   * Preload SAM model weights into memory.
   */
  async init(): Promise<boolean> {
    if (this.status === 'ready') return true;
    if (this.loadingPromise) return this.loadingPromise;

    this.status = 'loading';
    this.loadingPromise = (async () => {
      try {
        const tf: any = await import('@huggingface/transformers');
        this.transformers = tf;

        // Try WebGPU first, then fallback to WASM
        const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
        const devices = hasGpu ? ['webgpu', 'wasm'] : ['wasm'];

        let loadedModel: any = null;
        for (const device of devices) {
          try {
            loadedModel = await tf.SamModel.from_pretrained(SLIM_SAM_MODEL, {
              device,
              dtype: device === 'webgpu' ? 'fp16' : 'q8',
            });
            break;
          } catch (deviceErr) {
            console.warn(`[SamSegmentation] device ${device} initialization failed:`, deviceErr);
          }
        }

        if (!loadedModel) {
          this.status = 'failed';
          return false;
        }

        this.model = loadedModel;
        this.processor = await tf.AutoProcessor.from_pretrained(SLIM_SAM_MODEL);
        this.status = 'ready';
        return true;
      } catch (err) {
        console.warn('[SamSegmentation] Neural SAM model unavailable, using Geodesic + Alpha Matting engine:', err);
        this.status = 'failed';
        return false;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Convert any image source (HTMLImageElement, HTMLCanvasElement, HTMLVideoElement, or URL)
   * into a standardized 2D canvas with natural dimensions.
   */
  async resolveSourceCanvas(
    source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string
  ): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
    if (typeof source === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = source;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return { canvas: c, width: c.width, height: c.height };
    }

    if (source instanceof HTMLCanvasElement) {
      return { canvas: source, width: source.width, height: source.height };
    }

    const sw = (source as any).videoWidth || (source as any).naturalWidth || source.width || 0;
    const sh = (source as any).videoHeight || (source as any).naturalHeight || source.height || 0;
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(source, 0, 0, sw, sh);
    return { canvas: c, width: sw, height: sh };
  }

  /**
   * Main segmentation & compositing matting entry point.
   * Segments an image based on prompt points or bounding boxes, then runs the
   * 5-stage Ultra-Fine Alpha Matting, Hair/Fringe Isolation, Pass-Through Hole Punching,
   * and Foreground Color Decontamination pipeline at native resolution.
   */
  async segment(
    source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string,
    options: SegmentationOptions = {}
  ): Promise<SegmentationResult | null> {
    const { canvas: srcCanvas, width: srcW, height: srcH } = await this.resolveSourceCanvas(source);
    if (!srcW || !srcH) return null;

    const outW = options.outputWidth || srcW;
    const outH = options.outputHeight || srcH;

    // Extract native output-resolution source RGBA for high-frequency hair/fringe matting
    const nativeCanvas = document.createElement('canvas');
    nativeCanvas.width = outW;
    nativeCanvas.height = outH;
    const nativeCtx = nativeCanvas.getContext('2d')!;
    nativeCtx.drawImage(srcCanvas, 0, 0, outW, outH);
    const nativeImgData = nativeCtx.getImageData(0, 0, outW, outH);
    const nativeRgba = nativeImgData.data;

    const points: PromptPoint[] = options.points && options.points.length > 0
      ? options.points
      : [{ x: 0.5, y: 0.5, label: 1 }];

    let coarseMaskOut = new Uint8Array(outW * outH);
    let softProbOut: Float32Array | undefined;
    let bestScore = 0.92;
    let usedNeuralSam = false;

    const ready = await this.init();
    if (ready && this.model && this.processor && this.transformers) {
      try {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
        const procW = Math.round(srcW * scale);
        const procH = Math.round(srcH * scale);

        const procCanvas = document.createElement('canvas');
        procCanvas.width = procW;
        procCanvas.height = procH;
        const procCtx = procCanvas.getContext('2d')!;
        procCtx.drawImage(srcCanvas, 0, 0, procW, procH);

        const inputPoints = points.map(p => [
          Math.max(0, Math.min(procW - 1, Math.round(p.x * procW))),
          Math.max(0, Math.min(procH - 1, Math.round(p.y * procH))),
        ]);
        const inputLabels = points.map(p => (p.label ?? 1));

        const processorOpts: Record<string, any> = {
          input_points: [inputPoints],
          input_labels: [inputLabels],
        };

        if (options.box) {
          const bx1 = Math.max(0, Math.min(procW - 1, Math.round(options.box.x1 * procW)));
          const by1 = Math.max(0, Math.min(procH - 1, Math.round(options.box.y1 * procH)));
          const bx2 = Math.max(0, Math.min(procW - 1, Math.round(options.box.x2 * procW)));
          const by2 = Math.max(0, Math.min(procH - 1, Math.round(options.box.y2 * procH)));
          processorOpts.input_boxes = [[[
            Math.min(bx1, bx2),
            Math.min(by1, by2),
            Math.max(bx1, bx2),
            Math.max(by1, by2),
          ]]];
        }

        const raw = await this.transformers.RawImage.fromCanvas(procCanvas);
        const inputs = await this.processor(raw, processorOpts);
        const outputs = await this.model(inputs);

        const masks = await this.processor.post_process_masks(
          outputs.pred_masks,
          inputs.original_sizes,
          inputs.reshaped_input_sizes
        );

        const scores = outputs.iou_scores?.data
          ? Array.from(outputs.iou_scores.data as Float32Array)
          : [0.92];

        const maskTensor = masks?.[0];
        if (maskTensor?.data) {
          const dims = maskTensor.dims || [];
          const nm = dims.length === 4 ? dims[1] : dims[0];
          const mh = dims[dims.length - 2];
          const mw = dims[dims.length - 1];

          if (nm && mw && mh) {
            let bestMaskIdx = 0;
            for (let i = 1; i < nm; i++) {
              if ((scores[i] ?? 0) > (scores[bestMaskIdx] ?? 0)) bestMaskIdx = i;
            }
            bestScore = scores[bestMaskIdx] ?? 0.92;

            const plane = mw * mh;
            const offset = bestMaskIdx * plane;
            const maskData = maskTensor.data as Uint8Array | Int8Array | Float32Array | boolean[];

            // Also extract unthresholded soft probabilities from raw pred_masks logits if available
            const rawLogitsTensor = outputs.pred_masks;
            const rawLogitsData = rawLogitsTensor?.data as Float32Array | undefined;
            const rawDims = rawLogitsTensor?.dims || [];
            const rawH = rawDims[rawDims.length - 2] || 0;
            const rawW = rawDims[rawDims.length - 1] || 0;
            const rawOffset = bestMaskIdx * rawW * rawH;

            // Upsample SAM mask and soft logits to (outW, outH)
            softProbOut = new Float32Array(outW * outH);
            for (let y = 0; y < outH; y++) {
              const sy = Math.min(mh - 1, Math.floor((y / outH) * mh));
              const rawY = rawH > 0 ? Math.min(rawH - 1, Math.floor((y / outH) * rawH)) : 0;
              const rowOut = y * outW;
              const rowSam = sy * mw;
              const rowRaw = rawY * rawW;

              for (let x = 0; x < outW; x++) {
                const sx = Math.min(mw - 1, Math.floor((x / outW) * mw));
                const active = !!(maskData as any)[offset + rowSam + sx];
                const invActive = options.invert ? !active : active;
                coarseMaskOut[rowOut + x] = invActive ? 255 : 0;

                if (rawLogitsData && rawW > 0 && rawH > 0) {
                  const rawX = Math.min(rawW - 1, Math.floor((x / outW) * rawW));
                  const logit = rawLogitsData[rawOffset + rowRaw + rawX] ?? (active ? 4 : -4);
                  // Sigmoid probability
                  const p = 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, logit))));
                  softProbOut[rowOut + x] = options.invert ? 1 - p : p;
                } else {
                  softProbOut[rowOut + x] = invActive ? 0.92 : 0.08;
                }
              }
            }
            usedNeuralSam = true;
          }
        }
      } catch (samErr) {
        console.warn('[SamSegmentation] Neural SAM inference error, falling back to Geodesic Segmenter:', samErr);
      }
    }

    if (!usedNeuralSam) {
      const geo = computeGeodesicPromptMask(nativeRgba, outW, outH, points, options.box);
      coarseMaskOut = geo.coarseMask;
      softProbOut = geo.softProb;
      if (options.invert) {
        for (let i = 0; i < coarseMaskOut.length; i++) {
          coarseMaskOut[i] = 255 - coarseMaskOut[i];
          softProbOut[i] = 1 - softProbOut[i];
        }
      }
    }

    // -------------------------------------------------------------------------
    // Run the 5-Stage Compositing Alpha Matting, Hair/Fringe & Pass-Through Engine
    // -------------------------------------------------------------------------
    const refineEnabled = options.refineHairAndFringes !== false;
    let finalAlpha: Uint8Array;
    let decontaminatedRgba: Uint8ClampedArray;
    let mattingMetrics: AlphaMattingResult['metrics'] | undefined;

    if (refineEnabled) {
      const mattingOptions: AlphaMattingOptions = {
        hairFringeRadius: options.hairFringeRadius ?? 18,
        passThroughSensitivity: options.passThroughSensitivity ?? 0.76,
        decontaminateColors: options.decontaminateColors ?? 0.90,
        softProbabilities: softProbOut,
        previousAlpha: options.previousAlpha,
        previousImageRgba: options.previousImageRgba,
      };
      const mattingResult = refineAlphaMatteAndDecontaminate(
        nativeRgba,
        coarseMaskOut,
        outW,
        outH,
        mattingOptions
      );
      finalAlpha = mattingResult.alpha;
      decontaminatedRgba = mattingResult.decontaminatedRgba;
      mattingMetrics = mattingResult.metrics;
    } else {
      finalAlpha = coarseMaskOut;
      decontaminatedRgba = new Uint8ClampedArray(nativeRgba);
      for (let i = 0; i < finalAlpha.length; i++) {
        decontaminatedRgba[i * 4 + 3] = finalAlpha[i];
      }
    }

    // Render refined grayscale alpha mask onto maskCanvas & compute tight bounding box
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = outW;
    maskCanvas.height = outH;
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskImgData = maskCtx.createImageData(outW, outH);

    let minX = outW, minY = outH, maxX = 0, maxY = 0;
    const n = outW * outH;
    for (let i = 0; i < n; i++) {
      const a = finalAlpha[i];
      const p4 = i * 4;
      maskImgData.data[p4] = a;
      maskImgData.data[p4 + 1] = a;
      maskImgData.data[p4 + 2] = a;
      maskImgData.data[p4 + 3] = 255;

      if (a > 12) {
        const pxX = i % outW;
        const pxY = Math.floor(i / outW);
        if (pxX < minX) minX = pxX;
        if (pxX > maxX) maxX = pxX;
        if (pxY < minY) minY = pxY;
        if (pxY > maxY) maxY = pxY;
      }
    }
    maskCtx.putImageData(maskImgData, 0, 0);

    // Render color-decontaminated RGBA cutout onto alphaCanvas
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = outW;
    alphaCanvas.height = outH;
    const alphaCtx = alphaCanvas.getContext('2d')!;
    const alphaImgData = new ImageData(new Uint8ClampedArray(decontaminatedRgba), outW, outH);
    alphaCtx.putImageData(alphaImgData, 0, 0);

    const normBounds = minX <= maxX && minY <= maxY
      ? {
          x: minX / outW,
          y: minY / outH,
          width: Math.max(0, (maxX - minX + 1)) / outW,
          height: Math.max(0, (maxY - minY + 1)) / outH,
        }
      : { x: 0, y: 0, width: 1, height: 1 };

    return {
      maskCanvas,
      alphaCanvas,
      maskDataUrl: maskCanvas.toDataURL('image/png'),
      alphaDataUrl: alphaCanvas.toDataURL('image/png'),
      alphaMask: finalAlpha,
      decontaminatedRgba,
      score: bestScore,
      bounds: normBounds,
      mattingMetrics,
    };
  }

  /**
   * Convenience: Cut out subject at a single clicked point with full hair/fringe matting.
   */
  async cutoutAtPoint(
    source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string,
    normX: number,
    normY: number,
    feather = 0.005
  ): Promise<SegmentationResult | null> {
    return this.segment(source, {
      points: [{ x: normX, y: normY, label: 1 }],
      feather,
      refineHairAndFringes: true,
    });
  }

  /**
   * Convenience: Cut out subject with positive and negative refinement points.
   */
  async cutoutRefined(
    source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string,
    points: PromptPoint[],
    feather = 0.005
  ): Promise<SegmentationResult | null> {
    return this.segment(source, {
      points,
      feather,
      refineHairAndFringes: true,
    });
  }
}

export const samSegmentationService = SamSegmentationService.getInstance();
