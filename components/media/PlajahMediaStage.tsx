// components/media/PlajahMediaStage.tsx
// One Unified Local Media & Quick-View Stage for Images, Video, Audio, Documents, and Archives.
// Deliberately lightweight (zero Firebase/App top-level imports) so cold OS "Open With" launches
// render instantaneously and can escalate to NativePhotoViewer or ReelloUniversalVideoPlayer on demand.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Film,
  FlipHorizontal2,
  FolderOpen,
  Image as ImageIcon,
  Info,
  ListMusic,
  Maximize2,
  Minimize2,
  Monitor,
  Music,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Send,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  classifyMediaKind,
  extractExtension,
  isTextReadableExtension,
  type StageMediaItem,
  type UnifiedMediaKind,
} from '../../services/files/unifiedVfs';
import {
  clearNowPlaying,
  deleteLocalFile,
  isWindowsApp,
  setAsWallpaper,
  showInExplorer,
  updateNowPlaying,
} from '../../services/windowsBridgeService';
import { readWindowsTextPreview, readWindowsZipContents } from '../../services/files/windowsExplorerBridge';
import {
  isAndroidFilesAvailable,
  readAndroidTextPreview,
  shareAndroidEntries,
} from '../../services/files/androidFilesBridge';
import { openItemWithSystemApp } from '../../services/files/nativeFileBridges';
import { formatBytes } from '../../services/drive/client';
import { classifyPlajahRichKind } from '../../services/files/unifiedVfs';
import {
  loadAudioWaveformPeaks,
  loadRichComicPreview,
  loadRichTelaPreview,
  previewCacheKeyFor,
  toPreviewSourceTarget,
  type ComicPreviewData,
  type TelaPreviewSummary,
} from '../../services/files/richPreviewCache';
import { ComicRichPreviewCard, TelaRichPreviewCard } from '../files/ExplorerRichHoverPreview';
import ScrollingWaveform from '../ScrollingWaveform';
import Visualizer from '../Visualizer';

const stageAudioAnalyserCache = new WeakMap<HTMLAudioElement, AnalyserNode>();
let sharedStageAudioCtx: AudioContext | null = null;

function ensureStageAudioAnalyser(el: HTMLAudioElement): AnalyserNode | null {
  const existing = stageAudioAnalyserCache.get(el);
  if (existing) return existing;
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    if (!sharedStageAudioCtx) sharedStageAudioCtx = new AudioCtx();
    if (sharedStageAudioCtx.state === 'suspended') {
      void sharedStageAudioCtx.resume().catch(() => {});
    }
    const source = sharedStageAudioCtx.createMediaElementSource(el);
    const analyser = sharedStageAudioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyser.connect(sharedStageAudioCtx.destination);
    stageAudioAnalyserCache.set(el, analyser);
    return analyser;
  } catch {
    return null;
  }
}

const LazyNativePhotoViewer = React.lazy(() => import('../photo/NativePhotoViewer'));

export interface PlajahMediaStageProps {
  activeItem: StageMediaItem;
  playlist?: StageMediaItem[];
  mode?: 'embedded' | 'lightbox' | 'standalone';
  onSelectItem?: (item: StageMediaItem) => void;
  onClose?: () => void;
  onExpand?: () => void;
  onRevealInExplorer?: (item: StageMediaItem) => void;
  onShareTransfer?: (item: StageMediaItem) => void;
  onUploadToCloud?: (item: StageMediaItem) => void;
  onDownloadCloud?: (item: StageMediaItem) => void;
  onOpenCinemaPlayer?: (item: StageMediaItem, siblings: StageMediaItem[]) => void;
  onSendToChora?: (item: StageMediaItem) => void;
  onDeleted?: (item: StageMediaItem) => void;
}

const VIDEO_LOOKS = [
  { id: 'clean', label: 'Clean', css: 'none' },
  { id: 'cinema', label: 'Warm 2383', css: 'sepia(0.16) saturate(1.15) contrast(1.08)' },
  { id: 'teal', label: 'Teal & Orange', css: 'contrast(1.14) saturate(1.22) hue-rotate(-6deg)' },
  { id: 'vivid', label: 'Vivid HDR', css: 'contrast(1.2) saturate(1.32)' },
  { id: 'noir', label: 'Noir Mono', css: 'grayscale(1) contrast(1.28)' },
] as const;

function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function resolveKind(item: StageMediaItem): UnifiedMediaKind {
  if (item.mediaKind && item.mediaKind !== 'UNKNOWN') {
    if (item.mediaKind === 'IMAGE' || item.mediaKind === 'VIDEO' || item.mediaKind === 'AUDIO' || item.mediaKind === 'DOC' || item.mediaKind === 'ARCHIVE' || item.mediaKind === 'OTHER') {
      return item.mediaKind;
    }
  }
  return classifyMediaKind(item.name, item.mimeType);
}

