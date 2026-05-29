import React, { useEffect, useRef } from 'react';

interface ScrollingWaveformProps {
  currentTime: number;
  duration: number;
  trackId: string;
}

function buildWaveform(trackId: string, numPoints = 2000): Float32Array {
  let seed = 0;
  for (let i = 0; i < trackId.length; i++) {
    seed = (trackId.charCodeAt(i) + ((seed << 5) - seed)) % 100000;
  }
  const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
  const data = new Float32Array(numPoints);
  for (let i = 0; i < numPoints; i++) data[i] = Math.pow(random(), 2.5);
  for (let i = 1; i < numPoints - 1; i++) data[i] = (data[i - 1] + data[i] * 2 + data[i + 1]) / 4;
  return data;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeOffscreen(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

interface BakedWave {
  gray: AnyCanvas;
  color: AnyCanvas;
  totalW: number;
  h: number;
}

function bakeWave(waveform: Float32Array, viewW: number, h: number): BakedWave {
  // Cap at 8192 to stay within GPU texture limits on most devices
  const totalW = Math.min(viewW * 10, 8192);
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
  gCtx.fillStyle = 'rgba(150,150,150,0.4)';
  gCtx.fill();

  const color = makeOffscreen(totalW, h);
  const cCtx = color.getContext('2d') as AnyCtx;
  const grad = cCtx.createLinearGradient(0, 0, totalW, 0);
  grad.addColorStop(0, '#FF8C00');
  grad.addColorStop(1, '#D40055');
  tracePath(cCtx);
  cCtx.fillStyle = grad;
  cCtx.fill();

  return { gray, color, totalW, h };
}

const ScrollingWaveform: React.FC<ScrollingWaveformProps> = ({ currentTime, duration, trackId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Hot refs — updated every render, no re-renders needed
  const ctRef  = useRef(currentTime);
  const durRef = useRef(duration);
  ctRef.current  = currentTime;
  durRef.current = duration;

  const waveRef = useRef<Float32Array>(buildWaveform(trackId || 'default'));
  const baked   = useRef<BakedWave | null>(null);
  const raf     = useRef(0);

  // Rebuild waveform + invalidate baked textures when track changes
  useEffect(() => {
    waveRef.current = buildWaveform(trackId || 'default');
    baked.current = null;
  }, [trackId]);

  // Single persistent RAF loop — runs once, reads only from refs each frame
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // Force this canvas onto its own GPU compositor layer
    canvas.style.transform = 'translateZ(0)';
    canvas.style.willChange = 'transform';

    const frame = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        baked.current = null; // size changed — rebake
      }

      // Bake offscreen textures on first frame or after invalidation
      if (!baked.current && w > 0 && h > 0) {
        baked.current = bakeWave(waveRef.current, w, h);
      }

      const b = baked.current;
      if (!b) { raf.current = requestAnimationFrame(frame); return; }

      ctx.clearRect(0, 0, w, h);

      const progress  = ctRef.current / (durRef.current || 1);
      const playheadX = w / 2;
      const startX    = playheadX - progress * b.totalW;

      // Frame is now 2 drawImage calls + clip — pure GPU compositing
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
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      raf.current = requestAnimationFrame(frame);
    };

    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, []); // empty — loop lives for component lifetime

  return (
    <div
      className="absolute bottom-0 left-0 w-full h-48 pointer-events-none mix-blend-overlay z-[5] overflow-hidden"
      style={{ willChange: 'transform' }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default ScrollingWaveform;
