import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { recordHabit } from '../services/habitsService';
import { createPortal } from 'react-dom';
import { Album, BookChapter, BookPage, Comment, BookNote } from '../types';
import ComicReader from './ComicReader';
import { buildShareUrl } from '../services/deepLinkService';
import { createParty, partyShareUrl } from '../services/partyService';
import { useParty } from '../hooks/useParty';
import PartyBar from './party/PartyBar';
import { partyToast } from './party/partyToast';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, ZoomIn, ZoomOut, Grid, Bookmark, BookMarked, Library, Settings, MessageSquare, Edit3, Mic, Link as LinkIcon, Play, Pause, Users, Video as VideoIcon, Highlighter, RefreshCw, List, Book as BookIcon, Type, Smartphone, Monitor, Moon, Sun, Coffee, Columns, Square, Download, Loader2, BookOpen as BookOpenIcon, Share2, Trash2, Headphones, ChevronDown, Volume2, Sparkles, AlertCircle, ExternalLink, Palette, Megaphone } from 'lucide-react';
import ChoraPromoModal from './music/ChoraPromoModal';
import { MAI_VOICES, synthesizeParagraphs, estimateNarrationDurationMs } from '../services/microsoftAIService';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToComments, postComment, createPost, loginWithGoogle, auth } from '../services/backendService';
import { cacheExternalBookAssets } from '../services/bookStorageService';
import { fetchBookBinary, fetchBookText, fetchAndParseBookChapters, getCachedParsedChapters, getCachedFormattedText, cleanGutenbergMarkup, formatReadableText, parseChaptersFromText, ParsedChapter, stripHtmlToText } from '../services/bookContentService';
import { getClassicBookTextUrl, getInstantClassicOpeningChapters } from '../data/classicBooks';
import {
  CLASSIC_PAGE_THEMES,
  resolveClassicPageTheme,
  ClassicPageFlourishFrame,
  ClassicThemeViewerDrawer,
  renderChapterCrestSvg,
  renderUnderTitleFlourishSvg,
} from '../data/classicPageThemes';
import { launchClassicBookInChoraDaw } from '../services/melos/classicBookChoraProjects';
import BookFolioBody from './lorea/BookFolioBody';
import PageTurn from './lorea/PageTurn';
import PageTurnSettings from './lorea/PageTurnSettings';
import { usePageTurn } from './lorea/usePageTurn';
import { runEpubTurn } from './lorea/epubTurn';
import { dirForArrowKey, dirForTapSide, inferBookKind, sanitizeAuthorPageTurn } from '../services/lorea/pageTransitions';
import { adaptEpub, adaptPdf, toParsedChapters, type FolioDoc, type PageExtras } from '../services/bookPageAdapters';
import CommentSection, { type CommentMedia } from './CommentSection';
import ShareButton from './ShareButton';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import PlajahPlusButton from './PlajahPlusButton';
import { BookOpeningScene } from './BookOpeningScene';
import { BuyToOwn, useOwnership } from './BuyToOwn';
import { isSealedBook, openSealedBook, type BookAccess } from '../services/bookVault';
import { getPreferredVersion, VERSION_PREF_EVENT } from '../services/bookEditions/readerPrefs';
import EditionBar from './lorea/EditionBar';
import { readRegistry } from '../services/bookEditions/policy';
import BookGiveaways from './lorea/BookGiveaways';
import { openSponsor } from '../services/sponsorCopies/client';
import { Gift } from 'lucide-react';
import { useTelaEdition } from './bookTela/useTelaEdition';
import { isLivingPictureBook, useLivingPictureBook } from './living/useLivingPictureBook';
// Tela edition (services/bookTela): lazy, so the classic reader pays nothing unless the author upgraded the book.
const TelaBookReader = React.lazy(() => import('./bookTela/TelaBookReader'));
import BuyPrintEdition from './pod/BuyPrintEdition';
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
  /** If opened from a shared read-along link, the party to auto-join and follow. */
  partyId?: string;
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

