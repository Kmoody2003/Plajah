/**
 * AdminSiteHealth — real-time platform operations dashboard.
 * Modeled after the health/ops consoles of major streaming and social platforms.
 * All counters update live via Firestore onSnapshot; no page refresh needed.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, orderBy, limit, getCountFromServer, Timestamp } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { db, auth, storage } from '../services/firebase';
import { ref, list } from 'firebase/storage';
import {
  Activity, Users, UserPlus, AlertTriangle, CheckCircle2,
  Radio, MessageCircle, Heart, Eye,
  Minus, RefreshCw, Database,
  Video, Music, FileText, Globe,
  Circle, ArrowUp, ArrowDown,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface ServiceStatus { name: string; ok: boolean | null; latencyMs?: number }
interface Metric { label: string; value: number | string; prev?: number; color: string; icon: React.ComponentType<any>; unit?: string }
interface ActivityEvent { id: string; type: string; label: string; ts: number; color: string }
interface HourlyBucket { hour: string; posts: number; plays: number; comments: number; signups: number }

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function tsAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const TREND = (val: number, prev?: number) => {
  if (prev === undefined || val === prev) return <Minus size={11} className="text-white/30" />;
  return val > prev
    ? <ArrowUp size={11} className="text-emerald-400" />
    : <ArrowDown size={11} className="text-red-400" />;
};

// ── Status dot ─────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ ok: boolean | null; label: string; latency?: number }> = ({ ok, label, latency }) => (
  <div className="flex items-center gap-2">
    {ok === null
      ? <Circle size={8} className="text-white/20 animate-pulse" />
      : ok
        ? <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        : <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)] animate-pulse" />
    }
    <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{label}</span>
    {latency !== undefined && ok && (
      <span className="text-[7px] text-white/25">{latency}ms</span>
    )}
  </div>
);

// ── Metric tile ─────────────────────────────────────────────────────────────

const MetricTile: React.FC<{ m: Metric; delay?: number }> = ({ m, delay = 0 }) => {
  const Icon = m.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="relative rounded-2xl p-4 border border-white/8 overflow-hidden"
      style={{ background: `${m.color}08` }}
    >
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-[0.07] blur-2xl" style={{ background: m.color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-xl" style={{ background: `${m.color}18` }}>
          <Icon size={15} style={{ color: m.color }} />
        </div>
        {TREND(typeof m.value === 'number' ? m.value : 0, m.prev)}
      </div>
      <p className="text-2xl font-black text-white leading-none">
        {typeof m.value === 'number' ? fmtNum(m.value) : m.value}
        {m.unit && <span className="text-xs font-normal text-white/30 ml-1">{m.unit}</span>}
      </p>
      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/35 mt-1">{m.label}</p>
    </motion.div>
  );
};

// ── Mini bar chart ──────────────────────────────────────────────────────────

const MiniBar: React.FC<{ values: number[]; color: string; height?: number }> = ({ values, color, height = 32 }) => {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all duration-500"
          style={{ height: `${Math.max(4, (v / max) * height)}px`, background: i === values.length - 1 ? color : `${color}55` }}
        />
      ))}
    </div>
  );
};

// ── Activity event row ──────────────────────────────────────────────────────

const EventRow: React.FC<{ event: ActivityEvent }> = ({ event }) => (
  <motion.div
    initial={{ opacity: 0, x: -8 }}
    animate={{ opacity: 1, x: 0 }}
    className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0"
  >
    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: event.color }} />
    <p className="text-[9px] text-white/60 flex-1 min-w-0 truncate">{event.label}</p>
    <span className="text-[7px] text-white/25 shrink-0">{tsAgo(event.ts)}</span>
  </motion.div>
);

// ── Main component ──────────────────────────────────────────────────────────

const AdminSiteHealth: React.FC = () => {
  // Service health
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Firestore', ok: null },
    { name: 'Storage', ok: null },
    { name: 'Auth', ok: null },
    { name: 'Live', ok: null },
  ]);

  // Counts (getCountFromServer)
  const [counts, setCounts] = useState({
    users: 0, albums: 0, videos: 0, posts: 0,
    articles: 0, games: 0, photos: 0, follows: 0,
  });
  const prevCounts = useRef(counts);

  // Real-time activity (last 60 min)
  const [recentPosts, setRecentPosts]     = useState(0);
  const [recentPlays, setRecentPlays]     = useState(0);
  const [recentSignups, setRecentSignups] = useState(0);
  const [activeRooms, setActiveRooms]     = useState(0);
  const [roomOccupancy, setRoomOccupancy] = useState(0);

  // Live event feed
  const [feed, setFeed] = useState<ActivityEvent[]>([]);

  // Pulse: events in last 5 min
  const [pulse, setPulse] = useState(0);
  const pulseHistory = useRef<number[]>(Array(20).fill(0));
  const [pulseArr, setPulseArr] = useState<number[]>(Array(20).fill(0));

  // Hourly sparklines (last 8 hours, updated from recent data)
  const [hourly, setHourly] = useState<{ posts: number[]; signups: number[] }>({
    posts: Array(8).fill(0), signups: Array(8).fill(0),
  });

  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // ── Service health checks ────────────────────────────────────────────────

  const checkServices = useCallback(async () => {
    const results: ServiceStatus[] = [];

    // Firestore
    try {
      const t = Date.now();
      await getCountFromServer(collection(db, 'users'));
      results.push({ name: 'Firestore', ok: true, latencyMs: Date.now() - t });
    } catch { results.push({ name: 'Firestore', ok: false }); }

    // Storage (try to list root)
    try {
      const t = Date.now();
      await list(ref(storage, '/'), { maxResults: 1 });
      results.push({ name: 'Storage', ok: true, latencyMs: Date.now() - t });
    } catch { results.push({ name: 'Storage', ok: false }); }

    // Auth
    results.push({ name: 'Auth', ok: !!auth.currentUser });

    // Live feeds collection
    try {
      await getCountFromServer(collection(db, 'liveFeed'));
      results.push({ name: 'Live', ok: true });
    } catch { results.push({ name: 'Live', ok: false }); }

    setServices(results);
  }, []);

  // ── Collection counts ────────────────────────────────────────────────────

  const fetchCounts = useCallback(async () => {
    try {
      const [u, al, vi, po, ar, ga, ph, fo] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'albums')),
        getCountFromServer(collection(db, 'videos')),
        getCountFromServer(collection(db, 'posts')),
        getCountFromServer(collection(db, 'articles')),
        getCountFromServer(collection(db, 'games')),
        getCountFromServer(collection(db, 'photos')),
        getCountFromServer(collection(db, 'follows')),
      ]);
      prevCounts.current = counts;
      setCounts({
        users: u.data().count,
        albums: al.data().count,
        videos: vi.data().count,
        posts: po.data().count,
        articles: ar.data().count,
        games: ga.data().count,
        photos: ph.data().count,
        follows: fo.data().count,
      });
    } catch { /* non-fatal */ }
  }, [counts]);

  // ── Real-time listeners ──────────────────────────────────────────────────

  useEffect(() => {
    const oneHourAgo = Date.now() - 3_600_000;
    const fiveMinAgo = Date.now() - 300_000;

    const unsubs: (() => void)[] = [];

    // Recent posts (last 60 min)
    unsubs.push(onSnapshot(
      query(collection(db, 'posts'), where('timestamp', '>', oneHourAgo), orderBy('timestamp', 'desc'), limit(200)),
      snap => {
        setRecentPosts(snap.size);
        const events: ActivityEvent[] = snap.docs.slice(0, 5).map(d => ({
          id: d.id,
          type: 'post',
          label: `New post by ${(d.data() as any).authorName ?? 'user'}`,
          ts: (d.data() as any).timestamp ?? Date.now(),
          color: '#FF8C00',
        }));
        setFeed(prev => {
          const merged = [...events, ...prev.filter(e => e.type !== 'post')].slice(0, 30);
          return merged.sort((a, b) => b.ts - a.ts);
        });
      },
      () => {},
    ));

    // Recent signups (last 60 min)
    unsubs.push(onSnapshot(
      query(collection(db, 'users'), where('createdAt', '>', oneHourAgo), orderBy('createdAt', 'desc'), limit(100)),
      snap => {
        setRecentSignups(snap.size);
        const events: ActivityEvent[] = snap.docs.slice(0, 5).map(d => ({
          id: d.id,
          type: 'signup',
          label: `New user: ${(d.data() as any).displayName ?? d.id.slice(0, 8)}`,
          ts: (d.data() as any).createdAt ?? Date.now(),
          color: '#06D6A0',
        }));
        setFeed(prev => {
          const merged = [...events, ...prev.filter(e => e.type !== 'signup')].slice(0, 30);
          return merged.sort((a, b) => b.ts - a.ts);
        });
      },
      () => {},
    ));

    // Active WC video rooms
    unsubs.push(onSnapshot(
      query(collection(db, 'wcVideoRooms'), where('isActive', '==', true)),
      snap => {
        setActiveRooms(snap.size);
        const total = snap.docs.reduce((s, d) => s + ((d.data() as any).participantCount ?? 0), 0);
        setRoomOccupancy(total);
        if (snap.size > 0) {
          setFeed(prev => {
            const event: ActivityEvent = {
              id: 'rooms',
              type: 'rooms',
              label: `${snap.size} video room${snap.size !== 1 ? 's' : ''} live · ${total} viewers`,
              ts: Date.now(),
              color: '#6B0099',
            };
            return [event, ...prev.filter(e => e.type !== 'rooms')].slice(0, 30);
          });
        }
      },
      () => {},
    ));

    // Pulse: posts in last 5 min (proxy for platform activity level)
    unsubs.push(onSnapshot(
      query(collection(db, 'posts'), where('timestamp', '>', fiveMinAgo)),
      snap => {
        const val = snap.size;
        setPulse(val);
        pulseHistory.current = [...pulseHistory.current.slice(1), val];
        setPulseArr([...pulseHistory.current]);
      },
      () => {},
    ));

    // Initial data fetch
    Promise.all([checkServices(), fetchCounts()]).finally(() => setLoading(false));

    return () => unsubs.forEach(u => u());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Periodic refresh (counts every 5 min, health every 60s) ────────────

  useEffect(() => {
    const healthInterval = setInterval(checkServices, 60_000);
    const countInterval  = setInterval(() => {
      fetchCounts();
      setLastRefresh(Date.now());
    }, 300_000);
    return () => { clearInterval(healthInterval); clearInterval(countInterval); };
  }, [checkServices, fetchCounts]);

  // ── Derived metrics ──────────────────────────────────────────────────────

  const allOk = services.every(s => s.ok !== false);
  const errorCount = services.filter(s => s.ok === false).length;

  const kpiMetrics: Metric[] = [
    { label: 'Total Users',      value: counts.users,    prev: prevCounts.current.users,    color: '#06D6A0', icon: Users },
    { label: 'New This Hour',    value: recentSignups,                                       color: '#00B4D8', icon: UserPlus },
    { label: 'Posts This Hour',  value: recentPosts,                                         color: '#FF8C00', icon: MessageCircle },
    { label: 'Active Rooms',     value: activeRooms,                                         color: '#6B0099', icon: Video },
    { label: 'Total Albums',     value: counts.albums,   prev: prevCounts.current.albums,   color: '#D40055', icon: Music },
    { label: 'Total Videos',     value: counts.videos,   prev: prevCounts.current.videos,   color: '#7B2FBE', icon: Video },
    { label: 'Total Posts',      value: counts.posts,    prev: prevCounts.current.posts,    color: '#FF8C00', icon: FileText },
    { label: 'Total Follows',    value: counts.follows,  prev: prevCounts.current.follows,  color: '#FFD166', icon: Heart },
  ];

  const contentTotal = counts.albums + counts.videos + counts.posts + counts.articles + counts.games + counts.photos;

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Platform Health</h2>
          <p className="text-[9px] text-white/35 mt-0.5">Real-time operations console · auto-refreshes</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[7px] text-white/25">Last count refresh: {tsAgo(lastRefresh)}</span>
          <button
            onClick={() => { fetchCounts(); checkServices(); setLastRefresh(Date.now()); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
          >
            <RefreshCw size={10} /> Refresh
          </button>
        </div>
      </div>

      {/* ── System status bar ── */}
      <div className={`flex items-center justify-between gap-4 flex-wrap p-4 rounded-2xl border ${
        errorCount > 0
          ? 'border-red-500/25 bg-red-500/5'
          : 'border-emerald-500/20 bg-emerald-500/5'
      }`}>
        <div className="flex items-center gap-3">
          {allOk
            ? <CheckCircle2 size={16} className="text-emerald-400" />
            : <AlertTriangle size={16} className="text-red-400" />
          }
          <span className="text-[9px] font-black uppercase tracking-widest text-white/70">
            {allOk ? 'All Systems Operational' : `${errorCount} Service${errorCount !== 1 ? 's' : ''} Degraded`}
          </span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          {services.map(s => (
            <StatusDot key={s.name} ok={s.ok} label={s.name} latency={s.latencyMs} />
          ))}
        </div>
      </div>

      {/* ── Live pulse strip ── */}
      <div className="flex items-center gap-6 p-4 rounded-2xl bg-white/[0.03] border border-white/8">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-[#FF8C00]" />
            <div className="absolute inset-0 rounded-full bg-[#FF8C00] animate-ping opacity-40" />
          </div>
          <div>
            <p className="text-xl font-black text-white leading-none">{pulse}</p>
            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30">Posts / 5 min</p>
          </div>
        </div>

        <div className="flex-1">
          <MiniBar values={pulseArr} color="#FF8C00" height={40} />
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center">
            <p className="text-lg font-black text-white">{roomOccupancy}</p>
            <p className="text-[7px] text-white/30 uppercase tracking-widest">Live Viewers</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-white">{fmtNum(contentTotal)}</p>
            <p className="text-[7px] text-white/30 uppercase tracking-widest">Total Content</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-black" style={{ color: activeRooms > 0 ? '#6B0099' : 'rgba(255,255,255,0.3)' }}>
              {activeRooms}
            </p>
            <p className="text-[7px] text-white/30 uppercase tracking-widest">Active Rooms</p>
          </div>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiMetrics.map((m, i) => (
          <MetricTile key={m.label} m={m} delay={i * 0.04} />
        ))}
      </div>

      {/* ── Content breakdown + Live feed ── */}
      <div className="grid sm:grid-cols-2 gap-4">

        {/* Content breakdown */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5">
          <h3 className="text-[9px] font-black uppercase tracking-widest text-white mb-4">Content Inventory</h3>
          <div className="space-y-3">
            {[
              { label: 'Albums / Music',  count: counts.albums,   color: '#D40055',  icon: Music },
              { label: 'Videos',          count: counts.videos,   color: '#7B2FBE',  icon: Video },
              { label: 'Posts',           count: counts.posts,    color: '#FF8C00',  icon: MessageCircle },
              { label: 'Articles',        count: counts.articles, color: '#00B4D8',  icon: FileText },
              { label: 'Games',           count: counts.games,    color: '#06D6A0',  icon: Globe },
              { label: 'Photos',          count: counts.photos,   color: '#FFD166',  icon: Eye },
            ].map(({ label, count, color, icon: Icon }) => {
              const pct = contentTotal > 0 ? (count / contentTotal) * 100 : 0;
              return (
                <div key={label}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={10} style={{ color }} />
                    <span className="text-[9px] text-white/60 flex-1">{label}</span>
                    <span className="text-[9px] font-black text-white">{fmtNum(count)}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Storage note */}
          <div className="mt-5 pt-4 border-t border-white/8">
            <div className="flex items-center gap-2 mb-1">
              <Database size={10} className="text-white/30" />
              <span className="text-[8px] text-white/30 uppercase tracking-wider">Storage</span>
            </div>
            <p className="text-[8px] text-white/25 leading-relaxed">
              Detailed storage quotas, bandwidth, and CDN metrics are available in the{' '}
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0665118474/storage"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF8C00]/70 underline hover:text-[#FF8C00] transition-colors"
              >
                Firebase Console
              </a>
              {' '}and{' '}
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0665118474/firestore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF8C00]/70 underline hover:text-[#FF8C00] transition-colors"
              >
                Firestore Usage
              </a>
              .
            </p>
          </div>
        </div>

        {/* Live activity feed */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#FF8C00] animate-pulse" />
            <h3 className="text-[9px] font-black uppercase tracking-widest text-white">Live Activity</h3>
          </div>

          {loading ? (
            <div className="py-8 text-center">
              <RefreshCw size={16} className="text-white/20 mx-auto animate-spin mb-2" />
              <p className="text-[8px] text-white/20">Loading activity…</p>
            </div>
          ) : feed.length === 0 ? (
            <div className="py-8 text-center">
              <Activity size={20} className="text-white/10 mx-auto mb-2" />
              <p className="text-[8px] text-white/20">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-0 max-h-64 overflow-y-auto scrollbar-none">
              <AnimatePresence initial={false}>
                {feed.slice(0, 20).map(e => <EventRow key={e.id + e.ts} event={e} />)}
              </AnimatePresence>
            </div>
          )}

          {/* Hourly signups */}
          <div className="mt-4 pt-4 border-t border-white/8">
            <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mb-2">Signups · last hour</p>
            <div className="flex items-center gap-3">
              <p className="text-xl font-black text-emerald-400">{recentSignups}</p>
              <div className="flex-1">
                <MiniBar values={hourly.signups} color="#06D6A0" height={28} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Engagement metrics ── */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-white mb-4">Platform Engagement · Last 60 min</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'New Posts',    value: recentPosts,    color: '#FF8C00', icon: MessageCircle },
            { label: 'New Signups',  value: recentSignups,  color: '#06D6A0', icon: Users },
            { label: 'Live Rooms',   value: activeRooms,    color: '#6B0099', icon: Radio },
            { label: 'Room Viewers', value: roomOccupancy,  color: '#00B4D8', icon: Eye },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="text-center py-3 px-2 rounded-xl" style={{ background: `${color}0a` }}>
              <Icon size={14} className="mx-auto mb-2" style={{ color }} />
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-[7px] font-black uppercase tracking-[0.15em] text-white/35 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick links ── */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Firebase Console', href: 'https://console.firebase.google.com/project/gen-lang-client-0665118474' },
          { label: 'Firestore',  href: 'https://console.firebase.google.com/project/gen-lang-client-0665118474/firestore' },
          { label: 'Storage',   href: 'https://console.firebase.google.com/project/gen-lang-client-0665118474/storage' },
          { label: 'Auth Users', href: 'https://console.firebase.google.com/project/gen-lang-client-0665118474/authentication/users' },
          { label: 'Functions',  href: 'https://console.firebase.google.com/project/gen-lang-client-0665118474/functions' },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/8 text-[8px] font-black uppercase tracking-widest text-white/35 hover:text-white/60 hover:border-white/15 transition-all"
          >
            <Globe size={9} /> {label}
          </a>
        ))}
      </div>
    </div>
  );
};

export default AdminSiteHealth;
