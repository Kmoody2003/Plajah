// SpectralWaveform — Traktor/Rekordbox-style colour waveform for a DJ deck.
//
//   ┌ zoomed view ───────────────────────────────────────────────┐
//   │ vocal lane (magenta) · beat grid · bar numbers · loop · cues │
//   │ 3-band layered waveform  low=red · mid=amber · high=cyan     │
//   │ ▲ kick (red, bottom)  ◆ snare (white, top)  · hat (cyan)     │
//   │                 fixed centre playhead                        │
//   └──────────────────────────────────────────────────────────────┘
//   ┌ overview (whole track, click to seek) ───────────────────────┐
//
// The zoomed view redraws every animation frame from `getTime()` (the deck's
// own clock), so it scrolls smoothly without a React render per frame. The
// overview is pre-rendered once per analysis into an offscreen canvas.
// Until the analysis finishes it falls back to the plain peak array.

import React, { useEffect, useRef, useState } from 'react';
import type { SpectralAnalysis } from '../../services/djWaveformAnalysis';

export const WAVE_COLORS = {
  low: '#FF4D3D',
  mid: '#FFC23C',
  high: '#7CF3FF',
  vocal: '#E05CFF',
  kick: '#FF4D3D',
  snare: '#FFFFFF',
  hat: '#7CF3FF',
};

interface Props {
  analysis: SpectralAnalysis | null;
  /** Fallback while analysing. */
  peaks: Float32Array | null;
  duration: number;
  getTime: () => number;
  isPlaying: boolean;
  beatGrid?: { firstDownbeat: number; interval: number } | null;
  loop?: { in: number; out: number } | null;
  hotCues?: (number | null)[];
  cueColors?: string[];
  onSeek: (t: number) => void;
  /** Accent for the playhead (orange when on Program). */
  accent?: string;
  height?: number;
}

const HOT_CUE_DEFAULT = ['#FF5A5F', '#FF8C00', '#F5C542', '#2BE0A8', '#00DAF3', '#4C8DFF', '#B07CFF', '#FF6FD8'];

function bandAt(arr: Uint8Array, f0: number, f1: number): number {
  let m = 0;
  for (let f = Math.max(0, f0); f <= f1 && f < arr.length; f++) if (arr[f] > m) m = arr[f];
  return m;
}

export const SpectralWaveform: React.FC<Props> = ({
  analysis, peaks, duration, getTime, isPlaying, beatGrid, loop, hotCues = [], cueColors = HOT_CUE_DEFAULT,
  onSeek, accent = '#00DAF3', height = 84,
}) => {
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const overCache = useRef<HTMLCanvasElement | null>(null);
  const [windowSec, setWindowSec] = useState(8); // visible seconds in the zoomed view
  const propsRef = useRef({ analysis, peaks, duration, beatGrid, loop, hotCues, cueColors, accent, windowSec });
  propsRef.current = { analysis, peaks, duration, beatGrid, loop, hotCues, cueColors, accent, windowSec };

  // ── overview pre-render ──
  useEffect(() => {
    const c = document.createElement('canvas');
    const W = 1200, H = 40;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx || !duration) { overCache.current = null; return; }
    const mid = H / 2;
    if (analysis) {
      const fpp = analysis.frames / W;
      for (let x = 0; x < W; x++) {
        const f0 = Math.floor(x * fpp), f1 = Math.floor((x + 1) * fpp);
        const lo = bandAt(analysis.low, f0, f1) / 255, mi = bandAt(analysis.mid, f0, f1) / 255, hi = bandAt(analysis.high, f0, f1) / 255;
        const v = bandAt(analysis.vocal, f0, f1) / 255;
        if (v > 0.15) { ctx.fillStyle = WAVE_COLORS.vocal; ctx.globalAlpha = Math.min(0.9, v); ctx.fillRect(x, 0, 1, 3); }
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = WAVE_COLORS.low; ctx.fillRect(x, mid - lo * mid * 0.92, 1, lo * mid * 1.84);
        ctx.fillStyle = WAVE_COLORS.mid; ctx.fillRect(x, mid - mi * mid * 0.62, 1, mi * mid * 1.24);
        ctx.fillStyle = WAVE_COLORS.high; ctx.fillRect(x, mid - hi * mid * 0.34, 1, hi * mid * 0.68);
      }
    } else if (peaks && peaks.length) {
      ctx.fillStyle = '#5b6b82';
      for (let x = 0; x < W; x++) {
        const p = peaks[Math.floor((x / W) * peaks.length)] || 0;
        ctx.fillRect(x, mid - p * mid, 1, p * mid * 2);
      }
    }
    ctx.globalAlpha = 1;
    overCache.current = c;
  }, [analysis, peaks, duration]);

  // ── draw loop ──
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const P = propsRef.current;
      const t = getTime();
      drawZoom(zoomRef.current, P, t);
      drawOverview(overRef.current, overCache.current, P, t);
      if (isPlaying) raf = requestAnimationFrame(draw);
    };
    draw();
    // Also redraw on a slow timer when paused (props like loop/cues change).
    const idle = !isPlaying ? setInterval(draw, 120) : null;
    return () => { cancelAnimationFrame(raf); if (idle) clearInterval(idle); };
  }, [isPlaying, getTime, analysis, peaks, duration, beatGrid, loop, hotCues, windowSec]);

  // ── interactions ──
  const seekFromZoom = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    onSeek(Math.max(0, Math.min(duration, getTime() + (x - 0.5) * windowSec)));
  };
  const seekFromOverview = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration)));
  };
  const onWheel = (e: React.WheelEvent) => {
    setWindowSec(w => Math.max(2, Math.min(32, w * (e.deltaY > 0 ? 1.25 : 0.8))));
  };

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="relative w-full rounded-lg overflow-hidden border border-white/10 bg-[#07050c]" style={{ height }} onWheel={onWheel}>
        <canvas ref={zoomRef} className="w-full h-full block cursor-crosshair" onClick={seekFromZoom} />
        <div className="absolute bottom-1 left-1.5 flex items-center gap-2 text-[8px] font-mono font-bold pointer-events-none">
          <span style={{ color: WAVE_COLORS.kick }}>▲ KICK</span>
          <span style={{ color: WAVE_COLORS.snare }}>◆ SNARE</span>
          <span style={{ color: WAVE_COLORS.hat }}>• HAT</span>
          <span style={{ color: WAVE_COLORS.vocal }}>▬ VOCAL</span>
          {!analysis && <span className="text-white/40">analysing…</span>}
        </div>
        <div className="absolute bottom-1 right-1.5 text-[8px] font-mono text-white/35 pointer-events-none">{windowSec.toFixed(windowSec < 10 ? 1 : 0)}s · wheel to zoom</div>
      </div>
      <div className="relative w-full h-6 rounded-md overflow-hidden border border-white/10 bg-[#07050c]">
        <canvas ref={overRef} className="w-full h-full block cursor-pointer" onClick={seekFromOverview} />
      </div>
    </div>
  );
};

