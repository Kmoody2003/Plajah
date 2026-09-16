import { startVoiceSoundscape } from '../services/voiceSoundscapeEngine';
import { matchReferenceChapters } from '../services/vaultAccuracy';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArchiveTrack, enrichAudiobookTrack } from '../services/archiveContentService';
import {
  getPassagesForAudiobook,
  tokenizePassagesToWords,
  getActiveWordIndex,
  SynchronizedWord,
  TimestampedPassage
} from '../services/audiobookSyncService';
import { Album, Track } from '../types';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { fetchBookText, formatReadableText, parseChaptersFromText, ParsedChapter } from '../services/bookContentService';
import { findClassicBook, getClassicBookTextUrl } from '../data/classicBooks';
import {
  ArrowLeft, Play, Pause, RotateCcw, FastForward, Maximize2, Minimize2,
  BookOpen, Clock, Moon, Bookmark, Share2, Layers, Volume2, Sparkles,
  ChevronRight, ChevronLeft, Type, Check, X, Compass, Award, ExternalLink, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';

export interface VaultAudiobookViewProps {
  track: ArchiveTrack;
  album?: Album | null;
  onBack: () => void;
  onNavigate?: (view: string) => void;
}

export const VaultAudiobookView: React.FC<VaultAudiobookViewProps> = ({
  track: initialTrack,
  album,
  onBack,
  onNavigate,
}) => {
  // Ensure track is enriched with full audiobook metadata, chapters, and literary dossier
  const track = useMemo(() => {
    return initialTrack.chapters ? initialTrack : enrichAudiobookTrack(initialTrack);
  }, [initialTrack]);

  const chapters = track.chapters || [];
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  useEffect(() => { setActiveChapterIdx(0); }, [track.id]);
  const activeChapter = chapters[activeChapterIdx] || {
    id: `${track.id}-ch1`,
    title: track.title,
    duration: 1200,
    url: track.url,
    chapterNumber: 1
  };

  const {
    currentTrack,
    isPlaying: globalIsPlaying,
    playTrack,
    togglePlay,
    analyser,
    playbackRate,
    setPlaybackRate,
  } = useGlobalPlayerState();

  const { currentTime, duration, seek, skipSeconds } = useGlobalPlayerProgress();

  const isCurrentPlaying = (currentTrack?.id === activeChapter.id || currentTrack?.url === activeChapter.url) && globalIsPlaying;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSerif, setIsSerif] = useState(true);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [showChaptersDrawer, setShowChaptersDrawer] = useState(false);
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
  const [activeSleepTimer, setActiveSleepTimer] = useState<number | null>(null);
  const [sleepTimerLabel, setSleepTimerLabel] = useState<string | null>(null);
  const [showBookmarkToast, setShowBookmarkToast] = useState(false);
  const [bookmarks, setBookmarks] = useState<Array<{ chapterIdx: number; time: number; note: string }>>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textScrollRef = useRef<HTMLDivElement>(null);

  // Play a specific chapter
  const handlePlayChapter = (idx: number) => {
    const ch = chapters[idx];
    if (!ch) return;
    setActiveChapterIdx(idx);

    const vTrack: Track = {
      id: ch.id,
      title: ch.title,
      artist: track.artist,
      url: ch.url || track.url,
      albumCover: track.thumbnailUrl,
      images: [track.thumbnailUrl],
      genre: 'Audiobook',
      kind: 'AUDIOBOOK',
      isGlobalArchive: true,
      duration: ch.duration,
    };

    const vAlbum: Album = album || {
      id: `vault_audiobook_${track.id}`,
      title: track.title,
      artist: track.artist,
      coverImage: track.thumbnailUrl,
      tracks: chapters.map((c, i) => ({
        id: c.id,
        title: c.title,
        artist: track.artist,
        url: c.url || track.url,
        albumCover: track.thumbnailUrl,
        genre: 'Audiobook',
        kind: 'AUDIOBOOK',
        duration: c.duration,
        trackNumber: i + 1,
      })),
      createdAt: Date.now(),
      themeColor: '#D40055',
      type: 'BOOK',
      subType: 'AUDIOBOOK',
      genre: 'Audiobook',
      description: track.whyItExists || track.description,
    };

    playTrack(vTrack, vAlbum, 'LIBRARY');
  };

  // Chapter navigation helpers
  const handleNextChapter = () => {
    if (activeChapterIdx < chapters.length - 1) {
      handlePlayChapter(activeChapterIdx + 1);
    }
  };

  const handlePrevChapter = () => {
    if (activeChapterIdx > 0) {
      handlePlayChapter(activeChapterIdx - 1);
    }
  };

  // Two-way sync: when global player advances (via onEnded or next), sync activeChapterIdx
  useEffect(() => {
    if (!currentTrack) return;
    const idx = chapters.findIndex(c => c.id === currentTrack.id || (c.url && c.url === currentTrack.url));
    if (idx !== -1 && idx !== activeChapterIdx) {
      setActiveChapterIdx(idx);
    }
  }, [currentTrack?.id, currentTrack?.url, chapters, activeChapterIdx]);

  // Chapter auto-advance when reaching the end of the chapter stream
  const autoAdvanceRef = useRef(false);
  useEffect(() => {
    if (!isCurrentPlaying || duration <= 0) {
      autoAdvanceRef.current = false;
      return;
    }
    if (currentTime >= duration - 0.75 && !autoAdvanceRef.current) {
      autoAdvanceRef.current = true;
      if (activeChapterIdx < chapters.length - 1) {
        handlePlayChapter(activeChapterIdx + 1);
      }
    } else if (currentTime < duration - 2) {
      autoAdvanceRef.current = false;
    }
  }, [currentTime, duration, isCurrentPlaying, activeChapterIdx, chapters.length]);

  // Play current active chapter or toggle playback
  const handleTogglePlay = () => {
    if (currentTrack?.id === activeChapter.id || currentTrack?.url === activeChapter.url) {
      togglePlay();
    } else {
      handlePlayChapter(activeChapterIdx);
    }
  };

  // Sleep timer effect
  useEffect(() => {
    if (!activeSleepTimer) return;
    const timer = setTimeout(() => {
      togglePlay();
      setActiveSleepTimer(null);
      setSleepTimerLabel(null);
    }, activeSleepTimer * 1000);
    return () => clearTimeout(timer);
  }, [activeSleepTimer]);

  const handleSetSleepTimer = (seconds: number, label: string) => {
    setActiveSleepTimer(seconds);
    setSleepTimerLabel(label);
    setShowSleepTimerModal(false);
  };

  // Bookmark timestamp
  const handleAddBookmark = () => {
    setBookmarks(prev => [
      ...prev,
      {
        chapterIdx: activeChapterIdx,
        time: currentTime,
        note: `${activeChapter.title} at ${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}`
      }
    ]);
    setShowBookmarkToast(true);
    setTimeout(() => setShowBookmarkToast(false), 3000);
  };

  // Spoken-word acoustic resonance visualizer (Vocal Formants & Dynamic Auto-Gain Terrain)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startVoiceSoundscape(canvas, analyser, isCurrentPlaying, {
      theme: 'audiobook',
      heightScale: 0.85,
    });
  }, [analyser, isCurrentPlaying]);

  // ── Lorea Literary Engine: Fetch & Parse Authentic Book Prose (Project Gutenberg / Lorea CDN) ──
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>([]);
  const [isLoadingBookText, setIsLoadingBookText] = useState(false);
  const [bookTextLoaded, setBookTextLoaded] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setParsedChapters([]);
    setBookTextLoaded(false);
    setIsLoadingBookText(false);

    const loadLoreaBookText = async () => {
      // 1. If album already provides bookChapters with full text, use them
      if (album?.bookChapters && album.bookChapters.some(c => c.content && c.content.trim().length > 30)) {
        const fromAlbum: ParsedChapter[] = album.bookChapters.map(c => ({
          title: c.title,
          body: c.content || '',
          pages: [c.content ? [c.content] : []]
        }));
        setParsedChapters(fromAlbum);
        setBookTextLoaded(true);
        return;
      }

      // 2. Resolve book text URL from Lorea classicBooks catalog or formats
      const candidateUrl = (album?.formats?.['text/plain'] as string)
        || (album?.formats?.['text/plain; charset=utf-8'] as string)
        || getClassicBookTextUrl(track.title || track.id);

      if (!candidateUrl) return;

      try {
        setIsLoadingBookText(true);
        const rawText = await fetchBookText(candidateUrl);
        if (isCancelled) return;

        const formatted = formatReadableText(rawText);
        const parsed = parseChaptersFromText(formatted);
        if (isCancelled) return;

        if (parsed && parsed.length > 0) {
          setParsedChapters(parsed);
          setBookTextLoaded(true);
        }
      } catch (err) {
        console.warn('[VaultAudiobookView] Lorea text engine fetch error:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingBookText(false);
        }
      }
    };

    loadLoreaBookText();

    return () => {
      isCancelled = true;
    };
  }, [track.id, track.title, album]);

  const { currentChapterText, matchedBookChapterIdx } = useMemo(() => {
    const indices = matchReferenceChapters(activeChapter.title, parsedChapters.map(p => p.title));
    if (!indices.length) return { currentChapterText: null, matchedBookChapterIdx: -1 };
    return {
      currentChapterText: indices.map(i => parsedChapters[i].body || parsedChapters[i].pages?.flat().join('\n\n') || '').join('\n\n'),
      matchedBookChapterIdx: indices[0],
    };
  }, [parsedChapters, activeChapter.title]);

  // ── Precision Verbatim Synchronized Read-Along Alignment ──
  const [manualPageIdx, setManualPageIdx] = useState<number | null>(null);

  // Retrieve authentic timestamped passages (curated verbatim, Lorea parsed text, or calibrated speech timings)
  const passages = useMemo(() => {
    return getPassagesForAudiobook(track, album, activeChapterIdx, duration, currentChapterText, activeChapter.title);
  }, [track, album, activeChapterIdx, duration, currentChapterText, activeChapter.title]);
  const hasVerifiedTiming = passages.length > 0 && passages.every(p => p.timed);

  // Preamble timing: detect when audio is in introductory spoken announcement
  const preamblePassage = useMemo(() => {
    return passages.find(p => p.id === 'preamble' || p.heading?.toLowerCase().includes('preamble') || p.heading?.toLowerCase().includes('prologue'));
  }, [passages]);
  const preambleEnd = preamblePassage ? preamblePassage.end : 0;
  const isInPreamble = preambleEnd > 0 && currentTime < preambleEnd;

  // Tokenize passages into individual timestamped words
  const synchronizedWords = useMemo(() => {
    return tokenizePassagesToWords(passages);
  }, [passages]);

  // High-precision active word index matching current audio playback timestamp
  const activeWordIdx = useMemo(() => {
    if (!hasVerifiedTiming || !isCurrentPlaying || !synchronizedWords.length) return -1;
    return getActiveWordIndex(synchronizedWords, currentTime);
  }, [hasVerifiedTiming, isCurrentPlaying, currentTime, synchronizedWords]);

  const activeWord = synchronizedWords[activeWordIdx];
  const activePassage = useMemo(() => {
    if (!passages.length) return null;
    const pIdx = activeWord?.passageIdx ?? 0;
    return passages[pIdx] || passages[0];
  }, [passages, activeWord]);

  // Paginate words into readable book folio spreads (120 words per spread)
  const WORDS_PER_PAGE = 120;
  const totalBookPages = Math.max(1, Math.ceil(synchronizedWords.length / WORDS_PER_PAGE));
  const autoPageIdx = Math.max(0, Math.floor(activeWordIdx / WORDS_PER_PAGE));
  const effectivePageIdx = manualPageIdx !== null ? manualPageIdx : autoPageIdx;

  // Reset manual page override on chapter change
  useEffect(() => {
    setManualPageIdx(null);
  }, [track.id, activeChapterIdx]);

  // Dual-folio open book spread (Left Folio & Right Folio)
  const leftPageWords = useMemo(() => {
    const half = Math.ceil(WORDS_PER_PAGE / 2);
    const start = effectivePageIdx * WORDS_PER_PAGE;
    return synchronizedWords.slice(start, start + half);
  }, [synchronizedWords, effectivePageIdx]);

  const rightPageWords = useMemo(() => {
    const half = Math.ceil(WORDS_PER_PAGE / 2);
    const start = effectivePageIdx * WORDS_PER_PAGE + half;
    return synchronizedWords.slice(start, start + half);
  }, [synchronizedWords, effectivePageIdx]);

  // Click any word to jump audio playback to that exact word's timestamp
  const handleSeekToWord = (targetWord: SynchronizedWord) => {
    if (!hasVerifiedTiming) return;
    if (targetWord && typeof targetWord.start === 'number') {
      seek(targetWord.start);
      setManualPageIdx(null);
    }
  };

  // Open in Lorea BookReader with full parsed chapters and exact active chapter
  const handleOpenLoreaReader = () => {
    const classic = findClassicBook(track.title || track.id);
    const resolvedTitle = classic?.title || track.title;
    const resolvedAuthor = classic?.authors?.[0] || track.artist;
    const resolvedCover = classic?.coverImage || track.thumbnailUrl;
    const resolvedId = classic ? `guttenberg-${classic.id}` : `vault-${track.id}`;

    const targetChapterIdx = matchedBookChapterIdx >= 0 ? matchedBookChapterIdx : activeChapterIdx;

    let bookChapters: any[] = [];
    if (parsedChapters.length > 0) {
      bookChapters = parsedChapters.map((p, idx) => ({
        id: `ch-${idx}`,
        chapterNumber: idx + 1,
        title: p.title,
        content: p.body || p.pages.flat().join('\n\n'),
        pages: p.pages.map((pg, pIdx) => ({
          id: `p-${idx}-${pIdx}`,
          pageNumber: pIdx + 1,
          content: Array.isArray(pg) ? pg.join('\n') : String(pg)
        }))
      }));
    } else if (classic?.formats) {
      const epubUrl = classic.formats['application/epub+zip'] || Object.values(classic.formats).find(f => typeof f === 'string' && f.includes('epub'));
      const storedUrl = classic.formats['text/plain; charset=utf-8'];
      const gutenbUrl = classic.formats['text/plain'];
      const primaryUrl = (epubUrl || storedUrl || gutenbUrl || '') as string;
      const isEpubPrimary = !!epubUrl;
      const txtFallback = gutenbUrl || storedUrl || undefined;
      bookChapters = [{
        id: 'full-text',
        title: 'Complete Work',
        url: primaryUrl,
        format: isEpubPrimary ? 'EPUB' : 'TXT',
        ...(isEpubPrimary && txtFallback ? { fallbackUrl: txtFallback } : !isEpubPrimary && storedUrl && gutenbUrl ? { fallbackUrl: gutenbUrl } : {}),
      }];
    }

    const loreaBook: Album = {
      id: resolvedId,
      title: resolvedTitle,
      artist: resolvedAuthor,
      coverImage: resolvedCover,
      type: 'BOOK',
      subType: 'BOOK',
      genre: classic?.subjects?.[0] || 'Classic Literature',
      description: classic?.subjects?.join(', ') || track.whyItExists || track.description || '',
      formats: classic?.formats,
      bookChapters,
      initialChapterIndex: targetChapterIdx,
      skipOpeningScene: true,
      createdAt: Date.now(),
    } as any;

    try {
      localStorage.setItem(`lorea_pos_${resolvedId}`, JSON.stringify({ chapter: targetChapterIdx, page: 0 }));
    } catch {}

    window.dispatchEvent(new CustomEvent('OPEN_LOREA_READER', {
      detail: {
        book: loreaBook,
        chapterIndex: targetChapterIdx
      }
    }));
  };

  return (
    <div className={`w-full min-h-screen bg-[#06040A] text-white flex flex-col transition-all duration-700 select-none overflow-x-hidden ${
      isFullscreen ? 'fixed inset-0 z-50 p-4 sm:p-8' : 'relative p-4 sm:p-8 pb-36'
    }`}>

      {/* Ambient Plajah Gradient Aura */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#6B0099]/15 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="absolute bottom-20 right-1/4 w-[600px] h-[600px] bg-[#D40055]/15 rounded-full blur-[180px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[#FF8C00]/10 rounded-full blur-[200px] pointer-events-none -z-10" />

      {/* ── HEADER NAVIGATION BAR ── */}
      <header className="flex items-center justify-between pb-6 border-b border-white/10 max-w-7xl mx-auto w-full">
        <button
          onClick={onBack}
          className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Exit Pavilion</span>
        </button>

        {/* Center Pill Badge: Hybrid Option B Wordmark */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#6B0099]/30 via-[#D40055]/30 to-[#FF8C00]/30 border border-white/15 backdrop-blur-xl shadow-[0_0_20px_rgba(212,0,85,0.2)]">
          <BookOpen size={13} className="text-[#00DAF3]" />
          <span className="text-[9px] font-black uppercase tracking-[0.25em] bg-gradient-to-r from-[#00DAF3] via-white to-[#FF8C00] bg-clip-text text-transparent">
            Audiobook Exhibition Pavilion · Grand Folio
          </span>
        </div>

        {/* Right Tools: Chapters Drawer & Fullscreen */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChaptersDrawer(!showChaptersDrawer)}
            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
              showChaptersDrawer ? 'bg-[#00DAF3] text-black border-[#00DAF3]' : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            }`}
          >
            <Layers size={13} />
            <span className="hidden sm:inline">Table of Contents</span>
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all"
            title="Toggle Fullscreen Pavilion"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* ── MAIN FOLIO EXHIBITION CONTENT ── */}
      <main className="max-w-7xl mx-auto w-full flex-1 flex flex-col space-y-8 mt-6">

        {/* ── CHAPTER TIMELINE RIBBON (Integrated from Concept 2) ── */}
        <section className="p-4 sm:p-5 rounded-3xl bg-[#140D20]/90 border border-white/10 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Compass size={13} className="text-[#00DAF3]" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70">
                Chapter Timeline Ribbon
              </span>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-mono">
              <span className="text-[#00DAF3] font-bold uppercase">
                Chapter {activeChapterIdx + 1} of {chapters.length}
              </span>
              <span className="text-white/40">·</span>
              <span className="text-white/50">{activeChapter.title}</span>
            </div>
          </div>

          {/* Interactive Multi-Node Ribbon */}
          <div className="relative py-3">
            {/* Background Gradient Bar */}
            <div className="absolute top-1/2 left-3 right-3 h-1 -translate-y-1/2 bg-white/10 rounded-full" />
            <div
              className="absolute top-1/2 left-3 h-1 -translate-y-1/2 bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#00DAF3] rounded-full transition-all duration-300"
              style={{ width: `${((activeChapterIdx + 1) / Math.max(1, chapters.length)) * 100}%` }}
            />

            {/* Chapter Nodes */}
            <div className="relative flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-2">
              {chapters.map((ch, idx) => {
                const isActive = idx === activeChapterIdx;
                const isPassed = idx < activeChapterIdx;
                return (
                  <button
                    key={ch.id || idx}
                    onClick={() => handlePlayChapter(idx)}
                    className="group flex flex-col items-center shrink-0 px-2 focus:outline-none transition-transform hover:scale-105"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-mono font-bold transition-all ${
                        isActive
                          ? 'bg-[#00DAF3] text-black ring-4 ring-[#00DAF3]/40 shadow-[0_0_20px_#00DAF3] scale-110'
                          : isPassed
                            ? 'bg-[#D40055] text-white'
                            : 'bg-white/10 text-white/40 group-hover:bg-white/20 group-hover:text-white'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-wider mt-1.5 max-w-[85px] truncate text-center transition-colors ${
                      isActive ? 'text-[#00DAF3]' : 'text-white/40 group-hover:text-white/80'
                    }`}>
                      Ch. {idx + 1}
                    </span>
                    {ch.duration && (
                      <span className="text-[7px] font-mono text-white/30">
                        {Math.floor(ch.duration / 60)}m
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── THE GRAND FOLIO READING SANCTUARY (Left Book Jacket + Center Two-Column Reader) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">

          {/* ── LEFT WING: Ornate Hardcover Book & Archival Artifact ── */}
          <aside className="lg:col-span-4 flex flex-col space-y-6">

            {/* 3D Hardcover Book Jacket with Gold Filigree */}
            <div className="relative p-6 sm:p-8 rounded-[2.5rem] bg-gradient-to-b from-[#181126] to-[#0D0714] border border-white/15 shadow-2xl overflow-hidden group">
              {/* Dynamic Aura behind Cover */}
              <div className="absolute inset-0 bg-gradient-to-tr from-[#6B0099]/30 via-transparent to-[#FF8C00]/20 pointer-events-none" />

              {/* Ornate Book Spine & Gold Filigree Frame */}
              <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden relative shadow-[0_25px_60px_rgba(0,0,0,0.8)] border-2 border-amber-500/30 p-2 bg-gradient-to-br from-amber-900/30 via-black to-purple-950/40 flex flex-col justify-between">
                
                {/* Filigree Corner Accents */}
                <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-amber-400/80 pointer-events-none" />
                <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-amber-400/80 pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-amber-400/80 pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-amber-400/80 pointer-events-none" />

                {/* Inner Book Cover Art */}
                <img
                  src={thumb(track.thumbnailUrl, THUMB.large) || undefined}
                  onError={onThumbError(track.thumbnailUrl)}
                  className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-luminosity group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60 pointer-events-none" />

                {/* Foil Header Label */}
                <div className="relative z-10 text-center pt-4">
                  <span className="text-[8px] font-mono tracking-[0.4em] uppercase text-amber-300/80 drop-shadow">
                    {track.historicalEra || 'Archival Classic'}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black italic tracking-tight text-white mt-1 px-2 font-serif drop-shadow-lg leading-tight">
                    {track.title}
                  </h2>
                </div>

                {/* Center Gold Embossed Medal Seal */}
                <div className="relative z-10 flex flex-col items-center justify-center my-auto">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-200 via-amber-500 to-amber-800 p-0.5 shadow-[0_0_25px_rgba(245,158,11,0.5)] border border-amber-200/50 flex items-center justify-center">
                    <div className="w-full h-full rounded-full bg-[#1A1124] border border-amber-400/40 flex flex-col items-center justify-center text-center p-1">
                      <Award size={18} className="text-amber-300 mb-0.5" />
                      <span className="text-[6.5px] font-black uppercase tracking-wider text-amber-200">
                        Vault Classic
                      </span>
                    </div>
                  </div>
                </div>

                {/* Foil Author & Narrator Footer */}
                <div className="relative z-10 text-center pb-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">
                    By {track.artist}
                  </p>
                  <p className="text-[8px] font-medium text-white/50 uppercase tracking-widest">
                    Narrated by {track.narrator || 'Classic Voice'}
                  </p>
                </div>
              </div>

              {/* Author Bio Pill */}
              <div className="mt-4 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center text-xs font-black text-white">
                    {track.artist ? track.artist[0] : 'A'}
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white tracking-wide">{track.artist}</h4>
                    <p className="text-[8.5px] text-white/40 uppercase tracking-wider">{track.historicalEra}</p>
                  </div>
                </div>
                <span className="text-[8px] font-mono px-2 py-1 rounded bg-white/5 text-amber-400 border border-amber-400/20 uppercase">
                  Author
                </span>
              </div>

              {/* Archival First Edition Vignette Thumbnail */}
              <div className="mt-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-3">
                <div className="w-12 h-14 rounded-lg bg-black/60 border border-white/10 overflow-hidden shrink-0 relative">
                  <img
                    src={track.thumbnailUrl}
                    className="w-full h-full object-cover sepia opacity-80"
                  />
                  <div className="absolute inset-0 bg-amber-950/30 mix-blend-color" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[7.5px] font-mono text-amber-300 uppercase tracking-widest">Archival Companion</span>
                  <p className="text-[9px] font-bold text-white/80 truncate">First Edition Frontispiece</p>
                  <p className="text-[8px] text-white/40 truncate">Preserved in Public Domain</p>
                </div>
              </div>

            </div>

          </aside>

          {/* ── CENTER WING: Curatorial Dossier & Two-Column Synchronized Reader ── */}
          <section className="lg:col-span-8 flex flex-col space-y-6">

            {/* "Why This Work Matters" Literary Dossier Card */}
            <div className="p-6 sm:p-8 rounded-[2.5rem] bg-gradient-to-r from-[#140D20] via-[#1A0F2E] to-[#140D20] border border-white/15 backdrop-blur-2xl shadow-xl relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[#FF8C00] to-[#D40055] animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-[#FF8C00]" /> Literary Dossier · Why This Work Matters
                  </span>
                </div>
                <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[8.5px] font-mono font-bold text-amber-400 uppercase tracking-widest self-start sm:self-auto">
                  {track.historicalEra}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-normal">
                {track.whyItExists}
              </p>
            </div>

            {/* ── TWO-COLUMN SYNCHRONIZED READ-ALONG BOOK READER ── */}
            <div className="p-6 sm:p-8 rounded-[2.5rem] bg-[#140D20]/95 border border-white/15 backdrop-blur-3xl shadow-2xl flex-1 flex flex-col space-y-5">
              
              {/* Reader Ergonomics Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <BookOpen size={15} className="text-[#00DAF3]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90">
                      {hasVerifiedTiming ? 'Synchronized reading' : 'Reading companion'}
                    </span>
                  </div>

                  {/* Live Word Tracking Badge */}
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00DAF3]/10 border border-[#00DAF3]/30">
                    <span className={`w-1.5 h-1.5 rounded-full bg-[#00DAF3] ${isCurrentPlaying ? 'animate-pulse' : 'opacity-40'}`} />
                    <span className="text-[8px] font-mono font-bold text-[#00DAF3] uppercase tracking-wider">
                      {hasVerifiedTiming ? 'Recording-aligned phrases' : 'Text reference · not synchronized'}
                    </span>
                  </div>

                  {/* Lorea Text Engine Status Badge */}
                  {bookTextLoaded ? (
                    <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[8px] font-mono font-bold text-emerald-300 uppercase tracking-wider">
                        Reference edition
                      </span>
                    </div>
                  ) : isLoadingBookText ? (
                    <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                      <Loader2 size={10} className="text-amber-400 animate-spin" />
                      <span className="text-[8px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                        Fetching Gutenberg Folio...
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Skip Archival Preamble Action Button */}
                  {isInPreamble && (
                    <button
                      onClick={() => seek(preambleEnd)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-black text-[9px] uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-orange-950/40 animate-pulse transition-all active:scale-95"
                      title="Skip spoken archival introduction and begin reading directly"
                    >
                      <FastForward size={11} />
                      <span>Skip Preamble →</span>
                    </button>
                  )}

                  {/* Read in Lorea Reader Launch Button */}
                  <button
                    onClick={handleOpenLoreaReader}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF8C00]/20 to-[#D40055]/20 hover:from-[#FF8C00]/30 hover:to-[#D40055]/30 border border-[#FF8C00]/40 text-[9px] font-black uppercase tracking-wider text-amber-300 hover:text-white transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Open full Lorea BookReader experience at this chapter"
                  >
                    <BookOpen size={11} className="text-[#FF8C00]" />
                    <span>Read in Lorea</span>
                    <ExternalLink size={10} className="opacity-70" />
                  </button>

                  {/* Typography & Font Sizing Pills */}
                  <button
                    onClick={() => setIsSerif(!isSerif)}
                    className="px-2.5 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-white/70 hover:text-white transition-all flex items-center gap-1"
                    title="Toggle Serif/Sans Literary Font"
                  >
                    <Type size={11} />
                    {isSerif ? 'Serif' : 'Sans'}
                  </button>

                  <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-0.5 text-[8.5px] font-bold">
                    <button
                      onClick={() => setFontSize('sm')}
                      className={`px-2 py-0.5 rounded-lg ${fontSize === 'sm' ? 'bg-[#00DAF3] text-black font-black' : 'text-white/40 hover:text-white'}`}
                    >
                      A-
                    </button>
                    <button
                      onClick={() => setFontSize('base')}
                      className={`px-2 py-0.5 rounded-lg ${fontSize === 'base' ? 'bg-[#00DAF3] text-black font-black' : 'text-white/40 hover:text-white'}`}
                    >
                      A
                    </button>
                    <button
                      onClick={() => setFontSize('lg')}
                      className={`px-2 py-0.5 rounded-lg ${fontSize === 'lg' ? 'bg-[#00DAF3] text-black font-black' : 'text-white/40 hover:text-white'}`}
                    >
                      A+
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Spoken Passage Spotlight Bar */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#FF8C00]/10 via-[#D40055]/10 to-transparent border border-white/10 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-2 w-2 relative flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF8C00] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF8C00]"></span>
                  </span>
                  <span className="text-[8px] font-mono uppercase tracking-widest text-amber-300 font-bold flex-shrink-0">
                    {hasVerifiedTiming ? 'Current phrase' : 'Reference text'}
                  </span>
                  <span className="text-xs text-white/90 italic truncate">
                    "{activePassage?.text || track.title}"
                  </span>
                </div>
                <span className="text-[8px] font-mono text-white/40 hidden sm:inline flex-shrink-0">
                  {hasVerifiedTiming ? 'Select a phrase to seek' : 'Timing is not verified for this recording'}
                </span>
              </div>

              {!passages.length && <p role="status" className="text-sm text-white/60">No matching chapter text is available for this recording. Audio playback is available; open the book in Lorea to read independently.</p>}
              <div
                ref={textScrollRef}
                className={`flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 leading-relaxed max-h-[380px] overflow-y-auto pr-2 custom-scrollbar ${
                  isSerif ? 'font-serif' : 'font-sans'
                } ${
                  fontSize === 'sm' ? 'text-xs' : fontSize === 'lg' ? 'text-base' : 'text-sm'
                }`}
              >
                {/* Left Page */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 text-[8px] font-mono text-white/30 uppercase tracking-widest">
                    <span>Page {effectivePageIdx * 2 + 1}</span>
                    <span>Chapter {activeChapterIdx + 1}</span>
                  </div>
                  <div className="leading-relaxed select-text">
                    {leftPageWords.map((item) => {
                      const isActive = hasVerifiedTiming && item.start <= currentTime && currentTime < item.end;
                      const isPast = hasVerifiedTiming && item.end <= currentTime;
                      return (
                        <span
                          key={item.globalIdx}
                          onClick={() => handleSeekToWord(item)}
                          className={`cursor-pointer transition-all duration-150 inline-block mx-[1.5px] my-[1px] rounded ${
                            isActive
                              ? 'bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-black font-black px-1 py-0.5 shadow-[0_0_14px_rgba(255,140,0,0.85)] scale-105'
                              : isPast
                              ? 'text-white/95 font-medium hover:text-amber-300'
                              : 'text-white/40 font-normal hover:text-white/80'
                          }`}
                        >
                          {item.word}{' '}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-[7.5px] font-mono text-white/20 text-right pt-2 border-t border-white/5">
                    Chora Preserved Folio
                  </div>
                </div>

                {/* Right Page */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 md:border-l md:border-white/10 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 text-[8px] font-mono text-white/30 uppercase tracking-widest">
                    <span>Page {effectivePageIdx * 2 + 2}</span>
                    <span>{track.title}</span>
                  </div>
                  <div className="leading-relaxed select-text">
                    {rightPageWords.length > 0 ? (
                      rightPageWords.map((item) => {
                        const isActive = hasVerifiedTiming && item.start <= currentTime && currentTime < item.end;
                        const isPast = hasVerifiedTiming && item.end <= currentTime;
                        return (
                          <span
                            key={item.globalIdx}
                            onClick={() => handleSeekToWord(item)}
                            className={`cursor-pointer transition-all duration-150 inline-block mx-[1.5px] my-[1px] rounded ${
                              isActive
                                ? 'bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-black font-black px-1 py-0.5 shadow-[0_0_14px_rgba(255,140,0,0.85)] scale-105'
                                : isPast
                                ? 'text-white/95 font-medium hover:text-amber-300'
                                : 'text-white/40 font-normal hover:text-white/80'
                            }`}
                          >
                            {item.word}{' '}
                          </span>
                        );
                      })
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/30 space-y-2">
                        <BookOpen size={24} className="opacity-40" />
                        <p className="text-xs italic">End of chapter text. Narration transitions seamlessly to next chapter.</p>
                      </div>
                    )}
                  </div>
                  <div className="text-[7.5px] font-mono text-white/20 text-right pt-2 border-t border-white/5">
                    Lorea Dual Folio
                  </div>
                </div>
              </div>

              {/* Page Turning Controls & Synchronized Auto-Follow Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setManualPageIdx(Math.max(0, effectivePageIdx - 1))}
                    disabled={effectivePageIdx <= 0}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center gap-1.5 text-[9.5px] font-bold active:scale-95"
                    title="Previous book spread"
                  >
                    <ChevronLeft size={13} />
                    <span>Prev Folio</span>
                  </button>

                  <button
                    onClick={() => setManualPageIdx(Math.min(totalBookPages - 1, effectivePageIdx + 1))}
                    disabled={effectivePageIdx >= totalBookPages - 1}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center gap-1.5 text-[9.5px] font-bold active:scale-95"
                    title="Next book spread"
                  >
                    <span>Next Folio</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                {/* Page Indicator & Auto-Follow Reset Button */}
                <div className="flex items-center gap-3">
                  <span className="text-[9.5px] font-mono font-bold text-white/60">
                    Folio Spread <span className="text-white font-black">{effectivePageIdx + 1}</span> of {totalBookPages}
                  </span>

                  {hasVerifiedTiming && manualPageIdx !== null && manualPageIdx !== autoPageIdx && (
                    <button
                      onClick={() => setManualPageIdx(null)}
                      className="px-2.5 py-1 rounded-lg bg-[#00DAF3]/20 hover:bg-[#00DAF3]/30 border border-[#00DAF3]/50 text-[8.5px] font-mono font-bold text-[#00DAF3] transition-all flex items-center gap-1 animate-pulse"
                      title="Return to currently spoken narration page"
                    >
                      <span>Follow Narrator</span>
                    </button>
                  )}
                </div>

                {/* Chapter Read Percentage */}
                <div className="text-[9px] font-mono text-amber-300/80 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  {hasVerifiedTiming ? 'Audio-aligned' : 'Manual reading'}
                </div>
              </div>

            </div>

          </section>

        </div>

        {/* ── BOTTOM ACOUSTIC SOUNDSTAGE & PRECISION TRANSPORT CONTROLS ── */}
        <footer className="w-full flex flex-col items-center space-y-4 pt-4">

          {/* Multi-Layered Terrain Waveform Visualizer */}
          <div className="w-full h-24 rounded-3xl bg-black/50 border border-white/10 relative overflow-hidden flex items-center justify-center shadow-2xl">
            <canvas ref={canvasRef} className="w-full h-full" />
            <div className="absolute top-2 left-4 text-[7.5px] font-mono tracking-widest uppercase text-[#00DAF3]/70">
              Acoustic Resonance Terrain · {isCurrentPlaying ? 'Live Audio Reactivity' : 'Standby'}
            </div>
            {sleepTimerLabel && (
              <div className="absolute top-2 right-4 px-2.5 py-0.5 rounded-full bg-[#D40055]/30 border border-[#D40055]/50 text-[7.5px] font-mono text-[#D40055] flex items-center gap-1">
                <Moon size={9} /> Sleep Timer Active ({sleepTimerLabel})
              </div>
            )}
          </div>

          {/* Floating Glassmorphic Spoken-Word Transport Pill */}
          <div className="flex items-center gap-2 sm:gap-4 px-5 py-3 rounded-full bg-[#140D20]/95 border border-white/20 backdrop-blur-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)]">
            
            {/* Previous Chapter */}
            <button
              onClick={handlePrevChapter}
              disabled={activeChapterIdx <= 0}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="Previous Chapter"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Quick Rewind 15s */}
            <button
              onClick={() => skipSeconds(-15)}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white transition-all flex items-center gap-1 group"
              title="Rewind 15 seconds"
            >
              <RotateCcw size={16} className="group-hover:-rotate-45 transition-transform" />
              <span className="text-[9px] font-mono font-bold">15s</span>
            </button>

            {/* Play / Pause Toggle Button */}
            <button
              onClick={handleTogglePlay}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] p-0.5 shadow-[0_0_25px_rgba(212,0,85,0.6)] hover:scale-105 transition-transform shrink-0"
            >
              <div className="w-full h-full rounded-full bg-[#140D20] flex items-center justify-center text-white hover:bg-transparent transition-colors">
                {isCurrentPlaying ? (
                  <Pause size={22} className="fill-white" />
                ) : (
                  <Play size={22} className="fill-white translate-x-0.5" />
                )}
              </div>
            </button>

            {/* Quick Forward 30s */}
            <button
              onClick={() => skipSeconds(30)}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white transition-all flex items-center gap-1 group"
              title="Skip 30 seconds"
            >
              <span className="text-[9px] font-mono font-bold">30s</span>
              <FastForward size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Next Chapter */}
            <button
              onClick={handleNextChapter}
              disabled={activeChapterIdx >= chapters.length - 1}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="Next Chapter"
            >
              <ChevronRight size={16} />
            </button>

            <div className="h-6 w-[1px] bg-white/15 mx-1 hidden sm:block" />

            {/* Speed Multiplier Pill */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
              {[0.75, 1.0, 1.25, 1.5, 2.0].map(rate => (
                <button
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={`px-2 py-1 rounded-lg text-[8.5px] font-mono font-bold transition-all ${
                    playbackRate === rate
                      ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white shadow-md'
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Sleep Timer Toggle */}
            <button
              onClick={() => setShowSleepTimerModal(true)}
              className={`p-2.5 rounded-full border transition-all ${
                activeSleepTimer
                  ? 'bg-[#D40055] text-white border-[#D40055] shadow-[0_0_15px_rgba(212,0,85,0.5)]'
                  : 'bg-white/5 hover:bg-white/15 border-white/10 text-white/70 hover:text-white'
              }`}
              title="Set Sleep Timer"
            >
              <Moon size={16} />
            </button>

            {/* Bookmark Current Timestamp */}
            <button
              onClick={handleAddBookmark}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-all"
              title="Bookmark Current Moment"
            >
              <Bookmark size={16} />
            </button>

          </div>

        </footer>

      </main>

      {/* ── TABLE OF CONTENTS DRAWER MODAL ── */}
      <AnimatePresence>
        {showChaptersDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex justify-end"
            onClick={() => setShowChaptersDrawer(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="w-full sm:max-w-md h-full max-h-screen bg-[#120B1C] border-l border-white/15 p-5 sm:p-6 flex flex-col space-y-4 shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-[#00DAF3]" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">
                    Table of Contents ({chapters.length} Chapters)
                  </h3>
                </div>
                <button
                  onClick={() => setShowChaptersDrawer(false)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable Chapter List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {chapters.map((ch, idx) => {
                  const isSelected = idx === activeChapterIdx;
                  return (
                    <div
                      key={ch.id || idx}
                      onClick={() => {
                        handlePlayChapter(idx);
                        setShowChaptersDrawer(false);
                      }}
                      className={`p-3.5 rounded-2xl cursor-pointer border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-[#00DAF3]/15 border-[#00DAF3]/40 shadow-lg'
                          : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                          isSelected ? 'bg-[#00DAF3] text-black' : 'bg-white/10 text-white/60'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-[#00DAF3]' : 'text-white'}`}>
                            {ch.title}
                          </h4>
                          <p className="text-[8px] font-mono text-white/40 uppercase">
                            Chapter {idx + 1}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {ch.duration && (
                          <span className="text-[9px] font-mono text-white/40">
                            {Math.floor(ch.duration / 60)}m
                          </span>
                        )}
                        {isSelected && isCurrentPlaying && (
                          <span className="w-2 h-2 rounded-full bg-[#00DAF3] animate-pulse" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SLEEP TIMER MODAL ── */}
      <AnimatePresence>
        {showSleepTimerModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={() => setShowSleepTimerModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-[#140D20] border border-white/15 rounded-3xl p-6 space-y-4 shadow-2xl text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-[#D40055]/20 border border-[#D40055]/40 text-[#D40055] mx-auto flex items-center justify-center">
                <Moon size={22} />
              </div>
              <h3 className="text-base font-black uppercase tracking-widest text-white">
                Audiobook Sleep Timer
              </h3>
              <p className="text-xs text-white/50">
                Playback will gently pause when the timer expires.
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                {[
                  { sec: 900, label: '15 Minutes' },
                  { sec: 1800, label: '30 Minutes' },
                  { sec: 2700, label: '45 Minutes' },
                  { sec: 3600, label: '60 Minutes' },
                ].map(opt => (
                  <button
                    key={opt.sec}
                    onClick={() => handleSetSleepTimer(opt.sec, opt.label)}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {activeSleepTimer && (
                <button
                  onClick={() => {
                    setActiveSleepTimer(null);
                    setSleepTimerLabel(null);
                    setShowSleepTimerModal(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#D40055]/20 text-[#D40055] border border-[#D40055]/30 text-xs font-bold uppercase tracking-wider hover:bg-[#D40055]/30 transition-all"
                >
                  Turn Off Timer
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOOKMARK TOAST ── */}
      <AnimatePresence>
        {showBookmarkToast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-cyan-400 text-black font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-2 z-50"
          >
            <Check size={15} /> Bookmark Saved to Library
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default VaultAudiobookView;
