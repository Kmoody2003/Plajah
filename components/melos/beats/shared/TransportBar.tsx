// Top bar: wordmark, view toggle, BPM (drag/tap), swing, transport, audio-enable state.
// Purple appears here ONLY in the wordmark (brand-chrome rule).

import React, { useCallback, useRef, useState } from 'react';
import { Play, Square, Activity, X, Circle, UploadCloud, OctagonX, Repeat, SlidersHorizontal, Timer } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { PLAYHEAD } from '../theme';
import { MidiActivityLight } from './MidiActivityLight';

export type BeatsViewId = 'machine' | 'glass' | 'timeline' | 'mixer' | 'project';
const VIEWS: { id: BeatsViewId; label: string }[] = [
  { id: 'machine', label: 'MEKA' },
  { id: 'glass', label: 'Glass' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'project', label: 'Project' },
];

interface TransportBarProps {
  doc: GrooveDoc;
  running: boolean;
  suspended: boolean;
  view: BeatsViewId;
  availableViews: BeatsViewId[];
  activePatternId: string;
  playMode: 'pattern' | 'song';
  showDiagnostics: boolean;
  onSetView: (v: BeatsViewId) => void;
  onPlay: () => void;
  onStop: () => void;
  onPanic: () => void;
  onSetBpm: (bpm: number) => void;
  onSetSwing: (swing: number) => void;
  onSetPlayMode: (m: 'pattern' | 'song') => void;
  /** Live playhead position in beats (already loop-wrapped for display). */
  beats: number;
  onSetLoop: (loop: { on: boolean; startBeats: number; endBeats: number }) => void;
  onToggleDiagnostics: () => void;
  onOpenMidi?: () => void;
  midiConnected?: boolean;
  onPublish?: () => void;
  busy?: string | null;
  /** Record arm — pressing Play (or Record while stopped) then records the armed instrument. */
  recording?: boolean;
  onToggleRecord?: () => void;
  /** Metronome click, and the record pre-roll (count-in) in bars: 0, 1 or 2. */
  metronomeOn?: boolean;
  onToggleMetronome?: () => void;
  preRollBars?: number;
  onCyclePreRoll?: () => void;
  /** The File/Edit/View/Options menu bar renders inline, left of the view tabs. */
  menuSlot?: React.ReactNode;
  /** The Melos shell owns navigation — no close button when embedded there. */
  hideClose?: boolean;
  onClose: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = (p) => {
  const bpmDrag = useRef<{ y: number; bpm: number } | null>(null);
  const taps = useRef<number[]>([]);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmText, setBpmText] = useState('');

  const tapTempo = useCallback(() => {
    const now = performance.now();
    taps.current = taps.current.filter((t) => now - t < 3000);
    taps.current.push(now);
    if (taps.current.length >= 3) {
      const iv: number[] = [];
      for (let i = 1; i < taps.current.length; i++) iv.push(taps.current[i] - taps.current[i - 1]);
      const avg = iv.reduce((a, b) => a + b, 0) / iv.length;
      p.onSetBpm(Math.round((60000 / avg) * 10) / 10);
    }
  }, [p]);

