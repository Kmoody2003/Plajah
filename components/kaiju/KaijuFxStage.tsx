// KaijuFxStage — the "Kaiju" engine of the album FX Stage: KaijuDanceStage wired to the global player.
//
// Supplies the song clock (currentTime, extrapolated between progress ticks), the track's lyrics
// (time-coded when available — those also tell the kaiju exactly when someone is singing — else
// plain lyrics spread over the duration, used only for the speech bubble), and genre as a style
// prior.

import React, { useEffect, useMemo, useRef } from 'react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../../contexts/GlobalPlayerContext';
import KaijuDanceStage, { type LyricLine } from './KaijuDanceStage';
import type { KaijuStyle } from './kaijuAudio';

export const KAIJU_PRESETS: { name: string; style: KaijuStyle | 'auto'; clips?: boolean }[] = [
  { name: 'Kaiju Party (Auto)', style: 'auto' },
  { name: 'Meditation Float', style: 'zen' },
  { name: 'EDM Rave', style: 'edm' },
  { name: 'Rock Headbang', style: 'rock' },
  { name: 'Ballet & Cinema', style: 'ballet' },
  { name: 'Kaiju Music Video (Clips)', style: 'auto', clips: true },
];

interface Props {
  preset?: number;
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
  fpsCap?: number;
  className?: string;
}

export const KaijuFxStage: React.FC<Props> = ({ preset = 0, analyser, isPlaying, fpsCap = 0, className }) => {
  const player = useGlobalPlayerState();
  const { currentTime, duration } = useGlobalPlayerProgress();
  const playing = isPlaying ?? player.isPlaying;

  const clock = useRef({ time: 0, at: 0, playing });
  useEffect(() => { clock.current = { time: currentTime || 0, at: performance.now(), playing }; }, [currentTime, playing]);
  const getTime = useMemo(() => () => {
    const c = clock.current;
    return c.time + (c.playing ? (performance.now() - c.at) / 1000 : 0);
  }, []);

  const track = player.currentTrack as any;
  const album = player.currentAlbum as any;
  const { lyrics, timed } = useMemo((): { lyrics: LyricLine[] | null; timed: boolean } => {
    const tc = track?.timeCodedLyrics as LyricLine[] | undefined;
    if (tc?.length) return { lyrics: [...tc].sort((a, b) => a.time - b.time), timed: true };
    const raw = typeof track?.lyrics === 'string'
      ? track.lyrics.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !/^\[.*\]$/.test(l))
      : [];
    if (raw.length) { const step = (duration || 180) / raw.length; return { lyrics: raw.map((text: string, i: number) => ({ time: i * step, text })), timed: false }; }
    return { lyrics: null, timed: false };
  }, [track, duration]);

  const p = KAIJU_PRESETS[((preset % KAIJU_PRESETS.length) + KAIJU_PRESETS.length) % KAIJU_PRESETS.length];
  return (
    <KaijuDanceStage
      analyser={analyser ?? player.analyser ?? null}
      isPlaying={playing}
      getTime={getTime}
      lyrics={lyrics}
      lyricsTimed={timed}
      genre={track?.genre || album?.genre}
      style={p.style}
      clips={!!p.clips}
      fpsCap={fpsCap}
      className={className}
    />
  );
};

export default KaijuFxStage;
