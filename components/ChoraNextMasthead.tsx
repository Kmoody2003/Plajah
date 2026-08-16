/**
 * ChoraNextMasthead — the opt-in "Chora Next" masthead + hero.
 *
 * Day = the Listening Room: gradient masthead, dated issue line, and a
 * "Today's selections" pane strip (hover to unmute a sample).
 * Night = the Observatory: same masthead in the spatial palette and a
 * "Sky Tonight" field where releases float as discs — size and glow are the
 * real weekly signal (playCount), so the sky is a live chart, not decoration.
 *
 * Rendered by MusicView only while the user has opted in via "Try the new
 * Chora"; the Switch back pill returns them to the classic UI instantly.
 * Feedback goes through the existing bug-report modal (OPEN_BUG_REPORT →
 * errorReports with the 5-minute session trace attached).
 */
import React, { useMemo, useRef } from 'react';
import { Sparkles, MessageSquare, Undo2, Sun, Moon, Clock } from 'lucide-react';
import type { Album } from '../types';
import type { ChoraNextMode } from '../hooks/useChoraNext';
import { playHoverPreview, stopHoverPreview } from '../services/hoverPreview';

interface ChoraNextMastheadProps {
  albums: Album[];
  upcomingAlbums: Album[];
  isNight: boolean;
  mode: ChoraNextMode;
  onCycleMode: () => void;
  onExit: () => void;
  onFeedback: () => void;
  onSelectAlbum: (album: Album) => void;
}

/** Preview url for hover-unmute: promo kit sample first, then the first audio track. */
const previewUrl = (a: Album): string | null => {
  if (a.promoKit?.audioSampleUrl) return a.promoKit.audioSampleUrl;
  const t = (a.tracks || []).find(tr => tr?.url && tr.mediaKind !== 'VIDEO');
  return t?.url || null;
};

const artUrl = (a: Album): string => a.promoKit?.keyArtUrl || a.coverThumb || a.coverImage || '';

/** Deterministic sky positions for up to 6 discs (percent coords + px sizes by rank). */
const SKY_SPOTS = [
  { left: 14, top: 30, size: 76 },
  { left: 38, top: 16, size: 60 },
  { left: 57, top: 46, size: 54 },
  { left: 75, top: 20, size: 46 },
  { left: 87, top: 56, size: 40 },
  { left: 27, top: 62, size: 36 },
];

const fmtPlays = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

const ChoraNextMasthead: React.FC<ChoraNextMastheadProps> = ({
  albums, upcomingAlbums, isNight, mode, onCycleMode, onExit, onFeedback, onSelectAlbum,
}) => {
  const intentRef = useRef<number | null>(null);

  const { issueNo, weekCount, panes, discs } = useMemo(() => {
    const now = Date.now();
    const issueNo = Math.floor((now - Date.UTC(2026, 0, 1)) / 86_400_000) + 1;
    const weekCount = albums.filter(a => now - (a.createdAt || 0) < 7 * 86_400_000).length;
    const withArt = albums.filter(a => artUrl(a));
    const panes: { album: Album; kicker: string; countdown?: string }[] =
      withArt.slice(0, 3).map((album, i) => ({ album, kicker: i === 0 ? 'New pressing' : 'Recent release' }));
    const up = upcomingAlbums[0];
    if (up) {
      const days = Math.max(0, Math.ceil(((up.releaseDate || now) - now) / 86_400_000));
      panes.push({ album: up, kicker: 'Coming soon', countdown: days === 0 ? 'Releases today' : `${days} day${days === 1 ? '' : 's'} away` });
    }
    const discs = [...withArt]
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0) || (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, SKY_SPOTS.length);
    return { issueNo, weekCount, panes: panes.slice(0, 4), discs };
  }, [albums, upcomingAlbums]);

  const enter = (a: Album) => {
    if (intentRef.current) window.clearTimeout(intentRef.current);
    intentRef.current = window.setTimeout(() => {
      const url = previewUrl(a);
      if (url) playHoverPreview(url);
    }, 320);
  };
  const leave = () => {
    if (intentRef.current) window.clearTimeout(intentRef.current);
    stopHoverPreview();
  };

  const modeIcon = mode === 'auto' ? <Clock size={11} /> : mode === 'day' ? <Sun size={11} /> : <Moon size={11} />;
  const modeLabel = mode === 'auto' ? (isNight ? 'Auto · Night' : 'Auto · Day') : mode === 'day' ? 'Day' : 'Night';

  return (
    <div className="cn-mast">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="min-w-0">
          <h1>Plajah <span className="cn-grad">Chora</span></h1>
          <div className="cn-issue">
            <span>{isNight ? 'The Sky Tonight' : 'The Listening Room'}</span>
            <span aria-hidden="true">·</span>
            <span>Issue Nº {issueNo}</span>
            <span aria-hidden="true">·</span>
            <b>{weekCount > 0 ? `${weekCount} new ${isNight ? 'lights' : 'pressings'} this week` : `${albums.length} works in the catalog`}</b>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button type="button" className="cn-pill" onClick={onCycleMode} title="Cycle day / night / auto">
            {modeIcon} {modeLabel}
          </button>
          <button type="button" className="cn-pill cn-pill--brand" onClick={onFeedback}>
            <MessageSquare size={11} /> Give feedback
          </button>
          <button type="button" className="cn-pill" onClick={onExit} title="Return to the classic Chora UI">
            <Undo2 size={11} /> Switch back
          </button>
        </div>
      </div>

      {isNight ? (
        <div className="cn-sky">
          <span className="cn-cap">Tonight's sky · brightness = plays this week · hover to unmute</span>
          {discs.map((a, i) => {
            const s = SKY_SPOTS[i];
            return (
              <button
                key={a.id}
                type="button"
                className="cn-disc"
                style={{
                  left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size,
                  backgroundImage: `url(${artUrl(a)})`, animationDelay: `${(i * 0.7) % 2.4}s`,
                }}
                onMouseEnter={() => enter(a)}
                onMouseLeave={leave}
                onFocus={() => enter(a)}
                onBlur={leave}
                onClick={() => { leave(); onSelectAlbum(a); }}
                aria-label={`${a.title} by ${a.artist}`}
              >
                <span className="cn-lbl">{a.title}{(a.playCount || 0) > 0 && <i>{fmtPlays(a.playCount!)}</i>}</span>
              </button>
            );
          })}
          {discs.length === 0 && (
            <span className="cn-cap" style={{ top: '48%', left: '50%', transform: 'translateX(-50%)' }}>The sky fills as releases land</span>
          )}
        </div>
      ) : (
        panes.length > 0 && (
          <div className="cn-panes">
            {panes.map(({ album, kicker, countdown }) => (
              <button
                key={album.id}
                type="button"
                className="cn-pane"
                onMouseEnter={() => enter(album)}
                onMouseLeave={leave}
                onFocus={() => enter(album)}
                onBlur={leave}
                onClick={() => { leave(); onSelectAlbum(album); }}
              >
                <div className="cn-art" style={{ backgroundImage: `url(${artUrl(album)})` }} />
                <div className="cn-scrim" />
                <span className="cn-k">{kicker}</span>
                {previewUrl(album) && (
                  <span className="cn-snd"><span className="cn-eq"><i></i><i></i><i></i></span></span>
                )}
                <div className="cn-meta">
                  <h5>{album.title}</h5>
                  <p>{album.artist}</p>
                  {countdown && <span className="cn-count"><Sparkles size={9} /> {countdown}</span>}
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default ChoraNextMasthead;
