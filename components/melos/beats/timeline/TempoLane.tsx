// The Timeline's tempo track (Bitwig/Studio One tempo lane) and the meter-aware grid overlay.
//
// TempoLane: the curve of doc.bpm (beat 0) + doc.tempoMap. Drag a point to change its tempo
// (vertical) or move it (horizontal, grid-snapped; Shift = free). Double-click the lane to add a
// point; right-click a point to toggle a ramp into the next point or delete it.
// TimelineGrid: bar / count / subdivision lines from the meter map + snap grid, drawn once
// behind every lane (lanes are transparent), so odd meters and meter changes read correctly.

import React, { useMemo, useRef } from 'react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import type { MeterMap, TempoPoint } from '../../../../services/melos/beats/tempoMap';
import { TempoMap } from '../../../../services/melos/beats/tempoMap';
import { gridLines, snapBeat, type GridSettings } from '../../../../services/melos/beats/snapGrid';
import { useContextMenu } from '../../../ui/ContextMenu';

const TEMPO_H = 46;
const TEMPO_COLOR = '#FFD166';

interface Knot { beat: number; bpm: number; ramp: boolean; index: number /* -1 = doc.bpm at beat 0 */ }

const knotsOf = (doc: GrooveDoc): Knot[] => [
  { beat: 0, bpm: doc.bpm, ramp: false, index: -1 },
  ...(doc.tempoMap ?? [])
    .map((pt, index) => ({ beat: pt.beat, bpm: pt.bpm, ramp: !!pt.ramp, index }))
    .sort((a, b) => a.beat - b.beat),
];

const clampBpm = (b: number) => Math.max(20, Math.min(300, Math.round(b * 10) / 10));

