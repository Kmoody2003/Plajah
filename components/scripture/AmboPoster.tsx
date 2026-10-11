// AmboPoster — the picture inside a square library card. Always shows something real when it can:
//   cover/image URL  -> <img object-fit:cover> (centre focus)
//   video URL        -> the video's own first decoded frame (muted, paused, #t=seek) - a poster frame
//   nothing / failed -> a rendered still (gradient + large initials + label), never an empty box.
import React, { useEffect, useRef, useState } from 'react';
import { thumbFor } from '../../services/ambo/localThumbs';

/** Visible-on-screen flag (with margin) so off-screen cards never decode video/images. */
export function useNearScreen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) setOn(true); }, { rootMargin: '240px' });
    io.observe(el);
    // Backstop for when the observer never reports (window hidden or throttled at mount):
    // re-check the card's position a few times instead of once, so a tile never stays blank.
    let tries = 0;
    const t = setInterval(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (r.width > 0 && r.bottom > -240 && r.top < vh + 240) { setOn(true); clearInterval(t); }
      else if (++tries > 20) clearInterval(t);
    }, 700);
    return () => { io.disconnect(); clearInterval(t); };
  }, []);
  return [ref, on];
}

export function initialsOf(label: string): string {
  const w = (label || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

const abs: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' };

export type PosterKind = 'video' | 'image' | 'audio' | 'other';

export const AmboPoster: React.FC<{
  label: string;
  cover?: string;
  videoSrc?: string;
  gradient?: string;
  kind?: PosterKind;
  /** Percent into the clip to freeze on. */
  seekPct?: number;
  /** A full-size image with no thumbnail (local file): shown as a small cached copy, not decoded full-size per tile. */
  imageSrc?: string;
}> = ({ label, cover, videoSrc, gradient, kind = 'other', seekPct = 10, imageSrc }) => {
  const [ref, near] = useNearScreen<HTMLDivElement>();
  // One small JPEG per file, made once and shared (services/ambo/localThumbs) — a grid of
  // hundreds of clips no longer starts hundreds of video decoders.
  const [madeThumb, setMadeThumb] = useState<string | null | undefined>(undefined);
  const makeFrom = !cover ? (imageSrc ? { src: imageSrc, kind: 'image' as const } : videoSrc ? { src: videoSrc, kind: 'video' as const } : null) : null;
  useEffect(() => {
    setMadeThumb(undefined);
    if (!near || !makeFrom) return;
    let live = true;
    thumbFor(makeFrom.src, makeFrom.kind).then(u => { if (live) setMadeThumb(u); });
    return () => { live = false; };
  }, [near, makeFrom?.src, makeFrom?.kind]);
  if (makeFrom && madeThumb) cover = madeThumb;
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => { setCoverFailed(false); setCoverLoaded(false); }, [cover]);
  const vref = useRef<HTMLVideoElement>(null);
  useEffect(() => { setVideoFailed(false); setVideoReady(false); }, [videoSrc]);
  // Events can fire before React attaches (cached media) - poll readyState as a backstop.
  useEffect(() => {
    if (!near || !videoSrc || videoReady || videoFailed) return;
    const id = setInterval(() => { const v = vref.current; if (v && v.readyState >= 2) setVideoReady(true); }, 400);
    return () => clearInterval(id);
  }, [near, videoSrc, videoReady, videoFailed]);

  const showCover = !!cover && !coverFailed;
  // A live <video> is now only the fallback, when a frame can't be grabbed (e.g. a cross-origin clip).
  const showVideo = (!showCover || coverFailed) && !!videoSrc && !videoFailed && near && (makeFrom?.kind !== 'video' || madeThumb === null);
  const real = (showCover && coverLoaded) || (showVideo && videoReady);
  const g = gradient || 'linear-gradient(135deg,#2a1647,#0d0a18)';

  return (
    <div ref={ref} data-poster={real ? 'real' : 'placeholder'} style={{ ...abs, background: g }}>
      {/* rendered still: always underneath so the card is never blank */}
      {!real && (
        <div style={{ ...abs, display: 'grid', placeItems: 'center', background: g }}>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '.04em', color: 'rgba(255,255,255,.55)', textShadow: '0 2px 12px rgba(0,0,0,.5)' }}>{initialsOf(label)}</span>
        </div>
      )}
      {showCover && (
        <img src={cover} alt="" draggable={false} decoding="async" style={abs} onLoad={() => setCoverLoaded(true)} onError={() => setCoverFailed(true)} />
      )}
      {showVideo && (
        <video
          ref={vref}
          key={videoSrc}
          src={`${videoSrc}${videoSrc!.includes('#') ? '' : `#t=${seekPct > 0 ? 0.5 : 0.1}`}`}
          muted playsInline preload="metadata" draggable={false}
          style={{ ...abs, opacity: videoReady ? 1 : 0 }}
          onLoadedMetadata={e => {
            const v = e.currentTarget;
            try { if (Number.isFinite(v.duration) && v.duration > 0) v.currentTime = Math.min(v.duration * (seekPct / 100), v.duration - 0.05); } catch { /* ignore */ }
          }}
          onLoadedData={() => setVideoReady(true)}
          onSeeked={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        />
      )}
    </div>
  );
};

export default AmboPoster;
