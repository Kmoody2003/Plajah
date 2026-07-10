// vtuberEngine.ts — the public VTuber engine. createVTuberStream(input, opts) takes a webcam
// MediaStream, runs markerless face tracking → retarget → avatar render every frame, composites per
// mode, and exposes the result as both an output canvas and a captureStream() MediaStream. That
// stream is the single seam the switcher, live feeds, and Fabula all consume — none of them know
// anything about the tracking/avatar internals.
//
// Avatar can be a 3D VRM (avatarUrl, or a generated VRM descriptor) OR a 2D live-puppet built from a
// character sheet (PUPPET2D descriptor). Both are driven by the SAME tracker + retargeter — only the
// render path differs (three-vrm rig vs. 2D-puppet warp).
//
// Phase 1: AVATAR_ONLY + PIP (face tracking). Body-overlay/segmentation + hands are Phase 3.

import { FaceTracker } from './faceTracker';
import { FaceRetargeter, type RetargetResult } from './retarget';
import { VrmRig } from './vrmRig';
import { Puppet2DDriver } from './puppet2D';
import type { AvatarDescriptor } from './avatarFactory';

export type VTuberMode = 'AVATAR_ONLY' | 'PIP' | 'FACE_OVERLAY' | 'BODY_OVERLAY' | 'FACE_SWAP';
export interface VTuberBackground { type: 'transparent' | 'color'; value?: string }
export interface VTuberOptions {
  avatarUrl?: string;                 // VRM url (shorthand for a VRM descriptor)
  avatar?: AvatarDescriptor;          // VRM or PUPPET2D — takes precedence over avatarUrl
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

const NEUTRAL: RetargetResult = { expressions: {}, head: { x: 0, y: 0, z: 0 } };

export async function createVTuberStream(input: MediaStream, opts: VTuberOptions): Promise<VTuberHandle> {
  const W = opts.width ?? 1280;
  const H = opts.height ?? 720;
  let mode: VTuberMode = opts.mode ?? 'AVATAR_ONLY';
  let bg: VTuberBackground = opts.background ?? { type: 'transparent' };

  const video = document.createElement('video');
  video.srcObject = input; video.autoplay = true; video.muted = true; (video as any).playsInline = true;
  await video.play().catch(() => { /* may require a gesture upstream */ });

  const tracker = new FaceTracker();
  const retargeter = new FaceRetargeter();

  // ── Avatar render path: VRM rig OR 2D puppet, both → an avatar canvas ──
  const isPuppet = opts.avatar?.kind === 'PUPPET2D';
  let rig: VrmRig | null = null;
  let puppet: Puppet2DDriver | null = null;
  let avatarCanvas: HTMLCanvasElement;
  let avatarCtx: CanvasRenderingContext2D | null = null;

  if (isPuppet && opts.avatar?.kind === 'PUPPET2D') {
    puppet = new Puppet2DDriver(opts.avatar.rig);
    avatarCanvas = document.createElement('canvas'); avatarCanvas.width = W; avatarCanvas.height = H;
    avatarCtx = avatarCanvas.getContext('2d');
    opts.onStatus?.('Puppet ready');
  } else {
    rig = new VrmRig(W, H);
    avatarCanvas = rig.canvas;
    const url = opts.avatar?.kind === 'VRM' ? opts.avatar.url : (opts.avatarUrl ?? '');
    opts.onStatus?.('Loading avatar…');
    await rig.loadAvatar(url);
  }

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;

  opts.onStatus?.('Loading face tracker…');
  tracker.init().then(ok => opts.onStatus?.(ok ? 'Tracking live' : 'Tracker unavailable — needs GPU/network'));

  let lastTs = -1;
  let lastFace: RetargetResult = NEUTRAL;
  let lastBbox: { x: number; y: number; w: number; h: number } | null = null;
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = performance.now();

    if (tracker.isReady && video.readyState >= 2) {
      const ts = Math.max(lastTs + 1, Math.round(t)); // detectForVideo needs monotonic timestamps
      lastTs = ts;
      const frame = tracker.detect(video, ts);
      if (frame) {
        lastFace = retargeter.retarget(frame, t / 1000);
        lastBbox = frame.bbox;
        if (rig) rig.applyFace(lastFace.expressions, lastFace.head);
      }
    }
    // render the avatar to its canvas
    if (rig) rig.render();
    if (puppet && avatarCtx) puppet.render(avatarCtx, W, H, lastFace);

    // composite per mode
    ctx.clearRect(0, 0, W, H);
    if (mode === 'AVATAR_ONLY') {
      if (bg.type === 'color') { ctx.fillStyle = bg.value || '#000'; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(avatarCanvas, 0, 0, W, H);
    } else if (mode === 'PIP') {
      ctx.drawImage(video, 0, 0, W, H);
      const pw = Math.round(W * 0.3), ph = Math.round(H * 0.3);
      ctx.drawImage(avatarCanvas, W - pw - 16, H - ph - 16, pw, ph);
    } else if (mode === 'FACE_SWAP') {
      // Face swap: live camera + the avatar drawn ONTO the real face, tracking position,
      // size and head roll. The avatar canvas is transparent outside the character.
      ctx.drawImage(video, 0, 0, W, H);
      if (lastBbox) {
        const faceW = lastBbox.w * W;
        const cx = (lastBbox.x + lastBbox.w / 2) * W;
        const cy = (lastBbox.y + lastBbox.h / 2) * H;
        const scale = (faceW * 2.4) / avatarCanvas.width; // avatar head ≈ 2.4× the landmark box
        const dw = avatarCanvas.width * scale, dh = avatarCanvas.height * scale;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-lastFace.head.z);
        ctx.drawImage(avatarCanvas, -dw / 2, -dh * 0.42, dw, dh); // avatar face ~42% down its canvas
        ctx.restore();
      }
    } else {
      // FACE_OVERLAY / BODY_OVERLAY — Phase 3 adds face-aligned + segmentation compositing.
      ctx.drawImage(video, 0, 0, W, H);
      ctx.drawImage(avatarCanvas, 0, 0, W, H);
    }
  };
  loop();

  const stream = out.captureStream(opts.fps ?? 30);
  input.getAudioTracks().forEach(tr => { try { stream.addTrack(tr); } catch { /* */ } });

  return {
    canvas: out,
    stream,
    setMode: (m) => { mode = m; },
    setAvatar: (url) => rig ? rig.loadAvatar(url) : Promise.resolve(false), // puppet rigs are fixed
    setBackground: (b) => { bg = b; },
    dispose: () => {
      cancelAnimationFrame(raf);
      tracker.dispose();
      rig?.dispose();
      puppet?.dispose();
      try { (video as any).srcObject = null; } catch { /* */ }
    },
  };
}
