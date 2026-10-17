import React, { useState, useEffect, useRef } from 'react';
import { Book, Album, BookChapter } from '../types';
import PageHeader from './PageHeader';
import {
  fetchClassicBooks,
  fetchArchiveBooks,
  fetchLibraryOfCongressBooks,
  fetchResearchPapers,
  fetchEuropeanaBooks,
  fetchStandardEbooks,
  fetchWikisourceBooks,
  fetchWorldHeritageBooks,
  ArchiveBook,
  getArchiveItemFiles,
} from '../services/archiveContentService';
import { searchGoogleBooks, GoogleBook } from '../services/googleBooksService';
import { fetchPublicBooks, syncPublicDomainAsset } from '../services/backendService';
import { importComic } from '../services/comicImport';
import { CLASSIC_BOOKS } from '../data/classicBooks';
import {
  BookOpen, Search, Filter, Star, Clock, ChevronLeft, ChevronRight, Bookmark, Download,
  Loader2, Library as LibraryIcon, ShoppingCart, User as UserIcon, Globe, Play, Pause,
  Sparkles, AudioLines, Music2, Landmark, Baby, Users
} from 'lucide-react';
import { useContextMenu } from './ui/ContextMenu';
import PlajahPlusBanner from './PlajahPlusBanner';
import { motion, AnimatePresence } from 'motion/react';
import { warmImages } from '../src/lib/performanceCache';
import ChipRail from './ui/ChipRail';
import { WritersDesk } from './lorea/WritersDesk';
import LazyImage from './LazyImage';

interface BookTabProps {
  onSelectBook: (book: any) => void;
  onVisitUser?: (uid: string, tab?: string) => void;
  onCreateBook?: () => void;
  onCreateScript?: () => void;
}

