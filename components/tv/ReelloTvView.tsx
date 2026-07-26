import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Home, Flame, Users, Zap, Radio, ListVideo, Clock, History, ThumbsUp, Play, Video as VideoIcon, ArrowLeft } from 'lucide-react';
import type { UserProfile, Video } from '../../types';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { useTvGrid, isFocused } from '../../hooks/useTvGrid';
import { useTvShellFocus } from '../../hooks/useTvShellFocus';
import TvBrandBackdrop from './TvBrandBackdrop';
import { tvCardRing, RAIL_GUTTER } from './tvFocusRing';
import {
  asyncVideoRails, syncVideoRails, fetchAllVideos, fetchUserVideos, videoItem, fastChannelItem,
  type ReelloBase, type TvVideoItem, type TvVideoRail,
} from './reelloTvSections';
import { fetchAllFastChannels } from '../../services/backendService';

const FastChannelPlayer = React.lazy(() => import('../FastChannelPlayer'));

/**
 * Reello for television, modelled on the YouTube app for TV.
 *
 * That app's shape, and the reasons it works with a remote:
 *  · A vertical rail of destinations on the left, always in the same order, never scrolling away.
 *  · Landscape cards in horizontal rows — video is 16:9 and cropping it square throws away the
 *    part of the frame that tells you what the video is.
 *  · The title and channel sit UNDER the thumbnail, not over it, so nothing competes with the
 *    image and long titles cannot cover the picture.
 *  · Selecting anything goes straight to fullscreen playback. There is no intermediate page,
 *    because on a remote every extra screen is another press and another thing to get lost in.
 *
 * Navigation is the same declared grid as Chora (see hooks/useTvGrid) — rows with counts, an
 * index that moves. Nothing is inferred from geometry.
 */

