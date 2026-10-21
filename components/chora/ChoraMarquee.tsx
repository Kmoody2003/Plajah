/**
 * ChoraMarquee — the landing hero (L1 "Marquee"). One release on the proscenium stage — light
 * shafts, the stage edge, a serif eyebrow, a display title and one orange Play — with the next
 * three billed beside it. Chora releases and Audius trending picks share the bill, each wearing
 * its source badge. Rotates every 20s; hovering the stage holds it.
 */
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Play } from 'lucide-react';

export interface MarqueeItem {
  id: string;
  title: string;
  artist: string;
  art: string;
  source: 'CHORA' | 'AUDIUS';
  eyebrow: string;
  meta: string;
  onPlay: () => void;
  onOpen: () => void;
}

const DISPLAY = "'Bricolage Grotesque', var(--font-display), system-ui, sans-serif";
const SERIF = 'Newsreader, Georgia, serif';
const SHAFTS: Record<number, number> = { 2: 0.1, 5: 0.18, 6: 0.18, 8: 0.1 };

export const SourceBadge: React.FC<{ source: 'CHORA' | 'AUDIUS'; className?: string }> = ({ source, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold normal-case ${className}`}
    style={source === 'AUDIUS' ? { background: '#7E1BCC', color: '#fff' } : { background: 'rgba(255,140,0,0.92)', color: '#06040A' }}
  >
    {source === 'AUDIUS' ? 'Audius' : 'Chora'}
  </span>
);

const ChoraMarquee: React.FC<{ items: MarqueeItem[] }> = ({ items }) => {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => { if (index >= items.length) setIndex(0); }, [items.length, index]);
  useEffect(() => {
    if (items.length < 2 || held) return;
    const id = window.setInterval(() => setIndex(i => (i + 1) % items.length), 20000);
    return () => window.clearInterval(id);
  }, [items.length, held]);

  if (!items.length) return null;
  const cur = items[Math.min(index, items.length - 1)];
  const next = [1, 2, 3].map(k => items[(index + k) % items.length]).filter((it, k, arr) => it && it.id !== cur.id && arr.findIndex(x => x.id === it.id) === k);
  const titleSize = cur.title.length > 26 ? 'clamp(2.4rem, 4.6vw, 4.25rem)' : 'clamp(2.8rem, 6vw, 5.25rem)';

  return (
    <section
      aria-label="Tonight on Chora"
      className="relative w-full overflow-hidden normal-case"
      style={{ height: 'clamp(440px, 58vh, 600px)', background: '#100A18' }}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={cur.id}
          src={cur.art}
          alt=""
          referrerPolicy="no-referrer"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1.02 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1 }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'brightness(0.62) saturate(1.05)' }}
        />
      </AnimatePresence>
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none grid" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={SHAFTS[i + 1] ? { background: `linear-gradient(180deg, rgba(255,184,107,${SHAFTS[i + 1]}), rgba(255,184,107,0) 78%)` } : undefined} />
        ))}
      </div>
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(6,4,10,0) 30%, rgba(6,4,10,0.72) 72%, #06040A 100%)' }} />
      <div aria-hidden="true" className="absolute pointer-events-none hidden sm:block" style={{ inset: '20px 20px 0 20px', border: '1px solid rgba(255,255,255,0.14)', borderBottom: 0, borderRadius: '26px 26px 0 0' }} />

      <div className="absolute flex flex-col lg:flex-row lg:items-end gap-6 lg:gap-10" style={{ left: 'clamp(16px, 3.4vw, 48px)', right: 'clamp(16px, 3.4vw, 48px)', bottom: 'clamp(24px, 4vh, 48px)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 19, color: '#FFB86B' }}>{cur.eyebrow}</span>
            <SourceBadge source={cur.source} />
          </div>
          <h1 className="mt-2.5 text-white uppercase" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: titleSize, lineHeight: 0.9, letterSpacing: '-0.02em', textWrap: 'balance' } as React.CSSProperties}>
            {cur.title}
          </h1>
          <p className="mt-3.5 text-[15px] text-white/80 truncate"><b className="text-white">{cur.artist}</b>{cur.meta ? ` · ${cur.meta}` : ''}</p>
          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={cur.onPlay} className="h-14 pl-6 pr-7 rounded-full flex items-center gap-2.5 bg-[#FF8C00] text-[#06040A] text-[15px] font-extrabold hover:brightness-110 active:scale-[0.98] transition" style={{ boxShadow: '0 0 0 6px rgba(255,140,0,0.16)' }}>
              <Play size={18} fill="currentColor" /> Play
            </button>
            <button type="button" onClick={cur.onOpen} className="h-14 px-6 rounded-full border border-white/30 text-white text-[15px] font-bold hover:bg-white/10 transition-colors">
              {cur.source === 'AUDIUS' ? 'Open track' : 'Open album'}
            </button>
          </div>
        </div>

        {next.length > 0 && (
          <div className="hidden md:block w-full lg:w-[400px] shrink-0">
            <p className="text-[13px] font-semibold text-white/65 mb-2.5">Also in the marquee</p>
            <div className="flex flex-col gap-2">
              {next.map(it => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setIndex(items.findIndex(x => x.id === it.id))}
                  className="h-16 px-3 rounded-2xl flex items-center gap-3 text-left border border-white/10 hover:border-white/25 transition-colors"
                  style={{ background: 'rgba(6,4,10,0.62)' }}
                >
                  <img src={it.art} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-11 h-11 rounded-[10px] object-cover shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white truncate">{it.title}</span>
                    <span className="block text-xs text-white/65 truncate">{it.artist}</span>
                  </span>
                  <SourceBadge source={it.source} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {items.length > 1 && (
        <div className="absolute top-8 right-12 hidden sm:flex gap-1.5" role="tablist" aria-label="Marquee">
          {items.map((it, i) => (
            <button key={it.id} type="button" role="tab" aria-selected={i === index} aria-label={`Show ${it.title}`} onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-8 bg-[#FF8C00]' : 'w-2 bg-white/40 hover:bg-white/70'}`} />
          ))}
        </div>
      )}
    </section>
  );
};

export default ChoraMarquee;
