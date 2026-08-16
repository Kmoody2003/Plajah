// Melos Beats — the phone morph. The SAME GrooveDoc, folded into focused full-screen MODES with a
// persistent transport and a bottom dock (the approved design). Desktop spreads across panels; on a
// phone you flick between one mode at a time. Rendered only when the viewport is a phone, so the
// desktop layout is never touched. It takes over the screen (its dock replaces any app nav) with a
// back chevron to exit — one bottom bar, always the right one.

import React, { useState } from 'react';
import { Play, Square, Circle, ChevronLeft, Grid2x2, BarChart3, Piano, ListMusic, SlidersHorizontal } from 'lucide-react';
import type { GrooveDoc, Pattern } from '../../../../services/melos/beats/grooveDoc';
import type { MelosSampleRef } from '../melosSamples';
import { PadGrid } from '../machine/PadGrid';
import { StepStrip } from '../machine/StepStrip';
import { PitchRoll } from '../machine/PitchRoll';
import { MixerView } from '../mixer/MixerView';
import { TimelineView } from '../timeline/TimelineView';
import { PLAYHEAD, SELECT, WASH_BG } from '../theme';

type Mode = 'pads' | 'steps' | 'keys' | 'song' | 'mix';
const DOCK: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: 'pads', label: 'Pads', icon: <Grid2x2 size={17} /> },
  { id: 'steps', label: 'Steps', icon: <BarChart3 size={17} /> },
  { id: 'keys', label: 'Keys', icon: <Piano size={17} /> },
  { id: 'song', label: 'Song', icon: <ListMusic size={17} /> },
  { id: 'mix', label: 'Mix', icon: <SlidersHorizontal size={17} /> },
];

export interface BeatsMobileProps {
  doc: GrooveDoc;
  pattern?: Pattern;
  selectedPad: number;
  beats: number;
  running: boolean;
  suspended: boolean;
  frame: number;
  playMode: 'pattern' | 'song';
  meters: { groups: number[]; master: number };
  limiterReduction: number;
  recording: boolean;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onSelectPad: (i: number) => void;
  onPlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onSetPlayMode: (m: 'pattern' | 'song') => void;
  onPlayFrom: (fromBeats: number) => void;
  onLoadSampleFile: (padIdx: number, file: File) => void;
  melosSamples?: MelosSampleRef[];
  onLoadMelosSample?: (padIdx: number, ref: MelosSampleRef) => void;
  onOpenInstrument?: (id: string) => void;
  onAddInstrument?: () => void;
  onClose?: () => void;
  hideClose?: boolean;
}

