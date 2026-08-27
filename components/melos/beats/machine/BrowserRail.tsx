// Left rail: the kit list + sound source for the selected pad. In Phase 1-H this grows the
// NKS/Melos-Samples browser; for now it's local files + the starter synth voices.

import React, { useRef, useState } from 'react';
import { Upload, Piano, SlidersHorizontal } from 'lucide-react';
import type { GrooveDoc, SynthVoiceId, InstrumentType } from '../../../../services/melos/beats/grooveDoc';
import { instrumentLabel } from '../../../../services/melos/beats/instrumentFactory';
import { useContextMenu, type MenuNode } from '../../../ui/ContextMenu';
import { NksBrowser } from './NksBrowser';
import type { MelosSampleRef } from '../melosSamples';
import { PLAYHEAD, SELECT, SURFACE_RAISED } from '../theme';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteLabel = (n: number) => `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;

type RailTab = 'kit' | 'samples' | 'nks';

const SYNTH_VOICES: { id: SynthVoiceId; label: string }[] = [
  { id: 'kick', label: 'Kick' }, { id: 'sub', label: 'Sub' }, { id: 'snare', label: 'Snare' },
  { id: 'clap', label: 'Clap' }, { id: 'hat-closed', label: 'Cl Hat' }, { id: 'hat-open', label: 'Op Hat' },
];

interface BrowserRailProps {
  doc: GrooveDoc;
  selectedPad: number;
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onLoadSampleFile: (padIdx: number, file: File) => void;
  melosSamples?: MelosSampleRef[];
  onLoadMelosSample?: (padIdx: number, ref: MelosSampleRef) => void;
  /** Open the instrument picker targeting this pad (turns the pad into an ONDA/KERA instrument). */
  onPickInstrumentForPad?: (padIdx: number) => void;
  /** Open the editor panel for the instrument already on this pad. */
  onEditPadInstrument?: (padIdx: number) => void;
}

export const BrowserRail: React.FC<BrowserRailProps> = ({ doc, selectedPad, onSelectPad, onMutate, onLoadSampleFile, melosSamples, onLoadMelosSample, onPickInstrumentForPad, onEditPadInstrument }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<RailTab>('kit');
  const pad = doc.kit[selectedPad];
  const padInstTrack = pad?.source === 'instrument' && pad.instrumentTrackId
    ? doc.arrangement.find((t) => t.id === pad.instrumentTrackId)
    : undefined;

  // Right-click a kit row: the instrument-header menu — open its UI, rename, mute, swap sound.
  const kitMenu = useContextMenu<number>((i) => {
    const p = doc.kit[i];
    if (!p) return [];
    const items: MenuNode<number>[] = [{ kind: 'header', label: p.empty ? `Pad ${i + 1}` : p.name }];
    if (p.source === 'instrument' && p.instrumentTrackId) {
      items.push({ id: 'open', label: 'Open instrument', onSelect: () => onEditPadInstrument?.(i) });
    } else {
      items.push({ id: 'load', label: 'Load an instrument…', onSelect: () => { onSelectPad(i); onPickInstrumentForPad?.(i); } });
    }
    items.push(
      { id: 'rename', label: 'Rename…', onSelect: () => { const name = window.prompt('Pad name', p.name)?.trim().slice(0, 18); if (name) onMutate((d) => { const x = d.kit[i]; if (x) { x.name = name; if (x.instrumentTrackId) { const t = d.arrangement.find((y) => y.id === x.instrumentTrackId); if (t) t.name = name; } } }); } },
      { id: 'mute', label: 'Mute', checked: !!p.mute, keepOpen: true, onSelect: () => onMutate((d) => { const x = d.kit[i]; if (x) x.mute = !x.mute; }) },
    );
    return items;
  });

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5 flex-none">
        {(melosSamples ? (['kit', 'samples', 'nks'] as RailTab[]) : (['kit', 'nks'] as RailTab[])).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 h-6 rounded-md text-[10px] uppercase tracking-wide ${tab === t ? 'bg-white/15 text-white font-semibold' : 'text-white/40 hover:text-white'}`}
          >{t === 'kit' ? 'Kit' : t === 'samples' ? 'Samples' : 'NKS'}</button>
        ))}
      </div>

      {tab === 'samples' && (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <p className="text-[9px] text-white/25 leading-snug">
            Pinned in the Samples room. Clearance travels onto the pad.
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
            {(melosSamples || []).map((s) => (
              <button
                key={s.id}
                onClick={() => onLoadMelosSample?.(selectedPad, s)}
                title={`Load onto pad ${selectedPad + 1} · ${s.clearanceLabel}`}
                className="text-left px-2 py-1.5 rounded-lg hover:bg-white/5"
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: s.clearanceColor }} />
                  <span className="text-[11px] text-white/70 truncate flex-1">{s.title}</span>
                </span>
                <span className="block text-[9px] truncate pl-3" style={{ color: s.blocking ? s.clearanceColor : 'rgba(255,255,255,0.25)' }}>
                  {s.blocking ? s.clearanceLabel : s.subtitle || s.clearanceLabel}
                </span>
              </button>
            ))}
            {!melosSamples?.length && (
              <p className="text-[10px] text-white/25 px-2 py-3">
                No samples pinned yet — add them in the Samples room.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'nks' && (
        <NksBrowser
          onUsePreviewAsSample={(_item, file) => onLoadSampleFile(selectedPad, file)}
          onMacroNames={() => { /* macro labels surface in the NKS panel itself for now */ }}
        />
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto pr-1 ${tab !== 'kit' ? 'hidden' : ''}`}>
        {kitMenu.node}
        <div className="flex flex-col gap-0.5">
          {doc.kit.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onSelectPad(i)}
              onDoubleClick={() => { if (p.instrumentTrackId) onEditPadInstrument?.(i); }}
              {...kitMenu.bind(i)}
              title={p.instrumentTrackId ? 'Click to select · double-click to open the instrument · right-click for menu' : 'Click to select · right-click for menu'}
              className="flex items-center gap-2 h-7 px-2 rounded-lg text-left text-[11px] transition-colors"
              style={i === selectedPad
                ? { background: `${SELECT}29`, border: `1px solid ${SELECT}59`, color: '#fff' }
                : { color: 'rgba(255,255,255,0.5)' }}
            >
              <span className="w-4 text-[9px] font-mono text-white/25">{i + 1}</span>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[8px] font-mono" style={{ color: p.source === 'instrument' ? PLAYHEAD : 'rgba(255,255,255,0.25)' }}>
                {p.source === 'instrument' ? 'INS' : p.source === 'synth' ? 'SYN' : 'SMP'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {pad && tab === 'kit' && (
        <div className="flex-none border-t border-white/10 pt-3">
          <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2">Sound · Pad {selectedPad + 1}</p>
          <input
            value={pad.name}
            onChange={(e) => onMutate((d) => { const p = d.kit[selectedPad]; if (p) p.name = e.target.value; })}
            className="w-full h-7 mb-2 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none focus:border-white/30"
            aria-label="Pad name"
          />

          {pad.source === 'instrument' ? (
            // The pad IS an instrument — show it, let them open the full editor, tune the base note,
            // or swap back to a one-shot sound.
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onEditPadInstrument?.(selectedPad)}
                className="w-full h-9 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-2"
                style={{ borderColor: `${PLAYHEAD}59`, color: PLAYHEAD, background: `${PLAYHEAD}14` }}
              >
                <SlidersHorizontal size={12} /> {padInstTrack?.instrument ? instrumentLabel(padInstTrack.instrument.type as InstrumentType) : 'ONDA'} · Edit
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-wide text-white/35 flex-1 flex items-center gap-1"><Piano size={10} /> Base note</span>
                <button onClick={() => onMutate((d) => { const p = d.kit[selectedPad]; if (p) p.instrumentNote = Math.max(0, (p.instrumentNote ?? 60) - 1); })}
                  className="w-6 h-6 rounded-md border border-white/12 text-white/60 hover:text-white">–</button>
                <span className="w-9 text-center text-[11px] font-mono text-white/80">{noteLabel(pad.instrumentNote ?? 60)}</span>
                <button onClick={() => onMutate((d) => { const p = d.kit[selectedPad]; if (p) p.instrumentNote = Math.min(127, (p.instrumentNote ?? 60) + 1); })}
                  className="w-6 h-6 rounded-md border border-white/12 text-white/60 hover:text-white">+</button>
              </div>
              <button
                onClick={() => onMutate((d) => { const p = d.kit[selectedPad]; if (p) { p.source = 'synth'; p.synthVoice = p.synthVoice || 'kick'; p.instrumentTrackId = undefined; } })}
                className="text-[9px] text-white/30 hover:text-white/60 underline decoration-dotted"
              >Replace with a one-shot sound</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {SYNTH_VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onMutate((d) => { const p = d.kit[selectedPad]; if (p) { p.source = 'synth'; p.synthVoice = v.id; p.empty = false; } })}
                    className={`h-6 rounded-lg text-[10px] border ${pad.source === 'synth' && pad.synthVoice === v.id ? 'bg-white/15 border-white/25 text-white font-semibold' : 'border-white/10 text-white/40 hover:text-white'}`}
                  >{v.label}</button>
                ))}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-8 rounded-lg border border-dashed border-white/20 text-[11px] text-white/50 hover:text-white hover:border-white/40 flex items-center justify-center gap-2"
                style={{ background: SURFACE_RAISED }}
              >
                <Upload size={12} /> {pad.source === 'sample' && pad.sample ? pad.sample.name : 'Load sample…'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aif,.aiff"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoadSampleFile(selectedPad, f); e.target.value = ''; }}
              />
              <button
                onClick={() => onPickInstrumentForPad?.(selectedPad)}
                className="w-full h-8 mt-2 rounded-lg border text-[11px] flex items-center justify-center gap-2"
                style={{ borderColor: `${PLAYHEAD}40`, color: PLAYHEAD, background: `${PLAYHEAD}0f` }}
                title="Make this pad play a full ONDA or KERA instrument"
              >
                <SlidersHorizontal size={12} /> Load an instrument…
              </button>
              <p className="mt-1.5 text-[9px] text-white/25">drop an audio file onto a pad, or make the pad an instrument</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
