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
import { motion, useReducedMotion } from 'motion/react';
import type { Album, Track } from '../types';

interface OrreryStageProps {
  album: Album;
  tracks: Track[];
  activeIndex: number;
  isPlaying?: boolean;
  onPlayTrack: (t: Track, i: number) => void;
}

const MAX_VISIBLE = 12;
const ACTIVE_RADIUS = 76;
const RADIUS_STEP = 6;
const MAX_RADIUS = 146;

const OrreryStage: React.FC<OrreryStageProps> = ({ album, tracks, activeIndex, isPlaying = false, onPlayTrack }) => {
  const reduceMotion = useReducedMotion();
  // Keep the playing track in view on long albums while retaining a readable twelve-node stage.
  const windowStart = Math.max(0, Math.min(Math.max(0, tracks.length - MAX_VISIBLE), activeIndex - Math.floor(MAX_VISIBLE / 2)));
  const visible = tracks.slice(windowStart, windowStart + MAX_VISIBLE);
  const hidden = tracks.length - visible.length;

  const renderNode = (t: Track, absoluteIndex: number) => {
    // Album order is expressed as depth: the current song moves nearest the artwork; its
    // neighbours are next closest; completed and distant upcoming songs progressively recede.
    const distanceFromPlaying = Math.abs(absoluteIndex - activeIndex);
    const active = absoluteIndex === activeIndex;
    const radius = active
      ? ACTIVE_RADIUS
      : Math.min(MAX_RADIUS, ACTIVE_RADIUS + 18 + Math.max(0, distanceFromPlaying - 1) * RADIUS_STEP);
    const angle = (360 / Math.max(visible.length, 1)) * (absoluteIndex - windowStart) - 90;
    // Kepler-inspired timing: inner planets complete a pass sooner; progressively distant
    // tracks remain clearly in motion but travel more slowly. The selected track is fastest.
    const orbitDuration = active ? 18 : 25 + Math.pow(radius / ACTIVE_RADIUS, 1.5) * 9;
    return (
      <React.Fragment key={t.id}>
        <motion.div
          className={`pv-orr-track-ring${active ? ' is-active' : ''}`}
          animate={{ width: radius * 2, height: radius * 2 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 48, damping: 17, mass: 0.9 }}
          aria-hidden="true"
        />
        <motion.div
          className="pv-orr-planet"
          initial={false}
          animate={{ rotate: reduceMotion ? angle : [angle, angle + 360] }}
          transition={reduceMotion ? { duration: 0 } : { duration: orbitDuration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
        >
          <motion.button
            type="button"
            className={`pv-orr-node${active ? ' is-active' : ''}${active && isPlaying ? ' is-playing' : ''}`}
            initial={false}
            animate={{ x: radius }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: active ? 62 : 46, damping: active ? 16 : 19, mass: active ? 0.75 : 1.05 }}
            onClick={() => onPlayTrack(t, absoluteIndex)}
            title={t.title || `Track ${absoluteIndex + 1}`}
            aria-label={`Play ${t.title || `track ${absoluteIndex + 1}`}`}
          >
            <motion.i
              initial={false}
              animate={{ rotate: reduceMotion ? -angle : [-angle, -angle - 360] }}
              transition={reduceMotion ? { duration: 0 } : { duration: orbitDuration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
            >
              {String(absoluteIndex + 1).padStart(2, '0')}
            </motion.i>
          </motion.button>
        </motion.div>
      </React.Fragment>
    );
  };

  return (
    <div className="pv-orr" role="group" aria-label="Orrery — tracks orbiting the album">
      {visible.map((t, index) => renderNode(t, windowStart + index))}
      <div className="pv-orr-sun" style={{ backgroundImage: `url(${album.coverThumb || album.coverImage})` }} aria-hidden="true" />
      {hidden > 0 && <span className="pv-orr-more">+{hidden} more in the registry</span>}
    </div>
  );
};

export default OrreryStage;
