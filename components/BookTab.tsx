import React, { useState, useEffect } from 'react';
import { Book, Album, BookChapter } from '../types';
import PageHeader from './PageHeader';
import { fetchClassicBooks, fetchArchiveBooks, fetchLibraryOfCongressBooks, fetchResearchPapers, ArchiveBook, getArchiveItemFiles } from '../services/archiveContentService';
import { searchGoogleBooks, GoogleBook } from '../services/googleBooksService';
import { fetchPublicBooks, syncPublicDomainAsset } from '../services/backendService';
import { importComic } from '../services/comicImport';
import { CLASSIC_BOOKS } from '../data/classicBooks';
import { BookOpen, Search, Filter, Star, Clock, ChevronRight, Bookmark, Download, Loader2, Library as LibraryIcon, ShoppingCart, User as UserIcon, Globe } from 'lucide-react';
import PlajahPlusBanner from './PlajahPlusBanner';
import { motion, AnimatePresence } from 'motion/react';
import LazyImage from './LazyImage';
import { warmImages } from '../src/lib/performanceCache';

interface BookTabProps {
  onSelectBook: (book: any) => void;
  onVisitUser?: (uid: string, tab?: string) => void;
  onCreateBook?: () => void;
  onCreateScript?: () => void;
}

const GENRES: Array<{ id: string; name: string; topic: string; source?: 'gutendex' | 'ia' | 'loc' | 'arxiv' }> = [
  { id: 'all', name: 'All Classics', topic: '' },
  // Native loc.gov open-access collection (not the Internet Archive mirror)
  { id: 'loc', name: 'Library of Congress', topic: '', source: 'loc' },
  { id: 'fiction', name: 'Fiction', topic: 'fiction' },
  { id: 'mystery', name: 'Mystery', topic: 'mystery' },
  { id: 'sci-fi', name: 'Sci-Fi', topic: 'science fiction' },
  { id: 'fantasy', name: 'Fantasy', topic: 'fantasy' },
  { id: 'art', name: 'Museum & Art', topic: 'collection:metropolitanmuseumofart-gallery', source: 'ia' },
  { id: 'history', name: 'History', topic: 'history' },
  // Research papers, auto-categorized by discipline from arXiv taxonomy
  { id: 'papers-cs', name: 'Papers · Computing', topic: 'cs', source: 'arxiv' },
  { id: 'papers-physics', name: 'Papers · Physics', topic: 'physics', source: 'arxiv' },
  { id: 'papers-math', name: 'Papers · Math', topic: 'math', source: 'arxiv' },
  { id: 'papers-eng', name: 'Papers · Engineering', topic: 'eess', source: 'arxiv' },
  { id: 'papers-bio', name: 'Papers · Biology', topic: 'q-bio', source: 'arxiv' },
];

// Module-level caches — survive tab switches, only fetch once per session
// Pre-seed 'all' with the bundled classics so the page is never blank on first open
const _classicCache: Map<string, ArchiveBook[]> = new Map([['all', CLASSIC_BOOKS]]);
const _archiveCache: Map<string, ArchiveBook[]> = new Map();
let _marketplaceCache: import('../types').Album[] | null = null;

const archiveDownloadUrl = (identifier: string, fileName: string) =>
  `https://archive.org/download/${encodeURIComponent(identifier)}/${fileName.split('/').map(encodeURIComponent).join('/')}`;

const fileName = (file: any) => String(file?.name || '');
const fileFormat = (file: any) => String(file?.format || '').toLowerCase();

const pickArchiveReadableFile = (files: any[]) => {
  const readable = files.filter(file => {
    const name = fileName(file).toLowerCase();
    return !name.includes('_meta') && !name.includes('_files') && !name.includes('_archive');
  });

  const epub = readable.find(file => fileName(file).toLowerCase().endsWith('.epub') || fileFormat(file).includes('epub'));
  if (epub) return { file: epub, format: 'EPUB' as const };

  const text = readable.find(file => fileName(file).toLowerCase().endsWith('.txt') || fileFormat(file).includes('text'));
  if (text) return { file: text, format: 'TXT' as const };

  const pdf = readable.find(file => fileName(file).toLowerCase().endsWith('.pdf') || fileFormat(file).includes('pdf'));
  if (pdf) return { file: pdf, format: 'PDF' as const };

  return null;
};

