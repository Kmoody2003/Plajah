/// <reference lib="webworker" />
// matteWorker — the selfie segmenter off the main thread. It runs every ~66ms for most art lenses, and
// inline it held up the whole camera (preview and broadcast) for the length of each inference.
//
//   main → worker  { type:'init' }  | { type:'frame', bitmap, ts }
//   worker → main  { type:'ready', ok } | { type:'result', mask?: Uint8Array, w, h }

import '../vtuber/workerImportScripts'; // MediaPipe needs importScripts, which module workers lack

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

let seg: any = null;

async function init(): Promise<boolean> {
  if (seg) return true;
  try {
    const vision: any = await import(/* @vite-ignore */ CDN);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    seg = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'VIDEO', outputConfidenceMasks: true,
    });
  } catch { /* reported as ok:false */ }
  return !!seg;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  if (msg.type === 'init') {
    (self as any).postMessage({ type: 'ready', ok: await init() });
    return;
  }
  if (msg.type === 'frame') {
    const bitmap: ImageBitmap = msg.bitmap;
    let mask: Uint8Array | undefined, w = 0, h = 0;
    try {
      const res = seg?.segmentForVideo(bitmap, msg.ts);
      const m = res?.confidenceMasks?.[0];
      if (m) {
        const f: Float32Array = m.getAsFloat32Array();
        w = m.width; h = m.height;
        mask = new Uint8Array(f.length);
        for (let i = 0; i < f.length; i++) mask[i] = Math.max(0, Math.min(255, (f[i] * 255) | 0));
      }
      res?.close?.();
    } catch { /* dropped frame */ }
    finally { try { bitmap.close(); } catch { /* */ } }
    // Always reply: it clears the sender's busy flag.
    (self as any).postMessage({ type: 'result', mask, w, h }, mask ? [mask.buffer] : []);
  }
};
