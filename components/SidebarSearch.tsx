import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, X, User, Music, Film, BookOpen, Play, Gamepad2,
  Globe, Newspaper, Tv, Camera, AppWindow, Mic, MessageCircle, Zap, Users,
} from 'lucide-react';
import {
  fetchAllPublicAlbums, fetchAllVideos, fetchGames, fetchAllPublicWorlds,
  fetchGlobalApps, fetchGlobalPhotos, listenToGlobalArticles, fetchAllLiveFeeds,
  searchUsers, fetchDiscussionPosts,
} from '../services/backendService';
import { Album, Video, Article, UserProfile } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultType =
  | 'USER' | 'MUSIC' | 'PODCAST' | 'BOOK'
  | 'VIDEO' | 'MOVIE' | 'TV' | 'ARTICLE'
  | 'GAME' | 'WORLD' | 'LIVE' | 'DISCUSSION'
  | 'PHOTO' | 'APP';

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  type: ResultType;
  raw: any;
  _score: number;
}

interface SidebarSearchProps {
  isSidebarCollapsed: boolean;
  theme: string;
  onVisitUser: (uid: string) => void;
  onSelectItem: (item: any) => void;
  onSelectArticle: (article: Article) => void;
  onSelectGame: (game: any) => void;
  onSelectView: (view: string) => void;
  onSelectLiveFeed: (feed: any) => void;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ResultType, { label: string; color: string; Icon: React.ElementType }> = {
  USER:       { label: 'Artist',     color: 'text-[#FF8C00]',   Icon: User },
  MUSIC:      { label: 'Music',      color: 'text-purple-400',  Icon: Music },
  PODCAST:    { label: 'Podcast',    color: 'text-green-400',   Icon: Mic },
  BOOK:       { label: 'Book',       color: 'text-yellow-400',  Icon: BookOpen },
  VIDEO:      { label: 'Video',      color: 'text-blue-400',    Icon: Play },
  MOVIE:      { label: 'Movie',      color: 'text-red-400',     Icon: Film },
  TV:         { label: 'TV',         color: 'text-pink-400',    Icon: Tv },
  ARTICLE:    { label: 'Article',    color: 'text-cyan-400',    Icon: Newspaper },
  GAME:       { label: 'Game',       color: 'text-emerald-400', Icon: Gamepad2 },
  WORLD:      { label: 'World',      color: 'text-teal-400',    Icon: Globe },
  LIVE:       { label: 'Live',       color: 'text-red-400',     Icon: Zap },
  DISCUSSION: { label: 'Post',       color: 'text-violet-400',  Icon: MessageCircle },
  PHOTO:      { label: 'Photo',      color: 'text-indigo-400',  Icon: Camera },
  APP:        { label: 'App',        color: 'text-orange-400',  Icon: AppWindow },
};

const TYPE_ORDER: Record<ResultType, number> = {
  USER: 0, MUSIC: 1, PODCAST: 2, MOVIE: 3, TV: 4, VIDEO: 5,
  ARTICLE: 6, GAME: 7, LIVE: 8, WORLD: 9, BOOK: 10, DISCUSSION: 11, APP: 12, PHOTO: 13,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function score(field: string = '', q: string): number {
  const f = field.toLowerCase();
  if (!f || !q) return 0;
  if (f === q) return 3;
  if (f.startsWith(q)) return 2;
  if (f.includes(q)) return 1;
  return 0;
}

function maxScore(fields: (string | undefined)[], q: string): number {
  return Math.max(0, ...fields.map(f => score(f, q)));
}

function albumType(album: Album): ResultType {
  const sub = ((album as any).subType || '').toUpperCase();
  if (album.type === 'BOOK' || sub === 'NOVEL' || sub === 'GRAPHIC_NOVEL') return 'BOOK';
  if (sub === 'PODCAST') return 'PODCAST';
  if (sub === 'MOVIE' || sub === 'SHORT FILM' || sub === 'SHORT_FILM') return 'MOVIE';
  if (sub === 'TV_SERIES' || sub === 'TV SERIES') return 'TV';
  return 'MUSIC';
}

// ── Component ─────────────────────────────────────────────────────────────────

const SidebarSearch: React.FC<SidebarSearchProps> = ({
  isSidebarCollapsed,
  theme,
  onVisitUser,
  onSelectItem,
  onSelectArticle,
  onSelectGame,
  onSelectView,
  onSelectLiveFeed,
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  // Content catalogs
  const [albums, setAlbums] = useState<Album[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [worlds, setWorlds] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [liveFeeds, setLiveFeeds] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);

  // Debounced user results
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all content catalogs once on mount
  useEffect(() => {
    Promise.all([
      fetchAllPublicAlbums().catch(() => []),
      fetchAllVideos().catch(() => []),
      fetchGames().catch(() => []),
      fetchAllPublicWorlds().catch(() => []),
      fetchGlobalApps().catch(() => []),
      fetchGlobalPhotos().catch(() => []),
    ]).then(([a, v, g, w, ap, ph]) => {
      setAlbums(a as Album[]);
      setVideos(v as Video[]);
      setGames(g);
      setWorlds(w);
      setApps(ap);
      setPhotos(ph);
    });

    const unsubArticles = listenToGlobalArticles(data => setArticles(data));
    const unsubFeeds = fetchAllLiveFeeds(data => setLiveFeeds(data));

    fetchDiscussionPosts(undefined, 'hot')
      .then(data => setDiscussions((data || []).slice(0, 60)))
      .catch(() => {});

    return () => {
      if (typeof unsubArticles === 'function') unsubArticles();
      if (typeof unsubFeeds === 'function') unsubFeeds();
    };
  }, []);

  // Debounced user search
  useEffect(() => {
    if (userTimer.current) clearTimeout(userTimer.current);
    if (query.trim().length < 2) { setUsers([]); return; }
    setUserSearching(true);
    userTimer.current = setTimeout(async () => {
      const res = await searchUsers(query).catch(() => []);
      setUsers(res);
      setUserSearching(false);
    }, 280);
    return () => { if (userTimer.current) clearTimeout(userTimer.current); };
  }, [query]);

  // Build ranked results from all catalogs
  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const all: SearchResult[] = [];

    // Users
    users.forEach(u => {
      const s = maxScore([u.displayName, (u as any).bio, (u as any).genre], q);
      if (s > 0) all.push({
        id: u.uid, title: u.displayName || 'Unknown',
        subtitle: (u as any).isArtist ? 'Artist' : 'User',
        thumbnail: u.photoURL, type: 'USER', raw: u, _score: s,
      });
    });

    // Albums
    albums.forEach(a => {
      const s = maxScore([a.title, (a as any).artist, a.genre, a.description,
        ...((a as any).tags || [])], q);
      if (s > 0) all.push({
        id: a.id, title: a.title,
        subtitle: (a as any).artist || a.genre,
        thumbnail: (a as any).coverImage || (a as any).coverUrl,
        type: albumType(a), raw: a, _score: s,
      });
    });

    // Videos
    videos.forEach(v => {
      const cat = ((v as any).category || '').toUpperCase();
      const vType: ResultType = cat === 'MOVIE' ? 'MOVIE' : cat === 'TV_EPISODE' ? 'TV' : 'VIDEO';
      const s = maxScore([v.title, (v as any).artist, v.genre, v.description,
        ...((v as any).tags || [])], q);
      if (s > 0) all.push({
        id: v.id, title: v.title,
        subtitle: (v as any).artist || v.genre,
        thumbnail: v.thumbnailUrl, type: vType, raw: v, _score: s,
      });
    });

    // Articles
    articles.forEach(a => {
      const s = maxScore([a.title, a.subtitle, a.authorName, a.category,
        ...(a.tags || [])], q);
      if (s > 0) all.push({
        id: a.id, title: a.title, subtitle: a.authorName,
        thumbnail: a.coverImage, type: 'ARTICLE', raw: a, _score: s,
      });
    });

    // Games
    games.forEach(g => {
      const s = maxScore([g.title, g.description, ...(g.tags || [])], q);
      if (s > 0) all.push({
        id: g.id, title: g.title, subtitle: 'Game',
        thumbnail: g.thumbnailUrl, type: 'GAME', raw: g, _score: s,
      });
    });

    // Worlds
    worlds.forEach(w => {
      const s = maxScore([w.name, w.description], q);
      if (s > 0) all.push({
        id: w.id, title: w.name, subtitle: w.worldType,
        thumbnail: w.coverImage, type: 'WORLD', raw: w, _score: s,
      });
    });

    // Apps
    apps.forEach(a => {
      const s = maxScore([a.title, a.description, a.category], q);
      if (s > 0) all.push({
        id: a.id, title: a.title, subtitle: a.category,
        thumbnail: a.thumbnailUrl, type: 'APP', raw: a, _score: s,
      });
    });

    // Photos
    photos.forEach(p => {
      const s = maxScore([p.title, p.description, ...(p.tags || [])], q);
      if (s > 0) all.push({
        id: p.id, title: p.title || 'Photo', subtitle: 'Photo',
        thumbnail: p.url, type: 'PHOTO', raw: p, _score: s,
      });
    });

    // Live Feeds
    liveFeeds.forEach(f => {
      const s = maxScore([f.title, f.genre, f.subject, ...(f.tags || [])], q);
      if (s > 0) all.push({
        id: f.id, title: f.title,
        subtitle: f.status === 'LIVE' ? 'Live Now' : 'Stream',
        thumbnail: f.thumbnailUrl, type: 'LIVE', raw: f, _score: s,
      });
    });

    // Discussion Posts
    discussions.forEach(d => {
      const s = maxScore([d.title, d.body, d.displayName], q);
      if (s > 0) all.push({
        id: d.id, title: d.title || 'Post', subtitle: 'Discussion',
        type: 'DISCUSSION', raw: d, _score: s,
      });
    });

    // Sort by score desc, then type priority
    return all
      .sort((a, b) =>
        b._score !== a._score
          ? b._score - a._score
          : (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99)
      )
      .slice(0, 16);
  }, [query, users, albums, videos, articles, games, worlds, apps, photos, liveFeeds, discussions]);

  const handleClick = (result: SearchResult) => {
    switch (result.type) {
      case 'USER':       onVisitUser(result.raw.uid || result.id); break;
      case 'ARTICLE':    onSelectArticle(result.raw); break;
      case 'GAME':       onSelectGame(result.raw); break;
      case 'LIVE':       onSelectLiveFeed(result.raw); break;
      case 'WORLD':      onSelectView('WORLDS'); break;
      case 'DISCUSSION': onSelectView('DISCUSSION'); break;
      case 'PHOTO':      onSelectView('GLOBAL_PHOTOS'); break;
      case 'APP':        onSelectView('APPS'); break;
      default:           onSelectItem(result.raw); break;
    }
    setQuery('');
    setFocused(false);
  };

  const isCollapsed = isSidebarCollapsed || theme === 'BIG_SCREEN';
  const q = query.trim();
  const showDropdown = focused && q.length >= 2;
  const isEmpty = results.length === 0 && !userSearching;

  // ── Collapsed: just a search icon
  if (isCollapsed) {
    return (
      <div className={`mb-2 flex justify-center shrink-0 ${theme === 'BIG_SCREEN' ? 'group-hover/sidebar:hidden' : ''}`}>
        <button
          onClick={() => onSelectView('SEARCH')}
          className="w-12 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/10 transition-colors"
          title="Search"
        >
          <Search size={16} className="text-white/40" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative mb-2 px-1 shrink-0">
      {/* Input */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          type="text"
          placeholder="Search music, videos, articles..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 160)}
          className="w-full h-10 bg-white/[0.06] border border-white/[0.08] rounded-xl pl-9 pr-8 text-[11px] text-white placeholder-white/25 focus:outline-none focus:border-white/20 focus:bg-white/[0.09] transition-all"
        />
        {q && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Quick chips — shown when focused but no query yet */}
      {focused && q.length < 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[200] bg-black/97 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
          <div className="px-3 py-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Quick Links</p>
            <div className="flex flex-wrap gap-2">
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onSelectView('PEOPLE'); setFocused(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF8C00]/10 border border-[#FF8C00]/20 text-[9px] font-black uppercase tracking-wider text-[#FF8C00] hover:bg-[#FF8C00]/20 transition-colors"
              >
                <Users size={10} />
                Find People
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onSelectView('SEARCH'); setFocused(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white/50 hover:bg-white/10 transition-colors"
              >
                <Search size={10} />
                Full Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[200] bg-black/97 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
          {userSearching && results.length === 0 ? (
            <div className="px-4 py-3 text-[10px] text-white/30 uppercase tracking-widest text-center">
              Searching...
            </div>
          ) : isEmpty ? (
            <div className="px-4 py-4 text-center">
              <p className="text-[10px] text-white/25 uppercase tracking-widest">No results for "{q}"</p>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto custom-scrollbar">
              {results.map(result => {
                const cfg = TYPE_CONFIG[result.type];
                const Icon = cfg.Icon as any;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleClick(result)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.05] transition-colors text-left group"
                  >
                    {/* Thumbnail */}
                    <div className="w-8 h-8 rounded-lg bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                      {result.thumbnail
                        ? <img src={result.thumbnail} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : <Icon size={14} className={cfg.color} />
                      }
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white truncate leading-snug group-hover:text-white/90">
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-[9px] text-white/35 truncate leading-tight">{result.subtitle}</p>
                      )}
                    </div>

                    {/* Type badge */}
                    <span className={`text-[8px] font-black uppercase tracking-wider shrink-0 ${cfg.color} opacity-70`}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-white/[0.04] flex items-center justify-between">
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onSelectView('SEARCH'); setQuery(''); setFocused(false); }}
                  className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors"
                >
                  Full search →
                </button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onSelectView('PEOPLE'); setQuery(''); setFocused(false); }}
                  className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#FF8C00]/50 hover:text-[#FF8C00] transition-colors"
                >
                  <Users size={10} />
                  Find People
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SidebarSearch;