const SECTIONS = [
  { id: 'HOME',          label: 'Home',          icon: Home },
  { id: 'TRENDING',      label: 'Trending',      icon: Flame },
  { id: 'SUBSCRIPTIONS', label: 'Subscriptions', icon: Users },
  { id: 'SHORTS',        label: 'Shorts',        icon: Zap },
  { id: 'LIVE',          label: 'Live',          icon: Radio },
  { id: 'PLAYLISTS',     label: 'Playlists',     icon: ListVideo },
  { id: 'WATCH_LATER',   label: 'Watch Later',   icon: Clock },
  { id: 'HISTORY',       label: 'History',       icon: History },
  { id: 'LIKED',         label: 'Liked',         icon: ThumbsUp },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

const ACCENT = '#FF8C00';                 // Plajah orange — the focus ring, as on every TV screen
const ACCENT_COOL = '#7C5CFF';            // Reello's violet, from the service palette
const BRAND = 'linear-gradient(135deg, #FF8C00 0%, #D40055 52%, #6B0099 100%)';

const fmtDuration = (sec?: number): string => {
  if (!sec || !isFinite(sec)) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
           : `${m}:${s.toString().padStart(2, '0')}`;
};

const ReelloTvView: React.FC<{
  userProfile: UserProfile | null;
  onSelectVideo: (video: Video) => void;
  onVisitChannel?: (profile: UserProfile) => void;
}> = ({ userProfile, onSelectVideo, onVisitChannel }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [section, setSection] = useState<SectionId>('HOME');
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [cache, setCache] = useState<Record<string, TvVideoRail[]>>({});
  const [drillChannel, setDrillChannel] = useState<UserProfile | null>(null);
  const [drillRails, setDrillRails] = useState<TvVideoRail[]>([]);
  const [fastChannels, setFastChannels] = useState<UserProfile[]>([]);
  const [channelPlayer, setChannelPlayer] = useState<UserProfile | null>(null);   // open FAST player

  useEffect(() => {
    let alive = true;
    fetchAllFastChannels(60).then(c => { if (alive) setFastChannels(c || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Hardware Back closes the FAST channel player (consume it, else it navigates the app to login).
  useEffect(() => {
    if (!channelPlayer) return;
    const onHwBack = (e: Event) => { e.preventDefault(); setChannelPlayer(null); };
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => window.removeEventListener('plajah:hardware-back', onHwBack);
  }, [channelPlayer]);

  const shellFocused = useTvShellFocus();
  const uid = (userProfile as any)?.uid || null;

  useEffect(() => {
    let alive = true;
    fetchAllVideos()
      .then(v => { if (alive) { setVideos(v || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const base: ReelloBase = useMemo(() => ({ videos, uid }), [videos, uid]);

  // Only successful results are cached — an empty one is left out so revisiting retries. Caching
  // a transient failure as though it were the answer left Chora's Radio section permanently blank
  // until an app restart; the same trap applies here.
  const inFlight = useRef<Record<string, boolean>>({});
  // `cache` is read through a ref rather than closed over, and is NOT a dependency. Publishing a
  // partial calls setCache, and if cache were a dep that would tear this effect down mid-flight —
  // cancelling the very fetch that was about to deliver the full result. The symptom was a
  // section stuck showing only its first partial rail forever.
  const cacheRef = useRef(cache); cacheRef.current = cache;
  useEffect(() => {
    if (loading || drillChannel) return;
    if (syncVideoRails(section, base)) return;
    if (cacheRef.current[section] || inFlight.current[section]) return;
    let alive = true;
    inFlight.current[section] = true;
    setSectionLoading(true);
    asyncVideoRails(section, base, partial => {
      if (alive && partial.length) { setCache(c => ({ ...c, [section]: partial })); setSectionLoading(false); }
    })
      .then(r => { if (alive && r.length) setCache(c => ({ ...c, [section]: r })); })
      .catch(() => { /* leave uncached so revisiting retries */ })
      .finally(() => { inFlight.current[section] = false; if (alive) setSectionLoading(false); });
    return () => { alive = false; };
  }, [section, loading, base, drillChannel]);

  // A channel opens as its own list of that creator's videos, the way the YouTube TV app treats a
  // channel: a destination you enter and Back out of, not a separate app mode.
  useEffect(() => {
    if (!drillChannel) { setDrillRails([]); return; }
    let alive = true;
    setSectionLoading(true);
    fetchUserVideos(drillChannel.uid)
      .then(v => {
        if (!alive) return;
        setDrillRails(v?.length
          ? [{ id: 'ch', title: `${(drillChannel as any).displayName || 'Channel'} — Videos`, items: v.map(videoItem) }]
          : []);
      })
      .catch(() => { if (alive) setDrillRails([]); })
      .finally(() => { if (alive) setSectionLoading(false); });
    return () => { alive = false; };
  }, [drillChannel]);

  const rails: TvVideoRail[] = useMemo(() => {
    if (drillChannel) return drillRails;
    const sectionRails = syncVideoRails(section, base) ?? cache[section] ?? [];
    // The Live section leads with a "FAST Channels" rail of every creator channel that's switched on.
    if (section === 'LIVE' && fastChannels.length) {
      return [{ id: 'fast-channels', title: 'FAST Channels', items: fastChannels.map(fastChannelItem) }, ...sectionRails];
    }
    return sectionRails;
  }, [drillChannel, drillRails, section, base, cache, fastChannels]);

  const rows = useMemo(() => rails.map(r => ({ id: r.id, count: r.items.length })), [rails]);

  const run = (item: TvVideoItem) => {
    const a = item.action;
    if (a.kind === 'VIDEO') { onSelectVideo(a.video); return; }
    if (a.kind === 'FASTCHANNEL') { setChannelPlayer(a.profile); return; }
    if (a.kind === 'CHANNEL') { setDrillChannel(a.profile); return; }
    if (a.kind === 'PLAYLIST') {
      // Playing a playlist means playing its first video; the queue is the player's concern.
      const first = (a.playlist as any).videos?.[0];
      if (first) onSelectVideo(first);
    }
  };

  const { pos, zone, panelIndex, setPanelIndex, setZone } = useTvGrid({
    rows,
    panelCount: SECTIONS.length,
    onSelect: (p, rowId) => {
      if (rowId === 'PANEL') {
        const s = SECTIONS[p.col];
        setDrillChannel(null);
        setSection(s.id);
        setZone('CONTENT');
        return;
      }
      const item = rails.find(r => r.id === rowId)?.items[p.col];
      if (item) run(item);
    },
    onBack: () => {
      if (drillChannel) { setDrillChannel(null); return true; }
      return false;
    },
    enabled: !channelPlayer,   // the FAST channel player owns the remote while it's open
  });

  const cellRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (zone !== 'CONTENT') return;
    cellRefs.current[`${pos.row}:${pos.col}`]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [pos, zone]);

  const panelRefs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    if (zone !== 'PANEL') return;
    panelRefs.current[panelIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [panelIndex, zone]);

  const Card: React.FC<{ item: TvVideoItem; focused: boolean; refKey: string }> = ({ item, focused, refKey }) => {
    const isChannel = item.action.kind === 'CHANNEL';
    return (
      <div
        ref={el => { cellRefs.current[refKey] = el; }}
        className={`shrink-0 transition-transform duration-150 ${isChannel ? 'w-44' : 'w-[19rem]'} ${focused ? 'scale-[1.04]' : ''}`}
      >
        <div
          className={`relative overflow-hidden bg-white/[0.05] ${isChannel ? 'rounded-full' : 'rounded-xl'}`}
          style={{
            aspectRatio: isChannel ? '1' : '16 / 9',
            // Shared with Taleo — see tvFocusRing.ts.
            boxShadow: tvCardRing(focused),
          }}
        >
          {item.image
            ? <img src={thumb(item.image, THUMB.card)} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full grid place-items-center"><VideoIcon size={26} className="text-white/20" /></div>}

          {!!item.duration && !isChannel && (
            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-bold tabular-nums text-white">
              {fmtDuration(item.duration)}
            </span>
          )}

          {/* Resume bar, in the same place the YouTube TV app puts it: along the bottom edge of
              the thumbnail, so "where I got to" reads without any text. */}
          {item.progress != null && item.progress > 0 && (
            <span className="absolute left-0 right-0 bottom-0 h-1 bg-white/25">
              <span className="block h-full" style={{ width: `${item.progress * 100}%`, background: ACCENT }} />
            </span>
          )}

          {focused && !isChannel && (
            <span className="absolute inset-0 grid place-items-center bg-black/35">
              <span className="w-14 h-14 rounded-full grid place-items-center" style={{ background: ACCENT }}>
                <Play size={22} className="text-black ml-1" fill="black" />
              </span>
            </span>
          )}
        </div>

        {/* Under the image, never over it. */}
        <p className={`mt-2 text-[13px] font-bold leading-snug line-clamp-2 ${focused ? 'text-white' : 'text-white/75'} ${isChannel ? 'text-center' : ''}`}>
          {item.title}
        </p>
        <p className={`text-[11px] text-white/40 truncate ${isChannel ? 'text-center' : ''}`}>
          {[item.subtitle, item.meta].filter(Boolean).join(' · ')}
        </p>
      </div>
    );
  };

  const RailHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mb-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">{children}</h2>
      <span className="block mt-1.5 h-[2px] w-11 rounded-full" style={{ background: BRAND }} />
    </div>
  );

  const SkeletonRail: React.FC = () => (
    <section className="mb-8">
      <div className="mb-3">
        <div className="h-2 w-32 rounded-full bg-white/[0.07] animate-pulse" />
        <span className="block mt-1.5 h-[2px] w-11 rounded-full bg-white/10" />
      </div>
      <div className="flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="shrink-0 w-[19rem]">
            <div className="rounded-xl bg-white/[0.05] animate-pulse" style={{ aspectRatio: '16 / 9', animationDelay: `${i * 90}ms` }} />
            <div className="mt-2 h-2.5 w-4/5 rounded-full bg-white/[0.06]" />
            <div className="mt-1.5 h-2 w-1/2 rounded-full bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="relative flex h-full" data-tv-capture>
      <TvBrandBackdrop />

      {/* ── Destinations ── */}
      {/* A brand-tinted scrim, not a blur: TV runs with html.perf-no-blur, which forces
          backdrop-filter to none, and the readable fallback only covers .glass classes. A
          translucent panel would sit unblurred on top of the 0.85-alpha purple bloom and eat the
          labels. Violet-black rather than neutral black so the rail still belongs to the gradient. */
      }
      <aside
        className="relative w-56 shrink-0 border-r border-white/[0.07] flex flex-col py-6"
        style={{ background: 'linear-gradient(90deg, rgba(9,0,15,0.88) 0%, rgba(9,0,15,0.72) 100%)' }}
      >
        <div className="px-6 mb-7">
          <p
            className="text-2xl font-black italic tracking-tighter leading-none"
            style={{ background: BRAND, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >REELLO</p>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-1" style={{ color: ACCENT_COOL }}>Video</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            const focused = zone === 'PANEL' && panelIndex === i && !shellFocused;
            const active = section === s.id && !drillChannel;
            return (
              <div
                key={s.id}
                ref={el => { panelRefs.current[i] = el; }}
                onClick={() => { setPanelIndex(i); setDrillChannel(null); setSection(s.id); }}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-colors ${
                  focused ? 'bg-white text-black' : active ? 'bg-white/[0.08] text-white' : 'text-white/50'
                }`}
              >
                {active && !focused && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full" style={{ background: BRAND }} />
                )}
                <Icon size={16} style={active && !focused ? { color: ACCENT_COOL } : undefined} />
                <span className="text-[13px] font-bold">{s.label}</span>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Content ── */}
      <main className="relative flex-1 overflow-y-auto px-10 py-7">
        {drillChannel && (
          <button
            onClick={() => setDrillChannel(null)}
            tabIndex={-1}
            className="flex items-center gap-2 mb-5 text-[11px] font-black uppercase tracking-widest text-white/50"
          >
            <ArrowLeft size={14} /> Back
          </button>
        )}

        {(loading || sectionLoading) && rails.length === 0 ? (
          <><SkeletonRail /><SkeletonRail /><SkeletonRail /></>
        ) : rails.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-white/45 text-sm font-bold">Nothing here yet.</p>
              <p className="text-white/25 text-xs mt-1">
                {section === 'SUBSCRIPTIONS' ? 'Subscribe to a channel and it will show up here.'
                  : section === 'WATCH_LATER' ? 'Videos you save for later land here.'
                  : section === 'LIKED' ? 'Videos you like show up here.'
                  : section === 'HISTORY' ? 'What you watch shows up here.'
                  : section === 'PLAYLISTS' ? 'Playlists you make show up here.'
                  : 'Leave and come back to try again.'}
              </p>
            </div>
          </div>
        ) : (
          rails.map((rail, rIdx) => (
            <section key={rail.id} className="mb-8">
              <RailHeading>{rail.title}</RailHeading>
              {/* The gutter exists because `overflow-x` clips BOTH axes: without it a focused
                  card's growth AND its focus ring get shaved off at the rail's edge, exactly when
                  you need to see them. RAIL_GUTTER is sized to the ring (see tvFocusRing.ts). */}
              <div className={`flex gap-6 overflow-x-auto no-scrollbar ${RAIL_GUTTER}`}>
                {rail.items.map((item, i) => (
                  <Card
                    key={`${rail.id}-${item.id}-${i}`}
                    item={item}
                    refKey={`${rIdx}:${i}`}
                    focused={zone === 'CONTENT' && isFocused(pos, rIdx, i)}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {sectionLoading && rails.length > 0 && <SkeletonRail />}
      </main>

      {/* A selected FAST channel plays fullscreen over Reello; Back (handled above) or the player's
          own close returns to the Live section. */}
      {channelPlayer && (
        <React.Suspense fallback={null}>
          <FastChannelPlayer profile={channelPlayer} onClose={() => setChannelPlayer(null)} />
        </React.Suspense>
      )}
    </div>
  );
};

export default ReelloTvView;
