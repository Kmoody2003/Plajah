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
  onPlayTrack: (t: Track, i: number) => void;
}

const INNER_MAX = 5;
const OUTER_MAX = 7;

const OrreryStage: React.FC<OrreryStageProps> = ({ album, tracks, activeIndex, onPlayTrack }) => {
  const inner = tracks.slice(0, INNER_MAX);
  const outer = tracks.slice(INNER_MAX, INNER_MAX + OUTER_MAX);
  const hidden = tracks.length - inner.length - outer.length;

  const renderNode = (t: Track, absoluteIndex: number, idxInRing: number, ringCount: number, radius: number) => {
    const angle = (360 / ringCount) * idxInRing;
    return (
      <button
        key={t.id}
        type="button"
        className={`pv-orr-node${absoluteIndex === activeIndex ? ' is-active' : ''}`}
        style={{ transform: `rotate(${angle}deg) translateX(${radius}px)` }}
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
      <div className="pv-orr-orbit o1">
        {inner.map((t, k) => renderNode(t, k, k, inner.length, 90))}
      </div>
      {outer.length > 0 && (
        <div className="pv-orr-orbit o2">
          {outer.map((t, k) => renderNode(t, INNER_MAX + k, k, outer.length, 137))}
        </div>
      )}
      <div className="pv-orr-sun" style={{ backgroundImage: `url(${album.coverThumb || album.coverImage})` }} aria-hidden="true" />
      {hidden > 0 && <span className="pv-orr-more">+{hidden} more in the registry</span>}
    </div>
  );
};

export default OrreryStage;
