// VELA — the full editor. The Play panel's "Open" leads here.
//
// Everything the Play panel abstracts, shown honestly: the partial layout, the exciter, the
// Veil and the Motion rack. Same two-tier rule as ONDA.
//
// The one structural difference from OndaEditor: the hero is the partial display rather than a
// knob grid, and it is a valid Motion target in its own right. Dropping a Motion handle on it
// routes to inharmonicity, which is the single most expressive route in the instrument — a slow
// Tide on the partial stretch is what turns a static bowl into something that sounds alive.

import React, { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  deserializeVelaPatch, VELA_EDITOR_GROUPS, type VelaPatch,
} from '../../../../services/melos/instruments/vela/patch';
import { M, VELA_PARAM_META, formatVelaParam } from '../../../../services/melos/instruments/vela/params';
import { compileMotions, depthFor, setRoute, type Motion } from '../../../../services/melos/motion';
import { Knob } from '../shared/Knob';
import { MotionPanel } from './MotionPanel';
import { PartialDisplay } from './PartialDisplay';
import { SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

export const VelaEditor: React.FC<Props> = ({ track, onMutate, onClose }) => {
  const [dragging, setDragging] = useState<string | null>(null);

  // Not memoised — the doc mutates in place, same reasoning as OndaEditor.
  const patch: VelaPatch | null = deserializeVelaPatch(track.instrument?.patch);
  const motions: Motion[] = (track.instrument?.patch as { motions?: Motion[] } | undefined)?.motions || [];
  const compiled = compileMotions(motions);

  const val = (id: number, fallback: number) => patch?.params?.[id] ?? fallback;

  const setParam = useCallback((id: number, value: number) => {
    BeatsEngine.get().getInstrument(track.id)?.setParam(id, value);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { params?: Record<number, number> } | undefined;
      if (!p) return;
      if (!p.params) p.params = {};
      p.params[id] = value;
    });
  }, [onMutate, track.id]);

  const editMotions = useCallback((fn: (list: Motion[]) => void) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { motions?: Motion[] } | undefined;
      if (!p) return;
      if (!p.motions) p.motions = [];
      fn(p.motions);

      const inst = BeatsEngine.get().getInstrument(track.id);
      if (inst) {
        const c = compileMotions(p.motions);
        if (c.params.length) inst.setParams(c.params);
        for (const [i, src, dest, depth, via] of c.routes) inst.setRoute(i, src, dest, depth, via);
      }
    });
  }, [onMutate, track.id]);

  /** The drop half of the drag-onto-a-control gesture. Toggles, matching OndaEditor: dropping
   *  the same Motion on the same control again removes the route rather than stacking one. */
  const dropMotion = useCallback((paramId: number) => {
    if (!dragging) return;
    editMotions((list) => {
      const m = list.find((x) => x.id === dragging);
      if (m) setRoute(m, paramId, m.routes.find((r) => r.paramId === paramId) ? 0 : 0.33);
    });
    setDragging(null);
  }, [dragging, editMotions]);

  if (!patch) return null;

  return (
    <div className="absolute inset-0 z-[55] flex flex-col" style={{ background: SURFACE }}>
      <div className="flex items-center gap-3 px-4 h-12 flex-none border-b border-white/10" style={{ background: SURFACE_RAISED }}>
        <span className="font-black text-[11px] tracking-[0.16em]" style={{ color: '#D0BCFF' }}>VELA</span>
        <span className="text-white/25">·</span>
        <span className="text-[12px] font-semibold text-white truncate">{patch.name}</span>
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close editor" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        <PartialDisplay
          partials={val(M.PARTIALS, 0.5)}
          inharm={val(M.INHARM, 0.04)}
          spread={val(M.SPREAD, 0.12)}
          decay={val(M.DECAY, 0.45)}
          decayTilt={val(M.DECAY_TILT, 0.5)}
          material={val(M.MATERIAL, 0)}
          position={val(M.POSITION, 0.28)}
          height={152}
          dropActive={!!dragging}
          onModDrop={() => dropMotion(M.INHARM)}
        />

        {VELA_EDITOR_GROUPS.map((group) => (
          <section key={group.key} className="rounded-[14px] border border-white/10 p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: group.color }} />
              <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/45">{group.title}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))' }}>
              {group.ids.map((id) => {
                const meta = VELA_PARAM_META[id];
                if (!meta) return null;
                return (
                  <Knob
                    key={id}
                    label={meta.label}
                    value={val(id, 0.5)}
                    min={0}
                    // Stepped controls are stored as raw indices, matching the Rust enums, so
                    // their range is the option count rather than 0..1.
                    max={meta.options && id !== M.PARTIALS ? meta.options.length - 1 : 1}
                    color={group.color}
                    size={44}
                    format={(v) => formatVelaParam(id, v)}
                    onChange={(v) => setParam(id, v)}
                    mod={depthFor(motions, id)}
                    dropActive={!!dragging}
                    onModDrop={() => dropMotion(id)}
                  />
                );
              })}
            </div>
          </section>
        ))}

        <MotionPanel
          motions={motions}
          dragging={dragging}
          unplaced={compiled.unplaced}
          onDragStart={setDragging}
          onChange={editMotions}
        />
      </div>
    </div>
  );
};
