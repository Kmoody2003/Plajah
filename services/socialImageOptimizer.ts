// socialImageOptimizer.ts — high-efficiency image compression & optimization for social media.
//
// Modeled after compression pipelines used by Instagram, X, Facebook, and Snapchat:
// 1. Resizes massive raw camera images (e.g. 12MP/48MP, 5-20MB) to standard display bounds
//    (max 1440px longest edge for crisp 2x retina display).
// 2. High-efficiency WebP encoding (with JPEG fallback) at 0.82 quality, reducing file size
//    by 90-98% without perceptible loss of sharpness.
// 3. Handles EXIF orientation automatically via createImageBitmap / canvas.
// 4. Generates a companion lightweight thumbnail (max 320px, ~20KB) for instant placeholder rendering.
// 5. Safely bypasses animated GIFs, SVGs, and non-image blobs.

export const MAX_DISPLAY_EDGE = 1440;
export const MAX_THUMB_EDGE = 320;
export const DISPLAY_QUALITY = 0.82;
export const THUMB_QUALITY = 0.75;

export interface OptimizedSocialImage {
  file: File;
  thumbnail?: File;
  width: number;
  height: number;
  aspectRatio: number;
  originalSize: number;
  compressedSize: number;
  savingsRatio: number;
}

let webpSupported: boolean | null = null;

export function checkWebpEncodeSupport(): boolean {
  if (webpSupported !== null) return webpSupported;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

export function isCompressibleImage(file: Blob): boolean {
  const type = file.type || '';
  // Only compress raster images. Bypass GIFs (to preserve animations) and SVGs (vector).
  return /^image\/(jpeg|jpg|png|webp|bmp|heic|heif)/i.test(type);
}

function scaleDimensions(width: number, height: number, maxEdge: number): { w: number; h: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { w: width, h: height };
  }
  const ratio = maxEdge / longest;
  return {
    w: Math.max(1, Math.round(width * ratio)),
    h: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Load an ImageBitmap from a File or Blob, respecting EXIF orientation.
 */
async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // Fallback to standard Image element
      }
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
    img.src = url;
  });
}

/**
 * Compresses an image file for social posts:
 * - Downscales to max 1440px longest edge.
 * - Encodes to WebP (or JPEG if WebP encoding unsupported).
 * - Creates a 320px companion thumbnail for rapid feed display.
 * - If compression fails or the original is already smaller, gracefully preserves the original.
 */
export async function compressSocialImage(file: File): Promise<OptimizedSocialImage> {
  const originalSize = file.size;

  // If not a compressible image type (e.g. GIF, SVG, non-image), return as-is
  if (!isCompressibleImage(file)) {
    return {
      file,
      width: 0,
      height: 0,
      aspectRatio: 1,
      originalSize,
      compressedSize: originalSize,
      savingsRatio: 0,
    };
  }

  let source: ImageBitmap | HTMLImageElement | null = null;
  try {
    source = await loadBitmap(file);
    const srcWidth = source.width;
    const srcHeight = source.height;
    const aspectRatio = srcWidth / (srcHeight || 1);

    const useWebp = checkWebpEncodeSupport();
    const mimeType = useWebp ? 'image/webp' : 'image/jpeg';
    const ext = useWebp ? 'webp' : 'jpg';

    // 1. Build Main Display Image
    const displayDims = scaleDimensions(srcWidth, srcHeight, MAX_DISPLAY_EDGE);
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = displayDims.w;
    displayCanvas.height = displayDims.h;
    const displayCtx = displayCanvas.getContext('2d');

    if (!displayCtx) {
      throw new Error('Canvas 2D context unavailable');
    }

    displayCtx.imageSmoothingEnabled = true;
    (displayCtx as any).imageSmoothingQuality = 'high';
    displayCtx.drawImage(source, 0, 0, displayDims.w, displayDims.h);

    const displayBlob = await canvasToBlob(displayCanvas, mimeType, DISPLAY_QUALITY);

    // 2. Build Thumbnail
    let thumbFile: File | undefined;
    const thumbDims = scaleDimensions(srcWidth, srcHeight, MAX_THUMB_EDGE);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbDims.w;
    thumbCanvas.height = thumbDims.h;
    const thumbCtx = thumbCanvas.getContext('2d');

    if (thumbCtx) {
      thumbCtx.imageSmoothingEnabled = true;
      (thumbCtx as any).imageSmoothingQuality = 'high';
      thumbCtx.drawImage(source, 0, 0, thumbDims.w, thumbDims.h);
      const thumbBlob = await canvasToBlob(thumbCanvas, mimeType, THUMB_QUALITY);
      if (thumbBlob) {
        const thumbName = `thumb_${file.name.replace(/\.[^/.]+$/, '')}.${ext}`;
        thumbFile = new File([thumbBlob], thumbName, { type: mimeType });
      }
    }

    // If display compression yielded a valid, smaller blob, wrap it in a File
    let finalFile = file;
    let compressedSize = originalSize;

    if (displayBlob && displayBlob.size < originalSize) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const compressedName = `${baseName}.${ext}`;
      finalFile = new File([displayBlob], compressedName, { type: mimeType });
      compressedSize = displayBlob.size;
    }

    const savingsRatio = originalSize > 0 ? (originalSize - compressedSize) / originalSize : 0;

    return {
      file: finalFile,
      thumbnail: thumbFile,
      width: displayDims.w,
      height: displayDims.h,
      aspectRatio,
      originalSize,
      compressedSize,
      savingsRatio,
    };
  } catch (err) {
    console.warn('[socialImageOptimizer] Compression failed, falling back to original file:', err);
    return {
      file,
      width: 0,
      height: 0,
      aspectRatio: 1,
      originalSize,
      compressedSize: originalSize,
      savingsRatio: 0,
    };
  } finally {
    if (source && 'close' in source && typeof (source as ImageBitmap).close === 'function') {
      try {
        (source as ImageBitmap).close();
      } catch {
        /* ignore */
      }
    }
  }
}
