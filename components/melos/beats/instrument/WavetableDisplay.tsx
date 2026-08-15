// The wavetable display — ONDA's hero control.
//
// It draws the ACTUAL frame the oscillator is reading, not a decorative squiggle: the same
// generated table data the Rust engine mip-maps. Turning the morph knob and watching the
// waveform answer is how people learn what a wavetable is.

import React, { useEffect, useRef } from 'react';
import { FRAME_SIZE, FRAMES, WAVETABLES, getWavetable } from '../../../../services/melos/instruments/onda/wavetables';

interface Props {
  tableId: string;
  morph: number;   // 0..1
  color: string;
  height?: number;
}

export const WavetableDisplay: React.FC<Props> = ({ tableId, morph, color, height = 132 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  return (
    <div className="relative rounded-[14px] border border-white/10 overflow-hidden" style={{ height, background: 'linear-gradient(180deg, rgba(212,0,85,0.06), transparent)' }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <span className="absolute top-2 left-3 text-[9.5px] uppercase tracking-[0.16em] text-white/35">
        {def?.name || tableId} · frame {Math.round(morph * (FRAMES - 1)) + 1} / {FRAMES}
      </span>
      <span className="absolute top-2 right-3 font-mono text-[9.5px]" style={{ color }}>
        morph {morph.toFixed(2)}
      </span>
      {def && <span className="absolute bottom-2 left-3 text-[9.5px] text-white/25">{def.journey}</span>}
    </div>
  );
};
