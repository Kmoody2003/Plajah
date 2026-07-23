import React, { useEffect, useMemo, useRef } from 'react';
import { Play, Pause, Shuffle, ArrowLeft, Music2, SkipBack, SkipForward, Repeat, Repeat1 } from 'lucide-react';
import type { Album, Track } from '../../types';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { useTvGrid } from '../../hooks/useTvGrid';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../../contexts/GlobalPlayerContext';
import TvBrandBackdrop from './TvBrandBackdrop';

/**
 * An album on television.
 *
 * Two columns: the artwork, large enough to be the reason you're looking at the screen, and a
 * constrained tracklist beside it. Pinned across the bottom is the same now-playing transport the
 * phone and desktop carry — progress, play/pause, prev/next, repeat, shuffle — because a music
 * app whose album page can't scrub or repeat isn't a music app. When the playing track ships
 * time-coded lyrics they scroll in sync beneath the art, the karaoke the rest of the app already
 * has and this screen was missing.
 *
 * Navigation is declared (see hooks/useTvGrid), not inferred from geometry: row 0 is the actions,
 * each track is its own row, and the last row is the transport bar — so up/down walks the list one
 * track at a time and drops onto the controls at the end, a path that can't drift as things
 * re-render.
 */

const ACCENT = '#FF8C00';

