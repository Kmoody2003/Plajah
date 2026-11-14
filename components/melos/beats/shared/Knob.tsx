// Rotary control for the instrument tier. Drag vertical (shift = fine ×0.1), wheel nudges,
// double-click resets. Rendered as a conic-gradient ring like the approved mockups.

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { knobBridge } from '../../../../services/melos/beats/modulators';
import {
  getFocusedParamSnapshot,
  registerFocusedParam,
  setHoveredParam,
  setSelectedParam,
  subscribeFocusedParam,
  updateFocusedParam,
} from '../../../../services/melos/beats/focusedParamStore';

/** One Motion reaching this knob — drawn as a coloured arc from the current value. */
export interface ModArc {
  depth: number; // -1..1, as a fraction of the knob's full travel
  color: string;
}

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  color?: string;
  size?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  focusId?: string;
  trackId?: string;
  /** Modulation reaching this parameter. This is the visual signature of the whole system:
   *  you can see what is moving a control without opening anything. */
  mod?: ModArc[];
  /** Set while a Motion handle is being dragged, so valid targets light up. */
  dropActive?: boolean;
  /** Called when a Motion handle is dropped here — creates the route. */
  onModDrop?: () => void;
}

export const Knob: React.FC<KnobProps> = ({
  label, value, min, max, step, defaultValue, color = '#00DAF3', size = 40, format, onChange,
  focusId, trackId, mod, dropActive, onModDrop,
}) => {
  const autoId = useId();
  const resolvedFocusId = focusId ?? `knob:${trackId ?? 'global'}:${label}:${autoId}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef({ label, value, min, max, step, trackId, onChange });
  latestRef.current = { label, value, min, max, step, trackId, onChange };
  const [isK1Target, setIsK1Target] = useState(() => getFocusedParamSnapshot().activeId === resolvedFocusId);

  useEffect(() => {
    const entry = {
      id: resolvedFocusId,
      label,
      value,
      min,
      max,
      step,
      trackId,
      onChange: (v: number) => latestRef.current.onChange(v),
      getRect: () => wrapRef.current?.getBoundingClientRect() ?? null,
      isAlive: () => Boolean(wrapRef.current?.isConnected),
    };
    const unregister = registerFocusedParam(entry);
    const unsub = subscribeFocusedParam(() => {
      setIsK1Target(getFocusedParamSnapshot().activeId === resolvedFocusId);
    });
    return () => {
      unsub();
      unregister();
    };
  }, [resolvedFocusId]);

  useEffect(() => {
    updateFocusedParam({
      id: resolvedFocusId,
      label,
      value,
      min,
      max,
      step,
      trackId,
      onChange: (v: number) => latestRef.current.onChange(v),
      getRect: () => wrapRef.current?.getBoundingClientRect() ?? null,
      isAlive: () => Boolean(wrapRef.current?.isConnected),
    });
  }, [resolvedFocusId, label, value, min, max, step, trackId]);
  const drag = useRef<{ startY: number; startV: number } | null>(null);
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));

  // Modulation arcs sit just outside the value ring, one stroke per Motion, drawn from the
  // current value toward where that Motion would push it.
  const R = size / 2;
  const arcR = R - 1.5;
  const arcs = (mod || []).filter((m) => Math.abs(m.depth) > 0.002).slice(0, 4);
  const polar = (t: number) => {
    // The ring runs from 7 o'clock clockwise to 5 o'clock — 270° of travel, like hardware.
    const a = (-225 + t * 270) * (Math.PI / 180);
    return [R + arcR * Math.cos(a), R + arcR * Math.sin(a)];
  };
  const arcPath = (from: number, to: number) => {
    const [x0, y0] = polar(Math.max(0, Math.min(1, from)));
    const [x1, y1] = polar(Math.max(0, Math.min(1, to)));
    const large = Math.abs(to - from) > 0.5 ? 1 : 0;
    const sweep = to >= from ? 1 : 0;
    return `M ${x0} ${y0} A ${arcR} ${arcR} 0 ${large} ${sweep} ${x1} ${y1}`;
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setSelectedParam(resolvedFocusId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startV: value };
  }, [value, resolvedFocusId]);

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
    <div
      ref={wrapRef}
      data-focus-param-id={resolvedFocusId}
      onPointerEnter={() => setHoveredParam(resolvedFocusId)}
      onPointerLeave={() => setHoveredParam(null)}
      onFocus={() => setSelectedParam(resolvedFocusId)}
      tabIndex={0}
      className="relative flex flex-col items-center gap-1 select-none outline-none"
      title={`${label}: ${format ? format(value) : value.toFixed(1)}${isK1Target ? ' · Knob 1 (active)' : ''}`}
    >
      {isK1Target && (
        <span
          className="absolute -top-1.5 -right-1 z-10 px-1 py-[1px] rounded text-[7.5px] font-bold tracking-[0.06em] uppercase pointer-events-none border shadow-sm"
          style={{
            background: 'rgba(6, 12, 20, 0.92)',
            borderColor: color,
            color,
            boxShadow: `0 0 8px ${color}55`,
          }}
        >
          K1
        </span>
      )}
      <div className="relative" style={{ width: size, height: size }}
        onPointerUp={() => { if (dropActive && onModDrop) onModDrop(); }}
      >
      {/* Modulation arcs ride outside the value ring — see what is moving a control without
          opening anything. Drawn behind the knob so the value ring stays the primary read. */}
      {(arcs.length > 0 || dropActive) && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        >
          {dropActive && (
            <circle cx={R} cy={R} r={arcR} fill="none" stroke="#FF8C00" strokeWidth={1.5}
              strokeDasharray="3 3" opacity={0.8} />
          )}
          {arcs.map((m, i) => (
            <path
              key={i}
              d={arcPath(frac, frac + m.depth)}
              fill="none"
              stroke={m.color}
              strokeWidth={2.2}
              strokeLinecap="round"
              opacity={0.9}
              transform={`translate(0 ${i * 0})`}
            />
          ))}
        </svg>
      )}
      <div
        role="slider"
        aria-label={label}
        onContextMenu={(e) => {
          // Right-click: make this control move by itself (assist/ModulatorHost).
          if (!knobBridge.request) return;
          e.preventDefault();
          knobBridge.request({ label, value, min, max, set: onChange });
        }}
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
        className="absolute inset-0 cursor-ns-resize rounded-full focus:outline-none focus:ring-2 focus:ring-[#FF8C00]/60"
        style={{
          width: size, height: size,
          // Inset so the modulation arcs have room outside the value ring.
          transform: arcs.length || dropActive ? 'scale(0.86)' : 'none',
          background: `conic-gradient(${color} ${Math.round(frac * 100)}%, rgba(255,255,255,0.12) 0)`,
          WebkitMask: `radial-gradient(circle, transparent 0 ${size * 0.3}px, #000 ${size * 0.3 + 0.5}px)`,
          mask: `radial-gradient(circle, transparent 0 ${size * 0.3}px, #000 ${size * 0.3 + 0.5}px)`,
        }}
      />
      </div>
      <span className="text-[9px] uppercase tracking-[0.08em]" style={{ color: isK1Target ? color : 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span className="text-[9px] font-mono text-white/60 -mt-1">{format ? format(value) : value.toFixed(1)}</span>
    </div>
  );
};
