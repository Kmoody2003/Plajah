// components/Fabula/anima/AnimaTimeline.tsx — transport + dope sheet / graph editor.
//
// Dope sheet: one scroll container (names stick left, ruler sticks top). Rows are layers (all
// their keys + drawing exposures), expandable to their animated properties.
//   click a key: select it (Shift / Ctrl adds) and jump there · drag keys: slide by frames
//   drag on empty track: box-select · click empty track: move the playhead
//   Delete removes, Ctrl+C / Ctrl+V copy and paste at the playhead (handled by the studio).
// Graph: the selected layer's curves, with draggable keys and Bézier handles.

import React, { memo, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pause, Play, Repeat, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import type { AnimaLayer, AnimaProject, InterpolationEase } from '../../../services/anima/types';
import { keyRefId, propertyDef, type AnimaAction, type KeyRef } from '../../../services/anima/document';
import { timeToFrame } from '../../../services/anima/evaluator';
import { useFrame, type FrameStore } from './frameStore';
import { ScrubNumber, field, iconBtn, lbl } from './ui';
import { AnimaGraphEditor } from './AnimaGraphEditor';

export const NAME_W = 220;
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
  keySel: string[];
  setKeySel: (ids: string[]) => void;
}

export const EASE_OPTIONS: { id: InterpolationEase; name: string }[] = [
  { id: 'smooth', name: 'Smooth' },
  { id: 'linear', name: 'Linear' },
  { id: 'in', name: 'Ease in' },
  { id: 'out', name: 'Ease out' },
  { id: 'bezier', name: 'Curve (graph)' },
  { id: 'elastic', name: 'Elastic' },
  { id: 'bounce', name: 'Bounce' },
  { id: 'hold', name: 'Hold' },
];

