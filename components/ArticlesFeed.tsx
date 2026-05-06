import React, { useState, useEffect } from 'react';
import { Article, UserProfile, FeedItem } from '../types';
import { PodcastsView } from './PodcastsView';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { GoogleGenAI } from "@google/genai";
import { 
  Search, 
  TrendingUp, 
  Clock, 
  UserPlus, 
  ChevronRight, 
  Filter,
  Pen,
  BookOpen,
  Newspaper,
  Hash,
  Globe,
  Zap,
  ExternalLink,
  Plus,
  Check,
  X,
  Radio,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { listenToGlobalArticles, searchUsers, updateUserProfile } from '../services/backendService';
import { NewstandView } from './newstand/NewstandView';
import { fetchNewsFromRSS } from '../services/rssService';

interface ArticlesFeedProps {
  onSelectArticle: (article: Article) => void;
  onVisitUser: (uid: string) => void;
  onNewArticle: () => void;
  onSelectTeam?: (teamId: string, league: string, teamName: string) => void;
  currentUser: UserProfile | null;
  searchQuery?: string;
}

const ArticlesFeed: React.FC<ArticlesFeedProps> = ({ onSelectArticle, onVisitUser, onNewArticle, onSelectTeam, currentUser, searchQuery = '' }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [featuredAuthors, setFeaturedAuthors] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'FEED' | 'AUTHORS' | 'TRENDING' | 'PODCASTS' | 'BROADCAST'>('FEED');
  const [broadCastItems, setBroadCastItems] = useState<any[]>([]);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastSubTab, setBroadcastSubTab] = useState<'GENERAL' | 'SPORTS' | 'SCIENCE' | 'FINANCE'>('GENERAL');
  const [selectedFinanceSubTab, setSelectedFinanceSubTab] = useState<'MARKETS' | 'NEWS' | 'LEARN' | 'LOCAL' | 'GLOBAL'>('MARKETS');
  const [sportsLeague, setSportsLeague] = useState<'ALL' | 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'NCAA'>('ALL');
  const [scienceCategory, setScienceCategory] = useState<'ALL' | 'SPACE' | 'TECH' | 'BIO' | 'PHYSICS'>('ALL');
  const [sportsScores, setSportsScores] = useState<any[]>([]);
  const [marketPrices, setMarketPrices] = useState<any[]>([]);
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>([]);
  const [favoriteScienceFields, setFavoriteScienceFields] = useState<string[]>([]);
  const [favoriteCoins, setFavoriteCoins] = useState<string[]>(['bitcoin', 'ethereum', 'solana']);
  const [favoriteStocks, setFavoriteStocks] = useState<string[]>(['AAPL', 'TSLA', 'NVDA']);
  const [showSportsSettings, setShowSportsSettings] = useState(false);
  const [showScienceSettings, setShowScienceSettings] = useState(false);
  const [showFinanceSettings, setShowFinanceSettings] = useState(false);
  const { theme } = useGlobalPlayerState();

  useEffect(() => {
    if (currentUser?.favoriteSportsTeams) setFavoriteTeams(currentUser.favoriteSportsTeams);
    if (currentUser?.favoriteScienceFields) setFavoriteScienceFields(currentUser.favoriteScienceFields);
    if (currentUser?.favoriteCoins) setFavoriteCoins(currentUser.favoriteCoins);
    if (currentUser?.favoriteStocks) setFavoriteStocks(currentUser.favoriteStocks);
  }, [currentUser]);

  const fetchBroadcastItems = async () => {
    setIsBroadcasting(true);
    try {
      let category = 'GENERAL';
      if (broadcastSubTab === 'SPORTS') {
        category = `SPORTS_${sportsLeague}`;
      } else if (broadcastSubTab === 'SCIENCE') {
        category = 'SCIENCE';
      } else if (broadcastSubTab === 'FINANCE') {
        category = 'FINANCE';
      }

      const items = await fetchNewsFromRSS(category);
      // Format them identically to old format for UI rendering
      const formatted = items.map((f: any, idx: number) => ({
        id: f.id,
        impactScore: 90 - idx,
        title: f.headline,
        source: f.source,
        url: f.url,
        content: f.summary,
        timestamp: f.date
      }));

      setBroadCastItems(formatted);

      if (broadcastSubTab === 'SPORTS') {
        fetchSportsScores();
      }
      if (broadcastSubTab === 'FINANCE') {
        fetchMarketPrices();
      }
    } catch (err) {
      console.error("Broadcast failed:", err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const fetchMarketPrices = async () => {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true`);
      const data = await res.json();
      setMarketPrices(data || []);
    } catch (e) {}
  };

  const fetchSportsScores = async () => {
    const endpoints: any = { NBA: 'basketball/nba', NFL: 'football/nfl', NHL: 'hockey/nhl', MLB: 'baseball/mlb', NCAA: 'basketball/mens-college-basketball' };
    
    try {
      if (sportsLeague === 'ALL') {
        const topLeagues = ['basketball/nba', 'football/nfl', 'hockey/nhl'];
        const results = await Promise.all(topLeagues.map(l => fetch(`https://site.api.espn.com/apis/site/v2/sports/${l}/scoreboard`).then(r => r.json()).catch(() => ({events: []}))));
        const allEvents = results.flatMap(r => r.events || []);
        setSportsScores(allEvents.slice(0, 15)); // Top 15 cross-sport
      } else {
        const league = endpoints[sportsLeague];
        if (!league) return;
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`);
        const data = await res.json();
        setSportsScores(data.events || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (activeTab === 'BROADCAST') {
      fetchBroadcastItems();
    }
  }, [activeTab, broadcastSubTab, sportsLeague, scienceCategory, selectedFinanceSubTab]);

  const toggleFavorite = async (type: 'TEAM' | 'SCIENCE' | 'COIN' | 'STOCK', value: string) => {
    if (!currentUser) return;
    if (type === 'TEAM') {
      const news = favoriteTeams.includes(value) ? favoriteTeams.filter(t => t !== value) : [...favoriteTeams, value];
      setFavoriteTeams(news);
      await updateUserProfile(currentUser.uid, { favoriteSportsTeams: news });
    } else if (type === 'SCIENCE') {
      const news = favoriteScienceFields.includes(value) ? favoriteScienceFields.filter(t => t !== value) : [...favoriteScienceFields, value];
      setFavoriteScienceFields(news);
      
      const currentPublic = currentUser?.publicInterests || [];
      const newPublic = news.includes(value)
        ? Array.from(new Set([...currentPublic, `Science: ${value}`]))
        : currentPublic.filter(p => !p.startsWith(`Science: ${value}`));

      await updateUserProfile(currentUser.uid, { 
        favoriteScienceFields: news,
        publicInterests: newPublic
      });
    } else if (type === 'COIN') {
      const news = favoriteCoins.includes(value) ? favoriteCoins.filter(c => c !== value) : [...favoriteCoins, value];
      setFavoriteCoins(news);
      await updateUserProfile(currentUser.uid, { favoriteCoins: news });
    } else if (type === 'STOCK') {
      const news = favoriteStocks.includes(value) ? favoriteStocks.filter(s => s !== value) : [...favoriteStocks, value];
      setFavoriteStocks(news);
      await updateUserProfile(currentUser.uid, { favoriteStocks: news });
    }
  };

  useEffect(() => {
    const unsubscribe = listenToGlobalArticles(setArticles);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchAuthors = async () => {
      const users = await searchUsers('');
      setFeaturedAuthors(users.filter(u => u.accountType === 'WRITER' || u.isArtist).slice(0, 6));
    };
    fetchAuthors();
  }, []);

  const filteredArticles = articles.filter(a => 
    (a.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.authorName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden bg-transparent text-[var(--text-primary)] transition-colors duration-500`}>
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col lg:flex-row max-w-7xl mx-auto border-x border-white/5">
          {/* Main Feed Column */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-8 lg:p-16 space-y-12 pb-32">
            <div className="space-y-12">
            {activeTab === 'FEED' && (
              <>
                {filteredArticles.map((article, idx) => {
                  if (!article) {
                    console.error("Null article found at index", idx);
                    return null;
                  }
                  return (
                  <motion.article 
                    key={article.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => onSelectArticle(article)}
                    className="group cursor-pointer"
                  >
                    <div className="flex flex-col lg:flex-row gap-8">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                          <img src={article.authorPhoto || null} className="w-6 h-6 rounded-full border border-white/10" />
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{article.authorName}</span>
                          <span className="text-[10px] font-bold opacity-20">•</span>
                          <span className="text-[10px] font-bold opacity-20 uppercase tracking-widest">
                            {article.timestamp && !isNaN(new Date(article.timestamp).getTime()) 
                                ? new Date(article.timestamp).toLocaleDateString() 
                                : 'Unknown'}
                          </span>
                        </div>
                        <h2 className="text-2xl lg:text-4xl font-black uppercase tracking-tighter mb-4 group-hover:text-small-orange transition-colors leading-tight">
                          {article.title}
                        </h2>
                        <p className="text-sm opacity-40 line-clamp-3 mb-6 leading-relaxed font-medium">
                          {article.subtitle || article.blocks?.find(b => b.type === 'TEXT')?.content}
                        </p>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-20">
                            <Clock size={12} />
                            <span>{article.readTime || 5} min read</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-20">
                            <Hash size={12} />
                            <span>{article.category || 'Article'}</span>
                          </div>
                        </div>
                      </div>
                      {article.coverImage && (
                        <div className="w-full lg:w-64 aspect-video lg:aspect-square rounded-3xl overflow-hidden border border-white/5 shrink-0">
                          <img src={article.coverImage || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        </div>
                      )}
                    </div>
                    <div className="mt-12 h-px bg-white/5 w-full" />
                  </motion.article>
                  );
                })}
                {filteredArticles.length === 0 && (
                  <div className="py-32 text-center">
                    <BookOpen size={48} className="mx-auto mb-6 opacity-10" />
                    <p className="text-sm font-black uppercase tracking-widest opacity-20">No articles found matching your search</p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'BROADCAST' && (
              <NewstandView 
                onVisitUser={onVisitUser} 
                onSelectArticle={onSelectArticle} 
                onNewArticle={onNewArticle || (() => {})} 
                currentUser={currentUser} 
              />
            )}

            {activeTab === 'AUTHORS' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {featuredAuthors.map(author => (
                  <div 
                    key={author.uid}
                    onClick={() => onVisitUser(author.uid)}
                    className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 hover:bg-white/10 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-small-orange group-hover:scale-105 transition-all">
                        <img src={author.photoURL || null} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter">{author.displayName}</h3>
                        <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-3">{author.accountType || 'Writer'}</p>
                        <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-small-orange">
                          View Profile <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'TRENDING' && (
              <div className="space-y-8">
                <div className="p-12 bg-white/5 rounded-[3rem] border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 opacity-5">
                    <TrendingUp size={120} />
                  </div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter italic mb-4">Trending Frequency</h2>
                  <p className="text-sm opacity-40 uppercase tracking-widest font-bold">The most impactful stories across the interstellar network</p>
                </div>
                {articles.filter(a => (a.likesCount || 0) > 5).map((article, idx) => (
                  <div key={article.id} onClick={() => onSelectArticle(article)} className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 hover:bg-white/10 transition-all cursor-pointer">
                    <h3 className="text-xl font-black uppercase tracking-tight">{article.title}</h3>
                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-2">{article.authorName} • {new Date(article.timestamp).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'PODCASTS' && <PodcastsView />}
          </div>
        </div>

        {/* Sidebar Column - Independent Scroll */}
        <aside className="lg:w-[400px] w-full border-l border-white/5 overflow-y-auto no-scrollbar p-8 lg:p-16 space-y-12 pb-32">
            <section>
              <div className="flex items-center gap-3 mb-8">
                <TrendingUp size={16} className="text-small-orange" />
                <h3 className="text-xs font-black uppercase tracking-widest">Trending Topics</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {['Journalism', 'Technology', 'Music Theory', 'Art History', 'Creative Writing', 'Philosophy', 'Culture'].map(topic => (
                  <button key={topic} className="px-5 py-2 bg-white/5 hover:bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest transition-all">
                    {topic}
                  </button>
                ))}
              </div>
            </section>

            <section className="p-8 bg-gradient-to-br from-small-orange/20 to-transparent rounded-[2.5rem] border border-small-orange/10">
              <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Become a Writer</h3>
              <p className="text-xs opacity-60 leading-relaxed mb-8 font-medium">
                Share your stories, essays, and journalism with a global audience of creators and fans.
              </p>
              <button 
                onClick={onNewArticle}
                className="w-full py-4 bg-[var(--text-primary)] text-[var(--bg-color)] rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
              >
                Create Newsletter
              </button>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-8">
                <Newspaper size={16} className="text-small-orange" />
                <h3 className="text-xs font-black uppercase tracking-widest">Featured Publications</h3>
              </div>
              <div className="space-y-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 group cursor-pointer">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all">
                      <BookOpen size={20} className="opacity-20" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest">The Creative Pulse</h4>
                      <p className="text-[8px] font-bold opacity-20 uppercase tracking-widest">Weekly Newsletter • 12k Readers</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default ArticlesFeed;
