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
  applyBajoPatch, deserializeBajoPatch, BAJO_EDITOR_GROUPS, flattenGrid, type BajoPatch,
} from '../../../../services/melos/instruments/bajo/patch';
import {
  BAJO_PARAM_META, formatBajoParam, laneParam, gridParam, W, G, O, osc, bajoDefault,
  GATE_BANDS, GATE_STEPS, LANE_LEN,
} from '../../../../services/melos/instruments/bajo/params';
import { BAJO_WAVETABLES } from '../../../../services/melos/instruments/bajo/wavetables';
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
  const patch: BajoPatch | null = deserializeBajoPatch(track.instrument?.patch);

  const val = (id: number, fallback: number) => patch?.params?.[id] ?? fallback;
  const tr = useBajoTransport(patch?.params?.[G.RATE] ?? 1);

  const setParam = useCallback((id: number, value: number) => {
    const inst = BeatsEngine.get().getInstrument(track.id);
    inst?.setParam(id, value);
    // Turning up Osc B level automatically engages Osc B if it wasn't explicitly enabled yet.
    const autoEnableOscB = id === osc(1, O.LEVEL) && value > 0.005 && (patch?.params?.[osc(1, O.ENABLE)] ?? 0) < 0.5;
    if (autoEnableOscB) inst?.setParam(osc(1, O.ENABLE), 1);

    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { params?: Record<number, number> } | undefined;
      if (!p) return;
      if (!p.params) p.params = {};
      p.params[id] = value;
      if (autoEnableOscB) p.params[osc(1, O.ENABLE)] = 1;
    });
  }, [onMutate, patch?.params, track.id]);

  const setWaveTable = useCallback((slot: 0 | 1, tableId: string) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeBajoPatch(raw);
      if (!next) return;
      next.tables = [next.tables[0] || '', next.tables[1] || ''];
      next.tables[slot] = tableId;
      next.params[osc(slot, O.MODE)] = tableId ? 0 : 1;
      if (slot === 1 && tableId) next.params[osc(1, O.ENABLE)] = 1;
      raw.tables = [...next.tables];
      raw.params = Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v]));

      const engine = BeatsEngine.get();
      const inst = engine.getInstrument(track.id);
      if (inst) applyBajoPatch(inst, next);
      else {
        const trk = engine.getDoc().arrangement.find((x) => x.id === track.id);
        if (trk) void engine.ensureInstrument(trk).then((i) => { if (i) applyBajoPatch(i, next); });
      }
    });
  }, [onMutate, track.id]);

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

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3 [&>*]:shrink-0">
        {BAJO_EDITOR_GROUPS.map((group) => (
          <section key={group.key} className="rounded-[14px] border border-white/10 p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: group.color }} />
              <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/45">{group.title}</span>
              <span className="text-[9.5px] text-white/25">{group.blurb}</span>
              {group.key === 'engine' && (
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {([0, 1] as const).map((slot) => (
                    <label key={slot} className="flex items-center gap-1 text-[10px] text-white/50">
                      <span className="font-mono text-[9px] uppercase text-white/35">Osc {slot === 0 ? 'A' : 'B'} Table:</span>
                      <select
                        value={patch.tables[slot] || ''}
                        onChange={(e) => setWaveTable(slot, e.target.value)}
                        className="h-6 rounded-lg bg-black/45 border border-white/12 px-1.5 text-[10px] text-white outline-none"
                      >
                        <option value="">Analog (PolyBLEP)</option>
                        {BAJO_WAVETABLES.map((w) => (
                          <option key={w.id} value={w.id}>{w.name} — {w.journey}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>

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
                if (!meta) return null;
                return (
                  <Knob
                    key={id}
                    label={meta.label}
                    value={val(id, bajoDefault(id))}
                    min={0}
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
