import React, { useEffect, useRef } from 'react';

interface ScrollingWaveformProps {
  currentTime: number;
  duration: number;
  trackId: string;
  isPlaying?: boolean;
}

function buildWaveform(trackId: string, numPoints = 1200): Float32Array {
  let seed = 0;
  for (let i = 0; i < trackId.length; i++) {
    seed = (trackId.charCodeAt(i) + ((seed << 5) - seed)) % 100000;
  }
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };
  const data = new Float32Array(numPoints);
  for (let i = 0; i < numPoints; i++) data[i] = Math.pow(random(), 2.5);
  for (let i = 1; i < numPoints - 1; i++) data[i] = (data[i - 1] + data[i] * 2 + data[i + 1]) / 4;
  return data;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeOffscreen(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

interface BakedWave {
  gray: AnyCanvas;
  color: AnyCanvas;
  totalW: number;
  h: number;
}

function bakeWave(waveform: Float32Array, viewW: number, h: number): BakedWave {
  const totalW = Math.min(Math.max(viewW * 8, viewW * 2), 6144);
  const step = totalW / waveform.length;
  const cy = h / 2;

  const tracePath = (ctx: AnyCtx) => {
    ctx.beginPath();
    for (let i = 0; i < waveform.length; i++) {
      const x = i * step;
      const amp = waveform[i] * h * 0.45;
      i === 0 ? ctx.moveTo(x, cy - amp) : ctx.lineTo(x, cy - amp);
    }
    for (let i = waveform.length - 1; i >= 0; i--) {
      ctx.lineTo(i * step, cy + waveform[i] * h * 0.45);
    }
    ctx.closePath();
  };

  const gray = makeOffscreen(totalW, h);
  const gCtx = gray.getContext('2d') as AnyCtx;
  tracePath(gCtx);
  gCtx.fillStyle = 'rgba(170,170,170,0.34)';
  gCtx.fill();

  const color = makeOffscreen(totalW, h);
  const cCtx = color.getContext('2d') as AnyCtx;
  const grad = cCtx.createLinearGradient(0, 0, totalW, 0);
  grad.addColorStop(0, '#FF8C00');
  grad.addColorStop(0.55, '#FF4D6D');
  grad.addColorStop(1, '#D40055');
  tracePath(cCtx);
  cCtx.fillStyle = grad;
  cCtx.fill();

  return { gray, color, totalW, h };
}

const ScrollingWaveform: React.FC<ScrollingWaveformProps> = ({ currentTime, duration, trackId, isPlaying = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctRef = useRef(currentTime);
  const durRef = useRef(duration);
  const playingRef = useRef(isPlaying);
  const playbackRef = useRef({ time: currentTime, updatedAt: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const waveRef = useRef<Float32Array>(buildWaveform(trackId || 'default'));
  const baked = useRef<BakedWave | null>(null);
  const raf = useRef(0);
  const lastStartX = useRef(Number.NaN);

  ctRef.current = currentTime;
  durRef.current = duration;
  playingRef.current = isPlaying;

  useEffect(() => {
    playbackRef.current = { time: currentTime, updatedAt: performance.now() };
  }, [currentTime, trackId]);

  useEffect(() => {
    waveRef.current = buildWaveform(trackId || 'default');
    baked.current = null;
    lastStartX.current = Number.NaN;
  }, [trackId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const next = { w: Math.round(width), h: Math.round(height) };
      if (next.w !== sizeRef.current.w || next.h !== sizeRef.current.h) {
        sizeRef.current = next;
        baked.current = null;
        lastStartX.current = Number.NaN;
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return;

    canvas.style.transform = 'translateZ(0)';
    canvas.style.contain = 'layout paint size';

    const frame = (now: number) => {
      const { w, h } = sizeRef.current;
      if (w <= 0 || h <= 0) {
        raf.current = requestAnimationFrame(frame);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelW = Math.max(1, Math.round(w * dpr));
      const pixelH = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        baked.current = null;
        lastStartX.current = Number.NaN;
      }

      if (!baked.current) baked.current = bakeWave(waveRef.current, w, h);
      const b = baked.current;
      const projectedTime = playingRef.current
        ? playbackRef.current.time + (now - playbackRef.current.updatedAt) / 1000
        : ctRef.current;
      const progress = Math.min(1, Math.max(0, projectedTime / (durRef.current || 1)));
      const playheadX = w / 2;
      const startX = playheadX - progress * b.totalW;

      // When paused, skip draw if position hasn't changed meaningfully
      if (!playingRef.current && Math.abs(startX - lastStartX.current) < 0.05) {
        raf.current = requestAnimationFrame(frame);
        return;
      }
      lastStartX.current = startX;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(b.gray as CanvasImageSource, startX, 0);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, playheadX, h);
      ctx.clip();
      ctx.drawImage(b.color as CanvasImageSource, startX, 0);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.62)';
      ctx.lineWidth = 2;
      ctx.stroke();

      raf.current = requestAnimationFrame(frame);
    };

    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div
      className="absolute bottom-0 left-0 w-full h-40 pointer-events-none z-[5] overflow-hidden opacity-80"
      style={{ contain: 'layout paint size' }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

export default ScrollingWaveform;
