import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Album, UserProfile, Video } from '../../types';
import { useTvGrid } from '../../hooks/useTvGrid';
import { useUniversalPlatformSearch, type UniversalPlatformResult } from '../../hooks/useUniversalPlatformSearch';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { searchStations, type RadioStation } from '../../services/radioBrowser';
import { getTvPublicAlbums, getTvVideos } from '../../services/tv/tvCatalogCache';
import { tvCardRing } from './tvFocusRing';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import TvBrandBackdrop from './TvBrandBackdrop';
import TvWindowedRail, { scrollRowIntoView, scrollBehaviorForMove } from './TvWindowedRail';
import { stationItem } from './choraTvSections';
import { consumePendingMatterSearch } from '../../services/tv/matterCastingBridge';

/**
 * Global TV search — one box, every catalogue.
 *
 * Two sources, merged into rails:
 *  · The TV's shared catalogue cache (services/tv/tvCatalogCache) for Chora / Taleo / Reello —
 *    filtered locally, instant, no extra download (Chora and Taleo already loaded it).
 *  · The SAME universal search the web command bar uses (hooks/useUniversalPlatformSearch) for
 *    artists, podcasts and live streams — plus Radio Browser (services/radioBrowser.searchStations)
 *    for live radio, as the Chora radio tuner does. The universal hook is heavy (several catalogue
 *    reads + 3 listeners), so it is only MOUNTED once the viewer has typed 2+ characters.
 *
 * A remote is a poor typewriter, so pressing OK on the search box hands DOM focus to a real <input>,
 * which brings up Android TV's system keyboard / voice entry. While that input holds focus the grid
 * stays deaf (useTvGrid ignores INPUT); the input's own handler walks focus DOWN into the results.
 *
 * Rows: 0 = search box, then one rail per result kind. Empty rails report count 0 and useTvGrid
 * skips them, so a press never lands on a section with nothing in it.
 */

const CAP = 18;   // per-rail result cap — plenty on a wall, cheap to render/decode on the TV SoC.

interface Props {
  onBack: () => void;
  onSelectAlbum: (a: Album) => void;
  onSelectMovie: (item: Video | Album) => void;
  onSelectVideo: (v: Video) => void;
}

type Shape = 'square' | 'wide' | 'round';
interface Hit {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  shape: Shape;
  open: () => void;
}
interface HitRail { id: string; title: string; items: Hit[] }

const norm = (s?: string) => (s || '').toLowerCase();

/** Mounted only while a real query exists — see the header. Reports results upward. */
const UniversalFeeder: React.FC<{ q: string; onResults: (r: UniversalPlatformResult[]) => void }> = ({ q, onResults }) => {
  const { results } = useUniversalPlatformSearch(q);
  useEffect(() => { onResults(results); }, [results, onResults]);
  return null;
};

