import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Brain, Bookmark, ExternalLink, RefreshCw, ChevronRight,
  Newspaper, Zap, TrendingUp, BookOpen, Filter,
} from 'lucide-react';
import { fetchLeagueNews } from '../services/sportsService';
import { Article } from '../types';

// ─── Article normalizer (mirror of PlajahSportsView helper) ──────────────────
const normalize = (item: any, league: string): Article => ({
  id: String(item.id || item.guid || item.url || item.links?.web?.href || item.headline || item.title || Math.random()),
  title: item.title || item.headline || 'Sports update',
  content: item.content || item.summary || item.description || item.descriptionText || '',
  source: item.source || item.byline || league,
  url: item.url || item.links?.web?.href || '#',
  imageUrl: item.imageUrl || item.images?.[0]?.url || item.images?.[0]?.href || '',
  timestamp: item.timestamp || (item.published ? new Date(item.published).getTime() : Date.now()),
} as Article);

// ─── Leagues to aggregate for the Intelligence feed ──────────────────────────
const INTEL_LEAGUES = [
  { id: 'NBA',    label: 'NBA',       color: '#C9082A' },
  { id: 'NFL',    label: 'NFL',       color: '#013369' },
  { id: 'FIFA',   label: 'Football',  color: '#39B54A' },
  { id: 'F1',     label: 'Formula 1', color: '#E10600' },
  { id: 'MLB',    label: 'MLB',       color: '#002D72' },
  { id: 'UFC',    label: 'UFC',       color: '#D20A0A' },
] as const;

