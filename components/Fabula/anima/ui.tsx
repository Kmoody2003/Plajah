// components/Fabula/anima/ui.tsx — small shared controls for Anima's panels (Tela design language).

import React, { useEffect, useRef } from 'react';

export const lbl = 'text-[10px] font-extrabold uppercase tracking-[.14em] text-white/40';
export const panelBg = '#0e0d14';
export const border = 'rgba(255,255,255,0.08)';
export const btn =
  'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12px] font-semibold text-white/80 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 disabled:opacity-35 disabled:pointer-events-none transition-colors';
export const iconBtn =
  'grid place-items-center w-8 h-8 rounded-[9px] text-white/70 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors';
export const field = 'h-8 px-2 rounded-[8px] text-[12px] text-white/90 outline-none bg-white/[0.05] border border-white/[0.12] focus:border-[#00DAF3]/60';
export const brandGrad = 'linear-gradient(135deg,#6B0099,#D40055)';

/**
 * A number you can type into or drag horizontally to scrub (Shift = ×10, Alt = ×0.1).
 * `onDrag` receives values while dragging so callers can coalesce them into one undo step.
 */
export const ScrubNumber: React.FC<{
  value: number;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (v: number, phase: 'drag' | 'commit') => void;
  className?: string;
  ariaLabel?: string;
}> = ({ value, step, min, max, unit, onChange, className, ariaLabel }) => {
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const shown = Number.isFinite(value) ? value.toFixed(decimals) : '0';
  // Uncontrolled input (so a drag keeps its pointer capture); mirror the value when not typing.
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement !== el) el.value = shown;
  }, [shown]);
  return (
    <div className={`relative flex items-center ${className ?? ''}`}>
      <input
        ref={inputRef}
        defaultValue={shown}
        aria-label={ariaLabel}
        inputMode="decimal"
        className={`${field} w-full pr-6 cursor-ew-resize focus:cursor-text tabular-nums`}
        onPointerDown={(e) => {
          if (document.activeElement === e.currentTarget) return;
          drag.current = { x: e.clientX, v: value, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) < 3) return;
          d.moved = true;
          const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          onChange(clamp(d.v + Math.round(dx / 2) * step * mult), 'drag');
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            e.currentTarget.focus();
            e.currentTarget.select();
          } else if (d) onChange(clamp(d.v + Math.round((e.clientX - d.x) / 2) * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1)), 'commit');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            e.currentTarget.value = shown;
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          const v = parseFloat(e.currentTarget.value);
          if (Number.isFinite(v) && v.toFixed(decimals) !== shown) onChange(clamp(v), 'commit');
        }}
      />
      {unit && <span className="absolute right-2 text-[10px] text-white/35 pointer-events-none">{unit}</span>}
    </div>
  );
};

/** Keyframe diamond: filled when a key sits on this frame, outlined when animated elsewhere. */
export const KeyDiamond: React.FC<{ state: 'on' | 'animated' | 'none'; onClick: () => void; title: string }> = ({ state, onClick, title }) => (
  <button onClick={onClick} title={title} aria-label={title} className="grid place-items-center w-6 h-6 rounded-md hover:bg-white/[0.08] shrink-0">
    <span
      className="block w-[9px] h-[9px] rotate-45"
      style={{
        background: state === 'on' ? '#00DAF3' : 'transparent',
        border: `1.5px solid ${state === 'none' ? 'rgba(255,255,255,0.3)' : '#00DAF3'}`,
      }}
    />
  </button>
);
