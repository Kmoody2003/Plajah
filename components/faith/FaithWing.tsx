// FaithWing — renders a data-driven Sacred Library wing (any faith except Christianity,
// whose wing is the existing BibleExperience). Fullscreen overlay in the Sacred Library
// idiom: dark ground, the faith's own accent, a poster, a "where this bends the model"
// panel, and the ten-gallery grid. New faiths need only data in data/sacredLibrary/faiths.ts.

import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import type { FaithWingData } from '../../data/sacredLibrary/faiths';

interface FaithWingProps {
  faith: FaithWingData;
  onBack: () => void;
}

const FaithWing: React.FC<FaithWingProps> = ({ faith, onBack }) => {
  const acc = faith.accent;
  const acc2 = faith.accent2;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto" style={{ background: '#08070c' }}>
      {/* header */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-xl"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(8,7,12,0.72)' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={16} /> Sacred Library
        </button>
        <div className="flex items-center gap-2.5 pl-3 ml-1 border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <span className="text-xl" style={{ color: acc }}>{faith.symbol}</span>
          <span className="font-semibold tracking-tight" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>{faith.name}</span>
        </div>
        <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-white/35">Modeled · free to deviate</span>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        {/* poster */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
          className="relative mt-6 rounded-[28px] overflow-hidden border grid md:grid-cols-[1.1fr_.9fr]"
          style={{
            borderColor: 'rgba(255,255,255,0.14)',
            background: `linear-gradient(140deg, ${acc2}22, #0c0906 60%, ${acc2}18)`,
            boxShadow: '0 22px 52px rgba(0,0,0,0.6)',
          }}
        >
          <div className="relative z-10 p-7 sm:p-11 flex flex-col justify-center gap-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: acc }}>
              Modeled on Christianity · free to deviate
            </span>
            <h1
              className="text-4xl sm:text-6xl font-bold leading-none tracking-tight"
              style={{
                fontFamily: 'var(--font-serif, Georgia, serif)',
                background: `linear-gradient(180deg, #ffe9c9, ${acc} 60%, ${acc2})`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}
            >
              {faith.name}
            </h1>
            <p className="italic text-white/80 max-w-[34ch]" style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 'clamp(15px,2vw,20px)' }}>
              {faith.tagline}
            </p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {faith.facts.map((f) => (
                <span key={f.label} className="text-[11.5px] rounded-full px-3 py-1.5 border" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.8)' }}>
                  <b className="text-white">{f.label}</b> · {f.value}
                </span>
              ))}
            </div>
          </div>
          {/* symbolic poster art */}
          <div
            className="relative min-h-[180px] grid place-items-center"
            style={{ background: `radial-gradient(80% 80% at 55% 45%, ${acc}55, transparent 60%), radial-gradient(60% 60% at 50% 70%, ${acc2}55, transparent 60%), #160c07` }}
          >
            <div className="text-[150px] leading-none select-none opacity-90" style={{ color: acc, textShadow: `0 0 60px ${acc}66`, fontFamily: 'Georgia, serif' }}>
              {faith.symbol}
            </div>
          </div>
        </motion.section>

        {/* deviation panel */}
        {faith.deviations.length > 0 && (
          <section className="mt-5 rounded-3xl border p-5 sm:p-6" style={{ borderColor: 'rgba(255,255,255,0.1)', background: `linear-gradient(180deg, ${acc}10, transparent)` }}>
            <h2 className="text-[13px] font-extrabold uppercase tracking-wide mb-3" style={{ color: acc }}>
              Where this wing bends the model
            </h2>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {faith.deviations.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center py-2 text-[12.5px]">
                  <span className="text-white/40">{d.from}</span>
                  <span style={{ color: acc }}>→</span>
                  <span className="text-white">{d.to}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* gallery grid */}
        <section className="grid gap-3.5 mt-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {faith.galleries.map((g, i) => {
            const feature = i === 0;
            return (
              <motion.div
                key={g.no}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.2) }}
                className="rounded-3xl border overflow-hidden"
                style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.035)', gridColumn: feature ? 'span 2' : undefined }}
              >
                <div className="h-1.5" style={{ background: acc }} />
                <div className={feature ? 'p-4 flex gap-4 items-center' : 'p-4'}>
                  {feature && (
                    <div className="flex-none w-[110px] h-[110px] rounded-2xl grid place-items-center text-4xl border" style={{ background: `${acc}22`, borderColor: 'rgba(255,255,255,0.14)' }}>
                      {g.icon}
                    </div>
                  )}
                  <div>
                    {!feature && <span className="block text-[22px] mb-2">{g.icon}</span>}
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: acc }}>
                      {g.no} · {g.kicker}{g.deviates && <span className="ml-1 opacity-90">·deviates</span>}
                    </div>
                    <h3 className="text-[17px] font-bold mb-1" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>{g.title}</h3>
                    <p className="text-[12.5px] text-white/75 leading-relaxed">{g.blurb}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {g.items.map((it) => (
                        <span key={it} className="text-[10.5px] rounded-md px-2 py-0.5 border text-white/60" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)' }}>{it}</span>
                      ))}
                    </div>
                    {g.cta && (
                      <span className="inline-flex items-center gap-1.5 mt-3 text-[11.5px] font-bold" style={{ color: acc }}>
                        {g.cta} →
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </section>

        <p className="text-center text-xs text-white/35 mt-11 leading-relaxed">
          {faith.name} reuses the Sacred Library's ten-gallery frame and deviates where the tradition differs.<br />
          Content is illustrative &amp; for study.
        </p>
      </div>
    </div>
  );
};

export default FaithWing;
