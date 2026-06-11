import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Album, BookChapter, BookPage, Comment, BookNote } from '../types';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, ZoomIn, ZoomOut, Grid, Bookmark, Settings, MessageSquare, Edit3, Mic, Link as LinkIcon, Play, Pause, Users, Video as VideoIcon, Highlighter, RefreshCw, List, Book as BookIcon, Type, Smartphone, Monitor, Moon, Sun, Coffee, Columns, Square, Download, Loader2, BookOpen as BookOpenIcon, Share2, Trash2, Headphones, ChevronDown, Volume2, Sparkles, AlertCircle, ExternalLink } from 'lucide-react';
import { MAI_VOICES, synthesizeParagraphs, estimateNarrationDurationMs } from '../services/microsoftAIService';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToComments, postComment, createPost } from '../services/backendService';
import { cacheExternalBookAssets } from '../services/bookStorageService';
import { fetchBookBinary, fetchBookText } from '../services/bookContentService';
import CommentSection from './CommentSection';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import PlajahPlusButton from './PlajahPlusButton';
import { BookOpeningScene } from './BookOpeningScene';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Rendition, Book as EPubBook } from 'epubjs';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

if (pdfjs && pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
}

class ReaderErrorBoundary extends React.Component<
  { resetKey: string; onError: (error: Error) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

const stripHtmlToText = (value: string) =>
  value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|section|article)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const formatReadableText = (value: string) => {
  let text = value.trimStart().startsWith('<') ? stripHtmlToText(value) : value;
  text = text
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i, '')
    .replace(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*/i, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return text
    .split(/\n{2,}/)
    .map(block => block.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
};

interface ParsedChapter { title: string; pages: string[][] }

// Split a formatted TXT book into chapters and paginate each one.
// Falls back to a single chapter when no headings are found.
const parseChaptersFromText = (fullText: string): ParsedChapter[] => {
  const PAGE_PARAS = 45;
  const CHAPTER_RE = /^((?:CHAPTER|Chapter|PART|Part|BOOK|Book|VOLUME|Volume|ACT|Act|SECTION|Section)\s+(?:\d+|[IVXLCDM]+)(?:[.:—\s][^\n]*)?)\s*$/mg;

  const parts = fullText.split(CHAPTER_RE);
  // parts = [preamble, heading, body, heading, body, ...]

  const raw: Array<{ title: string; body: string }> = [];

  if (parts[0].trim().length > 300) {
    raw.push({ title: 'Preface', body: parts[0].trim() });
  }

  for (let i = 1; i + 1 < parts.length; i += 2) {
    raw.push({ title: parts[i].replace(/\s+/g, ' ').trim(), body: (parts[i + 1] || '').trim() });
  }

  if (raw.length === 0) {
    raw.push({ title: 'Complete Work', body: fullText });
  }

  return raw.map(ch => {
    const paras = ch.body.split('\n\n').filter(p => p.trim().length > 5);
    const pages: string[][] = [];
    for (let i = 0; i < Math.max(1, paras.length); i += PAGE_PARAS) {
      pages.push(paras.slice(i, i + PAGE_PARAS));
    }
    return { title: ch.title, pages };
  });
};

interface BookmarkEntry {
  id: string;
  chapterIndex: number;
  pageIndex: number;
  epubCfi?: string;
  epubProgress?: number;
  label: string;
  createdAt: number;
}

interface BookReaderProps {
  book: Album;
  onBack: () => void;
  currentUser: any;
  onVisitUser?: (uid: string) => void;
  onOpenAudioStudio?: () => void;
}

const POSITION_KEY = (bookId: string) => `lorea_pos_${bookId}`;
const EPUB_POS_KEY = (bookId: string) => `lorea_epub_pos_${bookId}`;

function loadSavedPosition(bookId: string): { chapter: number; page: number } {
  try {
    const raw = localStorage.getItem(POSITION_KEY(bookId));
    if (!raw) return { chapter: 0, page: 0 };
    const parsed = JSON.parse(raw);
    return { chapter: Number(parsed.chapter) || 0, page: Number(parsed.page) || 0 };
  } catch { return { chapter: 0, page: 0 }; }
}

const BookReader: React.FC<BookReaderProps> = ({ book, onBack, currentUser, onVisitUser, onOpenAudioStudio }) => {
  const { theme } = useGlobalPlayerState();

  // Restore last-read position from localStorage
  const savedPos = loadSavedPosition(book.id);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(savedPos.chapter);
  const [showOpeningScene, setShowOpeningScene] = useState(true);

  // Unmount guard — prevents setState after the component is torn down.
  // IMPORTANT: the effect body must re-set the flag to true. React 18
  // StrictMode mounts → runs cleanup (flag=false) → re-runs effects; without
  // the re-set the flag stays false forever, which froze the opening scene
  // and silently skipped all content loading in dev.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const getThemeStyles = () => {
    switch (theme) {
      case 'LIGHT':
        return {
          bg: 'bg-white/40 backdrop-blur-3xl',
          header: 'bg-white/80 backdrop-blur-xl border-b border-black/5 text-black',
          footer: 'bg-white/80 backdrop-blur-xl border-t border-black/5 text-black',
          text: 'text-black',
          subtext: 'text-black/60',
          sidebar: 'bg-white/60 border-l border-black/5 backdrop-blur-2xl',
          card: 'bg-white border border-black/5 shadow-xl',
          noteInput: 'bg-black/5 border-black/10 focus:ring-black/20 text-black',
          btnHover: 'hover:bg-black/5 text-black/40 hover:text-black',
          activeBtn: 'bg-small-orange text-white shadow-[0_4px_12px_rgba(255,140,0,0.3)]',
          progressBg: 'bg-black/10',
          scrollbar: 'scrollbar-light'
        };
      case 'PASTEL':
        return {
          bg: 'bg-[#F9F5F1]/40 backdrop-blur-3xl',
          header: 'bg-white/40 backdrop-blur-3xl border-b border-rose-200/50 text-rose-900',
          footer: 'bg-white/40 backdrop-blur-3xl border-t border-rose-200/50 text-rose-900',
          text: 'text-rose-900',
          subtext: 'text-rose-700/60',
          sidebar: 'bg-[#F9F5F1]/60 border-l border-rose-200/50 backdrop-blur-2xl',
          card: 'bg-white/60 border border-rose-200/50 shadow-sm backdrop-blur-md',
          noteInput: 'bg-rose-50 border-rose-100 focus:ring-rose-200 text-rose-900',
          btnHover: 'hover:bg-rose-100/50 text-rose-400 hover:text-rose-900',
          activeBtn: 'bg-small-orange text-white shadow-[0_4px_12px_rgba(255,140,0,0.3)]',
          progressBg: 'bg-rose-100',
          scrollbar: 'scrollbar-pastel'
        };
      case 'PLAJAH':
        return {
          bg: 'bg-transparent',
          header: 'bg-[#FF8C00]/90 backdrop-blur-2xl border-b border-white/10 text-white',
          footer: 'bg-[#FF8C00]/90 backdrop-blur-2xl border-t border-white/10 text-white',
          text: 'text-white',
          subtext: 'text-white/70',
          sidebar: 'bg-black/60 border-l border-white/10 backdrop-blur-2xl',
          card: 'bg-white/5 border border-white/10 backdrop-blur-md',
          noteInput: 'bg-white/10 border-white/20 focus:ring-white/30 text-white',
          btnHover: 'hover:bg-white/20 text-white/50 hover:text-white',
          activeBtn: 'bg-white text-small-orange shadow-[0_0_20px_rgba(255,140,0,0.4)] border border-small-orange',
          progressBg: 'bg-white/10',
          scrollbar: 'custom-scrollbar'
        };
      case 'ETHEREAL':
        return {
          bg: 'bg-transparent backdrop-blur-sm',
          header: 'bg-white/5 backdrop-blur-3xl border-b border-white/10 text-white',
          footer: 'bg-white/5 backdrop-blur-3xl border-t border-white/10 text-white',
          text: 'text-cyan-50',
          subtext: 'text-cyan-200/60',
          sidebar: 'bg-[#06060f]/60 border-l border-white/10 backdrop-blur-3xl',
          card: 'bg-white/5 border border-white/10 backdrop-blur-xl',
          noteInput: 'bg-white/5 border-white/10 focus:ring-cyan-500/30 text-white',
          btnHover: 'hover:bg-white/10 text-cyan-200/30 hover:text-white',
          activeBtn: 'bg-small-orange text-white shadow-[0_0_20px_rgba(255,140,0,0.4)]',
          progressBg: 'bg-white/5',
          scrollbar: 'custom-scrollbar'
        };
      case 'CITRUS':
        return {
          bg: 'bg-[#0A0A0A]/80 backdrop-blur-3xl',
          header: 'bg-black/80 backdrop-blur-3xl border-b border-[#FF3B00]/30 text-white',
          footer: 'bg-black/80 backdrop-blur-3xl border-t border-[#FF3B00]/30 text-white',
          text: 'text-white',
          subtext: 'text-white/60',
          sidebar: 'bg-black/80 border-l border-[#FF3B00]/30 backdrop-blur-2xl',
          card: 'bg-white/5 border border-[#FF3B00]/20 shadow-lg',
          noteInput: 'bg-white/5 border-[#FF3B00]/20 focus:ring-[#FF3B00]/50 text-white',
          btnHover: 'hover:bg-[#FF3B00]/20 text-white/40 hover:text-[#FF3B00]',
          accent: 'text-[#FF3B00]',
          accentHover: 'hover:text-[#FF3B00] hover:bg-[#FF3B00]/10',
          progressFill: 'bg-[#FF3B00]',
          progressBg: 'bg-white/10',
          scrollbar: 'scrollbar-dark'
        };
      default:
        return {
          bg: 'bg-transparent',
          header: 'bg-black/80 backdrop-blur-xl border-b border-white/5 text-white',
          footer: 'bg-black/80 backdrop-blur-xl border-t border-white/5 text-white',
          text: 'text-white',
          subtext: 'text-white/60',
          sidebar: 'bg-black/60 border-l border-white/5 backdrop-blur-2xl',
          card: 'bg-white/5 border border-white/10 shadow-2xl',
          noteInput: 'bg-white/5 border border-white/10 focus:ring-white/20 text-white',
          btnHover: 'hover:bg-white/10 text-white/40 hover:text-white',
          activeBtn: 'bg-small-orange text-white shadow-[0_0_20px_rgba(255,140,0,0.4)]',
          progressBg: 'bg-white/10',
          scrollbar: 'custom-scrollbar'
        };
    }
  };

  const s = getThemeStyles();
  const [currentPageIndex, setCurrentPageIndex] = useState(savedPos.page);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [viewMode, setViewMode] = useState<'SINGLE' | 'DOUBLE'>('SINGLE');
  // Parsed chapters/pages for TXT books — populated after loadFullText completes
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>([]);
  const [activeParsedChapter, setActiveParsedChapter] = useState(0);
  const [activeParsedPage, setActiveParsedPage] = useState(0);
  // When EPUB fails, user can request plain-text fallback
  const [forceTxtFallback, setForceTxtFallback] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [activeNoteTab, setActiveNoteTab] = useState<'PAGE' | 'GENERAL'>('PAGE');
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteType, setNewNoteType] = useState<'TEXT' | 'AUDIO' | 'LINK'>('TEXT');
  
  // EPUB State
  const viewerRef = useRef<HTMLDivElement>(null);
  const [epubRendition, setEpubRendition] = useState<Rendition | null>(null);
  const [epubBook, setEpubBook] = useState<EPubBook | null>(null);
  const [toc, setToc] = useState<any[]>([]);
  const [epubLocation, setEpubLocation] = useState<string | null>(() => {
    try { return localStorage.getItem(EPUB_POS_KEY(book.id)); } catch { return null; }
  });
  const [epubProgress, setEpubProgress] = useState(0);
  // EPUB bytes are fetched by us (cached, deduped, retried) and handed to the
  // reader as a binary — epub.js fetching its own URL has no retry and a
  // single failed request leaves a permanently blank reader.
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);

  // Settings State
  const [fontSize, setFontSize] = useState(100);
  const [readingTheme, setReadingTheme] = useState<'DEFAULT' | 'SEPIA' | 'DARK' | 'PAPER'>('SEPIA');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');

  // Display mode scales the whole reading surface for the device class:
  // phone-in-hand, desk monitor, or a TV viewed from across the room.
  const [displayMode, setDisplayMode] = useState<'AUTO' | 'MOBILE' | 'DESKTOP' | 'TV'>(() => {
    try { return (localStorage.getItem('lorea_display_mode') as any) || 'AUTO'; } catch { return 'AUTO'; }
  });
  const [viewportW, setViewportW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    try { localStorage.setItem('lorea_display_mode', displayMode); } catch {}
  }, [displayMode]);
  const resolvedMode: 'MOBILE' | 'DESKTOP' | 'TV' =
    displayMode !== 'AUTO' ? displayMode
    : viewportW >= 1900 ? 'TV'
    : viewportW >= 1024 ? 'DESKTOP'
    : 'MOBILE';
  const modeScale   = resolvedMode === 'TV' ? 1.5 : resolvedMode === 'DESKTOP' ? 1.1 : 1.0;
  const modeMaxW    = resolvedMode === 'TV' ? 'max-w-6xl' : resolvedMode === 'DESKTOP' ? 'max-w-3xl' : 'max-w-xl';
  const modeLeading = resolvedMode === 'TV' ? 'leading-[2.1]' : 'leading-[1.9]';

  // Read Along (Book Club) State
  const [isReadAlongActive, setIsReadAlongActive] = useState(false);
  const [isHost, setIsHost] = useState(false);
  
  // Narration State
  const [isNarrating, setIsNarrating] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // MAI Voice 2 AI Narration State
  const [showNarrationPanel, setShowNarrationPanel] = useState(false);
  const [selectedNarrationVoice, setSelectedNarrationVoice] = useState(MAI_VOICES[0].id);
  const [narrationRate, setNarrationRate] = useState(1.0);
  const [aiNarrationUrl, setAiNarrationUrl] = useState<string | null>(null);
  const [aiNarrationGenerating, setAiNarrationGenerating] = useState(false);
  const [aiNarrationProgress, setAiNarrationProgress] = useState(0);
  const aiAudioRef = useRef<HTMLAudioElement>(null);
  const [isAiPlaying, setIsAiPlaying] = useState(false);
  
  // Read-along narration: browser speech synthesis with word-boundary events
  // drives a live highlight of the word being spoken. Works fully on-device.
  const [readAlongPos, setReadAlongPos] = useState<{ para: number; word: number } | null>(null);
  const [readAlongAutoNext, setReadAlongAutoNext] = useState(false);
  const readAlongSession = useRef<{ stop: boolean }>({ stop: true });
  const readAlongWordRef = useRef<HTMLSpanElement | null>(null);

  // PDF State
  const [numPdfPages, setNumPdfPages] = useState<number>();
  const [pdfPageNumber, setPdfPageNumber] = useState<number>(1);
  const [readerError, setReaderError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPdfPages(numPages);
    setReaderError(null);
  }

  // State for saving book
  const [isSaved, setIsSaved] = useState(false);
  const getProxiedUrl = (url?: string) => {
    if (!url) return "";
    return url.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
  };

  const currentChapter = book.bookChapters?.[currentChapterIndex];
  const proxiedEpubUrl = getProxiedUrl(currentChapter?.url);
  const proxiedPdfUrl = getProxiedUrl(currentChapter?.url);
  const [chapterContent, setChapterContent] = useState<string>(currentChapter?.content || '');
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`plajah-bookmarks-${book.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCaption, setShareCaption] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    // Determine if already saved (basic check)
    if (book.ownerId === currentUser?.uid) {
      setIsSaved(true);
    }
  }, [book, currentUser]);

  const handleSaveBook = async () => {
    if (!currentUser || isSaved || isSaving) return;
    setIsSaving(true);
    try {
      const { publishToCloud } = await import('../services/backendService');
      const savedBook: Album = {
        ...book,
        id: `saved-${book.id}-${Date.now()}`,
        ownerId: currentUser.uid,
        createdAt: Date.now(),
        isGlobalArchive: true,
      };
      const normalizedBook = await cacheExternalBookAssets(savedBook, currentUser.uid);
      await publishToCloud(normalizedBook);
      setIsSaved(true);
    } catch (e) {
      console.error(e);
      alert('Error saving book.');
    } finally {
      setIsSaving(false);
    }
  };
  const pages = currentChapter?.pages || [];
  const isGraphicNovel = book.subType === 'GRAPHIC_NOVEL';
  const currentUrl = currentChapter?.url || '';
  const lowerCurrentUrl = currentUrl.toLowerCase();
  const isEpub = !forceTxtFallback && (currentChapter?.format === 'EPUB' || lowerCurrentUrl.endsWith('.epub') || lowerCurrentUrl.includes('epub'));
  const isPdf = currentChapter?.format === 'PDF' || lowerCurrentUrl.endsWith('.pdf') || lowerCurrentUrl.includes('pdf');
  const isTxt = !isEpub && !isPdf && !isGraphicNovel && (
    // Forced text fallback: the chapter itself is EPUB but we read its TXT
    // fallbackUrl — without this clause the reader showed "no visual data".
    (forceTxtFallback && !!currentChapter?.fallbackUrl) ||
    currentChapter?.format === 'TXT' ||
    currentChapter?.url?.toLowerCase().endsWith('.txt') ||
    currentChapter?.url?.toLowerCase().includes('.txt.') ||
    currentChapter?.url?.includes('/txt') ||
    currentChapter?.url?.includes('text%2Fplain') ||
    currentChapter?.url?.includes('text/plain') ||
    (currentChapter?.url?.includes('archive.org') && !currentChapter?.url?.includes('.epub') && !currentChapter?.url?.includes('.pdf'))
  );

  // Reset per-chapter state when the chapter changes
  useEffect(() => {
    setReaderError(null);
    setNumPdfPages(undefined);
    setPdfPageNumber(1);
    setParsedChapters([]);
    setActiveParsedChapter(0);
    setActiveParsedPage(0);
    setForceTxtFallback(false);
    setEpubData(null);
    setDownloadPct(null);
  }, [currentChapter?.id, currentChapter?.url]);

  // Download the EPUB binary ourselves (cached + deduped + retried), then hand
  // the bytes to the reader. On failure, fall back to the TXT version
  // automatically instead of dead-ending on a blank page.
  useEffect(() => {
    if (!isEpub || !currentChapter?.url) return;
    let cancelled = false;
    setIsLoadingContent(true);
    setDownloadPct(0);
    fetchBookBinary(currentChapter.url, {
      expectZip: true,
      onProgress: (loaded, total) => {
        if (!cancelled && total) setDownloadPct(Math.min(100, Math.round((loaded / total) * 100)));
      },
    })
      .then(buf => {
        if (cancelled || !mountedRef.current) return;
        setEpubData(buf);
        setReaderError(null);
      })
      .catch(err => {
        if (cancelled || !mountedRef.current) return;
        console.warn('[BookReader] EPUB download failed:', err?.message);
        if (currentChapter.fallbackUrl) {
          setForceTxtFallback(true); // automatic TXT fallback
        } else {
          setReaderError('This book could not be downloaded. Check your connection or try the original source.');
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) {
          setIsLoadingContent(false);
          setDownloadPct(null);
        }
      });
    return () => { cancelled = true; };
  }, [isEpub, currentChapter?.url]);

  // Load content whenever the resolved format changes (including TXT fallback override)
  useEffect(() => {
    if (currentChapter?.content) {
      const formatted = formatReadableText(currentChapter.content);
      setChapterContent(formatted);
      setParsedChapters(parseChaptersFromText(formatted));
    } else if (isTxt && currentChapter?.url) {
      if (forceTxtFallback && currentChapter.fallbackUrl) {
        loadFullText(currentChapter.fallbackUrl);
      } else {
        loadFullText(currentChapter.url, currentChapter.fallbackUrl);
      }
    } else if (!isEpub) {
      setChapterContent('');
    }
  }, [currentChapter?.id, currentChapter?.url, currentChapter?.content, isTxt, isEpub, forceTxtFallback]);

  const loadFullText = async (url: string, fallback?: string) => {
    if (!mountedRef.current) return;
    setIsLoadingContent(true);
    try {
      let text: string;
      try {
        text = await fetchBookText(url);
      } catch (primaryErr: any) {
        if (!mountedRef.current) return;
        // Primary failed (Storage 404, network issue, etc.) — try Gutenberg fallback
        if (fallback) {
          console.warn('[BookReader] Primary URL failed, trying fallback:', primaryErr.message);
          text = await fetchBookText(fallback);
        } else {
          throw primaryErr;
        }
      }
      if (!mountedRef.current) return;
      const formatted = formatReadableText(text);
      setChapterContent(formatted);
      setParsedChapters(parseChaptersFromText(formatted));
    } catch (error: any) {
      if (!mountedRef.current) return;
      console.error('Error loading full text:', error);
      setReaderError('This book could not be loaded. Check your connection or try the original source.');
      setChapterContent('');
    } finally {
      if (mountedRef.current) setIsLoadingContent(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToComments(book.id, null, null, setComments);
    return () => unsubscribe();
  }, [book.id]);

  // Persist last-read position so the book re-opens at the right place
  useEffect(() => {
    if (showOpeningScene) return; // don't save the initial position before reading starts
    try {
      localStorage.setItem(POSITION_KEY(book.id), JSON.stringify({ chapter: currentChapterIndex, page: currentPageIndex }));
    } catch {}
  }, [currentChapterIndex, currentPageIndex, book.id, showOpeningScene]);

  const handlePostComment = async (text: string, parentId?: string) => {
    if (!currentUser) return;
    await postComment(book.id, {
      author: currentUser.displayName || 'READER',
      text,
      timestamp: Date.now(),
      parentId: parentId || undefined
    });
  };

  // Proactively destroy the epub rendition on unmount so ReactReader's own
  // componentWillUnmount finds nothing to destroy — epub.js book.destroy() can
  // throw when called while a fetch is still in-flight, crashing the tree.
  useEffect(() => {
    return () => {
      if (epubRendition) {
        try { epubRendition.destroy(); } catch (_) { /* suppress cleanup errors */ }
      }
    };
  }, [epubRendition]);

  // Apply EPUB Styles
  useEffect(() => {
    if (epubRendition) {
      epubRendition.themes.fontSize(`${Math.round(fontSize * modeScale)}%`);
      
      let textColor = '#fff';
      let bgColor = 'transparent';

      if (readingTheme === 'SEPIA') {
        textColor = '#5f4b32';
        bgColor = '#f4ecd8';
      } else if (readingTheme === 'PAPER') {
        textColor = '#1a1a1a';
        bgColor = '#fdfdfd';
      } else if (readingTheme === 'DARK') {
        textColor = '#ccc';
        bgColor = '#111';
      } else {
        // Default behavior based on global platform theme
        textColor = theme === 'LIGHT' ? '#000' : '#fff';
      }

      epubRendition.themes.register('custom', {
        'body, p, div, span, h1, h2, h3, h4, h5, h6, a': {
          'color': `${textColor} !important`,
          'background': `transparent !important`,
          'background-color': `transparent !important`,
        },
        'body': {
          'font-family': fontFamily === 'serif' ? 'Georgia, serif' : fontFamily === 'mono' ? 'monospace' : 'inherit'
        }
      });
      epubRendition.themes.select('custom');
    }
  }, [epubRendition, fontSize, modeScale, readingTheme, fontFamily, theme]);

  const nextPage = useCallback(() => {
    if (isEpub && epubRendition) {
      try {
        if ((epubRendition as any).manager) epubRendition.next();
      } catch (e) { console.warn('EPUB next page error', e); }
    } else if (parsedChapters.length > 0) {
      const ch = parsedChapters[activeParsedChapter];
      if (activeParsedPage < ch.pages.length - 1) {
        setActiveParsedPage(p => p + 1);
      } else if (activeParsedChapter < parsedChapters.length - 1) {
        setActiveParsedChapter(c => c + 1);
        setActiveParsedPage(0);
      }
    } else if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else if (currentChapterIndex < (book.bookChapters?.length || 0) - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
      setCurrentPageIndex(0);
    }
  }, [isEpub, epubRendition, parsedChapters, activeParsedChapter, activeParsedPage, currentPageIndex, pages.length, currentChapterIndex, book.bookChapters]);

  const prevPage = useCallback(() => {
    if (isEpub && epubRendition) {
      try {
        if ((epubRendition as any).manager) epubRendition.prev();
      } catch (e) { console.warn('EPUB prev page error', e); }
    } else if (parsedChapters.length > 0) {
      if (activeParsedPage > 0) {
        setActiveParsedPage(p => p - 1);
      } else if (activeParsedChapter > 0) {
        const prevCh = parsedChapters[activeParsedChapter - 1];
        setActiveParsedChapter(c => c - 1);
        setActiveParsedPage(Math.max(0, prevCh.pages.length - 1));
      }
    } else if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    } else if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
      const prevChapterPages = book.bookChapters?.[currentChapterIndex - 1].pages || [];
      setCurrentPageIndex(Math.max(0, prevChapterPages.length - 1));
    }
  }, [isEpub, epubRendition, parsedChapters, activeParsedChapter, activeParsedPage, currentPageIndex, currentChapterIndex, book.bookChapters]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextPage();
      if (e.key === 'ArrowLeft') prevPage();
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, onBack]);

  // ── Read-along narration ─────────────────────────────────────────────────
  const stopReadAlong = useCallback(() => {
    readAlongSession.current.stop = true;
    setReadAlongAutoNext(false);
    try { window.speechSynthesis?.cancel(); } catch {}
    setReadAlongPos(null);
  }, []);

  const pickNarrationVoice = (): SpeechSynthesisVoice | undefined => {
    const voices = window.speechSynthesis?.getVoices() || [];
    // Prefer the higher-quality neural voices when the platform exposes them
    return (
      voices.find(v => /^en/i.test(v.lang) && /natural|neural|online|premium/i.test(v.name)) ||
      voices.find(v => /^en/i.test(v.lang) && v.localService) ||
      voices.find(v => /^en/i.test(v.lang)) ||
      voices[0]
    );
  };

  const startReadAlong = useCallback((startPara = 0) => {
    if (!('speechSynthesis' in window)) {
      setReaderError('Read-along narration is not supported on this device.');
      return;
    }
    readAlongSession.current.stop = true;
    try { window.speechSynthesis.cancel(); } catch {}
    const session = { stop: false };
    readAlongSession.current = session;

    const activeCh = parsedChapters[activeParsedChapter];
    const paras = activeCh?.pages[activeParsedPage] || [];
    if (!paras.length) return;

    const speakFrom = (idx: number) => {
      if (session.stop) return;
      if (idx >= paras.length) {
        // Page finished — turn it and keep narrating (effect below restarts)
        const moreContent =
          activeParsedPage < (activeCh?.pages.length ?? 0) - 1 ||
          activeParsedChapter < parsedChapters.length - 1;
        if (moreContent) {
          setReadAlongAutoNext(true);
          nextPage();
        } else {
          setReadAlongPos(null);
        }
        return;
      }
      const text = paras[idx];
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = narrationRate;
      const voice = pickNarrationVoice();
      if (voice) utterance.voice = voice;
      utterance.onboundary = (e: SpeechSynthesisEvent) => {
        if (session.stop) return;
        const before = text.slice(0, e.charIndex);
        const word = before.trim() ? before.trim().split(/\s+/).length : 0;
        setReadAlongPos({ para: idx, word });
      };
      utterance.onend = () => { if (!session.stop) speakFrom(idx + 1); };
      utterance.onerror = () => { if (!session.stop) speakFrom(idx + 1); };
      setReadAlongPos({ para: idx, word: 0 });
      window.speechSynthesis.speak(utterance);
    };
    speakFrom(startPara);
  }, [parsedChapters, activeParsedChapter, activeParsedPage, narrationRate, nextPage]);

  // Continue narration on the new page after an automatic page turn
  useEffect(() => {
    if (readAlongAutoNext) {
      setReadAlongAutoNext(false);
      startReadAlong(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParsedPage, activeParsedChapter]);

  // Keep the spoken word visible
  useEffect(() => {
    readAlongWordRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [readAlongPos?.para]);

  // Silence narration when leaving the reader or switching chapters
  useEffect(() => () => {
    readAlongSession.current.stop = true;
    try { window.speechSynthesis?.cancel(); } catch {}
  }, [currentChapterIndex]);

  const jumpToChapter = (chapterId: string) => {
    const idx = book.bookChapters?.findIndex(c => c.id === chapterId);
    if (idx !== undefined && idx !== -1) {
      setCurrentChapterIndex(idx);
      setCurrentPageIndex(0);
      setShowTOC(false);
    }
  };

  const jumpToEpubCfi = (cfi: string) => {
    if (epubRendition) {
      epubRendition.display(cfi);
      setShowTOC(false);
    }
  };

  const toggleFullScreen = () => {
    const isFS = document.fullscreenElement || (document as any).webkitFullscreenElement;
    if (!isFS) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen failed:', e));
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setIsFullScreen(false);
    }
  };

  const handleAddNote = () => {
    if (!newNoteText.trim() || !currentUser) return;
    const newNote: BookNote = {
      id: Math.random().toString(36).substr(2, 9),
      bookId: book.id,
      userId: currentUser.uid,
      pageNumber: activeNoteTab === 'PAGE' ? currentPageIndex : undefined,
      chapterId: activeNoteTab === 'PAGE' ? currentChapter?.id : undefined,
      type: newNoteType,
      content: newNoteText,
      timestamp: Date.now()
    };
    setNotes([...notes, newNote]);
    setNewNoteText('');
  };

  const handleJumpToNote = (note: BookNote) => {
    if (note.chapterId) {
      const chapterIdx = book.bookChapters?.findIndex(c => c.id === note.chapterId);
      if (chapterIdx !== undefined && chapterIdx !== -1) {
        setCurrentChapterIndex(chapterIdx);
        if (note.pageNumber !== undefined) {
          setCurrentPageIndex(note.pageNumber);
        }
      }
    }
  };

  useEffect(() => {
    localStorage.setItem(`plajah-bookmarks-${book.id}`, JSON.stringify(bookmarks));
  }, [bookmarks, book.id]);

  const isCurrentPageBookmarked = bookmarks.some(b =>
    isEpub
      ? b.epubCfi === epubLocation
      : b.chapterIndex === currentChapterIndex && b.pageIndex === currentPageIndex
  );

  const toggleBookmark = () => {
    if (isCurrentPageBookmarked) {
      setBookmarks(prev => prev.filter(b =>
        isEpub
          ? b.epubCfi !== epubLocation
          : !(b.chapterIndex === currentChapterIndex && b.pageIndex === currentPageIndex)
      ));
    } else {
      const label = isEpub
        ? `${book.title} — ${epubProgress}%`
        : `${currentChapter?.title || `Chapter ${currentChapterIndex + 1}`} — Page ${currentPageIndex + 1}`;
      setBookmarks(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        chapterIndex: currentChapterIndex,
        pageIndex: currentPageIndex,
        epubCfi: isEpub ? (epubLocation || undefined) : undefined,
        epubProgress: isEpub ? epubProgress : undefined,
        label,
        createdAt: Date.now(),
      }]);
    }
  };

  const jumpToBookmark = (b: BookmarkEntry) => {
    if (isEpub && b.epubCfi) {
      epubRendition?.display(b.epubCfi);
    } else {
      setCurrentChapterIndex(b.chapterIndex);
      setCurrentPageIndex(b.pageIndex);
    }
    setShowBookmarks(false);
  };

  const handleSharePage = async () => {
    if (!currentUser || isSharing) return;
    setIsSharing(true);
    try {
      const pageRef = isEpub
        ? `epub:${epubProgress}`
        : `chapter:${currentChapterIndex}:page:${currentPageIndex}`;
      const deepLink = `${window.location.origin}/#book/${book.id}?ref=${encodeURIComponent(pageRef)}`;
      const caption = shareCaption.trim() ||
        `📖 Reading "${book.title}"${currentChapter?.title ? ` — ${currentChapter.title}` : ''}${!isEpub ? ` — Page ${currentPageIndex + 1}` : ` at ${epubProgress}%`}`;
      await createPost({
        text: caption,
        media: [{
          type: 'LINK',
          title: book.title,
          thumbnail: book.coverImage || undefined,
          linkPreview: {
            title: book.title,
            description: currentChapter?.title || book.description || '',
            image: book.coverImage || undefined,
            url: deepLink,
          },
          url: deepLink,
        }],
      });
      setShowShareModal(false);
      setShareCaption('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSharing(false);
    }
  };

  const toggleNarration = () => {
    if (isNarrating) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play().catch(error => {
        if (error.name !== 'AbortError' && !error.message?.includes('interrupted')) {
          console.error("Playback failed:", error);
        }
      });
    }
    setIsNarrating(!isNarrating);
  };

  const toggleReadAlong = () => {
    setIsReadAlongActive(!isReadAlongActive);
    setIsHost(Math.random() > 0.5);
  };

  // Generate AI narration for current chapter using MAI Voice 2
  const generateAINarration = async () => {
    if (aiNarrationGenerating) return;
    const content = currentChapter?.content || chapterContent;
    if (!content) return;
    setAiNarrationGenerating(true);
    setAiNarrationProgress(0);
    try {
      const paragraphs = content.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 5);
      const blobs = await synthesizeParagraphs(
        paragraphs, selectedNarrationVoice, narrationRate,
        (done, total) => setAiNarrationProgress(Math.round((done / total) * 100)),
      );
      // Concatenate blobs into one
      const combined = new Blob(blobs.filter(b => b.size > 0), { type: 'audio/webm' });
      const url = URL.createObjectURL(combined);
      setAiNarrationUrl(url);
    } catch (err) {
      console.error('[MAI Voice 2] generation failed:', err);
    } finally {
      setAiNarrationGenerating(false);
    }
  };

  // Plain-text reading card derived styles
  const txtCardBg =
    readingTheme === 'SEPIA' ? 'bg-[#f4ecd8] border border-[#d9c9a3]' :
    readingTheme === 'PAPER' ? 'bg-[#fafaf8] border border-black/10' :
    readingTheme === 'DARK'  ? 'bg-[#111111] border border-white/5' :
                               'bg-[#1c1c1f] border border-white/5';
  const txtColor =
    readingTheme === 'SEPIA' ? 'text-[#4a3728]' :
    readingTheme === 'PAPER' ? 'text-[#1a1a1a]' :
    readingTheme === 'DARK'  ? 'text-[#c8c8c8]' :
                               'text-white/85';
  const txtHdColor =
    readingTheme === 'SEPIA' ? 'text-[#7a4f2b]' :
    readingTheme === 'PAPER' ? 'text-black' :
                               'text-small-orange';
  const txtFontFamily =
    fontFamily === 'serif' ? 'font-serif' :
    fontFamily === 'mono'  ? 'font-mono'  : 'font-sans';

  return (
    <>
    {/* Reader always mounted so content loads in background during opening scene */}
    <div
      className={`fixed inset-0 ${s.bg} z-[90] flex flex-col overflow-hidden select-none pb-32 lg:pb-40 transition-colors duration-500`}
      style={{ opacity: showOpeningScene ? 0 : 1, pointerEvents: showOpeningScene ? 'none' : undefined, transition: 'opacity 0.7s ease' }}
    >
      {currentChapter?.audioUrl && (
        <audio ref={audioRef} src={currentChapter.audioUrl} onEnded={() => setIsNarrating(false)} />
      )}
      
      {/* Top Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.header 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className={`h-20 ${s.header} flex items-center justify-between px-8 z-50 transition-colors duration-500`}
          >
            <div className="flex items-center gap-4 lg:gap-6">
              <button
                onClick={() => { setShowTOC(!showTOC); setShowComments(false); setShowNotes(false); setShowSettings(false); setShowBookmarks(false); }}
                className={`p-3 rounded-full transition-all ${showTOC ? s.activeBtn : s.btnHover}`}
                title="Table of Contents"
              >
                <List size={22} />
              </button>
              <button onClick={onBack} className={`p-3 rounded-full transition-all ${s.btnHover}`}>
                <ChevronLeft size={24} />
              </button>
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest truncate max-w-[200px]">{book.title}</h2>
                <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${theme === 'LIGHT' ? 'text-[#FF8C00]' : 'text-small-orange'}`}>
                  {isEpub
                    ? `Reading: ${epubProgress}%`
                    : parsedChapters.length > 0
                      ? parsedChapters[activeParsedChapter]?.title || `Chapter ${activeParsedChapter + 1}`
                      : (currentChapter?.title || `Chapter ${currentChapterIndex + 1}`)}
                  {!isEpub && parsedChapters.length > 0
                    ? ` • Page ${activeParsedPage + 1} of ${parsedChapters[activeParsedChapter]?.pages.length || 1}`
                    : !isEpub && ` • Page ${currentPageIndex + 1} of ${pages.length || 1}`}
                </p>
              </div>
              {book.ownerId && (
                <div className="hidden sm:block">
                  <PlajahPlusButton
                    creatorId={book.ownerId}
                    creatorName={book.artist || book.title}
                    isOwnProfile={book.ownerId === currentUser?.uid}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 lg:gap-4">
              <button
                onClick={handleSaveBook}
                className={`p-3 rounded-full transition-all ${isSaved ? 'text-green-500' : s.btnHover} ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
                title={isSaved ? "Saved to Library" : "Save to Library"}
              >
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Bookmark size={20} className={isSaved ? "fill-green-500" : ""} />}
              </button>

              <button
                onClick={toggleBookmark}
                className={`p-3 rounded-full transition-all ${isCurrentPageBookmarked ? 'text-[#D0BCFF]' : s.btnHover}`}
                title={isCurrentPageBookmarked ? "Remove Bookmark" : "Bookmark This Page"}
              >
                <Bookmark size={20} className={isCurrentPageBookmarked ? 'fill-[#D0BCFF]' : ''} />
              </button>

              <button
                onClick={() => { setShowBookmarks(!showBookmarks); setShowComments(false); setShowNotes(false); setShowTOC(false); setShowSettings(false); }}
                className={`p-3 rounded-full transition-all ${showBookmarks ? s.activeBtn : s.btnHover}`}
                title="My Bookmarks"
              >
                <BookIcon size={20} />
              </button>

              <div className="hidden lg:flex items-center bg-white/5 rounded-full p-1 border border-white/10 group overflow-hidden">
                <button 
                  onClick={() => setViewMode('SINGLE')}
                  className={`p-2 rounded-full transition-all ${viewMode === 'SINGLE' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                >
                  <Square size={16} />
                </button>
                <button 
                  onClick={() => setViewMode('DOUBLE')}
                  className={`p-2 rounded-full transition-all ${viewMode === 'DOUBLE' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                >
                  <Columns size={16} />
                </button>
              </div>

              {/* MAI Voice 2 Narration button */}
              <button
                onClick={() => setShowNarrationPanel(n => !n)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full transition-all text-[9px] font-black uppercase tracking-widest ${showNarrationPanel ? s.activeBtn : s.btnHover}`}
                title="AI Narration — MAI Voice 2"
              >
                <Headphones size={16} />
                <span className="hidden sm:inline">Listen</span>
              </button>

              {/* Author: Record Audiobook */}
              {onOpenAudioStudio && book.ownerId === currentUser?.uid && (
                <button
                  onClick={onOpenAudioStudio}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full transition-all text-[9px] font-black uppercase tracking-widest ${s.btnHover}`}
                  title="Record Audiobook — MAI Transcribe 1.5"
                >
                  <Mic size={16} />
                  <span className="hidden sm:inline">Record</span>
                </button>
              )}

              {/* Original author audio (if available) */}
              {currentChapter?.audioUrl && (
                <button
                  onClick={toggleNarration}
                  className={`p-3 rounded-full transition-all ${isNarrating ? s.activeBtn : s.btnHover}`}
                  title="Author's Narration"
                >
                  {isNarrating ? <Pause size={20} /> : <Volume2 size={20} />}
                </button>
              )}
              <button 
                onClick={toggleReadAlong}
                className={`p-3 rounded-full transition-all ${isReadAlongActive ? 'bg-blue-500 text-white shadow-lg' : s.btnHover}`}
                title="Read Along (Book Club)"
              >
                <Users size={20} />
              </button>
              
              {currentChapter?.url && (
                <button
                  onClick={() => window.open(currentChapter.url, '_blank')}
                  className={`p-3 rounded-full transition-all ${s.btnHover}`}
                  title="Download Book"
                >
                  <Download size={20} />
                </button>
              )}

              {book.allowPageSharing && (
                <button
                  onClick={() => setShowShareModal(true)}
                  className={`p-3 rounded-full transition-all ${s.btnHover}`}
                  title="Share This Page"
                >
                  <Share2 size={20} />
                </button>
              )}

              <button
                onClick={() => { setShowSettings(!showSettings); setShowComments(false); setShowNotes(false); setShowTOC(false); setShowBookmarks(false); }}
                className={`p-3 rounded-full transition-all ${showSettings ? s.activeBtn : s.btnHover}`}
                title="Reading Settings"
              >
                <Settings size={20} />
              </button>

              <button 
                onClick={() => { setShowNotes(!showNotes); setShowComments(false); setShowTOC(false); setShowSettings(false); setShowBookmarks(false); }}
                className={`p-3 rounded-full transition-all ${showNotes ? s.activeBtn : s.btnHover}`}
                title="Notes"
              >
                <Edit3 size={20} />
              </button>
              <button 
                onClick={() => { setShowComments(!showComments); setShowNotes(false); setShowTOC(false); setShowSettings(false); setShowBookmarks(false); }}
                className={`p-3 rounded-full transition-all ${showComments ? s.activeBtn : s.btnHover}`}
                title="Reader Discussion"
              >
                <MessageSquare size={20} />
              </button>
              
              <div className={`hidden md:flex items-center ${theme === 'LIGHT' ? 'bg-black/5' : 'bg-white/5'} rounded-full p-1 border ${theme === 'LIGHT' ? 'border-black/10' : 'border-white/10'}`}>
                <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className={`p-2 transition-all ${s.btnHover}`}><ZoomOut size={18} /></button>
                <span className={`text-[10px] font-black w-12 text-center ${s.subtext}`}>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(3, zoom + 0.1))} className={`p-2 transition-all ${s.btnHover}`}><ZoomIn size={18} /></button>
              </div>

              <button onClick={toggleFullScreen} className={`p-3 rounded-full transition-all ${s.btnHover}`}>
                {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Reader Area */}
      <div className="flex-1 flex overflow-hidden">
        <div 
          className={`flex-1 relative flex items-center justify-center overflow-auto p-4 lg:p-12 no-scrollbar transition-all duration-500 ${(showComments || showNotes || showTOC || showSettings) ? 'lg:mr-[400px]' : ''}`}
          onClick={() => setShowControls(!showControls)}
        >
          <div 
            className="transition-transform duration-300 ease-out w-full h-full flex items-center justify-center"
            style={{ transform: `scale(${zoom})` }}
          >
            {readerError ? (
              <div className={`max-w-2xl w-full ${s.card} rounded-3xl flex items-center justify-center`}>
                <div className="text-center p-12">
                  <div className={`w-14 h-14 mx-auto mb-8 rounded-full border-2 flex items-center justify-center ${theme === 'LIGHT' ? 'border-red-300 bg-red-50' : 'border-red-500/40 bg-red-500/10'}`}>
                    <AlertCircle size={26} className="text-red-400" />
                  </div>
                  <h3 className={`text-xl font-black uppercase tracking-widest mb-3 ${s.text}`}>Unable to Load</h3>
                  <p className={`text-sm ${s.subtext} mb-8 max-w-xs mx-auto leading-relaxed`}>{readerError}</p>
                  <div className="flex flex-col items-center gap-3">
                    {currentChapter?.fallbackUrl && !forceTxtFallback && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setReaderError(null);
                          setForceTxtFallback(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-orange-500 text-black text-xs font-black uppercase tracking-widest hover:bg-orange-400 transition-all"
                      >
                        <BookOpenIcon size={13} />
                        Try Text Version
                      </button>
                    )}
                    {currentChapter?.url && (
                      <a
                        href={currentChapter.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${currentChapter.fallbackUrl && !forceTxtFallback ? `${s.card} border border-white/10 ${s.text} hover:border-orange-400/50` : 'bg-orange-500 text-black hover:bg-orange-400'}`}
                      >
                        <ExternalLink size={13} />
                        Open Original Source
                      </a>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setReaderError(null);
                        if (isTxt && currentChapter?.url) {
                          const txtUrl = forceTxtFallback && currentChapter.fallbackUrl
                            ? currentChapter.fallbackUrl
                            : currentChapter.url;
                          loadFullText(txtUrl);
                        }
                      }}
                      className={`text-xs font-bold uppercase tracking-widest ${s.subtext} hover:text-orange-400 transition-colors`}
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            ) : isLoadingContent ? (
              <div className={`max-w-2xl w-full ${s.card} rounded-3xl flex items-center justify-center`}>
                <div className="text-center p-12 w-full max-w-sm">
                  <div className={`w-14 h-14 mx-auto mb-8 rounded-full border-2 border-t-transparent animate-spin ${theme === 'LIGHT' ? 'border-black/20' : 'border-white/20'}`} style={{ borderTopColor: 'transparent' }} />
                  <h3 className={`text-xl font-black uppercase tracking-widest mb-3 ${s.text}`}>Loading</h3>
                  <p className={`text-xs font-bold ${s.subtext} uppercase tracking-widest`}>
                    {downloadPct !== null ? `Downloading ${downloadPct}%` : 'Your book is on its way…'}
                  </p>
                  {downloadPct !== null && (
                    <div className="mt-5 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-orange-500 transition-all duration-300" style={{ width: `${downloadPct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ) : isEpub && epubData ? (
              <div 
                className={`w-full h-full max-w-5xl rounded-lg shadow-2xl relative ${readingTheme === 'SEPIA' ? 'bg-[#f4ecd8]' : readingTheme === 'PAPER' ? 'bg-[#fdfdfd]' : readingTheme === 'DARK' ? 'bg-[#111]' : (theme === 'LIGHT' ? 'bg-white' : 'bg-[#1a1a1a]')}`}
              >
                <ReaderErrorBoundary
                  resetKey={currentChapter?.url || currentChapter?.id || book.id}
                  onError={(error) => {
                    console.error('EPUB reader failed:', error);
                    if (currentChapter?.fallbackUrl && !forceTxtFallback) {
                      // Don't dead-end — switch to the text version automatically
                      setForceTxtFallback(true);
                    } else {
                      setReaderError('This EPUB could not be opened in the native reader. Save it to your library to cache it on Plajah storage, or open the original source.');
                    }
                  }}
                >
                  <ReactReader
                    url={epubData}
                    title={book.title || ""}
                    location={epubLocation || undefined}
                    locationChanged={(epubcifi: string) => {
                      setEpubLocation(epubcifi);
                      try { localStorage.setItem(EPUB_POS_KEY(book.id), epubcifi); } catch {}
                    }}
                    epubInitOptions={{
                        openAs: 'binary',
                    }}
                    readerStyles={{
                      ...ReactReaderStyle,
                      readerArea: {
                        ...ReactReaderStyle.readerArea,
                        backgroundColor: 'transparent',
                      },
                      tocButton: {
                        ...ReactReaderStyle.tocButton,
                        display: 'none',
                      },
                      tocArea: {
                        ...ReactReaderStyle.tocArea,
                        display: 'none',
                      },
                    }}
                    getRendition={(rendition) => {
                      setReaderError(null);
                      setEpubRendition(rendition);
                      // Real reading progress: generate location points once,
                      // then map every relocation to a percentage.
                      const epBook: any = (rendition as any).book;
                      const updateProgress = (cfi?: string) => {
                        try {
                          if (cfi && epBook?.locations?.length()) {
                            setEpubProgress(Math.round((epBook.locations.percentageFromCfi(cfi) || 0) * 100));
                          }
                        } catch { /* locations not ready yet */ }
                      };
                      rendition.on('relocated', (loc: any) => updateProgress(loc?.start?.cfi));
                      epBook?.ready
                        ?.then(() => epBook.locations.length() ? null : epBook.locations.generate(600))
                        .then(() => updateProgress((rendition as any).currentLocation?.()?.start?.cfi))
                        .catch(() => { /* progress is cosmetic — never block reading */ });
                    }}
                    tocChanged={(toc) => setToc(toc)}
                  />
                </ReaderErrorBoundary>
              </div>
            ) : isPdf ? (
              <div 
                className={`w-full h-full max-w-5xl rounded-lg shadow-2xl relative overflow-y-auto no-scrollbar flex flex-col items-center p-4 lg:p-8 ${theme === 'LIGHT' ? 'bg-white' : 'bg-[#1a1a1a]'}`}
              >
                {proxiedPdfUrl ? (
                  <Document 
                    file={proxiedPdfUrl} 
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={(error) => {
                      console.error('PDF load failed:', error);
                      setReaderError('This PDF could not be opened in the native reader. Save it to your library to cache it on Plajah storage, or open the original source.');
                    }}
                    onSourceError={(error) => {
                      console.error('PDF source failed:', error);
                      setReaderError('This PDF source is unavailable right now. Save it to your library to cache it on Plajah storage, or open the original source.');
                    }}
                    loading={
                      <div className="flex flex-col items-center justify-center p-20 opacity-50">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p className="text-[10px] font-black uppercase tracking-widest">Loading PDF</p>
                      </div>
                    }
                  >
                    <Page 
                      pageNumber={pdfPageNumber} 
                      scale={zoom} 
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      onRenderError={(error) => {
                        console.error('PDF page render failed:', error);
                        setReaderError('This PDF page could not be rendered natively. Open the original source while Plajah retries the reader sync.');
                      }}
                      className="shadow-xl"
                    />
                  </Document>
                ) : null}
                
                {numPdfPages && (
                  <div className="flex items-center gap-6 mt-8 p-4 bg-black/80 backdrop-blur-xl rounded-full text-white shadow-2xl border border-white/10 sticky bottom-8">
                    <button 
                      onClick={() => setPdfPageNumber(p => Math.max(1, p - 1))}
                      disabled={pdfPageNumber <= 1}
                      className="p-2 hover:bg-white/10 rounded-full disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest min-w-[100px] text-center">
                      Page {pdfPageNumber} of {numPdfPages}
                    </span>
                    <button 
                      onClick={() => setPdfPageNumber(p => Math.min(numPdfPages, p + 1))}
                      disabled={pdfPageNumber >= numPdfPages}
                      className="p-2 hover:bg-white/10 rounded-full disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </div>
                )}
              </div>
            ) : pages.length > 0 ? (
              <div className={`flex gap-6 w-full h-full items-center justify-center ${viewMode === 'DOUBLE' ? 'max-w-7xl' : 'max-w-4xl'}`}>
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={`${currentChapterIndex}-${currentPageIndex}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex gap-4 items-center justify-center h-full w-full"
                  >
                    <img 
                      src={pages[currentPageIndex].url} 
                      alt={`Page ${currentPageIndex + 1}`}
                      className={`h-full max-h-[85vh] object-contain rounded-lg shadow-2xl ring-1 ring-white/10 ${viewMode === 'DOUBLE' ? 'w-1/2' : 'w-auto'}`}
                      referrerPolicy="no-referrer"
                    />
                    {viewMode === 'DOUBLE' && currentPageIndex + 1 < pages.length && (
                      <img 
                        src={pages[currentPageIndex + 1].url} 
                        alt={`Page ${currentPageIndex + 2}`}
                        className="h-full max-h-[85vh] w-1/2 object-contain rounded-lg shadow-2xl ring-1 ring-white/10"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : isLoadingContent ? (
              <div className="flex flex-col items-center gap-6">
                <Loader2 className="animate-spin text-small-orange" size={48} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Decrypting neural transcript...</p>
              </div>
            ) : parsedChapters.length > 0 ? (() => {
              const activeCh = parsedChapters[activeParsedChapter] || parsedChapters[0];
              const activePg = activeCh.pages[activeParsedPage] || activeCh.pages[0] || [];
              const chTitle = parsedChapters.length > 1 ? activeCh.title : (currentChapter?.title || activeCh.title);
              return (
                <div className={`${modeMaxW} w-full ${txtCardBg} shadow-2xl rounded-3xl overflow-y-auto max-h-[85vh] ${s.scrollbar}`}>
                  {book.coverImage && activeParsedChapter === 0 && activeParsedPage === 0 && (
                    <div className="relative h-40 overflow-hidden rounded-t-3xl">
                      <img src={book.coverImage} alt="" className="w-full h-full object-cover scale-110" style={{ filter: 'blur(24px) brightness(0.5) saturate(1.3)' }} />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
                      <div className="absolute inset-0 flex items-end p-8">
                        <h3 className="text-2xl font-black uppercase tracking-widest text-white drop-shadow-2xl">{chTitle}</h3>
                      </div>
                    </div>
                  )}
                  <div className="p-10 lg:p-16">
                    {!(book.coverImage && activeParsedChapter === 0 && activeParsedPage === 0) && (
                      <h3 className={`text-2xl font-black uppercase tracking-tight mb-10 text-center ${txtHdColor}`}>{chTitle}</h3>
                    )}
                    <div className={`${txtFontFamily} text-lg ${modeLeading} ${txtColor} space-y-0`} style={{ fontSize: `${Math.round(fontSize * modeScale)}%` }}>
                      {activePg.map((para, i) => (
                        <p key={i} className="mb-5">
                          {readAlongPos?.para === i
                            ? (() => {
                                // Wrap words so the one being narrated can glow
                                let w = 0;
                                return para.split(/(\s+)/).map((tok, k) => {
                                  if (!tok || /^\s+$/.test(tok)) return tok;
                                  const idx = w++;
                                  const isCurrent = idx === readAlongPos.word;
                                  return (
                                    <span
                                      key={k}
                                      ref={isCurrent ? readAlongWordRef : undefined}
                                      className={isCurrent
                                        ? 'bg-orange-500/50 text-white rounded-md px-1 -mx-1 shadow-[0_0_12px_rgba(249,115,22,0.45)] transition-all duration-100'
                                        : 'transition-colors duration-100'}
                                    >
                                      {tok}
                                    </span>
                                  );
                                });
                              })()
                            : para}
                        </p>
                      ))}
                    </div>
                    {/* Page turn hint at bottom */}
                    {(activeParsedPage < activeCh.pages.length - 1 || activeParsedChapter < parsedChapters.length - 1) && (
                      <div className="mt-12 pt-8 border-t border-white/5 text-center">
                        <button onClick={nextPage} className={`text-[9px] font-black uppercase tracking-[0.3em] ${s.subtext} hover:text-small-orange transition-colors`}>
                          {activeParsedPage < activeCh.pages.length - 1
                            ? `Continue — Page ${activeParsedPage + 2} →`
                            : `Next: ${parsedChapters[activeParsedChapter + 1]?.title} →`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className={`max-w-2xl w-full aspect-[2/3] ${s.card} rounded-3xl flex items-center justify-center`}>
                <div className="text-center p-12">
                  <BookOpenIcon size={64} className={`mx-auto mb-8 ${theme === 'LIGHT' ? 'text-black/10' : 'text-white/10'}`} />
                  <h3 className={`text-xl font-black uppercase tracking-widest mb-4 ${s.text}`}>No Visual Data</h3>
                  <p className={`text-xs font-bold ${s.subtext} uppercase tracking-widest leading-loose`}>
                    This chapter does not contain any visual pages. It may be a text-only deployment.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Overlays */}
          <div className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize group" onClick={(e) => { e.stopPropagation(); prevPage(); }}>
            <div className="absolute inset-y-0 left-0 w-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-black/40 to-transparent">
              <ChevronLeft size={48} className="text-white/40" />
            </div>
          </div>
          <div className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize group" onClick={(e) => { e.stopPropagation(); nextPage(); }}>
            <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-black/40 to-transparent">
              <ChevronRight size={48} className="text-white/40" />
            </div>
          </div>
        </div>

        {/* TOC Sidebar */}
        <AnimatePresence>
          {showTOC && (
            <motion.aside 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className={`fixed right-0 top-20 bottom-24 w-full lg:w-[400px] ${s.sidebar} z-40 flex flex-col`}
            >
              <div className="p-8 border-b border-white/10">
                <h3 className="text-xl font-display font-black uppercase tracking-tight mb-2">Table of Contents</h3>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Navigate your literary trajectory</p>
              </div>

              <div className={`flex-1 overflow-y-auto ${s.scrollbar} p-4`}>
                {isEpub ? (
                  <div className="space-y-1">
                    {toc.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => jumpToEpubCfi(item.href)}
                        className={`w-full text-left p-4 rounded-xl group transition-all ${epubLocation === item.href ? 'bg-small-orange text-white' : 'hover:bg-white/5'}`}
                      >
                        <span className={`text-xs font-bold ${epubLocation === item.href ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
                          {item.label.trim()}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : parsedChapters.length > 1 ? (
                  <div className="space-y-2">
                    {parsedChapters.map((chap, i) => (
                      <button
                        key={i}
                        onClick={() => { setActiveParsedChapter(i); setActiveParsedPage(0); setShowTOC(false); }}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl group transition-all ${activeParsedChapter === i ? 'bg-small-orange shadow-xl' : 'hover:bg-white/5'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black ${activeParsedChapter === i ? 'bg-white text-small-orange' : 'bg-white/10'}`}>
                          {i + 1}
                        </div>
                        <div className="text-left overflow-hidden">
                          <p className={`text-xs font-bold truncate ${activeParsedChapter === i ? 'text-white' : 'text-white/80'}`}>{chap.title}</p>
                          <p className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${activeParsedChapter === i ? 'text-white/60' : ''}`}>
                            {chap.pages.length} {chap.pages.length === 1 ? 'page' : 'pages'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {book.bookChapters?.map((chap, i) => (
                      <button
                        key={chap.id}
                        onClick={() => jumpToChapter(chap.id)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl group transition-all ${currentChapterIndex === i ? 'bg-small-orange shadow-xl' : 'hover:bg-white/5'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${currentChapterIndex === i ? 'bg-white text-small-orange' : 'bg-white/10'}`}>
                          <span className="text-[10px] font-black">{i + 1}</span>
                        </div>
                        <div className="text-left overflow-hidden">
                          <p className={`text-xs font-bold truncate ${currentChapterIndex === i ? 'text-white' : 'text-white/80'}`}>{chap.title}</p>
                          <p className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${currentChapterIndex === i ? 'text-white/60' : ''}`}>
                            {chap.pages?.length || 0} Pages
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Bookmarks Sidebar */}
        <AnimatePresence>
          {showBookmarks && (
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className={`fixed right-0 top-20 bottom-24 w-full lg:w-[400px] ${s.sidebar} z-40 flex flex-col`}
            >
              <div className="p-8 border-b border-white/10">
                <h3 className="text-xl font-display font-black uppercase tracking-tight mb-2">Bookmarks</h3>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-40">
                  {bookmarks.length} saved {bookmarks.length === 1 ? 'place' : 'places'}
                </p>
              </div>

              <div className={`flex-1 overflow-y-auto ${s.scrollbar} p-4`}>
                {bookmarks.length > 0 ? (
                  <div className="space-y-2">
                    {[...bookmarks].sort((a, b) => b.createdAt - a.createdAt).map(bm => (
                      <div
                        key={bm.id}
                        className={`group flex items-center gap-3 p-4 rounded-2xl ${s.card} hover:border-[#D0BCFF]/30 transition-all cursor-pointer`}
                        onClick={() => jumpToBookmark(bm)}
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#D0BCFF]/10 border border-[#D0BCFF]/20 flex items-center justify-center shrink-0">
                          <Bookmark size={14} className="text-[#D0BCFF] fill-[#D0BCFF]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-white/80 truncate">{bm.label}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mt-0.5">
                            {new Date(bm.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setBookmarks(prev => prev.filter(b => b.id !== bm.id)); }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-24 text-center">
                    <Bookmark size={36} className="text-white/10 mx-auto mb-4" />
                    <p className="text-white/20 font-black uppercase tracking-widest text-sm">No bookmarks yet</p>
                    <p className="text-white/10 font-black uppercase tracking-widest text-[9px] mt-2">
                      Tap the bookmark icon while reading to save your place
                    </p>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Settings Sidebar */}
        <AnimatePresence>
          {showSettings && (
            <motion.aside 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className={`fixed right-0 top-20 bottom-24 w-full lg:w-[400px] ${s.sidebar} z-40 flex flex-col p-8 overflow-y-auto ${s.scrollbar}`}
            >
              <h3 className="text-xl font-display font-black uppercase tracking-tight mb-8">Reading Settings</h3>
              
              <div className="space-y-12">
                {/* Font Size */}
                <section>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Font Size</label>
                  <div className="flex items-center gap-6">
                    <button onClick={() => setFontSize(Math.max(50, fontSize - 10))} className={`p-4 rounded-2xl ${s.card} hover:scale-110 transition-all`}><Type size={16} /></button>
                    <span className="text-lg font-black">{fontSize}%</span>
                    <button onClick={() => setFontSize(Math.min(200, fontSize + 10))} className={`p-4 rounded-2xl ${s.card} hover:scale-110 transition-all`}><Type size={24} /></button>
                  </div>
                </section>

                {/* Font Family */}
                <section>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Typography</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['sans', 'serif', 'mono'] as const).map(f => (
                      <button 
                        key={f}
                        onClick={() => setFontFamily(f)}
                        className={`py-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${fontFamily === f ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Display Mode — device-class scaling (phone / desk / 10-foot TV) */}
                <section>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Display Mode</label>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      ['AUTO', 'Auto', <Sparkles key="a" size={14} />],
                      ['MOBILE', 'Phone', <Smartphone key="m" size={14} />],
                      ['DESKTOP', 'Desk', <Monitor key="d" size={14} />],
                      ['TV', 'TV', <VideoIcon key="t" size={14} />],
                    ] as const).map(([mode, label, icon]) => (
                      <button
                        key={mode}
                        onClick={() => setDisplayMode(mode)}
                        className={`flex flex-col items-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${displayMode === mode ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                      >
                        {icon}
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] opacity-30 mt-3 font-medium">
                    {displayMode === 'AUTO' ? `Following your screen — currently ${resolvedMode.toLowerCase()} scale.` : 'TV mode enlarges type for reading across the room.'}
                  </p>
                </section>

                {/* Appearance */}
                <section>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Visual Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setReadingTheme('DEFAULT')}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${readingTheme === 'DEFAULT' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10'}`}
                    >
                      <Smartphone size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Default</span>
                    </button>
                    <button 
                      onClick={() => setReadingTheme('SEPIA')}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${readingTheme === 'SEPIA' ? 'bg-[#f4ecd8] text-[#5f4b32] border-[#e0d4b8]' : 'bg-white/5 border-white/10'}`}
                    >
                      <Coffee size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Sepia</span>
                    </button>
                    <button 
                      onClick={() => setReadingTheme('DARK')}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${readingTheme === 'DARK' ? 'bg-[#111] text-[#ccc] border-white/10' : 'bg-white/5 border-white/10'}`}
                    >
                      <Moon size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Nocturnal</span>
                    </button>
                    <button 
                      onClick={() => setReadingTheme('PAPER')}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${readingTheme === 'PAPER' ? 'bg-[#fdfdfd] text-[#111] border-black/10' : 'bg-white/5 border-white/10'}`}
                    >
                      <Sun size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Paper</span>
                    </button>
                  </div>
                </section>

                <section>
                  <div className="p-6 rounded-3xl bg-small-orange/10 border border-small-orange/20">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-small-orange text-white rounded-xl shadow-lg">
                        <BookIcon size={20} />
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-small-orange">Auto-Sync Library</h4>
                    </div>
                    <p className="text-[10px] font-medium leading-relaxed opacity-60">Your progress is automatically cached across all neural nodes in your personal network.</p>
                  </div>
                </section>

                {currentChapter?.url && (
                  <section>
                    <button 
                      onClick={() => window.open(currentChapter.url, '_blank')}
                      className="w-full py-5 bg-white text-black rounded-3xl font-black text-xs uppercase tracking-tightest shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3"
                    >
                      <Download size={18} />
                      Download Archive
                    </button>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 text-center mt-4">
                      {isEpub ? 'EPUB FORMAT' : isPdf ? 'PDF FORMAT' : 'OFFLINE ARCHIVE'}
                    </p>
                  </section>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Comments Sidebar */}
        <AnimatePresence>
          {showComments && (
            <motion.aside 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className={`fixed right-0 top-20 bottom-24 w-full lg:w-[400px] ${s.sidebar} z-40`}
            >
              <CommentSection 
                comments={comments}
                onPostComment={handlePostComment}
                onVisitUser={onVisitUser}
                currentUser={currentUser}
                title="Reader Discussion"
              />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Notes Sidebar */}
        <AnimatePresence>
          {showNotes && (
            <motion.aside 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className={`fixed right-0 top-20 bottom-24 w-full lg:w-[400px] ${s.sidebar} z-40 flex flex-col`}
            >
              <div className={`p-6 border-b ${theme === 'LIGHT' ? 'border-black/5' : 'border-white/5'} flex gap-2`}>
                <button 
                  onClick={() => setActiveNoteTab('PAGE')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeNoteTab === 'PAGE' ? s.activeBtn : s.card}`}
                >
                  Page Notes
                </button>
                <button 
                  onClick={() => setActiveNoteTab('GENERAL')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeNoteTab === 'GENERAL' ? s.activeBtn : s.card}`}
                >
                  General Notes
                </button>
              </div>

              <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${s.scrollbar}`}>
                {notes.filter(n => activeNoteTab === 'PAGE' ? n.pageNumber === currentPageIndex && n.chapterId === currentChapter?.id : n.pageNumber === undefined).map(note => (
                  <div key={note.id} className={`p-4 ${s.card} rounded-2xl`}>
                    {activeNoteTab === 'GENERAL' && note.pageNumber !== undefined && (
                      <button onClick={() => handleJumpToNote(note)} className="text-[9px] font-black text-small-orange uppercase tracking-widest mb-2 hover:underline">
                        Jump to Page {note.pageNumber + 1}
                      </button>
                    )}
                    {note.type === 'TEXT' && <p className={`text-sm ${s.text}`}>{note.content}</p>}
                    {note.type === 'AUDIO' && (
                      <div className={`flex items-center gap-3 ${s.card} p-3 rounded-xl shadow-none`}>
                        <Play size={16} /> <span className="text-xs font-bold">Audio Note</span>
                      </div>
                    )}
                    {note.type === 'LINK' && (
                      <a href={note.content} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-400 hover:underline text-sm">
                        <LinkIcon size={14} /> {note.content}
                      </a>
                    )}
                    <p className={`text-[8px] font-bold ${s.subtext} uppercase tracking-widest mt-3`}>
                      {new Date(note.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                {notes.filter(n => activeNoteTab === 'PAGE' ? n.pageNumber === currentPageIndex && n.chapterId === currentChapter?.id : n.pageNumber === undefined).length === 0 && (
                  <div className="text-center py-12 opacity-30">
                    <Edit3 size={32} className={`mx-auto mb-4 ${s.text}`} />
                    <p className={`text-[10px] font-black uppercase tracking-widest ${s.text}`}>No notes yet.</p>
                  </div>
                )}
              </div>

              <div className={`p-6 border-t ${theme === 'LIGHT' ? 'border-black/5 bg-black/5' : 'border-white/5 bg-black/40'}`}>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setNewNoteType('TEXT')} className={`p-2 rounded-lg transition-all ${newNoteType === 'TEXT' ? (theme === 'LIGHT' ? 'bg-black/10 text-black' : 'bg-white/20 text-white') : s.btnHover}`}><Edit3 size={16} /></button>
                  <button onClick={() => setNewNoteType('AUDIO')} className={`p-2 rounded-lg transition-all ${newNoteType === 'AUDIO' ? (theme === 'LIGHT' ? 'bg-black/10 text-black' : 'bg-white/20 text-white') : s.btnHover}`}><Mic size={16} /></button>
                  <button onClick={() => setNewNoteType('LINK')} className={`p-2 rounded-lg transition-all ${newNoteType === 'LINK' ? (theme === 'LIGHT' ? 'bg-black/10 text-black' : 'bg-white/20 text-white') : s.btnHover}`}><LinkIcon size={16} /></button>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder={newNoteType === 'TEXT' ? "Type a note..." : newNoteType === 'LINK' ? "Paste a link..." : "Audio note URL..."}
                    className={`flex-1 ${s.noteInput} rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2`}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                  />
                  <button onClick={handleAddNote} className={`px-4 py-3 ${s.text === 'text-black' ? 'bg-black text-white' : 'bg-white text-black'} rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all`}>
                    Save
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── MAI Voice 2 Narration Panel ── */}
        <AnimatePresence>
          {showNarrationPanel && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-0 left-0 right-0 z-[150] bg-black/90 backdrop-blur-xl border-t border-white/10 px-4 py-4"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
            >
              {/* Hidden AI audio element */}
              {aiNarrationUrl && (
                <audio ref={aiAudioRef} src={aiNarrationUrl}
                  onEnded={() => setIsAiPlaying(false)}
                  onPlay={() => setIsAiPlaying(true)}
                  onPause={() => setIsAiPlaying(false)}
                />
              )}

              <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-3">
                  <Headphones size={14} className="text-purple-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/60">AI Narration — MAI Voice 2</span>
                  <button onClick={() => setShowNarrationPanel(false)} className="ml-auto w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                    <X size={11} />
                  </button>
                </div>

                {/* Voice selector */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
                  {MAI_VOICES.slice(0, 4).map(v => (
                    <button key={v.id} onClick={() => { setSelectedNarrationVoice(v.id); setAiNarrationUrl(null); }}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${selectedNarrationVoice === v.id ? 'bg-purple-600/40 border-purple-500/60 text-purple-200' : 'bg-white/5 border-white/10 text-white/40'}`}>
                      {v.emoji} {v.name.split(' — ')[0]}
                    </button>
                  ))}
                </div>

                {/* Speed */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[8px] text-white/30 font-black uppercase tracking-widest w-12">Speed</span>
                  {[0.75, 1, 1.1, 1.25].map(r => (
                    <button key={r} onClick={() => { setNarrationRate(r); setAiNarrationUrl(null); }}
                      className={`px-2 py-0.5 rounded-full text-[8px] font-black transition-all ${narrationRate === r ? 'bg-purple-600 text-white' : 'text-white/30 hover:text-white/60'}`}>
                      {r}×
                    </button>
                  ))}
                </div>

                {/* Read-along: on-device voice with live word highlighting */}
                <div className="mb-4 p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Highlighter size={12} className="text-orange-400" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/50">Read Along — follows the narrator word by word</span>
                  </div>
                  {parsedChapters.length > 0 ? (
                    <button
                      onClick={() => (readAlongPos ? stopReadAlong() : startReadAlong(0))}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${readAlongPos ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30'}`}
                    >
                      {readAlongPos ? (<><Pause size={12} /> Stop Read Along</>) : (<><Play size={12} /> Start Read Along</>)}
                    </button>
                  ) : isEpub && currentChapter?.fallbackUrl ? (
                    <button
                      onClick={() => setForceTxtFallback(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-white/50 border border-white/10 transition-all"
                    >
                      <Type size={12} /> Switch to text view for Read Along
                    </button>
                  ) : (
                    <p className="text-[9px] text-white/30 text-center py-2">Read Along is available for text-view books.</p>
                  )}
                </div>

                {/* Generate / Play */}
                <div className="flex gap-3 items-center">
                  {!aiNarrationUrl && !aiNarrationGenerating && (
                    <button onClick={generateAINarration}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
                      <Sparkles size={13} /> Generate Narration
                    </button>
                  )}

                  {aiNarrationGenerating && (
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <motion.div className="h-full bg-purple-500 rounded-full" animate={{ width: `${aiNarrationProgress}%` }} />
                      </div>
                      <p className="text-[9px] text-white/40 text-center">MAI Voice 2 synthesizing… {aiNarrationProgress}%</p>
                    </div>
                  )}

                  {aiNarrationUrl && !aiNarrationGenerating && (
                    <>
                      <button
                        onClick={() => {
                          if (!aiAudioRef.current) return;
                          if (isAiPlaying) aiAudioRef.current.pause();
                          else aiAudioRef.current.play();
                        }}
                        className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center shadow-lg transition-all"
                      >
                        {isAiPlaying ? <Pause size={18} /> : <Play size={18} fill="white" />}
                      </button>
                      <div className="flex-1">
                        <p className="text-[9px] font-black text-white/60">{MAI_VOICES.find(v => v.id === selectedNarrationVoice)?.name}</p>
                        <p className="text-[8px] text-white/30">{isAiPlaying ? 'Playing…' : 'Ready to play'}</p>
                      </div>
                      <button onClick={() => setAiNarrationUrl(null)} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all">
                        <RefreshCw size={12} className="text-white/40" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page Share Modal */}
        <AnimatePresence>
          {showShareModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
              onClick={() => setShowShareModal(false)}
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                transition={{ type: 'spring', damping: 22, stiffness: 340 }}
                className="w-full max-w-md bg-[#0C0C1A]/95 backdrop-blur-2xl border border-white/[0.10] rounded-3xl overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                {/* Preview thumbnail */}
                {book.coverImage && (
                  <div className="relative h-32 overflow-hidden">
                    <img src={book.coverImage} alt="" className="w-full h-full object-cover scale-110" style={{ filter: 'blur(20px) brightness(0.4)' }} />
                    <div className="absolute inset-0 flex items-center gap-4 px-6">
                      <img src={book.coverImage} alt="" className="h-20 w-14 object-cover rounded-xl shadow-2xl border border-white/10 shrink-0" />
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">Sharing a Page From</p>
                        <p className="text-white font-black text-lg leading-tight">{book.title}</p>
                        <p className="text-white/40 text-[9px] font-black uppercase tracking-widest mt-1">
                          {isEpub ? `${epubProgress}% through` : `${currentChapter?.title || `Chapter ${currentChapterIndex + 1}`} · Page ${currentPageIndex + 1}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-6 space-y-4">
                  {!book.coverImage && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">Sharing a Page</p>
                      <p className="text-white font-black text-xl">{book.title}</p>
                      <p className="text-white/40 text-[9px] font-black uppercase tracking-widest mt-1">
                        {isEpub ? `${epubProgress}% through` : `${currentChapter?.title || `Chapter ${currentChapterIndex + 1}`} · Page ${currentPageIndex + 1}`}
                      </p>
                    </div>
                  )}

                  <textarea
                    value={shareCaption}
                    onChange={e => setShareCaption(e.target.value)}
                    placeholder="Add a caption… (optional)"
                    rows={3}
                    maxLength={280}
                    className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#D0BCFF]/30 resize-none font-medium"
                  />
                  <p className="text-[8px] text-white/20 font-black uppercase tracking-widest text-right">{shareCaption.length}/280</p>

                  <p className="text-[8px] font-black uppercase tracking-widest text-white/20 leading-relaxed">
                    This will post to your Plajah feed. Other readers clicking the post will open this exact page.
                  </p>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowShareModal(false)}
                      className="flex-1 py-3 rounded-2xl border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSharePage}
                      disabled={isSharing}
                      className="flex-1 py-3 rounded-2xl bg-[#D0BCFF] text-[#1C1B1F] text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                      {isSharing ? 'Posting…' : 'Share to Feed'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Read Along Video Window */}
        <AnimatePresence>
          {isReadAlongActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`fixed bottom-32 left-8 w-64 ${s.card} border-0 rounded-2xl overflow-hidden shadow-2xl z-50`}
            >
              <div className="aspect-video bg-black relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <VideoIcon size={32} className="text-white/20" />
                </div>
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[8px] font-black uppercase tracking-widest text-white flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  {isHost ? 'Host (You)' : 'Host'}
                </div>
              </div>
              <div className={`p-3 ${theme === 'LIGHT' ? 'bg-black/5' : 'bg-white/5'} flex justify-between items-center`}>
                <span className={`text-[9px] font-black uppercase tracking-widest ${s.subtext}`}>Read Along</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">12 Viewers</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Progress Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.footer 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className={`h-24 ${s.footer} flex items-center px-12 z-50 transition-colors duration-500`}
          >
            <div className="flex-1 flex items-center gap-8">
              <div className={`flex-1 h-1.5 ${s.progressBg} rounded-full overflow-hidden relative group/progress cursor-pointer`}>
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-small-orange"
                  style={{ width: isEpub
                    ? `${epubProgress}%`
                    : parsedChapters.length > 0
                      ? `${((activeParsedChapter * parsedChapters[0].pages.length + activeParsedPage + 1) / parsedChapters.reduce((s, c) => s + c.pages.length, 0) * 100).toFixed(1)}%`
                      : `${(((currentChapterIndex * 100) + ((currentPageIndex + 1) / (pages.length || 1) * 100)) / (book.bookChapters?.length || 1))}%`
                  }}
                />
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <button onClick={prevPage} className={`p-3 transition-all ${s.btnHover}`}><ChevronLeft size={24} /></button>
                <div className={`px-6 py-2 ${theme === 'LIGHT' ? 'bg-black/5' : 'bg-white/5'} border border-black/10 rounded-full`}>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${s.text} whitespace-nowrap`}>
                    {isEpub
                      ? `${epubProgress}%`
                      : parsedChapters.length > 0
                        ? `CH.${activeParsedChapter + 1} • P.${activeParsedPage + 1}`
                        : isGraphicNovel
                          ? `ISSUE ${currentChapterIndex + 1} • P.${currentPageIndex + 1}`
                          : `CH.${currentChapterIndex + 1} • P.${currentPageIndex + 1}`}
                  </span>
                </div>
                <button onClick={nextPage} className={`p-3 transition-all ${s.btnHover}`}><ChevronRight size={24} /></button>
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>

    {/* Opening scene — overlays reader; unmounts after animation completes */}
    {showOpeningScene && (
      <BookOpeningScene
        coverImage={book.coverImage ?? undefined}
        title={book.title}
        author={book.artist ?? undefined}
        onBeginReading={() => { if (mountedRef.current) setShowOpeningScene(false); }}
        chapterTitle={book.bookChapters?.[currentChapterIndex]?.title ?? undefined}
        pageIndex={currentPageIndex}
        resuming={savedPos.chapter > 0 || savedPos.page > 0}
      />
    )}
    </>
  );
};

const BookOpen = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

export default BookReader;
