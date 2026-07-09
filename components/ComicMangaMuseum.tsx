import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Search, BookOpen, Landmark, Library as LibraryIcon, ExternalLink, Loader2, Sparkles, Clock } from 'lucide-react';
import type { Album } from '../types';
import { fetchArchiveComics, fetchAnilistManga, resolveArchiveReadableUrl, COMIC_COLLECTIONS, MANGA_ERAS, COMIC_LEGENDS, MANGA_LEGENDS, COMICS_HISTORY, MANGA_HISTORY, type MangaEntry, type Legend, type HistoryEra } from '../services/comicsMangaService';
import { searchOpenLibrary, openLibrarySubject, OPEN_LIBRARY_SHELVES } from '../services/openLibraryService';
import type { ArchiveBook } from '../services/archiveContentService';

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

const LegendCard: React.FC<{ l: Legend }> = ({ l }) => (
  <div className="shrink-0 w-64 p-5 rounded-2xl bg-white/[0.03] border border-white/8 hover:border-white/20 hover:bg-white/[0.05] transition-all">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-sm shrink-0 shadow-lg" style={{ background: `linear-gradient(135deg, ${l.color}, ${l.color}77)` }}>{initials(l.name)}</div>
      <div className="min-w-0">
        <h4 className="text-sm font-black uppercase tracking-tight text-white truncate">{l.name}</h4>
        <p className="text-[8.5px] font-black uppercase tracking-widest" style={{ color: l.color }}>{l.role} · {l.era}</p>
      </div>
    </div>
    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 leading-snug">{l.knownFor}</p>
    <p className="text-[11px] text-white/55 leading-relaxed">{l.legacy}</p>
  </div>
);

const LegendsSection: React.FC<{ title: string; note: string; legends: Legend[] }> = ({ title, note, legends }) => (
  <section className="mb-10 mt-2">
    <div className="flex items-center gap-3 mb-4">
      <Sparkles size={14} style={{ color: GOLD }} />
      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">{title}</h3>
      <span className="text-[10px] text-white/30 hidden sm:inline">{note}</span>
    </div>
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
      {legends.map(l => <LegendCard key={l.name} l={l} />)}
    </div>
  </section>
);

const HistorySection: React.FC<{ title: string; eras: HistoryEra[] }> = ({ title, eras }) => (
  <section className="mb-12">
    <div className="flex items-center gap-3 mb-6">
      <Landmark size={14} style={{ color: GOLD }} />
      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">{title}</h3>
    </div>
    <div className="relative pl-6 space-y-7 border-l border-white/10 ml-1">
      {eras.map((e, i) => (
        <div key={i} className="relative">
          <div className="absolute -left-[1.72rem] top-1.5 w-3 h-3 rounded-full" style={{ background: GOLD, boxShadow: '0 0 0 4px rgba(231,178,75,0.14)' }} />
          <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: GOLD }}>{e.period}</p>
          <h4 className="text-base font-black uppercase tracking-tight text-white mt-0.5 mb-1.5">{e.title}</h4>
          <p className="text-[12.5px] text-white/55 leading-relaxed max-w-2xl">{e.blurb}</p>
        </div>
      ))}
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
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: 'linear-gradient(180deg,#120e1c,#0a0a0f)' }}>
      {opening && (
        <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <Loader2 className="animate-spin text-small-orange" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Opening comic…</p>
        </div>
      )}
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
            {COMIC_COLLECTIONS.map(c => (
              <Row key={c.label} label={c.label} load={() => fetchArchiveComics(c.query, 18)} onOpen={openComic} />
            ))}
            <div className="h-px w-full bg-white/5 my-8" />
            <LegendsSection title="Legends of Comics" note="The artists & writers who built the medium" legends={COMIC_LEGENDS} />
            <HistorySection title="A History of Comics" eras={COMICS_HISTORY} />
          </>
        )}

        {tab === 'manga' && (
          <>
            <div className="flex items-center gap-2 mb-5 text-[11px] text-white/40"><Clock size={13} style={{ color: GOLD }} /> A century of manga, manhwa & manhua — covers, creators and context from AniList. Tap a title to read more.</div>
            <MangaRow label="Most Celebrated" note="all-time" load={() => fetchAnilistManga({ sort: 'SCORE_DESC', limit: 24 })} />
            {MANGA_ERAS.map(e => (
              <MangaRow key={e.label} label={e.label} note={`${e.since}+ · ${e.note}`} load={() => fetchAnilistManga({ sort: 'START_DATE', sinceYear: e.since, limit: 24 })} />
            ))}
            <div className="h-px w-full bg-white/5 my-8" />
            <LegendsSection title="Masters of Manga" note="The mangaka who shaped a century" legends={MANGA_LEGENDS} />
            <HistorySection title="A History of Manga" eras={MANGA_HISTORY} />
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