const BookReaderInner: React.FC<BookReaderProps> = ({ book, onBack, currentUser, onVisitUser, onOpenAudioStudio, partyId }) => {
  const { theme } = useGlobalPlayerState();

  // Restore last-read position from localStorage (respecting initialChapterIndex / skipOpeningScene)
  const savedPos = (() => {
    // The Tela reader writes the same `lorea_pos_<id>` key with a different meaning (its "chapter" is a Tela chapter, one per page in the picture books).
    // Never trust it blindly: a chapter that does not exist here would open "No visual data".
    const raw = loadSavedPosition(book.id); const chs = book.bookChapters ?? [];
    if (!chs.length) return raw;
    if (chs.length === 1 && (chs[0].pages?.length ?? 0) > 0) { const n = chs[0].pages!.length; return { chapter: 0, page: Math.max(0, Math.min(n - 1, raw.chapter > 0 ? raw.chapter + raw.page : raw.page)) }; }
    return raw.chapter >= chs.length ? { chapter: chs.length - 1, page: 0 } : raw;
  })();
  const initialChapter = typeof (book as any).initialChapterIndex === 'number'
    ? (book as any).initialChapterIndex
    : savedPos.chapter;
  const [currentChapterIndex, setCurrentChapterIndex] = useState(initialChapter);
  const [showOpeningScene, setShowOpeningScene] = useState(() => {
    if ((book as any).skipOpeningScene) return false;
    return true;
  });

  useEffect(() => {
    if (typeof (book as any).initialChapterIndex === 'number') {
      setCurrentChapterIndex((book as any).initialChapterIndex);
      if ((book as any).skipOpeningScene) {
        setShowOpeningScene(false);
      }
    }
  }, [book.id, (book as any).initialChapterIndex]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Buy-to-own gate (Lorea) ────────────────────────────────────────────────
  // A paid book (Album.price > 0) opens into a purchase screen unless the reader is
  // the author or holds a contentLicense. Books default to DOWNLOAD_OPEN + watermark
  // (the license service fills those defaults). The gate is the final return below.
  const isPaidBook = !!book.price && book.price > 0;
  const activeUid = currentUser?.uid || auth.currentUser?.uid;
  const isBookOwner = Boolean(
    activeUid && (
      book.ownerId === activeUid ||
      (book as any).creatorId === activeUid ||
      (book as any).artistId === activeUid
    )
  );
  const bookOwnership = useOwnership('book', book.id, currentUser?.uid);
  const hasBookAccess = isBookOwner || !isPaidBook || bookOwnership.owned;
  const telaEdition = useTelaEdition(book, { isOwner: isBookOwner, isPaid: isPaidBook, ownershipLoading: bookOwnership.loading, license: bookOwnership.license });

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
  // A living picture book (showcase books) is read in THIS reader, same shell as every other book: the page images become live pages.
  const livingPicture = telaEdition.status === 'tela' && isLivingPictureBook(book, telaEdition.bundle);
  const goToLivePage = useCallback((i: number) => setCurrentPageIndex(Math.max(0, i)), []);
  // Side arrows: hide the one that would go nowhere (first / last image page). Other formats keep both.
  const sideArrowHidden = (side: 'left' | 'right'): boolean => {
    const n = (book.bookChapters?.[0]?.pages?.length ?? 0); if (!n || (book.bookChapters?.length ?? 0) !== 1) return false;
    const forward = dirForTapSide(side, (book as any).readingDir === 'rtl') === 1;
    return forward ? currentPageIndex >= n - 1 : currentPageIndex <= 0;
  };
  const livingBook = useLivingPictureBook(book, telaEdition.status === 'tela' ? telaEdition.bundle : null, livingPicture, goToLivePage, currentPageIndex);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [viewMode, setViewMode] = useState<'SINGLE' | 'DOUBLE'>('SINGLE');
  // Parsed chapters/pages for TXT books — synchronously hydrated from memory cache or instant classic opening pages for 0ms first paint
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>(() => {
    const ch0 = book.bookChapters?.[0];
    if (ch0?.pages?.length) return [];
    const cached = getCachedParsedChapters(ch0?.url) || getCachedParsedChapters(ch0?.fallbackUrl) || getCachedParsedChapters(book.id);
    if (cached && cached.length > 0) return cached;
    const instant = getInstantClassicOpeningChapters(book.title, book.id);
    return instant || [];
  });
  const [activeParsedChapter, setActiveParsedChapter] = useState(0);
  const [activeParsedPage, setActiveParsedPage] = useState(0);
  // When EPUB fails, user can request plain-text fallback
  const [forceTxtFallback, setForceTxtFallback] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showThemeViewer, setShowThemeViewer] = useState(false);
  // Default: reader is CONTAINED in the content column (between the pillars and the right
  // edge). Full-bleed immersive mode is an opt-in toggle in the header.
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);

  // Settings State
  const [fontSize, setFontSize] = useState(100);
  const [readingTheme, setReadingTheme] = useState<'DEFAULT' | 'SEPIA' | 'DARK' | 'PAPER' | 'VIOLET'>('SEPIA');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  // Page style for text books: FOLIO (the book-page look from Academia lessons) or the original CLASSIC card.
  const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  const [pageStyle, setPageStyleState] = useState<'FOLIO' | 'CLASSIC'>(() => (lsGet('lorea_page_style') === 'CLASSIC' ? 'CLASSIC' : 'FOLIO'));
  const [easyRead, setEasyReadState] = useState(() => lsGet('lorea_easy_read') === '1');
  const [calmRead, setCalmReadState] = useState(() => lsGet('lorea_calm_read') === '1');

  // Classic Cover-Matched Page & Text Flourish Themes (defaults ON for classics, toggleable via "Themes" button)
  const [classicThemesEnabled, setClassicThemesEnabledState] = useState<boolean>(() => lsGet('lorea_classic_themes_enabled') !== '0');
  const setClassicThemesEnabled = (v: boolean) => {
    setClassicThemesEnabledState(v);
    lsSet('lorea_classic_themes_enabled', v ? '1' : '0');
  };
  const [selectedThemeOverride, setSelectedThemeOverride] = useState<string | null>(null);
  const [flourishMotionMode, setFlourishMotionModeState] = useState<'settle' | 'static'>(() =>
    lsGet('lorea_flourish_motion_mode') === 'static' ? 'static' : 'settle'
  );
  const setFlourishMotionMode = (m: 'settle' | 'static') => {
    setFlourishMotionModeState(m);
    lsSet('lorea_flourish_motion_mode', m);
  };
  const [flourishMotionState, setFlourishMotionState] = useState<'awakening' | 'settled' | 'static'>('awakening');
  const matchedBookTheme = useMemo(() => resolveClassicPageTheme(book.title, book.id), [book.title, book.id]);
  const activeClassicTheme = useMemo(
    () => (classicThemesEnabled ? resolveClassicPageTheme(book.title, book.id, selectedThemeOverride) : null),
    [classicThemesEnabled, book.title, book.id, selectedThemeOverride]
  );

  // Trigger 6-second settling flourish motion when opening a book, turning pages, or switching themes
  const triggerFlourishAwakening = useCallback(() => {
    if (flourishMotionMode === 'static' || calmRead) {
      setFlourishMotionState('static');
      return;
    }
    setFlourishMotionState('awakening');
  }, [flourishMotionMode, calmRead]);

  useEffect(() => {
    if (flourishMotionMode === 'static' || calmRead) {
      setFlourishMotionState('static');
      return;
    }
    setFlourishMotionState('awakening');
    const timer = setTimeout(() => {
      setFlourishMotionState('settled');
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeClassicTheme?.id, activeParsedChapter, activeParsedPage, currentChapterIndex, currentPageIndex, flourishMotionMode, calmRead]);

  // EPUB/PDF adapted into folio pages (text and pictures separated). null = not built, failed, or a scan with no text layer.
  const [folioDoc, setFolioDoc] = useState<FolioDoc | null>(null);
  const [folioExtras, setFolioExtras] = useState<PageExtras>({ figures: [] });
  const [folioFailed, setFolioFailed] = useState(false);
  const [folioBuilding, setFolioBuilding] = useState<number | null>(null);
  const setPageStyle = (v: 'FOLIO' | 'CLASSIC') => { setPageStyleState(v); lsSet('lorea_page_style', v); };
  const setEasyRead = (v: boolean) => { setEasyReadState(v); lsSet('lorea_easy_read', v ? '1' : '0'); };
  const setCalmRead = (v: boolean) => { setCalmReadState(v); lsSet('lorea_calm_read', v ? '1' : '0'); };

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
  const modeMaxW    = isFullscreen ? 'max-w-6xl w-full px-2 sm:px-6' : resolvedMode === 'TV' ? 'max-w-7xl' : resolvedMode === 'DESKTOP' ? (viewMode === 'DOUBLE' ? 'max-w-7xl' : 'max-w-5xl') : 'max-w-xl';
  const modeLeading = resolvedMode === 'TV' ? 'leading-[2.1]' : 'leading-[1.9]';

  // Read Along (Book Club) — a synchronized reading party. The host's page is broadcast; every
  // reader's own book follows to that chapter+page (content is local — see services/partyService).
  const [activePartyId, setActivePartyId] = useState<string | null>(partyId ?? null);
  useEffect(() => { setActivePartyId(partyId ?? null); }, [partyId]);
  const party = useParty(activePartyId);
  const isReadAlongActive = !!activePartyId;
  const isHost = party.isHost;
  const followingRef = useRef(false);   // guard: don't re-broadcast a page turn we made to follow
  // Followers' page turns are locked to the host; "Read on my own" is the escape hatch.
  const [readOnOwn, setReadOnOwn] = useState(false);
  useEffect(() => { setReadOnOwn(false); }, [activePartyId]);
  const pageLocked = party.isFollower && !readOnOwn;
  const lockedNudge = useCallback(() => { partyToast(`Following ${party.party?.hostName || 'the host'} — tap “Read on my own” to browse`); }, [party.party?.hostName]);
  
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
  // Started and not yet stopped/ended — distinguishes "paused" from "ready"
  const [aiNarrationActive, setAiNarrationActive] = useState(false);
  
  // Read-along narration: browser speech synthesis with word-boundary events
  // drives a live highlight of the word being spoken. Works fully on-device.
  const [readAlongPos, setReadAlongPos] = useState<{ para: number; word: number } | null>(null);
  const [readAlongAutoNext, setReadAlongAutoNext] = useState(false);
  const [readAlongPaused, setReadAlongPaused] = useState(false);
  const readAlongSession = useRef<{ stop: boolean }>({ stop: true });
  // Last spoken character, so Pause → Resume picks up mid-paragraph
  const readAlongCharRef = useRef<{ para: number; char: number }>({ para: 0, char: 0 });
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
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [shareCaption, setShareCaption] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    // Determine if already saved (basic check)
    // A bought book is already on the buyer's shelf through their licence.
    if (book.ownerId === currentUser?.uid || (isPaidBook && bookOwnership.owned)) {
      setIsSaved(true);
    }
  }, [book, currentUser, isPaidBook, bookOwnership.owned]);

  const handleSaveBook = async () => {
    if (!currentUser || isSaved || isSaving) return;
    // "Save" clones the album into the reader's own public shelf — a paid book would be republished
    // with its content. Buyers already keep it through their licence.
    if (isPaidBook) return;
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
  const classicFallbackTxtUrl = useMemo(
    () => currentChapter?.fallbackUrl || getClassicBookTextUrl(book.id) || getClassicBookTextUrl(book.title),
    [currentChapter?.fallbackUrl, book.id, book.title]
  );

  const currentUrl = currentChapter?.url || classicFallbackTxtUrl || '';
  const lowerCurrentUrl = currentUrl.toLowerCase();
  const isExplicitTxt =
    currentChapter?.format === 'TXT' ||
    lowerCurrentUrl.endsWith('.txt') ||
    lowerCurrentUrl.includes('.txt?') ||
    lowerCurrentUrl.includes('text/plain') ||
    lowerCurrentUrl.includes('text%2fplain');
  const isEpub = !forceTxtFallback && !isExplicitTxt && (
    currentChapter?.format === 'EPUB' ||
    lowerCurrentUrl.endsWith('.epub') ||
    lowerCurrentUrl.includes('.epub?') ||
    (lowerCurrentUrl.includes('epub') && !lowerCurrentUrl.includes('/cache/epub/'))
  );
  const isPdf = !isExplicitTxt && (currentChapter?.format === 'PDF' || lowerCurrentUrl.endsWith('.pdf') || lowerCurrentUrl.includes('.pdf'));
  const isTxt = !isEpub && !isPdf && !isGraphicNovel && (
    // Forced text fallback: the chapter itself is EPUB but we read its TXT
    // fallbackUrl — without this clause the reader showed "no visual data".
    (forceTxtFallback && !!classicFallbackTxtUrl) ||
    !!classicFallbackTxtUrl ||
    isExplicitTxt ||
    lowerCurrentUrl.includes('.txt.') ||
    lowerCurrentUrl.includes('/txt') ||
    (lowerCurrentUrl.includes('archive.org') && !lowerCurrentUrl.includes('.epub') && !lowerCurrentUrl.includes('.pdf'))
  );

  const [showPageJumper, setShowPageJumper] = useState(false);
  const folioActive = pageStyle === 'FOLIO' && !!folioDoc && !folioDoc.textless;
  const folioPending = pageStyle === 'FOLIO' && !folioFailed && !folioDoc && (isEpub || isPdf);
  // The native EPUB/PDF viewers step aside when the folio page is showing (or building) the same book.
  const isEpubReader = isEpub && !folioActive && !folioPending;
  const isPdfReader = isPdf && !folioActive && !folioPending;

  // Reset per-chapter state when the chapter changes
  useEffect(() => {
    setFolioDoc(null);
    setFolioFailed(false);
    setFolioBuilding(null);
    setFolioExtras({ figures: [] });
    setReaderError(null);
    setNumPdfPages(undefined);
    setPdfPageNumber(1);
    const cached = getCachedParsedChapters(currentChapter?.url) || getCachedParsedChapters(currentChapter?.fallbackUrl) || getCachedParsedChapters(book.id);
    if (cached && cached.length > 0) {
      setParsedChapters(cached);
    } else if (!currentChapter?.pages?.length) {
      const instant = getInstantClassicOpeningChapters(book.title, book.id);
      setParsedChapters(instant || []);
    } else {
      setParsedChapters([]);
    }
    setActiveParsedChapter(0);
    setActiveParsedPage(0);
    setForceTxtFallback(false);
    setEpubData(null);
    setDownloadPct(null);
  }, [currentChapter?.id, currentChapter?.url, book.id, book.title]);

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
        if (classicFallbackTxtUrl) {
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
  }, [isEpub, currentChapter?.url, classicFallbackTxtUrl]);

  // Build the folio pages from the EPUB / PDF bytes (same cached bytes the native viewers use).
  useEffect(() => {
    if (pageStyle !== 'FOLIO' || folioDoc || folioFailed) return;
    const wantsEpub = isEpub && !!epubData;
    const wantsPdf = isPdf && !isEpub && !!proxiedPdfUrl;
    if (!wantsEpub && !wantsPdf) return;
    let cancelled = false;
    setFolioBuilding(0);
    (async () => {
      try {
        const doc = wantsEpub
          ? await adaptEpub(epubData!)
          : await adaptPdf(await fetchBookBinary(proxiedPdfUrl!), { onProgress: (d, t) => { if (!cancelled) setFolioBuilding(Math.round((d / t) * 100)); } });
        if (cancelled || !mountedRef.current) { doc.dispose(); return; }
        if (doc.textless) { doc.dispose(); setFolioFailed(true); return; } // a scan with no text: keep the page viewer
        setParsedChapters(toParsedChapters(doc));
        setActiveParsedChapter(0);
        setActiveParsedPage(0);
        setFolioDoc(doc);
      } catch (e) {
        console.warn('[BookReader] folio adapter failed, keeping the native viewer:', (e as any)?.message);
        if (!cancelled) setFolioFailed(true);
      } finally {
        if (!cancelled) setFolioBuilding(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStyle, isEpub, isPdf, epubData, proxiedPdfUrl, folioDoc, folioFailed]);

  // Release blob URLs and the PDF worker when the adapted book goes away
  useEffect(() => () => { folioDoc?.dispose(); }, [folioDoc]);

  // Figures for the page on screen (EPUB: known; PDF: cropped from the rendered page on demand)
  useEffect(() => {
    if (!folioDoc) { setFolioExtras({ figures: [] }); return; }
    let cancelled = false;
    setFolioExtras({ figures: [] });
    folioDoc.extras(activeParsedChapter, activeParsedPage).then(x => { if (!cancelled) setFolioExtras(x); }).catch(() => {});
    return () => { cancelled = true; };
  }, [folioDoc, activeParsedChapter, activeParsedPage]);

  // Load content whenever the resolved format changes (including TXT fallback override)
  useEffect(() => {
    const inlineContent = currentChapter?.content?.trim() || '';
    const isPoisonedInline =
      inlineContent.includes('Plajah v1.') ||
      inlineContent.includes('id="pj-boot"') ||
      inlineContent.includes('<div id="root"') ||
      (!!classicFallbackTxtUrl && inlineContent.length < 300);

    if (currentChapter?.pages?.length) {
      setChapterContent('');
      setParsedChapters([]);
    } else if (inlineContent && !isPoisonedInline) {
      const formatted = formatReadableText(inlineContent);
      setChapterContent(formatted);
      setParsedChapters(parseChaptersFromText(formatted, book.id));
    } else if (isTxt && (currentChapter?.url || classicFallbackTxtUrl)) {
      if (forceTxtFallback && classicFallbackTxtUrl) {
        loadFullText(classicFallbackTxtUrl);
      } else {
        loadFullText(currentChapter?.url || classicFallbackTxtUrl!, classicFallbackTxtUrl);
      }
    } else if (!isEpub) {
      setChapterContent('');
    }
  }, [currentChapter?.id, currentChapter?.url, currentChapter?.content, currentChapter?.pages?.length, isTxt, isEpub, forceTxtFallback, classicFallbackTxtUrl, book.id]);

  const loadFullText = async (url: string, fallback?: string) => {
    if (!mountedRef.current) return;
    const preCached = getCachedParsedChapters(url) || (fallback ? getCachedParsedChapters(fallback) : null);
    const preFormatted = getCachedFormattedText(url) || (fallback ? getCachedFormattedText(fallback) : null);
    if (preCached && preCached.length > 0) {
      if (preFormatted) setChapterContent(preFormatted);
      setParsedChapters(preCached);
      setIsLoadingContent(false);
      return;
    }

    // Only show a full-page loading indicator if we don't already have instant opening pages on screen
    const hasInstantPreview = parsedChapters.length > 0;
    if (!hasInstantPreview) {
      setIsLoadingContent(true);
    }
    try {
      const { formatted, chapters } = await fetchAndParseBookChapters(url, fallback);
      if (!mountedRef.current) return;
      setChapterContent(formatted);
      setParsedChapters(chapters);
      setReaderError(null);
    } catch (error: any) {
      if (!mountedRef.current) return;
      console.error('Error loading full text:', error);
      // If we already have instant opening chapters, keep them readable instead of replacing with an error screen
      if (parsedChapters.length === 0) {
        setReaderError('This book could not be loaded. Check your connection or try the original source.');
        setChapterContent('');
      }
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

  useEffect(() => {
    if (showOpeningScene || !currentUser) return;
    const timer = setTimeout(() => {
      void recordHabit({ id: book.id, kind: 'BOOK', title: book.title, ownerName: book.artist, thumbnailUrl: book.coverImage,
        location: isEpub ? undefined : isPdf ? `PDF page ${pdfPageNumber}` : `Chapter ${currentChapterIndex + 1}, page ${currentPageIndex + 1}` });
    }, 1500);
    return () => clearTimeout(timer);
  }, [book.id, currentUser?.uid, showOpeningScene, isEpub, isPdf, pdfPageNumber, currentChapterIndex, currentPageIndex]);

  const handlePostComment = async (text: string, parentId?: string, _mediaTimestamp?: number, media?: CommentMedia) => {
    if (!currentUser) return;
    await postComment(book.id, {
      author: currentUser.displayName || 'READER',
      text,
      trackId: 'album',
      ...media,
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
      } else if (readingTheme === 'VIOLET') {
        textColor = '#e6e0f5';
        bgColor = '#0e0b16';
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

  // ── Page turn animation ───────────────────────────────────────────────────
  // Which animation plays comes from the author's choice on the book edition, the reader's own setting
  // (Reading Settings > Page animation) and the OS reduced-motion preference. See docs/LOREA_PAGE_TURNS.md.
  const readerRtl = (book as any).readingDir === 'rtl';
  const pageTurnKind = inferBookKind({ rtl: readerRtl, visualLed: pages.length > 0 && !isEpub, format: (book as any).bookFormat });
  const pageTurnAuthor = useMemo(() => sanitizeAuthorPageTurn(book.bookTela?.pageTurn), [book.bookTela?.pageTurn]);
  const pageTurn = usePageTurn({ kind: pageTurnKind, author: pageTurnAuthor, chapterId: currentChapter?.id });
  const readerGestureRef = useRef<HTMLDivElement>(null);
  const epubShellRef = useRef<HTMLDivElement>(null);
  const epubTurnBusy = useRef(false);
  const pageTurnPaper = readingTheme === 'SEPIA' ? '#f1e6cb' : readingTheme === 'PAPER' ? '#f3f1ea' : readingTheme === 'VIOLET' ? '#1a1526' : (readingTheme === 'DARK' || theme !== 'LIGHT') ? '#202024' : '#f4efe4';
  /** EPUB: exit animation, rendition move, enter animation on the live reader surface (no snapshot of the epub.js iframe is possible). */
  const turnEpub = useCallback((dir: 1 | -1, navigate: () => void) => {
    if (epubTurnBusy.current || !epubRendition) { navigate(); return; }
    epubTurnBusy.current = true;
    const r: any = epubRendition;
    const relocated = () => new Promise<void>((resolve) => {
      let done = false;
      const fin = () => { if (done) return; done = true; try { r.off?.('relocated', fin); } catch { /* gone */ } resolve(); };
      try { r.on?.('relocated', fin); } catch { /* ignore */ }
      setTimeout(fin, 420);
    });
    runEpubTurn({ el: epubShellRef.current, turn: pageTurn.turn, dir, rtl: readerRtl, navigate, relocated })
      .catch(() => { /* animation is cosmetic */ })
      .finally(() => { epubTurnBusy.current = false; });
  }, [epubRendition, pageTurn.turn, readerRtl]);

  const nextPage = useCallback(() => {
    if (pageLocked) { lockedNudge(); return; }
    if (isEpubReader && epubRendition) {
      try {
        if ((epubRendition as any).manager) turnEpub(1, () => { try { epubRendition.next(); } catch (e) { console.warn('EPUB next page error', e); } });
      } catch (e) { console.warn('EPUB next page error', e); }
    } else if (isPdfReader && numPdfPages) {
      if (pdfPageNumber < numPdfPages) {
        setPdfPageNumber(p => Math.min(numPdfPages, p + 1));
      } else if (currentChapterIndex < (book.bookChapters?.length || 0) - 1) {
        setCurrentChapterIndex(c => c + 1);
        setPdfPageNumber(1);
      }
    } else if (parsedChapters.length > 0 && pages.length === 0) {
      const ch = parsedChapters[activeParsedChapter];
      if (ch && activeParsedPage < ch.pages.length - 1) {
        setActiveParsedPage(p => p + 1);
      } else if (activeParsedChapter < parsedChapters.length - 1) {
        setActiveParsedChapter(c => c + 1);
        setActiveParsedPage(0);
      } else if (currentChapterIndex < (book.bookChapters?.length || 0) - 1) {
        setCurrentChapterIndex(c => c + 1);
        setCurrentPageIndex(0);
      }
    } else if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(p => p + 1);
    } else if (currentChapterIndex < (book.bookChapters?.length || 0) - 1) {
      setCurrentChapterIndex(c => c + 1);
      setCurrentPageIndex(0);
    }
  }, [pageLocked, lockedNudge, isEpubReader, epubRendition, turnEpub, isPdfReader, numPdfPages, pdfPageNumber, parsedChapters, activeParsedChapter, activeParsedPage, currentPageIndex, pages.length, currentChapterIndex, book.bookChapters]);

  const prevPage = useCallback(() => {
    if (pageLocked) { lockedNudge(); return; }
    if (isEpubReader && epubRendition) {
      try {
        if ((epubRendition as any).manager) turnEpub(-1, () => { try { epubRendition.prev(); } catch (e) { console.warn('EPUB prev page error', e); } });
      } catch (e) { console.warn('EPUB prev page error', e); }
    } else if (isPdfReader && numPdfPages) {
      if (pdfPageNumber > 1) {
        setPdfPageNumber(p => Math.max(1, p - 1));
      } else if (currentChapterIndex > 0) {
        setCurrentChapterIndex(c => c - 1);
        setPdfPageNumber(1);
      }
    } else if (parsedChapters.length > 0 && pages.length === 0) {
      if (activeParsedPage > 0) {
        setActiveParsedPage(p => p - 1);
      } else if (activeParsedChapter > 0) {
        const prevCh = parsedChapters[activeParsedChapter - 1];
        setActiveParsedChapter(c => c - 1);
        setActiveParsedPage(Math.max(0, (prevCh?.pages.length || 1) - 1));
      } else if (currentChapterIndex > 0) {
        setCurrentChapterIndex(c => c - 1);
        setCurrentPageIndex(0);
      }
    } else if (currentPageIndex > 0) {
      setCurrentPageIndex(p => p - 1);
    } else if (currentChapterIndex > 0) {
      setCurrentChapterIndex(c => c - 1);
      const prevChapterPages = book.bookChapters?.[currentChapterIndex - 1]?.pages || [];
      setCurrentPageIndex(Math.max(0, prevChapterPages.length - 1));
    }
  }, [pageLocked, lockedNudge, isEpubReader, epubRendition, turnEpub, isPdfReader, numPdfPages, pdfPageNumber, parsedChapters, activeParsedChapter, activeParsedPage, currentPageIndex, currentChapterIndex, book.bookChapters, pages.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        if (showPageJumper) { setShowPageJumper(false); return; }
        onBack();
        return;
      }
      // ComicReader handles its own keyboard navigation when image pages are active
      if (pages.length > 0) return;
      // RTL books (manga, Arabic): the left arrow advances. LTR is unchanged.
      const d = dirForArrowKey(e.key, (book as any).readingDir === 'rtl');
      if (d === 1) nextPage();
      if (d === -1) prevPage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, onBack, book, pages.length, showPageJumper]);

  // ── Read-along narration ─────────────────────────────────────────────────
  const stopReadAlong = useCallback(() => {
    readAlongSession.current.stop = true;
    setReadAlongAutoNext(false);
    setReadAlongPaused(false);
    try { window.speechSynthesis?.cancel(); } catch {}
    setReadAlongPos(null);
  }, []);

  // Pause cancels the utterance and keeps the highlight; resume re-speaks from
  // the last word boundary. speechSynthesis.pause() is unreliable with online
  // voices (Chrome drops the queue after ~15s), so we don't use it.
  const pauseReadAlong = useCallback(() => {
    readAlongSession.current.stop = true;
    try { window.speechSynthesis?.cancel(); } catch {}
    setReadAlongPaused(true);
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

  const startReadAlong = useCallback((startPara = 0, startChar = 0) => {
    if (!('speechSynthesis' in window)) {
      setReaderError('Read-along narration is not supported on this device.');
      return;
    }
    readAlongSession.current.stop = true;
    try { window.speechSynthesis.cancel(); } catch {}
    setReadAlongPaused(false);
    const session = { stop: false };
    readAlongSession.current = session;

    const activeCh = parsedChapters[activeParsedChapter];
    const paras = activeCh?.pages[activeParsedPage] || [];
    if (!paras.length) return;

    const speakFrom = (idx: number, charOffset = 0) => {
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
      const utterance = new SpeechSynthesisUtterance(text.slice(charOffset));
      utterance.rate = narrationRate;
      const voice = pickNarrationVoice();
      if (voice) utterance.voice = voice;
      const wordAt = (char: number) => {
        const before = text.slice(0, char).trim();
        return before ? before.split(/\s+/).length : 0;
      };
      utterance.onboundary = (e: SpeechSynthesisEvent) => {
        if (session.stop) return;
        const char = charOffset + e.charIndex;
        readAlongCharRef.current = { para: idx, char };
        setReadAlongPos({ para: idx, word: wordAt(char) });
      };
      utterance.onend = () => { if (!session.stop) speakFrom(idx + 1); };
      utterance.onerror = () => { if (!session.stop) speakFrom(idx + 1); };
      readAlongCharRef.current = { para: idx, char: charOffset };
      setReadAlongPos({ para: idx, word: wordAt(charOffset) });
      window.speechSynthesis.speak(utterance);
    };
    speakFrom(Math.min(startPara, paras.length - 1), startChar);
  }, [parsedChapters, activeParsedChapter, activeParsedPage, narrationRate, nextPage]);

  const resumeReadAlong = useCallback(() => {
    const { para, char } = readAlongCharRef.current;
    startReadAlong(para, char);
  }, [startReadAlong]);

  // Continue narration on the new page after an automatic page turn
  useEffect(() => {
    if (readAlongAutoNext) {
      setReadAlongAutoNext(false);
      startReadAlong(0);
    } else if (readAlongPaused) {
      // A paused position belongs to the old page
      stopReadAlong();
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
    isEpubReader
      ? b.epubCfi === epubLocation
      : b.chapterIndex === currentChapterIndex && b.pageIndex === currentPageIndex
  );

  const toggleBookmark = () => {
    if (isCurrentPageBookmarked) {
      setBookmarks(prev => prev.filter(b =>
        isEpubReader
          ? b.epubCfi !== epubLocation
          : !(b.chapterIndex === currentChapterIndex && b.pageIndex === currentPageIndex)
      ));
    } else {
      const label = isEpubReader
        ? `${book.title} — ${epubProgress}%`
        : `${currentChapter?.title || `Chapter ${currentChapterIndex + 1}`} — Page ${currentPageIndex + 1}`;
      setBookmarks(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        chapterIndex: currentChapterIndex,
        pageIndex: currentPageIndex,
        epubCfi: isEpubReader ? (epubLocation || undefined) : undefined,
        epubProgress: isEpubReader ? epubProgress : undefined,
        label,
        createdAt: Date.now(),
      }]);
    }
  };

  const jumpToBookmark = (b: BookmarkEntry) => {
    if (isEpubReader && b.epubCfi) {
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
      const pageRef = isEpubReader
        ? `epub:${epubProgress}`
        : `chapter:${currentChapterIndex}:page:${currentPageIndex}`;
      const deepLink = buildShareUrl('book', book.id, { ref: pageRef });
      const caption = shareCaption.trim() ||
        `📖 Reading "${book.title}"${currentChapter?.title ? ` — ${currentChapter.title}` : ''}${!isEpubReader ? ` — Page ${currentPageIndex + 1}` : ` at ${epubProgress}%`}`;
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

  const toggleReadAlong = async () => {
    if (activePartyId) {
      // Leave / end the current read-along.
      if (party.isHost) party.end();
      setActivePartyId(null);
      return;
    }
    // Host a new read-along from the current position, then share the join link.
    try {
      const id = await createParty({
        kind: 'READ',
        content: { type: 'BOOK', id: book.id, title: book.title, thumbnail: book.coverImage },
        initial: {
          currentPage: currentPageIndex, chapterIndex: currentChapterIndex,
          ...(isEpub && epubLocation ? { cfi: epubLocation } : {}),
          ...(parsedChapters.length ? { parsedChapter: activeParsedChapter, parsedPage: activeParsedPage } : {}),
        },
      });
      setActivePartyId(id);
      const url = partyShareUrl(id);
      if (navigator.share) navigator.share({ title: `Read “${book.title}” along with me on Plajah`, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).catch(() => {});
    } catch (e) { console.error('start read-along failed', e); }
  };

  // HOST: broadcast the full reading position whenever it changes — native chapter+page, the EPUB
  // rendition CFI, and the parsed (PDF/DOCX/TXT) chapter+page. Skip turns we made to follow.
  useEffect(() => {
    if (!activePartyId || !party.isHost) return;
    if (followingRef.current) { followingRef.current = false; return; }
    party.broadcast({
      currentPage: currentPageIndex, chapterIndex: currentChapterIndex, contentId: book.id,
      ...(isEpub && epubLocation ? { cfi: epubLocation } : {}),
      ...(parsedChapters.length ? { parsedChapter: activeParsedChapter, parsedPage: activeParsedPage } : {}),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePartyId, party.isHost, currentPageIndex, currentChapterIndex, epubLocation, activeParsedChapter, activeParsedPage, isEpub, parsedChapters.length]);

  // FOLLOWER: go where the host is (unless reading on their own). EPUB → display the host's CFI via
  // the reader's controlled location; parsed docs → chapter+page; native books → chapter+page.
  useEffect(() => {
    if (!activePartyId || !party.isFollower || readOnOwn) return;
    const pb = party.playback;
    if (!pb) return;
    followingRef.current = true;
    if (isEpub && typeof pb.cfi === 'string' && pb.cfi && pb.cfi !== epubLocation) {
      // Followers get the same exit/enter turn as a reader who turned the page themselves (direction unknown: forward).
      const cfi = pb.cfi; turnEpub(1, () => setEpubLocation(cfi));
    }
    if (parsedChapters.length) {
      if (typeof pb.parsedChapter === 'number' && pb.parsedChapter !== activeParsedChapter && pb.parsedChapter < parsedChapters.length) setActiveParsedChapter(pb.parsedChapter);
      if (typeof pb.parsedPage === 'number' && pb.parsedPage !== activeParsedPage) setActiveParsedPage(pb.parsedPage);
    }
    if (typeof pb.chapterIndex === 'number' && pb.chapterIndex !== currentChapterIndex) setCurrentChapterIndex(pb.chapterIndex);
    if (typeof pb.currentPage === 'number' && pb.currentPage !== currentPageIndex) setCurrentPageIndex(pb.currentPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePartyId, party.isFollower, party.playback?.seq, readOnOwn, isEpub, parsedChapters.length]);

  // PartyBar ends the party for the host before calling this.
  const leaveReadAlongParty = useCallback(() => { setActivePartyId(null); }, []);

  // Discarding the generated audio unmounts its <audio>, which fires no events
  useEffect(() => {
    if (!aiNarrationUrl) { setIsAiPlaying(false); setAiNarrationActive(false); }
  }, [aiNarrationUrl]);

  const stopAiNarration = () => {
    const a = aiAudioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setIsAiPlaying(false);
    setAiNarrationActive(false);
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
    readingTheme === 'VIOLET' ? 'bg-[#0e0b16] bg-[radial-gradient(ellipse_at_top_left,rgba(169,139,255,0.14),transparent_55%)] border border-[#2a2339]' :
                               'bg-[#1c1c1f] border border-white/5';
  const txtColor =
    readingTheme === 'SEPIA' ? 'text-[#4a3728]' :
    readingTheme === 'PAPER' ? 'text-[#1a1a1a]' :
    readingTheme === 'DARK'  ? 'text-[#c8c8c8]' :
    readingTheme === 'VIOLET' ? 'text-[#e6e0f5]' :
                               'text-white/85';
  const txtHdColor =
    readingTheme === 'SEPIA' ? 'text-[#7a4f2b]' :
    readingTheme === 'PAPER' ? 'text-black' :
    readingTheme === 'VIOLET' ? 'text-[#a98bff]' :
                               'text-small-orange';
  const txtFontFamily =
    fontFamily === 'serif' ? 'font-serif' :
    fontFamily === 'mono'  ? 'font-mono'  : 'font-sans';

  /** Linear position of a parsed page: stable order across chapters, used to tell a turn from a jump. */
  const parsedOrder = (ch: number, pg: number) => { let n = 0; for (let i = 0; i < ch && i < parsedChapters.length; i++) n += parsedChapters[i].pages.length; return n + pg; };
  const parsedNeighbor = (dir: 1 | -1): { ch: number; pg: number } | null => {
    const ch = parsedChapters[activeParsedChapter]; if (!ch) return null;
    if (dir === 1) {
      if (activeParsedPage < ch.pages.length - 1) return { ch: activeParsedChapter, pg: activeParsedPage + 1 };
      return activeParsedChapter < parsedChapters.length - 1 ? { ch: activeParsedChapter + 1, pg: 0 } : null;
    }
    if (activeParsedPage > 0) return { ch: activeParsedChapter, pg: activeParsedPage - 1 };
    if (activeParsedChapter > 0) return { ch: activeParsedChapter - 1, pg: Math.max(0, parsedChapters[activeParsedChapter - 1].pages.length - 1) };
    return null;
  };

  // One parsed page as a card. Used for the live page AND, by PageTurn, for the neighbouring page while a turn plays or is dragged.
  const renderParsedCard = (chIdx: number, pgIdx: number, live: boolean) => {
    const activeCh = parsedChapters[chIdx] || parsedChapters[0];
    const activePg = activeCh.pages[pgIdx] || activeCh.pages[0] || [];
    const rawChTitle = parsedChapters.length > 1 ? activeCh.title : (currentChapter?.title || activeCh.title);
    const chTitle = !rawChTitle || /^complete\s+work$/i.test(rawChTitle.trim())
      ? `Chapter ${chIdx + 1}`
      : cleanGutenbergMarkup(rawChTitle);

    const innerContent = (
      <>
        {book.coverImage && chIdx === 0 && pgIdx === 0 && !activeClassicTheme && (
          <div className="relative h-32 sm:h-40 overflow-hidden rounded-t-2xl sm:rounded-t-3xl">
            <img src={book.coverImage} alt="" className="w-full h-full object-cover scale-110" style={{ filter: 'blur(24px) brightness(0.5) saturate(1.3)' }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
            <div className="absolute inset-0 flex items-end p-5 sm:p-8">
              <h3 className="text-lg sm:text-2xl font-black uppercase tracking-widest text-white drop-shadow-2xl line-clamp-2">{chTitle}</h3>
            </div>
          </div>
        )}
        <div className="p-4 sm:p-10 lg:p-12 xl:p-16">
          {pageStyle === 'FOLIO' ? (
            <BookFolioBody
              paras={activePg}
              chapterTitle={chTitle}
              bookTitle={book.title}
              author={book.artist || undefined}
              chapterNo={chIdx + 1}
              pageNo={pgIdx + 1}
              pageCount={activeCh.pages.length || 1}
              chapterStart={pgIdx === 0}
              titleShownElsewhere={!!book.coverImage && chIdx === 0 && pgIdx === 0 && !activeClassicTheme}
              readingTheme={readingTheme}
              fontFamily={fontFamily}
              fontSizePct={Math.round(fontSize * modeScale)}
              doubleColumn={viewMode === 'DOUBLE'}
              readAlong={live ? readAlongPos : null}
              wordRef={live ? readAlongWordRef : undefined}
              onReadFrom={startReadAlong}
              figures={live && folioActive ? folioExtras.figures : undefined}
              loadScan={folioActive && folioDoc?.scan ? () => folioDoc.scan!(chIdx, pgIdx) : undefined}
              easy={easyRead}
              calm={calmRead}
              seed={book.id}
              classicTheme={activeClassicTheme}
            />
          ) : (<>
          {!(book.coverImage && chIdx === 0 && pgIdx === 0 && !activeClassicTheme) && (
            <h3
              className={`text-xl sm:text-2xl font-black uppercase tracking-tight mb-6 sm:mb-8 text-center ${txtHdColor}`}
              style={activeClassicTheme ? { color: activeClassicTheme.palette.heading } : undefined}
            >
              {chTitle}
            </h3>
          )}
          <div
            className={`${txtFontFamily} text-base sm:text-lg ${modeLeading} ${txtColor} space-y-0 ${viewMode === 'DOUBLE' ? 'columns-1 md:columns-2 gap-10 lg:gap-14 [column-rule:1px_solid_rgba(255,255,255,0.06)]' : ''}`}
            style={{
              fontSize: `${Math.round(fontSize * modeScale)}%`,
              ...(activeClassicTheme ? { color: activeClassicTheme.palette.ink } : {}),
            }}
          >
            {activePg.map((rawPara, i) => {
              const para = cleanGutenbergMarkup(rawPara);
              return (
                <p key={i} className="mb-5">
                  {live && readAlongPos?.para === i
                    ? (() => {
                        let w = 0;
                        return para.split(/(\s+)/).map((tok, k) => {
                          if (!tok || /^\s+$/.test(tok)) return tok;
                          const idx = w++;
                          const isCurrent = idx === readAlongPos!.word;
                          return (
                            <span
                              key={k}
                              ref={isCurrent && live ? readAlongWordRef : undefined}
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
              );
            })}
          </div>
          </>)}
          {/* Page turn hint at bottom */}
          {(pgIdx < activeCh.pages.length - 1 || chIdx < parsedChapters.length - 1) && (
            <div className="mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-white/5 text-center">
              <button onClick={nextPage} className={`text-[9px] font-black uppercase tracking-[0.25em] ${s.subtext} hover:text-small-orange transition-colors`}>
                {pgIdx < activeCh.pages.length - 1
                  ? `Continue · Chapter ${chIdx + 1} · Page ${pgIdx + 2} →`
                  : `Next · Chapter ${chIdx + 2} · Page 1 →`}
              </button>
            </div>
          )}
        </div>
      </>
    );

    if (activeClassicTheme) {
      return (
        <ClassicPageFlourishFrame
          theme={activeClassicTheme}
          motionState={flourishMotionState}
          pageKey={`${chIdx}:${pgIdx}`}
        >
          {innerContent}
        </ClassicPageFlourishFrame>
      );
    }

    return (
      <div className={`${txtCardBg} shadow-2xl rounded-2xl sm:rounded-3xl overflow-y-auto w-full h-full ${s.scrollbar}`}>
        {innerContent}
      </div>
    );
  };

  // Portal to <body> so `fixed inset-0` is viewport-relative — the app's SpatialUIRoot
  // wrapper is transformed, which would otherwise confine this fixed reader to a small
  // box instead of filling the whole screen.
  const readerTree = (
    <>
    {/* Reader always mounted so content loads in background during opening scene */}
    <div
      className={`${isFullscreen ? 'fixed inset-0 z-[160] bg-black' : 'absolute inset-0'} ${s.bg} flex flex-col overflow-hidden select-none transition-colors duration-500`}
      style={{ opacity: showOpeningScene ? 0 : 1, pointerEvents: showOpeningScene ? 'none' : undefined, transition: 'opacity 0.7s ease', ...(isFullscreen ? {} : { transform: 'translateZ(0)' }) }}
    >
      {/* Opaque base — the immersive reader must fully cover the app chrome (nav + ad
          pillars + bottom tab bar). Several reader themes use a transparent/glass bg,
          which let the sidebars bleed through; this solid layer sits behind the glass. */}
      <div className="absolute inset-0 -z-10 bg-[#08080c]" aria-hidden="true" />
      {currentChapter?.audioUrl && (
        <audio ref={audioRef} src={currentChapter.audioUrl} onEnded={() => setIsNarrating(false)} />
      )}
      
      {/* Top Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.header 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`absolute top-2 inset-x-2 sm:top-3.5 sm:inset-x-5 z-50 ${s.header} rounded-2xl border shadow-2xl px-2.5 sm:px-4 lg:px-5 py-1.5 sm:py-2 flex items-center justify-between gap-2 sm:gap-3 backdrop-blur-2xl transition-colors duration-500 overflow-hidden`}
          >
            {/* Left cluster: Navigation + Title + Spelled-Out Chapter & Page */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 overflow-hidden">
              <button
                onClick={() => { setShowTOC(!showTOC); setShowComments(false); setShowNotes(false); setShowSettings(false); setShowBookmarks(false); }}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${showTOC ? s.activeBtn : s.btnHover}`}
                title="Table of Contents"
                aria-label="Table of Contents"
              >
                <List size={19} className="shrink-0" />
              </button>
              <button
                onClick={onBack}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${s.btnHover}`}
                title="Back to Library"
                aria-label="Back to Library"
              >
                <ChevronLeft size={21} className="shrink-0" />
              </button>
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 className="text-[11px] sm:text-xs lg:text-sm font-black uppercase tracking-wider truncate">{book.title}</h2>
                <p className={`text-[9px] sm:text-[10px] font-black tracking-[0.12em] sm:tracking-[0.18em] truncate ${theme === 'LIGHT' ? 'text-[#FF8C00]' : 'text-small-orange'}`}>
                  {isEpubReader
                    ? `Reading · ${epubProgress}%`
                    : parsedChapters.length > 0
                      ? `Chapter ${activeParsedChapter + 1} · Page ${activeParsedPage + 1} of ${parsedChapters[activeParsedChapter]?.pages.length || 1}`
                      : `Chapter ${currentChapterIndex + 1} · Page ${currentPageIndex + 1} of ${pages.length || 1}`}
                </p>
              </div>
              {book.ownerId && (
                <div className="hidden 2xl:block shrink-0">
                  <PlajahPlusButton
                    creatorId={book.ownerId}
                    creatorName={book.artist || book.title}
                    isOwnProfile={book.ownerId === currentUser?.uid}
                  />
                </div>
              )}
            </div>

            {/* Right cluster: Unique icon actions & adaptive pills — never wraps or overlaps */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 overflow-x-auto no-scrollbar max-w-[62%] sm:max-w-[68%] lg:max-w-none">
              <button
                onClick={handleSaveBook}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${isSaved ? 'text-green-500' : s.btnHover} ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
                title={isSaved ? "Saved to Library" : "Save Book to Library"}
                aria-label={isSaved ? "Saved to Library" : "Save Book to Library"}
              >
                {isSaving ? <Loader2 size={18} className="animate-spin shrink-0" /> : <Library size={18} className="shrink-0" />}
              </button>

              {isPaidBook && (
                <button
                  onClick={() => openSponsor({ book: { id: book.id, title: book.title, price: book.price, ownerId: book.ownerId, coverImage: book.coverImage, artist: book.artist } })}
                  className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${s.btnHover}`}
                  title={isBookOwner ? 'Give away copies' : 'Gift this book'}
                  aria-label={isBookOwner ? 'Give away copies' : 'Gift this book'}
                >
                  <Gift size={18} className="shrink-0" />
                </button>
              )}

              <button
                onClick={toggleBookmark}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${isCurrentPageBookmarked ? 'text-[#D0BCFF]' : s.btnHover}`}
                title={isCurrentPageBookmarked ? "Remove Page Bookmark" : "Bookmark This Page"}
                aria-label={isCurrentPageBookmarked ? "Remove Page Bookmark" : "Bookmark This Page"}
              >
                <Bookmark size={18} className={`shrink-0 ${isCurrentPageBookmarked ? 'fill-[#D0BCFF]' : ''}`} />
              </button>

              <button
                onClick={() => { setShowBookmarks(!showBookmarks); setShowComments(false); setShowNotes(false); setShowTOC(false); setShowSettings(false); }}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${showBookmarks ? s.activeBtn : s.btnHover}`}
                title="Saved Bookmarks List"
                aria-label="Saved Bookmarks List"
              >
                <BookMarked size={18} className="shrink-0" />
              </button>

              {/* Single/two-page view is for text books — shrink-0 flex-nowrap prevents vertical deformation */}
              {pages.length === 0 && (
                <div className="hidden lg:inline-flex shrink-0 flex-nowrap items-center bg-white/5 rounded-full p-0.5 border border-white/10">
                  <button 
                    onClick={() => setViewMode('SINGLE')}
                    className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all ${viewMode === 'SINGLE' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                    title="Single Page View"
                    aria-label="Single Page View"
                  >
                    <Square size={14} className="shrink-0" />
                  </button>
                  <button 
                    onClick={() => setViewMode('DOUBLE')}
                    className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all ${viewMode === 'DOUBLE' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                    title="Two-Column Spread View"
                    aria-label="Two-Column Spread View"
                  >
                    <Columns size={14} className="shrink-0" />
                  </button>
                </div>
              )}

              {/* Classic Cover-Matched Page Flourish Themes & 6-Track Literary Score Viewer button */}
              {pages.length === 0 && (
                <>
                  <button
                    onClick={() => {
                      setShowThemeViewer(v => !v);
                      setShowSettings(false);
                      setShowTOC(false);
                      setShowNotes(false);
                      setShowComments(false);
                      setShowBookmarks(false);
                    }}
                    className={`shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 xl:px-3.5 rounded-full transition-all text-[9px] font-black uppercase tracking-widest whitespace-nowrap overflow-hidden border ${
                      showThemeViewer
                        ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
                        : classicThemesEnabled && activeClassicTheme
                          ? 'bg-amber-400/15 text-amber-200 border-amber-400/40 hover:bg-amber-400/25'
                          : `${s.btnHover} border-white/10`
                    }`}
                    title="Page Flourish Themes & 6-Movement Full Orchestral Film Score (ACE-Step 2.5 + MPE)"
                    aria-label="Themes & Film Score"
                  >
                    <Palette size={15} className="shrink-0 text-amber-300" />
                    <span className="whitespace-nowrap">Themes &amp; Film Score</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${
                        classicThemesEnabled && activeClassicTheme
                          ? 'bg-emerald-500/30 text-emerald-200'
                          : 'bg-white/10 text-white/50'
                      }`}
                    >
                      {classicThemesEnabled && activeClassicTheme ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <button
                    onClick={() => launchClassicBookInChoraDaw(activeClassicTheme?.id || 'pride-and-prejudice', 0)}
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 xl:px-3 rounded-full transition-all text-[9px] font-black uppercase tracking-widest whitespace-nowrap overflow-hidden border bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-400/45 shadow-[0_0_14px_rgba(0,218,243,0.2)]"
                    title="Open this book's 6-Song Hybrid Orchestral + MPE Film Score Showcase Project directly in Chora Studio DAW"
                    aria-label="Open in Chora DAW"
                  >
                    <Sparkles size={14} className="shrink-0 text-cyan-300" />
                    <span className="whitespace-nowrap">★ Chora DAW</span>
                  </button>
                </>
              )}

              {/* MAI Voice 2 Narration button: collapses cleanly into unique Headphones icon on tight viewports */}
              {pages.length === 0 && (
                <button
                  onClick={() => setShowNarrationPanel(n => !n)}
                  className={`shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 xl:px-3.5 rounded-full transition-all text-[9px] font-black uppercase tracking-widest whitespace-nowrap overflow-hidden ${showNarrationPanel ? s.activeBtn : s.btnHover}`}
                  title="AI Narration — MAI Voice 2"
                  aria-label="AI Narration — MAI Voice 2"
                >
                  <Headphones size={16} className="shrink-0" />
                  <span className="hidden xl:inline whitespace-nowrap">AI Voice</span>
                </button>
              )}

              {/* Audiobook Exhibition Pavilion button: collapses cleanly into unique Sparkles icon on tight viewports */}
              <button
                onClick={() => {
                  const enrichedBook: Album = {
                    ...book,
                    bookChapters: (book.bookChapters || []).map((ch, idx) => ({
                      ...ch,
                      content: idx === currentChapterIndex ? (ch.content || chapterContent) : ch.content
                    }))
                  };
                  window.dispatchEvent(new CustomEvent('OPEN_AUDIOBOOK_PAVILION', {
                    detail: { book: enrichedBook, chapterIndex: currentChapterIndex }
                  }));
                }}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 xl:px-3.5 rounded-full transition-all text-[9px] font-black uppercase tracking-widest whitespace-nowrap overflow-hidden bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white hover:scale-105 shadow-[0_0_15px_rgba(212,0,85,0.4)]"
                title="Listen in the Audiobook Exhibition Pavilion"
                aria-label="Listen in the Audiobook Exhibition Pavilion"
              >
                <Sparkles size={14} className="text-amber-300 animate-pulse shrink-0" />
                <span className="hidden xl:inline whitespace-nowrap">Pavilion</span>
              </button>

              {/* Author: Record Audiobook */}
              {onOpenAudioStudio && book.ownerId === currentUser?.uid && (
                <button
                  onClick={onOpenAudioStudio}
                  className={`shrink-0 inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 xl:px-3.5 rounded-full transition-all text-[9px] font-black uppercase tracking-widest whitespace-nowrap overflow-hidden ${s.btnHover}`}
                  title="Record Audiobook — MAI Transcribe 1.5"
                  aria-label="Record Audiobook"
                >
                  <Mic size={16} className="shrink-0" />
                  <span className="hidden xl:inline whitespace-nowrap">Record</span>
                </button>
              )}

              {/* Original author audio (if available) */}
              {currentChapter?.audioUrl && (
                <button
                  onClick={toggleNarration}
                  className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${isNarrating ? s.activeBtn : s.btnHover}`}
                  title="Author's Narration"
                  aria-label="Author's Narration"
                >
                  {isNarrating ? <Pause size={18} className="shrink-0" /> : <Volume2 size={18} className="shrink-0" />}
                </button>
              )}
              <button 
                onClick={toggleReadAlong}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${isReadAlongActive ? 'bg-blue-500 text-white shadow-lg' : s.btnHover}`}
                title="Read Along (Book Club)"
                aria-label="Read Along (Book Club)"
              >
                <Users size={18} className="shrink-0" />
              </button>
              
              {currentChapter?.url && (!isPaidBook || isBookOwner || bookOwnership.license?.delivery !== 'PLAJAH_ONLY') && (
                <button
                  onClick={() => window.open(currentChapter.url, '_blank')}
                  className={`hidden sm:flex shrink-0 w-9 h-9 sm:w-10 sm:h-10 items-center justify-center rounded-full transition-all ${s.btnHover}`}
                  title="Download Book"
                  aria-label="Download Book"
                >
                  <Download size={18} className="shrink-0" />
                </button>
              )}

              {(book.allowPageSharing !== false || isBookOwner) && (
                <ShareButton
                  title={book.title}
                  artist={book.artist || (book as any).author || 'Lorea Author'}
                  text={`📖 Reading "${book.title}" on Lorea Literary Press`}
                  url={buildShareUrl('book', book.id, { ref: isEpubReader ? `epub:${epubProgress}` : `chapter:${currentChapterIndex}:page:${currentPageIndex}` })}
                  imageUrl={book.coverImage}
                  contentType="book"
                  ctaText="📖 READ CHAPTER ON LOREA"
                  className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${s.btnHover}`}
                  plajahLabel="Post page to feed"
                  onPostToPlajah={handleSharePage}
                >
                  <Share2 size={18} className="shrink-0" />
                </ShareButton>
              )}

              {isBookOwner && (
                <button
                  onClick={() => setShowPromoModal(true)}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3.5 h-9 sm:h-10 rounded-full bg-[#A855F7]/20 hover:bg-[#A855F7]/30 border border-[#A855F7]/40 text-purple-200 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(168,85,247,0.25)]"
                  title="Promote Project — Auto-Promo Cards, Built Promotions & Assets"
                  aria-label="Promote Project"
                >
                  <Megaphone size={14} className="shrink-0" />
                  <span>Promote</span>
                </button>
              )}

              <button
                onClick={() => { setShowSettings(!showSettings); setShowComments(false); setShowNotes(false); setShowTOC(false); setShowBookmarks(false); }}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${showSettings ? s.activeBtn : s.btnHover}`}
                title="Reading Settings"
                aria-label="Reading Settings"
              >
                <Settings size={18} className="shrink-0" />
              </button>

              <button 
                onClick={() => { setShowNotes(!showNotes); setShowComments(false); setShowTOC(false); setShowSettings(false); setShowBookmarks(false); }}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${showNotes ? s.activeBtn : s.btnHover}`}
                title="Notes"
                aria-label="Notes"
              >
                <Edit3 size={18} className="shrink-0" />
              </button>
              <button 
                onClick={() => { setShowComments(!showComments); setShowNotes(false); setShowTOC(false); setShowSettings(false); setShowBookmarks(false); }}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all ${showComments ? s.activeBtn : s.btnHover}`}
                title="Reader Discussion"
                aria-label="Reader Discussion"
              >
                <MessageSquare size={18} className="shrink-0" />
              </button>
              
              <div className={`hidden xl:inline-flex shrink-0 flex-nowrap items-center ${theme === 'LIGHT' ? 'bg-black/5' : 'bg-white/5'} rounded-full p-0.5 border ${theme === 'LIGHT' ? 'border-black/10' : 'border-white/10'}`}>
                <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all ${s.btnHover}`} title="Zoom Out"><ZoomOut size={15} className="shrink-0" /></button>
                <span className={`text-[10px] font-black w-11 text-center shrink-0 whitespace-nowrap ${s.subtext}`}>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(3, zoom + 0.1))} className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all ${s.btnHover}`} title="Zoom In"><ZoomIn size={15} className="shrink-0" /></button>
              </div>

              {/* Layout: contained (default, between the pillars) ⇄ immersive full-bleed */}
              <button onClick={() => setIsFullscreen(f => !f)} className={`hidden sm:flex shrink-0 w-9 h-9 sm:w-10 sm:h-10 items-center justify-center rounded-full transition-all ${isFullscreen ? s.activeBtn : s.btnHover}`} title={isFullscreen ? 'Fit reader to page' : 'Immersive full-screen'}>
                <Monitor size={18} className="shrink-0" />
              </button>
              <button onClick={toggleFullScreen} className={`hidden sm:flex shrink-0 w-9 h-9 sm:w-10 sm:h-10 items-center justify-center rounded-full transition-all ${s.btnHover}`} title="Browser full-screen">
                {isFullScreen ? <Minimize2 size={18} className="shrink-0" /> : <Maximize2 size={18} className="shrink-0" />}
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Reader Area — Full Bleed Content First */}
      <div className="flex-1 flex overflow-hidden w-full h-full relative">
        <div 
          ref={readerGestureRef}
          className={`flex-1 relative flex items-center justify-center overflow-auto p-2 sm:p-4 lg:p-6 pt-20 pb-20 sm:pt-24 sm:pb-24 lg:pt-24 lg:pb-24 no-scrollbar transition-all duration-500 ${(showComments || showNotes || showTOC || showSettings) ? 'lg:mr-[400px]' : ''}`}
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
            ) : isLoadingContent && parsedChapters.length === 0 ? (
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
            ) : folioBuilding !== null ? (
              <div className="flex flex-col items-center gap-6">
                <Loader2 className="animate-spin text-small-orange" size={48} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Setting the pages{folioBuilding > 0 ? ` · ${folioBuilding}%` : ''}</p>
              </div>
            ) : isEpubReader && epubData ? (
              <div 
                ref={epubShellRef}
                className={`w-full h-full max-w-6xl xl:max-w-7xl rounded-2xl shadow-2xl relative ${readingTheme === 'SEPIA' ? 'bg-[#f4ecd8]' : readingTheme === 'PAPER' ? 'bg-[#fdfdfd]' : readingTheme === 'DARK' ? 'bg-[#111]' : readingTheme === 'VIOLET' ? 'bg-[#0e0b16]' : (theme === 'LIGHT' ? 'bg-white' : 'bg-[#1a1a1a]')}`}
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
            ) : isPdfReader ? (
              <div 
                className={`w-full h-full max-w-6xl xl:max-w-7xl rounded-2xl shadow-2xl relative overflow-y-auto no-scrollbar flex flex-col items-center p-3 lg:p-6 ${theme === 'LIGHT' ? 'bg-white' : 'bg-[#1a1a1a]'}`}
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
              <div className="w-full h-full max-w-7xl">
                <ComicReader
                  pages={pages}
                  index={currentPageIndex}
                  onIndexChange={setCurrentPageIndex}
                  readingDir={(book as any).readingDir === 'rtl' ? 'rtl' : 'ltr'}
                  title={book.title}
                  pageTurnAuthor={pageTurnAuthor}
                  livePage={livingBook?.livePage}
                  liveBar={livingBook?.bar}
                  hideScrubber
                />
              </div>
            ) : isLoadingContent ? (
              <div className="flex flex-col items-center gap-6">
                <Loader2 className="animate-spin text-small-orange" size={48} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Decrypting neural transcript...</p>
              </div>
            ) : parsedChapters.length > 0 ? (
              <PageTurn
                pageKey={`${activeParsedChapter}:${activeParsedPage}`}
                order={parsedOrder(activeParsedChapter, activeParsedPage)}
                turn={pageTurn.turn}
                rtl={readerRtl}
                renderNeighbor={(dir) => { const n = parsedNeighbor(dir); return n ? renderParsedCard(n.ch, n.pg, false) : null; }}
                canTurn={(dir) => !pageLocked && !!parsedNeighbor(dir)}
                onTurn={(dir) => (dir === 1 ? nextPage() : prevPage())}
                gestureRef={readerGestureRef}
                sound={pageTurn.soundOn}
                paper={pageTurnPaper}
                radius="1.5rem"
                className={`${modeMaxW} w-full h-full max-h-[92vh]`}
              >
                {renderParsedCard(activeParsedChapter, activeParsedPage, true)}
              </PageTurn>
            ) : (
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
          {/* On a living page the side zones must not swallow touches: the page's own drag/tap targets live there. Only the arrow buttons turn the page. */}
          <div className={`absolute inset-y-0 left-0 w-1/4 cursor-w-resize group ${livingPicture ? 'pointer-events-none' : ''}`} onClick={(e) => { e.stopPropagation(); (dirForTapSide('left', readerRtl) === 1 ? nextPage : prevPage)(); }}>
            {!sideArrowHidden('left') && (
              <div className={`absolute left-3 top-1/2 -translate-y-1/2 ${livingPicture ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`} onClick={livingPicture ? (e) => { e.stopPropagation(); (dirForTapSide('left', readerRtl) === 1 ? nextPage : prevPage)(); } : undefined}>
                <span className="pj-side-arrow flex h-14 w-14 max-sm:h-10 max-sm:w-10 items-center justify-center rounded-full text-white shadow-xl ring-1 ring-white/25 opacity-80 max-sm:opacity-65 group-hover:opacity-100 group-hover:scale-110 transition" style={{ background: 'var(--pj-grad-warm)' }}>
                  <ChevronLeft size={34} strokeWidth={3} />
                </span>
              </div>
            )}
          </div>
          <div className={`absolute inset-y-0 right-0 w-1/4 cursor-e-resize group ${livingPicture ? 'pointer-events-none' : ''}`} onClick={(e) => { e.stopPropagation(); (dirForTapSide('right', readerRtl) === 1 ? nextPage : prevPage)(); }}>
            {!sideArrowHidden('right') && (
              <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${livingPicture ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`} onClick={livingPicture ? (e) => { e.stopPropagation(); (dirForTapSide('right', readerRtl) === 1 ? nextPage : prevPage)(); } : undefined}>
                <span className="pj-side-arrow flex h-14 w-14 max-sm:h-10 max-sm:w-10 items-center justify-center rounded-full text-white shadow-xl ring-1 ring-white/25 opacity-80 max-sm:opacity-65 group-hover:opacity-100 group-hover:scale-110 transition" style={{ background: 'var(--pj-grad-warm)' }}>
                  <ChevronRight size={34} strokeWidth={3} />
                </span>
              </div>
            )}
          </div>
        </div>

        {/* TOC Sidebar */}
        <AnimatePresence>
          {showTOC && (
            <motion.aside 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className={`fixed inset-x-0 bottom-0 top-16 sm:top-0 sm:left-auto sm:right-0 sm:w-[400px] rounded-t-3xl sm:rounded-none ${s.sidebar} z-50 flex flex-col shadow-2xl border-t sm:border-t-0 sm:border-l border-white/10`}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-display font-black uppercase tracking-tight mb-1">Table of Contents</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Navigate your literary trajectory</p>
                </div>
                <button onClick={() => setShowTOC(false)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className={`flex-1 overflow-y-auto ${s.scrollbar} p-4`}>
                {isEpubReader ? (
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
                ) : pages.length > 0 ? (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-3">{pages.length} pages · tap a page to jump to it</p>
                    <div className="grid grid-cols-3 gap-3">
                      {pages.map((pg, i) => (
                        <button
                          key={pg.id || i}
                          onClick={() => { setCurrentPageIndex(i); setShowTOC(false); }}
                          aria-label={`Go to page ${i + 1}`}
                          aria-current={currentPageIndex === i ? 'page' : undefined}
                          className={`relative rounded-xl overflow-hidden border-2 transition-all ${currentPageIndex === i ? 'border-small-orange shadow-xl' : 'border-white/10 hover:border-white/40'}`}
                        >
                          <img src={pg.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full aspect-[4/3] object-cover bg-black/20" />
                          <span className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-black ${currentPageIndex === i ? 'bg-small-orange text-white' : 'bg-black/70 text-white'}`}>{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : parsedChapters.length > 0 ? (
                  <div className="space-y-2.5">
                    {parsedChapters.map((chap, i) => {
                      const isActiveChap = activeParsedChapter === i;
                      return (
                        <div key={i} className={`rounded-2xl border transition-all ${isActiveChap ? 'border-small-orange/50 bg-white/[0.04]' : 'border-white/5 hover:border-white/15'}`}>
                          <button
                            onClick={() => { setActiveParsedChapter(i); setActiveParsedPage(0); if (chap.pages.length <= 1) setShowTOC(false); }}
                            className={`w-full flex items-center gap-4 p-3.5 rounded-2xl group transition-all ${isActiveChap ? 'bg-small-orange shadow-xl' : 'hover:bg-white/5'}`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black ${isActiveChap ? 'bg-white text-small-orange' : 'bg-white/10'}`}>
                              {i + 1}
                            </div>
                            <div className="text-left overflow-hidden flex-1">
                              <p className={`text-xs font-bold truncate ${isActiveChap ? 'text-white' : 'text-white/80'}`}>{chap.title}</p>
                              <p className={`text-[8px] font-black uppercase tracking-widest opacity-60 ${isActiveChap ? 'text-white/80' : ''}`}>
                                {chap.pages.length} {chap.pages.length === 1 ? 'page' : 'pages'}
                              </p>
                            </div>
                          </button>
                          {chap.pages.length > 1 && (
                            <div className="px-3.5 pb-3 pt-2 flex flex-wrap gap-1.5">
                              {chap.pages.map((_, pIdx) => {
                                const isCurrentPage = isActiveChap && activeParsedPage === pIdx;
                                return (
                                  <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => {
                                      setActiveParsedChapter(i);
                                      setActiveParsedPage(pIdx);
                                      setShowTOC(false);
                                    }}
                                    className={`min-w-[28px] h-7 px-2 rounded-lg text-[10px] font-black transition-all ${
                                      isCurrentPage
                                        ? 'bg-small-orange text-white shadow-md scale-105'
                                        : 'bg-white/10 hover:bg-white/20 text-white/75'
                                    }`}
                                    title={`Jump to ${chap.title} — Page ${pIdx + 1}`}
                                  >
                                    {pIdx + 1}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
              className={`fixed inset-x-0 bottom-0 top-16 sm:top-0 sm:left-auto sm:right-0 sm:w-[400px] rounded-t-3xl sm:rounded-none ${s.sidebar} z-50 flex flex-col shadow-2xl border-t sm:border-t-0 sm:border-l border-white/10`}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-display font-black uppercase tracking-tight mb-1">Bookmarks</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-40">
                    {bookmarks.length} saved {bookmarks.length === 1 ? 'place' : 'places'}
                  </p>
                </div>
                <button onClick={() => setShowBookmarks(false)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <X size={18} />
                </button>
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
              className={`fixed inset-x-0 bottom-0 top-16 sm:top-0 sm:left-auto sm:right-0 sm:w-[400px] rounded-t-3xl sm:rounded-none ${s.sidebar} z-50 flex flex-col p-4 lg:p-8 overflow-y-auto ${s.scrollbar} shadow-2xl border-t sm:border-t-0 sm:border-l border-white/10`}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-display font-black uppercase tracking-tight">Reading Settings</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
              
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

                {/* Page animation */}
                <PageTurnSettings pref={pageTurn.prefs.animation} onPref={pageTurn.setAnimation} sound={pageTurn.prefs.sound} onSound={pageTurn.setSound}
                  resolved={pageTurn.turn} reducedMotion={pageTurn.reducedMotion} cardClass={s.card} activeClass={s.activeBtn} />

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

                {/* Page style — Folio book page or the original card (plain-text books) */}
                <section>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Page Style</label>
                  <div className="grid grid-cols-2 gap-3">
                    {([['FOLIO', 'Folio'], ['CLASSIC', 'Classic']] as const).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setPageStyle(id)}
                        className={`py-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${pageStyle === id ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {pageStyle === 'FOLIO' && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <button
                        onClick={() => setEasyRead(!easyRead)}
                        aria-pressed={easyRead}
                        className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${easyRead ? 'bg-white text-black border-white' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                      >
                        Easier to read
                      </button>
                      <button
                        onClick={() => setCalmRead(!calmRead)}
                        aria-pressed={calmRead}
                        className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${calmRead ? 'bg-white text-black border-white' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                      >
                        Calm
                      </button>
                    </div>
                  )}
                </section>

                {/* Display Mode — device-class scaling (phone / desk / 10-foot TV) */}
                <section>
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 block">Display Mode</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                    <button 
                      onClick={() => setReadingTheme('VIOLET')}
                      className={`col-span-2 flex items-center gap-3 p-4 rounded-xl border transition-all ${readingTheme === 'VIOLET' ? 'bg-[#0e0b16] text-[#e6e0f5] border-[#a98bff]' : 'bg-white/5 border-white/10'}`}
                    >
                      <Sparkles size={16} className="text-[#a98bff]" /> <span className="text-[10px] font-black uppercase tracking-widest">Violet</span>
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
              className={`fixed inset-x-0 bottom-0 top-16 sm:top-0 sm:left-auto sm:right-0 sm:w-[400px] rounded-t-3xl sm:rounded-none ${s.sidebar} z-50 flex flex-col shadow-2xl border-t sm:border-t-0 sm:border-l border-white/10`}
            >
              <div className="p-3 border-b border-white/10 flex justify-end">
                <button onClick={() => setShowComments(false)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
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
              className={`fixed inset-x-0 bottom-0 top-16 sm:top-0 sm:left-auto sm:right-0 sm:w-[400px] rounded-t-3xl sm:rounded-none ${s.sidebar} z-50 flex flex-col shadow-2xl border-t sm:border-t-0 sm:border-l border-white/10`}
            >
              <div className={`p-5 border-b ${theme === 'LIGHT' ? 'border-black/5' : 'border-white/5'} flex items-center gap-2`}>
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
                <button onClick={() => setShowNotes(false)} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <X size={18} />
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

        {/* Hidden AI audio element — lives outside the panel so closing the
            panel doesn't cut the narrator off mid-sentence */}
        {aiNarrationUrl && (
          <audio ref={aiAudioRef} src={aiNarrationUrl}
            onEnded={() => { setIsAiPlaying(false); setAiNarrationActive(false); }}
            onPlay={() => { setIsAiPlaying(true); setAiNarrationActive(true); }}
            onPause={() => setIsAiPlaying(false)}
          />
        )}

        {/* Mini narrator transport while the panel is closed */}
        <AnimatePresence>
          {!showNarrationPanel && (readAlongPos || aiNarrationActive) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed left-1/2 -translate-x-1/2 z-[150] flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-black/85 backdrop-blur-xl border border-white/10 shadow-2xl"
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
            >
              <button
                onClick={() => setShowNarrationPanel(true)}
                className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white pr-1"
                title="Open narration panel"
              >
                <Headphones size={12} className="text-purple-400" />
                {readAlongPos ? (readAlongPaused ? 'Read Along paused' : 'Reading along') : (isAiPlaying ? 'Narrating' : 'Narration paused')}
              </button>
              <button
                onClick={() => {
                  if (readAlongPos) { readAlongPaused ? resumeReadAlong() : pauseReadAlong(); return; }
                  const a = aiAudioRef.current;
                  if (a) { if (isAiPlaying) a.pause(); else a.play(); }
                }}
                className="w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-all"
                aria-label={(readAlongPos ? !readAlongPaused : isAiPlaying) ? 'Pause narration' : 'Resume narration'}
              >
                {(readAlongPos ? !readAlongPaused : isAiPlaying) ? <Pause size={13} /> : <Play size={13} fill="white" />}
              </button>
              <button
                onClick={() => { if (readAlongPos) stopReadAlong(); else stopAiNarration(); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                aria-label="Stop narration"
              >
                <Square size={11} fill="currentColor" />
              </button>
            </motion.div>
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
                    readAlongPos ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => (readAlongPaused ? resumeReadAlong() : pauseReadAlong())}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-orange-600 hover:bg-orange-500 text-white"
                          aria-label={readAlongPaused ? 'Resume Read Along' : 'Pause Read Along'}
                        >
                          {readAlongPaused ? (<><Play size={12} /> Resume</>) : (<><Pause size={12} /> Pause</>)}
                        </button>
                        <button
                          onClick={stopReadAlong}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
                          aria-label="Stop Read Along"
                        >
                          <Square size={11} fill="currentColor" /> Stop
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startReadAlong(0)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30"
                      >
                        <Play size={12} /> Start Read Along
                      </button>
                    )
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
                      <button
                        onClick={stopAiNarration}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                        aria-label="Stop narration"
                        title="Stop"
                      >
                        <Square size={13} fill="currentColor" />
                      </button>
                      <div className="flex-1">
                        <p className="text-[9px] font-black text-white/60">{MAI_VOICES.find(v => v.id === selectedNarrationVoice)?.name}</p>
                        <p className="text-[8px] text-white/30">{isAiPlaying ? 'Playing…' : aiNarrationActive ? 'Paused' : 'Ready to play'}</p>
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
                          {isEpubReader ? `${epubProgress}% through` : `${currentChapter?.title || `Chapter ${currentChapterIndex + 1}`} · Page ${currentPageIndex + 1}`}
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
                        {isEpubReader ? `${epubProgress}% through` : `${currentChapter?.title || `Chapter ${currentChapterIndex + 1}`} · Page ${currentPageIndex + 1}`}
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

        {/* Read-along — shared PartyBar (status, readers, chat, reactions, invite, remote). */}
        {isReadAlongActive && activePartyId && (
          <div className="fixed bottom-24 left-4 right-4 sm:right-auto sm:max-w-2xl z-50">
            <PartyBar
              partyId={activePartyId}
              party={party}
              verb={party.viewerCount === 1 ? 'reader' : 'readers'}
              noun="read-along"
              title={book.title}
              onLeave={leaveReadAlongParty}
              followerExtra={
                <button
                  onClick={() => { setReadOnOwn(v => !v); partyToast(readOnOwn ? `Back with ${party.party?.hostName || 'the host'}` : 'Reading on your own — tap again to rejoin', 'info'); }}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white"
                >
                  {readOnOwn ? 'Rejoin host' : 'Read on my own'}
                </button>
              }
            />
          </div>
        )}
      </div>

      {/* Bottom Progress Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.footer 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] sm:w-[90%] max-w-2xl ${s.footer} rounded-full border shadow-2xl px-3 sm:px-6 py-2 sm:py-2.5 flex items-center backdrop-blur-2xl transition-colors duration-500`}
          >
            {/* Interactive Page & Chapter Jumper Popover */}
            {showPageJumper && (parsedChapters.length > 0 || pages.length > 0 || (isPdfReader && (numPdfPages || 0) > 1)) && (
              <div className="absolute bottom-[calc(100%+10px)] right-2 sm:right-6 w-[min(92vw,360px)] rounded-3xl bg-[#110a1f]/95 border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl p-4 text-white z-50">
                <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-white/10">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-small-orange">Page Navigator</p>
                    <p className="text-xs font-bold text-white/90 truncate max-w-[230px]">
                      {parsedChapters.length > 0
                        ? parsedChapters[activeParsedChapter]?.title || `Chapter ${activeParsedChapter + 1}`
                        : currentChapter?.title || book.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPageJumper(false)}
                    className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white text-xs font-black"
                    aria-label="Close page jumper"
                  >
                    ✕
                  </button>
                </div>

                {parsedChapters.length > 0 ? (
                  <>
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/50">
                          Jump to Page in Chapter {activeParsedChapter + 1} ({parsedChapters[activeParsedChapter]?.pages.length || 1} pages)
                        </span>
                      </div>
                      <div className="max-h-36 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                        {(parsedChapters[activeParsedChapter]?.pages || []).map((_, pIdx) => {
                          const active = activeParsedPage === pIdx;
                          return (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => {
                                setActiveParsedPage(pIdx);
                                setShowPageJumper(false);
                              }}
                              className={`min-w-[32px] h-8 px-2.5 rounded-xl text-[11px] font-black transition-all ${
                                active
                                  ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow-lg scale-105'
                                  : 'bg-white/10 hover:bg-white/20 text-white/80'
                              }`}
                            >
                              {pIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {parsedChapters.length > 1 && (
                      <div className="pt-2.5 border-t border-white/10">
                        <span className="block text-[9px] font-black uppercase tracking-widest text-white/50 mb-1.5">
                          Switch Chapter ({parsedChapters.length})
                        </span>
                        <div className="max-h-28 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                          {parsedChapters.map((ch, cIdx) => {
                            const active = activeParsedChapter === cIdx;
                            return (
                              <button
                                key={cIdx}
                                type="button"
                                onClick={() => {
                                  setActiveParsedChapter(cIdx);
                                  setActiveParsedPage(0);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold truncate max-w-[155px] transition-all ${
                                  active
                                    ? 'bg-small-orange text-white'
                                    : 'bg-white/5 hover:bg-white/15 text-white/70'
                                }`}
                                title={`${ch.title} (${ch.pages.length} pages)`}
                              >
                                {cIdx + 1}. {ch.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : isPdfReader && (numPdfPages || 0) > 1 ? (
                  <div className="max-h-40 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                    {Array.from({ length: numPdfPages || 1 }, (_, pIdx) => {
                      const pageNum = pIdx + 1;
                      const active = pdfPageNumber === pageNum;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => {
                            setPdfPageNumber(pageNum);
                            setShowPageJumper(false);
                          }}
                          className={`min-w-[32px] h-8 px-2.5 rounded-xl text-[11px] font-black transition-all ${
                            active
                              ? 'bg-small-orange text-white shadow-lg'
                              : 'bg-white/10 hover:bg-white/20 text-white/80'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                    {pages.map((_, pIdx) => {
                      const active = currentPageIndex === pIdx;
                      return (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            setCurrentPageIndex(pIdx);
                            setShowPageJumper(false);
                          }}
                          className={`min-w-[32px] h-8 px-2.5 rounded-xl text-[11px] font-black transition-all ${
                            active
                              ? 'bg-small-orange text-white shadow-lg'
                              : 'bg-white/10 hover:bg-white/20 text-white/80'
                          }`}
                        >
                          {pIdx + 1}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 flex items-center gap-3 sm:gap-6">
              <div
                onClick={(e) => {
                  if (pageLocked) { lockedNudge(); return; }
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
                  if (parsedChapters.length > 0 && pages.length === 0) {
                    const total = parsedChapters.reduce((sum, c) => sum + c.pages.length, 0);
                    const targetGlobal = Math.min(total - 1, Math.floor(ratio * total));
                    let acc = 0;
                    for (let ci = 0; ci < parsedChapters.length; ci++) {
                      const len = parsedChapters[ci].pages.length;
                      if (targetGlobal < acc + len) {
                        setActiveParsedChapter(ci);
                        setActiveParsedPage(targetGlobal - acc);
                        break;
                      }
                      acc += len;
                    }
                  } else if (isPdfReader && numPdfPages) {
                    setPdfPageNumber(Math.max(1, Math.min(numPdfPages, Math.floor(ratio * numPdfPages) + 1)));
                  } else if (pages.length > 0) {
                    setCurrentPageIndex(Math.min(pages.length - 1, Math.floor(ratio * pages.length)));
                  }
                }}
                title="Click anywhere on the bar to jump to that page"
                className={`flex-1 h-2 ${s.progressBg} rounded-full overflow-hidden relative group/progress cursor-pointer`}
              >
                <div
                  className="h-full transition-all duration-200"
                  style={{ background: 'linear-gradient(90deg, var(--pj-purple), var(--pj-magenta) 55%, var(--pj-orange))', width: isEpubReader
                    ? `${epubProgress}%`
                    : isPdfReader && numPdfPages
                      ? `${((pdfPageNumber / Math.max(1, numPdfPages)) * 100).toFixed(1)}%`
                      : parsedChapters.length > 0
                        ? `${(((parsedOrder(activeParsedChapter, activeParsedPage) + 1) / Math.max(1, parsedChapters.reduce((s, c) => s + c.pages.length, 0))) * 100).toFixed(1)}%`
                        : `${(((currentChapterIndex * 100) + ((currentPageIndex + 1) / (pages.length || 1) * 100)) / (book.bookChapters?.length || 1))}%`
                  }}
                />
              </div>
              <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
                <button type="button" onClick={prevPage} className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all ${s.btnHover}`} aria-label="Previous page" title="Previous Page (Left Arrow)"><ChevronLeft size={18} className="shrink-0 sm:w-5 sm:h-5" /></button>
                <button
                  type="button"
                  onClick={() => {
                    if (isEpubReader) {
                      setShowTOC(v => !v);
                    } else {
                      setShowPageJumper(v => !v);
                    }
                  }}
                  title="Click to jump to any page or chapter"
                  className={`px-3 sm:px-4 py-1 sm:py-1.5 ${theme === 'LIGHT' ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/15'} border border-black/10 rounded-full shrink-0 transition-all cursor-pointer`}
                >
                  <span className={`text-[9px] sm:text-[10px] font-black tracking-wider ${s.text} whitespace-nowrap`}>
                    {isEpubReader
                      ? `Reading · ${epubProgress}%`
                      : isPdfReader && numPdfPages
                        ? `Page ${pdfPageNumber} of ${numPdfPages}`
                        : parsedChapters.length > 0
                          ? `Chapter ${activeParsedChapter + 1} · Page ${activeParsedPage + 1} of ${parsedChapters[activeParsedChapter]?.pages.length || 1}`
                          : isGraphicNovel
                            ? `Issue ${currentChapterIndex + 1} · Page ${currentPageIndex + 1} of ${pages.length || 1}`
                            : `Chapter ${currentChapterIndex + 1} · Page ${currentPageIndex + 1}${pages.length > 1 ? ` of ${pages.length}` : ''}`}
                  </span>
                </button>
                <button type="button" onClick={nextPage} className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all ${s.btnHover}`} aria-label="Next page" title="Next Page (Right Arrow)"><ChevronRight size={18} className="shrink-0 sm:w-5 sm:h-5" /></button>
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* Zen Monolith 1px Micro Scrubber for Fullscreen mode */}
      {isFullscreen && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5 z-30 pointer-events-none">
          <div
            className="h-full bg-gradient-to-r from-[#00DAF3] to-small-orange transition-all duration-300"
            style={{
              width: isEpubReader
                ? `${epubProgress}%`
                : parsedChapters.length > 0
                  ? `${(((parsedOrder(activeParsedChapter, activeParsedPage) + 1) / Math.max(1, parsedChapters.reduce((s, c) => s + c.pages.length, 0))) * 100).toFixed(1)}%`
                  : `${(((currentChapterIndex * 100) + ((currentPageIndex + 1) / (pages.length || 1) * 100)) / (book.bookChapters?.length || 1))}%`
            }}
          />
        </div>
      )}

      {/* Classic Cover-Matched Page Flourish Themes & 6-Track Literary Score Viewer Drawer */}
      <ClassicThemeViewerDrawer
        open={showThemeViewer}
        onClose={() => setShowThemeViewer(false)}
        themesEnabled={classicThemesEnabled}
        onToggleThemesEnabled={setClassicThemesEnabled}
        motionMode={flourishMotionMode}
        onChangeMotionMode={setFlourishMotionMode}
        motionState={flourishMotionState}
        onReplayMotion={triggerFlourishAwakening}
        activeTheme={activeClassicTheme || matchedBookTheme || CLASSIC_PAGE_THEMES[0]}
        selectedThemeOverride={selectedThemeOverride}
        onSelectThemeOverride={setSelectedThemeOverride}
        matchedBookTheme={matchedBookTheme}
      />
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
        isReady={parsedChapters.length > 0 || !!epubData || pages.length > 0}
      />
    )}

    {/* Unified Project Promote Studio & Asset Hub */}
    {showPromoModal && (
      <ChoraPromoModal
        album={{
          ...book,
          type: book.type || 'BOOK',
        }}
        onClose={() => setShowPromoModal(false)}
      />
    )}
    </>
  );
  // Paid-book gate: no license (and not the author) → purchase screen, not the pages.
  if (!hasBookAccess) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0A0A0A]/95 backdrop-blur-2xl p-6">
        <button onClick={onBack} className="absolute top-5 left-5 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors" title="Back">
          <ChevronLeft size={20} />
        </button>
        <div className="w-full max-w-md text-center">
          {book.coverImage && (
            <img src={book.coverImage} alt={book.title} className="w-40 h-60 object-cover rounded-2xl mx-auto shadow-2xl mb-6" />
          )}
          <h2 className="text-2xl font-black text-white leading-tight">{book.title}</h2>
          {book.artist && <p className="text-white/50 text-sm font-bold mt-1">by {book.artist}</p>}
          <p className="text-white/40 text-xs mt-4 leading-relaxed">
            Buy once and it's yours to keep — read it anywhere, with the author's corrections and updates included. Your ownership is recorded on Plajah's licence ledger.
          </p>
          <div className="mt-6 flex justify-center">
            <BuyToOwn
              kind="book"
              contentId={book.id}
              creatorUid={book.ownerId || ''}
              title={book.title}
              purchasePrice={book.price}
              delivery={book.bookDistribution?.delivery}
              watermark={book.bookDistribution?.watermark}
              uid={currentUser?.uid}
              ownership={bookOwnership}
              onRequestSignIn={() => loginWithGoogle()}
            />
          </div>
          <div className="mt-4 flex justify-center"><BuyPrintEdition albumId={book.id} /></div>
          <BookGiveaways book={book} showGiveaways className="mt-5" />
        </div>
      </div>
    );
  }

  // Tela edition: an upgraded book renders through TelaEmbed (follow-latest for the author and free readers, pinned
  // to the purchased version for buyers). Falls back to this classic reader whenever anything is missing.
  if (telaEdition.status === 'loading') {
    return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0A0A0A]"><Loader2 className="animate-spin text-white/50" size={22} /></div>;
  }
  if (telaEdition.status === 'tela' && !livingPicture) {
    return (
      <React.Suspense fallback={<div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0A0A0A]"><Loader2 className="animate-spin text-white/50" size={22} /></div>}>
        <TelaBookReader album={book} bundle={telaEdition.bundle} pin={telaEdition.pin} uid={currentUser?.uid} isOwner={isBookOwner} isPaid={isPaidBook} license={bookOwnership.license} onBack={onBack} />
        <EditionBar bookId={book.id} bookTitle={book.title} creatorUid={book.ownerId} registry={readRegistry(book.bookEditions)}
          version={telaEdition.choice.version} followLatest={telaEdition.choice.followLatest} readable={telaEdition.choice.readable}
          purchased={telaEdition.choice.purchased} upgradeOffer={telaEdition.choice.upgradeOffer} />
      </React.Suspense>
    );
  }

  // Full-bleed: portal to <body> so `fixed inset-0` is viewport-relative. Contained:
  // render inline in the content column (between the pillars and the right edge).
  return isFullscreen ? createPortal(readerTree, document.body) : readerTree;
};

const BookOpen = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

// A sealed (paid) book's album carries no readable content — fetch what this reader is entitled to
// from the vault first. Non-buyers get the sealed album back, so the inner reader shows its purchase screen.
const BookReader: React.FC<BookReaderProps> = (props) => {
  const sealed = isSealedBook(props.book);
  const uid = props.currentUser?.uid || auth.currentUser?.uid || '';
  const [opened, setOpened] = useState<{ key: string; book: Album; access: BookAccess } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The reader's rollback choice (services/bookEditions): refetch when they switch versions.
  const [preferred, setPreferred] = useState<string | null>(() => getPreferredVersion(props.book.id));
  useEffect(() => {
    setPreferred(getPreferredVersion(props.book.id));
    const on = (e: Event) => { if ((e as CustomEvent).detail?.bookId === props.book.id) setPreferred(getPreferredVersion(props.book.id)); };
    window.addEventListener(VERSION_PREF_EVENT, on);
    return () => window.removeEventListener(VERSION_PREF_EVENT, on);
  }, [props.book.id]);
  const key = `${props.book.id}:${uid}:${preferred || ''}`;
  useEffect(() => {
    if (!sealed) return;
    let alive = true;
    setError(null);
    openSealedBook(props.book, preferred)
      .then(r => { if (alive) setOpened({ key, book: r.book, access: r.access }); })
      .catch(e => { if (alive) setError(e?.message || 'Could not open this book'); });
    return () => { alive = false; };
  }, [sealed, key]);
  if (!sealed) return <BookReaderInner {...props} />;
  if (error) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-[#0A0A0A] text-white/70 p-6 text-center">
        <AlertCircle size={28} className="text-red-400" />
        <p className="text-sm">{error}</p>
        <button onClick={props.onBack} className="h-10 px-5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest">Back</button>
      </div>
    );
  }
  if (!opened || opened.key !== key) {
    return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0A0A0A]"><Loader2 className="animate-spin text-white/50" size={22} /></div>;
  }
  const a = opened.access;
  return (
    <>
      {/* Remount on a version switch so pagination/position state starts clean for that version's text. */}
      <BookReaderInner key={a.version?.versionId || 'current'} {...props} book={opened.book} />
      {a.entitled && !props.book.bookTela?.enabled && (
        <EditionBar bookId={props.book.id} bookTitle={props.book.title} creatorUid={props.book.ownerId} registry={a.registry}
          version={a.version ?? null} followLatest={a.followLatest !== false} readable={a.readable || []} purchased={a.purchased} upgradeOffer={a.upgradeOffer} />
      )}
    </>
  );
};

export default BookReader;
