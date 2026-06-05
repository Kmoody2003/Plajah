/**
 * Social Insights Dashboard
 *
 * Aggregates engagement metrics across all new social features:
 * polls, challenges, broadcast channels, close friends, signature moments,
 * now-listening presence, timed reveals, and thread posts.
 *
 * Designed to sit alongside UserAnalyticsDashboard as the dedicated
 * social layer analytics view.
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import {
  BarChart2, Trophy, Megaphone, Star, Music2, Clock, MessageSquare,
  TrendingUp, Zap, ArrowLeft, Heart, Users, RefreshCw,
} from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../services/backendService';
import { formatDistanceToNow, format, subDays } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SocialMetrics {
  polls: {
    total: number;
    totalVotes: number;
    avgVotesPerPoll: number;
    topQuestion: string;
    topVotes: number;
  };
  challenges: {
    entered: number;
    totalVotesReceived: number;
    wins: number;
  };
  broadcasts: {
    channelCount: number;
    totalSubscribers: number;
    messagesSent: number;
    totalReactions: number;
  };
  closeFriends: {
    count: number;
    postsToCircle: number;
  };
  posts: {
    weeklyTimeline: { day: string; posts: number; likes: number; comments: number }[];
    topPostLikes: number;
    threadCount: number;
    timedRevealCount: number;
    pollPostCount: number;
    dataVizCount: number;
  };
  engagement: {
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    engagementRate: number;   // (likes+comments+shares) / impressions * 100
  };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}> = ({ icon: Icon, label, value, sub, color = 'text-white' }) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-2">
      {React.createElement(Icon as any, { size: 14, className: color })}
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</p>
    </div>
    <p className={`text-2xl font-black ${color}`}>{value}</p>
    {sub && <p className="text-[9px] text-white/30 mt-0.5">{sub}</p>}
  </div>
);

// ── Feature usage bar ─────────────────────────────────────────────────────────

const FeatureUsageBar: React.FC<{ label: string; count: number; max: number; color: string }> = ({ label, count, max, color }) => (
  <div className="flex items-center gap-3">
    <span className="text-[10px] text-white/50 w-28 shrink-0 truncate">{label}</span>
    <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }}
        transition={{ duration: 0.7 }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
    <span className="text-[10px] font-black text-white/40 w-6 text-right">{count}</span>
  </div>
);

// ── Custom tooltip ────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) =>
  active && payload?.length ? (
    <div className="bg-black/90 border border-white/10 rounded-xl px-3 py-2 text-xs">
      <p className="font-black text-white mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  ) : null;

// ── Main Component ────────────────────────────────────────────────────────────

interface SocialInsightsDashboardProps {
  onBack?: () => void;
}

const SocialInsightsDashboard: React.FC<SocialInsightsDashboardProps> = ({ onBack }) => {
  const [metrics, setMetrics] = useState<SocialMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }

    try {
      // Fetch user posts
      const postsSnap = await getDocs(
        query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('timestamp', 'desc'), limit(100))
      );
      const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      // Fetch challenge entries
      const challengeSnap = await getDocs(
        query(collection(db, 'challenge_entries'), where('authorId', '==', uid), limit(50))
      );
      const challengeEntries = challengeSnap.docs.map(d => d.data() as any);

      // Fetch broadcast channels owned
      const broadcastSnap = await getDocs(
        query(collection(db, 'broadcast_channels'), where('ownerId', '==', uid), limit(20))
      );
      const channels = broadcastSnap.docs.map(d => d.data() as any);

      // Fetch close friends count
      const cfSnap = await getDocs(collection(db, 'users', uid, 'close_friends'));

      // Build weekly timeline (last 7 days)
      const weeklyTimeline = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), 6 - i);
        const dayStart = d.setHours(0, 0, 0, 0);
        const dayEnd = dayStart + 86_400_000;
        const dayPosts = posts.filter(p => p.timestamp >= dayStart && p.timestamp < dayEnd);
        return {
          day: format(d, 'EEE'),
          posts: dayPosts.length,
          likes: dayPosts.reduce((s: number, p: any) => s + (p.likesCount || 0), 0),
          comments: dayPosts.reduce((s: number, p: any) => s + (p.commentsCount || 0), 0),
        };
      });

      // Poll metrics
      const pollPosts = posts.filter(p => p.poll?.question);
      const totalVotes = pollPosts.reduce((s: number, p: any) => {
        const v: Record<string, any[]> = p.poll?.votes || {};
        return s + (Object.values(v) as any[][]).reduce((sv: number, arr) => sv + arr.length, 0);
      }, 0);
      const topPollPost = pollPosts.reduce((best: any, p: any) => {
        const v = p.poll?.votes || {};
        const count = Object.values(v).reduce((sv: number, arr: any) => sv + arr.length, 0);
        return count > (best?.count || 0) ? { p, count } : best;
      }, null);

      // Engagement totals
      const totalLikes    = posts.reduce((s: number, p: any) => s + (p.likesCount || 0), 0);
      const totalComments = posts.reduce((s: number, p: any) => s + (p.commentsCount || 0), 0);
      const totalShares   = posts.reduce((s: number, p: any) => s + (p.shareCount || 0), 0);

      // Total subscribers across all channels
      const totalSubscribers = channels.reduce((s: number, c: any) => s + (c.subscriberCount || 0), 0);
      // Total reactions across broadcast messages
      const broadcastMsgsSnap = channels.length > 0 ? await getDocs(
        query(collection(db, 'broadcast_messages'), where('channelId', 'in', channels.slice(0, 10).map((c: any) => c.id)), limit(200))
      ) : null;
      const totalReactions = broadcastMsgsSnap
        ? broadcastMsgsSnap.docs.reduce((s: number, d) => {
            const r: Record<string, any[]> = d.data().reactions || {};
            return s + (Object.values(r) as any[][]).reduce((sv: number, arr) => sv + arr.length, 0);
          }, 0)
        : 0;

      setMetrics({
        polls: {
          total: pollPosts.length,
          totalVotes,
          avgVotesPerPoll: pollPosts.length > 0 ? Math.round(totalVotes / pollPosts.length) : 0,
          topQuestion: topPollPost?.p?.poll?.question || '—',
          topVotes: topPollPost?.count || 0,
        },
        challenges: {
          entered: challengeEntries.length,
          totalVotesReceived: challengeEntries.reduce((s: number, e: any) => s + (e.votes || 0), 0),
          wins: challengeEntries.filter((e: any) => e.isWinner).length,
        },
        broadcasts: {
          channelCount: channels.length,
          totalSubscribers,
          messagesSent: broadcastMsgsSnap?.docs.length || 0,
          totalReactions,
        },
        closeFriends: {
          count: cfSnap.size,
          postsToCircle: posts.filter(p => p.closeFriendsOnly).length,
        },
        posts: {
          weeklyTimeline,
          topPostLikes: posts.reduce((m: number, p: any) => Math.max(m, p.likesCount || 0), 0),
          threadCount: posts.filter(p => p.threadRoot).length,
          timedRevealCount: posts.filter(p => p.timedReveal).length,
          pollPostCount: pollPosts.length,
          dataVizCount: posts.filter(p => p.dataViz).length,
        },
        engagement: {
          totalLikes,
          totalComments,
          totalShares,
          engagementRate: posts.length > 0
            ? parseFloat(((totalLikes + totalComments + totalShares) / Math.max(posts.length, 1) * 100).toFixed(1))
            : 0,
        },
      });
    } catch (e) {
      console.error('[SocialInsights]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const featureUsageMax = metrics ? Math.max(
    metrics.posts.pollPostCount, metrics.challenges.entered,
    metrics.broadcasts.messagesSent, metrics.closeFriends.postsToCircle,
    metrics.posts.threadCount, metrics.posts.timedRevealCount,
    metrics.posts.dataVizCount, 1
  ) : 1;

  const PIE_COLORS = ['#FF8C00', '#6B0099', '#00B4D8', '#10B981', '#F43F5E'];

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Social Insights</h2>
          <p className="text-[9px] text-white/30">Engagement across all social features</p>
        </div>
        <button
          onClick={() => { setRefreshing(true); load(); }}
          className={`p-2 rounded-full hover:bg-white/10 text-white/30 hover:text-white transition-all ${refreshing ? 'animate-spin' : ''}`}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-white/20">
          <div className="w-8 h-8 border-2 border-white/10 border-t-orange-400 rounded-full animate-spin" />
          <p className="text-[9px] font-black uppercase tracking-widest">Crunching numbers…</p>
        </div>
      ) : !metrics ? (
        <div className="flex-1 flex items-center justify-center text-white/20">
          <p className="text-[10px] font-black uppercase tracking-widest">No data yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

          {/* Weekly engagement chart */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
              <TrendingUp size={12} className="text-orange-400" /> 7-Day Activity
            </p>
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={metrics.posts.weeklyTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="posts" stroke="#FF8C00" strokeWidth={2} dot={false} name="Posts" />
                  <Line type="monotone" dataKey="likes" stroke="#6B0099" strokeWidth={2} dot={false} name="Likes" />
                  <Line type="monotone" dataKey="comments" stroke="#00B4D8" strokeWidth={2} dot={false} name="Comments" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Overall engagement stats */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
              <Zap size={12} className="text-orange-400" /> Engagement
            </p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Heart} label="Total Likes" value={metrics.engagement.totalLikes} color="text-red-400" />
              <StatCard icon={MessageSquare} label="Total Comments" value={metrics.engagement.totalComments} color="text-blue-400" />
              <StatCard icon={TrendingUp} label="Engagement Rate" value={`${metrics.engagement.engagementRate}%`} sub="per post avg" color="text-green-400" />
              <StatCard icon={Users} label="Close Friends" value={metrics.closeFriends.count} color="text-yellow-400" />
            </div>
          </section>

          {/* Feature usage breakdown */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
              <BarChart2 size={12} className="text-purple-400" /> Feature Usage
            </p>
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
              <FeatureUsageBar label="Polls" count={metrics.posts.pollPostCount} max={featureUsageMax} color="bg-purple-500" />
              <FeatureUsageBar label="Challenges" count={metrics.challenges.entered} max={featureUsageMax} color="bg-yellow-500" />
              <FeatureUsageBar label="Broadcasts" count={metrics.broadcasts.messagesSent} max={featureUsageMax} color="bg-orange-500" />
              <FeatureUsageBar label="Close Friends" count={metrics.closeFriends.postsToCircle} max={featureUsageMax} color="bg-green-500" />
              <FeatureUsageBar label="Threads" count={metrics.posts.threadCount} max={featureUsageMax} color="bg-blue-500" />
              <FeatureUsageBar label="Timed Reveals" count={metrics.posts.timedRevealCount} max={featureUsageMax} color="bg-pink-500" />
              <FeatureUsageBar label="Data Viz" count={metrics.posts.dataVizCount} max={featureUsageMax} color="bg-cyan-500" />
            </div>
          </section>

          {/* Poll stats */}
          {metrics.polls.total > 0 && (
            <section>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                <BarChart2 size={12} className="text-purple-400" /> Polls
              </p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <StatCard icon={BarChart2} label="Polls Created" value={metrics.polls.total} color="text-purple-400" />
                <StatCard icon={Users} label="Total Votes" value={metrics.polls.totalVotes} color="text-purple-300" />
                <StatCard icon={TrendingUp} label="Avg Votes" value={metrics.polls.avgVotesPerPoll} color="text-purple-200" />
              </div>
              {metrics.polls.topQuestion !== '—' && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                  <p className="text-[8px] font-black uppercase tracking-widest text-purple-400/70 mb-1">Best Poll</p>
                  <p className="text-[11px] text-white/80 font-bold">"{metrics.polls.topQuestion}"</p>
                  <p className="text-[9px] text-purple-300/70 mt-0.5">{metrics.polls.topVotes} votes</p>
                </div>
              )}
            </section>
          )}

          {/* Challenge stats */}
          {metrics.challenges.entered > 0 && (
            <section>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                <Trophy size={12} className="text-yellow-400" /> Challenges
              </p>
              <div className="grid grid-cols-3 gap-3">
                <StatCard icon={Trophy} label="Entered" value={metrics.challenges.entered} color="text-yellow-400" />
                <StatCard icon={Star} label="Votes Rec'd" value={metrics.challenges.totalVotesReceived} color="text-yellow-300" />
                <StatCard icon={Trophy} label="Wins" value={metrics.challenges.wins} color="text-yellow-200" />
              </div>
            </section>
          )}

          {/* Broadcast stats */}
          {metrics.broadcasts.channelCount > 0 && (
            <section>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                <Megaphone size={12} className="text-orange-400" /> Broadcast Channels
              </p>
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={Megaphone} label="Channels" value={metrics.broadcasts.channelCount} color="text-orange-400" />
                <StatCard icon={Users} label="Subscribers" value={metrics.broadcasts.totalSubscribers} color="text-orange-300" />
                <StatCard icon={MessageSquare} label="Messages Sent" value={metrics.broadcasts.messagesSent} color="text-orange-200" />
                <StatCard icon={Heart} label="Total Reactions" value={metrics.broadcasts.totalReactions} color="text-red-400" />
              </div>
            </section>
          )}

          <div className="h-6" />
        </div>
      )}
    </div>
  );
};

export default SocialInsightsDashboard;
