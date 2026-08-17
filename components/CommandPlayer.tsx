import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Volume1, ListMusic, Maximize2, Minus, Search, X,
  Command, Gift, Share2, Plus, Cast, Sparkles, Box, Layers, Images,
  Radio, Zap, Waves, PaintBucket, Video, HandHeart, ChevronUp,
} from 'lucide-react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';

/**
 * CommandPlayer — the redesigned 2026 music player shell.
 *
 * Two presentational forms in one file:
 *   • variant="full"  → global bottom transport bar
 *   • variant="nano"  → ~320px floating card with a real 3D album flip
 *
 * Philosophy: a MINIMAL visible transport plus ONE `⌘ Audio` button that opens a
 * searchable sheet holding every immersive / audio / queue / give control. All
 * playback + FX features are kept; app-chrome (nav row, theme, upload, admin, etc.)
 * is cut. State comes straight from GlobalPlayerContext — parents pass only actions.
 */

// ── brand tokens ────────────────────────────────────────────────────────────
const CYAN = '#00DAF3';
const PANEL = 'rgba(20,13,32,0.92)';
const PANEL_SOLID = 'rgba(20,13,32,1)';
const BRAND_GRADIENT = 'linear-gradient(90deg,#6B0099 0%,#D40055 55%,#FF8C00 100%)';
const HAIRLINE = 'rgba(255,255,255,0.08)';

export interface CommandPlayerProps {
  variant: 'full' | 'nano';
  onOpenStage?: () => void;      // open the full-screen PlayerView
  onOpenQueue?: () => void;      // navigate to QUEUE
  onExpandFromNano?: () => void; // nano → full player
  onMinimize?: () => void;
}

// ── helpers ─────────────────────────────────────────────────────────────────
const fmtTime = (s: number): string => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── small UI atoms ──────────────────────────────────────────────────────────
interface IconBtnProps {
  onClick?: () => void;
  title: string;
  active?: boolean;
  accent?: string;
  size?: number;
  children: React.ReactNode;
  className?: string;
}
const IconBtn: React.FC<IconBtnProps> = ({ onClick, title, active, accent, size = 38, children, className }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={active}
    onClick={onClick}
    className={`flex items-center justify-center rounded-full transition-all ${className || ''}`}
    style={{
      width: size,
      height: size,
      color: active ? (accent || CYAN) : 'rgba(255,255,255,0.82)',
      background: active ? `${accent || CYAN}1f` : 'transparent',
      border: active ? `1px solid ${accent || CYAN}55` : '1px solid transparent',
    }}
  >
    {children}
  </button>
);

/** A seek scrubber with a brand-gradient fill and current/total labels. */
interface ScrubberProps {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
  compact?: boolean;
}
const Scrubber: React.FC<ScrubberProps> = ({ currentTime, duration, onSeek, compact }) => {
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full" style={{ fontSize: 11 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)', minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {fmtTime(currentTime)}
      </span>
      <div className="relative flex-1" style={{ height: compact ? 14 : 18 }}>
        <div
          className="absolute rounded-full"
          style={{ left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 4, background: 'rgba(255,255,255,0.14)' }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ left: 0, width: `${pct}%`, top: '50%', transform: 'translateY(-50%)', height: 4, background: BRAND_GRADIENT }}
        />
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          aria-label="Seek"
          className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer"
          style={{ height: '100%', margin: 0 }}
        />
      </div>
      <span style={{ color: 'rgba(255,255,255,0.55)', minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>
        {fmtTime(duration)}
      </span>
    </div>
  );
};

/** A toggle chip used throughout the ⌘ Audio sheet. */
interface ChipProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  accent?: string;
  onClick?: () => void;
  sub?: string;
}
const Chip: React.FC<ChipProps> = ({ label, icon, active, accent, onClick, sub }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className="flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all"
    style={{
      background: active ? `${accent || CYAN}22` : 'rgba(255,255,255,0.05)',
      border: `1px solid ${active ? (accent || CYAN) + '77' : HAIRLINE}`,
      color: active ? (accent || CYAN) : 'rgba(255,255,255,0.85)',
      minWidth: 0,
    }}
  >
    <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 20, height: 20 }}>{icon}</span>
    <span className="flex flex-col min-w-0">
      <span className="truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      {sub && <span className="truncate" style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{sub}</span>}
    </span>
  </button>
);

