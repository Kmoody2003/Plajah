/** run.ts — runs a build in a worker, so several trial builds don't stop the page. */

import type { BuildOptions, BuildResult, ImageReading } from './reconstruct';

export function buildInWorker(reading: ImageReading, options: Omit<BuildOptions, 'onProgress'>, onProgress?: (fraction: number, label: string) => void) {
  return new Promise<BuildResult>((resolve, reject) => {
    const worker = new Worker(new URL('./reconstruct.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.label) { onProgress?.(data.fraction, data.label); return; }
      worker.terminate();
      if (data.result) resolve(data.result);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Could not build from this picture.')); };
    const { mask, maskSize, depth, depthSize, depthBox, aspect } = reading;
    worker.postMessage({ reading: { mask, maskSize, depth, depthSize, depthBox, aspect }, options });
  });
}
