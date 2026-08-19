// The album multitrack timeline — the Studio One Project-page arranger, at the bottom of the
// room and resizable. Scrollable + zoomable (pxPerSec), a two-lane layout so crossfades are
// visible, clips you drag to re-sequence, and IN/OUT trim handles that move independent of the
// audio file (startOffsetSec / playLengthSec — the file is never edited).
//
// The album clock is gap-based and sequential (albumLayout in masterProject.ts), so a body drag
// adjusts the gap/overlap with a neighbour rather than free-positioning — the timeline and the
// top strip can never disagree about where a track sits. Selecting a clip drives the rest of the
// Project view (the top strip zooms to the selected track). Interaction patterns copied from
// TimelineView (pxPerBeat zoom, overflow-auto + sticky, window-listener pointer drag).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';
import { albumLayout, setCrossfade, type MasterProjectDoc, type ProjectTrack, type LaidTrack } from '../../../../services/melos/beats/masterProject';
import { eraById } from '../../../../services/melos/beats/fx/mastering';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { PLAYHEAD, SELECT, ARMED } from '../theme';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface AlbumTimelineProps {
  project: MasterProjectDoc;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMutate: (fn: (p: MasterProjectDoc) => void) => void;
  auditionOrigin: number;          // album-time where the current audition started
  auditionId: string | null;
  albumEraColor: string;
  /** Peaks by content key (decoded lazily by the parent); undefined until ready. */
  getPeaks: (key: string) => Float32Array | undefined;
  ensurePeaks: (track: ProjectTrack) => void;
  height: number;
  onResize: (h: number) => void;
}

type Drag =
  | { kind: 'move'; id: string; startX: number; startGapPrev: number }
  | { kind: 'trimIn'; id: string; startX: number; startOffset: number; startLen: number; dur: number }
  | { kind: 'trimOut'; id: string; startX: number; startLen: number; dur: number; offset: number }
  | { kind: 'height'; startY: number; startH: number };

