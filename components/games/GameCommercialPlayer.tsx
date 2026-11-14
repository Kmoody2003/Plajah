import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Sparkles, ExternalLink, ChevronLeft, ChevronRight, Tv } from 'lucide-react';
import type { PlajahGameEntry, CommercialScene } from '../../data/plajahGamesCatalog';

interface GameCommercialPlayerProps {
  game: PlajahGameEntry;
  onPlayNow: (game: PlajahGameEntry) => void;
  onOpenPage?: (game: PlajahGameEntry) => void;
  onNextAd?: () => void;
  onPrevAd?: () => void;
  compact?: boolean;
  autoAdvance?: boolean;
}

/**
 * Broadcast-style commercial player featuring captured gameplay screenshots + live
 * procedural HTML5 Canvas gameplay motion, kinetic ad copy, and a direct "Play Now" CTA.
 */
export const GameCommercialPlayer: React.FC<GameCommercialPlayerProps> = ({
  game,
  onPlayNow,
  onOpenPage,
  onNextAd,
  onPrevAd,
  compact = false,
  autoAdvance = true,
}) => {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const scenes = game.commercial.scenes;
  const activeScene: CommercialScene = scenes[sceneIdx % scenes.length] ?? scenes[0];
  const sceneDurationMs = Math.max(3200, Math.round((game.commercial.durationSec * 1000) / Math.max(1, scenes.length)));

  useEffect(() => {
    setSceneIdx(0);
    setProgress(0);
  }, [game.id]);

  // Scene timer + auto-advance across scenes (and optionally to next ad)
  useEffect(() => {
    if (!playing) return;
    const tickMs = 60;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + (tickMs / sceneDurationMs) * 100;
        if (next >= 100) {
          if (sceneIdx + 1 < scenes.length) {
            setSceneIdx((i) => i + 1);
            return 0;
          }
          if (autoAdvance && onNextAd) {
            onNextAd();
            return 0;
          }
          setSceneIdx(0);
          return 0;
        }
        return next;
      });
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [playing, sceneIdx, scenes.length, sceneDurationMs, autoAdvance, onNextAd]);

  // Optional subtle WebAudio synth stinger when unmuted
  useEffect(() => {
    if (muted || !playing) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const freqs = [220, 277.18, 329.63, 440];
      osc.frequency.value = freqs[sceneIdx % freqs.length];
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.58);
    } catch {
      // Ignore audio autoplay blocks
    }
  }, [muted, playing, sceneIdx, game.id]);

  // Procedural captured-gameplay canvas animation layer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const mode = activeScene.canvasMode ?? 'kart';
      const accent = activeScene.accentColor || game.accentColor || '#f97316';

      // Subtle scanline / arena grid
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (mode === 'kart' || mode === 'kombat') {
        // Speed lines & 3D road horizon
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, h * 0.52, w, h * 0.48);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * 0.42, h * 0.52);
        ctx.lineTo(w * 0.08, h);
        ctx.moveTo(w * 0.58, h * 0.52);
        ctx.lineTo(w * 0.92, h);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const p = ((t * 1.4 + i / 6) % 1);
          const y = h * 0.52 + p * p * h * 0.48;
          ctx.fillStyle = i % 2 === 0 ? accent : '#ffffff';
          ctx.globalAlpha = 0.25 + p * 0.6;
          ctx.fillRect(w * 0.5 - 3, y, 6, 8 + p * 18);
        }
        ctx.globalAlpha = 1;
        // Kart silhouettes
        const kx = w * 0.5 + Math.sin(t * 2.2) * 55;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(kx - 26, h * 0.78, 52, 24, 8);
        ctx.fill();
      } else if (mode === 'ttt') {
        // Neon 3x3 board
        const size = Math.min(w, h) * 0.46;
        const bx = w * 0.62 - size / 2;
        const by = h * 0.5 - size / 2;
        ctx.strokeStyle = 'rgba(34,211,238,0.65)';
        ctx.lineWidth = 4;
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(bx + (size / 3) * i, by);
          ctx.lineTo(bx + (size / 3) * i, by + size);
          ctx.moveTo(bx, by + (size / 3) * i);
          ctx.lineTo(bx + size, by + (size / 3) * i);
          ctx.stroke();
        }
        const marks = ['X', 'O', 'X', '', 'X', 'O', '', '', 'X'];
        const visibleCount = Math.floor((t * 1.8) % 9) + 1;
        ctx.font = `900 ${Math.round(size / 4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        marks.slice(0, visibleCount).forEach((m, idx) => {
          if (!m) return;
          const col = idx % 3;
          const row = Math.floor(idx / 3);
          ctx.fillStyle = m === 'X' ? '#22d3ee' : '#e879f9';
          ctx.fillText(m, bx + (col + 0.5) * (size / 3), by + (row + 0.5) * (size / 3));
        });
      } else if (mode === 'rhythm') {
        // 4 beat lanes
        const lanes = 4;
        for (let l = 0; l < lanes; l++) {
          const lx = w * 0.52 + l * 46;
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lx, 30);
          ctx.lineTo(lx, h - 40);
          ctx.stroke();
          const ny = ((t * 140 + l * 70) % (h - 90)) + 30;
          ctx.fillStyle = l % 2 === 0 ? '#f472b6' : '#fbbf24';
          ctx.beginPath();
          ctx.arc(lx, ny, 11, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (mode === 'sketch') {
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const pts = 32;
        const maxPts = Math.floor(((t * 10) % pts) + 2);
        for (let i = 0; i < maxPts; i++) {
          const px = w * 0.52 + Math.cos(i * 0.35) * 65 + i * 3;
          const py = h * 0.45 + Math.sin(i * 0.5) * 45;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (mode === 'tennis' || mode === 'crystals' || mode === 'quest' || mode === 'trivia' || mode === 'crowd' || mode === 'impostor') {
        // Dynamic particles / rally orbs
        for (let i = 0; i < 10; i++) {
          const px = (w * 0.55) + Math.cos(t * (1.2 + i * 0.15) + i) * 90;
          const py = (h * 0.5) + Math.sin(t * (1.5 + i * 0.1) + i * 2) * 55;
          ctx.fillStyle = i % 2 === 0 ? accent : '#ffffff';
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(px, py, 4 + (i % 3) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (playing) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [activeScene, game.accentColor, playing]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[2rem] border border-white/15 bg-black shadow-2xl ${
        compact ? 'aspect-[16/9]' : 'min-h-[340px] sm:min-h-[400px]'
      }`}
    >
      {/* Captured gameplay screenshot background with Ken Burns motion */}
      {activeScene.imageUrl ? (
        <img
          key={activeScene.imageUrl + sceneIdx}
          src={activeScene.imageUrl}
          alt={activeScene.headline}
          className="absolute inset-0 w-full h-full object-cover opacity-75 transition-transform duration-[4000ms] ease-out scale-105"
        />
      ) : (
        <div
          className={`absolute inset-0 bg-gradient-to-br ${game.accentGradient}`}
        />
      )}

      {/* Live procedural gameplay canvas overlay */}
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Cinematic vignette */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/25 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40 pointer-events-none" />

      {/* Top broadcast bar */}
      <div className="relative z-10 flex items-center justify-between gap-2 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-black uppercase tracking-widest shadow">
            <Tv size={11} /> Commercial
          </span>
          <span
            className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border"
            style={{
              backgroundColor: `${activeScene.accentColor}22`,
              borderColor: `${activeScene.accentColor}66`,
              color: activeScene.accentColor,
            }}
          >
            {activeScene.callout}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-[10px] font-bold text-white/75">
            <Sparkles size={10} /> {game.commercial.musicVibe}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onPrevAd && (
            <button
              type="button"
              onClick={onPrevAd}
              className="p-2 rounded-full bg-black/60 hover:bg-white/20 text-white border border-white/15"
              title="Previous Commercial"
            >
              <ChevronLeft size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="p-2 rounded-full bg-black/60 hover:bg-white/20 text-white border border-white/15"
            title={playing ? 'Pause Commercial' : 'Play Commercial'}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="p-2 rounded-full bg-black/60 hover:bg-white/20 text-white border border-white/15"
            title={muted ? 'Unmute Commercial Synth' : 'Mute'}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          {onNextAd && (
            <button
              type="button"
              onClick={onNextAd}
              className="p-2 rounded-full bg-black/60 hover:bg-white/20 text-white border border-white/15"
              title="Next Commercial"
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Main kinetic ad copy + Play Now CTA */}
      <div className="relative z-10 px-5 sm:px-8 pb-6 pt-6 sm:pt-12 flex flex-col justify-end h-[calc(100%-64px)]">
        <div className="max-w-xl">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">
            {game.title} · {game.categoryLabel}
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.05]">
            {activeScene.headline}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-white/80 font-medium">
            {activeScene.subline}
          </p>
          <p className="mt-1 text-[11px] font-black uppercase tracking-widest text-amber-300/90">
            {game.commercial.tagline}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onPlayNow(game)}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-black font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-transform shadow-xl"
            >
              <Play size={16} fill="currentColor" /> Play Now
            </button>
            {onOpenPage && (
              <button
                type="button"
                onClick={() => onOpenPage(game)}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-xs uppercase tracking-widest transition-colors"
              >
                <ExternalLink size={14} /> Game Page & Captures
              </button>
            )}
          </div>
        </div>

        {/* Scene progress segments */}
        <div className="mt-6 flex items-center gap-2">
          {scenes.map((sc, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSceneIdx(i);
                setProgress(0);
              }}
              aria-label={`Scene ${i + 1}: ${sc.headline}`}
              className="h-1.5 flex-1 rounded-full bg-white/20 overflow-hidden"
            >
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: i < sceneIdx ? '100%' : i === sceneIdx ? `${progress}%` : '0%',
                  backgroundColor: activeScene.accentColor,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GameCommercialPlayer;