const timecode = (frame: number, fps: number) => {
  const total = frame - 1;
  const s = Math.floor(total / fps);
  const f = total % fps;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

export const parseRef = (id: string): KeyRef => {
  const [layerId, path, keyId] = id.split('|');
  return { layerId, path, keyId };
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

/** Playhead line; isolated so only this repaints during playback. */
const Playhead: React.FC<{ frames: FrameStore; pxPerFrame: number }> = ({ frames, pxPerFrame }) => {
  const frame = useFrame(frames);
  return (
    <div className="absolute top-0 bottom-0 w-px pointer-events-none z-20" style={{ left: NAME_W + (frame - 1) * pxPerFrame + pxPerFrame / 2, background: '#D40055', boxShadow: '0 0 6px rgba(212,0,85,0.8)' }}>
      <div className="absolute top-0 -left-[5px] w-[11px] h-[11px] rotate-45" style={{ background: '#D40055' }} />
    </div>
  );
};

interface DiamondProps {
  x: number;
  refs: string[];
  selected: boolean;
  small?: boolean;
  color: string;
  title: string;
  dragDx: number;
  onKeyDown: (e: React.PointerEvent, refs: string[]) => void;
}

const Diamond: React.FC<DiamondProps> = ({ x, refs, selected, small, color, title, dragDx, onKeyDown }) => (
  <button
    title={title}
    aria-label={title}
    data-keyrefs={refs.join(',')}
    onPointerDown={(e) => {
      e.stopPropagation();
      onKeyDown(e, refs);
    }}
    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-4 h-4 z-10 cursor-ew-resize"
    style={{ left: x + (selected ? dragDx : 0) }}
  >
    <span
      className="block rotate-45"
      style={{
        width: small ? 7 : 9,
        height: small ? 7 : 9,
        background: selected ? '#ffffff' : color,
        border: `1.5px solid ${selected ? '#D40055' : 'rgba(255,255,255,0.85)'}`,
        boxShadow: selected ? '0 0 0 2px rgba(212,0,85,0.5)' : undefined,
      }}
    />
  </button>
);

const LayerRows = memo(function LayerRows({
  layer,
  project,
  pxPerFrame,
  selected,
  expanded,
  selSet,
  dragDx,
  onToggle,
  onSelect,
  onKeyDown,
  onTrackDown,
}: {
  layer: AnimaLayer;
  project: AnimaProject;
  pxPerFrame: number;
  selected: boolean;
  expanded: boolean;
  selSet: Set<string>;
  dragDx: number;
  onToggle: () => void;
  onSelect: () => void;
  onKeyDown: (e: React.PointerEvent, refs: string[]) => void;
  onTrackDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const fx = (f: number) => (f - 1) * pxPerFrame + pxPerFrame / 2;
  const channels = Object.entries(layer.channels).filter(([, ch]) => ch.keyframes.length > 0);
  // Summary row: every key on the layer, grouped by frame.
  const groups = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const [path, ch] of channels)
      for (const k of ch.keyframes) {
        const f = timeToFrame(k.t, project.fps);
        if (f > project.durationFrames) continue;
        if (!m.has(f)) m.set(f, []);
        m.get(f)!.push(keyRefId({ layerId: layer.id, path, keyId: k.id }));
      }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [layer.channels, layer.id, project.fps, project.durationFrames]);
  const exposures = layer.celTrack?.exposures ?? [];
  const width = project.durationFrames * pxPerFrame;
  return (
    <>
      <div className="flex" style={{ height: ROW_H + 4, background: selected ? 'rgba(212,0,85,0.10)' : 'transparent' }}>
        <div
          className="sticky left-0 z-10 flex items-center gap-1 px-2 shrink-0 cursor-pointer"
          style={{ width: NAME_W, background: selected ? '#24121c' : '#0e0d14', borderRight: '1px solid rgba(255,255,255,0.08)', opacity: layer.visible ? 1 : 0.45 }}
          onClick={onSelect}
        >
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
        <div className="relative shrink-0" style={{ width }} onPointerDown={onTrackDown}>
          {exposures.map((e, i) => (
            <div
              key={i}
              className="absolute top-[7px] bottom-[7px] rounded-[4px] pointer-events-none"
              title={project.drawingBank[e.drawingId]?.name ?? 'Drawing'}
              style={{ left: (e.startFrame - 1) * pxPerFrame + 1, width: Math.max(2, e.durationFrames * pxPerFrame - 2), background: 'rgba(208,188,255,0.22)', border: '1px solid rgba(208,188,255,0.45)' }}
            />
          ))}
          {groups.map(([f, refs]) => (
            <Diamond key={f} x={fx(f)} refs={refs} selected={refs.every((r) => selSet.has(r))} color="#00DAF3" title={`${refs.length} key${refs.length > 1 ? 's' : ''} at frame ${f}`} dragDx={dragDx} onKeyDown={onKeyDown} />
          ))}
        </div>
      </div>
      {expanded &&
        channels.map(([path, ch]) => (
          <div key={path} className="flex" style={{ height: ROW_H }}>
            <div className="sticky left-0 z-10 flex items-center pl-8 pr-2 shrink-0" style={{ width: NAME_W, background: '#0e0d14', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="truncate text-[11px] text-white/55">{propertyDef(path).label === path ? ch.name || path : propertyDef(path).label}</span>
            </div>
            <div className="relative shrink-0" style={{ width }} onPointerDown={onTrackDown}>
              <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.05] pointer-events-none" />
              {ch.keyframes.map((k) => {
                const f = timeToFrame(k.t, project.fps);
                const id = keyRefId({ layerId: layer.id, path, keyId: k.id });
                return f <= project.durationFrames ? (
                  <Diamond key={k.id} small x={fx(f)} refs={[id]} selected={selSet.has(id)} color="#ffd166" title={`${ch.name || path}: ${k.v.toFixed(2)} at frame ${f}`} dragDx={dragDx} onKeyDown={onKeyDown} />
                ) : null;
              })}
            </div>
          </div>
        ))}
    </>
  );
});

export const AnimaTimeline: React.FC<AnimaTimelineProps> = ({ project, frames, playing, setPlaying, selectedLayerId, onSelectLayer, autoKey, setAutoKey, dispatch, keySel, setKeySel }) => {
  const [pxPerFrame, setPxPerFrame] = useState(14);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'dope' | 'graph'>('dope');
  const [dragDx, setDragDx] = useState(0);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrubbing = useRef(false);
  const width = project.durationFrames * pxPerFrame;
  const tickEvery = pxPerFrame >= 20 ? 1 : pxPerFrame >= 10 ? 2 : pxPerFrame >= 6 ? 6 : 12;
  const selSet = useMemo(() => new Set(keySel), [keySel]);
  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) ?? null;

  const frameAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.max(1, Math.min(project.durationFrames, Math.floor((clientX - r.left) / pxPerFrame) + 1));
  };

  /** Press on a key: select (modifiers add/toggle), then drag to slide everything selected. */
  const onKeyDown = (e: React.PointerEvent, refs: string[]) => {
    setPlaying(false);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const already = refs.every((r) => selSet.has(r));
    let sel: string[];
    if (additive) sel = already && (e.ctrlKey || e.metaKey) ? keySel.filter((r) => !refs.includes(r)) : [...new Set([...keySel, ...refs])];
    else sel = already ? keySel : refs;
    setKeySel(sel);
    const startX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let moved = 0;
    const onMove = (ev: PointerEvent) => {
      moved = Math.round((ev.clientX - startX) / pxPerFrame);
      setDragDx(moved * pxPerFrame);
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      setDragDx(0);
      if (moved) dispatch({ type: 'moveKeys', refs: sel.map(parseRef), deltaFrames: moved });
      else if (!additive) {
        const first = parseRef(refs[0]);
        const k = project.layers.find((l) => l.id === first.layerId)?.channels[first.path]?.keyframes.find((x) => x.id === first.keyId);
        if (k) frames.set(timeToFrame(k.t, project.fps));
        if (refs.length && first.layerId !== selectedLayerId) onSelectLayer(first.layerId);
      }
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };

  /** Press on empty track: drag = box select; click = move the playhead and clear. */
  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const content = contentRef.current;
    if (!content) return;
    setPlaying(false);
    const cr = content.getBoundingClientRect();
    const x0 = e.clientX - cr.left;
    const y0 = e.clientY - cr.top;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const track = e.currentTarget;
    track.setPointerCapture(e.pointerId);
    let dragged = false;
    const onMove = (ev: PointerEvent) => {
      const x1 = ev.clientX - cr.left;
      const y1 = ev.clientY - cr.top;
      if (!dragged && Math.hypot(x1 - x0, y1 - y0) < 4) return;
      dragged = true;
      setBox({ x0, y0, x1, y1 });
    };
    const onUp = (ev: PointerEvent) => {
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
      setBox(null);
      if (!dragged) {
        frames.set(frameAt(ev.clientX, track));
        if (!additive) setKeySel([]);
        return;
      }
      const left = Math.min(x0, ev.clientX - cr.left) + cr.left;
      const right = Math.max(x0, ev.clientX - cr.left) + cr.left;
      const top = Math.min(y0, ev.clientY - cr.top) + cr.top;
      const bottom = Math.max(y0, ev.clientY - cr.top) + cr.top;
      const hit: string[] = [];
      content.querySelectorAll<HTMLElement>('[data-keyrefs]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx >= left && cx <= right && cy >= top && cy <= bottom) hit.push(...(el.dataset.keyrefs || '').split(',').filter(Boolean));
      });
      setKeySel(additive ? [...new Set([...keySel, ...hit])] : [...new Set(hit)]);
    };
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
  };

  const selEases = useMemo(() => {
    const s = new Set<string>();
    for (const id of keySel) {
      const r = parseRef(id);
      const k = project.layers.find((l) => l.id === r.layerId)?.channels[r.path]?.keyframes.find((x) => x.id === r.keyId);
      if (k) s.add(k.ease ?? 'linear');
    }
    return s;
  }, [keySel, project.layers]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-3 px-3 h-11 shrink-0 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Transport project={project} frames={frames} playing={playing} setPlaying={setPlaying} />
        <div className="flex items-center p-0.5 rounded-[9px] bg-white/[0.05] border border-white/10">
          {(['dope', 'graph'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`h-7 px-2.5 rounded-[7px] text-[11px] font-bold ${view === v ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}>
              {v === 'dope' ? 'Dope sheet' : 'Graph'}
            </button>
          ))}
        </div>
        {keySel.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-white/60">{keySel.length} key{keySel.length > 1 ? 's' : ''}</span>
            <select
              className={`${field} h-7 text-[11px]`}
              aria-label="Ease for selected keys"
              value={selEases.size === 1 ? [...selEases][0] : ''}
              onChange={(e) => {
                const ease = e.target.value as InterpolationEase;
                const at = Date.now();
                for (const id of keySel) {
                  const r = parseRef(id);
                  dispatch({ type: 'setKeyEase', layerId: r.layerId, path: r.path, keyId: r.keyId, ease }, `ease-${at}`);
                }
              }}
            >
              {selEases.size !== 1 && <option value="" style={{ background: '#17131d' }}>Mixed ease</option>}
              {EASE_OPTIONS.map((o) => <option key={o.id} value={o.id} style={{ background: '#17131d' }}>{o.name}</option>)}
            </select>
            <span className="text-[10px] text-white/35">Del removes · Ctrl+C / V</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button
            className="h-8 px-2.5 rounded-[9px] text-[11px] font-bold border"
            style={project.onionSkin.enabled ? { background: 'rgba(0,218,243,0.16)', borderColor: 'rgba(0,218,243,0.5)', color: '#8ff5ff' } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            onClick={() => dispatch({ type: 'setOnionSkin', patch: { enabled: !project.onionSkin.enabled } })}
            title="Onion skin: see neighbouring drawings while paused"
          >
            Onion
          </button>
          {project.onionSkin.enabled && (
            <>
              <ScrubNumber className="w-14" value={project.onionSkin.prevFrames} step={1} min={0} max={6} ariaLabel="Drawings before" onChange={(v, ph) => ph === 'commit' && dispatch({ type: 'setOnionSkin', patch: { prevFrames: v } })} />
              <ScrubNumber className="w-14" value={project.onionSkin.nextFrames} step={1} min={0} max={6} ariaLabel="Drawings after" onChange={(v, ph) => ph === 'commit' && dispatch({ type: 'setOnionSkin', patch: { nextFrames: v } })} />
            </>
          )}
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
        <div ref={contentRef} className="relative" style={{ width: NAME_W + width, minHeight: '100%' }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex" style={{ height: 24, background: '#0b0a10', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="sticky left-0 z-10 flex items-center px-3 shrink-0" style={{ width: NAME_W, background: '#0b0a10', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <span className={lbl}>{view === 'graph' ? `Graph · ${selectedLayer?.name ?? 'no layer'}` : 'Layers'}</span>
            </div>
            <div
              className="relative shrink-0 cursor-ew-resize"
              style={{ width }}
              onPointerDown={(e) => {
                scrubbing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                setPlaying(false);
                frames.set(frameAt(e.clientX, e.currentTarget));
              }}
              onPointerMove={(e) => scrubbing.current && frames.set(frameAt(e.clientX, e.currentTarget))}
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

          {view === 'dope' ? (
            project.layers.map((l) => (
              <LayerRows
                key={l.id}
                layer={l}
                project={project}
                pxPerFrame={pxPerFrame}
                selected={l.id === selectedLayerId}
                expanded={!!expanded[l.id]}
                selSet={selSet}
                dragDx={dragDx}
                onToggle={() => setExpanded((s) => ({ ...s, [l.id]: !s[l.id] }))}
                onSelect={() => onSelectLayer(l.id)}
                onKeyDown={onKeyDown}
                onTrackDown={onTrackDown}
              />
            ))
          ) : (
            <AnimaGraphEditor project={project} layer={selectedLayer} frames={frames} pxPerFrame={pxPerFrame} dispatch={dispatch} keySel={keySel} setKeySel={setKeySel} />
          )}
          {box && (
            <div
              className="absolute z-30 pointer-events-none"
              style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0), background: 'rgba(0,218,243,0.08)', border: '1px solid rgba(0,218,243,0.6)' }}
            />
          )}
          <Playhead frames={frames} pxPerFrame={pxPerFrame} />
        </div>
      </div>
    </div>
  );
};
