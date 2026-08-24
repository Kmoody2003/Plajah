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
import { getActiveCaption, trackHasCaptions } from '../src/lib/captions';
import PlajahPixelsStudio, { PlajahPixelsPlatformBridge } from './plajahPixels/PlajahPixelsStudio';

function timeCodedToLrc(lines: { time: number; text: string }[]): string {
  return lines.map(({ time, text }) => {
    const m = Math.floor(time / 60);
    const s = time % 60;
    const mm = String(m).padStart(2, '0');
    const ss = s.toFixed(2).padStart(5, '0');
    return `[${mm}:${ss}]${text}`;
  }).join('\n');
}

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
    currentCaption: getActiveCaption(gp.currentTrack, gp.currentTime, gp.duration),
    hasCaptions: trackHasCaptions(gp.currentTrack),
    lrcLyrics: gp.currentTrack?.timeCodedLyrics?.length
      ? timeCodedToLrc(gp.currentTrack.timeCodedLyrics)
      : undefined,
    currentTrackTitle: gp.currentTrack?.title ?? '',
    title: album?.title ?? track?.title ?? 'Plajah Pixels',
    onClose,
  }), [gp, album, track, mediaImages, onClose]);

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      {/* The standalone exit rides the ModeBar. It used to float at top-6 left-6,
          which is where the mode spine now lives. */}
      <PlajahPixelsStudio
        platform={standalone ? undefined : bridge}
        onExit={standalone ? onClose : undefined}
      />
    </div>
  );
};

export default PlajahPixelsView;
