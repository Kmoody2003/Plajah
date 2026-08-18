import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, X, User, Music, Film, BookOpen, Play, Gamepad2,
  Globe, Newspaper, Tv, Camera, AppWindow, Mic, MessageCircle, Zap, Users,
} from 'lucide-react';
import {
  fetchAllPublicAlbums, fetchAllVideos, fetchGames, fetchAllPublicWorlds,
  fetchGlobalApps, fetchGlobalPhotos, listenToGlobalArticles, fetchAllLiveFeeds,
  searchUsers, fetchDiscussionPosts, listenToGlobalPosts,
} from '../services/backendService';
import { semanticSearch, AzureSearchResult } from '../services/microsoftAIService';
import { Album, Video, Article, UserProfile, Post } from '../types';
import { diversifyPublicSearchResults, maxPublicSearchScore, normalizePublicSearchQuery } from '../services/platformSearchService';

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultType =
  | 'USER' | 'MUSIC' | 'PODCAST' | 'BOOK'
  | 'VIDEO' | 'MOVIE' | 'TV' | 'ARTICLE'
  | 'GAME' | 'WORLD' | 'LIVE' | 'DISCUSSION'
  | 'PHOTO' | 'APP' | 'POST';

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
  onOpenFullSearch?: (query: string) => void;
  onFocusChange?: (isFocused: boolean) => void;
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
  POST:       { label: 'Post',       color: 'text-violet-400',  Icon: MessageCircle },
  PHOTO:      { label: 'Photo',      color: 'text-indigo-400',  Icon: Camera },
  APP:        { label: 'App',        color: 'text-orange-400',  Icon: AppWindow },
};

