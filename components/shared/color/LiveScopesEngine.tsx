// components/shared/color/LiveScopesEngine.tsx
// ═══════════════════════════════════════════════════════════════════════════
// Real-Time Colorist Video & Canvas Scopes Engine
// Shared by Tela and Fabula.
// Provides Waveform (IRE), RGB Parade, Vectorscope (Skin Tone Line & Targets),
// and 64-bin RGB Histogram with Broadcast Legal Clipping alerts.
// ═══════════════════════════════════════════════════════════════════════════

import React, { memo, useEffect, useRef, useState } from 'react';

const SW = 160;
const SH = 90;

export type ScopeType = 'waveform' | 'parade' | 'vectorscope' | 'histogram';

export interface LiveScopesEngineProps {
  sourceRef?: React.RefObject<HTMLVideoElement | HTMLCanvasElement | null>;
  sourceUrl?: string;
  sourceImage?: HTMLImageElement | null;
  mode?: 'grid' | 'tabbed';
  initialTab?: ScopeType;
  height?: number;
}

function drawScopeBuffers(
  px: Uint8ClampedArray,
  canvases: { wave?: HTMLCanvasElement | null; parade?: HTMLCanvasElement | null; vector?: HTMLCanvasElement | null; histo?: HTMLCanvasElement | null },
  highlightClipping = true
) {
  const { wave, parade, vector, histo } = canvases;
  const n = SW * SH;

  const setup = (c: HTMLCanvasElement) => {
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#08070d';
    g.fillRect(0, 0, c.width, c.height);
    return g;
  };

  // 1. WAVEFORM (Luma) ────────────────────────────────────────────────────────
  if (wave) {
    const g = setup(wave);
    if (g) {
      const W = wave.width, H = wave.height;
      // Grid graticules (0%, 25%, 50%, 75%, 100% IRE)
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        g.beginPath();
        g.moveTo(0, H * f);
        g.lineTo(W, H * f);
        g.stroke();
      }

      g.fillStyle = 'rgba(0, 218, 243, 0.45)';
      for (let x = 0; x < SW; x++) {
        const cx = (x / SW) * W;
        for (let y = 0; y < SH; y++) {
          const i = (y * SW + x) * 4;
          const r = px[i], gr = px[i + 1], b = px[i + 2];
          const luma = 0.2126 * r + 0.7152 * gr + 0.0722 * b;

          // Legal broadcast clipping indicator (IRE > 100% or < 0%)
          if (highlightClipping && (r > 245 || gr > 245 || b > 245)) {
            g.fillStyle = 'rgba(255, 60, 60, 0.8)';
          } else {
            g.fillStyle = 'rgba(0, 218, 243, 0.40)';
          }
          g.fillRect(cx, H - (luma / 255) * H, 1.2, 1.2);
        }
      }

      // IRE Labels
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.font = '8px monospace';
      g.fillText('100', 4, 10);
      g.fillText('50', 4, H * 0.5 + 3);
      g.fillText('0', 4, H - 4);
    }
  }

  // 2. RGB PARADE ─────────────────────────────────────────────────────────────
  if (parade) {
    const g = setup(parade);
    if (g) {
      const W = parade.width, H = parade.height;
      const third = W / 3;
      const cols = [
        [255, 80, 80],
        [80, 240, 120],
        [80, 160, 255],
      ];

      for (let ch = 0; ch < 3; ch++) {
        g.fillStyle = `rgba(${cols[ch][0]},${cols[ch][1]},${cols[ch][2]},0.45)`;
        for (let x = 0; x < SW; x++) {
          const cx = ch * third + (x / SW) * third;
          for (let y = 0; y < SH; y++) {
            const v = px[(y * SW + x) * 4 + ch];
            g.fillRect(cx, H - (v / 255) * H, 1, 1);
          }
        }
      }

      // Column dividers
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.strokeRect(0, 0, third, H);
      g.strokeRect(third, 0, third, H);
      g.strokeRect(third * 2, 0, third, H);

      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.font = '8px monospace';
      g.fillText('R', 4, 10);
      g.fillText('G', third + 4, 10);
      g.fillText('B', third * 2 + 4, 10);
    }
  }

  // 3. VECTORSCOPE (Cb/Cr with 33° Skin Tone Line) ────────────────────────────
  if (vector) {
    const g = setup(vector);
    if (g) {
      const W = vector.width, H = vector.height;
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) / 2 - 6;

      // Outer & 75% saturation target circles
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, R * 0.75, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, R * 0.35, 0, Math.PI * 2);
      g.stroke();

      // 33° Skin Tone Line (I-axis in Cb/Cr space)
      g.strokeStyle = 'rgba(255, 175, 120, 0.65)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + R * Math.cos(-2.53), cy + R * Math.sin(-2.53));
      g.stroke();

      // Plot Pixels
      g.fillStyle = 'rgba(160, 220, 255, 0.45)';
      for (let i = 0; i < n * 4; i += 16) {
        const r = px[i], gr = px[i + 1], b = px[i + 2];
        const cb = (-0.1687 * r - 0.3313 * gr + 0.5 * b) / 127;
        const cr = (0.5 * r - 0.4187 * gr - 0.0813 * b) / 127;
        g.fillRect(cx + cb * R, cy - cr * R, 1.2, 1.2);
      }

      // Color target graticules
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = '8px monospace';
      const targets: [string, number, number][] = [
        ['R', 0.32, -0.42],
        ['G', -0.42, 0.15],
        ['B', 0.42, 0.28],
        ['Y', -0.1, -0.55],
        ['Mg', 0.5, -0.15],
        ['Cy', -0.5, 0.1],
      ];
      for (const [lbl, tb, tr2] of targets) {
        const tx = cx + tb * R * 1.5;
        const ty = cy - tr2 * R * 1.5;
        g.strokeStyle = 'rgba(255,255,255,0.2)';
        g.strokeRect(tx - 4, ty - 4, 8, 8);
        g.fillText(lbl, tx - 3, ty + 3);
      }

      // Skin Tone Tag
      g.fillStyle = 'rgba(255, 175, 120, 0.7)';
      g.fillText('SKIN', cx + R * Math.cos(-2.53) * 0.85, cy + R * Math.sin(-2.53) * 0.85 - 2);
    }
  }

  // 4. HISTOGRAM (64-bin RGB) ─────────────────────────────────────────────────
  if (histo) {
    const g = setup(histo);
    if (g) {
      const W = histo.width, H = histo.height;
      const bins = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];

      for (let i = 0; i < n * 4; i += 4) {
        bins[0][px[i] >> 2]++;
        bins[1][px[i + 1] >> 2]++;
        bins[2][px[i + 2] >> 2]++;
      }

      let max = 1;
      for (const b of bins) {
        for (const v of b) {
          if (v > max) max = v;
        }
      }

      const cols = ['rgba(255,80,80,0.50)', 'rgba(80,240,120,0.50)', 'rgba(80,160,255,0.50)'];
      const bw = W / 64;

      for (let ch = 0; ch < 3; ch++) {
        g.fillStyle = cols[ch];
        for (let b = 0; b < 64; b++) {
          const h = (bins[ch][b] / max) * (H - 4);
          g.fillRect(b * bw, H - h, bw - 0.5, h);
        }
      }

      // Shadow / Highlight clipping lines
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.strokeRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.font = '8px monospace';
      g.fillText('0', 4, H - 4);
      g.fillText('255', W - 18, H - 4);
    }
  }
}

