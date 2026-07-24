import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Film, Music2, Video as VideoIcon } from 'lucide-react';
import { fetchAllPublicAlbums, fetchAllVideos } from '../../services/backendService';
import type { Album, Video } from '../../types';
import { useTvGrid, isFocused } from '../../hooks/useTvGrid';
import { tvCardRing, RAIL_GUTTER } from './tvFocusRing';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import TvBrandBackdrop from './TvBrandBackdrop';

/**
 * Global TV search — one box, three catalogues (Chora music, Taleo film/TV, Reello video).
 *
 * A remote is a poor typewriter, so this leans on the platform: pressing OK on the search box hands
 * DOM focus to a real <input>, which brings up Android TV's system keyboard / voice entry. While
 * that input holds focus the grid stays deaf (useTvGrid ignores INPUT), and the input's own handler
 * is what walks focus DOWN into the results. Everything below is plain useTvGrid rails so it behaves
 * exactly like the Chora and Reello screens.
 *
 * Rows: 0 = search box, then one horizontal rail per catalogue that currently has matches. Empty
 * rails report count 0, which useTvGrid skips, so a press never lands on a section with nothing in it.
 */

const CAP = 18;   // per-rail result cap — plenty on a wall, cheap to render/decode on the TV SoC.

interface Props {
  onBack: () => void;
  onSelectAlbum: (a: Album) => void;
  onSelectMovie: (item: Video | Album) => void;
  onSelectVideo: (v: Video) => void;
}

const norm = (s?: string) => (s || '').toLowerCase();

const TvSearchView: React.FC<Props> = ({ onBack, onSelectAlbum, onSelectMovie, onSelectVideo }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchAllPublicAlbums().catch(() => []), fetchAllVideos().catch(() => [])])
      .then(([a, v]) => { if (!alive) return; setAlbums(a as Album[]); setVideos(v as Video[]); });
    return () => { alive = false; };
  }, []);

  // Three catalogues, filtered by the query. Mirrors each home screen's own membership rule.
  const { music, taleo, rello } = useMemo(() => {
    const needle = norm(q).trim();
    const hit = (...parts: (string | undefined)[]) => !needle || parts.some(p => norm(p).includes(needle));
    const music = albums.filter(a => a.type === 'MUSIC' && hit(a.title, a.artist)).slice(0, CAP);
    const taleoAlbums = albums.filter(a => a.type === 'VIDEO' && hit(a.title, a.artist));
    const taleoVideos = videos.filter(v => (v.subType === 'MOVIE' || v.subType === 'TV_SERIES') && hit(v.title, v.artist));
    const taleo: (Album | Video)[] = [...taleoAlbums, ...taleoVideos].slice(0, CAP);
    const rello = videos
      .filter(v => v.isRello === true && v.subType !== 'MOVIE' && v.subType !== 'TV_SERIES' && hit(v.title, v.artist))
      .slice(0, CAP);
    return { music, taleo, rello };
  }, [albums, videos, q]);

  // Row 0 is the search box; the three rails follow. Keep the array shape stable so positions don't
  // jump — useTvGrid just skips any rail that is momentarily empty.
  const rows = useMemo(() => ([
    { id: 'search', count: 1 },
    { id: 'music', count: music.length },
    { id: 'taleo', count: taleo.length },
    { id: 'rello', count: rello.length },
  ]), [music.length, taleo.length, rello.length]);

  const { pos, setPos } = useTvGrid({
    rows,
    onBack: () => { onBack(); return true; },
    onSelect: (p, rowId) => {
      if (rowId === 'search') { inputRef.current?.focus(); return; }
      if (rowId === 'music') { const a = music[p.col]; if (a) onSelectAlbum(a); return; }
      if (rowId === 'taleo') { const it = taleo[p.col]; if (it) onSelectMovie(it as any); return; }
      if (rowId === 'rello') { const v = rello[p.col]; if (v) onSelectVideo(v); return; }
    },
  });

  // Keep the focused card in view along its rail.
  const focusedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    focusedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [pos]);

  const searchFocused = pos.row === 0;

  // From the input: Down / Enter drops into the results; Back/Escape releases to the grid.
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const kc = e.keyCode || e.which;
    if (e.key === 'ArrowDown' || kc === 40 || e.key === 'Enter' || kc === 13) {
      e.preventDefault();
      inputRef.current?.blur();
      // Jump to the first rail that actually has results.
      if (music.length) setPos(1, 0);
      else if (taleo.length) setPos(2, 0);
      else if (rello.length) setPos(3, 0);
    } else if (e.key === 'Escape' || kc === 27 || kc === 4) {
      e.preventDefault();
      inputRef.current?.blur();
    }
  };

  const nothing = q.trim() && !music.length && !taleo.length && !rello.length;

  return (
    <div className="relative h-[100dvh] text-white flex flex-col overflow-hidden" data-tv-capture>
      <TvBrandBackdrop />

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
            onChange={e => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search Plajah — music, film, video…"
            className="flex-1 bg-transparent outline-none text-2xl font-bold placeholder:text-white/30"
          />
        </div>
      </div>

      {/* ── Results ── */}
      <div className="relative flex-1 overflow-y-auto no-scrollbar px-16 pb-16 space-y-10">
        {!q.trim() && (
          <p className="text-white/40 text-lg mt-8">Type to search across Chora, Taleo and Reello.</p>
        )}
        {nothing && (
          <p className="text-white/40 text-lg mt-8">No matches for “{q.trim()}”.</p>
        )}

        <Rail
          title="Chora" icon={Music2} row={1} items={music} pos={pos} focusedRef={focusedRef}
          img={(a: Album) => a.coverImage} label={(a: Album) => a.title} sub={(a: Album) => a.artist}
          square
        />
        <Rail
          title="Taleo" icon={Film} row={2} items={taleo} pos={pos} focusedRef={focusedRef}
          img={(it: any) => it.coverImage || it.thumbnailUrl || it.coverImageUrl}
          label={(it: any) => it.title} sub={(it: any) => it.artist || ''}
        />
        <Rail
          title="Reello" icon={VideoIcon} row={3} items={rello} pos={pos} focusedRef={focusedRef}
          img={(v: Video) => v.thumbnailUrl || v.coverImageUrl}
          label={(v: Video) => v.title} sub={(v: Video) => v.artist || ''}
        />
      </div>
    </div>
  );
};

