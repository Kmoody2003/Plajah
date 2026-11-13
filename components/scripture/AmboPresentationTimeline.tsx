// AmboPresentationTimeline — the timeline strip above every Stage presentation.
//
//   • Every slide is a clip; its width is its time on screen.
//   • Default seconds-per-slide (8s) is set once for the presentation; any clip
//     can override it by typing a value or dragging its right edge out like a
//     clip in Fabula (snaps to 0.5s and to neighbouring edges; Alt = no snap).
//     Double-click a trimmed clip's edge to send it back to the default.
//   • Drag clips to reorder. Drop anything from the Library, Media bin or desktop
//     onto the strip to bring it into the presentation at that point.
//   • Play runs the presentation as a timed slideshow on Program; the playhead
//     follows. Send to Fabula hands the presentation over as an edit timeline.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Repeat, Clapperboard, Timer, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { Show, Slide } from '../../services/ambo/showModel';
import {
  layoutTimeline, defaultSlideSec, clampSlideSec, insertIndexAtTime, formatTimecode,
  type TimelineLayout,
} from '../../services/ambo/presentationTimeline';
import { trimClipEnd } from '../../services/fabula/clipEditStack';

const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';

export interface AmboPresentationTimelineProps {
  show: Show;
  slides: Slide[];
  selected: number;
  liveSlideId: string | null;
  /** Seconds into the timeline while the slideshow plays; null when stopped. */
  playheadSec: number | null;
  loop: boolean;
  onToggleLoop: () => void;
  onPlay: (fromIndex: number) => void;
  onStop: () => void;
  onSelect: (index: number) => void;
  onTake: (index: number) => void;
  onSetDefaultSec: (sec: number) => void;
  /** `undefined` clears the override (slide goes back to the default). */
  onSetSlideSec: (slideId: string, sec: number | undefined) => void;
  onReorder: (from: number, insertBefore: number) => void;
  /** A drop from the library / desktop at `insertIndex`. */
  onDropAt: (e: React.DragEvent, insertIndex: number) => void;
  onSendToFabula: () => void;
  thumbFor?: (slide: Slide) => string | undefined;
}

const PX_PER_SEC_DEFAULT = 14;
const CLIP_DRAG_MIME = 'application/x-ambo-timeline-clip';

