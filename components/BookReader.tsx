import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Album, BookChapter, BookPage, Comment, BookNote } from '../types';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, ZoomIn, ZoomOut, Grid, Bookmark, Settings, MessageSquare, Edit3, Mic, Link as LinkIcon, Play, Pause, Users, Video as VideoIcon, Highlighter, RefreshCw, List, Book as BookIcon, Type, Smartphone, Monitor, Moon, Sun, Coffee, Columns, Square, Download, Loader2, BookOpen as BookOpenIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToComments, postComment } from '../services/backendService';
import CommentSection from './CommentSection';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import PlajahPlusButton from './PlajahPlusButton';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Rendition, Book as EPubBook } from 'epubjs';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

if (pdfjs && pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface BookReaderProps {
  book: Album;
  onBack: () => void;
  currentUser: any;
  onVisitUser?: (uid: string) => void;
}

const BookReader: React.FC<BookReaderProps> = ({ book, onBack, currentUser, onVisitUser }) => {
  const { theme } = useGlobalPlayerState();
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

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
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [viewMode, setViewMode] = useState<'SINGLE' | 'DOUBLE'>('SINGLE');
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
  const [epubLocation, setEpubLocation] = useState<string | null>(null);
  const [epubProgress, setEpubProgress] = useState(0);

  // Settings State
  const [fontSize, setFontSize] = useState(100);
  const [readingTheme, setReadingTheme] = useState<'DEFAULT' | 'SEPIA' | 'DARK' | 'PAPER'>('SEPIA');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');

  // Read Along (Book Club) State
  const [isReadAlongActive, setIsReadAlongActive] = useState(false);
  const [isHost, setIsHost] = useState(false);
  
  // Narration State
  const [isNarrating, setIsNarrating] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // PDF State
  const [numPdfPages, setNumPdfPages] = useState<number>();
  const [pdfPageNumber, setPdfPageNumber] = useState<number>(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPdfPages(numPages);
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
      await publishToCloud(savedBook);
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
  const isEpub = currentChapter?.url?.toLowerCase().endsWith('.epub') || currentChapter?.url?.includes('epub');
  const isPdf = currentChapter?.url?.toLowerCase().endsWith('.pdf') || currentChapter?.url?.includes('pdf');
  const isTxt = !isEpub && !isPdf && !isGraphicNovel && (
    currentChapter?.url?.toLowerCase().endsWith('.txt') ||
    currentChapter?.url?.includes('/txt') ||
    currentChapter?.url?.includes('text%2Fplain') ||
    currentChapter?.url?.includes('text/plain') ||
    (currentChapter?.url?.includes('archive.org') && !currentChapter?.url?.includes('.epub') && !currentChapter?.url?.includes('.pdf'))
  );

  useEffect(() => {
    if (currentChapter?.content) {
      setChapterContent(currentChapter.content);
    } else if (isTxt && currentChapter?.url) {
      loadFullText(currentChapter.url);
    } else {
      setChapterContent('');
    }
  }, [currentChapter, isTxt]);

  const loadFullText = async (url: string) => {
    setIsLoadingContent(true);
    try {
      // Use proxy if it's an external URL to avoid CORS "Failed to fetch"
      const fetchUrl = url.startsWith('http') 
        ? `/api/proxy?url=${encodeURIComponent(url)}` 
        : url;
        
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`Signal loss: ${response.status} ${response.statusText}`);
      
      let text = await response.text();
      if (!text || text.trim().length === 0) {
        throw new Error("Empty frequency captured (Zero length content)");
      }
      // Strip HTML tags that archive.org sometimes includes in plain-text responses
      if (text.trimStart().startsWith('<')) {
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                   .replace(/\s{3,}/g, '\n\n').trim();
      }
      setChapterContent(text);
    } catch (error) {
      console.error('Error loading full text:', error);
      setChapterContent('Error loading the full text from the archive. This may be due to CORS restrictions or a temporary network issue. We are attempting to synchronize the signal.');
    } finally {
      setIsLoadingContent(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToComments(book.id, null, null, setComments);
    return () => unsubscribe();
  }, [book.id]);

  const handlePostComment = async (text: string, parentId?: string) => {
    if (!currentUser) return;
    await postComment(book.id, {
      author: currentUser.displayName || 'READER',
      text,
      timestamp: Date.now(),
      parentId: parentId || undefined
    });
  };

  // Apply EPUB Styles
  useEffect(() => {
    if (epubRendition) {
      epubRendition.themes.fontSize(`${fontSize}%`);
      
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
  }, [epubRendition, fontSize, readingTheme, fontFamily, theme]);

  const nextPage = useCallback(() => {
    if (isEpub && epubRendition) {
      try {
        if ((epubRendition as any).manager) {
          epubRendition.next();
        }
      } catch (e) {
        console.warn('EPUB next page error', e);
      }
    } else if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else if (currentChapterIndex < (book.bookChapters?.length || 0) - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
      setCurrentPageIndex(0);
    }
  }, [isEpub, epubRendition, currentPageIndex, pages.length, currentChapterIndex, book.bookChapters]);

  const prevPage = useCallback(() => {
    if (isEpub && epubRendition) {
      try {
        if ((epubRendition as any).manager) {
          epubRendition.prev();
        }
      } catch (e) {
        console.warn('EPUB prev page error', e);
      }
    } else if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    } else if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
      const prevChapterPages = book.bookChapters?.[currentChapterIndex - 1].pages || [];
      setCurrentPageIndex(Math.max(0, prevChapterPages.length - 1));
    }
  }, [isEpub, epubRendition, currentPageIndex, currentChapterIndex, book.bookChapters]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextPage();
      if (e.key === 'ArrowLeft') prevPage();
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, onBack]);

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
    <div className={`fixed inset-0 ${s.bg} z-[90] flex flex-col overflow-hidden select-none pb-32 lg:pb-40 transition-colors duration-500`}>
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
                onClick={() => { setShowTOC(!showTOC); setShowComments(false); setShowNotes(false); setShowSettings(false); }}
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
                  {isEpub ? `Reading: ${epubProgress}%` : (currentChapter?.title || `Chapter ${currentChapterIndex + 1}`)}
                  {!isEpub && ` • Page ${currentPageIndex + 1} of ${pages.length || 1}`}
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

              {currentChapter?.audioUrl && (
                <button 
                  onClick={toggleNarration}
                  className={`p-3 rounded-full transition-all ${isNarrating ? s.activeBtn : s.btnHover}`}
                  title="Read Aloud"
                >
                  {isNarrating ? <Pause size={20} /> : <Play size={20} />}
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
              
              <button 
                onClick={() => { setShowSettings(!showSettings); setShowComments(false); setShowNotes(false); setShowTOC(false); }}
                className={`p-3 rounded-full transition-all ${showSettings ? s.activeBtn : s.btnHover}`}
                title="Reading Settings"
              >
                <Settings size={20} />
              </button>

              <button 
                onClick={() => { setShowNotes(!showNotes); setShowComments(false); setShowTOC(false); setShowSettings(false); }}
                className={`p-3 rounded-full transition-all ${showNotes ? s.activeBtn : s.btnHover}`}
                title="Notes"
              >
                <Edit3 size={20} />
              </button>
              <button 
                onClick={() => { setShowComments(!showComments); setShowNotes(false); setShowTOC(false); setShowSettings(false); }}
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
            {isEpub ? (
              <div 
                className={`w-full h-full max-w-5xl rounded-lg shadow-2xl relative ${readingTheme === 'SEPIA' ? 'bg-[#f4ecd8]' : readingTheme === 'PAPER' ? 'bg-[#fdfdfd]' : readingTheme === 'DARK' ? 'bg-[#111]' : (theme === 'LIGHT' ? 'bg-white' : 'bg-[#1a1a1a]')}`}
              >
                <ReactReader
                  url={proxiedEpubUrl}
                  title={book.title || ""}
                  location={epubLocation || undefined}
                  locationChanged={(epubcifi: string) => setEpubLocation(epubcifi)}
                  epubInitOptions={{
                      openAs: 'epub',
                  }}
                  readerStyles={{
                    ...ReactReaderStyle,
                    readerArea: {
                      ...ReactReaderStyle.readerArea,
                      backgroundColor: 'transparent',
                    }
                  }}
                  getRendition={(rendition) => {
                    setEpubRendition(rendition);
                  }}
                  tocChanged={(toc) => setToc(toc)}
                />
              </div>
            ) : isPdf ? (
              <div 
                className={`w-full h-full max-w-5xl rounded-lg shadow-2xl relative overflow-y-auto no-scrollbar flex flex-col items-center p-4 lg:p-8 ${theme === 'LIGHT' ? 'bg-white' : 'bg-[#1a1a1a]'}`}
              >
                {proxiedPdfUrl ? (
                  <Document 
                    file={proxiedPdfUrl} 
                    onLoadSuccess={onDocumentLoadSuccess}
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
            ) : chapterContent ? (
              <div className={`max-w-3xl w-full ${txtCardBg} shadow-2xl rounded-3xl overflow-y-auto max-h-[85vh] ${s.scrollbar}`}>
                {book.coverImage && (
                  <div className="relative h-40 overflow-hidden rounded-t-3xl">
                    <img src={book.coverImage} alt="" className="w-full h-full object-cover scale-110" style={{ filter:'blur(24px) brightness(0.5) saturate(1.3)' }} />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
                    <div className="absolute inset-0 flex items-end p-8">
                      <h3 className="text-2xl font-black uppercase tracking-widest text-white drop-shadow-2xl">{currentChapter?.title}</h3>
                    </div>
                  </div>
                )}
                <div className="p-10 lg:p-16">
                  {!book.coverImage && (
                    <h3 className={`text-2xl font-black uppercase tracking-tight mb-10 text-center ${txtHdColor}`}>{currentChapter?.title}</h3>
                  )}
                  <div className={`${txtFontFamily} text-lg leading-[1.9] ${txtColor} space-y-0`} style={{ fontSize: `${fontSize}%` }}>
                    {chapterContent.split('\n').filter(p => p.trim()).map((para, i) => (
                      <p key={i} className="mb-5">{para}</p>
                    ))}
                  </div>
                </div>
              </div>
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
                  style={{ width: isEpub ? `${epubProgress}%` : `${(((currentChapterIndex * 100) + ((currentPageIndex + 1) / (pages.length || 1) * 100)) / (book.bookChapters?.length || 1))}%` }}
                />
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <button onClick={prevPage} className={`p-3 transition-all ${s.btnHover}`}><ChevronLeft size={24} /></button>
                <div className={`px-6 py-2 ${theme === 'LIGHT' ? 'bg-black/5' : 'bg-white/5'} border border-black/10 rounded-full`}>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${s.text} whitespace-nowrap`}>
                    {isEpub ? `${epubProgress}%` : (isGraphicNovel ? `ISSUE ${currentChapterIndex + 1} • P.${currentPageIndex + 1}` : `CH.${currentChapterIndex + 1} • P.${currentPageIndex + 1}`)}
                  </span>
                </div>
                <button onClick={nextPage} className={`p-3 transition-all ${s.btnHover}`}><ChevronRight size={24} /></button>
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
};

const BookOpen = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

export default BookReader;
