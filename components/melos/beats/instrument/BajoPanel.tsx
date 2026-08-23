// BAJO — the Play surface.
//
// The hero control is the wobble rate lane, for the same reason VELA's is the partial display:
// it is the thing the instrument is FOR. A bass synth whose Play panel leads with a filter knob
// is a synth that happens to be playing low notes.
//
// Four macros under it — Weight, Grit, Wobble, Space — and a preset name. Everything else is one
// click away in the editor, same as ONDA and VELA.

import React, { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  deserializeBajoPatch, applyBajoPreset, bajoEngineParams,
  BAJO_MACRO_HINTS, BAJO_MACRO_LABELS, BAJO_MACRO_ORDER, type BajoPatch,
} from '../../../../services/melos/instruments/bajo/patch';
import { BAJO_PRESETS, type BajoMacro } from '../../../../services/melos/instruments/bajo/presets';
import { W, G } from '../../../../services/melos/instruments/bajo/params';
import { Knob } from '../shared/Knob';
import { WobbleLane, LANE_PRESETS } from './WobbleLane';
import { BajoEditor } from './BajoEditor';
import { SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

export const BAJO_ACCENT = '#FF4B1C';

/** Magma for the destructive half, resin for the acoustic half — the same duality the
 *  instrument's two ends are built around. */
const MACRO_COLORS: Record<BajoMacro, string> = {
  weight: '#E0A85C',
  grit: BAJO_ACCENT,
  wobble: BAJO_ACCENT,
  space: '#63C9DE',
};

export const BajoPanel: React.FC<Props> = ({ track, onMutate, onClose }) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Deliberately not memoised, for the same reason as ONDA's and VELA's panels: the doc mutates
  // in place, so a memo keyed on the patch object would never invalidate and every control
  // would freeze.
  const patch: BajoPatch | null = deserializeBajoPatch(track.instrument?.patch);

  const pushParams = useCallback((p: BajoPatch) => {
    const inst = BeatsEngine.get().getInstrument(track.id);
    if (inst) inst.setParams(bajoEngineParams(p));
  }, [track.id]);

  /** Edit the patch in place and push the result. One path for every control on the panel. */
  const edit = useCallback((fn: (p: BajoPatch) => void) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeBajoPatch(raw);
      if (!next) return;
      fn(next);
      raw.macros = { ...next.macros };
      raw.lane = [...next.lane];
      raw.grid = next.grid.map((row) => [...row]);
      raw.params = Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v]));
      pushParams(next);
    });
  }, [onMutate, pushParams, track.id]);

  const choosePreset = useCallback((presetId: string) => {
    const preset = BAJO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      const current = deserializeBajoPatch(t.instrument.patch);
      if (!current) return;
      const next = applyBajoPreset(current, preset);
      t.instrument.patch = {
        ...next,
        params: Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v])),
        lane: [...next.lane],
        grid: next.grid.map((row) => [...row]),
      } as unknown as Record<string, unknown>;
      t.instrument.presetName = preset.name;
      t.name = preset.name;
      pushParams(next);
    });
    setGalleryOpen(false);
  }, [onMutate, pushParams, track.id]);

  if (!patch) {
    return <div className="p-4 text-[12px] text-white/50">This track has no BAJO patch.</div>;
  }

  const wobbleOn = (patch.params[W.ENABLE] ?? 0) > 0.5;
  const gateOn = (patch.params[G.ENABLE] ?? 0) > 0.5;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: SURFACE }}>
      <div className="flex items-center gap-3 px-4 h-12 flex-none border-b border-white/10" style={{ background: SURFACE_RAISED }}>
        <span className="font-black text-[11px] tracking-[0.16em]" style={{ color: BAJO_ACCENT }}>BAJO</span>
        <span className="text-white/25">·</span>
        <button
          onClick={() => setGalleryOpen((v) => !v)}
          className="text-[12px] font-semibold text-white hover:text-white/80 truncate max-w-[46%] text-left"
          title="Change preset"
        >
          {patch.name}
        </button>
        <span className="flex-1" />
        {gateOn && (
          <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border" style={{ color: BAJO_ACCENT, borderColor: 'rgba(255,75,28,0.4)' }}>
            Gate
          </span>
        )}
        <button
          onClick={() => setEditorOpen(true)}
          className="h-7 px-2.5 rounded-lg border border-white/12 text-[10.5px] uppercase tracking-[0.12em] text-white/60 hover:text-white hover:border-white/25"
        >
          Open
        </button>
        <button onClick={onClose} aria-label="Close" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        {/* The hero control: the actual rate lane, editable in place. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">Wobble lane</span>
            <button
              onClick={() => edit((p) => { p.params[W.ENABLE] = wobbleOn ? 0 : 1; })}
              className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border"
              style={{
                color: wobbleOn ? BAJO_ACCENT : 'rgba(255,255,255,0.4)',
                borderColor: wobbleOn ? 'rgba(255,75,28,0.45)' : 'rgba(255,255,255,0.12)',
              }}
            >
              {wobbleOn ? 'On' : 'Off'}
            </button>
            <span className="flex-1" />
            {LANE_PRESETS.map((lp) => (
              <button
                key={lp.name}
                onClick={() => edit((p) => { p.lane = [...lp.lane]; })}
                className="text-[9px] uppercase tracking-[0.1em] text-white/45 hover:text-white px-1"
              >
                {lp.name}
              </button>
            ))}
          </div>
          <WobbleLane
            lane={patch.lane}
            onChange={(lane) => edit((p) => { p.lane = lane; })}
            shape={patch.params[W.SHAPE] ?? 0}
            skew={patch.params[W.SKEW] ?? 0.5}
            smooth={patch.params[W.SMOOTH] ?? 0.1}
            accent={wobbleOn ? BAJO_ACCENT : '#4B4658'}
          />
        </div>

        {/* The four macros. */}
        <div className="grid grid-cols-4 gap-3">
          {BAJO_MACRO_ORDER.map((macro) => (
            <div key={macro} className="flex flex-col items-center gap-1.5" title={BAJO_MACRO_HINTS[macro]}>
              <Knob
                label={BAJO_MACRO_LABELS[macro]}
                value={patch.macros[macro]}
                min={0}
                max={1}
                defaultValue={0.5}
                color={MACRO_COLORS[macro]}
                size={54}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => edit((p) => { p.macros[macro] = v; })}
              />
            </div>
          ))}
        </div>

        {patch.description && (
          <p className="text-[11px] leading-relaxed text-white/40">{patch.description}</p>
        )}

        {galleryOpen && (
          <div className="flex flex-col gap-1.5">
            {BAJO_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => choosePreset(p.id)}
                className="text-left rounded-lg border px-3 py-2 hover:border-white/25"
                style={{
                  borderColor: p.id === patch.presetId ? 'rgba(255,75,28,0.5)' : 'rgba(255,255,255,0.09)',
                  background: p.id === patch.presetId ? 'rgba(255,75,28,0.07)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: p.family === 'phys' ? '#E0A85C' : '#fff' }}
                  >
                    {p.name}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-white/30">{p.genre}</span>
                </div>
                <p className="text-[11px] text-white/40 leading-snug">{p.description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {editorOpen && (
        <BajoEditor track={track} onMutate={onMutate} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
};
