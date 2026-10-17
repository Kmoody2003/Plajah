/**
 * Plajah Shared Comic Video Loop & ±60s Frame Scrubber Engine
 * ============================================================
 * Implements:
 * 1. Single-Load Master Video Pool:
 *    - Loads a master video file ONCE per unique URL (`masterVideoPool`), never duplicating
 *      network downloads or video decoders across panels.
 *    - Panels only store `{ panelId, isVideoLoop, loopInSeconds, loopOutSeconds, cinemagraphMode }`
 *      (up to 15.0 seconds max loop duration).
 * 2. ±60-Second (1 Minute in Both Directions) Interactive Frame Scrubber:
 *    - Every panel has a `timecodeSeconds` and `anchorTimecodeSeconds`.
 *    - Creators can scrub `-60s` to `+60s` around the panel's frame and preview in real time.
 * 3. Persistent Still Capture by Panel ID:
 *    - Once a new frame is set on the scrubber, creates/persists a new still associated with
 *      `panel.id` (`plajah_panel_still_v1_${panelId}`) so that panel always loads the new still.
 */

export const MAX_TIMECODE_SCRUB_WINDOW_SECONDS = 60; // ±1 minute in both directions
export const MAX_CINEMAGRAPH_LOOP_SECONDS = 15;      // Max 15-second live video loop

export interface PanelStillOverride {
  panelId: string;
  imageUrl: string;
  timecodeSeconds: number;
  timecode: string;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  isVideoLoop?: boolean;
  loopInSeconds?: number;
  loopOutSeconds?: number;
  cinemagraphMode?: 'loop' | 'ping-pong' | 'subtle';
  shape?: string;
  borderStyle?: string;
  textLayerMode?: 'alt' | 'script';
  bubbles?: any[];
  caption?: string;
  originalScriptCaption?: string;
  altCaption?: string;
  useAltCaptionLayer?: boolean;
  captionX?: number;
  captionY?: number;
  captionWidth?: number;
  sfxText?: string;
  originalScriptSfx?: string;
  altSfx?: string;
  useAltSfxLayer?: boolean;
  sfxX?: number;
  sfxY?: number;
  updatedAt: number;
}

const STORAGE_PREFIX = 'plajah_panel_override_v1_';
const memoryOverrides = new Map<string, PanelStillOverride>();

/** Default Pumpkin Patch master Mux playback ID & stream for panels from the film */
export const DEFAULT_PUMPKIN_PATCH_MUX_ID = 'p92ef290127988022726d35b1f00d43191f';
export const DEFAULT_PUMPKIN_PATCH_STREAM_URL = `https://stream.mux.com/${DEFAULT_PUMPKIN_PATCH_MUX_ID}/medium.mp4`;

/** Format seconds into MM:SS.d or HH:MM:SS */
export function formatPanelTimecode(sec: number | undefined): string {
  const s = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  const wholeSec = Math.floor(rem);
  const tenths = Math.floor((rem - wholeSec) * 10);
  return `${String(mins).padStart(2, '0')}:${String(wholeSec).padStart(2, '0')}.${tenths}`;
}

