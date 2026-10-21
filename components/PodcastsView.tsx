// PodcastsView — Chora's podcast room, in the Cinema × Proscenium language the album view and
// landing use: sentence-case type, a Bricolage display title, serif eyebrows, one orange action.
// Directory = Apple's public podcast charts/search/episodes (services/podcastDirectory); Chora
// originals are the platform's own PODCAST releases; "Your shows" is the followed-podcast library.
import React, { useEffect, useMemo, useState } from 'react';
import { Search, Rss, Play, Pause, Plus, Check, ChevronLeft, X } from 'lucide-react';
import { fetchAllPublicAlbums } from '../services/backendService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import type { Album, Track } from '../types';
import { getFollowedPodcasts, addFollowedPodcast, removeFollowedPodcast, subscribePodcastLibrary } from '../services/podcastLibraryService';
import {
  fetchTopPodcasts, searchPodcasts, fetchPodcastEpisodes, PODCAST_CATEGORIES,
  type PodcastShow, type PodcastEpisode,
} from '../services/podcastDirectory';

const DISPLAY = "'Bricolage Grotesque', var(--font-display), system-ui, sans-serif";
const SERIF = 'Newsreader, Georgia, serif';
const MONO = "'JetBrains Mono', monospace";

const fmtDuration = (s: number) => {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
};
const fmtDate = (d: string) => {
  const t = new Date(d);
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const ShelfHead: React.FC<{ title: string; note?: string; right?: React.ReactNode }> = ({ title, note, right }) => (
  <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 mb-4">
    <h2 className="text-white" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24 }}>{title}</h2>
    {note && <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: '#FFB86B' }}>{note}</span>}
    {right && <><div className="flex-1" />{right}</>}
  </div>
);