const fmt = (sec?: number): string => {
  if (!sec || !isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** The lyric line matching the current playhead, plus its neighbours for context. */
const useSyncedLyric = (lyrics: { time: number; text: string }[] | undefined, t: number) =>
  useMemo(() => {
    if (!lyrics?.length) return null;
    let active = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (t >= lyrics[i].time && (!lyrics[i + 1] || t < lyrics[i + 1].time)) { active = i; break; }
    }
    if (active === -1) active = t < lyrics[0].time ? 0 : lyrics.length - 1;
    return {
      prev: lyrics[active - 1]?.text ?? '',
      current: lyrics[active]?.text ?? '',
      next: lyrics[active + 1]?.text ?? '',
    };
  }, [lyrics, t]);

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

  // Transport + progress come straight from the global player so the bar reflects real playback
  // (including tracks started elsewhere), not a local copy that would drift.
  const { currentTrack, isPlaying: globalPlaying, togglePlay, next, prev, repeatMode, setRepeatMode, isShuffle, setIsShuffle } = useGlobalPlayerState();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();

  // The transport controls this album's playing track only when the album is what's on.
  const albumIsPlaying = !!currentTrack && tracks.some(t => t.id === currentTrack.id);
  const lyric = useSyncedLyric(albumIsPlaying ? currentTrack?.timeCodedLyrics : undefined, currentTime);

  const cycleRepeat = () => setRepeatMode(repeatMode === 'OFF' ? 'ALL' : repeatMode === 'ALL' ? 'ONE' : 'OFF');

  // Row 0 = action pair; each track is a row; the final row is the transport bar (5 controls).
  const rows = useMemo(() => [
    { id: 'actions', count: 2 },
    ...tracks.map((t, i) => ({ id: `track-${t.id || i}`, count: 1 })),
    { id: 'transport', count: 5 },
  ], [tracks]);
  const transportRow = tracks.length + 1;

  // Seek by ±10s when scrubbing on the progress control (transport col 0 handles it via left/right;
  // handled here so the grid's own left/right still works for the 5-button row).
  const { pos, zone, setPos } = useTvGrid({
    rows,
    onSelect: (p) => {
      if (p.row === 0) { p.col === 0 ? onPlayAll() : onShuffle(); return; }
      if (p.row === transportRow) {
        // [prev, play/pause, next, repeat, shuffle]
        if (p.col === 0) prev();
        else if (p.col === 1) (albumIsPlaying ? togglePlay() : onPlayAll());
        else if (p.col === 2) next();
        else if (p.col === 3) cycleRepeat();
        else setIsShuffle(!isShuffle);
        return;
      }
      const idx = p.row - 1;
      const t = tracks[idx];
      if (t) onPlayTrack(t, idx);
    },
    onBack: () => { onBack(); return true; },
  });

  // Keep the focused row visible without yanking the whole page around.
  const rowRefs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    rowRefs.current[pos.row]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pos]);

  const totalSec = tracks.reduce((a, t) => a + ((t as any).duration || 0), 0);
  const nowPlayingIsPlaying = albumIsPlaying ? globalPlaying : (isPlaying ?? false);
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const TransportBtn: React.FC<{ col: number; children: React.ReactNode; label: string; active?: boolean; big?: boolean }> =
    ({ col, children, label, active, big }) => {
      const focused = zone === 'CONTENT' && pos.row === transportRow && pos.col === col;
      return (
        <div
          role="button"
          aria-label={label}
          onClick={() => setPos(transportRow, col)}
          className={`grid place-items-center rounded-full cursor-pointer transition-transform ${big ? 'w-14 h-14' : 'w-11 h-11'} ${focused ? 'scale-110' : ''}`}
          style={{
            background: focused ? ACCENT : active ? 'rgba(255,140,0,0.18)' : 'rgba(255,255,255,0.08)',
            color: focused ? '#000' : active ? ACCENT : 'rgba(255,255,255,0.85)',
            boxShadow: focused ? `0 0 0 4px ${ACCENT}, 0 0 0 7px rgba(0,0,0,0.6)` : 'none',
          }}
        >
          {children}
        </div>
      );
    };

  return (
    <div className="relative h-[100dvh] text-white flex flex-col overflow-hidden" data-tv-capture>
      {/* Same brand ground as the Chora home and the phone/desktop app. */}
      <TvBrandBackdrop />

      <div className="relative flex-1 flex overflow-hidden">
        {/* ── Art + synced lyrics ── */}
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

          {/* Synced lyrics — three lines, the active one lifted. Only when this album is playing a
              track that carries time-coded lyrics; otherwise the album meta holds the space. */}
          {lyric ? (
            <div className="mt-7 min-h-[7rem] space-y-2">
              <p className="text-sm text-white/25 truncate">{lyric.prev}</p>
              <p className="text-2xl font-black leading-tight" style={{ color: ACCENT }}>{lyric.current || '♪'}</p>
              <p className="text-sm text-white/25 truncate">{lyric.next}</p>
            </div>
          ) : (
            <div className="mt-7 space-y-1.5">
              <h1 className="text-3xl font-black tracking-tight leading-tight">{album.title || 'Untitled'}</h1>
              <p className="text-lg text-white/55">{album.artist}</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30">
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                {totalSec > 0 && ` · ${Math.round(totalSec / 60)} min`}
                {album.genre && ` · ${album.genre}`}
              </p>
            </div>
          )}
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
                  // The now-playing row wears the same living purple→orange sweep the phone and
                  // desktop trackbars use (index.css .track-gradient-active) — so "what's playing"
                  // reads identically across every surface. The D-pad focus (solid white) still
                  // wins when you're pointed at it.
                  className={`flex items-center gap-5 px-5 py-3 rounded-xl cursor-pointer transition-colors ${
                    focused ? 'bg-white text-black' : nowPlaying ? 'track-gradient-active' : ''
                  }`}
                >
                  <span className={`w-7 text-right text-[13px] font-bold tabular-nums shrink-0 ${
                    focused ? 'text-black/45' : nowPlaying ? '' : 'text-white/30'
                  }`} style={nowPlaying && !focused ? { color: ACCENT } : undefined}>
                    {nowPlaying
                      ? (nowPlayingIsPlaying ? <Pause size={13} className="inline" /> : <Play size={13} className="inline" />)
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

      {/* ── Now-playing transport bar ── the platform's trackbar, at TV scale. */}
      <div
        ref={el => { rowRefs.current[transportRow] = el; }}
        className="relative shrink-0 px-12 py-6 flex items-center gap-6 border-t border-white/10 bg-black/40 backdrop-blur-xl"
      >
        {/* current track label */}
        <div className="w-[24%] min-w-0 shrink-0">
          <p className="text-[15px] font-black truncate">{currentTrack?.title || (albumIsPlaying ? '' : 'Nothing playing')}</p>
          <p className="text-[12px] text-white/45 truncate">{currentTrack?.artist || album.artist}</p>
        </div>

        {/* progress */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-white/45 w-11 text-right">{fmt(currentTime)}</span>
          <div
            className="relative flex-1 h-1.5 rounded-full bg-white/12 overflow-hidden cursor-pointer"
            onClick={e => {
              if (!duration) return;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * duration);
            }}
          >
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: ACCENT }} />
          </div>
          <span className="text-[11px] tabular-nums text-white/45 w-11">{fmt(duration)}</span>
        </div>

        {/* transport controls (the transport grid row) */}
        <div className="flex items-center gap-3 shrink-0">
          <TransportBtn col={0} label="Previous">
            <SkipBack size={18} fill="currentColor" />
          </TransportBtn>
          <TransportBtn col={1} label={nowPlayingIsPlaying ? 'Pause' : 'Play'} big>
            {nowPlayingIsPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
          </TransportBtn>
          <TransportBtn col={2} label="Next">
            <SkipForward size={18} fill="currentColor" />
          </TransportBtn>
          <TransportBtn col={3} label="Repeat" active={repeatMode !== 'OFF'}>
            {repeatMode === 'ONE' ? <Repeat1 size={17} /> : <Repeat size={17} />}
          </TransportBtn>
          <TransportBtn col={4} label="Shuffle" active={isShuffle}>
            <Shuffle size={16} />
          </TransportBtn>
        </div>
      </div>
    </div>
  );
};

export default AlbumTvView;
