import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadialBarChart, RadialBar
} from 'recharts';
import {
  Users, Music, Video, FileText, Gamepad2, Globe, Heart, MessageCircle,
  Play, TrendingUp, UserPlus, Layers, Radio, RefreshCw, Award, Image
} from 'lucide-react';
import { fetchAdminAnalytics, AdminAnalytics } from '../services/analyticsService';

// ── Palette ──────────────────────────────────────────────────────────────────

const GRAD = ['#D40055', '#6B0099', '#FF8C00', '#00B4D8', '#7B2FBE', '#06D6A0', '#FFD166'];

// ── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  color: string;
  delay?: number;
}> = ({ label, value, sub, icon: Icon, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="relative bg-white/[0.04] backdrop-blur-xl border border-white/[0.07] rounded-3xl p-6 overflow-hidden"
  >
    <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-2xl" style={{ background: color }} />
    <div className="flex items-start justify-between mb-4">
      <div className="p-3 rounded-2xl" style={{ background: `${color}22` }}>
        <Icon size={20} style={{ color }} />
      </div>
      {sub && <span className="text-[9px] font-black uppercase tracking-widest text-white/30 bg-white/5 px-2 py-1 rounded-full">{sub}</span>}
    </div>
    <p className="text-3xl font-black text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">{label}</p>
  </motion.div>
);

// ── Chart Card ───────────────────────────────────────────────────────────────

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; delay?: number }> = ({
  title, subtitle, children, delay = 0
}) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
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
    <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 text-xs">
      <p className="font-black uppercase tracking-widest text-white/50 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-white/70">{p.name}: </span>
          <span className="font-black text-white">{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ── Top Content Row ──────────────────────────────────────────────────────────

const LeaderRow: React.FC<{
  rank: number;
  title: string;
  sub: string;
  metricA: number;
  metricALabel: string;
  metricB: number;
  metricBLabel: string;
  thumbnail?: string;
  color: string;
}> = ({ rank, title, sub, metricA, metricALabel, metricB, metricBLabel, thumbnail, color }) => (
  <div className="flex items-center gap-4 py-3 border-b border-white/[0.05] last:border-0">
    <span className="text-[10px] font-black text-white/20 w-5 text-center">{rank}</span>
    {thumbnail ? (
      <img src={thumbnail} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
    ) : (
      <div className="w-10 h-10 rounded-xl shrink-0" style={{ background: `${color}33` }} />
    )}
    <div className="flex-1 min-w-0">
      <p className="text-xs font-black text-white truncate">{title}</p>
      <p className="text-[10px] text-white/40 truncate">{sub}</p>
    </div>
    <div className="text-right shrink-0">
      <p className="text-xs font-black text-white">{metricA.toLocaleString()}</p>
      <p className="text-[9px] text-white/30 uppercase tracking-widest">{metricALabel}</p>
    </div>
    <div className="text-right shrink-0 w-16">
      <p className="text-xs font-black" style={{ color }}>{metricB.toLocaleString()}</p>
      <p className="text-[9px] text-white/30 uppercase tracking-widest">{metricBLabel}</p>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const AdminAnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLeader, setActiveLeader] = useState<'music' | 'video' | 'post'>('music');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminAnalytics();
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-8 h-8 border-2 border-white/20 border-t-[#D40055] rounded-full animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Loading Platform Analytics…</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-red-400 text-sm">{error}</p>
      <button onClick={load} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Retry</button>
    </div>
  );

  if (!data) return null;
  const { kpis, contentBreakdown, topMusic, topVideos, topPosts, topUsers, recentSignups } = data;

  const leaderMap = { music: topMusic, video: topVideos, post: topPosts };
  const leaderColors = { music: '#D40055', video: '#6B0099', post: '#FF8C00' };
  const leaderMeta = {
    music:  { metricALabel: 'plays',    metricBLabel: 'likes',   metricAKey: 'plays', metricBKey: 'likes' },
    video:  { metricALabel: 'plays',    metricBLabel: 'likes',   metricAKey: 'plays', metricBKey: 'likes' },
    post:   { metricALabel: 'likes',    metricBLabel: 'likes',   metricAKey: 'likes', metricBKey: 'likes' },
  };

  // Radial data for content mix
  const radialData = contentBreakdown.map(c => ({ name: c.name, value: c.count, fill: c.fill }));

  return (
    <div className="space-y-10 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-6xl md:text-[8rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
            Analytics
          </h1>
          <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-4">
            Platform-wide performance metrics
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <KpiCard label="Total Users"        value={kpis.totalUsers}       icon={Users}         color="#00B4D8" delay={0.0} />
        <KpiCard label="New (30d)"          value={kpis.newUsersLast30d}  icon={UserPlus}      color="#06D6A0" delay={0.05} sub="+last 30 days" />
        <KpiCard label="Total Plays"        value={kpis.totalPlays}       icon={Play}          color="#D40055" delay={0.1} />
        <KpiCard label="Total Likes"        value={kpis.totalLikes}       icon={Heart}         color="#FF8C00" delay={0.15} />
        <KpiCard label="Comments"           value={kpis.totalComments}    icon={MessageCircle} color="#7B2FBE" delay={0.2} />
        <KpiCard label="Follows"            value={kpis.totalFollows}     icon={TrendingUp}    color="#D40055" delay={0.25} />
        <KpiCard label="Albums"             value={kpis.totalAlbums}      icon={Music}         color="#D40055" delay={0.3} />
        <KpiCard label="Videos"             value={kpis.totalVideos}      icon={Video}         color="#6B0099" delay={0.35} />
        <KpiCard label="Posts"              value={kpis.totalPosts}       icon={FileText}      color="#FF8C00" delay={0.4} />
        <KpiCard label="Worlds"             value={kpis.totalWorlds}      icon={Globe}         color="#FFD166" delay={0.45} />
        <KpiCard label="Games"              value={kpis.totalGames}       icon={Gamepad2}      color="#7B2FBE" delay={0.5} />
        <KpiCard label="Articles"           value={kpis.totalArticles}    icon={Layers}        color="#00B4D8" delay={0.55} />
        <KpiCard label="Photos"             value={kpis.totalPhotos}      icon={Image}         color="#06D6A0" delay={0.6} />
        <KpiCard label="Live Streams"       value={kpis.totalLiveStreams}  icon={Radio}         color="#D40055" delay={0.65} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Growth */}
        <ChartCard title="User Signups" subtitle="Last 6 months" delay={0.2} >
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={recentSignups} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ug" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00B4D8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00B4D8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" name="Signups" stroke="#00B4D8" fill="url(#ug)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Content Mix */}
        <ChartCard title="Content Mix" subtitle="Items per category" delay={0.25}>
          <ResponsiveContainer width="100%" height={200}>
            <RadialBarChart innerRadius="30%" outerRadius="90%" data={radialData} startAngle={90} endAngle={-270}>
              <RadialBar dataKey="value" cornerRadius={4} label={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, color: '#ffffff60' }} />
            </RadialBarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Engagement bars */}
        <ChartCard title="Engagement" subtitle="Likes & plays by content type" delay={0.3}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={contentBreakdown.filter(c => c.plays > 0 || c.likes > 0)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="name" tick={{ fill: '#ffffff30', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="plays" name="Plays" radius={[4, 4, 0, 0]}>
                {contentBreakdown.map((c, i) => <Cell key={i} fill={c.fill} />)}
              </Bar>
              <Bar dataKey="likes" name="Likes" fill="#ffffff20" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Content Count Bar */}
      <ChartCard title="Content Volume" subtitle="Total items uploaded per category" delay={0.35}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={contentBreakdown} layout="vertical" margin={{ top: 0, right: 16, left: 40, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Items" radius={[0, 6, 6, 0]}>
              {contentBreakdown.map((c, i) => <Cell key={i} fill={c.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Content */}
        <ChartCard title="Top Content" delay={0.4}>
          {/* Sub-tabs */}
          <div className="flex gap-2 mb-5">
            {(['music', 'video', 'post'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveLeader(t)}
                className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                  activeLeader === t ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div>
            {leaderMap[activeLeader].slice(0, 8).map((item, i) => (
              <LeaderRow
                key={item.id}
                rank={i + 1}
                title={item.title}
                sub={item.author}
                metricA={activeLeader === 'post' ? item.likes : item.plays}
                metricALabel={activeLeader === 'post' ? 'likes' : 'plays'}
                metricB={item.likes}
                metricBLabel="likes"
                thumbnail={item.thumbnail}
                color={leaderColors[activeLeader]}
              />
            ))}
            {leaderMap[activeLeader].length === 0 && (
              <p className="text-white/20 text-xs text-center py-8">No data yet</p>
            )}
          </div>
        </ChartCard>

        {/* Top Users */}
        <ChartCard title="Top Creators" subtitle="By follower count" delay={0.45}>
          <div>
            {topUsers.map((u, i) => (
              <div key={u.uid} className="flex items-center gap-4 py-3 border-b border-white/[0.05] last:border-0">
                <span className="text-[10px] font-black text-white/20 w-5 text-center">{i + 1}</span>
                {u.photoURL ? (
                  <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 shrink-0 flex items-center justify-center">
                    <Users size={16} className="text-white/30" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white truncate">{u.displayName}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{u.role}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-[#00B4D8]">{u.followerCount.toLocaleString()}</p>
                  <p className="text-[9px] text-white/30 uppercase tracking-widest">followers</p>
                </div>
              </div>
            ))}
            {topUsers.length === 0 && (
              <p className="text-white/20 text-xs text-center py-8">No users found</p>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Social Metrics Summary */}
      <ChartCard title="Social Metrics Overview" subtitle="Aggregate engagement across all content types" delay={0.5}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={[
              { name: 'Music',    plays: contentBreakdown[0]?.plays || 0,  likes: contentBreakdown[0]?.likes || 0 },
              { name: 'Video',    plays: contentBreakdown[1]?.plays || 0,  likes: contentBreakdown[1]?.likes || 0 },
              { name: 'Posts',    plays: 0,                                 likes: contentBreakdown[2]?.likes || 0 },
              { name: 'Articles', plays: 0,                                 likes: contentBreakdown[3]?.likes || 0 },
            ]}
            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="name" tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: '#ffffff60', paddingTop: 8 }} />
            <Bar dataKey="plays" name="Plays" fill="#D40055" radius={[4, 4, 0, 0]} />
            <Bar dataKey="likes" name="Likes" fill="#FF8C00" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default AdminAnalyticsDashboard;
