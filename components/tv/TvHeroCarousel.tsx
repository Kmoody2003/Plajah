import React, { useEffect, useState } from 'react';
import { heroImage } from '../../src/lib/imageThumb';

/**
 * The auto-rotating hero banner every 10-foot home screen leads with — the thing the Taleo rebuild
 * dropped and Chora/Reello never had. Display-only (not a D-pad target): a big backdrop that cycles
 * through a handful of featured items with a title overlay and progress dots, so the screen has a
 * centrepiece while the navigable rails live below it. Each surface passes its own featured set and
 * accent, so the three read as siblings, not clones.
 */

export interface TvHeroItem { id: string; title: string; subtitle?: string; image?: string }

const TvHeroCarousel: React.FC<{ items: TvHeroItem[]; accent?: string; eyebrow?: string }> = ({ items, accent = '#FF8C00', eyebrow }) => {
  const list = items.filter(i => i.image).slice(0, 8);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setI(p => (p + 1) % list.length), 7000);
    return () => clearInterval(t);
  }, [list.length]);

  useEffect(() => { if (i >= list.length) setI(0); }, [list.length, i]);

  if (!list.length) return null;
  const it = list[Math.min(i, list.length - 1)];

  return (
    <div className="relative h-[40vh] min-h-[240px] w-full overflow-hidden rounded-3xl bg-black">
      {/* Crossfade backdrops (opacity only — cheap on the TV GPU). */}
      {list.map((x, k) => (
        <img
          key={x.id}
          src={heroImage(x.image) || undefined}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{ opacity: k === i ? 1 : 0 }}
          decoding="async"
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent pointer-events-none" />

      <div className="absolute bottom-0 left-0 p-10 max-w-[62%]">
        {eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>{eyebrow}</p>}
        <p className="text-4xl lg:text-5xl font-black leading-tight tracking-tight text-white drop-shadow-lg line-clamp-2">{it.title}</p>
        {it.subtitle && <p className="text-lg text-white/60 mt-2 truncate">{it.subtitle}</p>}
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
