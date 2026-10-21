/**
 * ChoraSkyBand — the landing's "Tonight's sky": one edge-to-edge band where Chora releases and
 * Audius trending tracks fly as comets (orange fire for Chora, purple for Audius). A comet's size
 * and pace follow its plays, so the sky is a live chart across both catalogs, not decoration.
 * Day shows the Listening Room's "Today's selections" panes in the same slot.
 *
 * Lifted from ChoraNextMasthead's sky (same lanes, same reduced-motion rule: slow it, don't stop
 * it). Wraps itself in the .chora-next scope so its styles/chora.css rules apply in either skin.
 */
import React, { useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import type { Album } from '../../types';
import type { ArchiveTrack } from '../../services/archiveContentService';
import { playHoverPreview, stopHoverPreview } from '../../services/hoverPreview';

interface Props {
  albums: Album[];
  upcomingAlbums: Album[];
  audiusTrending: ArchiveTrack[];
  isNight: boolean;
  onSelectAlbum: (album: Album) => void;
  onPlayAudius: (track: ArchiveTrack) => void;
}

interface Comet {
  id: string;
  title: string;
  artist: string;
  art: string;
  plays: number;
  audius: boolean;
  preview: string | null;
  open: () => void;
}

const SKY_SPOTS = [
  { top: 35, size: 76, sway: -14 },
  { top: 16, size: 60, sway: 12 },
  { top: 58, size: 56, sway: -10 },
  { top: 26, size: 48, sway: 15 },
  { top: 68, size: 44, sway: -12 },
  { top: 46, size: 40, sway: 9 },
  { top: 12, size: 36, sway: -8 },
  { top: 76, size: 34, sway: 10 },
];

const albumArt = (a: Album): string => a.promoKit?.keyArtUrl || a.coverThumb || a.coverImage || '';
const albumPreview = (a: Album): string | null => {
  if (a.promoKit?.audioSampleUrl) return a.promoKit.audioSampleUrl;
  const t = (a.tracks || []).find(tr => tr?.url && tr.mediaKind !== 'VIDEO');
  return t?.url || null;
};
const fmtPlays = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

const ChoraSkyBand: React.FC<Props> = ({ albums, upcomingAlbums, audiusTrending, isNight, onSelectAlbum, onPlayAudius }) => {
  const intentRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  const { comets, panes } = useMemo(() => {
    const chora: Comet[] = albums
      .filter(a => albumArt(a))
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0) || (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5)
      .map(a => ({ id: a.id, title: a.title, artist: a.artist, art: albumArt(a), plays: a.playCount || 0, audius: false, preview: albumPreview(a), open: () => onSelectAlbum(a) }));
    const aud: Comet[] = audiusTrending
      .filter(t => t.thumbnailUrl && t.url)
      .slice(0, 3)
      .map(t => ({ id: t.id, title: t.title, artist: t.artist, art: t.thumbnailUrl!, plays: Number((t as any).playCount) || 0, audius: true, preview: t.url, open: () => onPlayAudius(t) }));
    // Interleave so both catalogs share the sky; size is ranked within each catalog's own counts
    // (an Audius play and a Chora play are different audiences), then lanes are dealt in turn.
    const mixed: Comet[] = [];
    for (let i = 0; mixed.length < SKY_SPOTS.length && (i < chora.length || i < aud.length); i++) {
      if (chora[i]) mixed.push(chora[i]);
      if (aud[i] && mixed.length < SKY_SPOTS.length) mixed.push(aud[i]);
    }
    const withArt = albums.filter(a => albumArt(a));
    const now = Date.now();
    const panes: { album: Album; kicker: string; countdown?: string }[] =
      withArt.slice(0, 3).map((album, i) => ({ album, kicker: i === 0 ? 'New pressing' : 'Recent release' }));
    const up = upcomingAlbums[0];
    if (up) {
      const days = Math.max(0, Math.ceil(((up.releaseDate || now) - now) / 86_400_000));
      panes.push({ album: up, kicker: 'Coming soon', countdown: days === 0 ? 'Releases today' : `${days} day${days === 1 ? '' : 's'} away` });
    }
    return { comets: mixed, panes: panes.slice(0, 4) };
  }, [albums, upcomingAlbums, audiusTrending, onSelectAlbum, onPlayAudius]);

  const enter = (url: string | null) => {
    if (intentRef.current) window.clearTimeout(intentRef.current);
    intentRef.current = window.setTimeout(() => { if (url) playHoverPreview(url); }, 320);
  };
  const leave = () => {
    if (intentRef.current) window.clearTimeout(intentRef.current);
    stopHoverPreview();
  };

  const maxPlays = {
    chora: Math.max(1, ...comets.filter(c => !c.audius).map(c => c.plays)),
    audius: Math.max(1, ...comets.filter(c => c.audius).map(c => c.plays)),
  };

  return (
    <section aria-label={isNight ? "Tonight's sky" : "Today's selections"} className={`chora-next${isNight ? ' chora-night' : ''} normal-case`}>
      {isNight ? (
        <div className="cn-sky cn-sky--band">
          <div className="absolute z-[3] flex flex-wrap items-baseline gap-x-4 gap-y-1" style={{ left: 'clamp(16px, 3.4vw, 48px)', top: 18, right: 220 }}>
            <span className="text-white" style={{ fontFamily: "'Bricolage Grotesque', var(--font-display), sans-serif", fontWeight: 800, fontSize: 22 }}>Tonight's sky</span>
            <span style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: 16, color: '#D0BCFF' }}>
              Chora and Audius in one sky · size and pace follow plays · hover to catch a comet
            </span>
          </div>
          <div className="absolute z-[3] hidden sm:flex gap-4 text-xs font-semibold text-white/70" style={{ right: 'clamp(16px, 3.4vw, 48px)', top: 22 }}>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FF8C00', boxShadow: '0 0 8px #FF8C00' }} />Chora</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#A855F7', boxShadow: '0 0 8px #A855F7' }} />Audius</span>
          </div>
          {comets.map((c, i) => {
            const s = SKY_SPOTS[i];
            const popularity = c.plays / (c.audius ? maxPlays.audius : maxPlays.chora);
            const duration = (34 - popularity * 12 + (i % 3) * 4) * (reduceMotion ? 2.4 : 1);
            return (
              <motion.div
                key={c.id}
                className={`cn-comet${c.audius ? ' cn-comet--audius' : ''}`}
                initial={{ x: 0, y: 0 }}
                animate={reduceMotion ? { x: [0, 'calc(100vw + 240px)'], y: 0 } : { x: [0, 'calc(100vw + 240px)'], y: [0, s.sway, 0] }}
                transition={{ duration, repeat: Infinity, ease: 'linear', delay: -(i * 5.7 + 2) }}
                style={{ top: `${s.top}%`, width: s.size, height: s.size } as React.CSSProperties}
              >
                <span className="cn-spark" aria-hidden="true" />
                <button
                  type="button"
                  className="cn-disc"
                  style={{ backgroundImage: `url(${c.art})` }}
                  onMouseEnter={() => enter(c.preview)} onMouseLeave={leave}
                  onFocus={() => enter(c.preview)} onBlur={leave}
                  onClick={() => { leave(); c.open(); }}
                  aria-label={`${c.title} by ${c.artist}${c.audius ? ' on Audius' : ''}`}
                >
                  <span className="cn-lbl">{c.title}{c.plays > 0 && <i>{fmtPlays(c.plays)}</i>}</span>
                </button>
              </motion.div>
            );
          })}
          {comets.length === 0 && (
            <span className="cn-cap" style={{ top: '48%', left: '50%', transform: 'translateX(-50%)' }}>The sky fills as releases land</span>
          )}
        </div>
      ) : (
        panes.length > 0 && (
          <div className="px-4 sm:px-6 lg:px-12">
            <div className="flex items-baseline gap-4 mb-3">
              <span className="text-white" style={{ fontFamily: "'Bricolage Grotesque', var(--font-display), sans-serif", fontWeight: 800, fontSize: 22 }}>Today's selections</span>
              <span style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: 16, color: '#FFB86B' }}>hover to hear a moment</span>
            </div>
            <div className="cn-panes">
              {panes.map(({ album, kicker, countdown }) => (
                <button
                  key={album.id}
                  type="button"
                  className="cn-pane"
                  onMouseEnter={() => enter(albumPreview(album))}
                  onMouseLeave={leave}
                  onFocus={() => enter(albumPreview(album))}
                  onBlur={leave}
                  onClick={() => { leave(); onSelectAlbum(album); }}
                >
                  <div className="cn-art" style={{ backgroundImage: `url(${albumArt(album)})` }} />
                  <div className="cn-scrim" />
                  <span className="cn-k">{kicker}</span>
                  {albumPreview(album) && <span className="cn-snd"><span className="cn-eq"><i></i><i></i><i></i></span></span>}
                  <div className="cn-meta">
                    <h5>{album.title}</h5>
                    <p>{album.artist}</p>
                    {countdown && <span className="cn-count"><Sparkles size={9} /> {countdown}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </section>
  );
};

export default ChoraSkyBand;
