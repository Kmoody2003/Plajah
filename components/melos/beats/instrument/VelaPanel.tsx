// The meditation suite's Play surface — VELA, CANTUS, ISON and PNEUMA.
//
// One panel for four instruments, because they share an engine and a patch shape and it would
// be dishonest to pretend otherwise by forking the file. What differs is identity: the name, the
// accent, the preset bank, and what the four macros are CALLED.

import React, { useCallback, useState } from 'react';
import { X, Piano } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  deserializeVelaPatch, applyVelaPreset, applyVelaPatch,
  VELA_MACRO_HINTS, VELA_MACRO_LABELS, VELA_MACRO_ORDER, type VelaPatch,
} from '../../../../services/melos/instruments/vela/patch';
import { VELA_PRESETS, expandMacros as expandVelaMacros } from '../../../../services/melos/instruments/vela/presets';
import { SUITE, presetsFor, type SuiteInstrument } from '../../../../services/melos/instruments/vela/suite';
import type { VelaMacro } from '../../../../services/melos/instruments/vela/presets';
import { M } from '../../../../services/melos/instruments/vela/params';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';
import { PANEL_SEAT_INTROS } from '../../../../services/melos/beats/band/live/lineAudio';
import { InstrumentBandSeat } from './InstrumentBandSeat';
import { Knob } from '../shared/Knob';
import { PartialDisplay } from './PartialDisplay';
import { VelaEditor } from './VelaEditor';
import { ARMED, PLAYHEAD, SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  /** Hosted inside the shared InstrumentWindow — chrome (close/arm/presets) comes from the window. */
  embedded?: boolean;
}

const MACRO_COLORS: Record<VelaMacro, string> = {
  air: ARMED,
  body: '#D0BCFF',
  shimmer: PLAYHEAD,
  drift: '#D0BCFF',
};