// A single horizontal result rail. Poster cards for film/video (16:9), square art for music.
const Rail: React.FC<{
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  row: number;
  items: any[];
  pos: { row: number; col: number };
  focusedRef: React.RefObject<HTMLDivElement>;
  img: (it: any) => string | undefined;
  label: (it: any) => string;
  sub: (it: any) => string;
  square?: boolean;
}> = ({ title, icon: Icon, row, items, pos, focusedRef, img, label, sub, square }) => {
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4 text-white/70">
        <Icon size={18} />
        <h2 className="text-sm font-black uppercase tracking-[0.2em]">{title}</h2>
        <span className="text-xs text-white/30">{items.length}</span>
      </div>
      <div className={`flex gap-5 overflow-x-auto no-scrollbar ${RAIL_GUTTER}`}>
        {items.map((it, col) => {
          const focused = isFocused(pos, row, col);
          const src = img(it);
          return (
            <div
              key={it.id || col}
              ref={focused ? focusedRef : undefined}
              className={`shrink-0 ${square ? 'w-44' : 'w-72'} cursor-pointer transition-transform`}
              style={focused ? { transform: 'scale(1.05)' } : undefined}
            >
              <div
                className={`relative rounded-xl overflow-hidden bg-white/[0.05] ${square ? 'aspect-square' : 'aspect-video'}`}
                style={{ boxShadow: tvCardRing(focused) }}
              >
                {src
                  ? <img src={thumb(src, THUMB.card)} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full grid place-items-center"><Icon size={30} className="text-white/15" /></div>}
              </div>
              <p className="mt-2 text-sm font-bold truncate">{label(it)}</p>
              {sub(it) && <p className="text-xs text-white/45 truncate">{sub(it)}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TvSearchView;