type DrawProps = {
  analysis: SpectralAnalysis | null; peaks: Float32Array | null; duration: number;
  beatGrid?: { firstDownbeat: number; interval: number } | null; loop?: { in: number; out: number } | null;
  hotCues: (number | null)[]; cueColors: string[]; accent: string; windowSec: number;
};

function fit(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c.getContext('2d');
}

function drawZoom(c: HTMLCanvasElement | null, P: DrawProps, t: number) {
  if (!c) return;
  const ctx = fit(c);
  if (!ctx) return;
  const W = c.width, H = c.height, mid = H * 0.52, half = H * 0.42;
  const spp = P.windowSec / W; // seconds per pixel
  const t0 = t - P.windowSec / 2;
  const xOf = (time: number) => (time - t0) / spp;
  ctx.clearRect(0, 0, W, H);

  // loop region
  if (P.loop) {
    const a = xOf(P.loop.in), b = xOf(P.loop.out);
    if (b > 0 && a < W) {
      ctx.fillStyle = 'rgba(147,51,234,0.22)'; ctx.fillRect(a, 0, b - a, H);
      ctx.fillStyle = 'rgba(192,132,252,0.9)'; ctx.fillRect(a, 0, 2, H); ctx.fillRect(b - 2, 0, 2, H);
    }
  }

  // beat grid
  if (P.beatGrid && P.beatGrid.interval > 0) {
    const { firstDownbeat: fd, interval } = P.beatGrid;
    let k = Math.floor((t0 - fd) / interval);
    const dpr = W / Math.max(1, c.clientWidth);
    ctx.font = `bold ${Math.round(8 * dpr)}px ui-monospace, monospace`;
    for (; ; k++) {
      const bt = fd + k * interval;
      const x = xOf(bt);
      if (x > W) break;
      if (x < 0) continue;
      const bar = k % 4 === 0;
      ctx.fillStyle = bar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(Math.round(x), 0, bar ? 2 : 1, H);
      if (bar) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(String(Math.floor(k / 4) + 1), x + 3, 10 * dpr + 6); }
    }
  }

  if (P.analysis) {
    const A = P.analysis;
    const fpp = spp / A.hop;
    for (let x = 0; x < W; x++) {
      const time = t0 + x * spp;
      if (time < 0 || time > A.duration) continue;
      const f0 = Math.floor(time / A.hop), f1 = Math.floor(f0 + Math.max(1, fpp));
      const lo = bandAt(A.low, f0, f1) / 255, mi = bandAt(A.mid, f0, f1) / 255, hi = bandAt(A.high, f0, f1) / 255;
      const v = bandAt(A.vocal, f0, f1) / 255;
      const played = time < t;
      // vocal: a lane at the top + a soft wash behind the waveform body
      if (v > 0.12) {
        ctx.globalAlpha = Math.min(0.85, v) * (played ? 0.5 : 1);
        ctx.fillStyle = WAVE_COLORS.vocal;
        ctx.fillRect(x, 0, 1, Math.max(3, H * 0.06));
        ctx.globalAlpha = Math.min(0.22, v * 0.25) * (played ? 0.5 : 1);
        ctx.fillRect(x, mid - half * v, 1, half * v * 2);
      }
      ctx.globalAlpha = played ? 0.42 : 0.95;
      ctx.fillStyle = WAVE_COLORS.low; ctx.fillRect(x, mid - lo * half, 1, lo * half * 2);
      ctx.fillStyle = WAVE_COLORS.mid; ctx.fillRect(x, mid - mi * half * 0.68, 1, mi * half * 1.36);
      ctx.fillStyle = WAVE_COLORS.high; ctx.fillRect(x, mid - hi * half * 0.38, 1, hi * half * 0.76);
    }
    ctx.globalAlpha = 1;

    // onsets — binary search the visible window
    const os = A.onsets;
    let lo = 0, hi = os.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (os[m].time < t0) lo = m + 1; else hi = m; }
    const s = Math.max(2, Math.round(H * 0.06));
    for (let i = lo; i < os.length && os[i].time <= t0 + P.windowSec; i++) {
      const o = os[i];
      const x = xOf(o.time);
      const a = (o.time < t ? 0.45 : 1) * (0.45 + 0.55 * o.strength);
      ctx.globalAlpha = a;
      if (o.kind === 'kick') {
        ctx.fillStyle = WAVE_COLORS.kick;
        ctx.beginPath(); ctx.moveTo(x, H - s * 2.2); ctx.lineTo(x - s, H - 1); ctx.lineTo(x + s, H - 1); ctx.closePath(); ctx.fill();
        ctx.fillRect(x - 0.5, mid, 1, H - mid - s * 2.2);
      } else if (o.kind === 'snare') {
        ctx.fillStyle = WAVE_COLORS.snare;
        const y = H * 0.12;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill();
        ctx.fillRect(x - 0.5, y + s, 1, mid - y - s);
      } else {
        ctx.fillStyle = WAVE_COLORS.hat;
        ctx.beginPath(); ctx.arc(x, H * 0.24, Math.max(1.2, s * 0.45), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  } else if (P.peaks && P.duration) {
    const N = P.peaks.length;
    for (let x = 0; x < W; x++) {
      const time = t0 + x * spp;
      if (time < 0 || time > P.duration) continue;
      const p = P.peaks[Math.min(N - 1, Math.floor((time / P.duration) * N))] || 0;
      ctx.fillStyle = time < t ? 'rgba(120,140,170,0.45)' : 'rgba(150,170,200,0.9)';
      ctx.fillRect(x, mid - p * half, 1, p * half * 2);
    }
  }

  // hot cues
  P.hotCues.forEach((cue, i) => {
    if (cue == null) return;
    const x = xOf(cue);
    if (x < -10 || x > W + 10) return;
    ctx.fillStyle = P.cueColors[i % P.cueColors.length];
    ctx.fillRect(x - 1, 0, 2, H);
    ctx.fillRect(x - 1, 0, 12, 11);
    ctx.fillStyle = '#000'; ctx.font = 'bold 9px ui-monospace, monospace'; ctx.fillText(String(i + 1), x + 2, 9);
  });

  // centre playhead
  ctx.fillStyle = P.accent; ctx.shadowColor = P.accent; ctx.shadowBlur = 8;
  ctx.fillRect(W / 2 - 1, 0, 2, H);
  ctx.shadowBlur = 0;
}

function drawOverview(c: HTMLCanvasElement | null, cache: HTMLCanvasElement | null, P: DrawProps, t: number) {
  if (!c) return;
  const ctx = fit(c);
  if (!ctx) return;
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (cache) ctx.drawImage(cache, 0, 0, W, H);
  if (!P.duration) return;
  const px = (time: number) => (time / P.duration) * W;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, px(t), H); // played
  if (P.loop) { ctx.fillStyle = 'rgba(147,51,234,0.45)'; ctx.fillRect(px(P.loop.in), 0, Math.max(2, px(P.loop.out) - px(P.loop.in)), H); }
  P.hotCues.forEach((cue, i) => { if (cue != null) { ctx.fillStyle = P.cueColors[i % P.cueColors.length]; ctx.fillRect(px(cue) - 1, 0, 2, H); } });
  // visible window
  const a = px(t - P.windowSec / 2), b = px(t + P.windowSec / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(a + 0.5, 0.5, Math.max(2, b - a), H - 1);
  ctx.fillStyle = P.accent; ctx.fillRect(px(t) - 1, 0, 2, H);
}

export default SpectralWaveform;