const BookTab: React.FC<BookTabProps> = ({ onSelectBook, onVisitUser, onCreateBook, onCreateScript }) => {
  const [activeTab, setActiveTab] = useState<'MARKETPLACE' | 'CLASSICS' | 'GLOBAL'>('CLASSICS');
  const [comicImporting, setComicImporting] = useState(false);
  const [comicImportMsg, setComicImportMsg] = useState('');
  const [archiveBooks, setArchiveBooks] = useState<ArchiveBook[]>(CLASSIC_BOOKS);
  const [marketplaceBooks, setMarketplaceBooks] = useState<Album[]>([]);
  const [googleBooks, setGoogleBooks] = useState<GoogleBook[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGenre, setActiveGenre] = useState(GENRES[0]);
  // Never block on initial render — classics are bundled as static data
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'CLASSICS') {
      loadClassicBooks();
    } else if (activeTab === 'MARKETPLACE') {
      loadMarketplaceBooks();
    } else if (activeTab === 'GLOBAL') {
      // Never block GLOBAL tab — data loads in background
      setIsLoading(false);
      if (archiveBooks.length === 0) {
        fetchClassicBooks('').then(books => setArchiveBooks(books)).catch(() => {});
      }
      if (marketplaceBooks.length === 0) {
        fetchPublicBooks().then(books => { _marketplaceCache = books; setMarketplaceBooks(books); }).catch(() => {});
      }
    }
  }, [activeGenre, activeTab]);

  useEffect(() => {
    if (activeTab === 'GLOBAL') {
      const delayDebounceFn = setTimeout(() => {
        loadGoogleBooks();
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchTerm, activeTab]);

  useEffect(() => {
    warmImages([
      ...archiveBooks.map(book => book.coverImage),
      ...marketplaceBooks.map(book => book.coverImage),
      ...googleBooks.map(book => book.coverImage),
    ], 18);
  }, [archiveBooks, marketplaceBooks, googleBooks]);

  const loadGoogleBooks = async () => {
    setIsLoading(googleBooks.length === 0 && !!searchTerm);
    try {
       const results = await searchGoogleBooks(searchTerm);
       setGoogleBooks(results);
    } catch (e) {
       console.error("Failed to fetch google books");
    } finally {
       setIsLoading(false);
    }
  };

  const loadMarketplaceBooks = async () => {
    if (_marketplaceCache) { setMarketplaceBooks(_marketplaceCache); setIsLoading(false); return; }
    setIsLoading(marketplaceBooks.length === 0);
    try {
      const books = await fetchPublicBooks();
      _marketplaceCache = books;
      setMarketplaceBooks(books);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClassicBooks = async () => {
    const cacheKey = activeGenre.id;
    const cache = activeGenre.source ? _archiveCache : _classicCache;
    if (cache.has(cacheKey)) { setArchiveBooks(cache.get(cacheKey)!); setIsLoading(false); return; }
    // Show static classics immediately for 'all' so the page is never blank while fetching
    if (activeGenre.id === 'all' && archiveBooks.length === 0) setArchiveBooks(CLASSIC_BOOKS);
    setIsLoading(archiveBooks.length === 0 && activeGenre.id !== 'all');
    let books: ArchiveBook[] = [];
    try {
      switch (activeGenre.source) {
        case 'loc':   books = await fetchLibraryOfCongressBooks(searchTerm); break;
        case 'arxiv': books = await fetchResearchPapers(activeGenre.topic); break;
        case 'ia':    books = await fetchArchiveBooks(activeGenre.topic); break;
        default:      books = await fetchClassicBooks(activeGenre.topic);
      }
      if (books.length > 0) {
        cache.set(cacheKey, books);
        setArchiveBooks(books);
      }
    } catch {
      // keep static data visible on network error
    } finally {
      setIsLoading(false);
    }
  };

  const filteredArchive = archiveBooks.filter(b => 
    b.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.authors.some(a => a.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredMarketplace = marketplaceBooks.filter(b => 
    b.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBookSelect = async (archiveBook: ArchiveBook) => {
    // Transform ArchiveBook to the Album format expected by BookReader
    // LoC and arXiv items carry direct file URLs — no IA metadata lookup.
    const isDirect = archiveBook.id.startsWith('loc-') || archiveBook.id.startsWith('arxiv-');
    const isIA = !isDirect && !archiveBook.id.match(/^\d+$/); // Gutendex IDs are numeric strings

    let bookChapters: BookChapter[] = [];

    if (isDirect) {
      const pdfUrl  = archiveBook.formats['application/pdf'];
      const epubUrl = archiveBook.formats['application/epub+zip'];
      const url = epubUrl || pdfUrl || Object.values(archiveBook.formats)[0] || '';
      if (url) {
        bookChapters = [{
          id: 'full-doc',
          title: archiveBook.id.startsWith('arxiv-') ? 'Full Paper' : 'Complete Work',
          url,
          format: epubUrl ? 'EPUB' : 'PDF',
        }];
      }
    } else if (isIA) {
      // For IA books, let's try to find page images to ensure "more than 1 or 2 pages"
      const files = await getArchiveItemFiles(archiveBook.id);
      const jp2Files = files.filter((f: any) => f.name.endsWith('.jp2') || (f.name.endsWith('.jpg') && !f.name.includes('thumb'))).sort((a: any, b: any) => a.name.localeCompare(b.name));
      
      if (jp2Files.length > 5) {
        // Create chapters from page groups if there are many files
        bookChapters = [{
          id: 'pages',
          title: 'Full Image Archive',
          pages: jp2Files.map((f: any, i: number) => ({
            id: `p-${i}`,
            url: `https://archive.org/download/${archiveBook.id}/${f.name}`,
            pageNumber: i + 1
          }))
        }];
      } else {
        const readableFile = pickArchiveReadableFile(files);
        if (readableFile) {
          bookChapters = [{
            id: 'full-book',
            title: 'Full Publication',
            url: archiveDownloadUrl(archiveBook.id, readableFile.file.name),
            format: readableFile.format,
          }];
        }
      }
    } else {
      // Priority: EPUB (native chapter/TOC) → Firebase Storage TXT (fast CDN) → Gutenberg TXT cache
      const epubUrl    = archiveBook.formats['application/epub+zip'] || Object.values(archiveBook.formats).find(f => typeof f === 'string' && f.includes('epub'));
      const storedUrl  = archiveBook.formats['text/plain; charset=utf-8'];   // Firebase Storage
      const gutenbUrl  = archiveBook.formats['text/plain'];                   // Gutenberg TXT cache

      const primaryUrl = epubUrl || storedUrl || gutenbUrl || '';
      const isEpubPrimary = !!epubUrl;
      // TXT to fall back to when EPUB fails. Prefer the Gutenberg cache URL:
      // the Firebase Storage copy 404s until the seed endpoint has run.
      const txtFallback = gutenbUrl || storedUrl || undefined;

      bookChapters = [
        {
          id: 'full-text',
          title: 'Complete Work',
          url: primaryUrl,
          format: isEpubPrimary ? 'EPUB' : 'TXT',
          // fallbackUrl: for EPUB chapters → points to TXT; for TXT → next TXT option
          ...(isEpubPrimary && txtFallback
            ? { fallbackUrl: txtFallback }
            : !isEpubPrimary && storedUrl && gutenbUrl
            ? { fallbackUrl: gutenbUrl }
            : {}),
        }
      ];
    }
    
    const transformedBook: Album = {
      id: isDirect ? archiveBook.id : isIA ? `archive-${archiveBook.id}` : `guttenberg-${archiveBook.id}`,
      title: archiveBook.title,
      artist: archiveBook.authors.join(', '),
      coverImage: archiveBook.coverImage || '',
      type: 'BOOK',
      subType: isIA && bookChapters.some(chapter => chapter.pages?.length) ? 'GRAPHIC_NOVEL' : 'NOVEL',
      genre: archiveBook.genre,
      description: archiveBook.subjects.join(', '),
      ownerId: 'system',
      createdAt: Date.now(),
      themeColor: '#8a2be2',
      tracks: [],
      bookChapters
    };

    if (bookChapters.length > 0 && bookChapters[0].url) {
        syncPublicDomainAsset(archiveBook, bookChapters[0].url, 'BOOK');
    }

    onSelectBook(transformedBook);
  };

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-12 max-w-7xl mx-auto w-full pb-32 lg:pb-40">
      <header className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-small-orange rounded-3xl flex items-center justify-center shadow-lg shadow-small-orange/20">
                <LibraryIcon className="text-white" size={24} />
             </div>
             <PageHeader textClassName="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
               {activeTab === 'CLASSICS' ? 'Plajah Lorea Archive' : 'Plajah Lorea'}
             </PageHeader>
          </div>
          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em] ml-16">
            {activeTab === 'CLASSICS' ? 'The Best Place for Independent Authors & Writers' : 'Community Uploaded Books & Originals'}
          </p>
        </div>
      </header>

      {/* Control bar — single centered row beneath the header, above the genre tabs */}
      <div className="mb-10 flex flex-wrap items-center justify-center gap-3 animate-in fade-in duration-700">
        {/* Kids Library — public-domain children's books + learn-to-read tools */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'KIDS_LIBRARY' } }))}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-xs font-black uppercase tracking-widest rounded-full transition-all hover:opacity-90 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #FF8C00, #36c5f0)' }}
        >
          <span>📚</span> Kids Library
        </button>
        {/* Sacred Library — the comprehensive Bible & Church-history experience */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('OPEN_BIBLE'))}
          className="flex items-center gap-2 px-5 py-2.5 text-black text-xs font-black uppercase tracking-widest rounded-full transition-all hover:opacity-90 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #f3d27a, #d4af37)', boxShadow: '0 8px 24px rgba(212,175,55,0.25)' }}
        >
          <span>✝</span> Sacred Library
        </button>
        {/* Write a Script — opens Script Writing Studio */}
        {onCreateScript && (
          <button
            onClick={onCreateScript}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-full hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
          >
            <span>🎬</span> Write Script
          </button>
        )}
        {/* Create a Book — launches the Book Authoring Studio */}
        {onCreateBook && (
          <button
            onClick={onCreateBook}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-black text-xs font-black uppercase tracking-widest rounded-full hover:bg-orange-400 transition-colors shadow-lg shadow-orange-500/20"
          >
            <BookOpen size={14} /> Create a Book
          </button>
        )}
        {/* Comics & Manga Museum — public-domain comics + manga history + global library */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_MUSEUM' } }))}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-xs font-black uppercase tracking-widest rounded-full hover:bg-violet-500 transition-colors shadow-lg shadow-violet-500/20"
        >
          <span>🏛️</span> Comics & Manga Museum
        </button>
        {/* Import a digital comic (CBZ / PDF) → opens in the comic reader */}
        <label className={`flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-white/70 hover:text-white text-xs font-black uppercase tracking-widest rounded-full cursor-pointer transition-colors ${comicImporting ? 'opacity-60 pointer-events-none' : ''}`}>
          {comicImporting ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
          {comicImporting ? (comicImportMsg || 'Importing…') : 'Import Comic'}
          <input type="file" accept=".cbz,.zip,.pdf,application/zip,application/pdf" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]; e.currentTarget.value = '';
              if (!f) return;
              setComicImporting(true); setComicImportMsg('Reading…');
              try {
                const album = await importComic(f, (p) => setComicImportMsg(p.phase === 'uploading' ? `Uploading ${p.done}/${p.total}` : p.phase === 'reading' ? 'Reading…' : 'Done'));
                onSelectBook(album);
              } catch (err: any) {
                alert(err?.message || 'Import failed');
              } finally { setComicImporting(false); setComicImportMsg(''); }
            }} />
        </label>
        <PlajahPlusBanner variant="PILL" />
        <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
          <button
            onClick={() => setActiveTab('CLASSICS')}
            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'CLASSICS' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
            }`}
          >
            Classics
          </button>
          <button
            onClick={() => setActiveTab('MARKETPLACE')}
            className={`px-4 py-2 rounded-full text-[10px] flex items-center gap-1.5 font-black uppercase tracking-widest transition-all ${
              activeTab === 'MARKETPLACE' ? 'bg-small-orange text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            <ShoppingCart size={14} /> Marketplace
          </button>
          <button
            onClick={() => setActiveTab('GLOBAL')}
            className={`px-4 py-2 rounded-full text-[10px] flex items-center gap-1.5 font-black uppercase tracking-widest transition-all ${
              activeTab === 'GLOBAL' ? 'bg-blue-500 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            <Globe size={14} /> Global
          </button>
        </div>
        <div className="relative group w-full sm:w-auto">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-small-orange transition-all" size={20} />
          <input
            type="text"
            placeholder={`Search ${activeTab === 'CLASSICS' ? 'Archive' : activeTab === 'GLOBAL' ? 'Google Books' : 'Marketplace'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-full py-3.5 pl-14 pr-6 text-sm font-bold outline-none focus:border-small-orange/50 focus:ring-4 ring-small-orange/10 transition-all w-full sm:w-56 font-display"
          />
        </div>
      </div>

      {/* Genre Sidebar / Menu - Only in Classics */}
      {activeTab === 'CLASSICS' && (
        <div className="flex gap-4 mb-8 sm:mb-16 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
          {GENRES.map(g => (
            <button 
              key={g.id}
              onClick={() => setActiveGenre(g)}
              className={`px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border shrink-0 ${activeGenre.id === g.id ? 'bg-small-orange border-small-orange text-white shadow-2xl shadow-small-orange/20 scale-105' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:border-white/10'}`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="py-40 text-center space-y-8 animate-pulse">
          <Loader2 className="mx-auto text-small-orange animate-spin" size={48} />
          <p className="text-[10px] font-black uppercase tracking-[0.6em] opacity-20">Accessing neural nodes...</p>
        </div>
      ) : activeTab === 'CLASSICS' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 lg:gap-8">
          {filteredArchive.map((book, idx) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={book.id}
              onClick={() => handleBookSelect(book)}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[2/3] rounded-[2rem] overflow-hidden mb-6 shadow-2xl bg-white/5 ring-1 ring-white/10 group-hover:ring-small-orange/40 transition-all duration-500 group-hover:-translate-y-2">
                <LazyImage 
                  src={book.coverImage || undefined} 
                  alt={book.title}
                  className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                  priority={idx < 8}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 sm:p-8 gap-2 sm:gap-4 backdrop-blur-[2px]">
                   <div className="flex items-center gap-2 mb-2">
                      <Star className="text-small-orange fill-small-orange" size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">{Math.floor(book.download_count / 100).toLocaleString()}+ Readers</span>
                   </div>
                   <button className="w-full py-4 bg-small-orange text-white rounded-2xl font-black text-xs uppercase tracking-tightest shadow-2xl hover:scale-105 active:scale-95 transition-all">
                      Read Full Text
                   </button>
                </div>
                <div className="absolute top-6 right-6 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl text-[8px] font-black text-white uppercase tracking-widest shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
                  Public Domain
                </div>
              </div>
              <div className="px-2 space-y-1">
                <h3 className="font-display font-black uppercase tracking-tighter text-lg leading-none truncate group-hover:text-small-orange transition-colors">{book.title}</h3>
                <p className="text-white/40 font-black uppercase tracking-widest text-[9px] truncate">{book.authors.join(', ')}</p>
              </div>
            </motion.div>
          ))}
        </div>
      ) : activeTab === 'GLOBAL' ? (
        <div className="space-y-16">
          {searchTerm ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 lg:gap-8">
              {googleBooks.map((googleBook, idx) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={googleBook.id}
                  onClick={() => {
                    const urlToOpen = googleBook.buyLink || googleBook.previewLink;
                    if (urlToOpen) {
                      window.open(urlToOpen, '_blank');
                    } else {
                      alert('No preview or purchase link available for this book.');
                    }
                  }}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-[2/3] rounded-[2rem] overflow-hidden mb-6 shadow-2xl bg-white/5 ring-1 ring-white/10 group-hover:ring-blue-500/40 transition-all duration-500 group-hover:-translate-y-2">
                    <LazyImage 
                      src={googleBook.coverImage || undefined} 
                      alt={googleBook.title}
                      className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                      priority={idx < 8}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 sm:p-8 gap-2 sm:gap-4 backdrop-blur-[2px]">
                       <button className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-tightest shadow-2xl hover:scale-105 active:scale-95 transition-all">
                          {googleBook.buyLink ? 'View on Google Play' : 'Preview'}
                       </button>
                    </div>
                    {googleBook.price && (
                      <div className="absolute top-6 right-6 px-4 py-2 bg-blue-500 backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest shadow-xl opacity-100">
                        ${googleBook.price.toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div className="px-2 space-y-1">
                    <h3 className="font-display font-black uppercase tracking-tighter text-lg leading-none truncate group-hover:text-blue-500 transition-colors">{googleBook.title}</h3>
                    <p className="text-white/40 font-black uppercase tracking-widest text-[9px] truncate">{googleBook.authors.join(', ')}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="space-y-16">
              
              {/* TOP CLASSIC LITERATURE */}
              {archiveBooks.length > 0 && (
                <div>
                  <h2 className="text-2xl font-display font-black uppercase tracking-tightest mb-8 flex items-center gap-3">
                    <LibraryIcon className="text-small-orange" size={24} />
                    Top Classic Literature
                  </h2>
                  <div className="flex gap-8 overflow-x-auto pb-8 snap-x snap-mandatory no-scrollbar w-full" style={{ scrollPaddingLeft: '2rem' }}>
                    {archiveBooks.slice(0, 15).map((book, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={book.id}
                        onClick={() => handleBookSelect(book)}
                        className="group cursor-pointer snap-start shrink-0 w-48"
                      >
                        <div className="relative aspect-[2/3] rounded-[1.5rem] overflow-hidden mb-4 shadow-xl bg-white/5 ring-1 ring-white/10 group-hover:ring-small-orange/40 transition-all duration-500 group-hover:-translate-y-2">
                          <LazyImage 
                            src={book.coverImage || undefined} 
                            alt={book.title}
                            className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                            priority={idx < 6}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 gap-2 backdrop-blur-[2px]">
                             <button className="w-full py-2 bg-small-orange text-white rounded-xl font-black text-[10px] uppercase tracking-tightest shadow-2xl hover:scale-105 active:scale-95 transition-all">
                                Read Full Text
                             </button>
                          </div>
                        </div>
                        <div className="px-1 space-y-1">
                          <h3 className="font-display font-black uppercase tracking-tighter text-sm leading-tight line-clamp-2 group-hover:text-small-orange transition-colors">{book.title}</h3>
                          <p className="text-white/40 font-black uppercase tracking-widest text-[8px] truncate">{book.authors.join(', ')}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* MARKETPLACE BEST SELLERS */}
              {marketplaceBooks.length > 0 && (
                <div>
                  <h2 className="text-2xl font-display font-black uppercase tracking-tightest mb-8 flex items-center gap-3">
                    <ShoppingCart className="text-green-500" size={24} />
                    Current Best Sellers (Marketplace)
                  </h2>
                  <div className="flex gap-8 overflow-x-auto pb-8 snap-x snap-mandatory no-scrollbar w-full" style={{ scrollPaddingLeft: '2rem' }}>
                    {marketplaceBooks.slice(0, 15).map((book, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={book.id}
                        className="group flex flex-col cursor-pointer snap-start shrink-0 w-48"
                        onClick={() => {
                          if (book.price && book.price > 0 && onVisitUser && book.ownerId) {
                            onVisitUser(book.ownerId, 'MERCH');
                          } else {
                            onSelectBook(book);
                          }
                        }}
                      >
                        <div className="relative aspect-[2/3] rounded-[1.5rem] overflow-hidden mb-4 shadow-xl bg-white/5 ring-1 ring-white/10 group-hover:ring-green-500/40 transition-all duration-500 group-hover:-translate-y-2">
                          <LazyImage 
                            src={book.coverImage || undefined} 
                            alt={book.title}
                            className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                            priority={idx < 6}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 gap-2 backdrop-blur-[2px]">
                             <button className="w-full py-2 bg-green-500 text-white rounded-xl font-black text-[10px] uppercase tracking-tightest shadow-2xl hover:scale-105 active:scale-95 transition-all">
                                {book.price ? 'View in Store' : 'Read Now'}
                             </button>
                          </div>
                          {book.price ? (
                            <div className="absolute top-4 right-4 px-3 py-1 bg-green-500 backdrop-blur-xl border border-white/10 rounded-lg text-[9px] font-black text-white uppercase tracking-widest shadow-xl opacity-100">
                              ${book.price.toFixed(2)}
                            </div>
                          ) : (
                            <div className="absolute top-4 right-4 px-3 py-1 bg-white/20 backdrop-blur-xl border border-white/10 rounded-lg text-[9px] font-black text-white uppercase tracking-widest shadow-xl opacity-100">
                              FREE
                            </div>
                          )}
                        </div>
                        <div className="px-1 space-y-1">
                          <h3 className="font-display font-black uppercase tracking-tighter text-sm leading-tight line-clamp-2 group-hover:text-green-500 transition-colors">{book.title}</h3>
                          <div className="text-white/40 font-black uppercase tracking-widest text-[8px] truncate hover:text-white flex items-center gap-1">
                            <UserIcon size={8} /> {book.artist}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* GLOBAL TRENDING */}
              {googleBooks.length > 0 && (
                <div>
                  <h2 className="text-2xl font-display font-black uppercase tracking-tightest mb-8 flex items-center gap-3">
                    <Globe className="text-blue-500" size={24} />
                    Global Trending Reads
                  </h2>
                  <div className="flex gap-8 overflow-x-auto pb-8 snap-x snap-mandatory no-scrollbar w-full" style={{ scrollPaddingLeft: '2rem' }}>
                    {googleBooks.slice(0, 15).map((googleBook, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={googleBook.id}
                        onClick={() => {
                          const urlToOpen = googleBook.buyLink || googleBook.previewLink;
                          if (urlToOpen) {
                            window.open(urlToOpen, '_blank');
                          } else {
                            alert('No preview or purchase link available for this book.');
                          }
                        }}
                        className="group cursor-pointer snap-start shrink-0 w-48"
                      >
                        <div className="relative aspect-[2/3] rounded-[1.5rem] overflow-hidden mb-4 shadow-xl bg-white/5 ring-1 ring-white/10 group-hover:ring-blue-500/40 transition-all duration-500 group-hover:-translate-y-2">
                          <LazyImage 
                            src={googleBook.coverImage || undefined} 
                            alt={googleBook.title}
                            className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                            priority={idx < 6}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 gap-2 backdrop-blur-[2px]">
                             <button className="w-full py-2 bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-tightest shadow-2xl hover:scale-105 active:scale-95 transition-all">
                                {googleBook.buyLink ? 'View on Play' : 'Preview'}
                             </button>
                          </div>
                          {googleBook.price && (
                            <div className="absolute top-4 right-4 px-3 py-1 bg-blue-500 backdrop-blur-xl border border-white/10 rounded-lg text-[9px] font-black text-white uppercase tracking-widest shadow-xl opacity-100">
                              ${googleBook.price.toFixed(2)}
                            </div>
                          )}
                        </div>
                        <div className="px-1 space-y-1">
                          <h3 className="font-display font-black uppercase tracking-tighter text-sm leading-tight line-clamp-2 group-hover:text-blue-500 transition-colors">{googleBook.title}</h3>
                          <p className="text-white/40 font-black uppercase tracking-widest text-[8px] truncate">{googleBook.authors.join(', ')}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 lg:gap-8">
          {filteredMarketplace.map((book, idx) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={book.id}
              className="group flex flex-col h-full cursor-pointer"
            >
              <div 
                className="relative aspect-[2/3] rounded-[2rem] overflow-hidden mb-6 shadow-2xl bg-white/5 ring-1 ring-white/10 group-hover:ring-small-orange/40 transition-all duration-500 group-hover:-translate-y-2"
                onClick={() => {
                  if (book.price && book.price > 0 && onVisitUser && book.ownerId) {
                    onVisitUser(book.ownerId, 'MERCH');
                  } else {
                    onSelectBook(book);
                  }
                }}
              >
                <LazyImage 
                  src={book.coverImage || undefined} 
                  alt={book.title}
                  className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                  priority={idx < 8}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 sm:p-8 gap-2 sm:gap-4 backdrop-blur-[2px]">
                   <button className="w-full py-4 bg-small-orange text-white rounded-2xl font-black text-xs uppercase tracking-tightest shadow-2xl hover:scale-105 active:scale-95 transition-all">
                      {book.price ? 'View in Store' : 'Read Now'}
                   </button>
                </div>
                {book.price ? (
                  <div className="absolute top-6 right-6 px-4 py-2 bg-small-orange backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest shadow-xl opacity-100">
                    ${book.price.toFixed(2)}
                  </div>
                ) : (
                  <div className="absolute top-6 right-6 px-4 py-2 bg-green-500/80 backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest shadow-xl opacity-100">
                    FREE
                  </div>
                )}
              </div>
              <div className="px-2 space-y-2 flex-1 flex flex-col">
                <h3 onClick={() => {
                  if (book.price && book.price > 0 && onVisitUser && book.ownerId) {
                    onVisitUser(book.ownerId, 'MERCH');
                  } else {
                    onSelectBook(book);
                  }
                }} className="font-display font-black uppercase tracking-tighter text-lg leading-none line-clamp-2 hover:text-small-orange transition-colors">{book.title}</h3>
                <div 
                  className="text-white/40 font-black uppercase tracking-widest text-[9px] truncate hover:text-white flex items-center gap-1 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onVisitUser && book.ownerId) {
                      onVisitUser(book.ownerId);
                    }
                  }}
                >
                  <UserIcon size={10} /> {book.artist}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!isLoading && activeTab === 'CLASSICS' && filteredArchive.length === 0 && (
        <div className="py-40 text-center opacity-20">
          <BookOpen size={64} className="mx-auto mb-6" />
          <p className="text-xs font-black uppercase tracking-[0.4em]">The neural library reports no matches for this query.</p>
        </div>
      )}
      {!isLoading && activeTab === 'MARKETPLACE' && filteredMarketplace.length === 0 && (
        <div className="py-40 text-center opacity-20">
          <ShoppingCart size={64} className="mx-auto mb-6" />
          <p className="text-xs font-black uppercase tracking-[0.4em]">No community books found.</p>
        </div>
      )}
    </div>
  );
};

export default BookTab;
