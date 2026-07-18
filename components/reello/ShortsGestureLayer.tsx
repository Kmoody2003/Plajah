// ShortsGestureLayer — the vertical-feed gesture vocabulary.
//
// Mount as an absolutely-positioned sibling of the shorts <video>. It owns:
//   • single tap      → play / pause
//   • double tap      → like, with a heart burst at the tap point
//   • long press      → 2× speed while held, restored on release
//
// It deliberately sits at a LOW z-index so the feed's own action bar and overlays stay
// clickable above it. Degrades silently: with no video element it simply does nothing.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, FastForward } from 'lucide-react';

/** Max gap between taps to count as a double tap. */
const DOUBLE_TAP_MS = 280;
/** Hold duration before 2× kicks in. */
const LONG_PRESS_MS = 400;
/** Movement (px) that turns a press into a scroll/drag and cancels the gesture. */
const MOVE_CANCEL_PX = 12;

const SPEED = 2;

interface Burst { id: number; x: number; y: number; }

interface Props {
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  /** Double-tap like. Called only when the video is not already liked (TikTok semantics). */
  onLike?: () => void;
  isLiked?: boolean;
  /** Single tap. Omit to let the layer toggle the element's own play state. */
  onTap?: () => void;
  /** Disable every gesture (e.g. while a sheet or modal owns the screen). */
  disabled?: boolean;
  className?: string;
}

const ShortsGestureLayer: React.FC<Props> = ({
  videoElRef, onLike, isLiked, onTap, disabled, className,
}) => {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [speeding, setSpeeding] = useState(false);

  const lastTapRef      = useRef(0);
  const singleTapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPosRef      = useRef<{ x: number; y: number } | null>(null);
  const movedRef        = useRef(false);
  const didLongPressRef = useRef(false);
  const prevRateRef     = useRef(1);
  const burstSeq        = useRef(0);

  const clearTimers = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const endSpeed = useCallback(() => {
    const el = videoElRef.current;
    if (el) { try { el.playbackRate = prevRateRef.current || 1; } catch { /* */ } }
    setSpeeding(false);
  }, [videoElRef]);

  // Always restore playback rate on unmount — a stuck 2× would follow the user around.
  useEffect(() => () => {
    clearTimers();
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    const el = videoElRef.current;
    if (el) { try { el.playbackRate = prevRateRef.current || 1; } catch { /* */ } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A disabled layer must not leave 2× engaged.
  useEffect(() => { if (disabled && speeding) endSpeed(); }, [disabled, speeding, endSpeed]);

  const defaultTap = useCallback(() => {
    const el = videoElRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
    else el.pause();
  }, [videoElRef]);

  const fireBurst = useCallback((x: number, y: number) => {
    const id = ++burstSeq.current;
    setBursts(b => [...b, { id, x, y }]);
    setTimeout(() => setBursts(b => b.filter(z => z.id !== id)), 900);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    downPosRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    didLongPressRef.current = false;

    clearTimers();
    longPressTimer.current = setTimeout(() => {
      if (movedRef.current) return;
      const el = videoElRef.current;
      if (!el) return;
      didLongPressRef.current = true;
      prevRateRef.current = el.playbackRate || 1;
      try { el.playbackRate = SPEED; } catch { /* */ }
      setSpeeding(true);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = downPosRef.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - start.y) > MOVE_CANCEL_PX) {
      movedRef.current = true;
      clearTimers();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    clearTimers();
    const start = downPosRef.current;
    downPosRef.current = null;

    if (disabled) return;

    // Long press ends → drop back to 1×, and never counts as a tap.
    if (didLongPressRef.current) { didLongPressRef.current = false; endSpeed(); return; }
    if (movedRef.current || !start) return;

    const now = Date.now();
    const isDouble = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = now;

    if (isDouble) {
      // Cancel the pending single-tap so a double tap never also toggles playback.
      if (singleTapTimer.current) { clearTimeout(singleTapTimer.current); singleTapTimer.current = null; }
      lastTapRef.current = 0;
      const rect = e.currentTarget.getBoundingClientRect();
      fireBurst(e.clientX - rect.left, e.clientY - rect.top);
      if (!isLiked) onLike?.();
      return;
    }

    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      (onTap || defaultTap)();
    }, DOUBLE_TAP_MS);
  };

  const onPointerCancel = () => {
    clearTimers();
    downPosRef.current = null;
    if (didLongPressRef.current) { didLongPressRef.current = false; endSpeed(); }
  };

  return (
    <div
      className={`absolute inset-0 z-10 touch-none select-none ${className || ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 2× speed badge */}
      <AnimatePresence>
        {speeding && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/15 pointer-events-none"
          >
            <FastForward size={12} className="text-small-orange" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">2× speed</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Double-tap heart bursts */}
      <AnimatePresence>
        {bursts.map(b => (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.25, 1.05, 1.4], y: [0, -10, -18, -46] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, times: [0, 0.2, 0.55, 1] }}
            style={{ left: b.x, top: b.y }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <Heart size={72} className="text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]" fill="#D40055" strokeWidth={1.25} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ShortsGestureLayer;
