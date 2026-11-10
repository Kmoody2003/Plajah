// Top bar: wordmark, view toggle, BPM (drag/tap), swing, transport, audio-enable state.
// Purple appears here ONLY in the wordmark (brand-chrome rule).

import React, { useCallback, useRef, useState } from 'react';
import { Play, Square, Activity, X, Circle, UploadCloud, OctagonX, Repeat, SlidersHorizontal, Timer, Mic, Spline, ExternalLink } from 'lucide-react';
import type { GrooveDoc, SongKey } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { songTime } from '../../../../services/melos/beats/tempoMap';
import { docKey, keyLabel } from '../../../../services/melos/beats/songKey';
import { NOTE_NAMES_SHARP, SCALES, SCALE_FAMILIES, scaleFamily } from '../../../../services/melos/theory';
import { useContextMenu } from '../../../ui/ContextMenu';

const TIME_SIGS: [number, number][] = [
  [4, 4], [3, 4], [2, 4], [5, 4], [6, 4], [7, 4], [3, 8], [5, 8], [6, 8], [7, 8], [9, 8], [12, 8],
];
import { PLAYHEAD } from '../theme';
import { MidiActivityLight } from './MidiActivityLight';

export type BeatsViewId = 'machine' | 'glass' | 'timeline' | 'mixer' | 'project';
const VIEWS: { id: BeatsViewId; label: string }[] = [
  { id: 'machine', label: 'MEKA' },
  { id: 'glass', label: 'Glass' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'mixer', label: 'Mixer' },
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
  /** Project key (null clears it). */
  onSetKey?: (key: SongKey | null) => void;
  /** Time signature at bar 1 (later changes live on the timeline's meter lane). */
  onSetTimeSig?: (num: number, den: number) => void;
  onSetPlayMode: (m: 'pattern' | 'song') => void;
  /** Live playhead position in beats (already loop-wrapped for display). */
  beats: number;
  onSetLoop: (loop: { on: boolean; startBeats: number; endBeats: number }) => void;
  onToggleDiagnostics: () => void;
  onOpenMidi?: () => void;
  /** Open the Voice panel (sing / hum / beatbox into the project). */
  onOpenVoice?: () => void;
  voiceOpen?: boolean;
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
  /** Tempo track lane on the Timeline — its switch lives beside the BPM it edits. */
  showTempo?: boolean;
  onToggleTempo?: () => void;
  /** Record sources (hardware Inputs…) — sit with the record button. */
  recordSlot?: React.ReactNode;
  /** Collaboration (version chip, Jam, dock) — sits with Publish. */
  shareSlot?: React.ReactNode;
  /** The album project lives a level up; this jumps to it. */
  onOpenProject?: () => void;
  /** The Melos shell owns navigation — no close button when embedded there. */
  hideClose?: boolean;
  onClose: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = (p) => {
  const bpmDrag = useRef<{ y: number; bpm: number } | null>(null);
  const taps = useRef<number[]>([]);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmText, setBpmText] = useState('');
  const { tempo, meter } = songTime(p.doc);
  const sig0 = meter.signatureAtBar(0);
  const key = docKey(p.doc);
  const sigMenu = useContextMenu<void>(() => [
    { kind: 'header', label: 'Time signature · bar 1' },
    ...TIME_SIGS.map(([n, d]) => ({
      id: `${n}/${d}`, label: `${n}/${d}`, checked: sig0.num === n && sig0.den === d,
      onSelect: () => p.onSetTimeSig?.(n, d),
    })),
    { kind: 'separator' },
    { kind: 'header', label: 'Later changes: right-click the Timeline ruler' },
  ]);
  const keyMenu = useContextMenu<void>(() => [
    { kind: 'header', label: key ? `Project key · ${keyLabel(key)}` : 'Project key' },
    {
      id: 'tonic', label: 'Tonic', submenu: NOTE_NAMES_SHARP.map((n, pc) => ({
        id: n, label: n, checked: key?.tonic === pc, keepOpen: true,
        onSelect: () => p.onSetKey?.({ tonic: pc, scale: key?.scale ?? 'major' }),
      })),
    },
    {
      id: 'scale', label: 'Scale', submenu: SCALE_FAMILIES.flatMap((f) => [{ kind: 'header' as const, label: f.name }, ...SCALES.filter((s) => scaleFamily(s) === f.id).map((s) => ({
        id: s.id, label: s.name, checked: (key?.scale ?? '') === s.id, keepOpen: true,
        onSelect: () => p.onSetKey?.({ tonic: key?.tonic ?? 0, scale: s.id }),
      }))]),
    },
    { kind: 'separator' },
    { id: 'clear', label: 'Clear key', disabled: !key, onSelect: () => p.onSetKey?.(null) },
  ]);
  // With a tempo track the readout follows the playhead; dragging still edits the start tempo.
  const shownBpm = !tempo.isConstant && p.running ? tempo.bpmAt(Math.max(0, p.beats)) : p.doc.bpm;

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

  // Pattern | Song only means something where patterns are auditioned (MEKA, Glass). The
  // Timeline always plays the song, so the switch leaves the bar there.
  const showPlayMode = p.view === 'machine' || p.view === 'glass';
  const loop = p.doc.loop ?? { on: false, startBeats: 0, endBeats: 16 };
  const inBar = meter.at(loop.startBeats).bar + 1;
  const outBar = Math.round(meter.beatToBar(loop.endBeats)) + 1;
  const prevBarStart = (beat: number) => { const b = meter.at(beat); return meter.barToBeat(Math.max(0, b.bar - (b.beatInBar > 1e-6 ? 0 : 1))); };
  const nextBarStart = (beat: number) => { const b = meter.at(beat); return b.startBeat + b.lenBeats; };
  const setLoop = (patch: Partial<typeof loop>) => p.onSetLoop({ ...loop, ...patch });
  const chip = 'h-7 px-2 rounded-lg text-[11px] shrink-0 whitespace-nowrap transition-colors';

  return (
    <div className="flex items-center gap-2.5 xl:gap-3.5 px-3 xl:px-4 h-14 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl flex-none overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {!p.hideClose && (
        <button onClick={p.onClose} aria-label="Close Chora Studio" className="w-8 h-8 shrink-0 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <X size={15} />
        </button>
      )}
      <span className="font-black text-[13px] tracking-[0.06em] select-none shrink-0 whitespace-nowrap">
        <span className="bg-gradient-to-br from-[#B84DFF] to-[#D40055] bg-clip-text text-transparent">CHORA</span>
        <span className="text-white/80">&nbsp;· STUDIO</span>
      </span>

      {p.menuSlot}

      {/* ── WORKFLOW: which way of working ── */}
      <Cluster label="Workflow">
        {VIEWS.filter((v) => p.availableViews.includes(v.id)).map((v) => {
          const active = p.view === v.id;
          return (
            <button key={v.id} onClick={() => p.onSetView(v.id)} title={v.label}
              className={`${chip} px-3 ${active ? 'bg-[#D0BCFF]/20 text-[#D0BCFF] font-semibold' : 'text-white/50 hover:text-white'}`}
            >{v.label}</button>
          );
        })}
        {p.onOpenProject && (
          <button onClick={p.onOpenProject} title="Open this song's album project" className={`${chip} flex items-center gap-1 ${p.view === 'project' ? 'bg-[#D0BCFF]/20 text-[#D0BCFF] font-semibold' : 'text-white/40 hover:text-white'}`}>
            Project <ExternalLink size={10} />
          </button>
        )}
      </Cluster>

      <div className="flex-1 min-w-2" />

      {p.suspended && (
        <button onClick={() => { void BeatsEngine.get().init(); }} className="h-8 px-3 rounded-lg text-[11px] font-semibold bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/40 animate-pulse shrink-0 whitespace-nowrap">
          Tap to enable audio
        </button>
      )}

      {/* ── SONG: tempo (with its tempo track), meter, key, feel ── */}
      <Cluster label="Song">
        {editingBpm ? (
          <input
            autoFocus
            value={bpmText}
            onChange={(e) => setBpmText(e.target.value)}
            onBlur={() => { const v = parseFloat(bpmText); if (Number.isFinite(v)) p.onSetBpm(Math.max(20, Math.min(300, v))); setEditingBpm(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingBpm(false); }}
            className="w-16 h-7 shrink-0 bg-black/40 border border-white/20 rounded-lg text-center font-mono text-[13px] text-white outline-none"
          />
        ) : (
          <button
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); bpmDrag.current = { y: e.clientY, bpm: p.doc.bpm }; }}
            onPointerMove={(e) => { if (bpmDrag.current) p.onSetBpm(Math.max(20, Math.min(300, Math.round((bpmDrag.current.bpm + (bpmDrag.current.y - e.clientY) * 0.25) * 10) / 10))); }}
            onPointerUp={() => { bpmDrag.current = null; }}
            onDoubleClick={() => { setBpmText(String(p.doc.bpm)); setEditingBpm(true); }}
            className="h-7 px-2 font-mono text-[14px] font-semibold text-white cursor-ns-resize select-none shrink-0 whitespace-nowrap"
            title={tempo.isConstant ? 'Drag to change · double-click to type' : 'Tempo at the playhead (tempo track) · drag to change the start tempo · double-click to type'}
          >
            {shownBpm.toFixed(1)}<span className="text-[8.5px] text-white/40 ml-1 tracking-widest">{tempo.isConstant ? 'BPM' : 'BPM·TRK'}</span>
          </button>
        )}
        <button onClick={tapTempo} className={`${chip} text-white/50 hover:text-white`} title="Tap the beat to set the tempo">TAP</button>
        {p.onToggleTempo && (
          <button onClick={p.onToggleTempo} aria-pressed={!!p.showTempo} title="Tempo track — tempo changes and ramps along the song (shown on the Timeline)"
            className={`${chip} flex items-center gap-1`} style={{ color: p.showTempo ? '#FFD166' : 'rgba(255,255,255,0.45)', background: p.showTempo ? 'rgba(255,209,102,0.12)' : undefined }}>
            <Spline size={12} /> Tempo
          </button>
        )}
        {p.onSetTimeSig && (
          <button onClick={(e) => sigMenu.openFrom(e.currentTarget, undefined)} title="Time signature (bar 1) — later changes: right-click the Timeline ruler"
            className={`${chip} font-mono text-white/70 hover:text-white`}
          >{sig0.num}/{sig0.den}{(p.doc.meter ?? []).some((m) => m.bar > 0) ? '*' : ''}</button>
        )}
        {p.onSetKey && (
          <button onClick={(e) => keyMenu.openFrom(e.currentTarget, undefined)} title="Project key — the piano roll, hum-to-MIDI and the composers write in it"
            className={`${chip} ${key ? 'text-white/80 hover:text-white' : 'text-white/35 hover:text-white'}`}
          >{key ? keyLabel(key) : 'Key'}</button>
        )}
        {sigMenu.node}
        {keyMenu.node}
        <label className="flex items-center gap-1 px-1.5 text-[10px] text-white/40 shrink-0 whitespace-nowrap" title="Swing on offbeat 16ths">
          Swing
          <input type="range" min={0} max={100} value={Math.round(p.doc.swing * 100)} onChange={(e) => p.onSetSwing(Number(e.target.value) / 100)} className="w-12 accent-[#FF8C00]" aria-label="Swing" />
          <span className="font-mono text-white/60 w-7">{Math.round(p.doc.swing * 100)}%</span>
        </label>
      </Cluster>

      {/* ── PLAY: cycle, transport, the clock beside Play, click ── */}
      <Cluster label="Play">
        {showPlayMode && (
          <div className="flex gap-0.5 mr-0.5" title="Pattern auditions the selected pattern(s) · Song plays the arrangement">
            <button onClick={() => p.onSetPlayMode('pattern')} className={`${chip} text-[10px] uppercase tracking-wide ${p.playMode === 'pattern' ? 'bg-white/15 text-white font-semibold' : 'text-white/40 hover:text-white'}`}>Pattern</button>
            <button onClick={() => p.onSetPlayMode('song')} className={`${chip} text-[10px] uppercase tracking-wide ${p.playMode === 'song' ? 'bg-white/15 text-white font-semibold' : 'text-white/40 hover:text-white'}`}>Song</button>
          </div>
        )}
        <button onClick={() => setLoop({ on: !loop.on })} aria-label="Toggle loop" title="Cycle: loop between the in and out bars"
          className={`${chip} flex items-center ${loop.on ? 'text-[#00DAF3] bg-[#00DAF3]/12' : 'text-white/45 hover:text-white'}`}><Repeat size={13} /></button>
        <button onClick={() => setLoop({ startBeats: prevBarStart(loop.startBeats) })} className="w-4 h-6 text-white/40 hover:text-white text-[12px] leading-none shrink-0" aria-label="Loop in earlier">‹</button>
        <span className="font-mono text-[11px] text-white/70 tabular-nums min-w-[38px] text-center whitespace-nowrap" title="Cycle in–out bars">{inBar}–{outBar}</span>
        <button onClick={() => setLoop({ endBeats: nextBarStart(loop.endBeats) })} className="w-4 h-6 text-white/40 hover:text-white text-[12px] leading-none shrink-0" aria-label="Loop out later">›</button>
        <button onClick={p.onStop} aria-label="Stop" className="w-8 h-7 shrink-0 grid place-items-center rounded-lg text-white/80 hover:bg-white/10"><Square size={12} fill="currentColor" /></button>
        <button onClick={p.running ? p.onStop : p.onPlay} aria-label={p.running ? 'Stop' : 'Play'} className="w-9 h-7 shrink-0 grid place-items-center rounded-lg font-bold"
          style={p.running ? { background: 'rgba(0,218,243,0.18)', color: PLAYHEAD } : { background: PLAYHEAD, color: '#061014' }}>
          <Play size={13} fill="currentColor" />
        </button>
        {/* Counts follow the meter: in 6/8 the middle number counts eighths. */}
        <span className="font-mono text-[13px] text-white tabular-nums select-none w-[62px] text-center shrink-0 whitespace-nowrap" title="Bar . beat . 16th">
          {meter.formatPosition(Math.max(0, p.beats))}
        </span>
        {p.onToggleMetronome && (
          <button onClick={p.onToggleMetronome} aria-label="Metronome" title={p.metronomeOn ? 'Metronome on' : 'Metronome off'}
            className="w-7 h-7 shrink-0 grid place-items-center rounded-lg transition-colors"
            style={p.metronomeOn ? { color: PLAYHEAD, background: 'rgba(0,218,243,0.12)' } : { color: 'rgba(255,255,255,0.4)' }}
          ><Timer size={13} /></button>
        )}
      </Cluster>

      {/* ── RECORD: arm, its count-in, and where the sound comes from ── */}
      {(p.onToggleRecord || p.recordSlot || p.onOpenVoice) && (
        <Cluster label="Record">
          {p.onToggleRecord && (
            <button onClick={p.onToggleRecord} aria-label={p.recording ? 'Recording armed' : 'Arm recording'}
              title={p.recording ? 'Recording armed — notes you play are captured to the armed track' : 'Arm recording (plays with the pre-roll count-in)'}
              className={`w-8 h-7 shrink-0 grid place-items-center rounded-lg transition-colors ${p.recording ? 'animate-pulse' : ''}`}
              style={p.recording ? { background: 'rgba(212,0,85,0.25)', color: '#FF4D8C' } : { color: 'rgba(255,77,140,0.7)' }}
            ><Circle size={12} fill="currentColor" /></button>
          )}
          {p.onCyclePreRoll && (
            <button onClick={p.onCyclePreRoll} title="Pre-roll — count-in bars before a recording starts"
              className={`${chip} font-mono text-[9.5px]`} style={(p.preRollBars ?? 0) > 0 ? { color: PLAYHEAD } : { color: 'rgba(255,255,255,0.35)' }}
            >{(p.preRollBars ?? 0) > 0 ? `${p.preRollBars} bar in` : 'no count'}</button>
          )}
          {p.recordSlot}
          {p.onOpenVoice && (
            <button onClick={p.onOpenVoice} aria-label="Voice" title="Voice — sing or hum into the armed track, beatbox into the pads"
              className={`${chip} flex items-center gap-1 ${p.voiceOpen ? 'text-[#FF4D8C] bg-[#FF4D8C]/10' : 'text-white/50 hover:text-white'}`}><Mic size={12} /> Voice</button>
          )}
        </Cluster>
      )}

      <div className="flex-1 min-w-2" />

      {/* ── SHARE: collaborate, then publish ── */}
      <Cluster label="Share">
        {p.shareSlot}
        {/* Brand gradient is reserved for exactly this: the Publish CTA (and the wordmark). */}
        <button onClick={p.onPublish} disabled={!p.onPublish || !!p.busy} title="Render the song and publish it to Chora via the Album Creator"
          className="h-7 px-3 rounded-lg text-[11px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-40 shrink-0 whitespace-nowrap"
          style={{ background: 'linear-gradient(135deg, #6B0099, #D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}
        ><UploadCloud size={12} /> {p.busy === 'publish' || p.busy === 'bounce' ? 'Rendering…' : 'Publish'}</button>
      </Cluster>

      {/* ── SYSTEM: panic, controllers, engine health ── */}
      <Cluster label="System">
        <button onClick={p.onPanic} aria-label="Panic — stop all sound" title="Panic: silence every sounding note"
          className="w-7 h-7 shrink-0 grid place-items-center rounded-lg text-[#EF4444] hover:bg-[#EF4444]/12"><OctagonX size={14} /></button>
        {p.onOpenMidi && (
          <button onClick={p.onOpenMidi} aria-label="MIDI controllers" title="MIDI controllers — devices and Learn mapping"
            className="w-7 h-7 shrink-0 grid place-items-center rounded-lg relative text-white/45 hover:text-white">
            <SlidersHorizontal size={13} />
            {/* Says what MIDI is DOING — amber when notes arrive that nothing is listening to. */}
            <span className="absolute top-0.5 right-0.5"><MidiActivityLight connected={!!p.midiConnected} /></span>
          </button>
        )}
        <button onClick={p.onToggleDiagnostics} aria-label="Engine diagnostics" title="Engine diagnostics"
          className={`w-7 h-7 shrink-0 grid place-items-center rounded-lg transition-colors ${p.showDiagnostics ? 'text-[#00DAF3] bg-[#00DAF3]/10' : 'text-white/40 hover:text-white'}`}><Activity size={13} /></button>
      </Cluster>
    </div>
  );
};

/** A labelled transport cluster — the tiny caption says what the group is FOR. */
const Cluster: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5 shrink-0">
    <span className="text-[8px] uppercase tracking-[0.18em] text-white/30 font-semibold pl-1 leading-none select-none">{label}</span>
    <div className="flex items-center gap-0.5 bg-white/[0.06] border border-white/10 rounded-[10px] p-0.5 shrink-0">{children}</div>
  </div>
);
