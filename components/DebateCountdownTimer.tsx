import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface DebateCountdownTimerProps {
  endsAt: number;
  totalDurationMs: number; // for arc progress — typically 24h in ms
  onExpired?: () => void;
}

// ── Arc progress ring ──────────────────────────────────────────────────────────

const ArcRing: React.FC<{
  pct: number;        // 0–1
  size: number;
  strokeWidth: number;
  color: string;
  glowColor: string;
  children: React.ReactNode;
}> = ({ pct, size, strokeWidth, color, glowColor, children }) => {
  const r      = (size - strokeWidth) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const cx     = size / 2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Track */}
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            filter: `drop-shadow(0 0 ${strokeWidth * 1.5}px ${glowColor})`,
          }}
        />
      </svg>
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};

// ── Flip digit (animates on change) ───────────────────────────────────────────

const FlipDigit: React.FC<{ value: string; color: string }> = ({ value, color }) => (
  <AnimatePresence mode="popLayout">
    <motion.span
      key={value}
      initial={{ y: -14, opacity: 0, filter: 'blur(4px)' }}
      animate={{ y: 0,   opacity: 1, filter: 'blur(0px)' }}
      exit={{    y: 14,  opacity: 0, filter: 'blur(4px)' }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{
        display: 'block',
        fontVariantNumeric: 'tabular-nums',
        color,
        textShadow: `0 0 24px ${color}80, 0 0 48px ${color}40`,
      }}
    >
      {value}
    </motion.span>
  </AnimatePresence>
);

// ── Main Component ────────────────────────────────────────────────────────────

