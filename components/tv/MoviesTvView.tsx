import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Film, Play, Radio } from 'lucide-react';
import type { Video, Album, UserProfile, ChannelSource } from '../../types';
import { useTvGrid } from '../../hooks/useTvGrid';
import { tvCardRing } from './tvFocusRing';
import TvWindowedRail, { scrollRowIntoView, scrollBehaviorForMove } from './TvWindowedRail';
import { TALEO_TV_RAILS, loadTaleoCuratedCollections } from './tvRailRegistry';
import { thumb, THUMB, onThumbError } from '../../src/lib/imageThumb';
import TvBrandBackdrop from './TvBrandBackdrop';
import { loadPlatformRails, loadArchiveRails, loadLiveRail, type TaleoRail, type TaleoItem } from './moviesTvSections';
import TvHeroCarousel from './TvHeroCarousel';
import { fetchVideoById, syncPublicDomainAsset } from '../../services/backendService';
import { getArchiveItemFiles, getBestVideoUrl } from '../../services/archiveContentService';

const FastChannelPlayer = React.lazy(() => import('../FastChannelPlayer'));
const TvLiveSourcePlayer = React.lazy(() => import('./TvLiveSourcePlayer'));

/**
 * Taleo on a television — the declarative twin of the pointer-driven MoviesTVView, built on the
 * same useTvGrid Chora and Reello use. The old TV Taleo was the WEB view left to the global
 * geometric navigator, which infers the "nearest" focusable from element rects; on a dense,
 * multi-rail film wall that guesses wrong and reads as jumpy. Here the screen declares its rows and
 * a press only ever moves an index, so the same press always does the same thing.
 *
 * Poster cards (2/3), one vertical stack of rails, no side panel — a lean-back film grid. Selecting
 * a card opens MovieUXView (raw Video / VIDEO Album); a Continue-Watching card re-fetches by id first.
 */

