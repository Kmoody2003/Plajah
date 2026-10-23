// The album timeline — Studio One's Project page, at the bottom of the Mastering Desk and
// resizable. What it does that the proof sheet can't:
//
//   • A transport with a real clock: position, track-relative time, total, and the In→Out
//     length, in min:sec.ms or Red Book CD frames (75/s), click the clock to flip it.
//   • A cursor you place (click the ruler or a clip) and play from; the playhead rolls through
//     the album track to track (the parent owns playback — this only asks for it).
//   • In / Out locators (Studio One's L/R): drag on the ruler to set both, drag either flag,
//     or I / O at the cursor. Loop and "play In→Out" and every export range read them.
//   • Clips: drag the body to position it (the gap/crossfade with the previous track — the album
//     clock stays gap-based so the strip and the render can never disagree), drag the grip in the
//     title to re-order, drag the edges to trim in/out (file untouched), drag the corner squares
//     to shape the fades.
//   • A CD-index lane: each track's start marker (index 01) moves independent of the audio,
//     exactly like Studio One's track markers — pull it into a crossfade, past a count-in.
//   • Markers: drag, double-click to rename, × to delete; M drops one at the cursor.
//   • Snap: off / 0.1 s / CD frame / to edges & markers.
//
// Drags follow the TimelineView pattern: window listeners, mutate the doc in place. The
// playhead + clock are written straight to the DOM from rAF so playback never re-renders React.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GripHorizontal, GripVertical, Play, Square, SkipBack, SkipForward, ChevronsLeft, Repeat, MapPin, X, Maximize2, Flag,
} from 'lucide-react';
import {
  albumLayout, setCrossfade, moveTrack, trackIndexSec, effectiveDur,
  type MasterProjectDoc, type ProjectTrack, type LaidTrack,
} from '../../../../services/melos/beats/masterProject';
import { eraById } from '../../../../services/melos/beats/fx/mastering';
import { PLAYHEAD, SELECT, ARMED } from '../theme';

export type ClockMode = 'time' | 'cd';
export type SnapMode = 'off' | 'tenth' | 'frame' | 'edges';

const CD_FPS = 75;

