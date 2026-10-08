/**
 * fabulaMonitorWorker.ts — Off-main-thread WebGL2 Color Grade Monitor Worker.
 *
 * Runs the WebGL2 Compositor on a transferred OffscreenCanvas.
 * Receives ImageBitmap / VideoFrame frames and grading descriptors (lift/gamma/gain wheels,
 * tone curves LUT, HSL qualifier, power window) from the main thread.
 * Guarantees zero UI hitching or dropped frames during live color manipulation.
 */

import { Compositor, LayerInput, GradeParams } from '../../plajahPixels/engine/core/compositor';

const ctx: any = self;
let comp: Compositor | null = null;
let isBusy = false;

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      comp = new Compositor(msg.canvas as OffscreenCanvas);
      ctx.postMessage({ type: 'ready' });
    } catch (err: any) {
      ctx.postMessage({ type: 'error', message: err?.message || String(err) });
    }
    return;
  }

  if (msg.type === 'frame' && comp) {
    const { bitmap, width, height, grade, grades } = msg;
    if (isBusy) {
      bitmap?.close?.();
      return;
    }
    isBusy = true;
    try {
      comp.resize(width || 640, height || 360);
      const input: LayerInput = {
        element: bitmap,
        opacity: 1,
        blendMode: 'normal',
        ...(grades && grades.length ? { grades } : { grade }),
      };
      comp.render([input]);
      bitmap?.close?.();
      ctx.postMessage({ type: 'rendered' });
    } catch (err: any) {
      bitmap?.close?.();
      ctx.postMessage({ type: 'frame_error', message: err?.message || String(err) });
    } finally {
      isBusy = false;
    }
    return;
  }

  if (msg.type === 'dispose') {
    try {
      comp?.dispose();
    } catch { /* noop */ }
    comp = null;
    isBusy = false;
  }
};
