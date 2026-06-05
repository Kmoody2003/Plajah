import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, TrendingUp, Music, Video, Newspaper, Zap, Clock, MessageSquare, Heart, UserPlus, Plus, Bell } from 'lucide-react';
import HistoryMomentPulseCard from './HistoryMomentPulseCard';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../services/backendService';
import { FeedItem, Album, AppNotification } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface WeatherData {
  temp: number;
  code: number;
  city: string;
  isDay: number;
}

interface WeatherStyle {
  gradient: string;
  glowColor: string;
  icon: string;
  label: string;
}

function getWeatherStyle(code: number, isDay: number): WeatherStyle {
  if (code === 0 && isDay) return { gradient: 'from-amber-800/80 via-orange-700/60 to-yellow-900/70', glowColor: 'rgba(251,191,36,0.15)', icon: '☀️', label: 'Clear' };
  if (code === 0) return { gradient: 'from-indigo-900/80 via-slate-800/60 to-blue-950/70', glowColor: 'rgba(99,102,241,0.15)', icon: '🌙', label: 'Clear Night' };
  if (code <= 2) return { gradient: 'from-slate-700/80 via-blue-900/60 to-slate-800/70', glowColor: 'rgba(148,163,184,0.12)', icon: '⛅', label: 'Partly Cloudy' };
  if (code === 3) return { gradient: 'from-slate-800/80 via-slate-700/60 to-gray-900/70', glowColor: 'rgba(100,116,139,0.12)', icon: '☁️', label: 'Overcast' };
  if (code <= 48) return { gradient: 'from-gray-800/80 via-slate-700/60 to-gray-900/70', glowColor: 'rgba(107,114,128,0.15)', icon: '🌫️', label: 'Foggy' };
  if (code <= 55) return { gradient: 'from-blue-900/80 via-slate-800/60 to-indigo-950/70', glowColor: 'rgba(59,130,246,0.15)', icon: '🌦️', label: 'Drizzle' };
  if (code <= 67) return { gradient: 'from-blue-950/80 via-indigo-900/60 to-slate-900/70', glowColor: 'rgba(29,78,216,0.2)', icon: '🌧️', label: 'Rain' };
  if (code <= 77) return { gradient: 'from-slate-700/80 via-blue-800/60 to-indigo-900/70', glowColor: 'rgba(147,197,253,0.2)', icon: '❄️', label: 'Snow' };
  if (code <= 82) return { gradient: 'from-blue-900/80 via-slate-800/60 to-indigo-950/70', glowColor: 'rgba(59,130,246,0.18)', icon: '🌨️', label: 'Showers' };
  return { gradient: 'from-purple-950/80 via-slate-900/60 to-indigo-950/70', glowColor: 'rgba(109,40,217,0.2)', icon: '⛈️', label: 'Thunderstorm' };
}

function typeIcon(type: string) {
  if (type === 'SONG') return <Music size={9} className="text-emerald-400" />;
  if (type === 'VIDEO') return <Video size={9} className="text-rose-400" />;
  if (type === 'NEWS') return <Newspaper size={9} className="text-blue-400" />;
  return <Zap size={9} className="text-amber-400" />;
}

function typeColor(type: string) {
  if (type === 'SONG') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20';
  if (type === 'VIDEO') return 'bg-rose-500/20 text-rose-300 border-rose-500/20';
  if (type === 'NEWS') return 'bg-blue-500/20 text-blue-300 border-blue-500/20';
  return 'bg-amber-500/20 text-amber-300 border-amber-500/20';
}

function timeUntil(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return 'Out Now';
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 30) return `${Math.ceil(d / 30)}mo`;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function notifIcon(type: string) {
  switch (type) {
    case 'COMMENT': return <MessageSquare size={11} className="text-green-400" />;
    case 'LIKE': return <Heart size={11} className="text-red-400" />;
    case 'FOLLOW': return <UserPlus size={11} className="text-cyan-400" />;
    case 'CONTENT': return <Plus size={11} className="text-purple-400" />;
    default: return <Zap size={11} className="text-small-orange" />;
  }
}

interface ProfileSmartCardProps {
  followedIds?: string[];
  profileUid?: string;
  upcomingAlbums?: Album[];
  onSelectAlbum?: (album: Album) => void;
  onNavigateHistory?: (view: 'CHORA_HISTORY' | 'TALEO_HISTORY') => void;
}

type Section = 'following' | 'discover' | 'coming_soon' | 'history' | 'wywg';

