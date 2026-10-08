// ShowModeView — "Share in Show Mode": a full-stage, high-impact landing for a shared album/release.
//
// A shared link opens here FIRST instead of the regular album page. Flow:
//   1. Gate  — tap to enter (browsers require a gesture before audio can start). Backdrop is the
//              artist's Project Promo kit (trailer → teaser → key art → cover).
//   2. Countdown — 3·2·1 over the same promo material, then the release starts playing.
//   3. Show  — fullscreen stage. Three modes:
//        FX      the Mixes auto-show (MixPixelsStage — generators + the whole shader library +
//                MilkDrop, audio-reactive and energy-aware)
//        SLIDES  the artist's slideshow / promo stills (AnimatedSlideshow)
//        DEFAULT opens on FX, then cycles Slides ⇄ Auto-Show
//   Never black: the release's art sits under every scene (dim, blurred, drifting) and the FX layer
//   is SCREEN-blended over it, so any dark or dead frame (shader still compiling, analyser not yet
//   tapped, a visual that failed and is being skipped) reveals the art instead of a black screen.
//   The FX layer stays mounted under the slides, so scene changes cross-fade instead of remounting.
//   Lyrics: synced lines over the stage. A track without timeCodedLyrics is synced server-side on
//   the spot (POST /api/lyrics/ensure, no sign-in needed), current track first, then the rest.
//   4. Always-on CTAs — Join Plajah (signed-out), Support this artist, Plajah+ invite — plus an exit
//      into the regular album view so the visitor can keep exploring.
//
// Reuses: GlobalPlayerContext (audio + shared analyser), MixPixelsStage, AnimatedSlideshow,
// services/slideshow, Album.promoKit.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Album, PromoKit } from '../types';
import { useGlobalPlayer, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { resolveSlideshowImages } from '../services/slideshow';
import MixPixelsStage from './MixPixelsStage';
import AnimatedSlideshow from './AnimatedSlideshow';
import Logo from './Logo';
import { Button, Chip, Eyebrow } from './ui';
import ArtistSupportSheet, { musicOffers, type SupportTab } from './ArtistSupportSheet';

import type { ShowMode } from '../services/deepLinkService';

interface ShowModeViewProps {
  album: Album;
  /** Start on a specific track (shared track link). */
  trackId?: string | null;
  mode?: ShowMode;
  user?: any;
  /** Leave the show for the regular album view. */
  onExit: () => void;
  /** Visitor wants an account (signed-out). */
  onSignUp: () => void;
}

// DEFAULT mode schedule: open on the auto-show, then alternate slides ⇄ auto-show.
const FX_MS = 45_000;
const SLIDES_MS = 22_000;
const COUNT_FROM = 3;

/** Best backdrop for the gate/countdown: trailer → teaser → key art → poster → cover. */
function pickPromoBackdrop(kit: PromoKit | undefined, cover: string) {
  if (kit?.trailerUrl) return { kind: 'video' as const, url: kit.trailerUrl };
  if (kit?.teaserLoopUrl) return { kind: 'video' as const, url: kit.teaserLoopUrl };
  const still = kit?.keyArtUrl || kit?.tvBillboardUrl || kit?.posterUrl || kit?.shareCardUrl || cover;
  return { kind: 'image' as const, url: still };
}

type Line = { time: number; text: string };
const isInstrumental = (t?: string) => !!t && /^\(?\s*instrumental\s*\)?$/i.test(t.trim());

/** Current + next synced line. Its own component so progress ticks re-render only this. */
const ShowLyrics: React.FC<{ lines: Line[]; lifted: boolean }> = ({ lines, lifted }) => {
  const { currentTime } = useGlobalPlayerProgress();
  const sorted = useMemo(() => [...lines].sort((a, b) => a.time - b.time), [lines]);
  let i = -1;
  for (let k = 0; k < sorted.length; k++) { if (sorted[k].time <= (currentTime || 0) + 0.15) i = k; else break; }
  const cur = i >= 0 ? sorted[i] : null;
  const next = sorted[i + 1];
  if (!cur && !next) return null;
  return (
    <div className={`absolute inset-x-0 z-[15] px-6 text-center pointer-events-none transition-[bottom] duration-500 ${lifted ? 'bottom-[30%] sm:bottom-[24%]' : 'bottom-[14%]'}`}>
      <p key={cur ? `${i}:${cur.time}` : 'pre'}
        className="mx-auto max-w-4xl text-2xl sm:text-4xl lg:text-5xl font-black leading-tight"
        style={{ animation: 'showLine .45s ease-out', textShadow: '0 2px 24px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)' }}>
        {cur && !isInstrumental(cur.text) ? cur.text : '♪'}
      </p>
      {next && !isInstrumental(next.text) && (
        <p className="mx-auto mt-2 max-w-3xl text-base sm:text-xl font-bold text-white/45 truncate" style={{ textShadow: '0 2px 12px rgba(0,0,0,.8)' }}>{next.text}</p>
      )}
    </div>
  );
};

const ShowModeView: React.FC<ShowModeViewProps> = ({ album, trackId, mode: initialMode = 'DEFAULT', user, onExit, onSignUp }) => {
  const gp = useGlobalPlayer();
  const [mode, setMode] = useState<ShowMode>(initialMode);
  const [phase, setPhase] = useState<'gate' | 'countdown' | 'show'>('gate');
  const [count, setCount] = useState(COUNT_FROM);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [sheet, setSheet] = useState<SupportTab | null>(null);

  const cover = album.coverImage || album.coverThumb || '';
  const kit = album.promoKit;
  const backdrop = useMemo(() => pickPromoBackdrop(kit, cover), [kit, cover]);
  const startTrack = useMemo(
    () => (trackId ? album.tracks?.find(t => t.id === trackId) : undefined) || album.tracks?.[0],
    [album.tracks, trackId],
  );
  const signedIn = !!user?.uid;
  const focusTrack = (gp.currentTrack && album.tracks?.find(t => t.id === gp.currentTrack?.id)) || startTrack;
  const offers = useMemo(() => musicOffers(album, focusTrack), [album, focusTrack]);
  const lowestPrice = Math.min(...[offers.albumPrice, offers.trackPrice].filter(n => n > 0));

  // Slides: the artist's own slideshow first, then their promo stills; cover as the floor.
  const slides = useMemo(() => {
    const own = resolveSlideshowImages(album, gp.currentTrack as any);
    const promo = [kit?.keyArtUrl, kit?.posterUrl, kit?.shareCardUrl, kit?.tvBillboardUrl, kit?.wideBannerUrl].filter(Boolean) as string[];
    const all = [...promo, ...own].filter(Boolean);
    return Array.from(new Set(all.length ? all : [cover].filter(Boolean)));
  }, [album, kit, cover, gp.currentTrack]);

  // ── Lyrics: use what the album carries; sync anything missing server-side, current track first ──
  const [showLyrics, setShowLyrics] = useState(true);
  const [synced, setSynced] = useState<Record<string, Line[]>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const focusId = focusTrack?.id;
  useEffect(() => {
    if (phase !== 'show' || !album.id || album.isPrivate) return;
    const music = (album.tracks || []).filter(t => t?.id && t.mediaKind !== 'VIDEO' && /^https?:/i.test(String(t.url || '')));
    const missing = music.filter(t => !(t.timeCodedLyrics?.length) && !synced[t.id]);
    if (!missing.length) return;
    // Current track first, then the rest of the release in order.
    missing.sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));
    let cancelled = false;
    (async () => {
      for (const t of missing) {
        for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
          setSyncing(t.id);
          let status = 'failed';
          try {
            const res = await fetch('/api/lyrics/ensure', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ albumId: album.id, trackId: t.id }),
            });
            const data = res.ok ? await res.json().catch(() => ({})) : {};
            // 429 = rate limited; 502/504 = Firebase Hosting's 60 s proxy cut-off on a long song,
            // while the server keeps transcribing. Both mean "look again shortly", not "failed".
            status = data?.status || (res.status === 429 || res.status === 502 || res.status === 504 ? 'running' : 'failed');
            if (status === 'done' && Array.isArray(data.captions) && data.captions.length && !cancelled) {
              setSynced(m => ({ ...m, [t.id]: data.captions }));
            }
          } catch { status = 'failed'; }
          // Another viewer's request is transcribing it (or we're rate limited): look again shortly.
          if (status !== 'running') break;
          await new Promise(res => setTimeout(res, 20000));
        }
        if (cancelled) return;
      }
      if (!cancelled) setSyncing(null);
    })();
    return () => { cancelled = true; setSyncing(null); };
  }, [phase, album.id, focusId]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusLines: Line[] | null =
    (focusId && synced[focusId]) || (focusTrack?.timeCodedLyrics?.length ? focusTrack.timeCodedLyrics : null);

  // ── Gate → countdown → play ──
  const enter = useCallback(() => {
    setCount(COUNT_FROM);
    setPhase('countdown');
  }, []);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      if (startTrack) {
        try { gp.playTrack(startTrack, album, 'LIBRARY'); } catch { /* player will surface its own error */ }
      }
      setPhase('show');
      return;
    }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wake the analyser on mobile once audio is flowing (same as MixPlayerView).
  useEffect(() => {
    if (phase === 'show' && gp.isPlaying) {
      try { gp.ensureAnalyserTap(); gp.getAudioContext(); } catch { /* best effort */ }
    }
  }, [phase, gp.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DEFAULT-mode scene scheduler: FX → slides → FX → slides … ──
  const [scene, setScene] = useState<'FX' | 'SLIDES'>('FX');
  useEffect(() => {
    if (phase !== 'show') return;
    if (mode === 'FX') { setScene('FX'); return; }
    if (mode === 'SLIDES') { setScene('SLIDES'); return; }
    setScene('FX');
    let cancelled = false;
    let cur: 'FX' | 'SLIDES' = 'FX';
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        cur = cur === 'FX' ? 'SLIDES' : 'FX';
        setScene(cur);
        next();
      }, cur === 'FX' ? FX_MS : SLIDES_MS);
    };
    next();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [phase, mode]);

  // ── auto-hide chrome after idle ──
  const idleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const poke = useCallback(() => {
    setChromeVisible(true);
    clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setChromeVisible(false), 4000);
  }, []);
  useEffect(() => { poke(); return () => clearTimeout(idleRef.current); }, [phase, poke]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet) return; // the support sheet owns the keyboard (amount field, its own close)
      if (e.key === 'Escape') onExit();
      else if (e.key === ' ' && phase === 'show') { e.preventDefault(); gp.togglePlay(); }
      poke();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, gp, onExit, poke, sheet]);

  const nowTitle = gp.currentTrack?.title || startTrack?.title || album.title;

  const ui = (
    <div className="fixed inset-0 z-[9000] bg-black text-white overflow-hidden select-none" onMouseMove={poke} onTouchStart={poke}>
      {/* ── backdrop (gate + countdown): the artist's promo material ── */}
      {phase !== 'show' && (
        <div className="absolute inset-0">
          {backdrop.kind === 'video' ? (
            <video src={backdrop.url} poster={cover} autoPlay muted loop playsInline className="w-full h-full object-cover" />
          ) : backdrop.url ? (
            <img src={backdrop.url} alt="" className="w-full h-full object-cover" style={{ animation: 'showKen 14s ease-out forwards' }} />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/30" />
        </div>
      )}

      {/* ── stage ── */}
      {phase === 'show' && (
        <div className="absolute inset-0">
          {/* Floor: the release's own art, dim + drifting. Nothing above can leave the stage black. */}
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            {(kit?.keyArtUrl || cover || slides[0]) && (
              <img src={kit?.keyArtUrl || cover || slides[0]} alt="" className="absolute inset-[-6%] w-[112%] h-[112%] max-w-none object-cover show-drift"
                style={{ filter: 'blur(28px) saturate(1.25) brightness(.42)' }} />
            )}
            <div className="absolute inset-0 show-glow" style={{ background: 'radial-gradient(120% 90% at 50% 40%, rgba(107,0,153,.35), rgba(212,0,85,.18) 45%, rgba(0,0,0,.55) 100%)' }} />
          </div>
          {/* FX stays mounted under the slides (no remount flash, no WebGL context churn). Screen
              blend: its black pixels show the art floor, its light pixels play on top. */}
          {mode !== 'SLIDES' && (
            <div className="absolute inset-0 transition-opacity duration-[1200ms]" style={{ mixBlendMode: 'screen', opacity: scene === 'FX' ? 1 : 0 }}>
              <MixPixelsStage analyser={gp.analyser} isPlaying={gp.isPlaying} visualMode="AUTO" ownerId={album.ownerId} />
            </div>
          )}
          {mode !== 'FX' && (
            <div className="absolute inset-0 transition-opacity duration-[1200ms]" style={{ opacity: scene === 'SLIDES' ? 1 : 0, pointerEvents: scene === 'SLIDES' ? 'auto' : 'none' }}>
              <AnimatedSlideshow images={slides} isPlaying={gp.isPlaying} themeColor="#D40055" artistNotes={[]} presentation="ambient" />
            </div>
          )}
          {showLyrics && focusLines && <ShowLyrics lines={focusLines} lifted={chromeVisible} />}
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        </div>
      )}

      {/* ── top bar ── */}
      <div className={`absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 pt-4 transition-opacity duration-500 ${chromeVisible || phase !== 'show' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <Logo size={30} />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Show Mode</span>
        <div className="ml-auto flex items-center gap-2">
          {!signedIn && <Button variant="secondary" size="sm" onClick={onSignUp}>Join Plajah</Button>}
          <Button variant="secondary" size="sm" iconRight={<span aria-hidden>›</span>} onClick={onExit}>Open album</Button>
        </div>
      </div>

      {/* ── gate ── */}
      {phase === 'gate' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-end text-center px-6 pb-[12vh]">
          <Eyebrow>Now showing</Eyebrow>
          <h1 className="text-4xl sm:text-6xl font-black leading-tight max-w-3xl">{album.title}</h1>
          <p className="mt-2 text-lg text-white/70">{album.artist}</p>
          <Button variant="primary" size="xl" className="mt-8" onClick={enter}>▶ Start the show</Button>
          <p className="mt-4 text-[10px] uppercase tracking-widest text-white/40">Sound on · best in fullscreen</p>
        </div>
      )}

      {/* ── countdown ── */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/60">Show starts in</p>
          <div key={count} className="text-[28vmin] leading-none font-black" style={{ animation: 'showPop 1s ease-out', textShadow: '0 0 60px rgba(212,0,85,.7)' }}>
            {Math.max(count, 1)}
          </div>
          <p className="mt-2 text-xl font-bold text-white/80">{album.title}</p>
          <p className="text-sm text-white/50">{album.artist}</p>
        </div>
      )}

      {/* ── show chrome: now playing + CTAs + mode switch ── */}
      {phase === 'show' && (
        <div className={`absolute inset-x-0 bottom-0 z-20 px-4 pb-5 transition-opacity duration-500 ${chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            <div className="flex items-end gap-3">
              {cover && <img src={cover} alt="" className="w-14 h-14 rounded-lg object-cover shadow-xl hidden sm:block" />}
              <div className="min-w-0 flex-1">
                <div className="text-lg sm:text-2xl font-black truncate">{nowTitle}</div>
                <div className="text-sm text-white/65 truncate">{album.artist}{album.title !== nowTitle ? ` · ${album.title}` : ''}</div>
              </div>
              <button onClick={() => gp.togglePlay()} aria-label={gp.isPlaying ? 'Pause' : 'Play'}
                className="w-12 h-12 rounded-full grid place-items-center shadow-lg shrink-0"
                style={{ background: 'linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d={gp.isPlaying ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'} /></svg>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {album.ownerId && <Button variant="primary" size="sm" onClick={() => setSheet('gift')}>Gift this artist</Button>}
              {offers.any && <Button variant="accent" size="sm" onClick={() => setSheet('buy')}>Buy from ${lowestPrice % 1 === 0 ? lowestPrice.toFixed(0) : lowestPrice.toFixed(2)}</Button>}
              <Button variant="secondary" size="sm" onClick={() => setSheet('plus')}>Plajah+ · Invite</Button>
              <div className="ml-auto flex gap-1.5 items-center">
                {syncing && syncing === focusId && !focusLines && (
                  <span className="text-[10px] uppercase tracking-widest text-white/50 mr-1">Syncing lyrics…</span>
                )}
                {focusLines && (
                  <Chip interactive selected={showLyrics} onClick={() => setShowLyrics(v => !v)}>Lyrics</Chip>
                )}
                {([['DEFAULT', 'Show'], ['FX', 'FX Stage'], ['SLIDES', 'Slides']] as [ShowMode, string][]).map(([m, label]) => (
                  <Chip key={m} interactive selected={mode === m} onClick={() => setMode(m)}>{label}</Chip>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {sheet && <ArtistSupportSheet album={album} track={focusTrack} user={user} initialTab={sheet} onClose={() => setSheet(null)} onSignUp={onSignUp} />}

      <style>{`
        @keyframes showPop { 0% { transform: scale(1.5); opacity: 0 } 25% { opacity: 1 } 100% { transform: scale(.85); opacity: .55 } }
        @keyframes showKen { from { transform: scale(1) } to { transform: scale(1.08) } }
        @keyframes showDrift { from { transform: scale(1) translate(0,0) } to { transform: scale(1.1) translate(-2%,1.5%) } }
        @keyframes showGlow { from { opacity: .7 } to { opacity: 1 } }
        @keyframes showLine { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .show-drift { animation: showDrift 38s ease-in-out infinite alternate }
        .show-glow { animation: showGlow 9s ease-in-out infinite alternate }
        @media (prefers-reduced-motion: reduce) { .show-drift, .show-glow { animation: none } }
      `}</style>
    </div>
  );

  return createPortal(ui, document.body);
};

export default ShowModeView;
