// ShowPlayer — plays a Themed Show anywhere, with no render step.
//
//   <ShowPlayer showRef={{ owner, id }} />            a published show (posts, Tela, links)
//   <ShowPlayer spec={spec} />                         a show already in memory (the studio, Stage)
//
// Two ways to watch, switchable by the viewer:
//   timeline     — the show exactly as it renders (music follows the same cues)
//   interactive  — the endless live show: tap any photo to bring it full screen
//
// The forwarded handle lets Stage / Ambo drive it live and take its canvas as a source.

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Maximize2, Pause, Play, SkipBack, SkipForward, Loader2 } from 'lucide-react';
import { IconButton, Chip } from '../../ui';
import { ShowRuntime } from '../../../services/slideshow/showRuntime';
import { loadPublishedShow, type ShowRef } from '../../../services/slideshow/cloudShows';
import type { ShowSpec } from '../../../services/slideshow/types';

export type ShowPlayMode = 'timeline' | 'interactive';

export interface ShowPlayerHandle {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(seconds: number): void;
  next(): void;
  prev(): void;
  setMode(m: ShowPlayMode): void;
  readonly canvas: HTMLCanvasElement | null;
  readonly duration: number;
  readonly time: number;
  readonly playing: boolean;
}

export interface ShowPlayerProps {
  showRef?: Pick<ShowRef, 'owner' | 'id'>;
  spec?: ShowSpec;
  mode?: ShowPlayMode;
  /** Viewer may switch timeline ↔ interactive (default true). */
  allowModeSwitch?: boolean;
  autoPlay?: boolean;
  /** Play the show's music (default true). */
  music?: boolean;
  /** 'full' (default) · 'minimal' (play + time) · 'none' (Stage drives it). */
  controls?: 'full' | 'minimal' | 'none';
  /** Fixed render size (Stage outputs); default follows the element. */
  renderSize?: { width: number; height: number };
  className?: string;
  onReady?: (info: { duration: number; title: string }) => void;
  onEnded?: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const ShowPlayer = forwardRef<ShowPlayerHandle, ShowPlayerProps>(function ShowPlayer(
  { showRef, spec: given, mode: mode0 = 'timeline', allowModeSwitch = true, autoPlay = false, music = true, controls = 'full', renderSize, className = '', onReady, onEnded },
  handleRef,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rtRef = useRef<ShowRuntime | null>(null);
  const [spec, setSpec] = useState<ShowSpec | null>(given || null);
  const [mode, setMode] = useState<ShowPlayMode>(mode0);
  const [state, setState] = useState<{ t: number; playing: boolean; ready: boolean; error?: string; label?: string }>({ t: 0, playing: false, ready: false });
  const [live, setLive] = useState<{ viewed: number; total: number; paused: boolean } | null>(null);

  // load a published show
  useEffect(() => {
    if (given) { setSpec(given); return; }
    if (!showRef) return;
    let alive = true;
    setState((s) => ({ ...s, ready: false, label: 'Loading the show…' }));
    loadPublishedShow(showRef).then((s) => alive && setSpec(s)).catch((e) => alive && setState((st) => ({ ...st, error: e?.message || 'This show could not be loaded.' })));
    return () => { alive = false; };
  }, [given, showRef?.owner, showRef?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // build the runtime
  useEffect(() => {
    const host = hostRef.current, box = boxRef.current;
    if (!host || !box || !spec || !spec.photos.length) return;
    let alive = true;
    host.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
    host.appendChild(canvas);
    const w = renderSize?.width ?? Math.max(320, box.clientWidth), h = renderSize?.height ?? Math.round(w * 9 / 16);
    const rt = new ShowRuntime(canvas, spec, { width: w, height: h, preserve: !!renderSize });
    rtRef.current = rt;
    setState({ t: 0, playing: false, ready: false, label: 'Preparing…' });
    rt.load((k, label) => alive && setState((s) => ({ ...s, label }))).then(async () => {
      if (!alive) return;
      rt.onPlanTime = (t, playing) => {
        setState((s) => ({ ...s, t, playing }));
        if (!playing && t >= rt.duration - 0.05) onEnded?.();
      };
      rt.onStatus = (s) => setLive({ viewed: s.viewed, total: s.total, paused: s.paused });
      setState({ t: 0, playing: false, ready: true });
      onReady?.({ duration: rt.duration, title: spec.title });
      if (mode === 'interactive') rt.startLive(music);
      else { await rt.seekPlan(Math.min(3, rt.duration)); if (autoPlay) rt.playPlan(0, music); }
    }).catch((e) => alive && setState((s) => ({ ...s, error: e?.message || 'The show could not start.' })));
    return () => { alive = false; rt.dispose(); if (rtRef.current === rt) rtRef.current = null; };
  }, [spec, mode, renderSize?.width, renderSize?.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the element's size (unless Stage fixed one)
  useEffect(() => {
    const box = boxRef.current;
    if (!box || renderSize) return;
    const ro = new ResizeObserver(() => {
      const full = document.fullscreenElement === box;
      const w = full ? window.innerWidth : Math.max(320, box.clientWidth);
      rtRef.current?.resize(w, full ? window.innerHeight : Math.round(w * 9 / 16));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [renderSize]);

  const api: ShowPlayerHandle = {
    play: () => { const rt = rtRef.current; if (!rt) return; if (mode === 'interactive') { if (live?.paused) rt.liveKey('pause'); } else rt.playPlan(undefined, music); },
    pause: () => { const rt = rtRef.current; if (!rt) return; if (mode === 'interactive') { if (!live?.paused) rt.liveKey('pause'); } else rt.pausePlan(); },
    toggle: () => { const rt = rtRef.current; if (!rt) return; if (mode === 'interactive') rt.liveKey('pause'); else if (rt.planPlaying) rt.pausePlan(); else rt.playPlan(undefined, music); },
    seek: (s) => void rtRef.current?.seekPlan(s),
    next: () => { const rt = rtRef.current; if (!rt) return; if (mode === 'interactive') rt.liveKey('next'); else rt.stepPlan(1); },
    prev: () => { const rt = rtRef.current; if (!rt) return; if (mode === 'interactive') rt.liveKey('prev'); else rt.stepPlan(-1); },
    setMode: (m) => setMode(m),
    get canvas() { return (hostRef.current?.firstElementChild as HTMLCanvasElement) || null; },
    get duration() { return rtRef.current?.duration ?? 0; },
    get time() { return rtRef.current?.planTime ?? 0; },
    get playing() { return !!rtRef.current?.planPlaying; },
  };
  useImperativeHandle(handleRef, () => api);

  const fullscreen = () => { const b = boxRef.current; if (!b) return; if (document.fullscreenElement) void document.exitFullscreen(); else void b.requestFullscreen?.(); };
  const dur = rtRef.current?.duration || 0;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div ref={boxRef} className="relative w-full aspect-video bg-black rounded-card overflow-hidden ring-1 ring-[var(--m3-border)]">
        <div ref={hostRef} className="absolute inset-0" />
        {(!state.ready || state.error) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 type-body-md bg-black/60">
            {state.error ? <span style={{ color: 'var(--pj-danger)' }}>{state.error}</span> : <><Loader2 className="animate-spin" size={20} /> {state.label || 'Loading…'}</>}
          </div>
        )}
        {controls !== 'none' && state.ready && mode === 'timeline' && !state.playing && (
          <button type="button" onClick={api.toggle} aria-label="Play the show" className="absolute inset-0 flex items-center justify-center group">
            <span className="pj-btn pj-btn--accent pj-btn--xl pj-btn--icon shadow-[var(--pj-glow-orange)] group-hover:scale-105 transition-transform"><Play size={28} /></span>
          </button>
        )}
      </div>
      {controls !== 'none' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {controls === 'full' && <IconButton size="sm" variant="ghost" aria-label="Previous" onClick={api.prev}><SkipBack /></IconButton>}
          <IconButton size="sm" variant="accent" aria-label={state.playing || (mode === 'interactive' && !live?.paused) ? 'Pause' : 'Play'} onClick={api.toggle}>
            {state.playing || (mode === 'interactive' && !live?.paused) ? <Pause /> : <Play />}
          </IconButton>
          {controls === 'full' && <IconButton size="sm" variant="ghost" aria-label="Next" onClick={api.next}><SkipForward /></IconButton>}
          {mode === 'timeline' ? (
            <>
              <span className="font-mono text-xs tabular-nums">{fmt(state.t)} <span style={{ color: 'var(--on-surface-variant)' }}>/ {fmt(dur)}</span></span>
              {controls === 'full' && (
                <input type="range" min={0} max={dur || 1} step={1 / 30} value={Math.min(state.t, dur)} onChange={(e) => api.seek(+e.target.value)}
                  className="flex-1 min-w-24 accent-[var(--pj-orange)]" aria-label="Show position" />
              )}
            </>
          ) : (
            <span className="type-body-sm flex-1" style={{ color: 'var(--on-surface-variant)' }}>{live ? `${live.viewed}/${live.total} seen · tap a photo to open it` : 'Tap a photo to open it'}</span>
          )}
          {allowModeSwitch && controls === 'full' && (
            <div className="flex gap-1">
              <Chip interactive selected={mode === 'timeline'} onClick={() => setMode('timeline')}>Timeline</Chip>
              <Chip interactive selected={mode === 'interactive'} onClick={() => setMode('interactive')}>Interactive</Chip>
            </div>
          )}
          <IconButton size="sm" variant="ghost" aria-label="Full screen" onClick={fullscreen}><Maximize2 /></IconButton>
        </div>
      )}
    </div>
  );
});

export default ShowPlayer;
