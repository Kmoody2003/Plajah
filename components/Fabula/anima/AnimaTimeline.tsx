// components/Fabula/anima/AnimaTimeline.tsx — transport + dope sheet.
// One scroll container (names stick left, ruler sticks top) so names and tracks never drift
// apart. Rows: each layer (all its keys + drawing exposures), expandable to its animated
// properties. Click a key to jump there; drag on the ruler to scrub.

import React, { memo, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pause, Play, Repeat, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import type { AnimaLayer, AnimaProject } from '../../../services/anima/types';
import { propertyDef, type AnimaAction } from '../../../services/anima/document';
import { timeToFrame } from '../../../services/anima/evaluator';
import { useFrame, type FrameStore } from './frameStore';
import { ScrubNumber, iconBtn, lbl } from './ui';

const NAME_W = 220;
const ROW_H = 26;

export interface AnimaTimelineProps {
  project: AnimaProject;
  frames: FrameStore;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  autoKey: boolean;
  setAutoKey: (v: boolean) => void;
  dispatch: (a: AnimaAction, coalesceKey?: string) => void;
}

const timecode = (frame: number, fps: number) => {
  const total = frame - 1;
  const s = Math.floor(total / fps);
  const f = total % fps;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

const Transport: React.FC<{ project: AnimaProject; frames: FrameStore; playing: boolean; setPlaying: (p: boolean) => void }> = ({ project, frames, playing, setPlaying }) => {
  const frame = useFrame(frames);
  const go = (f: number) => frames.set(Math.max(1, Math.min(project.durationFrames, f)));
  return (
    <div className="flex items-center gap-1">
      <button className={iconBtn} onClick={() => go(1)} aria-label="First frame" title="First frame (Home)"><SkipBack size={15} /></button>
      <button className={iconBtn} onClick={() => go(frame - 1)} aria-label="Previous frame" title="Previous frame (←)"><StepBack size={15} /></button>
      <button
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[9px] text-[12px] font-bold text-white"
        style={{ background: playing ? 'rgba(212,0,85,0.85)' : 'linear-gradient(135deg,#00DAF3,#6B0099)' }}
        onClick={() => setPlaying(!playing)}
        title="Play / pause (Space)"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}
      </button>
      <button className={iconBtn} onClick={() => go(frame + 1)} aria-label="Next frame" title="Next frame (→)"><StepForward size={15} /></button>
      <button className={iconBtn} onClick={() => go(project.durationFrames)} aria-label="Last frame" title="Last frame (End)"><SkipForward size={15} /></button>
      <span className="ml-2 font-mono text-[12px] text-[#8ff5ff] tabular-nums">{timecode(frame, project.fps)}</span>
      <span className="ml-2 text-[11px] text-white/45 tabular-nums">frame {frame} / {project.durationFrames}</span>
      <span className="ml-1 text-white/30" title="Playback loops"><Repeat size={12} /></span>
    </div>
  );
};

/** Playhead line + ruler highlight; isolated so only this repaints during playback. */
const Playhead: React.FC<{ frames: FrameStore; pxPerFrame: number }> = ({ frames, pxPerFrame }) => {
  const frame = useFrame(frames);
  return (
    <div className="absolute top-0 bottom-0 w-px pointer-events-none z-20" style={{ left: NAME_W + (frame - 1) * pxPerFrame + pxPerFrame / 2, background: '#D40055', boxShadow: '0 0 6px rgba(212,0,85,0.8)' }}>
      <div className="absolute -top-0 -left-[5px] w-[11px] h-[11px] rotate-45" style={{ background: '#D40055' }} />
    </div>
  );
};

const Diamond: React.FC<{ x: number; color: string; title: string; onClick: () => void; small?: boolean }> = ({ x, color, title, onClick, small }) => (
  <button
    title={title}
    aria-label={title}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-4 h-4"
    style={{ left: x }}
  >
    <span className="block rotate-45" style={{ width: small ? 7 : 9, height: small ? 7 : 9, background: color, border: '1px solid rgba(255,255,255,0.85)' }} />
  </button>
);

const LayerRows = memo(function LayerRows({
  layer,
  project,
  pxPerFrame,
  selected,
  expanded,
  onToggle,
  onSelect,
  onJump,
}: {
  layer: AnimaLayer;
  project: AnimaProject;
  pxPerFrame: number;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onJump: (frame: number) => void;
}) {
  const fx = (f: number) => (f - 1) * pxPerFrame + pxPerFrame / 2;
  const channels = Object.entries(layer.channels).filter(([, ch]) => ch.keyframes.length > 0);
  const allFrames = useMemo(() => {
    const set = new Set<number>();
    for (const [, ch] of channels) for (const k of ch.keyframes) set.add(timeToFrame(k.t, project.fps));
    return [...set].filter((f) => f <= project.durationFrames).sort((a, b) => a - b);
  }, [layer.channels, project.fps, project.durationFrames]);
  const exposures = layer.celTrack?.exposures ?? [];
  const width = project.durationFrames * pxPerFrame;
  return (
    <>
      <div className="flex" style={{ height: ROW_H + 4, background: selected ? 'rgba(212,0,85,0.10)' : 'transparent' }} onClick={onSelect}>
        <div className="sticky left-0 z-10 flex items-center gap-1 px-2 shrink-0 cursor-pointer" style={{ width: NAME_W, background: selected ? '#24121c' : '#0e0d14', borderRight: '1px solid rgba(255,255,255,0.08)', opacity: layer.visible ? 1 : 0.45 }}>
          <button
            className="grid place-items-center w-5 h-5 text-white/50 hover:text-white disabled:opacity-20"
            disabled={!channels.length}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <span className={`truncate text-[12px] ${selected ? 'text-white font-semibold' : 'text-white/80'}`}>{layer.name}</span>
        </div>
        <div className="relative shrink-0 cursor-pointer" style={{ width }}>
          {exposures.map((e, i) => (
            <div
              key={i}
              className="absolute top-[7px] bottom-[7px] rounded-[4px]"
              title={project.drawingBank[e.drawingId]?.name ?? 'Drawing'}
              style={{ left: (e.startFrame - 1) * pxPerFrame + 1, width: Math.max(2, e.durationFrames * pxPerFrame - 2), background: 'rgba(208,188,255,0.22)', border: '1px solid rgba(208,188,255,0.45)' }}
            />
          ))}
          {allFrames.map((f) => (
            <Diamond key={f} x={fx(f)} color="#00DAF3" title={`Key at frame ${f}`} onClick={() => onJump(f)} />
          ))}
        </div>
      </div>
      {expanded &&
        channels.map(([path, ch]) => (
          <div key={path} className="flex" style={{ height: ROW_H }}>
            <div className="sticky left-0 z-10 flex items-center pl-8 pr-2 shrink-0" style={{ width: NAME_W, background: '#0e0d14', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="truncate text-[11px] text-white/55">{propertyDef(path).label === path ? ch.name || path : propertyDef(path).label}</span>
            </div>
            <div className="relative shrink-0" style={{ width }}>
              <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.05]" />
              {ch.keyframes.map((k) => {
                const f = timeToFrame(k.t, project.fps);
                return f <= project.durationFrames ? <Diamond key={k.id} small x={fx(f)} color="#ffd166" title={`${ch.name || path}: ${k.v.toFixed(2)} at frame ${f}`} onClick={() => onJump(f)} /> : null;
              })}
            </div>
          </div>
        ))}
    </>
  );
});

export const AnimaTimeline: React.FC<AnimaTimelineProps> = ({ project, frames, playing, setPlaying, selectedLayerId, onSelectLayer, autoKey, setAutoKey, dispatch }) => {
  const [pxPerFrame, setPxPerFrame] = useState(14);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const scrubbing = useRef(false);
  const width = project.durationFrames * pxPerFrame;
  const tickEvery = pxPerFrame >= 20 ? 1 : pxPerFrame >= 10 ? 2 : pxPerFrame >= 6 ? 6 : 12;

  const scrubTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.floor((e.clientX - r.left) / pxPerFrame) + 1;
    frames.set(Math.max(1, Math.min(project.durationFrames, f)));
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-3 px-3 h-11 shrink-0 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Transport project={project} frames={frames} playing={playing} setPlaying={setPlaying} />
        <div className="ml-auto flex items-center gap-2">
          <span className={lbl}>fps</span>
          <ScrubNumber className="w-16" value={project.fps} step={1} min={1} max={120} ariaLabel="Frames per second" onChange={(v, ph) => ph === 'commit' && dispatch({ type: 'setTiming', fps: v })} />
          <span className={lbl}>length</span>
          <ScrubNumber className="w-20" value={project.durationFrames} step={1} min={1} unit="f" ariaLabel="Length in frames" onChange={(v, ph) => ph === 'commit' && dispatch({ type: 'setTiming', durationFrames: v })} />
          <button
            className="h-8 px-2.5 rounded-[9px] text-[11px] font-bold border"
            style={autoKey ? { background: 'rgba(212,0,85,0.22)', borderColor: 'rgba(212,0,85,0.6)', color: '#ff9cc2' } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            onClick={() => setAutoKey(!autoKey)}
            title="Auto-key: every edit sets a key at the playhead"
          >
            ● Auto-key
          </button>
          <span className={lbl}>zoom</span>
          <input type="range" min={4} max={36} value={pxPerFrame} onChange={(e) => setPxPerFrame(Number(e.target.value))} aria-label="Timeline zoom" className="w-24" />
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-auto custom-scrollbar">
        <div className="relative" style={{ width: NAME_W + width, minHeight: '100%' }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex" style={{ height: 24, background: '#0b0a10', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="sticky left-0 z-10 flex items-center px-3 shrink-0" style={{ width: NAME_W, background: '#0b0a10', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <span className={lbl}>Layers</span>
            </div>
            <div
              className="relative shrink-0 cursor-ew-resize"
              style={{ width }}
              onPointerDown={(e) => {
                scrubbing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                setPlaying(false);
                scrubTo(e);
              }}
              onPointerMove={(e) => scrubbing.current && scrubTo(e)}
              onPointerUp={() => (scrubbing.current = false)}
            >
              {Array.from({ length: Math.ceil(project.durationFrames / tickEvery) }, (_, i) => i * tickEvery + 1).map((f) => (
                <div key={f} className="absolute top-0 bottom-0" style={{ left: (f - 1) * pxPerFrame }}>
                  <div className="w-px h-2 bg-white/25" />
                  <span className="absolute top-2 left-1 text-[9px] text-white/40 tabular-nums">{f}</span>
                </div>
              ))}
              {Array.from({ length: Math.floor((project.durationFrames - 1) / project.fps) }, (_, i) => (i + 1) * project.fps + 1).map((f) => (
                <div key={`s${f}`} className="absolute top-0 bottom-0 w-px bg-[#00DAF3]/40" style={{ left: (f - 1) * pxPerFrame }} />
              ))}
            </div>
          </div>

          {project.layers.map((l) => (
            <LayerRows
              key={l.id}
              layer={l}
              project={project}
              pxPerFrame={pxPerFrame}
              selected={l.id === selectedLayerId}
              expanded={!!expanded[l.id]}
              onToggle={() => setExpanded((s) => ({ ...s, [l.id]: !s[l.id] }))}
              onSelect={() => onSelectLayer(l.id)}
              onJump={(f) => {
                setPlaying(false);
                frames.set(f);
              }}
            />
          ))}
          <Playhead frames={frames} pxPerFrame={pxPerFrame} />
        </div>
      </div>
    </div>
  );
};
