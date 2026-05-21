import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { MapPin, TrendingUp, Music, Video, Newspaper, Zap } from 'lucide-react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../services/backendService';
import { FeedItem } from '../types';

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

interface ProfileSmartCardProps {
  followedIds?: string[];
}

const ProfileSmartCard: React.FC<ProfileSmartCardProps> = ({ followedIds = [] }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [section, setSection] = useState<'following' | 'discover'>('following');

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

  if (weatherLoading && feedItems.length === 0) return null;
  if (!weather && feedItems.length === 0) return null;

  const ws = weather ? getWeatherStyle(weather.code, weather.isDay) : getWeatherStyle(1, 1);

  const followed = feedItems.filter(f => followedIds.includes(f.authorId));
  const discover = feedItems.filter(f => !followedIds.includes(f.authorId));
  const activeItems = (section === 'following' ? followed : discover).slice(0, 5);

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
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Trending</p>
              <TrendingUp size={16} className="text-white/60 mt-1" />
            </div>
          </div>
        </div>

        {/* ── Activity Panel ── */}
        <div className="flex-1 min-w-0 p-7">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.35em] text-white/50">Platform Pulse</h3>
            <div className="flex gap-1.5">
              {(['following', 'discover'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
                    section === s ? 'bg-white text-black' : 'bg-white/8 text-white/40 hover:bg-white/15'
                  }`}
                >
                  {s === 'following' ? 'Following' : 'Discover'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {activeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-30">
                <Zap size={24} />
                <p className="text-[9px] font-black uppercase tracking-widest text-center">
                  {section === 'following' ? 'Follow creators to see their latest here' : 'Nothing new to discover yet'}
                </p>
              </div>
            ) : (
              activeItems.map((item, i) => (
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
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProfileSmartCard;
