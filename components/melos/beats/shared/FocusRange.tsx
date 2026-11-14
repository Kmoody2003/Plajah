import React, { useEffect, useId, useRef, useState } from 'react';
import {
  getFocusedParamSnapshot,
  registerFocusedParam,
  setHoveredParam,
  setSelectedParam,
  subscribeFocusedParam,
  updateFocusedParam,
} from '../../../../services/melos/beats/focusedParamStore';

interface FocusRangeProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'min' | 'max' | 'step'> {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  trackId?: string;
  focusId?: string;
  accentColor?: string;
  onValueChange: (value: number) => void;
}

/** Range slider that registers with focusedParamStore so hardware MIDI Knob 1 drives it on hover/proximity/selection. */
export const FocusRange: React.FC<FocusRangeProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  trackId,
  focusId,
  accentColor = '#00DAF3',
  onValueChange,
  className,
  style,
  ...rest
}) => {
  const autoId = useId();
  const id = focusId ?? `range:${trackId ?? 'global'}:${label}:${autoId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const latestRef = useRef({ label, value, min, max, step, trackId, onValueChange });
  latestRef.current = { label, value, min, max, step, trackId, onValueChange };
  const [isK1, setIsK1] = useState(() => getFocusedParamSnapshot().activeId === id);

  useEffect(() => {
    const unregister = registerFocusedParam({
      id,
      label,
      value,
      min,
      max,
      step,
      trackId,
      onChange: (v) => latestRef.current.onValueChange(v),
      getRect: () => inputRef.current?.getBoundingClientRect() ?? null,
      isAlive: () => Boolean(inputRef.current?.isConnected),
    });
    const unsub = subscribeFocusedParam(() => {
      setIsK1(getFocusedParamSnapshot().activeId === id);
    });
    return () => {
      unsub();
      unregister();
    };
  }, [id]);

  useEffect(() => {
    updateFocusedParam({
      id,
      label,
      value,
      min,
      max,
      step,
      trackId,
      onChange: (v) => latestRef.current.onValueChange(v),
      getRect: () => inputRef.current?.getBoundingClientRect() ?? null,
      isAlive: () => Boolean(inputRef.current?.isConnected),
    });
  }, [id, label, value, min, max, step, trackId]);

  return (
    <span className="relative inline-flex items-center w-full">
      <input
        {...rest}
        ref={inputRef}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange(parseFloat(e.target.value))}
        onPointerEnter={(e) => {
          setHoveredParam(id);
          rest.onPointerEnter?.(e);
        }}
        onPointerLeave={(e) => {
          setHoveredParam(null);
          rest.onPointerLeave?.(e);
        }}
        onPointerDown={(e) => {
          setSelectedParam(id);
          rest.onPointerDown?.(e);
        }}
        onFocus={(e) => {
          setSelectedParam(id);
          rest.onFocus?.(e);
        }}
        className={className}
        style={{
          ...style,
          outline: isK1 ? `1px solid ${accentColor}` : style?.outline,
          boxShadow: isK1 ? `0 0 8px ${accentColor}44` : style?.boxShadow,
          borderRadius: isK1 ? 6 : style?.borderRadius,
        }}
      />
      {isK1 && (
        <span
          className="ml-1 shrink-0 px-1 py-[1px] rounded text-[7px] font-bold uppercase tracking-[0.06em] border pointer-events-none"
          style={{ borderColor: accentColor, color: accentColor, background: 'rgba(6,12,20,0.9)' }}
        >
          K1
        </span>
      )}
    </span>
  );
};
