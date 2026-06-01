import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Users, MessageSquare, TrendingUp, Calendar, Heart,
  BarChart2, Crown, Clock,
} from 'lucide-react';
import { fetchClubAnalytics } from '../services/backendService';
import type { Club } from '../types';

interface Props { club: Club; }

export default function ClubAnalyticsDashboard({ club }: Props) {
  const [data, setData]   = useState<{ posts: any[]; members: any[]; events: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClubAnalytics(club.id).then(d => { setData(d); setLoading(false); });
  }, [club.id]);

  if (loading) return (
    <div className="py-16 flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-white/15 border-t-white rounded-full animate-spin" />
    </div>
  );

  if (!data) return null;

  const { posts, members, events } = data;

  const totalLikes   = posts.reduce((a: number, p: any) => a + (p.likes?.length ?? 0), 0);
  const pinnedPosts  = posts.filter((p: any) => p.isPinned).length;
  const activeMembers = members.filter((m: any) => m.status === 'ACTIVE').length;
  const pendingMembers = members.filter((m: any) => m.status === 'PENDING').length;

  // Top posts by likes
  const topPosts = [...posts].sort((a: any, b: any) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0)).slice(0, 5);

  // Post frequency — last 6 months
  const now = new Date();
  const monthLabels: string[] = [];
  const postCounts: number[]  = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(d.toLocaleString('default', { month: 'short' }));
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    postCounts.push(posts.filter((p: any) => p.timestamp >= d.getTime() && p.timestamp < next.getTime()).length);
  }
  const maxCount = Math.max(...postCounts, 1);

  // Member role breakdown
  const roleCounts: Record<string, number> = {};
  members.forEach((m: any) => { roleCounts[m.role] = (roleCounts[m.role] ?? 0) + 1; });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 p-2">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Members', value: activeMembers,    icon: Users,        color: 'text-sky-400',    bg: 'bg-sky-400/15'    },
          { label: 'Total Posts',    value: posts.length,     icon: MessageSquare,color: 'text-violet-400', bg: 'bg-violet-400/15' },
          { label: 'Total Likes',    value: totalLikes,       icon: Heart,        color: 'text-pink-400',   bg: 'bg-pink-400/15'   },
          { label: 'Events',         value: events.length,    icon: Calendar,     color: 'text-[#FF8C00]',  bg: 'bg-[#FF8C00]/15'  },
        ].map((s, i) => (
          <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
            <div className={`p-2.5 ${s.bg} rounded-xl w-fit mb-3`}><s.icon className={s.color} size={16} /></div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
            <p className="text-2xl font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pending members alert */}
      {pendingMembers > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-400/6 border border-yellow-400/15">
          <Clock size={14} className="text-yellow-400 flex-shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">
            {pendingMembers} member request{pendingMembers !== 1 ? 's' : ''} awaiting approval
          </p>
        </div>
      )}

      {/* Post frequency chart */}
      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-5">Posts per Month</p>
        <div className="flex items-end gap-3 h-24">
          {postCounts.map((count, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
              <span className="text-[8px] font-black text-white/30">{count}</span>
              <div className="w-full rounded-t-lg transition-all duration-700"
                style={{ height: `${(count / maxCount) * 80 + 4}px`, background: count > 0 ? '#818cf8' : 'rgba(255,255,255,0.06)' }} />
              <span className="text-[7px] text-white/20">{monthLabels[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top posts */}
      {topPosts.length > 0 && (
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 space-y-4">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Top Posts by Engagement</p>
          {topPosts.map((post: any, i) => (
            <div key={post.id} className="flex items-center gap-3">
              <span className="text-[9px] font-black text-white/20 w-4 text-right flex-shrink-0">{i + 1}</span>
              <p className="flex-1 text-[10px] text-white/50 truncate">{post.content?.slice(0, 80) || 'Post'}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Heart size={10} className="text-pink-400" />
                <span className="text-[9px] font-black text-white/40">{post.likes?.length ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Member role breakdown */}
      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Member Role Breakdown</p>
        {Object.entries(roleCounts).map(([role, count]) => {
          const pct = Math.round((count / Math.max(activeMembers, 1)) * 100);
          const color = role === 'OWNER' ? '#f59e0b' : role === 'ADMIN' ? '#a78bfa' : role === 'MODERATOR' ? '#60a5fa' : '#22c55e';
          return (
            <div key={role} className="flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest w-20 flex-shrink-0" style={{ color }}>{role}</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="text-[9px] font-black text-white/30 w-6 text-right">{count}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
