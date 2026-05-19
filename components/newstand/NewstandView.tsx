import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Newspaper, Globe, Zap, Radio, TrendingUp, ExternalLink, RefreshCw, Mic, Pen, Search, Heart, Share2, X, Plus } from 'lucide-react';
import { fetchNewsFromRSS, prefetchNewsCategories } from '../../services/rssService';
import ArticlesFeed from '../ArticlesFeed';
import { PodcastsView } from '../PodcastsView';
import { UserProfile, Article, LiveFeed } from '../../types';
import { fetchAllLiveFeeds } from '../../services/backendService';
import { callGemini } from '../../services/geminiService';
import The411 from '../The411';
import { SportsCenterView } from '../SportsCenterView';

type NewsItem = {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  imageUrl?: string;
  timestamp: string;
  date?: string; // alias used in templates
  category: string;
};

const CATEGORIES = [
  { id: 'COMMUNITY_ARTICLES', label: 'Community Articles', icon: Newspaper },
  { id: 'PODCASTS', label: 'Podcasts', icon: Mic },
  { id: 'LIVE_NEWS', label: 'Live News', icon: Radio },
  { id: 'GENERAL', label: 'Global News', icon: Globe },
  { id: 'SPORTS_ALL', label: 'Sports Center', icon: Zap },
  { id: 'SCIENCE', label: 'Science & Research', icon: Radio },
  { id: 'FINANCE', label: 'Markets & Finance', icon: TrendingUp }
];

const NEWS_SUBCATS = [
  { id: 'GENERAL_WORLD',         label: 'World' },
  { id: 'GENERAL_POLITICS',      label: 'Politics' },
  { id: 'GENERAL_TECH',          label: 'Technology' },
  { id: 'GENERAL_ENTERTAINMENT', label: 'Entertainment' },
  { id: 'GENERAL_HEALTH',        label: 'Health' },
  { id: 'GENERAL_BUSINESS',      label: 'Business' },
];

const LEAGUE_LOGOS: Record<string, string> = {
  SPORTS_NBA:    'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  SPORTS_NFL:    'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  SPORTS_NHL:    'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  SPORTS_MLB:    'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
  SPORTS_NCAA:   'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png',
  SPORTS_FIFA:   'https://a.espncdn.com/i/teamlogos/leagues/500/fifa.png',
  SPORTS_MLS:    'https://a.espncdn.com/i/teamlogos/leagues/500/mls.png',
  SPORTS_F1:     'https://a.espncdn.com/i/teamlogos/leagues/500/f1.png',
  SPORTS_NASCAR: 'https://a.espncdn.com/i/teamlogos/leagues/500/nascar.png',
  SPORTS_INDYCAR:'https://a.espncdn.com/i/teamlogos/leagues/500/indycar.png',
};

const SPORTS_TABS = [
  { id: 'SPORTS_ALL',     label: 'All Sports' },
  { id: 'SPORTS_FIFA',    label: 'FIFA / Soccer' },
  { id: 'SPORTS_MLS',     label: 'MLS' },
  { id: 'SPORTS_NFL',     label: 'NFL' },
  { id: 'SPORTS_NBA',     label: 'NBA' },
  { id: 'SPORTS_MLB',     label: 'MLB' },
  { id: 'SPORTS_NHL',     label: 'NHL' },
  { id: 'SPORTS_NCAA',    label: 'NCAA' },
  { id: 'SPORTS_ESPORTS', label: 'Esports' },
  { id: 'SPORTS_NASCAR',  label: 'NASCAR' },
  { id: 'SPORTS_INDYCAR', label: 'IndyCar' },
  { id: 'SPORTS_F1',      label: 'Formula 1' },
];

interface NewstandViewProps {
  onVisitUser: (uid: string) => void;
  onSelectArticle: (article: Article) => void;
  onNewArticle: () => void;
  currentUser: UserProfile | null;
}

interface SavedTeam {
  id: string;
  name: string;
  logo: string;
  league: string;
}

