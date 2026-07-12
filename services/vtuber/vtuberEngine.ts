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
import { DetectFeed } from './detectFeed';
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
  /** Live human-readable tracker state — surfaced on-video so device failures are visible. */
  getStatus: () => string;
  dispose: () => void;
}

const NEUTRAL: RetargetResult = { expressions: {}, head: { x: 0, y: 0, z: 0 } };

/** Full-body path: PoseLandmarker on the person drives the paper-doll rig over live video. */
async function createBodyStream(input: MediaStream, opts: VTuberOptions): Promise<VTuberHandle> {
  const W = opts.width ?? 540;
  const H = opts.height ?? 960;
  const rig = (opts.avatar as any).rig;

  const video = document.createElement('video');
  video.srcObject = input; video.autoplay = true; video.muted = true; (video as any).playsInline = true;
  await video.play().catch(() => { /* gesture upstream */ });

  let status = 'starting…';
  const setStatus = (s: string) => { status = s; opts.onStatus?.(s); };

  const [{ PoseTracker }, { BodyPuppetDriver }] = await Promise.all([
    import('./poseTracker'), import('./bodyPuppet'),
  ]);
  const tracker = new PoseTracker();
  const driver = new BodyPuppetDriver(rig);
  const feed = new DetectFeed(); // low-light auto-gain + downscale for detection

  setStatus('loading body tracker…');
  const initTimeout = setTimeout(() => { if (!tracker.isReady) setStatus('body tracker timed out — check connection'); }, 25000);
  tracker.init().then((ok: boolean) => {
    clearTimeout(initTimeout);
    setStatus(ok ? 'body tracking — step back so I can see you…' : 'body tracker unavailable on this device');
  });

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;

  let lastTs = -1;
  let pose: import('./poseTracker').PoseFrame | null = null;
  let locked = false;
  let lastDetect = -1e9, detectMs = 22; // pose inference is heavier than face
  let lastRender = 0;
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = performance.now();
    if (t - lastRender < 31) return; // ~30fps cap — the output is 24fps; per-RAF is wasted heat
    lastRender = t;
    if (tracker.isReady && video.readyState >= 2 && (t - lastDetect) >= detectMs * 0.85) {
      const ts = Math.max(lastTs + 1, Math.round(t));
      lastTs = ts;
      const d0 = performance.now();
      const frame = tracker.detect(feed.src(video), ts);
      detectMs = detectMs * 0.8 + (performance.now() - d0) * 0.2;
      lastDetect = t;
      if (frame) {
        pose = frame;
        if (!locked) { locked = true; setStatus('body locked ✓ — you drive the character'); }
      }
    }
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(video, 0, 0, W, H);
    driver.render(ctx, W, H, pose);
  };
  loop();

  const stream = out.captureStream(opts.fps ?? 24);
  input.getAudioTracks().forEach(tr => { try { stream.addTrack(tr); } catch { /* */ } });

  return {
    canvas: out,
    stream,
    setMode: () => { /* body path has one mode */ },
    setAvatar: () => Promise.resolve(false),
    setBackground: () => { /* over live video */ },
    getStatus: () => status,
    dispose: () => {
      cancelAnimationFrame(raf);
      tracker.dispose();
      try { (video as any).srcObject = null; } catch { /* */ }
    },
  };
}