export const BeatsMobileShell: React.FC<BeatsMobileProps> = (p) => {
  const [mode, setMode] = useState<Mode>('pads');
  const pattern = p.pattern;
  const b = Math.max(0, p.beats);
  const bar = Math.floor(b / 4) + 1, beat = Math.floor(b % 4) + 1, six = Math.floor((b % 1) * 4) + 1;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col text-white" style={{ background: `radial-gradient(700px 320px at 20% -10%, rgba(107,0,153,0.28), transparent 60%), ${WASH_BG}` }}>
      {/* appbar */}
      <div className="flex items-center gap-2 px-3 h-12 border-b border-white/10 flex-none bg-white/[0.04] backdrop-blur-xl">
        {!p.hideClose && (
          <button onClick={p.onClose} aria-label="Back" className="flex items-center gap-1 h-8 px-2 rounded-lg border border-white/10 text-white/55 text-[12px]"><ChevronLeft size={15} /> Plajah</button>
        )}
        <span className="font-black text-[12px] tracking-[0.06em]"><span className="bg-gradient-to-br from-[#B84DFF] to-[#D40055] bg-clip-text text-transparent">MELOS</span><span className="text-white/80"> · BEATS</span></span>
        <span className="flex-1" />
        <span className="text-[11px] text-white/45 truncate max-w-[38%]">{p.doc.name}</span>
      </div>

      {/* focused mode */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {p.suspended && (
          <button onClick={p.onPlay} className="absolute top-2 left-1/2 -translate-x-1/2 z-20 h-8 px-3 rounded-lg text-[11px] font-semibold bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/40 animate-pulse">Tap to enable audio</button>
        )}
        {mode === 'pads' && (
          <div className="h-full overflow-y-auto p-3">
            <PadGrid doc={p.doc} selectedPad={p.selectedPad} frame={p.frame} onSelectPad={p.onSelectPad} onDropSample={p.onLoadSampleFile} melosSamples={p.melosSamples} />
          </div>
        )}
        {mode === 'steps' && pattern && (
          <div className="h-full overflow-y-auto p-3">
            <StepStrip doc={p.doc} pattern={pattern} selectedPad={p.selectedPad} beats={p.beats} running={p.running} playMode={p.playMode} onMutate={p.onMutate} />
            <p className="text-center text-[10px] text-white/25 mt-3">tap a pad in Pads mode to sequence it here</p>
          </div>
        )}
        {mode === 'keys' && pattern && (
          <div className="h-full overflow-y-auto p-3">
            <PitchRoll doc={p.doc} pattern={pattern} selectedPad={p.selectedPad} beats={p.beats} running={p.running} playMode={p.playMode} onMutate={p.onMutate} />
          </div>
        )}
        {mode === 'song' && pattern && (
          <div className="h-full overflow-hidden">
            <TimelineView doc={p.doc} activePattern={pattern} beats={p.beats} running={p.running} playMode={p.playMode} meters={p.meters} onMutate={p.onMutate} onPlayFrom={p.onPlayFrom} onOpenInstrument={p.onOpenInstrument} onAddInstrument={p.onAddInstrument} />
          </div>
        )}
        {mode === 'mix' && (
          <div className="h-full overflow-hidden">
            <MixerView doc={p.doc} meters={p.meters} limiterReduction={p.limiterReduction} selectedPad={p.selectedPad} onSelectPad={p.onSelectPad} onMutate={p.onMutate} />
          </div>
        )}
      </div>

      {/* transport */}
      <div className="flex items-center gap-2.5 px-3 h-12 border-t border-white/10 flex-none bg-white/[0.03]">
        {p.running ? (
          <button onClick={p.onStop} aria-label="Stop" className="w-10 h-9 grid place-items-center rounded-xl bg-white/10 border border-white/15 text-white"><Square size={14} fill="currentColor" /></button>
        ) : (
          <button onClick={p.onPlay} aria-label="Play" className="w-10 h-9 grid place-items-center rounded-xl font-bold" style={{ background: PLAYHEAD, color: '#061014' }}><Play size={15} fill="currentColor" /></button>
        )}
        <button onClick={p.onToggleRecord} aria-label="Record" className="w-10 h-9 grid place-items-center rounded-xl border" style={p.recording ? { borderColor: '#EF4444', background: 'rgba(239,68,68,0.15)', color: '#EF4444' } : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.5)' }}><Circle size={13} fill={p.recording ? 'currentColor' : 'none'} /></button>
        <span className="font-mono text-[14px] text-white/85 tabular-nums w-[64px] text-center">{bar}.{beat}.{six}</span>
        <span className="flex-1" />
        <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5">
          <button onClick={() => p.onSetPlayMode('pattern')} className="h-7 px-2 rounded-md text-[9px] uppercase tracking-wide" style={p.playMode === 'pattern' ? { background: 'rgba(255,255,255,0.15)', color: '#fff' } : { color: 'rgba(255,255,255,0.4)' }}>Pat</button>
          <button onClick={() => p.onSetPlayMode('song')} className="h-7 px-2 rounded-md text-[9px] uppercase tracking-wide" style={p.playMode === 'song' ? { background: 'rgba(255,255,255,0.15)', color: '#fff' } : { color: 'rgba(255,255,255,0.4)' }}>Song</button>
        </div>
        <span className="font-mono text-[12px] tabular-nums" style={{ color: SELECT }}>{p.doc.bpm.toFixed(0)}</span>
      </div>

      {/* mode dock */}
      <div className="flex border-t border-white/10 flex-none bg-[#0C0C10] pb-[env(safe-area-inset-bottom)]">
        {DOCK.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} className="flex-1 flex flex-col items-center justify-center gap-1 h-14" style={{ color: mode === m.id ? PLAYHEAD : 'rgba(255,255,255,0.4)' }}>
            {m.icon}<span className="text-[9px] font-mono tracking-wide">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