const LAST_VISIT_KEY = 'plajah_last_visit';

const ProfileSmartCard: React.FC<ProfileSmartCardProps> = ({
  followedIds = [],
  profileUid,
  upcomingAlbums = [],
  onSelectAlbum,
  onNavigateHistory,
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [section, setSection] = useState<Section>('coming_soon');
  const [missedNotifs, setMissedNotifs] = useState<AppNotification[]>([]);
  const [missedPosts, setMissedPosts] = useState<FeedItem[]>([]);
  const [lastVisit, setLastVisit] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setWeatherLoading(true);

    if (!navigator.geolocation) { setWeatherLoading(false); return; }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const [weatherRes, geoRes] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true`),
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`, {
              headers: { 'Accept-Language': 'en' }
            })
          ]);
          if (!cancelled) {
            const w = await weatherRes.json();
            const g = await geoRes.json();
            const city = g.address?.city || g.address?.town || g.address?.village || g.address?.county || 'Your Location';
            setWeather({
              temp: Math.round(w.current_weather?.temperature ?? 0),
              code: w.current_weather?.weathercode ?? 0,
              city,
              isDay: w.current_weather?.is_day ?? 1,
            });
          }
        } catch {}
        if (!cancelled) setWeatherLoading(false);
      },
      () => { if (!cancelled) setWeatherLoading(false); },
      { timeout: 8000 }
    );

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'posts'), orderBy('timestamp', 'desc'), limit(30)));
        setFeedItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as FeedItem)));
      } catch {}
    };
    load();
  }, []);

  // Load "While You Were Gone" data
  useEffect(() => {
    if (!profileUid) return;
    const stored = localStorage.getItem(LAST_VISIT_KEY);
    const last = stored ? parseInt(stored, 10) : Date.now() - 7 * 24 * 60 * 60 * 1000; // default: 7 days ago
    setLastVisit(last);

    const load = async () => {
      try {
        // Fetch notifications since last visit
        const nSnap = await getDocs(
          query(collection(db, 'notifications'), where('userId', '==', profileUid), orderBy('timestamp', 'desc'), limit(50))
        );
        const notifs: AppNotification[] = nSnap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          timestamp: typeof d.data().timestamp?.toMillis === 'function' ? d.data().timestamp.toMillis() : (d.data().timestamp || 0),
        } as AppNotification));
        setMissedNotifs(notifs.filter(n => n.timestamp > last));

        // Fetch new posts from followed users since last visit
        if (followedIds.length > 0) {
          const pSnap = await getDocs(
            query(collection(db, 'posts'), orderBy('timestamp', 'desc'), limit(60))
          );
          const allPosts: FeedItem[] = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as FeedItem));
          setMissedPosts(allPosts.filter(p => followedIds.includes(p.authorId) && (p.timestamp || 0) > last));
        }
      } catch {}
    };
    load();
  }, [profileUid, followedIds.join(',')]);

  // Update last visit timestamp when user views the WYWG section
  const handleViewWYWG = () => {
    setSection('wywg');
    localStorage.setItem(LAST_VISIT_KEY, Date.now().toString());
  };

  // Auto-select the most relevant default tab
  useEffect(() => {
    const hasWYWG = missedNotifs.length > 0 || missedPosts.length > 0;
    if (hasWYWG) setSection('wywg');
    else if (upcomingAlbums.length > 0) setSection('coming_soon');
    else setSection('following');
  }, [upcomingAlbums.length, missedNotifs.length, missedPosts.length]);

  if (weatherLoading && feedItems.length === 0 && upcomingAlbums.length === 0) return null;
  if (!weather && feedItems.length === 0 && upcomingAlbums.length === 0) return null;

  const ws = weather ? getWeatherStyle(weather.code, weather.isDay) : getWeatherStyle(1, 1);

  const followed = feedItems.filter(f => followedIds.includes(f.authorId));
  const discover = feedItems.filter(f => !followedIds.includes(f.authorId));

  // Coming soon: own upcoming releases + releases from followed artists
  const relevantUpcoming = upcomingAlbums.filter(
    a => a.ownerId === profileUid || followedIds.includes(a.ownerId || '')
  );

  const wywgCount = missedNotifs.length + missedPosts.length;

  const tabs: { id: Section; label: string; count?: number }[] = [
    ...(wywgCount > 0 ? [{ id: 'wywg' as Section, label: 'Missed', count: wywgCount }] : []),
    ...(relevantUpcoming.length > 0 ? [{ id: 'coming_soon' as Section, label: 'Coming Soon', count: relevantUpcoming.length }] : []),
    { id: 'following', label: 'Following' },
    { id: 'discover', label: 'Discover' },
    { id: 'history', label: '🎵 History' },
  ];

  // Group missed notifications by type for the summary
  const missedByType: Record<string, AppNotification[]> = {};
  missedNotifs.forEach(n => {
    if (!missedByType[n.type]) missedByType[n.type] = [];
    missedByType[n.type].push(n);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${ws.gradient} border border-white/10 shadow-2xl`}
      style={{ boxShadow: `0 24px 80px ${ws.glowColor}` }}
    >
      {/* Ambient noise texture */}
      <div className="absolute inset-0 opacity-[0.04] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')] bg-cover" />

      <div className="relative z-10 flex flex-col lg:flex-row">
        {/* ── Weather Panel ── */}
        <div className="lg:w-64 shrink-0 p-7 flex flex-col justify-between lg:border-r border-b lg:border-b-0 border-white/10">
          <div>
            {weather && (
              <div className="flex items-center gap-1.5 mb-5">
                <MapPin size={10} className="text-white/30" />
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 truncate">{weather.city}</span>
              </div>
            )}
            <div className="text-6xl mb-3 leading-none">{ws.icon}</div>
            {weather && (
              <div className="text-5xl font-black tracking-tight text-white mb-1">{weather.temp}°C</div>
            )}
            <p className="text-sm font-bold text-white/50">{ws.label}</p>
          </div>

          <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 gap-2">
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Posts Today</p>
              <p className="text-xl font-black">{feedItems.length}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Upcoming</p>
              <p className="text-xl font-black">{relevantUpcoming.length}</p>
            </div>
          </div>
        </div>

        {/* ── Activity / Pulse Panel ── */}
        <div className="flex-1 min-w-0 p-7">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-small-orange animate-pulse" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.35em] text-white/50">Platform Pulse</h3>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={t.id === 'wywg' ? handleViewWYWG : () => setSection(t.id)}
                  className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1 ${
                    section === t.id
                      ? t.id === 'coming_soon' ? 'bg-small-orange text-black' : t.id === 'wywg' ? 'bg-purple-500 text-white' : 'bg-white text-black'
                      : t.id === 'wywg' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30' : 'bg-white/8 text-white/40 hover:bg-white/15'
                  }`}
                >
                  {t.id === 'coming_soon' && <Clock size={8} />}
                  {t.id === 'wywg' && <Bell size={8} />}
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`ml-0.5 text-[7px] font-black px-1 py-0.5 rounded-full ${section === t.id ? 'bg-black/20' : 'bg-white/10'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">

            {/* ── While You Were Gone ── */}
            {section === 'wywg' && (
              <motion.div
                key="wywg"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                {wywgCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-30">
                    <Bell size={24} />
                    <p className="text-[9px] font-black uppercase tracking-widest text-center">
                      You're all caught up!
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">
                      Since {lastVisit ? formatDistanceToNow(lastVisit) + ' ago' : 'last visit'}
                    </div>

                    {/* Summary pills */}
                    {Object.entries(missedByType).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {Object.entries(missedByType).map(([type, items]) => (
                          <div key={type} className="flex items-center gap-1.5 bg-black/25 border border-white/10 rounded-full px-3 py-1.5">
                            {notifIcon(type)}
                            <span className="text-[9px] font-black text-white/70">
                              {items.length} {type === 'COMMENT' ? (items.length === 1 ? 'new reply' : 'new replies') : type === 'LIKE' ? (items.length === 1 ? 'like' : 'likes') : type === 'FOLLOW' ? (items.length === 1 ? 'new follower' : 'new followers') : type === 'CONTENT' ? 'new post' + (items.length > 1 ? 's' : '') : 'update' + (items.length > 1 ? 's' : '')}
                            </span>
                          </div>
                        ))}
                        {missedPosts.length > 0 && (
                          <div className="flex items-center gap-1.5 bg-black/25 border border-white/10 rounded-full px-3 py-1.5">
                            <Plus size={11} className="text-purple-400" />
                            <span className="text-[9px] font-black text-white/70">
                              {missedPosts.length} new post{missedPosts.length > 1 ? 's' : ''} from people you follow
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Individual notification items */}
                    {[...missedNotifs].slice(0, 4).map((n, i) => (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 bg-black/20 rounded-xl p-3"
                      >
                        <div className="relative shrink-0">
                          <img
                            src={n.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${n.senderId}`}
                            className="w-8 h-8 rounded-full object-cover border border-white/10"
                            alt=""
                          />
                          <div className="absolute -bottom-0.5 -right-0.5 p-0.5 bg-black/80 rounded-full">
                            {notifIcon(n.type)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-white/80 truncate">{n.title}</p>
                          <p className="text-[9px] text-white/40 truncate italic">{n.message}</p>
                        </div>
                        <span className="text-[8px] text-white/25 shrink-0">{formatDistanceToNow(n.timestamp)} ago</span>
                      </motion.div>
                    ))}

                    {/* Missed posts from following */}
                    {missedPosts.slice(0, 2).map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (missedNotifs.length + i) * 0.04 }}
                        className="flex items-center gap-3 bg-black/20 rounded-xl p-3"
                      >
                        <img
                          src={p.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.authorId}`}
                          className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                          alt=""
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px] font-black text-white/70 truncate">{p.authorName}</span>
                            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-widest shrink-0 ${typeColor(p.type)}`}>
                              {typeIcon(p.type)} New Post
                            </span>
                          </div>
                          <p className="text-[9px] text-white/40 truncate">{p.title || p.content || 'New activity'}</p>
                        </div>
                        <span className="text-[8px] text-white/25 shrink-0">{p.timestamp ? formatDistanceToNow(p.timestamp) + ' ago' : ''}</span>
                      </motion.div>
                    ))}
                  </>
                )}
              </motion.div>
            )}

            {section === 'coming_soon' && (
              <motion.div
                key="coming_soon"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-2"
              >
                {relevantUpcoming.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-30">
                    <Clock size={24} />
                    <p className="text-[9px] font-black uppercase tracking-widest text-center">
                      No upcoming releases from you or artists you follow
                    </p>
                  </div>
                ) : (
                  relevantUpcoming.slice(0, 5).map((album, i) => (
                    <motion.div
                      key={album.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => onSelectAlbum?.(album)}
                      className="flex items-center gap-3 bg-black/20 hover:bg-black/35 transition-all rounded-xl p-3 cursor-pointer group"
                    >
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10">
                        <img src={album.coverImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.4))' }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-black text-white/80 truncate">{album.title}</span>
                          {album.ownerId === profileUid && (
                            <span className="text-[6px] font-black px-1.5 py-0.5 rounded-full shrink-0 bg-small-orange/20 text-small-orange border border-small-orange/20 uppercase tracking-widest">
                              Yours
                            </span>
                          )}
                        </div>
                        <p className="text-[8px] text-white/40 truncate">{album.artist}</p>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[9px] font-black text-small-orange">{timeUntil(album.releaseDate!)}</div>
                        <div className="text-[7px] text-white/30 font-bold">
                          {new Date(album.releaseDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {section === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                <HistoryMomentPulseCard
                  uid={profileUid}
                  category="MUSIC"
                  size="profile"
                  onNavigate={onNavigateHistory}
                  rotationIntervalSeconds={9}
                  startOffset={0}
                />
                <HistoryMomentPulseCard
                  uid={profileUid}
                  category="FILM_TV"
                  size="profile"
                  onNavigate={onNavigateHistory}
                  rotationIntervalSeconds={11}
                  startOffset={2}
                />
              </motion.div>
            )}

            {section !== 'coming_soon' && section !== 'history' && section !== 'wywg' && (
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-2"
              >
                {(() => {
                  const items = (section === 'following' ? followed : discover).slice(0, 5);
                  return items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-30">
                      <Zap size={24} />
                      <p className="text-[9px] font-black uppercase tracking-widest text-center">
                        {section === 'following' ? 'Follow creators to see their latest here' : 'Nothing new to discover yet'}
                      </p>
                    </div>
                  ) : (
                    items.map((item, i) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 bg-black/20 hover:bg-black/30 transition-colors rounded-xl p-3 cursor-pointer"
                      >
                        <img
                          src={item.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.authorId}`}
                          className="w-8 h-8 rounded-full shrink-0 border border-white/10 object-cover"
                          alt=""
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px] font-black text-white/70 truncate">{item.authorName}</span>
                            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-widest shrink-0 ${typeColor(item.type)}`}>
                              {typeIcon(item.type)}{item.type}
                            </span>
                          </div>
                          <p className="text-[10px] text-white/40 leading-tight line-clamp-1">
                            {item.title || item.content || 'New activity'}
                          </p>
                        </div>
                      </motion.div>
                    ))
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default ProfileSmartCard;