/** The desk clock: m:ss.mmm, or Red Book mm:ss:ff. Hours appear only when they exist. */
export function fmtClock(sec: number, mode: ClockMode): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const head = h > 0 ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0');
  if (mode === 'cd') {
    const f = Math.floor((t - Math.floor(t)) * CD_FPS + 1e-6);
    return `${head}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }
  const ms = Math.floor((t - Math.floor(t)) * 1000 + 1e-6);
  return `${head}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

const fmtShort = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface AlbumTimelineProps {
  project: MasterProjectDoc;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMutate: (fn: (p: MasterProjectDoc) => void) => void;
  albumEraColor: string;
  /** Peaks by content key (decoded lazily by the parent); undefined until ready. */
  getPeaks: (key: string) => Float32Array | undefined;
  ensurePeaks: (track: ProjectTrack) => void;
  height: number;
  onResize: (h: number) => void;
  // ── transport (owned by the parent; the timeline only asks) ──
  cursorSec: number;
  onSeek: (sec: number) => void;
  /** Live album-clock position while playing, else null. Read every frame. */
  getPlayPos: () => number | null;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onPlayRange: () => void;
  rangeBusy?: boolean;
}

type Drag =
  | { kind: 'move'; id: string; startX: number; startGapPrev: number; startSec: number; moved: boolean }
  | { kind: 'reorder'; id: string; from: number; overIndex: number }
  | { kind: 'trimIn'; id: string; startX: number; startOffset: number; startLen: number; dur: number }
  | { kind: 'trimOut'; id: string; startX: number; startLen: number; dur: number; offset: number }
  | { kind: 'fadeIn' | 'fadeOut'; id: string; startX: number; start: number; dur: number }
  | { kind: 'index'; id: string; startX: number; start: number; dur: number }
  | { kind: 'marker'; id: string; startX: number; start: number }
  | { kind: 'range'; anchor: number; startX: number; moved: boolean }
  | { kind: 'inFlag' | 'outFlag'; startX: number; start: number }
  | { kind: 'height'; startY: number; startH: number };

const RULER_H = 22;
const INDEX_H = 16;
const MARK_H = 16;
const LANE_H = 58;
const LANES = 2;
const HEAD_H = RULER_H + INDEX_H + MARK_H;

export const AlbumTimeline: React.FC<AlbumTimelineProps> = ({
  project, selectedId, onSelect, onMutate, albumEraColor, getPeaks, ensurePeaks, height, onResize,
  cursorSec, onSeek, getPlayPos, playing, onPlay, onStop, onPlayRange, rangeBusy,
}) => {
  const [pxPerSec, setPxPerSec] = useState(24);
  const [clockMode, setClockMode] = useState<ClockMode>('time');
  const [snapMode, setSnapMode] = useState<SnapMode>('frame');
  const [editingMarker, setEditingMarker] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [, force] = useState(0);
  const layout = albumLayout(project);
  const totalSec = Math.max(8, layout.totalSec + 4);
  const contentW = totalSec * pxPerSec;
  const inSec = project.inSec;
  const outSec = project.outSec;
  const hasRange = inSec != null && outSec != null && outSec - inSec > 0.05;

  const projectRef = useRef(project); projectRef.current = project;
  const layoutRef = useRef(layout); layoutRef.current = layout;

  // ── snapping ──
  const snap = useCallback((t: number, exceptId?: string): number => {
    if (snapMode === 'off') return t;
    if (snapMode === 'tenth') return Math.round(t * 10) / 10;
    if (snapMode === 'frame') return Math.round(t * CD_FPS) / CD_FPS;
    // edges: clip heads/tails, markers, locators — within 8 px
    const tol = 8 / pxPerSec;
    let best = t, bestD = tol;
    const consider = (c: number | undefined) => { if (c == null) return; const d = Math.abs(c - t); if (d < bestD) { bestD = d; best = c; } };
    for (const l of layoutRef.current.tracks) { if (l.track.id === exceptId) continue; consider(l.startSec); consider(l.endSec); }
    for (const m of projectRef.current.markers ?? []) if (m.id !== exceptId) consider(m.timeSec);
    consider(projectRef.current.inSec); consider(projectRef.current.outSec); consider(0);
    return best;
  }, [snapMode, pxPerSec]);

  // ── live playhead + clock, written to the DOM ──
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const trackClockRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef(cursorSec); cursorRef.current = cursorSec;
  const clockModeRef = useRef(clockMode); clockModeRef.current = clockMode;
  const getPlayPosRef = useRef(getPlayPos); getPlayPosRef.current = getPlayPos;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const live = getPlayPosRef.current();
      const pos = live ?? cursorRef.current;
      const ph = playheadRef.current;
      if (ph) {
        ph.style.display = live == null ? 'none' : 'block';
        if (live != null) ph.style.transform = `translateX(${live * pxPerSec}px)`;
      }
      if (clockRef.current) clockRef.current.textContent = fmtClock(pos, clockModeRef.current);
      if (trackClockRef.current) {
        const laid = layoutRef.current.tracks.find((l) => pos >= l.startSec && pos < l.endSec)
          ?? layoutRef.current.tracks[layoutRef.current.tracks.length - 1];
        trackClockRef.current.textContent = laid
          ? `Track ${String(laid.index + 1).padStart(2, '0')} · ${fmtClock(Math.max(0, pos - laid.startSec), clockModeRef.current)} / ${fmtShort(laid.endSec - laid.startSec)}`
          : '—';
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pxPerSec]);

  // Keep the playhead in view while it rolls.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const el = scrollRef.current; const pos = getPlayPosRef.current();
      if (!el || pos == null) return;
      const x = pos * pxPerSec;
      if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, pxPerSec]);

  // Ensure peaks for every track once.
  useEffect(() => { for (const t of project.tracks) ensurePeaks(t); }, [project.tracks, ensurePeaks]);

  const secAt = useCallback((clientX: number): number => {
    const el = scrollRef.current; if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft) / pxPerSec);
  }, [pxPerSec]);

  // ── window-listener drags ──
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      if (d.kind === 'height') { onResize(Math.max(150, Math.min(620, d.startH + (d.startY - ev.clientY)))); return; }
      if (d.kind === 'reorder') {
        // The slot the pointer is over: before the first track whose midpoint is past it.
        const t = secAt(ev.clientX);
        const laid = layoutRef.current.tracks;
        let over = laid.length;
        for (let i = 0; i < laid.length; i++) { if (t < (laid[i].startSec + laid[i].endSec) / 2) { over = i; break; } }
        if (over !== d.overIndex) { d.overIndex = over; force((n) => n + 1); }
        return;
      }
      const dxSec = (ev.clientX - ('startX' in d ? d.startX : 0)) / pxPerSec;
      if (d.kind === 'move') {
        if (!d.moved && Math.abs(ev.clientX - d.startX) < 4) return;
        d.moved = true;
        const idx = projectRef.current.tracks.findIndex((t) => t.id === d.id);
        if (idx <= 0) return; // the first track is pinned to the head of the album
        const target = snap(d.startSec + dxSec, d.id);
        onMutate((p) => {
          const prev = p.tracks[idx - 1];
          if (!prev) return;
          const g = d.startGapPrev + (target - d.startSec);
          if (g < -0.05) setCrossfade(p, idx - 1, -g); // negative → crossfade
          else { prev.gapSec = Math.max(0, g); prev.fadeOutSec = 0; const cur = p.tracks[idx]; if (cur) cur.fadeInSec = 0; }
        });
      } else if (d.kind === 'trimIn') {
        onMutate((p) => {
          const t = p.tracks.find((x) => x.id === d.id); if (!t) return;
          const newOffset = Math.max(0, Math.min(d.dur - 0.2, d.startOffset + dxSec));
          const delta = newOffset - d.startOffset;
          t.startOffsetSec = newOffset;
          t.playLengthSec = Math.max(0.2, d.startLen - delta);
        });
      } else if (d.kind === 'trimOut') {
        onMutate((p) => {
          const t = p.tracks.find((x) => x.id === d.id); if (!t) return;
          t.playLengthSec = Math.max(0.2, Math.min(d.dur - d.offset, d.startLen + dxSec));
        });
      } else if (d.kind === 'fadeIn' || d.kind === 'fadeOut') {
        onMutate((p) => {
          const t = p.tracks.find((x) => x.id === d.id); if (!t) return;
          const v = Math.max(0, Math.min(d.dur / 2, d.start + (d.kind === 'fadeIn' ? dxSec : -dxSec)));
          if (d.kind === 'fadeIn') t.fadeInSec = v; else t.fadeOutSec = v;
        });
      } else if (d.kind === 'index') {
        onMutate((p) => {
          const t = p.tracks.find((x) => x.id === d.id); if (!t) return;
          const laid = layoutRef.current.tracks.find((l) => l.track.id === d.id);
          const head = laid?.startSec ?? 0;
          const abs = snap(head + d.start + dxSec, d.id);
          t.indexOffsetSec = Math.max(-Math.min(20, head), Math.min(d.dur - 4, abs - head));
        });
      } else if (d.kind === 'marker') {
        onMutate((p) => {
          const m = p.markers?.find((x) => x.id === d.id); if (!m) return;
          m.timeSec = Math.max(0, snap(d.start + dxSec, d.id));
        });
      } else if (d.kind === 'range') {
        if (!d.moved && Math.abs(ev.clientX - d.startX) < 4) return;
        d.moved = true;
        const t = snap(secAt(ev.clientX));
        onMutate((p) => { p.inSec = Math.min(d.anchor, t); p.outSec = Math.max(d.anchor, t); });
      } else if (d.kind === 'inFlag' || d.kind === 'outFlag') {
        const t = Math.max(0, snap(d.start + dxSec));
        onMutate((p) => {
          if (d.kind === 'inFlag') p.inSec = Math.min(t, (p.outSec ?? Infinity) - 0.1);
          else p.outSec = Math.max(t, (p.inSec ?? 0) + 0.1);
        });
      }
      force((n) => n + 1);
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.kind === 'reorder') {
        // overIndex is a slot in the ORIGINAL order; removing the dragged track shifts later slots.
        const to = d.overIndex > d.from ? d.overIndex - 1 : d.overIndex;
        if (to !== d.from) onMutate((p) => moveTrack(p, d.from, to));
        force((n) => n + 1);
      } else if (d.kind === 'range' && !d.moved) {
        onSeek(snap(secAt(ev.clientX)));
      } else if (d.kind === 'move' && !d.moved) {
        onSeek(snap(secAt(ev.clientX)));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [pxPerSec, onMutate, onResize, onSeek, secAt, snap]);

  // ── transport helpers ──
  const prevTrack = useCallback(() => {
    const pos = getPlayPos() ?? cursorSec;
    const heads = layout.tracks.map(trackIndexSec);
    // Like a CD player: back to this track's head, or the previous one if already near it.
    const cur = [...heads].reverse().find((h) => h <= pos - 1.5);
    onSeek(cur ?? 0);
  }, [layout.tracks, cursorSec, getPlayPos, onSeek]);

  const nextTrack = useCallback(() => {
    const pos = getPlayPos() ?? cursorSec;
    const next = layout.tracks.map(trackIndexSec).find((h) => h > pos + 0.05);
    if (next != null) onSeek(next);
  }, [layout.tracks, cursorSec, getPlayPos, onSeek]);

  const addMarkerAt = useCallback((t: number) => {
    onMutate((p) => {
      const next = [...(p.markers ?? []), { id: Math.random().toString(36).slice(2, 10), timeSec: t, label: `Mark ${(p.markers?.length ?? 0) + 1}`, kind: 'note' as const }];
      p.markers = next.sort((a, b) => a.timeSec - b.timeSec);
    });
  }, [onMutate]);

  const zoomFit = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    setPxPerSec(Math.max(2, Math.min(240, (el.clientWidth - 24) / Math.max(10, layout.totalSec + 2))));
  }, [layout.totalSec]);

  // Keyboard — only while the timeline has focus, so the lyric tap-sync keeps its space bar.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
    const pos = getPlayPos() ?? cursorSec;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); if (playing) onStop(); else onPlay(); }
    else if (k === 'i') onMutate((p) => { p.inSec = pos; if (p.outSec != null && p.outSec <= pos) p.outSec = undefined; });
    else if (k === 'o') onMutate((p) => { p.outSec = pos; if (p.inSec != null && p.inSec >= pos) p.inSec = undefined; });
    else if (k === 'm') addMarkerAt(pos);
    else if (k === 'l') onMutate((p) => { p.loopOn = !p.loopOn; });
    else if (k === 'home') onSeek(0);
    else if (k === 'end') onSeek(layout.totalSec);
    else if (k === 'arrowleft') { e.preventDefault(); prevTrack(); }
    else if (k === 'arrowright') { e.preventDefault(); nextTrack(); }
    else if (k === '=' || k === '+') setPxPerSec((v) => Math.min(240, v * 1.25));
    else if (k === '-') setPxPerSec((v) => Math.max(2, v / 1.25));
    else return;
    force((n) => n + 1);
  }, [getPlayPos, cursorSec, playing, onPlay, onStop, onMutate, addMarkerAt, onSeek, layout.totalSec, prevTrack, nextTrack]);

  // Ruler ticks — a label every major step, minor ticks between.
  const { major, minor } = useMemo(() => {
    const target = 90 / pxPerSec; // ~90 px between labels
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const mj = steps.find((s) => s >= target) ?? 600;
    const mn = mj >= 60 ? mj / 4 : mj >= 10 ? mj / 5 : mj / 2;
    return { major: mj, minor: mn };
  }, [pxPerSec]);
  const ticks: { s: number; major: boolean }[] = [];
  for (let s = 0; s <= totalSec; s += minor) ticks.push({ s, major: Math.abs(s / major - Math.round(s / major)) < 1e-6 });

  const reorderDrag = drag.current?.kind === 'reorder' ? drag.current : null;
  const reorderX = reorderDrag
    ? (reorderDrag.overIndex >= layout.tracks.length ? layout.totalSec : layout.tracks[reorderDrag.overIndex].startSec) * pxPerSec
    : null;

  const btn = 'w-7 h-7 grid place-items-center rounded-lg border border-white/12 text-white/60 hover:text-white hover:bg-white/10 transition-colors';
  const rangeLen = hasRange ? outSec! - inSec! : 0;

  return (
    <div className="flex flex-col bg-[#0A0A0D] outline-none" style={{ height }} tabIndex={0} onKeyDown={onKeyDown} aria-label="Album timeline">
      {/* Resize grip */}
      <div
        className="h-4 flex items-center justify-center cursor-ns-resize border-t border-white/10 bg-white/[0.03] flex-none touch-none"
        onPointerDown={(e) => { drag.current = { kind: 'height', startY: e.clientY, startH: height }; }}
        title="Drag to resize the timeline"
      ><GripHorizontal size={13} className="text-white/25" /></div>

      {/* ── Transport + clock ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 flex-none flex-wrap">
        <div className="flex items-center gap-1">
          <button className={btn} onClick={() => onSeek(inSec ?? 0)} title="Return to start / In (Home)" aria-label="Return to start"><ChevronsLeft size={13} /></button>
          <button className={btn} onClick={prevTrack} title="Previous track (←)" aria-label="Previous track"><SkipBack size={12} /></button>
          <button
            className="w-9 h-7 grid place-items-center rounded-lg border transition-colors"
            style={playing ? { color: '#061014', background: PLAYHEAD, borderColor: 'transparent' } : { color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}
            onClick={() => (playing ? onStop() : onPlay())}
            title={playing ? 'Stop (Space)' : 'Play from the cursor (Space)'}
            aria-label={playing ? 'Stop' : 'Play'}
          >{playing ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button>
          <button className={btn} onClick={nextTrack} title="Next track (→)" aria-label="Next track"><SkipForward size={12} /></button>
          <button
            className={btn}
            onClick={() => onMutate((p) => { p.loopOn = !p.loopOn; })}
            style={project.loopOn ? { color: '#00DAF3', borderColor: 'rgba(0,218,243,0.5)', background: 'rgba(0,218,243,0.1)' } : undefined}
            title="Loop between In and Out (L)"
            aria-pressed={!!project.loopOn}
            aria-label="Loop"
          ><Repeat size={12} /></button>
        </div>

        {/* The clock */}
        <button
          onClick={() => setClockMode((m) => (m === 'time' ? 'cd' : 'time'))}
          className="flex flex-col items-start px-3 py-0.5 rounded-lg bg-black/50 border border-white/10 min-w-[150px] text-left"
          title="Click to switch between min:sec.ms and CD frames (mm:ss:ff)"
        >
          <span ref={clockRef} className="font-mono text-[17px] leading-tight text-[#00DAF3] tabular-nums">{fmtClock(cursorSec, clockMode)}</span>
          <span className="text-[7.5px] font-extrabold uppercase tracking-[0.16em] text-white/30">{clockMode === 'cd' ? 'position · CD frames' : 'position'}</span>
        </button>
        <div className="flex flex-col leading-tight">
          <span ref={trackClockRef} className="font-mono text-[10px] text-white/60 tabular-nums">—</span>
          <span className="font-mono text-[9px] text-white/30 tabular-nums">Total {fmtClock(layout.totalSec, clockMode)} · {project.tracks.length} tracks</span>
        </div>

        {/* Locators */}
        <div className="flex items-center gap-1.5 ml-1">
          <button
            onClick={() => onMutate((p) => { p.inSec = getPlayPos() ?? cursorSec; })}
            className="h-7 px-2 rounded-lg border border-white/12 text-[10px] font-mono text-white/70 hover:bg-white/10"
            title="Set In at the cursor (I)"
          >IN {inSec != null ? fmtClock(inSec, clockMode) : '—'}</button>
          <button
            onClick={() => onMutate((p) => { p.outSec = getPlayPos() ?? cursorSec; })}
            className="h-7 px-2 rounded-lg border border-white/12 text-[10px] font-mono text-white/70 hover:bg-white/10"
            title="Set Out at the cursor (O)"
          >OUT {outSec != null ? fmtClock(outSec, clockMode) : '—'}</button>
          {hasRange && (
            <>
              <span className="font-mono text-[9.5px] text-[#00DAF3]">Δ {fmtClock(rangeLen, clockMode)}</span>
              <button
                onClick={onPlayRange}
                disabled={rangeBusy}
                className="h-7 px-2 rounded-lg border border-[#00DAF3]/40 text-[#00DAF3] text-[10px] font-bold hover:bg-[#00DAF3]/10 disabled:opacity-40 flex items-center gap-1"
                title="Render In→Out (crossfades included) and play it"
              ><Play size={9} fill="currentColor" />{rangeBusy ? 'Rendering…' : 'In→Out'}</button>
              <button
                onClick={() => onMutate((p) => { p.inSec = undefined; p.outSec = undefined; p.loopOn = false; })}
                className="w-6 h-6 grid place-items-center rounded-md text-white/35 hover:text-white"
                title="Clear locators"
                aria-label="Clear In and Out"
              ><X size={11} /></button>
            </>
          )}
          <button
            onClick={() => addMarkerAt(getPlayPos() ?? cursorSec)}
            className="h-7 px-2 rounded-lg border border-[#FF8C00]/35 text-[#FF8C00] text-[10px] font-bold hover:bg-[#FF8C00]/10 flex items-center gap-1"
            title="Drop a marker at the cursor (M)"
          ><MapPin size={10} /> Marker</button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1 text-[9px] text-white/40 uppercase tracking-wide">
            Snap
            <select
              value={snapMode}
              onChange={(e) => setSnapMode(e.target.value as SnapMode)}
              className="h-6 rounded-md bg-black/40 border border-white/10 text-[10px] text-white/75 px-1 outline-none normal-case"
            >
              <option value="off">Off</option>
              <option value="tenth">0.1 s</option>
              <option value="frame">CD frame</option>
              <option value="edges">Edges & markers</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[9px] text-white/40 uppercase tracking-wide">
            Zoom
            <input type="range" min={2} max={240} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} className="w-24 accent-[#00DAF3]" />
          </label>
          <button className={btn} onClick={zoomFit} title="Zoom to fit the album" aria-label="Zoom to fit"><Maximize2 size={11} /></button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto relative">
        <div style={{ width: contentW, minWidth: '100%', height: HEAD_H + LANE_H * LANES + 6 }} className="relative select-none">
          {/* In→Out range shading across everything */}
          {hasRange && (
            <div className="absolute top-0 bottom-0 pointer-events-none z-[1]" style={{ left: inSec! * pxPerSec, width: rangeLen * pxPerSec, background: project.loopOn ? 'rgba(0,218,243,0.10)' : 'rgba(255,255,255,0.045)' }} />
          )}

          {/* ruler — click to seek, drag to set In/Out */}
          <div
            className="sticky top-0 z-30 bg-[#0b0710] border-b border-white/10 cursor-pointer touch-none"
            style={{ height: RULER_H }}
            onPointerDown={(e) => { const t = snap(secAt(e.clientX)); drag.current = { kind: 'range', anchor: t, startX: e.clientX, moved: false }; }}
            title="Click to place the cursor · drag to set In and Out"
          >
            {ticks.map(({ s, major: isMajor }) => (
              <div key={s} className="absolute top-0 h-full flex items-end pb-0.5 pointer-events-none" style={{ left: s * pxPerSec }}>
                <div className={isMajor ? 'w-px h-2.5 bg-white/30' : 'w-px h-1.5 bg-white/12'} />
                {isMajor && <span className="font-mono text-[8px] text-white/40 ml-1">{fmtShort(s)}</span>}
              </div>
            ))}
            {/* In / Out flags */}
            {inSec != null && (
              <div
                className="absolute top-0 h-full cursor-ew-resize z-10"
                style={{ left: inSec * pxPerSec - 6, width: 12 }}
                onPointerDown={(e) => { e.stopPropagation(); drag.current = { kind: 'inFlag', startX: e.clientX, start: inSec }; }}
                title={`In ${fmtClock(inSec, clockMode)} — drag to move`}
              >
                <div className="absolute left-[6px] top-0 w-0 h-0" style={{ borderTop: '9px solid #00DAF3', borderRight: '9px solid transparent' }} />
                <div className="absolute left-[6px] top-0 bottom-0 w-px bg-[#00DAF3]" />
              </div>
            )}
            {outSec != null && (
              <div
                className="absolute top-0 h-full cursor-ew-resize z-10"
                style={{ left: outSec * pxPerSec - 6, width: 12 }}
                onPointerDown={(e) => { e.stopPropagation(); drag.current = { kind: 'outFlag', startX: e.clientX, start: outSec }; }}
                title={`Out ${fmtClock(outSec, clockMode)} — drag to move`}
              >
                <div className="absolute right-[5px] top-0 w-0 h-0" style={{ borderTop: '9px solid #00DAF3', borderLeft: '9px solid transparent' }} />
                <div className="absolute left-[6px] top-0 bottom-0 w-px bg-[#00DAF3]" />
              </div>
            )}
          </div>

          {/* CD index lane — each track's movable start marker */}
          <div className="absolute left-0 right-0 border-b border-white/[0.06] bg-white/[0.015]" style={{ top: RULER_H, height: INDEX_H }}>
            {layout.tracks.map((laid) => {
              const x = trackIndexSec(laid) * pxPerSec;
              const moved = Math.abs(laid.track.indexOffsetSec ?? 0) > 0.005;
              return (
                <div
                  key={laid.track.id}
                  className="absolute top-0 h-full flex items-center cursor-ew-resize z-10 touch-none"
                  style={{ left: x - 1 }}
                  onPointerDown={(e) => { e.stopPropagation(); onSelect(laid.track.id); drag.current = { kind: 'index', id: laid.track.id, startX: e.clientX, start: laid.track.indexOffsetSec ?? 0, dur: effectiveDur(laid.track) }; }}
                  onDoubleClick={() => onMutate((p) => { const t = p.tracks.find((x2) => x2.id === laid.track.id); if (t) t.indexOffsetSec = undefined; })}
                  title={`Track ${laid.index + 1} start (CD index 01) — drag to move independent of the audio, double-click to reset`}
                >
                  <Flag size={10} style={{ color: moved ? '#FFD166' : 'rgba(255,255,255,0.55)' }} />
                  <span className="font-mono text-[8px] ml-0.5" style={{ color: moved ? '#FFD166' : 'rgba(255,255,255,0.5)' }}>{String(laid.index + 1).padStart(2, '0')}</span>
                </div>
              );
            })}
          </div>

          {/* marker lane */}
          <div
            className="absolute left-0 right-0 border-b border-white/[0.06]"
            style={{ top: RULER_H + INDEX_H, height: MARK_H }}
            onDoubleClick={(e) => addMarkerAt(snap(secAt(e.clientX)))}
            title="Double-click to add a marker"
          >
            {(project.markers ?? []).map((m) => (
              <div
                key={m.id}
                className="absolute top-0 h-full flex items-center gap-0.5 pl-0.5 pr-1 rounded-r cursor-ew-resize z-10 touch-none group"
                style={{ left: m.timeSec * pxPerSec, background: m.kind === 'side' ? '#D0BCFF' : m.kind === 'index' ? '#FFD166' : ARMED, color: '#12080a' }}
                onPointerDown={(e) => { e.stopPropagation(); if (editingMarker !== m.id) drag.current = { kind: 'marker', id: m.id, startX: e.clientX, start: m.timeSec }; }}
                onDoubleClick={(e) => { e.stopPropagation(); setEditingMarker(m.id); }}
                title={`${m.label} · ${fmtClock(m.timeSec, clockMode)} — drag to move, double-click to rename`}
              >
                {editingMarker === m.id ? (
                  <input
                    autoFocus
                    defaultValue={m.label}
                    onBlur={(e) => { const v = e.target.value; onMutate((p) => { const x = p.markers?.find((k) => k.id === m.id); if (x) x.label = v || x.label; }); setEditingMarker(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }}
                    className="w-20 h-3.5 bg-white/80 text-[8px] font-mono text-black outline-none px-0.5"
                  />
                ) : (
                  <span className="font-mono text-[8px] whitespace-nowrap">{m.label}</span>
                )}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onMutate((p) => { p.markers = (p.markers ?? []).filter((k) => k.id !== m.id); })}
                  className="opacity-0 group-hover:opacity-100 w-3 h-3 grid place-items-center"
                  aria-label={`Remove marker ${m.label}`}
                ><X size={8} /></button>
              </div>
            ))}
          </div>

          {/* lane backgrounds (click empty space to place the cursor) */}
          {Array.from({ length: LANES }).map((_, l) => (
            <div
              key={l}
              className="absolute left-0 right-0 border-b border-white/[0.05]"
              style={{ top: HEAD_H + l * LANE_H, height: LANE_H, background: l % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }}
              onPointerDown={(e) => onSeek(snap(secAt(e.clientX)))}
            />
          ))}

          {/* clips */}
          {layout.tracks.map((laid: LaidTrack) => {
            const t = laid.track;
            const lane = laid.index % 2;
            const dur = effectiveDur(t);
            const x0 = laid.startSec * pxPerSec;
            const w = Math.max(10, dur * pxPerSec);
            const top = HEAD_H + lane * LANE_H + 4;
            const h = LANE_H - 8;
            const era = t.mastering ? eraById(t.mastering.eraId) : null;
            const color = era?.discColor || albumEraColor;
            const selected = selectedId === t.id;
            const peaks = getPeaks(t.sample.key);
            const fin = Math.min(t.fadeInSec ?? 0, dur / 2) * pxPerSec;
            const fout = Math.min(t.fadeOutSec ?? 0, dur / 2) * pxPerSec;
            const dragging = reorderDrag?.id === t.id;
            return (
              <div
                key={t.id}
                className="absolute rounded-[8px] overflow-hidden border touch-none"
                style={{
                  left: x0, top, width: w, height: h,
                  borderColor: selected ? SELECT : `${color}66`, background: `${color}1a`,
                  boxShadow: selected ? `0 0 0 1px ${SELECT}` : 'none', cursor: 'grab', zIndex: selected ? 10 : 5,
                  opacity: dragging ? 0.45 : 1,
                }}
                onPointerDown={(e) => {
                  onSelect(t.id);
                  const idx = project.tracks.findIndex((x) => x.id === t.id);
                  drag.current = { kind: 'move', id: t.id, startX: e.clientX, startGapPrev: idx > 0 ? (project.tracks[idx - 1].gapSec ?? 0) : 0, startSec: laid.startSec, moved: false };
                }}
                onDoubleClick={(e) => { onSeek(secAt(e.clientX)); onPlay(); }}
                title={`${laid.index + 1}. ${t.title} — drag to position, grip to re-order, edges to trim, corners for fades, double-click to play from here`}
              >
                {/* waveform */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(2, Math.floor(w))} 40`}>
                  {peaks && (() => {
                    const cols = Math.max(4, Math.floor(w / 2));
                    const bars = [];
                    for (let c = 0; c < cols; c++) {
                      const p = peaks[Math.floor((c / cols) * peaks.length)] || 0;
                      const hh = Math.max(0.5, p * 16);
                      bars.push(<rect key={c} x={c * (w / cols)} y={22 - hh} width={Math.max(0.6, w / cols - 0.4)} height={hh * 2} fill={color} opacity={0.65} />);
                    }
                    return bars;
                  })()}
                </svg>
                {/* fade envelopes */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(2, w)} ${h}`}>
                  {fin > 0.5 && <path d={`M0 ${h} L${fin} 12 L0 12 Z`} fill="rgba(0,0,0,0.35)" />}
                  {fin > 0.5 && <line x1={0} y1={h} x2={fin} y2={12} stroke="rgba(255,255,255,0.7)" strokeWidth={1} />}
                  {fout > 0.5 && <path d={`M${w} ${h} L${w - fout} 12 L${w} 12 Z`} fill="rgba(0,0,0,0.35)" />}
                  {fout > 0.5 && <line x1={w - fout} y1={12} x2={w} y2={h} stroke="rgba(255,255,255,0.7)" strokeWidth={1} />}
                </svg>
                {/* title bar with re-order grip */}
                <div className="absolute top-0 left-0 right-0 h-3.5 flex items-center gap-0.5 bg-black/35 pl-0.5 pr-1">
                  <span
                    className="cursor-move text-white/50 hover:text-white flex-none"
                    onPointerDown={(e) => {
                      e.stopPropagation(); onSelect(t.id);
                      drag.current = { kind: 'reorder', id: t.id, from: laid.index, overIndex: laid.index };
                      force((n) => n + 1);
                    }}
                    title="Drag to re-order the running order"
                  ><GripVertical size={10} /></span>
                  <span className="text-[8.5px] font-bold text-white truncate">{laid.index + 1}. {t.title}</span>
                </div>
                {(t.startOffsetSec ?? 0) > 0.05 && (
                  <div className="absolute bottom-0.5 left-2 font-mono text-[7.5px] text-[#00DAF3] pointer-events-none">in {fmtShort(t.startOffsetSec!)}</div>
                )}
                {/* IN / OUT trim edges */}
                <div
                  className="absolute left-0 top-3.5 bottom-0 w-1.5 cursor-w-resize hover:bg-white/25"
                  onPointerDown={(e) => { e.stopPropagation(); onSelect(t.id); drag.current = { kind: 'trimIn', id: t.id, startX: e.clientX, startOffset: t.startOffsetSec ?? 0, startLen: dur, dur: t.sample.durationSec }; }}
                  title="Drag the in-point (trims the file non-destructively)"
                />
                <div
                  className="absolute right-0 top-3.5 bottom-0 w-1.5 cursor-e-resize hover:bg-white/25"
                  onPointerDown={(e) => { e.stopPropagation(); onSelect(t.id); drag.current = { kind: 'trimOut', id: t.id, startX: e.clientX, startLen: dur, dur: t.sample.durationSec, offset: t.startOffsetSec ?? 0 }; }}
                  title="Drag the out-point"
                />
                {/* fade handles */}
                <div
                  className="absolute top-3.5 w-2 h-2 bg-white/80 border border-black/40 cursor-ew-resize"
                  style={{ left: Math.max(2, fin - 4) }}
                  onPointerDown={(e) => { e.stopPropagation(); onSelect(t.id); drag.current = { kind: 'fadeIn', id: t.id, startX: e.clientX, start: t.fadeInSec ?? 0, dur }; }}
                  title={`Fade in ${(t.fadeInSec ?? 0).toFixed(2)} s — drag`}
                />
                <div
                  className="absolute top-3.5 w-2 h-2 bg-white/80 border border-black/40 cursor-ew-resize"
                  style={{ left: Math.min(w - 10, w - fout - 4) }}
                  onPointerDown={(e) => { e.stopPropagation(); onSelect(t.id); drag.current = { kind: 'fadeOut', id: t.id, startX: e.clientX, start: t.fadeOutSec ?? 0, dur }; }}
                  title={`Fade out ${(t.fadeOutSec ?? 0).toFixed(2)} s — drag`}
                />
                {laid.overlapSec > 0 && (
                  <div className="absolute right-2 bottom-0.5 font-mono text-[7.5px] pointer-events-none" style={{ color: '#ff5c93' }}>⤬{laid.overlapSec.toFixed(1)}</div>
                )}
              </div>
            );
          })}

          {/* re-order drop indicator */}
          {reorderX != null && (
            <div className="absolute z-30 w-[3px] rounded pointer-events-none" style={{ left: reorderX - 1, top: HEAD_H, height: LANE_H * LANES, background: SELECT, boxShadow: `0 0 10px ${SELECT}` }} />
          )}

          {/* marker lines through the lanes */}
          {(project.markers ?? []).map((m) => (
            <div key={`l${m.id}`} className="absolute z-[6] pointer-events-none w-px" style={{ left: m.timeSec * pxPerSec, top: RULER_H + INDEX_H, bottom: 0, background: 'rgba(255,140,0,0.45)' }} />
          ))}

          {/* the cursor (where Play starts) */}
          <div className="absolute top-0 bottom-0 w-px z-[25] pointer-events-none" style={{ left: cursorSec * pxPerSec, background: 'rgba(255,255,255,0.75)' }}>
            <div className="absolute -left-[4px] top-0 w-0 h-0" style={{ borderLeft: '4.5px solid transparent', borderRight: '4.5px solid transparent', borderTop: '6px solid #fff' }} />
          </div>

          {/* the playhead — positioned from rAF */}
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 left-0 w-[1.5px] z-[26] pointer-events-none"
            style={{ display: 'none', background: PLAYHEAD, boxShadow: `0 0 8px ${PLAYHEAD}` }}
          />
        </div>
      </div>
    </div>
  );
};
