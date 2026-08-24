// The Ghost Gate grid — four bands, sixteen steps.
//
// The reason this is four rows and not one: a normal trance gate mutes everything at once, which
// takes the sub with it and drops the floor out of the track. Leaving the Sub row solid while
// chopping the Air row gives you the chopped top over an unbroken bottom, which is the move
// people currently build out of three sends and a sidechain.
//
// Drag across cells to paint. The row colours run low-to-high, warm-to-cool, so the picture
// reads as a spectrum rather than as four arbitrary lanes.

import React, { useCallback, useRef } from 'react';
import { BAND_LABELS, GATE_BANDS, GATE_STEPS } from '../../../../services/melos/instruments/bajo/params';

const BAND_COLORS = ['#FF9B7B', '#FF4B1C', '#E0A85C', '#63C9DE'];

interface Props {
  grid: number[][];
  onChange: (grid: number[][]) => void;
  /** Which cell is sounding. -1 when stopped. */
  playStep?: number;
}

export const GhostGateGrid: React.FC<Props> = ({ grid, onChange, playStep = -1 }) => {
  // Paint mode is captured on the first cell so a drag sets a run to one value rather than
  // toggling each cell it crosses — the difference between painting and scribbling.
  const paint = useRef<number | null>(null);

  const setCell = useCallback((band: number, step: number, value: number) => {
    const next = grid.map((row) => [...row]);
    next[band][step] = value;
    onChange(next);
  }, [grid, onChange]);

  const stop = useCallback(() => { paint.current = null; }, []);

  React.useEffect(() => {
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [stop]);

  return (
    <div className="flex flex-col gap-[3px] select-none">
      {Array.from({ length: GATE_BANDS }, (_, b) => (
        <div key={b} className="flex items-center gap-1.5">
          <span className="w-8 flex-none text-right text-[9px] font-mono uppercase tracking-wide text-white/40">
            {BAND_LABELS[b]}
          </span>
          <div className="flex gap-[2px] flex-1 min-w-0">
            {Array.from({ length: GATE_STEPS }, (_, st) => {
              const on = !!grid[b]?.[st];
              return (
                <button
                  key={st}
                  aria-label={`${BAND_LABELS[b]} step ${st + 1}`}
                  aria-pressed={on}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const v = on ? 0 : 1;
                    paint.current = v;
                    setCell(b, st, v);
                  }}
                  onPointerEnter={() => {
                    if (paint.current !== null) setCell(b, st, paint.current);
                  }}
                  className="flex-1 min-w-0 rounded-[3px] transition-colors"
                  style={{
                    height: 18,
                    background: on ? BAND_COLORS[b] : '#131118',
                    border: `1px solid ${on ? BAND_COLORS[b] : st % 4 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: st === playStep ? 'inset 0 0 0 1px rgba(255,255,255,0.85)' : undefined,
                    touchAction: 'none',
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Gate patterns worth one click. "Chop air" is the one this section exists for. */
export const GATE_PRESETS: Array<{ name: string; fn: (band: number, step: number) => number }> = [
  { name: 'All on', fn: () => 1 },
  { name: 'Chop air', fn: (b, s) => (b < 2 ? 1 : s % 2 === 0 ? 1 : 0) },
  { name: 'Stutter', fn: (b, s) => (b === 0 ? 1 : (s * (b + 2)) % 5 < 2 ? 1 : 0) },
  { name: 'Offbeat', fn: (b, s) => (b === 0 ? 1 : s % 4 === 2 ? 0 : 1) },
  { name: 'Sub only', fn: (b) => (b === 0 ? 1 : 0) },
];

export const buildGrid = (fn: (band: number, step: number) => number): number[][] =>
  Array.from({ length: GATE_BANDS }, (_, b) =>
    Array.from({ length: GATE_STEPS }, (_, s) => (fn(b, s) ? 1 : 0)));
