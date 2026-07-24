import React, { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Play, Pause, SkipBack, SkipForward, Music2, X } from 'lucide-react';
import FxStageVisualizers, { type FxEngine, fxPresetName } from '../FxStageVisualizers';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { thumb, THUMB } from '../../src/lib/imageThumb';

/**
 * The FX Stage on a television — the slideshow's shell with the visualizer as the backdrop.
 *
 * It deliberately shares the slideshow's model so the two feel identical to operate: a fullscreen
 * takeover, reveal-on-press controls, the same right-hand synced lyrics, an explicit Close button,
 * and a bottom transport that stays present. What's different is the extra axis — the LOOK:
 *   • ◀ ▶  (and the remote's CHANNEL +/-)  step through presets — immediate, no "first press wakes",
 *   • ▲ ▼  switch engine, shown as three labelled pills so it's obvious which you're on,
 *   • OK    plays / pauses, Back (or the Close button) exits.
 *
 * Performance: the visualizer renders into a box scaled to RENDER_SCALE of the screen and is then
 * CSS-upscaled to fill it. Fill-rate is what bounds the Mali-G31 (docs/TV_GPU_BENCHMARK.md), and a
 * relative downscale cuts pixels regardless of the panel's DPR — ~0.66 lands near the doc's 720p
 * sweet spot while still looking clean at ten feet. SHADER (lightest) is the default engine.
 */

const TV_ENGINES: FxEngine[] = ['SHADER', 'GENERATOR', 'MILKDROP'];
const ENGINE_LABEL: Record<FxEngine, string> = { SHADER: 'Shader', GENERATOR: 'Generator', MILKDROP: 'MilkDrop' };
const RENDER_SCALE = 0.66;   // render at 66% then upscale — a DPR-agnostic fill-rate cut

const fmt = (s?: number): string => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