  return (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl flex-none">
      {!p.hideClose && (
        <button onClick={p.onClose} aria-label="Close Beats" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <X size={15} />
        </button>
      )}
      <span className="font-black text-[13px] tracking-[0.06em] select-none">
        <span className="bg-gradient-to-br from-[#B84DFF] to-[#D40055] bg-clip-text text-transparent">MELOS</span>
        <span className="text-white/80">&nbsp;· STUDIO</span>
      </span>

      {p.menuSlot}

      <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-[10px] p-0.5">
        {VIEWS.map((v) => {
          const enabled = p.availableViews.includes(v.id);
          const active = p.view === v.id;
          return (
            <button
              key={v.id}
              disabled={!enabled}
              onClick={() => p.onSetView(v.id)}
              title={enabled ? v.label : `${v.label} — coming in this build`}
              className={`h-7 px-3 rounded-lg text-[11px] transition-colors ${active ? 'bg-[#D0BCFF]/20 text-[#D0BCFF] font-semibold' : enabled ? 'text-white/50 hover:text-white' : 'text-white/20 cursor-not-allowed'}`}
            >{v.label}</button>
          );
        })}
      </div>

      <div className="flex-1" />

      {p.suspended && (
        <button onClick={() => { void BeatsEngine.get().init(); }} className="h-8 px-3 rounded-lg text-[11px] font-semibold bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/40 animate-pulse">
          Tap to enable audio
        </button>
      )}

      <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-[10px] p-0.5" title="Play the selected pattern, or the whole arrangement">
        <button onClick={() => p.onSetPlayMode('pattern')} className={`h-7 px-2.5 rounded-lg text-[10px] uppercase tracking-wide ${p.playMode === 'pattern' ? 'bg-white/15 text-white font-semibold' : 'text-white/40 hover:text-white'}`}>Pattern</button>
        <button onClick={() => p.onSetPlayMode('song')} className={`h-7 px-2.5 rounded-lg text-[10px] uppercase tracking-wide ${p.playMode === 'song' ? 'bg-white/15 text-white font-semibold' : 'text-white/40 hover:text-white'}`}>Song</button>
      </div>

      {editingBpm ? (
        <input
          autoFocus
          value={bpmText}
          onChange={(e) => setBpmText(e.target.value)}
          onBlur={() => { const v = parseFloat(bpmText); if (Number.isFinite(v)) p.onSetBpm(Math.max(20, Math.min(300, v))); setEditingBpm(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingBpm(false); }}
          className="w-16 h-8 bg-black/40 border border-white/20 rounded-lg text-center font-mono text-[14px] text-white outline-none"
        />
      ) : (
        <button
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); bpmDrag.current = { y: e.clientY, bpm: p.doc.bpm }; }}
          onPointerMove={(e) => { if (bpmDrag.current) p.onSetBpm(Math.max(20, Math.min(300, Math.round((bpmDrag.current.bpm + (bpmDrag.current.y - e.clientY) * 0.25) * 10) / 10))); }}
          onPointerUp={() => { bpmDrag.current = null; }}
          onDoubleClick={() => { setBpmText(String(p.doc.bpm)); setEditingBpm(true); }}
          className="font-mono text-[15px] font-semibold text-white cursor-ns-resize select-none"
          title="Drag to change · double-click to type"
        >
          {p.doc.bpm.toFixed(1)}<span className="text-[9px] text-white/40 ml-1 tracking-widest">BPM</span>
        </button>
      )}
      <button onClick={tapTempo} className="h-8 px-2.5 rounded-lg text-[11px] border border-white/10 text-white/50 hover:text-white hover:bg-white/10">TAP</button>

      <label className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wide" title="Swing on offbeat 16ths">
        Swing
        <input
          type="range" min={0} max={100} value={Math.round(p.doc.swing * 100)}
          onChange={(e) => p.onSetSwing(Number(e.target.value) / 100)}
          className="w-16 accent-[#FF8C00]"
        />
        <span className="font-mono text-white/60 w-7">{Math.round(p.doc.swing * 100)}%</span>
      </label>

      {/* Position readout — bar.beat.16th, the clock every DAW shows. */}
      {(() => {
        const b = Math.max(0, p.beats);
        const bar = Math.floor(b / 4) + 1;
        const beat = Math.floor(b % 4) + 1;
        const six = Math.floor((b % 1) * 4) + 1;
        return (
          <span className="font-mono text-[13px] text-white/80 tabular-nums select-none w-[70px] text-center" title="Bar . beat . 16th">
            {bar}.{beat}.{six}
          </span>
        );
      })()}

      {/* Loop / cycle: toggle + the in–out range in bars, draggable on the timeline ruler too. */}
      {(() => {
        const loop = p.doc.loop ?? { on: false, startBeats: 0, endBeats: 16 };
        const inBar = Math.floor(loop.startBeats / 4) + 1;
        const outBar = Math.floor(loop.endBeats / 4) + 1;
        const set = (patch: Partial<typeof loop>) => p.onSetLoop({ ...loop, ...patch });
        return (
          <div className="flex items-center gap-1 rounded-[10px] border border-white/10 bg-white/[0.06] p-0.5" title="Cycle: loop the arrangement between the in and out bars (Song mode)">
            <button
              onClick={() => set({ on: !loop.on })}
              aria-label="Toggle loop"
              className={`h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] ${loop.on ? 'text-[#00DAF3] bg-[#00DAF3]/12' : 'text-white/45 hover:text-white'}`}
            ><Repeat size={13} /></button>
            <button onClick={() => set({ startBeats: Math.max(0, loop.startBeats - 4) })} className="w-5 h-6 text-white/40 hover:text-white text-[12px] leading-none" aria-label="Loop in earlier">‹</button>
            <span className="font-mono text-[11px] text-white/70 tabular-nums w-12 text-center">{inBar}–{outBar}</span>
            <button onClick={() => set({ endBeats: loop.endBeats + 4 })} className="w-5 h-6 text-white/40 hover:text-white text-[12px] leading-none" aria-label="Loop out later">›</button>
          </div>
        );
      })()}

      {p.running ? (
        <button onClick={p.onStop} aria-label="Stop" className="w-9 h-8 grid place-items-center rounded-lg bg-white/10 border border-white/15 text-white hover:bg-white/20">
          <Square size={13} fill="currentColor" />
        </button>
      ) : (
        <button onClick={p.onPlay} aria-label="Play" className="w-9 h-8 grid place-items-center rounded-lg font-bold" style={{ background: PLAYHEAD, color: '#061014' }}>
          <Play size={14} fill="currentColor" />
        </button>
      )}

      {/* Record arm — QWERTY and MIDI takes land in clips on the armed track. */}
      {p.onToggleRecord && (
        <button
          onClick={p.onToggleRecord}
          aria-label={p.recording ? 'Recording armed' : 'Arm recording'}
          title={p.recording ? 'Recording armed — notes you play are captured to the armed track' : 'Arm recording (plays with the pre-roll count-in)'}
          className={`w-9 h-8 grid place-items-center rounded-lg border transition-colors ${p.recording ? 'animate-pulse' : ''}`}
          style={p.recording
            ? { background: 'rgba(212,0,85,0.25)', borderColor: '#D40055', color: '#FF4D8C' }
            : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.45)' }}
        >
          <Circle size={13} fill="currentColor" />
        </button>
      )}

      {/* Metronome + pre-roll: click toggles the click, the chip cycles the count-in bars. */}
      {p.onToggleMetronome && (
        <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
          <button
            onClick={p.onToggleMetronome}
            aria-label="Metronome"
            title={p.metronomeOn ? 'Metronome on' : 'Metronome off'}
            className="w-8 h-8 grid place-items-center transition-colors"
            style={p.metronomeOn ? { color: PLAYHEAD, background: 'rgba(0,218,243,0.12)' } : { color: 'rgba(255,255,255,0.4)' }}
          ><Timer size={14} /></button>
          {p.onCyclePreRoll && (
            <button
              onClick={p.onCyclePreRoll}
              title="Pre-roll — count-in bars before a recording starts"
              className="h-8 px-1.5 text-[9px] font-mono border-l border-white/10 transition-colors"
              style={(p.preRollBars ?? 0) > 0 ? { color: PLAYHEAD } : { color: 'rgba(255,255,255,0.35)' }}
            >{(p.preRollBars ?? 0) > 0 ? `${p.preRollBars}bar` : 'pre 0'}</button>
          )}
        </div>
      )}

      {/* Panic — cut every sounding voice. The safety net for a synth note left ringing. */}
      <button
        onClick={p.onPanic}
        aria-label="Panic — stop all sound"
        title="Panic: silence every sounding note"
        className="w-9 h-8 grid place-items-center rounded-lg border border-[#EF4444]/45 text-[#EF4444] hover:bg-[#EF4444]/12"
      >
        <OctagonX size={15} />
      </button>

      {/* Brand gradient is reserved for exactly this: the Publish CTA (and the wordmark).
          Everything else file-shaped (export/import/bounce/Fabula/library/EQ) lives in the
          File and Options menus now — a transport bar is for transport. */}
      <button
        onClick={p.onPublish}
        disabled={!p.onPublish || !!p.busy}
        title="Render the song and publish it to Chora via the Album Creator"
        className="h-8 px-3.5 rounded-lg text-[11px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, #6B0099, #D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}
      >
        <UploadCloud size={12} /> {p.busy === 'publish' ? 'Rendering…' : p.busy === 'bounce' ? 'Rendering…' : 'Publish'}
      </button>

      {p.onOpenMidi && (
        <button onClick={p.onOpenMidi} aria-label="MIDI controllers" title="MIDI controllers — devices and Learn mapping"
          className="w-8 h-8 grid place-items-center rounded-lg border transition-colors relative border-white/10 text-white/40 hover:text-white">
          <SlidersHorizontal size={14} />
          {/* The static dot said "a device exists". This one says what it is DOING — and goes
              amber when notes are arriving that nothing is listening to. */}
          <span className="absolute top-1 right-1">
            <MidiActivityLight connected={!!p.midiConnected} />
          </span>
        </button>
      )}
      <button onClick={p.onToggleDiagnostics} aria-label="Engine diagnostics" className={`w-8 h-8 grid place-items-center rounded-lg border transition-colors ${p.showDiagnostics ? 'border-[#00DAF3]/50 text-[#00DAF3] bg-[#00DAF3]/10' : 'border-white/10 text-white/40 hover:text-white'}`}>
        <Activity size={14} />
      </button>
    </div>
  );
};