const AmboPresentationTimeline: React.FC<AmboPresentationTimelineProps> = ({
  show, slides, selected, liveSlideId, playheadSec, loop, onToggleLoop, onPlay, onStop,
  onSelect, onTake, onSetDefaultSec, onSetSlideSec, onReorder, onDropAt, onSendToFabula, thumbFor,
}) => {
  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC_DEFAULT);
  // Live preview of a trim in progress, so the strip moves under the cursor without committing per pixel.
  const [trim, setTrim] = useState<{ slideId: string; dur: number } | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [defaultDraft, setDefaultDraft] = useState<string>(String(defaultSlideSec(show)));
  const draggingClip = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDefaultDraft(String(defaultSlideSec(show))); }, [show.id, show.timeline?.defaultSlideSec]);

  const layout: TimelineLayout = useMemo(() => {
    const base = layoutTimeline(slides, show);
    if (!trim) return base;
    let t = 0;
    const clips = base.clips.map(c => {
      const dur = c.slideId === trim.slideId ? trim.dur : c.dur;
      const out = { ...c, start: t, dur, custom: c.custom || c.slideId === trim.slideId };
      t += dur;
      return out;
    });
    return { clips, total: t };
  }, [slides, show, trim]);

  const isPlaying = playheadSec != null;
  const liveIdx = slides.findIndex(s => s.id === liveSlideId);
  const widthPx = Math.max(layout.total * pxPerSec + 120, 320);

  const timeAtClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft) / pxPerSec);
  };

  // Keep the playhead in view while the slideshow runs.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || playheadSec == null) return;
    const x = playheadSec * pxPerSec;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
  }, [playheadSec, pxPerSec]);

  const startTrim = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const clip = layout.clips[index];
    if (!clip) return;
    const slideId = clip.slideId;
    const startX = e.clientX;
    // The strip ripples (always gapless), so neighbours move with the trim — snap to the
    // presentation's default length instead, the natural "back to normal" point.
    const edges = [defaultSlideSec(show)];
    let last = clip.dur;
    const move = (ev: PointerEvent) => {
      last = trimClipEnd({ start: 0, duration: clip.dur }, (ev.clientX - startX) / pxPerSec, {
        minDuration: 0.5,
        snap: ev.altKey ? 0 : 0.5,
        snapTargets: ev.altKey ? [] : edges,
        snapTolerance: 6 / pxPerSec,
      }).duration;
      setTrim({ slideId, dur: last });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTrim(null);
      if (Math.abs(last - clip.dur) >= 0.05) onSetSlideSec(slideId, clampSlideSec(last));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const commitDefault = () => {
    const v = parseFloat(defaultDraft);
    if (Number.isFinite(v) && v > 0) onSetDefaultSec(clampSlideSec(v));
    else setDefaultDraft(String(defaultSlideSec(show)));
  };

  const ticks = useMemo(() => {
    const step = pxPerSec >= 40 ? 1 : pxPerSec >= 14 ? 5 : pxPerSec >= 6 ? 10 : 30;
    const out: number[] = [];
    for (let t = 0; t <= layout.total + step; t += step) out.push(t);
    return { step, out };
  }, [pxPerSec, layout.total]);

  const sel = slides[selected];
  const selDur = sel ? (layout.clips[selected]?.dur ?? defaultSlideSec(show)) : null;

  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-black/40 flex-none" data-testid="ambo-presentation-timeline">
      {/* Header: transport, default duration, selected clip duration, zoom, Fabula */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.07] text-[11px] text-white/70 flex-wrap">
        {isPlaying ? (
          <button type="button" onClick={onStop} className="flex items-center gap-1 px-2 h-7 rounded-md font-semibold text-black" style={{ background: ORANGE }} title="Stop the timed slideshow">
            <Square size={12} fill="currentColor" /> Stop
          </button>
        ) : (
          <button type="button" disabled={slides.length === 0} onClick={() => onPlay(selected >= 0 ? selected : 0)} className="flex items-center gap-1 px-2 h-7 rounded-md font-semibold text-black disabled:opacity-40" style={{ background: ORANGE }} title="Play the presentation as a timed slideshow on Program, from the selected slide">
            <Play size={12} fill="currentColor" /> Play
          </button>
        )}
        <button type="button" onClick={onToggleLoop} className={`flex items-center justify-center w-7 h-7 rounded-md border ${loop ? 'border-[#FF8C00]/60 text-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 text-white/50'}`} title={loop ? 'Loop on — restarts at the end' : 'Loop off — stops on the last slide'} aria-pressed={loop}>
          <Repeat size={13} />
        </button>
        <span className="font-mono tabular-nums text-white/80 min-w-[88px]">
          {formatTimecode(playheadSec ?? (layout.clips[selected]?.start ?? 0))} / {formatTimecode(layout.total)}
        </span>

        <label className="flex items-center gap-1 ml-1" title="Seconds each slide stays up unless it has its own duration">
          <Timer size={13} className="text-white/40" />
          Default
          <input
            type="number" min={0.5} step={0.5} value={defaultDraft}
            onChange={e => setDefaultDraft(e.target.value)}
            onBlur={commitDefault}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-14 h-6 px-1.5 rounded bg-white/5 border border-white/10 text-white text-[11px] font-mono"
            aria-label="Default seconds per slide"
          />
          s / slide
        </label>

        {sel && selDur != null && (
          <label className="flex items-center gap-1 ml-1" title="This slide's time on screen">
            <span className="truncate max-w-[110px] text-white/50">{sel.label || `Slide ${selected + 1}`}</span>
            <input
              key={`${sel.id}:${selDur}`}
              type="number" min={0.5} step={0.5} defaultValue={selDur}
              onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0 && Math.abs(v - selDur) >= 0.05) onSetSlideSec(sel.id, clampSlideSec(v)); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-14 h-6 px-1.5 rounded bg-white/5 border border-white/10 text-white text-[11px] font-mono"
              aria-label="Selected slide seconds"
            />
            s
            {sel.advanceAfterSec ? (
              <button type="button" onClick={() => onSetSlideSec(sel.id, undefined)} className="text-white/40 hover:text-white" title="Back to the default duration"><RotateCcw size={11} /></button>
            ) : null}
          </label>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setPxPerSec(p => Math.max(3, p / 1.5))} className="w-7 h-7 rounded-md text-white/50 hover:text-white hover:bg-white/5 flex items-center justify-center" title="Zoom out"><ZoomOut size={13} /></button>
          <button type="button" onClick={() => setPxPerSec(p => Math.min(120, p * 1.5))} className="w-7 h-7 rounded-md text-white/50 hover:text-white hover:bg-white/5 flex items-center justify-center" title="Zoom in"><ZoomIn size={13} /></button>
          <button type="button" disabled={slides.length === 0} onClick={onSendToFabula} className="flex items-center gap-1 px-2 h-7 rounded-md border border-white/15 text-white/80 hover:text-white hover:border-white/30 disabled:opacity-40" title="Open this presentation in Fabula as an edit timeline">
            <Clapperboard size={13} /> Send to Fabula
          </button>
        </div>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative overflow-x-auto overflow-y-hidden custom-scrollbar"
        style={{ height: 92 }}
        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); }}
        onDragOver={e => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = (draggingClip.current != null || e.dataTransfer.effectAllowed === 'move') ? 'move' : 'copy';
          setDropAt(insertIndexAtTime(layout, timeAtClientX(e.clientX)));
        }}
        onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null); }}
        onDrop={e => {
          e.preventDefault();
          e.stopPropagation();
          const at = insertIndexAtTime(layout, timeAtClientX(e.clientX));
          setDropAt(null);
          const from = draggingClip.current;
          draggingClip.current = null;
          if (from != null) { onReorder(from, at); return; }
          onDropAt(e, at);
        }}
      >
        <div className="relative h-full" style={{ width: widthPx }}>
          {/* Ruler */}
          <div className="absolute inset-x-0 top-0 h-4 border-b border-white/[0.06]">
            {ticks.out.map(t => (
              <span key={t} className="absolute top-0 h-full border-l border-white/10 pl-0.5 text-[8.5px] font-mono text-white/35" style={{ left: t * pxPerSec }}>
                {formatTimecode(t)}
              </span>
            ))}
          </div>

          {slides.length === 0 && (
            <div className="absolute inset-x-0 top-4 bottom-0 flex items-center justify-center text-[11px] text-white/35 pointer-events-none">
              Drag media, shows or folders from the Library here to build a timed presentation
            </div>
          )}

          {/* Clips */}
          {layout.clips.map(c => {
            const s = slides[c.index];
            if (!s) return null;
            const isSel = c.index === selected;
            const isLive = c.index === liveIdx;
            const thumb = thumbFor?.(s) ?? s.thumb;
            const w = Math.max(c.dur * pxPerSec, 6);
            return (
              <div
                key={s.id}
                draggable
                onDragStart={e => { draggingClip.current = c.index; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(CLIP_DRAG_MIME, String(c.index)); }}
                onDragEnd={() => { draggingClip.current = null; setDropAt(null); }}
                onClick={() => onSelect(c.index)}
                onDoubleClick={() => onTake(c.index)}
                className="absolute top-5 bottom-1.5 rounded-md overflow-hidden border cursor-grab active:cursor-grabbing group/clip"
                style={{
                  left: c.start * pxPerSec,
                  width: w,
                  borderColor: isLive ? ORANGE : isSel ? CYAN : 'rgba(255,255,255,0.14)',
                  background: s.groupColor ? `linear-gradient(180deg, ${s.groupColor}55, #0b0b12)` : '#15151f',
                  boxShadow: isLive ? '0 0 0 1px rgba(255,140,0,0.6), 0 0 14px rgba(255,140,0,0.35)' : undefined,
                }}
                title={`${s.label || `Slide ${c.index + 1}`} — ${formatTimecode(c.dur)}${c.custom ? '' : ' (default)'} · double-click to take live`}
              >
                {thumb && w > 28 && <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" draggable={false} />}
                <div className="relative px-1.5 pt-1 text-[10px] leading-tight text-white font-semibold truncate pointer-events-none">
                  {w > 22 ? (s.label || `Slide ${c.index + 1}`) : ''}
                </div>
                {w > 34 && (
                  <div className={`absolute bottom-1 left-1.5 text-[9px] font-mono pointer-events-none ${c.custom ? 'text-[#FFD9A0]' : 'text-white/45'}`}>
                    {formatTimecode(c.dur)}
                  </div>
                )}
                {/* Right-edge trim handle — drag like a clip in Fabula; double-click resets to the default. */}
                <div
                  role="separator"
                  aria-label={`Trim ${s.label || `slide ${c.index + 1}`}`}
                  onPointerDown={e => startTrim(e, c.index)}
                  onDoubleClick={e => { e.stopPropagation(); onSetSlideSec(s.id, undefined); }}
                  onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                  draggable={false}
                  className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30 group-hover/clip:bg-white/15"
                />
              </div>
            );
          })}

          {/* Drop / reorder insertion marker */}
          {dropAt != null && (
            <span
              className="absolute top-4 bottom-0 w-[3px] pointer-events-none z-10"
              style={{ left: (dropAt < layout.clips.length ? layout.clips[dropAt].start : layout.total) * pxPerSec - 1, background: CYAN, boxShadow: '0 0 10px rgba(0,218,243,0.9)' }}
            />
          )}

          {/* Playhead */}
          {playheadSec != null && (
            <span className="absolute top-0 bottom-0 w-[2px] pointer-events-none z-20" style={{ left: playheadSec * pxPerSec, background: ORANGE, boxShadow: '0 0 8px rgba(255,140,0,0.8)' }} />
          )}
        </div>
      </div>
    </div>
  );
};

export default AmboPresentationTimeline;
