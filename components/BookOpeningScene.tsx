// Cinematic book opening — plays a randomly selected pre-built MP4 animation,
// chroma-keys the colored placeholder regions, and composites the real book
// cover image and first-page text onto the video in real time.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  coverImage?: string;
  title: string;
  author?: string;
  onBeginReading: () => void;
  firstPageText?: string;
}

// ── Video assets (served from public/loera/) ────────────────────────────────
const VIDEO_SOURCES = [
  '/loera/Closed_book_opens_on_table_202606091118.mp4',
  '/loera/Closed_book_opens_on_table_202606091119%20(1).mp4',
  '/loera/Closed_book_opens_on_table_202606091119.mp4',
] as const;

// ── Placeholder color ────────────────────────────────────────────────────────
// Both the cover face and the open page spread use the same placeholder color.
// The compositing code auto-detects which content to use based on region shape:
//   portrait (taller than wide)  → book cover image
//   landscape (wider than tall)  → first-page text
const PLACEHOLDER = [84, 81, 77] as const;
const TOLERANCE   = 22;           // per-channel; total manhattan threshold = 66

// ── Helpers ──────────────────────────────────────────────────────────────────

function colorMatch(r: number, g: number, b: number): boolean {
  const [tr, tg, tb] = PLACEHOLDER;
  return Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb) < TOLERANCE * 3;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Detects the placeholder region, decides cover vs page by aspect ratio,
