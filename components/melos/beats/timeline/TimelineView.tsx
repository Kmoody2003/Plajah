// The Timeline — Bitwig Arranger / Studio One arrangement paradigm (approved mockup 05):
// track headers left, clip lanes over a bar ruler right, cyan playhead, H-zoom, snap, and the
// docked mixer underneath. Edits GrooveDoc.arrangement directly; imported .dawproject tracks
// land here, with preserved plugin tracks dimmed.
// Grammar: double-click empty lane = paint the active pattern · drag = move (bar snap) ·
// right-edge grip = trim (beat snap) · click = select · Delete = remove · drop audio = clip.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Music2, AudioWaveform, Piano, Circle, MousePointer2, Pencil, Scissors, Combine, Eraser, Scan, LocateFixed, FolderPlus, Sparkles, Layers, Loader2 } from 'lucide-react';
import { unzipSync } from 'fflate';
import type { GrooveDoc, Pattern, TimelineClip, InstrumentType } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { sendInstrumentTrackToPad, addInstrument } from '../../../../services/melos/beats/instrumentFactory';
import { runHolisticEnsemblePipeline } from '../../../../services/melos/generation/holisticEnsemblePipeline';
import { ensembleVoicePatch } from '../../../../services/melos/generation/instrumentKnowledge';
import ProgressionBrowser from '../composer/ProgressionBrowser';
import HumRecorder from '../composer/HumRecorder';
import PromptComposer from '../composer/PromptComposer';
import { progressionToClip } from '../../../../services/melos/composition/progressionToClip';
import { midiFileToClip } from '../../../../services/melos/composition/midiFileImport';
import { useContextMenu, type MenuNode } from '../../../ui/ContextMenu';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample, backupToLocker } from '../../../../services/melos/beats/sampleStore';
import { MixerPanel } from '../shared/MixerPanel';
import { PianoRoll } from './PianoRoll';
import { TimelineEditPanel } from './TimelineEditPanel';
import { InstrumentPanel } from '../instrument/InstrumentPanel';
import { ClipLauncher } from './ClipLauncher';
import { useUniversalMarquee, useUniversalMultiSelect } from '../../../../hooks/useUniversalMultiSelect';
import { songTime } from '../../../../services/melos/beats/tempoMap';
import { DEFAULT_GRID, GRID_DIVS, gridCellBeats, gridLabel, snapBeat, type GridSettings } from '../../../../services/melos/beats/snapGrid';
import {
  audioLengthBeats, splitClipAt, trimClipStart, slipClip, setClipLoop, clipIsLooped, consolidateClip, glueWithNext,
  copyClips, pasteClips, type ClipClipboard,
} from '../../../../services/melos/beats/clipEdit';
import { contentWindows, noteOccurrences } from '../../../../services/melos/beats/clipContent';
import { docKey, keyLabel, parseKey } from '../../../../services/melos/beats/songKey';
import { TempoLane, TimelineGrid } from './TempoLane';
import { TrackAutomation } from './TrackAutomation';
import { ArrangerLane } from './ArrangerLane';
import { CouncilComposerPanel } from '../council/CouncilComposerPanel';
import { syncSongFromSections } from '../../../../services/melos/beats/songSections';
import { downloadMidi, exportClipMidi, exportTrackMidi } from '../../../../services/melos/beats/midiExport';

import { PLAYHEAD, SELECT, glassPanel } from '../theme';
import {
  playRealtimeSympMovement,
  stopRealtimeSympPlayback,
  seekRealtimeSympPlayback,
} from '../../../../services/melos/melosRealtimeSympPlayer';

const LANE_H = 44;
const PAD_LANE_H = 28;
const STEPS_PER_BEAT = 4;

// Bars come from the doc's meter map (time-signature changes), never a fixed 4 beats. Each helper
// takes the doc so callbacks read the CURRENT meter (the doc passed to a mutate), not a stale one.
/** Start of the bar containing `beat`. */
const barFloorOf = (doc: GrooveDoc, beat: number) => songTime(doc).meter.at(Math.max(0, beat)).startBeat;
/** Beats spanned by `bars` whole bars starting at the bar line `fromBeat`. */
const barsSpan = (doc: GrooveDoc, fromBeat: number, bars: number) => {
  const m = songTime(doc).meter;
  return m.barToBeat(m.at(Math.max(0, fromBeat)).bar + bars) - fromBeat;
};
/** Length from `startBeats` that covers `relEnd` beats, rounded up to a whole bar (min one bar). */
const barCeilSpan = (doc: GrooveDoc, startBeats: number, relEnd: number) => {
  const m = songTime(doc).meter;
  const end = startBeats + relEnd;
  const b = m.at(end);
  const ceil = b.beatInBar < 1e-6 ? end : b.startBeat + b.lenBeats;
  return Math.max(ceil, startBeats + m.at(startBeats).lenBeats) - startBeats;
};
/** Bars between two beats (fractional), for readouts. */
const barsBetween = (doc: GrooveDoc, a: number, b: number) => {
  const m = songTime(doc).meter;
  return m.beatToBar(b) - m.beatToBar(a);
};
const RULER_SIGS: [number, number][] = [
  [4, 4], [3, 4], [2, 4], [5, 4], [6, 4], [7, 4], [3, 8], [5, 8], [6, 8], [7, 8], [9, 8], [12, 8],
];
const GRID_KEY = 'melos:timeline:grid';
const loadGrid = (): GridSettings => {
  try { const g = JSON.parse(localStorage.getItem(GRID_KEY) || 'null'); if (g && g.mode && g.div) return { ...DEFAULT_GRID, ...g }; } catch { /* */ }
  return DEFAULT_GRID;
};
const TRACK_COLORS = ['#00DAF3', '#FF8C00', '#B84DFF', '#06D6A0', '#FF4D8D', '#FFD166', '#5B8CFF', '#F78C6C'];
const CLIP_SWATCHES = ['#00DAF3', '#FF8C00', '#B84DFF', '#06D6A0', '#FF4D8D', '#FFD166', '#5B8CFF', '#F78C6C', '#EAEAEA', '#6B7280'];

const audioPeaks = (buffer: AudioBuffer, count = 320): number[] => {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const step = Math.max(1, Math.floor(buffer.length / count));
  return Array.from({ length: Math.min(count, Math.ceil(buffer.length / step)) }, (_, i) => {
    let peak = 0;
    const end = Math.min(buffer.length, (i + 1) * step);
    for (let x = i * step; x < end; x += Math.max(1, Math.floor(step / 24))) {
      for (const ch of channels) peak = Math.max(peak, Math.abs(ch[x] || 0));
    }
    return Math.round(peak * 1000) / 1000;
  });
};

/** Lightweight onset autocorrelation. It is intentionally conservative: uncertain files return
 * null, so Melos never offers to change the master tempo from a weak guess. */
const detectTempo = (buffer: AudioBuffer): number | null => {
  const data = buffer.getChannelData(0); const rate = buffer.sampleRate;
  const hop = Math.max(128, Math.round(rate / 200)); const energy: number[] = [];
  for (let i = 0; i < Math.min(data.length, rate * 90); i += hop) {
    let e = 0; for (let j = i; j < Math.min(data.length, i + hop); j++) e += data[j] * data[j];
    energy.push(Math.sqrt(e / hop));
  }
  const onset = energy.map((v, i) => Math.max(0, v - (energy[i - 1] || 0)));
  let best = 0, bestBpm = 0;
  for (let bpm = 60; bpm <= 190; bpm++) {
    const lag = Math.round((60 / bpm) * rate / hop); let score = 0;
    for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
    if (score > best) { best = score; bestBpm = bpm; }
  }
  return bestBpm && best > 0.00001 ? bestBpm : null;
};

const expandDroppedFiles = async (files: File[]): Promise<File[]> => {
  const out: File[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) { out.push(file); continue; }
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    for (const [name, bytes] of Object.entries(entries)) {
      if (/\.(wav|mp3|ogg|flac|m4a|aif|aiff)$/i.test(name) && !name.endsWith('/')) out.push(new File([bytes], name.split('/').pop() || name));
    }
  }
  return out;
};

/** One pattern clip projected onto a pad lane: where it sits, which pattern it plays, and this
 *  pad's own loop length inside it (`clip.padLens[padIdx]`, defaulting to the pattern length). */
interface PadClipWindow {
  trackId: string;
  clipId: string;
  startBeats: number;
  lengthBeats: number;
  pattern: Pattern;
  padLen: number;
}

// One MEKA pad's lane on the arrangement — the SAME channel the mixer and Glass drive, surfaced
// here as a track. Steps draw ONLY inside the pattern clips that actually play them (the lane
// used to tile the grid to infinity, which lied about what would sound). Each clip window shows
// the pad's own loop cycle bright and its repeats dimmed; the cycle boundary is draggable, so a
// pad can run a shorter independent loop inside the same clip (Bitwig-style polymeter).
const PadLane: React.FC<{
  padIdx: number; color: string;
  windows: PadClipWindow[];
  pxPerBeat: number; contentW: number;
  onToggle: (patternId: string, localStep: number) => void;
  onSetPadLen: (trackId: string, clipId: string, len: number | null) => void;
}> = ({ padIdx, color, windows, pxPerBeat, contentW, onToggle, onSetPadLen }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const stepW = pxPerBeat / STEPS_PER_BEAT;
  const sig = windows.map((w) => {
    const steps = w.pattern.steps[padIdx] || {};
    return `${w.clipId}:${w.startBeats}:${w.lengthBeats}:${w.padLen}:${Object.keys(steps).filter((k) => steps[Number(k)]?.v).join('.')}`;
  }).join(',');
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const g = cv.getContext('2d'); if (!g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = contentW * dpr; cv.height = PAD_LANE_H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, contentW, PAD_LANE_H);
    for (const w of windows) {
      const x0 = w.startBeats * pxPerBeat;
      const wpx = w.lengthBeats * pxPerBeat;
      // The clip body — so every pad visibly HAS a clip for the arrangement window it plays.
      g.fillStyle = color; g.globalAlpha = 0.09;
      g.fillRect(x0 + 0.5, 1.5, Math.max(2, wpx - 1.5), PAD_LANE_H - 3);
      g.globalAlpha = 0.35;
      g.strokeStyle = color;
      g.strokeRect(x0 + 0.5, 1.5, Math.max(2, wpx - 1.5), PAD_LANE_H - 3);
      const steps = w.pattern.steps[padIdx] || {};
      const totalSteps = Math.round(w.lengthBeats * STEPS_PER_BEAT);
      for (let s = 0; s < totalSteps; s++) {
        const local = ((s % w.padLen) + w.padLen) % w.padLen;
        const st = steps[local];
        if (!st?.v) continue;
        const x = x0 + s * stepW;
        if (x >= x0 + wpx - 0.5) break;
        const h = Math.max(4, (PAD_LANE_H - 8) * (st.v / 127));
        g.fillStyle = color;
        g.globalAlpha = s < w.padLen ? 0.9 : 0.42; // first cycle bright, repeats dimmed
        g.fillRect(x + 0.5, (PAD_LANE_H - h) / 2, Math.max(2, Math.min(stepW - 1.5, x0 + wpx - x)), h);
      }
      // Loop-cycle boundaries inside the clip.
      g.globalAlpha = 0.25; g.fillStyle = '#fff';
      for (let s = w.padLen; s < totalSteps; s += w.padLen) {
        const x = x0 + s * stepW;
        if (x >= x0 + wpx) break;
        g.fillRect(x, 2, 1, PAD_LANE_H - 4);
      }
    }
    g.globalAlpha = 1;
  }, [sig, color, padIdx, stepW, pxPerBeat, contentW, windows]);

  const dragLen = (w: PadClipWindow) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX;
    const startLen = w.padLen;
    const move = (ev: PointerEvent) => {
      const dSteps = Math.round((ev.clientX - startX) / stepW);
      const len = Math.max(1, Math.min(w.pattern.length, startLen + dSteps));
      onSetPadLen(w.trackId, w.clipId, len >= w.pattern.length ? null : len);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div className="relative" style={{ width: contentW, height: PAD_LANE_H }}>
      <canvas
        ref={ref}
        style={{ width: contentW, height: PAD_LANE_H, display: 'block', cursor: 'pointer' }}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const beats = (e.clientX - r.left) / pxPerBeat;
          const w = windows.find((x) => beats >= x.startBeats && beats < x.startBeats + x.lengthBeats);
          if (!w) return;
          const gstep = Math.floor((beats - w.startBeats) * STEPS_PER_BEAT);
          onToggle(w.pattern.id, ((gstep % w.padLen) + w.padLen) % w.padLen);
        }}
        title="Click a step to toggle it — steps play only inside their clips. Drag the ◆ grip to give this pad its own loop length."
      />
      {/* per-clip loop-length grips — one draggable boundary at the end of the pad's first cycle */}
      {windows.map((w) => {
        const gx = w.startBeats * pxPerBeat + Math.min(w.padLen * stepW, w.lengthBeats * pxPerBeat) - 3;
        return (
          <span
            key={w.clipId}
            onPointerDown={dragLen(w)}
            className="absolute top-0 bottom-0 w-[7px] cursor-ew-resize"
            style={{ left: gx, background: 'transparent' }}
            title={`${w.padLen} step loop — drag to change this pad's clip length`}
          >
            <span className="absolute top-1/2 -translate-y-1/2 left-[2px] w-[3px] h-[10px] rounded-[1px]" style={{ background: `${color}CC` }} />
          </span>
        );
      })}
    </div>
  );
};

interface TimelineViewProps {
  doc: GrooveDoc;
  activePattern: Pattern;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  /** The stopped/parked song position (the playhead rests here; defaults to bar 1). */
  songStartBeats?: number;
  meters: { groups: number[]; master: number; sends: number[] };
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onPlayFrom: (fromBeats: number) => void;
  /** Room-owned: open a specific instrument's panel (so the add-picker can too). */
  onOpenInstrument?: (id: string) => void;
  /** Room-owned: open the instrument picker (choose ONDA/KERA/…). */
  onAddInstrument?: (dest: 'meka' | 'track') => void;
}

