// components/shared/color/CurveEditorSplines.tsx
// ═══════════════════════════════════════════════════════════════════════════
// Tone Curve Spline Editor (Catmull-Rom)
// Shared across Tela and Fabula.
// Provides Master Y, R, G, B channels with exact Catmull-Rom spline math,
// add/move/delete control points, and instant 256-LUT GPU generation.
// ═══════════════════════════════════════════════════════════════════════════

import React, { memo, useRef, useState, useCallback, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  evalCurve,
  type Curves,
  type CurvePoint,
  isCurvesIdentity,
} from '../../../services/color/colorWorkspace';

export type CurveChannelId = 'master' | 'r' | 'g' | 'b';

const CHANNELS: { id: CurveChannelId; label: string; color: string }[] = [
  { id: 'master', label: 'Y (Luma)', color: '#f2f2f5' },
  { id: 'r', label: 'Red', color: '#ff7a7a' },
  { id: 'g', label: 'Green', color: '#7ee2a8' },
  { id: 'b', label: 'Blue', color: '#7ab8ff' },
];

const PAD = 10;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function withEnds(pts?: CurvePoint[] | null): CurvePoint[] {
  const list: CurvePoint[] = (pts || []).map((p) => [clamp01(p[0]), clamp01(p[1])]);
  if (!list.some((p) => p[0] <= 0.0001)) list.unshift([0, 0]);
  if (!list.some((p) => p[0] >= 0.9999)) list.push([1, 1]);
  list.sort((a, b) => a[0] - b[0]);
  return list;
}

function cleanupCurve(pts: CurvePoint[]): CurvePoint[] | undefined {
  const p = withEnds(pts);
  if (p.length === 2 && p[0][1] < 1e-4 && Math.abs(p[1][1] - 1) < 1e-4) return undefined;
  return p;
}

export interface CurveEditorSplinesProps {
  curves?: Curves | null;
  onChange: (curves: Curves | undefined) => void;
  width?: number;
  height?: number;
}

