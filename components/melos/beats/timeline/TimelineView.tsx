// The Timeline — Bitwig Arranger / Studio One arrangement paradigm (approved mockup 05):
// track headers left, clip lanes over a bar ruler right, cyan playhead, H-zoom, snap, and the
// docked mixer underneath. Edits GrooveDoc.arrangement directly; imported .dawproject tracks
// land here, with preserved plugin tracks dimmed.
// Grammar: double-click empty lane = paint the active pattern · drag = move (bar snap) ·
// right-edge grip = trim (beat snap) · click = select · Delete = remove · drop audio = clip.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Music2, AudioWaveform, Piano, Circle, MousePointer2, Pencil, Scissors, Combine, Eraser, Scan, LocateFixed, FolderPlus } from 'lucide-react';
import { unzipSync } from 'fflate';
import type { GrooveDoc, Pattern, TimelineClip } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { useContextMenu, type MenuNode } from '../../../ui/ContextMenu';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample, backupToLocker } from '../../../../services/melos/beats/sampleStore';
import { MixerPanel } from '../shared/MixerPanel';
import { PianoRoll } from './PianoRoll';
import { TimelineEditPanel } from './TimelineEditPanel';
import { InstrumentPanel } from '../instrument/InstrumentPanel';
import { ClipLauncher } from './ClipLauncher';
import { useUniversalMarquee, useUniversalMultiSelect } from '../../../../hooks/useUniversalMultiSelect';

import { PLAYHEAD, SELECT, glassPanel } from '../theme';

const BEATS_PER_BAR = 4;
const LANE_H = 44;
const PAD_LANE_H = 28;
const STEPS_PER_BEAT = 4;
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
  meters: { groups: number[]; master: number; sends: number[] };
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onPlayFrom: (fromBeats: number) => void;
  /** Room-owned: open a specific instrument's panel (so the add-picker can too). */
  onOpenInstrument?: (id: string) => void;
  /** Room-owned: open the instrument picker (choose ONDA/KERA/…). */
  onAddInstrument?: () => void;
}

