// Rotary control for the instrument tier. Drag vertical (shift = fine ×0.1), wheel nudges,
// double-click resets. Rendered as a conic-gradient ring like the approved mockups.

import React, { useCallback, useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  color?: string;
  size?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

export const Knob: React.FC<KnobProps> = ({ label, value, min, max, defaultValue, color = '#00DAF3', size = 40, format, onChange }) => {
  const drag = useRef<{ startY: number; startV: number } | null>(null);
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startV: value };
  }, [value]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const range = max - min;
    const fine = e.shiftKey ? 0.1 : 1;
    // 150px of drag = full range — matches hardware encoder feel.
    const next = drag.current.startV + (drag.current.startY - e.clientY) * (range / 150) * fine;
    onChange(Math.max(min, Math.min(max, next)));
  }, [max, min, onChange]);

  const onPointerUp = useCallback(() => { drag.current = null; }, []);

  return (
    <div className="flex flex-col items-center gap-1 select-none" title={`${label}: ${format ? format(value) : value.toFixed(1)}`}>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => onChange(defaultValue ?? (min + max) / 2)}
        onWheel={(e) => {
          e.preventDefault();
          const step = (max - min) / (e.shiftKey ? 400 : 60);
          onChange(Math.max(min, Math.min(max, value + (e.deltaY < 0 ? step : -step))));
        }}
        onKeyDown={(e) => {
          const step = (max - min) / (e.shiftKey ? 200 : 40);
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(max, value + step)); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(min, value - step)); }
        }}
        className="cursor-ns-resize rounded-full focus:outline-none focus:ring-2 focus:ring-[#FF8C00]/60"
        style={{
          width: size, height: size,
          background: `conic-gradient(${color} ${Math.round(frac * 100)}%, rgba(255,255,255,0.12) 0)`,
          WebkitMask: `radial-gradient(circle, transparent 0 ${size * 0.3}px, #000 ${size * 0.3 + 0.5}px)`,
          mask: `radial-gradient(circle, transparent 0 ${size * 0.3}px, #000 ${size * 0.3 + 0.5}px)`,
        }}
      />
      <span className="text-[9px] uppercase tracking-[0.08em] text-white/40">{label}</span>
      <span className="text-[9px] font-mono text-white/60 -mt-1">{format ? format(value) : value.toFixed(1)}</span>
    </div>
  );
};
