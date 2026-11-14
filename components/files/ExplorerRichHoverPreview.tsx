// components/files/ExplorerRichHoverPreview.tsx
// Fast, single-decoder, bounded-memory rich media thumbnails & smart hover previews for Plajah Explorer.
// Supports:
//   • Lazy IntersectionObserver thumbnails for List & Grid rows
//   • Video hover playback inside thumbnails + large scrubbable hover card (single active <video>)
//   • Comic (.cbz/.comic/.pjc/.manga) animated panel motion + embedded loop inside thumbnails & hover card
//   • Tela (.tela/.tdoc/.tela-page.json) real TelaEmbed preview + reveal/template/motion-graphic animations
//   • Photo large crisp hover preview card with resolution metadata
//   • Audio (Chora) hover autoplay + Chora ScrollingWaveform + live Visualizer + Mini Transport Deck

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Disc3,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Music,
  Pause,
  Pin,
  PinOff,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { TelaMotionTemplateSpec } from '../../types';
import { renderMotionTemplateAt } from '../../services/tela/telaMotionTemplate';
import { formatBytes } from '../../services/drive/client';
import { classifyPlajahRichKind } from '../../services/files/unifiedVfs';
import {
  choraHoverAudio,
  loadAudioWaveformPeaks,
  loadRichComicPreview,
  loadRichTelaPreview,
  previewCacheKeyFor,
  type ChoraHoverAudioState,
  type ComicPreviewData,
  type PreviewSourceTarget,
  type TelaPreviewSummary,
} from '../../services/files/richPreviewCache';
import { TELA_MOTION_CSS, TelaReveal, playReveal } from '../tela/telaMotion';
import ScrollingWaveform from '../ScrollingWaveform';
import Visualizer from '../Visualizer';

const TelaEmbed = lazy(() => import('../tela/TelaEmbed'));

// Inject subtle comic Ken-Burns & reveal utility keyframes once
const RICH_HOVER_STYLE_ID = 'plajah-explorer-rich-hover-css';
function ensureHoverStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(RICH_HOVER_STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = RICH_HOVER_STYLE_ID;
  st.textContent = `
    @keyframes plajahComicKenBurns {
      0% { transform: scale(1.0) translate3d(0%, 0%, 0); }
      50% { transform: scale(1.09) translate3d(-1.5%, -1.2%, 0); }
      100% { transform: scale(1.03) translate3d(1.2%, -0.8%, 0); }
    }
    @keyframes plajahTelaFloat {
      0%, 100% { transform: translateY(0px) scale(1); }
      50% { transform: translateY(-3px) scale(1.012); }
    }
    @keyframes plajahEqBounce {
      0%, 100% { transform: scaleY(0.28); }
      50% { transform: scaleY(0.95); }
    }
    ${TELA_MOTION_CSS}
  `;
  document.head.appendChild(st);
}

function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useInViewport<T extends HTMLElement>(ref: React.RefObject<T | null>, rootMargin = '140px'): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  return visible;
}

// ── Live Canvas Player for MOTION_TEMPLATE objects embedded inside .tela docs ───────────────────

