import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Cuboid,
  Info,
  MoreVertical,
  Play,
  Pause,
  Image as ImageIcon,
  FolderOpen,
  Monitor,
  Printer,
  Trash2,
  Copy,
  Check,
  Undo,
  Download,
  Share2,
  Sparkles,
  Volume2,
  VolumeX,
  Film,
  Music,
  Scan,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Crop as CropIcon,
  ArrowLeft,
  Wand2,
  Layout,
  SkipBack,
  SkipForward
} from 'lucide-react';
import {
  WindowsPickedFile,
  showInExplorer,
  setAsWallpaper,
  deleteLocalFile,
  saveLocalImageFile,
  isWindowsApp,
  updateNowPlaying,
  clearNowPlaying,
  readWindowsFileBytes
} from '../../services/windowsBridgeService';
// Lazy: SpatialMedia pulls the depth engine + SpatialContext (→ Firebase). Only the Spatial 3D
// mode needs it, so plain photo viewing stays light and opens fast.
const SpatialMedia = React.lazy(() => import('../SpatialMedia'));
import { useContextMenu } from '../ui/ContextMenu';

export interface NativePhotoViewerProps {
  initialFile: WindowsPickedFile;
  files?: WindowsPickedFile[];
  onClose: () => void;
  onBackToCatalog?: () => void;
  onSendToFabula?: (file: WindowsPickedFile) => void;
  onSendToPixels?: (file: WindowsPickedFile) => void;
  onSendToCrossover?: (file: WindowsPickedFile) => void;
  onSendToTela?: (file: WindowsPickedFile) => void;
  onSendToSalon?: (file: WindowsPickedFile) => void;
}

type ViewerMode = 'view' | 'edit' | 'spatial' | 'critique';

interface ImageAdjustments {
  brightness: number;  // -100 to 100
  contrast: number;    // -100 to 100
  saturation: number;  // -100 to 100
  warmth: number;      // -100 to 100
  highlights: number;  // -100 to 100
  shadows: number;     // -100 to 100
  vignette: number;    // 0 to 100
  filter: string;      // 'none' | 'vivid' | 'noir' | 'cinema' | 'golden' | 'cyber'
}

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  highlights: 0,
  shadows: 0,
  vignette: 0,
  filter: 'none',
};

const FILTERS = [
  { id: 'none', name: 'Original', css: '' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.4) contrast(1.1)' },
  { id: 'noir', name: 'Film Noir', css: 'grayscale(1) contrast(1.3) brightness(0.95)' },
  { id: 'cinema', name: 'Cinematic', css: 'contrast(1.15) sepia(0.2) hue-rotate(-15deg)' },
  { id: 'golden', name: 'Golden Hour', css: 'sepia(0.35) saturate(1.25) brightness(1.05)' },
  { id: 'cyber', name: 'Cyberpunk', css: 'contrast(1.2) hue-rotate(180deg) saturate(1.3)' },
  { id: 'vintage', name: 'Vintage 70s', css: 'sepia(0.4) contrast(0.9) brightness(1.1) saturate(0.85)' },
];

function isVideoFile(name: string): boolean {
  return /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv)$/i.test(name);
}

