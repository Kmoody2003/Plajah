// components/shared/color/PlajahColoristSuite.tsx
// ═══════════════════════════════════════════════════════════════════════════
// PlajahColoristSuite — Master Colorist Grading Suite for Tela & Fabula.
// Provides:
//   1. 4-Way Resolve Trackballs (Lift, Gamma, Gain, Offset) + Master Rings + Temp/Tint
//   2. Interactive Catmull-Rom Spline Curve Editor (Master Y, R, G, B) + 256-LUT
//   3. Live Dynamic Scopes (Waveform, RGB Parade, Vectorscope with Skin Line, Histogram)
//   4. Multi-Gamut Workspace (sRGB, Display P3, Rec. 709, Rec. 2020, CMYK Press FOGRA39/SWOP)
//   5. Print Soft-Proofing, Total Area Coverage (TAC) alerts, and CMYK Plate Separations
//   6. 24+ Curated Cinematic Film & Camera LUTs with .cube 3D LUT Export
//   7. High-Precision Multi-Aperture Eyedropper Loupe
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  SlidersHorizontal,
  CircleDot,
  TrendingUp,
  Activity,
  Layers,
  Pipette,
  Printer,
  Sparkles,
  Download,
  AlertTriangle,
  RotateCcw,
  Check,
  Film,
} from 'lucide-react';
import {
  ColorSpaceId,
  Curves,
  CurvePoint,
} from '../../../services/color/colorWorkspace';
import {
  ColorWheelsTrackballs,
  type ColorWheelData,
  DEFAULT_WHEEL_DATA,
} from './ColorWheelsTrackballs';
import { CurveEditorSplines } from './CurveEditorSplines';
import { LiveScopesEngine, type ScopeType } from './LiveScopesEngine';
import {
  CINEMATIC_LUTS,
  type CinematicLut,
  generate3dCubeText,
} from '../../../services/color/cinematicLutLibrary';

export type CmykPlateType = 'composite' | 'cyan' | 'magenta' | 'yellow' | 'black';

export interface PlajahColoristSuiteProps {
  sourceRef?: React.RefObject<HTMLVideoElement | HTMLCanvasElement | null>;
  sourceImageUrl?: string;
  canvasWidth?: number;
  canvasHeight?: number;

  colorSpace: ColorSpaceId;
  onColorSpaceChange: (cs: ColorSpaceId) => void;

  softProofing?: boolean;
  onSoftProofingChange?: (enabled: boolean) => void;

  cmykPlate?: CmykPlateType;
  onCmykPlateChange?: (plate: CmykPlateType) => void;

  wheels: ColorWheelData;
  onWheelsChange: (wheels: ColorWheelData) => void;

  curves?: Curves | null;
  onCurvesChange: (curves: Curves | undefined) => void;

  eyedropperActive?: boolean;
  onEyedropperToggle?: () => void;

  activeLutId?: string | null;
  onApplyLut?: (lut: CinematicLut, strength: number) => void;
  onClearLut?: () => void;

  scopeMode?: 'grid' | 'tabbed';
  compact?: boolean;
}

