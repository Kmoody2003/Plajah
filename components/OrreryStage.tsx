/**
 * OrreryStage — the Observatory's album stage (Chora Next / Gatefold):
 * tracks orbit the album art like planets. Each node is a track; the glowing
 * node is playing; click a node to play it. It's a stage, not a replacement —
 * the track registry stays available beside it, and albums with more than 12
 * tracks point back to the registry for the rest.
 *
 * All visuals live in styles/chora.css under .pv-orr (DS tokens only).
 */
import React from 'react';
import type { Album, Track } from '../types';

interface OrreryStageProps {
  album: Album;
  tracks: Track[];
  activeIndex: number;
  isPlaying?: boolean;
  onPlayTrack: (t: Track, i: number) => void;
}

const MAX_VISIBLE = 12;
const ACTIVE_RADIUS = 77;
const RADIUS_STEP = 12;
const MAX_RADIUS = 145;

const OrreryStage: React.FC<OrreryStageProps> = ({ album, tracks, activeIndex, isPlaying = false, onPlayTrack }) => {
  // Keep the playing track in view on long albums while retaining a readable twelve-node stage.
  const windowStart = Math.max(0, Math.min(Math.max(0, tracks.length - MAX_VISIBLE), activeIndex - Math.floor(MAX_VISIBLE / 2)));
  const visible = tracks.slice(windowStart, windowStart + MAX_VISIBLE);
  const hidden = tracks.length - visible.length;

  const renderNode = (t: Track, absoluteIndex: number) => {
    // Album order is expressed as depth: the current song moves nearest the artwork; its
    // neighbours are next closest; completed and distant upcoming songs progressively recede.
    const distanceFromPlaying = Math.abs(absoluteIndex - activeIndex);
    const radius = Math.min(MAX_RADIUS, ACTIVE_RADIUS + distanceFromPlaying * RADIUS_STEP);
    const angle = (360 / Math.max(visible.length, 1)) * (absoluteIndex - windowStart) - 90;
    const active = absoluteIndex === activeIndex;
    return (
      <button
        key={t.id}
        type="button"
        className={`pv-orr-node${active ? ' is-active' : ''}${active && isPlaying ? ' is-playing' : ''}`}
        style={{ transform: `rotate(${angle}deg) translateX(${radius}px)`, ['--track-radius' as any]: `${radius}px` }}
        onClick={() => onPlayTrack(t, absoluteIndex)}
        title={t.title || `Track ${absoluteIndex + 1}`}
        aria-label={`Play ${t.title || `track ${absoluteIndex + 1}`}`}
      >
        <i style={{ ['--a' as any]: `${-angle}deg` }}>{String(absoluteIndex + 1).padStart(2, '0')}</i>
      </button>
    );
  };

  return (
    <div className="pv-orr" role="group" aria-label="Orrery — tracks orbiting the album">
      <div className="pv-orr-ring r1" aria-hidden="true" />
      <div className="pv-orr-ring r2" aria-hidden="true" />
      <div className="pv-orr-orbit o1">{visible.map((t, index) => renderNode(t, windowStart + index))}</div>
      <div className="pv-orr-sun" style={{ backgroundImage: `url(${album.coverThumb || album.coverImage})` }} aria-hidden="true" />
      {hidden > 0 && <span className="pv-orr-more">+{hidden} more in the registry</span>}
    </div>
  );
};

export default OrreryStage;
