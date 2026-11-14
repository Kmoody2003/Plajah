// Shared Play surface for the orchestral instrument suite — ARCO (strings), CORNU (brass),
// and AULOS (woodwinds). Modeled on VelaPanel.tsx + Knob.

import React, { useCallback, useState } from 'react';
import { Piano, X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';
import {
  AR,
  ARCO_ARTICULATIONS,
  ARCO_ENSEMBLES,
  ARCO_INSTRUMENTS,
  ARCO_SECTIONS,
  ARCO_STRING_SETS,
  AU,
  AULOS_ARTICULATIONS,
  AULOS_ENSEMBLES,
  AULOS_INSTRUMENTS,
  AULOS_SECTIONS,
  CN,
  CORNU_ARTICULATIONS,
  CORNU_ENSEMBLES,
  CORNU_INSTRUMENTS,
  CORNU_MUTES,
  CORNU_SECTIONS,
  type OrchestraFamily,
} from '../../../../services/melos/instruments/orchestra/params';
import { presetsForOrchestra } from '../../../../services/melos/instruments/orchestra/presets';
import {
  ORCHESTRA_MACRO_HINTS,
  ORCHESTRA_MACRO_LABELS,
  ORCHESTRA_MACRO_ORDER,
  applyOrchestraPatch,
  applyOrchestraPreset,
  deserializeOrchestraPatch,
  serializeOrchestraPatch,
  type OrchestraMacro,
  type OrchestraPatch,
} from '../../../../services/melos/instruments/orchestra/patch';
import { Knob } from '../shared/Knob';
import { SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  embedded?: boolean;
}

interface FamilyIdentity {
  name: string;
  subtitle: string;
  accent: string;
  purpose: string;
  instruments: readonly string[];
  ensembles: readonly string[];
  sections: readonly string[];
  articulations: readonly string[];
  instParam: number;
  ensParam: number;
  secParam: number;
  artParam: number;
}

const FAMILY_IDENTITY: Record<OrchestraFamily, FamilyIdentity> = {
  arco: {
    name: 'ARCO',
    subtitle: 'Orchestral Strings',
    accent: '#E8B86D',
    purpose: 'Physical bowed strings — violin, viola, cello, and double bass, solo or in symphonic sections.',
    instruments: ARCO_INSTRUMENTS,
    ensembles: ARCO_ENSEMBLES,
    sections: ARCO_SECTIONS,
    articulations: ARCO_ARTICULATIONS,
    instParam: AR.INSTRUMENT,
    ensParam: AR.ENSEMBLE,
    secParam: AR.SECTION,
    artParam: AR.ARTIC,
  },
  cornu: {
    name: 'CORNU',
    subtitle: 'Orchestral Brass',
    accent: '#F29F4B',
    purpose: 'Lips on brass air columns — trumpets, horns, trombones, euphonium, and tuba with mutes and non-linear flare.',
    instruments: CORNU_INSTRUMENTS,
    ensembles: CORNU_ENSEMBLES,
    sections: CORNU_SECTIONS,
    articulations: CORNU_ARTICULATIONS,
    instParam: CN.INSTRUMENT,
    ensParam: CN.ENSEMBLE,
    secParam: CN.SECTION,
    artParam: CN.ARTIC,
  },
  aulos: {
    name: 'AULOS',
    subtitle: 'Orchestral Woodwinds',
    accent: '#6EE7B7',
    purpose: 'Reeds and air jets on tone-hole bores — flutes, oboes, clarinets, bassoons, and saxophones.',
    instruments: AULOS_INSTRUMENTS,
    ensembles: AULOS_ENSEMBLES,
    sections: AULOS_SECTIONS,
    articulations: AULOS_ARTICULATIONS,
    instParam: AU.INSTRUMENT,
    ensParam: AU.ENSEMBLE,
    secParam: AU.SECTION,
    artParam: AU.ARTIC,
  },
};

function resolveFamily(rawType: string | undefined): OrchestraFamily {
  if (rawType === 'cornu' || rawType === 'aulos') return rawType;
  return 'arco';
}

export const OrchestraPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  const [galleryOpen, setGalleryOpen] = useState(false);

  const family = resolveFamily(track.instrument?.type as string | undefined);
  const identity = FAMILY_IDENTITY[family];
  const bank = presetsForOrchestra(family);
  const patch: OrchestraPatch | null = deserializeOrchestraPatch(family, track.instrument?.patch);

  const pushPatch = useCallback(
    (p: OrchestraPatch) => {
      const engine = BeatsEngine.get();
      const inst = engine.getInstrument(track.id);
      if (inst) {
        applyOrchestraPatch(inst, p);
        return;
      }
      const t = engine.getDoc().arrangement.find((x) => x.id === track.id);
      if (t) {
        void engine.ensureInstrument(t).then((i) => {
          if (i) applyOrchestraPatch(i, p);
        });
      }
    },
    [track.id],
  );

  const updatePatch = useCallback(
    (mutate: (next: OrchestraPatch) => void, paramId?: number) => {
      if (paramId !== undefined) {
        liveBus.emit({
          kind: 'param',
          instrument: family,
          trackId: track.id,
          at: liveNow(),
          paramId,
        });
      }
      onMutate((d) => {
        const t = d.arrangement.find((x) => x.id === track.id);
        if (!t?.instrument) return;
        const next = deserializeOrchestraPatch(family, t.instrument.patch);
        if (!next) return;
        mutate(next);
        t.instrument.patch = serializeOrchestraPatch(next);
        pushPatch(next);
      });
    },
    [family, onMutate, pushPatch, track.id],
  );

  const setMacro = useCallback(
    (macro: OrchestraMacro, value: number) => {
      updatePatch(
        (next) => {
          next.macros[macro] = value;
        },
        ORCHESTRA_MACRO_ORDER.indexOf(macro),
      );
    },
    [updatePatch],
  );

  const choosePreset = useCallback(
    (presetId: string) => {
      const preset = bank.find((p) => p.id === presetId);
      if (!preset) return;
      liveBus.emit({
        kind: 'preset',
        instrument: family,
        trackId: track.id,
        at: liveNow(),
        presetId: preset.id,
        presetName: preset.name,
      });
      onMutate((d) => {
        const t = d.arrangement.find((x) => x.id === track.id);
        if (!t?.instrument) return;
        const current = deserializeOrchestraPatch(family, t.instrument.patch);
        if (!current) return;
        const next = applyOrchestraPreset(current, preset);
        t.instrument.patch = serializeOrchestraPatch(next);
        t.instrument.presetName = preset.name;
        t.name = preset.name;
        syncPadWithTrack(d, track.id);
        pushPatch(next);
      });
      setGalleryOpen(false);
    },
    [bank, family, onMutate, pushPatch, track.id],
  );

  if (!patch) {
    return (
      <div className="p-4 flex items-center gap-3">
        <span className="text-[12px] text-white/50">This track has no {identity.name} patch.</span>
        <button
          onClick={onClose}
          className="h-7 px-3 rounded-lg border border-white/15 text-[11px] text-white/60 hover:text-white"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: SURFACE }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 h-12 flex-none border-b border-white/10"
        style={{ background: SURFACE_RAISED }}
      >
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
        <span className="text-[10px] text-white/35 hidden sm:inline">{identity.subtitle}</span>
        <span className="flex-1" />
        {!embedded && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 [&>*]:shrink-0">
        {/* Preset pill strip */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-white/8"
          style={{ scrollbarWidth: 'none' }}
        >
          <span className="text-[9px] uppercase tracking-[0.16em] text-white/35 shrink-0 mr-0.5">
            Presets
          </span>
          {bank.map((preset) => {
            const active = preset.id === patch.presetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => choosePreset(preset.id)}
                title={preset.description}
                className="h-6 px-2.5 rounded-lg text-[10px] whitespace-nowrap border transition shrink-0"
                style={
                  active
                    ? {
                        borderColor: identity.accent,
                        background: `${identity.accent}2B`,
                        color: '#fff',
                        fontWeight: 700,
                      }
                    : {
                        borderColor: 'rgba(255,255,255,0.09)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'rgba(255,255,255,0.62)',
                      }
                }
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        {/* Instrument / Ensemble / Section / Articulation selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <SelectField
            label="Instrument"
            value={patch.instrument}
            options={identity.instruments}
            accent={identity.accent}
            onChange={(idx) =>
              updatePatch((next) => {
                next.instrument = idx;
                next.params[identity.instParam] = idx;
              }, identity.instParam)
            }
          />
          <SelectField
            label="Ensemble"
            value={patch.ensemble}
            options={identity.ensembles}
            accent={identity.accent}
            onChange={(idx) =>
              updatePatch((next) => {
                next.ensemble = idx;
                next.params[identity.ensParam] = idx;
              }, identity.ensParam)
            }
          />
          <SelectField
            label="Section"
            value={patch.section}
            options={identity.sections}
            accent={identity.accent}
            onChange={(idx) =>
              updatePatch((next) => {
                next.section = idx;
                next.params[identity.secParam] = idx;
              }, identity.secParam)
            }
          />
          <SelectField
            label="Articulation"
            value={patch.artic}
            options={identity.articulations}
            accent={identity.accent}
            onChange={(idx) =>
              updatePatch((next) => {
                next.artic = idx;
                next.params[identity.artParam] = idx;
              }, identity.artParam)
            }
          />
        </div>

        {/* Family-specific selector: String Set for ARCO, Mute for CORNU */}
        {family === 'arco' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <SelectField
              label="String Set"
              value={Math.round(patch.params[AR.STRING_SET] ?? 0)}
              options={ARCO_STRING_SETS}
              accent={identity.accent}
              onChange={(idx) =>
                updatePatch((next) => {
                  next.params[AR.STRING_SET] = idx;
                }, AR.STRING_SET)
              }
            />
          </div>
        )}
        {family === 'cornu' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <SelectField
              label="Mute"
              value={Math.round(patch.params[CN.MUTE] ?? 0)}
              options={CORNU_MUTES}
              accent={identity.accent}
              onChange={(idx) =>
                updatePatch((next) => {
                  next.params[CN.MUTE] = idx;
                }, CN.MUTE)
              }
            />
          </div>
        )}

        {/* 4 Macro Knobs */}
        <div className="grid grid-cols-4 gap-3 pt-1">
          {ORCHESTRA_MACRO_ORDER.map((macro) => (
            <div
              key={macro}
              className="flex flex-col items-center gap-1.5"
              title={ORCHESTRA_MACRO_HINTS[macro]}
            >
              <Knob
                label={ORCHESTRA_MACRO_LABELS[macro]}
                value={patch.macros[macro]}
                min={0}
                max={1}
                defaultValue={0.5}
                color={identity.accent}
                size={54}
                trackId={track.id}
                focusId={`${family}:${track.id}:macro:${macro}`}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setMacro(macro, v)}
              />
            </div>
          ))}
        </div>

        <p className="text-[11px] leading-relaxed text-white/40">
          {patch.description || identity.purpose}
        </p>

        {galleryOpen && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/35">
              {identity.subtitle} Presets
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
                    <div className="text-[9.5px] text-white/35 mt-0.5 line-clamp-2">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-white/30">
          <Piano size={12} />
          <span>
            Arm this track and play — velocity, mod wheel, and per-note articulations shape the
            physical player.
          </span>
        </div>
      </div>
    </div>
  );
};

interface SelectFieldProps {
  label: string;
  value: number;
  options: readonly string[];
  accent: string;
  onChange: (index: number) => void;
}

const SelectField: React.FC<SelectFieldProps> = ({ label, value, options, accent, onChange }) => {
  const safeValue = Math.max(0, Math.min(options.length - 1, Math.round(value)));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.14em] text-white/40">{label}</span>
      <select
        value={safeValue}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 px-2 rounded-lg text-[11px] text-white bg-white/[0.04] border border-white/12 focus:outline-none"
        style={{ accentColor: accent }}
      >
        {options.map((opt, idx) => (
          <option key={opt} value={idx} className="bg-[#18181c] text-white">
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
};