export const VelaPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const kind = (track.instrument?.type ?? 'vela') as SuiteInstrument;
  const identity = SUITE[kind] ?? SUITE.vela;
  const bank = kind === 'vela' ? VELA_PRESETS : presetsFor(kind);

  const patch: VelaPatch | null = deserializeVelaPatch(track.instrument?.patch);

  const pushPatch = useCallback((p: VelaPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) { applyVelaPatch(inst, p); return; }
    const t = engine.getDoc().arrangement.find((x) => x.id === track.id);
    if (t) void engine.ensureInstrument(t).then((i) => { if (i) applyVelaPatch(i, p); });
  }, [track.id]);

  const setMacro = useCallback((macro: VelaMacro, value: number) => {
    liveBus.emit({ kind: 'param', instrument: kind, trackId: track.id, at: liveNow(), paramId: VELA_MACRO_ORDER.indexOf(macro) });
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeVelaPatch(raw);
      if (!next) return;
      next.macros[macro] = value;
      (raw as { macros?: Record<string, number> }).macros = { ...next.macros };
      pushPatch(next);
    });
  }, [kind, onMutate, pushPatch, track.id]);

  const choosePreset = useCallback((presetId: string) => {
    const preset = bank.find((p) => p.id === presetId);
    if (!preset) return;
    liveBus.emit({ kind: 'preset', instrument: kind, trackId: track.id, at: liveNow(), presetId: preset.id, presetName: preset.name });
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      const current = deserializeVelaPatch(t.instrument.patch);
      if (!current) return;
      const next = applyVelaPreset(current, preset);
      t.instrument.patch = { ...next, params: { ...next.params } } as unknown as Record<string, unknown>;
      t.instrument.presetName = preset.name;
      t.name = preset.name;
      syncPadWithTrack(d, track.id);
      pushPatch(next);
    });
    setGalleryOpen(false);
  }, [bank, kind, onMutate, pushPatch, track.id]);

  if (!patch) {
    return (
      <div className="p-4 flex items-center gap-3">
        <span className="text-[12px] text-white/50">This track has no VELA patch.</span>
        <button onClick={onClose} className="h-7 px-3 rounded-lg border border-white/15 text-[11px] text-white/60 hover:text-white">Close</button>
      </div>
    );
  }

  const expanded = expandVelaMacros(patch.params, patch.macros);
  const p = (id: number, fallback: number) => expanded[id] ?? patch.params[id] ?? fallback;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: SURFACE }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 flex-none border-b border-white/10" style={{ background: SURFACE_RAISED }}>
        <span className="font-black text-[11px] tracking-[0.16em]" style={{ color: identity.accent }}>
          {identity.name}
        </span>
        <span className="text-white/25">·</span>
        <button
          onClick={() => setGalleryOpen((v) => !v)}
          className="text-[12px] font-semibold text-white hover:text-white/80 truncate max-w-[46%] text-left"
          title="Change preset"
        >
          {patch.name}
        </button>
        <span className="flex-1" />
        <button
          onClick={() => setEditorOpen(true)}
          className="h-7 px-2.5 rounded-lg border border-white/12 text-[10.5px] uppercase tracking-[0.12em] text-white/60 hover:text-white hover:border-white/25"
        >
          Open
        </button>
        {!embedded && (
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 [&>*]:shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-white/8" style={{ scrollbarWidth: 'none' }}>
          <span className="text-[9px] uppercase tracking-[0.16em] text-white/35 shrink-0 mr-0.5">Sub-Presets</span>
          {bank.map((preset) => {
            const active = preset.id === patch.presetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => choosePreset(preset.id)}
                title={`${preset.family} · ${preset.blurb} — ${preset.description}`}
                className="h-6 px-2.5 rounded-lg text-[10px] whitespace-nowrap border transition shrink-0"
                style={active
                  ? { borderColor: identity.accent, background: `${identity.accent}2B`, color: '#fff', fontWeight: 700 }
                  : { borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.62)' }}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        <PartialDisplay
          partials={p(M.PARTIALS, 0.5)}
          inharm={p(M.INHARM, 0.04)}
          spread={p(M.SPREAD, 0.12)}
          decay={p(M.DECAY, 0.45)}
          decayTilt={p(M.DECAY_TILT, 0.5)}
          material={p(M.MATERIAL, 0)}
          position={p(M.POSITION, 0.28)}
        />

        <div className="grid grid-cols-4 gap-3">
          {VELA_MACRO_ORDER.map((macro) => (
            <div key={macro} className="flex flex-col items-center gap-1.5" title={VELA_MACRO_HINTS[macro]}>
              <Knob
                label={identity.macroLabels[macro] ?? VELA_MACRO_LABELS[macro]}
                value={patch.macros[macro]}
                min={0}
                max={1}
                defaultValue={0.5}
                color={MACRO_COLORS[macro]}
                size={54}
                trackId={track.id}
                focusId={`vela:${track.id}:macro:${macro}`}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setMacro(macro, v)}
              />
            </div>
          ))}
        </div>

        {patch.description ? (
          <p className="text-[11px] leading-relaxed text-white/40">{patch.description}</p>
        ) : (
          <p className="text-[11px] leading-relaxed text-white/40">{identity.purpose}</p>
        )}

        {galleryOpen && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/35">
              {kind === 'vela' ? 'Bodies' : kind === 'cantus' ? 'Voices' : kind === 'ison' ? 'Drones' : 'Airs'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {bank.map((preset) => {
                const active = preset.id === patch.presetId;
                return (
                  <button
                    key={preset.id}
                    onClick={() => choosePreset(preset.id)}
                    className="text-left rounded-xl border p-2.5 transition-colors"
                    style={{
                      borderColor: active ? identity.accent : 'rgba(255,255,255,0.10)',
                      background: active ? `${identity.accent}18` : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="text-[12px] font-semibold text-white">{preset.name}</div>
                    <div className="text-[9.5px] uppercase tracking-[0.1em] text-white/30 mt-0.5">{preset.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-white/30">
          <Piano size={12} />
          <span>
            {kind === 'ison'
              ? 'Arm this track and hold a chord — a drone does not arrive or leave, it is simply already there.'
              : kind === 'cantus'
              ? 'Arm this track and hold a low note, then sweep Overtone — one harmonic lifts until you hear a second voice.'
              : kind === 'pneuma'
              ? 'Arm this track and play — the breath carries this one, not the body.'
              : 'Arm this track and play — a bowed body sustains for as long as you hold it.'}
          </span>
        </div>

        {(() => {
          const seat = kind === 'pneuma'
            ? { playerId: 'felix', loreId: 'spectral-ensemble', role: 'Session Band breath & winds · live', intro: PANEL_SEAT_INTROS.pneuma }
            : kind === 'ison'
            ? { playerId: 'ingrid', loreId: 'spectral-ensemble', role: 'Session Band drone & cello · live', intro: PANEL_SEAT_INTROS.ison }
            : kind === 'cantus'
            ? { playerId: 'elena', loreId: 'spectral-ensemble', role: 'Session Band overtone ensemble · live', intro: PANEL_SEAT_INTROS.cantus }
            : { playerId: 'elena', loreId: 'spectral-ensemble', role: 'Session Band spectral ensemble · live', intro: PANEL_SEAT_INTROS.vela };
          return (
            <InstrumentBandSeat
              instrument={kind}
              playerId={seat.playerId}
              loreId={seat.loreId}
              role={seat.role}
              intro={seat.intro}
              screenText={`${identity.name} · ${patch.name} · ${VELA_MACRO_ORDER.map((m) => `${identity.macroLabels[m] ?? VELA_MACRO_LABELS[m]} ${Math.round((patch.macros[m] ?? 0) * 100)}%`).join(', ')}`}
              accent={identity.accent}
              track={track}
              presetName={patch.name}
            />
          );
        })()}
      </div>

      {editorOpen && (
        <VelaEditor track={track} onMutate={onMutate} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
};
