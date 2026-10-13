// components/tela/color/TelaColorLoupe.tsx
// High-precision colorist eyedropper loupe with pixel-grid zoom, multi-aperture averaging,
// and simultaneous multi-color-space readout (sRGB, Display P3, OKLCH, CMYK FOGRA39, Rec.709).

import React from 'react';
import type { SamplerResult, SampleAperture } from '../../services/tela/raster/colorSampler';
import { AlertTriangle, Check } from 'lucide-react';

interface TelaColorLoupeProps {
  cursorX: number;
  cursorY: number;
  canvasWidth: number;
  canvasHeight: number;
  sample: SamplerResult | null;
  aperture: SampleAperture;
  onApertureChange?: (aperture: SampleAperture) => void;
  onPickColor?: (measurement: SamplerResult['measurement']) => void;
}

export const TelaColorLoupe: React.FC<TelaColorLoupeProps> = ({
  cursorX,
  cursorY,
  canvasWidth,
  canvasHeight,
  sample,
  aperture,
  onApertureChange,
}) => {
  if (!sample) return null;

  const { measurement } = sample;
  // Position loupe offset to never be occluded by the pointer or screen edge
  const offsetX = cursorX + 28 > canvasWidth - 240 ? cursorX - 250 : cursorX + 28;
  const offsetY = cursorY + 28 > canvasHeight - 280 ? cursorY - 260 : cursorY + 28;

  return (
    <div
      style={{
        position: 'absolute',
        left: offsetX,
        top: offsetY,
        width: 230,
        background: 'rgba(12, 10, 18, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 14,
        boxShadow: '0 18px 45px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,218,243,0.3)',
        backdropFilter: 'blur(16px)',
        color: '#fff',
        padding: 10,
        zIndex: 90,
        pointerEvents: 'none',
        fontSize: 10.5,
        userSelect: 'none',
      }}
    >
      {/* Top Header: Swatch + Hex + Coordinates */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: measurement.hex,
            border: '2px solid rgba(255,255,255,0.4)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.04em', fontFamily: 'monospace' }}>
            {measurement.hex.toUpperCase()}
          </div>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)', display: 'flex', gap: 8 }}>
            <span>X: {sample.x}</span>
            <span>Y: {sample.y}</span>
            <span style={{ color: '#00DAF3', fontWeight: 700 }}>{aperture}×{aperture} avg</span>
          </div>
        </div>
      </div>

      {/* Colorist Readout Matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, background: 'rgba(255,255,255,0.04)', padding: 7, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* sRGB (0..255) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>sRGB (8-bit)</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f8fafc' }}>
            R:{measurement.srgb[0]} G:{measurement.srgb[1]} B:{measurement.srgb[2]}
          </span>
        </div>

        {/* Display P3 Wide Gamut */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#38bdf8' }}>Display P3</span>
          <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#bae6fd' }}>
            {measurement.displayP3[0].toFixed(3)} {measurement.displayP3[1].toFixed(3)} {measurement.displayP3[2].toFixed(3)}
          </span>
        </div>

        {/* OKLCH (Perceptual Uniform) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a78bfa' }}>OKLCH (Uniform)</span>
          <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#ddd6fe' }}>
            L:{measurement.oklch.l}% C:{measurement.oklch.c} H:{measurement.oklch.h}°
          </span>
        </div>

        {/* Rec. 709 / Luma */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#4ade80' }}>Rec.709 Luma</span>
          <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#bbf7d0' }}>
            Y: {(measurement.luma * 100).toFixed(1)}%
          </span>
        </div>

        {/* CMYK FOGRA39 Commercial Print */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#f59e0b' }}>CMYK (FOGRA39)</span>
          <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#fde68a' }}>
            C:{measurement.cmyk.c}% M:{measurement.cmyk.m}% Y:{measurement.cmyk.y}% K:{measurement.cmyk.k}%
          </span>
        </div>

        {/* Total Area Coverage (TAC) & Gamut Check */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>Ink Limit (TAC):</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 9.5,
                fontWeight: 700,
                color: measurement.cmyk.tac > 300 ? '#ef4444' : '#10b981',
              }}
            >
              {measurement.cmyk.tac}% / 300%
            </span>
            {measurement.cmyk.tac > 300 && (
              <span title="Out of printable gamut (ink saturation exceeds 300%)" style={{ color: '#ef4444', display: 'flex' }}>
                <AlertTriangle size={11} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Hint */}
      <div style={{ marginTop: 6, fontSize: 8.5, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
        Press <strong style={{ color: '#00DAF3' }}>1, 3, 5, or 9</strong> to change aperture
      </div>
    </div>
  );
};

export default TelaColorLoupe;
