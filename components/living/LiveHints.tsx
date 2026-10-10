/**
 * Visual hints for living pages: a quiet "you can do something here" cue drawn ON the page, visual first (no words, so a
 * non-reader gets it too). One interactive spot at a time gets a few gentle pulses, then the next, until the reader has tried
 * each one; a spot the reader has used stops hinting. Each kind of interaction looks different:
 *   tap       a pulsing ring around a bright dot
 *   press     the ring fills like a clock while a finger "holds"
 *   drag      a ghost finger slides along the path the drag goes (a dashed trail with an arrowhead)
 *   proximity a slow shimmering halo ("come closer")
 * Reduced motion: no animation. Every spot you have not tried yet carries a still ring instead, so the cue never depends on motion.
 * Drawn in page units over the art with a dark halo behind the white stroke so it reads on any picture. Never takes pointer events.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { InteractiveItem } from '../../services/living/runtime/engine';

const SHOW_MS = 2600, GAP_MS = 700, FIRST_MS = 1300, IDLE_RESUME_MS = 3500, MAX_STILL = 8;

interface Props {
  items: InteractiveItem[];
  width: number;
  height: number;
  reduced: boolean;
  enabled: boolean;
  /** Item keys the reader has already tried. */
  discovered: ReadonlySet<string>;
  /** Changes whenever the reader touches the page; hints back off while they are busy. */
  busyTick: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function LiveHints({ items, width, height, reduced, enabled, discovered, busyTick }: Props) {
  const todo = useMemo(() => items.filter(i => !discovered.has(i.key)), [items, discovered]);
  const [shown, setShown] = useState<{ key: string; n: number } | null>(null);
  const cursor = useRef(0);
  const nRef = useRef(0);
  const lastBusy = useRef(0);
  useEffect(() => { lastBusy.current = Date.now(); setShown(null); }, [busyTick]);

  useEffect(() => {
    if (!enabled || reduced || !todo.length) { setShown(null); return; }
    let alive = true; let t: ReturnType<typeof setTimeout>;
    const step = (first: boolean) => {
      if (!alive) return;
      const sinceBusy = Date.now() - lastBusy.current;
      if (sinceBusy < IDLE_RESUME_MS) { setShown(null); t = setTimeout(() => step(false), IDLE_RESUME_MS - sinceBusy + 50); return; }
      const it = todo[cursor.current % todo.length]; cursor.current++;
      setShown({ key: it.key, n: ++nRef.current });
      t = setTimeout(() => { if (!alive) return; setShown(null); t = setTimeout(() => step(false), GAP_MS); }, SHOW_MS);
    };
    t = setTimeout(() => step(true), FIRST_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [enabled, reduced, todo]);

  if (!enabled || !todo.length) return null;
  const sw = width / 95;                                    // stroke unit: ~1% of the page, so it reads at any size
  const spot = (it: InteractiveItem, animated: boolean, n: number) => {
    const cx = it.box.x + it.box.w / 2, cy = it.box.y + it.box.h / 2;
    const r = clamp(Math.max(it.box.w, it.box.h) * 0.55, width * 0.05, width * 0.15);
    const halo = 'rgba(20,10,40,0.45)', ink = '#ffffff';
    if (!animated) {
      return (
        <g key={`${it.key}:s`} transform={`translate(${cx} ${cy})`} opacity={0.8}>
          <circle r={r} fill="none" stroke={halo} strokeWidth={sw * 2.4} />
          <circle r={r} fill="none" stroke={ink} strokeWidth={sw} strokeDasharray={`${sw * 2.2} ${sw * 2.2}`} />
          <circle r={sw * 1.5} fill={ink} />
        </g>
      );
    }
    const pulse = (
      <>
        <circle r={r} fill="none" stroke={halo} strokeWidth={sw * 2.4} opacity="0">
          <animate attributeName="r" values={`${r * 0.5};${r * 1.25}`} dur="1.2s" repeatCount="2" />
          <animate attributeName="opacity" values="0.8;0" dur="1.2s" repeatCount="2" />
        </circle>
        <circle r={r} fill="none" stroke={ink} strokeWidth={sw} opacity="0">
          <animate attributeName="r" values={`${r * 0.5};${r * 1.25}`} dur="1.2s" repeatCount="2" />
          <animate attributeName="opacity" values="0.95;0" dur="1.2s" repeatCount="2" />
        </circle>
      </>
    );
    if (it.family === 'drag') {
      const v = it.vec ?? { dx: 1, dy: 0 }; const mag = Math.hypot(v.dx, v.dy) || 1;
      const len = clamp(mag, width * 0.14, width * 0.34); const vx = v.dx / mag * len, vy = v.dy / mag * len;
      const ang = Math.atan2(vy, vx) * 180 / Math.PI;
      const dot = (k: number) => (
        <circle r={sw * 2.6} fill={ink} stroke={halo} strokeWidth={sw * 0.8} opacity="0">
          <animateTransform attributeName="transform" type="translate" values={`0 0;${vx} ${vy}`} keyTimes="0;1" dur="1.3s" begin={`${k * 0.15}s`} repeatCount="2" calcMode="spline" keySplines="0.4 0 0.2 1" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="1.3s" begin={`${k * 0.15}s`} repeatCount="2" />
        </circle>
      );
      return (
        <g key={`${it.key}:${n}`} transform={`translate(${cx} ${cy})`}>
          <line x1="0" y1="0" x2={vx} y2={vy} stroke={halo} strokeWidth={sw * 2.4} strokeLinecap="round" strokeDasharray={`${sw * 0.1} ${sw * 3.6}`} opacity="0.9" />
          <line x1="0" y1="0" x2={vx} y2={vy} stroke={ink} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${sw * 0.1} ${sw * 3.6}`} />
          <g transform={`translate(${vx} ${vy}) rotate(${ang})`}><path d={`M ${-sw * 3} ${-sw * 2.4} L 0 0 L ${-sw * 3} ${sw * 2.4}`} fill="none" stroke={halo} strokeWidth={sw * 2.4} strokeLinecap="round" strokeLinejoin="round" /><path d={`M ${-sw * 3} ${-sw * 2.4} L 0 0 L ${-sw * 3} ${sw * 2.4}`} fill="none" stroke={ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /></g>
          {dot(0)}{dot(1)}
        </g>
      );
    }
    if (it.family === 'press') {
      const c = 2 * Math.PI * r;
      return (
        <g key={`${it.key}:${n}`} transform={`translate(${cx} ${cy}) rotate(-90)`}>
          <circle r={r} fill="none" stroke={halo} strokeWidth={sw * 2.4} />
          <circle r={r} fill="none" stroke={ink} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c}>
            <animate attributeName="stroke-dashoffset" values={`${c};0;0`} keyTimes="0;0.7;1" dur="1.3s" repeatCount="2" />
          </circle>
          <circle r={sw * 2.2} fill={ink} stroke={halo} strokeWidth={sw * 0.8}><animate attributeName="r" values={`${sw * 2};${sw * 3.4};${sw * 2}`} dur="1.3s" repeatCount="2" /></circle>
        </g>
      );
    }
    if (it.family === 'proximity') {
      return (
        <g key={`${it.key}:${n}`} transform={`translate(${cx} ${cy})`}>
          <circle r={r * 1.1} fill="none" stroke={halo} strokeWidth={sw * 2.4} strokeDasharray={`${sw * 1.2} ${sw * 2.8}`} opacity="0">
            <animate attributeName="opacity" values="0;0.8;0" dur="1.3s" repeatCount="2" />
          </circle>
          <circle r={r * 1.1} fill="none" stroke={ink} strokeWidth={sw} strokeDasharray={`${sw * 1.2} ${sw * 2.8}`} opacity="0">
            <animate attributeName="opacity" values="0;0.95;0" dur="1.3s" repeatCount="2" />
            <animate attributeName="r" values={`${r * 1.3};${r * 0.8}`} dur="1.3s" repeatCount="2" />
          </circle>
        </g>
      );
    }
    return (
      <g key={`${it.key}:${n}`} transform={`translate(${cx} ${cy})`}>
        {pulse}
        <circle r={sw * 2} fill={ink} stroke={halo} strokeWidth={sw * 0.8}><animate attributeName="r" values={`${sw * 1.6};${sw * 3};${sw * 1.6}`} dur="1.2s" repeatCount="2" /></circle>
      </g>
    );
  };

  return (
    <svg aria-hidden="true" data-live-hints="1" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {reduced
        ? todo.slice(0, MAX_STILL).map(it => spot(it, false, 0))
        : (() => { const cur = shown && todo.find(i => i.key === shown.key); return cur ? spot(cur, true, shown!.n) : null; })()}
    </svg>
  );
}