export const TempoLane: React.FC<{
  doc: GrooveDoc;
  meter: MeterMap;
  grid: GridSettings;
  pxPerBeat: number;
  contentBeats: number;
  headerW: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}> = ({ doc, meter, grid, pxPerBeat, contentBeats, headerW, onMutate }) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const knots = knotsOf(doc);
  const bpms = knots.map((k) => k.bpm);
  const lo = Math.max(20, Math.floor((Math.min(...bpms) - 12) / 10) * 10);
  const hi = Math.min(300, Math.ceil((Math.max(...bpms) + 12) / 10) * 10);
  const yOf = (bpm: number) => 4 + (1 - (bpm - lo) / Math.max(1, hi - lo)) * (TEMPO_H - 8);
  const bpmOfY = (y: number) => lo + (1 - (y - 4) / (TEMPO_H - 8)) * (hi - lo);
  const width = contentBeats * pxPerBeat;

  // Polyline: steps hold until the next point; ramps glide (drawn sampled — the ramp is linear in
  // beats, which is a straight line here since x is beats).
  const path = useMemo(() => {
    const segs: string[] = [];
    knots.forEach((k, i) => {
      const next = knots[i + 1];
      const x0 = k.beat * pxPerBeat, y0 = yOf(k.bpm);
      segs.push(`${i ? 'L' : 'M'} ${x0} ${y0}`);
      if (!next) { segs.push(`L ${width} ${y0}`); return; }
      const x1 = next.beat * pxPerBeat;
      segs.push(k.ramp ? `L ${x1} ${yOf(next.bpm)}` : `L ${x1} ${y0}`);
    });
    return segs.join(' ');
  }, [knots, pxPerBeat, width, lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const writePoint = (d: GrooveDoc, k: Knot, beat: number, bpm: number) => {
    if (k.index < 0) { d.bpm = clampBpm(bpm); return; }
    const pt = d.tempoMap?.[k.index];
    if (!pt) return;
    pt.beat = Math.max(1 / 64, beat);
    pt.bpm = clampBpm(bpm);
  };

  const startDrag = (k: Knot, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const body = bodyRef.current; if (!body) return;
    const rect = body.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const rawBeat = (ev.clientX - rect.left) / pxPerBeat;
      const beat = k.index < 0 ? 0 : snapBeat(rawBeat, grid, meter, pxPerBeat, { bypass: ev.shiftKey || ev.altKey });
      const bpm = bpmOfY(ev.clientY - rect.top);
      onMutate((d) => writePoint(d, k, beat, bpm));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      // Keep the stored list ordered and free of points stacked on the same beat.
      onMutate((d) => {
        if (!d.tempoMap) return;
        d.tempoMap.sort((a, b) => a.beat - b.beat);
        d.tempoMap = d.tempoMap.filter((pt, i, a) => i === 0 || Math.abs(pt.beat - a[i - 1].beat) > 1e-6);
      });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const pointMenu = useContextMenu<Knot>((k) => [
    { kind: 'header', label: `${k.bpm.toFixed(1)} BPM · bar ${meter.formatPosition(k.beat)}` },
    {
      id: 'ramp', label: 'Ramp to next point', checked: k.ramp, disabled: k.index < 0 || !knots.some((x) => x.beat > k.beat),
      onSelect: () => onMutate((d) => { const pt = d.tempoMap?.[k.index]; if (pt) pt.ramp = !pt.ramp; }),
    },
    { kind: 'separator' },
    {
      id: 'del', label: k.index < 0 ? 'Clear tempo track' : 'Delete point', danger: true,
      disabled: k.index < 0 && !(doc.tempoMap?.length),
      onSelect: () => onMutate((d) => {
        if (k.index < 0) { delete d.tempoMap; return; }
        d.tempoMap = (d.tempoMap ?? []).filter((_, i) => i !== k.index);
        if (!d.tempoMap.length) delete d.tempoMap;
      }),
    },
  ]);

  const addPoint = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const beat = snapBeat((e.clientX - rect.left) / pxPerBeat, grid, meter, pxPerBeat, { bypass: e.shiftKey || e.altKey });
    if (beat <= 1e-6) return;
    const bpm = clampBpm(bpmOfY(e.clientY - rect.top));
    onMutate((d) => {
      const pts: TempoPoint[] = [...(d.tempoMap ?? []).filter((pt) => Math.abs(pt.beat - beat) > 1e-6), { beat, bpm }];
      d.tempoMap = pts.sort((a, b) => a.beat - b.beat);
    });
  };

  const tempo = TempoMap.fromDoc(doc);

  return (
    <div className="flex border-b border-white/[0.06]" style={{ height: TEMPO_H }}>
      <div className="sticky left-0 z-10 flex flex-col justify-center px-3 bg-[#0E0916] border-r border-white/10" style={{ width: headerW, minWidth: headerW }}>
        <span className="text-[10.5px] font-semibold" style={{ color: TEMPO_COLOR }}>Tempo</span>
        <span className="text-[9px] font-mono text-white/35 truncate">
          {tempo.isConstant ? `${doc.bpm.toFixed(1)} BPM · constant` : `${Math.min(...bpms).toFixed(0)}–${Math.max(...bpms).toFixed(0)} BPM · ${knots.length} pts`}
        </span>
      </div>
      <div
        ref={bodyRef}
        className="relative flex-1 cursor-crosshair"
        onDoubleClick={addPoint}
        title="Double-click to add a tempo point · drag points (Shift = no snap) · right-click a point for ramp/delete"
      >
        <svg className="absolute inset-0 pointer-events-none" width={width} height={TEMPO_H} aria-hidden="true">
          <path d={path} fill="none" stroke={TEMPO_COLOR} strokeOpacity={0.85} strokeWidth={1.5} />
        </svg>
        {knots.map((k) => (
          <span
            key={`${k.index}`}
            onPointerDown={(e) => startDrag(k, e)}
            onContextMenu={pointMenu.bind(k).onContextMenu}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute w-[9px] h-[9px] -ml-[4.5px] -mt-[4.5px] rounded-full border cursor-grab"
            style={{ left: k.beat * pxPerBeat, top: yOf(k.bpm), background: k.index < 0 ? '#0E0916' : TEMPO_COLOR, borderColor: TEMPO_COLOR }}
            title={`${k.bpm.toFixed(1)} BPM${k.ramp ? ' · ramps to next' : ''}`}
          />
        ))}
      </div>
      {pointMenu.node}
    </div>
  );
};

/** Bar / count / grid-subdivision lines behind the lanes. */
export const TimelineGrid: React.FC<{
  meter: MeterMap;
  grid: GridSettings;
  pxPerBeat: number;
  contentBeats: number;
  left: number;
}> = ({ meter, grid, pxPerBeat, contentBeats, left }) => {
  const lines = useMemo(() => gridLines(meter, 0, contentBeats, pxPerBeat, grid), [meter, grid, pxPerBeat, contentBeats]);
  const width = contentBeats * pxPerBeat;
  const d = (xs: number[]) => xs.map((b) => `M ${Math.round(b * pxPerBeat) + 0.5} 0 V 1`).join(' ');
  return (
    <svg className="absolute top-0 bottom-0 pointer-events-none" style={{ left, width, height: '100%' }} viewBox={`0 0 ${width} 1`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d(lines.subs)} stroke="rgba(255,255,255,0.025)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d={d(lines.beats)} stroke="rgba(255,255,255,0.045)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d={d(lines.bars.map((b) => b.beat))} stroke="rgba(255,255,255,0.09)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
