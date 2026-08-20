// SacredLibraryHub — the front door of the Sacred Library, now a learning experience
// for the world's faiths. It is a thin pre-screen: pick a faith and the hub swaps to
// that wing fullscreen (back returns here). The CHRISTIANITY wing renders the existing
// BibleExperience unchanged — so everything already in the Sacred Library is preserved
// and Lectio keeps working exactly as before. Other faiths render the data-driven
// FaithWing from data/sacredLibrary/faiths.ts.
//
// The load-bearing `BIBLE` AppView (scripture chips, OPEN_BIBLE deep-links) is untouched
// and still opens Lectio directly — the hub is only the *browse* entry point.

import React, { Suspense, lazy, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { FAITHS, FAITH_TEMPLATE, FAITH_WINGS, type FaithMeta } from '../data/sacredLibrary/faiths';
import { PLAJAH_BG, PLAJAH_HEADER, BRAND_TEXT, PJ_LILAC as LILAC } from '../data/sacredLibrary/theme';

const BibleExperience = lazy(() => import('./BibleExperience'));
const FaithWing = lazy(() => import('./faith/FaithWing'));
const SutraReader = lazy(() => import('./faith/SutraReader'));

interface SacredLibraryHubProps {
  onBack: () => void;
}

const Loader: React.FC = () => (
  <div className="fixed inset-0 grid place-items-center" style={{ background: PLAJAH_BG }}>
    <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
  </div>
);

const SacredLibraryHub: React.FC<SacredLibraryHubProps> = ({ onBack }) => {
  const [wing, setWing] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const backToHub = () => { setReaderOpen(false); setWing(null); };
  const closeReader = () => setReaderOpen(false);

  const wingData = wing ? FAITH_WINGS[wing] : null;

  // ── The wing's deep reader: Lectio (Christianity) or the Sutra Reader (Buddhism) ──
  // Christianity's reader is the existing BibleExperience, so all its content is preserved.
  if (wingData && readerOpen) {
    return (
      <Suspense fallback={<Loader />}>
        {wingData.reader === 'sutra'
          ? <SutraReader onBack={closeReader} />
          : <BibleExperience onBack={closeReader} />}
      </Suspense>
    );
  }
  // ── The faith wing (ten galleries) ──
  if (wingData) {
    return (
      <Suspense fallback={<Loader />}>
        <FaithWing faith={wingData} onBack={backToHub} onOpenReader={() => setReaderOpen(true)} />
      </Suspense>
    );
  }

  const openFaith = (f: FaithMeta) => {
    if (f.status === 'research' || !f.wing) return;
    setWing(f.id);
  };

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto" style={{ background: PLAJAH_BG }}>
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-xl"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: PLAJAH_HEADER }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={16} /> Exit
        </button>
        <div className="flex items-center gap-2.5 pl-3 ml-1 border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <span className="w-7 h-7 rounded-lg grid place-items-center text-[13px]" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}>📖</span>
          <span className="font-semibold tracking-tight" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>The Sacred Library</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        {/* experience poster */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
          className="relative mt-6 rounded-[30px] overflow-hidden border text-center"
          style={{
            borderColor: 'rgba(255,255,255,0.14)',
            background: 'radial-gradient(120% 150% at 50% -25%, rgba(107,0,153,0.5), transparent 55%), radial-gradient(90% 120% at 88% 120%, rgba(212,0,85,0.4), transparent 55%), radial-gradient(70% 90% at 12% 110%, rgba(255,140,0,0.18), transparent 60%), linear-gradient(160deg, #150c22, #0b0813 60%, #100a12)',
            boxShadow: '0 22px 52px rgba(0,0,0,0.6)',
          }}
        >
          <div className="px-6 sm:px-14 py-12 sm:py-16 flex flex-col items-center gap-4">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ color: LILAC }}>
              Plajah · Academia · a living museum
            </span>
            <h1
              className="font-bold leading-none tracking-tight"
              style={{
                fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 'clamp(34px,6.4vw,72px)',
                background: BRAND_TEXT,
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}
            >
              The Sacred Library
            </h1>
            <p className="text-white/75 max-w-[60ch]" style={{ fontSize: 'clamp(15px,1.9vw,19px)' }}>
              A learning experience for the <b className="text-white">world's faiths</b> — their scriptures, stories, and
              practices, each given its own wing to study, read, and explore.
            </p>
            <div className="flex flex-wrap gap-4 sm:gap-7 justify-center mt-2">
              {FAITHS.map((f) => (
                <div key={f.id} className="flex flex-col items-center gap-1.5">
                  <span
                    className="w-13 h-13 rounded-full grid place-items-center text-2xl border"
                    style={{
                      width: 52, height: 52,
                      borderColor: 'rgba(255,255,255,0.14)',
                      background: f.wing ? `linear-gradient(135deg, ${f.accent}dd, ${f.accent}55)` : 'rgba(255,250,240,0.035)',
                      color: f.wing ? '#0a0908' : 'rgba(255,255,255,0.6)',
                      boxShadow: f.wing ? `0 0 22px ${f.accent}55` : 'none',
                    }}
                  >
                    {f.symbol}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-white/40">{f.name}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* the blueprint */}
        <div className="flex items-end justify-between gap-4 mt-11 mb-4 px-1">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">The blueprint</div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>Every wing is built the same way</h2>
          </div>
          <p className="hidden sm:block text-[13px] text-white/50 max-w-[46ch] text-right">
            Ten galleries define a faith. Christianity sets the model; each tradition keeps the frame and bends it to fit.
          </p>
        </div>
        <div className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: 'rgba(255,255,255,0.09)', background: 'linear-gradient(180deg, rgba(208,188,255,0.06), transparent)' }}>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: LILAC }}>The 10 galleries of a faith wing</span>
          <div className="grid gap-3 mt-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {FAITH_TEMPLATE.map((t) => (
              <div key={t.no} className="flex gap-3 p-3.5 rounded-2xl border" style={{ borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.035)' }}>
                <span className="font-mono text-[11px] flex-none w-5" style={{ color: LILAC }}>{t.no}</span>
                <div>
                  <div className="text-[13px] font-semibold">{t.title}</div>
                  <div className="text-[11.5px] text-white/50 mt-0.5 leading-snug">{t.blurb}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-start mt-4 p-3.5 rounded-2xl border border-dashed text-[12.5px] text-white/70 leading-relaxed" style={{ borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.035)' }}>
            <span style={{ color: LILAC, fontSize: 16 }}>✦</span>
            <span>Everything currently in the Sacred Library lives in the <b style={{ color: LILAC }}>Christianity</b> wing — it's the reference build. New faiths reuse these ten galleries, then <b style={{ color: LILAC }}>deviate</b> wherever the tradition demands it.</span>
          </div>
        </div>

        {/* faith selector */}
        <div className="mt-11 mb-4 px-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Enter a wing</div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>Choose a tradition</h2>
        </div>
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {FAITHS.map((f) => {
            const active = !!f.wing && f.status !== 'research';
            return (
              <button
                key={f.id}
                onClick={() => openFaith(f)}
                disabled={!active}
                className="text-left rounded-3xl border overflow-hidden transition-transform disabled:cursor-default"
                style={{
                  borderColor: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)',
                  background: 'rgba(255,255,255,0.035)',
                  opacity: active ? 1 : 0.5,
                }}
              >
                <div className="h-1.5" style={{ background: f.accent }} />
                <div className="p-5">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl" style={{ color: f.accent }}>{f.symbol}</span>
                    <div>
                      <div className="text-[17px] font-bold" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>{f.name}</div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: f.status === 'research' ? 'rgba(255,255,255,0.35)' : f.accent }}>
                        {f.status === 'model' ? 'The model wing' : f.status === 'live' ? 'Modeled · deviates' : 'In research'}
                      </div>
                    </div>
                  </div>
                  <p className="text-[12.5px] text-white/70 leading-relaxed mt-3">{f.blurb}</p>
                  {active && (
                    <span className="inline-flex items-center gap-1.5 mt-3.5 text-[11.5px] font-bold" style={{ color: f.accent }}>
                      Enter the wing →
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-white/35 mt-11 leading-relaxed">
          The Sacred Library — a world-faiths learning experience within Plajah Academia.<br />
          Christianity is the reference build (Lectio lives in Gallery 01).
        </p>
      </div>
    </div>
  );
};

export default SacredLibraryHub;
