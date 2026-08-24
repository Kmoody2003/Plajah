// BAJO — the full editor. The Play panel's "Open" leads here.
//
// Seven sections, in signal order: Engine → String → Filter + Throat → Wobble → Ghost Gate →
// Scorch → Space. The two sections that are not knob grids — the rate lane and the gate grid —
// get their real editors rather than a row of numbers, because they are patterns and a pattern
// drawn as sixteen values is not a pattern anyone can read.

import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  deserializeBajoPatch, BAJO_EDITOR_GROUPS, flattenGrid, type BajoPatch,
} from '../../../../services/melos/instruments/bajo/patch';
import {
  BAJO_PARAM_META, formatBajoParam, laneParam, gridParam, W, G, bajoDefault,
  GATE_BANDS, GATE_STEPS, LANE_LEN,
} from '../../../../services/melos/instruments/bajo/params';
import { Knob } from '../shared/Knob';
import { WobbleLane, LANE_PRESETS } from './WobbleLane';
import { GhostGateGrid, GATE_PRESETS, buildGrid } from './GhostGateGrid';
import { useBajoTransport } from './useBajoTransport';
import { SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

const ACCENT = '#FF4B1C';

export const BajoEditor: React.FC<Props> = ({ track, onMutate, onClose }) => {
  // Not memoised — the doc mutates in place, same reasoning as OndaEditor and VelaEditor.
  const patch: BajoPatch | null = deserializeBajoPatch(track.instrument?.patch);

  const val = (id: number, fallback: number) => patch?.params?.[id] ?? fallback;
  const tr = useBajoTransport(patch?.params?.[G.RATE] ?? 1);

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

  /** The lane and the grid live outside `params` because that is the shape the UI edits — but
   *  they still reach the engine as plain param ids, which is why neither needed a bespoke ABI
   *  call. Both are written at fixed length so a cleared slot writes a value, never undefined. */
  const setLane = useCallback((lane: number[]) => {
    const inst = BeatsEngine.get().getInstrument(track.id);
    for (let i = 0; i < LANE_LEN; i++) inst?.setParam(laneParam(i), lane[i] ?? 6);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { lane?: number[] } | undefined;
      if (p) p.lane = [...lane];
    });
  }, [onMutate, track.id]);

  const setGrid = useCallback((grid: number[][]) => {
    const inst = BeatsEngine.get().getInstrument(track.id);
    for (let b = 0; b < GATE_BANDS; b++) {
      for (let s = 0; s < GATE_STEPS; s++) inst?.setParam(gridParam(b, s), grid[b]?.[s] ? 1 : 0);
    }
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { grid?: number[] } | undefined;
      // Flat: this object is what Firestore stores, and it rejects an array of arrays.
      if (p) p.grid = flattenGrid(grid);
    });
  }, [onMutate, track.id]);

  if (!patch) return null;

  const wobbleOn = val(W.ENABLE, 0) > 0.5;
  const gateOn = val(G.ENABLE, 0) > 0.5;

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: SURFACE }}>
      <div className="flex items-center gap-3 px-4 h-12 flex-none border-b border-white/10" style={{ background: SURFACE_RAISED }}>
        <span className="font-black text-[11px] tracking-[0.16em]" style={{ color: ACCENT }}>BAJO</span>
        <span className="text-white/25">·</span>
        <span className="text-[12px] font-semibold text-white truncate">{patch.name}</span>
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close editor" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
        {BAJO_EDITOR_GROUPS.map((group) => (
          <section key={group.key} className="rounded-[14px] border border-white/10 p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: group.color }} />
              <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/45">{group.title}</span>
              <span className="text-[9.5px] text-white/25">{group.blurb}</span>
            </div>

            {/* The rate lane sits inside the Wobble section, above its knobs — the knobs shape
                the curve the lane is playing, so they belong together. */}
            {group.key === 'wobble' && (
              <div className="mb-3 flex flex-col gap-1.5">
                <WobbleLane
                  lane={patch.lane}
                  onChange={setLane}
                  shape={val(W.SHAPE, 0)}
                  skew={val(W.SKEW, 0.5)}
                  smooth={val(W.SMOOTH, 0.1)}
                  accent={wobbleOn ? ACCENT : '#4B4658'}
                  height={84}
                  playStep={wobbleOn ? tr.laneStep : -1}
                />
                <div className="flex gap-1 flex-wrap">
                  {LANE_PRESETS.map((lp) => (
                    <button
                      key={lp.name}
                      onClick={() => setLane([...lp.lane])}
                      className="text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border border-white/10 text-white/45 hover:text-white hover:border-white/25"
                    >
                      {lp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {group.key === 'gate' && (
              <div className="mb-3 flex flex-col gap-1.5">
                <GhostGateGrid grid={patch.grid} onChange={setGrid} playStep={gateOn ? tr.gateCell : -1} />
                <div className="flex gap-1 flex-wrap">
                  {GATE_PRESETS.map((gp) => (
                    <button
                      key={gp.name}
                      onClick={() => setGrid(buildGrid(gp.fn))}
                      className="text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border border-white/10 text-white/45 hover:text-white hover:border-white/25"
                    >
                      {gp.name}
                    </button>
                  ))}
                </div>
                {!gateOn && (
                  <p className="text-[10px] text-white/30">
                    The gate is off — switch it on to hear the pattern.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))' }}>
              {group.ids.map((id) => {
                const meta = BAJO_PARAM_META[id];
                // Ids without BAJO metadata are ONDA's shared controls; the shared editor
                // already labels those, so this grid only draws what it can name.
                if (!meta) return null;
                return (
                  <Knob
                    key={id}
                    label={meta.label}
                    // A control a preset never set reads at the ENGINE's default for that id,
                    // not at the middle of its range — which is what had the editor saying
                    // "Square" while the engine played "Saw".
                    value={val(id, bajoDefault(id))}
                    min={0}
                    // Stepped controls are stored as raw indices, matching the Rust enums, so
                    // their range is the option count rather than 0..1.
                    max={meta.options ? meta.options.length - 1 : 1}
                    color={group.color}
                    size={44}
                    format={(v) => (meta.toggle ? (v > 0.5 ? 'on' : 'off') : formatBajoParam(id, v))}
                    onChange={(v) => setParam(id, meta.toggle ? (v > 0.5 ? 1 : 0) : v)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