// ─── Saved bookmarks key ──────────────────────────────────────────────────────
const CACHE_KEY = 'sportsIntelCache_v1';
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// ─── Article card ─────────────────────────────────────────────────────────────
const IntelCard: React.FC<{
  article: Article;
  featured?: boolean;
  bookmarked: boolean;
  onBookmark: () => void;
}> = ({ article, featured, bookmarked, onBookmark }) => {
  const league = (article.source ?? '').toUpperCase();
  const leagueColor = INTEL_LEAGUES.find(l => league.includes(l.id) || l.id === league)?.color ?? '#FF8C00';

  return (
    <div className={`group relative bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden hover:border-white/18 transition-all flex ${featured ? 'flex-col' : 'flex-row gap-4 p-4'}`}>
      {/* Thumbnail */}
      {article.imageUrl ? (
        <div className={`overflow-hidden shrink-0 ${featured ? 'w-full aspect-video' : 'w-24 h-20 rounded-xl'}`}>
          <img
            src={article.imageUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        </div>
      ) : featured ? (
        <div className="w-full aspect-video bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0a] flex items-center justify-center">
          <Newspaper size={32} className="text-white/10" />
        </div>
      ) : null}

      {/* Content */}
      <div className={featured ? 'p-4 flex-1' : 'flex-1 min-w-0'}>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest text-white shrink-0"
            style={{ background: `${leagueColor}30`, color: leagueColor }}
          >
            {article.source}
          </span>
          {article.timestamp && (
            <span className="text-[7px] text-white/25 font-mono">
              {new Date(article.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        <h4 className={`font-black uppercase tracking-tight leading-tight group-hover:text-[#FF8C00] transition-colors line-clamp-2 ${featured ? 'text-base mb-2' : 'text-sm'}`}>
          {article.title}
        </h4>
        {featured && article.content && (
          <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">{article.content}</p>
        )}
      </div>

      {/* Actions */}
      <div className={`${featured ? 'px-4 pb-4 flex items-center gap-2' : 'flex flex-col items-end justify-between gap-1 shrink-0'}`}>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onBookmark(); }}
          title="Save to Research Notebook"
          className={`p-1.5 rounded-lg transition-all border ${bookmarked
            ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]'
            : 'bg-white/5 border-white/10 text-white/30 hover:text-[#FF8C00] hover:border-[#FF8C00]/30'
          }`}
        >
          <Bookmark size={12} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
        {article.url && article.url !== '#' && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-white hover:border-white/20 transition-all"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
};

// ─── League filter pill ───────────────────────────────────────────────────────
const LeaguePill: React.FC<{ id: string; label: string; color: string; active: boolean; onClick: () => void }> =
  ({ label, color, active, onClick }) => (
    <button
      onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border"
      style={active
        ? { background: color, borderColor: color, color: '#000' }
        : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }
      }
    >
      {label}
    </button>
  );

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  onBookmark: (article: Article) => void;
  bookmarkedIds: Set<string>;
  onOpenNotebook: () => void;
}

export const SportsIntelligenceSection: React.FC<Props> = ({ onBookmark, bookmarkedIds, onOpenNotebook }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLeague, setActiveLeague] = useState<string>('ALL');
  const cacheRef = useRef<{ ts: number; data: Article[] } | null>(null);

  const load = async () => {
    // Check in-memory cache first
    if (cacheRef.current && Date.now() - cacheRef.current.ts < CACHE_TTL) {
      setArticles(cacheRef.current.data);
      setLoading(false);
      return;
    }
    // Check localStorage cache
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          cacheRef.current = { ts, data };
          setArticles(data);
          setLoading(false);
          return;
        }
      }
    } catch {}

    setLoading(true);
    try {
      const results = await Promise.allSettled(
        INTEL_LEAGUES.map(l => fetchLeagueNews(l.id as any).then(items =>
          (items ?? []).slice(0, 5).map((item: any) => normalize(item, l.label))
        ))
      );
      const all: Article[] = [];
      results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
      // Sort by timestamp desc, deduplicate by title
      const seen = new Set<string>();
      const deduped = all
        .filter(a => { const k = a.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

      cacheRef.current = { ts: Date.now(), data: deduped };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: deduped })); } catch {}
      setArticles(deduped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const displayed = activeLeague === 'ALL'
    ? articles
    : articles.filter(a => (a.source ?? '').toUpperCase().includes(activeLeague) ||
        INTEL_LEAGUES.find(l => l.id === activeLeague)?.label.toLowerCase() === (a.source ?? '').toLowerCase()
      );

  const featured = displayed[0] ?? null;
  const rest = displayed.slice(1, 9);

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/12 border border-[#FF8C00]/25 flex items-center justify-center">
            <Brain size={16} className="text-[#FF8C00]" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Sports Intelligence</h2>
            <p className="text-[8px] text-white/30 font-mono">Headlines · Analysis · Reports</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNotebook}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-white/40 text-[8px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all"
          >
            <BookOpen size={11} /> Notebook
          </button>
          <button
            onClick={load}
            className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-white/30 hover:text-white transition-all"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* League filter pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <LeaguePill id="ALL" label="All" color="#FF8C00" active={activeLeague === 'ALL'} onClick={() => setActiveLeague('ALL')} />
        {INTEL_LEAGUES.map(l => (
          <LeaguePill key={l.id} id={l.id} label={l.label} color={l.color} active={activeLeague === l.id} onClick={() => setActiveLeague(l.id)} />
        ))}
      </div>

      {/* Content grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`rounded-[1.5rem] bg-white/5 animate-pulse ${i === 0 ? 'md:col-span-2 aspect-[2/1]' : 'h-28'}`} />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-12 text-center">
          <Newspaper size={28} className="text-white/10 mx-auto mb-3" />
          <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No articles found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Featured (spans 2 cols on md+) */}
          {featured && (
            <div className="md:col-span-2">
              <IntelCard
                article={featured}
                featured
                bookmarked={bookmarkedIds.has(featured.id)}
                onBookmark={() => onBookmark(featured)}
              />
            </div>
          )}
          {/* Remaining articles */}
          {rest.map(article => (
            <IntelCard
              key={article.id}
              article={article}
              bookmarked={bookmarkedIds.has(article.id)}
              onBookmark={() => onBookmark(article)}
            />
          ))}
        </div>
      )}

      {/* Separator */}
      <div className="h-px bg-white/5" />
    </div>
  );
};

export default SportsIntelligenceSection;
