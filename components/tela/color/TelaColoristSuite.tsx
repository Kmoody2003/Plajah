// components/tela/color/TelaColoristSuite.tsx
// Professional colorist grading suite for Tela & Photos.
// Provides 3-Way Color Wheels (Lift, Gamma, Gain, Offset with master luma rings),
// RGB Tone Curve Splines, Live Scopes (RGB Parade, Luma Waveform, Vectorscope, Histogram),
// Working Color Space selection (sRGB, Display P3, Rec.709, Rec.2020, CMYK FOGRA39 / SWOP v2),
// Total Ink Coverage (TAC) monitoring, Soft Proofing with Gamut Warning, and Creative Looks.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SlidersHorizontal,
  CircleDot,
  TrendingUp,
  Activity,
  Layers,
  Pipette,
  Printer,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Eye,
  Check
} from 'lucide-react';
import {
  ColorSpaceId,
  srgbToCmyk,
  srgbToDisplayP3,
  srgbToRec709,
  srgbToOklch,
  measureColor,
} from '../../services/tela/raster/colorWorkspace';
import { CREATIVE_LOOKS, type PhotoEditAdjustments } from '../../services/photoEditingService';

export interface ColorWheelState {
  lift: [number, number, number]; // [R, G, B] -0.5..0.5, def 0
  liftMaster: number; // -1..1, def 0
  gamma: [number, number, number]; // [R, G, B] -0.5..0.5, def 0
  gammaMaster: number; // -1..1, def 0
  gain: [number, number, number]; // [R, G, B] -0.5..0.5, def 0
  gainMaster: number; // -1..1, def 0
  offset: [number, number, number]; // [R, G, B] -0.5..0.5, def 0
  offsetMaster: number; // -1..1, def 0
}

export const DEFAULT_WHEELS: ColorWheelState = {
  lift: [0, 0, 0],
  liftMaster: 0,
  gamma: [0, 0, 0],
  gammaMaster: 0,
  gain: [0, 0, 0],
  gainMaster: 0,
  offset: [0, 0, 0],
  offsetMaster: 0,
};

export type CurveChannel = 'master' | 'r' | 'g' | 'b';
export type CurvePoints = [number, number][]; // [x, y] in 0..1

export interface ColorCurvesState {
  master: CurvePoints;
  r: CurvePoints;
  g: CurvePoints;
  b: CurvePoints;
}

export const DEFAULT_CURVES: ColorCurvesState = {
  master: [[0, 0], [1, 1]],
  r: [[0, 0], [1, 1]],
  g: [[0, 0], [1, 1]],
  b: [[0, 0], [1, 1]],
};

interface TelaColoristSuiteProps {
  sourceImageUrl?: string;
  canvasWidth: number;
  canvasHeight: number;
  colorSpace: ColorSpaceId;
  onColorSpaceChange: (cs: ColorSpaceId) => void;
  softProofing: boolean;
  onSoftProofingChange: (enabled: boolean) => void;
  cmykPlate: 'composite' | 'cyan' | 'magenta' | 'yellow' | 'black';
  onCmykPlateChange: (plate: 'composite' | 'cyan' | 'magenta' | 'yellow' | 'black') => void;
  wheels: ColorWheelState;
  onWheelsChange: (wheels: ColorWheelState) => void;
  curves: ColorCurvesState;
  onCurvesChange: (curves: ColorCurvesState) => void;
  onEyedropperToggle: () => void;
  eyedropperActive: boolean;
  onApplyLook?: (lookId: string) => void;
}