const DebateCountdownTimer: React.FC<DebateCountdownTimerProps> = ({
  endsAt,
  totalDurationMs,
  onExpired,
}) => {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));
  const [expired, setExpired]     = useState(false);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      setRemaining(left);
      if (left === 0 && !expired) {
        setExpired(true);
        onExpired?.();
        if (rafRef.current) clearInterval(rafRef.current);
      }
    };
    tick();
    rafRef.current = setInterval(tick, 250);
    return () => { if (rafRef.current) clearInterval(rafRef.current); };
  }, [endsAt]);

  const totalS  = Math.floor(remaining / 1000);
  const hours   = Math.floor(totalS / 3600);
  const minutes = Math.floor((totalS % 3600) / 60);
  const seconds = totalS % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  // Urgency tiers
  const isUrgent  = remaining < 2  * 3_600_000;   // < 2 hours
  const isCritical= remaining < 30 * 60_000;       // < 30 min
  const isExpired = remaining === 0;

  const ringColor = isExpired  ? '#ef4444'
    : isCritical ? '#ef4444'
    : isUrgent   ? '#f97316'
    : '#FF8C00';

  const glowColor = isExpired || isCritical ? 'rgba(239,68,68,0.8)'
    : isUrgent   ? 'rgba(249,115,22,0.8)'
    : 'rgba(255,140,0,0.8)';

  const digitColor = isExpired || isCritical
    ? '#fca5a5'
    : isUrgent
    ? '#fdba74'
    : '#ffffff';

  // Arc fractions
  const totalDurationS = totalDurationMs / 1000;
  const elapsedS       = totalDurationS - totalS;
  const hoursFrac      = 1 - (hours / 23);                         // 0 full → 1 empty
  const minutesFrac    = minutes / 59;                              // counts up
  const secondsFrac    = seconds / 59;
  const overallFrac    = Math.max(0, remaining / totalDurationMs);  // 1 → 0

  // Pulsing glow when critical
  const pulseAnimation = isCritical && !isExpired
    ? { boxShadow: [`0 0 0px ${glowColor}`, `0 0 40px ${glowColor}`, `0 0 0px ${glowColor}`] }
    : {};

  const RING_SIZE = 96;
  const RING_STROKE = 5;

  return (
    <motion.div
      animate={pulseAnimation}
      transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
      className="relative rounded-3xl overflow-hidden select-none"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.6) 100%)',
        border: `1px solid ${isExpired || isCritical ? 'rgba(239,68,68,0.4)' : isUrgent ? 'rgba(249,115,22,0.3)' : 'rgba(255,140,0,0.2)'}`,
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Ambient glow layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${glowColor}15 0%, transparent 65%)`,
        }}
      />

      {/* Overall 24h progress bar — very thin at the very top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden rounded-t-3xl">
        <motion.div
          className="h-full rounded-full"
          animate={{ width: `${overallFrac * 100}%` }}
          transition={{ duration: 0.5 }}
          style={{ background: `linear-gradient(90deg, ${ringColor}00, ${ringColor})` }}
        />
      </div>

      <div className="px-6 pt-5 pb-4">
        {/* Label */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {!isExpired && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: ringColor, boxShadow: `0 0 6px ${glowColor}` }}
            />
          )}
          <span
            className="text-[9px] font-black uppercase tracking-[0.4em]"
            style={{ color: isExpired ? '#ef4444' : 'rgba(255,255,255,0.4)' }}
          >
            {isExpired ? 'Debate Ended' : isCritical ? 'Final Minutes' : isUrgent ? 'Time Running Out' : 'Time Remaining'}
          </span>
          {!isExpired && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: ringColor, boxShadow: `0 0 6px ${glowColor}` }}
            />
          )}
        </div>

        {/* The three arc-ring segments */}
        <div className="flex items-center justify-center gap-4">

          {/* HOURS */}
          <ArcRing pct={1 - hoursFrac} size={RING_SIZE} strokeWidth={RING_STROKE} color={ringColor} glowColor={glowColor}>
            <div className="flex overflow-hidden" style={{ height: 38 }}>
              <FlipDigit value={pad(hours)[0]} color={digitColor} />
              <FlipDigit value={pad(hours)[1]} color={digitColor} />
            </div>
            <span
              className="text-[8px] font-black uppercase tracking-[0.25em] mt-0.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              HRS
            </span>
          </ArcRing>

          {/* Colon separator */}
          <div className="flex flex-col gap-2 mb-3">
            {[0, 1].map(i => (
              <motion.div
                key={i}
                animate={{ opacity: [1, 0.15, 1] }}
                transition={{ repeat: Infinity, duration: 1, delay: i * 0.1, ease: 'easeInOut' }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: ringColor, boxShadow: `0 0 8px ${glowColor}` }}
              />
            ))}
          </div>

          {/* MINUTES */}
          <ArcRing pct={minutesFrac} size={RING_SIZE} strokeWidth={RING_STROKE} color={ringColor} glowColor={glowColor}>
            <div className="flex overflow-hidden" style={{ height: 38 }}>
              <FlipDigit value={pad(minutes)[0]} color={digitColor} />
              <FlipDigit value={pad(minutes)[1]} color={digitColor} />
            </div>
            <span
              className="text-[8px] font-black uppercase tracking-[0.25em] mt-0.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              MIN
            </span>
          </ArcRing>

          {/* Colon separator */}
          <div className="flex flex-col gap-2 mb-3">
            {[0, 1].map(i => (
              <motion.div
                key={i}
                animate={{ opacity: [1, 0.15, 1] }}
                transition={{ repeat: Infinity, duration: 1, delay: i * 0.1, ease: 'easeInOut' }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: ringColor, boxShadow: `0 0 8px ${glowColor}` }}
              />
            ))}
          </div>

          {/* SECONDS */}
          <ArcRing pct={secondsFrac} size={RING_SIZE} strokeWidth={RING_STROKE} color={ringColor} glowColor={glowColor}>
            <div className="flex overflow-hidden" style={{ height: 38 }}>
              <FlipDigit value={pad(seconds)[0]} color={digitColor} />
              <FlipDigit value={pad(seconds)[1]} color={digitColor} />
            </div>
            <span
              className="text-[8px] font-black uppercase tracking-[0.25em] mt-0.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              SEC
            </span>
          </ArcRing>
        </div>

        {/* Big combined display under the rings — the hero number */}
        <div className="flex items-baseline justify-center gap-0.5 mt-3">
          {[pad(hours)[0], pad(hours)[1], ':', pad(minutes)[0], pad(minutes)[1], ':', pad(seconds)[0], pad(seconds)[1]].map((ch, i) => (
            ch === ':' ? (
              <motion.span
                key={`sep-${i}`}
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: `${ringColor}80`,
                  lineHeight: 1,
                  marginBottom: 4,
                  letterSpacing: -1,
                }}
              >
                :
              </motion.span>
            ) : (
              <div key={`d-${i}`} style={{ overflow: 'hidden', height: 44 }}>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={ch + i}
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0,   opacity: 1 }}
                    exit={{    y: 20,  opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      display: 'block',
                      fontSize: 40,
                      fontWeight: 900,
                      letterSpacing: -1,
                      lineHeight: 1.1,
                      fontVariantNumeric: 'tabular-nums',
                      background: `linear-gradient(180deg, #fff 0%, ${ringColor} 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: `drop-shadow(0 0 10px ${glowColor}60)`,
                    }}
                  >
                    {ch}
                  </motion.span>
                </AnimatePresence>
              </div>
            )
          ))}
        </div>

        {/* Urgency message */}
        <AnimatePresence>
          {isCritical && !isExpired && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-[10px] font-black uppercase tracking-widest mt-3"
              style={{ color: '#fca5a5' }}
            >
              ⚠ Make your final points — time is almost up
            </motion.p>
          )}
          {isExpired && (
            <motion.p
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center text-[11px] font-black uppercase tracking-widest mt-3"
              style={{ color: '#ef4444', textShadow: '0 0 20px rgba(239,68,68,0.6)' }}
            >
              Time's up · Aria is analyzing the debate
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default DebateCountdownTimer;
