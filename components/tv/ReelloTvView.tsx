import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Flame, Users, Zap, Radio, ListVideo, Clock, History, ThumbsUp, Play, Video as VideoIcon, ArrowLeft } from 'lucide-react';
import type { UserProfile, Video } from '../../types';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { useTvGrid } from '../../hooks/useTvGrid';
import { useTvShellFocus } from '../../hooks/useTvShellFocus';
import TvBrandBackdrop from './TvBrandBackdrop';
import TvHeroCarousel from './TvHeroCarousel';
import { tvCardRing } from './tvFocusRing';
import TvWindowedRail, { scrollRowIntoView, scrollBehaviorForMove } from './TvWindowedRail';
import { getTvVideos, peekResource, subscribeResource, TV_KEYS } from '../../services/tv/tvCatalogCache';
import type { ChannelSource } from '../../types';
import {
  asyncVideoRails, syncVideoRails, fetchUserVideos, videoItem, fastChannelItem, liveSourceItem,
  type ReelloBase, type TvVideoItem, type TvVideoRail,
} from './reelloTvSections';
import { fetchAllFastChannels, fetchActiveLiveSources, type FastChannelListing } from '../../services/backendService';
import { REELLO_TV_RAILS, composeSection, hasRegisteredRails, spliceRegistered } from './tvRailRegistry';

