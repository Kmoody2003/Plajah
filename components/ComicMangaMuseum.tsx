import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Search, BookOpen, Landmark, Library as LibraryIcon, ExternalLink, Loader2, Sparkles, Clock, X } from 'lucide-react';
import type { Album } from '../types';
import { fetchArchiveComics, fetchAnilistManga, resolveArchiveReadableUrl, COMIC_COLLECTIONS, MANGA_ERAS, COMIC_LEGENDS, MANGA_LEGENDS, COMICS_HISTORY, MANGA_HISTORY, type MangaEntry, type Legend, type HistoryEra } from '../services/comicsMangaService';
import { searchOpenLibrary, openLibrarySubject, OPEN_LIBRARY_SHELVES } from '../services/openLibraryService';
import type { ArchiveBook } from '../services/archiveContentService';
import { comicToShowcaseStudioBook, studioBookToLoreaAlbum } from '../services/comic/comicStudioBridge';

// The comic + manga digital museum & history — synthesizes free/open sources:
// readable PUBLIC-DOMAIN comics (Internet Archive), manga history/metadata (AniList),
// and a global open library (Open Library). Public-domain works read inline; manga
// (no legal free scans) is an honest history/metadata/discovery experience.

const V = '#8B5CF6';
const GOLD = '#E7B24B';

// Build a readable Album from a public-domain ArchiveBook (opens in the comic/PDF reader).
const toReadable = (b: ArchiveBook): Album => ({
  id: b.id, title: b.title, artist: b.authors.join(', '), coverImage: b.coverImage || '',
  type: 'BOOK', subType: 'GRAPHIC_NOVEL', genre: b.genre, description: b.subjects.join(', '),
  ownerId: 'system', createdAt: Date.now(), themeColor: V, tracks: [],
  bookChapters: [{ id: b.id, title: b.title, url: b.formats['application/pdf'] || b.formats['text/html'], format: b.formats['application/pdf'] ? 'PDF' : 'HTML' }],
} as any);

// ── Museum: legendary creators + history ──────────────────────────────────────
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

const _wikiBioCache = new Map<string, Promise<{ thumb: string; extract: string }>>();
const fetchLegendWiki = (slug: string): Promise<{ thumb: string; extract: string }> => {
  if (!slug) return Promise.resolve({ thumb: '', extract: '' });
  if (!_wikiBioCache.has(slug)) {
    _wikiBioCache.set(
      slug,
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => ({
          thumb: d?.originalimage?.source || d?.thumbnail?.source || '',
          extract: d?.extract || '',
        }))
        .catch(() => ({ thumb: '', extract: '' }))
    );
  }
  return _wikiBioCache.get(slug)!;
};

