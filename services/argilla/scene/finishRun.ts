/** finishRun.ts — finishes an object in a worker. A 2048 paint and a normal bake take several seconds. */

import type { ClayFieldSnapshot } from '../engine';
import type { FinishedObject, PictureDepth, SurfaceParts } from './finishObject';

export interface LinePictureSource {
  rgba: Uint8ClampedArray; width: number; height: number;
  mask: Float32Array; maskSize: number;
  u0: number; uk: number; v0: number; vk: number;
  /** False when the shape can't line up with the picture: it then takes only the picture's colours. */
  sharp: boolean;
  parts?: SurfaceParts;
  depth?: PictureDepth;
}

export function finishInWorker(field: ClayFieldSnapshot, source: LinePictureSource | null, textureSize = 2048, fine = false) {
  return new Promise<FinishedObject>((resolve, reject) => {
    const worker = new Worker(new URL('./finishObject.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { worker.terminate(); if (data.made) resolve(data.made); else reject(new Error(data.error)); };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Could not finish this object.')); };
    worker.postMessage({ field, source, textureSize, fine });
  });
}
