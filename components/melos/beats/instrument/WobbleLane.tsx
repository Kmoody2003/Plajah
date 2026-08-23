// The wobble rate lane — BAJO's hero control.
//
// Sixteen slots, one per 16th note, each holding its own LFO division. This is the single
// control that separates a bass synth from a synth playing bass: a wobble with one rate is a
// tremolo, and a wobble whose rate changes per step is dubstep.
//
// It draws the resulting shape above the slots rather than beside them, because the thing you
// are editing is a waveform, and a row of "1/8 1/8 1/16 1/16" labels does not tell you what
// that sounds like. Drag a slot vertically to change its division.

import React, { useCallback, useRef } from 'react';
import { LANE_DIVS } from '../../../../services/melos/instruments/bajo/params';

/** Division index → beats per LFO cycle. Mirrors WOB_DIVS in rust/plajah-audio/src/params.rs. */
const DIV_BEATS = [4, 2, 4 / 3, 1, 1.5, 2 / 3, 0.5, 0.75, 1 / 3, 0.25, 1 / 6, 0.125, 0.0625];

interface Props {
  lane: number[];
  onChange: (lane: number[]) => void;
  /** Which 16th is sounding, for the playhead. -1 when stopped. */
  playStep?: number;
  shape?: number;
  skew?: number;
  smooth?: number;
  accent?: string;
  height?: number;
}

/** Mirrors `wob_eval` in rust/plajah-audio/src/bajo.rs — the drawing must be the same function
 *  the engine runs, or the display is a decoration rather than a readout. */
function wobEval(phase: number, shape: number, skew: number): number {
  let p = phase - Math.floor(phase);
  const sk = (skew - 0.5) * 2;
  if (Math.abs(sk) > 0.01) {
    const k = Math.min(0.94, Math.max(0.06, 0.5 - sk * 0.42));
    p = p < k ? (p / k) * 0.5 : 0.5 + ((p - k) / (1 - k)) * 0.5;
  }
  const t = p * Math.PI * 2;
  switch (shape) {
    case 0: return Math.sin(t);
    case 1: return 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5);
    case 2: return 1 - 2 * p;
    case 3: return 2 * p - 1;
    case 4: return p < 0.5 ? 1 : -1;
    case 5: {
      const n = Math.floor(phase) * 7 + Math.floor(p * 4) * 13 + 1;
      let h = (Math.imul(n, 1103515245) + 12345) & 0x7fffffff;
      h = Math.imul(h ^ (h >>> 13), 1274126177) & 0x7fffffff;
      return h / 1073741823 - 1;
    }
    case 6: return Math.tanh((Math.sin(t) * 0.75 + Math.sin(t * 3 + 1.1) * 0.42 + Math.sin(t * 5) * 0.18) * 1.9);
    case 7: return Math.sin(Math.sin(t) * 2.35);
    default: return Math.max(-1, Math.min(1, Math.sin(t) * 2.7));
  }
}

export const WobbleLane: React.FC<Props> = ({
  lane, onChange, playStep = -1, shape = 0, skew = 0.5, smooth = 0.1,
  accent = '#FF4B1C', height = 74,
}) => {
  const drag = useRef<{ index: number; startY: number; startV: number } | null>(null);

  const onDown = useCallback((index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { index, startY: e.clientY, startV: lane[index] ?? 6 };
  }, [lane]);

  const onMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(0, Math.min(DIV_BEATS.length - 1, Math.round(d.startV + (d.startY - e.clientY) / 14)));
    if (next === lane[d.index]) return;
    const out = [...lane];
    out[d.index] = next;
    onChange(out);
  }, [lane, onChange]);

  const onUp = useCallback(() => { drag.current = null; }, []);

  // One bar of the resulting waveform, sampled across the lane. Phase accumulates across slots
  // exactly as the engine's does, so a slot that changes rate mid-bar shows the real join.
  const W = 480;
  const H = height;
  const pts: string[] = [];
  let phase = 0;
  let y = 0;
  const a = smooth < 0.01 ? 1 : Math.pow(1 - smooth * 0.985, 2);
  const N = 480;
  for (let i = 0; i < N; i++) {
    const frac = i / N;
    const step = Math.min(15, Math.floor(frac * 16));
    const beatsPerCycle = DIV_BEATS[lane[step] ?? 6] || 0.5;
    phase += (0.25 / beatsPerCycle) / (N / 16); // 0.25 beats per 16th slot
    const raw = wobEval(phase, shape, skew);
    y = a >= 1 ? raw : y + (raw - y) * a;
    pts.push(`${((frac * W).toFixed(1))},${(H / 2 - y * (H * 0.42)).toFixed(1)}`);
  }

  return (
    <div className="flex flex-col gap-1 select-none">
      <div className="relative rounded-lg overflow-hidden border border-white/10" style={{ background: '#08070B', height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {Array.from({ length: 17 }, (_, i) => (
            <line
              key={i} x1={(i / 16) * W} x2={(i / 16) * W} y1={0} y2={H}
              stroke="rgba(255,255,255,0.07)" strokeWidth={i % 4 === 0 ? 1.4 : 0.6}
            />
          ))}
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          {playStep >= 0 && (
            <rect x={(playStep / 16) * W} y={0} width={W / 16} height={H} fill={accent} opacity={0.14} />
          )}
          <polyline points={pts.join(' ')} fill="none" stroke={accent} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="flex gap-[2px]">
        {lane.map((v, i) => (
          <button
            key={i}
            onPointerDown={onDown(i)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onDoubleClick={() => { const out = [...lane]; out[i] = 6; onChange(out); }}
            title={`Step ${i + 1} — drag to change rate`}
            className="flex-1 min-w-0 rounded text-[9px] font-mono py-1 cursor-ns-resize border tabular-nums"
            style={{
              background: i === playStep ? 'rgba(255,75,28,0.16)' : '#0A090C',
              borderColor: i === playStep ? accent : i % 4 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
              color: i === playStep ? accent : 'rgba(255,255,255,0.5)',
              touchAction: 'none',
            }}
          >
            {LANE_DIVS[v] ?? '1/8'}
          </button>
        ))}
      </div>
    </div>
  );
};

/** The lane shapes worth one click. Drawing sixteen slots by hand is the exception, not the rule. */
export const LANE_PRESETS: Array<{ name: string; lane: number[] }> = [
  { name: '1/8', lane: Array(16).fill(6) },
  { name: '1/16', lane: Array(16).fill(9) },
  { name: '1/32', lane: Array(16).fill(11) },
  { name: 'Riddim', lane: [6, 6, 6, 6, 9, 9, 9, 9, 6, 6, 6, 6, 11, 11, 11, 11] },
  { name: 'Ramp', lane: [3, 3, 6, 6, 6, 6, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11] },
  { name: 'Triplet', lane: [8, 8, 8, 8, 10, 10, 10, 10, 8, 8, 8, 8, 5, 5, 5, 5] },
];