const TvSearchView: React.FC<Props> = ({ onBack, onSelectAlbum, onSelectMovie, onSelectVideo }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  // A Matter casting client (or another remote app) can open search with a query already in it.
  const [q, setQ] = useState(() => consumePendingMatterSearch() ?? '');
  const [debounced, setDebounced] = useState(q);
  const [universal, setUniversal] = useState<UniversalPlatformResult[]>([]);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [artist, setArtist] = useState<UserProfile | null>(null);   // artist drill-in
  const inputRef = useRef<HTMLInputElement>(null);
  const { playTrack } = useGlobalPlayerState();

  useEffect(() => {
    let alive = true;
    Promise.all([getTvPublicAlbums().catch(() => [] as Album[]), getTvVideos().catch(() => [] as Video[])])
      .then(([a, v]) => { if (!alive) return; setAlbums(a); setVideos(v); });
    return () => { alive = false; };
  }, []);

  // Typing on a TV keyboard fires a change per character; debounce before filtering 600 albums
  // and before any network search.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debounced.length < 2) { setStations([]); setUniversal([]); return; }
    let alive = true;
    searchStations({ name: debounced, limit: CAP, playableOnly: true })
      .then(s => { if (alive) setStations((s || []).filter(st => !st.blockedMixedContent)); })
      .catch(() => { if (alive) setStations([]); });
    return () => { alive = false; };
  }, [debounced]);

  const onUniversal = useCallback((r: UniversalPlatformResult[]) => setUniversal(r), []);

  const rails: HitRail[] = useMemo(() => {
    // Artist drill-in: that artist's releases and videos.
    if (artist) {
      const name = (artist as any).displayName || 'Artist';
      return [
        { id: 'a-music', title: `${name} — Music`, items: albums.filter(a => a.ownerId === artist.uid && a.type === 'MUSIC').slice(0, 40).map(a => albumHit(a, onSelectAlbum)) },
        { id: 'a-film', title: `${name} — Film & TV`, items: albums.filter(a => a.ownerId === artist.uid && a.type === 'VIDEO').slice(0, 40).map(a => ({ ...albumHit(a, () => onSelectMovie(a)), shape: 'wide' as Shape })) },
        { id: 'a-video', title: `${name} — Videos`, items: videos.filter(v => (v as any).ownerId === artist.uid).slice(0, 40).map(v => videoHit(v, onSelectVideo)) },
      ];
    }

    const needle = norm(debounced);
    if (!needle) return [];
    const hit = (...parts: (string | undefined)[]) => parts.some(p => norm(p).includes(needle));
    const music = albums.filter(a => a.type === 'MUSIC' && (a as any).subType !== 'PODCAST' && hit(a.title, a.artist)).slice(0, CAP);
    const taleo: (Album | Video)[] = [
      ...albums.filter(a => a.type === 'VIDEO' && hit(a.title, a.artist)),
      ...videos.filter(v => (v.subType === 'MOVIE' || v.subType === 'TV_SERIES') && hit(v.title, v.artist)),
    ].slice(0, CAP);
    const rello = videos
      .filter(v => v.subType !== 'MOVIE' && v.subType !== 'TV_SERIES' && hit(v.title, v.artist))
      .slice(0, CAP);

    const of = (t: string) => universal.filter(r => r.type === t && !isSemanticStub(r));
    const seenPod = new Set<string>();
    const podcasts = [
      ...albums.filter(a => (a as any).subType === 'PODCAST' && hit(a.title, a.artist)),
      ...of('PODCAST').map(r => r.raw as Album),
    ].filter(a => a?.id && !seenPod.has(a.id) && (seenPod.add(a.id), true)).slice(0, CAP);

    return [
      { id: 'artists', title: 'Artists & Creators', items: of('USER').map(r => ({
        id: r.id, title: r.title, subtitle: r.subtitle, image: r.thumbnail, shape: 'round' as Shape,
        open: () => setArtist(r.raw as UserProfile),
      })) },
      { id: 'music', title: 'Chora — Music', items: music.map(a => albumHit(a, onSelectAlbum)) },
      { id: 'podcasts', title: 'Podcasts', items: podcasts.map(a => albumHit(a, onSelectAlbum)) },
      { id: 'radio', title: 'Live Radio', items: stations.map(st => {
        const it = stationItem(st);
        return {
          id: `radio-${st.uuid}`, title: it.title, subtitle: it.subtitle, image: it.image, shape: 'square' as Shape,
          open: () => { if (it.action.kind === 'TRACK') playTrack(it.action.track, it.action.album, 'RADIO'); },
        };
      }) },
      { id: 'taleo', title: 'Taleo — Film & TV', items: taleo.map(it => ({
        id: it.id, title: it.title, subtitle: (it as any).artist || '', shape: 'wide' as Shape,
        image: (it as any).coverImage || (it as any).thumbnailUrl || (it as any).coverImageUrl,
        open: () => onSelectMovie(it),
      })) },
      { id: 'rello', title: 'Reello — Video', items: rello.map(v => videoHit(v, onSelectVideo)) },
      { id: 'live', title: 'Live Now', items: of('LIVE').filter(r => playableLive(r.raw)).map(r => ({
        id: `live-${r.id}`, title: r.title, subtitle: r.subtitle, shape: 'wide' as Shape,
        image: r.raw?.muxPlaybackId ? `https://image.mux.com/${r.raw.muxPlaybackId}/thumbnail.jpg?width=480` : (r.thumbnail || r.raw?.ownerPhoto),
        open: () => onSelectVideo(liveAsVideo(r.raw)),
      })) },
    ];
  }, [artist, albums, videos, debounced, universal, stations, onSelectAlbum, onSelectMovie, onSelectVideo, playTrack]);

  // Row 0 is the search box; rails follow in a stable order (empty ones report count 0).
  const rows = useMemo(() => [{ id: 'search', count: 1 }, ...rails.map(r => ({ id: r.id, count: r.items.length }))], [rails]);

  const railsRef = useRef(rails); railsRef.current = rails;
  const artistRef = useRef(artist); artistRef.current = artist;
  const onBackRef = useRef(onBack); onBackRef.current = onBack;
  const onGridSelect = useCallback((p: { row: number; col: number }, rowId: string) => {
    if (rowId === 'search') { inputRef.current?.focus(); return; }
    railsRef.current.find(r => r.id === rowId)?.items[p.col]?.open();
  }, []);
  const onGridBack = useCallback(() => {
    if (artistRef.current) { setArtist(null); return true; }
    onBackRef.current();
    return true;
  }, []);

  const { pos, setPos, zone } = useTvGrid({ rows, onBack: onGridBack, onSelect: onGridSelect });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const focusedRowId = rows[pos.row]?.id;
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || !focusedRowId || focusedRowId === 'search') return;
    scrollRowIntoView(sc, sc.querySelector<HTMLElement>(`[data-tv-rail="${CSS.escape(focusedRowId)}"]`), scrollBehaviorForMove());
  }, [focusedRowId]);

  const searchFocused = pos.row === 0;

  // From the input: Down / Enter drops into the results; Back/Escape releases to the grid.
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const kc = e.keyCode || e.which;
    if (e.key === 'ArrowDown' || kc === 40 || e.key === 'Enter' || kc === 13) {
      e.preventDefault();
      inputRef.current?.blur();
      const first = rails.findIndex(r => r.items.length > 0);
      if (first >= 0) setPos(first + 1, 0);
    } else if (e.key === 'Escape' || kc === 27 || kc === 4) {
      e.preventDefault();
      inputRef.current?.blur();
    }
  };

  const anyResults = rails.some(r => r.items.length > 0);
  const nothing = debounced && !anyResults;

  return (
    <div className="relative h-[100dvh] text-white flex flex-col overflow-hidden" data-tv-capture>
      <TvBrandBackdrop />
      {debounced.length >= 2 && <UniversalFeeder q={debounced} onResults={onUniversal} />}

      {/* ── Search box (row 0) ── */}
      <div className="relative shrink-0 px-16 pt-10 pb-6">
        <div
          className="flex items-center gap-4 px-7 py-4 rounded-2xl bg-white/[0.06] border border-white/12 max-w-3xl transition-transform"
          style={searchFocused ? { boxShadow: tvCardRing(true), transform: 'scale(1.01)' } : undefined}
        >
          <Search size={26} className="text-white/45 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setArtist(null); }}
            onKeyDown={onInputKey}
            placeholder="Search Plajah — music, artists, radio, podcasts, film, live…"
            className="flex-1 bg-transparent outline-none text-2xl font-bold placeholder:text-white/30"
          />
        </div>
      </div>

      {/* ── Results ── */}
      <div ref={scrollerRef} className="relative flex-1 overflow-y-auto no-scrollbar px-16 pb-16">
        {!debounced && !artist && (
          <p className="text-white/40 text-lg mt-8">Type to search across Chora, Taleo, Reello, live and radio.</p>
        )}
        {nothing && !artist && (
          <p className="text-white/40 text-lg mt-8">No matches for “{debounced}”.</p>
        )}
        {rails.map((rail, rIdx) => rail.items.length > 0 && (
          <TvWindowedRail
            key={rail.id}
            id={rail.id}
            title={rail.title}
            items={rail.items}
            focusedCol={zone === 'CONTENT' && pos.row === rIdx + 1 ? pos.col : -1}
            renderItem={renderHit}
            gapClass="gap-5"
            estimateStride={rail.items[0]?.shape === 'wide' ? 288 + 20 : 176 + 20}
            estimateHeight={rail.items[0]?.shape === 'wide' ? 240 : 260}
          />
        ))}
      </div>
    </div>
  );
};