const FastChannelPlayer = React.lazy(() => import('../FastChannelPlayer'));
const TvLiveSourcePlayer = React.lazy(() => import('./TvLiveSourcePlayer'));

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
  // Seeded from the shared TV catalogue cache so a revisit renders instantly.
  const [videos, setVideos] = useState<Video[]>(() => peekResource<Video[]>(TV_KEYS.videos) || []);
  const [section, setSection] = useState<SectionId>('HOME');
  const [loading, setLoading] = useState(() => peekResource<Video[]>(TV_KEYS.videos) === undefined);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [cache, setCache] = useState<Record<string, TvVideoRail[]>>({});
  const [drillChannel, setDrillChannel] = useState<UserProfile | null>(null);
  const [drillRails, setDrillRails] = useState<TvVideoRail[]>([]);
  const [fastChannels, setFastChannels] = useState<FastChannelListing[]>([]);
  const [liveSources, setLiveSources] = useState<{ ownerId: string; source: ChannelSource }[]>([]);
  const [channelPlayer, setChannelPlayer] = useState<UserProfile | null>(null);   // open FAST player
  const [livePlaying, setLivePlaying] = useState<{ ownerId: string; source: ChannelSource } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAllFastChannels(60).then(c => { if (alive) setFastChannels(c || []); }).catch(() => {});
    fetchActiveLiveSources(120).then(s => { if (alive) setLiveSources(s || []); }).catch(() => {});
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
    getTvVideos()
      .then(v => { if (alive) { setVideos(v || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    const off = subscribeResource<Video[]>(TV_KEYS.videos, v => { if (alive) setVideos(v || []); });
    return () => { alive = false; off(); };
  }, []);

  const base: ReelloBase = useMemo(() => ({ videos, uid }), [videos, uid]);

  // Only successful results are cached — an empty one is left out so revisiting retries. Caching
  // a transient failure as though it were the answer left Chora's Radio section permanently blank
  // until an app restart; the same trap applies here.
  const inFlight = useRef<Record<string, boolean>>({});
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // `cache` is read through a ref rather than closed over, and is NOT a dependency. Publishing a
  // partial calls setCache, and if cache were a dep that would tear this effect down mid-flight —
  // cancelling the very fetch that was about to deliver the full result. The symptom was a
  // section stuck showing only its first partial rail forever.
  const cacheRef = useRef(cache); cacheRef.current = cache;
  useEffect(() => {
    if (loading || drillChannel) return;
    const local = syncVideoRails(section, base);
    if (local && !hasRegisteredRails(REELLO_TV_RAILS, section)) return;
    if (cacheRef.current[section] || inFlight.current[section]) return;
    let alive = true;
    inFlight.current[section] = true;
    setSectionLoading(true);
    // Built-ins + web-parity rails registered in tvRailRegistry. A locally-resolved section caches
    // only its registered rails; its built-ins stay live and are spliced in at render time.
    composeSection(REELLO_TV_RAILS, section, base,
      onP => (local ? Promise.resolve([] as TvVideoRail[]) : asyncVideoRails(section, base, onP)), partial => {
      // Gated on MOUNTED, not this effect run: base changing mid-fetch tore the effect down and
      // discarded the in-flight result while inFlight blocked the retry.
      if (mountedRef.current && partial.length) { setCache(c => ({ ...c, [section]: partial })); if (alive) setSectionLoading(false); }
    })
      .then(r => { if (mountedRef.current && r.length) setCache(c => ({ ...c, [section]: r })); })
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
    const local = syncVideoRails(section, base);
    const sectionRails = local ? spliceRegistered(REELLO_TV_RAILS, section, local, cache[section]) : (cache[section] ?? []);
    // The Live section leads with live-now sources, then the FAST channels lineup.
    if (section === 'LIVE') {
      const extra: TvVideoRail[] = [];
      if (liveSources.length) extra.push({ id: 'live-now', title: 'Live Now', items: liveSources.map(liveSourceItem) });
      if (fastChannels.length) extra.push({ id: 'fast-channels', title: 'FAST Channels', items: fastChannels.map(fastChannelItem) });
      if (extra.length) return [...extra, ...sectionRails];
    }
    return sectionRails;
  }, [drillChannel, drillRails, section, base, cache, fastChannels, liveSources]);

  const rows = useMemo(() => rails.map(r => ({ id: r.id, count: r.items.length })), [rails]);

  const run = (item: TvVideoItem) => {
    const a = item.action;
    if (a.kind === 'VIDEO') { onSelectVideo(a.video); return; }
    if (a.kind === 'FASTCHANNEL') { setChannelPlayer(a.profile); return; }
    if (a.kind === 'LIVESOURCE') { setLivePlaying({ ownerId: a.ownerId, source: a.source }); return; }
    if (a.kind === 'CHANNEL') { setDrillChannel(a.profile); return; }
    if (a.kind === 'PLAYLIST') {
      // Playing a playlist means playing its first video; the queue is the player's concern.
      const first = (a.playlist as any).videos?.[0];
      if (first) onSelectVideo(first);
    }
  };

  // Stable grid callbacks (read through refs) — useTvGrid re-binds its key listener whenever
  // onSelect/onBack change identity, which inline lambdas did on every focus move.
  const runRef = useRef(run); runRef.current = run;
  const railsRef = useRef(rails); railsRef.current = rails;
  const drillRef = useRef(drillChannel); drillRef.current = drillChannel;
  const setZoneRef = useRef<(z: 'PANEL' | 'CONTENT') => void>(() => {});
  const onGridSelect = useCallback((p: { row: number; col: number }, rowId: string) => {
    if (rowId === 'PANEL') {
      const s = SECTIONS[p.col];
      setDrillChannel(null);
      setSection(s.id);
      setZoneRef.current('CONTENT');
      return;
    }
    const item = railsRef.current.find(r => r.id === rowId)?.items[p.col];
    if (item) runRef.current(item);
  }, []);
  const onGridBack = useCallback(() => {
    if (drillRef.current) { setDrillChannel(null); return true; }
    return false;
  }, []);

  const { pos, zone, panelIndex, setPanelIndex, setZone } = useTvGrid({
    rows,
    panelCount: SECTIONS.length,
    onSelect: onGridSelect,
    onBack: onGridBack,
    enabled: !channelPlayer && !livePlaying,   // a fullscreen player owns the remote while it's open
  });
  setZoneRef.current = setZone;

  // Vertical: bring the focused rail into view (offset arithmetic, no scrollIntoView per press).
  // Horizontal scrolling is the rail's own job (TvWindowedRail).
  const mainRef = useRef<HTMLElement>(null);
  const focusedRailId = zone === 'CONTENT' ? rails[pos.row]?.id : undefined;
  useEffect(() => {
    const main = mainRef.current;
    if (!main || !focusedRailId) return;
    const behavior = scrollBehaviorForMove();
    if (pos.row === 0) { main.scrollTo({ top: 0, behavior }); return; }
    scrollRowIntoView(main, main.querySelector<HTMLElement>(`[data-tv-rail="${CSS.escape(focusedRailId)}"]`), behavior);
  }, [focusedRailId, pos.row]);

  const panelRefs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    if (zone !== 'PANEL') return;
    panelRefs.current[panelIndex]?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [panelIndex, zone]);

  const heroItems = useMemo(() => {
    if (drillChannel) return [];
    const seen = new Set<string>();
    return rails.flatMap(r => r.items)
      .filter(i => i.image && i.id && !seen.has(i.id) && (seen.add(i.id), true))
      .slice(0, 8).map(i => ({ id: i.id, title: i.title, subtitle: i.subtitle, image: i.image }));
  }, [rails, drillChannel]);

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
      <main ref={mainRef} className="relative flex-1 overflow-y-auto no-scrollbar px-10 py-7">
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
          <>
          {/* Reello's own hero — featured thumbnails from the current section (its 16:9 perspective,
              violet-accented). Hidden inside a channel drill-down. */}
          {heroItems.length > 0 && <div className="mb-8"><TvHeroCarousel items={heroItems} accent="#7C5CFF" eyebrow="Featured on Reello" /></div>}
          {rails.map((rail, rIdx) => (
            <TvWindowedRail
              key={rail.id}
              id={rail.id}
              title={rail.title}
              heading={railHeading}
              items={rail.items}
              focusedCol={zone === 'CONTENT' && pos.row === rIdx ? pos.col : -1}
              renderItem={renderReelloCard}
              gapClass="gap-6"
              estimateStride={304 + 24}
              estimateHeight={270}
            />
          ))}
          </>
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
      {livePlaying && (
        <React.Suspense fallback={null}>
          <TvLiveSourcePlayer ownerId={livePlaying.ownerId} source={livePlaying.source} onClose={() => setLivePlaying(null)} />
        </React.Suspense>
      )}
    </div>
  );
};

// ── Module-level pieces ───────────────────────────────────────────────────────
// Previously declared inside the screen, which made them new component types on every render:
// each D-pad press remounted every card on screen. Hoisted + memoised, a press touches two.

const ReelloCard = React.memo<{ item: TvVideoItem; focused: boolean }>(({ item, focused }) => {
  const isChannel = item.action.kind === 'CHANNEL';
  return (
    <div className={`transition-transform duration-150 ${isChannel ? 'w-44' : 'w-[19rem]'} ${focused ? 'scale-[1.04]' : ''}`}>
      <div
        className={`relative overflow-hidden bg-white/[0.05] ${isChannel ? 'rounded-full' : 'rounded-xl'}`}
        style={{
          aspectRatio: isChannel ? '1' : '16 / 9',
          // Shared with Taleo — see tvFocusRing.ts.
          boxShadow: tvCardRing(focused),
        }}
      >
        {item.image
          ? <img src={thumb(item.image, THUMB.card)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
});

const renderReelloCard = (item: TvVideoItem, _i: number, focused: boolean) => <ReelloCard item={item} focused={focused} />;

const railHeading = (title: string) => (
  <div className="mb-3">
    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">{title}</h2>
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

export default ReelloTvView;
