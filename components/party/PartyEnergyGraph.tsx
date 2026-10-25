// PartyEnergyGraph — the room's energy, song by song. One smooth area per song, drawn side by side in
// proportion to song length, scaled to the loudest moment on screen. Live in a listening party (with
// the playhead) and read-only in Music Intelligence's audience sentiment. Tap a song's area to seek.

import React, { useId, useMemo } from 'react';
import { formatMoment, normalizeEnergy } from '../../services/partyEngagement';

export interface EnergySong { trackId: string; title: string; durationSec: number; series: number[]; bucketSec: number }

export interface PartyEnergyGraphProps {
  songs: EnergySong[];
  currentTrackId?: string;
  currentSec?: number;
  height?: number;
  /** tap = seek there (Music Intelligence plays the song at that moment; the party graph is read-only). */
  onSeek?: (trackId: string, sec: number) => void;
  className?: string;
  emptyText?: string;
}

const W = 600;
const GAP = 6;

/** A smooth closed area path for one song across [x0, x0+w]. */
function area(series: number[], x0: number, w: number, h: number, ceiling: number): { fill: string; line: string; peak: { x: number; y: number } | null } {
  const norm = normalizeEnergy(series, ceiling);
  if (!norm.length) return { fill: '', line: '', peak: null };
  const step = norm.length > 1 ? w / (norm.length - 1) : w;
  const pts = norm.map((v, i) => [x0 + i * step, h - 2 - v * (h - 10)] as const);
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], mx = (px + cx) / 2;
    line += ` C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  const fill = `${line} L${last[0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  let bi = 0;
  norm.forEach((v, i) => { if (v > norm[bi]) bi = i; });
  return { fill, line, peak: norm[bi] > 0.05 ? { x: pts[bi][0], y: pts[bi][1] } : null };
}

const PartyEnergyGraph: React.FC<PartyEnergyGraphProps> = ({ songs, currentTrackId, currentSec = 0, height = 96, onSeek, className, emptyText }) => {
  const gid = useId().replace(/:/g, '');
  const { laid, ceiling, anyData } = useMemo(() => {
    const total = songs.reduce((a, s) => a + Math.max(1, s.durationSec), 0) || 1;
    const usable = W - GAP * Math.max(0, songs.length - 1);
    let x = 0;
    const laid = songs.map(s => {
      const w = Math.max(24, (Math.max(1, s.durationSec) / total) * usable);
      const r = { s, x, w };
      x += w + GAP;
      return r;
    });
    const ceiling = Math.max(0, ...songs.flatMap(s => s.series));
    return { laid, ceiling, anyData: ceiling > 0 };
  }, [songs]);

  if (!songs.length) return null;
  const totalW = laid.length ? laid[laid.length - 1].x + laid[laid.length - 1].w : W;
  // The viewBox is 600 wide and gets squeezed into a 340px panel: compact graphs need bigger label units to stay legible.
  const fs = height < 80 ? 17 : 10;
  const labelRoom = fs + 6;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${totalW} ${height + labelRoom}`} width="100%" role="img" aria-label="Audience energy by song" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pj-magenta, #d40055)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--pj-orange, #ff8c00)" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--pj-orange, #ff8c00)" />
            <stop offset="100%" stopColor="var(--pj-magenta, #d40055)" />
          </linearGradient>
        </defs>
        {laid.map(({ s, x, w }) => {
          const a = area(s.series, x, w, height, ceiling);
          const isCur = s.trackId === currentTrackId;
          const playheadX = isCur && s.durationSec > 0 ? x + Math.min(1, Math.max(0, currentSec / s.durationSec)) * w : null;
          return (
            <g key={s.trackId} opacity={currentTrackId && !isCur ? 0.72 : 1}>
              <rect x={x} y={0} width={w} height={height} rx={6} fill="rgba(255,255,255,0.04)" />
              {a.fill && <path d={a.fill} fill={`url(#${gid}-f)`} />}
              {a.line && <path d={a.line} fill="none" stroke={`url(#${gid}-l)`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
              {a.peak && <circle cx={a.peak.x} cy={a.peak.y} r={3.2} fill="#fff" stroke="var(--pj-magenta, #d40055)" strokeWidth={1.5} />}
              {playheadX != null && <line x1={playheadX} x2={playheadX} y1={0} y2={height} stroke="#fff" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.85} />}
              {onSeek && (
                <rect x={x} y={0} width={w} height={height} fill="transparent" style={{ cursor: 'pointer' }}
                  onClick={e => {
                    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                    const f = box.width > 0 ? (e.clientX - box.left) / box.width : 0;
                    onSeek(s.trackId, Math.max(0, Math.round(f * s.durationSec)));
                  }}>
                  <title>{`${s.title} — tap to jump${s.durationSec ? ` (${formatMoment(s.durationSec)})` : ''}`}</title>
                </rect>
              )}
              <text x={x + 4} y={height + fs + 1} fontSize={fs} fontWeight={800} fill="rgba(255,255,255,0.6)" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {s.title.length > Math.max(4, Math.floor(w / (fs * 0.68))) ? `${s.title.slice(0, Math.max(3, Math.floor(w / (fs * 0.68)) - 1))}…` : s.title}
              </text>
            </g>
          );
        })}
      </svg>
      {!anyData && (
        <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">{emptyText || 'The graph fills in as the room reacts'}</p>
      )}
    </div>
  );
};

export default PartyEnergyGraph;