const MotionTemplateLiveCanvas: React.FC<{
  spec: TelaMotionTemplateSpec;
  width: number;
  height: number;
  className?: string;
}> = ({ spec, width, height, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderMotionTemplateAt(ctx, spec, t, width, height, { backdrop: true });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [spec, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={`rounded-lg border border-white/15 bg-black/50 ${className}`}
    />
  );
};

// ── 1. ExplorerEntryThumb (Lazy IO Thumbnail + Hover Motion inside the List/Grid tile) ──────────

export interface ExplorerEntryThumbProps {
  entry: PreviewSourceTarget & { isDirectory?: boolean; thumbUrl?: string; mediaKind?: string };
  variant: 'list' | 'grid';
  isHovered: boolean;
  hoverMotionEnabled: boolean;
  iconFallback: React.ReactNode;
}

export const ExplorerEntryThumb: React.FC<ExplorerEntryThumbProps> = React.memo(({
  entry,
  variant,
  isHovered,
  hoverMotionEnabled,
  iconFallback,
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inView = useInViewport(boxRef);
  const [imgFailed, setImgFailed] = useState(false);
  const [comicData, setComicData] = useState<ComicPreviewData | null>(null);
  const [comicFrameIdx, setComicFrameIdx] = useState(0);

  useEffect(() => {
    ensureHoverStyles();
  }, []);

  const richKind = useMemo(
    () => (entry.isDirectory ? null : classifyPlajahRichKind(entry.name, entry.mimeType)),
    [entry.name, entry.mimeType, entry.isDirectory],
  );

  // Only decode comic preview frames on hover (or when visible in grid if no OS shell thumb exists)
  useEffect(() => {
    if (richKind !== 'COMIC' || !inView) return;
    const shouldFetch = (isHovered && hoverMotionEnabled) || (variant === 'grid' && !entry.thumbUrl);
    if (!shouldFetch) return;
    const ac = new AbortController();
    loadRichComicPreview(entry, ac.signal).then(res => {
      if (res && !ac.signal.aborted) setComicData(res);
    });
    return () => ac.abort();
  }, [richKind, inView, isHovered, hoverMotionEnabled, variant, entry.id, entry.streamUrl, entry.thumbUrl]);

  // Cycle comic frames while hovered to show motion right inside the Explorer thumbnail
  useEffect(() => {
    if (richKind !== 'COMIC' || !isHovered || !hoverMotionEnabled || !comicData) {
      setComicFrameIdx(0);
      return;
    }
    if (comicData.videoLoopUrl || comicData.pageUrls.length <= 1) return;
    const timer = window.setInterval(() => {
      setComicFrameIdx(idx => (idx + 1) % comicData.pageUrls.length);
    }, 1050);
    return () => window.clearInterval(timer);
  }, [richKind, isHovered, hoverMotionEnabled, comicData]);

  const staticImgUrl = useMemo(() => {
    if (entry.isDirectory || imgFailed) return undefined;
    if (richKind === 'COMIC') return comicData?.pageUrls[comicFrameIdx] || entry.thumbUrl;
    if (richKind === 'IMAGE') return entry.thumbUrl || entry.streamUrl;
    if (richKind === 'VIDEO') return entry.thumbUrl;
    return undefined;
  }, [entry.isDirectory, entry.thumbUrl, entry.streamUrl, richKind, comicData, comicFrameIdx, imgFailed]);

  const activeVideoSrc =
    hoverMotionEnabled && isHovered && richKind === 'VIDEO' && entry.streamUrl
      ? entry.streamUrl
      : hoverMotionEnabled && isHovered && richKind === 'COMIC' && comicData?.videoLoopUrl
        ? comicData.videoLoopUrl
        : undefined;

  const boxClass =
    variant === 'grid'
      ? 'w-full h-full relative flex items-center justify-center overflow-hidden bg-black/40'
      : 'w-9 h-9 rounded-lg relative flex items-center justify-center overflow-hidden bg-white/[0.04] border border-white/10 shrink-0';

  return (
    <div ref={boxRef} className={boxClass}>
      {/* Active hovered Video or Comic Motion Loop (strictly ONE tile at a time) */}
      {activeVideoSrc ? (
        <video
          key={activeVideoSrc}
          src={activeVideoSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
      ) : inView && staticImgUrl ? (
        <img
          src={staticImgUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          style={
            richKind === 'COMIC' && isHovered && hoverMotionEnabled
              ? { animation: 'plajahComicKenBurns 3.4s ease-in-out infinite alternate' }
              : undefined
          }
          className={`w-full h-full object-cover transition-transform duration-300 ${
            richKind === 'IMAGE' && isHovered ? 'scale-105' : ''
          }`}
        />
      ) : richKind === 'TELA_DOC' ? (
        <div
          style={
            isHovered && hoverMotionEnabled
              ? { animation: 'plajahTelaFloat 1.8s ease-in-out infinite' }
              : undefined
          }
          className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-amber-500/10"
        >
          <Sparkles size={variant === 'grid' ? 26 : 16} className="text-indigo-300" />
          {variant === 'grid' && (
            <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-indigo-200/80">
              Tela Motion
            </span>
          )}
        </div>
      ) : richKind === 'AUDIO' ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-500/15 via-pink-500/10 to-black/40 relative">
          {isHovered && hoverMotionEnabled ? (
            <div className="flex items-end gap-0.5 h-4">
              {[0, 1, 2, 3].map(bar => (
                <span
                  key={bar}
                  style={{
                    animation: `plajahEqBounce ${0.42 + bar * 0.11}s ease-in-out ${bar * 0.08}s infinite`,
                    transformOrigin: 'bottom',
                  }}
                  className="w-1 h-full rounded-full bg-gradient-to-t from-orange-500 to-pink-400"
                />
              ))}
            </div>
          ) : (
            <Music size={variant === 'grid' ? 28 : 16} className="text-orange-400" />
          )}
        </div>
      ) : (
        iconFallback
      )}

      {/* Subtle motion pills on Grid cards */}
      {variant === 'grid' && isHovered && hoverMotionEnabled && (richKind === 'COMIC' || richKind === 'VIDEO' || richKind === 'TELA_DOC') && (
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 border border-white/15 text-[9px] font-bold tracking-wide text-amber-300 backdrop-blur-sm">
          {richKind === 'COMIC' ? 'MOTION COMIC' : richKind === 'VIDEO' ? 'LIVE CLIP' : 'TELA LIVE'}
        </span>
      )}
    </div>
  );
});

ExplorerEntryThumb.displayName = 'ExplorerEntryThumb';

// ── 2. Reusable Tela Rich Preview Body (used in Hover Popover AND Unified Stage) ────────────────

export const TelaRichPreviewCard: React.FC<{
  summary: TelaPreviewSummary | null;
  loading: boolean;
  title: string;
  width?: number;
  maxHeightClass?: string;
}> = ({ summary, loading, title, width = 360, maxHeightClass = 'max-h-[300px]' }) => {
  const revealWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureHoverStyles();
    if (revealWrapRef.current && summary) {
      playReveal(revealWrapRef.current);
    }
  }, [summary?.doc?.id]);

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-2 text-xs text-white/60">
        <Sparkles size={22} className="text-indigo-400 animate-spin" />
        <span>Rendering Tela document & motion layers…</span>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-5 flex flex-col items-center justify-center gap-2 text-center text-xs text-white/55">
        <FileText size={26} className="text-indigo-300" />
        <div className="font-semibold text-white/85 truncate max-w-full">{title}</div>
        <span>Tela document preview unavailable for this file slice.</span>
      </div>
    );
  }

  const firstMotion = summary.motionTemplateSpecs[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles size={13} className="text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-white truncate">{summary.doc.title || title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 text-[9px] font-bold">
            {summary.doc.frames.length} {summary.doc.frames.length === 1 ? 'FRAME' : 'FRAMES'}
          </span>
          {summary.hasAnyAnimation && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[9px] font-bold">
              ANIMATED
            </span>
          )}
        </div>
      </div>

      {summary.motionLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {summary.motionLabels.map(lbl => (
            <span
              key={lbl}
              className="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-[9px] font-medium text-purple-200"
            >
              {lbl}
            </span>
          ))}
        </div>
      )}

      <div
        ref={revealWrapRef}
        className={`relative rounded-xl border border-white/12 bg-black/50 overflow-auto p-2 flex flex-col items-center gap-2 ${maxHeightClass}`}
      >
        <TelaReveal
          enabled={true}
          style={
            summary.hasTemplateMotion
              ? { animation: 'plajahTelaFloat 3s ease-in-out infinite' }
              : undefined
          }
          className="w-full flex justify-center"
        >
          <Suspense
            fallback={
              <div className="py-10 text-xs text-white/50">Mounting Tela engine…</div>
            }
          >
            <div data-tela-reveal="" className="rounded-lg overflow-hidden shadow-lg">
              <TelaEmbed
                snapshot={summary.doc}
                docId={summary.doc.id}
                mode="pinned"
                width={width}
                className="pointer-events-none select-none"
              />
            </div>
          </Suspense>
        </TelaReveal>

        {firstMotion && (
          <div className="w-full flex flex-col items-center gap-1 pt-1 border-t border-white/10">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
              Live Motion Graphic Layer
            </span>
            <MotionTemplateLiveCanvas
              spec={firstMotion}
              width={Math.min(width, 320)}
              height={160}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ── 3. Reusable Comic Motion Preview Body (used in Hover Popover AND Unified Stage) ──────────────

export const ComicRichPreviewCard: React.FC<{
  comic: ComicPreviewData | null;
  loading: boolean;
  title: string;
  heightClass?: string;
}> = ({ comic, loading, title, heightClass = 'h-64' }) => {
  const [pageIdx, setPageIdx] = useState(0);
  const [autoMotion, setAutoMotion] = useState(true);

  useEffect(() => {
    ensureHoverStyles();
    setPageIdx(0);
  }, [title, comic]);

  useEffect(() => {
    if (!comic || !autoMotion || comic.videoLoopUrl || comic.pageUrls.length <= 1) return;
    const id = window.setInterval(() => {
      setPageIdx(p => (p + 1) % comic.pageUrls.length);
    }, 1500);
    return () => window.clearInterval(id);
  }, [comic, autoMotion]);

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-2 text-xs text-white/60">
        <BookOpen size={22} className="text-rose-400 animate-pulse" />
        <span>Extracting comic panels & motion…</span>
      </div>
    );
  }

  if (!comic) {
    return (
      <div className="p-5 flex flex-col items-center justify-center gap-2 text-center text-xs text-white/55">
        <BookOpen size={26} className="text-rose-300" />
        <div className="font-semibold text-white/85 truncate max-w-full">{title}</div>
        <span>Compressed comic archive ready to open on Stage.</span>
      </div>
    );
  }

  const currentUrl = comic.pageUrls[pageIdx];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen size={13} className="text-rose-400 shrink-0" />
          <span className="text-xs font-semibold text-white truncate">{comic.title || title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 text-[9px] font-bold">
            {comic.totalPageCount} PAGES
          </span>
          {comic.hasMotion && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[9px] font-bold">
              MOTION
            </span>
          )}
        </div>
      </div>

      <div className={`relative w-full ${heightClass} rounded-xl border border-white/12 bg-black overflow-hidden flex items-center justify-center`}>
        {comic.videoLoopUrl ? (
          <video
            src={comic.videoLoopUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        ) : currentUrl ? (
          <img
            key={currentUrl}
            src={currentUrl}
            alt={`Page ${pageIdx + 1}`}
            style={
              autoMotion
                ? { animation: 'plajahComicKenBurns 3.6s ease-in-out infinite alternate' }
                : undefined
            }
            className="w-full h-full object-contain select-none"
          />
        ) : null}

        {comic.sfxLabels.length > 0 && (
          <div className="absolute top-2 left-2 flex gap-1">
            {comic.sfxLabels.map((sfx, idx) => (
              <span
                key={`${sfx}-${idx}`}
                className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black tracking-wide shadow"
              >
                {sfx}
              </span>
            ))}
          </div>
        )}

        {comic.pageUrls.length > 1 && !comic.videoLoopUrl && (
          <div className="absolute bottom-2 inset-x-2 flex items-center justify-between px-2 py-1 rounded-lg bg-black/75 border border-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-1">
              {comic.pageUrls.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPageIdx(i)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    i === pageIdx ? 'w-4 bg-amber-400' : 'w-1.5 bg-white/30 hover:bg-white/60'
                  }`}
                  title={`Panel ${i + 1}`}
                />
              ))}
              <span className="ml-1 text-[10px] font-mono text-white/70">
                {pageIdx + 1}/{comic.pageUrls.length}
              </span>
            </div>
            <button
              onClick={() => setAutoMotion(m => !m)}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white cursor-pointer flex items-center gap-1"
            >
              {autoMotion ? <Pause size={10} /> : <Play size={10} />}
              {autoMotion ? 'Pause' : 'Motion'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 4. Reusable Chora Audio Mini Transport + Waveform + Visualizer Deck ────────────────────────

export const ChoraRichAudioDeck: React.FC<{
  entry: PreviewSourceTarget;
  autoplayOnHover: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onToggleAutoplay: () => void;
  onSendToChora?: () => void;
}> = ({
  entry,
  autoplayOnHover,
  pinned,
  onTogglePin,
  onToggleAutoplay,
  onSendToChora,
}) => {
  const [audioState, setAudioState] = useState<ChoraHoverAudioState>(() => choraHoverAudio.getState());
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const trackKey = previewCacheKeyFor('chora', entry);

  useEffect(() => choraHoverAudio.subscribe(setAudioState), []);

  useEffect(() => {
    const url = entry.streamUrl || entry.url || entry.downloadUrl;
    if (url) {
      void choraHoverAudio.playHoverTrack(trackKey, url, autoplayOnHover);
    }
    const ac = new AbortController();
    loadAudioWaveformPeaks(entry, 72, ac.signal).then(res => {
      if (!ac.signal.aborted) setPeaks(res.peaks);
    });
    return () => ac.abort();
  }, [trackKey, entry.streamUrl, entry.url, entry.downloadUrl, autoplayOnHover]);

  const isThisTrack = audioState.trackKey === trackKey;
  const isPlaying = isThisTrack && audioState.playing;
  const ct = isThisTrack ? audioState.currentTime : 0;
  const dur = isThisTrack ? audioState.duration : 0;
  const displayName = entry.name.replace(/\.[^/.]+$/, '');

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shrink-0 ${isPlaying ? 'shadow-[0_0_16px_rgba(255,140,0,0.45)]' : ''}`}>
            <Disc3 size={15} className={`text-white ${isPlaying ? 'animate-spin' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{displayName}</div>
            <div className="text-[10px] text-orange-300/80 font-mono truncate">
              Plajah Chora Deck {entry.size ? `• ${formatBytes(entry.size)}` : ''}
            </div>
          </div>
        </div>
        <button
          onClick={onTogglePin}
          className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 border cursor-pointer shrink-0 ${
            pinned
              ? 'bg-orange-500/20 border-orange-400/50 text-orange-200'
              : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
          }`}
          title={pinned ? 'Unpin preview playback' : 'Pin mini player so it keeps playing'}
        >
          {pinned ? <PinOff size={11} /> : <Pin size={11} />}
          {pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>

      {/* Live Chora Visualizer + ScrollingWaveform Stage */}
      <div className="relative w-full h-36 rounded-xl overflow-hidden border border-orange-500/25 bg-[#09080E]">
        <Visualizer
          analyser={choraHoverAudio.getAnalyser()}
          themeColor="#FF8C00"
          trackTitle={displayName}
          artist="Chora Explorer Preview"
          isPlaying={isPlaying}
          simplified={true}
          alwaysAnimate={isPlaying}
        />
        <ScrollingWaveform
          currentTime={ct}
          duration={dur || 1}
          trackId={trackKey}
          isPlaying={isPlaying}
          peaks={peaks}
          onScratchBy={delta => choraHoverAudio.skipBy(delta)}
        />
        {audioState.autoplayBlocked && isThisTrack && !isPlaying && (
          <button
            onClick={() => choraHoverAudio.resumePlayback()}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 hover:bg-black/45 transition-colors cursor-pointer"
          >
            <span className="px-3 py-1.5 rounded-full bg-orange-500 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg">
              <Play size={13} /> Click to Enable Hover Autoplay
            </span>
          </button>
        )}
      </div>

      {/* Scrub & Time */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-white/65 w-9 text-right">{fmtClock(ct)}</span>
        <input
          type="range"
          min={0}
          max={dur || 1}
          step={0.1}
          value={Math.min(ct, dur || 1)}
          onChange={e => choraHoverAudio.seekTo(parseFloat(e.target.value))}
          className="flex-1 accent-orange-500 cursor-pointer h-1"
        />
        <span className="text-[10px] font-mono text-white/65 w-9">{fmtClock(dur)}</span>
      </div>

      {/* Mini Chora Transport */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => choraHoverAudio.skipBy(-10)}
            className="px-1.5 py-1 rounded-md bg-white/5 hover:bg-white/12 text-[10px] font-mono text-white/80 cursor-pointer flex items-center gap-0.5"
            title="Rewind 10s"
          >
            <RotateCcw size={11} /> 10
          </button>
          <button
            onClick={() => choraHoverAudio.togglePlay()}
            className="px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white hover:brightness-110 text-xs font-bold cursor-pointer flex items-center gap-1 shadow"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            onClick={() => choraHoverAudio.skipBy(10)}
            className="px-1.5 py-1 rounded-md bg-white/5 hover:bg-white/12 text-[10px] font-mono text-white/80 cursor-pointer flex items-center gap-0.5"
            title="Forward 10s"
          >
            10 <RotateCw size={11} />
          </button>
          <button
            onClick={() => choraHoverAudio.toggleMute()}
            className="p-1.5 rounded-md hover:bg-white/10 text-white/75 cursor-pointer"
            title={audioState.muted ? 'Unmute' : 'Mute'}
          >
            {audioState.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleAutoplay}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold border cursor-pointer ${
              autoplayOnHover
                ? 'bg-orange-500/15 border-orange-500/40 text-orange-200'
                : 'bg-white/5 border-white/10 text-white/60'
            }`}
            title="Toggle automatic Chora playback on hover"
          >
            Auto: {autoplayOnHover ? 'ON' : 'OFF'}
          </button>
          {onSendToChora && (
            <button
              onClick={onSendToChora}
              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/18 text-[10px] font-semibold text-white cursor-pointer flex items-center gap-1"
              title="Open track in full Chora Player"
            >
              <ExternalLink size={11} /> Chora
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── 5. Floating Smart Hover Popover (Photo / Video / Comic / Tela / Chora Song) ────────────────

export interface ExplorerRichHoverPreviewProps {
  entry: (PreviewSourceTarget & { isDirectory?: boolean; thumbUrl?: string }) | null;
  anchorRect: { left: number; top: number; right: number; bottom: number } | null;
  autoplayAudioOnHover: boolean;
  pinnedAudioEntry: (PreviewSourceTarget & { isDirectory?: boolean; thumbUrl?: string }) | null;
  onToggleAutoplayAudio: () => void;
  onPinAudioEntry: (entry: (PreviewSourceTarget & { isDirectory?: boolean; thumbUrl?: string }) | null) => void;
  onCardPointerEnter: () => void;
  onCardPointerLeave: () => void;
  onOpenStage: (entry: PreviewSourceTarget) => void;
  onSendToChora?: (entry: PreviewSourceTarget) => void;
}

export const ExplorerRichHoverPreview: React.FC<ExplorerRichHoverPreviewProps> = ({
  entry,
  anchorRect,
  autoplayAudioOnHover,
  pinnedAudioEntry,
  onToggleAutoplayAudio,
  onPinAudioEntry,
  onCardPointerEnter,
  onCardPointerLeave,
  onOpenStage,
  onSendToChora,
}) => {
  const activeEntry = entry || pinnedAudioEntry;
  const isPinnedFallback = !entry && Boolean(pinnedAudioEntry);
  const richKind = useMemo(
    () => (activeEntry && !activeEntry.isDirectory ? classifyPlajahRichKind(activeEntry.name, activeEntry.mimeType) : null),
    [activeEntry],
  );

  const [photoDims, setPhotoDims] = useState<{ w: number; h: number } | null>(null);
  const [telaSummary, setTelaSummary] = useState<TelaPreviewSummary | null>(null);
  const [telaLoading, setTelaLoading] = useState(false);
  const [comicData, setComicData] = useState<ComicPreviewData | null>(null);
  const [comicLoading, setComicLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [vidTime, setVidTime] = useState(0);
  const [vidDur, setVidDur] = useState(0);
  const [vidPaused, setVidPaused] = useState(false);

  // Stop stray Chora hover audio when hovering a non-audio entry (unless user pinned audio!)
  useEffect(() => {
    if (!pinnedAudioEntry && (!activeEntry || richKind !== 'AUDIO')) {
      choraHoverAudio.stop();
    }
  }, [pinnedAudioEntry, activeEntry, richKind]);

  // Reset per-entry state and load Tela / Comic data lazily via bounded LRU
  useEffect(() => {
    setPhotoDims(null);
    setVidTime(0);
    setVidDur(0);
    setVidPaused(false);
    setTelaSummary(null);
    setComicData(null);

    if (!activeEntry || !richKind) return;
    const ac = new AbortController();

    if (richKind === 'TELA_DOC') {
      setTelaLoading(true);
      loadRichTelaPreview(activeEntry, ac.signal).then(res => {
        if (!ac.signal.aborted) {
          setTelaSummary(res);
          setTelaLoading(false);
        }
      });
    } else if (richKind === 'COMIC') {
      setComicLoading(true);
      loadRichComicPreview(activeEntry, ac.signal).then(res => {
        if (!ac.signal.aborted) {
          setComicData(res);
          setComicLoading(false);
        }
      });
    }

    return () => ac.abort();
  }, [activeEntry?.id, richKind]);

  if (!activeEntry || !richKind || activeEntry.isDirectory) return null;
  if (
    richKind !== 'IMAGE' &&
    richKind !== 'VIDEO' &&
    richKind !== 'COMIC' &&
    richKind !== 'TELA_DOC' &&
    richKind !== 'AUDIO'
  ) {
    return null;
  }

  // Clamp position inside viewport, or dock compact bottom-right when pinned
  const cardWidth = richKind === 'TELA_DOC' || richKind === 'IMAGE' ? 410 : 390;
  const estHeight = richKind === 'AUDIO' ? 300 : 365;
  let style: React.CSSProperties = {
    position: 'fixed',
    width: `min(${cardWidth}px, calc(100vw - 24px))`,
    zIndex: 60,
  };

  if (isPinnedFallback || !anchorRect) {
    style = { ...style, right: 18, bottom: 18 };
  } else if (typeof window !== 'undefined') {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchorRect.right + 14;
    if (left + cardWidth > vw - 12) {
      left = Math.max(12, anchorRect.left - cardWidth - 14);
    }
    if (left + cardWidth > vw - 12) {
      left = Math.max(12, Math.min(vw - cardWidth - 12, anchorRect.left));
    }
    let top = anchorRect.top - 18;
    if (top + estHeight > vh - 12) {
      top = Math.max(12, vh - estHeight - 12);
    }
    style = { ...style, left: Math.max(12, left), top: Math.max(12, top) };
  }

  const streamUrl = activeEntry.streamUrl || activeEntry.url || activeEntry.downloadUrl;

  return (
    <div
      style={style}
      onPointerEnter={onCardPointerEnter}
      onPointerLeave={onCardPointerLeave}
      className="rounded-2xl bg-[#0B0D14]/95 border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-xl p-3 text-white transition-opacity duration-150"
    >
      {/* Card Header */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 min-w-0">
          {richKind === 'IMAGE' && <ImageIcon size={13} className="text-sky-400 shrink-0" />}
          {richKind === 'VIDEO' && <Film size={13} className="text-purple-400 shrink-0" />}
          {richKind === 'COMIC' && <BookOpen size={13} className="text-rose-400 shrink-0" />}
          {richKind === 'TELA_DOC' && <Layers size={13} className="text-indigo-400 shrink-0" />}
          {richKind === 'AUDIO' && <Music size={13} className="text-orange-400 shrink-0" />}
          <span className="text-xs font-semibold truncate">{activeEntry.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onOpenStage(activeEntry)}
            className="px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-[10px] font-semibold text-amber-200 cursor-pointer flex items-center gap-1"
            title="Open full Quick-View Stage"
          >
            <Maximize2 size={10} /> Stage
          </button>
          {isPinnedFallback && (
            <button
              onClick={() => {
                onPinAudioEntry(null);
                choraHoverAudio.stop();
              }}
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
              title="Close pinned Chora preview"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* LARGE PHOTO HOVER PREVIEW */}
      {richKind === 'IMAGE' && (
        <div className="flex flex-col gap-2">
          <div className="relative w-full h-64 rounded-xl bg-black/80 border border-white/10 overflow-hidden flex items-center justify-center">
            {streamUrl || activeEntry.thumbUrl ? (
              <img
                src={streamUrl || activeEntry.thumbUrl}
                alt={activeEntry.name}
                onLoad={e => setPhotoDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="max-w-full max-h-full object-contain"
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-white/60 px-1">
            <span>{photoDims ? `${photoDims.w} × ${photoDims.h} px` : 'High-Res Photo'}</span>
            <span>{activeEntry.size ? formatBytes(activeEntry.size) : ''}</span>
          </div>
        </div>
      )}

      {/* VIDEO HOVER LIVE LOOP + SCRUB */}
      {richKind === 'VIDEO' && (
        <div className="flex flex-col gap-2">
          <div className="relative w-full h-60 rounded-xl bg-black border border-white/10 overflow-hidden flex items-center justify-center">
            {streamUrl ? (
              <video
                ref={videoRef}
                key={streamUrl}
                src={streamUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (v.paused) {
                    v.play().catch(() => {});
                    setVidPaused(false);
                  } else {
                    v.pause();
                    setVidPaused(true);
                  }
                }}
                onLoadedMetadata={e => setVidDur(e.currentTarget.duration || 0)}
                onTimeUpdate={e => setVidTime(e.currentTarget.currentTime || 0)}
                className="w-full h-full object-contain cursor-pointer"
              />
            ) : null}
            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/75 border border-purple-400/40 text-[9px] font-mono text-purple-200">
              {vidDur > 0 ? `${fmtClock(vidTime)} / ${fmtClock(vidDur)}` : 'STREAMING'}
            </span>
          </div>
          <div
            className="h-3 flex items-center cursor-ew-resize group"
            title="Move pointer across bar to scrub video"
            onMouseMove={e => {
              const v = videoRef.current;
              if (!v || !vidDur) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
              v.currentTime = ratio * vidDur;
              setVidTime(v.currentTime);
            }}
          >
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                style={{ width: `${vidDur > 0 ? Math.min(100, (vidTime / vidDur) * 100) : 0}%` }}
                className="h-full bg-gradient-to-r from-purple-400 to-amber-400 transition-[width] duration-75"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/55 px-1">
            <span>{vidPaused ? 'Paused (click frame)' : 'Hover scrub • Muted loop'}</span>
            <span>{activeEntry.size ? formatBytes(activeEntry.size) : ''}</span>
          </div>
        </div>
      )}

      {/* COMIC BOOK MOTION PREVIEW */}
      {richKind === 'COMIC' && (
        <ComicRichPreviewCard comic={comicData} loading={comicLoading} title={activeEntry.name} />
      )}

      {/* TELA DOCUMENT PREVIEW WITH ANIMATION */}
      {richKind === 'TELA_DOC' && (
        <TelaRichPreviewCard summary={telaSummary} loading={telaLoading} title={activeEntry.name} width={365} />
      )}

      {/* AUDIO SONG CHORA HOVER AUTO-PLAY + TRANSPORT + WAVEFORM + VISUALIZER */}
      {richKind === 'AUDIO' && (
        <ChoraRichAudioDeck
          entry={activeEntry}
          autoplayOnHover={autoplayAudioOnHover}
          pinned={Boolean(pinnedAudioEntry && pinnedAudioEntry.id === activeEntry.id)}
          onTogglePin={() => {
            if (pinnedAudioEntry && pinnedAudioEntry.id === activeEntry.id) {
              onPinAudioEntry(null);
            } else {
              onPinAudioEntry(activeEntry);
            }
          }}
          onToggleAutoplay={onToggleAutoplayAudio}
          onSendToChora={onSendToChora ? () => onSendToChora(activeEntry) : undefined}
        />
      )}
    </div>
  );
};
