// PlajahPixelsView — platform host for the vendored Plajah Pixels visualizer.
//
// Two modes, one component:
//   • Standalone (opened from the Apps page) — the full studio with its own
//     audio upload. No platform bridge.
//   • Slaved (opened from a track / album / playlist) — Pixels adopts the
//     platform's GLOBAL player: its shared AnalyserNode drives the visuals, its
//     transport drives playback, and the controls become a slave. Audio is never
//     re-created here, so launching the visualizer never interrupts playback.

import React, { useEffect, useMemo, useRef } from 'react';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import type { Album, Track } from '../types';
import PlajahPixelsStudio, { PlajahPixelsPlatformBridge } from './plajahPixels/PlajahPixelsStudio';

export interface PlajahPixelsPayload {
  album?: Album | null;
  track?: Track | null;
}

// Album art + slideshow + current-track images → the visualizer media layer.
function buildMediaImages(album: Album | null | undefined, track: Track | null | undefined): string[] {
  const out: string[] = [];
  const push = (v?: string | null) => { if (v && !out.includes(v)) out.push(v); };
  // Current track art first so the song's own imagery leads the slideshow.
  (track?.images || []).forEach(push);
  push(track?.albumCover);
  push(album?.coverImage);
  push(album?.headerImage);
  push(album?.artistImage);
  (album?.slideshow || []).forEach(push);
  return out;
}

const PlajahPixelsView: React.FC<{ payload?: PlajahPixelsPayload | null; onClose: () => void }> = ({ payload, onClose }) => {
  const gp = useGlobalPlayer();

  const album = payload?.album ?? gp.currentAlbum ?? null;
  const track = payload?.track ?? gp.currentTrack ?? null;
  const standalone = !payload?.album && !payload?.track;

  // Seamless launch (runs once): "send this song" plays the requested track if
  // it isn't already current; an album load starts track 1 ONLY if nothing is
  // already playing — so opening the visualizer never interrupts live playback.
  const launchedRef = useRef(false);
  useEffect(() => {
    if (launchedRef.current || standalone) return;
    launchedRef.current = true;
    if (payload?.track && payload.track.id !== gp.currentTrack?.id) {
      gp.playTrack(payload.track, album, 'LIBRARY');
    } else if (payload?.album && !gp.currentTrack && album?.tracks?.length) {
      gp.playTrack(album.tracks[0], album, 'LIBRARY');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mediaImages = useMemo(() => buildMediaImages(album, gp.currentTrack), [album, gp.currentTrack]);

  const bridge: PlajahPixelsPlatformBridge = useMemo(() => ({
    analyser: gp.analyser,
    isPlaying: gp.isPlaying,
    currentTime: gp.currentTime,
    duration: gp.duration,
    volume: gp.volume,
    togglePlay: gp.togglePlay,
    seek: gp.seek,
    setVolume: gp.setVolume,
    next: gp.next,
    prev: gp.prev,
    tracklist: (album?.tracks || []).map(t => ({ id: t.id, title: t.title || 'Untitled', artist: t.artist || album?.artist })),
    currentTrackId: gp.currentTrack?.id ?? null,
    onSelectTrack: (id: string) => {
      const t = album?.tracks?.find(x => x.id === id);
      if (t) gp.playTrack(t, album, 'LIBRARY');
    },
    mediaImages,
    title: album?.title ?? track?.title ?? 'Plajah Pixels',
    onClose,
  }), [gp, album, track, mediaImages, onClose]);

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <PlajahPixelsStudio platform={standalone ? undefined : bridge} />
      {/* Standalone studio still needs an exit affordance. */}
      {standalone && (
        <button
          onClick={onClose}
          className="absolute top-6 left-6 z-[60] px-4 py-2 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 text-white/70 hover:text-white text-[11px] font-black uppercase tracking-widest transition-all"
        >
          ← Exit
        </button>
      )}
    </div>
  );
};

export default PlajahPixelsView;
