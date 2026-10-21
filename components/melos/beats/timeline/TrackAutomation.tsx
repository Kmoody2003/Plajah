// A track's automation lanes, expanded under it in the Timeline (Bitwig/Studio One): one row per
// lane — target, live value, automation mode, remove — over the shared AutomationLaneEditor, and
// an "add lane" row listing what this track can automate.

import React from 'react';
import { Plus, X } from 'lucide-react';
import type { ArrangeTrack, AutomationMode, AutomationPoint, GrooveDoc, TrackAutomationLane } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { laneValueAt, staticValue, targetKey, targetSpec, trackLaneTargets } from '../../../../services/melos/beats/automation';
import { useContextMenu } from '../../../ui/ContextMenu';
import { AutomationLaneEditor } from './AutomationLaneEditor';

export const AUTOMATION_LANE_H = 54;

const MODES: { id: AutomationMode; label: string; tip: string; color: string }[] = [
  { id: 'read', label: 'Read', tip: 'Play the lanes', color: '#06D6A0' },
  { id: 'touch', label: 'Touch', tip: 'Write while you move a control, then return to the lane', color: '#FFD166' },
  { id: 'latch', label: 'Latch', tip: 'Write from your first move until the transport stops', color: '#FF8C00' },
  { id: 'write', label: 'Write', tip: 'Overwrite every automated control for the whole pass', color: '#FF4D8D' },
];

export const TrackAutomation: React.FC<{
  doc: GrooveDoc;
  track: ArrangeTrack;
  headerW: number;
  pxPerBeat: number;
  contentBeats: number;
  snap: (beat: number, e?: { shiftKey?: boolean }) => number;
  cell: (beat: number) => number;
  cursorBeat: number | null;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}> = ({ doc, track, headerW, pxPerBeat, contentBeats, snap, cell, cursorBeat, onMutate }) => {
  const lanes = track.automationLanes ?? [];
  const mode = track.automationMode ?? 'read';
  const modeSpec = MODES.find((m) => m.id === mode)!;

  const editTrack = (fn: (t: ArrangeTrack) => void) => onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) fn(t); });
  const setPoints = (laneId: string, pts: AutomationPoint[]) => editTrack((t) => {
    const l = t.automationLanes?.find((x) => x.id === laneId);
    if (l) l.points = pts;
  });

  const addMenu = useContextMenu<void>(() => {
    const used = new Set(lanes.map((l) => targetKey(l.target)));
    const avail = trackLaneTargets(track).filter((t) => !used.has(targetKey(t)));
    return [
      { kind: 'header', label: `Automate ${track.name}` },
      ...avail.map((t) => ({
        id: targetKey(t), label: targetSpec(t).label,
        onSelect: () => editTrack((x) => {
          // A new lane starts flat at the control's current value, so adding it changes nothing.
          (x.automationLanes ??= []).push({ id: grooveUid(), target: t, points: [{ beat: 0, value: staticValue(x, t) }] });
          x.showAutomation = true;
        }),
      })),
      ...(avail.length ? [] : [{ id: 'none', label: 'Every control is already automated', disabled: true }]),
    ];
  });
  const modeMenu = useContextMenu<void>(() => [
    { kind: 'header', label: 'Automation mode' },
    ...MODES.map((m) => ({ id: m.id, label: `${m.label} — ${m.tip}`, checked: mode === m.id, onSelect: () => editTrack((t) => { t.automationMode = m.id; }) })),
  ]);

  const row = (lane: TrackAutomationLane) => {
    const spec = targetSpec(lane.target);
    const v = cursorBeat !== null ? laneValueAt(lane, cursorBeat) : undefined;
    return (
      <div key={lane.id} className="flex border-b border-white/[0.04]" style={{ height: AUTOMATION_LANE_H }}>
        <div className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 pl-6 pr-2 bg-[#0B0812] border-r border-white/10" style={{ width: headerW, minWidth: headerW }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-[6px] h-[6px] rounded-full flex-none" style={{ background: spec.color }} />
            <span className="text-[10px] text-white/70 truncate flex-1">{spec.label}</span>
            <button onClick={() => editTrack((t) => { t.automationLanes = (t.automationLanes ?? []).filter((l) => l.id !== lane.id); if (!t.automationLanes.length) delete t.automationLanes; })}
              className="w-4 h-4 grid place-items-center text-white/30 hover:text-[#EF4444] flex-none" aria-label={`Remove ${spec.label} automation`} title="Remove this lane"><X size={10} /></button>
          </div>
          <span className="text-[9px] font-mono text-white/35">{v !== undefined ? spec.format(v) : `${lane.points.length} pts`}</span>
        </div>
        <div className="relative flex-1">
          <AutomationLaneEditor
            target={lane.target}
            points={lane.points}
            originBeat={0}
            widthBeats={contentBeats}
            pxPerBeat={pxPerBeat}
            height={AUTOMATION_LANE_H - 1}
            snap={snap}
            cell={cell}
            onChange={(pts) => setPoints(lane.id, pts)}
            cursorBeat={cursorBeat}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      {lanes.map(row)}
      <div className="flex border-b border-white/[0.06]" style={{ height: 22 }}>
        <div className="sticky left-0 z-10 flex items-center gap-1.5 pl-6 pr-2 bg-[#0B0812] border-r border-white/10" style={{ width: headerW, minWidth: headerW }}>
          <button onClick={(e) => addMenu.openFrom(e.currentTarget, undefined)} className="flex items-center gap-1 text-[9.5px] text-white/45 hover:text-white"><Plus size={10} /> Lane</button>
          <span className="flex-1" />
          <button onClick={(e) => modeMenu.openFrom(e.currentTarget, undefined)} title={`Automation mode: ${modeSpec.label} — ${modeSpec.tip}`}
            className="h-4 px-1.5 rounded text-[8.5px] font-semibold uppercase tracking-wide border"
            style={{ color: modeSpec.color, borderColor: `${modeSpec.color}66`, background: mode === 'read' ? 'transparent' : `${modeSpec.color}18` }}
          >{modeSpec.label}</button>
        </div>
        <div className="flex-1" />
      </div>
      {addMenu.node}
      {modeMenu.node}
    </>
  );
};