export const TimelineView: React.FC<TimelineViewProps> = (p) => {
  const [headerW, setHeaderW] = useState(() => Math.max(132, Math.min(360, Number(localStorage.getItem('melos:timeline:header-width')) || 172)));
  const [pxPerBeat, setPxPerBeat] = useState(14);
  const clipSelection = useUniversalMultiSelect(p.doc.arrangement.flatMap(track => track.clips.map(clip => clip.id)));
  const selectedClip = clipSelection.primaryId;
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  // Per-track lane height drag (Bitwig-style). Live-preview in local state, commit on release.
  const [laneDrag, setLaneDrag] = useState<{ id: string; h: number } | null>(null);
  const laneHeightOf = (track: { id: string; laneH?: number }) =>
    (laneDrag && laneDrag.id === track.id) ? laneDrag.h : (track.laneH || LANE_H);
  const startLaneResize = (trackId: string, startH: number, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY;
    let latest = startH;
    const move = (ev: PointerEvent) => { latest = Math.max(28, Math.min(320, startH + (ev.clientY - startY))); setLaneDrag({ id: trackId, h: latest }); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === trackId); if (t) t.laneH = latest; });
      setLaneDrag(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const clipboardRef = useRef<ClipClipboard | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const colorTargetRef = useRef<{ trackId: string; clipId: string } | null>(null);
  const [showMixer, setShowMixer] = useState(true);
  const [showPads, setShowPads] = useState(true);
  const [followPlayhead, setFollowPlayhead] = useState(() => localStorage.getItem('melos:timeline:follow') !== '0');
  const [ingest, setIngest] = useState<{ done: number; total: number; name: string } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const marqueeSurfaceRef = useRef<HTMLDivElement>(null);
  const marqueeSelection = useUniversalMarquee(marqueeSurfaceRef, clipSelection);
  const [showEditor, setShowEditor] = useState(true);
  const [showLauncher, setShowLauncher] = useState(() => localStorage.getItem('plajah_beats_launcher') !== '0');
  const toggleLauncher = () => setShowLauncher((v) => { try { localStorage.setItem('plajah_beats_launcher', v ? '0' : '1'); } catch { /* */ } return !v; });
  const [editorH, setEditorH] = useState(240);
  const [openClip, setOpenClip] = useState<{ trackId: string; clipId: string } | null>(null);
  const [sympStreaming, setSympStreaming] = useState<{ playing: boolean; currentTime: number; duration: number; sectionLabel: string }>({
    playing: false,
    currentTime: 0,
    duration: 0,
    sectionLabel: '',
  });
  // Auto-select the Lead MPE clip when a Chora DAW Showcase Template loads so the docked MPE clip editor is immediately visible.
  useEffect(() => {
    if (!p.doc.showcaseMetadata?.isShowcaseTemplate) return;
    const mvtIdx = p.doc.showcaseMetadata.trackIndex ?? p.doc.showcaseMetadata.activeMovementIdx ?? 0;
    const leadTrack = p.doc.arrangement.find((t) => t.kind === 'instrument' && !t.padOwned && t.clips.length > 0)
      || p.doc.arrangement.find((t) => t.kind === 'instrument' && t.clips.length > 0);
    if (leadTrack) {
      const targetClip = leadTrack.clips[mvtIdx] || leadTrack.clips[0];
      if (targetClip) {
        clipSelection.selectOnly(targetClip.id);
      }
    }
  }, [p.doc.name, p.doc.showcaseMetadata?.bookThemeId, p.doc.showcaseMetadata?.bookId, p.doc.showcaseMetadata?.trackIndex, p.doc.showcaseMetadata?.activeMovementIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const [renamingPad, setRenamingPad] = useState<number | null>(null);
  const [renamingTrack, setRenamingTrack] = useState<string | null>(null);
  const [nameText, setNameText] = useState('');
  // The Bitwig tool set: pointer selects/moves/trims, pencil paints clips, knife splits at the
  // click, glue joins a clip with the next one on its track, eraser deletes on click. 1–5 keys.
  type Tool = 'select' | 'pencil' | 'knife' | 'glue' | 'eraser';
  const [tool, setTool] = useState<Tool>('select');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, Tool> = { '1': 'select', '2': 'pencil', '3': 'knife', '4': 'glue', '5': 'eraser' };
      if (map[e.key]) setTool(map[e.key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Opening an instrument is owned by the room now (so the add-instrument picker can open one
  // from any view), and this view just asks. A local fallback keeps it working standalone.
  const [localOpen, setLocalOpen] = useState<string | null>(null);
  const openInstrument = p.onOpenInstrument ? null : localOpen;
  const requestOpen = (id: string) => (p.onOpenInstrument ? p.onOpenInstrument(id) : setLocalOpen(id));
  // Clip gestures (Bitwig grammar): drag = move · right edge = trim end · left edge = trim start
  // (the window opens/closes, content stays put) · Alt-drag = slip the content under the window ·
  // Ctrl/⌘-drag = copy. Shift mid-drag bypasses the grid. One undo step per gesture.
  const drag = useRef<{
    clipId: string;
    trackId: string;
    mode: 'move' | 'trim' | 'trimL' | 'slip' | 'copy';
    startX: number;
    orig: TimelineClip;
    members: { trackId: string; clip: TimelineClip; copyId?: string }[];
    targetTrackId?: string;
    moved?: boolean;
  } | null>(null);

  // The time axis: tempo + meter maps (memoised on the doc's signature) and the snap grid.
  const { tempo, meter } = songTime(p.doc);
  const [grid, setGridState] = useState<GridSettings>(loadGrid);
  const setGrid = (g: GridSettings) => { setGridState(g); try { localStorage.setItem(GRID_KEY, JSON.stringify(g)); } catch { /* */ } };
  const [showTempo, setShowTempo] = useState(() => localStorage.getItem('melos:timeline:tempo') === '1' || !!p.doc.tempoMap?.length);
  /** Snap a beat to the grid; Shift or Alt held during the gesture bypasses it. */
  const snapAt = (beat: number, e?: { shiftKey?: boolean; altKey?: boolean }, how?: 'nearest' | 'floor' | 'ceil') =>
    snapBeat(beat, grid, meter, pxPerBeat, { bypass: !!(e?.shiftKey || e?.altKey), how });
  const gridMenu = useContextMenu<void>(() => [
    { kind: 'header', label: 'Snap grid' },
    { id: 'adaptive', label: 'Adaptive (follows zoom)', checked: grid.mode === 'adaptive', onSelect: () => setGrid({ ...grid, mode: 'adaptive' }) },
    { id: 'fixed', label: 'Fixed', checked: grid.mode === 'fixed', onSelect: () => setGrid({ ...grid, mode: 'fixed' }) },
    { id: 'off', label: 'Off', checked: grid.mode === 'off', onSelect: () => setGrid({ ...grid, mode: 'off' }) },
    { kind: 'separator' },
    { kind: 'header', label: grid.mode === 'adaptive' ? 'Coarsest division' : 'Division' },
    ...GRID_DIVS.map((div) => ({
      id: `div-${div}`, label: div === 'bar' ? 'Bar' : div, checked: grid.div === div, disabled: grid.mode === 'off',
      onSelect: () => setGrid({ ...grid, div, mode: grid.mode === 'off' ? 'fixed' : grid.mode }),
    })),
    { kind: 'separator' },
    { id: 'triplet', label: 'Triplet', checked: grid.triplet, disabled: grid.mode === 'off', onSelect: () => setGrid({ ...grid, triplet: !grid.triplet }) },
  ]);
  // Ruler right-click: a time-signature change starting at that bar (bar 1 edits the song meter).
  const rulerMenu = useContextMenu<number>((bar) => {
    const cur = meter.signatureAtBar(bar);
    const hasChange = (p.doc.meter ?? []).some((m) => m.bar === bar);
    const setSig = (num: number, den: number) => p.onMutate((d) => {
      const rest = (d.meter ?? []).filter((m) => m.bar !== bar);
      d.meter = [...rest, { bar, num, den }].sort((a, b) => a.bar - b.bar);
      // Drop changes that restate the signature already in force (keeps the list honest).
      d.meter = d.meter.filter((m, i, a) => {
        const prev = i === 0 ? { num: 4, den: 4 } : a[i - 1];
        return !(m.num === prev.num && m.den === prev.den);
      });
      if (!d.meter.length) delete d.meter;
      syncSongFromSections(d); // song sections are counted in bars
    });
    return [
      { kind: 'header', label: `Bar ${bar + 1} · ${cur.num}/${cur.den}` },
      {
        id: 'sig', label: bar === 0 ? 'Time signature' : 'Change time signature here', submenu: RULER_SIGS.map(([n, dd]) => ({
          id: `${n}/${dd}`, label: `${n}/${dd}`, checked: cur.num === n && cur.den === dd, onSelect: () => setSig(n, dd),
        })),
      },
      {
        id: 'rm', label: 'Remove time-signature change', danger: true, disabled: !hasChange || bar === 0,
        onSelect: () => p.onMutate((d) => { d.meter = (d.meter ?? []).filter((m) => m.bar !== bar); if (!d.meter.length) delete d.meter; }),
      },
      { kind: 'separator' },
      { id: 'play', label: `Play from bar ${bar + 1}`, onSelect: () => p.onPlayFrom(meter.barToBeat(bar)) },
    ];
  });
  const contentBeats = Math.max(
    meter.barToBeat(32),
    ...p.doc.arrangement.flatMap((t) => t.clips.map((c) => { const end = c.startBeats + c.lengthBeats; return end + barsSpan(p.doc, barFloorOf(p.doc, end), 8); })),
  );
  const contentW = contentBeats * pxPerBeat;
  const fitToView = useCallback(() => {
    const width = Math.max(180, (viewportRef.current?.clientWidth || window.innerWidth) - headerW - 24);
    setPxPerBeat(Math.max(1, Math.min(48, width / Math.max(1, contentBeats))));
    if (viewportRef.current) viewportRef.current.scrollLeft = 0;
  }, [contentBeats, headerW]);

  useEffect(() => {
    if (!followPlayhead || !p.running || p.playMode !== 'song' || !viewportRef.current) return;
    const el = viewportRef.current; const x = headerW + p.beats * pxPerBeat;
    if (x < el.scrollLeft + headerW + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.35), behavior: 'smooth' });
  }, [followPlayhead, p.running, p.playMode, p.beats, pxPerBeat, headerW]);

  // Every pattern clip in the arrangement, resolved — the windows the pad lanes draw inside.
  const patternClips = p.doc.arrangement
    .filter((t) => t.kind === 'pattern' && !t.foreign)
    .flatMap((t) => t.clips
      .filter((c) => c.patternId)
      .map((c) => ({ track: t, clip: c, pattern: p.doc.patterns.find((x) => x.id === c.patternId) }))
      .filter((x): x is { track: typeof t; clip: TimelineClip; pattern: Pattern } => !!x.pattern));

  const padWindowsFor = (padIdx: number) => patternClips.map(({ track, clip, pattern }) => ({
    trackId: track.id,
    clipId: clip.id,
    startBeats: clip.startBeats,
    lengthBeats: clip.lengthBeats,
    pattern,
    padLen: Math.max(1, Math.min(pattern.length, Math.round(clip.padLens?.[padIdx] ?? pattern.length))),
  }));

  const setPadLen = useCallback((trackId: string, clipId: string, padIdx: number, len: number | null) => {
    p.onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      const c = t?.clips.find((x) => x.id === clipId);
      if (!c) return;
      if (len === null) {
        if (c.padLens) { delete c.padLens[padIdx]; if (!Object.keys(c.padLens).length) delete c.padLens; }
      } else {
        (c.padLens ||= {})[padIdx] = len;
      }
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Right-click a PAD lane header — open/rename/mute/clear, the same grammar as track headers.
  const padHeaderMenu = useContextMenu<number>((padIdx) => {
    const pad = p.doc.kit[padIdx];
    if (!pad) return [];
    const items: MenuNode<number>[] = [{ kind: 'header', label: pad.name }];
    if (pad.instrumentTrackId && p.onOpenInstrument) {
      items.push({ id: 'open', label: 'Open instrument', onSelect: () => p.onOpenInstrument!(pad.instrumentTrackId!) });
    }
    items.push(
      { id: 'rename', label: 'Rename…', onSelect: () => { setNameText(pad.name); setRenamingPad(padIdx); } },
      { id: 'mute', label: 'Mute', checked: !!pad.mute, keepOpen: true, onSelect: () => p.onMutate((d) => { const x = d.kit[padIdx]; if (x) x.mute = !x.mute; }) },
      { kind: 'separator' },
      { id: 'clear', label: 'Clear steps (active pattern)', danger: true, onSelect: () => p.onMutate((d) => { const pat = d.patterns.find((x) => x.id === p.activePattern.id); if (pat) pat.steps[padIdx] = {}; }) },
    );
    return items;
  });

  // Right-click a TRACK header — the menu the user reaches for to open the instrument UI.
  const trackMenu = useContextMenu<string>((trackId) => {
    const track = p.doc.arrangement.find((t) => t.id === trackId);
    if (!track) return [];
    const items: MenuNode<string>[] = [{ kind: 'header', label: track.name }];
    if (track.isFolder) items.push({ id: 'collapse', label: track.collapsed ? 'Expand folder' : 'Collapse folder', checked: !!track.collapsed, keepOpen: true, onSelect: () => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === trackId); if (t) t.collapsed = !t.collapsed; }) });
    else {
      const folder = p.doc.arrangement.find((t) => t.isFolder);
      if (folder) items.push({ id: 'folder', label: track.folderId === folder.id ? 'Remove from folder' : `Move into ${folder.name}`, onSelect: () => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === trackId); if (t) t.folderId = t.folderId === folder.id ? undefined : folder.id; }) });
    }
    if (track.kind === 'instrument' && !track.foreign) {
      items.push(
        { id: 'open', label: 'Open instrument', onSelect: () => requestOpen(trackId) },
        { id: 'arm', label: 'Arm for play/record', checked: !!track.armed, onSelect: () => p.onMutate((d) => { const on = !track.armed; for (const t of d.arrangement) if (t.kind === 'instrument') t.armed = false; const t = d.arrangement.find((x) => x.id === trackId); if (t) t.armed = on; }) },
        { id: 'insertprog', label: 'Insert chord progression…', onSelect: () => setProgBrowserTrack(trackId) },
        { id: 'prompt', label: 'Describe a part (AI)…', onSelect: () => setPromptTrack(trackId) },
        { id: 'hum', label: 'Hum a melody…', onSelect: () => setHumTrack(trackId) },
        { id: 'exportmidi', label: 'Export track as MIDI', shortcut: '.mid', onSelect: () => { const b = exportTrackMidi(p.doc, trackId); if (b) downloadMidi(b, track.name); } },
        { id: 'importmidi', label: 'Import MIDI file…', onSelect: () => {
          const input = document.createElement('input'); input.type = 'file'; input.accept = '.mid,.midi,audio/midi,audio/x-midi';
          input.onchange = async () => {
            const f = input.files?.[0]; if (!f) return;
            try {
              const buf = await f.arrayBuffer();
              const startBeats = barFloorOf(p.doc, p.beats || 0);
              const clip = midiFileToClip(buf, startBeats);
              if (clip) p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === trackId); if (t && t.kind === 'instrument') t.clips.push(clip); });
            } catch { /* not a readable MIDI file */ }
          };
          input.click();
        } },
      );
      // Independent MIDI track → give it a MEKA pad (and therefore a Glass step lane). Hidden once it
      // already has one, or for a pad-owned track (which lives on a pad by definition).
      const onPad = p.doc.kit.some((pad) => pad.instrumentTrackId === trackId);
      if (!track.padOwned && !onPad) {
        items.push({ id: 'sendmeka', label: 'Send to MEKA + Glass (add pad)', onSelect: () => { let padIdx = -1; p.onMutate((d) => { padIdx = sendInstrumentTrackToPad(d, trackId); }); if (padIdx >= 0) BeatsEngine.get().syncInstruments(); } });
      }
    }
    if (!track.foreign) {
      items.push(
        { id: 'rename', label: 'Rename…', onSelect: () => { setNameText(track.name); setRenamingTrack(trackId); } },
        { id: 'mute', label: 'Mute', checked: track.mute, keepOpen: true, onSelect: () => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === trackId); if (t) t.mute = !t.mute; }) },
        { id: 'solo', label: 'Solo', checked: track.solo, keepOpen: true, onSelect: () => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === trackId); if (t) t.solo = !t.solo; }) },
      );
    }
    items.push(
      { kind: 'separator' },
      { id: 'del', label: 'Delete track', danger: true, onSelect: () => {
        p.onMutate((d) => {
          const i = d.arrangement.findIndex((x) => x.id === trackId);
          if (i < 0) return;
          // Unlink any pad that pointed at this instrument so the pad doesn't dangle.
          for (const pad of d.kit) if (pad.instrumentTrackId === trackId) { pad.instrumentTrackId = undefined; pad.source = 'synth'; }
          d.arrangement.splice(i, 1);
        });
        BeatsEngine.get().syncInstruments();
      } },
    );
    return items;
  });

  const [progBrowserTrack, setProgBrowserTrack] = useState<string | null>(null); // instrument track receiving a progression
  const [humTrack, setHumTrack] = useState<string | null>(null); // instrument track receiving a hummed melody
  const [promptTrack, setPromptTrack] = useState<string | null>(null); // instrument track receiving an AI-composed part
  // Shared: drop a set of NoteEvents as a bar-snapped MIDI clip at the playhead on an instrument track
  // (used by Hum, the Virtual Composer prompt, etc.).
  const insertNotesOnTrack = (trackId: string, notes: TimelineClip['notes'], also?: (d: GrooveDoc) => void) => {
    if (!notes || !notes.length) return;
    const startBeats = barFloorOf(p.doc, p.beats || 0);
    const end = notes.reduce((m, n) => Math.max(m, n.startBeats + n.lengthBeats), 0);
    const lengthBeats = barCeilSpan(p.doc, startBeats, end);
    p.onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      if (t && t.kind === 'instrument') t.clips.push({ id: grooveUid(), startBeats, lengthBeats, notes });
      also?.(d);
    });
  };
  // "Add instrument" destination chooser (anchored, in-view via the shared menu primitive).
  const instrumentAddMenu = useContextMenu<null>(() => [
    { kind: 'header', label: 'Add instrument as…' },
    { id: 'meka', label: 'MEKA pad', onSelect: () => p.onAddInstrument?.('meka') },
    { id: 'track', label: 'Independent MIDI track', onSelect: () => p.onAddInstrument?.('track') },
  ]);

  const commitTrackRename = (trackId: string) => {
    setRenamingTrack(null);
    const name = nameText.trim();
    if (!name) return;
    p.onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      if (!t) return;
      t.name = name;
      const pad = d.kit.find((x) => x.instrumentTrackId === trackId);
      if (pad) pad.name = name.slice(0, 18);
    });
  };
  const commitPadRename = (padIdx: number) => {
    setRenamingPad(null);
    const name = nameText.trim().slice(0, 18);
    if (!name) return;
    p.onMutate((d) => {
      const pad = d.kit[padIdx];
      if (!pad) return;
      pad.name = name;
      if (pad.instrumentTrackId) { const t = d.arrangement.find((x) => x.id === pad.instrumentTrackId); if (t) t.name = name; }
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (openClip) return; // the piano roll owns the keyboard while it's open
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const ids = clipSelection.selectedIds;
      const cursor = p.running && p.playMode === 'song' ? p.beats : (p.songStartBeats ?? 0);
      // Copy / cut: every selected clip, keeping track offsets and relative timing.
      if (mod && (key === 'c' || key === 'x') && ids.length) {
        clipboardRef.current = copyClips(p.doc, ids);
        if (key === 'x') { p.onMutate((d) => { for (const t of d.arrangement) t.clips = t.clips.filter((c) => !clipSelection.selectedSet.has(c.id)); }); clipSelection.clear(); }
        e.preventDefault(); return;
      }
      // Paste at the playhead (grid floor), top clip onto the selected track.
      if (mod && key === 'v' && clipboardRef.current) {
        const cb = clipboardRef.current;
        const at = snapAt(cursor, undefined, 'floor');
        const anchor = selectedTrack ? p.doc.arrangement.findIndex((t) => t.id === selectedTrack) : undefined;
        let made: string[] = [];
        p.onMutate((d) => { made = pasteClips(d, cb, at, anchor !== undefined && anchor >= 0 ? anchor : undefined); });
        if (made.length) clipSelection.selectMany(made, made.at(-1));
        e.preventDefault(); return;
      }
      // Duplicate: the selection's copy lands right after the selection's span.
      if (mod && key === 'd' && ids.length) {
        const cb = copyClips(p.doc, ids);
        if (cb) {
          let made: string[] = [];
          p.onMutate((d) => { made = pasteClips(d, cb, cb.spanEnd); });
          if (made.length) clipSelection.selectMany(made, made.at(-1));
        }
        e.preventDefault(); return;
      }
      if (mod && key === 'a') {
        const all = p.doc.arrangement.filter((t) => !t.foreign).flatMap((t) => t.clips.map((c) => c.id));
        if (all.length) clipSelection.selectMany(all, all[0]);
        e.preventDefault(); return;
      }
      // Nudge: ← → by one grid cell (Shift = one bar).
      if (!mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && ids.length) {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        p.onMutate((d) => {
          for (const t of d.arrangement) for (const c of t.clips) {
            if (!clipSelection.selectedSet.has(c.id)) continue;
            const step = e.shiftKey ? meter.at(c.startBeats).lenBeats : gridCellBeats(c.startBeats, grid, meter, pxPerBeat);
            c.startBeats = Math.max(0, c.startBeats + dir * step);
          }
        });
        e.preventDefault(); return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!clipSelection.selectedIds.length) return;
      p.onMutate((d) => {
        for (const t of d.arrangement) t.clips = t.clips.filter((c) => !clipSelection.selectedSet.has(c.id));
      });
      clipSelection.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClip, selectedTrack, p.doc, p.onMutate, clipSelection, p.beats, p.running, p.playMode, p.songStartBeats, grid, pxPerBeat, meter, openClip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Right-click a clip — the shared design-system menu. Clips are draggable, so we
  // wire only onContextMenu (not the touch long-press bind, which would fight the drag).
  const clipMenu = useContextMenu<{ trackId: string; clipId: string }>(({ trackId, clipId }) => {
    const track = p.doc.arrangement.find((t) => t.id === trackId);
    const clip = track?.clips.find((c) => c.id === clipId);
    if (!track || !clip) return [];
    const pat = clip.patternId ? p.doc.patterns.find((x) => x.id === clip.patternId) : undefined;
    const targetIds = clipSelection.isSelected(clipId) ? clipSelection.selectedIds : [clipId];
    const items: MenuNode<{ trackId: string; clipId: string }>[] = [
      { kind: 'header', label: targetIds.length > 1 ? `${targetIds.length} selected clips` : (pat?.name ?? clip.audio?.name ?? 'Clip') },
    ];
    if (track.kind === 'instrument' && !track.foreign) {
      items.push({ id: 'open', label: 'Open in editor', onSelect: () => setOpenClip({ trackId, clipId }) });
      if (clip.notes?.length) items.push({ id: 'midi', label: 'Export clip as MIDI', shortcut: '.mid', onSelect: () => { const b = exportClipMidi(p.doc, trackId, clipId); if (b) downloadMidi(b, clip.name || `${track.name} clip`); } });
    }
    if (!track.foreign && !clip.patternId) {
      const looped = clipIsLooped(clip);
      items.push({
        id: 'loop', label: 'Loop content', shortcut: 'drag edge to repeat', checked: looped,
        onSelect: () => p.onMutate((d) => {
          for (const t of d.arrangement) for (const c of t.clips) if (targetIds.includes(c.id) && !c.patternId) setClipLoop(d, c, !looped);
        }),
      });
      if (clip.notes && (clip.loop || clip.contentOffsetBeats)) {
        items.push({ id: 'consolidate', label: 'Consolidate (bake slip + loop into notes)', onSelect: () => p.onMutate((d) => {
          for (const t of d.arrangement) for (const c of t.clips) if (targetIds.includes(c.id)) consolidateClip(c);
        }) });
      }
    }
    items.push(
      { id: 'dup', label: targetIds.length > 1 ? `Duplicate ${targetIds.length} clips` : 'Duplicate', shortcut: 'Ctrl+D', onSelect: () => { const made: string[] = []; p.onMutate((d) => { for (const t of d.arrangement) { const originals = t.clips.filter(c => targetIds.includes(c.id)); for (const c of originals) { const copy = structuredClone(c); copy.id = grooveUid() + grooveUid(); copy.startBeats = c.startBeats + c.lengthBeats; t.clips.push(copy); made.push(copy.id); } } }); if (made.length) clipSelection.selectMany(made, made.at(-1)); } },
      { id: 'color', label: 'Clip color', submenu: [
        ...CLIP_SWATCHES.map((color) => ({ id: `color-${color}`, label: <span className="flex items-center gap-2"><span className="block w-3 h-3 rounded-full border border-white/25" style={{ background: color }} />{color.toUpperCase()}{clip.color === color ? ' ✓' : ''}</span>, onSelect: () => p.onMutate((d) => { const c = d.arrangement.find((t) => t.id === trackId)?.clips.find((x) => x.id === clipId); if (c) c.color = color; }) })),
        { kind: 'separator' as const },
        { id: 'color-custom', label: 'Choose any color…', onSelect: () => { colorTargetRef.current = { trackId, clipId }; colorInputRef.current?.click(); } },
        { id: 'color-inherit', label: 'Use track color', checked: !clip.color, onSelect: () => p.onMutate((d) => { const c = d.arrangement.find((t) => t.id === trackId)?.clips.find((x) => x.id === clipId); if (c) delete c.color; }) },
      ] },
      { kind: 'separator' },
      { id: 'del', label: targetIds.length > 1 ? `Delete ${targetIds.length} clips` : 'Delete', danger: true, onSelect: () => { p.onMutate((d) => { for (const t of d.arrangement) t.clips = t.clips.filter(c => !targetIds.includes(c.id)); }); clipSelection.clear(); } },
    );
    return items;
  });

  const paintClip = useCallback((trackId: string, atBeats: number) => {
    p.onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'pattern' || track.foreign) return;
      const startBeats = barFloorOf(d, atBeats);
      if (track.clips.some((c) => startBeats < c.startBeats + c.lengthBeats && startBeats + 1 > c.startBeats)) return;
      // A pattern clip is as long as its pattern (16ths), whatever the meter.
      const lengthBeats = Math.max(1, p.activePattern.length / STEPS_PER_BEAT);
      track.clips.push({ id: grooveUid(), startBeats, lengthBeats, patternId: p.activePattern.id });
    });
  }, [p.onMutate, p.activePattern]); // eslint-disable-line react-hooks/exhaustive-deps

  const dropAudio = useCallback(async (trackId: string, atBeats: number, file: File) => {
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    const result = await ingestSample(file, name, ctx);
    if (!result) return;
    engine.setSampleBuffer(result.ref.key, result.buffer);
    p.onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'audio' || track.foreign) return;
      const startBeats = barFloorOf(d, atBeats);
      track.clips.push({
        id: grooveUid(),
        startBeats,
        lengthBeats: Math.max(1 / 16, audioLengthBeats(d, startBeats, result.buffer.duration)),
        audio: { sampleKey: result.ref.key, name, offsetSec: 0, gainDb: 0, durationSec: result.buffer.duration },
      });
    });
    void backupToLocker(result.ref).then((lockerUrl) => {
      if (lockerUrl) p.onMutate((d) => { const c = d.arrangement.find((t) => t.id === trackId)?.clips.find((x) => x.audio?.sampleKey === result.ref.key); if (c?.audio) c.audio.lockerUrl = lockerUrl; });
    });
  }, [p.onMutate, p.doc.bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop audio onto empty space → one NEW labelled audio track per file, at the drop point. The
  // Bitwig / Studio One behaviour: no manual track creation, no renaming.
  const [dropHot, setDropHot] = useState(false);
  const dropNewTracks = useCallback(async (files: File[], atBeats: number) => {
    let expanded: File[];
    try { expanded = await expandDroppedFiles(files); } catch { setIngest(null); return; }
    const audio = expanded.filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aif|aiff)$/i.test(f.name));
    if (!audio.length) return;
    setIngest({ done: 0, total: audio.length, name: audio[0].name });
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const startBar = barFloorOf(p.doc, atBeats);
    const made: { name: string; key: string; dur: number; peaks: number[]; bpm: number | null }[] = [];
    for (let fileIdx = 0; fileIdx < audio.length; fileIdx++) {
      const file = audio[fileIdx]; setIngest({ done: fileIdx, total: audio.length, name: file.name });
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Audio';
      const result = await ingestSample(file, name, ctx);
      if (!result) continue;
      engine.setSampleBuffer(result.ref.key, result.buffer);
      made.push({ name, key: result.ref.key, dur: result.buffer.duration, peaks: audioPeaks(result.buffer), bpm: detectTempo(result.buffer) });
      setIngest({ done: fileIdx + 1, total: audio.length, name: file.name });
    }
    if (!made.length) return;
    p.onMutate((d) => {
      made.forEach((m, index) => {
        d.arrangement.push({
          id: grooveUid(), kind: 'audio', name: m.name, color: TRACK_COLORS[(d.arrangement.length + index) % TRACK_COLORS.length],
          mute: false, solo: false, gainDb: 0, pan: 0,
          clips: [{
            id: grooveUid(), startBeats: startBar,
            lengthBeats: Math.max(1 / 16, audioLengthBeats(d, startBar, m.dur)),
            audio: { sampleKey: m.key, name: m.name, offsetSec: 0, gainDb: 0, durationSec: m.dur, peaks: m.peaks, detectedBpm: m.bpm ?? undefined },
          }],
        });
      });
    });
    for (const m of made) void backupToLocker({ key: m.key, name: m.name, durationSec: m.dur }).then((lockerUrl) => {
      if (lockerUrl) p.onMutate((d) => { for (const t of d.arrangement) for (const c of t.clips) if (c.audio?.sampleKey === m.key) c.audio.lockerUrl = lockerUrl; });
    });
    const tempos = made.map((m) => m.bpm).filter((x): x is number => x !== null);
    if (made.length > 1 && tempos.length === made.length && Math.max(...tempos) - Math.min(...tempos) <= 1) {
      const tempo = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
      if (window.confirm(`All ${made.length} stems appear to be ${tempo} BPM. Set the production master tempo to ${tempo} BPM?`)) p.onMutate((d) => { d.bpm = tempo; });
    }
    window.setTimeout(() => setIngest(null), 500);
  }, [p.onMutate, p.doc.bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTrack = useCallback((kind: 'pattern' | 'audio') => {
    p.onMutate((d) => {
      d.arrangement.push({
        id: grooveUid(), kind,
        name: kind === 'pattern' ? `Grooves ${d.arrangement.filter((t) => t.kind === 'pattern').length + 1}` : `Audio ${d.arrangement.filter((t) => t.kind === 'audio').length + 1}`,
        color: kind === 'pattern' ? '#B84DFF' : PLAYHEAD,
        mute: false, solo: false, gainDb: 0, pan: 0, clips: [],
      });
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMidiClip = useCallback((trackId: string, atBeats: number) => {
    p.onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'instrument') return;
      const startBeats = barFloorOf(d, atBeats);
      if (track.clips.some((c) => startBeats < c.startBeats + c.lengthBeats && startBeats + 1 > c.startBeats)) return;
      track.clips.push({ id: grooveUid(), startBeats, lengthBeats: barsSpan(d, startBeats, 2), notes: [] });
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Knife: split a clip at a (grid-snapped) beat, moving/clamping notes and audio offsets. */
  const splitClip = useCallback((trackId: string, clipId: string, atBeats: number) => {
    p.onMutate((d) => { splitClipAt(d, trackId, clipId, atBeats); });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Glue: merge a clip with the NEXT clip on its track (notes fold in; audio only if it's the
   *  same file continuing). */
  const glueClip = useCallback((trackId: string, clipId: string) => {
    p.onMutate((d) => { glueWithNext(d, trackId, clipId); });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const eraseClip = useCallback((trackId: string, clipId: string) => {
    p.onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      if (t) t.clips = t.clips.filter((x) => x.id !== clipId);
    });
    if (clipSelection.isSelected(clipId)) clipSelection.selectMany(clipSelection.selectedIds.filter(id => id !== clipId));
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the song is rolling the playhead follows the transport; otherwise it rests at the parked
  // start position (bar 1 by default) so there's always a clear "play begins here" marker.
  const playheadX = (p.running && p.playMode === 'song' ? p.beats : (p.songStartBeats ?? 0)) * pxPerBeat;
  const playheadLive = p.running && p.playMode === 'song';

  // The selected clip, resolved to {track,clip} for the docked detail editor below.
  const selRef = selectedClip
    ? (() => { for (const t of p.doc.arrangement) if (t.clips.some((c) => c.id === selectedClip)) return { trackId: t.id, clipId: selectedClip }; return null; })()
    : null;

  // Draggable loop/cycle region on the ruler — move the body, drag either edge to resize; snaps
  // to the bar grid, and turns the loop on the moment you touch it.
  const loop = p.doc.loop ?? { on: false, startBeats: 0, endBeats: meter.barToBeat(4) };
  const [regionGenMode, setRegionGenMode] = useState<'council' | 'stems' | 'holistic' | 'idea' | 'full_song'>('council');
  const [councilOpen, setCouncilOpen] = useState(false);
  const [regionPrompt, setRegionPrompt] = useState('');
  const [partInstrument, setPartInstrument] = useState<InstrumentType>('onda');
  const [regionGenerating, setRegionGenerating] = useState(false);
  const [regionStatus, setRegionStatus] = useState('');
  const wholeGeneration = regionGenMode === 'holistic' || regionGenMode === 'full_song';
  const generationBeats = wholeGeneration ? Math.max(meter.barToBeat(32), loop.endBeats - loop.startBeats)
    : loop.endBeats - loop.startBeats;
  const regionOperation = useRef<AbortController | null>(null);
  useEffect(() => () => { regionOperation.current?.abort(); }, [p.doc.id]);

  const setRegionBarsSpan = (barsCount: number) => {
    const startBarBeat = barFloorOf(p.doc, loop.startBeats || 0);
    p.onMutate((d) => {
      d.loop = {
        on: true,
        startBeats: startBarBeat,
        endBeats: startBarBeat + barsSpan(d, startBarBeat, Math.max(1, barsCount)),
      };
    });
  };

  const generateInTimelineRegion = async () => {
    // The composer council works in its own panel (parts, lyrics, takes) — open it for this region.
    if (regionGenMode === 'council') { setCouncilOpen(true); return; }
    if (regionGenerating) return;
    const effectivePrompt = (regionPrompt.trim() || "a cinematic hip hop instrumental 90's vibe and jazz sample running in reverse");
    setRegionGenerating(true);
    const operation = new AbortController();
    regionOperation.current = operation;
    setRegionStatus('Connecting local music engines…');
    try {
      const wholeProject = regionGenMode === 'full_song' || regionGenMode === 'holistic';
      const startBeat = wholeProject ? 0 : barFloorOf(p.doc, loop.startBeats);
      const regionBeats = wholeProject
        ? Math.max(meter.barToBeat(32), loop.endBeats - loop.startBeats)
        : Math.max(barsSpan(p.doc, startBeat, 1), loop.endBeats - loop.startBeats);
      const regionBars = Math.max(1, Math.round(barsBetween(p.doc, startBeat, startBeat + regionBeats)));
      // Through the tempo track: the region's real duration, and its average seconds-per-beat.
      const exactDurationSec = Math.max(2, Math.min(360, tempo.secBetween(startBeat, startBeat + regionBeats)));
      const spb = tempo.secBetween(startBeat, startBeat + regionBeats) / Math.max(1e-6, regionBeats);

      const ensembleOut = await runHolisticEnsemblePipeline({
        prompt: effectivePrompt,
        lyrics: '',
        bpm: p.doc.bpm,
        // The project key when set; the template's key text; only then the old default.
        keySignature: (() => { const k = docKey(p.doc); return k ? keyLabel(k) : 'D Minor'; })(),
        startBeats: startBeat,
        regionBeats,
        seed: 42,
        includeMidi: regionGenMode === 'holistic' || regionGenMode === 'idea',
        includeAudio: regionGenMode !== 'idea',
        midiInstrument: regionGenMode === 'idea' ? partInstrument : undefined,
        signal: operation.signal,
        onProgress: (stage) => setRegionStatus(stage),
      });
      const genOut = { stems: ensembleOut.audioStems, audioBlob: ensembleOut.masterAudioBlob };
      operation.signal.throwIfAborted();

      const engine = BeatsEngine.get();
      await engine.init();
      const ctx = engine.getContext();
      if (!ctx) throw new Error('Audio engine unavailable');

      if (genOut.stems.length || ensembleOut.midiTracks.length) {
        const ingestedStems: { name: string; color: string; key: string; dur: number; peaks: number[] }[] = [];
        for (const stem of genOut.stems) {
          const sampleRes = await ingestSample(stem.blob, stem.name, ctx);
          if (!sampleRes) throw new Error('Could not decode the generated audio; no tracks were inserted.');
          engine.setSampleBuffer(sampleRes.ref.key, sampleRes.buffer);
          ingestedStems.push({
            name: stem.name,
            color: stem.color,
            key: sampleRes.ref.key,
            dur: sampleRes.buffer.duration,
            peaks: audioPeaks(sampleRes.buffer),
          });
        }
        operation.signal.throwIfAborted();
        p.onMutate((d) => {
          d.loop = { on: true, startBeats: startBeat, endBeats: startBeat + regionBeats };
          d.sectionMarkers = [
            ...(d.sectionMarkers || []),
            ...ensembleOut.sectionCues.map((cue, index) => ({ ...cue, id: grooveUid(),
              romanNumeral: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][index] || String(index + 1) })),
          ];
          for (const st of ingestedStems) {
            let track = d.arrangement.find((t) => t.kind === 'audio' && !t.foreign && t.name === st.name);
            if (!track) {
              track = {
                id: grooveUid(),
                kind: 'audio',
                name: st.name,
                color: st.color,
                mute: false,
                solo: false,
                gainDb: ensembleOut.midiTracks.length ? -6 : 0,
                pan: 0,
                clips: [],
              };
              d.arrangement.push(track);
            }
            track.clips.push({
              id: grooveUid(),
              startBeats: startBeat,
              lengthBeats: Math.min(regionBeats, st.dur / spb),
              color: st.color,
              audio: {
                sampleKey: st.key,
                name: `${st.name} (${regionBars} bars)`,
                offsetSec: 0,
                gainDb: 0,
                durationSec: st.dur,
                peaks: st.peaks,
              },
            });
          }
          if (ensembleOut.midiTracks.length) {
            for (const midiSpec of ensembleOut.midiTracks) {
              let mTrack = d.arrangement.find((t) => t.kind === 'instrument' && !t.padOwned && !t.foreign && t.name === midiSpec.name);
              if (!mTrack) {
                const newTrackId = addInstrument(d, midiSpec.instrument, ensembleVoicePatch(midiSpec), midiSpec.presetName);
                mTrack = d.arrangement.find((t) => t.id === newTrackId);
                if (mTrack) {
                  mTrack.name = midiSpec.name;
                  mTrack.color = midiSpec.color;
                  mTrack.gainDb = midiSpec.gainDb;
                  mTrack.pan = midiSpec.pan;
                }
              }
              if (mTrack) {
                mTrack.clips.push({
                  id: grooveUid(),
                  startBeats: startBeat,
                  lengthBeats: regionBeats,
                  color: midiSpec.color,
                  notes: midiSpec.notes.map((n) => ({ ...n, id: grooveUid() })),
                });
              }
            }
          }
        });
        engine.syncInstruments();
        setRegionStatus(
          ensembleOut.midiTracks.length
            ? `Inserted ${genOut.stems.length ? 'complementary audio + ' : ''}${ensembleOut.midiTracks.length} active synth parts. Models: ${ensembleOut.modelsUsed.join(', ')}. Audition the blend; audio timing and harmony can vary.`
            : `Inserted local music track (${exactDurationSec.toFixed(1)}s requested).`
        );
      } else if (genOut.audioBlob) {
        const clipName = `${effectivePrompt.slice(0, 28)} (${regionBars} bars)`;
        const sampleRes = await ingestSample(genOut.audioBlob, clipName, ctx);
        if (sampleRes) {
          engine.setSampleBuffer(sampleRes.ref.key, sampleRes.buffer);
          const peaks = audioPeaks(sampleRes.buffer);
          p.onMutate((d) => {
            d.loop = { on: true, startBeats: startBeat, endBeats: startBeat + regionBeats };
            let track = d.arrangement.find((t) => t.kind === 'audio' && !t.foreign && t.id === selectedTrack)
              || d.arrangement.find((t) => t.kind === 'audio' && !t.foreign);
            if (!track) {
              track = {
                id: grooveUid(),
                kind: 'audio',
                name: 'Region Idea Stem',
                color: '#00DAF3',
                mute: false,
                solo: false,
                gainDb: 0,
                pan: 0,
                clips: [],
              };
              d.arrangement.push(track);
            }
            track.clips.push({
              id: grooveUid(),
              startBeats: startBeat,
              lengthBeats: regionBeats,
              color: '#00DAF3',
              audio: {
                sampleKey: sampleRes.ref.key,
                name: clipName,
                offsetSec: 0,
                gainDb: 0,
                durationSec: sampleRes.buffer.duration,
                peaks,
              },
            });
          });
          setRegionStatus(`Inserted region idea across Bars ${meter.at(startBeat).bar + 1}–${Math.ceil(meter.beatToBar(startBeat + regionBeats) - 1e-6)}`);
        }
      }
    } catch (err) {
      setRegionStatus(operation.signal.aborted ? 'Generation cancelled.' : err instanceof Error ? err.message : 'Could not generate in region');
    } finally {
      if (regionOperation.current === operation) regionOperation.current = null;
      setRegionGenerating(false);
    }
  };
  const dragLoop = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const start = { ...loop };
    const startX = e.clientX;
    const move = (ev: PointerEvent) => {
      const dBeats = (ev.clientX - startX) / pxPerBeat;
      const snap = (beats: number) => snapAt(beats, ev);
      const minLen = gridCellBeats(start.startBeats, grid, meter, pxPerBeat);
      p.onMutate((d) => {
        const l = d.loop ?? { on: true, startBeats: start.startBeats, endBeats: start.endBeats };
        if (mode === 'move') { const span = start.endBeats - start.startBeats; const s = Math.max(0, snap(start.startBeats + dBeats)); l.startBeats = s; l.endBeats = s + span; }
        else if (mode === 'l') l.startBeats = Math.max(0, Math.min(l.endBeats - minLen, snap(start.startBeats + dBeats)));
        else l.endBeats = Math.max(l.startBeats + minLen, snap(start.endBeats + dBeats));
        l.on = true;
        d.loop = l;
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col p-4 pt-3 gap-0">
      {marqueeSelection.marquee && <div className="fixed pointer-events-none z-[9998] border border-[#00DAF3] bg-[#00DAF3]/10" style={marqueeSelection.marquee} />}
      {clipMenu.node}
      {gridMenu.node}
      {rulerMenu.node}
      {instrumentAddMenu.node}
      {progBrowserTrack && (
        <ProgressionBrowser
          target={p.doc.arrangement.find((t) => t.id === progBrowserTrack)?.name}
          onClose={() => setProgBrowserTrack(null)}
          onInsert={(progId, rootPc, seventh) => {
            const startBeats = barFloorOf(p.doc, p.beats || 0);
            const clip = progressionToClip(progId, rootPc, { seventh, startBeats });
            if (!clip) return;
            p.onMutate((d) => {
              const t = d.arrangement.find((x) => x.id === progBrowserTrack);
              if (t && t.kind === 'instrument') t.clips.push(clip);
            });
          }}
        />
      )}
      {humTrack && (
        <HumRecorder
          target={p.doc.arrangement.find((t) => t.id === humTrack)?.name}
          onClose={() => setHumTrack(null)}
          projectKey={docKey(p.doc)}
          onInsert={(notes, meta) => insertNotesOnTrack(humTrack, notes, (d) => {
            // No project key yet: the hum's detected key becomes it (same undo step as the notes).
            if (!docKey(d)) { const k = parseKey(`${meta.key} ${meta.mode}`); if (k) d.key = k; }
          })}
        />
      )}
      {promptTrack && (
        <PromptComposer
          target={p.doc.arrangement.find((t) => t.id === promptTrack)?.name}
          onClose={() => setPromptTrack(null)}
          onInsert={(notes) => insertNotesOnTrack(promptTrack, notes)}
        />
      )}
      <input ref={colorInputRef} type="color" className="sr-only" aria-label="Choose a custom clip color" onChange={(e) => { const target = colorTargetRef.current; if (!target) return; const color = e.target.value; p.onMutate((d) => { const c = d.arrangement.find((t) => t.id === target.trackId)?.clips.find((x) => x.id === target.clipId); if (c) c.color = color; }); colorTargetRef.current = null; }} />
      {padHeaderMenu.node}
      {trackMenu.node}
      {p.doc.showcaseMetadata?.isShowcaseTemplate && (
        <div className="mb-2.5 rounded-xl border border-amber-400/35 bg-gradient-to-r from-[#1E140B]/95 via-[#140E22]/95 to-[#0D1922]/95 px-3.5 py-2.5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/50 text-amber-300 text-[9.5px] font-bold uppercase tracking-wider shrink-0 whitespace-nowrap">
                ★ Chora DAW Showcase Template
              </span>
              <span className="text-[12px] font-bold text-white truncate min-w-[140px]">
                {p.doc.showcaseMetadata.bookTitle} — Mvt {(p.doc.showcaseMetadata.trackIndex ?? p.doc.showcaseMetadata.activeMovementIdx ?? 0) + 1}: {p.doc.showcaseMetadata.trackTitle || p.doc.showcaseMetadata.activeMovementTitle}
              </span>
              <span className="text-[10px] font-mono text-cyan-300/90 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/25 shrink-0 whitespace-nowrap">
                {p.doc.showcaseMetadata.keySignature ? `${p.doc.showcaseMetadata.keySignature} · ` : ''}{p.doc.bpm} BPM · 8 Hybrid Tracks (ACE-Step 2.5 + YuE2 + 7 MPE Synths)
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  const meta = p.doc.showcaseMetadata;
                  if (!meta) return;
                  if (sympStreaming.playing) {
                    stopRealtimeSympPlayback();
                    setSympStreaming((prev) => ({ ...prev, playing: false }));
                  } else {
                    if (p.running) BeatsEngine.get().stop();
                    await playRealtimeSympMovement(
                      meta.bookThemeId || meta.bookId || 'pride-and-prejudice',
                      meta.trackIndex ?? meta.activeMovementIdx ?? 0,
                      meta.scoreMode || 'full-film-score',
                      (cur, dur, _beat16, sectionLabel) => {
                        setSympStreaming({
                          playing: true,
                          currentTime: cur,
                          duration: dur,
                          sectionLabel: sectionLabel || '',
                        });
                      },
                      () => setSympStreaming((prev) => ({ ...prev, playing: false })),
                    );
                  }
                }}
                className={`h-7 px-3 rounded-lg border text-[10.5px] font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
                  sympStreaming.playing
                    ? 'bg-rose-500/25 border-rose-400 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.35)]'
                    : 'bg-emerald-500/25 border-emerald-400/80 text-emerald-200 hover:bg-emerald-500/35 shadow-[0_0_14px_rgba(16,185,129,0.28)]'
                }`}
                title="Stream the full 2:15–5:30m hybrid orchestral + MPE score (ACE-Step 2.5 Strings, Solo Violin/Cello, Brass, YuE2 Choir + 7 Melos MPE Synths)"
              >
                <span>{sympStreaming.playing ? '■ Stop Full Film Score Stream' : '▶ Audition Full ACE-Step 2.5 + MPE Film Score'}</span>
                {sympStreaming.playing && sympStreaming.duration > 0 && (
                  <span className="font-mono text-[10px] text-white/90 ml-1">
                    {Math.floor(sympStreaming.currentTime / 60)}:{String(Math.floor(sympStreaming.currentTime % 60)).padStart(2, '0')} / {Math.floor(sympStreaming.duration / 60)}:{String(Math.floor(sympStreaming.duration % 60)).padStart(2, '0')}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  const mvtIdx = p.doc.showcaseMetadata?.trackIndex ?? p.doc.showcaseMetadata?.activeMovementIdx ?? 0;
                  const leadTrack = p.doc.arrangement.find((t) => t.kind === 'instrument' && !t.padOwned && t.clips.length > 0)
                    || p.doc.arrangement.find((t) => t.kind === 'instrument' && t.clips.length > 0);
                  if (leadTrack) {
                    const clip = leadTrack.clips[mvtIdx] || leadTrack.clips[0];
                    if (clip) {
                      clipSelection.selectOnly(clip.id);
                      setOpenClip({ trackId: leadTrack.id, clipId: clip.id });
                    }
                  }
                }}
                className="h-7 px-3 rounded-lg bg-[#00DAF3]/20 hover:bg-[#00DAF3]/30 border border-[#00DAF3]/60 text-[#00DAF3] text-[10.5px] font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
                title="Open the Full-Screen MPE Piano Roll to inspect and edit per-note Pressure, Timbre, Pitch-Bend curves, and Articulations"
              >
                <Piano size={12} /> Open MPE Piano Roll & Curves
              </button>
            </div>
          </div>
          {p.doc.sectionMarkers && p.doc.sectionMarkers.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <span className="text-[9px] uppercase tracking-wider text-amber-300/80 font-bold mr-1 shrink-0 whitespace-nowrap">
                7-Section Film Cue Sheet:
              </span>
              {p.doc.sectionMarkers.map((sec, idx) => {
                const secStart = sec.startBeats ?? (sec as unknown as { startBeat?: number }).startBeat ?? 0;
                const secLabel = sec.title || (sec as unknown as { label?: string }).label || `Section ${idx + 1}`;
                return (
                  <button
                    key={`${sec.id}-${idx}`}
                    onClick={() => {
                      p.onPlayFrom(secStart);
                      if (sympStreaming.playing && sympStreaming.duration > 0) {
                        const firstStart = p.doc.sectionMarkers![0]?.startBeats ?? 0;
                        const totalBeats = Math.max(
                          1,
                          ...p.doc.sectionMarkers!.map((s) => ((s.startBeats ?? 0) - firstStart) + s.lengthBeats),
                        );
                        seekRealtimeSympPlayback((Math.max(0, secStart - firstStart) / totalBeats) * sympStreaming.duration);
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-white/[0.06] hover:bg-amber-400/20 border border-white/15 hover:border-amber-400/50 text-[9.5px] text-white/85 hover:text-amber-200 font-medium transition-all shrink-0 whitespace-nowrap flex items-center gap-1"
                    title={`${secLabel} (${sec.dynamicMarking}) — ${sec.dramaticCue || ''} · Click to jump DAW playhead & score stream to beat ${secStart}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sec.color || '#F59E0B' }} />
                    <span>{secLabel}</span>
                    <span className="text-[8.5px] font-mono text-amber-300/80">({sec.dynamicMarking})</span>
                  </button>
                );
              })}
              {sympStreaming.playing && sympStreaming.sectionLabel && (
                <span className="ml-auto text-[10px] font-mono text-emerald-300 shrink-0 whitespace-nowrap">
                  Now Playing: {sympStreaming.sectionLabel}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      <div className={`${glassPanel} flex-1 min-h-0 overflow-hidden flex flex-col`}>
        {/* Inline Timeline Region Generator Bar (Defaults to Stems in Timeline DAW workflow) */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#120C1C]/95 text-[11px]">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#00DAF3]/10 border border-[#00DAF3]/35 text-[#00DAF3] font-mono text-[10px] shrink-0" title="Drag the cyan region handles on the bar ruler below or click a bar preset">
            <Layers size={12} />
            {wholeGeneration ? <span>Project: {Math.round(barsBetween(p.doc, 0, generationBeats))} bars · {tempo.secBetween(0, generationBeats).toFixed(1)}s</span> : <span>
              Region: Bar {meter.at(loop.startBeats).bar + 1}–{Math.round(meter.beatToBar(loop.endBeats))} ({Math.max(1, Math.round(barsBetween(p.doc, loop.startBeats, loop.endBeats)))} bars · {tempo.secBetween(loop.startBeats, loop.endBeats).toFixed(1)}s)
            </span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {[4, 8, 16, 32, 64].map((bCount) => {
              const activeBars = Math.round(barsBetween(p.doc, loop.startBeats, loop.endBeats));
              return (
                <button
                  key={bCount}
                  onClick={() => setRegionBarsSpan(bCount)}
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border transition-colors ${
                    activeBars === bCount
                      ? 'bg-[#00DAF3]/20 border-[#00DAF3] text-[#00DAF3] font-bold'
                      : 'bg-white/[0.04] border-white/10 text-white/50 hover:text-white'
                  }`}
                  title={`Set selected region length to ${bCount} bars`}
                >
                  {bCount}b
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap rounded-lg border border-white/15 bg-black/30 p-0.5 max-w-full" role="group" aria-label="Timeline generation mode">
            {([
              ['council', 'Council · Notation'],
              ['stems', 'Timeline Part · Audio'],
              ['idea', 'Timeline Part · MIDI'],
              ['holistic', 'Full DAW Project'],
              ['full_song', 'Music Track'],
            ] as const).map(([modeId, label]) => (
              <button
                key={modeId}
                disabled={regionGenerating}
                aria-pressed={regionGenMode === modeId}
                onClick={() => setRegionGenMode(modeId)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                  regionGenMode === modeId
                    ? 'bg-[#8B5CFF] text-white shadow-sm'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {regionGenMode === 'idea' && <select aria-label="MIDI part instrument" value={partInstrument}
            onChange={e => setPartInstrument(e.target.value as InstrumentType)} disabled={regionGenerating}
            className="h-7 rounded-lg bg-[#171020] text-xs text-white border border-white/15 px-2">
            {(['onda', 'aura', 'soma', 'bajo', 'vela', 'cantus', 'ison', 'pneuma'] as const).map(id =>
              <option key={id} value={id}>{id.toUpperCase()}</option>)}
          </select>}
          <input
            type="text"
            value={regionPrompt}
            maxLength={4000}
            onChange={(e) => setRegionPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void generateInTimelineRegion(); }}
            placeholder={regionGenMode === 'council' ? 'How should this passage feel? The council reads every track and the lyrics…' : 'Describe your part, full DAW arrangement, or music track…'}
            className="flex-1 min-w-[200px] h-7 rounded-lg border border-white/15 bg-[#171020] px-2.5 text-[11px] text-white placeholder:text-white/35 outline-none focus:border-[#00DAF3]/70"
          />
          <button
            onClick={() => void generateInTimelineRegion()}
            disabled={regionGenerating}
            className="h-7 px-3 rounded-lg bg-gradient-to-r from-[#8B5CFF] to-[#00DAF3] text-white text-[10.5px] font-bold tracking-wide flex items-center gap-1.5 disabled:opacity-50 shrink-0 shadow-[0_0_12px_rgba(139,92,255,0.35)]"
          >
            {regionGenerating ? <><Loader2 size={12} className="animate-spin" /> Generating…</> : regionGenMode === 'council' ? <><Sparkles size={12} /> Compose with the council</> : <><Sparkles size={12} /> Generate {regionGenMode === 'holistic' ? 'DAW Project' : regionGenMode === 'full_song' ? 'Music Track' : regionGenMode === 'idea' ? 'MIDI Part' : 'Audio Part'}</>}
          </button>
          {regionGenerating && <button onClick={() => regionOperation.current?.abort()}
            className="h-7 px-2 rounded-lg border border-white/20 text-xs text-white">Cancel</button>}
          {regionStatus && <span className="text-[10px] text-emerald-300 font-medium truncate max-w-[320px]">{regionStatus}</span>}
          {councilOpen && (
            <CouncilComposerPanel
              doc={p.doc}
              onMutate={p.onMutate}
              startBeats={barFloorOf(p.doc, loop.startBeats)}
              endBeats={Math.max(barFloorOf(p.doc, loop.startBeats) + barsSpan(p.doc, barFloorOf(p.doc, loop.startBeats), 1), loop.endBeats)}
              initialDescription={regionPrompt}
              onClose={() => setCouncilOpen(false)}
            />
          )}
        </div>
        <div className="flex-1 min-h-0 flex">
        {showLauncher && (
          <ClipLauncher
            doc={p.doc}
            activePatternId={p.activePattern.id}
            playMode={p.playMode}
            running={p.running}
            onMutate={p.onMutate}
          />
        )}
        <div ref={viewportRef} className="flex-1 min-h-0 overflow-auto">
          <div style={{ width: headerW + contentW, minWidth: '100%' }}>
            {/* ruler */}
            <div className="sticky top-0 z-20 flex bg-[#100A18]/95 backdrop-blur border-b border-white/10" style={{ height: 26 }}>
              <div className="sticky left-0 z-10 flex items-center px-3 text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold bg-[#100A18] relative" style={{ width: headerW, minWidth: headerW }}>Tracks
                <span
                  className="absolute right-0 inset-y-0 w-2 cursor-col-resize hover:bg-[#00DAF3]/25 touch-none"
                  title="Drag to resize track headers"
                  onPointerDown={(e) => {
                    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
                    e.currentTarget.dataset.startX = String(e.clientX); e.currentTarget.dataset.startW = String(headerW);
                  }}
                  onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    const next = Math.max(132, Math.min(360, Number(e.currentTarget.dataset.startW) + e.clientX - Number(e.currentTarget.dataset.startX)));
                    setHeaderW(next);
                  }}
                  onPointerUp={(e) => { const next = Math.max(132, Math.min(360, Number(e.currentTarget.dataset.startW) + e.clientX - Number(e.currentTarget.dataset.startX))); setHeaderW(next); e.currentTarget.releasePointerCapture(e.pointerId); try { localStorage.setItem('melos:timeline:header-width', String(next)); } catch { /* */ } }}
                />
              </div>
              <div
                className="relative flex-1 cursor-pointer"
                title="Click to play from here (grid-snapped; Shift = exact) · right-click for the time signature at this bar"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  p.onPlayFrom(snapAt((e.clientX - rect.left) / pxPerBeat, e, 'floor'));
                }}
                onContextMenu={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const bar = meter.at(Math.max(0, (e.clientX - rect.left) / pxPerBeat)).bar;
                  rulerMenu.bind(bar).onContextMenu(e);
                }}
              >
                {(() => {
                  // Label every bar when there's room, else every 2/4/8/16 — counted in real bars.
                  const bars = meter.bars(0, contentBeats);
                  const avgPx = (contentBeats * pxPerBeat) / Math.max(1, bars.length);
                  const every = [1, 2, 4, 8, 16, 32].find((n) => n * avgPx >= 28) ?? 64;
                  let prevSig = '';
                  return bars.map((b) => {
                    const sig = `${b.num}/${b.den}`;
                    const sigChange = sig !== prevSig && (b.bar > 0 || sig !== '4/4');
                    prevSig = sig;
                    if (b.bar % every !== 0 && !sigChange) return null;
                    return (
                      <span key={b.bar} className="absolute top-1.5 text-[9px] font-mono select-none whitespace-nowrap" style={{ left: b.startBeat * pxPerBeat + 4 }}>
                        {b.bar % every === 0 && <span className="text-white/30">{b.bar + 1}</span>}
                        {sigChange && <span className="ml-1 text-[#D0BCFF]/80">{sig}</span>}
                      </span>
                    );
                  });
                })()}
                {p.doc.sectionMarkers?.map((sec, idx) => {
                  const secStart = sec.startBeats ?? (sec as unknown as { startBeat?: number }).startBeat ?? 0;
                  const secLabel = sec.title || (sec as unknown as { label?: string }).label || '';
                  return (
                    <span
                      key={`marker-${sec.id}-${idx}`}
                      className="absolute top-0 bottom-0 border-l border-amber-400/60 pl-1 text-[8.5px] font-semibold text-amber-300/90 select-none pointer-events-none truncate"
                      style={{ left: secStart * pxPerBeat, maxWidth: Math.max(40, sec.lengthBeats * pxPerBeat - 4) }}
                    >
                      {secLabel}
                    </span>
                  );
                })}
                {/* loop/cycle region */}
                <div
                  className="absolute top-0 h-full cursor-grab"
                  style={{ left: loop.startBeats * pxPerBeat, width: Math.max(2, (loop.endBeats - loop.startBeats) * pxPerBeat),
                    background: loop.on ? 'rgba(0,218,243,0.18)' : 'rgba(255,255,255,0.05)',
                    borderLeft: `2px solid ${loop.on ? '#00DAF3' : 'rgba(255,255,255,0.3)'}`, borderRight: `2px solid ${loop.on ? '#00DAF3' : 'rgba(255,255,255,0.3)'}` }}
                  title="Drag to move the loop; drag an edge to resize"
                  onPointerDown={dragLoop('move')}
                >
                  <span onPointerDown={dragLoop('l')} className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-ew-resize" />
                  <span onPointerDown={dragLoop('r')} className="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-ew-resize" />
                </div>
              </div>
            </div>

            {/* lanes */}
            <div ref={marqueeSurfaceRef} {...marqueeSelection.bind} className="relative">
              <TimelineGrid meter={meter} grid={grid} pxPerBeat={pxPerBeat} contentBeats={contentBeats} left={headerW} />
              {(p.doc.sections?.length ?? 0) > 0 && (
                <ArrangerLane doc={p.doc} pxPerBeat={pxPerBeat} headerW={headerW} onMutate={p.onMutate} onPlayFrom={p.onPlayFrom} />
              )}
              {showTempo && (
                <TempoLane doc={p.doc} meter={meter} grid={grid} pxPerBeat={pxPerBeat} contentBeats={contentBeats} headerW={headerW} onMutate={p.onMutate} />
              )}
              {playheadX >= 0 && (
                <div className="absolute top-0 bottom-0 w-[2px] z-20 pointer-events-none" style={{ left: headerW + playheadX, background: PLAYHEAD, opacity: playheadLive ? 1 : 0.5, boxShadow: playheadLive ? `0 0 12px ${PLAYHEAD}88` : 'none' }} />
              )}
              {/* MEKA pads — the SAME channels the mixer and Glass drive, surfaced as tracks so
                  every view shares one track list. Lanes mirror (and edit) the step grid. */}
              <div className="flex items-center gap-2 px-3 border-b border-white/[0.06] bg-[#0C0714] sticky left-0" style={{ height: 22, width: headerW + contentW }}>
                <button onClick={() => setShowPads((v) => !v)} className="flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] text-white/45 hover:text-white font-semibold">
                  {showPads ? <ChevronDown size={11} /> : <ChevronUp size={11} />} MEKA pads
                </button>
                <span className="text-[9px] text-white/20">{p.doc.kit.filter((k) => !k.empty).length} channels · click a step to edit the grid</span>
              </div>
              {showPads && p.doc.kit.map((pad, padIdx) => {
                if (pad.empty) return null; // greyed placeholder pads aren't tracks
                const mstyle = (on: boolean, c: string) => on ? { background: `${c}22`, borderColor: c, color: c } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.3)' };
                return (
                  <div key={pad.id} className="flex border-b border-white/[0.05]" style={{ height: PAD_LANE_H, opacity: pad.mute ? 0.5 : 1 }}>
                    <div
                      className="sticky left-0 z-10 flex items-center gap-1.5 px-3 bg-[#0C0714] border-r border-white/10"
                      style={{ width: headerW, minWidth: headerW }}
                      {...padHeaderMenu.bind(padIdx)}
                    >
                      {pad.instrumentTrackId && p.onOpenInstrument ? (
                        <button
                          onClick={() => p.onOpenInstrument!(pad.instrumentTrackId!)}
                          className="w-[4px] h-4 rounded-[2px] flex-none hover:h-5 transition-all"
                          style={{ background: pad.color }}
                          title="Open the instrument"
                          aria-label={`Open ${pad.name}`}
                        />
                      ) : (
                        <span className="w-[4px] h-4 rounded-[2px] flex-none" style={{ background: pad.color }} />
                      )}
                      {renamingPad === padIdx ? (
                        <input
                          autoFocus
                          value={nameText}
                          onChange={(e) => setNameText(e.target.value)}
                          onBlur={() => commitPadRename(padIdx)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitPadRename(padIdx); if (e.key === 'Escape') setRenamingPad(null); }}
                          className="flex-1 min-w-0 h-5 px-1 rounded bg-black/40 border border-white/25 text-[10.5px] text-white outline-none"
                          aria-label={`Rename ${pad.name}`}
                        />
                      ) : (
                        <span
                          className="flex-1 min-w-0 truncate text-[10.5px] text-white/70"
                          title={`${pad.name} — double-click to rename · right-click for menu`}
                          onDoubleClick={() => { setNameText(pad.name); setRenamingPad(padIdx); }}
                        >{pad.name}</span>
                      )}
                      <span className="text-[7px] font-mono text-white/25 flex-none" title="Bus group">{'ABCD'[pad.group]}</span>
                      <button onClick={() => p.onMutate((d) => { const x = d.kit[padIdx]; if (x) x.mute = !x.mute; })} className="w-[15px] h-[15px] rounded-[4px] border text-[7px] grid place-items-center flex-none" style={mstyle(!!pad.mute, '#fff')} aria-label={`Mute ${pad.name}`}>M</button>
                    </div>
                    <div className="relative flex-1">
                      <PadLane
                        padIdx={padIdx}
                        color={pad.color}
                        windows={padWindowsFor(padIdx)}
                        pxPerBeat={pxPerBeat}
                        contentW={contentW}
                        onToggle={(patternId, local) => p.onMutate((d) => {
                          const pat = d.patterns.find((x) => x.id === patternId); if (!pat) return;
                          const r = pat.steps[padIdx] || (pat.steps[padIdx] = {});
                          if (r[local]?.v) delete r[local]; else r[local] = { v: 100 };
                        })}
                        onSetPadLen={(trackId, clipId, len) => setPadLen(trackId, clipId, padIdx, len)}
                      />
                    </div>
                  </div>
                );
              })}

              {p.doc.arrangement.filter((track) => !track.padOwned && (!track.folderId || !p.doc.arrangement.find((f) => f.id === track.folderId)?.collapsed)).map((track) => (
                <React.Fragment key={track.id}>
                <div className="flex border-b border-white/[0.06]" style={{ height: laneHeightOf(track), opacity: track.foreign ? 0.65 : 1 }}>
                  <div
                    className="sticky left-0 z-10 flex items-center gap-2 px-3 bg-[#0E0916] border-r border-white/10"
                    style={{
                      width: headerW, minWidth: headerW,
                      boxShadow: selectedTrack === track.id ? `inset 2px 0 0 ${SELECT}` : undefined,
                    }}
                    onClick={() => setSelectedTrack(track.id)}
                    {...trackMenu.bind(track.id)}
                  >
                    {/* Bitwig-style per-track height grip — drag the track's bottom edge. */}
                    <div
                      onPointerDown={(e) => startLaneResize(track.id, laneHeightOf(track), e)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => { e.stopPropagation(); p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.laneH = undefined; }); }}
                      className="absolute left-0 right-0 bottom-0 h-[6px] cursor-ns-resize hover:bg-[#FF8C00]/50 z-20"
                      title="Drag to resize this track · double-click to reset"
                    />
                    {track.isFolder ? (
                      <button onClick={(e) => { e.stopPropagation(); p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.collapsed = !t.collapsed; }); }} className="w-4 h-6 grid place-items-center text-white/50" aria-label={track.collapsed ? `Expand ${track.name}` : `Collapse ${track.name}`}>{track.collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>
                    ) : track.kind === 'instrument' && !track.foreign ? (
                      <button
                        onClick={() => requestOpen(track.id)}
                        className="w-[4px] h-6 rounded-[2px] flex-none hover:h-7 transition-all"
                        style={{ background: track.color }}
                        title="Open the instrument"
                        aria-label={`Open ${track.name}`}
                      />
                    ) : (
                      <span className="w-[4px] h-6 rounded-[2px] flex-none" style={{ background: track.color }} />
                    )}
                    {renamingTrack === track.id ? (
                      <input
                        autoFocus
                        value={nameText}
                        onChange={(e) => setNameText(e.target.value)}
                        onBlur={() => commitTrackRename(track.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitTrackRename(track.id); if (e.key === 'Escape') setRenamingTrack(null); }}
                        className="flex-1 min-w-0 h-6 px-1 rounded bg-black/40 border border-white/25 text-[11px] text-white outline-none"
                        aria-label={`Rename ${track.name}`}
                      />
                    ) : (
                      <span
                        className="flex-1 min-w-0 truncate text-[11px] text-white/80"
                        title={track.foreign ? track.name : `${track.name} — click to select · double-click to rename · right-click for menu`}
                        onDoubleClick={() => { if (!track.foreign) { setNameText(track.name); setRenamingTrack(track.id); } }}
                      >{track.name}</span>
                    )}
                    {track.foreign ? (
                      <span className="text-[8px] text-[#D0BCFF] border border-[#D0BCFF]/35 rounded px-1 flex-none">preserved</span>
                    ) : (
                      <>
                        {track.kind === 'instrument' && (
                          <button
                            onClick={() => p.onMutate((d) => {
                              const on = !track.armed;
                              // Only one armed instrument: playing the keyboard has to be unambiguous.
                              // Hardware-input tracks arm independently (multitrack).
                              for (const t of d.arrangement) if (t.kind === 'instrument') t.armed = false;
                              const t = d.arrangement.find((x) => x.id === track.id);
                              if (t) t.armed = on;
                            })}
                            className="w-[17px] h-[17px] rounded-full border grid place-items-center flex-none"
                            style={track.armed
                              ? { background: 'rgba(255,140,0,0.22)', borderColor: '#FF8C00', color: '#FF8C00' }
                              : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.3)' }}
                            title={track.armed ? 'Armed — your keyboard plays this' : 'Arm for playing and recording'}
                            aria-label={`Arm ${track.name}`}
                          ><Circle size={7} fill="currentColor" /></button>
                        )}
                        {track.kind === 'audio' && track.input && (
                          <button
                            onClick={() => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.armed = !t.armed; })}
                            className="w-[17px] h-[17px] rounded-full border grid place-items-center flex-none"
                            style={track.armed
                              ? { background: 'rgba(255,77,77,0.22)', borderColor: '#FF4D4D', color: '#FF4D4D' }
                              : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.3)' }}
                            title={track.armed
                              ? `Armed — records input ${track.input.input + 1}${track.input.inputR != null ? `/${track.input.inputR + 1}` : ''}`
                              : `Arm to record input ${track.input.input + 1}${track.input.inputR != null ? `/${track.input.inputR + 1}` : ''}`}
                            aria-label={`Arm ${track.name} for recording`}
                          ><Circle size={7} fill="currentColor" /></button>
                        )}
                        {!track.isFolder && (
                          <button
                            onClick={() => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.showAutomation = !t.showAutomation; })}
                            className="w-[17px] h-[17px] rounded-[5px] border text-[8px] grid place-items-center flex-none"
                            style={track.showAutomation
                              ? { background: 'rgba(6,214,160,0.18)', borderColor: '#06D6A0', color: '#06D6A0' }
                              : track.automationLanes?.length
                                ? { borderColor: 'rgba(6,214,160,0.5)', color: '#06D6A0' }
                                : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
                            title={track.automationLanes?.length ? `Automation (${track.automationLanes.length} lane${track.automationLanes.length > 1 ? 's' : ''}) — show/hide` : 'Show automation lanes'}
                            aria-label={`Automation for ${track.name}`}
                          >A</button>
                        )}
                        <button onClick={() => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.mute = !t.mute; })}
                          className="w-[17px] h-[17px] rounded-[5px] border text-[8px] grid place-items-center flex-none"
                          style={track.mute ? { background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
                          aria-label={`Mute ${track.name}`}>M</button>
                        <button onClick={() => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.solo = !t.solo; })}
                          className="w-[17px] h-[17px] rounded-[5px] border text-[8px] grid place-items-center flex-none"
                          style={track.solo ? { background: 'rgba(0,218,243,0.2)', borderColor: PLAYHEAD, color: PLAYHEAD } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
                          aria-label={`Solo ${track.name}`}>S</button>
                      </>
                    )}
                  </div>

                   <div
                    data-timeline-track-id={track.id}
                    className="relative flex-1"
                    onClick={(e) => {
                      // Pencil: paint on a single click (double-click still works on any tool).
                      if (tool !== 'pencil') return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const at = (e.clientX - rect.left) / pxPerBeat;
                      if (track.kind === 'pattern') paintClip(track.id, at);
                      else if (track.kind === 'instrument' && !track.foreign) addMidiClip(track.id, at);
                    }}
                    onDoubleClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const at = (e.clientX - rect.left) / pxPerBeat;
                      if (track.kind === 'pattern') paintClip(track.id, at);
                      else if (track.kind === 'instrument' && !track.foreign) addMidiClip(track.id, at);
                    }}
                    onDragOver={(e) => { if (track.kind === 'audio' && !track.foreign) e.preventDefault(); }}
                    onDrop={(e) => {
                      if (track.kind !== 'audio' || track.foreign) return;
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (!f) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      void dropAudio(track.id, (e.clientX - rect.left) / pxPerBeat, f);
                    }}
                  >
                    {track.clips.map((clip) => {
                      const pat = p.doc.patterns.find((x) => x.id === clip.patternId);
                       const selected = clipSelection.isSelected(clip.id);
                      const clipColor = clip.color || track.color;
                      return (
                        <div
                           key={clip.id}
                           data-select-id={clip.id}
                          onContextMenu={clipMenu.bind({ trackId: track.id, clipId: clip.id }).onContextMenu}
                          onPointerDown={(e) => {
                            if (track.foreign) return;
                            e.stopPropagation();
                            const el = e.currentTarget as HTMLElement;
                            // The Bitwig tools act on the click, before any drag begins.
                            if (tool === 'knife') { splitClip(track.id, clip.id, snapAt(clip.startBeats + (e.clientX - el.getBoundingClientRect().left) / pxPerBeat, e)); return; }
                            if (tool === 'glue') { glueClip(track.id, clip.id); return; }
                            if (tool === 'eraser') { eraseClip(track.id, clip.id); return; }
                             const wasSelected = clipSelection.isSelected(clip.id);
                             const copyDrag = e.ctrlKey || e.metaKey;
                             // Shift-click toggles selection; Ctrl/⌘-click toggles on RELEASE (so a
                             // Ctrl-drag can copy the existing selection instead of deselecting it).
                             if (e.shiftKey) { clipSelection.handleSelect(clip.id, e); return; }
                             if (!wasSelected && !copyDrag) clipSelection.handleSelect(clip.id, e);
                             if (tool === 'pencil') return; // pencil paints on lanes; on clips it just selects
                             const memberIds = wasSelected ? clipSelection.selectedIds : [clip.id];
                             const r = el.getBoundingClientRect();
                             const edge = Math.min(8, r.width / 4);
                             const mode = e.altKey ? 'slip' : copyDrag ? 'copy'
                               : e.clientX > r.right - edge ? 'trim' : e.clientX < r.left + edge ? 'trimL' : 'move';
                             el.setPointerCapture(e.pointerId);
                             const members = (mode === 'move' || mode === 'copy')
                               ? p.doc.arrangement.flatMap(sourceTrack => sourceTrack.clips
                                 .filter(item => memberIds.includes(item.id))
                                 .map(item => ({ trackId: sourceTrack.id, clip: structuredClone(item) })))
                               : [{ trackId: track.id, clip: structuredClone(clip) }];
                             drag.current = { clipId: clip.id, trackId: track.id, mode, startX: e.clientX, orig: structuredClone(clip), members };
                          }}
                          onPointerMove={(e) => {
                             const dr = drag.current;
                             if (!dr || dr.clipId !== clip.id) return;
                             const dBeats = (e.clientX - dr.startX) / pxPerBeat;
                             if (!dr.moved && Math.abs(e.clientX - dr.startX) < 3) return; // a click, not a drag yet
                             dr.moved = true;
                             // Grid snap on the edge being moved; Shift mid-drag = free (Alt is slip).
                             const free = { shiftKey: e.shiftKey };
                             const minLen = e.shiftKey ? 1 / 64 : gridCellBeats(dr.orig.startBeats, grid, meter, pxPerBeat);
                             const trimEnd = dr.mode === 'trim' ? snapAt(dr.orig.startBeats + dr.orig.lengthBeats + dBeats, free) : 0;
                             const trimStart = dr.mode === 'trimL' ? snapAt(dr.orig.startBeats + dBeats, free) : 0;
                             const snappedStart = dr.mode === 'move' || dr.mode === 'copy' ? snapAt(dr.orig.startBeats + dBeats, free) : 0;
                             // Slip moves by whole grid cells (Shift = free).
                             const cell = gridCellBeats(dr.orig.startBeats, grid, meter, pxPerBeat);
                             const slipBy = e.shiftKey ? dBeats : Math.round(dBeats / cell) * cell;
                             p.onMutate((d) => {
                               const t = d.arrangement.find((x) => x.id === dr.trackId);
                               const c = t?.clips.find((x) => x.id === dr.clipId);
                               // Edits that reshape one clip restart from the grabbed snapshot each move.
                               const restore = () => {
                                 if (!c) return;
                                 c.startBeats = dr.orig.startBeats; c.lengthBeats = dr.orig.lengthBeats;
                                 if (dr.orig.contentOffsetBeats === undefined) delete c.contentOffsetBeats; else c.contentOffsetBeats = dr.orig.contentOffsetBeats;
                                 if (c.audio && dr.orig.audio) c.audio.offsetSec = dr.orig.audio.offsetSec;
                               };
                               if (dr.mode === 'trim') {
                                 if (!c) return;
                                 c.lengthBeats = Math.max(minLen, trimEnd - dr.orig.startBeats);
                                 return;
                               }
                               if (dr.mode === 'trimL') {
                                 if (!c) return;
                                 restore();
                                 trimClipStart(d, dr.trackId, dr.clipId, trimStart, minLen);
                                 return;
                               }
                               if (dr.mode === 'slip') {
                                 if (!c) return;
                                 restore();
                                 slipClip(d, c, slipBy);
                                 return;
                               }
                               // Copy: on the first real movement, clone the members in place and
                               // drag the clones (the originals stay where they were).
                               if (dr.mode === 'copy' && !dr.members[0]?.copyId) {
                                 for (const member of dr.members) {
                                   const lane = d.arrangement.find((x) => x.id === member.trackId);
                                   if (!lane) continue;
                                   const copy = structuredClone(member.clip);
                                   copy.id = grooveUid() + grooveUid();
                                   delete copy.sectionId;
                                   if (copy.notes) copy.notes = copy.notes.map((n) => ({ ...n, id: grooveUid() }));
                                   lane.clips.push(copy);
                                   member.copyId = copy.id;
                                 }
                               }

                               // Move the complete selection as one transaction. Horizontal motion
                               // preserves relative timing. The vertical lane transfer is committed
                               // on pointer-up so pointer capture is not lost when React reparents clips.
                               const minStart = Math.min(...dr.members.map(member => member.clip.startBeats));
                               // The grabbed clip lands on the grid; the rest keep their offsets to it.
                               const beatDelta = Math.max(-minStart, snappedStart - dr.orig.startBeats);
                               const hovered = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-timeline-track-id]')?.dataset.timelineTrackId;
                               if (hovered) dr.targetTrackId = hovered;
                               for (const member of dr.members) {
                                 const lane = d.arrangement.find(item => item.id === member.trackId);
                                 const moving = lane?.clips.find(item => item.id === (member.copyId ?? member.clip.id));
                                 if (moving) moving.startBeats = member.clip.startBeats + beatDelta;
                               }
                             });
                           }}
                          onPointerUp={(e) => {
                            const dr = drag.current; drag.current = null;
                            if (!dr) return;
                            // Ctrl/⌘-click without a drag = toggle selection.
                            if (dr.mode === 'copy' && !dr.moved) { clipSelection.handleSelect(clip.id, e); return; }
                            if (dr.mode === 'copy' && dr.moved) {
                              const made = dr.members.map((m) => m.copyId).filter((x): x is string => !!x);
                              if (made.length) clipSelection.selectMany(made, made.at(-1));
                            }
                            if ((dr.mode !== 'move' && dr.mode !== 'copy') || !dr.targetTrackId || dr.targetTrackId === dr.trackId) return;
                            p.onMutate((d) => {
                              const primaryOrigIndex = d.arrangement.findIndex(item => item.id === dr.trackId);
                              const hoverIndex = d.arrangement.findIndex(item => item.id === dr.targetTrackId);
                              if (primaryOrigIndex < 0 || hoverIndex < 0) return;
                              const laneDelta = hoverIndex - primaryOrigIndex;
                              const moving = new Map<string, TimelineClip>();
                              const movingIds = new Set(dr.members.map((m) => m.copyId ?? m.clip.id));
                              for (const lane of d.arrangement) for (const item of lane.clips) if (movingIds.has(item.id)) moving.set(item.id, structuredClone(item));
                              for (const lane of d.arrangement) lane.clips = lane.clips.filter(item => !moving.has(item.id));
                              for (const member of dr.members) {
                                const sourceIndex = d.arrangement.findIndex(item => item.id === member.trackId);
                                const sourceKind = d.arrangement[sourceIndex]?.kind;
                                const desiredIndex = Math.max(0, Math.min(d.arrangement.length - 1, sourceIndex + laneDelta));
                                const destination = d.arrangement
                                  .map((lane, index) => ({ lane, index }))
                                  .filter(({ lane }) => !lane.foreign && !lane.isFolder && lane.kind === sourceKind)
                                  .sort((a, b) => Math.abs(a.index - desiredIndex) - Math.abs(b.index - desiredIndex))[0]?.lane || d.arrangement[sourceIndex];
                                const moved = moving.get(member.copyId ?? member.clip.id);
                                if (destination && moved) destination.clips.push(moved);
                              }
                            });
                          }}
                          onDoubleClick={(e) => {
                            // A MIDI clip opens its editor; that's the whole point of the clip.
                            if (track.kind === 'instrument' && !track.foreign) {
                              e.stopPropagation();
                              setOpenClip({ trackId: track.id, clipId: clip.id });
                            }
                          }}
                          className="absolute top-[6px] bottom-[6px] rounded-[8px] flex items-center px-2 overflow-hidden select-none"
                          style={{
                            left: clip.startBeats * pxPerBeat,
                            width: Math.max(10, clip.lengthBeats * pxPerBeat - 2),
                            background: track.foreign
                              ? 'rgba(208,188,255,0.08)'
                              : `${clipColor}24`,
                            border: track.foreign
                              ? '1px dashed rgba(208,188,255,0.4)'
                              : clip.audio ? '1px solid rgba(0,218,243,0.45)'
                              : clip.notes ? '1px solid rgba(208,188,255,0.42)' : 'none',
                            outline: selected ? `2px solid ${SELECT}` : 'none',
                            outlineOffset: 1,
                            cursor: track.foreign ? 'default'
                              : tool === 'knife' ? 'col-resize'
                              : tool === 'eraser' ? 'not-allowed'
                              : tool === 'glue' ? 'cell'
                              : tool === 'pencil' ? 'crosshair' : 'grab',
                          }}
                          title={track.foreign ? 'Preserved for re-export — not played in browser' : `${pat?.name || clip.audio?.name || 'Clip'} · drag to move · edges to trim · Alt-drag to slip · Ctrl-drag to copy · Shift = no snap · Delete to remove`}
                        >
                          {clip.audio && !track.foreign && <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" aria-hidden="true"><path d={(clip.audio.peaks?.length ? clip.audio.peaks : [0.2,0.5,0.3,0.7,0.4]).map((v, i, a) => `${i ? 'L' : 'M'} ${(i / Math.max(1, a.length - 1)) * 100} ${50 - v * 42}`).join(' ') + ' ' + (clip.audio.peaks?.length ? [...clip.audio.peaks].reverse() : [0.4,0.7,0.3,0.5,0.2]).map((v, i, a) => `L ${100 - (i / Math.max(1, a.length - 1)) * 100} ${50 + v * 42}`).join(' ') + ' Z'} fill={`${clipColor}70`} stroke={clipColor} strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg>}
                          {/* MIDI clips draw their notes, so the arrangement shows the music. */}
                          {clip.notes && clip.notes.length > 0 && !track.foreign && (() => {
                            // What the clip PLAYS: through its slip offset and loop passes.
                            const occ = noteOccurrences(clip);
                            if (!occ.length) return null;
                            const keys = occ.map((o) => o.note.key);
                            const lo = Math.min(...keys) - 1;
                            const span = Math.max(6, Math.max(...keys) + 1 - lo);
                            return (
                              <span className="absolute inset-x-0 top-[3px] bottom-[3px] pointer-events-none">
                                {occ.map((o, i) => (
                                  <span key={`${o.note.id}-${i}`} className="absolute rounded-[1px]" style={{
                                    left: `${((o.songBeat - clip.startBeats) / clip.lengthBeats) * 100}%`,
                                    width: `${Math.max(1.5, (o.lengthBeats / clip.lengthBeats) * 100)}%`,
                                    bottom: `${((o.note.key - lo) / span) * 100}%`,
                                    height: 2,
                                    background: 'rgba(208,188,255,0.85)',
                                  }} />
                                ))}
                              </span>
                            );
                          })()}
                          {/* Loop passes: a notch where content wraps back to the loop start. */}
                          {!track.foreign && clipIsLooped(clip) && !clip.audio && contentWindows(clip).slice(1).map((w) => (
                            <span key={`lp${w.songStart}`} className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: (w.songStart - clip.startBeats) * pxPerBeat, background: `${clipColor}`, opacity: 0.55 }} />
                          ))}
                          {!track.foreign && clip.audio?.loop && (() => {
                            // Audio loop passes, in song beats via the clip's average tempo.
                            const secs = tempo.secBetween(clip.startBeats, clip.startBeats + clip.lengthBeats);
                            const rate = clip.audio.stretch && clip.audio.stretch > 0 ? clip.audio.stretch : 1;
                            const first = (clip.audio.loop.startSec + clip.audio.loop.lengthSec - (clip.audio.offsetSec || 0)) / rate;
                            const per = clip.audio.loop.lengthSec / rate;
                            const marks: number[] = [];
                            for (let x = first; x < secs - 1e-3 && marks.length < 256; x += per) marks.push(x / secs);
                            return marks.map((f) => <span key={`al${f}`} className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${f * 100}%`, background: clipColor, opacity: 0.55 }} />);
                          })()}
                          <span className="relative text-[10px] font-semibold truncate" style={{ color: track.foreign ? '#D0BCFF' : clipColor }}>
                            {track.foreign ? track.name : pat?.name || clip.audio?.name || (clip.notes ? `${clip.notes.length} notes` : 'Clip')}
                          </span>
                          {!track.foreign && <span className="absolute left-0 top-0 bottom-0 w-[6px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.07)' }} />}
                          {!track.foreign && <span className="absolute right-0 top-0 bottom-0 w-[8px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.12)' }} />}
                          {!track.foreign && clipIsLooped(clip) && <span className="absolute top-[2px] right-[10px] text-[8px] pointer-events-none" style={{ color: clipColor }} aria-hidden="true">⟳</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {track.showAutomation && !track.foreign && !track.isFolder && (
                  <TrackAutomation
                    doc={p.doc}
                    track={track}
                    headerW={headerW}
                    pxPerBeat={pxPerBeat}
                    contentBeats={contentBeats}
                    snap={(b, e) => snapAt(b, e)}
                    cell={(b) => gridCellBeats(b, grid, meter, pxPerBeat)}
                    cursorBeat={p.running && p.playMode === 'song' ? p.beats : (p.songStartBeats ?? 0)}
                    onMutate={p.onMutate}
                  />
                )}
                </React.Fragment>
              ))}

              <div
                className="flex items-center gap-2 px-3 transition-colors"
                style={{ height: 40, background: dropHot ? 'rgba(0,218,243,0.10)' : 'transparent', outline: dropHot ? '1.5px dashed rgba(0,218,243,0.5)' : 'none', outlineOffset: -3 }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-plajah-media-asset')) { e.preventDefault(); setDropHot(true); } }}
                onDragLeave={() => setDropHot(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDropHot(false);
                  const shared = e.dataTransfer.getData('application/x-plajah-media-asset');
                  if (shared) {
                    try {
                      const asset = JSON.parse(shared) as { context?: string; name?: string; sampleKey?: string };
                      if (asset.context === 'melos' && asset.sampleKey) {
                        const source = p.doc.arrangement.flatMap((t) => t.clips).find((c) => c.audio?.sampleKey === asset.sampleKey)?.audio;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const at = barFloorOf(p.doc, (e.clientX - rect.left - headerW + (e.currentTarget.parentElement?.parentElement?.scrollLeft || 0)) / pxPerBeat);
                        if (source) p.onMutate((d) => d.arrangement.push({ id: grooveUid(), kind: 'audio', name: asset.name || source.name, color: TRACK_COLORS[d.arrangement.length % TRACK_COLORS.length], mute: false, solo: false, gainDb: 0, pan: 0, clips: [{ id: grooveUid(), startBeats: at, lengthBeats: Math.max(1 / 16, audioLengthBeats(d, at, source.durationSec, source.stretch || 1)), audio: JSON.parse(JSON.stringify(source)) }] }));
                      }
                    } catch { /* malformed external drag */ }
                    return;
                  }
                  const files = Array.from(e.dataTransfer.files || []);
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const atBeats = Math.max(0, (e.clientX - rect.left - headerW + (e.currentTarget.parentElement?.parentElement?.scrollLeft || 0)) / pxPerBeat);
                  if (files.length) void dropNewTracks(files, atBeats);
                }}
              >
                <button onClick={() => addTrack('pattern')} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-white text-[10px] flex items-center gap-1"><Plus size={10} /><Music2 size={10} /> Pattern track</button>
                <button onClick={() => addTrack('audio')} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-white text-[10px] flex items-center gap-1"><Plus size={10} /><AudioWaveform size={10} /> Audio track</button>
                <button onClick={() => p.onMutate((d) => d.arrangement.push({ id: grooveUid(), kind: 'pattern', isFolder: true, collapsed: false, name: 'Track Folder', color: '#8B8194', mute: false, solo: false, gainDb: 0, pan: 0, clips: [] }))} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-white text-[10px] flex items-center gap-1"><FolderPlus size={10} /> Folder</button>
                <button
                  onClick={(e) => instrumentAddMenu.openFrom(e.currentTarget, null)}
                  title="Add an instrument — as a MEKA pad, or its own independent MIDI track"
                  className="h-6 px-2 rounded-lg border text-[10px] flex items-center gap-1"
                  style={{ borderColor: 'rgba(208,188,255,0.4)', color: '#D0BCFF' }}
                ><Plus size={10} /><Piano size={10} /> Instrument</button>
                <span className="text-[9px]" style={{ color: dropHot ? '#00DAF3' : 'rgba(255,255,255,0.2)' }}>
                  {dropHot ? 'Drop to add one labelled track per file' : 'double-click a lane to add a clip · drop audio files here to make tracks'}
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Bitwig-style docked detail editor — devices / notes / audio for the selected clip. */}
        {showEditor && <TimelineEditPanel doc={p.doc} selected={selRef} onMutate={p.onMutate} height={editorH} onResize={setEditorH} />}

        <div className="flex items-center gap-3 px-3 h-8 border-t border-white/10 flex-none text-[10px] text-white/35">
          {/* The tool set — Bitwig's grammar: 1 pointer · 2 pencil · 3 knife · 4 glue · 5 eraser */}
          <div className="flex gap-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
            {([
              ['select', MousePointer2, 'Pointer — select, move, trim (1)'],
              ['pencil', Pencil, 'Pencil — click a lane to paint a clip (2)'],
              ['knife', Scissors, 'Knife — click a clip to split it (3)'],
              ['glue', Combine, 'Glue — click a clip to join it with the next (4)'],
              ['eraser', Eraser, 'Eraser — click a clip to delete it (5)'],
            ] as const).map(([id, Icon, tip]) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={tip}
                aria-label={tip}
                className="w-6 h-6 grid place-items-center rounded-md transition-colors"
                style={tool === id ? { background: `${SELECT}30`, color: '#fff' } : { color: 'rgba(255,255,255,0.4)' }}
              ><Icon size={12} /></button>
            ))}
          </div>
          {clipSelection.selectedIds.length > 1 && (
            <span className="font-semibold" style={{ color: PLAYHEAD }}>{clipSelection.selectedIds.length} clips selected</span>
          )}
          <button
            onClick={(e) => gridMenu.openFrom(e.currentTarget, undefined)}
            className="flex items-center gap-1 hover:text-white"
            title="Snap grid — adaptive follows the zoom · hold Shift (or Alt) while dragging to place freely"
          >Grid: <b className="text-white/60">{gridLabel(grid, pxPerBeat, meter.at(0).lenBeats)}</b></button>
          <button
            onClick={() => setShowTempo((v) => { const next = !v; try { localStorage.setItem('melos:timeline:tempo', next ? '1' : '0'); } catch { /* */ } return next; })}
            aria-pressed={showTempo}
            className="flex items-center gap-1 hover:text-white"
            style={{ color: showTempo ? '#FFD166' : 'rgba(255,255,255,0.45)' }}
            title="Show the tempo track"
          >Tempo</button>
          <label className="flex items-center gap-1.5">Zoom
            <input type="range" min={1} max={48} step="0.5" value={pxPerBeat} onChange={(e) => setPxPerBeat(Number(e.target.value))} className="w-28 accent-[#D0BCFF]" />
          </label>
          <button onClick={fitToView} className="flex items-center gap-1 hover:text-white" title="Fit the complete production in view"><Scan size={12} /> Fit</button>
          <button onClick={() => setFollowPlayhead((v) => { const next = !v; try { localStorage.setItem('melos:timeline:follow', next ? '1' : '0'); } catch {} return next; })} aria-pressed={followPlayhead} className="flex items-center gap-1 hover:text-white" style={{ color: followPlayhead ? PLAYHEAD : 'rgba(255,255,255,0.45)' }} title="Automatically keep the playhead in view"><LocateFixed size={12} /> Follow</button>
          <span className="flex-1" />
          <button onClick={toggleLauncher} className="flex items-center gap-1 hover:text-white" style={{ color: showLauncher ? PLAYHEAD : 'rgba(255,255,255,0.45)' }}>
            {showLauncher ? <ChevronDown size={11} /> : <ChevronUp size={11} />} Launcher
          </button>
          <button onClick={() => setShowEditor((v) => !v)} className="flex items-center gap-1 text-white/45 hover:text-white">
            {showEditor ? <ChevronDown size={11} /> : <ChevronUp size={11} />} Editor
          </button>
          <button onClick={() => setShowMixer((v) => !v)} className="flex items-center gap-1 text-white/45 hover:text-white">
            {showMixer ? <ChevronDown size={11} /> : <ChevronUp size={11} />} Mixer
          </button>
        </div>
      </div>

      {ingest && <div className="absolute left-1/2 top-20 -translate-x-1/2 z-50 w-[min(440px,86vw)] rounded-xl border border-white/15 bg-[#100A18]/95 backdrop-blur-xl p-3 shadow-2xl" role="status" aria-live="polite"><div className="flex justify-between text-[10px] text-white/70"><span className="truncate pr-4">Loading {ingest.name}</span><b>{ingest.done}/{ingest.total}</b></div><div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#00DAF3] transition-[width]" style={{ width: `${(ingest.done / Math.max(1, ingest.total)) * 100}%` }} /></div></div>}

      {showMixer && <div className="rounded-b-[18px] overflow-hidden -mt-px"><MixerPanel doc={p.doc} meters={p.meters} onMutate={p.onMutate} /></div>}

      {/* When standalone (no room handler), fall back to opening the panel here. */}
      {openInstrument && (() => {
        const t = p.doc.arrangement.find((x) => x.id === openInstrument);
        if (!t || t.kind !== 'instrument') return null;
        return <InstrumentPanel doc={p.doc} track={t} onMutate={p.onMutate} onClose={() => setLocalOpen(null)} />;
      })()}

      {(() => {
        if (!openClip) return null;
        const t = p.doc.arrangement.find((x) => x.id === openClip.trackId);
        const c = t?.clips.find((x) => x.id === openClip.clipId);
        if (!t || !c) return null;
        return (
          <PianoRoll
            doc={p.doc}
            trackId={t.id}
            clip={c}
            beats={p.beats}
            running={p.running}
            playMode={p.playMode}
            onMutate={p.onMutate}
            onClose={() => setOpenClip(null)}
          />
        );
      })()}
    </div>
  );
};
