/// <reference lib="webworker" />
// faceWorker — MediaPipe FaceLandmarker, off the main thread.
//
// detectForVideo() is SYNCHRONOUS. On the main thread it therefore stalls the compositor for the
// whole of inference — 30-60ms whenever the GPU delegate is unavailable and it falls back to CPU,
// which is most WebViews. That stall is the single largest cause of the puppet feeling laggy, and
// no amount of smoothing hides it because the frames simply are not being drawn.
//
// Here the same call blocks a thread nobody is watching. The main thread hands over an ImageBitmap
// (transferred, not copied) and gets landmarks back by message.
//
// Protocol:
//   main → worker  { type:'init' }                     | { type:'frame', bitmap, ts }
//   worker → main  { type:'ready', ok }                | { type:'result', frame } | { type:'error', message }

export interface WorkerFaceFrame {
  blendshapes: Record<string, number>;
  matrix: number[] | null;
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** Per-face eye geometry (lens engine). Always present; empty when no face. */
  faces: FaceEyes[];
}

import { facesFromLandmarks, type FaceEyes } from './eyeGeometry';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let fl: any = null;
// The VTuber needs blendshapes + head matrix (and exactly one face). The lens engine needs only
// landmarks, for several faces — and skipping the blendshape/matrix graph is a real saving on phones.
let wantBlend = true;

async function init(numFaces: number, blend: boolean): Promise<boolean> {
  if (fl) return true;
  wantBlend = blend;
  try {
    const vision: any = await import(/* @vite-ignore */ CDN);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    // Same GPU→CPU ladder as the main-thread tracker. Inside a worker the CPU path is far less
    // painful, because the cost lands here rather than on the frame the user is looking at.
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        fl = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO',
          numFaces,
          outputFaceBlendshapes: blend,
          outputFacialTransformationMatrixes: blend,
        });
        break;
      } catch { /* try the next delegate */ }
    }
  } catch (e: any) {
    (self as any).postMessage({ type: 'error', message: e?.message || String(e) });
  }
  return !!fl;
}

function run(bitmap: ImageBitmap, ts: number): WorkerFaceFrame | null {
  const res = fl.detectForVideo(bitmap, ts);
  const cats = res?.faceBlendshapes?.[0]?.categories;
  if (wantBlend ? (!cats || !cats.length) : !res?.faceLandmarks?.[0]?.length) return null;
  const blendshapes: Record<string, number> = {};
  for (const c of cats ?? []) blendshapes[c.categoryName] = c.score;

  let bbox: WorkerFaceFrame['bbox'] = null;
  const lm = res?.faceLandmarks?.[0];
  if (lm && lm.length) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of lm) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  const m = res?.facialTransformationMatrixes?.[0]?.data;
  // Plain array, not Float32Array: structured clone handles both, and this keeps the message
  // shape identical whether it came from here or the synchronous fallback tracker.
  const faces = facesFromLandmarks(res?.faceLandmarks, bitmap.width / Math.max(1, bitmap.height));
  return { blendshapes, matrix: m ? Array.from(m as ArrayLike<number>) : null, bbox, faces };
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  if (msg.type === 'init') {
    (self as any).postMessage({ type: 'ready', ok: await init(Math.max(1, msg.numFaces | 0 || 1), msg.blendshapes !== false) });
    return;
  }
  if (msg.type === 'frame') {
    const bitmap: ImageBitmap = msg.bitmap;
    let frame: WorkerFaceFrame | null = null;
    try {
      if (fl) frame = run(bitmap, msg.ts);
    } catch { /* a dropped frame is not worth reporting; the next one will land */ }
    finally {
      // Always close. A transferred bitmap that is never closed leaks GPU memory every frame,
      // which on a long stream is measured in gigabytes.
      try { bitmap.close(); } catch { /* */ }
    }
    // Always reply, even with null — the sender uses this to clear its busy flag, and skipping
    // it on a no-face frame would wedge detection permanently.
    (self as any).postMessage({ type: 'result', frame });
  }
};