const ShowCard: React.FC<{ show: { title: string; artist: string; coverImage: string }; rank?: number; tag?: string; onOpen: () => void }> = ({ show, rank, tag, onOpen }) => (
  <button type="button" onClick={onOpen} className="group text-left min-w-0">
    <span className="relative block aspect-square rounded-[18px] overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.4)] border border-white/5">
      {show.coverImage && <img src={show.coverImage} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
      {rank != null && (
        <span className="absolute left-2.5 top-2.5 h-6 px-2 rounded-full text-[11px] text-white inline-flex items-center tabular-nums" style={{ background: 'rgba(6,4,10,0.72)', fontFamily: MONO }}>#{rank}</span>
      )}
      {tag && <span className="absolute left-2.5 bottom-2.5 h-6 px-2.5 rounded-full text-[11px] font-bold inline-flex items-center" style={{ background: 'rgba(255,140,0,0.92)', color: '#06040A' }}>{tag}</span>}
    </span>
    <span className="mt-2.5 block text-sm font-bold text-white truncate group-hover:text-[#FFB86B] transition-colors">{show.title}</span>
    <span className="block text-[13px] text-white/60 truncate">{show.artist}</span>
  </button>
);

const gridStyle: React.CSSProperties = { gridTemplateColumns: 'repeat(auto-fill, minmax(min(170px, 42vw), 1fr))' };

export const PodcastsView: React.FC<{
  /** Open a Chora-original podcast release in the album view. */
  onOpenAlbum?: (album: Album) => void;
  /** A show to open straight away (e.g. picked on the Chora landing). */
  openShow?: PodcastShow | null;
  onOpenedShow?: () => void;
}> = ({ onOpenAlbum, openShow, onOpenedShow }) => {
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [results, setResults] = useState<PodcastShow[]>([]);
  const [searching, setSearching] = useState(false);
  const [myShows, setMyShows] = useState<PodcastShow[]>([]);
  const [top, setTop] = useState<PodcastShow[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [originals, setOriginals] = useState<Album[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, PodcastShow[]>>({});

  const [show, setShow] = useState<PodcastShow | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  const { playTrack, togglePlay, currentTrack, isPlaying } = useGlobalPlayerState();

  useEffect(() => {
    setMyShows(getFollowedPodcasts() as PodcastShow[]);
    const unsub = subscribePodcastLibrary(() => setMyShows(getFollowedPodcasts() as PodcastShow[]));
    fetchTopPodcasts(10).then(setTop).catch(err => console.error('[Podcasts] top chart failed:', err)).finally(() => setTopLoading(false));
    fetchAllPublicAlbums().then(all => setOriginals(all.filter(a => a.subType === 'PODCAST'))).catch(() => {});
    (async () => {
      const out: Record<string, PodcastShow[]> = {};
      for (const cat of PODCAST_CATEGORIES.slice(0, 4)) {
        try { out[cat.name] = await fetchTopPodcasts(10, cat.id, cat.name); } catch { /* one shelf missing is fine */ }
      }
      setByCategory(out);
    })();
    return unsub;
  }, []);

  const open = async (p: PodcastShow) => {
    setShow(p);
    setEpisodes([]);
    setEpisodesLoading(true);
    try { setEpisodes(await fetchPodcastEpisodes(p)); }
    catch (err) { console.error('[Podcasts] episodes failed:', err); }
    finally { setEpisodesLoading(false); }
  };

  useEffect(() => {
    if (!openShow) return;
    void open(openShow);
    onOpenedShow?.();
  }, [openShow]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async (term: string) => {
    const q = term.trim();
    if (!q) return;
    setQuery(q);
    setLastQuery(q);
    setSearching(true);
    try { setResults(await searchPodcasts(q)); }
    catch (err) { console.error('[Podcasts] search failed:', err); }
    finally { setSearching(false); }
  };

  const following = (id: string) => myShows.some(p => p.id === id);
  const follow = (p: PodcastShow) => setMyShows(addFollowedPodcast(p) as PodcastShow[]);
  const unfollow = (id: string) => setMyShows(removeFollowedPodcast(id) as PodcastShow[]);

  const playEpisode = (ep: PodcastEpisode) => {
    if (!show) return;
    if (currentTrack?.id === ep.id) { togglePlay(); return; }
    // The whole episode list rides along so next / previous work in the global player.
    const tracks: Track[] = episodes.map(e => ({
      id: e.id, title: e.title, url: e.audioUrl, artist: show.artist, duration: e.duration,
      images: e.imageUrl ? [e.imageUrl] : [show.coverImage],
    }));
    const album: Album = {
      id: show.id, title: show.title, description: show.artist, artist: show.artist, coverImage: show.coverImage,
      tracks, createdAt: Date.now(), type: 'MUSIC', subType: 'PODCAST', themeColor: '#FF8C00',
    };
    playTrack(tracks.find(t => t.id === ep.id) ?? tracks[0], album, 'LIBRARY');
  };

  const openOriginal = (a: Album) => {
    if (onOpenAlbum) { onOpenAlbum(a); return; }
    window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'SANCTUARY', params: { artistId: a.id } } }));
  };

  const featured = top[0];
  const topRest = useMemo(() => top.slice(1), [top]);

  // ── A show: proscenium header + episode list in the Cinema tracklist style ──
  if (show) {
    const latest = episodes[0];
    return (
      <div className="normal-case animate-in fade-in duration-500">
        <section className="relative overflow-hidden rounded-[28px] border border-white/10" style={{ background: '#100A18' }}>
          {show.coverImage && <img src={show.coverImage} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover scale-110 blur-[48px] opacity-45" />}
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,4,10,0.2) 0%, rgba(6,4,10,0.85) 100%)' }} />
          <div className="relative p-5 sm:p-8 lg:p-10">
            <button type="button" onClick={() => setShow(null)} className="h-10 flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white transition-colors">
              <ChevronLeft size={18} /> Podcasts
            </button>
            <div className="mt-4 flex flex-col md:flex-row md:items-end gap-6 md:gap-9">
              {show.coverImage && <img src={show.coverImage} alt={show.title} referrerPolicy="no-referrer" className="w-40 md:w-56 aspect-square rounded-[22px] object-cover shadow-[0_30px_70px_rgba(0,0,0,0.6)] border border-white/15" />}
              <div className="flex-1 min-w-0">
                <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18, color: '#FFB86B' }}>{show.genres.length ? show.genres.slice(0, 2).join(' · ') : 'Podcast'}</p>
                <h1 className="mt-2 text-white uppercase" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(2.2rem, 5vw, 4.4rem)', lineHeight: 0.92, letterSpacing: '-0.02em', textWrap: 'balance' } as React.CSSProperties}>{show.title}</h1>
                <p className="mt-3 text-[15px] text-white/80"><b className="text-white">{show.artist}</b>{episodes.length ? ` · ${episodes.length} episodes` : ''}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {latest && (
                    <button type="button" onClick={() => playEpisode(latest)} className="h-12 pl-5 pr-6 rounded-full flex items-center gap-2 bg-[#FF8C00] text-[#06040A] text-sm font-extrabold hover:brightness-110 transition" style={{ boxShadow: '0 0 0 6px rgba(255,140,0,0.16)' }}>
                      {currentTrack?.id === latest.id && isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />} Latest episode
                    </button>
                  )}
                  {following(show.id) ? (
                    <button type="button" onClick={() => unfollow(show.id)} className="h-12 px-5 rounded-full flex items-center gap-2 border border-white/30 text-sm font-bold text-white hover:bg-white/10 transition-colors"><Check size={16} /> Following</button>
                  ) : (
                    <button type="button" onClick={() => follow(show)} className="h-12 px-5 rounded-full flex items-center gap-2 border border-white/30 text-sm font-bold text-white hover:bg-white/10 transition-colors"><Plus size={16} /> Follow</button>
                  )}
                  {show.feedUrl && (
                    <a href={show.feedUrl} target="_blank" rel="noreferrer" title="RSS feed" aria-label="RSS feed" className="w-12 h-12 rounded-full grid place-items-center border border-white/20 text-white/75 hover:text-white transition-colors"><Rss size={17} /></a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <ShelfHead title="Episodes" note={episodes.length ? 'newest first' : undefined} />
          {episodesLoading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[76px] rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
          ) : episodes.length === 0 ? (
            <p className="text-sm text-white/55" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 17 }}>No streamable episodes came back for this show.</p>
          ) : (
            <div className="flex flex-col">
              {episodes.map((ep, i) => {
                const active = currentTrack?.id === ep.id;
                const playingNow = active && isPlaying;
                const desc = plain(ep.description);
                return (
                  <div key={ep.id} className={`group relative flex items-center gap-5 px-4 py-3.5 ${active ? 'my-0.5 rounded-[14px] overflow-hidden' : 'border-b border-white/[0.07] hover:bg-white/[0.03] rounded-[10px]'}`}>
                    {active && <div className="absolute inset-0 track-gradient-active pointer-events-none" aria-hidden="true" />}
                    <span className="relative z-10 w-7 shrink-0 text-[13px] tabular-nums" style={{ fontFamily: MONO, color: active ? '#FF8C00' : 'rgba(255,255,255,0.5)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <button type="button" onClick={() => playEpisode(ep)} aria-label={playingNow ? `Pause ${ep.title}` : `Play ${ep.title}`}
                      className={`relative z-10 w-11 h-11 rounded-full grid place-items-center shrink-0 transition ${active ? 'bg-[#FF8C00] text-[#06040A]' : 'border border-white/25 text-white hover:bg-white/10'}`}>
                      {playingNow ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    </button>
                    <div className="relative z-10 flex-1 min-w-0">
                      <p className={`text-[16px] truncate ${active ? 'font-bold text-white' : 'font-semibold text-white/90'}`}>{ep.title}</p>
                      {desc && <p className="mt-0.5 text-[13px] text-white/55 line-clamp-1">{desc}</p>}
                    </div>
                    <div className="relative z-10 hidden sm:flex flex-col items-end shrink-0 text-[12px] tabular-nums text-white/60" style={{ fontFamily: MONO }}>
                      <span>{fmtDate(ep.releaseDate)}</span>
                      <span>{fmtDuration(ep.duration)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── The room ──
  return (
    <div className="normal-case animate-in fade-in duration-500 space-y-11 pb-24">
      <header className="flex flex-col lg:flex-row lg:items-end gap-5">
        <div className="flex-1 min-w-0">
          <h1 className="text-white" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', lineHeight: 1 }}>Podcasts</h1>
          <p className="mt-2" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18, color: '#FFB86B' }}>Shows from Chora creators and the world's podcast charts</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); void runSearch(query); }} className="flex items-center gap-2 w-full lg:w-[460px]" role="search">
          <label className="relative flex-1">
            <span className="sr-only">Search podcasts</span>
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search shows and hosts"
              className="w-full h-12 rounded-full bg-white/[0.05] border border-white/12 pl-11 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF8C00]/60 transition-colors" />
            {query && <button type="button" onClick={() => { setQuery(''); setResults([]); setLastQuery(''); }} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center text-white/50 hover:text-white"><X size={15} /></button>}
          </label>
          <button type="submit" disabled={searching || !query.trim()} className="h-12 px-5 rounded-full bg-white text-[#06040A] text-sm font-bold disabled:opacity-50 transition">{searching ? 'Searching…' : 'Search'}</button>
        </form>
      </header>

      <div className="flex flex-wrap gap-2 -mt-4" role="group" aria-label="Categories">
        {PODCAST_CATEGORIES.map(cat => (
          <button key={cat.id} type="button" onClick={() => void runSearch(cat.name)}
            className={`h-9 px-4 rounded-full text-[13px] font-semibold border transition-colors ${lastQuery === cat.name ? 'bg-white text-[#06040A] border-white' : 'text-white/75 border-white/12 hover:text-white hover:border-white/30'}`}>
            {cat.name}
          </button>
        ))}
      </div>

      {(results.length > 0 || (lastQuery && !searching)) && (
        <section>
          <ShelfHead title={`Results for “${lastQuery}”`} right={<button type="button" onClick={() => { setResults([]); setLastQuery(''); setQuery(''); }} className="text-sm font-semibold text-white/60 hover:text-white">Clear</button>} />
          {results.length ? (
            <div className="grid gap-5" style={gridStyle}>{results.map(p => <ShowCard key={p.id} show={p} tag={following(p.id) ? 'Following' : undefined} onOpen={() => void open(p)} />)}</div>
          ) : <p className="text-sm text-white/55">Nothing matched that search.</p>}
        </section>
      )}

      {featured && (
        <section className="relative overflow-hidden rounded-[28px] border border-white/10" style={{ background: '#100A18', minHeight: 320 }}>
          <img src={featured.coverImage} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover scale-110 blur-[44px] opacity-50" />
          <div aria-hidden="true" className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} style={[1, 4, 5].includes(i) ? { background: 'linear-gradient(180deg, rgba(255,184,107,0.14), rgba(255,184,107,0) 80%)' } : undefined} />)}
          </div>
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(6,4,10,0.85) 0%, rgba(6,4,10,0.4) 60%, rgba(6,4,10,0.2) 100%)' }} />
          <div className="relative p-6 sm:p-9 flex flex-col md:flex-row md:items-center gap-7">
            <img src={featured.coverImage} alt={featured.title} referrerPolicy="no-referrer" className="w-36 sm:w-48 aspect-square rounded-[20px] object-cover shadow-[0_24px_60px_rgba(0,0,0,0.6)] border border-white/15" />
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18, color: '#FFB86B' }}>Number one in the US podcast charts</p>
              <h2 className="mt-2 text-white uppercase" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(2rem, 4.2vw, 3.6rem)', lineHeight: 0.92, letterSpacing: '-0.02em' }}>{featured.title}</h2>
              <p className="mt-2.5 text-[15px] text-white/80">{featured.artist}{featured.genres[0] ? ` · ${featured.genres[0]}` : ''}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => void open(featured)} className="h-12 px-6 rounded-full bg-[#FF8C00] text-[#06040A] text-sm font-extrabold hover:brightness-110 transition">Listen</button>
                {following(featured.id)
                  ? <button type="button" onClick={() => unfollow(featured.id)} className="h-12 px-5 rounded-full border border-white/30 text-sm font-bold text-white flex items-center gap-2"><Check size={16} /> Following</button>
                  : <button type="button" onClick={() => follow(featured)} className="h-12 px-5 rounded-full border border-white/30 text-sm font-bold text-white flex items-center gap-2"><Plus size={16} /> Follow</button>}
              </div>
            </div>
          </div>
        </section>
      )}

      {myShows.length > 0 && (
        <section>
          <ShelfHead title="Your shows" note="the podcasts you follow" />
          <div className="grid gap-5" style={gridStyle}>{myShows.map(p => <ShowCard key={p.id} show={p} onOpen={() => void open(p)} />)}</div>
        </section>
      )}

      {originals.length > 0 && (
        <section>
          <ShelfHead title="Chora originals" note="made by creators on Plajah" />
          <div className="grid gap-5" style={gridStyle}>
            {originals.map(a => <ShowCard key={a.id} show={{ title: a.title, artist: a.artist, coverImage: a.coverImage }} tag="Chora" onOpen={() => openOriginal(a)} />)}
          </div>
        </section>
      )}

      <section>
        <ShelfHead title="Top shows" note="this week's US chart" />
        {topLoading ? (
          <div className="grid gap-5" style={gridStyle}>{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-square rounded-[18px] bg-white/[0.05] animate-pulse" />)}</div>
        ) : topRest.length ? (
          <div className="grid gap-5" style={gridStyle}>{topRest.map((p, i) => <ShowCard key={p.id} show={p} rank={i + 2} tag={following(p.id) ? 'Following' : undefined} onOpen={() => void open(p)} />)}</div>
        ) : <p className="text-sm text-white/55">The podcast chart didn't load just now.</p>}
      </section>

      {Object.entries(byCategory).map(([name, shows]) => shows.length > 0 && (
        <section key={name}>
          <ShelfHead title={name} note="top in the category" right={<button type="button" onClick={() => void runSearch(name)} className="text-sm font-semibold text-[#FFB86B] hover:text-[#FF8C00]">Search more</button>} />
          <div className="grid gap-5" style={gridStyle}>{shows.slice(0, 6).map((p, i) => <ShowCard key={p.id} show={p} rank={i + 1} onOpen={() => void open(p)} />)}</div>
        </section>
      ))}
    </div>
  );
};