export const AlbumTimeline: React.FC<AlbumTimelineProps> = ({
  project, selectedId, onSelect, onMutate, auditionOrigin, auditionId, albumEraColor, getPeaks, ensurePeaks, height, onResize,
}) => {
  const [pxPerSec, setPxPerSec] = useState(24);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [, force] = useState(0);
  const layout = albumLayout(project);
  const totalSec = Math.max(8, layout.totalSec + 4);
  const contentW = totalSec * pxPerSec;
  const LANE_H = 56;
  const LANES = 2;

  // rAF playhead (drawn as an absolutely-positioned div, cheap).
  const [phX, setPhX] = useState(-1);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const e = BeatsEngine.get();
      if (e.auditionId()) setPhX((auditionOrigin + e.auditionPosSec()) * pxPerSec);
      else setPhX(-1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [auditionOrigin, pxPerSec]);

  // Ensure peaks for every track once.
  useEffect(() => { for (const t of project.tracks) ensurePeaks(t); }, [project.tracks, ensurePeaks]);

  const secAt = useCallback((clientX: number): number => {
    const el = scrollRef.current; if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return (clientX - rect.left + el.scrollLeft) / pxPerSec;
  }, [pxPerSec]);

  // ── window-listener drags (the TimelineView pattern) ──
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      if (d.kind === 'height') { onResize(Math.max(120, Math.min(560, d.startH + (d.startY - ev.clientY)))); return; }
      const dxSec = (ev.clientX - d.startX) / pxPerSec;
      if (d.kind === 'move') {
        // Drag body → change the gap between THIS track and the previous one (re-sequence in time).
        const idx = project.tracks.findIndex((t) => t.id === d.id);
        if (idx <= 0) return; // first track is pinned to t=0
        onMutate((p) => {
          const prev = p.tracks[idx - 1];
          if (!prev) return;
          const g = d.startGapPrev + dxSec;
          if (g < -0.05) setCrossfade(p, idx - 1, -g); // negative → crossfade
          else { prev.gapSec = Math.max(0, g); prev.fadeOutSec = 0; const cur = p.tracks[idx]; if (cur) cur.fadeInSec = 0; }
        });
      } else if (d.kind === 'trimIn') {
        // Move the IN point into the file — start later in the source, keep the tail.
        onMutate((p) => {
          const t = p.tracks.find((x) => x.id === d.id); if (!t) return;
          const newOffset = Math.max(0, Math.min(d.dur - 0.2, d.startOffset + dxSec));
          const delta = newOffset - d.startOffset;
          t.startOffsetSec = newOffset;
          t.playLengthSec = Math.max(0.2, (d.startLen) - delta);
        });
      } else if (d.kind === 'trimOut') {
        // Move the OUT point — shorten/extend the played length, file untouched.
        onMutate((p) => {
          const t = p.tracks.find((x) => x.id === d.id); if (!t) return;
          const maxLen = d.dur - d.offset;
          t.playLengthSec = Math.max(0.2, Math.min(maxLen, d.startLen + dxSec));
        });
      }
      force((n) => n + 1);
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [pxPerSec, project.tracks, onMutate, onResize]);

  const effDur = (t: ProjectTrack) => t.playLengthSec ?? (t.sample.durationSec - (t.startOffsetSec ?? 0));

  // Seconds/bar ruler ticks.
  const step = totalSec > 600 ? 60 : totalSec > 180 ? 30 : totalSec > 60 ? 15 : 5;
  const ticks: number[] = [];
  for (let s = 0; s <= totalSec; s += step) ticks.push(s);

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* Resize grip + zoom */}
      <div
        className="h-5 flex items-center justify-center cursor-ns-resize border-t border-white/10 bg-white/[0.03] flex-none touch-none"
        onPointerDown={(e) => { drag.current = { kind: 'height', startY: e.clientY, startH: height }; }}
      ><GripHorizontal size={14} className="text-white/25" /></div>
      <div className="flex items-center gap-3 px-3 h-8 border-b border-white/10 flex-none">
        <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">Album Timeline</span>
        <span className="font-mono text-[9px] text-white/30">{fmt(layout.totalSec)} · {project.tracks.length} tracks</span>
        <label className="flex items-center gap-1.5 ml-auto text-[9px] text-white/40 uppercase tracking-wide">
          Zoom
          <input type="range" min={8} max={120} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} className="w-24 accent-[#00DAF3]" />
        </label>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto relative">
        <div style={{ width: contentW, minWidth: '100%', height: LANE_H * LANES + 22 }} className="relative">
          {/* ruler */}
          <div className="sticky top-0 z-20 h-[22px] bg-[#0b0710] border-b border-white/10">
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full flex items-end pb-0.5" style={{ left: s * pxPerSec }}>
                <div className="w-px h-2 bg-white/20" />
                <span className="font-mono text-[8px] text-white/35 ml-1">{fmt(s)}</span>
              </div>
            ))}
          </div>
          {/* lane backgrounds */}
          {Array.from({ length: LANES }).map((_, l) => (
            <div key={l} className="absolute left-0 right-0 border-b border-white/[0.05]" style={{ top: 22 + l * LANE_H, height: LANE_H, background: l % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }} />
          ))}

          {/* clips */}
          {layout.tracks.map((laid: LaidTrack) => {
            const t = laid.track;
            const lane = laid.index % 2;
            const dur = effDur(t);
            const x0 = laid.startSec * pxPerSec;
            const w = Math.max(8, dur * pxPerSec);
            const top = 22 + lane * LANE_H + 4;
            const era = t.mastering ? eraById(t.mastering.eraId) : null;
            const color = era?.discColor || albumEraColor;
            const selected = selectedId === t.id;
            const playing = auditionId === t.id;
            const peaks = getPeaks(t.sample.key);
            return (
              <div
                key={t.id}
                className="absolute rounded-[8px] overflow-hidden border touch-none"
                style={{ left: x0, top, width: w, height: LANE_H - 8, borderColor: selected ? SELECT : `${color}66`, background: `${color}1a`, boxShadow: selected ? `0 0 0 1px ${SELECT}` : 'none', cursor: 'grab', zIndex: selected ? 10 : 5 }}
                onPointerDown={(e) => {
                  onSelect(t.id);
                  const idx = project.tracks.findIndex((x) => x.id === t.id);
                  drag.current = { kind: 'move', id: t.id, startX: e.clientX, startGapPrev: idx > 0 ? (project.tracks[idx - 1].gapSec ?? 0) : 0 };
                }}
              >
                {/* waveform */}
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(2, Math.floor(w))} 40`}>
                  {peaks && (() => {
                    const cols = Math.max(4, Math.floor(w / 2));
                    const bars = [];
                    for (let c = 0; c < cols; c++) {
                      const p = peaks[Math.floor((c / cols) * peaks.length)] || 0;
                      const h = Math.max(0.5, p * 18);
                      bars.push(<rect key={c} x={c * (w / cols)} y={20 - h} width={Math.max(0.6, w / cols - 0.4)} height={h * 2} fill={color} opacity={playing ? 0.9 : 0.6} />);
                    }
                    return bars;
                  })()}
                </svg>
                {/* title */}
                <div className="absolute top-0.5 left-1.5 text-[9px] font-bold text-white truncate max-w-[90%]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                  {laid.index + 1}. {t.title}
                </div>
                {(t.startOffsetSec ?? 0) > 0.05 && (
                  <div className="absolute bottom-0.5 left-1.5 font-mono text-[7.5px] text-[#00DAF3]">in {fmt(t.startOffsetSec!)}</div>
                )}
                {/* IN trim handle */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize hover:bg-white/20"
                  onPointerDown={(e) => { e.stopPropagation(); onSelect(t.id); drag.current = { kind: 'trimIn', id: t.id, startX: e.clientX, startOffset: t.startOffsetSec ?? 0, startLen: dur, dur: t.sample.durationSec }; }}
                  title="Drag the in-point (trims the file non-destructively)"
                />
                {/* OUT trim handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize hover:bg-white/20"
                  onPointerDown={(e) => { e.stopPropagation(); onSelect(t.id); drag.current = { kind: 'trimOut', id: t.id, startX: e.clientX, startLen: dur, dur: t.sample.durationSec, offset: t.startOffsetSec ?? 0 }; }}
                  title="Drag the out-point"
                />
                {/* crossfade badge */}
                {laid.overlapSec > 0 && (
                  <div className="absolute right-1 bottom-0.5 font-mono text-[7.5px]" style={{ color: '#ff5c93' }}>⤬{laid.overlapSec.toFixed(1)}</div>
                )}
              </div>
            );
          })}

          {/* markers */}
          {(project.markers ?? []).map((m) => (
            <div key={m.id} className="absolute top-0 bottom-0 z-15 pointer-events-none" style={{ left: m.timeSec * pxPerSec }}>
              <div className="w-px h-full" style={{ background: 'rgba(255,140,0,0.6)' }} />
              <div className="absolute top-[22px] left-0 font-mono text-[7.5px] px-1 rounded-br" style={{ background: ARMED, color: '#12080a' }}>{m.label}</div>
            </div>
          ))}

          {/* playhead */}
          {phX >= 0 && (
            <div className="absolute top-0 bottom-0 w-[1.5px] z-20 pointer-events-none" style={{ left: phX, background: PLAYHEAD, boxShadow: `0 0 8px ${PLAYHEAD}` }} />
          )}
        </div>
      </div>
    </div>
  );
};