/** Parse "MM:SS" or "HH:MM:SS" or "04:12.5" into seconds */
export function parsePanelTimecode(tc: string | number | undefined): number {
  if (typeof tc === 'number' && !Number.isNaN(tc)) return Math.max(0, tc);
  if (!tc || typeof tc !== 'string') return 0;
  const clean = tc.split(/[–—-]/)[0].trim();
  const parts = clean.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/** Extract Mux Playback ID from an existing image.mux.com or stream.mux.com URL if present */
export function extractMuxPlaybackId(url?: string, fallbackMuxId?: string): string | undefined {
  if (fallbackMuxId) return fallbackMuxId;
  if (!url) return undefined;
  const m = url.match(/(?:image|stream)\.mux\.com\/([a-zA-Z0-9]+)/);
  return m ? m[1] : undefined;
}

/** Compute ±60s (1 minute in both directions) scrub range for a panel */
export function getPanelScrubBounds(
  anchorTimecodeSeconds: number,
  maxVideoDurationSeconds = 2595
): { minSeconds: number; maxSeconds: number; anchorSeconds: number } {
  const anchor = Math.max(0, Number(anchorTimecodeSeconds) || 0);
  const minSeconds = Math.max(0, +(anchor - MAX_TIMECODE_SCRUB_WINDOW_SECONDS).toFixed(1));
  const maxSeconds = Math.min(
    maxVideoDurationSeconds,
    +(anchor + MAX_TIMECODE_SCRUB_WINDOW_SECONDS).toFixed(1)
  );
  return { minSeconds, maxSeconds, anchorSeconds: anchor };
}

/** Clamp loop In/Out points so loop duration is between 0.5s and 15.0s */
export function clampLoopInOutPoints(
  inSec: number,
  outSec: number,
  maxDuration = MAX_CINEMAGRAPH_LOOP_SECONDS
): { loopInSeconds: number; loopOutSeconds: number; duration: number } {
  const cleanIn = Math.max(0, +Number(inSec || 0).toFixed(2));
  let cleanOut = Math.max(cleanIn + 0.5, +Number(outSec || cleanIn + 4).toFixed(2));
  if (cleanOut - cleanIn > maxDuration) {
    cleanOut = +(cleanIn + maxDuration).toFixed(2);
  }
  return {
    loopInSeconds: cleanIn,
    loopOutSeconds: cleanOut,
    duration: +(cleanOut - cleanIn).toFixed(2),
  };
}

/** Load saved override for a specific panel ID */
export function getPanelOverrideById(panelId: string): PanelStillOverride | null {
  if (!panelId) return null;
  if (memoryOverrides.has(panelId)) return memoryOverrides.get(panelId)!;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + panelId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PanelStillOverride;
    memoryOverrides.set(panelId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Save a new still frame, pan/zoom crop, or cinemagraph loop for a specific panel ID */
export function savePanelOverrideById(
  panelId: string,
  update: Partial<PanelStillOverride>
): PanelStillOverride {
  const existing = getPanelOverrideById(panelId) || {
    panelId,
    imageUrl: '',
    timecodeSeconds: 0,
    timecode: '00:00.0',
    updatedAt: Date.now(),
  };
  const merged: PanelStillOverride = {
    ...existing,
    ...update,
    panelId,
    updatedAt: Date.now(),
  };
  if (typeof update.timecodeSeconds === 'number') {
    merged.timecode = formatPanelTimecode(update.timecodeSeconds);
  }
  memoryOverrides.set(panelId, merged);
  try {
    localStorage.setItem(STORAGE_PREFIX + panelId, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors if dataUrl is large; memoryOverrides still holds it for session
  }
  return merged;
}

/**
 * Generate or capture a new still image for `panelId` at `targetSeconds`.
 * - If a Mux playback ID is available, constructs a deterministic frame-accurate URL
 *   keyed with `&panel_id=${panelId}&time=${targetSeconds}` and optionally snapshots it to a dataURL.
 * - Otherwise seeks the single shared master `<video>` element to `targetSeconds` and captures a frame canvas.
 */
export async function createStillForPanelAtTimecode(opts: {
  panelId: string;
  targetSeconds: number;
  muxPlaybackId?: string;
  sourceVideoUrl?: string;
  existingImageUrl?: string;
}): Promise<{ imageUrl: string; timecodeSeconds: number; timecode: string }> {
  const t = Math.max(0, +Number(opts.targetSeconds || 0).toFixed(2));
  const tcStr = formatPanelTimecode(t);
  const muxId = extractMuxPlaybackId(opts.existingImageUrl, opts.muxPlaybackId);

  // 1. If backed by Mux, build a frame-exact Mux still URL tagged with the panelId
  if (muxId) {
    const muxStillUrl = `https://image.mux.com/${muxId}/thumbnail.jpg?time=${t}&width=1280&fit_mode=preserve&panel_id=${encodeURIComponent(opts.panelId)}`;
    savePanelOverrideById(opts.panelId, {
      imageUrl: muxStillUrl,
      timecodeSeconds: t,
      timecode: tcStr,
    });
    return { imageUrl: muxStillUrl, timecodeSeconds: t, timecode: tcStr };
  }

  // 2. If backed by a shared master video URL, seek the single shared video and capture a JPEG still
  const videoUrl = opts.sourceVideoUrl || DEFAULT_PUMPKIN_PATCH_STREAM_URL;
  try {
    const dataUrl = await sharedVideoPool.captureStillFrame(videoUrl, t);
    if (dataUrl) {
      savePanelOverrideById(opts.panelId, {
        imageUrl: dataUrl,
        timecodeSeconds: t,
        timecode: tcStr,
      });
      return { imageUrl: dataUrl, timecodeSeconds: t, timecode: tcStr };
    }
  } catch {
    // Fall back to Mux stream thumbnail if direct canvas capture is CORS-restricted
  }

  const fallbackUrl = `https://image.mux.com/${DEFAULT_PUMPKIN_PATCH_MUX_ID}/thumbnail.jpg?time=${t}&width=1280&fit_mode=preserve&panel_id=${encodeURIComponent(opts.panelId)}`;
  savePanelOverrideById(opts.panelId, {
    imageUrl: fallbackUrl,
    timecodeSeconds: t,
    timecode: tcStr,
  });
  return { imageUrl: fallbackUrl, timecodeSeconds: t, timecode: tcStr };
}

/**
 * SINGLE-LOAD MASTER VIDEO POOL (`SharedComicVideoPool`)
 * ======================================================
 * Loads each unique `sourceVideoUrl` ONCE in a single hidden `<video>` element.
 * Multiple panels with Cinemagraph / Video Loops never instantiate duplicate `<video>` tags;
 * instead, the pool reads the active panel's `{ loopInSeconds, loopOutSeconds, cinemagraphMode }`
 * and blits frames from the single shared decoder onto the panel's canvas or Konva image.
 */
class SharedComicVideoPool {
  private videos = new Map<string, HTMLVideoElement>();
  private activeSubscribers = new Map<
    string,
    {
      panelId: string;
      videoUrl: string;
      loopInSeconds: number;
      loopOutSeconds: number;
      mode: 'loop' | 'ping-pong' | 'subtle';
      onFrame: (videoEl: HTMLVideoElement, currentTime: number) => void;
    }
  >();
  private rafId: number | null = null;
  private activePanelOrder: string[] = [];
  private currentFocusPanelId: string | null = null;

  /** Get or create the SINGLE `<video>` instance for a given master video URL */
  public getMasterVideo(videoUrl?: string): HTMLVideoElement {
    const resolvedUrl = videoUrl || DEFAULT_PUMPKIN_PATCH_STREAM_URL;
    let video = this.videos.get(resolvedUrl);
    if (!video && typeof document !== 'undefined') {
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = resolvedUrl;
      this.videos.set(resolvedUrl, video);
    }
    return video!;
  }

  /** Inspect how many master video elements exist (always 1 per unique source file) */
  public getLoadedVideoCount(): number {
    return this.videos.size;
  }

  /** Capture a single still frame at `targetSeconds` using the shared `<video>` instance */
  public captureStillFrame(videoUrl: string, targetSeconds: number): Promise<string | null> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') return resolve(null);
      const video = this.getMasterVideo(videoUrl);
      const timeout = window.setTimeout(() => resolve(null), 4500);

      const handleSeeked = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('seeked', handleSeeked);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch {
          resolve(null);
        }
      };

      video.addEventListener('seeked', handleSeeked, { once: true });
      try {
        video.currentTime = Math.max(0, targetSeconds);
      } catch {
        window.clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  /** Register a panel's In/Out points with the single shared video engine */
  public subscribePanelLoop(opts: {
    panelId: string;
    videoUrl?: string;
    loopInSeconds: number;
    loopOutSeconds: number;
    mode?: 'loop' | 'ping-pong' | 'subtle';
    onFrame: (videoEl: HTMLVideoElement, currentTime: number) => void;
  }): () => void {
    const clamped = clampLoopInOutPoints(opts.loopInSeconds, opts.loopOutSeconds);
    const resolvedUrl = opts.videoUrl || DEFAULT_PUMPKIN_PATCH_STREAM_URL;
    this.getMasterVideo(resolvedUrl);

    this.activeSubscribers.set(opts.panelId, {
      panelId: opts.panelId,
      videoUrl: resolvedUrl,
      loopInSeconds: clamped.loopInSeconds,
      loopOutSeconds: clamped.loopOutSeconds,
      mode: opts.mode || 'loop',
      onFrame: opts.onFrame,
    });
    if (!this.activePanelOrder.includes(opts.panelId)) {
      this.activePanelOrder.push(opts.panelId);
    }
    if (!this.currentFocusPanelId) {
      this.currentFocusPanelId = opts.panelId;
    }

    this.ensureTickerRunning();

    return () => {
      this.activeSubscribers.delete(opts.panelId);
      this.activePanelOrder = this.activePanelOrder.filter(id => id !== opts.panelId);
      if (this.currentFocusPanelId === opts.panelId) {
        this.currentFocusPanelId = this.activePanelOrder[0] || null;
      }
      if (this.activeSubscribers.size === 0 && this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.videos.forEach(v => v.pause());
      }
    };
  }

  /** Set which looping panel currently owns the primary real-time playback head */
  public setFocusedLoopPanel(panelId: string) {
    if (this.activeSubscribers.has(panelId)) {
      this.currentFocusPanelId = panelId;
      const sub = this.activeSubscribers.get(panelId)!;
      const video = this.getMasterVideo(sub.videoUrl);
      if (
        video.currentTime < sub.loopInSeconds ||
        video.currentTime > sub.loopOutSeconds
      ) {
        video.currentTime = sub.loopInSeconds;
      }
      video.playbackRate = sub.mode === 'subtle' ? 0.65 : 1.0;
      video.play().catch(() => {});
    }
  }

  private ensureTickerRunning() {
    if (this.rafId !== null || typeof window === 'undefined') return;

    const tick = () => {
      if (this.activeSubscribers.size === 0) {
        this.rafId = null;
        return;
      }

      const focusId = this.currentFocusPanelId || this.activePanelOrder[0];
      const sub = focusId ? this.activeSubscribers.get(focusId) : undefined;

      if (sub) {
        const video = this.getMasterVideo(sub.videoUrl);
        const desiredRate = sub.mode === 'subtle' ? 0.65 : 1.0;
        if (Math.abs(video.playbackRate - desiredRate) > 0.05) {
          video.playbackRate = desiredRate;
        }
        if (video.paused && video.readyState >= 2) {
          video.play().catch(() => {});
        }
        if (
          video.currentTime < sub.loopInSeconds - 0.15 ||
          video.currentTime >= sub.loopOutSeconds
        ) {
          try {
            video.currentTime = sub.loopInSeconds;
          } catch {}
        }
        if (video.readyState >= 2) {
          sub.onFrame(video, video.currentTime);
        }
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }
}

export const sharedVideoPool = new SharedComicVideoPool();
