import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music2, Radio as RadioIcon, Library, Users, Disc3, Sparkles, Archive, Mic2, BookOpen, ListMusic, GraduationCap, Crown, Play, ArrowLeft, Waves } from 'lucide-react';
import type { Album, UserProfile } from '../../types';
import { fetchAllPublicAlbums, fetchUpcomingAlbums, searchUsers } from '../../services/backendService';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { useTvGrid, isFocused } from '../../hooks/useTvGrid';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { useTvShellFocus } from '../../hooks/useTvShellFocus';
import TvBrandBackdrop from './TvBrandBackdrop';
import TvHeroCarousel from './TvHeroCarousel';
import { tvCardRing, RAIL_GUTTER } from './tvFocusRing';
import { asyncRails, syncRails, MUSIC_HISTORY_ERAS, type BaseData, type TvItem, type TvRail } from './choraTvSections';

/**
 * Chora for television — built for the ten-foot view, not adapted to it.
 *
 * Structure follows Apple Music and Amazon Music on TV, which converged on the same shape for
 * good reason: a fixed vertical rail of sections on the left, horizontal content rails on the
 * right. Nothing is hidden behind a menu, so the shortest path to any section is "left, then up
 * or down" — two presses, always the same two.
 *
 * NAVIGATION IS DECLARED, NOT INFERRED. The screen tells useTvGrid its row lengths and the hook
 * moves an index. The generic spatial layer guesses from geometry, which is what made the old
 * screen jump around: overlapping rails and re-rendering cards changed the answer between
 * identical presses. Here the same press always does the same thing.
 *
 * Every section renders the same shape — titled rails of square cards — so switching sections
 * never changes how the remote behaves. What each section contains lives in choraTvSections.ts.
 *
 * No banners: the promos and the moment-in-history card that used to stack above the content are
 * folded into the first rail, which is the one place a TV viewer looks first.
 */

