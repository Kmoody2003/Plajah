import React, { useEffect, useMemo, useRef } from 'react';
import { Play, Pause, Shuffle, ArrowLeft, Music2 } from 'lucide-react';
import type { Album, Track } from '../../types';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { useTvGrid } from '../../hooks/useTvGrid';
import TvBrandBackdrop from './TvBrandBackdrop';

/**
 * An album on television.
 *
 * Two columns: the artwork, large enough to be the reason you're looking at the screen, and a
 * constrained tracklist beside it. The list borrows the phone layout's shape — a tight row per
 * track, number, title, duration — because that pattern already reads well at a glance and
 * scales up cleanly. The desktop version's two metadata squares and its second visualizer are
 * gone: at ten feet they were noise competing with the art, and the player already renders one
 * visualizer.
 *
 * Navigation is declared (see hooks/useTvGrid), not inferred from geometry. Each track is its own
 * row, so up/down walks the list one track at a time — the only behaviour that makes sense here,
 * and one that cannot drift as the list re-renders.
 */

const ACCENT = '#FF8C00';

const fmt = (sec?: number): string => {
  if (!sec || !isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const AlbumTvView: React.FC<{
  album: Album;
  currentTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack: (track: Track, index: number) => void;
  onPlayAll: () => void;
  onShuffle: () => void;
  onBack: () => void;
}> = ({ album, currentTrackId, isPlaying, onPlayTrack, onPlayAll, onShuffle, onBack }) => {
  const tracks = useMemo(() => album.tracks || [], [album.tracks]);

  // Row 0 is the action pair; every track is its own row so up/down steps one track.
  const rows = useMemo(() => [
    { id: 'actions', count: 2 },
    ...tracks.map((t, i) => ({ id: `track-${t.id || i}`, count: 1 })),
  ], [tracks]);

  const { pos, zone } = useTvGrid({
    rows,
    onSelect: (p) => {
      if (p.row === 0) { p.col === 0 ? onPlayAll() : onShuffle(); return; }
      const idx = p.row - 1;
      const t = tracks[idx];
      if (t) onPlayTrack(t, idx);
    },
    onBack: () => { onBack(); return true; },
  });

  // Keep the focused track visible without yanking the whole page around.
  const rowRefs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    rowRefs.current[pos.row]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pos]);

  const totalSec = tracks.reduce((a, t) => a + ((t as any).duration || 0), 0);

  return (
    <div className="relative h-[100dvh] text-white flex overflow-hidden" data-tv-capture>
      {/* Same brand ground as the Chora home and the phone/desktop app — the album view was flat
          near-black, which read as a different, lesser product the moment you opened a release. */}
      <TvBrandBackdrop />
      {/* ── Art ── */}
      <div className="w-[46%] shrink-0 p-12 flex flex-col justify-center">
        <button
          onClick={onBack}
          className="self-start mb-7 w-11 h-11 rounded-full bg-white/[0.07] border border-white/10 grid place-items-center text-white/60"
          tabIndex={-1}
        >
          <ArrowLeft size={18} />
        </button>

        <div className="relative rounded-3xl overflow-hidden bg-white/[0.04] shadow-[0_40px_90px_rgba(0,0,0,0.65)]" style={{ aspectRatio: '1' }}>
          {album.coverImage
            ? <img src={thumb(album.coverImage, THUMB.large)} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full grid place-items-center"><Music2 size={64} className="text-white/15" /></div>}
        </div>

        <div className="mt-7 space-y-1.5">
          <h1 className="text-3xl font-black tracking-tight leading-tight">{album.title || 'Untitled'}</h1>
          <p className="text-lg text-white/55">{album.artist}</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30">
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            {totalSec > 0 && ` · ${Math.round(totalSec / 60)} min`}
            {album.genre && ` · ${album.genre}`}
          </p>
        </div>
      </div>

      {/* ── Tracklist ── */}
      <div className="flex-1 min-w-0 py-12 pr-12 flex flex-col">
        {/* Actions */}
        <div className="flex items-center gap-3 mb-6 shrink-0" ref={el => { rowRefs.current[0] = el; }}>
          {[
            { label: 'Play All', icon: Play, primary: true },
            { label: 'Shuffle', icon: Shuffle, primary: false },
          ].map((a, i) => {
            const Icon = a.icon;
            const focused = zone === 'CONTENT' && pos.row === 0 && pos.col === i;
            return (
              <div
                key={a.label}
                onClick={() => (i === 0 ? onPlayAll() : onShuffle())}
                className={`flex items-center gap-2.5 px-7 py-3 rounded-full font-black uppercase tracking-widest text-[11px] cursor-pointer transition-transform ${
                  focused ? 'scale-105' : ''
                } ${a.primary ? 'text-black' : 'text-white/75'}`}
                style={{
                  background: a.primary ? ACCENT : 'rgba(255,255,255,0.07)',
                  boxShadow: focused ? `0 0 0 4px ${ACCENT}, 0 0 0 7px rgba(0,0,0,0.6)` : 'none',
                }}
              >
                <Icon size={15} fill={a.primary ? 'black' : 'none'} /> {a.label}
              </div>
            );
          })}
        </div>

        {/* The list itself: one tight row per track, phone-layout shape at TV scale. */}
        <div className="flex-1 overflow-y-auto no-scrollbar pr-2 space-y-0.5">
          {tracks.map((t, i) => {
            const focused = zone === 'CONTENT' && pos.row === i + 1;
            const nowPlaying = currentTrackId && t.id === currentTrackId;
            return (
              <div
                key={t.id || i}
                ref={el => { rowRefs.current[i + 1] = el; }}
                onClick={() => onPlayTrack(t, i)}
                className={`flex items-center gap-5 px-5 py-3 rounded-xl cursor-pointer transition-colors ${
                  focused ? 'bg-white text-black' : nowPlaying ? 'bg-white/[0.07]' : ''
                }`}
              >
                <span className={`w-7 text-right text-[13px] font-bold tabular-nums shrink-0 ${
                  focused ? 'text-black/45' : nowPlaying ? '' : 'text-white/30'
                }`} style={nowPlaying && !focused ? { color: ACCENT } : undefined}>
                  {nowPlaying
                    ? (isPlaying ? <Pause size={13} className="inline" /> : <Play size={13} className="inline" />)
                    : i + 1}
                </span>

                <span className="flex-1 min-w-0">
                  <span className={`block text-[15px] font-bold truncate ${focused ? 'text-black' : 'text-white/90'}`}>
                    {t.title || `Track ${i + 1}`}
                  </span>
                  {(t as any).featuring && (
                    <span className={`block text-[11px] truncate ${focused ? 'text-black/55' : 'text-white/40'}`}>
                      feat. {(t as any).featuring}
                    </span>
                  )}
                </span>

                <span className={`text-[12px] tabular-nums shrink-0 ${focused ? 'text-black/55' : 'text-white/35'}`}>
                  {fmt((t as any).duration)}
                </span>
              </div>
            );
          })}

          {tracks.length === 0 && (
            <p className="text-white/35 text-sm px-5 py-8">This release has no tracks yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlbumTvView;
