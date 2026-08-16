// ONDA — the full editor. The Play panel's "Open" leads here.
//
// Everything the Play panel abstracts, shown honestly: three oscillators, sub and noise, two
// filters with routing, the Motion rack, and the spatial position. Every knob is a valid
// modulation target — drag a Motion handle onto any of them and it draws the arc.

import React, { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { deserializePatch, type OndaPatch } from '../../../../services/melos/instruments/onda/patch';
import { E, F, O, P, env, flt, formatParam, osc, paramLabel } from '../../../../services/melos/instruments/onda/params';
import { compileMotions, depthFor, setRoute, type Motion } from '../../../../services/melos/motion';
import { WAVETABLES } from '../../../../services/melos/instruments/onda/wavetables';
import { Knob } from '../shared/Knob';
import { MotionPanel } from './MotionPanel';
import { WavetableDisplay } from './WavetableDisplay';
import { ARMED, PLAYHEAD, SELECT, SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

const OSC_COLORS = ['#D40055', '#B84DFF', '#00DAF3'];

export const OndaEditor: React.FC<Props> = ({ track, onMutate, onClose }) => {
  const [dragging, setDragging] = useState<string | null>(null);

  // NOT memoised on the patch object: the doc is mutated IN PLACE, so the reference never
  // changes and a memo would serve stale data for the rest of the session. Deserialising a
  // patch is cheap; a knob that silently stops updating is not.
  const patch: OndaPatch | null = track.instrument?.patch ? deserializePatch(track.instrument.patch) : null;
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

  /** Edit the Motion list, then recompile onto the engine in the same gesture. */
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

  /** The drop half of the drag-onto-a-knob gesture. */
  const dropOn = useCallback((paramId: number) => {
    const id = dragging;
    if (!id) return;
    setDragging(null);
    editMotions((list) => {
      const m = list.find((x) => x.id === id);
      // A fresh route starts at a third of full travel — audible, but not a slam.
      if (m) setRoute(m, paramId, m.routes.find((r) => r.paramId === paramId) ? 0 : 0.33);
    });
  }, [dragging, editMotions]);

  /** Every knob goes through this so modulation arcs and drop targets are never forgotten. */
  const modKnob = (id: number, label: string, opts: {
    min?: number; max?: number; def?: number; size?: number; color?: string;
    fmt?: (v: number) => string;
  } = {}) => (
    <Knob
      label={label}
      value={val(id, opts.def ?? 0.5)}
      min={opts.min ?? 0}
      max={opts.max ?? 1}
      defaultValue={opts.def ?? 0.5}
      size={opts.size ?? 38}
      color={opts.color}
      format={opts.fmt ?? ((v) => formatParam(id, v))}
      onChange={(v) => setParam(id, v)}
      mod={depthFor(motions, id)}
      dropActive={!!dragging}
      onModDrop={() => dropOn(id)}
    />
  );

  const pos = track.position || [0, 0, -1];
  const setPos = (i: number, v: number) => onMutate((d) => {
    const t = d.arrangement.find((x) => x.id === track.id);
    if (!t) return;
    const p: [number, number, number] = [...(t.position || [0, 0, -1])] as [number, number, number];
    p[i] = v;
    t.position = p;
    BeatsEngine.get().getInstrument(track.id)?.setSpatial({ position: p });
  });

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      // Releasing anywhere that isn't a knob cancels a drag — no stuck state.
      onPointerUp={() => setDragging(null)}
    >
      <div
        className="w-full max-w-6xl max-h-full overflow-y-auto rounded-[22px] border border-white/[0.16] shadow-2xl"
        style={{ background: SURFACE }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0E0E12' }}>
          <span className="font-black text-[13px] tracking-[0.06em] bg-gradient-to-br from-[#B84DFF] to-[#D40055] bg-clip-text text-transparent">ONDA</span>
          <span className="text-[11px] text-white/55">{patch?.name || 'Init'}</span>
          <span className="text-[10px] text-white/25">full editor</span>
          <span className="flex-1" />
          <button onClick={onClose} className="h-7 px-3 rounded-lg text-[11px] border border-white/12 text-white/55 hover:text-white flex items-center gap-1.5">
            <X size={12} /> Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* ── oscillators ── */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {[0, 1, 2].map((o) => {
              const on = val(osc(o, O.ENABLE), o === 0 ? 1 : 0) > 0.5;
              const tableId = patch?.tables?.[o] || WAVETABLES[0].id;
              return (
                <div key={o} className="rounded-2xl border p-3"
                  style={{ borderColor: on ? `${OSC_COLORS[o]}4d` : 'rgba(255,255,255,0.09)', background: SURFACE_RAISED, opacity: on ? 1 : 0.6 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setParam(osc(o, O.ENABLE), on ? 0 : 1)}
                      className="w-3 h-3 rounded-full flex-none"
                      style={{ background: on ? OSC_COLORS[o] : 'transparent', border: `1px solid ${on ? OSC_COLORS[o] : 'rgba(255,255,255,0.3)'}` }}
                      aria-label={`${on ? 'Disable' : 'Enable'} oscillator ${o + 1}`}
                    />
                    <span className="text-[11.5px] font-semibold">OSC {o + 1}</span>
                    <select
                      value={tableId}
                      onChange={(e) => onMutate((d) => {
                        const t = d.arrangement.find((x) => x.id === track.id);
                        const p = t?.instrument?.patch as { tables?: string[] } | undefined;
                        if (!p) return;
                        if (!p.tables) p.tables = [];
                        p.tables[o] = e.target.value;
                      })}
                      className="h-6 rounded-lg bg-black/40 border border-white/10 px-1.5 text-[10px] text-white outline-none flex-1 min-w-0"
                    >
                      {WAVETABLES.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>

                  {on && (
                    <>
                      <WavetableDisplay tableId={tableId} morph={val(osc(o, O.MORPH), 0)} color={OSC_COLORS[o]} height={54} />
                      <div className="flex flex-wrap gap-2.5 justify-around mt-2.5">
                        {modKnob(osc(o, O.MORPH), 'Morph', { color: OSC_COLORS[o], def: 0 })}
                        {modKnob(osc(o, O.LEVEL), 'Level', { def: o === 0 ? 0.8 : 0 })}
                        {modKnob(osc(o, O.COARSE), 'Pitch', { def: 0.5 })}
                        {modKnob(osc(o, O.FINE), 'Fine', { def: 0.5 })}
                        {modKnob(osc(o, O.PAN), 'Pan', { def: 0.5 })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── unison, sub, noise ── */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <div className="rounded-2xl border border-white/10 p-3" style={{ background: SURFACE_RAISED }}>
              <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/35 font-semibold mb-2">Unison</p>
              <div className="flex flex-wrap gap-3 justify-around">
                {modKnob(P.UNISON_COUNT, 'Voices', { def: 0, fmt: (v) => String(Math.round(1 + v * 15)) })}
                {modKnob(P.UNISON_DETUNE, 'Detune', { def: 0.18 })}
                {modKnob(P.UNISON_WIDTH, 'Width', { def: 0.7, color: PLAYHEAD })}
                {modKnob(P.UNISON_BLEND, 'Blend', { def: 0.6 })}
                {modKnob(P.ANALOG_DRIFT, 'Drift', { def: 0.25, color: ARMED })}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 p-3" style={{ background: SURFACE_RAISED }}>
              <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/35 font-semibold mb-2">Sub · Noise · Glide</p>
              <div className="flex flex-wrap gap-3 justify-around">
                {modKnob(P.SUB_LEVEL, 'Sub', { def: 0, color: SELECT })}
                {modKnob(P.NOISE_LEVEL, 'Noise', { def: 0 })}
                {modKnob(P.GLIDE, 'Glide', { def: 0 })}
                {modKnob(P.MASTER_GAIN, 'Level', { def: 0.7 })}
              </div>
            </div>
          </div>

          {/* ── filters ── */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {[0, 1].map((f) => {
              const on = val(flt(f, F.ENABLE), f === 0 ? 1 : 0) > 0.5;
              const isLadder = val(flt(f, F.TYPE), 0) < 0.5;
              return (
                <div key={f} className="rounded-2xl border p-3"
                  style={{ borderColor: on ? `${ARMED}40` : 'rgba(255,255,255,0.09)', background: SURFACE_RAISED, opacity: on ? 1 : 0.6 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setParam(flt(f, F.ENABLE), on ? 0 : 1)}
                      className="w-3 h-3 rounded-full flex-none"
                      style={{ background: on ? ARMED : 'transparent', border: `1px solid ${on ? ARMED : 'rgba(255,255,255,0.3)'}` }}
                      aria-label={`${on ? 'Disable' : 'Enable'} filter ${f + 1}`}
                    />
                    <span className="text-[11.5px] font-semibold">FILTER {f + 1}</span>
                    <button
                      onClick={() => setParam(flt(f, F.TYPE), isLadder ? 1 : 0)}
                      className="h-6 px-2 rounded-lg text-[10px] border border-white/12 text-white/60 hover:text-white"
                      title={isLadder ? 'Moog-style 24dB ladder with drive' : 'State-variable: low, band, high, notch, peak'}
                    >{isLadder ? 'Ladder 24dB' : 'SVF 12dB'}</button>
                    {f === 0 && (
                      <button
                        onClick={() => setParam(P.FILTER_ROUTING, val(P.FILTER_ROUTING, 0) > 0.5 ? 0 : 1)}
                        className="h-6 px-2 rounded-lg text-[10px] border border-white/12 text-white/60 hover:text-white ml-auto"
                      >{val(P.FILTER_ROUTING, 0) > 0.5 ? 'Parallel' : 'Series'}</button>
                    )}
                  </div>
                  {on && (
                    <div className="flex flex-wrap gap-3 justify-around">
                      {modKnob(flt(f, F.CUTOFF), 'Cutoff', { def: 1, color: ARMED })}
                      {modKnob(flt(f, F.RES), 'Reso', { def: 0.1, color: ARMED })}
                      {modKnob(flt(f, F.DRIVE), 'Drive', { def: 0 })}
                      {modKnob(flt(f, F.ENV_AMT), 'Env', { def: 0.5 })}
                      {modKnob(flt(f, F.KEYTRACK), 'Key', { def: 0 })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── amp envelope ── */}
          <div className="rounded-2xl border border-white/10 p-3" style={{ background: SURFACE_RAISED }}>
            <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/35 font-semibold mb-2">
              Amp envelope <span className="normal-case tracking-normal text-white/22">· always per note, never taken by a Motion</span>
            </p>
            <div className="flex flex-wrap gap-3 justify-around">
              {modKnob(env(0, E.ATTACK), 'Attack', { def: 0 , color: PLAYHEAD })}
              {modKnob(env(0, E.DECAY), 'Decay', { def: 0.2, color: PLAYHEAD })}
              {modKnob(env(0, E.SUSTAIN), 'Sustain', { def: 0.8, color: PLAYHEAD })}
              {modKnob(env(0, E.RELEASE), 'Release', { def: 0.15, color: PLAYHEAD })}
            </div>
          </div>

          {/* ── Motion rack ── */}
          <MotionPanel
            motions={motions}
            dragging={dragging}
            unplaced={compiled.unplaced}
            onDragStart={setDragging}
            onChange={editMotions}
          />

          {/* ── spatial ── */}
          <div className="rounded-2xl border p-3" style={{ borderColor: `${PLAYHEAD}47`, background: 'rgba(0,218,243,0.04)' }}>
            <p className="text-[9.5px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: PLAYHEAD }}>
              Spatial · Eclipsa
              <span className="normal-case tracking-normal text-white/25 ml-2">this source has a position, not a pan</span>
            </p>
            <div className="flex gap-5 items-center flex-wrap">
              <div
                className="relative rounded-full flex-none cursor-crosshair"
                style={{ width: 104, height: 104, border: `1px solid ${PLAYHEAD}40` }}
                onPointerDown={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
                  const nz = ((e.clientY - r.top) / r.height) * 2 - 1;
                  setPos(0, Math.max(-1, Math.min(1, nx)));
                  setPos(2, Math.max(-1, Math.min(1, nz)));
                }}
              >
                <div className="absolute rounded-full" style={{ inset: 22, border: `1px solid ${PLAYHEAD}26` }} />
                <div className="absolute w-1.5 h-1.5 rounded-full bg-white/25" style={{ left: '50%', top: '50%', margin: -3 }} />
                <div className="absolute w-3.5 h-3.5 rounded-full" style={{
                  left: `${(pos[0] * 0.5 + 0.5) * 100}%`, top: `${(pos[2] * 0.5 + 0.5) * 100}%`,
                  margin: -7, background: PLAYHEAD, boxShadow: `0 0 14px ${PLAYHEAD}99`,
                }} />
                <span className="absolute text-[8px] text-white/25" style={{ top: 3, left: '50%', transform: 'translateX(-50%)' }}>front</span>
              </div>
              <div className="flex gap-3">
                <Knob label="Height" value={pos[1]} min={-1} max={1} defaultValue={0} size={38} color={PLAYHEAD}
                  format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 90)}°`} onChange={(v) => setPos(1, v)} />
              </div>
              <div className="text-[11px] text-white/45 space-y-0.5">
                <div>Azimuth <span className="font-mono text-white/70">{Math.round(Math.atan2(pos[0], -pos[2]) * 57.3)}°</span></div>
                <div>Distance <span className="font-mono text-white/70">{Math.hypot(pos[0], pos[1], pos[2]).toFixed(2)}</span></div>
                <div className="text-white/25 max-w-[220px] leading-snug">
                  Width spreads in azimuth, so a wide patch stays wide in 7.1.4 and in the Eclipsa export.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
