// The device scope — every FX device's before/after picture.
//
// Three layers on one canvas, drawn from the device's own analyser taps (devices.ts FxBase gives
// every device a `pre` at its input and a `post` at its output, so this works for ANY device):
//   1. the OG signal — the input spectrum, filled and dim (what went in)
//   2. the affected signal — the output spectrum, a bright line (what came out)
//   3. the response curve — the device's analytic magnitude (EQ/de-hum/de-ess), so you can see
//      the shape you dialled even in silence
// Dynamics devices additionally get a transfer curve + live gain-reduction bar, because a
// compressor's "shape" is level-domain, not frequency-domain.
//
// Log frequency axis, +4.5 dB/oct tilt (the SPAN convention) so a balanced mix reads flat.

import React, { useEffect, useRef } from 'react';
import type { FxNode } from '../../../../services/melos/beats/fx/devices';
import { deviceCurveDb } from '../../../../services/melos/beats/fx/devices';

interface FxScopeProps {
  /** Live device — undefined when the chain isn't running (we then draw curve-only). */
  node?: FxNode;
  type: string;
  params: Record<string, number>;
  color: string;
  category: string;
  /** Live gain reduction in dB (≤0) for dynamics devices. */
  gr?: number;
  height?: number;
}

const F_MIN = 20, F_MAX = 20000;

export const FxScope: React.FC<FxScopeProps> = ({ node, type, params, color, category, gr = 0, height = 92 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  // Params/gr change every render; keep them in refs so the rAF loop never restarts.
  const live = useRef({ node, type, params, color, category, gr });
  live.current = { node, type, params, color, category, gr };

  useEffect(() => {
    let raf = 0;
    let preBuf: Float32Array | null = null;
    let postBuf: Float32Array | null = null;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv) return;
      const g = cv.getContext('2d');
      if (!g) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w === 0) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const L = live.current;
      const isDyn = L.category === 'dynamics';

      // ── grid ──
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (h * i) / 4); g.lineTo(w, (h * i) / 4); g.stroke(); }
      if (!isDyn) {
        for (const f of [100, 1000, 10000]) {
          const x = (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
        }
      }

      if (isDyn) {
        // ── Dynamics: transfer curve (in dB → out dB) + live GR bar ──
        const thr = L.params.threshold ?? -18;
        const ratio = Math.max(1, L.params.ratio ?? 2);
        const knee = L.params.knee ?? 12;
        const makeup = L.params.makeup ?? 0;
        const barW = 14;
        const plotW = w - barW - 6;
        const toX = (db: number) => ((db + 60) / 60) * plotW;
        const toY = (db: number) => h - ((db + 60) / 60) * h;
        // unity reference
        g.strokeStyle = 'rgba(255,255,255,0.14)';
        g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(toX(-60), toY(-60)); g.lineTo(toX(0), toY(0)); g.stroke();
        g.setLineDash([]);
        // the curve
        g.strokeStyle = L.color; g.lineWidth = 1.6;
        g.beginPath();
        for (let px = 0; px <= plotW; px += 2) {
          const inDb = (px / plotW) * 60 - 60;
          let outDb: number;
          const over = inDb - thr;
          if (knee > 0 && over > -knee / 2 && over < knee / 2) {
            const t = (over + knee / 2) / knee;                       // soft knee
            outDb = inDb + ((1 / ratio - 1) * knee * t * t) / 2;
          } else if (over <= 0) outDb = inDb;
          else outDb = thr + over / ratio;
          outDb += makeup;
          const y = toY(Math.max(-60, Math.min(0, outDb)));
          if (px === 0) g.moveTo(px, y); else g.lineTo(px, y);
        }
        g.stroke();
        // threshold marker
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        g.beginPath(); g.moveTo(toX(thr), 0); g.lineTo(toX(thr), h); g.stroke();
        // live GR bar on the right
        const grAbs = Math.min(24, Math.abs(L.gr));
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(w - barW, 0, barW, h);
        if (grAbs > 0.05) {
          const gh = (grAbs / 24) * h;
          g.fillStyle = grAbs > 6 ? '#EF4444' : grAbs > 3 ? '#F59E0B' : '#06D6A0';
          g.fillRect(w - barW + 2, 0, barW - 4, gh);
        }
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = '7px ui-monospace, monospace';
        g.fillText('GR', w - barW + 1, h - 2);
        return;
      }

      // ── Spectrum devices: OG (filled) vs affected (line) ──
      const n = L.node;
      const sr = 48000;
      const yFor = (db: number) => h - ((db + 96) / 78) * h; // −96…−18 dBFS after tilt
      const drawSpectrum = (an: AnalyserNode, buf: Float32Array, fill: boolean, stroke: string, alpha: number) => {
        an.getFloatFrequencyData(buf);
        g.beginPath();
        let started = false;
        for (let px = 0; px <= w; px += 2) {
          const f = F_MIN * Math.pow(F_MAX / F_MIN, px / w);
          const bin = Math.min(buf.length - 1, Math.round((f / (sr / 2)) * buf.length));
          const tilt = 4.5 * Math.log2(f / 1000);
          const y = Math.max(-2, Math.min(h + 2, yFor(buf[bin] + tilt)));
          if (!started) { g.moveTo(px, y); started = true; } else g.lineTo(px, y);
        }
        if (fill) {
          g.lineTo(w, h); g.lineTo(0, h); g.closePath();
          g.fillStyle = stroke; g.globalAlpha = alpha; g.fill(); g.globalAlpha = 1;
        } else {
          g.strokeStyle = stroke; g.globalAlpha = alpha; g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1;
        }
      };
      if (n?.pre && n?.post) {
        if (!preBuf || preBuf.length !== n.pre.frequencyBinCount) preBuf = new Float32Array(n.pre.frequencyBinCount);
        if (!postBuf || postBuf.length !== n.post.frequencyBinCount) postBuf = new Float32Array(n.post.frequencyBinCount);
        drawSpectrum(n.pre, preBuf, true, '#ffffff', 0.10);   // the OG signal
        drawSpectrum(n.post, postBuf, false, L.color, 0.95);  // the affected signal
      }

      // ── the response curve you dialled, always visible ──
      const curveAt = (f: number) => deviceCurveDb(L.type, L.params, f, sr);
      if (curveAt(1000) !== null) {
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 1.4;
        g.setLineDash([]);
        g.beginPath();
        const mid = h / 2;
        for (let px = 0; px <= w; px += 2) {
          const f = F_MIN * Math.pow(F_MAX / F_MIN, px / w);
          const db = curveAt(f) ?? 0;
          const y = mid - (db / 24) * (h / 2); // ±24 dB spans the box
          if (px === 0) g.moveTo(px, Math.max(0, Math.min(h, y)));
          else g.lineTo(px, Math.max(0, Math.min(h, y)));
        }
        g.stroke();
        // 0 dB reference for the curve
        g.strokeStyle = 'rgba(255,255,255,0.10)';
        g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="rounded-[8px] border border-white/[0.08] bg-black/30 overflow-hidden" style={{ height }}>
      <canvas ref={ref} className="w-full h-full block" />
    </div>
  );
};