// then per-scanline UV composites the correct source onto those pixels.
function compositeFrame(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  coverSrc: { data: Uint8ClampedArray; w: number; h: number } | null,
  pageSrc:  { data: Uint8ClampedArray; w: number; h: number } | null,
): void {
  const rowL = new Int32Array(H).fill(-1);
  const rowR = new Int32Array(H).fill(-1);
  let y1 = H, y2 = 0;

  // Pass 1 — per-row extents
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (colorMatch(data[i], data[i + 1], data[i + 2])) {
        if (rowL[y] === -1) rowL[y] = x;
        rowR[y] = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (y1 >= y2) return;

  // Decide content by bounding-box aspect ratio
  let minX = W, maxX = 0;
  for (let y = y1; y <= y2; y++) {
    if (rowL[y] >= 0) { minX = Math.min(minX, rowL[y]); maxX = Math.max(maxX, rowR[y]); }
  }
  const bbW = maxX - minX, bbH = y2 - y1;
  // Wide region (open pages spread) → page text; narrow/tall → cover image
  const src = bbW > bbH * 1.3 ? pageSrc : coverSrc;
  if (!src) return;

  // Pass 2 — per-scanline UV replacement
  for (let y = y1; y <= y2; y++) {
    const l = rowL[y], r = rowR[y];
    if (l < 0) continue;
    const v  = (y - y1) / (y2 - y1);
    const sy = Math.min(Math.floor(v * src.h), src.h - 1);
    const span = r - l || 1;
    for (let x = l; x <= r; x++) {
      const i = (y * W + x) * 4;
      if (!colorMatch(data[i], data[i + 1], data[i + 2])) continue;
      const u  = (x - l) / span;
      const sx = Math.min(Math.floor(u * src.w), src.w - 1);
      const si = (sy * src.w + sx) * 4;
      data[i]     = src.data[si];
      data[i + 1] = src.data[si + 1];
      data[i + 2] = src.data[si + 2];
    }
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export const BookOpeningScene: React.FC<Props> = ({
  coverImage,
  title,
  author,
  onBeginReading,
  firstPageText,
}) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  // Cached pixel data for offscreen canvases (rebuilt only when content changes)
  const coverPx    = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  const pagePx     = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  const rafRef     = useRef<number>(0);
  const lastTick   = useRef<number>(0);
  const sizeReady  = useRef(false);

  const [fading, setFading] = useState(false);

  // Pick one video at random for this mount
  const videoSrc = useMemo(() => {
    const i = Math.floor(Math.random() * VIDEO_SOURCES.length);
    return VIDEO_SOURCES[i];
  }, []);

  // Build cover pixel data once
  useEffect(() => {
    const c = document.createElement('canvas');
    const finalize = () => {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const id = ctx.getImageData(0, 0, c.width, c.height);
      coverPx.current = { data: id.data, w: c.width, h: c.height };
    };

    if (coverImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        c.width  = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        finalize();
      };
      img.src = coverImage;
    } else {
      // Fallback leather gradient with title
      c.width = 400; c.height = 560;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 400, 560);
      g.addColorStop(0,    '#7a2e1a');
      g.addColorStop(0.55, '#4e1a0b');
      g.addColorStop(1,    '#3a1208');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 400, 560);
      ctx.strokeStyle = 'rgba(255,200,120,0.12)';
      ctx.strokeRect(18, 18, 364, 524);
      ctx.fillStyle = 'rgba(255,210,140,0.88)';
      ctx.font = 'bold 30px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const words = title.split(' ');
      let line = '', lines: string[] = [], y = 180;
      for (const w of words) {
        const t = line ? `${line} ${w}` : w;
        if (ctx.measureText(t).width > 340 && line) { lines.push(line); line = w; }
        else line = t;
      }
      if (line) lines.push(line);
      lines.forEach((l, i) => ctx.fillText(l, 200, y + i * 42));
      if (author) {
        ctx.font = '13px Georgia, serif';
        ctx.fillStyle = 'rgba(255,190,110,0.5)';
        ctx.fillText(author, 200, 480);
      }
      finalize();
    }
  }, [coverImage, title, author]);

  // Build page pixel data once
  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = 620; c.height = 860;
    const ctx = c.getContext('2d')!;

    // Cream paper
    const bg = ctx.createLinearGradient(0, 0, 620, 860);
    bg.addColorStop(0, '#faf1e2');
    bg.addColorStop(1, '#f0e2c4');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 620, 860);

    // Ruled lines
    ctx.strokeStyle = 'rgba(110,75,35,0.09)';
    ctx.lineWidth = 1;
    for (let ly = 64; ly < 820; ly += 24) {
      ctx.beginPath(); ctx.moveTo(36, ly); ctx.lineTo(584, ly); ctx.stroke();
    }

    // Chapter text
    if (firstPageText) {
      ctx.fillStyle    = '#1a1008';
      ctx.font         = '14.5px Georgia, "Times New Roman", serif';
      ctx.textBaseline = 'alphabetic';
      const lines = wrapText(ctx, firstPageText.replace(/\s+/g, ' ').trim().slice(0, 1000), 524);
      lines.slice(0, 32).forEach((l, i) => ctx.fillText(l, 50, 58 + i * 24));
    } else {
      // placeholder lines when text is still loading
      ctx.fillStyle = 'rgba(90,55,20,0.12)';
      for (let i = 0; i < 20; i++) {
        const w = 380 + Math.sin(i * 1.7) * 120;
        ctx.fillRect(50, 50 + i * 26, w, 10);
      }
    }

    // Gutter shadow
    const gutter = ctx.createLinearGradient(0, 0, 70, 0);
    gutter.addColorStop(0, 'rgba(0,0,0,0.13)');
    gutter.addColorStop(1, 'transparent');
    ctx.fillStyle = gutter;
    ctx.fillRect(0, 0, 70, 860);

    const id = ctx.getImageData(0, 0, c.width, c.height);
    pagePx.current = { data: id.data, w: c.width, h: c.height };
  }, [firstPageText]);

  // Composite loop
  const tick = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended) return;

    // Throttle to ~24 fps
    const now = performance.now();
    if (now - lastTick.current < 41) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    lastTick.current = now;

    // Set canvas dimensions once from video metadata
    if (!sizeReady.current && video.videoWidth > 0) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      sizeReady.current = true;
    }
    if (!sizeReady.current) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const W = canvas.width, H = canvas.height;
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;

    compositeFrame(data, W, H, coverPx.current, pagePx.current);

    ctx.putImageData(imageData, 0, 0);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { rafRef.current = requestAnimationFrame(tick); };
    const onEnded = () => {
      cancelAnimationFrame(rafRef.current);
      setFading(true);
      setTimeout(onBeginReading, 700);
    };

    video.addEventListener('play',  onPlay);
    video.addEventListener('ended', onEnded);
    video.play().catch(() => {});

    return () => {
      cancelAnimationFrame(rafRef.current);
      video.removeEventListener('play',  onPlay);
      video.removeEventListener('ended', onEnded);
    };
  }, [onBeginReading, tick]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Hidden video source */}
      <video
        ref={videoRef}
        src={videoSrc}
        muted
        playsInline
        preload="auto"
        style={{ display: 'none' }}
      />

      {/* Composited output */}
      <canvas
        ref={canvasRef}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
      />

      {/* Skip */}
      <button
        onClick={onBeginReading}
        style={{
          position: 'absolute', top: 18, right: 18, zIndex: 10,
          fontSize: 8, fontWeight: 900, letterSpacing: '0.35em',
          color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase',
          background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.55)')}
        onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.18)')}
      >
        Skip →
      </button>

      {/* Loading label */}
      <div
        style={{
          position: 'absolute', bottom: 44, left: 0, right: 0,
          textAlign: 'center',
          fontSize: 8, fontWeight: 900, letterSpacing: '0.42em',
          color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Loading your book…
      </div>

      {/* Fade-to-black overlay on video end */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: '#000',
          opacity: fading ? 1 : 0,
          transition: 'opacity 0.7s ease',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
    </div>
  );
};

export default BookOpeningScene;