const MoviesTvView: React.FC<{
  onBack: () => void;
  onSelectMovie: (item: Video | Album) => void;
}> = ({ onBack, onSelectMovie }) => {
  // Each source lands in its own slot and the screen is assembled in a FIXED order below. Splicing
  // into one array as each promise resolved meant a fast Live rail could be overwritten by the
  // platform rails landing after it.
  const [platform, setPlatform] = useState<TaleoRail[]>([]);
  const [liveRail, setLiveRail] = useState<TaleoRail | null>(null);
  const [archive, setArchive] = useState<TaleoRail[]>([]);
  const [curated, setCurated] = useState<TaleoRail[]>([]);
  /** Web-parity rails declared in tvRailRegistry (TALEO_TV_RAILS), keyed by def id. */
  const [registered, setRegistered] = useState<Record<string, TaleoRail>>({});
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<UserProfile | null>(null);   // open FAST channel, if any
  const [livePlaying, setLivePlaying] = useState<{ ownerId: string; source: ChannelSource } | null>(null);
  const opening = useRef(false);   // guards the async archive open against a double-press

  useEffect(() => {
    let alive = true;
    // Platform rails first (fast) so the screen appears immediately; Live, curated, registered and
    // the ~20 Internet Archive genre rails fill in as they arrive — the screen never blocks.
    loadPlatformRails()
      .then(r => { if (alive) { setPlatform(r); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    loadLiveRail()
      .then(live => { if (alive) setLiveRail(live); })
      .catch(() => {});
    loadTaleoCuratedCollections()
      .then(c => { if (alive) setCurated(c); })
      .catch(() => {});
    TALEO_TV_RAILS.forEach(def => {
      Promise.resolve()
        .then(() => def.load())
        .then(items => {
          if (alive && items?.length) setRegistered(prev => ({ ...prev, [def.id]: { id: def.id, title: def.title, items } }));
        })
        .catch(() => {});
    });
    loadArchiveRails(50)
      .then(a => { if (alive && a.length) setArchive(a); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const rails: TaleoRail[] = useMemo(() => {
    const reg = (pos: 'start' | 'end') => TALEO_TV_RAILS
      .filter(d => (d.position || 'end') === pos).map(d => registered[d.id]).filter(Boolean);
    const cont = platform.filter(r => r.id === 'continue');
    const rest = platform.filter(r => r.id !== 'continue');
    return [
      ...cont,
      ...(liveRail ? [liveRail] : []),
      ...reg('start'),
      ...rest,
      ...curated,
      ...reg('end'),
      ...archive,
    ];
  }, [platform, liveRail, curated, registered, archive]);

  // Hardware Back closes the FAST channel player (consume it, else it navigates the app to login).
  useEffect(() => {
    if (!channel) return;
    const onHwBack = (e: Event) => { e.preventDefault(); setChannel(null); };
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => window.removeEventListener('plajah:hardware-back', onHwBack);
  }, [channel]);
  // (TvLiveSourcePlayer handles its own hardware-back; grid is disabled while it's open.)

  // Featured backdrops for the hero — drawn from the marquee rails (not Live/Continue). Each hero
  // slide keeps its source item's action (so OK opens the content) and, when the item is a video
  // with a directly-playable url, a videoUrl for the silent autoplay preview.
  // NOTE: declared BEFORE heroRowOffset/rows below, which reference it — reordering it later caused a
  // "Cannot access before initialization" TDZ crash on the Taleo screen.
  const heroItems = useMemo(() => {
    const pool = rails.filter(r => ['new', 'movies', 'creators', 'series'].includes(r.id)).flatMap(r => r.items);
    const seen = new Set<string>();
    const heroVideoUrl = (a: any): string | undefined => {
      if (a?.kind !== 'ITEM') return undefined;
      const it: any = a.item;
      return it?.customVideoUrl || it?.tracks?.[0]?.url || it?.videoUrl || undefined;
    };
    return pool.filter(i => i.image && i.id && !seen.has(i.id) && (seen.add(i.id), true))
      .slice(0, 8).map(i => ({ id: i.id, title: i.title, subtitle: i.subtitle, image: i.image, videoUrl: heroVideoUrl(i.action), action: i.action }));
  }, [rails]);

  // The hero (when present) is grid row 0, so rails shift down by one — every rail focus check adds
  // this offset. Making the hero a real row means OK selects it AND focusing it scrolls it fully into
  // view (which also fixes it rendering clipped when it sat outside the focus flow).
  const heroRowOffset = heroItems.length > 0 ? 1 : 0;
  const rows = useMemo(() => {
    const railRows = rails.map(r => ({ id: r.id, count: r.items.length }));
    return heroItems.length > 0 ? [{ id: 'hero', count: heroItems.length }, ...railRows] : railRows;
  }, [rails, heroItems.length]);

  const run = (rowId: string, col: number) => {
    // The hero is the top D-pad row (row 0) — OK opens the featured slide's content, same as a rail card.
    const item = rowId === 'hero' ? (heroItems[col] as any) : rails.find(r => r.id === rowId)?.items[col];
    if (!item) return;
    const a = item.action;
    if (a.kind === 'ITEM') { onSelectMovie(a.item); return; }
    if (a.kind === 'RESUME') {
      // Continue watching → re-fetch the full video, then open (mirrors MoviesTVView.resumeItem).
      fetchVideoById(a.id).then(v => { if (v) onSelectMovie(v); }).catch(() => {});
      return;
    }
    if (a.kind === 'CHANNEL') { setChannel(a.channel); return; }
    if (a.kind === 'LIVESOURCE') { setLivePlaying({ ownerId: a.ownerId, source: a.source }); return; }
    // Internet Archive → resolve a playable derivative + synthesize the VIDEO album MovieUXView
    // expects (mirrors MoviesTVView.handleSelectArchiveItem). Async, so guard against re-entry.
    if (a.kind === 'ARCHIVE') {
      if (opening.current) return;
      opening.current = true;
      const v = a.archive;
      const ownerId = v.source === 'EUROPEANA' ? 'europeana' :
        v.source === 'KOFA' ? 'korean-film-archive' :
        v.source === 'LIBRARY_OF_CONGRESS' ? 'library-of-congress' : 'internet-archive';
      const artist = v.dataProvider || v.genre || 'Classic Cinema';

      const dispatchMovie = (url?: string) => {
        if (url) syncPublicDomainAsset(v, url, 'VIDEO').catch(() => {});
        onSelectMovie({
          id: v.identifier, title: v.title, artist,
          coverImage: v.thumbnailUrl || '', headerImage: v.thumbnailUrl,
          description: v.description, type: 'VIDEO', subType: 'MOVIE',
          ownerId, createdAt: parseInt(v.year || '0'), themeColor: '#000000',
          tracks: url ? [{ id: v.identifier, title: v.title, artist, url, albumCover: v.thumbnailUrl || '' }] : [],
          customVideoUrl: url || undefined,
          embedUrl: url && (url.includes('/embed/') || url.includes('youtube') || url.includes('youtu.be')) ? url : undefined,
          source: v.source,
          sourceUrl: v.sourceUrl,
          dataProvider: v.dataProvider,
        } as any);
      };

      if (v.videoUrl || (v.source && v.source !== 'INTERNET_ARCHIVE')) {
        dispatchMovie(v.videoUrl);
        opening.current = false;
        return;
      }

      getArchiveItemFiles(v.identifier)
        .then(files => {
          const url = getBestVideoUrl(v.identifier, files);
          dispatchMovie(url);
        })
        .catch(() => {})
        .finally(() => { opening.current = false; });
    }
  };

  // Stable grid callbacks (through refs): useTvGrid re-binds its key listener when these change.
  const runRef = useRef(run); runRef.current = run;
  const onBackRef = useRef(onBack); onBackRef.current = onBack;
  const onGridSelect = useCallback((p: { row: number; col: number }, rowId: string) => runRef.current(rowId, p.col), []);
  const onGridBack = useCallback(() => { onBackRef.current(); return true; }, []);

  const { pos, zone } = useTvGrid({
    rows,
    onSelect: onGridSelect,
    onBack: onGridBack,
    enabled: !channel && !livePlaying,   // a fullscreen player owns the remote while it's open
  });

  // Vertical: keep the focused rail in view with offset arithmetic (no getBoundingClientRect per
  // press). Horizontal is the rail's own job (TvWindowedRail), which only scrolls at the edges.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const focusedRowId = zone === 'CONTENT' ? rows[pos.row]?.id : undefined;
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || !focusedRowId) return;
    const behavior = scrollBehaviorForMove();
    if (pos.row === 0) { sc.scrollTo({ top: 0, behavior }); return; }
    scrollRowIntoView(sc, sc.querySelector<HTMLElement>(`[data-tv-rail="${CSS.escape(focusedRowId)}"]`), behavior);
  }, [focusedRowId, pos.row]);

  // Pointer support without a per-card closure (which would defeat the card memo): one delegated
  // click handler resolves the rail + column from data attributes TvWindowedRail already sets.
  const onClickDelegated = useCallback((e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-tv-col]');
    const rail = cell?.closest<HTMLElement>('[data-tv-rail]');
    if (cell && rail) runRef.current(rail.dataset.tvRail || '', Number(cell.dataset.tvCol));
  }, []);

  return (
    <div className="relative h-[100dvh] text-white flex flex-col overflow-hidden" data-tv-capture>
      <TvBrandBackdrop />

      <div className="relative flex items-center gap-3 px-12 pt-9 pb-3 shrink-0">
        <Film size={22} className="text-white/70" />
        <h1 className="text-2xl font-black tracking-tight">Taleo</h1>
      </div>

      <div ref={scrollerRef} onClick={onClickDelegated} className="relative flex-1 overflow-y-auto no-scrollbar px-12 pb-16 space-y-9">
        {heroItems.length > 0 && (() => {
          const heroFocused = zone === 'CONTENT' && pos.row === 0;
          return (
            <div>
              <TvHeroCarousel
                items={heroItems as any}
                accent="#FF8C00"
                eyebrow="Featured on Taleo"
                focused={heroFocused}
                activeIndex={heroFocused ? pos.col : undefined}
              />
            </div>
          );
        })()}
        {loading && (
          <div className="space-y-9">
            {[0, 1, 2].map(r => (
              <div key={r}>
                <div className="h-4 w-40 bg-white/10 rounded mb-4" />
                <div className="flex gap-6">{[0, 1, 2, 3, 4].map(c => <div key={c} className="w-48 aspect-[2/3] rounded-xl bg-white/[0.06] shrink-0" />)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && rails.length === 0 && (
          <p className="text-white/40 text-lg mt-10">No films or series yet.</p>
        )}

        {rails.map((rail, rIdx) => (
          <TvWindowedRail
            key={rail.id}
            id={rail.id}
            title={rail.title}
            items={rail.items}
            focusedCol={zone === 'CONTENT' && pos.row === rIdx + heroRowOffset ? pos.col : -1}
            renderItem={renderTaleoCard}
            gapClass="gap-6"
            estimateStride={192 + 24}
            estimateHeight={400}
          />
        ))}
      </div>

      {/* A selected FAST channel plays fullscreen over the grid; Back (hardware event handled above,
          or the player's own close) returns to Taleo. */}
      {channel && (
        <Suspense fallback={null}>
          <FastChannelPlayer profile={channel} onClose={() => setChannel(null)} />
        </Suspense>
      )}
      {livePlaying && (
        <Suspense fallback={null}>
          <TvLiveSourcePlayer ownerId={livePlaying.ownerId} source={livePlaying.source} onClose={() => setLivePlaying(null)} />
        </Suspense>
      )}
    </div>
  );
};

// Hoisted + memoised so a D-pad press re-renders two cards, not the whole wall.
const TaleoCard = React.memo<{ it: TaleoItem; focused: boolean }>(({ it, focused }) => (
  <div className="w-48 cursor-pointer transition-transform" style={focused ? { transform: 'scale(1.05)' } : undefined}>
    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.05]" style={{ boxShadow: tvCardRing(focused) }}>
      {it.image
        ? <img src={thumb(it.image, THUMB.card)} onError={onThumbError(it.image)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        : <div className="w-full h-full grid place-items-center"><Film size={30} className="text-white/15" /></div>}
      {focused && (
        <div className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="w-12 h-12 rounded-full grid place-items-center" style={{ background: '#FF8C00', color: '#000' }}><Play size={22} fill="currentColor" className="ml-0.5" /></span>
        </div>
      )}
      {typeof it.progress === 'number' && it.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20"><div className="h-full bg-[#FF8C00]" style={{ width: `${Math.round(it.progress * 100)}%` }} /></div>
      )}
    </div>
    <p className={`mt-2 text-sm font-bold truncate ${focused ? 'text-white' : 'text-white/80'}`}>{it.title}</p>
    {it.subtitle && <p className="text-xs text-white/40 truncate">{it.subtitle}</p>}
  </div>
));

const renderTaleoCard = (it: TaleoItem, _i: number, focused: boolean) => <TaleoCard it={it} focused={focused} />;

export default MoviesTvView;
