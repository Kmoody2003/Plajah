import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import {
  Music, Video, FileText, Gamepad2, Globe, Heart, MessageCircle, Play,
  Users, Share2, TrendingUp, RefreshCw, Star, BookOpen, Radio, Zap
} from 'lucide-react';
import { UserProfile } from '../types';
import { fetchUserAnalytics, UserAnalytics } from '../services/analyticsService';

// ── Palette ──────────────────────────────────────────────────────────────────

const ACCENT = '#D40055';
const ACCENT2 = '#6B0099';
const ORANGE = '#FF8C00';
const TEAL = '#00B4D8';
const GREEN = '#06D6A0';

// ── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  color: string;
  delay?: number;
}> = ({ label, value, icon: Icon, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.4, delay }}
    className="relative bg-white/[0.04] backdrop-blur-xl border border-white/[0.07] rounded-3xl p-5 overflow-hidden"
  >
    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-15 blur-xl" style={{ background: color }} />
    <div className="p-2.5 rounded-xl w-fit mb-3" style={{ background: `${color}20` }}>
      <Icon size={16} style={{ color }} />
    </div>
    <p className="text-2xl font-black text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mt-0.5">{label}</p>
  </motion.div>
);

// ── Chart Card ───────────────────────────────────────────────────────────────

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; delay?: number }> = ({
  title, subtitle, children, delay = 0
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.07] rounded-3xl p-6"
  >
    <div className="mb-5">
      <h3 className="text-sm font-black uppercase tracking-widest text-white">{title}</h3>
      {subtitle && <p className="text-[10px] text-white/30 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </motion.div>
);

// ── Custom Tooltip ────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 text-xs">
      <p className="font-black uppercase tracking-widest text-white/40 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-white/60">{p.name}: </span>
          <span className="font-black text-white">{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ── Section Header ────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>; label: string; color: string }> = ({ icon: Icon, label, color }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 rounded-xl" style={{ background: `${color}20` }}>
      <Icon size={14} style={{ color }} />
    </div>
    <h2 className="text-[10px] font-black uppercase tracking-widest text-white/60">{label}</h2>
    <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${color}40, transparent)` }} />
  </div>
);

// ── Empty State ───────────────────────────────────────────────────────────────

const Empty: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-white/20 text-xs text-center py-6">{label}</p>
);

// ── Content Row ───────────────────────────────────────────────────────────────

const ContentRow: React.FC<{
  rank: number;
  title: string;
  metrics: { label: string; value: number; color: string }[];
  thumbnail?: string;
}> = ({ rank, title, metrics, thumbnail }) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
    <span className="text-[9px] font-black text-white/20 w-4">{rank}</span>
    {thumbnail ? (
      <img src={thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
    ) : (
      <div className="w-9 h-9 rounded-lg bg-white/5 shrink-0" />
    )}
    <p className="flex-1 text-xs font-black text-white truncate">{title}</p>
    {metrics.map((m, i) => (
      <div key={i} className="text-right shrink-0">
        <p className="text-xs font-black" style={{ color: m.color }}>{m.value.toLocaleString()}</p>
        <p className="text-[8px] text-white/25 uppercase tracking-wider">{m.label}</p>
      </div>
    ))}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

interface UserAnalyticsDashboardProps {
  currentUser: UserProfile;
}

const UserAnalyticsDashboard: React.FC<UserAnalyticsDashboardProps> = ({ currentUser }) => {
  const [data, setData] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchUserAnalytics(currentUser.uid, currentUser);
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentUser.uid]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-8 h-8 border-2 border-white/20 border-t-[#D40055] rounded-full animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Loading Your Analytics…</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-red-400 text-sm">{error}</p>
      <button onClick={load} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Retry</button>
    </div>
  );

  if (!data) return null;
  const { kpis, albums, videos, posts, articles, games, worlds, engagementTimeline } = data;

  // Radar chart: content diversity
  const radarData = [
    { subject: 'Music',    value: Math.min(kpis.totalAlbums * 10, 100) },
    { subject: 'Video',    value: Math.min(kpis.totalVideos * 10, 100) },
    { subject: 'Posts',    value: Math.min(kpis.totalPosts * 5, 100) },
    { subject: 'Articles', value: Math.min(kpis.totalArticles * 8, 100) },
    { subject: 'Games',    value: Math.min(kpis.totalGames * 15, 100) },
    { subject: 'Worlds',   value: Math.min(kpis.totalWorlds * 20, 100) },
  ];

  // Top albums bar data
  const albumBarData = albums.slice(0, 8).map(a => ({ name: a.title.slice(0, 14), plays: a.plays, likes: a.likes }));
  const videoBarData = videos.slice(0, 8).map(v => ({ name: v.title.slice(0, 14), plays: v.plays, likes: v.likes }));

  const hasMusic    = albums.length > 0;
  const hasVideo    = videos.length > 0;
  const hasPosts    = posts.length > 0;
  const hasArticles = articles.length > 0;
  const hasGames    = games.length > 0;
  const hasWorlds   = worlds.length > 0;

  return (
    <div className="space-y-10 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-5xl md:text-[6rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
            My Stats
          </h1>
          <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-4">
            Your personal creator performance metrics
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10 transition-all"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard label="Followers"      value={kpis.followerCount}  icon={Users}          color={TEAL}    delay={0.0} />
        <KpiCard label="Following"      value={kpis.followingCount} icon={TrendingUp}     color={GREEN}   delay={0.05} />
        <KpiCard label="Total Plays"    value={kpis.totalPlays}     icon={Play}           color={ACCENT}  delay={0.1} />
        <KpiCard label="Total Likes"    value={kpis.totalLikes}     icon={Heart}          color={ORANGE}  delay={0.15} />
        <KpiCard label="Comments"       value={kpis.totalComments}  icon={MessageCircle}  color={ACCENT2} delay={0.2} />
        <KpiCard label="Shares"         value={kpis.totalShares}    icon={Share2}         color={ORANGE}  delay={0.25} />
        <KpiCard label="Points"         value={kpis.points}         icon={Zap}            color="#FFD166" delay={0.3} />
        <KpiCard label="Albums"         value={kpis.totalAlbums}    icon={Music}          color={ACCENT}  delay={0.35} />
        <KpiCard label="Videos"         value={kpis.totalVideos}    icon={Video}          color={ACCENT2} delay={0.4} />
        <KpiCard label="Posts"          value={kpis.totalPosts}     icon={FileText}       color={ORANGE}  delay={0.45} />
        <KpiCard label="Articles"       value={kpis.totalArticles}  icon={BookOpen}       color={TEAL}    delay={0.5} />
        <KpiCard label="Games"          value={kpis.totalGames}     icon={Gamepad2}       color={ACCENT2} delay={0.55} />
      </div>

      {/* Engagement Timeline + Content Diversity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartCard title="Engagement Over Time" subtitle="Plays & likes from your content by month" delay={0.2}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={engagementTimeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="playsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ACCENT} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="likesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ORANGE} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="label" tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: '#ffffff50', paddingTop: 8 }} />
                <Area type="monotone" dataKey="plays" name="Plays" stroke={ACCENT} fill="url(#playsGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="likes" name="Likes" stroke={ORANGE} fill="url(#likesGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Content Diversity" subtitle="How varied your catalog is" delay={0.25}>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#ffffff10" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#ffffff40', fontSize: 9 }} />
              <Radar name="Content" dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Music Section */}
      {hasMusic && (
        <div className="space-y-4">
          <SectionHeader icon={Music} label="Music Performance" color={ACCENT} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Albums by Plays" delay={0.3}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={albumBarData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="name" tick={{ fill: '#ffffff30', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#ffffff30', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="plays" name="Plays" fill={ACCENT} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="likes" name="Likes" fill={ORANGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Albums" delay={0.35}>
              {albums.slice(0, 6).map((a, i) => (
                <ContentRow
                  key={a.id}
                  rank={i + 1}
                  title={a.title}
                  thumbnail={a.thumbnail}
                  metrics={[
                    { label: 'plays', value: a.plays, color: ACCENT },
                    { label: 'likes', value: a.likes, color: ORANGE },
                  ]}
                />
              ))}
            </ChartCard>
          </div>
        </div>
      )}

      {/* Video Section */}
      {hasVideo && (
        <div className="space-y-4">
          <SectionHeader icon={Video} label="Video Performance" color={ACCENT2} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Videos by Views" delay={0.3}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={videoBarData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="name" tick={{ fill: '#ffffff30', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#ffffff30', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="plays" name="Views" fill={ACCENT2} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="likes" name="Likes" fill={ORANGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Videos" delay={0.35}>
              {videos.slice(0, 6).map((v, i) => (
                <ContentRow
                  key={v.id}
                  rank={i + 1}
                  title={v.title}
                  thumbnail={v.thumbnail}
                  metrics={[
                    { label: 'views',    value: v.plays,    color: ACCENT2 },
                    { label: 'comments', value: v.comments, color: TEAL },
                  ]}
                />
              ))}
            </ChartCard>
          </div>
        </div>
      )}

      {/* Social + Articles row */}
      {(hasPosts || hasArticles) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Posts */}
          {hasPosts && (
            <div className="space-y-4">
              <SectionHeader icon={FileText} label="Social Posts" color={ORANGE} />
              <ChartCard title="Top Posts by Engagement" delay={0.3}>
                {posts.slice(0, 6).map((p, i) => (
                  <div key={p.id} className="py-2.5 border-b border-white/[0.04] last:border-0">
                    <p className="text-xs text-white/60 mb-1 truncate">{p.content || 'Post'}</p>
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1 text-[10px] font-black" style={{ color: ORANGE }}>
                        <Heart size={10} /> {p.likes.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-black text-white/30">
                        <MessageCircle size={10} /> {p.comments.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-black text-white/30">
                        <Share2 size={10} /> {p.shares.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </ChartCard>
            </div>
          )}

          {/* Articles */}
          {hasArticles && (
            <div className="space-y-4">
              <SectionHeader icon={BookOpen} label="Articles" color={TEAL} />
              <ChartCard title="Top Articles" delay={0.35}>
                {articles.slice(0, 6).map((a, i) => (
                  <ContentRow
                    key={a.id}
                    rank={i + 1}
                    title={a.title}
                    metrics={[
                      { label: 'likes',    value: a.likes,    color: TEAL },
                      { label: 'comments', value: a.comments, color: ORANGE },
                    ]}
                  />
                ))}
              </ChartCard>
            </div>
          )}
        </div>
      )}

      {/* Games + Worlds */}
      {(hasGames || hasWorlds) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {hasGames && (
            <div className="space-y-4">
              <SectionHeader icon={Gamepad2} label="Games" color={ACCENT2} />
              <ChartCard title="Game Performance" delay={0.3}>
                {games.slice(0, 6).map((g, i) => (
                  <ContentRow
                    key={g.id}
                    rank={i + 1}
                    title={g.title}
                    thumbnail={g.thumbnail}
                    metrics={[
                      { label: 'installs', value: g.installs, color: ACCENT2 },
                      { label: 'reviews',  value: g.reviews,  color: ORANGE },
                    ]}
                  />
                ))}
                {games.length === 0 && <Empty label="No games yet" />}
              </ChartCard>
            </div>
          )}

          {hasWorlds && (
            <div className="space-y-4">
              <SectionHeader icon={Globe} label="Worlds & IP" color="#FFD166" />
              <ChartCard title="Your Worlds" delay={0.35}>
                {worlds.slice(0, 6).map((w, i) => (
                  <ContentRow
                    key={w.id}
                    rank={i + 1}
                    title={w.name}
                    metrics={[
                      { label: 'likes', value: w.likes, color: '#FFD166' },
                    ]}
                  />
                ))}
                {worlds.length === 0 && <Empty label="No worlds yet" />}
              </ChartCard>
            </div>
          )}
        </div>
      )}

      {/* Nothing uploaded yet */}
      {!hasMusic && !hasVideo && !hasPosts && !hasArticles && !hasGames && !hasWorlds && (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <TrendingUp size={40} className="text-white/20" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-lg">No content yet</p>
            <p className="text-white/30 text-sm mt-1">Upload music, videos, or posts to see your analytics</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAnalyticsDashboard;