const GENRES: Array<{ id: string; name: string; topic: string; source?: 'gutendex' | 'ia' | 'loc' | 'arxiv' | 'europeana' | 'standard-ebooks' | 'wikisource' | 'world-heritage' }> = [
  { id: 'all', name: 'All Classics', topic: '' },
  // Europeana European cultural heritage
  { id: 'europeana', name: 'Europeana Heritage', topic: '', source: 'europeana' },
  // Standard Ebooks beautifully typeset modern public domain editions
  { id: 'standard-ebooks', name: 'Standard Ebooks', topic: '', source: 'standard-ebooks' },
  // Ancient and global foundational literature
  { id: 'world-heritage', name: 'World Heritage Texts', topic: '', source: 'world-heritage' },
  // Wikisource crowdsourced multilingual texts
  { id: 'wikisource', name: 'Wikisource Global', topic: '', source: 'wikisource' },
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
  const [loreaMode, setLoreaMode] = useState<'LIBRARY' | 'WRITERS_DESK'>('LIBRARY');
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
        case 'loc':             books = await fetchLibraryOfCongressBooks(searchTerm); break;
        case 'arxiv':           books = await fetchResearchPapers(activeGenre.topic); break;
        case 'ia':              books = await fetchArchiveBooks(activeGenre.topic); break;
        case 'europeana':       books = await fetchEuropeanaBooks(activeGenre.topic || searchTerm); break;
        case 'standard-ebooks': books = await fetchStandardEbooks(activeGenre.topic || searchTerm); break;
        case 'wikisource':      books = await fetchWikisourceBooks(activeGenre.topic || searchTerm || 'philosophy'); break;
        case 'world-heritage':  books = await fetchWorldHeritageBooks(); break;
        default:                books = await fetchClassicBooks(activeGenre.topic);
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
    // Direct providers (LoC, arXiv, Europeana, Standard Ebooks, World Heritage, Wikisource) carry direct file/HTML URLs.
    const isDirect = archiveBook.id.startsWith('loc-') ||
                     archiveBook.id.startsWith('arxiv-') ||
                     archiveBook.id.startsWith('europeana-') ||
                     archiveBook.id.startsWith('se-') ||
                     archiveBook.id.startsWith('heritage-') ||
                     archiveBook.id.startsWith('wiki-');
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

  // Right-click / long-press a book cover — the shared design-system menu.
  const bookMenu = useContextMenu<ArchiveBook>((book) => [
    { kind: 'header', label: book.title },
    { id: 'read', label: 'Read', icon: <BookOpen size={14} />, onSelect: (b) => handleBookSelect(b) },
    { id: 'cite', label: 'Copy citation', onSelect: (b) => { try { navigator.clipboard.writeText(`${b.title} — ${b.authors.join(', ')}`); } catch { /* clipboard blocked */ } } },
  ]);

  // Lorea Landing interactive state (ported from Claude Lorea Landing design)
  const [loreaTheme, setLoreaTheme] = useState<'plajah' | 'dark' | 'pastel'>('plajah');
  const [bookFlipped, setBookFlipped] = useState(false);
  const [isPlayingReadAloud, setIsPlayingReadAloud] = useState(false);
  const [hotWordIdx, setHotWordIdx] = useState<number>(5);
  const [comicMode, setComicMode] = useState<'page' | 'spread' | 'webtoon'>('page');
  const [comicRtl, setComicRtl] = useState(false);
  const [comicPage, setComicPage] = useState(0);
  const [museumLane, setMuseumLane] = useState<'comics' | 'manga' | 'library'>('comics');
  const [turnStyle, setTurnStyle] = useState<'curl' | 'slide' | 'fold' | 'still'>('curl');
  const [turnNote, setTurnNote] = useState('A soft curl, like paper in your hand.');
  const [turnAnimKey, setTurnAnimKey] = useState(0);
  const [showFullGrid, setShowFullGrid] = useState(true);

  const car1Ref = useRef<HTMLDivElement>(null);
  const car2Ref = useRef<HTMLDivElement>(null);
  const car3Ref = useRef<HTMLDivElement>(null);
  const car4Ref = useRef<HTMLDivElement>(null);
  const comicFileInputRef = useRef<HTMLInputElement>(null);

  const HERO_WORDS = ['Once', 'there', 'was', 'a', 'fox', 'who', 'collected', 'the', 'sounds', 'of', 'the', 'moon.'];
  const COMIC_LINES = ['Chapter one', 'Who goes there?', 'The city never sleeps.', 'Meanwhile...', 'It begins.', 'To be continued'];
  const LIVING_BOOKS: Array<{ title: string; subtitle: string; hue: number }> = [
    { title: 'The Fox and the Moon', subtitle: 'Living picture book', hue: 25 },
    { title: 'Little Cloud', subtitle: 'Living picture book', hue: 200 },
    { title: 'Night Garden', subtitle: 'Living picture book', hue: 280 },
    { title: 'The Sleepy Whale', subtitle: 'Living picture book', hue: 190 },
    { title: 'Pip Learns to Fly', subtitle: 'Living picture book', hue: 150 },
    { title: 'Bear and the Stars', subtitle: 'Living picture book', hue: 250 },
  ];
  const MUSEUM_LANES: Record<'comics' | 'manga' | 'library', { k: string; t: string; items: Array<[string, string]> }> = {
    comics: {
      k: 'Internet Archive',
      t: 'Public-domain comics',
      items: [
        ['Golden Age', 'Readable inline'],
        ['Digital Comic Museum', 'Readable inline'],
        ['Comic Book Plus', 'Readable inline'],
        ['Newspaper Strips', 'Readable inline'],
        ['Sci-Fi & Horror', 'Readable inline'],
      ],
    },
    manga: {
      k: 'History and discovery',
      t: 'Manga eras',
      items: [
        ['Post-war Foundations', 'History & titles'],
        ['Shonen Boom', 'History & titles'],
        ['Golden 80s-90s', 'History & titles'],
        ['Modern', 'History & titles'],
      ],
    },
    library: {
      k: 'Open Library',
      t: 'Global open library',
      items: ['Literature', 'Science Fiction', 'Fantasy', 'History', 'Philosophy', 'Science', 'Poetry', 'Mystery', 'Biography', 'Art', 'Children', 'Comics'].map(x => [x, 'Open shelf']),
    },
  };
  const LEGENDS: Array<[string, string]> = [
    ['Jack Kirby', '1940s-1980s'],
    ['Stan Lee', '1960s-2000s'],
    ['Will Eisner', '1930s-2000s'],
    ['Alan Moore', '1980s-'],
    ['Frank Miller', '1980s-'],
    ['Neil Gaiman', '1989-'],
    ['Herge', '1929-1980s'],
    ['Charles Schulz', '1950-2000'],
    ['Osamu Tezuka', '1946-1989'],
    ['Akira Toriyama', '1980s-2020s'],
    ['Naoki Urasawa', '1980s-'],
    ['Rumiko Takahashi', '1978-'],
    ['Katsuhiro Otomo', '1980s-'],
    ['Eiichiro Oda', '1997-'],
    ['Moto Hagio', '1969-'],
    ['Go Nagai', '1967-'],
  ];

  useEffect(() => {
    if (!isPlayingReadAloud) return;
    let idx = 0;
    setHotWordIdx(0);
    const timer = window.setInterval(() => {
      idx += 1;
      if (idx >= HERO_WORDS.length) {
        window.clearInterval(timer);
        setIsPlayingReadAloud(false);
        setHotWordIdx(5);
        return;
      }
      setHotWordIdx(idx);
    }, 380);
    return () => window.clearInterval(timer);
  }, [isPlayingReadAloud]);

  const scrollCarousel = (ref: React.RefObject<HTMLDivElement | null>, dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const handleComicFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    setComicImporting(true);
    setComicImportMsg('Reading…');
    try {
      const album = await importComic(f, (p) =>
        setComicImportMsg(p.phase === 'uploading' ? `Uploading ${p.done}/${p.total}` : p.phase === 'reading' ? 'Reading…' : 'Done')
      );
      onSelectBook(album);
    } catch (err: any) {
      alert(err?.message || 'Import failed');
    } finally {
      setComicImporting(false);
      setComicImportMsg('');
    }
  };

  if (loreaMode === 'WRITERS_DESK') {
    return (
      <div className="flex-1 w-full pb-32 lg:pb-40">
        <WritersDesk onBackToLibrary={() => setLoreaMode('LIBRARY')} onOpenNewsroom={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'JOURNALIST_DESK' } }))} />
      </div>
    );
  }

  const renderComicPageBox = (n: number) => (
    <div key={n} className="cpg" style={{ '--h': n * 57 + 18 } as React.CSSProperties}>
      <i /><i /><i /><i />
      <span>{COMIC_LINES[n]}</span>
      <small>{n + 1}</small>
    </div>
  );

  const spreadStart = comicPage - (comicPage % 2);
  const currentMuseum = MUSEUM_LANES[museumLane];

  return (
    <div
      className="lorea-landing-root flex-1 w-full pb-32 lg:pb-40"
      data-lt={loreaTheme === 'plajah' ? undefined : loreaTheme}
    >
      {bookMenu.node}
      {/* Hidden file input for CBZ/PDF comic imports */}
      <input
        ref={comicFileInputRef}
        type="file"
        accept=".cbz,.zip,.pdf,application/zip,application/pdf"
        className="hidden"
        onChange={handleComicFileImport}
      />

      <style>{`
        .lorea-landing-root {
          --bg:#1a0026; --fg:#ffffff; --sec:#ff8c00; --acc:#d40055; --accfg:#ffffff;
          --card:rgba(107,0,153,.15); --bd:rgba(212,0,85,.25); --dim:rgba(255,255,255,.62);
          --glow:rgba(212,0,85,.28); --page:#f3ead6; --ink:#1b1712;
          --grad:linear-gradient(135deg,#6B0099,#D40055); --rail:rgba(255,255,255,.07); --rail-bd:rgba(255,255,255,.15);
          --cyan:#22d3ee; --violet:#d0bcff; --green:#34d399; --pink:#ff4d8d;
          --f-display:'Outfit','Space Grotesk',sans-serif; --f-body:'Inter','Manrope',sans-serif; --f-mono:'JetBrains Mono',monospace; --f-hand:'Gochi Hand',cursive;
          --lift:transform .8s cubic-bezier(.4,0,.2,1),box-shadow .8s cubic-bezier(.4,0,.2,1);
          background:var(--bg); color:var(--fg); font:16px/1.55 var(--f-body); transition:background .5s,color .5s;
          border-radius:32px;
        }
        .lorea-landing-root[data-lt="dark"]{--bg:#020202;--acc:#ff8c00;--accfg:#1a0d00;--card:rgba(255,255,255,.03);--bd:rgba(255,255,255,.08);--dim:rgba(255,255,255,.55);--glow:rgba(255,140,0,.18)}
        .lorea-landing-root[data-lt="pastel"]{color-scheme:light;--bg:#fdf6e3;--fg:#073642;--sec:#2aa198;--acc:#2aa198;--accfg:#fdf6e3;--card:#eee8d5;--bd:rgba(7,54,66,.14);--dim:rgba(7,54,66,.65);--glow:rgba(42,161,152,.2);--grad:linear-gradient(135deg,#2aa198,#2aa198);--rail:rgba(7,54,66,.06);--rail-bd:rgba(7,54,66,.18)}
        .lorea-landing-root .wrap{max-width:1180px;margin-inline:auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
        .lorea-landing-root .eyebrow{font:700 10px var(--f-display);letter-spacing:.5em;text-transform:uppercase;color:var(--sec)}
        .lorea-landing-root .disp{font-family:var(--f-display);font-weight:900;letter-spacing:-.045em;line-height:.95;text-wrap:balance}
        .lorea-landing-root .glass{background:var(--card);border:1px solid var(--bd);border-radius:28px;backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%)}
        .lorea-landing-root .nav{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-block:22px;flex-wrap:wrap}
        .lorea-landing-root .logo{font:900 22px var(--f-display);letter-spacing:-.04em;display:flex;align-items:center;gap:10px}
        .lorea-landing-root .logo i{width:30px;height:30px;border-radius:10px;background:var(--acc);display:grid;place-items:center;color:var(--accfg)}
        .lorea-landing-root .themes{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
        .lorea-landing-root .themes span{font:500 10px var(--f-mono);letter-spacing:.15em;text-transform:uppercase;color:var(--dim);margin-right:4px}
        .lorea-landing-root .themes button{font:600 11px var(--f-display);letter-spacing:.14em;text-transform:uppercase;color:var(--fg);background:transparent;border:1px solid var(--bd);padding:7px 12px;border-radius:99px;cursor:pointer}
        .lorea-landing-root .themes button[aria-pressed="true"]{background:var(--acc);color:var(--accfg);border-color:var(--acc)}
        .lorea-landing-root .hero{position:relative;display:grid;grid-template-columns:1fr 1.1fr;gap:40px;align-items:center;padding-block:28px 72px;z-index:1}
        .lorea-landing-root .hero>*{min-width:0}
        .lorea-landing-root .hero:before{content:"";position:absolute;inset:-10% -10% auto auto;width:70%;aspect-ratio:1;background:radial-gradient(closest-side,var(--glow),transparent);pointer-events:none;z-index:-1}
        .lorea-landing-root .hero h1{font-size:clamp(46px,7.4vw,104px);margin-top:20px}
        .lorea-landing-root .hero h1 em{font-style:normal;color:var(--acc)}
        .lorea-landing-root .lede{color:var(--dim);font-size:18px;max-width:44ch;margin-top:22px}
        .lorea-landing-root .cta{display:flex;gap:12px;margin-top:30px;flex-wrap:wrap;align-items:center}
        .lorea-landing-root .btn{font:800 12px var(--f-display);letter-spacing:.2em;text-transform:uppercase;text-decoration:none;border-radius:99px;padding:16px 26px;border:1px solid var(--bd);color:var(--fg);background:transparent;cursor:pointer;transition:transform .25s cubic-bezier(.2,0,0,1),box-shadow .25s;display:inline-flex;align-items:center;gap:8px}
        .lorea-landing-root .btn:hover{transform:translateY(-3px)}
        .lorea-landing-root .btn.p{background:var(--acc);border-color:var(--acc);color:var(--accfg);box-shadow:0 10px 30px -8px var(--glow)}
        .lorea-landing-root .hand{font:22px var(--f-hand);color:var(--sec);transform:rotate(-4deg);display:inline-block}
        .lorea-landing-root .stagewrap{perspective:2000px;min-width:0}
        .lorea-landing-root .bookbox{transform:rotateX(12deg) rotateY(-6deg);transform-style:preserve-3d;transition:transform .8s cubic-bezier(.4,0,.2,1)}
        .lorea-landing-root .bookbox:hover{transform:rotateX(6deg) rotateY(-2deg)}
        .lorea-landing-root .bk{position:relative;width:100%;aspect-ratio:1.45/1;transform-style:preserve-3d}
        .lorea-landing-root .base{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;border-radius:8px 18px 18px 8px;background:var(--page);box-shadow:0 50px 80px -24px #000c,0 0 0 7px #2a1a0c,0 0 0 8px rgba(255,255,255,.08);overflow:hidden}
        .lorea-landing-root .pg{padding:8% 8%;color:var(--ink);position:relative;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
        .lorea-landing-root .pg.l{background:linear-gradient(270deg,rgba(0,0,0,.14),transparent 12%)}
        .lorea-landing-root .pg.r{background:linear-gradient(90deg,rgba(0,0,0,.16),transparent 12%)}
        .lorea-landing-root .pg .t{font:600 clamp(13px,1.7vw,20px)/1.5 var(--f-display);letter-spacing:-.01em}
        .lorea-landing-root .pg .n{font:500 10px var(--f-mono);opacity:.5;letter-spacing:.14em}
        .lorea-landing-root .w{border-radius:5px;padding:0 2px;transition:background .15s}
        .lorea-landing-root .w.hot{background:#ffb94d;color:#1b1712}
        .lorea-landing-root .scene{position:absolute;inset:0;overflow:hidden}
        .lorea-landing-root .scene.day{background:#6cc7ee}.lorea-landing-root .scene.night{background:#1c1b47}
        .lorea-landing-root .sun,.lorea-landing-root .moon{position:absolute;width:24%;aspect-ratio:1;border-radius:50%;top:12%;right:14%}
        .lorea-landing-root .sun{background:#ffc93a;animation:lorea-bob 5s ease-in-out infinite}
        .lorea-landing-root .moon{background:#f5f1d0;box-shadow:0 0 40px #f5f1d066;animation:lorea-bob 6s ease-in-out infinite}
        .lorea-landing-root .hill{position:absolute;left:-10%;right:-10%;bottom:-32%;height:64%;border-radius:50%;background:#33b377}
        .lorea-landing-root .night .hill{background:#1f6b53}
        .lorea-landing-root .hill.b{left:34%;bottom:-40%;height:58%;background:#259a63}.lorea-landing-root .night .hill.b{background:#17523f}
        .lorea-landing-root .fox{position:absolute;left:22%;bottom:30%;width:28%;aspect-ratio:1;background:#ff8a3d;border-radius:50% 50% 46% 46%;animation:lorea-hop 2.4s ease-in-out infinite}
        .lorea-landing-root .fox:before,.lorea-landing-root .fox:after{content:"";position:absolute;top:-22%;width:30%;height:40%;background:#ff8a3d;clip-path:polygon(50% 0,0 100%,100% 100%)}
        .lorea-landing-root .fox:before{left:6%}.lorea-landing-root .fox:after{right:6%}
        .lorea-landing-root .star{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;animation:lorea-tw 2.6s ease-in-out infinite}
        @keyframes lorea-bob{50%{transform:translateY(8px)}}
        @keyframes lorea-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-14%)}}
        @keyframes lorea-tw{50%{opacity:.2}}
        .lorea-landing-root .leaf{position:absolute;top:0;right:0;width:50%;height:100%;transform-origin:left center;transition:transform 1.2s cubic-bezier(.5,.05,.2,1);backface-visibility:hidden;overflow:hidden}
        .lorea-landing-root .leaf.front{border-radius:0 18px 18px 0;box-shadow:inset 10px 0 18px -12px #0008}
        .lorea-landing-root .leaf.back{transform:rotateY(180deg);border-radius:18px 0 0 18px;background:var(--page);padding:8%;color:var(--ink);display:flex;flex-direction:column;justify-content:space-between}
        .lorea-landing-root .bk.flip .leaf.front{transform:rotateY(-180deg)}
        .lorea-landing-root .bk.flip .leaf.back{transform:rotateY(0deg)}
        .lorea-landing-root .player{margin-top:34px;display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:99px}
        .lorea-landing-root .playbtn{flex:none;width:46px;height:46px;border-radius:50%;border:0;background:var(--acc);color:var(--accfg);display:grid;place-items:center;cursor:pointer}
        .lorea-landing-root .bars{display:flex;gap:3px;align-items:center;height:26px;flex:none}
        .lorea-landing-root .bars b{width:3px;height:30%;border-radius:2px;background:var(--sec);opacity:.8}
        .lorea-landing-root .playing .bars b{animation:lorea-mb 1s ease-in-out infinite}
        .lorea-landing-root .bars b:nth-child(2n){animation-delay:.2s!important}.lorea-landing-root .bars b:nth-child(3n){animation-delay:.45s!important}
        @keyframes lorea-mb{0%,100%{height:20%}50%{height:100%}}
        .lorea-landing-root .cap{flex:1;min-width:0;font:600 14px/1.35 var(--f-display);color:var(--fg)}
        .lorea-landing-root .cap small{display:block;font:500 10px var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:2px}
        .lorea-landing-root .turnbtn{flex:none;font:700 11px var(--f-display);letter-spacing:.16em;text-transform:uppercase;color:var(--fg);background:transparent;border:1px solid var(--bd);padding:10px 14px;border-radius:99px;cursor:pointer}
        .lorea-landing-root .turnbtn:hover{border-color:var(--acc)}
        .lorea-landing-root section.s{padding-block:72px;border-top:1px solid var(--bd)}
        .lorea-landing-root .s h2{font-size:clamp(32px,5vw,60px);margin-top:14px;max-width:18ch}
        .lorea-landing-root .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}
        .lorea-landing-root .tile{padding:26px;min-width:0;display:flex;flex-direction:column;gap:12px;min-height:230px;transition:var(--lift);cursor:pointer;text-align:left}
        .lorea-landing-root .tile:hover{transform:translateY(-12px) scale(1.02);box-shadow:0 30px 60px -12px rgba(0,0,0,.5);transition:transform .25s cubic-bezier(.2,0,0,1),box-shadow .25s cubic-bezier(.2,0,0,1)}
        .lorea-landing-root .ic{width:46px;height:46px;border-radius:16px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
        .lorea-landing-root .tile h3{font:800 24px var(--f-display);letter-spacing:-.03em}
        .lorea-landing-root .tile p{color:var(--dim);font-size:15px}
        .lorea-landing-root .tile .k{margin-top:auto;font:500 10px var(--f-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--c)}
        .lorea-landing-root .turn{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
        .lorea-landing-root .turn>*{min-width:0}
        .lorea-landing-root .turn p.lede{margin-top:16px}
        .lorea-landing-root .styles{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}
        .lorea-landing-root .styles button{font:700 11px var(--f-display);letter-spacing:.16em;text-transform:uppercase;color:var(--fg);background:transparent;border:1px solid var(--bd);padding:10px 16px;border-radius:99px;cursor:pointer}
        .lorea-landing-root .styles button[aria-pressed="true"]{background:var(--acc);color:var(--accfg);border-color:var(--acc)}
        .lorea-landing-root .demo{padding:28px;border-radius:36px}
        .lorea-landing-root .dstage{position:relative;aspect-ratio:4/3;perspective:1200px;border-radius:14px;overflow:hidden;background:#0000}
        .lorea-landing-root .dpage{position:absolute;inset:0;border-radius:14px;padding:9%;display:flex;flex-direction:column;justify-content:flex-end;font:800 clamp(22px,3.2vw,34px)/1.05 var(--f-display);letter-spacing:-.03em}
        .lorea-landing-root .dpage small{font:500 10px var(--f-mono);letter-spacing:.16em;opacity:.7;margin-bottom:8px}
        .lorea-landing-root .dp1{background:#ffb94d;color:#1b1712}.lorea-landing-root .dp2{background:#6cc7ee;color:#0b1d29;z-index:1;transform-origin:left center}
        .lorea-landing-root .go-curl{animation:lorea-curl 1.1s cubic-bezier(.5,.05,.2,1) both}
        .lorea-landing-root .go-slide{animation:lorea-slide .7s cubic-bezier(.2,0,0,1) both}
        .lorea-landing-root .go-fold{animation:lorea-fold .9s cubic-bezier(.4,0,.2,1) both}
        .lorea-landing-root .go-still{animation:lorea-still .01s both}
        @keyframes lorea-curl{from{transform:rotateY(-110deg);box-shadow:-40px 0 60px #0007}to{transform:rotateY(0)}}
        @keyframes lorea-slide{from{transform:translateX(100%)}to{transform:none}}
        @keyframes lorea-fold{from{transform:rotateY(-90deg) scaleX(.5);filter:brightness(.6)}to{transform:none;filter:none}}
        @keyframes lorea-still{from{opacity:0}to{opacity:1}}
        .lorea-landing-root .dnote{margin-top:16px;color:var(--dim);font-size:14px;min-height:2.6em}
        .lorea-landing-root .two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:44px}
        .lorea-landing-root .two>*{min-width:0}
        .lorea-landing-root .big{padding:36px;border-radius:36px;display:flex;flex-direction:column;gap:14px;min-height:260px;transition:var(--lift);cursor:pointer}
        .lorea-landing-root .big:hover{transform:translateY(-12px) scale(1.02);box-shadow:0 30px 60px -12px rgba(0,0,0,.5);transition:transform .25s cubic-bezier(.2,0,0,1),box-shadow .25s cubic-bezier(.2,0,0,1)}
        .lorea-landing-root .big h3{font:900 clamp(26px,3.4vw,40px)/1 var(--f-display);letter-spacing:-.04em}
        .lorea-landing-root .big p{color:var(--dim);max-width:40ch}
        .lorea-landing-root .big .hand{margin-top:auto;font-size:24px}
        .lorea-landing-root footer.f{padding-block:96px 72px;border-top:1px solid var(--bd);text-align:center}
        .lorea-landing-root footer.f h2{font-size:clamp(38px,7vw,96px);margin-inline:auto;max-width:14ch;margin-top:18px}
        .lorea-landing-root footer.f .cta{justify-content:center}
        .lorea-landing-root .fine{margin-top:48px;font:500 10px var(--f-mono);letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
        .lorea-landing-root .browse{padding-block:56px 40px;border-top:1px solid var(--bd)}
        .lorea-landing-root .bhead{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
        .lorea-landing-root .bhead h2{font-size:clamp(30px,4.4vw,52px);margin-top:12px}
        .lorea-landing-root .search{display:flex;align-items:center;gap:10px;background:var(--rail);border:1px solid var(--rail-bd);border-radius:99px;padding:0 18px;height:46px;min-width:0;width:min(100%,280px)}
        .lorea-landing-root .search svg{width:16px;height:16px;color:var(--dim);flex:none}
        .lorea-landing-root .search input{all:unset;flex:1;min-width:0;font:700 14px var(--f-display);color:var(--fg)}
        .lorea-landing-root .search input::placeholder{color:var(--dim)}
        .lorea-landing-root .rail{display:inline-flex;max-width:100%;gap:3px;padding:5px;margin-top:26px;border-radius:99px;background:var(--rail);border:1px solid var(--rail-bd);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);overflow-x:auto;scrollbar-width:none}
        .lorea-landing-root .rail::-webkit-scrollbar,.lorea-landing-root .pills::-webkit-scrollbar,.lorea-landing-root .car::-webkit-scrollbar{display:none}
        .lorea-landing-root .rail button{flex:none;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 16px;border-radius:99px;border:1px solid transparent;background:transparent;color:var(--fg);font:700 11px var(--f-display);letter-spacing:.05em;opacity:.65;cursor:pointer;transition:opacity .2s,border-color .2s,background .2s}
        .lorea-landing-root .rail button:hover{opacity:1;border-color:var(--sec);background:var(--card)}
        .lorea-landing-root .rail button[aria-selected="true"]{background-image:var(--grad);color:#fff;font-weight:900;opacity:1}
        .lorea-landing-root .pills{display:flex;gap:10px;margin-top:22px;overflow-x:auto;padding-bottom:6px;scroll-behavior:smooth;scrollbar-width:none}
        .lorea-landing-root .pills button{flex:none;padding:14px 26px;border-radius:99px;border:1px solid var(--bd);background:var(--card);color:var(--dim);font:900 10px var(--f-display);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;cursor:pointer;transition:all .25s}
        .lorea-landing-root .pills button:hover{color:var(--fg)}
        .lorea-landing-root .pills button[aria-pressed="true"]{background:var(--acc);border-color:var(--acc);color:var(--accfg);transform:scale(1.05);box-shadow:0 14px 30px -10px var(--glow)}
        .lorea-landing-root .row{margin-top:34px}
        .lorea-landing-root .rowhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .lorea-landing-root .rowhead h3{font:900 clamp(20px,2.4vw,28px) var(--f-display);letter-spacing:-.03em}
        .lorea-landing-root .rowhead small{display:block;font:500 10px var(--f-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--sec);margin-bottom:4px}
        .lorea-landing-root .arrows{display:flex;gap:8px;flex:none}
        .lorea-landing-root .arrows button{width:40px;height:40px;border-radius:50%;border:1px solid var(--bd);background:var(--card);color:var(--fg);display:grid;place-items:center;cursor:pointer}
        .lorea-landing-root .arrows button:hover{border-color:var(--acc)}
        .lorea-landing-root .car{display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:14px 4px 22px;margin-inline:-4px;scrollbar-width:none}
        .lorea-landing-root .bookc{flex:none;width:clamp(150px,19vw,210px);scroll-snap-align:start;cursor:pointer}
        .lorea-landing-root .cover{position:relative;aspect-ratio:2/3;border-radius:2rem;overflow:hidden;padding:16px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 18px 40px -16px #000a;outline:1px solid rgba(255,255,255,.12);transition:transform .5s cubic-bezier(.4,0,.2,1),outline-color .3s;background:linear-gradient(160deg,hsl(var(--h, 210) 60% 38%),hsl(calc(var(--h, 210) + 40) 55% 14%))}
        .lorea-landing-root .bookc:hover .cover{transform:translateY(-8px);outline-color:var(--acc)}
        .lorea-landing-root .cover:before{content:"";position:absolute;inset:0;background:radial-gradient(120% 60% at 20% 0%,rgba(255,255,255,.22),transparent 60%);z-index:1;pointer-events:none}
        .lorea-landing-root .cover b{position:relative;z-index:2;font:900 clamp(18px,2.2vw,26px)/.98 var(--f-display);letter-spacing:-.04em;text-transform:uppercase;color:#fff;text-wrap:balance;text-shadow:0 2px 12px rgba(0,0,0,.65)}
        .lorea-landing-root .cover i{position:relative;z-index:2;font:500 9px var(--f-mono);letter-spacing:.16em;text-transform:uppercase;font-style:normal;color:rgba(255,255,255,.85);text-shadow:0 1px 8px rgba(0,0,0,.75)}
        .lorea-landing-root .cover em{position:absolute;z-index:3;top:12px;right:12px;font:900 8px var(--f-display);letter-spacing:.18em;text-transform:uppercase;font-style:normal;background:rgba(0,0,0,.65);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.16);padding:6px 9px;border-radius:10px;color:#fff;opacity:0;transition:opacity .3s}
        .lorea-landing-root .bookc:hover .cover em{opacity:1}
        .lorea-landing-root .bookc h4{margin:14px 6px 0;font:900 15px var(--f-display);letter-spacing:-.03em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lorea-landing-root .bookc p{margin:2px 6px 0;font:900 9px var(--f-display);letter-spacing:.18em;text-transform:uppercase;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lorea-landing-root .empty{padding:34px;border:1px dashed var(--bd);border-radius:28px;color:var(--dim);flex:1}
        .lorea-landing-root .sample{font:500 10px var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:6px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .lorea-landing-root .cm{display:grid;grid-template-columns:1.05fr 1fr;gap:36px;margin-top:40px;align-items:start}
        .lorea-landing-root .cm>*{min-width:0}
        .lorea-landing-root .rdr{padding:20px;border-radius:36px}
        .lorea-landing-root .rdrbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
        .lorea-landing-root .rdrbar .rail{margin-top:0}
        .lorea-landing-root .dir{font:700 11px var(--f-display);letter-spacing:.1em;text-transform:uppercase;color:var(--fg);background:transparent;border:1px solid var(--rail-bd);border-radius:99px;padding:9px 14px;cursor:pointer}
        .lorea-landing-root .dir[aria-pressed="true"]{border-color:var(--acc);color:var(--sec)}
        .lorea-landing-root .rdrstage{margin-top:16px;border-radius:20px;background:#0b0010;padding:16px;height:min(62vw,430px);display:flex;gap:6px;justify-content:center;align-items:center;overflow:hidden}
        .lorea-landing-root .rdrstage.webtoon{display:block;overflow-y:auto;padding:0 16px;scrollbar-width:thin}
        .lorea-landing-root .rdrstage.webtoon .cpg{margin:0 auto;max-width:260px;aspect-ratio:auto;height:auto;min-height:300px;border-radius:0}
        .lorea-landing-root .cpg{position:relative;height:100%;aspect-ratio:2/3;max-width:50%;background:#f4f0e6;border-radius:6px;padding:7px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1.3fr;gap:5px;color:#111}
        .lorea-landing-root .rdrstage:not(.spread) .cpg{max-width:70%}
        .lorea-landing-root .cpg i{display:block;background:linear-gradient(150deg,hsl(var(--h) 65% 55%),hsl(calc(var(--h) + 50) 60% 28%));border:2px solid #111}
        .lorea-landing-root .cpg i:nth-child(1){grid-column:span 2}
        .lorea-landing-root .cpg span{position:absolute;left:12%;top:40%;max-width:60%;background:#fff;border:2px solid #111;border-radius:14px;padding:4px 8px;font:800 11px/1.2 var(--f-display);transform:rotate(-2deg)}
        .lorea-landing-root .cpg small{position:absolute;bottom:2px;right:8px;font:500 9px var(--f-mono);opacity:.5}
        .lorea-landing-root .rdrfoot{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:14px;font:500 11px var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
        .lorea-landing-root .rdrfoot button{width:40px;height:40px;border-radius:50%;border:1px solid var(--bd);background:var(--card);color:var(--fg);cursor:pointer;display:grid;place-items:center}
        .lorea-landing-root .rdrfoot button:disabled{opacity:.3;cursor:default}
        .lorea-landing-root .note2{color:var(--dim);font-size:15px;margin-top:16px;max-width:52ch}
        .lorea-landing-root .mt{flex:none;width:clamp(190px,22vw,240px);scroll-snap-align:start;padding:20px;border-radius:28px;display:flex;flex-direction:column;gap:8px;min-height:150px;transition:var(--lift);cursor:pointer;text-align:left}
        .lorea-landing-root .mt:hover{transform:translateY(-10px);box-shadow:0 30px 60px -12px rgba(0,0,0,.5)}
        .lorea-landing-root .mt b{font:900 20px/1.05 var(--f-display);letter-spacing:-.03em}
        .lorea-landing-root .mt span{font:500 10px var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
        .lorea-landing-root .mt p{color:var(--dim);font-size:13px;margin-top:auto}
        .lorea-landing-root .lg{width:200px}
        .lorea-landing-root .lg .av{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font:900 16px var(--f-display);color:#fff;background:linear-gradient(135deg,#8B5CF6,#E7B24B)}
        .lorea-landing-root .dgroup{margin-top:36px}
        .lorea-landing-root .dgroup h3{font:700 10px var(--f-display);letter-spacing:.5em;text-transform:uppercase;color:var(--sec);margin-bottom:14px}
        .lorea-landing-root .doors{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
        .lorea-landing-root .door{display:flex;gap:14px;align-items:flex-start;padding:18px;border-radius:24px;text-decoration:none;min-width:0;transition:var(--lift);cursor:pointer;text-align:left;color:var(--fg)}
        .lorea-landing-root .door:hover{transform:translateY(-8px);box-shadow:0 24px 50px -14px rgba(0,0,0,.5);border-color:var(--dc)}
        .lorea-landing-root .door .dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--dc);margin-top:7px}
        .lorea-landing-root .door b{display:block;font:800 17px var(--f-display);letter-spacing:-.02em}
        .lorea-landing-root .door span{display:block;color:var(--dim);font-size:13px;margin-top:2px}
        @media (max-width:860px){
          .lorea-landing-root .cm{grid-template-columns:1fr}
          .lorea-landing-root .hero,.lorea-landing-root .turn,.lorea-landing-root .two{grid-template-columns:1fr}
          .lorea-landing-root .tiles{grid-template-columns:1fr 1fr}
          .lorea-landing-root .player{border-radius:28px;flex-wrap:wrap}
          .lorea-landing-root .bookbox{transform:rotateX(8deg)}
        }
        @media (max-width:560px){.lorea-landing-root .tiles{grid-template-columns:1fr}}
      `}</style>

      <div className="wrap">
        {/* Top Nav + Theme Switcher */}
        <nav className="nav">
          <div className="logo">
            <i><BookOpen size={16} /></i>
            LOREA
          </div>
          <div className="themes" role="group" aria-label="Preview theme">
            <PlajahPlusBanner variant="PILL" />
            <span style={{ marginLeft: 8 }}>Theme</span>
            {(['plajah', 'dark', 'pastel'] as const).map(th => (
              <button
                key={th}
                type="button"
                aria-pressed={loreaTheme === th}
                onClick={() => setLoreaTheme(th)}
              >
                {th === 'plajah' ? 'Plajah' : th === 'dark' ? 'Dark' : 'Pastel'}
              </button>
            ))}
          </div>
        </nav>

        {/* Hero Section: 3D Turning Book + Living Picture Book + Read-Aloud Highlighter */}
        <header className="hero">
          <div>
            <div className="eyebrow">Plajah &middot; Lorea &middot; Books</div>
            <h1 className="disp">
              The library that <em>turns the page</em> for you.
            </h1>
            <p className="lede">
              Picture books that move. Stories that read themselves aloud. Scores you can follow note by note. One reader for all of it, and what you buy is yours.
            </p>
            <div className="cta">
              <a className="btn p" href="#browse">Open the library</a>
              <button
                type="button"
                className="btn"
                onClick={() => (onCreateBook ? onCreateBook() : setLoreaMode('WRITERS_DESK'))}
              >
                Publish a book
              </button>
              <span className="hand">start with the fox &#8599;</span>
            </div>
          </div>

          <div className="stagewrap">
            <div className="bookbox">
              <div className={`bk ${bookFlipped ? 'flip' : ''}`}>
                <div className="base">
                  <div className="pg l">
                    <div className="t">
                      {HERO_WORDS.map((word, idx) => (
                        <React.Fragment key={idx}>
                          <span className={`w ${hotWordIdx === idx ? 'hot' : ''}`}>{word}</span>{' '}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="n">PAGE 14</div>
                  </div>
                  <div className="pg r">
                    <div className="scene night" aria-hidden="true">
                      <div className="moon" />
                      <i className="star" style={{ left: '12%', top: '14%' }} />
                      <i className="star" style={{ left: '30%', top: '28%', animationDelay: '.8s' }} />
                      <i className="star" style={{ left: '58%', top: '10%', animationDelay: '1.4s' }} />
                      <i className="star" style={{ left: '78%', top: '34%', animationDelay: '.3s' }} />
                      <div className="hill" />
                      <div className="hill b" />
                      <div className="fox" />
                    </div>
                  </div>
                </div>
                <div className="leaf front">
                  <div className="scene day" aria-hidden="true">
                    <div className="sun" />
                    <div className="hill" />
                    <div className="hill b" />
                    <div className="fox" />
                  </div>
                </div>
                <div className="leaf back">
                  <div className="t" style={{ font: '600 clamp(13px,1.7vw,20px)/1.5 var(--f-display)' }}>
                    Then every sound let go at once, and the whole sky hummed.
                  </div>
                  <div className="n" style={{ font: '500 10px var(--f-mono)', opacity: 0.5, letterSpacing: '.14em' }}>
                    PAGE 15
                  </div>
                </div>
              </div>
            </div>

            <div className={`glass player ${isPlayingReadAloud ? 'playing' : ''}`}>
              <button
                type="button"
                className="playbtn"
                aria-label="Play read aloud"
                onClick={() => setIsPlayingReadAloud(p => !p)}
              >
                {isPlayingReadAloud ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <div className="bars" aria-hidden="true">
                <b /><b /><b /><b /><b /><b />
              </div>
              <div className="cap">
                <small>Read aloud &middot; Muse voice</small>
                Words light up as they are spoken.
              </div>
              <button
                type="button"
                className="turnbtn"
                onClick={() => setBookFlipped(f => !f)}
              >
                Turn page
              </button>
            </div>
          </div>
        </header>

        {/* Browse Section: Chip Rail + Genre Pills + Live Carousels + Full Live Shelf */}
        <section className="browse" id="browse">
          <div className="bhead">
            <div>
              <div className="eyebrow">Lorea &middot; Browse</div>
              <h2 className="disp">
                {activeTab === 'CLASSICS' ? 'Plajah Lorea Archive' : 'Plajah Lorea'}
              </h2>
            </div>
            <label className="search">
              <Search size={16} />
              <input
                type="text"
                placeholder={`Search ${activeTab === 'CLASSICS' ? 'Archive' : activeTab === 'GLOBAL' ? 'Google Books' : 'Marketplace'}...`}
                aria-label="Search books"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
          </div>

          <div className="rail" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'CLASSICS'}
              onClick={() => setActiveTab('CLASSICS')}
            >
              Classics
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'MARKETPLACE'}
              onClick={() => setActiveTab('MARKETPLACE')}
            >
              <ShoppingCart size={13} /> Marketplace
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'GLOBAL'}
              onClick={() => setActiveTab('GLOBAL')}
            >
              <Globe size={13} /> Global
            </button>
          </div>

          {activeTab === 'CLASSICS' && (
            <div className="pills">
              {GENRES.map(g => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={activeGenre.id === g.id}
                  onClick={() => setActiveGenre(g)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {/* Row 1 Carousel: Live Classics / Marketplace / Global Books */}
          <div className="row">
            <div className="rowhead">
              <div>
                <small>
                  {activeTab === 'CLASSICS'
                    ? 'Public domain'
                    : activeTab === 'MARKETPLACE'
                    ? 'Community uploaded books & originals'
                    : 'Google Books'}
                </small>
                <h3>
                  {activeTab === 'CLASSICS'
                    ? activeGenre.id === 'all'
                      ? 'Open now'
                      : activeGenre.name
                    : activeTab === 'MARKETPLACE'
                    ? 'Fresh from authors'
                    : 'Search the world'}
                </h3>
              </div>
              <div className="arrows">
                <button type="button" onClick={() => scrollCarousel(car1Ref, -1)} aria-label="Scroll left">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => scrollCarousel(car1Ref, 1)} aria-label="Scroll right">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="empty flex items-center justify-center gap-3 py-12">
                <Loader2 className="animate-spin" size={20} />
                <span>Loading live shelf…</span>
              </div>
            ) : activeTab === 'CLASSICS' ? (
              <div className="car" ref={car1Ref}>
                {filteredArchive.length > 0 ? (
                  filteredArchive.slice(0, 18).map((book, idx) => {
                    const hue = (idx * 37 + 150) % 360;
                    return (
                      <div
                        key={book.id}
                        className="bookc"
                        tabIndex={0}
                        onClick={() => handleBookSelect(book)}
                        {...bookMenu.bind(book)}
                      >
                        <div className="cover" style={{ '--h': hue } as React.CSSProperties}>
                          {book.coverImage && (
                            <LazyImage
                              src={book.coverImage}
                              alt={book.title}
                              className="absolute inset-0 w-full h-full object-cover opacity-85"
                              priority={idx < 6}
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <em>Public Domain</em>
                          <b>{book.title}</b>
                          <i>{book.authors.join(', ')}</i>
                        </div>
                        <h4>{book.title}</h4>
                        <p>{book.authors.join(', ')}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty">Nothing matches yet. Try another genre or search.</div>
                )}
              </div>
            ) : activeTab === 'MARKETPLACE' ? (
              <div className="car" ref={car1Ref}>
                {filteredMarketplace.length > 0 ? (
                  filteredMarketplace.map((book, idx) => {
                    const hue = (idx * 47 + 200) % 360;
                    return (
                      <div
                        key={book.id}
                        className="bookc"
                        tabIndex={0}
                        onClick={() => onSelectBook(book)}
                      >
                        <div className="cover" style={{ '--h': hue } as React.CSSProperties}>
                          {book.coverImage && (
                            <LazyImage
                              src={book.coverImage}
                              alt={book.title}
                              className="absolute inset-0 w-full h-full object-cover opacity-85"
                              priority={idx < 6}
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <em>{book.price ? `$${book.price.toFixed(2)}` : 'Original'}</em>
                          <b>{book.title}</b>
                          <i>{book.artist}</i>
                        </div>
                        <h4>{book.title}</h4>
                        <p>{book.artist}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty">No community books match yet. Publish the first one from The Writer&apos;s Desk!</div>
                )}
              </div>
            ) : (
              <div className="car" ref={car1Ref}>
                {(googleBooks.length > 0 ? googleBooks : archiveBooks.slice(0, 12)).map((gBook: any, idx: number) => {
                  const hue = (idx * 41 + 215) % 360;
                  const authors = Array.isArray(gBook.authors) ? gBook.authors.join(', ') : gBook.artist || 'Global Archive';
                  return (
                    <div
                      key={gBook.id}
                      className="bookc"
                      tabIndex={0}
                      onClick={() => {
                        if (gBook.buyLink || gBook.previewLink) {
                          window.open(gBook.buyLink || gBook.previewLink, '_blank');
                        } else {
                          handleBookSelect(gBook);
                        }
                      }}
                    >
                      <div className="cover" style={{ '--h': hue } as React.CSSProperties}>
                        {gBook.coverImage && (
                          <LazyImage
                            src={gBook.coverImage}
                            alt={gBook.title}
                            className="absolute inset-0 w-full h-full object-cover opacity-85"
                            priority={idx < 6}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <em>{gBook.price ? `$${gBook.price.toFixed(2)}` : 'Preview'}</em>
                        <b>{gBook.title}</b>
                        <i>{authors}</i>
                      </div>
                      <h4>{gBook.title}</h4>
                      <p>{authors}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="sample">
              <span>
                {activeTab === 'CLASSICS'
                  ? `${filteredArchive.length} titles in the public-domain archive — click any cover to read`
                  : activeTab === 'MARKETPLACE'
                  ? `${filteredMarketplace.length} community books & originals`
                  : `${googleBooks.length} global Google Books matches`}
              </span>
              <button
                type="button"
                className="turnbtn"
                onClick={() => setShowFullGrid(v => !v)}
              >
                {showFullGrid ? 'Hide full shelf grid' : 'Show full shelf grid'}
              </button>
            </div>
          </div>

          {/* Row 2 Carousel: Read aloud · Living picture books that move */}
          <div className="row">
            <div className="rowhead">
              <div>
                <small>Read aloud &middot; Living</small>
                <h3>Picture books that move</h3>
              </div>
              <div className="arrows">
                <button type="button" onClick={() => scrollCarousel(car2Ref, -1)} aria-label="Scroll left">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => scrollCarousel(car2Ref, 1)} aria-label="Scroll right">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="car" ref={car2Ref}>
              {LIVING_BOOKS.map((lb) => (
                <div
                  key={lb.title}
                  className="bookc"
                  tabIndex={0}
                  onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'KIDS_LIBRARY' } }))}
                >
                  <div className="cover" style={{ '--h': lb.hue } as React.CSSProperties}>
                    <em>Living</em>
                    <b>{lb.title}</b>
                    <i>{lb.subtitle}</i>
                  </div>
                  <h4>{lb.title}</h4>
                  <p>{lb.subtitle}</p>
                </div>
              ))}
            </div>
            <div className="sample">
              <span>Interactive living picture books &middot; opens Kids&apos; Library &amp; Muse narration</span>
            </div>
          </div>

          {/* Full Live Shelf Grid (Preserves full grid browsing for all books) */}
          {showFullGrid && !isLoading && (
            <div className="mt-10 pt-8 border-t border-white/10">
              {activeTab === 'CLASSICS' && filteredArchive.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                  {filteredArchive.map((book, idx) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                      key={book.id}
                      onClick={() => handleBookSelect(book)}
                      {...bookMenu.bind(book)}
                      className="bookc"
                      style={{ width: '100%' }}
                    >
                      <div className="cover" style={{ '--h': (idx * 37 + 150) % 360 } as React.CSSProperties}>
                        {book.coverImage && (
                          <LazyImage
                            src={book.coverImage}
                            alt={book.title}
                            className="absolute inset-0 w-full h-full object-cover opacity-90"
                            priority={idx < 8}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <em>Public Domain</em>
                        <b>{book.title}</b>
                        <i>{book.authors.join(', ')}</i>
                      </div>
                      <h4>{book.title}</h4>
                      <p>{book.authors.join(', ')}</p>
                    </motion.div>
                  ))}
                </div>
              )}

              {activeTab === 'MARKETPLACE' && filteredMarketplace.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                  {filteredMarketplace.map((book, idx) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                      key={book.id}
                      onClick={() => onSelectBook(book)}
                      className="bookc"
                      style={{ width: '100%' }}
                    >
                      <div className="cover" style={{ '--h': (idx * 47 + 200) % 360 } as React.CSSProperties}>
                        {book.coverImage && (
                          <LazyImage
                            src={book.coverImage}
                            alt={book.title}
                            className="absolute inset-0 w-full h-full object-cover opacity-90"
                            priority={idx < 8}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <em>{book.price ? `$${book.price.toFixed(2)}` : 'FREE'}</em>
                        <b>{book.title}</b>
                        <i>{book.artist}</i>
                      </div>
                      <h4>{book.title}</h4>
                      <p onClick={(e) => {
                        e.stopPropagation();
                        if (onVisitUser && book.ownerId) onVisitUser(book.ownerId);
                      }}>
                        {book.artist}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}

              {activeTab === 'GLOBAL' && googleBooks.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                  {googleBooks.map((googleBook, idx) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                      key={googleBook.id}
                      onClick={() => {
                        const urlToOpen = googleBook.buyLink || googleBook.previewLink;
                        if (urlToOpen) window.open(urlToOpen, '_blank');
                      }}
                      className="bookc"
                      style={{ width: '100%' }}
                    >
                      <div className="cover" style={{ '--h': (idx * 41 + 215) % 360 } as React.CSSProperties}>
                        {googleBook.coverImage && (
                          <LazyImage
                            src={googleBook.coverImage}
                            alt={googleBook.title}
                            className="absolute inset-0 w-full h-full object-cover opacity-90"
                            priority={idx < 8}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <em>{googleBook.price ? `$${googleBook.price.toFixed(2)}` : 'Preview'}</em>
                        <b>{googleBook.title}</b>
                        <i>{googleBook.authors.join(', ')}</i>
                      </div>
                      <h4>{googleBook.title}</h4>
                      <p>{googleBook.authors.join(', ')}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Comics & Manga Section: Reader Demo + Museum Lanes + Legends */}
        <section className="s" id="comics">
          <div className="eyebrow">Comics &amp; Manga</div>
          <h2 className="disp">Read it panel by panel. Or walk the museum.</h2>
          <div className="cm">
            <div>
              <div className="glass rdr">
                <div className="rdrbar">
                  <div className="rail" role="tablist" aria-label="Reader mode">
                    {(['page', 'spread', 'webtoon'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={comicMode === m}
                        onClick={() => setComicMode(m)}
                      >
                        {m === 'page' ? 'Page' : m === 'spread' ? 'Spread' : 'Webtoon'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="dir"
                    aria-pressed={comicRtl}
                    onClick={() => setComicRtl(r => !r)}
                  >
                    {comicRtl ? 'Right to left (manga)' : 'Left to right'}
                  </button>
                </div>

                <div className={`rdrstage ${comicMode}`}>
                  {comicMode === 'page' && renderComicPageBox(comicPage)}
                  {comicMode === 'spread' && (
                    comicRtl ? (
                      <>
                        {renderComicPageBox(Math.min(COMIC_LINES.length - 1, spreadStart + 1))}
                        {renderComicPageBox(spreadStart)}
                      </>
                    ) : (
                      <>
                        {renderComicPageBox(spreadStart)}
                        {renderComicPageBox(Math.min(COMIC_LINES.length - 1, spreadStart + 1))}
                      </>
                    )
                  )}
                  {comicMode === 'webtoon' && [0, 1, 2, 3, 4, 5].map(n => renderComicPageBox(n))}
                </div>

                <div className="rdrfoot">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={comicMode === 'webtoon' || (comicMode === 'spread' ? spreadStart <= 0 : comicPage <= 0)}
                    onClick={() => setComicPage(p => Math.max(0, p - (comicMode === 'spread' ? 2 : 1)))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {comicMode === 'page'
                      ? `Page ${comicPage + 1} of ${COMIC_LINES.length}`
                      : comicMode === 'spread'
                      ? `Pages ${spreadStart + 1}-${Math.min(COMIC_LINES.length, spreadStart + 2)} of ${COMIC_LINES.length}`
                      : 'Scroll to read'}
                  </span>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={
                      comicMode === 'webtoon' ||
                      (comicMode === 'spread'
                        ? spreadStart + 2 >= COMIC_LINES.length
                        : comicPage >= COMIC_LINES.length - 1)
                    }
                    onClick={() => setComicPage(p => Math.min(COMIC_LINES.length - 1, p + (comicMode === 'spread' ? 2 : 1)))}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <p className="note2">
                One reader for comics and manga. Read single pages, double-page spreads or a continuous webtoon scroll, zoom in, and switch to right-to-left for manga. Import your own CBZ or PDF and it opens right here.
              </p>
              <div className="cta">
                <button
                  type="button"
                  className="btn p"
                  onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_MUSEUM' } }))}
                >
                  Open the reader
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={comicImporting}
                  onClick={() => comicFileInputRef.current?.click()}
                >
                  {comicImporting ? (comicImportMsg || 'Importing…') : 'Import a comic'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_STUDIO' } }))}
                >
                  Comic Studio
                </button>
              </div>
            </div>

            <div>
              <div className="eyebrow">Comics &amp; Manga Museum</div>
              <p className="note2" style={{ marginTop: 12 }}>
                Public-domain comics you can read inline, manga history and discovery, and a global open library, all in one museum.
              </p>
              <div className="pills" style={{ marginTop: 18 }}>
                {(['comics', 'manga', 'library'] as const).map(lane => (
                  <button
                    key={lane}
                    type="button"
                    aria-pressed={museumLane === lane}
                    onClick={() => setMuseumLane(lane)}
                  >
                    {lane === 'comics' ? 'Comics' : lane === 'manga' ? 'Manga' : 'Global library'}
                  </button>
                ))}
              </div>
              <div className="rowhead" style={{ marginTop: 20 }}>
                <div>
                  <small>{currentMuseum.k}</small>
                  <h3>{currentMuseum.t}</h3>
                </div>
                <div className="arrows">
                  <button type="button" onClick={() => scrollCarousel(car3Ref, -1)} aria-label="Scroll left">
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" onClick={() => scrollCarousel(car3Ref, 1)} aria-label="Scroll right">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="car" ref={car3Ref}>
                {currentMuseum.items.map(([title, sub]) => (
                  <button
                    key={title}
                    type="button"
                    className="glass mt"
                    onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_MUSEUM' } }))}
                  >
                    <span>{currentMuseum.k}</span>
                    <b>{title}</b>
                    <p>{sub}</p>
                  </button>
                ))}
              </div>
              <div className="cta" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn p"
                  onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_MUSEUM' } }))}
                >
                  Enter the museum
                </button>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="rowhead">
              <div>
                <small>Museum &middot; Legends</small>
                <h3>The people who made the medium</h3>
              </div>
              <div className="arrows">
                <button type="button" onClick={() => scrollCarousel(car4Ref, -1)} aria-label="Scroll left">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => scrollCarousel(car4Ref, 1)} aria-label="Scroll right">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="car" ref={car4Ref}>
              {LEGENDS.map(([name, era]) => {
                const ini = name
                  .split(' ')
                  .map(w => w[0])
                  .slice(0, 2)
                  .join('');
                return (
                  <button
                    key={name}
                    type="button"
                    className="glass mt lg"
                    onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_MUSEUM' } }))}
                  >
                    <div className="av">{ini}</div>
                    <b>{name}</b>
                    <span>{era}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Six Ways to Read, One Shelf */}
        <section className="s" id="shelf">
          <div className="eyebrow">One reader</div>
          <h2 className="disp">Six ways to read, one shelf.</h2>
          <div className="tiles">
            <article
              className="glass tile"
              style={{ '--c': 'var(--sec)' } as React.CSSProperties}
              onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'KIDS_LIBRARY' } }))}
            >
              <div className="ic"><Sparkles size={22} /></div>
              <h3>Living picture books</h3>
              <p>Illustrations move with the story, page after page.</p>
              <span className="k">Animated</span>
            </article>
            <article
              className="glass tile"
              style={{ '--c': 'var(--cyan)' } as React.CSSProperties}
              onClick={() => window.dispatchEvent(new CustomEvent('OPEN_AUDIOBOOK_PAVILION'))}
            >
              <div className="ic"><AudioLines size={22} /></div>
              <h3>Read aloud</h3>
              <p>Narration with Muse voices. Every word lights up as it plays.</p>
              <span className="k">Narrated</span>
            </article>
            <article
              className="glass tile"
              style={{ '--c': 'var(--pink)' } as React.CSSProperties}
              onClick={() => window.dispatchEvent(new CustomEvent('OPEN_LOREA_SCORES'))}
            >
              <div className="ic"><Music2 size={22} /></div>
              <h3>Scores</h3>
              <p>Annotated sheet music you can follow, play and sell.</p>
              <span className="k">Sheet music</span>
            </article>
            <article
              className="glass tile"
              style={{ '--c': 'var(--violet)' } as React.CSSProperties}
              onClick={() => window.dispatchEvent(new CustomEvent('OPEN_SACRED_LIBRARY'))}
            >
              <div className="ic"><Landmark size={22} /></div>
              <h3>Sacred Library</h3>
              <p>Pick a faith and open its texts in the same reader.</p>
              <span className="k">By tradition</span>
            </article>
            <article
              className="glass tile"
              style={{ '--c': 'var(--green)' } as React.CSSProperties}
              onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'KIDS_LIBRARY' } }))}
            >
              <div className="ic"><Baby size={22} /></div>
              <h3>Kids&apos; Library</h3>
              <p>A public-domain shelf that is open from the first day.</p>
              <span className="k">Free to start</span>
            </article>
            <article
              className="glass tile"
              style={{ '--c': '#ffc93a' } as React.CSSProperties}
              onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'BOOK_CLUB' } }))}
            >
              <div className="ic"><Users size={22} /></div>
              <h3>Book clubs</h3>
              <p>Read together, page for page, and talk about it there.</p>
              <span className="k">Together</span>
            </article>
          </div>
        </section>

        {/* Page Turn Style Picker */}
        <section className="s" id="turn">
          <div className="turn">
            <div>
              <div className="eyebrow">Your reader, your way</div>
              <h2 className="disp">Pick how pages turn.</h2>
              <p className="lede">
                Some readers like a curl, some like a plain slide. Choose a style and it stays. If your device asks for less motion, your pick still plays.
              </p>
              <div className="styles">
                {([
                  { id: 'curl', label: 'Curl', note: 'A soft curl, like paper in your hand.' },
                  { id: 'slide', label: 'Slide', note: 'A clean slide in from the right.' },
                  { id: 'fold', label: 'Fold', note: 'The page folds over from the spine.' },
                  { id: 'still', label: 'Still', note: 'No motion. The next page appears.' },
                ] as const).map(st => (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={turnStyle === st.id}
                    onClick={() => {
                      setTurnStyle(st.id);
                      setTurnNote(st.note);
                      setTurnAnimKey(k => k + 1);
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="glass demo">
              <div className="dstage">
                <div className="dpage dp1">
                  <small>PAGE 14</small>
                  The jar began to glow.
                </div>
                <div key={turnAnimKey} className={`dpage dp2 go-${turnStyle}`}>
                  <small>PAGE 15</small>
                  Then every sound let go.
                </div>
              </div>
              <p className="dnote">{turnNote}</p>
              <button
                type="button"
                className="btn p"
                style={{ padding: '13px 22px' }}
                onClick={() => setTurnAnimKey(k => k + 1)}
              >
                Try it
              </button>
            </div>
          </div>
        </section>

        {/* For Readers and Authors */}
        <section className="s">
          <div className="eyebrow">For readers and authors</div>
          <h2 className="disp">Buy it once. Publish it once.</h2>
          <div className="two">
            <article
              className="glass big"
              onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'MY_LIBRARY' } }))}
            >
              <h3>You own what you buy.</h3>
              <p>No rentals and no expiry. A book you buy stays on your shelf and opens in the same reader.</p>
              <span className="hand">your shelf, forever</span>
            </article>
            <article
              className="glass big"
              onClick={() => setLoreaMode('WRITERS_DESK')}
            >
              <h3>Authors publish living books.</h3>
              <p>Write, add animation and narration, then upgrade a book into a Tela edition from the same studio.</p>
              <span className="hand">write it, then make it move</span>
            </article>
          </div>
        </section>

        {/* Every Way Into Lorea — Complete Entry-Point Directory */}
        <section className="s" id="doors">
          <div className="eyebrow">Every way into Lorea</div>
          <h2 className="disp">Nothing hidden. Every door, one page.</h2>

          <div className="dgroup">
            <h3>Read</h3>
            <div className="doors">
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#FF8C00' } as React.CSSProperties}
                onClick={() => {
                  setActiveTab('CLASSICS');
                  document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <i className="dot" />
                <div>
                  <b>Classics</b>
                  <span>Public-domain archive, with genre and source filters</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#D40055' } as React.CSSProperties}
                onClick={() => {
                  setActiveTab('MARKETPLACE');
                  document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <i className="dot" />
                <div>
                  <b>Marketplace</b>
                  <span>Community uploaded books and originals</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#22d3ee' } as React.CSSProperties}
                onClick={() => {
                  setActiveTab('GLOBAL');
                  document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <i className="dot" />
                <div>
                  <b>Global</b>
                  <span>Search Google Books, preview or buy</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#34d399' } as React.CSSProperties}
                onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'KIDS_LIBRARY' } }))}
              >
                <i className="dot" />
                <div>
                  <b>Kids Library</b>
                  <span>Public-domain children&apos;s books and learn-to-read tools</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#d4af37' } as React.CSSProperties}
                onClick={() => window.dispatchEvent(new CustomEvent('OPEN_SACRED_LIBRARY'))}
              >
                <i className="dot" />
                <div>
                  <b>Sacred Library</b>
                  <span>Pick a faith and browse its texts</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#8B5CF6' } as React.CSSProperties}
                onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_MUSEUM' } }))}
              >
                <i className="dot" />
                <div>
                  <b>Comics &amp; Manga Museum</b>
                  <span>Public-domain comics, manga history, open library</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#8B5CF6' } as React.CSSProperties}
                onClick={() => document.getElementById('comics')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <i className="dot" />
                <div>
                  <b>Comic &amp; Manga Reader</b>
                  <span>Page, spread and webtoon, with right-to-left</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#22d3ee' } as React.CSSProperties}
                onClick={() => window.dispatchEvent(new CustomEvent('OPEN_AUDIOBOOK_PAVILION'))}
              >
                <i className="dot" />
                <div>
                  <b>Audiobooks</b>
                  <span>Narrated books and the audiobook pavilion</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#d0bcff' } as React.CSSProperties}
                onClick={() => window.dispatchEvent(new CustomEvent('OPEN_LOREA_SCORES'))}
              >
                <i className="dot" />
                <div>
                  <b>Scores</b>
                  <span>Your saved sheet music, with MusicXML download</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#FF8C00' } as React.CSSProperties}
                onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'MY_LIBRARY' } }))}
              >
                <i className="dot" />
                <div>
                  <b>My Library</b>
                  <span>Everything you own, in one shelf</span>
                </div>
              </button>
            </div>
          </div>

          <div className="dgroup">
            <h3>Make</h3>
            <div className="doors">
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#06b6d4' } as React.CSSProperties}
                onClick={() => setLoreaMode('WRITERS_DESK')}
              >
                <i className="dot" />
                <div>
                  <b>The Writer&apos;s Desk</b>
                  <span>Outlines, research and submissions, plus the newsroom</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#FF8C00' } as React.CSSProperties}
                onClick={() => (onCreateBook ? onCreateBook() : setLoreaMode('WRITERS_DESK'))}
              >
                <i className="dot" />
                <div>
                  <b>Create a Book</b>
                  <span>Book Authoring Studio</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#6366f1' } as React.CSSProperties}
                onClick={() => (onCreateScript ? onCreateScript() : setLoreaMode('WRITERS_DESK'))}
              >
                <i className="dot" />
                <div>
                  <b>Write a Script</b>
                  <span>Script Writing Studio for film and TV</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#8B5CF6' } as React.CSSProperties}
                onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'COMIC_STUDIO' } }))}
              >
                <i className="dot" />
                <div>
                  <b>Comic Studio</b>
                  <span>Build comics and manga panel by panel</span>
                </div>
              </button>
              <button
                type="button"
                className="glass door"
                style={{ '--dc': '#8B5CF6' } as React.CSSProperties}
                onClick={() => comicFileInputRef.current?.click()}
              >
                <i className="dot" />
                <div>
                  <b>Import a Comic</b>
                  <span>Bring in a CBZ or PDF and open it in the reader</span>
                </div>
              </button>
            </div>
          </div>

          <div className="dgroup">
            <h3>Plajah</h3>
            <div className="doors">
              <div className="glass door" style={{ '--dc': '#D40055' } as React.CSSProperties}>
                <i className="dot" />
                <div className="flex-1">
                  <b>Plajah+</b>
                  <span className="mb-2">Member perks across the platform</span>
                  <PlajahPlusBanner variant="PILL" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="f">
          <div className="eyebrow">Plajah Lorea</div>
          <h2 className="disp">Take a seat. Open a book.</h2>
          <div className="cta">
            <a className="btn p" href="#browse">Start reading</a>
            <button
              type="button"
              className="btn"
              onClick={() => (onCreateBook ? onCreateBook() : setLoreaMode('WRITERS_DESK'))}
            >
              Start a book
            </button>
          </div>
          <div className="fine">Early access &middot; Part of Plajah</div>
        </footer>
      </div>
    </div>
  );
};

export default BookTab;
