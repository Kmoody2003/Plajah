// One automation-lane editor for every breakpoint lane in the studio: track automation under a
// Timeline track (volume, pan, sends, macros, MIDI CCs) and the piano roll's CC / pitch-bend lanes.
//
// Grammar (Bitwig / Studio One): drag on empty lane = draw (pencil, writes points on the grid) ·
// double-click = add a point · drag a point = move it (grid-snapped; Shift = free) · right-click a
// point = curve shape / delete · Alt-click a point = delete. Values are native units (automation.ts).

import React, { useMemo, useRef } from 'react';
import type { AutomationCurve, AutomationPoint, AutomationTarget } from '../../../../services/melos/beats/grooveDoc';
import { laneValueAt, shape, targetSpec } from '../../../../services/melos/beats/automation';
import { useContextMenu } from '../../../ui/ContextMenu';

const CURVES: { id: AutomationCurve; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'smooth', label: 'Smooth (S-curve)' },
  { id: 'ease-in', label: 'Ease in' },
  { id: 'ease-out', label: 'Ease out' },
  { id: 'hold', label: 'Hold (step)' },
];

export interface AutomationLaneEditorProps {
  target: AutomationTarget;
  points: AutomationPoint[];
  /** Lane x origin: the beat drawn at x = 0 (song beats for tracks, content beats for clips). */
  originBeat: number;
  widthBeats: number;
  pxPerBeat: number;
  height: number;
  /** Grid snap for a beat in this lane's coordinates (Shift → bypass is handled by the caller). */
  snap: (beat: number, e?: { shiftKey?: boolean }) => number;
  /** Grid cell at a beat — the freehand pencil writes one point per cell. */
  cell: (beat: number) => number;
  onChange: (points: AutomationPoint[]) => void;
  /** Optional shading of regions that don't play (piano roll: content outside the clip window). */
  dimmed?: { from: number; to: number }[];
  /** Live value marker (e.g. the playhead's position) in lane beats. */
  cursorBeat?: number | null;
}