const LegendCard: React.FC<{ l: Legend; onSelect: (l: Legend) => void }> = ({ l, onSelect }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [wikiThumb, setWikiThumb] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (l.wikiSlug) {
      fetchLegendWiki(l.wikiSlug).then(res => {
        if (active && res.thumb) setWikiThumb(res.thumb);
      });
    }
    return () => { active = false; };
  }, [l.wikiSlug]);

  const portraitSrc = !imgFailed ? (l.portraitUrl || wikiThumb) : wikiThumb;

  return (
    <button
      type="button"
      onClick={() => onSelect(l)}
      className="shrink-0 w-72 text-left rounded-3xl bg-white/[0.03] border border-white/10 hover:border-amber-400/50 hover:bg-white/[0.06] transition-all overflow-hidden group flex flex-col shadow-xl cursor-pointer"
    >
      {/* Portrait Header */}
      <div className="relative h-48 w-full overflow-hidden bg-gradient-to-b from-white/10 to-black/70">
        {portraitSrc ? (
          <img
            src={portraitSrc}
            alt={l.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-black text-white text-3xl"
            style={{ background: `linear-gradient(135deg, ${l.color}, ${l.color}55)` }}
          >
            {initials(l.name)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b16] via-[#0e0b16]/35 to-transparent" />
        <span
          className="absolute top-3 right-3 text-[8.5px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full backdrop-blur-md border border-white/15 text-white"
          style={{ background: `${l.color}cc` }}
        >
          {l.role}
        </span>
        {l.years && (
          <span className="absolute top-3 left-3 text-[8.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/65 border border-white/10 text-white/80 backdrop-blur-md">
            {l.years}
          </span>
        )}
        <div className="absolute bottom-3 left-4 right-4">
          <h4 className="text-base font-black uppercase tracking-tight text-white drop-shadow">{l.name}</h4>
          <p className="text-[9px] font-black uppercase tracking-widest mt-0.5" style={{ color: l.color }}>
            {[l.nationality, l.era].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* Bio & Works Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <p className="text-[9.5px] font-black uppercase tracking-widest text-amber-300/90 mb-2 leading-snug">
            {l.knownFor}
          </p>
          <p className="text-[11.5px] text-white/65 leading-relaxed line-clamp-3">
            {l.legacy}
          </p>
        </div>
        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-white/50 group-hover:text-amber-300 transition-colors">
          <span>Read Full Biography</span>
          <span>→</span>
        </div>
      </div>
    </button>
  );
};

const LegendsSection: React.FC<{ title: string; note: string; legends: Legend[]; onSelect: (l: Legend) => void }> = ({ title, note, legends, onSelect }) => (
  <section className="mb-12 mt-2">
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-3">
        <Sparkles size={15} style={{ color: GOLD }} />
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">{title}</h3>
        <span className="text-[10px] text-white/40 hidden sm:inline">{note}</span>
      </div>
      <span className="text-[9.5px] font-mono uppercase tracking-widest text-amber-300/75">
        Click any legend for full biography &amp; archival portrait
      </span>
    </div>
    <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
      {legends.map(l => <LegendCard key={l.name} l={l} onSelect={onSelect} />)}
    </div>
  </section>
);

const HistorySection: React.FC<{ title: string; eras: HistoryEra[]; allLegends: Legend[]; onSelectLegend: (l: Legend) => void }> = ({ title, eras, allLegends, onSelectLegend }) => (
  <section className="mb-12">
    <div className="flex items-center gap-3 mb-6">
      <Landmark size={15} style={{ color: GOLD }} />
      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">{title}</h3>
    </div>
    <div className="relative pl-6 space-y-8 border-l border-white/15 ml-1">
      {eras.map((e, i) => {
        const eraLegends = (e.keyFigures || [])
          .map(name => allLegends.find(l => l.name.toLowerCase() === name.toLowerCase()))
          .filter((l): l is Legend => !!l);
        return (
          <div key={i} className="relative p-5 rounded-2xl bg-white/[0.025] border border-white/8 hover:border-white/15 transition-all">
            <div className="absolute -left-[2.05rem] top-6 w-3.5 h-3.5 rounded-full" style={{ background: GOLD, boxShadow: '0 0 0 4px rgba(231,178,75,0.18)' }} />
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: GOLD }}>{e.period}</p>
              {e.milestoneWorks && e.milestoneWorks.map(w => (
                <span key={w} className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">
                  {w}
                </span>
              ))}
            </div>
            <h4 className="text-base font-black uppercase tracking-tight text-white mt-1 mb-1.5">{e.title}</h4>
            <p className="text-[12.5px] text-white/65 leading-relaxed max-w-3xl">{e.blurb}</p>
            {eraLegends.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3.5 pt-3 border-t border-white/8">
                <span className="text-[9px] font-mono uppercase tracking-widest text-white/40 mr-1">Era Pioneers:</span>
                {eraLegends.map(leg => (
                  <button
                    key={leg.name}
                    type="button"
                    onClick={() => onSelectLegend(leg)}
                    className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/5 hover:bg-white/12 border border-white/10 hover:border-amber-400/50 transition-all cursor-pointer"
                  >
                    <img
                      src={leg.portraitUrl}
                      alt={leg.name}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-full object-cover object-top border border-white/20"
                    />
                    <span className="text-[10px] font-bold text-white">{leg.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </section>
);

const BookCard: React.FC<{ b: ArchiveBook; onOpen: () => void }> = ({ b, onOpen }) => (
  <button onClick={onOpen} className="shrink-0 w-32 text-left group">
    <div className="w-32 h-44 rounded-lg overflow-hidden bg-white/5 border border-white/10 group-hover:border-violet-400/60 transition-colors shadow-lg">
      {b.coverImage ? <img src={b.coverImage} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full grid place-items-center"><BookOpen size={22} className="text-white/15" /></div>}
    </div>
    <p className="text-[11px] font-bold text-white/80 mt-1.5 leading-tight line-clamp-2">{b.title}</p>
    <p className="text-[9px] text-white/35 truncate">{b.authors[0]}</p>
  </button>
);

const Row: React.FC<{ label: string; note?: string; load: () => Promise<ArchiveBook[]>; onOpen: (b: ArchiveBook) => void }> = ({ label, note, load, onOpen }) => {
  const [items, setItems] = useState<ArchiveBook[] | null>(null);
  useEffect(() => { let on = true; load().then(r => on && setItems(r)); return () => { on = false; }; }, []); // eslint-disable-line
  if (items && !items.length) return null;
  return (
    <div className="mb-7">
      <div className="flex items-baseline gap-2 mb-2.5">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">{label}</h3>
        {note && <span className="text-[10px] text-white/35">{note}</span>}
      </div>
      {!items ? <div className="h-44 flex items-center text-white/30"><Loader2 size={16} className="animate-spin" /></div>
        : <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">{items.map(b => <BookCard key={b.id} b={b} onOpen={() => onOpen(b)} />)}</div>}
    </div>
  );
};

const MangaCard: React.FC<{ m: MangaEntry }> = ({ m }) => (
  <a href={m.siteUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 w-36 group">
    <div className="w-36 h-52 rounded-lg overflow-hidden bg-white/5 border border-white/10 group-hover:border-violet-400/60 transition-colors shadow-lg relative">
      {m.coverImage && <img src={m.coverImage} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />}
      <span className="absolute top-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded bg-black/70 text-white">{m.country || 'JP'}</span>
    </div>
    <p className="text-[11px] font-bold text-white/80 mt-1.5 leading-tight line-clamp-2">{m.title}</p>
    <p className="text-[9px] text-white/35">{m.year || '—'}{m.staff[0] ? ` · ${m.staff[0]}` : ''}</p>
  </a>
);

const MangaRow: React.FC<{ label: string; note?: string; load: () => Promise<MangaEntry[]> }> = ({ label, note, load }) => {
  const [items, setItems] = useState<MangaEntry[] | null>(null);
  useEffect(() => { let on = true; load().then(r => on && setItems(r)); return () => { on = false; }; }, []); // eslint-disable-line
  if (items && !items.length) return null;
  return (
    <div className="mb-7">
      <div className="flex items-baseline gap-2 mb-2.5"><h3 className="text-sm font-black uppercase tracking-widest text-white">{label}</h3>{note && <span className="text-[10px]" style={{ color: GOLD }}>{note}</span>}</div>
      {!items ? <div className="h-52 flex items-center text-white/30"><Loader2 size={16} className="animate-spin" /></div>
        : <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">{items.map(m => <MangaCard key={m.id} m={m} />)}</div>}
    </div>
  );
};

const ComicMangaMuseum: React.FC<{ onBack: () => void; onSelectBook: (a: Album) => void }> = ({ onBack, onSelectBook }) => {
  const [tab, setTab] = useState<'comics' | 'manga' | 'library'>('comics');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ArchiveBook[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [selectedLegend, setSelectedLegend] = useState<Legend | null>(null);
  const [legendWikiExtract, setLegendWikiExtract] = useState<string>('');
  const [legendWikiThumb, setLegendWikiThumb] = useState<string>('');

  useEffect(() => {
    let active = true;
    setLegendWikiExtract('');
    setLegendWikiThumb('');
    if (selectedLegend?.wikiSlug) {
      fetchLegendWiki(selectedLegend.wikiSlug).then(res => {
        if (active) {
          setLegendWikiExtract(res.extract);
          setLegendWikiThumb(res.thumb);
        }
      });
    }
    return () => { active = false; };
  }, [selectedLegend]);

  // Resolve the item's REAL readable file (the guessed <id>.pdf usually 404s) before
  // handing the reader a live URL. Falls back to the guess if metadata has no PDF.
  const openComic = async (b: ArchiveBook) => {
    setOpening(true);
    try {
      const album = toReadable(b);
      // Prefer native page-image reading: our server caches archive.org's JP2 scans as
      // web JPEGs and serves them page-by-page (reliable, unlike archive's live IIIF).
      let native = false;
      try {
        const r = await fetch(`/api/comics/pages/${encodeURIComponent(b.id)}`);
        if (r.ok) {
          const { count } = await r.json();
          if (count > 0 && (album as any).bookChapters?.[0]) {
            (album as any).bookChapters[0] = {
              ...(album as any).bookChapters[0],
              url: '', format: 'IMAGES',
              pages: Array.from({ length: count }, (_, n) => ({ url: `/api/comics/page/${encodeURIComponent(b.id)}/${n}` })),
            };
            native = true;
          }
        }
      } catch { /* fall through to the PDF path */ }
      // Fallback: the item has no scanned JP2 pages — hand the reader its real PDF/HTML.
      if (!native) {
        const realUrl = await resolveArchiveReadableUrl(b.id);
        if (realUrl && (album as any).bookChapters?.[0]) {
          (album as any).bookChapters[0] = { ...(album as any).bookChapters[0], url: realUrl, format: 'PDF' };
        }
      }
      onSelectBook(album);
    } finally {
      setOpening(false);
    }
  };

  const runSearch = async () => {
    if (!q.trim()) { setResults(null); return; }
    setSearching(true);
    setResults(await searchOpenLibrary(q, 24));
    setSearching(false);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-hide plajah-ambient-surface" style={{ background: 'linear-gradient(180deg,#120e1c,#0a0a0f)' }}>
      {opening && (
        <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <Loader2 className="animate-spin text-small-orange" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Opening comic…</p>
        </div>
      )}

      {/* Legend Portrait & Biography Dossier Modal */}
      <AnimatePresence>
        {selectedLegend && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[420] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setSelectedLegend(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-2xl rounded-3xl overflow-hidden border border-white/15 bg-[#120d1d] shadow-2xl max-h-[88vh] overflow-y-auto scrollbar-hide"
            >
              <button
                type="button"
                onClick={() => setSelectedLegend(null)}
                className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/60 border border-white/15 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-12">
                <div className="sm:col-span-5 relative min-h-[260px] bg-gradient-to-b from-white/10 to-black/70">
                  <img
                    src={selectedLegend.portraitUrl || legendWikiThumb}
                    alt={selectedLegend.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#120d1d] via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-[#120d1d]" />
                </div>

                <div className="sm:col-span-7 p-6 sm:p-7 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full text-white"
                        style={{ background: selectedLegend.color }}
                      >
                        {selectedLegend.field} {selectedLegend.role}
                      </span>
                      {selectedLegend.years && (
                        <span className="text-[9px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-white/75">
                          {selectedLegend.years}
                        </span>
                      )}
                      {selectedLegend.nationality && (
                        <span className="text-[9px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-white/75">
                          {selectedLegend.nationality}
                        </span>
                      )}
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                      {selectedLegend.name}
                    </h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] mt-1" style={{ color: GOLD }}>
                      Active Era: {selectedLegend.era}
                    </p>

                    <div className="mt-4 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-amber-300/80 mb-1">
                        Signature Masterworks
                      </p>
                      <p className="text-xs font-bold text-white/90 leading-snug">
                        {selectedLegend.knownFor}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2.5 text-xs text-white/75 leading-relaxed">
                      <p className="font-semibold text-white/90">{selectedLegend.legacy}</p>
                      <p>{selectedLegend.bio}</p>
                      {legendWikiExtract && legendWikiExtract !== selectedLegend.bio && (
                        <p className="text-[11px] text-white/55 pt-2 border-t border-white/10">
                          {legendWikiExtract}
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedLegend.wikiSlug && (
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-white/35">
                        Lorea Archival Creator Dossier
                      </span>
                      <a
                        href={`https://en.wikipedia.org/wiki/${selectedLegend.wikiSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-300 hover:underline"
                      >
                        Wikipedia Archive <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <div className="relative px-6 lg:px-12 pt-6 pb-4 border-b border-white/8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white text-[11px] font-bold uppercase tracking-widest mb-4"><ChevronLeft size={16} /> Lorea</button>
        <div className="flex items-center gap-3">
          <Landmark size={26} style={{ color: GOLD }} />
          <div>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-white">Comics & Manga Museum</h1>
            <p className="text-[11px] text-white/45">Read public-domain comics · explore a century of manga history · search the world's open library</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-5 p-1 bg-white/5 rounded-full w-fit border border-white/10">
          {([['comics', 'Comics', BookOpen], ['manga', 'Manga History', Clock], ['library', 'Global Library', LibraryIcon]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${tab === k ? 'text-white' : 'text-white/45 hover:text-white'}`} style={tab === k ? { background: V } : undefined}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 lg:px-12 py-6 max-w-6xl mx-auto">
        {tab === 'comics' && (
          <>
            <div className="flex items-center gap-2 mb-5 text-[11px] text-white/40"><Sparkles size={13} style={{ color: GOLD }} /> Golden & Silver Age comics in the public domain — free to read, preserved from the Internet Archive.</div>

            {/* Featured Original Graphic Novels & Manga */}
            <div className="mb-9">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-pulse" />
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Plajah Story Council Originals</h3>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">
                    20-Page Full Editions · On-Device Production
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. The Obsidian Shroud */}
                <div
                  onClick={() => {
                    const book = comicToShowcaseStudioBook('obsidian-shroud');
                    onSelectBook(studioBookToLoreaAlbum(book));
                  }}
                  className="group relative rounded-2xl bg-white/[0.04] border border-white/10 hover:border-orange-500/60 p-4 cursor-pointer transition-all duration-200 flex gap-4 items-center shadow-lg hover:bg-white/[0.06]"
                >
                  <div className="w-24 h-32 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10 group-hover:scale-105 transition-transform duration-300">
                    <img src="/generated/comics/obsidian_full/p1_pan1.png" alt="The Obsidian Shroud" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-orange-400">Cyber-Gothic Dark Noir</span>
                    <h4 className="text-sm font-black text-white group-hover:text-orange-300 transition-colors truncate mt-0.5">THE OBSIDIAN SHROUD</h4>
                    <p className="text-[10px] text-white/40 mt-1 line-clamp-2 leading-relaxed">
                      Detective Silas Vane in the flooded gutters of Old Neo-Babel. Frank Miller & Mike Mignola lens.
                    </p>
                    <div className="flex items-center gap-2 mt-2.5 text-[9px] text-white/50 font-bold">
                      <span className="px-2 py-0.5 rounded bg-black/60 border border-white/10">20 Pages</span>
                      <span className="px-2 py-0.5 rounded bg-black/60 border border-white/10">35 Panels</span>
                      <span className="text-orange-400 ml-auto flex items-center gap-1 group-hover:underline">Read Now →</span>
                    </div>
                  </div>
                </div>

                {/* 2. Chrome Apostle */}
                <div
                  onClick={() => {
                    const book = comicToShowcaseStudioBook('chrome-apostle');
                    onSelectBook(studioBookToLoreaAlbum(book));
                  }}
                  className="group relative rounded-2xl bg-white/[0.04] border border-white/10 hover:border-sky-500/60 p-4 cursor-pointer transition-all duration-200 flex gap-4 items-center shadow-lg hover:bg-white/[0.06]"
                >
                  <div className="w-24 h-32 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10 group-hover:scale-105 transition-transform duration-300">
                    <img src="/generated/comics/chrome_full/p1_pan1.png" alt="Chrome Apostle" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-sky-400">Hard Sci-Fi Kinetic Manga · RTL</span>
                    <h4 className="text-sm font-black text-white group-hover:text-sky-300 transition-colors truncate mt-0.5">CHROME APOSTLE: APHELION 9</h4>
                    <p className="text-[10px] text-white/40 mt-1 line-clamp-2 leading-relaxed">
                      Orbital tether space elevator war. Katsuhiro Otomo & Tsutomu Nihei lens with authentic Kanji sound layers.
                    </p>
                    <div className="flex items-center gap-2 mt-2.5 text-[9px] text-white/50 font-bold">
                      <span className="px-2 py-0.5 rounded bg-black/60 border border-white/10">20 Pages</span>
                      <span className="px-2 py-0.5 rounded bg-black/60 border border-white/10">27 Panels</span>
                      <span className="text-sky-400 ml-auto flex items-center gap-1 group-hover:underline">Read Now →</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Legends & History Featured Prominently at the Top & Bottom */}
            <LegendsSection title="Legends of Comics" note="The artists & writers who built the medium" legends={COMIC_LEGENDS} onSelect={setSelectedLegend} />
            <HistorySection title="A History of Comics" eras={COMICS_HISTORY} allLegends={COMIC_LEGENDS} onSelectLegend={setSelectedLegend} />

            <div className="h-px w-full bg-white/5 my-8" />
            {COMIC_COLLECTIONS.map(c => (
              <Row key={c.label} label={c.label} load={() => fetchArchiveComics(c.query, 18)} onOpen={openComic} />
            ))}
          </>
        )}

        {tab === 'manga' && (
          <>
            <div className="flex items-center gap-2 mb-5 text-[11px] text-white/40"><Clock size={13} style={{ color: GOLD }} /> A century of manga, manhwa & manhua — covers, creators and context from AniList. Tap a title or legend to explore.</div>
            <LegendsSection title="Masters of Manga" note="The mangaka who shaped a century" legends={MANGA_LEGENDS} onSelect={setSelectedLegend} />
            <HistorySection title="A History of Manga" eras={MANGA_HISTORY} allLegends={MANGA_LEGENDS} onSelectLegend={setSelectedLegend} />
            <div className="h-px w-full bg-white/5 my-8" />
            <MangaRow label="Most Celebrated" note="all-time" load={() => fetchAnilistManga({ sort: 'SCORE_DESC', limit: 24 })} />
            {MANGA_ERAS.map(e => (
              <MangaRow key={e.label} label={e.label} note={`${e.since}+ · ${e.note}`} load={() => fetchAnilistManga({ sort: 'START_DATE', sinceYear: e.since, limit: 24 })} />
            ))}
          </>
        )}

        {tab === 'library' && (
          <>
            <div className="flex gap-2 mb-6 max-w-xl">
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 focus-within:border-violet-400/50">
                <Search size={15} className="text-white/40" />
                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} placeholder="Search millions of books worldwide (Open Library)…" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
              </div>
              <button onClick={runSearch} className="px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white" style={{ background: V }}>{searching ? <Loader2 size={13} className="animate-spin" /> : 'Search'}</button>
            </div>
            {results ? (
              results.length === 0 ? <p className="text-white/30 text-sm">No results.</p> : (
                <>
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-3">{results.length} results</p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
                    {results.map(b => (
                      <div key={b.id}>
                        {b.formats['application/pdf'] || b.formats.ia
                          ? <BookCard b={b} onOpen={() => openComic(b)} />
                          : <a href={b.formats['text/html']} target="_blank" rel="noopener noreferrer"><BookCard b={b} onOpen={() => window.open(b.formats['text/html'], '_blank')} /></a>}
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : (
              OPEN_LIBRARY_SHELVES.map(s => (
                <Row key={s.subject} label={s.label} load={() => openLibrarySubject(s.subject, 18)} onOpen={openComic} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ComicMangaMuseum;