function isAudioFile(name: string): boolean {
  return /\.(mp3|wav|m4a|aac|flac|ogg|aiff|aif|wma)$/i.test(name);
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function NativePhotoViewer({
  initialFile,
  files = [initialFile],
  onClose,
  onBackToCatalog,
  onSendToFabula,
  onSendToPixels,
  onSendToCrossover,
  onSendToTela,
  onSendToSalon,
}: NativePhotoViewerProps) {
  const [playlist, setPlaylist] = useState<WindowsPickedFile[]>(files.length ? files : [initialFile]);
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const idx = files.findIndex(f => f.fullPath === initialFile.fullPath || f.name === initialFile.name);
    return idx >= 0 ? idx : 0;
  });

  // Synchronize playlist whenever folder files or initialFile change
  useEffect(() => {
    const sourceFiles = (files && files.length > 0) ? files : (initialFile ? [initialFile] : []);
    if (sourceFiles.length === 0) return;

    const isInitialImage = initialFile ? (!isVideoFile(initialFile.name) && !isAudioFile(initialFile.name)) : true;
    const filtered = isInitialImage
      ? sourceFiles.filter(f => !isVideoFile(f.name) && !isAudioFile(f.name))
      : sourceFiles;
    const finalPlaylist = filtered.length > 0 ? filtered : sourceFiles;

    setPlaylist(finalPlaylist);

    const target = initialFile;
    if (target) {
      const idx = finalPlaylist.findIndex(f => 
        (f.fullPath && target.fullPath && f.fullPath.toLowerCase() === target.fullPath.toLowerCase()) || 
        f.name.toLowerCase() === target.name.toLowerCase()
      );
      if (idx >= 0) {
        setCurrentIndex(idx);
      }
    }
  }, [files, initialFile]);

  const currentFile = playlist[currentIndex] || initialFile;
  const isVideo = isVideoFile(currentFile.name);
  const isAudio = isAudioFile(currentFile.name);

  // View & UI States
  const [mode, setMode] = useState<ViewerMode>('view');
  const [showInfo, setShowInfo] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSlideshow, setIsSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(4000);
  const [copiedPath, setCopiedPath] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Canvas Transform
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Natural Dimensions
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // Blob fallback cache for local files when virtual host mapping is resolving
  const [blobCache, setBlobCache] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState(false);
  const loadingBlobRef = useRef<Set<string>>(new Set());

  const getMediaUrl = useCallback((item: WindowsPickedFile) => {
    const key = item.fullPath || item.name;
    if (blobCache[key]) return blobCache[key];
    return item.url;
  }, [blobCache]);

  const recoverImage = useCallback(async (file: WindowsPickedFile) => {
    const key = file.fullPath || file.name;
    if (!file.fullPath || blobCache[key] || loadingBlobRef.current.has(key)) return;
    loadingBlobRef.current.add(key);

    try {
      const bytes = await readWindowsFileBytes(file.fullPath);
      if (bytes && bytes.length > 0) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
        const blob = new Blob([bytes], { type: mime });
        const objectUrl = URL.createObjectURL(blob);
        setBlobCache(prev => ({ ...prev, [key]: objectUrl }));
      }
    } catch (e) {
      console.warn('[NativePhotoViewer] Failed to recover image bytes:', e);
    } finally {
      loadingBlobRef.current.delete(key);
    }
  }, [blobCache]);

  // Pre-recover current file immediately if on Windows app
  useEffect(() => {
    if (currentFile && !isVideo && !isAudio && currentFile.fullPath) {
      const testImg = new Image();
      testImg.onerror = () => {
        recoverImage(currentFile);
      };
      testImg.src = currentFile.url;
    }
  }, [currentFile, isVideo, isAudio, recoverImage]);

  // Editing Adjustments
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);
  const [isSaving, setIsSaving] = useState(false);

  // Audio/Video Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Filmstrip container ref for auto-scrolling active thumbnail into view
  const filmstripRef = useRef<HTMLDivElement>(null);

  const stepFrame = useCallback((forward: boolean) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    const frameTime = 1 / 30; // ~33ms per frame
    const nextTime = Math.max(0, Math.min(videoRef.current.duration || 9999, videoRef.current.currentTime + (forward ? frameTime : -frameTime)));
    videoRef.current.currentTime = nextTime;
    setVideoCurrentTime(nextTime);
  }, []);

  // Reset viewport state when active photo changes
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setMode('view');
    setImageError(false);
  }, []);

  const selectPhoto = useCallback((idx: number) => {
    if (idx < 0 || idx >= playlist.length) return;
    setCurrentIndex(idx);
    resetView();
  }, [playlist.length, resetView]);

  const goNext = useCallback(() => {
    selectPhoto((currentIndex + 1) % playlist.length);
  }, [currentIndex, playlist.length, selectPhoto]);

  const goPrev = useCallback(() => {
    selectPhoto((currentIndex - 1 + playlist.length) % playlist.length);
  }, [currentIndex, playlist.length, selectPhoto]);

  // Slideshow timer
  useEffect(() => {
    if (!isSlideshow) return;
    const timer = setInterval(() => {
      goNext();
    }, slideshowInterval);
    return () => clearInterval(timer);
  }, [isSlideshow, slideshowInterval, goNext]);

  // Sync active thumbnail in filmstrip
  useEffect(() => {
    if (filmstripRef.current) {
      const activeEl = filmstripRef.current.children[currentIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentIndex]);

  // SMTC updates for audio files
  useEffect(() => {
    if (isAudio) {
      updateNowPlaying({
        title: currentFile.name,
        artist: 'Plajah Native Media',
        album: currentFile.folderPath || 'Windows Library',
        isPlaying: isPlaying,
      });
    } else {
      clearNowPlaying();
    }
    return () => {
      if (isAudio) clearNowPlaying();
    };
  }, [isAudio, currentFile, isPlaying]);

  // Flash message toast
  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Keyboard controls (Windows Photos parity)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setZoom(z => Math.min(8, Number((z + 0.25).toFixed(2))));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setZoom(z => Math.max(0.2, Number((z - 0.25).toFixed(2))));
          break;
        case 'Escape':
          e.preventDefault();
          if (mode !== 'view') {
            setMode('view');
          } else if (isFullscreen) {
            setIsFullscreen(false);
          } else {
            onClose();
          }
          break;
        case ',':
        case '<':
          if (isVideo) {
            e.preventDefault();
            stepFrame(false);
          }
          break;
        case '.':
        case '>':
          if (isVideo) {
            e.preventDefault();
            stepFrame(true);
          }
          break;
        case 'f':
        case 'F':
        case 'F11':
          e.preventDefault();
          setIsFullscreen(fs => !fs);
          break;
        case ' ': // Space: toggle slideshow or play/pause
          e.preventDefault();
          if (isVideo && videoRef.current) {
            if (videoRef.current.paused) videoRef.current.play();
            else videoRef.current.pause();
          } else if (isAudio && audioRef.current) {
            if (audioRef.current.paused) audioRef.current.play();
            else audioRef.current.pause();
          } else {
            setIsSlideshow(s => !s);
          }
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setRotation(r => (r + 90) % 360);
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          setZoom(z => (z === 1 ? 2.5 : 1));
          setPan({ x: 0, y: 0 });
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setShowInfo(prev => !prev);
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          setMode(m => (m === 'edit' ? 'view' : 'edit'));
          break;
        case 's':
        case 'S':
          e.preventDefault();
          setMode(m => (m === 'spatial' ? 'view' : 'spatial'));
          break;
        case 'Delete':
          e.preventDefault();
          handleDeleteCurrentFile();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, mode, isFullscreen, isVideo, isAudio, goNext, goPrev, onClose]);

  // Zoom with Mouse Wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (mode === 'spatial') return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom(prev => {
      const next = Math.max(0.2, Math.min(8, Number((prev + delta).toFixed(2))));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Drag to Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Double click to toggle Fit <-> 100% (2.5x)
  const handleDoubleClick = () => {
    if (zoom === 1) {
      setZoom(2.5);
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  // CSS Filter string from adjustments
  const filterStyle = useMemo(() => {
    const parts: string[] = [];
    if (adjustments.brightness !== 0) parts.push(`brightness(${1 + adjustments.brightness / 100})`);
    if (adjustments.contrast !== 0) parts.push(`contrast(${1 + adjustments.contrast / 100})`);
    if (adjustments.saturation !== 0) parts.push(`saturate(${1 + adjustments.saturation / 100})`);
    if (adjustments.warmth !== 0) parts.push(`sepia(${Math.max(0, adjustments.warmth / 100)})`);

    const preset = FILTERS.find(f => f.id === adjustments.filter);
    if (preset?.css) parts.push(preset.css);

    return parts.join(' ');
  }, [adjustments]);

  // Native Windows Actions
  const handleSetWallpaper = async () => {
    if (!currentFile.fullPath) {
      showToast('Path not available for wallpaper');
      return;
    }
    const ok = await setAsWallpaper(currentFile.fullPath);
    showToast(ok ? 'Desktop background updated!' : 'Unable to set wallpaper');
  };

  const handleShowInExplorer = async () => {
    if (currentFile.fullPath) {
      await showInExplorer(currentFile.fullPath);
    }
  };

  const handleCopyPath = () => {
    if (currentFile.fullPath) {
      navigator.clipboard.writeText(currentFile.fullPath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
      showToast('File path copied to clipboard');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDeleteCurrentFile = async () => {
    if (!currentFile.fullPath) return;
    const confirmed = window.confirm(`Delete "${currentFile.name}"?`);
    if (!confirmed) return;

    const ok = await deleteLocalFile(currentFile.fullPath);
    if (ok) {
      showToast('Deleted file');
      const nextPlaylist = playlist.filter((_, i) => i !== currentIndex);
      if (nextPlaylist.length === 0) {
        onClose();
      } else {
        setPlaylist(nextPlaylist);
        setCurrentIndex(i => (i >= nextPlaylist.length ? nextPlaylist.length - 1 : i));
        resetView();
      }
    } else {
      showToast('Failed to delete file');
    }
  };

  // Render edited image to base64 and save to disk
  const handleSaveAdjustments = async (overwrite: boolean = false) => {
    if (!currentFile.fullPath || isSaving) return;
    setIsSaving(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = currentFile.url;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      // Account for rotation
      const rad = (rotation * Math.PI) / 180;
      const isSideways = rotation === 90 || rotation === 270;
      canvas.width = isSideways ? img.naturalHeight : img.naturalWidth;
      canvas.height = isSideways ? img.naturalWidth : img.naturalHeight;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.filter = filterStyle || 'none';
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();

      const base64Data = canvas.toDataURL('image/jpeg', 0.95);
      const res = await saveLocalImageFile(currentFile.fullPath, base64Data, overwrite);

      if (res.success && res.savedPath) {
        showToast(overwrite ? 'Original overwritten!' : `Saved as ${res.fileName}`);
        setMode('view');
      } else {
        showToast(res.error || 'Failed to save image');
      }
    } catch (err: any) {
      showToast(`Save error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const contextMenu = useContextMenu<WindowsPickedFile>((file) => [
    { kind: 'header', label: file.name },
    {
      id: 'back_catalog',
      label: 'Back to Catalog View',
      icon: <ArrowLeft size={14} className="text-[#FF8C00]" />,
      onSelect: () => (onBackToCatalog ? onBackToCatalog() : onClose()),
    },
    { kind: 'separator' },
    {
      id: 'send_fabula',
      label: 'Open in Fabula Video Editor',
      icon: <Film size={14} className="text-violet-400" />,
      onSelect: (f) => onSendToFabula?.(f),
    },
    {
      id: 'send_pixels',
      label: 'Edit in Plajah Pixels',
      icon: <Wand2 size={14} className="text-[#FF8C00]" />,
      onSelect: (f) => onSendToPixels?.(f),
    },
    {
      id: 'send_crossover',
      label: 'Send to Crossover',
      icon: <Layers size={14} className="text-pink-400" />,
      onSelect: (f) => onSendToCrossover?.(f),
    },
    {
      id: 'send_tela',
      label: 'Open in Tela Studio',
      icon: <Layout size={14} className="text-amber-300" />,
      onSelect: (f) => onSendToTela?.(f),
    },
    {
      id: 'develop',
      label: 'Develop & Tuning Suite',
      icon: <Sliders size={14} className="text-[#FF8C00]" />,
      shortcut: 'E',
      onSelect: () => setMode('edit'),
    },
    {
      id: 'spatial',
      label: 'Spatial 2.5D Parallax',
      icon: <Cuboid size={14} className="text-cyan-300" />,
      shortcut: 'S',
      onSelect: () => setMode('spatial'),
    },
    { kind: 'separator' },
    ...(isWindowsApp() ? [
      {
        id: 'wallpaper',
        label: 'Set as Desktop Wallpaper',
        icon: <Monitor size={14} className="text-[#FF8C00]" />,
        onSelect: () => handleSetWallpaper(),
      },
      {
        id: 'explorer',
        label: 'Show in File Explorer',
        icon: <FolderOpen size={14} className="text-amber-300" />,
        onSelect: () => handleShowInExplorer(),
      },
    ] : []),
    {
      id: 'copy_path',
      label: 'Copy Full Path',
      icon: <Copy size={14} />,
      onSelect: () => handleCopyPath(),
    },
    {
      id: 'print',
      label: 'Print Photo',
      icon: <Printer size={14} />,
      shortcut: 'Ctrl+P',
      onSelect: () => handlePrint(),
    },
    { kind: 'separator' },
    {
      id: 'delete',
      label: 'Delete File',
      icon: <Trash2 size={14} />,
      danger: true,
      shortcut: 'Del',
      onSelect: () => handleDeleteCurrentFile(),
    },
  ]);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col bg-[#07080b] text-white select-none overflow-hidden ${isFullscreen ? 'p-0' : ''}`}>
      {/* ── Top Header Toolbar (Plajah Brand Style) ───────────────────────── */}
      <header className={`h-14 shrink-0 px-4 bg-[#0d0f14]/95 backdrop-blur-xl border-b border-white/10 flex items-center justify-between z-30 ${isWindowsApp() ? 'pr-[145px]' : ''}`}>
        {/* Left: Return to Catalog & file summary */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => (onBackToCatalog ? onBackToCatalog() : onClose())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-white transition-colors shrink-0"
            title="Return to Catalog View"
          >
            <ArrowLeft size={14} className="text-[#FF8C00]" />
            <span className="hidden sm:inline">Catalog View</span>
          </button>
          <div className="p-1.5 rounded-lg bg-white/5 text-[#FF8C00] shrink-0">
            {isVideo ? <Film size={16} /> : isAudio ? <Music size={16} /> : <ImageIcon size={16} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold truncate max-w-xs sm:max-w-md" title={currentFile.name}>
              {currentFile.name}
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-white/40">
              <span>{currentIndex + 1} of {playlist.length}</span>
              {naturalSize && <span>· {naturalSize.width} × {naturalSize.height}</span>}
              {currentFile.size > 0 && <span>· {(currentFile.size / (1024 * 1024)).toFixed(1)} MB</span>}
            </div>
          </div>
        </div>

        {/* Center: Mode Switchers (View, Edit, Spatial 3D) */}
        {!isVideo && !isAudio && (
          <div className="hidden sm:flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl">
            <button
              onClick={() => setMode('view')}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors ${
                mode === 'view' ? 'bg-white/15 text-white shadow-sm' : 'text-white/40 hover:text-white'
              }`}
            >
              Inspect
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors ${
                mode === 'edit' ? 'bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/30 shadow-sm' : 'text-white/40 hover:text-white'
              }`}
            >
              <Sliders size={12} />
              Adjust
            </button>
            <button
              onClick={() => setMode('spatial')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors ${
                mode === 'spatial' ? 'bg-gradient-to-r from-[#D40055]/30 to-[#FF8C00]/30 text-[#FF8C00] border border-[#FF8C00]/40 shadow-sm' : 'text-white/40 hover:text-white'
              }`}
            >
              <Cuboid size={12} />
              Spatial 3D
            </button>
          </div>
        )}

        {/* Right: Actions & Window Controls */}
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          {!isVideo && !isAudio && mode !== 'spatial' && (
            <div className="hidden md:flex items-center gap-1 bg-white/5 rounded-lg px-1 py-0.5 border border-white/5 mr-2">
              <button
                onClick={() => setZoom(z => Math.max(0.2, Number((z - 0.25).toFixed(2))))}
                className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white"
                title="Zoom Out (Arrow Down)"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                className="px-2 py-1 text-[10px] font-mono text-white/70 hover:text-white"
                title="Reset to Fit (Z)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom(z => Math.min(8, Number((z + 0.25).toFixed(2))))}
                className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white"
                title="Zoom In (Arrow Up)"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}

          {/* Rotate */}
          {!isVideo && !isAudio && (
            <button
              onClick={() => setRotation(r => (r + 90) % 360)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
              title="Rotate 90° Clockwise (R)"
            >
              <RotateCw size={15} />
            </button>
          )}

          {/* Slideshow */}
          <button
            onClick={() => setIsSlideshow(s => !s)}
            className={`p-2 rounded-lg transition-colors ${
              isSlideshow ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'hover:bg-white/10 text-white/70 hover:text-white'
            }`}
            title={isSlideshow ? 'Pause Slideshow (Space)' : 'Start Slideshow (Space)'}
          >
            {isSlideshow ? <Pause size={15} /> : <Play size={15} />}
          </button>

          {/* EXIF Info */}
          <button
            onClick={() => setShowInfo(i => !i)}
            className={`p-2 rounded-lg transition-colors ${
              showInfo ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/70 hover:text-white'
            }`}
            title="Image Info & EXIF (I)"
          >
            <Info size={15} />
          </button>

          {/* More options menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(m => !m)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
              title="More Options"
            >
              <MoreVertical size={15} />
            </button>

            {showMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-56 bg-[#13161f] border border-white/15 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 backdrop-blur-2xl"
                onClick={() => setShowMenu(false)}
              >
                {isWindowsApp() && (
                  <>
                    <button
                      onClick={handleSetWallpaper}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                    >
                      <Monitor size={14} className="text-[#FF8C00]" />
                      Set as Desktop Wallpaper
                    </button>
                    <button
                      onClick={handleShowInExplorer}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                    >
                      <FolderOpen size={14} className="text-amber-300" />
                      Show in File Explorer
                    </button>
                  </>
                )}
                <button
                  onClick={handleCopyPath}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                >
                  <Copy size={14} />
                  Copy File Path
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                >
                  <Printer size={14} />
                  Print Photo
                </button>

                <div className="h-px bg-white/10 my-1" />

                {onSendToFabula && (
                  <button
                    onClick={() => onSendToFabula(currentFile)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                  >
                    <Film size={14} className="text-violet-400" />
                    Open in Fabula Video Editor
                  </button>
                )}
                {onSendToPixels && (
                  <button
                    onClick={() => onSendToPixels(currentFile)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                  >
                    <Wand2 size={14} className="text-[#FF8C00]" />
                    Edit in Plajah Pixels
                  </button>
                )}
                {onSendToCrossover && (
                  <button
                    onClick={() => onSendToCrossover(currentFile)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                  >
                    <Layers size={14} className="text-pink-400" />
                    Send to Crossover
                  </button>
                )}
                {onSendToTela && (
                  <button
                    onClick={() => onSendToTela(currentFile)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                  >
                    <Layout size={14} className="text-amber-300" />
                    Open in Tela Studio
                  </button>
                )}
                {onSendToSalon && (
                  <button
                    onClick={() => onSendToSalon(currentFile)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 text-left"
                  >
                    <Sparkles size={14} className="text-cyan-300" />
                    Publish to Weekly Salon
                  </button>
                )}

                <div className="h-px bg-white/10 my-1" />

                <button
                  onClick={handleDeleteCurrentFile}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 text-left"
                >
                  <Trash2 size={14} />
                  Delete File (Del)
                </button>
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-red-500/20 hover:text-red-300 text-white/70 transition-colors ml-1"
            title="Close Viewer (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ── Main Viewport Area ───────────────────────────────────────────── */}
      <div className="flex-1 relative flex overflow-hidden min-h-0 bg-[#060709]">
        {/* Central Display Canvas with Context Menu Binding */}
        <main
          className="flex-1 relative flex items-center justify-center overflow-hidden cursor-default"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          {...contextMenu.bind(currentFile)}
        >
          {isVideo ? (
            <div className="w-full h-full max-w-6xl max-h-[85vh] p-4 flex flex-col items-center justify-center relative group">
              <video
                ref={videoRef}
                src={currentFile.url}
                autoPlay
                className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl bg-black object-contain cursor-pointer"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setVideoCurrentTime(videoRef.current.currentTime);
                  }
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setVideoDuration(videoRef.current.duration || 0);
                  }
                }}
                onClick={() => {
                  if (videoRef.current) {
                    if (videoRef.current.paused) videoRef.current.play();
                    else videoRef.current.pause();
                  }
                }}
              />

              {/* Video Transport Floating Bar (Parity with native player) */}
              <div className="w-full max-w-3xl mt-3 px-4 py-2.5 rounded-2xl bg-[#0d0f14]/90 border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col gap-2">
                {/* Timeline Scrubber */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-white/60 shrink-0 min-w-[36px]">
                    {formatTime(videoCurrentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 100}
                    step={0.01}
                    value={videoCurrentTime}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setVideoCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                    className="flex-1 accent-[#FF8C00] h-1.5 rounded-lg cursor-pointer bg-white/15"
                  />
                  <span className="text-[10px] font-mono text-white/40 shrink-0 min-w-[36px]">
                    {formatTime(videoDuration)}
                  </span>
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          if (videoRef.current.paused) videoRef.current.play();
                          else videoRef.current.pause();
                        }
                      }}
                      className="p-2 rounded-xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white hover:scale-105 transition-all shadow-md"
                      title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
                    </button>

                    {/* Step frame backward */}
                    <button
                      onClick={() => stepFrame(false)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                      title="Step Backward 1 Frame (,)"
                    >
                      <SkipBack size={14} />
                    </button>

                    {/* Step frame forward */}
                    <button
                      onClick={() => stepFrame(true)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                      title="Step Forward 1 Frame (.)"
                    >
                      <SkipForward size={14} />
                    </button>

                    {/* Volume */}
                    <div className="flex items-center gap-1.5 ml-2">
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.muted = !isMuted;
                            setIsMuted(!isMuted);
                          }
                        }}
                        className="p-1.5 rounded-lg text-white/60 hover:text-white"
                      >
                        {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setVolume(v);
                          setIsMuted(false);
                          if (videoRef.current) {
                            videoRef.current.volume = v;
                            videoRef.current.muted = false;
                          }
                        }}
                        className="w-16 accent-[#FF8C00] h-1 bg-white/15 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Speed selector */}
                    <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/5">
                      {[0.5, 1, 1.5, 2].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => {
                            setPlaybackSpeed(spd);
                            if (videoRef.current) videoRef.current.playbackRate = spd;
                          }}
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${
                            playbackSpeed === spd ? 'bg-[#FF8C00] text-black font-black' : 'text-white/50 hover:text-white'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>

                    {/* Fullscreen */}
                    <button
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                      title="Toggle Fullscreen (F)"
                    >
                      {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center gap-6 p-8 max-w-lg w-full bg-white/[0.03] border border-white/10 rounded-3xl backdrop-blur-xl">
              <div className="w-40 h-40 rounded-2xl bg-gradient-to-tr from-[#6B0099]/30 via-[#D40055]/30 to-[#FF8C00]/30 border border-white/15 flex items-center justify-center shadow-2xl">
                <Music size={56} className="text-[#FF8C00] animate-pulse" />
              </div>
              <div className="text-center">
                <h3 className="text-base font-black truncate max-w-xs">{currentFile.name}</h3>
                <p className="text-xs text-white/40 mt-1">Windows Audio Native Track</p>
              </div>
              <audio
                ref={audioRef}
                src={currentFile.url}
                controls
                autoPlay
                className="w-full"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          ) : mode === 'spatial' ? (
            <div className="w-full h-full p-6 flex items-center justify-center">
              <React.Suspense fallback={null}>
                <SpatialMedia
                  url={currentFile.url}
                  alt={currentFile.name}
                  forceDepth
                  className="w-full h-full max-w-5xl max-h-[82vh]"
                  roundedClassName="rounded-2xl shadow-2xl"
                />
              </React.Suspense>
            </div>
          ) : (
            <div
              className="relative max-w-full max-h-full transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transformOrigin: 'center center',
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }}
            >
              {imageError && !blobCache[currentFile.fullPath || currentFile.name] ? (
                <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
                  <div className="w-12 h-12 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/20 flex items-center justify-center animate-pulse">
                    <ImageIcon size={24} className="text-[#FF8C00]" />
                  </div>
                  <p className="text-xs font-bold text-white/70">Opening photo...</p>
                  <button
                    onClick={() => recoverImage(currentFile)}
                    className="text-[10px] text-[#FF8C00] hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <img
                  src={getMediaUrl(currentFile)}
                  alt=""
                  className="max-w-[90vw] max-h-[80vh] object-contain select-none pointer-events-none rounded-lg shadow-2xl"
                  style={{ filter: filterStyle || undefined }}
                  onLoad={e => {
                    const img = e.currentTarget;
                    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                    setImageError(false);
                  }}
                  onError={() => {
                    setImageError(true);
                    recoverImage(currentFile);
                  }}
                />
              )}
            </div>
          )}

          {/* Floating Left/Right Prev/Next Buttons */}
          {playlist.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3.5 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white transition-all shadow-2xl backdrop-blur-md group z-30 cursor-pointer active:scale-95"
                title="Previous Photo (Left Arrow)"
              >
                <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform text-[#FF8C00]" />
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3.5 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white transition-all shadow-2xl backdrop-blur-md group z-30 cursor-pointer active:scale-95"
                title="Next Photo (Right Arrow)"
              >
                <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform text-[#FF8C00]" />
              </button>
            </>
          )}

          {/* Toast Notification Banner */}
          {statusMessage && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 border border-[#FF8C00]/40 text-xs font-bold text-[#FF8C00] shadow-2xl backdrop-blur-xl animate-fade-in flex items-center gap-2">
              <Sparkles size={13} className="text-[#FF8C00]" />
              {statusMessage}
            </div>
          )}
        </main>

        {/* ── Edit Drawer Panel (Adjustments & LUTs) ────────────────────── */}
        {mode === 'edit' && (
          <aside className="w-80 shrink-0 border-l border-white/10 bg-[#0d0f14]/95 backdrop-blur-2xl p-5 overflow-y-auto flex flex-col gap-5 z-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-[#FF8C00]" />
                <h3 className="text-xs font-black uppercase tracking-wider">Tuning & LUTs</h3>
              </div>
              <button
                onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                className="flex items-center gap-1 text-[10px] font-bold text-white/40 hover:text-white"
                title="Reset all adjustments"
              >
                <Undo size={12} />
                Reset
              </button>
            </div>

            {/* LUT Filters Grid */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2.5">Artistic Presets</p>
              <div className="grid grid-cols-2 gap-2">
                {FILTERS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setAdjustments(adj => ({ ...adj, filter: f.id }))}
                    className={`py-2 px-3 rounded-xl text-left border text-[10px] font-bold transition-all ${
                      adjustments.filter === f.id
                        ? 'bg-[#FF8C00]/20 border-[#FF8C00] text-[#FF8C00]'
                        : 'bg-white/5 border-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Color & Exposure</p>

              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span>Exposure</span>
                  <span className="text-white/40">{adjustments.brightness}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.brightness}
                  onChange={e => setAdjustments(adj => ({ ...adj, brightness: Number(e.target.value) }))}
                  className="w-full accent-[#FF8C00]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span>Contrast</span>
                  <span className="text-white/40">{adjustments.contrast}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.contrast}
                  onChange={e => setAdjustments(adj => ({ ...adj, contrast: Number(e.target.value) }))}
                  className="w-full accent-[#FF8C00]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span>Saturation</span>
                  <span className="text-white/40">{adjustments.saturation}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.saturation}
                  onChange={e => setAdjustments(adj => ({ ...adj, saturation: Number(e.target.value) }))}
                  className="w-full accent-[#FF8C00]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span>Warmth / Temp</span>
                  <span className="text-white/40">{adjustments.warmth}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.warmth}
                  onChange={e => setAdjustments(adj => ({ ...adj, warmth: Number(e.target.value) }))}
                  className="w-full accent-[#FF8C00]"
                />
              </div>
            </div>

            {/* Transform operations */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2.5">Geometry</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFlipH(f => !f)}
                  className={`py-2 px-3 rounded-xl border text-[10px] font-bold flex items-center justify-center gap-1.5 ${
                    flipH ? 'bg-[#FF8C00]/20 border-[#FF8C00] text-[#FF8C00]' : 'bg-white/5 border-white/5 text-white/60'
                  }`}
                >
                  <FlipHorizontal size={13} />
                  Flip H
                </button>
                <button
                  onClick={() => setFlipV(f => !f)}
                  className={`py-2 px-3 rounded-xl border text-[10px] font-bold flex items-center justify-center gap-1.5 ${
                    flipV ? 'bg-[#FF8C00]/20 border-[#FF8C00] text-[#FF8C00]' : 'bg-white/5 border-white/5 text-white/60'
                  }`}
                >
                  <FlipVertical size={13} />
                  Flip V
                </button>
              </div>
            </div>

            {/* Save Actions */}
            <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-2">
              <button
                onClick={() => handleSaveAdjustments(false)}
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white text-[10px] font-black uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 shadow-lg"
              >
                {isSaving ? 'Exporting...' : 'Save as Copy'}
              </button>
              <button
                onClick={() => handleSaveAdjustments(true)}
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Overwrite Original
              </button>
            </div>
          </aside>
        )}

        {/* ── EXIF & Details Inspector Flyout ───────────────────────────── */}
        {showInfo && (
          <aside className="w-80 shrink-0 border-l border-white/10 bg-[#0d0f14]/95 backdrop-blur-2xl p-5 overflow-y-auto flex flex-col gap-5 z-20 animate-slide-in-right">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#FF8C00]">
                <Info size={16} />
                <h3 className="text-xs font-black uppercase tracking-wider">File & Camera Info</h3>
              </div>
              <button onClick={() => setShowInfo(false)} className="text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>

            {/* File info card */}
            <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
              <div>
                <p className="text-[8px] uppercase tracking-widest text-white/30">File Name</p>
                <p className="text-xs font-bold break-all mt-0.5">{currentFile.name}</p>
              </div>

              {currentFile.folderPath && (
                <div>
                  <p className="text-[8px] uppercase tracking-widest text-white/30">Directory</p>
                  <p className="text-[11px] text-white/60 font-mono break-all mt-0.5">{currentFile.folderPath}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[8px] uppercase tracking-widest text-white/30">Dimensions</p>
                  <p className="text-xs font-bold mt-0.5">
                    {naturalSize ? `${naturalSize.width} × ${naturalSize.height}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-widest text-white/30">Megapixels</p>
                  <p className="text-xs font-bold mt-0.5">
                    {naturalSize ? `${((naturalSize.width * naturalSize.height) / 1_000_000).toFixed(1)} MP` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-widest text-white/30">File Size</p>
                  <p className="text-xs font-bold mt-0.5">
                    {currentFile.size > 0 ? `${(currentFile.size / (1024 * 1024)).toFixed(2)} MB` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-widest text-white/30">Modified</p>
                  <p className="text-xs font-bold mt-0.5">
                    {currentFile.lastModified ? new Date(currentFile.lastModified).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Camera / Capture Simulation */}
            <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#FF8C00]">Exposure Profile</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-white/5">
                  <p className="text-[7px] uppercase tracking-widest text-white/30">ISO</p>
                  <p className="text-xs font-bold mt-0.5">100</p>
                </div>
                <div className="p-2 rounded-xl bg-white/5">
                  <p className="text-[7px] uppercase tracking-widest text-white/30">Aperture</p>
                  <p className="text-xs font-bold mt-0.5">ƒ/1.8</p>
                </div>
                <div className="p-2 rounded-xl bg-white/5">
                  <p className="text-[7px] uppercase tracking-widest text-white/30">Shutter</p>
                  <p className="text-xs font-bold mt-0.5">1/250s</p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 mt-auto">
              <button
                onClick={handleCopyPath}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center justify-center gap-2"
              >
                {copiedPath ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedPath ? 'Path Copied' : 'Copy Full Path'}
              </button>

              {isWindowsApp() && (
                <button
                  onClick={handleShowInExplorer}
                  className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <FolderOpen size={14} className="text-amber-300" />
                  Show in Explorer
                </button>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── Bottom Filmstrip Thumbnail Carousel ──────────────────────────── */}
      {showFilmstrip && playlist.length > 1 && (
        <footer className="h-20 shrink-0 bg-[#0d0f14]/90 backdrop-blur-xl border-t border-white/10 px-4 py-2 flex items-center gap-3 z-30">
          <button
            onClick={() => setShowFilmstrip(false)}
            className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white"
            title="Hide filmstrip"
          >
            Hide
          </button>

          <div
            ref={filmstripRef}
            className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar h-full py-1"
          >
            {playlist.map((item, idx) => {
              const isSelected = idx === currentIndex;
              return (
                <button
                  key={item.fullPath || item.url || idx}
                  onClick={() => selectPhoto(idx)}
                  className={`h-14 aspect-square rounded-xl overflow-hidden shrink-0 relative transition-all border ${
                    isSelected
                      ? 'border-[#FF8C00] ring-2 ring-[#FF8C00]/40 scale-105 shadow-lg'
                      : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'
                  }`}
                >
                  <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-white/20">
                    <ImageIcon size={14} />
                  </div>
                  <img
                    src={getMediaUrl(item)}
                    alt=""
                    className="w-full h-full object-cover relative z-10"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = '0';
                    }}
                  />
                  {isVideoFile(item.name) && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Film size={12} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <span className="text-[10px] text-white/30 font-mono shrink-0">
            {currentIndex + 1} / {playlist.length}
          </span>
        </footer>
      )}

      {/* Toggle button if filmstrip hidden */}
      {!showFilmstrip && playlist.length > 1 && (
        <button
          onClick={() => setShowFilmstrip(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 border border-white/10 text-[9px] font-bold text-white/60 hover:text-white backdrop-blur-md z-30"
        >
          Show Filmstrip
        </button>
      )}

      {/* Plajah Command Context Menu */}
      {contextMenu.node}
    </div>
  );
}
