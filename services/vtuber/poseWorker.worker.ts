/// <reference lib="webworker" />
// poseWorker — MediaPipe PoseLandmarker off the main thread (same protocol as faceWorker).
//
//   main → worker  { type:'init', full, segmentation }  | { type:'frame', bitmap, ts }
//   worker → main  { type:'ready', ok }                  | { type:'result', frame }

import './workerImportScripts'; // MediaPipe needs importScripts, which module workers lack
import type { PoseFrame } from './poseTracker';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const LITE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FULL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

let pl: any = null;
let wantMask = false;

async function init(full: boolean, segmentation: boolean): Promise<boolean> {
  if (pl) return true;
  wantMask = segmentation;
  try {
    const vision: any = await import(/* @vite-ignore */ CDN);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        pl = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: full ? FULL : LITE, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          outputSegmentationMasks: segmentation,
        });
        break;
      } catch { /* try the next delegate */ }
    }
  } catch { /* reported as ok:false */ }
  return !!pl;
}

function run(bitmap: ImageBitmap, ts: number): PoseFrame | null {
  const res = pl.detectForVideo(bitmap, ts);
  let mask: PoseFrame['mask'];
  const masks = res?.segmentationMasks;
  if (wantMask && masks?.[0]) {
    try {
      const m = masks[0];
      mask = { data: new Float32Array(m.getAsFloat32Array()), w: m.width, h: m.height };
    } catch { /* mask readback failed this frame */ }
  }
  for (const m of masks ?? []) { try { m.close(); } catch { /* */ } }
  const lm = res?.landmarks?.[0];
  if (!lm || !lm.length) return null;
  const wl = res?.worldLandmarks?.[0];
  return {
    pts: lm.map((p: any) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })),
    world: wl?.map((p: any, i: number) => ({ x: p.x, y: p.y, z: p.z, v: lm[i]?.visibility ?? 1 })),
    mask,
  };
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  if (msg.type === 'init') {
    (self as any).postMessage({ type: 'ready', ok: await init(!!msg.full, !!msg.segmentation) });
    return;
  }
  if (msg.type === 'frame') {
    const bitmap: ImageBitmap = msg.bitmap;
    let frame: PoseFrame | null = null;
    try {
      if (pl) frame = run(bitmap, msg.ts);
    } catch { /* dropped frame */ }
    finally {
      try { bitmap.close(); } catch { /* */ }
    }
    // Always reply (clears the sender's busy flag). The mask's buffer is transferred, not copied.
    const transfer = frame?.mask ? [frame.mask.data.buffer] : [];
    (self as any).postMessage({ type: 'result', frame }, transfer);
  }
};