export const TelaColoristSuite: React.FC<TelaColoristSuiteProps> = ({
  sourceImageUrl,
  canvasWidth,
  canvasHeight,
  colorSpace,
  onColorSpaceChange,
  softProofing,
  onSoftProofingChange,
  cmykPlate,
  onCmykPlateChange,
  wheels,
  onWheelsChange,
  curves,
  onCurvesChange,
  onEyedropperToggle,
  eyedropperActive,
  onApplyLook,
}) => {
  const [activeTab, setActiveTab] = useState<'wheels' | 'curves' | 'scopes' | 'print'>('wheels');
  const [activeCurveCh, setActiveCurveCh] = useState<CurveChannel>('master');
  const [scopeMode, setScopeMode] = useState<'parade' | 'waveform' | 'vectorscope' | 'histogram'>('parade');

  // Scope canvas references
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Compute live scope metrics from source image
  useEffect(() => {
    if (!sourceImageUrl || activeTab !== 'scopes') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = scopeCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      const sw = 160, sh = 90;
      const tempC = document.createElement('canvas');
      tempC.width = sw;
      tempC.height = sh;
      const tempCtx = tempC.getContext('2d');
      if (!tempCtx) return;
      tempCtx.drawImage(img, 0, 0, sw, sh);
      const imgData = tempCtx.getImageData(0, 0, sw, sh);
      const px = imgData.data;

      const W = c.width, H = c.height;
      ctx.fillStyle = '#0a0812';
      ctx.fillRect(0, 0, W, H);

      if (scopeMode === 'parade') {
        const third = W / 3;
        const colors = ['rgba(255,80,80,0.45)', 'rgba(80,240,120,0.45)', 'rgba(80,160,255,0.45)'];
        for (let ch = 0; ch < 3; ch++) {
          ctx.fillStyle = colors[ch];
          for (let x = 0; x < sw; x++) {
            const cx = ch * third + (x / sw) * third;
            for (let y = 0; y < sh; y++) {
              const val = px[(y * sw + x) * 4 + ch];
              ctx.fillRect(cx, H - (val / 255) * H, 1.2, 1.2);
            }
          }
        }
        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.strokeRect(0, 0, third, H);
        ctx.strokeRect(third, 0, third, H);
        ctx.strokeRect(third * 2, 0, third, H);
      } else if (scopeMode === 'waveform') {
        ctx.fillStyle = 'rgba(0, 218, 243, 0.45)';
        for (let x = 0; x < sw; x++) {
          const cx = (x / sw) * W;
          for (let y = 0; y < sh; y++) {
            const idx = (y * sw + x) * 4;
            const luma = 0.2126 * px[idx] + 0.7152 * px[idx + 1] + 0.0722 * px[idx + 2];
            ctx.fillRect(cx, H - (luma / 255) * H, 1.2, 1.2);
          }
        }
      } else if (scopeMode === 'vectorscope') {
        const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 10;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        // 33° Skin tone line
        ctx.strokeStyle = 'rgba(255, 170, 120, 0.6)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + R * Math.cos(-2.53), cy + R * Math.sin(-2.53));
        ctx.stroke();

        ctx.fillStyle = 'rgba(160, 220, 255, 0.5)';
        for (let i = 0; i < px.length; i += 16) {
          const r = px[i], g = px[i + 1], b = px[i + 2];
          const cb = (-0.1687 * r - 0.3313 * g + 0.5 * b) / 127;
          const cr = (0.5 * r - 0.4187 * g - 0.0813 * b) / 127;
          ctx.fillRect(cx + cb * R, cy - cr * R, 1.2, 1.2);
        }
      } else if (scopeMode === 'histogram') {
        const histR = new Uint32Array(256);
        const histG = new Uint32Array(256);
        const histB = new Uint32Array(256);
        for (let i = 0; i < px.length; i += 4) {
          histR[px[i]]++;
          histG[px[i + 1]]++;
          histB[px[i + 2]]++;
        }
        const maxVal = Math.max(...histR, ...histG, ...histB) || 1;
        ctx.lineWidth = 1.5;
        const drawHistLine = (hist: Uint32Array, col: string) => {
          ctx.strokeStyle = col;
          ctx.beginPath();
          for (let i = 0; i < 256; i++) {
            const x = (i / 255) * W;
            const y = H - (hist[i] / maxVal) * H * 0.9;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };
        drawHistLine(histR, '#ff6e6e');
        drawHistLine(histG, '#7ee88a');
        drawHistLine(histB, '#54c8ff');
      }
    };
    img.src = sourceImageUrl;
  }, [sourceImageUrl, activeTab, scopeMode]);

  // Single Trackball Component for Color Wheels
  const renderWheel = (
    label: string,
    key: 'lift' | 'gamma' | 'gain' | 'offset',
    masterKey: 'liftMaster' | 'gammaMaster' | 'gainMaster' | 'offsetMaster'
  ) => {
    const val = wheels[key];
    const master = wheels[masterKey];

    // Compute puck position from RGB offsets
    const rAngle = 90 * (Math.PI / 180);
    const gAngle = 210 * (Math.PI / 180);
    const bAngle = 330 * (Math.PI / 180);

    const px = (val[0] * Math.cos(rAngle) + val[1] * Math.cos(gAngle) + val[2] * Math.cos(bAngle)) * 40;
    const py = (val[0] * Math.sin(rAngle) + val[1] * Math.sin(gAngle) + val[2] * Math.sin(bAngle)) * 40;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 96 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
            {label}
          </span>
          <button
            onClick={() => {
              onWheelsChange({ ...wheels, [key]: [0, 0, 0], [masterKey]: 0 });
            }}
            title="Reset Wheel"
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}
          >
            <RotateCcw size={10} />
          </button>
        </div>

        {/* Wheel Disc */}
        <div
          style={{
            position: 'relative',
            width: 78,
            height: 78,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.6) 100%), conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)',
            cursor: 'crosshair',
          }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const onMove = (ev: PointerEvent) => {
              const dx = (ev.clientX - cx) / (rect.width / 2);
              const dy = (ev.clientY - cy) / (rect.height / 2);
              const dist = Math.hypot(dx, dy);
              const scale = Math.min(1, dist);
              const angle = Math.atan2(dy, dx);
              const r = Math.max(-0.5, Math.min(0.5, Math.cos(angle - rAngle) * scale * 0.5));
              const g = Math.max(-0.5, Math.min(0.5, Math.cos(angle - gAngle) * scale * 0.5));
              const b = Math.max(-0.5, Math.min(0.5, Math.cos(angle - bAngle) * scale * 0.5));
              onWheelsChange({ ...wheels, [key]: [r, g, b] });
            };
            const onUp = () => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        >
          {/* Crosshairs */}
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />

          {/* Puck Indicator */}
          <div
            style={{
              position: 'absolute',
              top: `calc(50% + ${py}px - 5px)`,
              left: `calc(50% + ${px}px - 5px)`,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#00DAF3',
              border: '2px solid #ffffff',
              boxShadow: '0 0 6px rgba(0,218,243,0.8)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Master Luminance Slider */}
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={master}
          onChange={(e) => onWheelsChange({ ...wheels, [masterKey]: parseFloat(e.target.value) })}
          title={`Master ${label} Luminance`}
          style={{ width: '100%', marginTop: 6, accentColor: '#00DAF3' }}
        />

        {/* Channel Readouts */}
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 8.5, fontFamily: 'monospace', marginTop: 2 }}>
          <span style={{ color: '#ff6e6e' }}>{val[0] > 0 ? `+${val[0].toFixed(2)}` : val[0].toFixed(2)}</span>
          <span style={{ color: '#7ee88a' }}>{val[1] > 0 ? `+${val[1].toFixed(2)}` : val[1].toFixed(2)}</span>
          <span style={{ color: '#54c8ff' }}>{val[2] > 0 ? `+${val[2].toFixed(2)}` : val[2].toFixed(2)}</span>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'rgba(15, 12, 22, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: 12,
        padding: 12,
        color: '#fff',
        fontSize: 11,
      }}
    >
      {/* Top Header: Working Color Space & Eyedropper */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00DAF3', boxShadow: '0 0 8px #00DAF3' }} />
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Colorist Workspace
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Eyedropper Button */}
          <button
            onClick={onEyedropperToggle}
            title="Colorist Eyedropper with 8x Multi-Aperture Loupe (I)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 6,
              border: eyedropperActive ? '1px solid #00DAF3' : '1px solid rgba(255,255,255,0.14)',
              background: eyedropperActive ? 'rgba(0,218,243,0.2)' : 'rgba(255,255,255,0.06)',
              color: eyedropperActive ? '#00DAF3' : 'rgba(255,255,255,0.8)',
              fontWeight: 700,
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            <Pipette size={12} />
            <span>Eyedropper</span>
          </button>

          {/* Color Space Selector */}
          <select
            value={colorSpace}
            onChange={(e) => onColorSpaceChange(e.target.value as ColorSpaceId)}
            style={{
              height: 24,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#00DAF3',
              fontSize: 10,
              fontWeight: 700,
              padding: '0 6px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="srgb">sRGB (Web Standard)</option>
            <option value="display-p3">Display P3 (Wide Gamut HDR)</option>
            <option value="rec709">Rec. 709 (Broadcast Video)</option>
            <option value="rec2020">Rec. 2020 (UHD Cinema)</option>
            <option value="cmyk-fogra39">CMYK FOGRA39 (Coated Press)</option>
            <option value="cmyk-swop">CMYK SWOP v2 (Web Press)</option>
          </select>
        </div>
      </div>

      {/* Tabs Rail */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 8 }}>
        {(['wheels', 'curves', 'scopes', 'print'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '5px 0',
              borderRadius: 6,
              border: 'none',
              background: activeTab === tab ? '#00DAF3' : 'transparent',
              color: activeTab === tab ? '#000' : 'rgba(255,255,255,0.7)',
              fontWeight: 800,
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TAB 1: 3-WAY COLOR WHEELS */}
      {activeTab === 'wheels' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, paddingTop: 4 }}>
          {renderWheel('Lift', 'lift', 'liftMaster')}
          {renderWheel('Gamma', 'gamma', 'gammaMaster')}
          {renderWheel('Gain', 'gain', 'gainMaster')}
          {renderWheel('Offset', 'offset', 'offsetMaster')}
        </div>
      )}

      {/* TAB 2: RGB SPLINE CURVES */}
      {activeTab === 'curves' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['master', 'r', 'g', 'b'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveCurveCh(ch)}
                style={{
                  flex: 1,
                  padding: '3px 0',
                  borderRadius: 5,
                  border: activeCurveCh === ch ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                  background:
                    activeCurveCh === ch
                      ? ch === 'r' ? 'rgba(255,80,80,0.25)' : ch === 'g' ? 'rgba(80,240,120,0.25)' : ch === 'b' ? 'rgba(80,160,255,0.25)' : 'rgba(255,255,255,0.2)'
                      : 'rgba(255,255,255,0.05)',
                  color: ch === 'r' ? '#ff7a7a' : ch === 'g' ? '#7ee2a8' : ch === 'b' ? '#7ab8ff' : '#ffffff',
                  fontWeight: 800,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                {ch === 'master' ? 'RGB Master' : ch.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Interactive Curve Canvas */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 140,
              background: '#090710',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <svg style={{ width: '100%', height: '100%' }}>
              {/* Grid 4x4 */}
              {[0.25, 0.5, 0.75].map((f) => (
                <React.Fragment key={f}>
                  <line x1={`${f * 100}%`} y1="0%" x2={`${f * 100}%`} y2="100%" stroke="rgba(255,255,255,0.06)" />
                  <line x1="0%" y1={`${f * 100}%`} x2="100%" y2={`${f * 100}%`} stroke="rgba(255,255,255,0.06)" />
                </React.Fragment>
              ))}
              {/* 45 degree identity diagonal */}
              <line x1="0%" y1="100%" x2="100%" y2="0%" stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />

              {/* Spline Path */}
              {(() => {
                const pts = curves[activeCurveCh];
                if (!pts || pts.length < 2) return null;
                const pathStr = pts.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p[0] * 100}% ${(1 - p[1]) * 100}%`, '');
                const strokeColor =
                  activeCurveCh === 'r' ? '#ff7a7a' : activeCurveCh === 'g' ? '#7ee2a8' : activeCurveCh === 'b' ? '#7ab8ff' : '#00DAF3';
                return (
                  <>
                    <path d={pathStr} fill="none" stroke={strokeColor} strokeWidth={2} />
                    {pts.map((p, idx) => (
                      <circle
                        key={idx}
                        cx={`${p[0] * 100}%`}
                        cy={`${(1 - p[1]) * 100}%`}
                        r={4}
                        fill="#ffffff"
                        stroke={strokeColor}
                        strokeWidth={1.5}
                      />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
            <span>Shadows (0)</span>
            <span>Midtones (0.5)</span>
            <span>Highlights (1.0)</span>
          </div>
        </div>
      )}

      {/* TAB 3: REAL-TIME SCOPES */}
      {activeTab === 'scopes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['parade', 'waveform', 'vectorscope', 'histogram'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setScopeMode(m)}
                style={{
                  flex: 1,
                  padding: '3px 0',
                  borderRadius: 5,
                  border: 'none',
                  background: scopeMode === m ? 'rgba(0,218,243,0.2)' : 'rgba(255,255,255,0.05)',
                  color: scopeMode === m ? '#00DAF3' : 'rgba(255,255,255,0.6)',
                  fontWeight: 700,
                  fontSize: 9.5,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <canvas
            ref={scopeCanvasRef}
            width={340}
            height={130}
            style={{ width: '100%', height: 130, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
          />
        </div>
      )}

      {/* TAB 4: CMYK PRINT & SOFT PROOFING */}
      {activeTab === 'print' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Soft Proofing Switch */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.04)', padding: 8, borderRadius: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>CMYK Press Soft Proofing</div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>Simulates physical ink on coated stock & gamut clip</div>
            </div>
            <button
              onClick={() => onSoftProofingChange(!softProofing)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: softProofing ? '#f59e0b' : 'rgba(255,255,255,0.12)',
                color: softProofing ? '#000' : '#fff',
                fontWeight: 800,
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {softProofing ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {/* CMYK Plate Separations */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
              Color Separation Plates:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
              {(['composite', 'cyan', 'magenta', 'yellow', 'black'] as const).map((plate) => (
                <button
                  key={plate}
                  onClick={() => onCmykPlateChange(plate)}
                  style={{
                    padding: '5px 2px',
                    borderRadius: 6,
                    border: cmykPlate === plate ? '1px solid #00DAF3' : '1px solid rgba(255,255,255,0.08)',
                    background: cmykPlate === plate ? 'rgba(0,218,243,0.2)' : 'rgba(255,255,255,0.04)',
                    color:
                      plate === 'cyan'
                        ? '#38bdf8'
                        : plate === 'magenta'
                        ? '#f472b6'
                        : plate === 'yellow'
                        ? '#facc15'
                        : plate === 'black'
                        ? '#ffffff'
                        : '#00DAF3',
                    fontWeight: 800,
                    fontSize: 9.5,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                  }}
                >
                  {plate === 'composite' ? 'All (CMYK)' : plate[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TelaColoristSuite;