export const PlajahMediaStage: React.FC<PlajahMediaStageProps> = ({
  activeItem,
  playlist,
  mode = 'lightbox',
  onSelectItem,
  onClose,
  onExpand,
  onRevealInExplorer,
  onShareTransfer,
  onUploadToCloud,
  onDownloadCloud,
  onOpenCinemaPlayer,
  onSendToChora,
  onDeleted,
}) => {
  const items = useMemo(
    () => (playlist && playlist.length > 0 ? playlist : [activeItem]),
    [playlist, activeItem],
  );
  const currentIdx = useMemo(() => {
    const idx = items.findIndex(
      i => (i.fullPath && activeItem.fullPath ? i.fullPath === activeItem.fullPath : i.name === activeItem.name && i.url === activeItem.url),
    );
    return idx >= 0 ? idx : 0;
  }, [items, activeItem]);

  const current = items[currentIdx] || activeItem;
  const kind = useMemo(() => resolveKind(current), [current]);
  const ext = useMemo(() => extractExtension(current.name), [current.name]);

  // Chrome toggles
  const [showPlaylist, setShowPlaylist] = useState(mode !== 'embedded' && items.length > 1);
  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [escalatedPhotoEditor, setEscalatedPhotoEditor] = useState(false);

  // Image transform state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const draggingRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number }>({
    active: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
  });

  // Video & Audio playback state
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(kind === 'VIDEO' || kind === 'AUDIO');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [lookId, setLookId] = useState<(typeof VIDEO_LOOKS)[number]['id']>('clean');
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  // Doc / Text / Archive preview state
  const [textPreview, setTextPreview] = useState<{ text: string; truncated?: boolean; loading: boolean; error?: string }>({
    text: '',
    loading: false,
  });
  const [zipEntries, setZipEntries] = useState<Array<{ fullName: string; size: number; isDirectory: boolean }>>([]);
  const richKind = useMemo(() => classifyPlajahRichKind(current.name, current.mimeType), [current.name, current.mimeType]);
  const [telaSummary, setTelaSummary] = useState<TelaPreviewSummary | null>(null);
  const [telaLoading, setTelaLoading] = useState(false);
  const [telaRawJsonMode, setTelaRawJsonMode] = useState(false);
  const [comicData, setComicData] = useState<ComicPreviewData | null>(null);
  const [comicLoading, setComicLoading] = useState(false);
  const [comicRawArchiveMode, setComicRawArchiveMode] = useState(false);
  const [audioPeaks, setAudioPeaks] = useState<number[] | null>(null);
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);

  useEffect(() => {
    setTelaSummary(null);
    setTelaRawJsonMode(false);
    setComicData(null);
    setComicRawArchiveMode(false);
    setAudioPeaks(null);
    setAudioAnalyser(null);
    const ac = new AbortController();
    const target = toPreviewSourceTarget(current);
    if (richKind === 'TELA_DOC') {
      setTelaLoading(true);
      loadRichTelaPreview(target, ac.signal).then(res => {
        if (!ac.signal.aborted) {
          setTelaSummary(res);
          setTelaLoading(false);
        }
      });
    } else if (richKind === 'COMIC') {
      setComicLoading(true);
      loadRichComicPreview(target, ac.signal).then(res => {
        if (!ac.signal.aborted) {
          setComicData(res);
          setComicLoading(false);
        }
      });
    } else if (kind === 'AUDIO') {
      loadAudioWaveformPeaks(target, 72, ac.signal).then(res => {
        if (!ac.signal.aborted) setAudioPeaks(res.peaks);
      });
    }
    return () => ac.abort();
  }, [current.id, current.url, richKind, kind]);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(prev => (prev === msg ? null : prev)), 2600);
  }, []);

  // Reset per-item transform when active item changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipX(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(kind === 'VIDEO' || kind === 'AUDIO');
    setEscalatedPhotoEditor(false);
  }, [current.name, current.url, current.fullPath, kind]);

  // Sync Windows SMTC Now Playing when playing audio/video locally
  useEffect(() => {
    if (!isWindowsApp()) return;
    if (kind === 'AUDIO' || kind === 'VIDEO') {
      updateNowPlaying({
        title: current.name.replace(/\.[^/.]+$/, ''),
        artist: current.folderPath?.split(/[\\/]/).pop() || 'Plajah Local Media',
        album: kind === 'AUDIO' ? 'Local Audio' : 'Local Video',
        isPlaying: playing,
        positionSeconds: currentTime,
        durationSeconds: duration || undefined,
      });
    } else {
      clearNowPlaying();
    }
    return () => {
      clearNowPlaying();
    };
  }, [kind, current.name, current.folderPath, playing, Math.floor(currentTime), Math.floor(duration)]);

  // Load text/code or zip preview on DOC/ARCHIVE selection
  useEffect(() => {
    let cancelled = false;
    setZipEntries([]);
    if (kind === 'DOC' && ext !== 'pdf' && isTextReadableExtension(current.name, current.mimeType)) {
      setTextPreview({ text: '', loading: true });
      const load = async () => {
        try {
          if (isWindowsApp() && current.fullPath) {
            const res = await readWindowsTextPreview(current.fullPath, 200_000);
            if (!cancelled) {
              if (res.success) setTextPreview({ text: res.text || '', truncated: res.truncated, loading: false });
              else setTextPreview({ text: '', loading: false, error: res.error || 'Could not read text file' });
            }
            return;
          }
          if (isAndroidFilesAvailable() && current.fullPath) {
            const res = await readAndroidTextPreview(current.fullPath, 200_000);
            if (!cancelled) {
              if (res.success) setTextPreview({ text: res.text || '', truncated: res.truncated, loading: false });
              else setTextPreview({ text: '', loading: false, error: res.error || 'Could not read text file' });
            }
            return;
          }
          if (current.url) {
            const r = await fetch(current.url);
            const txt = await r.text();
            if (!cancelled) {
              setTextPreview({
                text: txt.slice(0, 200_000),
                truncated: txt.length > 200_000,
                loading: false,
              });
            }
            return;
          }
          if (!cancelled) setTextPreview({ text: '', loading: false, error: 'No readable text stream' });
        } catch (err: any) {
          if (!cancelled) setTextPreview({ text: '', loading: false, error: err?.message || 'Read error' });
        }
      };
      load();
    } else if (kind === 'ARCHIVE' && ext === 'zip' && isWindowsApp() && current.fullPath) {
      readWindowsZipContents(current.fullPath)
        .then(res => {
          if (!cancelled && res.success && res.entries) setZipEntries(res.entries.slice(0, 200));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [kind, ext, current.name, current.fullPath, current.url, current.mimeType]);

  const stepItem = useCallback(
    (delta: -1 | 1) => {
      if (items.length <= 1 || !onSelectItem) return;
      let nextIdx: number;
      if (shuffle && items.length > 2) {
        do {
          nextIdx = Math.floor(Math.random() * items.length);
        } while (nextIdx === currentIdx);
      } else {
        nextIdx = (currentIdx + delta + items.length) % items.length;
      }
      onSelectItem(items[nextIdx]);
    },
    [items, currentIdx, shuffle, onSelectItem],
  );

  const togglePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const stepFrame = useCallback((dir: -1 | 1) => {
    const el = mediaRef.current;
    if (!el) return;
    if (!el.paused) el.pause();
    setPlaying(false);
    el.currentTime = Math.max(0, Math.min(el.duration || 999999, el.currentTime + dir * (1 / 24)));
    setCurrentTime(el.currentTime);
  }, []);

  // Keyboard navigation in lightbox & standalone modes
  useEffect(() => {
    if (mode === 'embedded' || escalatedPhotoEditor) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' && onClose) onClose();
      else if (e.key === 'ArrowRight') stepItem(1);
      else if (e.key === 'ArrowLeft') stepItem(-1);
      else if (e.key === ' ' && (kind === 'VIDEO' || kind === 'AUDIO')) {
        e.preventDefault();
        togglePlay();
      } else if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey) {
        setShowInfo(s => !s);
      } else if (e.key === 'ArrowUp' && kind === 'IMAGE') {
        e.preventDefault();
        setZoom(z => Math.min(6, +(z + 0.25).toFixed(2)));
      } else if (e.key === 'ArrowDown' && kind === 'IMAGE') {
        e.preventDefault();
        setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, escalatedPhotoEditor, onClose, stepItem, kind, togglePlay]);

  const handleSetWallpaper = async () => {
    if (!current.fullPath) return;
    const ok = await setAsWallpaper(current.fullPath);
    flashToast(ok ? 'Wallpaper updated' : 'Could not set wallpaper');
  };

  const handleDelete = async () => {
    if (!current.fullPath || !isWindowsApp()) return;
    const ok = await deleteLocalFile(current.fullPath);
    if (ok) {
      flashToast('Moved/deleted local file');
      onDeleted?.(current);
      if (items.length > 1) stepItem(1);
      else onClose?.();
    } else {
      flashToast('Delete failed');
    }
  };

  const handleNativeShare = async () => {
    if (isAndroidFilesAvailable() && current.fullPath) {
      await shareAndroidEntries([current.fullPath], current.name);
      return;
    }
    if (onShareTransfer) {
      onShareTransfer(current);
      return;
    }
    if (navigator.share && current.url) {
      navigator.share({ title: current.name, url: current.url }).catch(() => {});
    }
  };

  // Escalate to full Photo Editor / Spatial 3D when requested by user
  if (escalatedPhotoEditor && current.fullPath) {
    return (
      <React.Suspense
        fallback={
          <div className="fixed inset-0 z-[130] bg-black/95 flex items-center justify-center text-white text-sm">
            Loading Plajah Photo Studio…
          </div>
        }
      >
        <LazyNativePhotoViewer
          initialFile={{
            name: current.name,
            fullPath: current.fullPath,
            folderPath: current.folderPath,
            size: current.size || 0,
            lastModified: current.lastModified,
            url: current.url,
            mediaKind: 'IMAGE',
          }}
          files={items
            .filter(i => i.fullPath && resolveKind(i) === 'IMAGE')
            .map(i => ({
              name: i.name,
              fullPath: i.fullPath!,
              folderPath: i.folderPath,
              size: i.size || 0,
              lastModified: i.lastModified,
              url: i.url,
              mediaKind: 'IMAGE' as const,
            }))}
          onClose={() => setEscalatedPhotoEditor(false)}
        />
      </React.Suspense>
    );
  }

  const shellClass =
    mode === 'embedded'
      ? 'h-full w-full flex flex-col bg-[#08090f] border-l border-white/10 text-white select-none overflow-hidden'
      : 'fixed inset-0 z-[120] flex flex-col bg-[#07070c]/96 backdrop-blur-2xl text-white select-none overflow-hidden';

  const lookCss = VIDEO_LOOKS.find(l => l.id === lookId)?.css || 'none';

  return (
    <div ref={containerRef} className={shellClass}>
      {/* Unified Header Chrome */}
      <header className="h-12 px-3 flex items-center justify-between gap-2 border-b border-white/10 bg-black/35 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {mode !== 'embedded' && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/75 hover:text-white cursor-pointer"
              title="Close (Esc)"
            >
              <X size={17} />
            </button>
          )}
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">
            {kind}
          </span>
          <span className="text-xs font-semibold truncate">{current.name}</span>
          {items.length > 1 && (
            <span className="text-[11px] font-mono text-white/45 shrink-0">
              {currentIdx + 1}/{items.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {kind === 'IMAGE' && current.fullPath && (
            <button
              onClick={() => setEscalatedPhotoEditor(true)}
              className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5 text-amber-200 cursor-pointer"
              title="Open color editor, HEIC converter, and 3D Spatial viewer"
            >
              <Sparkles size={13} />
              <span className="hidden sm:inline">Edit / 3D</span>
            </button>
          )}

          {kind === 'VIDEO' && onOpenCinemaPlayer && (
            <button
              onClick={() => onOpenCinemaPlayer(current, items)}
              className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5 text-purple-200 cursor-pointer"
              title="Open full Reello Cinema & Watch Party player"
            >
              <Film size={13} />
              <span className="hidden sm:inline">Cinema</span>
            </button>
          )}

          {kind === 'AUDIO' && onSendToChora && (
            <button
              onClick={() => onSendToChora(current)}
              className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5 text-orange-200 cursor-pointer"
              title="Open in Chora Audio Studio"
            >
              <Music size={13} />
              <span className="hidden sm:inline">Chora</span>
            </button>
          )}

          {onRevealInExplorer ? (
            <button
              onClick={() => onRevealInExplorer(current)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title="Show in Plajah Explorer"
            >
              <FolderOpen size={15} />
            </button>
          ) : current.fullPath && isWindowsApp() ? (
            <button
              onClick={() => showInExplorer(current.fullPath!)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title="Show in Explorer"
            >
              <FolderOpen size={15} />
            </button>
          ) : null}

          {onUploadToCloud && current.isLocal !== false && current.locationKind !== 'drive' && current.locationKind !== 'hq' && (
            <button
              onClick={() => onUploadToCloud(current)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title="Upload / Back up to Cloud Drive"
            >
              <UploadCloud size={15} />
            </button>
          )}

          {onDownloadCloud && (current.locationKind === 'drive' || current.locationKind === 'hq') && (
            <button
              onClick={() => onDownloadCloud(current)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title="Save locally"
            >
              <Download size={15} />
            </button>
          )}

          {(onShareTransfer || isAndroidFilesAvailable()) && (
            <button
              onClick={handleNativeShare}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title={onShareTransfer ? 'Send Expiring Transfer Link / Share' : 'Share'}
            >
              {isAndroidFilesAvailable() ? <Share2 size={15} /> : <Send size={15} />}
            </button>
          )}

          {(current.fullPath || current.url) && (
            <button
              onClick={() => openItemWithSystemApp(current.fullPath || current.url, current.mimeType)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title="Open with OS Default App"
            >
              <ExternalLink size={15} />
            </button>
          )}

          {items.length > 1 && (
            <button
              onClick={() => setShowPlaylist(s => !s)}
              className={`p-1.5 rounded-lg cursor-pointer ${showPlaylist ? 'bg-amber-500/20 text-amber-300' : 'hover:bg-white/10 text-white/70 hover:text-white'}`}
              title="Toggle Folder Strip"
            >
              <ListMusic size={15} />
            </button>
          )}

          <button
            onClick={() => setShowInfo(s => !s)}
            className={`p-1.5 rounded-lg cursor-pointer ${showInfo ? 'bg-white/15 text-white' : 'hover:bg-white/10 text-white/70 hover:text-white'}`}
            title="File Details (I)"
          >
            <Info size={15} />
          </button>

          {mode === 'embedded' && onExpand && (
            <button
              onClick={onExpand}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title="Expand to Full Stage"
            >
              <Maximize2 size={15} />
            </button>
          )}
          {mode === 'embedded' && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              title="Hide Preview"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Body + Optional Info Drawer */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 relative flex flex-col">
          {/* Mixed Folder Prev / Next Edge Buttons */}
          {items.length > 1 && (
            <>
              <button
                onClick={() => stepItem(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/55 hover:bg-black/85 border border-white/15 text-white/80 hover:text-white cursor-pointer"
                title="Previous Item (Left Arrow)"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => stepItem(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/55 hover:bg-black/85 border border-white/15 text-white/80 hover:text-white cursor-pointer"
                title="Next Item (Right Arrow)"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {/* ── IMAGE STAGE ── */}
          {kind === 'IMAGE' && (
            <div
              className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-black/50"
              onWheel={e => {
                e.preventDefault();
                const step = e.deltaY < 0 ? 0.15 : -0.15;
                setZoom(z => Math.max(0.25, Math.min(6, +(z + step).toFixed(2))));
              }}
            >
              <div
                className="flex-1 min-h-0 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing p-4"
                onMouseDown={e => {
                  draggingRef.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
                }}
                onMouseMove={e => {
                  if (!draggingRef.current.active) return;
                  setPan({
                    x: draggingRef.current.px + (e.clientX - draggingRef.current.sx),
                    y: draggingRef.current.py + (e.clientY - draggingRef.current.sy),
                  });
                }}
                onMouseUp={() => { draggingRef.current.active = false; }}
                onMouseLeave={() => { draggingRef.current.active = false; }}
              >
                {current.url ? (
                  <img
                    src={current.url}
                    alt={current.name}
                    draggable={false}
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipX ? -1 : 1})`,
                      transition: draggingRef.current.active ? 'none' : 'transform 120ms ease-out',
                    }}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  />
                ) : (
                  <div className="text-center text-white/50 text-xs">
                    <ImageIcon className="mx-auto mb-2 opacity-50" size={32} />
                    No preview URL available
                  </div>
                )}
              </div>

              {/* Image Toolbar */}
              <div className="h-11 px-3 flex items-center justify-center gap-1.5 border-t border-white/10 bg-black/45 shrink-0">
                <button
                  onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                  className="p-1.5 rounded hover:bg-white/10 text-white/75 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="text-xs font-mono text-white/75 w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom(z => Math.min(6, +(z + 0.25).toFixed(2)))}
                  className="p-1.5 rounded hover:bg-white/10 text-white/75 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                  className="px-2 py-1 rounded hover:bg-white/10 text-[11px] font-medium text-white/75 cursor-pointer"
                >
                  Fit
                </button>
                <div className="h-4 w-px bg-white/15 mx-1" />
                <button
                  onClick={() => setRotation(r => (r - 90) % 360)}
                  className="p-1.5 rounded hover:bg-white/10 text-white/75 cursor-pointer"
                  title="Rotate Left"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  className="p-1.5 rounded hover:bg-white/10 text-white/75 cursor-pointer"
                  title="Rotate Right"
                >
                  <RotateCw size={15} />
                </button>
                <button
                  onClick={() => setFlipX(f => !f)}
                  className={`p-1.5 rounded cursor-pointer ${flipX ? 'bg-amber-500/20 text-amber-300' : 'hover:bg-white/10 text-white/75'}`}
                  title="Flip Horizontal"
                >
                  <FlipHorizontal2 size={15} />
                </button>
                {isWindowsApp() && current.fullPath && (
                  <>
                    <div className="h-4 w-px bg-white/15 mx-1" />
                    <button
                      onClick={handleSetWallpaper}
                      className="px-2 py-1 rounded hover:bg-white/10 text-[11px] font-medium flex items-center gap-1 text-white/80 cursor-pointer"
                      title="Set as Windows Wallpaper"
                    >
                      <Monitor size={13} />
                      <span>Wallpaper</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── VIDEO STAGE ── */}
          {kind === 'VIDEO' && (
            <div className="flex-1 min-h-0 flex flex-col bg-black">
              <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden p-2">
                <video
                  ref={el => { mediaRef.current = el; }}
                  key={current.url}
                  src={current.url}
                  autoPlay
                  loop={repeat}
                  muted={muted}
                  playsInline
                  style={{ filter: lookCss }}
                  onClick={togglePlay}
                  onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={e => {
                    setDuration(e.currentTarget.duration || 0);
                    e.currentTarget.volume = volume;
                    e.currentTarget.playbackRate = playbackRate;
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => {
                    setPlaying(false);
                    if (!repeat && items.length > 1) stepItem(1);
                  }}
                  className="max-w-full max-h-full rounded-lg cursor-pointer"
                />
              </div>

              {/* Unified Video Transport Bar */}
              <div className="px-4 py-2.5 border-t border-white/10 bg-[#0b0b12]/95 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-white/60 w-12 text-right">{fmtClock(currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.05}
                    value={Math.min(currentTime, duration || 1)}
                    onChange={e => {
                      const t = parseFloat(e.target.value);
                      if (mediaRef.current) mediaRef.current.currentTime = t;
                      setCurrentTime(t);
                    }}
                    className="flex-1 accent-amber-400 cursor-pointer"
                  />
                  <span className="text-[11px] font-mono text-white/60 w-12">{fmtClock(duration)}</span>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <button onClick={() => stepItem(-1)} className="p-1.5 rounded hover:bg-white/10 cursor-pointer" title="Previous">
                      <SkipBack size={16} />
                    </button>
                    <button onClick={() => stepFrame(-1)} className="px-1.5 py-1 rounded hover:bg-white/10 text-[10px] font-mono cursor-pointer" title="Step -1 frame">
                      -1f
                    </button>
                    <button
                      onClick={togglePlay}
                      className="p-2 rounded-full bg-amber-500 text-black hover:bg-amber-400 cursor-pointer"
                      title="Play / Pause (Space)"
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button onClick={() => stepFrame(1)} className="px-1.5 py-1 rounded hover:bg-white/10 text-[10px] font-mono cursor-pointer" title="Step +1 frame">
                      +1f
                    </button>
                    <button onClick={() => stepItem(1)} className="p-1.5 rounded hover:bg-white/10 cursor-pointer" title="Next">
                      <SkipForward size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={playbackRate}
                      onChange={e => {
                        const r = parseFloat(e.target.value);
                        setPlaybackRate(r);
                        if (mediaRef.current) mediaRef.current.playbackRate = r;
                      }}
                      className="bg-white/8 border border-white/15 rounded px-1.5 py-1 text-[11px] font-mono text-white cursor-pointer"
                      title="Playback speed"
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
                        <option key={r} value={r} className="bg-[#12131c]">
                          {r}x
                        </option>
                      ))}
                    </select>

                    <select
                      value={lookId}
                      onChange={e => setLookId(e.target.value as any)}
                      className="bg-white/8 border border-white/15 rounded px-1.5 py-1 text-[11px] text-white cursor-pointer hidden sm:block"
                      title="Preview Look"
                    >
                      {VIDEO_LOOKS.map(l => (
                        <option key={l.id} value={l.id} className="bg-[#12131c]">
                          {l.label}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => setMuted(m => !m)}
                      className="p-1.5 rounded hover:bg-white/10 cursor-pointer"
                      title="Mute"
                    >
                      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        setVolume(v);
                        setMuted(v === 0);
                        if (mediaRef.current) mediaRef.current.volume = v;
                      }}
                      className="w-16 accent-amber-400 cursor-pointer hidden sm:block"
                    />

                    <button
                      onClick={() => {
                        const vid = mediaRef.current as HTMLVideoElement | null;
                        if (vid && 'requestPictureInPicture' in vid) {
                          vid.requestPictureInPicture().catch(() => {});
                        }
                      }}
                      className="p-1.5 rounded hover:bg-white/10 cursor-pointer"
                      title="Picture-in-Picture"
                    >
                      <PictureInPicture2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── AUDIO STAGE (Chora Visualizer + ScrollingWaveform + Transport) ── */}
          {kind === 'AUDIO' && (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-[#170b28] via-[#0d0a16] to-[#08080e]">
              <audio
                ref={el => {
                  mediaRef.current = el;
                  if (el) {
                    const an = ensureStageAudioAnalyser(el);
                    if (an && an !== audioAnalyser) setAudioAnalyser(an);
                  }
                }}
                key={current.url}
                src={current.url}
                crossOrigin={
                  current.url &&
                  (current.url.startsWith('blob:') ||
                    current.url.startsWith('https://localmedia.plajah') ||
                    (typeof window !== 'undefined' && current.url.startsWith(window.location.origin)))
                    ? 'anonymous'
                    : undefined
                }
                autoPlay
                loop={repeat}
                muted={muted}
                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={e => {
                  setDuration(e.currentTarget.duration || 0);
                  e.currentTarget.volume = volume;
                  e.currentTarget.playbackRate = playbackRate;
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  if (!repeat && items.length > 1) stepItem(1);
                }}
              />

              <div className="w-full max-w-lg h-44 sm:h-52 rounded-2xl bg-[#09080E] border border-orange-500/25 shadow-2xl relative overflow-hidden mb-4">
                <Visualizer
                  analyser={audioAnalyser}
                  themeColor="#FF8C00"
                  trackTitle={current.name.replace(/\.[^/.]+$/, '')}
                  artist={current.folderPath?.split(/[\\/]/).pop() || 'Chora Stage'}
                  isPlaying={playing}
                  simplified={mode === 'embedded'}
                  alwaysAnimate={playing}
                />
                <ScrollingWaveform
                  currentTime={currentTime}
                  duration={duration || 1}
                  trackId={previewCacheKeyFor('stage', toPreviewSourceTarget(current))}
                  isPlaying={playing}
                  peaks={audioPeaks}
                  onScratchBy={delta => {
                    const el = mediaRef.current;
                    if (!el) return;
                    const maxD = Number.isFinite(el.duration) ? el.duration : duration;
                    const next = Math.max(0, Math.min(maxD || 1, (el.currentTime || 0) + delta));
                    el.currentTime = next;
                    setCurrentTime(next);
                  }}
                />
              </div>

              <h3 className="text-lg font-bold text-center max-w-md truncate">{current.name.replace(/\.[^/.]+$/, '')}</h3>
              <p className="text-xs text-orange-200/60 font-mono mb-4">
                CHORA DECK · {ext.toUpperCase() || 'AUDIO'} {current.size ? `• ${formatBytes(current.size)}` : ''}
              </p>

              <div className="w-full max-w-md space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-white/60 w-10 text-right">{fmtClock(currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.1}
                    value={Math.min(currentTime, duration || 1)}
                    onChange={e => {
                      const t = parseFloat(e.target.value);
                      if (mediaRef.current) mediaRef.current.currentTime = t;
                      setCurrentTime(t);
                    }}
                    className="flex-1 accent-amber-400 cursor-pointer"
                  />
                  <span className="text-[11px] font-mono text-white/60 w-10">{fmtClock(duration)}</span>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShuffle(s => !s)}
                    className={`p-2 rounded-full cursor-pointer ${shuffle ? 'text-amber-400 bg-amber-500/15' : 'text-white/60 hover:bg-white/10'}`}
                    title="Shuffle"
                  >
                    <Shuffle size={16} />
                  </button>
                  <button onClick={() => stepItem(-1)} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" title="Previous">
                    <SkipBack size={20} />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="p-3.5 rounded-full bg-amber-500 text-black hover:bg-amber-400 shadow-lg cursor-pointer"
                    title="Play / Pause (Space)"
                  >
                    {playing ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <button onClick={() => stepItem(1)} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" title="Next">
                    <SkipForward size={20} />
                  </button>
                  <button
                    onClick={() => setRepeat(r => !r)}
                    className={`p-2 rounded-full cursor-pointer ${repeat ? 'text-amber-400 bg-amber-500/15' : 'text-white/60 hover:bg-white/10'}`}
                    title="Repeat"
                  >
                    <Repeat size={16} />
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1">
                  <button onClick={() => setMuted(m => !m)} className="text-white/60 hover:text-white cursor-pointer">
                    {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setVolume(v);
                      setMuted(v === 0);
                      if (mediaRef.current) mediaRef.current.volume = v;
                    }}
                    className="w-28 accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── DOCUMENT / TELA / CODE / PDF STAGE ── */}
          {kind === 'DOC' && (
            <div className="flex-1 min-h-0 flex flex-col bg-[#0c0d14]">
              {richKind === 'TELA_DOC' && !telaRawJsonMode ? (
                <div className="flex-1 min-h-0 flex flex-col p-3 overflow-auto">
                  <div className="flex items-center justify-end pb-2 shrink-0">
                    <button
                      onClick={() => setTelaRawJsonMode(true)}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-[11px] text-white/75 cursor-pointer"
                    >
                      Raw JSON
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <div className="w-full max-w-xl">
                      <TelaRichPreviewCard
                        summary={telaSummary}
                        loading={telaLoading}
                        title={current.name}
                        width={mode === 'embedded' ? 320 : 500}
                        maxHeightClass="max-h-[65vh]"
                      />
                    </div>
                  </div>
                </div>
              ) : ext === 'pdf' && current.url ? (
                <iframe src={current.url} title={current.name} className="w-full h-full border-0 bg-white" />
              ) : isTextReadableExtension(current.name, current.mimeType) ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="h-9 px-3 flex items-center justify-between border-b border-white/10 bg-black/30 shrink-0">
                    <span className="text-[11px] font-mono text-white/60 flex items-center gap-1.5">
                      <FileCode2 size={13} />
                      {textPreview.truncated ? 'Showing first 200 KB' : 'Text / Code Preview'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {richKind === 'TELA_DOC' && (
                        <button
                          onClick={() => setTelaRawJsonMode(false)}
                          className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-[11px] text-indigo-200 cursor-pointer"
                        >
                          Tela Preview
                        </button>
                      )}
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(textPreview.text);
                          flashToast('Copied text');
                        }}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-white/85 whitespace-pre-wrap break-words select-text">
                    {textPreview.loading
                      ? 'Loading document…'
                      : textPreview.error
                        ? textPreview.error
                        : textPreview.text || '(Empty file)'}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileText size={48} className="text-sky-400/80" />
                  <div className="text-sm font-semibold">{current.name}</div>
                  <div className="text-xs text-white/50">
                    {current.size ? formatBytes(current.size) : 'Document'} • {current.mimeType || 'Document'}
                  </div>
                  <button
                    onClick={() => openItemWithSystemApp(current.fullPath || current.url, current.mimeType)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 cursor-pointer flex items-center gap-1.5"
                  >
                    <ExternalLink size={14} /> Open with System App
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── COMIC / ARCHIVE / OTHER STAGE ── */}
          {(kind === 'ARCHIVE' || kind === 'OTHER') && (
            <div className="flex-1 min-h-0 flex flex-col bg-[#0c0d14] overflow-auto p-4 sm:p-5">
              {richKind === 'COMIC' && !comicRawArchiveMode ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  {zipEntries.length > 0 && (
                    <div className="flex justify-end pb-2 shrink-0">
                      <button
                        onClick={() => setComicRawArchiveMode(true)}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-[11px] text-white/75 cursor-pointer"
                      >
                        Archive Files ({zipEntries.length})
                      </button>
                    </div>
                  )}
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <div className="w-full max-w-2xl">
                      <ComicRichPreviewCard
                        comic={comicData}
                        loading={comicLoading}
                        title={current.name}
                        heightClass={mode === 'embedded' ? 'h-72' : 'h-[62vh]'}
                      />
                    </div>
                  </div>
                </div>
              ) : kind === 'ARCHIVE' && zipEntries.length > 0 ? (
                <div className="max-w-2xl w-full mx-auto space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      <Archive size={15} className="text-amber-300" />
                      Archive Contents ({zipEntries.length}{zipEntries.length >= 200 ? '+' : ''})
                    </span>
                    {richKind === 'COMIC' && (
                      <button
                        onClick={() => setComicRawArchiveMode(false)}
                        className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-[11px] text-rose-200 cursor-pointer"
                      >
                        Comic Motion Stage
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                    {zipEntries.map(z => (
                      <div key={z.fullName} className="px-3 py-1.5 flex items-center justify-between text-xs">
                        <span className="font-mono truncate text-white/85">{z.fullName}</span>
                        <span className="text-white/45 font-mono shrink-0 ml-3">
                          {z.isDirectory ? 'Folder' : formatBytes(z.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                  {kind === 'ARCHIVE' ? (
                    <Archive size={48} className="text-amber-400/80" />
                  ) : (
                    <Sliders size={48} className="text-white/40" />
                  )}
                  <div className="text-sm font-semibold">{current.name}</div>
                  <div className="text-xs text-white/50">
                    {current.size ? formatBytes(current.size) : ''} • {current.mimeType || 'File'}
                  </div>
                  <button
                    onClick={() => openItemWithSystemApp(current.fullPath || current.url, current.mimeType)}
                    className="px-4 py-2 rounded-xl bg-white/12 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink size={14} /> Open with System App
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Toast Pill */}
          {toast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-black/85 border border-white/20 text-xs text-white shadow-xl">
              {toast}
            </div>
          )}
        </div>

        {/* File Inspector Sidebar */}
        {showInfo && (
          <aside className="w-64 sm:w-72 border-l border-white/10 bg-black/50 p-4 overflow-y-auto space-y-3 shrink-0 text-xs">
            <div className="font-bold text-white/90 pb-2 border-b border-white/10">File Details</div>
            <div>
              <div className="text-white/45 text-[10px] uppercase">Name</div>
              <div className="break-all font-medium">{current.name}</div>
            </div>
            <div>
              <div className="text-white/45 text-[10px] uppercase">Type</div>
              <div>{kind} ({current.mimeType || ext || 'file'})</div>
            </div>
            {current.size !== undefined && (
              <div>
                <div className="text-white/45 text-[10px] uppercase">Size</div>
                <div className="font-mono">{formatBytes(current.size)} ({current.size.toLocaleString()} B)</div>
              </div>
            )}
            {current.lastModified ? (
              <div>
                <div className="text-white/45 text-[10px] uppercase">Modified</div>
                <div>{new Date(current.lastModified).toLocaleString()}</div>
              </div>
            ) : null}
            {current.fullPath && (
              <div>
                <div className="text-white/45 text-[10px] uppercase">Location Path</div>
                <div className="font-mono text-[11px] break-all text-white/75">{current.fullPath}</div>
              </div>
            )}
            {isWindowsApp() && current.fullPath && (
              <div className="pt-2 border-t border-white/10">
                <button
                  onClick={handleDelete}
                  className="w-full py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={13} /> Move to Recycle / Delete
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Unified Mixed-Folder Bottom Filmstrip / Playlist */}
      {showPlaylist && items.length > 1 && (
        <div className="h-20 px-3 py-2 border-t border-white/10 bg-black/50 flex items-center gap-2 overflow-x-auto shrink-0">
          {items.map((item, idx) => {
            const active = idx === currentIdx;
            const k = resolveKind(item);
            return (
              <button
                key={`${item.fullPath || item.url || item.name}-${idx}`}
                onClick={() => onSelectItem?.(item)}
                className={`h-full min-w-[110px] max-w-[140px] rounded-xl px-2 py-1.5 flex items-center gap-2 border text-left transition cursor-pointer shrink-0 ${
                  active
                    ? 'bg-amber-500/20 border-amber-400/70 text-white'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/75'
                }`}
              >
                {item.thumbUrl || (k === 'IMAGE' && item.url) ? (
                  <img
                    src={item.thumbUrl || item.url}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover bg-black/40 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    {k === 'VIDEO' ? (
                      <Film size={16} className="text-purple-300" />
                    ) : k === 'AUDIO' ? (
                      <Music size={16} className="text-amber-300" />
                    ) : k === 'ARCHIVE' ? (
                      <Archive size={16} className="text-emerald-300" />
                    ) : (
                      <FileText size={16} className="text-sky-300" />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[11px] font-medium truncate">{item.name}</div>
                  <div className="text-[9px] font-mono uppercase text-white/45">{k}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlajahMediaStage;