/** A tiny segmented control (used for 2D / 3D / 3D+ and Flow / Paint). */
interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accent?: string;
}
function Segmented<T extends string>({ value, options, onChange, accent }: SegProps<T>) {
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIRLINE}` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-md px-2.5 py-1 transition-all"
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: on ? '#0A0410' : 'rgba(255,255,255,0.7)',
              background: on ? (accent || CYAN) : 'transparent',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── canvas visualizer (analyser-driven, reduced-motion aware) ────────────────
const MiniVisualizer: React.FC<{ analyser: AnalyserNode | null; isPlaying: boolean; height?: number }> = ({ analyser, isPlaying, height = 28 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // CSS-bar fallback: no analyser, reduced-motion, or paused — draw a calm static gradient bar.
    if (!analyser || reduced || !isPlaying) {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#6B0099'); g.addColorStop(0.55, '#D40055'); g.addColorStop(1, '#FF8C00');
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.45, w, h * 0.1);
      ctx.globalAlpha = 1;
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      const w = canvas.width, h = canvas.height;
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, w, h);
      const bars = 32;
      const step = Math.floor(data.length / bars);
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255;
        const bh = Math.max(2, v * h);
        const hue = 280 - (i / bars) * 250; // purple → orange sweep
        ctx.fillStyle = `hsl(${hue},90%,55%)`;
        ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, isPlaying, reduced]);

  return <canvas ref={canvasRef} width={220} height={height} style={{ width: '100%', height, display: 'block' }} />;
};

// ── the ⌘ Audio sheet ────────────────────────────────────────────────────────
interface SheetProps {
  onClose: () => void;
  onOpenQueue?: () => void;
  onOpenStage?: () => void;
}
const CommandAudioSheet: React.FC<SheetProps> = ({ onClose, onOpenQueue, onOpenStage }) => {
  const p = useGlobalPlayerState();
  const [query, setQuery] = useState('');

  // Local-only visual toggles for controls with no backing context setter.
  const [atmos, setAtmos] = useState(false);
  const [depth3d, setDepth3d] = useState(false);
  const [cast, setCast] = useState(false);
  const [hdQuality, setHdQuality] = useState(true);
  const [payForward, setPayForward] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Immersive dimensionality: 2D / 3D / 3D+ (spatial). Maps to isThreeDEnabled + spatialMode.
  const dimension: '2D' | '3D' | '3D+' = p.spatialMode !== 'off' ? '3D+' : (p.isThreeDEnabled ? '3D' : '2D');
  const setDimension = (v: '2D' | '3D' | '3D+') => {
    if (v === '2D') { p.setIsThreeDEnabled(false); p.setSpatialMode('off'); }
    else if (v === '3D') { p.setIsThreeDEnabled(true); p.setSpatialMode('off'); }
    else { p.setIsThreeDEnabled(true); p.setSpatialMode('reactive'); p.setSpatialAudioEnabled(true); }
  };

  // A flat, filterable descriptor list so the search box can match by label/keywords.
  type Row =
    | { kind: 'chip'; group: string; label: string; keywords: string; icon: React.ReactNode; active?: boolean; accent?: string; onClick?: () => void; sub?: string }
    | { kind: 'custom'; group: string; label: string; keywords: string; node: React.ReactNode };

  const rows: Row[] = [
    // ── Immersive ──
    {
      kind: 'custom', group: 'Immersive', label: 'Dimension', keywords: '2d 3d 3d+ spatial mode dimension flat depth',
      node: (
        <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${HAIRLINE}` }}>
          <span className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
            <Box size={16} /> Dimension
          </span>
          <Segmented value={dimension} options={[{ value: '2D', label: '2D' }, { value: '3D', label: '3D' }, { value: '3D+', label: '3D+' }]} onChange={setDimension} />
        </div>
      ),
    },
    { kind: 'chip', group: 'Immersive', label: 'Atmos', keywords: 'atmos dolby surround', icon: <Sparkles size={16} />, active: p.isAtmosActive || atmos, accent: '#FF8C00', sub: p.isAtmosActive ? 'track supports' : 'visual', onClick: () => setAtmos((v) => !v) },
    {
      kind: 'custom', group: 'Immersive', label: 'Visualizer', keywords: 'visualizer flow paint frequency spectrum reactive',
      node: (
        <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: p.isFrequencyVisualizerEnabled ? `${CYAN}18` : 'rgba(255,255,255,0.05)', border: `1px solid ${p.isFrequencyVisualizerEnabled ? CYAN + '66' : HAIRLINE}` }}>
          <button type="button" onClick={() => p.setIsFrequencyVisualizerEnabled(!p.isFrequencyVisualizerEnabled)} className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 600, color: p.isFrequencyVisualizerEnabled ? CYAN : 'rgba(255,255,255,0.85)' }}>
            <Waves size={16} /> Visualizer
          </button>
          <Segmented value={p.visualizerType} options={[{ value: 'FLOW', label: 'Flow' }, { value: 'PAINT', label: 'Paint' }]} onChange={(v) => p.setVisualizerType(v)} />
        </div>
      ),
    },
    { kind: 'chip', group: 'Immersive', label: 'Slideshow', keywords: 'slideshow slides images gallery visuals', icon: <Images size={16} />, active: p.isSlideshowActive, onClick: () => p.setIsSlideshowActive(!p.isSlideshowActive) },
    { kind: 'chip', group: 'Immersive', label: '3D depth', keywords: '3d depth parallax layers dimension', icon: <Layers size={16} />, active: depth3d, sub: 'visual', onClick: () => setDepth3d((v) => !v) },

    // ── Audio ──
    { kind: 'chip', group: 'Audio', label: 'Kill FX', keywords: 'kill fx reset dry dj filter clear effects', icon: <Zap size={16} />, active: p.isFxActive, accent: '#D40055', sub: p.isFxActive ? 'FX active' : 'dry', onClick: () => p.resetAudioFx() },
    { kind: 'chip', group: 'Audio', label: 'Spatial', keywords: 'spatial audio eclipsa panner surround 3d sound', icon: <Box size={16} />, active: p.isSpatialAudioEnabled, onClick: () => p.setSpatialAudioEnabled(!p.isSpatialAudioEnabled) },
    { kind: 'chip', group: 'Audio', label: 'Mini video', keywords: 'mini video picture in picture pip floating', icon: <Video size={16} />, active: p.isMiniPlayerActive, onClick: () => p.setIsMiniPlayerActive(!p.isMiniPlayerActive) },
    { kind: 'chip', group: 'Audio', label: 'Cast', keywords: 'cast airplay chromecast tv external', icon: <Cast size={16} />, active: cast, sub: 'visual', onClick: () => setCast((v) => !v) },
    { kind: 'chip', group: 'Audio', label: 'HD Quality', keywords: 'hd quality lossless bitrate hi-res flac', icon: <Sparkles size={16} />, active: hdQuality, accent: '#FF8C00', sub: 'visual', onClick: () => setHdQuality((v) => !v) },
    { kind: 'chip', group: 'Audio', label: 'Auto-Radio', keywords: 'auto radio autoplay continuous up next station', icon: <Radio size={16} />, active: p.autoRadio, onClick: () => p.setAutoRadio(!p.autoRadio) },

    // ── Queue & give ──
    { kind: 'chip', group: 'Queue & give', label: 'Up Next', keywords: 'up next queue upcoming list', icon: <ListMusic size={16} />, sub: p.upNext ? `${p.upNext.title} — ${p.upNext.artist}` : 'open queue', onClick: () => { onOpenQueue?.(); onClose(); } },
    { kind: 'chip', group: 'Queue & give', label: 'Add to Playlist', keywords: 'add playlist save collection', icon: <Plus size={16} />, sub: 'visual', onClick: () => {} },
    { kind: 'chip', group: 'Queue & give', label: 'Gifts', keywords: 'gift tip send support', icon: <Gift size={16} />, accent: '#D40055', sub: 'visual', onClick: () => {} },
    { kind: 'chip', group: 'Queue & give', label: 'Pay It Forward', keywords: 'pay it forward gift share sponsor', icon: <HandHeart size={16} />, active: payForward, accent: '#FF8C00', sub: 'visual', onClick: () => setPayForward((v) => !v) },
    { kind: 'chip', group: 'Queue & give', label: 'Share', keywords: 'share link social copy', icon: <Share2 size={16} />, sub: 'visual', onClick: () => {} },
    { kind: 'chip', group: 'Queue & give', label: 'Sample', keywords: 'sample clip remix snippet', icon: <PaintBucket size={16} />, sub: 'visual', onClick: () => {} },
  ];

  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => (r.label + ' ' + r.keywords + ' ' + r.group).toLowerCase().includes(q)) : rows;
  const groups = ['Immersive', 'Audio', 'Queue & give'];

  return (
    <div
      className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Audio controls"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: PANEL_SOLID, border: `1px solid ${HAIRLINE}`, maxHeight: '85vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' }}
      >
        {/* header */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <Command size={18} style={{ color: CYAN }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Audio</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>immersive · sound · queue</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex items-center justify-center rounded-full" style={{ width: 30, height: 30, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.06)' }}>
            <X size={16} />
          </button>
        </div>

        {/* search */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIRLINE}` }}>
            <Search size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search audio controls…"
              className="flex-1 bg-transparent outline-none"
              style={{ color: '#fff', fontSize: 13 }}
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} style={{ color: 'rgba(255,255,255,0.5)' }} /></button>}
          </div>
        </div>

        {/* grouped chips */}
        <div className="px-4 pb-5 overflow-y-auto">
          {groups.map((g) => {
            const items = filtered.filter((r) => r.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-4">
                <div className="mb-2" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>{g}</div>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((r, i) =>
                    r.kind === 'custom'
                      ? <div key={r.label + i} className="col-span-2">{r.node}</div>
                      : <Chip key={r.label + i} label={r.label} icon={r.icon} active={r.active} accent={r.accent} sub={r.sub} onClick={r.onClick} />
                  )}
                </div>
              </div>
            );
          })}
          {!filtered.length && (
            <div className="text-center py-8" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No controls match "{query}"</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── shared derived now-playing data ──────────────────────────────────────────
function useNowPlaying() {
  const p = useGlobalPlayerState();
  const track = p.currentTrack;
  const album = p.currentAlbum;
  const cover = (track?.images && track.images[0]) || (track as any)?.albumCover || album?.coverImage || '';
  const title = track?.title || 'Nothing playing';
  const artist = album?.artist || track?.artist || '';
  const slides: string[] = useMemo(() => {
    const imgs = (track?.images && track.images.length ? track.images : []).filter(Boolean);
    if (imgs.length) return imgs as string[];
    return [cover].filter(Boolean);
  }, [track?.id, cover]);
  return { p, track, album, cover, title, artist, slides };
}

// ── the ⌘ Audio button ───────────────────────────────────────────────────────
const CommandAudioButton: React.FC<{ onClick: () => void; compact?: boolean }> = ({ onClick, compact }) => (
  <button
    type="button"
    onClick={onClick}
    title="Audio controls"
    className="flex items-center gap-1.5 rounded-full font-semibold transition-all"
    style={{
      padding: compact ? '6px 12px' : '8px 14px',
      fontSize: 13,
      color: '#0A0410',
      background: CYAN,
      boxShadow: `0 0 18px ${CYAN}55`,
    }}
  >
    <Command size={15} />
    {!compact && <span>Audio</span>}
  </button>
);

// ── FULL: global bottom bar ──────────────────────────────────────────────────
const FullBar: React.FC<CommandPlayerProps & { onOpenSheet: () => void }> = ({ onOpenStage, onOpenQueue, onMinimize, onOpenSheet }) => {
  const { p, cover, title, artist } = useNowPlaying();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();
  const muted = p.volume <= 0.001;

  const RepeatIcon = p.repeatMode === 'ONE' ? Repeat1 : Repeat;

  return (
    <div
      className="w-full flex items-center gap-3 px-3 sm:px-4"
      style={{
        height: 76,
        background: PANEL,
        backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${HAIRLINE}`,
        color: '#fff',
      }}
    >
      {/* left: cover + meta → open stage */}
      <button
        type="button"
        onClick={onOpenStage}
        title="Open player"
        className="flex items-center gap-3 min-w-0 flex-shrink"
        style={{ maxWidth: 280 }}
      >
        <span
          className="flex-shrink-0 rounded-lg overflow-hidden"
          style={{ width: 48, height: 48, background: cover ? `center/cover url(${cover})` : BRAND_GRADIENT, boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}
        />
        <span className="flex flex-col min-w-0 text-left">
          <span className="truncate" style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
          <span className="truncate" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>{artist}</span>
        </span>
      </button>

      {/* center: transport + scrubber */}
      <div className="flex flex-col items-center gap-1 flex-1 min-w-0 max-w-xl mx-auto">
        <div className="flex items-center gap-1.5">
          <IconBtn size={34} title="Shuffle" active={p.isShuffle} onClick={() => p.setIsShuffle(!p.isShuffle)}><Shuffle size={16} /></IconBtn>
          <IconBtn size={36} title="Previous" onClick={() => p.prev()}><SkipBack size={19} /></IconBtn>
          <button
            type="button"
            onClick={() => p.togglePlay()}
            title={p.isPlaying ? 'Pause' : 'Play'}
            aria-label={p.isPlaying ? 'Pause' : 'Play'}
            className="flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: '#fff', color: '#0A0410' }}
          >
            {p.isPlaying ? <Pause size={20} fill="#0A0410" /> : <Play size={20} fill="#0A0410" style={{ marginLeft: 2 }} />}
          </button>
          <IconBtn size={36} title="Next" onClick={() => p.next()}><SkipForward size={19} /></IconBtn>
          <IconBtn
            size={34}
            title={`Repeat: ${p.repeatMode}`}
            active={p.repeatMode !== 'OFF'}
            onClick={() => p.setRepeatMode(p.repeatMode === 'OFF' ? 'ALL' : p.repeatMode === 'ALL' ? 'ONE' : 'OFF')}
          >
            <RepeatIcon size={16} />
          </IconBtn>
        </div>
        <Scrubber currentTime={currentTime} duration={duration} onSeek={seek} />
      </div>

      {/* right: volume, ⌘ Audio, queue, stage, minimize */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="hidden md:flex items-center gap-1.5" style={{ width: 120 }}>
          <IconBtn size={32} title={muted ? 'Unmute' : 'Mute'} onClick={() => p.setVolume(muted ? 0.8 : 0)}>
            {muted ? <VolumeX size={17} /> : p.volume < 0.5 ? <Volume1 size={17} /> : <Volume2 size={17} />}
          </IconBtn>
          <input
            type="range" min={0} max={1} step={0.01} value={p.volume}
            onChange={(e) => p.setVolume(parseFloat(e.target.value))}
            aria-label="Volume"
            className="flex-1 appearance-none cursor-pointer"
            style={{ height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${CYAN} ${p.volume * 100}%, rgba(255,255,255,0.15) ${p.volume * 100}%)` }}
          />
        </div>
        <CommandAudioButton onClick={onOpenSheet} />
        <IconBtn size={36} title="Queue" onClick={onOpenQueue}><ListMusic size={18} /></IconBtn>
        <IconBtn size={36} title="Open stage" onClick={onOpenStage}><Maximize2 size={17} /></IconBtn>
        <IconBtn size={36} title="Minimize" onClick={() => { p.setIsMinimized(true); onMinimize?.(); }}><Minus size={18} /></IconBtn>
      </div>
    </div>
  );
};

// ── NANO: floating card with a real 3D album flip ────────────────────────────
const NanoCard: React.FC<CommandPlayerProps & { onOpenSheet: () => void }> = ({ onOpenStage, onOpenQueue, onExpandFromNano, onOpenSheet }) => {
  const { p, cover, title, artist, slides } = useNowPlaying();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [flipped, setFlipped] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  // Cycle the slideshow face while it's showing (and slideshow is active).
  useEffect(() => {
    if (!flipped || reduced || slides.length < 2) return;
    const id = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 3200);
    return () => clearInterval(id);
  }, [flipped, reduced, slides.length]);

  const flipFace = slides[slideIdx % slides.length] || cover;

  return (
    <div
      className="w-full rounded-card overflow-hidden flex flex-col"
      style={{ background: 'var(--glass-3)', backdropFilter: 'blur(var(--glassmorphism-blur, 20px))', border: '1px solid var(--border-color)', color: 'var(--text-primary)', boxShadow: 'var(--pj-elev-3)' }}
    >
      {/* album art with real 3D flip */}
      <div className="relative flex items-center justify-center pt-4 pb-3">
        <div style={{ width: 96, height: 96, perspective: 700 }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              transition: reduced ? 'none' : 'transform 0.6s cubic-bezier(0.4,0.2,0.2,1)',
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* front — cover */}
            <button
              type="button"
              onClick={onOpenStage}
              title="Open player"
              style={{
                position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden',
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                background: cover ? `center/cover url(${cover})` : BRAND_GRADIENT,
                boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
              }}
            />
            {/* back — slideshow face */}
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden',
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: flipFace ? `center/cover url(${flipFace})` : BRAND_GRADIENT,
                boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
              <span style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: CYAN }}>SLIDES</span>
            </div>
          </div>
        </div>

        {/* flip toggle overlaid on the art */}
        <button
          type="button"
          onClick={() => { const nf = !flipped; setFlipped(nf); if (nf) p.setIsSlideshowActive(true); }}
          title="Slides"
          aria-pressed={flipped}
          className="absolute flex items-center gap-1 rounded-full px-2 py-1"
          style={{
            bottom: 12, right: 92,
            fontSize: 10, fontWeight: 700,
            color: flipped ? '#0A0410' : '#fff',
            background: flipped ? CYAN : 'rgba(0,0,0,0.5)',
            border: `1px solid ${flipped ? CYAN : HAIRLINE}`,
          }}
        >
          <Images size={12} /> Slides
        </button>
      </div>

      {/* meta */}
      <div className="px-4 text-center">
        <div className="truncate" style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div className="truncate" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>{artist}</div>
      </div>

      {/* mini visualizer (analyser-driven, reduced-motion aware) */}
      <div className="px-4 pt-2">
        <MiniVisualizer analyser={p.analyser} isPlaying={p.isPlaying && p.isFrequencyVisualizerEnabled} height={24} />
      </div>

      {/* scrubber */}
      <div className="px-4 pt-1">
        <Scrubber currentTime={currentTime} duration={duration} onSeek={seek} compact />
      </div>

      {/* transport */}
      <div className="flex items-center justify-center gap-3 py-2">
        <IconBtn size={36} title="Previous" onClick={() => p.prev()}><SkipBack size={18} /></IconBtn>
        <button
          type="button"
          onClick={() => p.togglePlay()}
          title={p.isPlaying ? 'Pause' : 'Play'}
          aria-label={p.isPlaying ? 'Pause' : 'Play'}
          className="flex items-center justify-center rounded-full"
          style={{ width: 46, height: 46, background: '#fff', color: '#0A0410' }}
        >
          {p.isPlaying ? <Pause size={21} fill="#0A0410" /> : <Play size={21} fill="#0A0410" style={{ marginLeft: 2 }} />}
        </button>
        <IconBtn size={36} title="Next" onClick={() => p.next()}><SkipForward size={18} /></IconBtn>
      </div>

      {/* action row: ⌘ Audio · Queue · Expand */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-1">
        <div className="flex-1"><CommandAudioButton onClick={onOpenSheet} compact /></div>
        <IconBtn size={36} title="Queue" onClick={onOpenQueue}><ListMusic size={17} /></IconBtn>
        <IconBtn size={36} title="Expand" onClick={() => { p.setIsNanoView(false); onExpandFromNano?.(); }}><ChevronUp size={18} /></IconBtn>
      </div>
    </div>
  );
};

// ── public component ─────────────────────────────────────────────────────────
const CommandPlayer: React.FC<CommandPlayerProps> = (props) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <>
      {props.variant === 'full'
        ? <FullBar {...props} onOpenSheet={openSheet} />
        : <NanoCard {...props} onOpenSheet={openSheet} />}
      {sheetOpen && <CommandAudioSheet onClose={closeSheet} onOpenQueue={props.onOpenQueue} onOpenStage={props.onOpenStage} />}
    </>
  );
};

export default CommandPlayer;