export async function createVTuberStream(input: MediaStream, opts: VTuberOptions): Promise<VTuberHandle> {
  if (opts.avatar?.kind === 'BODY2D') return createBodyStream(input, opts);
  const W = opts.width ?? 1280;
  const H = opts.height ?? 720;
  let mode: VTuberMode = opts.mode ?? 'AVATAR_ONLY';
  let bg: VTuberBackground = opts.background ?? { type: 'transparent' };

  const video = document.createElement('video');
  video.srcObject = input; video.autoplay = true; video.muted = true; (video as any).playsInline = true;
  await video.play().catch(() => { /* may require a gesture upstream */ });

  let status = 'starting…';
  const setStatus = (s: string) => { status = s; opts.onStatus?.(s); };

  const tracker = new FaceTracker();
  const retargeter = new FaceRetargeter();
  const feed = new DetectFeed(); // low-light auto-gain + downscale for detection

  // ── Avatar render path: VRM rig OR 2D puppet, both → an avatar canvas ──
  const isPuppet = opts.avatar?.kind === 'PUPPET2D';
  let rig: VrmRig | null = null;
  let puppet: Puppet2DDriver | null = null;
  let avatarCanvas: HTMLCanvasElement;
  let avatarCtx: CanvasRenderingContext2D | null = null;

  if (isPuppet && opts.avatar?.kind === 'PUPPET2D') {
    puppet = new Puppet2DDriver(opts.avatar.rig);
    // The avatar canvas keeps the RIG's aspect (capped for speed) — drawing the sprite into
    // the output-shaped canvas stretched/squished the character.
    const rw = opts.avatar.rig.width, rh = opts.avatar.rig.height;
    const s = Math.min(1, 512 / Math.max(rw, rh));
    avatarCanvas = document.createElement('canvas');
    avatarCanvas.width = Math.max(2, Math.round(rw * s)); avatarCanvas.height = Math.max(2, Math.round(rh * s));
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

  setStatus('loading tracker…');
  // Timeout so a hung CDN/model load reads as a visible failure, not eternal "loading".
  const initTimeout = setTimeout(() => { if (!tracker.isReady) setStatus('tracker timed out — check connection'); }, 25000);
  tracker.init().then(ok => {
    clearTimeout(initTimeout);
    setStatus(ok ? 'tracking — looking for you…' : 'tracker unavailable on this device');
  });

  let lastTs = -1;
  let lastFace: RetargetResult = NEUTRAL;
  let lastBbox: { x: number; y: number; w: number; h: number } | null = null;
  let smoothBox: { x: number; y: number; w: number; h: number } | null = null;
  let lostFrames = 0;
  // Adaptive detection throttle: render every frame (smooth), but only run the ML detector
  // as fast as it can actually keep up — on slow phones this stops inference from starving
  // the render loop (saves battery + keeps the puppet fluid). Fast devices detect near 1:1.
  let lastDetect = -1e9, detectMs = 16;
  let lastRender = 0;
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = performance.now();
    if (t - lastRender < 31) return; // ~30fps cap — output is 24fps; per-RAF render is wasted heat
    lastRender = t;

    if (tracker.isReady && video.readyState >= 2 && (t - lastDetect) >= detectMs * 0.85) {
      const ts = Math.max(lastTs + 1, Math.round(t)); // detectForVideo needs monotonic timestamps
      lastTs = ts;
      const d0 = performance.now();
      const frame = tracker.detect(feed.src(video), ts);
      detectMs = detectMs * 0.8 + (performance.now() - d0) * 0.2;
      lastDetect = t;
      if (frame) {
        if (!lastBbox) setStatus(feed.boost > 1.15 ? `face locked ✓ (low light ×${feed.boost.toFixed(1)})` : 'face locked ✓');
        lastFace = retargeter.retarget(frame, t / 1000);
        lastBbox = frame.bbox;
        if (rig) rig.applyFace(lastFace.expressions, lastFace.head);
      }
    }
    // render the avatar to its canvas (at the avatar canvas's own aspect)
    if (rig) rig.render();
    if (puppet && avatarCtx) puppet.render(avatarCtx, avatarCanvas.width, avatarCanvas.height, lastFace);

    // composite per mode
    ctx.clearRect(0, 0, W, H);
    if (mode === 'AVATAR_ONLY') {
      if (bg.type === 'color') { ctx.fillStyle = bg.value || '#000'; ctx.fillRect(0, 0, W, H); }
      const s = Math.min(W / avatarCanvas.width, H / avatarCanvas.height); // contain, never stretch
      const dw = avatarCanvas.width * s, dh = avatarCanvas.height * s;
      ctx.drawImage(avatarCanvas, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else if (mode === 'PIP') {
      ctx.drawImage(video, 0, 0, W, H);
      const pw = Math.round(W * 0.3), ph = Math.round(H * 0.3);
      ctx.drawImage(avatarCanvas, W - pw - 16, H - ph - 16, pw, ph);
    } else if (mode === 'FACE_SWAP') {
      // Face swap: live camera + the avatar drawn ONTO the real face, tracking position,
      // size and head roll. The avatar canvas is transparent outside the character.
      ctx.drawImage(video, 0, 0, W, H);
      // Smooth the box so the avatar doesn't jitter; hold the last box a moment when the
      // tracker drops a frame so the character doesn't flicker off.
      if (lastBbox) {
        const target = lastBbox;
        if (!smoothBox) smoothBox = { ...target };
        else { const k = 0.35; smoothBox.x += (target.x - smoothBox.x) * k; smoothBox.y += (target.y - smoothBox.y) * k; smoothBox.w += (target.w - smoothBox.w) * k; smoothBox.h += (target.h - smoothBox.h) * k; }
        lostFrames = 0;
      } else if (smoothBox) {
        lostFrames++;
        if (lostFrames > 30) { smoothBox = null; lastBbox = null; setStatus('tracking — looking for you…'); } // ~1s grace
      }
      // Before the first lock, show the avatar centred so the character is visible to judge.
      const box = smoothBox ?? { x: 0.28, y: 0.16, w: 0.44, h: 0.5 };
      const faceW = box.w * W;
      const cx = (box.x + box.w / 2) * W;
      const cy = (box.y + box.h / 2) * H;
      const scale = (faceW * 2.4) / avatarCanvas.width; // avatar head ≈ 2.4× the landmark box
      const dw = avatarCanvas.width * scale, dh = avatarCanvas.height * scale;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(smoothBox ? -lastFace.head.z : 0);
      ctx.drawImage(avatarCanvas, -dw / 2, -dh * 0.42, dw, dh); // avatar face ~42% down its canvas
      ctx.restore();
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
    getStatus: () => status,
    dispose: () => {
      cancelAnimationFrame(raf);
      tracker.dispose();
      rig?.dispose();
      puppet?.dispose();
      try { (video as any).srcObject = null; } catch { /* */ }
    },
  };
}
