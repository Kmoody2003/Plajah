import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';

const HOLD_DURATION = 5000; // ms

interface HoldTimerProps {
  x: number;
  y: number;
  progress: number; // 0–1
}

const HoldTimerBubble: React.FC<HoldTimerProps> = ({ x, y, progress }) => {
  const remaining = Math.ceil(HOLD_DURATION / 1000 * (1 - progress));
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * progress;

  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 0.5, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: 6 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed',
        left: x,
        top: y - 52,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div className="relative flex items-center justify-center">
        {/* Glow backdrop */}
        <div className="absolute inset-0 rounded-full blur-md opacity-60" style={{ background: 'rgba(107,0,153,0.5)' }} />
        <svg width={36} height={36} className="relative">
          {/* Track */}
          <circle cx={18} cy={18} r={r} fill="rgba(0,0,0,0.7)" stroke="rgba(255,255,255,0.1)" strokeWidth={2} />
          {/* Progress arc */}
          <circle
            cx={18} cy={18} r={r}
            fill="none"
            stroke="url(#holdGrad)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 18 18)"
            style={{ transition: 'stroke-dasharray 0.05s linear' }}
          />
          <defs>
            <linearGradient id="holdGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6B0099" />
              <stop offset="100%" stopColor="#D40055" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute text-[9px] font-black text-white">{remaining}</span>
      </div>
      {/* Tail */}
      <div className="mx-auto w-0.5 h-2 bg-white/20 rounded-full mt-0.5" />
    </motion.div>,
    document.body
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHoldNavigate(onNavigate: () => void, duration: number = HOLD_DURATION) {
  const [progress, setProgress] = useState(0);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const posRef = useRef({ x: 0, y: 0 });

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(elapsed / duration, 1);
    setProgress(p);
    if (p >= 1) {
      cancel();
      onNavigate();
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [duration, onNavigate]);

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
    posRef.current = { x: clientX, y: clientY };
    setCursorPos({ x: clientX, y: clientY });
    startRef.current = Date.now();
    setActive(true);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const cancel = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setActive(false);
    setProgress(0);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!active) return;
    posRef.current = { x: e.clientX, y: e.clientY };
    setCursorPos({ x: e.clientX, y: e.clientY });
  }, [active]);

  // Cleanup on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const timer = active ? (
    <HoldTimerBubble x={cursorPos.x} y={cursorPos.y} progress={progress} />
  ) : null;

  return { start, cancel, onMouseMove, active, progress, timer };
}

// ── Wrapper component for easy use ───────────────────────────────────────────

interface HoldNavigateProps {
  onNavigate: () => void;
  duration?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export const HoldNavigate: React.FC<HoldNavigateProps> = ({
  onNavigate, duration = HOLD_DURATION, children, className, style, disabled,
}) => {
  const { start, cancel, onMouseMove, active, timer } = useHoldNavigate(onNavigate, duration);

  return (
    <div
      className={className}
      style={{ ...style, cursor: disabled ? undefined : 'pointer', userSelect: 'none' }}
      onMouseDown={disabled ? undefined : start}
      onMouseUp={disabled ? undefined : cancel}
      onMouseLeave={disabled ? undefined : cancel}
      onMouseMove={disabled ? undefined : onMouseMove}
      onTouchStart={disabled ? undefined : start as any}
      onTouchEnd={disabled ? undefined : cancel}
      onContextMenu={e => e.preventDefault()}
    >
      {children}
      <AnimatePresence>{timer}</AnimatePresence>
    </div>
  );
};

export default HoldNavigate;
