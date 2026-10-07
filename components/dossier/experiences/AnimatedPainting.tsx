/**
 * Animated painting (Founding Era): John Trumbull's "The Battle of Bunker's Hill" (1786, public domain), given motion in
 * code and played INTERACTIVELY inside the node card: this is the exhibit's live canvas film player
 * (components/dossier/DossierFilmPlayer.tsx, embedded mode) running the founding-battle film spec
 * (data/dossier/foundingBattleDemo.ts, the same loader the standalone page uses via ?film=founding-battle).
 *
 *  - Always labelled ANIMATED PAINTING (a badge on the player, the same words the film paints on the canvas), with a
 *    plain-language note under it that motion is added and the brushwork is unchanged.
 *  - Scrub bar, pause/play, restart, captions (on by default), chapters and fullscreen come from the player.
 *  - The film opens with its own content note (the painting shows a battle and some fallen soldiers); a visible button skips it.
 *  - Reduced motion: nothing starts by itself. The viewer sees the authored still (the painting at its real edges) behind a
 *    play button; playing then runs the film's authored reduced-motion cut list (holds and short fades, no camera or smoke).
 *  - Nothing loads until the card is near the screen (the painting and its layers are several MB).
 *  - Fallback hook: if the canvas film cannot be loaded, `muxPlaybackId` (an asset an admin registered as interactive content
 *    in Admin > Experiences) is played with the Mux player instead; with none, the viewer gets the still and a note. DossierHall
 *    does not pass one today: visitors cannot read the admin-only `experiences` collection, so a public pointer for interactive
 *    content (like experienceFilms for films) would have to be added before this is wired.
 * This is NOT the exhibit's film: DossierFilmHost / "Watch the film" never uses it.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { FilmRenderer } from '../../../services/dossier/film/filmRenderer';
import { PAINTING_PROVENANCE, loadFoundingBattleFilm } from '../../../data/dossier/foundingBattleDemo';
import { PAINTING_FILE } from '../../../data/dossier/foundingBattleLayers';
import { posterUrl } from '../../../services/dossier/experiences/experienceModel';

const DossierFilmPlayer = React.lazy(() => import('../DossierFilmPlayer'));
const MuxPlayer = React.lazy(() => import('@mux/mux-player-react'));

export const ANIMATED_PAINTING_LABEL = 'ANIMATED PAINTING';
const STILL = `/dossier/founding/film/${PAINTING_FILE}`;

/**
 * The frame behind the play button: a moment inside the painting shot, just before the first caption appears, so the viewer
 * sees the painting with its credit slate (not a text card, and not a caption hidden behind the controls).
 */
export const paintingStillTime = (r: FilmRenderer): number => {
  const s = r.council?.tl.shots.find(x => x.spec.kind === 'animatedPainting');
  if (!s) return 0;
  const first = s.beats[0];
  return first ? s.start + (first.a - s.start) * 0.85 : s.start + 1;
};

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const CSS = `
.ap{margin:18px 0 6px}
.ap-note{margin:10px 2px 0;font-size:14px;line-height:1.5;color:var(--dh-mute,#b4ac9f)}
.ap-note b{color:var(--dh-a,#4fb3a0);letter-spacing:.12em;font-size:12px}
.ap-hold{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;display:grid;place-items:center}
.ap-hold img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.ap-hold span{position:relative;font:600 13px 'Inter',system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--dh-a,#4fb3a0);background:rgba(0,0,0,.6);padding:8px 12px;border-radius:8px}
`;

export default function AnimatedPainting({ muxPlaybackId }: { muxPlaybackId?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = reducedMotion();

  useEffect(() => {
    const el = host.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  let body: React.ReactNode;
  if (failed && muxPlaybackId) {
    body = (
      <React.Suspense fallback={<div className="ap-hold"><span>Loading the video</span></div>}>
        <MuxPlayer playbackId={muxPlaybackId} streamType="on-demand" title="Animated painting: the Battle of Bunker Hill" poster={posterUrl(muxPlaybackId)} crossOrigin="anonymous"
          style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden' }} />
      </React.Suspense>
    );
  } else if (failed) {
    body = <div className="ap-hold"><img src={STILL} alt={`${PAINTING_PROVENANCE.painter}, ${PAINTING_PROVENANCE.title}, ${PAINTING_PROVENANCE.painted}`} /><span>The animation could not load. The painting is shown still.</span></div>;
  } else if (!near) {
    body = <div className="ap-hold"><span>Animated painting</span></div>;
  } else {
    body = (
      <React.Suspense fallback={<div className="ap-hold"><span>Preparing the painting</span></div>}>
        <DossierFilmPlayer embedded load={loadFoundingBattleFilm} width={1280} height={720} badge={ANIMATED_PAINTING_LABEL}
          autoPlay={!reduced} poster={paintingStillTime} onFail={() => setFailed(true)} />
      </React.Suspense>
    );
  }

  return (
    <div className="ap" ref={host} data-testid="animated-painting">
      <style>{CSS}</style>
      {body}
      <p className="ap-note">
        <b>{ANIMATED_PAINTING_LABEL}</b> {PAINTING_PROVENANCE.painter}’s painting of the battle (painted {PAINTING_PROVENANCE.painted}, years after it, so it is his interpretation).
        Motion is added in code; the brushwork is unchanged. {reduced ? 'Your device asks for less motion, so it starts as a still: press play for the version without camera movement. ' : ''}
        {PAINTING_PROVENANCE.collection}, via Wikimedia Commons, {PAINTING_PROVENANCE.licence.toLowerCase()}.
      </p>
    </div>
  );
}
