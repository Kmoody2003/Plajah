// The wavetable display — ONDA's hero control.
//
// It draws the ACTUAL frame the oscillator is reading, not a decorative squiggle: the same
// generated table data the Rust engine mip-maps. Turning the morph knob and watching the
// waveform answer is how people learn what a wavetable is.

import React, { useEffect, useRef } from 'react';
import { FRAME_SIZE, FRAMES, WAVETABLES, getWavetable } from '../../../../services/melos/instruments/onda/wavetables';

/** Compute rising-zero-crossing trigger start index and signal stats for oscilloscope stability. */
export function computeTriggeredSlice(
  samples: Float32Array,
  count: number,
  windowLen = 256,
): { start: number; len: number; peak: number; rms: number } {
  const n = Math.min(count, samples.length);
  if (n <= 0) return { start: 0, len: 0, peak: 0, rms: 0 };
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / n);
  const len = Math.min(windowLen, Math.max(32, Math.floor(n * 0.625)));
  const maxStart = Math.max(0, n - len);
  let start = 0;
  if (peak >= 0.0015 && maxStart > 2) {
    // Pick the first clean rising zero crossing in the search window so cyclic waveforms lock cleanly.
    const gate = -Math.min(0.01, peak * 0.05);
    for (let i = 1; i <= maxStart; i++) {
      if (samples[i - 1] <= gate && samples[i] > 0) {
        start = i;
        break;
      }
    }
  }
  return { start, len: Math.min(len, n - start), peak, rms };
}

interface Props {
  tableId: string;
  morph: number;   // 0..1
  color: string;
  height?: number;
  trackId?: string;
}

export const WavetableDisplay: React.FC<Props> = ({ tableId, morph, color, height = 132, trackId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveBadgeRef = useRef<HTMLSpanElement>(null);
  const def = WAVETABLES.find((w) => w.id === tableId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (const y of [h * 0.2, h * 0.5, h * 0.8]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const data = getWavetable(tableId);
    if (!data) return;

    const frameAt = Math.max(0, Math.min(FRAMES - 1, Math.round(morph * (FRAMES - 1))));
    const drawFrame = (frame: number, alpha: number, lw: number) => {
      const base = frame * FRAME_SIZE;
      if (base + FRAME_SIZE > data.length) return;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(FRAME_SIZE / Math.max(2, w)));
      for (let i = 0, x = 0; i < FRAME_SIZE; i += step, x++) {
        const v = data[base + i];
        const px = (i / FRAME_SIZE) * w;
        const py = h / 2 - v * (h / 2 - 8);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // Ghost the neighbouring frames so the morph direction is legible at a glance.
    if (frameAt > 0) drawFrame(frameAt - 1, 0.18, 1.2);
    if (frameAt < FRAMES - 1) drawFrame(frameAt + 1, 0.18, 1.2);
    drawFrame(frameAt, 1, 2);
  }, [tableId, morph, color]);

  // 60 fps live audio-rate oscilloscope overlay sampled from the active ONDA InstrumentHost ring buffer.
  useEffect(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas || !trackId) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    let rafId = 0;
    let fade = 0;
    const buf = new Float32Array(512);
    let getEngine: (() => { getInstrument: (id: string) => { readWaveform: (dest: Float32Array) => number } | undefined }) | null = null;

    void import('../../../../services/melos/beats/engine/BeatsEngine').then((m) => {
      if (!cancelled) getEngine = () => m.BeatsEngine.get();
    });

    const tick = () => {
      if (cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 320;
      const h = canvas.clientHeight || height;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      const inst = getEngine?.().getInstrument(trackId);
      const count = inst ? inst.readWaveform(buf) : 0;
      const { start, len, peak } = computeTriggeredSlice(buf, count, 280);

      if (peak >= 0.0015 && len >= 2) {
        fade = 1;
      } else {
        fade *= 0.82;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      if (fade > 0.02 && len >= 2) {
        const midY = h / 2;
        const ampScale = peak > 0.005 ? Math.min(2.8, 0.82 / Math.max(peak, 0.25)) : 1;
        const amp = (h / 2 - 8) * ampScale;

        const tracePath = () => {
          ctx.beginPath();
          for (let i = 0; i < len; i++) {
            const x = (i / (len - 1)) * w;
            const y = midY - Math.max(-1, Math.min(1, buf[start + i])) * amp;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        };

        // Soft phosphor glow underneath the crisp live audio waveform.
        ctx.save();
        ctx.globalAlpha = 0.34 * fade;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        tracePath();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.94 * fade;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.7;
        tracePath();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      const badge = liveBadgeRef.current;
      if (badge) {
        if (fade > 0.08 && peak >= 0.0015) {
          badge.style.opacity = String(Math.min(1, fade));
          badge.textContent = `LIVE ${Math.min(100, Math.round(peak * 100))}%`;
        } else {
          badge.style.opacity = '0';
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [trackId, color, height]);

  return (
    <div className="relative rounded-[14px] border border-white/10 overflow-hidden" style={{ height, background: 'linear-gradient(180deg, rgba(212,0,85,0.06), transparent)' }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <canvas ref={liveCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <span className="absolute top-2 left-3 text-[9.5px] uppercase tracking-[0.16em] text-white/35">
        {def?.name || tableId} · frame {Math.round(morph * (FRAMES - 1)) + 1} / {FRAMES}
      </span>
      {trackId && (
        <span
          ref={liveBadgeRef}
          className="absolute top-2 right-3 text-[9px] font-mono uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-black/50 border border-white/15 text-white/85 pointer-events-none transition-opacity"
          style={{ opacity: 0, color }}
        />
      )}
      <span className="absolute top-2 right-3 font-mono text-[9.5px]" style={{ color }}>
        morph {morph.toFixed(2)}
      </span>
      {def && <span className="absolute bottom-2 left-3 text-[9.5px] text-white/25">{def.journey}</span>}
    </div>
  );
};
