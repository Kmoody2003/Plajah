// Reello home — the top of the page that says "one video service": long-form Watch, vertical Shorts
// and Live in three lanes, each in its own native shape, plus a format switcher with live counts.
//
//   Watch  (16:9 hero, ranked pick, silent loop)
//   Shorts (9:16 snap lane, silent loops that only run while on screen)
//   Live   (real live feeds, pulsing red; viewer counts only when the feed actually reports one)
//
// Loops are cheap on purpose: Mux videos use image.mux.com's animated.webp (no decoder, no HLS
// client per card); direct files use a muted <video> that is paused off-screen; reduced-motion
// users get the static frame.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Radio, Smartphone, Sparkles, Users, Eye, ChevronRight } from 'lucide-react';
import { Video, LiveFeed } from '../../types';
import { computeTrending } from '../../services/relloFeedService';
import { isFeedLive } from '../../services/liveFeedLiveness';
import { thumb as thumbUrl, onThumbError, THUMB } from '../../src/lib/imageThumb';

const DAY = 24 * 60 * 60 * 1000;

const muxId = (v?: any): string | undefined => v?.muxPlaybackId || undefined;
const posterOf = (v: any, w = 640): string => {
  if (!v) return '';
  const id = muxId(v);
  if (id) return `https://image.mux.com/${id}/thumbnail.png?width=${w}&time=2`;
  return v.thumbnailUrl || v.coverImageUrl || v.coverImage || '';
};
const isVertical = (v: any): boolean =>
  !!v?.verticalVideoUrl || v?.aspectRatio === 'VERTICAL';
