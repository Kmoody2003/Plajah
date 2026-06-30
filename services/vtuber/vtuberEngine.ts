// vtuberEngine.ts — the public VTuber engine. createVTuberStream(input, opts) takes a webcam
// MediaStream, runs markerless face tracking → retarget → VRM render every frame, composites per
// mode, and exposes the result as both an output canvas and a captureStream() MediaStream. That
// stream is the single seam the switcher, live feeds, and Fabula all consume — none of them know
// anything about the tracking/avatar internals.
//
// Phase 1: AVATAR_ONLY + PIP (face tracking). Body-overlay/segmentation + hands are Phase 3.

import { FaceTracker } from './faceTracker';
import { FaceRetargeter } from './retarget';
import { VrmRig } from './vrmRig';

export type VTuberMode = 'AVATAR_ONLY' | 'PIP' | 'FACE_OVERLAY' | 'BODY_OVERLAY';
export interface VTuberBackground { type: 'transparent' | 'color'; value?: string }
export interface VTuberOptions {
  avatarUrl: string;
  mode?: VTuberMode;
  width?: number;
  height?: number;
  background?: VTuberBackground;
  fps?: number;
  onStatus?: (s: string) => void;
}

export interface VTuberHandle {
  canvas: HTMLCanvasElement;            // composited output (for the switcher to drawImage)
  stream: MediaStream;                  // captureStream of the output (for live/WebRTC)
  setMode: (m: VTuberMode) => void;
  setAvatar: (url: string) => Promise<boolean>;
  setBackground: (bg: VTuberBackground) => void;
  dispose: () => void;
}

export async function createVTuberStream(input: MediaStream, opts: VTuberOptions): Promise<VTuberHandle> {
  const W = opts.width ?? 1280;
  const H = opts.height ?? 720;
  let mode: VTuberMode = opts.mode ?? 'AVATAR_ONLY';
  let bg: VTuberBackground = opts.background ?? { type: 'transparent' };

  const video = document.createElement('video');
  video.srcObject = input; video.autoplay = true; video.muted = true; (video as any).playsInline = true;
  await video.play().catch(() => { /* may require a gesture upstream */ });

  const rig = new VrmRig(W, H);
  const tracker = new FaceTracker();
  const retargeter = new FaceRetargeter();

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;

  opts.onStatus?.('Loading avatar…');
  await rig.loadAvatar(opts.avatarUrl);
  opts.onStatus?.('Loading face tracker…');
  tracker.init().then(ok => opts.onStatus?.(ok ? 'Tracking live' : 'Tracker unavailable — needs GPU/network'));

  let lastTs = -1;
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = performance.now();

    if (tracker.isReady && video.readyState >= 2) {
      const ts = Math.max(lastTs + 1, Math.round(t)); // detectForVideo needs monotonic timestamps
      lastTs = ts;
      const frame = tracker.detect(video, ts);
      if (frame) { const r = retargeter.retarget(frame, t / 1000); rig.applyFace(r.expressions, r.head); }
    }
    rig.render();

    ctx.clearRect(0, 0, W, H);
    if (mode === 'AVATAR_ONLY') {
      if (bg.type === 'color') { ctx.fillStyle = bg.value || '#000'; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(rig.canvas, 0, 0, W, H);
    } else if (mode === 'PIP') {
      ctx.drawImage(video, 0, 0, W, H);
      const pw = Math.round(W * 0.3), ph = Math.round(H * 0.3);
      ctx.drawImage(rig.canvas, W - pw - 16, H - ph - 16, pw, ph);
    } else {
      // FACE_OVERLAY / BODY_OVERLAY — Phase 3 adds face-aligned + segmentation compositing.
      // Until then, overlay the avatar over the live frame (full-frame).
      ctx.drawImage(video, 0, 0, W, H);
      ctx.drawImage(rig.canvas, 0, 0, W, H);
    }
  };
  loop();

  const stream = out.captureStream(opts.fps ?? 30);
  // carry the original audio through unchanged
  input.getAudioTracks().forEach(tr => { try { stream.addTrack(tr); } catch { /* */ } });

  return {
    canvas: out,
    stream,
    setMode: (m) => { mode = m; },
    setAvatar: (url) => rig.loadAvatar(url),
    setBackground: (b) => { bg = b; },
    dispose: () => {
      cancelAnimationFrame(raf);
      tracker.dispose();
      rig.dispose();
      try { (video as any).srcObject = null; } catch { /* */ }
    },
  };
}
