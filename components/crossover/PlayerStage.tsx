import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Music, Pause, Play, Subtitles, Volume2, VolumeX } from 'lucide-react';
import { Button, IconButton } from '../ui';
import { cueAt, frameToTc, secToFrame, stripMarkup, type CaptionCue, type FrameRate } from '../../services/crossover/captions';
import { Segmented, mono } from './shared';

export interface PlayerHandle { seek: (sec: number) => void; video: () => HTMLVideoElement | null }

interface Props {
  url: string | null;
  kind: 'video' | 'audio' | 'image' | 'none';
  outputUrl?: string | null;
  outputKind?: 'video' | 'audio' | 'image';
  name?: string;
  cues: CaptionCue[];
  rate: FrameRate;
  startTcFrame?: number;
  /** Live picture of the job running on this item. */
  live?: { previewUrl?: string; previewCanvas?: HTMLCanvasElement; progress: number; speed?: string } | null;
  onTime?: (sec: number) => void;
  onDuration?: (sec: number) => void;
  onUnplayable?: () => void;
  unplayable?: boolean;
  onMakeProxy?: () => void;
  proxyProgress?: number | null;
}

/** Caption text set the way a decoder draws it: white monospace on black, bottom of the safe area. */
function CaptionOverlay({ cue }: { cue: CaptionCue | null }) {
  if (!cue) return null;
  const lines = cue.text.split('\n');
  return (
    <div className="absolute inset-x-0 flex flex-col items-center pointer-events-none" style={{ bottom: '8%' }} data-testid="caption-overlay">
      {lines.map((l, i) => (
        <span key={i} className="px-2 leading-tight whitespace-pre"
          style={{ ...mono, background: 'rgba(0,0,0,.85)', color: 'white', fontSize: 'clamp(11px, 2.6cqw, 30px)', fontStyle: /<i>/.test(cue.text) ? 'italic' : undefined }}>
          {stripMarkup(l)}
        </span>
      ))}
    </div>
  );
}

function LiveCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const el = ref.current;
      if (el && canvas.width) {
        if (el.width !== canvas.width || el.height !== canvas.height) { el.width = canvas.width; el.height = canvas.height; }
        el.getContext('2d')?.drawImage(canvas, 0, 0);
      }
      raf = window.setTimeout(draw, 500) as unknown as number;
    };
    draw();
    return () => clearTimeout(raf);
  }, [canvas]);
  return <canvas ref={ref} className="w-full h-full object-contain" />;
}

