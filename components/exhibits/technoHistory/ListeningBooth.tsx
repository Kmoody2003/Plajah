// The exhibit's playback: YouTube embeds (youtube-nocookie, loaded only on tap). One booth docked at the
// bottom keeps playing while you walk the rooms. A track with no verified video id opens a YouTube search.
import React, { createContext, useContext, useState } from 'react';
import { Play, X, ExternalLink, Disc3 } from 'lucide-react';
import { type TxTrack, ytSearchUrl } from '../../../data/technoExhibit/history';

interface Booth { current: TxTrack | null; play: (t: TxTrack) => void; close: () => void }
const BoothCtx = createContext<Booth>({ current: null, play: () => {}, close: () => {} });
export const useBooth = () => useContext(BoothCtx);

export function BoothProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<TxTrack | null>(null);
  const play = (t: TxTrack) => {
    if (!t.youtubeId) { window.open(ytSearchUrl(t), '_blank', 'noopener'); return; }
    setCurrent(t);
  };
  return <BoothCtx.Provider value={{ current, play, close: () => setCurrent(null) }}>{children}</BoothCtx.Provider>;
}

/** A record-sleeve style play chip. */
export function TrackChip({ track, compact = false }: { track: TxTrack; compact?: boolean }) {
  const { play, current } = useBooth();
  const on = current?.id === track.id;
  return (
    <button
      type="button"
      onClick={() => play(track)}
      title={track.youtubeId ? `Play ${track.artist}, "${track.title}" (YouTube)` : `Search YouTube for ${track.artist}, "${track.title}"`}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', border: '2px solid #111', background: on ? '#111' : 'rgba(0,0,0,.06)', color: on ? '#ffd400' : '#111', padding: compact ? '6px 8px' : '8px 10px', font: "600 11px/1.25 'IBM Plex Mono',monospace" }}
    >
      <span style={{ flex: 'none', width: compact ? 24 : 30, height: compact ? 24 : 30, borderRadius: '50%', background: '#111', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 3px #333, inset 0 0 0 8px #111' }}>
        {track.youtubeId ? <Play size={compact ? 10 : 12} color="#ffd400" fill="#ffd400" /> : <ExternalLink size={compact ? 10 : 12} color="#ffd400" />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</span>
        <span style={{ display: 'block', opacity: 0.7, fontWeight: 400 }}>{track.artist}{track.year ? ` · ${track.year}` : ''}</span>
      </span>
    </button>
  );
}

export function BoothDock() {
  const { current, close } = useBooth();
  if (!current) return null;
  return (
    <div role="region" aria-label="Listening booth" style={{ position: 'sticky', bottom: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end', padding: '0 12px 12px', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', width: 'min(420px, 100%)', background: '#0b0b0c', border: '2px solid #ffd400', boxShadow: '6px 6px 0 #000' }}>
        <div className="tx-hazard" style={{ height: 8 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
          <Disc3 size={16} color="#ffd400" style={{ animation: 'spin 2s linear infinite' }} />
          <div style={{ flex: 1, minWidth: 0, font: "600 11px/1.3 'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '.06em' }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ffd400' }}>{current.title}</div>
            <div style={{ opacity: 0.7 }}>{current.artist}{current.year ? ` · ${current.year}` : ''}</div>
          </div>
          <button type="button" onClick={close} aria-label="Close listening booth" style={{ background: 'none', border: 0, color: '#e9e4d6', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
          <iframe
            key={current.youtubeId}
            title={`${current.artist} – ${current.title}`}
            src={`https://www.youtube-nocookie.com/embed/${current.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
        <div style={{ padding: '6px 10px', font: "400 10px/1.3 'IBM Plex Mono',monospace", opacity: 0.6 }}>Played from YouTube. Rights belong to the artists and labels.</div>
      </div>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