export const TimelineView: React.FC<TimelineViewProps> = (p) => {
  const [headerW, setHeaderW] = useState(() => Math.max(132, Math.min(360, Number(localStorage.getItem('melos:timeline:header-width')) || 172)));
  const [pxPerBeat, setPxPerBeat] = useState(14);
  const clipSelection = useUniversalMultiSelect(p.doc.arrangement.flatMap(track => track.clips.map(clip => clip.id)));
  const selectedClip = clipSelection.primaryId;
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const clipboardRef = useRef<{ trackId: string; clip: TimelineClip } | null>(null);
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
  const drag = useRef<{
    clipId: string;
    trackId: string;
    mode: 'move' | 'trim';
    startX: number;
    orig: TimelineClip;
    members: { trackId: string; clip: TimelineClip }[];
    targetTrackId?: string;
  } | null>(null);

  const contentBeats = Math.max(
    32 * BEATS_PER_BAR,
    ...p.doc.arrangement.flatMap((t) => t.clips.map((c) => c.startBeats + c.lengthBeats + 8 * BEATS_PER_BAR)),
  );
  const totalBars = Math.ceil(contentBeats / BEATS_PER_BAR);
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
        { id: 'arm', label: 'Arm for play/record', checked: !!track.armed, onSelect: () => p.onMutate((d) => { const on = !track.armed; for (const t of d.arrangement) t.armed = false; const t = d.arrangement.find((x) => x.id === trackId); if (t) t.armed = on; }) },
      );
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
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'c' && selectedClip) {
        for (const t of p.doc.arrangement) { const clip = t.clips.find((c) => c.id === selectedClip); if (clip) { clipboardRef.current = { trackId: t.id, clip: JSON.parse(JSON.stringify(clip)) }; e.preventDefault(); return; } }
      }
      if (mod && e.key.toLowerCase() === 'v' && clipboardRef.current) {
        const saved = clipboardRef.current;
        let pastedId = '';
        p.onMutate((d) => { const track = d.arrangement.find((t) => t.id === (selectedTrack || saved.trackId)) || d.arrangement.find((t) => t.id === saved.trackId); if (!track || track.foreign) return; const copy = JSON.parse(JSON.stringify(saved.clip)); copy.id = grooveUid() + grooveUid(); copy.startBeats += copy.lengthBeats; track.clips.push(copy); pastedId = copy.id; });
        if (pastedId) clipSelection.selectOnly(pastedId);
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
  }, [selectedClip, selectedTrack, p.doc, p.onMutate, clipSelection]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }
    items.push(
      { id: 'dup', label: targetIds.length > 1 ? `Duplicate ${targetIds.length} clips` : 'Duplicate', onSelect: () => { const made: string[] = []; p.onMutate((d) => { for (const t of d.arrangement) { const originals = t.clips.filter(c => targetIds.includes(c.id)); for (const c of originals) { const copy = structuredClone(c); copy.id = grooveUid() + grooveUid(); copy.startBeats = c.startBeats + c.lengthBeats; t.clips.push(copy); made.push(copy.id); } } }); if (made.length) clipSelection.selectMany(made, made.at(-1)); } },
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
      const startBeats = Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR;
      if (track.clips.some((c) => startBeats < c.startBeats + c.lengthBeats && startBeats + 1 > c.startBeats)) return;
      const lengthBeats = Math.max(BEATS_PER_BAR, (p.activePattern.length / 16) * BEATS_PER_BAR);
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
    const spb = 60 / p.doc.bpm;
    p.onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'audio' || track.foreign) return;
      track.clips.push({
        id: grooveUid(),
        startBeats: Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR,
        lengthBeats: Math.max(1, Math.round((result.buffer.duration / spb) * 4) / 4),
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
    const spb = 60 / p.doc.bpm;
    const startBar = Math.max(0, Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR);
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
            lengthBeats: Math.max(1, Math.round((m.dur / spb) * 4) / 4),
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
      const startBeats = Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR;
      if (track.clips.some((c) => startBeats < c.startBeats + c.lengthBeats && startBeats + 1 > c.startBeats)) return;
      track.clips.push({ id: grooveUid(), startBeats, lengthBeats: BEATS_PER_BAR * 2, notes: [] });
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Knife: split a clip at a beat (1-beat snap), moving/clamping notes and audio offsets. */
  const splitClip = useCallback((trackId: string, clipId: string, atBeats: number) => {
    p.onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      const c = t?.clips.find((x) => x.id === clipId);
      if (!t || !c) return;
      const rel = Math.round(atBeats - c.startBeats);
      if (rel <= 0 || rel >= c.lengthBeats) return;
      const right = JSON.parse(JSON.stringify(c)) as TimelineClip;
      right.id = grooveUid() + grooveUid();
      right.startBeats = c.startBeats + rel;
      right.lengthBeats = c.lengthBeats - rel;
      c.lengthBeats = rel;
      if (c.notes) {
        right.notes = (right.notes ?? []).filter((n) => n.startBeats >= rel - 1e-6)
          .map((n) => ({ ...n, id: grooveUid(), startBeats: n.startBeats - rel }));
        c.notes = c.notes.filter((n) => n.startBeats < rel - 1e-6);
        for (const n of c.notes) if (n.startBeats + n.lengthBeats > rel) n.lengthBeats = rel - n.startBeats;
      }
      if (c.audio && right.audio) right.audio.offsetSec = (c.audio.offsetSec || 0) + rel * (60 / d.bpm);
      t.clips.push(right);
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Glue: merge a clip with the NEXT clip on its track (notes fold in; audio only if it's the
   *  same file continuing). */
  const glueClip = useCallback((trackId: string, clipId: string) => {
    p.onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      const c = t?.clips.find((x) => x.id === clipId);
      if (!t || !c) return;
      const after = t.clips
        .filter((x) => x.id !== c.id && x.startBeats >= c.startBeats + c.lengthBeats - 1e-6)
        .sort((a, b) => a.startBeats - b.startBeats);
      const next = after[0];
      if (!next) return;
      if (c.audio || next.audio) {
        if (!c.audio || !next.audio || c.audio.sampleKey !== next.audio.sampleKey) return;
      }
      const off = next.startBeats - c.startBeats;
      if (c.notes || next.notes) {
        c.notes = [...(c.notes ?? []), ...(next.notes ?? []).map((n) => ({ ...n, id: grooveUid(), startBeats: n.startBeats + off }))];
      }
      c.lengthBeats = next.startBeats + next.lengthBeats - c.startBeats;
      t.clips = t.clips.filter((x) => x.id !== next.id);
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const eraseClip = useCallback((trackId: string, clipId: string) => {
    p.onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      if (t) t.clips = t.clips.filter((x) => x.id !== clipId);
    });
    if (clipSelection.isSelected(clipId)) clipSelection.selectMany(clipSelection.selectedIds.filter(id => id !== clipId));
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const playheadX = p.running && p.playMode === 'song' ? p.beats * pxPerBeat : -1;

  // The selected clip, resolved to {track,clip} for the docked detail editor below.
  const selRef = selectedClip
    ? (() => { for (const t of p.doc.arrangement) if (t.clips.some((c) => c.id === selectedClip)) return { trackId: t.id, clipId: selectedClip }; return null; })()
    : null;

  // Draggable loop/cycle region on the ruler — move the body, drag either edge to resize; snaps
  // to the bar grid, and turns the loop on the moment you touch it.
  const loop = p.doc.loop ?? { on: false, startBeats: 0, endBeats: BEATS_PER_BAR * 4 };
  const dragLoop = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const start = { ...loop };
    const startX = e.clientX;
    const snap = (beats: number) => Math.round(beats / BEATS_PER_BAR) * BEATS_PER_BAR;
    const move = (ev: PointerEvent) => {
      const dBeats = (ev.clientX - startX) / pxPerBeat;
      p.onMutate((d) => {
        const l = d.loop ?? { on: true, startBeats: start.startBeats, endBeats: start.endBeats };
        if (mode === 'move') { const span = start.endBeats - start.startBeats; const s = Math.max(0, snap(start.startBeats + dBeats)); l.startBeats = s; l.endBeats = s + span; }
        else if (mode === 'l') l.startBeats = Math.max(0, Math.min(l.endBeats - BEATS_PER_BAR, snap(start.startBeats + dBeats)));
        else l.endBeats = Math.max(l.startBeats + BEATS_PER_BAR, snap(start.endBeats + dBeats));
        l.on = true;
        d.loop = l;
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 pt-3 gap-0">
      {marqueeSelection.marquee && <div className="fixed pointer-events-none z-[9998] border border-[#00DAF3] bg-[#00DAF3]/10" style={marqueeSelection.marquee} />}
      {clipMenu.node}
      <input ref={colorInputRef} type="color" className="sr-only" aria-label="Choose a custom clip color" onChange={(e) => { const target = colorTargetRef.current; if (!target) return; const color = e.target.value; p.onMutate((d) => { const c = d.arrangement.find((t) => t.id === target.trackId)?.clips.find((x) => x.id === target.clipId); if (c) c.color = color; }); colorTargetRef.current = null; }} />
      {padHeaderMenu.node}
      {trackMenu.node}
      <div className={`${glassPanel} flex-1 min-h-0 overflow-hidden flex flex-col`}>
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
                title="Click to play the song from this bar"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const beat = Math.floor(((e.clientX - rect.left) / pxPerBeat) / BEATS_PER_BAR) * BEATS_PER_BAR;
                  p.onPlayFrom(Math.max(0, beat));
                }}
              >
                {Array.from({ length: totalBars }, (_, b) => (
                  <span key={b} className="absolute top-1.5 text-[9px] font-mono text-white/30 select-none" style={{ left: b * BEATS_PER_BAR * pxPerBeat + 4 }}>
                    {b % 4 === 0 ? b + 1 : ''}
                  </span>
                ))}
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
              {playheadX >= 0 && (
                <div className="absolute top-0 bottom-0 w-[2px] z-20 pointer-events-none" style={{ left: headerW + playheadX, background: PLAYHEAD, boxShadow: `0 0 12px ${PLAYHEAD}88` }} />
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
                    <div className="relative flex-1" style={{ background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px ${BEATS_PER_BAR * pxPerBeat}px)` }}>
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
                <div key={track.id} className="flex border-b border-white/[0.06]" style={{ height: LANE_H, opacity: track.foreign ? 0.65 : 1 }}>
                  <div
                    className="sticky left-0 z-10 flex items-center gap-2 px-3 bg-[#0E0916] border-r border-white/10"
                    style={{
                      width: headerW, minWidth: headerW,
                      boxShadow: selectedTrack === track.id ? `inset 2px 0 0 ${SELECT}` : undefined,
                    }}
                    onClick={() => setSelectedTrack(track.id)}
                    {...trackMenu.bind(track.id)}
                  >
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
                              // Only one armed track: playing the keyboard has to be unambiguous.
                              for (const t of d.arrangement) t.armed = false;
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
                    style={{ background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, transparent 1px ${BEATS_PER_BAR * pxPerBeat}px)` }}
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
                            if (tool === 'knife') { splitClip(track.id, clip.id, clip.startBeats + (e.clientX - el.getBoundingClientRect().left) / pxPerBeat); return; }
                            if (tool === 'glue') { glueClip(track.id, clip.id); return; }
                            if (tool === 'eraser') { eraseClip(track.id, clip.id); return; }
                             const wasSelected = clipSelection.isSelected(clip.id);
                             const memberIds = wasSelected ? clipSelection.selectedIds : [clip.id];
                             if (!wasSelected || e.ctrlKey || e.metaKey || e.shiftKey) clipSelection.handleSelect(clip.id, e);
                             if (tool === 'pencil') return; // pencil paints on lanes; on clips it just selects
                             if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                             const isTrim = e.clientX > el.getBoundingClientRect().right - 10;
                             el.setPointerCapture(e.pointerId);
                             const members = p.doc.arrangement.flatMap(sourceTrack => sourceTrack.clips
                               .filter(item => memberIds.includes(item.id))
                               .map(item => ({ trackId: sourceTrack.id, clip: structuredClone(item) })));
                             drag.current = { clipId: clip.id, trackId: track.id, mode: isTrim ? 'trim' : 'move', startX: e.clientX, orig: structuredClone(clip), members };
                          }}
                          onPointerMove={(e) => {
                             const dr = drag.current;
                             if (!dr || dr.clipId !== clip.id) return;
                             const dBeats = (e.clientX - dr.startX) / pxPerBeat;
                             p.onMutate((d) => {
                               if (dr.mode === 'trim') {
                                 const t = d.arrangement.find((x) => x.id === dr.trackId);
                                 const c = t?.clips.find((x) => x.id === dr.clipId);
                                 if (!c) return;
                                 c.lengthBeats = Math.max(1, Math.round(dr.orig.lengthBeats + dBeats));
                                 return;
                               }

                               // Move the complete selection as one transaction. Horizontal motion
                               // preserves relative timing. The vertical lane transfer is committed
                               // on pointer-up so pointer capture is not lost when React reparents clips.
                               const minStart = Math.min(...dr.members.map(member => member.clip.startBeats));
                               const beatDelta = Math.max(-minStart, Math.round(dBeats / BEATS_PER_BAR) * BEATS_PER_BAR);
                               const hovered = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-timeline-track-id]')?.dataset.timelineTrackId;
                               if (hovered) dr.targetTrackId = hovered;
                               for (const member of dr.members) {
                                 const lane = d.arrangement.find(item => item.id === member.trackId);
                                 const moving = lane?.clips.find(item => item.id === member.clip.id);
                                 if (moving) moving.startBeats = member.clip.startBeats + beatDelta;
                               }
                             });
                           }}
                          onPointerUp={() => {
                            const dr = drag.current; drag.current = null;
                            if (!dr || dr.mode !== 'move' || !dr.targetTrackId || dr.targetTrackId === dr.trackId) return;
                            p.onMutate((d) => {
                              const primaryOrigIndex = d.arrangement.findIndex(item => item.id === dr.trackId);
                              const hoverIndex = d.arrangement.findIndex(item => item.id === dr.targetTrackId);
                              if (primaryOrigIndex < 0 || hoverIndex < 0) return;
                              const laneDelta = hoverIndex - primaryOrigIndex;
                              const moving = new Map<string, TimelineClip>();
                              for (const lane of d.arrangement) for (const item of lane.clips) if (dr.members.some(member => member.clip.id === item.id)) moving.set(item.id, structuredClone(item));
                              for (const lane of d.arrangement) lane.clips = lane.clips.filter(item => !moving.has(item.id));
                              for (const member of dr.members) {
                                const sourceIndex = d.arrangement.findIndex(item => item.id === member.trackId);
                                const sourceKind = d.arrangement[sourceIndex]?.kind;
                                const desiredIndex = Math.max(0, Math.min(d.arrangement.length - 1, sourceIndex + laneDelta));
                                const destination = d.arrangement
                                  .map((lane, index) => ({ lane, index }))
                                  .filter(({ lane }) => !lane.foreign && !lane.isFolder && lane.kind === sourceKind)
                                  .sort((a, b) => Math.abs(a.index - desiredIndex) - Math.abs(b.index - desiredIndex))[0]?.lane || d.arrangement[sourceIndex];
                                const moved = moving.get(member.clip.id);
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
                          title={track.foreign ? 'Preserved for re-export — not played in browser' : `${pat?.name || clip.audio?.name || 'Clip'} · drag to move (bar snap), right edge to trim, Delete to remove`}
                        >
                          {clip.audio && !track.foreign && <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" aria-hidden="true"><path d={(clip.audio.peaks?.length ? clip.audio.peaks : [0.2,0.5,0.3,0.7,0.4]).map((v, i, a) => `${i ? 'L' : 'M'} ${(i / Math.max(1, a.length - 1)) * 100} ${50 - v * 42}`).join(' ') + ' ' + (clip.audio.peaks?.length ? [...clip.audio.peaks].reverse() : [0.4,0.7,0.3,0.5,0.2]).map((v, i, a) => `L ${100 - (i / Math.max(1, a.length - 1)) * 100} ${50 + v * 42}`).join(' ') + ' Z'} fill={`${clipColor}70`} stroke={clipColor} strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg>}
                          {/* MIDI clips draw their notes, so the arrangement shows the music. */}
                          {clip.notes && clip.notes.length > 0 && !track.foreign && (() => {
                            const keys = clip.notes.map((n) => n.key);
                            const lo = Math.min(...keys) - 1;
                            const span = Math.max(6, Math.max(...keys) + 1 - lo);
                            return (
                              <span className="absolute inset-x-0 top-[3px] bottom-[3px] pointer-events-none">
                                {clip.notes.map((n) => (
                                  <span key={n.id} className="absolute rounded-[1px]" style={{
                                    left: `${(n.startBeats / clip.lengthBeats) * 100}%`,
                                    width: `${Math.max(1.5, (n.lengthBeats / clip.lengthBeats) * 100)}%`,
                                    bottom: `${((n.key - lo) / span) * 100}%`,
                                    height: 2,
                                    background: 'rgba(208,188,255,0.85)',
                                  }} />
                                ))}
                              </span>
                            );
                          })()}
                          <span className="relative text-[10px] font-semibold truncate" style={{ color: track.foreign ? '#D0BCFF' : clipColor }}>
                            {track.foreign ? track.name : pat?.name || clip.audio?.name || (clip.notes ? `${clip.notes.length} notes` : 'Clip')}
                          </span>
                          {!track.foreign && <span className="absolute right-0 top-0 bottom-0 w-[8px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.12)' }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
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
                        const at = Math.max(0, Math.floor(((e.clientX - rect.left - headerW + (e.currentTarget.parentElement?.parentElement?.scrollLeft || 0)) / pxPerBeat) / BEATS_PER_BAR) * BEATS_PER_BAR);
                        if (source) p.onMutate((d) => d.arrangement.push({ id: grooveUid(), kind: 'audio', name: asset.name || source.name, color: TRACK_COLORS[d.arrangement.length % TRACK_COLORS.length], mute: false, solo: false, gainDb: 0, pan: 0, clips: [{ id: grooveUid(), startBeats: at, lengthBeats: Math.max(1, source.durationSec / (60 / d.bpm)), audio: JSON.parse(JSON.stringify(source)) }] }));
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
                  onClick={() => p.onAddInstrument?.()}
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
          <span>Snap: <b className="text-white/60">1 bar</b> (trim: 1 beat)</span>
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
