import React, { useState, useEffect } from 'react';
import { Book, Album } from '../types';
import PageHeader from './PageHeader';
import { fetchClassicBooks, fetchArchiveBooks, ArchiveBook, getArchiveItemFiles } from '../services/archiveContentService';
import { searchGoogleBooks, GoogleBook } from '../services/googleBooksService';
import { fetchAllPublicAlbums, syncPublicDomainAsset } from '../services/backendService';
import { BookOpen, Search, Filter, Star, Clock, ChevronRight, Bookmark, Download, Loader2, Library as LibraryIcon, ShoppingCart, User as UserIcon, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BookTabProps {
  onSelectBook: (book: any) => void;
  onVisitUser?: (uid: string, tab?: string) => void;
}

const GENRES = [
  { id: 'all', name: 'All Classics', topic: '' },
  { id: 'loc', name: 'Library of Congress', topic: 'collection:library_of_congress' },
  { id: 'fiction', name: 'Fiction', topic: 'fiction' },
  { id: 'mystery', name: 'Mystery', topic: 'mystery' },
  { id: 'sci-fi', name: 'Sci-Fi', topic: 'science fiction' },
  { id: 'fantasy', name: 'Fantasy', topic: 'fantasy' },
  { id: 'art', name: 'Museum & Art', topic: 'collection:metropolitanmuseumofart-gallery' },
  { id: 'history', name: 'History', topic: 'history' },
];

const BookTab: React.FC<BookTabProps> = ({ onSelectBook, onVisitUser }) => {
  const [activeTab, setActiveTab] = useState<'MARKETPLACE' | 'CLASSICS' | 'GLOBAL'>('GLOBAL');
  const [archiveBooks, setArchiveBooks] = useState<ArchiveBook[]>([]);
  const [marketplaceBooks, setMarketplaceBooks] = useState<Album[]>([]);
  const [googleBooks, setGoogleBooks] = useState<GoogleBook[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGenre, setActiveGenre] = useState(GENRES[0]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'CLASSICS') {
      loadClassicBooks();
    } else if (activeTab === 'MARKETPLACE') {
      loadMarketplaceBooks();
    } else if (activeTab === 'GLOBAL') {
      // Load initial lists if empty
      if (archiveBooks.length === 0) {
        fetchClassicBooks('').then(books => setArchiveBooks(books));
      }
      if (marketplaceBooks.length === 0) {
        fetchAllPublicAlbums().then(albums => setMarketplaceBooks(albums.filter(a => a.type === 'BOOK')));
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

  const loadGoogleBooks = async () => {
    setIsLoading(true);
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
    setIsLoading(true);
    try {
      const allBooks = await fetchAllPublicAlbums();
      setMarketplaceBooks(allBooks.filter(a => a.type === 'BOOK'));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClassicBooks = async () => {
    setIsLoading(true);
    let books: ArchiveBook[] = [];
    if (activeGenre.id === 'loc' || activeGenre.id === 'art') {
      books = await fetchArchiveBooks(activeGenre.topic);
    } else {
      books = await fetchClassicBooks(activeGenre.topic);
    }
    setArchiveBooks(books);
    setIsLoading(false);
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
    const isIA = !archiveBook.id.match(/^\d+$/); // Gutendex IDs are numeric strings
    
    let bookChapters = [];
    
    if (isIA) {
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
        // Fallback to Embed for more reliable loading
        bookChapters = [{
          id: 'full-book',
          title: 'Full Publication',
          url: `https://archive.org/embed/${archiveBook.id}`
        }];
      }
    } else {
      // Prioritize EPUB format for better reading experience, fallback to text
      const epubUrl = archiveBook.formats['application/epub+zip'] || Object.values(archiveBook.formats).find(f => f.includes('epub'));
      const textUrl = archiveBook.formats['text/plain; charset=utf-8'] || archiveBook.formats['text/plain'] || Object.values(archiveBook.formats).find(f => f.includes('text/plain'));
      
      const formatUrl = epubUrl || textUrl || '';
      
      bookChapters = [
        {
          id: 'full-text',
          title: 'Complete Work',
          url: formatUrl
        }
      ];
    }
    
    const transformedBook: Album = {
      id: isIA ? `archive-${archiveBook.id}` : `guttenberg-${archiveBook.id}`,
      title: archiveBook.title,
      artist: archiveBook.authors.join(', '),
      coverImage: archiveBook.coverImage || '',
      type: 'BOOK',
      subType: isIA ? 'GRAPHIC_NOVEL' : 'NOVEL',
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
    <div className="flex-1 p-6 lg:p-12 max-w-7xl mx-auto w-full pb-32 lg:pb-40">
      <header className="mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
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
            {activeTab === 'CLASSICS' ? 'Classic Literature & Public Domain Works' : 'Community Uploaded Books & Originals'}
          </p>
        </div>
        
        <div className="flex flex-col gap-4 items-end">
          <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
            <button
              onClick={() => setActiveTab('CLASSICS')}
              className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'CLASSICS' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              Classics
            </button>
            <button
              onClick={() => setActiveTab('MARKETPLACE')}
              className={`px-6 py-2 rounded-full text-[10px] flex items-center gap-2 font-black uppercase tracking-widest transition-all ${
                activeTab === 'MARKETPLACE' ? 'bg-small-orange text-white' : 'text-white/50 hover:text-white'
              }`}
            >
              <ShoppingCart size={14} /> Marketplace
            </button>
            <button
              onClick={() => setActiveTab('GLOBAL')}
              className={`px-6 py-2 rounded-full text-[10px] flex items-center gap-2 font-black uppercase tracking-widest transition-all ${
                activeTab === 'GLOBAL' ? 'bg-blue-500 text-white' : 'text-white/50 hover:text-white'
              }`}
            >
              <Globe size={14} /> Global Search
            </button>
          </div>
          <div className="relative group w-full lg:w-auto">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-small-orange transition-all" size={20} />
            <input 
              type="text" 
              placeholder={`Search ${activeTab === 'CLASSICS' ? 'Archive' : activeTab === 'GLOBAL' ? 'Google Books' : 'Marketplace'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-full py-4 pl-16 pr-8 text-sm font-bold outline-none focus:border-small-orange/50 focus:ring-4 ring-small-orange/10 transition-all w-full lg:w-80 font-display"
            />
          </div>
        </div>
      </header>

      {/* Genre Sidebar / Menu - Only in Classics */}
      {activeTab === 'CLASSICS' && (
        <div className="flex gap-4 mb-16 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-10">
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
                <img 
                  src={book.coverImage || null} 
                  alt={book.title}
                  className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-8 gap-4 backdrop-blur-[2px]">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-10">
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
                    <img 
                      src={googleBook.coverImage || null} 
                      alt={googleBook.title}
                      className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-8 gap-4 backdrop-blur-[2px]">
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
                          <img 
                            src={book.coverImage || null} 
                            alt={book.title}
                            className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
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
                          <img 
                            src={book.coverImage || null} 
                            alt={book.title}
                            className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
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
                          <img 
                            src={googleBook.coverImage || null} 
                            alt={googleBook.title}
                            className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-10">
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
                <img 
                  src={book.coverImage || null} 
                  alt={book.title}
                  className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ease-out"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.src = "https://images.unsplash.com/photo-1543005124-8198f5ab5572?auto=format&fit=crop&q=80";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-8 gap-4 backdrop-blur-[2px]">
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
