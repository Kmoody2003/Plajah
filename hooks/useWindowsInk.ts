/**
 * useWindowsInk.ts — High-fidelity Stylus, Pen & Windows Ink Hook.
 *
 * Provides:
 *  - 120Hz/240Hz coalesced event sampling via getCoalescedEvents()
 *  - High-precision pressure, tiltX, tiltY, and twist extraction
 *  - Built-in palm rejection (filters touches while pen is active)
 *  - Hardware eraser / barrel button detection
 */

import { useRef, useCallback } from 'react';

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  isEraser: boolean;
  pointerType: 'pen' | 'touch' | 'mouse';
  timestamp: number;
}

export interface UseWindowsInkOptions {
  onStrokeStart?: (point: InkPoint, e: React.PointerEvent) => void;
  onStrokeMove?: (points: InkPoint[], e: React.PointerEvent) => void;
  onStrokeEnd?: (e: React.PointerEvent) => void;
  /** If true, ignores touch events when a pen is detected or in contact */
  enablePalmRejection?: boolean;
  /** Coordinate transformer: e.g. mapping client rect to internal canvas width/height */
  transformPoint?: (clientPos: { x: number; y: number }, e: React.PointerEvent) => { x: number; y: number };
}

export function useWindowsInk(options: UseWindowsInkOptions) {
  const {
    onStrokeStart,
    onStrokeMove,
    onStrokeEnd,
    enablePalmRejection = true,
    transformPoint,
  } = options;

  const isPenActiveRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const extractPoint = useCallback(
    (event: PointerEvent | React.PointerEvent, targetEl?: HTMLElement | null): InkPoint => {
      const el = targetEl || (event.currentTarget as HTMLElement);
      const rect = el?.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 };
      const rawX = event.clientX - rect.left;
      const rawY = event.clientY - rect.top;

      const pos = transformPoint
        ? transformPoint({ x: rawX, y: rawY }, event as any)
        : { x: rawX, y: rawY };

      const type = (event.pointerType as 'pen' | 'touch' | 'mouse') || 'mouse';
      const isPen = type === 'pen';

      // Pressure handling: pens usually report > 0, fallback to 0.5 for non-pressure devices
      let pressure = event.pressure;
      if (pressure === 0 && !isPen) {
        pressure = 0.5;
      } else if (pressure === 0.5 && isPen) {
        // Some pens report default 0.5 when pressure isn't varying
        pressure = 0.5;
      }

      // Hardware eraser detection: barrel button (buttons & 32 or buttons & 2) or eraser tip (button === 5)
      const isEraser =
        (event.buttons & 32) !== 0 ||
        (event as any).button === 5 ||
        (isPen && ((event.buttons & 2) !== 0 || (event as any).pointerProperties?.isEraser));

      return {
        x: pos.x,
        y: pos.y,
        pressure: Math.max(0.01, Math.min(1.0, pressure)),
        tiltX: event.tiltX || 0,
        tiltY: event.tiltY || 0,
        twist: event.twist || 0,
        isEraser,
        pointerType: type,
        timestamp: event.timeStamp || Date.now(),
      };
    },
    [transformPoint]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const type = (e.pointerType as 'pen' | 'touch' | 'mouse') || 'mouse';

      // Palm rejection: if pen is active or touch starts while pen is in proximity, reject touch
      if (enablePalmRejection && type === 'touch' && isPenActiveRef.current) {
        e.preventDefault();
        return;
      }

      if (type === 'pen') {
        isPenActiveRef.current = true;
      }

      activePointerIdRef.current = e.pointerId;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}

      const point = extractPoint(e);
      onStrokeStart?.(point, e);
    },
    [enablePalmRejection, extractPoint, onStrokeStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;

      const type = (e.pointerType as 'pen' | 'touch' | 'mouse') || 'mouse';
      if (enablePalmRejection && type === 'touch' && isPenActiveRef.current) {
        return;
      }

      // Coalesced events extraction for 120Hz/240Hz stylus fidelity
      const native = e.nativeEvent as any;
      const coalescedEvents: PointerEvent[] =
        typeof native?.getCoalescedEvents === 'function'
          ? native.getCoalescedEvents()
          : [native];

      const targetEl = e.currentTarget as HTMLElement;
      const points: InkPoint[] = (coalescedEvents.length > 0 ? coalescedEvents : [native]).map(
        ce => extractPoint(ce, targetEl)
      );

      onStrokeMove?.(points, e);
    },
    [enablePalmRejection, extractPoint, onStrokeMove]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current === e.pointerId) {
        activePointerIdRef.current = null;
        if (e.pointerType === 'pen') {
          // Keep pen active flag momentarily to reject trailing palm taps
          setTimeout(() => {
            isPenActiveRef.current = false;
          }, 100);
        }
        onStrokeEnd?.(e);
      }
    },
    [onStrokeEnd]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current === e.pointerId) {
        activePointerIdRef.current = null;
        isPenActiveRef.current = false;
        onStrokeEnd?.(e);
      }
    },
    [onStrokeEnd]
  );

  return {
    pointerEvents: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
    isPenActive: isPenActiveRef.current,
  };
}
