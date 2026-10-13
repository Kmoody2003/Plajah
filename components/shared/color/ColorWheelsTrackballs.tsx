// components/shared/color/ColorWheelsTrackballs.tsx
// ═══════════════════════════════════════════════════════════════════════════
// Primary 4-Way Color Wheels Trackballs (Resolve Style)
// Shared across Tela and Fabula.
// Provides Lift, Gamma, Gain, and Offset wheels with master luminance rings,
// 3-phasor puck projection math, Kelvin temperature, and green-magenta tint.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useRef, memo } from 'react';
import { RotateCcw } from 'lucide-react';
import { rgbToPuck, puckToRgb } from '../../../services/color/colorWorkspace';

export interface ColorWheelData {
  lift: [number, number, number];    // -0.5..0.5, def 0
  liftMaster?: number;               // -0.5..0.5, def 0
  gamma: [number, number, number];   // 0.3..2.5, def 1
  gammaMaster?: number;              // 0.3..2.5, def 1
  gain: [number, number, number];    // 0..2.5, def 1
  gainMaster?: number;               // 0..2.5, def 1
  offset: [number, number, number];  // -0.5..0.5, def 0
  offsetMaster?: number;             // -0.5..0.5, def 0
  temp: number;                      // -0.3..0.3, def 0
  tint: number;                      // -0.3..0.3, def 0
}

export const DEFAULT_WHEEL_DATA: ColorWheelData = {
  lift: [0, 0, 0],
  liftMaster: 0,
  gamma: [1, 1, 1],
  gammaMaster: 1,
  gain: [1, 1, 1],
  gainMaster: 1,
  offset: [0, 0, 0],
  offsetMaster: 0,
  temp: 0,
  tint: 0,
};

interface TrackballProps {
  label: string;
  rgb: [number, number, number];
  defVal: number;
  minVal: number;
  maxVal: number;
  masterVal?: number;
  onChange: (next: [number, number, number]) => void;
  onMasterChange: (master: number) => void;
  wheelSize?: number;
}

const Trackball: React.FC<TrackballProps> = ({
  label,
  rgb,
  defVal,
  minVal,
  maxVal,
  masterVal,
  onChange,
  onMasterChange,
  wheelSize = 84,
}) => {
  const discRef = useRef<HTMLDivElement>(null);
  const scale = (maxVal - minVal) * 0.5;
  const { px, py } = rgbToPuck(rgb, defVal, scale);

  const updateFromPointer = (cx: number, cy: number) => {
    if (!discRef.current) return;
    const r = discRef.current.getBoundingClientRect();
    const nx = (cx - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (cy - (r.top + r.height / 2)) / (r.height / 2);
    const nextRgb = puckToRgb(nx, ny, defVal, scale, minVal, maxVal);
    onChange(nextRgb);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    updateFromPointer(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => updateFromPointer(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  };

  const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
  const currentMaster = masterVal !== undefined ? masterVal : avg;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: wheelSize + 12, minWidth: 0, gap: 4 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 2px' }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.14em', color: '#a8a8b8', textTransform: 'uppercase' }}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange([defVal, defVal, defVal]);
            onMasterChange(defVal);
          }}
          title="Reset wheel (Double-click disc)"
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: 0 }}
        >
          <RotateCcw size={10} />
        </button>
      </div>

      {/* 3-Phasor Disc */}
      <div
        ref={discRef}
        onPointerDown={onPointerDown}
        onDoubleClick={() => {
          onChange([defVal, defVal, defVal]);
          onMasterChange(defVal);
        }}
        title="Drag puck to grade color balance · Double click resets"
        style={{
          position: 'relative',
          width: wheelSize,
          height: wheelSize,
          borderRadius: '50%',
          cursor: 'crosshair',
          touchAction: 'none',
          background: `
            radial-gradient(circle at 50% 50%, #201e28 0%, #201e28 30%, transparent 62%),
            conic-gradient(from 90deg, #ff5a5a, #ffd84d, #7ee88a, #4dd6ff, #7c6bff, #e04ea0, #ff5a5a)
          `,
          border: '2px solid #0a0a0f',
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        {/* Disc Shade Center */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 50%, rgba(22,20,30,0.92) 0%, rgba(22,20,30,0.55) 28%, transparent 58%)',
            pointerEvents: 'none',
          }}
        />

        {/* Crosshairs */}
        <div style={{ position: 'absolute', left: '10%', right: '10%', top: '50%', height: 1, background: 'rgba(255,255,255,0.14)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: 1, background: 'rgba(255,255,255,0.14)', pointerEvents: 'none' }} />

        {/* Puck */}
        <div
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            left: `calc(50% + ${px * 50}%)`,
            top: `calc(50% + ${py * 50}%)`,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #ffffff, #00daf3 60%, #008ba3)',
            border: '1.5px solid rgba(0,0,0,0.85)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,218,243,0.5)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      </div>

      {/* Master Luminance Slider */}
      <input
        type="range"
        min={minVal}
        max={maxVal}
        step={0.005}
        value={currentMaster}
        onChange={(e) => onMasterChange(parseFloat(e.target.value))}
        onDoubleClick={() => onMasterChange(defVal)}
        title={`Master ${label} Luminance`}
        style={{ width: '100%', maxWidth: wheelSize + 6, height: 14, accentColor: '#00DAF3', cursor: 'ew-resize' }}
      />

      {/* Numeric Channel Readout */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: wheelSize + 6,
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 3,
          padding: '1px 3px',
          fontSize: 8,
          fontFamily: 'monospace',
          fontWeight: 700,
        }}
      >
        <span style={{ color: '#ff6e6e' }}>{rgb[0].toFixed(2)}</span>
        <span style={{ color: '#7ee88a' }}>{rgb[1].toFixed(2)}</span>
        <span style={{ color: '#54c8ff' }}>{rgb[2].toFixed(2)}</span>
      </div>
    </div>
  );
};