const TYPE_ORDER: Record<ResultType, number> = {
  USER: 0, MUSIC: 1, PODCAST: 2, MOVIE: 3, TV: 4, VIDEO: 5,
  ARTICLE: 6, POST: 7, GAME: 8, LIVE: 9, WORLD: 10, BOOK: 11, DISCUSSION: 12, APP: 13, PHOTO: 14,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  onOpenFullSearch,
  onFocusChange,
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const setFocusedWithCallback = (v: boolean) => {
    setFocused(v);
    onFocusChange?.(v);
  };

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
  const [posts, setPosts] = useState<Post[]>([]);

  // Debounced user results
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRequest = useRef(0);
  // Azure semantic search results
  const [azureResults, setAzureResults] = useState<AzureSearchResult[]>([]);
  const azureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const azureRequest = useRef(0);

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
    const unsubPosts = listenToGlobalPosts(data => setPosts(data.filter(post => post.isPublic !== false && !post.isToday)));

    fetchDiscussionPosts(undefined, 'hot')
      .then(data => setDiscussions((data || []).slice(0, 60)))
      .catch(() => {});

    return () => {
      if (typeof unsubArticles === 'function') unsubArticles();
      if (typeof unsubFeeds === 'function') unsubFeeds();
      if (typeof unsubPosts === 'function') unsubPosts();
    };
  }, []);

  // Debounced user search
  useEffect(() => {
    if (userTimer.current) clearTimeout(userTimer.current);
    const requestId = ++userRequest.current;
    if (query.trim().length < 2) { setUsers([]); setUserSearching(false); return; }
    setUserSearching(true);
    userTimer.current = setTimeout(async () => {
      const res = await searchUsers(query.trim()).catch(() => []);
      if (requestId !== userRequest.current) return;
      setUsers(res.filter(user => !(user as any).isChild && user.accountType !== 'CHILD'));
      setUserSearching(false);
    }, 280);
    return () => { if (userTimer.current) clearTimeout(userTimer.current); };
  }, [query]);

  // Debounced Azure semantic search
  useEffect(() => {
    if (azureTimer.current) clearTimeout(azureTimer.current);
    const requestId = ++azureRequest.current;
    const q = query.trim();
    if (q.length < 2) { setAzureResults([]); return; }
    azureTimer.current = setTimeout(async () => {
      try {
        const res = await semanticSearch(q).catch(() => []);
        if (requestId === azureRequest.current) setAzureResults(res || []);
      } catch (e) { if (requestId === azureRequest.current) setAzureResults([]); }
    }, 320);
    return () => { if (azureTimer.current) clearTimeout(azureTimer.current); };
  }, [query]);

  // Build ranked results from all catalogs
  const results = useMemo((): SearchResult[] => {
    const q = normalizePublicSearchQuery(query);
    if (q.length < 2) return [];

    const all: SearchResult[] = [];

    // Users
    users.forEach(u => {
      const s = maxPublicSearchScore([u.displayName, (u as any).bio, (u as any).genre], q);
      if (s > 0) all.push({
        id: u.uid, title: u.displayName || 'Unknown',
        subtitle: (u as any).isArtist ? 'Artist' : 'User',
        thumbnail: u.photoURL, type: 'USER', raw: u, _score: s,
      });
    });

    // Albums
    albums.forEach(a => {
      const s = maxPublicSearchScore([a.title, (a as any).artist, a.genre, a.description,
        ...((a as any).tags || [])], q);
      if (s > 0) all.push({
        id: a.id, title: a.title,
        subtitle: (a as any).artist || a.genre,
        thumbnail: (a as any).coverImage || (a as any).coverUrl,
        type: albumType(a), raw: a, _score: s,
      });
      (a.tracks || []).forEach(track => {
        const trackScore = maxPublicSearchScore([track.title, (track as any).artist, a.title, a.genre], q);
        if (trackScore > 0) all.push({ id: `${a.id}:${track.id}`, title: track.title, subtitle: `${(track as any).artist || (a as any).artist || 'Music'} · ${a.title}`, thumbnail: (a as any).coverImage || (a as any).coverUrl, type: 'MUSIC', raw: a, _score: trackScore + 0.15 });
      });
    });

    // Videos
    videos.forEach(v => {
      const cat = ((v as any).category || '').toUpperCase();
      const vType: ResultType = cat === 'MOVIE' ? 'MOVIE' : cat === 'TV_EPISODE' ? 'TV' : 'VIDEO';
      const s = maxPublicSearchScore([v.title, (v as any).artist, v.genre, v.description,
        ...((v as any).tags || [])], q);
      if (s > 0) all.push({
        id: v.id, title: v.title,
        subtitle: (v as any).artist || v.genre,
        thumbnail: v.thumbnailUrl, type: vType, raw: v, _score: s,
      });
    });

    // Articles
    articles.forEach(a => {
      const s = maxPublicSearchScore([a.title, a.subtitle, a.authorName, a.category,
        ...(a.tags || [])], q);
      if (s > 0) all.push({
        id: a.id, title: a.title, subtitle: a.authorName,
        thumbnail: a.coverImage, type: 'ARTICLE', raw: a, _score: s,
      });
    });

    // Games
    games.forEach(g => {
      const s = maxPublicSearchScore([g.title, g.description, ...(g.tags || [])], q);
      if (s > 0) all.push({
        id: g.id, title: g.title, subtitle: 'Game',
        thumbnail: g.thumbnailUrl, type: 'GAME', raw: g, _score: s,
      });
    });

    // Worlds
    worlds.forEach(w => {
      const s = maxPublicSearchScore([w.name, w.description], q);
      if (s > 0) all.push({
        id: w.id, title: w.name, subtitle: w.worldType,
        thumbnail: w.coverImage, type: 'WORLD', raw: w, _score: s,
      });
    });

    // Apps
    apps.forEach(a => {
      const s = maxPublicSearchScore([a.title, a.description, a.category], q);
      if (s > 0) all.push({
        id: a.id, title: a.title, subtitle: a.category,
        thumbnail: a.thumbnailUrl, type: 'APP', raw: a, _score: s,
      });
    });

    // Photos
    photos.forEach(p => {
      const s = maxPublicSearchScore([p.title, p.description, ...(p.tags || [])], q);
      if (s > 0) all.push({
        id: p.id, title: p.title || 'Photo', subtitle: 'Photo',
        thumbnail: p.url, type: 'PHOTO', raw: p, _score: s,
      });
    });

    // Integrate Azure semantic search results (prefer the service's score but avoid duplicates)
    azureResults.forEach(ar => {
      // map Azure types to our ResultType
      let t: ResultType = 'ARTICLE';
      if (ar.type === 'BOOK') t = 'BOOK';
      else if (ar.type === 'ALBUM') t = 'MUSIC';
      else if (ar.type === 'VIDEO') t = 'VIDEO';
      const exists = all.find(a => a.id === ar.id && a.type === t);
      if (!exists) {
        all.push({
          id: ar.id,
          title: ar.title || ar.id,
          subtitle: ar.snippet || '',
          thumbnail: undefined,
          type: t,
          raw: ar,
          _score: Math.max(0, (ar.score || 0) * 1.0),
        });
      }
    });

    // Live Feeds
    liveFeeds.forEach(f => {
      const s = maxPublicSearchScore([f.title, f.genre, f.subject, ...(f.tags || [])], q);
      if (s > 0) all.push({
        id: f.id, title: f.title,
        subtitle: f.status === 'LIVE' ? 'Live Now' : 'Stream',
        thumbnail: f.thumbnailUrl, type: 'LIVE', raw: f, _score: s,
      });
    });

    // Discussion Posts
    discussions.forEach(d => {
      const s = maxPublicSearchScore([d.title, d.body, d.displayName], q);
      if (s > 0) all.push({
        id: d.id, title: d.title || 'Post', subtitle: 'Discussion',
        type: 'DISCUSSION', raw: d, _score: s,
      });
    });

    // Public social posts — searchable by body, author, tags, and embedded creation titles.
    posts.forEach(post => {
      const mediaTitles = (post.media || []).map(media => media.title || media.linkPreview?.title || '');
      const s = maxPublicSearchScore([post.text, post.authorName, ...(post.tags || []), ...mediaTitles], q);
      if (s > 0) all.push({
        id: post.id,
        title: post.text.trim().slice(0, 90) || mediaTitles.find(Boolean) || 'Public post',
        subtitle: post.authorName,
        thumbnail: post.contentLabels?.length ? undefined : post.media?.find(media => media.thumbnail || media.type === 'PHOTO')?.thumbnail || post.media?.find(media => media.type === 'PHOTO')?.url,
        type: 'POST', raw: post, _score: s,
      });
    });

    // Sort by score desc, then type priority
    return diversifyPublicSearchResults(all, TYPE_ORDER, 20, 4);
  }, [query, users, albums, videos, articles, games, worlds, apps, photos, liveFeeds, discussions, posts, azureResults]);

  const handleClick = (result: SearchResult) => {
    switch (result.type) {
      case 'USER':       onVisitUser(result.raw.uid || result.id); break;
      case 'ARTICLE':    onSelectArticle(result.raw); break;
      case 'GAME':       onSelectGame(result.raw); break;
      case 'LIVE':       onSelectLiveFeed(result.raw); break;
      case 'WORLD':      onSelectView('WORLDS'); break;
      case 'DISCUSSION': onSelectView('DISCUSSION'); break;
      case 'POST':       onSelectView('FEED'); break;
      case 'PHOTO':      onSelectView('GLOBAL_PHOTOS'); break;
      case 'APP':        onSelectView('APPS'); break;
      default:           onSelectItem(result.raw); break;
    }
    setQuery('');
    setFocusedWithCallback(false);
  };

  const isCollapsed = isSidebarCollapsed || theme === 'BIG_SCREEN';
  const q = query.trim();
  const showDropdown = focused && q.length >= 2;
  const isEmpty = results.length === 0 && !userSearching;
  const openFullSearch = () => {
    if (onOpenFullSearch) onOpenFullSearch(q);
    else onSelectView('SEARCH');
    setQuery(''); setFocusedWithCallback(false);
  };

  if (isCollapsed) {
    return (
      <div className={`mb-2 flex justify-center shrink-0 ${theme === 'BIG_SCREEN' ? 'group-hover/sidebar:hidden' : ''}`}>
        <button
          onClick={openFullSearch}
          className="w-12 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/10 transition-colors"
          title="Search all public Plajah content"
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
          placeholder="Search Plajah — people, music, creations, posts…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocusedWithCallback(true)}
          onBlur={() => setTimeout(() => setFocusedWithCallback(false), 160)}
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
                onClick={() => { onSelectView('PEOPLE'); setFocusedWithCallback(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF8C00]/10 border border-[#FF8C00]/20 text-[9px] font-black uppercase tracking-wider text-[#FF8C00] hover:bg-[#FF8C00]/20 transition-colors"
              >
                <Users size={10} />
                Find People
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={openFullSearch}
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
                  onClick={openFullSearch}
                  className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors"
                >
                  Full search →
                </button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onSelectView('PEOPLE'); setQuery(''); setFocusedWithCallback(false); }}
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
