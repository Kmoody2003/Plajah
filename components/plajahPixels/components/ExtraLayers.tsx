// ExtraLayers — user-loadable overlay layers (Lottie + sandboxed HTML/URL), a
// LayersPanel to drive them, and an FPS meter. These composite ON TOP of the
// core visual.

import React, { useEffect, useRef, useState } from 'react';
import { Film, Globe, Activity } from 'lucide-react';

// ─── Lottie overlay (dotLottie — plays .lottie and .json) ─────────────────────
export const LottieLayer: React.FC<{ src: string; opacity: number }> = ({ src, opacity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current; if (!canvas) return;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      try {
        const mod = await import('@lottiefiles/dotlottie-web');
        if (cancelled) return;
        const DotLottie = (mod as any).DotLottie;
        instRef.current = new DotLottie({ canvas, src, loop: true, autoplay: true });
      } catch (e) { console.warn('[Plajah Pixels] Lottie failed to load:', e); }
    })();
    const resize = () => { const c = canvasRef.current; if (c) { c.width = window.innerWidth; c.height = window.innerHeight; } try { instRef.current?.resize?.(); } catch { /* */ } };
    window.addEventListener('resize', resize);
    return () => { cancelled = true; window.removeEventListener('resize', resize); try { instRef.current?.destroy?.(); } catch { /* */ } };
  }, [src]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 6, opacity, mixBlendMode: 'screen' }} />;
};

// ─── HTML / URL overlay (sandboxed iframe) ────────────────────────────────────
export const HtmlLayer: React.FC<{ src: string; opacity: number; interactive: boolean }> = ({ src, opacity, interactive }) => (
  <iframe
    src={src}
    title="custom-html-layer"
    className="absolute inset-0 w-full h-full border-0"
    style={{ zIndex: 5, opacity, pointerEvents: interactive ? 'auto' : 'none', mixBlendMode: 'screen', background: 'transparent' }}
    sandbox="allow-scripts allow-same-origin allow-popups"
    referrerPolicy="no-referrer"
  />
);

// ─── FPS meter HUD ────────────────────────────────────────────────────────────
export const FpsMeter: React.FC = () => {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0, frames = 0, last = performance.now();
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) { setFps(Math.round((frames * 1000) / (now - last))); frames = 0; last = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const color = fps >= 55 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171';
  return (
    <div className="fixed top-6 left-6 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/55 backdrop-blur-xl border border-white/10 pointer-events-none">
      <Activity className="w-3 h-3" style={{ color }} />
      <span className="text-[10px] font-black tabular-nums" style={{ color }}>{fps} FPS</span>
    </div>
  );
};

// ─── Layers panel (drive the Lottie + HTML overlays) ──────────────────────────
export interface OverlayState {
  lottieUrl: string; lottieOn: boolean; lottieOpacity: number;
  htmlUrl: string; htmlOn: boolean; htmlOpacity: number; htmlInteractive: boolean;
  set: (patch: Partial<Omit<OverlayState, 'set'>>) => void;
}

export const LayersPanel: React.FC<{ state: OverlayState }> = ({ state }) => {
  const [lottieDraft, setLottieDraft] = useState(state.lottieUrl);
  const [htmlDraft, setHtmlDraft] = useState(state.htmlUrl);
  return (
    <div className="w-[300px] max-w-[92vw] bg-black/75 backdrop-blur-2xl border border-white/10 border-t-0 rounded-b-2xl shadow-2xl p-3 space-y-4">
      {/* Lottie */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5"><Film className="w-3.5 h-3.5 text-pink-300" /><span className="text-[9px] font-black uppercase tracking-widest text-white/60">Lottie (.lottie / .json)</span></div>
        <input
          value={lottieDraft}
          onChange={e => setLottieDraft(e.target.value)}
          placeholder="https://…/animation.lottie"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-white/25 outline-none focus:border-white/25"
        />
        <div className="flex items-center gap-2">
          <button onClick={() => state.set({ lottieUrl: lottieDraft, lottieOn: !!lottieDraft })} className="flex-1 py-1.5 rounded-lg bg-pink-600/30 hover:bg-pink-600/50 border border-pink-400/30 text-[9px] font-black uppercase tracking-widest text-white transition-all">Load</button>
          <button onClick={() => state.set({ lottieOn: !state.lottieOn })} disabled={!state.lottieUrl} className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${state.lottieOn ? 'bg-white/15 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/60'}`}>{state.lottieOn ? 'On' : 'Off'}</button>
        </div>
        <input type="range" min={0} max={1} step={0.05} value={state.lottieOpacity} onChange={e => state.set({ lottieOpacity: parseFloat(e.target.value) })} className="w-full h-1 accent-pink-400" />
      </div>

      <div className="h-px bg-white/10" />

      {/* HTML / URL */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-cyan-300" /><span className="text-[9px] font-black uppercase tracking-widest text-white/60">HTML / URL layer</span></div>
        <input
          value={htmlDraft}
          onChange={e => setHtmlDraft(e.target.value)}
          placeholder="https://…  (sandboxed)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-white/25 outline-none focus:border-white/25"
        />
        <div className="flex items-center gap-2">
          <button onClick={() => state.set({ htmlUrl: htmlDraft, htmlOn: !!htmlDraft })} className="flex-1 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400/30 text-[9px] font-black uppercase tracking-widest text-white transition-all">Load</button>
          <button onClick={() => state.set({ htmlOn: !state.htmlOn })} disabled={!state.htmlUrl} className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${state.htmlOn ? 'bg-white/15 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/60'}`}>{state.htmlOn ? 'On' : 'Off'}</button>
        </div>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={1} step={0.05} value={state.htmlOpacity} onChange={e => state.set({ htmlOpacity: parseFloat(e.target.value) })} className="flex-1 h-1 accent-cyan-400" />
          <button onClick={() => state.set({ htmlInteractive: !state.htmlInteractive })} className={`text-[8px] font-black uppercase tracking-widest transition-colors ${state.htmlInteractive ? 'text-cyan-300' : 'text-white/30 hover:text-white'}`}>{state.htmlInteractive ? 'Interactive' : 'Pass-thru'}</button>
        </div>
      </div>
    </div>
  );
};