export interface ColorWheelsTrackballsProps {
  wheel: ColorWheelData;
  setWheel: (patch: Partial<ColorWheelData>) => void;
  showOffset?: boolean;
  showTempTint?: boolean;
  wheelSize?: number;
}

export const ColorWheelsTrackballs: React.FC<ColorWheelsTrackballsProps> = ({
  wheel,
  setWheel,
  showOffset = true,
  showTempTint = true,
  wheelSize = 82,
}) => {
  const shiftMaster = (key: 'lift' | 'gamma' | 'gain' | 'offset', newMaster: number) => {
    const arr = wheel[key];
    const currentAvg = (arr[0] + arr[1] + arr[2]) / 3;
    const delta = newMaster - currentAvg;
    const nextArr = arr.map((v) => v + delta) as [number, number, number];
    const masterKey = `${key}Master` as keyof ColorWheelData;
    setWheel({ [key]: nextArr, [masterKey]: newMaster });
  };

  const applyPreset = (presetName: string) => {
    if (presetName === 'neutral') {
      setWheel({
        lift: [0, 0, 0],
        liftMaster: 0,
        gamma: [1, 1, 1],
        gammaMaster: 1,
        gain: [1, 1, 1],
        gainMaster: 1,
        offset: [0, 0, 0],
        offsetMaster: 0,
        temp: 0,
        tint: 0,
      });
    } else if (presetName === 'teal_orange') {
      setWheel({
        lift: [-0.05, 0.01, 0.07],
        gamma: [1.02, 0.98, 0.93],
        gain: [1.14, 1.02, 0.88],
        temp: 0.04,
        tint: -0.02,
      });
    } else if (presetName === 'warm_golden') {
      setWheel({
        lift: [0.03, 0.01, -0.03],
        gamma: [1.06, 1.02, 0.94],
        gain: [1.16, 1.08, 0.90],
        temp: 0.08,
        tint: 0.01,
      });
    } else if (presetName === 'punchy_contrast') {
      setWheel({
        lift: [-0.08, -0.08, -0.08],
        gamma: [1.05, 1.05, 1.05],
        gain: [1.20, 1.20, 1.20],
      });
    } else if (presetName === 'bleach_bypass') {
      setWheel({
        lift: [-0.04, -0.04, -0.04],
        gamma: [0.90, 0.90, 0.90],
        gain: [1.32, 1.32, 1.32],
        temp: -0.04,
      });
    } else if (presetName === 'sci_fi_neon') {
      setWheel({
        lift: [-0.06, 0.02, 0.10],
        gamma: [0.96, 1.04, 1.08],
        gain: [0.90, 1.15, 1.25],
        temp: -0.09,
        tint: 0.05,
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {/* 1-Click Film Grading Presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => applyPreset('neutral')}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => applyPreset('teal_orange')}
          style={{ background: 'rgba(0,218,243,0.1)', border: '1px solid rgba(0,218,243,0.3)', borderRadius: 4, color: '#00DAF3', fontSize: 9, fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}
        >
          Teal / Orange
        </button>
        <button
          type="button"
          onClick={() => applyPreset('warm_golden')}
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, color: '#fbbf24', fontSize: 9, fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}
        >
          Warm Film
        </button>
        <button
          type="button"
          onClick={() => applyPreset('punchy_contrast')}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}
        >
          Punch
        </button>
        <button
          type="button"
          onClick={() => applyPreset('bleach_bypass')}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}
        >
          Bleach
        </button>
        <button
          type="button"
          onClick={() => applyPreset('sci_fi_neon')}
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 4, color: '#c084fc', fontSize: 9, fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}
        >
          Sci-Fi
        </button>
      </div>

      {/* The 4 Resolve Trackballs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, width: '100%', overflowX: 'auto', paddingBottom: 2 }}>
        <Trackball
          label="LIFT"
          rgb={wheel.lift}
          defVal={0}
          minVal={-0.5}
          maxVal={0.5}
          masterVal={wheel.liftMaster}
          onChange={(v) => setWheel({ lift: v })}
          onMasterChange={(m) => shiftMaster('lift', m)}
          wheelSize={wheelSize}
        />
        <Trackball
          label="GAMMA"
          rgb={wheel.gamma}
          defVal={1}
          minVal={0.3}
          maxVal={2.5}
          masterVal={wheel.gammaMaster}
          onChange={(v) => setWheel({ gamma: v })}
          onMasterChange={(m) => shiftMaster('gamma', m)}
          wheelSize={wheelSize}
        />
        <Trackball
          label="GAIN"
          rgb={wheel.gain}
          defVal={1}
          minVal={0}
          maxVal={2.5}
          masterVal={wheel.gainMaster}
          onChange={(v) => setWheel({ gain: v })}
          onMasterChange={(m) => shiftMaster('gain', m)}
          wheelSize={wheelSize}
        />
        {showOffset && (
          <Trackball
            label="OFFSET"
            rgb={wheel.offset || [0, 0, 0]}
            defVal={0}
            minVal={-0.5}
            maxVal={0.5}
            masterVal={wheel.offsetMaster}
            onChange={(v) => setWheel({ offset: v })}
            onMasterChange={(m) => shiftMaster('offset', m)}
            wheelSize={wheelSize}
          />
        )}
      </div>

      {/* Temperature & Tint Sliders */}
      {showTempTint && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
              <span style={{ color: wheel.temp > 0 ? '#fbbf24' : wheel.temp < 0 ? '#38bdf8' : 'rgba(255,255,255,0.6)' }}>
                TEMP {wheel.temp > 0 ? `+${wheel.temp.toFixed(2)}` : wheel.temp.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => setWheel({ temp: 0 })}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0 }}
              >
                ↺
              </button>
            </div>
            <input
              type="range"
              min={-0.3}
              max={0.3}
              step={0.005}
              value={wheel.temp}
              onChange={(e) => setWheel({ temp: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#fbbf24', cursor: 'ew-resize' }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
              <span style={{ color: wheel.tint > 0 ? '#f472b6' : wheel.tint < 0 ? '#4ade80' : 'rgba(255,255,255,0.6)' }}>
                TINT {wheel.tint > 0 ? `+${wheel.tint.toFixed(2)}` : wheel.tint.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => setWheel({ tint: 0 })}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0 }}
              >
                ↺
              </button>
            </div>
            <input
              type="range"
              min={-0.3}
              max={0.3}
              step={0.005}
              value={wheel.tint}
              onChange={(e) => setWheel({ tint: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#f472b6', cursor: 'ew-resize' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ColorWheelsTrackballs);
