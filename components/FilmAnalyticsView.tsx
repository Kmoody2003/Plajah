import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Film, Play, ShoppingBag, Ticket, Users, TrendingUp, BarChart2, ChevronDown } from 'lucide-react';
import { fetchFilmAnalytics } from '../services/analyticsService';
import { auth } from '../services/backendService';
import type { FilmVideoAnalytics } from '../types';

// ── Drop-off heatmap bar ───────────────────────────────────────────────────────

function DropOffHeatmap({ segments }: { segments: FilmVideoAnalytics['dropOffSegments'] }) {
  const maxRate = Math.max(...segments.map(s => s.dropOffRate), 0.01);
  return (
    <div className="space-y-1.5">
      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Viewer Drop-off by 10% Segments</p>
      <div className="flex items-end gap-1.5 h-20">
        {segments.map(seg => {
          const heightPct = (seg.dropOffRate / maxRate) * 100;
          const color = seg.dropOffRate > 0.15 ? '#ef4444' : seg.dropOffRate > 0.07 ? '#f59e0b' : '#22c55e';
          return (
            <div key={seg.pct} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${seg.pct}% mark: ${(seg.dropOffRate * 100).toFixed(1)}% drop-off`}>
              <div
                className="w-full rounded-t-sm transition-all duration-700"
                style={{ height: `${Math.max(4, heightPct)}%`, background: color, opacity: 0.8 }}
              />
              <span className="text-[7px] text-white/20">{seg.pct}%</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2">
        {[{ color: '#22c55e', label: 'Low drop-off' }, { color: '#f59e0b', label: 'Moderate' }, { color: '#ef4444', label: 'High drop-off' }].map(l => (
          <span key={l.label} className="flex items-center gap-1 text-[8px] text-white/25">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: l.color }} />{l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Source attribution mini-chart ─────────────────────────────────────────────

function SourceChart({ sources }: { sources: FilmVideoAnalytics['sourceAttribution'] }) {
  const total = sources.reduce((a, s) => a + s.conversions, 0) || 1;
  const colors = ['#FF8C00', '#818cf8', '#22c55e', '#f472b6', '#38bdf8'];
  return (
    <div className="space-y-2">
      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Viewer Source Attribution</p>
      {sources.map((s, i) => (
        <div key={s.source} className="flex items-center gap-3">
          <span className="text-[9px] text-white/40 w-24 flex-shrink-0 truncate">{s.source}</span>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(s.conversions / total) * 100}%`, background: colors[i % colors.length] }}
            />
          </div>
          <span className="text-[9px] font-black text-white/40 w-8 text-right">{Math.round((s.conversions / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmAnalyticsView() {
  const [data, setData] = useState<FilmVideoAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchFilmAnalytics(auth.currentUser.uid).then(results => {
      setData(results);
      if (results.length > 0) setSelectedId(results[0].videoId);
      setLoading(false);
    });
  }, []);

  const selected = data.find(d => d.videoId === selectedId);

  const totalRentals   = data.reduce((a, d) => a + d.rentalCount,   0);
  const totalPurchases = data.reduce((a, d) => a + d.purchaseCount, 0);
  const totalPPV       = data.reduce((a, d) => a + d.ppvCount,      0);
  const totalViewers   = data.reduce((a, d) => a + d.uniqueViewers, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Film<br />Analytics</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Completion · Drop-off · Conversions · Sources</p>
      </div>

      {/* Platform-wide KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Unique Viewers', value: totalViewers,   icon: Users,       color: 'text-sky-400',    bg: 'bg-sky-400/15'    },
          { label: 'Rentals',        value: totalRentals,   icon: Play,        color: 'text-violet-400', bg: 'bg-violet-400/15' },
          { label: 'Purchases',      value: totalPurchases, icon: ShoppingBag, color: 'text-[#FF8C00]',  bg: 'bg-[#FF8C00]/15'  },
          { label: 'PPV Tickets',    value: totalPPV,       icon: Ticket,      color: 'text-pink-400',   bg: 'bg-pink-400/15'   },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6">
            <div className={`p-3 ${s.bg} rounded-xl w-fit mb-3`}>
              <s.icon className={s.color} size={18} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
            <p className="text-3xl font-black">{loading ? '–' : s.value.toLocaleString()}</p>
          </motion.div>
        ))}
      </div>

      {/* Film selector + detail panel */}
      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/15 border-t-white rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <BarChart2 size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No film analytics yet</p>
          <p className="text-[9px] text-white/12">Data populates once your films have been viewed</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Film dropdown */}
          <div className="relative w-full max-w-sm">
            <select
              value={selectedId ?? ''}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none focus:border-white/25 pr-10"
            >
              {data.map(d => (
                <option key={d.videoId} value={d.videoId}>{d.title}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>

          {selected && (
            <motion.div key={selected.videoId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Completion rate card */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4">Completion Rate</p>
                <div className="flex items-end gap-4 mb-5">
                  <span className="text-5xl font-black text-white">
                    {Math.round(selected.completionRate * 100)}%
                  </span>
                  <div className="pb-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                      selected.completionRate >= 0.7 ? 'bg-green-500/15 text-green-400' :
                      selected.completionRate >= 0.4 ? 'bg-yellow-500/15 text-yellow-400' :
                      'bg-red-500/15 text-red-400'
                    }`}>
                      {selected.completionRate >= 0.7 ? 'Strong' : selected.completionRate >= 0.4 ? 'Average' : 'Low'}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${selected.completionRate * 100}%`,
                      background: selected.completionRate >= 0.7 ? '#22c55e' : selected.completionRate >= 0.4 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
                <p className="text-[9px] text-white/30">
                  Avg watch time: {Math.floor(selected.avgWatchDuration / 60)}m {selected.avgWatchDuration % 60}s
                </p>
              </div>

              {/* Monetization breakdown */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4">Monetization Breakdown</p>
                <div className="space-y-4">
                  {[
                    { label: 'Unique Viewers', value: selected.uniqueViewers,  icon: Users,       color: '#38bdf8' },
                    { label: 'Rentals',         value: selected.rentalCount,   icon: Play,        color: '#818cf8' },
                    { label: 'Purchases',       value: selected.purchaseCount, icon: ShoppingBag, color: '#FF8C00' },
                    { label: 'PPV Tickets',     value: selected.ppvCount,      icon: Ticket,      color: '#f472b6' },
                  ].map(stat => (
                    <div key={stat.label} className="flex items-center gap-3">
                      <stat.icon size={14} style={{ color: stat.color }} className="flex-shrink-0" />
                      <span className="text-[10px] text-white/40 flex-1">{stat.label}</span>
                      <span className="text-sm font-black text-white">{stat.value.toLocaleString()}</span>
                    </div>
                  ))}
                  {(selected.rentalCount + selected.purchaseCount) > 0 && (
                    <div className="pt-3 border-t border-white/5">
                      <p className="text-[9px] text-white/25">
                        Conversion rate: {(((selected.rentalCount + selected.purchaseCount) / Math.max(1, selected.uniqueViewers)) * 100).toFixed(1)}% of viewers paid
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Drop-off heatmap */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7">
                <DropOffHeatmap segments={selected.dropOffSegments} />
              </div>

              {/* Source attribution */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7">
                <SourceChart sources={selected.sourceAttribution} />
              </div>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
