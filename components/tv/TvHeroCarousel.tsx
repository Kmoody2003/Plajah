import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play } from 'lucide-react';
import { heroImage } from '../../src/lib/imageThumb';
import { hlsTuning, capLevelsToPanel } from '../../services/hlsTuning';

/**
 * The auto-rotating hero banner every 10-foot home screen leads with. It has two modes:
 *  • Display-only (no `focused`/`onSelect`): a big backdrop that cycles through featured items —
 *    what Chora/Reello pass.
 *  • Focusable (Taleo): the parent adds it as the top D-pad row, drives the active slide via
 *    `activeIndex`, and OK opens the item. When focused, auto-rotate pauses and, if the active item
 *    has a `videoUrl`, it plays silently on a loop (muted) like modern streaming home screens.
 */

export interface TvHeroItem { id: string; title: string; subtitle?: string; image?: string; videoUrl?: string }

const isHls = (u?: string) => !!u && u.toLowerCase().includes('.m3u8');

const TvHeroCarousel: React.FC<{
  items: TvHeroItem[];
  accent?: string;
  eyebrow?: string;
  /** Set by the parent grid when the hero row holds D-pad focus — pauses rotation + shows OK affordance. */
  focused?: boolean;
  /** Controlled active slide when focused (the grid's column). Ignored when not focused. */
  activeIndex?: number;
}> = ({ items, accent = '#FF8C00', eyebrow, focused = false, activeIndex }) => {
  const list = items.filter(i => i.image || i.videoUrl).slice(0, 8);
  const [auto, setAuto] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Which slide shows: the grid drives it while focused; otherwise it auto-rotates.
  const i = focused && typeof activeIndex === 'number'
    ? Math.max(0, Math.min(activeIndex, list.length - 1))
    : Math.min(auto, Math.max(0, list.length - 1));

  useEffect(() => {
    if (focused || list.length < 2) return;   // don't auto-advance while the user is on the row
    const t = setInterval(() => setAuto(p => (p + 1) % list.length), 7000);
    return () => clearInterval(t);
  }, [list.length, focused]);

  const it = list.length ? list[i] : null;

  // Silent autoplay preview for the active slide (muted + looped). HLS via hls.js with the shared
  // per-panel rendition cap so the TV never decodes more than its panel; plain urls play natively.
  useEffect(() => {
    const v = videoRef.current;
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; }
    if (!v || !it?.videoUrl) return;
    const url = it.videoUrl;
    if (isHls(url)) {
      if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(() => {}); }
      else if (Hls.isSupported()) {
        const h = new Hls(hlsTuning()); hlsRef.current = h;
        h.loadSource(url); h.attachMedia(v);
        h.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(h as any); v.play().catch(() => {}); });
      }
    } else { v.src = url; v.play().catch(() => {}); }
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; } };
  }, [it?.id, it?.videoUrl]);

  if (!list.length || !it) return null;

  return (
    <div
      className="relative h-[42vh] min-h-[260px] w-full overflow-hidden rounded-3xl bg-black shrink-0 transition-all"
      style={{ boxShadow: focused ? `0 0 0 3px ${accent}, 0 0 34px -6px ${accent}` : undefined }}
    >
      {/* Crossfade backdrops (opacity only — cheap on the TV GPU). */}
      {list.map((x, k) => (
        <img
          key={x.id}
          src={heroImage(x.image) || undefined}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{ opacity: k === i && !it.videoUrl ? 1 : 0 }}
          decoding="async"
        />
      ))}

      {/* Muted looping preview video over the art for the active slide (if any). */}
      {it.videoUrl && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent pointer-events-none" />

      <div className="absolute bottom-0 left-0 p-10 max-w-[62%]">
        {eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>{eyebrow}</p>}
        <p className="text-4xl lg:text-5xl font-black leading-tight tracking-tight text-white drop-shadow-lg line-clamp-2">{it.title}</p>
        {it.subtitle && <p className="text-lg text-white/60 mt-2 truncate">{it.subtitle}</p>}
        {/* OK-to-play affordance — only while the hero row holds focus. */}
        {focused && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: accent, color: '#000' }}>
            <Play size={16} fill="currentColor" className="ml-0.5" />
            <span className="text-[12px] font-black uppercase tracking-widest">Press OK to Play</span>
          </div>
        )}
      </div>

      <div className="absolute bottom-7 right-9 flex items-center gap-2">
        {list.map((_, k) => (
          <span key={k} className="h-1.5 rounded-full transition-all duration-300" style={{ width: k === i ? 24 : 6, background: k === i ? accent : 'rgba(255,255,255,0.3)' }} />
        ))}
      </div>
    </div>
  );
};

export default TvHeroCarousel;