export const CurveEditorSplines: React.FC<CurveEditorSplinesProps> = ({
  curves,
  onChange,
  width = 280,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);
  const [activeChannel, setActiveChannel] = useState<CurveChannelId>('master');
  const [, forceUpdate] = useState(0);

  const pts = withEnds(curves?.[activeChannel]);

  const px = (x: number) => PAD + x * (width - 2 * PAD);
  const py = (y: number) => height - PAD - y * (height - 2 * PAD);
  const ux = (X: number) => clamp01((X - PAD) / (width - 2 * PAD));
  const uy = (Y: number) => clamp01((height - PAD - Y) / (height - 2 * PAD));

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== width * dpr || c.height !== height * dpr) {
      c.width = width * dpr;
      c.height = height * dpr;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0b0a12';
    ctx.fillRect(0, 0, width, height);

    // Grid (Quarter divisions)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const gx = Math.round(px(i / 4)) + 0.5;
      const gy = Math.round(py(i / 4)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, PAD);
      ctx.lineTo(gx, height - PAD);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(PAD, gy);
      ctx.lineTo(width - PAD, gy);
      ctx.stroke();
    }

    // Outer border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(PAD + 0.5, PAD + 0.5, width - 2 * PAD - 1, height - 2 * PAD - 1);

    // 45° Identity dashed line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, height - PAD);
    ctx.lineTo(width - PAD, PAD);
    ctx.stroke();
    ctx.setLineDash([]);

    // Other channels background ghost curves
    CHANNELS.forEach((ch) => {
      if (ch.id === activeChannel) return;
      const ghostPts = withEnds(curves?.[ch.id]);
      if (ghostPts && ghostPts.length > 2) {
        ctx.beginPath();
        for (let s = 0; s <= 64; s++) {
          const u = s / 64;
          const v = evalCurve(ghostPts, u);
          if (s === 0) ctx.moveTo(px(u), py(v));
          else ctx.lineTo(px(u), py(v));
        }
        ctx.strokeStyle = ch.color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    });

    // Active Channel Catmull-Rom Spline Curve
    const col = CHANNELS.find((k) => k.id === activeChannel)?.color || '#f2f2f5';
    ctx.beginPath();
    for (let s = 0; s <= 128; s++) {
      const u = s / 128;
      const v = evalCurve(pts, u);
      if (s === 0) ctx.moveTo(px(u), py(v));
      else ctx.lineTo(px(u), py(v));
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Control Points
    pts.forEach((p, idx) => {
      const cx = px(p[0]);
      const cy = py(p[1]);
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (dragRef.current === idx) {
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }, [activeChannel, pts, curves, width, height]);

  useEffect(() => {
    draw();
  });

  const commit = (nextPts: CurvePoint[]) => {
    const next: Curves = { ...(curves || {}), [activeChannel]: cleanupCurve(nextPts) };
    if (next[activeChannel] === undefined) delete next[activeChannel];
    onChange(Object.keys(next).length ? next : undefined);
  };

  const hitTest = (X: number, Y: number) => {
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(px(pts[i][0]) - X, py(pts[i][1]) - Y) < 10) return i;
    }
    return -1;
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const X = e.clientX - r.left;
    const Y = e.clientY - r.top;
    let i = hitTest(X, Y);
    if (i < 0) {
      const nx = ux(X);
      const ny = uy(Y);
      const np = pts.filter((p) => p[0] > 0.0001 && p[0] < 0.9999).concat([[nx, ny]]);
      const full = withEnds(np);
      i = full.findIndex((p) => Math.abs(p[0] - nx) < 1e-4 && Math.abs(p[1] - ny) < 1e-4);
      dragRef.current = i;
      commit(full);
    } else {
      dragRef.current = i;
    }
    forceUpdate((n) => n + 1);

    const onMove = (ev: PointerEvent) => {
      const idx = dragRef.current;
      if (idx == null || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cur = withEnds(curves?.[activeChannel]);
      const isEnd = idx === 0 || idx === cur.length - 1;
      const nx = isEnd ? cur[idx][0] : clamp01((ev.clientX - rect.left - PAD) / (width - 2 * PAD));
      const ny = clamp01((height - PAD - (ev.clientY - rect.top)) / (height - 2 * PAD));
      const np = cur.map((p, k) => (k === idx ? ([nx, ny] as CurvePoint) : p));
      commit(np);
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onDoubleClick = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const i = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (i > 0 && i < pts.length - 1) {
      commit(pts.filter((_, k) => k !== i));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {/* Channel Buttons Header */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            type="button"
            onClick={() => setActiveChannel(ch.id)}
            style={{
              padding: '3px 8px',
              borderRadius: 5,
              fontSize: 9.5,
              fontWeight: 800,
              cursor: 'pointer',
              border: activeChannel === ch.id ? `1px solid ${ch.color}` : '1px solid rgba(255,255,255,0.1)',
              background: activeChannel === ch.id ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
              color: ch.color,
            }}
          >
            {ch.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => commit([[0, 0], [1, 1]])}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 9,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Reset active channel"
          >
            <RotateCcw size={10} />
            <span>Reset {activeChannel.toUpperCase()}</span>
          </button>

          {!isCurvesIdentity(curves) && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: 'rgba(255,255,255,0.6)',
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 5px',
                cursor: 'pointer',
              }}
              title="Reset all curves to identity"
            >
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          cursor: 'crosshair',
          touchAction: 'none',
          display: 'block',
        }}
        onPointerDown={onDown}
        onDoubleClick={onDoubleClick}
      />

      {/* Axis Scale Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: 'rgba(255,255,255,0.4)', padding: '0 2px' }}>
        <span>Blacks (0.0)</span>
        <span>Midtones (0.5)</span>
        <span>Whites (1.0)</span>
      </div>
    </div>
  );
};

export default memo(CurveEditorSplines);