export const AutomationLaneEditor: React.FC<AutomationLaneEditorProps> = (p) => {
  const spec = targetSpec(p.target);
  const ref = useRef<HTMLDivElement>(null);
  const pad = 4;
  const H = p.height;
  const yOf = (v: number) => pad + (1 - (v - spec.min) / (spec.max - spec.min)) * (H - pad * 2);
  const vOf = (y: number) => {
    const v = spec.min + (1 - (y - pad) / (H - pad * 2)) * (spec.max - spec.min);
    const c = Math.max(spec.min, Math.min(spec.max, v));
    return spec.stepped ? (c >= (spec.min + spec.max) / 2 ? spec.max : spec.min) : c;
  };
  const xOf = (b: number) => (b - p.originBeat) * p.pxPerBeat;
  const bOf = (x: number) => p.originBeat + x / p.pxPerBeat;
  const sorted = useMemo(() => p.points.slice().sort((a, b) => a.beat - b.beat), [p.points]);

  // The drawn curve: sampled through the same shape() the engine plays.
  const path = useMemo(() => {
    if (!sorted.length) return '';
    const segs: string[] = [`M 0 ${yOf(sorted[0].value)}`];
    sorted.forEach((pt, i) => {
      const next = sorted[i + 1];
      segs.push(`L ${xOf(pt.beat)} ${yOf(pt.value)}`);
      if (!next) return;
      if (pt.curve === 'hold' || spec.stepped) { segs.push(`L ${xOf(next.beat)} ${yOf(pt.value)}`); return; }
      if (pt.curve && pt.curve !== 'linear') {
        for (let k = 1; k < 16; k++) {
          const b = pt.beat + (next.beat - pt.beat) * (k / 16);
          segs.push(`L ${xOf(b)} ${yOf(pt.value + (next.value - pt.value) * shape(pt.curve, k / 16))}`);
        }
      }
    });
    segs.push(`L ${p.widthBeats * p.pxPerBeat} ${yOf(sorted[sorted.length - 1].value)}`);
    return segs.join(' ');
  }, [sorted, p.pxPerBeat, p.originBeat, p.widthBeats, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pointMenu = useContextMenu<number>((i) => {
    const pt = sorted[i];
    if (!pt) return [];
    return [
      { kind: 'header', label: `${spec.label} · ${spec.format(pt.value)}` },
      ...(spec.stepped ? [] : CURVES.map((c) => ({
        id: c.id, label: c.label, checked: (pt.curve ?? 'linear') === c.id,
        onSelect: () => p.onChange(sorted.map((x, j) => (j === i ? { ...x, curve: c.id } : x))),
      }))),
      { kind: 'separator' as const },
      { id: 'del', label: 'Delete point', danger: true, onSelect: () => p.onChange(sorted.filter((_, j) => j !== i)) },
      { id: 'clear', label: 'Clear lane', danger: true, onSelect: () => p.onChange([]) },
    ];
  });

  /** Drag a point (index into `sorted`). */
  const dragPoint = (i: number, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.altKey) { p.onChange(sorted.filter((_, j) => j !== i)); return; }
    const base = sorted;
    const move = (ev: PointerEvent) => {
      const { x, y } = local(ev);
      const beat = Math.max(0, ev.shiftKey ? bOf(x) : p.snap(bOf(x), ev));
      const next = base.map((pt, j) => (j === i ? { ...pt, beat, value: vOf(y) } : pt)).sort((a, b) => a.beat - b.beat);
      p.onChange(next);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  /** Freehand pencil on the empty lane: one point per grid cell along the stroke. */
  const draw = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = local(e);
    let lastBeat = p.snap(bOf(start.x), e);
    let pts = sorted.slice();
    const write = (beat: number, value: number) => {
      const c = p.cell(beat) / 2;
      pts = pts.filter((pt) => Math.abs(pt.beat - beat) >= c - 1e-9);
      pts.push({ beat, value });
      pts.sort((a, b) => a.beat - b.beat);
    };
    write(Math.max(0, lastBeat), vOf(start.y));
    p.onChange(pts);
    const move = (ev: PointerEvent) => {
      const { x, y } = local(ev);
      const beat = Math.max(0, ev.shiftKey ? bOf(x) : p.snap(bOf(x), ev));
      if (Math.abs(beat - lastBeat) < 1e-9 && !ev.shiftKey) {
        // Same cell: just update its value.
        write(beat, vOf(y));
      } else {
        // Clear everything the stroke passed over, then write the new point.
        const lo = Math.min(beat, lastBeat), hi = Math.max(beat, lastBeat);
        pts = pts.filter((pt) => pt.beat <= lo + 1e-9 || pt.beat >= hi - 1e-9);
        write(beat, vOf(y));
        lastBeat = beat;
      }
      p.onChange(pts);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const cursorVal = p.cursorBeat != null && sorted.length ? laneValueAt({ target: p.target, points: sorted }, p.cursorBeat) : undefined;
  const W = p.widthBeats * p.pxPerBeat;
  return (
    <div
      ref={ref}
      className="relative cursor-crosshair select-none"
      style={{ width: W, height: H }}
      onPointerDown={draw}
      onDoubleClick={(e) => {
        const { x, y } = local(e);
        const beat = Math.max(0, p.snap(bOf(x), e));
        p.onChange([...sorted.filter((pt) => Math.abs(pt.beat - beat) > 1e-9), { beat, value: vOf(y) }].sort((a, b) => a.beat - b.beat));
      }}
      title={`${spec.label} — drag to draw · double-click to add · drag points (Shift = free) · right-click a point for curve/delete`}
    >
      {p.dimmed?.map((r, i) => (
        <span key={i} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: xOf(r.from), width: Math.max(0, (r.to - r.from) * p.pxPerBeat), background: 'rgba(0,0,0,0.35)' }} />
      ))}
      {/* rest line (the value when nothing is drawn) */}
      <span className="absolute left-0 right-0 h-px pointer-events-none" style={{ top: yOf(spec.rest), background: 'rgba(255,255,255,0.08)' }} />
      <svg className="absolute inset-0 pointer-events-none" width={W} height={H} aria-hidden="true">
        {path && <path d={path} fill="none" stroke={spec.color} strokeWidth={1.5} strokeOpacity={0.9} />}
        {path && <path d={`${path} L ${W} ${H} L 0 ${H} Z`} fill={spec.color} fillOpacity={0.07} stroke="none" />}
      </svg>
      {sorted.map((pt, i) => (
        <span
          key={i}
          onPointerDown={(e) => dragPoint(i, e)}
          onContextMenu={pointMenu.bind(i).onContextMenu}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute w-[8px] h-[8px] -ml-[4px] -mt-[4px] rounded-full border cursor-grab"
          style={{ left: xOf(pt.beat), top: yOf(pt.value), background: spec.color, borderColor: '#0B0710' }}
          title={`${spec.format(pt.value)}${pt.curve && pt.curve !== 'linear' ? ` · ${pt.curve}` : ''} — Alt-click to delete`}
        />
      ))}
      {cursorVal !== undefined && p.cursorBeat != null && (
        <span className="absolute text-[8px] font-mono px-1 rounded pointer-events-none" style={{ left: xOf(p.cursorBeat) + 4, top: 1, color: spec.color, background: 'rgba(11,7,16,0.8)' }}>
          {spec.format(cursorVal)}
        </span>
      )}
      {pointMenu.node}
    </div>
  );
};
