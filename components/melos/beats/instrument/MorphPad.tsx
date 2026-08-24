// The Morph Pad — two axes, however many destinations, and a move you can record.
//
// The pad is not a second Motion. Motion assigns one shaped modulator to one destination and
// leaves it running; the pad is a *gesture* — you push several parameters at once, with your
// hand, and the shape of the movement is the musical idea. Recording it and looping it in bars is
// what turns "that sounded good" into part of the patch.
//
// Each preset points the axes at the two things that matter for THAT sound, so X is the vowel on
// a talkbox patch and the pick position on an upright. A pad wired to the same two parameters on
// every patch would be a worse filter knob.

import React, { useCallback, useEffect, useRef } from 'react';

export interface PadTarget {
  id: number;
  /** Parameter value at the axis minimum... */
  lo: number;
  /** ...and at its maximum. lo > hi is allowed, and inverts the axis. */
  hi: number;
}

interface Props {
  x: number;
  y: number;
  targetsX: PadTarget[];
  targetsY: PadTarget[];
  /** Axis captions — the destination names, so the pad says what it is wired to. */
  labelX: string;
  labelY: string;
  /** Live drag. Fires continuously; the caller drives the engine, not the document. */
  onMove: (x: number, y: number) => void;
  /** Drag finished — the point at which a position is worth storing. */
  onCommit: (x: number, y: number) => void;
  /** Recorded gesture, flat [phase, x, y, ...]. Drawn as a trail. */
  path: number[];
  recording: boolean;
  looping: boolean;
  /** 0..1 through the loop, for the ghost that shows where playback is. */
  loopPhase: number;
  accent?: string;
}

export const MorphPad: React.FC<Props> = ({
  x, y, targetsX, targetsY, labelX, labelY,
  onMove, onCommit, path, recording, looping, loopPhase,
  accent = '#FF4B1C',
}) => {
  const el = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const pos = useCallback((e: React.PointerEvent) => {
    const r = el.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      px: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      // Screen y runs down, the axis runs up — the reason a pad feels wrong when this is missed.
      py: Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)),
    };
  }, []);

  const down = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    const p = pos(e);
    if (p) onMove(p.px, p.py);
  }, [onMove, pos]);

  const move = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const p = pos(e);
    if (p) onMove(p.px, p.py);
  }, [onMove, pos]);

  const up = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const p = pos(e);
    onCommit(p ? p.px : x, p ? p.py : y);
  }, [onCommit, pos, x, y]);

  // Keyboard: the pad is a performance control, but it should not be mouse-only.
  const key = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.01 : 0.05;
    let nx = x; let ny = y;
    if (e.key === 'ArrowLeft') nx = Math.max(0, x - step);
    else if (e.key === 'ArrowRight') nx = Math.min(1, x + step);
    else if (e.key === 'ArrowDown') ny = Math.max(0, y - step);
    else if (e.key === 'ArrowUp') ny = Math.min(1, y + step);
    else return;
    e.preventDefault();
    onMove(nx, ny);
    onCommit(nx, ny);
  }, [onCommit, onMove, x, y]);

  // The recorded gesture, as an SVG path in 0..1 space.
  let trail = '';
  for (let i = 0; i + 2 < path.length; i += 3) {
    trail += `${i === 0 ? 'M' : 'L'}${(path[i + 1] * 100).toFixed(2)},${((1 - path[i + 2]) * 100).toFixed(2)} `;
  }

  // Where the loop is now, so a running gesture is visible and not just audible.
  let ghost: { gx: number; gy: number } | null = null;
  if (looping && path.length >= 3) {
    let best = 0;
    for (let i = 0; i + 2 < path.length; i += 3) if (path[i] <= loopPhase) best = i;
    ghost = { gx: path[best + 1], gy: path[best + 2] };
  }

  const nOut = targetsX.length + targetsY.length;

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={el}
        role="application"
        aria-label={`Morph pad. X ${labelX}, Y ${labelY}`}
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className="relative rounded-lg border overflow-hidden cursor-crosshair outline-none focus:border-white/30"
        style={{
          aspectRatio: '1.35',
          minHeight: 132,
          touchAction: 'none',
          borderColor: recording ? accent : 'rgba(255,255,255,0.12)',
          background: 'radial-gradient(circle at 50% 50%, #17161f, #0a090d 72%)',
        }}
      >
        {/* quarters */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '25% 25%',
          }}
        />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          {trail && (
            <path
              d={trail}
              fill="none"
              stroke={looping ? accent : 'rgba(224,168,92,0.5)'}
              strokeWidth={0.7}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {ghost && (
            <circle cx={ghost.gx * 100} cy={(1 - ghost.gy) * 100} r={1.6} fill={accent} opacity={0.55} />
          )}
        </svg>

        {/* the puck */}
        <div
          className="absolute w-4 h-4 rounded-full pointer-events-none"
          style={{
            left: `${x * 100}%`,
            top: `${(1 - y) * 100}%`,
            margin: '-8px 0 0 -8px',
            background: `radial-gradient(circle at 40% 35%, #fff, ${accent} 65%)`,
            boxShadow: `0 0 14px ${accent}`,
          }}
        />

        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono uppercase tracking-wider text-white/35 pointer-events-none">
          {labelX}
        </span>
        <span
          className="absolute top-1/2 left-1 text-[8px] font-mono uppercase tracking-wider text-white/35 pointer-events-none"
          style={{ transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'left center' }}
        >
          {labelY}
        </span>
        {recording && (
          <span className="absolute top-1 right-1.5 text-[8px] font-mono uppercase tracking-wider" style={{ color: accent }}>
            ● rec
          </span>
        )}
      </div>
      <p className="text-[9px] font-mono text-white/25">
        {nOut === 0 ? 'no destinations' : `${nOut} destination${nOut === 1 ? '' : 's'}`}
      </p>
    </div>
  );
};

/** Where a target sits at an axis position. `lo > hi` inverts, which is why this is not a clamp. */
export const padValue = (t: PadTarget, pos: number): number => t.lo + (t.hi - t.lo) * Math.max(0, Math.min(1, pos));