export const LiveScopesEngine: React.FC<LiveScopesEngineProps> = ({
  sourceRef,
  sourceUrl,
  sourceImage,
  mode = 'grid',
  initialTab = 'waveform',
  height = 120,
}) => {
  const [activeTab, setActiveTab] = useState<ScopeType>(initialTab);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const paradeRef = useRef<HTMLCanvasElement>(null);
  const vectorRef = useRef<HTMLCanvasElement>(null);
  const histoRef = useRef<HTMLCanvasElement>(null);
  const bufCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf: number;
    let lastTime = 0;

    if (!bufCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = SW;
      c.height = SH;
      bufCanvasRef.current = c;
    }

    const sampleAndDraw = (sourceElem: CanvasImageSource) => {
      if (!bufCanvasRef.current) return;
      try {
        const ctx = bufCanvasRef.current.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(sourceElem, 0, 0, SW, SH);
        const px = ctx.getImageData(0, 0, SW, SH).data;
        drawScopeBuffers(px, {
          wave: waveRef.current,
          parade: paradeRef.current,
          vector: vectorRef.current,
          histo: histoRef.current,
        });
      } catch {
        // Cross-origin or mid-load
      }
    };

    if (sourceUrl && !sourceRef?.current) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => sampleAndDraw(img);
      img.src = sourceUrl;
    } else if (sourceImage) {
      sampleAndDraw(sourceImage);
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastTime < 100) return; // ~10 fps is smooth and lightweight
      lastTime = now;

      const src = sourceRef?.current;
      if (!src) return;
      if ('readyState' in src && (src as HTMLVideoElement).readyState < 2) return;

      sampleAndDraw(src);
    };

    if (sourceRef) {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sourceRef, sourceUrl, sourceImage, activeTab, mode]);

  const boxStyle: React.CSSProperties = {
    background: '#08070d',
    borderRadius: 6,
    width: '100%',
    height,
    display: 'block',
    border: '1px solid rgba(255,255,255,0.08)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 3,
    textTransform: 'uppercase',
  };

  if (mode === 'tabbed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['waveform', 'parade', 'vectorscope', 'histogram'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '3px 0',
                borderRadius: 5,
                border: 'none',
                background: activeTab === tab ? 'rgba(0,218,243,0.2)' : 'rgba(255,255,255,0.05)',
                color: activeTab === tab ? '#00DAF3' : 'rgba(255,255,255,0.6)',
                fontWeight: 700,
                fontSize: 9.5,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {tab === 'waveform' ? 'Waveform' : tab === 'parade' ? 'Parade' : tab === 'vectorscope' ? 'Vector' : 'Histogram'}
            </button>
          ))}
        </div>

        {/* Selected Canvas */}
        <div style={{ width: '100%', height }}>
          <canvas
            ref={activeTab === 'waveform' ? waveRef : activeTab === 'parade' ? paradeRef : activeTab === 'vectorscope' ? vectorRef : histoRef}
            width={340}
            height={height}
            style={boxStyle}
          />
        </div>
      </div>
    );
  }

  // Grid Mode (2x2)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
      <div>
        <div style={titleStyle}>WAVEFORM (LUMA)</div>
        <canvas ref={waveRef} width={220} height={height} style={boxStyle} />
      </div>
      <div>
        <div style={titleStyle}>RGB PARADE</div>
        <canvas ref={paradeRef} width={220} height={height} style={boxStyle} />
      </div>
      <div>
        <div style={titleStyle}>VECTORSCOPE</div>
        <canvas ref={vectorRef} width={220} height={height} style={boxStyle} />
      </div>
      <div>
        <div style={titleStyle}>HISTOGRAM</div>
        <canvas ref={histoRef} width={220} height={height} style={boxStyle} />
      </div>
    </div>
  );
};

export default memo(LiveScopesEngine);
