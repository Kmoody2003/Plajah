import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, ExternalLink, Radio, Users, Newspaper } from 'lucide-react';
import { fetchWorldCupNews, fetchWorldCupWindow } from '../services/sportsService';
import { matchWcTeam } from '../services/worldCupVictory';

interface Slide {
  kind: 'live' | 'news';
  image: string;
  kicker: string;
  title: string;
  sub?: string;
  href?: string;
  event?: any;
  accent?: string;
}

// Upscale ESPN/known CDN thumbnails so the hero looks crisp.
const bigImage = (url: string): string => {
  if (!url) return url;
  try {
    if (url.includes('espncdn.com') || url.includes('espn.com')) {
      return url.replace(/([?&])(w|h)=\d+/g, '').replace(/&&/g, '&') + (url.includes('?') ? '&' : '?') + 'w=1600&h=900&crop=1';
    }
  } catch { /* */ }
  return url;
};

const teamLogo = (c: any) => c?.team?.logos?.[0]?.href || c?.team?.logo || '';

interface Props {
  onOpenFanRoom?: (matchId: string, event: any) => void;
}

const WorldCupCarousel: React.FC<Props> = ({ onOpenFanRoom }) => {
  const [news, setNews] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadNews = () => fetchWorldCupNews().then(n => { if (alive) setNews(n || []); }).catch(() => {});
    const loadEvents = () => fetchWorldCupWindow().then(e => { if (alive) setEvents(e || []); }).catch(() => {});
    loadNews(); loadEvents();
    const n = setInterval(loadNews, 300_000);
    const e = setInterval(loadEvents, 30_000);
    return () => { alive = false; clearInterval(n); clearInterval(e); };
  }, []);

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    // Live matches first — the most alive thing on the platform.
    for (const ev of events) {
      if (ev?.status?.type?.state !== 'in') continue;
      const cs = ev.competitions?.[0]?.competitors || [];
      if (cs.length < 2) continue;
      const [a, b] = cs;
      const img = bigImage(teamLogo(a) || teamLogo(b));
      const wcA = matchWcTeam(a.team), wcB = matchWcTeam(b.team);
      out.push({
        kind: 'live',
        image: img,
        kicker: `● LIVE · ${ev.status?.type?.detail || ev.status?.type?.description || 'In progress'}`,
        title: `${a.team?.displayName || a.team?.name} ${a.score ?? 0} – ${b.score ?? 0} ${b.team?.displayName || b.team?.name}`,
        sub: `${wcA?.flag || ''} ${wcB?.flag || ''}  ·  ${ev.competitions?.[0]?.venue?.fullName || 'World Cup'}`.trim(),
        event: ev,
        accent: '#EF4444',
      });
    }
    // Then real headline photos.
    for (const a of news) {
      const img = a.images?.find((im: any) => im?.url)?.url;
      if (!img) continue;
      out.push({
        kind: 'news',
        image: bigImage(img),
        kicker: `${a.source || 'World Cup'} · ${a.published ? new Date(a.published).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}`.trim(),
        title: a.headline || a.title || 'World Cup',
        sub: a.description,
        href: a.links?.web?.href,
        accent: '#39B54A',
      });
      if (out.length >= 10) break;
    }
    return out;
  }, [news, events]);

  useEffect(() => { if (idx >= slides.length) setIdx(0); }, [slides.length, idx]);

  // Auto-advance.
  const paceRef = useRef<number>(0);
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const id = setInterval(() => setIdx(i => (i + 1) % slides.length), 5500);
    paceRef.current = id as any;
    return () => clearInterval(id);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;
  const s = slides[Math.min(idx, slides.length - 1)];
  const go = (d: number) => setIdx(i => (i + d + slides.length) % slides.length);
  const open = () => {
    if (s.kind === 'news' && s.href) window.open(s.href, '_blank', 'noopener');
    else if (s.kind === 'live' && s.event && onOpenFanRoom) onOpenFanRoom(String(s.event.id), s.event);
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl h-[38vh] sm:h-[46vh] min-h-[260px] border border-white/10 group"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence mode="popLayout">
        <motion.button
          key={idx}
          onClick={open}
          className="absolute inset-0 text-left w-full h-full cursor-pointer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
        >
          {/* Ken-Burns image */}
          <motion.img
            src={s.image} alt="" loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ scale: 1.02 }} animate={{ scale: 1.14 }} transition={{ duration: 7, ease: 'linear' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%), linear-gradient(0deg, rgba(0,0,0,0.85), transparent 55%)' }} />
          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-9 max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              {s.kind === 'live'
                ? <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500 text-white text-[9px] font-black uppercase tracking-widest"><Radio size={10} className="animate-pulse" /> Live</span>
                : <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#39B54A]/20 border border-[#39B54A]/40 text-[#7CFC98] text-[9px] font-black uppercase tracking-widest"><Newspaper size={10} /> Headline</span>}
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60">{s.kicker}</span>
            </div>
            <motion.h2
              key={`t${idx}`} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
              className="text-2xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight text-white leading-[0.95] drop-shadow-lg line-clamp-3"
            >
              {s.title}
            </motion.h2>
            {s.sub && <p className="text-white/60 text-xs sm:text-sm mt-2.5 line-clamp-2 max-w-xl leading-relaxed">{s.sub}</p>}
            <div className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/80">
              {s.kind === 'live' ? <><Users size={13} /> Join the fan room</> : <><ExternalLink size={12} /> Read the story</>}
            </div>
          </div>
        </motion.button>
      </AnimatePresence>

      {/* Kicker badge */}
      <div className="absolute top-5 left-6 z-10 flex items-center gap-2 pointer-events-none">
        <span className="text-lg select-none">⚽</span>
        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-white/70">FIFA World Cup 2026™</span>
      </div>

      {/* Arrows */}
      {slides.length > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-all"><ChevronLeft size={18} /></button>
          <button onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-all"><ChevronRight size={18} /></button>
        </>
      )}

      {/* Progress dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-4 right-6 z-10 flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className="h-1.5 rounded-full transition-all" style={{ width: i === idx ? 22 : 6, background: i === idx ? '#fff' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </div>
      )}
    </div>
  );
};

export default WorldCupCarousel;