export const NewstandView: React.FC<NewstandViewProps> = ({ onVisitUser, onSelectArticle, onNewArticle, currentUser }) => {
  const [activeCategory, setActiveCategory] = useState('COMMUNITY_ARTICLES');
  const [newsSubcat, setNewsSubcat] = useState('GENERAL_WORLD');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<any[]>([]);
  const [markets, setMarkets] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bgFeed, setBgFeed] = useState<LiveFeed | null>(null);
  const [liveNewsFeeds, setLiveNewsFeeds] = useState<LiveFeed[]>([]);
  const [activeSportsTab, setActiveSportsTab] = useState('SPORTS_ALL');
  const [favoriteTeams, setFavoriteTeams] = useState<SavedTeam[]>([]);
  const [newTeam, setNewTeam] = useState('');
  const [isSearchingTeam, setIsSearchingTeam] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('vibestream_favorite_teams_v2');
    if (saved) {
      setFavoriteTeams(JSON.parse(saved));
    } else {
       // fallback for old strings if they updated
       const oldSaved = localStorage.getItem('vibestream_favorite_teams');
       if (oldSaved) {
           const parsed = JSON.parse(oldSaved);
           if (parsed.length > 0 && typeof parsed[0] === 'string') {
               const mapped = parsed.map((t: string) => ({ id: t, name: t, logo: `https://picsum.photos/seed/${t}/24/24`, league: 'UNKNOWN' }));
               setFavoriteTeams(mapped);
               localStorage.setItem('vibestream_favorite_teams_v2', JSON.stringify(mapped));
           }
       }
    }
  }, []);

  // Background warm-up so tabs load instantly on first click
  useEffect(() => { prefetchNewsCategories(); }, []);

  const addTeam = async () => {
    if (!newTeam.trim() || isSearchingTeam) return;
    setIsSearchingTeam(true);
    try {
      const resolutionPrompt = `
      Identify the sports team matching "${newTeam.trim()}".
      Return a JSON response with:
      - leaguePath: The ESPN API path for the league (e.g. 'basketball/nba', 'football/nfl', 'baseball/mlb', 'hockey/nhl', 'racing/f1', 'soccer/eng.1', 'basketball/mens-college-basketball').
      - teamId: The ESPN numerical ID or string ID used in their API for this team.
      - league: The common abbreviation for the league (e.g. 'NBA', 'NFL', 'EPL').
      - name: the formal name of the team
      `;
      
      const responseText = await callGemini(resolutionPrompt, { responseMimeType: 'application/json', tools: [{ googleSearch: {} }] }, "gemini-3-flash-preview");
      const info = JSON.parse(responseText || '{}');
      
      let finalName = info.name || newTeam.trim();
      let finalLogo = `https://picsum.photos/seed/${finalName}/24/24`;
      let finalLeague = info.league || 'UNKNOWN';
      let finalId = info.teamId || finalName;

      if (info.leaguePath && info.teamId) {
          try {
              const teamRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${info.leaguePath}/teams/${info.teamId}`);
              if (teamRes.ok) {
                 const tData = await teamRes.json();
                 if (tData.team) {
                    finalName = tData.team.displayName || finalName;
                    finalLogo = tData.team.logos?.[0]?.href || finalLogo;
                 }
              }
          } catch(e) {
              console.log("ESPN API fetch failed for team search", e);
          }
      }

      if (!favoriteTeams.find(t => t.name === finalName)) {
         const newSavedTeam: SavedTeam = { id: finalId, name: finalName, logo: finalLogo, league: finalLeague };
         const updated = [...favoriteTeams, newSavedTeam];
         setFavoriteTeams(updated);
         localStorage.setItem('vibestream_favorite_teams_v2', JSON.stringify(updated));
      }
      setNewTeam('');
    } catch(e) {
      console.error(e);
      if (!favoriteTeams.find(t => t.name.toLowerCase() === newTeam.trim().toLowerCase())) {
        const fallT: SavedTeam = { id: newTeam, name: newTeam.trim(), logo: `https://picsum.photos/seed/${newTeam.trim()}/24/24`, league: 'UNKNOWN' };
        const updated = [...favoriteTeams, fallT];
        setFavoriteTeams(updated);
        localStorage.setItem('vibestream_favorite_teams_v2', JSON.stringify(updated));
      }
      setNewTeam('');
    } finally {
      setIsSearchingTeam(false);
    }
  };

  const removeTeam = (teamName: string) => {
    const updated = favoriteTeams.filter(t => t.name !== teamName);
    setFavoriteTeams(updated);
    localStorage.setItem('vibestream_favorite_teams_v2', JSON.stringify(updated));
  };

  useEffect(() => {
    const unsub = fetchAllLiveFeeds((feeds) => {
      const newsFeeds = feeds.filter(f => f.tags?.map(t => t.toLowerCase()).includes('news'));
      setLiveNewsFeeds(newsFeeds);
      if (newsFeeds.length > 0 && !bgFeed) {
        setBgFeed(newsFeeds[Math.floor(Math.random() * newsFeeds.length)]);
      }
    });
    return () => unsub();
  }, [bgFeed]);

  const loadData = async (category: string) => {
    if (category === 'COMMUNITY_ARTICLES' || category === 'PODCASTS' || category === 'LIVE_NEWS') return;
    setLoading(true);
    try {
      // 1. Fetch News
      const queryCategory = category === 'SPORTS_ALL' ? activeSportsTab
        : category === 'GENERAL' ? newsSubcat
        : category;
      const rssItems = await fetchNewsFromRSS(queryCategory);
      setItems(rssItems.map((n: any) => ({
        id: n.id,
        title: n.headline,
        content: n.summary,
        source: n.source,
        url: n.url,
        imageUrl: n.imageUrl,
        timestamp: n.date,
        category: queryCategory
      })));

      // 2. Fetch Supporting Data
      if (category.startsWith('SPORTS')) {
        let endpoint = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
        if (activeSportsTab === 'SPORTS_NFL') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
        else if (activeSportsTab === 'SPORTS_MLB') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
        else if (activeSportsTab === 'SPORTS_NHL') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard';
        else if (activeSportsTab === 'SPORTS_NCAA') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
        else if (activeSportsTab === 'SPORTS_F1') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard';
        else if (activeSportsTab === 'SPORTS_NASCAR') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/racing/nascar/scoreboard';
        else if (activeSportsTab === 'SPORTS_INDYCAR') endpoint = 'https://site.api.espn.com/apis/site/v2/sports/racing/irl/scoreboard';

        const res = await fetch(endpoint);
        const data = await res.json();
        setScores(Array.isArray(data.events) ? data.events : []);
      } else if (category === 'FINANCE') {
        const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1`);
        const data = await res.json();
        setMarkets(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Dashboard data load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(activeCategory);
  }, [activeCategory, activeSportsTab, newsSubcat]);

  return (
    <div className="h-full flex flex-col bg-transparent text-white font-sans overflow-hidden">
      <header className="relative p-8 lg:p-12 border-b border-white/5 bg-black/80 backdrop-blur-3xl shrink-0 shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
        {bgFeed && (
          <div className="absolute inset-0 z-0 pointer-events-none opacity-30">
            <iframe 
              src={`${bgFeed.url}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1`} 
              className="w-full h-full object-cover scale-[1.5]"
              allow="autoplay; encrypted-media"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40" />
          </div>
        )}
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Pen size={20} className="text-small-orange" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Writers Platform</span>
            </div>
            <h1 className="text-6xl md:text-[10rem] lg:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
              News Stand
            </h1>
          </div>

          <div className="flex flex-col gap-6">
            <div className="relative w-full lg:w-96">
              <Search size={18} className="absolute left-6 top-1/2 -translate-y-1/2 opacity-20" />
              <input 
                type="text" 
                placeholder="Search authors, articles, topics..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-16 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-small-orange/50 transition-all text-inherit placeholder:opacity-30"
              />
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={onNewArticle}
                className="px-8 py-3 bg-[var(--text-primary)] text-[var(--bg-color)] rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
              >
                <Pen size={14} /> Start Writing
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex gap-2 p-6 overflow-x-auto no-scrollbar border-b border-white/5 shrink-0 z-10 relative bg-black/60 backdrop-blur-xl">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-3 px-8 py-4 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
                activeCategory === cat.id ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              <Icon size={16} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {activeCategory === 'COMMUNITY_ARTICLES' ? (
        <ArticlesFeed 
          onVisitUser={onVisitUser} 
          onSelectArticle={onSelectArticle} 
          onNewArticle={onNewArticle} 
          currentUser={currentUser}
          searchQuery={searchQuery}
        />
      ) : activeCategory === 'PODCASTS' ? (
        <div className="flex-1 overflow-y-auto h-full w-full">
          <PodcastsView />
        </div>
      ) : activeCategory === 'LIVE_NEWS' ? (
        <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {liveNewsFeeds.map(feed => (
              <div key={feed.id} className="bg-white/5 border border-white/5 rounded-3xl overflow-hidden group">
                <div className="aspect-video relative">
                  <iframe 
                    src={`${feed.url}?autoplay=0&controls=1`} 
                    className="w-full h-full object-cover"
                    allowFullScreen
                  />
                  {feed.status === 'LIVE' && (
                    <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse pointer-events-none">
                      Live
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-lg mb-2">{feed.title}</h3>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-40">
                    {feed.ownerName}
                  </div>
                </div>
              </div>
            ))}
            {liveNewsFeeds.length === 0 && (
              <div className="col-span-full py-20 text-center opacity-30 text-sm font-black uppercase tracking-[0.3em]">
                No Live News Feeds Found
              </div>
            )}
          </div>
        </main>
      ) : activeCategory.startsWith('SPORTS') ? (
        <main className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-8">
          {/* League sub-tabs */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {SPORTS_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSportsTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-xl ${
                  activeSportsTab === tab.id ? 'bg-small-orange text-white transform -translate-y-1' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                }`}
              >
                {LEAGUE_LOGOS[tab.id] && (
                  <img
                    src={LEAGUE_LOGOS[tab.id]}
                    alt=""
                    className="w-5 h-5 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                {tab.label}
              </button>
            ))}
          </div>

          {/* My Teams bar */}
          <div className="bg-gradient-to-r from-white/10 to-transparent border border-white/10 p-6 rounded-[2rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-small-orange/10 rounded-full blur-[80px] -z-10 group-hover:bg-small-orange/20 transition-all duration-700" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4 flex items-center gap-3">
              <Zap size={18} className="text-small-orange" /> My Teams
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              {favoriteTeams.map(t => (
                <button
                  key={t.name}
                  onClick={() => {
                    const event = new CustomEvent('NAVIGATE', { detail: { target: 'TEAM_DETAIL', params: { teamName: t.name } } });
                    window.dispatchEvent(event);
                  }}
                  className="flex items-center gap-3 bg-black/40 hover:bg-black/60 border border-white/10 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-transform hover:scale-105 active:scale-95"
                >
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/10">
                    <img loading="lazy" decoding="async" src={t.logo} className="w-full h-full object-contain p-1" alt={t.name} />
                  </div>
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-[9px] uppercase text-small-orange tracking-widest leading-none">{t.league}</span>
                    <span className="leading-none">{t.name}</span>
                  </div>
                  <span onClick={(e) => { e.stopPropagation(); removeTeam(t.name); }} className="text-white/20 hover:text-red-500 ml-1 p-1 bg-white/5 rounded-full z-10"><X size={10} /></span>
                </button>
              ))}
              <div className="flex items-center gap-2 bg-black/40 rounded-xl border border-white/10 overflow-hidden focus-within:border-small-orange transition-colors">
                <input
                  type="text"
                  value={newTeam}
                  onChange={e => setNewTeam(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTeam()}
                  placeholder="Find Team..."
                  disabled={isSearchingTeam}
                  className="bg-transparent px-4 py-2 text-xs font-bold text-white focus:outline-none w-40 uppercase tracking-widest placeholder:text-white/20 disabled:opacity-50"
                />
                <button onClick={addTeam} disabled={isSearchingTeam} className="p-2 bg-small-orange text-white hover:brightness-110 transition-all disabled:opacity-50 disabled:bg-gray-600">
                  {isSearchingTeam ? <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Rich Sports Center for major leagues, Esports, and Racing */}
          {['SPORTS_NBA', 'SPORTS_NFL', 'SPORTS_NHL', 'SPORTS_MLB', 'SPORTS_NCAA', 'SPORTS_ESPORTS', 'SPORTS_F1', 'SPORTS_NASCAR', 'SPORTS_INDYCAR', 'SPORTS_FIFA', 'SPORTS_MLS'].includes(activeSportsTab) && (
            <SportsCenterView selectedSportsTab={activeSportsTab.replace('SPORTS_', '')} />
          )}

          {/* League picker + cross-league headlines for All Sports */}
          {activeSportsTab === 'SPORTS_ALL' && (
            <div className="space-y-8">
              {/* League tiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { id: 'SPORTS_NBA',    label: 'NBA' },
                  { id: 'SPORTS_NFL',    label: 'NFL' },
                  { id: 'SPORTS_NHL',    label: 'NHL' },
                  { id: 'SPORTS_MLB',    label: 'MLB' },
                  { id: 'SPORTS_NCAA',   label: 'NCAA' },
                  { id: 'SPORTS_ESPORTS',label: 'Esports' },
                ].map(l => (
                  <button
                    key={l.id}
                    onClick={() => setActiveSportsTab(l.id)}
                    className="flex flex-col items-center justify-center gap-3 p-6 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-white/10 hover:border-small-orange transition-all group"
                  >
                    {LEAGUE_LOGOS[l.id] ? (
                      <img
                        src={LEAGUE_LOGOS[l.id]}
                        alt={l.label}
                        className="w-14 h-14 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="w-14 h-14 flex items-center justify-center text-3xl font-black text-white/30">{l.label[0]}</span>
                    )}
                    <span className="text-xs font-black uppercase tracking-widest group-hover:text-small-orange transition-colors">{l.label}</span>
                  </button>
                ))}
              </div>

              {/* Cross-league news when available */}
              {items.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Headlines Across Sports</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {items.slice(0, 8).map((item, idx) => (
                      <motion.a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.04 }}
                        className="flex gap-4 p-5 bg-white/5 border border-white/5 rounded-[1.5rem] hover:border-white/20 transition-all group"
                      >
                        {item.imageUrl && (
                          <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                            <img loading="lazy" decoding="async" src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase mb-1 text-small-orange">{item.source}</p>
                          <h3 className="text-sm font-black uppercase tracking-tight line-clamp-2 group-hover:text-small-orange transition-colors">{item.title}</h3>
                        </div>
                      </motion.a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      ) : (
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
          {/* Global News sub-category pills */}
          {activeCategory === 'GENERAL' && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {NEWS_SUBCATS.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setNewsSubcat(sub.id)}
                  className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                    newsSubcat === sub.id ? 'bg-small-orange text-white shadow-lg shadow-small-orange/30' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}

          {activeCategory === 'FINANCE' && markets.length > 0 && (
            <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {markets.map((m: any) => (
                <div key={m.id} className="p-6 bg-white/5 rounded-2xl flex flex-col items-center justify-center gap-2">
                  <img loading="lazy" decoding="async" src={m.image || ''} className="w-8 h-8 rounded-full" />
                  <div className="text-sm font-black">${m.current_price?.toLocaleString() || 'N/A'}</div>
                </div>
              ))}
            </section>
          )}
          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 p-5 bg-white/5 rounded-[1.5rem] animate-pulse">
                  <div className="w-24 h-20 rounded-xl bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-3 py-1">
                    <div className="h-2.5 bg-white/10 rounded w-1/4" />
                    <div className="h-3 bg-white/10 rounded w-full" />
                    <div className="h-3 bg-white/10 rounded w-5/6" />
                    <div className="h-2 bg-white/5 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <div className={`grid gap-4 ${activeCategory === 'GENERAL' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
              {/* Hero card â€” first article gets a full-width feature treatment */}
              {activeCategory === 'GENERAL' && items[0] && (
                <a
                  href={items[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="lg:col-span-2 group relative rounded-[2rem] overflow-hidden border border-white/5 hover:border-white/20 transition-all block"
                  style={{ minHeight: 280 }}
                >
                  {items[0].imageUrl
                    ? <img src={items[0].imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" loading="lazy" />
                    : <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                  <div className="relative z-10 p-8 flex flex-col justify-end h-full">
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-small-orange mb-2">{items[0].source} Â· {items[0].date}</p>
                    <h2 className="text-2xl lg:text-4xl font-black uppercase tracking-tight leading-tight mb-3 group-hover:text-small-orange transition-colors max-w-3xl">{items[0].title}</h2>
                    <p className="text-sm text-white/50 line-clamp-2 max-w-2xl">{items[0].content}</p>
                  </div>
                </a>
              )}

              {/* Rest of articles â€” side-by-side thumbnail layout */}
              {(activeCategory === 'GENERAL' ? items.slice(1) : items).map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-5 p-6 bg-white/5 border border-white/5 rounded-[1.5rem] hover:border-white/20 hover:bg-white/[0.08] transition-all group"
                >
                  {item.imageUrl && (
                    <div className="w-36 h-28 rounded-xl overflow-hidden shrink-0 bg-white/5">
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-1.5">{item.source} Â· {item.date}</p>
                      <h3 className="text-sm font-black uppercase tracking-tight leading-snug line-clamp-3 group-hover:text-small-orange transition-colors">{item.title}</h3>
                    </div>
                    <p className="text-[11px] text-white/30 line-clamp-2 leading-relaxed">{item.content}</p>
                  </div>
                  <ExternalLink size={14} className="text-white/20 group-hover:text-small-orange transition-colors shrink-0 mt-1" />
                </a>
              ))}

              {!loading && items.length === 0 && (
                <div className="lg:col-span-2 py-20 text-center text-white/20 text-[10px] font-black uppercase tracking-widest">No articles found</div>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  );
};