const fmt = (n?: number) => {
  const v = n || 0;
  return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${v}`;
};

const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Silent looping preview of a video: animated frame strip (Mux) or a muted, viewport-gated <video>. */
const LoopPreview: React.FC<{ video: any; width: number; vertical?: boolean; className?: string }> = ({ video, width, vertical, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [webpFailed, setWebpFailed] = useState(false);
  const still = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOnScreen(true); return; }
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const id = muxId(video);
  const directUrl: string | undefined = (vertical && video?.verticalVideoUrl) || (!id ? video?.url : undefined);
  const directIsFile = !!directUrl && !/\.m3u8(\?|$)/i.test(directUrl) && !directUrl.startsWith('livestream:');
  const poster = posterOf(video, Math.min(width, 640));

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    if (onScreen && !still) v.play?.().catch(() => {}); else v.pause?.();
  }, [onScreen, still]);

  return (
    <div ref={ref} className={`absolute inset-0 overflow-hidden bg-zinc-900 ${className}`}>
      {poster && <img src={thumbUrl(poster, THUMB.large) || poster} alt="" loading="lazy" decoding="async" onError={onThumbError(poster)} className="absolute inset-0 w-full h-full object-cover" />}
      {onScreen && !still && id && !webpFailed && (
        <img
          src={`https://image.mux.com/${id}/animated.webp?width=${Math.min(width, 640)}&fps=12&start=1&end=9`}
          alt="" decoding="async" onError={() => setWebpFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {!id && directIsFile && !still && (
        <video
          ref={vidRef} src={directUrl} poster={poster || undefined}
          muted loop playsInline preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </div>
  );
};

const LaneHeader: React.FC<{ icon: React.ReactNode; title: string; sub?: string; onMore?: () => void }> = ({ icon, title, sub, onMore }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">{title}</h2>
      {sub && <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{sub}</span>}
    </div>
    {onMore && (
      <button onClick={onMore} className="flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
        See all <ChevronRight size={12} />
      </button>
    )}
  </div>
);

interface Props {
  videos: Video[];
  liveFeeds: LiveFeed[];
  followedIds: Set<string>;
  onPlay: (v: Video) => void;
  onOpenShort: (v: Video) => void;
  onOpenLive: (f: LiveFeed) => void;
  onSetFormat: (f: 'shorts' | 'live') => void;
  onVisitUser?: (uid: string) => void;
  onGoLive?: () => void;
}

const ReelloHomeTop: React.FC<Props> = ({ videos, liveFeeds, followedIds, onPlay, onOpenShort, onOpenLive, onSetFormat, onVisitUser, onGoLive }) => {
  const live = useMemo(() => liveFeeds.filter(f => isFeedLive(f as any) && f.isPublic !== false), [liveFeeds]);

  // Long-form pool vs vertical pool. Until creators supply 9:16 masters the vertical pool is thin,
  // so the Shorts lane falls back to the newest videos (same as the Shorts view does).
  const verticals = useMemo(() => videos.filter(isVertical), [videos]);
  const shorts = useMemo(() => {
    const base = verticals.length >= 3 ? verticals : [...videos].sort((a, b) => b.timestamp - a.timestamp);
    return base.slice(0, 8);
  }, [videos, verticals]);

  // Hero: newest from someone you follow (last 14 days) → else the trending leader. Stable across renders.
  const hero = useMemo(() => {
    const longForm = videos.filter(v => !isVertical(v) && posterOf(v));
    const pool = longForm.length ? longForm : videos;
    if (!pool.length) return null;
    const followed = pool
      .filter(v => followedIds.has((v as any).ownerId) && Date.now() - v.timestamp < 14 * DAY)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (followed) return { video: followed, why: 'From someone you follow' };
    const top = computeTrending(pool)[0];
    return top ? { video: top, why: 'Trending now' } : null;
  }, [videos, followedIds]);

  // Creator strip: live creators first (red ring), then people with something new in the last 3 days.
  const creators = useMemo(() => {
    const seen = new Set<string>();
    const out: { uid: string; name: string; photo?: string; live: boolean; feed?: LiveFeed; kind?: string }[] = [];
    live.forEach(f => {
      if (!f.ownerId || seen.has(f.ownerId)) return;
      seen.add(f.ownerId);
      out.push({ uid: f.ownerId, name: f.ownerName, photo: f.ownerPhoto, live: true, feed: f });
    });
    [...videos].sort((a, b) => b.timestamp - a.timestamp).forEach(v => {
      const uid = (v as any).ownerId as string | undefined;
      if (!uid || seen.has(uid) || Date.now() - v.timestamp > 3 * DAY || out.length >= 14) return;
      seen.add(uid);
      out.push({ uid, name: (v as any).ownerName || v.artist || 'Creator', photo: (v as any).ownerPhoto, live: false, kind: isVertical(v) ? 'New short' : 'New video' });
    });
    return out;
  }, [live, videos]);

  if (!hero && !shorts.length && !live.length) return null;

  const heroV: any = hero?.video;

  return (
    <div className="mb-10 space-y-5">
      {/* Format switcher — the three things Reello is, with counts. Watch = this page. */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest">
          <Play size={12} fill="currentColor" /> Watch
        </span>
        <button onClick={() => onSetFormat('shorts')} className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-widest transition-colors">
          <Smartphone size={12} /> Shorts <span className="text-white/40">{shorts.length}</span>
        </button>
        <button onClick={() => onSetFormat('live')} className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors ${live.length ? 'bg-red-600/15 border-red-500/40 text-red-300 hover:bg-red-600/25' : 'bg-white/[0.06] border-white/10 hover:bg-white/15'}`}>
          <span className={`w-2 h-2 rounded-full ${live.length ? 'bg-red-500 animate-pulse' : 'bg-white/30'}`} /> Live <span className={live.length ? 'text-red-300/70' : 'text-white/40'}>{live.length}</span>
        </button>
      </div>

      {/* Creators — one avatar per person, ring shows what they have right now. */}
      {creators.length > 0 && (
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
          {creators.map(c => (
            <button
              key={c.uid}
              onClick={() => c.live && c.feed ? onOpenLive(c.feed) : onVisitUser?.(c.uid)}
              className="shrink-0 w-16 flex flex-col items-center gap-1.5 group"
              title={c.live ? `${c.name} is live` : `${c.name} · ${c.kind}`}
            >
              <span className={`relative w-14 h-14 rounded-full p-[2px] ${c.live ? 'bg-red-500' : 'bg-gradient-to-tr from-small-orange to-pink-500'}`}>
                <span className="block w-full h-full rounded-full overflow-hidden bg-zinc-900 ring-2 ring-black">
                  {c.photo
                    ? <img src={thumbUrl(c.photo, THUMB.micro) || c.photo} alt="" loading="lazy" decoding="async" onError={onThumbError(c.photo)} className="w-full h-full object-cover" />
                    : <span className="w-full h-full flex items-center justify-center"><Users size={16} className="text-white/30" /></span>}
                </span>
                {c.live && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 rounded bg-red-600 text-[7px] font-black uppercase tracking-widest leading-tight py-0.5">Live</span>}
              </span>
              <span className="w-full text-[8px] font-bold uppercase tracking-wider text-white/50 group-hover:text-white truncate text-center">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Three lanes. Desktop: side by side at one height. Mobile: stacked, shorts swipe. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem_19rem] lg:items-stretch">
        {/* WATCH */}
        <div className="min-w-0 flex flex-col">
          <LaneHeader icon={<Sparkles size={14} className="text-small-orange" />} title="Watch" sub={hero?.why} />
          {heroV ? (
            <div
              className="relative flex-1 min-h-[15rem] lg:min-h-[28rem] rounded-[1.75rem] overflow-hidden cursor-pointer group shadow-2xl ring-1 ring-white/10"
              onClick={() => onPlay(heroV)}
            >
              <LoopPreview video={heroV} width={640} className="scale-[1.02] group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-5 sm:p-7 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-1.5 truncate">{heroV.artist || heroV.ownerName || 'Creator'}</p>
                  <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tight leading-[1.05] line-clamp-2 drop-shadow-lg">{heroV.title}</h3>
                  <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-white/40">{fmt(heroV.playsCount)} views · {fmt(heroV.likesCount)} likes</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onPlay(heroV); }}
                  className="shrink-0 flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-small-orange hover:text-white transition-colors shadow-2xl"
                >
                  <Play size={15} fill="currentColor" /> Watch
                </button>
              </div>
            </div>
          ) : <div className="flex-1 rounded-[1.75rem] bg-white/[0.03] border border-dashed border-white/10" />}
        </div>

        {/* SHORTS */}
        <div className="min-w-0 flex flex-col">
          <LaneHeader icon={<Smartphone size={14} className="text-pink-400" />} title="Shorts" onMore={() => onSetFormat('shorts')} />
          <div className="flex-1 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
            {shorts.map(s => (
              <button
                key={s.id}
                onClick={() => onOpenShort(s)}
                className="relative shrink-0 snap-start w-[10.5rem] lg:w-full lg:min-h-[28rem] aspect-[9/16] lg:aspect-auto rounded-[1.5rem] overflow-hidden text-left group ring-1 ring-white/10 shadow-xl"
              >
                <LoopPreview video={s} width={320} vertical className="group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/20" />
                <div className="absolute bottom-0 inset-x-0 p-3.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/60 truncate">{(s as any).artist || (s as any).ownerName || 'Creator'}</p>
                  <h4 className="text-[11px] font-black uppercase tracking-wide leading-tight line-clamp-2 mt-0.5">{s.title}</h4>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-white/40">{fmt(s.playsCount)} views</p>
                </div>
              </button>
            ))}
            {!shorts.length && <div className="flex-1 rounded-[1.5rem] bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-white/25">No shorts yet</div>}
          </div>
        </div>

        {/* LIVE */}
        <div className="min-w-0 flex flex-col">
          <LaneHeader
            icon={<span className={`w-2.5 h-2.5 rounded-full ${live.length ? 'bg-red-500 animate-pulse' : 'bg-white/25'}`} />}
            title="Live now" sub={live.length ? `${live.length} on air` : undefined}
            onMore={live.length > 4 ? () => onSetFormat('live') : undefined}
          />
          <div className={`flex-1 lg:min-h-[28rem] rounded-[1.5rem] border p-3 flex flex-col gap-2 ${live.length ? 'bg-red-500/[0.04] border-red-500/25' : 'bg-white/[0.03] border-white/10'}`}>
            {live.slice(0, 4).map(f => {
              const viewers = (f as any).viewerCount;
              return (
                <button key={f.id} onClick={() => onOpenLive(f)} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white/[0.06] text-left transition-colors group">
                  <span className="relative shrink-0 w-12 h-12 rounded-full p-[2px] bg-red-500">
                    <span className="block w-full h-full rounded-full overflow-hidden bg-zinc-900 ring-2 ring-black">
                      {f.ownerPhoto
                        ? <img src={thumbUrl(f.ownerPhoto, THUMB.micro) || f.ownerPhoto} alt="" loading="lazy" decoding="async" onError={onThumbError(f.ownerPhoto)} className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center"><Radio size={16} className="text-white/30" /></span>}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black uppercase tracking-wide truncate group-hover:text-red-300 transition-colors">{f.title}</span>
                    <span className="block text-[9px] font-bold text-white/40 truncate">{f.ownerName}</span>
                    {typeof viewers === 'number' && viewers > 0 && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-red-300"><Eye size={10} /> {fmt(viewers)} watching</span>
                    )}
                  </span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-red-600 text-[7px] font-black uppercase tracking-widest">Live</span>
                </button>
              );
            })}
            {!live.length && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4">
                <Radio size={30} className="text-white/15" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Nobody is live right now</p>
                <p className="text-[10px] text-white/25 leading-relaxed">Streams show up here the moment they start.</p>
                {onGoLive && (
                  <button onClick={onGoLive} className="mt-1 px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-[9px] font-black uppercase tracking-widest transition-colors">Go live</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReelloHomeTop;
