import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Play, Pause } from 'lucide-react';
import FxStageVisualizers, { type FxEngine, fxPresetName } from '../FxStageVisualizers';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';

/**
 * The FX Stage on a television.
 *
 * The visualizer engines (butterchurn / shader / generator) already exist as FxStageVisualizers —
 * this is just the TV shell around them: a fullscreen takeover fed by the global audio analyser,
 * driven by a handful of remote keys rather than the desktop's control panel.
 *
 * Engine order is chosen for the Mali-G31's fill-rate ceiling (docs/TV_GPU_BENCHMARK.md): SHADER
 * first (the lightest — three built-in fragment shaders), then GENERATOR (the Pixels scenes), and
 * MILKDROP last (butterchurn is the heaviest and only reached deliberately). 30 fps @1080p is the
 * documented comfortable envelope, which SHADER holds; the ramp is DVFS, so it only gets smoother
 * the longer it runs.
 *
 * Keys: OK / ▲▼ cycle the engine, ◀▶ change preset, Play/Pause media key or the on-screen button
 * toggles audio, Back exits. Controls reveal on a press and auto-hide, like the slideshow.
 */

const TV_ENGINES: FxEngine[] = ['SHADER', 'GENERATOR', 'MILKDROP'];
const ENGINE_LABEL: Record<FxEngine, string> = { SHADER: 'Shader', GENERATOR: 'Generator', MILKDROP: 'MilkDrop' };

const TvFxSurface: React.FC = () => {
  const { isTvFxActive, setIsTvFxActive, analyser, isPlaying, togglePlay, currentTrack, isSlideshowActive } = useGlobalPlayer();

  const [engineIdx, setEngineIdx] = useState(0);
  const [presetIndex, setPresetIndex] = useState(0);
  const [controls, setControls] = useState(false);
  const hideTimer = useRef<any>(null);

  const showing = isTvFxActive && !isSlideshowActive;
  const engine = TV_ENGINES[engineIdx];

  const wake = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 4000);
  }, []);

  useEffect(() => {
    if (!showing) return;
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode || e.which;
      if (kc === 24 || kc === 25 || kc === 26 || kc === 164) return;    // volume / mute — system's
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      // Back leaves.
      if (kc === 4 || e.key === 'Backspace' || e.key === 'Escape' || e.key === 'XF86Back' || e.key === 'GoBack') {
        stop(); setIsTvFxActive(false); return;
      }
      // Media play/pause always works.
      if (e.key === 'MediaPlayPause' || kc === 85 || kc === 179) { stop(); togglePlay(); return; }
      stop();
      wake();
      if (e.key === 'ArrowLeft' || kc === 37 || kc === 21) setPresetIndex(i => i - 1);
      else if (e.key === 'ArrowRight' || kc === 39 || kc === 22) setPresetIndex(i => i + 1);
      else if (e.key === 'ArrowUp' || kc === 38 || kc === 19) { setEngineIdx(i => (i + TV_ENGINES.length - 1) % TV_ENGINES.length); setPresetIndex(0); }
      else if (e.key === 'ArrowDown' || kc === 40 || kc === 20) { setEngineIdx(i => (i + 1) % TV_ENGINES.length); setPresetIndex(0); }
      else if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23) setPresetIndex(i => i + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [showing, wake, setIsTvFxActive, togglePlay]);

  // Reset the controls each time the surface opens.
  useEffect(() => { if (!showing) setControls(false); }, [showing]);

  if (!showing) return null;

  return createPortal(
    <div className="fixed inset-0 z-[290] bg-black" data-tv-no-trap role="img" aria-label="FX Stage visualizer">
      <div className="absolute inset-0">
        <Suspense fallback={<div className="w-full h-full grid place-items-center text-white/25 text-xs font-black uppercase tracking-widest">Loading FX Stage…</div>}>
          <FxStageVisualizers engine={engine} presetIndex={presetIndex} analyser={analyser} isPlaying={isPlaying} />
        </Suspense>
      </div>

      {/* Reveal-on-key control strip. */}
      <div
        className="absolute left-0 right-0 bottom-0 px-12 pb-9 pt-24 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-300"
        style={{ opacity: controls ? 1 : 0 }}
      >
        <div className="flex items-center gap-5">
          <span className="w-12 h-12 rounded-full grid place-items-center bg-white/10"><Sparkles size={22} className="text-[#FF8C00]" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-white truncate">{ENGINE_LABEL[engine]} · {fxPresetName(engine, presetIndex)}</p>
            <p className="text-sm text-white/50 truncate">{currentTrack?.title || 'FX Stage'}{currentTrack?.artist ? ` — ${currentTrack.artist}` : ''}</p>
          </div>
          <button onClick={() => togglePlay()} className="w-12 h-12 rounded-full grid place-items-center shrink-0" style={{ background: '#FF8C00', color: '#000' }}>
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
          </button>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mt-4 text-center">
          ▲▼ engine · ◀▶ preset · OK next · Back to exit
        </p>
      </div>
    </div>,
    document.body,
  );
};

export default TvFxSurface;