// ── helpers ──────────────────────────────────────────────────────────────────

const albumHit = (a: Album, open: (a: Album) => void): Hit => ({
  id: a.id, title: a.title, subtitle: a.artist, image: a.coverImage, shape: 'square', open: () => open(a),
});
const videoHit = (v: Video, open: (v: Video) => void): Hit => ({
  id: v.id, title: v.title, subtitle: v.artist || '', shape: 'wide',
  image: (v as any).muxPlaybackId ? `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.jpg?width=480&time=5` : (v.thumbnailUrl || (v as any).coverImageUrl),
  open: () => open(v),
});

/** Azure semantic rows carry a stub {id,title,type,score}, not a real entity — not openable. */
const isSemanticStub = (r: UniversalPlatformResult) =>
  !!r.raw && typeof r.raw.score === 'number' && !('ownerId' in r.raw) && !('tracks' in r.raw) && !('uid' in r.raw);

/** A live_feeds row the TV can actually play: live, free, and either a direct url or a Mux id. */
const playableLive = (f: any) =>
  !!f && f.status === 'LIVE' && f.isPublic !== false && !f.sanctuaryOnly && !(f.price > 0) &&
  (!String(f.url || '').startsWith('livestream:') || !!f.muxPlaybackId);
const liveAsVideo = (f: any): Video => ({
  ...f,
  url: String(f.url || '').startsWith('livestream:') ? `https://stream.mux.com/${f.muxPlaybackId}.m3u8` : f.url,
  artist: f.ownerName, isLive: true,
} as Video);

const HitCard = React.memo<{ it: Hit; focused: boolean }>(({ it, focused }) => (
  <div
    className={`${it.shape === 'wide' ? 'w-72' : 'w-44'} cursor-pointer transition-transform`}
    style={focused ? { transform: 'scale(1.05)' } : undefined}
    onClick={it.open}
  >
    <div
      className={`relative overflow-hidden bg-white/[0.05] ${it.shape === 'wide' ? 'aspect-video rounded-xl' : it.shape === 'round' ? 'aspect-square rounded-full' : 'aspect-square rounded-xl'}`}
      style={{ boxShadow: tvCardRing(focused) }}
    >
      {it.image
        ? <img src={thumb(it.image, THUMB.card)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        : <div className="w-full h-full grid place-items-center"><Search size={26} className="text-white/15" /></div>}
    </div>
    <p className={`mt-2 text-sm font-bold truncate ${it.shape === 'round' ? 'text-center' : ''}`}>{it.title}</p>
    {it.subtitle && <p className={`text-xs text-white/45 truncate ${it.shape === 'round' ? 'text-center' : ''}`}>{it.subtitle}</p>}
  </div>
));

const renderHit = (it: Hit, _i: number, focused: boolean) => <HitCard it={it} focused={focused} />;

export default TvSearchView;
