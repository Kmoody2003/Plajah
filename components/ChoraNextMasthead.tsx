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
import { motion, useReducedMotion } from 'motion/react';
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

/** Deterministic flight lanes for up to 6 releases. Size remains popularity-ranked. */
const SKY_SPOTS = [
  { top: 35, size: 76, sway: -14 },
  { top: 18, size: 60, sway: 12 },
  { top: 58, size: 54, sway: -10 },
  { top: 27, size: 46, sway: 15 },
  { top: 67, size: 40, sway: -12 },
  { top: 48, size: 36, sway: 9 },
];

const fmtPlays = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

const ChoraNextMasthead: React.FC<ChoraNextMastheadProps> = ({
  albums, upcomingAlbums, isNight, mode, onCycleMode, onExit, onFeedback, onSelectAlbum,
}) => {
  const intentRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

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
  const maxSkyPlays = Math.max(1, ...discs.map(a => a.playCount || 0));

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
          <span className="cn-cap">Tonight's sky · size + pace = plays this week · hover to catch &amp; unmute</span>
          {discs.map((a, i) => {
            const s = SKY_SPOTS[i];
            // Popular releases get a slightly brisker pass, but the deliberately narrow range
            // keeps every comet slow enough to notice, read, and catch.
            const popularity = (a.playCount || 0) / maxSkyPlays;
            // Moderate pace, clearly varied per disc: popularity gives a brisker pass,
            // and a per-lane offset keeps even similar releases from pacing in lockstep.
            //
            // REDUCED MOTION: the sky is not decoration — a comet's pace IS its plays-this-week
            // reading, so freezing it deletes the chart. Same rule the orrery already follows in
            // styles/chora.css: SLOW it, don't stop it. Under reduce we fly the same lane at 2.4x
            // the duration and drop the vertical sway; the flicker/spark jitter stays off in CSS.
            // (Windows with "Animation effects" off reports reduce, which is why desktop looked
            // dead while mobile flew.)
            const duration = (34 - popularity * 12 + (i % 3) * 4) * (reduceMotion ? 2.4 : 1);
            return (
              <motion.div
                key={a.id}
                className="cn-comet"
                initial={{ x: 0, y: 0 }}
                animate={reduceMotion
                  ? { x: [0, 'calc(100vw + 240px)'], y: 0 }
                  : { x: [0, 'calc(100vw + 240px)'], y: [0, s.sway, 0] }}
                transition={{ duration, repeat: Infinity, ease: 'linear', delay: -(i * 5.7 + 2) }}
                style={{
                  top: `${s.top}%`, width: s.size, height: s.size,
                  ['--comet-duration' as any]: `${duration}s`,
                  ['--comet-delay' as any]: `${-(i * 5.7 + 2)}s`,
                  ['--comet-sway' as any]: `${s.sway}px`,
                } as React.CSSProperties}
              >
                <span className="cn-spark" aria-hidden="true" />
                <button
                  type="button"
                  className="cn-disc"
                  style={{ backgroundImage: `url(${artUrl(a)})` }}
                  onMouseEnter={() => enter(a)} onMouseLeave={leave}
                  onFocus={() => enter(a)} onBlur={leave}
                  onClick={() => { leave(); onSelectAlbum(a); }}
                  aria-label={`${a.title} by ${a.artist}`}
                >
                  <span className="cn-lbl">{a.title}{(a.playCount || 0) > 0 && <i>{fmtPlays(a.playCount!)}</i>}</span>
                </button>
              </motion.div>
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
