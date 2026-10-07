// LookedCover — the album art, optionally dressed in a Look.
//
// Drop-in replacement for the Art view's <img>. It renders the SAME <img> (same classes, so layout is
// untouched) and, when the user has Looks on, draws the active look over the image's ACTUAL drawn
// rectangle — measured from the element (so `object-contain` letterboxing, hover-scale and rounded art
// all line up) — rather than the whole stage. That is the difference from the FX Stage engine, which
// replaces the art area wholesale.
//
// What shows: council preview > the look stepped to here > this track's pin > a house cover look.
// Cover looks sample this very cover, so the art itself is what gets treated. While loading, or where
// WebGPU is unavailable, the overlay draws nothing — the plain art is always underneath and always right.
//
// The chip (Looks · ‹ name › · Council) lives inside the art's own positioned parent and wraps, so it can
// never run out of the visible area the way the FX selector row did.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { probeShaderGpu } from '../../../services/shaders/shaderGate';
import { getLookLibrary, pinnedLookId } from '../../../services/shaders/looksLibrary';
import { getLookOverride, onLookOverride, setLookOverride } from '../../../services/shaders/looksSession';
import { setLooksOverlay, useLooksOverlay } from '../../../services/shaders/looksOverlay';

const LooksStage = React.lazy(() => import('./LooksStage'));
const LooksCouncilPanel = React.lazy(() => import('./LooksCouncilPanel'));

type Rect = { l: number; t: number; w: number; h: number };

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string;
  /** Full-resolution URL the look samples as its texture (defaults to src). */
  textureSrc?: string;
  trackId?: string | null;
  /** Where the chip sits inside the art's positioned parent. */
  controls?: 'top-right' | 'bottom-right';
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
}

export default function LookedCover({ src, textureSrc, trackId, controls = 'top-right', analyser = null, isPlaying = false, className, ...imgProps }: Props) {
  const overlay = useLooksOverlay();
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [gpuOk, setGpuOk] = useState(false);
  const [override, setOverride] = useState(getLookOverride());
  const [councilOpen, setCouncilOpen] = useState(false);

  useEffect(() => { let dead = false; probeShaderGpu().then(g => { if (!dead) setGpuOk(g.reason === 'ok'); }); return () => { dead = true; }; }, []);
  useEffect(() => onLookOverride(() => setOverride(getLookOverride())), []);

  const library = useMemo(() => getLookLibrary(), [overlay.enabled, override]);
  const look = useMemo(() => {
    if (override) return override;
    const byId = (id?: string | null) => (id ? library.find(l => l.id === id) : undefined);
    return byId(overlay.lookId) ?? byId(pinnedLookId(trackId)) ?? library.find(l => l.needsCover) ?? library[0];
  }, [override, overlay.lookId, trackId, library]);

  // Measure the image's drawn rectangle in layout space (offset*, so framer/hover transforms don't skew it).
  const on = gpuOk && overlay.enabled;
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !on) return;
    const measure = () => {
      const w = img.offsetWidth, h = img.offsetHeight;
      if (!w || !h) return;
      let r: Rect = { l: img.offsetLeft, t: img.offsetTop, w, h };
      if (getComputedStyle(img).objectFit === 'contain' && img.naturalWidth && img.naturalHeight) {
        const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        const cw = img.naturalWidth * s, ch = img.naturalHeight * s;
        r = { l: r.l + (w - cw) / 2, t: r.t + (h - ch) / 2, w: cw, h: ch };
      }
      setRect(prev => prev && Math.abs(prev.l - r.l) < .5 && Math.abs(prev.t - r.t) < .5 && Math.abs(prev.w - r.w) < .5 && Math.abs(prev.h - r.h) < .5 ? prev : r);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(img); if (img.parentElement) ro.observe(img.parentElement);
    img.addEventListener('load', measure);
    return () => { ro.disconnect(); img.removeEventListener('load', measure); };
  }, [on, src]);

  const step = (d: 1 | -1) => {
    const i = Math.max(0, library.findIndex(l => l.id === look?.id));
    setLookOverride(null);
    setLooksOverlay({ lookId: library[(i + d + library.length) % library.length].id });
  };
  const toggle = () => { if (overlay.enabled) setLookOverride(null); setLooksOverlay(s => ({ enabled: !s.enabled })); };

  const pos = controls === 'top-right' ? 'top-3 right-3' : 'bottom-3 right-3';

  return (
    <>
      <img ref={imgRef} src={src} className={className} {...imgProps} />
      {on && rect && look && (
        <div
          className="absolute overflow-hidden pointer-events-none transition-transform duration-700 group-hover:scale-105"
          style={{ position: 'absolute', left: rect.l, top: rect.t, width: rect.w, height: rect.h,
            // Cover looks re-render the art itself, so they replace it. Generator looks don't sample it — blend them OVER the art
            // (screen) so the cover stays recognisable instead of being hidden.
            mixBlendMode: look.needsCover ? undefined : 'screen',
            borderRadius: imgRef.current ? getComputedStyle(imgRef.current).borderRadius : undefined }}
          data-looks-overlay={look.id}
        >
          <React.Suspense fallback={null}>
            <LooksStage presetIndex={0} look={look} quiet analyser={analyser} isPlaying={isPlaying}
              coverUrl={textureSrc || src} trackId={trackId} />
          </React.Suspense>
        </div>
      )}
      {gpuOk && (
        <div className={`absolute ${pos} z-30 max-w-[calc(100%-1.5rem)] flex flex-wrap items-center justify-end gap-1.5`} onClick={e => e.stopPropagation()}>
          {overlay.enabled && look && (
            <>
              <div className="flex items-center rounded-full bg-black/60 backdrop-blur-xl border border-white/15 overflow-hidden max-w-full">
                <button type="button" onClick={() => step(-1)} aria-label="Previous look" className="px-2 py-1 text-white/70 hover:text-white text-[11px] cursor-pointer">‹</button>
                <span className="px-1 text-[9px] font-black uppercase tracking-wider text-white/80 truncate max-w-[9rem]" title={look.name}>{look.name}</span>
                <button type="button" onClick={() => step(1)} aria-label="Next look" className="px-2 py-1 text-white/70 hover:text-white text-[11px] cursor-pointer">›</button>
              </div>
              <button type="button" onClick={() => setCouncilOpen(true)}
                className="px-2.5 py-1 rounded-full bg-small-orange text-black text-[9px] font-black uppercase tracking-wider cursor-pointer shadow-sm">Council</button>
            </>
          )}
          <button type="button" onClick={toggle} aria-pressed={overlay.enabled} aria-label={overlay.enabled ? 'Turn Looks off' : 'Dress the cover in a Look'}
            className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border backdrop-blur-xl transition-all cursor-pointer ${overlay.enabled ? 'bg-white text-black border-white' : 'bg-black/60 text-white/70 border-white/15 hover:text-white'}`}>
            ✦ Looks
          </button>
        </div>
      )}
      {councilOpen && <React.Suspense fallback={null}><LooksCouncilPanel onClose={() => setCouncilOpen(false)} /></React.Suspense>}
    </>
  );
}