const SECTIONS = [
  { id: 'NEW',         label: 'New',         icon: Sparkles },
  { id: 'FOR_YOU',     label: 'For You',     icon: Music2 },
  { id: 'RADIO',       label: 'Radio',       icon: RadioIcon },
  { id: 'MY_LIBRARY',  label: 'My Library',  icon: Library },
  { id: 'AUDIUS',      label: 'Audius',      icon: Waves },
  { id: 'ARTISTS',     label: 'Artists',     icon: Users },
  { id: 'ALBUMS',      label: 'Albums',      icon: Disc3 },
  { id: 'GENRES',      label: 'Genres',      icon: ListMusic },
  { id: 'VAULT',       label: 'The Vault',   icon: Archive },
  { id: 'PODCASTS',    label: 'Podcasts',    icon: Mic2 },
  { id: 'AUDIO_BOOKS', label: 'Audiobooks',  icon: BookOpen },
  { id: 'PLAYLISTS',   label: 'Playlists',   icon: ListMusic },
  { id: 'CONSERVATORY',label: 'Conservatory',icon: GraduationCap },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

const ACCENT = '#22D3AA';           // Chora's teal, from the platform's service palette
const ACCENT_WARM = '#FF8C00';      // Plajah orange, used for the focus ring
// The house gradient. Used at low opacity as atmosphere, and at full strength only on the two
// things that should pull the eye: the wordmark and the Plajah+ entry. Spending it anywhere
// else would make everything shout and nothing read.
const BRAND = 'linear-gradient(135deg, #FF8C00 0%, #D40055 52%, #6B0099 100%)';

const ChoraTvView: React.FC<{
  userProfile: UserProfile | null;
  onSelectAlbum: (album: Album) => void;
  onOpenSection?: (id: SectionId) => void;
  onOpenPlus?: () => void;
}> = ({ userProfile, onSelectAlbum, onOpenSection, onOpenPlus }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [upcoming, setUpcoming] = useState<Album[]>([]);
  const [artists, setArtists] = useState<UserProfile[]>([]);
  const [section, setSection] = useState<SectionId>('NEW');
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  /** Fetched sections, kept so returning to one is instant rather than another spinner. */
  const [cache, setCache] = useState<Record<string, TvRail[]>>({});
  const [openEra, setOpenEra] = useState<string | null>(null);
  const [drillArtist, setDrillArtist] = useState<UserProfile | null>(null);

  // useGlobalPlayer merges the progress context, which ticks several times a second — using it
  // here re-rendered this whole screen continuously while music played.
  const { currentAlbum, currentTrack, isPlaying, playTrack, audioSource } = useGlobalPlayerState();
  // Two focus rings on screen at once reads as a bug, so the panel drops to its 'active'
  // treatment while the tab bar holds the remote.
  const shellFocused = useTvShellFocus();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [all, up, people] = await Promise.all([
        fetchAllPublicAlbums().catch(() => [] as Album[]),
        fetchUpcomingAlbums().catch(() => [] as Album[]),
        searchUsers('').catch(() => [] as UserProfile[]),
      ]);
      if (!alive) return;
      setAlbums((all || []).filter(a => a.type === 'MUSIC' || (a as any).subType === 'PODCAST'));
      setUpcoming(up || []);
      setArtists((people || []).filter(u => (u as any).isArtist));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const base: BaseData = useMemo(
    () => ({ albums: albums.filter(a => a.type === 'MUSIC'), upcoming, artists, userProfile }),
    [albums, upcoming, artists, userProfile],
  );

  // Sections that need the network fetch once and are then cached, so walking the rail up and
  // down does not re-hit archive.org on every pass.
  //
  // ONLY SUCCESSFUL RESULTS ARE CACHED. Caching an empty result was a real bug on the TV: a
  // transient failure during boot — which is exactly when the network is busiest — left the
  // section permanently blank until the app was restarted, because the cache entry said "already
  // fetched, nothing there". An empty result is now left uncached so revisiting retries, guarded
  // by inFlight so staying on the section does not spin.
  const inFlight = useRef<Record<string, boolean>>({});
  // `cache` is read through a ref rather than closed over, and is NOT a dependency. Publishing a
  // partial calls setCache, and if cache were a dep that would tear this effect down mid-flight —
  // cancelling the very fetch that was about to deliver the full result. The symptom was a
  // section stuck showing only its first partial rail forever.
  const cacheRef = useRef(cache); cacheRef.current = cache;
  useEffect(() => {
    if (loading) return;
    if (syncRails(section, base)) return;              // resolved locally, nothing to fetch
    if (cacheRef.current[section] || inFlight.current[section]) return;
    let alive = true;
    inFlight.current[section] = true;
    setSectionLoading(true);
    asyncRails(section, { ...base, albums }, partial => {
      // Publish rails as they arrive so a slow archive does not hold up the fast ones.
      if (alive && partial.length) {
        setCache(c => ({ ...c, [section]: partial }));
        setSectionLoading(false);
      }
    })
      .then(r => { if (alive && r.length) setCache(c => ({ ...c, [section]: r })); })
      .catch(() => { /* leave uncached: revisiting the section retries */ })
      .finally(() => {
        inFlight.current[section] = false;
        if (alive) setSectionLoading(false);
      });
    return () => { alive = false; };
  }, [section, loading, base, albums]);

  const rails: TvRail[] = useMemo(() => {
    if (drillArtist) {
      const own = albums.filter(a => a.ownerId === drillArtist.uid);
      return own.length
        ? [{ id: 'artist-albums', title: `${(drillArtist as any).displayName || 'Artist'} — Releases`,
             items: own.map(a => ({ id: a.id, title: a.title, subtitle: a.artist, image: a.coverImage,
                                    action: { kind: 'ALBUM' as const, album: a } })) }]
        : [];
    }
    return syncRails(section, base) ?? cache[section] ?? [];
  }, [drillArtist, albums, section, base, cache]);

  const rows = useMemo(() => rails.map(r => ({ id: r.id, count: r.items.length })), [rails]);

  const run = (item: TvItem) => {
    const a = item.action;
    if (a.kind === 'ALBUM') { onSelectAlbum(a.album); return; }
    if (a.kind === 'TRACK') {
      playTrack(a.track, a.album, a.source);
      // Open the now-playing album screen so the transport is reachable by D-pad — the fix for
      // "can't get onto play/pause after starting a single from My Library". Radio has no album and
      // stays on the tuner (its On Air hero is the now-playing surface). A loose single carries no
      // album, so wrap it in a one-track pseudo-album purely so the now-playing view has something
      // to render; the track itself is already playing from playTrack above.
      if (a.source === 'LIBRARY') {
        const alb = a.album || ({
          id: `single-${(a.track as any).id}`,
          title: a.track.title,
          artist: (a.track as any).artist || '',
          coverImage: (a.track as any).albumCover || (a.track as any).coverImage,
          tracks: [a.track],
          type: 'MUSIC',
        } as any);
        onSelectAlbum(alb);
      }
      return;
    }
    if (a.kind === 'ARTIST') { setDrillArtist(a.artist); return; }
    if (a.kind === 'ERA' && a.eraId) setOpenEra(a.eraId);
  };

  const { pos, zone, panelIndex, setPanelIndex, setZone } = useTvGrid({
    rows,
    enabled: !openEra,                       // the reader owns the remote while it is open
    panelCount: SECTIONS.length + 1,         // + the Plajah+ entry pinned at the bottom
    onSelect: (p, rowId) => {
      if (rowId === 'PANEL') {
        if (p.col === SECTIONS.length) { onOpenPlus?.(); return; }   // the pinned entry
        const s = SECTIONS[p.col];
        setDrillArtist(null);
        setSection(s.id);
        onOpenSection?.(s.id);
        setZone('CONTENT');
        return;
      }
      const item = rails.find(r => r.id === rowId)?.items[p.col];
      if (item) run(item);
    },
    onBack: () => {
      if (drillArtist) { setDrillArtist(null); return true; }
      return false;
    },
  });

  // The era reader takes the remote entirely: Back or OK closes it. Bound only while open, so it
  // cannot interfere with the grid the rest of the time.
  useEffect(() => {
    if (!openEra) return;
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode || e.which;
      if (kc === 4 || kc === 13 || kc === 23 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'XF86Back') {
        e.preventDefault(); e.stopImmediatePropagation();
        setOpenEra(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openEra]);

  // Keep the focused card on screen. Scrolls the RAIL horizontally and the page vertically,
  // rather than relying on the browser to guess which axis mattered.
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

  const isItemPlaying = (item: TvItem) => {
    const a = item.action;
    if (a.kind === 'ALBUM') return !!currentAlbum && currentAlbum.id === a.album.id;
    if (a.kind === 'TRACK') return !!currentTrack && currentTrack.id === a.track.id;
    return false;
  };

  const Card: React.FC<{ item: TvItem; focused: boolean; large?: boolean; refKey: string }> = ({ item, focused, large, refKey }) => {
    const playing = isItemPlaying(item);
    return (
      <div
        ref={el => { cellRefs.current[refKey] = el; }}
        className={`shrink-0 transition-transform duration-150 ${large ? 'w-64' : 'w-40'} ${focused ? 'scale-105' : ''}`}
      >
        <div
          className="relative rounded-2xl overflow-hidden bg-white/[0.05]"
          style={{
            aspectRatio: '1',
            // Shared with Taleo — see tvFocusRing.ts. Focus outranks the playing ring:
            // seeing where you are matters more than what is playing.
            boxShadow: tvCardRing(focused, playing, ACCENT),
          }}
        >
          {item.image
            ? <img src={thumb(item.image, large ? THUMB.card : 224)} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full grid place-items-center" style={{ background: item.action.kind === 'ERA' ? BRAND : undefined }}>
                {item.action.kind === 'ERA'
                  ? <GraduationCap size={30} className="text-white/85" />
                  : <Music2 size={28} className="text-white/20" />}
              </div>}
          {focused && (
            <span className="absolute bottom-2 right-2 w-9 h-9 rounded-full grid place-items-center" style={{ background: ACCENT_WARM }}>
              <Play size={16} className="text-black ml-0.5" fill="black" />
            </span>
          )}
          {playing && !focused && (
            // Three bars rather than a label: at ten feet the shape reads before any word does.
            <span className="absolute bottom-2 left-2 flex items-center gap-[3px] h-6 px-2 rounded-full bg-black/70">
              {[0, 1, 2].map(b => (
                <span
                  key={b}
                  className="w-[3px] rounded-full"
                  style={{
                    background: ACCENT,
                    height: isPlaying ? undefined : '5px',
                    animation: isPlaying ? `choraTvBar 0.9s ease-in-out ${b * 0.18}s infinite alternate` : 'none',
                  }}
                />
              ))}
            </span>
          )}
        </div>
        <p className={`mt-2 font-bold truncate ${focused ? 'text-white' : 'text-white/65'} ${large ? 'text-sm' : 'text-xs'}`}>
          {item.title}
        </p>
        <p className="text-[11px] text-white/40 truncate">{item.subtitle || ''}</p>
      </div>
    );
  };

  // A short rule under each rail title, tinted with the brand gradient. It gives the rails a
  // spine without adding another box, and it is the one place the full gradient repeats.
  const RailHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mb-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">{children}</h2>
      <span className="block mt-1.5 h-[2px] w-11 rounded-full" style={{ background: BRAND }} />
    </div>
  );

  // A grey rail in the shape of the real thing. On a television a spinner in the middle of a
  // black screen gives no sense of whether anything is coming; a rail that is already the right
  // size and position tells you what is about to appear and stops the layout jumping when it does.
  const SkeletonRail: React.FC<{ large?: boolean }> = ({ large }) => (
    <section className="mb-8">
      <div className="mb-3">
        <div className="h-2 w-28 rounded-full bg-white/[0.07] animate-pulse" />
        <span className="block mt-1.5 h-[2px] w-11 rounded-full bg-white/10" />
      </div>
      <div className="flex gap-4">
        {Array.from({ length: large ? 6 : 8 }).map((_, i) => (
          <div key={i} className={`shrink-0 ${large ? 'w-64' : 'w-40'}`}>
            <div
              className="rounded-2xl bg-white/[0.05] animate-pulse"
              style={{ aspectRatio: '1', animationDelay: `${i * 90}ms` }}
            />
            <div className="mt-2 h-2.5 w-3/4 rounded-full bg-white/[0.06]" />
            <div className="mt-1.5 h-2 w-1/2 rounded-full bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </section>
  );

  const Skeleton: React.FC = () => (
    <>
      <SkeletonRail large />
      <SkeletonRail />
      <SkeletonRail />
    </>
  );

  const era = openEra ? MUSIC_HISTORY_ERAS.find(e => e.id === openEra) : null;

  return (
    // data-tv-capture tells the global spatial layer to keep its hands off: this screen owns
    // its arrows, and two navigation systems acting on one press is how the old one broke.
    <div className="relative flex h-full" data-tv-capture>
      <style>{`@keyframes choraTvBar { from { height: 4px } to { height: 14px } }`}</style>
      <TvBrandBackdrop />

      {/* ── Sections rail ── */}
      {/* A brand-tinted scrim, not a blur: TV runs with html.perf-no-blur, which forces
          backdrop-filter to none, and the readable fallback only covers .glass classes. A
          translucent panel would sit unblurred on top of the 0.85-alpha purple bloom and eat the
          labels. Violet-black rather than neutral black so the rail still belongs to the gradient. */
      }
      <aside
        className="relative w-60 shrink-0 border-r border-white/[0.07] flex flex-col py-6"
        style={{ background: 'linear-gradient(90deg, rgba(9,0,15,0.88) 0%, rgba(9,0,15,0.72) 100%)' }}
      >
        <div className="px-6 mb-7">
          <p
            className="text-2xl font-black italic tracking-tighter leading-none"
            style={{ background: BRAND, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >CHORA</p>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-1" style={{ color: ACCENT }}>Music</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            const focused = zone === 'PANEL' && panelIndex === i && !shellFocused;
            const active = section === s.id;
            return (
              <div
                key={s.id}
                ref={el => { panelRefs.current[i] = el; }}
                onClick={() => { setPanelIndex(i); setDrillArtist(null); setSection(s.id); onOpenSection?.(s.id); }}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-colors ${
                  focused ? 'bg-white text-black' : active ? 'bg-white/[0.08] text-white' : 'text-white/50'
                }`}
              >
                {/* The active section keeps a gradient tick even while focus is elsewhere, so the
                    viewer never loses track of which section the content on the right belongs to. */}
                {active && !focused && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full" style={{ background: BRAND }} />
                )}
                <Icon size={16} style={active && !focused ? { color: ACCENT } : undefined} />
                <span className="text-[13px] font-bold">{s.label}</span>
              </div>
            );
          })}
        </nav>

        {/* Plajah+ lives here rather than as a banner over the content — reachable, not in the way. */}
        <div
          ref={el => { panelRefs.current[SECTIONS.length] = el; }}
          onClick={onOpenPlus}
          className={`mx-3 mt-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
            zone === 'PANEL' && panelIndex === SECTIONS.length && !shellFocused ? 'bg-white text-black' : 'text-white'
          }`}
          style={zone === 'PANEL' && panelIndex === SECTIONS.length && !shellFocused ? undefined : { background: BRAND }}
        >
          <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
            <Crown size={14} /> Plajah+
          </span>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="relative flex-1 overflow-y-auto px-10 py-7">
        {drillArtist && (
          <button
            onClick={() => setDrillArtist(null)}
            tabIndex={-1}
            className="flex items-center gap-2 mb-5 text-[11px] font-black uppercase tracking-widest text-white/50"
          >
            <ArrowLeft size={14} /> Back to Artists
          </button>
        )}

        {(loading || sectionLoading) && rails.length === 0 ? (
          <Skeleton />
        ) : rails.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-white/45 text-sm font-bold">Nothing here yet.</p>
              <p className="text-white/25 text-xs mt-1">Leave and come back to try again.</p>
            </div>
          </div>
        ) : (
          <>
          {/* Chora's own hero — featured cover art from the current section, its own perspective on
              the marquee (Radio keeps the On Air hero below instead). */}
          {section !== 'RADIO' && !drillArtist && (() => {
            const seen = new Set<string>();
            const heroItems = rails.flatMap(r => r.items)
              .filter(i => (i as any).image && i.id && !seen.has(i.id) && (seen.add(i.id), true))
              .slice(0, 8).map(i => ({ id: i.id, title: i.title, subtitle: (i as any).subtitle, image: (i as any).image }));
            return heroItems.length ? <div className="mb-8"><TvHeroCarousel items={heroItems} accent="#7C5CFF" eyebrow="Featured on Chora" /></div> : null;
          })()}
          {/* Radio, like the web, leads with a NOW-PLAYING hero — the station on air, big, with a
              live pulse — instead of dropping straight into browse rails. The station picker (Chora
              Radio / Artist Stations / Live) stays below as the rails. No blur: TV fill-rate. */}
          {section === 'RADIO' && (() => {
            const onAir = audioSource === 'RADIO' && !!currentTrack;
            const art = onAir ? ((currentTrack as any)?.albumCover || (currentTrack as any)?.images?.[0]) : undefined;
            return (
              <div className="mb-9 flex items-center gap-7 rounded-3xl p-6 bg-black/30 border border-white/10">
                <div className="relative w-40 h-40 rounded-2xl overflow-hidden bg-white/[0.06] shrink-0 shadow-[0_24px_60px_rgba(0,0,0,0.6)] grid place-items-center">
                  {art ? <img src={thumb(art, THUMB.card)} alt="" className="w-full h-full object-cover" /> : <RadioIcon size={44} className="text-white/25" />}
                  {/* Live equaliser over the art while actually on air — the web hero's signature. */}
                  {onAir && isPlaying && (
                    <div className="absolute bottom-0 left-0 right-0 h-2/5 flex items-end justify-center gap-1.5 px-3 pb-3 bg-gradient-to-t from-black/70 to-transparent">
                      {[0, 120, 240, 90, 200].map((d, i) => (
                        <span key={i} className="tv-eq-bar w-1.5 h-full rounded-full bg-[#FF8C00]" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${onAir && isPlaying ? 'bg-red-500 animate-pulse' : 'bg-white/30'}`} />
                    <span className={`text-[11px] font-black uppercase tracking-[0.3em] ${onAir && isPlaying ? 'text-red-400' : 'text-white/40'}`}>
                      {onAir && isPlaying ? 'On Air · Chora Radio' : 'Chora Radio'}
                    </span>
                  </div>
                  <h2 className="text-4xl font-black leading-none truncate">{onAir ? (currentTrack?.title || 'Now playing') : 'Live Site-Wide Broadcast'}</h2>
                  <p className="text-lg text-white/55 truncate mt-2">{onAir ? (currentTrack?.artist || '') : 'Pick a station below to tune in'}</p>
                </div>
              </div>
            );
          })()}
          {rails.map((rail, rIdx) => (
            <section key={rail.id} className="mb-8">
              <RailHeading>{rail.title}</RailHeading>
              {/* The gutter exists because `overflow-x` clips BOTH axes: without it a focused
                  card's 4% growth AND its focus ring get shaved off at the rail's edge, exactly
                  when you need to see them. RAIL_GUTTER is sized to the ring (see tvFocusRing.ts);
                  the negative margin keeps the rail aligned with the heading above it. */}
              <div className={`flex gap-4 overflow-x-auto no-scrollbar ${RAIL_GUTTER}`}>
                {rail.items.map((item, i) => (
                  <Card
                    key={`${rail.id}-${item.id}-${i}`}
                    item={item}
                    large={rIdx === 0}
                    refKey={`${rIdx}:${i}`}
                    focused={zone === 'CONTENT' && isFocused(pos, rIdx, i)}
                  />
                ))}
              </div>
            </section>
          ))}
          </>
        )}

        {/* More shelves still landing: keep the page height stable rather than letting content
            jump up as each archive answers. */}
        {sectionLoading && rails.length > 0 && <SkeletonRail />}
      </main>

      {/* ── Era reader ──
          The Conservatory's history is prose, and prose at ten feet needs a column, not a page.
          Opens over everything and closes on Back or OK. */}
      {era && (
        <div className="absolute inset-0 z-20 bg-[#07070a]/97 overflow-y-auto px-24 py-14">
          <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: ACCENT }}>{era.span}</p>
          <h1 className="text-4xl font-black tracking-tight mt-2 mb-1 text-white">{era.title}</h1>
          <span className="block h-[3px] w-20 rounded-full mb-7" style={{ background: BRAND }} />
          <p className="max-w-3xl text-[17px] leading-relaxed text-white/75">{era.essay}</p>

          <div className="mt-9 grid grid-cols-2 gap-10 max-w-4xl">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-3">What Changed</p>
              <ul className="space-y-2">
                {era.developments.map((d, i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-white/70">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT }} />{d}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-3">Listen For</p>
              <ul className="space-y-2">
                {era.listenFor.map((d, i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-white/70">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT_WARM }} />{d}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-12 text-[11px] font-black uppercase tracking-[0.25em] text-white/30">Press Back to return</p>
        </div>
      )}
    </div>
  );
};

export default ChoraTvView;
