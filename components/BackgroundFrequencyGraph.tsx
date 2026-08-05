import React, { useRef, useEffect } from 'react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

// Half-height EQ spectrum: orange at base → magenta → purple at peaks.
// 32 logarithmic bands, lerp 0.09 for very fluid movement.
const BackgroundFrequencyGraph: React.FC = () => {
  const { analyser, isPlaying, isFrequencyVisualizerEnabled } = useGlobalPlayerState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Smoothed amplitude per band, persists across frames
  const bandDataRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!analyser || !isFrequencyVisualizerEnabled) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const BANDS = 32;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    if (!bandDataRef.current || bandDataRef.current.length !== BANDS) {
      bandDataRef.current = new Float32Array(BANDS);
    }
    const bandData = bandDataRef.current;

    // Lerp speed — lower = more fluid / slower settling
    const LERP = 0.09;
    // Max height as a fraction of viewport (half of the old 0.25)
    const HEIGHT_SCALE = 0.12;

    // Frequency mapping: logarithmic from ~20 Hz region to ~16 kHz region
    // FFT bin 0 = DC, bin bufferLength = Nyquist. Assuming 44100 Hz sample rate:
    // bin index ≈ freq * fftSize / sampleRate → but we just use index space 1..600
    const MIN_BIN = 1;
    const MAX_BIN = Math.min(bufferLength - 1, 600);

    let animationId: number;

    const render = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;

      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, W, H);

      // ── Compute per-band smoothed amplitude ────────────────────────────
      for (let i = 0; i < BANDS; i++) {
        const startRatio = i / BANDS;
        const endRatio   = (i + 1) / BANDS;
        // Logarithmic bin mapping so low frequencies aren't over-represented
        const startBin = Math.floor(MIN_BIN * Math.pow(MAX_BIN / MIN_BIN, startRatio));
        const endBin   = Math.max(startBin + 1, Math.floor(MIN_BIN * Math.pow(MAX_BIN / MIN_BIN, endRatio)));

        let sum = 0, peak = 0;
        for (let j = startBin; j < endBin; j++) {
          sum += dataArray[j];
          if (dataArray[j] > peak) peak = dataArray[j];
        }

        // 40% average + 60% peak gives punch without being too spiky
        const raw = (sum / (endBin - startBin)) * 0.4 + peak * 0.6;

        // High-frequency bins naturally carry less energy — compensate gradually
        const hfBoost = 1 + (i / BANDS) * 1.8;
        const normalized = Math.min(1, (raw / 255) * 1.3 * hfBoost);

        // Fluid lerp: current → target
        bandData[i] += (normalized - bandData[i]) * LERP;
      }

      // ── Build spline control points ───────────────────────────────────
      // Pad left and right with anchored baseline points
      const padX = W * 0.0; // flush to edges
      const spacing = (W - padX * 2) / (BANDS - 1);
      const maxH = H * HEIGHT_SCALE;

      // xs / ys include two extra anchor points at each end at the baseline
      const xs: number[] = [];
      const ys: number[] = [];

      xs.push(-10);        ys.push(H);   // hard-left anchor at baseline
      xs.push(padX - 4);   ys.push(H);   // left edge anchor

      for (let i = 0; i < BANDS; i++) {
        const x = padX + i * spacing;
        const amplitude = bandData[i];
        // Subtle floor lift (2 px) so the curve stays visible even at silence
        const h = amplitude * maxH + (amplitude > 0.01 ? 2 : 0);
        xs.push(x);
        ys.push(H - h);
      }

      xs.push(W - padX + 4); ys.push(H); // right edge anchor
      xs.push(W + 10);       ys.push(H); // hard-right anchor

      // ── Dynamic gradient: orange (base) → magenta → purple (peaks) ────
      // Gradient spans from screen bottom to the theoretical peak so the
      // colour shifts match the actual excursion range.
      const gradient = ctx.createLinearGradient(0, H, 0, H - maxH * 1.05);
      gradient.addColorStop(0,    'rgba(255, 110, 10, 0.95)');   // deep orange
      gradient.addColorStop(0.35, 'rgba(255, 30,  110, 0.85)');  // hot pink / magenta
      gradient.addColorStop(0.70, 'rgba(180, 0,   220, 0.70)');  // violet-purple
      gradient.addColorStop(1,    'rgba(110, 0,   255, 0.50)');  // electric purple

      // ── Draw filled spectrum shape ─────────────────────────────────────
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);

      // Catmull-Rom → cubic Bézier for a silky smooth curve
      for (let i = 1; i < xs.length - 2; i++) {
        const x0 = xs[i - 1], y0 = ys[i - 1];
        const x1 = xs[i],     y1 = ys[i];
        const x2 = xs[i + 1], y2 = ys[i + 1];
        const x3 = xs[i + 2], y3 = ys[i + 2];

        // Catmull-Rom tension (0.5 is standard)
        const tension = 0.5;
        const cp1x = x1 + (x2 - x0) * tension / 3;
        const cp1y = y1 + (y2 - y0) * tension / 3;
        const cp2x = x2 - (x3 - x1) * tension / 3;
        const cp2y = y2 - (y3 - y1) * tension / 3;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      }

      // Close the shape back along the bottom edge
      ctx.lineTo(W + 10, H);
      ctx.lineTo(-10, H);
      ctx.closePath();

      ctx.fillStyle = gradient;
      ctx.fill();

      // ── Glowing edge stroke along the top curve ────────────────────────
      // Draw just the top path again (without the bottom close) for the stroke
      ctx.beginPath();
      ctx.moveTo(xs[1], ys[1]);

      for (let i = 1; i < xs.length - 2; i++) {
        const x0 = xs[i - 1], y0 = ys[i - 1];
        const x1 = xs[i],     y1 = ys[i];
        const x2 = xs[i + 1], y2 = ys[i + 1];
        const x3 = xs[i + 2], y3 = ys[i + 2];

        const tension = 0.5;
        const cp1x = x1 + (x2 - x0) * tension / 3;
        const cp1y = y1 + (y2 - y0) * tension / 3;
        const cp2x = x2 - (x3 - x1) * tension / 3;
        const cp2y = y2 - (y3 - y1) * tension / 3;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      }

      const strokeGrad = ctx.createLinearGradient(0, H, 0, H - maxH);
      strokeGrad.addColorStop(0,    'rgba(255, 140, 30, 0.9)');
      strokeGrad.addColorStop(0.5,  'rgba(255, 20, 140, 0.8)');
      strokeGrad.addColorStop(1,    'rgba(200, 0, 255, 0.6)');

      ctx.strokeStyle = strokeGrad;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(220, 0, 255, 0.6)';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(render);
    };

    if (isPlaying) {
      render();
    } else {
      // Slowly drain to flat when paused
      const drain = () => {
        let anyActive = false;
        for (let i = 0; i < bandData.length; i++) {
          bandData[i] *= 0.92;
          if (bandData[i] > 0.001) anyActive = true;
        }
        // Re-draw the draining shape if still visible
        if (anyActive && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // (simplified drain repaint — just clear for now)
        }
      };
      const drainId = setInterval(drain, 16);
      return () => clearInterval(drainId);
    }

    return () => cancelAnimationFrame(animationId);
  }, [analyser, isPlaying, isFrequencyVisualizerEnabled]);

  if (!isFrequencyVisualizerEnabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        opacity: 0.75,
        filter: 'blur(5px)',
      }}
    />
  );
};

export default BackgroundFrequencyGraph;