const TvFxSurface: React.FC = () => {
  const {
    isTvFxActive, setIsTvFxActive, analyser, isPlaying, togglePlay, next, prev,
    currentTrack, currentAlbum, currentTime, duration, isSlideshowActive,
  } = useGlobalPlayer();

  const [engineIdx, setEngineIdx] = useState(0);
  const [presetIndex, setPresetIndex] = useState(0);
  const [controls, setControls] = useState(true);   // show controls on open so the scheme is visible
  const hideTimer = useRef<any>(null);

  const showing = isTvFxActive && !isSlideshowActive;
  const engine = TV_ENGINES[engineIdx];

  const wake = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 5000);
  }, []);

  // Same windowed synced lyrics as the slideshow — active line lifted + orange.
  const lyrics = (currentTrack as any)?.timeCodedLyrics as { time: number; text: string }[] | undefined;
  const lyricWindow = useMemo(() => {
    if (!lyrics?.length) return null;
    const t = currentTime || 0;
    let active = lyrics.findIndex((l, i) => t >= l.time && (!lyrics[i + 1] || t < lyrics[i + 1].time));
    if (active === -1) active = t < lyrics[0].time ? 0 : lyrics.length - 1;
    const from = Math.max(0, active - 2);
    return { lines: lyrics.slice(from, from + 6).map((l, i) => ({ text: l.text, on: from + i === active })) };
  }, [lyrics, currentTime]);

  const exit = useCallback(() => setIsTvFxActive(false), [setIsTvFxActive]);
  const cycleEngine = useCallback((dir: number) => {
    setEngineIdx(i => (i + dir + TV_ENGINES.length) % TV_ENGINES.length);
    setPresetIndex(0);
    wake();
  }, [wake]);

  useEffect(() => {
    if (!showing) return;
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode || e.which;
      if (kc === 24 || kc === 25 || kc === 26 || kc === 164) return;   // volume / mute — system's
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      // Exit.
      if (kc === 4 || kc === 27 || e.key === 'Backspace' || e.key === 'Escape' || e.key === 'XF86Back' || e.key === 'GoBack') {
        stop(); exit(); return;
      }
      // Media keys always drive playback.
      if (e.key === 'MediaPlayPause' || kc === 85 || kc === 179) { stop(); togglePlay(); return; }
      if (e.key === 'MediaTrackNext' || kc === 87 || kc === 176) { stop(); next(); return; }
      if (e.key === 'MediaTrackPrevious' || kc === 88 || kc === 177) { stop(); prev(); return; }

      stop();
      wake();
      // Preset: ◀ ▶ AND the remote's Channel +/- (keyCodes 166/167, or the named keys).
      if (e.key === 'ArrowLeft' || kc === 37 || kc === 21 || e.key === 'ChannelDown' || kc === 167) { setPresetIndex(i => i - 1); return; }
      if (e.key === 'ArrowRight' || kc === 39 || kc === 22 || e.key === 'ChannelUp' || kc === 166) { setPresetIndex(i => i + 1); return; }
      // Engine: ▲ ▼.
      if (e.key === 'ArrowUp' || kc === 38 || kc === 19) { cycleEngine(-1); return; }
      if (e.key === 'ArrowDown' || kc === 40 || kc === 20) { cycleEngine(1); return; }
      // OK plays/pauses.
      if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23) { togglePlay(); return; }
    };
    // Native TV hardware Back arrives as this event, not a keydown. preventDefault() to CONSUME it,
    // else useHardwareBack falls through to history.back() and navigates the app out to login.
    const onHwBack = (e: Event) => { e.preventDefault(); exit(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('plajah:hardware-back', onHwBack);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showing, wake, exit, togglePlay, next, prev, cycleEngine]);

  // Show the controls (and start the auto-hide) each time the surface opens.
  useEffect(() => { if (showing) wake(); else setControls(true); }, [showing, wake]);

  if (!showing) return null;

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;
  const scalePct = `${Math.round(100 / RENDER_SCALE)}%`;

  return createPortal(
    <div className="fixed inset-0 z-[290] bg-black overflow-hidden" data-tv-no-trap role="img" aria-label="FX Stage visualizer">
      {/* Reduced-resolution render, CSS-upscaled to fill. */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: scalePct, height: scalePct, transform: `scale(${RENDER_SCALE})` }}
      >
        <Suspense fallback={<div className="w-full h-full grid place-items-center text-white/25 text-xs font-black uppercase tracking-widest">Loading FX Stage…</div>}>
          <FxStageVisualizers engine={engine} presetIndex={presetIndex} analyser={analyser} isPlaying={isPlaying} />
        </Suspense>
      </div>

      {/* Right-hand synced lyrics — identical to the slideshow (no blur; TV fill-rate). */}
      {lyricWindow && (
        <div
          className="absolute top-0 right-0 bottom-0 w-[46%] flex flex-col justify-center px-14 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(6,2,12,0.45) 35%, rgba(6,2,12,0.78) 100%)' }}
        >
          <div className="space-y-5">
            {lyricWindow.lines.map((ln, i) => (
              <p key={i} className={`font-black leading-tight transition-all duration-500 ${ln.on ? 'text-4xl' : 'text-2xl text-white/30'}`} style={ln.on ? { color: '#FF8C00' } : undefined}>
                {ln.text || '♪'}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Close (exit) — always an obvious way out, top-right, shown with the controls. */}
      <button
        onClick={exit}
        aria-label="Close FX Stage"
        className="absolute top-8 right-10 z-10 flex items-center gap-2.5 pl-4 pr-5 py-2.5 rounded-full bg-black/60 border border-white/20 text-white transition-opacity duration-300"
        style={{ opacity: controls ? 1 : 0 }}
      >
        <X size={20} /><span className="text-[11px] font-black uppercase tracking-widest">Close</span>
      </button>

      {/* Engine selector (top-left) — three pills so it's obvious which engine is live and that ▲▼
          switches them. This is the "make it deliberate" fix: the choice is shown, not hidden. */}
      <div className="absolute top-8 left-10 z-10 flex items-center gap-2 transition-opacity duration-300" style={{ opacity: controls ? 1 : 0 }}>
        <Sparkles size={18} className="text-[#FF8C00] mr-1" />
        {TV_ENGINES.map((e, i) => (
          <span
            key={e}
            className="px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors"
            style={i === engineIdx
              ? { background: '#FF8C00', color: '#000' }
              : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
          >
            {ENGINE_LABEL[e]}
          </span>
        ))}
        <span className="ml-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">▲▼ engine</span>
      </div>

      {/* Bottom transport — present, like the slideshow. Progress + prev / play-pause / next, plus the
          current preset name and the control legend. */}
      <div
        className="absolute left-0 right-0 bottom-0 px-12 pb-9 pt-24 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-300"
        style={{ opacity: controls ? 1 : 0 }}
      >
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/[0.06] shrink-0 grid place-items-center">
            {art ? <img src={thumb(art, THUMB.small)} alt="" className="w-full h-full object-cover" /> : <Music2 size={22} className="text-white/30" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-white truncate">{currentTrack?.title || ''}</p>
            <p className="text-base text-white/55 truncate">
              {currentTrack?.artist || ''} <span className="text-white/30">· {ENGINE_LABEL[engine]}: {fxPresetName(engine, presetIndex)}</span>
            </p>
          </div>
          <div className="flex items-center gap-5 shrink-0 text-white/85">
            <button onClick={() => prev()} aria-label="Previous"><SkipBack size={26} fill="currentColor" /></button>
            <button onClick={() => togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'} className="w-14 h-14 rounded-full grid place-items-center" style={{ background: '#FF8C00', color: '#000' }}>
              {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => next()} aria-label="Next"><SkipForward size={26} fill="currentColor" /></button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-white/45 w-11 text-right">{fmt(currentTime)}</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#FF8C00' }} />
          </div>
          <span className="text-[11px] tabular-nums text-white/45 w-11">{fmt(duration)}</span>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mt-4 text-center">
          ◀ ▶ or CH +/− change look · ▲▼ engine · OK play/pause · Back to exit
        </p>
      </div>
    </div>,
    document.body,
  );
};

export default TvFxSurface;
