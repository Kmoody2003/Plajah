// Left rail: the kit list + sound source for the selected pad. In Phase 1-H this grows the
// NKS/Melos-Samples browser; for now it's local files + the starter synth voices.

import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { GrooveDoc, SynthVoiceId } from '../../../../services/melos/beats/grooveDoc';
import { NksBrowser } from './NksBrowser';
import type { MelosSampleRef } from '../melosSamples';
import { SELECT, SURFACE_RAISED } from '../theme';

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
}

export const BrowserRail: React.FC<BrowserRailProps> = ({ doc, selectedPad, onSelectPad, onMutate, onLoadSampleFile, melosSamples, onLoadMelosSample }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<RailTab>('kit');
  const pad = doc.kit[selectedPad];

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
        <div className="flex flex-col gap-0.5">
          {doc.kit.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onSelectPad(i)}
              className="flex items-center gap-2 h-7 px-2 rounded-lg text-left text-[11px] transition-colors"
              style={i === selectedPad
                ? { background: `${SELECT}29`, border: `1px solid ${SELECT}59`, color: '#fff' }
                : { color: 'rgba(255,255,255,0.5)' }}
            >
              <span className="w-4 text-[9px] font-mono text-white/25">{i + 1}</span>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[8px] font-mono text-white/25">{p.source === 'synth' ? 'SYN' : 'SMP'}</span>
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
          <div className="grid grid-cols-3 gap-1 mb-2">
            {SYNTH_VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => onMutate((d) => { const p = d.kit[selectedPad]; if (p) { p.source = 'synth'; p.synthVoice = v.id; } })}
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
          <p className="mt-1.5 text-[9px] text-white/25">or drop an audio file straight onto a pad</p>
        </div>
      )}
    </div>
  );
};