export const PlajahColoristSuite: React.FC<PlajahColoristSuiteProps> = ({
  sourceRef,
  sourceImageUrl,
  canvasWidth,
  canvasHeight,
  colorSpace,
  onColorSpaceChange,
  softProofing = false,
  onSoftProofingChange,
  cmykPlate = 'composite',
  onCmykPlateChange,
  wheels,
  onWheelsChange,
  curves,
  onCurvesChange,
  eyedropperActive = false,
  onEyedropperToggle,
  activeLutId,
  onApplyLut,
  onClearLut,
  scopeMode = 'tabbed',
  compact = false,
}) => {
  const [activeTab, setActiveTab] = useState<'wheels' | 'curves' | 'scopes' | 'looks' | 'print'>('wheels');
  const [downloadedCube, setDownloadedCube] = useState<string | null>(null);

  const handleDownloadCube = (e: React.MouseEvent, lut: CinematicLut) => {
    e.stopPropagation();
    const cubeText = generate3dCubeText(lut, 17);
    const blob = new Blob([cubeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lut.id}_3d_lut.cube`;
    link.click();
    URL.revokeObjectURL(url);

    setDownloadedCube(lut.id);
    setTimeout(() => setDownloadedCube(null), 2000);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'rgba(13, 11, 19, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: 12,
        padding: compact ? 8 : 12,
        color: '#fff',
        fontSize: 11,
      }}
    >
      {/* ── Top Header: Working Color Space & Eyedropper ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: 8,
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00DAF3', boxShadow: '0 0 8px #00DAF3' }} />
          <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#f0f0f5' }}>
            Colorist Suite
          </span>
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'rgba(0, 218, 243, 0.15)',
              color: '#00DAF3',
              border: '1px solid rgba(0, 218, 243, 0.3)',
            }}
          >
            TELA &middot; FABULA
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Eyedropper Toggle */}
          {onEyedropperToggle && (
            <button
              type="button"
              onClick={onEyedropperToggle}
              title="Colorist Eyedropper with 8x Multi-Aperture Loupe"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                border: eyedropperActive ? '1px solid #00DAF3' : '1px solid rgba(255, 255, 255, 0.14)',
                background: eyedropperActive ? 'rgba(0, 218, 243, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                color: eyedropperActive ? '#00DAF3' : 'rgba(255, 255, 255, 0.8)',
                fontWeight: 700,
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              <Pipette size={12} />
              <span>Eyedropper</span>
            </button>
          )}

          {/* Working Color Space Selector */}
          <select
            value={colorSpace}
            onChange={(e) => onColorSpaceChange(e.target.value as ColorSpaceId)}
            style={{
              height: 24,
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#00DAF3',
              fontSize: 10,
              fontWeight: 700,
              padding: '0 6px',
              outline: 'none',
              cursor: 'pointer',
            }}
            title="Working Color Space & Output Transform"
          >
            <option value="srgb">sRGB (Web & Standard Monitor)</option>
            <option value="display-p3">Display P3 (Wide Gamut HDR)</option>
            <option value="rec709">Rec. 709 (HD Broadcast Video)</option>
            <option value="rec2020">Rec. 2020 (UHD Cinema & HDR)</option>
            <option value="oklch">OKLCH (Perceptually Uniform)</option>
            <option value="cmyk-fogra39">CMYK FOGRA39 (Coated Commercial Press)</option>
            <option value="cmyk-swop">CMYK SWOP v2 (Web Publication Press)</option>
          </select>
        </div>
      </div>

      {/* ── Navigation Tabs Rail ── */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255, 255, 255, 0.04)', padding: 2, borderRadius: 8 }}>
        {(['wheels', 'curves', 'scopes', 'looks', 'print'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '5px 0',
              borderRadius: 6,
              border: 'none',
              background: activeTab === tab ? '#00DAF3' : 'transparent',
              color: activeTab === tab ? '#090810' : 'rgba(255, 255, 255, 0.7)',
              fontWeight: 800,
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── TAB 1: 4-WAY PRIMARY COLOR WHEELS ── */}
      {activeTab === 'wheels' && (
        <ColorWheelsTrackballs
          wheel={wheels}
          setWheel={(patch) => onWheelsChange({ ...wheels, ...patch })}
          showOffset={true}
          showTempTint={true}
          wheelSize={compact ? 74 : 80}
        />
      )}

      {/* ── TAB 2: CATMULL-ROM SPLINE CURVES ── */}
      {activeTab === 'curves' && (
        <CurveEditorSplines
          curves={curves}
          onChange={onCurvesChange}
          width={compact ? 270 : 340}
          height={compact ? 170 : 190}
        />
      )}

      {/* ── TAB 3: REAL-TIME SCOPES ── */}
      {activeTab === 'scopes' && (
        <LiveScopesEngine
          sourceRef={sourceRef}
          sourceUrl={sourceImageUrl}
          mode={scopeMode}
          height={compact ? 120 : 140}
        />
      )}

      {/* ── TAB 4: CINEMATIC & CAMERA LUTS ── */}
      {activeTab === 'looks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255, 255, 255, 0.5)' }}>
              24+ Camera Profiles &amp; Film Looks
            </span>
            {activeLutId && onClearLut && (
              <button
                type="button"
                onClick={onClearLut}
                style={{ background: 'none', border: 'none', color: '#ff6e6e', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}
              >
                Clear Look
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
            {CINEMATIC_LUTS.map((lut) => {
              const isSelected = activeLutId === lut.id;
              return (
                <div
                  key={lut.id}
                  onClick={() => onApplyLut && onApplyLut(lut, 1.0)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: 8,
                    borderRadius: 8,
                    background: isSelected ? 'rgba(0, 218, 243, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected ? '1px solid #00DAF3' : '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: lut.accentColor }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: isSelected ? '#00DAF3' : '#fff' }}>
                        {lut.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 8.5, color: 'rgba(255, 255, 255, 0.45)', lineHeight: 1.2 }}>
                      {lut.categoryLabel}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={(e) => handleDownloadCube(e, lut)}
                      title="Download .cube 3D LUT file"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        borderRadius: 4,
                        padding: '2px 5px',
                        color: downloadedCube === lut.id ? '#4ade80' : 'rgba(255, 255, 255, 0.6)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 8,
                        fontWeight: 700,
                      }}
                    >
                      {downloadedCube === lut.id ? <Check size={9} /> : <Download size={9} />}
                      <span>.CUBE</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 5: CMYK PRINT & SOFT PROOFING ── */}
      {activeTab === 'print' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Soft Proofing Switch */}
          {onSoftProofingChange && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: 8,
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>CMYK Press Soft Proofing</div>
                <div style={{ fontSize: 9.5, color: 'rgba(255, 255, 255, 0.45)' }}>
                  Simulates physical ink on coated stock &amp; gamut clipping
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSoftProofingChange(!softProofing)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: softProofing ? '#f59e0b' : 'rgba(255, 255, 255, 0.12)',
                  color: softProofing ? '#000' : '#fff',
                  fontWeight: 800,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                {softProofing ? 'ACTIVE' : 'OFF'}
              </button>
            </div>
          )}

          {/* CMYK Plate Separations */}
          {onCmykPlateChange && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4 }}>
                Color Separation Plates:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {(['composite', 'cyan', 'magenta', 'yellow', 'black'] as const).map((plate) => (
                  <button
                    key={plate}
                    type="button"
                    onClick={() => onCmykPlateChange(plate)}
                    style={{
                      padding: '5px 2px',
                      borderRadius: 6,
                      border: cmykPlate === plate ? '1px solid #00DAF3' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: cmykPlate === plate ? 'rgba(0, 218, 243, 0.2)' : 'rgba(255, 255, 255, 0.04)',
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
          )}

          {/* Press Standard & TAC Information */}
          <div
            style={{
              padding: 8,
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5 }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Standard:</span>
              <span style={{ fontWeight: 700, color: '#f0f0f5' }}>
                {colorSpace.startsWith('cmyk-swop') ? 'US Web Coated (SWOP) v2' : 'ISO Coated v2 (FOGRA39)'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5 }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Max TAC Ink Limit:</span>
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                {colorSpace.startsWith('cmyk-swop') ? '300% TAC' : '330% TAC'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5 }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Broadcast Safe Legal Range:</span>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>16-235 (IRE 0-100%)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlajahColoristSuite;