const PlayerStage = React.forwardRef<PlayerHandle, Props>(function PlayerStage(
  { url, kind, outputUrl, outputKind, name, cues, rate, startTcFrame = 0, live, onTime, onDuration, onUnplayable, unplayable, onMakeProxy, proxyProgress }, ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showing, setShowing] = useState<'source' | 'output' | 'live'>('source');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const resumeAt = useRef(0);

  useEffect(() => { if (live && showing !== 'live') setShowing('live'); if (!live && showing === 'live') setShowing(outputUrl ? 'output' : 'source'); }, [!!live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!outputUrl && showing === 'output') setShowing('source'); }, [outputUrl, showing]);

  const currentUrl = showing === 'output' ? outputUrl : url;
  const currentKind = showing === 'output' ? outputKind ?? kind : kind;

  useImperativeHandle(ref, () => ({
    seek: (sec) => { const v = videoRef.current; if (v) { v.currentTime = sec; setTime(sec); onTime?.(sec); } },
    video: () => videoRef.current,
  }), [onTime]);

  // The time drives captions, so read it every frame while playing rather than on the slow timeupdate.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) { setTime(v.currentTime); onTime?.(v.currentTime); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, onTime]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play(); else v.pause();
  }, []);
  const step = useCallback((frames: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    const t = Math.max(0, v.currentTime + (frames * rate.den) / rate.num);
    v.currentTime = t;
    setTime(t);
    onTime?.(t);
  }, [rate, onTime]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === ',' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
      else if (e.key === '.' || e.key === 'ArrowRight') { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
      else if (e.key.toLowerCase() === 'c') setCaptionsOn((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, step]);

  const switchTo = (next: 'source' | 'output' | 'live') => {
    resumeAt.current = videoRef.current?.currentTime ?? 0;
    setShowing(next);
  };

  const cue = captionsOn ? cueAt(cues, time) : null;
  const tc = frameToTc(secToFrame(time, rate) + startTcFrame, rate);
  const totalTc = duration ? frameToTc(secToFrame(duration, rate) + startTcFrame, rate) : '--:--:--:--';
  const isAV = currentKind === 'video' || currentKind === 'audio';

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-lg)' }}>
      <div className="flex items-center gap-2 px-3 h-12 shrink-0" style={{ borderBottom: '1px solid var(--m3-border)' }}>
        <div className="min-w-0 flex-1 truncate type-title-sm" style={{ color: 'var(--text-primary)' }}>{name || 'Nothing open'}</div>
        {(outputUrl || live) && (
          <div className="w-auto shrink-0">
            <Segmented value={showing} onChange={switchTo} options={[
              { value: 'source' as const, label: 'Source' },
              ...(live ? [{ value: 'live' as const, label: 'Converting' }] : []),
              ...(outputUrl ? [{ value: 'output' as const, label: 'Output' }] : []),
            ]} />
          </div>
        )}
      </div>

      <div className="relative flex-1 min-h-0 grid place-items-center overflow-hidden" style={{ background: 'black', containerType: 'inline-size' }}>
        {showing === 'live' && live ? (
          <>
            {live.previewCanvas ? <LiveCanvas canvas={live.previewCanvas} />
              : live.previewUrl ? <img src={live.previewUrl} alt="The frame converting now" className="w-full h-full object-contain" />
              : <div className="type-body-md" style={{ color: 'rgba(255,255,255,.6)' }}>Waiting for the first frame</div>}
            <div className="absolute top-3 left-3 px-2 py-1 type-label-md" style={{ ...mono, background: 'rgba(0,0,0,.7)', color: 'white', borderRadius: 'var(--pj-radius-xs)' }}>
              {Math.round(live.progress * 100)}%{live.speed ? ` · ${live.speed}` : ''}
            </div>
          </>
        ) : !currentUrl && !unplayable ? (
          <div className="text-center px-6">
            <Film className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,.35)' }} />
            <div className="type-body-md" style={{ color: 'rgba(255,255,255,.6)' }}>Open a video to review it here.</div>
          </div>
        ) : currentKind === 'image' && currentUrl ? (
          <img src={currentUrl} alt={name} className="max-w-full max-h-full object-contain" />
        ) : unplayable && showing === 'source' ? (
          <div className="text-center px-6 max-w-sm">
            <Film className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,.35)' }} />
            <div className="type-body-md mb-3" style={{ color: 'rgba(255,255,255,.8)' }}>The player can't decode this file directly.</div>
            {onMakeProxy ? (
              proxyProgress !== null && proxyProgress !== undefined
                ? <div className="type-body-sm" style={{ ...mono, color: 'white' }}>Making a review copy: {Math.round(proxyProgress * 100)}%</div>
                : <Button variant="secondary" onClick={onMakeProxy}>Make a review copy</Button>
            ) : <div className="type-body-sm" style={{ color: 'rgba(255,255,255,.6)' }}>You can still inspect and convert it.</div>}
          </div>
        ) : isAV && currentUrl ? (
          <>
            {currentKind === 'audio' && <Music className="absolute w-12 h-12" style={{ color: 'rgba(255,255,255,.3)' }} />}
            <video
              key={currentUrl}
              ref={videoRef}
              src={currentUrl}
              playsInline
              muted={muted}
              onClick={toggle}
              className="max-w-full max-h-full"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuration(v.duration || 0);
                onDuration?.(v.duration || 0);
                if (resumeAt.current) { v.currentTime = resumeAt.current; resumeAt.current = 0; }
                if (currentKind === 'video' && !v.videoWidth && showing === 'source') onUnplayable?.();
              }}
              onSeeked={(e) => { setTime(e.currentTarget.currentTime); onTime?.(e.currentTarget.currentTime); }}
              onTimeUpdate={(e) => { if (!playing) { setTime(e.currentTarget.currentTime); onTime?.(e.currentTarget.currentTime); } }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() => { if (showing === 'source') onUnplayable?.(); }}
            />
            <CaptionOverlay cue={cue} />
          </>
        ) : null}
      </div>

      {isAV && !(showing === 'live') && (
        <div className="shrink-0 px-3 py-2 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--m3-border)' }}>
          <input aria-label="Position" type="range" min={0} max={duration || 1} step={0.001} value={Math.min(time, duration || 1)}
            onChange={(e) => { const v = videoRef.current; const t = +e.target.value; if (v) v.currentTime = t; setTime(t); onTime?.(t); }}
            className="w-full" style={{ accentColor: 'var(--pj-orange)' }} />
          <div className="flex items-center gap-1">
            <IconButton variant="ghost" size="sm" aria-label="Back one frame" title="Back one frame (,)" onClick={() => step(-1)}><ChevronLeft /></IconButton>
            <IconButton variant="accent" size="sm" aria-label={playing ? 'Pause' : 'Play'} title="Play or pause (space)" onClick={toggle}>{playing ? <Pause /> : <Play />}</IconButton>
            <IconButton variant="ghost" size="sm" aria-label="Forward one frame" title="Forward one frame (.)" onClick={() => step(1)}><ChevronRight /></IconButton>
            <div className="ml-1 sm:ml-2 type-body-md whitespace-nowrap overflow-hidden" style={{ ...mono, color: 'var(--text-primary)' }} data-testid="timecode">
              {tc}<span className="hidden sm:inline" style={{ color: 'var(--on-surface-variant)' }}> / {totalTc} · {rate.label}</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <IconButton variant={captionsOn ? 'secondary' : 'ghost'} size="sm" aria-label="Show captions" aria-pressed={captionsOn} title="Show captions (C)" onClick={() => setCaptionsOn((c) => !c)}><Subtitles /></IconButton>
              <span className="hidden sm:inline-flex"><IconButton variant="ghost" size="sm" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((m) => !m)}>{muted ? <VolumeX /> : <Volume2 />}</IconButton></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default PlayerStage;
